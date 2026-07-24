import { describe, expect, it } from "vitest";
import { authorizeAddress, isAuthorizedAddress } from "../src/index.js";
import { SECOND_TEST_ADDRESS, TEST_ADDRESS, expectRegistryError, registryWithXaAddresses } from "./helpers.js";

const confirmed = (blockHeight: number) => ({ chainStatus: "confirmed" as const, blockHeight });
const unconfirmed = (tipHeight: number) => ({ chainStatus: "unconfirmed" as const, tipHeight });

describe("confirmed address authorization", () => {
  it("reports addresses that are not listed", () => {
    const registry = registryWithXaAddresses([]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(100))).toEqual({
      authorized: false,
      reason: "ADDRESS_NOT_LISTED",
      evaluationHeight: 100
    });
  });

  it("authorizes an address with no height bounds", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(100))).toEqual({
      authorized: true,
      reason: "AUTHORIZED",
      evaluationHeight: 100
    });
    expect(isAuthorizedAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(100))).toBe(true);
  });

  it("authorizes exactly at validFromHeight", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validFromHeight: 100 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(100)).reason).toBe("AUTHORIZED");
  });

  it("reports below validFromHeight as not yet valid", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validFromHeight: 100 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(99))).toMatchObject({
      authorized: false,
      reason: "NOT_YET_VALID",
      evaluationHeight: 99
    });
  });

  it("authorizes exactly at validUntilHeight", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validUntilHeight: 100 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(100)).reason).toBe("AUTHORIZED");
  });

  it("reports above validUntilHeight as expired", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validUntilHeight: 100 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(101))).toMatchObject({
      authorized: false,
      reason: "EXPIRED",
      evaluationHeight: 101
    });
  });

  it("supports closed intervals with both bounds", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validFromHeight: 10, validUntilHeight: 20 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(9)).reason).toBe("NOT_YET_VALID");
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(10)).reason).toBe("AUTHORIZED");
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(20)).reason).toBe("AUTHORIZED");
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(21)).reason).toBe("EXPIRED");
  });

  it("uses exact address matching", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expect(authorizeAddress(registry.profiles.xa, `${TEST_ADDRESS} `, confirmed(100)).reason).toBe("ADDRESS_NOT_LISTED");
    expect(authorizeAddress(registry.profiles.xa, SECOND_TEST_ADDRESS, confirmed(100)).reason).toBe("ADDRESS_NOT_LISTED");
  });

  it("does not authorize an address for a different profile unless it is listed there", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(100)).reason).toBe("AUTHORIZED");
    expect(authorizeAddress(registry.profiles.ty, TEST_ADDRESS, confirmed(100))).toEqual({
      authorized: false,
      reason: "ADDRESS_NOT_LISTED",
      evaluationHeight: 100
    });
  });

  it("rejects invalid context heights", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expectRegistryError(() => authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(-1)), "INVALID_HEIGHT");
    expectRegistryError(() => authorizeAddress(registry.profiles.xa, TEST_ADDRESS, confirmed(1.5)), "INVALID_HEIGHT");
  });
});

describe("mempool address authorization", () => {
  it("uses tipHeight + 1 for an unbounded active address", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(999))).toEqual({
      authorized: true,
      reason: "AUTHORIZED",
      evaluationHeight: 1000
    });
  });

  it("authorizes activation at the next block", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validFromHeight: 1000 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(999)).reason).toBe("AUTHORIZED");
  });

  it("reports activation after the next block as not yet valid", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validFromHeight: 1001 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(999))).toMatchObject({
      authorized: false,
      reason: "NOT_YET_VALID",
      evaluationHeight: 1000
    });
  });

  it("authorizes expiration at the next block", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validUntilHeight: 1000 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(999)).reason).toBe("AUTHORIZED");
  });

  it("reports expiration at the current tip as expired", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validUntilHeight: 999 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(999))).toMatchObject({
      authorized: false,
      reason: "EXPIRED",
      evaluationHeight: 1000
    });
  });

  it("supports address intervals at the next block", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, validFromHeight: 900, validUntilHeight: 1000 }]);
    expect(authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(999)).reason).toBe("AUTHORIZED");
  });

  it("rejects invalid tip heights", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expectRegistryError(() => authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(-1)), "INVALID_HEIGHT");
    expectRegistryError(
      () => authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(Number.MAX_SAFE_INTEGER + 1)),
      "INVALID_HEIGHT"
    );
  });

  it("rejects tip heights whose next-block evaluation would be unsafe", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS }]);
    expectRegistryError(
      () => authorizeAddress(registry.profiles.xa, TEST_ADDRESS, unconfirmed(Number.MAX_SAFE_INTEGER)),
      "INVALID_HEIGHT"
    );
  });
});
