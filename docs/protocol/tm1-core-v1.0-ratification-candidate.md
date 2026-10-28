# TM1 Core Protocol v1.0 — Canonical POST Specification (Ratification Candidate)

- **Status:** **PROPOSED FOR NORMATIVE REVIEW — NOT ACCEPTED / NOT RATIFIED**
- **Source baseline:** [`tm1-spec.md`](./tm1-spec.md) (Draft 0.2; remains the operative repository specification)
- **Governance evidence:** [D-07 draft acta — PR #31](https://github.com/xolosArmy/tonalli-memo/pull/31), reviewed head `21fe1a53888caa8a31629588e8813fed158e5b3c`
- **Reference implementation:** `xolosArmy/tonalli-memo` `main` at `8393670503be6d46e5badb9ea7c29e7597bb4c26`
- **Effective date:** **UNSET — awaits independent ratification decision**
- **Protocol name:** Tonalli Memo
- **LOKAD ID:** `544d4d00` (`TMM\0`)
- **Version:** `0x01`

TM1 is an application-layer protocol for publishing authenticated UTF-8
messages in eCash `OP_RETURN` outputs.

TM1 derives authorship from a designated transaction input. It does not
include a textual address or a secondary message signature inside the
`OP_RETURN` payload.

**Normative proposal only.** This file is not a version change, a production
activation, or an instruction to issue transactions. It describes the
proposed canonical POST baseline for consideration in a distinct ratification
procedure. The original Draft 0.2 warning remains in the operative
[`tm1-spec.md`](./tm1-spec.md). Historical on-chain observations are documented
separately and do not retroactively satisfy or silently erase that warning.

RFC-0001, REPLY, tips and reactions remain out of scope. No Wallet signing,
authorization or broadcast behavior is changed by this candidate.

## 1. Scope

The proposed TM1 Core v1.0 POST baseline defines:

- one active event type: `POST`;
- authorship through a designated standard P2PKH input;
- exact UTF-8 byte preservation;
- a maximum script size compatible with the default eCash relay policy.

The proposed TM1 Core v1.0 POST baseline does not define:

- replies or threads;
- P2SH or multisig authorship;
- profile metadata;
- message editing or deletion;
- media attachments;
- moderation rules.

## 2. TM1 candidate outputs

A transaction output is a TM1 candidate when:

1. its locking script begins with `OP_RETURN`; and
2. its first successfully decoded data push equals the finalized TM1
   LOKAD ID.

Once the first push matches the TM1 LOKAD ID, the output remains a TM1
candidate even when the remaining script or envelope is malformed.

A transaction MUST contain exactly one TM1 candidate.

A transaction containing more than one TM1 candidate MUST be rejected as
`MULTIPLE_MEMOS`.

Unrelated `OP_RETURN` outputs belonging to other protocols MAY coexist in
the same transaction.

## 3. Wire format

The TM1 output value MUST be zero.

Its locking script MUST contain exactly two data pushes following
`OP_RETURN`:

    OP_RETURN <LOKAD_ID> <version || event_type || author_input_index || event_data>

### 3.1 First push

The first push MUST contain exactly four bytes:

    LOKAD_ID

The proposed v1.0 LOKAD ID is `544d4d00` (`TMM\0`).

### 3.2 Second push

The second push contains one contiguous binary envelope:

    version || event_type || author_input_index || event_data

Fields appear in this exact order:

| Field | Size | Meaning |
| --- | ---: | --- |
| `version` | 1 byte | MUST equal `0x01` |
| `event_type` | 1 byte | Event classifier |
| `author_input_index` | 1 byte | Zero-based authorizing input index |
| `event_data` | 1–212 bytes | UTF-8 message bytes |

`author_input_index` is an unsigned 8-bit integer and therefore has a
range of `0` through `255`.

### 3.3 Canonical script encoding

Both data pushes MUST use minimal script push encodings.

The script MUST NOT contain:

- additional pushes;
- trailing opcodes;
- non-push opcodes after `OP_RETURN`;
- bytes outside the two defined pushes.

For the second push:

- envelope lengths from 4 through 75 bytes use a direct push opcode;
- envelope lengths from 76 through 215 bytes use `OP_PUSHDATA1`.

## 4. Size limits

The complete TM1 locking script, including `OP_RETURN` and push opcodes,
MUST NOT exceed 223 bytes.

This is a protocol compatibility limit chosen to match the default eCash
relay policy. It is not described as a universal consensus limit.

At maximum size:

    1 byte    OP_RETURN
    5 bytes   direct push opcode plus 4-byte LOKAD ID
    2 bytes   OP_PUSHDATA1 plus envelope length
    3 bytes   version, event type and author input index
    212 bytes event_data
    ────────────────────────────────────────────────────
    223 bytes total locking script

`event_data` is limited by bytes, not Unicode characters.

Client applications MAY impose a smaller product-level limit. Tonalli
Wallet MAY limit `event_data` to 80 UTF-8 bytes.

## 5. Event types

### `0x01` — POST

`POST` is the only active TM1 Core v1.0 event type proposed here.

Its `event_data` field contains the complete top-level publication text.

### `0x02` — REPLY

`REPLY` is reserved.

TM1 Core v1.0 parsers MUST continue to reject it with `UNSUPPORTED_EVENT_TYPE`.

It MUST NOT become active until the following are standardized:

- parent transaction ID encoding;
- byte order;
- unconfirmed-parent behavior;
- reorganization behavior;
- remaining message-size budget.

All other event type values are unsupported.

## 6. Event data

`event_data` MUST:

- contain at least one byte;
- contain no more than 212 bytes;
- decode as valid UTF-8.

The exact original bytes MUST be preserved.

Implementations MUST NOT implicitly:

- trim leading or trailing whitespace;
- normalize Unicode using NFC, NFD, NFKC or NFKD;
- alter line endings;
- replace invalid byte sequences;
- change letter case.

Display clients MAY apply visual formatting, but stored and re-exposed
protocol bytes MUST remain unchanged.

## 7. Author identity

The author is determined exclusively from the transaction input selected
by `author_input_index`.

The protocol-level author identifier is the 20-byte public-key hash
contained in the selected P2PKH previous output.

A user-facing eCash CashAddr address is a network-specific representation
of that public-key hash and is not encoded inside the TM1 envelope.

Tonalli Wallet SHOULD use `author_input_index = 0` for ordinary
self-funded posts.

Verifiers MUST NOT assume that the authorizing input is always input zero.

## 8. Author verification

A verifier MUST perform the following checks.

### 8.1 Input bounds

Confirm:

    author_input_index < transaction.inputs.length

An out-of-range index makes the message invalid.

### 8.2 Previous-output resolution

Resolve the previous output spent by the designated input.

Failure to obtain the previous output prevents authorship verification.

### 8.3 P2PKH requirement

The selected previous output MUST use a standard P2PKH locking script.

P2SH, multisig, covenant and unknown locking scripts are unsupported as
**the designated author input's spent prevout** in this proposed core profile.
Their use by other transaction inputs is not prohibited by the TM1 author
rule, and this rule does not declare such transactions invalid under eCash
consensus. Any alternative form of author identity requires a separate,
reviewed RFC and explicit activation.

### 8.4 Unlocking script

The selected input unlocking script MUST expose a standard P2PKH
signature and public key.

A TM1 Core v1.0 verifier MUST require exactly two minimal
data pushes for the designated P2PKH unlocking script:

    <signature_with_hashtype> <public_key>

The public key MUST hash to the public-key hash contained in the selected
previous output.

### 8.5 Signature hash type

The final byte of `signature_with_hashtype` MUST equal one of:

    0x41 = SIGHASH_ALL | SIGHASH_FORKID
    0xc1 = SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_ANYONECANPAY

The following MUST be rejected for author verification:

- `SIGHASH_NONE`;
- `SIGHASH_SINGLE`;
- signatures without `SIGHASH_FORKID`;
- unknown or unsupported sighash combinations.

Both accepted combinations commit to all transaction outputs, including
the TM1 `OP_RETURN` output.

`ANYONECANPAY` is permitted only in combination with
`SIGHASH_ALL | SIGHASH_FORKID`.

### 8.6 Cryptographic validity

A verifier backed by a trusted eCash full node or Chronik instance MAY
rely on that source for transaction and script validity.

It MUST still inspect and enforce the TM1 sighash restrictions.

An independent or offline verifier that does not trust its transaction
source MUST additionally verify the authorizing P2PKH signature under the
active eCash script rules.

## 9. Validation outcomes

Implementations SHOULD distinguish at least:

- `INVALID_MARKER`;
- `UNSUPPORTED_VERSION`;
- `INVALID_FORMAT`;
- `MULTIPLE_MEMOS`;
- `UNSUPPORTED_EVENT_TYPE`;
- `INVALID_UTF8`;
- `EMPTY_EVENT_DATA`;
- `PAYLOAD_TOO_LARGE`;
- `AUTHOR_INPUT_OUT_OF_RANGE`;
- `PREVOUT_UNAVAILABLE`;
- `UNSUPPORTED_AUTHOR_SCRIPT`;
- `INVALID_AUTHOR_SCRIPT_SIG`;
- `UNSUPPORTED_SIGHASH`;
- `INVALID_AUTHOR_SIGNATURE`.

Exact application error objects are implementation-specific, but the
validation distinction SHOULD be preserved.

## 10. Implementation requirements

TM1 verification requires normalized transaction inputs to expose at
least:

    index
    prevOut
    outputScriptHex
    inputScriptHex
    address or decoded public-key hash

The Chronik adapter and verification layer MUST preserve enough raw input
data to inspect the authorizing signature and sighash byte.

TM1 verification MUST use only the input selected by
`author_input_index`. It MUST NOT scan all inputs and select the first
address matching an external registry.

## 11. Ratification gates — NOT YET CLOSED

A technical review, a CI pass or merging a preparatory acta MUST NOT by itself
convert this candidate into an accepted protocol version. A distinct,
explicitly authorized ratification decision and PR are required after the
following gates are reconciled with dated evidence:

1. **Canonical vectors:** demonstrate valid and invalid wire, Unicode,
   author-index, sighash (`0x41`, `0xc1` and rejected variants), malformed
   and duplicate candidate outputs, with independent encoding/decoding tests.
2. **Wire vs. application policy:** keep the rule of exactly one **TM1**
   candidate distinct from the Tonalli verifier's stricter combined **TM0 +
   TM1** cardinality policy; publish any application profile separately.
3. **Verification trust:** document the `trusted-chronik` verification model,
   missing-prevout behavior and the stricter requirements for independent
   cryptographic verification. Do not call structural validation a standalone
   proof of signatures.
4. **Historical compatibility:** retain the audited evidence of 3/3
   confirmed sample TXIDs ([run 40528073357](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357)) and 50/50 LOKAD-discovered
   candidates ([run 40546981820](https://github.com/xolosArmy/tonalli-memo/actions/runs/40546981820)), including three exact
   212-byte event / 223-byte script boundaries. Both carry the verdict
   `SAMPLE_COMPATIBLE_NOT_RATIFICATION`. Neither proves whole-chain coverage,
   the historical Draft 0.2 issuance revision, or zero universal false negatives.
5. **Conflicting historical finalization condition:** Draft 0.2 §11(6)
   originally required *no production issuance before review and fixture
   publication*, while candidate TM1 transaction IDs have now been observed
   confirmed on mainnet. This retrospective precondition cannot be assumed
   fulfilled; governance must explicitly document the chronology, assess
   ramifications and approve a transparent disposition (including any
   necessary amendment), without deleting or backdating the historical text.
6. **Recovery scope:** synthetic backfill, daemon restart, SQLite persistence,
   reorg/reconnect tests (PR #35) are evidence of tested mechanisms, not a
   guarantee of complete recovery under all real faults or rate limits.
7. **RFC boundary:** `REPLY=0x02` remains reserved and rejected; RFC-0001,
   responses, likes, tips, Wallet interfaces, approvals, signatures and
   broadcast remain separate approval and deployment domains. Proposals for
   M1/S0 PR0 are documents and test vectors only.
8. **Formal governance:** identify the final reviewed commit SHA, the decision
   maker/approving body, date, status and effective scope; obtain explicit
   approval for the independent ratification PR. The preparatory PR #31 stays
   unmerged unless separately authorized.

**Ratification decision:** **PENDING**. **Effective date:** **UNSET**.
No protocol activation, Wallet changes, broadcast, `REPLY` support or
production deployment is authorized by this document.

## 12. Candidate provenance and corrections to Deliverable B

The [D-07 audit's Deliverable B](https://docs.google.com/document/d/1ZpVL0Bgc5dYglFq5IfmZ15YPicJ_rxFNlMTd_Db3oAo/edit)
is an unreconciled *candidate*, not a safe drop-in canonical v1.0 source:

| Deliverable B statement | Reviewed candidate / Draft 0.2 baseline |
| --- | --- |
| It depicts separated version/event pushes in the OP_RETURN | Exactly **two pushes** follow `OP_RETURN`: the 4-byte LOKAD push plus **one contiguous envelope** (`version || event_type || author_input_index || event_data`). |
| It hardcodes identity to `vin[0]` | Identity derives from the explicit unsigned `author_input_index` (0–255, in bounds). Wallet SHOULD prefer input 0 for ordinary posts; the verifier MUST NOT require input 0. |
| It contemplates replacing malformed UTF-8 with U+FFFD | Malformed UTF-8 MUST be rejected with `INVALID_UTF8`; no replacement, normalization, trimming or re-encoding of valid event bytes. |
| It conflates P2SH rejection with all transaction inputs | Only the **designated author prevout** must be standard P2PKH; other unrelated inputs follow eCash consensus rules. |
| It treats observed source processing as a proof of independent signature validation | `trusted-chronik` relies on the trusted node/Chronik for transaction validity; offline verification MUST independently check signatures. |
| It suggests final ratification while historical publication chronology remains unsettled | Keep Draft 0.2 §11(6) and the source chronology under an explicit **unresolved** decision gate (above). |

No changes to the on-chain envelope, LOKAD, bytes, author-index semantics,
accepted sighash values or active event set are proposed. This document is
**a review candidate, not the canonical accepted protocol**.
