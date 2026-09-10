import { describe, expect, it } from "vitest";
import { mapStoredVerification } from "../../src/api/mapper.js";
import type { StoredVerificationRecord } from "../../src/db/types.js";

const TXID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function row(overrides: Partial<StoredVerificationRecord> = {}): StoredVerificationRecord {
  return {
    txid: TXID,
    verificationStatus: "VERIFIED",
    protocol: "TM0",
    protocolVersion: 0,
    eventType: "p",
    profileCode: "xa",
    payload: "memo",
    byteLength: 4,
    candidateOutputIndex: 0,
    candidatePushIndex: 0,
    authorizingAddress: "ecash:qptestaddress0000000000000000000000000000000",
    authorizingInputIndex: 0,
    evaluationHeight: 900001,
    authorizationContextJson: null,
    authorizationDecisionsJson: "[]",
    diagnosticsJson: "{}",
    authorizationContext: null,
    authorizationDecisions: [],
    diagnostics: {},
    firstIndexedAt: 1,
    lastVerifiedAt: 2,
    attachedTokenId: null,
    attachmentOwnershipStatus: null,
    attachmentCheckedAt: null,
    ...overrides
  };
}

const tm1Diagnostics = {
  publicKeyHex: `02${"11".repeat(32)}`,
  publicKeyHashHex: "22".repeat(20),
  signatureWithHashTypeHex: `${"33".repeat(64)}41`,
  sighashByte: 0x41,
  trustModel: "trusted-chronik"
} as const;

describe("mapStoredVerification TM1 authorship", () => {
  it("returns null for TM0 records", () => {
    expect(mapStoredVerification(row()).tm1Authorship).toBeNull();
  });

  it("exposes only approved fields for verified TM1 records", () => {
    expect(
      mapStoredVerification(
        row({
          protocol: "TM1",
          protocolVersion: 1,
          eventType: "POST",
          profileCode: null,
          candidatePushIndex: null,
          evaluationHeight: null,
          diagnostics: tm1Diagnostics,
          diagnosticsJson: JSON.stringify(tm1Diagnostics)
        })
      ).tm1Authorship
    ).toEqual({
      publicKeyHashHex: "22".repeat(20),
      sighashByte: 0x41,
      trustModel: "trusted-chronik"
    });
  });

  it("fails closed for corrupt verified TM1 diagnostics", () => {
    expect(() =>
      mapStoredVerification(
        row({
          protocol: "TM1",
          protocolVersion: 1,
          eventType: "POST",
          profileCode: null,
          candidatePushIndex: null,
          evaluationHeight: null,
          diagnostics: { ...tm1Diagnostics, publicKeyHashHex: "bad" }
        })
      )
    ).toThrow("Stored TM1 authorship diagnostics are invalid.");
  });

  it("does not expose authorship for invalid TM1 records", () => {
    expect(
      mapStoredVerification(
        row({
          verificationStatus: "INVALID_MEMO",
          protocol: "TM1",
          protocolVersion: null,
          eventType: null,
          profileCode: null,
          payload: null,
          byteLength: null,
          candidatePushIndex: null,
          authorizingAddress: null,
          authorizingInputIndex: null,
          evaluationHeight: null,
          diagnostics: {}
        })
      ).tm1Authorship
    ).toBeNull();
  });
});

describe("mapStoredVerification attachments and displayPayload", () => {
  const tokenId = "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8";
  const rawPayload = `@nft1:${tokenId}\nHello NFT attachment!`;

  it("maps verified attachment and separates displayPayload from canonical payload", () => {
    const dto = mapStoredVerification(
      row({
        payload: rawPayload,
        attachedTokenId: tokenId,
        attachmentOwnershipStatus: "VERIFIED_AT_INDEXING",
        attachmentCheckedAt: 1234
      })
    );
    expect(dto.payload).toBe(rawPayload);
    expect(dto.displayPayload).toBe("Hello NFT attachment!");
    expect(dto.attachment).toEqual({
      type: "NFT",
      tokenId,
      ownership: "VERIFIED_AT_INDEXING"
    });
  });

  it("maps unverified attachment and separates displayPayload", () => {
    const dto = mapStoredVerification(
      row({
        payload: rawPayload,
        attachedTokenId: tokenId,
        attachmentOwnershipStatus: "UNVERIFIED",
        attachmentCheckedAt: 1234
      })
    );
    expect(dto.payload).toBe(rawPayload);
    expect(dto.displayPayload).toBe("Hello NFT attachment!");
    expect(dto.attachment).toEqual({
      type: "NFT",
      tokenId,
      ownership: "UNVERIFIED"
    });
  });

  it("returns displayPayload identical to payload and attachment null when no attachment", () => {
    const dto = mapStoredVerification(
      row({
        payload: "Standard plain memo",
        attachedTokenId: null,
        attachmentOwnershipStatus: null,
        attachmentCheckedAt: null
      })
    );
    expect(dto.payload).toBe("Standard plain memo");
    expect(dto.displayPayload).toBe("Standard plain memo");
    expect(dto.attachment).toBeNull();
  });

  it("returns displayPayload identical to payload and attachment null for pre-v4/migrated records", () => {
    const dto = mapStoredVerification(
      row({
        payload: rawPayload,
        attachedTokenId: null,
        attachmentOwnershipStatus: null,
        attachmentCheckedAt: null
      })
    );
    expect(dto.payload).toBe(rawPayload);
    expect(dto.displayPayload).toBe(rawPayload);
    expect(dto.attachment).toBeNull();
  });
});
