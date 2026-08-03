export const TM1_ERROR_CODES = [
  "INVALID_MARKER",
  "INVALID_FORMAT",
  "UNSUPPORTED_VERSION",
  "UNSUPPORTED_EVENT_TYPE",
  "INVALID_UTF8",
  "EMPTY_EVENT_DATA",
  "PAYLOAD_TOO_LARGE"
] as const;

export type Tm1ErrorCode = (typeof TM1_ERROR_CODES)[number];

const TM1_ERROR_CODE_SET: ReadonlySet<string> =
  new Set<string>(TM1_ERROR_CODES);

export function isTm1ErrorCode(value: unknown): value is Tm1ErrorCode {
  return typeof value === "string" && TM1_ERROR_CODE_SET.has(value);
}

export class Tm1ProtocolError extends Error {
  readonly code: Tm1ErrorCode;

  constructor(code: Tm1ErrorCode, message: string) {
    super(message);
    this.name = "Tm1ProtocolError";
    this.code = code;
  }
}

export function isTm1ProtocolError(
  error: unknown
): error is Tm1ProtocolError {
  return error instanceof Tm1ProtocolError;
}
