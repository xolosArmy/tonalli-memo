import { describe, expect, it } from "vitest";
import { encodeMemo } from "../src/index.js";
import { expectMemoError } from "./helpers.js";

describe("encodeMemo", () => {
  it("encodes valid input deterministically", () => {
    expect(encodeMemo({ type: "p", profile: "xa", payload: "signal now lives on eCash" })).toBe(
      "TM0|p|xa|signal now lives on eCash"
    );
  });

  it("does not trim or normalize payloads", () => {
    expect(encodeMemo({ type: "p", profile: "xa", payload: "  spaced | payload  " })).toBe(
      "TM0|p|xa|  spaced | payload  "
    );
  });

  it("refuses to emit reserved types by default", () => {
    expectMemoError(() => encodeMemo({ type: "l", profile: "xa", payload: "reference later" }), "RESERVED_TYPE");
  });

  it("refuses to emit invalid or oversized envelopes", () => {
    expectMemoError(() => encodeMemo({ type: "p", profile: "zz", payload: "hello" }), "UNKNOWN_PROFILE");
    expectMemoError(() => encodeMemo({ type: "p", profile: "xa", payload: "a".repeat(72) }), "PAYLOAD_TOO_LARGE");
  });
});
