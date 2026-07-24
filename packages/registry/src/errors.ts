export const REGISTRY_ERROR_CODES = [
  "INVALID_REGISTRY",
  "UNSUPPORTED_SCHEMA_VERSION",
  "INVALID_NETWORK",
  "MISSING_PROFILE",
  "UNKNOWN_PROFILE",
  "PROFILE_CODE_MISMATCH",
  "ALIAS_MISMATCH",
  "INVALID_DISPLAY_NAME",
  "INVALID_AUTHORIZED_ADDRESSES",
  "INVALID_ADDRESS",
  "DUPLICATE_ADDRESS",
  "INVALID_HEIGHT",
  "INVALID_HEIGHT_RANGE"
] as const;

export type RegistryErrorCode = (typeof REGISTRY_ERROR_CODES)[number];

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;

  constructor(code: RegistryErrorCode, message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

export function registryError(code: RegistryErrorCode, message: string): RegistryError {
  return new RegistryError(code, message);
}

export function isRegistryError(error: unknown): error is RegistryError {
  return error instanceof RegistryError;
}
