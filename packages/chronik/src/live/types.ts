export type ChronikLiveTransactionEvent =
  | "added-to-mempool"
  | "removed-from-mempool"
  | "confirmed"
  | "finalized"
  | "invalidated";

export type ChronikLiveBlockEvent = "connected" | "disconnected" | "finalized" | "invalidated";

export type ChronikLiveEvent =
  | {
      readonly type: "transaction";
      readonly event: ChronikLiveTransactionEvent;
      readonly txid: string;
    }
  | {
      readonly type: "block";
      readonly event: ChronikLiveBlockEvent;
      readonly blockHash: string;
      readonly blockHeight: number;
      readonly blockTimestamp: number;
    };

export interface ChronikLiveHandlers {
  readonly onEvent: (event: ChronikLiveEvent) => void;
  readonly onConnect?: () => void;
  readonly onReconnect?: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface ChronikLiveConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ChronikLiveSource {
  createConnection(handlers: ChronikLiveHandlers): ChronikLiveConnection;
  getTipHeight(): Promise<number>;
  listTonalliUnconfirmedTxids(): Promise<readonly string[]>;
}

export interface ChronikLiveLogger {
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface ChronikLiveOptions {
  readonly urls?: readonly string[];
  readonly source?: ChronikLiveSdkSource;
  readonly logger?: ChronikLiveLogger;
}

export interface ChronikLiveSdkSource {
  ws(config: ChronikLiveWsConfig): ChronikLiveWsEndpoint;
  blockchainInfo(): Promise<{ readonly tipHeight: number }>;
  lokadId(lokadId: string): {
    unconfirmedTxs(): Promise<{ readonly txs: readonly { readonly txid: string }[] }>;
  };
}

export interface ChronikLiveWsConfig {
  readonly onMessage?: (message: unknown) => void;
  readonly onConnect?: () => void;
  readonly onReconnect?: () => void;
  readonly onError?: (error: unknown) => void;
  readonly autoReconnect?: boolean;
}

export interface ChronikLiveWsEndpoint {
  waitForOpen(): Promise<void>;
  subscribeToLokadId(lokadId: string): void;
  subscribeToBlocks(): void;
  close(): void;
}
