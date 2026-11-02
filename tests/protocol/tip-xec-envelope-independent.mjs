import { Buffer } from "node:buffer";

/**
 * Independent encoder and decoder for the proposed RFC-0001 native
 * TIP_XEC envelope (M1.6.3, S-08). This module does not import ecash-lib
 * and does not activate version 0x02. TM1 Core v1.0 keeps its own parser.
 *
 * Accepted script layout, 42 bytes:
 * OP_RETURN(1) + 4-byte LOKAD push(5) + direct envelope push(1) + envelope(35).
 * Envelope: version(1) || event_type(1) || author_input_index(1) || target_txid(32).
 * target_txid is display order. It is not reversed and it is not UTF-8.
 * A 42-byte script is a format witness. It is not evidence of a transfer.
 */

export const TIP_SCRIPT_LENGTH = 42;
export const TIP_ENVELOPE_LENGTH = 35;
export const SOCIAL_VERSION = 0x02;
export const EVENT_TIP = 0x05;

const LOKAD = Uint8Array.from([0x54, 0x4d, 0x4d, 0x00]);
const S08_HEX =
  "6a04544d4d0023020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

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

export function encodeTipEnvelope(fields) {
  const version = requireByte(fields.version, "version");
  const eventType = requireByte(fields.eventType, "event_type");
  const authorInputIndex = requireByte(fields.authorInputIndex, "author_input_index");
  const target = requireTxid(fields.targetTxidHex);
  const envelope = new Uint8Array(TIP_ENVELOPE_LENGTH);
  envelope[0] = version;
  envelope[1] = eventType;
  envelope[2] = authorInputIndex;
  envelope.set(target, 3);
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
 * A 35-byte envelope uses a direct push (opcode 0x23), never PUSHDATA1.
 */
export function encodeTipScript(fields) {
  const envelope = encodeTipEnvelope(fields);
  if (envelope.length !== TIP_ENVELOPE_LENGTH) {
    fail("TIP envelope must be 35 bytes.");
  }
  const script = concat([
    Uint8Array.from([0x6a, LOKAD.length]),
    LOKAD,
    Uint8Array.from([envelope.length]),
    envelope
  ]);
  if (script.length !== TIP_SCRIPT_LENGTH) {
    fail(`TIP script length ${script.length} is not 42.`);
  }
  return script;
}

/**
 * Encoder B. Writes the same 42 bytes at fixed offsets.
 * It does not share the concatenation loop with encoder A.
 */
export function encodeTipScriptFixed(fields) {
  const envelope = encodeTipEnvelope(fields);
  const script = new Uint8Array(TIP_SCRIPT_LENGTH);
  script[0] = 0x6a;
  script[1] = 0x04;
  script.set(LOKAD, 2);
  script[6] = 0x23;
  script.set(envelope, 7);
  return script;
}

/**
 * Deliberately non-minimal framing. PUSHDATA1 of a 35-byte payload is
 * legal script but not a minimal push. Callers use it as a negative.
 */
export function encodeNonminimalTipScript(fields) {
  const envelope = encodeTipEnvelope(fields);
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
    targetTxid: bytesToHex(envelope.slice(3, 35))
  };
}

/**
 * TIP_XEC decoder. It accepts only version 0x02 and event 0x05.
 * Any other byte is a rejection. A v1 POST is not a tip.
 */
export function decodeTipScript(script) {
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
  if (envelope.data.length !== TIP_ENVELOPE_LENGTH) {
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
  if (fields.eventType !== EVENT_TIP) {
    return { ...framed, errorCode: "UNSUPPORTED_EVENT" };
  }
  return {
    ok: true,
    framed: true,
    errorCode: null,
    scriptLength,
    pushCount,
    eventName: "TIP_XEC",
    ...fields
  };
}

export function encodersAgree(fields) {
  return bytesToHex(encodeTipScript(fields)) === bytesToHex(encodeTipScriptFixed(fields));
}

/**
 * M1.7.2 S-08. Format only. The fixed target bytes are not a payment.
 */
export function s08TipScriptHex() {
  const script = encodeTipScript({
    version: SOCIAL_VERSION,
    eventType: EVENT_TIP,
    authorInputIndex: 0x01,
    targetTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
  });
  const hex = bytesToHex(script);
  if (hex !== S08_HEX || bytesToHex(encodeTipScriptFixed({
    version: SOCIAL_VERSION,
    eventType: EVENT_TIP,
    authorInputIndex: 0x01,
    targetTxidHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
  })) !== S08_HEX) {
    fail("S-08 encoders diverged from the published script.");
  }
  return hex;
}
