# Confirmed Backfill Production Rollout

This rollout changes SQLite from schema v4 to v5 with one additive table, `backfill_checkpoints`. The table records both a stable tip anchor and the confirmed-history count/cursor needed to resume newest-first Chronik pagination. It does not rewrite or delete existing transactions, verification records, attachments, feed rows, or indexing attempts.

## Pre-deploy Backup

Before starting the new binary against production data:

1. Record the current release SHA and service status.
2. Stop only the indexer service so the SQLite file is quiescent.
3. Create a timestamped SQLite backup on the same protected host. Prefer SQLite's online backup command when available:

   ```sh
   sqlite3 /protected/path/tonalli-memo.sqlite ".backup '/protected/backup/tonalli-memo-pre-v5.sqlite'"
   ```

4. Verify the backup with `PRAGMA integrity_check;`, owner/group, restrictive file mode, and a non-zero size.
5. Keep the backup outside the release directory. Do not copy it into Git, build artifacts, logs, or a public object store.

The exact protected paths are deployment-specific and must be resolved on the server before running the command. Do not use an unset variable, wildcard, repository root, or broad directory as a copy target.

## Deploy

1. Install with the locked package manager and build on a Node 24-compatible host.
2. Configure both existing values and the backfill/request variables documented in `indexer-daemon.md`.
3. Set `CORS_ORIGINS` to the exact production and approved preview Wallet origins. If nginx is the exclusive ingress, set `TRUST_PROXY=true` and configure nginx to replace forwarded client-IP headers. Do not expose `INDEX_API_TOKEN` to Wallet/Vite variables.
4. Start only the indexer service. Migration v5 runs once and is idempotent.
5. Require `GET /api/v1/health` to return liveness and `GET /api/v1/ready` to reach `200` after the initial backfill batch.
6. Confirm both TM0 and TM1 checkpoints exist and that `backfill.lagBlocks` is within policy.
7. Submit the incident TXID through the authenticated administrative command and the public request endpoint. Both must be idempotent; do not broadcast a transaction.
8. Verify `/api/v1/tx/:txid`, `/api/v1/feed`, and NFT attachment ownership.

## Rollback

The non-destructive rollback is: stop the indexer, take and verify a fresh backup, set only `PRAGMA user_version = 4`, deploy the previous release SHA, and keep the unused checkpoint table. Schema v4 code does not read the extra table, and all current feed records remain intact. Migration v5 uses `IF NOT EXISTS`, so a later redeploy safely adopts the retained table and restores `user_version = 5`.

Only if removal of the unused table is operationally required, and only after a fresh verified backup and explicit authorization for destructive schema work, drop `backfill_checkpoints` and its index. Never restore the pre-v5 backup merely to remove checkpoints after new feed records have been written, because that would discard those newer records.

## Post-deploy Watch

Monitor readiness, WebSocket connectivity, checkpoint lag, consecutive backfill failures, queue depth/rejections, and confirmed-candidate durability logs for at least two reconciliation intervals. Roll back the application if failures persist; preserve the database and logs for diagnosis.
