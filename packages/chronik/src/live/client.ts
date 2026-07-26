import { ChronikClient } from "chronik-client";
import { TONALLI_MEMO_LOKAD_ID, mapChronikLiveMessage } from "./mapper.js";
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
    const page = await this.source.lokadId(TONALLI_MEMO_LOKAD_ID).unconfirmedTxs();
    return page.txs.map((tx) => tx.txid);
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
    endpoint.subscribeToLokadId(TONALLI_MEMO_LOKAD_ID);
    endpoint.subscribeToBlocks();
  }

  async stop(): Promise<void> {
    this.endpoint?.close();
    this.endpoint = null;
  }
}

export const createChronikLiveSource = (options: ChronikLiveOptions): ChronikLiveSource => new ChronikClientLiveSource(options);
