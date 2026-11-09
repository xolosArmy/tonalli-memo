import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { separateOfflineClassification, refuseConnectionGrant } from "./h1-separation.mjs";
import { validateClosedSchema } from "./h2-schema.mjs";
import { validatePreflightPlan } from "./preflight-plan.mjs";
import { refuseInertScript } from "./inert-script.mjs";
import {
  inertPreflightFixture,
  offlineConfigurationFixture,
  offlineDescriptorFixture,
} from "./fixtures.mjs";
import { DESIGN_BLOBS, S1A_BLOBS, compareBlobInventory } from "./inventory.mjs";

const root = new URL(".", import.meta.url);

test("an allowlisted offline classification still denies connection", () => {
  let calls = 0;
  const adapter = {
    calls: [],
    connect() {
      calls += 1;
    },
    followRedirects: false,
    maxRedirects: 0,
    proxy: null,
  };
  const decision = separateOfflineClassification(offlineConfigurationFixture("rpc"), adapter);
  assert.equal(calls, 0);
  assert.equal(decision.classificationCode, "ALLOWLISTED_OFFLINE");
  assert.equal(decision.permission, "NOT_AUTHORIZED");
  assert.equal(decision.connect, "DENY");
  assert.equal(decision.io, "DENY");
  assert.equal(decision.reg11b, "NOT_RUN");
  assert.equal(decision.backend, "PENDING_D-02");
  assert.equal(decision.broker, "PENDING_D-06");
});

test("a chronik candidate string is also not a grant", () => {
  const decision = separateOfflineClassification(offlineConfigurationFixture("chronik"));
  assert.equal(decision.classificationCode, "ALLOWLISTED_OFFLINE");
  assert.equal(decision.permission, "NOT_AUTHORIZED");
});

test("a rejected classification does not flip into permission", () => {
  const decision = separateOfflineClassification({});
  assert.notEqual(decision.classificationCode, "ALLOWLISTED_OFFLINE");
  assert.equal(decision.permission, "NOT_AUTHORIZED");
  assert.equal(decision.connect, "DENY");
});

test("a grant claim is refused and its function is not called", () => {
  let calls = 0;
  const claim = () => {
    calls += 1;
    return true;
  };
  const refused = refuseConnectionGrant(claim);
  assert.equal(calls, 0);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "GRANT_REFUSED");
  assert.equal(refused.permission, "NOT_AUTHORIZED");
});

test("a closed descriptor stays non-operational", () => {
  const parsed = validateClosedSchema(offlineDescriptorFixture("rpc"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.code, "SCHEMA_CLOSED_OFFLINE");
  assert.equal(parsed.operational, false);
  assert.equal(parsed.permission, "NOT_AUTHORIZED");
  assert.deepEqual(parsed.pending, ["D-02", "D-03", "D-04", "D-05", "D-06"]);
  const chronik = validateClosedSchema(offlineDescriptorFixture("chronik"));
  assert.equal(chronik.ok, true);
  assert.equal(chronik.permission, "NOT_AUTHORIZED");
});

test("missing, extra, proxy, and accessor fields are rejected", () => {
  const missing = offlineDescriptorFixture();
  delete missing.followRedirects;
  assert.equal(validateClosedSchema(missing).code, "INCOMPLETE");

  const extra = offlineDescriptorFixture();
  extra.connect = () => {
    throw new Error("connect must not run");
  };
  assert.equal(validateClosedSchema(extra).code, "UNKNOWN_FIELD");

  const proxied = new Proxy(offlineDescriptorFixture(), {});
  assert.equal(validateClosedSchema(proxied).ok, false);

  const accessor = offlineDescriptorFixture();
  Object.defineProperty(accessor, "chain", {
    enumerable: true,
    configurable: true,
    get() {
      return "regtest";
    },
  });
  assert.equal(validateClosedSchema(accessor).code, "MALFORMED");
});

test("omitted security is not treated as safe and pending decisions stay pending", () => {
  const coerced = offlineDescriptorFixture();
  coerced.followRedirects = "false";
  assert.equal(validateClosedSchema(coerced).ok, false);

  const granted = offlineDescriptorFixture();
  granted.permissions.read = true;
  assert.equal(validateClosedSchema(granted).code, "PERMISSION");

  const backend = offlineDescriptorFixture();
  backend.backendDecision = "netns";
  assert.equal(validateClosedSchema(backend).code, "DECISION_PENDING");

  const broker = offlineDescriptorFixture();
  broker.brokerDecision = "http-broker-v1";
  assert.equal(validateClosedSchema(broker).code, "DECISION_PENDING");

  const genesis = offlineDescriptorFixture();
  genesis.genesisDecision = "0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206";
  assert.equal(validateClosedSchema(genesis).code, "DECISION_PENDING");

  const crossed = offlineDescriptorFixture("rpc");
  crossed.endpoint = "http://127.0.0.1:19442";
  assert.equal(validateClosedSchema(crossed).code, "ENDPOINT");
});

test("an inert preflight plan is accepted and a concrete backend is not", () => {
  const plan = validatePreflightPlan(inertPreflightFixture());
  assert.equal(plan.ok, true);
  assert.equal(plan.code, "PLAN_INERT");
  assert.equal(plan.applied, false);
  assert.equal(plan.executed, false);

  const selected = inertPreflightFixture();
  selected.namespaceBackend = "unshare";
  assert.equal(validatePreflightPlan(selected).code, "DECISION_PENDING");

  const listening = inertPreflightFixture();
  listening.listeners = ["127.0.0.1:19443"];
  assert.equal(validatePreflightPlan(listening).ok, false);
});

test("the refusal helper throws and is not a host change", () => {
  assert.throws(() => refuseInertScript("prepare-namespace"), {
    code: "INERT_REFUSAL",
  });
});

test("infrastructure scripts are refusal entrypoints and are not imported here", () => {
  const names = [
    "prepare-namespace.mjs",
    "prepare-network-policy.mjs",
    "prepare-confinement.mjs",
  ];
  const ownSource = readFileSync(new URL("./offline.test.mjs", root), "utf8");
  for (const name of names) {
    assert.equal(ownSource.includes(`scripts/${name}`), false);
    const source = readFileSync(new URL(`./scripts/${name}`, root), "utf8");
    assert.match(source, /refuseInertScript\(/);
    assert.equal(source.includes("node:net"), false);
    assert.equal(source.includes("node:child_process"), false);
    assert.equal(source.includes("spawn("), false);
  }
});

test("the configuration template stays unapplied and keeps RPC apart from P2P bind", () => {
  const source = readFileSync(
    new URL("./templates/bitcoin-abc-0.34.2-chronik.regtest.conf.template", root),
    "utf8",
  );
  assert.match(source, /INERT_TEMPLATE=true/);
  assert.match(source, /APPLIED=false/);
  assert.match(source, /rpcbind=127\.0\.0\.1:19443/);
  assert.match(source, /chronikbind=127\.0\.0\.1:19442/);
  assert.match(source, /PENDING_D-02/);
  assert.match(source, /PENDING_D-03/);
  assert.match(source, /PENDING_D-06/);
  const directives = source
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .join("\n");
  assert.equal(directives.includes("rpcpassword"), false);
  assert.equal(directives.includes("rpcuser"), false);
  assert.equal(directives.includes("rpcauth"), false);
  assert.equal(/^bind=/m.test(directives), false);
  assert.equal(directives.includes("addnode"), false);
});

test("the extended inventory matches its frozen lists and notices drift", () => {
  assert.equal(compareBlobInventory(S1A_BLOBS, S1A_BLOBS).count, 9);
  assert.equal(compareBlobInventory(DESIGN_BLOBS, DESIGN_BLOBS).count, 9);
  const drifted = S1A_BLOBS.map(([path, blob]) => [path, blob]);
  drifted[3] = [drifted[3][0], "0000000000000000000000000000000000000000"];
  assert.equal(compareBlobInventory(drifted, S1A_BLOBS).code, "BLOB_CHANGED");
  assert.equal(
    compareBlobInventory(S1A_BLOBS.slice(1), S1A_BLOBS).code,
    "MISSING",
  );
});
