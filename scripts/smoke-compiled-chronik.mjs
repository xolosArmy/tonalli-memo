import { Buffer } from "node:buffer";
import { stdout } from "node:process";
import { ChronikTransactionClient } from "@tonalli-memo/chronik";

const txid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const prevTxid = "1111111111111111111111111111111111111111111111111111111111111111";
const blockHash = "3333333333333333333333333333333333333333333333333333333333333333";
const inputScript = "76a914000000000000000000000000000000000000000088ac";
const memoHex = Buffer.from("TM0|p|xa|signal now lives on eCash", "utf8").toString("hex");
const opReturnScript = "6a" + (memoHex.length / 2).toString(16).padStart(2, "0") + memoHex;

const raw = {
  txid,
  version: 2,
  inputs: [
    {
      prevOut: { txid: prevTxid, outIdx: 0 },
      inputScript: "00",
      outputScript: inputScript,
      sats: 546n,
      sequenceNo: 4294967295
    }
  ],
  outputs: [{ sats: 0n, outputScript: opReturnScript }],
  lockTime: 0,
  block: { height: 900001, hash: blockHash, timestamp: 1710000000 },
  timeFirstSeen: 1709999900,
  size: 250,
  isCoinbase: false,
  tokenEntries: [],
  tokenFailedParsings: [],
  tokenStatus: "TOKEN_STATUS_NON_TOKEN",
  isFinal: true
};

const source = {
  async tx(requestedTxid) {
    if (requestedTxid !== txid) {
      throw new Error("unexpected txid");
    }
    return raw;
  }
};

const normalized = await new ChronikTransactionClient({ source }).getTransaction(txid);
const expectedAddress = "ecash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs7ratqfx";
const memoPush = normalized.opReturnOutputs[0]?.pushes[0];
const memoText = memoPush === undefined ? null : Buffer.from(memoPush).toString("utf8");

if (normalized.blockHeight !== 900001 || normalized.inputAddresses[0] !== expectedAddress || memoText !== "TM0|p|xa|signal now lives on eCash") {
  throw new Error("compiled chronik smoke failed");
}

stdout.write(`compiled chronik smoke ok: ${normalized.txid} ${normalized.inputAddresses[0]} ${memoText}\n`);
