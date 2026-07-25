export class HttpApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message = "Request failed.") {
    super(message);
    this.name = "HttpApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const invalidTxidError = (): HttpApiError =>
  new HttpApiError(400, "INVALID_TXID", "Transaction ID must be a lowercase 64-character hexadecimal string.");

export const unauthorizedError = (): HttpApiError =>
  new HttpApiError(401, "UNAUTHORIZED", "Authorization is required.");

export const notFoundError = (): HttpApiError =>
  new HttpApiError(404, "TRANSACTION_NOT_FOUND", "Transaction was not found.");

export const httpStatusForVerificationStatus = (status: string): number => {
  switch (status) {
    case "VERIFIED":
    case "UNAUTHORIZED":
    case "NO_MEMO":
    case "INVALID_MEMO":
    case "MULTIPLE_MEMOS":
      return 200;
    case "MEMPOOL_TIP_REQUIRED":
    case "INVALID_VERIFICATION_CONTEXT":
      return 422;
    case "INVALID_TXID":
      return 400;
    case "TRANSACTION_NOT_FOUND":
      return 404;
    case "CHRONIK_UNAVAILABLE":
      return 503;
    case "INVALID_CHRONIK_RESPONSE":
      return 502;
    default:
      return 500;
  }
};
