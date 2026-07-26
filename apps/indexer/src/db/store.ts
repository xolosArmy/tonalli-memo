import type Database from "better-sqlite3";
import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import { serializeStoredTransaction } from "./serialization.js";
import type {
  ChainStatus,
  IndexerDatabase,
  StoredIndexingAttempt,
  StoredTransactionRow,
  TransactionInactiveReason,
  StoredVerificationRecord,
  VerifiedFeedRow
} from "./types.js";
import type { MappedIndexingResult, MappedVerificationRecord } from "../engine/mapper.js";

export interface PersistIndexingResultInput {
  readonly mappedResult: MappedIndexingResult;
  readonly nowSeconds: number;
}

export interface PersistIndexingResultOutput {
  readonly attemptId: number;
  readonly persistedRecord: boolean;
}

export interface MarkTransactionInactiveOutput {
  readonly txid: string;
  readonly changed: boolean;
}

interface TransactionSqlRow {
  readonly txid: string;
  readonly chain_status: ChainStatus;
  readonly is_coinbase: 0 | 1;
  readonly is_final: 0 | 1;
  readonly block_height: number | null;
  readonly block_hash: string | null;
  readonly block_timestamp: number | null;
  readonly first_seen_at: number | null;
  readonly normalized_json: string;
  readonly first_indexed_at: number;
  readonly updated_at: number;
  readonly is_active: 0 | 1;
  readonly inactive_reason: TransactionInactiveReason | null;
}

interface VerificationSqlRow {
  readonly txid: string;
  readonly verification_status: StoredVerificationRecord["verificationStatus"];
  readonly protocol_version: number | null;
  readonly event_type: string | null;
  readonly profile_code: string | null;
  readonly payload: string | null;
  readonly byte_length: number | null;
  readonly candidate_output_index: number | null;
  readonly candidate_push_index: number | null;
  readonly authorizing_address: string | null;
  readonly authorizing_input_index: number | null;
  readonly evaluation_height: number | null;
  readonly authorization_context_json: string | null;
  readonly authorization_decisions_json: string;
  readonly diagnostics_json: string;
  readonly first_indexed_at: number;
  readonly last_verified_at: number;
}

interface VerifiedFeedSqlRow extends Omit<TransactionSqlRow, "first_indexed_at">, Omit<VerificationSqlRow, "first_indexed_at"> {
  readonly transaction_first_indexed_at: number;
  readonly verification_first_indexed_at: number;
}

interface AttemptSqlRow {
  readonly id: number;
  readonly requested_txid: string;
  readonly result_status: string;
  readonly transaction_txid: string | null;
  readonly tip_height: number | null;
  readonly persisted_record: 0 | 1;
  readonly diagnostics_json: string;
  readonly attempted_at: number;
}

export class MemoStore {
  private readonly connection: Database.Database;

  constructor(database: IndexerDatabase) {
    this.connection = database.connection;
  }

  persistIndexingResult(input: PersistIndexingResultInput): PersistIndexingResultOutput {
    return this.connection.transaction(() => {
      const transaction = input.mappedResult.transaction;
      if (transaction !== null) {
        this.upsertTransaction(transaction, input.nowSeconds);
      }

      const persistedRecord = input.mappedResult.verificationRecord !== null && transaction !== null;
      if (persistedRecord) {
        this.upsertVerificationRecord(transaction.txid, input.mappedResult.verificationRecord, input.nowSeconds);
      }

      const attemptId = this.insertAttempt(input.mappedResult, persistedRecord, input.nowSeconds);
      return {
        attemptId,
        persistedRecord
      };
    })();
  }

  getTransaction(txid: string): StoredTransactionRow | null {
    const row = this.connection.prepare("SELECT * FROM transactions WHERE txid = ?").get(txid) as TransactionSqlRow | undefined;
    if (row === undefined) {
      return null;
    }
    return toTransactionRow(row);
  }

  getVerificationRecord(txid: string): StoredVerificationRecord | null {
    const row = this.connection.prepare("SELECT * FROM verification_records WHERE txid = ?").get(txid) as
      | VerificationSqlRow
      | undefined;
    if (row === undefined) {
      return null;
    }
    return toVerificationRow(row);
  }

  listIndexingAttempts(txid: string): readonly StoredIndexingAttempt[] {
    const rows = this.connection
      .prepare("SELECT * FROM indexing_attempts WHERE requested_txid = ? ORDER BY id ASC")
      .all(txid) as AttemptSqlRow[];
    return rows.map(toAttemptRow);
  }

  listVerifiedFeed(limit: number): readonly VerifiedFeedRow[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Verified feed limit must be an integer between 1 and 100.");
    }

    const rows = this.connection
      .prepare(
        `
        SELECT
          t.txid,
          t.chain_status,
          t.is_coinbase,
          t.is_final,
          t.block_height,
          t.block_hash,
          t.block_timestamp,
          t.first_seen_at,
          t.normalized_json,
          t.first_indexed_at AS transaction_first_indexed_at,
          t.updated_at,
          t.is_active,
          t.inactive_reason,
          v.verification_status,
          v.protocol_version,
          v.event_type,
          v.profile_code,
          v.payload,
          v.byte_length,
          v.candidate_output_index,
          v.candidate_push_index,
          v.authorizing_address,
          v.authorizing_input_index,
          v.evaluation_height,
          v.authorization_context_json,
          v.authorization_decisions_json,
          v.diagnostics_json,
          v.first_indexed_at AS verification_first_indexed_at,
          v.last_verified_at
        FROM verification_records v
        INNER JOIN transactions t ON t.txid = v.txid
        WHERE v.verification_status = 'VERIFIED' AND t.is_active = 1
        ORDER BY COALESCE(t.block_height, 9223372036854775807) DESC, v.last_verified_at DESC, t.txid ASC
        LIMIT ?
        `
      )
      .all(limit) as VerifiedFeedSqlRow[];

    return rows.map(toVerifiedFeedRow);
  }


  markTransactionInactive(txid: string, reason: TransactionInactiveReason): MarkTransactionInactiveOutput {
    validateInactiveReason(reason);
    const result = this.connection
      .prepare(
        `
        UPDATE transactions
        SET is_active = 0, inactive_reason = ?
        WHERE txid = ? AND (is_active = 1 OR inactive_reason IS NOT ?)
        `
      )
      .run(reason, txid, reason);
    return { txid, changed: result.changes > 0 };
  }

  listActiveUnconfirmedTxids(limit: number): readonly string[] {
    validateListLimit(limit);
    const rows = this.connection
      .prepare(
        `
        SELECT txid
        FROM transactions
        WHERE is_active = 1 AND chain_status = 'unconfirmed'
        ORDER BY updated_at ASC, txid ASC
        LIMIT ?
        `
      )
      .all(limit) as { readonly txid: string }[];
    return rows.map((row) => row.txid);
  }

  listActiveConfirmedTxidsAtOrAbove(height: number, limit: number): readonly string[] {
    validateBlockHeight(height);
    validateListLimit(limit);
    const rows = this.connection
      .prepare(
        `
        SELECT txid
        FROM transactions
        WHERE is_active = 1 AND chain_status = 'confirmed' AND block_height >= ?
        ORDER BY block_height ASC, updated_at ASC, txid ASC
        LIMIT ?
        `
      )
      .all(height, limit) as { readonly txid: string }[];
    return rows.map((row) => row.txid);
  }


  private upsertTransaction(transaction: NormalizedTransaction, nowSeconds: number): void {
    const chainStatus = deriveChainStatus(transaction);
    this.connection
      .prepare(
        `
        INSERT INTO transactions (
          txid, chain_status, is_coinbase, is_final, block_height, block_hash, block_timestamp, first_seen_at,
          normalized_json, first_indexed_at, updated_at, is_active, inactive_reason
        )
        VALUES (@txid, @chainStatus, @isCoinbase, @isFinal, @blockHeight, @blockHash, @blockTimestamp, @firstSeenAt,
          @normalizedJson, @nowSeconds, @nowSeconds, 1, NULL)
        ON CONFLICT(txid) DO UPDATE SET
          chain_status = excluded.chain_status,
          is_coinbase = excluded.is_coinbase,
          is_final = excluded.is_final,
          block_height = excluded.block_height,
          block_hash = excluded.block_hash,
          block_timestamp = excluded.block_timestamp,
          first_seen_at = excluded.first_seen_at,
          normalized_json = excluded.normalized_json,
          updated_at = excluded.updated_at,
          is_active = 1,
          inactive_reason = NULL
        `
      )
      .run({
        txid: transaction.txid,
        chainStatus,
        isCoinbase: transaction.isCoinbase ? 1 : 0,
        isFinal: transaction.isFinal ? 1 : 0,
        blockHeight: transaction.blockHeight,
        blockHash: chainStatus === "confirmed" ? transaction.blockHash : null,
        blockTimestamp: chainStatus === "confirmed" ? transaction.blockTimestamp : null,
        firstSeenAt: transaction.firstSeenAt,
        normalizedJson: serializeStoredTransaction(transaction),
        nowSeconds
      });
  }

  private upsertVerificationRecord(txid: string, record: MappedVerificationRecord, nowSeconds: number): void {
    this.connection
      .prepare(
        `
        INSERT INTO verification_records (
          txid, verification_status, protocol_version, event_type, profile_code, payload, byte_length,
          candidate_output_index, candidate_push_index, authorizing_address, authorizing_input_index, evaluation_height,
          authorization_context_json, authorization_decisions_json, diagnostics_json, first_indexed_at, last_verified_at
        )
        VALUES (
          @txid, @verificationStatus, @protocolVersion, @eventType, @profileCode, @payload, @byteLength,
          @candidateOutputIndex, @candidatePushIndex, @authorizingAddress, @authorizingInputIndex, @evaluationHeight,
          @authorizationContextJson, @authorizationDecisionsJson, @diagnosticsJson, @nowSeconds, @nowSeconds
        )
        ON CONFLICT(txid) DO UPDATE SET
          verification_status = excluded.verification_status,
          protocol_version = excluded.protocol_version,
          event_type = excluded.event_type,
          profile_code = excluded.profile_code,
          payload = excluded.payload,
          byte_length = excluded.byte_length,
          candidate_output_index = excluded.candidate_output_index,
          candidate_push_index = excluded.candidate_push_index,
          authorizing_address = excluded.authorizing_address,
          authorizing_input_index = excluded.authorizing_input_index,
          evaluation_height = excluded.evaluation_height,
          authorization_context_json = excluded.authorization_context_json,
          authorization_decisions_json = excluded.authorization_decisions_json,
          diagnostics_json = excluded.diagnostics_json,
          last_verified_at = excluded.last_verified_at
        `
      )
      .run({
        txid,
        verificationStatus: record.status,
        protocolVersion: record.protocolVersion,
        eventType: record.eventType,
        profileCode: record.profileCode,
        payload: record.payload,
        byteLength: record.byteLength,
        candidateOutputIndex: record.candidateOutputIndex,
        candidatePushIndex: record.candidatePushIndex,
        authorizingAddress: record.authorizingAddress,
        authorizingInputIndex: record.authorizingInputIndex,
        evaluationHeight: record.evaluationHeight,
        authorizationContextJson: record.authorizationContext === null ? null : JSON.stringify(record.authorizationContext),
        authorizationDecisionsJson: JSON.stringify(record.authorizationDecisions),
        diagnosticsJson: JSON.stringify(record.diagnostics),
        nowSeconds
      });
  }

  private insertAttempt(mappedResult: MappedIndexingResult, persistedRecord: boolean, nowSeconds: number): number {
    const result = this.connection
      .prepare(
        `
        INSERT INTO indexing_attempts (
          requested_txid, result_status, transaction_txid, tip_height, persisted_record, diagnostics_json, attempted_at
        )
        VALUES (@requestedTxid, @resultStatus, @transactionTxid, @tipHeight, @persistedRecord, @diagnosticsJson, @nowSeconds)
        `
      )
      .run({
        requestedTxid: mappedResult.requestedTxid,
        resultStatus: mappedResult.resultStatus,
        transactionTxid: mappedResult.transaction?.txid ?? null,
        tipHeight: mappedResult.tipHeight,
        persistedRecord: persistedRecord ? 1 : 0,
        diagnosticsJson: JSON.stringify(mappedResult.attemptDiagnostics),
        nowSeconds
      });

    if (typeof result.lastInsertRowid !== "number") {
      return Number(result.lastInsertRowid);
    }
    return result.lastInsertRowid;
  }
}

function deriveChainStatus(transaction: NormalizedTransaction): ChainStatus {
  return transaction.blockHeight === null ? "unconfirmed" : "confirmed";
}

function toTransactionRow(row: TransactionSqlRow): StoredTransactionRow {
  return {
    txid: row.txid,
    chainStatus: row.chain_status,
    isCoinbase: row.is_coinbase === 1,
    isFinal: row.is_final === 1,
    blockHeight: row.block_height,
    blockHash: row.block_hash,
    blockTimestamp: row.block_timestamp,
    firstSeenAt: row.first_seen_at,
    normalizedJson: row.normalized_json,
    normalizedTransaction: JSON.parse(row.normalized_json) as StoredTransactionRow["normalizedTransaction"],
    firstIndexedAt: row.first_indexed_at,
    updatedAt: row.updated_at,
    isActive: row.is_active === 1,
    inactiveReason: row.inactive_reason
  };
}

function toVerificationRow(row: VerificationSqlRow): StoredVerificationRecord {
  return {
    txid: row.txid,
    verificationStatus: row.verification_status,
    protocolVersion: row.protocol_version,
    eventType: row.event_type,
    profileCode: row.profile_code,
    payload: row.payload,
    byteLength: row.byte_length,
    candidateOutputIndex: row.candidate_output_index,
    candidatePushIndex: row.candidate_push_index,
    authorizingAddress: row.authorizing_address,
    authorizingInputIndex: row.authorizing_input_index,
    evaluationHeight: row.evaluation_height,
    authorizationContextJson: row.authorization_context_json,
    authorizationDecisionsJson: row.authorization_decisions_json,
    diagnosticsJson: row.diagnostics_json,
    authorizationContext: row.authorization_context_json === null ? null : JSON.parse(row.authorization_context_json),
    authorizationDecisions: JSON.parse(row.authorization_decisions_json) as readonly unknown[],
    diagnostics: JSON.parse(row.diagnostics_json) as unknown,
    firstIndexedAt: row.first_indexed_at,
    lastVerifiedAt: row.last_verified_at
  };
}

function toAttemptRow(row: AttemptSqlRow): StoredIndexingAttempt {
  return {
    id: row.id,
    requestedTxid: row.requested_txid,
    resultStatus: row.result_status,
    transactionTxid: row.transaction_txid,
    tipHeight: row.tip_height,
    persistedRecord: row.persisted_record === 1,
    diagnosticsJson: row.diagnostics_json,
    diagnostics: JSON.parse(row.diagnostics_json) as unknown,
    attemptedAt: row.attempted_at
  };
}


function toVerifiedFeedRow(row: VerifiedFeedSqlRow): VerifiedFeedRow {
  return {
    transaction: toTransactionRow({
      txid: row.txid,
      chain_status: row.chain_status,
      is_coinbase: row.is_coinbase,
      is_final: row.is_final,
      block_height: row.block_height,
      block_hash: row.block_hash,
      block_timestamp: row.block_timestamp,
      first_seen_at: row.first_seen_at,
      normalized_json: row.normalized_json,
      first_indexed_at: row.transaction_first_indexed_at,
      updated_at: row.updated_at,
      is_active: row.is_active,
      inactive_reason: row.inactive_reason
    }),
    verification: toVerificationRow({
      txid: row.txid,
      verification_status: row.verification_status,
      protocol_version: row.protocol_version,
      event_type: row.event_type,
      profile_code: row.profile_code,
      payload: row.payload,
      byte_length: row.byte_length,
      candidate_output_index: row.candidate_output_index,
      candidate_push_index: row.candidate_push_index,
      authorizing_address: row.authorizing_address,
      authorizing_input_index: row.authorizing_input_index,
      evaluation_height: row.evaluation_height,
      authorization_context_json: row.authorization_context_json,
      authorization_decisions_json: row.authorization_decisions_json,
      diagnostics_json: row.diagnostics_json,
      first_indexed_at: row.verification_first_indexed_at,
      last_verified_at: row.last_verified_at
    })
  };
}

function validateListLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Store query limit must be an integer between 1 and 1000.");
  }
}

function validateBlockHeight(height: number): void {
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error("Block height must be a non-negative safe integer.");
  }
}

function validateInactiveReason(reason: TransactionInactiveReason): void {
  if (reason !== "REMOVED_FROM_MEMPOOL" && reason !== "INVALIDATED") {
    throw new Error("Transaction inactive reason must be REMOVED_FROM_MEMPOOL or INVALIDATED.");
  }
}
