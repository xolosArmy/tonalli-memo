# Tonalli Memo Indexer Daemon

The live daemon preserves the indexing boundary:

chronik-client -> @tonalli-memo/chronik live adapter -> IndexerDaemon -> IndexingEngine -> MemoStore -> SQLite.

Chronik WebSocket events are candidate discovery only. They are never proof that a transaction is valid, authorized, or displayable. All protocol and authorization decisions remain in the verification service used by `IndexingEngine`.

## Chronik Subscriptions

The canonical Tonalli Memo envelope starts with UTF-8 `TM0|`, whose LOKAD ID is `544d307c`.

The live adapter subscribes only to Chronik's native LOKAD ID subscription for `544d307c` and to block events. It does not subscribe to all transactions, registry addresses, arbitrary scripts, or wildcard script prefixes.

## Event Mapping

Transaction events map to:

- `TX_ADDED_TO_MEMPOOL` -> `added-to-mempool`
- `TX_REMOVED_FROM_MEMPOOL` -> `removed-from-mempool`
- `TX_CONFIRMED` -> `confirmed`
- `TX_FINALIZED` -> `finalized`
- `TX_INVALIDATED` -> `invalidated`

Block events map to:

- `BLK_CONNECTED` -> `connected`
- `BLK_DISCONNECTED` -> `disconnected`
- `BLK_FINALIZED` -> `finalized`
- `BLK_INVALIDATED` -> `invalidated`

Unrecognized Chronik messages are logged at the adapter boundary and ignored.

## Mempool Context

For `added-to-mempool`, the daemon fetches the current Chronik tip height and forwards that exact value to `engine.indexTransaction(txid, { tipHeight })`. Confirmed and finalized transaction events reindex without stale mempool context.

## Transaction Lifecycle

SQLite schema version 2 adds `transactions.is_active` and `transactions.inactive_reason`. Existing rows migrate as active. Successful transaction upserts set `is_active = true` and clear `inactive_reason`.

`removed-from-mempool` marks a known transaction inactive with `REMOVED_FROM_MEMPOOL`. `invalidated` marks it inactive with `INVALIDATED`. Unknown TXIDs are safe no-ops. The verified feed includes only active transactions, while durable verification records and indexing attempts remain stored.

## Reconnect And Reconciliation

The adapter uses chronik-client `autoReconnect: true`; the daemon does not implement its own reconnect timer.

On initial connection and reconnect, the daemon:

1. Fetches the current Chronik tip height.
2. Queries unconfirmed Tonalli Memo TXIDs through the Chronik LOKAD ID endpoint.
3. Enqueues those TXIDs with the fetched tip height.
4. Reconciles a bounded number of active unconfirmed rows already stored in SQLite.

Block `connected` reconciles a bounded batch of active unconfirmed rows using one shared current tip height. Block `disconnected` and `invalidated` reconcile active confirmed rows whose stored block height is at or above the affected height. Block `finalized` is logged; transaction-level finalization events refresh individual rows.

There is no polling fallback and no complete historical backfill in this milestone.

## Queue

The daemon uses an internal bounded FIFO queue with default concurrency 1. Duplicate events for a TXID already queued or running are deduplicated. One transaction failure is logged and does not stop later work. Queue overflow is logged as a stable error.

`stop()` stops accepting new work, closes the Chronik live connection, and drains accepted work before returning or timing out.

## CLI

`DAEMON_ENABLED` accepts exactly `true` or `false` and defaults to `false`.

`CHRONIK_URLS` is required when `INDEX_API_TOKEN` is configured or when `DAEMON_ENABLED=true`. `INDEX_API_TOKEN` is not required to run the daemon.

Shutdown order is daemon, Fastify, then SQLite. Cleanup continues after individual close failures and reports an aggregate failure when needed.

Tests use fake Chronik live sources only. They do not connect to public Chronik endpoints, real WebSockets, real listeners, secrets, or persistent databases.
