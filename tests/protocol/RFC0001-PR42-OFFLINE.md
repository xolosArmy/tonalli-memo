# RFC-0001 PR42 — Offline P2PKH cryptography (phase 1)

This is an **offline fixture suite**, NOT a running regtest node. It uses `ecash-lib@4.13.0` already present in `packages/verification` to create and verify actual eCash Schnorr/P2PKH signatures over raw synthetic social-v2 transactions with approved SIGHASH modes.

Run (using repository dependencies):

```sh
pnpm --filter @tonalli-memo/verification test
```

The test covers synthetic `REPLY=0x02`, `REACTION=0x03`, `REACTION_REMOVE=0x04` and `TIP_XEC=0x05` examples, designated author input **1**, `0x41`/`0xc1` preimage verification, signing over the OP_RETURN and payment outputs, tampered message and invalid signature failures. It does **not** call or change production parsers.

**DO NOT FUND TEST KEYS.** All signing keys are derived from public fixed text, are insecure, and are used only in memory. Outpoints are fabricated and have **never been funded**; verifying signatures does not prove spendable UTXOs, execution of P2PKH by a full node, miner/Chronik acceptance, or settlement. In particular, the apparent TIP_XEC is merely a signature and output-structure demonstration, not a transfer.

### Next steps, separate authorization and implementation

A real isolated regtest environment would require a locally controlled node, wallet/UTXO setup, genesis token fixtures, isolated Chronik and a connectivity/broadcast firewall. Do **not** set mainnet URLs, real keys, or real funds. For ALP/eMPP, a valid test token SEND and output-atom attribution must be exercised separately; this suite does not claim to provide them.

PR #40 and #41 remain Draft. This PR also remains Draft and MUST NOT close S0 or permit S1/mainnet activation.