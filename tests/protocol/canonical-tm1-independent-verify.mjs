import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * BIP143/ForkID preimage and P2PKH signature checks for the canonical TM1
 * corpus. Serialization is local. ecash-lib is used only as the ECC
 * primitive (schnorrVerify / ecdsaVerify), not for sighash preimages.
 */

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json"));
const { Ecc } = require("ecash-lib");

let ecc;

function eccInstance() {
  if (ecc === undefined) {
    ecc = new Ecc();
  }
  return ecc;
}

export function bytesFromHex(hex) {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) {
    throw new Error("Expected lowercase even-length hex.");
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function toHex(value) {
  return Buffer.from(value).toString("hex");
}

function concat(parts) {
  return Uint8Array.from(Buffer.concat(parts.map((part) => Buffer.from(part))));
}

function sha256(value) {
  return Uint8Array.from(createHash("sha256").update(value).digest());
}

export function sha256d(value) {
  return sha256(sha256(value));
}

export function hash160(value) {
  return Uint8Array.from(createHash("ripemd160").update(sha256(value)).digest());
}

function u32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return Uint8Array.from(buffer);
}

function u64le(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return Uint8Array.from(buffer);
}

function varint(value) {
  if (value < 0xfd) {
    return Uint8Array.from([value]);
  }
  if (value <= 0xffff) {
    const buffer = Buffer.alloc(3);
    buffer[0] = 0xfd;
    buffer.writeUInt16LE(value, 1);
    return Uint8Array.from(buffer);
  }
  throw new Error("Fixture varint is larger than this checker supports.");
}

class Reader {
  constructor(data) {
    this.data = data;
    this.cursor = 0;
  }

  read(length) {
    const out = this.data.slice(this.cursor, this.cursor + length);
    if (out.length !== length) {
      throw new Error("Unexpected end of transaction.");
    }
    this.cursor += length;
    return out;
  }

  u32() {
    return Buffer.from(this.read(4)).readUInt32LE();
  }

  u64() {
    return Buffer.from(this.read(8)).readBigUInt64LE();
  }

  varint() {
    const first = this.read(1)[0];
    if (first === undefined) {
      throw new Error("Unexpected end of transaction.");
    }
    if (first < 0xfd) {
      return first;
    }
    if (first === 0xfd) {
      return Buffer.from(this.read(2)).readUInt16LE();
    }
    throw new Error("Fixture varint is larger than this checker supports.");
  }
}

export function parseTx(rawTransactionHex) {
  const txBytes = bytesFromHex(rawTransactionHex);
  const reader = new Reader(txBytes);
  const version = reader.u32();
  const inputCount = reader.varint();
  const inputs = [];
  for (let index = 0; index < inputCount; index += 1) {
    const prevTxidLe = reader.read(32);
    const outIdx = reader.u32();
    const script = reader.read(reader.varint());
    const sequence = reader.u32();
    inputs.push({
      prevTxidLe,
      prevTxid: toHex(Uint8Array.from(prevTxidLe).reverse()),
      outIdx,
      script,
      sequence
    });
  }
  const outputCount = reader.varint();
  const outputs = [];
  for (let index = 0; index < outputCount; index += 1) {
    const sats = reader.u64();
    const script = reader.read(reader.varint());
    outputs.push({ sats, script });
  }
  const locktime = reader.u32();
  if (reader.cursor !== txBytes.length) {
    throw new Error("Transaction decoder did not consume the raw transaction.");
  }
  return { version, inputs, outputs, locktime, bytes: txBytes };
}

export function txidOf(rawTransactionHex) {
  return toHex(sha256d(bytesFromHex(rawTransactionHex)).reverse());
}

function outputBytes(output) {
  return concat([u64le(output.sats), varint(output.script.length), output.script]);
}

export function p2pkhHash(scriptHex) {
  const script = bytesFromHex(scriptHex);
  if (
    script.length !== 25 ||
    script[0] !== 0x76 ||
    script[1] !== 0xa9 ||
    script[2] !== 0x14 ||
    script[23] !== 0x88 ||
    script[24] !== 0xac
  ) {
    return null;
  }
  return script.slice(3, 23);
}

function parsePushes(script) {
  const pushes = [];
  for (let cursor = 0; cursor < script.length; ) {
    const opcode = script[cursor];
    if (opcode === undefined) {
      return null;
    }
    cursor += 1;
    let length;
    let minimal = true;
    if (opcode <= 0x4b) {
      length = opcode;
    } else if (opcode === 0x4c) {
      const next = script[cursor];
      if (next === undefined) {
        return null;
      }
      length = next;
      minimal = length > 0x4b;
      cursor += 1;
    } else {
      return null;
    }
    const data = script.slice(cursor, cursor + length);
    if (data.length !== length) {
      return null;
    }
    pushes.push({ data, minimal });
    cursor += length;
  }
  return pushes;
}

function isCompressedOrUncompressed(publicKey) {
  const prefix = publicKey[0];
  return (
    (publicKey.length === 33 && (prefix === 0x02 || prefix === 0x03)) ||
    (publicKey.length === 65 && prefix === 0x04)
  );
}

export function reconstructPreimage(tx, prevouts, inputIndex, sighashByte) {
  const input = tx.inputs[inputIndex];
  const prevout = prevouts[inputIndex];
  if (input === undefined || prevout === undefined || prevout.outputScriptHex === null) {
    throw new Error("Cannot reconstruct a preimage without the designated prevout.");
  }
  const anyoneCanPay = (sighashByte & 0x80) !== 0;
  const baseType = sighashByte & 0x1f;
  const prevoutsHash = anyoneCanPay
    ? new Uint8Array(32)
    : sha256d(concat(tx.inputs.map((txInput) => concat([txInput.prevTxidLe, u32le(txInput.outIdx)]))));
  // BIP143 hashes nSequence only for SIGHASH_ALL without ANYONECANPAY.
  // NONE and SINGLE use a zero hash even when every input is signed.
  const sequencesHash = anyoneCanPay || baseType !== 1
    ? new Uint8Array(32)
    : sha256d(concat(tx.inputs.map((txInput) => u32le(txInput.sequence))));
  let outputsHash;
  if (baseType === 1) {
    outputsHash = sha256d(concat(tx.outputs.map(outputBytes)));
  } else if (baseType === 2) {
    outputsHash = new Uint8Array(32);
  } else if (baseType === 3) {
    const output = tx.outputs[inputIndex];
    outputsHash = output === undefined ? new Uint8Array(32) : sha256d(outputBytes(output));
  } else {
    throw new Error(`Unsupported sighash base type 0x${baseType.toString(16)} for preimage reconstruction.`);
  }
  const prevoutScript = bytesFromHex(prevout.outputScriptHex);
  return concat([
    u32le(tx.version),
    prevoutsHash,
    sequencesHash,
    input.prevTxidLe,
    u32le(input.outIdx),
    varint(prevoutScript.length),
    prevoutScript,
    u64le(BigInt(prevout.prevoutSats)),
    u32le(input.sequence),
    outputsHash,
    u32le(tx.locktime),
    u32le(sighashByte)
  ]);
}

function verifySignature(algorithm, signature, digest, publicKey) {
  try {
    if (algorithm === "schnorr") {
      if (signature.length !== 64) {
        return false;
      }
      eccInstance().schnorrVerify(signature, digest, publicKey);
      return true;
    }
    if (algorithm === "ecdsa") {
      if (signature.length < 8 || signature.length > 72) {
        return false;
      }
      eccInstance().ecdsaVerify(signature, digest, publicKey);
      return true;
    }
  } catch {
    return false;
  }
  throw new Error(`Unknown signature algorithm ${algorithm}.`);
}

export function sighashByteAt(rawTransactionHex, inputIndex) {
  const tx = parseTx(rawTransactionHex);
  const input = tx.inputs[inputIndex];
  if (input === undefined) {
    throw new Error("Input index is outside the transaction.");
  }
  const pushes = parsePushes(input.script);
  if (pushes === null || pushes.length !== 2 || pushes[0].data.length < 2) {
    throw new Error("Cannot read a sighash byte from this scriptSig.");
  }
  return pushes[0].data[pushes[0].data.length - 1];
}

export function signatureMatches(rawTransactionHex, prevouts, inputIndex, algorithm) {
  const tx = parseTx(rawTransactionHex);
  const input = tx.inputs[inputIndex];
  if (input === undefined) {
    return false;
  }
  const pushes = parsePushes(input.script);
  if (pushes === null || pushes.length !== 2 || pushes[0].data.length < 2) {
    return false;
  }
  const sighashByte = pushes[0].data[pushes[0].data.length - 1];
  const preimage = reconstructPreimage(tx, prevouts, inputIndex, sighashByte);
  return verifySignature(algorithm, pushes[0].data.slice(0, -1), sha256d(preimage), pushes[1].data);
}

/**
 * TM1 author stages, with the digest check after the structural stages.
 * A failure is the first stage that rejects. Digest cases must already
 * have a canonical prevout, scriptSig, HASH160 and allowed sighash.
 */
export function classifyAuthor(fixture) {
  const tx = parseTx(fixture.rawTransactionHex);
  const index = fixture.authorInputIndex;
  if (!Number.isSafeInteger(index) || index < 0 || index >= tx.inputs.length) {
    return { valid: false, stage: "author-index", errorCode: "AUTHOR_INPUT_OUT_OF_RANGE" };
  }
  const prevout = fixture.inputs[index];
  if (prevout === undefined || prevout.outputScriptHex === null) {
    return { valid: false, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE" };
  }
  const expectedHash = p2pkhHash(prevout.outputScriptHex);
  if (prevout.scriptType !== "p2pkh" || expectedHash === null) {
    return { valid: false, stage: "prevout-script-type", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT" };
  }
  const pushes = parsePushes(tx.inputs[index].script);
  if (
    pushes === null ||
    pushes.length !== 2 ||
    pushes.some((push) => !push.minimal) ||
    pushes[0].data.length < 2 ||
    !isCompressedOrUncompressed(pushes[1].data)
  ) {
    return { valid: false, stage: "scriptsig-structure", errorCode: "INVALID_AUTHOR_SCRIPT_SIG" };
  }
  if (toHex(hash160(pushes[1].data)) !== toHex(expectedHash)) {
    return { valid: false, stage: "pubkey-hash-match", errorCode: "INVALID_AUTHOR_SIGNATURE" };
  }
  const sighashByte = pushes[0].data[pushes[0].data.length - 1];
  if (sighashByte !== 0x41 && sighashByte !== 0xc1) {
    return { valid: false, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH" };
  }
  const preimage = reconstructPreimage(tx, fixture.inputs, index, sighashByte);
  const digest = sha256d(preimage);
  const verified = verifySignature(fixture.signatureAlgorithm, pushes[0].data.slice(0, -1), digest, pushes[1].data);
  if (!verified) {
    return { valid: false, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE" };
  }
  return { valid: true, stage: "cryptographic-signature", errorCode: null };
}

export function preimageHex(rawTransactionHex, prevouts, inputIndex, sighashByte) {
  const tx = parseTx(rawTransactionHex);
  return toHex(reconstructPreimage(tx, prevouts, inputIndex, sighashByte));
}

export function digestHex(rawTransactionHex, prevouts, inputIndex, sighashByte) {
  return toHex(sha256d(bytesFromHex(preimageHex(rawTransactionHex, prevouts, inputIndex, sighashByte))));
}
