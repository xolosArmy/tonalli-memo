import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  BYTE_BUDGET,
  RMZ_TOKEN_ID,
  describeMemoPush,
  inspectEmppContainer
} from "./empp-tmm-independent.mjs";

/**
 * Builds the SEC-17 decision corpus with pinned ecash-lib.
 * The 29-case file is read only to prove these controls use the same bytes.
 * No private keys, no network, and no production parser.
 * No compatibility option is selected here.
 */

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../packages/verification/package.json"));
const {
  ALP_STANDARD,
  Script,
  alpSend,
  emppScript,
  parseAlp,
  parseEmppScript
} = require("ecash-lib");
const { version: ecashLibVersion } = require("ecash-lib/package.json");

const checkMode = process.argv.includes("--check");
const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../fixtures/rfc0001-empp-sec17-decisions.json");
const priorPath = join(here, "../fixtures/rfc0001-empp-tmm.json");
const PRIOR_SHA = "3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8";
const DECLARED_TARGET = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const CANONICAL_TMM = "544d4d00020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const POSITIVE_SCRIPT = "6a5031534c5032000453454e44085930c985cca74ff3c3b73c2a8053634bd3c818f50c98e9c530c6090fbd23c9017d000000000027544d4d00020501000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const SOCIAL_V2 = "6a04544d4d000402050161";
const UNRELATED = "6a04deadbeef";

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

assert(ecashLibVersion === "4.13.0", `Pinned ecash-lib is ${ecashLibVersion}, expected 4.13.0.`);
assert(BYTE_BUDGET === 223, "Independent byte budget drifted from 223.");

const canonicalTmm = Buffer.from(CANONICAL_TMM, "hex");
assert(canonicalTmm.length === 39, "Canonical TMM entry must be 39 bytes.");

const payloads = {
  tm0: Buffer.from("TM0|p|xa|hi", "ascii"),
  tm1: Buffer.from("TM1|p|xa|hi", "ascii"),
  tm2: Buffer.from("TM2|p|xa|hi", "ascii"),
  tm9: Buffer.from("TM9|p|xa|hi", "ascii"),
  tmNoDigit: Buffer.from("TM|p|xa|hi", "ascii"),
  notTm: Buffer.from("NO|p|xa|hi", "ascii"),
  tm2NoPipes: Buffer.from("TM2", "ascii"),
  badType: Buffer.from("TM0|9|xa|hi", "ascii"),
  invalidUtf8: Buffer.from([0x54, 0x4d, 0xff, 0x7c, 0x70])
};

function scriptBytes(parts) {
  return Buffer.from(emppScript(parts).bytecode);
}

function conventionalEnvelope(payload) {
  assert(payload.length <= 0x4b, "Conventional control expects a direct push.");
  return Buffer.concat([Buffer.from([0x6a, payload.length]), payload]);
}

function pushCost(length) {
  if (length >= 1 && length <= 0x4b) {
    return 1 + length;
  }
  if (length >= 0x4c && length <= 0xff) {
    return 2 + length;
  }
  fail(`No single-push cost for ${length} bytes.`);
}

function withFiller(parts, targetLength) {
  const base = scriptBytes(parts);
  const room = targetLength - base.length;
  let fillerLength = null;
  for (let length = 1; length <= 0xff; length += 1) {
    if (pushCost(length) === room) {
      fillerLength = length;
      break;
    }
  }
  if (fillerLength === null) {
    fail(`Cannot pad ${base.length} bytes to ${targetLength}. Room is ${room}.`);
  }
  const padded = scriptBytes([...parts, Buffer.alloc(fillerLength, 0x01)]);
  if (padded.length !== targetLength) {
    fail(`Padded script is ${padded.length}, expected ${targetLength}.`);
  }
  return padded;
}

function nonMinimalPayload(alp, payload) {
  assert(payload.length <= 0x4b, "Non-minimal control expects a direct payload push.");
  const minimal = scriptBytes([alp, payload]);
  const opcodeAt = 2 + 1 + alp.length;
  assert(minimal[opcodeAt] === payload.length, `Payload opcode at ${opcodeAt} is ${minimal[opcodeAt]}.`);
  return Buffer.concat([
    minimal.subarray(0, opcodeAt),
    Buffer.from([0x4c, payload.length]),
    payload
  ]);
}

const send125 = alpSend(RMZ_TOKEN_ID, ALP_STANDARD, [125n]);
const positiveScript = scriptBytes([send125, canonicalTmm]);
assert(positiveScript.toString("hex") === POSITIVE_SCRIPT, "Positive eMPP script drifted.");
const alpOnly = scriptBytes([send125]);
const tm0Inside = scriptBytes([send125, payloads.tm0]);
assert(tm0Inside.length === 64, `ALP plus TM0 text is ${tm0Inside.length} bytes, expected 64.`);

function libraryEmpp(script) {
  try {
    const parsed = parseEmppScript(new Script(script));
    if (parsed === undefined) {
      return { status: "not-empp" };
    }
    return { status: "match" };
  } catch {
    return { status: "throw" };
  }
}

function crossCheck(script, inspected) {
  const empp = libraryEmpp(script);
  if (inspected.container === "NOT_EMPP") {
    assert(empp.status === "not-empp", `Expected library not-empp, got ${empp.status}.`);
    return;
  }
  if (inspected.container === "INVALID") {
    assert(empp.status === "throw", `Expected library throw, got ${empp.status}.`);
    return;
  }
  assert(empp.status === "match", `Expected library match, got ${empp.status}.`);
  const parsed = parseEmppScript(new Script(script));
  for (const push of inspected.pushes) {
    const data = Buffer.from(push.hex, "hex");
    if (!push.hex.startsWith("534c5032")) {
      continue;
    }
    const alp = parseAlp(data);
    assert(alp !== undefined, "parseAlp ignored an SLP2 push.");
    assert(alp.txType === inspected.alp.action, "parseAlp action drifted.");
  }
  assert(parsed.length === inspected.pushes.length, "Library entry count drifted.");
}

function makeCase(spec) {
  const outputs = spec.outputs.map((item) => {
    const bytes = Buffer.isBuffer(item.script) ? item.script : Buffer.from(item.script, "hex");
    return {
      outputIndex: item.outputIndex,
      valueSats: "0",
      role: item.role,
      scriptHex: bytes.toString("hex"),
      bytes
    };
  });
  const focus = outputs.find((item) => item.outputIndex === spec.focusOutputIndex);
  if (focus === undefined) {
    fail(`${spec.id} has no focus output.`);
  }
  const independent = inspectEmppContainer(focus.bytes, spec.inspectOptions);
  if (spec.expectLength !== undefined && independent.scriptByteLength !== spec.expectLength) {
    fail(`${spec.id} length ${independent.scriptByteLength} != ${spec.expectLength}.`);
  }
  if (spec.expectContainer !== undefined && independent.container !== spec.expectContainer) {
    fail(`${spec.id} container ${independent.container} != ${spec.expectContainer}. Flags: ${independent.flags.join(",")}`);
  }
  crossCheck(focus.bytes, independent);
  const textPush = spec.textPayload === undefined
    ? null
    : describeMemoPush(spec.textPayload);
  return {
    id: spec.id,
    decision: spec.decision,
    purpose: spec.purpose,
    focusOutputIndex: spec.focusOutputIndex,
    textPayloadHex: spec.textPayload === undefined ? null : spec.textPayload.toString("hex"),
    textLayout: textPush,
    inspectOptions: spec.inspectOptions,
    outputs: outputs.map((item) => ({
      outputIndex: item.outputIndex,
      valueSats: item.valueSats,
      role: item.role,
      scriptHex: item.scriptHex
    })),
    independent
  };
}

const positiveOptions = { declaredTargetTxid: DECLARED_TARGET, declaredRecipientOutput: 1 };
const textOptions = { declaredRecipientOutput: 1 };

const cases = [
  makeCase({
    id: "c-empp-tm0-text",
    decision: "C",
    purpose: "ALP SEND plus one structurally pipe-shaped TM0 text entry inside eMPP. Content recognition is not authorship.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    expectLength: 64,
    outputs: [{ outputIndex: 0, role: "empp", script: tm0Inside }]
  }),
  makeCase({
    id: "c-conventional-tm0",
    decision: "C",
    purpose: "The same TM0 text as an ordinary OP_RETURN, outside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: {},
    expectContainer: "NOT_EMPP",
    outputs: [{ outputIndex: 0, role: "tm0-envelope", script: conventionalEnvelope(payloads.tm0) }]
  }),
  makeCase({
    id: "c-empp-tmm-binary",
    decision: "C",
    purpose: "The 92-byte ALP SEND plus binary TMM control from the 29-case corpus.",
    focusOutputIndex: 0,
    inspectOptions: positiveOptions,
    expectContainer: "CANONICAL",
    expectLength: 92,
    outputs: [{ outputIndex: 0, role: "empp", script: positiveScript }]
  }),
  makeCase({
    id: "c-empp-tmm-and-tm0-text",
    decision: "C",
    purpose: "Binary TMM and a pipe-shaped TM0 text entry in the same eMPP container.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: positiveOptions,
    expectContainer: "CANONICAL",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: scriptBytes([send125, canonicalTmm, payloads.tm0])
    }]
  }),
  makeCase({
    id: "c-empp-tmm-beside-conventional-tm0",
    decision: "C",
    purpose: "Binary TMM eMPP beside a separate conventional TM0 output.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: positiveOptions,
    expectContainer: "CANONICAL",
    outputs: [
      { outputIndex: 0, role: "empp", script: positiveScript },
      { outputIndex: 1, role: "tm0-envelope", script: conventionalEnvelope(payloads.tm0) }
    ]
  }),
  makeCase({
    id: "d-empp-tm1-pipe",
    decision: "D",
    purpose: "Pipe-shaped TM1 marker inside eMPP. It is not a two-push TM1 POST.",
    focusOutputIndex: 0,
    textPayload: payloads.tm1,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.tm1]) }]
  }),
  makeCase({
    id: "d-empp-tm2-pipe",
    decision: "D",
    purpose: "Pipe-shaped TM2 marker inside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.tm2,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.tm2]) }]
  }),
  makeCase({
    id: "d-empp-tm9-pipe",
    decision: "D",
    purpose: "Pipe-shaped TM9 marker inside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.tm9,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.tm9]) }]
  }),
  makeCase({
    id: "d-empp-tm-no-digit",
    decision: "D",
    purpose: "Marker TM with pipes and no digit, inside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.tmNoDigit,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.tmNoDigit]) }]
  }),
  makeCase({
    id: "d-empp-marker-not-tm",
    decision: "D",
    purpose: "Pipe-shaped marker that does not start with TM, inside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.notTm,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.notTm]) }]
  }),
  makeCase({
    id: "d-empp-tm2-no-pipes",
    decision: "D",
    purpose: "TM2 bytes with no pipe layout, inside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.tm2NoPipes,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.tm2NoPipes]) }]
  }),
  makeCase({
    id: "d-empp-invalid-utf8",
    decision: "D",
    purpose: "TM prefix followed by a non-UTF-8 byte, inside eMPP.",
    focusOutputIndex: 0,
    textPayload: payloads.invalidUtf8,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.invalidUtf8]) }]
  }),
  makeCase({
    id: "d-empp-tm0-bad-type",
    decision: "D",
    purpose: "TM0 marker whose type field is not one lowercase letter. Decode and validate are separate.",
    focusOutputIndex: 0,
    textPayload: payloads.badType,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: scriptBytes([send125, payloads.badType]) }]
  }),
  makeCase({
    id: "e-tm0-text-budget-223",
    decision: "E",
    purpose: "ALP SEND, TM0 text, and a filler push. The script is exactly 223 bytes.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: textOptions,
    expectLength: 223,
    outputs: [{ outputIndex: 0, role: "empp", script: withFiller([send125, payloads.tm0], 223) }]
  }),
  makeCase({
    id: "e-tm0-text-budget-224",
    decision: "E",
    purpose: "The same TM0 text in a 224-byte eMPP script.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: textOptions,
    expectLength: 224,
    outputs: [{ outputIndex: 0, role: "empp", script: withFiller([send125, payloads.tm0], 224) }]
  }),
  makeCase({
    id: "e-tm0-text-budget-225",
    decision: "E",
    purpose: "The same TM0 text in a 225-byte eMPP script.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: textOptions,
    expectLength: 225,
    outputs: [{ outputIndex: 0, role: "empp", script: withFiller([send125, payloads.tm0], 225) }]
  }),
  makeCase({
    id: "e-truncated-tm0-push",
    decision: "E",
    purpose: "The TM0 push is cut before its declared length.",
    focusOutputIndex: 0,
    inspectOptions: textOptions,
    expectContainer: "INVALID",
    outputs: [{
      outputIndex: 0,
      role: "empp",
      script: tm0Inside.subarray(0, tm0Inside.length - 4)
    }]
  }),
  makeCase({
    id: "e-non-minimal-tm0-push",
    decision: "E",
    purpose: "The TM0 text is carried by a non-minimal OP_PUSHDATA1.",
    focusOutputIndex: 0,
    textPayload: payloads.tm0,
    inspectOptions: textOptions,
    expectContainer: "PARSEABLE",
    outputs: [{ outputIndex: 0, role: "empp", script: nonMinimalPayload(send125, payloads.tm0) }]
  }),
  makeCase({
    id: "e-alp-only-no-tmm",
    decision: "E",
    purpose: "ALP SEND with no TMM entry and no text entry.",
    focusOutputIndex: 0,
    inspectOptions: textOptions,
    expectContainer: "CANONICAL",
    outputs: [{ outputIndex: 0, role: "empp", script: alpOnly }]
  }),
  makeCase({
    id: "e-unrecognized-two-push-v2",
    decision: "E",
    purpose: "Ordinary two-push version 0x02. It is not an eMPP container.",
    focusOutputIndex: 0,
    inspectOptions: {},
    expectContainer: "NOT_EMPP",
    outputs: [{ outputIndex: 0, role: "two-push-v2", script: SOCIAL_V2 }]
  }),
  makeCase({
    id: "e-unrelated-no-memo",
    decision: "E",
    purpose: "Ordinary OP_RETURN that is neither TM0 nor TM1 nor eMPP.",
    focusOutputIndex: 0,
    inspectOptions: {},
    expectContainer: "NOT_EMPP",
    outputs: [{ outputIndex: 0, role: "unrelated-op-return", script: UNRELATED }]
  })
];

const prior = JSON.parse(await readFile(priorPath, "utf8"));
assert(prior.cases.length === 29, `Prior corpus has ${prior.cases.length} cases.`);
const priorPositive = prior.cases.find((item) => item.id === "alp-send-plus-one-tmm");
const priorAlpOnly = prior.cases.find((item) => item.id === "alp-send-only");
const priorBeside = prior.cases.find((item) => item.id === "empp-beside-tm0");
assert(priorPositive.outputs[0].scriptHex === POSITIVE_SCRIPT, "Prior positive script drifted.");
assert(priorAlpOnly.outputs[0].scriptHex === alpOnly.toString("hex"), "ALP-only script drifted from the 29-case corpus.");
assert(priorBeside.outputs[0].scriptHex === POSITIVE_SCRIPT, "Prior beside-TM0 eMPP script drifted.");
assert(priorBeside.outputs[1].scriptHex === conventionalEnvelope(payloads.tm0).toString("hex"), "Prior conventional TM0 script drifted.");
assert(cases.filter((item) => item.decision === "C").length === 5, "Decision C case count drifted.");
assert(cases.filter((item) => item.decision === "D").length === 8, "Decision D case count drifted.");
assert(cases.filter((item) => item.decision === "E").length === 8, "Decision E case count drifted.");
for (const item of cases) {
  assert(item.independent.axes.authorship === "NOT_DEMONSTRATED", item.id);
  assert(item.independent.axes.attributableTransfer === false, item.id);
  assert(item.independent.axes.settlement === "PENDING", item.id);
  assert(!JSON.stringify(item).includes("VALID_FORMAT"), item.id);
  assert(!JSON.stringify(item).includes("\"SETTLED\""), item.id);
}

const document = {
  schema: "tonalli-memo.rfc0001.empp-sec17-decisions.s0",
  rfc0001: "PROPOSED — NOT RATIFIED",
  s0: "OPEN",
  s1: "NOT AUTHORIZED",
  socialVersion0x02: "inactive-in-production",
  baseline: "228d1f036643ca9be8ba85e91f8200536f3242da",
  referenceRfcHead: "4d52ebf23c7fdf6cc485cf40cff2a7c414e79784",
  priorCorpus: {
    path: "tests/fixtures/rfc0001-empp-tmm.json",
    sha256: PRIOR_SHA,
    cases: 29
  },
  ecashLib: ecashLibVersion,
  rmzTokenId: RMZ_TOKEN_ID,
  byteBudget: BYTE_BUDGET,
  canonicalTm0Text: payloads.tm0.toString("ascii"),
  limits: [
    "Characterization of current production behavior only.",
    "No container dispatch is implemented.",
    "No decision A-E option is adopted or ratified.",
    "A recognized TM0 text layout is not an authorization.",
    "Authorship stays NOT_DEMONSTRATED.",
    "Settlement stays pending.",
    "Social version 0x02 stays inactive.",
    "SEC-17 criteria remain unsatisfied.",
    "S0-07 remains unsatisfied. S0 stays OPEN. S1 stays NOT AUTHORIZED."
  ],
  adoptedOption: null,
  cases
};

const canonical = `${JSON.stringify(document, null, 2)}\n`;
assert(!canonical.includes("VALID_FORMAT"), "Corpus must not use VALID_FORMAT as a verdict.");
assert(!canonical.includes("\"SETTLED\""), "Corpus must not record a settled receipt.");

if (checkMode) {
  const current = await readFile(fixturePath, "utf8");
  if (current !== canonical) {
    fail("rfc0001-empp-sec17-decisions.json is not canonical. Regenerate it with tests/protocol/generate-empp-sec17-decisions.mjs.");
  }
} else {
  await writeFile(fixturePath, canonical, "utf8");
}
