import { createHash } from "node:crypto";

import type { NormalizedInput, NormalizedTransaction } from "@tonalli-memo/chronik";

export const TM1_AUTHOR_INPUT_ERROR_CODES = [
  "AUTHOR_INPUT_OUT_OF_RANGE",
  "PREVOUT_UNAVAILABLE",
  "UNSUPPORTED_AUTHOR_SCRIPT",
  "INVALID_AUTHOR_SCRIPT_SIG",
  "INVALID_AUTHOR_SIGNATURE",
  "UNSUPPORTED_SIGHASH"
] as const;

export type Tm1AuthorInputErrorCode = (typeof TM1_AUTHOR_INPUT_ERROR_CODES)[number];

export type Tm1AuthorInputValidationStage =
  | "author-index"
  | "prevout-availability"
  | "prevout-script-type"
  | "scriptsig-structure"
  | "pubkey-hash-match"
  | "sighash-policy";

export interface VerifiedTm1DesignatedInput {
  readonly valid: true;
  readonly authorInputIndex: number;
  readonly input: NormalizedInput;
  readonly publicKeyHex: string;
  readonly publicKeyHashHex: string;
  readonly signatureWithHashTypeHex: string;
  readonly sighashByte: 0x41 | 0xc1;
}

export interface InvalidTm1DesignatedInput {
  readonly valid: false;
  readonly authorInputIndex: number;
  readonly stage: Tm1AuthorInputValidationStage;
  readonly errorCode: Tm1AuthorInputErrorCode;
  readonly message: string;
}

export type Tm1DesignatedInputVerificationResult =
  | VerifiedTm1DesignatedInput
  | InvalidTm1DesignatedInput;

interface ParsedPush {
  readonly data: Uint8Array;
  readonly minimal: boolean;
}

const bytesFromHex = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const hexFromBytes = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

const hash160 = (bytes: Uint8Array): Uint8Array => {
  const sha256 = createHash("sha256").update(bytes).digest();
  return Uint8Array.from(createHash("ripemd160").update(sha256).digest());
};

const invalid = (
  authorInputIndex: number,
  stage: Tm1AuthorInputValidationStage,
  errorCode: Tm1AuthorInputErrorCode,
  message: string
): InvalidTm1DesignatedInput => ({
  valid: false,
  authorInputIndex,
  stage,
  errorCode,
  message
});

const p2pkhHash = (outputScriptHex: string): Uint8Array | null => {
  const script = bytesFromHex(outputScriptHex);
  if (
    script.length !== 25 ||
    script[0] !== 0x76 ||
    script[1] !== 0xa9 ||
    script[2] !== 0x14 ||
    script[23] !== 0x88 ||
    script[24] !== 0xac
  ) {
    return null;
  }
  return script.slice(3, 23);
};

const parsePushes = (scriptHex: string): readonly ParsedPush[] | null => {
  const script = bytesFromHex(scriptHex);
  const pushes: ParsedPush[] = [];

  for (let cursor = 0; cursor < script.length; ) {
    const opcode = script[cursor];
    if (opcode === undefined) {
      return null;
    }
    cursor += 1;

    let length: number;
    let minimal: boolean;

    if (opcode >= 0x01 && opcode <= 0x4b) {
      length = opcode;
      minimal = true;
    } else if (opcode === 0x4c) {
      const pushLength = script[cursor];
      if (pushLength === undefined) {
        return null;
      }
      cursor += 1;
      length = pushLength;
      minimal = length >= 0x4c;
    } else {
      return null;
    }

    const end = cursor + length;
    if (!Number.isSafeInteger(end) || end > script.length) {
      return null;
    }

    pushes.push({
      data: script.slice(cursor, end),
      minimal
    });
    cursor = end;
  }

  return pushes;
};

const isStructurallyValidSecPublicKey = (publicKey: Uint8Array): boolean => {
  const prefix = publicKey[0];
  return (
    (publicKey.length === 33 && (prefix === 0x02 || prefix === 0x03)) ||
    (publicKey.length === 65 && prefix === 0x04)
  );
};

/**
 * Validates TM1 authorship data exposed by the designated normalized input.
 *
 * This function deliberately does not reconstruct or verify the transaction
 * signature digest. It is intended for callers that trust Chronik or a full
 * node for transaction/script validity, while independently enforcing TM1's
 * designated-input, P2PKH, scriptSig, pubkey-hash and sighash restrictions.
 */
export function verifyTm1DesignatedInput(
  transaction: NormalizedTransaction,
  authorInputIndex: number
): Tm1DesignatedInputVerificationResult {
  if (!Number.isSafeInteger(authorInputIndex) || authorInputIndex < 0 || authorInputIndex >= transaction.inputs.length) {
    return invalid(
      authorInputIndex,
      "author-index",
      "AUTHOR_INPUT_OUT_OF_RANGE",
      "TM1 author input index is outside the transaction input range."
    );
  }

  const input = transaction.inputs[authorInputIndex];
  if (input === undefined) {
    return invalid(
      authorInputIndex,
      "author-index",
      "AUTHOR_INPUT_OUT_OF_RANGE",
      "TM1 author input index is outside the transaction input range."
    );
  }

  if (input.outputScriptHex === null) {
    return invalid(
      authorInputIndex,
      "prevout-availability",
      "PREVOUT_UNAVAILABLE",
      "The designated input has no available previous-output script."
    );
  }

  const expectedPublicKeyHash = p2pkhHash(input.outputScriptHex);
  if (expectedPublicKeyHash === null) {
    return invalid(
      authorInputIndex,
      "prevout-script-type",
      "UNSUPPORTED_AUTHOR_SCRIPT",
      "TM1 Draft 0.2 requires the designated previous output to be standard P2PKH."
    );
  }

  const pushes = parsePushes(input.inputScriptHex);
  const signatureWithHashType = pushes?.[0]?.data;
  const publicKey = pushes?.[1]?.data;

  if (
    pushes === null ||
    pushes.length !== 2 ||
    pushes.some((push) => !push.minimal) ||
    signatureWithHashType === undefined ||
    signatureWithHashType.length < 2 ||
    publicKey === undefined ||
    !isStructurallyValidSecPublicKey(publicKey)
  ) {
    return invalid(
      authorInputIndex,
      "scriptsig-structure",
      "INVALID_AUTHOR_SCRIPT_SIG",
      "The designated P2PKH input script must contain exactly two minimal pushes: signature with hash type and SEC public key."
    );
  }

  const actualPublicKeyHash = hash160(publicKey);
  if (hexFromBytes(actualPublicKeyHash) !== hexFromBytes(expectedPublicKeyHash)) {
    return invalid(
      authorInputIndex,
      "pubkey-hash-match",
      "INVALID_AUTHOR_SIGNATURE",
      "The designated input public key does not match the previous-output public-key hash."
    );
  }

  const sighashByte = signatureWithHashType[signatureWithHashType.length - 1];
  if (sighashByte !== 0x41 && sighashByte !== 0xc1) {
    return invalid(
      authorInputIndex,
      "sighash-policy",
      "UNSUPPORTED_SIGHASH",
      "TM1 Draft 0.2 accepts only sighash 0x41 or 0xc1."
    );
  }

  return {
    valid: true,
    authorInputIndex,
    input,
    publicKeyHex: hexFromBytes(publicKey),
    publicKeyHashHex: hexFromBytes(actualPublicKeyHash),
    signatureWithHashTypeHex: hexFromBytes(signatureWithHashType),
    sighashByte
  };
}
