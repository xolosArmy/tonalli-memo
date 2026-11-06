// S1-A offline allowlist. These strings are not permission to connect.

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
