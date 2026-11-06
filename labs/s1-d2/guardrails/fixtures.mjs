// Synthetic configurations. No seeds, private keys, or productive credentials.

import { LAB_ALLOWLIST } from "./allowlist.mjs";

export function allowlistedConfig(role) {
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

export function safeAdapter() {
  return {
    calls: [],
    followRedirects: false,
    maxRedirects: 0,
    proxy: null,
    connect() {
      this.calls.push("connect");
      throw new Error("S1-A forbids connect");
    },
  };
}
