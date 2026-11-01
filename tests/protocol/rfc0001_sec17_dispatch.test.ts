import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizeOpReturnOutput } from "../../packages/chronik/src/op-return.ts";
import type { NormalizedInput, NormalizedTransaction } from "../../packages/chronik/src/types.ts";
import { isTm1CandidateScript, isTm1ProtocolError, parseTm1Output } from "../../packages/protocol/src/index.ts";
import { verifyNormalizedTransaction } from "../../packages/verification/src/verify-normalized.ts";
import { classifyAuthor, digestHex, txidOf } from "./canonical-tm1-independent-verify.mjs";
import { coexistenceMatrixRows } from "./sec17-coexistence-rows.ts";
import {
  classifyDispatchChange,
  dispatchSec17,
  type CandidateRef,
  type DroppedCandidate,
  type ExperimentalDispatch
} from "./sec17-experimental-dispatch.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MATRIX_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-dispatch-matrix.json");
const EVIDENCE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-SEC17-DISPATCH.md");
const PRIOR_EMPP_SHA = "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8";
const PRIOR_SEC17_SHA = "76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca";
const GOVERNANCE = "6559174591";
const LEGACY_ROW_SHA256 = "5f0a801d218a40624646a6fef7c8bfff3ebead122fdc81fecbd9288c93e4d3f2";
const D07_TXIDS = [
  "fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd",
  "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8",
  "0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150"
] as const;

interface ScriptOutput {
  outputIndex: number;
  valueSats: string | number;
  scriptHex: string;
}

interface MatrixRow {
  id: string;
  corpus: string;
  container: string;
  beforeCandidates: CandidateRef[];
  afterCandidates: CandidateRef[];
  dropped: DroppedCandidate[];
  internalDiagnosis: string[];
  beforeStatus: string;
  beforeCode: string | null;
  afterStatus: string;
  afterCode: string | null;
  change: string;
  coreParseCodes: string[];
  authorship: string;
  settlement: "PENDING";
  socialEventCredited: false;
  inputCount: number;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function transaction(txid: string, outputs: readonly ScriptOutput[], inputs: readonly NormalizedInput[] = []): NormalizedTransaction {
  return {
    txid,
    isCoinbase: false,
    inputs,
    inputAddresses: inputs.flatMap((input) => (input.address === null ? [] : [input.address])),
    opReturnOutputs: outputs
      .filter((output) => output.scriptHex.startsWith("6a"))
      .map((output) => normalizeOpReturnOutput(output.outputIndex, BigInt(output.valueSats), output.scriptHex)),
    blockHeight: 1,
    blockHash: "22".repeat(32),
    blockTimestamp: 1,
    firstSeenAt: 1,
    isFinal: true,
    rawResponse: { adapter: "sec17-experimental-dispatch" }
  };
}

function envelopeScript(payload: Uint8Array): string {
  if (payload.length <= 0x4b) {
    return Buffer.concat([Buffer.from([0x6a, payload.length]), payload]).toString("hex");
  }
  if (payload.length <= 0xff) {
    return Buffer.concat([Buffer.from([0x6a, 0x4c, payload.length]), payload]).toString("hex");
  }
  throw new Error(`Payload of ${payload.length} bytes is outside this adapter.`);
}

interface RawInput {
  scriptHex: string;
}

function parseRaw(hex: string): { inputs: RawInput[]; outputs: ScriptOutput[] } {
  const buf = Buffer.from(hex, "hex");
  let at = 4;
  const readVarint = (): number => {
    const first = buf[at];
    if (first === undefined) {
      throw new Error("Unexpected end of transaction.");
    }
    if (first < 0xfd) {
      at += 1;
      return first;
    }
    if (first === 0xfd) {
      const value = buf.readUInt16LE(at + 1);
      at += 3;
      return value;
    }
    if (first === 0xfe) {
      const value = buf.readUInt32LE(at + 1);
      at += 5;
      return value;
    }
    throw new Error("Transaction varint is larger than this adapter supports.");
  };
  const inputs: RawInput[] = [];
  const inputCount = readVarint();
  for (let index = 0; index < inputCount; index += 1) {
    at += 36;
    const scriptLength = readVarint();
    inputs.push({ scriptHex: buf.subarray(at, at + scriptLength).toString("hex") });
    at += scriptLength + 4;
  }
  const outputs: ScriptOutput[] = [];
  const outputCount = readVarint();
  for (let index = 0; index < outputCount; index += 1) {
    const valueSats = buf.readBigUInt64LE(at);
    at += 8;
    const scriptLength = readVarint();
    outputs.push({
      outputIndex: index,
      valueSats: valueSats.toString(),
      scriptHex: buf.subarray(at, at + scriptLength).toString("hex")
    });
    at += scriptLength;
  }
  return { inputs, outputs };
}

function rowFrom(id: string, corpus: string, tx: NormalizedTransaction): MatrixRow {
  const result: ExperimentalDispatch = dispatchSec17(tx);
  const change = classifyDispatchChange(result);
  return {
    id,
    corpus,
    container: result.container,
    beforeCandidates: result.beforeCandidates,
    afterCandidates: result.afterCandidates,
    dropped: result.dropped,
    internalDiagnosis: result.internalDiagnosis,
    beforeStatus: result.beforeStatus,
    beforeCode: result.beforeCode,
    afterStatus: result.afterStatus,
    afterCode: result.afterCode,
    change,
    coreParseCodes: result.coreParseCodes,
    authorship: result.authorship,
    settlement: result.settlement,
    socialEventCredited: result.socialEventCredited,
    inputCount: result.inputCount
  };
}

function collectRows(): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const empp = readJson<{ cases: Array<{ id: string; outputs: ScriptOutput[] }> }>(
    join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json")
  );
  for (const item of empp.cases) {
    rows.push(rowFrom(item.id, "empp-29", transaction("11".repeat(32), item.outputs)));
  }
  const sec17 = readJson<{ cases: Array<{ id: string; outputs: ScriptOutput[] }> }>(
    join(REPO_ROOT, "tests/fixtures/rfc0001-empp-sec17-decisions.json")
  );
  for (const item of sec17.cases) {
    rows.push(rowFrom(item.id, "sec17-21", transaction("22".repeat(32), item.outputs)));
  }

  const tm0 = readJson<{
    valid: Array<{ name: string; envelope?: string }>;
    invalid: Array<{ name: string; envelope?: string; bytes?: number[] }>;
  }>(join(REPO_ROOT, "packages/protocol/test-vectors.json"));
  for (const vector of [...tm0.valid, ...tm0.invalid]) {
    const payload = vector.envelope !== undefined
      ? Buffer.from(vector.envelope, "utf8")
      : vector.bytes !== undefined
        ? Buffer.from(vector.bytes)
        : null;
    if (payload === null) {
      continue;
    }
    rows.push(rowFrom(`tm0:${vector.name}`, "tm0", transaction("33".repeat(32), [{
      outputIndex: 0,
      valueSats: "0",
      scriptHex: envelopeScript(payload)
    }])));
  }

  const tm1 = readJson<{
    valid: Array<{ name: string; scriptHex: string }>;
    invalid: Array<{ name: string; scriptHex: string }>;
    transactionVectors: {
      valid: Array<{ name: string; outputs: ScriptOutput[] }>;
      invalid: Array<{ name: string; outputs: ScriptOutput[] }>;
    };
  }>(join(REPO_ROOT, "packages/protocol/tm1-test-vectors.json"));
  for (const vector of [...tm1.valid, ...tm1.invalid]) {
    rows.push(rowFrom(`tm1-output:${vector.name}`, "tm1-output", transaction("44".repeat(32), [{
      outputIndex: 0,
      valueSats: "0",
      scriptHex: vector.scriptHex
    }])));
  }

  const auth = readJson<{ valid: Array<{ rawTransactionHex: string; inputs: Array<{ prevOut: { txid: string; outIdx: number }; outputScriptHex: string }> }> }>(
    join(REPO_ROOT, "packages/verification/tm1-authorization-vectors.json")
  );
  const donor = auth.valid[0];
  if (donor === undefined) {
    throw new Error("Missing the authorization donor input.");
  }
  const donorRaw = parseRaw(donor.rawTransactionHex);
  const donorMeta = donor.inputs[0];
  const donorScript = donorRaw.inputs[0];
  if (donorMeta === undefined || donorScript === undefined) {
    throw new Error("Authorization donor input is incomplete.");
  }
  const author: NormalizedInput = {
    index: 0,
    prevOut: donorMeta.prevOut,
    inputScriptHex: donorScript.scriptHex,
    outputScriptHex: donorMeta.outputScriptHex,
    address: null
  };
  for (const vector of [...tm1.transactionVectors.valid, ...tm1.transactionVectors.invalid]) {
    rows.push(rowFrom(`tm1-tx:${vector.name}`, "tm1-tx", transaction("55".repeat(32), vector.outputs, [author])));
  }

  const canonical = readJson<{ positive: Array<{ id: string; txid: string; rawTransactionHex: string; inputs: Array<{ prevOut: { txid: string; outIdx: number }; outputScriptHex: string }> }>; negative: Array<{ id: string; txid: string; rawTransactionHex: string; inputs: Array<{ prevOut: { txid: string; outIdx: number }; outputScriptHex: string }> }> }>(
    join(REPO_ROOT, "tests/fixtures/rfc0001-canonical-tm1-p2pkh.json")
  );
  for (const fixture of [...canonical.positive, ...canonical.negative]) {
    const raw = parseRaw(fixture.rawTransactionHex);
    const inputs = raw.inputs.map((input, index) => ({
      index,
      prevOut: fixture.inputs[index]?.prevOut ?? { txid: "00".repeat(32), outIdx: 0 },
      inputScriptHex: input.scriptHex,
      outputScriptHex: fixture.inputs[index]?.outputScriptHex ?? null,
      address: null
    }));
    rows.push(rowFrom(fixture.id, "canonical", {
      ...transaction(fixture.txid, raw.outputs, inputs),
      txid: fixture.txid
    }));
  }

  const mainnet = readJson<{ entries: Array<{
    txid: string;
    rawTransactionHex: string;
    blockHeight: number;
    blockHash: string;
    blockTimestamp: number;
    inputs: Array<{ prevOut: { txid: string; outIdx: number }; outputScriptHex: string }>;
  }> }>(join(REPO_ROOT, "tests/fixtures/rfc0001-mainnet-tm1-d07.json"));
  for (const entry of mainnet.entries) {
    const raw = parseRaw(entry.rawTransactionHex);
    const inputs = raw.inputs.map((input, index) => ({
      index,
      prevOut: entry.inputs[index]?.prevOut ?? { txid: "00".repeat(32), outIdx: 0 },
      inputScriptHex: input.scriptHex,
      outputScriptHex: entry.inputs[index]?.outputScriptHex ?? null,
      address: null
    }));
    rows.push(rowFrom(entry.txid, "d07", {
      ...transaction(entry.txid, raw.outputs, inputs),
      txid: entry.txid,
      blockHeight: entry.blockHeight,
      blockHash: entry.blockHash,
      blockTimestamp: entry.blockTimestamp
    }));
  }
  rows.push(...coexistenceMatrixRows());
  return rows;
}

function requireRow(rows: readonly MatrixRow[], id: string): MatrixRow {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`Missing matrix row ${id}.`);
  }
  return found;
}

describe("SEC-17 experimental container dispatch", () => {
  const rows = collectRows();

  it("keeps the historical fixture bytes and does not overwrite production oracles", () => {
    expect(sha256(join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json"))).toBe(PRIOR_EMPP_SHA);
    expect(sha256(join(REPO_ROOT, "tests/fixtures/rfc0001-empp-sec17-decisions.json"))).toBe(PRIOR_SEC17_SHA);
    const positive = requireRow(rows, "alp-send-plus-one-tmm");
    expect(positive.beforeStatus).toBe("INVALID_MEMO");
    expect(positive.beforeCode).toBe("INVALID_FORMAT");
    expect(positive.beforeCandidates).toEqual([{ protocol: "TM0", outputIndex: 0, pushIndex: 2 }]);
    const beside = requireRow(rows, "empp-beside-one-tm1");
    expect(beside.beforeStatus).toBe("MULTIPLE_MEMOS");
    const social = requireRow(rows, "two-push-social-v2-inactive");
    expect(social.beforeStatus).toBe("INVALID_TM1");
    expect(social.beforeCode).toBe("UNSUPPORTED_VERSION");
    expect(social.coreParseCodes).toEqual(["UNSUPPORTED_VERSION"]);
  });

  it("applies A-E only as an isolated reading and fails closed on any other difference", () => {
    expect(rows.every((row) => row.change !== "BLOCKED")).toBe(true);
    expect(rows.every((row) => row.settlement === "PENDING" && row.socialEventCredited === false)).toBe(true);
    for (const row of rows) {
      if (row.inputCount === 0) {
        expect(row.afterStatus === "VERIFIED" || row.afterStatus === "VERIFIED_TM1").toBe(false);
      }
      if (row.change === "AUTHORIZED_B_LAB_CRYPTO") {
        expect(row.afterStatus).toBe("VERIFIED_TM1");
        expect(row.authorship).toBe("LAB_CRYPTOGRAPHIC");
        expect(row.inputCount).toBeGreaterThan(0);
        continue;
      }
      if (row.change === "B_TRUSTED_CHRONIK_UNPROVEN") {
        expect(row.afterStatus).toBe("VERIFIED_TM1");
        expect(row.authorship).toBe("NOT_DEMONSTRATED");
        continue;
      }
      if (row.change !== "UNCHANGED" && row.change !== "AUTHORIZED_C" && row.change !== "AUTHORIZED_D" && row.change !== "AUTHORIZED_E") {
        expect(row.afterStatus === "VERIFIED" || row.afterStatus === "VERIFIED_TM1").toBe(false);
      }
    }
    const blocked = rows.filter((row) => row.change === "BLOCKED").map((row) => row.id);
    expect(blocked).toEqual([]);
  });

  it("meets the critical experimental acceptance cases", () => {
    const tmm = requireRow(rows, "alp-send-plus-one-tmm");
    expect(tmm.afterCandidates).toEqual([]);
    expect(tmm.afterStatus).toBe("NO_MEMO");
    expect(tmm.change).toBe("AUTHORIZED_A");
    expect(tmm.internalDiagnosis).toContain("TMM_STRUCTURALLY_VALID");
    expect(tmm.coreParseCodes).toEqual(["INVALID_MARKER"]);

    const besideTm1 = requireRow(rows, "empp-beside-one-tm1");
    expect(besideTm1.afterCandidates).toEqual([{ protocol: "TM1", outputIndex: 1, pushIndex: null }]);
    expect(besideTm1.afterStatus).not.toBe("MULTIPLE_MEMOS");
    expect(besideTm1.afterStatus).not.toBe("VERIFIED_TM1");
    expect(besideTm1.change).toBe("AUTHORIZED_B");

    const inside = requireRow(rows, "c-empp-tm0-text");
    expect(inside.afterCandidates).toEqual([{ protocol: "TM0", outputIndex: 0, pushIndex: 2 }]);
    expect(inside.afterStatus).toBe("UNAUTHORIZED");
    expect(inside.authorship).toBe("NOT_DEMONSTRATED");
    expect(inside.change).toBe("AUTHORIZED_C");

    const both = requireRow(rows, "c-empp-tmm-and-tm0-text");
    expect(both.afterCandidates).toEqual([{ protocol: "TM0", outputIndex: 0, pushIndex: 3 }]);
    expect(both.afterStatus).toBe("UNAUTHORIZED");
    expect(both.change).toBe("AUTHORIZED_A_C");

    for (const id of ["d-empp-tm1-pipe", "d-empp-tm2-pipe", "d-empp-tm9-pipe"]) {
      const marker = requireRow(rows, id);
      expect(marker.beforeCode).toBe("UNSUPPORTED_VERSION");
      expect(marker.afterCode).toBe("UNSUPPORTED_VERSION");
      expect(marker.coreParseCodes).toEqual(["INVALID_MARKER"]);
      expect(marker.change).toBe("AUTHORIZED_D");
      expect(isTm1CandidateScript(Uint8Array.from(Buffer.from(
        readJson<{ cases: Array<{ id: string; outputs: ScriptOutput[] }> }>(
          join(REPO_ROOT, "tests/fixtures/rfc0001-empp-sec17-decisions.json")
        ).cases.find((item) => item.id === id)?.outputs[0]?.scriptHex ?? "",
        "hex"
      )))).toBe(false);
    }

    const budget223 = requireRow(rows, "e-tm0-text-budget-223");
    expect(budget223.afterCandidates).toHaveLength(1);
    expect(budget223.afterStatus).toBe("UNAUTHORIZED");
    expect(budget223.internalDiagnosis).not.toContain("BYTE_BUDGET_EXCEEDED");

    for (const id of ["e-tm0-text-budget-224", "e-tm0-text-budget-225"]) {
      const over = requireRow(rows, id);
      expect(over.afterCandidates).toEqual([]);
      expect(over.afterStatus).toBe("NO_MEMO");
      expect(over.beforeStatus).toBe("NO_MEMO");
      expect(over.internalDiagnosis).toContain("BYTE_BUDGET_EXCEEDED");
      expect(over.coreParseCodes).toEqual(["INVALID_MARKER"]);
      expect(over.change).toBe("AUTHORIZED_E");
    }

    const social = requireRow(rows, "two-push-social-v2-inactive");
    expect(social.afterStatus).toBe("INVALID_TM1");
    expect(social.afterCode).toBe("UNSUPPORTED_VERSION");
    expect(social.change).toBe("UNCHANGED");

    const mixed = requireRow(rows, "tm1-tx:Multiple candidate outputs mixing TM0 and TM1");
    expect(mixed.beforeStatus).toBe("MULTIPLE_MEMOS");
    expect(mixed.afterStatus).toBe("MULTIPLE_MEMOS");
    expect(mixed.change).toBe("UNCHANGED");
    const duplicate = requireRow(rows, "tm1-tx:Duplicate TM1 candidate outputs in same transaction");
    expect(duplicate.beforeStatus).toBe("MULTIPLE_MEMOS");
    expect(duplicate.afterStatus).toBe("MULTIPLE_MEMOS");
    const identical = requireRow(rows, "tm1-tx:Duplicate identical TM1 candidate outputs in same transaction");
    expect(identical.afterStatus).toBe("MULTIPLE_MEMOS");
  });

  it("blocks an authorized label that hides a memo the dispatch still retains", () => {
    const besideTm1 = requireRow(rows, "empp-beside-one-tm1");
    expect(classifyDispatchChange({
      ...besideTm1,
      afterStatus: "NO_MEMO",
      afterCode: null
    })).toBe("BLOCKED");
    const besideTm0 = requireRow(rows, "empp-beside-tm0");
    expect(besideTm0.afterCandidates).toEqual([{ protocol: "TM0", outputIndex: 1, pushIndex: 0 }]);
    expect(besideTm0.afterStatus).toBe("UNAUTHORIZED");
    expect(classifyDispatchChange({
      ...besideTm0,
      afterStatus: "NO_MEMO",
      afterCode: null
    })).toBe("BLOCKED");
  });

  it("preserves the three archived D-07 transactions", () => {
    const document = readJson<{ entries: Array<{
      txid: string;
      rawTransactionHex: string;
      observedDigestHex: string;
      authorInputIndex: number;
      signatureAlgorithm: "schnorr" | "ecdsa";
      sighashByte: number;
      inputs: Array<{ prevoutSats: string; outputScriptHex: string }>;
      expected: { independent: string; normalized: { status: string; trustModel: string } };
    }> }>(join(REPO_ROOT, "tests/fixtures/rfc0001-mainnet-tm1-d07.json"));
    expect(document.entries.map((entry) => entry.txid)).toEqual([...D07_TXIDS]);
    for (const entry of document.entries) {
      expect(txidOf(entry.rawTransactionHex)).toBe(entry.txid);
      const observed = requireRow(rows, entry.txid);
      expect(observed.beforeStatus).toBe("VERIFIED_TM1");
      expect(observed.afterStatus).toBe("VERIFIED_TM1");
      expect(observed.change).toBe("UNCHANGED");
      expect(observed.authorship).toBe("PRODUCTION_TRUSTED_CHRONIK");
      expect(observed.inputCount).toBeGreaterThan(0);
      expect(entry.expected.normalized).toEqual({ status: "VERIFIED_TM1", trustModel: "trusted-chronik" });
      expect(entry.expected.independent).toBe("INDEPENDENT_SIGNATURE_VERIFIED");
      expect(classifyAuthor({
        rawTransactionHex: entry.rawTransactionHex,
        authorInputIndex: entry.authorInputIndex,
        signatureAlgorithm: entry.signatureAlgorithm,
        inputs: entry.inputs
      })).toEqual({ valid: true, stage: "cryptographic-signature", errorCode: null });
      expect(digestHex(entry.rawTransactionHex, entry.inputs, entry.authorInputIndex, entry.sighashByte)).toBe(entry.observedDigestHex);
      const tx = transaction(entry.txid, parseRaw(entry.rawTransactionHex).outputs);
      const script = tx.opReturnOutputs[0]?.outputScriptHex ?? "";
      expect(() => parseTm1Output({ script: Uint8Array.from(Buffer.from(script, "hex")), valueSats: 0n })).not.toThrow();
      expect(isTm1ProtocolError).toBeTypeOf("function");
      expect(verifyNormalizedTransaction).toBeTypeOf("function");
    }
  });

  it("locks the before/after matrix and the limitation record", () => {
    const document = {
      schema: "tonalli-memo.rfc0001.sec17-dispatch-matrix.s0",
      governanceComment: GOVERNANCE,
      productionDispatch: false,
      sec17Mitigation: "DESIGN_APPROVED_VALIDATION_PENDING",
      rfc0001: "PROPOSED — NOT RATIFIED",
      s0: "OPEN",
      s1: "NOT AUTHORIZED",
      rows
    };
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    if (process.env.SEC17_MATRIX_WRITE === "1") {
      writeFileSync(MATRIX_PATH, serialized);
    }
    const legacy = rows.filter((row) => row.corpus !== "sec17-coexistence");
    expect(legacy).toHaveLength(113);
    expect(createHash("sha256").update(JSON.stringify(legacy)).digest("hex")).toBe(LEGACY_ROW_SHA256);
    expect(rows.filter((row) => row.corpus === "d07").map((row) => row.id)).toEqual([...D07_TXIDS]);
    expect(readFileSync(MATRIX_PATH, "utf8")).toBe(serialized);
    expect(serialized).not.toContain("\"SETTLED\"");
    expect(serialized).not.toMatch(/"VALID_FORMAT"/u);
    const evidence = readFileSync(EVIDENCE_PATH, "utf8");
    for (const phrase of [
      GOVERNANCE,
      "DESIGN_APPROVED_VALIDATION_PENDING",
      "does not satisfy SEC-17",
      "S0: OPEN",
      "S1: NOT AUTHORIZED",
      "PROPOSED — NOT RATIFIED",
      "Social version `0x02` stays inactive",
      "tests/protocol/sec17-experimental-dispatch.ts",
      PRIOR_EMPP_SHA,
      PRIOR_SEC17_SHA
    ]) {
      expect(evidence).toContain(phrase);
    }
    expect(evidence).not.toMatch(/S0-07 is satisfied|S0: CLOSED|SEC-17 is mitigated/u);
  });
});
