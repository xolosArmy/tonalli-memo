export type ChainStatus = "confirmed" | "unconfirmed";
export type StoredMemoProtocol = "TM0" | "TM1";

export interface ApiErrorDto {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export interface TransactionSummary {
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

export type CandidateLocation =
  | {
      readonly protocol: "TM0";
      readonly outputIndex: number;
      readonly pushIndex: number;
    }
  | {
      readonly protocol: "TM1";
      readonly outputIndex: number;
    };

export interface Tm1Authorship {
  readonly publicKeyHashHex: string;
  readonly sighashByte: 65 | 193;
  readonly trustModel: "trusted-chronik";
}

export type VerificationStatus = "VERIFIED" | "UNAUTHORIZED" | "NO_MEMO" | "INVALID_MEMO" | "MULTIPLE_MEMOS";

export interface StoredVerification {
  readonly txid: string;
  readonly status: VerificationStatus;
  readonly protocol: StoredMemoProtocol;
  readonly protocolVersion: number | null;
  readonly eventType: string | null;
  readonly profileCode: string | null;
  readonly payload: string | null;
  readonly byteLength: number | null;
  readonly candidate: CandidateLocation | null;
  readonly authorizingAddress: string | null;
  readonly authorizingInputIndex: number | null;
  readonly evaluationHeight: number | null;
  readonly tm1Authorship: Tm1Authorship | null;
  readonly firstIndexedAt: number;
  readonly lastVerifiedAt: number;
}

export interface FeedItem {
  readonly transaction: TransactionSummary;
  readonly verification: StoredVerification;
}

export interface FeedResponse {
  readonly items: readonly FeedItem[];
  readonly limit: number;
}

export interface TxResponse {
  readonly transaction: TransactionSummary;
  readonly verification: StoredVerification | null;
}
