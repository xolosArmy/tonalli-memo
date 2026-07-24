import { describe, expect, it } from "vitest";

import { normalizeTransaction } from "../src/index.js";
import {
  EXACT_80_BYTE_PAYLOAD,
  LARGE_PUSHDATA1_PAYLOAD,
  MEMO_PAYLOAD,
  ORDINARY_PAYMENT_SCRIPT,
  TXID,
  makeConfirmedTx
} from "./fixtures.js";
import { hexToBytes, opReturnScript, utf8Hex } from "./helpers.js";

describe("OP_RETURN normalization", () => {
  it("returns no OP_RETURN outputs when none are present", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 546n, outputScript: ORDINARY_PAYMENT_SCRIPT }] }));
    expect(tx.opReturnOutputs).toEqual([]);
  });

  it("parses one valid single-push OP_RETURN", () => {
    const payload = utf8Hex("hello");
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(payload) }] }));
    expect(tx.opReturnOutputs).toHaveLength(1);
    expect(tx.opReturnOutputs[0]?.parseStatus).toBe("parsed");
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([hexToBytes(payload)]);
  });

  it("parses the genesis memo payload", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx());
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([hexToBytes(MEMO_PAYLOAD)]);
  });

  it("parses a payload large enough to use OP_PUSHDATA1", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(LARGE_PUSHDATA1_PAYLOAD) }] }));
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([hexToBytes(LARGE_PUSHDATA1_PAYLOAD)]);
  });

  it("parses a payload of exactly 80 bytes", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(EXACT_80_BYTE_PAYLOAD) }] }));
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([hexToBytes(EXACT_80_BYTE_PAYLOAD)]);
  });

  it("preserves multiple OP_RETURN outputs", () => {
    const first = utf8Hex("first");
    const second = utf8Hex("second");
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(first) }, { sats: 0n, outputScript: opReturnScript(second) }] })
    );
    expect(tx.opReturnOutputs.map((output) => output.outputIndex)).toEqual([0, 1]);
    expect(tx.opReturnOutputs.map((output) => output.pushes[0])).toEqual([hexToBytes(first), hexToBytes(second)]);
  });

  it("preserves multiple pushes in one OP_RETURN", () => {
    const first = utf8Hex("alpha");
    const second = utf8Hex("beta");
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(first, second) }] }));
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([hexToBytes(first), hexToBytes(second)]);
  });

  it("parses empty OP_RETURN outputs with no pushes", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a" }] }));
    expect(tx.opReturnOutputs[0]).toMatchObject({ parseStatus: "parsed", pushes: [] });
  });

  it("preserves OP_0 as an empty push", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a00" }] }));
    expect(tx.opReturnOutputs[0]?.parseStatus).toBe("parsed");
    expect(tx.opReturnOutputs[0]?.pushes).toEqual([Uint8Array.of(0)]);
  });

  it("rejects malformed output-script encodings before OP_RETURN parsing", () => {
    expect(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6A00" }] }))).toThrow("lowercase even-length hexadecimal");
    expect(() => normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a0" }] }))).toThrow("lowercase even-length hexadecimal");
  });

  it("marks truncated direct pushes as malformed", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a02ff" }] }));
    expect(tx.opReturnOutputs[0]).toMatchObject({ parseStatus: "malformed", parseErrorCode: "MALFORMED_OP_RETURN", pushes: [] });
  });

  it("marks truncated OP_PUSHDATA1 pushes as malformed", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a4c02ff" }] }));
    expect(tx.opReturnOutputs[0]).toMatchObject({ parseStatus: "malformed", parseErrorCode: "MALFORMED_OP_RETURN", pushes: [] });
  });

  it("marks invalid push opcodes after OP_RETURN as malformed", () => {
    const tx = normalizeTransaction(TXID, makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: "6a76" }] }));
    expect(tx.opReturnOutputs[0]).toMatchObject({ parseStatus: "malformed", parseErrorCode: "MALFORMED_OP_RETURN" });
  });

  it("keeps OP_RETURN outputs and ordinary payment outputs separated", () => {
    const payload = utf8Hex("memo");
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 546n, outputScript: ORDINARY_PAYMENT_SCRIPT }, { sats: 0n, outputScript: opReturnScript(payload) }] })
    );
    expect(tx.opReturnOutputs).toHaveLength(1);
    expect(tx.opReturnOutputs[0]?.outputIndex).toBe(1);
  });

  it("keeps pushes grouped by output", () => {
    const a = utf8Hex("a");
    const b = utf8Hex("b");
    const c = utf8Hex("c");
    const tx = normalizeTransaction(
      TXID,
      makeConfirmedTx({ outputs: [{ sats: 0n, outputScript: opReturnScript(a, b) }, { sats: 0n, outputScript: opReturnScript(c) }] })
    );
    expect(tx.opReturnOutputs.map((output) => output.pushes)).toEqual([[hexToBytes(a), hexToBytes(b)], [hexToBytes(c)]]);
  });
});
