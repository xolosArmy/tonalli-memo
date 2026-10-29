# RFC-0001 — Tonalli Memo Social Interactions Protocol

- **Status:** PROPOSED — NOT RATIFIED (DRAFT / PR0, non-normative)
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
| M1.3 | Binary REPLY format, TXID order and thread reconstruction | Proposed; one regtest display-order vector recorded, not ratified |
| M1.4 | Author identity and authorization | Proposed; Codex reviewed |
| M1.5 | On-chain likes, reactions and revocation transactions | Proposed |
| M1.6 | Atomic on-chain XEC/RMZ tips and derived TipReceipt | Proposed; ALP/eMPP integration unratified; no transfer executed |
| M1.7 | Canonical vectors and byte-boundary tests | Synthetic corpus plus one regtest reference pair; M1.7.4 remainder pending |
| M1.8 | Threat model: spam, reorgs, phishing, replay | Threat register documented; mitigation evidence pending |
| M1.9 | Compatibility, migration and staged activation | Proposed; operational proof pending |
| M1.10 | S0 acceptance gates and S1 hand-off | Proposed; S0 OPEN; S1 NOT AUTHORIZED |

## 0. Scope and invariants

RFC-0001 proposes a social layer in which **every state-changing social action** (REPLY, reaction, reaction withdrawal and RMZ tip) MUST have an identifiable on-chain transaction or verifiable on-chain settlement record. REPLY and reactions are proposed as independently authorized TM1 social v2 transactions. RMZ tips require an actual on-chain token transfer; the token-specific settlement/linking design remains separate and pending. Off-chain caches and notifications MAY assist discovery but MUST NOT become authoritative social events.

The approved TM1 Core v1.0 **POST** wire protocol, including `LOKAD_ID=544d4d00`, `version=0x01`, `event_type=0x01`, exactly two minimal pushes, explicit `author_input_index`, designated P2PKH author input, accepted sighash policy and strict UTF-8 `event_data`, remains unchanged. A valid v1.0 POST MUST remain valid after any future social activation.

The new binary payload rule below applies **only** to a future `version=0x02 / event_type=0x02` combination. It MUST NOT be interpreted as a relaxation of v1.0 POST validation. Unknown or inactive combinations MUST continue to be rejected by the existing Core parser. **Legacy indexers are not promised to silently ignore the new format**: they can classify it as an unsupported-version event and omit it from verified social feeds.

An approved RFC, by itself, would not automatically enable signing, broadcasting, wallet support, a production indexer or economic transfers; these require separate implementation and release authorizations. Each on-chain action has potential network fees, relay/miner-policy constraints and indexing costs; this design does not promise zero-cost likes.

## M1.1. Comparative background (initial draft)

| Precedent | Relevant design pattern | Design implication for Tonalli |
| --- | --- | --- |
| Memo.cash | On-chain posts, references/replies and social operations | Use explicit, stable references to on-chain messages |
| Member | Social conventions including moderation/reputation | Keep discovery and moderation separate from cryptographic validity |
| BlockPress | Compact transaction-encoded social actions | Keep the wire small, deterministic and versioned |
| Tonalli Memo Core v1.0 | Explicit P2PKH author input, bounded UTF-8 POST, verified transaction linkage | Preserve Core semantics while isolating social extensions |

This comparison is **architectural background**, not a wire-level claim of cross-protocol compatibility. Authoritative references, exact historical opcodes and trade-offs require separate M1.1 source review before RFC approval. An on-chain social design is proposed: both REPLY and REACTION/REACTION_REMOVE are eCash transactions authenticated by a designated P2PKH input; RMZ tips require independently verifiable on-chain token settlement. A feed or database may be derived off-chain, but no off-chain reaction signature by itself counts as a published like.

## M1.2. Versioning and event types

### M1.2.1. Event dispatch

| LOKAD | Version | Event type | Payload interpretation | Current status |
| --- | --- | --- | --- | --- |
| `544d4d00` | `0x01` | `0x01` POST | Entire `event_data` is 1–212 bytes strict UTF-8 | **RATIFIED Core v1.0** |
| `544d4d00` | `0x01` | `0x02` REPLY | Not defined; MUST be rejected | Reserved / inactive |
| `544d4d00` | `0x02` | `0x02` REPLY | 32-byte binary parent TXID followed by 1–180 bytes strict UTF-8 | **RFC-0001 proposal only** |
| `544d4d00` | `0x02` | `0x03` REACTION | 32-byte target TXID + 1-byte reaction kind | **RFC-0001 proposal only** |
| `544d4d00` | `0x02` | `0x04` REACTION_REMOVE | 32-byte target TXID + 1-byte reaction kind | **RFC-0001 proposal only** |
| `544d4d00` | `0x02` | `0x05` TIP_XEC | 32-byte binary target TXID + verified XEC payment outputs | **RFC-0001 proposal only** |
| eMPP entry `544d4d00` | `0x02` | `0x05` TIP_RMZ | 32-byte binary target TXID + verified ALP RMZ SEND in same transaction | **Separate eMPP extension proposal only** |
| `544d4d00` | `0x02` | any other value | Undefined | Unsupported |

`0x02` is the proposed **envelope version**, not a retroactive change to TM1 Core v1.0 and not a ratified activation assignment. The `event_type=0x02` value was reserved by Core v1.0 and remains inactive in production until an independently authorized change to social-aware verifiers.

The new parser MUST dispatch by the *pair* `(version, event_type)`, not by event type alone. It MUST maintain the Core candidate-cardinality policy and canonical minimal push encoding. A v1 parser remains conforming if it rejects the proposed v2 message as unsupported.

TM1 Core v1.0, section 2, requires **exactly one TM1 candidate** in a transaction. An output remains a candidate once its first data push is the TM1 LOKAD ID, including when the rest of the envelope is malformed. A transaction with more than one such output MUST be rejected as `MULTIPLE_MEMOS`. A verifier MUST NOT keep the first candidate and ignore another. Unrelated `OP_RETURN` outputs whose first push is not the TM1 LOKAD ID MAY coexist. This cardinality rule is already normative for Core v1.0. Restating it here does not activate social v2.

**Two-stage social validation (proposed v2):**

1. **Structural / event-specific validation:** for ordinary TM1 framing, enforce the TM1 candidate count, zero output value, exactly two minimal pushes, envelope bounds and supported `(version, event_type)`; for the separately proposed RMZ tip eMPP profile, enforce the independent eMPP container and ALP token-validity checks in M1.6. THEN dispatch to the matching typed-payload validator:
   - `(0x02, 0x02)` **REPLY**: `event_data = parent_txid[32] || reply_text[1..180]` (33–212 bytes). Treat the first 32 bytes as binary; ONLY `reply_text` MUST decode as strict UTF-8.
   - `(0x02, 0x03)` **REACTION** and `(0x02, 0x04)` **REACTION_REMOVE**: `event_data = target_txid[32] || reaction_kind[1]` (EXACTLY 33 bytes). Both fields are binary and MUST NOT be UTF-8 decoded, normalized or replacement-decoded. Require an approved `reaction_kind`, currently proposed `0x01` for LIKE only.
   - `(0x02, 0x05)` **TIP_XEC**: in the **ordinary two-push TM1 framing**, `event_data = target_txid[32]` (EXACTLY 32 binary bytes); ALSO verify XEC outputs according to M1.6. No UTF-8 decoding of the target TXID.
   - **TIP_RMZ** `(0x02, 0x05)`: this variant is only proposed **inside a distinct ALP/eMPP container** with a TMM-tagged eMPP app entry as defined by M1.6, *not* the ordinary two-push TM1 script. Parsing MUST first dispatch by the actual OP_RETURN container and verify an ALP SEND and a single TMM app entry; this is an additional opt-in indexer/parser profile, not a change to Core v1.0. A legacy TM1 parser MUST NOT treat an eMPP output as a valid TM1 two-push output.
   - `(0x01, 0x01)` **POST**: retain Core v1.0 validation, including strict UTF-8 over its ENTIRE `event_data`. The proposed v2 dispatch MUST NOT loosen this v1.0 requirement.
2. **Shared author verification:** AFTER the correct event-specific payload validation passes, execute the common designated P2PKH author-input checks in M1.4.2. These checks MUST NOT re-interpret an event's typed payload or impose REPLY UTF-8 rules on binary reactions.

A failure of event-specific validation MUST NOT be obscured by success in P2PKH verification, and a structurally valid event MUST NOT be marked author-verified until the independent M1.4.2 checks pass. Neither stage activates v2 before independent ratification.

### M1.2.2. Activation gates

The proposed v2 social combinations `(0x02, 0x02)`, `(0x02, 0x03)`, `(0x02, 0x04)` and `(0x02, 0x05)` (including the independently specified eMPP variant of TIP) MUST NOT be considered active unless all of the following have been satisfied through explicit governance and deployment processes:

1. Ratified RFC-0001 REPLY, REACTION and TIP schemas, TXID byte order, target/parent-resolution rules, ALP/eMPP handling and active reaction kinds.
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

**Chosen RFC proposal, still PROPOSED — NOT RATIFIED:** `parent_txid` is **32 binary bytes in the display order of the hexadecimal TXID**. Take the usual 64-character TXID hex string, decode pairs from left to right into 32 bytes, and place those bytes directly on-chain. This is commonly called display/big-endian order. This rule is a *format decision* and does not assume every Chronik API field is returned in the same byte order.

An adapter MUST identify the representation of each input before copying it:

- When the source already provides a TXID in display order, including a canonical 64-character lowercase hex string or a Chronik `txid` field in that order, decode or copy it into `parent_txid` with **no byte reversal**.
- When an adapter receives a hash that its source documents as an internal little-endian buffer, such as the 32-byte prevout hash inside a serialized transaction, reverse that buffer **exactly once** to obtain display-order bytes.
- A second reversal is an error. Reversing a value that is already in display order is also an error.
- Comparison, storage and query interfaces MUST normalize to one documented representation so the two cases above cannot be applied twice.

Round-trip tests MUST cover TXIDs with non-palindromic byte sequences, mixed-case input normalization, invalid hex and zero/incorrect lengths. The canonical external TXID text representation is lowercase hex of the 32 stored display-order bytes. Uppercase hex, a `0x` prefix, internal whitespace and any length other than 64 hex characters are non-canonical and MUST NOT be stored as-is.

#### Confirmed regtest vector

This vector was observed on an isolated regtest chain, not on mainnet. It is evidence for the byte order above. It does not ratify RFC-0001, does not authorize S1, and does not change the production parser. The production parser still rejects version `0x02`.

| Field | Value |
| --- | --- |
| Network | `regtest` |
| Evidence | PR #42 commit `081d75a762889207283ab7d4434030db30c79b41` |
| Executable corpus | PR #41 commit `efe60360b4a276465975b603b833a8eb15f8e080` |
| Parent POST TXID | `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585` |
| Parent block | height 103, `0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17` |
| Child REPLY TXID | `3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649` |
| Child block | height 104, `6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915` |
| Parent wire bytes | `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585` |
| `author_input_index` | `0` |
| Author HASH160 | `b4aca63fbf60884195ee538475b6840650273d3f` |
| Sighash | `0x41` (`ALL\|FORKID`) |
| Link | Chronik `spentBy` on POST output 1 is the REPLY input 0 |

The wire bytes are the POST TXID read left to right. They are not the reversed internal prevout encoding. At tip height 104 the lab wallet reported 2 confirmations for the POST and 1 confirmation for the REPLY. Those confirmation counts are an observation at that tip, not a permanent constant.

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

## M1.4. Author identity and authorization — proposed requirements

**Scope:** This section specifies the **shared authorship profile** for
future `version=0x02` on-chain social events: `REPLY=0x02`,
`REACTION=0x03` and `REACTION_REMOVE=0x04`. It inherits the Core v1.0
designated-input P2PKH proof and is **payload-agnostic**: event-specific
binary lengths, fields and UTF-8 checks are performed exclusively by the
typed dispatch in M1.2.1 with event definitions in M1.3 and M1.5. It
does not activate delegated signing, multisignature identities, P2SH
author inputs, or off-chain authorization. The requirements become
binding only if RFC-0001 and corresponding implementation/deployment
are independently approved.

### M1.4.1. Protocol identity versus display identity

The canonical social-event author identifier MUST be the **20-byte HASH160 public-key
hash** from the P2PKH previous output spent by the input selected by
`author_input_index`. This is the same author identity model as TM1 Core
v1.0. A CashAddr string is a network-specific presentation of that hash; it
MUST NOT replace or override on-chain evidence.

A username, profile NFT, domain name, social handle, avatar, contact list,
wallet label, database record or user-entered address MUST NOT establish
protocol-level authorship. Display clients MAY link a verified author
identifier to such metadata, but MUST distinguish unverified claims from
independently verified account-to-profile attestations.

A REPLY author **does not need to be the parent POST/REPLY author**. A link to
a valid parent proves what was referenced, not that the parent author
consented to the response or endorsed its contents. Moderation and
visibility policies belong to client/indexer application layers and MUST
NOT silently change the cryptographic author of a transaction.

### M1.4.2. Shared designated-input verification procedure

For ANY supported proposed v2 social event (including either separately
specified TIP container), the social-aware verifier
MUST first complete the **event-specific structural and payload stage**
defined in M1.2.1. Only after that stage succeeds, the verifier MUST
apply the same **payload-independent author checks** below, before
classifying that event as cryptographically verified:

1. Confirm the preceding event-specific stage established the correct
   container and unique event candidate (ordinary two-push TM1, or the
   separately defined ALP/eMPP TIP profile), plus a supported, correctly
   parsed `(version, event_type)`. Do NOT require ordinary two-push TM1
   framing when validating the ALP/eMPP TIP variant; its exact container
   rules appear in M1.6. Do NOT require REPLY formatting or
   `reply_text` UTF-8 for reactions. Do NOT parse, reinterpret or validate
   any event payload in this identity-verification stage.
2. Read `author_input_index` as an unsigned byte and require
   `0 <= author_input_index < transaction.inputs.length`.
3. Resolve the **specific spent previous output** for that input from a
   trusted active-chain or other correctly verified eCash transaction
   source. A missing, unresolvable or untrusted previous output MUST NOT
   produce an author-verified result.
4. Require that designated previous output's locking script be **standard
   P2PKH**. Require the selected input's unlocking script to consist of
   exactly **two minimal data pushes**:
   `<signature_with_hashtype> <public_key>`.
5. Require `HASH160(public_key)` to equal the 20-byte hash committed in
   that designated P2PKH previous output.
6. Require the signature's final sighash byte to be **exactly `0x41` or
   `0xc1`**, rejecting unsupported combinations, including SIGHASH_NONE
   and SIGHASH_SINGLE. These two allowed combinations commit to **all**
   transaction outputs, including the entire social event `OP_RETURN`,
   whatever its already-validated typed payload or independently specified
   ALP/eMPP container.
7. Verify cryptographic/transaction validity under active eCash rules.
   In the documented `trusted-chronik` model the verifier MAY rely on a
   trusted node/Chronik source for script validity **while still enforcing
   the explicit sighash restrictions**; offline/untrusted-source
   verification MUST independently verify the P2PKH signature using the
   correct transaction digest, prevout amount and active eCash rules.
8. Extract the author hash **only from the selected designated input**.
   Other inputs MAY fund the transaction and MAY use other valid eCash
   script types; they MUST NOT be reinterpreted as an alternative author.

The verifier MUST NOT assume the designated index is input zero, infer
ownership from a fee-paying input, or select the first address matching a
registry. Wallets MAY prefer author input index 0 as a creation convention,
not a validation requirement.

The `author_input_index` and **all event-specific fields** encoded in the
output (REPLY parent/text, REACTION/REACTION_REMOVE target/kind, or TIP
target and required payment outputs) are committed by the permitted
`SIGHASH_ALL` modes.
Applications MUST NOT attribute an altered payload to the original signature.
This proof is transaction-level authorization, **not an independent
signature embedded inside `event_data`**.

### M1.4.3. Unauthorized authorship claims and failure handling

| Attempt or condition | Required disposition under proposed social v2 profile |
| --- | --- |
| Input signature made by a different key whose HASH160 does not match the selected P2PKH prevout | Reject author verification as `INVALID_AUTHOR_SCRIPT_SIG` or `INVALID_AUTHOR_SIGNATURE`, as applicable |
| Public key and prevout appear to match, but signature/transaction is invalid | Reject with `INVALID_AUTHOR_SIGNATURE`; do not publish as verified |
| Selected input is P2SH, multisig, covenant or unknown script | Reject as `UNSUPPORTED_AUTHOR_SCRIPT` in this profile |
| Selected prevout unavailable or source trust insufficient | Withhold verified status; classify `PREVOUT_UNAVAILABLE` or explicitly pending, and retry when appropriate |
| Sighash `0x01`, SIGHASH_NONE, SINGLE or other unsupported combination | Reject with `UNSUPPORTED_SIGHASH` |
| REPLY is correctly signed by **another person's own** valid P2PKH key | Accept that key as the REPLY author if all rules pass; it is not impersonation merely because the parent author differs |
| Reply text, reaction metadata or external profile data claims to be another person | Do not alter the verified author hash; UI MAY warn, label or moderate |
| Valid key used without its owner's consent (e.g., stolen private key) | Cryptographically indistinguishable solely from on-chain data; use application-level reporting, compromise signals and prospective account/profile responses, not fictional on-chain invalidation |

All error labels above reference the Core v1.0 validation taxonomy where
available. An application-specific pending state MUST remain distinguishable
from a definitive invalid author signature. The thread linkage state in
M1.3 MUST NOT upgrade an unverified author to verified.

### M1.4.4. Funding, replay, revocation and key rotation

A third party MAY contribute other valid transaction inputs and fees.
Such sponsorship grants **no authorship** unless a separately standardized
and explicitly activated scheme says otherwise. Core's `0xc1`
(`SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_ANYONECANPAY`) MAY support
transactions with other funding inputs while maintaining commitment to
**all outputs**; this RFC does not authorize a new signing service.

Each on-chain REPLY, REACTION, REACTION_REMOVE or TIP is identified by its actual network transaction ID.
A signature authorizes a transaction under the active eCash signature rules;
it is not a portable off-chain token that grants permission to send new
messages. Indexers MUST key on-chain verification by network and TXID and
MUST NOT assume that replaying a raw signature across a different
transaction or network proves a new valid reply. Cross-network or fork
contexts require explicit network/profile separation in storage and APIs.

A P2PKH key rotation or loss MUST NOT rewrite the verified author hash of
historical POSTs and REPLYs. A later profile association between old and
new keys would require **separate, authenticated, time-scoped** evidence and
a standard for its application-level interpretation. A social profile MAY
mark a key compromised or deprecated, but this MUST NOT automatically
change historical transaction-authorship evidence.

### M1.4.5. Delegation and multisignature: explicitly out of scope

**No delegated authoring is active or specified by RFC-0001 PR0.**

A future scheme that allows an agent, shared profile, multisignature wallet,
P2SH author prevout or separate signed delegation certificate MUST be
introduced through a **distinct reviewed and ratified RFC and explicit
version/profile activation**. It MUST NOT silently interpret an existing
Core v1.0 or proposed v2 social-event P2PKH author as a different person or
authority.

Any future delegation proposal MUST specify at least: delegator and
delegate key identifiers; signature and domain separation; chain/network
scope; permitted operations and parent targets; validity interval, nonce
and replay rules; key rotation and revocation; how indexers resolve and
cache rights across reorgs; privacy and compromise recovery; deterministic
positive/negative vectors; and a migration path which preserves old
authorship assignments. Merely listing these requirements confers
**no delegation permission**.

A Wallet MAY offer a local multi-approver **workflow** without altering the
protocol author input, but the final designated author proof remains a
standard P2PKH spend that meets this section. Wallet UI approval itself
MUST NOT count as a protocol signature.

### M1.4.6. Deterministic conformance evidence to add in M1.7

Before ratification, independent fixtures and tests MUST cover:

- Valid author index 0 and a valid nonzero author index with another
  unrelated input paying transaction fees.
- Wrong public key hash, invalid signature and unsupported sighash values
  contrasted against valid `0x41` and `0xc1`.
- P2SH/multisig **designated** author inputs rejected while unrelated
  P2SH funding inputs do not invalidate the author rule.
- Author prevout unavailable, source untrusted, and correct distinction
  between `trusted-chronik` and independently verified signatures.
- Reply to a parent written by a different valid author, including
  malicious text impersonation attempts that do not change the author hash.
- Valid full-output signature commitment to each event's typed fields
  (REPLY parent/text, REACTION/REACTION_REMOVE target/kind),
  with mutated outputs no longer verifying.
- Valid binary REACTION/REACTION_REMOVE passes author verification
  despite containing non-UTF-8 TXID bytes; REPLY validates UTF-8 only
  in `reply_text`, and v1 POST validates UTF-8 across all `event_data`.
- Key rotation, historical attribution stability and compromised-key
  application flags that do not rewrite on-chain proofs.
- No implicit delegation; unsupported extra signatures, profiles or
  multisig schemes rejected or treated as nonauthoritative metadata.
- Consistent designated-input authorship for on-chain REACTION and REACTION_REMOVE, with rejection of a funded event that cannot verify its designated author.

**Ratification boundary:** M1.4 defines a candidate verification profile,
not a change to eCash consensus, not proof of a human's identity and not
permission to deploy, broadcast, move funds or sign using third-party keys.

## M1.5. On-chain reactions and likes — proposed requirements

**Governance design decision (PR0):** All publishable likes, reactions and
reaction withdrawals are **eCash transactions**, not off-chain signatures
kept in a social database. A backend MAY cache, filter, aggregate and
display state derived from the chain, but MUST NOT invent an authoritative
reaction that has no valid on-chain event. This design adds **no active event**
to TM1 Core v1.0; everything below is proposed for independently activated
TM1 social v2.

### M1.5.1. Proposed event assignments and binary envelopes

| Version | Event type | Meaning | Typed `event_data` |
| --- | --- | --- | --- |
| `0x02` | `0x03` | `REACTION` | `target_txid[32] || reaction_kind[1]` |
| `0x02` | `0x04` | `REACTION_REMOVE` | `target_txid[32] || reaction_kind[1]` |

The initial proposed `reaction_kind=0x01` means **LIKE**. Other kinds are
reserved until separately documented and authorized. Neither event value,
reaction kind nor v2 version is currently active. Both events use the
same standard, minimal two-push TM1 script framing and the same explicit
`author_input_index` P2PKH author verification as proposed REPLY in M1.4,
**not** its REPLY-only payload decoding. The index is not restricted to
input zero: any in-range unsigned index designating a qualifying P2PKH
author input is valid.

```text
OP_RETURN <LOKAD_ID>
          <version(1) || event_type(1) || author_input_index(1)
           || target_txid(32) || reaction_kind(1)>
```

`target_txid` is exactly 32 **binary** bytes in the human-readable
display-order encoding defined by M1.3.3; it MUST NOT be UTF-8 decoded.
`reaction_kind` is one unsigned byte, not Unicode text. The
`event_data` fields for either reaction type MUST be processed as a
**33-byte binary record only**; no UTF-8 validity, normalization or
replacement-decoding rule applies to these bytes. The version/event
dispatcher in M1.2.1 enforces this length and type BEFORE the separate
author-verification stage in M1.4.2.
Under these proposed version/event combinations, `event_data` is exactly
33 bytes, the envelope is exactly 36 bytes, and the complete script
is **43 bytes**:
`OP_RETURN(1) + 4-byte LOKAD push(5) + direct envelope push(1) + envelope(36)`.
A malformed length, unknown reaction kind or nonminimal push MUST be
rejected. No off-chain typed message can substitute for this transaction.

### M1.5.2. Authorship, target and verification

A reaction MUST be attributed only to the 20-byte public-key hash from
the **designated P2PKH author input** of its own valid on-chain
transaction. It MUST pass its **own binary REACTION/REACTION_REMOVE
payload rules** in M1.2.1 and M1.5.1, and then the **shared
payload-independent author-verification checks** in M1.4.2. A
reaction MUST NOT be required to satisfy the REPLY-only
`parent_txid || reply_text` layout or UTF-8 checks.
The `0x41`/`0xc1` permitted `SIGHASH_ALL` modes commit to all transaction
outputs, including the reaction target and kind. A social handle or
fee-paying input is not an author credential.

An eligible reaction target MUST resolve to a valid, recognized
TM1 Core v1.0 POST or a separately activated social REPLY on the same
network. A valid TXID that does not contain an eligible message is not
a reaction target. A missing/temporarily unavailable target does not
authorize a verified like; preserve a pending link and retry according
to the resolution principles of M1.3.5–M1.3.7. Indexers MUST distinguish
transaction/author verification from target-link verification.

### M1.5.3. Immutable action history; derived active-like state

Each valid REACTION or REACTION_REMOVE transaction is a distinct,
permanent historical event with its own TXID. A reaction removal does
**not** delete or rewrite an earlier transaction.

For a given `(network, author_hash160, target_txid, reaction_kind)`,
the confirmed **active reaction state** is derived by replaying eligible
events in deterministic selected-chain order:

- A `REACTION` sets the state **active**.
- A `REACTION_REMOVE` sets the state **inactive**.
- Repeated identical actions are valid historical events but do not add
  duplicate active likes or cause negative counts.
- An `REACTION_REMOVE` with no preceding active reaction leaves the
  state inactive; it MUST NOT be treated as removal of another author.
- A different author cannot withdraw a reaction on behalf of someone
  else simply by referencing the same target.

For confirmed events, replay order MUST be based on selected active-chain
block height, transaction position within that block and an unambiguous
TXID tie-breaker for deterministic data processing. Pending/mempool
events MAY be shown provisionally but MUST NOT be mixed into confirmed
counts without explicit provisional labeling. For visible public
aggregates, an indexer MUST count at most one **active** LIKE per
`(network, author_hash160, target_txid)`.

Counts, profile feeds, user reputation and sorting are **derived views**,
not blockchain consensus. Different moderation policies MAY hide an
event in a particular application, but MUST NOT fabricate or alter
its cryptographic identity or the canonical history.

### M1.5.4. Reorgs, spam and economic cost

If an event or its target is displaced by a chain reorganization, the
indexer MUST roll back and deterministically recompute affected active
reaction states from the selected chain. It SHOULD retain historical
transaction evidence and perform idempotent ingest/recovery without
duplicate active counts. A confirmed reaction with a pending/invalid
target MUST NOT be counted as a verified linked like until the target
passes verification.

Every REACTION and REACTION_REMOVE consumes an on-chain transaction,
potentially including a fee and UTXO/change-management cost. Wallets
SHOULD disclose costs before signing, avoid accidental duplicates, and
apply explicit rate/fee controls. Implementers SHOULD model spam,
high-volume reactions, transaction batching, mempool conflicts,
sybil behavior and chain/indexer growth. **On-chain authenticity does not
guarantee one human equals one author key**, nor does it make spam
impossible.

### M1.5.5. Required test vectors (M1.7)

Before ratification, tests MUST cover exact binary framing and 43-byte
script size; accepted and rejected `reaction_kind`; display-order TXID
round-trip; valid/invalid designated authors and sighash; a reaction
with missing/invalid target; duplicate LIKE; repeated REMOVE; two
different authors liking the same post; distinct users unable to remove
each other's like; deterministic reorg replay; unsupported v2 events in
an unmodified Core v1.0 parser; and independent encoder/decoder agreement.

**No implementation or broadcast is authorized by this draft.**

## M1.6. Atomic on-chain tips — proposed XEC and RMZ contracts

**Status: DRAFT only.** The proposed `event_type=0x05` is **not
ratified or active**. The protocol supports no actual TIP event until
separate governance and indexer/Wallet authorizations. All MUST clauses
below apply solely to the candidate social v2 profile.

### M1.6.1. Goal, assets and canonical identity

A credited tip MUST be an **actual on-chain transfer** in the same
**transaction ID (TXID)** as a cryptographically linked social TIP
declaration. There is no credited tip from a standalone off-chain
promise, separate memo-only transaction, speculative balance change
or transaction with merely nominal/zero transferred value.

The initial proposed assets are:

| Asset | On-chain representation | Amount unit |
| --- | --- | --- |
| XEC | Native eCash spendable P2PKH output(s) | Integer satoshis |
| Xolos RMZ | ALP eToken SEND; token ID `c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908` | Integer **atoms**; token decimals = **2** |

The RMZ identity and decimals follow the [public ALP genesis transaction](https://explorer.e.cash/tx/c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908) and
the [Tonalli Wallet token configuration](https://github.com/xolosArmy/RMZWallet/blob/main/src/config/rmzToken.ts). Token *ticker* alone
MUST NOT establish identity; the token ID, ALP protocol and relevant
genesis decimals MUST match. A TIP for an unrecognized or wrong token
MUST NOT be credited as RMZ.

### M1.6.2. Event type and correct author input

The new **candidate** social `event_type=0x05` identifies TIP with
`version=0x02`. Its logical envelope is:

```text
version(1) || event_type(1) || author_input_index(1)
|| target_txid(32)
```

The 32-byte `target_txid` is in the display-order serialization
specified by M1.3.3. It MUST refer to an eligible verified POST or
activated REPLY on the same network. The **sender** is independently
authenticated by that TIP transaction's designated P2PKH input using
M1.4, not by the recipient address, the first input or a wallet
profile. `author_input_index` may designate **any in-range input**;
it MUST NOT be silently hardcoded to input 0.

The recipient MUST be resolved from the **target message's own**
designated author input as recorded and verified under its original
protocol rules, yielding the target author's 20-byte HASH160.
The recipient MUST be represented by the P2PKH locking script for
that exact HASH160. Neither input zero of the parent transaction, nor
an unverified display alias, nor a mutable profile payment address
MUST substitute for the target's proven author identity in this
initial strict profile.

For the purpose of public tipping metrics, a sender whose designated
author HASH160 equals the recipient HASH160 MUST NOT be credited as
a **third-party tip**. Such self-payments MAY be flagged as
`SELF_TIP_UNCREDITED` rather than causing historical event erasure.
A valid token/XEC output to the recipient is necessary, not sufficient:
the indexer MUST also establish the correct asset, author, target
and matching transaction-level declaration.

### M1.6.3. Native XEC: standard two-push TIP

For a **native XEC tip**, the proposed ordinary TM1 social v2
framing is:

```text
OP_RETURN <TMM_LOKAD_ID[4]>
          <0x02 || 0x05 || author_input_index[1] || target_txid[32]>
```

This carries 32 bytes of **binary** `event_data` (not UTF-8),
a 35-byte envelope and a **42-byte locking script**:
`OP_RETURN(1) + LOKAD push(5) + direct envelope push(1)
+ envelope(35)`. The TM1 `OP_RETURN` output MUST have value
zero, exactly two minimal pushes, and no extra data or opcodes.
An unmodified TM1 Core v1.0 parser MUST continue to reject the
proposed v2 version.

The transaction MUST additionally contain at least one spendable,
non-OP_RETURN P2PKH output to the exact resolved target-author hash,
with positive satoshi value.

**Strict TIP_XEC funding-attribution rule (Codex P2 resolution):**
To classify any amount as a verified third-party tip in this initial
profile, the verifier MUST resolve **every transaction input's spent
previous output**, require each value-funding prevout to be standard
P2PKH controlled by the **same HASH160 as the transaction's designated
TIP author**, and require the target-author HASH160 to be different
from that tipper hash. A prevout controlled by the target author, a
different sponsor, an unknown/unsupported script or an unresolved input
MUST yield `AMBIGUOUS_TIP_FUNDING` / no verified tip credit. This
restriction is intentionally **stricter than M1.4's general allowance
for additional fee-paying inputs**. Multi-party/sponsored tipping
requires its own separately reviewed net-value attribution design.
The mere fact that an input has a valid P2PKH script does NOT prove it
belongs to the designated tipper.

Only AFTER all input ownership and output rules pass, the verified
native XEC tip amount is the positive integer sum of **only**
matching recipient outputs (excluding the OP_RETURN, fees and any
outputs to other addresses). Ordinary change to the distinct payer
HASH160 is excluded; returning a recipient's own funds as "tip"
is impossible under the strict all-input ownership requirement.
When the same hash controls the payer and recipient, classify the
transfer as `SELF_TIP_UNCREDITED`, not as third-party tipping.

**Required negative counterexample from Codex:** designated author A
spends a 1,000-satoshi prevout, target author B spends a
1,000,000-satoshi prevout, and outputs return 1,000,000 satoshis
to B and 500 to A (500 fee). A simplistic sum of B outputs would
miscredit a 1,000,000-satoshi TIP despite B receiving no new funds.
The strict funding rule MUST reject this as
`AMBIGUOUS_TIP_FUNDING` regardless of a valid TIP declaration.

A client MUST NOT infer intent from a payment output alone: the
**same transaction** must contain exactly one valid supported social
TIP declaration and a verified designated author signature committing
to **all outputs** with approved sighash `0x41` or `0xc1`.

### M1.6.4. RMZ ALP: eMPP container variant, not TM1 Core wire

RMZ is **ALP**, whose transaction token metadata is encoded in an
**eMPP `OP_RETURN OP_RESERVED` container**. Its transfer and a
separate application data push can share a TXID using ALP/eMPP.
However, an eMPP script is **not the canonical two-push TM1 script**
and cannot be reclassified as an ordinary v1 POST or proposed
two-push v2 REPLY/REACTION/TIP event.

The following is a **proposed, unratified second wire profile** for
an atomic RMZ tip, requiring an independently reviewed indexer/parser
extension:

```text
OP_RETURN OP_RESERVED
  <ALP_SEND_ENTRY>  # canonical ALP SEND for the actual RMZ token ID
  <TMM_TIP_ENTRY>   # binary bytes:
                    # TMM_LOKAD_ID[4] || 0x02 || 0x05
                    # || author_input_index[1] || target_txid[32]
```

The proposed `TMM_TIP_ENTRY` is a single **39-byte push**
(`4 + 1 + 1 + 1 + 32`); it is not a second standalone
`OP_RETURN` output. It MUST be validated using eMPP container
parsing and a distinct, explicit TMM entry matcher. The presence,
ordering and byte sizing of the real ALP SEND entry and any other
eMPP actions MUST be standardized and tested before activation.
The **complete** eMPP script MUST respect then-current eCash
relay policy, including the **223-byte compatibility budget**
where applicable. No blanket claim is made that an arbitrary
ALP SEND plus arbitrary metadata always fits.

The indexer MUST confirm the same TXID:

1. Contains a valid ALP SEND for the exact RMZ token ID,
   with token ancestry and token type validated by the trusted
   Chronik/full node source or an independent token verifier.
2. Contains **exactly one** valid proposed `TMM_TIP_ENTRY`
   for this social profile, not arbitrary unrecognized substitutes.
3. Has the required designated P2PKH author input, sighash
   restrictions and full transaction/script validity under M1.4.
   In the initial strict RMZ tipping profile, the designated
   author MUST control a **valid RMZ-bearing input**; all RMZ
   inputs whose atoms fund the transfer MUST be attributable to
   that same author HASH160. Ambiguous multi-owner RMZ spending
   MUST NOT be reported as a third-party tip by an unrelated
   payer without an independently approved attribution rule.
4. Assigns a **strictly positive** quantity of valid RMZ
   **atoms** to one or more token-carrying outputs whose
   actual P2PKH locking scripts match the verified
   `target_txid` author hash. The credited amount is the
   integer sum of RMZ atoms **actually assigned** to these
   outputs, not their attached XEC dust value.
5. Does not double-count sender change, dust-only outputs,
   invalid/burned token outputs, another token ID, replayed
   indexer records or an unrelated ALP transfer.

If current eMPP/Chronik/Wallet behavior fails any of these
assumptions, the RFC MUST remain **unactivated**, or be revised
through a separate, reviewed protocol decision. It MUST NOT
fall back to two unlinked transactions while claiming atomic
linkage. The proposal does not change TM1 Core v1.0 or imply
that its legacy indexer understands eMPP/TMM entries.

### M1.6.5. TipIntent, TipReceipt and verification states

`TipIntent` is a **local, nonauthoritative wallet proposal**
containing the network, target TXID, verified recipient HASH160,
asset ID or XEC, proposed integer amount, any fee preview, and
expected transaction output structure. A UI MAY prepare and
display this draft, but it is **not a published social action,
payment, on-chain receipt, or confirmed donation**. It MUST NOT
be counted or broadcast merely because a user opened a tip UI.
Any publishable TIP event occurs in the final on-chain
transaction, as required by M1.6.3 or M1.6.4.

`TipReceipt` is a **deterministic, independently reconstructible
indexer result**, not an assertion or transaction signed by a
social frontend. Its canonical evidence MUST identify at least
`(network, txid, target_txid, tipper_author_hash160,
recipient_hash160, asset_id, asset_protocol, amount_in_base_units,
settlement_state)` and the exact credited output indices.
For RMZ, `asset_protocol = ALP` and `asset_id` is the verified
token ID above. For XEC, use the native asset identifier and
integer satoshis.

A receipt MUST NOT be classified `SETTLED` merely because
a sender signed a draft or a mempool transaction was seen.
Applications MUST distinguish `PENDING` (not yet confirmed),
`SETTLED` (confirmed in selected active chain with valid
transfer/link), `REORGED`, `INVALID_ASSET`,
`INVALID_RECIPIENT`, `INVALID_AUTHOR`,
`INVALID_TARGET`, `NO_VALUE_TRANSFER` and
`SELF_TIP_UNCREDITED`. Finality claims require separately
documented trusted chain/finality evidence.

### M1.6.6. Fraud resistance, aggregation and Wallet authority

The indexer MUST key credited receipts by `(network, txid)`;
repeated indexing MUST be idempotent. A TXID MUST NOT be
double-counted as multiple social tips unless an explicit,
ratified multi-tip encoding defines separate uniquely
identified actions. On reorg/reconnect, receipts and
aggregates MUST be recalculated against the active chain,
without rewriting historical evidence or claiming a reverted
transfer is settled. Missing target messages, absent
author/funding prevouts, multi-owner TIP_XEC funding,
untrusted token proofs or unsupported
script variants MUST fail closed for **verified tip credit**.

The application MUST NOT present a social tipping total as
a cryptographic proof of genuine human reputation. Self-tips,
coordinated sybil payments, wash tipping and address rotation
can inflate totals; any public reputation or ranking formula
requires a separate, transparent abuse-control policy.

Only an explicitly authorized **noncustodial Wallet**
MAY construct, present and sign a user's actual XEC/ALP
transfer. A social frontend MAY request a payment draft or
deep-link, but MUST NOT request private keys/seed phrases,
bypass recipient and fee confirmation, silently rebind a
target author, or exercise signing/broadcast privileges.
The Wallet MUST display the resolved recipient, asset/token
identity, amount, fee and linked post before approval.

### M1.6.7. Required deterministic vectors and gates

Before any ratification or release, M1.7 MUST include:
- XEC single/multiple matching recipient outputs,
  verified all-input sender ownership, nonmatching change,
  recipient-funded/mixed-funded attacks (Codex P2), absent
  prevout and unsupported script, empty/zero payment,
  self-tip, negative/unrepresentable amount and wrong recipient;
- valid/invalid eMPP framing with an ALP SEND and **exactly
  one** TMM entry, actual 223-byte script limits, wrong
  token ID, unsupported ALP action and output token mapping;
- RMZ genesis decimals = 2, integer atoms, dust versus
  token amount, token change, mixed-owner token inputs,
  missing token history and token burns;
- in-range nonzero author input index; designated
  prevout verification; bad sighash, signature or source trust;
- correct target author index **not necessarily zero**,
  invalid/unknown target and cross-network confusion;
- replay/reorg, mempool versus confirmed, duplicate indexing,
  output-order changes, parent author key changes and
  deterministic receipts;
- independent parsers distinguishing ordinary TM1
  `OP_RETURN <LOKAD> <envelope>` from
  `OP_RETURN OP_RESERVED <ALP> <TMM>`.

**No on-chain TIP exists as an approved Tonalli Memo event
yet.** M1.6 is a design candidate only. Integration with the
existing Chronik, indexer, Tonalli Wallet and ALP libraries,
security review, reproducible fixtures and independent
governance are REQUIRED before any activation, signature,
broadcast or use of funds.

The regtest pair in M1.3.3 is a POST and a REPLY. It did not
create a TIP, transfer XEC as a tip, or transfer RMZ. The
ALP/eMPP requirements in M1.6.4 and M1.6.7 stay in force as
design and validation requirements. This draft does not
implement that container and does not authorize a transfer.

## M1.7. Deterministic conformance vectors and acceptance specification — DRAFT

**Normative status:** this section specifies the **test contract** that
must be implemented in independently reproducible fixtures before
RFC-0001 ratification. Hexadecimal examples below have been
byte-counted, but are **synthetic fragments, not existing signed
mainnet transactions, successful eCash broadcasts or proofs of
signature/parent verification**. A script-format pass is NOT equivalent
to a verified social event or a settled payment.

### M1.7.1. Fixture conventions, oracle and provenance

- Network: **eCash mainnet** for the proposed production profile;
  synthetic unit vectors use no real funds and MUST NOT be broadcast.
  Each fixture carries a separate `network` field; other network
  contexts MUST NOT be silently treated as mainnet. The confirmed
  pair in M1.3.3 is `network=regtest` and MUST stay labeled as such.
- Canonical synthetic displayed target TXID (non-palindromic):
  `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`.
  Its on-wire bytes MUST match this left-to-right display order.
  For a documented little-endian upstream byte buffer, a **single**
  reversal produces this value; a second reversal MUST fail
  target matching.
- For the byte-only examples, `author_input_index=0x01` intentionally
  exercises a **nonzero** designated author input; this is not a
  valid signed transaction until an independent fixture supplies
  enough actual inputs and a valid signature. The reference
  `LOKAD=544d4d00` remains unchanged.
- The oracle MUST expose separate outcomes for (a) script/envelope
  format, (b) designated author identity/signature, (c) referenced
  target resolution, (d) token/payment validation and
  (e) active-chain settlement. `VALID_FORMAT` MUST NOT be
  reported as `VERIFIED_TM1` or `SETTLED`.
- A fixture's manifest MUST pin SHA-256 of raw transaction bytes,
  canonical TXID, chosen network, active-chain/Chronik snapshot,
  parent and author prevout scripts/values, token ancestry,
  expected error/state and independent encoder/decoder outputs.
  Non-chain synthetic fixtures MUST be clearly marked as synthetic.

### M1.7.2. Exact synthetic OP_RETURN scripts

Every hex string includes **the entire script** beginning with
`OP_RETURN=6a`, followed by the minimal four-byte LOKAD push
`04544d4d00`, then the second push opcode and contiguous envelope.

| ID | Event / expected structural outcome | Script length |
| --- | --- | ---: |
| S-01 | REPLY with text `a`; `VALID_FORMAT`, target/author verification separately pending | 43 |
| S-02 | REPLY with a raw `ff` byte as text; reject `INVALID_UTF8` | 43 |
| S-03 | REPLY with 180 ASCII `a` bytes; `VALID_FORMAT` at 223-byte boundary | 223 |
| S-04 | REPLY with 181 ASCII `a` bytes; reject `PAYLOAD_TOO_LARGE`, script=224 | 224 |
| S-05 | REACTION LIKE kind `01`; `VALID_FORMAT`, binary target not UTF-8 decoded | 43 |
| S-06 | REACTION_REMOVE LIKE kind `01`; `VALID_FORMAT` | 43 |
| S-07 | REACTION unknown `reaction_kind=02`; reject `UNSUPPORTED_REACTION_KIND` (proposed extension error) | 43 |
| S-08 | TIP_XEC format; `VALID_FORMAT` only, **not** evidence of transfer | 42 |

**S-01 — REPLY positive structure**

```hex
6a04544d4d0024020201000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f61
```

**S-02 — REPLY invalid UTF-8**

```hex
6a04544d4d0024020201000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1fff
```

**S-03 — REPLY 180-byte text, exact 223-byte script**

```hex
6a04544d4d004cd7020201000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161
```

**S-04 — REPLY 181-byte text, exact 224-byte script (reject)**

```hex
6a04544d4d004cd8020201000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f61616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161
```

**S-05 — REACTION LIKE**

```hex
6a04544d4d0024020301000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01
```

**S-06 — REACTION_REMOVE LIKE**

```hex
6a04544d4d0024020401000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01
```

**S-07 — REACTION unsupported kind**

```hex
6a04544d4d0024020301000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f02
```

**S-08 — TIP_XEC binary declaration only**

```hex
6a04544d4d0023020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
```

For S-05/S-06/S-07, the 33-byte typed data is
`target_txid[32] || reaction_kind[1]` and MUST NOT be
UTF-8-decoded, even if some of its byte sequences happen to
be valid UTF-8. For S-01/S-02/S-03/S-04, **only** the text
after the first 32 bytes requires strict UTF-8 decoding.
A Core v1.0-only parser MUST continue to reject all v2
events without altering valid historical v1 POSTs.

**S-09 — RMZ eMPP application entry (partial, NOT an eMPP tx):**

```hex
544d4d00020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
```

S-09 is exactly **39 bytes**:
`TMM_LOKAD[4] || version[1] || TIP_EVENT[1] ||
author_input_index[1] || target_txid[32]`.
An eMPP push of this entry uses minimal direct-push opcode
`0x27`. This entry ALONE is **not** a valid ALP SEND,
an executable complete eMPP script or a valid token
payment. A complete positive eMPP sample MUST wait for
independently verified ALP SEND encoding, output index and
token input fixture data and satisfy the total-size
compatibility ceiling applicable to that transaction.
**Do not invent an ALP encoding to make a positive test pass.**

### M1.7.3. Transaction-level positive and negative matrices

The following IDs are **specified cases**, not yet committed
independently executable transaction fixtures. Each case MUST
include raw bytes, expected oracle classifications and
independent reproduction before M1.10 acceptance.

| ID | Case / deterministic arrangement | Expected oracle |
| --- | --- | --- |
| A-01 | REPLY, designated input index **1**, prevout P2PKH key hash matches public key, valid `0x41` signature | `AUTHOR_VERIFIED` after all required checks |
| A-02 | Same as A-01 with permitted `0xc1` and an extra fee-paying input | `AUTHOR_VERIFIED` (REPLY only) |
| A-03 | Referenced input index out of range or its prevout unavailable | `AUTHOR_INPUT_OUT_OF_RANGE` or `PREVOUT_UNAVAILABLE`, never verified |
| A-04 | Wrong key hash, signature or unsupported `0x01`/SINGLE/NONE sighash | `INVALID_AUTHOR_SCRIPT_SIG`, `INVALID_AUTHOR_SIGNATURE` or `UNSUPPORTED_SIGHASH` |
| A-05 | Designated author prevout P2SH/multisig or invalid unlocking push count | `UNSUPPORTED_AUTHOR_SCRIPT` or `INVALID_AUTHOR_SCRIPT_SIG` |
| P-01 | Parent verifies as eligible POST v1.0 / activated REPLY | `PARENT_VERIFIED` |
| P-02 | Parent missing with retryable Chronik outage | `PARENT_PENDING`, not false invalid-parent verdict |
| P-03 | Parent is a valid unrelated transaction without eligible TM1 message | `INVALID_PARENT` |
| P-04 | Corrupt index creates repeated-node ancestor path / self reference | `REFERENCE_CYCLE`; no verified graph edge |
| P-05 | Parent becomes unconfirmed or reorged out of active chain | `PARENT_UNCONFIRMED` or `PARENT_REORGED` with deterministic rollback |
| R-01 | Two distinct verified authors LIKE same valid target | Two active likes |
| R-02 | Same author sends two LIKEs to same target | Two events recorded; **one active** like |
| R-03 | Same author LIKE, REMOVE, LIKE across three confirmed transactions | Active-state sequence `true,false,true`; latest true |
| R-04 | Different author sends REMOVE for a LIKE by first author | First author's active state remains unchanged; removal only affects remover's own key |
| R-05 | Reorg drops final REACTION_REMOVE | Recompute active state from selected chain; never decrement twice |
| X-01 | XEC TIP: all input prevouts match designated tipper A; eligible target is B (different hash); exactly one recipient output of **1000 sats** to B plus A-only change | `SETTLED` and amount **1000 sats** only after confirmation and other checks |
| X-02 | Same XEC TIP but **two** recipient outputs of **400** and **600 sats** to B (assume scripts/relay accepted), other change to A | `SETTLED`, amount **1000 sats**, not fee or change |
| X-03 | TIP target B but payment output points to C instead of B | `INVALID_RECIPIENT`; **0 credited** to B |
| X-04 | TIP output has zero payable value, recipient missing, or sender equals target author | `NO_VALUE_TRANSFER` or `SELF_TIP_UNCREDITED`, no positive social amount |
| X-05 | **Codex P2 counterexample:** designated tipper A input=1000 sats; target B input=1,000,000 sats; outputs B=1,000,000, A=500, fee=500 | `AMBIGUOUS_TIP_FUNDING`; **0 credited**, despite B matching a large output |
| X-06 | Third-party C funds XEC TIP or any prevout cannot be resolved/attributed to A | `AMBIGUOUS_TIP_FUNDING`; no verified tip credit |
| X-07 | TIP declaration is signed without matching XEC destination output or with unsupported sighash | No `TipReceipt SETTLED` |
| T-01 | RMZ `ALP SEND` for **verified exact token ID**, target author B receives **125 atoms**; sender A owns all RMZ token inputs and A != B | `SETTLED`, amount **125 atoms = 1.25 RMZ** after valid atomic eMPP-TMM and confirmation |
| T-02 | RMZ token transfer output carries XEC dust but **zero** RMZ atoms to B | `NO_VALUE_TRANSFER`; do not count XEC dust as RMZ |
| T-03 | RMZ SEND but incorrect token ID, SLP instead of ALP or invalid/burned token provenance | `INVALID_ASSET`; no credited RMZ |
| T-04 | RMZ output to non-target hash or attribution from mixed-owner token inputs | `INVALID_RECIPIENT` or `AMBIGUOUS_TIP_FUNDING`; no credited RMZ |
| T-05 | Multiple TMM TIP entries, eMPP missing ALP SEND, invalid entry size or over policy limit | Reject social TIP classification; preserve legitimate unrelated ALP handling when applicable |
| T-06 | Source reorg removes token transfer after a confirmed receipt | `REORGED`, remove settled aggregates and reconcile idempotently |
| C-01 | Unsupported v2 interpreted by v1.0-only parser, v1 POST unchanged | v2 rejects `UNSUPPORTED_VERSION`; v1 POST remains valid |
| C-02 | Duplicate TM1 candidates or malformed push / overlong ordinary TM1 script | Reject relevant v2 TM1 candidate; no verified social event |
| C-03 | Different TXID byte order / wrong chain / mutated target bytes | No valid verified parent/target association |
| C-04 | Re-index same TXID/transaction across restart and websocket reconnect | One logical verified event and one tip receipt per eligible TXID |

For X-02, fixture output values MUST satisfy then-current eCash
relay/dust requirements; the listed 400/600 are **logical
amount assertions**, not a promise that those output amounts
are broadcastable. Test generators MUST use relay-valid
amounts when constructing integration fixtures.

### M1.7.4. Release gate for executable test corpus

Before RFC-0001 acceptance, the repository MUST contain
machine-readable positive and negative fixtures with fixed raw
transaction bytes, deterministic expected verdicts and
independent encoder + decoder comparison for **all**
supported event/container combinations, including ALP/eMPP.
A parser-only success is insufficient for TIP settlement.

Acceptance MUST separately prove deterministic script lengths,
validated signature/prevout rules, active-chain target
resolution, token ancestry, recipient output attribution,
reorg rollback, idempotence and hostile/synthetic
multi-owner transaction handling. The independently
reviewed output must include the test command, CI run
reference and reviewed commit SHA. Any incomplete token
encoding or signature tests MUST remain listed as a
blocking gate rather than passed by inspection.

The regtest POST/REPLY raw transactions recorded from PR #42
are one executable reference for display-order parent bytes,
a single P2PKH author at input 0, and the spent output link.
They do **not** close M1.7.4. The following remain explicit
S0 blockers: ALP/eMPP SEND plus one TMM entry and its token
ancestry; XEC and RMZ tip settlement fixtures, including the
ambiguous-funding counterexample; reaction and unlike replay;
reorg rollback and restart idempotence; author indices other
than the single observed index 0; and any change that would
make the production parser accept version `0x02`. None of
those items is authorized by this draft.

## M1.8. Threat model and required mitigations — DRAFT

### M1.8.1. Assets, actors and security boundaries

**Protected assets:** on-chain transaction/author attribution,
immutable parent/reaction linkage, noninflated likes,
noninflated XEC/RMZ tip amounts, correct recipient,
private signing keys, accurate chain-state classification
and users' ability to understand what is signed.

**Adversaries:** malicious webpage, fake token/recipient
metadata, compromised social indexer, malicious Chronik
upstream, attacker who can publish ordinary eCash
transactions, spammer with many keys, colluding
tipper/recipient or participant with wallet/keys
compromised. We do not assume the network, clients or
indexers are always online, honest or final.

**Trust boundaries:** untrusted input/URLs and social UI;
noncustodial wallet confirmation and signing;
raw transaction/prevout verification;
Chronik node and token-validation model; deterministic
indexer/database; application-visible reputation.
Cryptographic authenticity of a public-key hash does
**not** prove a unique human identity, charitable intent,
non-coercion, or economic reputation.

### M1.8.2. Attack-to-control matrix

| ID | Threat / failure mode | Severity | Mandatory proposed defense / evidence |
| --- | --- | --- | --- |
| SEC-01 | **Recipient phishing:** modified profile or deeplink substitutes attacker wallet for post author | Critical | Wallet independently derives verified target-author HASH160 from target TXID; displays recipient and network; refuses mismatched script (X-03) |
| SEC-02 | **Author spoofing:** attacker substitutes `author_input_index=0` or selects unrelated fee input | High | Verify selected in-range index, prevout P2PKH HASH160, unlocking script, signature and supported sighash (A-01–A-05) |
| SEC-03 | **Mutating signed social intent:** change target/reaction/amount/output after user preview | Critical | Require approved full-output SIGHASH_ALL variants; recalculate and re-preview final raw transaction before signing (A-04, X-07) |
| SEC-04 | **Like/unlike replay or duplicates:** count repeated events as multiple active likes | Medium | Immutable history + idempotent key `(network, author, target, kind)` derived from selected chain, deterministic last event (R-01–R-05) |
| SEC-05 | **Recipient-funded XEC spoof:** count recipient's own input/change as tip | Critical | For TIP_XEC require ALL funding prevouts owned by designated tipper, no recipient inputs, no third-party/ambiguous inputs (X-05, X-06) |
| SEC-06 | **Wrong RMZ identity/amount:** false ticker, token ID, output mapping, decimals or dust mistaken for atoms | Critical | Verify ALP ancestry, exact RMZ ID, token type, decimals, atom allocations and actual P2PKH receiver (T-01–T-04) |
| SEC-07 | **eMPP injection / confusion:** misparse ALP+TMM entry as ordinary TM1 or double-count duplicate entries | High | Container-specific strict parsing, minimal pushes, uniqueness, output constraints and 223-byte compatibility tests (T-05, C-02) |
| SEC-08 | **Reorg / double-count:** confirmations revert or websocket replay indexes twice | High | Chain-aware rollback/replay, idempotency by TXID, `PENDING` vs `SETTLED` vs `REORGED` (T-06, C-04) |
| SEC-09 | **Unknown/malicious parent:** phantom reply/like to nonexistent or non-TM1 tx | High | Verify parent event, network and chain status; bounded retries; do not credit pending/invalid targets (P-02–P-05) |
| SEC-10 | **Indexing DoS:** huge thread depth, duplicate memos, malformed UTF-8 or excessive eMPP bytes | High | Strict script limits, typed validators, bounded traversal/work budget, pagination, rate limits and no unbounded retries (S-02–S-04, P-04, C-02) |
| SEC-11 | **Key compromise / delegated signing spoof:** valid key controlled by malicious actor, rogue P2SH or registry override | High | Require canonical P2PKH proof, explicit no-delegation profile, compartmentalize Wallet approvals, preserve historical evidence (A-03–A-05) |
| SEC-12 | **Sybil/wash tipping:** self-transfers or collusive addresses artificially inflate popularity | High | Zero credit for self-tips; separately label transfer totals as on-chain value, never verified human reputation; anti-abuse policy outside consensus (X-04, T-04) |
| SEC-13 | **Mempool conflict and premature finality:** UI advertises unsettled or RBF/reorged tip as paid | High | Provisional mempool view only; settlement requires active-chain confirmation and independent finality labeling (P-05, T-06) |
| SEC-14 | **Private-key exfiltration / fee drain:** fake social tip prompt requests seed or hides high fees | Critical | Signing only in noncustodial wallet; display final recipient, amount, token, network and fee; no seed export to web UI (X-07) |
| SEC-15 | **Cross-network and byte-order confusion:** valid-looking target links to another chain or reversed TXID | High | Key by network+TXID; display-order serialization with exact-once conversion and mismatched-parent tests (C-03) |
| SEC-16 | **Privacy correlation:** immutable P2PKH activity reveals common authors/funders and transfer history | Medium | Client disclosures and opt-in visibility; avoid false anonymity promises; protect local browsing metadata; no retroactive on-chain deletion |

Severity is a security triage proposal; it is **not** a claim
of measured attack likelihood or completed penetration
testing. A case's mapped test ID may prove a local invariant
without providing complete production-system security.

### M1.8.3. Fail-closed versus retryable outcomes

A structurally invalid event, unsupported script/sighash,
wrong token ID, wrong recipient, ambiguous funding, bad
signature or invalid linked target MUST NOT receive
`VERIFIED` or `TipReceipt SETTLED` status.

A transient Chronik outage, missing prevout, unconfirmed
parent, unresolved token history or chain reorg MUST
instead be classified distinctly as `PENDING`,
`PREVOUT_UNAVAILABLE`, `PARENT_PENDING` or `REORGED`
as appropriate, with bounded retries and auditing.
A pending item MUST NOT silently become valid merely
because the current indexer's cache contains a matching
display address. If trust is delegated to Chronik, clients
MUST disclose that trust model and MUST NOT claim
offline independent cryptographic verification.

### M1.8.4. Testable security exit criteria

M1.8 is satisfied only when each SEC-ID is mapped to
a passing fixture, integration/security test or an
explicit, reviewed and accepted **residual risk** with
owner and date; no severe risk may be silently waived.
A security review MUST examine both social client and
wallet transaction preview/signing flows independently.

M1.9/M1.10 MUST publish the active protocol/profile
boundaries and feature flags, including the ability to
disable v2 social parsing/creation, while keeping historical
Core v1.0 POST verification functional. **Neither
writing this threat model nor a green documentation CI
establishes that the listed mitigations have been
implemented or independently tested.**

## M1.9. Compatibility, deployment isolation and activation gates — DRAFT

This section defines prospective deployment requirements for the
**unratified** social v2 protocol. A documented flag is **not**
proof that the flag exists or works in production today. No
implementation, production activation, signing or transfer is
authorized by PR0, Codex review or documentation CI.

### M1.9.1. Independent profiles and default-off controls

All code paths that can produce, index, serve or display
social-v2 events MUST be explicitly gated and **OFF by
default** in production as well as in a newly installed
environment, including when a flag is missing, malformed,
unknown or fails to load. An implementation MUST fail
closed rather than silently enabling a feature because
a configuration value is absent.

The final implementation MAY use the following example
configuration names or functionally equivalent audited
controls; these strings are **examples**, not present
production settings:

| Proposed gate | Default | Guarded capability |
| --- | --- | --- |
| `ENABLE_SOCIAL_V2` | `false` | Master gate for all v2 code paths |
| `ENABLE_V2_REPLIES_WRITE` | `false` | Create/sign/broadcast new REPLY |
| `ENABLE_V2_REACTIONS_WRITE` | `false` | Create/sign/broadcast REACTION or REACTION_REMOVE |
| `ENABLE_V2_TIPS_WRITE` | `false` | Construct/sign/broadcast social XEC or RMZ TIP |
| `ENABLE_V2_INDEX` | `false` | Classify and ingest v2/eMPP social event records |
| `ENABLE_V2_READ` | `false` | Serve/display separately labeled v2-derived feeds or counters |
| `ENABLE_V2_RMZ_EMPP` | `false` | Interpret extra TMM entry within ALP/eMPP for verified RMZ TIP |

**Effective enablement** MUST require the master gate **and**
the relevant per-capability gate; the RMZ TIP path MUST
additionally require the dedicated eMPP gate. Read, ingest
and write MUST be independently disableable. No generic
`ENABLE_SOCIAL_V2=true` override may bypass the separate
security or economic gates. A frontend-visible toggle
MUST NOT serve as the sole enforcement point for an
indexer or Wallet operation.

Controls MUST be enforced server-side for indexers/APIs
and within each relevant Wallet's privileged signing
flow. Feature decisions SHOULD be logged with sanitized
environment, protocol version, binary SHA, rule set
version, and approval record; logs MUST NOT contain
seed phrases, private keys or secret payment material.
A runtime configuration change MUST NOT retroactively
reclassify v1 POSTs or turn unverified v2 messages into
verified payments.

### M1.9.2. Historical compatibility evidence

The approved TM1 Core v1.0 POST verifier and wire
contract MUST remain **unchanged** by social v2.
The legacy Draft 0.2 specification is an **historical
reference**, not a separately active protocol whose
obsolete rules can override the ratified v1.0 text.

Before any social-v2 activation, an independent
compatibility harness MUST compare baseline and candidate
implementations on a **fixed, versioned** corpus of
known-valid and known-invalid TM0 and TM1 cases,
including:

1. v1.0 POST framing, minimal pushes, strict UTF-8,
   author-input bounds and P2PKH signature constraints;
2. historical observed confirmed transactions, with
   `trusted-chronik` explicitly differentiated from
   independent signature verification;
3. application-level TM0/TM1 candidate-cardinality
   differences and documented legacy-client behavior;
4. duplicate TM1 candidates, unknown versions, P2SH
   designated inputs, invalid sighash and missing prevouts;
5. normal v1-only parsing of proposed v2
   `(0x02,0x02..0x05)` without accidental acceptance;
6. independent eMPP/TMM handling, without interpreting
   ALP/eMPP as an ordinary two-push TM1 transaction.

The same corpus, baseline snapshot SHA, candidate SHA,
expected verdicts and execution command MUST be retained
as test artifacts. Every historical v1 POST present in
this certified corpus MUST preserve its prior canonical
verification verdict and bytes. A finite corpus does
**not** prove compatibility with every possible historic
transaction; coverage limitations MUST be disclosed.

Unknown v2 formats MUST be distinguishable from invalid
v1 POSTs. A v1-only node or indexer MUST NOT be required
to accept social v2 to remain Core v1.0 conformant.
A separate optional v2 read index MAY retain unsupported
events without elevating them to the verified Core feed.

### M1.9.3. Regtest-only implementation and isolation

S1 implementation and tests MUST begin and remain in
**isolated eCash regtest** or a separately reviewed,
faithful local transaction/token test harness where a
needed regtest token or Chronik feature has not yet been
demonstrated. Such a harness MUST be explicitly
classified as simulated, not falsely reported as a
passing regtest or mainnet end-to-end test.

Before any S1 work can access transaction-creation
functions, CI/runtime policy MUST establish:

- A strict allowlist of **regtest/test-only RPC/Chronik
  endpoints and chain identifiers**; attempts to reach
  mainnet or an unidentified chain MUST fail closed.
- Isolated test-only UTXOs, token genesis fixtures,
  addresses, wallets and throwaway keys; never import
  a production seed, private key or wallet profile.
- Deterministic fee/dust and token rule fixtures,
  repeatable tests of ALP/eMPP parsing and output
  attribution, and no real-money recipients.
- Network/broadcast guardrails that prevent test
  code from signing or submitting to any production
  eCash node even if a user mistakenly supplies a
  mainnet URL or a production wallet.
- Separate permissions for read-only chain analysis,
  test-transaction assembly, signature generation,
  broadcast and deployments; the documentation stage
  grants **none** of the last four on mainnet.
- CI checks verifying all feature flags default off
  and no production credentials or keys occur in
  fixtures, logs, build artifacts or test snapshots.

The mere existence of an eCash sandbox is not evidence
that ALP/eMPP integration works there. Inability to
reproduce the target token behavior in an isolated
environment is an **open gate**, not grounds to test
with real funds.

### M1.9.4. Staged promotion, rollback and reorg safety

The proposed release sequence is:

| Stage | Allowed scope | Exit evidence |
| --- | --- | --- |
| `D0` RFC documentation | PR0 Draft, reviews, synthetics, architecture | Design and blocking gaps recorded; no runtime changes |
| `D1` Offline parser harness | Local fixtures, signed synthetic transactions and independent decoding, **no broadcast** | All relevant M1.7 checks reproduced |
| `D2` Isolated regtest | Testnet-only on-chain-like submission, ingest, rebuild and reorg fault injection | Integration/security checks, repeatability |
| `D3` Production read-only shadow evaluation | **Not authorized by this RFC**; separate approval and read-only credentials required | Explicitly documented comparison, privacy and limits |
| `D4` Mainnet social write | **Not authorized by this RFC or by S1** | Independent future governance approval, security and release gate |

These stage names express a proposal, not existing
infrastructure or approvals. S0 acceptance never
implies D3 or D4 permission.

A documented, rehearsed rollback MUST disable v2
write, ingest and read **independently**, preserve
Core v1.0 and accepted TM0 functionality, and leave
the original immutable chain transactions untouched.
The indexer MUST persist enough chain identity,
block hash/height, transaction ordering, event
version, source-trust and reconciliation checkpoints
to rebuild derived v2 state from the active chain
without double-crediting tips or duplicating likes.

Recovery MUST be idempotent across restarts,
deep reorgs, partial database migrations, shadow
indexes and obsolete client caches. A flag-off
state MUST NOT discard historical raw transaction
evidence needed for auditing, but MUST cease
publishing data outside the authorized feature
scope. Existing personal-data/secret handling
controls MUST remain in force throughout recovery.

### M1.9.5. Version activation authority

Only an explicitly recorded, approved activation
decision can move any social event from **proposed**
to **supported**. The decision MUST name:
repository, exact source SHA, protocol version
and event/container pairs, trust model, deployment
target, Wallet/indexer release identifiers,
independent review and test corpus, asset scope,
rollback owner and approval timestamp.

The ratification of RFC-0001 **as a document**
MUST NOT silently enable `version=0x02`,
`TIP=0x05`, ALP/eMPP TMM entries, P2SH,
delegation, mainnet signing or transfers.
Change to Core v1.0 would require separate
governance and must not be smuggled into
an implementation toggle.

## M1.10. S0 design acceptance and S1 implementation boundary — DRAFT

### M1.10.1. Two different approvals, never implied by a merge

- **S0 architecture/design acceptance** means RFC-0001
  has passed the documented design, security, fixture,
  compatibility and governance acceptance criteria
  below. It authorizes **no production social write**.
- **S1 implementation authorization** means a
  separately reviewed PR1 plan may implement the
  **approved** parts of the design strictly in the
  isolated environment described by M1.9.3.
  It is not permission to deploy into production.
- **Mainnet activation** is an independent and later
  governance/release decision, never granted
  automatically by a green CI run, Codex feedback,
  draft-PR merge or S0/S1 status.

Codex's automated review is valuable independent
feedback, but **"no major issues" is not a proof
of protocol correctness, completed cryptographic
verification, chain compatibility or economic
security**. A documentation-CI pass verifies only
what that workflow actually executed.

### M1.10.2. Explicit S0 gate checklist

The project MUST NOT mark S0 `CLOSED` until the
responsible governance authority explicitly
approves the closure **after verifying evidence**
for every required item.

| ID | S0 acceptance criterion | Current PR0 evidence / disposition |
| --- | --- | --- |
| `S0-01` | Scope and historical M1.1 comparison sourced and reviewed | Initial comparison exists; external source verification **pending** |
| `S0-02` | Core v1.0 boundary and type-by-type v2 binary schema unambiguous | M1.2/M1.3/M1.5 drafted. One regtest REPLY shows display-order parent bytes. Other v2 payloads and a production-parser acceptance test are **not** this evidence. Production v2 activation **pending** and not authorized |
| `S0-03` | Designated P2PKH authorship; no silent delegated/P2SH authoring | Regtest POST and REPLY use `author_input_index=0`, sighash `0x41`, HASH160 `b4aca63fbf60884195ee538475b6840650273d3f`. Index 1, P2SH rejection and delegated signing **pending** |
| `S0-04` | On-chain REPLY, reaction/unlike replay, atomic XEC/RMZ TIP schemas specified | REPLY link observed on regtest: POST `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585` output 1 is spent by REPLY `3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649` input 0 (PR #42 `081d75a762889207283ab7d4434030db30c79b41`). Reaction/unlike replay not executed. XEC/RMZ TIP and ALP/eMPP integration **pending**; no transfer |
| `S0-05` | M1.7 deterministic vectors AND independently reproducible signed and negative fixtures required by M1.7.4 | Synthetic corpus remains on PR #41. Commit `efe60360b4a276465975b603b833a8eb15f8e080` adds a separate regtest reference for this pair, with negative serialization cases, and does not modify the production parser. Local command `node --test tests/protocol/rfc0001_validation.test.mjs tests/protocol/rfc0001_regtest_reference.test.mjs` passed, 43 tests. ALP/eMPP, reorg, reaction and tip raw fixtures **pending** |
| `S0-06` | M1.8 threats reviewed with test evidence or approved residual risks, owner and date | Threat matrix written; mitigation proofs/owner review **pending** |
| `S0-07` | v1.0 backward-compatibility regression corpus and TM0/TM1 application-profile decision | **Pending** |
| `S0-08` | M1.9 activation flags, isolated staging and rollback rehearsed or independently verified to the extent required by the approved gate | Proposed controls only; execution evidence **pending** |
| `S0-09` | Codex/technical review of the **final, unchanged** PR0 head and all inline P1/P2 findings addressed; CI result recorded | Earlier heads were reviewed. This evidence update needs its own Codex review and a recorded CI result before S0-09 can be claimed. **Pending** |
| `S0-10` | Explicit governance decision records exact final RFC SHA, accepted residual risks, ratification date, future scope and effective boundary | **Pending**; Draft PR and document are **PROPOSED — NOT RATIFIED** |

The acceptance authority MAY approve a documented
alternative for an item **only through a separate
explicitly recorded governance change** detailing
rationale and residual risk; neither a model nor
a CI workflow can quietly waive a required gate.
A previously filed P2 issue may be marked resolved
only with a traceable correction commit; this
does not imply all architectural risks are closed.

**Current status at PR0:** the architecture text has
been drafted. One regtest POST/REPLY pair now supplies
display-order parent bytes, P2PKH authorship and a
`spentBy` link. M1.7.4 still requires the remaining
machine-readable fixtures listed in that section.
This PR MUST NOT assert "S0 complete" because those
fixtures, ALP/eMPP validation, Codex review of this
head, or CI are unfinished. The S0 gate remains
**OPEN**. S1 is **NOT AUTHORIZED**.

### M1.10.3. S1 requirements and acceptance tests

S1 MAY begin only after a separately approved
implementation work order establishes the
exact approved schema and isolation controls.
Proposed PR1 and subsequent PRs MUST be
scoped, revertible and independently reviewed;
the progression below is **not** approval
to implement or activate now.

| S1 test/workstream | Minimum required evidence |
| --- | --- |
| Wire encoding/decoding | Deterministic positive/negative fixture corpus for each approved REPLY/REACTION/TIP profile; exact script sizes, minimal pushes, UTF-8 segregation, author signature and invalid cases |
| On-chain-like publish/read | Regtest or proven equivalent isolated harness: create **test-only** REPLY and read it through an indexer, never using mainnet coins or keys |
| Thread reconstruction | Root, replies-to-replies, orphan handling, bounded cycles/depth, restart and reorg replay, stable deterministic ordering |
| Reaction state | LIKE, duplicate LIKE, REMOVE, LIKE again and multi-author replay; one active reaction per author/target/kind |
| XEC payments | Invalid recipient, output/change attribution, all-input source ownership, exact satoshi amounts, recipient-funded P2 exploit, self-tip and no-value paths |
| RMZ ALP/eMPP | Real library-compatible ALP SEND + TMM entry; token ID/decimals, eMPP size budget, token output mapping, zero/invalid atoms, token history and signing |
| Reliability/security | Restart, reorg, shadow snapshot, idempotence, message injection, phishing, replay, availability failure, proof provenance and metrics |
| Wallet boundary | No private-key access from social UI; test-only preview, approval, fee checks, anti-mainnet endpoint guardrail, explicit signed-transaction permission |
| Compatibility | Compare v1 baseline vs v2 candidate; v1 cannot accidentally accept v2; no corruption of historical POST verification |

All such acceptance tests MUST record
commands, fixture hashes, run links,
source commits, reviewers and scope
limitations. They MUST NOT be
self-certified from textual proposals alone.

**Mainnet prohibition during S1:** there
MUST be no signing, submission, minting,
transfers or deployment using production
keys, real XEC, real RMZ or any live
mainnet broadcast endpoint under this
S1 plan. Analysis of publicly available
mainnet transactions, when separately
permitted, MUST be strictly read-only
and MUST NOT reuse production credentials
to create transactions. Any future
mainnet pilot would require a
new, explicit governance authorization
beyond S1 and an independently
tested release boundary.

### M1.10.4. Human closure record and S1 hand-off

The eventual S0 closure decision MUST
include a permanent record of:
(a) ratified RFC file path and exact
merged commit SHA, (b) signed-off
review/report URLs, (c) completed
acceptance evidence, (d) explicitly
accepted residual risks, (e) tests
and CI hashes, (f) decision date/time,
and (g) the named approver's direct
authorization. A proposal that is
still in Draft status is not this
record.

The hand-off MUST list approved
and **excluded** v2 event/container
profiles independently. Unresolved
ALP/eMPP or Wallet integration risks
MUST remain disabled and MUST NOT
be swept into "S1 ready" by implication.
A partial design acceptance MAY be
recorded without closing S0 if
the blocking gate criteria remain unmet.

**State of this PR0:** DOCUMENTATION
DRAFT; **S0 OPEN, S1 NOT AUTHORIZED,
SOCIAL V2 NOT ACTIVE, NO MAINNET
SIGNING/BROADCAST, NO AUTOMATIC
SQUASH AND MERGE.**
