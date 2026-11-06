import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";

/**
 * Independent encoder and decoder for the proposed RFC-0001 social v2
 * REPLY envelope (M1.3, S0-05). This module does not import ecash-lib
 * and does not activate version 0x02. TM1 Core v1.0 keeps its own parser.
 *
 * Accepted script layout, 43 to 223 bytes:
 * OP_RETURN(1) + 4-byte LOKAD push(5) + minimal envelope push(1 or 2) + envelope(36..215).
 * Envelope: version(1) || event_type(1) || author_input_index(1)
 *           || parent_txid(32) || reply_text(1..180).
 * parent_txid is 32 display-order bytes. It is not reversed and not UTF-8 decoded.
 * reply_text is strict UTF-8 text (1 to 180 bytes).
 */

export const MIN_REPLY_SCRIPT_LENGTH = 43;
export const MAX_REPLY_SCRIPT_LENGTH = 223;
export const MIN_REPLY_ENVELOPE_LENGTH = 36;
export const MAX_REPLY_ENVELOPE_LENGTH = 215;
export const MIN_REPLY_TEXT_LENGTH = 1;
export const MAX_REPLY_TEXT_LENGTH = 180;
export const SOCIAL_VERSION = 0x02;
export const EVENT_REPLY = 0x02;

const LOKAD = Uint8Array.from([0x54, 0x4d, 0x4d, 0x00]);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

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

function requireParentTxid(parentTxidHex) {
  if (!/^[0-9a-f]{64}$/u.test(parentTxidHex)) {
    fail("parent_txid must be 32 display-order bytes (64 hex characters).");
  }
  return bytesFromHex(parentTxidHex);
}

function textBytes(replyText) {
  if (typeof replyText === "string") {
    return Uint8Array.from(Buffer.from(replyText, "utf8"));
  }
  if (replyText instanceof Uint8Array || Buffer.isBuffer(replyText)) {
    return Uint8Array.from(replyText);
  }
  fail("replyText must be a UTF-8 string or Uint8Array/Buffer.");
}

export function encodeReplyEnvelope(fields) {
  const version = requireByte(fields.version, "version");
  const eventType = requireByte(fields.eventType, "event_type");
  const authorInputIndex = requireByte(fields.authorInputIndex, "author_input_index");
  const parent = requireParentTxid(fields.parentTxidHex);
  const text = textBytes(fields.replyText);
  if (text.length < MIN_REPLY_TEXT_LENGTH || text.length > MAX_REPLY_TEXT_LENGTH) {
    fail(`reply_text length ${text.length} is outside allowed range 1..180 bytes.`);
  }
  const envelope = new Uint8Array(3 + 32 + text.length);
  envelope[0] = version;
  envelope[1] = eventType;
  envelope[2] = authorInputIndex;
  envelope.set(parent, 3);
  envelope.set(text, 35);
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
 * Encoder A. Concatenates minimal pushes.
 * Uses direct push for envelope length <= 75 (0x4b),
 * OP_PUSHDATA1 for envelope length > 75 (76..215).
 */
export function encodeReplyScript(fields) {
  const envelope = encodeReplyEnvelope(fields);
  const envelopePush =
    envelope.length <= 0x4b
      ? Uint8Array.from([envelope.length])
      : Uint8Array.from([0x4c, envelope.length]);

  const script = concat([
    Uint8Array.from([0x6a, LOKAD.length]),
    LOKAD,
    envelopePush,
    envelope
  ]);
  if (script.length < MIN_REPLY_SCRIPT_LENGTH || script.length > MAX_REPLY_SCRIPT_LENGTH) {
    fail(`REPLY script length ${script.length} is outside allowed range 43..223.`);
  }
  return script;
}

/**
 * Encoder B. Writes the same bytes using explicit offsets.
 * It does not share the concatenation loop with encoder A.
 */
export function encodeReplyScriptFixed(fields) {
  const envelope = encodeReplyEnvelope(fields);
  const isPushData1 = envelope.length > 0x4b;
  const scriptLen = 1 + 1 + 4 + (isPushData1 ? 2 : 1) + envelope.length;
  const script = new Uint8Array(scriptLen);
  script[0] = 0x6a;
  script[1] = 0x04;
  script.set(LOKAD, 2);
  let offset = 6;
  if (isPushData1) {
    script[offset] = 0x4c;
    script[offset + 1] = envelope.length;
    offset += 2;
  } else {
    script[offset] = envelope.length;
    offset += 1;
  }
  script.set(envelope, offset);
  return script;
}

/**
 * Deliberately non-minimal framing. PUSHDATA1 of an envelope <= 75 bytes
 * is legal Bitcoin script but not a minimal push. Callers use it as a negative.
 */
export function encodeNonminimalReplyScript(fields) {
  const envelope = encodeReplyEnvelope(fields);
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
  let replyTextUtf8 = null;
  let utf8Valid = true;
  const textBytes = envelope.slice(35);
  try {
    replyTextUtf8 = UTF8_DECODER.decode(textBytes);
  } catch {
    utf8Valid = false;
  }
  return {
    version: envelope[0],
    eventType: envelope[1],
    authorInputIndex: envelope[2],
    parentTxid: bytesToHex(envelope.slice(3, 35)),
    replyTextUtf8,
    replyTextByteLength: textBytes.length,
    utf8Valid
  };
}

/**
 * REPLY decoder. Rejects non-minimal framing, unsupported versions,
 * invalid events, malformed UTF-8, and out-of-budget envelopes.
 */
export function decodeReplyScript(script) {
  const scriptLength = script.length;
  if (script.length === 0 || script[0] !== 0x6a) {
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
  if (envelope.data.length < MIN_REPLY_ENVELOPE_LENGTH || envelope.data.length > MAX_REPLY_ENVELOPE_LENGTH) {
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
  if (fields.eventType !== EVENT_REPLY) {
    return { ...framed, errorCode: "UNSUPPORTED_EVENT" };
  }
  if (!fields.utf8Valid) {
    return { ...framed, errorCode: "MALFORMED_UTF8" };
  }
  return {
    ok: true,
    framed: true,
    errorCode: null,
    scriptLength,
    pushCount,
    eventName: "REPLY",
    ...fields
  };
}

export function encodersAgree(fields) {
  return bytesToHex(encodeReplyScript(fields)) === bytesToHex(encodeReplyScriptFixed(fields));
}

/**
 * M1.3.8 illustrative sample:
 * parent: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
 * text: "hola" (686f6c61)
 * envelope: 39 bytes, direct push 0x27, 46-byte total script.
 */
export function illustrativeReplyScriptHex() {
  const script = encodeReplyScript({
    version: SOCIAL_VERSION,
    eventType: EVENT_REPLY,
    authorInputIndex: 0x00,
    parentTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    replyText: "hola"
  });
  const hex = bytesToHex(script);
  if (script.length !== 46 || script[6] !== 0x27 || !encodersAgree({
    version: SOCIAL_VERSION,
    eventType: EVENT_REPLY,
    authorInputIndex: 0x00,
    parentTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    replyText: "hola"
  })) {
    fail("Illustrative reply encoder diverged from M1.3.8 specification.");
  }
  return hex;
}
