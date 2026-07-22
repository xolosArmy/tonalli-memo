# Tonalli Memo

Status: Draft v0 MVP

Tonalli Memo is a sovereign publication layer for verified eCash-native project updates, governance signals and technical announcements from xolosArmy Network, Teyolia and Tonalli Wallet.

It is not a Twitter clone. It is not a Mastodon replacement. It is not a general-purpose social network in v0.

Tonalli Memo exists because platform risk became visible after xolosArmy's X account suspension. The project response is not to clone Twitter, but to move official public signal closer to eCash-native infrastructure.

The backend may index. The web UI may display. But the public signal should be verifiable on eCash.

Posts are public blockchain transactions. Known transaction IDs can later be revalidated through Chronik instead of treated as data that only exists inside one application database. Complete automatic feed reconstruction still requires a future transaction-discovery mechanism.

## Core Flow

```text
OP_RETURN transaction -> known TXID -> Chronik revalidation -> public verification
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

Wallet clients can support OP_RETURN memo creation with visual inspection before signing.

For the first MVP, Tonalli Memo assumes a conservative 80-byte UTF-8 OP_RETURN payload policy unless the wallet or client policy is later changed after testing and review.

Clients should show the decoded OP_RETURN message before signing and make the transaction outputs and fees visible to the signer.

## Verification Model

Tonalli Memo should treat eCash transactions as the public verification surface.

Future indexers can store parsed events, profile mappings, status flags and display metadata, but known posts should be re-verifiable through Chronik.

Complete automatic feed reconstruction requires a future discovery mechanism, such as scanning authorized posting addresses or maintaining a canonical TXID list. The current protocol-core work only defines the memo envelope and validation behavior.

A public feed entry should expose its transaction ID and confirmation status. A user should be able to inspect the TXID through an eCash explorer or other compatible verification tool.

## Disclaimer

Tonalli Memo is not investment advice.

Tonalli Memo does not guarantee message availability through any single website.

Tonalli Memo does not make platform risk disappear; it reduces dependence on centralized social platforms for official project signal.
