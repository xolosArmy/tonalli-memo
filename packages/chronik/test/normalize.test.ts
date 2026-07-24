import { describe, expect, it } from "vitest";

import { normalizeTransaction } from "../src/index.js";
import {
  BLOCK_HASH,
  MEMO_PAYLOAD,
  MEMPOOL_TXID,
  NONSTANDARD_SCRIPT,
  P2PKH_ZERO_ADDRESS,
  P2PKH_ZERO_SCRIPT,
  P2SH_ZERO_ADDRESS,
  P2SH_ZERO_SCRIPT,
  PREV_TXID,
  SECOND_PREV_TXID,
  TXID,
  makeCoinbaseTx,
  makeConfirmedTx,
  makeMempoolTx
} from "./fixtures.js";
import { expectAdapterError, hexToBytes } from "./helpers.js";

describe("normalizeTransaction", () => {
  it("normalizes a valid confirmed transaction", () => {
    const raw = makeConfirmedTx();
    const tx = normalizeTransaction(TXID, raw);
    expect(tx).toMatchObject({
      txid: TXID,
      isCoinbase: false,
      blockHeight: 900001,
      blockHash: BLOCK_HASH,
      blockTimestamp: 1710000000,
      firstSeenAt: 1709999900,
      isFinal: true
    });
    expect(tx.inputs[0]).toMatchObject({ index: 0, prevOut: { txid: PREV_TXID, outIdx: 0 }, outputScriptHex: P2PKH_ZERO_SCRIPT, address: P2PKH_ZERO_ADDRESS });
    expect(tx.inputAddresses).toEqual([P2PKH_ZERO_ADDRESS]);
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([hexToBytes(MEMO_PAYLOAD)]);
    expect(tx.rawResponse).toBe(raw);
  });

  it("normalizes a mempool transaction without substituting block time for firstSeenAt", () => {
    const tx = normalizeTransaction(MEMPOOL_TXID, makeMempoolTx());
    expect(tx.blockHeight).toBeNull();
    expect(tx.blockHash).toBeNull();
    expect(tx.blockTimestamp).toBeNull();
    expect(tx.firstSeenAt).toBeNull();
    expect(tx.isFinal).toBe(false);
  });

  it("keeps positive mempool timeFirstSeen", () => {
    expect(normalizeTransaction(MEMPOOL_TXID, makeMempoolTx({ timeFirstSeen: 1710000100 })).firstSeenAt).toBe(1710000100);
  });

  it("normalizes coinbase input scripts as null", () => {
    const tx = normalizeTransaction(TXID, makeCoinbaseTx());
    expect(tx.inputs[0]).toMatchObject({ outputScriptHex: null, address: null });
    expect(tx.inputAddresses).toEqual([]);
  });

  it("preserves duplicate decoded input addresses", () => {
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({
        inputs: [
          { prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 },
          { prevOut: { txid: SECOND_PREV_TXID, outIdx: 1 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 }
        ]
      })
    );
    expect(tx.inputAddresses).toEqual([P2PKH_ZERO_ADDRESS, P2PKH_ZERO_ADDRESS]);
  });

  it("derives P2SH input addresses", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: P2SH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 }] }));
    expect(tx.inputs[0]?.address).toBe(P2SH_ZERO_ADDRESS);
  });

  it("preserves nonstandard input scripts with null address", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: NONSTANDARD_SCRIPT, sats: 1n, sequenceNo: 1 }] }));
    expect(tx.inputs[0]).toMatchObject({ outputScriptHex: NONSTANDARD_SCRIPT, address: null });
    expect(tx.inputAddresses).toEqual([]);
  });

  it("accepts missing non-coinbase spent output scripts as unauthorizable inputs", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", sats: 1n, sequenceNo: 1 }] }));
    expect(tx.inputs[0]).toMatchObject({ outputScriptHex: null, address: null });
    expect(tx.inputAddresses).toEqual([]);
  });

  it("preserves mixed standard and nonstandard input order", () => {
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({
        inputs: [
          { prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 },
          { prevOut: { txid: SECOND_PREV_TXID, outIdx: 1 }, inputScript: "00", outputScript: NONSTANDARD_SCRIPT, sats: 1n, sequenceNo: 1 },
          { prevOut: { txid: PREV_TXID, outIdx: 2 }, inputScript: "00", outputScript: P2SH_ZERO_SCRIPT, sats: 1n, sequenceNo: 1 }
        ]
      })
    );
    expect(tx.inputs.map((input) => input.address)).toEqual([P2PKH_ZERO_ADDRESS, null, P2SH_ZERO_ADDRESS]);
    expect(tx.inputAddresses).toEqual([P2PKH_ZERO_ADDRESS, P2SH_ZERO_ADDRESS]);
  });

  it("rejects returned txid mismatches", () => {
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ txid: MEMPOOL_TXID })), "INVALID_CHRONIK_RESPONSE");
  });

  it("rejects malformed required response fields", () => {
    expectAdapterError(() => normalizeTransaction(TXID, null), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, []), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ txid: undefined })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ txid: TXID.toUpperCase() })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ isFinal: undefined })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: undefined })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: undefined })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ timeFirstSeen: 1.5 })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ timeFirstSeen: Number.MAX_SAFE_INTEGER + 1 })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ isCoinbase: "false" })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: {} })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: {} })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ timeFirstSeen: -1 })), "INVALID_CHRONIK_RESPONSE");
  });

  it("rejects malformed prevOut, scripts and block metadata", () => {
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: TXID.toUpperCase(), outIdx: 0 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: -1 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: "zz".repeat(32), outIdx: 0 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 1.5 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: Number.MAX_SAFE_INTEGER + 1 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a0" }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6azz" }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ block: { hash: BLOCK_HASH, timestamp: 1 } })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ block: { height: 1, timestamp: 1 } })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ block: { height: 1, hash: BLOCK_HASH } })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ block: { height: 1, hash: BLOCK_HASH, timestamp: 1.5 } })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ inputs: [{ prevOut: { txid: PREV_TXID, outIdx: 0 }, inputScript: "00", outputScript: P2PKH_ZERO_SCRIPT.toUpperCase() }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6A00" }] })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ block: { height: -1, hash: BLOCK_HASH, timestamp: 1 } })), "INVALID_CHRONIK_RESPONSE");
    expectAdapterError(() => normalizeTransaction(TXID, makeConfirmedTx({ block: { height: 1, hash: TXID.toUpperCase(), timestamp: 1 } })), "INVALID_CHRONIK_RESPONSE");
  });
});
