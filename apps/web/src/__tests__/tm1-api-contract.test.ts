import { describe, expect, it, vi } from "vitest";
import { TonalliApiClient } from "../api/client";
import { jsonResponse, tm1FeedResponse, tm1TxResponse, verifiedTxResponse } from "../test/fixtures";

describe("TM1 API contract", () => {
  it("accepts a stored TM1 transaction response with validated authorship metadata", async () => {
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(tm1TxResponse)) });

    await expect(client.getTransaction(tm1TxResponse.transaction.txid)).resolves.toEqual(tm1TxResponse);
  });

  it("accepts verified TM1 items in the feed", async () => {
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(tm1FeedResponse)) });

    await expect(client.getFeed()).resolves.toEqual(tm1FeedResponse);
  });

  it("rejects a TM0 candidate without pushIndex", async () => {
    const response = clone(verifiedTxResponse);
    response.verification!.candidate = {
      protocol: "TM0",
      outputIndex: 1
    } as never;
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(response)) });

    await expect(client.getTransaction(response.transaction.txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a TM1 candidate that includes pushIndex", async () => {
    const response = clone(tm1TxResponse);
    response.verification!.candidate = {
      protocol: "TM1",
      outputIndex: 2,
      pushIndex: 0
    } as never;
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(response)) });

    await expect(client.getTransaction(response.transaction.txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects mismatched verification and candidate protocols", async () => {
    const response = clone(tm1TxResponse);
    response.verification!.candidate = {
      protocol: "TM0",
      outputIndex: 2,
      pushIndex: 0
    };
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(response)) });

    await expect(client.getTransaction(response.transaction.txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    null,
    {
      publicKeyHashHex: "22",
      sighashByte: 65,
      trustModel: "trusted-chronik"
    },
    {
      publicKeyHashHex: "GG".repeat(20),
      sighashByte: 65,
      trustModel: "trusted-chronik"
    },
    {
      publicKeyHashHex: "22".repeat(20),
      sighashByte: 66,
      trustModel: "trusted-chronik"
    },
    {
      publicKeyHashHex: "22".repeat(20),
      sighashByte: 65,
      trustModel: "independent"
    },
    {
      publicKeyHashHex: "22".repeat(20),
      sighashByte: 65,
      trustModel: "trusted-chronik",
      extra: true
    }
  ])("rejects invalid TM1 authorship metadata", async (tm1Authorship) => {
    const response = clone(tm1TxResponse) as unknown as {
      transaction: { txid: string };
      verification: { tm1Authorship: unknown };
    };
    response.verification.tm1Authorship = tm1Authorship;
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(response)) });

    await expect(client.getTransaction(response.transaction.txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects TM1 authorship metadata on TM0 records", async () => {
    const response = clone(verifiedTxResponse) as unknown as {
      transaction: { txid: string };
      verification: { tm1Authorship: unknown };
    };
    response.verification.tm1Authorship = clone(tm1TxResponse).verification!.tm1Authorship;
    const client = new TonalliApiClient({ fetchImpl: vi.fn(async () => jsonResponse(response)) });

    await expect(client.getTransaction(response.transaction.txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
