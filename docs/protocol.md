# Tonalli Memo Protocol

Status: Draft v0 normative core

Tonalli Memo defines a compact OP_RETURN envelope for verified official eCash-native project messages.

Tonalli Memo is not a Twitter clone, Mastodon replacement or general-purpose social network in v0. The first milestone remains:

```text
Publish -> verify -> display -> share
```

This document specifies the protocol language only. Chronik integration, SQLite, indexing, wallet signing, deployment and UI display are future components and are not implemented by the protocol core package.

## v0 Envelope

```text
TM0|<type>|<profile>|<payload>
```

The marker is case-sensitive and must be exactly `TM0`.

Parsers must split only on the first three `|` delimiters. Any later `|` characters are part of the payload and must not be interpreted as structural separators.

## Fields

### `type`

`type` is exactly one lowercase ASCII letter.

Active v0 event types:

- `p` = post
- `s` = status/signal

Reserved v0 event types:

- `l` = link/reference

The decoder may recognize reserved type `l`, but the default strict encoder and validator reject it until its exact semantics are defined.

### `profile`

`profile` is a lowercase ASCII profile code. Strict validation accepts only known profile codes.

Initial immutable profile codes:

- `xa` = xolosarmy.xec
- `ty` = teyolia.xec
- `tw` = tonalli.xec
- `em` = ecashmx.xec

The meaning of a profile code must not be reassigned. Authorized posting addresses for a profile may rotate later without changing the profile code.

### `payload`

`payload` is non-empty UTF-8 text. Implementations must not trim, normalize or silently alter it.

## Byte Policy

The default limit is 80 UTF-8 bytes for the complete envelope, not the payload alone and not JavaScript string length.

An envelope of exactly 80 bytes is valid. An envelope of 81 bytes is invalid under the default policy.

Implementations should measure bytes with `new TextEncoder().encode(value).length` or an equivalent UTF-8 byte measurement.

Clients must show a byte counter before signing and must show the decoded OP_RETURN message before signing.

## Decoding And Validation

Structural decoding and strict protocol validation are separate operations.

Structural decoding:

1. Accepts a string or byte sequence.
2. Rejects invalid UTF-8 byte sequences.
3. Requires the marker, type, profile and payload fields to be present.
4. Requires marker `TM0` exactly.
5. Reports unknown `TMn` markers as unsupported protocol versions.
6. Splits only the first three separators.
7. Returns the raw type, raw profile, raw payload and complete-envelope byte length.

Strict validation:

1. Requires type to be exactly one lowercase ASCII letter.
2. Rejects unknown event types.
3. Rejects reserved event types by default.
4. Requires profile to be lowercase ASCII.
5. Rejects unknown profile codes by default.
6. Rejects empty payloads.
7. Rejects envelopes over the active byte limit.

Deterministic validation errors are part of the protocol core API. Callers should test machine-readable error codes rather than human-readable prose.

## Examples

```text
TM0|p|xa|signal now lives on eCash
TM0|s|xa|Review first. Capital fourth.
TM0|p|xa|Review|verify|publish
```

The third example has payload `Review|verify|publish`.

## Future Application State

The following fields are future indexer/UI state and are not part of the OP_RETURN envelope.

```text
chain_status:
- unconfirmed
- confirmed

verification_status:
- verified
- unverified
- invalid

visibility:
- visible
- hidden
- flagged
```

## MVP Identity Model

v0 may use a curated alias registry. Dynamic eCash alias resolution can be added later.

Official profile verification is a UI/indexer decision derived from known addresses and registry data. Alias/profile claims must not be trusted unless verified against that data.

## Reconstruction Semantics

The MVP can revalidate known TXIDs through Chronik.

Complete automatic feed reconstruction requires a later transaction-discovery mechanism, such as scanning authorized posting addresses or maintaining a canonical TXID list. Automatic complete reconstruction is not provided by the protocol envelope itself.

## Security Considerations

- OP_RETURN messages are public.
- Users must not publish secrets.
- Clients must display decoded OP_RETURN before signing.
- Clients must display fees and outputs before signing.
- The indexer must not treat database entries as source of truth.
- The indexer should be able to re-verify known posts through Chronik.
- Alias/profile claims must not be trusted unless verified against the registry.
- Tonalli Memo does not guarantee message availability through any single website, API provider or node.

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
