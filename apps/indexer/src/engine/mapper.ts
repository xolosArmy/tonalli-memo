import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import type { VerificationResult } from "@tonalli-memo/verification";
import type { DurableVerificationStatus } from "../db/types.js";

export interface CandidateLocationDto {
  readonly outputIndex: number;
  readonly pushIndex: number;
}

export interface AuthorizationDecisionDto {
  readonly inputIndex: number;
  readonly address: string;
  readonly authorized: boolean;
  readonly reason: string;
  readonly evaluationHeight: number;
}

export interface MappedVerificationRecord {
  readonly status: DurableVerificationStatus;
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
  readonly authorizationContext: unknown | null;
  readonly authorizationDecisions: readonly AuthorizationDecisionDto[];
  readonly diagnostics: unknown;
}

export interface MappedIndexingResult {
  readonly requestedTxid: string;
  readonly resultStatus: VerificationResult["status"];
  readonly transaction: NormalizedTransaction | null;
  readonly tipHeight: number | null;
  readonly verificationRecord: MappedVerificationRecord | null;
  readonly attemptDiagnostics: unknown;
}

export function mapVerificationResult(
  result: VerificationResult,
  requestedTxid: string,
  tipHeight: number | null
): MappedIndexingResult {
  switch (result.status) {
    case "VERIFIED":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: {
          ...memoColumns(result),
          status: result.status,
          authorizingAddress: result.authorizingAddress,
          authorizingInputIndex: result.authorizingInputIndex,
          evaluationHeight: result.evaluationHeight,
          authorizationContext: result.authorizationContext,
          authorizationDecisions: authorizationDecisions(result.authorizationDecisions),
          diagnostics: {}
        },
        attemptDiagnostics: {}
      };
    case "UNAUTHORIZED":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: {
          ...memoColumns(result),
          status: result.status,
          authorizingAddress: null,
          authorizingInputIndex: null,
          evaluationHeight: result.evaluationHeight,
          authorizationContext: result.authorizationContext,
          authorizationDecisions: authorizationDecisions(result.authorizationDecisions),
          diagnostics: {
            authorizationDecisions: authorizationDecisions(result.authorizationDecisions)
          }
        },
        attemptDiagnostics: {}
      };
    case "NO_MEMO":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: emptyRecord(result.status),
        attemptDiagnostics: {}
      };
    case "INVALID_MEMO":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: {
          ...emptyRecord(result.status),
          candidateOutputIndex: result.candidate.outputIndex,
          candidatePushIndex: result.candidate.pushIndex,
          diagnostics: {
            protocolError: {
              code: result.protocolError.code,
              message: result.protocolError.message
            },
            candidate: location(result.candidate)
          }
        },
        attemptDiagnostics: {}
      };
    case "MULTIPLE_MEMOS":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: {
          ...emptyRecord(result.status),
          diagnostics: {
            candidates: result.candidates.map((candidate) => location(candidate.location))
          }
        },
        attemptDiagnostics: {}
      };
    case "MEMPOOL_TIP_REQUIRED":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: null,
        attemptDiagnostics: {
          candidate: location(result.candidate),
          memo: memoDiagnostic(result)
        }
      };
    case "INVALID_VERIFICATION_CONTEXT":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: null,
        attemptDiagnostics: {
          contextError: {
            code: result.contextError.code,
            message: result.contextError.message
          },
          authorizationContext: result.authorizationContext,
          candidate: location(result.candidate),
          memo: memoDiagnostic(result)
        }
      };
    case "INVALID_TXID":
    case "TRANSACTION_NOT_FOUND":
    case "CHRONIK_UNAVAILABLE":
    case "INVALID_CHRONIK_RESPONSE":
      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: null,
        tipHeight,
        verificationRecord: null,
        attemptDiagnostics: {
          sourceError: {
            code: result.sourceError.code,
            message: result.sourceError.message
          }
        }
      };
    default:
      return assertNever(result);
  }
}

function memoColumns(
  result: Extract<VerificationResult, { status: "VERIFIED" | "UNAUTHORIZED" }>
): Omit<
  MappedVerificationRecord,
  | "status"
  | "authorizingAddress"
  | "authorizingInputIndex"
  | "evaluationHeight"
  | "authorizationContext"
  | "authorizationDecisions"
  | "diagnostics"
> {
  return {
    protocolVersion: result.memo.version,
    eventType: result.memo.type,
    profileCode: result.memo.profile,
    payload: result.memo.payload,
    byteLength: result.memo.byteLength,
    candidateOutputIndex: result.candidate.outputIndex,
    candidatePushIndex: result.candidate.pushIndex
  };
}

function memoDiagnostic(result: Extract<VerificationResult, { memo: unknown }>): unknown {
  return {
    protocolVersion: result.memo.version,
    eventType: result.memo.type,
    profileCode: result.memo.profile,
    payload: result.memo.payload,
    byteLength: result.memo.byteLength
  };
}

function emptyRecord(status: DurableVerificationStatus): MappedVerificationRecord {
  return {
    status,
    protocolVersion: null,
    eventType: null,
    profileCode: null,
    payload: null,
    byteLength: null,
    candidateOutputIndex: null,
    candidatePushIndex: null,
    authorizingAddress: null,
    authorizingInputIndex: null,
    evaluationHeight: null,
    authorizationContext: null,
    authorizationDecisions: [],
    diagnostics: {}
  };
}

function location(candidate: CandidateLocationDto): CandidateLocationDto {
  return {
    outputIndex: candidate.outputIndex,
    pushIndex: candidate.pushIndex
  };
}

function authorizationDecisions(
  decisions: readonly Extract<VerificationResult, { status: "VERIFIED" | "UNAUTHORIZED" }>["authorizationDecisions"][number][]
): readonly AuthorizationDecisionDto[] {
  return decisions.map((decision) => ({
    inputIndex: decision.inputIndex,
    address: decision.address,
    authorized: decision.authorized,
    reason: decision.reason,
    evaluationHeight: decision.evaluationHeight
  }));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled verification status: ${JSON.stringify(value)}`);
}
