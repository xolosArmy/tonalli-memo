import { describe, expect, it } from "vitest";
import { decodeMemo, validateMemo } from "../src/index.js";
import { expectMemoError } from "./helpers.js";

describe("validateMemo", () => {
  it("validates an active memo", () => {
    const memo = validateMemo("TM0|s|xa|Review first. Capital fourth.");
    expect(memo.type).toBe("s");
    expect(memo.profile).toBe("xa");
  });

  it("keeps structural decoding separate from strict profile validation", () => {
    const decoded = decodeMemo("TM0|p|zz|hello");
    expect(decoded.profile).toBe("zz");
    expectMemoError(() => validateMemo(decoded), "UNKNOWN_PROFILE");
  });

  it("recognizes reserved types but rejects them by default", () => {
    expectMemoError(() => validateMemo("TM0|l|xa|reference later"), "RESERVED_TYPE");
  });

  it("allows reserved types only when explicitly requested", () => {
    expect(validateMemo("TM0|l|xa|reference later", { allowReservedTypes: true }).type).toBe("l");
  });

  it("rejects unknown types", () => {
    expectMemoError(() => validateMemo("TM0|r|xa|hello"), "UNKNOWN_TYPE");
  });

  it("rejects invalid type formatting", () => {
    expectMemoError(() => validateMemo("TM0|P|xa|hello"), "INVALID_TYPE_FORMAT");
    expectMemoError(() => validateMemo("TM0|1|xa|hello"), "INVALID_TYPE_FORMAT");
    expectMemoError(() => validateMemo("TM0|pp|xa|hello"), "INVALID_TYPE_FORMAT");
    expectMemoError(() => validateMemo("TM0| p|xa|hello"), "INVALID_TYPE_FORMAT");
  });

  it("rejects invalid profile formatting before profile lookup", () => {
    expectMemoError(() => validateMemo("TM0|p|XA|hello"), "INVALID_PROFILE_FORMAT");
    expectMemoError(() => validateMemo("TM0|p|x1|hello"), "INVALID_PROFILE_FORMAT");
    expectMemoError(() => validateMemo("TM0|p| xa|hello"), "INVALID_PROFILE_FORMAT");
    expectMemoError(() => validateMemo("TM0|p|xa |hello"), "INVALID_PROFILE_FORMAT");
  });

  it("does not trim payloads during validation", () => {
    expect(validateMemo("TM0|p|xa|  spaced payload  ").payload).toBe("  spaced payload  ");
  });

  it("rejects empty payloads", () => {
    expectMemoError(() => validateMemo("TM0|p|xa|"), "EMPTY_PAYLOAD");
  });

  it("accepts an envelope of exactly 80 bytes", () => {
    const payload = "a".repeat(71);
    const envelope = `TM0|p|xa|${payload}`;
    expect(validateMemo(envelope).byteLength).toBe(80);
  });

  it("rejects an envelope of 81 bytes", () => {
    const payload = "a".repeat(72);
    expectMemoError(() => validateMemo(`TM0|p|xa|${payload}`), "PAYLOAD_TOO_LARGE");
  });

  it("rejects multibyte content whose string length is below 80 but byte length exceeds 80", () => {
    const payload = "🚀".repeat(18);
    const envelope = `TM0|p|xa|${payload}`;
    expect(envelope.length).toBeLessThan(80);
    expectMemoError(() => validateMemo(envelope), "PAYLOAD_TOO_LARGE");
  });
});
