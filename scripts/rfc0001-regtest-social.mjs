import { createHash } from "node:crypto";

export const SATS_PER_XEC = 100n;
export const SIGHASH_ALL_FORKID = 0x41;
export const LOKAD = Buffer.from([0x54, 0x4d, 0x4d, 0x00]);

export function hash160(bytes) {
  const sha = createHash("sha256").update(bytes).digest();
  return createHash("ripemd160").update(sha).digest();
}

export function xecToSats(amount) {
  const text = String(amount);
  const match = /^(\d+)\.(\d{1,2})$|^(\d+)$/.exec(text);
  if (match === null) throw new Error(`XEC amount must be a non-negative decimal with at most 2 places: ${text}`);
  const whole = match[1] ?? match[3];
  const frac = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * SATS_PER_XEC + BigInt(frac);
}

export function requiredFeeSats(signedSize, minRelayXecPerKb) {
  if (!Number.isSafeInteger(signedSize) || signedSize <= 0) throw new Error("signed size must be a positive integer");
  const satsPerKb = xecToSats(minRelayXecPerKb);
  return Number((BigInt(signedSize) * satsPerKb + 999n) / 1000n);
}

export function offlineFixtureParent() {
  return Buffer.from(Array.from({ length: 32 }, (_unused, index) => index));
}

function directPush(data) {
  if (data.length < 1 || data.length > 75) throw new Error(`direct push length ${data.length} is outside 1..75`);
  return Buffer.concat([Buffer.from([data.length]), data]);
}

export function socialScript({ version, eventType, authorIndex, eventData }) {
  if (!Number.isSafeInteger(authorIndex) || authorIndex !== 0) {
    throw new Error("this lab builder only emits author index 0");
  }
  const envelope = Buffer.concat([Buffer.from([version, eventType, authorIndex]), eventData]);
  return Buffer.concat([Buffer.from([0x6a]), directPush(LOKAD), directPush(envelope)]);
}

export function replyPayload(parent, message) {
  const parentBytes = Buffer.isBuffer(parent) ? parent : Buffer.from(parent, "hex");
  if (parentBytes.length !== 32) throw new Error("REPLY parent must be 32 bytes");
  const text = Buffer.from(message, "utf8");
  if (Buffer.from(text.toString("utf8"), "utf8").equals(text) === false || text.length < 1) {
    throw new Error("REPLY message must be non-empty UTF-8");
  }
  return socialScript({ version: 0x02, eventType: 0x02, authorIndex: 0, eventData: Buffer.concat([parentBytes, text]) });
}

function readVarint(buffer, offset) {
  const first = buffer[offset];
  if (first < 0xfd) return [first, offset + 1];
  if (first === 0xfd) return [buffer.readUInt16LE(offset + 1), offset + 3];
  if (first === 0xfe) return [buffer.readUInt32LE(offset + 1), offset + 5];
  return [Number(buffer.readBigUInt64LE(offset + 1)), offset + 9];
}

export function parseLabTransaction(hex) {
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== hex.length / 2) throw new Error("raw transaction hex is not even");
  let offset = 0;
  const version = raw.readUInt32LE(offset);
  offset += 4;
  const inputCount = readVarint(raw, offset);
  offset = inputCount[1];
  if (inputCount[0] !== 1) throw new Error(`lab transaction must have one input, found ${inputCount[0]}`);
  const txid = Buffer.from(raw.subarray(offset, offset + 32)).reverse().toString("hex");
  offset += 32;
  const vout = raw.readUInt32LE(offset);
  offset += 4;
  const scriptLen = readVarint(raw, offset);
  offset = scriptLen[1];
  const scriptSig = raw.subarray(offset, offset + scriptLen[0]);
  offset += scriptLen[0];
  const sequence = raw.readUInt32LE(offset);
  offset += 4;
  const outputCount = readVarint(raw, offset);
  offset = outputCount[1];
  if (outputCount[0] !== 2) throw new Error(`lab transaction must have two outputs, found ${outputCount[0]}`);
  const outputs = [];
  for (let index = 0; index < 2; index += 1) {
    const sats = raw.readBigUInt64LE(offset);
    offset += 8;
    const length = readVarint(raw, offset);
    offset = length[1];
    const script = raw.subarray(offset, offset + length[0]);
    offset += length[0];
    outputs.push({ sats, script: Buffer.from(script) });
  }
  const locktime = raw.readUInt32LE(offset);
  offset += 4;
  if (offset !== raw.length) throw new Error("trailing bytes after lab transaction");
  return { version, txid, vout, sequence, scriptSig: Buffer.from(scriptSig), outputs, locktime, size: raw.length };
}

export function prevoutHash160(scriptHex) {
  const raw = Buffer.from(scriptHex, "hex");
  if (raw.length !== 25 || raw[0] !== 0x76 || raw[1] !== 0xa9 || raw[2] !== 0x14 || raw[23] !== 0x88 || raw[24] !== 0xac) {
    throw new Error("previous output is not a 25-byte P2PKH script");
  }
  return raw.subarray(3, 23);
}

export function readSocialEnvelope(script) {
  if (script[0] !== 0x6a || script[1] !== 0x04 || script.subarray(2, 6).equals(LOKAD) === false) {
    throw new Error("output is not a TM1 two-push OP_RETURN");
  }
  const envelopeLength = script[6];
  if (envelopeLength < 3 || 7 + envelopeLength !== script.length) throw new Error("OP_RETURN envelope length mismatch");
  const envelope = script.subarray(7);
  return { version: envelope[0], eventType: envelope[1], authorIndex: envelope[2], envelope: Buffer.from(envelope) };
}

export function inspectScriptSig(scriptSig) {
  const signatureLength = scriptSig[0];
  const expectedLength = 1 + signatureLength + 1 + 33;
  if (signatureLength < 9 || signatureLength > 73 || scriptSig.length !== expectedLength || scriptSig[1 + signatureLength] !== 33) {
    throw new Error(`expected a P2PKH scriptSig with a 33-byte key, found ${scriptSig.length} bytes`);
  }
  const pubkey = scriptSig.subarray(2 + signatureLength);
  if (pubkey[0] !== 0x02 && pubkey[0] !== 0x03) throw new Error("P2PKH public key is not compressed");
  return { sighash: scriptSig[signatureLength], pubkey: Buffer.from(pubkey), pubkeyHash: hash160(pubkey) };
}

function scriptLength(length) {
  if (length < 0xfd) return Buffer.from([length]);
  throw new Error(`lab script length ${length} needs a longer varint`);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function u64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

export function buildUnsigned({ txid, vout, payloadScript, changeScript, changeSats }) {
  if (typeof changeSats !== "bigint" || changeSats <= 0n) throw new Error("change must be a positive satoshi count");
  const reversed = Buffer.from(txid, "hex").reverse();
  if (reversed.length !== 32) throw new Error("funding txid must be 32 bytes");
  if (prevoutHash160(changeScript.toString("hex")).length !== 20) throw new Error("change script must be P2PKH");
  return Buffer.concat([
    u32(2),
    Buffer.from([1]),
    reversed,
    u32(vout),
    Buffer.from([0]),
    u32(0xffffffff),
    Buffer.from([2]),
    u64(0n),
    scriptLength(payloadScript.length),
    payloadScript,
    u64(changeSats),
    scriptLength(changeScript.length),
    changeScript,
    u32(0)
  ]);
}

export function evaluateSigned({ rawHex, prevoutScript, inputSats, minRelayXecPerKb, payloadScript }) {
  const problems = [];
  const tx = parseLabTransaction(rawHex);
  const signedSize = tx.size;
  const feeSats = inputSats - tx.outputs[1].sats;
  const required = requiredFeeSats(signedSize, minRelayXecPerKb);
  if (tx.version !== 2) problems.push(`version ${tx.version}`);
  if (tx.outputs[0].sats !== 0n) problems.push("OP_RETURN value is not zero");
  if (Buffer.from(tx.outputs[0].script).equals(payloadScript) === false) problems.push("payload script mismatch");
  if (Buffer.from(tx.outputs[1].script).equals(Buffer.from(prevoutScript, "hex")) === false) problems.push("change script mismatch");
  let sighash;
  let pubkeyHash = "";
  try {
    const inspected = inspectScriptSig(tx.scriptSig);
    sighash = inspected.sighash;
    pubkeyHash = inspected.pubkeyHash.toString("hex");
    if (sighash !== SIGHASH_ALL_FORKID) problems.push(`sighash byte is 0x${sighash.toString(16)}`);
    if (inspected.pubkeyHash.equals(prevoutHash160(prevoutScript)) === false) problems.push("HASH160 does not match the spent prevout");
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  let authorIndex;
  try {
    const envelope = readSocialEnvelope(tx.outputs[0].script);
    authorIndex = envelope.authorIndex;
    if (authorIndex !== 0) problems.push(`author index is ${authorIndex}`);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (feeSats !== BigInt(required)) problems.push(`fee ${feeSats} sats does not match required ${required} sats for ${signedSize} bytes`);
  return {
    ok: problems.length === 0,
    problems,
    signedSize,
    feeSats: feeSats.toString(),
    requiredFeeSats: required,
    sighash: sighash ?? null,
    authorIndex: authorIndex ?? null,
    pubkeyHash
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || process.argv[index + 1] === undefined) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function cli() {
  const command = process.argv[2];
  if (command === "payload") {
    const event = argument("--event");
    if (event === "reply") {
      const parentArg = argument("--parent");
      const parent = parentArg === "offline-fixture" ? offlineFixtureParent() : Buffer.from(parentArg, "hex");
      process.stdout.write(replyPayload(parent, argument("--message")).toString("hex"));
      return;
    }
    throw new Error("POST payloads must come from encodeTm1Post");
  }
  if (command === "unsigned") {
    const payloadScript = Buffer.from(argument("--payload-script"), "hex");
    const changeScript = Buffer.from(argument("--change-script"), "hex");
    const raw = buildUnsigned({
      txid: argument("--txid"),
      vout: Number(argument("--vout")),
      payloadScript,
      changeScript,
      changeSats: BigInt(argument("--change-sats"))
    });
    process.stdout.write(raw.toString("hex"));
    return;
  }
  if (command === "evaluate") {
    const report = evaluateSigned({
      rawHex: argument("--raw"),
      prevoutScript: argument("--prevout-script"),
      inputSats: BigInt(argument("--input-sats")),
      minRelayXecPerKb: argument("--min-relay"),
      payloadScript: Buffer.from(argument("--payload-script"), "hex")
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  throw new Error("usage: payload | unsigned | evaluate");
}

if (process.argv[1]?.endsWith("rfc0001-regtest-social.mjs")) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
