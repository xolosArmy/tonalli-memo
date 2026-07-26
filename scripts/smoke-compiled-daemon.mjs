import { IndexerDaemon, MemoStore, openIndexerDatabase } from "@tonalli-memo/indexer";
import { TONALLI_MEMO_LOKAD_ID } from "@tonalli-memo/chronik";

const TXID = "a".repeat(64);

class FakeConnection {
  constructor(handlers) {
    this.handlers = handlers;
    this.closed = false;
  }

  async start() {}

  async stop() {
    this.closed = true;
  }
}

class FakeLiveSource {
  constructor() {
    this.tipHeight = 777;
    this.connection = null;
  }

  createConnection(handlers) {
    this.connection = new FakeConnection(handlers);
    return this.connection;
  }

  async getTipHeight() {
    return this.tipHeight;
  }

  async listTonalliUnconfirmedTxids() {
    return [];
  }
}

class FakeEngine {
  constructor(store) {
    this.store = store;
    this.calls = [];
  }

  async indexTransaction(txid, options = {}) {
    this.calls.push({ txid, options });
    return { verificationResult: { status: "VERIFIED" }, attemptId: 1, persistedRecord: false };
  }
}

const database = openIndexerDatabase({ filename: ":memory:" });
const store = new MemoStore(database);
const liveSource = new FakeLiveSource();
const engine = new FakeEngine(store);
const logger = { info() {}, warn() {}, error() {} };

const daemon = new IndexerDaemon({
  engine,
  store,
  liveSource,
  logger,
  clock: { nowSeconds: () => 1 },
  drainTimeoutMs: 1000
});

if (TONALLI_MEMO_LOKAD_ID !== "544d307c") {
  throw new Error("Unexpected Tonalli Memo LOKAD ID.");
}

await daemon.start();
liveSource.connection.handlers.onEvent({ type: "transaction", event: "added-to-mempool", txid: TXID });
liveSource.connection.handlers.onEvent({ type: "transaction", event: "added-to-mempool", txid: TXID });
await daemon.stop();

if (engine.calls.length !== 1) {
  throw new Error(`Expected one deduplicated indexing call, got ${engine.calls.length}.`);
}
if (engine.calls[0].options.tipHeight !== 777) {
  throw new Error("Expected exact tipHeight to be forwarded.");
}
if (!liveSource.connection.closed) {
  throw new Error("Expected live connection to close.");
}

database.close();
