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
  if (!isRecord(value) || !hasValidStoredTm1AuthorshipKeys(value)) {
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

function hasValidStoredTm1AuthorshipKeys(value: Record<string, unknown>): boolean {
  const actualKeys = Object.keys(value);
  for (const expected of EXPECTED_KEYS) {
    if (!actualKeys.includes(expected)) {
      return false;
    }
  }
  for (const key of actualKeys) {
    if (key !== "attachment" && !EXPECTED_KEYS.includes(key as (typeof EXPECTED_KEYS)[number])) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
