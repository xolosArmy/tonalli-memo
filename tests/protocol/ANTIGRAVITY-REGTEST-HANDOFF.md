# Antigravity execution handoff — RFC-0001 / PR #42

**Status: pending execution; do not claim a regtest node or broadcast exists.**

Use Antigravity's IDE/agent terminal **on a local Linux x86_64 machine with internet access and command-execution permission**. Antigravity is a task orchestrator, **not** an eCash full node or consensus oracle. The exact agent launch command depends on the installed version; do not invent a `antigravity cli` command.

## Copy/paste task for Antigravity

> Work in the GitHub repository `xolosArmy/tonalli-memo`, branch
> `test/rfc0001-p2pkh-offline-regtest-prep-20261028`, Draft PR #42.
> Do not merge PRs #40/#41/#42, do not commit secrets, do not access
> mainnet, and do not use real wallets or coins.
>
> 1. Check OS/architecture and availability of `bitcoind`,
>    `bitcoin-cli`, `pnpm`, Node and Python 3. If missing,
>    fetch the official matching Bitcoin ABC release for this OS;
>    verify the publisher signature and hash against a trusted
>    release manifest **before execution**. If verification cannot
>    complete, stop and document the blocker. Bitcoin Core binaries
>    are not interchangeable with Bitcoin ABC for this experiment.
> 2. Review and execute `scripts/rfc0001-regtest-bootstrap.sh`
>    with an absolute path to the verified Bitcoin ABC `bin`
>    directory. Use a fresh, dedicated and access-restricted datadir.
>    Confirm the RPC port from the `[regtest]` section, and
>    `getblockchaininfo.chain == "regtest"`. RPC must bind to
>    `127.0.0.1`; disable P2P connectivity.
> 3. Do **not** proceed if the bootstrap fails. Verify height
>    `101`, a positive spendable lab UTXO, and a block-hash
>    checkpoint. Do not use any public deterministic test keys
>    from committed fixtures for funds; the wallet created here
>    is distinct from the offline fixed keys.
> 4. Run the existing `pnpm --filter @tonalli-memo/verification test`
>    offline test suite. Log the Node/pnpm/ecash-lib and ABC
>    versions and result. Do not represent it as an on-chain test.
> 5. Before building/sending any social-v2 raw transaction, propose
>    a separate minimal test-only integration script that reads a
>    genuine spendable regtest UTXO and produces an unsigned
>    `REPLY` candidate. Require a **second regtest-only guard
>    immediately before any signing or broadcast**. Show expected
>    fees, script bytes, output values and raw TX. Do not claim a
>    transaction was accepted until `testmempoolaccept`,
>    `sendrawtransaction` and post-broadcast independent evidence
>    prove it on this isolated chain.
> 6. Distinguish local eCash consensus acceptance from Chronik
>    indexing. If a matching regtest Chronik is unavailable,
>    report `CHRONIK_NOT_TESTED`, not success.
> 7. Preserve reproducible evidence: exact commands, redacted logs,
>    source SHA, verified binary version/hash, chain name,
>    block height, test-only funding outpoint, raw transaction hex,
>    error or acceptance result, confirmations and environment
>    limitations. Do not commit wallet datadirs, cookies, or secrets.
>
> Stop on any mismatch, failed verification or unexpected network.
> Explicitly request authorization before changing the production
> protocol/indexer, using mainnet, or merging PRs.

## Local bootstrap (only after binary signature/checksum validation)

```bash
git checkout test/rfc0001-p2pkh-offline-regtest-prep-20261028
bash -n scripts/rfc0001-regtest-bootstrap.sh
bash scripts/rfc0001-regtest-bootstrap.sh /absolute/path/to/verified/bitcoin-abc-0.34.2/bin
```

## Security and evidence boundary

This is **execution guidance**, not proof of execution. The source
script does not broadcast social transactions and must remain isolated
from production. No claim is made that an Antigravity agent is already
installed, connected to this repo, or authorized to run on the
operator's machine. PR #42, S0 and S1 remain at their previous gates.
