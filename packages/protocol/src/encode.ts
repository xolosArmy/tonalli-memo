import { memoError } from "./errors.js";
import { decodeMemo } from "./decode.js";
import { validateMemo } from "./validate.js";
import type { EncodeMemoInput, EncodeOptions } from "./types.js";

export function encodeMemo(input: EncodeMemoInput, options: EncodeOptions = {}): string {
  if (typeof input.type !== "string" || typeof input.profile !== "string" || typeof input.payload !== "string") {
    throw memoError("INVALID_INPUT", "Tonalli Memo encode input fields must be strings.");
  }

  const envelope = `TM0|${input.type}|${input.profile}|${input.payload}`;
  validateMemo(decodeMemo(envelope), options);
  return envelope;
}
