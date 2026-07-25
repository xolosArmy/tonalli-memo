import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { IndexingEngine, MemoStore, openIndexerDatabase, type IndexerDatabase } from "../../src/index.js";
import type { MemoVerificationService, VerificationResult, VerifyTransactionContext } from "@tonalli-memo/verification";
import { createIndexerApi } from "../../src/api/server.js";
import { TXID, TXID_2, normalizedTx, verificationResultForStatus, verifiedResult } from "./fixtures.js";

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
    }
  });
  const app = await createIndexerApi({
    store,
    ...(options.token === undefined ? {} : { indexingEngine: engine, indexApiToken: options.token }),
    ...(options.corsOrigins === undefined ? {} : { corsOrigins: options.corsOrigins })
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

describe("Tonalli Memo indexer HTTP API", () => {
  it("serves the approved health route", async () => {
    const api = await openApi();
    await expect(injectJson(api.app, { method: "GET", url: "/api/v1/health" })).resolves.toEqual({
      statusCode: 200,
      body: { status: "ok", service: "tonalli-memo-indexer" },
      headers: expect.any(Object)
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
});
