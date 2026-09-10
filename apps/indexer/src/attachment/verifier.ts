import type { ChronikTransactionAdapter, ScriptUtxos, Token } from "@tonalli-memo/chronik";

export type AttachmentOwnershipStatus = "VERIFIED_AT_INDEXING" | "UNVERIFIED";

export type AttachmentOwnershipReason =
  | "token-owned-and-verified-nft1-child"
  | "token-not-owned-or-not-valid-nft1-child"
  | "chronik-unavailable";

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

export function isMatchingNft1Child(token: Token | undefined, targetTokenId: string): boolean {
  if (token === undefined) {
    return false;
  }

  return (
    token.tokenId === targetTokenId &&
    token.tokenType?.protocol === "SLP" &&
    token.tokenType?.type === "SLP_TOKEN_TYPE_NFT1_CHILD" &&
    token.tokenType?.number === 65 &&
    token.isMintBaton === false &&
    token.atoms === 1n
  );
}

/**
 * Verifies NFT ownership for TM1 attachments against Chronik UTXO set.
 *
 * Requirements:
 * - Only for VERIFIED_TM1 with an attached tokenId.
 * - Confirms authorizingAddress holds an unspent output with an NFT1 Child (atoms === 1n).
 * - Chronik failure results in UNVERIFIED (fail closed).
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

  let utxosResponse: ScriptUtxos;
  try {
    utxosResponse = await chronik.getAddressUtxos(authorizingAddress);
  } catch {
    return {
      status: "UNVERIFIED",
      checkedAt: nowSeconds,
      reason: "chronik-unavailable"
    };
  }

  const hasMatchingUtxo = Array.isArray(utxosResponse?.utxos) && utxosResponse.utxos.some((utxo) =>
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
