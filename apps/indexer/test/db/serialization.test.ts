import { describe, expect, it } from "vitest";
import { serializeStoredTransaction, toStoredNormalizedTransaction } from "../../src/index.js";
import { input, normalizedTx, opReturnOutput, TEST_ADDRESS, utf8Bytes } from "../fixtures.js";

describe("transaction serialization", () => {
  it("excludes rawResponse even when raw data contains nested bigint values", () => {
    const json = serializeStoredTransaction(normalizedTx());
    expect(json).not.toContain("rawResponse");
    expect(JSON.parse(json)).not.toHaveProperty("rawResponse");
  });

  it("preserves input order, duplicate addresses and null input addresses", () => {
    const stored = toStoredNormalizedTransaction(
      normalizedTx({
        inputs: [input(0, TEST_ADDRESS), input(1, TEST_ADDRESS), input(2, null)],
        inputAddresses: [TEST_ADDRESS, TEST_ADDRESS]
      })
    );
    expect(stored.inputs.map((storedInput) => storedInput.address)).toEqual([TEST_ADDRESS, TEST_ADDRESS, null]);
    expect(stored.inputAddresses).toEqual([TEST_ADDRESS, TEST_ADDRESS]);
  });

  it("stores OP_RETURN pushes and scripts as lowercase hex", () => {
    const stored = toStoredNormalizedTransaction(
      normalizedTx({
        opReturnOutputs: [opReturnOutput(0, [new Uint8Array([0xab, 0xcd]), new Uint8Array([])])]
      })
    );
    expect(stored.opReturnOutputs[0]).toMatchObject({
      outputScriptHex: "6a04abcdef",
      pushesHex: ["abcd", ""]
    });
  });

  it("preserves malformed OP_RETURN metadata", () => {
    const stored = toStoredNormalizedTransaction(
      normalizedTx({
        opReturnOutputs: [opReturnOutput(1, [utf8Bytes("TM")], "malformed")]
      })
    );
    expect(stored.opReturnOutputs[0]).toMatchObject({
      parseStatus: "malformed",
      parseErrorCode: "MALFORMED_OP_RETURN"
    });
  });

  it("serializes deterministically for the same normalized transaction", () => {
    const transaction = normalizedTx();
    expect(serializeStoredTransaction(transaction)).toBe(serializeStoredTransaction(transaction));
  });
});
