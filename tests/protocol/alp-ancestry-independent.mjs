import { Buffer } from "node:buffer";

import {
  classifyAuthor,
  inputUnlockMatchesPrevout,
  p2pkhHash,
  parseTx,
  toHex,
  txidOf
} from "./canonical-tm1-independent-verify.mjs";
import { RMZ_TOKEN_ID } from "./empp-tmm-independent.mjs";

/**
 * Independent ALP ancestry and laboratory tip attribution.
 * ecash-lib is not used to parse sections or to decide conservation.
 * A locally valid synthetic chain is not RMZ mainnet genealogy, and no
 * result of this module is a settled tip.
 */

const OP_RETURN = 0x6a;
const OP_RESERVED = 0x50;
const OP_PUSHDATA1 = 0x4c;
const ALP_LOKAD = "534c5032";
const TMM_LOKAD = "544d4d00";
const BYTE_BUDGET = 223;

function atoms(value) {
  return value.toString();
}

function readU48(data, offset) {
  let value = 0n;
  for (let index = 0; index < 6; index += 1) {
    value |= BigInt(data[offset + index]) << BigInt(8 * index);
  }
  return value;
}

function readVar(data, cursor) {
  if (cursor >= data.length) {
    return null;
  }
  const length = data[cursor];
  if (length > 127) {
    return null;
  }
  const start = cursor + 1;
  const end = start + length;
  if (end > data.length) {
    return null;
  }
  return { bytes: data.subarray(start, end), cursor: end };
}

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function reverseHex(bytes) {
  return Buffer.from(bytes).reverse().toString("hex");
}

function readPushes(script) {
  if (script.length < 2 || script[0] !== OP_RETURN || script[1] !== OP_RESERVED) {
    return { error: "NOT_EMPP", pushes: [] };
  }
  const pushes = [];
  let cursor = 2;
  while (cursor < script.length) {
    const opcode = script[cursor];
    let length = 0;
    let header = 1;
    if (opcode >= 0x01 && opcode <= 0x4b) {
      length = opcode;
    } else if (opcode === OP_PUSHDATA1) {
      if (cursor + 1 >= script.length) {
        return { error: "TRUNCATED_PUSH", pushes };
      }
      header = 2;
      length = script[cursor + 1];
      if (length < OP_PUSHDATA1) {
        return { error: "NON_MINIMAL_PUSH", pushes };
      }
    } else {
      return { error: "NON_PUSH", pushes };
    }
    const start = cursor + header;
    const end = start + length;
    if (length === 0 || end > script.length) {
      return { error: "TRUNCATED_PUSH", pushes };
    }
    pushes.push(script.subarray(start, end));
    cursor = end;
  }
  return { error: null, pushes };
}

function parseMintData(data, cursor) {
  if (cursor >= data.length) {
    return null;
  }
  const count = data[cursor];
  cursor += 1;
  if (count > 127) {
    return null;
  }
  const amounts = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 6 > data.length) {
      return null;
    }
    amounts.push(readU48(data, cursor));
    cursor += 6;
  }
  if (cursor >= data.length) {
    return null;
  }
  const numBatons = data[cursor];
  cursor += 1;
  if (numBatons > 127 || cursor !== data.length) {
    return null;
  }
  return { amounts, numBatons };
}

/**
 * @param {Uint8Array} data
 */
export function parseAlpSection(data) {
  if (data.length < 4 || hex(data.subarray(0, 4)) !== ALP_LOKAD) {
    return { ok: false, reason: "NOT_ALP" };
  }
  if (data.length < 6 || data[4] !== 0) {
    return { ok: false, reason: "UNSUPPORTED_TOKEN_TYPE" };
  }
  const action = readVar(data, 5);
  if (action === null) {
    return { ok: false, reason: "MALFORMED" };
  }
  for (const value of action.bytes) {
    if (value < 0x20 || value > 0x7e) {
      return { ok: false, reason: "MALFORMED" };
    }
  }
  const name = Buffer.from(action.bytes).toString("ascii");
  if (name === "GENESIS") {
    const ticker = readVar(data, action.cursor);
    const tokenName = ticker === null ? null : readVar(data, ticker.cursor);
    const url = tokenName === null ? null : readVar(data, tokenName.cursor);
    const payload = url === null ? null : readVar(data, url.cursor);
    const authPubkey = payload === null ? null : readVar(data, payload.cursor);
    if (authPubkey === null || authPubkey.cursor >= data.length) {
      return { ok: false, reason: "MALFORMED" };
    }
    const decimals = data[authPubkey.cursor];
    const mint = parseMintData(data, authPubkey.cursor + 1);
    if (mint === null || decimals > 9) {
      return { ok: false, reason: decimals > 9 ? "DECIMALS_OUT_OF_RANGE" : "MALFORMED" };
    }
    return {
      ok: true,
      kind: "GENESIS",
      ticker: Buffer.from(ticker.bytes).toString("utf8"),
      tokenName: Buffer.from(tokenName.bytes).toString("utf8"),
      url: Buffer.from(url.bytes).toString("utf8"),
      authPubkey: hex(authPubkey.bytes),
      decimals,
      amounts: mint.amounts,
      numBatons: mint.numBatons
    };
  }
  if (name !== "MINT" && name !== "SEND") {
    return { ok: false, reason: "ACTION_NOT_ADMITTED" };
  }
  if (action.cursor + 32 > data.length) {
    return { ok: false, reason: "MALFORMED" };
  }
  const tokenId = reverseHex(data.subarray(action.cursor, action.cursor + 32));
  if (name === "MINT") {
    const mint = parseMintData(data, action.cursor + 32);
    if (mint === null) {
      return { ok: false, reason: "MALFORMED" };
    }
    return { ok: true, kind: "MINT", tokenId, amounts: mint.amounts, numBatons: mint.numBatons };
  }
  const countAt = action.cursor + 32;
  if (countAt >= data.length) {
    return { ok: false, reason: "MALFORMED" };
  }
  const count = data[countAt];
  let cursor = countAt + 1;
  if (count > 127) {
    return { ok: false, reason: "MALFORMED" };
  }
  const amounts = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 6 > data.length) {
      return { ok: false, reason: "MALFORMED" };
    }
    amounts.push(readU48(data, cursor));
    cursor += 6;
  }
  if (cursor !== data.length) {
    return { ok: false, reason: "MALFORMED" };
  }
  return { ok: true, kind: "SEND", tokenId, amounts, numBatons: 0 };
}

function parseTmm(data) {
  if (data.length < 4 || hex(data.subarray(0, 4)) !== TMM_LOKAD) {
    return { recognized: false };
  }
  const reasons = [];
  if (data.length !== 39) {
    reasons.push("WRONG_LENGTH");
  }
  const version = data.length > 4 ? data[4] : null;
  const event = data.length > 5 ? data[5] : null;
  const author = data.length > 6 ? data[6] : null;
  const target = data.length >= 39 ? hex(data.subarray(7, 39)) : null;
  if (version !== 0x02) {
    reasons.push("WRONG_VERSION");
  }
  if (event !== 0x05) {
    reasons.push("WRONG_EVENT");
  }
  if (target === null) {
    reasons.push("TRUNCATED_TARGET");
  }
  return {
    recognized: true,
    structurallyValid: reasons.length === 0,
    reasons,
    author,
    target
  };
}

function colorPlan(section, outputCount) {
  const declared = [];
  for (let index = 0; index < section.amounts.length; index += 1) {
    declared.push({ outputIndex: index + 1, atoms: section.amounts[index], baton: false });
  }
  for (let index = 0; index < section.numBatons; index += 1) {
    declared.push({
      outputIndex: section.amounts.length + 1 + index,
      atoms: 0n,
      baton: true
    });
  }
  const highest = declared.reduce((max, entry) => Math.max(max, entry.outputIndex), 0);
  if (highest >= outputCount) {
    return { ok: false, reason: "INSUFFICIENT_OUTPUTS", declared, colored: [] };
  }
  const seen = new Set();
  const colored = [];
  for (const entry of declared) {
    if (!entry.baton && entry.atoms === 0n) {
      continue;
    }
    if (seen.has(entry.outputIndex)) {
      return { ok: false, reason: "OUTPUT_OVERLAP", declared, colored: [] };
    }
    seen.add(entry.outputIndex);
    colored.push(entry);
  }
  return { ok: true, declared, colored };
}

function ownerOf(script) {
  const hash = p2pkhHash(toHex(script));
  return hash === null ? null : toHex(hash);
}

function finishEntry(partial) {
  return {
    realRmzGenealogy: "NOT_DEMONSTRATED",
    consensus: "VALID",
    applied: false,
    ...partial,
    issuedAtoms: atoms(partial.issuedAtoms),
    inputAtoms: atoms(partial.inputAtoms),
    outputAtoms: atoms(partial.outputAtoms),
    coloredOutputs: partial.coloredOutputs.map((entry) => ({
      ...entry,
      atoms: atoms(entry.atoms)
    })),
    consumed: partial.consumed.map((entry) => ({
      ...entry,
      atoms: atoms(entry.atoms)
    })),
    declaredAtomMap: partial.declaredAtomMap.map((entry) => ({
      ...entry,
      atoms: atoms(entry.atoms)
    }))
  };
}

function emptyNumbers() {
  return {
    issuedAtoms: 0n,
    inputAtoms: 0n,
    outputAtoms: 0n,
    batonsConsumed: 0,
    batonsCreated: 0,
    coloredOutputs: [],
    consumed: [],
    declaredAtomMap: [],
    decimals: null,
    ticker: null,
    tokenId: null,
    genesisReference: null,
    conservation: "NOT_APPLICABLE"
  };
}

/**
 * @param {{ transactions: Array<{ id: string, rawTransactionHex: string, inputs: Array<{ externalUncolored?: boolean }> }> }} document
 */
export function evaluateChain(document) {
  const utxos = new Map();
  const genesis = new Map();
  const byId = {};

  const reject = (record, txid, reasons, extra = {}) => {
    byId[record.id] = finishEntry({
      id: record.id,
      txid,
      ancestry: extra.ancestry ?? "INVALID",
      reasons,
      ...emptyNumbers(),
      ...extra,
      issuedAtoms: extra.issuedAtoms ?? 0n,
      inputAtoms: extra.inputAtoms ?? 0n,
      outputAtoms: extra.outputAtoms ?? 0n
    });
  };

  const referenced = (tx) => {
    const consumed = [];
    for (const input of tx.inputs) {
      const utxo = utxos.get(`${input.prevTxid}:${input.outIdx}`);
      if (utxo !== undefined) {
        consumed.push(consumedView(utxo));
      }
    }
    return consumed;
  };

  const consumeKnown = (tx) => {
    const consumed = [];
    const seen = new Set();
    for (const input of tx.inputs) {
      const key = `${input.prevTxid}:${input.outIdx}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const utxo = utxos.get(key);
      if (utxo === undefined) {
        continue;
      }
      utxo.spent = true;
      consumed.push(consumedView(utxo));
    }
    return consumed;
  };

  const signaturesHold = (record) => {
    let tx;
    try {
      tx = parseTx(record.rawTransactionHex);
    } catch {
      return false;
    }
    if (!Array.isArray(record.inputs) || record.inputs.length !== tx.inputs.length) {
      return false;
    }
    for (let index = 0; index < tx.inputs.length; index += 1) {
      const prevout = record.inputs[index];
      if (prevout?.outputScriptHex == null || prevout.prevoutSats == null) {
        return false;
      }
      try {
        if (!inputUnlockMatchesPrevout(record.rawTransactionHex, record.inputs, index, "schnorr")) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  };

  for (const record of document.transactions) {
    const tx = parseTx(record.rawTransactionHex);
    const txid = txidOf(record.rawTransactionHex);
    const outpointKeys = tx.inputs.map((input) => `${input.prevTxid}:${input.outIdx}`);
    const duplicatePrevout = outpointKeys.some((key, index) => outpointKeys.indexOf(key) !== index);
    const spentConflict = tx.inputs.some((input) => {
      const utxo = utxos.get(`${input.prevTxid}:${input.outIdx}`);
      return utxo !== undefined && utxo.spent === true;
    });
    if (duplicatePrevout || !signaturesHold(record) || spentConflict) {
      const reason = duplicatePrevout ? "DUPLICATE_PREVOUT" : spentConflict ? "ALREADY_SPENT" : "CONSENSUS_INVALID";
      reject(record, txid, [reason], {
        consensus: "INVALID",
        applied: false,
        consumed: referenced(tx)
      });
      continue;
    }
    const script = tx.outputs[0]?.script;
    const parsedPushes = script === undefined ? { error: "NOT_EMPP", pushes: [] } : readPushes(script);
    if (parsedPushes.error !== null) {
      reject(record, txid, [parsedPushes.error], { consumed: consumeKnown(tx) });
      continue;
    }
    const alpPushes = parsedPushes.pushes.filter((push) => hex(push.subarray(0, 4)) === ALP_LOKAD);
    if (alpPushes.length !== 1) {
      reject(record, txid, [alpPushes.length === 0 ? "ALP_ABSENT" : "MULTIPLE_ALP_SECTIONS"], {
        consumed: consumeKnown(tx)
      });
      continue;
    }
    const section = parseAlpSection(alpPushes[0]);
    if (!section.ok) {
      reject(record, txid, [section.reason], { consumed: consumeKnown(tx) });
      continue;
    }
    if (section.kind === "GENESIS" && parsedPushes.pushes[0] !== alpPushes[0]) {
      reject(record, txid, ["GENESIS_NOT_FIRST"], { consumed: consumeKnown(tx) });
      continue;
    }
    const plan = colorPlan(section, tx.outputs.length);
    if (!plan.ok) {
      reject(record, txid, [plan.reason], { consumed: consumeKnown(tx) });
      continue;
    }

    const resolved = [];
    let unresolved = false;
    let alreadySpent = false;
    let repeatedPrevout = false;
    const seenKeys = new Set();
    for (let index = 0; index < tx.inputs.length; index += 1) {
      const input = tx.inputs[index];
      const key = `${input.prevTxid}:${input.outIdx}`;
      if (seenKeys.has(key)) {
        repeatedPrevout = true;
      }
      seenKeys.add(key);
      const utxo = utxos.get(key);
      if (utxo === undefined) {
        if (record.inputs[index]?.externalUncolored === true) {
          resolved.push({
            key: null,
            external: true,
            tokenId: null,
            atoms: 0n,
            baton: false,
            owner: ownerOf(Buffer.from(record.inputs[index].outputScriptHex, "hex"))
          });
          continue;
        }
        unresolved = true;
        continue;
      }
      if (utxo.spent) {
        alreadySpent = true;
      }
      resolved.push({ key, external: false, ...utxo });
    }
    if (repeatedPrevout || unresolved || alreadySpent) {
      if (!repeatedPrevout && !alreadySpent) {
        for (const input of resolved) {
          if (input.key !== null) {
            utxos.get(input.key).spent = true;
          }
        }
      }
      const reason = repeatedPrevout
        ? "DUPLICATE_PREVOUT"
        : unresolved
          ? "PREVOUT_NOT_IN_CHAIN"
          : "ALREADY_SPENT";
      reject(record, txid, [reason], {
        consensus: repeatedPrevout || alreadySpent ? "INVALID" : "VALID",
        applied: false,
        consumed: resolved.filter((input) => !input.external).map(consumedView)
      });
      continue;
    }

    const tokenId = section.kind === "GENESIS" ? txid : section.tokenId;
    if (tokenId === RMZ_TOKEN_ID) {
      for (const input of resolved) {
        if (input.key !== null) {
          utxos.get(input.key).spent = true;
        }
      }
      reject(record, txid, ["PUBLIC_RMZ_GENESIS_ABSENT"], {
        ancestry: "NOT_DEMONSTRATED",
        tokenId,
        consumed: resolved.filter((input) => !input.external).map(consumedView)
      });
      continue;
    }

    const parent = section.kind === "GENESIS" ? null : genesis.get(tokenId);
    if (section.kind !== "GENESIS" && parent === undefined) {
      for (const input of resolved) {
        if (input.key !== null) {
          utxos.get(input.key).spent = true;
        }
      }
      reject(record, txid, ["GENESIS_NOT_IN_CHAIN"], {
        tokenId,
        consumed: resolved.filter((input) => !input.external).map(consumedView)
      });
      continue;
    }

    const sameToken = resolved.filter((input) => !input.external && input.tokenId === tokenId);
    const foreign = resolved.filter((input) => !input.external && input.tokenId !== null && input.tokenId !== tokenId);
    const fungible = sameToken.filter((input) => !input.baton);
    const batons = sameToken.filter((input) => input.baton);
    const inputAtoms = fungible.reduce((sum, input) => sum + input.atoms, 0n);
    const outputAtoms = plan.colored.filter((entry) => !entry.baton).reduce((sum, entry) => sum + entry.atoms, 0n);
    const reasons = [];
    if (foreign.length > 0) {
      reasons.push("FOREIGN_TOKEN");
    }
    if (section.kind === "GENESIS") {
      if (sameToken.length > 0 || foreign.length > 0) {
        reasons.push("GENESIS_SPENDS_COLORED_INPUT");
      }
      if (txid !== tokenId) {
        reasons.push("GENESIS_REFERENCE_MISMATCH");
      }
    } else if (section.kind === "MINT") {
      if (batons.length < 1) {
        reasons.push("MINT_BATON_REQUIRED");
      }
      if (fungible.length > 0) {
        reasons.push("UNACCOUNTED_FUNGIBLE_INPUTS");
      }
    } else {
      if (batons.length > 0) {
        reasons.push("BATON_NOT_TRANSFERABLE");
      }
      if (foreign.length === 0 && outputAtoms > inputAtoms) {
        reasons.push("INFLATED");
      }
      if (foreign.length === 0 && outputAtoms < inputAtoms) {
        reasons.push("SHORT");
      }
      if (foreign.length > 0 && outputAtoms !== inputAtoms) {
        reasons.push("INFLATED");
      }
    }

    for (const input of resolved) {
      if (input.key !== null) {
        utxos.get(input.key).spent = true;
      }
    }
    if (reasons.length > 0) {
      reject(record, txid, reasons, {
        tokenId,
        genesisReference: section.kind === "GENESIS" ? txid : parent.txid,
        decimals: section.kind === "GENESIS" ? section.decimals : parent.decimals,
        ticker: section.kind === "GENESIS" ? section.ticker : parent.ticker,
        inputAtoms,
        outputAtoms,
        consumed: resolved.filter((input) => !input.external).map(consumedView),
        declaredAtomMap: plan.declared
      });
      continue;
    }

    const coloredOutputs = plan.colored.map((entry) => ({
      outputIndex: entry.outputIndex,
      atoms: entry.atoms,
      baton: entry.baton,
      tokenId,
      owner: ownerOf(tx.outputs[entry.outputIndex].script)
    }));
    for (let index = 0; index < tx.outputs.length; index += 1) {
      const colored = coloredOutputs.find((entry) => entry.outputIndex === index) ?? null;
      utxos.set(`${txid}:${index}`, {
        txid,
        outIdx: index,
        tokenId: colored === null ? null : tokenId,
        atoms: colored === null ? 0n : colored.atoms,
        baton: colored?.baton ?? false,
        owner: ownerOf(tx.outputs[index].script),
        spent: false
      });
    }
    if (section.kind === "GENESIS") {
      genesis.set(tokenId, {
        txid,
        decimals: section.decimals,
        ticker: section.ticker,
        tokenName: section.tokenName,
        authPubkey: section.authPubkey
      });
    }
    const issuedAtoms = section.kind === "SEND" ? 0n : outputAtoms;
    byId[record.id] = finishEntry({
      id: record.id,
      txid,
      ancestry: "LABORATORY_VALID",
      consensus: "VALID",
      applied: true,
      reasons: [],
      tokenId,
      genesisReference: section.kind === "GENESIS" ? txid : parent.txid,
      decimals: section.kind === "GENESIS" ? section.decimals : parent.decimals,
      ticker: section.kind === "GENESIS" ? section.ticker : parent.ticker,
      issuedAtoms,
      inputAtoms,
      outputAtoms,
      batonsConsumed: batons.length,
      batonsCreated: plan.colored.filter((entry) => entry.baton).length,
      conservation: section.kind === "SEND" ? "EXACT" : "ISSUANCE",
      coloredOutputs,
      consumed: resolved.filter((input) => !input.external).map(consumedView),
      declaredAtomMap: plan.declared
    });
  }

  const supply = {};
  for (const entry of Object.values(byId)) {
    if (entry.ancestry !== "LABORATORY_VALID" || entry.tokenId === null) {
      continue;
    }
    const current = BigInt(supply[entry.tokenId] ?? "0");
    if (entry.conservation === "ISSUANCE") {
      supply[entry.tokenId] = atoms(current + BigInt(entry.issuedAtoms));
    } else if (supply[entry.tokenId] === undefined) {
      supply[entry.tokenId] = "0";
    }
  }
  return { byId, supply, genesis: Object.fromEntries(genesis) };
}

function consumedView(input) {
  return {
    txid: input.txid,
    outIdx: input.outIdx,
    tokenId: input.tokenId,
    atoms: input.atoms,
    baton: input.baton,
    owner: input.owner
  };
}

function inspectContainer(rawTransactionHex, authorInputIndex, targetTxid) {
  const tx = parseTx(rawTransactionHex);
  const script = tx.outputs[0]?.script;
  const reasons = [];
  if (script === undefined || script.length > BYTE_BUDGET) {
    reasons.push(script === undefined ? "NOT_EMPP" : "BYTE_BUDGET_EXCEEDED");
  }
  const parsed = script === undefined ? { error: "NOT_EMPP", pushes: [] } : readPushes(script);
  if (parsed.error !== null) {
    reasons.push(parsed.error);
  }
  const alp = [];
  const tmm = [];
  parsed.pushes.forEach((push, index) => {
    if (hex(push.subarray(0, 4)) === ALP_LOKAD) {
      alp.push({ index, push });
    } else if (hex(push.subarray(0, 4)) === TMM_LOKAD) {
      tmm.push({ index, push });
    } else {
      reasons.push("EXTRA_PUSH");
    }
  });
  if (alp.length !== 1) {
    reasons.push(alp.length === 0 ? "ALP_ABSENT" : "ALP_COUNT");
  }
  if (tmm.length !== 1) {
    reasons.push(tmm.length === 0 ? "TMM_ABSENT" : "TMM_COUNT");
  }
  let tmmStructurallyValid = false;
  let sectionTokenId = null;
  let structurallyValidSend = false;
  if (alp.length === 1) {
    const section = parseAlpSection(alp[0].push);
    structurallyValidSend = section.ok && section.kind === "SEND";
    sectionTokenId = section.ok && section.kind !== "GENESIS" ? section.tokenId : null;
    if (!structurallyValidSend) {
      reasons.push("NOT_A_SEND");
    }
  }
  if (tmm.length === 1) {
    const parsedTmm = parseTmm(tmm[0].push);
    tmmStructurallyValid = parsedTmm.structurallyValid;
    reasons.push(...parsedTmm.reasons);
    if (parsedTmm.structurallyValid && parsedTmm.author !== authorInputIndex) {
      reasons.push("AUTHOR_INDEX_MISMATCH");
      tmmStructurallyValid = false;
    }
    if (parsedTmm.structurallyValid && parsedTmm.target !== targetTxid) {
      reasons.push("TARGET_MISMATCH");
      tmmStructurallyValid = false;
    }
  }
  if (alp.length === 1 && tmm.length === 1 && alp[0].index > tmm[0].index) {
    reasons.push("ORDER_MISMATCH");
  }
  return {
    valid: reasons.length === 0,
    reasons,
    tmmStructurallyValid,
    sectionTokenId,
    structurallyValidSend
  };
}

function attributeAmount(chainEntry, rawTransactionHex, recipient, sectionTokenId, authorOwner) {
  const tx = parseTx(rawTransactionHex);
  const declared = chainEntry.declaredAtomMap.map((entry) => ({
    ...entry,
    atoms: BigInt(entry.atoms)
  }));
  let attributable = 0n;
  let naive = 0n;
  let zeroSlot = false;
  for (const entry of declared) {
    if (entry.baton) {
      continue;
    }
    const owner = ownerOf(tx.outputs[entry.outputIndex].script);
    if (owner === recipient) {
      naive += entry.atoms;
      if (entry.atoms === 0n) {
        zeroSlot = true;
      }
    }
  }
  const funding = chainEntry.consumed.filter((input) => input.tokenId === sectionTokenId && input.baton === false && BigInt(input.atoms) > 0n);
  const owners = new Set(funding.map((input) => input.owner));
  const soleOwner = owners.size === 1 ? [...owners][0] : null;
  let fundingState = "UNATTRIBUTED";
  if (funding.length === 0 || soleOwner === null || soleOwner !== authorOwner) {
    fundingState = "AMBIGUOUS";
  } else if (soleOwner === recipient) {
    fundingState = "SELF";
  } else {
    fundingState = "SINGLE_OWNER";
    attributable = naive;
  }
  return {
    fundingState,
    attributableAtoms: atoms(attributable),
    naiveRecipientAtoms: atoms(naive),
    zeroSlot,
    recipientSats: tx.outputs
      .filter((output) => ownerOf(output.script) === recipient)
      .reduce((sum, output) => sum + output.sats, 0n)
      .toString()
  };
}

/**
 * @param {object} document
 * @param {ReturnType<typeof evaluateChain>} chain
 * @param {object} tip
 */
export function attributeTip(document, chain, tip) {
  const record = document.transactions.find((item) => item.id === tip.transactionId);
  const chainEntry = chain.byId[tip.transactionId];
  const container = inspectContainer(record.rawTransactionHex, tip.authorInputIndex, document.targetTxid);
  const author = classifyAuthor({
    rawTransactionHex: record.rawTransactionHex,
    authorInputIndex: tip.authorInputIndex,
    signatureAlgorithm: tip.signatureAlgorithm,
    inputs: record.inputs
  });
  const profile = chain.genesis[chainEntry.tokenId] ?? null;
  const decimalMismatch = profile !== null && profile.decimals !== tip.requiredDecimals;
  let alpChain = chainEntry.ancestry;
  const alpChainReasons = [...chainEntry.reasons];
  if (decimalMismatch) {
    alpChain = "INVALID";
    alpChainReasons.push("DECIMAL_MISMATCH");
  }
  const designated = record.inputs[tip.authorInputIndex];
  const authorOwner = designated?.outputScriptHex === undefined
    ? null
    : ownerOf(Buffer.from(designated.outputScriptHex, "hex"));
  const amount = attributeAmount(
    chainEntry,
    record.rawTransactionHex,
    tip.recipient,
    chainEntry.tokenId,
    authorOwner
  );
  const layers = {
    container: container.valid ? "VALID" : "INVALID",
    containerReasons: container.reasons,
    alpChain,
    alpChainReasons,
    authorship: author.valid ? "LAB_VALID" : "INVALID",
    authorshipStage: author.stage,
    authorshipError: author.errorCode,
    attributableAtoms: amount.attributableAtoms,
    naiveRecipientAtoms: amount.naiveRecipientAtoms,
    confirmation: "NOT_DEMONSTRATED",
    settlement: "NOT_DEMONSTRATED"
  };
  let receiptState = "PENDING";
  if (!container.valid) {
    receiptState = container.reasons.includes("TARGET_MISMATCH") || container.reasons.includes("TMM_ABSENT")
      ? "INVALID_TARGET"
      : "INVALID_ASSET";
  } else if (!author.valid) {
    receiptState = "INVALID_AUTHOR";
  } else if (alpChain !== "LABORATORY_VALID") {
    receiptState = "INVALID_ASSET";
  } else if (amount.fundingState === "AMBIGUOUS") {
    receiptState = "AMBIGUOUS_TIP_FUNDING";
    layers.attributableAtoms = "0";
  } else if (amount.fundingState === "SELF") {
    receiptState = "SELF_TIP_UNCREDITED";
    layers.attributableAtoms = "0";
  } else if (layers.attributableAtoms === "0") {
    receiptState = amount.zeroSlot ? "NO_VALUE_TRANSFER" : "INVALID_RECIPIENT";
  }
  if (receiptState !== "PENDING") {
    layers.attributableAtoms = "0";
  }
  const laboratoryTransfer = receiptState === "PENDING" ? "LABORATORY_ATTRIBUTED" : "REJECTED";
  return {
    id: tip.id,
    transactionId: tip.transactionId,
    layers,
    receiptState,
    laboratoryTransfer,
    tmmStructurallyValid: container.tmmStructurallyValid,
    sectionTokenId: container.sectionTokenId,
    realRmzTip: false,
    realRmzGenealogy: "NOT_DEMONSTRATED",
    targetMessage: "NOT_DEMONSTRATED",
    socialEventCredited: false,
    observedDecimals: chainEntry.decimals,
    requiredDecimals: tip.requiredDecimals,
    recipientSats: amount.recipientSats,
    settlement: "NOT_DEMONSTRATED"
  };
}

function evaluateClaim(chain, claim) {
  const parent = chain.genesis[claim.tokenId];
  const matches = parent !== undefined && parent.decimals === claim.claimedDecimals;
  return {
    id: claim.id,
    tokenId: claim.tokenId,
    claimedDecimals: claim.claimedDecimals,
    observedDecimals: parent === undefined ? null : parent.decimals,
    result: parent === undefined ? "GENESIS_NOT_IN_CHAIN" : matches ? "MATCH" : "DECIMAL_MISMATCH",
    realRmzGenealogy: "NOT_DEMONSTRATED",
    settlesRealRmzTip: false
  };
}

/**
 * @param {object} document
 */
export function evaluateLaboratory(document) {
  const chain = evaluateChain(document);
  return {
    chain: {
      byId: chain.byId,
      supply: chain.supply
    },
    tips: document.tips.map((tip) => attributeTip(document, chain, tip)),
    claims: document.claims.map((claim) => evaluateClaim(chain, claim))
  };
}

export { RMZ_TOKEN_ID };
