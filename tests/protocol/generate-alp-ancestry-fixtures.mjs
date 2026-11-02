import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateLaboratory, parseAlpSection, RMZ_TOKEN_ID } from "./alp-ancestry-independent.mjs";
import {
  inputUnlockMatchesPrevout,
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
 * Deterministic synthetic ALP GENESIS, MINT and SEND chain.
 * The laboratory token is not RMZ. No result is a settled tip.
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
  emppScript,
  parseAlp
} = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-alp-ancestry.json");
const checkMode = process.argv.includes("--check");
const TARGET = createHash("sha256").update("rfc0001-lab-tip-target-v1").digest("hex");
const FAKE_TOKEN_ID = "11".repeat(32);
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
assert(RMZ_TOKEN_ID.length === 64, "RMZ token id must be 32 bytes.");

function fromHex(value) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function hashOf(name) {
  return toHex(p2pkhHash(testOutputScript(name).toHex()));
}

function carrier(name) {
  return { sats: CARRIER, script: testOutputScript(name) };
}

function finalize(inputs, outputs, owner = "authorA") {
  const incoming = inputs.reduce((sum, input) => sum + input.sats, 0n);
  const spent = outputs.reduce((sum, output) => sum + output.sats, 0n);
  const change = incoming - spent - FEE;
  assert(change > 546n, `Change ${change} is below the dust used by this laboratory.`);
  return [...outputs, { sats: change, script: testOutputScript(owner) }];
}

let feeNonce = 0;

function fee(owner, sats = 100000n) {
  feeNonce += 1;
  return {
    external: true,
    spec: inputSpec({ keyName: owner, sats, label: `alp-fee-${feeNonce}` })
  };
}

function spend(snapshot, outIdx, owner) {
  return spendSignedBy(snapshot, outIdx, owner);
}

function spendSignedBy(snapshot, outIdx, signer) {
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

function liedSpend(snapshot, outIdx, signer, scriptName, sats) {
  return {
    external: false,
    spec: {
      keyName: signer,
      sats,
      prevOut: { txid: snapshot.txid, outIdx },
      outputScript: testOutputScript(scriptName),
      scriptType: "p2pkh"
    }
  };
}

function claimedExternal(snapshot, outIdx, owner) {
  return { ...spend(snapshot, outIdx, owner), external: true };
}

function chainParentView(childRaw, declaredInputs, parentRaw) {
  const parentId = txidOf(parentRaw);
  const child = parseTx(childRaw);
  const parent = parseTx(parentRaw);
  return declaredInputs.map((declared, index) => {
    const input = child.inputs[index];
    if (input.prevTxid !== parentId) {
      return declared;
    }
    const output = parent.outputs[input.outIdx];
    if (output === undefined) {
      return { outputScriptHex: null, prevoutSats: null, scriptType: "p2pkh" };
    }
    return {
      outputScriptHex: toHex(output.script),
      prevoutSats: output.sats.toString(),
      scriptType: "p2pkh"
    };
  });
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

function expectSection(push, kind) {
  const library = parseAlp(Buffer.from(push));
  const independent = parseAlpSection(Uint8Array.from(push));
  assert(library?.txType === kind, `parseAlp ${kind} disagreed.`);
  assert(independent.ok === true && independent.kind === kind, `Independent ${kind} disagreed.`);
  return { library, independent };
}

const identities = {
  authorA: hashOf("authorA"),
  authorB: hashOf("authorB"),
  observer: hashOf("observer")
};

const labAtoms = [
  ["authorA", 10000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 2000n],
  ["authorA", 125n],
  ["authorB", 10000n],
  ["authorA", 5000n],
  ["authorB", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorB", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n],
  ["authorB", 5000n],
  ["authorA", 5000n],
  ["authorA", 5000n]
];

const layout = {
  send: 1,
  tip1: 2,
  tip0: 3,
  self: 4,
  wrong: 5,
  zero: 6,
  fake: 7,
  altered: 8,
  badAuthor: 9,
  duplicate: 10,
  doubleSpend: 11,
  ambiguousA: 12,
  ambiguousB: 13,
  multiA: 14,
  multiB: 15,
  duplicatePrevout: 16,
  malformed: 17,
  foreignOwner: 18,
  sponsored: 19,
  wrongKey: 20,
  collateral: 21,
  collateralMalformed: 22,
  scriptMismatch: 23,
  amountMismatch: 24,
  wrongIndex: 25,
  freshBeside: 26,
  falseExternal: 27,
  baton: 28
};

assert(labAtoms.length === 27, "Genesis atom outputs drifted.");
assert(layout.baton === labAtoms.length + 1, "Mint baton index drifted.");

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

  const genesisPush = alpGenesis(ALP_STANDARD, {
    tokenTicker: "LAB",
    tokenName: "Lab Ancestry",
    url: "lab://synthetic",
    data: "",
    authPubkey: "",
    decimals: 2
  }, {
    atomsArray: labAtoms.map((entry) => entry[1]),
    numBatons: 1
  });
  expectSection(genesisPush, "GENESIS");
  const genesisFunding = {
    external: true,
    spec: inputSpec({ keyName: "authorA", sats: 400000n, label: "lab-genesis-funding" })
  };
  const genesis = remember(publish(
    "lab-genesis",
    0,
    [genesisFunding],
    finalize([genesisFunding.spec], [
      { sats: 0n, script: emppScript([genesisPush]) },
      ...labAtoms.map(([owner]) => carrier(owner)),
      carrier("authorA")
    ])
  ));
  const labId = genesis.txid;
  assert(labId !== RMZ_TOKEN_ID, "Synthetic genesis collided with the public RMZ token id.");

  const foreignPush = alpGenesis(ALP_STANDARD, {
    tokenTicker: "FOR",
    tokenName: "Foreign Lab",
    url: "lab://foreign",
    data: "",
    authPubkey: "",
    decimals: 2
  }, { atomsArray: [4000n], numBatons: 1 });
  expectSection(foreignPush, "GENESIS");
  const foreignFunding = {
    external: true,
    spec: inputSpec({ keyName: "authorB", sats: 80000n, label: "lab-foreign-funding" })
  };
  const foreign = remember(publish(
    "lab-foreign-genesis",
    0,
    [foreignFunding],
    finalize([foreignFunding.spec], [
      { sats: 0n, script: emppScript([foreignPush]) },
      carrier("authorB"),
      carrier("authorB")
    ], "authorB")
  ));

  const decimalPush = alpGenesis(ALP_STANDARD, {
    tokenTicker: "DEC",
    tokenName: "Decimal Lab",
    url: "lab://decimals",
    data: "",
    authPubkey: "",
    decimals: 0
  }, { atomsArray: [300n], numBatons: 1 });
  const decimalParsed = expectSection(decimalPush, "GENESIS");
  assert(decimalParsed.library.genesisInfo.decimals === 0, "Decimal genesis metadata drifted.");
  const decimalFunding = {
    external: true,
    spec: inputSpec({ keyName: "authorA", sats: 80000n, label: "lab-decimal-funding" })
  };
  const decimal = remember(publish(
    "lab-decimal-genesis",
    0,
    [decimalFunding],
    finalize([decimalFunding.spec], [
      { sats: 0n, script: emppScript([decimalPush]) },
      carrier("authorA"),
      carrier("authorA")
    ])
  ));

  const mintPush = alpMint(labId, ALP_STANDARD, { atomsArray: [7000n], numBatons: 1 });
  expectSection(mintPush, "MINT");
  const mintParts = [fee("authorA"), spend(genesis, layout.baton, "authorA")];
  const mint = remember(publish(
    "lab-mint",
    1,
    mintParts,
    finalize(mintParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([mintPush]) },
      carrier("authorA"),
      carrier("authorA")
    ])
  ));

  const sendPush = alpSend(labId, ALP_STANDARD, [125n, 9875n]);
  expectSection(sendPush, "SEND");
  const sendParts = [spend(genesis, layout.send, "authorA"), fee("authorA")];
  remember(publish(
    "lab-send",
    0,
    sendParts,
    finalize(sendParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([sendPush]) },
      carrier("authorB"),
      carrier("authorA")
    ])
  ));

  const mintedSend = alpSend(labId, ALP_STANDARD, [100n, 6900n]);
  const mintedParts = [spend(mint, 1, "authorA"), fee("authorA")];
  remember(publish(
    "lab-mint-send",
    0,
    mintedParts,
    finalize(mintedParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([mintedSend]) },
      carrier("authorB"),
      carrier("authorA")
    ])
  ));

  const tipShape = (id, parts, authorInputIndex, amounts, owners, tokenId = labId, mutate) => {
    const push = alpSend(tokenId, ALP_STANDARD, amounts);
    if (tokenId !== FAKE_TOKEN_ID) {
      expectSection(push, "SEND");
    }
    const built = publish(
      id,
      authorInputIndex,
      parts,
      finalize(parts.map((part) => part.spec), [
        { sats: 0n, script: emppScript([push, tmmEntry(authorInputIndex)]) },
        ...owners.map((owner) => carrier(owner))
      ]),
      mutate
    );
    remember(built);
    return built;
  };

  tipShape(
    "lab-tip-author1",
    [fee("authorA"), spend(genesis, layout.tip1, "authorA")],
    1,
    [125n, 4875n],
    ["authorB", "authorA"]
  );
  tip("lab-tip-author1", "lab-tip-author1", 1, "authorB");

  tipShape(
    "lab-tip-author0",
    [spend(genesis, layout.tip0, "authorA"), fee("authorA")],
    0,
    [125n, 4875n],
    ["authorB", "authorA"]
  );
  tip("lab-tip-author0", "lab-tip-author0", 0, "authorB");

  tipShape(
    "lab-self-tip",
    [spend(genesis, layout.self, "authorA"), fee("authorA")],
    0,
    [125n, 4875n],
    ["authorA", "authorA"]
  );
  tip("lab-self-tip", "lab-self-tip", 0, "authorA");

  tipShape(
    "lab-wrong-recipient",
    [spend(genesis, layout.wrong, "authorA"), fee("authorA")],
    0,
    [125n, 4875n],
    ["observer", "authorA"]
  );
  tip("lab-wrong-recipient", "lab-wrong-recipient", 0, "authorB");

  tipShape(
    "lab-zero-atoms",
    [spend(genesis, layout.zero, "authorA"), fee("authorA")],
    0,
    [0n, 5000n],
    ["authorB", "authorA"]
  );
  tip("lab-zero-atoms", "lab-zero-atoms", 0, "authorB");

  tipShape(
    "lab-fake-token-id",
    [spend(genesis, layout.fake, "authorA"), fee("authorA")],
    0,
    [125n, 4875n],
    ["authorB", "authorA"],
    FAKE_TOKEN_ID
  );
  tip("lab-fake-token-id", "lab-fake-token-id", 0, "authorB");

  const missingParts = [fee("authorA")];
  missingParts[0] = {
    external: false,
    spec: inputSpec({ keyName: "authorA", sats: 100000n, label: "alp-missing-prevout" })
  };
  tipShape("lab-missing-prevout", missingParts, 0, [125n], ["authorB"]);
  tip("lab-missing-prevout", "lab-missing-prevout", 0, "authorB");

  tipShape(
    "lab-altered-amount",
    [spend(genesis, layout.altered, "authorA"), fee("authorA")],
    0,
    [5001n],
    ["authorB"]
  );
  tip("lab-altered-amount", "lab-altered-amount", 0, "authorB");

  tipShape(
    "lab-bad-authorship",
    [spend(genesis, layout.badAuthor, "authorA"), fee("authorA")],
    0,
    [125n, 4875n],
    ["authorB", "authorA"],
    labId,
    (raw) => flipSignature(raw, 0)
  );
  tip("lab-bad-authorship", "lab-bad-authorship", 0, "authorB");

  const duplicatePush = alpSend(labId, ALP_STANDARD, [100n, 4900n]);
  const duplicateParts = [spend(genesis, layout.duplicate, "authorA"), fee("authorA")];
  remember(publish(
    "lab-duplicate-section",
    0,
    duplicateParts,
    finalize(duplicateParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([duplicatePush, duplicatePush, tmmEntry(0)]) },
      carrier("authorB"),
      carrier("authorA")
    ])
  ));
  tip("lab-duplicate-section", "lab-duplicate-section", 0, "authorB");

  const reuseParts = [spend(genesis, layout.duplicate, "authorA"), fee("authorA")];
  tipShape("lab-reuse-after-invalid", reuseParts, 0, [5000n], ["authorB"]);
  tip("lab-reuse-after-invalid", "lab-reuse-after-invalid", 0, "authorB");

  const malformedPush = withHighBitAction(alpSend(labId, ALP_STANDARD, [5000n]));
  const malformedParsed = parseAlpSection(Uint8Array.from(malformedPush));
  assert(malformedParsed.ok === false && malformedParsed.reason === "MALFORMED", "High-bit action was admitted.");
  const malformedParts = [spend(genesis, layout.malformed, "authorA"), fee("authorA")];
  const malformed = publish(
    "lab-malformed-action",
    0,
    malformedParts,
    finalize(malformedParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([malformedPush, tmmEntry(0)]) },
      carrier("authorA")
    ])
  );
  remember(malformed);
  assert(
    signatureMatches(malformed.record.rawTransactionHex, malformed.record.inputs, 0, "schnorr"),
    "A base-valid malformed SEND must still carry a verifying signature."
  );
  tip("lab-malformed-action", "lab-malformed-action", 0, "authorA");

  const multiParts = [
    spend(genesis, layout.multiA, "authorA"),
    spend(genesis, layout.multiB, "authorB"),
    fee("authorA")
  ];
  tipShape("lab-multi-owner", multiParts, 0, [10000n], ["observer"]);
  tip("lab-multi-owner", "lab-multi-owner", 0, "observer");

  const ambiguousParts = [
    spend(genesis, layout.ambiguousA, "authorA"),
    spend(genesis, layout.ambiguousB, "authorB"),
    fee("authorA")
  ];
  tipShape("lab-ambiguous-funding", ambiguousParts, 0, [10000n, 125n], ["authorB", "authorA"]);
  tip("lab-ambiguous-funding", "lab-ambiguous-funding", 0, "authorB");

  const decimalParts = [spend(decimal, 1, "authorA"), fee("authorA")];
  tipShape("lab-decimal-mismatch", decimalParts, 0, [300n], ["authorB"], decimal.txid);
  tip("lab-decimal-mismatch", "lab-decimal-mismatch", 0, "authorB");

  const foreignParts = [spend(foreign, 1, "authorB"), fee("authorB")];
  tipShape("lab-foreign-token", foreignParts, 0, [4000n], ["authorA"]);
  tip("lab-foreign-token", "lab-foreign-token", 0, "authorA");

  const publicParts = [fee("authorA")];
  tipShape("lab-public-rmz-structural", publicParts, 0, [125n], ["authorB"], RMZ_TOKEN_ID);
  tip("lab-public-rmz-structural", "lab-public-rmz-structural", 0, "authorB");

  const batonParts = [spend(mint, 2, "authorA"), fee("authorA")];
  tipShape("lab-baton-not-send", batonParts, 0, [1n], ["authorB"]);
  tip("lab-baton-not-send", "lab-baton-not-send", 0, "authorB");

  const repeated = spend(genesis, layout.duplicatePrevout, "authorA");
  tipShape(
    "lab-duplicate-prevout",
    [repeated, repeated, fee("authorA")],
    0,
    [10000n],
    ["authorB"]
  );
  tip("lab-duplicate-prevout", "lab-duplicate-prevout", 0, "authorB");

  const firstPush = alpSend(labId, ALP_STANDARD, [2000n]);
  const firstParts = [spend(genesis, layout.doubleSpend, "authorA"), fee("authorA")];
  const first = remember(publish(
    "lab-double-first",
    0,
    firstParts,
    finalize(firstParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([firstPush]) },
      carrier("authorB")
    ])
  ));
  const secondParts = [spend(genesis, layout.doubleSpend, "authorA"), fee("authorA")];
  tipShape("lab-double-spend", secondParts, 0, [2000n], ["observer"]);
  tip("lab-double-spend", "lab-double-spend", 0, "observer");
  assert(first.txid !== genesis.txid, "Double-spend fixture did not build a distinct first spend.");

  const sponsored = tipShape(
    "lab-sponsor-signs-foreign-tokens",
    [fee("authorA"), spend(genesis, layout.foreignOwner, "authorB")],
    0,
    [125n, 4875n],
    ["observer", "authorB"]
  );
  for (const index of [0, 1]) {
    assert(
      signatureMatches(sponsored.record.rawTransactionHex, sponsored.record.inputs, index, "schnorr"),
      `Sponsor counterexample input ${index} did not verify.`
    );
  }
  tip("lab-sponsor-signs-foreign-tokens", "lab-sponsor-signs-foreign-tokens", 0, "observer");

  const ownedWithForeignXec = tipShape(
    "lab-author-owns-tokens-foreign-xec",
    [fee("authorB"), spend(genesis, layout.sponsored, "authorA")],
    1,
    [125n, 4875n],
    ["observer", "authorA"]
  );
  for (const index of [0, 1]) {
    assert(
      signatureMatches(ownedWithForeignXec.record.rawTransactionHex, ownedWithForeignXec.record.inputs, index, "schnorr"),
      `Foreign-XEC control input ${index} did not verify.`
    );
  }
  tip("lab-author-owns-tokens-foreign-xec", "lab-author-owns-tokens-foreign-xec", 1, "observer");

  const afterSignaturePush = alpSend(labId, ALP_STANDARD, [5000n]);
  expectSection(afterSignaturePush, "SEND");
  const afterSignatureParts = [spend(genesis, layout.badAuthor, "authorA"), fee("authorA")];
  remember(publish(
    "lab-after-invalid-signature",
    0,
    afterSignatureParts,
    finalize(afterSignatureParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([afterSignaturePush]) },
      carrier("authorB")
    ])
  ));

  const afterDuplicatePush = alpSend(labId, ALP_STANDARD, [5000n]);
  expectSection(afterDuplicatePush, "SEND");
  const afterDuplicateParts = [spend(genesis, layout.duplicatePrevout, "authorA"), fee("authorA")];
  remember(publish(
    "lab-after-duplicate-prevout",
    0,
    afterDuplicateParts,
    finalize(afterDuplicateParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([afterDuplicatePush]) },
      carrier("authorB")
    ])
  ));

  const wrongKeyPush = alpSend(labId, ALP_STANDARD, [125n, 4875n]);
  expectSection(wrongKeyPush, "SEND");
  const wrongKeyParts = [fee("authorA"), spendSignedBy(genesis, layout.wrongKey, "authorB")];
  const wrongKey = publish(
    "lab-wrong-key-token",
    0,
    wrongKeyParts,
    finalize(wrongKeyParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([wrongKeyPush, tmmEntry(0)]) },
      carrier("observer"),
      carrier("authorA")
    ])
  );
  remember(wrongKey);
  assert(
    signatureMatches(wrongKey.record.rawTransactionHex, wrongKey.record.inputs, 1, "schnorr"),
    "Wrong-key token input did not produce a digest match."
  );
  assert(
    inputUnlockMatchesPrevout(wrongKey.record.rawTransactionHex, wrongKey.record.inputs, 1, "schnorr") === false,
    "Wrong-key token input matched the prevout lock."
  );
  assert(
    inputUnlockMatchesPrevout(wrongKey.record.rawTransactionHex, wrongKey.record.inputs, 0, "schnorr"),
    "Designated fee input did not unlock its own prevout."
  );
  tip("lab-wrong-key-token", "lab-wrong-key-token", 0, "observer");

  const afterWrongKeyPush = alpSend(labId, ALP_STANDARD, [5000n]);
  expectSection(afterWrongKeyPush, "SEND");
  const afterWrongKeyParts = [spend(genesis, layout.wrongKey, "authorA"), fee("authorA")];
  remember(publish(
    "lab-after-wrong-key",
    0,
    afterWrongKeyParts,
    finalize(afterWrongKeyParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([afterWrongKeyPush]) },
      carrier("authorB")
    ])
  ));

  const conflictPush = alpSend(labId, ALP_STANDARD, [7000n]);
  expectSection(conflictPush, "SEND");
  const conflictParts = [
    spend(genesis, layout.doubleSpend, "authorA"),
    spend(genesis, layout.collateral, "authorA"),
    fee("authorA")
  ];
  remember(publish(
    "lab-conflict-fresh",
    0,
    conflictParts,
    finalize(conflictParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([conflictPush, tmmEntry(0)]) },
      carrier("authorB")
    ])
  ));
  tip("lab-conflict-fresh", "lab-conflict-fresh", 0, "authorB");

  const afterConflictPush = alpSend(labId, ALP_STANDARD, [5000n]);
  expectSection(afterConflictPush, "SEND");
  const afterConflictParts = [spend(genesis, layout.collateral, "authorA"), fee("authorA")];
  remember(publish(
    "lab-after-conflict",
    0,
    afterConflictParts,
    finalize(afterConflictParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([afterConflictPush]) },
      carrier("authorB")
    ])
  ));

  const conflictMalformedPush = withHighBitAction(alpSend(labId, ALP_STANDARD, [5000n]));
  const conflictMalformedParts = [
    spend(genesis, layout.doubleSpend, "authorA"),
    spend(genesis, layout.collateralMalformed, "authorA"),
    fee("authorA")
  ];
  const conflictMalformed = publish(
    "lab-conflict-malformed",
    0,
    conflictMalformedParts,
    finalize(conflictMalformedParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([conflictMalformedPush, tmmEntry(0)]) },
      carrier("authorA")
    ])
  );
  remember(conflictMalformed);
  assert(
    inputUnlockMatchesPrevout(
      conflictMalformed.record.rawTransactionHex,
      conflictMalformed.record.inputs,
      0,
      "schnorr"
    ),
    "Malformed conflict did not unlock its spent prevout."
  );
  tip("lab-conflict-malformed", "lab-conflict-malformed", 0, "authorA");

  const afterMalformedConflictPush = alpSend(labId, ALP_STANDARD, [5000n]);
  expectSection(afterMalformedConflictPush, "SEND");
  const afterMalformedConflictParts = [spend(genesis, layout.collateralMalformed, "authorA"), fee("authorA")];
  remember(publish(
    "lab-after-conflict-malformed",
    0,
    afterMalformedConflictParts,
    finalize(afterMalformedConflictParts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([afterMalformedConflictPush]) },
      carrier("authorB")
    ])
  ));

  const genesisRaw = records.find((item) => item.id === "lab-genesis").rawTransactionHex;
  const scriptMismatch = tipShape(
    "lab-prevout-script-mismatch",
    [liedSpend(genesis, layout.scriptMismatch, "authorB", "authorB", CARRIER), fee("authorA")],
    0,
    [125n, 4875n],
    ["observer", "authorA"]
  );
  tip("lab-prevout-script-mismatch", "lab-prevout-script-mismatch", 0, "observer");
  const scriptHistory = chainParentView(
    scriptMismatch.record.rawTransactionHex,
    scriptMismatch.record.inputs,
    genesisRaw
  );
  assert(
    signatureMatches(scriptMismatch.record.rawTransactionHex, scriptMismatch.record.inputs, 0, "schnorr"),
    "Script mismatch did not verify against the declared prevout."
  );
  assert(
    signatureMatches(scriptMismatch.record.rawTransactionHex, scriptHistory, 0, "schnorr") === false,
    "Script mismatch was valid for the historical prevout."
  );
  assert(scriptHistory[0].outputScriptHex !== scriptMismatch.record.inputs[0].outputScriptHex, "Script lie matched history.");
  assert(scriptHistory[0].prevoutSats === scriptMismatch.record.inputs[0].prevoutSats, "Script case also changed the amount.");

  const amountMismatch = tipShape(
    "lab-prevout-amount-mismatch",
    [liedSpend(genesis, layout.amountMismatch, "authorA", "authorA", CARRIER + 1n), fee("authorA")],
    0,
    [125n, 4875n],
    ["observer", "authorA"]
  );
  tip("lab-prevout-amount-mismatch", "lab-prevout-amount-mismatch", 0, "observer");
  const amountHistory = chainParentView(
    amountMismatch.record.rawTransactionHex,
    amountMismatch.record.inputs,
    genesisRaw
  );
  assert(amountMismatch.record.inputs[0].prevoutSats === "10001", "Amount lie drifted.");
  assert(amountHistory[0].prevoutSats === "10000", "Historical amount drifted.");
  assert(amountHistory[0].outputScriptHex === amountMismatch.record.inputs[0].outputScriptHex, "Amount case also changed the script.");
  assert(
    signatureMatches(amountMismatch.record.rawTransactionHex, amountMismatch.record.inputs, 0, "schnorr"),
    "Amount mismatch did not verify against the declared sats."
  );
  assert(
    signatureMatches(amountMismatch.record.rawTransactionHex, amountHistory, 0, "schnorr") === false,
    "Amount mismatch was valid for the historical sats."
  );

  const wrongIndex = tipShape(
    "lab-prevout-wrong-index",
    [liedSpend(genesis, layout.wrongIndex, "authorA", "authorA", CARRIER + 1n), fee("authorA")],
    0,
    [125n, 4875n],
    ["observer", "authorB"]
  );
  tip("lab-prevout-wrong-index", "lab-prevout-wrong-index", 0, "observer");
  const wrongHistory = chainParentView(wrongIndex.record.rawTransactionHex, wrongIndex.record.inputs, genesisRaw);
  assert(parseTx(wrongIndex.record.rawTransactionHex).inputs[0].outIdx === layout.wrongIndex, "Wrong index did not select the historical output.");
  assert(wrongHistory[0].outputScriptHex !== wrongIndex.record.inputs[0].outputScriptHex, "Wrong index used the historical script.");
  assert(wrongHistory[0].prevoutSats !== wrongIndex.record.inputs[0].prevoutSats, "Wrong index used the historical amount.");
  assert(
    signatureMatches(wrongIndex.record.rawTransactionHex, wrongIndex.record.inputs, 0, "schnorr"),
    "Wrong index did not verify against the declared metadata."
  );
  assert(
    inputUnlockMatchesPrevout(wrongIndex.record.rawTransactionHex, wrongHistory, 0, "schnorr") === false,
    "Wrong index unlocked the historical prevout."
  );

  const missingIndex = tipShape(
    "lab-prevout-index-missing",
    [liedSpend(genesis, 99, "authorA", "authorA", CARRIER), fee("authorA")],
    0,
    [125n],
    ["authorB"]
  );
  tip("lab-prevout-index-missing", "lab-prevout-index-missing", 0, "authorB");
  assert(parseTx(missingIndex.record.rawTransactionHex).inputs[0].outIdx === 99, "Missing index drifted.");
  assert(parseTx(genesisRaw).outputs[99] === undefined, "Genesis unexpectedly has output 99.");
  assert(
    signatureMatches(missingIndex.record.rawTransactionHex, missingIndex.record.inputs, 0, "schnorr"),
    "Missing index did not verify against its fabricated prevout."
  );

  const indexAndFresh = tipShape(
    "lab-prevout-index-and-fresh",
    [
      liedSpend(genesis, 99, "authorA", "authorA", CARRIER),
      spend(genesis, layout.freshBeside, "authorA"),
      fee("authorA")
    ],
    1,
    [5000n],
    ["authorB"]
  );
  tip("lab-prevout-index-and-fresh", "lab-prevout-index-and-fresh", 1, "authorB");
  assert(parseTx(indexAndFresh.record.rawTransactionHex).inputs[1].outIdx === layout.freshBeside, "Fresh sibling outpoint drifted.");
  assert(
    inputUnlockMatchesPrevout(indexAndFresh.record.rawTransactionHex, indexAndFresh.record.inputs, 1, "schnorr"),
    "Fresh sibling did not unlock its own prevout."
  );

  const falseExternal = tipShape(
    "lab-prevout-false-external",
    [claimedExternal(genesis, layout.falseExternal, "authorA"), fee("authorB")],
    0,
    [125n, 4875n],
    ["observer", "authorA"]
  );
  tip("lab-prevout-false-external", "lab-prevout-false-external", 0, "observer");
  const falseHistory = chainParentView(
    falseExternal.record.rawTransactionHex,
    falseExternal.record.inputs,
    genesisRaw
  );
  assert(falseExternal.record.inputs[0].externalUncolored === true, "False external flag was not recorded.");
  assert(
    signatureMatches(falseExternal.record.rawTransactionHex, falseHistory, 0, "schnorr"),
    "False external claim did not unlock the historical prevout."
  );
  assert(falseHistory[0].outputScriptHex === falseExternal.record.inputs[0].outputScriptHex, "False external case changed the script.");
  assert(falseHistory[0].prevoutSats === falseExternal.record.inputs[0].prevoutSats, "False external case changed the amount.");

  const preservedPush = alpSend(labId, ALP_STANDARD, [5000n]);
  expectSection(preservedPush, "SEND");
  const preserved = (id, parts) => remember(publish(
    id,
    0,
    parts,
    finalize(parts.map((part) => part.spec), [
      { sats: 0n, script: emppScript([preservedPush]) },
      carrier(parts[0].spec.keyName === "authorB" ? "authorA" : "authorB")
    ])
  ));
  preserved("lab-after-script-mismatch", [spend(genesis, layout.scriptMismatch, "authorA"), fee("authorA")]);
  preserved("lab-after-amount-mismatch", [spend(genesis, layout.amountMismatch, "authorA"), fee("authorA")]);
  preserved("lab-after-wrong-index", [spend(genesis, layout.wrongIndex, "authorB"), fee("authorB")]);
  preserved("lab-after-index-and-fresh", [spend(genesis, layout.freshBeside, "authorA"), fee("authorA")]);
  preserved("lab-after-false-external", [spend(genesis, layout.falseExternal, "authorA"), fee("authorA")]);

  const document = {
    schema: "tonalli-memo.rfc0001.alp-ancestry.s0",
    status: {
      rfc0001: "PROPOSED — NOT RATIFIED",
      sec17: "DESIGN_APPROVED_VALIDATION_PENDING",
      s0: "OPEN",
      s1: "NOT AUTHORIZED",
      m174: "OPEN",
      realRmzGenealogy: "NOT_DEMONSTRATED",
      settlement: "NOT_DEMONSTRATED",
      productiveTips: false,
      externalPrevoutEvidence: "NOT_DEMONSTRATED"
    },
    publicRmzTokenId: RMZ_TOKEN_ID,
    laboratoryTokenId: labId,
    foreignTokenId: foreign.txid,
    decimalTokenId: decimal.txid,
    targetTxid: TARGET,
    identities,
    layout,
    transactions: records,
    tips,
    claims: [
      { id: "lab-decimal-claim", tokenId: labId, claimedDecimals: 8 },
      { id: "lab-public-rmz-decimal-claim", tokenId: RMZ_TOKEN_ID, claimedDecimals: 2 }
    ]
  };
  const transcript = evaluateLaboratory(document);
  assertTranscript(transcript, document);
  return { ...document, transcript };
}

function assertTranscript(transcript, document) {
  const genesis = transcript.chain.byId["lab-genesis"];
  const mint = transcript.chain.byId["lab-mint"];
  const send = transcript.chain.byId["lab-send"];
  assert(genesis.ancestry === "LABORATORY_VALID", "Genesis was not a valid laboratory chain.");
  assert(genesis.tokenId === genesis.txid && genesis.genesisReference === genesis.txid, "Genesis reference drifted.");
  assert(genesis.decimals === 2 && genesis.ticker === "LAB", "Genesis metadata drifted.");
  assert(mint.ancestry === "LABORATORY_VALID" && mint.batonsConsumed === 1, "Mint did not consume its baton.");
  assert(send.conservation === "EXACT" && send.inputAtoms === "10000" && send.outputAtoms === "10000", "Send did not conserve atoms.");
  assert(send.coloredOutputs[0].outputIndex === 1 && send.coloredOutputs[0].atoms === "125", "Send atom map drifted.");
  const positive = transcript.tips.find((item) => item.id === "lab-tip-author1");
  assert(positive.receiptState === "PENDING", "Laboratory tip did not stay pending.");
  assert(positive.layers.settlement === "NOT_DEMONSTRATED", "Laboratory tip reported settlement.");
  assert(positive.layers.attributableAtoms === "125", "Author-index 1 tip amount drifted.");
  assert(positive.realRmzTip === false, "Synthetic tip was marked as real RMZ.");
  const serialized = JSON.stringify(transcript);
  assert(!serialized.includes("SETTLED"), "Transcript contains a settled state.");
  for (const entry of Object.values(transcript.chain.byId)) {
    assert(entry.realRmzGenealogy === "NOT_DEMONSTRATED", `${entry.id} claims RMZ genealogy.`);
  }
  assert(document.laboratoryTokenId !== document.publicRmzTokenId, "Laboratory token id matches public RMZ.");
  assert(document.status.externalPrevoutEvidence === "NOT_DEMONSTRATED", "External prevouts were marked as demonstrated.");
  const allowedSources = new Set(["LOCAL_CHAIN", "EXTERNAL_NOT_DEMONSTRATED", "UNAVAILABLE"]);
  for (const entry of Object.values(transcript.chain.byId)) {
    assert(Array.isArray(entry.prevoutSources) && entry.prevoutSources.length > 0, `${entry.id} has no prevout source.`);
    for (const source of entry.prevoutSources) {
      assert(allowedSources.has(source), `${entry.id} prevout source ${source} is not a laboratory label.`);
    }
  }
  assert(
    transcript.chain.byId["lab-genesis"].prevoutSources.join() === "EXTERNAL_NOT_DEMONSTRATED",
    "Genesis funding was treated as a local or mainnet prevout."
  );
  const rejected = (id, reasons) => {
    const entry = transcript.chain.byId[id];
    assert(entry.consensus === "INVALID" && entry.applied === false, `${id} was applied.`);
    assert(entry.coloredOutputs.length === 0, `${id} created colored outputs.`);
    assert(reasons.every((reason) => entry.reasons.includes(reason)), `${id} reasons were ${entry.reasons.join()}.`);
    const attributed = transcript.tips.find((item) => item.id === id);
    assert(attributed.laboratoryTransfer === "REJECTED" && attributed.layers.attributableAtoms === "0", `${id} was attributed.`);
    return { entry, attributed };
  };
  const script = rejected("lab-prevout-script-mismatch", ["PREVOUT_SCRIPT_MISMATCH"]);
  assert(!script.entry.reasons.includes("PREVOUT_AMOUNT_MISMATCH"), "Script mismatch also reported an amount mismatch.");
  assert(script.attributed.receiptState === "INVALID_AUTHOR", "Script mismatch was not an author failure.");
  const amount = rejected("lab-prevout-amount-mismatch", ["PREVOUT_AMOUNT_MISMATCH"]);
  assert(!amount.entry.reasons.includes("PREVOUT_SCRIPT_MISMATCH"), "Amount mismatch also reported a script mismatch.");
  assert(amount.attributed.receiptState === "INVALID_AUTHOR", "Amount mismatch was attributed or mislabeled.");
  const wrong = rejected("lab-prevout-wrong-index", ["PREVOUT_SCRIPT_MISMATCH", "PREVOUT_AMOUNT_MISMATCH"]);
  assert(wrong.attributed.receiptState === "INVALID_AUTHOR", "Wrong index was not an author failure.");
  const missing = rejected("lab-prevout-index-missing", ["PREVOUT_INDEX_MISMATCH"]);
  assert(missing.attributed.layers.authorshipError === "PREVOUT_UNAVAILABLE", "Missing index accepted fabricated authorship.");
  const sibling = rejected("lab-prevout-index-and-fresh", ["PREVOUT_INDEX_MISMATCH"]);
  assert(sibling.entry.consumed.map((input) => input.outIdx).includes(document.layout.freshBeside), "Fresh sibling was not recorded as referenced.");
  assert(sibling.attributed.receiptState === "INVALID_ASSET", "A valid sibling signature changed the receipt code.");
  assert(sibling.attributed.layers.authorship === "LAB_VALID", "The historical sibling signature was not recognized.");
  const external = rejected("lab-prevout-false-external", ["EXTERNAL_CLAIM_CONTRADICTS_CHAIN"]);
  assert(external.attributed.receiptState === "INVALID_ASSET", "False external claim changed the receipt code.");
  assert(external.attributed.layers.authorship === "LAB_VALID", "Historical signature of the false external claim was rejected as authorship.");
  for (const id of [
    "lab-after-script-mismatch",
    "lab-after-amount-mismatch",
    "lab-after-wrong-index",
    "lab-after-index-and-fresh",
    "lab-after-false-external"
  ]) {
    const entry = transcript.chain.byId[id];
    assert(entry.ancestry === "LABORATORY_VALID" && entry.applied === true, `${id} could not spend the preserved output.`);
  }
  const absent = transcript.chain.byId["lab-missing-prevout"];
  assert(absent.consensus === "INVALID" && absent.applied === false, "An unknown prevout stayed consensus-valid.");
  assert(absent.reasons.includes("PREVOUT_NOT_IN_CHAIN"), "Unknown prevout reason drifted.");
  const absentTip = transcript.tips.find((item) => item.id === "lab-missing-prevout");
  assert(absentTip.receiptState === "INVALID_ASSET" && absentTip.layers.authorship === "LAB_VALID", "Unknown prevout authorship drifted.");
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
  if (checkMode) {
    const current = await readFile(fixturePath, "utf8");
    if (current !== canonical) {
      throw new Error("rfc0001-alp-ancestry.json is not canonical. Regenerate it with the isolated generator.");
    }
  } else {
    await writeFile(fixturePath, canonical);
  }
}
