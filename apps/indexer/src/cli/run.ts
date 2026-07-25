import { createChronikTransactionAdapter } from "@tonalli-memo/chronik";
import { createMemoVerificationService } from "@tonalli-memo/verification";
import type { FastifyInstance } from "fastify";
import { createIndexerApi } from "../api/server.js";
import { MemoStore } from "../db/store.js";
import { openIndexerDatabase } from "../db/database.js";
import { IndexingEngine } from "../engine/indexer.js";
import { parseIndexerCliConfig, type IndexerCliConfig } from "./config.js";

export interface RunIndexerCliOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly onListening?: (address: string) => void;
}

export async function runIndexerCli(options: RunIndexerCliOptions = {}): Promise<void> {
  const config = parseIndexerCliConfig(options.env ?? process.env);
  const database = openIndexerDatabase({ filename: config.dbPath });
  const store = new MemoStore(database);
  const indexingEngine = createIndexingEngine(config, store);
  const app = await createIndexerApi({
    store,
    ...(indexingEngine === undefined ? {} : { indexingEngine }),
    ...(config.indexApiToken === undefined ? {} : { indexApiToken: config.indexApiToken }),
    corsOrigins: config.corsOrigins,
    logger: true
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await closeIndexerResources(app, database);
  };

  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0), () => process.exit(1));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0), () => process.exit(1));
  });

  try {
    const address = await app.listen({ host: config.host, port: config.port });
    options.onListening?.(address);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

function createIndexingEngine(config: IndexerCliConfig, store: MemoStore): IndexingEngine | undefined {
  if (config.indexApiToken === undefined) {
    return undefined;
  }
  const chronik = createChronikTransactionAdapter({ urls: config.chronikUrls });
  const verificationService = createMemoVerificationService({ chronik });
  return new IndexingEngine({ verificationService, store });
}


export async function closeIndexerResources(app: Pick<FastifyInstance, "close">, database: { close(): void }): Promise<void> {
  await app.close();
  database.close();
}
