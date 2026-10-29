#!/usr/bin/env bash
# RFC-0001 / PR #42 — unsigned regtest REPLY candidate only.
# Reads one mature UTXO from the isolated lab wallet and prints an unsigned
# two-push social-v2 REPLY. It does not sign, broadcast, or load any other wallet.
# Refuse mainnet, the default ~/.bitcoin datadir, and any non-regtest RPC.
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if [[ $# -ne 1 ]]; then
  die "Usage: bash scripts/rfc0001-regtest-reply-unsigned.sh /absolute/path/to/bitcoin-abc-0.34.2/bin"
fi

BIN_DIR="$1"
[[ "$BIN_DIR" == /* ]] || die "Bitcoin ABC bin directory must be an absolute path"
[[ -x "$BIN_DIR/bitcoind" && -x "$BIN_DIR/bitcoin-cli" ]] || die "bitcoind and bitcoin-cli must be executable"
VERSION_TEXT="$("$BIN_DIR/bitcoind" -version)"
printf '%s\n' "$VERSION_TEXT" | grep -Fq 'Bitcoin ABC' || die "Binary is not Bitcoin ABC"
printf '%s\n' "$VERSION_TEXT" | grep -Fq '0.34.2' || die "Unexpected binary version (expected Bitcoin ABC 0.34.2)"

DATADIR="${RFC0001_REGTEST_DATADIR:-$HOME/xolosarmy-regtest/data}"
[[ -d "$DATADIR" && ! -L "$DATADIR" ]] || die "Datadir must be an existing non-symlink directory"
DATADIR="$(cd "$DATADIR" && pwd -P)"
case "$DATADIR" in
  "$HOME/.bitcoin"|"$HOME/.bitcoin"/*)
    die "Refusing the default Bitcoin datadir"
    ;;
esac
CONF="$DATADIR/bitcoin.conf"
[[ -f "$CONF" && ! -L "$CONF" ]] || die "Missing regtest bitcoin.conf"

require_conf_line() {
  grep -qx -- "$1" "$CONF" || die "Regtest config is missing required line: $1"
}
require_conf_line 'regtest=1'
require_conf_line 'listen=0'
require_conf_line 'connect=0'
require_conf_line 'dnsseed=0'
require_conf_line 'rpcbind=127.0.0.1'
require_conf_line 'rpcallowip=127.0.0.1'
require_conf_line 'rpcport=19443'

PID_FILE="$DATADIR/regtest/bitcoind.pid"
[[ -f "$PID_FILE" ]] || die "Regtest bitcoind pid file is missing"
NODE_PID="$(tr -d '[:space:]' < "$PID_FILE")"
[[ "$NODE_PID" =~ ^[0-9]+$ ]] || die "Unreadable regtest bitcoind pid"
[[ -d "/proc/$NODE_PID" ]] || die "Regtest bitcoind is not running"
CMDLINE="$(tr '\0' ' ' < "/proc/$NODE_PID/cmdline")"
printf '%s\n' "$CMDLINE" | grep -Fq -- "-datadir=$DATADIR" || die "Pid $NODE_PID is not the dedicated regtest node"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-regtest' || die "Dedicated node was not started with -regtest"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-listen=0' || die "Dedicated node is not configured with -listen=0"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-connect=0' || die "Dedicated node is not configured with -connect=0"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-rpcbind=127.0.0.1' || die "Dedicated node RPC is not bound to localhost"
printf '%s\n' "$CMDLINE" | grep -Fq -- '-rpcport=19443' || die "Dedicated node is not on RPC port 19443"
printf '%s\n' "$CMDLINE" | grep -Fq -- 'chronik' && die "Dedicated regtest node advertises Chronik; refusing"
printf '%s\n' "$CMDLINE" | grep -Fq -- "$HOME/.bitcoin" && die "Dedicated node cmdline references the default datadir"

mapfile -t NODE_LISTEN < <(ss -ltnp | awk -v pid="$NODE_PID" 'index($0, "pid=" pid ",") { print }')
[[ ${#NODE_LISTEN[@]} -ge 1 ]] || die "Could not see the regtest RPC listener"
for row in "${NODE_LISTEN[@]}"; do
  printf '%s\n' "$row" | grep -Eq '127\.0\.0\.1:19443[[:space:]]' || die "Regtest node listens outside 127.0.0.1:19443: $row"
done

CLI=("$BIN_DIR/bitcoin-cli" "-datadir=$DATADIR" "-conf=$CONF" "-regtest" "-rpcport=19443")
WALLET='rfc0001-regtest-only'
rpc() { "${CLI[@]}" "$@"; }
wallet_rpc() { "${CLI[@]}" "-rpcwallet=$WALLET" "$@"; }

guard_regtest() {
  local info chain blocks connections subversion wallets
  info="$(rpc getblockchaininfo)"
  chain="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["chain"])')"
  blocks="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["blocks"])')"
  [[ "$chain" == "regtest" ]] || die "RPC chain is $chain, not regtest. Abort before signing or broadcast."
  [[ "$blocks" -ge 101 ]] || die "Regtest height $blocks is below the 101-block maturity gate"
  connections="$(rpc getnetworkinfo | python3 -c 'import json,sys; info=json.load(sys.stdin); print(info["connections"]); assert info["connections_in"]==0 and info["connections_out"]==0')"
  [[ "$connections" == "0" ]] || die "Regtest node has $connections peers. Abort."
  subversion="$(rpc getnetworkinfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["subversion"])')"
  printf '%s\n' "$subversion" | grep -Fq 'Bitcoin ABC:0.34.2' || die "RPC subversion is not Bitcoin ABC 0.34.2: $subversion"
  wallets="$(rpc listwallets)"
  printf '%s' "$wallets" | python3 -c 'import json,sys; wallets=json.load(sys.stdin); assert wallets==["rfc0001-regtest-only"], wallets'
}

guard_regtest

UTXO_JSON="$(wallet_rpc listunspent)"
export RFC0001_UTXO_JSON="$UTXO_JSON"
SELECTED="$(python3 - <<'PY'
import json, os
from decimal import Decimal
utxos = json.loads(os.environ["RFC0001_UTXO_JSON"])
mature = [
    u for u in utxos
    if u.get("spendable") is True
    and Decimal(str(u.get("amount", "0"))) > 0
    and int(u.get("confirmations", 0)) >= 101
    and int(u.get("vout", -1)) >= 0
    and isinstance(u.get("txid"), str)
    and isinstance(u.get("scriptPubKey"), str)
]
if len(mature) != 1:
    raise SystemExit(f"expected exactly one mature spendable lab UTXO, found {len(mature)}")
u = mature[0]
amount = Decimal(str(u["amount"])).quantize(Decimal("0.01"))
print(json.dumps({
    "txid": u["txid"],
    "vout": u["vout"],
    "amount": f"{amount:.2f}",
    "confirmations": u["confirmations"],
    "scriptPubKey": u["scriptPubKey"],
    "address": u.get("address", ""),
}, separators=(",", ":")))
PY
)"

TXID="$(printf '%s' "$SELECTED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["txid"])')"
VOUT="$(printf '%s' "$SELECTED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["vout"])')"
TXOUT_JSON="$(rpc gettxout "$TXID" "$VOUT")"
[[ -n "$TXOUT_JSON" && "$TXOUT_JSON" != "null" ]] || die "gettxout did not find the selected lab UTXO"
export RFC0001_SELECTED="$SELECTED"
export RFC0001_TXOUT="$TXOUT_JSON"
python3 - <<'PY' || die "Wallet UTXO does not match independent gettxout"
import json, os
from decimal import Decimal
selected = json.loads(os.environ["RFC0001_SELECTED"])
txout = json.loads(os.environ["RFC0001_TXOUT"])
assert txout["confirmations"] >= 101
assert txout["coinbase"] is True
assert Decimal(str(txout["value"])) == Decimal(selected["amount"])
assert txout["scriptPubKey"]["hex"] == selected["scriptPubKey"]
assert txout["scriptPubKey"]["type"] == "pubkeyhash"
PY

BEST_BEFORE="$(rpc getblockchaininfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["bestblockhash"])')"

# Second regtest-only guard. Signing and broadcast are intentionally absent
# after this point; the script stops at the unsigned candidate.
guard_regtest
BEST_AFTER="$(rpc getblockchaininfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["bestblockhash"])')"
[[ "$BEST_AFTER" == "$BEST_BEFORE" ]] || die "Best block changed during preparation. Abort."

export RFC0001_BEST="$BEST_AFTER"
export RFC0001_MINRELAY="$(rpc getmempoolinfo | python3 -c 'import json,sys; print(json.load(sys.stdin)["minrelaytxfee"])')"
RAW_HEX="$(python3 - <<'PY'
import json, os, struct
from decimal import Decimal, ROUND_CEILING

selected = json.loads(os.environ["RFC0001_SELECTED"])
SATS_PER_XEC = 100
input_sats = int((Decimal(selected["amount"]) * SATS_PER_XEC).to_integral_value())
if input_sats <= 0:
    raise SystemExit("input amount is not a positive satoshi value")

target = bytes(range(32))  # offline fixture parent, not a confirmed memo
text = "respuesta firmada".encode("utf-8")
envelope = bytes([0x02, 0x02, 0x00]) + target + text
if len(envelope) > 75:
    raise SystemExit("REPLY envelope requires a direct push")
reply_script = bytes([0x6a, 0x04, 0x54, 0x4d, 0x4d, 0x00, len(envelope)]) + envelope
change_script = bytes.fromhex(selected["scriptPubKey"])
if change_script[:3] != bytes.fromhex("76a914") or change_script[-2:] != bytes.fromhex("88ac") or len(change_script) != 25:
    raise SystemExit("change script is not a 25-byte P2PKH script")

def varint(value: int) -> bytes:
    if value < 0xfd:
        return bytes([value])
    if value <= 0xffff:
        return b"\xfd" + struct.pack("<H", value)
    if value <= 0xffffffff:
        return b"\xfe" + struct.pack("<I", value)
    return b"\xff" + struct.pack("<Q", value)

def serialize(change_sats: int) -> bytes:
    if change_sats <= 0:
        raise SystemExit("change would be zero or negative")
    return b"".join([
        struct.pack("<I", 2),
        varint(1),
        bytes.fromhex(selected["txid"])[::-1],
        struct.pack("<I", int(selected["vout"])),
        varint(0),
        struct.pack("<I", 0xffffffff),
        varint(2),
        struct.pack("<Q", 0),
        varint(len(reply_script)),
        reply_script,
        struct.pack("<Q", change_sats),
        varint(len(change_script)),
        change_script,
        struct.pack("<I", 0),
    ])

# Empty scriptSig is one varint byte. A 100-byte Schnorr P2PKH scriptSig is
# one length byte plus 100 bytes, so the signed size is unsigned size + 100.
unsigned_size = len(serialize(input_sats - 1))
signed_size = unsigned_size + 100
minrelay_xec_per_kb = Decimal(os.environ["RFC0001_MINRELAY"])
fee_xec = (minrelay_xec_per_kb * Decimal(signed_size) / Decimal(1000)).quantize(Decimal("0.01"), rounding=ROUND_CEILING)
fee_sats = int((fee_xec * SATS_PER_XEC).to_integral_value())
if fee_sats < signed_size:
    fee_sats = signed_size
    fee_xec = (Decimal(fee_sats) / SATS_PER_XEC).quantize(Decimal("0.01"))
change_sats = input_sats - fee_sats
raw = serialize(change_sats)
if len(raw) != unsigned_size:
    raise SystemExit("fee changed the unsigned transaction size")
report = {
    "status": "UNSIGNED_REPLY_CANDIDATE",
    "chain": "regtest",
    "bestblockhash": os.environ["RFC0001_BEST"],
    "author_input_index": 0,
    "author_index_reason": "only one mature lab UTXO exists at this height; index 1 would be out of range",
    "reply_target": "offline-fixture-bytes-00-through-1f",
    "reply_target_is_confirmed_memo": False,
    "message_utf8": "respuesta firmada",
    "input": {
        "txid": selected["txid"],
        "vout": int(selected["vout"]),
        "confirmations": selected["confirmations"],
        "amount_xec": selected["amount"],
        "amount_sats": input_sats,
        "scriptPubKey": selected["scriptPubKey"],
    },
    "reply_script_hex": reply_script.hex(),
    "reply_script_bytes": len(reply_script),
    "envelope_bytes": len(envelope),
    "outputs": [
        {"n": 0, "amount_xec": "0.00", "amount_sats": 0, "script_bytes": len(reply_script)},
        {"n": 1, "amount_xec": f"{Decimal(change_sats) / SATS_PER_XEC:.2f}", "amount_sats": change_sats, "script_bytes": len(change_script)},
    ],
    "unsigned_size_bytes": len(raw),
    "estimated_signed_size_bytes": signed_size,
    "minrelaytxfee_xec_per_kb": str(minrelay_xec_per_kb),
    "expected_fee_sats": fee_sats,
    "expected_fee_xec": f"{fee_xec:.2f}",
    "raw_tx_hex": raw.hex(),
    "signing": "NOT_PERFORMED",
    "broadcast": "NOT_PERFORMED",
    "chronik": "CHRONIK_NOT_TESTED",
}
print(json.dumps(report))
PY
)"

RAW_ONLY="$(printf '%s' "$RAW_HEX" | python3 -c 'import json,sys; print(json.load(sys.stdin)["raw_tx_hex"])')"
DECODED="$(rpc decoderawtransaction "$RAW_ONLY")"
ACCEPT="$(rpc testmempoolaccept "[\"$RAW_ONLY\"]")"
export RFC0001_REPORT="$RAW_HEX"
export RFC0001_DECODED="$DECODED"
export RFC0001_ACCEPT="$ACCEPT"
python3 - <<'PY' || die "Unsigned candidate failed local consistency checks"
import json, os
from decimal import Decimal
report = json.loads(os.environ["RFC0001_REPORT"])
decoded = json.loads(os.environ["RFC0001_DECODED"])
accept = json.loads(os.environ["RFC0001_ACCEPT"])
if len(accept) != 1:
    raise SystemExit("unexpected testmempoolaccept result")
result = accept[0]
if result.get("allowed") is True:
    raise SystemExit("refusing to continue: node allowed an unsigned transaction")
reason = result.get("reject-reason", "")
lower_reason = reason.lower()
if any(token in lower_reason for token in ("missing", "bad-txns-inputs", "premature-spend-of-coinbase")):
    raise SystemExit(f"node does not consider the lab UTXO spendable: {reason}")
assert decoded["version"] == 2
assert len(decoded["vin"]) == 1
assert decoded["vin"][0]["txid"] == report["input"]["txid"]
assert decoded["vin"][0]["vout"] == report["input"]["vout"]
assert decoded["vin"][0]["scriptSig"]["hex"] == ""
assert len(decoded["vout"]) == 2
assert Decimal(str(decoded["vout"][0]["value"])) == 0
assert decoded["vout"][0]["scriptPubKey"]["hex"] == report["reply_script_hex"]
assert Decimal(str(decoded["vout"][1]["value"])) == Decimal(report["outputs"][1]["amount_xec"])
assert decoded["vout"][1]["scriptPubKey"]["hex"] == report["input"]["scriptPubKey"]
report["decoded_txid"] = decoded["txid"]
report["testmempoolaccept"] = {
    "allowed": False,
    "reject_reason": reason,
    "interpretation": "UNSIGNED_NOT_ACCEPTED",
}
report["mempool_acceptance"] = "NOT_ACCEPTED"
print(json.dumps(report, indent=2))
PY

printf 'SIGNING_NOT_PERFORMED\n'
printf 'BROADCAST_NOT_PERFORMED\n'
printf 'CHRONIK_NOT_TESTED\n'
