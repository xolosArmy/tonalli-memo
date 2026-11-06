import { Buffer } from "node:buffer";

/**
 * Independent encoder and decoder for the proposed RFC-0001 reaction
 * envelope (M1.5.1). This module does not import ecash-lib and does not
 * activate version 0x02. TM1 Core v1.0 keeps its own parser.
 *
 * Accepted script layout, 43 bytes:
 * OP_RETURN(1) + 4-byte LOKAD push(5) + direct envelope push(1) + envelope(36).
 * Envelope: version(1) || event_type(1) || author_input_index(1)
 *           || target_txid(32) || reaction_kind(1).
 * target_txid is display order. It is not reversed and it is not UTF-8.
 */

export const REACTION_SCRIPT_LENGTH = 43;
export const REACTION_ENVELOPE_LENGTH = 36;
export const SOCIAL_VERSION = 0x02;
export const EVENT_REACTION = 0x03;
export const EVENT_REACTION_REMOVE = 0x04;
export const KIND_LIKE = 0x01;

const LOKAD = Uint8Array.from([0x54, 0x4d, 0x4d, 0x00]);

function fail(message) {
  throw new Error(message);
}

export function bytesFromHex(hex) {
  if (!/^(?:[0-9a-f]{2})+$/u.test(hex)) {
    fail(`Invalid hex: ${hex}`);
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    fail(`${name} is not an unsigned byte.`);
  }
  return value;
}

function requireTxid(targetTxidHex) {
  if (!/^[0-9a-f]{64}$/u.test(targetTxidHex)) {
    fail("target_txid must be 32 display-order bytes.");
  }
  return bytesFromHex(targetTxidHex);
}

export function encodeEnvelope(fields) {
  const version = requireByte(fields.version, "version");
  const eventType = requireByte(fields.eventType, "event_type");
  const authorInputIndex = requireByte(fields.authorInputIndex, "author_input_index");
  const target = requireTxid(fields.targetTxidHex);
  const reactionKind = requireByte(fields.reactionKind, "reaction_kind");
  const envelope = new Uint8Array(REACTION_ENVELOPE_LENGTH);
  envelope[0] = version;
  envelope[1] = eventType;
  envelope[2] = authorInputIndex;
  envelope.set(target, 3);
  envelope[35] = reactionKind;
  return envelope;
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Encoder A. Builds the script by concatenating minimal pushes.
 * A 36-byte envelope uses a direct push (opcode 0x24), never PUSHDATA1.
 */
export function encodeReactionScript(fields) {
  const envelope = encodeEnvelope(fields);
  if (envelope.length !== REACTION_ENVELOPE_LENGTH) {
    fail("Reaction envelope must be 36 bytes.");
  }
  const script = concat([
    Uint8Array.from([0x6a, LOKAD.length]),
    LOKAD,
    Uint8Array.from([envelope.length]),
    envelope
  ]);
  if (script.length !== REACTION_SCRIPT_LENGTH) {
    fail(`Reaction script length ${script.length} is not 43.`);
  }
  return script;
}

/**
 * Encoder B. Writes the same 43 bytes at fixed offsets.
 * It does not share the concatenation loop with encoder A.
 */
export function encodeReactionScriptFixed(fields) {
  const envelope = encodeEnvelope(fields);
  const script = new Uint8Array(REACTION_SCRIPT_LENGTH);
  script[0] = 0x6a;
  script[1] = 0x04;
  script.set(LOKAD, 2);
  script[6] = 0x24;
  script.set(envelope, 7);
  return script;
}

/**
 * Deliberately non-minimal framing. PUSHDATA1 of a 36-byte payload is
 * legal script but not a minimal push. Callers use it as a negative.
 */
export function encodeNonminimalReactionScript(fields) {
  const envelope = encodeEnvelope(fields);
  return concat([
    Uint8Array.from([0x6a, LOKAD.length]),
    LOKAD,
    Uint8Array.from([0x4c, envelope.length]),
    envelope
  ]);
}

function readPush(script, offset) {
  if (offset >= script.length) {
    return null;
  }
  const opcode = script[offset];
  let length;
  let minimal = true;
  let cursor = offset + 1;
  if (opcode <= 0x4b) {
    length = opcode;
  } else if (opcode === 0x4c) {
    if (cursor >= script.length) {
      return null;
    }
    length = script[cursor];
    minimal = length > 0x4b;
    cursor += 1;
  } else {
    return null;
  }
  const data = script.slice(cursor, cursor + length);
  if (data.length !== length) {
    return null;
  }
  return { data, minimal, next: cursor + length };
}

function fieldsFromEnvelope(envelope) {
  return {
    version: envelope[0],
    eventType: envelope[1],
    authorInputIndex: envelope[2],
    targetTxid: bytesToHex(envelope.slice(3, 35)),
    reactionKind: envelope[35]
  };
}

/**
 * Social-reaction decoder. It accepts only version 0x02, events 0x03 and
 * 0x04, and reaction_kind 0x01. Any other byte is a rejection. A v1 POST
 * is not a reaction, even when Core accepts that POST.
 */
export function decodeReactionScript(script) {
  const scriptLength = script.length;
  if (script[0] !== 0x6a) {
    return { ok: false, framed: false, errorCode: "INVALID_MARKER", scriptLength, pushCount: 0 };
  }
  const lokad = readPush(script, 1);
  if (lokad === null) {
    return { ok: false, framed: false, errorCode: "INVALID_FORMAT", scriptLength, pushCount: 0 };
  }
  const envelope = readPush(script, lokad.next);
  if (envelope === null) {
    return { ok: false, framed: false, errorCode: "INVALID_FORMAT", scriptLength, pushCount: 1 };
  }
  const pushCount = 2;
  if (envelope.next !== script.length) {
    return { ok: false, framed: false, errorCode: "INVALID_FORMAT", scriptLength, pushCount };
  }
  if (!lokad.minimal || !envelope.minimal) {
    return { ok: false, framed: false, errorCode: "INVALID_FORMAT", scriptLength, pushCount };
  }
  if (lokad.data.length !== 4 || bytesToHex(lokad.data) !== "544d4d00") {
    return { ok: false, framed: false, errorCode: "INVALID_MARKER", scriptLength, pushCount };
  }
  if (envelope.data.length !== REACTION_ENVELOPE_LENGTH) {
    return { ok: false, framed: false, errorCode: "INVALID_FORMAT", scriptLength, pushCount };
  }
  const fields = fieldsFromEnvelope(envelope.data);
  const framed = {
    ok: false,
    framed: true,
    scriptLength,
    pushCount,
    ...fields
  };
  if (fields.version !== SOCIAL_VERSION) {
    return { ...framed, errorCode: "UNSUPPORTED_VERSION" };
  }
  if (fields.eventType !== EVENT_REACTION && fields.eventType !== EVENT_REACTION_REMOVE) {
    return { ...framed, errorCode: "UNSUPPORTED_EVENT" };
  }
  if (fields.reactionKind !== KIND_LIKE) {
    return { ...framed, errorCode: "UNSUPPORTED_REACTION_KIND" };
  }
  return {
    ok: true,
    framed: true,
    errorCode: null,
    scriptLength,
    pushCount,
    eventName: fields.eventType === EVENT_REACTION ? "REACTION" : "REACTION_REMOVE",
    ...fields
  };
}

export function encodersAgree(fields) {
  return bytesToHex(encodeReactionScript(fields)) === bytesToHex(encodeReactionScriptFixed(fields));
}
