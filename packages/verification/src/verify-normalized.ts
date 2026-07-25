import { type NormalizedTransaction } from "@tonalli-memo/chronik";
import { decodeMemo, isMemoProtocolError, validateMemo, type ValidatedMemo } from "@tonalli-memo/protocol";
import {
  DEFAULT_REGISTRY,
  authorizeAddress,
  isRegistryError,
  resolveProfile,
  type AuthorizationContext,
  type ProfileRegistryEntry
} from "@tonalli-memo/registry";

import { findMemoCandidates } from "./candidates.js";
import type { MemoCandidateLocation } from "./candidates.js";
import { VerificationInvariantError } from "./errors.js";
import type {
  InputAuthorizationDecision,
  NormalizedVerificationResult,
  VerifyNormalizedTransactionOptions
} from "./types.js";

export function verifyNormalizedTransaction(
  transaction: NormalizedTransaction,
  options: VerifyNormalizedTransactionOptions = {}
): NormalizedVerificationResult {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const candidates = findMemoCandidates(transaction);

  if (candidates.length === 0) {
    return {
      status: "NO_MEMO",
      txid: transaction.txid,
      transaction
    };
  }

  if (candidates.length > 1) {
    return {
      status: "MULTIPLE_MEMOS",
      txid: transaction.txid,
      transaction,
      candidates
    };
  }

  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new VerificationInvariantError("PROFILE_NOT_FOUND", "Candidate cardinality check failed.");
  }

  let memo;
  try {
    memo = validateMemo(decodeMemo(candidate.bytes));
  } catch (error) {
    if (isMemoProtocolError(error)) {
      return {
        status: "INVALID_MEMO",
        txid: transaction.txid,
        transaction,
        candidate: candidate.location,
        protocolError: {
          code: error.code,
          message: error.message
        }
      };
    }
    throw error;
  }

  const profile = resolveProfile(memo.profile, registry);
  if (profile === null) {
    throw new VerificationInvariantError(
      "PROFILE_NOT_FOUND",
      `Validated profile ${memo.profile} could not be resolved from the selected registry.`
    );
  }

  if (transaction.blockHeight === null) {
    if (options.tipHeight === undefined) {
      return {
        status: "MEMPOOL_TIP_REQUIRED",
        txid: transaction.txid,
        transaction,
        memo,
        candidate: candidate.location,
        profile
      };
    }
    return evaluateAuthorization(transaction, memo, candidate.location, profile, {
      chainStatus: "unconfirmed",
      tipHeight: options.tipHeight
    });
  }

  return evaluateAuthorization(transaction, memo, candidate.location, profile, {
    chainStatus: "confirmed",
    blockHeight: transaction.blockHeight
  });
}

function evaluateAuthorization(
  transaction: NormalizedTransaction,
  memo: ValidatedMemo,
  candidate: MemoCandidateLocation,
  profile: ProfileRegistryEntry,
  authorizationContext: AuthorizationContext
): NormalizedVerificationResult {
  const authorizationDecisions: InputAuthorizationDecision[] = [];
  let authorizingAddress: string | null = null;
  let authorizingInputIndex: number | null = null;
  let evaluationHeight: number | null = null;

  try {
    for (const input of transaction.inputs) {
      if (input.address === null) {
        continue;
      }

      const decision = authorizeAddress(profile, input.address, authorizationContext);
      evaluationHeight = decision.evaluationHeight;
      authorizationDecisions.push({
        inputIndex: input.index,
        address: input.address,
        authorized: decision.authorized,
        reason: decision.reason,
        evaluationHeight: decision.evaluationHeight
      });

      if (decision.authorized && authorizingAddress === null) {
        authorizingAddress = input.address;
        authorizingInputIndex = input.index;
      }
    }
  } catch (error) {
    if (authorizationContext.chainStatus === "unconfirmed" && isRegistryError(error) && error.code === "INVALID_HEIGHT") {
      return {
        status: "INVALID_VERIFICATION_CONTEXT",
        txid: transaction.txid,
        transaction,
        memo,
        candidate,
        profile,
        authorizationContext,
        contextError: {
          code: error.code,
          message: error.message
        }
      };
    }
    throw error;
  }

  if (evaluationHeight === null) {
    const heightResult = evaluateHeightFromContext(transaction, memo, candidate, profile, authorizationContext);
    if (typeof heightResult !== "number") {
      return heightResult;
    }
    evaluationHeight = heightResult;
  }

  if (authorizingAddress !== null && authorizingInputIndex !== null) {
    return {
      status: "VERIFIED",
      txid: transaction.txid,
      transaction,
      memo,
      candidate,
      profile,
      authorizationContext,
      evaluationHeight,
      authorizingAddress,
      authorizingInputIndex,
      authorizationDecisions
    };
  }

  return {
    status: "UNAUTHORIZED",
    txid: transaction.txid,
    transaction,
    memo,
    candidate,
    profile,
    authorizationContext,
    evaluationHeight,
    authorizationDecisions
  };
}

function evaluateHeightFromContext(
  transaction: NormalizedTransaction,
  memo: ValidatedMemo,
  candidate: MemoCandidateLocation,
  profile: ProfileRegistryEntry,
  authorizationContext: AuthorizationContext
): number | NormalizedVerificationResult {
  try {
    const decision = authorizeAddress(profile, "__tonalli-memo-height-probe__", authorizationContext);
    return decision.evaluationHeight;
  } catch (error) {
    if (authorizationContext.chainStatus === "unconfirmed" && isRegistryError(error) && error.code === "INVALID_HEIGHT") {
      return {
        status: "INVALID_VERIFICATION_CONTEXT",
        txid: transaction.txid,
        transaction,
        memo,
        candidate,
        profile,
        authorizationContext,
        contextError: {
          code: error.code,
          message: error.message
        }
      };
    }
    throw error;
  }
}
