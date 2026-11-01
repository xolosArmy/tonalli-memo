import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  classifyAuthor,
  digestHex,
  parseTx,
  preimageHex,
  signatureMatches,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import { inspectEmppContainer } from "./empp-tmm-independent.mjs";
import {
  agree,
  assertFixtureHasNoPrivateKeys,
  canonicalTm1Script,
  inputSpec,
  signedFixture,
  testOutputScript
} from "./generate-canonical-tm1-fixtures.mjs";

/**
 * Signed synthetic transactions: one ALP/eMPP TMM container beside one
 * two-push TM1 Core v1.0 POST. Every output is fixed before signing.
 * Negative cases edit an already signed transaction and must fail the
 * independent oracle. No private keys are written. No node is contacted.
 */

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json"));
const { ALL_ANYONECANPAY_BIP143, ALL_BIP143, Script, Tx } = require("ecash-lib");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-sec17-coexistence.json");
const emppCorpusPath = join(repoRoot, "tests/fixtures/rfc0001-empp-tmm.json");
const checkMode = process.argv.includes("--check");

function fail(message) {
  throw new Error(message);
}

function fromHex(hex) {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) {
    fail(`Invalid hex: ${hex}`);
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function frozenEmppScript() {
  const corpus = JSON.parse(readFileSync(emppCorpusPath, "utf8"));
  const sample = corpus.cases.find((item) => item.id === "alp-send-plus-one-tmm");
  const scriptHex = sample?.outputs?.[0]?.scriptHex;
  if (typeof scriptHex !== "string" || scriptHex.length !== 184) {
    fail("Frozen ALP SEND + TMM script is missing or is not 92 bytes.");
  }
  const inspected = inspectEmppContainer(fromHex(scriptHex), {
    declaredTargetTxid: corpus.declaredTargetTxid,
    declaredRecipientOutput: 1
  });
  if (inspected.axes.wireShape !== "PROPOSED_SHAPE") {
    fail(`Frozen container shape is ${inspected.axes.wireShape}.`);
  }
  if (!scriptHex.endsWith(corpus.canonicalTmmHex)) {
    fail("Frozen container does not end in the canonical TMM entry.");
  }
  return { script: new Script(fromHex(scriptHex)), scriptHex };
}

function tm0Script(text) {
  const payload = Buffer.from(text, "ascii");
  if (payload.length > 0x4b) {
    fail("TM0 text is longer than this builder allows.");
  }
  return new Script(Uint8Array.from([0x6a, payload.length, ...payload]));
}

function outputCount(rawTransactionHex) {
  return parseTx(rawTransactionHex).outputs.length;
}

function signAll(spec) {
  const outputs = spec.outputs;
  if (outputs.length < 3) {
    fail(`${spec.id} must fix the eMPP output, the POST, and the change before signing.`);
  }
  const signed = signedFixture({
    authorInputIndex: spec.authorInputIndex,
    sighashType: spec.sighashType,
    algorithm: spec.algorithm,
    inputs: spec.inputs,
    outputs
  });
  if (outputCount(signed.rawTransactionHex) !== outputs.length) {
    fail(`${spec.id} changed its output count while signing.`);
  }
  return signed;
}

function cloneHex(rawTransactionHex) {
  return Tx.fromHex(rawTransactionHex).toHex();
}

function flipSignature(rawTransactionHex, inputIndex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const script = Buffer.from(tx.inputs[inputIndex].script.toHex(), "hex");
  const pushLength = script[0];
  if (pushLength === undefined || pushLength < 3 || pushLength > 0x4b) {
    fail("Cannot locate the signed scriptSig push.");
  }
  script[2] ^= 0x01;
  tx.inputs[inputIndex].script = new Script(Uint8Array.from(script));
  return tx.toHex();
}

function flipOutpoint(rawTransactionHex, inputIndex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const previous = tx.inputs[inputIndex].prevOut;
  const txid = Uint8Array.from(previous.txid);
  txid[0] ^= 0x01;
  tx.inputs[inputIndex].prevOut = { txid, outIdx: previous.outIdx };
  const raw = tx.toHex();
  const before = parseTx(rawTransactionHex).inputs[inputIndex].prevTxid;
  const after = parseTx(raw).inputs[inputIndex].prevTxid;
  if (after === before) {
    fail("The outpoint mutation did not survive reserialization.");
  }
  return raw;
}

function replaceOutputScript(rawTransactionHex, outputIndex, script) {
  const tx = Tx.fromHex(rawTransactionHex);
  tx.outputs[outputIndex].script = script;
  return tx.toHex();
}

function flipLastOutputByte(rawTransactionHex, outputIndex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const script = Buffer.from(tx.outputs[outputIndex].script.toHex(), "hex");
  script[script.length - 1] ^= 0x01;
  tx.outputs[outputIndex].script = new Script(Uint8Array.from(script));
  return tx.toHex();
}

function setChangeSats(rawTransactionHex, outputIndex, sats) {
  const tx = Tx.fromHex(rawTransactionHex);
  tx.outputs[outputIndex].sats = sats;
  return tx.toHex();
}

function readAuthorByte(scriptHex) {
  const script = Buffer.from(scriptHex, "hex");
  if (script[0] !== 0x6a || script[1] !== 0x04 || script.subarray(2, 6).toString("hex") !== "544d4d00") {
    fail("Expected a two-push TM1 POST.");
  }
  if (script[6] > 0x4b || script[7] !== 0x01 || script[8] !== 0x01) {
    fail("Expected a Core v1.0 POST envelope.");
  }
  return { script, at: 9, authorIndex: script[9] };
}

function scriptWithAuthor(scriptHex, authorIndex) {
  const parsed = readAuthorByte(scriptHex);
  parsed.script[parsed.at] = authorIndex;
  return new Script(Uint8Array.from(parsed.script));
}

function postScriptHex(rawTransactionHex, outputIndex) {
  return Tx.fromHex(rawTransactionHex).outputs[outputIndex].script.toHex();
}

function copyInputs(inputs, edit) {
  return inputs.map((input, index) => (index === edit.index ? { ...input, ...edit.patch } : input));
}

function observedOutpoint(rawTransactionHex, inputIndex) {
  const input = parseTx(rawTransactionHex).inputs[inputIndex];
  return { txid: input.prevTxid, outIdx: input.outIdx };
}

function finish(spec) {
  const inputs = spec.inputs;
  const rawTransactionHex = spec.rawTransactionHex;
  if (outputCount(rawTransactionHex) !== spec.outputCount) {
    fail(`${spec.id} output count drifted after the signature.`);
  }
  const fixture = {
    rawTransactionHex,
    authorInputIndex: spec.authorInputIndex,
    signatureAlgorithm: spec.signatureAlgorithm,
    inputs
  };
  const independent = classifyAuthor(fixture);
  const expected = spec.expectedIndependent;
  if (
    independent.valid !== expected.valid
    || independent.stage !== expected.stage
    || independent.errorCode !== expected.errorCode
  ) {
    fail(`${spec.id} oracle ${independent.stage}/${independent.errorCode} != ${expected.stage}/${expected.errorCode}.`);
  }
  let libPreimageHex = null;
  if (spec.preimageInputIndex !== null) {
    const checked = agree(
      rawTransactionHex,
      inputs,
      spec.preimageInputIndex,
      spec.sighashByte,
      spec.id
    );
    libPreimageHex = checked.libPreimageHex;
    const independentPreimage = preimageHex(rawTransactionHex, inputs, spec.preimageInputIndex, spec.sighashByte);
    if (independentPreimage !== libPreimageHex) {
      fail(`${spec.id} preimage cross-check disagrees.`);
    }
    const digest = digestHex(rawTransactionHex, inputs, spec.preimageInputIndex, spec.sighashByte);
    if (spec.digestChanges && digest === spec.signedDigestHex) {
      fail(`${spec.id} did not change the signed digest.`);
    }
    if (!spec.digestChanges && digest !== spec.signedDigestHex) {
      fail(`${spec.id} changed a digest that the mutation must preserve.`);
    }
  }
  if (spec.signatureStillValidAt !== null) {
    const stillValid = signatureMatches(
      rawTransactionHex,
      inputs,
      spec.signatureStillValidAt.index,
      spec.signatureStillValidAt.algorithm
    );
    if (!stillValid) {
      fail(`${spec.id} lost a signature that should remain valid at input ${spec.signatureStillValidAt.index}.`);
    }
  }
  if (independent.valid) {
    const matches = signatureMatches(rawTransactionHex, inputs, spec.authorInputIndex, spec.signatureAlgorithm);
    if (!matches) {
      fail(`${spec.id} classified the signature as valid, and the direct check rejected it.`);
    }
  }
  return {
    id: spec.id,
    polarity: spec.polarity,
    description: spec.description,
    mutation: spec.mutation,
    signatureAlgorithm: spec.signatureAlgorithm,
    authorInputIndex: spec.authorInputIndex,
    sighashByte: spec.sighashByte,
    postOutputIndexes: spec.postOutputIndexes,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    outputCount: spec.outputCount,
    inputs,
    preimageInputIndex: spec.preimageInputIndex,
    libPreimageHex,
    signedDigestHex: spec.signedDigestHex,
    signatureStillValidAt: spec.signatureStillValidAt,
    source: "synthetic-fixture",
    chronikValidated: false,
    networkValidity: "NOT_DEMONSTRATED",
    tipSettlement: "NOT_DEMONSTRATED",
    expected: {
      independent,
      change: spec.change,
      beforeStatus: "MULTIPLE_MEMOS",
      afterStatus: spec.afterStatus,
      authorship: spec.authorship,
      structuralPost: true,
      appliedAsPostAuthorship: spec.appliedAsPostAuthorship
    }
  };
}

function positiveCase(spec) {
  const signed = signAll(spec);
  const authorByte = readAuthorByte(postScriptHex(signed.rawTransactionHex, spec.postOutputIndex)).authorIndex;
  if (authorByte !== spec.authorInputIndex) {
    fail(`${spec.id} signed a POST whose author byte is ${authorByte}.`);
  }
  return finish({
    id: spec.id,
    polarity: "positive",
    description: spec.description,
    mutation: "none",
    signatureAlgorithm: spec.algorithm ?? "schnorr",
    authorInputIndex: spec.authorInputIndex,
    sighashByte: signed.sighashByte,
    postOutputIndexes: [spec.postOutputIndex],
    rawTransactionHex: signed.rawTransactionHex,
    outputCount: spec.outputs.length,
    inputs: signed.inputs,
    preimageInputIndex: spec.authorInputIndex,
    signedDigestHex: signed.signedDigestHex,
    signatureStillValidAt: null,
    expectedIndependent: { valid: true, stage: "cryptographic-signature", errorCode: null },
    digestChanges: false,
    change: "AUTHORIZED_B_LAB_CRYPTO",
    afterStatus: "VERIFIED_TM1",
    authorship: "LAB_CRYPTOGRAPHIC",
    appliedAsPostAuthorship: true
  });
}

function negativeFrom(base, spec) {
  const signed = signAll(base);
  const edited = spec.edit(signed);
  return finish({
    id: spec.id,
    polarity: spec.polarity ?? "negative",
    description: spec.description,
    mutation: spec.mutation,
    signatureAlgorithm: base.algorithm ?? "schnorr",
    authorInputIndex: spec.authorInputIndex,
    sighashByte: signed.sighashByte,
    postOutputIndexes: spec.postOutputIndexes,
    rawTransactionHex: edited.rawTransactionHex,
    outputCount: base.outputs.length,
    inputs: edited.inputs,
    preimageInputIndex: spec.preimageInputIndex,
    signedDigestHex: signed.signedDigestHex,
    signatureStillValidAt: spec.signatureStillValidAt,
    expectedIndependent: spec.expectedIndependent,
    digestChanges: spec.digestChanges,
    change: spec.change,
    afterStatus: spec.afterStatus,
    authorship: spec.authorship,
    appliedAsPostAuthorship: false
  });
}

function buildFixtures() {
  const empp = frozenEmppScript();
  const change = testOutputScript("authorA");
  const author0Outputs = [
    { sats: 0n, script: empp.script },
    { sats: 0n, script: canonicalTm1Script(0, "coex author0") },
    { sats: 9000n, script: change }
  ];
  const author0 = {
    id: "coex-schnorr-author0-sighash-41",
    description: "Schnorr author input 0, sighash 0x41. ALP/eMPP TMM and the two-push POST are both outputs before the digest is signed. Synthetic laboratory signature only.",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "coex-a0" })],
    outputs: author0Outputs,
    postOutputIndex: 1
  };
  const author1 = {
    id: "coex-schnorr-author1-sighash-41",
    description: "Schnorr author input 1, sighash 0x41, with a separate funding input. The POST names input 1. Outputs are fixed before signing.",
    authorInputIndex: 1,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: [
      inputSpec({ keyName: "observer", sats: 8000n, label: "coex-a1-fee" }),
      inputSpec({ keyName: "authorA", sats: 10000n, label: "coex-a1-author" })
    ],
    outputs: [
      { sats: 0n, script: empp.script },
      { sats: 0n, script: canonicalTm1Script(1, "coex author1") },
      { sats: 17000n, script: change }
    ],
    postOutputIndex: 1
  };
  const ecdsa0 = {
    id: "coex-ecdsa-author0-sighash-41",
    description: "ECDSA author input 0, sighash 0x41. BIP143 digest. The eMPP container is committed with the POST.",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "ecdsa",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "coex-ecdsa0" })],
    outputs: [
      { sats: 0n, script: empp.script },
      { sats: 0n, script: canonicalTm1Script(0, "coex ecdsa0") },
      { sats: 9000n, script: change }
    ],
    postOutputIndex: 1
  };
  const ecdsa2 = {
    id: "coex-ecdsa-author2-sighash-c1",
    description: "ECDSA author input 2, sighash 0xc1. Nonzero author index and SIGHASH_ALL|ANYONECANPAY|FORKID. Every output is fixed first.",
    authorInputIndex: 2,
    sighashType: ALL_ANYONECANPAY_BIP143,
    algorithm: "ecdsa",
    inputs: [
      inputSpec({ keyName: "observer", sats: 5000n, label: "coex-e2-fee" }),
      inputSpec({ keyName: "authorB", sats: 5000n, label: "coex-e2-b" }),
      inputSpec({ keyName: "authorA", sats: 10000n, label: "coex-e2-author" })
    ],
    outputs: [
      { sats: 0n, script: empp.script },
      { sats: 0n, script: canonicalTm1Script(2, "coex ecdsa2") },
      { sats: 19000n, script: change }
    ],
    postOutputIndex: 1
  };
  const outOfRangeBase = {
    id: "coex-negative-author-index-out-of-range",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "coex-oor" })],
    outputs: [
      { sats: 0n, script: empp.script },
      { sats: 0n, script: canonicalTm1Script(5, "coex index five") },
      { sats: 9000n, script: change }
    ]
  };
  const controlTm0 = {
    id: "coex-control-tm0-and-tm1",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: [inputSpec({ keyName: "authorA", sats: 12000n, label: "coex-both" })],
    outputs: [
      { sats: 0n, script: empp.script },
      { sats: 0n, script: tm0Script("TM0|p|xa|hi") },
      { sats: 0n, script: canonicalTm1Script(0, "coex beside tm0") },
      { sats: 11000n, script: change }
    ]
  };
  const controlTwo = {
    id: "coex-control-two-tm1",
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: [inputSpec({ keyName: "authorA", sats: 12000n, label: "coex-two" })],
    outputs: [
      { sats: 0n, script: empp.script },
      { sats: 0n, script: canonicalTm1Script(0, "coex tm1 a") },
      { sats: 0n, script: canonicalTm1Script(0, "coex tm1 b") },
      { sats: 11000n, script: change }
    ]
  };

  const cryptoReject = {
    valid: false,
    stage: "cryptographic-signature",
    errorCode: "INVALID_AUTHOR_SIGNATURE"
  };
  const cases = [
    positiveCase(author0),
    positiveCase(author1),
    positiveCase(ecdsa0),
    positiveCase(ecdsa2),
    negativeFrom(author0, {
      id: "coex-negative-signature",
      description: "Signature byte flipped after signing. The POST and the eMPP output stay in place. Production trusted-chronik still reports VERIFIED_TM1. The laboratory oracle rejects the signature.",
      mutation: "signature",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({
        rawTransactionHex: flipSignature(signed.rawTransactionHex, 0),
        inputs: signed.inputs
      }),
      expectedIndependent: cryptoReject,
      digestChanges: false,
      signatureStillValidAt: null,
      change: "B_TRUSTED_CHRONIK_UNPROVEN",
      afterStatus: "VERIFIED_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(author0, {
      id: "coex-negative-prevout-outpoint",
      description: "The signed outpoint txid is altered after signing. ScriptSig and the POST stay structurally valid. The laboratory digest no longer matches.",
      mutation: "outpoint",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => {
        const rawTransactionHex = flipOutpoint(signed.rawTransactionHex, 0);
        return {
          rawTransactionHex,
          inputs: copyInputs(signed.inputs, {
            index: 0,
            patch: { prevOut: observedOutpoint(rawTransactionHex, 0) }
          })
        };
      },
      expectedIndependent: cryptoReject,
      digestChanges: true,
      signatureStillValidAt: null,
      change: "B_TRUSTED_CHRONIK_UNPROVEN",
      afterStatus: "VERIFIED_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(author0, {
      id: "coex-negative-prevout-amount",
      description: "The raw signature is untouched. The recorded prevout amount is one satoshi above the signed amount, so the BIP143 preimage changes.",
      mutation: "prevout-amount",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({
        rawTransactionHex: signed.rawTransactionHex,
        inputs: copyInputs(signed.inputs, { index: 0, patch: { prevoutSats: "10001" } })
      }),
      expectedIndependent: cryptoReject,
      digestChanges: true,
      signatureStillValidAt: null,
      change: "B_TRUSTED_CHRONIK_UNPROVEN",
      afterStatus: "VERIFIED_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(author0, {
      id: "coex-negative-prevout-script",
      description: "The designated prevout script is replaced with another synthetic P2PKH. HASH160 no longer matches. Removing the false TMM candidate does not repair authorship.",
      mutation: "prevout-script",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({
        rawTransactionHex: signed.rawTransactionHex,
        inputs: copyInputs(signed.inputs, {
          index: 0,
          patch: { outputScriptHex: testOutputScript("authorB").toHex(), scriptType: "p2pkh" }
        })
      }),
      expectedIndependent: {
        valid: false,
        stage: "pubkey-hash-match",
        errorCode: "INVALID_AUTHOR_SIGNATURE"
      },
      digestChanges: true,
      signatureStillValidAt: null,
      change: "AUTHORIZED_B",
      afterStatus: "INVALID_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(author1, {
      id: "coex-negative-author-index",
      description: "After a valid author-1 signature, the POST author byte is rewritten to input 0. SIGHASH_ALL committed the original output. Production checks input 0 structurally and does not check the digest.",
      mutation: "author-index",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({
        rawTransactionHex: replaceOutputScript(
          signed.rawTransactionHex,
          1,
          scriptWithAuthor(postScriptHex(signed.rawTransactionHex, 1), 0)
        ),
        inputs: signed.inputs
      }),
      expectedIndependent: cryptoReject,
      digestChanges: true,
      signatureStillValidAt: null,
      change: "B_TRUSTED_CHRONIK_UNPROVEN",
      afterStatus: "VERIFIED_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(outOfRangeBase, {
      id: "coex-negative-author-index-out-of-range",
      description: "The POST names author input 5 and the transaction has one input. Input 0 carries a real Schnorr signature. That signature is not the TM1 author.",
      mutation: "author-index-out-of-range",
      authorInputIndex: 5,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({ rawTransactionHex: cloneHex(signed.rawTransactionHex), inputs: signed.inputs }),
      expectedIndependent: {
        valid: false,
        stage: "author-index",
        errorCode: "AUTHOR_INPUT_OUT_OF_RANGE"
      },
      digestChanges: false,
      signatureStillValidAt: { index: 0, algorithm: "schnorr" },
      change: "AUTHORIZED_B",
      afterStatus: "INVALID_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(author0, {
      id: "coex-negative-committed-output",
      description: "The change output value is reduced after a 0x41 signature. SIGHASH_ALL committed every output, including that change.",
      mutation: "committed-output",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({
        rawTransactionHex: setChangeSats(signed.rawTransactionHex, 2, 8999n),
        inputs: signed.inputs
      }),
      expectedIndependent: cryptoReject,
      digestChanges: true,
      signatureStillValidAt: null,
      change: "B_TRUSTED_CHRONIK_UNPROVEN",
      afterStatus: "VERIFIED_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(author0, {
      id: "coex-negative-committed-empp",
      description: "One byte inside the signed eMPP/TMM output is flipped. The container remains a structural TMM. The POST signature no longer covers the output.",
      mutation: "committed-empp",
      authorInputIndex: 0,
      postOutputIndexes: [1],
      preimageInputIndex: 0,
      edit: (signed) => ({
        rawTransactionHex: flipLastOutputByte(signed.rawTransactionHex, 0),
        inputs: signed.inputs
      }),
      expectedIndependent: cryptoReject,
      digestChanges: true,
      signatureStillValidAt: null,
      change: "B_TRUSTED_CHRONIK_UNPROVEN",
      afterStatus: "VERIFIED_TM1",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(controlTm0, {
      id: "coex-control-tm0-and-tm1",
      polarity: "control",
      description: "A valid Schnorr POST coexists with a real TM0 and a structural TMM. Dropping the TMM leaves the real TM0 and the real TM1. The signature does not cancel MULTIPLE_MEMOS.",
      mutation: "none",
      authorInputIndex: 0,
      postOutputIndexes: [2],
      preimageInputIndex: 0,
      edit: (signed) => ({ rawTransactionHex: cloneHex(signed.rawTransactionHex), inputs: signed.inputs }),
      expectedIndependent: { valid: true, stage: "cryptographic-signature", errorCode: null },
      digestChanges: false,
      signatureStillValidAt: null,
      change: "AUTHORIZED_A",
      afterStatus: "MULTIPLE_MEMOS",
      authorship: "NOT_DEMONSTRATED"
    }),
    negativeFrom(controlTwo, {
      id: "coex-control-two-tm1",
      polarity: "control",
      description: "A valid Schnorr signature on author input 0 does not choose between two TM1 candidates. Dropping the structural TMM leaves both POSTs.",
      mutation: "none",
      authorInputIndex: 0,
      postOutputIndexes: [1, 2],
      preimageInputIndex: 0,
      edit: (signed) => ({ rawTransactionHex: cloneHex(signed.rawTransactionHex), inputs: signed.inputs }),
      expectedIndependent: { valid: true, stage: "cryptographic-signature", errorCode: null },
      digestChanges: false,
      signatureStillValidAt: null,
      change: "AUTHORIZED_A",
      afterStatus: "MULTIPLE_MEMOS",
      authorship: "NOT_DEMONSTRATED"
    })
  ];

  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    fail("Coexistence fixture ids are not unique.");
  }
  return {
    schema: "tonalli-memo.rfc0001.sec17-coexistence.s0",
    purpose: "Laboratory proof that a signed TM1 Core v1.0 POST keeps or loses cryptographic authorship beside an ALP/eMPP TMM container. Synthetic keys only. Not a Chronik confirmation, not a social event, and not a settled tip.",
    source: "synthetic-fixture",
    chronikValidated: false,
    networkValidity: "NOT_DEMONSTRATED",
    tipSettlement: "NOT_DEMONSTRATED",
    socialEventCredited: false,
    rfc0001: "PROPOSED — NOT RATIFIED",
    sec17: "design approved, production mitigation pending",
    s0: "OPEN",
    s1: "NOT AUTHORIZED",
    emppScriptHex: empp.scriptHex,
    emppScriptSource: "tests/fixtures/rfc0001-empp-tmm.json#alp-send-plus-one-tmm",
    sighashSerializer: "tests/protocol/canonical-tm1-independent-verify.mjs",
    signer: "tests/protocol/generate-canonical-tm1-fixtures.mjs",
    cases
  };
}

function assertNoSigningSecrets(text) {
  const corpus = JSON.parse(readFileSync(emppCorpusPath, "utf8"));
  // The published TMM target is the same 32 bytes as the synthetic authorA
  // scalar. Strip that public sample, then reject every test private key.
  const withoutPublishedTarget = text.split(corpus.declaredTargetTxid).join("");
  assertFixtureHasNoPrivateKeys(withoutPublishedTarget);
  if (text.includes("\"privateKey\"") || text.includes("privateKeyHex")) {
    fail("Refusing a fixture that names a private key.");
  }
}

const document = buildFixtures();
const serialized = `${JSON.stringify(document, null, 2)}\n`;
assertNoSigningSecrets(serialized);
if (document.cases.length !== 14) {
  fail(`Expected 14 coexistence cases, built ${document.cases.length}.`);
}

if (checkMode) {
  const current = await readFile(fixturePath, "utf8");
  if (current !== serialized) {
    fail("rfc0001-sec17-coexistence.json is not canonical. Regenerate it with the isolated generator.");
  }
} else {
  await writeFile(fixturePath, serialized, "utf8");
}
