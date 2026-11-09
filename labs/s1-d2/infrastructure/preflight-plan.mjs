// Pure check of an inert preparation plan. It does not inspect or change the host.

import { ownDataKeys, propertyLabel, readOwnValue, reject, rejectProxy } from "../guardrails/allowlist.mjs";
import { PENDING } from "./decisions.mjs";

export const PLAN_FIELDS = Object.freeze([
  "applied",
  "executed",
  "hostMutation",
  "namespaceBackend",
  "networkPolicyBackend",
  "confinementBackend",
  "brokerApi",
  "firewallChange",
  "cgroupChange",
  "kernelChange",
  "exteriorRoute",
  "dns",
  "listeners",
  "peers",
  "scriptsExecutable",
]);

function requireEmptyList(value, label) {
  const opaque = rejectProxy(value, label);
  if (opaque) return opaque;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return reject("MALFORMED", `${label} must be an array`);
  }
  if (value.length !== 0) return reject("MALFORMED", `${label} must be empty`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "length") {
    return reject("UNKNOWN_FIELD", `${label} has an extra property`);
  }
  return null;
}

export function validatePreflightPlan(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return reject("MALFORMED", "plan must be a plain object");
  }
  const opaque = rejectProxy(input, "plan");
  if (opaque) return opaque;
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return reject("MALFORMED", "plan prototype is not Object.prototype");
  }
  const inspected = ownDataKeys(input);
  if (!inspected.ok) return inspected;
  const present = new Set(inspected.keys);
  for (const key of PLAN_FIELDS) {
    if (!present.has(key)) return reject("INCOMPLETE", `plan is missing ${key}`);
  }
  for (const key of inspected.keys) {
    if (typeof key !== "string" || !PLAN_FIELDS.includes(key)) {
      return reject("UNKNOWN_FIELD", `plan field ${propertyLabel(key)} is not allowed`);
    }
  }
  const values = {};
  for (const key of PLAN_FIELDS) {
    const read = readOwnValue(input, key);
    if (!read.ok) return read;
    values[key] = read.value;
  }

  if (values.applied !== false) return reject("APPLIED", "plan applied must be false");
  if (values.executed !== false) return reject("EXECUTED", "plan executed must be false");
  if (values.scriptsExecutable !== false) {
    return reject("EXECUTABLE", "plan scriptsExecutable must be false");
  }
  const literals = [
    ["hostMutation", "FORBIDDEN"],
    ["namespaceBackend", PENDING.backend],
    ["networkPolicyBackend", PENDING.backend],
    ["confinementBackend", PENDING.backend],
    ["brokerApi", PENDING.broker],
    ["firewallChange", "NONE"],
    ["cgroupChange", "NONE"],
    ["kernelChange", "NONE"],
    ["exteriorRoute", "ABSENT_IN_PLAN"],
    ["dns", "BLOCKED_IN_PLAN"],
  ];
  for (const [key, expected] of literals) {
    if (values[key] !== expected) {
      return reject("DECISION_PENDING", `${key} must be ${expected}`);
    }
  }
  const listeners = requireEmptyList(values.listeners, "listeners");
  if (listeners) return listeners;
  const peers = requireEmptyList(values.peers, "peers");
  if (peers) return peers;

  return Object.freeze({
    ok: true,
    code: "PLAN_INERT",
    reason: "plan is inert; nothing was applied to the host",
    applied: false,
    executed: false,
  });
}
