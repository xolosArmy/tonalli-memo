import type { NormalizedTransaction } from "../../packages/chronik/src/types.ts";
import {
  decodeMemo,
  isMemoProtocolError,
  isTm1CandidateScript,
  isTm1ProtocolError,
  parseTm1Output,
  validateMemo
} from "../../packages/protocol/src/index.ts";
import {
  DEFAULT_REGISTRY,
  authorizeAddress,
  resolveProfile
} from "../../packages/registry/src/index.ts";
import { findMemoCandidates } from "../../packages/verification/src/candidates.ts";
import { verifyNormalizedTransaction } from "../../packages/verification/src/verify-normalized.ts";
import { verifyTm1DesignatedInput } from "../../packages/verification/src/verify-tm1-designated-input.ts";
import { BYTE_BUDGET, describeMemoPush, inspectEmppContainer } from "./empp-tmm-independent.mjs";

/**
 * Isolated SEC-17 container dispatch. It does not replace production.
 * A structurally recognized TMM entry inside eMPP is not a TM0 candidate.
 * Genuine TM0 text inside eMPP stays a candidate. That recognition is not
 * authorship, a social event, or a settled RMZ tip.
 */

const TMM_LOKAD = [0x54, 0x4d, 0x4d, 0x00] as const;

export interface CandidateRef {
  protocol: "TM0" | "TM1";
  outputIndex: number;
  pushIndex: number | null;
}

export interface DroppedCandidate extends CandidateRef {
  reason: "STRUCTURAL_TMM";
}

export interface ExperimentalDispatch {
  containers: string[];
  container: string;
  beforeCandidates: CandidateRef[];
  afterCandidates: CandidateRef[];
  dropped: DroppedCandidate[];
  internalDiagnosis: string[];
  suppressedLayout: string | null;
  beforeStatus: string;
  beforeCode: string | null;
  afterStatus: string;
  afterCode: string | null;
  authorship: "NOT_DEMONSTRATED" | "PRODUCTION_TRUSTED_CHRONIK" | "PRODUCTION_REGISTRY";
  settlement: "PENDING";
  socialEventCredited: false;
  coreParseCodes: string[];
  inputCount: number;
}

interface Verdict {
  status: string;
  code: string | null;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((value, index) => bytes[index] === value);
}

function isTmPrefix(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x54 && bytes[1] === 0x4d;
}

function isRecognizedTmm(bytes: Uint8Array): boolean {
  return startsWith(bytes, TMM_LOKAD);
}

function isStructurallyValidTmm(bytes: Uint8Array): boolean {
  return bytes.length === 39 && isRecognizedTmm(bytes) && bytes[4] === 0x02 && bytes[5] === 0x05;
}

function addDiagnosis(target: string[], flag: string): void {
  if (!target.includes(flag)) {
    target.push(flag);
  }
}

function candidateKey(candidate: CandidateRef): string {
  return `${candidate.protocol}:${candidate.outputIndex}:${candidate.pushIndex ?? ""}`;
}

function productionCandidates(transaction: NormalizedTransaction): CandidateRef[] {
  return findMemoCandidates(transaction).map((candidate) => ({
    protocol: candidate.protocol === "TM1" ? "TM1" : "TM0",
    outputIndex: candidate.location.outputIndex,
    pushIndex: candidate.protocol === "TM1" ? null : candidate.location.pushIndex
  }));
}

function verdictOf(transaction: NormalizedTransaction): Verdict {
  const result = verifyNormalizedTransaction(transaction);
  if (result.status === "INVALID_MEMO" || result.status === "INVALID_TM1") {
    return { status: result.status, code: result.protocolError.code };
  }
  return { status: result.status, code: null };
}

function sameCandidates(left: readonly CandidateRef[], right: readonly CandidateRef[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const keys = new Set(right.map(candidateKey));
  return left.every((candidate) => keys.has(candidateKey(candidate)));
}

function coreCode(script: Uint8Array, valueSats: bigint): string {
  try {
    parseTm1Output({ script, valueSats });
    return "PARSED";
  } catch (error) {
    if (isTm1ProtocolError(error)) {
      return error.code;
    }
    throw error;
  }
}

function textMemoVerdict(bytes: Uint8Array, transaction: NormalizedTransaction): Verdict {
  try {
    const memo = validateMemo(decodeMemo(bytes));
    const profile = resolveProfile(memo.profile, DEFAULT_REGISTRY);
    if (profile === null) {
      throw new Error(`Validated profile ${memo.profile} is missing from the default registry.`);
    }
    if (transaction.blockHeight === null) {
      return { status: "MEMPOOL_TIP_REQUIRED", code: null };
    }
    const authorized = transaction.inputs.some((input) => {
      if (input.address === null) {
        return false;
      }
      return authorizeAddress(profile, input.address, {
        chainStatus: "confirmed",
        blockHeight: transaction.blockHeight ?? 0
      }).authorized;
    });
    return { status: authorized ? "VERIFIED" : "UNAUTHORIZED", code: null };
  } catch (error) {
    if (isMemoProtocolError(error)) {
      return { status: "INVALID_MEMO", code: error.code };
    }
    throw error;
  }
}

function tm1Verdict(
  transaction: NormalizedTransaction,
  outputIndex: number
): Verdict {
  const output = transaction.opReturnOutputs.find((item) => item.outputIndex === outputIndex);
  if (output === undefined) {
    throw new Error(`Missing TM1 output ${outputIndex}.`);
  }
  const script = Uint8Array.from(Buffer.from(output.outputScriptHex, "hex"));
  let authorIndex: number;
  try {
    authorIndex = parseTm1Output({ script, valueSats: output.valueSats }).authorInputIndex;
  } catch (error) {
    if (isTm1ProtocolError(error)) {
      return { status: "INVALID_TM1", code: error.code };
    }
    throw error;
  }
  const author = verifyTm1DesignatedInput(transaction, authorIndex);
  if (!author.valid) {
    return { status: "INVALID_TM1", code: author.errorCode };
  }
  return { status: "VERIFIED_TM1", code: null };
}

function filteredVerdict(
  transaction: NormalizedTransaction,
  candidates: readonly CandidateRef[]
): Verdict {
  if (candidates.length === 0) {
    return { status: "NO_MEMO", code: null };
  }
  if (candidates.length > 1) {
    return { status: "MULTIPLE_MEMOS", code: null };
  }
  const only = candidates[0];
  if (only === undefined) {
    return { status: "NO_MEMO", code: null };
  }
  if (only.protocol === "TM1") {
    return tm1Verdict(transaction, only.outputIndex);
  }
  const output = transaction.opReturnOutputs.find((item) => item.outputIndex === only.outputIndex);
  const push = output?.pushes[only.pushIndex ?? -1];
  if (push === undefined) {
    throw new Error(`Missing filtered TM0 push ${only.outputIndex}:${only.pushIndex ?? -1}.`);
  }
  return textMemoVerdict(push, transaction);
}

function outputClass(script: Uint8Array, parsed: boolean): string {
  if (script.length > BYTE_BUDGET) {
    return "BYTE_BUDGET";
  }
  const empp = script.length >= 2 && script[0] === 0x6a && script[1] === 0x50;
  if (empp) {
    const inspected = inspectEmppContainer(script) as { container?: string };
    if (!parsed || inspected.container === "INVALID") {
      return "MALFORMED_EMPP";
    }
    return "EMPP";
  }
  if (isTm1CandidateScript(script)) {
    return "CONVENTIONAL_TM1";
  }
  return "CONVENTIONAL_OR_OTHER";
}

/**
 * Classify one normalized transaction. Production functions are read.
 * Their candidate scan is not replaced inside the packages.
 */
export function dispatchSec17(transaction: NormalizedTransaction): ExperimentalDispatch {
  const before = verdictOf(transaction);
  const beforeCandidates = productionCandidates(transaction);
  const afterCandidates: CandidateRef[] = [];
  const dropped: DroppedCandidate[] = [];
  const internalDiagnosis: string[] = [];
  const containers: string[] = [];
  const coreParseCodes: string[] = [];
  let suppressedLayout: string | null = null;

  for (const output of transaction.opReturnOutputs) {
    const script = Uint8Array.from(Buffer.from(output.outputScriptHex, "hex"));
    const parsed = output.parseStatus === "parsed";
    const kind = outputClass(script, parsed);
    containers.push(kind);
    coreParseCodes.push(coreCode(script, output.valueSats));
    const inspected = inspectEmppContainer(script) as { container?: string; flags?: string[] };
    const flags = inspected.flags ?? [];

    if (kind === "BYTE_BUDGET") {
      addDiagnosis(internalDiagnosis, "BYTE_BUDGET_EXCEEDED");
      if (flags.includes("TRUNCATED_PUSH")) {
        addDiagnosis(internalDiagnosis, "MALFORMED_EMPP");
      }
      for (const push of inspectedPushes(script)) {
        const layout = describeMemoPush(push).layout;
        if (layout === "TM0_TEXT_LAYOUT" || layout === "TM_DIGIT_MARKER_LAYOUT" || layout === "INVALID_UTF8") {
          suppressedLayout = layout;
        }
      }
      // Production still sees a TM1 candidate from the raw script after
      // getStackArray throws. The public Core code stays on that candidate.
      // An over-budget eMPP script is not a TM1 candidate, so it adds none.
      if (isTm1CandidateScript(script)) {
        afterCandidates.push({ protocol: "TM1", outputIndex: output.outputIndex, pushIndex: null });
      }
      continue;
    }

    if (kind === "MALFORMED_EMPP") {
      addDiagnosis(internalDiagnosis, "MALFORMED_EMPP");
      if (flags.includes("TRUNCATED_PUSH")) {
        addDiagnosis(internalDiagnosis, "TRUNCATED_EMPP");
      }
      continue;
    }

    if (kind === "CONVENTIONAL_TM1") {
      afterCandidates.push({ protocol: "TM1", outputIndex: output.outputIndex, pushIndex: null });
      continue;
    }

    if (kind !== "EMPP") {
      const textual = output.pushes.filter((push) => isTmPrefix(push));
      containers[containers.length - 1] = textual.length === 0 ? "UNRECOGNIZED" : "CONVENTIONAL_TM0";
      if (textual.length === 0) {
        addDiagnosis(internalDiagnosis, "UNRECOGNIZED_CONTAINER");
      }
      output.pushes.forEach((push, pushIndex) => {
        if (isTmPrefix(push)) {
          afterCandidates.push({ protocol: "TM0", outputIndex: output.outputIndex, pushIndex });
        }
      });
      continue;
    }

    const tmmPushes = output.pushes.filter((push) => isRecognizedTmm(push));
    if (tmmPushes.length > 1) {
      addDiagnosis(internalDiagnosis, "DUPLICATE_TMM");
    }
    let keptMemo = false;
    output.pushes.forEach((push, pushIndex) => {
      if (push.length === 1 && push[0] === 0x50 && pushIndex === 0) {
        return;
      }
      if (isRecognizedTmm(push)) {
        dropped.push({
          protocol: "TM0",
          outputIndex: output.outputIndex,
          pushIndex,
          reason: "STRUCTURAL_TMM"
        });
        addDiagnosis(internalDiagnosis, isStructurallyValidTmm(push) ? "TMM_STRUCTURALLY_VALID" : "TMM_MALFORMED");
        addDiagnosis(internalDiagnosis, "TMM_RECOGNIZED");
        return;
      }
      if (!isTmPrefix(push)) {
        return;
      }
      keptMemo = true;
      afterCandidates.push({ protocol: "TM0", outputIndex: output.outputIndex, pushIndex });
      const layout = describeMemoPush(push).layout;
      if (layout === "TM0_TEXT_LAYOUT") {
        try {
          validateMemo(decodeMemo(push));
          addDiagnosis(internalDiagnosis, "GENUINE_TM0_INSIDE_EMPP");
        } catch (error) {
          if (!isMemoProtocolError(error)) {
            throw error;
          }
          addDiagnosis(internalDiagnosis, "TM0_TEXT_REJECTED");
        }
      } else {
        addDiagnosis(internalDiagnosis, "TEXT_MARKER_PRESERVED");
      }
    });
    if (!keptMemo && tmmPushes.length === 0) {
      addDiagnosis(internalDiagnosis, "ABSENT_MEMO");
    }
  }

  afterCandidates.sort(compareCandidates);
  const after = sameCandidates(beforeCandidates, afterCandidates)
    ? before
    : filteredVerdict(transaction, afterCandidates);
  const authorship = after.status === "VERIFIED_TM1"
    ? "PRODUCTION_TRUSTED_CHRONIK"
    : after.status === "VERIFIED"
      ? "PRODUCTION_REGISTRY"
      : "NOT_DEMONSTRATED";

  return {
    containers,
    container: containerLabel(containers),
    beforeCandidates,
    afterCandidates,
    dropped,
    internalDiagnosis: [...internalDiagnosis].sort(),
    suppressedLayout,
    beforeStatus: before.status,
    beforeCode: before.code,
    afterStatus: after.status,
    afterCode: after.code,
    authorship,
    settlement: "PENDING",
    socialEventCredited: false,
    coreParseCodes,
    inputCount: transaction.inputs.length
  };
}

function inspectedPushes(script: Uint8Array): Uint8Array[] {
  const inspected = inspectEmppContainer(script) as { pushes?: Array<{ hex?: string }> };
  return (inspected.pushes ?? []).map((push) => Uint8Array.from(Buffer.from(push.hex ?? "", "hex")));
}

function compareCandidates(left: CandidateRef, right: CandidateRef): number {
  if (left.outputIndex !== right.outputIndex) {
    return left.outputIndex - right.outputIndex;
  }
  if (left.protocol !== right.protocol) {
    return left.protocol === "TM1" ? -1 : 1;
  }
  return (left.pushIndex ?? -1) - (right.pushIndex ?? -1);
}

function containerLabel(containers: readonly string[]): string {
  const unique = [...new Set(containers)];
  if (unique.length === 0) {
    return "NO_OP_RETURN";
  }
  if (unique.length === 1) {
    return unique[0] ?? "NO_OP_RETURN";
  }
  return unique.join("+");
}

export interface ChangeInput {
  beforeCandidates: readonly CandidateRef[];
  afterCandidates: readonly CandidateRef[];
  dropped: readonly DroppedCandidate[];
  internalDiagnosis: readonly string[];
  beforeStatus: string;
  afterStatus: string;
  beforeCode: string | null;
  afterCode: string | null;
  inputCount: number;
  socialEventCredited: boolean;
  settlement: string;
}

const DIAGNOSTIC_E = new Set([
  "BYTE_BUDGET_EXCEEDED",
  "MALFORMED_EMPP",
  "TRUNCATED_EMPP",
  "UNRECOGNIZED_CONTAINER",
  "ABSENT_MEMO"
]);

/**
 * A removal is authorized only when the public verdict still describes the
 * memos that remain. NO_MEMO with a retained candidate, or MULTIPLE_MEMOS
 * with one candidate, is a regression outside A-E.
 */
function verdictMatchesRetained(input: ChangeInput): boolean {
  const tm1 = input.afterCandidates.filter((candidate) => candidate.protocol === "TM1").length;
  const tm0 = input.afterCandidates.length - tm1;
  if (input.afterCandidates.length === 0) {
    return input.afterStatus === "NO_MEMO" && input.afterCode === null;
  }
  if (input.afterCandidates.length > 1) {
    return input.afterStatus === "MULTIPLE_MEMOS" && input.afterCode === null;
  }
  if (tm1 === 1) {
    return input.afterStatus === "INVALID_TM1" && input.afterCode !== null;
  }
  if (tm0 === 1) {
    if (input.afterStatus === "UNAUTHORIZED" || input.afterStatus === "MEMPOOL_TIP_REQUIRED") {
      return input.afterCode === null;
    }
    return input.afterStatus === "INVALID_MEMO" && input.afterCode !== null;
  }
  return false;
}

/**
 * Explain a before/after difference. Anything outside A-E is BLOCKED.
 * VERIFIED results are accepted only when production already returned them
 * for the same candidates and the transaction has inputs.
 */
export function classifyDispatchChange(input: ChangeInput): string {
  if (input.socialEventCredited || input.settlement !== "PENDING") {
    return "BLOCKED";
  }
  if (input.afterStatus === "SETTLED") {
    return "BLOCKED";
  }
  const beforeKeys = new Set(input.beforeCandidates.map(candidateKey));
  const afterKeys = new Set(input.afterCandidates.map(candidateKey));
  const added = [...afterKeys].filter((key) => !beforeKeys.has(key));
  const removed = [...beforeKeys].filter((key) => !afterKeys.has(key));
  if (added.length > 0) {
    return "BLOCKED";
  }
  const droppedKeys = new Set(input.dropped.map(candidateKey));
  if (removed.some((key) => !droppedKeys.has(key))) {
    return "BLOCKED";
  }
  if (removed.length === 0) {
    if (input.beforeStatus !== input.afterStatus || input.beforeCode !== input.afterCode) {
      return "BLOCKED";
    }
    if (
      (input.afterStatus === "VERIFIED" || input.afterStatus === "VERIFIED_TM1") &&
      input.inputCount === 0
    ) {
      return "BLOCKED";
    }
    if (input.internalDiagnosis.includes("GENUINE_TM0_INSIDE_EMPP")) {
      return "AUTHORIZED_C";
    }
    if (input.internalDiagnosis.some((flag) => DIAGNOSTIC_E.has(flag))) {
      return "AUTHORIZED_E";
    }
    if (input.internalDiagnosis.includes("TEXT_MARKER_PRESERVED") || input.internalDiagnosis.includes("TM0_TEXT_REJECTED")) {
      return "AUTHORIZED_D";
    }
    return "UNCHANGED";
  }
  if (!verdictMatchesRetained(input)) {
    return "BLOCKED";
  }
  if (input.afterStatus === "VERIFIED" || input.afterStatus === "VERIFIED_TM1") {
    return "BLOCKED";
  }
  const afterTm0 = input.afterCandidates.filter((candidate) => candidate.protocol === "TM0").length;
  const afterTm1 = input.afterCandidates.filter((candidate) => candidate.protocol === "TM1").length;
  if (afterTm1 === 1 && afterTm0 === 0) {
    if (input.beforeStatus === "MULTIPLE_MEMOS" && input.afterStatus === "INVALID_TM1") {
      return "AUTHORIZED_B";
    }
    return "BLOCKED";
  }
  if (input.internalDiagnosis.includes("GENUINE_TM0_INSIDE_EMPP") && afterTm0 === 1 && afterTm1 === 0) {
    if (input.afterStatus === "UNAUTHORIZED" && input.afterCode === null) {
      return "AUTHORIZED_A_C";
    }
    return "BLOCKED";
  }
  return "AUTHORIZED_A";
}
