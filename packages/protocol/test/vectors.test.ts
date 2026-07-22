import { describe, expect, it } from "vitest";
import vectors from "../test-vectors.json" with { type: "json" };
import { decodeMemo, validateMemo } from "../src/index.js";
import { expectMemoError } from "./helpers.js";
import type { MemoErrorCode } from "../src/index.js";

interface ValidVector {
  name: string;
  envelope?: string;
  byteLength?: number;
  payload?: string;
}

interface InvalidVector {
  name: string;
  envelope?: string;
  bytes?: number[];
  stage: "decode" | "validate";
  code: MemoErrorCode;
}

describe("test vectors", () => {
  it.each((vectors.valid as ValidVector[]).filter((vector) => vector.envelope !== undefined))(
    "accepts valid vector: $name",
    (vector) => {
      const envelope = vector.envelope ?? "";
      const decoded = decodeMemo(envelope);
      const validated = validateMemo(decoded);
      expect(validated.payload).toBe(vector.payload ?? decoded.payload);

      if (vector.byteLength !== undefined) {
        expect(validated.byteLength).toBe(vector.byteLength);
      }
    }
  );

  it.each((vectors.invalid as InvalidVector[]).filter((vector) => vector.envelope !== undefined || vector.bytes !== undefined))(
    "rejects invalid vector: $name",
    (vector) => {
      const input = vector.bytes === undefined ? vector.envelope ?? "" : new Uint8Array(vector.bytes);
      const action = vector.stage === "decode" ? () => decodeMemo(input) : () => validateMemo(input);
      expectMemoError(action, vector.code);
    }
  );

  it("documents and verifies generated exact-size vectors", () => {
    const exact80 = `TM0|p|xa|${"a".repeat(71)}`;
    const exact81 = `TM0|p|xa|${"a".repeat(72)}`;

    expect(validateMemo(exact80).byteLength).toBe(80);
    expectMemoError(() => validateMemo(exact81), "PAYLOAD_TOO_LARGE");
  });
});
