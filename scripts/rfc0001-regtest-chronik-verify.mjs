import { Buffer } from "node:buffer";
import { inspectScriptSig, prevoutHash160, readSocialEnvelope } from "./rfc0001-regtest-social.mjs";

export const LAB_CHRONIK_URL = "http://127.0.0.1:19442";
export const LAB_P2PKH = "76a914b4aca63fbf60884195ee538475b6840650273d3f88ac";

export const LAB_CHRONIK_PAIR = {
  postTxid: "754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585",
  postHeight: 103,
  postBlockHash: "0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17",
  postMessage: "laboratorio RFC-0001 POST",
  postPrevout: "05e924726fb94cdb8707bb40d00faf69451b479c66dde9544a67b46a1e91ec50:1",
  replyTxid: "3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649",
  replyHeight: 104,
  replyBlockHash: "6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915",
  replyMessage: "laboratorio RFC-0001 REPLY",
  prevoutScript: LAB_P2PKH
};

function asSats(value, label, problems) {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  problems.push(`${label} is not a non-negative satoshi count`);
  return null;
}

function requireOutput(tx, index, problems, label) {
  if (!Array.isArray(tx.outputs) || tx.outputs[index] === undefined) {
    problems.push(`${label} output ${index} is missing`);
    return null;
  }
  return tx.outputs[index];
}

function envelopeOf(scriptHex, label, problems) {
  try {
    return readSocialEnvelope(Buffer.from(scriptHex, "hex"));
  } catch (error) {
    problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function p2pkhInput(tx, label, problems) {
  if (!Array.isArray(tx.inputs) || tx.inputs.length !== 1) {
    problems.push(`${label} must have exactly one input`);
    return null;
  }
  const input = tx.inputs[0];
  const prevOut = input.prevOut ?? {};
  if (typeof prevOut.txid !== "string" || !Number.isSafeInteger(prevOut.outIdx)) {
    problems.push(`${label} input prevout is incomplete`);
    return null;
  }
  if (input.outputScript !== LAB_CHRONIK_PAIR.prevoutScript) {
    problems.push(`${label} input is not the lab P2PKH script`);
    return { input, inspected: null };
  }
  let inspected = null;
  try {
    const scriptSig = Buffer.from(input.inputScript ?? "", "hex");
    inspected = inspectScriptSig(scriptSig);
    if (inspected.sighash !== 0x41) problems.push(`${label} sighash is not ALL|FORKID`);
    if (inspected.pubkeyHash.equals(prevoutHash160(input.outputScript)) === false) {
      problems.push(`${label} HASH160 does not match the spent P2PKH prevout`);
    }
  } catch (error) {
    problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const sats = asSats(input.sats, `${label} input value`, problems);
  return { input, inspected, sats };
}

function feeMatchesSize(tx, inputSats, label, problems) {
  if (inputSats === null || !Number.isSafeInteger(tx.size) || tx.size <= 0) {
    problems.push(`${label} size or input value is missing`);
    return;
  }
  let spent = 0n;
  for (const [index, output] of tx.outputs.entries()) {
    const value = asSats(output.sats, `${label} output ${index}`, problems);
    if (value === null) return;
    spent += value;
  }
  const fee = inputSats - spent;
  if (fee !== BigInt(tx.size)) problems.push(`${label} fee ${fee} does not equal its ${tx.size} byte size`);
}

export function verifyLabParentChild(post, reply) {
  const problems = [];
  const expected = LAB_CHRONIK_PAIR;
  if (post?.txid !== expected.postTxid) problems.push("POST txid mismatch");
  if (reply?.txid !== expected.replyTxid) problems.push("REPLY txid mismatch");
  if (post?.isCoinbase !== false || reply?.isCoinbase !== false) problems.push("a queried transaction is coinbase");
  if (post?.block?.height !== expected.postHeight || post?.block?.hash !== expected.postBlockHash) {
    problems.push("POST is not block 103");
  }
  if (reply?.block?.height !== expected.replyHeight || reply?.block?.hash !== expected.replyBlockHash) {
    problems.push("REPLY is not block 104");
  }
  if (post?.outputs?.length !== 2 || reply?.outputs?.length !== 2) problems.push("expected exactly two outputs");

  const postInput = p2pkhInput(post, "POST", problems);
  const replyInput = p2pkhInput(reply, "REPLY", problems);
  if (postInput?.input !== undefined) {
    const prev = `${postInput.input.prevOut.txid}:${postInput.input.prevOut.outIdx}`;
    if (prev !== expected.postPrevout) problems.push("POST does not spend the confirmed block-102 REPLY change");
  }
  if (replyInput?.input !== undefined) {
    if (replyInput.input.prevOut.txid !== expected.postTxid || replyInput.input.prevOut.outIdx !== 1) {
      problems.push("REPLY does not spend POST output 1");
    }
  }

  const postData = requireOutput(post, 0, problems, "POST");
  const postChange = requireOutput(post, 1, problems, "POST");
  const replyData = requireOutput(reply, 0, problems, "REPLY");
  const postEnvelope = postData === null ? null : envelopeOf(postData.outputScript, "POST", problems);
  const replyEnvelope = replyData === null ? null : envelopeOf(replyData.outputScript, "REPLY", problems);
  if (postEnvelope !== null) {
    if (postEnvelope.version !== 0x01 || postEnvelope.eventType !== 0x01) problems.push("POST envelope is not canonical v1");
    if (postEnvelope.authorIndex !== 0) problems.push("POST author index is not 0");
    if (postEnvelope.envelope.subarray(3).toString("utf8") !== expected.postMessage) problems.push("POST text mismatch");
  }
  if (replyEnvelope !== null) {
    if (replyEnvelope.version !== 0x02 || replyEnvelope.eventType !== 0x02) problems.push("REPLY envelope is not lab v2");
    if (replyEnvelope.authorIndex !== 0) problems.push("REPLY author index is not 0");
    const parent = replyEnvelope.envelope.subarray(3, 35).toString("hex");
    if (parent !== expected.postTxid) problems.push("REPLY parent bytes are not the POST txid in display order");
    if (replyEnvelope.envelope.subarray(35).toString("utf8") !== expected.replyMessage) problems.push("REPLY text mismatch");
  }
  if (postChange !== null) {
    if (postChange.outputScript !== expected.prevoutScript) problems.push("POST change is not the lab P2PKH");
    const spentBy = postChange.spentBy;
    if (spentBy?.txid !== expected.replyTxid || spentBy?.outIdx !== 0) {
      problems.push("Chronik spentBy does not reference the block-104 REPLY input 0");
    }
  }
  if (postInput?.sats !== undefined) feeMatchesSize(post, postInput.sats, "POST", problems);
  if (replyInput?.sats !== undefined) feeMatchesSize(reply, replyInput.sats, "REPLY", problems);

  return {
    ok: problems.length === 0,
    problems,
    chronikUrl: LAB_CHRONIK_URL,
    parentConvention: "display-order-txid",
    postTxid: expected.postTxid,
    replyTxid: expected.replyTxid,
    authorIndex: 0,
    sighash: replyInput?.inspected?.sighash ?? null,
    pubkeyHash: replyInput?.inspected?.pubkeyHash?.toString("hex") ?? ""
  };
}
