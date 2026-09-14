import type {
  IndexerDaemonLogger,
  QueueActivitySnapshot,
  QueueCompletion,
  QueueEnqueueResult,
  QueueWorkItem
} from "./types.js";

export interface WorkQueueOptions {
  readonly logger: IndexerDaemonLogger;
  readonly maxSize: number;
  readonly concurrency: number;
}

interface IdleWaiter {
  resolve(): void;
  reject(error: Error): void;
}

interface PendingWorkItem extends QueueWorkItem {
  readonly complete: (result: QueueCompletion) => void;
}

export class BoundedWorkQueue {
  private readonly logger: IndexerDaemonLogger;
  private readonly maxSize: number;
  private readonly concurrency: number;
  private readonly pending: PendingWorkItem[] = [];
  private readonly inFlight = new Map<string, Promise<QueueCompletion>>();
  private activeCount = 0;
  private accepting = true;
  private idleWaiters: IdleWaiter[] = [];
  private acceptedCount = 0;
  private completedCount = 0;
  private failedCount = 0;
  private rejectedCount = 0;
  private lastActivityAtMs: number | null = null;

  constructor(options: WorkQueueOptions) {
    this.logger = options.logger;
    this.maxSize = validatePositiveInteger(options.maxSize, "Queue max size");
    this.concurrency = validatePositiveInteger(options.concurrency, "Queue concurrency");
  }

  get size(): number {
    return this.pending.length;
  }

  get active(): number {
    return this.activeCount;
  }

  get activity(): QueueActivitySnapshot {
    return {
      accepted: this.acceptedCount,
      completed: this.completedCount,
      failed: this.failedCount,
      rejected: this.rejectedCount,
      lastActivityAtMs: this.lastActivityAtMs
    };
  }

  stopAccepting(): void {
    this.accepting = false;
  }

  enqueue(item: QueueWorkItem): QueueEnqueueResult {
    if (!this.accepting) {
      this.recordRejected();
      return { status: "stopped", completion: null };
    }
    const existing = this.inFlight.get(item.txid);
    if (existing !== undefined) {
      this.touch();
      return { status: "already_queued", completion: existing };
    }
    if (this.pending.length >= this.maxSize) {
      this.recordRejected();
      this.logger.error("Indexer daemon queue limit reached.", { txid: item.txid, queueSize: this.pending.length });
      return { status: "saturated", completion: null };
    }
    let complete!: (result: QueueCompletion) => void;
    const completion = new Promise<QueueCompletion>((resolve) => {
      complete = resolve;
    });
    this.inFlight.set(item.txid, completion);
    this.pending.push({ ...item, complete });
    this.acceptedCount += 1;
    this.touch();
    this.pump();
    return { status: "queued", completion };
  }

  async drain(timeoutMs: number): Promise<void> {
    if (this.pending.length === 0 && this.activeCount === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const waiter: IdleWaiter = {
        resolve: () => {
          cleanup();
          resolve();
        },
        reject: (error: Error) => {
          cleanup();
          reject(error);
        }
      };
      const cleanup = () => {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        const index = this.idleWaiters.indexOf(waiter);
        if (index !== -1) {
          this.idleWaiters.splice(index, 1);
        }
      };

      timeout = setTimeout(() => {
        waiter.reject(new Error("Indexer daemon queue drain timed out."));
      }, timeoutMs);
      timeout.unref?.();
      this.idleWaiters.push(waiter);
      this.resolveIdleIfNeeded();
    });
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift();
      if (item === undefined) {
        return;
      }
      this.activeCount += 1;
      void this.runItem(item);
    }
  }

  private async runItem(item: PendingWorkItem): Promise<void> {
    try {
      const value = await item.run();
      this.completedCount += 1;
      item.complete({ ok: true, value });
    } catch (error) {
      this.failedCount += 1;
      item.complete({ ok: false, error });
      this.logger.error("Indexer daemon work item failed.", { txid: item.txid, error: toSafeErrorName(error) });
    } finally {
      this.activeCount -= 1;
      this.inFlight.delete(item.txid);
      this.touch();
      this.resolveIdleIfNeeded();
      this.pump();
    }
  }

  private resolveIdleIfNeeded(): void {
    if (this.pending.length !== 0 || this.activeCount !== 0) {
      return;
    }
    for (const waiter of this.idleWaiters.splice(0)) {
      waiter.resolve();
    }
  }

  private recordRejected(): void {
    this.rejectedCount += 1;
    this.touch();
  }

  private touch(): void {
    this.lastActivityAtMs = Date.now();
  }
}

function validatePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function toSafeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
