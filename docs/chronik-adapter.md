# Chronik Transaction Adapter

`@tonalli-memo/chronik` isolates Tonalli Memo code from the concrete response model and error behavior of the official Chronik client. The package exposes a small transaction adapter and a pure normalization function for deterministic tests.

## Transport

The production source wraps the official `chronik-client` package and calls `ChronikClient.tx(txid)`. The adapter does not use `fetch(url).json()`, does not assume JSON transaction responses, does not hardcode `/xec`, and relies on the official client for Chronik's Protobuf transport, transaction decoding, multiple endpoint URLs, endpoint failover, and `/tx/:txid` behavior.

Tests inject a minimal `ChronikTxSource` instead of mocking fetch, Axios, or Chronik internals:

```ts
export interface ChronikTxSource {
  tx(txid: string): Promise<unknown>;
}
```

## Normalized Transaction

The public schema preserves evidence needed by later milestones:

- `txid`, `isCoinbase`, `isFinal`
- normalized inputs with `index`, `prevOut`, `outputScriptHex`, and derived `address`
- `inputAddresses` in input order with duplicates preserved
- grouped `opReturnOutputs`, each with its original output index, full script, push list, and parse status
- confirmed block fields or `null` mempool fields
- `firstSeenAt`, where Chronik `timeFirstSeen = 0` becomes `null`
- `rawResponse` for technical inspection

`rawResponse` may contain `bigint` values from the official Chronik client and is not guaranteed to be JSON-serializable. It is retained for technical inspection only; consumers must not treat it as a stable storage schema. Normalized transaction objects are not runtime-frozen, but consumers should treat them as immutable value objects.

## TXID Policy

Tonalli Memo uses canonical lowercase transaction IDs. Input TXIDs must match `^[0-9a-f]{64}$`. Empty strings, uppercase hexadecimal, non-hexadecimal characters, wrong lengths, and leading or trailing whitespace are rejected. The adapter does not trim or lowercase automatically. Invalid input throws `ChronikAdapterError` with `code: "INVALID_TXID"` before the transaction source is called.

## Blocks And First Seen Time

For confirmed transactions, the adapter maps `response.block.height`, `response.block.hash`, and `response.block.timestamp` to `blockHeight`, `blockHash`, and `blockTimestamp`. If a `block` object is present, all three fields must be present and valid; partial block metadata is rejected as `INVALID_CHRONIK_RESPONSE`.

For mempool transactions with no `block` object, those fields are `null`. `firstSeenAt` is independent of block timestamp: Chronik `timeFirstSeen = 0` or no usable value becomes `null`; positive safe integers are preserved. Negative, fractional, or unsafe integer values are rejected.

## Input Scripts And Addresses

Chronik inputs usually include the locking `outputScript` of the spent output. The adapter preserves this script as lowercase hex when present. For coinbase inputs or missing `outputScript`, `outputScriptHex` and `address` are both `null`. Missing non-coinbase spent-output scripts are accepted because the adapter preserves and normalizes available Chronik evidence; such inputs cannot participate in address authorization and no address is invented.

For standard P2PKH and P2SH scripts, addresses are derived with `Address.fromScriptHex(outputScriptHex, addressPrefix)` from `ecash-lib`. The default prefix is `ecash`; callers may provide another prefix. Prefixes are supplied by the caller, never read from Chronik responses. Empty, whitespace-containing, uppercase, and otherwise invalid prefix strings are rejected before normalization.

Syntactically valid nonstandard scripts are preserved with `address: null`. This is not treated as a transaction failure. Duplicate input addresses are preserved in input order; the adapter does not deduplicate, sort, or normalize addresses after derivation.

An input address does not prove Tonalli Memo authorization. The adapter does not yet compare addresses against the Official Profile Registry, and there are no production authorized addresses in the registry for this milestone.

## OP_RETURN Outputs

Every transaction output whose script begins with `6a` is treated as an OP_RETURN output. The adapter preserves each output separately, including the full raw script and original output index.

OP_RETURN parsing uses `getStackArray` from `ecash-lib`; the package does not call Tonalli Memo `decodeMemo()` and remains protocol-agnostic. Returned hex pushes are converted to `Uint8Array` values. Push boundaries and push order are preserved. Multiple pushes are not concatenated, and multiple OP_RETURN outputs remain grouped by output.

An empty `6a` OP_RETURN is parsed as a valid OP_RETURN output with zero pushes. Malformed or truncated push structures in otherwise valid lowercase hexadecimal OP_RETURN scripts produce `parseStatus: "malformed"`, an empty `pushes` array, and `parseErrorCode: "MALFORMED_OP_RETURN"`. A malformed OP_RETURN does not make the whole transaction unavailable; the raw script remains available for audit. Invalid field encodings such as odd-length, uppercase, or non-hex `outputScript` values are different: they are malformed Chronik response fields and reject the whole response with `INVALID_CHRONIK_RESPONSE`.

## Error Mapping

The adapter exposes stable `ChronikAdapterError` codes:

- `INVALID_OPTIONS`
- `INVALID_TXID`
- `TRANSACTION_NOT_FOUND`
- `CHRONIK_UNAVAILABLE`
- `INVALID_CHRONIK_RESPONSE`

The official Chronik client currently surfaces transaction failures as generic `Error` text, so classification is intentionally centralized in one function. Chronik transaction-not-found messages equivalent to `404: Transaction <txid> not found in the index` map to `TRANSACTION_NOT_FOUND`. Endpoint exhaustion, connection errors, indexing or unavailable nodes, and other transport failures map to `CHRONIK_UNAVAILABLE`. Classification is centralized and preserves the original error as `cause`.

Malformed required response fields map to `INVALID_CHRONIK_RESPONSE`. The normalizer validates required runtime fields and does not silently repair malformed Chronik data.

## Out Of Scope

This milestone does not decode Tonalli Memo protocol payloads, verify final Tonalli Memo profiles, perform transaction discovery, run WebSockets, add a database or persistent indexer, add an HTTP API, change Tonalli Wallet, construct transactions, sign transactions, or invent production addresses or Tonalli Memo transactions.
