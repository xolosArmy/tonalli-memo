import type { ChronikLiveConnection, ChronikLiveEvent } from "@tonalli-memo/chronik";
import { BoundedWorkQueue } from "./queue.js";
import type { IndexerDaemonOptions, IndexerDaemonState, IndexerDaemonStatus } from "./types.js";

const DEFAULT_RECONCILE_LIMIT = 100;
const DEFAULT_QUEUE_LIMIT = 1000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

export class IndexerDaemon {
  private readonly options: IndexerDaemonOptions;
  private readonly queue: BoundedWorkQueue;
  private state: IndexerDaemonState = "stopped";
  private connection: ChronikLiveConnection | null = null;
  private startPromise: Promise<void> | null = null;
  private reconciliationTail: Promise<void> = Promise.resolve();
  private connectCallbacks = 0;
  private stopping = false;

  constructor(options: IndexerDaemonOptions) {
    this.options = options;
    this.queue = new BoundedWorkQueue({
      logger: options.logger,
      maxSize: options.queueLimit ?? DEFAULT_QUEUE_LIMIT,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY
    });
  }

  getStatus(): IndexerDaemonStatus {
    return {
      state: this.state,
      queueSize: this.queue.size,
      activeCount: this.queue.active
    };
  }

  async start(): Promise<void> {
    if (this.startPromise !== null) {
      return this.startPromise;
    }
    if (this.state !== "stopped") {
      throw new Error(`Indexer daemon cannot start from state ${this.state}.`);
    }
    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    if (this.state === "stopped") {
      return;
    }
    this.stopping = true;
    this.state = "stopping";
    this.queue.stopAccepting();
    const errors: unknown[] = [];
    try {
      await this.connection?.stop();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.queue.drain(this.options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS);
    } catch (error) {
      errors.push(error);
    }
    this.connection = null;
    this.state = "stopped";
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Indexer daemon shutdown failed.");
    }
  }

  private async startInternal(): Promise<void> {
    this.state = "starting";
    try {
      this.connection = this.options.liveSource.createConnection({
        onEvent: (event) => {
          this.handleLiveEvent(event);
        },
        onConnect: () => {
          this.handleConnect();
        },
        onReconnect: () => {
          this.handleReconnect();
        },
        onError: (error) => {
          this.options.logger.error("Indexer daemon Chronik live error.", { error: safeErrorName(error), state: this.state });
        }
      });
      const connectCallbacksBeforeStart = this.connectCallbacks;
      await this.connection.start();
      if (this.connectCallbacks === connectCallbacksBeforeStart) {
        await this.scheduleFullReconciliation("initial");
      } else {
        await this.reconciliationTail;
      }
      this.state = "running";
      this.options.logger.info("Indexer daemon started.", { state: this.state });
    } catch (error) {
      this.state = "failed";
      throw error;
    }
  }

  private handleLiveEvent(event: ChronikLiveEvent): void {
    if (this.stopping || this.state === "stopping" || this.state === "stopped") {
      return;
    }
    try {
      if (event.type === "transaction") {
        this.handleTransactionEvent(event);
        return;
      }
      this.handleBlockEvent(event);
    } catch (error) {
      this.options.logger.error("Indexer daemon ignored live event after handler failure.", {
        eventType: event.type,
        error: safeErrorName(error)
      });
    }
  }

  private handleTransactionEvent(event: Extract<ChronikLiveEvent, { type: "transaction" }>): void {
    switch (event.event) {
      case "added-to-mempool":
        this.enqueueIndex(event.txid, async () => {
          const tipHeight = await this.options.liveSource.getTipHeight();
          await this.options.engine.indexTransaction(event.txid, { tipHeight });
        });
        return;
      case "confirmed":
      case "finalized":
        this.enqueueIndex(event.txid, async () => {
          await this.options.engine.indexTransaction(event.txid);
        });
        return;
      case "removed-from-mempool":
        this.options.store.markTransactionInactive(event.txid, "REMOVED_FROM_MEMPOOL");
        return;
      case "invalidated":
        this.options.store.markTransactionInactive(event.txid, "INVALIDATED");
        return;
    }
  }

  private handleBlockEvent(event: Extract<ChronikLiveEvent, { type: "block" }>): void {
    switch (event.event) {
      case "connected":
        void this.reconcileKnownUnconfirmed().catch((error: unknown) => {
          this.options.logger.error("Indexer daemon block reconciliation failed.", { error: safeErrorName(error) });
        });
        return;
      case "disconnected":
      case "invalidated":
        this.reconcileAffectedConfirmed(event.blockHeight);
        return;
      case "finalized":
        this.options.logger.info("Indexer daemon observed finalized block.", { blockHeight: event.blockHeight });
        return;
    }
  }

  private handleReconnect(): void {
    if (this.stopping) {
      return;
    }
    this.state = "reconnecting";
    this.options.logger.warn("Indexer daemon Chronik live reconnecting.", { state: this.state });
  }

  private handleConnect(): void {
    if (this.stopping) {
      return;
    }
    this.connectCallbacks += 1;
    this.options.logger.info("Indexer daemon Chronik live connection opened.", { state: this.state });
    void this.scheduleFullReconciliation("connect")
      .then(() => {
        if (!this.stopping) {
          this.state = "running";
        }
      })
      .catch((error: unknown) => {
        this.options.logger.error("Indexer daemon connection reconciliation failed.", { error: safeErrorName(error) });
      });
  }

  private scheduleFullReconciliation(reason: "initial" | "connect"): Promise<void> {
    const run = this.reconciliationTail.catch(() => undefined).then(async () => {
      if (this.stopping) {
        return;
      }
      await this.reconcileUnconfirmed();
    });
    this.reconciliationTail = run;
    this.options.logger.info("Indexer daemon scheduled reconciliation.", { reason });
    return run;
  }

  private async reconcileUnconfirmed(): Promise<void> {
    const tipHeight = await this.options.liveSource.getTipHeight();
    for (const txid of await this.options.liveSource.listTonalliUnconfirmedTxids()) {
      this.enqueueIndex(txid, async () => {
        await this.options.engine.indexTransaction(txid, { tipHeight });
      });
    }
    await this.reconcileKnownUnconfirmed(tipHeight);
  }

  private async reconcileKnownUnconfirmed(existingTipHeight?: number): Promise<void> {
    const tipHeight = existingTipHeight ?? (await this.options.liveSource.getTipHeight());
    for (const txid of this.options.store.listActiveUnconfirmedTxids(this.reconcileLimit())) {
      this.enqueueIndex(txid, async () => {
        await this.options.engine.indexTransaction(txid, { tipHeight });
      });
    }
  }

  private reconcileAffectedConfirmed(blockHeight: number): void {
    for (const txid of this.options.store.listActiveConfirmedTxidsAtOrAbove(blockHeight, this.reconcileLimit())) {
      this.enqueueIndex(txid, async () => {
        const outcome = await this.options.engine.indexTransaction(txid);
        if (outcome.verificationResult.status === "TRANSACTION_NOT_FOUND") {
          this.options.store.markTransactionInactive(txid, "INVALIDATED");
        }
      });
    }
  }

  private enqueueIndex(txid: string, run: () => Promise<void>): void {
    this.queue.enqueue({ txid, run });
  }

  private reconcileLimit(): number {
    return this.options.reconcileLimit ?? DEFAULT_RECONCILE_LIMIT;
  }
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
