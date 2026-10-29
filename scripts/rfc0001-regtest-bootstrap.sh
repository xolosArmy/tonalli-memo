#!/usr/bin/env bash
# RFC-0001 / PR #42 — isolated eCash regtest initialization only.
# Run manually after verifying official Bitcoin ABC 0.34.2 binaries.
# NO mainnet; NO broadcast of social transactions; NO real keys.
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if [[ $# -ne 1 ]]; then
  die "Usage: bash scripts/rfc0001-regtest-bootstrap.sh /absolute/path/to/bitcoin-abc-0.34.2/bin"
fi

BIN_DIR="$1"
[[ -x "$BIN_DIR/bitcoind" ]] || die "bitcoind not found; verify the official release first"
[[ -x "$BIN_DIR/bitcoin-cli" ]] || die "bitcoin-cli not found; verify the official release first"
"$BIN_DIR/bitcoind" -version | grep -Fq '0.34.2' || die "Unexpected binary version (expected 0.34.2)"

DATADIR="${RFC0001_REGTEST_DATADIR:-$HOME/xolosarmy-regtest/data}"
[[ ! -L "$DATADIR" ]] || die "Datadir must not be a symlink"
mkdir -p "$DATADIR"
chmod 700 "$DATADIR"
DATADIR="$(cd "$DATADIR" && pwd -P)"
CONF="$DATADIR/bitcoin.conf"
[[ ! -e "$CONF" ]] || die "Refusing to overwrite existing config ($CONF); inspect datadir manually"
[[ ! -d "$DATADIR/regtest" ]] || die "Datadir already contains a regtest chain; refusing to change it automatically"

# No RPC passwords on command line or stored in repository: Bitcoin ABC
# uses per-datadir cookie authentication for local RPC.
umask 077
cat > "$CONF" <<'CONF'
regtest=1
server=1
listen=0
connect=0
dnsseed=0
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=19443
CONF

CLI=("$BIN_DIR/bitcoin-cli" "-datadir=$DATADIR" "-conf=$CONF" "-regtest" "-rpcport=19443")
rpc() { "${CLI[@]}" "$@"; }

# Network is deliberately prevented from peer connectivity. RPC is localhost only.
"$BIN_DIR/bitcoind" \
  "-datadir=$DATADIR" \
  "-conf=$CONF" \
  -regtest -server=1 -daemonwait \
  -listen=0 -connect=0 -dnsseed=0 \
  -rpcbind=127.0.0.1 -rpcallowip=127.0.0.1 -rpcport=19443

command -v python3 >/dev/null || die "python3 is required for the regtest chain guard"
CHAIN="$(rpc getblockchaininfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["chain"])')"
[[ "$CHAIN" == "regtest" ]] || die "RPC returned $CHAIN (not regtest). ABORT."

HEIGHT="$(rpc getblockcount)"
[[ "$HEIGHT" == "0" ]] || die "Expected a new regtest chain at height 0, got height $HEIGHT"

WALLET="rfc0001-regtest-only"
rpc createwallet "$WALLET" >/dev/null || die "Could not create isolated test wallet"
ADDR="$(rpc "-rpcwallet=$WALLET" getnewaddress)"
[[ -n "$ADDR" ]] || die "Wallet did not return a test address"

# Coinbase maturity: the reward from block 1 is spendable after 101 blocks.
rpc generatetoaddress 101 "$ADDR" > "$DATADIR/initial-regtest-blocks.json"

CHAIN_AFTER="$(rpc getblockchaininfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["chain"])')"
[[ "$CHAIN_AFTER" == "regtest" ]] || die "Chain switched unexpectedly; do not use this node"
printf 'Regtest chain: %s\n' "$CHAIN_AFTER"
printf 'Block height: %s\n' "$(rpc getblockcount)"
printf 'Wallet test-only balance: %s\n' "$(rpc "-rpcwallet=$WALLET" getbalance)"
printf 'Test-only UTXOs:\n'
rpc "-rpcwallet=$WALLET" listunspent

printf '\nBootstrap complete. No social transactions were assembled, signed or broadcast.\n'
printf 'Use -regtest and -datadir=%s with every subsequent local RPC.\n' "$DATADIR"
