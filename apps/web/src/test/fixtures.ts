import type { FeedResponse, TxResponse } from "../api/types";

export const txid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const txidTwo = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const txidThree = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

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
    protocol: "TM0",
    protocolVersion: 0,
    eventType: "p",
    profileCode: "xa",
    payload: "Hola <strong>Tonalli</strong>\nLinea dos",
    byteLength: 37,
    candidate: {
      protocol: "TM0",
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

export const tm1TxResponse: TxResponse = {
  transaction: {
    ...verifiedTxResponse.transaction,
    txid: txidThree,
    blockHeight: 900002,
    updatedAt: 1710000400
  },
  verification: {
    txid: txidThree,
    status: "VERIFIED",
    protocol: "TM1",
    protocolVersion: 1,
    eventType: "POST",
    profileCode: null,
    payload: "Publicacion TM1 verificada estructuralmente",
    byteLength: 44,
    candidate: {
      protocol: "TM1",
      outputIndex: 2
    },
    authorizingAddress: "ecash:qptm1author00000000000000000000000000000000",
    authorizingInputIndex: 1,
    evaluationHeight: null,
    firstIndexedAt: 1710000350,
    lastVerifiedAt: 1710000450
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

export const tm1FeedResponse: FeedResponse = {
  items: [
    {
      transaction: tm1TxResponse.transaction,
      verification: tm1TxResponse.verification!
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
