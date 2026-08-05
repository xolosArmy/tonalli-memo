import { PROFILE_ALIASES, type ProfileCode } from "@tonalli-memo/protocol";
import type { FeedItem, StoredVerification, TransactionSummary } from "./api/types";

const TXID_PREFIX_LENGTH = 10;
const TXID_SUFFIX_LENGTH = 8;
const HASH160_PREFIX_LENGTH = 8;
const HASH160_SUFFIX_LENGTH = 8;

export function abbreviateTxid(txid: string): string {
  return `${txid.slice(0, TXID_PREFIX_LENGTH)}...${txid.slice(-TXID_SUFFIX_LENGTH)}`;
}

export function abbreviateHash160(hashHex: string): string {
  return `${hashHex.slice(0, HASH160_PREFIX_LENGTH)}…${hashHex.slice(-HASH160_SUFFIX_LENGTH)}`;
}

export function sighashLabel(value: 65 | 193): string {
  return `0x${value.toString(16).padStart(2, "0")} (${value})`;
}

export function profileAlias(profileCode: string | null): string {
  if (profileCode !== null && isKnownProfileCode(profileCode)) {
    return PROFILE_ALIASES[profileCode];
  }
  return "Perfil desconocido";
}

export function displayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "No disponible";
  }
  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }
  return String(value);
}

export function formatUnixSeconds(seconds: number | null): string {
  if (seconds === null) {
    return "No disponible";
  }
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(seconds * 1000));
}

export function timestampForFeedItem(item: FeedItem): number | null {
  return item.transaction.blockTimestamp ?? item.transaction.firstSeenAt ?? item.verification.lastVerifiedAt;
}

export function statusLabel(status: string): string {
  return status === "VERIFIED" ? "VERIFIED" : status;
}

export function chainStatusLabel(status: TransactionSummary["chainStatus"]): string {
  return status === "confirmed" ? "Confirmada" : "Sin confirmar";
}

export function payloadText(verification: StoredVerification | null): string {
  return verification?.payload ?? "No disponible";
}

function isKnownProfileCode(value: string): value is ProfileCode {
  return Object.hasOwn(PROFILE_ALIASES, value);
}
