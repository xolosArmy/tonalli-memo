# Tonalli Memo Protocol

Status: Draft v0

This protocol defines a compact OP_RETURN envelope for short eCash-native public messages.

The human-readable product name is "Tonalli Memo". The on-chain prefix is compact:

```text
TM0
```

## v0 Envelope

```text
TM0|<type>|<profile>|<payload>
```

## Fields

### `TM0`

Protocol marker for Tonalli Memo v0.

### `type`

One-letter event type.

Supported v0 types:

- `p` = post
- `l` = link/reference
- `s` = status/signal

### `profile`

Short profile code resolved by the Tonalli Memo alias registry.

Initial profile codes:

- `xa` = xolosarmy.xec
- `ty` = teyolia.xec
- `tw` = tonalli.xec
- `em` = ecashmx.xec

### `payload`

UTF-8 text payload.

## Examples

```text
TM0|p|xa|signal now lives on eCash
TM0|s|xa|Review first. Capital fourth.
TM0|l|ty|Review package updated
```

## Byte Policy

For the MVP, clients SHOULD enforce a conservative 80-byte UTF-8 payload policy for the entire OP_RETURN message unless wallet and relay policy are reviewed and changed.

Clients MUST show a byte counter before signing.

Clients MUST show the decoded OP_RETURN message before signing.

## Validation Rules

A Tonalli Memo v0 event is valid if:

1. The transaction contains an OP_RETURN output.
2. The OP_RETURN payload begins with `TM0|`.
3. The payload can be decoded as UTF-8.
4. The payload follows the format `TM0|type|profile|payload`.
5. The type is recognized.
6. The profile code exists in the local alias registry.
7. The message length is within the active client policy.
8. The indexer can associate the transaction with an authorized posting address for that profile, or else marks the event as unverified.

## Statuses

### `unconfirmed`

The transaction has been seen but has not yet reached the required confirmation threshold.

### `confirmed`

The transaction has reached the required confirmation threshold.

### `invalid`

The transaction does not satisfy the active Tonalli Memo v0 parsing or validation rules.

### `unverified`

The transaction is parseable as a Tonalli Memo event, but the indexer cannot associate it with an authorized posting address for the claimed profile.

### `hidden_from_ui`

The event is intentionally not displayed in the default public feed.

Hiding an event from the UI does not delete the on-chain transaction.

## MVP Identity Model

v0 may use a curated alias registry.

Dynamic eCash alias resolution can be added later.

Official profile verification is a UI/indexer decision derived from known addresses and registry data.

Alias/profile claims must not be trusted unless verified against the registry.

## Security Considerations

- OP_RETURN messages are public.
- Users must not publish secrets.
- Clients must display decoded OP_RETURN before signing.
- Clients must display fees and outputs before signing.
- The indexer must not treat database entries as source of truth.
- The indexer should be able to re-verify posts from Chronik.
- Alias/profile claims must not be trusted unless verified against the registry.

## Future Extensions

The following extensions are out of scope for v0:

- Replies.
- Threads.
- Reposts.
- Tipping.
- RMZ-gated posting.
- NFT lineage announcements.
- Governance polls.
- Long-form content hash anchoring.
- Multiple OP_RETURN chunks.
