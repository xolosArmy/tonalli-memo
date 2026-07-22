export type ActiveMemoType = "p" | "s";
export type ReservedMemoType = "l";
export type KnownMemoType = ActiveMemoType | ReservedMemoType;

export type ProfileCode = "xa" | "ty" | "tw" | "em";

export interface DecodedMemo {
  marker: "TM0";
  version: 0;
  type: string;
  profile: string;
  payload: string;
  byteLength: number;
}

export interface ValidatedMemo extends DecodedMemo {
  type: KnownMemoType;
  profile: ProfileCode;
}

export interface ValidationOptions {
  maxBytes?: number;
  allowReservedTypes?: boolean;
  knownProfiles?: readonly string[];
}

export interface EncodeOptions {
  maxBytes?: number;
  allowReservedTypes?: boolean;
}

export interface EncodeMemoInput {
  type: string;
  profile: string;
  payload: string;
}
