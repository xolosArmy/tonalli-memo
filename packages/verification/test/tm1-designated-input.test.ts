import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { NormalizedInput, NormalizedTransaction } from "@tonalli-memo/chronik";
import { verifyTm1DesignatedInput } from "../src/index.js";

const TXID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PREV_TXID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BLOCK_HASH = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const compressedPublicKeyHex = `02${"11".repeat(32)}`;
const alternateCompressedPublicKeyHex = `03${"22".repeat(32)}`;

const hash160Hex = (hex: string): string => {
  const sha256 = createHash("sha256").update(Buffer.from(hex, "hex")).digest();
  return createHash("ripemd160").update(sha256).digest("hex");
};

const p2pkhScriptHex = (publicKeyHex: string): string => `76a914${hash160Hex(publicKeyHex)}88ac`;

const directPush = (hex: string): string => {
  const byteLength = hex.length / 2;
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > 0x4b) {
    throw new Error("Test helper supports direct pushes from 1 through 75 bytes.");
  }
  return `${byteLength.toString(16).padStart(2, "0")}${hex}`;
};

const signatureWithHashTypeHex = (sighashByteHex = "41", fill = "44"): string => `${fill.repeat(64)}${sighashByteHex}`;

const scriptSigHex = (
  publicKeyHex = compressedPublicKeyHex,
  sighashByteHex = "41",
  signatureFill = "44"
): string => `${directPush(signatureWithHashTypeHex(sighashByteHex, signatureFill))}${directPush(publicKeyHex)}`;

const normalizedInput = (overrides: Partial<NormalizedInput> = {}): NormalizedInput => ({
  index: 0,
  prevOut: {
    txid: PREV_TXID,
    outIdx: 0
  },
  inputScriptHex: scriptSigHex(),
  outputScriptHex: p2pkhScriptHex(compressedPublicKeyHex),
  address: "ecash:qptestaddress0000000000000000000000000000000",
  ...overrides
});

const normalizedTransaction = (
  inputs: readonly NormalizedInput[] = [normalizedInput()]
): NormalizedTransaction => ({
  txid: TXID,
  isCoinbase: false,
  inputs,
  inputAddresses: inputs.flatMap((input) => input.address === null ? [] : [input.address]),
  opReturnOutputs: [],
  blockHeight: 900001,
  blockHash: BLOCK_HASH,
  blockTimestamp: 1710000000,
  firstSeenAt: 1709999900,
  isFinal: true,
  rawResponse: { trustedChronikFixture: true }
});

describe("verifyTm1DesignatedInput", () => {
  it("accepts a standard P2PKH input with sighash 0x41", () => {
    const result = verifyTm1DesignatedInput(normalizedTransaction(), 0);

    expect(result).toMatchObject({
      valid: true,
      authorInputIndex: 0,
      publicKeyHex: compressedPublicKeyHex,
      publicKeyHashHex: hash160Hex(compressedPublicKeyHex),
      sighashByte: 0x41
    });
  });

  it("uses only the designated input and accepts sighash 0xc1", () => {
    const unrelatedMalformedInput = normalizedInput({
      index: 0,
      inputScriptHex: "00",
      outputScriptHex: null,
      address: null
    });
    const designatedInput = normalizedInput({
      index: 1,
      prevOut: { txid: PREV_TXID, outIdx: 1 },
      inputScriptHex: scriptSigHex(compressedPublicKeyHex, "c1"),
      outputScriptHex: p2pkhScriptHex(compressedPublicKeyHex)
    });

    const result = verifyTm1DesignatedInput(
      normalizedTransaction([unrelatedMalformedInput, designatedInput]),
      1
    );

    expect(result).toMatchObject({
      valid: true,
      authorInputIndex: 1,
      sighashByte: 0xc1
    });
  });

  it("rejects an out-of-range author input before other checks", () => {
    expect(verifyTm1DesignatedInput(normalizedTransaction(), 1)).toEqual({
      valid: false,
      authorInputIndex: 1,
      stage: "author-index",
      errorCode: "AUTHOR_INPUT_OUT_OF_RANGE",
      message: "TM1 author input index is outside the transaction input range."
    });
  });

  it("rejects unavailable prevout metadata", () => {
    const result = verifyTm1DesignatedInput(
      normalizedTransaction([normalizedInput({ outputScriptHex: null, address: null })]),
      0
    );

    expect(result).toMatchObject({
      valid: false,
      stage: "prevout-availability",
      errorCode: "PREVOUT_UNAVAILABLE"
    });
  });

  it("rejects non-P2PKH previous-output scripts", () => {
    const result = verifyTm1DesignatedInput(
      normalizedTransaction([normalizedInput({ outputScriptHex: `a914${"00".repeat(20)}87` })]),
      0
    );

    expect(result).toMatchObject({
      valid: false,
      stage: "prevout-script-type",
      errorCode: "UNSUPPORTED_AUTHOR_SCRIPT"
    });
  });

  it.each([
    ["missing pushes", ""],
    ["one push", directPush(signatureWithHashTypeHex())],
    ["three pushes", `${scriptSigHex()}0101`],
    ["non-minimal signature push", `4c41${signatureWithHashTypeHex()}${directPush(compressedPublicKeyHex)}`],
    ["invalid SEC public key shape", `${directPush(signatureWithHashTypeHex())}${directPush(`05${"11".repeat(32)}`)}`]
  ])("rejects malformed scriptSig structure: %s", (_description, inputScriptHex) => {
    const result = verifyTm1DesignatedInput(
      normalizedTransaction([normalizedInput({ inputScriptHex })]),
      0
    );

    expect(result).toMatchObject({
      valid: false,
      stage: "scriptsig-structure",
      errorCode: "INVALID_AUTHOR_SCRIPT_SIG"
    });
  });

  it("rejects a public key that does not match the designated P2PKH hash", () => {
    const result = verifyTm1DesignatedInput(
      normalizedTransaction([
        normalizedInput({
          inputScriptHex: scriptSigHex(alternateCompressedPublicKeyHex),
          outputScriptHex: p2pkhScriptHex(compressedPublicKeyHex)
        })
      ]),
      0
    );

    expect(result).toMatchObject({
      valid: false,
      stage: "pubkey-hash-match",
      errorCode: "INVALID_AUTHOR_SIGNATURE"
    });
  });

  it.each(["01", "40", "42", "81"])('rejects unsupported sighash byte 0x%s', (sighashByteHex) => {
    const result = verifyTm1DesignatedInput(
      normalizedTransaction([
        normalizedInput({ inputScriptHex: scriptSigHex(compressedPublicKeyHex, sighashByteHex) })
      ]),
      0
    );

    expect(result).toMatchObject({
      valid: false,
      stage: "sighash-policy",
      errorCode: "UNSUPPORTED_SIGHASH"
    });
  });

  it("does not claim independent cryptographic verification", () => {
    const result = verifyTm1DesignatedInput(
      normalizedTransaction([
        normalizedInput({ inputScriptHex: scriptSigHex(compressedPublicKeyHex, "41", "ff") })
      ]),
      0
    );

    expect(result).toMatchObject({
      valid: true,
      sighashByte: 0x41
    });
  });
});
