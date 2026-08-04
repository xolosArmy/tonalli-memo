import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import type { MemoCandidate, VerificationResult } from "@tonalli-memo/verification";
import type {
  CandidateLocationDto,
  FeedItemDto,
  PublicMemoDto,
  PublicVerificationResultDto,
  StoredVerificationDto,
  TransactionSummaryDto
} from "./dto.js";
import type { StoredTransactionRow, StoredVerificationRecord, VerifiedFeedRow } from "../db/types.js";

export function mapTransactionSummary(row: StoredTransactionRow): TransactionSummaryDto {
  return {
    txid: row.txid,
    chainStatus: row.chainStatus,
    isCoinbase: row.isCoinbase,
    isFinal: row.isFinal,
    blockHeight: row.blockHeight,
    blockHash: row.blockHash,
    blockTimestamp: row.blockTimestamp,
    firstSeenAt: row.firstSeenAt,
    firstIndexedAt: row.firstIndexedAt,
    updatedAt: row.updatedAt
  };
}

export function mapStoredVerification(row: StoredVerificationRecord): StoredVerificationDto {
  return {
    txid: row.txid,
    status: row.verificationStatus,
    protocol: row.protocol,
    protocolVersion: row.protocolVersion,
    eventType: row.eventType,
    profileCode: row.profileCode,
    payload: row.payload,
    byteLength: row.byteLength,
    candidate: storedCandidate(row),
    authorizingAddress: row.authorizingAddress,
    authorizingInputIndex: row.authorizingInputIndex,
    evaluationHeight: row.evaluationHeight,
    firstIndexedAt: row.firstIndexedAt,
    lastVerifiedAt: row.lastVerifiedAt
  };
}

export function mapVerifiedFeedItem(row: VerifiedFeedRow): FeedItemDto {
  return {
    transaction: mapTransactionSummary(row.transaction),
    verification: mapStoredVerification(row.verification)
  };
}

export function mapVerificationResult(result: VerificationResult): PublicVerificationResultDto {
  const base = {
    status: result.status,
    txid: result.txid
  };

  switch (result.status) {
    case "VERIFIED":
      return {
        ...base,
        protocol: "TM0",
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicTm0Memo(result),
        candidate: locationFromResult("TM0", result.candidate),
        authorizingAddress: result.authorizingAddress,
        authorizingInputIndex: result.authorizingInputIndex,
        evaluationHeight: result.evaluationHeight
      };
    case "VERIFIED_TM1":
      return {
        ...base,
        protocol: "TM1",
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicTm1Memo(result),
        candidate: locationFromResult("TM1", result.candidate),
        authorizingAddress: result.authorizingAddress,
        authorizingInputIndex: result.authorizingInputIndex
      };
    case "UNAUTHORIZED":
      return {
        ...base,
        protocol: "TM0",
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicTm0Memo(result),
        candidate: locationFromResult("TM0", result.candidate),
        evaluationHeight: result.evaluationHeight
      };
    case "NO_MEMO":
      return {
        ...base,
        transaction: mapNormalizedTransaction(result.transaction)
      };
    case "INVALID_MEMO":
      return {
        ...base,
        protocol: "TM0",
        transaction: mapNormalizedTransaction(result.transaction),
        candidate: locationFromResult("TM0", result.candidate),
        error: {
          code: result.protocolError.code,
          message: result.protocolError.message
        }
      };
    case "INVALID_TM1":
      return {
        ...base,
        protocol: "TM1",
        transaction: mapNormalizedTransaction(result.transaction),
        candidate: locationFromResult("TM1", result.candidate),
        error: {
          code: result.protocolError.code,
          message: result.protocolError.message
        }
      };
    case "MULTIPLE_MEMOS":
      return {
        ...base,
        transaction: mapNormalizedTransaction(result.transaction),
        candidates: result.candidates.map(locationFromCandidate)
      };
    case "MEMPOOL_TIP_REQUIRED":
      return {
        ...base,
        protocol: "TM0",
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicTm0Memo(result),
        candidate: locationFromResult("TM0", result.candidate)
      };
    case "INVALID_VERIFICATION_CONTEXT":
      return {
        ...base,
        protocol: "TM0",
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicTm0Memo(result),
        candidate: locationFromResult("TM0", result.candidate),
        error: {
          code: result.contextError.code,
          message: result.contextError.message
        }
      };
    case "INVALID_TXID":
    case "TRANSACTION_NOT_FOUND":
    case "CHRONIK_UNAVAILABLE":
    case "INVALID_CHRONIK_RESPONSE":
      return {
        ...base,
        error: {
          code: result.sourceError.code,
          message: result.sourceError.message
        }
      };
    default:
      return assertNever(result);
  }
}

function mapNormalizedTransaction(transaction: NormalizedTransaction): TransactionSummaryDto {
  return {
    txid: transaction.txid,
    chainStatus: transaction.blockHeight === null ? "unconfirmed" : "confirmed",
    isCoinbase: transaction.isCoinbase,
    isFinal: transaction.isFinal,
    blockHeight: transaction.blockHeight,
    blockHash: transaction.blockHeight === null ? null : transaction.blockHash,
    blockTimestamp: transaction.blockHeight === null ? null : transaction.blockTimestamp,
    firstSeenAt: transaction.firstSeenAt,
    firstIndexedAt: 0,
    updatedAt: 0
  };
}

function publicTm0Memo(
  result: Extract<VerificationResult, { memo: unknown; status: "VERIFIED" | "UNAUTHORIZED" | "MEMPOOL_TIP_REQUIRED" | "INVALID_VERIFICATION_CONTEXT" }>
): Extract<PublicMemoDto, { protocol: "TM0" }> {
  return {
    protocol: "TM0",
    version: result.memo.version,
    eventType: result.memo.type,
    profileCode: result.memo.profile,
    payload: result.memo.payload,
    byteLength: result.memo.byteLength
  };
}

function publicTm1Memo(
  result: Extract<VerificationResult, { status: "VERIFIED_TM1" }>
): Extract<PublicMemoDto, { protocol: "TM1" }> {
  return {
    protocol: "TM1",
    version: result.memo.version,
    eventType: result.memo.eventType,
    profileCode: null,
    payload: result.memo.eventData,
    byteLength: result.memo.eventDataByteLength,
    publicKeyHashHex: result.publicKeyHashHex,
    sighashByte: result.sighashByte,
    trustModel: result.trustModel
  };
}

function locationFromCandidate(candidate: MemoCandidate): CandidateLocationDto {
  return locationFromResult(candidate.protocol, candidate.location);
}

function locationFromResult(
  protocol: "TM0" | "TM1",
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

function storedCandidate(row: StoredVerificationRecord): CandidateLocationDto | null {
  if (row.candidateOutputIndex === null) {
    return null;
  }
  if (row.protocol === "TM1") {
    return {
      protocol: "TM1",
      outputIndex: row.candidateOutputIndex
    };
  }
  if (row.candidatePushIndex === null) {
    return null;
  }
  return {
    protocol: "TM0",
    outputIndex: row.candidateOutputIndex,
    pushIndex: row.candidatePushIndex
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled verification status: ${JSON.stringify(value)}`);
}
