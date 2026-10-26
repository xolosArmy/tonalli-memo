import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  normalizeOpReturnOutput,
  type ChronikTransactionAdapter,
  type NormalizedInput,
  type NormalizedOpReturnOutput,
  type NormalizedTransaction
} from "@tonalli-memo/chronik";
import { MemoVerificationService } from "@tonalli-memo/verification";
import { IndexingEngine, MemoStore, openIndexerDatabase } from "../../src/index.js";
import { normalizedTx } from "../fixtures.js";

const PUBKEY_HEX = `02${"11".repeat(32)}`;
const SIGNATURE_WITH_HASHTYPE_HEX = `${"22".repeat(64)}41`;
const INVALID_TXID = "a1".repeat(32);
const VALID_TXID = "b2".repeat(32);

function authorInput(): NormalizedInput {
  const sha256 = createHash("sha256").update(Buffer.from(PUBKEY_HEX, "hex")).digest();
  const pkh = createHash("ripemd160").update(sha256).digest("hex");
  return {
    index: 0,
    prevOut: { txid: "44".repeat(32), outIdx: 0 },
    inputScriptHex: `41${SIGNATURE_WITH_HASHTYPE_HEX}21${PUBKEY_HEX}`,
    outputScriptHex: `76a914${pkh}88ac`,
    address: "ecash:qptestauthor000000000000000000000000000000"
  };
}

function tm1Script(eventData: Uint8Array): string {
  const length = 3 + eventData.length;
  if (length > 255) throw new Error("Fixture exceeds OP_PUSHDATA1 capacity.");
  const lengthHex = length.toString(16).padStart(2, "0");
  const envelopePush = length <= 75 ? lengthHex : `4c${lengthHex}`;
  const eventHex = Buffer.from(eventData).toString("hex");
  return `6a04544d4d00${envelopePush}010100${eventHex}`;
}

function tm1Output(outputScriptHex: string, outputIndex = 0): NormalizedOpReturnOutput {
  return normalizeOpReturnOutput(outputIndex, 0n, outputScriptHex);
}

function tm1Transaction(
  txid: string,
  scriptHexes: readonly string[]
): NormalizedTransaction {
  const author = authorInput();
  return normalizedTx({
    txid,
    inputs: [author],
    inputAddresses: author.address === null ? [] : [author.address],
    opReturnOutputs: scriptHexes.map((script, index) => tm1Output(script, index))
  });
}

function makeEngine(transactions: readonly NormalizedTransaction[]) {
  const lookup = new Map(transactions.map((transaction) => [transaction.txid, transaction]));
  const chronik: ChronikTransactionAdapter = {
    async getTransaction(txid: string): Promise<NormalizedTransaction> {
      const transaction = lookup.get(txid);
      if (transaction === undefined) throw new Error(`Unexpected test txid: ${txid}`);
      return transaction;
    }
  };
  const database = openIndexerDatabase({ filename: ":memory:" });
  const store = new MemoStore(database);
  const engine = new IndexingEngine({
    verificationService: new MemoVerificationService({ chronik }),
    store,
    clock: { nowSeconds: () => 1760000000 }
  });
  return { database, store, engine };
}

describe("D07-CONF-01 — Indexer Resilience and Physical Limits", () => {
  const valid212 = tm1Script(new Uint8Array(212).fill(0x61));
  const invalid213 = tm1Script(new Uint8Array(213).fill(0x61));
  const invalidUtf8 = tm1Script(Uint8Array.of(0xc3, 0x28));
  const nonMinimalEnvelope = "6a04544d4d004c0401010061";
  const nonMinimalMarker = "6a4c04544d4d000401010061";

  it.each([
    { caseName: "invalid UTF-8 bytes", script: invalidUtf8, errorCode: "INVALID_UTF8" },
    { caseName: "213-byte event data (224-byte script)", script: invalid213, errorCode: "PAYLOAD_TOO_LARGE" },
    { caseName: "non-minimal envelope push", script: nonMinimalEnvelope, errorCode: "INVALID_FORMAT" },
    { caseName: "non-minimal LOKAD marker push", script: nonMinimalMarker, errorCode: "INVALID_FORMAT" }
  ])("durably rejects $caseName without verified payload", async ({ script, errorCode }) => {
    const tx = tm1Transaction(INVALID_TXID, [script]);
    const { database, store, engine } = makeEngine([tx]);
    try {
      const outcome = await engine.indexTransaction(tx.txid);
      expect(outcome.verificationResult.status).toBe("INVALID_TM1");
      if (outcome.verificationResult.status !== "INVALID_TM1") {
        throw new Error("Expected INVALID_TM1.");
      }
      expect(outcome.verificationResult.protocolError.code).toBe(errorCode);
      expect(outcome.persistedRecord).toBe(true);

      const record = store.getVerificationRecord(tx.txid);
      expect(record).toMatchObject({
        protocol: "TM1",
        verificationStatus: "INVALID_MEMO",
        payload: null,
        diagnostics: { protocolError: { code: errorCode } }
      });
      expect(store.listIndexingAttempts(tx.txid)).toMatchObject([
        { resultStatus: "INVALID_TM1", persistedRecord: true }
      ]);
      expect(store.listVerifiedFeed(10)).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("accepts the exact 212-byte boundary without truncating persisted text", async () => {
    expect(valid212.length / 2).toBe(223);
    expect(invalid213.length / 2).toBe(224);

    const tx = tm1Transaction(VALID_TXID, [valid212]);
    const { database, store, engine } = makeEngine([tx]);
    try {
      const outcome = await engine.indexTransaction(tx.txid);
      expect(outcome.verificationResult.status).toBe("VERIFIED_TM1");
      expect(outcome.persistedRecord).toBe(true);
      expect(store.getVerificationRecord(tx.txid)).toMatchObject({
        verificationStatus: "VERIFIED",
        protocol: "TM1",
        payload: "a".repeat(212),
        byteLength: 212
      });
      expect(store.listVerifiedFeed(10)).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("records MULTIPLE_MEMOS for a valid TM1 plus a malformed TM1 candidate", async () => {
    const tx = tm1Transaction(INVALID_TXID, [tm1Script(Uint8Array.of(0x61)), nonMinimalEnvelope]);
    const { database, store, engine } = makeEngine([tx]);
    try {
      const outcome = await engine.indexTransaction(tx.txid);
      expect(outcome.verificationResult.status).toBe("MULTIPLE_MEMOS");
      expect(outcome.persistedRecord).toBe(true);
      expect(store.getVerificationRecord(tx.txid)).toMatchObject({
        verificationStatus: "MULTIPLE_MEMOS",
        payload: null
      });
      expect(store.listVerifiedFeed(10)).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it.each([
    { caseName: "invalid UTF-8", invalidScript: invalidUtf8, errorCode: "INVALID_UTF8" },
    { caseName: "oversized event", invalidScript: invalid213, errorCode: "PAYLOAD_TOO_LARGE" }
  ])("continues indexing a valid TM1 after $caseName without poisoning SQLite", async ({ invalidScript, errorCode }) => {
    const invalidTx = tm1Transaction(INVALID_TXID, [invalidScript]);
    const validTx = tm1Transaction(VALID_TXID, [tm1Script(Uint8Array.of(0x6f, 0x6b))]);
    const { database, store, engine } = makeEngine([invalidTx, validTx]);
    try {
      const invalidOutcome = await engine.indexTransaction(invalidTx.txid);
      expect(invalidOutcome.verificationResult.status).toBe("INVALID_TM1");
      if (invalidOutcome.verificationResult.status !== "INVALID_TM1") {
        throw new Error("Expected invalid TM1 outcome.");
      }
      expect(invalidOutcome.verificationResult.protocolError.code).toBe(errorCode);
      expect(invalidOutcome.persistedRecord).toBe(true);

      const validOutcome = await engine.indexTransaction(validTx.txid);
      expect(validOutcome.verificationResult.status).toBe("VERIFIED_TM1");
      expect(validOutcome.persistedRecord).toBe(true);
      expect(store.getVerificationRecord(invalidTx.txid)).toMatchObject({
        verificationStatus: "INVALID_MEMO",
        protocol: "TM1",
        payload: null
      });
      expect(store.getVerificationRecord(validTx.txid)).toMatchObject({
        verificationStatus: "VERIFIED",
        protocol: "TM1",
        payload: "ok"
      });
      expect(store.listIndexingAttempts(invalidTx.txid)).toHaveLength(1);
      expect(store.listIndexingAttempts(validTx.txid)).toHaveLength(1);
      expect(store.listVerifiedFeed(10).map((entry) => entry.transaction.txid)).toEqual([validTx.txid]);
    } finally {
      database.close();
    }
  });
});
