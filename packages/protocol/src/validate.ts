import {
  DEFAULT_MAX_BYTES,
  KNOWN_MEMO_TYPES,
  PROFILE_CODES,
  RESERVED_MEMO_TYPES
} from "./constants.js";
import { decodeMemo } from "./decode.js";
import { memoError } from "./errors.js";
import type { DecodedMemo, KnownMemoType, ProfileCode, ValidatedMemo, ValidationOptions } from "./types.js";

const LOWERCASE_ASCII_LETTER = /^[a-z]$/;
const LOWERCASE_ASCII_CODE = /^[a-z]+$/;

export function validateMemo(
  decodedOrInput: DecodedMemo | string | Uint8Array,
  options: ValidationOptions = {}
): ValidatedMemo {
  const decoded = typeof decodedOrInput === "string" || decodedOrInput instanceof Uint8Array
    ? decodeMemo(decodedOrInput)
    : decodedOrInput;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const knownProfiles = options.knownProfiles ?? PROFILE_CODES;

  if (!Number.isInteger(maxBytes) || maxBytes < 0) {
    throw memoError("INVALID_INPUT", "maxBytes must be a non-negative integer.");
  }

  if (!LOWERCASE_ASCII_LETTER.test(decoded.type)) {
    throw memoError("INVALID_TYPE_FORMAT", "Memo type must be exactly one lowercase ASCII letter.");
  }

  if (!includesString(KNOWN_MEMO_TYPES, decoded.type)) {
    throw memoError("UNKNOWN_TYPE", `Unknown Tonalli Memo type: ${decoded.type}.`);
  }

  if (!options.allowReservedTypes && includesString(RESERVED_MEMO_TYPES, decoded.type)) {
    throw memoError("RESERVED_TYPE", `Tonalli Memo type is reserved: ${decoded.type}.`);
  }

  if (!LOWERCASE_ASCII_CODE.test(decoded.profile)) {
    throw memoError("INVALID_PROFILE_FORMAT", "Memo profile must be a lowercase ASCII code.");
  }

  if (!includesString(knownProfiles, decoded.profile)) {
    throw memoError("UNKNOWN_PROFILE", `Unknown Tonalli Memo profile: ${decoded.profile}.`);
  }

  if (decoded.payload.length === 0) {
    throw memoError("EMPTY_PAYLOAD", "Memo payload must not be empty.");
  }

  if (decoded.byteLength > maxBytes) {
    throw memoError("PAYLOAD_TOO_LARGE", `Memo envelope is ${decoded.byteLength} UTF-8 bytes; maximum is ${maxBytes}.`);
  }

  return {
    ...decoded,
    type: decoded.type as KnownMemoType,
    profile: decoded.profile as ProfileCode
  };
}

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value);
}
