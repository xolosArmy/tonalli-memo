import { describe, expect, it } from "vitest";
import { findMemoCandidates, isTonalliMemoCandidate } from "../src/index.js";
import { opReturnOutput, normalizedTx, validMemoPush } from "./fixtures.js";
import { utf8Bytes } from "./helpers.js";

describe("Tonalli Memo candidate discovery", () => {
  it("finds no candidates when there are no OP_RETURN outputs", () => {
    expect(findMemoCandidates(normalizedTx({ opReturnOutputs: [] }))).toEqual([]);
  });

  it("ignores unrelated OP_RETURN pushes", () => {
    expect(findMemoCandidates(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("hello")])] }))).toEqual([]);
  });

  it("finds one TM0 candidate", () => {
    const candidates = findMemoCandidates(normalizedTx());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.bytes).toEqual(validMemoPush());
  });

  it("finds one TM1 candidate without decoding it", () => {
    expect(isTonalliMemoCandidate(utf8Bytes("TM1"))).toBe(true);
    expect(findMemoCandidates(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM1")])] }))).toHaveLength(1);
  });

  it("preserves candidate output and push indexes", () => {
    const [candidate] = findMemoCandidates(
      normalizedTx({ opReturnOutputs: [opReturnOutput(7, [utf8Bytes("x"), validMemoPush()])] })
    );
    expect(candidate?.location).toEqual({ outputIndex: 7, pushIndex: 1 });
  });

  it("finds two candidates in one output", () => {
    expect(findMemoCandidates(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [validMemoPush(), utf8Bytes("TM1")])] }))).toHaveLength(2);
  });

  it("finds candidates in two outputs", () => {
    expect(
      findMemoCandidates(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [validMemoPush()]), opReturnOutput(2, [utf8Bytes("TM1")])] }))
    ).toHaveLength(2);
  });

  it("returns candidates by output index and push index, independent of OP_RETURN array order", () => {
    const opReturnOutputs = [
      opReturnOutput(5, [utf8Bytes("TM5a"), utf8Bytes("x"), utf8Bytes("TM5b")]),
      opReturnOutput(2, [utf8Bytes("TM2a"), utf8Bytes("TM2b")])
    ];
    const transaction = normalizedTx({ opReturnOutputs });

    const first = findMemoCandidates(transaction);
    const second = findMemoCandidates(transaction);

    expect(first.map((candidate) => candidate.location)).toEqual([
      { outputIndex: 2, pushIndex: 0 },
      { outputIndex: 2, pushIndex: 1 },
      { outputIndex: 5, pushIndex: 0 },
      { outputIndex: 5, pushIndex: 2 }
    ]);
    expect(second.map((candidate) => candidate.location)).toEqual(first.map((candidate) => candidate.location));
    expect(transaction.opReturnOutputs).toBe(opReturnOutputs);
    expect(transaction.opReturnOutputs.map((output) => output.outputIndex)).toEqual([5, 2]);
  });

  it("copies candidate bytes without mutating original pushes or later discovery", () => {
    const originalPush = validMemoPush();
    const transaction = normalizedTx({ opReturnOutputs: [opReturnOutput(0, [originalPush])] });
    const [candidate] = findMemoCandidates(transaction);

    if (candidate === undefined) {
      throw new Error("Expected one candidate.");
    }
    candidate.bytes[0] = 0x58;

    expect(originalPush).toEqual(validMemoPush());
    expect(transaction.opReturnOutputs[0]?.pushes[0]).toEqual(validMemoPush());
    expect(findMemoCandidates(transaction)[0]?.bytes).toEqual(validMemoPush());
  });

  it("uses an exact byte namespace boundary", () => {
    expect(isTonalliMemoCandidate(new Uint8Array())).toBe(false);
    expect(isTonalliMemoCandidate(utf8Bytes("T"))).toBe(false);
    expect(isTonalliMemoCandidate(utf8Bytes("tm"))).toBe(false);
    expect(isTonalliMemoCandidate(utf8Bytes("TM"))).toBe(true);
    expect(isTonalliMemoCandidate(utf8Bytes("TM0"))).toBe(true);
    expect(isTonalliMemoCandidate(utf8Bytes("TM1"))).toBe(true);
    expect(isTonalliMemoCandidate(utf8Bytes("xTM0"))).toBe(false);
    expect(isTonalliMemoCandidate(new Uint8Array([0x54, 0x4d, 0xff]))).toBe(true);
  });

  it("never concatenates separate pushes", () => {
    expect(findMemoCandidates(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("T"), utf8Bytes("M0|p|xa|x")])] }))).toEqual([]);
  });

  it("creates no candidate for malformed OP_RETURN outputs with no parsed pushes", () => {
    expect(findMemoCandidates(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [], "malformed")] }))).toEqual([]);
  });
});
