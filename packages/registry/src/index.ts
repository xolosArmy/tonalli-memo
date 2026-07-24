export { authorizeAddress, isAuthorizedAddress } from "./authorize.js";
export { DEFAULT_REGISTRY } from "./default-registry.js";
export { REGISTRY_ERROR_CODES, RegistryError, isRegistryError, registryError } from "./errors.js";
export type { RegistryErrorCode } from "./errors.js";
export { parseRegistry } from "./parse.js";
export { resolveProfile, resolveProfileByAlias } from "./resolve.js";
export type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationReason,
  AuthorizedAddress,
  ProfileRegistryEntry,
  RegistryDocument
} from "./types.js";
