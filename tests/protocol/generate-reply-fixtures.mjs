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
  hash160,
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
  EVENT_REPLY,
  SOCIAL_VERSION,
  bytesFromHex,
  bytesToHex,
  decodeReplyScript,
  encodeNonminimalReplyScript,
  encodeReplyScript,
  encodersAgree,
  illustrativeReplyScriptHex
} from "./reply-envelope-independent.mjs";
import {
  LAB_REPLY_NETWORK,
  coreV1PostAuthorIndex,
  designatedAuthorHash160,
  verifyReply
} from "./reply-thread-independent.mjs";

/**
 * Synthetic social v2 REPLY corpus.
 * Signs with the existing P2PKH fixture tools, then checks the independent
 * envelope decoder, the independent BIP143/ForkID oracle, parent eligibility,
 * and deterministic thread replay.
 * Prevouts are declared laboratory metadata, not mainnet history.
 * No node, no funds, and no production package is modified.
 * LAB_VALID authorship and PARENT_VERIFIED link are not network settlements.
 */

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json")
);
const { ALL_ANYONECANPAY_BIP143, ALL_BIP143, Script, Tx } = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-reply.json");
const checkMode = process.argv.includes("--check");
const NETWORK = LAB_REPLY_NETWORK;
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
assert(illustrativeReplyScriptHex().length === 92, "Illustrative reply is not 46 bytes.");

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
  assert(current.length >= 43 && current[0] === 0x6a, "Envelope mutation expected a reply script.");
  current[current.length - 1] ^= 0x01;
  tx.outputs[0].script = new Script(Uint8Array.from(current));
  return tx.toHex();
}

function mutateChangeScript(rawTransactionHex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const current = Buffer.from(tx.outputs[1].script.toHex(), "hex");
  assert(current.length === 25 && current[0] === 0x76, "Output mutation expected a P2PKH change.");
  current[4] ^= 0x01;
  tx.outputs[1].script = new Script(Uint8Array.from(current));
  return tx.toHex();
}

function replyOutputs(spec, script) {
  const incoming = spec.inputs.reduce((sum, input) => sum + input.sats, 0n);
  const fee = spec.fee ?? 1000n;
  const change = incoming - fee;
  assert(change > 0n, `${spec.id} change is not positive.`);
  return [
    { sats: 0n, script },
    { sats: change, script: testOutputScript(spec.changeKey ?? "authorA") }
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

function applyPrevoutPatch(inputs, patch) {
  if (patch.kind === "truncate") {
    return inputs.slice(0, patch.count);
  }
  return inputs.map((input, index) => {
    if (index !== patch.index) {
      return input;
    }
    if (patch.kind === "missing") {
      return { ...input, outputScriptHex: null };
    }
    if (patch.kind === "amount") {
      return { ...input, prevoutSats: "1" };
    }
    if (patch.kind === "script") {
      return { ...input, outputScriptHex: testOutputScript("observer").toHex(), scriptType: "p2pkh" };
    }
    if (patch.kind === "p2sh") {
      const p2sh = Script.p2sh(hash160(Uint8Array.from([1, 2, 3, 4])));
      return { ...input, outputScriptHex: p2sh.toHex(), scriptType: "p2sh" };
    }
    fail(`Unknown prevout patch ${patch.kind}.`);
  });
}

function signTarget(spec) {
  const signed = signedFixture({
    authorInputIndex: spec.authorInputIndex,
    sighashType: ALL_BIP143,
    algorithm: "schnorr",
    inputs: spec.inputs,
    outputs: spec.outputs
  });
  let rawTransactionHex = signed.rawTransactionHex;
  if (spec.mutate === "flip-signature") {
    rawTransactionHex = flipSignature(rawTransactionHex, spec.authorInputIndex);
  }
  agree(rawTransactionHex, signed.inputs, spec.authorInputIndex, signed.sighashByte, spec.id);
  const authorship = authorOf(rawTransactionHex, spec.authorInputIndex, signed.inputs, "schnorr");
  const authorshipLabel = authorship.valid ? "LAB_VALID" : "LAB_INVALID";
  assert(authorshipLabel === spec.authorship, `${spec.id} target authorship ${authorship.errorCode}.`);
  const parsedIndex = coreV1PostAuthorIndex(rawTransactionHex);
  if (spec.expectPostAuthorIndex !== undefined) {
    assert(parsedIndex === spec.expectPostAuthorIndex, `${spec.id} POST index ${parsedIndex}, expected ${spec.expectPostAuthorIndex}.`);
  } else if (spec.kind === "core-v1-post") {
    assert(parsedIndex === spec.authorInputIndex, `${spec.id} POST index ${parsedIndex}.`);
  } else {
    assert(parsedIndex === null, `${spec.id} was classified as a Core v1 POST.`);
  }
  return {
    id: spec.id,
    group: "target",
    kind: spec.kind,
    network: spec.network ?? NETWORK,
    signatureAlgorithm: "schnorr",
    authorInputIndex: spec.authorInputIndex,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    inputs: signed.inputs,
    authorHash160: designatedAuthorHash160(rawTransactionHex, spec.authorInputIndex),
    outputScriptHex: bytesToHex(firstOutputScript(rawTransactionHex)),
    authorship: authorshipLabel,
    authorErrorCode: authorship.errorCode,
    eventDataUtf8: spec.eventDataUtf8 ?? null,
    ...(spec.parentLink !== undefined ? { parentLink: spec.parentLink } : {}),
    ...(spec.rootPostTxid !== undefined ? { rootPostTxid: spec.rootPostTxid } : {}),
    ...(spec.depth !== undefined ? { depth: spec.depth } : {})
  };
}

function signReply(spec, catalog) {
  let scriptBytes;
  if (spec.customScriptBytes !== undefined) {
    scriptBytes = spec.customScriptBytes;
  } else {
    const fields = {
      version: spec.version ?? SOCIAL_VERSION,
      eventType: spec.eventType ?? EVENT_REPLY,
      authorInputIndex: spec.envelopeAuthorIndex,
      parentTxidHex: spec.parentTxidHex,
      replyText: spec.replyText
    };
    if (spec.nonminimal !== true && spec.version === undefined && spec.eventType === undefined) {
      assert(encodersAgree(fields), `${spec.id} encoders diverged.`);
    }
    scriptBytes = spec.nonminimal === true ? encodeNonminimalReplyScript(fields) : encodeReplyScript(fields);
  }

  const signed = signedFixture({
    authorInputIndex: spec.signatureInputIndex,
    sighashType: spec.sighashType ?? ALL_BIP143,
    algorithm: spec.algorithm ?? "schnorr",
    inputs: spec.inputs,
    outputs: replyOutputs(spec, new Script(scriptBytes))
  });

  let rawTransactionHex = signed.rawTransactionHex;
  if (spec.mutate === "flip-signature") {
    rawTransactionHex = flipSignature(rawTransactionHex, spec.signatureInputIndex);
  } else if (spec.mutate === "envelope-byte") {
    rawTransactionHex = mutateEnvelopeByte(rawTransactionHex);
  } else if (spec.mutate === "output-script") {
    rawTransactionHex = mutateChangeScript(rawTransactionHex);
  } else if (spec.mutate !== undefined) {
    fail(`${spec.id} has an unknown mutation.`);
  }

  agree(rawTransactionHex, signed.inputs, spec.signatureInputIndex, signed.sighashByte, spec.id);
  const inputs = spec.prevoutPatch === undefined ? signed.inputs : applyPrevoutPatch(signed.inputs, spec.prevoutPatch);
  const preMutationDigestHex = signed.signedDigestHex;
  const digestAvailable = inputs[spec.signatureInputIndex]?.outputScriptHex != null;
  const finalDigest = digestAvailable
    ? digestHex(rawTransactionHex, inputs, spec.signatureInputIndex, signed.sighashByte)
    : null;

  if (spec.mutate === "flip-signature") {
    assert(finalDigest === preMutationDigestHex, `${spec.id} scriptSig change moved the digest.`);
  }
  if (spec.mutate === "envelope-byte" || spec.mutate === "output-script") {
    assert(finalDigest !== preMutationDigestHex, `${spec.id} committed-output change kept the old digest.`);
  }
  if (
    (spec.prevoutPatch?.kind === "amount" || spec.prevoutPatch?.kind === "script") &&
    spec.prevoutPatch.index === spec.signatureInputIndex
  ) {
    assert(finalDigest !== preMutationDigestHex, `${spec.id} prevout change kept the old digest.`);
  }

  const outputScript = firstOutputScript(rawTransactionHex);
  const decoded = decodeReplyScript(outputScript);
  assert(decoded.ok === spec.structuralOk, `${spec.id} structural ok was ${decoded.ok}.`);
  assert(decoded.errorCode === spec.structuralError, `${spec.id} structural ${decoded.errorCode}.`);

  const signatureOk = digestAvailable
    ? signatureMatches(rawTransactionHex, inputs, spec.signatureInputIndex, spec.algorithm ?? "schnorr")
    : null;
  assert(signatureOk === spec.signatureOk, `${spec.id} signature match was ${signatureOk}.`);

  if (spec.signatureOk === true && spec.prevoutPatch === undefined) {
    assert(
      inputUnlockMatchesPrevout(rawTransactionHex, inputs, spec.signatureInputIndex, spec.algorithm ?? "schnorr"),
      `${spec.id} prevout did not match the signed input.`
    );
  }

  const parentRecord = decoded.parentTxid ? catalog.get(decoded.parentTxid) : undefined;
  const verified = verifyReply({
    rawTransactionHex,
    inputs,
    network: spec.network ?? NETWORK,
    signatureAlgorithm: spec.algorithm ?? "schnorr",
    parentRecord
  });

  assert(verified.authorship === spec.authorship, `${spec.id} authorship ${verified.authorship}, expected ${spec.authorship}.`);
  assert(verified.authorErrorCode === spec.authorErrorCode, `${spec.id} author error code ${verified.authorErrorCode}.`);
  assert(verified.parentLink === spec.parentLink, `${spec.id} parentLink ${verified.parentLink} (detail: ${verified.parentLinkDetail}), expected ${spec.parentLink}.`);
  assert(verified.parentLinkDetail === spec.parentLinkDetail, `${spec.id} parentLinkDetail ${verified.parentLinkDetail}.`);
  assert(verified.eligibleForThread === spec.eligibleForThread, `${spec.id} eligibleForThread ${verified.eligibleForThread}.`);

  if (spec.expectAuthor === null) {
    assert(verified.authorHash160 === null, `${spec.id} unexpectedly resolved author hash.`);
  } else if (spec.expectAuthor !== undefined) {
    assert(verified.authorHash160 === KNOWN_HASH[spec.expectAuthor], `${spec.id} author hash ${verified.authorHash160}.`);
  }

  return {
    id: spec.id,
    group: spec.group,
    kind: spec.kind ?? "reply",
    network: spec.network ?? NETWORK,
    signatureAlgorithm: spec.algorithm ?? "schnorr",
    signatureInputIndex: spec.signatureInputIndex,
    envelopeAuthorIndex: spec.envelopeAuthorIndex,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    inputs,
    sighashByte: signed.sighashByte,
    outputScriptHex: bytesToHex(outputScript),
    scriptLength: outputScript.length,
    digestHex: finalDigest,
    preMutationDigestHex,
    signatureOk,
    ...verified
  };
}

function buildFixtures() {
  const rootPost0 = signTarget({
    id: "root-post-index0",
    kind: "core-v1-post",
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    eventDataUtf8: "root post from author A at index 0",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-root-a" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "root post from author A at index 0") },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });

  const rootPost1 = signTarget({
    id: "root-post-index1",
    kind: "core-v1-post",
    authorship: "LAB_VALID",
    authorInputIndex: 1,
    eventDataUtf8: "root post from author B at index 1",
    inputs: [
      inputSpec({ keyName: "observer", sats: 8000n, label: "reply-root-b-fee", outIdx: 0 }),
      inputSpec({ keyName: "authorB", sats: 10000n, label: "reply-root-b-author", outIdx: 1 })
    ],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(1, "root post from author B at index 1") },
      { sats: 17000n, script: testOutputScript("authorB") }
    ]
  });

  const pendingPost = signTarget({
    id: "pending-post-target",
    kind: "core-v1-post",
    authorship: "LAB_INVALID",
    mutate: "flip-signature",
    authorInputIndex: 0,
    eventDataUtf8: "pending post with flipped signature",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-pending" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "pending post with flipped signature") },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });

  const ineligiblePayment = signTarget({
    id: "ineligible-payment-target",
    kind: "payment",
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-payment" })],
    outputs: [{ sats: 9000n, script: testOutputScript("authorB") }]
  });

  const otherNetPost = signTarget({
    id: "other-net-post-target",
    kind: "core-v1-post",
    network: "lab-other-net",
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    eventDataUtf8: "post on different network",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-other-net" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "post on different network") },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });

  const duplicateCandidatePost = signTarget({
    id: "duplicate-candidate-post-target",
    kind: "core-v1-post",
    expectPostAuthorIndex: null,
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    eventDataUtf8: "post with multiple tm1 candidates",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-dup-candidates" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "first candidate post") },
      { sats: 0n, script: canonicalTm1Script(0, "second candidate post") },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });

  const malformedSiblingCandidatePost = signTarget({
    id: "malformed-sibling-candidate-post-target",
    kind: "core-v1-post",
    expectPostAuthorIndex: null,
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    eventDataUtf8: "post with malformed sibling tm1 candidate",
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-malformed-sibling-candidates" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "first candidate post") },
      { sats: 0n, script: new Script(bytesFromHex("6a04544d4d0076")) },
      { sats: 9000n, script: testOutputScript("authorA") }
    ]
  });

  const absentParentTxid = createHash("sha256").update("rfc0001-reply-absent-parent-v1").digest("hex");

  const initialCatalog = new Map([
    [rootPost0.txid, rootPost0],
    [rootPost1.txid, rootPost1],
    [pendingPost.txid, pendingPost],
    [ineligiblePayment.txid, ineligiblePayment],
    [otherNetPost.txid, otherNetPost],
    [duplicateCandidatePost.txid, duplicateCandidatePost],
    [malformedSiblingCandidatePost.txid, malformedSiblingCandidatePost]
  ]);

  // Intermediate: valid reply to rootPost0 to act as eligible parent for nested reply
  const eligibleReplyParent = signReply({
    id: "eligible-reply-parent",
    group: "target",
    kind: "reply",
    signatureInputIndex: 0,
    envelopeAuthorIndex: 0,
    changeKey: "authorB",
    parentTxidHex: rootPost0.txid,
    replyText: "first level reply acting as parent",
    structuralOk: true,
    structuralError: null,
    authorship: "LAB_VALID",
    authorErrorCode: null,
    signatureOk: true,
    expectAuthor: "authorB",
    parentLink: "PARENT_VERIFIED",
    parentLinkDetail: null,
    eligibleForThread: true,
    inputs: [inputSpec({ keyName: "authorB", sats: 10000n, label: "reply-parent-level1" })]
  }, initialCatalog);

  const duplicateOutputReplyParent = signTarget({
    id: "duplicate-output-reply-target",
    kind: "reply",
    parentLink: "PARENT_VERIFIED",
    rootPostTxid: rootPost0.txid,
    depth: 1,
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    eventDataUtf8: "reply parent with duplicate candidate",
    inputs: [inputSpec({ keyName: "authorB", sats: 10000n, label: "reply-dup-reply-parent" })],
    outputs: [
      {
        sats: 0n,
        script: new Script(
          encodeReplyScript({
            version: SOCIAL_VERSION,
            eventType: EVENT_REPLY,
            authorInputIndex: 0,
            parentTxidHex: rootPost0.txid,
            replyText: "reply parent with duplicate candidate"
          })
        )
      },
      { sats: 0n, script: canonicalTm1Script(0, "second candidate output") },
      { sats: 9000n, script: testOutputScript("authorB") }
    ]
  });

  const catalog = new Map([
    ...initialCatalog.entries(),
    [eligibleReplyParent.txid, eligibleReplyParent],
    [duplicateOutputReplyParent.txid, duplicateOutputReplyParent]
  ]);
  assert(!catalog.has(absentParentTxid), "Absent parent collided with a synthetic transaction.");

  const base = {
    group: "positive",
    algorithm: "schnorr",
    sighashType: ALL_BIP143,
    signatureInputIndex: 0,
    envelopeAuthorIndex: 0,
    changeKey: "authorA",
    parentTxidHex: rootPost0.txid,
    replyText: "valid reply text",
    structuralOk: true,
    structuralError: null,
    authorship: "LAB_VALID",
    authorErrorCode: null,
    signatureOk: true,
    expectAuthor: "authorA",
    parentLink: "PARENT_VERIFIED",
    parentLinkDetail: null,
    eligibleForThread: true
  };

  const text40Bytes = "1234567890123456789012345678901234567890";
  const text41Bytes = "12345678901234567890123456789012345678901";
  const text180Bytes = "a".repeat(180);

  const positives = [
    signReply({
      ...base,
      id: "reply-schnorr-index0-41",
      replyText: "A",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-schnorr-0-41" })]
    }, catalog),
    signReply({
      ...base,
      id: "reply-schnorr-index1-41",
      signatureInputIndex: 1,
      envelopeAuthorIndex: 1,
      replyText: "reply at author input index 1",
      inputs: [
        inputSpec({ keyName: "observer", sats: 8000n, label: "reply-schnorr-1-fee", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-schnorr-1-author", outIdx: 1 })
      ]
    }, catalog),
    signReply({
      ...base,
      id: "reply-schnorr-index2-c1",
      signatureInputIndex: 2,
      envelopeAuthorIndex: 2,
      sighashType: ALL_ANYONECANPAY_BIP143,
      replyText: "reply at index 2 with anyonecanpay",
      inputs: [
        inputSpec({ keyName: "authorA", sats: 5000n, label: "reply-schnorr-2-c1-0", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 5000n, label: "reply-schnorr-2-c1-1", outIdx: 1 }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-schnorr-2-c1-2", outIdx: 2 })
      ]
    }, catalog),
    signReply({
      ...base,
      id: "reply-ecdsa-index0-41",
      algorithm: "ecdsa",
      replyText: "reply signed with ecdsa",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-ecdsa-0-41" })]
    }, catalog),
    signReply({
      ...base,
      id: "reply-ecdsa-index1-c1",
      algorithm: "ecdsa",
      signatureInputIndex: 1,
      envelopeAuthorIndex: 1,
      sighashType: ALL_ANYONECANPAY_BIP143,
      replyText: "reply signed with ecdsa and c1",
      inputs: [
        inputSpec({ keyName: "observer", sats: 8000n, label: "reply-ecdsa-1-fee", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-ecdsa-1-author", outIdx: 1 })
      ]
    }, catalog),
    signReply({
      ...base,
      id: "reply-nested-child",
      parentTxidHex: eligibleReplyParent.txid,
      replyText: "nested reply to first level reply",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-nested-child" })]
    }, catalog),
    signReply({
      ...base,
      id: "reply-push-boundary-40b",
      replyText: text40Bytes,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-boundary-40" })]
    }, catalog),
    signReply({
      ...base,
      id: "reply-push-boundary-41b",
      replyText: text41Bytes,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-boundary-41" })]
    }, catalog),
    signReply({
      ...base,
      id: "reply-max-text-180b",
      replyText: text180Bytes,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-max-180" })]
    }, catalog)
  ];

  const negativeBase = {
    ...base,
    group: "negative",
    eligibleForThread: false
  };

  // Custom malformed script bytes for non-standard envelope errors
  const lokadBytes = [0x6a, 0x04, 0x54, 0x4d, 0x4d, 0x00];
  const dummyParent = bytesFromHex(rootPost0.txid);

  const emptyTextEnvelope = new Uint8Array([0x02, 0x02, 0x00, ...dummyParent]);
  const emptyTextScript = new Uint8Array([...lokadBytes, emptyTextEnvelope.length, ...emptyTextEnvelope]);

  const tooLongEnvelope = new Uint8Array([0x02, 0x02, 0x00, ...dummyParent, ...new Uint8Array(181).fill(0x61)]);
  const tooLongScript = new Uint8Array([...lokadBytes, 0x4c, tooLongEnvelope.length, ...tooLongEnvelope]);

  const badUtf8Envelope = new Uint8Array([0x02, 0x02, 0x00, ...dummyParent, 0xff]);
  const badUtf8Script = new Uint8Array([...lokadBytes, badUtf8Envelope.length, ...badUtf8Envelope]);

  const negatives = [
    signReply({
      ...negativeBase,
      id: "neg-signature-flipped",
      mutate: "flip-signature",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-flip-sig" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-envelope-mutated",
      mutate: "envelope-byte",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-mut-env" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-output-mutated",
      mutate: "output-script",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-mut-out" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-author-index-5",
      envelopeAuthorIndex: 5,
      signatureOk: true,
      authorship: "LAB_INVALID",
      authorErrorCode: "AUTHOR_INPUT_OUT_OF_RANGE",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-idx-5" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-prevout-missing",
      signatureOk: null,
      authorship: "LAB_INVALID",
      authorErrorCode: "PREVOUT_UNAVAILABLE",
      prevoutPatch: { index: 0, kind: "missing" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-prev-miss" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-prevout-script",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      prevoutPatch: { index: 0, kind: "script" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-prev-script" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-prevout-amount",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      prevoutPatch: { index: 0, kind: "amount" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-prev-amount" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-unsupported-script",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "UNSUPPORTED_AUTHOR_SCRIPT",
      prevoutPatch: { index: 0, kind: "p2sh" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-prev-p2sh" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-absent",
      parentTxidHex: absentParentTxid,
      parentLink: "PARENT_PENDING",
      parentLinkDetail: "ABSENT",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-absent-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-pending",
      parentTxidHex: pendingPost.txid,
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "PARENT_AUTHOR_INVALID",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-pending-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-payment",
      parentTxidHex: ineligiblePayment.txid,
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "INELIGIBLE_MESSAGE_TYPE",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-payment-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-other-network",
      parentTxidHex: otherNetPost.txid,
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "OTHER_NETWORK",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-other-net-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-duplicate-candidates",
      parentTxidHex: duplicateCandidatePost.txid,
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "MULTIPLE_MEMOS",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-dup-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-malformed-sibling-candidate",
      parentTxidHex: malformedSiblingCandidatePost.txid,
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "MULTIPLE_MEMOS",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-malformed-sibling-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-parent-duplicate-output-reply",
      parentTxidHex: duplicateOutputReplyParent.txid,
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "MULTIPLE_MEMOS",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-neg-dup-output-reply-parent" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-reply-other-network",
      network: "lab-other-net",
      parentLink: "INVALID_PARENT",
      parentLinkDetail: "OTHER_NETWORK",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-other-net-self" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-nonminimal-push",
      nonminimal: true,
      structuralOk: false,
      structuralError: "INVALID_FORMAT",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: "INVALID_FORMAT",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-nonminimal" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-empty-text",
      customScriptBytes: emptyTextScript,
      structuralOk: false,
      structuralError: "INVALID_FORMAT",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: "INVALID_FORMAT",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-empty-text" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-text-too-long",
      customScriptBytes: tooLongScript,
      structuralOk: false,
      structuralError: "INVALID_FORMAT",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: "INVALID_FORMAT",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-too-long" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-malformed-utf8",
      customScriptBytes: badUtf8Script,
      structuralOk: false,
      structuralError: "MALFORMED_UTF8",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: "MALFORMED_UTF8",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-bad-utf8" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-version-09",
      version: 0x09,
      structuralOk: false,
      structuralError: "UNSUPPORTED_VERSION",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: "UNSUPPORTED_VERSION",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-ver-09" })]
    }, catalog),
    signReply({
      ...negativeBase,
      id: "neg-event-7e",
      eventType: 0x7e,
      structuralOk: false,
      structuralError: "UNSUPPORTED_EVENT",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: "UNSUPPORTED_EVENT",
      expectAuthor: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "reply-event-7e" })]
    }, catalog)
  ];

  const rows = [...positives, ...negatives];
  const txids = new Set();
  for (const row of [
    rootPost0,
    rootPost1,
    pendingPost,
    ineligiblePayment,
    otherNetPost,
    duplicateCandidatePost,
    malformedSiblingCandidatePost,
    eligibleReplyParent,
    duplicateOutputReplyParent,
    ...rows
  ]) {
    assert(!txids.has(row.txid), `${row.id} reused a txid.`);
    txids.add(row.txid);
  }

  for (const row of positives) {
    assert(row.sighashByte === 0x41 || row.sighashByte === 0xc1, `${row.id} used an unapproved sighash.`);
  }

  const sample = encodeReplyScript({
    version: SOCIAL_VERSION,
    eventType: EVENT_REPLY,
    authorInputIndex: 0,
    parentTxidHex: absentParentTxid,
    replyText: "sample"
  });
  const sampleHex = bytesToHex(sample);

  return {
    schema: "tonalli-memo.rfc0001.reply.s0",
    network: NETWORK,
    purpose:
      "Laboratory social v2 REPLY bytes, verified authorship, parent link verification, and thread replay. Synthetic signatures. Not a network settlement, not finality, and not a productive indexer.",
    status: {
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
    },
    generator: {
      library: "ecash-lib",
      version: "4.13.0",
      envelope: "tests/protocol/reply-envelope-independent.mjs",
      thread: "tests/protocol/reply-thread-independent.mjs",
      sighashSerializer: "tests/protocol/canonical-tm1-independent-verify.mjs"
    },
    absentParentTxid,
    targets: [
      rootPost0,
      rootPost1,
      pendingPost,
      ineligiblePayment,
      otherNetPost,
      duplicateCandidatePost,
      malformedSiblingCandidatePost,
      eligibleReplyParent,
      duplicateOutputReplyParent
    ],
    replies: rows,
    structures: [
      { id: "truncated-envelope", scriptHex: sampleHex.slice(0, 40), errorCode: "INVALID_FORMAT" },
      { id: "lokad-only", scriptHex: sampleHex.slice(0, 12), errorCode: "INVALID_FORMAT" }
    ]
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
  assert(!text.includes("SETTLED"), "REPLY fixture used a forbidden settlement word.");
  if (checkMode) {
    const current = await readFile(fixturePath, "utf8");
    if (current !== text) {
      fail("rfc0001-reply.json is not canonical. Regenerate it with the isolated generator.");
    }
  } else {
    await writeFile(fixturePath, text, "utf8");
  }
}
