import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { IndexingEngine } from "../engine/indexer.js";
import type { MemoStore } from "../db/store.js";
import { registerApiRoutes, toSafeErrorResponse } from "./routes.js";

export interface CreateIndexerApiOptions {
  readonly store: MemoStore;
  readonly indexingEngine?: IndexingEngine;
  readonly indexApiToken?: string;
  readonly corsOrigins?: readonly string[];
  readonly logger?: FastifyServerOptions["logger"];
}

export async function createIndexerApi(options: CreateIndexerApiOptions): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? false,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: true
      }
    }
  });

  if (options.corsOrigins !== undefined && options.corsOrigins.length > 0) {
    const origins = new Set(options.corsOrigins);
    await fastify.register(cors, {
      origin(origin, callback) {
        callback(null, origin !== undefined && origins.has(origin));
      }
    });
  }

  fastify.setErrorHandler((error, _request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error) {
      void reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid request."
        }
      });
      return;
    }

    const safe = toSafeErrorResponse(error);
    void reply.status(safe.statusCode).send(safe.body);
  });

  fastify.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found."
      }
    });
  });

  await fastify.register(registerApiRoutes, {
    store: options.store,
    ...(options.indexingEngine === undefined ? {} : { indexingEngine: options.indexingEngine }),
    ...(options.indexApiToken === undefined ? {} : { indexApiToken: options.indexApiToken })
  });

  return fastify;
}
