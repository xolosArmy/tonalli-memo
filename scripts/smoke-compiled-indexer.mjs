import assert from "node:assert/strict";
import { TextEncoder } from "node:util";
import {
  IndexingEngine,
  MemoStore,
  openIndexerDatabase
} from "@tonalli-memo/indexer";

const TXID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDRESS = "ecash:qptestaddress0000000000000000000000000000000";

const transaction = {
  txid: TXID,
  isCoinbase: false,
  inputs: [
    {
      index: 0,
      prevOut: {
        txid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        outIdx: 0
      },
      outputScriptHex: "76a914abcdef88ac",
      address: ADDRESS
    }
  ],
  inputAddresses: [ADDRESS],
  opReturnOutputs: [
    {
      outputIndex: 0,
      outputScriptHex: "6a",
      pushes: [new TextEncoder().encode("TM0|p|xa|signal now lives on eCash")],
      parseStatus: "parsed"
    }
  ],
  blockHeight: 900001,
  blockHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  blockTimestamp: 1710000000,
  firstSeenAt: 1709999900,
  isFinal: true,
  rawResponse: {
    nested: 1n
  }
};

const verificationResult = {
  status: "VERIFIED",
  txid: TXID,
  transaction,
  memo: {
    marker: "TM0",
    version: 0,
    type: "p",
    profile: "xa",
    payload: "signal now lives on eCash",
    byteLength: 35
  },
  candidate: {
    outputIndex: 0,
    pushIndex: 0
  },
  profile: {
    code: "xa",
    alias: "xolos-army",
    displayName: "Xolos Army",
    authorizedAddresses: [{ address: ADDRESS }]
  },
  authorizationContext: {
    chainStatus: "confirmed",
    blockHeight: 900001
  },
  evaluationHeight: 900001,
  authorizingAddress: ADDRESS,
  authorizingInputIndex: 0,
  authorizationDecisions: [
    {
      inputIndex: 0,
      address: ADDRESS,
      authorized: true,
      reason: "AUTHORIZED",
      evaluationHeight: 900001
    }
  ]
};

const database = openIndexerDatabase({ filename: ":memory:" });
try {
  const store = new MemoStore(database);
  const engine = new IndexingEngine({
    verificationService: {
      async verifyTransaction() {
        return verificationResult;
      }
    },
    store,
    clock: {
      nowSeconds() {
        return 1234567890;
      }
    }
  });

  await engine.indexTransaction(TXID, { tipHeight: 900010 });

  const tx = store.getTransaction(TXID);
  const record = store.getVerificationRecord(TXID);
  const attempts = store.listIndexingAttempts(TXID);

  assert.ok(tx);
  assert.ok(record);
  assert.equal(attempts.length, 1);
  assert.equal(record.verificationStatus, "VERIFIED");
  assert.equal(tx.chainStatus, "confirmed");
  assert.equal(record.profileCode, "xa");
  assert.equal(record.payload, "signal now lives on eCash");
  assert.equal(record.authorizingAddress, ADDRESS);
  assert.equal(record.authorizingInputIndex, 0);
  assert.equal(JSON.parse(tx.normalizedJson).rawResponse, undefined);
} finally {
  database.close();
}
