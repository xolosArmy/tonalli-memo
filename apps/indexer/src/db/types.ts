import type Database from "better-sqlite3";

export interface StoredInput {
  readonly index: number;
  readonly prevOut: {
    readonly txid: string;
    readonly outIdx: number;
  };
  readonly outputScriptHex: string | null;
  readonly address: string | null;
}

export interface StoredOpReturnOutput {
  readonly outputIndex: number;
  readonly outputScriptHex: string;
  readonly pushesHex: readonly string[];
  readonly parseStatus: "parsed" | "malformed";
  readonly parseErrorCode?: "MALFORMED_OP_RETURN";
}

export interface StoredNormalizedTransactionV1 {
  readonly schemaVersion: 1;
  readonly txid: string;
  readonly isCoinbase: boolean;
  readonly inputs: readonly StoredInput[];
  readonly inputAddresses: readonly string[];
  readonly opReturnOutputs: readonly StoredOpReturnOutput[];
  readonly blockHeight: number | null;
  readonly blockHash: string | null;
  readonly blockTimestamp: number | null;
  readonly firstSeenAt: number | null;
  readonly isFinal: boolean;
}

export type ChainStatus = "confirmed" | "unconfirmed";
export type DurableVerificationStatus = "VERIFIED" | "UNAUTHORIZED" | "NO_MEMO" | "INVALID_MEMO" | "MULTIPLE_MEMOS";

export interface OpenIndexerDatabaseOptions {
  readonly filename: string;
}

export interface IndexerDatabase {
  readonly connection: Database.Database;
  close(): void;
}

export interface StoredTransactionRow {
  readonly txid: string;
  readonly chainStatus: ChainStatus;
  readonly isCoinbase: boolean;
  readonly isFinal: boolean;
  readonly blockHeight: number | null;
  readonly blockHash: string | null;
  readonly blockTimestamp: number | null;
  readonly firstSeenAt: number | null;
  readonly normalizedJson: string;
  readonly normalizedTransaction: StoredNormalizedTransactionV1;
  readonly firstIndexedAt: number;
  readonly updatedAt: number;
}

export interface StoredVerificationRecord {
  readonly txid: string;
  readonly verificationStatus: DurableVerificationStatus;
  readonly protocolVersion: number | null;
  readonly eventType: string | null;
  readonly profileCode: string | null;
  readonly payload: string | null;
  readonly byteLength: number | null;
  readonly candidateOutputIndex: number | null;
  readonly candidatePushIndex: number | null;
  readonly authorizingAddress: string | null;
  readonly authorizingInputIndex: number | null;
  readonly evaluationHeight: number | null;
  readonly authorizationContextJson: string | null;
  readonly authorizationDecisionsJson: string;
  readonly diagnosticsJson: string;
  readonly authorizationContext: unknown;
  readonly authorizationDecisions: readonly unknown[];
  readonly diagnostics: unknown;
  readonly firstIndexedAt: number;
  readonly lastVerifiedAt: number;
}

export interface StoredIndexingAttempt {
  readonly id: number;
  readonly requestedTxid: string;
  readonly resultStatus: string;
  readonly transactionTxid: string | null;
  readonly tipHeight: number | null;
  readonly persistedRecord: boolean;
  readonly diagnosticsJson: string;
  readonly diagnostics: unknown;
  readonly attemptedAt: number;
}


export interface VerifiedFeedRow {
  readonly transaction: StoredTransactionRow;
  readonly verification: StoredVerificationRecord;
}
