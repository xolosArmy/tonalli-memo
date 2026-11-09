// Inert fixtures. These objects are data. They are not a license to connect.

import { LAB_ALLOWLIST } from "../guardrails/allowlist.mjs";
import { LAB_FLAGS } from "../guardrails/flags.mjs";
import { CAPABILITIES } from "../guardrails/permissions.mjs";
import { PENDING, SCHEMA_VERSION } from "./decisions.mjs";

function allFalse(keys) {
  const out = {};
  for (const key of keys) out[key] = false;
  return out;
}

export function offlineConfigurationFixture(role = "rpc") {
  return {
    role,
    endpoint: LAB_ALLOWLIST.endpoints[role],
    chain: LAB_ALLOWLIST.chain,
    datadir: LAB_ALLOWLIST.datadir,
    binaryDir: LAB_ALLOWLIST.binaryDir,
    followRedirects: false,
    proxy: null,
    env: {},
  };
}

export function offlineDescriptorFixture(role = "rpc") {
  return {
    schemaVersion: SCHEMA_VERSION,
    role,
    endpoint: LAB_ALLOWLIST.endpoints[role],
    chain: LAB_ALLOWLIST.chain,
    datadir: LAB_ALLOWLIST.datadir,
    binaryDir: LAB_ALLOWLIST.binaryDir,
    followRedirects: false,
    maxRedirects: 0,
    proxy: null,
    proxyFromEnv: false,
    env: {},
    resolve: null,
    lookup: null,
    addressFamily: "IPv4",
    literalAddress: "127.0.0.1",
    autoRetry: false,
    maxRetries: 0,
    fallbackEndpoints: [],
    allowWebSocket: false,
    allowUpgrade: false,
    permissions: allFalse(CAPABILITIES),
    flags: allFalse(LAB_FLAGS),
    backendDecision: PENDING.backend,
    binarySha256: PENDING.binarySha256,
    datadirMeasurement: PENDING.datadirMeasurement,
    genesisDecision: PENDING.genesis,
    brokerDecision: PENDING.broker,
    operationalAuthorization: PENDING.authorization,
  };
}

export function inertPreflightFixture() {
  return {
    applied: false,
    executed: false,
    hostMutation: "FORBIDDEN",
    namespaceBackend: PENDING.backend,
    networkPolicyBackend: PENDING.backend,
    confinementBackend: PENDING.backend,
    brokerApi: PENDING.broker,
    firewallChange: "NONE",
    cgroupChange: "NONE",
    kernelChange: "NONE",
    exteriorRoute: "ABSENT_IN_PLAN",
    dns: "BLOCKED_IN_PLAN",
    listeners: [],
    peers: [],
    scriptsExecutable: false,
  };
}
