import { describe, expect, it } from "vitest";
import type { MemoVerificationService, VerificationResult, VerifyTransactionContext } from "@tonalli-memo/verification";
import { IndexingEngine, MemoStore, openIndexerDatabase } from "../../src/index.js";
import { fakeClock } from "../helpers.js";
import {
  invalidMemoResult,
  multipleMemosResult,
  noMemoResult,
  operationalResult,
  sourceFailure,
  TXID,
  unauthorizedResult,
  verifiedResult
} from "../fixtures.js";

class FakeService {
  readonly calls: { readonly txid: string; readonly context: VerifyTransactionContext }[] = [];

  constructor(private readonly outcome: VerificationResult | Error) {}

  async verifyTransaction(txid: string, context: VerifyTransactionContext = {}): Promise<VerificationResult> {
    this.calls.push({ txid, context });
    if (this.outcome instanceof Error) {
      throw this.outcome;
    }
    return this.outcome;
  }
}

const openEngine = (service: FakeService, clockValues: readonly number[] = [1234]) => {
  const database = openIndexerDatabase({ filename: ":memory:" });
  const store = new MemoStore(database);
  const engine = new IndexingEngine({
    verificationService: service as unknown as MemoVerificationService,
    store,
    clock: fakeClock(clockValues)
  });
  return { database, store, engine };
};

describe("IndexingEngine", () => {
  it.each([
    ["VERIFIED", verifiedResult(), true],
    ["UNAUTHORIZED", unauthorizedResult(), true],
    ["NO_MEMO", noMemoResult(), true],
    ["INVALID_MEMO", invalidMemoResult(), true],
    ["MULTIPLE_MEMOS", multipleMemosResult(), true],
    ["MEMPOOL_TIP_REQUIRED", operationalResult("MEMPOOL_TIP_REQUIRED"), false],
    ["INVALID_VERIFICATION_CONTEXT", operationalResult("INVALID_VERIFICATION_CONTEXT"), false],
    ["INVALID_TXID", sourceFailure("INVALID_TXID"), false],
    ["TRANSACTION_NOT_FOUND", sourceFailure("TRANSACTION_NOT_FOUND"), false],
    ["CHRONIK_UNAVAILABLE", sourceFailure("CHRONIK_UNAVAILABLE"), false],
    ["INVALID_CHRONIK_RESPONSE", sourceFailure("INVALID_CHRONIK_RESPONSE"), false]
  ] as const)("indexes %s outcomes", async (_status, result, persistedRecord) => {
    const service = new FakeService(result);
    const { database, store, engine } = openEngine(service);
    const outcome = await engine.indexTransaction(TXID);
    expect(outcome.verificationResult.status).toBe(result.status);
    expect(outcome.persistedRecord).toBe(persistedRecord);
    expect(outcome.attemptId).toBe(1);
    expect(store.listIndexingAttempts(TXID)).toHaveLength(1);
    database.close();
  });

  it("forwards exact txid and tip height and calls service once", async () => {
    const service = new FakeService(verifiedResult());
    const { database, engine } = openEngine(service);
    await engine.indexTransaction("ABCDEF", { tipHeight: 900100 });
    expect(service.calls).toEqual([{ txid: "ABCDEF", context: { tipHeight: 900100 } }]);
    database.close();
  });

  it("uses deterministic fake clock", async () => {
    const service = new FakeService(verifiedResult());
    const { database, store, engine } = openEngine(service, [777]);
    await engine.indexTransaction(TXID);
    expect(store.getTransaction(TXID)?.firstIndexedAt).toBe(777);
    expect(store.listIndexingAttempts(TXID)[0]?.attemptedAt).toBe(777);
    database.close();
  });

  it("propagates unexpected service errors", async () => {
    const service = new FakeService(new Error("programming failure"));
    const { database, engine } = openEngine(service);
    await expect(engine.indexTransaction(TXID)).rejects.toThrow("programming failure");
    database.close();
  });

  it("propagates SQLite failures", async () => {
    const service = new FakeService(verifiedResult());
    const { database, engine } = openEngine(service);
    database.close();
    await expect(engine.indexTransaction(TXID)).rejects.toThrow();
  });
});
