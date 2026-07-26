import { describe, expect, it } from "vitest";
import { mapVerificationResult } from "../../src/index.js";
import { openStore } from "../helpers.js";
import {
  decision,
  invalidMemoResult,
  mempoolTx,
  noMemoResult,
  normalizedTx,
  operationalResult,
  sourceFailure,
  TEST_ADDRESS,
  TXID,
  TXID_2,
  unauthorizedResult,
  verifiedResult
} from "../fixtures.js";

const persist = (store: ReturnType<typeof openStore>["store"], result: Parameters<typeof mapVerificationResult>[0], now = 100) =>
  store.persistIndexingResult({
    mappedResult: mapVerificationResult(result, result.txid, null),
    nowSeconds: now
  });

describe("MemoStore", () => {
  it("inserts and retrieves a transaction", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult());
    expect(store.getTransaction(TXID)).toMatchObject({
      txid: TXID,
      chainStatus: "confirmed",
      blockHeight: 900001
    });
    database.close();
  });

  it.each(["VERIFIED", "UNAUTHORIZED", "NO_MEMO", "INVALID_MEMO", "MULTIPLE_MEMOS"] as const)(
    "inserts and retrieves durable %s records",
    (status) => {
      const { database, store } = openStore();
      const result =
        status === "VERIFIED"
          ? verifiedResult()
          : status === "UNAUTHORIZED"
            ? unauthorizedResult()
            : status === "NO_MEMO"
              ? noMemoResult()
              : status === "INVALID_MEMO"
                ? invalidMemoResult()
                : {
                    status: "MULTIPLE_MEMOS" as const,
                    txid: TXID,
                    transaction: normalizedTx(),
                    candidates: []
                  };
      persist(store, result);
      expect(store.getVerificationRecord(TXID)?.verificationStatus).toBe(status);
      database.close();
    }
  );

  it("preserves first timestamps and updates last timestamps while keeping one current row", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    persist(store, verifiedResult({ memo: { ...verifiedResult().memo, payload: "changed" } }), 200);
    const transaction = store.getTransaction(TXID);
    const record = store.getVerificationRecord(TXID);
    expect(transaction?.firstIndexedAt).toBe(100);
    expect(transaction?.updatedAt).toBe(200);
    expect(record?.firstIndexedAt).toBe(100);
    expect(record?.lastVerifiedAt).toBe(200);
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM verification_records").get()).toEqual({ count: 1 });
    database.close();
  });

  it("appends attempts rather than upserting", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    persist(store, verifiedResult(), 200);
    expect(store.listIndexingAttempts(TXID)).toHaveLength(2);
    database.close();
  });

  it("adapter failure creates only an attempt", () => {
    const { database, store } = openStore();
    persist(store, sourceFailure("INVALID_TXID"), 100);
    expect(store.getTransaction(TXID)).toBeNull();
    expect(store.getVerificationRecord(TXID)).toBeNull();
    expect(store.listIndexingAttempts("not-a-txid")).toHaveLength(1);
    database.close();
  });

  it("incomplete mempool context stores transaction but does not overwrite completed verification", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    persist(store, operationalResult("MEMPOOL_TIP_REQUIRED"), 200);
    expect(store.getVerificationRecord(TXID)?.verificationStatus).toBe("VERIFIED");
    expect(store.listIndexingAttempts(TXID).map((attempt) => attempt.persistedRecord)).toEqual([true, false]);
    database.close();
  });

  it("clears stale nullable fields on status transition", () => {
    const { database, store } = openStore();
    persist(store, unauthorizedResult(), 100);
    persist(store, noMemoResult(), 200);
    expect(store.getVerificationRecord(TXID)).toMatchObject({
      verificationStatus: "NO_MEMO",
      profileCode: null,
      authorizingAddress: null,
      evaluationHeight: null,
      diagnostics: {}
    });
    database.close();
  });

  it("retains authorization decision order and duplicate addresses", () => {
    const { database, store } = openStore();
    persist(
      store,
      verifiedResult({
        authorizationDecisions: [decision(0, TEST_ADDRESS, false), decision(1, TEST_ADDRESS, true)],
        authorizingInputIndex: 1
      }),
      100
    );
    expect(store.getVerificationRecord(TXID)?.authorizationDecisions).toEqual([
      { inputIndex: 0, address: TEST_ADDRESS, authorized: false, reason: "ADDRESS_NOT_LISTED", evaluationHeight: 900001 },
      { inputIndex: 1, address: TEST_ADDRESS, authorized: true, reason: "AUTHORIZED", evaluationHeight: 900001 }
    ]);
    database.close();
  });

  it("supports mempool to confirmed and confirmed to unconfirmed reindex transitions", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult({ transaction: mempoolTx() }), 100);
    expect(store.getTransaction(TXID)).toMatchObject({
      chainStatus: "unconfirmed",
      blockHeight: null
    });
    persist(store, verifiedResult({ transaction: normalizedTx() }), 200);
    expect(store.getTransaction(TXID)).toMatchObject({
      chainStatus: "confirmed",
      blockHeight: 900001
    });
    persist(store, verifiedResult({ transaction: mempoolTx({ txid: TXID }) }), 300);
    expect(store.getTransaction(TXID)).toMatchObject({
      chainStatus: "unconfirmed",
      blockHeight: null,
      blockHash: null,
      blockTimestamp: null,
      firstIndexedAt: 100,
      updatedAt: 300
    });
    expect(store.listIndexingAttempts(TXID)).toHaveLength(3);
    database.close();
  });

  it("supports UNAUTHORIZED to VERIFIED and INVALID_MEMO to VERIFIED transitions", () => {
    const { database, store } = openStore();
    persist(store, unauthorizedResult(), 100);
    persist(store, verifiedResult(), 200);
    expect(store.getVerificationRecord(TXID)).toMatchObject({
      verificationStatus: "VERIFIED",
      authorizingAddress: TEST_ADDRESS,
      diagnostics: {}
    });

    persist(store, invalidMemoResult(), 300);
    persist(store, verifiedResult({ transaction: normalizedTx({ txid: TXID_2 }), txid: TXID_2 }), 400);
    expect(store.getVerificationRecord(TXID_2)?.verificationStatus).toBe("VERIFIED");
    database.close();
  });
});

describe("MemoStore transaction lifecycle", () => {
  it("migrates existing version 1 rows as active", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    expect(database.connection.prepare("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: true, inactiveReason: null });
    database.close();
  });

  it("upsert reactivates inactive transactions and clears inactive reason", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    store.markTransactionInactive(TXID, "REMOVED_FROM_MEMPOOL");
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: false, inactiveReason: "REMOVED_FROM_MEMPOOL" });
    persist(store, verifiedResult(), 200);
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: true, inactiveReason: null });
    database.close();
  });

  it("excludes removed and invalidated transactions from the verified feed while preserving durable records", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult({ txid: TXID, transaction: normalizedTx({ txid: TXID }) }), 100);
    persist(store, verifiedResult({ txid: TXID_2, transaction: normalizedTx({ txid: TXID_2 }) }), 200);
    store.markTransactionInactive(TXID, "REMOVED_FROM_MEMPOOL");
    store.markTransactionInactive(TXID_2, "INVALIDATED");
    expect(store.listVerifiedFeed(10)).toEqual([]);
    expect(store.getVerificationRecord(TXID)?.verificationStatus).toBe("VERIFIED");
    expect(store.getVerificationRecord(TXID_2)?.verificationStatus).toBe("VERIFIED");
    database.close();
  });

  it("lists bounded active unconfirmed and affected confirmed txids", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult({ txid: TXID, transaction: mempoolTx({ txid: TXID }) }), 100);
    persist(store, verifiedResult({ txid: TXID_2, transaction: normalizedTx({ txid: TXID_2, blockHeight: 900010 }) }), 200);
    expect(store.listActiveUnconfirmedTxids(1)).toEqual([TXID]);
    expect(store.listActiveConfirmedTxidsAtOrAbove(900005, 1)).toEqual([TXID_2]);
    database.close();
  });

  it("uses parameterized bounded queries and rejects invalid limits", () => {
    const { database, store } = openStore();
    expect(() => store.listActiveUnconfirmedTxids(0)).toThrow("limit");
    expect(() => store.listActiveUnconfirmedTxids(1001)).toThrow("limit");
    expect(() => store.listActiveConfirmedTxidsAtOrAbove(-1, 1)).toThrow("Block height");
    expect(() => store.listActiveConfirmedTxidsAtOrAbove(0, 0)).toThrow("limit");
    database.close();
  });

  it("markTransactionInactive reports unchanged for unknown txids", () => {
    const { database, store } = openStore();
    expect(store.markTransactionInactive(TXID, "INVALIDATED")).toEqual({ txid: TXID, changed: false });
    database.close();
  });

  it("markTransactionInactive reports changed for active rows marked removed from mempool", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    expect(store.markTransactionInactive(TXID, "REMOVED_FROM_MEMPOOL")).toEqual({ txid: TXID, changed: true });
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: false, inactiveReason: "REMOVED_FROM_MEMPOOL" });
    database.close();
  });

  it("markTransactionInactive reports changed for active rows marked invalidated", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    expect(store.markTransactionInactive(TXID, "INVALIDATED")).toEqual({ txid: TXID, changed: true });
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: false, inactiveReason: "INVALIDATED" });
    database.close();
  });

  it("markTransactionInactive reports unchanged for inactive rows with the same reason", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    expect(store.markTransactionInactive(TXID, "INVALIDATED")).toEqual({ txid: TXID, changed: true });
    expect(store.markTransactionInactive(TXID, "INVALIDATED")).toEqual({ txid: TXID, changed: false });
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: false, inactiveReason: "INVALIDATED" });
    database.close();
  });

  it("markTransactionInactive reports changed when inactive reason changes", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    expect(store.markTransactionInactive(TXID, "REMOVED_FROM_MEMPOOL")).toEqual({ txid: TXID, changed: true });
    expect(store.markTransactionInactive(TXID, "INVALIDATED")).toEqual({ txid: TXID, changed: true });
    expect(store.getTransaction(TXID)).toMatchObject({ isActive: false, inactiveReason: "INVALIDATED" });
    database.close();
  });

  it("markTransactionInactive rejects invalid inactive reasons at the API boundary", () => {
    const { database, store } = openStore();
    persist(store, verifiedResult(), 100);
    expect(() => store.markTransactionInactive(TXID, "STALE" as never)).toThrow("Transaction inactive reason");
    database.close();
  });
});
