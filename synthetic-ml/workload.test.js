'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { work, aggregate, validateClients } = require('./workload');
global.progress = () => {};

test('training reduces loss, is deterministic, and leaves broadcast weights unchanged', async () => {
  const initial = [0, 0, 0];
  const input = { client: 0, rows: 256, epochs: 32 };
  const a = await work(input, initial), b = await work(input, initial);
  assert.ok(a.lossAfter < a.lossBefore);
  assert.deepEqual(a.weights, b.weights);
  assert.deepEqual(initial, [0, 0, 0]);
  assert.equal(a.dataBytes, 256 * 3 * 8);
  await assert.rejects(work({ ...input, rows: 0 }, initial), /Invalid/);
  await assert.rejects(work({ kind: 'fail', client: 1 }), /Injected failure/);
});

test('resolved SDK results containing serialized worker exceptions are rejected', () => {
  assert.throws(() => validateClients([{ errorCode: 'EUNCAUGHT', name: 'Error', stack: 'Injected failure' }], [0]), /invalid/);
  assert.throws(() => validateClients([{ client: 0, errorCode: 'EUNCAUGHT' }], [0]), /invalid/);
  assert.doesNotThrow(() => validateClients([{ client: 1 }, { client: 0 }], [0, 1]));
});

test('FedAvg weights by sample count and rejects incomplete, duplicate, or corrupt updates', () => {
  const a = { client: 0, rows: 1, weights: [0, 2, 4] };
  const b = { client: 1, rows: 3, weights: [4, 6, 8] };
  assert.deepEqual(aggregate([a, b], [0, 1]), [3, 5, 7]);
  for (const bad of [[a], [a, a], [a, { ...b, weights: [NaN, 0, 0] }], [a, { ...b, rows: -1 }]]) {
    assert.throws(() => aggregate(bad, [0, 1]), /invalid/);
  }
});
