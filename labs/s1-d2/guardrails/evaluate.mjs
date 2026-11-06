// Offline decision pipeline. A matching allowlist string still does not open a socket.

import {
  isAccessorDescriptor,
  ownDataKeys,
  propertyLabel,
  readOwnValue,
  reject,
  rejectProxy,
} from "./allowlist.mjs";
import { validateConfiguration } from "./endpoints.mjs";
import { defaultLabFlags, parseLabFlags } from "./flags.mjs";
import { defaultPermissions, summarizePermissions } from "./permissions.mjs";

const ADAPTER_FIELDS = Object.freeze([
  "calls",
  "connect",
  "followRedirects",
  "lookup",
  "maxRedirects",
  "proxy",
  "resolve",
]);

function baseResult(fields) {
  const permissions = summarizePermissions(defaultPermissions());
  const flags = parseLabFlags(defaultLabFlags());
  return {
    offlineOnly: true,
    reg11bSatisfied: false,
    permissions: permissions.permissions,
    permissionsCode: permissions.code,
    flags: flags.flags,
    flagsCode: flags.code,
    ...fields,
  };
}

function snapshotCalls(calls) {
  const opaque = rejectProxy(calls, "adapter calls");
  if (opaque) return opaque;
  if (!Array.isArray(calls) || Object.getPrototypeOf(calls) !== Array.prototype) {
    return reject("MALFORMED", "adapter calls must be an array");
  }
  const keys = Reflect.ownKeys(calls);
  let length = null;
  for (const key of keys) {
    const description = Object.getOwnPropertyDescriptor(calls, key);
    if (!description || isAccessorDescriptor(description)) {
      return reject("MALFORMED", "adapter calls has an accessor");
    }
    if (key === "length") length = description.value;
  }
  if (typeof length !== "number") return reject("MALFORMED", "adapter calls length is not data");
  if (length !== 0) {
    return reject("CONNECT_INVOKED", "adapter was already invoked; S1-A refuses the configuration");
  }
  for (const key of keys) {
    if (key !== "length") return reject("MALFORMED", "adapter calls has an unexpected property");
  }
  return { ok: true, code: "CALLS_EMPTY", reason: "adapter calls is an empty array", length: 0 };
}

function classifyAdapter(adapter) {
  if (adapter == null) return { ok: true, code: "NO_ADAPTER", reason: "no adapter supplied" };
  if (typeof adapter !== "object" || Array.isArray(adapter)) {
    return reject("MALFORMED", "adapter must be an object");
  }
  const opaque = rejectProxy(adapter, "adapter");
  if (opaque) return opaque;
  if (Object.getPrototypeOf(adapter) !== Object.prototype) {
    return reject("MALFORMED", "adapter prototype is not Object.prototype");
  }
  const inspected = ownDataKeys(adapter);
  if (!inspected.ok) return inspected;
  for (const key of inspected.keys) {
    if (typeof key !== "string" || !ADAPTER_FIELDS.includes(key)) {
      return reject("MALFORMED", `adapter field ${propertyLabel(key)} is not allowed`);
    }
  }

  const snap = {};
  for (const key of ADAPTER_FIELDS) {
    if (!inspected.keys.includes(key)) continue;
    const read = readOwnValue(adapter, key);
    if (!read.ok) return read;
    if (key === "calls") {
      const calls = snapshotCalls(read.value);
      if (!calls.ok) return calls;
      continue;
    }
    if (key === "connect" || key === "resolve" || key === "lookup") {
      snap[key] = typeof read.value === "function" ? "function" : "unexpected";
      continue;
    }
    snap[key] = read.value;
  }

  if ("followRedirects" in snap) {
    if (typeof snap.followRedirects !== "boolean") {
      return reject("MALFORMED", "adapter followRedirects must be boolean");
    }
    if (snap.followRedirects !== false) return reject("REDIRECT", "adapter can follow redirects");
  }
  if ("maxRedirects" in snap) {
    const maxRedirects = snap.maxRedirects;
    if (typeof maxRedirects !== "number" || !Number.isInteger(maxRedirects) || maxRedirects < 0) {
      return reject("MALFORMED", "adapter maxRedirects must be a non-negative integer");
    }
    if (maxRedirects !== 0) return reject("REDIRECT", "adapter can follow redirects");
  }
  if ("proxy" in snap && snap.proxy !== null) return reject("PROXY", "adapter has a proxy");
  if (snap.resolve === "function" || snap.lookup === "function") {
    return reject("DNS_REBINDING", "adapter can resolve DNS");
  }
  if (snap.resolve === "unexpected" || snap.lookup === "unexpected") {
    return reject("MALFORMED", "adapter resolver has an unexpected type");
  }
  if ("connect" in snap && snap.connect !== "function") {
    return reject("MALFORMED", "adapter connect has an unexpected type");
  }
  return { ok: true, code: "ADAPTER_OFFLINE", reason: "adapter was not invoked" };
}

export function evaluateConfiguration(config, adapter) {
  const adapterDecision = classifyAdapter(adapter);
  const decision = adapterDecision.ok ? validateConfiguration(config) : adapterDecision;
  if (!decision.ok) {
    return baseResult({
      verdict: "rejected",
      code: decision.code,
      reason: decision.reason,
      connectInvoked: decision.code === "CONNECT_INVOKED",
    });
  }
  return baseResult({
    verdict: "allowlisted",
    code: "ALLOWLISTED_OFFLINE",
    reason: "strings match the offline allowlist; no connection is authorized; REG-11B is not satisfied",
    connectInvoked: false,
  });
}
