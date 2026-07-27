import type { ApiErrorDto, CandidateLocation, FeedItem, FeedResponse, StoredVerification, TransactionSummary, TxResponse } from "./types";

const TXID_PATTERN = /^[0-9a-f]{64}$/u;

export function isApiErrorDto(value: unknown): value is ApiErrorDto {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }
  return typeof value.error.code === "string" && typeof value.error.message === "string";
}

export function isFeedResponse(value: unknown): value is FeedResponse {
  if (!isRecord(value) || !Array.isArray(value.items) || !isSafeInteger(value.limit)) {
    return false;
  }
  return value.items.every(isFeedItem);
}

export function isTxResponse(value: unknown): value is TxResponse {
  if (!isRecord(value) || !isTransactionSummary(value.transaction)) {
    return false;
  }
  return value.verification === null || isStoredVerification(value.verification);
}

function isFeedItem(value: unknown): value is FeedItem {
  return isRecord(value) && isTransactionSummary(value.transaction) && isStoredVerification(value.verification);
}

function isTransactionSummary(value: unknown): value is TransactionSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.txid === "string" &&
    TXID_PATTERN.test(value.txid) &&
    (value.chainStatus === "confirmed" || value.chainStatus === "unconfirmed") &&
    typeof value.isCoinbase === "boolean" &&
    typeof value.isFinal === "boolean" &&
    isNullableSafeInteger(value.blockHeight) &&
    isNullableString(value.blockHash) &&
    isNullableSafeInteger(value.blockTimestamp) &&
    isNullableSafeInteger(value.firstSeenAt) &&
    isSafeInteger(value.firstIndexedAt) &&
    isSafeInteger(value.updatedAt)
  );
}

function isStoredVerification(value: unknown): value is StoredVerification {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.txid === "string" &&
    TXID_PATTERN.test(value.txid) &&
    typeof value.status === "string" &&
    isNullableSafeInteger(value.protocolVersion) &&
    isNullableString(value.eventType) &&
    isNullableString(value.profileCode) &&
    isNullableString(value.payload) &&
    isNullableSafeInteger(value.byteLength) &&
    (value.candidate === null || isCandidateLocation(value.candidate)) &&
    isNullableString(value.authorizingAddress) &&
    isNullableSafeInteger(value.authorizingInputIndex) &&
    isNullableSafeInteger(value.evaluationHeight) &&
    isSafeInteger(value.firstIndexedAt) &&
    isSafeInteger(value.lastVerifiedAt)
  );
}

function isCandidateLocation(value: unknown): value is CandidateLocation {
  return isRecord(value) && isSafeInteger(value.outputIndex) && isSafeInteger(value.pushIndex);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || isSafeInteger(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
