/* global Buffer, setTimeout, fetch, console */
// Local-only integration test of the real chronik-client 4.3.0 transport.
// No internet, credentials, database or eCash transactions involved.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { ChronikClient } from "chronik-client";
import { createChronikLiveSource } from "../dist/index.js";

const require = createRequire(import.meta.url);
// Resolve ws from the SDK's own dependency graph, avoiding a new direct dependency.
const sdkRequire = createRequire(require.resolve("chronik-client"));
const { WebSocketServer } = sdkRequire("ws");
const http = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("HTTP backfill endpoint remains available");
});
const sessions = [];
let acceptUpgrades = true;
let suppressFirstPong = true;
const wss = new WebSocketServer({
  server: http,
  path: "/ws",
  autoPong: false,
  verifyClient: () => acceptUpgrades
});
wss.on("connection", (socket) => {
  const session = { socket, subscriptions: [] };
  sessions.push(session);
  socket.on("message", (data) => session.subscriptions.push(Buffer.from(data)));
  socket.on("ping", () => {
    if (!(suppressFirstPong && session === subscribed()[0])) socket.pong();
  });
});
const subscribed = () => sessions.filter((s) => s.subscriptions.length !== 0);
async function waitFor(predicate, label, maxMs = 12000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > maxMs) throw new Error("Timed out waiting for " + label);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
const address = http.address();
assert.ok(address && typeof address !== "string");
const port = address.port;
const base = "http://127.0.0.1:" + port;
const sdk = new ChronikClient([base]);
let timeouts = 0;
let reconnections = 0;
let errors = 0;
let connects = 0;
const live = createChronikLiveSource({
  source: sdk,
  heartbeatIntervalMs: 90,
  heartbeatTimeoutMs: 55
});
const connection = live.createConnection({
  onEvent: () => {},
  onConnect: () => { connects++; },
  onReconnect: () => { reconnections++; },
  onHeartbeatTimeout: () => { timeouts++; },
  onError: () => { errors++; }
});
try {
  await connection.start();
  await waitFor(() => subscribed().length === 1 && subscribed()[0].subscriptions.length >= 3, "first subscriptions");
  await waitFor(() => timeouts >= 1, "first missing pong");
  suppressFirstPong = false;
  await waitFor(() => subscribed().length >= 2 && subscribed()[1].subscriptions.length >= 3, "new SDK endpoint");
  await waitFor(() => connects >= 2, "connected callback");
  for (const session of subscribed()) {
    assert.equal(session.subscriptions.length, 3, "one TM0, one TM1, one block subscription per session");
  }
  assert.ok(reconnections >= 1, "watchdog reported reconnecting");

  // Simulate a failed reconnect while HTTP is still reachable: the adapter
  // must catch the SDK's rejected waitForOpen, retry, and keep Node alive.
  acceptUpgrades = false;
  subscribed()[1].socket.terminate();
  await waitFor(() => errors >= 2, "failed WebSocket handshake", 12000);
  const response = await fetch(base + "/blockchain-info");
  assert.equal(response.status, 200, "HTTP stayed accessible during websocket failure");
  acceptUpgrades = true;
  await waitFor(() => subscribed().length >= 3 && subscribed()[2].subscriptions.length >= 3, "recovery after failed handshake", 14000);
  for (const session of subscribed()) {
    assert.equal(session.subscriptions.length, 3, "subscriptions never accumulate across endpoints");
  }
  console.log("PASS: real SDK 4.3.0: pong timeout, reconnect, failed handshake and clean TM0/TM1/block resubscription");
} finally {
  await connection.stop();
  for (const session of sessions) session.socket.terminate();
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => http.close(resolve));
}
