# RFC-0001 — Tonalli Memo Social Interactions Protocol

- **Status:** DRAFT / PR0 — NON-NORMATIVE, NOT RATIFIED
- **Date (proposal):** 2026-10-27 (America/Mexico_City)
- **Milestone:** M1 / S0 — social protocol architecture
- **Canonical dependency:** [TM1 Core Protocol v1.0](./tm1-core-v1.0-ratification-candidate.md), ratified in [PR #39](https://github.com/xolosArmy/tonalli-memo/pull/39), merge `228d1f036643ca9be8ba85e91f8200536f3242da`
- **Scope:** documentation and design only. No protocol activation, code, fixtures, signing, Wallet broadcast, token transfer, deploy, or S0 closure.

> The keywords MUST, MUST NOT and SHOULD describe **proposed requirements for an eventual, independently ratified social extension**. They are not active TM1 Core v1.0 rules. An implementation of Core v1.0 continues to reject `REPLY=0x02` with `UNSUPPORTED_EVENT_TYPE` and unknown versions with `UNSUPPORTED_VERSION`.

## Index / delivery map

| Section | Deliverable | PR0 status |
| --- | --- | --- |
| 0 | Scope, compatibility and activation boundary | Draft |
| M1.1 | Historical comparison: Memo.cash, Member, BlockPress | Initial notes; evidence review pending |
| M1.2 | Versioning, event types and activation | Proposed |
| M1.3 | Binary REPLY format, TXID order and thread reconstruction | Proposed |
| M1.4 | Author identity and authorization | Pending |
| M1.5 | Signed off-chain likes and reaction lifecycle | Pending |
| M1.6 | RMZ `TipIntent` / `TipReceipt` contracts | Pending |
| M1.7 | Canonical vectors and byte-boundary tests | Outline / vectors pending |
| M1.8 | Threat model: spam, reorgs, phishing, replay | Outline / analysis pending |
| M1.9 | Compatibility, migration and staged activation | Pending |
| M1.10 | S0 acceptance gates and S1 hand-off | Pending |

## 0. Scope and invariants

RFC-0001 proposes a social layer for replies, reactions and RMZ tips. The initial on-chain extension is limited to **REPLY**; the off-chain reaction and tipping formats remain independent design work.

The approved TM1 Core v1.0 **POST** wire protocol, including `LOKAD_ID=544d4d00`, `version=0x01`, `event_type=0x01`, exactly two minimal pushes, explicit `author_input_index`, designated P2PKH author input, accepted sighash policy and strict UTF-8 `event_data`, remains unchanged. A valid v1.0 POST MUST remain valid after any future social activation.

The new binary payload rule below applies **only** to a future `version=0x02 / event_type=0x02` combination. It MUST NOT be interpreted as a relaxation of v1.0 POST validation. Unknown or inactive combinations MUST continue to be rejected by the existing Core parser. **Legacy indexers are not promised to silently ignore the new format**: they can classify it as an unsupported-version event and omit it from verified social feeds.

An approved RFC, by itself, would not automatically enable signing, broadcasting, wallet support, a production indexer or economic transfers; these require separate implementation and release authorizations.

## M1.1. Comparative background (initial draft)

| Precedent | Relevant design pattern | Design implication for Tonalli |
| --- | --- | --- |
| Memo.cash | On-chain posts, references/replies and social operations | Use explicit, stable references to on-chain messages |
| Member | Social conventions including moderation/reputation | Keep discovery and moderation separate from cryptographic validity |
| BlockPress | Compact transaction-encoded social actions | Keep the wire small, deterministic and versioned |
| Tonalli Memo Core v1.0 | Explicit P2PKH author input, bounded UTF-8 POST, verified transaction linkage | Preserve Core semantics while isolating social extensions |

This comparison is **architectural background**, not a wire-level claim of cross-protocol compatibility. Authoritative references, exact historical opcodes and trade-offs require separate M1.1 source review before RFC approval. A hybrid design is proposed: REPLY on-chain, reactions signed off-chain, and verifiable RMZ settlement evidence separate from intent.

## M1.2. Versioning and event types

### M1.2.1. Event dispatch

| LOKAD | Version | Event type | Payload interpretation | Current status |
| --- | --- | --- | --- | --- |
| `544d4d00` | `0x01` | `0x01` POST | Entire `event_data` is 1–212 bytes strict UTF-8 | **RATIFIED Core v1.0** |
| `544d4d00` | `0x01` | `0x02` REPLY | Not defined; MUST be rejected | Reserved / inactive |
| `544d4d00` | `0x02` | `0x02` REPLY | 32-byte binary parent TXID followed by 1–180 bytes strict UTF-8 | **RFC-0001 proposal only** |
| `544d4d00` | `0x02` | any other value | Undefined | Unsupported |

`0x02` is the proposed **envelope version**, not a retroactive change to TM1 Core v1.0 and not a ratified activation assignment. The `event_type=0x02` value was reserved by Core v1.0 and remains inactive in production until an independently authorized change to social-aware verifiers.

The new parser MUST dispatch by the *pair* `(version, event_type)`, not by event type alone. It MUST maintain the Core candidate-cardinality policy and canonical minimal push encoding. A v1 parser remains conforming if it rejects the proposed v2 message as unsupported.

### M1.2.2. Activation gates

The combination `(0x02, 0x02)` MUST NOT be considered active unless all of the following have been satisfied through explicit governance and deployment processes:

1. Ratified RFC-0001 schema, TXID byte order and parent-resolution rules.
2. Deterministic positive and negative encoding/decoding vectors and independent implementation review.
3. Documented compatibility with historical Core v1.0 POSTs, security checks and handling of TM0/TM1 application-profile differences.
4. Defined behavior for unconfirmed parents, missing previous outputs, reorgs, pagination and abuse controls.
5. Separate authorization for indexer, signing/broadcast surfaces and Wallet release; no production transactions implied by this PR.

## M1.3. Proposed on-chain REPLY

### M1.3.1. Canonical envelope

REPLY reuses the two-push TM1 shape:

```text
OP_RETURN <4-byte LOKAD_ID>
          <version(1) || event_type(1) || author_input_index(1)
           || parent_txid(32) || reply_text(1..180)>
```

Here `version=0x02` and `event_type=0x02`. `author_input_index` is a single unsigned byte (0–255) selecting the P2PKH authorizing input, under the Core authorship/sighash restrictions. It does **not** identify the message being replied to.

`event_data` is now a typed record **for this version/event pair only**:

- `event_data[0..31]`: 32 uninterpreted **binary** TXID bytes;
- `event_data[32..]`: 1–180 bytes of **strict UTF-8** reply text.

The parent field MUST NOT be UTF-8 decoded. Only the reply-text segment is decoded as UTF-8; it MUST be non-empty, byte-preserving, untrimmed, unnormalized and free of invalid sequences. Encoding MUST use minimal script pushes and no trailing opcodes or extra pushes. The TM1 output value MUST be zero.

### M1.3.2. Physical byte budget

| Component | Minimum | Maximum |
| --- | ---: | ---: |
| `version + event_type + author_input_index` | 3 | 3 |
| `parent_txid` | 32 | 32 |
| `reply_text` | 1 | 180 |
| **Second-push envelope** | **36** | **215** |
| **Complete locking script** | **43** | **223** |

At the 180-byte text maximum, the script is `OP_RETURN(1) + LOKAD push(5) + OP_PUSHDATA1(2) + envelope(215) = 223 bytes`. The `event_data` ceiling is `32 + 180 = 212` bytes. At minimum, the 36-byte second push uses a single direct-push opcode, giving a 43-byte script.

These are **proposed protocol compatibility limits**, not eCash consensus guarantees, and applications MAY impose a smaller text limit. No room remains for REPLY-specific metadata within the 212-byte event-data budget without reducing the reply-text allowance or proposing another format.

### M1.3.3. TXID serialization and endianness

**Chosen RFC proposal:** `parent_txid` uses **32 bytes in human-facing display order**: take the usual 64-character TXID hex string, decode pairs from left to right into 32 bytes, and place those bytes directly on-chain. This is commonly called display/big-endian order. This rule is a *format decision* and does not assume every Chronik API field is returned in the same byte order.

An adapter MUST explicitly identify the representation of its Chronik/client input:

- A standard displayed 64-hex TXID is decoded directly into `parent_txid`; **no reversal**.
- Only where a given upstream API supplies a documented 32-byte little-endian buffer does the adapter reverse that buffer **once** to obtain display-order bytes.
- Comparison, storage and query interfaces MUST normalize to one documented representation to prevent accidental double reversal.

Round-trip tests MUST cover TXIDs with non-palindromic byte sequences, mixed-case input normalization, invalid hex and zero/incorrect lengths. The canonical external TXID text representation is lowercase hex of the 32 stored display-order bytes.

### M1.3.4. Author verification and parent eligibility

The REPLY author is the account cryptographically authorized by **its own** designated `author_input_index` and P2PKH prevout, not the author of the parent. The Core `trusted-chronik` versus independently verified signature distinction remains applicable. Unavailable author prevouts MUST NOT yield a verified REPLY.

A parent is eligible if it resolves to a verifiable active-chain message of the same eCash network, either:

- a valid TM1 Core v1.0 `POST`, or
- a valid REPLY under a separately activated social profile.

A known TXID alone MUST NOT establish that its transaction contains an eligible message. The parent may have a different author, unless a future separately approved application policy restricts discovery or visibility.

### M1.3.5. Resolution states: separate event validity from thread linkage

A validly signed or confirmed REPLY does not automatically have a **verified parent link**. Indexers SHOULD persist raw event evidence and separately track linkage:

| Link state (proposal) | Meaning / consequence |
| --- | --- |
| `PARENT_VERIFIED` | Parent found, eligible and active; verified link may appear in the confirmed thread |
| `PARENT_PENDING` | Parent absent or lookup temporarily unavailable; retain and retry with bounded backoff |
| `PARENT_UNCONFIRMED` | Parent appears in mempool only; provisional display if application policy allows |
| `INVALID_PARENT` | Parent resolved but fails the required message/author/network eligibility checks |
| `PARENT_REORGED` | Parent no longer confirmed in the selected active chain; withdraw confirmed link pending reconciliation |
| `REFERENCE_CYCLE` | Traversal encounters a repeated node; reject the edge for verified-thread presentation |

A transient lookup error MUST NOT be conflated with a proven invalid parent. A missing parent MAY remain pending for subsequent reconciliation; implementers MUST NOT fabricate a parent to fill the gap. A UI MAY show such events in a separate unthreaded/pending area with unmistakable status, not as verified conversation links.

### M1.3.6. Deterministic thread construction

Key nodes by `(network, txid)` and persist a directed child-to-parent edge only after `PARENT_VERIFIED`. For each new or changed REPLY:

1. Verify its version/event framing and Core-derived author rules.
2. Resolve the parent and its event/author validity.
3. Reject self-reference (`child_txid == parent_txid`) and graph cycles using a visited-node set.
4. Traverse to the root POST with bounded depth, visited-node count and work budget.
5. Distinguish verified, pending, provisional and inactive edges.
6. Sort siblings deterministically by active-chain block height, transaction order within block, and TXID as tie-breaker. Unconfirmed items use a separate provisional ordering and MUST NOT be represented as final chain order.

Traversals MUST detect corrupt or cyclic index data even though constructing an on-chain self-referential TXID would be computationally impractical. Rate limiting, maximum chain depth and batching remain implementation requirements rather than new consensus rules. References MUST be retained as originally encoded, regardless of whether the link is currently displayable.

### M1.3.7. Reorgs, unconfirmed parents and reconciliation

Links whose parent or child leaves the selected active chain MUST lose confirmed-link status. The indexer SHOULD retain auditable raw transaction records, mark stale or invalidated views, and reconcile from the chain source after reconnect/reorg. Recovery MUST be idempotent by transaction and edge identity; retries MUST NOT create duplicate verified edges.

Unconfirmed parents MAY be tracked provisionally, but their continued existence and ordering are not guaranteed. Transactions invalid under the local active profile MUST NOT be promoted to verified status solely because a parent was later found.

### M1.3.8. Required deterministic test vectors (for M1.7)

The RFC cannot be ratified until vectors cover at minimum:

- Valid parent POST, valid activated parent REPLY, and an unrelated non-TM1 parent.
- Exact 1-byte and 180-byte reply text, 181-byte rejection, empty and malformed UTF-8.
- Non-palindromic display-order TXID round trips and accidental double reversal.
- Parent missing, transient Chronik failure, unconfirmed parent and parent invalidation.
- Out-of-range author index, missing author prevout, unsupported author script/sighash.
- Duplicate TM1 candidates, malformed envelope, invalid push encoding and 223/224 script-byte boundaries.
- Cycle/self-reference detection, bounded depth, deterministic sibling ordering.
- Mempool-to-confirmed transitions, reorg rollback, restart and idempotent replay.
- Backward-compatibility: v1-only parser rejects v2 without accidentally accepting REPLY as a POST.

**Non-normative illustrative construction:** With displayed parent TXID
`000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`
and reply `hola` (`686f6c61`), the proposed envelope is:
`02 02 00` + the 32 listed parent bytes + `68 6f 6c 61`.
It contains 39 bytes (3 + 32 + 4), uses a direct second-push opcode `0x27` and a 46-byte total script (1 + 5 + 1 + 39). This is a serialization illustration, **not** a claim the sample TXID exists.

## M1.4. Author identity and authorization — TODO

Specify social author-domain separation, keys, P2PKH proof inheritance, replay limits, author rotation and third-party indexing. No change to v1.0 author identity is authorized by PR0.

## M1.5. Signed off-chain reactions — TODO

Specify deterministic typed payload, cryptographic domain separation, target network and TXID, anti-replay nonces, idempotency, expiry/revocation, moderation and signature validation. A signed `LIKE` is not an on-chain payment.

## M1.6. RMZ tips: `TipIntent` and `TipReceipt` — TODO

Specify the exact token identity/standard, networks, amounts, beneficiary binding, canonical signature messages, settlement proof, double-claim prevention and reorg handling. An intent MUST NOT be treated as a settled token transfer. Do not sign, broadcast or move funds in this RFC.

## M1.7 / M1.8. Conformance vectors and threat model — TODO

Produce byte-for-byte vectors and independent decoder tests; review spam/DoS, malformed references, phishing, malicious media/links, key compromise, cross-network replay, reorgs and settlement fraud.

## M1.9 / M1.10. Activation and milestone gates — TODO

Document feature flags, indexer deployment isolation, client compatibility and explicit governance release gates. **S0 is not closed by PR0**; completion requires full RFC-0001 review and its independent acceptance criteria. S1 implementation remains out of scope until later approval.
