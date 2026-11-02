import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MATRIX_PATH = join(REPO_ROOT, "tests/protocol/RFC0001-S0-EVIDENCE-MATRIX.md");

const FROZEN: Readonly<Record<string, string>> = {
  "tests/fixtures/rfc0001-empp-tmm.json":
    "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8",
  "tests/fixtures/rfc0001-empp-sec17-decisions.json":
    "76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca",
  "tests/fixtures/rfc0001-sec17-dispatch-matrix.json":
    "24ae49302406bd9f2793f749fa96235d1ea6c368c03a72f850c96208d49c5633",
  "tests/fixtures/rfc0001-alp-ancestry.json":
    "5f5dbd942df0d12a1626830e8bbdbd3100770e2aec508b6a872a2e4c74b8bec8",
  "tests/fixtures/rfc0001-alp-replay.json":
    "443a8d07171a8c9e28008808f7f854cf22688f0e41fa7c577a9fc8b48d772712",
  "tests/fixtures/rfc0001-mainnet-tm1-d07.json":
    "53afea6a140146e3e483074b5c9ab36d1dac684c4ff58300a8cc8a1e93baed08",
  "tests/fixtures/rfc0001-canonical-tm1-p2pkh.json":
    "dad39e8b3b8965eda6c6241e3a822c2aace88abd51bdfbd765e2758f15f3e694",
  "tests/fixtures/rfc0001-sec17-coexistence.json":
    "8913aa8643b1553e7cd5e29b92e54c9ee83de2245aedbf80de91d6b0d05ec883",
  "tests/fixtures/rfc0001_regtest_reference.json":
    "b4fe3c176eac1144cd9b625c2daf65f09be2a4e060090eee5703a2d8b06f4bbf"
};

const LEGACY_ROW_SHA256 = "5f0a801d218a40624646a6fef7c8bfff3ebead122fdc81fecbd9288c93e4d3f2";

const D07_TXIDS = [
  "fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd",
  "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8",
  "0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150"
] as const;

const REQUIRED_IDS = [
  "M174-ALL-COMBINATIONS",
  "M174-PARSER-NOT-SETTLEMENT",
  "M174-SCRIPT-LENGTHS",
  "M174-SIG-PREVOUT",
  "M174-ACTIVE-TARGET",
  "M174-TOKEN-ANCESTRY",
  "M174-RECIPIENT-ATTRIBUTION",
  "M174-REORG",
  "M174-IDEMPOTENCE",
  "M174-MULTI-OWNER",
  "M174-REVIEW-TRIPLE",
  "M174-INCOMPLETE-STAYS-BLOCKING",
  "M174-REAL-RMZ",
  "M174-TIP-SETTLEMENT",
  "M174-TIP-AUTHORSHIP",
  "M174-REACTIONS",
  "M174-REORG-RESTART",
  "M174-V2-BYTES-REJECT",
  "M174-AUTHOR-255",
  "M174-ENVELOPE-SHAPE",
  "S005-GATE",
  "S006-GATE",
  "S006-NO-RESIDUAL",
  "S007-GATE",
  "S007-BYTE-IDENTITY",
  "S009-FINAL-HEAD",
  "SEC-01",
  "SEC-02",
  "SEC-03",
  "SEC-04",
  "SEC-05",
  "SEC-06",
  "SEC-07",
  "SEC-08",
  "SEC-09",
  "SEC-10",
  "SEC-11",
  "SEC-12",
  "SEC-13",
  "SEC-14",
  "SEC-15",
  "SEC-16",
  "SEC-17",
  "SEC17-C1-TMM-NOT-TM0",
  "SEC17-C2-NOT-TM1",
  "SEC17-C3-BESIDE-TM1",
  "SEC17-C4-BESIDE-TM0",
  "SEC17-C5-NOT-UTF8",
  "SEC17-C6-DIAGNOSIS",
  "SEC17-C7-V2-CORE",
  "SEC17-C8-DUPLICATE-TMM",
  "SEC17-C9-NO-SETTLED-TIP",
  "EMPP-ALP-GATE",
  "EMPP-ALP-REAL-RMZ",
  "EMPP-ALP-SETTLEMENT",
  "HIST-GATE",
  "HIST-D07-SAMPLE",
  "HIST-NFT-LABEL",
  "M183-NO-VERIFIED-ON-INVALID",
  "M183-RETRY-LABELS",
  "M183-TRUST-DISCLOSED",
  "M184-EACH-SEC",
  "M191-DEFAULT-OFF",
  "M192-H1-POST-FRAMING",
  "M192-H6-EMPP",
  "M193-S1-START",
  "M194-D3",
  "M194-D4",
  "M194-INDEXER-PERSIST",
  "M195-ACTIVATION-RECORD",
  "M195-RATIFICATION-NOT-ENABLEMENT"
] as const;

const LAB_VALIDATED = new Set([
  "M174-MULTI-OWNER",
  "M174-V2-BYTES-REJECT",
  "M174-ENVELOPE-SHAPE",
  "SEC17-C2-NOT-TM1",
  "SEC17-C7-V2-CORE",
  "EMPP-ALP-CORE-VS-APP",
  "EMPP-ALP-NO-PACKAGE-DISPATCH",
  "S007-BYTE-IDENTITY",
  "S007-RECORD-STAYS-UNSATISFIED",
  "S007-FALSE-TM0-OBSERVATION",
  "M183-SYNTHETIC-IS-VERIFIER-TEST",
  "M192-POLICY-1",
  "M192-POLICY-2",
  "M192-POLICY-3",
  "M192-POLICY-4",
  "M192-POLICY-5",
  "M192-B1-TM0",
  "M192-B2-TM1-POST",
  "M192-B3-COMBINED",
  "M192-B4-TWO-TM1",
  "M192-B5-UNRELATED",
  "M192-B6-V2-REJECTION",
  "M192-B7-EMPP-NOT-POST",
  "M192-B8-PREFIX-EXCLUSION",
  "M192-UNKNOWN-DISTINCT",
  "M192-V1-NOT-REQUIRED"
]);

const FORBIDDEN = [
  "S0 complete",
  "S0: CLOSED",
  "S0 CLOSED",
  "S0-07 satisfied",
  "S0-07 is satisfied",
  "SEC-17 mitigated",
  "SEC-17 is mitigated",
  "M1.7.4 closed",
  "M1.7.4 is closed"
] as const;

const OTHER_PR_RECEIPTS = new Set(["R-RFC", "R-PR42"]);

interface MatrixRow {
  id: string;
  status: string;
  body: string;
}

interface Receipt {
  key: string;
  sha: string;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function hasCommit(sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function fetchReceipt(sha: string, key: string): void {
  try {
    execFileSync("git", ["fetch", "--depth=1", "origin", sha], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    const ref = key === "R-RFC" ? "pull/40/head" : key === "R-PR42" ? "pull/42/head" : "";
    if (ref === "") {
      throw new Error(`Cannot fetch receipt ${key} ${sha}.`);
    }
    execFileSync("git", ["fetch", "--depth=1", "origin", ref], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
  }
}

function ensureReceipts(receipts: readonly Receipt[]): void {
  if (receipts.every((receipt) => hasCommit(receipt.sha))) {
    return;
  }
  try {
    execFileSync("git", ["fetch", "--deepen=80", "origin"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    // A full clone has no shallow boundary. The per-SHA fetch below still runs.
  }
  for (const receipt of receipts) {
    if (!hasCommit(receipt.sha)) {
      fetchReceipt(receipt.sha, receipt.key);
    }
  }
}

function commitHasPath(sha: string, path: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}:${path}`], {
      cwd: REPO_ROOT,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function evidencePaths(body: string): string[] {
  const evidence = /\*\*Evidence:\*\*([\s\S]*?)\n- \*\*Commit:\*\*/u.exec(body);
  const section = evidence?.[1] ?? "";
  const paths = new Set<string>();
  for (const match of section.matchAll(/`([^`\n]+)`/gu)) {
    const token = match[1];
    if (
      (token.startsWith("tests/") || token.startsWith("packages/") || token.startsWith("docs/")) &&
      /\.[A-Za-z0-9]+$/u.test(token)
    ) {
      paths.add(token);
      continue;
    }
    if (
      /^(?:rfc0001_[A-Za-z0-9_.-]+\.(?:test\.ts|test\.mjs|mjs)|RFC0001-[A-Za-z0-9_.-]+\.md)$/u.test(
        token
      )
    ) {
      paths.add(`tests/protocol/${token}`);
    }
  }
  return [...paths];
}

function parseRows(text: string): MatrixRow[] {
  const blocks = text.split(/\n(?=### `)/u);
  const rows: MatrixRow[] = [];
  for (const block of blocks) {
    const heading = /^### `([A-Z0-9-]+)`\n/u.exec(block);
    if (heading === null) {
      continue;
    }
    const status = /\*\*Status:\*\* `(LAB_VALIDATED|PARTIAL|NOT_DEMONSTRATED|BLOCKED)`/u.exec(block);
    if (status === null) {
      throw new Error(`Missing status for ${heading[1]}.`);
    }
    rows.push({ id: heading[1], status: status[1], body: block });
  }
  return rows;
}

function parseReceipts(text: string): Receipt[] {
  const receipts: Receipt[] = [];
  const pattern = /^\| `(R-[A-Z0-9-]+)` \| `([0-9a-f]{40})` \|/gmu;
  for (const match of text.matchAll(pattern)) {
    receipts.push({ key: match[1], sha: match[2] });
  }
  return receipts;
}

describe("S0 evidence matrix", () => {
  const text = readFileSync(MATRIX_PATH, "utf8");
  const rows = parseRows(text);

  it("keeps the frozen corpora, the three D-07 samples, and the legacy matrix digest", () => {
    for (const [path, digest] of Object.entries(FROZEN)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(digest);
      expect(text).toContain(digest);
    }
    const d07 = JSON.parse(
      readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-mainnet-tm1-d07.json"), "utf8")
    ) as { entries: { txid: string }[] };
    expect(d07.entries.map((entry) => entry.txid)).toEqual([...D07_TXIDS]);
    for (const txid of D07_TXIDS) {
      expect(text).toContain(txid);
    }
    const matrix = JSON.parse(
      readFileSync(join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-dispatch-matrix.json"), "utf8")
    ) as { rows: { corpus?: string }[] };
    expect(matrix.rows).toHaveLength(127);
    const legacy = matrix.rows.filter((row) => row.corpus !== "sec17-coexistence");
    expect(legacy).toHaveLength(113);
    expect(sha256(Buffer.from(JSON.stringify(legacy)))).toBe(LEGACY_ROW_SHA256);
    expect(text).toContain(LEGACY_ROW_SHA256);
    expect(text).toContain("was left unchanged");
  });

  it("enumerates the required gates and uses only the four audit statuses", () => {
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED_IDS) {
      expect(ids).toContain(id);
    }
    const counts = { LAB_VALIDATED: 0, PARTIAL: 0, NOT_DEMONSTRATED: 0, BLOCKED: 0 };
    for (const row of rows) {
      counts[row.status as keyof typeof counts] += 1;
      for (const label of [
        "**Normative text:**",
        "**Evidence:**",
        "**Commit:**",
        "**CI / Codex:**",
        "**Trust model:**",
        "**Still required:**"
      ]) {
        expect(row.body).toContain(label);
      }
      if (row.status === "BLOCKED") {
        expect(row.body.toLowerCase()).toContain("governance");
      }
    }
    expect(text).toContain(`| \`LAB_VALIDATED\` | ${counts.LAB_VALIDATED} |`);
    expect(text).toContain(`| \`PARTIAL\` | ${counts.PARTIAL} |`);
    expect(text).toContain(`| \`NOT_DEMONSTRATED\` | ${counts.NOT_DEMONSTRATED} |`);
    expect(text).toContain(`| \`BLOCKED\` | ${counts.BLOCKED} |`);
    expect(text).toContain(`| \`TOTAL\` | ${rows.length} |`);
    expect(rows.length).toBe(140);
  });

  it("limits LAB_VALIDATED to fixture and repository checks", () => {
    const observed = rows.filter((row) => row.status === "LAB_VALIDATED").map((row) => row.id);
    expect(new Set(observed)).toEqual(LAB_VALIDATED);
    const flat = text.replace(/\s+/gu, " ");
    expect(flat).toContain("LAB_VALIDATED does not close the parent gate.");
    expect(flat).toContain(
      "A synthetic or archival result does not meet a clause that requires regtest, mainnet, or production behavior."
    );
  });

  it("keeps the parent gates open in the audit record", () => {
    const flat = text.replace(/\s+/gu, " ");
    expect(flat).toContain("RFC-0001 remains PROPOSED — NOT RATIFIED.");
    expect(flat).toContain("SEC-17 production mitigation remains pending.");
    expect(flat).toContain("M1.7.4 remains OPEN.");
    expect(flat).toContain("S0 remains OPEN.");
    expect(flat).toContain("S1 remains NOT AUTHORIZED.");
    for (const phrase of FORBIDDEN) {
      expect(text).not.toContain(phrase);
    }
    expect(text).not.toMatch(/\*\*Status:\*\* `(?:SETTLED|VERIFIED)`/u);
  });

  it("cites ancestor commits for PR #41 evidence and leaves the other PRs untouched in the record", () => {
    const receipts = parseReceipts(text);
    expect(receipts.map((receipt) => receipt.key)).toEqual([
      "R-REGTEST",
      "R-BASELINE",
      "R-CANONICAL",
      "R-D07",
      "R-EMPP",
      "R-DISPATCH",
      "R-COEX",
      "R-BURN",
      "R-BIND",
      "R-PREVOUT",
      "R-REPLAY",
      "R-RFC",
      "R-PR42"
    ]);
    const byKey = new Map(receipts.map((receipt) => [receipt.key, receipt.sha]));
    ensureReceipts(receipts);
    for (const receipt of receipts) {
      expect(hasCommit(receipt.sha), receipt.key).toBe(true);
    }
    for (const row of rows) {
      const ciLine = /\*\*CI \/ Codex:\*\* ([^\n]+)/u.exec(row.body);
      const commitLine = /\*\*Commit:\*\* ([^\n]+)/u.exec(row.body);
      expect(ciLine).not.toBeNull();
      expect(commitLine).not.toBeNull();
      const keys = [...(ciLine?.[1] ?? "").matchAll(/`(R-[A-Z0-9-]+)`/gu)].map(
        (match) => match[1]
      );
      expect(keys.length).toBeGreaterThan(0);
      const shas: string[] = [];
      for (const key of keys) {
        const sha = byKey.get(key);
        expect(sha).toBeDefined();
        expect(commitLine?.[1]).toContain(sha);
        shas.push(sha ?? "");
      }
      for (const path of evidencePaths(row.body)) {
        expect(
          shas.some((sha) => commitHasPath(sha, path)),
          `${row.id} cites ${path} outside ${keys.join(", ")}`
        ).toBe(true);
      }
    }
    for (const receipt of receipts) {
      if (OTHER_PR_RECEIPTS.has(receipt.key)) {
        continue;
      }
      expect(hasCommit(receipt.sha)).toBe(true);
      expect(git(["merge-base", "--is-ancestor", receipt.sha, "HEAD"])).toBe("");
    }
    expect(text).toContain("This audit did not modify that");
    expect(text).toContain("PR #40 and PR #42 are not edited.");
  });
});
