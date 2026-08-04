import type { NormalizedTransaction } from "@tonalli-memo/chronik";
import type { InputAuthorizationDecision, VerificationResult, VerifiedResult } from "@tonalli-memo/verification";

export const TXID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const TXID_2 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
export const TEST_ADDRESS = "ecash:qptestaddress0000000000000000000000000000000";

export const utf8Bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

export const normalizedTx = (overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
  txid: TXID,
  isCoinbase: false,
  inputs: [
    {
      index: 0,
      prevOut: {
        txid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        outIdx: 0
      },
      inputScriptHex: "00",
      outputScriptHex: "76a914abcdef88ac",
      address: TEST_ADDRESS
    }
  ],
  inputAddresses: [TEST_ADDRESS],
  opReturnOutputs: [
    {
      outputIndex: 0,
      valueSats: 0n,
      outputScriptHex: "6a",
      pushes: [utf8Bytes("TM0|p|xa|signal now lives on eCash")],
      parseStatus: "parsed"
    }
  ],
  blockHeight: 900001,
  blockHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  blockTimestamp: 1710000000,
  firstSeenAt: 1709999900,
  isFinal: true,
  rawResponse: {
    nested: 1n
  },
  ...overrides
});

const memo = {
  marker: "TM0",
  version: 0,
  type: "p",
  profile: "xa",
  payload: "signal now lives on eCash",
  byteLength: 35
} as const;

const profile = {
  code: "xa",
  alias: "xolos-army",
  displayName: "Xolos Army",
  authorizedAddresses: [{ address: TEST_ADDRESS }]
} as const;

const authorizationContext = {
  chainStatus: "confirmed",
  blockHeight: 900001
} as const;

const decision = (inputIndex: number): InputAuthorizationDecision => ({
  inputIndex,
  address: TEST_ADDRESS,
  authorized: true,
  reason: "AUTHORIZED",
  evaluationHeight: 900001
});

export const verifiedResult = (overrides: Partial<VerifiedResult> = {}): VerifiedResult => ({
  status: "VERIFIED",
  txid: TXID,
  transaction: normalizedTx(),
  memo,
  candidate: {
    outputIndex: 0,
    pushIndex: 0
  },
  profile,
  authorizationContext,
  evaluationHeight: 900001,
  authorizingAddress: TEST_ADDRESS,
  authorizingInputIndex: 0,
  authorizationDecisions: [decision(0)],
  ...overrides
});

export const verificationResultForStatus = (status: VerificationResult["status"], txid = TXID): VerificationResult => {
  const transaction = normalizedTx({ txid });
  switch (status) {
    case "VERIFIED":
      return verifiedResult({ txid, transaction });
    case "UNAUTHORIZED":
      return {
        status,
        txid,
        transaction,
        memo,
        candidate: { outputIndex: 0, pushIndex: 0 },
        profile,
        authorizationContext,
        evaluationHeight: 900001,
        authorizationDecisions: [decision(0)]
      };
    case "NO_MEMO":
      return { status, txid, transaction };
    case "INVALID_MEMO":
      return {
        status,
        txid,
        transaction,
        candidate: { outputIndex: 0, pushIndex: 0 },
        protocolError: { code: "EMPTY_PAYLOAD", message: "raw protocol detail" }
      };
    case "MULTIPLE_MEMOS":
      return {
        status,
        txid,
        transaction,
        candidates: [{ location: { outputIndex: 0, pushIndex: 0 }, bytes: utf8Bytes("a") }]
      };
    case "MEMPOOL_TIP_REQUIRED":
      return {
        status,
        txid,
        transaction,
        memo,
        candidate: { outputIndex: 0, pushIndex: 0 },
        profile
      };
    case "INVALID_VERIFICATION_CONTEXT":
      return {
        status,
        txid,
        transaction,
        memo,
        candidate: { outputIndex: 0, pushIndex: 0 },
        profile,
        authorizationContext,
        contextError: { code: "INVALID_HEIGHT_RANGE", message: "tipHeight is before confirmation" }
      };
    case "INVALID_TXID":
    case "TRANSACTION_NOT_FOUND":
    case "CHRONIK_UNAVAILABLE":
    case "INVALID_CHRONIK_RESPONSE":
      return {
        status,
        txid,
        sourceError: {
          code: status,
          message: `${status} summary`,
          cause: new Error("raw cause")
        }
      };
    default:
      return status satisfies never;
  }
};
