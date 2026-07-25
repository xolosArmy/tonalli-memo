import type { MemoVerificationService, VerificationResult } from "@tonalli-memo/verification";
import type { MemoStore } from "../db/store.js";

export interface IndexerClock {
  nowSeconds(): number;
}

export const systemClock: IndexerClock = {
  nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }
};

export interface IndexTransactionOptions {
  readonly tipHeight?: number;
}

export interface IndexingOutcome {
  readonly verificationResult: VerificationResult;
  readonly attemptId: number;
  readonly persistedRecord: boolean;
}

export interface IndexingEngineOptions {
  readonly verificationService: MemoVerificationService;
  readonly store: MemoStore;
  readonly clock?: IndexerClock;
}

export function validateUnixSeconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Indexer clock returned invalid Unix seconds: ${value}.`);
  }
  return value;
}
