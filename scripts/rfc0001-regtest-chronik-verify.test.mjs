import { Buffer } from "node:buffer";
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeTm1Post, parseTm1Output } from "../packages/protocol/dist/index.js";
import { LAB_CHRONIK_PAIR, verifyLabParentChild } from "./rfc0001-regtest-chronik-verify.mjs";
import { replyPayload } from "./rfc0001-regtest-social.mjs";

const POST_SCRIPT = "6a04544d4d001c0101006c61626f7261746f72696f205246432d3030303120504f5354";
const REPLY_SCRIPT = "6a04544d4d003d020200754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc527903871235856c61626f7261746f72696f205246432d30303031205245504c59";
const POST_SCRIPTSIG = "47304402205bbe0532d81c5e1680e80e13ff105ea0ddfa51a71aac99ed7b260dddd260af0a02206dc8ee0c40fec0466cfe8bf84b8d583422f59323cbc84e8d9b7e1e6285f93de141210298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99";
const REPLY_SCRIPTSIG = "4730440220594813028429951572491cb41a2627c5d3575d5ee3e6a15ec02d18cb8fe44fbd02205595b3004e60bffbab9f6ef3d63445b06f45701cae8600d4e646a51cdabb319f41210298220b1c7b916f6ae579c5388fa66a7db7da3315dea33bea6ece46d4811eed99";

function pair() {
  const [prevTxid, prevVout] = LAB_CHRONIK_PAIR.postPrevout.split(":");
  return {
    post: {
      txid: LAB_CHRONIK_PAIR.postTxid,
      version: 2,
      isCoinbase: false,
      size: 235,
      block: { height: 103, hash: LAB_CHRONIK_PAIR.postBlockHash, timestamp: 0 },
      inputs: [{
        prevOut: { txid: prevTxid, outIdx: Number(prevVout) },
        inputScript: POST_SCRIPTSIG,
        outputScript: LAB_CHRONIK_PAIR.prevoutScript,
        sats: 4999999741n
      }],
      outputs: [
        { sats: 0n, outputScript: POST_SCRIPT },
        {
          sats: 4999999506n,
          outputScript: LAB_CHRONIK_PAIR.prevoutScript,
          spentBy: { txid: LAB_CHRONIK_PAIR.replyTxid, outIdx: 0 }
        }
      ]
    },
    reply: {
      txid: LAB_CHRONIK_PAIR.replyTxid,
      version: 2,
      isCoinbase: false,
      size: 268,
      block: { height: 104, hash: LAB_CHRONIK_PAIR.replyBlockHash, timestamp: 0 },
      inputs: [{
        prevOut: { txid: LAB_CHRONIK_PAIR.postTxid, outIdx: 1 },
        inputScript: REPLY_SCRIPTSIG,
        outputScript: LAB_CHRONIK_PAIR.prevoutScript,
        sats: 4999999506n
      }],
      outputs: [
        { sats: 0n, outputScript: REPLY_SCRIPT },
        { sats: 4999999238n, outputScript: LAB_CHRONIK_PAIR.prevoutScript }
      ]
    }
  };
}

test("experimental verifier links the block-103 POST to the block-104 REPLY", () => {
  assert.equal(POST_SCRIPTSIG.length / 2, 106);
  assert.equal(REPLY_SCRIPTSIG.length / 2, 106);
  const report = verifyLabParentChild(pair().post, pair().reply);
  assert.equal(report.ok, true, report.problems.join("; "));
  assert.equal(report.sighash, 0x41);
  assert.equal(report.pubkeyHash, "b4aca63fbf60884195ee538475b6840650273d3f");
  assert.equal(report.parentConvention, "display-order-txid");
  const encoded = encodeTm1Post({ authorInputIndex: 0, eventData: LAB_CHRONIK_PAIR.postMessage });
  assert.equal(encoded.scriptHex, POST_SCRIPT);
  assert.equal(parseTm1Output({ valueSats: 0n, script: encoded.script }).eventData, LAB_CHRONIK_PAIR.postMessage);
  assert.throws(
    () => parseTm1Output({ valueSats: 0n, script: replyPayload(Buffer.from(LAB_CHRONIK_PAIR.postTxid, "hex"), LAB_CHRONIK_PAIR.replyMessage) }),
    (error) => error.code === "UNSUPPORTED_VERSION"
  );
});

test("experimental verifier rejects a broken Chronik reference or parent", () => {
  const brokenSpend = pair();
  brokenSpend.reply.inputs[0].prevOut.outIdx = 0;
  assert.equal(verifyLabParentChild(brokenSpend.post, brokenSpend.reply).ok, false);

  const brokenReference = pair();
  brokenReference.post.outputs[1].spentBy = { txid: LAB_CHRONIK_PAIR.postTxid, outIdx: 0 };
  assert.equal(verifyLabParentChild(brokenReference.post, brokenReference.reply).ok, false);

  const brokenParent = pair();
  const script = Buffer.from(brokenParent.reply.outputs[0].outputScript, "hex");
  script[10] ^= 0xff;
  brokenParent.reply.outputs[0].outputScript = script.toString("hex");
  const parentReport = verifyLabParentChild(brokenParent.post, brokenParent.reply);
  assert.equal(parentReport.ok, false);
  assert.match(parentReport.problems.join("\n"), /display order/u);

  const brokenKey = pair();
  const scriptSig = Buffer.from(brokenKey.reply.inputs[0].inputScript, "hex");
  scriptSig[scriptSig.length - 1] ^= 0xff;
  brokenKey.reply.inputs[0].inputScript = scriptSig.toString("hex");
  assert.match(verifyLabParentChild(brokenKey.post, brokenKey.reply).problems.join("\n"), /HASH160/u);
});
