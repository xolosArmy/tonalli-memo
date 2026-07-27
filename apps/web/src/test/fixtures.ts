import type { FeedResponse, TxResponse } from "../api/types";

export const txid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const txidTwo = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

export const verifiedTxResponse: TxResponse = {
  transaction: {
    txid,
    chainStatus: "confirmed",
    isCoinbase: false,
    isFinal: true,
    blockHeight: 900001,
    blockHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    blockTimestamp: 1710000000,
    firstSeenAt: 1709999900,
    firstIndexedAt: 1710000100,
    updatedAt: 1710000200
  },
  verification: {
    txid,
    status: "VERIFIED",
    protocolVersion: 0,
    eventType: "p",
    profileCode: "xa",
    payload: "Hola <strong>Tonalli</strong>\nLinea dos",
    byteLength: 37,
    candidate: {
      outputIndex: 1,
      pushIndex: 0
    },
    authorizingAddress: "ecash:qptestaddress0000000000000000000000000000000",
    authorizingInputIndex: 0,
    evaluationHeight: 900001,
    firstIndexedAt: 1710000100,
    lastVerifiedAt: 1710000300
  }
};

export const feedResponse: FeedResponse = {
  items: [
    {
      transaction: verifiedTxResponse.transaction,
      verification: verifiedTxResponse.verification!
    }
  ],
  limit: 25
};

export const nullVerificationResponse: TxResponse = {
  transaction: {
    ...verifiedTxResponse.transaction,
    txid: txidTwo,
    chainStatus: "unconfirmed",
    blockHeight: null,
    blockHash: null,
    blockTimestamp: null,
    firstSeenAt: 1710000400
  },
  verification: null
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" }
  });
}
