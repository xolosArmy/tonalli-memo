import { describe, expect, it } from "vitest";
import {
  decodeStoredTm1Authorship,
  InvalidStoredTm1AuthorshipError
} from "../../src/api/tm1-authorship.js";

const validDiagnostics = {
  publicKeyHex: `02${"11".repeat(32)}`,
  publicKeyHashHex: "22".repeat(20),
  signatureWithHashTypeHex: `${"33".repeat(64)}41`,
  sighashByte: 0x41,
  trustModel: "trusted-chronik"
} as const;

describe("decodeStoredTm1Authorship", () => {
  it("returns only the approved public read model", () => {
    expect(decodeStoredTm1Authorship(validDiagnostics)).toEqual({
      publicKeyHashHex: "22".repeat(20),
      sighashByte: 0x41,
      trustModel: "trusted-chronik"
    });
  });

  it.each([
    null,
    {},
    { ...validDiagnostics, publicKeyHashHex: "22" },
    { ...validDiagnostics, publicKeyHashHex: "GG".repeat(20) },
    { ...validDiagnostics, publicKeyHex: "02" },
    { ...validDiagnostics, signatureWithHashTypeHex: "00" },
    { ...validDiagnostics, sighashByte: 0x42 },
    { ...validDiagnostics, signatureWithHashTypeHex: `${"33".repeat(64)}c1` },
    { ...validDiagnostics, trustModel: "independent" },
    { ...validDiagnostics, extra: true }
  ])("rejects malformed or inconsistent persisted diagnostics", (value) => {
    expect(() => decodeStoredTm1Authorship(value)).toThrow(InvalidStoredTm1AuthorshipError);
  });

  it("accepts the alternate allowed sighash when its serialized suffix matches", () => {
    expect(
      decodeStoredTm1Authorship({
        ...validDiagnostics,
        signatureWithHashTypeHex: `${"33".repeat(64)}c1`,
        sighashByte: 0xc1
      })
    ).toMatchObject({ sighashByte: 0xc1 });
  });
});
