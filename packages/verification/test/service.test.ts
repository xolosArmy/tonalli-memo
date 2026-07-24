import { describe, expect, it } from "vitest";
import { ChronikAdapterError, type ChronikTransactionAdapter, type NormalizedTransaction } from "@tonalli-memo/chronik";
import { MemoVerificationService, verifyNormalizedTransaction } from "../src/index.js";
import { normalizedTx } from "./fixtures.js";
import { TEST_ADDRESS, TXID, expectStatus, registryWithXaAddresses } from "./helpers.js";
import type { RegistryDocument } from "@tonalli-memo/registry";

class FakeAdapter implements ChronikTransactionAdapter {
  calls: string[] = [];
  constructor(private readonly outcome: NormalizedTransaction | Error) {}

  async getTransaction(txid: string): Promise<NormalizedTransaction> {
    this.calls.push(txid);
    if (this.outcome instanceof Error) {
      throw this.outcome;
    }
    return this.outcome;
  }
}

class ThrowingValueAdapter implements ChronikTransactionAdapter {
  calls: string[] = [];
  constructor(private readonly value: unknown) {}

  async getTransaction(txid: string): Promise<NormalizedTransaction> {
    this.calls.push(txid);
    throw this.value;
  }
}

const chronikError = (code: ChronikAdapterError["code"], cause?: unknown): ChronikAdapterError =>
  new ChronikAdapterError({
    code,
    message: `${code} summary`,
    txid: TXID,
    cause
  });

describe("MemoVerificationService", () => {
  it("maps invalid TXID errors while preserving caller input", async () => {
    const requestedTxid = "not-a-valid-txid";
    const adapter = new FakeAdapter(chronikError("INVALID_TXID"));
    const service = new MemoVerificationService({ chronik: adapter });
    const result = await service.verifyTransaction(requestedTxid);
    expect(result.status).toBe("INVALID_TXID");
    if (result.status !== "INVALID_TXID") {
      throw new Error("Expected INVALID_TXID.");
    }
    expect(result.txid).toBe(requestedTxid);
    expect(result.sourceError).toMatchObject({
      code: "INVALID_TXID",
      message: "INVALID_TXID summary"
    });
    expect("transaction" in result).toBe(false);
    expect(adapter.calls).toEqual([requestedTxid]);
  });

  it("maps transaction not found errors", async () => {
    const service = new MemoVerificationService({ chronik: new FakeAdapter(chronikError("TRANSACTION_NOT_FOUND")) });
    expectStatus(await service.verifyTransaction(TXID), "TRANSACTION_NOT_FOUND");
  });

  it("maps Chronik unavailable errors", async () => {
    const service = new MemoVerificationService({ chronik: new FakeAdapter(chronikError("CHRONIK_UNAVAILABLE")) });
    expectStatus(await service.verifyTransaction(TXID), "CHRONIK_UNAVAILABLE");
  });

  it("maps invalid Chronik response errors", async () => {
    const service = new MemoVerificationService({ chronik: new FakeAdapter(chronikError("INVALID_CHRONIK_RESPONSE")) });
    expectStatus(await service.verifyTransaction(TXID), "INVALID_CHRONIK_RESPONSE");
  });

  it("calls a valid source exactly once", async () => {
    const adapter = new FakeAdapter(normalizedTx());
    const service = new MemoVerificationService({
      chronik: adapter,
      registry: registryWithXaAddresses([{ address: TEST_ADDRESS }])
    });
    const result = expectStatus(await service.verifyTransaction(TXID), "VERIFIED");
    expect(result.txid).toBe(result.transaction.txid);
    expect(adapter.calls).toEqual([TXID]);
  });

  it("does not overwrite a normalized transaction TXID", async () => {
    const transaction = normalizedTx({ txid: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" });
    const adapter = new FakeAdapter(transaction);
    const service = new MemoVerificationService({ chronik: adapter });
    const result = await service.verifyTransaction(TXID);
    expect(result.txid).toBe(transaction.txid);
  });

  it("passes the unchanged TXID to Chronik", async () => {
    const adapter = new FakeAdapter(normalizedTx());
    const txid = "ABCDEF";
    const service = new MemoVerificationService({ chronik: adapter });
    await service.verifyTransaction(txid);
    expect(adapter.calls).toEqual([txid]);
  });

  it("construction performs no source call", () => {
    const adapter = new FakeAdapter(normalizedTx());
    new MemoVerificationService({ chronik: adapter });
    expect(adapter.calls).toEqual([]);
  });

  it("pure normalized verification performs no source call", () => {
    const adapter = new FakeAdapter(normalizedTx());
    expectStatus(verifyNormalizedTransaction(normalizedTx()), "UNAUTHORIZED");
    expect(adapter.calls).toEqual([]);
  });

  it("propagates unexpected non-Chronik errors", async () => {
    const service = new MemoVerificationService({ chronik: new FakeAdapter(new Error("programming error")) });
    await expect(service.verifyTransaction(TXID)).rejects.toThrow("programming error");
  });

  it("propagates thrown non-Error values", async () => {
    const service = new MemoVerificationService({ chronik: new ThrowingValueAdapter("raw failure") });
    await expect(service.verifyTransaction(TXID)).rejects.toBe("raw failure");
  });

  it("propagates unexpected INVALID_OPTIONS adapter errors", async () => {
    const service = new MemoVerificationService({ chronik: new FakeAdapter(chronikError("INVALID_OPTIONS")) });
    await expect(service.verifyTransaction(TXID)).rejects.toThrow(ChronikAdapterError);
  });

  it("propagates verification invariant errors", async () => {
    const registry = registryWithXaAddresses([]);
    const incompleteRegistry = {
      ...registry,
      profiles: {
        ...registry.profiles,
        xa: undefined
      }
    } as unknown as RegistryDocument;
    const service = new MemoVerificationService({
      chronik: new FakeAdapter(normalizedTx()),
      registry: incompleteRegistry
    });

    await expect(service.verifyTransaction(TXID)).rejects.toThrow("could not be resolved");
  });

  it("preserves known adapter causes only as inspection metadata", async () => {
    const cause = new Error("raw cause");
    const service = new MemoVerificationService({ chronik: new FakeAdapter(chronikError("CHRONIK_UNAVAILABLE", cause)) });
    const result = await service.verifyTransaction(TXID);
    expect(result.status).toBe("CHRONIK_UNAVAILABLE");
    if (result.status !== "CHRONIK_UNAVAILABLE") {
      throw new Error("Expected CHRONIK_UNAVAILABLE.");
    }
    expect(result.sourceError).toMatchObject({
      code: "CHRONIK_UNAVAILABLE",
      message: "CHRONIK_UNAVAILABLE summary"
    });
    expect(result.sourceError.cause).toBe(cause);
  });
});
