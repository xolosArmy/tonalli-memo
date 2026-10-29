# RFC-0001 / PR #42 — regtest execution record

This file records what was run on 2026-10-29 from commit `91e5b854e8474f17058c88b1a0a68507f53467f1` on branch `test/rfc0001-p2pkh-offline-regtest-prep-20261028`. It is not a merge request and it does not change the production protocol.

The sections through "Still not done" are the unsigned phase and stay as that historical record. The section "Signed regtest transactions" records three later transactions that this lab node accepted and mined. Chronik was not tested. S0 is not closed.

## Boundaries kept

- PR #40, PR #41, and PR #42 were not merged.
- No RPC call was sent to the pre-existing node, port 8332, or port 8331.
- The default datadir `/home/xolosarmy/.bitcoin` and its wallets were not modified.
- The lab wallet is `rfc0001-regtest-only`, inside the dedicated datadir below.
- Wallet cookies, descriptors, and private keys are not copied here.

A pre-existing Bitcoin ABC 0.34.0 process was already running as pid 2075049 with `-datadir=/home/xolosarmy/.bitcoin`, P2P on port 8333, Chronik on `0.0.0.0:8331`, and RPC on port 8332. It was left running and was not used. Its top-level `blocks` directory is the default-network layout. That Chronik endpoint is not a regtest Chronik, so the result is `CHRONIK_NOT_TESTED`.

## Environment

| Item | Value |
| --- | --- |
| OS | Debian GNU/Linux 13 (trixie), Linux 6.12.90+deb13-amd64, x86_64 |
| Node.js | v20.19.2 (`/usr/bin/node`) |
| Python | 3.13.5 |
| pnpm used | 9.15.4, the version pinned by `packageManager` |
| ecash-lib | 4.13.0 |
| Vitest | 2.1.9 |
| GnuPG | 2.4.7 |

`PATH` `pnpm` is a corepack shim for pnpm 11.25.0. On this Node it fails before any test runs:

```text
TypeError [ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING]
Node.js v20.19.2
```

The verification suite was therefore run with the pinned 9.15.4 binary:

```sh
node /home/xolosarmy/.cache/node/corepack/pnpm/9.15.4/bin/pnpm.cjs --filter @tonalli-memo/verification test
```

`bitcoind` and `bitcoin-cli` were not on `PATH` before this run. Bitcoin Core was not used.

## Bitcoin ABC 0.34.2 verification

Official checksum manifest:

```text
https://download.bitcoinabc.org/0.34.2/fabien-sha256sums.0.34.2.asc
```

The signature packet names RSA key `F7D2C66D608F03E15B5E1EA6CAF74C33DBE2797F`. That fingerprint is the `fabcien@gmail.com` line in `contrib/signing/keys.txt` at tag `v0.34.2` (`d6674af70e312595297e0bc2a3c08fc09d91d044`). The key was imported from `hkps://keyserver.ubuntu.com` into a temporary `GNUPGHOME` and was not signed into a personal web of trust.

```text
gpg: Firma correcta de "Fabien <fabcien@gmail.com>"
[GNUPG:] GOODSIG CAF74C33DBE2797F Fabien <fabcien@gmail.com>
[GNUPG:] VALIDSIG F7D2C66D608F03E15B5E1EA6CAF74C33DBE2797F ...
[GNUPG:] TRUST_UNDEFINED 0 pgp
```

Signed hash for the Linux x86_64 archive:

```text
af84052127896e305f47845cc358c65a065b28ae31a0840f5d64f7ac685fe7cf  bitcoin-abc-0.34.2-x86_64-linux-gnu.tar.gz
```

`download.bitcoinabc.org` served the archive at a few kilobytes per second, so the same 64,254,431-byte asset was fetched from the GitHub release `v0.34.2`. `sha256sum -c` against the signed manifest returned `La suma coincide` before extraction. The archive paths were relative and contained no `..` entries. The extracted binary reports:

```text
Bitcoin ABC version v0.34.2-d6674af70e31
```

The suffix matches the tag commit. `ldd` reported no missing libraries.

| File | SHA-256 |
| --- | --- |
| `bitcoind` | `c88418f45dd2f2b2e41fb1da1c9d863233b0762eaa5830977550e7a9fbe69b48` |
| `bitcoin-cli` | `66acf5905621b6fa1a16ad2b78184fcc5b6bd4a964b102ed1b9c3ea6be55c031` |

Install path: `/home/xolosarmy/bitcoin-abc-0.34.2/bin`.

## Regtest bootstrap

```sh
bash -n scripts/rfc0001-regtest-bootstrap.sh
bash scripts/rfc0001-regtest-bootstrap.sh /home/xolosarmy/bitcoin-abc-0.34.2/bin
```

The script created `/home/xolosarmy/xolosarmy-regtest/data` mode `0700`, wrote a cookie-authenticated config, and refused to reuse an existing chain. Effective config:

```ini
regtest=1
server=1
[regtest]
listen=0
connect=0
dnsseed=0
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=19443
```

Independent checks after bootstrap, using explicit `-datadir`, `-conf`, `-regtest`, and `-rpcport=19443`:

| Check | Result |
| --- | --- |
| Process | pid 2698929, binary `bitcoin-abc-0.34.2/bin/bitcoind` |
| RPC listen | only `127.0.0.1:19443` for this pid |
| `getblockchaininfo.chain` | `regtest` |
| Height | 101 |
| Genesis (block 0) | `0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206` |
| Block 101 | `68d11721a55e4e699e7a0412fb01dcc6a36e324d0f2b8464229ed0fac762956f` |
| Peers | `connections=0`, `connections_in=0`, `connections_out=0`, `getpeerinfo=[]` |
| Loaded wallet | only `rfc0001-regtest-only` |
| Subversion | `/Bitcoin ABC:0.34.2(EB32.0)/` |
| `minrelaytxfee` | 10.00 XEC/kB |

`getnetworkinfo` reports `networkactive: true`. This process has no P2P socket and no peers because it was started with `-listen=0 -connect=0 -dnsseed=0`.

The only mature spendable wallet UTXO, confirmed again with `gettxout` and with the raw block-1 coinbase (5,000,000,000 satoshis = 50,000,000.00 XEC; 1 XEC = 100 satoshis):

| Field | Value |
| --- | --- |
| Funding block | height 1, `6accc03da6b6aed3e1b8b9ddaaf0629ae5d53544acdae01eed8fa53b9b21e833` |
| Outpoint | `22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7:0` |
| Amount | 50000000.00 XEC |
| Confirmations | 101 |
| Coinbase | true |
| Spendable | true |
| Address | `ecregtest:qz62ef3lhasgssv4aefcgadkssr9qfea8u6wau5v7d` |
| scriptPubKey | `76a914b4aca63fbf60884195ee538475b6840650273d3f88ac` |

Blocks 2 through 101 are not mature at height 101. There is no second mature input, so a candidate cannot honestly use `author_input_index=1` yet. The offline suite uses index 1 only because its inputs are invented.

## Offline cryptographic suite

Command and result:

```text
Test Files  7 passed (7)
     Tests  118 passed (118)
```

`packages/verification/test/rfc0001-v2-crypto.test.ts` contributed 10 passing tests. Those tests sign synthetic transactions with public insecure keys and fabricated prevouts. They do not prove that this regtest node accepted a transaction.

## Unsigned REPLY candidate

```sh
bash -n scripts/rfc0001-regtest-reply-unsigned.sh
bash scripts/rfc0001-regtest-reply-unsigned.sh /home/xolosarmy/bitcoin-abc-0.34.2/bin
```

The script repeats the regtest, localhost, peer, wallet, and datadir guards immediately before it would be possible to sign. It has no `signrawtransaction` or `sendrawtransaction` call. The second guard passed and the script then stopped.

The candidate spends the outpoint above. Its OP_RETURN is the two-push social-v2 form used by the offline suite: version `0x02`, event `REPLY=0x02`, author index `0x00`, then the 32-byte offline parent `00..1f` and the UTF-8 text `respuesta firmada`. That parent is not a confirmed memo. The production TM1 v1 POST encoder was not used and was not modified.

| Field | Value |
| --- | --- |
| Reply script | 59 bytes |
| Output 0 | 0.00 XEC, OP_RETURN |
| Output 1 | 49999997.47 XEC, same lab P2PKH script |
| Unsigned size | 153 bytes |
| Estimated signed size | 253 bytes (100-byte Schnorr P2PKH scriptSig) |
| Expected fee | 253 satoshis = 2.53 XEC at 10.00 XEC/kB |
| Unsigned raw txid | `379a8dab68421b08de349866af38b5ccc95d1def0167e8137c961e34b603fcbe` |

`decoderawtransaction` on the regtest node parsed one unsigned input, the 59-byte reply script at value 0, and the change output. The unsigned raw transaction is:

```text
0200000001e793599a2325d11e4059d5e13a92b44c70fdbf9b995956fe33d913b3aae1a2220000000000ffffffff0200000000000000003b6a04544d4d0034020200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f726573707565737461206669726d61646103f1052a010000001976a914b4aca63fbf60884195ee538475b6840650273d3f88ac00000000
```

`testmempoolaccept` returned:

```text
allowed: false
reject-reason: mandatory-script-verify-flag-failed (Operation not valid with the current stack size)
```

That reason is the empty scriptSig. It is not acceptance and it is not a missing-input error. After that call:

- mempool size was 0
- height was still 101 and the best block was unchanged
- `gettxout` still returned the lab coinbase
- `getrawtransaction` for the unsigned txid returned error `-5` (not in mempool and not queried as a confirmed transaction)

`SIGNING_NOT_PERFORMED`, `BROADCAST_NOT_PERFORMED`, and `CHRONIK_NOT_TESTED` are the final states.

## Still not done

The list in this section is the state at the end of the unsigned phase. Signing and block inclusion are recorded in the next section. At this point in the run, signing, `sendrawtransaction`, block inclusion, a second mature input for author index 1, ALP/eMPP, reorg tests, and a regtest Chronik had not been executed. The lab node was still running as pid 2698929. Stop it later with the same datadir and `-regtest` if it is no longer needed. Do not stop pid 2075049 as part of this experiment.

## Signed regtest transactions

The node was not reinitialized and `scripts/rfc0001-regtest-bootstrap.sh` was not run again. The same process, pid 2698929, stayed on `/home/xolosarmy/xolosarmy-regtest/data`. Before each signature the guards still reported `chain=regtest`, RPC `127.0.0.1:19443`, zero peers, subversion `/Bitcoin ABC:0.34.2(EB32.0)/`, and exactly the wallet `rfc0001-regtest-only`.

The signer is `scripts/rfc0001-regtest-sign.sh`. It calls `signrawtransactionwithwallet` with the explicit prevout and sighash `ALL|FORKID`. It continues only when `complete=true` and `errors` is empty. It then checks author index 0, a P2PKH scriptSig whose public key hashes to the prevout HASH160 `b4aca63fbf60884195ee538475b6840650273d3f`, and a fee equal to `(signedSize * 1000 + 999) / 1000` satoshis at `minrelaytxfee` 10.00 XEC/kB. The first size estimate assumes a 100-byte Schnorr scriptSig. The lab wallet signed legacy ECDSA instead: a 106-byte scriptSig, push of 71 bytes, sighash byte `0x41`, then the compressed lab pubkey. When that size misses the estimate, the signer takes `requiredFeeSats` from the evaluation and signs again, at most three times. The broadcast transaction is the attempt whose fee matches its signed size. An unbroadcast 253-satoshi signature of the first candidate was not sent.

`testmempoolaccept` is called before any broadcast. A result other than `allowed=true` prints the node result and stops. No signed transaction in this phase was rejected. `sendrawtransaction` then goes only to this lab RPC. Each accepted transaction was mined with `generatetoaddress 1` to the existing lab address `ecregtest:qz62ef3lhasgssv4aefcgadkssr9qfea8u6wau5v7d`. Inclusion was checked with `getblock` and `getrawtransaction <txid> 1 <blockhash>`.

The production process pid 2075049, ports 8332, 8331, and 8333, and `/home/xolosarmy/.bitcoin` were not queried and were not changed. The lab cmdline still has no `chronik` flag. No thread was reconstructed. The result remains `CHRONIK_NOT_TESTED`. The script result also reports `s0=NOT_CLOSED`. These transactions do not activate TM1 Draft 0.2 and do not close S0. The production parser still rejects version `0x02` with `UNSUPPORTED_VERSION`.

### 1. REPLY against the offline fixture parent

Command:

```sh
bash scripts/rfc0001-regtest-sign.sh \
  --bin /home/xolosarmy/bitcoin-abc-0.34.2/bin \
  --broadcast \
  --event reply \
  --parent offline-fixture \
  --message "respuesta firmada" \
  --outpoint 22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7:0 \
  --min-confirmations 101
```

The parent bytes remain `00..1f`. That parent is still not a confirmed memo. The input was the block-1 coinbase, which `gettxout` now reports as spent. The node evaluation was `ok=true`, signed size 259, fee 259 satoshis, sighash 65, author index 0. Change is 49999997.41 XEC at output 1. `testmempoolaccept` returned `allowed=true`. The node included the transaction in a block.

| Field | Value |
| --- | --- |
| TXID | `05e924726fb94cdb8707bb40d00faf69451b479c66dde9544a67b46a1e91ec50` |
| Block | `4ac99d72f3e4bc5343a9a65526cd94e4975b8f9a994855f505a6a4f88dd1b0b1`, height 102 |
| Confirmations at inclusion | 1 |
| Input | `22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7:0` |
| OP_RETURN | 59 bytes, `6a04544d4d0034020200` plus `00..1f` and `respuesta firmada` |
| scriptSig | 106 bytes, asm ends in `[ALL|FORKID]` and pubkey `0298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99` |

Confirmed raw transaction:

```text
0200000001e793599a2325d11e4059d5e13a92b44c70fdbf9b995956fe33d913b3aae1a222000000006a473044022005fb846dc37074a70872afcc80b35c4577a8dd817a099a1ec565c4707513e7dc022074bf17430ef6b51769221a55a23d53c034a233475be324a91f368af1ccd3b7c641210298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99ffffffff0200000000000000003b6a04544d4d0034020200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f726573707565737461206669726d616461fdf0052a010000001976a914b4aca63fbf60884195ee538475b6840650273d3f88ac00000000
```

### 2. Canonical POST

The POST spends the confirmed change above, output 1, which had one confirmation and `coinbase=false`. The payload comes from `encodeTm1Post({ authorInputIndex: 0, eventData: "laboratorio RFC-0001 POST" })` and round-trips through `parseTm1Output`. The on-chain script is 35 bytes: version `0x01`, event POST `0x01`, author index 0.

```sh
bash scripts/rfc0001-regtest-sign.sh \
  --bin /home/xolosarmy/bitcoin-abc-0.34.2/bin \
  --broadcast \
  --event post \
  --message "laboratorio RFC-0001 POST" \
  --outpoint 05e924726fb94cdb8707bb40d00faf69451b479c66dde9544a67b46a1e91ec50:1 \
  --min-confirmations 1
```

Evaluation: `ok=true`, signed size 235, fee 235 satoshis, sighash 65, author index 0, same HASH160. Change is 49999995.06 XEC. `testmempoolaccept` returned `allowed=true`. Independent `getrawtransaction` shows one confirmation in the block below, and `gettxout` on the spent REPLY change is empty.

| Field | Value |
| --- | --- |
| TXID | `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585` |
| Block | `0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17`, height 103 |
| Input | `05e924726fb94cdb8707bb40d00faf69451b479c66dde9544a67b46a1e91ec50:1` |
| OP_RETURN | `6a04544d4d001c0101006c61626f7261746f72696f205246432d3030303120504f5354` |

Confirmed raw transaction:

```text
020000000150ec911e6ab4674a54e9dd669c471b4569af0fd040bb0787db4cb96f7224e905010000006a47304402205bbe0532d81c5e1680e80e13ff105ea0ddfa51a71aac99ed7b260dddd260af0a02206dc8ee0c40fec0466cfe8bf84b8d583422f59323cbc84e8d9b7e1e6285f93de141210298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99ffffffff020000000000000000236a04544d4d001c0101006c61626f7261746f72696f205246432d3030303120504f535412f0052a010000001976a914b4aca63fbf60884195ee538475b6840650273d3f88ac00000000
```

### 3. REPLY whose parent is the confirmed POST

The parent bytes are the POST txid decoded left to right, the same order `bitcoin-cli` prints. This is a lab convention for a later indexer test. It is not a statement that TM1 defines that byte order. The message is `laboratorio RFC-0001 REPLY`. The envelope is 61 bytes. No thread was built from it.

```sh
bash scripts/rfc0001-regtest-sign.sh \
  --bin /home/xolosarmy/bitcoin-abc-0.34.2/bin \
  --broadcast \
  --event reply \
  --parent 754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585 \
  --message "laboratorio RFC-0001 REPLY" \
  --outpoint 754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585:1 \
  --min-confirmations 1
```

Evaluation: `ok=true`, signed size 268, fee 268 satoshis, sighash 65, author index 0, same HASH160. Change is 49999992.38 XEC, `coinbase=false`, one confirmation. `testmempoolaccept` returned `allowed=true`. The POST change is now spent. The parent field inside the OP_RETURN is exactly `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585`.

| Field | Value |
| --- | --- |
| TXID | `3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649` |
| Block | `6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915`, height 104 |
| Input | `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585:1` |
| OP_RETURN | `6a04544d4d003d020200` plus the POST txid and `laboratorio RFC-0001 REPLY` |

Confirmed raw transaction:

```text
020000000185351287037952dc4dd7f2b8b404a6b9ba435770f4f70dd178d4635d24274575010000006a4730440220594813028429951572491cb41a2627c5d3575d5ee3e6a15ec02d18cb8fe44fbd02205595b3004e60bffbab9f6ef3d63445b06f45701cae8600d4e646a51cdabb319f41210298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99ffffffff020000000000000000446a04544d4d003d020200754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc527903871235856c61626f7261746f72696f205246432d30303031205245504c5906ef052a010000001976a914b4aca63fbf60884195ee538475b6840650273d3f88ac00000000
```

### State after the three inclusions

| Check | Result |
| --- | --- |
| Chain | `regtest` |
| Height / best block | 104 / `6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915` |
| Peers | 0 |
| Wallet | only `rfc0001-regtest-only` |
| Mempool | size 0 after each inclusion |
| Lab pid and listener | 2698929, only `127.0.0.1:19443` |
| Production pid 2075049 | cmdline unchanged |

The block-2 coinbase `502e97cbcd55d2d9e511baab39894d76692921256be9d99e00cc39c3c55033bd:0` is now mature and was still unspent after height 104. The signer selected only the explicit outpoint on each call. The new coinbases in blocks 102, 103, and 104 are immature and were not spent. Author index stayed 0 because each lab transaction has one input.

`node --test scripts/rfc0001-regtest-social.test.mjs` covers the fee rule, the unsigned fixture, the lab HASH160, the canonical POST, the production parser's rejection of v2, both scriptSig shapes, and the display-order parent bytes of the confirmed POST/REPLY pair. It does not connect to a node. Together with `scripts/d07-conf-04-historical-audit.test.mjs`, that command passed 14 tests. `@tonalli-memo/verification` passed 118 tests, `@tonalli-memo/protocol` passed 120, `@tonalli-memo/registry` passed 52, and `@tonalli-memo/chronik` passed 92. The root `pnpm -r test` still stops in `@tonalli-memo/web` on this Node v20.19.2: Vitest cannot start its jsdom workers because `webidl.util.markAsUncloneable is not a function`. That failure is outside this regtest change. `apps/web` was not modified.

Still open after the signed phase: author index 1, ALP/eMPP, reorg tests, regtest Chronik, and thread reconstruction. S0 remains open.

## Chronik enablement prepared, not started

Checked on 2026-10-29 after fast-forwarding the branch to `27bbe313c1116786e4a34b4d3098a3493c9f91af`. The lab process was still pid 2698929. It was not restarted and the bootstrap was not run again.

| Check | Result |
| --- | --- |
| Chain | `regtest` |
| Height | 104 |
| Block 104 | `6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915` |
| Block 104 transactions | coinbase `0186e0a6d6bd1c1a7d0d71a4a7d449887de1f33b44ba98aea2ee340de3f64beb`, REPLY `3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649` |
| Block 103 | `0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17`, containing POST `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585` |
| Peers / wallet | 0 / only `rfc0001-regtest-only` |
| Lab listener | `127.0.0.1:19443` only |
| Port 19442 | not listening |
| Production pid 2075049 | cmdline unchanged, including its own Chronik on `0.0.0.0:8331` |

Codex review gate, read from GitHub before any restart:

- HEAD `27bbe31` adds a locktime assertion on top of `9478405`. Codex has no completed review of `27bbe31`.
- A review of `9478405` was still `running` in the Codex review summary. That commit is not HEAD.
- Four P2 threads were still `isResolved: false`. The bootstrap findings were followed by a Codex review of `91e5b85` that reported no major issues. The PUSHDATA1 finding on `ad09c0a` is outdated in GitHub because `587422a` and `9478405` changed that reader. Those later commits do not yet have a finished Codex review. One bootstrap thread, "Put network-specific RPC settings in a regtest section", was still unresolved and not marked outdated.

The node was therefore not restarted. `chronik-client` was not pointed at the lab chain. No query was sent to port 8331 or 19442. The result remains `CHRONIK_NOT_TESTED`. S0 remains `NOT_CLOSED`.

Prepared, and not executed, restart command:

```sh
bash scripts/rfc0001-regtest-chronik-enable.sh --bin /home/xolosarmy/bitcoin-abc-0.34.2/bin --enable
```

The check that was executed does not stop the node:

```sh
bash scripts/rfc0001-regtest-chronik-enable.sh --bin /home/xolosarmy/bitcoin-abc-0.34.2/bin --check
```

```text
{"action":"check","restart":false,"chain":"regtest","block104":"6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915","chronik":"NOT_ENABLED","s0":"NOT_CLOSED"}
```

`--enable` is the only mode that stops the lab pid, appends `chronik=1` and `chronikbind=127.0.0.1:19442` under `[regtest]`, and starts Bitcoin ABC 0.34.2 again with RPC still on `127.0.0.1:19443`. It refuses another datadir, a public bind, Electrum, `chronikreindex`, and port 8331. It does not delete chain data. After a future clean Codex review it must be run on its own, then:

```sh
node scripts/rfc0001-regtest-chronik-query.mjs
```

That query constructs `chronik-client` against `http://127.0.0.1:19442` only. There is no URL argument. It loads the POST and the block-104 REPLY and passes the raw client objects to `scripts/rfc0001-regtest-chronik-verify.mjs`.

The experimental verifier does not modify or call the production TM1 parser. It checks three independent facts: the REPLY input spends POST output 1 and is the lab P2PKH script with sighash `ALL|FORKID` and a matching HASH160; Chronik `spentBy` on that POST output points at the REPLY input 0; the REPLY envelope's 32 parent bytes are the POST txid in display order. That byte order remains a lab convention. The production parser still rejects version `0x02`. The node test covers the accepting fixture and rejected reference, parent, and HASH160 mutations. It does not open a socket.

`scripts/rfc0001-regtest-sign.sh` now allows Chronik only when the config and the running cmdline both say `-chronik=1` and `chronikbind=127.0.0.1:19442`, and only together with the RPC listener. The current process has neither, so the signer still accepts this node. A public or production Chronik bind is refused.
