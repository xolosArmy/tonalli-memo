import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeOpReturnOutput, type ChronikTransactionAdapter, type NormalizedInput, type NormalizedTransaction } from "@tonalli-memo/chronik";
import { MemoVerificationService } from "@tonalli-memo/verification";
import { IndexingEngine, MemoStore, openIndexerDatabase } from "../../src/index.js";
import { normalizedTx } from "../fixtures.js";

// Structural fixtures only: dummy signature bytes MUST NOT be interpreted as valid on-chain signatures.
const pubkey = `02${"11".repeat(32)}`;
const differentKey = `03${"22".repeat(32)}`;
const address = "ecash:qptestauthor000000000000000000000000000000";
function hash160(hex: string): string {
  const digest = createHash("sha256").update(Buffer.from(hex, "hex")).digest();
  return createHash("ripemd160").update(digest).digest("hex");
}
const p2pkh = `76a914${hash160(pubkey)}88ac`;
const p2sh = `a914${"33".repeat(20)}87`;
const multisig = `5121${pubkey}51ae`;
function scriptSig(key = pubkey, sighash = "41", fill = "22"): string {
  return `41${fill.repeat(64)}${sighash}21${key}`;
}
function input(index: number, override: Partial<NormalizedInput> = {}): NormalizedInput {
  return {
    index, prevOut: { txid: "44".repeat(32), outIdx: index },
    inputScriptHex: scriptSig(), outputScriptHex: p2pkh, address, ...override
  };
}
function tx(txid: string, designatedIndex: number, inputs: readonly NormalizedInput[]): NormalizedTransaction {
  if (designatedIndex < 0 || designatedIndex > 255) throw new Error("Author index must be a byte.");
  const indexByte = designatedIndex.toString(16).padStart(2, "0");
  const tm1 = normalizeOpReturnOutput(0, 0n, `6a04544d4d00050101${indexByte}6f6b`);
  return normalizedTx({
    txid, inputs,
    inputAddresses: inputs.flatMap((item) => item.address === null ? [] : [item.address]),
    opReturnOutputs: [tm1]
  });
}
function fixture(transactions: readonly NormalizedTransaction[]) {
  const byTxid = new Map(transactions.map((item) => [item.txid, item]));
  const chronik: ChronikTransactionAdapter = {
    async getTransaction(txid: string): Promise<NormalizedTransaction> {
      const result = byTxid.get(txid);
      if (result === undefined) throw new Error("Unknown synthetic txid.");
      return result;
    }
  };
  const database = openIndexerDatabase({ filename: ":memory:" });
  const store = new MemoStore(database);
  const engine = new IndexingEngine({
    verificationService: new MemoVerificationService({ chronik }),
    store, clock: { nowSeconds: () => 1760000000 }
  });
  return { engine, store, database };
}

describe("D07-CONF-02: designated input P2PKH authorship", () => {
  it.each([
    ["out-of-range index 1", 1, [input(0)], "AUTHOR_INPUT_OUT_OF_RANGE"],
    ["out-of-range index 255", 255, [input(0)], "AUTHOR_INPUT_OUT_OF_RANGE"],
    ["missing designated prevout", 1, [input(0), input(1, { outputScriptHex: null, address: null })], "PREVOUT_UNAVAILABLE"],
    ["P2SH prevout", 0, [input(0, { outputScriptHex: p2sh })], "UNSUPPORTED_AUTHOR_SCRIPT"],
    ["bare multisig prevout", 0, [input(0, { outputScriptHex: multisig })], "UNSUPPORTED_AUTHOR_SCRIPT"],
    ["malformed designated scriptSig", 0, [input(0, { inputScriptHex: "00" }), input(1)], "INVALID_AUTHOR_SCRIPT_SIG"],
    ["non-minimal signature push", 0, [input(0, { inputScriptHex: `4c41${"22".repeat(64)}4121${pubkey}` })], "INVALID_AUTHOR_SCRIPT_SIG"],
    ["mismatched pubkey hash", 0, [input(0, { inputScriptHex: scriptSig(differentKey) })], "INVALID_AUTHOR_SIGNATURE"],
    ["disallowed sighash 0x42", 0, [input(0, { inputScriptHex: scriptSig(pubkey, "42") })], "UNSUPPORTED_SIGHASH"]
  ] as const)("rejects %s with explicit error and no verified feed row", async (_name, designated, inputs, errorCode) => {
    const transaction = tx("a1".repeat(32), designated, inputs);
    const { engine, store, database } = fixture([transaction]);
    try {
      const result = await engine.indexTransaction(transaction.txid);
      expect(result.verificationResult.status).toBe("INVALID_TM1");
      if (result.verificationResult.status !== "INVALID_TM1") throw new Error("Expected INVALID_TM1");
      expect(result.verificationResult.protocolError.code).toBe(errorCode);
      expect(result.persistedRecord).toBe(true);
      expect(store.getVerificationRecord(transaction.txid)).toMatchObject({
        verificationStatus: "INVALID_MEMO", protocol: "TM1", payload: null,
        authorizingInputIndex: null, authorizingAddress: null,
        diagnostics: { protocolError: { code: errorCode } }
      });
      expect(store.listVerifiedFeed(10)).toHaveLength(0);
    } finally { database.close(); }
  });

  it.each(["41", "c1"])("accepts explicit nonzero designated index with sighash 0x%s", async (sighash) => {
    const transaction = tx("b2".repeat(32), 1, [
      input(0, { inputScriptHex: "00", outputScriptHex: null, address: null }),
      input(1, { inputScriptHex: scriptSig(pubkey, sighash) })
    ]);
    const { engine, store, database } = fixture([transaction]);
    try {
      const result = await engine.indexTransaction(transaction.txid);
      expect(result.verificationResult.status).toBe("VERIFIED_TM1");
      if (result.verificationResult.status !== "VERIFIED_TM1") throw new Error("Expected VERIFIED_TM1");
      expect(result.verificationResult.authorizingInputIndex).toBe(1);
      expect(result.verificationResult.sighashByte).toBe(Number.parseInt(sighash, 16));
      expect(result.verificationResult.trustModel).toBe("trusted-chronik");
      expect(store.getVerificationRecord(transaction.txid)).toMatchObject({
        verificationStatus: "VERIFIED", protocol: "TM1", payload: "ok",
        authorizingInputIndex: 1,
        diagnostics: { publicKeyHashHex: hash160(pubkey), trustModel: "trusted-chronik" }
      });
      expect(store.listVerifiedFeed(10)).toHaveLength(1);
    } finally { database.close(); }
  });

  it("continues after a rejected designated P2SH author", async () => {
    const rejected = tx("c3".repeat(32), 0, [input(0, { outputScriptHex: p2sh })]);
    const accepted = tx("d4".repeat(32), 0, [input(0)]);
    const { engine, store, database } = fixture([rejected, accepted]);
    try {
      expect((await engine.indexTransaction(rejected.txid)).verificationResult.status).toBe("INVALID_TM1");
      expect((await engine.indexTransaction(accepted.txid)).verificationResult.status).toBe("VERIFIED_TM1");
      expect(store.listVerifiedFeed(10).map((record) => record.transaction.txid)).toEqual([accepted.txid]);
    } finally { database.close(); }
  });

  it("states the trusted Chronik boundary: it does NOT cryptographically verify a fabricated signature", async () => {
    const transaction = tx("e5".repeat(32), 0, [input(0, { inputScriptHex: scriptSig(pubkey, "41", "ff") })]);
    const { engine, database } = fixture([transaction]);
    try {
      const result = await engine.indexTransaction(transaction.txid);
      expect(result.verificationResult.status).toBe("VERIFIED_TM1");
      if (result.verificationResult.status === "VERIFIED_TM1") {
        expect(result.verificationResult.trustModel).toBe("trusted-chronik");
      }
    } finally { database.close(); }
  });
});
