import type {
  ChronikAdapterErrorCode,
  ChronikTransactionAdapter,
  NormalizedTransaction
} from "@tonalli-memo/chronik";
import type { ValidatedMemo } from "@tonalli-memo/protocol";
import type {
  AuthorizationContext,
  AuthorizationReason,
  ProfileRegistryEntry,
  RegistryDocument
} from "@tonalli-memo/registry";
import type { MemoCandidate, MemoCandidateLocation } from "./candidates.js";
import type { MemoProtocolFailure, VerificationContextFailure, VerificationSourceError } from "./errors.js";

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

export interface VerifiedResult extends VerificationBase {
  readonly status: "VERIFIED";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
  readonly authorizationContext: AuthorizationContext;
  readonly evaluationHeight: number;
  readonly authorizingAddress: string;
  readonly authorizingInputIndex: number;
  readonly authorizationDecisions: readonly InputAuthorizationDecision[];
}

export interface UnauthorizedResult extends VerificationBase {
  readonly status: "UNAUTHORIZED";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
  readonly authorizationContext: AuthorizationContext;
  readonly evaluationHeight: number;
  readonly authorizationDecisions: readonly InputAuthorizationDecision[];
}

export interface NoMemoResult extends VerificationBase {
  readonly status: "NO_MEMO";
  readonly transaction: NormalizedTransaction;
}

export interface InvalidMemoResult extends VerificationBase {
  readonly status: "INVALID_MEMO";
  readonly transaction: NormalizedTransaction;
  readonly candidate: MemoCandidateLocation;
  readonly protocolError: MemoProtocolFailure;
}

export interface MultipleMemosResult extends VerificationBase {
  readonly status: "MULTIPLE_MEMOS";
  readonly transaction: NormalizedTransaction;
  readonly candidates: readonly MemoCandidate[];
}

export interface MempoolTipRequiredResult extends VerificationBase {
  readonly status: "MEMPOOL_TIP_REQUIRED";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: MemoCandidateLocation;
  readonly profile: ProfileRegistryEntry;
}

export interface InvalidVerificationContextResult extends VerificationBase {
  readonly status: "INVALID_VERIFICATION_CONTEXT";
  readonly transaction: NormalizedTransaction;
  readonly memo: ValidatedMemo;
  readonly candidate: MemoCandidateLocation;
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
