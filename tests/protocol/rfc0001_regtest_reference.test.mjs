import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const data = JSON.parse(readFileSync(new URL('../fixtures/rfc0001_regtest_reference.json', import.meta.url), 'utf8'));
const LOKAD_PREFIX = '6a04544d4d00';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest();
}

function hash160(bytes) {
  return createHash('ripemd160').update(sha256(bytes)).digest('hex');
}

function displayTxid(raw) {
  return Buffer.from(sha256(sha256(raw))).reverse().toString('hex');
}

function readVarint(buf, at) {
  const first = buf[at];
  if (first < 0xfd) return { value: first, next: at + 1 };
  if (first === 0xfd) return { value: buf.readUInt16LE(at + 1), next: at + 3 };
  if (first === 0xfe) return { value: buf.readUInt32LE(at + 1), next: at + 5 };
  throw new Error('unsupported varint');
}

function parseTx(hex) {
  const buf = Buffer.from(hex, 'hex');
  let at = 4;
  const vinCount = readVarint(buf, at);
  at = vinCount.next;
  const inputs = [];
  for (let i = 0; i < vinCount.value; i += 1) {
    const internal = buf.subarray(at, at + 32);
    const prevTxid = Buffer.from(internal).reverse().toString('hex');
    at += 32;
    const vout = buf.readUInt32LE(at);
    at += 4;
    const scriptLen = readVarint(buf, at);
    at = scriptLen.next;
    const script = Buffer.from(buf.subarray(at, at + scriptLen.value));
    at += scriptLen.value;
    at += 4;
    inputs.push({ prevTxid, vout, script, internalPrevHex: Buffer.from(internal).toString('hex') });
  }
  const voutCount = readVarint(buf, at);
  at = voutCount.next;
  const outputs = [];
  for (let i = 0; i < voutCount.value; i += 1) {
    at += 8;
    const scriptLen = readVarint(buf, at);
    at = scriptLen.next;
    const script = buf.subarray(at, at + scriptLen.value).toString('hex');
    at += scriptLen.value;
    outputs.push({ n: i, script });
  }
  assert.equal(at + 4, buf.length);
  return { txid: displayTxid(buf), inputs, outputs };
}

function tm1Candidates(outputs) {
  return outputs.filter((output) => output.script.startsWith(LOKAD_PREFIX));
}

function classifyCardinality(outputs) {
  const found = tm1Candidates(outputs);
  if (found.length === 0) return { status: 'NO_TM1_CANDIDATE', candidate: null };
  if (found.length > 1) return { status: 'MULTIPLE_MEMOS', candidate: null };
  return { status: 'ONE_CANDIDATE', candidate: found[0] };
}

function canonicalParentBytes(txid) {
  if (typeof txid !== 'string' || !/^[0-9a-f]{64}$/u.test(txid)) return null;
  return txid;
}

function reverseHex(hex) {
  return hex.match(/../gu).reverse().join('');
}

function envelope(script) {
  assert.equal(script.slice(0, LOKAD_PREFIX.length), LOKAD_PREFIX);
  const push = Number.parseInt(script.slice(12, 14), 16);
  assert.ok(push >= 1 && push <= 75);
  const body = script.slice(14);
  assert.equal(body.length, push * 2);
  return Buffer.from(body, 'hex');
}

function authorFromScriptSig(script) {
  assert.equal(script[0], 0x47);
  const sighash = script[1 + 70];
  assert.equal(script[1 + 71], 0x21);
  const pubkey = script.subarray(1 + 72, 1 + 72 + 33);
  return { sighash: sighash.toString(16), pubkey: pubkey.toString('hex'), hash160: hash160(pubkey) };
}

test('regtest reference stays separate from synthetic vectors and the production parser', () => {
  assert.equal(data.schema, 'rfc0001-regtest-reference-v1');
  assert.equal(data.network, 'regtest');
  assert.equal(data.s0, 'OPEN');
  assert.equal(data.s1, 'NOT_AUTHORIZED');
  assert.equal(data.proposalStatus, 'PROPOSED — NOT RATIFIED');
  const imports = readFileSync(new URL('./rfc0001_regtest_reference.test.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('import '));
  assert.deepEqual(imports, [
    "import { createHash } from 'node:crypto';",
    "import { readFileSync } from 'node:fs';",
    "import { URL } from 'node:url';",
    "import { Buffer } from 'node:buffer';",
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';"
  ]);
  const synthetic = JSON.parse(readFileSync(new URL('../fixtures/rfc0001_vectors.json', import.meta.url), 'utf8'));
  assert.equal(synthetic.schema, 'rfc0001-synthetic-vectors-v1');
  assert.equal(synthetic.network, 'synthetic-no-broadcast');
});

test('fixed regtest bytes reproduce the POST and REPLY txids', () => {
  const post = parseTx(data.post.raw);
  const reply = parseTx(data.reply.raw);
  assert.equal(post.txid, data.post.txid);
  assert.equal(reply.txid, data.reply.txid);
  assert.equal(post.outputs.length, 2);
  assert.equal(reply.outputs.length, 2);
  assert.equal(data.post.height, 103);
  assert.equal(data.reply.height, 104);
  assert.equal(data.post.blockHash, '0a2c875fd169f22f301dbb5ad1953bdc51cd3541dafea5199cebb30a77a87d17');
  assert.equal(data.reply.blockHash, '6291e6097625d93b2f4a8da7ffeca8e545e97c6372544750c7698bf952581915');
});

test('display-order parent bytes, authorship and spent output match the raw transactions', () => {
  const post = parseTx(data.post.raw);
  const reply = parseTx(data.reply.raw);
  const postCandidate = classifyCardinality(post.outputs);
  const replyCandidate = classifyCardinality(reply.outputs);
  assert.equal(postCandidate.status, 'ONE_CANDIDATE');
  assert.equal(replyCandidate.status, 'ONE_CANDIDATE');
  assert.equal(postCandidate.candidate.n, 0);
  assert.equal(replyCandidate.candidate.n, 0);

  const postEnv = envelope(postCandidate.candidate.script);
  const replyEnv = envelope(replyCandidate.candidate.script);
  assert.equal(postEnv[0], 0x01);
  assert.equal(postEnv[1], 0x01);
  assert.equal(postEnv[2], data.author.authorInputIndex);
  assert.equal(replyEnv[0], 0x02);
  assert.equal(replyEnv[1], 0x02);
  assert.equal(replyEnv[2], data.author.authorInputIndex);
  const parent = replyEnv.subarray(3, 35).toString('hex');
  assert.equal(parent, data.reply.parentWireHex);
  assert.equal(parent, data.post.txid);
  assert.notEqual(reverseHex(parent), data.post.txid);

  assert.equal(reply.inputs.length, 1);
  assert.equal(reply.inputs[0].vout, data.spentBy.postOutput);
  assert.equal(reply.inputs[0].prevTxid, data.post.txid);
  assert.equal(data.spentBy.replyInput, 0);
  assert.equal(data.spentBy.replyTxid, data.reply.txid);
  assert.notEqual(reply.inputs[0].internalPrevHex, data.post.txid);
  assert.equal(reverseHex(reply.inputs[0].internalPrevHex), data.post.txid);

  for (const tx of [post, reply]) {
    const author = authorFromScriptSig(tx.inputs[0].script);
    assert.equal(author.sighash, data.author.sighash);
    assert.equal(author.pubkey, data.author.pubkey);
    assert.equal(author.hash160, data.author.hash160);
    assert.equal(tx.outputs[1].script, data.author.p2pkhScript);
  }
});

test('serialization accepts display order once and rejects reversal, size and non-canonical hex', () => {
  const txid = data.post.txid;
  assert.equal(canonicalParentBytes(txid), data.reply.parentWireHex);
  assert.notEqual(reverseHex(txid), data.reply.parentWireHex);
  assert.equal(canonicalParentBytes(reverseHex(txid)), reverseHex(txid));
  assert.equal(canonicalParentBytes(txid.slice(0, 62)), null);
  assert.equal(canonicalParentBytes(`${txid}00`), null);
  assert.equal(canonicalParentBytes(''), null);
  assert.equal(canonicalParentBytes(txid.toUpperCase()), null);
  assert.equal(canonicalParentBytes(`0x${txid}`), null);
  assert.equal(canonicalParentBytes(`${txid.slice(0, 8)} ${txid.slice(8)}`), null);
  assert.equal(canonicalParentBytes(txid.slice(0, 63)), null);
  assert.equal(canonicalParentBytes(txid.toUpperCase().toLowerCase()), data.reply.parentWireHex);
});

test('multiple TM1 candidates are rejected instead of selecting the first output', () => {
  const first = { n: 0, script: `${LOKAD_PREFIX}1c01010061` };
  const second = { n: 2, script: `${LOKAD_PREFIX}3d020200${'00'.repeat(32)}` };
  const unrelated = { n: 1, script: '6a046e6f6e65' };
  const multiple = classifyCardinality([first, second]);
  assert.equal(multiple.status, 'MULTIPLE_MEMOS');
  assert.equal(multiple.candidate, null);
  const withUnrelated = classifyCardinality([first, unrelated]);
  assert.equal(withUnrelated.status, 'ONE_CANDIDATE');
  assert.equal(withUnrelated.candidate, first);
});

test('M1.7.4 items that this pair does not prove stay listed as S0 pending', () => {
  const ids = data.s0Pending.map((item) => item.id);
  for (const id of [
    'M1.7.4-ALP-EMPP',
    'M1.7.4-TIP-SETTLEMENT',
    'M1.7.4-REACTIONS',
    'M1.7.4-REORG',
    'M1.7.4-AUTHOR-INDEX-BEYOND-0',
    'PRODUCTION-V2-PARSER',
    'S0-01',
    'S0-06',
    'S0-07',
    'S0-08',
    'S0-09',
    'S0-10'
  ]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(data.s0Pending.every((item) => item.reason.length > 20));
});
