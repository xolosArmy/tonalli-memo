import { registryError } from "./errors.js";
import type { AuthorizationContext, AuthorizationDecision, ProfileRegistryEntry } from "./types.js";

function validateHeight(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw registryError("INVALID_HEIGHT", `${fieldName} must be a non-negative safe integer.`);
  }

  return value;
}

function evaluationHeightFor(context: AuthorizationContext): number {
  if (context.chainStatus === "confirmed") {
    return validateHeight(context.blockHeight, "blockHeight");
  }

  const tipHeight = validateHeight(context.tipHeight, "tipHeight");
  return validateHeight(tipHeight + 1, "tipHeight + 1");
}

export function authorizeAddress(
  profile: ProfileRegistryEntry,
  address: string,
  context: AuthorizationContext
): AuthorizationDecision {
  const evaluationHeight = evaluationHeightFor(context);
  const listedAddress = profile.authorizedAddresses.find((entry) => entry.address === address);

  if (listedAddress === undefined) {
    return {
      authorized: false,
      reason: "ADDRESS_NOT_LISTED",
      evaluationHeight
    };
  }

  if (listedAddress.validFromHeight !== undefined && evaluationHeight < listedAddress.validFromHeight) {
    return {
      authorized: false,
      reason: "NOT_YET_VALID",
      evaluationHeight
    };
  }

  if (listedAddress.validUntilHeight !== undefined && evaluationHeight > listedAddress.validUntilHeight) {
    return {
      authorized: false,
      reason: "EXPIRED",
      evaluationHeight
    };
  }

  return {
    authorized: true,
    reason: "AUTHORIZED",
    evaluationHeight
  };
}

export function isAuthorizedAddress(
  profile: ProfileRegistryEntry,
  address: string,
  context: AuthorizationContext
): boolean {
  return authorizeAddress(profile, address, context).authorized;
}
