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

At PR preparation time, no production restart or deployment had been performed.
The later deployment and its observed results are recorded below.

## Deployment and initial production validation (Contabo mx2, 2026-10-25 UTC)

**Status: initial production deployment/heartbeat validation PASSED.**
This is *not* a demonstration of recovery from a prolonged outage in production.

### Provenance and deployment sequence
- Code PR [#29](https://github.com/xolosArmy/tonalli-memo/pull/29) passed CI and a second Codex code review (no major findings); its three earlier review threads were resolved. Squash-merged into `main` as **`6a15c2145d73d0ac484247804f3ca7463f5e63ea`**.
- Before deployment, checkout was `c46ec9a10874ba9354a605ea67509ad3922e9832`, the working tree was clean, and `tonalli-memo.service` was active under user `tonalli`.
- An isolated `ws` connection from mx2 to `wss://chronik.e.cash/ws` opened, sent a control-frame `ping`, received `pong`, and closed normally. This established network-level ping/pong compatibility, not daemon recovery behavior.
- The operator fetched `origin/main` and checked out the squash SHA above. `pnpm install --frozen-lockfile` completed with the existing lockfile; this did **not** upgrade `chronik-client@4.3.0`.
- The first `/opt/node24/bin/pnpm build` failed with `sh: pnpm: not found` because the script recursively invoked `pnpm` without `/opt/node24/bin` on `PATH`. A service restart occurred after this failed build, so that restart **was not** accepted as a validated deployment.
- After `export PATH="/opt/node24/bin:$PATH"`, `pnpm build` succeeded (registry generation, TypeScript compilation, Vite web bundle). Versions observed: Node `v24.21.0`, pnpm `9.15.4`.
- The operator restarted `tonalli-memo.service` **after** the successful build. Systemd reported PID **173264**, state `active (running)` since **20:32:29 UTC**, serving `127.0.0.1:3000` as user `tonalli`.

### Initial operational evidence
- At **20:33:15 UTC**, `GET /api/v1/health` returned **HTTP 200**, `state=running`, `websocketConnected=true`, `websocketLastPongAt=2026-10-25T20:33:03.469Z`, `websocketHeartbeatTimeouts=0`, `lastError=null`.
- At the same time, `GET /api/v1/ready` returned **HTTP 200**, `ready=true`. Confirmed HTTP backfill had `state=succeeded`, `complete=true`, checkpoint/tip height **972671**, `lagBlocks=0`, and `consecutiveFailures=0`.
- The daemon reported **49** queue items accepted and completed, **0** failed/rejected, and **0** active or queued. Chronik's reported historical discovery counts were **TM0: 0** and **TM1: 49**; this is *not* evidence of a new TM0/TM1 live event after restart.
- Three subsequent read-only `/api/v1/health` samples reported:

| Sample | `websocketLastPongAt` (UTC) | `state` | `websocketConnected` | `websocketHeartbeatTimeouts` | `ready` | `lagBlocks` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `2026-10-25T20:34:33.471Z` | `running` | `true` | `0` | `true` | `0` |
| 2 | `2026-10-25T20:35:03.474Z` | `running` | `true` | `0` | `true` | `0` |
| 3 | `2026-10-25T20:35:33.475Z` | `running` | `true` | `0` | `true` | `1` |

- Consecutive `pong` timestamp intervals were **30.003 s** and **30.001 s**, consistent with the configured 30 s probe. The transient **1-block lag** in the last reading did not fail readiness; no additional subsequent observation is claimed.
- `lastEventAt=null` in the initial post-restart health response means no live block/transaction event had yet been observed by the newly started process. Therefore, these checks **prove initial pong liveness and HTTP backfill health**, not live-event delivery or recovery of a silent TCP connection over multiple hours.

### Residual verification / closure criteria
- The initial deployment and ping/pong validation can be recorded as **completed**.
- Keep **long-duration WebSocket supervision, disconnect/reconnect behavior, and TM0/TM1 live-event recovery after an actual disruption** as follow-up operational observations; the code's automated tests cover simulated reconnection but are not a production outage test.
- The underlying cause of the October silent connection remains a **hypothesis**, not definitively proven. Do not present this canary as a root-cause proof.
- This documentary follow-up changes **no executable code, SQLite schema/data, TM0/TM1 wire format, keys, funds, or Contabo configuration**. No SQLite backup is required to record these observations.

### Record
- Scope: `M0-A-WS-01`, initial production verification only.
- Change: [PR #29](https://github.com/xolosArmy/tonalli-memo/pull/29); deployed code commit `6a15c2145d73d0ac484247804f3ca7463f5e63ea`.
- Source evidence: operator-provided shell output from mx2 (`systemctl`, `journalctl`, `/api/v1/health`, `/api/v1/ready`, three successive heartbeat samples).

