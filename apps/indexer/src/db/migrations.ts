export const CURRENT_SCHEMA_VERSION = 3;

export interface Migration {
  readonly version: number;
  readonly sql: string;
}

export class UnsupportedSchemaVersionError extends Error {
  readonly databaseVersion: number;
  readonly supportedVersion: number;

  constructor(databaseVersion: number, supportedVersion: number) {
    super(`Indexer database schema version ${databaseVersion} is newer than supported version ${supportedVersion}.`);
    this.name = "UnsupportedSchemaVersionError";
    this.databaseVersion = databaseVersion;
    this.supportedVersion = supportedVersion;
  }
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE transactions (
        txid TEXT PRIMARY KEY,
        chain_status TEXT NOT NULL CHECK (chain_status IN ('confirmed', 'unconfirmed')),
        is_coinbase INTEGER NOT NULL CHECK (is_coinbase IN (0, 1)),
        is_final INTEGER NOT NULL CHECK (is_final IN (0, 1)),
        block_height INTEGER CHECK (block_height IS NULL OR block_height >= 0),
        block_hash TEXT,
        block_timestamp INTEGER CHECK (block_timestamp IS NULL OR block_timestamp >= 0),
        first_seen_at INTEGER CHECK (first_seen_at IS NULL OR first_seen_at >= 0),
        normalized_json TEXT NOT NULL CHECK (json_valid(normalized_json)),
        first_indexed_at INTEGER NOT NULL CHECK (first_indexed_at >= 0),
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
        CHECK (
          (chain_status = 'confirmed' AND block_height IS NOT NULL AND block_hash IS NOT NULL AND block_timestamp IS NOT NULL)
          OR
          (chain_status = 'unconfirmed' AND block_height IS NULL AND block_hash IS NULL AND block_timestamp IS NULL)
        )
      );

      CREATE TABLE verification_records (
        txid TEXT PRIMARY KEY REFERENCES transactions(txid) ON DELETE CASCADE,
        verification_status TEXT NOT NULL CHECK (
          verification_status IN ('VERIFIED', 'UNAUTHORIZED', 'NO_MEMO', 'INVALID_MEMO', 'MULTIPLE_MEMOS')
        ),
        protocol_version INTEGER,
        event_type TEXT,
        profile_code TEXT,
        payload TEXT,
        byte_length INTEGER CHECK (byte_length IS NULL OR byte_length >= 0),
        candidate_output_index INTEGER CHECK (candidate_output_index IS NULL OR candidate_output_index >= 0),
        candidate_push_index INTEGER CHECK (candidate_push_index IS NULL OR candidate_push_index >= 0),
        authorizing_address TEXT,
        authorizing_input_index INTEGER CHECK (authorizing_input_index IS NULL OR authorizing_input_index >= 0),
        evaluation_height INTEGER CHECK (evaluation_height IS NULL OR evaluation_height >= 0),
        authorization_context_json TEXT CHECK (authorization_context_json IS NULL OR json_valid(authorization_context_json)),
        authorization_decisions_json TEXT NOT NULL CHECK (json_valid(authorization_decisions_json)),
        diagnostics_json TEXT NOT NULL CHECK (json_valid(diagnostics_json)),
        first_indexed_at INTEGER NOT NULL CHECK (first_indexed_at >= 0),
        last_verified_at INTEGER NOT NULL CHECK (last_verified_at >= 0)
      );

      CREATE TABLE indexing_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_txid TEXT NOT NULL,
        result_status TEXT NOT NULL,
        transaction_txid TEXT REFERENCES transactions(txid),
        tip_height INTEGER CHECK (tip_height IS NULL OR tip_height >= 0),
        persisted_record INTEGER NOT NULL CHECK (persisted_record IN (0, 1)),
        diagnostics_json TEXT NOT NULL CHECK (json_valid(diagnostics_json)),
        attempted_at INTEGER NOT NULL CHECK (attempted_at >= 0)
      );

      CREATE INDEX idx_verification_records_status ON verification_records(verification_status);
      CREATE INDEX idx_verification_records_profile_code ON verification_records(profile_code);
      CREATE INDEX idx_transactions_block_height ON transactions(block_height);
      CREATE INDEX idx_indexing_attempts_result_status ON indexing_attempts(result_status);
      CREATE INDEX idx_indexing_attempts_attempted_at ON indexing_attempts(attempted_at);
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE transactions
        ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

      ALTER TABLE transactions
        ADD COLUMN inactive_reason TEXT CHECK (
          inactive_reason IS NULL OR inactive_reason IN ('REMOVED_FROM_MEMPOOL', 'INVALIDATED')
        );

      CREATE INDEX idx_transactions_active_chain_status ON transactions(is_active, chain_status);
      CREATE INDEX idx_transactions_active_block_height ON transactions(is_active, block_height);
    `
  },
  {
    version: 3,
    sql: `
      ALTER TABLE verification_records
        ADD COLUMN protocol TEXT NOT NULL DEFAULT 'TM0'
        CHECK (protocol IN ('TM0', 'TM1'));

      CREATE INDEX idx_verification_records_protocol ON verification_records(protocol);
    `
  }
];
