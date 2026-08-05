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
