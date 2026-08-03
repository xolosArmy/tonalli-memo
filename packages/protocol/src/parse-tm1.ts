import { Tm1ProtocolError } from "./tm1-errors.js";
import type {
  ParsedTm1Post,
  ParseTm1OutputInput
} from "./tm1-types.js";

const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;

const TM1_VERSION = 0x01;
const TM1_POST_EVENT_TYPE = 0x01;

const TM1_LOKAD_ID = Uint8Array.of(0x54, 0x4d, 0x4d, 0x00);

const MAX_TM1_SCRIPT_BYTES = 223;
const MAX_TM1_ENVELOPE_BYTES = 215;
const MAX_TM1_EVENT_DATA_BYTES = 212;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

interface DecodedDataPush {
  readonly data: Uint8Array;
  readonly nextOffset: number;
  readonly isMinimal: boolean;
}

class PushDecodeFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushDecodeFailure";
  }
}

function requiredByte(bytes: Uint8Array, index: number): number {
  const value = bytes[index];

  if (value === undefined) {
    throw new PushDecodeFailure("Unexpected end of script.");
  }

  return value;
}

/**
 * Decodes one script data push without enforcing minimality.
 *
 * This is intentional: TM1 candidacy depends on the first successfully
 * decoded push matching the LOKAD ID. A non-minimal marker push therefore
 * remains recognizable as a TM1 candidate and is rejected later as
 * INVALID_FORMAT.
 */
function decodeDataPush(
  script: Uint8Array,
  offset: number
): DecodedDataPush {
  const opcode = requiredByte(script, offset);

  let headerLength: number;
  let dataLength: number;
  let isMinimal: boolean;

  if (opcode >= 0x01 && opcode <= 0x4b) {
    headerLength = 1;
    dataLength = opcode;
    isMinimal = true;
  } else if (opcode === OP_PUSHDATA1) {
    headerLength = 2;
    dataLength = requiredByte(script, offset + 1);
    isMinimal = dataLength >= 0x4c;
  } else if (opcode === OP_PUSHDATA2) {
    headerLength = 3;
    dataLength =
      requiredByte(script, offset + 1) +
      requiredByte(script, offset + 2) * 0x100;
    isMinimal = dataLength >= 0x100;
  } else if (opcode === OP_PUSHDATA4) {
    headerLength = 5;
    dataLength =
      requiredByte(script, offset + 1) +
      requiredByte(script, offset + 2) * 0x100 +
      requiredByte(script, offset + 3) * 0x10000 +
      requiredByte(script, offset + 4) * 0x1000000;
    isMinimal = dataLength >= 0x10000;
  } else {
    throw new PushDecodeFailure(
      `Opcode 0x${opcode.toString(16).padStart(2, "0")} is not a data push.`
    );
  }

  const dataStart = offset + headerLength;
  const dataEnd = dataStart + dataLength;

  if (!Number.isSafeInteger(dataEnd) || dataEnd > script.length) {
    throw new PushDecodeFailure("Declared push length exceeds script bytes.");
  }

  return {
    data: script.subarray(dataStart, dataEnd),
    nextOffset: dataEnd,
    isMinimal
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Returns true when the script begins with OP_RETURN and its first
 * successfully decoded data push equals the TM1 Draft 0.2 LOKAD ID.
 *
 * Remaining script bytes are intentionally ignored. Once the marker matches,
 * malformed envelope bytes do not remove TM1 candidacy.
 */
export function isTm1CandidateScript(script: Uint8Array): boolean {
  if (script[0] !== OP_RETURN) {
    return false;
  }

  try {
    const firstPush = decodeDataPush(script, 1);
    return bytesEqual(firstPush.data, TM1_LOKAD_ID);
  } catch (error: unknown) {
    if (error instanceof PushDecodeFailure) {
      return false;
    }

    throw error;
  }
}

/**
 * Parses and structurally validates one TM1 Draft 0.2 transaction output.
 *
 * Error precedence:
 *
 * 1. Outputs whose first decoded push is not the TM1 marker fail with
 *    INVALID_MARKER.
 * 2. Once the marker matches, non-minimal pushes and malformed structure fail
 *    with INVALID_FORMAT.
 * 3. A recognized TM1 output with a non-zero value fails with INVALID_FORMAT.
 * 4. A recognized script exceeding 223 bytes fails with PAYLOAD_TOO_LARGE.
 */
export function parseTm1Output(
  input: ParseTm1OutputInput
): ParsedTm1Post {
  const { script } = input;

  if (script[0] !== OP_RETURN) {
    throw new Tm1ProtocolError(
      "INVALID_MARKER",
      "TM1 script must begin with OP_RETURN and a decodable marker push."
    );
  }

  let firstPush: DecodedDataPush;

  try {
    firstPush = decodeDataPush(script, 1);
  } catch (error: unknown) {
    if (error instanceof PushDecodeFailure) {
      throw new Tm1ProtocolError(
        "INVALID_MARKER",
        "TM1 marker push could not be decoded."
      );
    }

    throw error;
  }

  if (!bytesEqual(firstPush.data, TM1_LOKAD_ID)) {
    throw new Tm1ProtocolError(
      "INVALID_MARKER",
      "First data push does not equal the TM1 LOKAD ID."
    );
  }

  if (!firstPush.isMinimal) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "TM1 LOKAD ID push must use minimal script encoding."
    );
  }

  if (input.valueSats !== 0n) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "TM1 transaction output value must be exactly zero."
    );
  }

  if (script.length > MAX_TM1_SCRIPT_BYTES) {
    throw new Tm1ProtocolError(
      "PAYLOAD_TOO_LARGE",
      "TM1 locking script exceeds 223 bytes."
    );
  }

  let envelopePush: DecodedDataPush;

  try {
    envelopePush = decodeDataPush(script, firstPush.nextOffset);
  } catch (error: unknown) {
    if (error instanceof PushDecodeFailure) {
      throw new Tm1ProtocolError(
        "INVALID_FORMAT",
        "TM1 envelope push is missing, truncated or not a data push."
      );
    }

    throw error;
  }

  if (!envelopePush.isMinimal) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "TM1 envelope push must use minimal script encoding."
    );
  }

  if (envelopePush.nextOffset !== script.length) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "TM1 script must contain exactly two data pushes."
    );
  }

  const envelope = envelopePush.data;

  if (envelope.length < 3) {
    throw new Tm1ProtocolError(
      "INVALID_FORMAT",
      "TM1 envelope must contain version, event type and author input index."
    );
  }

  if (envelope.length === 3) {
    throw new Tm1ProtocolError(
      "EMPTY_EVENT_DATA",
      "TM1 event_data must contain at least one byte."
    );
  }

  if (envelope.length > MAX_TM1_ENVELOPE_BYTES) {
    throw new Tm1ProtocolError(
      "PAYLOAD_TOO_LARGE",
      "TM1 envelope exceeds 215 bytes."
    );
  }

  const version = requiredByte(envelope, 0);

  if (version !== TM1_VERSION) {
    throw new Tm1ProtocolError(
      "UNSUPPORTED_VERSION",
      `Unsupported TM1 version: 0x${version
        .toString(16)
        .padStart(2, "0")}.`
    );
  }

  const eventTypeCode = requiredByte(envelope, 1);

  if (eventTypeCode !== TM1_POST_EVENT_TYPE) {
    throw new Tm1ProtocolError(
      "UNSUPPORTED_EVENT_TYPE",
      `Unsupported TM1 event type: 0x${eventTypeCode
        .toString(16)
        .padStart(2, "0")}.`
    );
  }

  const authorInputIndex = requiredByte(envelope, 2);
  const eventDataView = envelope.subarray(3);

  if (eventDataView.length > MAX_TM1_EVENT_DATA_BYTES) {
    throw new Tm1ProtocolError(
      "PAYLOAD_TOO_LARGE",
      "TM1 event_data exceeds 212 bytes."
    );
  }

  const eventDataBytes = new Uint8Array(eventDataView);

  let eventData: string;

  try {
    eventData = UTF8_DECODER.decode(eventDataBytes);
  } catch {
    throw new Tm1ProtocolError(
      "INVALID_UTF8",
      "TM1 event_data must be valid UTF-8."
    );
  }

  return {
    protocol: "TM1",
    version: 1,
    eventType: "POST",
    eventTypeCode: 1,
    authorInputIndex,
    eventData,
    eventDataBytes,
    eventDataByteLength: eventDataBytes.length,
    scriptByteLength: script.length
  };
}
