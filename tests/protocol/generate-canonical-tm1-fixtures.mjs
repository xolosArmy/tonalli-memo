import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  classifyAuthor,
  digestHex,
  preimageHex,
  sha256d,
  signatureMatches,
  toHex
} from "./canonical-tm1-independent-verify.mjs";

/**
 * Isolated generator for canonical two-push TM1 Core v1.0 fixtures.
 * It signs with ecash-lib, then asks the independent preimage checker to
 * agree. It does not modify packages/verification/scripts.
 *
 * Insecure deterministic test keys only. They are public fixtures and must
 * never receive funds.
 */

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json"));
const {
  ALL_ANYONECANPAY_BIP143,
  ALL_BIP143,
  Ecc,
  NONE_BIP143,
  P2PKHSignatory,
  Script,
  SigHashType,
  Tx,
  TxBuilder,
  UnsignedTx,
  shaRmd160
} = require("ecash-lib");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-canonical-tm1-p2pkh.json");
const checkMode = process.argv.includes("--check");
const ecc = new Ecc();
const privateKeys = {
  authorA: fromHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  authorB: fromHex("1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100"),
  observer: fromHex("202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f")
};
const PRIVATE_KEY_HEX = Object.values(privateKeys).map((key) => toHex(key));
const keys = Object.fromEntries(
  Object.entries(privateKeys).map(([name, privateKey]) => {
    const publicKey = ecc.derivePubkey(privateKey);
    const publicKeyHash = shaRmd160(publicKey);
    return [name, { privateKey, publicKey, publicKeyHash, outputScript: Script.p2pkh(publicKeyHash) }];
  })
);

function fromHex(hex) {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) {
    throw new Error(`Invalid hex: ${hex}`);
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function sha256(bytes) {
  return Uint8Array.from(createHash("sha256").update(bytes).digest());
}

function hash160(bytes) {
  return Uint8Array.from(createHash("ripemd160").update(sha256(bytes)).digest());
}

function pushBytes(bytes) {
  if (bytes.length <= 0x4b) {
    return [bytes.length, ...bytes];
  }
  if (bytes.length <= 0xff) {
    return [0x4c, bytes.length, ...bytes];
  }
  throw new Error("Fixture push too large.");
}

function canonicalTm1Script(authorInputIndex, eventData) {
  const payload = Buffer.from(eventData, "utf8");
  const envelope = Buffer.concat([Buffer.from([0x01, 0x01, authorInputIndex]), payload]);
  return new Script(Uint8Array.from([0x6a, ...pushBytes(fromHex("544d4d00")), ...pushBytes(envelope)]));
}

function multiPushTm1Script(authorInputIndex, eventData) {
  const payload = Uint8Array.from(Buffer.from(eventData, "utf8"));
  return new Script(
    Uint8Array.from([
      0x6a,
      ...pushBytes(fromHex("544d4d00")),
      ...pushBytes(Uint8Array.from([0x01])),
      ...pushBytes(Uint8Array.from([0x01])),
      ...pushBytes(Uint8Array.from([authorInputIndex])),
      ...pushBytes(payload)
    ])
  );
}

function deterministicTxid(label) {
  return hex(Uint8Array.from(sha256(Buffer.from(`tm1-canonical:${label}`, "utf8"))).reverse());
}

function inputSpec({ keyName = "authorA", sats = 10000n, label, outIdx = 0 }) {
  return {
    keyName,
    sats,
    prevOut: { txid: deterministicTxid(`${label}:${outIdx}`), outIdx },
    outputScript: keys[keyName].outputScript,
    scriptType: "p2pkh"
  };
}

function ecdsaP2pkhSignatory(privateKey, publicKey, sighashType) {
  return (signingEcc, input) => {
    const preimage = input.sigHashPreimage(sighashType);
    const signature = signingEcc.ecdsaSign(privateKey, sha256d(preimage.bytes));
    const flagged = new Uint8Array(signature.length + 1);
    flagged.set(signature, 0);
    flagged[signature.length] = sighashType.toInt() & 0xff;
    return Script.p2pkhSpend(publicKey, flagged);
  };
}

function signatoryFor(spec, index, authorInputIndex, sighashType, algorithm) {
  const key = keys[spec.keyName];
  const designated = index === authorInputIndex;
  const type = designated ? sighashType : ALL_BIP143;
  if (designated && algorithm === "ecdsa") {
    return ecdsaP2pkhSignatory(key.privateKey, key.publicKey, type);
  }
  return P2PKHSignatory(key.privateKey, key.publicKey, type);
}

function fixtureInput(spec) {
  return {
    prevOut: spec.prevOut,
    prevoutSats: spec.sats.toString(),
    outputScriptHex: spec.outputScript.toHex(),
    scriptType: spec.scriptType
  };
}

function buildSigned({ authorInputIndex, sighashType = ALL_BIP143, inputs, outputs, algorithm = "schnorr" }) {
  const tx = new TxBuilder({
    inputs: inputs.map((spec, index) => ({
      input: {
        prevOut: spec.prevOut,
        sequence: 0xffffffff,
        signData: { sats: spec.sats, outputScript: spec.outputScript }
      },
      signatory: signatoryFor(spec, index, authorInputIndex, sighashType, algorithm)
    })),
    outputs
  }).sign({ ecc });
  return { tx, inputs, authorInputIndex, sighashType, algorithm };
}

function libPreimage(rawTransactionHex, inputs, inputIndex, sighashByte) {
  const spec = inputs[inputIndex];
  if (spec === undefined || spec.outputScriptHex === null) {
    return null;
  }
  const tx = Tx.fromHex(rawTransactionHex);
  tx.inputs[inputIndex].signData = {
    sats: BigInt(spec.prevoutSats),
    outputScript: new Script(fromHex(spec.outputScriptHex))
  };
  const sighash = SigHashType.fromInt(sighashByte);
  if (sighash === undefined) {
    throw new Error(`ecash-lib rejected sighash 0x${sighashByte.toString(16)}.`);
  }
  const preimage = UnsignedTx.fromTx(tx).inputAt(inputIndex).sigHashPreimage(sighash).bytes;
  return toHex(preimage);
}

function agree(rawTransactionHex, inputs, inputIndex, sighashByte, id) {
  const fromLib = libPreimage(rawTransactionHex, inputs, inputIndex, sighashByte);
  const independent = preimageHex(rawTransactionHex, inputs, inputIndex, sighashByte);
  if (fromLib !== independent) {
    throw new Error(`${id} sighash preimage diverged between ecash-lib and the independent serializer.`);
  }
  return { libPreimageHex: fromLib, libDigestHex: toHex(sha256d(fromHex(fromLib))) };
}

function cloneTx(rawTransactionHex) {
  return Tx.fromHex(rawTransactionHex);
}

function record({
  id,
  polarity,
  description,
  signed,
  rawTransactionHex,
  inputs,
  authorInputIndex,
  signatureAlgorithm,
  eventDataUtf8,
  parseOk,
  parseErrorCode = null,
  independent,
  designated,
  normalized,
  signatureValidAtIndex = null,
  preimageInputIndex = null,
  preimageSighashByte = null,
  signedDigestHex = null
}) {
  const tx = Tx.fromHex(rawTransactionHex);
  let preimage = { libPreimageHex: null, libDigestHex: null };
  if (preimageInputIndex !== null && preimageSighashByte !== null) {
    preimage = agree(rawTransactionHex, inputs, preimageInputIndex, preimageSighashByte, id);
  }
  const fixture = {
    id,
    polarity,
    description,
    signatureAlgorithm,
    authorInputIndex,
    rawTransactionHex,
    txid: tx.txid(),
    inputs,
    outputs: tx.outputs.map((output, outputIndex) => ({
      outputIndex,
      sats: output.sats.toString(),
      outputScriptHex: output.script.toHex()
    })),
    source: "synthetic-fixture",
    chronikValidated: false,
    eventDataUtf8,
    libPreimageHex: preimage.libPreimageHex,
    libDigestHex: preimage.libDigestHex,
    preimageInputIndex,
    signedDigestHex,
    expected: {
      independent,
      parseOk,
      parseErrorCode,
      designated,
      normalized,
      signatureValidAtIndex
    }
  };
  if (independent !== null) {
    const actual = classifyAuthor(fixture);
    if (actual.valid !== independent.valid || actual.stage !== independent.stage || actual.errorCode !== independent.errorCode) {
      throw new Error(`${id} independent stage ${actual.stage}/${actual.errorCode} did not match ${independent.stage}/${independent.errorCode}.`);
    }
  }
  if (signatureValidAtIndex !== null) {
    const matches = signatureMatches(rawTransactionHex, inputs, signatureValidAtIndex.index, signatureValidAtIndex.algorithm);
    if (!matches) {
      throw new Error(`${id} signature did not verify at input ${signatureValidAtIndex.index}.`);
    }
  }
  if (polarity === "positive") {
    const digest = digestHex(rawTransactionHex, inputs, authorInputIndex, Number.parseInt(signed.sighashByte, 16));
    if (digest !== preimage.libDigestHex) {
      throw new Error(`${id} positive digest did not match the signed preimage.`);
    }
  }
  return fixture;
}

function signedFixture(spec) {
  const built = buildSigned(spec);
  const rawTransactionHex = built.tx.toHex();
  const inputs = built.inputs.map(fixtureInput);
  const sighashByte = built.sighashType.toInt() & 0xff;
  const signedDigestHex = digestHex(rawTransactionHex, inputs, built.authorInputIndex, sighashByte);
  return { built, rawTransactionHex, inputs, sighashByte, signedDigestHex, algorithm: spec.algorithm ?? "schnorr" };
}

function basePositive() {
  return {
    id: "canonical-schnorr-author0-sighash-41",
    description: "Canonical two-push POST, author input 0, Schnorr, SIGHASH_ALL|FORKID (0x41). Synthetic; not a Chronik result.",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-0" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "canon0 all") },
      { sats: 9000n, script: keys.authorA.outputScript }
    ],
    eventDataUtf8: "canon0 all"
  };
}

function positiveRecord(spec) {
  const signed = signedFixture(spec);
  return record({
    id: spec.id,
    polarity: "positive",
    description: spec.description,
    signed: { sighashByte: signed.sighashByte.toString(16) },
    rawTransactionHex: signed.rawTransactionHex,
    inputs: signed.inputs,
    authorInputIndex: spec.authorInputIndex,
    signatureAlgorithm: signed.algorithm,
    eventDataUtf8: spec.eventDataUtf8,
    parseOk: true,
    independent: { valid: true, stage: "cryptographic-signature", errorCode: null },
    designated: { valid: true },
    normalized: { status: "VERIFIED_TM1", errorCode: null, trustModel: "trusted-chronik" },
    preimageInputIndex: spec.authorInputIndex,
    preimageSighashByte: signed.sighashByte,
    signedDigestHex: signed.signedDigestHex
  });
}

function mutateRaw(rawTransactionHex, mutate) {
  const tx = cloneTx(rawTransactionHex);
  mutate(tx);
  return tx.toHex();
}

function replaceAscii(tx, needle, replacement) {
  const script = Buffer.from(tx.outputs[0].script.toHex(), "hex");
  const at = script.indexOf(needle);
  if (at < 0) {
    throw new Error(`Could not find ${needle} in the canonical envelope.`);
  }
  script.set(Buffer.from(replacement), at);
  tx.outputs[0].script = new Script(Uint8Array.from(script));
}

function flipSignature(rawTransactionHex) {
  const tx = cloneTx(rawTransactionHex);
  const script = Buffer.from(tx.inputs[0].script.toHex(), "hex");
  script[11] ^= 0x01;
  tx.inputs[0].script = new Script(Uint8Array.from(script));
  return tx.toHex();
}

function swapPubkey(rawTransactionHex) {
  const tx = cloneTx(rawTransactionHex);
  const current = tx.inputs[0].script.toHex();
  const authorA = hex(keys.authorA.publicKey);
  const authorB = hex(keys.authorB.publicKey);
  if (!current.endsWith(authorA)) {
    throw new Error("Author A pubkey was not the final scriptSig push.");
  }
  tx.inputs[0].script = new Script(fromHex(`${current.slice(0, -authorA.length)}${authorB}`));
  return tx.toHex();
}

function buildFixtures() {
  const author0 = basePositive();
  const signedAuthor0 = signedFixture(author0);
  const p2shScript = Script.p2sh(hash160(Uint8Array.from([1, 2, 3, 4])));
  const outOfRange = signedFixture({
    id: "canonical-schnorr-author-index-out-of-range",
    description: "Envelope author index 5 is signed, and the transaction has one input. Rejection is the index stage.",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-oor" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(5, "canon index five") },
      { sats: 9000n, script: keys.authorA.outputScript }
    ],
    eventDataUtf8: "canon index five"
  });
  const sighashNone = signedFixture({
    id: "canonical-schnorr-sighash-none-forkid",
    description: "Schnorr signature uses SIGHASH_NONE|FORKID (0x42). The signature is real and the TM1 policy rejects the sighash.",
    authorInputIndex: 0,
    sighashType: NONE_BIP143,
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-none" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "canon none") },
      { sats: 9000n, script: keys.authorA.outputScript }
    ],
    eventDataUtf8: "canon none"
  });

  const positive = [
    positiveRecord(author0),
    positiveRecord({
      id: "canonical-schnorr-author1-sighash-41",
      description: "Canonical two-push POST, author input 1, Schnorr, 0x41, with a separate funding input.",
      authorInputIndex: 1,
      sighashType: ALL_BIP143,
      inputs: [
        inputSpec({ keyName: "observer", sats: 8000n, label: "canon-1-fee" }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-1-author" })
      ],
      outputs: [
        { sats: 0n, script: canonicalTm1Script(1, "canon1 all") },
        { sats: 17000n, script: keys.authorA.outputScript }
      ],
      eventDataUtf8: "canon1 all"
    }),
    positiveRecord({
      id: "canonical-schnorr-author0-sighash-c1",
      description: "Canonical two-push POST, author input 0, Schnorr, SIGHASH_ALL|ANYONECANPAY|FORKID (0xc1). All outputs are committed.",
      authorInputIndex: 0,
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [
        inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-c1-author" }),
        inputSpec({ keyName: "observer", sats: 7000n, label: "canon-c1-fee" })
      ],
      outputs: [
        { sats: 0n, script: canonicalTm1Script(0, "canon0 anyonecanpay") },
        { sats: 546n, script: keys.observer.outputScript },
        { sats: 15454n, script: keys.authorA.outputScript }
      ],
      eventDataUtf8: "canon0 anyonecanpay"
    }),
    positiveRecord({
      id: "canonical-schnorr-author2-sighash-c1",
      description: "Canonical two-push POST, author input 2, Schnorr, 0xc1. Nonzero index and anyone-can-pay together.",
      authorInputIndex: 2,
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [
        inputSpec({ keyName: "observer", sats: 5000n, label: "canon-2-fee" }),
        inputSpec({ keyName: "authorB", sats: 5000n, label: "canon-2-b" }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-2-author" })
      ],
      outputs: [
        { sats: 0n, script: canonicalTm1Script(2, "canon2 anyonecanpay") },
        { sats: 19000n, script: keys.authorA.outputScript }
      ],
      eventDataUtf8: "canon2 anyonecanpay"
    }),
    positiveRecord({
      id: "canonical-ecdsa-author0-sighash-41",
      description: "Canonical two-push POST, author input 0, ECDSA DER with sighash 0x41. BIP143 digest, not a legacy sighash.",
      authorInputIndex: 0,
      sighashType: ALL_BIP143,
      algorithm: "ecdsa",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "canon-ecdsa" })],
      outputs: [
        { sats: 0n, script: canonicalTm1Script(0, "canon0 ecdsa") },
        { sats: 9000n, script: keys.authorA.outputScript }
      ],
      eventDataUtf8: "canon0 ecdsa"
    })
  ];

  const postMutated = mutateRaw(signedAuthor0.rawTransactionHex, (tx) => replaceAscii(tx, "canon0 all", "canon0 ALL"));
  const outputMutated = mutateRaw(signedAuthor0.rawTransactionHex, (tx) => {
    tx.outputs[1].sats = 8999n;
  });
  const wrongAmountInputs = signedAuthor0.inputs.map((input, index) =>
    index === 0 ? { ...input, prevoutSats: "10001" } : input
  );
  const missingPrevout = [];
  const p2shInputs = signedAuthor0.inputs.map((input, index) =>
    index === 0 ? { ...input, outputScriptHex: p2shScript.toHex(), scriptType: "p2sh" } : input
  );
  const malformed = mutateRaw(signedAuthor0.rawTransactionHex, (tx) => {
    tx.outputs[0].script = multiPushTm1Script(0, "canon0 all");
  });

  const negative = [
    record({
      id: "negative-signature-altered",
      polarity: "negative",
      description: "Schnorr signature byte flipped after signing. Envelope and outputs stay canonical. Independent digest check rejects; the production helper does not.",
      signed: { sighashByte: "41" },
      rawTransactionHex: flipSignature(signedAuthor0.rawTransactionHex),
      inputs: signedAuthor0.inputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 all",
      parseOk: true,
      independent: { valid: false, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE" },
      designated: { valid: true },
      normalized: { status: "VERIFIED_TM1", errorCode: null, trustModel: "trusted-chronik" },
      preimageInputIndex: 0,
      preimageSighashByte: 0x41,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-post-mutated",
      polarity: "negative",
      description: "POST text changed inside the canonical two-push envelope after signing. Format stays valid. The new digest does not match the old signature.",
      signed: { sighashByte: "41" },
      rawTransactionHex: postMutated,
      inputs: signedAuthor0.inputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 ALL",
      parseOk: true,
      independent: { valid: false, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE" },
      designated: { valid: true },
      normalized: { status: "VERIFIED_TM1", errorCode: null, trustModel: "trusted-chronik" },
      preimageInputIndex: 0,
      preimageSighashByte: 0x41,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-sighash-all-output-mutated",
      polarity: "negative",
      description: "Change output value changed after a 0x41 signature. SIGHASH_ALL commits every output, including that change.",
      signed: { sighashByte: "41" },
      rawTransactionHex: outputMutated,
      inputs: signedAuthor0.inputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 all",
      parseOk: true,
      independent: { valid: false, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE" },
      designated: { valid: true },
      normalized: { status: "VERIFIED_TM1", errorCode: null, trustModel: "trusted-chronik" },
      preimageInputIndex: 0,
      preimageSighashByte: 0x41,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-prevout-amount",
      polarity: "negative",
      description: "Raw transaction is the valid author-0 signature. The recorded prevout amount is 10001 sats instead of the signed 10000.",
      signed: { sighashByte: "41" },
      rawTransactionHex: signedAuthor0.rawTransactionHex,
      inputs: wrongAmountInputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 all",
      parseOk: true,
      independent: { valid: false, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE" },
      designated: { valid: true },
      normalized: { status: "VERIFIED_TM1", errorCode: null, trustModel: "trusted-chronik" },
      preimageInputIndex: 0,
      preimageSighashByte: 0x41,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-pubkey-hash-mismatch",
      polarity: "negative",
      description: "ScriptSig pubkey replaced with another test key. HASH160 no longer matches the designated P2PKH prevout.",
      signed: { sighashByte: "41" },
      rawTransactionHex: swapPubkey(signedAuthor0.rawTransactionHex),
      inputs: signedAuthor0.inputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 all",
      parseOk: true,
      independent: { valid: false, stage: "pubkey-hash-match", errorCode: "INVALID_AUTHOR_SIGNATURE" },
      designated: { valid: false, stage: "pubkey-hash-match", errorCode: "INVALID_AUTHOR_SIGNATURE" },
      normalized: { status: "INVALID_TM1", errorCode: "INVALID_AUTHOR_SIGNATURE", trustModel: null },
      preimageInputIndex: null,
      preimageSighashByte: null,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-author-index-out-of-range",
      polarity: "negative",
      description: "Canonical envelope declares author index 5. The signature on input 0 is valid. Rejection is AUTHOR_INPUT_OUT_OF_RANGE, not the digest.",
      signed: { sighashByte: "41" },
      rawTransactionHex: outOfRange.rawTransactionHex,
      inputs: outOfRange.inputs,
      authorInputIndex: 5,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon index five",
      parseOk: true,
      independent: { valid: false, stage: "author-index", errorCode: "AUTHOR_INPUT_OUT_OF_RANGE" },
      designated: { valid: false, stage: "author-index", errorCode: "AUTHOR_INPUT_OUT_OF_RANGE" },
      normalized: { status: "INVALID_TM1", errorCode: "AUTHOR_INPUT_OUT_OF_RANGE", trustModel: null },
      signatureValidAtIndex: { index: 0, algorithm: "schnorr" },
      preimageInputIndex: 0,
      preimageSighashByte: 0x41,
      signedDigestHex: outOfRange.signedDigestHex
    }),
    record({
      id: "negative-prevout-missing",
      polarity: "negative",
      description: "The signed transaction is unchanged and the designated prevout metadata is absent.",
      signed: { sighashByte: "41" },
      rawTransactionHex: signedAuthor0.rawTransactionHex,
      inputs: missingPrevout,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 all",
      parseOk: true,
      independent: { valid: false, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE" },
      designated: { valid: false, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE" },
      normalized: { status: "INVALID_TM1", errorCode: "PREVOUT_UNAVAILABLE", trustModel: null },
      preimageInputIndex: null,
      preimageSighashByte: null,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-designated-p2sh",
      polarity: "negative",
      description: "Designated prevout replaced with P2SH. The canonical envelope is untouched. Rejection is the prevout script type.",
      signed: { sighashByte: "41" },
      rawTransactionHex: signedAuthor0.rawTransactionHex,
      inputs: p2shInputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon0 all",
      parseOk: true,
      independent: { valid: false, stage: "prevout-script-type", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT" },
      designated: { valid: false, stage: "prevout-script-type", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT" },
      normalized: { status: "INVALID_TM1", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT", trustModel: null },
      preimageInputIndex: null,
      preimageSighashByte: null,
      signedDigestHex: signedAuthor0.signedDigestHex
    }),
    record({
      id: "negative-sighash-none-forkid",
      polarity: "negative",
      description: "Signed with 0x42. Independent verification accepts that signature under NONE|FORKID, and TM1 policy rejects the sighash before the digest stage.",
      signed: { sighashByte: "42" },
      rawTransactionHex: sighashNone.rawTransactionHex,
      inputs: sighashNone.inputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: "canon none",
      parseOk: true,
      independent: { valid: false, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH" },
      designated: { valid: false, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH" },
      normalized: { status: "INVALID_TM1", errorCode: "UNSUPPORTED_SIGHASH", trustModel: null },
      signatureValidAtIndex: { index: 0, algorithm: "schnorr" },
      preimageInputIndex: 0,
      preimageSighashByte: 0x42,
      signedDigestHex: sighashNone.signedDigestHex
    }),
    record({
      id: "negative-multipush-envelope",
      polarity: "negative",
      description: "Version, event, index and data are separate pushes. This is a format rejection. Historical authorization fixtures stay unmodified and are the same shape.",
      signed: { sighashByte: "41" },
      rawTransactionHex: malformed,
      inputs: signedAuthor0.inputs,
      authorInputIndex: 0,
      signatureAlgorithm: "schnorr",
      eventDataUtf8: null,
      parseOk: false,
      parseErrorCode: "INVALID_FORMAT",
      independent: null,
      designated: { valid: true },
      normalized: { status: "INVALID_TM1", errorCode: "INVALID_FORMAT", trustModel: null },
      preimageInputIndex: null,
      preimageSighashByte: null,
      signedDigestHex: null
    })
  ];

  for (const fixture of [...positive, ...negative]) {
    if (fixture.polarity === "negative" && fixture.signedDigestHex !== null && fixture.libDigestHex !== null) {
      const digestMustChange = [
        "negative-post-mutated",
        "negative-sighash-all-output-mutated",
        "negative-prevout-amount"
      ];
      if (digestMustChange.includes(fixture.id) && fixture.libDigestHex === fixture.signedDigestHex) {
        throw new Error(`${fixture.id} did not change the signed digest.`);
      }
      if (fixture.id === "negative-signature-altered" && fixture.libDigestHex !== fixture.signedDigestHex) {
        throw new Error("A scriptSig change must not change the BIP143 digest.");
      }
    }
  }

  return {
    schemaVersion: 1,
    protocol: "TM1-CORE-V1.0",
    version: "0x01",
    eventType: "POST-0x01",
    purpose: "Canonical two-push envelopes with independently checked P2PKH signatures. Synthetic fixtures, not Chronik validation and not on-chain confirmation.",
    generator: {
      library: "ecash-lib",
      version: "4.13.0",
      sighashSerializer: "tests/protocol/canonical-tm1-independent-verify.mjs"
    },
    testKeys: Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        {
          warning: "Deterministic test key only; derived from insecure fixtures and never for funds.",
          publicKeyHex: hex(key.publicKey),
          publicKeyHashHex: hex(key.publicKeyHash)
        }
      ])
    ),
    positive,
    negative
  };
}

const fixtures = buildFixtures();
const canonical = `${JSON.stringify(fixtures, null, 2)}\n`;
for (const secret of PRIVATE_KEY_HEX) {
  if (canonical.includes(secret)) {
    throw new Error("Refusing to write a fixture file that contains a test private key.");
  }
}
if (fixtures.positive.length < 4 || fixtures.negative.length < 10) {
  throw new Error("Canonical corpus is missing required positive or negative fixtures.");
}

if (checkMode) {
  const current = await readFile(fixturePath, "utf8");
  if (current !== canonical) {
    throw new Error("rfc0001-canonical-tm1-p2pkh.json is not canonical. Regenerate it with the isolated generator.");
  }
} else {
  await writeFile(fixturePath, canonical, "utf8");
}
