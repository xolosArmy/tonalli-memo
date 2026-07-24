import { describe, expect, it } from "vitest";

import { ChronikAdapterError, ChronikTransactionClient, createChronikTransactionAdapter } from "../src/index.js";
import {
  MEMPOOL_TXID,
  NONSTANDARD_SCRIPT,
  P2PKH_ZERO_ADDRESS,
  P2PKH_ZERO_SCRIPT,
  P2SH_ZERO_ADDRESS,
  P2SH_ZERO_SCRIPT,
  PREV_TXID,
  TXID,
  makeCoinbaseTx,
  makeConfirmedTx,
  makeMempoolTx
} from "./fixtures.js";
import { FakeChronikTxSource, ThrowingChronikTxSource, expectAsyncAdapterError, opReturnScript, utf8Hex } from "./helpers.js";

describe("ChronikTransactionClient", () => {
  it("normalizes a valid confirmed transaction", async () => {
    const source = new FakeChronikTxSource(makeConfirmedTx());
    const tx = await new ChronikTransactionClient({ source }).getTransaction(TXID);
    expect(tx.blockHeight).toBe(900001);
    expect(tx.inputAddresses).toEqual([P2PKH_ZERO_ADDRESS]);
    expect(tx.opReturnOutputs).toHaveLength(1);
  });

  it("normalizes a valid mempool transaction", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeMempoolTx()) }).getTransaction(MEMPOOL_TXID);
    expect(tx.blockHeight).toBeNull();
    expect(tx.firstSeenAt).toBeNull();
    expect(tx.isFinal).toBe(false);
  });

  it("normalizes coinbase input", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeCoinbaseTx()) }).getTransaction(TXID);
    expect(tx.inputs[0]?.outputScriptHex).toBeNull();
    expect(tx.inputs[0]?.address).toBeNull();
  });

  it("normalizes transactions without OP_RETURN", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx({ outputs: [{ sats: 546n, outputScript: "6b" }] })) }).getTransaction(TXID);
    expect(tx.opReturnOutputs).toEqual([]);
  });

  it("normalizes multiple OP_RETURN outputs", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(utf8Hex("a")) }, { sats: 0n, outputScript: opReturnScript(utf8Hex("b")) }] })) }).getTransaction(TXID);
    expect(tx.opReturnOutputs.map((output) => output.outputIndex)).toEqual([0, 1]);
  });

  it("preserves nonstandard input scripts with null address", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: NONSTANDARD_SCRIPT, sats: 1n, sequenceNo: 1 }] })) }).getTransaction(TXID);
    expect(tx.inputs[0]).toMatchObject({ outputScriptHex: NONSTANDARD_SCRIPT, address: null });
  });

  it("extracts standard P2PKH input addresses", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 }] })) }).getTransaction(TXID);
    expect(tx.inputs[0]?.address).toBe(P2PKH_ZERO_ADDRESS);
  });

  it("extracts standard P2SH input addresses", async () => {
    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: P2SH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 }] })) }).getTransaction(TXID);
    expect(tx.inputs[0]?.address).toBe(P2SH_ZERO_ADDRESS);
  });

  it("rejects returned txid mismatches", async () => {
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx({ txid: MEMPOOL_TXID })) }).getTransaction(TXID), "INVALID_CHRONIK_RESPONSE");
  });

  it("rejects malformed responses", async () => {
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source: new FakeChronikTxSource({ txid: TXID }) }).getTransaction(TXID), "INVALID_CHRONIK_RESPONSE");
  });

  it("maps transaction-not-found source errors", async () => {
    const cause = new Error("404: Transaction " + TXID + " not found in the index");
    const source = new ThrowingChronikTxSource(cause);
    try {
      await new ChronikTransactionClient({ source }).getTransaction(TXID);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ChronikAdapterError);
      expect((error as ChronikAdapterError).code).toBe("TRANSACTION_NOT_FOUND");
      expect((error as ChronikAdapterError).cause).toBe(cause);
    }
  });

  it("maps unavailable source errors", async () => {
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source: new ThrowingChronikTxSource(new Error("All endpoints failed")) }).getTransaction(TXID), "CHRONIK_UNAVAILABLE");
  });

  it("does not call the source for invalid caller txids", async () => {
    const source = new FakeChronikTxSource(makeConfirmedTx());
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source }).getTransaction(TXID.toUpperCase()), "INVALID_TXID");
    expect(source.calls).toEqual([]);
  });

  it("does not remap malformed successful source data to unavailable", async () => {
    const source = new FakeChronikTxSource({ txid: TXID });
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source }).getTransaction(TXID), "INVALID_CHRONIK_RESPONSE");
    expect(source.calls).toEqual([TXID]);
  });

  it("preserves call boundaries across repeated requests", async () => {
    const source = new FakeChronikTxSource((requestedTxid: string) => makeConfirmedTx({ txid: requestedTxid }));
    const adapter = new ChronikTransactionClient({ source });
    await adapter.getTransaction(TXID);
    await adapter.getTransaction(MEMPOOL_TXID);
    expect(source.calls).toEqual([TXID, MEMPOOL_TXID]);
  });

  it("does not call injected sources during construction", () => {
    const source = new FakeChronikTxSource(makeConfirmedTx());
    new ChronikTransactionClient({ source });
    expect(source.calls).toEqual([]);
  });

  it("keeps generic and misleading source errors unavailable", async () => {
    const generic = new Error("boom");
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source: new ThrowingChronikTxSource(generic) }).getTransaction(TXID), "CHRONIK_UNAVAILABLE");

    const misleading = new Error("upstream returned 404 while fetching health status");
    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source: new ThrowingChronikTxSource(misleading) }).getTransaction(TXID), "CHRONIK_UNAVAILABLE");

    await expectAsyncAdapterError(() => new ChronikTransactionClient({ source: new ThrowingChronikTxSource({ status: 503 }) }).getTransaction(TXID), "CHRONIK_UNAVAILABLE");
  });

  it("validates address prefixes before normalization", async () => {
    expect(() => new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx()), addressPrefix: "" })).toThrow(ChronikAdapterError);
    expect(() => new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx()), addressPrefix: " ecash" })).toThrow(ChronikAdapterError);
    expect(() => new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx()), addressPrefix: "Ecash" })).toThrow(ChronikAdapterError);

    const tx = await new ChronikTransactionClient({ source: new FakeChronikTxSource(makeConfirmedTx()), addressPrefix: "ectest" }).getTransaction(TXID);
    expect(tx.inputAddresses[0]?.startsWith("ectest:")).toBe(true);
  });

  it("calls the source exactly once and retains raw response", async () => {
    const raw = makeConfirmedTx();
    const source = new FakeChronikTxSource(raw);
    const tx = await createChronikTransactionAdapter({ source }).getTransaction(TXID);
    expect(source.calls).toEqual([TXID]);
    expect(tx.rawResponse).toBe(raw);
  });
});
