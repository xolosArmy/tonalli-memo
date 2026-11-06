// Offline decision pipeline. A matching allowlist string still does not open a socket.

import { reject } from "./allowlist.mjs";
import { validateConfiguration } from "./endpoints.mjs";
import { defaultLabFlags, parseLabFlags } from "./flags.mjs";
import { defaultPermissions, summarizePermissions } from "./permissions.mjs";

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

function classifyAdapter(adapter) {
  if (adapter == null) return { ok: true, code: "NO_ADAPTER", reason: "no adapter supplied" };
  if (typeof adapter !== "object" || Array.isArray(adapter)) {
    return reject("MALFORMED", "adapter must be an object");
  }
  if (
    adapter.followRedirects === true ||
    (typeof adapter.maxRedirects === "number" && adapter.maxRedirects > 0)
  ) {
    return reject("REDIRECT", "adapter can follow redirects");
  }
  if (adapter.proxy != null) return reject("PROXY", "adapter has a proxy");
  if (typeof adapter.resolve === "function" || typeof adapter.lookup === "function") {
    return reject("DNS_REBINDING", "adapter can resolve DNS");
  }
  return { ok: true, code: "ADAPTER_OFFLINE", reason: "adapter was not invoked" };
}

export function evaluateConfiguration(config, adapter) {
  const calls = adapter && Array.isArray(adapter.calls) ? adapter.calls.length : 0;
  if (calls !== 0) {
    return baseResult({
      verdict: "rejected",
      code: "CONNECT_INVOKED",
      reason: "adapter was already invoked; S1-A refuses the configuration",
      connectInvoked: true,
    });
  }

  const adapterDecision = classifyAdapter(adapter);
  const decision = adapterDecision.ok ? validateConfiguration(config) : adapterDecision;
  if (!decision.ok) {
    return baseResult({
      verdict: "rejected",
      code: decision.code,
      reason: decision.reason,
      connectInvoked: false,
    });
  }
  return baseResult({
    verdict: "allowlisted",
    code: "ALLOWLISTED_OFFLINE",
    reason: "strings match the offline allowlist; no connection is authorized; REG-11B is not satisfied",
    connectInvoked: false,
  });
}
