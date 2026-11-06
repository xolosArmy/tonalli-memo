import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeOpReturnOutput } from "../../packages/chronik/src/op-return.ts";
import type { NormalizedInput, NormalizedTransaction } from "../../packages/chronik/src/types.ts";
import { parseTm1Output } from "../../packages/protocol/src/index.ts";
import { verifyNormalizedTransaction } from "../../packages/verification/src/verify-normalized.ts";
import {
  classifyAuthor,
  parseTx,
  preimageHex,
  signatureMatches,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import {
  classifyDispatchChange,
  dispatchSec17,
  type CandidateRef,
  type DroppedCandidate,
  type LabCryptoEvidence
} from "./sec17-experimental-dispatch.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, "tests/fixtures/rfc0001-sec17-coexistence.json");

interface OracleResult {
  valid: boolean;
  stage: string;
  errorCode: string | null;
}

interface CoexInput {
  prevOut: { txid: string; outIdx: number };
  prevoutSats: string;
  outputScriptHex: string;
  scriptType: string;
}

interface SignatureStillValid {
  index: number;
  algorithm: "schnorr" | "ecdsa";
}

interface CoexCase {
  id: string;
  polarity: "positive" | "negative" | "control";
  signatureAlgorithm: "schnorr" | "ecdsa";
  authorInputIndex: number;
  sighashByte: number;
  postOutputIndexes: number[];
  rawTransactionHex: string;
  txid: string;
  outputCount: number;
  inputs: CoexInput[];
  preimageInputIndex: number | null;
  libPreimageHex: string | null;
  signatureStillValidAt: SignatureStillValid | null;
  source: "synthetic-fixture";
  chronikValidated: false;
  networkValidity: "NOT_DEMONSTRATED";
  tipSettlement: "NOT_DEMONSTRATED";
  expected: {
    independent: OracleResult;
    change: string;
    beforeStatus: string;
    afterStatus: string;
    authorship: string;
    structuralPost: true;
    appliedAsPostAuthorship: boolean;
  };
}

interface ParsedInput {
  prevTxid: string;
  outIdx: number;
  script: Uint8Array;
}

interface ParsedOutput {
  sats: bigint;
  script: Uint8Array;
}

export interface CoexistenceMatrixRow {
  id: string;
  corpus: "sec17-coexistence";
  container: string;
  beforeCandidates: CandidateRef[];
  afterCandidates: CandidateRef[];
  dropped: DroppedCandidate[];
  internalDiagnosis: string[];
  beforeStatus: string;
  beforeCode: string | null;
  afterStatus: string;
  afterCode: string | null;
  change: string;
  coreParseCodes: string[];
  authorship: "LAB_CRYPTOGRAPHIC" | "NOT_DEMONSTRATED";
  settlement: "PENDING";
  socialEventCredited: false;
  inputCount: number;
  lab: LabCryptoEvidence;
}

function readCases(): CoexCase[] {
  const document = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { cases: CoexCase[] };
  return document.cases;
}

function fail(id: string, message: string): never {
  throw new Error(`${id}: ${message}`);
}

function transactionOf(item: CoexCase): NormalizedTransaction {
  const parsed = parseTx(item.rawTransactionHex) as { inputs: ParsedInput[]; outputs: ParsedOutput[] };
  if (parsed.outputs.length !== item.outputCount) {
    fail(item.id, `output count is ${parsed.outputs.length}, expected ${item.outputCount}.`);
  }
  if (txidOf(item.rawTransactionHex) !== item.txid) {
    fail(item.id, "txid does not match the raw transaction.");
  }
  const inputs: NormalizedInput[] = parsed.inputs.map((input, index) => {
    const meta = item.inputs[index];
    if (meta === undefined || meta.prevOut.txid !== input.prevTxid || meta.prevOut.outIdx !== input.outIdx) {
      fail(item.id, `input ${index} does not match its prevout metadata.`);
    }
    return {
      index,
      prevOut: meta.prevOut,
      inputScriptHex: Buffer.from(input.script).toString("hex"),
      outputScriptHex: meta.outputScriptHex,
      address: null
    };
  });
  return {
    txid: item.txid,
    isCoinbase: false,
    inputs,
    inputAddresses: [],
    opReturnOutputs: parsed.outputs.flatMap((output, outputIndex) => {
      const scriptHex = Buffer.from(output.script).toString("hex");
      if (!scriptHex.startsWith("6a")) {
        return [];
      }
      return [normalizeOpReturnOutput(outputIndex, output.sats, scriptHex)];
    }),
    blockHeight: null,
    blockHash: null,
    blockTimestamp: null,
    firstSeenAt: null,
    isFinal: false,
    rawResponse: { adapter: "sec17-coexistence-lab", chronikValidated: false }
  };
}

function designatedAuthor(item: CoexCase, transaction: NormalizedTransaction): number {
  if (item.postOutputIndexes.length === 0) {
    fail(item.id, "has no POST output.");
  }
  let authorIndex: number | null = null;
  for (const outputIndex of item.postOutputIndexes) {
    const output = transaction.opReturnOutputs.find((candidate) => candidate.outputIndex === outputIndex);
    if (output === undefined) {
      fail(item.id, `POST output ${outputIndex} was not normalized.`);
    }
    const memo = parseTm1Output({
      script: Uint8Array.from(Buffer.from(output.outputScriptHex, "hex")),
      valueSats: output.valueSats
    });
    if (authorIndex === null) {
      authorIndex = memo.authorInputIndex;
    } else if (memo.authorInputIndex !== authorIndex) {
      fail(item.id, "POST outputs name different author indexes.");
    }
  }
  if (authorIndex !== item.authorInputIndex) {
    fail(item.id, `envelope author ${authorIndex} != fixture author ${item.authorInputIndex}.`);
  }
  return authorIndex;
}

function oracleOf(item: CoexCase): OracleResult {
  const actual = classifyAuthor(item) as OracleResult;
  const expected = item.expected.independent;
  if (actual.valid !== expected.valid || actual.stage !== expected.stage || actual.errorCode !== expected.errorCode) {
    fail(item.id, `oracle ${actual.stage}/${actual.errorCode} != ${expected.stage}/${expected.errorCode}.`);
  }
  if (item.preimageInputIndex === null || item.libPreimageHex === null) {
    fail(item.id, "is missing the preimage cross-check.");
  }
  const preimage = preimageHex(item.rawTransactionHex, item.inputs, item.preimageInputIndex, item.sighashByte) as string;
  if (preimage !== item.libPreimageHex) {
    fail(item.id, "independent preimage does not match the ecash-lib preimage locked in the fixture.");
  }
  if (item.signatureStillValidAt !== null) {
    const stillValid = signatureMatches(
      item.rawTransactionHex,
      item.inputs,
      item.signatureStillValidAt.index,
      item.signatureStillValidAt.algorithm
    ) as boolean;
    if (!stillValid) {
      fail(item.id, "a signature that must stay valid was rejected.");
    }
  }
  if (actual.valid) {
    const matches = signatureMatches(
      item.rawTransactionHex,
      item.inputs,
      item.authorInputIndex,
      item.signatureAlgorithm
    ) as boolean;
    if (!matches) {
      fail(item.id, "a valid oracle result failed the direct signature check.");
    }
  }
  return actual;
}

function evidenceFor(
  item: CoexCase,
  oracle: OracleResult,
  beforeStatus: string,
  afterStatus: string,
  singleRetainedTm1: boolean
): LabCryptoEvidence {
  if (item.sighashByte !== 0x41 && item.sighashByte !== 0xc1) {
    fail(item.id, `sighash 0x${item.sighashByte.toString(16)} is outside the Core policy.`);
  }
  if (item.preimageInputIndex === null) {
    fail(item.id, "cannot bind evidence without a preimage index.");
  }
  const productionTrustModel = afterStatus === "VERIFIED_TM1" ? "trusted-chronik" : null;
  return {
    source: "synthetic-fixture",
    chronikValidated: false,
    networkValidity: "NOT_DEMONSTRATED",
    tipSettlement: "NOT_DEMONSTRATED",
    structuralPost: true,
    cryptographicAuthorship: oracle.valid ? "LAB_VALID" : "LAB_REJECTED",
    independentStage: oracle.stage,
    independentErrorCode: oracle.errorCode,
    signatureAlgorithm: item.signatureAlgorithm,
    sighashByte: item.sighashByte,
    authorInputIndex: item.authorInputIndex,
    preimageInputIndex: item.preimageInputIndex,
    preimageAgreesWithLibrary: true,
    productionBeforeStatus: beforeStatus,
    productionStatus: afterStatus,
    productionTrustModel,
    appliedAsPostAuthorship: oracle.valid && singleRetainedTm1
  };
}

export function coexistenceMatrixRows(): CoexistenceMatrixRow[] {
  return readCases().map((item) => {
    const oracle = oracleOf(item);
    const transaction = transactionOf(item);
    const authorIndex = designatedAuthor(item, transaction);
    const production = verifyNormalizedTransaction(transaction);
    const result = dispatchSec17(transaction);
    if (production.status !== result.beforeStatus || result.beforeStatus !== item.expected.beforeStatus) {
      fail(item.id, `production before-status is ${production.status}, dispatch ${result.beforeStatus}.`);
    }
    const singleRetainedTm1 = result.afterCandidates.length === 1 && result.afterCandidates[0]?.protocol === "TM1";
    const lab = evidenceFor(item, oracle, result.beforeStatus, result.afterStatus, singleRetainedTm1);
    const change = classifyDispatchChange({
      ...result,
      labEvidence: lab,
      designatedAuthorIndex: authorIndex
    });
    if (change !== item.expected.change || result.afterStatus !== item.expected.afterStatus) {
      fail(item.id, `change ${change}/${result.afterStatus} != ${item.expected.change}/${item.expected.afterStatus}.`);
    }
    if (lab.appliedAsPostAuthorship !== item.expected.appliedAsPostAuthorship) {
      fail(item.id, "applied authorship does not match the fixture.");
    }
    const authorship = change === "AUTHORIZED_B_LAB_CRYPTO" ? "LAB_CRYPTOGRAPHIC" : "NOT_DEMONSTRATED";
    if (authorship !== item.expected.authorship) {
      fail(item.id, `authorship ${authorship} != ${item.expected.authorship}.`);
    }
    if (result.socialEventCredited || result.settlement !== "PENDING") {
      fail(item.id, "credited a social event or a settlement.");
    }
    return {
      id: item.id,
      corpus: "sec17-coexistence",
      container: result.container,
      beforeCandidates: result.beforeCandidates,
      afterCandidates: result.afterCandidates,
      dropped: result.dropped,
      internalDiagnosis: result.internalDiagnosis,
      beforeStatus: result.beforeStatus,
      beforeCode: result.beforeCode,
      afterStatus: result.afterStatus,
      afterCode: result.afterCode,
      change,
      coreParseCodes: result.coreParseCodes,
      authorship,
      settlement: result.settlement,
      socialEventCredited: result.socialEventCredited,
      inputCount: result.inputCount,
      lab
    };
  });
}
