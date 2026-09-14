import assert from "node:assert/strict";
import { TextEncoder } from "node:util";
import {
  createIndexerApi,
  IndexingEngine,
  MemoStore,
  openIndexerDatabase
} from "@tonalli-memo/indexer";

const TXID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDRESS = "ecash:qptestaddress0000000000000000000000000000000";

const verificationResult = {
  status: "VERIFIED",
  txid: TXID,
  transaction: {
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
  },
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
const store = new MemoStore(database);
const verificationService = {
  calls: [],
  async verifyTransaction(txid, context = {}) {
    this.calls.push({ txid, context });
    return verificationResult;
  }
};
const indexingEngine = new IndexingEngine({
  verificationService,
  store,
  clock: {
    nowSeconds() {
      return 1234567890;
    }
  }
});
const daemonStatus = {
  state: "running",
  websocketConnected: true,
  chronikHeight: 900010,
  lastEventAt: null,
  lastSuccessfulIndexAt: null,
  lastSuccessfulIndexTxid: null,
  queueSize: 0,
  activeCount: 0,
  queueAccepted: 0,
  queueCompleted: 0,
  queueFailed: 0,
  queueRejected: 0,
  queueLastActivityAt: null,
  lastError: null,
  backfill: {
    state: "succeeded",
    complete: true,
    lastStartedAt: null,
    lastCompletedAt: null,
    checkpointHeight: 900010,
    lagBlocks: 0,
    consecutiveFailures: 0
  },
  ready: true
};
const indexRequestService = {
  requestIndex(txid) {
    return { status: store.getTransaction(txid) === null ? "queued" : "already_indexed", completion: null };
  },
  async indexAndWait(txid, options = {}) {
    return await indexingEngine.indexTransaction(txid, options);
  },
  getStatus() {
    return daemonStatus;
  }
};
const app = await createIndexerApi({
  store,
  indexingEngine,
  indexApiToken: "secret",
  indexRequestService
});

const injectJson = async (options) => {
  const response = await app.inject(options);
  return { statusCode: response.statusCode, body: JSON.parse(response.payload) };
};

try {
  const health = await injectJson({ method: "GET", url: "/api/v1/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.status, "ok");
  assert.equal(health.body.daemon.websocketConnected, true);

  const ready = await injectJson({ method: "GET", url: "/api/v1/ready" });
  assert.equal(ready.statusCode, 200);

  const requested = await injectJson({
    method: "POST",
    url: "/api/v1/index-requests",
    payload: { txid: TXID }
  });
  assert.equal(requested.statusCode, 202);
  assert.equal(requested.body.status, "queued");

  const indexed = await injectJson({
    method: "POST",
    url: "/api/v1/admin/index",
    headers: { authorization: "Bearer secret" },
    payload: { txid: TXID, tipHeight: 900010 }
  });
  assert.equal(indexed.statusCode, 200);
  assert.equal(indexed.body.attemptId, 1);
  assert.equal(indexed.body.persistedRecord, true);
  assert.equal(indexed.body.verification.status, "VERIFIED");
  assert.equal(indexed.body.verification.transaction.txid, TXID);
  assert.equal(verificationService.calls[0].context.tipHeight, 900010);
  assert.equal(JSON.stringify(indexed.body).includes("rawResponse"), false);

  const stored = await injectJson({ method: "GET", url: `/api/v1/tx/${TXID}` });
  assert.equal(stored.statusCode, 200);
  assert.equal(stored.body.verification.status, "VERIFIED");

  const feed = await injectJson({ method: "GET", url: "/api/v1/feed?limit=1" });
  assert.equal(feed.statusCode, 200);
  assert.equal(feed.body.items.length, 1);
  assert.equal(feed.body.items[0].transaction.txid, TXID);
} finally {
  await app.close();
  database.close();
}
