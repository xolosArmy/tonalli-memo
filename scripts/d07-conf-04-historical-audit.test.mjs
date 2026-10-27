import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArguments,
  validateEntries,
  samplePageIndices,
  discoverConfirmedSample,
  auditHistoricalEntries
} from "./d07-conf-04-historical-audit.mjs";

const A = "aa".repeat(32);
const B = "bb".repeat(32);
const C = "cc".repeat(32);
const BLOCK = "dd".repeat(32);
const LABEL_SOURCE = "https://example.org/mainnet-record";

function entry(txid = A, extras = {}) {
  return { txid, label: "documented historic candidate", sourceUrl: LABEL_SOURCE, discoveryHeight: null, discoveryHash: null, ...extras };
}
function tx(txid = A, extras = {}) {
  return { txid, blockHeight: 900, blockHash: BLOCK, opReturnOutputs: [{
    outputIndex: 0, outputScriptHex: "6a04544d4d00050101006f6b"
  }], ...extras };
}
const parsed = { status: "VERIFIED_TM1", candidate: { outputIndex: 0 },
  authorizingInputIndex: 0, sighashByte: 0x41,
  memo: { eventDataByteLength: 2 }, trustModel: "trusted-chronik" };

test("requires explicit HTTPS Chronik and precisely one input mode", () => {
  assert.throws(() => parseArguments(["--discover"]), /chronik-url/u);
  assert.throws(() => parseArguments(["--chronik-url", "http://insecure.example", "--discover"]), /HTTPS/u);
  assert.throws(() => parseArguments(["--chronik-url", "https://example.org"]), /exactly one/u);
  assert.throws(() => parseArguments(["--chronik-url", "https://example.org", "--discover", "--txids-file", "x.json"]), /exactly one/u);
  assert.throws(() => parseArguments(["--chronik-url", "https://example.org", "--discover", "--page-size", "200"]), /page-size/u);
  assert.equal(parseArguments(["--chronik-url", "https://example.org", "--discover"]).discover, true);
});

test("rejects duplicate, uppercase and invented/noncanonical manifest IDs", () => {
  assert.deepEqual(validateEntries([entry()])[0].txid, A);
  assert.throws(() => validateEntries([entry(), entry()]), /duplicate/u);
  assert.throws(() => validateEntries([entry(A.toUpperCase())]), /noncanonical/u);
  assert.throws(() => validateEntries([entry("12345")]), /noncanonical/u);
});

test("stratifies bounded Chronik pages deterministically", () => {
  assert.deepEqual(samplePageIndices(0, 5), []);
  assert.deepEqual(samplePageIndices(1, 5), [0]);
  assert.deepEqual(samplePageIndices(100, 5), [0, 24, 49, 74, 99]);
});

test("samples confirmed LOKAD candidates with stable tip and height cap", async () => {
  const calls = [];
  const mock = {
    async getChainTip() { return { height: 901, hash: BLOCK }; },
    async listTonalliConfirmedTxs(protocol, page, size) {
      calls.push({ protocol, page, size });
      const pages = [[A], [B], [C]];
      return { page, numPages: 3, numTxs: 3,
        txs: pages[page].map((txid) => ({
          txid, blockHeight: page === 2 ? 901 : 850 + page, blockHash: BLOCK
        }))
      };
    }
  };
  const sample = await discoverConfirmedSample(mock, {
    pageSize: 5, pages: 3, maxTxids: 2, historicalMaxHeight: 900
  });
  assert.deepEqual(calls.map(({ page }) => page), [0, 1, 2]);
  assert.deepEqual(sample.entries.map(({ txid }) => txid), [A, B]);
  assert.equal(sample.discovery.reportedCount, 3);
  assert.deepEqual(sample.discovery.pagesInspected, [0, 1, 2]);
});

test("refuses history that moves while being sampled", async () => {
  let calls = 0;
  const mock = {
    async getChainTip() { calls++; return { height: 900, hash: calls > 1 ? A : BLOCK }; },
    async listTonalliConfirmedTxs(_protocol, page) {
      return { page, numPages: 1, numTxs: 1, txs: [{ txid: A, blockHeight: 900, blockHash: BLOCK }] };
    }
  };
  await assert.rejects(
    discoverConfirmedSample(mock, { pageSize: 1, pages: 1, maxTxids: 1, historicalMaxHeight: null }),
    /tip moved/u
  );
});

test("distinguishes compatible historical TM1 from rejected and unavailable candidates", async () => {
  const adapter = { async getTransaction(txid) {
    if (txid === C) throw Object.assign(new Error("node unreachable"), { code: "CHRONIK_UNAVAILABLE" });
    return tx(txid);
  } };
  const verified = await auditHistoricalEntries([entry(A), entry(B), entry(C)], adapter,
    (transaction) => transaction.txid === B
      ? { status: "INVALID_TM1", protocolError: { code: "UNSUPPORTED_AUTHOR_SCRIPT" } }
      : parsed);
  assert.deepEqual(verified.totals, { inspected: 3, compatible: 1, requiresReview: 1, inconclusive: 1 });
  assert.equal(verified.verdict, "INCOMPLETE_OR_REVIEW_REQUIRED");
  assert.equal(verified.records[0].verdict, "STRUCTURALLY_COMPATIBLE");
  assert.equal(verified.records[0].trustModel, "trusted-chronik");
  assert.equal(verified.records[0].scriptBytes, 12);
  assert.equal(verified.records[1].protocolErrorCode, "UNSUPPORTED_AUTHOR_SCRIPT");
  assert.equal(verified.records[2].verdict, "SOURCE_ERROR");
  assert.equal(verified.records[2].sourceError.code, "CHRONIK_UNAVAILABLE");
});

test("rejects unconfirmed, discovery drift and future-cohort candidates without claiming v1.0 ratification", async () => {
  const unconfirmed = await auditHistoricalEntries([entry(A)], {
    async getTransaction() { return tx(A, { blockHeight: null, blockHash: null }); }
  }, () => { throw new Error("must not verify mempool"); });
  assert.equal(unconfirmed.records[0].verdict, "NOT_CONFIRMED");

  const drift = await auditHistoricalEntries([entry(A, { discoveryHeight: 899, discoveryHash: BLOCK })], {
    async getTransaction() { return tx(); }
  }, () => { throw new Error("must not verify drift"); });
  assert.equal(drift.records[0].verdict, "SOURCE_MISMATCH");

  const later = await auditHistoricalEntries([entry(A)], {
    async getTransaction() { return tx(); }
  }, () => { throw new Error("must not verify outside historical cohort"); }, 899);
  assert.equal(later.records[0].verdict, "OUTSIDE_COHORT");

  const good = await auditHistoricalEntries([entry(A)], {
    async getTransaction() { return tx(); }
  }, () => parsed);
  assert.equal(good.verdict, "SAMPLE_COMPATIBLE_NOT_RATIFICATION");
  assert.equal(good.historicalDraft02ProvenanceVerified, false);
});
