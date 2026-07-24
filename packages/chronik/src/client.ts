import { ChronikClient } from "chronik-client";

import { invalidOptions, mapChronikTxError } from "./errors.js";
import { normalizeTransaction } from "./normalize.js";
import { validateTxid } from "./txid.js";

import type { ChronikAdapterOptions, ChronikTransactionAdapter, ChronikTxSource, NormalizedTransaction } from "./types.js";

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
}

export const createChronikTransactionAdapter = (options: ChronikAdapterOptions): ChronikTransactionAdapter =>
  new ChronikTransactionClient(options);
