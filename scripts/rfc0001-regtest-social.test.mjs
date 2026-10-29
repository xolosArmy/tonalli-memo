import { Buffer } from "node:buffer";
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeTm1Post, parseTm1Output } from "../packages/protocol/dist/index.js";
import {
  buildUnsigned,
  evaluateSigned,
  hash160,
  offlineFixtureParent,
  parseLabTransaction,
  readSocialEnvelope,
  replyPayload,
  requiredFeeSats,
  xecToSats
} from "./rfc0001-regtest-social.mjs";

const UNSIGNED = "0200000001e793599a2325d11e4059d5e13a92b44c70fdbf9b995956fe33d913b3aae1a2220000000000ffffffff0200000000000000003b6a04544d4d0034020200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f726573707565737461206669726d61646103f1052a010000001976a914b4aca63fbf60884195ee538475b6840650273d3f88ac00000000";
const PREVOUT = "76a914b4aca63fbf60884195ee538475b6840650273d3f88ac";
const LAB_PUBKEY = "0298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99";

test("lab fee and amount conversion use eCash satoshis", () => {
  assert.equal(xecToSats("50000000.00"), 5000000000n);
  assert.equal(xecToSats("2.53"), 253n);
  assert.equal(requiredFeeSats(253, "10.00"), 253);
  assert.equal(requiredFeeSats(1, "10.00"), 1);
});

test("unsigned REPLY fixture spends the recorded regtest coinbase and declares author 0", () => {
  const payload = replyPayload(offlineFixtureParent(), "respuesta firmada");
  const rebuilt = buildUnsigned({
    txid: "22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7",
    vout: 0,
    payloadScript: payload,
    changeScript: Buffer.from(PREVOUT, "hex"),
    changeSats: 4999999747n
  });
  assert.equal(rebuilt.toString("hex"), UNSIGNED);
  const parsed = parseLabTransaction(UNSIGNED);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.txid, "22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7");
  assert.equal(parsed.scriptSig.length, 0);
  assert.equal(parsed.outputs[0].sats, 0n);
  assert.equal(parsed.outputs[0].script[9], 0);
  assert.equal(parsed.size, 153);
});

test("lab wallet pubkey hashes to the recorded P2PKH prevout", () => {
  assert.equal(hash160(Buffer.from(LAB_PUBKEY, "hex")).toString("hex"), "b4aca63fbf60884195ee538475b6840650273d3f");
});


test("canonical POST envelope supports direct pushes and minimal PUSHDATA1 (72/73/212 bytes)", () => {
  for (const messageBytes of [72, 73, 212]) {
    const message = "x".repeat(messageBytes);
    const post = encodeTm1Post({ authorInputIndex: 0, eventData: message });
    const script = Buffer.from(post.scriptHex, "hex");
    assert.equal(script[6], messageBytes <= 72 ? 3 + messageBytes : 0x4c);
    if (messageBytes > 72) assert.equal(script[7], 3 + messageBytes);
    const parsed = readSocialEnvelope(script);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.eventType, 1);
    assert.equal(parsed.authorIndex, 0);
    assert.equal(parsed.envelope.subarray(3).toString("utf8"), message);
    assert.equal(parseTm1Output({ valueSats: 0n, script: post.script }).eventData, message);
  }
  const nonMinimal = Buffer.from([0x6a, 0x04, 0x54, 0x4d, 0x4d, 0x00, 0x4c, 0x04, 0x01, 0x01, 0x00, 0x78]);
  assert.throws(() => readSocialEnvelope(nonMinimal), /non-minimal PUSHDATA1/u);
  assert.throws(() => readSocialEnvelope(nonMinimal.subarray(0, 7)), /truncated PUSHDATA1/u);
});

test("signed evaluator accepts a canonical 73-byte POST crossing the PUSHDATA1 boundary", () => {
  // Deliberately synthetic scriptSig; this tests the script envelope and
  // fee/author checks, NOT cryptographic signature or node consensus.
  const post = encodeTm1Post({ authorInputIndex: 0, eventData: "p".repeat(73) });
  const pubkey = Buffer.from(LAB_PUBKEY, "hex");
  const scriptSig = Buffer.concat([
    Buffer.from([65]),
    Buffer.alloc(64, 7),
    Buffer.from([0x41, 33]),
    pubkey
  ]);
  assert.equal(scriptSig.length, 100);
  const args = {
    txid: "22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7",
    vout: 0,
    payloadScript: Buffer.from(post.scriptHex, "hex"),
    changeScript: Buffer.from(PREVOUT, "hex")
  };
  const unsignedTrial = buildUnsigned({ ...args, changeSats: 5000000000n - 1n });
  const fee = BigInt(requiredFeeSats(unsignedTrial.length + scriptSig.length, "10.00"));
  const unsigned = buildUnsigned({ ...args, changeSats: 5000000000n - fee });
  const signed = Buffer.concat([
    unsigned.subarray(0, 41),
    Buffer.from([scriptSig.length]),
    scriptSig,
    unsigned.subarray(42)
  ]);
  const report = evaluateSigned({
    rawHex: signed.toString("hex"),
    prevoutScript: PREVOUT,
    inputSats: 5000000000n,
    minRelayXecPerKb: "10.00",
    payloadScript: args.payloadScript
  });
  assert.equal(report.ok, true, report.problems.join("; "));
  assert.equal(report.authorIndex, 0);
  assert.equal(report.feeSats, fee.toString());
  assert.equal(signed.subarray(-4).toString("hex"), "00000000");
});

test("canonical POST encoder remains the only production payload and rejects a v2 REPLY", () => {
  const encoded = encodeTm1Post({ authorInputIndex: 0, eventData: "laboratorio RFC-0001 POST" });
  assert.equal(encoded.version, 1);
  assert.equal(encoded.eventType, "POST");
  assert.equal(encoded.authorInputIndex, 0);
  const parsed = parseTm1Output({ valueSats: 0n, script: encoded.script });
  assert.equal(parsed.eventType, "POST");
  assert.throws(
    () => parseTm1Output({ valueSats: 0n, script: replyPayload(offlineFixtureParent(), "respuesta firmada") }),
    (error) => error.code === "UNSUPPORTED_VERSION" && /Unsupported TM1 version: 0x02/u.test(error.message)
  );
});

test("signed evaluation requires ALL|FORKID, author 0, matching HASH160 and exact fee", () => {
  const payload = replyPayload(offlineFixtureParent(), "respuesta firmada");
  const pubkey = Buffer.from(LAB_PUBKEY, "hex");
  const scriptSig = Buffer.concat([
    Buffer.from([65]),
    Buffer.alloc(64, 7),
    Buffer.from([0x41]),
    Buffer.from([33]),
    pubkey
  ]);
  const unsigned = parseLabTransaction(UNSIGNED);
  const signedBody = Buffer.concat([
    Buffer.from(UNSIGNED.slice(0, 82), "hex"),
    Buffer.from([scriptSig.length]),
    scriptSig,
    Buffer.from(UNSIGNED.slice(84), "hex")
  ]);
  assert.equal(unsigned.scriptSig.length, 0);
  const report = evaluateSigned({
    rawHex: signedBody.toString("hex"),
    prevoutScript: PREVOUT,
    inputSats: 5000000000n,
    minRelayXecPerKb: "10.00",
    payloadScript: payload
  });
  assert.equal(report.ok, true, report.problems.join("; "));
  assert.equal(report.sighash, 0x41);
  assert.equal(report.authorIndex, 0);
  assert.equal(report.signedSize, 253);
  assert.equal(report.feeSats, "253");
});

test("lab wallet ECDSA scriptSig still requires ALL|FORKID and the same HASH160", () => {
  const payload = replyPayload(offlineFixtureParent(), "respuesta firmada");
  const pubkey = Buffer.from(LAB_PUBKEY, "hex");
  const signature = Buffer.concat([Buffer.alloc(70, 0x30), Buffer.from([0x41])]);
  const scriptSig = Buffer.concat([Buffer.from([signature.length]), signature, Buffer.from([33]), pubkey]);
  const changeSats = 5000000000n - 259n;
  const unsigned = buildUnsigned({
    txid: "22a2e1aab313d933fe5659999bbffd704cb4923ae1d559401ed125239a5993e7",
    vout: 0,
    payloadScript: payload,
    changeScript: Buffer.from(PREVOUT, "hex"),
    changeSats
  });
  const signed = Buffer.concat([
    unsigned.subarray(0, 41),
    Buffer.from([scriptSig.length]),
    scriptSig,
    unsigned.subarray(42)
  ]);
  const report = evaluateSigned({
    rawHex: signed.toString("hex"),
    prevoutScript: PREVOUT,
    inputSats: 5000000000n,
    minRelayXecPerKb: "10.00",
    payloadScript: payload
  });
  assert.equal(report.ok, true, report.problems.join("; "));
  assert.equal(report.signedSize, 259);
  assert.equal(report.feeSats, "259");
  assert.equal(report.sighash, 0x41);
  assert.equal(report.pubkeyHash, "b4aca63fbf60884195ee538475b6840650273d3f");
});

test("confirmed lab scripts keep the canonical POST and a display-order REPLY parent", () => {
  const postTxid = "754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585";
  const postScript = "6a04544d4d001c0101006c61626f7261746f72696f205246432d3030303120504f5354";
  const replyScript = "6a04544d4d003d020200754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc527903871235856c61626f7261746f72696f205246432d30303031205245504c59";
  const encoded = encodeTm1Post({ authorInputIndex: 0, eventData: "laboratorio RFC-0001 POST" });
  assert.equal(encoded.scriptHex, postScript);
  const parsed = parseTm1Output({ valueSats: 0n, script: encoded.script });
  assert.equal(parsed.eventData, "laboratorio RFC-0001 POST");
  const reply = replyPayload(Buffer.from(postTxid, "hex"), "laboratorio RFC-0001 REPLY");
  assert.equal(reply.toString("hex"), replyScript);
  assert.equal(reply.subarray(10, 42).toString("hex"), postTxid);
  assert.throws(
    () => parseTm1Output({ valueSats: 0n, script: reply }),
    (error) => error.code === "UNSUPPORTED_VERSION" && /Unsupported TM1 version: 0x02/u.test(error.message)
  );
  assert.equal(requiredFeeSats(259, "10.00"), 259);
  assert.equal(requiredFeeSats(235, "10.00"), 235);
  assert.equal(requiredFeeSats(268, "10.00"), 268);
});
