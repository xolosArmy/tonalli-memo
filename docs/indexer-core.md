# SQLite Indexer Core

`@tonalli-memo/indexer` is a private Node.js workspace application that provides durable SQLite persistence for normalized Tonalli Memo transaction verification results.

This milestone is intentionally narrow. It does not add transaction discovery, polling, WebSockets, a daemon, an HTTP API, frontend/feed behavior, Tonalli Wallet integration, moderation APIs, or production deployment configuration.

## Boundaries

The data flow is:

```text
Chronik adapter
-> normalized transaction
Verification service
-> project-policy VerificationResult
Indexer mapper
-> stable persistence DTO
MemoStore
-> atomic SQLite persistence
```

SQLite stores stable outputs of protocol parsing and verification policy. It does not contain protocol or registry business rules.

## Schema

Schema versioning uses `PRAGMA user_version`. Migrations are compiled TypeScript constants, run in ascending order, and each migration is wrapped in a SQLite transaction. The current schema version is `1`; opening a database with a newer version throws `UnsupportedSchemaVersionError`.

The schema has three responsibilities:

- `transactions`: one row per successfully normalized transaction.
- `verification_records`: one current durable verification result per transaction for `VERIFIED`, `UNAUTHORIZED`, `NO_MEMO`, `INVALID_MEMO`, and `MULTIPLE_MEMOS`.
- `indexing_attempts`: one operational row for every `indexTransaction(...)` call.

Operational statuses such as `MEMPOOL_TIP_REQUIRED`, `INVALID_VERIFICATION_CONTEXT`, `INVALID_TXID`, `TRANSACTION_NOT_FOUND`, `CHRONIK_UNAVAILABLE`, and `INVALID_CHRONIK_RESPONSE` are attempts, not canonical verification records. Transient Chronik failures are not represented as blockchain events.

## Serialization

The stored normalized transaction snapshot is schema-versioned as `StoredNormalizedTransactionV1`. It keeps normalized inputs, duplicate input addresses, OP_RETURN outputs, block metadata, first-seen time, and finality.

`rawResponse` is excluded completely. The Chronik raw response may contain `bigint` values, unstable transport structures, or non-serializable data, so the indexer serializes only an explicit JSON-safe DTO.

OP_RETURN pushes are stored as lowercase hexadecimal strings. Diagnostics are also explicit DTOs; raw thrown errors, causes, stack traces, mutable candidate byte arrays, and complete verification result objects are not stored.

## Persistence

Each indexing call is persisted in one SQLite transaction. Completed normalized results upsert `transactions`, upsert `verification_records`, and append `indexing_attempts`. Incomplete context results with a normalized transaction may update the stable transaction snapshot but do not overwrite a completed verification record. Adapter failures append only an attempt.

Transaction upserts preserve `first_indexed_at` and update `updated_at`. Verification upserts preserve `first_indexed_at` and update `last_verified_at`. Reindexing supports mempool-to-confirmed, confirmed-to-unconfirmed, and policy/context status transitions such as `UNAUTHORIZED -> VERIFIED`, `VERIFIED -> UNAUTHORIZED`, and `INVALID_MEMO -> VERIFIED`; stale nullable fields are explicitly cleared.

Chain status is derived only from block metadata:

```ts
transaction.blockHeight === null ? "unconfirmed" : "confirmed"
```

It is not derived from evaluation height or verification status.

All indexer timestamps are Unix seconds. File-backed databases enable foreign keys, a busy timeout, WAL journaling, and `synchronous = NORMAL`; `:memory:` databases skip WAL.

## Testing And Deployment Notes

Tests use `:memory:` SQLite and fake verification services. They do not make live Chronik requests.

The package uses the native `better-sqlite3` binding pinned to `12.11.1`. CI and deployments need a Node 24-compatible environment where the native binding can install and load.
