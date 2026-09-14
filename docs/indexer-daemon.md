# Tonalli Memo Indexer Daemon

The live daemon preserves the indexing boundary:

chronik-client -> @tonalli-memo/chronik live adapter -> IndexerDaemon -> IndexingEngine -> MemoStore -> SQLite.

Chronik WebSocket events are candidate discovery only. They are never proof that a transaction is valid, authorized, or displayable. All protocol and authorization decisions remain in the verification service used by `IndexingEngine`.

## Chronik Subscriptions

The live adapter subscribes to two protocol discovery identifiers and to block events:

- TM0 uses LOKAD ID `544d307c`, derived from UTF-8 `TM0|`.
- TM1 Draft 0.2 uses candidate LOKAD ID `544d4d00` (`TMM\0`).

The TM1 identifier remains explicitly draft. The live-discovery implementation does not finalize or universally reserve it, and it does not authorize production TM1 emission.

The adapter does not subscribe to all transactions, registry addresses, arbitrary scripts, or wildcard script prefixes. Discovery events only provide TXIDs for the ordinary indexing and verification pipeline.

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

## Confirmed Backfill And Reconciliation

The adapter uses chronik-client `autoReconnect: true`; the daemon does not implement its own reconnect timer.

WebSocket delivery is an optimization, not the durability boundary. On initial connection, after every successful reconnect, and every `BACKFILL_INTERVAL_MS`, the daemon first reconciles confirmed history and then unconfirmed transactions. The HTTP listener starts before initial reconciliation, so liveness remains reachable while readiness correctly stays false during first catch-up.

For each supported protocol (`TM0` / `544d307c` and `TM1` / `544d4d00`), confirmed reconciliation:

1. Reads the current Chronik tip height and hash.
2. Loads that protocol's durable SQLite checkpoint.
3. Probes Chronik page zero on every run because `confirmedTxs` is newest-first. It derives the exact number of prepended records from the saved history count, scans every page containing new records, and then resumes an incomplete older-history cursor.
4. Sends every candidate TXID through the same bounded queue, `IndexingEngine`, protocol/identity verification, NFT ownership verifier, and `MemoStore` used by live events and administrative indexing.
5. Advances the checkpoint only after every candidate in the batch produces a durable result and the Chronik tip remains stable.

The checkpoint table was added by additive schema migration v5. Each row stores protocol, LOKAD ID, processed cursor, stable-snapshot history count, completion flag, tip height/hash, and successful update timestamps. A completed checkpoint revisits the configurable newest-page overlap; an incomplete checkpoint probes page zero and continues older pages without starving progress. Existing transaction, verification, attachment, attempt, and feed upserts remain the single persistence path. A bounded `BACKFILL_MAX_PAGES_PER_RUN` prevents one cycle from monopolizing the process. If more history remains, the next cycle resumes from the partial checkpoint; readiness remains false while its checkpoint is incomplete or too far behind the observed tip.

Routine periodic scans are single-flight: the next timer is armed only after the current reconciliation settles. A successful periodic recovery restores the daemon to `running` when the WebSocket is connected, including after a reconnect reconciliation failed transiently. A healthy prior checkpoint remains ready while a routine refresh is running; initial synchronization, failed reconciliation, an incomplete cursor, excessive lag, WebSocket loss, or Chronik loss still makes readiness false.

If a saved anchor hash is no longer present at its height, the daemon treats this as a chain reorganization. It revalidates all active confirmed records through `IndexingEngine`, marks records returning `TRANSACTION_NOT_FOUND` inactive with `INVALIDATED`, and restarts both protocol cursors. Every reconciliation also revalidates active confirmed rows above the prior checkpoint, covering a shallow offline reorganization that leaves the older anchor block unchanged. No verification row is deleted.

Unconfirmed reconciliation then:

1. Fetches the current Chronik tip height.
2. Queries unconfirmed TXIDs from both LOKAD endpoints.
3. Fails the reconciliation attempt if either query fails, rather than presenting a partial view as complete.
4. Deduplicates and deterministically orders TXIDs.
5. Enqueues them with the fetched tip height.
6. Reconciles a bounded number of active unconfirmed rows already stored in SQLite.

A TXID returned by both discovery endpoints is enqueued only once. The daemon remains protocol-agnostic: it does not trust the discovery source to classify or validate the transaction.

Block `connected` reconciles a bounded batch of active unconfirmed rows using one shared current tip height. Block `disconnected` and `invalidated` reconcile active confirmed rows whose stored block height is at or above the affected height. Block `finalized` is logged; transaction-level finalization events refresh individual rows.

## Queue

The daemon uses an internal bounded FIFO queue with default concurrency 1. Live discovery, confirmed backfill, the public index-request endpoint, and the administrative endpoint coalesce on TXID while work is queued or running. Public requests obtain current Chronik tip context inside the queued job, so a public-first race with an unconfirmed WebSocket event cannot lose the stronger mempool verification context. Reprocessing after completion remains safe because persistence is upsert-based: feed rows, transactions, verifications, and attachments are not duplicated. Indexing attempts remain an intentional audit log.

One transaction failure is logged and does not stop later independent work. Queue saturation rejects new work with a stable result and increments an observable counter.

`stop()` rejects public and administrative indexing work immediately, closes the Chronik live connection, and gives accepted reconciliation plus queue work one shared bounded shutdown window. Reconciliation cooperatively stops at Chronik await boundaries; a stuck external request cannot extend SIGTERM shutdown indefinitely.

## CLI

`DAEMON_ENABLED` accepts exactly `true` or `false` and defaults to `false`.

`CHRONIK_URLS` is required when `INDEX_API_TOKEN` is configured or when `DAEMON_ENABLED=true`. `INDEX_API_TOKEN` is not required to run the daemon.

Backfill and public request settings:

| Variable | Default | Meaning |
| --- | ---: | --- |
| `INDEX_QUEUE_LIMIT` | `1000` | Maximum waiting items; active work is reported separately. |
| `BACKFILL_INTERVAL_MS` | `60000` | Periodic confirmed reconciliation cadence. |
| `BACKFILL_PAGE_SIZE` | `100` | Chronik confirmed items per page (`1..199`). |
| `BACKFILL_MAX_PAGES_PER_RUN` | `100` | Per-protocol page budget in one cycle. |
| `BACKFILL_OVERLAP_PAGES` | `2` | Pages reread before the durable cursor. |
| `READINESS_MAX_LAG_BLOCKS` | `6` | Maximum checkpoint lag allowed by readiness. |
| `PUBLIC_INDEX_RATE_LIMIT_MAX` | `30` | Requests per source IP per window. |
| `PUBLIC_INDEX_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window. |
| `TRUST_PROXY` | `false` | Honor proxy client IPs; enable only behind an exclusive trusted proxy. |

Shutdown order is daemon, Fastify, then SQLite. Cleanup continues after individual close failures and reports an aggregate failure when needed.

Tests use fake Chronik live sources only. They do not connect to public Chronik endpoints, real WebSockets, real listeners, secrets, or persistent databases.

## Observability And Alerts

`GET /api/v1/health` remains a liveness route and now includes a `daemon` object. `GET /api/v1/ready` is the readiness gate. It returns `503` unless the daemon is running, the WebSocket is connected, Chronik has supplied a current height, the last backfill succeeded, and checkpoint lag is within `READINESS_MAX_LAG_BLOCKS`.

The daemon object exposes state, WebSocket connection, Chronik height, last live event, last durable indexing TXID/time, queued and active work, queue counters/activity, one sanitized error code/time, and backfill state/completeness/timestamps/checkpoint height/lag/failure count. It contains no endpoint, token, raw error, stack, path, or Chronik payload.

Production alert rules should use these stable signals:

- `websocketConnected == false` for 2 minutes: warning; 5 minutes: critical.
- `backfill.consecutiveFailures >= 3` or `/ready` unavailable for 3 cycles: critical.
- `queueSize >= 80%` of `INDEX_QUEUE_LIMIT` or `queueRejected` increases: warning; any `INDEX_QUEUE_FULL` response: page if sustained.
- Log message `Confirmed Tonalli candidate was not processed durably.`: critical candidate gap; the structured context contains protocol, TXID, and verification status.
- `backfill.lagBlocks > READINESS_MAX_LAG_BLOCKS`: critical until reconciliation catches up.
- `backfill.complete == false` after the expected catch-up window: critical even if several candidates share a recent block height.
