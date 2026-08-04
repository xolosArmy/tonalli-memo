import { describe, expect, it } from "vitest";
import { mapVerificationResult } from "../../src/index.js";
import {
  invalidMemoResult,
  multipleMemosResult,
  operationalResult,
  sourceFailure,
  TXID,
  unauthorizedResult,
  verifiedResult
} from "../fixtures.js";

describe("verification result mapper", () => {
  it("maps VERIFIED to stable durable columns", () => {
    const mapped = mapVerificationResult(verifiedResult(), TXID, 900100);
    expect(mapped.verificationRecord).toMatchObject({
      status: "VERIFIED",
      protocol: "TM0",
      protocolVersion: 0,
      eventType: "p",
      profileCode: "xa",
      payload: "signal now lives on eCash",
      authorizingInputIndex: 0
    });
    expect(mapped.tipHeight).toBe(900100);
  });

  it("stores stable authorization diagnostics for UNAUTHORIZED", () => {
    const mapped = mapVerificationResult(unauthorizedResult(), TXID, null);
    expect(mapped.verificationRecord?.authorizationDecisions).toEqual([
      {
        inputIndex: 0,
        address: "ecash:qptestaddress0000000000000000000000000000000",
        authorized: false,
        reason: "ADDRESS_NOT_LISTED",
        evaluationHeight: 900001
      }
    ]);
  });

  it("stores INVALID_MEMO diagnostics without raw result objects", () => {
    const mapped = mapVerificationResult(invalidMemoResult(), TXID, null);
    expect(mapped.verificationRecord?.diagnostics).toEqual({
      protocolError: {
        code: "EMPTY_PAYLOAD",
        message: "Payload must not be empty."
      },
      candidate: {
        protocol: "TM0",
        outputIndex: 0,
        pushIndex: 0
      }
    });
  });

  it("stores only MULTIPLE_MEMOS candidate locations", () => {
    const mapped = mapVerificationResult(multipleMemosResult(), TXID, null);
    expect(mapped.verificationRecord?.diagnostics).toEqual({
      candidates: [
        { protocol: "TM0", outputIndex: 0, pushIndex: 0 },
        { protocol: "TM0", outputIndex: 2, pushIndex: 1 }
      ]
    });
  });

  it("maps incomplete context outcomes to attempts only", () => {
    const mapped = mapVerificationResult(operationalResult("MEMPOOL_TIP_REQUIRED"), TXID, null);
    expect(mapped.transaction?.txid).toBe(TXID);
    expect(mapped.verificationRecord).toBeNull();
    expect(mapped.attemptDiagnostics).toMatchObject({
      candidate: {
        outputIndex: 0,
        pushIndex: 0
      }
    });
  });

  it("maps source failures without raw causes", () => {
    const mapped = mapVerificationResult(sourceFailure("CHRONIK_UNAVAILABLE"), TXID, null);
    expect(mapped.transaction).toBeNull();
    expect(mapped.verificationRecord).toBeNull();
    expect(mapped.attemptDiagnostics).toEqual({
      sourceError: {
        code: "CHRONIK_UNAVAILABLE",
        message: "CHRONIK_UNAVAILABLE summary"
      }
    });
  });
});
