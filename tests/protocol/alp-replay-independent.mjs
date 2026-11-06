import { applyRecord, attributeTip, checkpointChain, openChain, projectChain } from "./alp-ancestry-independent.mjs";

/**
 * Laboratory replay of a synthetic ALP chain.
 * A checkpoint is a local copy of that state. It is not a network reorg,
 * a confirmation, or a settled tip.
 */

/**
 * @param {Array<{ id: string }>} transactions
 * @param {string[]} ids
 */
export function recordsById(transactions, ids) {
  return ids.map((id) => {
    const found = transactions.find((record) => record.id === id);
    if (found === undefined) {
      throw new Error(`Missing laboratory transaction ${id}.`);
    }
    return found;
  });
}

/**
 * @param {{ targetTxid: string, tips: object[] }} fixture
 * @param {object[]} records
 */
export function laboratoryDocument(fixture, records) {
  return {
    transactions: records,
    targetTxid: fixture.targetTxid,
    tips: fixture.tips,
    claims: []
  };
}

/**
 * @param {ReturnType<typeof openChain>} state
 * @param {object[]} records
 */
export function applyRecords(state, records) {
  for (const record of records) {
    applyRecord(state, record);
  }
  return state;
}

/**
 * @param {object[]} records
 */
export function replayFromScratch(records) {
  return applyRecords(openChain(), records);
}

/**
 * @param {ReturnType<typeof openChain>} checkpoint
 * @param {object[]} records
 */
export function replayFromCheckpoint(checkpoint, records) {
  return applyRecords(checkpointChain(checkpoint), records);
}

function byText(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/**
 * Comparable laboratory state. Receipts for transactions outside the active
 * chain are withdrawn. That status is not a public receipt code.
 * @param {ReturnType<typeof openChain>} state
 * @param {{ transactions: object[], targetTxid: string, tips: object[] }} document
 */
export function logicalView(state, document) {
  const chain = projectChain(state);
  const utxos = [...state.utxos.entries()]
    .sort((left, right) => byText(left[0], right[0]))
    .map(([key, utxo]) => ({
      key,
      txid: utxo.txid,
      outIdx: utxo.outIdx,
      tokenId: utxo.tokenId,
      atoms: utxo.atoms.toString(),
      baton: utxo.baton,
      owner: utxo.owner,
      spent: utxo.spent
    }));
  const entries = Object.values(state.byId)
    .map((entry) => ({
      id: entry.id,
      txid: entry.txid,
      ancestry: entry.ancestry,
      consensus: entry.consensus,
      applied: entry.applied,
      reasons: entry.reasons,
      issuedAtoms: entry.issuedAtoms,
      inputAtoms: entry.inputAtoms,
      outputAtoms: entry.outputAtoms,
      prevoutSources: entry.prevoutSources
    }))
    .sort((left, right) => byText(left.id, right.id));
  const supply = Object.fromEntries(
    Object.entries(chain.supply).sort((left, right) => byText(left[0], right[0]))
  );
  const receipts = document.tips.map((tip) => {
    if (chain.byId[tip.transactionId] === undefined) {
      return {
        id: tip.id,
        transactionId: tip.transactionId,
        status: "NOT_ON_ACTIVE_CHAIN",
        attributableAtoms: "0",
        confirmation: "NOT_DEMONSTRATED",
        settlement: "NOT_DEMONSTRATED",
        realRmzTip: false,
        socialEventCredited: false
      };
    }
    const attributed = attributeTip(document, chain, tip);
    return {
      id: attributed.id,
      transactionId: attributed.transactionId,
      status: "ACTIVE",
      receiptState: attributed.receiptState,
      laboratoryTransfer: attributed.laboratoryTransfer,
      authorship: attributed.layers.authorship,
      attributableAtoms: attributed.layers.attributableAtoms,
      confirmation: attributed.layers.confirmation,
      settlement: attributed.layers.settlement,
      realRmzTip: attributed.realRmzTip,
      socialEventCredited: attributed.socialEventCredited
    };
  }).sort((left, right) => byText(left.id, right.id));
  return { utxos, entries, supply, receipts };
}

/**
 * @param {ReturnType<typeof logicalView>} view
 */
export function attributableSum(view) {
  return view.receipts
    .reduce((sum, receipt) => sum + BigInt(receipt.attributableAtoms), 0n)
    .toString();
}
