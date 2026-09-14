# HTTP API

The Tonalli Memo HTTP API is implemented with Fastify inside `apps/indexer`. It exposes persisted indexer state, a public TXID-only request boundary, and the existing optional administrative indexing endpoint.

CORS is disabled by default. `@fastify/cors` is registered only when `CORS_ORIGINS` contains one or more exact origins. CORS is not authentication.

## Routes

- `GET /api/v1/health`
  - Returns compatible service liveness fields plus sanitized daemon, Chronik, queue, and backfill state.
- `GET /api/v1/ready`
  - Returns `200 ready` only when the daemon, Chronik WebSocket, and confirmed reconciliation are healthy and current; otherwise returns `503 not_ready`.
- `GET /api/v1/tx/:txid`
  - Returns a public transaction summary and stored verification summary for one indexed lowercase 64-hex transaction ID.
- `GET /api/v1/feed?limit=25`
  - Returns only `VERIFIED` records from a prepared `verification_records` to `transactions` JOIN.
  - `limit` is bounded to `1..100`; default is `25`.
- `POST /api/v1/index-requests`
  - Registered only when the daemon/index-request service is enabled.
  - Accepts exactly `{ "txid": "<64 lowercase hex>" }`; additional fields and uppercase IDs are rejected.
  - Returns `202` with `queued`, `already_queued`, or `already_indexed`.
  - Returns stable `RATE_LIMITED`, `INDEX_QUEUE_FULL`, or `INDEXER_NOT_READY` errors for temporary refusal.
  - Accepts no memo content, claimed identity, verification status, NFT metadata, or client-supplied trust facts. The TXID is fetched from Chronik and evaluated by the ordinary verification pipeline.
- `POST /api/v1/admin/index`
  - Registered only when both an indexing engine and `INDEX_API_TOKEN` are configured.
  - Requires `Authorization: Bearer <INDEX_API_TOKEN>` and uses timing-safe token comparison.
  - Accepts `{ "txid": "<64 lowercase hex>", "tipHeight": 900000 }`; `tipHeight` is optional and forwarded only when present.
  - When the daemon is enabled, it uses the same coalescing queue as live discovery, backfill, and public requests.

All routes use Fastify JSON Schema for params, query strings, bodies, and public responses. Responses intentionally omit raw Chronik payloads, raw causes, stacks, internal JSON columns, SQLite handles, URLs, filesystem paths, and other internal models.

The public route is protected by the configured per-IP fixed-window rate limit and bounded daemon queue. Configure `CORS_ORIGINS` with the exact Tonalli Wallet origins (for example, `https://app.tonalli.cash`); do not use `*`. CORS is a browser boundary, not authentication. The administrative bearer token is never required or accepted by the public route.

`TRUST_PROXY` defaults to `false`. Set it to `true` only when Fastify is reachable exclusively through a trusted reverse proxy that replaces (rather than appends untrusted values to) the forwarded client-IP headers. This lets per-IP limiting work behind nginx without allowing direct clients to spoof buckets.

## Administrative Command

After building the indexer, an operator can request the existing authenticated indexing path without inspecting another process:

```sh
INDEX_API_TOKEN_FILE=/run/secrets/tonalli-index-token \
INDEX_API_URL=http://127.0.0.1:3000/api/v1/admin/index \
pnpm --filter @tonalli-memo/indexer index:tx -- \
  d1e819aefaa3610286df4f8534129a1e6afe166e07f29236acb85df3f147dabd
```

`INDEX_API_TOKEN_FILE` must be a regular file with no group or other permissions (`0600` is recommended). Alternatively, use the service's protected `INDEX_API_TOKEN` environment. Never place the token in a command argument. The command validates the TXID before networking, applies a 15-second timeout, never prints the token or raw server payload, and emits only a sanitized status object.
