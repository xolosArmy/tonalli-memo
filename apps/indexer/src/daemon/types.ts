import type { ChronikLiveSource } from "@tonalli-memo/chronik";
import type { MemoStore } from "../db/store.js";
import type { IndexingEngine } from "../engine/indexer.js";
import type { IndexerClock } from "../engine/types.js";
import type { IndexingOutcome, IndexTransactionOptions } from "../engine/types.js";

export type IndexerDaemonState = "stopped" | "starting" | "running" | "reconnecting" | "stopping" | "failed";

export interface IndexerDaemonStatus {
  readonly state: IndexerDaemonState;
  readonly websocketConnected: boolean;
  readonly chronikHeight: number | null;
  readonly lastEventAt: string | null;
  readonly lastSuccessfulIndexAt: string | null;
  readonly lastSuccessfulIndexTxid: string | null;
  readonly queueSize: number;
  readonly activeCount: number;
  readonly queueAccepted: number;
  readonly queueCompleted: number;
  readonly queueFailed: number;
  readonly queueRejected: number;
  readonly queueLastActivityAt: string | null;
  readonly lastError: { readonly code: string; readonly at: string } | null;
  readonly backfill: {
    readonly state: "idle" | "running" | "succeeded" | "failed";
    readonly complete: boolean;
    readonly lastStartedAt: string | null;
    readonly lastCompletedAt: string | null;
    readonly checkpointHeight: number | null;
    readonly lagBlocks: number | null;
    readonly consecutiveFailures: number;
  };
  readonly ready: boolean;
}

export interface IndexerDaemonLogger {
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface IndexerDaemonOptions {
  readonly engine: IndexingEngine;
  readonly store: MemoStore;
  readonly liveSource: ChronikLiveSource;
  readonly logger: IndexerDaemonLogger;
  readonly clock?: IndexerClock;
  readonly reconcileLimit?: number;
  readonly backfillIntervalMs?: number;
  readonly backfillPageSize?: number;
  readonly backfillMaxPagesPerRun?: number;
  readonly backfillOverlapPages?: number;
  readonly readinessMaxLagBlocks?: number;
  readonly queueLimit?: number;
  readonly concurrency?: number;
  readonly drainTimeoutMs?: number;
}

export interface QueueWorkItem {
  readonly txid: string;
  readonly run: () => Promise<unknown>;
}

export type QueueEnqueueStatus = "queued" | "already_queued" | "saturated" | "stopped";

export type QueueCompletion =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: unknown };

export interface QueueEnqueueResult {
  readonly status: QueueEnqueueStatus;
  readonly completion: Promise<QueueCompletion> | null;
}

export interface QueueActivitySnapshot {
  readonly accepted: number;
  readonly completed: number;
  readonly failed: number;
  readonly rejected: number;
  readonly lastActivityAtMs: number | null;
}

export interface IndexRequestResult {
  readonly status: "queued" | "already_queued" | "already_indexed" | "saturated" | "stopped";
  readonly completion: Promise<QueueCompletion> | null;
}

export interface IndexRequestService {
  requestIndex(txid: string): IndexRequestResult;
  indexAndWait(txid: string, options?: IndexTransactionOptions): Promise<IndexingOutcome>;
  getStatus(): IndexerDaemonStatus;
}
