import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IndexingEngine } from "../engine/indexer.js";
import type { MemoStore } from "../db/store.js";
import { IndexQueueUnavailableError } from "../daemon/daemon.js";
import type { IndexRequestService } from "../daemon/types.js";
import type {
  AdminIndexResponseDto,
  FeedResponseDto,
  HealthResponseDto,
  IndexRequestResponseDto,
  ReadinessResponseDto,
  TxResponseDto
} from "./dto.js";
import {
  daemonUnavailableError,
  HttpApiError,
  httpStatusForVerificationStatus,
  notFoundError,
  queueSaturatedError,
  rateLimitedError,
  unauthorizedError
} from "./errors.js";
import { mapStoredVerification, mapTransactionSummary, mapVerificationResult, mapVerifiedFeedItem } from "./mapper.js";
import {
  adminIndexSchema,
  feedSchema,
  getTxSchema,
  healthSchema,
  indexRequestSchema,
  readinessSchema
} from "./schemas.js";

const DEFAULT_PUBLIC_INDEX_RATE_LIMIT_MAX = 30;
const DEFAULT_PUBLIC_INDEX_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_PUBLIC_INDEX_RATE_LIMIT_BUCKETS = 10_000;

export interface RegisterApiRoutesOptions {
  readonly store: MemoStore;
  readonly indexingEngine?: IndexingEngine;
  readonly indexApiToken?: string;
  readonly indexRequestService?: IndexRequestService;
  readonly publicIndexRateLimitMax?: number;
  readonly publicIndexRateLimitWindowMs?: number;
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

interface IndexRequestBody {
  readonly txid: string;
}

export async function registerApiRoutes(fastify: FastifyInstance, options: RegisterApiRoutesOptions): Promise<void> {
  fastify.get("/api/v1/health", { schema: healthSchema }, async (): Promise<HealthResponseDto> => ({
    status: "ok",
    service: "tonalli-memo-indexer",
    daemon: options.indexRequestService?.getStatus() ?? null
  }));

  fastify.get("/api/v1/ready", { schema: readinessSchema }, async (_request, reply): Promise<ReadinessResponseDto> => {
    const daemon = options.indexRequestService?.getStatus() ?? null;
    const ready = daemon?.ready === true;
    void reply.code(ready ? 200 : 503);
    return {
      status: ready ? "ready" : "not_ready",
      service: "tonalli-memo-indexer",
      daemon
    };
  });

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

  const indexRequestService = options.indexRequestService;
  if (indexRequestService !== undefined) {
    const rateLimiter = createRateLimitPreHandler(
      options.publicIndexRateLimitMax ?? DEFAULT_PUBLIC_INDEX_RATE_LIMIT_MAX,
      options.publicIndexRateLimitWindowMs ?? DEFAULT_PUBLIC_INDEX_RATE_LIMIT_WINDOW_MS
    );
    fastify.post<{ Body: IndexRequestBody }>(
      "/api/v1/index-requests",
      { schema: indexRequestSchema, preHandler: rateLimiter },
      async (request, reply): Promise<IndexRequestResponseDto> => {
        const result = indexRequestService.requestIndex(request.body.txid);
        if (result.status === "saturated") {
          throw queueSaturatedError();
        }
        if (result.status === "stopped") {
          throw daemonUnavailableError();
        }
        void reply.code(202);
        return { status: result.status, txid: request.body.txid };
      }
    );
  }

  const indexingEngine = options.indexingEngine;
  if (indexingEngine === undefined || options.indexApiToken === undefined || options.indexApiToken.length === 0) {
    return;
  }

  fastify.post<{ Body: AdminIndexBody }>(
    "/api/v1/admin/index",
    { schema: adminIndexSchema, preHandler: createAuthorizationPreHandler(options.indexApiToken) },
    async (request, reply): Promise<AdminIndexResponseDto> => {
      let outcome;
      try {
        outcome = indexRequestService === undefined
          ? await indexingEngine.indexTransaction(request.body.txid, buildIndexOptions(request.body))
          : await indexRequestService.indexAndWait(request.body.txid, buildIndexOptions(request.body));
      } catch (error) {
        if (error instanceof IndexQueueUnavailableError) {
          throw error.reason === "saturated" ? queueSaturatedError() : daemonUnavailableError();
        }
        throw error;
      }
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

function createRateLimitPreHandler(maxRequests: number, windowMs: number) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new Error("Public index rate limit must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Public index rate limit window must be a positive safe integer.");
  }
  const buckets = new Map<string, { readonly startedAt: number; count: number }>();
  return async (request: FastifyRequest): Promise<void> => {
    const now = Date.now();
    const key = request.ip;
    const current = buckets.get(key);
    if (current === undefined || now - current.startedAt >= windowMs) {
      if (current === undefined && buckets.size >= MAX_PUBLIC_INDEX_RATE_LIMIT_BUCKETS) {
        for (const [bucketKey, bucket] of buckets) {
          if (now - bucket.startedAt >= windowMs) {
            buckets.delete(bucketKey);
          }
        }
        if (buckets.size >= MAX_PUBLIC_INDEX_RATE_LIMIT_BUCKETS) {
          throw rateLimitedError();
        }
      }
      buckets.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= maxRequests) {
      throw rateLimitedError();
    }
    current.count += 1;
  };
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
