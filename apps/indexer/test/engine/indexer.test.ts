import { describe, expect, it } from "vitest";
import type { ScriptUtxos } from "@tonalli-memo/chronik";
import type { MemoVerificationService, VerificationResult, VerifyTransactionContext } from "@tonalli-memo/verification";
import { IndexingEngine, MemoStore, openIndexerDatabase } from "../../src/index.js";
import { fakeClock } from "../helpers.js";
import {
  invalidMemoResult,
  mempoolTx,
  multipleMemosResult,
  noMemoResult,
  operationalResult,
  sourceFailure,
  TXID,
  unauthorizedResult,
  verifiedResult,
  verifiedTm1Result
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

const openEngine = (
  service: FakeService,
  clockValues: readonly number[] = [1234],
  chronik?: { getAddressUtxos(address: string): Promise<ScriptUtxos> }
) => {
  const database = openIndexerDatabase({ filename: ":memory:" });
  const store = new MemoStore(database);
  const engine = new IndexingEngine({
    verificationService: service as unknown as MemoVerificationService,
    store,
    clock: fakeClock(clockValues),
    ...(chronik !== undefined ? { chronik } : {})
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

  describe("TM1 NFT attachments", () => {
    const tokenId = "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8";
    const rawPayload = `@nft1:${tokenId}\nMi xolo NFT acompañando este Memo`;

    const makeUtxos = (matching: boolean): ScriptUtxos => ({
      outputScript: "76a914...",
      utxos: matching
        ? [
            {
              outpoint: { txid: "00".repeat(32), outIdx: 0 },
              blockHeight: 800000,
              isCoinbase: false,
              sats: 546n,
              isFinal: true,
              token: {
                tokenId,
                tokenType: { protocol: "SLP", type: "SLP_TOKEN_TYPE_NFT1_CHILD", number: 65 },
                isMintBaton: false,
                atoms: 1n
              }
            }
          ]
        : []
    });

    it("indexes TM1 post with NFT attachment and verified ownership", async () => {
      const service = new FakeService(verifiedTm1Result(rawPayload));
      const chronik = {
        getAddressUtxos: async () => makeUtxos(true)
      };
      const { database, store, engine } = openEngine(service, [1234], chronik);

      const outcome = await engine.indexTransaction(TXID);
      expect(outcome.verificationResult.status).toBe("VERIFIED_TM1");

      const record = store.getVerificationRecord(TXID);
      expect(record?.payload).toBe(rawPayload); // Invariant 1: exact canonical payload preserved!
      expect(record?.attachedTokenId).toBe(tokenId);
      expect(record?.attachmentOwnershipStatus).toBe("VERIFIED_AT_INDEXING");
      expect(record?.attachmentCheckedAt).toBe(1234);
      expect(record?.diagnostics).toMatchObject({
        attachment: {
          tokenId,
          ownershipStatus: "VERIFIED_AT_INDEXING",
          ownershipReason: "token-owned-and-verified-nft1-child",
          checkedAt: 1234
        }
      });
      database.close();
    });

    it("indexes TM1 post with NFT attachment as UNVERIFIED when not owned without degrading TM1 memo validity", async () => {
      const service = new FakeService(verifiedTm1Result(rawPayload));
      const chronik = {
        getAddressUtxos: async () => makeUtxos(false)
      };
      const { database, store, engine } = openEngine(service, [1234], chronik);

      const outcome = await engine.indexTransaction(TXID);
      expect(outcome.verificationResult.status).toBe("VERIFIED_TM1");

      const record = store.getVerificationRecord(TXID);
      expect(record?.verificationStatus).toBe("VERIFIED");
      expect(record?.payload).toBe(rawPayload);
      expect(record?.attachedTokenId).toBe(tokenId);
      expect(record?.attachmentOwnershipStatus).toBe("UNVERIFIED");
      expect(record?.attachmentCheckedAt).toBe(1234);
      expect(record?.diagnostics).toMatchObject({
        attachment: {
          tokenId,
          ownershipStatus: "UNVERIFIED",
          ownershipReason: "token-not-owned-or-not-valid-nft1-child"
        }
      });
      database.close();
    });

    it("fails closed as UNVERIFIED when chronik is unavailable without degrading TM1 memo validity", async () => {
      const service = new FakeService(verifiedTm1Result(rawPayload));
      const chronik = {
        getAddressUtxos: async () => {
          throw new Error("Chronik 503 Service Unavailable");
        }
      };
      const { database, store, engine } = openEngine(service, [1234], chronik);

      const outcome = await engine.indexTransaction(TXID);
      expect(outcome.verificationResult.status).toBe("VERIFIED_TM1");

      const record = store.getVerificationRecord(TXID);
      expect(record?.verificationStatus).toBe("VERIFIED");
      expect(record?.payload).toBe(rawPayload);
      expect(record?.attachedTokenId).toBe(tokenId);
      expect(record?.attachmentOwnershipStatus).toBe("UNVERIFIED");
      expect(record?.attachmentCheckedAt).toBe(1234);
      expect(record?.diagnostics).toMatchObject({
        attachment: {
          tokenId,
          ownershipStatus: "UNVERIFIED",
          ownershipReason: "chronik-unavailable"
        }
      });
      database.close();
    });

    it("indexes TM1 post without attachment directive preserving null attachment fields", async () => {
      const plainPayload = "A plain memo without attachments";
      const service = new FakeService(verifiedTm1Result(plainPayload));
      const { database, store, engine } = openEngine(service, [1234]);

      await engine.indexTransaction(TXID);
      const record = store.getVerificationRecord(TXID);
      expect(record?.payload).toBe(plainPayload);
      expect(record?.attachedTokenId).toBeNull();
      expect(record?.attachmentOwnershipStatus).toBeNull();
      expect(record?.attachmentCheckedAt).toBeNull();
      expect((record?.diagnostics as Record<string, unknown> | undefined)?.attachment).toBeUndefined();
      database.close();
    });

    it("does not interpret TM0 payload with @nft1 prefix as TM1 attachment directive", async () => {
      const service = new FakeService(verifiedResult({
        memo: {
          marker: "TM0",
          version: 0,
          type: "p",
          profile: "xa",
          payload: rawPayload,
          byteLength: rawPayload.length
        }
      }));
      const { database, store, engine } = openEngine(service, [1234]);

      await engine.indexTransaction(TXID);
      const record = store.getVerificationRecord(TXID);
      expect(record?.payload).toBe(rawPayload);
      expect(record?.attachedTokenId).toBeNull();
      expect(record?.attachmentOwnershipStatus).toBeNull();
      database.close();
    });

    it("preserves attachment fields when transaction transitions from unconfirmed to confirmed", async () => {
      const unconfirmedTx = mempoolTx({ txid: TXID });
      const confirmedTx = { ...unconfirmedTx, blockHeight: 900000, blockHash: "hash", blockTimestamp: 1700000000 };

      const unconfirmedService = new FakeService(verifiedTm1Result(rawPayload, { transaction: unconfirmedTx }));
      const chronik = {
        getAddressUtxos: async () => makeUtxos(true)
      };

      const database = openIndexerDatabase({ filename: ":memory:" });
      const store = new MemoStore(database);
      const engine1 = new IndexingEngine({
        verificationService: unconfirmedService as unknown as MemoVerificationService,
        store,
        clock: fakeClock([1000]),
        chronik
      });

      await engine1.indexTransaction(TXID);
      const record1 = store.getVerificationRecord(TXID);
      expect(record1?.attachedTokenId).toBe(tokenId);
      expect(record1?.attachmentOwnershipStatus).toBe("VERIFIED_AT_INDEXING");
      expect(store.getTransaction(TXID)?.chainStatus).toBe("unconfirmed");

      // Now index confirmed
      const confirmedService = new FakeService(verifiedTm1Result(rawPayload, { transaction: confirmedTx }));
      const engine2 = new IndexingEngine({
        verificationService: confirmedService as unknown as MemoVerificationService,
        store,
        clock: fakeClock([2000]),
        chronik
      });

      await engine2.indexTransaction(TXID);
      const record2 = store.getVerificationRecord(TXID);
      expect(record2?.attachedTokenId).toBe(tokenId);
      expect(record2?.attachmentOwnershipStatus).toBe("VERIFIED_AT_INDEXING");
      expect(store.getTransaction(TXID)?.chainStatus).toBe("confirmed");
      database.close();
    });
  });
});
