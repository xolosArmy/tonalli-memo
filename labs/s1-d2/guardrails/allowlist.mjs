// S1-A offline allowlist. These strings are not permission to connect.

import { types } from "node:util";

export const AUTHORIZED_MAIN_SHA = "228d1f036643ca9be8ba85e91f8200536f3242da";

export const LAB_ALLOWLIST = Object.freeze({
  chain: "regtest",
  datadir: "/home/xolosarmy/xolosarmy-regtest/data",
  binaryDir: "/home/xolosarmy/bitcoin-abc-0.34.2/bin",
  endpoints: Object.freeze({
    rpc: "http://127.0.0.1:19443",
    chronik: "http://127.0.0.1:19442",
  }),
});

export const CONFIG_FIELDS = Object.freeze([
  "role",
  "endpoint",
  "chain",
  "datadir",
  "binaryDir",
  "followRedirects",
  "proxy",
  "env",
]);

export const PROXY_ENV_KEYS = Object.freeze([
  "ALL_PROXY",
  "all_proxy",
  "FTP_PROXY",
  "ftp_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "npm_config_https_proxy",
  "npm_config_proxy",
  "SOCKS_PROXY",
  "socks_proxy",
  "WS_PROXY",
  "WSS_PROXY",
]);

export function reject(code, reason) {
  return { ok: false, code, reason };
}

export function propertyLabel(key) {
  return typeof key === "symbol" ? "symbol" : key;
}

export function rejectProxy(input, label) {
  if (types.isProxy(input)) return reject("MALFORMED", `${label} is a proxy`);
  return null;
}

export function isAccessorDescriptor(description) {
  return description != null && ("get" in description || "set" in description);
}

export function readOwnValue(input, key) {
  const opaque = rejectProxy(input, `field ${propertyLabel(key)}`);
  if (opaque) return opaque;
  const description = Object.getOwnPropertyDescriptor(input, key);
  if (!description) return reject("INCOMPLETE", `field ${key} is missing`);
  if (isAccessorDescriptor(description)) {
    return reject("MALFORMED", `field ${propertyLabel(key)} is an accessor`);
  }
  return { ok: true, code: "DATA_PROPERTY", reason: "data property", value: description.value };
}

export function ownDataKeys(input) {
  const opaque = rejectProxy(input, "object");
  if (opaque) return opaque;
  const keys = Reflect.ownKeys(input);
  for (const key of keys) {
    const description = Object.getOwnPropertyDescriptor(input, key);
    if (!description || isAccessorDescriptor(description)) {
      return reject("MALFORMED", `field ${propertyLabel(key)} is an accessor`);
    }
  }
  return { ok: true, code: "OWN_KEYS", reason: "own data properties", keys };
}
