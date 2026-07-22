import { describe, expect, it } from "vitest";
import { decodeMemo } from "../src/index.js";
import { expectMemoError } from "./helpers.js";

describe("decodeMemo", () => {
  it("decodes the structural envelope and measures bytes", () => {
    expect(decodeMemo("TM0|p|xa|signal now lives on eCash")).toEqual({
      marker: "TM0",
      version: 0,
      type: "p",
      profile: "xa",
      payload: "signal now lives on eCash",
      byteLength: 34
    });
  });

  it("accepts the uppercase TM0 marker", () => {
    expect(decodeMemo("TM0|p|xa|hello").marker).toBe("TM0");
  });

  it("parses only the first three delimiters", () => {
    expect(decodeMemo("TM0|p|xa|Review|verify|publish").payload).toBe("Review|verify|publish");
  });

  it("does not trim or normalize payload text", () => {
    expect(decodeMemo("TM0|p|xa|  spaced payload  ").payload).toBe("  spaced payload  ");
  });

  it("allows structurally valid but policy-invalid profiles", () => {
    expect(decodeMemo("TM0|p|zz|hello").profile).toBe("zz");
  });

  it("rejects malformed envelopes without enough separators", () => {
    expectMemoError(() => decodeMemo("TM0|p|xa"), "INVALID_FORMAT");
  });

  it("rejects lowercase markers", () => {
    expectMemoError(() => decodeMemo("tm0|p|xa|hello"), "INVALID_MARKER");
  });

  it("reports unknown protocol versions separately", () => {
    expectMemoError(() => decodeMemo("TM1|p|xa|hello"), "UNSUPPORTED_VERSION");
  });

  it("rejects invalid UTF-8 bytes", () => {
    expectMemoError(() => decodeMemo(new Uint8Array([0x54, 0x4d, 0x30, 0x7c, 0xff])), "INVALID_UTF8");
  });
});
