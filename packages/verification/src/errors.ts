import type { ChronikAdapterErrorCode } from "@tonalli-memo/chronik";
import type { MemoErrorCode } from "@tonalli-memo/protocol";
import type { RegistryErrorCode } from "@tonalli-memo/registry";

export interface MemoProtocolFailure {
  readonly code: MemoErrorCode;
  readonly message: string;
}

export interface VerificationSourceError {
  readonly code: ChronikAdapterErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface VerificationContextFailure {
  readonly code: RegistryErrorCode;
  readonly message: string;
}

export type VerificationInvariantCode = "PROFILE_NOT_FOUND";

export class VerificationInvariantError extends Error {
  readonly code: VerificationInvariantCode;

  constructor(code: VerificationInvariantCode, message: string) {
    super(message);
    this.name = "VerificationInvariantError";
    this.code = code;
  }
}
