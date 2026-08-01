import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_ANYONECANPAY_BIP143,
  ALL_BIP143,
  Ecc,
  P2PKHSignatory,
  Script,
  SigHashType,
  SigHashTypeInputs,
  SigHashTypeOutputs,
  SigHashTypeVariant,
  Tx,
  TxBuilder,
  UnsignedTx,
  sha256d,
  shaRmd160
} from "ecash-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(__dirname, "..", "tm1-authorization-vectors.json");
const checkMode = process.argv.includes("--check");
const ecc = new Ecc();
const validationOrder = [
  "author-index",
  "prevout-availability",
  "prevout-script-type",
  "scriptsig-structure",
  "pubkey-hash-match",
  "sighash-policy",
  "cryptographic-signature"
];
// Insecure deterministic test keys only. They are public fixtures and must never receive funds.
const privateKeys = {
  authorA: fromHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  authorB: fromHex("1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100"),
  observer: fromHex("202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f")
};
const keys = Object.fromEntries(
  Object.entries(privateKeys).map(([name, privateKey]) => {
    const publicKey = ecc.derivePubkey(privateKey);
    const publicKeyHash = shaRmd160(publicKey);
    return [name, { privateKey, publicKey, publicKeyHash, outputScript: Script.p2pkh(publicKeyHash) }];
  })
);
const sighashNoneForkid = new SigHashType({
  variant: SigHashTypeVariant.BIP143,
  inputType: SigHashTypeInputs.FIXED,
  outputType: SigHashTypeOutputs.NONE
});
const sighashSingleForkid = new SigHashType({
  variant: SigHashTypeVariant.BIP143,
  inputType: SigHashTypeInputs.FIXED,
  outputType: SigHashTypeOutputs.SINGLE
});

function fromHex(hex) {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) throw new Error(`Invalid hex: ${hex}`);
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function sha256(bytes) {
  return Uint8Array.from(createHash("sha256").update(bytes).digest());
}

function hash160(bytes) {
  return Uint8Array.from(createHash("ripemd160").update(sha256(bytes)).digest());
}

function u32leHex(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer.toString("hex");
}

function pushBytes(bytes) {
  if (bytes.length <= 0x4b) return [bytes.length, ...bytes];
  if (bytes.length <= 0xff) return [0x4c, bytes.length, ...bytes];
  throw new Error("Fixture push too large.");
}

function tm1Script(authorInputIndex, eventData) {
  const data = Uint8Array.from(Buffer.from(eventData, "utf8"));
  return new Script(
    Uint8Array.from([
      0x6a,
      ...pushBytes(fromHex("544d4d00")),
      ...pushBytes(Uint8Array.from([0x01])),
      ...pushBytes(Uint8Array.from([0x01])),
      ...pushBytes(Uint8Array.from([authorInputIndex])),
      ...pushBytes(data)
    ])
  );
}

function deterministicTxid(label) {
  return hex(Uint8Array.from(sha256(Buffer.from(`tm1-auth:${label}`, "utf8"))).reverse());
}

function input({ keyName = "authorA", sats = 10000n, label, outIdx = 0, outputScript, scriptType = "p2pkh" }) {
  return {
    keyName,
    sats,
    prevOut: { txid: deterministicTxid(`${label}:${outIdx}`), outIdx },
    outputScript: outputScript ?? keys[keyName].outputScript,
    scriptType
  };
}

function buildSigned({ id, description, authorInputIndex, sighashType = ALL_BIP143, inputs, outputs }) {
  const tx = new TxBuilder({
    inputs: inputs.map((spec, index) => ({
      input: {
        prevOut: spec.prevOut,
        sequence: 0xffffffff,
        signData: { sats: spec.sats, outputScript: spec.outputScript }
      },
      signatory: P2PKHSignatory(keys[spec.keyName].privateKey, keys[spec.keyName].publicKey, index === authorInputIndex ? sighashType : ALL_BIP143)
    })),
    outputs
  }).sign({ ecc });
  return vectorFromTx({ id, description, authorInputIndex, tx, inputs, sighashType, valid: true, stage: "cryptographic-signature", errorCode: null });
}

function fixtureInput(spec) {
  return {
    prevOut: spec.prevOut,
    prevoutSats: spec.sats.toString(),
    outputScriptHex: spec.outputScript.toHex(),
    scriptType: spec.scriptType
  };
}

function inputFromFixture(value) {
  return {
    keyName: "authorA",
    sats: BigInt(value.prevoutSats),
    prevOut: value.prevOut,
    outputScript: new Script(fromHex(value.outputScriptHex)),
    scriptType: value.scriptType
  };
}

function parsePushes(scriptHex) {
  const bytes = fromHex(scriptHex);
  const pushes = [];
  for (let cursor = 0; cursor < bytes.length; ) {
    const opcode = bytes[cursor++];
    let length;
    if (opcode <= 0x4b) length = opcode;
    else if (opcode === 0x4c) length = bytes[cursor++];
    else break;
    pushes.push(bytes.slice(cursor, cursor + length));
    cursor += length;
  }
  return pushes;
}

function p2pkhHash(scriptHex) {
  const bytes = fromHex(scriptHex);
  if (bytes.length === 25 && bytes[0] === 0x76 && bytes[1] === 0xa9 && bytes[2] === 0x14 && bytes[23] === 0x88 && bytes[24] === 0xac) {
    return bytes.slice(3, 23);
  }
  return undefined;
}

function vectorFromTx({ id, description, authorInputIndex, tx, inputs, sighashType, valid, stage, errorCode }) {
  const scriptHex = tx.inputs[authorInputIndex]?.script?.toHex() ?? "";
  const pushes = parsePushes(scriptHex);
  const signatureWithHashType = pushes[0] ?? new Uint8Array();
  const signature = signatureWithHashType.slice(0, -1);
  const publicKey = pushes[1] ?? keys.authorA.publicKey;
  const sighashByte = signatureWithHashType.at(-1) ?? sighashType.toInt();
  const designated = inputs[authorInputIndex];
  let preimage = new Uint8Array();
  const shouldBuildPreimage = designated !== undefined && (valid || ["sighash-policy", "cryptographic-signature"].includes(stage)) && [0x41, 0xc1, 0x42, 0x43].includes(sighashByte);
  if (shouldBuildPreimage) {
    const unsignedTx = Tx.fromHex(tx.toHex());
    unsignedTx.inputs[authorInputIndex].signData = { sats: designated.sats, outputScript: designated.outputScript };
    preimage = UnsignedTx.fromTx(unsignedTx).inputAt(authorInputIndex).sigHashPreimage(SigHashType.fromInt(sighashByte)).bytes;
  }
  return {
    id,
    description,
    authorInputIndex,
    rawTransactionHex: tx.toHex(),
    txid: tx.txid(),
    inputs: inputs.map(fixtureInput),
    outputs: tx.outputs.map((output, outputIndex) => ({ outputIndex, sats: output.sats.toString(), outputScriptHex: output.script.toHex() })),
    designatedInput: designated === undefined ? null : fixtureInput(designated),
    publicKeyHex: hex(publicKey),
    publicKeyHashHex: designated === undefined ? null : hex(p2pkhHash(designated.outputScript.toHex()) ?? hash160(publicKey)),
    signatureAlgorithm: "schnorr",
    signatureHex: hex(signature),
    signatureWithHashTypeHex: hex(signatureWithHashType),
    inputScriptHex: scriptHex,
    sighashByteHex: sighashByte.toString(16).padStart(2, "0"),
    sighashUint32LeHex: u32leHex(sighashByte),
    sighashPreimageHex: hex(preimage),
    sighashDigestHex: hex(sha256d(preimage)),
    expected: { valid, stage, errorCode }
  };
}

function cloneTxWithScript(base, inputIndex, scriptHex) {
  const tx = Tx.fromHex(base.rawTransactionHex);
  tx.inputs[inputIndex].script = new Script(fromHex(scriptHex));
  return tx;
}

function setHashType(base, value) {
  const bytes = fromHex(base.inputScriptHex);
  bytes[65] = value;
  return hex(bytes);
}

function onePush(signatureWithHashTypeHex) {
  const size = signatureWithHashTypeHex.length / 2;
  return `${size.toString(16).padStart(2, "0")}${signatureWithHashTypeHex}`;
}

function p2pkhScriptSig(signatureWithHashTypeHex, publicKeyHex) {
  return `${(signatureWithHashTypeHex.length / 2).toString(16).padStart(2, "0")}${signatureWithHashTypeHex}${(publicKeyHex.length / 2).toString(16).padStart(2, "0")}${publicKeyHex}`;
}

function invalidFromBase({ id, description, base, authorInputIndex = base.authorInputIndex, stage, errorCode, mutateTx, mutateInputs }) {
  const tx = mutateTx ? mutateTx(Tx.fromHex(base.rawTransactionHex)) : Tx.fromHex(base.rawTransactionHex);
  const inputs = mutateInputs ? mutateInputs(base.inputs.map(inputFromFixture)) : base.inputs.map(inputFromFixture);
  return vectorFromTx({
    id,
    description,
    authorInputIndex,
    tx,
    inputs,
    sighashType: SigHashType.fromInt(Number.parseInt(base.sighashByteHex, 16)) ?? ALL_BIP143,
    valid: false,
    stage,
    errorCode
  });
}

function buildVectors() {
  const valid = [
    buildSigned({
      id: "valid-p2pkh-author0-schnorr-all-forkid",
      description: "P2PKH author input 0 signed with Schnorr and SIGHASH_ALL | SIGHASH_FORKID (0x41).",
      authorInputIndex: 0,
      sighashType: ALL_BIP143,
      inputs: [input({ keyName: "authorA", sats: 10000n, label: "valid-0" })],
      outputs: [{ sats: 0n, script: tm1Script(0, "valid author zero all") }, { sats: 9000n, script: keys.authorA.outputScript }]
    }),
    buildSigned({
      id: "valid-p2pkh-author2-schnorr-all-forkid",
      description: "P2PKH author input index greater than zero signed with Schnorr and 0x41.",
      authorInputIndex: 2,
      sighashType: ALL_BIP143,
      inputs: [
        input({ keyName: "observer", sats: 12000n, label: "valid-author2-observer" }),
        input({ keyName: "authorB", sats: 11000n, label: "valid-author2-b" }),
        input({ keyName: "authorA", sats: 10000n, label: "valid-author2-a" })
      ],
      outputs: [{ sats: 0n, script: tm1Script(2, "valid author index two") }, { sats: 30000n, script: keys.authorA.outputScript }]
    }),
    buildSigned({
      id: "valid-p2pkh-author0-schnorr-all-anyonecanpay-forkid",
      description: "P2PKH author input 0 signed with Schnorr and SIGHASH_ALL | SIGHASH_ANYONECANPAY | SIGHASH_FORKID (0xc1).",
      authorInputIndex: 0,
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [input({ keyName: "authorA", sats: 10000n, label: "valid-c1" })],
      outputs: [{ sats: 0n, script: tm1Script(0, "valid c1 author") }, { sats: 9000n, script: keys.authorA.outputScript }]
    }),
    buildSigned({
      id: "valid-designated-input-determines-authorship",
      description: "Additional inputs are present; only the designated input determines TM1 authorship.",
      authorInputIndex: 1,
      sighashType: ALL_BIP143,
      inputs: [input({ keyName: "observer", sats: 12000n, label: "observer" }), input({ keyName: "authorA", sats: 10000n, label: "designated-author" }), input({ keyName: "authorB", sats: 11000n, label: "author-b" })],
      outputs: [{ sats: 0n, script: tm1Script(1, "designated input only") }, { sats: 31000n, script: keys.authorA.outputScript }]
    }),
    buildSigned({
      id: "valid-c1-commits-all-outputs-including-tm1",
      description: "0xc1 commits to every output, including the TM1 OP_RETURN output.",
      authorInputIndex: 0,
      sighashType: ALL_ANYONECANPAY_BIP143,
      inputs: [input({ keyName: "authorA", sats: 10000n, label: "c1-commit-author" }), input({ keyName: "observer", sats: 12000n, label: "c1-commit-extra" })],
      outputs: [{ sats: 0n, script: tm1Script(0, "c1 commits tm1 output") }, { sats: 546n, script: keys.observer.outputScript }, { sats: 20454n, script: keys.authorA.outputScript }]
    })
  ];

  const base = valid[0];
  const p2shScript = Script.p2sh(hash160(Uint8Array.from([1, 2, 3, 4])));
  const bareMultisigScript = Script.multisig(1, [keys.authorA.publicKey, keys.authorB.publicKey]);
  const noneForkid = buildSigned({
    id: "invalid-unsupported-sighash-none-forkid",
    description: "SIGHASH_NONE | SIGHASH_FORKID is structurally signed but rejected by TM1 policy.",
    authorInputIndex: 0,
    sighashType: sighashNoneForkid,
    inputs: [input({ keyName: "authorA", sats: 10000n, label: "none-forkid" })],
    outputs: [{ sats: 0n, script: tm1Script(0, "none forkid") }, { sats: 9000n, script: keys.authorA.outputScript }]
  });
  const singleForkid = buildSigned({
    id: "invalid-unsupported-sighash-single-forkid",
    description: "SIGHASH_SINGLE | SIGHASH_FORKID is structurally signed but rejected by TM1 policy.",
    authorInputIndex: 0,
    sighashType: sighashSingleForkid,
    inputs: [input({ keyName: "authorA", sats: 10000n, label: "single-forkid" })],
    outputs: [{ sats: 0n, script: tm1Script(0, "single forkid") }, { sats: 9000n, script: keys.authorA.outputScript }]
  });
  const invalid = [
    invalidFromBase({ id: "invalid-author-input-out-of-range", description: "The declared author input index is outside vin.", base, authorInputIndex: 1, stage: "author-index", errorCode: "AUTHOR_INPUT_OUT_OF_RANGE" }),
    invalidFromBase({ id: "invalid-prevout-unavailable", description: "The designated input has no available prevout metadata.", base, stage: "prevout-availability", errorCode: "PREVOUT_UNAVAILABLE", mutateInputs: () => [] }),
    invalidFromBase({ id: "invalid-unsupported-author-script-p2sh", description: "The designated prevout is P2SH, which TM1 Draft 0.2 does not authorize.", base, stage: "prevout-script-type", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT", mutateInputs: (inputs) => [{ ...inputs[0], outputScript: p2shScript, scriptType: "p2sh" }] }),
    invalidFromBase({ id: "invalid-unsupported-author-script-bare-multisig", description: "The designated prevout is bare multisig, which TM1 Draft 0.2 does not authorize.", base, stage: "prevout-script-type", errorCode: "UNSUPPORTED_AUTHOR_SCRIPT", mutateInputs: (inputs) => [{ ...inputs[0], outputScript: bareMultisigScript, scriptType: "bare-multisig" }] }),
    invalidFromBase({ id: "invalid-scriptsig-zero-pushes", description: "The designated P2PKH scriptSig has zero pushes.", base, stage: "scriptsig-structure", errorCode: "INVALID_AUTHOR_SCRIPT_SIG", mutateTx: (tx) => { tx.inputs[0].script = new Script(); return tx; } }),
    invalidFromBase({ id: "invalid-scriptsig-one-push", description: "The designated P2PKH scriptSig has only the signature push.", base, stage: "scriptsig-structure", errorCode: "INVALID_AUTHOR_SCRIPT_SIG", mutateTx: () => cloneTxWithScript(base, 0, onePush(base.signatureWithHashTypeHex)) }),
    invalidFromBase({ id: "invalid-scriptsig-three-pushes", description: "The designated P2PKH scriptSig has more than two pushes.", base, stage: "scriptsig-structure", errorCode: "INVALID_AUTHOR_SCRIPT_SIG", mutateTx: () => cloneTxWithScript(base, 0, `${base.inputScriptHex}0101`) }),
    invalidFromBase({ id: "invalid-scriptsig-non-minimal-push", description: "The signature push uses OP_PUSHDATA1 even though the 65-byte signature fits in a direct push.", base, stage: "scriptsig-structure", errorCode: "INVALID_AUTHOR_SCRIPT_SIG", mutateTx: () => cloneTxWithScript(base, 0, `4c41${base.signatureWithHashTypeHex}${(base.publicKeyHex.length / 2).toString(16).padStart(2, "0")}${base.publicKeyHex}`) }),
    invalidFromBase({ id: "invalid-pubkey-hash-mismatch", description: "The scriptSig pubkey does not hash to the designated P2PKH prevout hash.", base, stage: "pubkey-hash-match", errorCode: "INVALID_AUTHOR_SIGNATURE", mutateTx: () => cloneTxWithScript(base, 0, p2pkhScriptSig(base.signatureWithHashTypeHex, hex(keys.authorB.publicKey))) }),
    invalidFromBase({ id: "invalid-unsupported-sighash-no-forkid", description: "The signature declares SIGHASH_ALL without SIGHASH_FORKID.", base, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH", mutateTx: () => cloneTxWithScript(base, 0, setHashType(base, 0x01)) }),
    { ...noneForkid, expected: { valid: false, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH" } },
    { ...singleForkid, expected: { valid: false, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH" } },
    invalidFromBase({ id: "invalid-unsupported-sighash-unknown-combination", description: "The signature declares an unknown sighash combination.", base, stage: "sighash-policy", errorCode: "UNSUPPORTED_SIGHASH", mutateTx: () => cloneTxWithScript(base, 0, setHashType(base, 0x45)) }),
    invalidFromBase({ id: "invalid-schnorr-signature-bit-flipped", description: "The Schnorr signature is altered while the transaction and key remain unchanged.", base, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE", mutateTx: () => { const sig = fromHex(base.signatureWithHashTypeHex); sig[12] ^= 1; return cloneTxWithScript(base, 0, p2pkhScriptSig(hex(sig), base.publicKeyHex)); } }),
    invalidFromBase({ id: "invalid-transaction-altered-after-signing", description: "An output is altered after signing, changing the digest committed by 0x41.", base, stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE", mutateTx: (tx) => { tx.outputs[1].sats = 8999n; return tx; } }),
    invalidFromBase({ id: "invalid-designated-input-fails-nondesignated-valid", description: "A non-designated input is authorized, but the designated input has an invalid signature and must be rejected.", base: valid[3], stage: "cryptographic-signature", errorCode: "INVALID_AUTHOR_SIGNATURE", mutateTx: (tx) => { const sig = parsePushes(tx.inputs[1].script.toHex())[0]; sig[0] ^= 1; tx.inputs[1].script = new Script(fromHex(p2pkhScriptSig(hex(sig), hex(keys.authorA.publicKey)))); return tx; } })
  ];

  return {
    schemaVersion: 1,
    protocol: "TM1",
    specDraft: "0.2",
    generator: { library: "ecash-lib", version: "4.13.0" },
    validationOrder,
    testKeys: Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        { warning: "Deterministic test key only; derived from insecure fixtures and never for funds.", publicKeyHex: hex(key.publicKey), publicKeyHashHex: hex(key.publicKeyHash) }
      ])
    ),
    valid,
    invalid
  };
}

const vectors = buildVectors();
if (vectors.valid.length === 0 || vectors.invalid.length === 0) throw new Error("Authorization vectors must include non-empty valid and invalid arrays.");
const canonical = `${JSON.stringify(vectors, null, 2)}\n`;
if (checkMode) {
  let current;
  try {
    current = await readFile(vectorsPath, "utf8");
  } catch (error) {
    throw new Error(`Committed vector file is missing: ${vectorsPath}`, { cause: error });
  }
  if (current !== canonical) throw new Error("tm1-authorization-vectors.json is not canonical; run vectors:generate.");
} else {
  await writeFile(vectorsPath, canonical, "utf8");
}
