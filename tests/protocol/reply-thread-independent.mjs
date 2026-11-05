import { TextDecoder } from "node:util";

import {
  classifyAuthor,
  hash160,
  inputUnlockMatchesPrevout,
  parseTx,
  toHex,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import { decodeReplyScript } from "./reply-envelope-independent.mjs";

export const LAB_REPLY_NETWORK = "lab-reply-net";

function fail(message) {
  throw new Error(message);
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function pushesOf(script) {
  const pushes = [];
  for (let cursor = 0; cursor < script.length; ) {
    const opcode = script[cursor];
    cursor += 1;
    let length;
    if (opcode >= 0x01 && opcode <= 0x4b) {
      length = opcode;
    } else if (opcode === 0x4c) {
      const next = script[cursor];
      if (next === undefined || next < 0x4c) {
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

function firstPushData(scriptBody) {
  if (scriptBody.length === 0) {
    return null;
  }
  const opcode = scriptBody[0];
  let headerLength;
  let dataLength;
  if (opcode >= 0x01 && opcode <= 0x4b) {
    headerLength = 1;
    dataLength = opcode;
  } else if (opcode === 0x4c) {
    if (scriptBody.length < 2) {
      return null;
    }
    headerLength = 2;
    dataLength = scriptBody[1];
  } else if (opcode === 0x4d) {
    if (scriptBody.length < 3) {
      return null;
    }
    headerLength = 3;
    dataLength = scriptBody[1] + scriptBody[2] * 0x100;
  } else if (opcode === 0x4e) {
    if (scriptBody.length < 5) {
      return null;
    }
    headerLength = 5;
    dataLength =
      scriptBody[1] +
      scriptBody[2] * 0x100 +
      scriptBody[3] * 0x10000 +
      scriptBody[4] * 0x1000000;
  } else {
    return null;
  }
  const end = headerLength + dataLength;
  if (!Number.isSafeInteger(end) || end > scriptBody.length) {
    return null;
  }
  return scriptBody.subarray(headerLength, end);
}

export function tm1CandidateOutputs(rawTransactionHex) {
  const outputs = parseTx(rawTransactionHex).outputs;
  const candidates = [];
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (output.script.length > 0 && output.script[0] === 0x6a) {
      const body = output.script.slice(1);
      const firstPush = firstPushData(body);
      if (firstPush !== null && toHex(firstPush) === "544d4d00") {
        const pushes = pushesOf(body);
        candidates.push({ index: i, output, pushes });
      }
    }
  }
  return candidates;
}

/**
 * Author index from a Core v1.0 POST script. Input zero is not a fallback.
 * Enforces candidate cardinality across all outputs: returns null when the
 * transaction does not contain exactly one TM1 candidate, or when that
 * single candidate output is not a minimal v1 POST.
 */
export function coreV1PostAuthorIndex(rawTransactionHex) {
  const candidates = tm1CandidateOutputs(rawTransactionHex);
  if (candidates.length !== 1) {
    return null;
  }
  const { output, pushes } = candidates[0];
  if (output.sats !== 0n || pushes === null) {
    return null;
  }
  const script = output.script;
  if (script.length < 10 || script.length > 223 || script[0] !== 0x6a) {
    return null;
  }
  if (pushes.length !== 2) {
    return null;
  }
  if (toHex(pushes[0]) !== "544d4d00") {
    return null;
  }
  const envelope = pushes[1];
  if (envelope.length < 4 || envelope.length > 215) {
    return null;
  }
  if (envelope[0] !== 0x01 || envelope[1] !== 0x01) {
    return null;
  }
  try {
    UTF8_DECODER.decode(envelope.slice(3));
  } catch {
    return null;
  }
  return envelope[2];
}

function authorOf(rawTransactionHex, index, inputs, algorithm) {
  if (
    !Array.isArray(inputs) ||
    inputs.length !== parseTx(rawTransactionHex).inputs.length ||
    (inputs[index] !== undefined &&
      inputs[index]?.outputScriptHex != null &&
      (typeof inputs[index].prevoutSats !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(inputs[index].prevoutSats)))
  ) {
    return { valid: false, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE" };
  }
  const classification = classifyAuthor({
    rawTransactionHex,
    authorInputIndex: index,
    inputs,
    signatureAlgorithm: algorithm
  });
  if (!classification.valid) {
    return classification;
  }
  if (!inputUnlockMatchesPrevout(rawTransactionHex, inputs, index, algorithm)) {
    return { valid: false, stage: "signature-verification", errorCode: "INVALID_AUTHOR_SIGNATURE" };
  }
  return classification;
}

/**
 * Classifies author of a reply transaction according to M1.4.2 rules.
 */
export function classifyReplyAuthor(rawTransactionHex, authorInputIndex, inputs, signatureAlgorithm) {
  return authorOf(rawTransactionHex, authorInputIndex, inputs, signatureAlgorithm);
}

/**
 * Classifies parent eligibility according to M1.3.4:
 * A parent is eligible if it resolves to a verifiable active-chain message
 * of the same network, either:
 * - A valid TM1 Core v1.0 POST, or
 * - A valid REPLY under an activated social profile.
 *
 * Separates parent linkage from event validity (M1.3.5).
 */
export function classifyReplyParent(replyNetwork, parentRecord, signedParentTxid, visitedChain = []) {
  if (parentRecord === undefined) {
    return { link: "PARENT_PENDING", reason: "ABSENT", parentKind: null, rootPostTxid: null, depth: null };
  }
  if (
    typeof signedParentTxid !== "string" ||
    typeof parentRecord.rawTransactionHex !== "string" ||
    txidOf(parentRecord.rawTransactionHex) !== signedParentTxid
  ) {
    return { link: "PARENT_PENDING", reason: "ABSENT", parentKind: null, rootPostTxid: null, depth: null };
  }
  if (parentRecord.network !== replyNetwork) {
    return { link: "INVALID_PARENT", reason: "OTHER_NETWORK", parentKind: null, rootPostTxid: null, depth: null };
  }
  if (visitedChain.includes(signedParentTxid)) {
    return { link: "REFERENCE_CYCLE", reason: "CYCLE_DETECTED", parentKind: null, rootPostTxid: null, depth: null };
  }

  if (parentRecord.kind === "core-v1-post") {
    const candidates = tm1CandidateOutputs(parentRecord.rawTransactionHex);
    if (candidates.length > 1) {
      return { link: "INVALID_PARENT", reason: "MULTIPLE_MEMOS", parentKind: "core-v1-post", rootPostTxid: null, depth: null };
    }
    const authorIndex = coreV1PostAuthorIndex(parentRecord.rawTransactionHex);
    if (authorIndex === null) {
      return { link: "INVALID_PARENT", reason: "NOT_CORE_V1_POST", parentKind: null, rootPostTxid: null, depth: null };
    }
    const authorship = authorOf(
      parentRecord.rawTransactionHex,
      authorIndex,
      parentRecord.inputs,
      parentRecord.signatureAlgorithm
    );
    if (!authorship.valid) {
      return { link: "INVALID_PARENT", reason: "PARENT_AUTHOR_INVALID", parentKind: "core-v1-post", rootPostTxid: null, depth: null };
    }
    return {
      link: "PARENT_VERIFIED",
      reason: null,
      parentKind: "core-v1-post",
      parentAuthorHash160: designatedAuthorHash160(parentRecord.rawTransactionHex, authorIndex),
      rootPostTxid: signedParentTxid,
      depth: 1
    };
  }

  if (parentRecord.kind === "reply") {
    const tx = parseTx(parentRecord.rawTransactionHex);
    const output = tx.outputs[0];
    if (output === undefined || output.sats !== 0n) {
      return { link: "INVALID_PARENT", reason: "NOT_REPLY_OUTPUT", parentKind: null, rootPostTxid: null, depth: null };
    }
    const decoded = decodeReplyScript(output.script);
    if (!decoded.ok) {
      return { link: "INVALID_PARENT", reason: "NOT_VALID_REPLY_SCRIPT", parentKind: null, rootPostTxid: null, depth: null };
    }
    const candidates = tm1CandidateOutputs(parentRecord.rawTransactionHex);
    if (candidates.length > 1 || tx.outputs.slice(1).some((entry) => entry.script.length > 0 && entry.script[0] === 0x6a)) {
      return { link: "INVALID_PARENT", reason: "MULTIPLE_MEMOS", parentKind: "reply", rootPostTxid: null, depth: null };
    }
    const authorship = authorOf(
      parentRecord.rawTransactionHex,
      decoded.authorInputIndex,
      parentRecord.inputs,
      parentRecord.signatureAlgorithm
    );
    if (!authorship.valid) {
      return { link: "INVALID_PARENT", reason: "PARENT_AUTHOR_INVALID", parentKind: "reply", rootPostTxid: null, depth: null };
    }
    if (parentRecord.parentLink !== "PARENT_VERIFIED") {
      return { link: "INVALID_PARENT", reason: "PARENT_UNVERIFIED_ANCESTOR", parentKind: "reply", rootPostTxid: null, depth: null };
    }
    return {
      link: "PARENT_VERIFIED",
      reason: null,
      parentKind: "reply",
      parentAuthorHash160: designatedAuthorHash160(parentRecord.rawTransactionHex, decoded.authorInputIndex),
      rootPostTxid: parentRecord.rootPostTxid ?? signedParentTxid,
      depth: (parentRecord.depth ?? 1) + 1
    };
  }

  return { link: "INVALID_PARENT", reason: "INELIGIBLE_MESSAGE_TYPE", parentKind: null, rootPostTxid: null, depth: null };
}

/**
 * Independent verifier for a synthetic social v2 REPLY.
 * Preserves the strict separation between event authorship and parent linkage (M1.3.5).
 */
export function verifyReply({ rawTransactionHex, inputs, network, signatureAlgorithm, parentRecord, visitedChain = [] }) {
  if (typeof network !== "string" || network.length === 0) {
    fail("REPLY network is required.");
  }
  const txid = txidOf(rawTransactionHex);
  const tx = parseTx(rawTransactionHex);
  const output = tx.outputs[0];
  if (output === undefined) {
    fail("REPLY transaction has no output.");
  }
  const decoded = decodeReplyScript(output.script);
  if (!decoded.ok || output.sats !== 0n || tx.outputs.slice(1).some((entry) => entry.script[0] === 0x6a)) {
    const errorCode = decoded.ok ? "INVALID_FORMAT" : decoded.errorCode;
    return {
      txid,
      structuralOk: false,
      structuralError: errorCode,
      authorInputIndex: null,
      authorHash160: null,
      authorship: "LAB_INVALID",
      authorErrorCode: null,
      parentTxid: null,
      parentLink: "NOT_FRAMED",
      parentLinkDetail: errorCode,
      parentKind: null,
      rootPostTxid: null,
      depth: null,
      replyTextUtf8: null,
      replyTextByteLength: 0,
      scriptLength: output.script.length,
      eligibleForThread: false
    };
  }

  const authorshipResult = classifyReplyAuthor(
    rawTransactionHex,
    decoded.authorInputIndex,
    inputs,
    signatureAlgorithm
  );
  const authorHash160 = designatedAuthorHash160(rawTransactionHex, decoded.authorInputIndex);
  const authorshipLabel = authorshipResult.valid ? "LAB_VALID" : "LAB_INVALID";

  let parentResolution;
  if (decoded.parentTxid === txid) {
    parentResolution = {
      link: "REFERENCE_CYCLE",
      reason: "SELF_REFERENCE",
      parentKind: null,
      rootPostTxid: null,
      depth: null
    };
  } else {
    parentResolution = classifyReplyParent(network, parentRecord, decoded.parentTxid, [
      ...visitedChain,
      txid
    ]);
  }

  const eligibleForThread =
    decoded.ok &&
    authorshipResult.valid &&
    parentResolution.link === "PARENT_VERIFIED";

  return {
    txid,
    structuralOk: true,
    structuralError: null,
    authorInputIndex: decoded.authorInputIndex,
    authorHash160,
    authorship: authorshipLabel,
    authorErrorCode: authorshipResult.valid ? null : authorshipResult.errorCode,
    parentTxid: decoded.parentTxid,
    parentLink: parentResolution.link,
    parentLinkDetail: parentResolution.reason,
    parentKind: parentResolution.parentKind,
    rootPostTxid: parentResolution.rootPostTxid,
    depth: parentResolution.depth,
    replyTextUtf8: decoded.replyTextUtf8,
    replyTextByteLength: decoded.replyTextByteLength,
    scriptLength: decoded.scriptLength,
    eligibleForThread
  };
}

export function emptyReplyThreadState() {
  return {
    confirmedEvents: [],
    provisional: [],
    withheld: [],
    threads: {},
    totalConfirmedCount: 0
  };
}

function compareReplyEvents(left, right) {
  if (left.blockHeight !== right.blockHeight) {
    return left.blockHeight - right.blockHeight;
  }
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  if (left.txid < right.txid) {
    return -1;
  }
  if (left.txid > right.txid) {
    return 1;
  }
  return 0;
}

function assertReplyEvent(event) {
  if (event.confirmation !== "CONFIRMED" && event.confirmation !== "MEMPOOL") {
    fail("Reply confirmation must be CONFIRMED or MEMPOOL.");
  }
  if (typeof event.txid !== "string" || !/^[0-9a-f]{64}$/u.test(event.txid)) {
    fail("Reply txid must be 64 lowercase hex characters.");
  }
  if (event.confirmation === "CONFIRMED") {
    if (!Number.isInteger(event.blockHeight) || !Number.isInteger(event.position)) {
      fail(`${event.txid} confirmed without block position.`);
    }
  }
}

function rebuildThreads(state) {
  state.confirmedEvents.sort(compareReplyEvents);
  const threads = {};
  const withheld = [];
  let confirmedCount = 0;

  for (const event of state.confirmedEvents) {
    if (!event.eligibleForThread) {
      withheld.push({
        txid: event.txid,
        reason: event.structuralOk !== true
          ? "STRUCTURE"
          : event.authorship !== "LAB_VALID"
          ? "AUTHORSHIP"
          : event.parentLink
      });
      continue;
    }
    const rootKey = event.rootPostTxid ?? event.parentTxid;
    if (threads[rootKey] === undefined) {
      threads[rootKey] = [];
    }
    threads[rootKey].push({
      txid: event.txid,
      parentTxid: event.parentTxid,
      authorHash160: event.authorHash160,
      replyTextUtf8: event.replyTextUtf8,
      blockHeight: event.blockHeight,
      position: event.position,
      depth: event.depth ?? 1
    });
    confirmedCount += 1;
  }

  state.threads = threads;
  state.withheld = withheld;
  state.totalConfirmedCount = confirmedCount;
}

/**
 * In-memory deterministic replay and thread reconstruction for RFC-0001 REPLY.
 * Deduplicates by transaction ID, idempotently sorts siblings by block position and txid,
 * and maintains mempool events provisionally without counting them in confirmed threads.
 */
export function applyReplyEvents(state, events) {
  const next = globalThis.structuredClone(state);
  const confirmed = [];
  const mempool = [];

  for (const event of events) {
    assertReplyEvent(event);
    if (event.confirmation === "MEMPOOL") {
      mempool.push(event);
    } else {
      confirmed.push(event);
    }
  }

  const existingConfirmedIndex = new Map(
    next.confirmedEvents.map((item, index) => [item.txid, index])
  );
  for (const event of confirmed.sort(compareReplyEvents)) {
    const existingIndex = existingConfirmedIndex.get(event.txid);
    if (existingIndex !== undefined) {
      const existing = next.confirmedEvents[existingIndex];
      if (
        existing.eligibleForThread !== event.eligibleForThread ||
        existing.parentLink !== event.parentLink ||
        existing.authorship !== event.authorship ||
        existing.rootPostTxid !== event.rootPostTxid ||
        existing.depth !== event.depth ||
        existing.blockHeight !== event.blockHeight ||
        existing.position !== event.position ||
        existing.structuralOk !== event.structuralOk
      ) {
        next.confirmedEvents[existingIndex] = event;
      }
      continue;
    }
    existingConfirmedIndex.set(event.txid, next.confirmedEvents.length);
    next.confirmedEvents.push(event);
    next.provisional = next.provisional.filter((item) => item.txid !== event.txid);
  }

  rebuildThreads(next);

  for (const event of mempool) {
    if (
      existingConfirmedIndex.has(event.txid) ||
      next.provisional.some((item) => item.txid === event.txid)
    ) {
      continue;
    }
    next.provisional.push({
      txid: event.txid,
      parentTxid: event.parentTxid,
      countedInConfirmed: false,
      reason: "MEMPOOL"
    });
  }

  return next;
}

export function replayReplies(events) {
  return applyReplyEvents(emptyReplyThreadState(), events);
}
