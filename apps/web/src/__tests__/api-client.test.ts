import { describe, expect, it, vi } from "vitest";
import { TonalliApiClient } from "../api/client";
import { feedResponse, jsonResponse, txid, verifiedTxResponse } from "../test/fixtures";

describe("TonalliApiClient", () => {
  it("builds feed URL correctly", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await client.getFeed({ limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/feed?limit=25", expect.objectContaining({ credentials: "omit" }));
  });

  it("builds transaction URL correctly", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(verifiedTxResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await client.getTransaction(txid);

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/tx/${txid}`, expect.objectContaining({ credentials: "omit" }));
  });

  it("handles successful JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).resolves.toEqual(feedResponse);
  });

  it("handles non-2xx API errors", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: "NOT_FOUND", message: "ignored" } }, { status: 404 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getTransaction(txid)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 404,
      apiCode: "NOT_FOUND"
    });
  });

  it("rejects malformed JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("{", { status: 200 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "MALFORMED_JSON" });
  });

  it("rejects structurally invalid responses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [{ transaction: {} }], limit: 25 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("forwards AbortSignal", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });
    const controller = new AbortController();

    await client.getFeed({ signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });
});
