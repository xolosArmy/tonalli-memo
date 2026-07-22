export const MEMO_ERROR_CODES = [
  "INVALID_INPUT",
  "INVALID_UTF8",
  "INVALID_FORMAT",
  "INVALID_MARKER",
  "UNSUPPORTED_VERSION",
  "INVALID_TYPE_FORMAT",
  "UNKNOWN_TYPE",
  "RESERVED_TYPE",
  "INVALID_PROFILE_FORMAT",
  "UNKNOWN_PROFILE",
  "EMPTY_PAYLOAD",
  "PAYLOAD_TOO_LARGE"
] as const;

export type MemoErrorCode = (typeof MEMO_ERROR_CODES)[number];

export class MemoProtocolError extends Error {
  readonly code: MemoErrorCode;

  constructor(code: MemoErrorCode, message: string) {
    super(message);
    this.name = "MemoProtocolError";
    this.code = code;
  }
}

export function memoError(code: MemoErrorCode, message: string): MemoProtocolError {
  return new MemoProtocolError(code, message);
}

export function isMemoProtocolError(error: unknown): error is MemoProtocolError {
  return error instanceof MemoProtocolError;
}
