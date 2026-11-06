// Laboratory flags. They do not change productive feature flags.

import { reject } from "./allowlist.mjs";

export const LAB_FLAGS = Object.freeze([
  "socialV2",
  "reply",
  "reaction",
  "tip",
  "socialV2Indexing",
  "socialV2Read",
  "rmzEmpp",
  "broadcast",
]);

function copyFlags(source) {
  const out = {};
  for (const flag of LAB_FLAGS) out[flag] = source[flag];
  return Object.freeze(out);
}

export function defaultLabFlags() {
  const out = {};
  for (const flag of LAB_FLAGS) out[flag] = false;
  return Object.freeze(out);
}

export function parseLabFlags(input) {
  const safe = defaultLabFlags();
  if (input == null) return { ...reject("MISSING", "flag configuration is absent"), flags: safe };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ...reject("MALFORMED", "flag configuration must be a plain object"), flags: safe };
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return {
      ...reject("MALFORMED", "flag prototype is not Object.prototype"),
      flags: safe,
    };
  }
  const keys = Object.keys(input);
  for (const key of keys) {
    if (!LAB_FLAGS.includes(key)) {
      return { ...reject("UNKNOWN_FLAG", `unknown flag ${key}`), flags: safe };
    }
  }
  for (const flag of LAB_FLAGS) {
    if (!Object.hasOwn(input, flag)) {
      return { ...reject("INCOMPLETE", `missing flag ${flag}`), flags: safe };
    }
    if (typeof input[flag] !== "boolean") {
      return { ...reject("MALFORMED", `flag ${flag} is not boolean`), flags: safe };
    }
  }
  for (const flag of LAB_FLAGS) {
    if (input[flag] === true) {
      return {
        ...reject("FLAG_ENABLED", `${flag} must remain false in S1-A`),
        flags: safe,
      };
    }
  }
  return {
    ok: true,
    code: "FLAGS_OFF",
    reason: "all laboratory flags are off",
    flags: copyFlags(input),
  };
}
