import { opReturnScript, repeatHexByte, utf8Hex } from "./helpers.js";

export const TXID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const MEMPOOL_TXID = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
export const PREV_TXID = "1111111111111111111111111111111111111111111111111111111111111111";
export const SECOND_PREV_TXID = "2222222222222222222222222222222222222222222222222222222222222222";
export const BLOCK_HASH = "3333333333333333333333333333333333333333333333333333333333333333";

export const P2PKH_ZERO_SCRIPT = "76a914000000000000000000000000000000000000000088ac";
export const P2SH_ZERO_SCRIPT = "a914000000000000000000000000000000000000000087";
export const NONSTANDARD_SCRIPT = "5102abcd";
export const ORDINARY_PAYMENT_SCRIPT = "6b";

export const P2PKH_ZERO_ADDRESS = "ecash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs7ratqfx";
export const P2SH_ZERO_ADDRESS = "ecash:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq8m7jvrjm";

export const MEMO_PAYLOAD = utf8Hex("TM0|p|xa|signal now lives on eCash");
export const MEMO_OP_RETURN_SCRIPT = opReturnScript(MEMO_PAYLOAD);
export const LARGE_PUSHDATA1_PAYLOAD = repeatHexByte("41", 100);
export const EXACT_80_BYTE_PAYLOAD = repeatHexByte("42", 80);

export const makeConfirmedTx = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  txid: TXID,
  version: 2,
  inputs: [
    {
      prevOut: { txid: PREV_TXID, outIdx: 0 },
      inputScript: "00",
      outputScript: P2PKH_ZERO_SCRIPT,
      sats: 546n,
      sequenceNo: 4294967295
    }
  ],
  outputs: [{ sats: 0n, outputScript: MEMO_OP_RETURN_SCRIPT }],
  lockTime: 0,
  block: { height: 900001, hash: BLOCK_HASH, timestamp: 1710000000 },
  timeFirstSeen: 1709999900,
  size: 250,
  isCoinbase: false,
  tokenEntries: [],
  tokenFailedParsings: [],
  tokenStatus: "TOKEN_STATUS_NON_TOKEN",
  isFinal: true,
  ...overrides
});

export const makeMempoolTx = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...makeConfirmedTx({ txid: MEMPOOL_TXID, block: undefined, timeFirstSeen: 0, isFinal: false }),
  ...overrides
});

export const makeCoinbaseTx = (): Record<string, unknown> =>
  makeConfirmedTx({
    isCoinbase: true,
    inputs: [
      {
        prevOut: { txid: PREV_TXID, outIdx: 0 },
        inputScript: "03abcdef",
        sats: 0n,
        sequenceNo: 4294967295
      }
    ]
  });
