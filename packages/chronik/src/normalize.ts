import { invalidChronikResponse } from "./errors.js";
import { normalizeOpReturnOutput, isOpReturnScriptHex } from "./op-return.js";
import { deriveAddressFromOutputScriptHex, isCanonicalHashHex, isLowercaseEvenHex } from "./scripts.js";
import { isCanonicalTxid } from "./txid.js";

import type { NormalizedInput, NormalizedOpReturnOutput, NormalizedTransaction } from "./types.js";

interface NormalizedTransactionOptions {
  addressPrefix?: string;
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_ADDRESS_PREFIX = "ecash";

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null;

const requireRecord = (value: unknown, txid: string, field: string): UnknownRecord => {
  if (!isRecord(value)) {
    throw invalidChronikResponse(`Chronik response field ${field} must be an object.`, txid);
  }
  return value;
};

const requireBoolean = (value: unknown, txid: string, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw invalidChronikResponse(`Chronik response field ${field} must be a boolean.`, txid);
  }
  return value;
};

const requireSafeNonNegativeInteger = (value: unknown, txid: string, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidChronikResponse(`Chronik response field ${field} must be a non-negative safe integer.`, txid);
  }
  return value;
};

const requireLowercaseScriptHex = (value: unknown, txid: string, field: string): string => {
  if (!isLowercaseEvenHex(value)) {
    throw invalidChronikResponse(`Chronik response field ${field} must be lowercase even-length hexadecimal.`, txid);
  }
  return value;
};

const requireCanonicalTxid = (value: unknown, txid: string, field: string): string => {
  if (!isCanonicalTxid(value)) {
    throw invalidChronikResponse(`Chronik response field ${field} must be a canonical transaction ID.`, txid);
  }
  return value;
};

const requireCanonicalBlockHash = (value: unknown, txid: string, field: string): string => {
  if (!isCanonicalHashHex(value)) {
    throw invalidChronikResponse(`Chronik response field ${field} must be a canonical block hash.`, txid);
  }
  return value;
};

const normalizeInput = (
  input: unknown,
  index: number,
  requestedTxid: string,
  isCoinbase: boolean,
  addressPrefix: string
): NormalizedInput => {
  const inputRecord = requireRecord(input, requestedTxid, `inputs[${index}]`);
  const prevOut = requireRecord(inputRecord.prevOut, requestedTxid, `inputs[${index}].prevOut`);
  const prevOutTxid = requireCanonicalTxid(prevOut.txid, requestedTxid, `inputs[${index}].prevOut.txid`);
  const outIdx = requireSafeNonNegativeInteger(prevOut.outIdx, requestedTxid, `inputs[${index}].prevOut.outIdx`);
  const inputScriptHex = requireLowercaseScriptHex(inputRecord.inputScript, requestedTxid, `inputs[${index}].inputScript`);

  if (isCoinbase || inputRecord.outputScript === undefined) {
    return {
      index,
      prevOut: { txid: prevOutTxid, outIdx },
      inputScriptHex,
      outputScriptHex: null,
      address: null
    };
  }

  const outputScriptHex = requireLowercaseScriptHex(inputRecord.outputScript, requestedTxid, `inputs[${index}].outputScript`);
  return {
    index,
    prevOut: { txid: prevOutTxid, outIdx },
    inputScriptHex,
    outputScriptHex,
    address: deriveAddressFromOutputScriptHex(outputScriptHex, addressPrefix)
  };
};

const normalizeOutput = (output: unknown, index: number, requestedTxid: string): NormalizedOpReturnOutput | null => {
  const outputRecord = requireRecord(output, requestedTxid, `outputs[${index}]`);
  const outputScriptHex = requireLowercaseScriptHex(outputRecord.outputScript, requestedTxid, `outputs[${index}].outputScript`);
  if (!isOpReturnScriptHex(outputScriptHex)) {
    return null;
  }
  return normalizeOpReturnOutput(index, outputScriptHex);
};

const normalizeBlock = (
  block: unknown,
  requestedTxid: string
): Pick<NormalizedTransaction, "blockHeight" | "blockHash" | "blockTimestamp"> => {
  if (block === undefined) {
    return { blockHeight: null, blockHash: null, blockTimestamp: null };
  }

  const blockRecord = requireRecord(block, requestedTxid, "block");
  return {
    blockHeight: requireSafeNonNegativeInteger(blockRecord.height, requestedTxid, "block.height"),
    blockHash: requireCanonicalBlockHash(blockRecord.hash, requestedTxid, "block.hash"),
    blockTimestamp: requireSafeNonNegativeInteger(blockRecord.timestamp, requestedTxid, "block.timestamp")
  };
};

const normalizeFirstSeenAt = (timeFirstSeen: unknown, requestedTxid: string): number | null => {
  if (timeFirstSeen === undefined) {
    return null;
  }
  const value = requireSafeNonNegativeInteger(timeFirstSeen, requestedTxid, "timeFirstSeen");
  return value === 0 ? null : value;
};

export const normalizeTransaction = (
  requestedTxid: string,
  rawResponse: unknown,
  options: NormalizedTransactionOptions = {}
): NormalizedTransaction => {
  const addressPrefix = options.addressPrefix ?? DEFAULT_ADDRESS_PREFIX;
  const response = requireRecord(rawResponse, requestedTxid, "response");
  const txid = requireCanonicalTxid(response.txid, requestedTxid, "txid");
  if (txid !== requestedTxid) {
    throw invalidChronikResponse("Chronik response transaction ID does not match requested transaction ID.", requestedTxid);
  }

  const isCoinbase = requireBoolean(response.isCoinbase, requestedTxid, "isCoinbase");
  const isFinal = requireBoolean(response.isFinal, requestedTxid, "isFinal");
  if (!Array.isArray(response.inputs)) {
    throw invalidChronikResponse("Chronik response field inputs must be an array.", requestedTxid);
  }
  if (!Array.isArray(response.outputs)) {
    throw invalidChronikResponse("Chronik response field outputs must be an array.", requestedTxid);
  }

  const inputs = response.inputs.map((input, index) => normalizeInput(input, index, requestedTxid, isCoinbase, addressPrefix));
  const inputAddresses = inputs.flatMap((input) => (input.address === null ? [] : [input.address]));
  const opReturnOutputs = response.outputs.flatMap((output, index) => {
    const normalized = normalizeOutput(output, index, requestedTxid);
    return normalized === null ? [] : [normalized];
  });
  const block = normalizeBlock(response.block, requestedTxid);

  return {
    txid,
    isCoinbase,
    inputs,
    inputAddresses,
    opReturnOutputs,
    blockHeight: block.blockHeight,
    blockHash: block.blockHash,
    blockTimestamp: block.blockTimestamp,
    firstSeenAt: normalizeFirstSeenAt(response.timeFirstSeen, requestedTxid),
    isFinal,
    rawResponse
  };
};
