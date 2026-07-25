import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import type { MemoCandidate, VerificationResult } from "@tonalli-memo/verification";
import type { FeedItemDto, PublicVerificationResultDto, StoredVerificationDto, TransactionSummaryDto } from "./dto.js";
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
    protocolVersion: row.protocolVersion,
    eventType: row.eventType,
    profileCode: row.profileCode,
    payload: row.payload,
    byteLength: row.byteLength,
    candidate:
      row.candidateOutputIndex === null || row.candidatePushIndex === null
        ? null
        : { outputIndex: row.candidateOutputIndex, pushIndex: row.candidatePushIndex },
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
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicMemo(result),
        candidate: location(result.candidate),
        authorizingAddress: result.authorizingAddress,
        authorizingInputIndex: result.authorizingInputIndex,
        evaluationHeight: result.evaluationHeight
      };
    case "UNAUTHORIZED":
      return {
        ...base,
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicMemo(result),
        candidate: location(result.candidate),
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
        transaction: mapNormalizedTransaction(result.transaction),
        candidate: location(result.candidate),
        error: {
          code: result.protocolError.code,
          message: result.protocolError.message
        }
      };
    case "MULTIPLE_MEMOS":
      return {
        ...base,
        transaction: mapNormalizedTransaction(result.transaction),
        candidates: result.candidates.map((candidate) => location(candidate.location))
      };
    case "MEMPOOL_TIP_REQUIRED":
      return {
        ...base,
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicMemo(result),
        candidate: location(result.candidate)
      };
    case "INVALID_VERIFICATION_CONTEXT":
      return {
        ...base,
        transaction: mapNormalizedTransaction(result.transaction),
        memo: publicMemo(result),
        candidate: location(result.candidate),
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

function publicMemo(result: Extract<VerificationResult, { memo: unknown }>): NonNullable<PublicVerificationResultDto["memo"]> {
  return {
    protocolVersion: result.memo.version,
    eventType: result.memo.type,
    profileCode: result.memo.profile,
    payload: result.memo.payload,
    byteLength: result.memo.byteLength
  };
}

function location(candidate: MemoCandidate["location"]): { readonly outputIndex: number; readonly pushIndex: number } {
  return {
    outputIndex: candidate.outputIndex,
    pushIndex: candidate.pushIndex
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled verification status: ${JSON.stringify(value)}`);
}
