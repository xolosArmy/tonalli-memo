const CANONICAL_LOKAD_BYTES = [0x54, 0x4d, 0x4d, 0x00] as const;

/**
 * Package-private marker used strictly internally by encoder and parser.
 * Kept unexported from package entry points to guarantee process-wide protocol isolation.
 */
export const INTERNAL_TM1_LOKAD_ID: Uint8Array = Uint8Array.from(CANONICAL_LOKAD_BYTES);

function createImmutableUint8Array(bytes: readonly number[]): Uint8Array {
  const target = Uint8Array.from(bytes);
  return new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop, t);
      return typeof value === "function" ? value.bind(t) : value;
    },
    set() {
      throw new TypeError("Cannot mutate immutable TM1_LOKAD_ID constant.");
    },
    deleteProperty() {
      throw new TypeError("Cannot delete property on immutable TM1_LOKAD_ID.");
    },
    defineProperty() {
      throw new TypeError("Cannot define property on immutable TM1_LOKAD_ID.");
    }
  });
}

/**
 * Returns a fresh defensive copy of the canonical TM1 LOKAD ID (4 bytes: 0x54, 0x4d, 0x4d, 0x00).
 */
export function getTm1LokadId(): Uint8Array {
  return Uint8Array.from(CANONICAL_LOKAD_BYTES);
}

/**
 * Public canonical TM1 LOKAD ID representation.
 * Immutable view backed by a distinct buffer so consumer mutations are blocked
 * and internal protocol encoding/parsing cannot be corrupted.
 */
export const TM1_LOKAD_ID: Uint8Array = createImmutableUint8Array(CANONICAL_LOKAD_BYTES);

export const TM1_LOKAD_ID_HEX = "544d4d00";

export const TM1_VERSION = 1;
export const TM1_VERSION_HEX = "01";

export const TM1_POST_EVENT_TYPE = 1;
export const TM1_POST_EVENT_TYPE_HEX = "01";

export const MAX_TM1_SCRIPT_BYTES = 223;
export const MAX_TM1_ENVELOPE_BYTES = 215;
export const MAX_TM1_EVENT_DATA_BYTES = 212;

export const OP_RETURN = 0x6a;
export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;
export const OP_PUSHDATA4 = 0x4e;
