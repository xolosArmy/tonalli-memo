import { createChronikLiveSource, createChronikTransactionAdapter } from "@tonalli-memo/chronik";
import { createMemoVerificationService } from "@tonalli-memo/verification";
import type { FastifyInstance } from "fastify";
import { createIndexerApi } from "../api/server.js";
import { IndexerDaemon } from "../daemon/daemon.js";
import type { IndexerDaemonLogger } from "../daemon/types.js";
import type { IndexerDatabase } from "../db/types.js";
import { MemoStore } from "../db/store.js";
import { openIndexerDatabase } from "../db/database.js";
import { IndexingEngine } from "../engine/indexer.js";
import { parseIndexerCliConfig, type IndexerCliConfig } from "./config.js";

export interface RunIndexerCliOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly onListening?: (address: string) => void;
  readonly factories?: Partial<IndexerCliFactories>;
}

export interface IndexerCliFactories {
  readonly openDatabase: typeof openIndexerDatabase;
  readonly createApi: typeof createIndexerApi;
  readonly createDaemon: (options: ConstructorParameters<typeof IndexerDaemon>[0]) => Pick<IndexerDaemon, "start" | "stop">;
}

const defaultFactories: IndexerCliFactories = {
  openDatabase: openIndexerDatabase,
  createApi: createIndexerApi,
  createDaemon(options) {
    return new IndexerDaemon(options);
  }
};

const cliDaemonLogger: IndexerDaemonLogger = {
  info(message, context) {
    console.info(message, context ?? {});
  },
  warn(message, context) {
    console.warn(message, context ?? {});
  },
  error(message, context) {
    console.error(message, context ?? {});
  }
};

export async function runIndexerCli(options: RunIndexerCliOptions = {}): Promise<void> {
  const config = parseIndexerCliConfig(options.env ?? process.env);
  const factories = { ...defaultFactories, ...options.factories };
  const database = factories.openDatabase({ filename: config.dbPath });
  const store = new MemoStore(database);
  const indexingEngine = createIndexingEngine(config, store);
  let daemon: Pick<IndexerDaemon, "start" | "stop"> | undefined;
  const app = await factories.createApi({
    store,
    ...(indexingEngine === undefined ? {} : { indexingEngine }),
    ...(config.indexApiToken === undefined ? {} : { indexApiToken: config.indexApiToken }),
    corsOrigins: config.corsOrigins,
    logger: true
  });

  if (config.daemonEnabled) {
    if (indexingEngine === undefined) {
      throw new Error("Indexer daemon requires an indexing engine.");
    }
    daemon = factories.createDaemon({
      engine: indexingEngine,
      store,
      liveSource: createChronikLiveSource({ urls: config.chronikUrls, logger: cliDaemonLogger }),
      logger: cliDaemonLogger
    });
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await closeIndexerResources({ ...(daemon === undefined ? {} : { daemon }), app, database });
  };

  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0), () => process.exit(1));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0), () => process.exit(1));
  });

  try {
    await daemon?.start();
    const address = await app.listen({ host: config.host, port: config.port });
    options.onListening?.(address);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

function createIndexingEngine(config: IndexerCliConfig, store: MemoStore): IndexingEngine | undefined {
  if (config.indexApiToken === undefined && !config.daemonEnabled) {
    return undefined;
  }
  const chronik = createChronikTransactionAdapter({ urls: config.chronikUrls });
  const verificationService = createMemoVerificationService({ chronik });
  return new IndexingEngine({ verificationService, store });
}

export async function closeIndexerResources(resources: {
  readonly daemon?: Pick<IndexerDaemon, "stop">;
  readonly app: Pick<FastifyInstance, "close">;
  readonly database: Pick<IndexerDatabase, "close">;
}): Promise<void> {
  const errors: unknown[] = [];
  if (resources.daemon !== undefined) {
    try {
      await resources.daemon.stop();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await resources.app.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    resources.database.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Indexer resource shutdown failed.");
  }
}
