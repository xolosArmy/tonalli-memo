import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkpointChain } from "./alp-ancestry-independent.mjs";
import {
  applyRecords,
  attributableSum,
  laboratoryDocument,
  logicalView,
  recordsById,
  replayFromCheckpoint,
  replayFromScratch
} from "./alp-replay-independent.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-alp-replay.json");
const ANCESTRY_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-alp-ancestry.json");
const MATRIX_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-dispatch-matrix.json");
const EMPP_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json");
const DECISIONS_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-sec17-decisions.json");
const EVIDENCE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-ALP-ANCESTRY.md");
const ANCESTRY_SHA = "5f5dbd942df0d12a1626830e8bbdbd3100770e2aec508b6a872a2e4c74b8bec8";
const MATRIX_SHA = "24ae49302406bd9f2793f749fa96235d1ea6c368c03a72f850c96208d49c5633";
const PRIOR_EMPP_SHA = "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8";
const PRIOR_SEC17_SHA = "76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca";
const ANCESTRY_TOKEN = "79dee0245d45dc842e82aa37f639c325b8c62cc5d151fc7778a33f5e1c20e251";
const PUBLIC_RMZ = "c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function receipt(view, id) {
  const found = view.receipts.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`Missing receipt ${id}.`);
  }
  return found;
}

function entry(view, id) {
  const found = view.entries.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`Missing chain entry ${id}.`);
  }
  return found;
}

function utxo(view, txid, outIdx) {
  return view.utxos.find((item) => item.txid === txid && item.outIdx === outIdx);
}

function unspentAtoms(view, tokenId) {
  return view.utxos
    .filter((item) => item.spent === false && item.tokenId === tokenId && item.baton === false)
    .reduce((sum, item) => sum + BigInt(item.atoms), 0n)
    .toString();
}

describe("synthetic ALP replay, rollback and reorg", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = JSON.parse(fixtureText);
  const evidence = readFileSync(EVIDENCE_PATH, "utf8");
  const ancestor = recordsById(fixture.transactions, fixture.branches.ancestor);
  const branchA = recordsById(fixture.transactions, fixture.branches.branchA);
  const branchB = recordsById(fixture.transactions, fixture.branches.branchB);
  const activeA = [...ancestor, ...branchA];
  const activeB = [...ancestor, ...branchB];
  const documentA = laboratoryDocument(fixture, activeA);
  const documentB = laboratoryDocument(fixture, activeB);
  const scratchA = logicalView(replayFromScratch(activeA), documentA);
  const scratchB = logicalView(replayFromScratch(activeB), documentB);

  it("regenerates the replay chain without a node, a private key, or a settled label", () => {
    execFileSync(process.execPath, ["tests/protocol/generate-alp-replay-fixtures.mjs", "--check"], {
      cwd: REPO_ROOT
    });
    const generator = readFileSync(join(REPO_ROOT, "tests/protocol/generate-alp-replay-fixtures.mjs"), "utf8");
    expect(generator).not.toMatch(/chronik|broadcast|fetch\(/u);
    expect(fixtureText).not.toContain("SETTLED");
    expect(fixtureText).not.toContain("VERIFIED");
    expect(fixtureText).not.toContain("privateKeyHex");
    expect(fixture.laboratoryTokenId).not.toBe(PUBLIC_RMZ);
    expect(fixture.laboratoryTokenId).not.toBe(ANCESTRY_TOKEN);
    expect(fixture.status).toMatchObject({
      rfc0001: "PROPOSED — NOT RATIFIED",
      sec17: "DESIGN_APPROVED_VALIDATION_PENDING",
      s0: "OPEN",
      s1: "NOT AUTHORIZED",
      m174: "OPEN",
      confirmation: "NOT_DEMONSTRATED",
      settlement: "NOT_DEMONSTRATED",
      reorgFinality: "NOT_DEMONSTRATED",
      networkReorg: "NOT_DEMONSTRATED"
    });
    expect(evidence).toContain(fixture.laboratoryTokenId);
    expect(evidence).toContain(ANCESTRY_TOKEN);
    for (const view of [scratchA, scratchB]) {
      for (const item of view.receipts) {
        expect(item.confirmation).toBe("NOT_DEMONSTRATED");
        expect(item.settlement).toBe("NOT_DEMONSTRATED");
        expect(item.realRmzTip).toBe(false);
        expect(item.socialEventCredited).toBe(false);
        expect(item.receiptState).not.toBe("SETTLED");
        expect(item.receiptState).not.toBe("VERIFIED");
      }
    }
  });

  it("keeps the ancestry chain, the frozen corpora, and the SEC-17 matrix", () => {
    expect(sha256(readFileSync(ANCESTRY_PATH))).toBe(ANCESTRY_SHA);
    expect(sha256(readFileSync(MATRIX_PATH))).toBe(MATRIX_SHA);
    expect(sha256(readFileSync(EMPP_PATH))).toBe(PRIOR_EMPP_SHA);
    expect(sha256(readFileSync(DECISIONS_PATH))).toBe(PRIOR_SEC17_SHA);
    const ancestry = JSON.parse(readFileSync(ANCESTRY_PATH, "utf8"));
    const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
    expect(ancestry.laboratoryTokenId).toBe(ANCESTRY_TOKEN);
    expect(matrix.rows).toHaveLength(127);
  });

  it("matches a snapshot restore with a from-scratch replay and does not credit twice", () => {
    const saved = replayFromScratch(ancestor);
    const checkpoint = checkpointChain(saved);
    const restored = logicalView(replayFromCheckpoint(checkpoint, branchA), documentA);
    expect(restored).toEqual(scratchA);
    expect(logicalView(saved, laboratoryDocument(fixture, ancestor)).utxos).toEqual(
      logicalView(checkpoint, laboratoryDocument(fixture, ancestor)).utxos
    );
    expect(attributableSum(scratchA)).toBe("250");
    expect(scratchA.supply[fixture.laboratoryTokenId]).toBe("21000");
    expect(unspentAtoms(scratchA, fixture.laboratoryTokenId)).toBe("21000");
    expect(receipt(scratchA, "replay-tip-a")).toMatchObject({
      status: "ACTIVE",
      receiptState: "PENDING",
      laboratoryTransfer: "LABORATORY_ATTRIBUTED",
      attributableAtoms: "125"
    });
    expect(receipt(scratchA, "replay-tip-a2")).toMatchObject({
      status: "ACTIVE",
      receiptState: "PENDING",
      laboratoryTransfer: "LABORATORY_ATTRIBUTED",
      attributableAtoms: "125"
    });
    expect(entry(scratchA, "replay-genesis")).toMatchObject({
      ancestry: "LABORATORY_VALID",
      applied: true,
      issuedAtoms: "20000"
    });
    expect(entry(scratchA, "replay-mint")).toMatchObject({
      ancestry: "LABORATORY_VALID",
      applied: true,
      issuedAtoms: "1000"
    });
    const replayed = replayFromScratch(activeA);
    applyRecords(replayed, activeA);
    expect(replayed.idempotentSkips).toHaveLength(activeA.length);
    expect(logicalView(replayed, documentA)).toEqual(scratchA);
    expect(attributableSum(logicalView(replayed, documentA))).toBe("250");
  });

  it("rolls a branch back to the ancestor and applies the other branch once", () => {
    const saved = replayFromScratch(ancestor);
    const afterA = replayFromCheckpoint(saved, branchA);
    const genesisId = entry(scratchA, "replay-genesis").txid;
    expect(utxo(logicalView(afterA, documentA), genesisId, fixture.layout.branchPoint)?.spent).toBe(true);
    const rolled = replayFromCheckpoint(saved, []);
    expect(utxo(logicalView(rolled, laboratoryDocument(fixture, ancestor)), genesisId, fixture.layout.branchPoint)?.spent).toBe(false);
    const switched = logicalView(replayFromCheckpoint(saved, branchB), documentB);
    expect(switched).toEqual(scratchB);
    const stacked = logicalView(replayFromCheckpoint(afterA, branchB), laboratoryDocument(fixture, [...activeA, ...branchB]));
    expect(stacked).not.toEqual(scratchB);
    expect(entry(stacked, "replay-malformed").reasons).toContain("ALREADY_SPENT");
    expect(attributableSum(switched)).toBe("125");
    expect(switched.supply[fixture.laboratoryTokenId]).toBe("21000");
    expect(unspentAtoms(switched, fixture.laboratoryTokenId)).toBe("11000");
    expect(receipt(switched, "replay-tip-a")).toMatchObject({
      status: "NOT_ON_ACTIVE_CHAIN",
      attributableAtoms: "0"
    });
    expect(receipt(switched, "replay-tip-a2").status).toBe("NOT_ON_ACTIVE_CHAIN");
    expect(receipt(switched, "replay-tip-a")).not.toHaveProperty("receiptState");
    expect(receipt(switched, "replay-tip-b")).toMatchObject({
      status: "ACTIVE",
      receiptState: "PENDING",
      laboratoryTransfer: "LABORATORY_ATTRIBUTED",
      attributableAtoms: "125"
    });
    expect(utxo(switched, genesisId, fixture.layout.rejectedSignature)).toMatchObject({
      spent: false,
      atoms: "5000",
      tokenId: fixture.laboratoryTokenId
    });
    expect(utxo(switched, genesisId, fixture.layout.alternateSend)?.spent).toBe(true);
    const replayed = replayFromScratch(activeB);
    applyRecords(replayed, activeB);
    expect(logicalView(replayed, documentB)).toEqual(scratchB);
    expect(attributableSum(logicalView(replayed, documentB))).toBe("125");
  });

  it("keeps historical bytes for a consensus-valid ALP rejection and not for a consensus-invalid parent", () => {
    const malformed = entry(scratchB, "replay-malformed");
    const bad = entry(scratchB, "replay-badsig");
    expect(malformed).toMatchObject({
      consensus: "VALID",
      applied: false,
      ancestry: "INVALID",
      reasons: ["MALFORMED"]
    });
    expect(utxo(scratchB, malformed.txid, 1)).toMatchObject({
      tokenId: null,
      atoms: "0",
      spent: true
    });
    expect(entry(scratchB, "replay-external-claim")).toMatchObject({
      consensus: "INVALID",
      applied: false,
      reasons: ["EXTERNAL_CLAIM_CONTRADICTS_CHAIN"],
      prevoutSources: ["LOCAL_CHAIN", "EXTERNAL_NOT_DEMONSTRATED"]
    });
    expect(entry(scratchB, "replay-unissued")).toMatchObject({
      consensus: "VALID",
      applied: false,
      reasons: ["INFLATED"],
      prevoutSources: ["LOCAL_CHAIN", "EXTERNAL_NOT_DEMONSTRATED"]
    });
    expect(receipt(scratchB, "replay-tip-malformed")).toMatchObject({
      receiptState: "INVALID_ASSET",
      laboratoryTransfer: "REJECTED",
      attributableAtoms: "0"
    });
    expect(receipt(scratchB, "replay-tip-external")).toMatchObject({
      receiptState: "INVALID_ASSET",
      attributableAtoms: "0"
    });
    expect(receipt(scratchB, "replay-tip-unissued")).toMatchObject({
      receiptState: "INVALID_ASSET",
      laboratoryTransfer: "REJECTED",
      authorship: "LAB_VALID",
      attributableAtoms: "0"
    });
    expect(receipt(scratchB, "replay-tip-external").authorship).toBe("LAB_VALID");
    expect(receipt(scratchB, "replay-tip-absent").authorship).toBe("LAB_VALID");
    expect(bad).toMatchObject({
      consensus: "INVALID",
      applied: false
    });
    expect(scratchB.utxos.some((item) => item.txid === bad.txid)).toBe(false);
    expect(entry(scratchB, "replay-absent-parent")).toMatchObject({
      consensus: "INVALID",
      applied: false,
      reasons: ["PREVOUT_NOT_IN_CHAIN"],
      prevoutSources: ["UNAVAILABLE", "EXTERNAL_NOT_DEMONSTRATED"]
    });
    expect(receipt(scratchB, "replay-tip-badsig").receiptState).toBe("INVALID_AUTHOR");
    expect(receipt(scratchB, "replay-tip-absent")).toMatchObject({
      receiptState: "INVALID_ASSET",
      attributableAtoms: "0"
    });
    const prefix = logicalView(
      replayFromScratch(recordsById(fixture.transactions, ["replay-genesis", "replay-mint", "replay-malformed", "replay-external-claim"])),
      laboratoryDocument(fixture, recordsById(fixture.transactions, ["replay-genesis", "replay-mint", "replay-malformed", "replay-external-claim"]))
    );
    expect(utxo(prefix, malformed.txid, 1)?.spent).toBe(false);
  });
});
