import type { ChronikLiveSource } from "@tonalli-memo/chronik";
import type { MemoStore } from "../db/store.js";
import type { IndexingEngine } from "../engine/indexer.js";
import type { IndexerClock } from "../engine/types.js";

export type IndexerDaemonState = "stopped" | "starting" | "running" | "reconnecting" | "stopping" | "failed";

export interface IndexerDaemonStatus {
  readonly state: IndexerDaemonState;
  readonly queueSize: number;
  readonly activeCount: number;
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
  readonly queueLimit?: number;
  readonly concurrency?: number;
  readonly drainTimeoutMs?: number;
}

export interface QueueWorkItem {
  readonly txid: string;
  readonly run: () => Promise<void>;
}
