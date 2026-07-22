# Tonalli Memo

Status: Draft v0 MVP

Tonalli Memo is a sovereign publication layer for verified eCash-native project updates, governance signals and technical announcements from xolosArmy Network, Teyolia and Tonalli Wallet.

It is not a Twitter clone. It is not a Mastodon replacement. It is not a general-purpose social network in v0.

Tonalli Memo exists because platform risk became visible after xolosArmy's X account suspension. The project response is not to clone Twitter, but to move official public signal closer to eCash-native infrastructure.

The backend may index. The web UI may display. But the public signal should be verifiable on eCash.

Posts are public blockchain transactions. The public feed can be reconstructed from indexed eCash transactions, rather than treated as data that only exists inside one application database.

## Core Flow

```text
Tonalli Wallet -> OP_RETURN transaction -> Chronik -> Tonalli Memo indexer -> public feed -> TXID verification
```

## MVP Scope

- Official posting only.
- Short messages.
- Alias/profile mapping.
- TXID page.
- Public feed.
- Confirmation status.
- "Verify on eCash" link.

The first milestone is:

```text
Publish -> verify -> display -> share.
```

## Non-Goals

- No open public posting in v0.
- No likes.
- No followers.
- No DMs.
- No algorithmic feed.
- No media hosting.
- No moderation-at-scale problem in v0.

## Initial Official Identities

Initial official identities:

- xolosarmy.xec
- teyolia.xec
- tonalli.xec
- ecashmx.xec

Alias support may begin with a curated registry before dynamic alias resolution is implemented.

## Proposed Routes

- `/signal`
- `/signal/post/:txid`
- `/signal/profile/:alias`
- `/signal/verify/:txid`

## Wallet Context

Tonalli Wallet already has optional OP_RETURN memo support with visual inspection before signing.

For the first MVP, Tonalli Memo assumes a conservative 80-byte UTF-8 OP_RETURN payload policy unless the wallet or client policy is later changed after testing and review.

Clients should show the decoded OP_RETURN message before signing and make the transaction outputs and fees visible to the signer.

## Verification Model

Tonalli Memo should treat eCash transactions as the public verification surface.

The indexer can store parsed events, profile mappings, status flags and display metadata, but it should be able to re-verify indexed posts through Chronik.

A public feed entry should expose its transaction ID and confirmation status. A user should be able to inspect the TXID through an eCash explorer or other compatible verification tool.

## Disclaimer

Tonalli Memo is not investment advice.

Tonalli Memo does not guarantee message availability through any single website.

Tonalli Memo does not make platform risk disappear; it reduces dependence on centralized social platforms for official project signal.
