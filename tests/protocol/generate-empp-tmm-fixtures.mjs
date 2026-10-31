import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  BYTE_BUDGET,
  RMZ_TOKEN_ID,
  inspectEmppContainer
} from "./empp-tmm-independent.mjs";

/**
 * Builds ALP/eMPP scripts with the pinned ecash-lib, then requires the
 * independent reader to agree with parseEmppScript and parseAlp.
 * No private keys, no network, and no production parser.
 */

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json"));
const {
  ALP_STANDARD,
  Script,
  alpBurn,
  alpMint,
  alpSend,
  emppScript,
  parseAlp,
  parseEmppScript
} = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const checkMode = process.argv.includes("--check");
const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../fixtures/rfc0001-empp-tmm.json");
const DECLARED_TARGET = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const CANONICAL_TMM = "544d4d00020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const WRONG_TOKEN = "11".repeat(32);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

assert(RMZ_TOKEN_ID.length === 64, "RMZ token id must be 32 bytes.");
assert(DECLARED_TARGET.length === 64, "Declared target TXID must be 32 bytes.");
assert(ecashLibVersion === "4.13.0", `Pinned ecash-lib is ${ecashLibVersion}, expected 4.13.0.`);
assert(BYTE_BUDGET === 223, "Independent byte budget drifted from 223.");

function tmmBytes(spec = {}) {
  const target = Buffer.from(spec.targetHex ?? DECLARED_TARGET, "hex");
  return Buffer.concat([
    Buffer.from("544d4d00", "hex"),
    Buffer.from([spec.version ?? 0x02, spec.event ?? 0x05, spec.author ?? 0x01]),
    target
  ]);
}

function scriptBytes(parts) {
  return Buffer.from(emppScript(parts).bytecode);
}

function requireLength(script, length, label) {
  if (script.length !== length) {
    fail(`${label} is ${script.length} bytes, expected ${length}.`);
  }
}

const canonicalTmm = tmmBytes();
assert(canonicalTmm.length === 39, "Canonical TMM entry must be 39 bytes.");
assert(canonicalTmm.toString("hex") === CANONICAL_TMM, "Canonical TMM bytes drifted from the S-09 sample.");

const send125 = alpSend(RMZ_TOKEN_ID, ALP_STANDARD, [125n]);
const positiveScript = scriptBytes([send125, canonicalTmm]);
requireLength(positiveScript, 92, "ALP SEND plus one TMM");

const send22 = alpSend(RMZ_TOKEN_ID, ALP_STANDARD, Array.from({ length: 22 }, () => 1n));
const natural219 = scriptBytes([send22, canonicalTmm]);
requireLength(natural219, 219, "22-output ALP SEND plus TMM");
const natural225 = scriptBytes([
  alpSend(RMZ_TOKEN_ID, ALP_STANDARD, Array.from({ length: 23 }, () => 1n)),
  canonicalTmm
]);
requireLength(natural225, 225, "23-output ALP SEND plus TMM");
const exact223 = scriptBytes([send22, canonicalTmm, Buffer.from("010203", "hex")]);
const exact224 = scriptBytes([send22, canonicalTmm, Buffer.from("01020304", "hex")]);
requireLength(exact223, 223, "219-byte script plus a 3-byte push");
requireLength(exact224, 224, "219-byte script plus a 4-byte push");

function nonMinimalTmm(alp, tmm) {
  assert(alp.length < 0x4c, "Non-minimal builder expects a direct ALP push.");
  const minimal = scriptBytes([alp, tmm]);
  const opcodeAt = 2 + 1 + alp.length;
  assert(minimal[opcodeAt] === tmm.length, `TMM opcode at ${opcodeAt} is ${minimal[opcodeAt]}.`);
  return Buffer.concat([
    minimal.subarray(0, opcodeAt),
    Buffer.from([0x4c, tmm.length]),
    tmm
  ]);
}

const TM1_POST = "6a04544d4d00050101006869";
const SOCIAL_V2 = "6a04544d4d000402050161";
const UNRELATED = "6a04deadbeef";
const TM0_TEXT = Buffer.from("TM0|p|xa|hi", "ascii");
const TM0_ENVELOPE = Buffer.concat([Buffer.from([0x6a, TM0_TEXT.length]), TM0_TEXT]).toString("hex");

function libraryEmpp(script) {
  try {
    const parsed = parseEmppScript(new Script(script));
    if (parsed === undefined) {
      return { status: "not-empp", entries: [] };
    }
    return {
      status: "match",
      entries: parsed.map((entry) => Buffer.from(entry).toString("hex"))
    };
  } catch (error) {
    return {
      status: "throw",
      message: error instanceof Error ? error.message : String(error),
      entries: []
    };
  }
}

function crossAlp(entryHex, inspected) {
  let parsed;
  try {
    parsed = parseAlp(Buffer.from(entryHex, "hex"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (inspected.alp.action === "MALFORMED") {
      return "throw-malformed";
    }
    if (inspected.alp.flags.includes("ACTION_NOT_ADMITTED")
      && inspected.alp.action !== "SEND"
      && inspected.alp.action !== "BURN"
      && inspected.alp.action !== "MINT") {
      if (!message.includes("Unknown txType")) {
        fail(`parseAlp rejected ${inspected.alp.action} with: ${message}`);
      }
      return "throw-unknown-action";
    }
    fail(`parseAlp threw for ${entryHex.slice(0, 16)}: ${message}`);
  }
  if (!entryHex.startsWith("534c5032")) {
    if (parsed !== undefined) {
      fail(`Non-ALP push was parsed as ALP: ${entryHex.slice(0, 16)}`);
    }
    return "not-alp";
  }
  if (parsed === undefined) {
    fail(`parseAlp ignored an SLP2 push: ${entryHex.slice(0, 16)}`);
  }
  if (parsed.txType !== inspected.alp.action) {
    fail(`parseAlp action ${parsed.txType} != independent ${inspected.alp.action}`);
  }
  if (parsed.tokenId !== inspected.alp.tokenId) {
    fail(`parseAlp token ${parsed.tokenId} != independent ${inspected.alp.tokenId}`);
  }
  if (parsed.txType === "SEND") {
    const atoms = parsed.sendAtomsArray.map((value) => value.toString());
    const independentAtoms = inspected.alp.atomMap.map((row) => row.atoms);
    if (atoms.join(",") !== independentAtoms.join(",")) {
      fail(`SEND atoms ${atoms.join(",")} != ${independentAtoms.join(",")}`);
    }
  } else if (parsed.txType === "BURN") {
    if (parsed.burnAtoms.toString() !== inspected.alp.burnAtoms) {
      fail("BURN atoms disagree.");
    }
  } else if (parsed.txType === "MINT") {
    const atoms = parsed.mintData.atomsArray.map((value) => value.toString());
    if (atoms.join(",") !== inspected.alp.mintAtoms.join(",")) {
      fail("MINT atoms disagree.");
    }
    if (parsed.mintData.numBatons !== inspected.alp.numBatons) {
      fail("MINT batons disagree.");
    }
  }
  return parsed.txType;
}

function crossCheck(script, inspected) {
  const empp = libraryEmpp(script);
  if (inspected.container === "NOT_EMPP") {
    if (empp.status !== "not-empp") {
      fail(`Expected library not-empp, got ${empp.status}: ${empp.message ?? ""}`);
    }
  } else if (inspected.container === "INVALID") {
    if (empp.status !== "throw") {
      fail(`Expected library throw for an invalid container, got ${empp.status}.`);
    }
  } else {
    if (empp.status !== "match") {
      fail(`Expected library eMPP match, got ${empp.status}: ${empp.message ?? ""}`);
    }
    const got = inspected.pushes.map((push) => push.hex).join("|");
    if (got !== empp.entries.join("|")) {
      fail(`eMPP entries differ.\n independent ${got}\n library     ${empp.entries.join("|")}`);
    }
  }
  const alp = empp.status === "match" ? empp.entries.map((entry) => crossAlp(entry, inspected)) : [];
  return { empp: empp.status, alp };
}

function output(outputIndex, role, script) {
  const bytes = Buffer.isBuffer(script) ? script : Buffer.from(script, "hex");
  return {
    outputIndex,
    valueSats: "0",
    role,
    scriptHex: bytes.toString("hex"),
    bytes
  };
}

function makeCase(spec) {
  const built = spec.outputs.map((item) => output(item.outputIndex, item.role, item.script));
  const focus = built.find((item) => item.outputIndex === spec.focusOutputIndex);
  if (focus === undefined) {
    fail(`${spec.id} has no focus output.`);
  }
  const independent = inspectEmppContainer(focus.bytes, spec.inspectOptions);
  if (spec.expectShape !== undefined && independent.axes.wireShape !== spec.expectShape) {
    fail(`${spec.id} wire shape is ${independent.axes.wireShape}, expected ${spec.expectShape}. Flags: ${independent.flags.join(",")}`);
  }
  if (spec.expectLength !== undefined && independent.scriptByteLength !== spec.expectLength) {
    fail(`${spec.id} length ${independent.scriptByteLength} != ${spec.expectLength}`);
  }
  return {
    id: spec.id,
    purpose: spec.purpose,
    focusOutputIndex: spec.focusOutputIndex,
    inspectOptions: spec.inspectOptions,
    outputs: built.map((item) => ({
      outputIndex: item.outputIndex,
      valueSats: item.valueSats,
      role: item.role,
      scriptHex: item.scriptHex
    })),
    library: built.map((item) => ({
      outputIndex: item.outputIndex,
      role: item.role,
      ...crossCheck(
        item.bytes,
        item.outputIndex === spec.focusOutputIndex
          ? independent
          : inspectEmppContainer(item.bytes, {})
      )
    })),
    independent
  };
}

const withTarget = { declaredTargetTxid: DECLARED_TARGET };
const positiveOptions = { declaredTargetTxid: DECLARED_TARGET, declaredRecipientOutput: 1 };
const reversedTarget = DECLARED_TARGET.match(/../g).reverse().join("");
const nonUtf8Target = `ff${DECLARED_TARGET.slice(2)}`;

const cases = [
  makeCase({
    id: "alp-send-plus-one-tmm",
    purpose: "Canonical ALP SEND of 125 atoms plus one 39-byte TMM. Structural shape only.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectShape: "PROPOSED_SHAPE",
    expectLength: 92,
    outputs: [{ outputIndex: 0, role: "empp", script: positiveScript }]
  }),
  makeCase({
    id: "alp-send-only",
    purpose: "Canonical ALP SEND with no TMM entry.",
    focusOutputIndex: 0,
    inspectOptions: {},
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125]) }]
  }),
  makeCase({
    id: "duplicate-tmm",
    purpose: "One ALP SEND and two proposed TMM entries.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, canonicalTmm, canonicalTmm]) }]
  }),
  makeCase({
    id: "tmm-truncated-target",
    purpose: "TMM target truncated to 31 bytes, so the entry is 38 bytes.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([send125, tmmBytes({ targetHex: DECLARED_TARGET.slice(0, 62) })])
    }]
  }),
  makeCase({
    id: "tmm-overlong-target",
    purpose: "TMM target extended to 33 bytes, so the entry is 40 bytes.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([send125, tmmBytes({ targetHex: `${DECLARED_TARGET}20` })])
    }]
  }),
  makeCase({
    id: "tmm-wrong-version",
    purpose: "39-byte TMM whose version byte is 0x01.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, tmmBytes({ version: 0x01 })]) }]
  }),
  makeCase({
    id: "tmm-wrong-event",
    purpose: "39-byte TMM whose event byte is 0x01.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, tmmBytes({ event: 0x01 })]) }]
  }),
  makeCase({
    id: "tmm-author-index-255",
    purpose: "Author index 255 is one well-formed byte. It does not prove authorship.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectShape: "PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, tmmBytes({ author: 255 })]) }]
  }),
  makeCase({
    id: "tmm-reversed-target",
    purpose: "39-byte TMM whose target bytes are the reverse of the declared display TXID.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, tmmBytes({ targetHex: reversedTarget })]) }]
  }),
  makeCase({
    id: "tmm-non-utf8-target",
    purpose: "39-byte TMM whose target contains 0xff. The entry is still binary-valid.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, tmmBytes({ targetHex: nonUtf8Target })]) }]
  }),
  makeCase({
    id: "wrong-token-id",
    purpose: "Structurally valid ALP SEND for a token id other than RMZ, plus one TMM.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([alpSend(WRONG_TOKEN, ALP_STANDARD, [125n]), canonicalTmm])
    }]
  }),
  makeCase({
    id: "alp-truncated-entry",
    purpose: "The ALP push is a complete script push whose SEND payload is cut to 20 bytes.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([send125.subarray(0, 20), canonicalTmm])
    }]
  }),
  makeCase({
    id: "alp-burn-not-admitted",
    purpose: "Library ALP BURN beside one TMM. BURN is not the proposed SEND entry.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([alpBurn(RMZ_TOKEN_ID, ALP_STANDARD, 125n), canonicalTmm])
    }]
  }),
  makeCase({
    id: "alp-mint-not-admitted",
    purpose: "Library ALP MINT beside one TMM. MINT is not the proposed SEND entry.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([
        alpMint(RMZ_TOKEN_ID, ALP_STANDARD, { atomsArray: [125n], numBatons: 0 }),
        canonicalTmm
      ])
    }]
  }),
  makeCase({
    id: "alp-unknown-action",
    purpose: "SLP2 push whose action is NOPE, beside one TMM.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([
        Buffer.concat([Buffer.from("534c50320004", "hex"), Buffer.from("NOPE", "ascii")]),
        canonicalTmm
      ])
    }]
  }),
  makeCase({
    id: "alternate-entry-order",
    purpose: "The same SEND and TMM bytes with the TMM push first.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([canonicalTmm, send125]) }]
  }),
  makeCase({
    id: "non-minimal-tmm-push",
    purpose: "The 39-byte TMM is encoded with OP_PUSHDATA1.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: nonMinimalTmm(send125, canonicalTmm) }]
  }),
  makeCase({
    id: "truncated-script",
    purpose: "The positive script with its last four bytes removed.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "empp", script: positiveScript.subarray(0, positiveScript.length - 4) }]
  }),
  makeCase({
    id: "extra-push",
    purpose: "ALP SEND, one TMM, and a third push that is neither ALP nor TMM.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([send125, canonicalTmm, Buffer.from("010203", "hex")])
    }]
  }),
  makeCase({
    id: "budget-natural-219",
    purpose: "22 one-atom SEND outputs plus one TMM. Natural size inside the 223-byte budget.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "PROPOSED_SHAPE",
    expectLength: 219,
    outputs: [{ outputIndex: 0, role: "empp", script: natural219 }]
  }),
  makeCase({
    id: "budget-natural-225",
    purpose: "23 one-atom SEND outputs plus one TMM. Natural size past the 223-byte budget.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    expectLength: 225,
    outputs: [{ outputIndex: 0, role: "empp", script: natural225 }]
  }),
  makeCase({
    id: "budget-exact-223",
    purpose: "The 219-byte script plus a 3-byte non-protocol push. The script is exactly 223 bytes.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    expectLength: 223,
    outputs: [{ outputIndex: 0, role: "empp", script: exact223 }]
  }),
  makeCase({
    id: "budget-exact-224",
    purpose: "The 219-byte script plus a 4-byte non-protocol push. The script is exactly 224 bytes.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    expectLength: 224,
    outputs: [{ outputIndex: 0, role: "empp", script: exact224 }]
  }),
  makeCase({
    id: "alp-wrong-output-attribution",
    purpose: "Valid RMZ SEND assigns 125 atoms to output 1 and zero atoms to declared output 2.",
    focusOutputIndex: 0,
    inspectOptions: { declaredTargetTxid: DECLARED_TARGET, declaredRecipientOutput: 2 },
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([alpSend(RMZ_TOKEN_ID, ALP_STANDARD, [125n, 0n]), canonicalTmm])
    }]
  }),
  makeCase({
    id: "alp-zero-atoms",
    purpose: "Valid RMZ SEND whose only mapped amount is zero atoms.",
    focusOutputIndex: 0,
    inspectOptions: withTarget,
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([alpSend(RMZ_TOKEN_ID, ALP_STANDARD, [0n]), canonicalTmm])
    }]
  }),
  makeCase({
    id: "empp-beside-one-tm1",
    purpose: "The positive eMPP container beside one ordinary two-push TM1 POST.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectShape: "PROPOSED_SHAPE",
    outputs: [
      { outputIndex: 0, role: "empp", script: positiveScript },
      { outputIndex: 1, role: "tm1-post", script: TM1_POST }
    ]
  }),
  makeCase({
    id: "empp-beside-unrelated-op-return",
    purpose: "The positive eMPP container beside an OP_RETURN that is neither TM0 nor TM1.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectShape: "PROPOSED_SHAPE",
    outputs: [
      { outputIndex: 0, role: "empp", script: positiveScript },
      { outputIndex: 1, role: "unrelated-op-return", script: UNRELATED }
    ]
  }),
  makeCase({
    id: "empp-beside-tm0",
    purpose: "The positive eMPP container beside one text TM0 envelope.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectShape: "PROPOSED_SHAPE",
    outputs: [
      { outputIndex: 0, role: "empp", script: positiveScript },
      { outputIndex: 1, role: "tm0-envelope", script: TM0_ENVELOPE }
    ]
  }),
  makeCase({
    id: "two-push-social-v2-inactive",
    purpose: "Ordinary two-push script with version 0x02. It is not an eMPP container.",
    focusOutputIndex: 0,
    inspectOptions: {},
    expectShape: "NOT_PROPOSED_SHAPE",
    outputs: [{ outputIndex: 0, role: "two-push-v2", script: SOCIAL_V2 }]
  })
];

const shapeIds = cases.filter((item) => item.independent.axes.wireShape === "PROPOSED_SHAPE").map((item) => item.id);
assert(shapeIds.includes("alp-send-plus-one-tmm"), "Positive case lost the proposed shape.");
assert(cases.length >= 29, `Corpus has ${cases.length} cases.`);
for (const item of cases) {
  assert(item.independent.axes.authorship === "NOT_DEMONSTRATED", item.id);
  assert(item.independent.axes.attributableTransfer === false, item.id);
  assert(item.independent.axes.settlement === "PENDING", item.id);
  assert(item.independent.axes.tokenHistory === "NOT_CHECKED", item.id);
}

const document = {
  schema: "tonalli-memo.rfc0001.empp-tmm.s0",
  rfc0001: "PROPOSED — NOT RATIFIED",
  s0: "OPEN",
  s1: "NOT AUTHORIZED",
  socialVersion0x02: "inactive-in-production",
  baseline: "228d1f036643ca9be8ba85e91f8200536f3242da",
  ecashLib: ecashLibVersion,
  rmzTokenId: RMZ_TOKEN_ID,
  declaredTargetTxid: DECLARED_TARGET,
  canonicalTmmHex: CANONICAL_TMM,
  byteBudget: BYTE_BUDGET,
  boundaryNote: "A canonical ALP SEND plus one 39-byte TMM cannot land on 223 or 224 by output count alone. Twenty-two SEND outputs produce 219 bytes. Twenty-three produce 225. The 223-byte and 224-byte scripts add a non-protocol push to the 219-byte script. Those two are extra-push cases. 125 atoms are an integer SEND quantity, not a settled RMZ amount and not proof of two decimal places.",
  limits: [
    "Structural container, ALP SEND layout, and proposed TMM layout only.",
    "ALP ancestry and token validity are not checked.",
    "RMZ atom transfer is a structural output-index map, not an attributable transfer.",
    "XEC tips and ambiguous funding are not checked.",
    "TIP signatures and authorship are not demonstrated.",
    "Reactions and reaction removal are not checked.",
    "Reorgs and idempotence are not checked.",
    "Settlement stays pending. Double-count prevention is not checked.",
    "M1.7.4 is not satisfied.",
    "S0-05, S0-06, S0-07, and S0 are not complete.",
    "Social version 0x02 is not activated.",
    "PROPOSED_SHAPE is an independent structural label. It is not an application acceptance code."
  ],
  cases
};

const canonical = `${JSON.stringify(document, null, 2)}\n`;
assert(!canonical.includes("VALID_FORMAT"), "Corpus must not use VALID_FORMAT as a verdict.");
assert(!canonical.includes("\"SETTLED\""), "Corpus must not record a settled receipt.");

if (checkMode) {
  const current = await readFile(fixturePath, "utf8");
  if (current !== canonical) {
    fail("rfc0001-empp-tmm.json is not canonical. Regenerate it with tests/protocol/generate-empp-tmm-fixtures.mjs.");
  }
} else {
  await writeFile(fixturePath, canonical, "utf8");
}
