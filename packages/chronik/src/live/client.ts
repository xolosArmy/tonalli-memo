import { ChronikClient } from "chronik-client";
import { TONALLI_DISCOVERY_LOKAD_IDS, mapChronikLiveMessage } from "./mapper.js";
import { isCanonicalTxid } from "../txid.js";
import { ChronikWsHeartbeat } from "./heartbeat.js";
import type {
  ChronikConfirmedTxPage,
  ChronikLiveConnection,
  ChronikLiveHandlers,
  ChronikLiveOptions,
  ChronikLiveSdkSource,
  ChronikLiveSource,
  ChronikLiveWsEndpoint,
  TonalliDiscoveryProtocol
} from "./types.js";

const LOKAD_ID_BY_PROTOCOL: Readonly<Record<TonalliDiscoveryProtocol, string>> = {
  TM0: TONALLI_DISCOVERY_LOKAD_IDS[0],
  TM1: TONALLI_DISCOVERY_LOKAD_IDS[1]
};

class ChronikClientLiveSource implements ChronikLiveSource {
  private readonly source: ChronikLiveSdkSource;
  private readonly logger: ChronikLiveOptions["logger"];
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;

  constructor(options: ChronikLiveOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 15_000;
    if (options.source === undefined) {
      if (options.urls === undefined || options.urls.length === 0) {
        throw new Error("At least one Chronik URL is required when no live source is supplied.");
      }
      this.source = new ChronikClient([...options.urls]) as ChronikLiveSdkSource;
    } else {
      this.source = options.source;
    }
    this.logger = options.logger;
  }

  createConnection(handlers: ChronikLiveHandlers): ChronikLiveConnection {
    return new ChronikClientLiveConnection(this.source, handlers, this.logger, this.heartbeatIntervalMs, this.heartbeatTimeoutMs);
  }

  async getTipHeight(): Promise<number> {
    return (await this.getChainTip()).height;
  }

  async getChainTip(): Promise<{ readonly height: number; readonly hash: string }> {
    const info = await this.source.blockchainInfo();
    assertBlockHeight(info.tipHeight, "Chronik tip height");
    assertBlockHash(info.tipHash, "Chronik tip hash");
    return { height: info.tipHeight, hash: info.tipHash };
  }

  async getBlockHash(height: number): Promise<string> {
    assertBlockHeight(height, "Requested block height");
    const block = await this.source.block(height);
    if (block.blockInfo.height !== height) {
      throw new Error("Chronik returned a block at an unexpected height.");
    }
    assertBlockHash(block.blockInfo.hash, "Chronik block hash");
    return block.blockInfo.hash;
  }

  async listTonalliUnconfirmedTxids(): Promise<readonly string[]> {
    const pages = await Promise.all(
      TONALLI_DISCOVERY_LOKAD_IDS.map(async (lokadId) => this.source.lokadId(lokadId).unconfirmedTxs())
    );
    return [...new Set(pages.flatMap((page) => page.txs.map((tx) => tx.txid)))].sort();
  }

  async listTonalliConfirmedTxs(
    protocol: TonalliDiscoveryProtocol,
    page: number,
    pageSize: number
  ): Promise<ChronikConfirmedTxPage> {
    assertPage(page);
    assertPageSize(pageSize);
    const result = await this.source.lokadId(LOKAD_ID_BY_PROTOCOL[protocol]).confirmedTxs(page, pageSize);
    if (!Number.isSafeInteger(result.numPages) || result.numPages < 0) {
      throw new Error("Chronik returned an invalid confirmed transaction page count.");
    }
    if (!Number.isSafeInteger(result.numTxs) || result.numTxs < 0) {
      throw new Error("Chronik returned an invalid confirmed transaction count.");
    }
    const txs = result.txs.map((tx) => {
      if (!isCanonicalTxid(tx.txid) || tx.block === undefined) {
        throw new Error("Chronik returned an invalid confirmed Tonalli transaction reference.");
      }
      assertBlockHeight(tx.block.height, "Confirmed transaction block height");
      assertBlockHash(tx.block.hash, "Confirmed transaction block hash");
      return { txid: tx.txid, blockHeight: tx.block.height, blockHash: tx.block.hash };
    });
    return { txs, page, numPages: result.numPages, numTxs: result.numTxs };
  }
}

/**
 * Owns each WebSocket session rather than delegating reconnect to the SDK.
 * chronik-client 4.3.0 reconnect has an unhandled async rejection when every
 * endpoint is unavailable and can duplicate its subscription registry.
 * A new WsEndpoint on every attempt avoids both code paths.
 */
class ChronikClientLiveConnection implements ChronikLiveConnection {
  private endpoint: ChronikLiveWsEndpoint | null = null;
  private readonly heartbeat: ChronikWsHeartbeat;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryFailures = 0;
  private reconnecting = false;
  private stopped = true;

  constructor(
    private readonly source: ChronikLiveSdkSource,
    private readonly handlers: ChronikLiveHandlers,
    private readonly logger: ChronikLiveOptions["logger"],
    heartbeatIntervalMs: number,
    heartbeatTimeoutMs: number
  ) {
    this.heartbeat = new ChronikWsHeartbeat(
      heartbeatIntervalMs,
      heartbeatTimeoutMs,
      () => this.handlers.onHeartbeatPong?.(),
      () => {
        this.handlers.onHeartbeatTimeout?.();
        this.handlers.onError?.(new Error("Chronik WebSocket heartbeat timed out."));
        const expired = this.endpoint;
        if (expired !== null) this.handleDisconnect(expired);
        // ChronikWsHeartbeat terminates the expired raw socket after this callback.
      }
    );
  }

  private isCurrent(endpoint: ChronikLiveWsEndpoint): boolean {
    return !this.stopped && this.endpoint === endpoint;
  }

  private attachHeartbeat(endpoint: ChronikLiveWsEndpoint): void {
    const socket = endpoint.ws;
    if (socket === undefined || typeof socket.ping !== "function" ||
        typeof socket.terminate !== "function" || typeof socket.on !== "function" ||
        typeof socket.off !== "function") {
      throw new Error("Chronik SDK WebSocket lacks Node ping/pong support.");
    }
    this.heartbeat.attach(socket);
  }

  private handleDisconnect(endpoint: ChronikLiveWsEndpoint): void {
    if (!this.isCurrent(endpoint)) return;
    this.heartbeat.stop();
    this.endpoint = null;
    if (!this.reconnecting) {
      this.reconnecting = true;
      this.handlers.onReconnect?.();
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer !== null) return;
    // Capped exponential backoff: 1, 2, 4, 8, 16, 30 seconds.
    // One timer at a time; do not keep opening sockets during an outage.
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.retryFailures, 5));
    this.retryFailures += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
    this.retryTimer.unref?.();
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.endpoint !== null) return;
    let endpoint: ChronikLiveWsEndpoint | null = null;
    try {
      endpoint = this.source.ws({
        // SDK autoReconnect has an unhandled Promise path and duplicates subs
        // in the pinned version. All reconnects are supervised here instead.
        autoReconnect: false,
        onEnd: () => {
          if (endpoint !== null) this.handleDisconnect(endpoint);
        },
        onError: (error) => {
          if (endpoint !== null && this.isCurrent(endpoint)) this.handlers.onError?.(error);
        },
        onMessage: (message) => {
          if (endpoint === null || !this.isCurrent(endpoint)) return;
          try {
            const mapped = mapChronikLiveMessage(message);
            if (mapped === null) {
              this.logger?.warn("Ignored unrecognized Chronik live message.");
              return;
            }
            this.handlers.onEvent(mapped);
          } catch (error) {
            this.handlers.onError?.(error);
          }
        }
      });
      this.endpoint = endpoint;
      await endpoint.waitForOpen();
      // stop() may run while waitForOpen is pending. Do not re-arm timers or
      // write subscriptions if a stale open resolves after shutdown/retry.
      if (!this.isCurrent(endpoint)) return;
      for (const lokadId of TONALLI_DISCOVERY_LOKAD_IDS) {
        endpoint.subscribeToLokadId(lokadId);
      }
      endpoint.subscribeToBlocks();
      if (!this.isCurrent(endpoint)) return;
      this.attachHeartbeat(endpoint);
      this.retryFailures = 0;
      this.reconnecting = false;
      this.handlers.onConnect?.();
    } catch (error) {
      if (this.stopped || (endpoint !== null && !this.isCurrent(endpoint))) return;
      this.handlers.onError?.(error);
      if (endpoint === null) {
        if (!this.reconnecting) {
          this.reconnecting = true;
          this.handlers.onReconnect?.();
        }
        this.scheduleRetry();
      } else {
        this.handleDisconnect(endpoint);
        endpoint.close();
      }
    }
  }

  async start(): Promise<void> {
    if (!this.stopped) throw new Error("Chronik live connection already started.");
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.heartbeat.stop();
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const endpoint = this.endpoint;
    this.endpoint = null;
    endpoint?.close();
  }
}

export const createChronikLiveSource = (options: ChronikLiveOptions): ChronikLiveSource => new ChronikClientLiveSource(options);

function assertPage(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Chronik confirmed transaction page must be a non-negative safe integer.");
  }
}

function assertPageSize(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 199) {
    throw new Error("Chronik confirmed transaction page size must be an integer between 1 and 199.");
  }
}

function assertBlockHeight(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function assertBlockHash(value: string, label: string): void {
  if (!isCanonicalTxid(value)) {
    throw new Error(`${label} must be lowercase 64-character hexadecimal.`);
  }
}
