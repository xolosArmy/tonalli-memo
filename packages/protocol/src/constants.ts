import type { ActiveMemoType, KnownMemoType, ProfileCode, ReservedMemoType } from "./types.js";

export const MEMO_MARKER = "TM0";
export const MEMO_VERSION = 0;
export const DEFAULT_MAX_BYTES = 80;

export const ACTIVE_MEMO_TYPES = ["p", "s"] as const satisfies readonly ActiveMemoType[];
export const RESERVED_MEMO_TYPES = ["l"] as const satisfies readonly ReservedMemoType[];
export const KNOWN_MEMO_TYPES = ["p", "s", "l"] as const satisfies readonly KnownMemoType[];

export const PROFILE_CODES = ["xa", "ty", "tw", "em"] as const satisfies readonly ProfileCode[];

export const PROFILE_ALIASES: Readonly<Record<ProfileCode, string>> = {
  xa: "xolosarmy.xec",
  ty: "teyolia.xec",
  tw: "tonalli.xec",
  em: "ecashmx.xec"
};
