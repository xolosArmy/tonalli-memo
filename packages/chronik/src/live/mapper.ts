import type { ChronikLiveBlockEvent, ChronikLiveEvent, ChronikLiveTransactionEvent } from "./types.js";

export const TM0_LOKAD_ID = "544d307c";
export const TM1_DRAFT_02_LOKAD_ID = "544d4d00";
export const TONALLI_DISCOVERY_LOKAD_IDS = [TM0_LOKAD_ID, TM1_DRAFT_02_LOKAD_ID] as const;

/** @deprecated Prefer TM0_LOKAD_ID for protocol-specific use. */
export const TONALLI_MEMO_LOKAD_ID = TM0_LOKAD_ID;

export function mapChronikLiveMessage(message: unknown): ChronikLiveEvent | null {
  if (!isRecord(message) || typeof message.type !== "string") {
    return null;
  }

  if (message.type === "Tx") {
    if (typeof message.txid !== "string" || typeof message.msgType !== "string") {
      return null;
    }
    const event = mapTxMessageType(message.msgType);
    return event === null ? null : { type: "transaction", event, txid: message.txid };
  }

  if (message.type === "Block") {
    if (
      typeof message.blockHash !== "string" ||
      typeof message.blockHeight !== "number" ||
      typeof message.blockTimestamp !== "number" ||
      typeof message.msgType !== "string"
    ) {
      return null;
    }
    const event = mapBlockMessageType(message.msgType);
    return event === null
      ? null
      : {
          type: "block",
          event,
          blockHash: message.blockHash,
          blockHeight: message.blockHeight,
          blockTimestamp: message.blockTimestamp
        };
  }

  return null;
}

function mapTxMessageType(msgType: string): ChronikLiveTransactionEvent | null {
  switch (msgType) {
    case "TX_ADDED_TO_MEMPOOL":
      return "added-to-mempool";
    case "TX_REMOVED_FROM_MEMPOOL":
      return "removed-from-mempool";
    case "TX_CONFIRMED":
      return "confirmed";
    case "TX_FINALIZED":
      return "finalized";
    case "TX_INVALIDATED":
      return "invalidated";
    default:
      return null;
  }
}

function mapBlockMessageType(msgType: string): ChronikLiveBlockEvent | null {
  switch (msgType) {
    case "BLK_CONNECTED":
      return "connected";
    case "BLK_DISCONNECTED":
      return "disconnected";
    case "BLK_FINALIZED":
      return "finalized";
    case "BLK_INVALIDATED":
      return "invalidated";
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
