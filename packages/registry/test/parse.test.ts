import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY, parseRegistry } from "../src/index.js";
import { TEST_ADDRESS, expectRegistryError, registryFixture, registryWithXaAddresses } from "./helpers.js";

describe("parseRegistry", () => {
  it("parses a valid official registry", () => {
    const parsed = parseRegistry(registryFixture());
    expect(parsed).toEqual(DEFAULT_REGISTRY);
  });

  it("rejects unsupported schema versions", () => {
    const fixture = registryFixture();
    fixture.schemaVersion = 2;
    expectRegistryError(() => parseRegistry(fixture), "UNSUPPORTED_SCHEMA_VERSION");
  });

  it("rejects invalid networks", () => {
    const fixture = registryFixture();
    fixture.network = "ecash-testnet";
    expectRegistryError(() => parseRegistry(fixture), "INVALID_NETWORK");
  });

  it("rejects a missing required profile", () => {
    const fixture = registryFixture();
    const profiles: Record<string, unknown> = fixture.profiles;
    delete profiles.tw;
    expectRegistryError(() => parseRegistry(fixture), "MISSING_PROFILE");
  });

  it("rejects an unknown profile", () => {
    const fixture = registryFixture();
    fixture.profiles.zz = {
      code: "zz",
      alias: "example.xec",
      displayName: "Example",
      authorizedAddresses: []
    };
    expectRegistryError(() => parseRegistry(fixture), "UNKNOWN_PROFILE");
  });

  it("rejects key and code mismatches", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.code = "ty";
    expectRegistryError(() => parseRegistry(fixture), "PROFILE_CODE_MISMATCH");
  });

  it("rejects alias mismatches", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.alias = "different.xec";
    expectRegistryError(() => parseRegistry(fixture), "ALIAS_MISMATCH");
  });

  it("rejects empty display names", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.displayName = "";
    expectRegistryError(() => parseRegistry(fixture), "INVALID_DISPLAY_NAME");
  });

  it("rejects invalid authorized-address collections", () => {
    const fixture = registryFixture();
    Object.assign(fixture.profiles.xa, { authorizedAddresses: "not an array" });
    expectRegistryError(() => parseRegistry(fixture), "INVALID_AUTHORIZED_ADDRESSES");
  });

  it("rejects null, arrays, and inherited profile maps where plain objects are required", () => {
    expectRegistryError(() => parseRegistry(null), "INVALID_REGISTRY");
    expectRegistryError(() => parseRegistry([]), "INVALID_REGISTRY");

    const arrayProfiles = registryFixture();
    Object.assign(arrayProfiles, { profiles: [] });
    expectRegistryError(() => parseRegistry(arrayProfiles), "INVALID_REGISTRY");

    const inheritedProfiles = registryFixture();
    inheritedProfiles.profiles = Object.create(inheritedProfiles.profiles);
    expectRegistryError(() => parseRegistry(inheritedProfiles), "INVALID_REGISTRY");
  });

  it("rejects invalid address formats", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: "bitcoincash:qqqq" }];
    expectRegistryError(() => parseRegistry(fixture), "INVALID_ADDRESS");

    const empty = registryFixture();
    empty.profiles.xa.authorizedAddresses = [{ address: "" }];
    expectRegistryError(() => parseRegistry(empty), "INVALID_ADDRESS");
  });

  it("rejects uppercase or mixed-case addresses", () => {
    const uppercase = registryFixture();
    uppercase.profiles.xa.authorizedAddresses = [{ address: "ECASH:qqqq" }];
    expectRegistryError(() => parseRegistry(uppercase), "INVALID_ADDRESS");

    const mixedCase = registryFixture();
    mixedCase.profiles.xa.authorizedAddresses = [{ address: "ecash:qQqq" }];
    expectRegistryError(() => parseRegistry(mixedCase), "INVALID_ADDRESS");
  });

  it("rejects duplicate addresses within one profile", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS }, { address: TEST_ADDRESS }];
    expectRegistryError(() => parseRegistry(fixture), "DUPLICATE_ADDRESS");
  });

  it("rejects negative heights", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS, validFromHeight: -1 }];
    expectRegistryError(() => parseRegistry(fixture), "INVALID_HEIGHT");
  });

  it("rejects non-integer heights", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS, validUntilHeight: 1.5 }];
    expectRegistryError(() => parseRegistry(fixture), "INVALID_HEIGHT");
  });

  it("rejects unsafe integer heights", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS, validFromHeight: Number.MAX_SAFE_INTEGER + 1 }];
    expectRegistryError(() => parseRegistry(fixture), "INVALID_HEIGHT");
  });

  it("rejects inverted height ranges", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS, validFromHeight: 11, validUntilHeight: 10 }];
    expectRegistryError(() => parseRegistry(fixture), "INVALID_HEIGHT_RANGE");
  });

  it("accepts empty address arrays", () => {
    expect(parseRegistry(registryFixture()).profiles.xa.authorizedAddresses).toEqual([]);
  });

  it("accepts optional fields when valid", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.avatarUrl = "https://example.test/avatar.png";
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS, label: "primary", validFromHeight: 1 }];
    const parsed = parseRegistry(fixture);
    expect(parsed.profiles.xa.avatarUrl).toBe("https://example.test/avatar.png");
    expect(parsed.profiles.xa.authorizedAddresses[0]?.label).toBe("primary");
  });

  it("rejects empty optional labels and avatar URLs", () => {
    const emptyLabel = registryFixture();
    emptyLabel.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS, label: "" }];
    expectRegistryError(() => parseRegistry(emptyLabel), "INVALID_AUTHORIZED_ADDRESSES");

    const emptyAvatar = registryFixture();
    emptyAvatar.profiles.xa.avatarUrl = "";
    expectRegistryError(() => parseRegistry(emptyAvatar), "INVALID_REGISTRY");
  });

  it("allows the same address to appear in different profiles", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS }];
    fixture.profiles.ty.authorizedAddresses = [{ address: TEST_ADDRESS }];

    const parsed = parseRegistry(fixture);
    expect(parsed.profiles.xa.authorizedAddresses[0]?.address).toBe(TEST_ADDRESS);
    expect(parsed.profiles.ty.authorizedAddresses[0]?.address).toBe(TEST_ADDRESS);
  });

  it("freezes populated authorized-address entries", () => {
    const registry = registryWithXaAddresses([{ address: TEST_ADDRESS, label: "primary" }]);
    const entry = registry.profiles.xa.authorizedAddresses[0];
    expect(entry).toBeDefined();
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Reflect.set(entry as object, "label", "changed")).toBe(false);
    expect(registry.profiles.xa.authorizedAddresses[0]?.label).toBe("primary");
  });

  it("does not mutate the input object", () => {
    const fixture = registryFixture();
    const before = structuredClone(fixture);
    parseRegistry(fixture);
    expect(fixture).toEqual(before);
  });
});
