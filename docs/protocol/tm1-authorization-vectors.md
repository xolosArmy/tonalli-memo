# TM1 Authorization Vectors

`packages/verification/tm1-authorization-vectors.json` is the canonical, reproducible fixture contract for TM1 Draft 0.2 authorization checks. It captures serialized transactions plus the prevout data required to evaluate the designated author input without Chronik, RPC, broadcast, or wallet code.

This PR intentionally stops at fixtures, structure tests, and documentation. It does not implement the productive TM1 verifier, does not change `verifyNormalizedTransaction`, does not add Chronik fields, does not emit transactions, and does not touch Tonalli Wallet.

## Schema

The top level includes `schemaVersion: 1`, `protocol: "TM1"`, `specDraft: "0.2"`, `generator.library: "ecash-lib"`, `generator.version: "4.13.0"`, `validationOrder`, `testKeys`, and non-empty `valid` and `invalid` arrays.

Each cryptographic fixture has a stable `id`, transaction wire hex, `txid`, all inputs and outputs, the designated input metadata, public key material, signature material, `inputScriptHex`, sighash byte and uint32 little-endian forms, BIP143/ForkID preimage and digest when applicable, and an `expected` result. Satoshi amounts are decimal strings such as `"prevoutSats": "10000"` so no 64-bit value is encoded as a JSON number.

Outpoints use:

```json
{
  "prevOut": {
    "txid": "...",
    "outIdx": 0
  }
}
```

## Validation Order

Fixtures isolate failures using this normative order:

1. `author-index`
2. `prevout-availability`
3. `prevout-script-type`
4. `scriptsig-structure`
5. `pubkey-hash-match`
6. `sighash-policy`
7. `cryptographic-signature`

The cardinality of TM1 candidates is not a cryptographic authorization rule. If `transactional` vectors are added later, they belong to protocol selection, not this signature authorization path, and should use `MULTIPLE_MEMOS`.

## TM1 Envelope

The OP_RETURN outputs use a TM1 Draft 0.2 envelope:

- LOKAD ID `544d4d00`
- version `0x01`
- event type POST `0x01`
- one-byte `author_input_index`
- non-empty UTF-8 event data

These are authorization vectors, not a productive TM1 parser contract. Wire vectors prove serialized transaction bytes; authorization vectors additionally include prevout value and script metadata because BIP143/ForkID signs the spent output amount and script code.

## Determinism And Keys

The generator is deterministic: fixed insecure private keys, fixed prevout txids derived from labels, no timestamps, no randomness, and no network access. The JSON distributes only derived public keys and public key hashes. The private keys are generator-only test fixtures and must never receive funds.

Valid initial ForkID P2PKH vectors use Schnorr because `ecash-lib` 4.13.0 `P2PKHSignatory` signs BIP143/ForkID sighashes with Schnorr. ECDSA valid ForkID vectors are deliberately excluded.

## Sighash Policy

TM1 Draft 0.2 permits only:

- `0x41`: `SIGHASH_ALL | SIGHASH_FORKID`
- `0xc1`: `SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_ANYONECANPAY`

Both sign all outputs. That includes the TM1 OP_RETURN output, so changing the memo output after signing changes the digest and invalidates the signature.

No broadcast was performed. The fixtures are generated and checked entirely as local test artifacts.

## Remaining Limitations

These vectors do not define a productive TM1 verifier, do not expand supported author scripts beyond P2PKH, do not add valid ECDSA ForkID authorization cases, and do not prove network acceptance or mainnet relay. They are a local authorization fixture contract for the documented validation order.
