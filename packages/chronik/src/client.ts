import { ChronikClient } from "chronik-client";

import { invalidChronikResponse, invalidOptions, mapChronikTxError } from "./errors.js";
import { normalizeTransaction } from "./normalize.js";
import { validateTxid } from "./txid.js";

import type { ChronikAdapterOptions, ChronikTransactionAdapter, ChronikTxSource, NormalizedTransaction, ScriptUtxos } from "./types.js";

const DEFAULT_ADDRESS_PREFIX = "ecash";
const ADDRESS_PREFIX_PATTERN = /^[a-z0-9-]+$/u;

class OfficialChronikTxSource implements ChronikTxSource {
  private readonly client: ChronikClient;

  constructor(urls: readonly string[]) {
    this.client = new ChronikClient([...urls]);
  }

  tx(txid: string): Promise<unknown> {
    return this.client.tx(txid);
  }

  async addressUtxos(address: string): Promise<unknown> {
    return this.client.address(address).utxos();
  }
}

const normalizeUrls = (urls: readonly string[] | undefined, hasInjectedSource: boolean): readonly string[] => {
  if (urls === undefined) {
    if (hasInjectedSource) {
      return [];
    }
    throw invalidOptions("At least one Chronik URL is required when no transaction source is supplied.");
  }

  if (urls.length === 0 && !hasInjectedSource) {
    throw invalidOptions("At least one Chronik URL is required when no transaction source is supplied.");
  }

  for (const url of urls) {
    if (typeof url !== "string" || url.length === 0) {
      throw invalidOptions("Chronik URLs must be non-empty strings.");
    }
    if (url.endsWith("/")) {
      throw invalidOptions("Chronik URLs must not end with a trailing slash.");
    }
  }

  return urls;
};

const normalizeAddressPrefix = (addressPrefix: string | undefined): string => {
  const prefix = addressPrefix ?? DEFAULT_ADDRESS_PREFIX;
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw invalidOptions("Address prefix must be a non-empty string.");
  }
  if (!ADDRESS_PREFIX_PATTERN.test(prefix)) {
    throw invalidOptions("Address prefix must contain only lowercase letters, digits or hyphens.");
  }
  return prefix;
};

export const isValidUtxoEntry = (utxo: unknown): boolean => {
  if (utxo === null || typeof utxo !== "object") {
    return false;
  }
  const u = utxo as Record<string, unknown>;
  if (u.outpoint === null || typeof u.outpoint !== "object") {
    return false;
  }
  const outpoint = u.outpoint as Record<string, unknown>;
  if (
    typeof outpoint.txid !== "string" ||
    typeof outpoint.outIdx !== "number" ||
    !Number.isSafeInteger(outpoint.outIdx) ||
    outpoint.outIdx < 0
  ) {
    return false;
  }
  if (u.token !== undefined) {
    if (u.token === null || typeof u.token !== "object") {
      return false;
    }
    const t = u.token as Record<string, unknown>;
    if (typeof t.tokenId !== "string" || t.tokenType === null || typeof t.tokenType !== "object") {
      return false;
    }
    const tokenType = t.tokenType as Record<string, unknown>;
    if (
      typeof tokenType.protocol !== "string" ||
      typeof tokenType.type !== "string" ||
      typeof tokenType.number !== "number"
    ) {
      return false;
    }
    if (typeof t.isMintBaton !== "boolean" || typeof t.atoms !== "bigint") {
      return false;
    }
  }
  return true;
};

export const isValidScriptUtxosResponse = (response: unknown): response is ScriptUtxos => {
  if (response === null || typeof response !== "object") {
    return false;
  }
  const candidate = response as Record<string, unknown>;
  if (!("utxos" in candidate) || !Array.isArray(candidate.utxos)) {
    return false;
  }
  return candidate.utxos.every(isValidUtxoEntry);
};

export class ChronikTransactionClient implements ChronikTransactionAdapter {
  private readonly source: ChronikTxSource;
  private readonly addressPrefix: string;

  constructor(options: ChronikAdapterOptions = {}) {
    const urls = normalizeUrls(options.urls, options.source !== undefined);
    this.source = options.source ?? new OfficialChronikTxSource(urls);
    this.addressPrefix = normalizeAddressPrefix(options.addressPrefix);
  }

  async getTransaction(txid: string): Promise<NormalizedTransaction> {
    const validatedTxid = validateTxid(txid);
    let rawResponse: unknown;
    try {
      rawResponse = await this.source.tx(validatedTxid);
    } catch (error) {
      throw mapChronikTxError(error, validatedTxid);
    }
    return normalizeTransaction(validatedTxid, rawResponse, { addressPrefix: this.addressPrefix });
  }

  async getAddressUtxos(address: string): Promise<ScriptUtxos> {
    if (typeof address !== "string" || address.length === 0) {
      throw new Error("Address must be a non-empty string.");
    }
    if (this.source.addressUtxos === undefined) {
      throw new Error("Chronik source does not support address UTXO queries.");
    }
    let rawResponse: unknown;
    try {
      rawResponse = await this.source.addressUtxos(address);
    } catch (error) {
      throw mapChronikTxError(error, address);
    }
    if (!isValidScriptUtxosResponse(rawResponse)) {
      throw invalidChronikResponse("Invalid UTXO response received from Chronik.", address);
    }
    return rawResponse;
  }
}

export const createChronikTransactionAdapter = (options: ChronikAdapterOptions): ChronikTransactionAdapter =>
  new ChronikTransactionClient(options);
