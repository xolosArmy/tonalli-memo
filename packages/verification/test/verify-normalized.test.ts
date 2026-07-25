import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY, RegistryError, type RegistryDocument } from "@tonalli-memo/registry";
import { findMemoCandidates, verifyNormalizedTransaction, VerificationInvariantError } from "../src/index.js";
import { input, mempoolTx, normalizedTx, opReturnOutput, validMemoPush } from "./fixtures.js";
import {
  P2PKH_ADDRESS,
  P2SH_ADDRESS,
  SECOND_TEST_ADDRESS,
  TEST_ADDRESS,
  expectStatus,
  registryWithXaAddresses,
  utf8Bytes
} from "./helpers.js";

const registryFor = (addresses: Parameters<typeof registryWithXaAddresses>[0]) => registryWithXaAddresses(addresses);

const resultKeys = (value: object): string[] => Object.keys(value).sort();

describe("protocol verification results", () => {
  it("returns coherent NO_MEMO fields when there is no candidate", () => {
    const result = expectStatus(verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [] })), "NO_MEMO");
    expect(resultKeys(result)).toEqual(["status", "transaction", "txid"]);
    expect("memo" in result).toBe(false);
    expect("profile" in result).toBe(false);
    expect("authorizationContext" in result).toBe(false);
  });

  it("returns coherent VERIFIED fields with one valid memo", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx(), { registry: registryFor([{ address: TEST_ADDRESS }]) }),
      "VERIFIED"
    );
    expect(resultKeys(result)).toEqual([
      "authorizationContext",
      "authorizationDecisions",
      "authorizingAddress",
      "authorizingInputIndex",
      "candidate",
      "evaluationHeight",
      "memo",
      "profile",
      "status",
      "transaction",
      "txid"
    ]);
    expect(result.memo.profile).toBe("xa");
    expect(result.memo.payload).toBe("signal now lives on eCash");
    expect(result.candidate).toEqual({ outputIndex: 0, pushIndex: 0 });
    expect(result.authorizationContext).toEqual({ chainStatus: "confirmed", blockHeight: 900001 });
    expect(result.evaluationHeight).toBe(900001);
    expect(result.authorizationDecisions.every((decision) => decision.evaluationHeight === result.evaluationHeight)).toBe(true);
    expect(result.authorizingAddress).toBe(TEST_ADDRESS);
    expect(result.authorizingInputIndex).toBe(0);
    expect(result.authorizationDecisions).toEqual([
      {
        inputIndex: 0,
        address: TEST_ADDRESS,
        authorized: true,
        reason: "AUTHORIZED",
        evaluationHeight: 900001
      }
    ]);
  });

  it("verifies a rediscovered candidate after a previous candidate-byte mutation", () => {
    const transaction = normalizedTx();
    const [candidate] = findMemoCandidates(transaction);

    if (candidate === undefined) {
      throw new Error("Expected one candidate.");
    }
    candidate.bytes[0] = 0x58;

    expect(transaction.opReturnOutputs[0]?.pushes[0]).toEqual(validMemoPush());
    const result = expectStatus(verifyNormalizedTransaction(transaction, { registry: registryFor([{ address: TEST_ADDRESS }]) }), "VERIFIED");
    expect(result.memo.payload).toBe("signal now lives on eCash");
  });

  it("returns INVALID_MEMO for invalid UTF-8 candidates", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [new Uint8Array([0x54, 0x4d, 0xff])])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("INVALID_UTF8");
    expect(resultKeys(result)).toEqual(["candidate", "protocolError", "status", "transaction", "txid"]);
    expect("memo" in result).toBe(false);
    expect("profile" in result).toBe(false);
  });

  it("returns INVALID_MEMO for malformed TM0 envelopes", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(2, [utf8Bytes("TM0|p|xa")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("INVALID_FORMAT");
    expect(result.candidate).toEqual({ outputIndex: 2, pushIndex: 0 });
  });

  it("returns INVALID_MEMO for invalid markers beginning with TM", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TMx|p|xa|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("INVALID_MARKER");
  });

  it("returns INVALID_MEMO for unsupported TM1 markers", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM1|p|xa|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("UNSUPPORTED_VERSION");
  });

  it("returns INVALID_MEMO for invalid memo type format", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM0|P|xa|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("INVALID_TYPE_FORMAT");
  });

  it("returns INVALID_MEMO for reserved memo types", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM0|l|xa|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("RESERVED_TYPE");
  });

  it("returns INVALID_MEMO for unknown memo types", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM0|z|xa|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("UNKNOWN_TYPE");
  });

  it("returns INVALID_MEMO for invalid profile format", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM0|p|XA|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("INVALID_PROFILE_FORMAT");
  });

  it("returns INVALID_MEMO for unknown profiles", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM0|p|zz|payload")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("UNKNOWN_PROFILE");
  });

  it("returns INVALID_MEMO for empty payloads", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM0|p|xa|")])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("EMPTY_PAYLOAD");
  });

  it("returns INVALID_MEMO when the envelope is over 80 bytes", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes(`TM0|p|xa|${"a".repeat(72)}`)])] })),
      "INVALID_MEMO"
    );
    expect(result.protocolError.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns coherent MULTIPLE_MEMOS for two valid candidates before protocol selection", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [validMemoPush(), validMemoPush()])] })),
      "MULTIPLE_MEMOS"
    );
    expect(resultKeys(result)).toEqual(["candidates", "status", "transaction", "txid"]);
    expect(result.candidates.map((candidate) => candidate.location)).toEqual([
      { outputIndex: 0, pushIndex: 0 },
      { outputIndex: 0, pushIndex: 1 }
    ]);
    expect("memo" in result).toBe(false);
    expect("profile" in result).toBe(false);
  });

  it("returns MULTIPLE_MEMOS for valid plus malformed candidates", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [validMemoPush(), utf8Bytes("TM")])] })),
      "MULTIPLE_MEMOS"
    );
  });

  it("returns MULTIPLE_MEMOS for valid plus unsupported candidates", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [validMemoPush(), utf8Bytes("TM1")])] })),
      "MULTIPLE_MEMOS"
    );
  });

  it("returns MULTIPLE_MEMOS for two malformed Tonalli candidates", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ opReturnOutputs: [opReturnOutput(0, [utf8Bytes("TM"), utf8Bytes("TMx")])] })),
      "MULTIPLE_MEMOS"
    );
  });

  it("returns MULTIPLE_MEMOS for candidates in different outputs before validation", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(
        normalizedTx({ opReturnOutputs: [opReturnOutput(5, [utf8Bytes("TM1")]), opReturnOutput(2, [validMemoPush()])] })
      ),
      "MULTIPLE_MEMOS"
    );
    expect(result.candidates.map((candidate) => candidate.location)).toEqual([
      { outputIndex: 2, pushIndex: 0 },
      { outputIndex: 5, pushIndex: 0 }
    ]);
  });

  it("throws an invariant error if a validated profile is absent from the selected registry", () => {
    const registry = registryFor([]);
    const incompleteRegistry = {
      ...registry,
      profiles: {
        ...registry.profiles,
        xa: undefined
      }
    } as unknown as RegistryDocument;
    expect(() => verifyNormalizedTransaction(normalizedTx(), { registry: incompleteRegistry })).toThrow(
      VerificationInvariantError
    );
  });
});

describe("confirmed authorization", () => {
  it("verifies with an unbounded address", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx(), { registry: registryFor([{ address: TEST_ADDRESS }]) }),
      "VERIFIED"
    );
  });

  it("verifies exactly at validFromHeight", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ blockHeight: 100 }), {
        registry: registryFor([{ address: TEST_ADDRESS, validFromHeight: 100 }])
      }),
      "VERIFIED"
    );
  });

  it("verifies exactly at validUntilHeight", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ blockHeight: 100 }), {
        registry: registryFor([{ address: TEST_ADDRESS, validUntilHeight: 100 }])
      }),
      "VERIFIED"
    );
  });

  it("is unauthorized before activation", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ blockHeight: 99 }), {
        registry: registryFor([{ address: TEST_ADDRESS, validFromHeight: 100 }])
      }),
      "UNAUTHORIZED"
    );
    expect(result.authorizationDecisions[0]?.reason).toBe("NOT_YET_VALID");
  });

  it("is unauthorized after expiration", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ blockHeight: 101 }), {
        registry: registryFor([{ address: TEST_ADDRESS, validUntilHeight: 100 }])
      }),
      "UNAUTHORIZED"
    );
    expect(result.authorizationDecisions[0]?.reason).toBe("EXPIRED");
  });

  it("returns coherent UNAUTHORIZED fields when the address is not listed", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, SECOND_TEST_ADDRESS)] }), {
        registry: registryFor([{ address: TEST_ADDRESS }])
      }),
      "UNAUTHORIZED"
    );
    expect(resultKeys(result)).toEqual([
      "authorizationContext",
      "authorizationDecisions",
      "candidate",
      "evaluationHeight",
      "memo",
      "profile",
      "status",
      "transaction",
      "txid"
    ]);
    expect("authorizingAddress" in result).toBe(false);
    expect("authorizingInputIndex" in result).toBe(false);
    expect(result.authorizationDecisions[0]?.reason).toBe("ADDRESS_NOT_LISTED");
  });

  it("is unauthorized with no decoded addresses", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, null)], inputAddresses: [] }), {
        registry: registryFor([{ address: TEST_ADDRESS }])
      }),
      "UNAUTHORIZED"
    );
    expect(result.authorizationDecisions).toEqual([]);
    expect(result.evaluationHeight).toBe(900001);
  });

  it("is unauthorized for a coinbase transaction with a valid memo", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ isCoinbase: true, inputs: [input(0, null)], inputAddresses: [] }), {
        registry: registryFor([{ address: TEST_ADDRESS }])
      }),
      "UNAUTHORIZED"
    );
    expect(result.authorizationDecisions).toEqual([]);
  });

  it("evaluates P2PKH address-bearing inputs", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, P2PKH_ADDRESS)], inputAddresses: [P2PKH_ADDRESS] }), {
        registry: registryFor([{ address: P2PKH_ADDRESS }])
      }),
      "VERIFIED"
    );
  });

  it("evaluates P2SH address-bearing inputs", () => {
    expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, P2SH_ADDRESS)], inputAddresses: [P2SH_ADDRESS] }), {
        registry: registryFor([{ address: P2SH_ADDRESS }])
      }),
      "VERIFIED"
    );
  });

  it("skips nonstandard inputs whose address is null", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, null), input(1, TEST_ADDRESS)] }), {
        registry: registryFor([{ address: TEST_ADDRESS }])
      }),
      "VERIFIED"
    );
    expect(result.authorizationDecisions.map((decision) => decision.inputIndex)).toEqual([1]);
  });

  it("preserves duplicate addresses", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, TEST_ADDRESS), input(1, TEST_ADDRESS)] }), {
        registry: registryFor([{ address: TEST_ADDRESS }])
      }),
      "VERIFIED"
    );
    expect(result.authorizationDecisions.map((decision) => decision.address)).toEqual([TEST_ADDRESS, TEST_ADDRESS]);
  });

  it("returns all decisions for multiple authorized inputs without early return", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(0, TEST_ADDRESS), input(1, SECOND_TEST_ADDRESS)] }), {
        registry: registryFor([{ address: TEST_ADDRESS }, { address: SECOND_TEST_ADDRESS }])
      }),
      "VERIFIED"
    );
    expect(result.authorizationDecisions.map((decision) => decision.authorized)).toEqual([true, true]);
    expect(result.authorizationDecisions.map((decision) => decision.inputIndex)).toEqual([0, 1]);
  });

  it("keeps first and third authorized inputs while selecting the first authorizer", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(
        normalizedTx({ inputs: [input(0, TEST_ADDRESS), input(1, null), input(2, SECOND_TEST_ADDRESS)] }),
        { registry: registryFor([{ address: TEST_ADDRESS }, { address: SECOND_TEST_ADDRESS }]) }
      ),
      "VERIFIED"
    );
    expect(result.authorizingInputIndex).toBe(0);
    expect(result.authorizationDecisions.map((decision) => decision.inputIndex)).toEqual([0, 2]);
    expect(result.authorizationDecisions.map((decision) => decision.authorized)).toEqual([true, true]);
  });

  it("uses the first authorized input by input order", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ inputs: [input(5, SECOND_TEST_ADDRESS), input(9, TEST_ADDRESS)] }), {
        registry: registryFor([{ address: TEST_ADDRESS }])
      }),
      "VERIFIED"
    );
    expect(result.authorizingInputIndex).toBe(9);
    expect(result.authorizingAddress).toBe(TEST_ADDRESS);
    expect(result.authorizationDecisions).toHaveLength(2);
  });

  it("ignores a supplied tip for confirmed transactions", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(normalizedTx({ blockHeight: 100 }), {
        registry: registryFor([{ address: TEST_ADDRESS, validFromHeight: 100 }]),
        tipHeight: -1
      }),
      "VERIFIED"
    );
    expect(result.evaluationHeight).toBe(100);
  });

  it("uses DEFAULT_REGISTRY as unauthorized because it currently authorizes nobody", () => {
    const explicit = expectStatus(verifyNormalizedTransaction(normalizedTx(), { registry: DEFAULT_REGISTRY }), "UNAUTHORIZED");
    const implicit = expectStatus(verifyNormalizedTransaction(normalizedTx()), "UNAUTHORIZED");
    expect(explicit.authorizationDecisions).toEqual([
      {
        inputIndex: 0,
        address: TEST_ADDRESS,
        authorized: false,
        reason: "ADDRESS_NOT_LISTED",
        evaluationHeight: 900001
      }
    ]);
    expect(implicit.authorizationDecisions).toEqual(explicit.authorizationDecisions);
  });

  it("propagates registry INVALID_HEIGHT for malformed confirmed normalized data", () => {
    expect(() => verifyNormalizedTransaction(normalizedTx({ blockHeight: -1 }), { registry: registryFor([{ address: TEST_ADDRESS }]) })).toThrow(
      RegistryError
    );
  });
});

describe("mempool authorization", () => {
  it("verifies activation at evaluation height 1000 when tip is 999", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx(), {
        registry: registryFor([{ address: TEST_ADDRESS, validFromHeight: 1000 }]),
        tipHeight: 999
      }),
      "VERIFIED"
    );
    expect(result.evaluationHeight).toBe(1000);
  });

  it("is unauthorized when activation is at 1001", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx(), {
        registry: registryFor([{ address: TEST_ADDRESS, validFromHeight: 1001 }]),
        tipHeight: 999
      }),
      "UNAUTHORIZED"
    );
    expect(result.authorizationDecisions[0]?.reason).toBe("NOT_YET_VALID");
    expect(result.evaluationHeight).toBe(1000);
  });

  it("verifies expiration at 1000", () => {
    expectStatus(
      verifyNormalizedTransaction(mempoolTx(), {
        registry: registryFor([{ address: TEST_ADDRESS, validUntilHeight: 1000 }]),
        tipHeight: 999
      }),
      "VERIFIED"
    );
  });

  it("is unauthorized when expiration is at 999", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx(), {
        registry: registryFor([{ address: TEST_ADDRESS, validUntilHeight: 999 }]),
        tipHeight: 999
      }),
      "UNAUTHORIZED"
    );
    expect(result.authorizationDecisions[0]?.reason).toBe("EXPIRED");
  });

  it("returns coherent MEMPOOL_TIP_REQUIRED without a fabricated evaluation height", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx(), { registry: registryFor([{ address: TEST_ADDRESS }]) }),
      "MEMPOOL_TIP_REQUIRED"
    );
    expect(resultKeys(result)).toEqual(["candidate", "memo", "profile", "status", "transaction", "txid"]);
    expect("evaluationHeight" in result).toBe(false);
    expect("authorizationContext" in result).toBe(false);
  });

  it("returns INVALID_VERIFICATION_CONTEXT for a negative tip", () => {
    expectStatus(
      verifyNormalizedTransaction(mempoolTx(), { registry: registryFor([{ address: TEST_ADDRESS }]), tipHeight: -1 }),
      "INVALID_VERIFICATION_CONTEXT"
    );
  });

  it("returns INVALID_VERIFICATION_CONTEXT for NaN tip", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx(), { registry: registryFor([{ address: TEST_ADDRESS }]), tipHeight: Number.NaN }),
      "INVALID_VERIFICATION_CONTEXT"
    );
    expect(resultKeys(result)).toEqual([
      "authorizationContext",
      "candidate",
      "contextError",
      "memo",
      "profile",
      "status",
      "transaction",
      "txid"
    ]);
    expect("authorizationDecisions" in result).toBe(false);
    expect("evaluationHeight" in result).toBe(false);
  });

  it("returns INVALID_VERIFICATION_CONTEXT for Infinity tip", () => {
    expectStatus(
      verifyNormalizedTransaction(mempoolTx(), { registry: registryFor([{ address: TEST_ADDRESS }]), tipHeight: Number.POSITIVE_INFINITY }),
      "INVALID_VERIFICATION_CONTEXT"
    );
  });

  it("returns INVALID_VERIFICATION_CONTEXT for a fractional tip", () => {
    expectStatus(
      verifyNormalizedTransaction(mempoolTx(), { registry: registryFor([{ address: TEST_ADDRESS }]), tipHeight: 1.5 }),
      "INVALID_VERIFICATION_CONTEXT"
    );
  });

  it("returns INVALID_VERIFICATION_CONTEXT for an unsafe tip", () => {
    expectStatus(
      verifyNormalizedTransaction(mempoolTx(), {
        registry: registryFor([{ address: TEST_ADDRESS }]),
        tipHeight: Number.MAX_SAFE_INTEGER + 1
      }),
      "INVALID_VERIFICATION_CONTEXT"
    );
  });

  it("delegates MAX_SAFE_INTEGER overflow to the registry", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx(), {
        registry: registryFor([{ address: TEST_ADDRESS }]),
        tipHeight: Number.MAX_SAFE_INTEGER
      }),
      "INVALID_VERIFICATION_CONTEXT"
    );
    expect(result.contextError.code).toBe("INVALID_HEIGHT");
  });

  it("uses the supplied mempool tip and not firstSeenAt or block timestamp as height", () => {
    const result = expectStatus(
      verifyNormalizedTransaction(mempoolTx({ firstSeenAt: 42, blockTimestamp: 43 }), {
        registry: registryFor([{ address: TEST_ADDRESS, validFromHeight: 1000 }]),
        tipHeight: 999
      }),
      "VERIFIED"
    );
    expect(result.authorizationContext).toEqual({ chainStatus: "unconfirmed", tipHeight: 999 });
    expect(result.evaluationHeight).toBe(1000);
  });
});

describe("mutation invariants", () => {
  it("does not mutate frozen transaction arrays or registry address arrays", () => {
    const pushes = Object.freeze([validMemoPush()]);
    const outputs = Object.freeze([opReturnOutput(5, pushes), opReturnOutput(2, Object.freeze([utf8Bytes("hello")]))]);
    const inputs = Object.freeze([input(0, TEST_ADDRESS)]);
    const inputAddresses = Object.freeze([TEST_ADDRESS]);
    const transaction = normalizedTx({ opReturnOutputs: outputs, inputs, inputAddresses });
    const registry = registryFor([{ address: TEST_ADDRESS }]);
    Object.freeze(registry.profiles.xa.authorizedAddresses);
    Object.freeze(registry.profiles.xa);
    Object.freeze(registry.profiles);
    Object.freeze(registry);

    const first = expectStatus(verifyNormalizedTransaction(transaction, { registry }), "VERIFIED");
    const second = expectStatus(verifyNormalizedTransaction(transaction, { registry }), "VERIFIED");

    expect(first.candidate).toEqual({ outputIndex: 5, pushIndex: 0 });
    expect(second.memo).toEqual(first.memo);
    expect(transaction.inputs).toBe(inputs);
    expect(transaction.inputAddresses).toBe(inputAddresses);
    expect(transaction.opReturnOutputs).toBe(outputs);
    expect(transaction.opReturnOutputs.map((output) => output.outputIndex)).toEqual([5, 2]);
    expect(transaction.opReturnOutputs[0]?.pushes[0]).toEqual(validMemoPush());
    expect(registry.profiles.xa.authorizedAddresses).toEqual([{ address: TEST_ADDRESS }]);
  });
});
