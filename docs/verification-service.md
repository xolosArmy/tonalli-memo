# Tonalli Memo Verification Service

`@tonalli-memo/verification` is a pure TypeScript package that composes `@tonalli-memo/protocol`, `@tonalli-memo/registry` and the `ChronikTransactionAdapter` interface from `@tonalli-memo/chronik`.

The package emits a deterministic Tonalli Memo project-policy decision for one normalized transaction. It trusts the normalized transaction returned by the Chronik adapter. It does not independently verify transaction signatures, eCash consensus, transaction discovery, WebSockets, persistence, an HTTP API, a frontend, feeds, Tonalli Wallet behavior or production registry addresses.

## Verification Layers

The service keeps these layers separate:

1. Chronik availability.
2. Transaction normalization by `@tonalli-memo/chronik`.
3. Tonalli Memo namespace candidate selection and protocol validation.
4. Official profile address authorization by `@tonalli-memo/registry`.

`NO_MEMO`, `INVALID_MEMO` and `MULTIPLE_MEMOS` are distinct candidate/protocol outcomes. `UNAUTHORIZED` means a valid memo was found but no address-bearing input satisfied the selected registry policy. Chronik source failures use their own statuses and are not reported as authorization failures.

## Candidate Rule

A Tonalli Memo namespace candidate is one parsed OP_RETURN push whose first two bytes are ASCII `TM` (`0x54 0x4d`). The test is byte-based and does not decode arbitrary OP_RETURN data. This includes `TM0`, unsupported future markers such as `TM1`, and malformed values beginning with the Tonalli namespace. It excludes unrelated OP_RETURN pushes.

Candidate provenance is preserved as `{ outputIndex, pushIndex }`. Candidate order is semantic and deterministic: `outputIndex` ascending, then `pushIndex` ascending. The verifier does not rely on the supplied `transaction.opReturnOutputs` array order. Within each OP_RETURN output, push-array order is preserved when assigning `pushIndex`. Pushes are never concatenated and separate OP_RETURN outputs are never combined.

## Cardinality

Exactly one Tonalli namespace candidate is required. Zero candidates returns `NO_MEMO`, including transactions without OP_RETURN outputs, unrelated OP_RETURN pushes and malformed OP_RETURN outputs with no parsed pushes.

More than one Tonalli namespace candidate returns `MULTIPLE_MEMOS`. The verifier does not choose the first valid memo and does not accept one valid candidate when another candidate is invalid.

## Protocol Validation

For exactly one candidate, the verifier calls `decodeMemo(candidate.bytes)` and `validateMemo(decoded)`. Protocol failures return `INVALID_MEMO` with a stable `{ code, message }` diagnostic from `MemoProtocolError`.

Validated profile codes are resolved through the selected `RegistryDocument`. If a validated profile cannot be resolved from that registry, the verifier treats it as an internal invariant violation.

## Authorization

Confirmed transactions use:

```ts
{ chainStatus: "confirmed", blockHeight: transaction.blockHeight }
```

Unconfirmed transactions require a per-call `tipHeight` and use:

```ts
{ chainStatus: "unconfirmed", tipHeight }
```

The verification package does not calculate `tipHeight + 1`; that is owned by the registry package. Missing mempool tip returns `MEMPOOL_TIP_REQUIRED`. Invalid heights from the registry are reported as `INVALID_VERIFICATION_CONTEXT`, not `UNAUTHORIZED` and not a Chronik failure.

The verifier evaluates every input in `transaction.inputs` whose `address` is not `null`, in input order. It skips missing or nonstandard scripts, preserves duplicate addresses, and records a complete deterministic diagnostic list even after an authorized input is found. The first authorized input by transaction input order determines `authorizingAddress` and `authorizingInputIndex`.

The default official registry currently has empty `authorizedAddresses` arrays, so a valid memo with `DEFAULT_REGISTRY` returns `UNAUTHORIZED`.

## Service Mapping

`MemoVerificationService` receives a `ChronikTransactionAdapter` and optional `RegistryDocument` through dependency injection. Construction performs no network access.

Known `ChronikAdapterError` codes map as:

```text
INVALID_TXID             -> INVALID_TXID
TRANSACTION_NOT_FOUND    -> TRANSACTION_NOT_FOUND
CHRONIK_UNAVAILABLE      -> CHRONIK_UNAVAILABLE
INVALID_CHRONIK_RESPONSE -> INVALID_CHRONIK_RESPONSE
```

`INVALID_OPTIONS` and unknown exceptions are programming/configuration errors and propagate. Known source failures include `{ code, message }`; an optional raw `cause` may be present for inspection but is not deterministic and is not guaranteed to be serializable.

## Runtime Mutation

TypeScript result types are readonly. Result objects are not runtime deep-frozen, so callers should not treat them as immutable storage objects. Candidate byte arrays returned by candidate discovery are copied from normalized OP_RETURN pushes so later mutation by callers cannot corrupt future candidate discovery decisions.
