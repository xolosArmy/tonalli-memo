import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { TextDecoder } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const data = JSON.parse(readFileSync(new URL('../fixtures/rfc0001_vectors.json', import.meta.url), 'utf8'));
const target = data.targetTxid;
function strictUtf8(bytes) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; }
  catch { return false; }
}
function parseSynthetic(scriptHex) {
  if (typeof scriptHex !== 'string' || !/^(?:[0-9a-f]{2})+$/u.test(scriptHex)) return 'INVALID_FORMAT';
  const s = Uint8Array.from(scriptHex.match(/../gu).map(x => Number.parseInt(x, 16)));
  if (s.length < 9 || s[0] !== 0x6a || s[1] !== 4 || Array.from(s.slice(2, 6)).join(',') !== '84,77,77,0') return 'INVALID_FORMAT';
  let at = 6, len;
  if (s[at] === 0x4c) { len = s[at + 1]; at += 2; if (len <= 75) return 'NONMINIMAL_PUSH'; }
  else if (s[at] >= 1 && s[at] <= 75) { len = s[at]; at += 1; }
  else return 'INVALID_FORMAT';
  if (len !== s.length - at) return 'INVALID_FORMAT';
  if (len < 3) return 'INVALID_FORMAT';
  const env = s.slice(at), version = env[0], type = env[1], eventData = env.slice(3);
  if (version === 1) return 'CORE_V1_DELEGATED'; // no v1 reinterpretation in this harness
  if (version !== 2) return 'UNSUPPORTED_VERSION';
  if (![2, 3, 4, 5].includes(type)) return 'UNSUPPORTED_EVENT_TYPE';
  if (type === 2) {
    if (eventData.length > 212 || len > 215 || s.length > 223) return 'PAYLOAD_TOO_LARGE';
    if (eventData.length < 32) return 'INVALID_EVENT_DATA_LENGTH';
    if (eventData.length === 32) return 'EMPTY_REPLY';
    if (!strictUtf8(eventData.slice(32))) return 'INVALID_UTF8';
    return 'VALID_FORMAT';
  }
  const need = type === 5 ? 32 : 33;
  if (eventData.length !== need) return 'INVALID_EVENT_DATA_LENGTH';
  if (type !== 5 && eventData[32] !== 1) return 'UNSUPPORTED_REACTION_KIND';
  return 'VALID_FORMAT';
}
function evaluateContext(v) {
  if (v.kind === 'target') {
    if (v.childTxid === v.targetTxid) return 'REFERENCE_CYCLE';
    const state = v.parents[v.targetTxid];
    return state === undefined ? 'PARENT_PENDING'
      : ['POST_VERIFIED', 'REPLY_VERIFIED'].includes(state) ? 'PARENT_VERIFIED' : 'INVALID_PARENT';
  }
  if (v.kind === 'reactions') {
    const active = new Map();
    for (const event of v.events) active.set(event.author, event.action === 'REACTION');
    return [...active.values()].filter(Boolean).length;
  }
  if (v.kind === 'authorMock') {
    if (v.authorInputIndex < 0 || v.authorInputIndex >= v.inputCount) return 'AUTHOR_INPUT_OUT_OF_RANGE';
    if (v.prevoutOwner !== v.pubkeyOwner) return 'INVALID_AUTHOR_SCRIPT_SIG';
    if (!v.signatureOk) return 'INVALID_AUTHOR_SIGNATURE';
    return 'MOCK_AUTHOR_MATCH_ONLY';
  }
  if (v.kind === 'tipXecMock') {
    if (v.tipper === v.recipient) return { status: 'SELF_TIP_UNCREDITED', creditedSats: 0 };
    if (v.inputs.some(input => input.owner !== v.tipper)) return { status: 'AMBIGUOUS_TIP_FUNDING', creditedSats: 0 };
    const sats = v.outputs.filter(output => output.owner === v.recipient).reduce((sum, output) => sum + output.sats, 0);
    return sats > 0 ? { status: 'MOCK_TIP_ELIGIBLE', creditedSats: sats }
      : { status: 'INVALID_RECIPIENT', creditedSats: 0 };
  }
  throw new Error('Unknown mock case: ' + v.kind);
}

test('fixture manifest does not represent signed or on-chain validation', () => {
  assert.equal(data.schema, 'rfc0001-synthetic-vectors-v1');
  assert.equal(data.network, 'synthetic-no-broadcast');
  assert.match(data.limitations.join(' '), /NOT cryptographic|No signed transaction/u);
  assert.match(target, /^[0-9a-f]{64}$/u);
});
for (const vector of data.structural) {
  test('synthetic OP_RETURN: ' + vector.id, () => {
    assert.equal(parseSynthetic(vector.scriptHex), vector.expect);
  });
}
for (const vector of data.contextMocks) {
  test('synthetic context mock: ' + vector.id, () => {
    assert.deepEqual(evaluateContext(vector), vector.expect);
  });
}
test('explicit byte lengths at proposed limits', () => {
  for (const [id, n] of Object.entries({ 'reply-one-byte': 43, 'reply-180-bytes': 223,
    'reply-181-bytes': 224, 'reaction-like': 43, 'reaction-unlike': 43, 'tip-xec': 42 })) {
    const vector = data.structural.find(v => v.id === id);
    assert.ok(vector);
    assert.equal(vector.scriptHex.length / 2, n, id);
  }
});
test('synthetic-only validation is isolated from the canonical TM1 production exports', () => {
  assert.equal(parseSynthetic(data.structural.find(v => v.id === 'v1-post-still-valid').scriptHex), 'CORE_V1_DELEGATED');
});
