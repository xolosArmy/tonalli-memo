import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  digestHex,
  inputUnlockMatchesPrevout,
  p2pkhHash,
  parseTx,
  sighashByteAt,
  signatureMatches,
  toHex
} from "./canonical-tm1-independent-verify.mjs";
import { agree } from "./generate-canonical-tm1-fixtures.mjs";
import {
  attributeNativeTip,
  coreV1PostAuthorIndex,
  designatedAuthorHash160
} from "./tip-xec-attribution-independent.mjs";
import {
  decodeTipScript,
  encodeTipScript,
  encodeTipScriptFixed,
  s08TipScriptHex
} from "./tip-xec-envelope-independent.mjs";
import { isTm1ProtocolError, parseTm1Output } from "../../packages/protocol/src/index.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-tip-xec.json");
const NOTE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-TIP-XEC.md");
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
    "ab6fdbaf2513718473fe5c925fc9e381b3ad6dbd164fc7b9099549df654f72cc"
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
  "restores a checkpoint and keeps mempool events out of the confirmed count",
  "records laboratory evidence without closing the gates"
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

interface Prevout {
  prevoutSats: string;
  outputScriptHex: string | null;
  scriptType: string;
}

interface TargetRow {
  id: string;
  kind: string;
  network: string;
  signatureAlgorithm: string;
  authorInputIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: Prevout[];
  authorHash160: string | null;
  authorship: string;
  eventDataUtf8: string | null;
}

interface TipRow {
  id: string;
  group: string;
  network: string;
  signatureAlgorithm: string;
  signatureInputIndex: number;
  envelopeAuthorIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: Prevout[];
  sighashByte: number;
  outputScriptHex: string;
  scriptLength: number;
  targetTxid: string | null;
  digestHex: string | null;
  preMutationDigestHex: string;
  signatureOk: boolean | null;
  creditedSatoshis: string;
  verdict: string;
  detail: string | null;
  settlement: string;
  confirmation: string;
  authorHash160: string | null;
  recipientHash160: string | null;
  authorship: string;
  authorErrorCode: string | null;
  structuralOk: boolean;
  structuralError: string | null;
  targetLink: string;
}

interface TipFixture {
  schema: string;
  network: string;
  absentTargetTxid: string;
  status: Record<string, string | boolean>;
  targets: TargetRow[];
  tips: TipRow[];
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

function requireRow(rows: readonly TipRow[], id: string): TipRow {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`Missing tip row ${id}.`);
  }
  return found;
}

function requireTarget(rows: readonly TargetRow[], id: string): TargetRow {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`Missing tip target ${id}.`);
  }
  return found;
}

function positiveRecipientSum(rawTransactionHex: string, recipientHash: string): bigint {
  const tx = parseTx(rawTransactionHex) as { outputs: { script: Uint8Array; sats: bigint }[] };
  let sum = 0n;
  for (const output of tx.outputs) {
    const hash = p2pkhHash(toHex(output.script)) as Uint8Array | null;
    if (hash !== null && toHex(hash) === recipientHash && output.sats > 0n) {
      sum += output.sats;
    }
  }
  return sum;
}

function loadFixture(): TipFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as TipFixture;
}

describe("synthetic native TIP_XEC laboratory", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = loadFixture();
  const note = readFileSync(NOTE_PATH, "utf8");
  const tips = fixture.tips;
  const positives = tips.filter((row) => row.group === "positive");
  const negatives = tips.filter((row) => row.group === "negative");
  const catalog = new Map(fixture.targets.map((target) => [target.txid, target]));

  function recompute(row: TipRow) {
    const target = row.targetTxid === null ? undefined : catalog.get(row.targetTxid);
    return attributeNativeTip({
      rawTransactionHex: row.rawTransactionHex,
      inputs: row.inputs,
      network: row.network,
      signatureAlgorithm: row.signatureAlgorithm,
      target
    }) as {
      creditedSatoshis: string;
      verdict: string;
      detail: string | null;
      settlement: string;
      confirmation: string;
      authorHash160: string | null;
      recipientHash160: string | null;
      authorship: string;
      authorErrorCode: string | null;
      structuralOk: boolean;
      structuralError: string | null;
      targetLink: string;
    };
  }

  it("regenerates the tip corpus and keeps the frozen bytes", () => {
    execFileSync(process.execPath, ["tests/protocol/generate-tip-xec-fixtures.mjs", "--check"], {
      cwd: REPO_ROOT
    });
    const generator = readFileSync(join(REPO_ROOT, "tests/protocol/generate-tip-xec-fixtures.mjs"), "utf8");
    expect(generator).not.toMatch(/\bfetch\(|broadcast/u);
    expect(fixtureText).not.toContain("SETTLED");
    expect(fixtureText).not.toContain("VERIFIED");
    expect(fixtureText).not.toContain("privateKeyHex");
    expect(fixtureText).not.toContain(PUBLIC_RMZ);
    expect(fixture.schema).toBe("tonalli-memo.rfc0001.tip-xec.s0");
    expect(fixture.network).toBe("lab-tip-net");
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
    expect(catalog.has(fixture.absentTargetTxid)).toBe(false);
    const reactionSource = readFileSync(
      join(REPO_ROOT, "tests/protocol/rfc0001_reactions.test.ts"),
      "utf8"
    );
    for (const title of REACTION_TESTS) {
      expect(reactionSource).toContain(title);
    }
    expect(readFileSync(join(REPO_ROOT, "tests/protocol/rfc0001_alp_ancestry.test.ts"), "utf8")).toContain(
      "describe("
    );
    expect(readFileSync(join(REPO_ROOT, "tests/protocol/rfc0001_alp_replay.test.ts"), "utf8")).toContain(
      "describe("
    );
  });

  it("accepts a 42-byte tip script and Core still rejects version 0x02", () => {
    const s08 = s08TipScriptHex() as string;
    expect(s08).toHaveLength(84);
    expect(s08.startsWith("6a04544d4d0023")).toBe(true);
    const s08Script = Buffer.from(s08, "hex");
    const decodedS08 = decodeTipScript(s08Script) as { ok: boolean; scriptLength: number; pushCount: number; eventName: string };
    expect(decodedS08).toMatchObject({ ok: true, scriptLength: 42, pushCount: 2, eventName: "TIP_XEC" });
    expect(encodeTipScript({
      version: 0x02,
      eventType: 0x05,
      authorInputIndex: 0x01,
      targetTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
    })).toEqual(encodeTipScriptFixed({
      version: 0x02,
      eventType: 0x05,
      authorInputIndex: 0x01,
      targetTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
    }));
    expect(tm1Code(s08Script)).toBe("UNSUPPORTED_VERSION");
    const eligible = requireTarget(fixture.targets, "eligible-post-index1");
    const pending = requireTarget(fixture.targets, "pending-post");
    const payment = requireTarget(fixture.targets, "ineligible-payment");
    const reply = requireTarget(fixture.targets, "ineligible-reply-shaped");
    expect(tm1Code(outputScript(eligible.rawTransactionHex))).toBe("ACCEPTED:POST:tip target post");
    expect(tm1Code(outputScript(pending.rawTransactionHex))).toBe("ACCEPTED:POST:tip pending target");
    expect(tm1Code(outputScript(payment.rawTransactionHex))).toBe("INVALID_MARKER");
    expect(tm1Code(outputScript(reply.rawTransactionHex))).toBe("UNSUPPORTED_VERSION");
    expect(coreV1PostAuthorIndex(eligible.rawTransactionHex)).toBe(1);
    expect(coreV1PostAuthorIndex(reply.rawTransactionHex)).toBe(null);
    expect(designatedAuthorHash160(eligible.rawTransactionHex, 0)).not.toBe(eligible.authorHash160);
    expect(designatedAuthorHash160(eligible.rawTransactionHex, 1)).toBe(eligible.authorHash160);
    for (const row of tips) {
      const code = tm1Code(outputScript(row.rawTransactionHex));
      if (row.structuralOk) {
        expect(code).toBe("UNSUPPORTED_VERSION");
        expect(row.scriptLength).toBe(42);
        expect(row.outputScriptHex.startsWith("6a04544d4d0023")).toBe(true);
      } else if (row.id === "neg-nonminimal") {
        expect(code).toBe("INVALID_FORMAT");
        expect(row.scriptLength).toBe(43);
      } else {
        expect(code).toBe("UNSUPPORTED_VERSION");
      }
    }
    const like = requireRow(tips, "tip-schnorr-index0-41");
    const display = eligible.txid;
    const reversed = display.match(/[0-9a-f]{2}/gu)?.reverse().join("");
    expect(like.outputScriptHex.slice(20, 84)).toBe(display);
    expect(like.outputScriptHex.slice(20, 84)).not.toBe(reversed);
    for (const structure of fixture.structures) {
      const decoded = decodeTipScript(Buffer.from(structure.scriptHex, "hex")) as { ok: boolean; errorCode: string };
      expect(decoded.ok).toBe(false);
      expect(decoded.errorCode).toBe(structure.errorCode);
    }
  });

  it("checks Schnorr, ECDSA, sighash, and a nonzero tipper index", () => {
    const seenSighash = new Set<number>();
    const seenAlgorithm = new Set<string>();
    const seenIndex = new Set<number>();
    for (const row of tips) {
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
        seenIndex.add(row.envelopeAuthorIndex);
        for (const txid of D07_TXIDS) {
          expect(JSON.stringify(row.inputs).includes(txid)).toBe(false);
        }
      }
    }
    expect(seenSighash).toEqual(new Set([0x41, 0xc1]));
    expect(seenAlgorithm).toEqual(new Set(["schnorr", "ecdsa"]));
    expect(seenIndex).toEqual(new Set([0, 1, 2]));
    const index1 = requireRow(tips, "tip-schnorr-index1-41");
    expect(index1.sighashByte).toBe(0x41);
    expect(designatedAuthorHash160(index1.rawTransactionHex, 0)).toBe(index1.authorHash160);
    expect(designatedAuthorHash160(index1.rawTransactionHex, 1)).toBe(index1.authorHash160);
    expect(requireRow(tips, "tip-schnorr-index2-c1").envelopeAuthorIndex).toBe(2);
    expect(requireRow(tips, "tip-schnorr-index2-c1").sighashByte).toBe(0xc1);
    expect(requireRow(tips, "tip-schnorr-index0-c1").sighashByte).toBe(0xc1);
    const ecdsa = requireRow(tips, "tip-ecdsa-index0-41");
    expect(ecdsa.signatureAlgorithm).toBe("ecdsa");
    expect(signatureMatches(ecdsa.rawTransactionHex, ecdsa.inputs, 0, "schnorr")).toBe(false);
    const flipped = requireRow(tips, "neg-signature-flipped");
    const mutated = requireRow(tips, "neg-envelope-mutated");
    expect(flipped.digestHex).toBe(flipped.preMutationDigestHex);
    expect(mutated.digestHex).not.toBe(mutated.preMutationDigestHex);
    expect(requireRow(tips, "neg-author-index-5").authorErrorCode).toBe("AUTHOR_INPUT_OUT_OF_RANGE");
    expect(requireRow(tips, "neg-output-mutated").digestHex).not.toBe(
      requireRow(tips, "neg-output-mutated").preMutationDigestHex
    );
  });

  it("attributes only the recipient outputs", () => {
    expect(positives).toHaveLength(7);
    for (const row of positives) {
      const again = recompute(row);
      expect(again.verdict).toBe("LAB_ATTRIBUTABLE");
      expect(again.creditedSatoshis).toBe(row.creditedSatoshis);
      expect(again.settlement).toBe("NOT_DEMONSTRATED");
      expect(again.confirmation).toBe("NOT_DEMONSTRATED");
      expect(again.recipientHash160).toBe(row.recipientHash160);
      expect(row.recipientHash160).not.toBe(row.authorHash160);
      expect(positiveRecipientSum(row.rawTransactionHex, row.recipientHash160 ?? "").toString()).toBe(
        row.creditedSatoshis
      );
    }
    expect(requireRow(tips, "tip-schnorr-index0-41").creditedSatoshis).toBe("1000");
    expect(requireRow(tips, "tip-multi-output").creditedSatoshis).toBe("3000");
    const mixed = requireRow(tips, "tip-mixed-output");
    expect(mixed.creditedSatoshis).toBe("1000");
    const tx = parseTx(mixed.rawTransactionHex) as { outputs: { sats: bigint }[] };
    const values = tx.outputs.map((output) => output.sats);
    expect(values).toContain(546n);
    expect(values).toContain(0n);
    expect(values.reduce((sum, value) => sum + value, 0n)).toBeLessThan(12000n);
  });

  it("rejects recipient funding, third-party inputs, and self tips", () => {
    const funded = requireRow(tips, "neg-recipient-funded");
    const third = requireRow(tips, "neg-third-party");
    const thirdIndex = requireRow(tips, "neg-third-party-index1");
    const thirdAnyone = requireRow(tips, "neg-third-party-c1");
    const selfTip = requireRow(tips, "neg-self-tip");
    for (const row of [funded, third, thirdIndex, thirdAnyone, selfTip]) {
      const again = recompute(row);
      expect(again.creditedSatoshis).toBe("0");
      expect(again.verdict).toBe(row.verdict);
      expect(again.detail).toBe(row.detail);
      expect(again.settlement).toBe("NOT_DEMONSTRATED");
      expect(row.signatureOk).toBe(true);
    }
    expect(funded.verdict).toBe("AMBIGUOUS_TIP_FUNDING");
    expect(funded.detail).toBe("RECIPIENT_INPUT");
    expect(positiveRecipientSum(funded.rawTransactionHex, funded.recipientHash160 ?? "")).toBe(1000000n);
    expect(third.detail).toBe("THIRD_PARTY_INPUT");
    expect(thirdIndex.envelopeAuthorIndex).toBe(1);
    expect(thirdAnyone.sighashByte).toBe(0xc1);
    expect(selfTip.verdict).toBe("SELF_TIP_UNCREDITED");
    expect(positiveRecipientSum(selfTip.rawTransactionHex, selfTip.authorHash160 ?? "")).toBeGreaterThan(0n);
    expect(requireRow(tips, "neg-zero-recipient").verdict).toBe("NO_VALUE_TRANSFER");
    expect(requireRow(tips, "neg-pays-post-input-zero").verdict).toBe("INVALID_RECIPIENT");
    for (const row of negatives) {
      expect(recompute(row).creditedSatoshis).toBe("0");
      expect(row.creditedSatoshis).toBe("0");
      expect(row.verdict).not.toBe("LAB_ATTRIBUTABLE");
    }
  });

  it("withholds bad signatures, bad prevouts, and ineligible targets", () => {
    const expected = [
      ["neg-signature-flipped", "INVALID_AUTHOR_SIGNATURE"],
      ["neg-output-mutated", "INVALID_AUTHOR_SIGNATURE"],
      ["neg-envelope-mutated", "INVALID_AUTHOR_SIGNATURE"],
      ["neg-author-index-5", "AUTHOR_INPUT_OUT_OF_RANGE"],
      ["neg-prevout-missing", "PREVOUT_UNAVAILABLE"],
      ["neg-prevout-script", "INVALID_AUTHOR_SIGNATURE"],
      ["neg-prevout-amount", "INVALID_AUTHOR_SIGNATURE"],
      ["neg-unsupported-script", "UNSUPPORTED_AUTHOR_SCRIPT"],
      ["neg-target-absent", "TARGET_ABSENT"],
      ["neg-target-pending", "TARGET_PENDING"],
      ["neg-target-payment", "TARGET_INELIGIBLE"],
      ["neg-target-reply-shaped", "TARGET_INELIGIBLE"],
      ["neg-other-network", "TARGET_OTHER_NETWORK"],
      ["neg-version-09", "UNSUPPORTED_VERSION"],
      ["neg-event-7e", "UNSUPPORTED_EVENT"],
      ["neg-nonminimal", "INVALID_FORMAT"]
    ] as const;
    for (const [id, verdict] of expected) {
      const row = requireRow(tips, id);
      const again = recompute(row);
      expect(again.verdict).toBe(verdict);
      expect(again.creditedSatoshis).toBe("0");
      expect(again.settlement).toBe("NOT_DEMONSTRATED");
      expect(again.targetLink).toBe(row.targetLink);
      expect(again.authorErrorCode).toBe(row.authorErrorCode);
    }
    expect(requireRow(tips, "neg-target-pending").targetLink).toBe("PENDING_TARGET");
    expect(requireRow(tips, "neg-other-network").network).toBe("lab-other-net");
    expect(requireRow(tips, "neg-envelope-mutated").targetLink).toBe("ABSENT");
  });

  it("records laboratory evidence without closing the gates", () => {
    expect(note).toContain("M1.6.1");
    expect(note).toContain("M1.6.2");
    expect(note).toContain("M1.6.3");
    expect(note).toContain("M1.4.2");
    expect(note).toContain("M1.7.4");
    expect(note).toContain("SEC-05");
    expect(note).toContain("S0-05");
    expect(note).toContain("RFC-0001 remains PROPOSED — NOT RATIFIED.");
    expect(note).toContain("SEC-17 productive mitigation remains pending.");
    expect(note).toContain("M1.7.4 remains OPEN.");
    expect(note).toContain("S0-05 remains OPEN.");
    expect(note).toContain("S0 remains OPEN.");
    expect(note).toContain("S1 remains NOT AUTHORIZED.");
    expect(note).toContain("not a network settlement");
    expect(note).toContain("not a productive indexer");
    expect(note).toContain("not mainnet history");
    expect(note).toContain("LAB_ATTRIBUTABLE");
    for (const phrase of FORBIDDEN) {
      expect(note).not.toContain(phrase);
      expect(fixtureText).not.toContain(phrase);
    }
  });
});
