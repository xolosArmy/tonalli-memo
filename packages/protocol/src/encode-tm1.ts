import {
  INTERNAL_TM1_LOKAD_ID,
  MAX_TM1_ENVELOPE_BYTES,
  MAX_TM1_EVENT_DATA_BYTES,
  MAX_TM1_SCRIPT_BYTES,
  OP_PUSHDATA1,
  OP_RETURN,
  TM1_POST_EVENT_TYPE,
  TM1_VERSION
} from "./tm1-constants.js";
import { Tm1ProtocolError } from "./tm1-errors.js";
import type { EncodedTm1Post, EncodeTm1PostInput } from "./tm1-types.js";
import { parseTm1Output } from "./parse-tm1.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_ENCODER = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index]!.toString(16).padStart(2, "0");
  }
  return hex;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function isWellFormedString(value: string): boolean {
  const candidate = value as unknown as { isWellFormed?: () => boolean };
  if (typeof candidate.isWellFormed === "function") {
    return candidate.isWellFormed();
  }
  return !/(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(value);
}

function encodeMinimalPush(data: Uint8Array): Uint8Array {
  const length = data.length;
  if (length <= 75) {
    const push = new Uint8Array(1 + length);
    push[0] = length;
    push.set(data, 1);
    return push;
  }
  if (length <= 255) {
    const push = new Uint8Array(2 + length);
    push[0] = OP_PUSHDATA1;
    push[1] = length;
    push.set(data, 2);
    return push;
  }
  throw new Tm1ProtocolError(
    "PAYLOAD_TOO_LARGE",
    `Push data length ${length} exceeds single-byte length limit.`
  );
}

/**
 * Encodes a canonical TM1 Draft 0.2 POST output script with round-trip verification.
 *
 * Requirements:
 * - authorInputIndex: integer between 0 and 255 (defaults to 0).
 * - eventData: UTF-8 string or Uint8Array between 1 and 212 bytes.
 * - envelope: [version (1 byte), eventType (1 byte), authorInputIndex (1 byte), eventData (1..212 bytes)].
 * - script: OP_RETURN (0x6a) + push(TM1_LOKAD_ID) + push(envelope). Total length <= 223 bytes.
 */
export function encodeTm1Post(input: EncodeTm1PostInput): EncodedTm1Post {
  const authorInputIndex = input.authorInputIndex ?? 0;
  if (
    !Number.isSafeInteger(authorInputIndex) ||
    authorInputIndex < 0 ||
    authorInputIndex > 255
  ) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      `Author input index must be an integer between 0 and 255. Received: ${authorInputIndex}`
    );
  }

  let eventDataBytes: Uint8Array;
  let eventDataString: string;

  if (typeof input.eventData === "string") {
    if (!isWellFormedString(input.eventData)) {
      throw new Tm1ProtocolError(
        "INVALID_UTF8",
        "TM1 event_data string must be well-formed UTF-16 without unpaired surrogates."
      );
    }
    eventDataString = input.eventData;
    eventDataBytes = UTF8_ENCODER.encode(input.eventData);
    let recoveredString: string;
    try {
      recoveredString = UTF8_DECODER.decode(eventDataBytes);
    } catch {
      throw new Tm1ProtocolError(
        "INVALID_UTF8",
        "TM1 event_data cannot be encoded to valid UTF-8."
      );
    }
    if (recoveredString !== eventDataString) {
      throw new Tm1ProtocolError(
        "INVALID_UTF8",
        "TM1 event_data string cannot round-trip through UTF-8."
      );
    }
  } else if (input.eventData instanceof Uint8Array) {
    try {
      eventDataString = UTF8_DECODER.decode(input.eventData);
    } catch {
      throw new Tm1ProtocolError(
        "INVALID_UTF8",
        "TM1 event_data must be valid UTF-8."
      );
    }
    eventDataBytes = new Uint8Array(input.eventData);
    const reencoded = UTF8_ENCODER.encode(eventDataString);
    if (!bytesEqual(reencoded, eventDataBytes)) {
      throw new Tm1ProtocolError(
        "INVALID_UTF8",
        "TM1 event_data bytes contain invalid UTF-8 sequences."
      );
    }
  } else {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "TM1 event_data must be a string or Uint8Array."
    );
  }

  if (eventDataBytes.length === 0) {
    throw new Tm1ProtocolError(
      "EMPTY_EVENT_DATA",
      "TM1 event_data must contain at least one byte."
    );
  }

  if (eventDataBytes.length > MAX_TM1_EVENT_DATA_BYTES) {
    throw new Tm1ProtocolError(
      "PAYLOAD_TOO_LARGE",
      `TM1 event_data length ${eventDataBytes.length} exceeds maximum allowed of ${MAX_TM1_EVENT_DATA_BYTES} bytes.`
    );
  }

  const envelope = new Uint8Array(3 + eventDataBytes.length);
  envelope[0] = TM1_VERSION;
  envelope[1] = TM1_POST_EVENT_TYPE;
  envelope[2] = authorInputIndex;
  envelope.set(eventDataBytes, 3);

  if (envelope.length > MAX_TM1_ENVELOPE_BYTES) {
    throw new Tm1ProtocolError(
      "PAYLOAD_TOO_LARGE",
      `TM1 envelope length ${envelope.length} exceeds maximum allowed of ${MAX_TM1_ENVELOPE_BYTES} bytes.`
    );
  }

  const pushLokad = encodeMinimalPush(INTERNAL_TM1_LOKAD_ID);
  const pushEnvelope = encodeMinimalPush(envelope);

  const script = new Uint8Array(1 + pushLokad.length + pushEnvelope.length);
  script[0] = OP_RETURN;
  script.set(pushLokad, 1);
  script.set(pushEnvelope, 1 + pushLokad.length);

  if (script.length > MAX_TM1_SCRIPT_BYTES) {
    throw new Tm1ProtocolError(
      "PAYLOAD_TOO_LARGE",
      `TM1 script length ${script.length} exceeds maximum allowed of ${MAX_TM1_SCRIPT_BYTES} bytes.`
    );
  }

  // Canonical round-trip verification:
  const parsed = parseTm1Output({ valueSats: 0n, script });
  if (
    parsed.version !== TM1_VERSION ||
    parsed.eventType !== "POST" ||
    parsed.authorInputIndex !== authorInputIndex ||
    parsed.eventData !== eventDataString ||
    !bytesEqual(parsed.eventDataBytes, eventDataBytes)
  ) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "Encoded TM1 script failed round-trip verification."
    );
  }

  return Object.freeze({
    protocol: "TM1",
    version: 1,
    eventType: "POST",
    eventTypeCode: 1,
    authorInputIndex,
    eventData: eventDataString,
    eventDataBytes: new Uint8Array(eventDataBytes),
    eventDataByteLength: eventDataBytes.length,
    envelope: new Uint8Array(envelope),
    envelopeHex: bytesToHex(envelope),
    envelopeByteLength: envelope.length,
    script: new Uint8Array(script),
    scriptHex: bytesToHex(script),
    scriptByteLength: script.length
  });
}
