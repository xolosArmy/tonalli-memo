import type { ChronikTransactionAdapter, Token } from "@tonalli-memo/chronik";
import { isValidScriptUtxosResponse } from "@tonalli-memo/chronik";

export type AttachmentOwnershipStatus = "VERIFIED_AT_INDEXING" | "UNVERIFIED";

export type AttachmentOwnershipReason =
  | "token-owned-and-verified-nft1-child"
  | "token-not-owned-or-not-valid-nft1-child"
  | "chronik-unavailable"
  | "invalid-chronik-response";

export interface AttachmentOwnershipResult {
  readonly status: AttachmentOwnershipStatus;
  readonly checkedAt: number;
  readonly reason: AttachmentOwnershipReason;
}

export interface VerifyNftAttachmentOptions {
  readonly chronik: Pick<ChronikTransactionAdapter, "getAddressUtxos">;
  readonly authorizingAddress: string | null;
  readonly attachedTokenId: string;
  readonly nowSeconds: number;
}

export function isMatchingNft1Child(token: Token | undefined | unknown, targetTokenId: string): boolean {
  if (token === null || typeof token !== "object") {
    return false;
  }

  const candidate = token as Partial<Token>;
  return (
    candidate.tokenId === targetTokenId &&
    candidate.tokenType !== null &&
    typeof candidate.tokenType === "object" &&
    candidate.tokenType.protocol === "SLP" &&
    candidate.tokenType.type === "SLP_TOKEN_TYPE_NFT1_CHILD" &&
    candidate.tokenType.number === 65 &&
    candidate.isMintBaton === false &&
    candidate.atoms === 1n
  );
}

/**
 * Verifies NFT ownership for TM1 attachments against Chronik UTXO set.
 *
 * Requirements:
 * - Only for VERIFIED_TM1 with an attached tokenId.
 * - Confirms authorizingAddress holds an unspent output with an NFT1 Child (atoms === 1n).
 * - Chronik failure or malformed response results in UNVERIFIED (fail closed).
 */
export async function verifyNftAttachmentOwnership(
  options: VerifyNftAttachmentOptions
): Promise<AttachmentOwnershipResult> {
  const { chronik, authorizingAddress, attachedTokenId, nowSeconds } = options;

  if (authorizingAddress === null || typeof authorizingAddress !== "string" || authorizingAddress.length === 0) {
    return {
      status: "UNVERIFIED",
      checkedAt: nowSeconds,
      reason: "token-not-owned-or-not-valid-nft1-child"
    };
  }

  if (typeof chronik.getAddressUtxos !== "function") {
    return {
      status: "UNVERIFIED",
      checkedAt: nowSeconds,
      reason: "chronik-unavailable"
    };
  }

  let utxosResponse: unknown;
  try {
    utxosResponse = await chronik.getAddressUtxos(authorizingAddress);
  } catch (error) {
    const isInvalidResponse =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === "INVALID_CHRONIK_RESPONSE";
    return {
      status: "UNVERIFIED",
      checkedAt: nowSeconds,
      reason: isInvalidResponse ? "invalid-chronik-response" : "chronik-unavailable"
    };
  }

  if (!isValidScriptUtxosResponse(utxosResponse)) {
    return {
      status: "UNVERIFIED",
      checkedAt: nowSeconds,
      reason: "invalid-chronik-response"
    };
  }

  const hasMatchingUtxo = utxosResponse.utxos.some((utxo) =>
    isMatchingNft1Child(utxo.token, attachedTokenId)
  );

  if (hasMatchingUtxo) {
    return {
      status: "VERIFIED_AT_INDEXING",
      checkedAt: nowSeconds,
      reason: "token-owned-and-verified-nft1-child"
    };
  }

  return {
    status: "UNVERIFIED",
    checkedAt: nowSeconds,
    reason: "token-not-owned-or-not-valid-nft1-child"
  };
}
