import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isTm1CandidateScript } from "../../packages/protocol/src/index.ts";
import { classifyDispatchChange, type LabCryptoEvidence } from "./sec17-experimental-dispatch.ts";
import { coexistenceMatrixRows, type CoexistenceMatrixRow } from "./sec17-coexistence-rows.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function rowsByPolarity(rows: readonly CoexistenceMatrixRow[], change: string): CoexistenceMatrixRow[] {
  return rows.filter((row) => row.change === change);
}

function changeInput(row: CoexistenceMatrixRow, labEvidence?: LabCryptoEvidence) {
  const input = {
    beforeCandidates: row.beforeCandidates,
    afterCandidates: row.afterCandidates,
    dropped: row.dropped,
    internalDiagnosis: row.internalDiagnosis,
    beforeStatus: row.beforeStatus,
    afterStatus: row.afterStatus,
    beforeCode: row.beforeCode,
    afterCode: row.afterCode,
    inputCount: row.inputCount,
    socialEventCredited: row.socialEventCredited,
    settlement: row.settlement,
    designatedAuthorIndex: row.lab.authorInputIndex
  };
  if (labEvidence === undefined) {
    return input;
  }
  return { ...input, labEvidence };
}

describe("SEC-17 laboratory coexistence of TMM and a signed TM1 POST", () => {
  const rows = coexistenceMatrixRows();
  const fixture = readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-coexistence.json"), "utf8");

  it("regenerates from the canonical signer and the frozen eMPP container", () => {
    execFileSync(process.execPath, ["tests/protocol/generate-sec17-coexistence-fixtures.mjs", "--check"], {
      cwd: REPO_ROOT
    });
    expect(fixture).toContain("\"chronikValidated\": false");
    expect(fixture).toContain("NOT_DEMONSTRATED");
    expect(fixture).not.toContain("\"privateKey\"");
    expect(fixture).not.toContain("privateKeyHex");
  });

  it("accepts laboratory authorship only for an independently verified signature", () => {
    const proven = rowsByPolarity(rows, "AUTHORIZED_B_LAB_CRYPTO");
    expect(proven.map((row) => row.id)).toEqual([
      "coex-schnorr-author0-sighash-41",
      "coex-schnorr-author1-sighash-41",
      "coex-ecdsa-author0-sighash-41",
      "coex-ecdsa-author2-sighash-c1"
    ]);
    for (const row of proven) {
      expect(row.beforeStatus).toBe("MULTIPLE_MEMOS");
      expect(row.afterCandidates).toEqual([{ protocol: "TM1", outputIndex: 1, pushIndex: null }]);
      expect(row.dropped).toEqual([{ protocol: "TM0", outputIndex: 0, pushIndex: 2, reason: "STRUCTURAL_TMM" }]);
      expect(row.internalDiagnosis).toContain("TMM_STRUCTURALLY_VALID");
      expect(row.coreParseCodes[0]).toBe("INVALID_MARKER");
      expect(row.lab).toMatchObject({
        source: "synthetic-fixture",
        chronikValidated: false,
        networkValidity: "NOT_DEMONSTRATED",
        tipSettlement: "NOT_DEMONSTRATED",
        structuralPost: true,
        cryptographicAuthorship: "LAB_VALID",
        independentStage: "cryptographic-signature",
        independentErrorCode: null,
        productionBeforeStatus: "MULTIPLE_MEMOS",
        productionStatus: "VERIFIED_TM1",
        productionTrustModel: "trusted-chronik",
        appliedAsPostAuthorship: true,
        preimageAgreesWithLibrary: true
      });
      expect([0x41, 0xc1]).toContain(row.lab.sighashByte);
      expect(row.authorship).toBe("LAB_CRYPTOGRAPHIC");
      expect(row.settlement).toBe("PENDING");
      expect(row.socialEventCredited).toBe(false);
      expect(classifyDispatchChange(changeInput(row))).toBe("BLOCKED");
      const unbound = { ...row.lab, chronikValidated: true } as unknown as LabCryptoEvidence;
      expect(classifyDispatchChange(changeInput(row, unbound))).toBe("BLOCKED");
    }
    const author0 = proven[0];
    const author2 = proven[3];
    expect(author0?.lab).toMatchObject({ signatureAlgorithm: "schnorr", authorInputIndex: 0, sighashByte: 0x41 });
    expect(proven[1]?.lab).toMatchObject({ signatureAlgorithm: "schnorr", authorInputIndex: 1, sighashByte: 0x41 });
    expect(proven[2]?.lab).toMatchObject({ signatureAlgorithm: "ecdsa", authorInputIndex: 0, sighashByte: 0x41 });
    expect(author2?.lab).toMatchObject({ signatureAlgorithm: "ecdsa", authorInputIndex: 2, sighashByte: 0xc1 });
  });

  it("does not grant authorship when the signature, prevout, author index, or committed output is altered", () => {
    const unproven = rowsByPolarity(rows, "B_TRUSTED_CHRONIK_UNPROVEN");
    expect(unproven.map((row) => row.id)).toEqual([
      "coex-negative-signature",
      "coex-negative-prevout-outpoint",
      "coex-negative-prevout-amount",
      "coex-negative-author-index",
      "coex-negative-committed-output",
      "coex-negative-committed-empp"
    ]);
    for (const row of unproven) {
      expect(row.beforeStatus).toBe("MULTIPLE_MEMOS");
      expect(row.afterStatus).toBe("VERIFIED_TM1");
      expect(row.authorship).toBe("NOT_DEMONSTRATED");
      expect(row.lab.cryptographicAuthorship).toBe("LAB_REJECTED");
      expect(row.lab.productionTrustModel).toBe("trusted-chronik");
      expect(row.lab.appliedAsPostAuthorship).toBe(false);
      expect(row.lab.networkValidity).toBe("NOT_DEMONSTRATED");
      expect(row.lab.tipSettlement).toBe("NOT_DEMONSTRATED");
      expect(row.socialEventCredited).toBe(false);
    }
    const structural = rows.filter((row) => row.change === "AUTHORIZED_B");
    expect(structural.map((row) => row.id)).toEqual([
      "coex-negative-prevout-script",
      "coex-negative-author-index-out-of-range"
    ]);
    expect(structural[0]?.afterCode).toBe("INVALID_AUTHOR_SIGNATURE");
    expect(structural[0]?.lab.independentStage).toBe("pubkey-hash-match");
    expect(structural[1]?.afterCode).toBe("AUTHOR_INPUT_OUT_OF_RANGE");
    expect(structural[1]?.lab.independentStage).toBe("author-index");
    for (const row of structural) {
      expect(row.authorship).toBe("NOT_DEMONSTRATED");
      expect(row.lab.cryptographicAuthorship).toBe("LAB_REJECTED");
      expect(row.lab.appliedAsPostAuthorship).toBe(false);
    }
  });

  it("keeps MULTIPLE_MEMOS when a real second memo remains, even if one signature verifies", () => {
    const mixed = rows.find((row) => row.id === "coex-control-tm0-and-tm1");
    const duplicate = rows.find((row) => row.id === "coex-control-two-tm1");
    expect(mixed?.change).toBe("AUTHORIZED_A");
    expect(duplicate?.change).toBe("AUTHORIZED_A");
    expect(mixed?.beforeStatus).toBe("MULTIPLE_MEMOS");
    expect(mixed?.afterStatus).toBe("MULTIPLE_MEMOS");
    expect(duplicate?.afterStatus).toBe("MULTIPLE_MEMOS");
    expect(mixed?.authorship).toBe("NOT_DEMONSTRATED");
    expect(duplicate?.authorship).toBe("NOT_DEMONSTRATED");
    expect(mixed?.lab.cryptographicAuthorship).toBe("LAB_VALID");
    expect(mixed?.lab.appliedAsPostAuthorship).toBe(false);
    expect(duplicate?.afterCandidates.filter((candidate) => candidate.protocol === "TM1")).toHaveLength(2);
    if (mixed !== undefined) {
      expect(classifyDispatchChange(changeInput(mixed, {
        ...mixed.lab,
        appliedAsPostAuthorship: true
      }))).toBe("AUTHORIZED_A");
    }
    const empp = readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json"), "utf8");
    const script = JSON.parse(empp).cases.find((item: { id: string }) => item.id === "alp-send-plus-one-tmm").outputs[0].scriptHex as string;
    expect(isTm1CandidateScript(Uint8Array.from(Buffer.from(script, "hex")))).toBe(false);
  });
});
