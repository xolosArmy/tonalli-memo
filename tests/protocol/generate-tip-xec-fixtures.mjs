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
  attributeNativeTip,
  coreV1PostAuthorIndex,
  designatedAuthorHash160,
  LAB_TIP_NETWORK
} from "./tip-xec-attribution-independent.mjs";
import {
  EVENT_TIP,
  SOCIAL_VERSION,
  bytesFromHex,
  bytesToHex,
  decodeTipScript,
  encodeNonminimalTipScript,
  encodeTipScript,
  encodersAgree,
  s08TipScriptHex
} from "./tip-xec-envelope-independent.mjs";

/**
 * Synthetic native TIP_XEC corpus.
 * Signs with the existing P2PKH fixture tools, then checks the independent
 * envelope decoder, the independent BIP143/ForkID oracle, and the strict
 * funding rule. Prevouts are declared laboratory metadata, not mainnet history.
 * No node, no funds, and no production package is modified.
 * LAB_ATTRIBUTABLE is not a network settlement.
 */

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json")
);
const { ALL_ANYONECANPAY_BIP143, ALL_BIP143, Script, Tx } = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(repoRoot, "tests/fixtures/rfc0001-tip-xec.json");
const checkMode = process.argv.includes("--check");
const NETWORK = LAB_TIP_NETWORK;
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
assert(s08TipScriptHex().length === 84, "S-08 is not 42 bytes.");

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
  assert(current.length === 42 && current[0] === 0x6a && current[6] === 0x23, "Envelope mutation expected a 42-byte tip.");
  current[41] ^= 0x01;
  tx.outputs[0].script = new Script(Uint8Array.from(current));
  return tx.toHex();
}

function mutateRecipientScript(rawTransactionHex) {
  const tx = Tx.fromHex(rawTransactionHex);
  const current = Buffer.from(tx.outputs[1].script.toHex(), "hex");
  assert(current.length === 25 && current[0] === 0x76, "Output mutation expected a P2PKH recipient.");
  current[4] ^= 0x01;
  tx.outputs[1].script = new Script(Uint8Array.from(current));
  return tx.toHex();
}

function replyShapedScript(authorIndex, parentTxidHex) {
  const envelope = Buffer.concat([
    Buffer.from([0x02, 0x02, authorIndex]),
    Buffer.from(bytesFromHex(parentTxidHex)),
    Buffer.from([0x61])
  ]);
  assert(envelope.length === 36, "Reply-shaped envelope must be 36 bytes.");
  return new Script(
    Uint8Array.from([0x6a, 0x04, 0x54, 0x4d, 0x4d, 0x00, envelope.length, ...envelope])
  );
}

function tipOutputs(spec, script) {
  const incoming = spec.inputs.reduce((sum, input) => sum + input.sats, 0n);
  const paid = spec.payments.reduce((sum, payment) => sum + payment.sats, 0n);
  const fee = spec.fee ?? 1000n;
  const change = incoming - paid - fee;
  assert(change > 0n, `${spec.id} change is not positive.`);
  return [
    { sats: 0n, script },
    ...spec.payments.map((payment) => ({ sats: payment.sats, script: testOutputScript(payment.key) })),
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

function applyPrevoutPatch(inputs, patch) {
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
  if (spec.kind === "core-v1-post") {
    assert(parsedIndex === spec.authorInputIndex, `${spec.id} POST index ${parsedIndex}.`);
  } else {
    assert(parsedIndex === null, `${spec.id} was classified as a Core v1 POST.`);
  }
  return {
    id: spec.id,
    group: "target",
    kind: spec.kind,
    network: NETWORK,
    signatureAlgorithm: "schnorr",
    authorInputIndex: spec.authorInputIndex,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    inputs: signed.inputs,
    authorHash160: designatedAuthorHash160(rawTransactionHex, spec.authorInputIndex),
    outputScriptHex: bytesToHex(firstOutputScript(rawTransactionHex)),
    authorship: authorshipLabel,
    authorErrorCode: authorship.errorCode,
    eventDataUtf8: spec.eventDataUtf8 ?? null
  };
}

function signTip(spec, catalog) {
  const fields = {
    version: spec.version ?? SOCIAL_VERSION,
    eventType: spec.eventType ?? EVENT_TIP,
    authorInputIndex: spec.envelopeAuthorIndex,
    targetTxidHex: spec.targetTxidHex
  };
  if (spec.nonminimal !== true && spec.version === undefined && spec.eventType === undefined) {
    assert(encodersAgree(fields), `${spec.id} encoders diverged.`);
  }
  const scriptBytes = spec.nonminimal === true ? encodeNonminimalTipScript(fields) : encodeTipScript(fields);
  const signed = signedFixture({
    authorInputIndex: spec.signatureInputIndex,
    sighashType: spec.sighashType,
    algorithm: spec.algorithm,
    inputs: spec.inputs,
    outputs: tipOutputs(spec, new Script(scriptBytes))
  });
  let rawTransactionHex = signed.rawTransactionHex;
  if (spec.mutate === "flip-signature") {
    rawTransactionHex = flipSignature(rawTransactionHex, spec.signatureInputIndex);
  } else if (spec.mutate === "envelope-byte") {
    rawTransactionHex = mutateEnvelopeByte(rawTransactionHex);
  } else if (spec.mutate === "output-script") {
    rawTransactionHex = mutateRecipientScript(rawTransactionHex);
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
  if (spec.prevoutPatch?.kind === "amount" || spec.prevoutPatch?.kind === "script") {
    assert(finalDigest !== preMutationDigestHex, `${spec.id} prevout change kept the old digest.`);
  }
  const outputScript = firstOutputScript(rawTransactionHex);
  const decoded = decodeTipScript(outputScript);
  assert(decoded.ok === spec.structuralOk, `${spec.id} structural ok was ${decoded.ok}.`);
  assert(decoded.errorCode === spec.structuralError, `${spec.id} structural ${decoded.errorCode}.`);
  if (decoded.framed === true && spec.nonminimal !== true && spec.mutate !== "envelope-byte") {
    assert(outputScript.length === 42, `${spec.id} framed script is ${outputScript.length} bytes.`);
    assert(decoded.pushCount === 2, `${spec.id} did not have two pushes.`);
    assert(decoded.targetTxid === spec.targetTxidHex, `${spec.id} target bytes did not round-trip.`);
  }
  if (spec.nonminimal === true) {
    assert(outputScript.length === 43, `${spec.id} nonminimal script is ${outputScript.length} bytes.`);
  }
  if (spec.mutate === "envelope-byte") {
    assert(decoded.ok === true, `${spec.id} envelope flip left the tip frame.`);
    assert(decoded.targetTxid !== spec.targetTxidHex, `${spec.id} did not change the target.`);
  }
  const signatureOk = digestAvailable
    ? signatureMatches(rawTransactionHex, inputs, spec.signatureInputIndex, spec.algorithm)
    : null;
  assert(signatureOk === spec.signatureOk, `${spec.id} signature match was ${signatureOk}.`);
  if (spec.signatureOk === true && spec.prevoutPatch === undefined) {
    assert(
      inputUnlockMatchesPrevout(rawTransactionHex, inputs, spec.signatureInputIndex, spec.algorithm),
      `${spec.id} prevout did not match the signed input.`
    );
  }
  const targetTxid = decoded.framed === true ? decoded.targetTxid : null;
  const target = targetTxid === null ? undefined : catalog.get(targetTxid);
  const attributed = attributeNativeTip({
    rawTransactionHex,
    inputs,
    network: spec.network ?? NETWORK,
    signatureAlgorithm: spec.algorithm,
    target
  });
  assert(attributed.verdict === spec.verdict, `${spec.id} verdict ${attributed.verdict}, expected ${spec.verdict}.`);
  assert(attributed.detail === spec.detail, `${spec.id} detail ${attributed.detail}, expected ${spec.detail}.`);
  assert(
    attributed.creditedSatoshis === spec.creditedSatoshis,
    `${spec.id} credited ${attributed.creditedSatoshis}, expected ${spec.creditedSatoshis}.`
  );
  assert(attributed.targetLink === spec.targetLink, `${spec.id} target link ${attributed.targetLink}.`);
  assert(attributed.authorship === spec.authorship, `${spec.id} authorship ${attributed.authorErrorCode}.`);
  assert(attributed.authorErrorCode === spec.authorErrorCode, `${spec.id} author code ${attributed.authorErrorCode}.`);
  assert(attributed.settlement === "NOT_DEMONSTRATED", `${spec.id} recorded a settlement.`);
  assert(attributed.confirmation === "NOT_DEMONSTRATED", `${spec.id} recorded a confirmation.`);
  if (spec.expectAuthor === null) {
    assert(attributed.authorHash160 === null, `${spec.id} unexpectedly resolved an author hash.`);
  } else {
    assert(attributed.authorHash160 === KNOWN_HASH[spec.expectAuthor], `${spec.id} author hash ${attributed.authorHash160}.`);
  }
  if (spec.expectRecipient === null) {
    assert(attributed.recipientHash160 === null, `${spec.id} unexpectedly resolved a recipient.`);
  } else if (spec.expectRecipient !== undefined) {
    assert(
      attributed.recipientHash160 === KNOWN_HASH[spec.expectRecipient],
      `${spec.id} recipient hash ${attributed.recipientHash160}.`
    );
  }
  if (spec.verdict === "LAB_ATTRIBUTABLE") {
    for (const input of inputs) {
      assert(input.scriptType === "p2pkh", `${spec.id} attributed a non-P2PKH prevout.`);
    }
    assert(attributed.authorHash160 !== attributed.recipientHash160, `${spec.id} credited a self tip.`);
  }
  return {
    id: spec.id,
    group: spec.group,
    network: spec.network ?? NETWORK,
    signatureAlgorithm: spec.algorithm,
    signatureInputIndex: spec.signatureInputIndex,
    envelopeAuthorIndex: spec.envelopeAuthorIndex,
    rawTransactionHex,
    txid: txidOf(rawTransactionHex),
    inputs,
    sighashByte: signed.sighashByte,
    outputScriptHex: bytesToHex(outputScript),
    scriptLength: outputScript.length,
    targetTxid,
    digestHex: finalDigest,
    preMutationDigestHex,
    signatureOk,
    ...attributed
  };
}

function buildFixtures() {
  const eligible = signTarget({
    id: "eligible-post-index1",
    kind: "core-v1-post",
    authorship: "LAB_VALID",
    authorInputIndex: 1,
    eventDataUtf8: "tip target post",
    inputs: [
      inputSpec({ keyName: "observer", sats: 8000n, label: "tip-post-fee", outIdx: 0 }),
      inputSpec({ keyName: "authorB", sats: 10000n, label: "tip-post-author", outIdx: 1 })
    ],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(1, "tip target post") },
      { sats: 17000n, script: testOutputScript("authorB") }
    ]
  });
  assert(eligible.authorHash160 === KNOWN_HASH.authorB, "Eligible POST author is not author B.");
  assert(
    designatedAuthorHash160(eligible.rawTransactionHex, 0) === KNOWN_HASH.observer,
    "Eligible POST input zero was treated as the author."
  );
  assert(designatedAuthorHash160(eligible.rawTransactionHex, 0) !== eligible.authorHash160, "POST input zero matches the author.");

  const pending = signTarget({
    id: "pending-post",
    kind: "core-v1-post",
    authorship: "LAB_INVALID",
    mutate: "flip-signature",
    authorInputIndex: 0,
    eventDataUtf8: "tip pending target",
    inputs: [inputSpec({ keyName: "authorB", sats: 10000n, label: "tip-pending" })],
    outputs: [
      { sats: 0n, script: canonicalTm1Script(0, "tip pending target") },
      { sats: 9000n, script: testOutputScript("authorB") }
    ]
  });
  const payment = signTarget({
    id: "ineligible-payment",
    kind: "payment",
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-payment" })],
    outputs: [{ sats: 9000n, script: testOutputScript("authorB") }]
  });
  const replyShaped = signTarget({
    id: "ineligible-reply-shaped",
    kind: "reply-shaped",
    authorship: "LAB_VALID",
    authorInputIndex: 0,
    inputs: [inputSpec({ keyName: "authorB", sats: 10000n, label: "tip-reply-shaped" })],
    outputs: [
      { sats: 0n, script: replyShapedScript(0, eligible.txid) },
      { sats: 9000n, script: testOutputScript("authorB") }
    ]
  });
  const absentTargetTxid = createHash("sha256").update("rfc0001-tip-xec-absent-target-v1").digest("hex");
  const catalog = new Map([eligible, pending, payment, replyShaped].map((target) => [target.txid, target]));
  assert(!catalog.has(absentTargetTxid), "Absent target collided with a synthetic transaction.");

  const base = {
    group: "positive",
    algorithm: "schnorr",
    sighashType: ALL_BIP143,
    signatureInputIndex: 0,
    envelopeAuthorIndex: 0,
    changeKey: "authorA",
    targetTxidHex: eligible.txid,
    targetLink: "ELIGIBLE",
    structuralOk: true,
    structuralError: null,
    authorship: "LAB_VALID",
    authorErrorCode: null,
    signatureOk: true,
    expectAuthor: "authorA",
    expectRecipient: "authorB",
    verdict: "LAB_ATTRIBUTABLE",
    detail: null,
    creditedSatoshis: "1000",
    payments: [{ key: "authorB", sats: 1000n }]
  };

  const positives = [
    signTip({
      ...base,
      id: "tip-schnorr-index0-41",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-a-41" })]
    }, catalog),
    signTip({
      ...base,
      id: "tip-schnorr-index1-41",
      signatureInputIndex: 1,
      envelopeAuthorIndex: 1,
      inputs: [
        inputSpec({ keyName: "authorA", sats: 8000n, label: "tip-a-index1-fee", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-a-index1-author", outIdx: 1 })
      ]
    }, catalog),
    signTip({
      ...base,
      id: "tip-schnorr-index0-c1",
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [
        inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-a-c1", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 7000n, label: "tip-a-c1-own", outIdx: 1 })
      ]
    }, catalog),
    signTip({
      ...base,
      id: "tip-schnorr-index2-c1",
      sighashType: ALL_ANYONECANPAY_BIP143,
      signatureInputIndex: 2,
      envelopeAuthorIndex: 2,
      inputs: [
        inputSpec({ keyName: "authorA", sats: 5000n, label: "tip-a-index2-0", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 5000n, label: "tip-a-index2-1", outIdx: 1 }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-a-index2-2", outIdx: 2 })
      ]
    }, catalog),
    signTip({
      ...base,
      id: "tip-ecdsa-index0-41",
      algorithm: "ecdsa",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-a-ecdsa" })]
    }, catalog),
    signTip({
      ...base,
      id: "tip-multi-output",
      creditedSatoshis: "3000",
      payments: [
        { key: "authorB", sats: 1000n },
        { key: "authorB", sats: 2000n }
      ],
      inputs: [inputSpec({ keyName: "authorA", sats: 20000n, label: "tip-multi" })]
    }, catalog),
    signTip({
      ...base,
      id: "tip-mixed-output",
      payments: [
        { key: "authorB", sats: 1000n },
        { key: "observer", sats: 546n }
      ],
      inputs: [inputSpec({ keyName: "authorA", sats: 12000n, label: "tip-mixed" })]
    }, catalog)
  ];

  const negativeBase = {
    ...base,
    group: "negative",
    verdict: "AMBIGUOUS_TIP_FUNDING",
    creditedSatoshis: "0"
  };

  const negatives = [
    signTip({
      ...negativeBase,
      id: "neg-recipient-funded",
      detail: "RECIPIENT_INPUT",
      inputs: [
        inputSpec({ keyName: "authorA", sats: 1000n, label: "tip-x05-a", outIdx: 0 }),
        inputSpec({ keyName: "authorB", sats: 1000000n, label: "tip-x05-b", outIdx: 1 })
      ],
      payments: [{ key: "authorB", sats: 1000000n }],
      fee: 500n
    }, catalog),
    signTip({
      ...negativeBase,
      id: "neg-third-party",
      detail: "THIRD_PARTY_INPUT",
      inputs: [
        inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-third-a", outIdx: 0 }),
        inputSpec({ keyName: "observer", sats: 7000n, label: "tip-third-c", outIdx: 1 })
      ]
    }, catalog),
    signTip({
      ...negativeBase,
      id: "neg-third-party-index1",
      detail: "THIRD_PARTY_INPUT",
      signatureInputIndex: 1,
      envelopeAuthorIndex: 1,
      inputs: [
        inputSpec({ keyName: "observer", sats: 8000n, label: "tip-third-index0", outIdx: 0 }),
        inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-third-index1", outIdx: 1 })
      ]
    }, catalog),
    signTip({
      ...negativeBase,
      id: "neg-third-party-c1",
      detail: "THIRD_PARTY_INPUT",
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [
        inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-c1-a", outIdx: 0 }),
        inputSpec({ keyName: "observer", sats: 7000n, label: "tip-c1-c", outIdx: 1 })
      ]
    }, catalog),
    signTip({
      ...base,
      id: "neg-self-tip",
      group: "negative",
      expectAuthor: "authorB",
      changeKey: "authorB",
      verdict: "SELF_TIP_UNCREDITED",
      creditedSatoshis: "0",
      inputs: [inputSpec({ keyName: "authorB", sats: 10000n, label: "tip-self" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-zero-recipient",
      group: "negative",
      verdict: "NO_VALUE_TRANSFER",
      detail: "ZERO_OUTPUT",
      creditedSatoshis: "0",
      payments: [{ key: "authorB", sats: 0n }],
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-zero" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-pays-post-input-zero",
      group: "negative",
      verdict: "INVALID_RECIPIENT",
      detail: "OTHER_OUTPUT",
      creditedSatoshis: "0",
      payments: [{ key: "observer", sats: 1000n }],
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-wrong-hash" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-target-absent",
      group: "negative",
      targetTxidHex: absentTargetTxid,
      targetLink: "ABSENT",
      verdict: "TARGET_ABSENT",
      creditedSatoshis: "0",
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-absent" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-target-pending",
      group: "negative",
      targetTxidHex: pending.txid,
      targetLink: "PENDING_TARGET",
      verdict: "TARGET_PENDING",
      creditedSatoshis: "0",
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-pending-target" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-target-payment",
      group: "negative",
      targetTxidHex: payment.txid,
      targetLink: "INELIGIBLE",
      verdict: "TARGET_INELIGIBLE",
      creditedSatoshis: "0",
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-payment-target" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-target-reply-shaped",
      group: "negative",
      targetTxidHex: replyShaped.txid,
      targetLink: "INELIGIBLE",
      verdict: "TARGET_INELIGIBLE",
      creditedSatoshis: "0",
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-reply-target" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-other-network",
      group: "negative",
      network: "lab-other-net",
      targetLink: "OTHER_NETWORK",
      verdict: "TARGET_OTHER_NETWORK",
      creditedSatoshis: "0",
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-other-net" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-signature-flipped",
      group: "negative",
      mutate: "flip-signature",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      verdict: "INVALID_AUTHOR_SIGNATURE",
      creditedSatoshis: "0",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-flip" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-output-mutated",
      group: "negative",
      mutate: "output-script",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      verdict: "INVALID_AUTHOR_SIGNATURE",
      creditedSatoshis: "0",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-output" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-envelope-mutated",
      group: "negative",
      mutate: "envelope-byte",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      targetLink: "ABSENT",
      verdict: "INVALID_AUTHOR_SIGNATURE",
      creditedSatoshis: "0",
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-envelope" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-author-index-5",
      group: "negative",
      envelopeAuthorIndex: 5,
      signatureOk: true,
      authorship: "LAB_INVALID",
      authorErrorCode: "AUTHOR_INPUT_OUT_OF_RANGE",
      verdict: "AUTHOR_INPUT_OUT_OF_RANGE",
      creditedSatoshis: "0",
      expectAuthor: null,
      targetLink: "ELIGIBLE",
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-index-5" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-prevout-missing",
      group: "negative",
      signatureOk: null,
      authorship: "LAB_INVALID",
      authorErrorCode: "PREVOUT_UNAVAILABLE",
      verdict: "PREVOUT_UNAVAILABLE",
      creditedSatoshis: "0",
      prevoutPatch: { index: 0, kind: "missing" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-missing" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-prevout-script",
      group: "negative",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      verdict: "INVALID_AUTHOR_SIGNATURE",
      creditedSatoshis: "0",
      prevoutPatch: { index: 0, kind: "script" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-bad-script" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-prevout-amount",
      group: "negative",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "INVALID_AUTHOR_SIGNATURE",
      verdict: "INVALID_AUTHOR_SIGNATURE",
      creditedSatoshis: "0",
      prevoutPatch: { index: 0, kind: "amount" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-bad-amount" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-unsupported-script",
      group: "negative",
      signatureOk: false,
      authorship: "LAB_INVALID",
      authorErrorCode: "UNSUPPORTED_AUTHOR_SCRIPT",
      verdict: "UNSUPPORTED_AUTHOR_SCRIPT",
      creditedSatoshis: "0",
      prevoutPatch: { index: 0, kind: "p2sh" },
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-p2sh" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-version-09",
      group: "negative",
      version: 0x09,
      structuralOk: false,
      structuralError: "UNSUPPORTED_VERSION",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      signatureOk: true,
      verdict: "UNSUPPORTED_VERSION",
      targetLink: "NOT_FRAMED",
      creditedSatoshis: "0",
      expectAuthor: null,
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-version" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-event-7e",
      group: "negative",
      eventType: 0x7e,
      structuralOk: false,
      structuralError: "UNSUPPORTED_EVENT",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      signatureOk: true,
      verdict: "UNSUPPORTED_EVENT",
      targetLink: "NOT_FRAMED",
      creditedSatoshis: "0",
      expectAuthor: null,
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-event" })]
    }, catalog),
    signTip({
      ...base,
      id: "neg-nonminimal",
      group: "negative",
      nonminimal: true,
      structuralOk: false,
      structuralError: "INVALID_FORMAT",
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      signatureOk: true,
      verdict: "INVALID_FORMAT",
      targetLink: "NOT_FRAMED",
      creditedSatoshis: "0",
      expectAuthor: null,
      expectRecipient: null,
      inputs: [inputSpec({ keyName: "authorA", sats: 10000n, label: "tip-nonminimal" })]
    }, catalog)
  ];

  const rows = [...positives, ...negatives];
  const txids = new Set();
  for (const row of [...[eligible, pending, payment, replyShaped], ...rows]) {
    assert(!txids.has(row.txid), `${row.id} reused a txid.`);
    txids.add(row.txid);
  }
  for (const row of positives) {
    if (row.envelopeAuthorIndex !== 0) {
      assert(
        designatedAuthorHash160(row.rawTransactionHex, 0) === row.authorHash160,
        `${row.id} used a fee input that is not the tipper.`
      );
    }
    assert(row.sighashByte === 0x41 || row.sighashByte === 0xc1, `${row.id} used an unapproved sighash.`);
  }
  assert(rows.find((row) => row.id === "neg-recipient-funded").creditedSatoshis === "0", "Recipient-funded tip was credited.");
  assert(rows.find((row) => row.id === "tip-multi-output").creditedSatoshis === "3000", "Multiple recipient outputs were not summed.");

  const sample = encodeTipScript({
    version: SOCIAL_VERSION,
    eventType: EVENT_TIP,
    authorInputIndex: 1,
    targetTxidHex: absentTargetTxid
  });
  const sampleHex = bytesToHex(sample);
  return {
    schema: "tonalli-memo.rfc0001.tip-xec.s0",
    network: NETWORK,
    purpose:
      "Laboratory native TIP_XEC bytes and strict funding attribution. Synthetic signatures. Not a network settlement, not finality, and not a productive indexer.",
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
      envelope: "tests/protocol/tip-xec-envelope-independent.mjs",
      attribution: "tests/protocol/tip-xec-attribution-independent.mjs",
      sighashSerializer: "tests/protocol/canonical-tm1-independent-verify.mjs"
    },
    absentTargetTxid,
    targets: [eligible, pending, payment, replyShaped],
    tips: rows,
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
  assert(!text.includes("SETTLED") && !text.includes("VERIFIED"), "TIP fixture used a forbidden fulfillment word.");
  if (checkMode) {
    const current = await readFile(fixturePath, "utf8");
    if (current !== text) {
      fail("rfc0001-tip-xec.json is not canonical. Regenerate it with the isolated generator.");
    }
  } else {
    await writeFile(fixturePath, text, "utf8");
  }
}
