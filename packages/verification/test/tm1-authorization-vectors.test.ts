import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Ecc } from "ecash-lib";

type Expected = { valid: boolean; stage: string; errorCode: string | null };
type FixtureInput = { prevOut: { txid: string; outIdx: number }; prevoutSats: string; outputScriptHex: string; scriptType: string };
type FixtureOutput = { outputIndex: number; sats: string; outputScriptHex: string };
type Vector = {
  id: string;
  description: string;
  authorInputIndex: number;
  rawTransactionHex: string;
  txid: string;
  inputs: FixtureInput[];
  outputs: FixtureOutput[];
  designatedInput: FixtureInput | null;
  publicKeyHex: string;
  publicKeyHashHex: string | null;
  signatureAlgorithm: string;
  signatureHex: string;
  signatureWithHashTypeHex: string;
  inputScriptHex: string;
  sighashByteHex: string;
  sighashUint32LeHex: string;
  sighashPreimageHex: string;
  sighashDigestHex: string;
  expected: Expected;
};
type VectorsFile = {
  schemaVersion: number;
  protocol: string;
  specDraft: string;
  generator: { library: string; version: string };
  validationOrder: string[];
  testKeys: Record<string, { warning: string; publicKeyHex: string; publicKeyHashHex: string }>;
  valid: Vector[];
  invalid: Vector[];
};
type ParsedInput = { prevTxidLe: Uint8Array; prevTxid: string; outIdx: number; script: Uint8Array; sequence: number };
type ParsedOutput = { sats: bigint; script: Uint8Array };
type ParsedTx = { version: number; inputs: ParsedInput[]; outputs: ParsedOutput[]; locktime: number; bytes: Uint8Array };
type ParsedPush = { opcode: number; data: Uint8Array; minimal: boolean };

const vectorsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "tm1-authorization-vectors.json");
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorsFile;
const allVectors = [...vectors.valid, ...vectors.invalid];
const expectedOrder = [
  "author-index",
  "prevout-availability",
  "prevout-script-type",
  "scriptsig-structure",
  "pubkey-hash-match",
  "sighash-policy",
  "cryptographic-signature"
];

function bytes(hex: string): Uint8Array {
  expect(hex).toMatch(/^(?:[0-9a-f]{2})*$/u);
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

function concat(parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(Buffer.concat(parts.map((part) => Buffer.from(part))));
}

function sha256(value: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(value).digest());
}

function sha256dNode(value: Uint8Array): Uint8Array {
  return sha256(sha256(value));
}

function hash160(value: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("ripemd160").update(sha256(value)).digest());
}

function u32le(value: number): Uint8Array {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return Uint8Array.from(buffer);
}

function u64le(value: bigint): Uint8Array {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return Uint8Array.from(buffer);
}

function varint(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.from([value]);
  if (value <= 0xffff) {
    const buffer = Buffer.alloc(3);
    buffer[0] = 0xfd;
    buffer.writeUInt16LE(value, 1);
    return Uint8Array.from(buffer);
  }
  throw new Error("Fixture varint too large for test helper.");
}

class Reader {
  cursor = 0;
  constructor(private readonly data: Uint8Array) {}
  read(length: number): Uint8Array {
    const out = this.data.slice(this.cursor, this.cursor + length);
    expect(out).toHaveLength(length);
    this.cursor += length;
    return out;
  }
  u32(): number {
    const value = Buffer.from(this.read(4)).readUInt32LE();
    return value;
  }
  u64(): bigint {
    return Buffer.from(this.read(8)).readBigUInt64LE();
  }
  varint(): number {
    const first = this.read(1)[0];
    if (first === undefined) throw new Error("Unexpected EOF.");
    if (first < 0xfd) return first;
    if (first === 0xfd) return Buffer.from(this.read(2)).readUInt16LE();
    throw new Error("Fixture varint too large for test helper.");
  }
  done(): boolean {
    return this.cursor === this.data.length;
  }
}

function parseTx(rawTransactionHex: string): ParsedTx {
  const txBytes = bytes(rawTransactionHex);
  const reader = new Reader(txBytes);
  const version = reader.u32();
  const inputCount = reader.varint();
  const inputs: ParsedInput[] = [];
  for (let index = 0; index < inputCount; index += 1) {
    const prevTxidLe = reader.read(32);
    const outIdx = reader.u32();
    const script = reader.read(reader.varint());
    const sequence = reader.u32();
    inputs.push({ prevTxidLe, prevTxid: toHex(Uint8Array.from(prevTxidLe).reverse()), outIdx, script, sequence });
  }
  const outputCount = reader.varint();
  const outputs: ParsedOutput[] = [];
  for (let index = 0; index < outputCount; index += 1) {
    const sats = reader.u64();
    const script = reader.read(reader.varint());
    outputs.push({ sats, script });
  }
  const locktime = reader.u32();
  expect(reader.done()).toBe(true);
  return { version, inputs, outputs, locktime, bytes: txBytes };
}

function txid(rawTransactionHex: string): string {
  return toHex(sha256dNode(bytes(rawTransactionHex)).reverse());
}

function outputBytes(output: ParsedOutput): Uint8Array {
  return concat([u64le(output.sats), varint(output.script.length), output.script]);
}

function scriptWithSize(scriptHex: string): Uint8Array {
  const script = bytes(scriptHex);
  return concat([varint(script.length), script]);
}

function reconstructPreimage(vector: Vector): Uint8Array {
  const tx = parseTx(vector.rawTransactionHex);
  const input = tx.inputs[vector.authorInputIndex];
  const prevout = vector.inputs[vector.authorInputIndex];
  if (input === undefined || prevout === undefined) throw new Error(`Cannot reconstruct preimage for ${vector.id}`);
  const sighash = Number.parseInt(vector.sighashByteHex, 16);
  const anyoneCanPay = (sighash & 0x80) !== 0;
  const prevoutsHash = anyoneCanPay
    ? new Uint8Array(32)
    : sha256dNode(concat(tx.inputs.map((txInput) => concat([txInput.prevTxidLe, u32le(txInput.outIdx)]))));
  const sequencesHash = anyoneCanPay ? new Uint8Array(32) : sha256dNode(concat(tx.inputs.map((txInput) => u32le(txInput.sequence))));
  const outputsHash = sha256dNode(concat(tx.outputs.map(outputBytes)));
  return concat([
    u32le(tx.version),
    prevoutsHash,
    sequencesHash,
    input.prevTxidLe,
    u32le(input.outIdx),
    scriptWithSize(prevout.outputScriptHex),
    u64le(BigInt(prevout.prevoutSats)),
    u32le(input.sequence),
    outputsHash,
    u32le(tx.locktime),
    u32le(sighash)
  ]);
}

function parsePushes(script: Uint8Array): ParsedPush[] | null {
  const pushes: ParsedPush[] = [];
  for (let cursor = 0; cursor < script.length; ) {
    const opcode = script[cursor];
    if (opcode === undefined) return null;
    cursor += 1;
    let length: number;
    let minimal = true;
    if (opcode <= 0x4b) {
      length = opcode;
    } else if (opcode === 0x4c) {
      const next = script[cursor];
      if (next === undefined) return null;
      length = next;
      minimal = length > 0x4b;
      cursor += 1;
    } else {
      return null;
    }
    const data = script.slice(cursor, cursor + length);
    if (data.length !== length) return null;
    pushes.push({ opcode, data, minimal });
    cursor += length;
  }
  return pushes;
}

function p2pkhHashFromScript(scriptHex: string): Uint8Array | null {
  const script = bytes(scriptHex);
  if (script.length !== 25 || script[0] !== 0x76 || script[1] !== 0xa9 || script[2] !== 0x14 || script[23] !== 0x88 || script[24] !== 0xac) return null;
  return script.slice(3, 23);
}

function validateVector(vector: Vector): Expected {
  const parsed = parseTx(vector.rawTransactionHex);
  if (vector.authorInputIndex < 0 || vector.authorInputIndex >= parsed.inputs.length) return { valid: false, stage: "author-index", errorCode: "AUTHOR_INPUT_OUT_OF_RANGE" };
  const prevout = vector.inputs[vector.authorInputIndex];
  if (prevout === undefined) return { valid: false, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE" };
  const pkh = p2pkhHashFromScript(prevout.outputScriptHex);
  if (prevout.scriptType !== "p2pkh" || pkh === null) return { valid: false, stage: "prevout-script-type", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT" };
  const script = parsed.inputs[vector.authorInputIndex]?.script;
  const pushes = script === undefined ? null : parsePushes(script);
  if (pushes === null || pushes.length !== 2 || pushes.some((push) => !push.minimal) || pushes[0]?.data.length !== 65 || pushes[1]?.data.length !== 33) {
    return { valid: false, stage: "scriptsig-structure", errorCode: "INVALID_AUTHOR_SCRIPT_SIG" };
  }
  if (toHex(hash160(pushes[1].data)) !== toHex(pkh)) return { valid: false, stage: "pubkey-hash-match", errorCode: "INVALID_AUTHOR_SIGNATURE" };
  const sighashByte = pushes[0].data[64];
  if (sighashByte !== 0x41 && sighashByte !== 0xc1) return { valid: false, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH" };
  try {
    new Ecc().schnorrVerify(pushes[0].data.slice(0, 64), sha256dNode(reconstructPreimage(vector)), pushes[1].data);
  } catch {
    return { valid: false, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE" };
  }
  return { valid: true, stage: "cryptographic-signature", errorCode: null };
}

describe("TM1 authorization vectors", () => {
  it("has canonical top-level metadata and non-empty vector arrays", () => {
    expect(vectors.schemaVersion).toBe(1);
    expect(vectors.protocol).toBe("TM1");
    expect(vectors.specDraft).toBe("0.2");
    expect(vectors.generator).toEqual({ library: "ecash-lib", version: "4.13.0" });
    expect(vectors.validationOrder).toEqual(expectedOrder);
    expect(vectors.valid.length).toBeGreaterThan(0);
    expect(vectors.invalid.length).toBeGreaterThan(0);
    for (const key of Object.values(vectors.testKeys)) {
      expect(Object.keys(key).sort()).toEqual(["publicKeyHashHex", "publicKeyHex", "warning"]);
      expect(key.warning).toContain("never for funds");
    }
  });

  it("uses unique stable IDs and lowercase even-length hex", () => {
    expect(new Set(allVectors.map((vector) => vector.id)).size).toBe(allVectors.length);
    for (const vector of allVectors) {
      expect(vector.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      for (const value of [vector.rawTransactionHex, vector.txid, vector.publicKeyHex, vector.signatureHex, vector.signatureWithHashTypeHex, vector.inputScriptHex, vector.sighashByteHex, vector.sighashUint32LeHex, vector.sighashPreimageHex, vector.sighashDigestHex]) {
        expect(value).toMatch(/^(?:[0-9a-f]{2})*$/u);
      }
    }
  });

  it("keeps money as decimal strings and author indexes in raw transaction range for valid vectors", () => {
    for (const vector of allVectors) {
      for (const input of vector.inputs) expect(input.prevoutSats).toMatch(/^(?:0|[1-9][0-9]*)$/u);
      for (const output of vector.outputs) expect(output.sats).toMatch(/^(?:0|[1-9][0-9]*)$/u);
    }
    for (const vector of vectors.valid) expect(vector.authorInputIndex).toBeLessThan(parseTx(vector.rawTransactionHex).inputs.length);
  });

  it("checks raw transaction, scriptSig, txid, signature fields, and TM1 envelope", () => {
    for (const vector of allVectors) {
      const parsed = parseTx(vector.rawTransactionHex);
      expect(txid(vector.rawTransactionHex)).toBe(vector.txid);
      expect(toHex(parsed.inputs[vector.authorInputIndex]?.script ?? new Uint8Array())).toBe(vector.inputScriptHex);
      if (vector.signatureWithHashTypeHex !== "") expect(vector.signatureWithHashTypeHex).toBe(`${vector.signatureHex}${vector.sighashByteHex}`);
      expect(vector.sighashUint32LeHex).toBe(toHex(u32le(Number.parseInt(vector.sighashByteHex, 16))));
      for (const [index, output] of parsed.outputs.entries()) expect(toHex(output.script)).toBe(vector.outputs[index]?.outputScriptHex);
    }
    for (const vector of vectors.valid) {
      const opReturn = parseTx(vector.rawTransactionHex).outputs[0]?.script;
      expect(opReturn?.[0]).toBe(0x6a);
      expect(toHex(opReturn?.slice(2, 6) ?? new Uint8Array())).toBe("544d4d00");
    }
  });

  it("reconstructs BIP143/ForkID preimages and digests independently", () => {
    for (const vector of allVectors.filter((item) => item.sighashPreimageHex !== "" && ["41", "c1"].includes(item.sighashByteHex))) {
      const preimage = reconstructPreimage(vector);
      expect(toHex(preimage)).toBe(vector.sighashPreimageHex);
      expect(toHex(sha256dNode(preimage))).toBe(vector.sighashDigestHex);
    }
  });

  it("uses allowed sighashes for valid vectors and verifies valid Schnorr signatures", () => {
    expect(new Set(vectors.valid.map((vector) => vector.sighashByteHex))).toEqual(new Set(["41", "c1"]));
    for (const vector of vectors.valid) {
      expect(validateVector(vector)).toEqual(vector.expected);
    }
  });

  it("covers required invalid authorization errors in the normative order", () => {
    const expectedCodes = new Set([
      "AUTHOR_INPUT_OUT_OF_RANGE",
      "PREVOUT_UNAVAILABLE",
      "UNSUPPORTED_AUTHOR_SCRIPT",
      "INVALID_AUTHOR_SCRIPT_SIG",
      "INVALID_AUTHOR_SIGNATURE",
      "UNSUPPORTED_SIGHASH"
    ]);
    for (const code of expectedCodes) expect(vectors.invalid.some((vector) => vector.expected.errorCode === code)).toBe(true);
    for (const vector of vectors.invalid) expect(validateVector(vector)).toEqual(vector.expected);
  });

  it("includes each required invalid scenario and keeps mutations distinct", () => {
    const ids = new Set(vectors.invalid.map((vector) => vector.id));
    for (const id of [
      "invalid-author-input-out-of-range",
      "invalid-prevout-unavailable",
      "invalid-unsupported-author-script-p2sh",
      "invalid-unsupported-author-script-bare-multisig",
      "invalid-scriptsig-zero-pushes",
      "invalid-scriptsig-one-push",
      "invalid-scriptsig-three-pushes",
      "invalid-scriptsig-non-minimal-push",
      "invalid-pubkey-hash-mismatch",
      "invalid-unsupported-sighash-no-forkid",
      "invalid-unsupported-sighash-none-forkid",
      "invalid-unsupported-sighash-single-forkid",
      "invalid-unsupported-sighash-unknown-combination",
      "invalid-schnorr-signature-bit-flipped",
      "invalid-transaction-altered-after-signing",
      "invalid-designated-input-fails-nondesignated-valid"
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    const base = vectors.valid[0];
    if (base === undefined) throw new Error("Missing base vector.");
    for (const vector of vectors.invalid) {
      expect(vector.id === base.id && vector.rawTransactionHex === base.rawTransactionHex && vector.authorInputIndex === base.authorInputIndex).toBe(false);
    }
  });
});
