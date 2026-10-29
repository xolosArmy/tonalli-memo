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

### Regtest phase 2: safe prerequisites (NOT EXECUTED)

This project currently has **no configured regtest node in this PR**.
A local `ecashd` binary or isolated container and matching eCash
`bitcoin-cli`/RPC are prerequisites. Generic Bitcoin Core `bitcoind`
should **not** be represented as an eCash-consensus substitute; confirm
the node binary is built from the intended eCash/Bitcoin ABC release.

The operator MUST set up an isolated writable datadir and dedicated
RPC credentials, disable public RPC exposure, and use only test-only
keys/addresses. Before **any** transaction creation or test broadcast:

1. Confirm RPC `getblockchaininfo` reports `chain: "regtest"`.
2. Confirm expected network/chain parameters and RPC endpoint from an
   explicit allowlist. If the response is unavailable, malformed, or
   not `regtest`, stop without signing or broadcasting.
3. Generate at least **101** blocks to a disposable regtest address
   to make the first standard coinbase reward spendable after 100
   subsequent blocks (do not confuse 100 mined blocks with 100
   confirmations).
4. Fetch a *real mined regtest* UTXO and its amount/script; verify
   its exact prevout against the node rather than assuming it exists.
5. Build the 2-push v2 event using the tested author input and
   sign its real funding outpoint with 0x41/0xc1 as applicable.
   Inspect fees, transaction hex, output count, and zero-valued
   OP_RETURN; decode and test acceptance with isolated node.
6. Submit to **regtest only** after confirming the network guard
   again. Capture the regtest TXID, acceptance result, block inclusion,
   and independent verification of script validity and author identity.
7. Repeat with malformed/out-of-range indexes and invalid signatures,
   and verify explicit rejection reasons; separately test reorg/replay.
8. ALP eMPP must use a regtest-minted ALP token with independent
   atomic-transfer evidence; the real RMZ mainnet token cannot be
   issued as the same token ID on regtest by assumption.

Only promote any result from "planned" to "executed" when the
exact node version, command, chain ID, fixture hex, UTXO,
test results, logs and independent reviewer are recorded.
Never point test scripts at `chronik.e.cash`, production
wallets or any public/mainnet RPC endpoint.

**No claim is made that any regtest node was started or
that a regtest transaction was broadcast in PR #42 phase 1.**
