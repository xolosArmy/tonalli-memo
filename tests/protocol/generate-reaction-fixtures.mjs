import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  classifyAuthor,
  digestHex,
  inputUnlockMatchesPrevout,
  parseTx,
  signatureMatches,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import {
  agree,
  assertFixtureHasNoPrivateKeys,
  canonicalTm1Script,
  inputSpec,
  signedFixture,
  testOutputScript
} from "./generate-canonical-tm1-fixtures.mjs";
import {
  EVENT_REACTION,
  EVENT_REACTION_REMOVE,
  KIND_LIKE,
  SOCIAL_VERSION,
  bytesToHex,
  decodeReactionScript,
  encodeNonminimalReactionScript,
  encodeReactionScript,
  encodersAgree
} from "./reaction-envelope-independent.mjs";
import {
  LAB_REACTION_NETWORK,
  classifyReactionTarget,
  designatedAuthorHash160
} from "./reaction-replay-independent.mjs";

/**
 * Synthetic REACTION and REACTION_REMOVE corpus.
 * Signs with the existing P2PKH fixture tools, then checks the independent
 * envelope decoder and the independent BIP143/ForkID oracle.
 * Prevouts are declared laboratory metadata, not mainnet history.
 * No node, no funds, and no production package is modified.
 */

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json")
);
const { ALL_ANYONECANPAY_BIP143, ALL_BIP143, Script, Tx } = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-reactions.json");
const checkMode = process.argv.includes("--check");
const NETWORK = LAB_REACTION_NETWORK;
const KNOWN_HASH = {
  authorA: "3d02acb8e612f1c277793a232f20b693e87700e3",
  authorB: "8030268a04488647a9bc64a8f5bf1cc6db27d300",
  observer: "eddbb9fb072abd539d36829cb11211a85e25479e"
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

assert(ecashLibVersion === "4.13.0", `Pinned ecash-lib is ${ecashLibVersion}, expected 4.13.0.`);

function firstOutputScript(rawTransactionHex) {
  const output = parseTx(rawTransactionHex).outputs[0];
  if (output === undefined) {
    fail("Transaction has no output.");
  }
  return output.script;
}

function flipSignature(rawTransactionHex, inputIndex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const current = Buffer.from(tx.inputs[inputIndex].script.toHex(), "hex");
  const length = current[0];
  if (length === undefined || length < 2 || length > 0x4b) {
    fail("Cannot flip this signature push.");
  }
  current[1] ^= 0x01;
  tx.inputs[inputIndex].script = new Script(Uint8Array.from(current));
  return tx.toHex();
}

function mutateEnvelopeByte(rawTransactionHex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const current = Buffer.from(tx.outputs[0].script.toHex(), "hex");
  assert(current.length === 43 && current[0] === 0x6a && current[6] === 0x24, "Envelope mutation expected a 43-byte reaction.");
  current[41] ^= 0x01;
  tx.outputs[0].script = new Script(Uint8Array.from(current));
  return tx.toHex();
}

function outputsFor(spec, script) {
  const incoming = spec.inputs.reduce((sum, input) => sum + input.sats, 0n);
  if (spec.observerDust === true) {
    const change = incoming - 546n - 1000n;
    assert(change > 0n, `${spec.id} change is not positive.`);
    return [
      { sats: 0n, script },
      { sats: 546n, script: testOutputScript("observer") },
      { sats: change, script: testOutputScript(spec.changeKey) }
    ];
  }
  const change = incoming - 1000n;
  assert(change > 0n, `${spec.id} change is not positive.`);
  return [
    { sats: 0n, script },
    { sats: change, script: testOutputScript(spec.changeKey) }
  ];
}

function authorOf(rawTransactionHex, index, inputs, algorithm) {
  return classifyAuthor({
    rawTransactionHex,
    authorInputIndex: index,
    inputs,
    signatureAlgorithm: algorithm
  });
}

function signReaction(spec) {
  const fields = {
    version: spec.version ?? SOCIAL_VERSION,
    eventType: spec.eventType,
    authorInputIndex: spec.envelopeAuthorIndex,
    targetTxidHex: spec.targetTxidHex,
    reactionKind: spec.reactionKind ?? KIND_LIKE
  };
  assert(encodersAgree(fields), `${spec.id} encoders diverged.`);
  const scriptBytes = spec.nonminimal === true ? encodeNonminimalReactionScript(fields) : encodeReactionScript(fields);
  const signed = signedFixture({
    authorInputIndex: spec.signatureInputIndex,
    sighashType: spec.sighashType,
    algorithm: spec.algorithm,
    inputs: spec.inputs,
    outputs: outputsFor(spec, new Script(scriptBytes))
  });
  let rawTransactionHex = signed.rawTransactionHex;
  if (spec.mutate === "flip-signature") {
    rawTransactionHex = flipSignature(rawTransactionHex, spec.signatureInputIndex);
  } else if (spec.mutate === "envelope-byte") {
    rawTransactionHex = mutateEnvelopeByte(rawTransactionHex);
  } else if (spec.mutate !== undefined) {
    fail(`${spec.id} has an unknown mutation.`);
  }
  agree(rawTransactionHex, signed.inputs, spec.signatureInputIndex, signed.sighashByte, spec.id);
  const finalDigest = digestHex(rawTransactionHex, signed.inputs, spec.signatureInputIndex, signed.sighashByte);
  if (spec.mutate === "flip-signature") {
    assert(finalDigest === signed.signedDigestHex, `${spec.id} scriptSig change moved the digest.`);
  }
  if (spec.mutate === "envelope-byte") {
    assert(finalDigest !== signed.signedDigestHex, `${spec.id} envelope change kept the old digest.`);
  }
  if (spec.mutate === undefined) {
    assert(finalDigest === signed.signedDigestHex, `${spec.id} digest moved without a mutation.`);
  }
  const outputScript = firstOutputScript(rawTransactionHex);
  const decoded = decodeReactionScript(outputScript);
  const authorship = authorOf(rawTransactionHex, spec.envelopeAuthorIndex, signed.inputs, spec.algorithm);
  assert(decoded.ok === spec.structuralOk, `${spec.id} structural ok was ${decoded.ok}.`);
  assert(decoded.errorCode === spec.structuralError, `${spec.id} structural ${decoded.errorCode}.`);
  const authorshipLabel = authorship.valid ? "LAB_VALID" : "LAB_INVALID";
  assert(authorshipLabel === spec.authorship, `${spec.id} authorship ${authorship.stage}/${authorship.errorCode}.`);
  assert(authorship.errorCode === spec.authorErrorCode, `${spec.id} author code ${authorship.errorCode}.`);
  const authorHash160 = designatedAuthorHash160(rawTransactionHex, spec.envelopeAuthorIndex);
  if (spec.expectAuthor === null) {
    assert(authorHash160 === null, `${spec.id} unexpectedly resolved an author hash.`);
  } else {
    assert(authorHash160 === KNOWN_HASH[spec.expectAuthor], `${spec.id} author hash ${authorHash160}.`);
  }
  const signatureOk = signatureMatches(
    rawTransactionHex,
    signed.inputs,
    spec.signatureInputIndex,
    spec.algorithm
  );
  assert(signatureOk === spec.signatureOk, `${spec.id} signature match was ${signatureOk}.`);
  if (spec.signatureOk === true) {
    assert(
      inputUnlockMatchesPrevout(rawTransactionHex, signed.inputs, spec.signatureInputIndex, spec.algorithm),
      `${spec.id} prevout did not match the signed input.`
    );
  }
  if (decoded.framed === true) {
    assert(outputScript.length === 43, `${spec.id} framed script is ${outputScript.length} bytes.`);
    assert(decoded.pushCount === 2, `${spec.id} did not have two pushes.`);
  }
  if (spec.nonminimal === true) {
    assert(outputScript.length === 44, `${spec.id} nonminimal script is ${outputScript.length} bytes.`);
  }
  if (spec.structuralOk === true) {
    assert(decoded.eventName === spec.action, `${spec.id} event name ${decoded.eventName}.`);
    if (spec.mutate === "envelope-byte") {
      assert(decoded.targetTxid !== spec.targetTxidHex, `${spec.id} did not change the target.`);
    } else {
      assert(decoded.targetTxid === spec.targetTxidHex, `${spec.id} target bytes did not round-trip.`);
    }
  }
  return {
    id: spec.id,
    group: spec.group,
    kind: "reaction",
    action: spec.action,
    confirmation: spec.confirmation,
    blockHeight: spec.blockHeight,
    position: spec.position,
    network: NETWORK,
    signatureAlgorithm: spec.algorithm,
    signatureInputIndex: spec.signatureInputIndex,
    envelopeAuthorIndex: spec.envelopeAuthorIndex,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    inputs: signed.inputs,
    authorHash160,
    sighashByte: signed.sighashByte,
    outputScriptHex: bytesToHex(outputScript),
    scriptLength: outputScript.length,
    structuralOk: decoded.ok,
    structuralError: decoded.errorCode,
    framed: decoded.framed,
    authorship: authorshipLabel,
    authorErrorCode: authorship.errorCode,
    targetTxid: decoded.framed ? decoded.targetTxid : null,
    digestHex: finalDigest,
    preMutationDigestHex: signed.signedDigestHex
  };
}

function signTarget(spec) {
  const signed = signedFixture({
    authorInputIndex: 0,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: spec.inputs,
    outputs: spec.outputs
  });
  let rawTransactionHex = signed.rawTransactionHex;
  if (spec.mutate === "flip-signature") {
    rawTransactionHex = flipSignature(rawTransactionHex, 0);
  }
  agree(rawTransactionHex, signed.inputs, 0, signed.sighashByte, spec.id);
  const authorship = authorOf(rawTransactionHex, 0, signed.inputs, "schnorr");
  const authorshipLabel = authorship.valid ? "LAB_VALID" : "LAB_INVALID";
  assert(authorshipLabel === spec.authorship, `${spec.id} target authorship ${authorship.errorCode}.`);
  const outputScript = firstOutputScript(rawTransactionHex);
  return {
    id: spec.id,
    group: "target",
    kind: spec.kind,
    action: spec.action,
    confirmation: null,
    blockHeight: null,
    position: null,
    network: NETWORK,
    signatureAlgorithm: "schnorr",
    signatureInputIndex: 0,
    envelopeAuthorIndex: spec.kind === "core-v1-post" ? 0 : null,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    inputs: signed.inputs,
    authorHash160: designatedAuthorHash160(rawTransactionHex, 0),
    sighashByte: signed.sighashByte,
    outputScriptHex: bytesToHex(outputScript),
    scriptLength: outputScript.length,
    structuralOk: null,
    structuralError: null,
    framed: false,
    authorship: authorshipLabel,
    authorErrorCode: authorship.errorCode,
    targetTxid: null,
    eventDataUtf8: spec.eventDataUtf8 ?? null,
    digestHex: digestHex(rawTransactionHex, signed.inputs, 0, signed.sighashByte),
    preMutationDigestHex: signed.signedDigestHex
  };
}

function standardInputs(keyName, label) {
  return [inputSpec({ keyName, sats: 10000n, label })];
}

function buildFixtures() {
  const eligible = signTarget({
    id: "eligible-post",
    kind: "core-v1-post",
    action: "POST",
    authorship: "LAB_VALID",
    eventDataUtf8: "reaction target post",
    inputs: standardInputs("authorA", "reaction-post"),
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "reaction target post") },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });
  const payment = signTarget({
    id: "ineligible-payment",
    kind: "payment",
    action: "PAYMENT",
    authorship: "LAB_VALID",
    inputs: standardInputs("authorA", "reaction-payment"),
    outputs: [{ sats: 9000n, script: testOutputScript("authorB") }]
  });
  const pending = signTarget({
    id: "pending-post",
    kind: "core-v1-post",
    action: "POST",
    authorship: "LAB_INVALID",
    mutate: "flip-signature",
    eventDataUtf8: "reaction pending target",
    inputs: standardInputs("authorA", "reaction-pending"),
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "reaction pending target") },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });
  const absentTargetTxid = createHash("sha256").update("rfc0001-reaction-absent-target-v1").digest("hex");
  const registry = new Map(
    [eligible, payment, pending].map((target) => [target.txid, { kind: target.kind, authorship: target.authorship }])
  );
  assert(!registry.has(absentTargetTxid), "Absent target collided with a synthetic transaction.");

  function reaction(spec) {
    const row = signReaction(spec);
    const link = row.framed ? classifyReactionTarget(registry.get(row.targetTxid)) : "NOT_FRAMED";
    assert(link === spec.targetLink, `${spec.id} target link ${link}, expected ${spec.targetLink}.`);
    return { ...row, targetLink: link };
  }

  const like = (extra) =>
    reaction({
      action: "REACTION",
      eventType: EVENT_REACTION,
      version: SOCIAL_VERSION,
      reactionKind: KIND_LIKE,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: extra.expectAuthor ?? "authorA",
      confirmation: "CONFIRMED",
      structuralOk: true,
      structuralError: null,
      authorship: "LAB_VALID",
      authorErrorCode: null,
      signatureOk: true,
      targetTxidHex: eligible.txid,
      targetLink: "ELIGIBLE",
      ...extra
    });

  const reactions = [
    like({
      id: "seq-observer-remove-cold",
      group: "sequence",
      action: "REACTION_REMOVE",
      eventType: EVENT_REACTION_REMOVE,
      expectAuthor: "observer",
      changeKey: "observer",
      inputs: standardInputs("observer", "reaction-obs-remove"),
      blockHeight: 210,
      position: 0
    }),
    like({
      id: "seq-a-like",
      group: "sequence",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-like"),
      blockHeight: 211,
      position: 0
    }),
    like({
      id: "seq-a-like-dup",
      group: "sequence",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-like-dup"),
      blockHeight: 211,
      position: 1
    }),
    like({
      id: "seq-a-remove",
      group: "sequence",
      action: "REACTION_REMOVE",
      eventType: EVENT_REACTION_REMOVE,
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-remove"),
      blockHeight: 212,
      position: 0
    }),
    like({
      id: "seq-a-remove-repeat",
      group: "sequence",
      action: "REACTION_REMOVE",
      eventType: EVENT_REACTION_REMOVE,
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-remove-repeat"),
      blockHeight: 212,
      position: 1
    }),
    like({
      id: "seq-a-like-again",
      group: "sequence",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-like-again"),
      blockHeight: 213,
      position: 0
    }),
    like({
      id: "seq-b-like",
      group: "sequence",
      expectAuthor: "authorB",
      changeKey: "authorB",
      inputs: standardInputs("authorB", "reaction-b-like"),
      blockHeight: 214,
      position: 0
    }),
    like({
      id: "seq-b-remove",
      group: "sequence",
      action: "REACTION_REMOVE",
      eventType: EVENT_REACTION_REMOVE,
      expectAuthor: "authorB",
      changeKey: "authorB",
      inputs: standardInputs("authorB", "reaction-b-remove"),
      blockHeight: 214,
      position: 1
    }),
    like({
      id: "seq-a-like-pending",
      group: "sequence",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-pending"),
      targetTxidHex: pending.txid,
      targetLink: "PENDING_TARGET",
      blockHeight: 215,
      position: 0
    }),
    like({
      id: "seq-a-like-ineligible",
      group: "sequence",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-ineligible"),
      targetTxidHex: payment.txid,
      targetLink: "INELIGIBLE",
      blockHeight: 215,
      position: 1
    }),
    like({
      id: "seq-a-like-absent",
      group: "sequence",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-a-absent"),
      targetTxidHex: absentTargetTxid,
      targetLink: "ABSENT",
      blockHeight: 215,
      position: 2
    }),
    like({
      id: "auth-schnorr-index1-41",
      group: "authorship",
      expectAuthor: "authorA",
      signatureInputIndex: 1,
      envelopeAuthorIndex: 1,
      inputs: [
        inputSpec({ keyName: "observer", sats: 8000n, label: "reaction-i1-fee" }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "reaction-i1-author" })
      ],
      blockHeight: 216,
      position: 0
    }),
    like({
      id: "auth-schnorr-index0-c1",
      group: "authorship",
      expectAuthor: "authorA",
      sighashType: ALL_ANYONECANPAY_BIP143,
      observerDust: true,
      inputs: [
        inputSpec({ keyName: "authorA", sats: 10000n, label: "reaction-c1-author" }),
        inputSpec({ keyName: "observer", sats: 7000n, label: "reaction-c1-fee" })
      ],
      blockHeight: 216,
      position: 1
    }),
    like({
      id: "auth-schnorr-index2-c1",
      group: "authorship",
      expectAuthor: "authorA",
      signatureInputIndex: 2,
      envelopeAuthorIndex: 2,
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [
        inputSpec({ keyName: "observer", sats: 5000n, label: "reaction-i2-fee" }),
        inputSpec({ keyName: "authorB", sats: 5000n, label: "reaction-i2-b" }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "reaction-i2-author" })
      ],
      blockHeight: 216,
      position: 2
    }),
    like({
      id: "auth-ecdsa-index0-41",
      group: "authorship",
      expectAuthor: "authorA",
      algorithm: "ecdsa",
      inputs: standardInputs("authorA", "reaction-ecdsa"),
      blockHeight: 216,
      position: 3
    }),
    like({
      id: "mempool-b-like",
      group: "mempool",
      expectAuthor: "authorB",
      changeKey: "authorB",
      inputs: standardInputs("authorB", "reaction-mempool-b"),
      confirmation: "MEMPOOL",
      blockHeight: null,
      position: null
    }),
    like({
      id: "mempool-a-remove",
      group: "mempool",
      action: "REACTION_REMOVE",
      eventType: EVENT_REACTION_REMOVE,
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-mempool-a"),
      confirmation: "MEMPOOL",
      blockHeight: null,
      position: null
    })
  ];

  const negatives = [
    reaction({
      id: "neg-signature-flipped",
      group: "negative",
      action: "REACTION",
      eventType: EVENT_REACTION,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: "authorA",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-neg-sig"),
      targetTxidHex: eligible.txid,
      targetLink: "ELIGIBLE",
      mutate: "flip-signature",
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 0,
      structuralOk: true,
      structuralError: null,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      signatureOk: false
    }),
    reaction({
      id: "neg-envelope-mutated",
      group: "negative",
      action: "REACTION",
      eventType: EVENT_REACTION,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: "authorA",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-neg-env"),
      targetTxidHex: eligible.txid,
      targetLink: "ABSENT",
      mutate: "envelope-byte",
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 1,
      structuralOk: true,
      structuralError: null,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      signatureOk: false
    }),
    reaction({
      id: "neg-author-index-5",
      group: "negative",
      action: "REACTION",
      eventType: EVENT_REACTION,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 5,
      changeKey: "authorA",
      expectAuthor: null,
      inputs: standardInputs("authorA", "reaction-neg-idx"),
      targetTxidHex: eligible.txid,
      targetLink: "ELIGIBLE",
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 2,
      structuralOk: true,
      structuralError: null,
      authorship: "LAB_INVALID",
      authorErrorCode: "AUTHOR_INPUT_OUT_OF_RANGE",
      signatureOk: true
    }),
    reaction({
      id: "neg-version-09",
      group: "negative",
      action: "REACTION",
      eventType: EVENT_REACTION,
      version: 0x09,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: "authorA",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-neg-ver"),
      targetTxidHex: eligible.txid,
      targetLink: "ELIGIBLE",
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 3,
      structuralOk: false,
      structuralError: "UNSUPPORTED_VERSION",
      authorship: "LAB_VALID",
      authorErrorCode: null,
      signatureOk: true
    }),
    reaction({
      id: "neg-kind-7f",
      group: "negative",
      action: "REACTION",
      eventType: EVENT_REACTION,
      reactionKind: 0x7f,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: "authorA",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-neg-kind"),
      targetTxidHex: eligible.txid,
      targetLink: "ELIGIBLE",
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 4,
      structuralOk: false,
      structuralError: "UNSUPPORTED_REACTION_KIND",
      authorship: "LAB_VALID",
      authorErrorCode: null,
      signatureOk: true
    }),
    reaction({
      id: "neg-event-7e",
      group: "negative",
      action: "NONE",
      eventType: 0x7e,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: "authorA",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-neg-event"),
      targetTxidHex: eligible.txid,
      targetLink: "ELIGIBLE",
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 5,
      structuralOk: false,
      structuralError: "UNSUPPORTED_EVENT",
      authorship: "LAB_VALID",
      authorErrorCode: null,
      signatureOk: true
    }),
    reaction({
      id: "neg-nonminimal",
      group: "negative",
      action: "REACTION",
      eventType: EVENT_REACTION,
      algorithm: "schnorr",
      sighashType: ALL_BIP143,
      signatureInputIndex: 0,
      envelopeAuthorIndex: 0,
      changeKey: "authorA",
      expectAuthor: "authorA",
      inputs: standardInputs("authorA", "reaction-neg-push"),
      targetTxidHex: eligible.txid,
      targetLink: "NOT_FRAMED",
      nonminimal: true,
      confirmation: "CONFIRMED",
      blockHeight: 300,
      position: 6,
      structuralOk: false,
      structuralError: "INVALID_FORMAT",
      authorship: "LAB_VALID",
      authorErrorCode: null,
      signatureOk: true
    })
  ];

  const sampleFields = {
    version: SOCIAL_VERSION,
    eventType: EVENT_REACTION,
    authorInputIndex: 0,
    targetTxidHex: eligible.txid,
    reactionKind: KIND_LIKE
  };
  const structures = [
    {
      id: "structure-truncated-envelope",
      scriptHex: bytesToHex(encodeReactionScript(sampleFields).slice(0, 42)),
      errorCode: "INVALID_FORMAT"
    },
    {
      id: "structure-lokad-only",
      scriptHex: bytesToHex(encodeReactionScript(sampleFields).slice(0, 6)),
      errorCode: "INVALID_FORMAT"
    }
  ];
  for (const structure of structures) {
    const decoded = decodeReactionScript(Buffer.from(structure.scriptHex, "hex"));
    assert(decoded.ok === false && decoded.errorCode === structure.errorCode, `${structure.id} was accepted.`);
    structure.scriptLength = structure.scriptHex.length / 2;
  }

  const rows = [...reactions, ...negatives];
  const txids = new Set([eligible.txid, payment.txid, pending.txid]);
  for (const row of rows) {
    assert(!txids.has(row.txid), `${row.id} reused a txid.`);
    txids.add(row.txid);
    if (row.signatureInputIndex !== 0 && row.authorship === "LAB_VALID" && row.structuralOk === true) {
      const feeHash = designatedAuthorHash160(row.rawTransactionHex, 0);
      assert(feeHash !== row.authorHash160, `${row.id} treated the fee input as the author.`);
    }
    if (row.id === "auth-schnorr-index0-c1") {
      assert(row.sighashByte === 0xc1, "Anyone-can-pay fixture lost sighash 0xc1.");
    }
    if (row.id === "auth-schnorr-index1-41" || row.id === "auth-ecdsa-index0-41" || row.id === "seq-a-like") {
      assert(row.sighashByte === 0x41, `${row.id} lost sighash 0x41.`);
    }
    if (row.id === "auth-schnorr-index2-c1") {
      assert(row.sighashByte === 0xc1 && row.envelopeAuthorIndex === 2, "Index 2 anyone-can-pay fixture is wrong.");
    }
  }
  assert(reactions.find((row) => row.id === "seq-a-like").txid !== reactions.find((row) => row.id === "seq-a-like-dup").txid, "Duplicate like reused a txid.");

  const ids = (group) => rows.filter((row) => row.group === group).map((row) => row.id);
  return {
    schema: "tonalli-memo.rfc0001.reactions.s0",
    network: NETWORK,
    purpose:
      "Laboratory REACTION and REACTION_REMOVE bytes. Synthetic signatures and a derived like count. Not a network reorg, not finality, and not a productive indexer.",
    status: {
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
    },
    generator: {
      library: "ecash-lib",
      version: "4.13.0",
      envelope: "tests/protocol/reaction-envelope-independent.mjs",
      replay: "tests/protocol/reaction-replay-independent.mjs",
      sighashSerializer: "tests/protocol/canonical-tm1-independent-verify.mjs"
    },
    absentTargetTxid,
    targets: [eligible, payment, pending],
    reactions,
    negatives,
    structures,
    replay: {
      sequence: ids("sequence"),
      ancestor: ["seq-observer-remove-cold", "seq-a-like"],
      branchA: ["seq-a-like-dup", "seq-b-like"],
      branchB: ["seq-a-remove", "seq-a-remove-repeat", "seq-a-like-again", "seq-b-like", "seq-b-remove"],
      authorship: ids("authorship"),
      mempool: ids("mempool")
    }
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
  const text = `${JSON.stringify(fixtures, null, 2)}\n`;
  assertFixtureHasNoPrivateKeys(text);
  assert(!text.includes("SETTLED") && !text.includes("VERIFIED"), "Reaction fixture used a forbidden fulfillment word.");
  if (checkMode) {
    const current = await readFile(fixturePath, "utf8");
    if (current !== text) {
      fail("rfc0001-reactions.json is not canonical. Regenerate it with the isolated generator.");
    }
  } else {
    await writeFile(fixturePath, text, "utf8");
  }
}
