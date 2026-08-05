export interface Tm1AuthorshipReadModel {
  readonly publicKeyHashHex: string;
  readonly sighashByte: 0x41 | 0xc1;
  readonly trustModel: "trusted-chronik";
}

const EXPECTED_KEYS = [
  "publicKeyHashHex",
  "publicKeyHex",
  "sighashByte",
  "signatureWithHashTypeHex",
  "trustModel"
] as const;

const HASH160_PATTERN = /^[0-9a-f]{40}$/u;
const COMPRESSED_PUBLIC_KEY_PATTERN = /^(?:02|03)[0-9a-f]{64}$/u;
const UNCOMPRESSED_PUBLIC_KEY_PATTERN = /^04[0-9a-f]{128}$/u;
const HEX_BYTES_PATTERN = /^(?:[0-9a-f]{2})+$/u;

export class InvalidStoredTm1AuthorshipError extends Error {
  constructor() {
    super("Stored TM1 authorship diagnostics are invalid.");
    this.name = "InvalidStoredTm1AuthorshipError";
  }
}

/**
 * Decodes the exact persisted VERIFIED_TM1 diagnostics shape.
 *
 * Sensitive public-key and signature material is validated for structural
 * consistency but deliberately omitted from the returned public read model.
 */
export function decodeStoredTm1Authorship(value: unknown): Tm1AuthorshipReadModel {
  if (!isRecord(value) || !hasExactKeys(value, EXPECTED_KEYS)) {
    throw new InvalidStoredTm1AuthorshipError();
  }

  if (
    typeof value.publicKeyHashHex !== "string" ||
    !HASH160_PATTERN.test(value.publicKeyHashHex) ||
    typeof value.publicKeyHex !== "string" ||
    !isStructurallyValidPublicKeyHex(value.publicKeyHex) ||
    typeof value.signatureWithHashTypeHex !== "string" ||
    value.signatureWithHashTypeHex.length < 4 ||
    !HEX_BYTES_PATTERN.test(value.signatureWithHashTypeHex) ||
    (value.sighashByte !== 0x41 && value.sighashByte !== 0xc1) ||
    value.trustModel !== "trusted-chronik"
  ) {
    throw new InvalidStoredTm1AuthorshipError();
  }

  const expectedSuffix = value.sighashByte === 0x41 ? "41" : "c1";
  if (!value.signatureWithHashTypeHex.endsWith(expectedSuffix)) {
    throw new InvalidStoredTm1AuthorshipError();
  }

  return {
    publicKeyHashHex: value.publicKeyHashHex,
    sighashByte: value.sighashByte,
    trustModel: value.trustModel
  };
}

function isStructurallyValidPublicKeyHex(value: string): boolean {
  return COMPRESSED_PUBLIC_KEY_PATTERN.test(value) || UNCOMPRESSED_PUBLIC_KEY_PATTERN.test(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
