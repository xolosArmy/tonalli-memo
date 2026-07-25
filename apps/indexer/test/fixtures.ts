import type { NormalizedInput, NormalizedOpReturnOutput, NormalizedTransaction } from "@tonalli-memo/chronik";
import type {
  InputAuthorizationDecision,
  VerificationResult,
  VerifiedResult
} from "@tonalli-memo/verification";

export const TXID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const TXID_2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const PREV_TXID = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
export const TEST_ADDRESS = "ecash:qptestaddress0000000000000000000000000000000";

export const utf8Bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

export const input = (index: number, address: string | null = TEST_ADDRESS): NormalizedInput => ({
  index,
  prevOut: {
    txid: PREV_TXID,
    outIdx: index
  },
  outputScriptHex: address === null ? null : "76A914ABCDEF88AC",
  address
});

export const opReturnOutput = (
  outputIndex: number,
  pushes: readonly Uint8Array[] = [utf8Bytes("TM0|p|xa|signal now lives on eCash")],
  parseStatus: "parsed" | "malformed" = "parsed"
): NormalizedOpReturnOutput => ({
  outputIndex,
  outputScriptHex: "6A04ABCDEF",
  pushes,
  parseStatus,
  ...(parseStatus === "malformed" ? { parseErrorCode: "MALFORMED_OP_RETURN" as const } : {})
});

export const normalizedTx = (overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
  txid: TXID,
  isCoinbase: false,
  inputs: [input(0)],
  inputAddresses: [TEST_ADDRESS],
  opReturnOutputs: [opReturnOutput(0)],
  blockHeight: 900001,
  blockHash: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  blockTimestamp: 1710000000,
  firstSeenAt: 1709999900,
  isFinal: true,
  rawResponse: {
    nested: {
      value: 1n
    }
  },
  ...overrides
});

export const mempoolTx = (overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction =>
  normalizedTx({
    blockHeight: null,
    blockHash: null,
    blockTimestamp: null,
    firstSeenAt: null,
    isFinal: false,
    ...overrides
  });

export const memo = {
  marker: "TM0",
  version: 0,
  type: "p",
  profile: "xa",
  payload: "signal now lives on eCash",
  byteLength: 35
} as const;

export const profile = {
  code: "xa",
  alias: "xolos-army",
  displayName: "Xolos Army",
  authorizedAddresses: [{ address: TEST_ADDRESS }]
} as const;

export const authorizationContext = {
  chainStatus: "confirmed",
  blockHeight: 900001
} as const;

export const decision = (inputIndex: number, address = TEST_ADDRESS, authorized = true): InputAuthorizationDecision => ({
  inputIndex,
  address,
  authorized,
  reason: authorized ? "AUTHORIZED" : "ADDRESS_NOT_LISTED",
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

export const unauthorizedResult = (overrides: Partial<Extract<VerificationResult, { status: "UNAUTHORIZED" }>> = {}) => ({
  ...verifiedResult(),
  status: "UNAUTHORIZED" as const,
  authorizingAddress: undefined,
  authorizingInputIndex: undefined,
  authorizationDecisions: [decision(0, TEST_ADDRESS, false)],
  ...overrides
}) as Extract<VerificationResult, { status: "UNAUTHORIZED" }>;

export const noMemoResult = (): Extract<VerificationResult, { status: "NO_MEMO" }> => ({
  status: "NO_MEMO",
  txid: TXID,
  transaction: normalizedTx()
});

export const invalidMemoResult = (): Extract<VerificationResult, { status: "INVALID_MEMO" }> => ({
  status: "INVALID_MEMO",
  txid: TXID,
  transaction: normalizedTx(),
  candidate: {
    outputIndex: 0,
    pushIndex: 0
  },
  protocolError: {
    code: "EMPTY_PAYLOAD",
    message: "Payload must not be empty."
  }
});

export const multipleMemosResult = (): Extract<VerificationResult, { status: "MULTIPLE_MEMOS" }> => ({
  status: "MULTIPLE_MEMOS",
  txid: TXID,
  transaction: normalizedTx(),
  candidates: [
    { location: { outputIndex: 0, pushIndex: 0 }, bytes: utf8Bytes("TM0|p|xa|one") },
    { location: { outputIndex: 2, pushIndex: 1 }, bytes: utf8Bytes("TM0|p|xa|two") }
  ]
});

export const operationalResult = (
  status: "MEMPOOL_TIP_REQUIRED" | "INVALID_VERIFICATION_CONTEXT"
): Extract<VerificationResult, { status: typeof status }> => {
  const base = {
    txid: TXID,
    transaction: mempoolTx(),
    memo,
    candidate: { outputIndex: 0, pushIndex: 0 },
    profile
  };
  if (status === "MEMPOOL_TIP_REQUIRED") {
    return {
      status,
      ...base
    } as Extract<VerificationResult, { status: typeof status }>;
  }
  return {
    status,
    ...base,
    authorizationContext: { chainStatus: "unconfirmed", tipHeight: -1 },
    contextError: { code: "INVALID_HEIGHT", message: "Invalid tip height." }
  } as Extract<VerificationResult, { status: typeof status }>;
};

export const sourceFailure = (
  status: "INVALID_TXID" | "TRANSACTION_NOT_FOUND" | "CHRONIK_UNAVAILABLE" | "INVALID_CHRONIK_RESPONSE"
): Extract<VerificationResult, { status: typeof status }> => ({
  status,
  txid: status === "INVALID_TXID" ? "not-a-txid" : TXID,
  sourceError: {
    code: status,
    message: `${status} summary`,
    cause: new Error("raw cause")
  }
}) as Extract<VerificationResult, { status: typeof status }>;
