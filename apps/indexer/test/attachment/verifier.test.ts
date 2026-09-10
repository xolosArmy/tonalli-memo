import { describe, expect, it } from "vitest";
import type { ScriptUtxos, Token } from "@tonalli-memo/chronik";
import { verifyNftAttachmentOwnership } from "../../src/attachment/verifier.js";

const TOKEN_ID = "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8";
const OTHER_TOKEN_ID = "1111111111111111111111111111111111111111111111111111111111111111";
const ADDRESS = "ecash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs7ratqfx";
const NOW = 1700000000;

function validNft1ChildToken(overrides: Partial<Token> = {}): Token {
  return {
    tokenId: TOKEN_ID,
    tokenType: {
      protocol: "SLP",
      type: "SLP_TOKEN_TYPE_NFT1_CHILD",
      number: 65
    },
    atoms: 1n,
    isMintBaton: false,
    ...overrides
  };
}

function utxosResponse(tokens: (Token | undefined)[]): ScriptUtxos {
  return {
    outputScript: "76a914000000000000000000000000000000000000000088ac",
    utxos: tokens.map((token, index) => ({
      outpoint: { txid: "00".repeat(32), outIdx: index },
      blockHeight: 800000,
      isCoinbase: false,
      sats: 546n,
      isFinal: true,
      ...(token === undefined ? {} : { token })
    }))
  };
}

describe("verifyNftAttachmentOwnership", () => {
  it("verifies ownership when authorizing address owns a valid NFT1 child UTXO", async () => {
    const chronik = {
      getAddressUtxos: async () => utxosResponse([validNft1ChildToken()])
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "VERIFIED_AT_INDEXING",
      checkedAt: NOW,
      reason: "token-owned-and-verified-nft1-child"
    });
  });

  it("finds matching NFT1 child among multiple UTXOs", async () => {
    const chronik = {
      getAddressUtxos: async () =>
        utxosResponse([
          undefined,
          validNft1ChildToken({ tokenId: OTHER_TOKEN_ID }),
          validNft1ChildToken()
        ])
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result.status).toBe("VERIFIED_AT_INDEXING");
  });

  it("rejects token with isMintBaton === true", async () => {
    const chronik = {
      getAddressUtxos: async () => utxosResponse([validNft1ChildToken({ isMintBaton: true })])
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "token-not-owned-or-not-valid-nft1-child"
    });
  });

  it("rejects token with atoms !== 1n", async () => {
    const chronik0 = {
      getAddressUtxos: async () => utxosResponse([validNft1ChildToken({ atoms: 0n })])
    };
    const res0 = await verifyNftAttachmentOwnership({
      chronik: chronik0,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(res0.status).toBe("UNVERIFIED");

    const chronik2 = {
      getAddressUtxos: async () => utxosResponse([validNft1ChildToken({ atoms: 2n })])
    };
    const res2 = await verifyNftAttachmentOwnership({
      chronik: chronik2,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(res2.status).toBe("UNVERIFIED");
  });

  it("rejects token with non-NFT1-child type", async () => {
    const chronik = {
      getAddressUtxos: async () =>
        utxosResponse([
          validNft1ChildToken({
            tokenType: {
              protocol: "SLP" as const,
              type: "SLP_TOKEN_TYPE_FUNGIBLE" as const,
              number: 1
            }
          })
        ])
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result.status).toBe("UNVERIFIED");
  });

  it("rejects token with different tokenId", async () => {
    const chronik = {
      getAddressUtxos: async () => utxosResponse([validNft1ChildToken({ tokenId: OTHER_TOKEN_ID })])
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result.status).toBe("UNVERIFIED");
  });

  it("returns UNVERIFIED when authorizingAddress is null or empty", async () => {
    const chronik = {
      getAddressUtxos: async () => utxosResponse([validNft1ChildToken()])
    };

    const resNull = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: null,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(resNull).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "token-not-owned-or-not-valid-nft1-child"
    });

    const resEmpty = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: "",
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(resEmpty.status).toBe("UNVERIFIED");
  });

  it("fails closed when Chronik throws an error", async () => {
    const chronik = {
      getAddressUtxos: async () => {
        throw new Error("Connection refused");
      }
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "chronik-unavailable"
    });
  });

  it("handles Chronik error with INVALID_CHRONIK_RESPONSE code", async () => {
    const error = new Error("Bad response") as Error & { code: string };
    error.code = "INVALID_CHRONIK_RESPONSE";
    const chronik = {
      getAddressUtxos: async () => {
        throw error;
      }
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });
  });

  it("returns UNVERIFIED with invalid-chronik-response when response is null", async () => {
    const chronik = {
      getAddressUtxos: async () => null as unknown as ScriptUtxos
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });
  });

  it("returns UNVERIFIED with invalid-chronik-response when response has no utxos", async () => {
    const chronik = {
      getAddressUtxos: async () => ({ outputScript: "76a914..." }) as unknown as ScriptUtxos
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });
  });

  it("returns UNVERIFIED with invalid-chronik-response when utxos is not an array", async () => {
    const chronik = {
      getAddressUtxos: async () => ({ utxos: "not-an-array" }) as unknown as ScriptUtxos
    };

    const result = await verifyNftAttachmentOwnership({
      chronik,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });

    expect(result).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });
  });

  it("returns UNVERIFIED with invalid-chronik-response when utxos contains null or malformed entries", async () => {
    // null entry in utxos
    const chronikNullEntry = {
      getAddressUtxos: async () => ({ utxos: [null] }) as unknown as ScriptUtxos
    };
    const resNull = await verifyNftAttachmentOwnership({
      chronik: chronikNullEntry,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(resNull).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });

    // entry without outpoint
    const chronikNoOutpoint = {
      getAddressUtxos: async () => ({ utxos: [{ blockHeight: 100 }] }) as unknown as ScriptUtxos
    };
    const resNoOutpoint = await verifyNftAttachmentOwnership({
      chronik: chronikNoOutpoint,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(resNoOutpoint).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });

    // entry with null token
    const chronikNullToken = {
      getAddressUtxos: async () => ({
        utxos: [{ outpoint: { txid: "00".repeat(32), outIdx: 0 }, token: null }]
      }) as unknown as ScriptUtxos
    };
    const resNullToken = await verifyNftAttachmentOwnership({
      chronik: chronikNullToken,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(resNullToken).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });

    // entry with malformed token
    const chronikBadToken = {
      getAddressUtxos: async () => ({
        utxos: [{ outpoint: { txid: "00".repeat(32), outIdx: 0 }, token: { tokenId: 123 } }]
      }) as unknown as ScriptUtxos
    };
    const resBadToken = await verifyNftAttachmentOwnership({
      chronik: chronikBadToken,
      authorizingAddress: ADDRESS,
      attachedTokenId: TOKEN_ID,
      nowSeconds: NOW
    });
    expect(resBadToken).toEqual({
      status: "UNVERIFIED",
      checkedAt: NOW,
      reason: "invalid-chronik-response"
    });
  });
});
