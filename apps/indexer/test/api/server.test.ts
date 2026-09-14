import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { IndexingEngine, MemoStore, openIndexerDatabase, type IndexerDatabase } from "../../src/index.js";
import type { MemoVerificationService, VerificationResult, VerifyTransactionContext } from "@tonalli-memo/verification";
import type { ScriptUtxos } from "@tonalli-memo/chronik";
import { createIndexerApi } from "../../src/api/server.js";
import type { FeedResponseDto, TxResponseDto } from "../../src/api/dto.js";
import type { IndexRequestResult, IndexRequestService, IndexerDaemonStatus } from "../../src/daemon/types.js";
import type { IndexingOutcome, IndexTransactionOptions } from "../../src/engine/types.js";
import { TXID, TXID_2, normalizedTx, verificationResultForStatus, verifiedResult, verifiedTm1Result } from "./fixtures.js";

class FakeVerificationService {
  readonly calls: { readonly txid: string; readonly context: VerifyTransactionContext }[] = [];
  private readonly results: VerificationResult[];

  constructor(...results: VerificationResult[]) {
    this.results = results.length === 0 ? [verifiedResult()] : results;
  }

  async verifyTransaction(txid: string, context: VerifyTransactionContext = {}): Promise<VerificationResult> {
    this.calls.push({ txid, context });
    const result = this.results[Math.min(this.calls.length - 1, this.results.length - 1)];
    if (result === undefined) {
      throw new Error("Fake verification result missing.");
    }
    return result;
  }
}

interface TestApi {
  readonly app: FastifyInstance;
  readonly database: IndexerDatabase;
  readonly service: FakeVerificationService;
  readonly store: MemoStore;
}

const apps: FastifyInstance[] = [];
const databases: IndexerDatabase[] = [];

async function openApi(options: {
  readonly results?: readonly VerificationResult[];
  readonly token?: string;
  readonly corsOrigins?: readonly string[];
  readonly chronik?: { getAddressUtxos(address: string): Promise<ScriptUtxos> };
  readonly indexRequestService?: IndexRequestService;
  readonly publicIndexRateLimitMax?: number;
  readonly publicIndexRateLimitWindowMs?: number;
} = {}): Promise<TestApi> {
  const database = openIndexerDatabase({ filename: ":memory:" });
  databases.push(database);
  const store = new MemoStore(database);
  const service = new FakeVerificationService(...(options.results ?? [verifiedResult()]));
  const engine = new IndexingEngine({
    verificationService: service as unknown as MemoVerificationService,
    store,
    clock: {
      nowSeconds() {
        return 1234567890 + service.calls.length;
      }
    },
    ...(options.chronik !== undefined ? { chronik: options.chronik } : {})
  });
  const app = await createIndexerApi({
    store,
    ...(options.token === undefined ? {} : { indexingEngine: engine, indexApiToken: options.token }),
    ...(options.corsOrigins === undefined ? {} : { corsOrigins: options.corsOrigins }),
    ...(options.indexRequestService === undefined ? {} : { indexRequestService: options.indexRequestService }),
    ...(options.publicIndexRateLimitMax === undefined ? {} : { publicIndexRateLimitMax: options.publicIndexRateLimitMax }),
    ...(options.publicIndexRateLimitWindowMs === undefined
      ? {}
      : { publicIndexRateLimitWindowMs: options.publicIndexRateLimitWindowMs })
  });
  apps.push(app);
  return { app, database, service, store };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const database of databases.splice(0)) {
    database.close();
  }
});

interface MinimalInjectOptions {
  readonly method?: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly payload?: unknown;
}

interface MinimalInjectResponse {
  readonly statusCode: number;
  readonly payload: string;
  readonly headers: Record<string, string | number | string[] | undefined>;
}

const injectJson = async (
  app: FastifyInstance,
  options: MinimalInjectOptions
): Promise<{ readonly statusCode: number; readonly body: unknown; readonly headers: Record<string, string | number | string[] | undefined> }> => {
  const inject = app.inject.bind(app) as unknown as (injectOptions: MinimalInjectOptions) => Promise<MinimalInjectResponse>;
  const response = await inject(options);
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.payload) as unknown,
    headers: response.headers
  };
};

const readyStatus = (overrides: Partial<IndexerDaemonStatus> = {}): IndexerDaemonStatus => ({
  state: "running",
  websocketConnected: true,
  chronikHeight: 966781,
  lastEventAt: "2026-09-14T00:00:00.000Z",
  lastSuccessfulIndexAt: "2026-09-14T00:00:01.000Z",
  lastSuccessfulIndexTxid: TXID,
  queueSize: 0,
  activeCount: 0,
  queueAccepted: 1,
  queueCompleted: 1,
  queueFailed: 0,
  queueRejected: 0,
  queueLastActivityAt: "2026-09-14T00:00:01.000Z",
  lastError: null,
  backfill: {
    state: "succeeded",
    complete: true,
    lastStartedAt: "2026-09-14T00:00:00.000Z",
    lastCompletedAt: "2026-09-14T00:00:01.000Z",
    checkpointHeight: 966781,
    lagBlocks: 0,
    consecutiveFailures: 0
  },
  ready: true,
  ...overrides
});

class FakeIndexRequestService implements IndexRequestService {
  readonly requests: string[] = [];
  nextStatus: IndexRequestResult["status"] = "queued";
  status = readyStatus();

  requestIndex(txid: string): IndexRequestResult {
    this.requests.push(txid);
    return { status: this.nextStatus, completion: null };
  }

  async indexAndWait(_txid: string, _options?: IndexTransactionOptions): Promise<IndexingOutcome> {
    void _txid;
    void _options;
    throw new Error("Fake administrative indexing was not configured for this test.");
  }

  getStatus(): IndexerDaemonStatus {
    return this.status;
  }
}

describe("Tonalli Memo indexer HTTP API", () => {
  it("serves the approved health route", async () => {
    const api = await openApi();
    await expect(injectJson(api.app, { method: "GET", url: "/api/v1/health" })).resolves.toEqual({
      statusCode: 200,
      body: { status: "ok", service: "tonalli-memo-indexer", daemon: null },
      headers: expect.any(Object)
    });
  });

  it("keeps liveness compatible and reports daemon readiness independently", async () => {
    const indexRequests = new FakeIndexRequestService();
    const api = await openApi({ indexRequestService: indexRequests });
    expect(await injectJson(api.app, { method: "GET", url: "/api/v1/health" })).toMatchObject({
      statusCode: 200,
      body: { status: "ok", daemon: { state: "running", websocketConnected: true, ready: true } }
    });
    expect(await injectJson(api.app, { method: "GET", url: "/api/v1/ready" })).toMatchObject({
      statusCode: 200,
      body: { status: "ready", daemon: { backfill: { checkpointHeight: 966781, lagBlocks: 0 } } }
    });

    indexRequests.status = readyStatus({
      websocketConnected: false,
      ready: false,
      backfill: { ...readyStatus().backfill, lagBlocks: 12 }
    });
    expect(await injectJson(api.app, { method: "GET", url: "/api/v1/ready" })).toMatchObject({
      statusCode: 503,
      body: { status: "not_ready", daemon: { websocketConnected: false, ready: false } }
    });
  });

  it("accepts only a txid for public indexing and returns stable idempotent statuses", async () => {
    const indexRequests = new FakeIndexRequestService();
    const api = await openApi({ indexRequestService: indexRequests });

    for (const status of ["queued", "already_queued", "already_indexed"] as const) {
      indexRequests.nextStatus = status;
      const response = await injectJson(api.app, {
        method: "POST",
        url: "/api/v1/index-requests",
        payload: { txid: TXID }
      });
      expect(response).toMatchObject({ statusCode: 202, body: { status, txid: TXID } });
    }
    expect(indexRequests.requests).toEqual([TXID, TXID, TXID]);

    for (const payload of [
      { txid: "A".repeat(64) },
      { txid: "0".repeat(63) },
      { txid: TXID, content: "client supplied memo" },
      { txid: TXID, status: "VERIFIED" }
    ]) {
      expect((await injectJson(api.app, { method: "POST", url: "/api/v1/index-requests", payload })).statusCode).toBe(400);
    }
    expect(indexRequests.requests).toHaveLength(3);
  });

  it("returns stable errors for public rate limiting, queue saturation, and a stopped daemon", async () => {
    const indexRequests = new FakeIndexRequestService();
    const rateLimitedApi = await openApi({
      indexRequestService: indexRequests,
      publicIndexRateLimitMax: 1,
      publicIndexRateLimitWindowMs: 60_000
    });
    expect((await injectJson(rateLimitedApi.app, { method: "POST", url: "/api/v1/index-requests", payload: { txid: TXID } })).statusCode).toBe(202);
    expect(await injectJson(rateLimitedApi.app, { method: "POST", url: "/api/v1/index-requests", payload: { txid: TXID_2 } })).toMatchObject({
      statusCode: 429,
      body: { error: { code: "RATE_LIMITED" } }
    });

    const unavailableRequests = new FakeIndexRequestService();
    const unavailableApi = await openApi({ indexRequestService: unavailableRequests });
    unavailableRequests.nextStatus = "saturated";
    expect(await injectJson(unavailableApi.app, { method: "POST", url: "/api/v1/index-requests", payload: { txid: TXID } })).toMatchObject({
      statusCode: 503,
      body: { error: { code: "INDEX_QUEUE_FULL" } }
    });
    unavailableRequests.nextStatus = "stopped";
    expect(await injectJson(unavailableApi.app, { method: "POST", url: "/api/v1/index-requests", payload: { txid: TXID } })).toMatchObject({
      statusCode: 503,
      body: { error: { code: "INDEXER_NOT_READY" } }
    });
  });

  it("omits the admin index route when token or engine is missing", async () => {
    const noToken = await openApi();
    expect((await injectJson(noToken.app, { method: "POST", url: "/api/v1/admin/index", payload: { txid: TXID } })).statusCode).toBe(404);

    const noEngine = await createIndexerApi({ store: noToken.store, indexApiToken: "secret" });
    apps.push(noEngine);
    expect((await injectJson(noEngine, { method: "POST", url: "/api/v1/admin/index", payload: { txid: TXID } })).statusCode).toBe(404);
  });

  it("validates route params, query strings, and request bodies", async () => {
    const api = await openApi({ token: "secret" });

    expect((await injectJson(api.app, { method: "GET", url: "/api/v1/tx/not-a-txid" })).statusCode).toBe(400);
    expect((await injectJson(api.app, { method: "GET", url: "/api/v1/feed?limit=101" })).statusCode).toBe(400);
    expect(
      (await injectJson(api.app, {
        method: "POST",
        url: "/api/v1/admin/index",
        headers: { authorization: "Bearer secret" },
        payload: { txid: TXID, tipHeight: "900000" }
      })).statusCode
    ).toBe(400);
    expect(api.service.calls).toEqual([]);
  });

  it("rejects and accepts admin bearer tokens without returning token values", async () => {
    const api = await openApi({ token: "secret-token" });

    const rejected = await injectJson(api.app, { method: "POST", url: "/api/v1/admin/index", payload: { txid: TXID } });
    expect(rejected.statusCode).toBe(401);
    expect(JSON.stringify(rejected.body)).not.toContain("secret-token");

    const accepted = await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret-token" },
      payload: { txid: TXID, tipHeight: 900000 }
    });
    expect(accepted.statusCode).toBe(200);
    expect(api.service.calls).toEqual([{ txid: TXID, context: { tipHeight: 900000 } }]);
  });

  it("forwards omitted tipHeight exactly as an empty verification context", async () => {
    const api = await openApi({ token: "secret" });
    await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID }
    });
    expect(api.service.calls).toEqual([{ txid: TXID, context: {} }]);
  });

  it.each([
    ["VERIFIED", 200],
    ["UNAUTHORIZED", 200],
    ["NO_MEMO", 200],
    ["INVALID_MEMO", 200],
    ["MULTIPLE_MEMOS", 200],
    ["MEMPOOL_TIP_REQUIRED", 422],
    ["INVALID_VERIFICATION_CONTEXT", 422],
    ["INVALID_TXID", 400],
    ["TRANSACTION_NOT_FOUND", 404],
    ["CHRONIK_UNAVAILABLE", 503],
    ["INVALID_CHRONIK_RESPONSE", 502]
  ] as const)("maps %s to HTTP %i", async (status, statusCode) => {
    const api = await openApi({ token: "secret", results: [verificationResultForStatus(status)] });
    const response = await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID }
    });
    expect(response.statusCode).toBe(statusCode);
    expect(response.body).toMatchObject({ verification: { status } });
  });

  it("serializes stored transaction responses without internal fields", async () => {
    const api = await openApi({ token: "secret" });
    await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID }
    });

    const response = await injectJson(api.app, { method: "GET", url: `/api/v1/tx/${TXID}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      transaction: { txid: TXID, chainStatus: "confirmed" },
      verification: { txid: TXID, status: "VERIFIED", payload: "signal now lives on eCash" }
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("rawResponse");
    expect(serialized).not.toContain("normalizedJson");
    expect(serialized).not.toContain("authorizationContextJson");
    expect(serialized).not.toContain("authorizationDecisionsJson");
    expect(serialized).not.toContain("diagnosticsJson");
  });

  it("returns a verified feed using filtering, deterministic ordering, and bound limits", async () => {
    const api = await openApi({
      token: "secret",
      results: [
        verifiedResult({ txid: TXID, transaction: normalizedTx({ txid: TXID, blockHeight: 900001 }) }),
        verificationResultForStatus("NO_MEMO", TXID_2),
        verifiedResult({ txid: TXID_2, transaction: normalizedTx({ txid: TXID_2, blockHeight: 900010 }) })
      ]
    });

    for (const txid of [TXID, TXID_2, TXID_2]) {
      await injectJson(api.app, {
        method: "POST",
        url: "/api/v1/admin/index",
        headers: { authorization: "Bearer secret" },
        payload: { txid }
      });
    }

    const response = await injectJson(api.app, { method: "GET", url: "/api/v1/feed?limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      limit: 1,
      items: [
        {
          transaction: { txid: TXID_2 },
          verification: { status: "VERIFIED" }
        }
      ]
    });
    expect(JSON.stringify(response.body)).not.toContain("NO_MEMO");
  });

  it("keeps CORS disabled by default and allows only explicit exact origins", async () => {
    const defaultApi = await openApi();
    const defaultResponse = await defaultApi.app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "https://app.example" } });
    expect(defaultResponse.headers["access-control-allow-origin"]).toBeUndefined();

    const corsApi = await openApi({ corsOrigins: ["https://app.example"] });
    const allowed = await corsApi.app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "https://app.example" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example");

    const rejected = await corsApi.app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "https://other.example" } });
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("hides raw source causes and returns generic 500 responses", async () => {
    const api = await openApi({ token: "secret", results: [verificationResultForStatus("CHRONIK_UNAVAILABLE")] });
    const unavailable = await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID }
    });
    expect(JSON.stringify(unavailable.body)).not.toContain("raw cause");
    expect(JSON.stringify(unavailable.body)).not.toContain("stack");

    api.store.getTransaction = () => {
      throw new Error("SQL /tmp/path database failure");
    };
    const failed = await injectJson(api.app, { method: "GET", url: `/api/v1/tx/${TXID}` });
    expect(failed).toMatchObject({
      statusCode: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } }
    });
    expect(JSON.stringify(failed.body)).not.toContain("SQL");
    expect(JSON.stringify(failed.body)).not.toContain("/tmp/path");
  });

  it("exposes displayPayload and attachment on tx and feed endpoints according to contract", async () => {
    const tokenId = "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8";
    const rawPayload = `@nft1:${tokenId}\nMi xolo NFT`;
    const chronik = {
      getAddressUtxos: async () => ({
        outputScript: "76a914...",
        utxos: [
          {
            outpoint: { txid: "00".repeat(32), outIdx: 0 },
            blockHeight: 800000,
            isCoinbase: false,
            sats: 546n,
            isFinal: true,
            token: {
              tokenId,
              tokenType: { protocol: "SLP" as const, type: "SLP_TOKEN_TYPE_NFT1_CHILD" as const, number: 65 },
              isMintBaton: false,
              atoms: 1n
            }
          }
        ]
      })
    };

    const api = await openApi({
      token: "secret",
      chronik,
      results: [
        verifiedTm1Result(rawPayload, {
          txid: TXID,
          transaction: normalizedTx({ txid: TXID, blockHeight: 900001 })
        }),
        verifiedResult({
          txid: TXID_2,
          transaction: normalizedTx({ txid: TXID_2, blockHeight: 900002 })
        })
      ]
    });

    await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID }
    });
    await injectJson(api.app, {
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID_2 }
    });

    // Check tx endpoint with attachment
    const tx1 = await injectJson(api.app, { method: "GET", url: `/api/v1/tx/${TXID}` });
    expect(tx1.statusCode).toBe(200);
    expect((tx1.body as TxResponseDto).verification).toMatchObject({
      txid: TXID,
      payload: rawPayload,
      displayPayload: "Mi xolo NFT",
      attachment: {
        type: "NFT",
        tokenId,
        ownership: "VERIFIED_AT_INDEXING"
      }
    });

    // Check tx endpoint without attachment
    const tx2 = await injectJson(api.app, { method: "GET", url: `/api/v1/tx/${TXID_2}` });
    expect(tx2.statusCode).toBe(200);
    expect((tx2.body as TxResponseDto).verification).toMatchObject({
      txid: TXID_2,
      payload: "signal now lives on eCash",
      displayPayload: "signal now lives on eCash",
      attachment: null
    });

    // Check feed endpoint
    const feed = await injectJson(api.app, { method: "GET", url: "/api/v1/feed" });
    expect(feed.statusCode).toBe(200);
    const feedItems = (feed.body as FeedResponseDto).items;
    expect(feedItems).toHaveLength(2);
    expect(feedItems[0]?.verification).toMatchObject({
      txid: TXID_2,
      displayPayload: "signal now lives on eCash",
      attachment: null
    });
    expect(feedItems[1]?.verification).toMatchObject({
      txid: TXID,
      payload: rawPayload,
      displayPayload: "Mi xolo NFT",
      attachment: {
        type: "NFT",
        tokenId,
        ownership: "VERIFIED_AT_INDEXING"
      }
    });
  });
});
