import { invalidTxid } from "./errors.js";

const TXID_PATTERN = /^[0-9a-f]{64}$/u;

export const isCanonicalTxid = (value: unknown): value is string =>
  typeof value === "string" && TXID_PATTERN.test(value);

export const validateTxid = (txid: string): string => {
  if (!isCanonicalTxid(txid)) {
    throw invalidTxid(txid);
  }
  return txid;
};
