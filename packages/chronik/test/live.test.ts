import { describe, expect, it } from "vitest";
import {
  TM0_LOKAD_ID,
  TM1_DRAFT_02_LOKAD_ID,
  TONALLI_DISCOVERY_LOKAD_IDS,
  TONALLI_MEMO_LOKAD_ID,
  createChronikLiveSource,
  mapChronikLiveMessage
} from "../src/index.js";
import type { ChronikLiveSdkSource, ChronikLiveWsConfig } from "../src/live/types.js";

class FakeWs {
  readonly lokadIds: string[] = [];
  blocks = 0;
  closed = false;
  opened = false;

  async waitForOpen(): Promise<void> {
    this.opened = true;
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
  readonly wsEndpoint = new FakeWs();
  configs: ChronikLiveWsConfig[] = [];
  tipHeight = 123;
  txidsByLokad = new Map<string, string[]>([
    [TM0_LOKAD_ID, ["b".repeat(64), "a".repeat(64)]],
    [TM1_DRAFT_02_LOKAD_ID, ["c".repeat(64), "a".repeat(64)]]
  ]);
  failLokadId: string | null = null;

  ws(config: ChronikLiveWsConfig): FakeWs {
    this.configs.push(config);
    return this.wsEndpoint;
  }

  async blockchainInfo(): Promise<{ readonly tipHeight: number }> {
    return { tipHeight: this.tipHeight };
  }

  lokadId(lokadId: string): { unconfirmedTxs(): Promise<{ readonly txs: readonly { readonly txid: string }[] }> } {
    expect(TONALLI_DISCOVERY_LOKAD_IDS).toContain(lokadId);
    return {
      unconfirmedTxs: async () => {
        if (this.failLokadId === lokadId) {
          throw new Error(`failed ${lokadId}`);
        }
        return { txs: (this.txidsByLokad.get(lokadId) ?? []).map((txid) => ({ txid })) };
      }
    };
  }
}

describe("Chronik live adapter", () => {
  it("exports explicit TM0 and TM1 Draft 0.2 discovery IDs while preserving the legacy alias", () => {
    expect(Buffer.from(new TextEncoder().encode("TM0|")).toString("hex")).toBe(TM0_LOKAD_ID);
    expect(Buffer.from([0x54, 0x4d, 0x4d, 0x00]).toString("hex")).toBe(TM1_DRAFT_02_LOKAD_ID);
    expect(TONALLI_MEMO_LOKAD_ID).toBe(TM0_LOKAD_ID);
    expect(TONALLI_DISCOVERY_LOKAD_IDS).toEqual([TM0_LOKAD_ID, TM1_DRAFT_02_LOKAD_ID]);
  });

  it("starts with native dual LOKAD and block subscriptions and stops with close", async () => {
    const source = new FakeSource();
    const live = createChronikLiveSource({ source });
    const connection = live.createConnection({ onEvent: () => undefined });
    await connection.start();
    expect(source.configs).toHaveLength(1);
    expect(source.configs[0]?.autoReconnect).toBe(true);
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
    source.configs[0]?.onReconnect?.();
    source.configs[0]?.onError?.("boom");
    expect(warnings).toEqual(["Ignored unrecognized Chronik live message."]);
    expect(events).toEqual(["reconnect", "boom"]);
  });

  it("maps tip height and returns deterministic deduplicated unconfirmed TXIDs across both protocols", async () => {
    const source = new FakeSource();
    const live = createChronikLiveSource({ source });
    expect(await live.getTipHeight()).toBe(123);
    expect(await live.listTonalliUnconfirmedTxids()).toEqual(["a".repeat(64), "b".repeat(64), "c".repeat(64)]);
  });

  it("fails closed when either protocol mempool query fails", async () => {
    const source = new FakeSource();
    source.failLokadId = TM1_DRAFT_02_LOKAD_ID;
    const live = createChronikLiveSource({ source });
    await expect(live.listTonalliUnconfirmedTxids()).rejects.toThrow(`failed ${TM1_DRAFT_02_LOKAD_ID}`);
  });
});
