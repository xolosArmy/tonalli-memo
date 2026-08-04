import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import type { MemoCandidate, VerificationResult } from "@tonalli-memo/verification";
import type { DurableVerificationStatus, StoredMemoProtocol } from "../db/types.js";

export interface CandidateLocationDto {
  readonly protocol: StoredMemoProtocol;
  readonly outputIndex: number;
  readonly pushIndex?: number;
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
  readonly protocol: StoredMemoProtocol;
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
      if (result.protocol === "TM1") {
        return {
          requestedTxid,
          resultStatus: result.status,
          transaction: result.transaction,
          tipHeight,
          verificationRecord: {
            status: result.status,
            protocol: "TM1",
            protocolVersion: result.memo.version,
            eventType: result.memo.eventType,
            profileCode: null,
            payload: result.memo.eventData,
            byteLength: result.memo.eventDataByteLength,
            candidateOutputIndex: result.candidate.outputIndex,
            candidatePushIndex: null,
            authorizingAddress: result.authorizingAddress,
            authorizingInputIndex: result.authorizingInputIndex,
            evaluationHeight: null,
            authorizationContext: null,
            authorizationDecisions: [],
            diagnostics: {
              publicKeyHex: result.publicKeyHex,
              publicKeyHashHex: result.publicKeyHashHex,
              signatureWithHashTypeHex: result.signatureWithHashTypeHex,
              sighashByte: result.sighashByte,
              trustModel: result.trustModel
            }
          },
          attemptDiagnostics: {}
        };
      }

      return {
        requestedTxid,
        resultStatus: result.status,
        transaction: result.transaction,
        tipHeight,
        verificationRecord: {
          ...tm0MemoColumns(result),
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
          ...tm0MemoColumns(result),
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
          ...emptyRecord(result.status, result.protocol),
          candidateOutputIndex: result.candidate.outputIndex,
          candidatePushIndex: result.protocol === "TM0" ? result.candidate.pushIndex : null,
          diagnostics: {
            protocolError: {
              code: result.protocolError.code,
              message: result.protocolError.message
            },
            candidate: locationFromResult(result.protocol, result.candidate)
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
            candidates: result.candidates.map(locationFromCandidate)
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
          candidate: locationFromResult("TM0", result.candidate),
          memo: tm0MemoDiagnostic(result)
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
          candidate: locationFromResult("TM0", result.candidate),
          memo: tm0MemoDiagnostic(result)
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

function tm0MemoColumns(
  result: Extract<VerificationResult, { status: "VERIFIED" | "UNAUTHORIZED"; protocol: "TM0" }>
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
    protocol: "TM0",
    protocolVersion: result.memo.version,
    eventType: result.memo.type,
    profileCode: result.memo.profile,
    payload: result.memo.payload,
    byteLength: result.memo.byteLength,
    candidateOutputIndex: result.candidate.outputIndex,
    candidatePushIndex: result.candidate.pushIndex
  };
}

function tm0MemoDiagnostic(
  result: Extract<VerificationResult, { memo: unknown; protocol: "TM0" }>
): unknown {
  return {
    protocol: "TM0",
    protocolVersion: result.memo.version,
    eventType: result.memo.type,
    profileCode: result.memo.profile,
    payload: result.memo.payload,
    byteLength: result.memo.byteLength
  };
}

function emptyRecord(
  status: DurableVerificationStatus,
  protocol: StoredMemoProtocol = "TM0"
): MappedVerificationRecord {
  return {
    status,
    protocol,
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

function locationFromCandidate(candidate: MemoCandidate): CandidateLocationDto {
  return locationFromResult(candidate.protocol, candidate.location);
}

function locationFromResult(
  protocol: StoredMemoProtocol,
  candidate: { readonly outputIndex: number; readonly pushIndex?: number }
): CandidateLocationDto {
  if (protocol === "TM1") {
    return {
      protocol: "TM1",
      outputIndex: candidate.outputIndex
    };
  }
  if (candidate.pushIndex === undefined) {
    throw new Error("TM0 candidate location requires pushIndex.");
  }
  return {
    protocol: "TM0",
    outputIndex: candidate.outputIndex,
    pushIndex: candidate.pushIndex
  };
}

function authorizationDecisions(
  decisions: readonly Extract<VerificationResult, { status: "VERIFIED" | "UNAUTHORIZED"; protocol: "TM0" }>["authorizationDecisions"][number][]
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
