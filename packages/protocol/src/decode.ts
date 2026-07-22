import { MEMO_MARKER, MEMO_VERSION } from "./constants.js";
import { utf8ByteLength } from "./byte-length.js";
import { memoError } from "./errors.js";
import type { DecodedMemo } from "./types.js";

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function decodeMemo(input: string | Uint8Array): DecodedMemo {
  const envelope = decodeInput(input);
  const first = envelope.indexOf("|");
  const second = first === -1 ? -1 : envelope.indexOf("|", first + 1);
  const third = second === -1 ? -1 : envelope.indexOf("|", second + 1);

  if (first === -1 || second === -1 || third === -1) {
    throw memoError("INVALID_FORMAT", "Tonalli Memo envelope must contain marker, type, profile and payload fields.");
  }

  const marker = envelope.slice(0, first);

  if (marker !== MEMO_MARKER) {
    if (/^TM\d+$/.test(marker)) {
      throw memoError("UNSUPPORTED_VERSION", `Unsupported Tonalli Memo protocol marker: ${marker}.`);
    }

    throw memoError("INVALID_MARKER", "Tonalli Memo marker must be exactly TM0.");
  }

  return {
    marker: MEMO_MARKER,
    version: MEMO_VERSION,
    type: envelope.slice(first + 1, second),
    profile: envelope.slice(second + 1, third),
    payload: envelope.slice(third + 1),
    byteLength: utf8ByteLength(envelope)
  };
}

function decodeInput(input: string | Uint8Array): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof Uint8Array) {
    try {
      return textDecoder.decode(input);
    } catch {
      throw memoError("INVALID_UTF8", "Tonalli Memo envelope bytes must be valid UTF-8.");
    }
  }

  throw memoError("INVALID_INPUT", "Tonalli Memo input must be a string or Uint8Array.");
}
