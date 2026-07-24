import { Address } from "ecash-lib";

const LOWER_HEX_PATTERN = /^(?:[0-9a-f]{2})*$/u;

export const isLowercaseEvenHex = (value: unknown): value is string =>
  typeof value === "string" && LOWER_HEX_PATTERN.test(value);

export const isCanonicalHashHex = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

export const deriveAddressFromOutputScriptHex = (outputScriptHex: string, addressPrefix: string): string | null => {
  try {
    return Address.fromScriptHex(outputScriptHex, addressPrefix).toString();
  } catch {
    return null;
  }
};
