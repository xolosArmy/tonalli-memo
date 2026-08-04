import { describe, expect, it } from "vitest";

import { normalizeTransaction } from "../src/index.js";
import { TXID, makeConfirmedTx } from "./fixtures.js";
import { expectAdapterError, opReturnScript, utf8Hex } from "./helpers.js";

describe("OP_RETURN value normalization", () => {
  it("preserves zero and positive bigint output values", () => {
    const payload = utf8Hex("tm1-value");
    const zero = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(payload) }] })
    );
    const positive = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 546n, outputScript: opReturnScript(payload) }] })
    );

    expect(zero.opReturnOutputs[0]?.valueSats).toBe(0n);
    expect(positive.opReturnOutputs[0]?.valueSats).toBe(546n);
  });

  it("preserves valueSats even when the OP_RETURN script is malformed", () => {
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 7n, outputScript: "6a02ff" }] })
    );

    expect(tx.opReturnOutputs[0]).toMatchObject({
      valueSats: 7n,
      parseStatus: "malformed",
      parseErrorCode: "MALFORMED_OP_RETURN"
    });
  });

  it("rejects missing, non-bigint and negative OP_RETURN values", () => {
    expectAdapterError(
      () => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ outputScript: "6a" }] })),
      "INVALID_CHRONIK_RESPONSE"
    );
    expectAdapterError(
      () => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0, outputScript: "6a" }] })),
      "INVALID_CHRONIK_RESPONSE"
    );
    expectAdapterError(
      () => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: -1n, outputScript: "6a" }] })),
      "INVALID_CHRONIK_RESPONSE"
    );
  });

  it("does not expose ordinary payment values as OP_RETURN outputs", () => {
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 546n, outputScript: "51" }] })
    );

    expect(tx.opReturnOutputs).toEqual([]);
  });
});
