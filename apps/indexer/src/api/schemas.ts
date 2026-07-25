const txidPattern = "^[0-9a-f]{64}$";

const errorResponse = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" }
      }
    }
  }
} as const;

const transactionSummary = {
  type: "object",
  additionalProperties: false,
  required: [
    "txid",
    "chainStatus",
    "isCoinbase",
    "isFinal",
    "blockHeight",
    "blockHash",
    "blockTimestamp",
    "firstSeenAt",
    "firstIndexedAt",
    "updatedAt"
  ],
  properties: {
    txid: { type: "string", pattern: txidPattern },
    chainStatus: { type: "string", enum: ["confirmed", "unconfirmed"] },
    isCoinbase: { type: "boolean" },
    isFinal: { type: "boolean" },
    blockHeight: { type: ["integer", "null"], minimum: 0 },
    blockHash: { type: ["string", "null"] },
    blockTimestamp: { type: ["integer", "null"], minimum: 0 },
    firstSeenAt: { type: ["integer", "null"], minimum: 0 },
    firstIndexedAt: { type: "integer", minimum: 0 },
    updatedAt: { type: "integer", minimum: 0 }
  }
} as const;

const candidate = {
  type: "object",
  additionalProperties: false,
  required: ["outputIndex", "pushIndex"],
  properties: {
    outputIndex: { type: "integer", minimum: 0 },
    pushIndex: { type: "integer", minimum: 0 }
  }
} as const;

const memo = {
  type: "object",
  additionalProperties: false,
  required: ["protocolVersion", "eventType", "profileCode", "payload", "byteLength"],
  properties: {
    protocolVersion: { type: "integer", minimum: 0 },
    eventType: { type: "string" },
    profileCode: { type: "string" },
    payload: { type: "string" },
    byteLength: { type: "integer", minimum: 0 }
  }
} as const;

const storedVerification = {
  type: "object",
  additionalProperties: false,
  required: [
    "txid",
    "status",
    "protocolVersion",
    "eventType",
    "profileCode",
    "payload",
    "byteLength",
    "candidate",
    "authorizingAddress",
    "authorizingInputIndex",
    "evaluationHeight",
    "firstIndexedAt",
    "lastVerifiedAt"
  ],
  properties: {
    txid: { type: "string", pattern: txidPattern },
    status: { type: "string", enum: ["VERIFIED", "UNAUTHORIZED", "NO_MEMO", "INVALID_MEMO", "MULTIPLE_MEMOS"] },
    protocolVersion: { type: ["integer", "null"], minimum: 0 },
    eventType: { type: ["string", "null"] },
    profileCode: { type: ["string", "null"] },
    payload: { type: ["string", "null"] },
    byteLength: { type: ["integer", "null"], minimum: 0 },
    candidate: { anyOf: [candidate, { type: "null" }] },
    authorizingAddress: { type: ["string", "null"] },
    authorizingInputIndex: { type: ["integer", "null"], minimum: 0 },
    evaluationHeight: { type: ["integer", "null"], minimum: 0 },
    firstIndexedAt: { type: "integer", minimum: 0 },
    lastVerifiedAt: { type: "integer", minimum: 0 }
  }
} as const;

const verificationResult = {
  type: "object",
  additionalProperties: false,
  required: ["status", "txid"],
  properties: {
    status: {
      type: "string",
      enum: [
        "VERIFIED",
        "UNAUTHORIZED",
        "NO_MEMO",
        "INVALID_MEMO",
        "MULTIPLE_MEMOS",
        "MEMPOOL_TIP_REQUIRED",
        "INVALID_VERIFICATION_CONTEXT",
        "INVALID_TXID",
        "TRANSACTION_NOT_FOUND",
        "CHRONIK_UNAVAILABLE",
        "INVALID_CHRONIK_RESPONSE"
      ]
    },
    txid: { type: "string" },
    transaction: transactionSummary,
    memo,
    candidate,
    candidates: { type: "array", items: candidate },
    authorizingAddress: { type: "string" },
    authorizingInputIndex: { type: "integer", minimum: 0 },
    evaluationHeight: { type: "integer", minimum: 0 },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" }
      }
    }
  }
} as const;

const txParams = {
  type: "object",
  additionalProperties: false,
  required: ["txid"],
  properties: {
    txid: { type: "string", pattern: txidPattern }
  }
} as const;

export const healthSchema = {
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["status", "service"],
      properties: {
        status: { type: "string", const: "ok" },
        service: { type: "string", const: "tonalli-memo-indexer" }
      }
    }
  }
} as const;

export const getTxSchema = {
  params: txParams,
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["transaction", "verification"],
      properties: {
        transaction: transactionSummary,
        verification: { anyOf: [storedVerification, { type: "null" }] }
      }
    },
    400: errorResponse,
    404: errorResponse,
    500: errorResponse
  }
} as const;

export const feedSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { anyOf: [{ type: "integer", minimum: 1, maximum: 100 }, { type: "string", pattern: "^(?:[1-9][0-9]?|100)$" }] }
    }
  },
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["items", "limit"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["transaction", "verification"],
            properties: {
              transaction: transactionSummary,
              verification: storedVerification
            }
          }
        },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      }
    },
    400: errorResponse,
    500: errorResponse
  }
} as const;

const adminIndexResponse = {
  type: "object",
  additionalProperties: false,
  required: ["attemptId", "persistedRecord", "verification"],
  properties: {
    attemptId: { type: "integer", minimum: 1 },
    persistedRecord: { type: "boolean" },
    verification: verificationResult
  }
} as const;

export const adminIndexSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["txid"],
    properties: {
      txid: { type: "string", pattern: txidPattern },
      tipHeight: { type: "integer", minimum: 0 }
    }
  },
  response: {
    200: adminIndexResponse,
    400: { anyOf: [adminIndexResponse, errorResponse] },
    401: errorResponse,
    404: adminIndexResponse,
    422: adminIndexResponse,
    500: errorResponse,
    502: adminIndexResponse,
    503: adminIndexResponse
  }
} as const;
