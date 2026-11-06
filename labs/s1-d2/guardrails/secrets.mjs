// Text scanner for laboratory fixtures. It does not read wallets or the network.

function compiled(parts, flags) {
  return new RegExp(parts.join(""), flags);
}

const PATTERNS = Object.freeze([
  { code: "XPRV", re: compiled(["xpr", "v[1-9A-HJ-NP-Za-km-z]"]) },
  { code: "XPUB", re: compiled(["xpu", "b[1-9A-HJ-NP-Za-km-z]"]) },
  { code: "PEM", re: compiled(["BEGIN [A-Z ]*PRIVATE ", "KEY"]) },
  { code: "WIF", re: compiled(["\\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\\b"]) },
  { code: "RPC_CREDENTIAL", re: compiled(["\\brpc(?:user|pass", "word)\\b"], "i") },
  {
    code: "PRIVATE_KEY_FIELD",
    re: compiled(["\\b(?:private", "Key|private_", "key|secret", "Key|secret_", "key)\\b"]),
  },
  {
    code: "SEED_FIELD",
    re: compiled(["\\b(?:mne", "monic|seed", "Phrase|wallet", "Seed)\\b"], "i"),
  },
]);

export function scanText(text) {
  if (typeof text !== "string") return ["MALFORMED"];
  const hits = [];
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) hits.push(pattern.code);
  }
  return hits;
}
