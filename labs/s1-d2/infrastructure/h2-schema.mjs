// H-2. Closed offline descriptor. A well-formed object is not a live grant.
// Omitted fields are rejected. They are not evidence that a control exists.

import {
  LAB_ALLOWLIST,
  ownDataKeys,
  propertyLabel,
  readOwnValue,
  reject,
  rejectProxy,
} from "../guardrails/allowlist.mjs";
import { LAB_FLAGS } from "../guardrails/flags.mjs";
import { CAPABILITIES } from "../guardrails/permissions.mjs";
import { PENDING, SCHEMA_VERSION } from "./decisions.mjs";

export const DESCRIPTOR_FIELDS = Object.freeze([
  "schemaVersion",
  "role",
  "endpoint",
  "chain",
  "datadir",
  "binaryDir",
  "followRedirects",
  "maxRedirects",
  "proxy",
  "proxyFromEnv",
  "env",
  "resolve",
  "lookup",
  "addressFamily",
  "literalAddress",
  "autoRetry",
  "maxRetries",
  "fallbackEndpoints",
  "allowWebSocket",
  "allowUpgrade",
  "permissions",
  "flags",
  "backendDecision",
  "binarySha256",
  "datadirMeasurement",
  "genesisDecision",
  "brokerDecision",
  "operationalAuthorization",
]);

function readClosed(input, label, requiredKeys) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return reject("MALFORMED", `${label} must be a plain object`);
  }
  const opaque = rejectProxy(input, label);
  if (opaque) return opaque;
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return reject("MALFORMED", `${label} prototype is not Object.prototype`);
  }
  const inspected = ownDataKeys(input);
  if (!inspected.ok) return inspected;
  const present = new Set(inspected.keys);
  for (const key of requiredKeys) {
    if (!present.has(key)) return reject("INCOMPLETE", `${label} is missing ${key}`);
  }
  for (const key of inspected.keys) {
    if (typeof key !== "string" || !requiredKeys.includes(key)) {
      return reject("UNKNOWN_FIELD", `${label} field ${propertyLabel(key)} is not allowed`);
    }
  }
  const values = {};
  for (const key of requiredKeys) {
    const read = readOwnValue(input, key);
    if (!read.ok) return read;
    values[key] = read.value;
  }
  return { ok: true, code: "CLOSED", reason: `${label} has the required data fields`, values };
}

function requireBoolean(value, label, expected) {
  if (typeof value !== "boolean") return reject("MALFORMED", `${label} must be boolean`);
  if (value !== expected) return reject("MALFORMED", `${label} must be ${expected}`);
  return null;
}

function requireLiteral(value, label, expected, code = "MALFORMED") {
  if (value !== expected) return reject(code, `${label} must be ${expected}`);
  return null;
}

function requireEmptyObject(value, label) {
  const closed = readClosed(value, label, []);
  if (!closed.ok) return closed;
  return null;
}

function requireEmptyArray(value, label) {
  const opaque = rejectProxy(value, label);
  if (opaque) return opaque;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return reject("MALFORMED", `${label} must be an array`);
  }
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const description = Object.getOwnPropertyDescriptor(value, key);
    if (!description || description.get || description.set) {
      return reject("MALFORMED", `${label} has an accessor`);
    }
  }
  if (value.length !== 0) return reject("MALFORMED", `${label} must be empty`);
  if (keys.length !== 1) return reject("UNKNOWN_FIELD", `${label} has an extra property`);
  return null;
}

function requireAllFalse(value, label, keys, code) {
  const closed = readClosed(value, label, keys);
  if (!closed.ok) return closed;
  for (const key of keys) {
    if (typeof closed.values[key] !== "boolean") {
      return reject("MALFORMED", `${label}.${key} must be boolean`);
    }
    if (closed.values[key] !== false) return reject(code, `${label}.${key} must stay false`);
  }
  return null;
}

function denied(code, reason) {
  return {
    ...reject(code, reason),
    permission: PENDING.authorization,
    operational: false,
  };
}

export function validateClosedSchema(input) {
  const closed = readClosed(input, "descriptor", DESCRIPTOR_FIELDS);
  if (!closed.ok) return denied(closed.code, closed.reason);
  const value = closed.values;

  const version = requireLiteral(value.schemaVersion, "schemaVersion", SCHEMA_VERSION);
  if (version) return denied(version.code, version.reason);
  if (value.role !== "rpc" && value.role !== "chronik") {
    return denied("ROLE", "role must be rpc or chronik");
  }
  if (value.endpoint !== LAB_ALLOWLIST.endpoints[value.role]) {
    return denied("ENDPOINT", "endpoint is not the candidate URL for the declared role");
  }
  const chain = requireLiteral(value.chain, "chain", LAB_ALLOWLIST.chain, "CHAIN");
  if (chain) return denied(chain.code, chain.reason);
  const datadir = requireLiteral(value.datadir, "datadir", LAB_ALLOWLIST.datadir, "DATADIR");
  if (datadir) return denied(datadir.code, datadir.reason);
  const binaryDir = requireLiteral(value.binaryDir, "binaryDir", LAB_ALLOWLIST.binaryDir, "BINARY");
  if (binaryDir) return denied(binaryDir.code, binaryDir.reason);

  const redirects = requireBoolean(value.followRedirects, "followRedirects", false);
  if (redirects) return denied("REDIRECT", redirects.reason);
  if (typeof value.maxRedirects !== "number" || value.maxRedirects !== 0) {
    return denied("REDIRECT", "maxRedirects must be the number 0");
  }
  if (value.proxy !== null) return denied("PROXY", "proxy must be null");
  const proxyFromEnv = requireBoolean(value.proxyFromEnv, "proxyFromEnv", false);
  if (proxyFromEnv) return denied("PROXY", proxyFromEnv.reason);
  const env = requireEmptyObject(value.env, "env");
  if (env) return denied(env.code, env.reason);
  if (value.resolve !== null) return denied("DNS_REBINDING", "resolve must be null");
  if (value.lookup !== null) return denied("DNS_REBINDING", "lookup must be null");
  const family = requireLiteral(value.addressFamily, "addressFamily", "IPv4");
  if (family) return denied(family.code, family.reason);
  const literal = requireLiteral(value.literalAddress, "literalAddress", "127.0.0.1");
  if (literal) return denied(literal.code, literal.reason);
  const autoRetry = requireBoolean(value.autoRetry, "autoRetry", false);
  if (autoRetry) return denied(autoRetry.code, autoRetry.reason);
  if (typeof value.maxRetries !== "number" || value.maxRetries !== 0) {
    return denied("MALFORMED", "maxRetries must be the number 0");
  }
  const fallbacks = requireEmptyArray(value.fallbackEndpoints, "fallbackEndpoints");
  if (fallbacks) return denied(fallbacks.code, fallbacks.reason);
  const websocket = requireBoolean(value.allowWebSocket, "allowWebSocket", false);
  if (websocket) return denied(websocket.code, websocket.reason);
  const upgrade = requireBoolean(value.allowUpgrade, "allowUpgrade", false);
  if (upgrade) return denied(upgrade.code, upgrade.reason);

  const permissions = requireAllFalse(value.permissions, "permissions", CAPABILITIES, "PERMISSION");
  if (permissions) return denied(permissions.code, permissions.reason);
  const flags = requireAllFalse(value.flags, "flags", LAB_FLAGS, "FLAG");
  if (flags) return denied(flags.code, flags.reason);

  const pendingChecks = [
    ["backendDecision", PENDING.backend, "DECISION_PENDING"],
    ["binarySha256", PENDING.binarySha256, "DECISION_PENDING"],
    ["datadirMeasurement", PENDING.datadirMeasurement, "DECISION_PENDING"],
    ["genesisDecision", PENDING.genesis, "DECISION_PENDING"],
    ["brokerDecision", PENDING.broker, "DECISION_PENDING"],
    ["operationalAuthorization", PENDING.authorization, "NOT_AUTHORIZED"],
  ];
  for (const [key, expected, code] of pendingChecks) {
    const decision = requireLiteral(value[key], key, expected, code);
    if (decision) return denied(decision.code, decision.reason);
  }

  return Object.freeze({
    ok: true,
    code: "SCHEMA_CLOSED_OFFLINE",
    reason: "descriptor is closed and offline; it grants no connection",
    permission: PENDING.authorization,
    operational: false,
    pending: Object.freeze([
      "D-02",
      "D-03",
      "D-04",
      "D-05",
      "D-06",
    ]),
  });
}
