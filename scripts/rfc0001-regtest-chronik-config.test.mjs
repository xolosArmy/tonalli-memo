import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = readFileSync(new URL("./rfc0001-regtest-chronik-enable.sh", import.meta.url), "utf8");
const match = /validate_lab_conf\(\) \{\n  python3 - "\$CONF" <<'PY'\n([\s\S]*?)\nPY\n\}/u.exec(script);
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
