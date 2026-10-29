import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { LAB_CHRONIK_PAIR, LAB_CHRONIK_URL, verifyLabParentChild } from "./rfc0001-regtest-chronik-verify.mjs";

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), "../packages/chronik/package.json"));
const { ChronikClient } = require("chronik-client");

if (process.argv.length !== 2) {
  process.stderr.write("This query has no URL argument. It contacts only http://127.0.0.1:19442.\n");
  process.exit(1);
}
if (LAB_CHRONIK_URL !== "http://127.0.0.1:19442") {
  process.stderr.write("Refusing a Chronik URL other than the lab bind.\n");
  process.exit(1);
}

const client = new ChronikClient([LAB_CHRONIK_URL]);

async function fetchTx(txid) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await client.tx(txid);
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function snapshot(tx) {
  return {
    txid: tx.txid,
    version: tx.version,
    isCoinbase: tx.isCoinbase,
    size: tx.size,
    block: tx.block === undefined ? null : { height: tx.block.height, hash: tx.block.hash },
    inputs: tx.inputs.map((input) => ({
      prevOut: input.prevOut,
      outputScript: input.outputScript ?? null,
      inputScriptBytes: (input.inputScript?.length ?? 0) / 2,
      sats: input.sats.toString()
    })),
    outputs: tx.outputs.map((output, index) => ({
      n: index,
      sats: output.sats.toString(),
      outputScript: output.outputScript,
      spentBy: output.spentBy ?? null
    }))
  };
}

try {
  const post = await fetchTx(LAB_CHRONIK_PAIR.postTxid);
  const reply = await fetchTx(LAB_CHRONIK_PAIR.replyTxid);
  const report = verifyLabParentChild(post, reply);
  process.stdout.write(`${JSON.stringify({
    chronik: LAB_CHRONIK_URL,
    s0: "NOT_CLOSED",
    verification: report,
    post: snapshot(post),
    reply: snapshot(reply)
  })}\n`);
  if (!report.ok) process.exit(1);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write("Chronik query failed. No production endpoint was contacted.\n");
  process.exit(1);
}
