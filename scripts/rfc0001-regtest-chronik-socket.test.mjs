import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";

const script = readFileSync(new URL("./rfc0001-regtest-chronik-enable.sh", import.meta.url), "utf8");
const start = script.indexOf("require_socket_table() {");
const end = script.indexOf("\nlab_cmdline_ok() {");
assert.ok(start > 0 && end > start, "extract real socket inspection functions");
const functions = script.slice(start, end).trim();

const modes = ["check", "enable", "recover"];
const prelude = [
  "set -euo pipefail",
  "die() { printf 'ERROR: %s\\n' \"$*\" >&2; exit 1; }",
  "MODE=\"$1\"",
  "SENTINEL=\"$2\"",
  "rpc() { printf 'stop\\n' >> \"$SENTINEL\"; }",
  "bitcoind() { printf 'start\\n' >> \"$SENTINEL\"; }",
  ""
].join("\n");
const postlude = [
  "require_socket_table",
  "if socket_table_matches '127\\.0\\.0\\.1:19443[[:space:]]' 424242; then",
  "  printf 'SEES_19443\\n'",
  "fi",
  "if socket_table_matches ':19442[[:space:]]' 424242; then",
  "  printf 'SEES_OWN_19442\\n'",
  "fi",
  "if socket_table_matches ':19442[[:space:]]'; then",
  "  printf 'SEES_ANY_19442\\n'",
  "fi",
  "if [[ \"$MODE\" == \"check\" ]]; then",
  "  exit 0",
  "fi",
  "if [[ \"$MODE\" == \"enable\" ]]; then",
  "  rpc stop",
  "  exit 0",
  "fi",
  "if [[ \"$MODE\" == \"recover\" ]]; then",
  "  bitcoind",
  "  exit 0",
  "fi",
  "exit 2",
  ""
].join("\n");
const harness = `${prelude}${functions}\n${postlude}`;

function writeStub(dir, body) {
  const file = join(dir, "ss");
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function runMode(pathValue, mode) {
  const dir = mkdtempSync(join(tmpdir(), "rfc0001-ss-run-"));
  const sentinel = join(dir, "sentinel");
  try {
    const result = spawnSync("/bin/bash", ["-c", harness, "bash", mode, sentinel], {
      env: { PATH: pathValue },
      encoding: "utf8"
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      sentinel: existsSync(sentinel) ? readFileSync(sentinel, "utf8") : ""
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runModes(install, includeSystem) {
  const bin = mkdtempSync(join(tmpdir(), "rfc0001-ss-bin-"));
  try {
    install(bin);
    const pathValue = includeSystem ? `${bin}:/usr/bin:/bin` : bin;
    return Object.fromEntries(modes.map((mode) => [mode, runMode(pathValue, mode)]));
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

function assertAbortsWithoutNodeActions(results, stderrPattern) {
  for (const mode of modes) {
    const result = results[mode];
    assert.notEqual(result.status, 0, `${mode}\n${result.stderr}`);
    assert.equal(result.sentinel, "", mode);
    assert.equal(result.stdout, "", mode);
    assert.match(result.stderr, stderrPattern, `${mode}\n${result.stderr}`);
  }
}

test("missing ss aborts check, enable, and recover before any stop or start", () => {
  const results = runModes(() => {}, false);
  assertAbortsWithoutNodeActions(results, /ss is required before any lab stop or start/u);
});

test("failing ss aborts check, enable, and recover before any stop or start", () => {
  const results = runModes((dir) => {
    writeStub(dir, `#!/bin/sh
printf '%s\\n' 'State Recv-Q Send-Q Local Address:Port Peer Address:PortProcess' \\
  'LISTEN 0 128 127.0.0.1:19443 0.0.0.0:* users:(("bitcoind",pid=424242,fd=8))'
exit 2
`);
  }, false);
  assertAbortsWithoutNodeActions(results, /ss -ltnp failed with status 2; refusing to treat that as no listeners/u);
});

test("empty or invalid ss output aborts instead of reporting no listeners", () => {
  const empty = runModes((dir) => {
    writeStub(dir, "#!/bin/sh\nexit 0\n");
  }, false);
  assertAbortsWithoutNodeActions(empty, /ss -ltnp returned no output; refusing to treat that as no listeners/u);

  const invalid = runModes((dir) => {
    writeStub(dir, "#!/bin/sh\nprintf '%s\\n' 'LISTEN 0 128 127.0.0.1:19443 0.0.0.0:*'\nexit 0\n");
  }, false);
  assertAbortsWithoutNodeActions(invalid, /ss -ltnp returned invalid output; refusing to treat that as no listeners/u);
});

test("successful ss distinguishes a real listener from an absent lab port", () => {
  const results = runModes((dir) => {
    writeStub(dir, `#!/bin/sh
printf '%s\\n' 'State Recv-Q Send-Q Local Address:Port Peer Address:PortProcess' \\
  'LISTEN 0 128 127.0.0.1:19443 0.0.0.0:* users:(("bitcoind",pid=424242,fd=8))' \\
  'LISTEN 0 128 127.0.0.1:19442 0.0.0.0:* users:(("other",pid=1,fd=3))'
exit 0
`);
  }, true);
  for (const mode of modes) {
    const result = results[mode];
    assert.equal(result.status, 0, `${mode}\n${result.stderr}`);
    assert.match(result.stdout, /^SEES_19443\n/u, mode);
    assert.doesNotMatch(result.stdout, /SEES_OWN_19442/u, mode);
    assert.match(result.stdout, /SEES_ANY_19442/u, mode);
  }
  assert.equal(results.check.sentinel, "");
  assert.equal(results.enable.sentinel, "stop\n");
  assert.equal(results.recover.sentinel, "start\n");

  const headerOnly = runModes((dir) => {
    writeStub(dir, "#!/bin/sh\nprintf '%s\\n' 'State Recv-Q Send-Q Local Address:Port Peer Address:PortProcess'\nexit 0\n");
  }, true);
  for (const mode of modes) {
    const result = headerOnly[mode];
    assert.equal(result.status, 0, `${mode}\n${result.stderr}`);
    assert.equal(result.stdout, "", mode);
  }
  assert.equal(headerOnly.check.sentinel, "");
  assert.equal(headerOnly.enable.sentinel, "stop\n");
  assert.equal(headerOnly.recover.sentinel, "start\n");
});

test("check, enable, and recover use the validated socket table before stop or start", () => {
  assert.equal([...script.matchAll(/\$\(ss -ltnp/g)].length, 1);
  assert.equal([...script.matchAll(/^\s*(?:if )?ss -ltnp/gm)].length, 0);
  assert.equal([...script.matchAll(/command -v ss/g)].length, 1);
  assert.equal(script.slice(end).includes("ss -ltnp"), false);
  assert.equal(script.includes("if ss "), false);

  const calls = [...script.matchAll(/^require_socket_table$/gm)].map((match) => match.index);
  assert.equal(calls.length, 3);
  const checkAt = script.indexOf('if [[ "$MODE" == "check" ]]');
  const recoverAt = script.indexOf('if [[ "$MODE" == "recover" ]]');
  const enableAt = script.indexOf("Lab node is stopped: --enable cannot recover it");
  const stopAt = script.indexOf("rpc stop >/dev/null");
  const startAt = script.lastIndexOf('"$BIN_DIR/bitcoind"');
  const listenAt = script.indexOf("Chronik is not listening on 127.0.0.1:19442");
  assert.ok(calls[0] < checkAt && calls[0] < recoverAt && calls[0] < enableAt);
  assert.ok(calls[0] < stopAt);
  assert.ok(stopAt < calls[1] && calls[1] < startAt);
  assert.ok(startAt < calls[2] && calls[2] < listenAt);
});
