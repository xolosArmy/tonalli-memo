import { Buffer } from "node:buffer";

/**
 * Hand-rolled eMPP / ALP SEND / proposed TMM reader.
 * It does not import ecash-lib, getStackArray, or the production parser.
 * OP_RESERVED is a container marker here. It is not a data push.
 * ALP atoms are 6-byte little-endian integers. The token id is stored
 * reversed and reported in display order.
 */

export const RMZ_TOKEN_ID = "c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908";
export const BYTE_BUDGET = 223;
export const TMM_ENTRY_LENGTH = 39;
export const PROPOSED_SOCIAL_VERSION = 0x02;
export const PROPOSED_TIP_EVENT = 0x05;

const OP_RETURN = 0x6a;
const OP_RESERVED = 0x50;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;
const ALP_LOKAD = "534c5032";
const TMM_LOKAD = "544d4d00";

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function reverseHex(bytes) {
  return Buffer.from(bytes).reverse().toString("hex");
}

function ascii(bytes) {
  for (const value of bytes) {
    if (value < 0x20 || value > 0x7e) {
      return null;
    }
  }
  return Buffer.from(bytes).toString("ascii");
}

function readU48(data, offset) {
  let value = 0n;
  for (let index = 0; index < 6; index += 1) {
    value |= BigInt(data[offset + index]) << BigInt(8 * index);
  }
  return value;
}

function readPush(script, offset) {
  if (offset >= script.length) {
    return { error: "TRUNCATED_PUSH" };
  }
  const opcode = script[offset];
  let header = 1;
  let length = 0;
  let minimal = true;
  if (opcode >= 0x01 && opcode <= 0x4b) {
    length = opcode;
  } else if (opcode === OP_PUSHDATA1) {
    if (offset + 1 >= script.length) {
      return { error: "TRUNCATED_PUSH" };
    }
    header = 2;
    length = script[offset + 1];
    minimal = length >= 0x4c;
  } else if (opcode === OP_PUSHDATA2) {
    if (offset + 2 >= script.length) {
      return { error: "TRUNCATED_PUSH" };
    }
    header = 3;
    length = script[offset + 1] + script[offset + 2] * 0x100;
    minimal = length >= 0x100;
  } else if (opcode === OP_PUSHDATA4) {
    if (offset + 4 >= script.length) {
      return { error: "TRUNCATED_PUSH" };
    }
    header = 5;
    length = script[offset + 1]
      + script[offset + 2] * 0x100
      + script[offset + 3] * 0x10000
      + script[offset + 4] * 0x1000000;
    minimal = length >= 0x10000;
  } else {
    return { error: "NON_PUSH", opcode };
  }
  const start = offset + header;
  const end = start + length;
  if (end > script.length) {
    return { error: "TRUNCATED_PUSH", declaredLength: length };
  }
  if (length === 0) {
    return { error: "EMPTY_PUSH" };
  }
  return {
    offset,
    minimal,
    byteLength: length,
    data: script.subarray(start, end),
    next: end
  };
}

function malformedAlp(action, flags) {
  return {
    present: true,
    action,
    structurallyValidSend: false,
    tokenType: null,
    tokenId: null,
    atomMap: [],
    burnAtoms: null,
    mintAtoms: [],
    numBatons: null,
    flags
  };
}

function parseAlpSection(data) {
  const empty = {
    present: false,
    action: "ABSENT",
    structurallyValidSend: false,
    tokenType: null,
    tokenId: null,
    atomMap: [],
    burnAtoms: null,
    mintAtoms: [],
    numBatons: null,
    flags: []
  };
  if (data.length < 4 || hex(data.subarray(0, 4)) !== ALP_LOKAD) {
    return empty;
  }
  if (data.length < 6) {
    return malformedAlp("MALFORMED", ["ALP_MALFORMED"]);
  }
  const tokenType = data[4];
  const actionLength = data[5];
  if (actionLength > 127 || 6 + actionLength > data.length) {
    return malformedAlp("MALFORMED", ["ALP_MALFORMED"]);
  }
  const actionText = ascii(data.subarray(6, 6 + actionLength));
  if (actionText === null) {
    return malformedAlp("MALFORMED", ["ALP_MALFORMED"]);
  }
  let cursor = 6 + actionLength;
  if (tokenType !== 0) {
    return {
      ...empty,
      present: true,
      action: "UNKNOWN_TOKEN_TYPE",
      tokenType,
      flags: ["ACTION_NOT_ADMITTED"]
    };
  }
  const takeTokenId = () => {
    if (cursor + 32 > data.length) {
      return null;
    }
    const tokenId = reverseHex(data.subarray(cursor, cursor + 32));
    cursor += 32;
    return tokenId;
  };
  if (actionText === "SEND") {
    const tokenId = takeTokenId();
    if (tokenId === null || cursor >= data.length) {
      return malformedAlp("MALFORMED", ["ALP_MALFORMED"]);
    }
    const count = data[cursor];
    cursor += 1;
    const flags = [];
    const atomMap = [];
    for (let index = 0; index < count; index += 1) {
      if (cursor + 6 > data.length) {
        return malformedAlp("MALFORMED", ["ALP_MALFORMED"]);
      }
      atomMap.push({
        outputIndex: index + 1,
        atoms: readU48(data, cursor).toString()
      });
      cursor += 6;
    }
    if (count > 127 || cursor !== data.length) {
      flags.push("ALP_MALFORMED");
    }
    return {
      present: true,
      action: "SEND",
      structurallyValidSend: flags.length === 0,
      tokenType,
      tokenId,
      atomMap: flags.length === 0 ? atomMap : [],
      burnAtoms: null,
      mintAtoms: [],
      numBatons: null,
      flags
    };
  }
  if (actionText === "BURN") {
    const tokenId = takeTokenId();
    if (tokenId === null || cursor + 6 !== data.length) {
      return malformedAlp("MALFORMED", ["ALP_MALFORMED", "ACTION_NOT_ADMITTED"]);
    }
    return {
      present: true,
      action: "BURN",
      structurallyValidSend: false,
      tokenType,
      tokenId,
      atomMap: [],
      burnAtoms: readU48(data, cursor).toString(),
      mintAtoms: [],
      numBatons: null,
      flags: ["ACTION_NOT_ADMITTED"]
    };
  }
  if (actionText === "MINT") {
    const tokenId = takeTokenId();
    if (tokenId === null || cursor >= data.length) {
      return malformedAlp("MALFORMED", ["ALP_MALFORMED", "ACTION_NOT_ADMITTED"]);
    }
    const count = data[cursor];
    cursor += 1;
    const mintAtoms = [];
    for (let index = 0; index < count; index += 1) {
      if (cursor + 6 > data.length) {
        return malformedAlp("MALFORMED", ["ALP_MALFORMED", "ACTION_NOT_ADMITTED"]);
      }
      mintAtoms.push(readU48(data, cursor).toString());
      cursor += 6;
    }
    if (cursor >= data.length) {
      return malformedAlp("MALFORMED", ["ALP_MALFORMED", "ACTION_NOT_ADMITTED"]);
    }
    const numBatons = data[cursor];
    cursor += 1;
    if (cursor !== data.length || count > 127 || numBatons > 127) {
      return malformedAlp("MALFORMED", ["ALP_MALFORMED", "ACTION_NOT_ADMITTED"]);
    }
    return {
      present: true,
      action: "MINT",
      structurallyValidSend: false,
      tokenType,
      tokenId,
      atomMap: [],
      burnAtoms: null,
      mintAtoms,
      numBatons,
      flags: ["ACTION_NOT_ADMITTED"]
    };
  }
  return {
    present: true,
    action: actionText,
    structurallyValidSend: false,
    tokenType,
    tokenId: null,
    atomMap: [],
    burnAtoms: null,
    mintAtoms: [],
    numBatons: null,
    flags: ["ACTION_NOT_ADMITTED"]
  };
}

function parseTmmSection(data, declaredTargetTxid) {
  const unrecognized = {
    recognized: false,
    structurallyValid: false,
    byteLength: data.length,
    version: null,
    event: null,
    authorInputIndex: null,
    targetTxid: null,
    targetByteOrder: "ABSENT",
    flags: []
  };
  if (data.length < 4 || hex(data.subarray(0, 4)) !== TMM_LOKAD) {
    return unrecognized;
  }
  const flags = [];
  if (data.length !== TMM_ENTRY_LENGTH) {
    flags.push("WRONG_LENGTH");
  }
  if (data.length < 7) {
    flags.push("TRUNCATED_TARGET");
    return {
      recognized: true,
      structurallyValid: false,
      byteLength: data.length,
      version: data.length > 4 ? data[4] : null,
      event: data.length > 5 ? data[5] : null,
      authorInputIndex: data.length > 6 ? data[6] : null,
      targetTxid: data.length > 7 ? hex(data.subarray(7)) : null,
      targetByteOrder: "MISMATCH",
      flags
    };
  }
  const version = data[4];
  const event = data[5];
  const authorInputIndex = data[6];
  const target = data.subarray(7);
  if (version !== PROPOSED_SOCIAL_VERSION) {
    flags.push("WRONG_VERSION");
  }
  if (event !== PROPOSED_TIP_EVENT) {
    flags.push("WRONG_EVENT");
  }
  if (target.length < 32) {
    flags.push("TRUNCATED_TARGET");
  } else if (target.length > 32) {
    flags.push("OVERLONG_TARGET");
  }
  const targetTxid = hex(target);
  let targetByteOrder = "UNDECLARED";
  if (typeof declaredTargetTxid === "string") {
    const reversed = declaredTargetTxid.match(/../g)?.reverse().join("") ?? "";
    if (target.length === 32 && targetTxid === declaredTargetTxid) {
      targetByteOrder = "DISPLAY";
    } else if (target.length === 32 && targetTxid === reversed) {
      targetByteOrder = "REVERSED";
      flags.push("REVERSED_TARGET");
    } else {
      targetByteOrder = "MISMATCH";
      flags.push("TARGET_MISMATCH");
    }
  }
  const structurallyValid = data.length === TMM_ENTRY_LENGTH
    && version === PROPOSED_SOCIAL_VERSION
    && event === PROPOSED_TIP_EVENT
    && target.length === 32;
  return {
    recognized: true,
    structurallyValid,
    byteLength: data.length,
    version,
    event,
    authorInputIndex,
    targetTxid,
    targetByteOrder,
    flags
  };
}

function addFlag(flags, flag) {
  if (!flags.includes(flag)) {
    flags.push(flag);
  }
}

/**
 * @param {Uint8Array} script
 * @param {{ declaredTargetTxid?: string, declaredRecipientOutput?: number }} [options]
 */
export function inspectEmppContainer(script, options = {}) {
  const flags = [];
  const byteBudgetExceeded = script.length > BYTE_BUDGET;
  if (byteBudgetExceeded) {
    addFlag(flags, "BYTE_BUDGET_EXCEEDED");
  }
  if (script.length === 0 || script[0] !== OP_RETURN) {
    addFlag(flags, "NOT_OP_RETURN");
    return finish(script, "INVALID", [], flags, options);
  }
  if (script.length < 2 || script[1] !== OP_RESERVED) {
    addFlag(flags, "NOT_EMPP");
    return finish(script, "NOT_EMPP", [], flags, options);
  }

  const pushes = [];
  let offset = 2;
  let container = "CANONICAL";
  while (offset < script.length) {
    const push = readPush(script, offset);
    if (push.error !== undefined) {
      addFlag(flags, push.error);
      container = "INVALID";
      break;
    }
    if (!push.minimal) {
      addFlag(flags, "NON_MINIMAL_PUSH");
      if (container === "CANONICAL") {
        container = "PARSEABLE";
      }
    }
    pushes.push({
      index: pushes.length,
      offset: push.offset,
      minimal: push.minimal,
      byteLength: push.byteLength,
      hex: hex(push.data)
    });
    offset = push.next;
  }
  return finish(script, container, pushes, flags, options);
}

function finish(script, container, pushes, flags, options) {
  const byteBudgetExceeded = script.length > BYTE_BUDGET;
  const sections = pushes.map((push) => {
    const data = Buffer.from(push.hex, "hex");
    const alp = parseAlpSection(data);
    if (alp.present) {
      return { kind: "ALP", push, alp };
    }
    const tmm = parseTmmSection(data, options.declaredTargetTxid);
    if (tmm.recognized) {
      return { kind: "TMM", push, tmm };
    }
    return { kind: "OTHER", push };
  });

  const alpSections = sections.filter((section) => section.kind === "ALP");
  const tmmSections = sections.filter((section) => section.kind === "TMM");
  const otherCount = sections.filter((section) => section.kind === "OTHER").length;
  if (otherCount > 0) {
    addFlag(flags, "EXTRA_PUSH");
  }
  if (tmmSections.length > 1) {
    addFlag(flags, "DUPLICATE_TMM");
  }
  if (container !== "NOT_EMPP" && container !== "INVALID" && alpSections.length === 0 && script[1] === OP_RESERVED) {
    addFlag(flags, "ALP_ABSENT");
  }
  if (container !== "NOT_EMPP" && tmmSections.length === 0 && container !== "INVALID") {
    addFlag(flags, "TMM_ABSENT");
  }

  const alp = alpSections.length === 1
    ? alpSections[0].alp
    : alpSections.length === 0
      ? parseAlpSection(Buffer.alloc(0))
      : {
        present: true,
        action: "MULTIPLE",
        structurallyValidSend: false,
        tokenType: null,
        tokenId: null,
        atomMap: [],
        burnAtoms: null,
        mintAtoms: [],
        numBatons: null,
        flags: ["ALP_MALFORMED"]
      };
  for (const flag of alp.flags) {
    addFlag(flags, flag);
  }
  const rmzTokenId = alp.tokenId === RMZ_TOKEN_ID;
  if (alp.structurallyValidSend && !rmzTokenId) {
    addFlag(flags, "WRONG_TOKEN_ID");
  }

  const tmmEntries = tmmSections.map((section) => ({
    pushIndex: section.push.index,
    hex: section.push.hex,
    ...section.tmm
  }));
  for (const entry of tmmEntries) {
    for (const flag of entry.flags) {
      addFlag(flags, flag);
    }
  }
  const structurallyValidCount = tmmEntries.filter((entry) => entry.structurallyValid).length;
  const exactlyOne = structurallyValidCount === 1 && tmmEntries.length === 1;

  const firstAlp = sections.findIndex((section) => section.kind === "ALP");
  const firstTmm = sections.findIndex((section) => section.kind === "TMM");
  let order = "ABSENT";
  if (firstAlp !== -1 && firstTmm !== -1) {
    order = firstAlp < firstTmm ? "ALP_THEN_TMM" : "TMM_THEN_ALP";
    if (order !== "ALP_THEN_TMM") {
      addFlag(flags, "ORDER_MISMATCH");
    }
  } else if (firstAlp !== -1 || firstTmm !== -1) {
    order = "PARTIAL";
  }

  const positiveOutputIndexes = alp.atomMap
    .filter((row) => BigInt(row.atoms) > 0n)
    .map((row) => row.outputIndex);
  let transfer = "ABSENT";
  if (alp.present && !alp.structurallyValidSend) {
    transfer = "NOT_A_SEND";
  } else if (alp.structurallyValidSend && positiveOutputIndexes.length === 0) {
    transfer = "NO_POSITIVE_ATOMS";
    addFlag(flags, "NO_POSITIVE_ATOMS");
  } else if (alp.structurallyValidSend && options.declaredRecipientOutput !== undefined) {
    const credited = alp.atomMap.find((row) => row.outputIndex === options.declaredRecipientOutput);
    const atoms = credited === undefined ? 0n : BigInt(credited.atoms);
    transfer = atoms > 0n ? "STRUCTURAL_OUTPUT_MAP_ONLY" : "OUTPUT_ATTRIBUTION_MISMATCH";
    if (transfer === "OUTPUT_ATTRIBUTION_MISMATCH") {
      addFlag(flags, "OUTPUT_ATTRIBUTION_MISMATCH");
    }
  } else if (alp.structurallyValidSend) {
    transfer = "STRUCTURAL_OUTPUT_MAP_ONLY";
  }

  const containerValid = container === "CANONICAL" || container === "PARSEABLE";
  const proposedShape = container === "CANONICAL"
    && !byteBudgetExceeded
    && alpSections.length === 1
    && alp.structurallyValidSend
    && rmzTokenId
    && exactlyOne
    && order === "ALP_THEN_TMM"
    && otherCount === 0
    && tmmEntries[0]?.targetByteOrder === "DISPLAY"
    && transfer === "STRUCTURAL_OUTPUT_MAP_ONLY";

  return {
    scriptByteLength: script.length,
    byteBudget: BYTE_BUDGET,
    byteBudgetExceeded,
    container,
    order,
    extraPushCount: otherCount,
    flags,
    pushes: pushes.map((push) => ({
      index: push.index,
      offset: push.offset,
      minimal: push.minimal,
      byteLength: push.byteLength,
      hex: push.hex
    })),
    alp: {
      present: alp.present,
      action: alp.action,
      structurallyValidSend: alp.structurallyValidSend,
      tokenType: alp.tokenType,
      tokenId: alp.tokenId,
      rmzTokenId,
      atomMap: alp.atomMap,
      burnAtoms: alp.burnAtoms,
      mintAtoms: alp.mintAtoms,
      numBatons: alp.numBatons,
      positiveOutputIndexes,
      flags: alp.flags
    },
    tmm: {
      recognizedCount: tmmEntries.length,
      structurallyValidCount,
      exactlyOne,
      entries: tmmEntries.map((entry) => ({
        pushIndex: entry.pushIndex,
        hex: entry.hex,
        byteLength: entry.byteLength,
        structurallyValid: entry.structurallyValid,
        version: entry.version,
        event: entry.event,
        authorInputIndex: entry.authorInputIndex,
        targetTxid: entry.targetTxid,
        targetByteOrder: entry.targetByteOrder,
        flags: entry.flags
      }))
    },
    axes: {
      containerValid,
      alpStructurallyValid: alp.structurallyValidSend,
      tmmStructurallyValid: exactlyOne,
      authorship: "NOT_DEMONSTRATED",
      attributableTransfer: false,
      transfer,
      settlement: "PENDING",
      tokenHistory: "NOT_CHECKED",
      wireShape: proposedShape ? "PROPOSED_SHAPE" : "NOT_PROPOSED_SHAPE"
    }
  };
}
