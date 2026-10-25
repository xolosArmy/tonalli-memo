import { afterEach, describe, expect, it, vi } from "vitest";
import { TM1_LOKAD_ID_HEX } from "@xolosarmy/tonalli-memo-protocol";
import {
  TM0_LOKAD_ID,
  TM1_DRAFT_02_LOKAD_ID,
  TONALLI_DISCOVERY_LOKAD_IDS,
  TONALLI_MEMO_LOKAD_ID,
  createChronikLiveSource,
  mapChronikLiveMessage
} from "../src/index.js";
import type { ChronikLiveSdkSource, ChronikLiveWsConfig } from "../src/live/types.js";

class FakeHeartbeatSocket {
  pings = 0;
  terminations = 0;
  private readonly listeners = new Set<() => void>();

  on(_event: "pong", listener: () => void): void {
    this.listeners.add(listener);
  }

  off(_event: "pong", listener: () => void): void {
    this.listeners.delete(listener);
  }

  ping(): void {
    this.pings += 1;
  }

  terminate(): void {
    this.terminations += 1;
  }

  pong(): void {
    for (const listener of this.listeners) listener();
  }
}

class FakeWs {
  ws = new FakeHeartbeatSocket();
  readonly lokadIds: string[] = [];
  blocks = 0;
  closed = false;
  opened = false;
  pendingOpen: Promise<void> | null = null;

  async waitForOpen(): Promise<void> {
    this.opened = true;
    if (this.pendingOpen !== null) await this.pendingOpen;
  }

  subscribeToLokadId(lokadId: string): void {
    this.lokadIds.push(lokadId);
  }

  subscribeToBlocks(): void {
    this.blocks += 1;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeSource implements ChronikLiveSdkSource {
  wsEndpoint = new FakeWs();
  readonly endpoints: FakeWs[] = [];
  configs: ChronikLiveWsConfig[] = [];
  tipHeight = 123;
  tipHash = "f".repeat(64);
  txidsByLokad = new Map<string, string[]>([
    [TM0_LOKAD_ID, ["b".repeat(64), "a".repeat(64)]],
    [TM1_DRAFT_02_LOKAD_ID, ["c".repeat(64), "a".repeat(64)]]
  ]);
  failLokadId: string | null = null;
  confirmedByLokad = new Map<string, Array<{ readonly txid: string; readonly block: { readonly height: number; readonly hash: string } }>>([
    [TM0_LOKAD_ID, [{ txid: "d".repeat(64), block: { height: 120, hash: "e".repeat(64) } }]],
    [TM1_DRAFT_02_LOKAD_ID, [{ txid: "e".repeat(64), block: { height: 121, hash: "d".repeat(64) } }]]
  ]);

  ws(config: ChronikLiveWsConfig): FakeWs {
    this.configs.push(config);
    if (this.endpoints.length > 0) this.wsEndpoint = new FakeWs();
    this.endpoints.push(this.wsEndpoint);
    return this.wsEndpoint;
  }

  async blockchainInfo(): Promise<{ readonly tipHeight: number; readonly tipHash: string }> {
    return { tipHeight: this.tipHeight, tipHash: this.tipHash };
  }

  async block(height: number): Promise<{ readonly blockInfo: { readonly height: number; readonly hash: string } }> {
    return { blockInfo: { height, hash: height === this.tipHeight ? this.tipHash : "c".repeat(64) } };
  }

  lokadId(lokadId: string): ReturnType<ChronikLiveSdkSource["lokadId"]> {
    expect(TONALLI_DISCOVERY_LOKAD_IDS).toContain(lokadId);
    return {
      unconfirmedTxs: async () => {
        if (this.failLokadId === lokadId) {
          throw new Error(`failed ${lokadId}`);
        }
        return { txs: (this.txidsByLokad.get(lokadId) ?? []).map((txid) => ({ txid })) };
      },
      confirmedTxs: async (page, pageSize) => {
        if (this.failLokadId === lokadId) {
          throw new Error(`failed ${lokadId}`);
        }
        const all = this.confirmedByLokad.get(lokadId) ?? [];
        return {
          txs: all.slice(page * pageSize, (page + 1) * pageSize),
          numPages: Math.ceil(all.length / pageSize),
          numTxs: all.length
        };
      }
    };
  }
}

afterEach(() => vi.useRealTimers());

describe("Chronik live adapter", () => {
  it("exports explicit TM0 and TM1 Draft 0.2 discovery IDs while preserving the legacy alias", () => {
    expect(Buffer.from(new TextEncoder().encode("TM0|")).toString("hex")).toBe(TM0_LOKAD_ID);
    expect(Buffer.from([0x54, 0x4d, 0x4d, 0x00]).toString("hex")).toBe(TM1_DRAFT_02_LOKAD_ID);
    expect(TONALLI_MEMO_LOKAD_ID).toBe(TM0_LOKAD_ID);
    expect(TONALLI_DISCOVERY_LOKAD_IDS).toEqual([TM0_LOKAD_ID, TM1_DRAFT_02_LOKAD_ID]);
  });

  it("derives TM1 live discovery directly from the canonical protocol marker", () => {
    expect(TM1_DRAFT_02_LOKAD_ID).toBe(TM1_LOKAD_ID_HEX);
    expect(TONALLI_DISCOVERY_LOKAD_IDS).toContain(TM1_LOKAD_ID_HEX);
    expect(TONALLI_DISCOVERY_LOKAD_IDS[1]).toBe(TM1_LOKAD_ID_HEX);
  });

  it("starts with native dual LOKAD and block subscriptions and stops with close", async () => {
    const source = new FakeSource();
    const live = createChronikLiveSource({ source });
    const connection = live.createConnection({ onEvent: () => undefined });
    await connection.start();
    expect(source.configs).toHaveLength(1);
    expect(source.configs[0]?.autoReconnect).toBe(false);
    expect(source.wsEndpoint.opened).toBe(true);
    expect(source.wsEndpoint.lokadIds).toEqual([...TONALLI_DISCOVERY_LOKAD_IDS]);
    expect(source.wsEndpoint.blocks).toBe(1);
    await connection.stop();
    expect(source.wsEndpoint.closed).toBe(true);
  });

  it("normalizes raw transaction and block events", () => {
    expect(mapChronikLiveMessage({ type: "Tx", msgType: "TX_ADDED_TO_MEMPOOL", txid: "a".repeat(64) })).toEqual({
      type: "transaction",
      event: "added-to-mempool",
      txid: "a".repeat(64)
    });
    expect(
      mapChronikLiveMessage({
        type: "Block",
        msgType: "BLK_DISCONNECTED",
        blockHash: "b".repeat(64),
        blockHeight: 12,
        blockTimestamp: 34
      })
    ).toEqual({
      type: "block",
      event: "disconnected",
      blockHash: "b".repeat(64),
      blockHeight: 12,
      blockTimestamp: 34
    });
  });

  it("ignores unrecognized messages and forwards callbacks", async () => {
    const source = new FakeSource();
    const warnings: string[] = [];
    const events: unknown[] = [];
    const live = createChronikLiveSource({ source, logger: { warn: (message) => warnings.push(message) } });
    const connection = live.createConnection({
      onEvent: (event) => events.push(event),
      onConnect: () => events.push("connect"),
      onReconnect: () => events.push("reconnect"),
      onError: (error) => events.push(error)
    });
    await connection.start();
    source.configs[0]?.onMessage?.({ type: "Tx", msgType: "UNRECOGNIZED", txid: "a".repeat(64) });
    source.configs[0]?.onEnd?.();
    source.configs[0]?.onError?.("boom");
    expect(warnings).toEqual(["Ignored unrecognized Chronik live message."]);
    expect(events).toEqual(["connect", "reconnect"]);
  });

  it("maps tip height and returns deterministic deduplicated unconfirmed TXIDs across both protocols", async () => {
    const source = new FakeSource();
    const live = createChronikLiveSource({ source });
    expect(await live.getTipHeight()).toBe(123);
    expect(await live.getChainTip()).toEqual({ height: 123, hash: "f".repeat(64) });
    expect(await live.getBlockHash(100)).toBe("c".repeat(64));
    expect(await live.listTonalliUnconfirmedTxids()).toEqual(["a".repeat(64), "b".repeat(64), "c".repeat(64)]);
  });

  it("returns paginated confirmed transaction references for each supported protocol", async () => {
    const source = new FakeSource();
    const live = createChronikLiveSource({ source });
    await expect(live.listTonalliConfirmedTxs("TM0", 0, 1)).resolves.toEqual({
      page: 0,
      numPages: 1,
      numTxs: 1,
      txs: [{ txid: "d".repeat(64), blockHeight: 120, blockHash: "e".repeat(64) }]
    });
    await expect(live.listTonalliConfirmedTxs("TM1", 0, 1)).resolves.toEqual({
      page: 0,
      numPages: 1,
      numTxs: 1,
      txs: [{ txid: "e".repeat(64), blockHeight: 121, blockHash: "d".repeat(64) }]
    });
  });

  it("fails closed when either protocol mempool query fails", async () => {
    const source = new FakeSource();
    source.failLokadId = TM1_DRAFT_02_LOKAD_ID;
    const live = createChronikLiveSource({ source });
    await expect(live.listTonalliUnconfirmedTxids()).rejects.toThrow(`failed ${TM1_DRAFT_02_LOKAD_ID}`);
  });
});

describe("Chronik WebSocket ping/pong watchdog (M0-A-WS-01)", () => {
  it("keeps a quiet chain connected while pongs continue", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    let errors = 0;
    let pongs = 0;
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({
      onEvent: () => undefined,
      onError: () => { errors += 1; },
      onHeartbeatPong: () => { pongs += 1; }
    });
    await connection.start();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      source.wsEndpoint.ws.pong();
    }
    expect(source.wsEndpoint.ws.pings).toBe(5);
    expect(source.wsEndpoint.ws.terminations).toBe(0);
    expect(pongs).toBe(5);
    expect(errors).toBe(0);
    await connection.stop();
  });

  it("terminates a half-open socket after a missing pong, without block events", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    let timeouts = 0;
    const errors: unknown[] = [];
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({
      onEvent: () => undefined,
      onError: (error) => errors.push(error),
      onHeartbeatTimeout: () => { timeouts += 1; }
    });
    await connection.start();
    await vi.advanceTimersByTimeAsync(1250);
    expect(source.wsEndpoint.ws.pings).toBe(1);
    expect(source.wsEndpoint.ws.terminations).toBe(1);
    expect(timeouts).toBe(1);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("heartbeat timed out");
    await vi.advanceTimersByTimeAsync(4000);
    expect(source.wsEndpoint.ws.terminations).toBe(1);
    await connection.stop();
  });

  it("attaches to the replacement socket on SDK reconnect", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({ onEvent: () => undefined });
    await connection.start();
    const oldSocket = source.wsEndpoint.ws;
    source.configs[0]?.onEnd?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.configs).toHaveLength(2);
    expect(source.configs[1]?.autoReconnect).toBe(false);
    expect(oldSocket.pings).toBe(0);
    expect(source.wsEndpoint.ws.pings).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.wsEndpoint.ws.pings).toBe(1);
    source.wsEndpoint.ws.pong();
    expect(source.endpoints[0]?.lokadIds).toEqual([...TONALLI_DISCOVERY_LOKAD_IDS]);
    expect(source.endpoints[1]?.lokadIds).toEqual([...TONALLI_DISCOVERY_LOKAD_IDS]);
    await connection.stop();
  });

  it("cleans up pings and timeouts on shutdown", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({ onEvent: () => undefined });
    await connection.start();
    await vi.advanceTimersByTimeAsync(1000);
    await connection.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(source.wsEndpoint.ws.terminations).toBe(0);
    expect(source.wsEndpoint.ws.pings).toBe(1);
    expect(source.wsEndpoint.closed).toBe(true);
  });
});

describe("Codex P1/P2 SDK-retry and shutdown regression tests", () => {
  it("retries rejected handshakes with backoff and fresh subscription sets", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    const connect = source.ws.bind(source);
    let handshakes = 0;
    source.ws = (config) => {
      const endpoint = connect(config);
      handshakes++;
      if (handshakes === 2 || handshakes === 3) {
        endpoint.pendingOpen = Promise.reject(new Error("handshake unavailable"));
      }
      return endpoint;
    };
    let errors = 0;
    let reconnects = 0;
    let connects = 0;
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({
      onEvent: () => undefined,
      onError: () => { errors++; },
      onReconnect: () => { reconnects++; },
      onConnect: () => { connects++; }
    });
    await connection.start();
    const first = source.wsEndpoint;
    source.configs[0]?.onEnd?.();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(source.endpoints).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(source.endpoints).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(source.endpoints).toHaveLength(4);
    expect(errors).toBe(2);
    expect(reconnects).toBe(1);
    expect(connects).toBe(2);
    expect(first.lokadIds).toEqual([...TONALLI_DISCOVERY_LOKAD_IDS]);
    for (const endpoint of source.endpoints) {
      expect(endpoint.lokadIds.length).toBeLessThanOrEqual(2);
      expect(endpoint.blocks).toBeLessThanOrEqual(1);
    }
    expect(source.endpoints[3]?.lokadIds).toEqual([...TONALLI_DISCOVERY_LOKAD_IDS]);
    await connection.stop();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(source.endpoints).toHaveLength(4);
  });

  it("does not re-arm heartbeat if stop occurs before waitForOpen resolves", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    let release!: () => void;
    source.wsEndpoint.pendingOpen = new Promise<void>((resolve) => { release = resolve; });
    let connects = 0;
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({
      onEvent: () => undefined,
      onConnect: () => { connects++; }
    });
    const starting = connection.start();
    await connection.stop();
    release();
    await starting;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(source.wsEndpoint.ws.pings).toBe(0);
    expect(source.wsEndpoint.ws.terminations).toBe(0);
    expect(source.wsEndpoint.lokadIds).toEqual([]);
    expect(connects).toBe(0);
    expect(source.wsEndpoint.closed).toBe(true);
  });

  it("reconnects after a missing pong with a fresh endpoint instead of SDK reconnect", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    const connection = createChronikLiveSource({
      source, heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 250
    }).createConnection({ onEvent: () => undefined });
    await connection.start();
    await vi.advanceTimersByTimeAsync(1250);
    expect(source.endpoints[0]?.ws.terminations).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.endpoints).toHaveLength(2);
    expect(source.configs.every((config) => config.autoReconnect === false)).toBe(true);
    expect(source.endpoints[1]?.lokadIds).toEqual([...TONALLI_DISCOVERY_LOKAD_IDS]);
    expect(source.endpoints[1]?.blocks).toBe(1);
    await connection.stop();
  });
});
