export { openIndexerDatabase } from "./db/database.js";
export { CURRENT_SCHEMA_VERSION, MIGRATIONS, UnsupportedSchemaVersionError } from "./db/migrations.js";
export { toStoredNormalizedTransaction, serializeStoredTransaction } from "./db/serialization.js";
export { MemoStore } from "./db/store.js";
export { mapVerificationResult } from "./engine/mapper.js";
export { IndexingEngine } from "./engine/indexer.js";
export { IndexerDaemon } from "./daemon/daemon.js";
export { BoundedWorkQueue } from "./daemon/queue.js";
export { createIndexerApi } from "./api/server.js";
export { registerApiRoutes } from "./api/routes.js";
export { parseIndexerCliConfig, ConfigError } from "./cli/config.js";
export { systemClock, validateUnixSeconds } from "./engine/types.js";
export type {
  ChainStatus,
  DurableVerificationStatus,
  IndexerDatabase,
  OpenIndexerDatabaseOptions,
  StoredIndexingAttempt,
  StoredInput,
  StoredNormalizedTransactionV1,
  StoredOpReturnOutput,
  StoredTransactionRow,
  StoredVerificationRecord,
  VerifiedFeedRow,
  TransactionInactiveReason
} from "./db/types.js";
export type { MarkTransactionInactiveOutput, PersistIndexingResultInput, PersistIndexingResultOutput } from "./db/store.js";
export type { IndexerDaemonLogger, IndexerDaemonOptions, IndexerDaemonState, IndexerDaemonStatus } from "./daemon/types.js";
export type {
  AuthorizationDecisionDto,
  CandidateLocationDto,
  MappedIndexingResult,
  MappedVerificationRecord
} from "./engine/mapper.js";
export type { IndexerClock, IndexingEngineOptions, IndexingOutcome, IndexTransactionOptions } from "./engine/types.js";
export type { CreateIndexerApiOptions } from "./api/server.js";
