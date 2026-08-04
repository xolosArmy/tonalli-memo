import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { NormalizedInput, NormalizedOpReturnOutput } from "@tonalli-memo/chronik";
import { verifyNormalizedTransaction } from "../src/index.js";
import { normalizedTx, opReturnOutput, validMemoPush } from "./fixtures.js";

const PUBKEY_HEX = `02${"11".repeat(32)}`;
const SIGNATURE_WITH_HASHTYPE_HEX = `${"22".repeat(64)}41`;

const hash160Hex = (hex: string): string => {
  const sha256 = createHash("sha256").update(Buffer.from(hex, "hex")).digest();
  return createHash("ripemd160").update(sha256).digest("hex");
};

const authorInput = (index = 0): NormalizedInput => {
  const publicKeyHashHex = hash160Hex(PUBKEY_HEX);
  return {
    index,
    prevOut: {
      txid: "44".repeat(32),
      outIdx: index
    },
    inputScriptHex: `41${SIGNATURE_WITH_HASHTYPE_HEX}21${PUBKEY_HEX}`,
    outputScriptHex: `76a914${publicKeyHashHex}88ac`,
    address: "ecash:qptestauthor000000000000000000000000000000"
  };
};

const tm1Output = (
  outputIndex = 0,
  authorInputIndex = 0,
  valueSats = 0n,
  text = "hello"
): NormalizedOpReturnOutput => {
  const eventDataHex = Buffer.from(text, "utf8").toString("hex");
  const envelopeHex = `0101${authorInputIndex.toString(16).padStart(2, "0")}${eventDataHex}`;
  const envelopeBytes = envelopeHex.length / 2;
  const outputScriptHex = `6a04544d4d00${envelopeBytes.toString(16).padStart(2, "0")}${envelopeHex}`;
  return {
    outputIndex,
    valueSats,
    outputScriptHex,
    pushes: [
      Uint8Array.from(Buffer.from("544d4d00", "hex")),
      Uint8Array.from(Buffer.from(envelopeHex, "hex"))
    ],
    parseStatus: "parsed"
  };
};

describe("TM1 normalized verification integration", () => {
  it("verifies one TM1 candidate through the designated input", () => {
    const input = authorInput();
    const result = verifyNormalizedTransaction(
      normalizedTx({
        inputs: [input],
        inputAddresses: input.address === null ? [] : [input.address],
        opReturnOutputs: [tm1Output()]
      })
    );

    expect(result.status).toBe("VERIFIED_TM1");
    if (result.status !== "VERIFIED_TM1") {
      throw new Error(`Expected VERIFIED_TM1, got ${result.status}`);
    }
    expect(result.protocol).toBe("TM1");
    expect(result.memo.eventData).toBe("hello");
    expect(result.candidate).toEqual({ outputIndex: 0 });
    expect(result.authorizingInputIndex).toBe(0);
    expect(result.publicKeyHashHex).toBe(hash160Hex(PUBKEY_HEX));
    expect(result.sighashByte).toBe(0x41);
    expect(result.trustModel).toBe("trusted-chronik");
    expect("profile" in result).toBe(false);
    expect("evaluationHeight" in result).toBe(false);
  });

  it("rejects a non-zero TM1 output value", () => {
    const input = authorInput();
    const result = verifyNormalizedTransaction(
      normalizedTx({
        inputs: [input],
        inputAddresses: input.address === null ? [] : [input.address],
        opReturnOutputs: [tm1Output(0, 0, 1n)]
      })
    );

    expect(result.status).toBe("INVALID_TM1");
    if (result.status !== "INVALID_TM1") {
      throw new Error(`Expected INVALID_TM1, got ${result.status}`);
    }
    expect(result.protocolError.code).toBe("INVALID_FORMAT");
  });

  it("uses only the designated input instead of scanning for another usable input", () => {
    const validAuthor = authorInput(1);
    const invalidDesignated = {
      ...authorInput(0),
      inputScriptHex: "00"
    };
    const result = verifyNormalizedTransaction(
      normalizedTx({
        inputs: [invalidDesignated, validAuthor],
        inputAddresses: [invalidDesignated.address, validAuthor.address].filter((value): value is string => value !== null),
        opReturnOutputs: [tm1Output(0, 0)]
      })
    );

    expect(result.status).toBe("INVALID_TM1");
    if (result.status !== "INVALID_TM1") {
      throw new Error(`Expected INVALID_TM1, got ${result.status}`);
    }
    expect(result.protocolError.code).toBe("INVALID_AUTHOR_SCRIPT_SIG");
  });

  it("fails closed when independent TM0 and TM1 candidates coexist", () => {
    const input = authorInput();
    const result = verifyNormalizedTransaction(
      normalizedTx({
        inputs: [input],
        inputAddresses: input.address === null ? [] : [input.address],
        opReturnOutputs: [tm1Output(0), opReturnOutput(1, [validMemoPush()])]
      })
    );

    expect(result.status).toBe("MULTIPLE_MEMOS");
    if (result.status !== "MULTIPLE_MEMOS") {
      throw new Error(`Expected MULTIPLE_MEMOS, got ${result.status}`);
    }
    expect(result.candidates.map((candidate) => candidate.protocol ?? "TM0")).toEqual(["TM1", "TM0"]);
  });
});
