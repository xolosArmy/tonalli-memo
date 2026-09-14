import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedWorkQueue, IndexerDaemon } from "../../src/index.js";
import type {
  ChronikConfirmedTxPage,
  ChronikLiveConnection,
  ChronikLiveEvent,
  ChronikLiveHandlers,
  ChronikLiveSource,
  TonalliDiscoveryProtocol
} from "@tonalli-memo/chronik";
import type { IndexingEngine } from "../../src/engine/indexer.js";
import type { MemoStore } from "../../src/db/store.js";
import type { BackfillCheckpoint, ConfirmedTransactionCursorRow } from "../../src/db/types.js";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

class FakeConnection implements ChronikLiveConnection {
  starts = 0;
  stops = 0;
  handlers: ChronikLiveHandlers | null = null;

  async start(): Promise<void> {
    this.starts += 1;
    this.handlers?.onConnect?.();
  }

  async stop(): Promise<void> {
    this.stops += 1;
  }
}

class FakeLiveSource implements ChronikLiveSource {
  readonly connection = new FakeConnection();
  handlers: ChronikLiveHandlers | null = null;
  tipHeight = 900;
  tipHash = txid("f");
  unconfirmed: string[] = [];
  tipHeightCalls = 0;
  unconfirmedCalls = 0;
  activeUnconfirmedCalls = 0;
  maxActiveUnconfirmedCalls = 0;
  listDeferreds: Array<Deferred<readonly string[]>> = [];
  failNextList = false;
  confirmedDeferreds: Array<Deferred<void>> = [];
  confirmedByProtocol: Record<TonalliDiscoveryProtocol, string[]> = { TM0: [], TM1: [] };
  confirmedCalls: Array<{ readonly protocol: TonalliDiscoveryProtocol; readonly page: number; readonly pageSize: number }> = [];
  blockHashes = new Map<number, string>();

  createConnection(handlers: ChronikLiveHandlers): ChronikLiveConnection {
    this.handlers = handlers;
    this.connection.handlers = handlers;
    return this.connection;
  }

  async getTipHeight(): Promise<number> {
    this.tipHeightCalls += 1;
    return this.tipHeight;
  }

  async getChainTip(): Promise<{ readonly height: number; readonly hash: string }> {
    this.tipHeightCalls += 1;
    return { height: this.tipHeight, hash: this.tipHash };
  }

  async getBlockHash(height: number): Promise<string> {
    return this.blockHashes.get(height) ?? (height === this.tipHeight ? this.tipHash : txid("e"));
  }

  async listTonalliUnconfirmedTxids(): Promise<readonly string[]> {
    this.unconfirmedCalls += 1;
    this.activeUnconfirmedCalls += 1;
    this.maxActiveUnconfirmedCalls = Math.max(this.maxActiveUnconfirmedCalls, this.activeUnconfirmedCalls);
    try {
      if (this.failNextList) {
        this.failNextList = false;
        throw new Error("list failed");
      }
      const next = this.listDeferreds.shift();
      if (next !== undefined) {
        return await next.promise;
      }
      return this.unconfirmed;
    } finally {
      this.activeUnconfirmedCalls -= 1;
    }
  }

  async listTonalliConfirmedTxs(
    protocol: TonalliDiscoveryProtocol,
    page: number,
    pageSize: number
  ): Promise<ChronikConfirmedTxPage> {
    this.confirmedCalls.push({ protocol, page, pageSize });
    const pending = this.confirmedDeferreds.shift();
    if (pending !== undefined) await pending.promise;
    const all = this.confirmedByProtocol[protocol];
    return {
      txs: all.slice(page * pageSize, (page + 1) * pageSize).map((candidateTxid, index) => ({
        txid: candidateTxid,
        blockHeight: 800 + page * pageSize + index,
        blockHash: txid(protocol === "TM0" ? "c" : "d")
      })),
      page,
      numPages: Math.ceil(all.length / pageSize),
      numTxs: all.length
    };
  }
}

class FakeEngine {
  calls: Array<{ readonly txid: string; readonly options: unknown }> = [];
  deferredRuns: Array<Deferred<void>> = [];
  failNext = false;
  results = new Map<string, { readonly verificationResult: { readonly status: string }; readonly attemptId: number; readonly persistedRecord: boolean }>();

  async indexTransaction(txid: string, options: unknown = {}): Promise<unknown> {
    this.calls.push({ txid, options });
    if (this.failNext) {
      this.failNext = false;
      throw new Error("boom");
    }
    const next = this.deferredRuns.shift();
    if (next !== undefined) {
      await next.promise;
    }
    return this.results.get(txid) ?? {
      verificationResult: { status: "VERIFIED" },
      attemptId: this.calls.length,
      persistedRecord: true
    };
  }
}

class FakeStore {
  inactive: Array<{ readonly txid: string; readonly reason: string }> = [];
  unconfirmed: string[] = [];
  confirmed: string[] = [];
  checkpoints = new Map<string, BackfillCheckpoint>();

  markTransactionInactive(txid: string, reason: "REMOVED_FROM_MEMPOOL" | "INVALIDATED"): { readonly changed: boolean; readonly txid: string } {
    this.inactive.push({ txid, reason });
    return { txid, changed: true };
  }

  listActiveUnconfirmedTxids(limit = 1000): readonly string[] {
    return this.unconfirmed.slice(0, limit);
  }

  listActiveConfirmedTxidsAtOrAbove(height = 0, limit = 1000): readonly string[] {
    void height;
    return this.confirmed.slice(0, limit);
  }

  listActiveConfirmedTransactionsPage(
    minimumHeight = 0,
    limit = 1000,
    after: ConfirmedTransactionCursorRow | null = null
  ): readonly ConfirmedTransactionCursorRow[] {
    void minimumHeight;
    const start = after === null ? 0 : this.confirmed.indexOf(after.txid) + 1;
    return this.confirmed.slice(start, start + limit).map((confirmedTxid, index) => ({
      txid: confirmedTxid,
      blockHeight: 700 + start + index
    }));
  }

  getTransaction(): null {
    return null;
  }

  getVerificationRecord(): null {
    return null;
  }

  getBackfillCheckpoint(protocol: "TM0" | "TM1"): BackfillCheckpoint | null {
    return this.checkpoints.get(protocol) ?? null;
  }

  listBackfillCheckpoints(): readonly BackfillCheckpoint[] {
    return [...this.checkpoints.values()];
  }

  upsertBackfillCheckpoint(checkpoint: BackfillCheckpoint): void {
    this.checkpoints.set(checkpoint.protocol, checkpoint);
  }
}

const logger = () => {
  const records: Array<{ readonly level: string; readonly message: string }> = [];
  return {
    records,
    logger: {
      info: (message: string) => records.push({ level: "info", message }),
      warn: (message: string) => records.push({ level: "warn", message }),
      error: (message: string) => records.push({ level: "error", message })
    }
  };
};

const txid = (char: string) => char.repeat(64);

function daemonFixture(options: {
  readonly queueLimit?: number;
  readonly drainTimeoutMs?: number;
  readonly backfillIntervalMs?: number;
  readonly backfillPageSize?: number;
  readonly backfillMaxPagesPerRun?: number;
  readonly backfillOverlapPages?: number;
} = {}) {
  const engine = new FakeEngine();
  const store = new FakeStore();
  const liveSource = new FakeLiveSource();
  const logs = logger();
  const daemon = new IndexerDaemon({
    engine: engine as unknown as IndexingEngine,
    store: store as unknown as MemoStore,
    liveSource,
    logger: logs.logger,
    queueLimit: options.queueLimit ?? 100,
    reconcileLimit: 2,
    drainTimeoutMs: options.drainTimeoutMs ?? 1000,
    ...(options.backfillIntervalMs === undefined ? {} : { backfillIntervalMs: options.backfillIntervalMs }),
    ...(options.backfillPageSize === undefined ? {} : { backfillPageSize: options.backfillPageSize }),
    ...(options.backfillMaxPagesPerRun === undefined ? {} : { backfillMaxPagesPerRun: options.backfillMaxPagesPerRun }),
    ...(options.backfillOverlapPages === undefined ? {} : { backfillOverlapPages: options.backfillOverlapPages })
  });
  return { daemon, engine, store, liveSource, logs };
}

function queueFixture() {
  const logs = logger();
  const queue = new BoundedWorkQueue({ logger: logs.logger, maxSize: 10, concurrency: 1 });
  return { logs, queue };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("IndexerDaemon", () => {
  it("constructor has no side effects and start connects once", async () => {
    const { daemon, liveSource } = daemonFixture();
    expect(liveSource.handlers).toBeNull();
    await daemon.start();
    await expect(daemon.start()).rejects.toThrow("cannot start");
    expect(liveSource.connection.starts).toBe(1);
    expect(daemon.getStatus().state).toBe("running");
  });

  it("initial start reconciles once after the successful connection callback", async () => {
    const { daemon, liveSource } = daemonFixture();
    liveSource.unconfirmed = [txid("0")];
    await daemon.start();
    expect(liveSource.unconfirmedCalls).toBe(1);
    expect(liveSource.tipHeightCalls).toBe(3);
  });

  it("onReconnect alone does not reconcile before connectivity is restored", async () => {
    const { daemon, liveSource } = daemonFixture();
    await daemon.start();
    liveSource.handlers?.onReconnect?.();
    await flush();
    expect(liveSource.unconfirmedCalls).toBe(1);
    expect(daemon.getStatus().state).toBe("reconnecting");
  });

  it("successful onConnect after onReconnect reconciles exactly once", async () => {
    const { daemon, liveSource } = daemonFixture();
    await daemon.start();
    liveSource.handlers?.onReconnect?.();
    liveSource.handlers?.onConnect?.();
    await flush();
    expect(liveSource.unconfirmedCalls).toBe(2);
    expect(daemon.getStatus().state).toBe("running");
  });

  it("one reconnect cycle does not trigger two reconciliations", async () => {
    const { daemon, liveSource } = daemonFixture();
    await daemon.start();
    const beforeReconnect = liveSource.unconfirmedCalls;
    liveSource.handlers?.onReconnect?.();
    await flush();
    liveSource.handlers?.onConnect?.();
    await flush();
    expect(liveSource.unconfirmedCalls - beforeReconnect).toBe(1);
  });

  it("recovers a confirmed TM1 transaction missed while the websocket was disconnected", async () => {
    const incidentTxid = "d1e819aefaa3610286df4f8534129a1e6afe166e07f29236acb85df3f147dabd";
    const { daemon, engine, liveSource } = daemonFixture();
    await daemon.start();
    liveSource.handlers?.onReconnect?.();
    liveSource.blockHashes.set(900, liveSource.tipHash);
    liveSource.tipHeight = 901;
    liveSource.tipHash = txid("9");
    liveSource.confirmedByProtocol.TM1 = [incidentTxid];
    expect(engine.calls.map((call) => call.txid)).not.toContain(incidentTxid);

    liveSource.handlers?.onConnect?.();
    await vi.waitFor(() => expect(engine.calls.map((call) => call.txid)).toContain(incidentTxid));
    expect(daemon.getStatus()).toMatchObject({ state: "running", websocketConnected: true, backfill: { state: "succeeded" } });
    await daemon.stop();
  });

  it("recovers confirmed candidates after a process restart from the durable checkpoint", async () => {
    const incidentTxid = "d1e819aefaa3610286df4f8534129a1e6afe166e07f29236acb85df3f147dabd";
    const first = daemonFixture();
    await first.daemon.start();
    await first.daemon.stop();

    const nextEngine = new FakeEngine();
    const nextSource = new FakeLiveSource();
    nextSource.blockHashes.set(900, first.liveSource.tipHash);
    nextSource.tipHeight = 901;
    nextSource.tipHash = txid("9");
    nextSource.confirmedByProtocol.TM1 = [incidentTxid];
    const nextLogs = logger();
    const restarted = new IndexerDaemon({
      engine: nextEngine as unknown as IndexingEngine,
      store: first.store as unknown as MemoStore,
      liveSource: nextSource,
      logger: nextLogs.logger
    });
    await restarted.start();
    expect(nextEngine.calls.map((call) => call.txid)).toContain(incidentTxid);
    expect(first.store.getBackfillCheckpoint("TM1")?.txCountCursor).toBe(1);
    await restarted.stop();
  });

  it("runs confirmed backfill periodically without websocket events", async () => {
    vi.useFakeTimers();
    const incidentTxid = "d1e819aefaa3610286df4f8534129a1e6afe166e07f29236acb85df3f147dabd";
    const { daemon, engine, liveSource } = daemonFixture({ backfillIntervalMs: 1000 });
    await daemon.start();
    liveSource.blockHashes.set(900, liveSource.tipHash);
    liveSource.tipHeight = 901;
    liveSource.tipHash = txid("8");
    liveSource.confirmedByProtocol.TM1 = [incidentTxid];
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.calls.map((call) => call.txid)).toContain(incidentTxid);
    await daemon.stop();
  });

  it("paginates confirmed history and persists a per-protocol cursor", async () => {
    const { daemon, engine, store, liveSource } = daemonFixture({
      backfillPageSize: 2,
      backfillMaxPagesPerRun: 10,
      backfillOverlapPages: 0
    });
    liveSource.confirmedByProtocol.TM1 = [txid("1"), txid("2"), txid("3"), txid("4"), txid("5")];
    await daemon.start();
    expect(liveSource.confirmedCalls.filter((call) => call.protocol === "TM1").map((call) => call.page)).toEqual([0, 1, 2]);
    expect(engine.calls.map((call) => call.txid)).toEqual([txid("1"), txid("2"), txid("3"), txid("4"), txid("5")]);
    expect(store.getBackfillCheckpoint("TM1")).toMatchObject({ txCountCursor: 5, blockHeight: 900 });
    await daemon.stop();
  });

  it("keeps readiness false while the configured page budget leaves history incomplete", async () => {
    const { daemon, store, liveSource } = daemonFixture({
      backfillPageSize: 2,
      backfillMaxPagesPerRun: 1,
      backfillOverlapPages: 0
    });
    liveSource.confirmedByProtocol.TM1 = [txid("1"), txid("2"), txid("3"), txid("4")];
    await daemon.start();
    expect(store.getBackfillCheckpoint("TM1")?.txCountCursor).toBe(2);
    expect(daemon.getStatus()).toMatchObject({ ready: false, backfill: { state: "succeeded", complete: false } });
    await daemon.stop();
  });

  it("revisits the newest checkpoint overlap without downloading all confirmed history", async () => {
    const first = daemonFixture({ backfillPageSize: 2, backfillOverlapPages: 1 });
    first.liveSource.confirmedByProtocol.TM1 = [txid("1"), txid("2"), txid("3"), txid("4"), txid("5")];
    await first.daemon.start();
    await first.daemon.stop();

    const nextEngine = new FakeEngine();
    const nextSource = new FakeLiveSource();
    nextSource.confirmedByProtocol.TM1 = [...first.liveSource.confirmedByProtocol.TM1];
    const nextLogs = logger();
    const restarted = new IndexerDaemon({
      engine: nextEngine as unknown as IndexingEngine,
      store: first.store as unknown as MemoStore,
      liveSource: nextSource,
      logger: nextLogs.logger,
      backfillPageSize: 2,
      backfillOverlapPages: 1
    });
    await restarted.start();
    expect(nextSource.confirmedCalls.filter((call) => call.protocol === "TM1").map((call) => call.page)).toEqual([0, 1]);
    await restarted.stop();
  });

  it("discovers every newly prepended Chronik page after a completed checkpoint", async () => {
    const first = daemonFixture({ backfillPageSize: 2, backfillOverlapPages: 0 });
    first.liveSource.confirmedByProtocol.TM1 = [txid("1"), txid("2"), txid("3"), txid("4"), txid("5")];
    await first.daemon.start();
    await first.daemon.stop();

    const nextEngine = new FakeEngine();
    const nextSource = new FakeLiveSource();
    const newTxids = [txid("a"), txid("b"), txid("c")];
    nextSource.confirmedByProtocol.TM1 = [...newTxids, ...first.liveSource.confirmedByProtocol.TM1];
    const restarted = new IndexerDaemon({
      engine: nextEngine as unknown as IndexingEngine,
      store: first.store as unknown as MemoStore,
      liveSource: nextSource,
      logger: logger().logger,
      backfillPageSize: 2,
      backfillOverlapPages: 0
    });

    await restarted.start();
    expect(nextSource.confirmedCalls.filter((call) => call.protocol === "TM1").map((call) => call.page)).toEqual([0, 1]);
    expect(nextEngine.calls.map((call) => call.txid)).toEqual(expect.arrayContaining(newTxids));
    expect(first.store.getBackfillCheckpoint("TM1")).toMatchObject({
      txCountCursor: 8,
      historyTxCount: 8,
      complete: true
    });
    await restarted.stop();
  });

  it("continues an incomplete bounded backfill after restart while probing page zero", async () => {
    const first = daemonFixture({
      backfillPageSize: 2,
      backfillMaxPagesPerRun: 1,
      backfillOverlapPages: 0
    });
    first.liveSource.confirmedByProtocol.TM1 = [txid("1"), txid("2"), txid("3"), txid("4")];
    await first.daemon.start();
    await first.daemon.stop();
    expect(first.store.getBackfillCheckpoint("TM1")).toMatchObject({ txCountCursor: 2, complete: false });

    const nextSource = new FakeLiveSource();
    nextSource.confirmedByProtocol.TM1 = [...first.liveSource.confirmedByProtocol.TM1];
    const restarted = new IndexerDaemon({
      engine: new FakeEngine() as unknown as IndexingEngine,
      store: first.store as unknown as MemoStore,
      liveSource: nextSource,
      logger: logger().logger,
      backfillPageSize: 2,
      backfillMaxPagesPerRun: 1,
      backfillOverlapPages: 0
    });

    await restarted.start();
    expect(nextSource.confirmedCalls.filter((call) => call.protocol === "TM1").map((call) => call.page)).toEqual([0, 1]);
    expect(first.store.getBackfillCheckpoint("TM1")).toMatchObject({ txCountCursor: 4, complete: true });
    await restarted.stop();
  });

  it("preserves readiness during a routine backfill after an initial complete checkpoint", async () => {
    vi.useFakeTimers();
    const { daemon, liveSource } = daemonFixture({ backfillIntervalMs: 1000 });
    await daemon.start();
    expect(daemon.getStatus().ready).toBe(true);

    const pending = deferred<void>();
    liveSource.confirmedDeferreds.push(pending);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(daemon.getStatus()).toMatchObject({
      ready: true,
      backfill: { state: "running", complete: true }
    });
    pending.resolve();
    await daemon.stop();
  });

  it("does not accumulate periodic reconciliation ticks while one run is blocked", async () => {
    vi.useFakeTimers();
    const { daemon, liveSource } = daemonFixture({ backfillIntervalMs: 1000 });
    await daemon.start();
    const initialCalls = liveSource.confirmedCalls.length;
    const pending = deferred<void>();
    liveSource.confirmedDeferreds.push(pending);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(liveSource.confirmedCalls).toHaveLength(initialCalls + 1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(liveSource.confirmedCalls).toHaveLength(initialCalls + 1);

    pending.resolve();
    await daemon.stop();
  });

  it("coalesces websocket, public, and administrative requests for the same txid", async () => {
    const target = txid("a");
    const { daemon, engine, liveSource } = daemonFixture();
    await daemon.start();
    const work = deferred<void>();
    engine.deferredRuns.push(work);
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: target });
    await vi.waitFor(() => expect(engine.calls.filter((call) => call.txid === target)).toHaveLength(1));
    expect(daemon.requestIndex(target).status).toBe("already_queued");
    const administrative = daemon.indexAndWait(target);
    work.resolve();
    await expect(administrative).resolves.toMatchObject({ persistedRecord: true });
    expect(engine.calls.filter((call) => call.txid === target)).toHaveLength(1);
    await daemon.stop();
  });

  it("detects a checkpoint reorganization and invalidates transactions missing from Chronik", async () => {
    const oldTxid = txid("7");
    const { daemon, engine, store, liveSource } = daemonFixture();
    store.confirmed = [oldTxid];
    for (const protocol of ["TM0", "TM1"] as const) {
      store.upsertBackfillCheckpoint({
        protocol,
        lokadId: protocol === "TM0" ? "544d307c" : "544d4d00",
        txCountCursor: 1,
        historyTxCount: 1,
        complete: true,
        blockHeight: 899,
        blockHash: txid("1"),
        updatedAt: 1,
        lastSuccessAt: 1
      });
    }
    liveSource.blockHashes.set(899, txid("2"));
    engine.results.set(oldTxid, {
      verificationResult: { status: "TRANSACTION_NOT_FOUND" },
      attemptId: 1,
      persistedRecord: false
    });
    await daemon.start();
    expect(store.inactive).toContainEqual({ txid: oldTxid, reason: "INVALIDATED" });
    expect(daemon.getStatus().backfill.state).toBe("succeeded");
    await daemon.stop();
  });

  it("reports queue saturation with stable status and activity counters", async () => {
    const { daemon, engine } = daemonFixture({ queueLimit: 1 });
    await daemon.start();
    const blocked = deferred<void>();
    engine.deferredRuns.push(blocked);
    expect(daemon.requestIndex(txid("1")).status).toBe("queued");
    await vi.waitFor(() => expect(engine.calls.map((call) => call.txid)).toContain(txid("1")));
    expect(daemon.requestIndex(txid("2")).status).toBe("queued");
    expect(daemon.requestIndex(txid("3")).status).toBe("saturated");
    expect(daemon.getStatus()).toMatchObject({ queueSize: 1, queueRejected: 1 });
    blocked.resolve();
    await daemon.stop();
  });

  it("rapid connection callbacks serialize reconciliation without overlap", async () => {
    const { daemon, liveSource } = daemonFixture();
    const firstList = deferred<readonly string[]>();
    const secondList = deferred<readonly string[]>();
    liveSource.listDeferreds.push(firstList, secondList);
    const started = daemon.start();
    await vi.waitFor(() => expect(liveSource.unconfirmedCalls).toBe(1));
    liveSource.handlers?.onConnect?.();
    await flush();
    expect(liveSource.maxActiveUnconfirmedCalls).toBe(1);
    expect(liveSource.unconfirmedCalls).toBe(1);
    firstList.resolve([]);
    await vi.waitFor(() => expect(liveSource.unconfirmedCalls).toBe(2));
    expect(liveSource.maxActiveUnconfirmedCalls).toBe(1);
    secondList.resolve([]);
    await started;
  });

  it("connection callback reconciliation failures are caught and logged", async () => {
    const { daemon, liveSource, logs } = daemonFixture();
    await daemon.start();
    liveSource.failNextList = true;
    liveSource.handlers?.onConnect?.();
    await flush();
    expect(logs.records).toContainEqual({ level: "error", message: "Indexer daemon connection reconciliation failed." });
  });

  it("stop is idempotent and closes the live connection", async () => {
    const { daemon, liveSource } = daemonFixture();
    await daemon.start();
    await daemon.stop();
    await daemon.stop();
    expect(liveSource.connection.stops).toBe(1);
    expect(daemon.getStatus().state).toBe("stopped");
  });

  it("handles transaction events with required indexing and inactive behavior", async () => {
    const { daemon, engine, store, liveSource } = daemonFixture();
    await daemon.start();
    liveSource.handlers?.onEvent({ type: "transaction", event: "added-to-mempool", txid: txid("a") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("b") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "finalized", txid: txid("c") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "removed-from-mempool", txid: txid("d") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "invalidated", txid: txid("e") });
    await daemon.stop();
    expect(engine.calls).toEqual([
      { txid: txid("a"), options: { tipHeight: 900 } },
      { txid: txid("b"), options: {} },
      { txid: txid("c"), options: {} }
    ]);
    expect(store.inactive).toEqual([
      { txid: txid("d"), reason: "REMOVED_FROM_MEMPOOL" },
      { txid: txid("e"), reason: "INVALIDATED" }
    ]);
  });

  it("reconciles bounded block events and reconnects only after successful connection", async () => {
    const { daemon, engine, store, liveSource } = daemonFixture();
    store.unconfirmed = [txid("a"), txid("b"), txid("c")];
    store.confirmed = [txid("d"), txid("e"), txid("f")];
    liveSource.unconfirmed = [txid("0")];
    await daemon.start();
    liveSource.handlers?.onEvent({ type: "block", event: "connected", blockHash: txid("1"), blockHeight: 10, blockTimestamp: 11 });
    liveSource.handlers?.onEvent({ type: "block", event: "disconnected", blockHash: txid("2"), blockHeight: 20, blockTimestamp: 21 });
    liveSource.handlers?.onEvent({ type: "block", event: "invalidated", blockHash: txid("3"), blockHeight: 30, blockTimestamp: 31 });
    liveSource.handlers?.onReconnect?.();
    liveSource.handlers?.onConnect?.();
    liveSource.handlers?.onEvent({ type: "block", event: "finalized", blockHash: txid("4"), blockHeight: 40, blockTimestamp: 41 });
    await daemon.stop();
    expect(engine.calls.map((call) => call.txid)).toContain(txid("0"));
    expect(engine.calls.map((call) => call.txid)).toContain(txid("a"));
    expect(engine.calls.map((call) => call.txid)).toContain(txid("d"));
  });

  it("deduplicates queued txids, preserves FIFO, bounds growth, and survives failures", async () => {
    const { daemon, engine, liveSource, logs } = daemonFixture({ queueLimit: 2 });
    engine.failNext = true;
    await daemon.start();
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("a") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("a") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("b") });
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("c") });
    await daemon.stop();
    expect(engine.calls.map((call) => call.txid)).toEqual([txid("a"), txid("b"), txid("c")]);
    expect(logs.records.some((record) => record.level === "error")).toBe(true);
  });

  it("stop waits for accepted work before returning", async () => {
    const { daemon, engine, liveSource } = daemonFixture();
    await daemon.start();
    const work = deferred<void>();
    engine.deferredRuns.push(work);
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("a") });
    await vi.waitFor(() => expect(engine.calls).toHaveLength(1));
    let stopped = false;
    const stopping = daemon.stop().then(() => {
      stopped = true;
    });
    await flush();
    expect(stopped).toBe(false);
    work.resolve();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("ignores work after stop begins and logs websocket errors", async () => {
    const { daemon, engine, liveSource, logs } = daemonFixture();
    await daemon.start();
    const stopping = daemon.stop();
    liveSource.handlers?.onEvent({ type: "transaction", event: "confirmed", txid: txid("a") });
    liveSource.handlers?.onError?.(new Error("ws"));
    await stopping;
    await flush();
    expect(engine.calls).toEqual([]);
    expect(logs.records.some((record) => record.message.includes("Chronik live error"))).toBe(true);
  });

  it("ignores unknown events safely", async () => {
    const { daemon, engine, liveSource } = daemonFixture();
    await daemon.start();
    liveSource.handlers?.onEvent({ type: "unknown" } as unknown as ChronikLiveEvent);
    await daemon.stop();
    expect(engine.calls).toEqual([]);
  });
});

describe("BoundedWorkQueue drain", () => {
  it("successful drain clears the timeout", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { queue } = queueFixture();
    const work = deferred<void>();
    expect(queue.enqueue({ txid: txid("a"), run: () => work.promise }).status).toBe("queued");
    const drained = queue.drain(1000);
    work.resolve();
    await drained;
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("advancing timers after successful drain has no late timeout side effect", async () => {
    vi.useFakeTimers();
    const { logs, queue } = queueFixture();
    const work = deferred<void>();
    expect(queue.enqueue({ txid: txid("a"), run: () => work.promise }).status).toBe("queued");
    const drained = queue.drain(1000);
    work.resolve();
    await drained;
    await vi.advanceTimersByTimeAsync(1000);
    expect(logs.records).toEqual([]);
    expect(queue.active).toBe(0);
    expect(queue.size).toBe(0);
  });

  it("blocked queue rejects on drain timeout", async () => {
    vi.useFakeTimers();
    const { queue } = queueFixture();
    const work = deferred<void>();
    expect(queue.enqueue({ txid: txid("a"), run: () => work.promise }).status).toBe("queued");
    const drained = expect(queue.drain(1000)).rejects.toThrow("Indexer daemon queue drain timed out.");
    await vi.advanceTimersByTimeAsync(1000);
    await drained;
  });

  it("empty queue drains immediately", async () => {
    vi.useFakeTimers();
    const { queue } = queueFixture();
    await expect(queue.drain(1000)).resolves.toBeUndefined();
  });

  it("does not accept work after stopAccepting begins", async () => {
    const { queue } = queueFixture();
    queue.stopAccepting();
    expect(queue.enqueue({ txid: txid("a"), run: async () => undefined }).status).toBe("stopped");
    await expect(queue.drain(1000)).resolves.toBeUndefined();
  });
});
