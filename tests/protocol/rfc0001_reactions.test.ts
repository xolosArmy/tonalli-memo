import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  classifyAuthor,
  digestHex,
  inputUnlockMatchesPrevout,
  parseTx,
  sighashByteAt,
  signatureMatches,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import { agree } from "./generate-canonical-tm1-fixtures.mjs";
import {
  bytesToHex,
  decodeReactionScript,
  encodeReactionScript,
  encodeReactionScriptFixed
} from "./reaction-envelope-independent.mjs";
import {
  activeContributors,
  applyReactionEvents,
  classifyReactionTarget,
  cloneReactionState,
  designatedAuthorHash160,
  reactionStateKey,
  replayReactions
} from "./reaction-replay-independent.mjs";
import { isTm1ProtocolError, parseTm1Output } from "../../packages/protocol/src/index.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-reactions.json");
const NOTE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-REACTIONS.md");
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
    "b4fe3c176eac1144cd9b625c2daf65f09be2a4e060090eee5703a2d8b06f4bbf"
};

const D07_TXIDS = [
  "fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd",
  "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8",
  "0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150"
] as const;

const FORBIDDEN = [
  "S0 complete",
  "S0: CLOSED",
  "S0 CLOSED",
  "S0-05 satisfied",
  "S0-05 is satisfied",
  "SEC-17 mitigated",
  "SEC-17 is mitigated",
  "M1.7.4 closed",
  "M1.7.4 is closed"
] as const;

interface FixtureInput {
  prevoutSats: string;
  outputScriptHex: string | null;
  scriptType: string;
}

interface Row {
  id: string;
  group: string;
  kind: string;
  action: string;
  confirmation: "CONFIRMED" | "MEMPOOL" | null;
  blockHeight: number | null;
  position: number | null;
  network: string;
  signatureAlgorithm: "schnorr" | "ecdsa";
  signatureInputIndex: number;
  envelopeAuthorIndex: number | null;
  rawTransactionHex: string;
  txid: string;
  inputs: FixtureInput[];
  authorHash160: string | null;
  sighashByte: number;
  outputScriptHex: string;
  scriptLength: number;
  structuralOk: boolean | null;
  structuralError: string | null;
  framed: boolean;
  authorship: "LAB_VALID" | "LAB_INVALID";
  authorErrorCode: string | null;
  targetTxid: string | null;
  targetLink: string | null;
  eventDataUtf8?: string | null;
  digestHex: string;
  preMutationDigestHex: string;
}

interface StructureRow {
  id: string;
  scriptHex: string;
  errorCode: string;
  scriptLength: number;
}

interface ReactionFixture {
  schema: string;
  network: string;
  status: {
    rfc0001: string;
    sec17: string;
    s0: string;
    s005: string;
    s1: string;
    m174: string;
    socialVersion: string;
    confirmation: string;
    networkReorg: string;
    reorgFinality: string;
    indexer: string;
    chronikValidated: boolean;
    productionDispatch: boolean;
  };
  absentTargetTxid: string;
  targets: Row[];
  reactions: Row[];
  negatives: Row[];
  structures: StructureRow[];
  replay: {
    sequence: string[];
    ancestor: string[];
    branchA: string[];
    branchB: string[];
    authorship: string[];
    mempool: string[];
  };
}

interface ReplayEvent {
  txid: string;
  blockHeight: number | null;
  position: number | null;
  confirmation: "CONFIRMED" | "MEMPOOL";
  network: string;
  authorHash160: string | null;
  targetTxid: string;
  reactionKind: number;
  action: "REACTION" | "REACTION_REMOVE" | "NONE";
  structuralOk: boolean;
  authorship: "LAB_VALID" | "LAB_INVALID";
  targetLink: string;
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
  const tx = parseTx(rawTransactionHex) as { outputs: { script: Uint8Array }[] };
  const output = tx.outputs[0];
  if (output === undefined) {
    throw new Error("Missing output 0.");
  }
  return output.script;
}

function requireRow(rows: readonly Row[], id: string): Row {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`Missing reaction row ${id}.`);
  }
  return found;
}

function derivedTarget(row: Row): { kind: string; authorship: "LAB_VALID" | "LAB_INVALID" } {
  const script = outputScript(row.rawTransactionHex);
  let kind = "payment";
  try {
    const parsed = parseTm1Output({ script, valueSats: 0n });
    if (parsed.version === 1 && parsed.eventType === "POST") {
      kind = "core-v1-post";
    }
  } catch (error: unknown) {
    if (!isTm1ProtocolError(error)) {
      throw error;
    }
  }
  const author = classifyAuthor({
    rawTransactionHex: row.rawTransactionHex,
    authorInputIndex: 0,
    inputs: row.inputs,
    signatureAlgorithm: row.signatureAlgorithm
  }) as { valid: boolean };
  return { kind, authorship: author.valid ? "LAB_VALID" : "LAB_INVALID" };
}

function toEvent(row: Row, registry: ReadonlyMap<string, { kind: string; authorship: string }>): ReplayEvent {
  const script = outputScript(row.rawTransactionHex);
  expect(bytesToHex(script)).toBe(row.outputScriptHex);
  expect(txidOf(row.rawTransactionHex)).toBe(row.txid);
  const decoded = decodeReactionScript(script) as {
    ok: boolean;
    framed: boolean;
    errorCode: string | null;
    version?: number;
    eventType?: number;
    authorInputIndex?: number;
    targetTxid?: string;
    reactionKind?: number;
    eventName?: string;
    pushCount?: number;
    scriptLength?: number;
  };
  expect(decoded.ok).toBe(row.structuralOk);
  expect(decoded.errorCode).toBe(row.structuralError);
  expect(decoded.framed).toBe(row.framed);
  const authorIndex = decoded.framed ? decoded.authorInputIndex : row.envelopeAuthorIndex;
  if (authorIndex === undefined || authorIndex === null) {
    throw new Error(`${row.id} has no author index.`);
  }
  const author = classifyAuthor({
    rawTransactionHex: row.rawTransactionHex,
    authorInputIndex: authorIndex,
    inputs: row.inputs,
    signatureAlgorithm: row.signatureAlgorithm
  }) as { valid: boolean; errorCode: string | null };
  expect(author.valid ? "LAB_VALID" : "LAB_INVALID").toBe(row.authorship);
  expect(author.errorCode).toBe(row.authorErrorCode);
  const authorHash160 = designatedAuthorHash160(row.rawTransactionHex, authorIndex) as string | null;
  expect(authorHash160).toBe(row.authorHash160);
  const targetLink = decoded.framed
    ? classifyReactionTarget(registry.get(decoded.targetTxid ?? ""))
    : "NOT_FRAMED";
  expect(targetLink).toBe(row.targetLink);
  if (decoded.framed && decoded.ok === true) {
    const fields = {
      version: decoded.version,
      eventType: decoded.eventType,
      authorInputIndex: decoded.authorInputIndex,
      targetTxidHex: decoded.targetTxid,
      reactionKind: decoded.reactionKind
    };
    const direct = bytesToHex(encodeReactionScript(fields));
    const fixed = bytesToHex(encodeReactionScriptFixed(fields));
    expect(direct).toBe(fixed);
    expect(direct).toBe(row.outputScriptHex);
    expect(decoded.scriptLength).toBe(43);
    expect(decoded.pushCount).toBe(2);
    expect(row.outputScriptHex.startsWith("6a04544d4d0024")).toBe(true);
    expect(row.outputScriptHex.slice(20, 84)).toBe(decoded.targetTxid);
  }
  const action = decoded.ok ? decoded.eventName : row.action;
  if (action !== "REACTION" && action !== "REACTION_REMOVE" && action !== "NONE") {
    throw new Error(`${row.id} action ${action ?? "missing"}.`);
  }
  if (row.confirmation !== "CONFIRMED" && row.confirmation !== "MEMPOOL") {
    throw new Error(`${row.id} has no confirmation lane.`);
  }
  return {
    txid: row.txid,
    blockHeight: row.blockHeight,
    position: row.position,
    confirmation: row.confirmation,
    network: row.network,
    authorHash160,
    targetTxid: decoded.framed && decoded.targetTxid !== undefined ? decoded.targetTxid : "00".repeat(32),
    reactionKind: decoded.framed && decoded.reactionKind !== undefined ? decoded.reactionKind : 0,
    action,
    structuralOk: decoded.ok === true,
    authorship: author.valid ? "LAB_VALID" : "LAB_INVALID",
    targetLink
  };
}

function loadFixture(): ReactionFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ReactionFixture;
}

describe("synthetic REACTION and REACTION_REMOVE laboratory", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = loadFixture();
  const note = readFileSync(NOTE_PATH, "utf8");
  const reactions = fixture.reactions;
  const negatives = fixture.negatives;
  const rows = [...reactions, ...negatives];
  const registry = new Map(
    fixture.targets.map((target) => {
      const derived = derivedTarget(target);
      expect(derived.kind).toBe(target.kind);
      expect(derived.authorship).toBe(target.authorship);
      return [target.txid, derived] as const;
    })
  );
  const events = new Map(rows.map((row) => [row.id, toEvent(row, registry)]));

  function pick(ids: readonly string[]): ReplayEvent[] {
    return ids.map((id) => {
      const event = events.get(id);
      if (event === undefined) {
        throw new Error(`Missing replay event ${id}.`);
      }
      return event;
    });
  }

  it("regenerates the reaction corpus and keeps the frozen bytes", () => {
    execFileSync(process.execPath, ["tests/protocol/generate-reaction-fixtures.mjs", "--check"], {
      cwd: REPO_ROOT
    });
    const generator = readFileSync(join(REPO_ROOT, "tests/protocol/generate-reaction-fixtures.mjs"), "utf8");
    expect(generator).not.toMatch(/\bfetch\(|broadcast/u);
    expect(fixtureText).not.toContain("SETTLED");
    expect(fixtureText).not.toContain("VERIFIED");
    expect(fixtureText).not.toContain("privateKeyHex");
    expect(fixtureText).not.toContain(PUBLIC_RMZ);
    expect(fixture.schema).toBe("tonalli-memo.rfc0001.reactions.s0");
    expect(fixture.network).toBe("lab-reaction-net");
    expect(fixture.status).toMatchObject({
      rfc0001: "PROPOSED — NOT RATIFIED",
      sec17: "DESIGN_APPROVED_VALIDATION_PENDING",
      s0: "OPEN",
      s005: "OPEN",
      s1: "NOT AUTHORIZED",
      m174: "OPEN",
      socialVersion: "INACTIVE",
      confirmation: "NOT_DEMONSTRATED",
      networkReorg: "NOT_DEMONSTRATED",
      reorgFinality: "NOT_DEMONSTRATED",
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
    const d07 = JSON.parse(
      readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-mainnet-tm1-d07.json"), "utf8")
    ) as { entries: { txid: string }[] };
    expect(d07.entries.map((entry) => entry.txid)).toEqual([...D07_TXIDS]);
    const audit = readFileSync(MATRIX_PATH, "utf8");
    expect(audit.match(/^### `/gmu)).toHaveLength(140);
    expect(registry.has(fixture.absentTargetTxid)).toBe(false);
  });

  it("accepts a 43-byte reaction script and Core still rejects version 0x02", () => {
    const eligible = requireRow(fixture.targets, "eligible-post");
    const pending = requireRow(fixture.targets, "pending-post");
    const payment = requireRow(fixture.targets, "ineligible-payment");
    expect(tm1Code(outputScript(eligible.rawTransactionHex))).toBe("ACCEPTED:POST:reaction target post");
    expect(tm1Code(outputScript(pending.rawTransactionHex))).toBe("ACCEPTED:POST:reaction pending target");
    expect(tm1Code(outputScript(payment.rawTransactionHex))).toBe("INVALID_MARKER");
    expect(decodeReactionScript(outputScript(eligible.rawTransactionHex)).ok).toBe(false);
    for (const row of rows) {
      const code = tm1Code(outputScript(row.rawTransactionHex));
      if (row.framed) {
        expect(code).toBe("UNSUPPORTED_VERSION");
        expect(row.scriptLength).toBe(43);
      } else {
        expect(code).toBe("INVALID_FORMAT");
        expect(row.scriptLength).toBe(44);
      }
    }
    expect(requireRow(negatives, "neg-version-09").structuralError).toBe("UNSUPPORTED_VERSION");
    expect(requireRow(negatives, "neg-kind-7f").structuralError).toBe("UNSUPPORTED_REACTION_KIND");
    expect(requireRow(negatives, "neg-event-7e").structuralError).toBe("UNSUPPORTED_EVENT");
    expect(tm1Code(outputScript(requireRow(negatives, "neg-event-7e").rawTransactionHex))).toBe(
      "UNSUPPORTED_VERSION"
    );
    for (const structure of fixture.structures) {
      const decoded = decodeReactionScript(Buffer.from(structure.scriptHex, "hex"));
      expect(decoded.ok).toBe(false);
      expect(decoded.errorCode).toBe(structure.errorCode);
    }
    const like = requireRow(reactions, "seq-a-like");
    const duplicate = requireRow(reactions, "seq-a-like-dup");
    expect(like.outputScriptHex).toBe(duplicate.outputScriptHex);
    expect(like.txid).not.toBe(duplicate.txid);
    const display = eligible.txid;
    const reversed = display.match(/[0-9a-f]{2}/gu)?.reverse().join("");
    expect(like.outputScriptHex.slice(20, 84)).toBe(display);
    expect(like.outputScriptHex.slice(20, 84)).not.toBe(reversed);
  });

  it("checks Schnorr, ECDSA, sighash, and nonzero author indexes", () => {
    const seenSighash = new Set<number>();
    const seenAlgorithm = new Set<string>();
    const seenIndex = new Set<number>();
    for (const row of rows) {
      agree(row.rawTransactionHex, row.inputs, row.signatureInputIndex, row.sighashByte, row.id);
      expect(sighashByteAt(row.rawTransactionHex, row.signatureInputIndex)).toBe(row.sighashByte);
      expect(digestHex(row.rawTransactionHex, row.inputs, row.signatureInputIndex, row.sighashByte)).toBe(
        row.digestHex
      );
      const signatureOk = signatureMatches(
        row.rawTransactionHex,
        row.inputs,
        row.signatureInputIndex,
        row.signatureAlgorithm
      ) as boolean;
      const prevoutOk = inputUnlockMatchesPrevout(
        row.rawTransactionHex,
        row.inputs,
        row.signatureInputIndex,
        row.signatureAlgorithm
      ) as boolean;
      if (row.id === "neg-signature-flipped" || row.id === "neg-envelope-mutated") {
        expect(signatureOk).toBe(false);
        expect(prevoutOk).toBe(false);
      } else {
        expect(signatureOk).toBe(true);
        expect(prevoutOk).toBe(true);
      }
      if (row.group !== "negative" && row.structuralOk === true) {
        seenSighash.add(row.sighashByte);
        seenAlgorithm.add(row.signatureAlgorithm);
        seenIndex.add(row.envelopeAuthorIndex ?? -1);
        for (const txid of D07_TXIDS) {
          expect(row.inputs.some((input) => JSON.stringify(input).includes(txid))).toBe(false);
        }
      }
    }
    expect(seenSighash).toEqual(new Set([0x41, 0xc1]));
    expect(seenAlgorithm).toEqual(new Set(["schnorr", "ecdsa"]));
    expect(seenIndex).toEqual(new Set([0, 1, 2]));
    const index1 = requireRow(reactions, "auth-schnorr-index1-41");
    const index2 = requireRow(reactions, "auth-schnorr-index2-c1");
    const ecdsa = requireRow(reactions, "auth-ecdsa-index0-41");
    expect(designatedAuthorHash160(index1.rawTransactionHex, 0)).not.toBe(index1.authorHash160);
    expect(designatedAuthorHash160(index1.rawTransactionHex, 1)).toBe(index1.authorHash160);
    expect(designatedAuthorHash160(index2.rawTransactionHex, 0)).not.toBe(index2.authorHash160);
    expect(designatedAuthorHash160(index2.rawTransactionHex, 1)).not.toBe(index2.authorHash160);
    expect(designatedAuthorHash160(index2.rawTransactionHex, 2)).toBe(index2.authorHash160);
    expect(index1.sighashByte).toBe(0x41);
    expect(index2.sighashByte).toBe(0xc1);
    expect(requireRow(reactions, "auth-schnorr-index0-c1").sighashByte).toBe(0xc1);
    expect(signatureMatches(ecdsa.rawTransactionHex, ecdsa.inputs, 0, "schnorr")).toBe(false);
    expect(ecdsa.signatureAlgorithm).toBe("ecdsa");
    const flipped = requireRow(negatives, "neg-signature-flipped");
    const mutated = requireRow(negatives, "neg-envelope-mutated");
    expect(flipped.digestHex).toBe(flipped.preMutationDigestHex);
    expect(mutated.digestHex).not.toBe(mutated.preMutationDigestHex);
    expect(requireRow(negatives, "neg-author-index-5").authorErrorCode).toBe("AUTHOR_INPUT_OUT_OF_RANGE");
  });

  it("withholds altered signatures, bad scripts, and ineligible targets", () => {
    const negativeState = replayReactions(pick(negatives.map((row) => row.id)));
    expect(negativeState.confirmedLikeCount).toBe(0);
    expect(negativeState.history).toHaveLength(0);
    expect(negativeState.withheld.map((item) => item.reason).sort()).toEqual(
      [
        "AUTHORSHIP",
        "AUTHORSHIP",
        "AUTHORSHIP",
        "STRUCTURE",
        "STRUCTURE",
        "STRUCTURE",
        "STRUCTURE"
      ].sort()
    );
    const sequence = pick(fixture.replay.sequence);
    const full = replayReactions(sequence);
    const withheld = new Map(full.withheld.map((item) => [item.txid, item.reason]));
    expect(withheld.get(requireRow(reactions, "seq-a-like-pending").txid)).toBe("TARGET_PENDING");
    expect(withheld.get(requireRow(reactions, "seq-a-like-ineligible").txid)).toBe("TARGET_INELIGIBLE");
    expect(withheld.get(requireRow(reactions, "seq-a-like-absent").txid)).toBe("TARGET_ABSENT");
    expect(full.history.some((item) => item.txid === requireRow(reactions, "seq-a-like-pending").txid)).toBe(
      false
    );
  });

  it("replays likes without duplicating the active counter", () => {
    const sequence = pick(fixture.replay.sequence);
    const counts = [0, 1, 1, 0, 0, 1, 2, 1, 1, 1, 1];
    for (let size = 1; size <= sequence.length; size += 1) {
      const state = replayReactions(sequence.slice(0, size));
      expect(state.confirmedLikeCount).toBe(counts[size - 1]);
      expect(state.confirmedLikeCount).toBeGreaterThanOrEqual(0);
    }
    const full = replayReactions(sequence);
    const reversed = replayReactions([...sequence].reverse());
    expect(reversed).toEqual(full);
    const authorA = requireRow(reactions, "seq-a-like").authorHash160;
    const authorB = requireRow(reactions, "seq-b-like").authorHash160;
    const observer = requireRow(reactions, "seq-observer-remove-cold").authorHash160;
    const eligible = requireRow(fixture.targets, "eligible-post").txid;
    if (authorA === null || authorB === null || observer === null) {
      throw new Error("Sequence authors did not resolve.");
    }
    expect(authorA).not.toBe(authorB);
    expect(authorA).not.toBe(observer);
    const keyA = reactionStateKey(fixture.network, authorA, eligible, 0x01);
    const keyB = reactionStateKey(fixture.network, authorB, eligible, 0x01);
    const keyObserver = reactionStateKey(fixture.network, observer, eligible, 0x01);
    expect(full.active[keyA]).toMatchObject({ active: true, transitions: 5, lastAction: "REACTION" });
    expect(full.active[keyA]?.lastTxid).toBe(requireRow(reactions, "seq-a-like-again").txid);
    expect(full.active[keyB]).toMatchObject({ active: false, transitions: 2, lastAction: "REACTION_REMOVE" });
    expect(full.active[keyObserver]).toMatchObject({ active: false, transitions: 1, lastAction: "REACTION_REMOVE" });
    expect(full.history.filter((item) => item.key === keyA)).toHaveLength(5);
    expect(full.confirmedLikeCount).toBe(1);
    const cold = replayReactions(sequence.slice(0, 1));
    expect(cold.history[0]).toMatchObject({ activeBefore: false, activeAfter: false });
    expect(cold.confirmedLikeCount).toBe(0);
  });

  it("does not let the second author clear the first", () => {
    const authorA = requireRow(reactions, "seq-a-like-again").authorHash160;
    const authorB = requireRow(reactions, "seq-b-remove").authorHash160;
    const eligible = requireRow(fixture.targets, "eligible-post").txid;
    if (authorA === null || authorB === null) {
      throw new Error("Author hashes missing.");
    }
    const throughSecondLike = pick([
      "seq-observer-remove-cold",
      "seq-a-like",
      "seq-a-like-dup",
      "seq-a-remove",
      "seq-a-remove-repeat",
      "seq-a-like-again",
      "seq-b-like"
    ]);
    const before = replayReactions(throughSecondLike);
    expect(before.confirmedLikeCount).toBe(2);
    const removal = events.get("seq-b-remove");
    if (removal === undefined) {
      throw new Error("Missing author B removal.");
    }
    const foreignTxid = createHash("sha256").update(removal.txid).digest("hex");
    const foreign = replayReactions([
      ...throughSecondLike,
      { ...removal, network: "lab-other-net", txid: foreignTxid }
    ]);
    expect(foreign.confirmedLikeCount).toBe(2);
    expect(foreign.active[reactionStateKey(fixture.network, authorA, eligible, 0x01)]?.active).toBe(true);
    expect(foreign.active[reactionStateKey(fixture.network, authorB, eligible, 0x01)]?.active).toBe(true);
    const after = applyReactionEvents(foreign, [removal]);
    expect(after.confirmedLikeCount).toBe(1);
    expect(after.active[reactionStateKey(fixture.network, authorA, eligible, 0x01)]?.active).toBe(true);
    expect(after.active[reactionStateKey(fixture.network, authorB, eligible, 0x01)]?.active).toBe(false);
    const extended = replayReactions([...pick(fixture.replay.sequence), ...pick(fixture.replay.authorship)]);
    expect(extended.confirmedLikeCount).toBe(1);
    expect(extended.active[reactionStateKey(fixture.network, authorA, eligible, 0x01)]?.transitions).toBe(9);
  });

  it("selects like state from the chosen synthetic branch", () => {
    const ancestor = pick(fixture.replay.ancestor);
    const branchA = pick(fixture.replay.branchA);
    const branchB = pick(fixture.replay.branchB);
    const stateA = replayReactions([...ancestor, ...branchA]);
    const stateB = replayReactions([...ancestor, ...branchB]);
    expect(stateA.confirmedLikeCount).toBe(2);
    expect(stateB.confirmedLikeCount).toBe(1);
    const likeAgain = requireRow(reactions, "seq-a-like-again").txid;
    const firstLike = requireRow(reactions, "seq-a-like").txid;
    const secondAuthor = requireRow(reactions, "seq-b-like").txid;
    expect(activeContributors(stateB).map((item) => item.lastTxid)).toEqual([likeAgain]);
    expect(activeContributors(stateA).map((item) => item.lastTxid).sort()).toEqual(
      [requireRow(reactions, "seq-a-like-dup").txid, secondAuthor].sort()
    );
    expect(activeContributors(stateB).map((item) => item.lastTxid)).not.toContain(firstLike);
    expect(activeContributors(stateB).map((item) => item.lastTxid)).not.toContain(secondAuthor);
    const saved = cloneReactionState(replayReactions(ancestor));
    expect(applyReactionEvents(saved, branchB)).toEqual(stateB);
    const stacked = applyReactionEvents(stateA, branchB);
    expect(stacked).not.toEqual(stateB);
    expect(stacked.history.length).toBeGreaterThan(stateB.history.length);
    expect(applyReactionEvents(stateB, [...ancestor, ...branchB])).toEqual(stateB);
    expect(applyReactionEvents(stateA, [...ancestor, ...branchA])).toEqual(stateA);
  });

  it("restores a checkpoint and keeps mempool events out of the confirmed count", () => {
    const confirmed = replayReactions(pick(fixture.replay.sequence));
    const checkpoint = cloneReactionState(confirmed);
    const withMempool = applyReactionEvents(checkpoint, pick(fixture.replay.mempool));
    expect(withMempool.confirmedLikeCount).toBe(confirmed.confirmedLikeCount);
    expect(withMempool.confirmedLikeCount).toBe(1);
    expect(withMempool.provisional.map((item) => item.reason)).toEqual(["MEMPOOL", "MEMPOOL"]);
    expect(withMempool.history).toEqual(confirmed.history);
    expect(withMempool.active).toEqual(confirmed.active);
    const authorA = requireRow(reactions, "seq-a-like").authorHash160;
    const eligible = requireRow(fixture.targets, "eligible-post").txid;
    if (authorA === null) {
      throw new Error("Author A missing.");
    }
    expect(withMempool.active[reactionStateKey(fixture.network, authorA, eligible, 0x01)]?.active).toBe(true);
    const again = applyReactionEvents(withMempool, pick(fixture.replay.mempool));
    expect(again).toEqual(withMempool);
  });

  it("records laboratory evidence without closing the gates", () => {
    expect(note).toContain("M1.5.1");
    expect(note).toContain("M1.5.2");
    expect(note).toContain("M1.5.3");
    expect(note).toContain("M1.5.4");
    expect(note).toContain("M1.5.5");
    expect(note).toContain("M1.7.4");
    expect(note).toContain("S0-05");
    expect(note).toContain("SEC-04");
    expect(note).toContain("RFC-0001 remains PROPOSED — NOT RATIFIED.");
    expect(note).toContain("SEC-17 productive mitigation remains pending.");
    expect(note).toContain("M1.7.4 remains OPEN.");
    expect(note).toContain("S0-05 remains OPEN.");
    expect(note).toContain("S0 remains OPEN.");
    expect(note).toContain("S1 remains NOT AUTHORIZED.");
    expect(note).toContain("not a network");
    expect(note).toContain("not a productive indexer");
    expect(note).toContain("not mainnet history");
    for (const phrase of FORBIDDEN) {
      expect(note).not.toContain(phrase);
      expect(fixtureText).not.toContain(phrase);
    }
  });
});
