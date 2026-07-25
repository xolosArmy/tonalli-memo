import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  MemoStore,
  openIndexerDatabase,
  UnsupportedSchemaVersionError
} from "../../src/index.js";
import { mapVerificationResult } from "../../src/engine/mapper.js";
import { verifiedResult, TXID } from "../fixtures.js";

describe("indexer database", () => {
  it("sets schema version 1 and reopens idempotently", () => {
    const database = openIndexerDatabase({ filename: ":memory:" });
    expect(database.connection.pragma("user_version", { simple: true })).toBe(CURRENT_SCHEMA_VERSION);
    database.close();

    const reopened = openIndexerDatabase({ filename: ":memory:" });
    expect(reopened.connection.pragma("user_version", { simple: true })).toBe(1);
    reopened.close();
  });

  it("enables foreign keys and closes cleanly", () => {
    const database = openIndexerDatabase({ filename: ":memory:" });
    expect(database.connection.pragma("foreign_keys", { simple: true })).toBe(1);
    database.close();
    expect(database.connection.open).toBe(false);
  });

  it("creates the expected tables and indexes", () => {
    const database = openIndexerDatabase({ filename: ":memory:" });
    const tables = database.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const indexes = database.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[];
    expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining(["transactions", "verification_records", "indexing_attempts"]));
    expect(indexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "idx_verification_records_status",
        "idx_verification_records_profile_code",
        "idx_transactions_block_height",
        "idx_indexing_attempts_result_status",
        "idx_indexing_attempts_attempted_at"
      ])
    );
    database.close();
  });

  it("rejects databases newer than the supported schema", () => {
    const directory = mkdtempSync(join(tmpdir(), "tonalli-indexer-"));
    const filename = join(directory, "newer.sqlite");
    try {
      const database = openIndexerDatabase({ filename });
      database.connection.pragma("user_version = 2");
      database.close();

      expect(() => openIndexerDatabase({ filename })).toThrow(UnsupportedSchemaVersionError);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rejects inconsistent block metadata and invalid JSON", () => {
    const database = openIndexerDatabase({ filename: ":memory:" });
    const statement = database.connection.prepare(
      `INSERT INTO transactions (
        txid, chain_status, is_coinbase, is_final, block_height, block_hash, block_timestamp, first_seen_at,
        normalized_json, first_indexed_at, updated_at
      ) VALUES (?, ?, 0, 1, ?, ?, ?, NULL, ?, 1, 1)`
    );
    expect(() => statement.run("a", "confirmed", null, null, null, "{}", 1, 1)).toThrow();
    expect(() => statement.run("b", "unconfirmed", null, null, null, "not-json", 1, 1)).toThrow();
    database.close();
  });

  it("rolls back partial persistence on transaction failure", () => {
    const database = openIndexerDatabase({ filename: ":memory:" });
    const store = new MemoStore(database);
    const mappedResult = mapVerificationResult(verifiedResult(), TXID, null);

    expect(() =>
      store.persistIndexingResult({
        mappedResult: {
          ...mappedResult,
          verificationRecord:
            mappedResult.verificationRecord === null
              ? null
              : {
                  ...mappedResult.verificationRecord,
                  authorizationDecisions: [{ impossible: 1n }] as never
                }
        },
        nowSeconds: 100
      })
    ).toThrow();

    expect(store.getTransaction(TXID)).toBeNull();
    expect(store.getVerificationRecord(TXID)).toBeNull();
    expect(store.listIndexingAttempts(TXID)).toHaveLength(0);
    database.close();
  });
});
