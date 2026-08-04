export interface NormalizedOutPoint {
  txid: string;
  outIdx: number;
}

export interface NormalizedInput {
  index: number;
  prevOut: NormalizedOutPoint;
  inputScriptHex: string;
  outputScriptHex: string | null;
  address: string | null;
}

export type OpReturnParseStatus = "parsed" | "malformed";

export interface NormalizedOpReturnOutput {
  outputIndex: number;
  valueSats: bigint;
  outputScriptHex: string;
  pushes: readonly Uint8Array[];
  parseStatus: OpReturnParseStatus;
  parseErrorCode?: "MALFORMED_OP_RETURN";
}

export interface NormalizedTransaction {
  txid: string;
  isCoinbase: boolean;
  inputs: readonly NormalizedInput[];

  /**
   * All non-null decoded input addresses in input order.
   * Preserve duplicates. Do not silently deduplicate.
   */
  inputAddresses: readonly string[];

  opReturnOutputs: readonly NormalizedOpReturnOutput[];

  blockHeight: number | null;
  blockHash: string | null;
  blockTimestamp: number | null;

  /**
   * null when Chronik returns timeFirstSeen = 0 or no usable value.
   */
  firstSeenAt: number | null;

  isFinal: boolean;

  /**
   * Retained for technical inspection only.
   * May contain bigint values and is not guaranteed to be JSON-serializable.
   * Consumers must not treat this as a stable storage schema.
   */
  rawResponse: unknown;
}

export interface ChronikTxSource {
  tx(txid: string): Promise<unknown>;
}

export interface ChronikAdapterOptions {
  urls?: readonly string[];
  source?: ChronikTxSource;
  addressPrefix?: string;
}

export interface ChronikTransactionAdapter {
  getTransaction(txid: string): Promise<NormalizedTransaction>;
}
