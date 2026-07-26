import type { IndexerDaemonLogger, QueueWorkItem } from "./types.js";

export interface WorkQueueOptions {
  readonly logger: IndexerDaemonLogger;
  readonly maxSize: number;
  readonly concurrency: number;
}

interface IdleWaiter {
  resolve(): void;
  reject(error: Error): void;
}

export class BoundedWorkQueue {
  private readonly logger: IndexerDaemonLogger;
  private readonly maxSize: number;
  private readonly concurrency: number;
  private readonly pending: QueueWorkItem[] = [];
  private readonly inFlight = new Set<string>();
  private activeCount = 0;
  private accepting = true;
  private idleWaiters: IdleWaiter[] = [];

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

  stopAccepting(): void {
    this.accepting = false;
  }

  enqueue(item: QueueWorkItem): boolean {
    if (!this.accepting) {
      return false;
    }
    if (this.inFlight.has(item.txid)) {
      return true;
    }
    if (this.pending.length >= this.maxSize) {
      this.logger.error("Indexer daemon queue limit reached.", { txid: item.txid, queueSize: this.pending.length });
      return false;
    }
    this.inFlight.add(item.txid);
    this.pending.push(item);
    this.pump();
    return true;
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

  private async runItem(item: QueueWorkItem): Promise<void> {
    try {
      await item.run();
    } catch (error) {
      this.logger.error("Indexer daemon work item failed.", { txid: item.txid, error: toSafeErrorName(error) });
    } finally {
      this.activeCount -= 1;
      this.inFlight.delete(item.txid);
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
