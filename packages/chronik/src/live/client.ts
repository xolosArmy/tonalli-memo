import { ChronikClient } from "chronik-client";
import { TONALLI_DISCOVERY_LOKAD_IDS, mapChronikLiveMessage } from "./mapper.js";
import type {
  ChronikLiveConnection,
  ChronikLiveHandlers,
  ChronikLiveOptions,
  ChronikLiveSdkSource,
  ChronikLiveSource,
  ChronikLiveWsEndpoint
} from "./types.js";

class ChronikClientLiveSource implements ChronikLiveSource {
  private readonly source: ChronikLiveSdkSource;
  private readonly logger: ChronikLiveOptions["logger"];

  constructor(options: ChronikLiveOptions = {}) {
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
    return new ChronikClientLiveConnection(this.source, handlers, this.logger);
  }

  async getTipHeight(): Promise<number> {
    const info = await this.source.blockchainInfo();
    return info.tipHeight;
  }

  async listTonalliUnconfirmedTxids(): Promise<readonly string[]> {
    const pages = await Promise.all(
      TONALLI_DISCOVERY_LOKAD_IDS.map(async (lokadId) => this.source.lokadId(lokadId).unconfirmedTxs())
    );
    return [...new Set(pages.flatMap((page) => page.txs.map((tx) => tx.txid)))].sort();
  }
}

class ChronikClientLiveConnection implements ChronikLiveConnection {
  private endpoint: ChronikLiveWsEndpoint | null = null;

  constructor(
    private readonly source: ChronikLiveSdkSource,
    private readonly handlers: ChronikLiveHandlers,
    private readonly logger: ChronikLiveOptions["logger"]
  ) {}

  async start(): Promise<void> {
    const endpoint = this.source.ws({
      autoReconnect: true,
      onConnect: () => {
        this.handlers.onConnect?.();
      },
      onReconnect: () => {
        this.handlers.onReconnect?.();
      },
      onError: (error) => {
        this.handlers.onError?.(error);
      },
      onMessage: (message) => {
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
    for (const lokadId of TONALLI_DISCOVERY_LOKAD_IDS) {
      endpoint.subscribeToLokadId(lokadId);
    }
    endpoint.subscribeToBlocks();
  }

  async stop(): Promise<void> {
    this.endpoint?.close();
    this.endpoint = null;
  }
}

export const createChronikLiveSource = (options: ChronikLiveOptions): ChronikLiveSource => new ChronikClientLiveSource(options);
