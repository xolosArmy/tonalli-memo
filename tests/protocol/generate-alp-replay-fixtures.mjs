import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseAlpSection, RMZ_TOKEN_ID } from "./alp-ancestry-independent.mjs";
import {
  applyRecords,
  attributableSum,
  laboratoryDocument,
  logicalView,
  recordsById,
  replayFromCheckpoint,
  replayFromScratch
} from "./alp-replay-independent.mjs";
import {
  p2pkhHash,
  parseTx,
  signatureMatches,
  toHex,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import {
  agree,
  assertFixtureHasNoPrivateKeys,
  inputSpec,
  signedFixture,
  testOutputScript
} from "./generate-canonical-tm1-fixtures.mjs";

/**
 * Separate synthetic chain for laboratory replay and reorg.
 * It does not extend the ancestry genesis, so that token id stays put.
 * No node, no funds, and no production package is used.
 */

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json"));
const {
  ALP_STANDARD,
  Script,
  Tx,
  alpGenesis,
  alpMint,
  alpSend,
  emppScript
} = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-alp-replay.json");
const checkMode = process.argv.includes("--check");
const TARGET = createHash("sha256").update("rfc0001-lab-tip-target-v1").digest("hex");
const CARRIER = 10000n;
const FEE = 500n;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

assert(ecashLibVersion === "4.13.0", `Pinned ecash-lib is ${ecashLibVersion}, expected 4.13.0.`);

function fromHex(value) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function hashOf(name) {
  return toHex(p2pkhHash(testOutputScript(name).toHex()));
}

function finalize(inputs, outputs, owner = "authorA") {
  const incoming = inputs.reduce((sum, input) => sum + input.sats, 0n);
  const spent = outputs.reduce((sum, output) => sum + output.sats, 0n);
  const change = incoming - spent - FEE;
  assert(change > 546n, `Change ${change} is below the dust used by this laboratory.`);
  return [...outputs, { sats: change, script: testOutputScript(owner) }];
}

function fee(owner, label) {
  return {
    external: true,
    spec: inputSpec({ keyName: owner, sats: 100000n, label })
  };
}

function spend(snapshot, outIdx, signer) {
  const output = snapshot.outputs[outIdx];
  return {
    external: false,
    spec: {
      keyName: signer,
      sats: BigInt(output.sats),
      prevOut: { txid: snapshot.txid, outIdx },
      outputScript: new Script(fromHex(output.scriptHex)),
      scriptType: "p2pkh"
    }
  };
}

function tmmEntry(author) {
  const body = Buffer.concat([
    Buffer.from("544d4d00", "hex"),
    Buffer.from([0x02, 0x05, author]),
    Buffer.from(TARGET, "hex")
  ]);
  assert(body.length === 39, "TMM entry must be 39 bytes.");
  return body;
}

function withHighBitAction(push) {
  const bytes = Buffer.from(push);
  const marker = Buffer.from("000453454e44", "hex");
  const at = bytes.indexOf(marker);
  assert(at >= 0, "Could not find the SEND action bytes.");
  bytes[at + 2] = 0xd3;
  return bytes;
}

function flipSignature(rawTransactionHex, inputIndex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const script = Buffer.from(tx.inputs[inputIndex].script.toHex(), "hex");
  assert(script[0] === 0x41, "Expected a direct 65-byte Schnorr signature push.");
  script[1] ^= 0x01;
  tx.inputs[inputIndex].script = new Script(Uint8Array.from(script));
  return tx.toHex();
}

function publish(id, authorInputIndex, parts, outputs, mutate) {
  const signed = signedFixture({
    authorInputIndex,
    inputs: parts.map((part) => part.spec),
    outputs,
    algorithm: "schnorr"
  });
  assert(signed.sighashByte === 0x41, `${id} signed with sighash ${signed.sighashByte}.`);
  const rawTransactionHex = mutate === undefined ? signed.rawTransactionHex : mutate(signed.rawTransactionHex);
  agree(rawTransactionHex, signed.inputs, authorInputIndex, signed.sighashByte, id);
  const verified = signatureMatches(rawTransactionHex, signed.inputs, authorInputIndex, "schnorr");
  if (mutate === undefined) {
    assert(verified, `${id} signature did not verify.`);
  } else {
    assert(!verified, `${id} mutated signature still verified.`);
  }
  const parsed = parseTx(rawTransactionHex);
  const txid = txidOf(rawTransactionHex);
  assert(Tx.fromHex(rawTransactionHex).txid() === txid, `${id} txid diverged.`);
  return {
    snapshot: {
      id,
      txid,
      outputs: parsed.outputs.map((output, outputIndex) => ({
        outputIndex,
        sats: output.sats.toString(),
        scriptHex: toHex(output.script)
      }))
    },
    record: {
      id,
      rawTransactionHex,
      inputs: signed.inputs.map((input, index) => ({
        prevoutSats: input.prevoutSats,
        outputScriptHex: input.outputScriptHex,
        scriptType: input.scriptType,
        externalUncolored: parts[index].external === true
      }))
    }
  };
}

const identities = {
  authorA: hashOf("authorA"),
  authorB: hashOf("authorB"),
  observer: hashOf("observer")
};

function buildFixtures() {
  const records = [];
  const tips = [];
  const remember = (built) => {
    records.push(built.record);
    return built.snapshot;
  };
  const tip = (id, transactionId, authorInputIndex, recipient) => {
    tips.push({
      id,
      transactionId,
      authorInputIndex,
      recipient: identities[recipient],
      requiredDecimals: 2,
      signatureAlgorithm: "schnorr"
    });
  };
  const sendOf = (id, parts, authorInputIndex, amounts, owners, tokenId, mutate) => {
    const push = alpSend(tokenId, ALP_STANDARD, amounts);
    const built = publish(
      id,
      authorInputIndex,
      parts,
      finalize(parts.map((part) => part.spec), [
        { sats: 0n, script: emppScript([push, tmmEntry(authorInputIndex)]) },
        ...owners.map((owner) => ({ sats: CARRIER, script: testOutputScript(owner) }))
      ]),
      mutate
    );
    remember(built);
    return built;
  };

  const genesisPush = alpGenesis(ALP_STANDARD, {
    tokenTicker: "LAB",
    tokenName: "Lab Replay",
    url: "lab://replay",
    data: "",
    authPubkey: "",
    decimals: 2
  }, { atomsArray: [10000n, 5000n, 5000n], numBatons: 1 });
  const genesisSection = parseAlpSection(Uint8Array.from(genesisPush));
  assert(genesisSection.ok === true && genesisSection.kind === "GENESIS", "Replay genesis did not parse.");
  const genesisFunding = {
    external: true,
    spec: inputSpec({ keyName: "authorA", sats: 80000n, label: "replay-genesis-funding" })
  };
  const genesis = remember(publish(
    "replay-genesis",
    0,
    [genesisFunding],
    finalize([genesisFunding.spec], [
      { sats: 0n, script: emppScript([genesisPush]) },
      { sats: CARRIER, script: testOutputScript("authorA") },
      { sats: 5000n, script: testOutputScript("authorA") },
      { sats: 5000n, script: testOutputScript("authorA") },
      { sats: CARRIER, script: testOutputScript("authorA") }
    ])
  ));
  const labId = genesis.txid;
  assert(labId !== RMZ_TOKEN_ID, "Replay genesis collided with the public RMZ token id.");

  const mintPush = alpMint(labId, ALP_STANDARD, { atomsArray: [1000n], numBatons: 0 });
  const mintSection = parseAlpSection(Uint8Array.from(mintPush));
  assert(mintSection.ok === true && mintSection.kind === "MINT", "Replay mint did not parse.");
  const mintParts = [spend(genesis, 4, "authorA"), fee("authorA", "replay-mint-fee")];
  const mint = remember(publish(
    "replay-mint",
    0,
    mintParts,
    finalize(mintParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([mintPush]) },
      { sats: CARRIER, script: testOutputScript("authorA") }
    ])
  ));

  const sendA = sendOf(
    "replay-send-a",
    [spend(genesis, 1, "authorA"), fee("authorA", "replay-send-a-fee")],
    0,
    [125n, 9875n],
    ["observer", "authorA"],
    labId
  );
  tip("replay-tip-a", "replay-send-a", 0, "observer");
  const hop = sendOf(
    "replay-hop-a",
    [spend(sendA.snapshot, 1, "observer"), fee("observer", "replay-hop-a-fee")],
    0,
    [125n],
    ["authorB"],
    labId
  );
  tip("replay-tip-a2", "replay-hop-a", 0, "authorB");

  const malformedPush = withHighBitAction(alpSend(labId, ALP_STANDARD, [10000n]));
  const malformedParsed = parseAlpSection(Uint8Array.from(malformedPush));
  assert(malformedParsed.ok === false && malformedParsed.reason === "MALFORMED", "High-bit action was admitted.");
  const malformedParts = [spend(genesis, 1, "authorA"), fee("authorA", "replay-malformed-fee")];
  const malformed = remember(publish(
    "replay-malformed",
    0,
    malformedParts,
    finalize(malformedParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([malformedPush, tmmEntry(0)]) },
      { sats: CARRIER, script: testOutputScript("authorA") }
    ])
  ));
  tip("replay-tip-malformed", "replay-malformed", 0, "observer");

  const externalParts = [
    { ...spend(malformed, 1, "authorA"), external: true },
    fee("authorB", "replay-external-fee")
  ];
  sendOf("replay-external-claim", externalParts, 0, [125n], ["observer"], labId);
  tip("replay-tip-external", "replay-external-claim", 0, "observer");

  const unissuedParts = [spend(malformed, 1, "authorA"), fee("authorB", "replay-unissued-fee")];
  sendOf("replay-unissued", unissuedParts, 0, [125n], ["observer"], labId);
  tip("replay-tip-unissued", "replay-unissued", 0, "observer");

  const badParts = [spend(genesis, 2, "authorA"), fee("authorA", "replay-badsig-fee")];
  const bad = sendOf(
    "replay-badsig",
    badParts,
    0,
    [125n, 4875n],
    ["authorB", "authorA"],
    labId,
    (raw) => flipSignature(raw, 0)
  );
  tip("replay-tip-badsig", "replay-badsig", 0, "authorB");

  const absentParts = [spend(bad.snapshot, 1, "authorB"), fee("authorB", "replay-absent-fee")];
  sendOf("replay-absent-parent", absentParts, 0, [125n], ["observer"], labId);
  tip("replay-tip-absent", "replay-absent-parent", 0, "observer");

  const sendBParts = [spend(genesis, 3, "authorA"), fee("authorA", "replay-send-b-fee")];
  sendOf("replay-send-b", sendBParts, 0, [125n, 4875n], ["authorB", "authorA"], labId);
  tip("replay-tip-b", "replay-send-b", 0, "authorB");

  const ancestorIds = ["replay-genesis", "replay-mint"];
  const branchAIds = ["replay-send-a", "replay-hop-a"];
  const branchBIds = [
    "replay-malformed",
    "replay-external-claim",
    "replay-unissued",
    "replay-badsig",
    "replay-absent-parent",
    "replay-send-b"
  ];
  const ancestor = recordsById(records, ancestorIds);
  const branchA = recordsById(records, branchAIds);
  const branchB = recordsById(records, branchBIds);
  const fixtureShell = { targetTxid: TARGET, tips };
  const viewOf = (active) => logicalView(replayFromScratch(active), laboratoryDocument(fixtureShell, active));
  const scratchA = viewOf([...ancestor, ...branchA]);
  const scratchB = viewOf([...ancestor, ...branchB]);
  const saved = replayFromScratch(ancestor);
  const restoredA = logicalView(
    replayFromCheckpoint(saved, branchA),
    laboratoryDocument(fixtureShell, [...ancestor, ...branchA])
  );
  const switched = logicalView(
    replayFromCheckpoint(saved, branchB),
    laboratoryDocument(fixtureShell, [...ancestor, ...branchB])
  );
  assert(JSON.stringify(restoredA) === JSON.stringify(scratchA), "Snapshot restore diverged from branch A.");
  assert(JSON.stringify(switched) === JSON.stringify(scratchB), "Branch switch diverged from a full reconstruction of B.");
  assert(attributableSum(scratchA) === "250", `Branch A attributed ${attributableSum(scratchA)}.`);
  assert(attributableSum(scratchB) === "125", `Branch B attributed ${attributableSum(scratchB)}.`);
  assert(scratchA.supply[labId] === "21000" && scratchB.supply[labId] === "21000", "Issuance was not genesis plus one mint.");
  const doubled = replayFromScratch([...ancestor, ...ancestor]);
  applyRecords(doubled, branchA);
  applyRecords(doubled, branchA);
  const doubledView = logicalView(doubled, laboratoryDocument(fixtureShell, [...ancestor, ...branchA]));
  assert(JSON.stringify(doubledView) === JSON.stringify(scratchA), "Replaying a branch credited it twice.");
  assert(doubled.idempotentSkips.length === ancestor.length + branchA.length, "Duplicate records were not skipped.");
  assert(hop.snapshot.outputs[1].scriptHex.length > 0, "Hop output was not created.");

  return {
    schema: "tonalli-memo.rfc0001.alp-replay.s0",
    status: {
      rfc0001: "PROPOSED — NOT RATIFIED",
      sec17: "DESIGN_APPROVED_VALIDATION_PENDING",
      s0: "OPEN",
      s1: "NOT AUTHORIZED",
      m174: "OPEN",
      confirmation: "NOT_DEMONSTRATED",
      settlement: "NOT_DEMONSTRATED",
      reorgFinality: "NOT_DEMONSTRATED",
      externalPrevoutEvidence: "NOT_DEMONSTRATED",
      networkReorg: "NOT_DEMONSTRATED",
      productiveTips: false
    },
    publicRmzTokenId: RMZ_TOKEN_ID,
    laboratoryTokenId: labId,
    mintTransactionId: mint.id,
    targetTxid: TARGET,
    identities,
    layout: {
      branchPoint: 1,
      rejectedSignature: 2,
      alternateSend: 3,
      baton: 4,
      minted: 1
    },
    blocks: {
      note: "Synthetic laboratory order only. A block index is not a confirmation or network height.",
      ancestor: [
        { index: 0, transactions: ["replay-genesis"] },
        { index: 1, transactions: ["replay-mint"] }
      ],
      branchA: [
        { index: 2, transactions: ["replay-send-a"] },
        { index: 3, transactions: ["replay-hop-a"] }
      ],
      branchB: [
        { index: 2, transactions: ["replay-malformed", "replay-external-claim"] },
        { index: 3, transactions: ["replay-unissued", "replay-badsig", "replay-absent-parent", "replay-send-b"] }
      ]
    },
    branches: {
      ancestor: ancestorIds,
      branchA: branchAIds,
      branchB: branchBIds
    },
    transactions: records,
    tips
  };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  const fixtures = buildFixtures();
  const canonical = `${JSON.stringify(fixtures, null, 2)}\n`;
  assertFixtureHasNoPrivateKeys(canonical);
  assert(!canonical.includes("SETTLED"), "Replay fixture contains a settled state.");
  assert(!canonical.includes("VERIFIED"), "Replay fixture contains a verified state.");
  if (checkMode) {
    const current = await readFile(fixturePath, "utf8");
    if (current !== canonical) {
      throw new Error("rfc0001-alp-replay.json is not canonical. Regenerate it with the isolated generator.");
    }
  } else {
    await writeFile(fixturePath, canonical);
  }
}
