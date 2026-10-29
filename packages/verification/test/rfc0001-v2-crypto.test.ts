import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ALL_ANYONECANPAY_BIP143,
  ALL_BIP143,
  Ecc,
  P2PKHSignatory,
  Script,
  SigHashType,
  Tx,
  TxBuilder,
  UnsignedTx,
  sha256d,
  shaRmd160
} from "ecash-lib";

/**
 * RFC-0001 test-only cryptography. Nothing in this file touches a network,
 * an RPC endpoint, Chronik, a production wallet, or mainnet funds.
 * All keys are deterministically derived from PUBLIC, insecure labels:
 * they MUST NEVER control actual eCash or any real token.
 * Spent outpoints below are invented; these transactions cannot be
 * represented as real confirmed or regtest-accepted transfers.
 */
const ecc = new Ecc();
const targetTxid = Uint8Array.from({ length: 32 }, (_unused, i) => i);
const fromLabel = (label: string): Uint8Array =>
  Uint8Array.from(createHash("sha256").update(`RFC0001-OFFLINE-DO-NOT-FUND:${label}`).digest());

const key = (label: string) => {
  const privateKey = fromLabel(label);
  const publicKey = ecc.derivePubkey(privateKey);
  const publicKeyHash = shaRmd160(publicKey);
  return {
    privateKey,
    publicKey,
    publicKeyHash,
    lockingScript: Script.p2pkh(publicKeyHash)
  };
};

function socialScript(eventType: 0x02 | 0x03 | 0x04 | 0x05, eventData: Uint8Array): Script {
  const envelope = Uint8Array.from([0x02, eventType, 0x01, ...eventData]);
  if (envelope.length > 75) throw new Error("Test harness requires a minimal direct envelope push");
  return new Script(Uint8Array.from([
    0x6a, 0x04, 0x54, 0x4d, 0x4d, 0x00,
    envelope.length, ...envelope
  ]));
}

function eventData(eventType: 0x02 | 0x03 | 0x04 | 0x05): Uint8Array {
  if (eventType === 0x02) {
    return Uint8Array.from([...targetTxid, ...Buffer.from("respuesta firmada", "utf8")]);
  }
  if (eventType === 0x03 || eventType === 0x04) {
    return Uint8Array.from([...targetTxid, 0x01]);
  }
  return targetTxid;
}

type CryptoKey = ReturnType<typeof key>;

function buildSignedEvent(eventType: 0x02 | 0x03 | 0x04 | 0x05, useAnyoneCanPay = false) {
  const unrelated = key("unrelated-fee-input");
  const author = key("designated-social-author");
  const recipient = key("different-recipient");
  const social = socialScript(eventType, eventData(eventType));
  const recipientSats = eventType === 0x05 ? 1000n : 0n;
  const tx = new TxBuilder({
    inputs: [
      {
        input: {
          prevOut: { txid: "11".repeat(32), outIdx: 0 },
          sequence: 0xffffffff,
          signData: { sats: 10000n, outputScript: unrelated.lockingScript }
        },
        signatory: P2PKHSignatory(unrelated.privateKey, unrelated.publicKey, ALL_BIP143)
      },
      {
        input: {
          prevOut: { txid: "22".repeat(32), outIdx: 1 },
          sequence: 0xffffffff,
          signData: { sats: 10000n, outputScript: author.lockingScript }
        },
        signatory: P2PKHSignatory(
          author.privateKey,
          author.publicKey,
          useAnyoneCanPay ? ALL_ANYONECANPAY_BIP143 : ALL_BIP143
        )
      }
    ],
    outputs: [
      { sats: 0n, script: social },
      ...(recipientSats > 0n ? [{ sats: recipientSats, script: recipient.lockingScript }] : []),
      { sats: 18000n - recipientSats, script: author.lockingScript }
    ]
  }).sign({ ecc });
  return { author, unrelated, recipient, social, tx };
}

function signedMaterial(tx: Tx, author: CryptoKey) {
  const scriptHex = tx.inputs[1]?.script?.toHex();
  if (scriptHex === undefined) throw new Error("Missing signed designated input");
  const script = Uint8Array.from(Buffer.from(scriptHex, "hex"));
  if (script.length !== 100 || script[0] !== 65 || script[66] !== 33) {
    throw new Error("Expected exactly two minimal pushes (65-byte Schnorr+hash type; 33-byte SEC key)");
  }
  const signature = script.slice(1, 65);
  const sighash = script[65];
  const publicKey = script.slice(67);
  if (publicKey.length !== 33 || sighash === undefined) throw new Error("Invalid author public key or sighash");

  const unsignedForPreimage = Tx.fromHex(tx.toHex());
  const designated = unsignedForPreimage.inputs[1];
  if (designated === undefined) throw new Error("Missing author input");
  designated.signData = { sats: 10000n, outputScript: author.lockingScript };
  const sighashType = SigHashType.fromInt(sighash);
  if (sighashType === undefined) throw new Error("Unsupported sighash type");
  const preimage = UnsignedTx.fromTx(unsignedForPreimage)
    .inputAt(1)
    .sigHashPreimage(sighashType).bytes;
  return {
    signature,
    publicKey,
    sighash,
    digest: sha256d(preimage),
    lockingHashHex: Buffer.from(author.publicKeyHash).toString("hex")
  };
}

/**
 * Independently checks the designated-index value actually embedded in OP_RETURN
 * and the P2PKH HASH160 of the provided spent prevout (not a wallet/key label).
 * Using a wrong index or wrong prevout must fail instead of calling a different
 * key's successful signature "proof of the claimed social author".
 */
function verifyAgainstSuppliedPrevout(
  tx: Tx,
  chosenAuthorInputIndex: number,
  actualSpentPrevout: Script
): "VERIFIED" | "AUTHOR_INDEX_MISMATCH" | "PREVOUT_PUBKEY_MISMATCH" | "INVALID_SIGNATURE" {
  const socialHex = tx.outputs[0]?.script.toHex() ?? "";
  const socialBytes = Uint8Array.from(Buffer.from(socialHex, "hex"));
  if (socialBytes[9] !== chosenAuthorInputIndex) return "AUTHOR_INDEX_MISMATCH";

  const rawScriptHex = tx.inputs[chosenAuthorInputIndex]?.script?.toHex() ?? "";
  const unlock = Uint8Array.from(Buffer.from(rawScriptHex, "hex"));
  if (unlock.length !== 100 || unlock[0] !== 65 || unlock[66] !== 33) return "INVALID_SIGNATURE";
  const publicKey = unlock.slice(67);
  const lockingScriptFromSignature = Script.p2pkh(shaRmd160(publicKey));
  if (lockingScriptFromSignature.toHex() !== actualSpentPrevout.toHex()) {
    return "PREVOUT_PUBKEY_MISMATCH";
  }
  const sighashType = SigHashType.fromInt(unlock[65] ?? 0);
  if (sighashType === undefined || ![0x41, 0xc1].includes(unlock[65] ?? 0)) {
    return "INVALID_SIGNATURE";
  }

  const unsigned = Tx.fromHex(tx.toHex());
  const selected = unsigned.inputs[chosenAuthorInputIndex];
  if (selected === undefined) return "INVALID_SIGNATURE";
  selected.signData = { sats: 10000n, outputScript: actualSpentPrevout };
  const digest = sha256d(
    UnsignedTx.fromTx(unsigned)
      .inputAt(chosenAuthorInputIndex)
      .sigHashPreimage(sighashType).bytes
  );
  try {
    ecc.schnorrVerify(unlock.slice(1, 65), digest, publicKey);
    return "VERIFIED";
  } catch {
    return "INVALID_SIGNATURE";
  }
}

describe("RFC-0001 Social v2: offline real P2PKH/Schnorr signing, no network", () => {
  it.each([
    ["REPLY", 0x02, false, 0x41, 59],
    ["REACTION", 0x03, false, 0x41, 43],
    ["REACTION_REMOVE", 0x04, true, 0xc1, 43],
    ["TIP_XEC declaration plus native recipient output", 0x05, false, 0x41, 42]
  ] as const)(
    "signs and independently verifies %s (event=%i, hash type=%i)",
    (_name, eventType, useAnyoneCanPay, expectedHashType, expectedScriptLength) => {
      const { author, tx, social, recipient } = buildSignedEvent(eventType, useAnyoneCanPay);
      const decoded = Tx.fromHex(tx.toHex());
      const material = signedMaterial(decoded, author);
      expect(decoded.txid()).toBe(tx.txid());
      expect(decoded.inputs).toHaveLength(2);
      expect(social.toHex().length / 2).toBe(expectedScriptLength);
      expect(decoded.outputs[0]?.script.toHex()).toBe(social.toHex());
      expect(material.sighash).toBe(expectedHashType);
      expect(Buffer.from(shaRmd160(material.publicKey)).toString("hex")).toBe(material.lockingHashHex);
      expect(Buffer.from(material.publicKey).toString("hex")).toBe(Buffer.from(author.publicKey).toString("hex"));
      expect(() => ecc.schnorrVerify(material.signature, material.digest, material.publicKey)).not.toThrow();
      if (eventType === 0x05) {
        expect(decoded.outputs[1]?.sats).toBe(1000n);
        expect(decoded.outputs[1]?.script.toHex()).toBe(recipient.lockingScript.toHex());
      }
    }
  );

  it("fails cryptographic verification if signed social bytes change", () => {
    const { tx, author } = buildSignedEvent(0x02);
    const original = signedMaterial(tx, author);
    const altered = Tx.fromHex(tx.toHex());
    const changedPayload = Uint8Array.from([...targetTxid, ...Buffer.from("respuesta alterada", "utf8")]);
    altered.outputs[0] = { sats: 0n, script: socialScript(0x02, changedPayload) };
    const modifiedDigest = signedMaterial(altered, author).digest;
    expect(Buffer.from(modifiedDigest).equals(Buffer.from(original.digest))).toBe(false);
    expect(() => ecc.schnorrVerify(original.signature, modifiedDigest, original.publicKey)).toThrow();
  });

  it("rejects an altered signature rather than trusting the input's claimed author", () => {
    const { tx, author } = buildSignedEvent(0x03);
    const material = signedMaterial(tx, author);
    const alteredSig = Uint8Array.from(material.signature);
    alteredSig[9] = (alteredSig[9] ?? 0) ^ 1;
    expect(() => ecc.schnorrVerify(alteredSig, material.digest, material.publicKey)).toThrow();
  });

  it("verifies correct signed author using the actual supplied P2PKH prevout", () => {
    const { tx, author } = buildSignedEvent(0x04);
    expect(verifyAgainstSuppliedPrevout(tx, 1, author.lockingScript)).toBe("VERIFIED");
  });

  it("rejects selecting a different validly signed input than social author_input_index", () => {
    const { tx, unrelated } = buildSignedEvent(0x04);
    // Input 0 is itself correctly signed by 'unrelated' but the social event
    // declares input 1. Accepting it would silently change author identity.
    expect(verifyAgainstSuppliedPrevout(tx, 0, unrelated.lockingScript))
      .toBe("AUTHOR_INDEX_MISMATCH");
  });

  it("rejects a mismatched actual designated prevout despite a valid test author's signature", () => {
    const { tx, unrelated } = buildSignedEvent(0x04);
    // The signed author input at index 1 does NOT spend the unrelated key's P2PKH output.
    expect(verifyAgainstSuppliedPrevout(tx, 1, unrelated.lockingScript))
      .toBe("PREVOUT_PUBKEY_MISMATCH");
  });

  it("never treats cryptographic success on invented prevouts as regtest consensus acceptance", () => {
    const { tx } = buildSignedEvent(0x02);
    expect(tx.toHex()).toMatch(/^[a-f0-9]+$/u);
    expect(tx.inputs[0]?.prevOut.txid).toBe("11".repeat(32));
    expect(tx.inputs[1]?.prevOut.txid).toBe("22".repeat(32));
    // No RPC, Chronik connection, mainnet keys, mainnet funds or broadcast in this suite.
  });
});
