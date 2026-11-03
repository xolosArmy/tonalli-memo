/**
 * Laboratory attribution for a proposed native TIP_XEC.
 *
 * The credited amount is the positive satoshi sum of P2PKH outputs whose
 * HASH160 is the target POST's designated author. Change, fees, OP_RETURN,
 * and outputs to any other hash are excluded. Every funding prevout must
 * be a standard P2PKH controlled by that same tipper hash. A recipient
 * input, a third-party input, a missing prevout, or an unsupported script
 * credits zero. A sender who is the recipient is SELF_TIP_UNCREDITED.
 *
 * LAB_ATTRIBUTABLE is a synthetic label. settlement and confirmation stay
 * NOT_DEMONSTRATED. This module is not a network settlement and not an indexer.
 */

import {
  classifyAuthor,
  hash160,
  inputUnlockMatchesPrevout,
  p2pkhHash,
  parseTx,
  toHex,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import { decodeTipScript } from "./tip-xec-envelope-independent.mjs";

export const LAB_TIP_NETWORK = "lab-tip-net";

function fail(message) {
  throw new Error(message);
}

function pushesOf(script) {
  const pushes = [];
  for (let cursor = 0; cursor < script.length; ) {
    const opcode = script[cursor];
    cursor += 1;
    let length;
    if (opcode <= 0x4b) {
      length = opcode;
    } else if (opcode === 0x4c) {
      const next = script[cursor];
      if (next === undefined) {
        return null;
      }
      length = next;
      cursor += 1;
    } else {
      return null;
    }
    const data = script.slice(cursor, cursor + length);
    if (data.length !== length) {
      return null;
    }
    pushes.push(data);
    cursor += length;
  }
  return pushes;
}

/**
 * HASH160 of the pubkey on the designated input. Metadata is not consulted.
 * Returns null when that input is absent or the scriptSig is not two pushes.
 */
export function designatedAuthorHash160(rawTransactionHex, authorInputIndex) {
  const input = parseTx(rawTransactionHex).inputs[authorInputIndex];
  if (input === undefined) {
    return null;
  }
  const pushes = pushesOf(input.script);
  if (pushes === null || pushes.length !== 2) {
    return null;
  }
  return toHex(hash160(pushes[1]));
}

function p2pkhHashHex(script) {
  const hash = p2pkhHash(toHex(script));
  return hash === null ? null : toHex(hash);
}

/**
 * Author index from a Core v1.0 POST script. Input zero is not a fallback.
 * Returns null when output 0 is not a minimal v1 POST.
 */
export function coreV1PostAuthorIndex(rawTransactionHex) {
  const output = parseTx(rawTransactionHex).outputs[0];
  if (output === undefined || output.sats !== 0n) {
    return null;
  }
  const script = output.script;
  if (script.length < 10 || script[0] !== 0x6a || script[1] !== 0x04) {
    return null;
  }
  if (toHex(script.slice(2, 6)) !== "544d4d00") {
    return null;
  }
  const push = script[6];
  if (push < 3 || push > 0x4b || script.length !== 7 + push) {
    return null;
  }
  if (script[7] !== 0x01 || script[8] !== 0x01) {
    return null;
  }
  return script[9];
}

function authorOf(rawTransactionHex, index, inputs, algorithm) {
  if (
    !Array.isArray(inputs) ||
    (inputs[index] !== undefined &&
      inputs[index]?.outputScriptHex != null &&
      (typeof inputs[index].prevoutSats !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(inputs[index].prevoutSats)))
  ) {
    return { valid: false, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE" };
  }
  return classifyAuthor({
    rawTransactionHex,
    authorInputIndex: index,
    inputs,
    signatureAlgorithm: algorithm
  });
}

/**
 * Eligible only when the record is on the tip's network, output 0 is a
 * Core v1.0 POST, and that POST's designated input verifies in this laboratory.
 * A profile, an alias, or input zero of the POST is not consulted.
 */
export function classifyTipTarget(tipNetwork, target, signedTargetTxid) {
  if (target === undefined) {
    return { link: "ABSENT", recipientHash160: null, authorInputIndex: null };
  }
  if (
    typeof signedTargetTxid !== "string" ||
    typeof target.rawTransactionHex !== "string" ||
    txidOf(target.rawTransactionHex) !== signedTargetTxid
  ) {
    return { link: "ABSENT", recipientHash160: null, authorInputIndex: null };
  }
  if (target.network !== tipNetwork) {
    return { link: "OTHER_NETWORK", recipientHash160: null, authorInputIndex: null };
  }
  const authorInputIndex = coreV1PostAuthorIndex(target.rawTransactionHex);
  if (authorInputIndex === null) {
    return { link: "INELIGIBLE", recipientHash160: null, authorInputIndex: null };
  }
  const authorship = authorOf(
    target.rawTransactionHex,
    authorInputIndex,
    target.inputs,
    target.signatureAlgorithm
  );
  if (!authorship.valid) {
    return { link: "PENDING_TARGET", recipientHash160: null, authorInputIndex };
  }
  const recipientHash160 = designatedAuthorHash160(target.rawTransactionHex, authorInputIndex);
  if (recipientHash160 === null) {
    return { link: "PENDING_TARGET", recipientHash160: null, authorInputIndex };
  }
  return { link: "ELIGIBLE", recipientHash160, authorInputIndex };
}

function prevoutHash(input) {
  if (input === undefined || input.outputScriptHex == null) {
    return { ok: false, reason: "PREVOUT_UNAVAILABLE" };
  }
  if (typeof input.prevoutSats !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(input.prevoutSats)) {
    return { ok: false, reason: "PREVOUT_UNAVAILABLE" };
  }
  if (input.scriptType !== "p2pkh") {
    return { ok: false, reason: "UNSUPPORTED_INPUT_SCRIPT" };
  }
  const hash = p2pkhHash(input.outputScriptHex);
  if (hash === null) {
    return { ok: false, reason: "UNSUPPORTED_INPUT_SCRIPT" };
  }
  return { ok: true, hash: toHex(hash) };
}

function inputAlgorithm(script) {
  const pushes = pushesOf(script);
  if (pushes === null || pushes.length !== 2 || pushes[0].length < 2) {
    return null;
  }
  const signatureLength = pushes[0].length - 1;
  if (signatureLength === 64) {
    return "schnorr";
  }
  if (signatureLength >= 8 && signatureLength <= 72) {
    return "ecdsa";
  }
  return null;
}

function fundingFailure(rawTransactionHex, inputs, tipperHash, recipientHash) {
  const serialized = parseTx(rawTransactionHex).inputs;
  if (!Array.isArray(inputs) || inputs.length !== serialized.length) {
    return "PREVOUT_UNAVAILABLE";
  }
  for (let index = 0; index < serialized.length; index += 1) {
    const prevout = prevoutHash(inputs[index]);
    if (!prevout.ok) {
      return prevout.reason === "PREVOUT_UNAVAILABLE" ? "PREVOUT_UNAVAILABLE" : "UNSUPPORTED_INPUT_SCRIPT";
    }
    if (prevout.hash !== tipperHash) {
      if (recipientHash !== null && prevout.hash === recipientHash) {
        return "RECIPIENT_INPUT";
      }
      return "THIRD_PARTY_INPUT";
    }
  }
  return null;
}

function fundingSignatureValid(rawTransactionHex, inputs) {
  const serialized = parseTx(rawTransactionHex).inputs;
  for (let index = 0; index < serialized.length; index += 1) {
    const algorithm = inputAlgorithm(serialized[index].script);
    if (
      algorithm === null ||
      !inputUnlockMatchesPrevout(rawTransactionHex, inputs, index, algorithm)
    ) {
      return false;
    }
  }
  return true;
}

function recipientOutputSum(rawTransactionHex, recipientHash) {
  let positive = 0n;
  let zeroOutputs = 0;
  for (const output of parseTx(rawTransactionHex).outputs) {
    if (p2pkhHashHex(output.script) !== recipientHash) {
      continue;
    }
    if (output.sats > 0n) {
      positive += output.sats;
    } else {
      zeroOutputs += 1;
    }
  }
  return { positive, zeroOutputs };
}

function result(fields) {
  return {
    creditedSatoshis: fields.creditedSatoshis,
    verdict: fields.verdict,
    detail: fields.detail,
    settlement: "NOT_DEMONSTRATED",
    confirmation: "NOT_DEMONSTRATED",
    authorHash160: fields.authorHash160,
    recipientHash160: fields.recipientHash160,
    authorship: fields.authorship,
    authorErrorCode: fields.authorErrorCode,
    structuralOk: fields.structuralOk,
    structuralError: fields.structuralError,
    targetLink: fields.targetLink
  };
}

/**
 * Stateless attribution of one synthetic tip. Callers pass the declared
 * prevouts. A later call with the same bytes returns the same verdict.
 */
export function attributeNativeTip({ rawTransactionHex, inputs, network, signatureAlgorithm, target }) {
  if (typeof network !== "string" || network.length === 0) {
    fail("TIP network is required.");
  }
  const tx = parseTx(rawTransactionHex);
  const output = tx.outputs[0];
  if (output === undefined) {
    fail("TIP transaction has no output.");
  }
  const decoded = decodeTipScript(output.script);
  if (!decoded.ok || output.sats !== 0n || tx.outputs.slice(1).some((entry) => entry.script[0] === 0x6a)) {
    const errorCode = decoded.ok ? "INVALID_FORMAT" : decoded.errorCode;
    return result({
      creditedSatoshis: "0",
      verdict: errorCode,
      detail: null,
      authorHash160: null,
      recipientHash160: null,
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      structuralOk: false,
      structuralError: errorCode,
      targetLink: "NOT_FRAMED"
    });
  }
  const authorship = authorOf(rawTransactionHex, decoded.authorInputIndex, inputs, signatureAlgorithm);
  const authorHash160 = designatedAuthorHash160(rawTransactionHex, decoded.authorInputIndex);
  const authorshipLabel = authorship.valid ? "LAB_VALID" : "LAB_INVALID";
  const targetClass = classifyTipTarget(network, target, decoded.targetTxid);
  if (!authorship.valid) {
    return result({
      creditedSatoshis: "0",
      verdict: authorship.errorCode,
      detail: null,
      authorHash160,
      recipientHash160: targetClass.recipientHash160,
      authorship: authorshipLabel,
      authorErrorCode: authorship.errorCode,
      structuralOk: true,
      structuralError: null,
      targetLink: targetClass.link
    });
  }
  if (authorHash160 === null) {
    fail("A laboratory-valid tip author did not yield a HASH160.");
  }
  if (targetClass.link !== "ELIGIBLE") {
    const verdict = {
      ABSENT: "TARGET_ABSENT",
      INELIGIBLE: "TARGET_INELIGIBLE",
      PENDING_TARGET: "TARGET_PENDING",
      OTHER_NETWORK: "TARGET_OTHER_NETWORK"
    }[targetClass.link];
    if (verdict === undefined) {
      fail(`Unexpected target link ${targetClass.link}.`);
    }
    return result({
      creditedSatoshis: "0",
      verdict,
      detail: null,
      authorHash160,
      recipientHash160: null,
      authorship: authorshipLabel,
      authorErrorCode: null,
      structuralOk: true,
      structuralError: null,
      targetLink: targetClass.link
    });
  }
  const funding = fundingFailure(rawTransactionHex, inputs, authorHash160, targetClass.recipientHash160);
  if (funding !== null) {
    return result({
      creditedSatoshis: "0",
      verdict: "AMBIGUOUS_TIP_FUNDING",
      detail: funding,
      authorHash160,
      recipientHash160: targetClass.recipientHash160,
      authorship: authorshipLabel,
      authorErrorCode: null,
      structuralOk: true,
      structuralError: null,
      targetLink: "ELIGIBLE"
    });
  }
  if (authorHash160 === targetClass.recipientHash160) {
    return result({
      creditedSatoshis: "0",
      verdict: "SELF_TIP_UNCREDITED",
      detail: null,
      authorHash160,
      recipientHash160: targetClass.recipientHash160,
      authorship: authorshipLabel,
      authorErrorCode: null,
      structuralOk: true,
      structuralError: null,
      targetLink: "ELIGIBLE"
    });
  }
  if (!fundingSignatureValid(rawTransactionHex, inputs)) {
    return result({
      creditedSatoshis: "0",
      verdict: "INVALID_FUNDING_SIGNATURE",
      detail: "FUNDING_INPUT_INVALID",
      authorHash160,
      recipientHash160: targetClass.recipientHash160,
      authorship: authorshipLabel,
      authorErrorCode: null,
      structuralOk: true,
      structuralError: null,
      targetLink: "ELIGIBLE"
    });
  }
  const outputs = recipientOutputSum(rawTransactionHex, targetClass.recipientHash160);
  if (outputs.positive === 0n) {
    return result({
      creditedSatoshis: "0",
      verdict: outputs.zeroOutputs > 0 ? "NO_VALUE_TRANSFER" : "INVALID_RECIPIENT",
      detail: outputs.zeroOutputs > 0 ? "ZERO_OUTPUT" : "OTHER_OUTPUT",
      authorHash160,
      recipientHash160: targetClass.recipientHash160,
      authorship: authorshipLabel,
      authorErrorCode: null,
      structuralOk: true,
      structuralError: null,
      targetLink: "ELIGIBLE"
    });
  }
  return result({
    creditedSatoshis: outputs.positive.toString(),
    verdict: "LAB_ATTRIBUTABLE",
    detail: null,
    authorHash160,
    recipientHash160: targetClass.recipientHash160,
    authorship: authorshipLabel,
    authorErrorCode: null,
    structuralOk: true,
    structuralError: null,
    targetLink: "ELIGIBLE"
  });
}

