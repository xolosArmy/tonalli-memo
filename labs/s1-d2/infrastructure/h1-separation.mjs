// H-1. Offline classification never becomes a connection permission.
// This module does not call adapter.connect and does not open a socket.

import { reject } from "../guardrails/allowlist.mjs";
import { evaluateConfiguration } from "../guardrails/evaluate.mjs";
import { PENDING } from "./decisions.mjs";

export function separateOfflineClassification(config, adapter) {
  const classification = evaluateConfiguration(config, adapter);
  return Object.freeze({
    classificationCode: classification.code,
    classificationVerdict: classification.verdict,
    offlineOnly: classification.offlineOnly === true,
    permission: PENDING.authorization,
    connect: "DENY",
    io: "DENY",
    reg11b: "NOT_RUN",
    backend: PENDING.backend,
    broker: PENDING.broker,
    reason:
      "ALLOWLISTED_OFFLINE classifies strings. It does not grant a connection, a broker, or a namespace.",
  });
}

export function refuseConnectionGrant(claim) {
  return {
    ...reject(
      "GRANT_REFUSED",
      "stage 1 cannot mint or accept a connection grant while D-06 is pending",
    ),
    permission: PENDING.authorization,
    connect: "DENY",
    claimIgnored: claim !== undefined,
  };
}
