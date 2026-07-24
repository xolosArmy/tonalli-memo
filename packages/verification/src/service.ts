import { ChronikAdapterError, type ChronikAdapterErrorCode } from "@tonalli-memo/chronik";

import { verifyNormalizedTransaction } from "./verify-normalized.js";
import type {
  MemoVerificationServiceOptions,
  VerificationResult,
  VerifyTransactionContext
} from "./types.js";

type ChronikFailureStatus = Exclude<ChronikAdapterErrorCode, "INVALID_OPTIONS">;

const CHRONIK_RESULT_STATUSES = new Set<ChronikAdapterErrorCode>([
  "INVALID_TXID",
  "TRANSACTION_NOT_FOUND",
  "CHRONIK_UNAVAILABLE",
  "INVALID_CHRONIK_RESPONSE"
]);

function isChronikFailureStatus(code: ChronikAdapterErrorCode): code is ChronikFailureStatus {
  return CHRONIK_RESULT_STATUSES.has(code);
}

export class MemoVerificationService {
  private readonly options: MemoVerificationServiceOptions;

  constructor(options: MemoVerificationServiceOptions) {
    this.options = options;
  }

  async verifyTransaction(txid: string, context: VerifyTransactionContext = {}): Promise<VerificationResult> {
    try {
      const transaction = await this.options.chronik.getTransaction(txid);
      return verifyNormalizedTransaction(transaction, {
        ...(this.options.registry === undefined ? {} : { registry: this.options.registry }),
        ...(context.tipHeight === undefined ? {} : { tipHeight: context.tipHeight })
      });
    } catch (error) {
      if (error instanceof ChronikAdapterError && isChronikFailureStatus(error.code)) {
        return {
          status: error.code,
          txid,
          sourceError: error.cause === undefined
            ? { code: error.code, message: error.message }
            : { code: error.code, message: error.message, cause: error.cause }
        };
      }

      throw error;
    }
  }
}

export const createMemoVerificationService = (
  options: MemoVerificationServiceOptions
): MemoVerificationService => new MemoVerificationService(options);
