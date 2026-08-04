import { fromHex, getStackArray } from "ecash-lib";

import type { NormalizedOpReturnOutput } from "./types.js";

export const isOpReturnScriptHex = (outputScriptHex: string): boolean => outputScriptHex.startsWith("6a");

export const normalizeOpReturnOutput = (
  outputIndex: number,
  valueSats: bigint,
  outputScriptHex: string
): NormalizedOpReturnOutput => {
  try {
    return {
      outputIndex,
      valueSats,
      outputScriptHex,
      pushes: getStackArray(outputScriptHex).map((pushHex) => fromHex(pushHex)),
      parseStatus: "parsed"
    };
  } catch {
    return {
      outputIndex,
      valueSats,
      outputScriptHex,
      pushes: [],
      parseStatus: "malformed",
      parseErrorCode: "MALFORMED_OP_RETURN"
    };
  }
};
