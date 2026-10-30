import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyAuthor,
  digestHex,
  preimageHex,
  sighashByteAt,
  signatureMatches,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";

import { beforeAll, describe, expect, it } from "vitest";

import { normalizeOpReturnOutput } from "../../packages/chronik/src/op-return.ts";
import type {
  NormalizedInput,
  NormalizedOpReturnOutput,
  NormalizedTransaction
} from "../../packages/chronik/src/types.ts";
import {
  decodeMemo,
  encodeTm1Post,
  isMemoProtocolError,
  isTm1CandidateScript,
  isTm1ProtocolError,
  parseTm1Output,
  validateMemo
} from "../../packages/protocol/src/index.ts";
import type { ParsedTm1Post } from "../../packages/protocol/src/index.ts";
import { findMemoCandidates, findTm1Candidates } from "../../packages/verification/src/candidates.ts";
import type { NormalizedVerificationResult } from "../../packages/verification/src/types.ts";
import { verifyTm1DesignatedInput } from "../../packages/verification/src/verify-tm1-designated-input.ts";
import { verifyNormalizedTransaction } from "../../packages/verification/src/verify-normalized.ts";

const BASELINE = "228d1f036643ca9be8ba85e91f8200536f3242da";
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const EVIDENCE_PATH = fileURLToPath(new URL("./RFC0001-S0-07-HISTORICAL.md", import.meta.url));
const PROTECTED = [
  "packages/protocol",
  "packages/verification",
  "packages/chronik",
  "packages/registry"
] as const;
const ENTRY_POINTS = [
  "packages/protocol/src/decode.ts",
  "packages/protocol/src/parse-tm1.ts",
  "packages/protocol/src/validate.ts",
  "packages/protocol/src/encode-tm1.ts",
  "packages/protocol/test-vectors.json",
  "packages/protocol/tm1-test-vectors.json",
  "packages/verification/src/candidates.ts",
  "packages/verification/src/verify-normalized.ts",
  "packages/verification/src/verify-tm1-designated-input.ts",
  "packages/verification/tm1-authorization-vectors.json",
  "packages/chronik/src/op-return.ts"
] as const;
const CRYPTO_GAP_IDS = [
  "invalid-schnorr-signature-bit-flipped",
  "invalid-transaction-altered-after-signing",
  "invalid-designated-input-fails-nondesignated-valid"
] as const;
const PENDING_IDS = [
  "S0-07-INDEPENDENT-REVIEW",
  "CRYPTOGRAPHIC-DIGEST",
  "EMPP-ALP",
  "HISTORICAL-MAINNET",
  "M1.7.4"
] as const;
const DECIDED_IDS = ["S0-07-PROFILE-DECISION"] as const;
const CANONICAL_FIXTURE = "tests/fixtures/rfc0001-canonical-tm1-p2pkh.json";
const MAINNET_TXIDS = [
  "fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd",
  "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8",
  "0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150"
] as const;

interface Tm0Valid {
  name: string;
  envelope?: string;
  byteLength?: number;
  payload?: string;
  note?: string;
}

interface Tm0Invalid {
  name: string;
  envelope?: string;
  bytes?: number[];
  stage?: "decode" | "validate";
  code?: string;
  note?: string;
}

interface Tm1OutputVector {
  name: string;
  scriptHex: string;
  version?: number;
  eventType?: string;
  authorInputIndex?: number;
  eventDataByteLength?: number;
  eventDataUtf8?: string;
  outputValueSats?: number;
  expected?: { errorCode: string };
}

interface Tm1TransactionOutput {
  outputIndex: number;
  valueSats: number;
  scriptHex: string;
}

interface Tm1TransactionVector {
  name: string;
  outputs: Tm1TransactionOutput[];
  expected: {
    status: string;
    candidateCount: number;
    candidateOutputIndex?: number;
    eventDataUtf8?: string;
    errorCode?: string;
  };
}

interface AuthInput {
  prevOut: { txid: string; outIdx: number };
  outputScriptHex: string;
  scriptType: string;
}

interface AuthVector {
  id: string;
  authorInputIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: AuthInput[];
  inputScriptHex: string;
  expected: { valid: boolean; stage: string; errorCode: string | null };
}

interface LabFixture {
  author: { authorInputIndex: number; p2pkhScript: string };
  post: { raw: string; txid: string };
  reply: { raw: string; txid: string };
}

interface CanonicalPrevout {
  prevOut: { txid: string; outIdx: number };
  prevoutSats: string;
  outputScriptHex: string | null;
  scriptType: string;
}

interface CanonicalOutput {
  outputIndex: number;
  sats: string;
  outputScriptHex: string;
}

interface AuthorVerdict {
  valid: boolean;
  stage: string;
  errorCode: string | null;
}

interface CanonicalFixture {
  id: string;
  polarity: "positive" | "negative";
  description: string;
  signatureAlgorithm: "schnorr" | "ecdsa";
  authorInputIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: CanonicalPrevout[];
  outputs: CanonicalOutput[];
  source: string;
  chronikValidated: boolean;
  eventDataUtf8: string | null;
  libPreimageHex: string | null;
  libDigestHex: string | null;
  preimageInputIndex: number | null;
  signedDigestHex: string | null;
  expected: {
    independent: AuthorVerdict | null;
    parseOk: boolean;
    parseErrorCode: string | null;
    designated: { valid: boolean; stage?: string; errorCode?: string };
    normalized: { status: string; errorCode: string | null; trustModel: string | null };
    signatureValidAtIndex: { index: number; algorithm: "schnorr" | "ecdsa" } | null;
  };
}

interface CanonicalCorpus {
  schemaVersion: number;
  protocol: string;
  version: string;
  eventType: string;
  positive: CanonicalFixture[];
  negative: CanonicalFixture[];
  testKeys: Record<string, { warning: string; publicKeyHex: string; publicKeyHashHex: string }>;
}

interface MainnetCatalogEntry {
  txid: string;
  label: string;
  sourceUrl: string;
  rawTransactionHex?: string;
  inputs?: unknown;
}

interface RawInput {
  prevTxid: string;
  outIdx: number;
  scriptHex: string;
}

interface RawOutput {
  valueSats: bigint;
  scriptHex: string;
}

function git(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function hasCommit(sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function ensureBaseline(): void {
  if (!hasCommit(BASELINE)) {
    execFileSync("git", ["fetch", "--deepen=80", "origin"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
  }
  if (!hasCommit(BASELINE)) {
    execFileSync("git", ["fetch", "--depth=1", "origin", BASELINE], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
  }
  if (!hasCommit(BASELINE)) {
    throw new Error(`Baseline ${BASELINE} is not available. Refusing to treat it as identical.`);
  }
  execFileSync("git", ["merge-base", "--is-ancestor", BASELINE, "HEAD"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function bytesFromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function parseRawTransaction(hex: string): { inputs: RawInput[]; outputs: RawOutput[] } {
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
    const prevTxid = Buffer.from(buf.subarray(at, at + 32)).reverse().toString("hex");
    at += 32;
    const outIdx = buf.readUInt32LE(at);
    at += 4;
    const scriptLength = readVarint();
    const scriptHex = buf.subarray(at, at + scriptLength).toString("hex");
    at += scriptLength;
    at += 4;
    inputs.push({ prevTxid, outIdx, scriptHex });
  }

  const outputs: RawOutput[] = [];
  const outputCount = readVarint();
  for (let index = 0; index < outputCount; index += 1) {
    const valueSats = buf.readBigUInt64LE(at);
    at += 8;
    const scriptLength = readVarint();
    const scriptHex = buf.subarray(at, at + scriptLength).toString("hex");
    at += scriptLength;
    outputs.push({ valueSats, scriptHex });
  }

  if (at + 4 !== buf.length) {
    throw new Error("Transaction adapter did not consume the raw transaction.");
  }
  return { inputs, outputs };
}

function opReturnOutputsFromRaw(outputs: readonly RawOutput[]): NormalizedOpReturnOutput[] {
  return outputs.flatMap((output, index) =>
    output.scriptHex.startsWith("6a")
      ? [normalizeOpReturnOutput(index, output.valueSats, output.scriptHex)]
      : []
  );
}

function normalizedTransaction(input: {
  txid: string;
  inputs: readonly NormalizedInput[];
  opReturnOutputs: readonly NormalizedOpReturnOutput[];
  adapter: string;
}): NormalizedTransaction {
  return {
    txid: input.txid,
    isCoinbase: false,
    inputs: input.inputs,
    inputAddresses: input.inputs.flatMap((item) => (item.address === null ? [] : [item.address])),
    opReturnOutputs: input.opReturnOutputs,
    blockHeight: 1,
    blockHash: "22".repeat(32),
    blockTimestamp: 1,
    firstSeenAt: 1,
    isFinal: true,
    rawResponse: { adapter: input.adapter }
  };
}

/**
 * Pair raw scriptSigs with the vector's prevout metadata.
 * An absent metadata row stays null so PREVOUT_UNAVAILABLE is the vector's
 * own missing prevout, not a script invented here.
 */
function transactionFromAuthorization(vector: AuthVector): NormalizedTransaction {
  const raw = parseRawTransaction(vector.rawTransactionHex);
  const inputs: NormalizedInput[] = raw.inputs.map((rawInput, index) => {
    const meta = vector.inputs[index];
    return {
      index,
      prevOut: meta?.prevOut ?? { txid: rawInput.prevTxid, outIdx: rawInput.outIdx },
      inputScriptHex: rawInput.scriptHex,
      outputScriptHex: meta?.outputScriptHex ?? null,
      address: null
    };
  });
  return normalizedTransaction({
    txid: vector.txid,
    inputs,
    opReturnOutputs: opReturnOutputsFromRaw(raw.outputs),
    adapter: `s0-07:${vector.id}`
  });
}

function transactionFromCanonical(vector: CanonicalFixture): NormalizedTransaction {
  const raw = parseRawTransaction(vector.rawTransactionHex);
  const inputs: NormalizedInput[] = raw.inputs.map((rawInput, index) => {
    const meta = vector.inputs[index];
    return {
      index,
      prevOut: meta?.prevOut ?? { txid: rawInput.prevTxid, outIdx: rawInput.outIdx },
      inputScriptHex: rawInput.scriptHex,
      outputScriptHex: meta?.outputScriptHex ?? null,
      address: null
    };
  });
  return normalizedTransaction({
    txid: vector.txid,
    inputs,
    opReturnOutputs: opReturnOutputsFromRaw(raw.outputs),
    adapter: `s0-07:canonical-fixture:${vector.id}`
  });
}

function sha256dHex(hex: string): string {
  const first = createHash("sha256").update(Buffer.from(hex, "hex")).digest();
  return createHash("sha256").update(first).digest("hex");
}

function transactionFromOutputs(
  txid: string,
  outputs: readonly Tm1TransactionOutput[],
  inputs: readonly NormalizedInput[]
): NormalizedTransaction {
  return normalizedTransaction({
    txid,
    inputs,
    opReturnOutputs: outputs
      .filter((output) => output.scriptHex.startsWith("6a"))
      .map((output) => normalizeOpReturnOutput(output.outputIndex, BigInt(output.valueSats), output.scriptHex)),
    adapter: "s0-07:transaction-vector"
  });
}

function expectStatus<S extends NormalizedVerificationResult["status"]>(
  result: NormalizedVerificationResult,
  status: S
): Extract<NormalizedVerificationResult, { status: S }> {
  if (result.status !== status) {
    throw new Error(`Expected ${status}, received ${result.status}.`);
  }
  return result as Extract<NormalizedVerificationResult, { status: S }>;
}

function tm1Result(script: Uint8Array, valueSats = 0n): ParsedTm1Post | string {
  try {
    return parseTm1Output({ script, valueSats });
  } catch (error) {
    if (!isTm1ProtocolError(error)) {
      throw error;
    }
    return error.code;
  }
}

function memoResult(input: string | Uint8Array, stage: "decode" | "validate"): string | null {
  try {
    if (stage === "decode") {
      decodeMemo(input);
    } else {
      validateMemo(input);
    }
    return null;
  } catch (error) {
    if (!isMemoProtocolError(error)) {
      throw error;
    }
    return error.code;
  }
}

function requireOutput(vectors: readonly Tm1OutputVector[], name: string): Tm1OutputVector {
  const found = vectors.find((vector) => vector.name === name);
  if (found === undefined) {
    throw new Error(`Missing TM1 output vector ${name}.`);
  }
  return found;
}

let candidateSha = "";

beforeAll(() => {
  ensureBaseline();
  candidateSha = git(["rev-parse", "HEAD"]);
});

describe("S0-07 baseline identity", () => {
  it("keeps the protected trees identical to the ratification commit", () => {
    expect(candidateSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(candidateSha).not.toBe(BASELINE);
    expect(git(["merge-base", "--is-ancestor", BASELINE, "HEAD"])).toBe("");

    for (const path of PROTECTED) {
      expect(git(["diff", "--name-only", BASELINE, "--", path])).toBe("");
      expect(git(["diff", "--name-only", "HEAD", "--", path])).toBe("");
      const status = git(["status", "--porcelain", "--", path])
        .split("\n")
        .filter((line) => line.length > 0 && !line.includes("node_modules"));
      expect(status).toEqual([]);
    }

    const changed = git(["diff", "--name-only", BASELINE, "HEAD"])
      .split("\n")
      .filter((name) => name.length > 0);
    expect(changed.some((name) => name.startsWith("packages/"))).toBe(false);

    for (const path of ENTRY_POINTS) {
      expect(git(["rev-parse", `${BASELINE}:${path}`])).toBe(git(["rev-parse", `HEAD:${path}`]));
    }
  });

  it("leaves S0-07 unsatisfied in the evidence record", () => {
    const evidence = readFileSync(EVIDENCE_PATH, "utf8");
    expect(evidence).toContain(BASELINE);
    expect(evidence).toContain("S0-07 remains unsatisfied");
    expect(evidence).toContain("S0: OPEN");
    expect(evidence).toContain("S1: NOT AUTHORIZED");
    expect(evidence).toContain("application-policy");
    expect(evidence).toContain("expected-v2-rejection");
    expect(evidence).toContain("trusted-chronik-gap");
    expect(evidence).toContain("fixture-envelope-shape");
    expect(evidence).toContain("UNSUPPORTED_VERSION");
    expect(evidence).toContain("pnpm exec vitest run --config tests/protocol/vitest.s0-07.config.ts");
    expect(evidence).not.toMatch(/S0-07 is satisfied|S0-07: complete|S0: CLOSED/u);
    expect(evidence).not.toMatch(/xprv|tprv|cprv|BEGIN PRIVATE/u);
    for (const id of PENDING_IDS) {
      expect(evidence).toContain(id);
    }
    for (const id of DECIDED_IDS) {
      expect(evidence).toContain(id);
    }
    expect(PENDING_IDS.length).toBeGreaterThan(0);
    const pendingSection = evidence.slice(evidence.indexOf("## Pending evidence"));
    expect(pendingSection).not.toContain("S0-07-PROFILE-DECISION");
    expect(evidence).toContain("6529195032");
    expect(evidence).toContain("S0-07-PROFILE-DECISION is approved");
    expect(evidence).toContain("does not modify the TM1 Core v1.0 contract");
    expect(evidence).toContain("does not satisfy S0-07");
    expect(evidence).toContain("907ba8a2b5f68d346e863187508f7ea5fa3ec070");
    expect(evidence).toContain(CANONICAL_FIXTURE);
    expect(evidence).toContain("synthetic-fixture");
    expect(evidence).toContain("chronikValidated");
    expect(evidence).toContain("canonical-ecdsa-author0-sighash-41");
    for (const txid of MAINNET_TXIDS) {
      expect(evidence).toContain(txid);
    }
    expect(evidence).toContain("HISTORICAL-MAINNET remains blocked");

    const ratification = readFileSync(
      join(REPO_ROOT, "docs/protocol/tm1-core-v1.0-ratification-candidate.md"),
      "utf8"
    );
    expect(ratification).toContain("implementation/profile difference");
    expect(ratification).toContain("REPLY=0x02");
    expect(git(["rev-parse", `${BASELINE}:docs/protocol/tm1-core-v1.0-ratification-candidate.md`])).toBe(
      git(["rev-parse", "HEAD:docs/protocol/tm1-core-v1.0-ratification-candidate.md"])
    );
  });
});

describe("TM0 corpus", () => {
  const tm0 = readJson<{ valid: Tm0Valid[]; invalid: Tm0Invalid[] }>(
    join(REPO_ROOT, "packages/protocol/test-vectors.json")
  );

  it("accepts every stored valid envelope", () => {
    const stored = tm0.valid.filter((vector) => vector.envelope !== undefined);
    expect(stored.length).toBeGreaterThan(0);
    for (const vector of stored) {
      const envelope = vector.envelope ?? "";
      expect(memoResult(envelope, "decode")).toBeNull();
      const decoded = decodeMemo(envelope);
      const validated = validateMemo(decoded);
      expect(decoded.marker).toBe("TM0");
      expect(decoded.version).toBe(0);
      expect(validated.payload).toBe(vector.payload ?? decoded.payload);
      if (vector.byteLength !== undefined) {
        expect(validated.byteLength).toBe(vector.byteLength);
      }
      expect(memoResult(envelope, "validate")).toBeNull();
    }
  });

  it("rejects every stored invalid TM0 input with its recorded code", () => {
    const stored = tm0.invalid.filter((vector) => vector.envelope !== undefined || vector.bytes !== undefined);
    expect(stored.map((vector) => vector.code)).toEqual(
      expect.arrayContaining(["INVALID_MARKER", "UNSUPPORTED_VERSION", "INVALID_UTF8", "INVALID_FORMAT"])
    );
    for (const vector of stored) {
      const input = vector.bytes === undefined ? vector.envelope ?? "" : new Uint8Array(vector.bytes);
      const stage = vector.stage ?? "decode";
      expect(memoResult(input, stage)).toBe(vector.code);
    }
  });

  it("keeps the generated 80-byte and 81-byte boundaries owned by the existing suite", () => {
    const exact80 = tm0.valid.find((vector) => vector.name === "Exactly 80 UTF-8 bytes");
    const exact81 = tm0.invalid.find((vector) => vector.name === "Envelope of 81 UTF-8 bytes");
    expect(exact80?.note).toContain("vectors.test.ts");
    expect(exact81?.note).toContain("vectors.test.ts");
    expect(exact81?.code).toBe("PAYLOAD_TOO_LARGE");

    const accepted = `TM0|p|xa|${"a".repeat(71)}`;
    const rejected = `TM0|p|xa|${"a".repeat(72)}`;
    expect(validateMemo(accepted).byteLength).toBe(80);
    expect(memoResult(rejected, "validate")).toBe("PAYLOAD_TOO_LARGE");
    expect(isTm1CandidateScript(bytesFromHex("6a"))).toBe(false);
  });
});

describe("TM1 output corpus", () => {
  const tm1 = readJson<{
    specDraft: string;
    lokadIdHex: string;
    valid: Tm1OutputVector[];
    invalid: Tm1OutputVector[];
    transactionVectors: { valid: Tm1TransactionVector[]; invalid: Tm1TransactionVector[] };
  }>(join(REPO_ROOT, "packages/protocol/tm1-test-vectors.json"));

  it("parses every stored valid version 0x01 POST", () => {
    expect(tm1.specDraft).toBe("0.2");
    expect(tm1.lokadIdHex).toBe("544d4d00");
    expect(tm1.valid.length).toBeGreaterThan(0);
    for (const vector of tm1.valid) {
      const script = bytesFromHex(vector.scriptHex);
      expect(isTm1CandidateScript(script)).toBe(true);
      const parsed = tm1Result(script, 0n);
      expect(typeof parsed).not.toBe("string");
      if (typeof parsed === "string") {
        continue;
      }
      expect(parsed.version).toBe(1);
      expect(parsed.eventType).toBe(vector.eventType);
      expect(parsed.authorInputIndex).toBe(vector.authorInputIndex);
      expect(parsed.eventData).toBe(vector.eventDataUtf8);
      expect(parsed.eventDataByteLength).toBe(vector.eventDataByteLength);
    }
  });

  it("rejects every stored invalid TM1 script with its recorded code", () => {
    expect(tm1.invalid.map((vector) => vector.expected?.errorCode)).toEqual(
      expect.arrayContaining([
        "PAYLOAD_TOO_LARGE",
        "UNSUPPORTED_VERSION",
        "UNSUPPORTED_EVENT_TYPE",
        "EMPTY_EVENT_DATA",
        "INVALID_UTF8",
        "INVALID_FORMAT"
      ])
    );
    for (const vector of tm1.invalid) {
      const script = bytesFromHex(vector.scriptHex);
      expect(isTm1CandidateScript(script)).toBe(true);
      expect(tm1Result(script, 0n)).toBe(vector.expected?.errorCode);
    }
  });

  it("accepts author byte 2 structurally and still distinguishes the push boundaries", () => {
    const nonzero = requireOutput(tm1.valid, "Non-zero author input index");
    const direct = requireOutput(tm1.valid, "72 byte event_data uses direct push");
    const pushdata = requireOutput(tm1.valid, "73 byte event_data uses OP_PUSHDATA1");
    const maximum = requireOutput(tm1.valid, "212 byte maximum event_data");
    const tooLarge = requireOutput(tm1.invalid, "213 byte event_data exceeds maximum");
    const parsed = tm1Result(bytesFromHex(nonzero.scriptHex));
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed !== "string") {
      expect(parsed.authorInputIndex).toBe(2);
      expect(parsed.eventData).toBe("author input two");
    }
    expect(tm1Result(bytesFromHex(direct.scriptHex))).not.toEqual(expect.any(String));
    expect(pushdata.scriptHex).toContain("4c4c");
    expect(tm1Result(bytesFromHex(maximum.scriptHex))).not.toEqual(expect.any(String));
    expect(tm1Result(bytesFromHex(tooLarge.scriptHex))).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects version 0x02 before an unknown event type", () => {
    const unknownVersion = requireOutput(tm1.invalid, "Unknown version");
    const reservedEvent = requireOutput(tm1.invalid, "Reserved REPLY event type");
    expect(unknownVersion.scriptHex).toContain("020100");
    expect(tm1Result(bytesFromHex(unknownVersion.scriptHex))).toBe("UNSUPPORTED_VERSION");
    expect(reservedEvent.scriptHex.startsWith("6a04544d4d000e0102")).toBe(true);
    expect(tm1Result(bytesFromHex(reservedEvent.scriptHex))).toBe("UNSUPPORTED_EVENT_TYPE");

    for (const event of ["00", "03", "04", "05", "ff"]) {
      const derived = `${reservedEvent.scriptHex.slice(0, 16)}${event}${reservedEvent.scriptHex.slice(18)}`;
      expect(tm1Result(bytesFromHex(derived))).toBe("UNSUPPORTED_EVENT_TYPE");
    }
    for (const event of ["02", "03", "04", "05"]) {
      const derived = `${reservedEvent.scriptHex.slice(0, 14)}02${event}${reservedEvent.scriptHex.slice(18)}`;
      expect(tm1Result(bytesFromHex(derived))).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("separates normative TM1 cardinality from the TM0/TM1 application policy", () => {
    const author = transactionFromAuthorization(
      readJson<{ valid: AuthVector[] }>(
        join(REPO_ROOT, "packages/verification/tm1-authorization-vectors.json")
      ).valid[0] as AuthVector
    ).inputs[0];
    if (author === undefined) {
      throw new Error("Authorization vector 0 has no designated input.");
    }

    for (const vector of tm1.transactionVectors.valid) {
      const scripts = vector.outputs.map((output) => bytesFromHex(output.scriptHex));
      const normative = scripts.filter((script) => isTm1CandidateScript(script)).length;
      expect(normative).toBe(vector.expected.candidateCount);
      const transaction = transactionFromOutputs("11".repeat(32), vector.outputs, [author]);
      expect(findTm1Candidates(transaction)).toHaveLength(normative);
      const verified = expectStatus(verifyNormalizedTransaction(transaction), "VERIFIED_TM1");
      expect(verified.trustModel).toBe("trusted-chronik");
      expect(verified.memo.eventData).toBe(vector.expected.eventDataUtf8);
      expect(verified.candidate.outputIndex).toBe(vector.expected.candidateOutputIndex);
    }

    for (const vector of tm1.transactionVectors.invalid) {
      const scripts = vector.outputs.map((output) => bytesFromHex(output.scriptHex));
      const normative = scripts.filter((script) => isTm1CandidateScript(script)).length;
      const transaction = transactionFromOutputs("33".repeat(32), vector.outputs, [author]);
      const application = findMemoCandidates(transaction);

      if (vector.expected.errorCode === "MULTIPLE_MEMOS") {
        const rejected = expectStatus(verifyNormalizedTransaction(transaction), "MULTIPLE_MEMOS");
        expect(rejected.candidates).toHaveLength(vector.expected.candidateCount);
        expect(application).toHaveLength(vector.expected.candidateCount);
        if (vector.name === "Multiple candidate outputs mixing TM0 and TM1") {
          expect(normative).toBe(1);
          expect(application.map((candidate) => candidate.protocol ?? "TM0")).toEqual(["TM0", "TM1"]);
        } else {
          expect(normative).toBe(vector.expected.candidateCount);
        }
      } else {
        expect(normative).toBe(vector.expected.candidateCount);
        const rejected = expectStatus(verifyNormalizedTransaction(transaction), "INVALID_TM1");
        expect(rejected.protocolError.code).toBe(vector.expected.errorCode);
      }
    }

    const unrelated = normalizeOpReturnOutput(1, 0n, "6a04deadbeef");
    expect(unrelated.parseStatus).toBe("parsed");
    expect(isTm1CandidateScript(bytesFromHex("6a04deadbeef"))).toBe(false);
    const single = tm1.transactionVectors.valid[0];
    if (single === undefined) {
      throw new Error("Missing the single TM1 transaction vector.");
    }
    const withUnrelated = transactionFromOutputs(
      "44".repeat(32),
      [...single.outputs, { outputIndex: 2, valueSats: 0, scriptHex: "6a04deadbeef" }],
      [author]
    );
    expect(findTm1Candidates(withUnrelated)).toHaveLength(1);
    expect(findMemoCandidates(withUnrelated)).toHaveLength(1);
    expect(verifyNormalizedTransaction(withUnrelated).status).toBe("VERIFIED_TM1");
  });
});

describe("designated-input stages", () => {
  const authorization = readJson<{ valid: AuthVector[]; invalid: AuthVector[] }>(
    join(REPO_ROOT, "packages/verification/tm1-authorization-vectors.json")
  );
  const all = [...authorization.valid, ...authorization.invalid];

  function requireVector(id: string): AuthVector {
    const found = all.find((vector) => vector.id === id);
    if (found === undefined) {
      throw new Error(`Missing authorization vector ${id}.`);
    }
    return found;
  }

  function withCanonicalEnvelope(vector: AuthVector, scriptHex: string): NormalizedTransaction {
    const transaction = transactionFromAuthorization(vector);
    return {
      ...transaction,
      opReturnOutputs: [normalizeOpReturnOutput(0, 0n, scriptHex)]
    };
  }

  it("matches structural stages and records the multi-push fixture shape", () => {
    expect(authorization.valid.length).toBeGreaterThan(0);
    expect(authorization.invalid.map((vector) => vector.id)).toEqual(
      expect.arrayContaining([
        "invalid-author-input-out-of-range",
        "invalid-prevout-unavailable",
        "invalid-unsupported-author-script-p2sh",
        ...CRYPTO_GAP_IDS
      ])
    );

    const gapIds: string[] = [];
    for (const vector of all) {
      const transaction = transactionFromAuthorization(vector);
      const memoOutput = transaction.opReturnOutputs.find((output) =>
        isTm1CandidateScript(bytesFromHex(output.outputScriptHex))
      );
      if (memoOutput === undefined) {
        throw new Error(`${vector.id} has no TM1 candidate output.`);
      }
      // The generator stores version, event, author and event_data as separate pushes.
      // Core accepts one envelope push. Keep this rejection; do not rewrite the script.
      expect(tm1Result(bytesFromHex(memoOutput.outputScriptHex), memoOutput.valueSats)).toBe("INVALID_FORMAT");
      const rejected = expectStatus(verifyNormalizedTransaction(transaction), "INVALID_TM1");
      expect(rejected.protocolError.code).toBe("INVALID_FORMAT");

      const designated = verifyTm1DesignatedInput(transaction, vector.authorInputIndex);
      if (vector.expected.stage === "cryptographic-signature" && vector.expected.valid === false) {
        expect(vector.expected.errorCode).toBe("INVALID_AUTHOR_SIGNATURE");
        expect(designated.valid).toBe(true);
        gapIds.push(vector.id);
        continue;
      }
      if (vector.expected.valid) {
        expect(designated.valid).toBe(true);
        if (designated.valid) {
          expect(designated.sighashByte === 0x41 || designated.sighashByte === 0xc1).toBe(true);
        }
        continue;
      }
      expect(designated.valid).toBe(false);
      if (!designated.valid) {
        expect(designated.stage).toBe(vector.expected.stage);
        expect(designated.errorCode).toBe(vector.expected.errorCode);
      }
    }

    expect(gapIds).toEqual([...CRYPTO_GAP_IDS]);
    expect(requireVector("invalid-unsupported-author-script-p2sh").inputs[0]?.scriptType).toBe("p2sh");
  });

  it("reaches author stages when a stored canonical envelope replaces the multi-push output", () => {
    const canonical = "6a04544d4d000401010061";
    expect(tm1Result(bytesFromHex(canonical))).not.toEqual(expect.any(String));

    const p2sh = withCanonicalEnvelope(requireVector("invalid-unsupported-author-script-p2sh"), canonical);
    const p2shResult = expectStatus(verifyNormalizedTransaction(p2sh), "INVALID_TM1");
    expect(p2shResult.protocolError.code).toBe("UNSUPPORTED_AUTHOR_SCRIPT");

    const missingPrevout = withCanonicalEnvelope(requireVector("invalid-prevout-unavailable"), canonical);
    const missingResult = expectStatus(verifyNormalizedTransaction(missingPrevout), "INVALID_TM1");
    expect(missingResult.protocolError.code).toBe("PREVOUT_UNAVAILABLE");

    const outOfRange = withCanonicalEnvelope(
      requireVector("invalid-author-input-out-of-range"),
      encodeTm1Post({ authorInputIndex: 1, eventData: "a" }).scriptHex
    );
    const outOfRangeResult = expectStatus(verifyNormalizedTransaction(outOfRange), "INVALID_TM1");
    expect(outOfRangeResult.protocolError.code).toBe("AUTHOR_INPUT_OUT_OF_RANGE");

    const authorTwo = withCanonicalEnvelope(
      requireVector("valid-p2pkh-author2-schnorr-all-forkid"),
      encodeTm1Post({ authorInputIndex: 2, eventData: "author input two" }).scriptHex
    );
    const authorTwoResult = expectStatus(verifyNormalizedTransaction(authorTwo), "VERIFIED_TM1");
    expect(authorTwoResult.trustModel).toBe("trusted-chronik");
    expect(authorTwoResult.authorizingInputIndex).toBe(2);

    const bitFlipped = withCanonicalEnvelope(requireVector("invalid-schnorr-signature-bit-flipped"), canonical);
    const bitFlippedResult = expectStatus(verifyNormalizedTransaction(bitFlipped), "VERIFIED_TM1");
    expect(bitFlippedResult.trustModel).toBe("trusted-chronik");
  });

  it("rejects author byte 255 at the input-range stage after structural acceptance", () => {
    const encoded = encodeTm1Post({ authorInputIndex: 255, eventData: "structural" });
    const parsed = parseTm1Output({ script: encoded.script, valueSats: 0n });
    expect(parsed.authorInputIndex).toBe(255);
    expect(parsed.eventData).toBe("structural");

    const donor = authorization.valid[0];
    if (donor === undefined) {
      throw new Error("Missing a donor authorization vector.");
    }
    const donorTransaction = transactionFromAuthorization(donor);
    const input = donorTransaction.inputs[0];
    if (input === undefined) {
      throw new Error("Missing the donor input.");
    }
    const transaction = normalizedTransaction({
      txid: "55".repeat(32),
      inputs: [{ ...input, index: 0 }],
      opReturnOutputs: [normalizeOpReturnOutput(0, 0n, encoded.scriptHex)],
      adapter: "s0-07:author-255"
    });
    const designated = verifyTm1DesignatedInput(transaction, parsed.authorInputIndex);
    expect(designated.valid).toBe(false);
    if (!designated.valid) {
      expect(designated.stage).toBe("author-index");
      expect(designated.errorCode).toBe("AUTHOR_INPUT_OUT_OF_RANGE");
    }
    const rejected = expectStatus(verifyNormalizedTransaction(transaction), "INVALID_TM1");
    expect(rejected.protocolError.code).toBe("AUTHOR_INPUT_OUT_OF_RANGE");
  });
});

describe("lab fixture and experimental harness", () => {
  const lab = readJson<LabFixture>(join(REPO_ROOT, "tests/fixtures/rfc0001_regtest_reference.json"));
  const harnessPath = join(dirname(fileURLToPath(import.meta.url)), "rfc0001_regtest_reference.test.mjs");

  function labTransaction(raw: string, txid: string): NormalizedTransaction {
    const parsed = parseRawTransaction(raw);
    const inputs: NormalizedInput[] = parsed.inputs.map((input, index) => ({
      index,
      prevOut: { txid: input.prevTxid, outIdx: input.outIdx },
      inputScriptHex: input.scriptHex,
      outputScriptHex: lab.author.p2pkhScript,
      address: null
    }));
    return normalizedTransaction({
      txid,
      inputs,
      opReturnOutputs: opReturnOutputsFromRaw(parsed.outputs),
      adapter: "s0-07:lab-fixture"
    });
  }

  it("parses the lab POST and rejects the lab version 0x02 REPLY", () => {
    const post = labTransaction(lab.post.raw, lab.post.txid);
    const reply = labTransaction(lab.reply.raw, lab.reply.txid);
    const postOutput = post.opReturnOutputs[0];
    const replyOutput = reply.opReturnOutputs[0];
    if (postOutput === undefined || replyOutput === undefined) {
      throw new Error("Lab fixture is missing an OP_RETURN output.");
    }

    const postScript = bytesFromHex(postOutput.outputScriptHex);
    const replyScript = bytesFromHex(replyOutput.outputScriptHex);
    expect(isTm1CandidateScript(postScript)).toBe(true);
    expect(isTm1CandidateScript(replyScript)).toBe(true);
    const parsedPost = tm1Result(postScript, postOutput.valueSats);
    expect(typeof parsedPost).not.toBe("string");
    if (typeof parsedPost !== "string") {
      expect(parsedPost.version).toBe(1);
      expect(parsedPost.eventType).toBe("POST");
      expect(parsedPost.authorInputIndex).toBe(lab.author.authorInputIndex);
      expect(parsedPost.eventData).toBe("laboratorio RFC-0001 POST");
    }
    expect(tm1Result(replyScript, replyOutput.valueSats)).toBe("UNSUPPORTED_VERSION");

    const verifiedPost = expectStatus(verifyNormalizedTransaction(post), "VERIFIED_TM1");
    expect(verifiedPost.trustModel).toBe("trusted-chronik");
    const rejectedReply = expectStatus(verifyNormalizedTransaction(reply), "INVALID_TM1");
    expect(rejectedReply.protocolError.code).toBe("UNSUPPORTED_VERSION");
  });

  it("keeps the experimental harness off the production parser", () => {
    const source = readFileSync(harnessPath, "utf8");
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    expect(imports).toEqual([
      "import { createHash } from 'node:crypto';",
      "import { readFileSync } from 'node:fs';",
      "import { URL } from 'node:url';",
      "import { Buffer } from 'node:buffer';",
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';"
    ]);
    expect(source).toContain("assert.equal(replyCandidate.status, 'ONE_CANDIDATE');");
    expect(source).toContain("assert.equal(replyEnv[0], 0x02);");
    expect(source).toContain("assert.equal(replyEnv[1], 0x02);");
  });
});

describe("canonical TM1 P2PKH fixtures", () => {
  const corpus = readJson<CanonicalCorpus>(join(REPO_ROOT, CANONICAL_FIXTURE));
  const fixtures = [...corpus.positive, ...corpus.negative];

  function requireFixture(id: string): CanonicalFixture {
    const found = fixtures.find((fixture) => fixture.id === id);
    if (found === undefined) {
      throw new Error(`Missing canonical fixture ${id}.`);
    }
    return found;
  }

  it("rechecks the committed JSON against the isolated generator", () => {
    execFileSync(process.execPath, [join(REPO_ROOT, "tests/protocol/generate-canonical-tm1-fixtures.mjs"), "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  });

  it("keeps historical multi-push authorization fixtures unchanged", () => {
    expect(git(["diff", "--name-only", BASELINE, "--", "packages/verification/tm1-authorization-vectors.json"])).toBe("");
    expect(git(["diff", "--name-only", BASELINE, "--", "packages/verification/scripts/generate-authorization-vectors.mjs"])).toBe("");
  });

  it("checks serialization, envelope, structure, trusted-chronik, and the independent signature", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.protocol).toBe("TM1-CORE-V1.0");
    expect(corpus.version).toBe("0x01");
    expect(corpus.eventType).toBe("POST-0x01");
    expect(corpus.positive.length).toBe(5);
    expect(corpus.negative.map((fixture) => fixture.id)).toEqual([
      "negative-signature-altered",
      "negative-post-mutated",
      "negative-sighash-all-output-mutated",
      "negative-prevout-amount",
      "negative-pubkey-hash-mismatch",
      "negative-author-index-out-of-range",
      "negative-prevout-missing",
      "negative-designated-p2sh",
      "negative-sighash-none-forkid",
      "negative-multipush-envelope"
    ]);
    expect(corpus.positive.map((fixture) => fixture.authorInputIndex)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(corpus.positive.map((fixture) => sighashByteAt(fixture.rawTransactionHex, fixture.authorInputIndex))).toEqual(
      expect.arrayContaining([0x41, 0xc1])
    );
    expect(corpus.positive.filter((fixture) => fixture.signatureAlgorithm === "schnorr").length).toBe(4);
    expect(corpus.positive.filter((fixture) => fixture.signatureAlgorithm === "ecdsa").map((fixture) => fixture.id)).toEqual([
      "canonical-ecdsa-author0-sighash-41"
    ]);
    const stored = readFileSync(join(REPO_ROOT, CANONICAL_FIXTURE), "utf8");
    expect(stored).not.toContain("privateKey");
    expect(stored).toContain("never for funds");
    for (const key of Object.values(corpus.testKeys)) {
      expect(key.warning).toContain("never for funds");
      expect(key.publicKeyHex).toMatch(/^(02|03)[0-9a-f]{64}$/u);
    }

    for (const fixture of fixtures) {
      expect(fixture.source).toBe("synthetic-fixture");
      expect(fixture.chronikValidated).toBe(false);
      expect(txidOf(fixture.rawTransactionHex)).toBe(fixture.txid);

      const raw = parseRawTransaction(fixture.rawTransactionHex);
      expect(raw.outputs.map((output) => ({ sats: output.valueSats.toString(), script: output.scriptHex }))).toEqual(
        fixture.outputs.map((output) => ({ sats: output.sats, script: output.outputScriptHex }))
      );
      raw.inputs.forEach((input, index) => {
        const meta = fixture.inputs[index];
        if (meta !== undefined) {
          expect(meta.prevOut).toEqual({ txid: input.prevTxid, outIdx: input.outIdx });
        }
      });

      const transaction = transactionFromCanonical(fixture);
      expect(transaction.rawResponse).toEqual({ adapter: `s0-07:canonical-fixture:${fixture.id}` });
      const memoOutput = transaction.opReturnOutputs[0];
      if (memoOutput === undefined) {
        throw new Error(`${fixture.id} has no OP_RETURN output.`);
      }
      const parsed = tm1Result(bytesFromHex(memoOutput.outputScriptHex), memoOutput.valueSats);
      if (fixture.expected.parseOk) {
        expect(typeof parsed).not.toBe("string");
        if (typeof parsed !== "string") {
          expect(parsed.version).toBe(1);
          expect(parsed.eventType).toBe("POST");
          expect(parsed.authorInputIndex).toBe(fixture.authorInputIndex);
          expect(parsed.eventData).toBe(fixture.eventDataUtf8);
        }
        expect(memoOutput.pushes).toHaveLength(2);
        expect(Buffer.from(memoOutput.pushes[0] ?? new Uint8Array()).toString("hex")).toBe("544d4d00");
      } else {
        expect(parsed).toBe(fixture.expected.parseErrorCode);
        expect(fixture.expected.independent).toBeNull();
      }

      const designated = verifyTm1DesignatedInput(transaction, fixture.authorInputIndex);
      expect(designated.valid).toBe(fixture.expected.designated.valid);
      if (designated.valid) {
        expect(designated.sighashByte === 0x41 || designated.sighashByte === 0xc1).toBe(true);
      } else {
        expect(designated.stage).toBe(fixture.expected.designated.stage);
        expect(designated.errorCode).toBe(fixture.expected.designated.errorCode);
      }

      const normalized = verifyNormalizedTransaction(transaction);
      expect(normalized.status).toBe(fixture.expected.normalized.status);
      if (normalized.status === "VERIFIED_TM1") {
        expect(fixture.expected.normalized.trustModel).toBe("trusted-chronik");
        expect(normalized.trustModel).toBe("trusted-chronik");
        expect(fixture.chronikValidated).toBe(false);
      } else if (normalized.status === "INVALID_TM1") {
        expect(normalized.protocolError.code).toBe(fixture.expected.normalized.errorCode);
        expect(fixture.expected.normalized.trustModel).toBeNull();
      } else {
        throw new Error(`${fixture.id} returned ${normalized.status}.`);
      }

      if (fixture.expected.independent === null) {
        expect(fixture.libPreimageHex).toBeNull();
      } else {
        expect(classifyAuthor(fixture)).toEqual(fixture.expected.independent);
      }

      if (fixture.libPreimageHex !== null && fixture.preimageInputIndex !== null) {
        const sighash = sighashByteAt(fixture.rawTransactionHex, fixture.preimageInputIndex);
        expect(preimageHex(fixture.rawTransactionHex, fixture.inputs, fixture.preimageInputIndex, sighash)).toBe(
          fixture.libPreimageHex
        );
        expect(digestHex(fixture.rawTransactionHex, fixture.inputs, fixture.preimageInputIndex, sighash)).toBe(
          fixture.libDigestHex
        );
        expect(sha256dHex(fixture.libPreimageHex)).toBe(fixture.libDigestHex);
      }

      if (fixture.polarity === "positive") {
        expect(signatureMatches(fixture.rawTransactionHex, fixture.inputs, fixture.authorInputIndex, fixture.signatureAlgorithm)).toBe(
          true
        );
        expect(fixture.expected.independent).toEqual({
          valid: true,
          stage: "cryptographic-signature",
          errorCode: null
        });
      }

      if (fixture.expected.signatureValidAtIndex !== null) {
        expect(
          signatureMatches(
            fixture.rawTransactionHex,
            fixture.inputs,
            fixture.expected.signatureValidAtIndex.index,
            fixture.expected.signatureValidAtIndex.algorithm
          )
        ).toBe(true);
        expect(fixture.expected.independent?.valid).toBe(false);
      }
    }

    const altered = requireFixture("negative-signature-altered");
    const mutatedPost = requireFixture("negative-post-mutated");
    const mutatedOutput = requireFixture("negative-sighash-all-output-mutated");
    const wrongAmount = requireFixture("negative-prevout-amount");
    const canonical = requireFixture("canonical-schnorr-author0-sighash-41");
    expect(altered.libDigestHex).toBe(canonical.libDigestHex);
    expect(altered.signedDigestHex).toBe(canonical.signedDigestHex);
    expect(mutatedPost.libDigestHex).not.toBe(mutatedPost.signedDigestHex);
    expect(mutatedOutput.libDigestHex).not.toBe(mutatedOutput.signedDigestHex);
    expect(wrongAmount.libDigestHex).not.toBe(wrongAmount.signedDigestHex);
    expect(wrongAmount.rawTransactionHex).toBe(canonical.rawTransactionHex);
    expect(wrongAmount.inputs[0]?.prevoutSats).toBe("10001");
    expect(canonical.inputs[0]?.prevoutSats).toBe("10000");
    for (const fixture of [altered, mutatedPost, mutatedOutput, wrongAmount]) {
      expect(fixture.expected.independent?.stage).toBe("cryptographic-signature");
      expect(fixture.expected.designated.valid).toBe(true);
      expect(fixture.expected.normalized).toEqual({
        status: "VERIFIED_TM1",
        errorCode: null,
        trustModel: "trusted-chronik"
      });
    }
  });

  it("records the approved TM0/TM1 policy without treating it as Core or as S0-07 closure", () => {
    const evidence = readFileSync(EVIDENCE_PATH, "utf8");
    expect(evidence).toContain("6529195032");
    expect(evidence).toContain("TM0 and TM1 in one transaction: `MULTIPLE_MEMOS`");
    expect(evidence).toContain("Two TM1 candidates: `MULTIPLE_MEMOS` under Core");
    expect(evidence).toContain("unrelated `OP_RETURN`");

    const tm1 = readJson<{
      transactionVectors: { valid: Tm1TransactionVector[]; invalid: Tm1TransactionVector[] };
    }>(join(REPO_ROOT, "packages/protocol/tm1-test-vectors.json"));
    const author = transactionFromAuthorization(
      readJson<{ valid: AuthVector[] }>(join(REPO_ROOT, "packages/verification/tm1-authorization-vectors.json")).valid[0] as AuthVector
    ).inputs[0];
    if (author === undefined) {
      throw new Error("Authorization vector 0 has no designated input.");
    }
    const mixed = tm1.transactionVectors.invalid.find((vector) => vector.name === "Multiple candidate outputs mixing TM0 and TM1");
    const twoTm1 = tm1.transactionVectors.invalid.find((vector) => vector.name === "Duplicate TM1 candidate outputs in same transaction");
    const single = tm1.transactionVectors.valid[0];
    if (mixed === undefined || twoTm1 === undefined || single === undefined) {
      throw new Error("Missing a cardinality vector for the approved profile.");
    }

    const mixedTransaction = transactionFromOutputs("66".repeat(32), mixed.outputs, [author]);
    expect(mixed.outputs.map((output) => bytesFromHex(output.scriptHex)).filter((script) => isTm1CandidateScript(script))).toHaveLength(1);
    expect(findMemoCandidates(mixedTransaction).map((candidate) => candidate.protocol ?? "TM0")).toEqual(["TM0", "TM1"]);
    expect(verifyNormalizedTransaction(mixedTransaction).status).toBe("MULTIPLE_MEMOS");

    const duplicateTransaction = transactionFromOutputs("77".repeat(32), twoTm1.outputs, [author]);
    expect(twoTm1.outputs.map((output) => bytesFromHex(output.scriptHex)).filter((script) => isTm1CandidateScript(script))).toHaveLength(2);
    expect(verifyNormalizedTransaction(duplicateTransaction).status).toBe("MULTIPLE_MEMOS");

    const withUnrelated = transactionFromOutputs(
      "88".repeat(32),
      [...single.outputs, { outputIndex: 2, valueSats: 0, scriptHex: "6a04deadbeef" }],
      [author]
    );
    expect(findTm1Candidates(withUnrelated)).toHaveLength(1);
    expect(findMemoCandidates(withUnrelated)).toHaveLength(1);
    const verified = expectStatus(verifyNormalizedTransaction(withUnrelated), "VERIFIED_TM1");
    expect(verified.trustModel).toBe("trusted-chronik");
  });

  it("records the mainnet catalog as blocked when only TXIDs are present", () => {
    const catalog = readJson<{ entries: MainnetCatalogEntry[] }>(
      join(REPO_ROOT, "docs/operations/d07-conf-04-mainnet-candidates.json")
    );
    expect(catalog.entries.map((entry) => entry.txid)).toEqual([...MAINNET_TXIDS]);
    for (const entry of catalog.entries) {
      expect(entry.sourceUrl.startsWith("https://")).toBe(true);
      expect(entry.rawTransactionHex).toBeUndefined();
      expect(entry.inputs).toBeUndefined();
    }
    expect(readFileSync(EVIDENCE_PATH, "utf8")).toContain("HISTORICAL-MAINNET remains blocked");
  });
});
