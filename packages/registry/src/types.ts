import type { ProfileCode } from "@tonalli-memo/protocol";

export interface AuthorizedAddress {
  readonly address: string;
  readonly validFromHeight?: number;
  readonly validUntilHeight?: number;
  readonly label?: string;
}

export interface ProfileRegistryEntry {
  readonly code: ProfileCode;
  readonly alias: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly authorizedAddresses: readonly AuthorizedAddress[];
}

export interface RegistryDocument {
  readonly schemaVersion: 1;
  readonly network: "ecash-mainnet";
  readonly profiles: Readonly<Record<ProfileCode, ProfileRegistryEntry>>;
}

export type AuthorizationContext =
  | {
      readonly chainStatus: "confirmed";
      readonly blockHeight: number;
    }
  | {
      readonly chainStatus: "unconfirmed";
      readonly tipHeight: number;
    };

export type AuthorizationReason = "AUTHORIZED" | "ADDRESS_NOT_LISTED" | "NOT_YET_VALID" | "EXPIRED";

export interface AuthorizationDecision {
  readonly authorized: boolean;
  readonly reason: AuthorizationReason;
  readonly evaluationHeight: number;
}
