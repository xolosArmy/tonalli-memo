import { describe, expect, it } from "vitest";

import { ChronikTransactionClient, normalizeTransaction } from "../src/index.js";
import {
  P2PKH_ZERO_SCRIPT,
  PREV_TXID,
  SECOND_PREV_TXID,
  TXID,
  makeCoinbaseTx,
  makeConfirmedTx
} from "./fixtures.js";
import { FakeChronikTxSource } from "./helpers.js";

describe("normalized inputScriptHex", () => {
  it("preserves a regular input script exactly", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx());

    expect(tx.inputs[0]?.inputScriptHex).toBe("00");
  });

  it("preserves the coinbase input script while prevout data remains unavailable", () => {
    const tx = normalizeTransaction(TXID, makeCoinbaseTx());

    expect(tx.inputs[0]).toMatchObject({
      inputScriptHex: "03abcdef",
      outputScriptHex: null,
      address: null
    });
  });

  it("preserves input scripts in transaction input order", () => {
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({
        inputs: [
          {
            prevOut: { txid: PREV_TXID, outIdx: 0 },
            inputScript: "01aa",
            outputScript: P2PKH_ZERO_SCRIPT,
            sats: 1n,
            sequenceNo: 1
          },
          {
            prevOut: { txid: SECOND_PREV_TXID, outIdx: 1 },
            inputScript: "02bbbb",
            outputScript: P2PKH_ZERO_SCRIPT,
            sats: 1n,
            sequenceNo: 1
          }
        ]
      })
    );

    expect(tx.inputs.map((input) => input.inputScriptHex)).toEqual([
      "01aa",
      "02bbbb"
    ]);
  });

  it.each([
    ["missing", undefined],
    ["non-string", 123],
    ["odd length", "000"],
    ["non-hexadecimal", "00zz"],
    ["uppercase", "00AABB"]
  ])("rejects %s inputScript data", (_label, inputScript) => {
    expect(() =>
      normalizeTransaction(
        TXID,
        makeConfirmedTx({
          inputs: [
            {
              prevOut: { txid: PREV_TXID, outIdx: 0 },
              inputScript,
              outputScript: P2PKH_ZERO_SCRIPT,
              sats: 1n,
              sequenceNo: 1
            }
          ]
        })
      )
    ).toThrow("inputs[0].inputScript must be lowercase even-length hexadecimal");
  });

  it("exposes inputScriptHex through ChronikTransactionClient", async () => {
    const transaction = await new ChronikTransactionClient({
      source: new FakeChronikTxSource(makeConfirmedTx())
    }).getTransaction(TXID);

    expect(transaction.inputs[0]?.inputScriptHex).toBe("00");
  });
});
