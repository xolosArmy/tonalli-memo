# M0-A-WS-01 — Chronik WebSocket heartbeat recovery

Scope: **transport reliability only**. No TM0/TM1 wire bytes, POST author semantics,
SQLite schema, broadcast or wallet behavior are modified.

## Evidence (Contabo mx2, 2026-10-24 / 25 UTC)
- `tonalli-memo.service` PID 36839, checkout `c46ec9a10874ba9354a605ea67509ad3922e9832`.
- `/health` and `/ready` 200; HTTP backfill complete, reported lag 0, and checkpoint reached 972557.
- SDK live connection reported connected while `lastEventAt=2026-10-21T11:17:53.777Z`.
- One established TCP:443 socket had `lastrcv` ~309,509s while HTTP requests continued.
- Independent websocket tests opened connections but did not observe a new block,
  so they did **not** establish a defect in Chronik's event delivery.

## Change
- Send Node.js WebSocket control-frame **ping** every 30s, require a **pong** within 15s.
- Only a missed pong forces `terminate()`. Our adapter owns reconnect with
  capped exponential backoff (1s–30s), creating a **fresh SDK endpoint** and
  resubscribing to TM0, TM1 and block events exactly once per connection.
- Explicit `autoReconnect:false` avoids SDK 4.3.0's unchecked asynchronous
  retry rejection (P1) and accumulated subscriptions on reused endpoints (P2).
  HTTP reconciliation continues even if all WebSocket handshakes fail.
- Silence in block/transaction notifications **never** triggers a disconnect.
- Rebind the pong listener on every new connection and clean up timers/listeners on stop.
- Guard an in-flight `waitForOpen()` against shutdown before subscribing or
  rearming watchdog timers (P2).
- Report `websocketLastPongAt` and `websocketHeartbeatTimeouts` via existing health/ready daemon DTO.
- Preserve HTTP reconciliation as the recovery path during outages.

## Review and deployment gates
1. Pass typecheck, lint, unit tests (including half-open, quiet chain, reconnect and shutdown),
   compiled smoke tests, and CI checks.
2. Verify `chronik-client@4.3.0` in a real WebSocket integration test: `autoReconnect:false`, onEnd delivery, failed handshake retry without process exit, and bounded subscriptions across repeated sessions. An SDK upgrade can be evaluated separately.
3. Deploy separately, outside D-07 normative ratification, after approval.
4. Observe successful ping/pong timestamps, zero false restarts during quiet blocks,
   reconnection metrics, and verified TM0/TM1 indexing after a forced nonproduction disconnection.
5. Do not infer that this PR fixes the root cause before a canary confirms behavior.

No production restart, merge, deployment, or secrets involved in preparing this PR.
