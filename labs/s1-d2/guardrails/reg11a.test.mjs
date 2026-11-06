import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AUTHORIZED_MAIN_SHA, LAB_ALLOWLIST } from "./allowlist.mjs";
import { allowlistedConfig, safeAdapter } from "./fixtures.mjs";
import { defaultLabFlags, LAB_FLAGS, parseLabFlags } from "./flags.mjs";
import {
  allows,
  CAPABILITIES,
  defaultPermissions,
  grant,
  parsePermissions,
} from "./permissions.mjs";
import { scanText } from "./secrets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const require = createRequire(import.meta.url);
const net = require("node:net");
const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");

const networkCalls = [];
function trip(name) {
  return () => {
    networkCalls.push(name);
    throw new Error(`S1-A forbids ${name}`);
  };
}
net.connect = trip("net.connect");
net.createConnection = trip("net.createConnection");
dns.lookup = trip("dns.lookup");
dns.resolve = trip("dns.resolve");
dns.resolve4 = trip("dns.resolve4");
http.request = trip("http.request");
http.get = trip("http.get");
https.request = trip("https.request");
https.get = trip("https.get");

const { evaluateConfiguration } = await import("./evaluate.mjs");
const { validateConfiguration } = await import("./endpoints.mjs");

const EXPECTED_FILES = [
  "labs/s1-d2/README.md",
  "labs/s1-d2/guardrails/allowlist.mjs",
  "labs/s1-d2/guardrails/endpoints.mjs",
  "labs/s1-d2/guardrails/evaluate.mjs",
  "labs/s1-d2/guardrails/fixtures.mjs",
  "labs/s1-d2/guardrails/flags.mjs",
  "labs/s1-d2/guardrails/permissions.mjs",
  "labs/s1-d2/guardrails/reg11a.test.mjs",
  "labs/s1-d2/guardrails/secrets.mjs",
];

function patched(patch) {
  return { ...allowlistedConfig("rpc"), ...patch };
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) out.push(...walk(absolute));
    else out.push(absolute);
  }
  return out;
}

const negativeCases = [
  ["mainnet-https", { endpoint: "https://example.invalid:19443" }, "SCHEME"],
  ["testnet-name", { endpoint: "http://testnet.invalid:19443" }, "DNS_REBINDING"],
  ["empty-endpoint", { endpoint: "" }, "INCOMPLETE"],
  ["empty-chain", { chain: "" }, "CHAIN"],
  ["blank-chain", { chain: "   " }, "CHAIN"],
  ["chain-main", { chain: "main" }, "CHAIN"],
  ["chain-mainnet", { chain: "mainnet" }, "CHAIN"],
  ["chain-test", { chain: "test" }, "CHAIN"],
  ["chain-testnet", { chain: "testnet" }, "CHAIN"],
  ["chain-signet", { chain: "signet" }, "CHAIN"],
  ["chain-case", { chain: "Regtest" }, "CHAIN"],
  ["chain-padded", { chain: "regtest " }, "CHAIN"],
  ["chain-number", { chain: 1 }, "CHAIN"],
  ["port-8331", { endpoint: "http://127.0.0.1:8331" }, "PRODUCTIVE_PORT"],
  ["port-8332", { endpoint: "http://127.0.0.1:8332" }, "PRODUCTIVE_PORT"],
  ["port-8333", { endpoint: "http://127.0.0.1:8333" }, "PRODUCTIVE_PORT"],
  ["observed-8332", { endpoint: "http://10.10.0.2:8332" }, "PRODUCTIVE_PORT"],
  ["private-10", { endpoint: "http://10.10.0.2:19443" }, "PRIVATE_ADDRESS"],
  ["private-192", { endpoint: "http://192.168.1.20:19443" }, "PRIVATE_ADDRESS"],
  ["private-172", { endpoint: "http://172.16.5.1:19443" }, "PRIVATE_ADDRESS"],
  ["public-172", { endpoint: "http://172.32.0.1:19443" }, "PUBLIC_ADDRESS"],
  ["link-local", { endpoint: "http://169.254.1.1:19443" }, "PRIVATE_ADDRESS"],
  ["cgnat", { endpoint: "http://100.64.0.1:19443" }, "PRIVATE_ADDRESS"],
  ["public-doc", { endpoint: "http://203.0.113.10:19443" }, "PUBLIC_ADDRESS"],
  ["public-chronik-port", { endpoint: "http://198.51.100.20:19442" }, "PUBLIC_ADDRESS"],
  ["wildcard", { endpoint: "http://0.0.0.0:19443" }, "WILDCARD"],
  ["wildcard-star", { endpoint: "http://*:19443" }, "WILDCARD"],
  ["wildcard-zero-net", { endpoint: "http://0.1.2.3:19443" }, "WILDCARD"],
  ["ipv6-loopback", { endpoint: "http://[::1]:19443" }, "IPV6"],
  ["ipv6-unspecified", { endpoint: "http://[::]:19443" }, "IPV6"],
  ["ipv6-bare", { endpoint: "http://::1:19443" }, "IPV6"],
  ["ipv4-mapped", { endpoint: "http://[::ffff:127.0.0.1]:19443" }, "IPV4_MAPPED"],
  ["ipv4-mapped-hex", { endpoint: "http://[::ffff:7f00:1]:19443" }, "IPV4_MAPPED"],
  ["localhost", { endpoint: "http://localhost:19443" }, "LOCALHOST_ALIAS"],
  ["localhost-domain", { endpoint: "http://localhost.localdomain:19443" }, "LOCALHOST_ALIAS"],
  ["loopback-other", { endpoint: "http://127.0.0.2:19443" }, "LOCALHOST_ALIAS"],
  ["short-ip", { endpoint: "http://127.1:19443" }, "NORMALIZATION"],
  ["decimal-ip", { endpoint: "http://2130706433:19443" }, "NORMALIZATION"],
  ["hex-ip", { endpoint: "http://0x7f000001:19443" }, "NORMALIZATION"],
  ["octal-ip", { endpoint: "http://0177.0.0.1:19443" }, "NORMALIZATION"],
  ["padded-port", { endpoint: "http://127.0.0.1:019443" }, "NORMALIZATION"],
  ["percent-host", { endpoint: "http://127%2e0%2e0%2e1:19443" }, "NORMALIZATION"],
  ["trailing-dot", { endpoint: "http://127.0.0.1.:19443" }, "NORMALIZATION"],
  ["dns-suffix", { endpoint: "http://127.0.0.1.evil.invalid:19443" }, "DNS_REBINDING"],
  ["dns-name", { endpoint: "http://chronik.invalid:19442" }, "DNS_REBINDING"],
  ["userinfo", { endpoint: "http://user:pass@127.0.0.1:19443" }, "CREDENTIALS"],
  ["userinfo-at-end", { endpoint: "http://127.0.0.1:19443@evil.invalid" }, "CREDENTIALS"],
  ["https-userinfo", { endpoint: "https://user:pass@127.0.0.1:19443" }, "CREDENTIALS"],
  ["uppercase-scheme", { endpoint: "HTTP://127.0.0.1:19443" }, "SCHEME"],
  ["ftp", { endpoint: "ftp://127.0.0.1:19443" }, "SCHEME"],
  ["no-scheme", { endpoint: "127.0.0.1:19443" }, "SCHEME"],
  ["empty-authority", { endpoint: "http:///127.0.0.1:19443" }, "MALFORMED"],
  ["path", { endpoint: "http://127.0.0.1:19443/" }, "PATH"],
  ["deeper-path", { endpoint: "http://127.0.0.1:19443/rpc" }, "PATH"],
  ["query", { endpoint: "http://127.0.0.1:19443?x=1" }, "MALFORMED"],
  ["fragment", { endpoint: "http://evil.invalid#http://127.0.0.1:19443" }, "MALFORMED"],
  ["whitespace", { endpoint: "http://127.0.0.1:19443 " }, "MALFORMED"],
  ["backslash", { endpoint: "http://127.0.0.1:19443\\@evil.invalid" }, "MALFORMED"],
  ["other-port", { endpoint: "http://127.0.0.1:80" }, "PORT"],
  ["role-swap", { role: "rpc", endpoint: LAB_ALLOWLIST.endpoints.chronik }, "ROLE"],
  ["unknown-role", { role: "wallet" }, "ROLE"],
  ["datadir-home", { datadir: "/home/xolosarmy/.bitcoin" }, "DATADIR"],
  ["datadir-tilde", { datadir: "~/.bitcoin" }, "DATADIR"],
  ["datadir-child", { datadir: "/home/xolosarmy/.bitcoin/regtest" }, "DATADIR"],
  ["datadir-traversal", { datadir: "/home/xolosarmy/xolosarmy-regtest/data/../../.bitcoin" }, "DATADIR"],
  ["datadir-slash", { datadir: `${LAB_ALLOWLIST.datadir}/` }, "DATADIR"],
  ["datadir-relative", { datadir: "data" }, "DATADIR"],
  ["binary-file", { binaryDir: `${LAB_ALLOWLIST.binaryDir}/bitcoind` }, "BINARY"],
  ["binary-other-version", { binaryDir: "/home/xolosarmy/bitcoin-abc-0.34.0/bin" }, "BINARY"],
  ["binary-usr", { binaryDir: "/usr/bin" }, "BINARY"],
  ["binary-traversal", { binaryDir: "/home/xolosarmy/bitcoin-abc-0.34.2/bin/../../../.bitcoin" }, "BINARY"],
  ["redirect-flag", { followRedirects: true }, "REDIRECT"],
  ["redirect-missing-bool", { followRedirects: "false" }, "REDIRECT"],
  ["proxy-loopback", { proxy: "http://127.0.0.1:8888" }, "PROXY"],
  ["proxy-empty-string", { proxy: "" }, "PROXY"],
  ["env-http-proxy", { env: { HTTP_PROXY: "http://127.0.0.1:8888" } }, "PROXY_ENV"],
  ["env-lower-proxy", { env: { http_proxy: "http://10.0.0.1:8888" } }, "PROXY_ENV"],
  ["env-all-proxy", { env: { ALL_PROXY: "socks5://127.0.0.1:1080" } }, "PROXY_ENV"],
  ["env-no-proxy", { env: { NO_PROXY: "127.0.0.1" } }, "PROXY_ENV"],
  ["env-other", { env: { PATH: "/usr/bin" } }, "UNKNOWN_FIELD"],
];

test("REG-11A rechaza la matriz negativa antes de connect", () => {
  assert.ok(negativeCases.length >= 60);
  for (const [id, patch, code] of negativeCases) {
    const adapter = safeAdapter();
    const result = evaluateConfiguration(patched(patch), adapter);
    assert.equal(result.verdict, "rejected", id);
    assert.equal(result.code, code, id);
    assert.equal(result.connectInvoked, false, id);
    assert.equal(adapter.calls.length, 0, id);
    assert.equal(result.reg11bSatisfied, false, id);
    assert.equal(result.offlineOnly, true, id);
    assert.equal(result.permissionsCode, "PERMISSIONS_DENIED", id);
    assert.equal(result.flagsCode, "FLAGS_OFF", id);
  }
});

test("REG-11A acepta solo las dos URL exactas y no conecta", () => {
  for (const role of ["rpc", "chronik"]) {
    const adapter = safeAdapter();
    const result = evaluateConfiguration(allowlistedConfig(role), adapter);
    assert.equal(result.verdict, "allowlisted");
    assert.equal(result.code, "ALLOWLISTED_OFFLINE");
    assert.equal(result.connectInvoked, false);
    assert.equal(adapter.calls.length, 0);
    assert.equal(result.reg11bSatisfied, false);
    assert.match(result.reason, /REG-11B is not satisfied/);
  }
  assert.equal(networkCalls.length, 0);
});

test("REG-11A no hereda un proxy del entorno del proceso", () => {
  const key = "HTTP_PROXY";
  const previous = process.env[key];
  process.env[key] = "http://127.0.0.1:9";
  try {
    const result = evaluateConfiguration(allowlistedConfig("rpc"), safeAdapter());
    assert.equal(result.verdict, "allowlisted");
    const blocked = evaluateConfiguration(
      patched({ env: { HTTP_PROXY: "http://127.0.0.1:9" } }),
      safeAdapter(),
    );
    assert.equal(blocked.code, "PROXY_ENV");
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("REG-11A rechaza adaptadores que redirigen, proxean o resuelven", () => {
  const config = allowlistedConfig("chronik");
  const redirecting = { ...safeAdapter(), followRedirects: true };
  const proxying = { ...safeAdapter(), proxy: "http://127.0.0.1:8888" };
  const resolving = {
    ...safeAdapter(),
    lookup() {
      return "127.0.0.1";
    },
  };
  assert.equal(evaluateConfiguration(config, redirecting).code, "REDIRECT");
  assert.equal(evaluateConfiguration(config, { ...safeAdapter(), maxRedirects: 1 }).code, "REDIRECT");
  assert.equal(evaluateConfiguration(config, proxying).code, "PROXY");
  assert.equal(evaluateConfiguration(config, resolving).code, "DNS_REBINDING");
  assert.equal(redirecting.calls.length, 0);
  assert.equal(proxying.calls.length, 0);
  assert.equal(resolving.calls.length, 0);
});

test("REG-11A rechaza un adaptador que ya intentó connect", () => {
  const adapter = safeAdapter();
  adapter.calls.push("earlier");
  const result = evaluateConfiguration(allowlistedConfig("rpc"), adapter);
  assert.equal(result.code, "CONNECT_INVOKED");
  assert.equal(result.connectInvoked, true);
  assert.equal(result.verdict, "rejected");
});

test("REG-11A rechaza configuraciones incompletas, desconocidas o malformadas", () => {
  const missing = allowlistedConfig("rpc");
  delete missing.chain;
  assert.equal(validateConfiguration(missing).code, "INCOMPLETE");
  assert.equal(validateConfiguration({ ...allowlistedConfig("rpc"), socialV2: false }).code, "UNKNOWN_FIELD");
  assert.equal(validateConfiguration(null).code, "MALFORMED");
  assert.equal(validateConfiguration(["regtest"]).code, "MALFORMED");
  assert.equal(validateConfiguration(Object.create(null)).code, "MALFORMED");
  const nullProtoEnv = allowlistedConfig("rpc");
  nullProtoEnv.env = Object.create(null);
  assert.equal(validateConfiguration(nullProtoEnv).code, "MALFORMED");
});

test("REG-11A los permisos nacen denegados y no se implican", () => {
  const initial = defaultPermissions();
  for (const capability of CAPABILITIES) {
    assert.equal(initial[capability], false);
    assert.equal(allows(initial, capability), false);
  }
  const readGrant = grant(initial, "read");
  assert.equal(initial.read, false);
  assert.equal(readGrant.permissions.read, true);
  for (const capability of ["assemble", "sign", "broadcast", "deploy"]) {
    assert.equal(readGrant.permissions[capability], false);
    assert.equal(allows(readGrant.permissions, capability), false);
  }
  const signed = grant(readGrant.permissions, "sign");
  assert.equal(signed.permissions.read, true);
  assert.equal(signed.permissions.sign, true);
  assert.equal(signed.permissions.assemble, false);
  assert.equal(signed.permissions.broadcast, false);
  assert.equal(signed.permissions.deploy, false);
  assert.equal(grant(initial, "admin").code, "UNKNOWN_CAPABILITY");
  assert.equal(allows(null, "read"), false);
  assert.equal(parsePermissions(null).code, "MISSING");
  assert.equal(parsePermissions({ read: false }).code, "INCOMPLETE");
  assert.equal(parsePermissions({ ...initial, read: "yes" }).code, "MALFORMED");
  const source = readFileSync(path.join(here, "permissions.mjs"), "utf8");
  assert.equal(source.includes(".connect("), false);
  assert.equal(source.includes("signTransaction"), false);
  assert.equal(source.includes("broadcastTransaction"), false);
});

test("REG-11A los flags de laboratorio nacen apagados y fallan cerrados", () => {
  const defaults = defaultLabFlags();
  const parsed = parseLabFlags(defaults);
  assert.equal(parsed.code, "FLAGS_OFF");
  for (const flag of LAB_FLAGS) assert.equal(parsed.flags[flag], false);
  for (const flag of LAB_FLAGS) {
    const enabled = { ...defaults, [flag]: true };
    const decision = parseLabFlags(enabled);
    assert.equal(decision.ok, false);
    assert.equal(decision.code, "FLAG_ENABLED");
    for (const name of LAB_FLAGS) assert.equal(decision.flags[name], false);
  }
  assert.equal(parseLabFlags(null).code, "MISSING");
  assert.equal(parseLabFlags(undefined).code, "MISSING");
  assert.equal(parseLabFlags([]).code, "MALFORMED");
  assert.equal(parseLabFlags({ ...defaults, wallet: false }).code, "UNKNOWN_FLAG");
  const incomplete = { ...defaults };
  delete incomplete.reply;
  assert.equal(parseLabFlags(incomplete).code, "INCOMPLETE");
  assert.equal(parseLabFlags({ ...defaults, tip: "false" }).code, "MALFORMED");
  assert.equal(parseLabFlags(null).flags.socialV2, false);
});

test("REG-11A no hay secretos en los archivos del laboratorio", () => {
  const files = walk(path.join(root, "labs")).map((file) => path.relative(root, file)).sort();
  assert.deepEqual(files, EXPECTED_FILES);
  for (const relative of files) {
    const hits = scanText(readFileSync(path.join(root, relative), "utf8"));
    assert.deepEqual(hits, [], relative);
  }
  const synthetic = [
    ["x", "prv", "9zz"].join(""),
    ["x", "pub", "9zz"].join(""),
    ["BEGIN ", "PRIVATE KEY"].join(""),
    ["rpc", "password"].join(""),
    ["private", "Key"].join(""),
    ["mne", "monic"].join(""),
    `K${"x".repeat(50)}`,
  ];
  const expectedHits = ["XPRV", "XPUB", "PEM", "RPC_CREDENTIAL", "PRIVATE_KEY_FIELD", "SEED_FIELD", "WIF"];
  synthetic.forEach((sample, index) => {
    assert.ok(scanText(sample).includes(expectedHits[index]), expectedHits[index]);
  });
});

test("REG-11A el diff queda dentro de labs/s1-d2 y la base no se mueve", () => {
  assert.equal(git(["rev-parse", "origin/main"]), AUTHORIZED_MAIN_SHA);
  assert.equal(git(["merge-base", "HEAD", "origin/main"]), AUTHORIZED_MAIN_SHA);
  const paths = new Set(EXPECTED_FILES);
  const seen = new Set();
  const status = git(["status", "--porcelain", "-uall"]);
  for (const line of status.split("\n")) {
    if (!line) continue;
    let name = line.slice(3);
    if (name.includes(" -> ")) name = name.split(" -> ").at(-1);
    seen.add(name);
  }
  for (const line of git(["diff", "--name-only", AUTHORIZED_MAIN_SHA, "HEAD"]).split("\n")) {
    if (line) seen.add(line);
  }
  for (const name of seen) {
    assert.equal(name.startsWith("labs/s1-d2/"), true, name);
    assert.equal(paths.has(name), true, name);
  }
  assert.deepEqual([...seen].sort(), EXPECTED_FILES);
  const forbidden = ["packages/", "apps/", ".github/", "pnpm-lock.yaml", "pnpm-workspace.yaml", "docs/"];
  for (const name of seen) {
    for (const prefix of forbidden) assert.equal(name.startsWith(prefix), false, name);
  }
});

test("REG-11A los módulos de decisión no importan red ni procesos", () => {
  const libraries = EXPECTED_FILES.filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"));
  const banned = [
    "node:net",
    "node:dns",
    "node:http",
    "node:https",
    "node:child_process",
    ".connect(",
    "fetch(",
    "bitcoin-cli",
    "chronik-client",
  ];
  for (const relative of libraries) {
    const source = readFileSync(path.join(root, relative), "utf8");
    for (const token of banned) assert.equal(source.includes(token), false, `${relative} ${token}`);
  }
  assert.equal(networkCalls.length, 0);
});
