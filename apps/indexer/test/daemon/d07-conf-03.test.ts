import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  ChronikAdapterError,
  normalizeOpReturnOutput,
  type ChronikChainTip,
  type ChronikConfirmedTxPage,
  type ChronikLiveConnection,
  type ChronikLiveHandlers,
  type ChronikLiveSource,
  type ChronikTransactionAdapter,
  type NormalizedInput,
  type NormalizedTransaction,
  type TonalliDiscoveryProtocol
} from "@tonalli-memo/chronik";
import { MemoVerificationService } from "@tonalli-memo/verification";
import { IndexerDaemon, IndexingEngine, MemoStore, openIndexerDatabase } from "../../src/index.js";
import { normalizedTx } from "../fixtures.js";

const TX_ONE = "11".repeat(32);
const TX_INVALID = "22".repeat(32);
const TX_THREE = "33".repeat(32);
const TX_FOUR = "44".repeat(32);
const TEST_PUBKEY = `02${"11".repeat(32)}`;
const TEST_SIG = `${"22".repeat(64)}41`;
const TIP_HASH = "ee".repeat(32);

function p2pkhInput(): NormalizedInput {
  const sha = createHash("sha256").update(Buffer.from(TEST_PUBKEY, "hex")).digest();
  const hash160 = createHash("ripemd160").update(sha).digest("hex");
  return {
    index: 0,
    prevOut: { txid: "55".repeat(32), outIdx: 0 },
    inputScriptHex: `41${TEST_SIG}21${TEST_PUBKEY}`,
    outputScriptHex: `76a914${hash160}88ac`,
    address: "ecash:qptestauthor000000000000000000000000000000"
  };
}

function confirmedTm1(txid: string, invalidUtf8 = false): NormalizedTransaction {
  const author = p2pkhInput();
  // Event data is either "ok" or the malformed UTF-8 sequence C3 28.
  const eventBytesHex = invalidUtf8 ? "c328" : "6f6b";
  const scriptHex = `6a04544d4d0005010100${eventBytesHex}`;
  return normalizedTx({
    txid,
    inputs: [author],
    inputAddresses: author.address === null ? [] : [author.address],
    opReturnOutputs: [normalizeOpReturnOutput(0, 0n, scriptHex)],
    blockHeight: 900,
    blockHash: TIP_HASH
  });
}

class MockChronik implements ChronikTransactionAdapter {
  readonly transactions = new Map<string, NormalizedTransaction>();
  readonly missing = new Set<string>();
  readonly failOnce = new Set<string>();
  readonly requested: string[] = [];

  constructor(transactions: readonly NormalizedTransaction[]) {
    for (const transaction of transactions) this.transactions.set(transaction.txid, transaction);
  }

  async getTransaction(txid: string): Promise<NormalizedTransaction> {
    this.requested.push(txid);
    if (this.failOnce.delete(txid)) {
      // Unexpected source failure deliberately models a crash boundary.
      throw new Error("D07-CONF-03 simulated unexpected ingestion interruption");
    }
    if (this.missing.has(txid)) {
      throw new ChronikAdapterError({
        code: "TRANSACTION_NOT_FOUND",
        message: "Simulated transaction orphaned from Chronik index.",
        txid
      });
    }
    const result = this.transactions.get(txid);
    if (result === undefined) throw new Error(`No transaction fixture for ${txid}`);
    return result;
  }
}

class MockLive implements ChronikLiveSource {
  handlers: ChronikLiveHandlers | null = null;
  tip: ChronikChainTip = { height: 900, hash: TIP_HASH };
  readonly confirmed: Record<TonalliDiscoveryProtocol, string[]> = { TM0: [], TM1: [] };
  readonly pages: Array<{ protocol: TonalliDiscoveryProtocol; page: number; size: number }> = [];

  createConnection(handlers: ChronikLiveHandlers): ChronikLiveConnection {
    this.handlers = handlers;
    return {
      start: async () => { handlers.onConnect?.(); },
      stop: async () => {}
    };
  }

  async getTipHeight(): Promise<number> { return this.tip.height; }
  async getChainTip(): Promise<ChronikChainTip> { return this.tip; }
  async getBlockHash(height: number): Promise<string> {
    return height === this.tip.height ? this.tip.hash : "dd".repeat(32);
  }
  async listTonalliUnconfirmedTxids(): Promise<readonly string[]> { return []; }

  async listTonalliConfirmedTxs(
    protocol: TonalliDiscoveryProtocol,
    page: number,
    pageSize: number
  ): Promise<ChronikConfirmedTxPage> {
    this.pages.push({ protocol, page, size: pageSize });
    const history = this.confirmed[protocol];
    return {
      txs: history.slice(page * pageSize, (page + 1) * pageSize).map((txid) => ({
        txid, blockHeight: this.tip.height, blockHash: this.tip.hash
      })),
      page,
      numPages: Math.ceil(history.length / pageSize),
      numTxs: history.length
    };
  }
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

function harness(
  databasePath: string,
  chronik: MockChronik,
  history: readonly string[],
  options: { pageSize?: number; maxPages?: number } = {}
) {
  const database = openIndexerDatabase({ filename: databasePath });
  const store = new MemoStore(database);
  const live = new MockLive();
  live.confirmed.TM1 = [...history];
  const engine = new IndexingEngine({
    verificationService: new MemoVerificationService({ chronik }),
    store,
    clock: { nowSeconds: () => 1760000000 }
  });
  const daemon = new IndexerDaemon({
    engine,
    store,
    liveSource: live,
    logger: silentLogger,
    backfillPageSize: options.pageSize ?? 2,
    backfillMaxPagesPerRun: options.maxPages ?? 10,
    backfillOverlapPages: 0,
    backfillIntervalMs: 60_000
  });
  return { daemon, database, store, live };
}

function singleTxRows(database: ReturnType<typeof openIndexerDatabase>, table: string): number {
  if (table !== "transactions" && table !== "verification_records") {
    throw new Error("Only durable identity tables may be counted.");
  }
  const row = database.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

describe("D07-CONF-03 — daemon recovery, reorgs and durable checkpoints", () => {
  it.each([
    ["before invalid TM1 is fetched", TX_INVALID, false],
    ["after invalid TM1 was persisted, before the next valid TM1", TX_THREE, true]
  ] as const)("reopens the same SQLite database and resumes after an interruption %s", async (_label, failTxid, invalidWasPersisted) => {
    const dir = mkdtempSync(join(tmpdir(), "d07-conf-03-"));
    const filename = join(dir, "indexer.sqlite");
    const all = [confirmedTm1(TX_ONE), confirmedTm1(TX_INVALID, true), confirmedTm1(TX_THREE)];
    const chronik = new MockChronik(all);
    chronik.failOnce.add(failTxid);
    const ids = all.map((tx) => tx.txid);
    let first: ReturnType<typeof harness> | null = null;
    let restarted: ReturnType<typeof harness> | null = null;

    try {
      first = harness(filename, chronik, ids);
      await expect(first.daemon.start()).rejects.toThrow("simulated unexpected ingestion interruption");
      expect(first.daemon.getStatus()).toMatchObject({ state: "failed", backfill: { state: "failed" } });
      expect(first.store.getBackfillCheckpoint("TM1")).toBeNull();
      expect(first.store.getTransaction(TX_ONE)).not.toBeNull();
      expect(first.store.getVerificationRecord(TX_ONE)?.verificationStatus).toBe("VERIFIED");
      if (invalidWasPersisted) {
        expect(first.store.getVerificationRecord(TX_INVALID)).toMatchObject({
          verificationStatus: "INVALID_MEMO",
          protocol: "TM1",
          payload: null,
          diagnostics: { protocolError: { code: "INVALID_UTF8" } }
        });
      } else {
        expect(first.store.getVerificationRecord(TX_INVALID)).toBeNull();
      }
      const initialIndexedAt = first.store.getTransaction(TX_ONE)?.firstIndexedAt;
      await first.daemon.stop();
      first.database.close();
      first = null;

      // A newly constructed daemon, engine and SQLite connection reuse persisted state.
      restarted = harness(filename, chronik, ids);
      await restarted.daemon.start();

      expect(restarted.daemon.getStatus()).toMatchObject({
        state: "running", ready: true, backfill: { state: "succeeded", complete: true }
      });
      expect(restarted.store.getBackfillCheckpoint("TM1")).toMatchObject({
        txCountCursor: 3, historyTxCount: 3, complete: true,
        blockHeight: 900, blockHash: TIP_HASH
      });
      expect(restarted.store.getVerificationRecord(TX_INVALID)).toMatchObject({
        protocol: "TM1", verificationStatus: "INVALID_MEMO", payload: null,
        diagnostics: { protocolError: { code: "INVALID_UTF8" } }
      });
      expect(restarted.store.listVerifiedFeed(10).map((row) => row.transaction.txid).sort()).toEqual(
        [TX_ONE, TX_THREE].sort()
      );
      expect(singleTxRows(restarted.database, "transactions")).toBe(3);
      expect(singleTxRows(restarted.database, "verification_records")).toBe(3);
      expect(restarted.store.getTransaction(TX_ONE)?.firstIndexedAt).toBe(initialIndexedAt);
      // Replayed candidates create additional audit attempts, never duplicate feed rows.
      expect(restarted.store.listIndexingAttempts(TX_ONE).length).toBeGreaterThanOrEqual(2);
      await restarted.daemon.stop();
    } finally {
      if (first !== null) {
        await first.daemon.stop();
        first.database.close();
      }
      if (restarted !== null) {
        await restarted.daemon.stop();
        restarted.database.close();
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks an orphaned confirmed TM1 inactive on a disconnected block, without deleting its audit record", async () => {
    const transaction = confirmedTm1(TX_ONE);
    const chronik = new MockChronik([transaction]);
    const fixture = harness(":memory:", chronik, [TX_ONE]);
    try {
      await fixture.daemon.start();
      expect(fixture.store.listVerifiedFeed(10)).toHaveLength(1);

      chronik.missing.add(TX_ONE);
      fixture.live.handlers?.onEvent({
        type: "block", event: "disconnected",
        blockHeight: 900, blockHash: TIP_HASH, blockTimestamp: 1760000000
      });

      await vi.waitFor(() => {
        expect(fixture.store.getTransaction(TX_ONE)).toMatchObject({
          isActive: false, inactiveReason: "INVALIDATED"
        });
      });
      expect(fixture.store.listVerifiedFeed(10)).toHaveLength(0);
      expect(fixture.store.getVerificationRecord(TX_ONE)).toMatchObject({
        protocol: "TM1", verificationStatus: "VERIFIED", payload: "ok"
      });
      expect(fixture.store.listIndexingAttempts(TX_ONE).at(-1)).toMatchObject({
        resultStatus: "TRANSACTION_NOT_FOUND", persistedRecord: false
      });
    } finally {
      await fixture.daemon.stop();
      fixture.database.close();
    }
  });

  it("recovers an offline confirmed TM1 after websocket reconnection and avoids duplicate feed rows", async () => {
    const transaction = confirmedTm1(TX_ONE);
    const chronik = new MockChronik([transaction]);
    const fixture = harness(":memory:", chronik, []);
    try {
      await fixture.daemon.start();
      expect(fixture.store.listVerifiedFeed(10)).toHaveLength(0);

      fixture.live.handlers?.onReconnect?.();
      expect(fixture.daemon.getStatus()).toMatchObject({ state: "reconnecting", websocketConnected: false });
      fixture.live.confirmed.TM1.push(TX_ONE); // Discovered only during confirmed reconciliation.
      fixture.live.handlers?.onConnect?.();

      await vi.waitFor(() => {
        expect(fixture.store.getVerificationRecord(TX_ONE)?.verificationStatus).toBe("VERIFIED");
        expect(fixture.daemon.getStatus()).toMatchObject({ state: "running", backfill: { state: "succeeded" } });
      });
      expect(fixture.store.listVerifiedFeed(10).map((row) => row.transaction.txid)).toEqual([TX_ONE]);
      expect(singleTxRows(fixture.database, "transactions")).toBe(1);
    } finally {
      await fixture.daemon.stop();
      fixture.database.close();
    }
  });

  it("resumes an incomplete bounded page cursor after daemon restart (without claiming time-based rate limiting)", async () => {
    const all = [TX_ONE, TX_INVALID, TX_THREE, TX_FOUR].map((txid) => confirmedTm1(txid));
    const chronik = new MockChronik(all);
    const ids = all.map((transaction) => transaction.txid);
    const first = harness(":memory:", chronik, ids, { pageSize: 2, maxPages: 1 });
    try {
      await first.daemon.start();
      expect(first.store.getBackfillCheckpoint("TM1")).toMatchObject({
        txCountCursor: 2, historyTxCount: 4, complete: false
      });
      expect(first.live.pages.filter((call) => call.protocol === "TM1").map((call) => call.page)).toEqual([0]);
      expect(first.live.pages.every((call) => call.size === 2)).toBe(true);
      expect(first.store.listVerifiedFeed(10)).toHaveLength(2);
      await first.daemon.stop();

      const next = harness(":memory:", chronik, ids, { pageSize: 2, maxPages: 1 });
      // A fresh in-memory database would lose the checkpoint; the next daemon
      // instead shares the existing durable MemoStore via explicit construction.
      // See the file-backed restart test above for actual DB reopen semantics.
      const resumed = new IndexerDaemon({
        engine: new IndexingEngine({
          verificationService: new MemoVerificationService({ chronik }),
          store: first.store,
          clock: { nowSeconds: () => 1760000000 }
        }),
        store: first.store,
        liveSource: next.live,
        logger: silentLogger,
        backfillPageSize: 2,
        backfillMaxPagesPerRun: 1,
        backfillOverlapPages: 0,
        backfillIntervalMs: 60_000
      });
      try {
        await resumed.start();
        expect(next.live.pages.filter((call) => call.protocol === "TM1").map((call) => call.page)).toEqual([0, 1]);
        expect(first.store.getBackfillCheckpoint("TM1")).toMatchObject({
          txCountCursor: 4, historyTxCount: 4, complete: true
        });
        expect(first.store.listVerifiedFeed(10)).toHaveLength(4);
      } finally {
        await resumed.stop();
        next.database.close();
      }
    } finally {
      await first.daemon.stop();
      first.database.close();
    }
  });
});
