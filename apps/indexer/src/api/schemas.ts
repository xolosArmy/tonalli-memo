const txidPattern = "^[0-9a-f]{64}$";
const hash160Pattern = "^[0-9a-f]{40}$";

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

const tm0Candidate = {
  type: "object",
  additionalProperties: false,
  required: ["protocol", "outputIndex", "pushIndex"],
  properties: {
    protocol: { type: "string", const: "TM0" },
    outputIndex: { type: "integer", minimum: 0 },
    pushIndex: { type: "integer", minimum: 0 }
  }
} as const;

const tm1Candidate = {
  type: "object",
  additionalProperties: false,
  required: ["protocol", "outputIndex"],
  properties: {
    protocol: { type: "string", const: "TM1" },
    outputIndex: { type: "integer", minimum: 0 }
  }
} as const;

const candidate = {
  anyOf: [tm0Candidate, tm1Candidate]
} as const;

const tm1Authorship = {
  type: "object",
  additionalProperties: false,
  required: ["publicKeyHashHex", "sighashByte", "trustModel"],
  properties: {
    publicKeyHashHex: { type: "string", pattern: hash160Pattern },
    sighashByte: { type: "integer", enum: [65, 193] },
    trustModel: { type: "string", const: "trusted-chronik" }
  }
} as const;

const tm0Memo = {
  type: "object",
  additionalProperties: false,
  required: ["protocol", "version", "eventType", "profileCode", "payload", "byteLength"],
  properties: {
    protocol: { type: "string", const: "TM0" },
    version: { type: "integer", const: 0 },
    eventType: { type: "string" },
    profileCode: { type: "string" },
    payload: { type: "string" },
    byteLength: { type: "integer", minimum: 0 }
  }
} as const;

const tm1Memo = {
  type: "object",
  additionalProperties: false,
  required: [
    "protocol",
    "version",
    "eventType",
    "profileCode",
    "payload",
    "byteLength",
    "publicKeyHashHex",
    "sighashByte",
    "trustModel"
  ],
  properties: {
    protocol: { type: "string", const: "TM1" },
    version: { type: "integer", const: 1 },
    eventType: { type: "string", const: "POST" },
    profileCode: { type: "null" },
    payload: { type: "string" },
    byteLength: { type: "integer", minimum: 0 },
    publicKeyHashHex: { type: "string", pattern: hash160Pattern },
    sighashByte: { type: "integer", enum: [65, 193] },
    trustModel: { type: "string", const: "trusted-chronik" }
  }
} as const;

const memo = {
  anyOf: [tm0Memo, tm1Memo]
} as const;

const attachment = {
  type: "object",
  additionalProperties: false,
  required: ["type", "tokenId", "ownership"],
  properties: {
    type: { type: "string", const: "NFT" },
    tokenId: { type: "string", pattern: txidPattern },
    ownership: { type: "string", enum: ["VERIFIED_AT_INDEXING", "UNVERIFIED"] }
  }
} as const;

const storedVerification = {
  type: "object",
  additionalProperties: false,
  required: [
    "txid",
    "status",
    "protocol",
    "protocolVersion",
    "eventType",
    "profileCode",
    "payload",
    "displayPayload",
    "byteLength",
    "candidate",
    "authorizingAddress",
    "authorizingInputIndex",
    "evaluationHeight",
    "tm1Authorship",
    "attachment",
    "firstIndexedAt",
    "lastVerifiedAt"
  ],
  properties: {
    txid: { type: "string", pattern: txidPattern },
    status: { type: "string", enum: ["VERIFIED", "UNAUTHORIZED", "NO_MEMO", "INVALID_MEMO", "MULTIPLE_MEMOS"] },
    protocol: { type: "string", enum: ["TM0", "TM1"] },
    protocolVersion: { type: ["integer", "null"], minimum: 0 },
    eventType: { type: ["string", "null"] },
    profileCode: { type: ["string", "null"] },
    payload: { type: ["string", "null"] },
    displayPayload: { type: ["string", "null"] },
    byteLength: { type: ["integer", "null"], minimum: 0 },
    candidate: { anyOf: [candidate, { type: "null" }] },
    authorizingAddress: { type: ["string", "null"] },
    authorizingInputIndex: { type: ["integer", "null"], minimum: 0 },
    evaluationHeight: { type: ["integer", "null"], minimum: 0 },
    tm1Authorship: { anyOf: [tm1Authorship, { type: "null" }] },
    attachment: { anyOf: [attachment, { type: "null" }] },
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
        "VERIFIED_TM1",
        "UNAUTHORIZED",
        "NO_MEMO",
        "INVALID_MEMO",
        "INVALID_TM1",
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
    protocol: { type: "string", enum: ["TM0", "TM1"] },
    transaction: transactionSummary,
    memo,
    candidate,
    candidates: { type: "array", items: candidate },
    authorizingAddress: { type: ["string", "null"] },
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

const nullableTimestamp = { type: ["string", "null"] } as const;

const daemonStatus = {
  anyOf: [
    { type: "null" },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "state",
        "websocketConnected",
        "chronikHeight",
        "lastEventAt",
        "lastSuccessfulIndexAt",
        "lastSuccessfulIndexTxid",
        "queueSize",
        "activeCount",
        "queueAccepted",
        "queueCompleted",
        "queueFailed",
        "queueRejected",
        "queueLastActivityAt",
        "lastError",
        "backfill",
        "ready"
      ],
      properties: {
        state: { type: "string", enum: ["stopped", "starting", "running", "reconnecting", "stopping", "failed"] },
        websocketConnected: { type: "boolean" },
        chronikHeight: { type: ["integer", "null"], minimum: 0 },
        lastEventAt: nullableTimestamp,
        lastSuccessfulIndexAt: nullableTimestamp,
        lastSuccessfulIndexTxid: { type: ["string", "null"], pattern: txidPattern },
        queueSize: { type: "integer", minimum: 0 },
        activeCount: { type: "integer", minimum: 0 },
        queueAccepted: { type: "integer", minimum: 0 },
        queueCompleted: { type: "integer", minimum: 0 },
        queueFailed: { type: "integer", minimum: 0 },
        queueRejected: { type: "integer", minimum: 0 },
        queueLastActivityAt: nullableTimestamp,
        lastError: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: ["code", "at"],
              properties: {
                code: { type: "string" },
                at: { type: "string" }
              }
            }
          ]
        },
        backfill: {
          type: "object",
          additionalProperties: false,
          required: [
            "state",
            "complete",
            "lastStartedAt",
            "lastCompletedAt",
            "checkpointHeight",
            "lagBlocks",
            "consecutiveFailures"
          ],
          properties: {
            state: { type: "string", enum: ["idle", "running", "succeeded", "failed"] },
            complete: { type: "boolean" },
            lastStartedAt: nullableTimestamp,
            lastCompletedAt: nullableTimestamp,
            checkpointHeight: { type: ["integer", "null"], minimum: 0 },
            lagBlocks: { type: ["integer", "null"], minimum: 0 },
            consecutiveFailures: { type: "integer", minimum: 0 }
          }
        },
        ready: { type: "boolean" }
      }
    }
  ]
} as const;

export const healthSchema = {
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["status", "service", "daemon"],
      properties: {
        status: { type: "string", const: "ok" },
        service: { type: "string", const: "tonalli-memo-indexer" },
        daemon: daemonStatus
      }
    }
  }
} as const;

const readinessResponse = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "daemon"],
  properties: {
    status: { type: "string", enum: ["ready", "not_ready"] },
    service: { type: "string", const: "tonalli-memo-indexer" },
    daemon: daemonStatus
  }
} as const;

export const readinessSchema = {
  response: {
    200: readinessResponse,
    503: readinessResponse,
    500: errorResponse
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
    503: { anyOf: [adminIndexResponse, errorResponse] }
  }
} as const;

const indexRequestAccepted = {
  type: "object",
  additionalProperties: false,
  required: ["status", "txid"],
  properties: {
    status: { type: "string", enum: ["queued", "already_queued", "already_indexed"] },
    txid: { type: "string", pattern: txidPattern }
  }
} as const;

export const indexRequestSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["txid"],
    properties: {
      txid: { type: "string", pattern: txidPattern }
    }
  },
  response: {
    202: indexRequestAccepted,
    400: errorResponse,
    429: errorResponse,
    500: errorResponse,
    503: errorResponse
  }
} as const;
