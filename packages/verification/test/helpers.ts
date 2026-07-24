import { expect } from "vitest";
import { parseRegistry, type RegistryDocument } from "@tonalli-memo/registry";

export const TXID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const MEMPOOL_TXID = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
export const PREV_TXID = "1111111111111111111111111111111111111111111111111111111111111111";
export const SECOND_PREV_TXID = "2222222222222222222222222222222222222222222222222222222222222222";
export const TEST_ADDRESS = "ecash:qptestaddress0000000000000000000000000000000";
export const SECOND_TEST_ADDRESS = "ecash:qsecondaddress000000000000000000000000000000";
export const P2PKH_ADDRESS = "ecash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs7ratqfx";
export const P2SH_ADDRESS = "ecash:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq8m7jvrjm";

interface MutableAddress {
  address: string;
  validFromHeight?: number;
  validUntilHeight?: number;
  label?: string;
}

export function registryWithXaAddresses(addresses: readonly MutableAddress[]): RegistryDocument {
  return parseRegistry({
    schemaVersion: 1,
    network: "ecash-mainnet",
    profiles: {
      xa: {
        code: "xa",
        alias: "xolosarmy.xec",
        displayName: "xolosArmy Network",
        authorizedAddresses: addresses.map((address) => ({ ...address }))
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
        displayName: "eCash Magazine Mexico",
        authorizedAddresses: []
      }
    }
  });
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function expectStatus<T extends { readonly status: string }, S extends T["status"]>(
  result: T,
  status: S
): Extract<T, { readonly status: S }> {
  expect(result.status).toBe(status);
  return result as Extract<T, { readonly status: S }>;
}
