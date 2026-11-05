import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  digestHex,
  inputUnlockMatchesPrevout,
  parseTx,
  sighashByteAt,
  signatureMatches
} from "./canonical-tm1-independent-verify.mjs";
import { agree } from "./generate-canonical-tm1-fixtures.mjs";
import {
  decodeReplyScript,
  encodeReplyScript,
  encodeReplyScriptFixed,
  illustrativeReplyScriptHex
} from "./reply-envelope-independent.mjs";
import {
  classifyReplyParent,
  coreV1PostAuthorIndex,
  designatedAuthorHash160,
  applyReplyEvents,
  emptyReplyThreadState,
  replayReplies
} from "./reply-thread-independent.mjs";
import { isTm1ProtocolError, parseTm1Output } from "../../packages/protocol/src/index.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-reply.json");
const NOTE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-REPLY.md");
const MATRIX_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-S0-EVIDENCE-MATRIX.md");
const PUBLIC_RMZ = "c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908";

const FROZEN: Readonly<Record<string, string>> = {
  "tests/fixtures/rfc0001-empp-tmm.json":
    "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8",
  "tests/fixtures/rfc0001-empp-sec17-decisions.json":
    "76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca",
  "tests/fixtures/rfc0001-sec17-dispatch-matrix.json":
    "24ae49302406bd9f2793f749fa96235d1ea6c368c03a72f850c96208d49c5633",
  "tests/fixtures/rfc0001-alp-ancestry.json":
    "5f5dbd942df0d12a1626830e8bbdbd3100770e2aec508b6a872a2e4c74b8bec8",
  "tests/fixtures/rfc0001-alp-replay.json":
    "443a8d07171a8c9e28008808f7f854cf22688f0e41fa7c577a9fc8b48d772712",
  "tests/fixtures/rfc0001-mainnet-tm1-d07.json":
    "53afea6a140146e3e483074b5c9ab36d1dac684c4ff58300a8cc8a1e93baed08",
  "tests/fixtures/rfc0001-canonical-tm1-p2pkh.json":
    "dad39e8b3b8965eda6c6241e3a822c2aace88abd51bdfbd765e2758f15f3e694",
  "tests/fixtures/rfc0001-sec17-coexistence.json":
    "8913aa8643b1553e7cd5e29b92e54c9ee83de2245aedbf80de91d6b0d05ec883",
  "tests/fixtures/rfc0001_regtest_reference.json":
    "b4fe3c176eac1144cd9b625c2daf65f09be2a4e060090eee5703a2d8b06f4bbf",
  "tests/fixtures/rfc0001-reactions.json":
    "ab6fdbaf2513718473fe5c925fc9e381b3ad6dbd164fc7b9099549df654f72cc",
  "tests/fixtures/rfc0001-tip-xec.json":
    "a127f9f5272c44fce21b389f9c97f7331a5781f09b1a532f50aad02c3930b536"
};

const D07_TXIDS = [
  "fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd",
  "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8",
  "0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150"
] as const;

const REACTION_TESTS = [
  "regenerates the reaction corpus and keeps the frozen bytes",
  "accepts a 43-byte reaction script and Core still rejects version 0x02",
  "checks Schnorr, ECDSA, sighash, and nonzero author indexes",
  "withholds altered signatures, bad scripts, and ineligible targets",
  "replays likes without duplicating the active counter",
  "does not let the second author clear the first",
  "selects like state from the chosen synthetic branch",
  "promotes a mempool reaction when the same txid is confirmed",
  "reorders an older confirmed event that arrives in a later batch",
  "updates a withheld reaction when replayed after target resolution while staying idempotent",
  "restores a checkpoint and keeps mempool events out of the confirmed count",
  "records laboratory evidence without closing the gates"
] as const;

const TIP_TESTS = [
  "regenerates the tip corpus and keeps the frozen bytes",
  "accepts a 42-byte tip script and Core still rejects version 0x02",
  "checks Schnorr, ECDSA, sighash, and a nonzero tipper index",
  "attributes only the recipient outputs",
  "rejects recipient funding, third-party inputs, and self tips",
  "withholds bad signatures, bad prevouts, and ineligible targets",
  "records laboratory evidence without closing the gates"
] as const;

interface InputSpec {
  txid: string;
  outIdx: number;
  prevoutSats: string;
  outputScriptHex: string | null;
  scriptType: string;
  label?: string;
}

interface TargetRow {
  id: string;
  group: string;
  kind: string;
  network: string;
  signatureAlgorithm: string;
  authorInputIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: InputSpec[];
  authorHash160: string | null;
  outputScriptHex: string;
  authorship: string;
  authorErrorCode: string | null;
  eventDataUtf8: string | null;
  parentLink?: string;
  rootPostTxid?: string;
  depth?: number;
}

interface ReplyRow {
  id: string;
  group: string;
  kind?: string;
  network: string;
  signatureAlgorithm: string;
  signatureInputIndex: number;
  envelopeAuthorIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: InputSpec[];
  sighashByte: number;
  outputScriptHex: string;
  scriptLength: number;
  digestHex: string | null;
  preMutationDigestHex: string;
  signatureOk: boolean | null;
  structuralOk: boolean;
  structuralError: string | null;
  authorInputIndex: number | null;
  authorHash160: string | null;
  authorship: string;
  authorErrorCode: string | null;
  parentTxid: string | null;
  parentLink: string;
  parentLinkDetail: string | null;
  parentKind: string | null;
  rootPostTxid: string | null;
  depth: number | null;
  replyTextUtf8: string | null;
  replyTextByteLength: number | null;
  eligibleForThread: boolean;
}

interface ReplyFixture {
  schema: string;
  network: string;
  purpose: string;
  status: Record<string, unknown>;
  generator: Record<string, string>;
  absentParentTxid: string;
  targets: TargetRow[];
  replies: ReplyRow[];
  structures: { id: string; scriptHex: string; errorCode: string }[];
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function tm1Code(script: Uint8Array): string {
  try {
    const parsed = parseTm1Output({ script, valueSats: 0n });
    return `ACCEPTED:${parsed.eventType}:${parsed.eventData}`;
  } catch (error: unknown) {
    if (!isTm1ProtocolError(error)) {
      throw error;
    }
    return error.code;
  }
}

function outputScript(rawTransactionHex: string): Uint8Array {
  const tx = parseTx(rawTransactionHex) as { outputs: { script: Uint8Array; sats: bigint }[] };
  const output = tx.outputs[0];
  if (output === undefined) {
    throw new Error("Missing output 0.");
  }
  return output.script;
}

function requireRow(rows: readonly ReplyRow[], id: string): ReplyRow {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`Missing reply row ${id}.`);
  }
  return found;
}

function requireTarget(rows: readonly TargetRow[], id: string): TargetRow {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`Missing reply target ${id}.`);
  }
  return found;
}

function loadFixture(): ReplyFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ReplyFixture;
}

describe("synthetic social v2 REPLY laboratory", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = loadFixture();
  const note = readFileSync(NOTE_PATH, "utf8");
  const replies = fixture.replies;
  const positives = replies.filter((row) => row.group === "positive");
  const negatives = replies.filter((row) => row.group === "negative");
  const catalog = new Map(fixture.targets.map((target) => [target.txid, target]));

  it("regenerates the reply corpus and keeps the frozen bytes", () => {
    execFileSync(process.execPath, ["tests/protocol/generate-reply-fixtures.mjs", "--check"], {
      cwd: REPO_ROOT
    });
    const generator = readFileSync(join(REPO_ROOT, "tests/protocol/generate-reply-fixtures.mjs"), "utf8");
    expect(generator).not.toMatch(/\bfetch\(|broadcast/u);
    expect(fixtureText).not.toContain("SETTLED");
    expect(fixtureText).not.toContain("privateKeyHex");
    expect(fixtureText).not.toContain(PUBLIC_RMZ);
    expect(fixture.schema).toBe("tonalli-memo.rfc0001.reply.s0");
    expect(fixture.network).toBe("lab-reply-net");
    expect(fixture.status).toMatchObject({
      rfc0001: "PROPOSED — NOT RATIFIED",
      sec17: "DESIGN_APPROVED_VALIDATION_PENDING",
      s0: "OPEN",
      s005: "OPEN",
      s1: "NOT AUTHORIZED",
      m174: "OPEN",
      socialVersion: "INACTIVE",
      confirmation: "NOT_DEMONSTRATED",
      settlement: "NOT_DEMONSTRATED",
      networkReorg: "NOT_DEMONSTRATED",
      indexer: "NOT_A_PRODUCTIVE_INDEXER",
      chronikValidated: false,
      productionDispatch: false
    });
    for (const [path, digest] of Object.entries(FROZEN)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(digest);
    }
    const matrix = JSON.parse(
      readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-dispatch-matrix.json"), "utf8")
    ) as { rows: unknown[] };
    expect(matrix.rows).toHaveLength(127);
    const audit = readFileSync(MATRIX_PATH, "utf8");
    expect(audit.match(/^### `/gmu)).toHaveLength(140);
    const d07 = JSON.parse(
      readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-mainnet-tm1-d07.json"), "utf8")
    ) as { entries: { txid: string }[] };
    expect(d07.entries.map((entry) => entry.txid)).toEqual([...D07_TXIDS]);
    expect(catalog.has(fixture.absentParentTxid)).toBe(false);

    const reactionSource = readFileSync(
      join(REPO_ROOT, "tests/protocol/rfc0001_reactions.test.ts"),
      "utf8"
    );
    for (const title of REACTION_TESTS) {
      expect(reactionSource).toContain(title);
    }

    const tipSource = readFileSync(
      join(REPO_ROOT, "tests/protocol/rfc0001_tip_xec.test.ts"),
      "utf8"
    );
    for (const title of TIP_TESTS) {
      expect(tipSource).toContain(title);
    }

    expect(readFileSync(join(REPO_ROOT, "tests/protocol/rfc0001_alp_ancestry.test.ts"), "utf8")).toContain(
      "describe("
    );
    expect(readFileSync(join(REPO_ROOT, "tests/protocol/rfc0001_alp_replay.test.ts"), "utf8")).toContain(
      "describe("
    );
  });

  it("accepts 43..223 byte reply scripts and Core still rejects version 0x02", () => {
    expect(positives).toHaveLength(9);
    expect(negatives).toHaveLength(20);

    expect(
      encodeReplyScript({
        version: 0x02,
        eventType: 0x02,
        authorInputIndex: 0x00,
        parentTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        replyText: "agree"
      })
    ).toEqual(
      encodeReplyScriptFixed({
        version: 0x02,
        eventType: 0x02,
        authorInputIndex: 0x00,
        parentTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        replyText: "agree"
      })
    );

    const illustrative = illustrativeReplyScriptHex();
    expect(illustrative).toHaveLength(92);
    expect(illustrative.startsWith("6a04544d4d0027020200")).toBe(true);

    const decodedIllustrative = decodeReplyScript(Buffer.from(illustrative, "hex")) as {
      ok: boolean;
      scriptLength: number;
      pushCount: number;
      eventName: string;
      replyTextUtf8: string;
    };
    expect(decodedIllustrative).toMatchObject({
      ok: true,
      scriptLength: 46,
      pushCount: 2,
      eventName: "REPLY",
      replyTextUtf8: "hola"
    });

    const rootPost0 = requireTarget(fixture.targets, "root-post-index0");
    const rootPost1 = requireTarget(fixture.targets, "root-post-index1");
    const pending = requireTarget(fixture.targets, "pending-post-target");
    const payment = requireTarget(fixture.targets, "ineligible-payment-target");

    expect(tm1Code(outputScript(rootPost0.rawTransactionHex))).toBe("ACCEPTED:POST:root post from author A at index 0");
    expect(tm1Code(outputScript(rootPost1.rawTransactionHex))).toBe("ACCEPTED:POST:root post from author B at index 1");
    expect(tm1Code(outputScript(pending.rawTransactionHex))).toBe("ACCEPTED:POST:pending post with flipped signature");
    expect(tm1Code(outputScript(payment.rawTransactionHex))).toBe("INVALID_MARKER");

    expect(coreV1PostAuthorIndex(rootPost0.rawTransactionHex)).toBe(0);
    expect(coreV1PostAuthorIndex(rootPost1.rawTransactionHex)).toBe(1);
    expect(coreV1PostAuthorIndex(payment.rawTransactionHex)).toBe(null);

    // Core v1.0 parser rejects all social v2 REPLY scripts
    for (const row of replies) {
      const code = tm1Code(outputScript(row.rawTransactionHex));
      if (row.structuralOk) {
        expect(code).toBe("UNSUPPORTED_VERSION");
      } else if (row.id === "neg-nonminimal-push") {
        expect(code).toBe("INVALID_FORMAT");
      } else {
        expect(["UNSUPPORTED_VERSION", "INVALID_FORMAT", "PAYLOAD_TOO_LARGE"]).toContain(code);
      }
    }

    // Direct push boundary (40 bytes text -> 75B envelope, 82B script)
    const b40 = requireRow(replies, "reply-push-boundary-40b");
    expect(b40.scriptLength).toBe(82);
    expect(b40.outputScriptHex.startsWith("6a04544d4d004b")).toBe(true);

    // PUSHDATA1 boundary (41 bytes text -> 76B envelope, 84B script)
    const b41 = requireRow(replies, "reply-push-boundary-41b");
    expect(b41.scriptLength).toBe(84);
    expect(b41.outputScriptHex.startsWith("6a04544d4d004c4c")).toBe(true);

    // Max text boundary (180 bytes text -> 215B envelope, 223B script)
    const max180 = requireRow(replies, "reply-max-text-180b");
    expect(max180.scriptLength).toBe(223);
    expect(max180.outputScriptHex.startsWith("6a04544d4d004cd7")).toBe(true);

    // Structural probes
    for (const structure of fixture.structures) {
      const decoded = decodeReplyScript(Buffer.from(structure.scriptHex, "hex")) as { ok: boolean; errorCode: string };
      expect(decoded.ok).toBe(false);
      expect(decoded.errorCode).toBe(structure.errorCode);
    }
  });

  it("checks Schnorr, ECDSA, sighash, and nonzero author indexes", () => {
    const seenSighash = new Set<number>();
    const seenAlgorithm = new Set<string>();
    const seenIndex = new Set<number>();

    for (const row of replies) {
      if (row.id === "neg-prevout-missing") {
        expect(row.signatureOk).toBe(null);
        expect(row.digestHex).toBe(null);
      } else {
        if (row.id !== "neg-unsupported-script") {
          agree(row.rawTransactionHex, row.inputs, row.signatureInputIndex, row.sighashByte, row.id);
        }
        expect(sighashByteAt(row.rawTransactionHex, row.signatureInputIndex)).toBe(row.sighashByte);
        expect(digestHex(row.rawTransactionHex, row.inputs, row.signatureInputIndex, row.sighashByte)).toBe(
          row.digestHex
        );
        expect(
          signatureMatches(row.rawTransactionHex, row.inputs, row.signatureInputIndex, row.signatureAlgorithm)
        ).toBe(row.signatureOk);
      }

      if (row.signatureOk === true && row.structuralOk === true && row.authorErrorCode === null) {
        expect(
          inputUnlockMatchesPrevout(
            row.rawTransactionHex,
            row.inputs,
            row.signatureInputIndex,
            row.signatureAlgorithm
          )
        ).toBe(true);
      }

      if (row.group === "positive") {
        seenSighash.add(row.sighashByte);
        seenAlgorithm.add(row.signatureAlgorithm);
        seenIndex.add(row.signatureInputIndex);
      }
    }

    expect([...seenSighash].sort((a, b) => a - b)).toEqual([0x41, 0xc1]);
    expect([...seenAlgorithm].sort()).toEqual(["ecdsa", "schnorr"]);
    expect([...seenIndex].sort((a, b) => a - b)).toEqual([0, 1, 2]);

    const index1 = requireRow(replies, "reply-schnorr-index1-41");
    expect(designatedAuthorHash160(index1.rawTransactionHex, 0)).not.toBe(index1.authorHash160);
    expect(designatedAuthorHash160(index1.rawTransactionHex, 1)).toBe(index1.authorHash160);
  });

  it("verifies parent eligibility, depth resolution, and separates authorship from parent linkage", () => {
    const directChild = requireRow(replies, "reply-schnorr-index0-41");
    expect(directChild.parentLink).toBe("PARENT_VERIFIED");
    expect(directChild.parentKind).toBe("core-v1-post");
    expect(directChild.depth).toBe(1);
    expect(directChild.rootPostTxid).toBe(requireTarget(fixture.targets, "root-post-index0").txid);
    expect(directChild.eligibleForThread).toBe(true);

    const nestedChild = requireRow(replies, "reply-nested-child");
    expect(nestedChild.parentLink).toBe("PARENT_VERIFIED");
    expect(nestedChild.parentKind).toBe("reply");
    expect(nestedChild.depth).toBe(2);
    expect(nestedChild.rootPostTxid).toBe(requireTarget(fixture.targets, "root-post-index0").txid);
    expect(nestedChild.eligibleForThread).toBe(true);

    // Strict separation: authorship is LAB_VALID even when parent is absent, pending, or ineligible
    const absentParent = requireRow(replies, "neg-parent-absent");
    expect(absentParent.authorship).toBe("LAB_VALID");
    expect(absentParent.signatureOk).toBe(true);
    expect(absentParent.parentLink).toBe("PARENT_PENDING");
    expect(absentParent.parentLinkDetail).toBe("ABSENT");
    expect(absentParent.eligibleForThread).toBe(false);

    const pendingParent = requireRow(replies, "neg-parent-pending");
    expect(pendingParent.authorship).toBe("LAB_VALID");
    expect(pendingParent.parentLink).toBe("INVALID_PARENT");
    expect(pendingParent.parentLinkDetail).toBe("PARENT_AUTHOR_INVALID");
    expect(pendingParent.eligibleForThread).toBe(false);

    const paymentParent = requireRow(replies, "neg-parent-payment");
    expect(paymentParent.authorship).toBe("LAB_VALID");
    expect(paymentParent.parentLink).toBe("INVALID_PARENT");
    expect(paymentParent.parentLinkDetail).toBe("INELIGIBLE_MESSAGE_TYPE");
    expect(paymentParent.eligibleForThread).toBe(false);

    const otherNetParent = requireRow(replies, "neg-parent-other-network");
    expect(otherNetParent.authorship).toBe("LAB_VALID");
    expect(otherNetParent.parentLink).toBe("INVALID_PARENT");
    expect(otherNetParent.parentLinkDetail).toBe("OTHER_NETWORK");
    expect(otherNetParent.eligibleForThread).toBe(false);

    const dupCandidatesParent = requireRow(replies, "neg-parent-duplicate-candidates");
    expect(dupCandidatesParent.authorship).toBe("LAB_VALID");
    expect(dupCandidatesParent.parentLink).toBe("INVALID_PARENT");
    expect(dupCandidatesParent.parentLinkDetail).toBe("MULTIPLE_MEMOS");
    expect(dupCandidatesParent.eligibleForThread).toBe(false);

    const dupTarget = requireTarget(fixture.targets, "duplicate-candidate-post-target");
    expect(coreV1PostAuthorIndex(dupTarget.rawTransactionHex)).toBe(null);
  });

  it("withholds altered signatures, mutated envelopes, out of range index, and invalid prevouts", () => {
    expect(requireRow(replies, "neg-signature-flipped").authorErrorCode).toBe("INVALID_AUTHOR_SIGNATURE");
    expect(requireRow(replies, "neg-envelope-mutated").authorErrorCode).toBe("INVALID_AUTHOR_SIGNATURE");
    expect(requireRow(replies, "neg-output-mutated").authorErrorCode).toBe("INVALID_AUTHOR_SIGNATURE");
    expect(requireRow(replies, "neg-author-index-5").authorErrorCode).toBe("AUTHOR_INPUT_OUT_OF_RANGE");
    expect(requireRow(replies, "neg-prevout-missing").authorErrorCode).toBe("PREVOUT_UNAVAILABLE");
    expect(requireRow(replies, "neg-prevout-script").authorErrorCode).toBe("INVALID_AUTHOR_SIGNATURE");
    expect(requireRow(replies, "neg-prevout-amount").authorErrorCode).toBe("INVALID_AUTHOR_SIGNATURE");
    expect(requireRow(replies, "neg-unsupported-script").authorErrorCode).toBe("UNSUPPORTED_AUTHOR_SCRIPT");

    expect(requireRow(replies, "neg-nonminimal-push").structuralError).toBe("INVALID_FORMAT");
    expect(requireRow(replies, "neg-empty-text").structuralError).toBe("INVALID_FORMAT");
    expect(requireRow(replies, "neg-text-too-long").structuralError).toBe("INVALID_FORMAT");
    expect(requireRow(replies, "neg-malformed-utf8").structuralError).toBe("MALFORMED_UTF8");
    expect(requireRow(replies, "neg-version-09").structuralError).toBe("UNSUPPORTED_VERSION");
    expect(requireRow(replies, "neg-event-7e").structuralError).toBe("UNSUPPORTED_EVENT");

    for (const neg of negatives) {
      expect(neg.eligibleForThread).toBe(false);
    }
  });

  it("replays threads deterministically, deduplicates by txid, and handles mempool provisionally", () => {
    const rootTxid = requireTarget(fixture.targets, "root-post-index0").txid;
    const r1 = requireRow(replies, "reply-schnorr-index0-41");
    const r2 = requireRow(replies, "reply-schnorr-index1-41");
    const rNested = requireRow(replies, "reply-nested-child");
    const rPending = requireRow(replies, "neg-parent-pending");

    const events = [
      {
        confirmation: "CONFIRMED" as const,
        blockHeight: 800001,
        position: 1,
        txid: r1.txid,
        parentTxid: r1.parentTxid!,
        rootPostTxid: r1.rootPostTxid!,
        authorHash160: r1.authorHash160!,
        replyTextUtf8: r1.replyTextUtf8!,
        depth: r1.depth!,
        structuralOk: r1.structuralOk,
        authorship: r1.authorship,
        parentLink: r1.parentLink,
        eligibleForThread: r1.eligibleForThread
      },
      {
        confirmation: "CONFIRMED" as const,
        blockHeight: 800001,
        position: 2,
        txid: r2.txid,
        parentTxid: r2.parentTxid!,
        rootPostTxid: r2.rootPostTxid!,
        authorHash160: r2.authorHash160!,
        replyTextUtf8: r2.replyTextUtf8!,
        depth: r2.depth!,
        structuralOk: r2.structuralOk,
        authorship: r2.authorship,
        parentLink: r2.parentLink,
        eligibleForThread: r2.eligibleForThread
      },
      {
        confirmation: "CONFIRMED" as const,
        blockHeight: 800002,
        position: 1,
        txid: rNested.txid,
        parentTxid: rNested.parentTxid!,
        rootPostTxid: rNested.rootPostTxid!,
        authorHash160: rNested.authorHash160!,
        replyTextUtf8: rNested.replyTextUtf8!,
        depth: rNested.depth!,
        structuralOk: rNested.structuralOk,
        authorship: rNested.authorship,
        parentLink: rNested.parentLink,
        eligibleForThread: rNested.eligibleForThread
      },
      {
        confirmation: "CONFIRMED" as const,
        blockHeight: 800003,
        position: 1,
        txid: rPending.txid,
        parentTxid: rPending.parentTxid!,
        rootPostTxid: rPending.rootPostTxid,
        authorHash160: rPending.authorHash160!,
        replyTextUtf8: rPending.replyTextUtf8,
        depth: rPending.depth,
        structuralOk: rPending.structuralOk,
        authorship: rPending.authorship,
        parentLink: rPending.parentLink,
        eligibleForThread: rPending.eligibleForThread
      }
    ];

    const state = replayReplies(events);
    expect(state.totalConfirmedCount).toBe(3);
    expect(state.threads[rootTxid]).toHaveLength(3);
    expect(state.withheld).toHaveLength(1);
    expect(state.withheld[0].txid).toBe(rPending.txid);

    // Idempotent deduplication: feeding duplicates leaves state identical
    const duplicateState = applyReplyEvents(state, events);
    expect(duplicateState.totalConfirmedCount).toBe(3);
    expect(duplicateState.threads[rootTxid]).toHaveLength(3);

    // Resolution: replaying a withheld pending reply with its verified resolution updates the thread
    const resolvedRPending = {
      confirmation: "CONFIRMED" as const,
      blockHeight: 800003,
      position: 1,
      txid: rPending.txid,
      parentTxid: rootTxid,
      rootPostTxid: rootTxid,
      authorHash160: rPending.authorHash160!,
      replyTextUtf8: rPending.replyTextUtf8,
      depth: 1,
      structuralOk: true,
      authorship: "LAB_VALID",
      parentLink: "PARENT_VERIFIED",
      eligibleForThread: true
    };
    const resolvedState = applyReplyEvents(state, [resolvedRPending]);
    expect(resolvedState.totalConfirmedCount).toBe(4);
    expect(resolvedState.threads[rootTxid]).toHaveLength(4);
    expect(resolvedState.withheld).toHaveLength(0);

    // Idempotence after resolution: delivering verified event again changes nothing
    const resolvedDuplicateState = applyReplyEvents(resolvedState, [resolvedRPending]);
    expect(resolvedDuplicateState.totalConfirmedCount).toBe(4);
    expect(resolvedDuplicateState.threads[rootTxid]).toHaveLength(4);
    expect(resolvedDuplicateState.withheld).toHaveLength(0);

    // Sequential replay: pending classification followed by verified classification updates cleanly
    const r1Pending = {
      ...events[0],
      parentLink: "PARENT_PENDING",
      eligibleForThread: false
    };
    const statePendingFirst = applyReplyEvents(
      applyReplyEvents(emptyReplyThreadState(), [r1Pending]),
      [events[0]]
    );
    expect(statePendingFirst.totalConfirmedCount).toBe(1);
    expect(statePendingFirst.threads[rootTxid]).toHaveLength(1);
    expect(statePendingFirst.withheld).toHaveLength(0);

    // Mempool handling: unconfirmed events are provisional and not in confirmed count
    const mempoolEvent = {
      confirmation: "MEMPOOL" as const,
      txid: "11".repeat(32),
      parentTxid: rootTxid,
      rootPostTxid: rootTxid,
      authorHash160: r1.authorHash160!,
      replyTextUtf8: "provisional mempool reply",
      depth: 1,
      structuralOk: true,
      authorship: "LAB_VALID",
      parentLink: "PARENT_VERIFIED",
      eligibleForThread: true
    };
    const stateWithMempool = applyReplyEvents(state, [mempoolEvent]);
    expect(stateWithMempool.totalConfirmedCount).toBe(3);
    expect(stateWithMempool.provisional).toHaveLength(1);
    expect(stateWithMempool.provisional[0].txid).toBe("11".repeat(32));

    // Cycle detection in classifyReplyParent
    const targetA = requireTarget(fixture.targets, "root-post-index0");
    const cycleRes = classifyReplyParent("lab-reply-net", targetA, targetA.txid, [targetA.txid]);
    expect(cycleRes.link).toBe("REFERENCE_CYCLE");
    expect(cycleRes.reason).toBe("CYCLE_DETECTED");
  });

  it("records laboratory evidence without closing the gates", () => {
    expect(note).toContain("RFC-0001 remains PROPOSED — NOT RATIFIED.");
    expect(note).toContain("M1.7.4 remains OPEN.");
    expect(note).toContain("S0-05 remains OPEN.");
    expect(note).toContain("S0 remains OPEN.");
    expect(note).toContain("S1 remains NOT AUTHORIZED.");
    expect(note).toContain("Social version `0x02` stays inactive in the production parser.");
  });
});
