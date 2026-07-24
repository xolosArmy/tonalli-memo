import { Buffer } from "node:buffer";
import { stdout } from "node:process";
import { parseRegistry } from "@tonalli-memo/registry";
import { MemoVerificationService } from "@tonalli-memo/verification";

const txid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const expectedAddress = "ecash:qptestaddress0000000000000000000000000000000";
const expectedInputIndex = 1;
const memoText = "TM0|p|xa|signal now lives on eCash";
const memoPush = new Uint8Array(Buffer.from(memoText, "utf8"));

const registry = parseRegistry({
  schemaVersion: 1,
  network: "ecash-mainnet",
  profiles: {
    xa: {
      code: "xa",
      alias: "xolosarmy.xec",
      displayName: "xolosArmy Network",
      authorizedAddresses: [{ address: expectedAddress }]
    },
    ty: {
      code: "ty",
      alias: "teyolia.xec",
      displayName: "Teyolia",
      authorizedAddresses: []
    },
    tw: {
      code: "tw",
      alias: "tonalli.xec",
      displayName: "Tonalli Wallet",
      authorizedAddresses: []
    },
    em: {
      code: "em",
      alias: "ecashmx.xec",
      displayName: "eCash Magazine Mexico",
      authorizedAddresses: []
    }
  }
});

const transaction = {
  txid,
  isCoinbase: false,
  inputs: [
    {
      index: 0,
      prevOut: { txid: "1111111111111111111111111111111111111111111111111111111111111111", outIdx: 0 },
      outputScriptHex: null,
      address: null
    },
    {
      index: expectedInputIndex,
      prevOut: { txid: "2222222222222222222222222222222222222222222222222222222222222222", outIdx: 1 },
      outputScriptHex: "76a914000000000000000000000000000000000000000088ac",
      address: expectedAddress
    }
  ],
  inputAddresses: [expectedAddress],
  opReturnOutputs: [
    {
      outputIndex: 0,
      outputScriptHex: "6a" + memoPush.length.toString(16).padStart(2, "0") + Buffer.from(memoPush).toString("hex"),
      pushes: [memoPush],
      parseStatus: "parsed"
    }
  ],
  blockHeight: 900001,
  blockHash: "3333333333333333333333333333333333333333333333333333333333333333",
  blockTimestamp: 1710000000,
  firstSeenAt: 1709999900,
  isFinal: true,
  rawResponse: { smoke: true }
};

const chronik = {
  async getTransaction(requestedTxid) {
    if (requestedTxid !== txid) {
      throw new Error(`Unexpected txid ${requestedTxid}`);
    }
    return transaction;
  }
};

const result = await new MemoVerificationService({ chronik, registry }).verifyTransaction(txid);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`compiled verification smoke failed: ${message}: ${JSON.stringify(result)}`);
  }
}

assert(result.status === "VERIFIED", "status");
assert(result.memo.profile === "xa", "memo.profile");
assert(result.memo.payload === "signal now lives on eCash", "memo.payload");
assert(result.authorizingInputIndex === expectedInputIndex, "authorizingInputIndex");
assert(result.authorizingAddress === expectedAddress, "authorizingAddress");
assert(result.evaluationHeight === 900001, "evaluationHeight");
assert(
  result.authorizationDecisions.some(
    (decision) =>
      decision.inputIndex === expectedInputIndex &&
      decision.address === expectedAddress &&
      decision.authorized === true &&
      decision.reason === "AUTHORIZED" &&
      decision.evaluationHeight === 900001
  ),
  "authorizationDecisions"
);

stdout.write(
  `compiled verification smoke ok: ${result.status} ${result.memo.profile} ${result.authorizingInputIndex} ${result.authorizingAddress} ${result.evaluationHeight}\n`
);
