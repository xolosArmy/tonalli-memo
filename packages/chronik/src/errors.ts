export type ChronikAdapterErrorCode =
  | "INVALID_OPTIONS"
  | "INVALID_TXID"
  | "TRANSACTION_NOT_FOUND"
  | "CHRONIK_UNAVAILABLE"
  | "INVALID_CHRONIK_RESPONSE";

export interface ChronikAdapterErrorOptions {
  code: ChronikAdapterErrorCode;
  message: string;
  cause?: unknown;
  txid?: string;
}

export class ChronikAdapterError extends Error {
  readonly code: ChronikAdapterErrorCode;
  readonly txid?: string;

  constructor(options: ChronikAdapterErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ChronikAdapterError";
    this.code = options.code;
    if (options.txid !== undefined) {
      this.txid = options.txid;
    }
  }
}

export const invalidOptions = (message: string, cause?: unknown): ChronikAdapterError =>
  new ChronikAdapterError({ code: "INVALID_OPTIONS", message, cause });

export const invalidTxid = (txid: string): ChronikAdapterError =>
  new ChronikAdapterError({ code: "INVALID_TXID", message: "Invalid transaction ID.", txid });

export const invalidChronikResponse = (message: string, txid: string, cause?: unknown): ChronikAdapterError =>
  new ChronikAdapterError({ code: "INVALID_CHRONIK_RESPONSE", message, txid, cause });

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
};

export const mapChronikTxError = (error: unknown, txid: string): ChronikAdapterError => {
  if (error instanceof ChronikAdapterError) {
    return error;
  }

  const message = errorMessage(error);
  const notFoundPattern = new RegExp(String.raw`404:\s*Transaction\s+${txid}\s+not found in the index`, "i");
  if (notFoundPattern.test(message)) {
    return new ChronikAdapterError({
      code: "TRANSACTION_NOT_FOUND",
      message: "Transaction not found in Chronik index.",
      txid,
      cause: error
    });
  }

  return new ChronikAdapterError({
    code: "CHRONIK_UNAVAILABLE",
    message: "Chronik transaction source is unavailable.",
    txid,
    cause: error
  });
};
