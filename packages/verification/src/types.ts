import type {
  ChronikAdapterErrorCode,
  ChronikTransactionAdapter,
  NormalizedTransaction
} from "@tonalli-memo/chronik";
import type { ParsedTm1Post, Tm1ErrorCode, ValidatedMemo } from "@tonalli-memo/protocol";
import type {
  AuthorizationContext,
  AuthorizationReason,
  ProfileRegistryEntry,
  RegistryDocument
} from "@tonalli-memo/registry";
import type {
  MemoCandidate,
  MemoCandidateLocation,
  Tm0MemoCandidateLocation,
  Tm1MemoCandidateLocation
} from "./candidates.js";
import type { MemoProtocolFailure, VerificationContextFailure, VerificationSourceError } from "./errors.js";
import type { Tm1AuthorInputErrorCode } from "./verify-tm1-designated-input.js";

export type VerificationStatus =
  | "VERIFIED"
  | "UNAUTHORIZED"
  | "NO_MEMO"
  | "INVALID_MEMO"
  | "MULTIPLE_MEMOS"
  | "MEMPOOL_TIP_REQUIRED"
  | "INVALID_VERIFICATION_CONTEXT"
  | "INVALID_TXID"
  | "TRANSACTION_NOT_FOUND"
  | "CHRONIK_UNAVAILABLE"
  | "INVALID_CHRONIK_RESPONSE";

export interface VerifyNormalizedTransactionOptions {
  readonly registry?: RegistryDocument;
  readonly tipHeight?: number;
}

export interface VerifyTransactionContext {
  readonly tipHeight?: number;
}

export interface MemoVerificationServiceOptions {
  readonly chronik: ChronikTransactionAdapter;
  readonly registry?: RegistryDocument;
}

export interface InputAuthorizationDecision {
  readonly inputIndex: number;
  readonly address: string;
  readonly authorized: boolean;
  readonly reason: AuthorizationReason;
  readonly evaluationHeight: number;
}

export interface VerificationBase {
  readonly status: VerificationStatus;
  readonly txid: string;
}

export interface Tm0VerifiedResult extends VerificationBase {
  readonly status: "VERIFIED";
  readonly protocol: "TM0";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: Tm0MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
  readonly authorizationContext: AuthorizationContext;
  readonly evaluationHeight: number;
  readonly authorizingAddress: string;
  readonly authorizingInputIndex: number;
  readonly authorizationDecisions: readonly InputAuthorizationDecision[];
}

export interface Tm1VerifiedResult extends VerificationBase {
  readonly status: "VERIFIED";
  readonly protocol: "TM1";
  readonly transaction: NormalizedTransaction;
  readonly memo: ParsedTm1Post;
  readonly candidate: Tm1MemoCandidateLocation;
  readonly authorizingAddress: string | null;
  readonly authorizingInputIndex: number;
  readonly publicKeyHex: string;
  readonly publicKeyHashHex: string;
  readonly signatureWithHashTypeHex: string;
  readonly sighashByte: 0x41 | 0xc1;
  readonly trustModel: "trusted-chronik";
}

export type VerifiedResult = Tm0VerifiedResult | Tm1VerifiedResult;

export interface UnauthorizedResult extends VerificationBase {
  readonly status: "UNAUTHORIZED";
  readonly protocol: "TM0";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: Tm0MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
  readonly authorizationContext: AuthorizationContext;
  readonly evaluationHeight: number;
  readonly authorizationDecisions: readonly InputAuthorizationDecision[];
}

export interface NoMemoResult extends VerificationBase {
  readonly status: "NO_MEMO";
  readonly transaction: NormalizedTransaction;
}

export interface Tm0InvalidMemoResult extends VerificationBase {
  readonly status: "INVALID_MEMO";
  readonly protocol: "TM0";
  readonly transaction: NormalizedTransaction;
  readonly candidate: Tm0MemoCandidateLocation;
  readonly protocolError: MemoProtocolFailure;
}

export interface Tm1InvalidMemoResult extends VerificationBase {
  readonly status: "INVALID_MEMO";
  readonly protocol: "TM1";
  readonly transaction: NormalizedTransaction;
  readonly candidate: Tm1MemoCandidateLocation;
  readonly protocolError: {
    readonly code: Tm1ErrorCode | Tm1AuthorInputErrorCode;
    readonly message: string;
  };
}

export type InvalidMemoResult = Tm0InvalidMemoResult | Tm1InvalidMemoResult;

export interface MultipleMemosResult extends VerificationBase {
  readonly status: "MULTIPLE_MEMOS";
  readonly transaction: NormalizedTransaction;
  readonly candidates: readonly MemoCandidate[];
}

export interface MempoolTipRequiredResult extends VerificationBase {
  readonly status: "MEMPOOL_TIP_REQUIRED";
  readonly protocol: "TM0";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: Tm0MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
}

export interface InvalidVerificationContextResult extends VerificationBase {
  readonly status: "INVALID_VERIFICATION_CONTEXT";
  readonly protocol: "TM0";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: Tm0MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
  readonly authorizationContext: AuthorizationContext;
  readonly contextError: VerificationContextFailure;
}

export interface ChronikFailureResult extends VerificationBase {
  readonly status: Exclude<ChronikAdapterErrorCode, "INVALID_OPTIONS">;
  readonly sourceError: VerificationSourceError;
}

export type NormalizedVerificationResult =
  | VerifiedResult
  | UnauthorizedResult
  | NoMemoResult
  | InvalidMemoResult
  | MultipleMemosResult
  | MempoolTipRequiredResult
  | InvalidVerificationContextResult;

export type VerificationResult = NormalizedVerificationResult | ChronikFailureResult;

export type ProtocolMemoCandidateLocation = MemoCandidateLocation;
