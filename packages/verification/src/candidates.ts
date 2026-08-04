import type { NormalizedOpReturnOutput, NormalizedTransaction } from "@tonalli-memo/chronik";
import { isTm1CandidateScript } from "@tonalli-memo/protocol";

export type MemoProtocol = "TM0" | "TM1";

export interface Tm0MemoCandidateLocation {
  readonly protocol: "TM0";
  readonly outputIndex: number;
  readonly pushIndex: number;
}

export interface Tm1MemoCandidateLocation {
  readonly protocol: "TM1";
  readonly outputIndex: number;
}

export type MemoCandidateLocation = Tm0MemoCandidateLocation | Tm1MemoCandidateLocation;

export interface Tm0MemoCandidate {
  readonly protocol: "TM0";
  readonly location: Tm0MemoCandidateLocation;
  readonly bytes: Uint8Array;
}

export interface Tm1MemoCandidate {
  readonly protocol: "TM1";
  readonly location: Tm1MemoCandidateLocation;
  readonly output: NormalizedOpReturnOutput;
}

export type MemoCandidate = Tm0MemoCandidate | Tm1MemoCandidate;

const TONALLI_NAMESPACE_T = 0x54;
const TONALLI_NAMESPACE_M = 0x4d;

export function isTonalliMemoCandidate(push: Uint8Array): boolean {
  return push.length >= 2 && push[0] === TONALLI_NAMESPACE_T && push[1] === TONALLI_NAMESPACE_M;
}

export function findTm1Candidates(transaction: NormalizedTransaction): readonly Tm1MemoCandidate[] {
  return transaction.opReturnOutputs
    .filter((output) => isTm1CandidateScript(Uint8Array.from(Buffer.from(output.outputScriptHex, "hex"))))
    .map((output) => ({
      protocol: "TM1" as const,
      location: {
        protocol: "TM1" as const,
        outputIndex: output.outputIndex
      },
      output
    }))
    .sort((left, right) => left.location.outputIndex - right.location.outputIndex);
}

export function findTm0Candidates(
  transaction: NormalizedTransaction,
  excludedOutputIndexes: ReadonlySet<number> = new Set<number>()
): readonly Tm0MemoCandidate[] {
  const candidates: Tm0MemoCandidate[] = [];

  for (const output of transaction.opReturnOutputs) {
    if (excludedOutputIndexes.has(output.outputIndex)) {
      continue;
    }

    output.pushes.forEach((push, pushIndex) => {
      if (isTonalliMemoCandidate(push)) {
        candidates.push({
          protocol: "TM0",
          location: {
            protocol: "TM0",
            outputIndex: output.outputIndex,
            pushIndex
          },
          bytes: new Uint8Array(push)
        });
      }
    });
  }

  return candidates.sort((left, right) =>
    left.location.outputIndex - right.location.outputIndex ||
    left.location.pushIndex - right.location.pushIndex
  );
}

export function findMemoCandidates(transaction: NormalizedTransaction): readonly MemoCandidate[] {
  const tm1Candidates = findTm1Candidates(transaction);
  const tm1OutputIndexes = new Set(tm1Candidates.map((candidate) => candidate.location.outputIndex));
  const tm0Candidates = findTm0Candidates(transaction, tm1OutputIndexes);

  return [...tm0Candidates, ...tm1Candidates].sort((left, right) => {
    const outputOrder = left.location.outputIndex - right.location.outputIndex;
    if (outputOrder !== 0) {
      return outputOrder;
    }
    if (left.protocol === right.protocol) {
      return left.protocol === "TM0" && right.protocol === "TM0"
        ? left.location.pushIndex - right.location.pushIndex
        : 0;
    }
    return left.protocol === "TM1" ? -1 : 1;
  });
}
