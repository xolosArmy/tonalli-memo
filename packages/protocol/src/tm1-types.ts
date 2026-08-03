/**
 * The only active TM1 event type in Draft 0.2.
 */
export type Tm1EventType = "POST";

/**
 * Complete transaction-output data required by the structural TM1 parser.
 *
 * A non-zero value is reported as INVALID_FORMAT after the TM1 marker has
 * been recognized. This avoids classifying unrelated outputs as malformed
 * TM1 and does not extend the public Draft 0.2 error-code vocabulary.
 */
export interface ParseTm1OutputInput {
  readonly valueSats: bigint;
  readonly script: Uint8Array;
}

/**
 * Structurally valid TM1 Draft 0.2 POST envelope.
 *
 * eventDataBytes is a defensive copy. No Unicode normalization, trimming or
 * line-ending conversion is applied.
 */
export interface ParsedTm1Post {
  readonly protocol: "TM1";
  readonly version: 1;
  readonly eventType: Tm1EventType;
  readonly eventTypeCode: 1;
  readonly authorInputIndex: number;
  readonly eventData: string;
  readonly eventDataBytes: Uint8Array;
  readonly eventDataByteLength: number;
  readonly scriptByteLength: number;
}
