// Frozen blob inventory. Comparison is pure. It does not read the worktree.

export const S1A_HEAD = "7d5b91283085871565e784c717ddc14b6736af46";
export const S1B_DESIGN_HEAD = "a0257480cf9c12f8ee8df71408f276f42b8ee463";
export const HISTORICAL_MAIN = "228d1f036643ca9be8ba85e91f8200536f3242da";

export const S1A_BLOBS = Object.freeze([
  Object.freeze(["labs/s1-d2/README.md", "6650cea9d0f4dc205b76292f529b127107cc67d7"]),
  Object.freeze(["labs/s1-d2/guardrails/allowlist.mjs", "5594819bddb64db22cc15b2649fad4cf9cb0cd08"]),
  Object.freeze(["labs/s1-d2/guardrails/endpoints.mjs", "ea5fbebb16d47c64dd2385d8d16c14739e7cd2f2"]),
  Object.freeze(["labs/s1-d2/guardrails/evaluate.mjs", "e47cd67ae6daffdd2ff8e66acc853ab9766297ae"]),
  Object.freeze(["labs/s1-d2/guardrails/fixtures.mjs", "eaecfd86d9939a53692c1fc18e7b0fba3b7d6914"]),
  Object.freeze(["labs/s1-d2/guardrails/flags.mjs", "16bfc5e85e3053fa2a0d34c51831e26a287ff891"]),
  Object.freeze(["labs/s1-d2/guardrails/permissions.mjs", "1a17bd8f1d443ae86237fbc3f4a40322b6ae46f2"]),
  Object.freeze(["labs/s1-d2/guardrails/reg11a.test.mjs", "4916092fdec193c8610afc3c05e43be996743b89"]),
  Object.freeze(["labs/s1-d2/guardrails/secrets.mjs", "a42bd4335e549cbe2edc3118857849fd3abe3fd7"]),
]);

export const DESIGN_BLOBS = Object.freeze([
  Object.freeze(["labs/s1-d2/s1-b-proposal/README.md", "fc3a34688eb774fa7b8db3fabd81a5042a38bc65"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/adapter-contract.md", "c875451c3f07b00db927daa30e539d397a6567c3"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/isolation-architecture.md", "e72bdf099e46c5c9e5b6c64cfd51f6302004d436"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/manifest.json", "90f394dbbe8fe4cf6913df9c77049564d4672c25"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/references-and-decisions.md", "1b01aaab81da21e5eedde7816685b0875f7f2a38"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/reg11b-matrix.md", "00cb4e622372500a66ee955e9c2884c5243ac373"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/seventh-act-proposal.md", "de03a031c4b71b500281e404b80effe8e7432335"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/sources.json", "3e66e5f513cf3fd9d5784f06796a6812268fd8de"]),
  Object.freeze(["labs/s1-d2/s1-b-proposal/suspension-rollback-evidence.md", "62ef9ba2f119867ca8d46e707d30ca77f1f88dde"]),
]);

function asMap(entries, label) {
  if (!Array.isArray(entries)) {
    return { ok: false, code: "MALFORMED", reason: `${label} must be an array` };
  }
  const map = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return { ok: false, code: "MALFORMED", reason: `${label} entry must be path and blob` };
    }
    const [path, blob] = entry;
    if (typeof path !== "string" || typeof blob !== "string") {
      return { ok: false, code: "MALFORMED", reason: `${label} path and blob must be strings` };
    }
    if (map.has(path)) return { ok: false, code: "DUPLICATE", reason: `${label} repeats ${path}` };
    map.set(path, blob);
  }
  return { ok: true, map };
}

export function compareBlobInventory(actualEntries, expectedEntries) {
  const actual = asMap(actualEntries, "actual");
  if (!actual.ok) return actual;
  const expected = asMap(expectedEntries, "expected");
  if (!expected.ok) return expected;
  for (const [path, blob] of expected.map) {
    if (!actual.map.has(path)) {
      return { ok: false, code: "MISSING", reason: `missing ${path}` };
    }
    if (actual.map.get(path) !== blob) {
      return { ok: false, code: "BLOB_CHANGED", reason: `${path} blob changed` };
    }
  }
  for (const path of actual.map.keys()) {
    if (!expected.map.has(path)) {
      return { ok: false, code: "UNEXPECTED", reason: `unexpected ${path}` };
    }
  }
  return {
    ok: true,
    code: "INVENTORY_MATCH",
    reason: "blob inventory matches",
    count: expected.map.size,
  };
}
