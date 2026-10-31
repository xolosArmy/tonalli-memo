import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizeOpReturnOutput } from "../../packages/chronik/src/op-return.ts";
import type { NormalizedTransaction } from "../../packages/chronik/src/types.ts";
import {
  decodeMemo,
  isMemoProtocolError,
  isTm1CandidateScript,
  isTm1ProtocolError,
  parseTm1Output,
  validateMemo
} from "../../packages/protocol/src/index.ts";
import {
  findMemoCandidates,
  findTm0Candidates,
  findTm1Candidates
} from "../../packages/verification/src/candidates.ts";
import type { NormalizedVerificationResult } from "../../packages/verification/src/types.ts";
import { verifyNormalizedTransaction } from "../../packages/verification/src/verify-normalized.ts";
import { describeMemoPush, inspectEmppContainer } from "./empp-tmm-independent.mjs";

const require = createRequire(join(fileURLToPath(new URL(".", import.meta.url)), "../../packages/verification/package.json"));
const { getStackArray } = require("ecash-lib") as {
  getStackArray: (scriptHex: string) => string[];
};

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-sec17-decisions.json");
const PRIOR_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json");
const EVIDENCE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-S0-07-HISTORICAL.md");
const PRIOR_SHA = "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8";
const FIXTURE_SHA = "76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca";

interface FixtureOutput {
  outputIndex: number;
  role: string;
  scriptHex: string;
}

interface DecisionCase {
  id: string;
  decision: string;
  focusOutputIndex: number;
  textPayloadHex: string | null;
  textLayout: { layout: string; startsWithTm: boolean } | null;
  inspectOptions: {
    declaredTargetTxid?: string;
    declaredRecipientOutput?: number;
  };
  outputs: FixtureOutput[];
  independent: {
    scriptByteLength: number;
    container: string;
    flags: string[];
    axes: { authorship: string; settlement: string; wireShape: string };
  };
}

interface Corpus {
  schema: string;
  adoptedOption: null;
  priorCorpus: { sha256: string; cases: number };
  cases: DecisionCase[];
}

interface MemoReading {
  stage: "decode" | "validate" | "none";
  decodeCode: string | null;
  validateCode: string | null;
  recognizedContent: boolean;
}

interface StackReading {
  threw: boolean;
  pushes: string[];
}

interface Observed {
  id: string;
  normalize: string;
  parseErrorCode: string | null;
  stack: StackReading;
  stackMatchesNormalizer: boolean;
  isTm1: boolean;
  parseCode: string;
  rawTm0: Array<{ outputIndex: number; pushIndex: number }>;
  tm1: number[];
  memo: Array<{ protocol: "TM0" | "TM1"; outputIndex: number; pushIndex: number | null }>;
  status: string;
  code: string | null;
  focusPayload: MemoReading | null;
}

function memoReading(bytes: Uint8Array): MemoReading {
  let decoded;
  try {
    decoded = decodeMemo(bytes);
  } catch (error: unknown) {
    if (!isMemoProtocolError(error)) {
      throw error;
    }
    return {
      stage: "decode",
      decodeCode: error.code,
      validateCode: null,
      recognizedContent: false
    };
  }
  try {
    validateMemo(decoded);
  } catch (error: unknown) {
    if (!isMemoProtocolError(error)) {
      throw error;
    }
    return {
      stage: "validate",
      decodeCode: null,
      validateCode: error.code,
      recognizedContent: false
    };
  }
  return {
    stage: "none",
    decodeCode: null,
    validateCode: null,
    recognizedContent: true
  };
}

function stackReading(scriptHex: string): StackReading {
  try {
    return { threw: false, pushes: getStackArray(scriptHex) };
  } catch {
    return { threw: true, pushes: [] };
  }
}

function protocolCode(result: NormalizedVerificationResult): string | null {
  return "protocolError" in result ? result.protocolError.code : null;
}

function transactionFor(testCase: DecisionCase): NormalizedTransaction {
  return {
    txid: "33".repeat(32),
    isCoinbase: false,
    inputs: [],
    inputAddresses: [],
    opReturnOutputs: testCase.outputs.map((output) =>
      normalizeOpReturnOutput(output.outputIndex, 0n, output.scriptHex)
    ),
    blockHeight: 1,
    blockHash: "44".repeat(32),
    blockTimestamp: 1,
    firstSeenAt: 1,
    isFinal: true,
    rawResponse: { adapter: `s0-07:sec17:${testCase.id}` }
  };
}

function observe(testCase: DecisionCase): Observed {
  const focus = testCase.outputs.find((output) => output.outputIndex === testCase.focusOutputIndex);
  if (focus === undefined) {
    throw new Error(`${testCase.id} has no focus output.`);
  }
  const script = Uint8Array.from(Buffer.from(focus.scriptHex, "hex"));
  const stack = stackReading(focus.scriptHex);
  const normalized = normalizeOpReturnOutput(focus.outputIndex, 0n, focus.scriptHex);
  const normalizedPushes = normalized.pushes.map((push) => Buffer.from(push).toString("hex"));
  let parseCode = "PARSED";
  try {
    parseTm1Output({ valueSats: 0n, script });
  } catch (error: unknown) {
    if (!isTm1ProtocolError(error)) {
      throw error;
    }
    parseCode = error.code;
  }
  const transaction = transactionFor(testCase);
  const verdict = verifyNormalizedTransaction(transaction);
  return {
    id: testCase.id,
    normalize: normalized.parseStatus,
    parseErrorCode: normalized.parseErrorCode ?? null,
    stack,
    stackMatchesNormalizer: stack.threw
      ? normalized.parseStatus === "malformed" && normalizedPushes.length === 0
      : normalized.parseStatus === "parsed" && normalizedPushes.join("|") === stack.pushes.join("|"),
    isTm1: isTm1CandidateScript(script),
    parseCode,
    rawTm0: findTm0Candidates(transaction).map((candidate) => candidate.location),
    tm1: findTm1Candidates(transaction).map((candidate) => candidate.location.outputIndex),
    memo: findMemoCandidates(transaction).map((candidate) => ({
      protocol: candidate.protocol === "TM1" ? "TM1" as const : "TM0" as const,
      outputIndex: candidate.location.outputIndex,
      pushIndex: "pushIndex" in candidate.location ? candidate.location.pushIndex : null
    })),
    status: verdict.status,
    code: protocolCode(verdict),
    focusPayload: testCase.textPayloadHex === null
      ? null
      : memoReading(Uint8Array.from(Buffer.from(testCase.textPayloadHex, "hex")))
  };
}

function readCorpus(): Corpus {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Corpus;
}

interface PayloadExpect {
  stage: "decode" | "validate" | "none";
  decodeCode: string | null;
  validateCode: string | null;
  recognizedContent: boolean;
}

interface RowExpect {
  normalize: "parsed" | "malformed";
  parseErrorCode: string | null;
  stackThrew: boolean;
  pushes?: string[];
  fillerBytes?: number;
  isTm1: boolean;
  parseCode: string;
  rawTm0: Array<{ outputIndex: number; pushIndex: number }>;
  tm1: number[];
  memo: Array<{ protocol: "TM0" | "TM1"; outputIndex: number; pushIndex: number | null }>;
  status: string;
  code: string | null;
  focus: PayloadExpect | null;
  container: string;
  flags: string[];
}

const ALP =
  "534c5032000453454e44085930c985cca74ff3c3b73c2a8053634bd3c818f50c98e9c530c6090fbd23c9017d0000000000";
const TMM =
  "544d4d00020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const TM0_TEXT = "544d307c707c78617c6869";
const PUSH2 = [{ outputIndex: 0, pushIndex: 2 }];
const MEMO_PUSH2 = [{ protocol: "TM0" as const, outputIndex: 0, pushIndex: 2 }];

const recognized: PayloadExpect = {
  stage: "none",
  decodeCode: null,
  validateCode: null,
  recognizedContent: true
};

function decodeFail(code: string): PayloadExpect {
  return { stage: "decode", decodeCode: code, validateCode: null, recognizedContent: false };
}

function validateFail(code: string): PayloadExpect {
  return { stage: "validate", decodeCode: null, validateCode: code, recognizedContent: false };
}

function emppPushes(...entries: string[]): string[] {
  return ["50", ALP, ...entries];
}

function invalidMemo(
  pushes: string[],
  code: string,
  focus: PayloadExpect | null,
  flags: string[] = ["EXTRA_PUSH", "TMM_ABSENT"]
): RowExpect {
  return {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes,
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: PUSH2,
    tm1: [],
    memo: MEMO_PUSH2,
    status: "INVALID_MEMO",
    code,
    focus,
    container: "CANONICAL",
    flags
  };
}

function unauthorizedText(pushes: string[], flags: string[], container = "CANONICAL", fillerBytes?: number): RowExpect {
  return {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes: fillerBytes === undefined ? pushes : undefined,
    fillerBytes,
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: PUSH2,
    tm1: [],
    memo: MEMO_PUSH2,
    status: "UNAUTHORIZED",
    code: null,
    focus: recognized,
    container,
    flags
  };
}

function dropped(focus: PayloadExpect | null, container: string, flags: string[]): RowExpect {
  return {
    normalize: "malformed",
    parseErrorCode: "MALFORMED_OP_RETURN",
    stackThrew: true,
    pushes: [],
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [],
    tm1: [],
    memo: [],
    status: "NO_MEMO",
    code: null,
    focus,
    container,
    flags
  };
}

function noMemo(pushes: string[], container: string, flags: string[]): RowExpect {
  return {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes,
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [],
    tm1: [],
    memo: [],
    status: "NO_MEMO",
    code: null,
    focus: null,
    container,
    flags
  };
}

const EXPECTED: Record<string, RowExpect> = {
  "c-empp-tm0-text": unauthorizedText(emppPushes(TM0_TEXT), ["EXTRA_PUSH", "TMM_ABSENT"]),
  "c-conventional-tm0": {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes: [TM0_TEXT],
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [{ outputIndex: 0, pushIndex: 0 }],
    tm1: [],
    memo: [{ protocol: "TM0", outputIndex: 0, pushIndex: 0 }],
    status: "UNAUTHORIZED",
    code: null,
    focus: recognized,
    container: "NOT_EMPP",
    flags: ["NOT_EMPP"]
  },
  "c-empp-tmm-binary": invalidMemo(emppPushes(TMM), "INVALID_FORMAT", null, []),
  "c-empp-tmm-and-tm0-text": {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes: emppPushes(TMM, TM0_TEXT),
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [
      { outputIndex: 0, pushIndex: 2 },
      { outputIndex: 0, pushIndex: 3 }
    ],
    tm1: [],
    memo: [
      { protocol: "TM0", outputIndex: 0, pushIndex: 2 },
      { protocol: "TM0", outputIndex: 0, pushIndex: 3 }
    ],
    status: "MULTIPLE_MEMOS",
    code: null,
    focus: recognized,
    container: "CANONICAL",
    flags: ["EXTRA_PUSH"]
  },
  "c-empp-tmm-beside-conventional-tm0": {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes: emppPushes(TMM),
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [
      { outputIndex: 0, pushIndex: 2 },
      { outputIndex: 1, pushIndex: 0 }
    ],
    tm1: [],
    memo: [
      { protocol: "TM0", outputIndex: 0, pushIndex: 2 },
      { protocol: "TM0", outputIndex: 1, pushIndex: 0 }
    ],
    status: "MULTIPLE_MEMOS",
    code: null,
    focus: recognized,
    container: "CANONICAL",
    flags: []
  },
  "d-empp-tm1-pipe": invalidMemo(emppPushes("544d317c707c78617c6869"), "UNSUPPORTED_VERSION", decodeFail("UNSUPPORTED_VERSION")),
  "d-empp-tm2-pipe": invalidMemo(emppPushes("544d327c707c78617c6869"), "UNSUPPORTED_VERSION", decodeFail("UNSUPPORTED_VERSION")),
  "d-empp-tm9-pipe": invalidMemo(emppPushes("544d397c707c78617c6869"), "UNSUPPORTED_VERSION", decodeFail("UNSUPPORTED_VERSION")),
  "d-empp-tm-no-digit": invalidMemo(emppPushes("544d7c707c78617c6869"), "INVALID_MARKER", decodeFail("INVALID_MARKER")),
  "d-empp-marker-not-tm": {
    ...noMemo(emppPushes("4e4f7c707c78617c6869"), "CANONICAL", ["EXTRA_PUSH", "TMM_ABSENT"]),
    focus: decodeFail("INVALID_MARKER")
  },
  "d-empp-tm2-no-pipes": invalidMemo(emppPushes("544d32"), "INVALID_FORMAT", decodeFail("INVALID_FORMAT")),
  "d-empp-invalid-utf8": invalidMemo(emppPushes("544dff7c70"), "INVALID_UTF8", decodeFail("INVALID_UTF8")),
  "d-empp-tm0-bad-type": invalidMemo(
    emppPushes("544d307c397c78617c6869"),
    "INVALID_TYPE_FORMAT",
    validateFail("INVALID_TYPE_FORMAT")
  ),
  "e-tm0-text-budget-223": unauthorizedText([], ["EXTRA_PUSH", "TMM_ABSENT"], "CANONICAL", 157),
  "e-tm0-text-budget-224": dropped(recognized, "CANONICAL", ["BYTE_BUDGET_EXCEEDED", "EXTRA_PUSH", "TMM_ABSENT"]),
  "e-tm0-text-budget-225": dropped(recognized, "CANONICAL", ["BYTE_BUDGET_EXCEEDED", "EXTRA_PUSH", "TMM_ABSENT"]),
  "e-truncated-tm0-push": dropped(null, "INVALID", ["TRUNCATED_PUSH"]),
  "e-non-minimal-tm0-push": unauthorizedText(
    emppPushes(TM0_TEXT),
    ["NON_MINIMAL_PUSH", "EXTRA_PUSH", "TMM_ABSENT"],
    "PARSEABLE"
  ),
  "e-alp-only-no-tmm": noMemo(emppPushes(), "CANONICAL", ["TMM_ABSENT"]),
  "e-unrecognized-two-push-v2": {
    normalize: "parsed",
    parseErrorCode: null,
    stackThrew: false,
    pushes: ["544d4d00", "02050161"],
    isTm1: true,
    parseCode: "UNSUPPORTED_VERSION",
    rawTm0: [{ outputIndex: 0, pushIndex: 0 }],
    tm1: [0],
    memo: [{ protocol: "TM1", outputIndex: 0, pushIndex: null }],
    status: "INVALID_TM1",
    code: "UNSUPPORTED_VERSION",
    focus: null,
    container: "NOT_EMPP",
    flags: ["NOT_EMPP"]
  },
  "e-unrelated-no-memo": noMemo(["deadbeef"], "NOT_EMPP", ["NOT_EMPP"])
};

function expectRow(row: Observed, expected: RowExpect, item: DecisionCase): void {
  expect(row.normalize).toBe(expected.normalize);
  expect(row.parseErrorCode).toBe(expected.parseErrorCode);
  expect(row.stack.threw).toBe(expected.stackThrew);
  expect(row.stackMatchesNormalizer).toBe(true);
  if (expected.fillerBytes !== undefined) {
    expect(row.stack.pushes).toHaveLength(4);
    expect(row.stack.pushes[0]).toBe("50");
    expect(row.stack.pushes[1]).toBe(ALP);
    expect(row.stack.pushes[2]).toBe(TM0_TEXT);
    expect(row.stack.pushes[3]).toBe("01".repeat(expected.fillerBytes));
  } else {
    expect(expected.pushes).toBeDefined();
    expect(row.stack.pushes).toEqual(expected.pushes);
  }
  expect(row.isTm1).toBe(expected.isTm1);
  expect(row.parseCode).toBe(expected.parseCode);
  expect(row.rawTm0).toEqual(expected.rawTm0);
  expect(row.tm1).toEqual(expected.tm1);
  expect(row.memo).toEqual(expected.memo);
  expect(row.status).toBe(expected.status);
  expect(row.code).toBe(expected.code);
  expect(row.focusPayload).toEqual(expected.focus);
  expect(row.status).not.toBe("VERIFIED");
  expect(row.status).not.toBe("VERIFIED_TM1");
  expect(item.independent.container).toBe(expected.container);
  expect(item.independent.flags).toEqual(expected.flags);
  expect(item.independent.axes.authorship).toBe("NOT_DEMONSTRATED");
  expect(item.independent.axes.settlement).toBe("PENDING");
  const script = Buffer.from(
    item.outputs.find((output) => output.outputIndex === item.focusOutputIndex)?.scriptHex ?? "",
    "hex"
  );
  const inspected = inspectEmppContainer(script, item.inspectOptions);
  expect(inspected.container).toBe(expected.container);
  expect(inspected.flags).toEqual(expected.flags);
  if (item.textPayloadHex !== null) {
    expect(describeMemoPush(Buffer.from(item.textPayloadHex, "hex")).layout).toBe(item.textLayout?.layout);
  }
}

describe("SEC-17 decision characterization", () => {
  const corpus = readCorpus();

  it("keeps the 29-case corpus and regenerates this corpus from ecash-lib", () => {
    const priorBytes = readFileSync(PRIOR_PATH);
    expect(createHash("sha256").update(priorBytes).digest("hex")).toBe(PRIOR_SHA);
    expect(JSON.parse(priorBytes.toString("utf8")).cases).toHaveLength(29);
    execFileSync(process.execPath, [
      join(REPO_ROOT, "tests/protocol/generate-empp-sec17-decisions.mjs"),
      "--check"
    ], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    execFileSync(process.execPath, [
      join(REPO_ROOT, "tests/protocol/generate-empp-tmm-fixtures.mjs"),
      "--check"
    ], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const bytes = readFileSync(FIXTURE_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FIXTURE_SHA);
    expect(bytes.toString("utf8")).not.toContain("VALID_FORMAT");
    expect(bytes.toString("utf8")).not.toContain("\"SETTLED\"");
    expect(corpus.adoptedOption).toBeNull();
    expect(corpus.schema).toBe("tonalli-memo.rfc0001.empp-sec17-decisions.s0");
    expect(corpus.cases).toHaveLength(21);
  });

  it("locks getStackArray, candidates, decode, validate, and the verifier", () => {
    expect(Object.keys(EXPECTED)).toEqual(corpus.cases.map((item) => item.id));
    for (const item of corpus.cases) {
      const expected = EXPECTED[item.id];
      if (expected === undefined) {
        throw new Error(`Missing locked reading for ${item.id}.`);
      }
      expectRow(observe(item), expected, item);
    }
  });

  it("records the unratified A-E matrix without closing SEC-17", () => {
    const evidence = readFileSync(EVIDENCE_PATH, "utf8");
    const start = evidence.indexOf("## SEC-17 decision characterization");
    const end = evidence.indexOf("## Pending evidence");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const matrix = evidence.slice(start, end).replace(/\s+/gu, " ");
    const required = [
      FIXTURE_SHA,
      PRIOR_SHA,
      "tests/fixtures/rfc0001-empp-sec17-decisions.json",
      "node tests/protocol/generate-empp-sec17-decisions.mjs --check",
      "None of decisions A-E is adopted",
      "requires a project-owner decision",
      "adoptedOption` is null",
      "SEC-17 criteria remain unsatisfied",
      "does not satisfy SEC-17",
      "No container dispatch is implemented",
      "Content recognition is not authorization",
      "`INVALID_UTF8` precedes the pipe check",
      "scan and decoder precedence differ",
      "BYTE_BUDGET_EXCEEDED",
      "malformed container",
      "unrecognized container",
      "absence of a memo",
      "6529195032",
      "Social version `0x02` stays inactive",
      "pnpm exec vitest run --config tests/protocol/vitest.s0-07.config.ts",
      "node --test scripts/d07-conf-04-historical-audit.test.mjs"
    ];
    for (const phrase of required) {
      expect(matrix).toContain(phrase);
    }
    for (const decision of ["A", "B", "C", "D", "E"]) {
      expect(matrix).toContain(`Decision ${decision}`);
    }
    expect(matrix).not.toMatch(/S0-07 is satisfied|S0-07: complete|S0: CLOSED/u);
  });
});
