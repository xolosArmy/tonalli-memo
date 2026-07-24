import { describe, expect, it } from "vitest";
import canonicalRegistry from "../../../data/registry.json" with { type: "json" };
import { DEFAULT_REGISTRY } from "../src/index.js";
import { REGISTRY_DATA } from "../src/registry-data.js";

describe("DEFAULT_REGISTRY", () => {
  it("loads the official empty-address registry once through runtime parsing", () => {
    expect(DEFAULT_REGISTRY.schemaVersion).toBe(1);
    expect(DEFAULT_REGISTRY.network).toBe("ecash-mainnet");
    expect(DEFAULT_REGISTRY.profiles.xa.alias).toBe("xolosarmy.xec");
    expect(DEFAULT_REGISTRY.profiles.ty.alias).toBe("teyolia.xec");
    expect(DEFAULT_REGISTRY.profiles.tw.alias).toBe("tonalli.xec");
    expect(DEFAULT_REGISTRY.profiles.em.alias).toBe("ecashmx.xec");
    expect(DEFAULT_REGISTRY.profiles.xa.authorizedAddresses).toEqual([]);
  });

  it("keeps generated runtime data exactly consistent with canonical JSON", () => {
    expect(REGISTRY_DATA).toEqual(canonicalRegistry);
  });

  it("is deeply immutable for JavaScript consumers", () => {
    const parsed = DEFAULT_REGISTRY;
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.profiles)).toBe(true);
    expect(Object.isFrozen(parsed.profiles.xa)).toBe(true);
    expect(Object.isFrozen(parsed.profiles.xa.authorizedAddresses)).toBe(true);

    expect(Reflect.set(parsed.profiles.xa, "displayName", "Changed")).toBe(false);
    expect(() => {
      (parsed.profiles.xa.authorizedAddresses as unknown[]).push({ address: "ecash:example" });
    }).toThrow(TypeError);
    expect(parsed.profiles.xa.displayName).toBe("xolosArmy Network");
    expect(parsed.profiles.xa.authorizedAddresses).toEqual([]);
  });
});
