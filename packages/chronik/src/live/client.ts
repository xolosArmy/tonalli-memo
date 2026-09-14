import { ChronikClient } from "chronik-client";
import { TONALLI_DISCOVERY_LOKAD_IDS, mapChronikLiveMessage } from "./mapper.js";
import { isCanonicalTxid } from "../txid.js";
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
