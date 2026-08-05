import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { MemoVerificationService, VerificationResult } from "@tonalli-memo/verification";
import { IndexingEngine, MemoStore, openIndexerDatabase, type IndexerDatabase } from "../../src/index.js";
import { createIndexerApi } from "../../src/api/server.js";
import { TXID, verificationResultForStatus } from "./fixtures.js";

class Tm1VerificationService {
  async verifyTransaction(): Promise<VerificationResult> {
    return verificationResultForStatus("VERIFIED_TM1");
  }
}

let app: FastifyInstance | null = null;
let database: IndexerDatabase | null = null;

afterEach(async () => {
  await app?.close();
  database?.close();
  app = null;
  database = null;
});

describe("stored TM1 public read model", () => {
  it("serves approved authorship metadata from transaction and feed routes", async () => {
    database = openIndexerDatabase({ filename: ":memory:" });
    const store = new MemoStore(database);
    const service = new Tm1VerificationService();
    const engine = new IndexingEngine({
      verificationService: service as unknown as MemoVerificationService,
      store,
      clock: { nowSeconds: () => 1234567890 }
    });
    app = await createIndexerApi({
      store,
      indexingEngine: engine,
      indexApiToken: "secret"
    });

    const indexed = await app.inject({
      method: "POST",
      url: "/api/v1/admin/index",
      headers: { authorization: "Bearer secret" },
      payload: { txid: TXID }
    });
    expect(indexed.statusCode).toBe(200);

    const transaction = await app.inject({ method: "GET", url: `/api/v1/tx/${TXID}` });
    expect(transaction.statusCode).toBe(200);
    expect(transaction.json()).toMatchObject({
      verification: {
        protocol: "TM1",
        tm1Authorship: {
          publicKeyHashHex: "22".repeat(20),
          sighashByte: 65,
          trustModel: "trusted-chronik"
        }
      }
    });

    const feed = await app.inject({ method: "GET", url: "/api/v1/feed" });
    expect(feed.statusCode).toBe(200);
    expect(feed.json()).toMatchObject({
      items: [
        {
          verification: {
            protocol: "TM1",
            tm1Authorship: {
              publicKeyHashHex: "22".repeat(20),
              sighashByte: 65,
              trustModel: "trusted-chronik"
            }
          }
        }
      ]
    });

    for (const serialized of [transaction.payload, feed.payload]) {
      expect(serialized).not.toContain("publicKeyHex");
      expect(serialized).not.toContain("signatureWithHashTypeHex");
      expect(serialized).not.toContain("diagnosticsJson");
    }
  });
});
