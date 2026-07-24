import { PROFILE_CODES, type ProfileCode } from "@tonalli-memo/protocol";
import { DEFAULT_REGISTRY } from "./default-registry.js";
import type { ProfileRegistryEntry, RegistryDocument } from "./types.js";

function isProfileCode(code: string): code is ProfileCode {
  return (PROFILE_CODES as readonly string[]).includes(code);
}

export function resolveProfile(code: string, registry: RegistryDocument = DEFAULT_REGISTRY): ProfileRegistryEntry | null {
  if (!isProfileCode(code)) {
    return null;
  }

  return registry.profiles[code] ?? null;
}

export function resolveProfileByAlias(
  alias: string,
  registry: RegistryDocument = DEFAULT_REGISTRY
): ProfileRegistryEntry | null {
  for (const code of PROFILE_CODES) {
    const profile = registry.profiles[code];
    if (profile.alias === alias) {
      return profile;
    }
  }

  return null;
}
