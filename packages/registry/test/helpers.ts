import { expect } from "vitest";
import { RegistryError, type RegistryErrorCode, parseRegistry, type RegistryDocument } from "../src/index.js";

export const TEST_ADDRESS = "ecash:qptestaddress0000000000000000000000000000000";
export const SECOND_TEST_ADDRESS = "ecash:qsecondaddress000000000000000000000000000000";

interface MutableAddress {
  address: string;
  validFromHeight?: number;
  validUntilHeight?: number;
  label?: string;
}

interface MutableProfile {
  code: string;
  alias: string;
  displayName: string;
  avatarUrl?: string;
  authorizedAddresses: MutableAddress[];
}

interface MutableProfiles extends Record<string, MutableProfile> {
  xa: MutableProfile;
  ty: MutableProfile;
  tw: MutableProfile;
  em: MutableProfile;
}

export interface MutableRegistryFixture {
  schemaVersion: number;
  network: string;
  profiles: MutableProfiles;
}

export function registryFixture(): MutableRegistryFixture {
  return {
    schemaVersion: 1,
    network: "ecash-mainnet",
    profiles: {
      xa: {
        code: "xa",
        alias: "xolosarmy.xec",
        displayName: "xolosArmy Network",
        authorizedAddresses: []
      },
      ty: {
        code: "ty",
        alias: "teyolia.xec",
        displayName: "Teyolia",
        authorizedAddresses: []
      },
      tw: {
        code: "tw",
        alias: "tonalli.xec",
        displayName: "Tonalli Wallet",
        authorizedAddresses: []
      },
      em: {
        code: "em",
        alias: "ecashmx.xec",
        displayName: "eCash Magazine México",
        authorizedAddresses: []
      }
    }
  };
}

export function registryWithXaAddresses(addresses: MutableAddress[]): RegistryDocument {
  const fixture = registryFixture();
  fixture.profiles.xa.authorizedAddresses = addresses;
  return parseRegistry(fixture);
}

export function expectRegistryError(action: () => unknown, code: RegistryErrorCode): void {
  expect(action).toThrow(RegistryError);

  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe(code);
    return;
  }

  throw new Error("Expected action to throw.");
}
