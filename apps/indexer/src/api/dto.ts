import type { VerificationStatus } from "@tonalli-memo/verification";
import type { ChainStatus, DurableVerificationStatus, StoredMemoProtocol } from "../db/types.js";

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

export type CandidateLocationDto =
  | {
      readonly protocol: "TM0";
      readonly outputIndex: number;
      readonly pushIndex: number;
    }
  | {
      readonly protocol: "TM1";
      readonly outputIndex: number;
    };

export interface StoredVerificationDto {
  readonly txid: string;
  readonly status: DurableVerificationStatus;
  readonly protocol: StoredMemoProtocol;
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

export type PublicMemoDto =
  | {
      readonly protocol: "TM0";
      readonly version: 0;
      readonly eventType: string;
      readonly profileCode: string;
      readonly payload: string;
      readonly byteLength: number;
    }
  | {
      readonly protocol: "TM1";
      readonly version: 1;
      readonly eventType: "POST";
      readonly profileCode: null;
      readonly payload: string;
      readonly byteLength: number;
      readonly publicKeyHashHex: string;
      readonly sighashByte: 0x41 | 0xc1;
      readonly trustModel: "trusted-chronik";
    };

export interface PublicVerificationResultDto {
  readonly status: VerificationStatus;
  readonly txid: string;
  readonly protocol?: StoredMemoProtocol;
  readonly transaction?: TransactionSummaryDto;
  readonly memo?: PublicMemoDto;
  readonly candidate?: CandidateLocationDto;
  readonly candidates?: readonly CandidateLocationDto[];
  readonly authorizingAddress?: string | null;
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
