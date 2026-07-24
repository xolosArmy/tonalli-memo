import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY, parseRegistry, resolveProfile, resolveProfileByAlias } from "../src/index.js";
import { TEST_ADDRESS, registryFixture } from "./helpers.js";

describe("profile resolution", () => {
  it("resolves all four official codes", () => {
    expect(resolveProfile("xa")?.alias).toBe("xolosarmy.xec");
    expect(resolveProfile("ty")?.alias).toBe("teyolia.xec");
    expect(resolveProfile("tw")?.alias).toBe("tonalli.xec");
    expect(resolveProfile("em")?.alias).toBe("ecashmx.xec");
  });

  it("returns null for unknown codes", () => {
    expect(resolveProfile("zz")).toBeNull();
  });

  it("resolves by alias", () => {
    expect(resolveProfileByAlias("xolosarmy.xec")?.code).toBe("xa");
    expect(resolveProfileByAlias("teyolia.xec")?.code).toBe("ty");
    expect(resolveProfileByAlias("tonalli.xec")?.code).toBe("tw");
    expect(resolveProfileByAlias("ecashmx.xec")?.code).toBe("em");
  });

  it("returns null for unknown aliases", () => {
    expect(resolveProfileByAlias("unknown.xec")).toBeNull();
  });

  it("matches aliases exactly and case-sensitively", () => {
    expect(resolveProfileByAlias("Xolosarmy.xec")).toBeNull();
    expect(resolveProfileByAlias(" xolosarmy.xec")).toBeNull();
    expect(resolveProfileByAlias("xolosarmy.xec ")).toBeNull();
  });

  it("uses a custom registry fixture", () => {
    const fixture = registryFixture();
    fixture.profiles.xa.displayName = "Fixture Name";
    fixture.profiles.xa.authorizedAddresses = [{ address: TEST_ADDRESS }];
    const registry = parseRegistry(fixture);

    expect(resolveProfile("xa", registry)?.displayName).toBe("Fixture Name");
    expect(resolveProfile("xa", registry)?.authorizedAddresses[0]?.address).toBe(TEST_ADDRESS);
  });

  it("uses the default registry", () => {
    expect(resolveProfile("xa")).toBe(DEFAULT_REGISTRY.profiles.xa);
  });

  it("keeps canonical registry data frozen from consumer mutation", () => {
    const profile = resolveProfile("xa");
    if (profile === null) {
      throw new Error("Expected official profile to resolve.");
    }

    expect(Object.isFrozen(DEFAULT_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_REGISTRY.profiles)).toBe(true);
    expect(Object.isFrozen(DEFAULT_REGISTRY.profiles.xa)).toBe(true);
    expect(Object.isFrozen(DEFAULT_REGISTRY.profiles.xa.authorizedAddresses)).toBe(true);
    expect(Reflect.set(profile, "displayName", "Changed Name")).toBe(false);
    expect(DEFAULT_REGISTRY.profiles.xa.displayName).toBe("xolosArmy Network");
    expect(resolveProfile("xa")?.displayName).toBe("xolosArmy Network");
  });
});
