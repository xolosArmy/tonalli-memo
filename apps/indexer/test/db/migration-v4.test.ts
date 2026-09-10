import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from "../../src/db/migrations.js";
import { openIndexerDatabase, runMigrations } from "../../src/db/database.js";

const TXID = "11".repeat(32);

describe("database migration v4", () => {
  it("migrates cleanly from schema v3 to v4 preserving existing records with null attachment fields", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");

    // Execute migrations 1 to 3 manually
    for (const migration of MIGRATIONS.filter((m) => m.version <= 3)) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.pragma(`user_version = ${migration.version}`);
      })();
    }

    expect(db.pragma("user_version", { simple: true })).toBe(3);

    // Insert a transaction and verification record under v3
    db.prepare(`
      INSERT INTO transactions (
        txid, chain_status, is_coinbase, is_final, block_height, block_hash, block_timestamp,
        first_seen_at, normalized_json, first_indexed_at, updated_at, is_active, inactive_reason
      ) VALUES (?, 'confirmed', 0, 1, 800000, 'hash', 1700000000, 1700000000, '{}', 1700000000, 1700000000, 1, NULL)
    `).run(TXID);

    const rawPayload = `@nft1:${"22".repeat(32)}\nPreserve canonical payload`;
    db.prepare(`
      INSERT INTO verification_records (
        txid, verification_status, protocol, protocol_version, event_type, profile_code,
        payload, byte_length, candidate_output_index, candidate_push_index,
        authorizing_address, authorizing_input_index, evaluation_height,
        authorization_context_json, authorization_decisions_json, diagnostics_json,
        first_indexed_at, last_verified_at
      ) VALUES (?, 'VERIFIED', 'TM1', 1, 'POST', NULL, ?, 100, 0, NULL, 'ecash:qptest', 0, NULL, NULL, '[]', '{}', 1700000000, 1700000000)
    `).run(TXID, rawPayload);

    // Run migrations to current version (v4)
    runMigrations(db);

    expect(db.pragma("user_version", { simple: true })).toBe(4);
    expect(CURRENT_SCHEMA_VERSION).toBe(4);

    // Check that existing row survived with preserved payload and null attachment fields
    const row = db.prepare("SELECT * FROM verification_records WHERE txid = ?").get(TXID) as Record<string, unknown>;
    expect(row.payload).toBe(rawPayload);
    expect(row.attached_token_id).toBeNull();
    expect(row.attachment_ownership_status).toBeNull();
    expect(row.attachment_checked_at).toBeNull();

    // Verify index exists
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain("idx_verification_records_attached_token_id");

    // Verify idempotency
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(4);

    db.close();
  });

  it("enforces check constraints on attachment columns", () => {
    const database = openIndexerDatabase({ filename: ":memory:" });
    const db = database.connection;

    db.prepare(`
      INSERT INTO transactions (
        txid, chain_status, is_coinbase, is_final, block_height, block_hash, block_timestamp,
        first_seen_at, normalized_json, first_indexed_at, updated_at, is_active, inactive_reason
      ) VALUES (?, 'confirmed', 0, 1, 800000, 'hash', 1700000000, 1700000000, '{}', 1700000000, 1700000000, 1, NULL)
    `).run(TXID);

    // Invalid attachment_ownership_status should fail
    expect(() => {
      db.prepare(`
        INSERT INTO verification_records (
          txid, verification_status, protocol, protocol_version, event_type, profile_code,
          payload, byte_length, candidate_output_index, candidate_push_index,
          authorizing_address, authorizing_input_index, evaluation_height,
          authorization_context_json, authorization_decisions_json, diagnostics_json,
          first_indexed_at, last_verified_at, attached_token_id, attachment_ownership_status, attachment_checked_at
        ) VALUES (?, 'VERIFIED', 'TM1', 1, 'POST', NULL, 'test', 4, 0, NULL, 'ecash:qptest', 0, NULL, NULL, '[]', '{}', 1, 1, 'token1', 'INVALID_STATUS', 100)
      `).run(TXID);
    }).toThrow();

    // Negative attachment_checked_at should fail
    expect(() => {
      db.prepare(`
        INSERT INTO verification_records (
          txid, verification_status, protocol, protocol_version, event_type, profile_code,
          payload, byte_length, candidate_output_index, candidate_push_index,
          authorizing_address, authorizing_input_index, evaluation_height,
          authorization_context_json, authorization_decisions_json, diagnostics_json,
          first_indexed_at, last_verified_at, attached_token_id, attachment_ownership_status, attachment_checked_at
        ) VALUES (?, 'VERIFIED', 'TM1', 1, 'POST', NULL, 'test', 4, 0, NULL, 'ecash:qptest', 0, NULL, NULL, '[]', '{}', 1, 1, 'token1', 'VERIFIED_AT_INDEXING', -5)
      `).run(TXID);
    }).toThrow();

    // Valid attachment values succeed
    expect(() => {
      db.prepare(`
        INSERT INTO verification_records (
          txid, verification_status, protocol, protocol_version, event_type, profile_code,
          payload, byte_length, candidate_output_index, candidate_push_index,
          authorizing_address, authorizing_input_index, evaluation_height,
          authorization_context_json, authorization_decisions_json, diagnostics_json,
          first_indexed_at, last_verified_at, attached_token_id, attachment_ownership_status, attachment_checked_at
        ) VALUES (?, 'VERIFIED', 'TM1', 1, 'POST', NULL, 'test', 4, 0, NULL, 'ecash:qptest', 0, NULL, NULL, '[]', '{}', 1, 1, 'token1', 'VERIFIED_AT_INDEXING', 100)
      `).run(TXID);
    }).not.toThrow();

    database.close();
  });
});
