import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizeOpReturnOutput } from "../../packages/chronik/src/op-return.ts";
import type { NormalizedTransaction } from "../../packages/chronik/src/types.ts";
import {
  isTm1CandidateScript,
  isTm1ProtocolError,
  parseTm1Output
} from "../../packages/protocol/src/index.ts";
import {
  findMemoCandidates,
  findTm0Candidates,
  findTm1Candidates
} from "../../packages/verification/src/candidates.ts";
import type { NormalizedVerificationResult } from "../../packages/verification/src/types.ts";
import { verifyNormalizedTransaction } from "../../packages/verification/src/verify-normalized.ts";
import { inspectEmppContainer } from "./empp-tmm-independent.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json");
const EVIDENCE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-S0-07-HISTORICAL.md");
const FIXTURE_SHA256 = "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8";
const POSITIVE_SCRIPT = "6a5031534c5032000453454e44085930c985cca74ff3c3b73c2a8053634bd3c818f50c98e9c530c6090fbd23c9017d000000000027544d4d00020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

interface FixtureOutput {
  outputIndex: number;
  valueSats: string;
  role: string;
  scriptHex: string;
}

interface EmppCase {
  id: string;
  focusOutputIndex: number;
  inspectOptions: {
    declaredTargetTxid?: string;
    declaredRecipientOutput?: number;
  };
  outputs: FixtureOutput[];
  independent: {
    scriptByteLength: number;
    container: string;
    flags: string[];
    alp: {
      structurallyValidSend: boolean;
      tokenId: string | null;
      atomMap: Array<{ outputIndex: number; atoms: string }>;
    };
    tmm: {
      exactlyOne: boolean;
      entries: Array<{ hex: string }>;
    };
    axes: {
      containerValid: boolean;
      alpStructurallyValid: boolean;
      tmmStructurallyValid: boolean;
      authorship: string;
      attributableTransfer: boolean;
      transfer: string;
      settlement: string;
      tokenHistory: string;
      wireShape: string;
    };
  };
}

interface EmppCorpus {
  ecashLib: string;
  rmzTokenId: string;
  canonicalTmmHex: string;
  byteBudget: number;
  boundaryNote: string;
  cases: EmppCase[];
}

interface Observed {
  normalize: string;
  isTm1: boolean;
  parseCode: string;
  rawTm0: Array<{ outputIndex: number; pushIndex: number }>;
  tm1: number[];
  memo: Array<{ protocol: "TM0" | "TM1"; outputIndex: number; pushIndex: number | null }>;
  status: string;
  code: string | null;
}

const FALSE_TM0: Observed = {
  normalize: "parsed",
  isTm1: false,
  parseCode: "INVALID_MARKER",
  rawTm0: [{ outputIndex: 0, pushIndex: 2 }],
  tm1: [],
  memo: [{ protocol: "TM0", outputIndex: 0, pushIndex: 2 }],
  status: "INVALID_MEMO",
  code: "INVALID_FORMAT"
};

const OVERRIDES: Record<string, Observed> = {
  "alp-send-only": {
    normalize: "parsed",
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [],
    tm1: [],
    memo: [],
    status: "NO_MEMO",
    code: null
  },
  "duplicate-tmm": {
    normalize: "parsed",
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
    code: null
  },
  "tmm-author-index-255": { ...FALSE_TM0, code: "INVALID_UTF8" },
  "tmm-non-utf8-target": { ...FALSE_TM0, code: "INVALID_UTF8" },
  "alternate-entry-order": {
    ...FALSE_TM0,
    rawTm0: [{ outputIndex: 0, pushIndex: 1 }],
    memo: [{ protocol: "TM0", outputIndex: 0, pushIndex: 1 }]
  },
  "truncated-script": {
    normalize: "malformed",
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [],
    tm1: [],
    memo: [],
    status: "NO_MEMO",
    code: null
  },
  "budget-natural-225": {
    normalize: "malformed",
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [],
    tm1: [],
    memo: [],
    status: "NO_MEMO",
    code: null
  },
  "budget-exact-224": {
    normalize: "malformed",
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [],
    tm1: [],
    memo: [],
    status: "NO_MEMO",
    code: null
  },
  "empp-beside-one-tm1": {
    normalize: "parsed",
    isTm1: false,
    parseCode: "INVALID_MARKER",
    rawTm0: [
      { outputIndex: 0, pushIndex: 2 },
      { outputIndex: 1, pushIndex: 0 }
    ],
    tm1: [1],
    memo: [
      { protocol: "TM0", outputIndex: 0, pushIndex: 2 },
      { protocol: "TM1", outputIndex: 1, pushIndex: null }
    ],
    status: "MULTIPLE_MEMOS",
    code: null
  },
  "empp-beside-tm0": {
    normalize: "parsed",
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
    code: null
  },
  "two-push-social-v2-inactive": {
    normalize: "parsed",
    isTm1: true,
    parseCode: "UNSUPPORTED_VERSION",
    rawTm0: [{ outputIndex: 0, pushIndex: 0 }],
    tm1: [0],
    memo: [{ protocol: "TM1", outputIndex: 0, pushIndex: null }],
    status: "INVALID_TM1",
    code: "UNSUPPORTED_VERSION"
  }
};

const DEFAULT_IDS = [
  "alp-send-plus-one-tmm",
  "tmm-truncated-target",
  "tmm-overlong-target",
  "tmm-wrong-version",
  "tmm-wrong-event",
  "tmm-reversed-target",
  "wrong-token-id",
  "alp-truncated-entry",
  "alp-burn-not-admitted",
  "alp-mint-not-admitted",
  "alp-unknown-action",
  "non-minimal-tmm-push",
  "extra-push",
  "budget-natural-219",
  "budget-exact-223",
  "alp-wrong-output-attribution",
  "alp-zero-atoms",
  "empp-beside-unrelated-op-return"
] as const;

function readCorpus(): EmppCorpus {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as EmppCorpus;
}

function requireCase(corpus: EmppCorpus, id: string): EmppCase {
  const found = corpus.cases.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`Missing eMPP case ${id}.`);
  }
  return found;
}

function protocolCode(result: NormalizedVerificationResult): string | null {
  if (result.status === "INVALID_MEMO" || result.status === "INVALID_TM1") {
    return result.protocolError.code;
  }
  return null;
}

function transactionFor(testCase: EmppCase): NormalizedTransaction {
  return {
    txid: "11".repeat(32),
    isCoinbase: false,
    inputs: [],
    inputAddresses: [],
    opReturnOutputs: testCase.outputs.map((output) =>
      normalizeOpReturnOutput(output.outputIndex, 0n, output.scriptHex)
    ),
    blockHeight: 1,
    blockHash: "22".repeat(32),
    blockTimestamp: 1,
    firstSeenAt: 1,
    isFinal: true,
    rawResponse: { adapter: `s0-07:empp:${testCase.id}` }
  };
}

function observe(testCase: EmppCase): Observed {
  const focus = testCase.outputs.find((output) => output.outputIndex === testCase.focusOutputIndex);
  if (focus === undefined) {
    throw new Error(`${testCase.id} has no focus output.`);
  }
  const script = Uint8Array.from(Buffer.from(focus.scriptHex, "hex"));
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
  const focusOutput = transaction.opReturnOutputs.find(
    (output) => output.outputIndex === testCase.focusOutputIndex
  );
  if (focusOutput === undefined) {
    throw new Error(`${testCase.id} did not normalize its focus output.`);
  }
  return {
    normalize: focusOutput.parseStatus,
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
    code: protocolCode(verdict)
  };
}

function expectedFor(id: string): Observed {
  return OVERRIDES[id] ?? FALSE_TM0;
}

describe("ALP/eMPP TMM corpus", () => {
  const corpus = readCorpus();

  it("rechecks the committed JSON against ecash-lib and the independent reader", () => {
    execFileSync(process.execPath, [join(REPO_ROOT, "tests/protocol/generate-empp-tmm-fixtures.mjs"), "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const bytes = readFileSync(FIXTURE_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FIXTURE_SHA256);
    expect(bytes.toString("utf8")).not.toContain("VALID_FORMAT");
    expect(corpus.ecashLib).toBe("4.13.0");
    expect(corpus.byteBudget).toBe(223);
    expect(corpus.boundaryNote).toContain("not a settled RMZ amount");
  });

  it("keeps the required cases and separates structural axes from production acceptance", () => {
    const ids = corpus.cases.map((item) => item.id);
    const expectedIds = [...DEFAULT_IDS, ...Object.keys(OVERRIDES)];
    expect(ids.slice().sort()).toEqual(expectedIds.slice().sort());
    expect(ids).toHaveLength(29);
    for (const item of corpus.cases) {
      const script = Buffer.from(
        item.outputs.find((output) => output.outputIndex === item.focusOutputIndex)?.scriptHex ?? "",
        "hex"
      );
      expect(inspectEmppContainer(script, item.inspectOptions)).toEqual(item.independent);
      expect(item.independent.axes.authorship).toBe("NOT_DEMONSTRATED");
      expect(item.independent.axes.attributableTransfer).toBe(false);
      expect(item.independent.axes.settlement).toBe("PENDING");
      expect(item.independent.axes.tokenHistory).toBe("NOT_CHECKED");
      const observed = observe(item);
      expect(observed).toEqual(expectedFor(item.id));
      expect(observed.status).not.toBe("VERIFIED_TM1");
      expect(observed.status).not.toBe("VERIFIED");
      if (item.independent.axes.wireShape === "PROPOSED_SHAPE") {
        expect(observed.status === "INVALID_MEMO" || observed.status === "MULTIPLE_MEMOS").toBe(true);
      }
    }
  });

  it("records the false TM0 classification without treating the proposed shape as acceptance", () => {
    const positive = requireCase(corpus, "alp-send-plus-one-tmm");
    expect(positive.outputs[0]?.scriptHex).toBe(POSITIVE_SCRIPT);
    expect(positive.outputs[0]?.scriptHex.startsWith("6a50")).toBe(true);
    expect(positive.outputs[0]?.scriptHex).toContain(corpus.canonicalTmmHex);
    expect(positive.independent.container).toBe("CANONICAL");
    expect(positive.independent.axes.containerValid).toBe(true);
    expect(positive.independent.axes.alpStructurallyValid).toBe(true);
    expect(positive.independent.axes.tmmStructurallyValid).toBe(true);
    expect(positive.independent.axes.wireShape).toBe("PROPOSED_SHAPE");
    expect(positive.independent.alp.tokenId).toBe(corpus.rmzTokenId);
    expect(positive.independent.alp.atomMap).toEqual([{ outputIndex: 1, atoms: "125" }]);
    expect(positive.independent.tmm.entries[0]?.hex).toBe(corpus.canonicalTmmHex);
    const transaction = transactionFor(positive);
    const candidate = findTm0Candidates(transaction)[0];
    expect(candidate).toBeDefined();
    expect(Buffer.from(candidate?.bytes ?? []).toString("hex")).toBe(corpus.canonicalTmmHex);
    expect(findTm1Candidates(transaction)).toEqual([]);
    expect(observe(positive)).toEqual(FALSE_TM0);
  });

  it("keeps social version 0x02 inactive and does not read an eMPP script as a POST", () => {
    const control = requireCase(corpus, "two-push-social-v2-inactive");
    expect(control.independent.container).toBe("NOT_EMPP");
    const observed = observe(control);
    expect(observed.isTm1).toBe(true);
    expect(observed.parseCode).toBe("UNSUPPORTED_VERSION");
    expect(observed.status).toBe("INVALID_TM1");
    expect(observed.code).toBe("UNSUPPORTED_VERSION");
    expect(observed.memo).toEqual([{ protocol: "TM1", outputIndex: 0, pushIndex: null }]);
  });

  it("shows the byte-budget disappearance separately from the independent section parse", () => {
    for (const id of ["budget-natural-225", "budget-exact-224"] as const) {
      const item = requireCase(corpus, id);
      expect(item.outputs[0]?.scriptHex).toContain(corpus.canonicalTmmHex);
      expect(item.independent.scriptByteLength).toBe(id === "budget-natural-225" ? 225 : 224);
      expect(item.independent.flags).toContain("BYTE_BUDGET_EXCEEDED");
      expect(item.independent.axes.alpStructurallyValid).toBe(true);
      expect(item.independent.axes.tmmStructurallyValid).toBe(true);
      expect(observe(item).status).toBe("NO_MEMO");
      expect(observe(item).normalize).toBe("malformed");
    }
    const inside = requireCase(corpus, "budget-exact-223");
    expect(inside.independent.scriptByteLength).toBe(223);
    expect(inside.independent.flags).toContain("EXTRA_PUSH");
    expect(inside.independent.flags).not.toContain("BYTE_BUDGET_EXCEEDED");
    expect(observe(inside).status).toBe("INVALID_MEMO");
    const natural = requireCase(corpus, "budget-natural-219");
    expect(natural.independent.scriptByteLength).toBe(219);
    expect(natural.independent.axes.wireShape).toBe("PROPOSED_SHAPE");
    expect(observe(natural).code).toBe("INVALID_FORMAT");
  });

  it("rejects malformed ALP, unsupported actions, order, attribution, and cardinality in their own axes", () => {
    const only = requireCase(corpus, "alp-send-only");
    expect(only.independent.axes.alpStructurallyValid).toBe(true);
    expect(only.independent.flags).toContain("TMM_ABSENT");
    expect(observe(only).status).toBe("NO_MEMO");

    const duplicate = requireCase(corpus, "duplicate-tmm");
    expect(duplicate.independent.flags).toContain("DUPLICATE_TMM");
    expect(duplicate.independent.tmm.entries).toHaveLength(2);
    expect(observe(duplicate).status).toBe("MULTIPLE_MEMOS");

    expect(requireCase(corpus, "tmm-truncated-target").independent.flags).toEqual([
      "WRONG_LENGTH",
      "TRUNCATED_TARGET",
      "TARGET_MISMATCH"
    ]);
    expect(requireCase(corpus, "tmm-overlong-target").independent.flags).toContain("OVERLONG_TARGET");
    expect(requireCase(corpus, "tmm-wrong-version").independent.flags).toEqual(["WRONG_VERSION"]);
    expect(requireCase(corpus, "tmm-wrong-event").independent.flags).toEqual(["WRONG_EVENT"]);
    expect(requireCase(corpus, "tmm-reversed-target").independent.flags).toEqual(["REVERSED_TARGET"]);
    expect(requireCase(corpus, "tmm-reversed-target").independent.axes.tmmStructurallyValid).toBe(true);
    expect(requireCase(corpus, "wrong-token-id").independent.axes.alpStructurallyValid).toBe(true);
    expect(requireCase(corpus, "wrong-token-id").independent.flags).toContain("WRONG_TOKEN_ID");
    expect(requireCase(corpus, "alp-truncated-entry").independent.flags).toContain("ALP_MALFORMED");
    expect(requireCase(corpus, "alp-burn-not-admitted").independent.flags).toContain("ACTION_NOT_ADMITTED");
    expect(requireCase(corpus, "alp-mint-not-admitted").independent.flags).toContain("ACTION_NOT_ADMITTED");
    expect(requireCase(corpus, "alp-unknown-action").independent.flags).toContain("ACTION_NOT_ADMITTED");
    expect(requireCase(corpus, "alternate-entry-order").independent.flags).toContain("ORDER_MISMATCH");
    expect(requireCase(corpus, "non-minimal-tmm-push").independent.container).toBe("PARSEABLE");
    expect(requireCase(corpus, "non-minimal-tmm-push").independent.axes.tmmStructurallyValid).toBe(true);
    expect(observe(requireCase(corpus, "non-minimal-tmm-push")).code).toBe("INVALID_FORMAT");

    const truncated = requireCase(corpus, "truncated-script");
    expect(truncated.independent.container).toBe("INVALID");
    expect(truncated.independent.axes.alpStructurallyValid).toBe(true);
    expect(observe(truncated).status).toBe("NO_MEMO");

    const attribution = requireCase(corpus, "alp-wrong-output-attribution");
    expect(attribution.independent.axes.alpStructurallyValid).toBe(true);
    expect(attribution.independent.axes.transfer).toBe("OUTPUT_ATTRIBUTION_MISMATCH");
    expect(attribution.independent.axes.settlement).toBe("PENDING");
    expect(requireCase(corpus, "alp-zero-atoms").independent.axes.transfer).toBe("NO_POSITIVE_ATOMS");

    const author = requireCase(corpus, "tmm-author-index-255");
    expect(author.independent.axes.wireShape).toBe("PROPOSED_SHAPE");
    expect(author.independent.axes.authorship).toBe("NOT_DEMONSTRATED");
    expect(observe(author).code).toBe("INVALID_UTF8");
    expect(observe(requireCase(corpus, "tmm-non-utf8-target")).code).toBe("INVALID_UTF8");

    const besideTm1 = requireCase(corpus, "empp-beside-one-tm1");
    const post = parseTm1Output({
      valueSats: 0n,
      script: Uint8Array.from(Buffer.from(
        besideTm1.outputs.find((output) => output.role === "tm1-post")?.scriptHex ?? "",
        "hex"
      ))
    });
    expect(post.eventType).toBe("POST");
    expect(post.version).toBe(1);
    expect(besideTm1.independent.axes.wireShape).toBe("PROPOSED_SHAPE");
    expect(observe(besideTm1).status).toBe("MULTIPLE_MEMOS");
    expect(observe(besideTm1).tm1).toEqual([1]);

    const unrelated = requireCase(corpus, "empp-beside-unrelated-op-return");
    expect(unrelated.outputs.some((output) => output.scriptHex === "6a04deadbeef")).toBe(true);
    expect(observe(unrelated).tm1).toEqual([]);
    expect(observe(unrelated).memo).toEqual([{ protocol: "TM0", outputIndex: 0, pushIndex: 2 }]);

    expect(observe(requireCase(corpus, "empp-beside-tm0")).memo).toEqual([
      { protocol: "TM0", outputIndex: 0, pushIndex: 2 },
      { protocol: "TM0", outputIndex: 1, pushIndex: 0 }
    ]);
  });

  it("keeps the S0-07 evidence open and records the compatibility block", () => {
    const evidence = readFileSync(EVIDENCE_PATH, "utf8");
    expect(evidence).toContain(FIXTURE_SHA256);
    expect(evidence).toContain(POSITIVE_SCRIPT);
    expect(evidence).toContain("FALSE-TM0-CLASSIFICATION");
    expect(evidence).toContain("getStackArray");
    expect(evidence).toContain("INVALID_MARKER");
    expect(evidence).toContain("INVALID_MEMO");
    expect(evidence).toContain("INVALID_FORMAT");
    expect(evidence).toContain("INVALID_UTF8");
    expect(evidence).toContain("compatibility block");
    expect(evidence).toContain("tests/fixtures/rfc0001-empp-tmm.json");
    expect(evidence).toContain("3/3");
    expect(evidence).toContain("not full-chain coverage");
    expect(evidence).toContain("does not claim cryptographically independent prevout provenance");
    expect(evidence).toContain("does not complete S0-05");
    expect(evidence).toContain("does not complete S0-06");
    expect(evidence).toContain("S0-07 remains unsatisfied");
    expect(evidence).toContain("HISTORICAL-MAINNET remains open");
    expect(evidence).toContain("EMPP-ALP");
    expect(evidence).toContain("M1.7.4");
    expect(evidence).toContain("ALP ancestry and token validity");
    expect(evidence).toContain("double-count prevention");
    expect(evidence).toContain("Social version `0x02` stays inactive");
    expect(evidence).not.toMatch(/S0-07 is satisfied|S0-07: complete|S0: CLOSED/u);
    const pending = evidence.slice(evidence.indexOf("## Pending evidence"));
    expect(pending).not.toContain("S0-07-PROFILE-DECISION");
  });
});
