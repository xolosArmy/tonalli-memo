import { describe, expect, it } from "vitest";

import { deriveAddressFromOutputScriptHex, isLowercaseEvenHex } from "../src/index.js";
import { NONSTANDARD_SCRIPT, P2PKH_ZERO_ADDRESS, P2PKH_ZERO_SCRIPT, P2SH_ZERO_ADDRESS, P2SH_ZERO_SCRIPT } from "./fixtures.js";

describe("script helpers", () => {
  it("validates lowercase even-length hex scripts", () => {
    expect(isLowercaseEvenHex("00ab")).toBe(true);
    expect(isLowercaseEvenHex("")).toBe(true);
    expect(isLowercaseEvenHex("00AB")).toBe(false);
    expect(isLowercaseEvenHex("abc")).toBe(false);
    expect(isLowercaseEvenHex("zz")).toBe(false);
  });

  it("derives canonical eCash P2PKH addresses", () => {
    expect(deriveAddressFromOutputScriptHex(P2PKH_ZERO_SCRIPT, "ecash")).toBe(P2PKH_ZERO_ADDRESS);
  });

  it("derives canonical eCash P2SH addresses", () => {
    expect(deriveAddressFromOutputScriptHex(P2SH_ZERO_SCRIPT, "ecash")).toBe(P2SH_ZERO_ADDRESS);
  });

  it("returns null for valid nonstandard scripts", () => {
    expect(deriveAddressFromOutputScriptHex(NONSTANDARD_SCRIPT, "ecash")).toBeNull();
  });

  it("uses the configured address prefix", () => {
    expect(deriveAddressFromOutputScriptHex(P2PKH_ZERO_SCRIPT, "ectest")?.startsWith("ectest:")).toBe(true);
  });
});
