import {
  TM0_LOKAD_ID,
  TM1_DRAFT_02_LOKAD_ID,
  type ChronikChainTip,
  type ChronikLiveConnection,
  type ChronikLiveEvent,
  type TonalliDiscoveryProtocol
} from "@tonalli-memo/chronik";
import type { BackfillCheckpoint, ConfirmedTransactionCursorRow, StoredMemoProtocol } from "../db/types.js";
import type { IndexingOutcome, IndexTransactionOptions } from "../engine/types.js";
import { BoundedWorkQueue } from "./queue.js";
import type {
  IndexRequestResult,
  IndexerDaemonOptions,
  IndexerDaemonState,
  IndexerDaemonStatus,
  QueueEnqueueResult
} from "./types.js";

const DEFAULT_RECONCILE_LIMIT = 100;
const DEFAULT_QUEUE_LIMIT = 1000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;
const DEFAULT_BACKFILL_INTERVAL_MS = 60_000;
const DEFAULT_BACKFILL_PAGE_SIZE = 100;
const DEFAULT_BACKFILL_MAX_PAGES = 100;
const DEFAULT_BACKFILL_OVERLAP_PAGES = 2;
const DEFAULT_READINESS_MAX_LAG_BLOCKS = 6;
const MAX_STABLE_TIP_ATTEMPTS = 3;

const DISCOVERY_PROTOCOLS: readonly {
  readonly protocol: TonalliDiscoveryProtocol;
  readonly lokadId: string;
}[] = [
  { protocol: "TM0", lokadId: TM0_LOKAD_ID },
  { protocol: "TM1", lokadId: TM1_DRAFT_02_LOKAD_ID }
];

interface ProtocolBackfillResult {
  readonly protocol: TonalliDiscoveryProtocol;
  readonly lokadId: string;
  readonly txCountCursor: number;
  readonly historyTxCount: number;
  readonly complete: boolean;
}

export class IndexQueueUnavailableError extends Error {
  readonly reason: "saturated" | "stopped";

  constructor(reason: "saturated" | "stopped") {
    super(reason === "saturated" ? "Indexer queue is saturated." : "Indexer queue is stopped.");
    this.name = "IndexQueueUnavailableError";
    this.reason = reason;
  }
}

export class IndexerDaemon {
  private readonly options: IndexerDaemonOptions;
  private readonly queue: BoundedWorkQueue;
  private state: IndexerDaemonState = "stopped";
  private connection: ChronikLiveConnection | null = null;
  private startPromise: Promise<void> | null = null;
  private reconciliationTail: Promise<void> = Promise.resolve();
  private connectCallbacks = 0;
  private stopping = false;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private websocketConnected = false;
  private chronikHeight: number | null = null;
  private lastEventAtMs: number | null = null;
  private lastSuccessfulIndexAtMs: number | null = null;
  private lastSuccessfulIndexTxid: string | null = null;
  private lastError: { readonly code: string; readonly atMs: number } | null = null;
  private backfillState: IndexerDaemonStatus["backfill"]["state"] = "idle";
  private backfillComplete = false;
  private backfillLastStartedAtMs: number | null = null;
  private backfillLastCompletedAtMs: number | null = null;
  private backfillConsecutiveFailures = 0;

  constructor(options: IndexerDaemonOptions) {
    this.options = options;
    validateDaemonOptions(options);
    this.queue = new BoundedWorkQueue({
      logger: options.logger,
      maxSize: options.queueLimit ?? DEFAULT_QUEUE_LIMIT,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY
    });
  }

  getStatus(): IndexerDaemonStatus {
    const checkpoints = this.options.store.listBackfillCheckpoints();
    const checkpointHeight = checkpoints.length === DISCOVERY_PROTOCOLS.length
      ? Math.min(...checkpoints.map((checkpoint) => checkpoint.blockHeight))
      : null;
    const lagBlocks = checkpointHeight === null || this.chronikHeight === null
      ? null
      : Math.max(0, this.chronikHeight - checkpointHeight);
    const queueActivity = this.queue.activity;
    const hasHealthyBackfill =
      this.backfillComplete &&
      this.backfillLastCompletedAtMs !== null &&
      this.backfillState !== "failed";
    const ready =
      this.state === "running" &&
      this.websocketConnected &&
      this.chronikHeight !== null &&
      hasHealthyBackfill &&
      lagBlocks !== null &&
      lagBlocks <= this.readinessMaxLagBlocks();
    return {
      state: this.state,
      websocketConnected: this.websocketConnected,
      chronikHeight: this.chronikHeight,
      lastEventAt: toIso(this.lastEventAtMs),
      lastSuccessfulIndexAt: toIso(this.lastSuccessfulIndexAtMs),
      lastSuccessfulIndexTxid: this.lastSuccessfulIndexTxid,
      queueSize: this.queue.size,
      activeCount: this.queue.active,
      queueAccepted: queueActivity.accepted,
      queueCompleted: queueActivity.completed,
      queueFailed: queueActivity.failed,
      queueRejected: queueActivity.rejected,
      queueLastActivityAt: toIso(queueActivity.lastActivityAtMs),
      lastError: this.lastError === null ? null : { code: this.lastError.code, at: toIso(this.lastError.atMs) ?? "" },
      backfill: {
        state: this.backfillState,
        complete: this.backfillComplete,
        lastStartedAt: toIso(this.backfillLastStartedAtMs),
        lastCompletedAt: toIso(this.backfillLastCompletedAtMs),
        checkpointHeight,
        lagBlocks,
        consecutiveFailures: this.backfillConsecutiveFailures
      },
      ready
    };
  }

  requestIndex(txid: string): IndexRequestResult {
    const transaction = this.options.store.getTransaction(txid);
    if (transaction?.isActive === true && this.options.store.getVerificationRecord(txid) !== null) {
      return { status: "already_indexed", completion: null };
    }
    const queued = this.enqueueTransaction(txid, {});
    return { status: queued.status, completion: queued.completion };
  }

  async indexAndWait(txid: string, options: IndexTransactionOptions = {}): Promise<IndexingOutcome> {
    const queued = this.enqueueTransaction(txid, options);
    return await this.awaitIndexingOutcome(txid, queued);
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
    this.websocketConnected = false;
    if (this.periodicTimer !== null) {
      clearTimeout(this.periodicTimer);
      this.periodicTimer = null;
    }
    const errors: unknown[] = [];
    try {
      await this.connection?.stop();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.reconciliationTail.catch(() => undefined);
      this.queue.stopAccepting();
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
          this.recordError(error);
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
      this.startPeriodicBackfill();
      this.options.logger.info("Indexer daemon started.", { state: this.state });
    } catch (error) {
      this.state = "failed";
      this.recordError(error);
      throw error;
    }
  }

  private handleLiveEvent(event: ChronikLiveEvent): void {
    if (this.stopping || this.state === "stopping" || this.state === "stopped") {
      return;
    }
    this.lastEventAtMs = Date.now();
    try {
      if (event.type === "transaction") {
        this.handleTransactionEvent(event);
        return;
      }
      this.handleBlockEvent(event);
    } catch (error) {
      this.recordError(error);
      this.options.logger.error("Indexer daemon ignored live event after handler failure.", {
        eventType: event.type,
        error: safeErrorName(error)
      });
    }
  }

  private handleTransactionEvent(event: Extract<ChronikLiveEvent, { type: "transaction" }>): void {
    switch (event.event) {
      case "added-to-mempool":
        this.enqueueTransactionWithTip(event.txid);
        return;
      case "confirmed":
      case "finalized":
        this.enqueueTransaction(event.txid, {});
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
    this.chronikHeight = event.blockHeight;
    switch (event.event) {
      case "connected":
        void this.reconcileKnownUnconfirmed().catch((error: unknown) => {
          this.recordError(error);
          this.options.logger.error("Indexer daemon block reconciliation failed.", { error: safeErrorName(error) });
        });
        return;
      case "disconnected":
      case "invalidated":
        void this.scheduleReorgReconciliation(event.blockHeight);
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
    this.websocketConnected = false;
    this.state = "reconnecting";
    this.options.logger.warn("Indexer daemon Chronik live reconnecting.", { state: this.state });
  }

  private handleConnect(): void {
    if (this.stopping) {
      return;
    }
    this.connectCallbacks += 1;
    this.websocketConnected = true;
    this.options.logger.info("Indexer daemon Chronik live connection opened.", { state: this.state });
    void this.scheduleFullReconciliation("connect")
      .then(() => {
        if (!this.stopping) {
          this.state = "running";
        }
      })
      .catch((error: unknown) => {
        this.recordError(error);
        this.options.logger.error("Indexer daemon connection reconciliation failed.", { error: safeErrorName(error) });
      });
  }

  private scheduleFullReconciliation(reason: "initial" | "connect" | "periodic"): Promise<void> {
    const run = this.reconciliationTail.catch(() => undefined).then(async () => {
      if (this.stopping) {
        return;
      }
      await this.reconcileConfirmed();
      await this.reconcileUnconfirmed();
    });
    this.reconciliationTail = run;
    this.options.logger.info("Indexer daemon scheduled reconciliation.", { reason });
    return run;
  }

  private scheduleReorgReconciliation(blockHeight: number): Promise<void> {
    const run = this.reconciliationTail.catch(() => undefined).then(async () => {
      await this.reconcileKnownConfirmed(blockHeight);
    });
    this.reconciliationTail = run;
    return run.catch((error: unknown) => {
      this.recordError(error);
      this.options.logger.error("Indexer daemon reorganization reconciliation failed.", {
        blockHeight,
        error: safeErrorName(error)
      });
    });
  }

  private async reconcileConfirmed(): Promise<void> {
    this.backfillState = "running";
    this.backfillLastStartedAtMs = Date.now();
    try {
      for (let stableAttempt = 1; stableAttempt <= MAX_STABLE_TIP_ATTEMPTS; stableAttempt += 1) {
        const startTip = await this.options.liveSource.getChainTip();
        this.chronikHeight = startTip.height;
        const reorgDetected = await this.hasCheckpointReorganization(startTip);
        if (reorgDetected) {
          this.options.logger.warn("Indexer daemon detected a chain reorganization during confirmed backfill.", {
            checkpointAction: "full-revalidation"
          });
          await this.reconcileKnownConfirmed(0);
        }

        const results: ProtocolBackfillResult[] = [];
        for (const discovery of DISCOVERY_PROTOCOLS) {
          results.push(await this.backfillProtocol(discovery.protocol, discovery.lokadId, reorgDetected));
        }

        const endTip = await this.options.liveSource.getChainTip();
        this.chronikHeight = endTip.height;
        if (sameTip(startTip, endTip)) {
          const nowSeconds = this.nowSeconds();
          for (const result of results) {
            this.options.store.upsertBackfillCheckpoint(createCheckpoint(result, endTip, nowSeconds));
          }
          this.backfillState = "succeeded";
          this.backfillComplete = results.every((result) => result.complete);
          this.backfillLastCompletedAtMs = Date.now();
          this.backfillConsecutiveFailures = 0;
          this.options.logger.info("Indexer daemon confirmed backfill completed.", {
            tipHeight: endTip.height,
            protocols: results.map((result) => ({
              protocol: result.protocol,
              cursor: result.txCountCursor,
              historyTxCount: result.historyTxCount,
              complete: result.complete
            }))
          });
          return;
        }

        this.options.logger.warn("Chronik tip moved during confirmed backfill; retrying from the durable checkpoint.", {
          stableAttempt,
          startHeight: startTip.height,
          endHeight: endTip.height
        });
      }
      throw new Error("Chronik tip did not remain stable during confirmed backfill.");
    } catch (error) {
      this.backfillState = "failed";
      this.backfillLastCompletedAtMs = Date.now();
      this.backfillConsecutiveFailures += 1;
      this.recordError(error);
      this.options.logger.error("Indexer daemon confirmed backfill failed.", {
        error: safeErrorName(error),
        consecutiveFailures: this.backfillConsecutiveFailures
      });
      throw error;
    }
  }

  private async backfillProtocol(
    protocol: TonalliDiscoveryProtocol,
    lokadId: string,
    resetCursor: boolean
  ): Promise<ProtocolBackfillResult> {
    const checkpoint = resetCursor ? null : this.options.store.getBackfillCheckpoint(protocol);
    const pageSize = this.backfillPageSize();
    const maxPages = this.backfillMaxPagesPerRun();
    const fetchedPages = new Set<number>();
    const indexedTxids = new Set<string>();
    let historyTxCount: number | null = null;
    let historyPageCount: number | null = null;

    const fetchAndIndexPage = async (page: number) => {
      const result = await this.options.liveSource.listTonalliConfirmedTxs(protocol, page, this.backfillPageSize());
      if (historyTxCount === null) {
        historyTxCount = result.numTxs;
        historyPageCount = result.numPages;
      } else if (result.numTxs !== historyTxCount || result.numPages !== historyPageCount) {
        throw new Error("Chronik confirmed history changed during protocol backfill.");
      }
      for (const candidate of result.txs) {
        if (indexedTxids.has(candidate.txid)) {
          continue;
        }
        const outcome = await this.indexAndWait(candidate.txid);
        if (!outcome.persistedRecord) {
          this.options.logger.error("Confirmed Tonalli candidate was not processed durably.", {
            protocol,
            txid: candidate.txid,
            status: outcome.verificationResult.status
          });
          throw new Error("Confirmed Tonalli candidate did not produce a durable indexing result.");
        }
        indexedTxids.add(candidate.txid);
      }
      fetchedPages.add(page);
      return result;
    };

    const firstPage = await fetchAndIndexPage(0);
    const totalTxs = firstPage.numTxs;
    const totalPages = firstPage.numPages;
    if (totalPages <= 1) {
      return { protocol, lokadId, txCountCursor: totalTxs, historyTxCount: totalTxs, complete: true };
    }

    const checkpointUsable = checkpoint !== null && totalTxs >= checkpoint.historyTxCount;
    if (!checkpointUsable) {
      if (checkpoint !== null) {
        this.options.logger.warn("Chronik confirmed history count moved backwards; restarting protocol backfill.", {
          protocol,
          previousHistoryTxCount: checkpoint.historyTxCount,
          historyTxCount: totalTxs
        });
      }
      let page = 1;
      while (page < totalPages && fetchedPages.size < maxPages) {
        await fetchAndIndexPage(page);
        page += 1;
      }
      const cursor = Math.min(totalTxs, page * pageSize);
      return { protocol, lokadId, txCountCursor: cursor, historyTxCount: totalTxs, complete: cursor >= totalTxs };
    }

    const newTxCount = totalTxs - checkpoint.historyTxCount;
    const pagesContainingNewTransactions = Math.ceil(newTxCount / pageSize);
    let page = 1;
    while (page < pagesContainingNewTransactions && fetchedPages.size < maxPages) {
      await fetchAndIndexPage(page);
      page += 1;
    }
    if (page < pagesContainingNewTransactions) {
      const cursor = Math.min(totalTxs, page * pageSize);
      return { protocol, lokadId, txCountCursor: cursor, historyTxCount: totalTxs, complete: false };
    }

    const shiftedCursor = Math.min(totalTxs, checkpoint.txCountCursor + newTxCount);
    if (checkpoint.complete) {
      const overlapEndPage = Math.min(
        totalPages,
        Math.max(1, pagesContainingNewTransactions) + this.backfillOverlapPages()
      );
      while (page < overlapEndPage && fetchedPages.size < maxPages) {
        await fetchAndIndexPage(page);
        page += 1;
      }
      return { protocol, lokadId, txCountCursor: totalTxs, historyTxCount: totalTxs, complete: true };
    }

    let cursor = shiftedCursor;
    page = Math.floor(cursor / pageSize);
    const pageZeroIsOnlyAProbe = newTxCount === 0 && page > 0;
    const allowedFetchedPages = maxPages + (pageZeroIsOnlyAProbe ? 1 : 0);
    while (page < totalPages) {
      if (!fetchedPages.has(page) && fetchedPages.size >= allowedFetchedPages) {
        break;
      }
      if (!fetchedPages.has(page)) await fetchAndIndexPage(page);
      cursor = Math.max(cursor, Math.min(totalTxs, (page + 1) * pageSize));
      page += 1;
    }
    return { protocol, lokadId, txCountCursor: cursor, historyTxCount: totalTxs, complete: cursor >= totalTxs };
  }

  private async hasCheckpointReorganization(tip: ChronikChainTip): Promise<boolean> {
    for (const checkpoint of this.options.store.listBackfillCheckpoints()) {
      if (checkpoint.blockHeight > tip.height) {
        return true;
      }
      const currentHash = await this.options.liveSource.getBlockHash(checkpoint.blockHeight);
      if (currentHash !== checkpoint.blockHash) {
        return true;
      }
    }
    return false;
  }

  private async reconcileUnconfirmed(): Promise<void> {
    const tipHeight = await this.options.liveSource.getTipHeight();
    this.chronikHeight = tipHeight;
    for (const txid of await this.options.liveSource.listTonalliUnconfirmedTxids()) {
      this.enqueueTransaction(txid, { tipHeight });
    }
    await this.reconcileKnownUnconfirmed(tipHeight);
  }

  private async reconcileKnownUnconfirmed(existingTipHeight?: number): Promise<void> {
    const tipHeight = existingTipHeight ?? (await this.options.liveSource.getTipHeight());
    this.chronikHeight = tipHeight;
    for (const txid of this.options.store.listActiveUnconfirmedTxids(this.reconcileLimit())) {
      this.enqueueTransaction(txid, { tipHeight });
    }
  }

  private async reconcileKnownConfirmed(minimumHeight: number): Promise<void> {
    const tipHeight = await this.options.liveSource.getTipHeight();
    this.chronikHeight = tipHeight;
    let cursor: ConfirmedTransactionCursorRow | null = null;
    while (true) {
      const rows = this.options.store.listActiveConfirmedTransactionsPage(minimumHeight, this.reconcileLimit(), cursor);
      if (rows.length === 0) {
        return;
      }
      for (const row of rows) {
        const outcome = await this.indexAndWait(row.txid, { tipHeight });
        if (outcome.verificationResult.status === "TRANSACTION_NOT_FOUND") {
          this.options.store.markTransactionInactive(row.txid, "INVALIDATED");
        } else if (!outcome.persistedRecord) {
          throw new Error("Known confirmed transaction revalidation did not complete durably.");
        }
      }
      cursor = rows[rows.length - 1] ?? cursor;
      if (rows.length < this.reconcileLimit()) {
        return;
      }
    }
  }

  private enqueueTransactionWithTip(txid: string): void {
    const queued = this.queue.enqueue({
      txid,
      run: async () => {
        const tipHeight = await this.options.liveSource.getTipHeight();
        this.chronikHeight = tipHeight;
        return await this.runIndex(txid, { tipHeight });
      }
    });
    if (queued.status === "saturated") {
      this.recordError(new IndexQueueUnavailableError("saturated"));
    }
  }

  private enqueueTransaction(txid: string, options: IndexTransactionOptions): QueueEnqueueResult {
    const queued = this.queue.enqueue({
      txid,
      run: async () => await this.runIndex(txid, options)
    });
    if (queued.status === "saturated") {
      this.recordError(new IndexQueueUnavailableError("saturated"));
    }
    return queued;
  }

  private async runIndex(txid: string, options: IndexTransactionOptions): Promise<IndexingOutcome> {
    const outcome = await this.options.engine.indexTransaction(txid, options);
    if (outcome.persistedRecord) {
      this.lastSuccessfulIndexAtMs = Date.now();
      this.lastSuccessfulIndexTxid = txid;
    }
    return outcome;
  }

  private async awaitIndexingOutcome(txid: string, queued: QueueEnqueueResult): Promise<IndexingOutcome> {
    if (queued.completion === null) {
      const reason = queued.status === "saturated" ? "saturated" : "stopped";
      if (reason === "saturated") {
        this.options.logger.error("Confirmed Tonalli candidate could not enter the saturated queue.", { txid });
      }
      throw new IndexQueueUnavailableError(reason);
    }
    const completion = await queued.completion;
    if (!completion.ok) {
      throw completion.error;
    }
    return completion.value as IndexingOutcome;
  }

  private startPeriodicBackfill(): void {
    if (this.periodicTimer !== null) {
      return;
    }
    this.periodicTimer = setTimeout(() => {
      this.periodicTimer = null;
      void this.scheduleFullReconciliation("periodic")
        .catch((error: unknown) => {
          this.recordError(error);
        })
        .finally(() => {
          if (!this.stopping && this.state !== "stopped") {
            this.startPeriodicBackfill();
          }
        });
    }, this.backfillIntervalMs());
    this.periodicTimer.unref?.();
  }

  private recordError(error: unknown): void {
    this.lastError = { code: safeErrorName(error), atMs: Date.now() };
  }

  private nowSeconds(): number {
    return this.options.clock?.nowSeconds() ?? Math.floor(Date.now() / 1000);
  }

  private reconcileLimit(): number {
    return this.options.reconcileLimit ?? DEFAULT_RECONCILE_LIMIT;
  }

  private backfillIntervalMs(): number {
    return this.options.backfillIntervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS;
  }

  private backfillPageSize(): number {
    return this.options.backfillPageSize ?? DEFAULT_BACKFILL_PAGE_SIZE;
  }

  private backfillMaxPagesPerRun(): number {
    return this.options.backfillMaxPagesPerRun ?? DEFAULT_BACKFILL_MAX_PAGES;
  }

  private backfillOverlapPages(): number {
    return this.options.backfillOverlapPages ?? DEFAULT_BACKFILL_OVERLAP_PAGES;
  }

  private readinessMaxLagBlocks(): number {
    return this.options.readinessMaxLagBlocks ?? DEFAULT_READINESS_MAX_LAG_BLOCKS;
  }
}

function createCheckpoint(
  result: ProtocolBackfillResult,
  stableTip: ChronikChainTip,
  nowSeconds: number
): BackfillCheckpoint {
  return {
    protocol: result.protocol as StoredMemoProtocol,
    lokadId: result.lokadId,
    txCountCursor: result.txCountCursor,
    historyTxCount: result.historyTxCount,
    complete: result.complete,
    blockHeight: stableTip.height,
    blockHash: stableTip.hash,
    updatedAt: nowSeconds,
    lastSuccessAt: nowSeconds
  };
}

function sameTip(left: ChronikChainTip, right: ChronikChainTip): boolean {
  return left.height === right.height && left.hash === right.hash;
}

function toIso(milliseconds: number | null): string | null {
  return milliseconds === null ? null : new Date(milliseconds).toISOString();
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function validateDaemonOptions(options: IndexerDaemonOptions): void {
  validatePositiveInteger(options.reconcileLimit ?? DEFAULT_RECONCILE_LIMIT, "Reconcile limit", 1000);
  validatePositiveInteger(options.queueLimit ?? DEFAULT_QUEUE_LIMIT, "Queue limit");
  validatePositiveInteger(options.concurrency ?? DEFAULT_CONCURRENCY, "Queue concurrency");
  validatePositiveInteger(options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS, "Drain timeout");
  validatePositiveInteger(options.backfillIntervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS, "Backfill interval");
  validatePositiveInteger(options.backfillPageSize ?? DEFAULT_BACKFILL_PAGE_SIZE, "Backfill page size", 199);
  validatePositiveInteger(options.backfillMaxPagesPerRun ?? DEFAULT_BACKFILL_MAX_PAGES, "Backfill max pages");
  const overlap = options.backfillOverlapPages ?? DEFAULT_BACKFILL_OVERLAP_PAGES;
  if (!Number.isSafeInteger(overlap) || overlap < 0) {
    throw new Error("Backfill overlap pages must be a non-negative safe integer.");
  }
  const lag = options.readinessMaxLagBlocks ?? DEFAULT_READINESS_MAX_LAG_BLOCKS;
  if (!Number.isSafeInteger(lag) || lag < 0) {
    throw new Error("Readiness max lag blocks must be a non-negative safe integer.");
  }
}

function validatePositiveInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be a positive safe integer no greater than ${maximum}.`);
  }
}
