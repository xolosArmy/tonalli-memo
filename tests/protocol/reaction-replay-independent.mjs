/**
 * In-memory replay for the proposed reaction key
 * (network, author_hash160, target_txid, reaction_kind).
 *
 * Confirmed order is synthetic block height, position in that block, then
 * TXID. Mempool events stay on a separate list. Counts are a derived view:
 * at most one active LIKE per key, and a removal cannot drive the count
 * below zero. This is not a chain reorg, not finality, and not an indexer.
 */

import { hash160, parseTx, toHex } from "./canonical-tm1-independent-verify.mjs";

export const LAB_REACTION_NETWORK = "lab-reaction-net";

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
  const tx = parseTx(rawTransactionHex);
  const input = tx.inputs[authorInputIndex];
  if (input === undefined) {
    return null;
  }
  const pushes = pushesOf(input.script);
  if (pushes === null || pushes.length !== 2) {
    return null;
  }
  return toHex(hash160(pushes[1]));
}

export function reactionStateKey(network, authorHash160, targetTxid, reactionKind) {
  const kind = reactionKind.toString(16).padStart(2, "0");
  return `${network}|${authorHash160}|${targetTxid}|${kind}`;
}

/**
 * A target is eligible only when this laboratory has already accepted it
 * as a Core v1.0 POST with a laboratory-valid author signature.
 * A parsed POST whose author signature is still open stays pending.
 * A payment, or any other transaction, is ineligible. An unknown TXID is absent.
 */
export function classifyReactionTarget(record) {
  if (record === undefined) {
    return "ABSENT";
  }
  if (record.kind !== "core-v1-post") {
    return "INELIGIBLE";
  }
  if (record.authorship !== "LAB_VALID") {
    return "PENDING_TARGET";
  }
  return "ELIGIBLE";
}

export function emptyReactionState() {
  return {
    appliedTxids: [],
    history: [],
    withheld: [],
    provisional: [],
    active: {},
    confirmedLikeCount: 0
  };
}

function isHex(value, length) {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/u.test(value);
}

function assertEvent(event) {
  if (event.confirmation !== "CONFIRMED" && event.confirmation !== "MEMPOOL") {
    fail("Reaction confirmation must be CONFIRMED or MEMPOOL.");
  }
  if (!isHex(event.txid, 64)) {
    fail("Reaction txid must be 32 bytes of hex.");
  }
  if (typeof event.network !== "string" || event.network.length === 0) {
    fail("Reaction network is required.");
  }
  if (event.action !== "REACTION" && event.action !== "REACTION_REMOVE" && event.action !== "NONE") {
    fail(`Unknown reaction action ${event.action}.`);
  }
  if (event.confirmation === "CONFIRMED") {
    if (!Number.isInteger(event.blockHeight) || !Number.isInteger(event.position)) {
      fail(`${event.txid} is confirmed without a block position.`);
    }
  }
}

function sortConfirmed(events) {
  return [...events].sort((left, right) => {
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
  });
}

function withholdReason(event) {
  if (event.structuralOk !== true) {
    return "STRUCTURE";
  }
  if (event.authorship !== "LAB_VALID") {
    return "AUTHORSHIP";
  }
  if (event.targetLink === "ABSENT") {
    return "TARGET_ABSENT";
  }
  if (event.targetLink === "INELIGIBLE") {
    return "TARGET_INELIGIBLE";
  }
  if (event.targetLink === "PENDING_TARGET") {
    return "TARGET_PENDING";
  }
  return "NOT_ELIGIBLE";
}

function canAffectActiveState(event) {
  return (
    event.structuralOk === true &&
    event.authorship === "LAB_VALID" &&
    event.targetLink === "ELIGIBLE" &&
    event.reactionKind === 0x01 &&
    (event.action === "REACTION" || event.action === "REACTION_REMOVE") &&
    isHex(event.authorHash160, 40) &&
    isHex(event.targetTxid, 64)
  );
}

function applyOne(state, event, lane) {
  if (state.appliedTxids.includes(event.txid)) {
    return;
  }
  state.appliedTxids.push(event.txid);
  if (lane === "mempool") {
    state.provisional.push({
      txid: event.txid,
      countedInConfirmed: false,
      reason: "MEMPOOL"
    });
    return;
  }
  if (!canAffectActiveState(event)) {
    state.withheld.push({ txid: event.txid, reason: withholdReason(event) });
    return;
  }
  const key = reactionStateKey(event.network, event.authorHash160, event.targetTxid, event.reactionKind);
  const prior = state.active[key] ?? { active: false, transitions: 0, lastTxid: null, lastAction: null };
  const active = event.action === "REACTION";
  state.history.push({
    txid: event.txid,
    key,
    action: event.action,
    blockHeight: event.blockHeight,
    position: event.position,
    activeBefore: prior.active,
    activeAfter: active
  });
  state.active[key] = {
    active,
    lastTxid: event.txid,
    lastAction: event.action,
    transitions: prior.transitions + 1
  };
}

function recomputeCount(state) {
  const count = Object.values(state.active).filter((row) => row.active).length;
  if (count < 0) {
    fail("Confirmed like count became negative.");
  }
  state.confirmedLikeCount = count;
}

/**
 * Returns a new state. The input state is not mutated.
 * Confirmed events are ordered before they are applied. Mempool events
 * are applied afterwards and never change confirmedLikeCount.
 */
export function applyReactionEvents(state, events) {
  const next = globalThis.structuredClone(state);
  const confirmed = [];
  const mempool = [];
  for (const event of events) {
    assertEvent(event);
    if (event.confirmation === "MEMPOOL") {
      mempool.push(event);
    } else {
      confirmed.push(event);
    }
  }
  for (const event of sortConfirmed(confirmed)) {
    applyOne(next, event, "confirmed");
  }
  for (const event of mempool) {
    applyOne(next, event, "mempool");
  }
  recomputeCount(next);
  return next;
}

export function replayReactions(events) {
  return applyReactionEvents(emptyReactionState(), events);
}

export function cloneReactionState(state) {
  return globalThis.structuredClone(state);
}

export function activeContributors(state) {
  return Object.entries(state.active)
    .filter(([, row]) => row.active)
    .map(([key, row]) => ({ key, lastTxid: row.lastTxid, lastAction: row.lastAction }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}
