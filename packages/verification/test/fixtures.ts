import type { NormalizedInput, NormalizedOpReturnOutput, NormalizedTransaction } from "@tonalli-memo/chronik";
import { MEMPOOL_TXID, PREV_TXID, TXID, utf8Bytes } from "./helpers.js";

export const validMemoPush = (): Uint8Array => utf8Bytes("TM0|p|xa|signal now lives on eCash");

export const opReturnOutput = (
  outputIndex: number,
  pushes: readonly Uint8Array[],
  parseStatus: "parsed" | "malformed" = "parsed"
): NormalizedOpReturnOutput => ({
  outputIndex,
  valueSats: 0n,
  outputScriptHex: "6a",
  pushes,
  parseStatus,
  ...(parseStatus === "malformed" ? { parseErrorCode: "MALFORMED_OP_RETURN" as const } : {})
});

export const input = (index: number, address: string | null): NormalizedInput => ({
  index,
  prevOut: {
    txid: PREV_TXID,
    outIdx: index
  },
  inputScriptHex: "00",
  outputScriptHex: address === null ? null : "76a914000000000000000000000000000000000000000088ac",
  address
});

export const normalizedTx = (overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
  txid: TXID,
  isCoinbase: false,
  inputs: [input(0, "ecash:qptestaddress0000000000000000000000000000000")],
  inputAddresses: ["ecash:qptestaddress0000000000000000000000000000000"],
  opReturnOutputs: [opReturnOutput(0, [validMemoPush()])],
  blockHeight: 900001,
  blockHash: "3333333333333333333333333333333333333333333333333333333333333333",
  blockTimestamp: 1710000000,
  firstSeenAt: 1709999900,
  isFinal: true,
  rawResponse: { fixture: true },
  ...overrides
});

export const mempoolTx = (overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction =>
  normalizedTx({
    txid: MEMPOOL_TXID,
    blockHeight: null,
    blockHash: null,
    blockTimestamp: null,
    firstSeenAt: null,
    isFinal: false,
    ...overrides
  });
