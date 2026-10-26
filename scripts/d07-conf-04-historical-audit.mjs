#!/usr/bin/env node
/**
 * D07-CONF-04 — Read-only TM1 historical sampling against official Chronik.
 *
 * This tool never signs, broadcasts, invokes the indexer, or modifies SQLite.
 * A matching TM1 result is evidence of structural compatibility under
 * trusted-Chronik, not independent signature validation or ratification.
 */
import { readFile } from "node:fs/promises";
import console from "node:console";
import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TXID = /^[0-9a-f]{64}$/u;
const POSITIVE_MAX = 500;
const USAGE = [
  "Usage:",
  "  node scripts/d07-conf-04-historical-audit.mjs --chronik-url https://chronik.e.cash --txids-file docs/operations/d07-conf-04-mainnet-candidates.json",
  "  node scripts/d07-conf-04-historical-audit.mjs --chronik-url https://chronik.e.cash --discover --pages 5 --page-size 25 --max-txids 20",
  "Optional: --historical-max-height N (explicit caller-selected cohort boundary).",
  "Outputs JSON to stdout. No networking occurs unless explicitly invoked."
].join("\n");

function boundedInteger(value, label, min, max) {
  const number = Number(value);
  if (!/^(0|[1-9][0-9]*)$/u.test(String(value)) ||
      !Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(label + " must be an integer in [" + min + ", " + max + "].");
  }
  return number;
}

export function parseArguments(args) {
  const options = {
    urls: [], txidsFile: null, discover: false,
    pages: 5, pageSize: 25, maxTxids: 20, historicalMaxHeight: null
  };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--discover") {
      options.discover = true;
      continue;
    }
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) throw new Error("Missing value for " + name);
    switch (name) {
      case "--chronik-url":
        if (!/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/u.test(value) || value.endsWith("/")) {
          throw new Error("Chronik URL must be an explicit HTTPS endpoint without trailing slash.");
        }
        options.urls.push(value);
        break;
      case "--txids-file":
        options.txidsFile = value;
        break;
      case "--pages":
        options.pages = boundedInteger(value, "pages", 1, 20);
        break;
      case "--page-size":
        options.pageSize = boundedInteger(value, "page-size", 1, 199);
        break;
      case "--max-txids":
        options.maxTxids = boundedInteger(value, "max-txids", 1, POSITIVE_MAX);
        break;
      case "--historical-max-height":
        options.historicalMaxHeight = boundedInteger(value, "historical-max-height", 0, Number.MAX_SAFE_INTEGER);
        break;
      default:
        throw new Error("Unknown argument " + name);
    }
  }
  if (options.urls.length === 0 || Number(options.discover) + Number(options.txidsFile !== null) !== 1) {
    throw new Error("Specify at least one --chronik-url and exactly one of --discover or --txids-file.");
  }
  return options;
}

export function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > POSITIVE_MAX) {
    throw new Error("Manifest must contain 1 through 500 entries.");
  }
  const seen = new Set();
  return entries.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.txid !== "string" || !TXID.test(entry.txid) || seen.has(entry.txid)) {
      throw new Error("Manifest contains duplicate or noncanonical transaction IDs.");
    }
    if (entry.label !== undefined && entry.label !== null &&
        (typeof entry.label !== "string" || entry.label.length > 160)) {
      throw new Error("Manifest label must be a short string.");
    }
    if (entry.sourceUrl !== undefined && entry.sourceUrl !== null &&
        (typeof entry.sourceUrl !== "string" || !entry.sourceUrl.startsWith("https://"))) {
      throw new Error("Manifest sourceUrl must be an HTTPS URL.");
    }
    seen.add(entry.txid);
    return {
      txid: entry.txid,
      label: entry.label ?? null,
      sourceUrl: entry.sourceUrl ?? null,
      discoveryHeight: entry.discoveryHeight ?? null,
      discoveryHash: entry.discoveryHash ?? null
    };
  });
}

export function samplePageIndices(numPages, pageBudget) {
  if (!Number.isSafeInteger(numPages) || numPages < 0) throw new Error("Invalid Chronik page count.");
  const total = Math.min(numPages, pageBudget);
  if (total === 0) return [];
  if (total === 1) return [0];
  return Array.from(new Set(Array.from({ length: total }, (_unused, index) =>
    Math.floor(index * (numPages - 1) / (total - 1))
  )));
}

function assertConfirmedPage(page, expectedPage, expectedCounts) {
  if (page === null || typeof page !== "object" || !Array.isArray(page.txs) ||
      page.page !== expectedPage ||
      !Number.isSafeInteger(page.numTxs) || page.numTxs < 0 ||
      !Number.isSafeInteger(page.numPages) || page.numPages < 0) {
    throw new Error("Invalid Chronik confirmed-history page response.");
  }
  if (expectedCounts !== null &&
      (page.numTxs !== expectedCounts.numTxs || page.numPages !== expectedCounts.numPages)) {
    throw new Error("Chronik TM1 history changed during sampling; retry on a stable tip.");
  }
}

export async function discoverConfirmedSample(liveSource, options) {
  const before = await liveSource.getChainTip();
  const first = await liveSource.listTonalliConfirmedTxs("TM1", 0, options.pageSize);
  assertConfirmedPage(first, 0, null);
  const indices = samplePageIndices(first.numPages, options.pages);
  const gathered = [];
  const used = new Set();
  for (const pageNumber of indices) {
    const page = pageNumber === 0
      ? first
      : await liveSource.listTonalliConfirmedTxs("TM1", pageNumber, options.pageSize);
    assertConfirmedPage(page, pageNumber, first);
    for (const row of page.txs) {
      if (!TXID.test(row.txid) ||
          !Number.isSafeInteger(row.blockHeight) || row.blockHeight < 0 ||
          typeof row.blockHash !== "string" || !TXID.test(row.blockHash)) {
        throw new Error("Invalid confirmed TM1 candidate metadata from Chronik.");
      }
      if (options.historicalMaxHeight !== null && row.blockHeight > options.historicalMaxHeight) continue;
      if (!used.has(row.txid)) {
        used.add(row.txid);
        gathered.push({
          txid: row.txid,
          label: null,
          sourceUrl: null,
          discoveryHeight: row.blockHeight,
          discoveryHash: row.blockHash
        });
      }
    }
  }
  const after = await liveSource.getChainTip();
  if (before.height !== after.height || before.hash !== after.hash) {
    throw new Error("Chronik tip moved during historical sampling; retry.");
  }
  // Evenly choose within the bounded pages that were actually inspected.
  const sample = gathered.length <= options.maxTxids
    ? gathered
    : Array.from({ length: options.maxTxids }, (_unused, index) =>
      gathered[Math.floor(index * gathered.length / options.maxTxids)]
    );
  return {
    entries: validateEntries(sample.length === 0 ? [] : sample),
    discovery: {
      source: "chronik-mainnet-endpoint-supplied-by-operator",
      lokadId: "544d4d00", reportedCount: first.numTxs,
      pagesInspected: indices, candidatesObserved: gathered.length,
      tip: before
    }
  };
}

function sourceError(error) {
  return error instanceof Error
    ? { name: error.name, code: typeof error.code === "string" ? error.code : null }
    : { name: typeof error, code: null };
}

export async function auditHistoricalEntries(entries, adapter, verify, historicalMaxHeight = null) {
  const records = [];
  for (const entry of validateEntries(entries)) {
    const record = {
      txid: entry.txid, label: entry.label, sourceUrl: entry.sourceUrl,
      blockHeight: null, blockHash: null,
      verdict: "INCONCLUSIVE", verificationStatus: null,
      protocolErrorCode: null, authorInputIndex: null,
      sighashByte: null, eventDataBytes: null, scriptBytes: null,
      trustModel: null, sourceError: null
    };
    try {
      const transaction = await adapter.getTransaction(entry.txid);
      if (transaction.txid !== entry.txid) {
        record.verdict = "SOURCE_MISMATCH";
      } else if (transaction.blockHeight === null || transaction.blockHash === null) {
        record.verdict = "NOT_CONFIRMED";
      } else {
        record.blockHeight = transaction.blockHeight;
        record.blockHash = transaction.blockHash;
        if ((entry.discoveryHeight !== null && entry.discoveryHeight !== transaction.blockHeight) ||
            (entry.discoveryHash !== null && entry.discoveryHash !== transaction.blockHash)) {
          record.verdict = "SOURCE_MISMATCH";
        } else if (historicalMaxHeight !== null && transaction.blockHeight > historicalMaxHeight) {
          record.verdict = "OUTSIDE_COHORT";
        } else {
          const result = verify(transaction);
          record.verificationStatus = result.status;
          if (result.status === "VERIFIED_TM1") {
            record.verdict = "STRUCTURALLY_COMPATIBLE";
            record.authorInputIndex = result.authorizingInputIndex;
            record.sighashByte = result.sighashByte;
            record.eventDataBytes = result.memo.eventDataByteLength;
            record.trustModel = result.trustModel;
            const output = transaction.opReturnOutputs.find((item) => item.outputIndex === result.candidate.outputIndex);
            record.scriptBytes = output === undefined ? null : output.outputScriptHex.length / 2;
          } else {
            record.verdict = "REVIEW_REQUIRED";
            record.protocolErrorCode = result.status === "INVALID_TM1" || result.status === "INVALID_MEMO"
              ? result.protocolError.code
              : null;
          }
        }
      }
    } catch (error) {
      record.verdict = "SOURCE_ERROR";
      record.sourceError = sourceError(error);
    }
    records.push(record);
  }
  const totals = {
    inspected: records.length,
    compatible: records.filter((r) => r.verdict === "STRUCTURALLY_COMPATIBLE").length,
    requiresReview: records.filter((r) => r.verdict === "REVIEW_REQUIRED").length,
    inconclusive: records.filter((r) => !["STRUCTURALLY_COMPATIBLE", "REVIEW_REQUIRED"].includes(r.verdict)).length
  };
  const verdict = totals.inspected > 0 && totals.compatible === totals.inspected
    ? "SAMPLE_COMPATIBLE_NOT_RATIFICATION"
    : "INCOMPLETE_OR_REVIEW_REQUIRED";
  return {
    schemaVersion: 1, protocol: "TM1", sourceTrust: "trusted-chronik",
    historicalMaxHeight,
    historicalDraft02ProvenanceVerified: false,
    verdict, totals, records
  };
}

async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const { createChronikTransactionAdapter, createChronikLiveSource } = await import("@tonalli-memo/chronik");
  const { verifyNormalizedTransaction } = await import("@tonalli-memo/verification");
  let entries;
  let discovery = null;
  if (options.discover) {
    const result = await discoverConfirmedSample(
      createChronikLiveSource({ urls: options.urls }), options
    );
    entries = result.entries;
    discovery = result.discovery;
  } else {
    const document = JSON.parse(await readFile(resolve(options.txidsFile), "utf8"));
    if (document.schemaVersion !== 1 || document.protocol !== "TM1") {
      throw new Error("Manifest must declare schemaVersion=1 and protocol=TM1.");
    }
    entries = validateEntries(document.entries);
  }
  const report = await auditHistoricalEntries(
    entries,
    createChronikTransactionAdapter({ urls: options.urls }),
    verifyNormalizedTransaction,
    options.historicalMaxHeight
  );
  console.log(JSON.stringify({
    ...report,
    discovery,
    provenanceNote: "A published TXID label or Chronik LOKAD discovery does not prove Draft 0.2 issuance chronology.",
    limitations: [
      "Chronik is a trusted input, not an independent signature verification.",
      "Only confirmed and reachable TXIDs in this bounded sample are evaluated.",
      "No statement of whole-chain coverage or formal TM1 v1.0 ratification follows."
    ]
  }, null, 2));
  if (report.verdict !== "SAMPLE_COMPATIBLE_NOT_RATIFICATION") process.exitCode = 2;
}

if (process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown D07-CONF-04 error.");
    console.error(USAGE);
    process.exitCode = 1;
  });
}
