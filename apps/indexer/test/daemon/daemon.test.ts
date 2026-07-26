import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedWorkQueue, IndexerDaemon } from "../../src/index.js";
import type { ChronikLiveConnection, ChronikLiveEvent, ChronikLiveHandlers, ChronikLiveSource } from "@tonalli-memo/chronik";
import type { IndexingEngine } from "../../src/engine/indexer.js";
import type { MemoStore } from "../../src/db/store.js";

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
  unconfirmed: string[] = [];
  tipHeightCalls = 0;
  unconfirmedCalls = 0;
  activeUnconfirmedCalls = 0;
  maxActiveUnconfirmedCalls = 0;
  listDeferreds: Array<Deferred<readonly string[]>> = [];
  failNextList = false;

  createConnection(handlers: ChronikLiveHandlers): ChronikLiveConnection {
    this.handlers = handlers;
    this.connection.handlers = handlers;
    return this.connection;
  }

  async getTipHeight(): Promise<number> {
    this.tipHeightCalls += 1;
    return this.tipHeight;
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
}

class FakeEngine {
  calls: Array<{ readonly txid: string; readonly options: unknown }> = [];
  deferredRuns: Array<Deferred<void>> = [];
  failNext = false;

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
    return { verificationResult: { status: "VERIFIED" } };
  }
}

class FakeStore {
  inactive: Array<{ readonly txid: string; readonly reason: string }> = [];
  unconfirmed: string[] = [];
  confirmed: string[] = [];

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

function daemonFixture(options: { readonly queueLimit?: number; readonly drainTimeoutMs?: number } = {}) {
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
    drainTimeoutMs: options.drainTimeoutMs ?? 1000
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
    expect(liveSource.tipHeightCalls).toBe(1);
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
    expect(queue.enqueue({ txid: txid("a"), run: () => work.promise })).toBe(true);
    const drained = queue.drain(1000);
    work.resolve();
    await drained;
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("advancing timers after successful drain has no late timeout side effect", async () => {
    vi.useFakeTimers();
    const { logs, queue } = queueFixture();
    const work = deferred<void>();
    expect(queue.enqueue({ txid: txid("a"), run: () => work.promise })).toBe(true);
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
    expect(queue.enqueue({ txid: txid("a"), run: () => work.promise })).toBe(true);
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
    expect(queue.enqueue({ txid: txid("a"), run: async () => undefined })).toBe(false);
    await expect(queue.drain(1000)).resolves.toBeUndefined();
  });
});
