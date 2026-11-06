// Pure endpoint classifier. It does not resolve names and does not open sockets.

import {
  CONFIG_FIELDS,
  LAB_ALLOWLIST,
  PROXY_ENV_KEYS,
  ownDataKeys,
  propertyLabel,
  readOwnValue,
  reject,
  rejectProxy,
} from "./allowlist.mjs";

const LOCALHOST_ALIASES = new Set([
  "ip6-localhost",
  "ip6-loopback",
  "localhost",
  "localhost.",
  "localhost.localdomain",
  "localhost.localdomain.",
  "loopback",
]);

const PRODUCTIVE_PORTS = new Set([8331, 8332, 8333]);
const LAB_PORTS = new Set([19442, 19443]);

function hasForbiddenChar(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 32 || code === 127 || value[index] === "\\") return true;
  }
  return false;
}

function isPrivateIPv4(nums) {
  const a = nums[0];
  const b = nums[1];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function classifyHost(host) {
  if (host === "0.0.0.0" || host === "0" || host === "*") {
    return reject("WILDCARD", `host ${host} is a wildcard`);
  }
  if (LOCALHOST_ALIASES.has(host.toLowerCase())) {
    return reject("LOCALHOST_ALIAS", `host ${host} is not the literal 127.0.0.1`);
  }
  if (host.includes("%")) {
    return reject("NORMALIZATION", "percent-encoding is not accepted");
  }
  if (host.endsWith(".")) {
    return reject("NORMALIZATION", "a trailing dot is not accepted");
  }
  if (host.includes(":")) {
    return reject("IPV6", `host ${host} is an IPv6 literal`);
  }
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) {
    return reject("NORMALIZATION", `numeric host ${host} is not the literal 127.0.0.1`);
  }
  if (/^\d+(\.\d+){0,3}$/.test(host)) {
    const parts = host.split(".");
    if (parts.some((part) => part.length > 1 && part.startsWith("0"))) {
      return reject("NORMALIZATION", "leading zeros in an IPv4 octet are not accepted");
    }
    if (parts.length !== 4) {
      return reject("NORMALIZATION", "short IPv4 forms are not accepted");
    }
    const nums = parts.map((part) => Number(part));
    if (nums.some((num) => !Number.isInteger(num) || num > 255)) {
      return reject("MALFORMED", "an IPv4 octet is out of range");
    }
    if (host === "127.0.0.1") return null;
    if (nums[0] === 0) return reject("WILDCARD", `host ${host} is in 0.0.0.0/8`);
    if (isPrivateIPv4(nums)) {
      return reject("PRIVATE_ADDRESS", `host ${host} is a private or link-local address`);
    }
    if (nums[0] === 127) {
      return reject("LOCALHOST_ALIAS", `host ${host} is a loopback address other than 127.0.0.1`);
    }
    return reject("PUBLIC_ADDRESS", `host ${host} is not the allowlisted literal`);
  }
  if (/[a-z]/i.test(host)) {
    return reject("DNS_REBINDING", `host ${host} would require DNS resolution`);
  }
  return reject("HOST", `host ${host} is not allowlisted`);
}

function classifyRejectedEndpoint(endpoint) {
  if (hasForbiddenChar(endpoint)) {
    return reject("MALFORMED", "whitespace, a control character, or a backslash");
  }
  if (endpoint.includes("@")) {
    return reject("CREDENTIALS", "URL userinfo is forbidden");
  }
  if (!endpoint.startsWith("http://")) {
    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(endpoint);
    if (!scheme) return reject("SCHEME", "missing or invalid scheme");
    return reject("SCHEME", `scheme ${scheme[1]} is not allowed`);
  }

  const rest = endpoint.slice("http://".length);
  if (rest.length === 0 || rest.startsWith("/")) {
    return reject("MALFORMED", "empty authority");
  }
  if (rest.includes("?") || rest.includes("#")) {
    return reject("MALFORMED", "a query or fragment is forbidden");
  }
  if (rest.includes("/")) return reject("PATH", "a URL path is forbidden");
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    if (end < 0) return reject("MALFORMED", "unclosed IPv6 bracket");
    const inner = rest.slice(1, end);
    if (/ffff/i.test(inner)) {
      return reject("IPV4_MAPPED", `IPv4-mapped IPv6 ${inner} is not accepted`);
    }
    return reject("IPV6", `IPv6 ${inner || "empty"} is not accepted`);
  }

  const colon = rest.lastIndexOf(":");
  if (colon <= 0) return reject("PORT", "missing port");
  const host = rest.slice(0, colon);
  const port = rest.slice(colon + 1);
  if (host.length === 0 || port.length === 0) {
    return reject("MALFORMED", "empty host or port");
  }
  if (!/^[0-9]+$/.test(port)) return reject("PORT", "port is not decimal");
  if (port.length > 1 && port.startsWith("0")) {
    return reject("NORMALIZATION", "a leading zero in the port is not accepted");
  }
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return reject("PORT", "port is out of range");
  }
  if (PRODUCTIVE_PORTS.has(portNum)) {
    return reject("PRODUCTIVE_PORT", `port ${port} is a productive port`);
  }
  const hostDecision = classifyHost(host);
  if (hostDecision) return hostDecision;
  if (!LAB_PORTS.has(portNum)) {
    return reject("PORT", `port ${port} is not an allowlisted lab port`);
  }
  return reject("NORMALIZATION", "endpoint is not an exact allowlisted URL");
}

export function classifyEndpoint(endpoint, role) {
  if (typeof endpoint !== "string" || typeof role !== "string") {
    return reject("MALFORMED", "endpoint and role must be strings");
  }
  if (endpoint.length === 0 || role.length === 0) {
    return reject("INCOMPLETE", "endpoint or role is empty");
  }
  if (role !== "rpc" && role !== "chronik") {
    return reject("ROLE", `role ${role} is not rpc or chronik`);
  }
  if (endpoint === LAB_ALLOWLIST.endpoints[role]) {
    return {
      ok: true,
      code: "ALLOWLISTED_ENDPOINT",
      reason: "exact offline allowlist URL",
    };
  }
  if (
    endpoint === LAB_ALLOWLIST.endpoints.rpc ||
    endpoint === LAB_ALLOWLIST.endpoints.chronik
  ) {
    return reject("ROLE", "endpoint does not match the declared role");
  }
  return classifyRejectedEndpoint(endpoint);
}

function classifyEnv(env) {
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    return reject("MALFORMED", "env must be a plain object");
  }
  const opaque = rejectProxy(env, "env");
  if (opaque) return opaque;
  if (Object.getPrototypeOf(env) !== Object.prototype) {
    return reject("MALFORMED", "env prototype is not Object.prototype");
  }
  const inspected = ownDataKeys(env);
  if (!inspected.ok) return inspected;
  if (inspected.keys.length === 0) {
    return { ok: true, code: "NO_PROXY_ENV", reason: "no proxy environment entries" };
  }
  const proxyKeys = new Set(PROXY_ENV_KEYS);
  for (const key of inspected.keys) {
    if (typeof key === "string" && (proxyKeys.has(key) || /proxy/i.test(key))) {
      return reject("PROXY_ENV", `environment entry ${key} can redirect traffic`);
    }
  }
  return reject(
    "UNKNOWN_FIELD",
    `environment entry ${propertyLabel(inspected.keys[0])} is not allowed`,
  );
}

function classifyDatadir(value) {
  if (typeof value !== "string" || value.length === 0) {
    return reject("DATADIR", "datadir is missing");
  }
  if (value === LAB_ALLOWLIST.datadir) {
    return { ok: true, code: "ALLOWLISTED_DATADIR", reason: "exact isolated datadir string" };
  }
  if (value.includes("..") || value.includes("\\") || value.includes("\0")) {
    return reject("DATADIR", "datadir contains traversal or a disallowed separator");
  }
  const parts = value.split("/");
  if (
    value === "/home/xolosarmy/.bitcoin" ||
    value.startsWith("/home/xolosarmy/.bitcoin/") ||
    value === "~/.bitcoin" ||
    value.startsWith("~/.bitcoin") ||
    parts.includes(".bitcoin")
  ) {
    return reject("DATADIR", "productive datadir");
  }
  return reject("DATADIR", "datadir is not the isolated regtest path");
}

function classifyBinary(value) {
  if (typeof value !== "string" || value.length === 0) {
    return reject("BINARY", "binary directory is missing");
  }
  if (value === LAB_ALLOWLIST.binaryDir) {
    return { ok: true, code: "ALLOWLISTED_BINARY", reason: "exact authorized binary directory" };
  }
  if (value.includes("..") || value.includes("\\") || value.includes("\0")) {
    return reject("BINARY", "binary path contains traversal or a disallowed separator");
  }
  return reject("BINARY", "binary path is not the authorized directory");
}

export function validateConfiguration(config) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return reject("MALFORMED", "configuration must be a plain object");
  }
  const opaque = rejectProxy(config, "configuration");
  if (opaque) return opaque;
  if (Object.getPrototypeOf(config) !== Object.prototype) {
    return reject("MALFORMED", "configuration prototype is not Object.prototype");
  }
  const inspected = ownDataKeys(config);
  if (!inspected.ok) return inspected;
  for (const key of inspected.keys) {
    if (typeof key !== "string" || !CONFIG_FIELDS.includes(key)) {
      return reject("UNKNOWN_FIELD", `field ${propertyLabel(key)} is not allowed`);
    }
  }
  const snap = {};
  for (const key of CONFIG_FIELDS) {
    const read = readOwnValue(config, key);
    if (!read.ok) return read;
    snap[key] = read.value;
  }
  if (snap.followRedirects !== false) {
    return reject("REDIRECT", "followRedirects must be false");
  }
  if (snap.proxy !== null) return reject("PROXY", "proxy must be null");
  const envDecision = classifyEnv(snap.env);
  if (!envDecision.ok) return envDecision;
  if (snap.chain !== LAB_ALLOWLIST.chain) {
    if (typeof snap.chain !== "string" || snap.chain.trim() === "") {
      return reject("CHAIN", "chain is empty or not a string");
    }
    return reject("CHAIN", `chain ${JSON.stringify(snap.chain)} is not regtest`);
  }
  const datadirDecision = classifyDatadir(snap.datadir);
  if (!datadirDecision.ok) return datadirDecision;
  const binaryDecision = classifyBinary(snap.binaryDir);
  if (!binaryDecision.ok) return binaryDecision;
  return classifyEndpoint(snap.endpoint, snap.role);
}
