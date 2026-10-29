#!/usr/bin/env bash
# RFC-0001 / PR #42 — enable Chronik on the existing lab regtest node.
# Default is --check. --enable restarts a running lab node; --recover starts ONLY an already-stopped lab node with Chronik config.
# A successful ss -ltnp table is required before any rpc stop or bitcoind start.
# Do not pass --enable until Codex has reviewed the current HEAD and no P1/P2 remains.
# Refuses every datadir other than /home/xolosarmy/xolosarmy-regtest/data.
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

DATADIR="/home/xolosarmy/xolosarmy-regtest/data"
WALLET="rfc0001-regtest-only"
BIN_DIR=""
MODE="check"
BLOCK103="0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17"
BLOCK104="6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915"
POST_TXID="754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585"
REPLY_TXID="3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649"
PROD_PID="2075049"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --enable) MODE="enable"; shift ;;
    --recover) MODE="recover"; shift ;;
    --bin) BIN_DIR="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ "$MODE" == "check" || "$MODE" == "enable" || "$MODE" == "recover" ]] || die "Mode must be check, enable or recover"
[[ "$BIN_DIR" == /home/xolosarmy/bitcoin-abc-0.34.2/bin ]] || die "Refusing a Bitcoin ABC path other than the verified 0.34.2 bin"
[[ -x "$BIN_DIR/bitcoind" && -x "$BIN_DIR/bitcoin-cli" ]] || die "Verified bitcoind and bitcoin-cli must be executable"
[[ -d "$DATADIR" && ! -L "$DATADIR" ]] || die "Lab datadir must exist and must not be a symlink"
[[ "$(cd "$DATADIR" && pwd -P)" == "$DATADIR" ]] || die "Lab datadir resolved outside the dedicated path"
case "$DATADIR" in
  "$HOME/.bitcoin"|"$HOME/.bitcoin"/*) die "Refusing the default Bitcoin datadir" ;;
esac
[[ -d "$DATADIR/regtest/blocks" ]] || die "Lab chain data is missing; refusing to bootstrap"

VERSION_TEXT="$("$BIN_DIR/bitcoind" -version)"
printf '%s\n' "$VERSION_TEXT" | grep -Fq 'Bitcoin ABC' || die "Binary is not Bitcoin ABC"
printf '%s\n' "$VERSION_TEXT" | grep -Fq '0.34.2' || die "Unexpected binary version"

CONF="$DATADIR/bitcoin.conf"
grep -qx 'regtest=1' "$CONF" || die "Missing regtest=1"
grep -qx 'listen=0' "$CONF" || die "Missing listen=0"
grep -qx 'connect=0' "$CONF" || die "Missing connect=0"
grep -qx 'dnsseed=0' "$CONF" || die "Missing dnsseed=0"
grep -qx 'rpcbind=127.0.0.1' "$CONF" || die "Missing localhost rpcbind"
grep -qx 'rpcallowip=127.0.0.1' "$CONF" || die "Missing localhost rpcallowip"
grep -qx 'rpcport=19443' "$CONF" || die "Missing rpcport 19443"
if grep -q 'chronik' "$CONF"; then
  grep -qx 'chronik=1' "$CONF" || die "Existing Chronik config is not chronik=1"
  grep -qx 'chronikbind=127.0.0.1:19442' "$CONF" || die "Existing Chronik bind is not 127.0.0.1:19442"
fi

validate_lab_conf() {
  python3 - "$CONF" <<'PY'
import pathlib, sys
raw = pathlib.Path(sys.argv[1]).read_bytes()
if not raw.endswith(b"\n"):
    raise SystemExit("Lab config must end with a newline before stopping the node")
lines = raw.decode("utf-8").splitlines()
base = ["regtest=1", "server=1", "[regtest]", "listen=0", "connect=0",
        "dnsseed=0", "rpcbind=127.0.0.1", "rpcallowip=127.0.0.1",
        "rpcport=19443"]
chronik = ["chronik=1", "chronikbind=127.0.0.1:19442"]
if lines not in (base, base + chronik):
    raise SystemExit("Unsafe or ambiguous lab config; refuse to stop node")
PY
}

production_untouched() {
  [[ -d "/proc/$PROD_PID" ]] || return 0
  local cmdline
  cmdline="$(tr '\0' ' ' < "/proc/$PROD_PID/cmdline")"
  printf '%s\n' "$cmdline" | grep -Fq -- '-datadir=/home/xolosarmy/.bitcoin' || die "Production pid cmdline changed; abort before any lab restart"
  [[ "$PROD_PID" != "$(tr -d '[:space:]' < "$DATADIR/regtest/bitcoind.pid" 2>/dev/null || true)" ]] || die "Lab pid file points at the production process"
}

# One validated listener table. A missing binary, a non-zero status, an empty
# capture, or a headerless capture is not an empty listener set.
require_socket_table() {
  command -v ss >/dev/null 2>&1 || die "ss is required before any lab stop or start"
  local status=0
  local output
  output="$(ss -ltnp 2>/dev/null)" || status=$?
  if [[ "$status" -ne 0 ]]; then
    die "ss -ltnp failed with status ${status}; refusing to treat that as no listeners"
  fi
  if [[ -z "$output" ]]; then
    die "ss -ltnp returned no output; refusing to treat that as no listeners"
  fi
  local header="${output%%$'\n'*}"
  case "$header" in
    *State*Local\ Address:Port*) ;;
    *) die "ss -ltnp returned invalid output; refusing to treat that as no listeners" ;;
  esac
  SOCKET_TABLE="$output"
}

socket_data_rows() {
  [[ -n "${SOCKET_TABLE:-}" ]] || die "Socket table was not validated"
  printf '%s\n' "$SOCKET_TABLE" | tail -n +2
}

# Exit 0 when one validated data row matches. This never invokes ss.
socket_table_matches() {
  local pattern="$1"
  local pid="${2:-}"
  local rows
  rows="$(socket_data_rows)"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$rows" | awk -v pid="$pid" -v pat="$pattern" 'index($0, "pid=" pid ",") && $0 ~ pat { found=1 } END { exit found ? 0 : 1 }'
  else
    printf '%s\n' "$rows" | awk -v pat="$pattern" '$0 ~ pat { found=1 } END { exit found ? 0 : 1 }'
  fi
}

lab_cmdline_ok() {
  local cmdline="$1"
  printf '%s\n' "$cmdline" | grep -Fq -- "-datadir=$DATADIR" || die "Running pid is not the lab datadir"
  printf '%s\n' "$cmdline" | grep -Fq -- '-regtest' || die "Running node is not regtest"
  printf '%s\n' "$cmdline" | grep -Fq -- '-listen=0' || die "Running node is listening for peers"
  printf '%s\n' "$cmdline" | grep -Fq -- '-connect=0' || die "Running node allows outbound peers"
  # RPC bind is exclusively in validated bitcoin.conf; do not duplicate it on CLI.
  printf '%s\n' "$cmdline" | grep -Fq -- '-rpcport=19443' || die "Running node is not on port 19443"
  if printf '%s\n' "$cmdline" | grep -Fq -- "$HOME/.bitcoin"; then
    die "Lab cmdline references the default datadir"
  fi
  if printf '%s\n' "$cmdline" | grep -Eq -- 'chronikreindex|chronikelectrum|chronikcors|0\.0\.0\.0|:8331'; then
    die "Lab cmdline exposes a non-lab endpoint"
  fi
}

CLI=("$BIN_DIR/bitcoin-cli" "-datadir=$DATADIR" "-conf=$CONF" "-regtest" "-rpcport=19443")
rpc() { "${CLI[@]}" "$@"; }

assert_chain() {
  local info chain blocks hash103 hash104
  info="$(rpc getblockchaininfo)"
  chain="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["chain"])')"
  blocks="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["blocks"])')"
  [[ "$chain" == "regtest" ]] || die "RPC chain is $chain"
  [[ "$blocks" -ge 104 ]] || die "Height $blocks is below block 104"
  hash104="$(rpc getblockhash 104)"
  hash103="$(rpc getblockhash 103)"
  [[ "$hash104" == "$BLOCK104" ]] || die "Block 104 hash changed"
  [[ "$hash103" == "$BLOCK103" ]] || die "Block 103 hash changed"
  rpc getblock "$hash103" 1 | python3 -c 'import json,os,sys; assert os.environ["RFC0001_POST"] in json.load(sys.stdin)["tx"]' 
  rpc getblock "$hash104" 1 | python3 -c 'import json,os,sys; assert os.environ["RFC0001_REPLY"] in json.load(sys.stdin)["tx"]'
  local peers
  peers="$(rpc getnetworkinfo | python3 -c 'import json,sys; info=json.load(sys.stdin); assert info["connections_in"]==0 and info["connections_out"]==0; print(info["connections"])')"
  [[ "$peers" == "0" ]] || die "Lab node has peers"
  rpc getnetworkinfo | python3 -c 'import json,sys; assert "Bitcoin ABC:0.34.2" in json.load(sys.stdin)["subversion"]'
}

validate_lab_conf

export RFC0001_POST="$POST_TXID"
export RFC0001_REPLY="$REPLY_TXID"
production_untouched
require_socket_table

PID=""
RUNNING=0
if [[ -f "$DATADIR/regtest/bitcoind.pid" ]]; then
  PID="$(tr -d '[:space:]' < "$DATADIR/regtest/bitcoind.pid")"
  if [[ "$PID" =~ ^[0-9]+$ && -d "/proc/$PID" ]]; then
    RUNNING=1
  fi
fi

if [[ "$RUNNING" == 1 ]]; then
  CMDLINE="$(tr '\0' ' ' < "/proc/$PID/cmdline")"
  lab_cmdline_ok "$CMDLINE"
  assert_chain
  if printf '%s\n' "$CMDLINE" | grep -Fq -- '-chronik=1'; then
    grep -qx 'chronik=1' "$CONF" || die "Chronik is not enabled in config"
    grep -qx 'chronikbind=127.0.0.1:19442' "$CONF" || die "Chronik bind is not localhost in config"
    if printf '%s\n' "$CMDLINE" | grep -Eq -- '-chronikbind=|-rpcbind='; then
      die "Repeated socket bind in Chronik or RPC command line"
    fi
    if ! socket_table_matches '127\.0\.0\.1:19442[[:space:]]' "$PID"; then
      die "Chronik listener missing"
    fi
    if ! socket_table_matches '127\.0\.0\.1:19443[[:space:]]' "$PID"; then
      die "RPC listener missing"
    fi
    printf '{"action":"already-enabled","restart":false,"chain":"regtest","blocks":104,"chronik":"127.0.0.1:19442","s0":"NOT_CLOSED"}\n'
    exit 0
  fi
fi

if [[ "$MODE" == "check" ]]; then
  [[ "$RUNNING" == 1 ]] || die "Lab node is not running; --check does not start it"
  if socket_table_matches ':19442[[:space:]]' "$PID"; then
    die "Port 19442 is already open before Chronik is enabled"
  fi
  printf '{"action":"check","restart":false,"chain":"regtest","block104":"%s","chronik":"NOT_ENABLED","s0":"NOT_CLOSED"}\n' "$BLOCK104"
  exit 0
fi

# This path is the sole recovery from the previously documented double-bind
# startup failure. It must not stop another process or reset the chain.
if [[ "$MODE" == "recover" ]]; then
  [[ "$RUNNING" == 0 ]] || die "--recover refuses a running lab process"
  [[ ! -e "$DATADIR/regtest/bitcoind.pid" ]] || die "Stale or unexpected lab PID file: inspect manually"
  grep -qx 'chronik=1' "$CONF" || die "Recovery requires existing Chronik-enabled config"
  grep -qx 'chronikbind=127.0.0.1:19442' "$CONF" || die "Recovery requires localhost Chronik bind"
  production_untouched
else
  [[ "$RUNNING" == 1 ]] || die "Lab node is stopped: --enable cannot recover it; use --recover after review"
  if socket_table_matches ':19442[[:space:]]'; then
    die "Port 19442 is occupied before enable"
  fi

  CMDLINE="$(tr '\0' ' ' < "/proc/$PID/cmdline")"
  lab_cmdline_ok "$CMDLINE"
  assert_chain
  rpc stop >/dev/null
  for _wait in $(seq 1 30); do
    [[ ! -d "/proc/$PID" ]] && break
    sleep 1
  done
  [[ ! -d "/proc/$PID" ]] || die "Lab node did not stop. No signal was sent to any other process."
  production_untouched

  # Configuration was checked fully before stopping; append the bind in ONE
  # source only (bitcoin.conf). The new process must not pass -chronikbind.
  if ! grep -qx 'chronik=1' "$CONF"; then
    printf 'chronik=1\nchronikbind=127.0.0.1:19442\n' >> "$CONF"
  fi
  validate_lab_conf
fi

# Refresh after a possible stop. Failure here still refuses the start.
require_socket_table
if socket_table_matches ':(19442|19443)[[:space:]]'; then
  die "A lab RPC/Chronik port is already in use; refusing start"
fi

"$BIN_DIR/bitcoind" \
  "-datadir=$DATADIR" \
  "-conf=$CONF" \
  -regtest -server=1 -daemonwait \
  -listen=0 -connect=0 -dnsseed=0 \
  -rpcport=19443 \
  -chronik=1

NEW_PID="$(tr -d '[:space:]' < "$DATADIR/regtest/bitcoind.pid")"
[[ "$NEW_PID" =~ ^[0-9]+$ && -d "/proc/$NEW_PID" ]] || die "Restarted lab node pid is not visible"
[[ "$NEW_PID" != "$PROD_PID" ]] || die "Restarted pid matches the production process"
NEW_CMD="$(tr '\0' ' ' < "/proc/$NEW_PID/cmdline")"
lab_cmdline_ok "$NEW_CMD"
printf '%s\n' "$NEW_CMD" | grep -Fq -- '-chronik=1' || die "Restarted node did not enable Chronik"
if printf '%s\n' "$NEW_CMD" | grep -Eq -- '-chronikbind=|-rpcbind='; then
  die "Restarted lab process duplicates config-only binding"
fi
grep -qx 'chronikbind=127.0.0.1:19442' "$CONF" || die "Missing Chronik bind in config"
assert_chain
mapfile -t WALLETS < <(rpc listwallets | python3 -c 'import json,sys; [print(item) for item in json.load(sys.stdin)]')
if [[ ${#WALLETS[@]} -eq 0 ]]; then
  rpc loadwallet "$WALLET" >/dev/null
elif [[ ${#WALLETS[@]} -eq 1 && "${WALLETS[0]}" == "$WALLET" ]]; then
  true
else
  die "Restarted node loaded an unexpected wallet set"
fi
rpc listwallets | python3 -c 'import json,sys; assert json.load(sys.stdin)==["rfc0001-regtest-only"]'
require_socket_table
if ! socket_table_matches '127\.0\.0\.1:19442[[:space:]]' "$NEW_PID"; then
  die "Chronik is not listening on 127.0.0.1:19442"
fi
if ! socket_table_matches '127\.0\.0\.1:19443[[:space:]]' "$NEW_PID"; then
  die "RPC is not listening on 127.0.0.1:19443"
fi
production_untouched
printf '{"action":"enabled","restart":%s,"chain":"regtest","block104":"%s","chronik":"127.0.0.1:19442","rpc":"127.0.0.1:19443","s0":"NOT_CLOSED"}\n' "$([[ "$MODE" == "enable" ]] && echo true || echo false)" "$BLOCK104"
