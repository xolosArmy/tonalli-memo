import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import type { StoredNormalizedTransactionV1, StoredOpReturnOutput } from "./types.js";

export function toStoredNormalizedTransaction(transaction: NormalizedTransaction): StoredNormalizedTransactionV1 {
  return {
    schemaVersion: 1,
    txid: transaction.txid,
    isCoinbase: transaction.isCoinbase,
    inputs: transaction.inputs.map((input) => ({
      index: input.index,
      prevOut: {
        txid: input.prevOut.txid,
        outIdx: input.prevOut.outIdx
      },
      outputScriptHex: input.outputScriptHex,
      address: input.address
    })),
    inputAddresses: [...transaction.inputAddresses],
    opReturnOutputs: transaction.opReturnOutputs.map(toStoredOpReturnOutput),
    blockHeight: transaction.blockHeight,
    blockHash: transaction.blockHash,
    blockTimestamp: transaction.blockTimestamp,
    firstSeenAt: transaction.firstSeenAt,
    isFinal: transaction.isFinal
  };
}

export function serializeStoredTransaction(transaction: NormalizedTransaction): string {
  return JSON.stringify(toStoredNormalizedTransaction(transaction));
}

function toStoredOpReturnOutput(output: NormalizedTransaction["opReturnOutputs"][number]): StoredOpReturnOutput {
  const base = {
    outputIndex: output.outputIndex,
    outputScriptHex: output.outputScriptHex.toLowerCase(),
    pushesHex: output.pushes.map((push) => Buffer.from(push).toString("hex").toLowerCase()),
    parseStatus: output.parseStatus
  };

  if (output.parseStatus === "malformed") {
    return {
      ...base,
      parseStatus: "malformed",
      parseErrorCode: output.parseErrorCode ?? "MALFORMED_OP_RETURN"
    };
  }

  return {
    ...base,
    parseStatus: "parsed"
  };
}
