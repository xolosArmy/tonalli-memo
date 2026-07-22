import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "../src/index.js";

describe("utf8ByteLength", () => {
  it("measures ASCII bytes", () => {
    expect(utf8ByteLength("TM0|p|xa|signal now lives on eCash")).toBe(34);
  });

  it("measures multibyte UTF-8 bytes instead of JavaScript string length", () => {
    const value = "á🚀";
    expect(value.length).toBe(3);
    expect(utf8ByteLength(value)).toBe(6);
  });
});
