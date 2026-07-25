import type { VerificationStatus } from "@tonalli-memo/verification";
import type { ChainStatus, DurableVerificationStatus } from "../db/types.js";

export interface ApiErrorDto {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export interface HealthResponseDto {
  readonly status: "ok";
  readonly service: "tonalli-memo-indexer";
}

export interface TransactionSummaryDto {
  readonly txid: string;
  readonly chainStatus: ChainStatus;
  readonly isCoinbase: boolean;
  readonly isFinal: boolean;
  readonly blockHeight: number | null;
  readonly blockHash: string | null;
  readonly blockTimestamp: number | null;
  readonly firstSeenAt: number | null;
  readonly firstIndexedAt: number;
  readonly updatedAt: number;
}

export interface CandidateLocationDto {
  readonly outputIndex: number;
  readonly pushIndex: number;
}

export interface StoredVerificationDto {
  readonly txid: string;
  readonly status: DurableVerificationStatus;
  readonly protocolVersion: number | null;
  readonly eventType: string | null;
  readonly profileCode: string | null;
  readonly payload: string | null;
  readonly byteLength: number | null;
  readonly candidate: CandidateLocationDto | null;
  readonly authorizingAddress: string | null;
  readonly authorizingInputIndex: number | null;
  readonly evaluationHeight: number | null;
  readonly firstIndexedAt: number;
  readonly lastVerifiedAt: number;
}

export interface TxResponseDto {
  readonly transaction: TransactionSummaryDto;
  readonly verification: StoredVerificationDto | null;
}

export interface FeedItemDto {
  readonly transaction: TransactionSummaryDto;
  readonly verification: StoredVerificationDto;
}

export interface FeedResponseDto {
  readonly items: readonly FeedItemDto[];
  readonly limit: number;
}

export interface PublicVerificationResultDto {
  readonly status: VerificationStatus;
  readonly txid: string;
  readonly transaction?: TransactionSummaryDto;
  readonly memo?: {
    readonly protocolVersion: number;
    readonly eventType: string;
    readonly profileCode: string;
    readonly payload: string;
    readonly byteLength: number;
  };
  readonly candidate?: CandidateLocationDto;
  readonly candidates?: readonly CandidateLocationDto[];
  readonly authorizingAddress?: string;
  readonly authorizingInputIndex?: number;
  readonly evaluationHeight?: number;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface AdminIndexResponseDto {
  readonly attemptId: number;
  readonly persistedRecord: boolean;
  readonly verification: PublicVerificationResultDto;
}
