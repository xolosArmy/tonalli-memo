# Tonalli Memo Web UI

## Scope

`apps/web` is a small React, Vite, and TypeScript SPA for reading public Tonalli Memo records indexed by `apps/indexer`. It is intentionally read-only.

It does not publish memos, connect wallets, sign payloads, construct transactions, moderate content, authenticate users, or backfill historical chain data.

## Architecture

The SPA owns a small API boundary in `src/api`. It uses native `fetch`, treats `response.json()` as `unknown`, checks `response.ok`, maps the public API error envelope, validates the minimum response structure with handwritten guards, supports `AbortSignal`, and omits credentials.

Default UI copy is Spanish and centralized in `src/copy.ts` so text can be changed later without adding an i18n runtime.

## Routes

- `/`: verified memo feed from `GET /api/v1/feed?limit=25`.
- `/tx/:txid`: transaction detail from `GET /api/v1/tx/:txid`.
- Any other route renders a local not-found page.

The transaction route validates that `txid` is exactly 64 lowercase hexadecimal characters before fetching.

## API Contract

The feed renders only fields exposed by the public DTOs:

- `transaction.txid`
- `transaction.chainStatus`
- `transaction.isFinal`
- `transaction.blockHeight`
- `transaction.blockHash`
- `transaction.blockTimestamp`
- `transaction.firstSeenAt`
- `transaction.firstIndexedAt`
- `transaction.updatedAt`
- `verification.status`
- `verification.protocolVersion`
- `verification.eventType`
- `verification.profileCode`
- `verification.payload`
- `verification.byteLength`
- `verification.candidate.outputIndex`
- `verification.candidate.pushIndex`
- `verification.authorizingAddress`
- `verification.authorizingInputIndex`
- `verification.evaluationHeight`
- `verification.firstIndexedAt`
- `verification.lastVerifiedAt`

The UI does not display raw transaction hex, raw OP_RETURN hex, signature payloads, transaction signatures, consensus verification, or reply metadata because the public API does not expose them.

## Environment

The public browser variable is:

```sh
VITE_API_BASE_URL=/api/v1
```

This value is shipped to the browser. Do not put `INDEX_API_TOKEN`, Chronik credentials, private endpoints, or any secret in a `VITE_*` variable.

## Vite Proxy

During development, Vite proxies:

```text
/api -> http://127.0.0.1:3000
```

Browser requests remain same-origin. The local indexer URL is a development-server proxy target and is not embedded in the production bundle.

## Local Development

Build protocol dependencies first if their `dist` output is missing:

```sh
pnpm build
```

Run the indexer API with the daemon enabled:

```sh
DB_PATH=./data/tonalli-memo.sqlite \
CHRONIK_URLS=https://chronik.example.invalid \
DAEMON_ENABLED=true \
pnpm --filter @tonalli-memo/indexer start
```

Then run the web dev server:

```sh
pnpm --filter @tonalli-memo/web dev
```

## Production Build

```sh
pnpm --filter @tonalli-memo/web build
pnpm smoke:compiled-web
```

The root build also produces `apps/web/dist/index.html`:

```sh
pnpm build
```

SPA hosting must fall back unknown paths to `index.html` so `/tx/:txid` loads correctly on refresh.

## Trust Semantics

`VERIFIED` means Tonalli Memo registry-policy verification over normalized Chronik transaction facts. It is not independent consensus verification and it is not independent signature verification.

## Known Limitations

- No publishing flow.
- No wallet connection.
- No signing.
- No transaction construction.
- No pagination or infinite scrolling because the current feed API exposes a bounded limit without a cursor.
- No historical backfill controls.
