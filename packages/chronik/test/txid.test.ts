import { describe, expect, it } from "vitest";

import { ChronikTransactionClient, isCanonicalTxid, validateTxid } from "../src/index.js";
import { TXID } from "./fixtures.js";
import { FakeChronikTxSource, expectAdapterError } from "./helpers.js";

describe("txid validation", () => {
  it("accepts canonical lowercase 64-character txids", () => {
    expect(isCanonicalTxid(TXID)).toBe(true);
    expect(validateTxid(TXID)).toBe(TXID);
  });

  it("rejects empty, uppercase, non-hex, wrong length and whitespace txids", () => {
    for (const invalid of ["", TXID.toUpperCase(), TXID.slice(0, 63), TXID + "0", TXID.slice(0, 63) + "g", " " + TXID, TXID + " "]) {
      expect(isCanonicalTxid(invalid)).toBe(false);
      expectAdapterError(() => validateTxid(invalid), "INVALID_TXID");
    }
  });

  it("rejects invalid txids before invoking an injected source", async () => {
    const source = new FakeChronikTxSource({});
    const adapter = new ChronikTransactionClient({ source });
    await expect(adapter.getTransaction(TXID.toUpperCase())).rejects.toMatchObject({ code: "INVALID_TXID" });
    expect(source.calls).toEqual([]);
  });

  it("requires at least one URL when no source is injected", () => {
    expectAdapterError(() => new ChronikTransactionClient(), "INVALID_OPTIONS");
    expectAdapterError(() => new ChronikTransactionClient({ urls: [] }), "INVALID_OPTIONS");
  });

  it("does not require URLs when a source is injected", () => {
    expect(new ChronikTransactionClient({ source: new FakeChronikTxSource({}) })).toBeInstanceOf(ChronikTransactionClient);
  });

  it("rejects URLs with trailing slash", () => {
    expectAdapterError(() => new ChronikTransactionClient({ urls: ["https://chronik.e.cash/"] }), "INVALID_OPTIONS");
  });
});
