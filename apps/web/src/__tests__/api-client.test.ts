import { describe, expect, it, vi } from "vitest";
import { TonalliApiClient } from "../api/client";
import { feedResponse, jsonResponse, nullVerificationResponse, txid, verifiedTxResponse } from "../test/fixtures";

describe("TonalliApiClient", () => {
  it.each([
    ["/api/v1", "/api/v1/feed?limit=25", `/api/v1/tx/${txid}`],
    ["/api/v1/", "/api/v1/feed?limit=25", `/api/v1/tx/${txid}`],
    ["https://api.example/api/v1", "https://api.example/api/v1/feed?limit=25", `https://api.example/api/v1/tx/${txid}`],
    ["https://api.example/api/v1/", "https://api.example/api/v1/feed?limit=25", `https://api.example/api/v1/tx/${txid}`]
  ])("builds feed and transaction URLs from base %s", async (baseUrl, expectedFeedUrl, expectedTxUrl) => {
    const fetchMock = vi.fn(async (url: string) => jsonResponse(url.includes("/feed") ? feedResponse : verifiedTxResponse));
    const client = new TonalliApiClient({ baseUrl, fetchImpl: fetchMock });

    await client.getFeed({ limit: 25 });
    await client.getTransaction(txid);

    expect(fetchMock).toHaveBeenNthCalledWith(1, expectedFeedUrl, expect.objectContaining({ credentials: "omit" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, expectedTxUrl, expect.objectContaining({ credentials: "omit" }));
  });

  it.each(["", "   "])("defaults blank base URL %s to /api/v1", async (baseUrl) => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ baseUrl, fetchImpl: fetchMock });

    await client.getFeed({ limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/feed?limit=25", expect.objectContaining({ credentials: "omit" }));
  });

  it("trims surrounding base URL whitespace", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ baseUrl: "  https://api.example/api/v1/  ", fetchImpl: fetchMock });

    await client.getFeed({ limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example/api/v1/feed?limit=25", expect.objectContaining({ credentials: "omit" }));
  });

  it("encodes the transaction id path segment", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(verifiedTxResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await client.getTransaction("aa/b c");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/tx/aa%2Fb%20c", expect.objectContaining({ credentials: "omit" }));
  });

  it("handles successful JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).resolves.toEqual(feedResponse);
  });

  it("preserves public API error codes from non-2xx JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: "NOT_FOUND", message: "ignored" } }, { status: 404 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getTransaction(txid)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 404,
      apiCode: "NOT_FOUND"
    });
  });

  it("treats unrelated non-2xx JSON as an HTTP error without an API code", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: "internal" }, { status: 500 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "HTTP_ERROR", status: 500, apiCode: null });
  });

  it("treats non-2xx HTML as an HTTP error", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "HTTP_ERROR", status: 502, apiCode: null });
  });

  it("treats empty non-2xx bodies as HTTP errors", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "HTTP_ERROR", status: 503, apiCode: null });
  });

  it("rejects malformed successful JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("{", { status: 200 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "MALFORMED_JSON", status: 200 });
  });

  it("rejects structurally invalid successful responses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [{ transaction: {} }], limit: 25 }));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects unknown verification statuses", async () => {
    const response = clone(verifiedTxResponse);
    response.verification!.status = "PENDING" as typeof response.verification.status;
    const fetchMock = vi.fn(async () => jsonResponse(response));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getTransaction(txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects non-VERIFIED items inside the verified feed", async () => {
    const response = clone(feedResponse);
    response.items[0]!.verification.status = "UNAUTHORIZED";
    const fetchMock = vi.fn(async () => jsonResponse(response));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects mismatched transaction and verification txids", async () => {
    const response = clone(verifiedTxResponse);
    response.verification!.txid = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn(async () => jsonResponse(response));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getTransaction(txid)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([0, 101])("rejects feed limit %s", async (limit) => {
    const response = { ...feedResponse, limit };
    const fetchMock = vi.fn(async () => jsonResponse(response));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getFeed()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("accepts null transaction verification", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(nullVerificationResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });

    await expect(client.getTransaction(nullVerificationResponse.transaction.txid)).resolves.toEqual(nullVerificationResponse);
  });

  it("forwards AbortSignal", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    const client = new TonalliApiClient({ fetchImpl: fetchMock });
    const controller = new AbortController();

    await client.getFeed({ signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
