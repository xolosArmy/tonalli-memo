import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { evaluateLaboratory } from "./alp-ancestry-independent.mjs";
import { signatureMatches } from "./canonical-tm1-independent-verify.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-alp-ancestry.json");
const MATRIX_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-dispatch-matrix.json");
const EMPP_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-tmm.json");
const DECISIONS_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-empp-sec17-decisions.json");
const EVIDENCE_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-ALP-ANCESTRY.md");
const PRIOR_EMPP_SHA = "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8";
const PRIOR_SEC17_SHA = "76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca";
const LEGACY_ROW_SHA256 = "5f0a801d218a40624646a6fef7c8bfff3ebead122fdc81fecbd9288c93e4d3f2";
const D07_TXIDS = [
  "fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd",
  "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8",
  "0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150"
];
const PUBLIC_RMZ = "c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function tipById(transcript, id) {
  const tip = transcript.tips.find((item) => item.id === id);
  if (tip === undefined) {
    throw new Error(`Missing tip ${id}.`);
  }
  return tip;
}

describe("ALP laboratory ancestry and RMZ attribution", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = JSON.parse(fixtureText);
  const transcript = evaluateLaboratory(fixture);

  it("regenerates the synthetic chain without a node or a private key", () => {
    execFileSync(process.execPath, ["tests/protocol/generate-alp-ancestry-fixtures.mjs", "--check"], {
      cwd: REPO_ROOT
    });
    const generator = readFileSync(join(REPO_ROOT, "tests/protocol/generate-alp-ancestry-fixtures.mjs"), "utf8");
    expect(generator).not.toMatch(/chronik|broadcast|fetch\(/u);
    expect(fixtureText).not.toContain("SETTLED");
    expect(fixtureText).not.toContain("\"privateKey\"");
    expect(fixtureText).not.toContain("privateKeyHex");
    expect(transcript).toEqual(fixture.transcript);
  });

  it("proves a synthetic GENESIS, MINT and SEND chain that is not RMZ", () => {
    const genesis = transcript.chain.byId["lab-genesis"];
    const mint = transcript.chain.byId["lab-mint"];
    const send = transcript.chain.byId["lab-send"];
    const minted = transcript.chain.byId["lab-mint-send"];
    expect(fixture.laboratoryTokenId).toBe(genesis.txid);
    expect(fixture.laboratoryTokenId).not.toBe(PUBLIC_RMZ);
    expect(genesis).toMatchObject({
      ancestry: "LABORATORY_VALID",
      tokenId: genesis.txid,
      genesisReference: genesis.txid,
      decimals: 2,
      ticker: "LAB",
      conservation: "ISSUANCE",
      realRmzGenealogy: "NOT_DEMONSTRATED"
    });
    expect(genesis.coloredOutputs[0]).toMatchObject({ outputIndex: 1, atoms: "10000", baton: false });
    expect(genesis.coloredOutputs.at(-1)).toMatchObject({
      outputIndex: fixture.layout.baton,
      atoms: "0",
      baton: true
    });
    expect(mint).toMatchObject({
      ancestry: "LABORATORY_VALID",
      tokenId: genesis.txid,
      genesisReference: genesis.txid,
      issuedAtoms: "7000",
      inputAtoms: "0",
      batonsConsumed: 1,
      conservation: "ISSUANCE"
    });
    expect(mint.consumed).toEqual([
      expect.objectContaining({
        outIdx: fixture.layout.baton,
        baton: true,
        tokenId: genesis.txid,
        owner: fixture.identities.authorA
      })
    ]);
    expect(send).toMatchObject({
      ancestry: "LABORATORY_VALID",
      conservation: "EXACT",
      inputAtoms: "10000",
      outputAtoms: "10000"
    });
    expect(send.consumed).toEqual([
      expect.objectContaining({
        txid: genesis.txid,
        outIdx: 1,
        atoms: "10000",
        owner: fixture.identities.authorA
      })
    ]);
    expect(send.coloredOutputs).toEqual([
      expect.objectContaining({ outputIndex: 1, atoms: "125", owner: fixture.identities.authorB, tokenId: genesis.txid }),
      expect.objectContaining({ outputIndex: 2, atoms: "9875", owner: fixture.identities.authorA, tokenId: genesis.txid })
    ]);
    expect(minted).toMatchObject({ ancestry: "LABORATORY_VALID", inputAtoms: "7000", outputAtoms: "7000" });
    expect(transcript.chain.supply[genesis.txid]).toBe(
      (BigInt(genesis.issuedAtoms) + BigInt(mint.issuedAtoms)).toString()
    );
    expect(transcript.chain.byId["lab-foreign-genesis"].tokenId).not.toBe(genesis.txid);
    expect(transcript.chain.byId["lab-decimal-genesis"].decimals).toBe(0);
  });

  it("separates container, chain, authorship, amount and settlement", () => {
    for (const tip of transcript.tips) {
      expect(tip.layers.confirmation).toBe("NOT_DEMONSTRATED");
      expect(tip.layers.settlement).toBe("NOT_DEMONSTRATED");
      expect(tip.settlement).toBe("NOT_DEMONSTRATED");
      expect(tip.receiptState).not.toBe("SETTLED");
      expect(tip.realRmzTip).toBe(false);
      expect(tip.realRmzGenealogy).toBe("NOT_DEMONSTRATED");
      expect(tip.targetMessage).toBe("NOT_DEMONSTRATED");
      expect(tip.socialEventCredited).toBe(false);
    }
    for (const id of ["lab-tip-author0", "lab-tip-author1", "lab-author-owns-tokens-foreign-xec"]) {
      expect(tipById(transcript, id)).toMatchObject({
        receiptState: "PENDING",
        laboratoryTransfer: "LABORATORY_ATTRIBUTED",
        layers: {
          container: "VALID",
          alpChain: "LABORATORY_VALID",
          authorship: "LAB_VALID",
          attributableAtoms: "125",
          naiveRecipientAtoms: "125",
          settlement: "NOT_DEMONSTRATED"
        },
        tmmStructurallyValid: true,
        sectionTokenId: fixture.laboratoryTokenId
      });
    }
    expect(fixture.tips.find((item) => item.id === "lab-author-owns-tokens-foreign-xec").authorInputIndex).toBe(1);
    const sponsored = fixture.transactions.find((item) => item.id === "lab-author-owns-tokens-foreign-xec");
    expect(sponsored.inputs[0].externalUncolored).toBe(true);
    expect(signatureMatches(sponsored.rawTransactionHex, sponsored.inputs, 0, "schnorr")).toBe(true);
    expect(signatureMatches(sponsored.rawTransactionHex, sponsored.inputs, 1, "schnorr")).toBe(true);
    expect(transcript.chain.byId["lab-author-owns-tokens-foreign-xec"].consumed).toEqual([
      expect.objectContaining({
        outIdx: fixture.layout.sponsored,
        owner: fixture.identities.authorA,
        atoms: "5000"
      })
    ]);
    expect(tipById(transcript, "lab-tip-author1").transactionId).toBe("lab-tip-author1");
    const authorIndex = fixture.tips.find((item) => item.id === "lab-tip-author1").authorInputIndex;
    expect(authorIndex).toBe(1);
  });

  it("rejects the mandatory negative transfers even when the TMM entry is intact", () => {
    const repaired = [
      "lab-fake-token-id",
      "lab-missing-prevout",
      "lab-altered-amount",
      "lab-double-spend",
      "lab-foreign-token",
      "lab-public-rmz-structural",
      "lab-baton-not-send",
      "lab-decimal-mismatch",
      "lab-duplicate-prevout",
      "lab-reuse-after-invalid",
      "lab-malformed-action",
      "lab-sponsor-signs-foreign-tokens"
    ];
    for (const id of repaired) {
      const tip = tipById(transcript, id);
      expect(tip.tmmStructurallyValid).toBe(true);
      expect(tip.laboratoryTransfer).toBe("REJECTED");
      expect(tip.layers.attributableAtoms).toBe("0");
      expect(tip.receiptState).not.toBe("PENDING");
    }
    expect(tipById(transcript, "lab-fake-token-id").layers.alpChainReasons).toContain("GENESIS_NOT_IN_CHAIN");
    expect(tipById(transcript, "lab-missing-prevout").layers.alpChainReasons).toContain("PREVOUT_NOT_IN_CHAIN");
    expect(tipById(transcript, "lab-altered-amount")).toMatchObject({
      layers: { container: "VALID", authorship: "LAB_VALID", naiveRecipientAtoms: "5001" },
      receiptState: "INVALID_ASSET"
    });
    expect(transcript.chain.byId["lab-altered-amount"].outputAtoms).toBe("5001");
    expect(transcript.chain.byId["lab-altered-amount"].inputAtoms).toBe("5000");
    expect(transcript.chain.byId["lab-duplicate-prevout"]).toMatchObject({
      ancestry: "INVALID",
      consensus: "INVALID",
      applied: false,
      reasons: ["DUPLICATE_PREVOUT"],
      conservation: "NOT_APPLICABLE",
      inputAtoms: "0",
      coloredOutputs: []
    });
    expect(transcript.chain.byId["lab-duplicate-prevout"].consumed.map((input) => input.outIdx)).toEqual([
      fixture.layout.duplicatePrevout,
      fixture.layout.duplicatePrevout
    ]);
    expect(transcript.chain.byId["lab-after-duplicate-prevout"]).toMatchObject({
      ancestry: "LABORATORY_VALID",
      consensus: "VALID",
      applied: true,
      conservation: "EXACT"
    });
    expect(transcript.chain.byId["lab-after-duplicate-prevout"].consumed.map((input) => input.outIdx)).toEqual([
      fixture.layout.duplicatePrevout
    ]);
    expect(transcript.chain.byId["lab-duplicate-section"].consumed.map((input) => input.outIdx)).toEqual([
      fixture.layout.duplicate
    ]);
    expect(tipById(transcript, "lab-reuse-after-invalid").layers.alpChainReasons).toEqual(["ALREADY_SPENT"]);
    expect(transcript.chain.byId["lab-malformed-action"]).toMatchObject({
      ancestry: "INVALID",
      consensus: "VALID",
      applied: false,
      reasons: ["MALFORMED"],
      conservation: "NOT_APPLICABLE",
      coloredOutputs: []
    });
    expect(transcript.chain.byId["lab-malformed-action"].consumed.map((input) => input.outIdx)).toEqual([
      fixture.layout.malformed
    ]);
    expect(transcript.chain.byId["lab-duplicate-section"]).toMatchObject({
      consensus: "VALID",
      applied: false
    });
    expect(tipById(transcript, "lab-double-spend").layers.alpChainReasons).toContain("ALREADY_SPENT");
    expect(transcript.chain.byId["lab-double-first"].ancestry).toBe("LABORATORY_VALID");
    expect(tipById(transcript, "lab-wrong-recipient").receiptState).toBe("INVALID_RECIPIENT");
    expect(tipById(transcript, "lab-zero-atoms")).toMatchObject({
      receiptState: "NO_VALUE_TRANSFER",
      layers: { alpChain: "LABORATORY_VALID", attributableAtoms: "0" }
    });
    expect(BigInt(tipById(transcript, "lab-zero-atoms").recipientSats)).toBeGreaterThan(0n);
    expect(transcript.chain.byId["lab-zero-atoms"].coloredOutputs).toEqual([
      expect.objectContaining({ outputIndex: 2, atoms: "5000" })
    ]);
    expect(tipById(transcript, "lab-multi-owner")).toMatchObject({
      receiptState: "AMBIGUOUS_TIP_FUNDING",
      layers: { naiveRecipientAtoms: "10000", attributableAtoms: "0", alpChain: "LABORATORY_VALID" }
    });
    expect(tipById(transcript, "lab-ambiguous-funding")).toMatchObject({
      receiptState: "AMBIGUOUS_TIP_FUNDING",
      layers: { naiveRecipientAtoms: "10000", attributableAtoms: "0" }
    });
    expect(transcript.chain.byId["lab-ambiguous-funding"].consumed.map((input) => input.owner)).toEqual([
      fixture.identities.authorA,
      fixture.identities.authorB
    ]);
    expect(tipById(transcript, "lab-bad-authorship")).toMatchObject({
      receiptState: "INVALID_AUTHOR",
      layers: {
        container: "VALID",
        alpChain: "INVALID",
        alpChainReasons: ["CONSENSUS_INVALID"],
        authorship: "INVALID",
        authorshipError: "INVALID_AUTHOR_SIGNATURE",
        attributableAtoms: "0"
      },
      tmmStructurallyValid: true
    });
    expect(transcript.chain.byId["lab-bad-authorship"]).toMatchObject({
      consensus: "INVALID",
      applied: false,
      coloredOutputs: []
    });
    expect(transcript.chain.byId["lab-after-invalid-signature"]).toMatchObject({
      ancestry: "LABORATORY_VALID",
      consensus: "VALID",
      applied: true,
      conservation: "EXACT"
    });
    expect(transcript.chain.byId["lab-after-invalid-signature"].consumed.map((input) => input.outIdx)).toEqual([
      fixture.layout.badAuthor
    ]);
    expect(fixture.tips.find((item) => item.id === "lab-sponsor-signs-foreign-tokens").authorInputIndex).toBe(0);
    const unbound = fixture.transactions.find((item) => item.id === "lab-sponsor-signs-foreign-tokens");
    expect(signatureMatches(unbound.rawTransactionHex, unbound.inputs, 0, "schnorr")).toBe(true);
    expect(signatureMatches(unbound.rawTransactionHex, unbound.inputs, 1, "schnorr")).toBe(true);
    expect(transcript.chain.byId["lab-sponsor-signs-foreign-tokens"]).toMatchObject({
      ancestry: "LABORATORY_VALID",
      consensus: "VALID",
      applied: true,
      conservation: "EXACT"
    });
    expect(transcript.chain.byId["lab-sponsor-signs-foreign-tokens"].consumed).toEqual([
      expect.objectContaining({
        outIdx: fixture.layout.foreignOwner,
        owner: fixture.identities.authorB,
        atoms: "5000"
      })
    ]);
    expect(tipById(transcript, "lab-sponsor-signs-foreign-tokens")).toMatchObject({
      receiptState: "AMBIGUOUS_TIP_FUNDING",
      laboratoryTransfer: "REJECTED",
      tmmStructurallyValid: true,
      layers: {
        container: "VALID",
        alpChain: "LABORATORY_VALID",
        authorship: "LAB_VALID",
        attributableAtoms: "0",
        naiveRecipientAtoms: "125"
      }
    });
    expect(tipById(transcript, "lab-duplicate-section")).toMatchObject({
      laboratoryTransfer: "REJECTED",
      tmmStructurallyValid: true,
      layers: { container: "INVALID", alpChain: "INVALID" }
    });
    expect(tipById(transcript, "lab-decimal-mismatch").layers.alpChainReasons).toContain("DECIMAL_MISMATCH");
    expect(tipById(transcript, "lab-decimal-mismatch").observedDecimals).toBe(0);
    expect(tipById(transcript, "lab-foreign-token").layers.alpChainReasons).toEqual(["FOREIGN_TOKEN", "INFLATED"]);
    expect(transcript.chain.byId["lab-foreign-token"].coloredOutputs).toEqual([]);
    expect(tipById(transcript, "lab-self-tip").receiptState).toBe("SELF_TIP_UNCREDITED");
    expect(tipById(transcript, "lab-public-rmz-structural")).toMatchObject({
      receiptState: "INVALID_ASSET",
      sectionTokenId: PUBLIC_RMZ,
      layers: { container: "VALID", alpChain: "NOT_DEMONSTRATED", attributableAtoms: "0" },
      realRmzTip: false
    });
    expect(transcript.claims).toEqual([
      expect.objectContaining({ id: "lab-decimal-claim", result: "DECIMAL_MISMATCH", observedDecimals: 2 }),
      expect.objectContaining({
        id: "lab-public-rmz-decimal-claim",
        tokenId: PUBLIC_RMZ,
        result: "GENESIS_NOT_IN_CHAIN",
        observedDecimals: null,
        settlesRealRmzTip: false
      })
    ]);
  });

  it("preserves the SEC-17 matrix, the frozen corpora and the D-07 samples", () => {
    const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
    const legacy = matrix.rows.filter((row) => row.corpus !== "sec17-coexistence");
    expect(matrix.rows).toHaveLength(127);
    expect(legacy).toHaveLength(113);
    expect(sha256(JSON.stringify(legacy))).toBe(LEGACY_ROW_SHA256);
    expect(matrix.rows.filter((row) => row.corpus === "d07").map((row) => row.id)).toEqual(D07_TXIDS);
    expect(sha256(readFileSync(EMPP_PATH))).toBe(PRIOR_EMPP_SHA);
    expect(sha256(readFileSync(DECISIONS_PATH))).toBe(PRIOR_SEC17_SHA);
    expect(matrix.productionDispatch).toBe(false);
    expect(matrix.sec17Mitigation).toBe("DESIGN_APPROVED_VALIDATION_PENDING");
    const evidence = readFileSync(EVIDENCE_PATH, "utf8");
    for (const phrase of [
      fixture.laboratoryTokenId,
      PUBLIC_RMZ,
      "NOT_DEMONSTRATED",
      "M1.7.4 remains open",
      "127",
      ...D07_TXIDS
    ]) {
      expect(evidence).toContain(phrase);
    }
  });
});
