# Antigravity execution handoff — RFC-0001 / PR #42

**Status: local regtest bootstrap executed. Three lab social transactions were later signed, accepted, and mined. On commit `afd455f`, `--enable` stopped the lab node. The replacement process loaded height 104 and then exited because Chronik tried to bind `127.0.0.1:19442` twice. Chronik is not listening. The chronik-client query was not run. S0 is not closed. A second start was not attempted.**

The execution record is `tests/protocol/RFC0001-PR42-REGTEST-EVIDENCE.md`.
The unsigned-phase rejection stays in that record. The signed phase is the later section of the same file. Confirmed lab txids:

- REPLY with the offline fixture parent `00..1f`: `05e924726fb94cdb8707bb40d00faf69451b479c66dde9544a67b46a1e91ec50`, block `4ac99d72f3e4bc5343a9a65526cd94e4975b8f9a994855f505a6a4f88dd1b0b1`, height 102.
- Canonical POST `laboratorio RFC-0001 POST`: `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585`, block `0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17`, height 103.
- REPLY whose 32 parent bytes are that POST txid in display order: `3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649`, block `6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915`, height 104.

That parent byte order is a lab convention. It is not a standardized TM1 encoding. Thread reconstruction is reserved for a regtest Chronik or indexer. The production parser still rejects version `0x02`. This handoff remains the procedure. Do not treat the offline Vitest suite, or consensus acceptance alone, as Chronik indexing. Do not treat these lab transactions as closing S0.

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

This is **execution guidance**, not proof of execution. The proof is the
execution record. `scripts/rfc0001-regtest-bootstrap.sh` does not sign or
broadcast. `scripts/rfc0001-regtest-sign.sh` broadcasts only when
`--broadcast` is passed, `testmempoolaccept` returns `allowed=true`, and
the regtest guards still pass. Both scripts must remain isolated from
production. No claim is made that an Antigravity agent is already
installed, connected to this repo, or authorized to run on the
operator's machine. PR #42, S0 and S1 remain at their previous gates.
