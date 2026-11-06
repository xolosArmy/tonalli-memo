// Capability decisions only. This module cannot assemble, sign, broadcast, or deploy.

import { readOwnValue, reject } from "./allowlist.mjs";

export const CAPABILITIES = Object.freeze([
  "read",
  "assemble",
  "sign",
  "broadcast",
  "deploy",
]);

export function defaultPermissions() {
  const out = {};
  for (const capability of CAPABILITIES) out[capability] = false;
  return Object.freeze(out);
}

export function parsePermissions(input) {
  const denied = defaultPermissions();
  if (input == null) {
    return { ...reject("MISSING", "permissions are absent"), permissions: denied };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ...reject("MALFORMED", "permissions must be a plain object"), permissions: denied };
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return {
      ...reject("MALFORMED", "permissions prototype is not Object.prototype"),
      permissions: denied,
    };
  }
  const keys = Object.keys(input);
  for (const key of keys) {
    if (!CAPABILITIES.includes(key)) {
      return {
        ...reject("UNKNOWN_CAPABILITY", `unknown capability ${key}`),
        permissions: denied,
      };
    }
  }
  const snapshot = {};
  for (const capability of CAPABILITIES) {
    const read = readOwnValue(input, capability);
    if (!read.ok) {
      const reason = read.code === "INCOMPLETE"
        ? `missing capability ${capability}`
        : `capability ${capability} is an accessor`;
      return { ...reject(read.code, reason), permissions: denied };
    }
    if (typeof read.value !== "boolean") {
      return {
        ...reject("MALFORMED", `capability ${capability} is not boolean`),
        permissions: denied,
      };
    }
    snapshot[capability] = read.value;
  }
  return {
    ok: true,
    code: "PARSED",
    reason: "permissions parsed",
    permissions: Object.freeze(snapshot),
  };
}

export function grant(permissions, capability) {
  const parsed = parsePermissions(permissions);
  if (!parsed.ok) return parsed;
  if (!CAPABILITIES.includes(capability)) {
    return {
      ...reject("UNKNOWN_CAPABILITY", `unknown capability ${capability}`),
      permissions: parsed.permissions,
    };
  }
  const next = { ...parsed.permissions, [capability]: true };
  return {
    ok: true,
    code: "GRANTED_ONE",
    reason: `granted ${capability} without granting any other capability`,
    permissions: Object.freeze(next),
  };
}

export function allows(permissions, capability) {
  const parsed = parsePermissions(permissions);
  if (!parsed.ok) return false;
  if (!CAPABILITIES.includes(capability)) return false;
  return parsed.permissions[capability] === true;
}

export function summarizePermissions(permissions) {
  const parsed = parsePermissions(permissions);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      reason: parsed.reason,
      allDenied: true,
      enabled: [],
      permissions: parsed.permissions ?? defaultPermissions(),
    };
  }
  const enabled = CAPABILITIES.filter((capability) => parsed.permissions[capability] === true);
  return {
    ok: true,
    code: enabled.length === 0 ? "PERMISSIONS_DENIED" : "PERMISSIONS_PARTIAL",
    reason: enabled.length === 0 ? "all capabilities are denied" : `enabled: ${enabled.join(",")}`,
    allDenied: enabled.length === 0,
    enabled,
    permissions: parsed.permissions,
  };
}
