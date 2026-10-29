import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";

const script = readFileSync(new URL("./rfc0001-regtest-chronik-enable.sh", import.meta.url), "utf8");
const match = /validate_lab_conf\(\) \{\n[ ]{2}python3 - "\$CONF" <<'PY'\n([\s\S]*?)\nPY\n\}/u.exec(script);
assert.ok(match, "extract real Python pre-stop config validator");
const preflight = match[1];

const base = [
  "regtest=1", "server=1", "[regtest]",
  "listen=0", "connect=0", "dnsseed=0",
  "rpcbind=127.0.0.1", "rpcallowip=127.0.0.1", "rpcport=19443"
].join("\n");
const chronik = "\nchronik=1\nchronikbind=127.0.0.1:19442";

function validate(config) {
  const dir = mkdtempSync(join(tmpdir(), "rfc0001-chronik-conf-"));
  try {
    const conf = join(dir, "bitcoin.conf");
    writeFileSync(conf, config);
    return spawnSync("python3", ["-", conf], { input: preflight, encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("pre-stop validator accepts only exact base and already-enabled configs ending in LF", () => {
  assert.equal(validate(base + "\n").status, 0);
  assert.equal(validate(base + chronik + "\n").status, 0);
});

test("pre-stop validator rejects missing trailing newline and unsafe Chronik options", () => {
  for (const config of [
    base,
    base + chronik,
    base + "\nchronikreindex=1\n",
    base + chronik + "\nchronikbind=0.0.0.0:8331\n",
    base + "\nrpcport=8332\n",
    base + "\nchronik=1\n",
    base + "\n\n"
  ]) {
    const result = validate(config);
    assert.notEqual(result.status, 0, config);
  }
});

test("Chronik startup uses config-only binds and a stopped-node recovery path", () => {
  assert.match(script, /--recover\) MODE="recover"/u);
  assert.match(script, /--recover refuses a running lab process/u);
  assert.match(script, /Recovery requires existing Chronik-enabled config/u);
  assert.match(script, /Lab node is stopped: --enable cannot recover it/u);

  // Both binds live exactly once in the validated bitcoin.conf. Passing either
  // with bitcoind is additive and produced the documented OS error 98.
  const start = script.slice(script.lastIndexOf('"$BIN_DIR/bitcoind" \\'));
  assert.ok(start.length > 100, "find actual daemon launch");
  assert.doesNotMatch(start, /-chronikbind=/u);
  assert.doesNotMatch(start, /-rpcbind=/u);
  assert.match(start, /-chronik=1/u);
  assert.match(start, /-rpcport=19443/u);

  const preStop = script.indexOf("rpc stop >/dev/null");
  assert.ok(preStop > script.indexOf('[[ "$RUNNING" == 1 ]]'));
  assert.ok(preStop < script.lastIndexOf('"$BIN_DIR/bitcoind"'));
});
