#!/usr/bin/env bash
# RFC-0001 / PR #42 — sign one lab social transaction on the existing regtest node.
# Broadcasts only when --broadcast is present and testmempoolaccept returns allowed=true.
# Refuses every datadir other than /home/xolosarmy/xolosarmy-regtest/data.
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

DATADIR="/home/xolosarmy/xolosarmy-regtest/data"
WALLET="rfc0001-regtest-only"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SOCIAL="$ROOT/scripts/rfc0001-regtest-social.mjs"
BROADCAST=0
EVENT=""
PARENT=""
MESSAGE=""
OUTPOINT=""
MIN_CONF=""
BIN_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --broadcast) BROADCAST=1; shift ;;
    --event) EVENT="$2"; shift 2 ;;
    --parent) PARENT="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    --outpoint) OUTPOINT="$2"; shift 2 ;;
    --min-confirmations) MIN_CONF="$2"; shift 2 ;;
    --bin) BIN_DIR="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ "$BIN_DIR" == /home/xolosarmy/bitcoin-abc-0.34.2/bin ]] || die "Refusing a Bitcoin ABC path other than the verified 0.34.2 bin"
[[ -x "$BIN_DIR/bitcoind" && -x "$BIN_DIR/bitcoin-cli" ]] || die "Verified bitcoind and bitcoin-cli must be executable"
[[ -d "$DATADIR" && ! -L "$DATADIR" ]] || die "Lab datadir must exist and must not be a symlink"
[[ "$(cd "$DATADIR" && pwd -P)" == "$DATADIR" ]] || die "Lab datadir resolved outside the dedicated path"
case "$DATADIR" in
  "$HOME/.bitcoin"|"$HOME/.bitcoin"/*) die "Refusing the default Bitcoin datadir" ;;
esac
[[ "$EVENT" == "reply" || "$EVENT" == "post" ]] || die "Event must be reply or post"
[[ -n "$MESSAGE" && -n "$OUTPOINT" && "$MIN_CONF" =~ ^[0-9]+$ ]] || die "message, outpoint and min-confirmations are required"
if [[ "$EVENT" == "reply" ]]; then
  [[ "$PARENT" == "offline-fixture" || "$PARENT" =~ ^[0-9a-f]{64}$ ]] || die "REPLY parent must be offline-fixture or 64 lowercase hex characters"
fi

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

PID="$(tr -d '[:space:]' < "$DATADIR/regtest/bitcoind.pid")"
[[ "$PID" =~ ^[0-9]+$ && -d "/proc/$PID" ]] || die "Lab bitcoind is not running"
CMDLINE="$(tr '\0' ' ' < "/proc/$PID/cmdline")"
printf '%s\n' "$CMDLINE" | grep -Fq -- "-datadir=$DATADIR" || die "Running pid is not the lab datadir"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-regtest' || die "Running node is not regtest"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-listen=0' || die "Running node is listening for peers"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-connect=0' || die "Running node allows outbound peers"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-rpcbind=127.0.0.1' || die "Running node RPC is not localhost-only"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-rpcport=19443' || die "Running node is not on port 19443"
printf '%s\n' "$CMDLINE" | grep -Fq -- 'chronik' && die "Lab node advertises Chronik"
printf '%s\n' "$CMDLINE" | grep -Fq -- "$HOME/.bitcoin" && die "Lab cmdline references the default datadir"
mapfile -t NODE_LISTEN < <(ss -ltnp | awk -v pid="$PID" 'index($0, "pid=" pid ",") { print }')
[[ ${#NODE_LISTEN[@]} -ge 1 ]] || die "Lab RPC listener is not visible"
for row in "${NODE_LISTEN[@]}"; do
  printf '%s\n' "$row" | grep -Eq '127\.0\.0\.1:19443[[:space:]]' || die "Lab node listens outside 127.0.0.1:19443"
done

CLI=("$BIN_DIR/bitcoin-cli" "-datadir=$DATADIR" "-conf=$CONF" "-regtest" "-rpcport=19443")
rpc() { "${CLI[@]}" "$@"; }
wallet_rpc() { "${CLI[@]}" "-rpcwallet=$WALLET" "$@"; }

guard_regtest() {
  local info chain blocks connections subversion
  info="$(rpc getblockchaininfo)"
  chain="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["chain"])')"
  blocks="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["blocks"])')"
  [[ "$chain" == "regtest" ]] || die "RPC chain is $chain. Abort before signing or broadcast."
  [[ "$blocks" -ge 101 ]] || die "Height $blocks is below the original maturity gate"
  connections="$(rpc getnetworkinfo | python3 -c 'import json,sys; info=json.load(sys.stdin); print(info["connections"]); assert info["connections_in"]==0 and info["connections_out"]==0')"
  [[ "$connections" == "0" ]] || die "Lab node has peers. Abort."
  subversion="$(rpc getnetworkinfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["subversion"])')"
  printf '%s\n' "$subversion" | grep -Fq 'Bitcoin ABC:0.34.2' || die "RPC identity is $subversion"
  rpc listwallets | python3 -c 'import json,sys; assert json.load(sys.stdin)==["rfc0001-regtest-only"]'
}

guard_regtest

TXID="${OUTPOINT%%:*}"
VOUT="${OUTPOINT##*:}"
[[ "$TXID" =~ ^[0-9a-f]{64}$ && "$VOUT" =~ ^[0-9]+$ ]] || die "Outpoint must be txid:vout"
TXOUT="$(rpc gettxout "$TXID" "$VOUT")"
[[ -n "$TXOUT" && "$TXOUT" != "null" ]] || die "gettxout did not find the requested lab UTXO"
export RFC0001_TXOUT="$TXOUT"
export RFC0001_MIN_CONF="$MIN_CONF"
export RFC0001_UTXOS="$(wallet_rpc listunspent)"
export RFC0001_TXID="$TXID"
export RFC0001_VOUT="$VOUT"
SELECTED="$(python3 - <<'PY'
import json, os
from decimal import Decimal
wanted_txid = os.environ["RFC0001_TXID"]
wanted_vout = int(os.environ["RFC0001_VOUT"])
minimum = int(os.environ["RFC0001_MIN_CONF"])
txout = json.loads(os.environ["RFC0001_TXOUT"])
matches = [u for u in json.loads(os.environ["RFC0001_UTXOS"]) if u.get("txid")==wanted_txid and int(u.get("vout", -1))==wanted_vout]
if len(matches) != 1:
    raise SystemExit(f"wallet does not have exactly one matching UTXO ({len(matches)})")
utxo = matches[0]
amount = Decimal(str(utxo["amount"])).quantize(Decimal("0.01"))
if utxo.get("spendable") is not True or amount <= 0 or int(utxo["confirmations"]) < minimum:
    raise SystemExit("wallet UTXO is not spendable at the required confirmation depth")
if Decimal(str(txout["value"])).quantize(Decimal("0.01")) != amount:
    raise SystemExit("gettxout amount does not match the wallet")
if txout["scriptPubKey"]["hex"] != utxo["scriptPubKey"] or txout["scriptPubKey"]["type"] != "pubkeyhash":
    raise SystemExit("gettxout script does not match the wallet")
if int(txout["confirmations"]) < minimum:
    raise SystemExit("gettxout confirmations are below the required depth")
if minimum >= 101 and txout.get("coinbase") is not True:
    raise SystemExit("the 101-confirmation gate only applies to the mature coinbase")
print(json.dumps({
    "txid": wanted_txid,
    "vout": wanted_vout,
    "amount": f"{amount:.2f}",
    "confirmations": int(txout["confirmations"]),
    "scriptPubKey": utxo["scriptPubKey"],
    "address": txout["scriptPubKey"]["addresses"][0],
    "coinbase": bool(txout.get("coinbase")),
}))
PY
)"

if [[ "$EVENT" == "post" ]]; then
  PAYLOAD="$(node --input-type=module -e '
    import { encodeTm1Post, parseTm1Output } from "./packages/protocol/dist/index.js";
    const message = process.argv[1];
    const encoded = encodeTm1Post({ authorInputIndex: 0, eventData: message });
    const parsed = parseTm1Output({ valueSats: 0n, script: encoded.script });
    if (parsed.eventType !== "POST" || parsed.authorInputIndex !== 0 || parsed.version !== 1 || parsed.eventData !== message) {
      throw new Error("canonical POST did not round-trip");
    }
    process.stdout.write(encoded.scriptHex);
  ' "$MESSAGE")"
else
  PAYLOAD="$(node "$SOCIAL" payload --event reply --parent "$PARENT" --message "$MESSAGE")"
fi

INPUT_SATS="$(printf '%s' "$SELECTED" | python3 -c 'import json,sys; from decimal import Decimal; print(int(Decimal(json.load(sys.stdin)["amount"]) * 100))')"
CHANGE_SCRIPT="$(printf '%s' "$SELECTED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["scriptPubKey"])')"
AMOUNT="$(printf '%s' "$SELECTED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["amount"])')"
MIN_RELAY="$(rpc getmempoolinfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["minrelaytxfee"])')"
FEE_SATS="$(node --input-type=module -e '
  import { requiredFeeSats } from "./scripts/rfc0001-regtest-social.mjs";
  const payload = process.argv[1].length / 2;
  const change = process.argv[2].length / 2;
  const unsigned = 4 + 1 + 36 + 1 + 4 + 1 + 8 + 1 + payload + 8 + 1 + change + 4;
  process.stdout.write(String(requiredFeeSats(unsigned + 100, process.argv[3])));
' "$PAYLOAD" "$CHANGE_SCRIPT" "$MIN_RELAY")"

SIGNED=""
EVAL=""
for _attempt in 1 2 3; do
  CHANGE_SATS="$((INPUT_SATS - FEE_SATS))"
  [[ "$CHANGE_SATS" -gt 0 ]] || die "Fee consumes the lab input"
  UNSIGNED="$(node "$SOCIAL" unsigned --txid "$TXID" --vout "$VOUT" --payload-script "$PAYLOAD" --change-script "$CHANGE_SCRIPT" --change-sats "$CHANGE_SATS")"
  guard_regtest
  SIGNED_JSON="$(wallet_rpc signrawtransactionwithwallet "$UNSIGNED" "[{\"txid\":\"$TXID\",\"vout\":$VOUT,\"scriptPubKey\":\"$CHANGE_SCRIPT\",\"amount\":\"$AMOUNT\"}]" "ALL|FORKID")"
  COMPLETE="$(printf '%s' "$SIGNED_JSON" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("errors") in (None, []); print("true" if data.get("complete") is True else "false")')"
  [[ "$COMPLETE" == "true" ]] || die "Wallet signing did not return complete=true"
  SIGNED="$(printf '%s' "$SIGNED_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hex"])')"
  EVAL="$(node "$SOCIAL" evaluate --raw "$SIGNED" --prevout-script "$CHANGE_SCRIPT" --input-sats "$INPUT_SATS" --min-relay "$MIN_RELAY" --payload-script "$PAYLOAD")"
  OK="$(printf '%s' "$EVAL" | python3 -c 'import json,sys; print("true" if json.load(sys.stdin)["ok"] else "false")')"
  if [[ "$OK" == "true" ]]; then
    break
  fi
  FEE_SATS="$(printf '%s' "$EVAL" | python3 -c 'import json,sys; print(json.load(sys.stdin)["requiredFeeSats"])')"
  SIGNED=""
done
[[ -n "$SIGNED" ]] || die "Signed transaction still fails fee, sighash, author or HASH160 checks: $EVAL"

DECODED="$(rpc decoderawtransaction "$SIGNED")"
export RFC0001_EVAL="$EVAL"
export RFC0001_DECODED="$DECODED"
export RFC0001_SELECTED="$SELECTED"
export RFC0001_FEE_SATS="$(printf '%s' "$EVAL" | python3 -c 'import json,sys; print(json.load(sys.stdin)["feeSats"])')"
export RFC0001_PAYLOAD="$PAYLOAD"
python3 - <<'PY' || die "Decoded transaction does not match the signed lab candidate"
import json, os
from decimal import Decimal
decoded = json.loads(os.environ["RFC0001_DECODED"])
selected = json.loads(os.environ["RFC0001_SELECTED"])
fee = int(os.environ["RFC0001_FEE_SATS"])
change = int((Decimal(str(decoded["vout"][1]["value"])) * 100).to_integral_value())
spent = int((Decimal(selected["amount"]) * 100).to_integral_value())
assert decoded["vin"][0]["txid"] == selected["txid"]
assert decoded["vin"][0]["vout"] == selected["vout"]
assert decoded["vout"][0]["scriptPubKey"]["hex"] == os.environ["RFC0001_PAYLOAD"]
assert spent - change == fee
assert decoded["vout"][1]["scriptPubKey"]["hex"] == selected["scriptPubKey"]
PY

guard_regtest
ACCEPT="$(rpc testmempoolaccept "[\"$SIGNED\"]")"
ALLOWED="$(printf '%s' "$ACCEPT" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert len(data)==1; print("true" if data[0].get("allowed") is True else "false")')"
if [[ "$ALLOWED" != "true" ]]; then
  printf '%s\n' "$ACCEPT" >&2
  die "testmempoolaccept rejected the signed transaction. Broadcast was not attempted."
fi

TXID_OUT="$(printf '%s' "$DECODED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["txid"])')"
RESULT="{\"event\":\"$EVENT\",\"mempool_allowed\":true,\"txid\":\"$TXID_OUT\",\"broadcast\":false,\"evaluation\":$EVAL,\"accept\":$ACCEPT}"
if [[ "$BROADCAST" -ne 1 ]]; then
  printf '%s\n' "$RESULT"
  printf 'BROADCAST_NOT_REQUESTED\n'
  exit 0
fi

guard_regtest
SUBMITTED="$(rpc sendrawtransaction "$SIGNED")"
[[ "$SUBMITTED" == "$TXID_OUT" ]] || die "Node returned txid $SUBMITTED for a transaction whose txid is $TXID_OUT"
ADDRESS="$(printf '%s' "$SELECTED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["address"])')"
BLOCK_HASH="$(rpc generatetoaddress 1 "$ADDRESS" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0])')"
BLOCK="$(rpc getblock "$BLOCK_HASH" 1)"
export RFC0001_BLOCK="$BLOCK"
export RFC0001_TXID="$TXID_OUT"
python3 - <<'PY' || die "Mined block does not contain the submitted lab transaction"
import json, os
block = json.loads(os.environ["RFC0001_BLOCK"])
txid = os.environ["RFC0001_TXID"]
assert txid in block["tx"], "txid absent from mined block"
PY
CONFIRMED="$(rpc getrawtransaction "$TXID_OUT" 1 "$BLOCK_HASH")"
export RFC0001_CONFIRMED="$CONFIRMED"
python3 - <<'PY' || die "Confirmed transaction does not match the submitted txid"
import json, os
tx = json.loads(os.environ["RFC0001_CONFIRMED"])
assert tx["txid"] == os.environ["RFC0001_TXID"]
assert int(tx["confirmations"]) >= 1
assert tx["blockhash"] == json.loads(os.environ["RFC0001_BLOCK"])["hash"]
PY
guard_regtest
printf '{"event":"%s","mempool_allowed":true,"txid":"%s","broadcast":true,"blockhash":"%s","confirmations":1,"evaluation":%s,"chronik":"CHRONIK_NOT_TESTED","s0":"NOT_CLOSED"}\n' "$EVENT" "$TXID_OUT" "$BLOCK_HASH" "$EVAL"
printf 'CHRONIK_NOT_TESTED\n'
