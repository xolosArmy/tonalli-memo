# TM1 Protocol Specification

- **Status:** Draft 0.2
- **Protocol name:** Tonalli Memo
- **LOKAD ID:** `544d4d00` (`TMM\0`)
- **Version:** `0x01`

TM1 is an application-layer protocol for publishing authenticated UTF-8
messages in eCash `OP_RETURN` outputs.

TM1 derives authorship from a designated transaction input. It does not
include a textual address or a secondary message signature inside the
`OP_RETURN` payload.

This draft is non-final. Implementations MUST NOT emit production TM1
transactions until this draft is finalized.

## 1. Scope

Draft 0.2 defines:

- one active event type: `POST`;
- authorship through a designated standard P2PKH input;
- exact UTF-8 byte preservation;
- a maximum script size compatible with the default eCash relay policy.

Draft 0.2 does not define:

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

The Draft 0.2 LOKAD ID is `544d4d00` (`TMM\0`).

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
Wallet Draft 0.2 SHOULD initially limit `event_data` to 80 UTF-8 bytes.

## 5. Event types

### `0x01` — POST

`POST` is the only active event type in Draft 0.2.

Its `event_data` field contains the complete top-level publication text.

### `0x02` — REPLY

`REPLY` is reserved.

Draft 0.2 parsers MUST reject it with `UNSUPPORTED_EVENT_TYPE`.

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

P2SH, multisig, covenant and unknown locking scripts are unsupported in
Draft 0.2.

### 8.4 Unlocking script

The selected input unlocking script MUST expose a standard P2PKH
signature and public key.

A canonical Draft 0.2 implementation SHOULD require exactly two minimal
data pushes:

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

## 11. Finalization requirements

Draft 0.2 MUST NOT be marked final until:

1. canonical valid and invalid script vectors are committed;
2. vectors cover `0x41`, `0xc1` and rejected sighash values;
3. vectors cover malformed and duplicate candidate outputs;
4. the Chronik adapter exposes `inputScriptHex`;
5. independent encoder and decoder implementations agree;
6. no TM1 production transaction has been emitted before Draft 0.2
   review and fixture publication.
