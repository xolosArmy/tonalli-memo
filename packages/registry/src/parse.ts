import { PROFILE_ALIASES, PROFILE_CODES, type ProfileCode } from "@tonalli-memo/protocol";
import { registryError } from "./errors.js";
import type { AuthorizedAddress, ProfileRegistryEntry, RegistryDocument } from "./types.js";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isProfileCode(code: string): code is ProfileCode {
  return (PROFILE_CODES as readonly string[]).includes(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidHeight(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateHeight(value: unknown, fieldName: string): number {
  if (!isValidHeight(value)) {
    throw registryError("INVALID_HEIGHT", `${fieldName} must be a non-negative safe integer.`);
  }

  return value;
}

function validateAddress(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw registryError("INVALID_ADDRESS", "Authorized address must be a non-empty string.");
  }

  if (!value.startsWith("ecash:") || value !== value.toLowerCase()) {
    throw registryError("INVALID_ADDRESS", "Authorized address must be lowercase canonical ecash: form.");
  }

  return value;
}

function parseAuthorizedAddress(input: unknown): AuthorizedAddress {
  if (!isPlainObject(input)) {
    throw registryError("INVALID_AUTHORIZED_ADDRESSES", "Authorized address entry must be an object.");
  }

  const address = validateAddress(input.address);
  const parsed: {
    address: string;
    validFromHeight?: number;
    validUntilHeight?: number;
    label?: string;
  } = { address };

  if ("validFromHeight" in input) {
    parsed.validFromHeight = validateHeight(input.validFromHeight, "validFromHeight");
  }

  if ("validUntilHeight" in input) {
    parsed.validUntilHeight = validateHeight(input.validUntilHeight, "validUntilHeight");
  }

  if (
    parsed.validFromHeight !== undefined &&
    parsed.validUntilHeight !== undefined &&
    parsed.validFromHeight > parsed.validUntilHeight
  ) {
    throw registryError("INVALID_HEIGHT_RANGE", "validFromHeight must be less than or equal to validUntilHeight.");
  }

  if ("label" in input) {
    if (!isNonEmptyString(input.label)) {
      throw registryError("INVALID_AUTHORIZED_ADDRESSES", "Address label must be a non-empty string.");
    }

    parsed.label = input.label;
  }

  return Object.freeze(parsed);
}

function parseEntry(code: ProfileCode, input: unknown): ProfileRegistryEntry {
  if (!isPlainObject(input)) {
    throw registryError("INVALID_REGISTRY", `Profile ${code} must be an object.`);
  }

  if (input.code !== code) {
    throw registryError("PROFILE_CODE_MISMATCH", `Profile key ${code} does not match entry code.`);
  }

  if (input.alias !== PROFILE_ALIASES[code]) {
    throw registryError("ALIAS_MISMATCH", `Profile ${code} alias does not match the protocol alias.`);
  }

  if (!isNonEmptyString(input.displayName)) {
    throw registryError("INVALID_DISPLAY_NAME", `Profile ${code} displayName must be a non-empty string.`);
  }

  if (!Array.isArray(input.authorizedAddresses)) {
    throw registryError("INVALID_AUTHORIZED_ADDRESSES", `Profile ${code} authorizedAddresses must be an array.`);
  }

  const seenAddresses = new Set<string>();
  const authorizedAddresses = input.authorizedAddresses.map((entry) => {
    const parsed = parseAuthorizedAddress(entry);

    if (seenAddresses.has(parsed.address)) {
      throw registryError("DUPLICATE_ADDRESS", `Profile ${code} contains a duplicate authorized address.`);
    }

    seenAddresses.add(parsed.address);
    return parsed;
  });

  const parsed: {
    code: ProfileCode;
    alias: string;
    displayName: string;
    avatarUrl?: string;
    authorizedAddresses: readonly AuthorizedAddress[];
  } = {
    code,
    alias: input.alias,
    displayName: input.displayName,
    authorizedAddresses: Object.freeze(authorizedAddresses)
  };

  if ("avatarUrl" in input) {
    if (!isNonEmptyString(input.avatarUrl)) {
      throw registryError("INVALID_REGISTRY", `Profile ${code} avatarUrl must be a non-empty string.`);
    }

    parsed.avatarUrl = input.avatarUrl;
  }

  return Object.freeze(parsed);
}

export function parseRegistry(input: unknown): RegistryDocument {
  if (!isPlainObject(input)) {
    throw registryError("INVALID_REGISTRY", "Registry document must be an object.");
  }

  if (input.schemaVersion !== 1) {
    throw registryError("UNSUPPORTED_SCHEMA_VERSION", "Registry schemaVersion must be 1.");
  }

  if (input.network !== "ecash-mainnet") {
    throw registryError("INVALID_NETWORK", "Registry network must be ecash-mainnet.");
  }

  if (!isPlainObject(input.profiles)) {
    throw registryError("INVALID_REGISTRY", "Registry profiles must be an object.");
  }

  for (const code of PROFILE_CODES) {
    if (!(code in input.profiles)) {
      throw registryError("MISSING_PROFILE", `Registry is missing required profile ${code}.`);
    }
  }

  for (const key of Object.keys(input.profiles)) {
    if (!isProfileCode(key)) {
      throw registryError("UNKNOWN_PROFILE", `Registry contains unknown profile ${key}.`);
    }
  }

  const profiles: Partial<Record<ProfileCode, ProfileRegistryEntry>> = {};
  for (const code of PROFILE_CODES) {
    profiles[code] = parseEntry(code, input.profiles[code]);
  }

  return Object.freeze({
    schemaVersion: 1,
    network: "ecash-mainnet",
    profiles: Object.freeze(profiles as Record<ProfileCode, ProfileRegistryEntry>)
  });
}
