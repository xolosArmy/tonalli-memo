import type {
  ApiErrorDto,
  CandidateLocation,
  FeedItem,
  FeedResponse,
  StoredMemoProtocol,
  StoredVerification,
  Tm1Authorship,
  TransactionSummary,
  TxResponse,
  VerificationStatus
} from "./types";

const TXID_PATTERN = /^[0-9a-f]{64}$/u;
const HASH160_PATTERN = /^[0-9a-f]{40}$/u;
const VERIFICATION_STATUSES = new Set<VerificationStatus>(["VERIFIED", "UNAUTHORIZED", "NO_MEMO", "INVALID_MEMO", "MULTIPLE_MEMOS"]);

export function isApiErrorDto(value: unknown): value is ApiErrorDto {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }
  return typeof value.error.code === "string" && typeof value.error.message === "string";
}

export function isFeedResponse(value: unknown): value is FeedResponse {
  if (!isRecord(value) || !Array.isArray(value.items) || !isIntegerInRange(value.limit, 1, 100)) {
    return false;
  }
  return value.items.every(isFeedItem);
}

export function isTxResponse(value: unknown): value is TxResponse {
  if (!isRecord(value) || !isTransactionSummary(value.transaction)) {
    return false;
  }
  return value.verification === null || (isStoredVerification(value.verification) && value.verification.txid === value.transaction.txid);
}

function isFeedItem(value: unknown): value is FeedItem {
  if (!isRecord(value) || !isTransactionSummary(value.transaction) || !isStoredVerification(value.verification)) {
    return false;
  }
  return value.verification.status === "VERIFIED" && value.verification.txid === value.transaction.txid;
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
  if (!isRecord(value) || !isStoredMemoProtocol(value.protocol) || !isVerificationStatus(value.status)) {
    return false;
  }

  const candidateValid = value.candidate === null || isCandidateLocation(value.candidate, value.protocol);
  const authorshipValid =
    value.protocol === "TM1" && value.status === "VERIFIED"
      ? isTm1Authorship(value.tm1Authorship)
      : value.tm1Authorship === null;

  return (
    typeof value.txid === "string" &&
    TXID_PATTERN.test(value.txid) &&
    isNullableSafeInteger(value.protocolVersion) &&
    isNullableString(value.eventType) &&
    isNullableString(value.profileCode) &&
    isNullableString(value.payload) &&
    isNullableSafeInteger(value.byteLength) &&
    candidateValid &&
    isNullableString(value.authorizingAddress) &&
    isNullableSafeInteger(value.authorizingInputIndex) &&
    isNullableSafeInteger(value.evaluationHeight) &&
    authorshipValid &&
    isSafeInteger(value.firstIndexedAt) &&
    isSafeInteger(value.lastVerifiedAt)
  );
}

function isCandidateLocation(value: unknown, protocol: StoredMemoProtocol): value is CandidateLocation {
  if (!isRecord(value) || value.protocol !== protocol || !isSafeInteger(value.outputIndex)) {
    return false;
  }
  if (protocol === "TM0") {
    return isSafeInteger(value.pushIndex);
  }
  return !("pushIndex" in value);
}

function isTm1Authorship(value: unknown): value is Tm1Authorship {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    typeof value.publicKeyHashHex === "string" &&
    HASH160_PATTERN.test(value.publicKeyHashHex) &&
    (value.sighashByte === 65 || value.sighashByte === 193) &&
    value.trustModel === "trusted-chronik"
  );
}

function isStoredMemoProtocol(value: unknown): value is StoredMemoProtocol {
  return value === "TM0" || value === "TM1";
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

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return isSafeInteger(value) && value >= min && value <= max;
}

function isVerificationStatus(value: unknown): value is VerificationStatus {
  return typeof value === "string" && VERIFICATION_STATUSES.has(value as VerificationStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
