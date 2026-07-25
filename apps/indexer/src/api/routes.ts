import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IndexingEngine } from "../engine/indexer.js";
import type { MemoStore } from "../db/store.js";
import type { AdminIndexResponseDto, FeedResponseDto, HealthResponseDto, TxResponseDto } from "./dto.js";
import { HttpApiError, httpStatusForVerificationStatus, notFoundError, unauthorizedError } from "./errors.js";
import { mapStoredVerification, mapTransactionSummary, mapVerificationResult, mapVerifiedFeedItem } from "./mapper.js";
import { adminIndexSchema, feedSchema, getTxSchema, healthSchema } from "./schemas.js";

export interface RegisterApiRoutesOptions {
  readonly store: MemoStore;
  readonly indexingEngine?: IndexingEngine;
  readonly indexApiToken?: string;
}

interface TxParams {
  readonly txid: string;
}

interface FeedQuery {
  readonly limit?: number | string;
}

interface AdminIndexBody {
  readonly txid: string;
  readonly tipHeight?: number;
}

export async function registerApiRoutes(fastify: FastifyInstance, options: RegisterApiRoutesOptions): Promise<void> {
  fastify.get("/api/v1/health", { schema: healthSchema }, async (): Promise<HealthResponseDto> => ({
    status: "ok",
    service: "tonalli-memo-indexer"
  }));

  fastify.get<{ Params: TxParams }>("/api/v1/tx/:txid", { schema: getTxSchema }, async (request): Promise<TxResponseDto> => {
    const transaction = options.store.getTransaction(request.params.txid);
    if (transaction === null) {
      throw notFoundError();
    }

    const verification = options.store.getVerificationRecord(request.params.txid);
    return {
      transaction: mapTransactionSummary(transaction),
      verification: verification === null ? null : mapStoredVerification(verification)
    };
  });

  fastify.get<{ Querystring: FeedQuery }>("/api/v1/feed", { schema: feedSchema }, async (request): Promise<FeedResponseDto> => {
    const limit = normalizeFeedLimit(request.query.limit);
    return {
      items: options.store.listVerifiedFeed(limit).map(mapVerifiedFeedItem),
      limit
    };
  });

  const indexingEngine = options.indexingEngine;
  if (indexingEngine === undefined || options.indexApiToken === undefined || options.indexApiToken.length === 0) {
    return;
  }

  fastify.post<{ Body: AdminIndexBody }>(
    "/api/v1/admin/index",
    { schema: adminIndexSchema, preHandler: createAuthorizationPreHandler(options.indexApiToken) },
    async (request, reply): Promise<AdminIndexResponseDto> => {
      const outcome = await indexingEngine.indexTransaction(request.body.txid, buildIndexOptions(request.body));
      const statusCode = httpStatusForVerificationStatus(outcome.verificationResult.status);
      void reply.code(statusCode);
      return {
        attemptId: outcome.attemptId,
        persistedRecord: outcome.persistedRecord,
        verification: mapVerificationResult(outcome.verificationResult)
      };
    }
  );
}

function normalizeFeedLimit(limit: number | string | undefined): number {
  if (limit === undefined) {
    return 25;
  }
  if (typeof limit === "number") {
    return limit;
  }
  return Number(limit);
}

function buildIndexOptions(body: AdminIndexBody): { readonly tipHeight?: number } {
  return body.tipHeight === undefined ? {} : { tipHeight: body.tipHeight };
}

function createAuthorizationPreHandler(expectedToken: string) {
  return async (request: FastifyRequest): Promise<void> => {
    const authorization = request.headers.authorization;
    const token = parseBearerToken(authorization);
    if (token === null || !timingSafeTokenEqual(token, expectedToken)) {
      throw unauthorizedError();
    }
  };
}

function parseBearerToken(header: string | undefined): string | null {
  const prefix = "Bearer ";
  if (header === undefined || !header.startsWith(prefix)) {
    return null;
  }
  const token = header.slice(prefix.length);
  return token.length === 0 ? null : token;
}

function timingSafeTokenEqual(actual: string, expected: string): boolean {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function toSafeErrorResponse(error: unknown): { readonly statusCode: number; readonly body: { readonly error: { readonly code: string; readonly message: string } } } {
  if (error instanceof HttpApiError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error."
      }
    }
  };
}
