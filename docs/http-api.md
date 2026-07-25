# HTTP API

The Tonalli Memo HTTP API is implemented with Fastify inside `apps/indexer`. It exposes persisted indexer state and an optional administrative indexing endpoint; it does not add transaction discovery, polling, WebSockets, frontend behavior, wallet behavior, or production registry addresses.

CORS is disabled by default. `@fastify/cors` is registered only when `CORS_ORIGINS` contains one or more exact origins. CORS is not authentication.

## Routes

- `GET /api/v1/health`
  - Returns service liveness metadata.
- `GET /api/v1/tx/:txid`
  - Returns a public transaction summary and stored verification summary for one indexed lowercase 64-hex transaction ID.
- `GET /api/v1/feed?limit=25`
  - Returns only `VERIFIED` records from a prepared `verification_records` to `transactions` JOIN.
  - `limit` is bounded to `1..100`; default is `25`.
- `POST /api/v1/admin/index`
  - Registered only when both an indexing engine and `INDEX_API_TOKEN` are configured.
  - Requires `Authorization: Bearer <INDEX_API_TOKEN>` and uses timing-safe token comparison.
  - Accepts `{ "txid": "<64 lowercase hex>", "tipHeight": 900000 }`; `tipHeight` is optional and forwarded only when present.

All routes use Fastify JSON Schema for params, query strings, bodies, and public responses. Responses intentionally omit raw Chronik payloads, raw causes, stacks, internal JSON columns, SQLite handles, URLs, filesystem paths, and other internal models.
