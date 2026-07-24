import type { NormalizedTransaction } from "@tonalli-memo/chronik";

export interface MemoCandidateLocation {
  readonly outputIndex: number;
  readonly pushIndex: number;
}

export interface MemoCandidate {
  readonly location: MemoCandidateLocation;
  readonly bytes: Uint8Array;
}

const TONALLI_NAMESPACE_T = 0x54;
const TONALLI_NAMESPACE_M = 0x4d;

export function isTonalliMemoCandidate(push: Uint8Array): boolean {
  return push.length >= 2 && push[0] === TONALLI_NAMESPACE_T && push[1] === TONALLI_NAMESPACE_M;
}

export function findMemoCandidates(transaction: NormalizedTransaction): readonly MemoCandidate[] {
  const candidates: MemoCandidate[] = [];

  for (const output of transaction.opReturnOutputs) {
    output.pushes.forEach((push, pushIndex) => {
      if (isTonalliMemoCandidate(push)) {
        candidates.push({
          location: {
            outputIndex: output.outputIndex,
            pushIndex
          },
          bytes: new Uint8Array(push)
        });
      }
    });
  }

  return [...candidates].sort((left, right) =>
    left.location.outputIndex - right.location.outputIndex ||
    left.location.pushIndex - right.location.pushIndex
  );
}
