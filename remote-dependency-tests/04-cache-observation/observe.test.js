'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { observeCache } = require('./observe');
test('observation records misses, hits and fetched bytes without storing source', async () => {
  const events = [];
  const cache = { fetch: key => key === 'cached' ? Promise.resolve({}) : undefined,
    actuallyFetchModule: async () => ({ group: { 'module.js': 'abc' } }) };
  observeCache(cache, events);
  assert.equal(cache.fetch('missing', 'job'), undefined);
  assert.ok(cache.fetch('cached', 'job'));
  assert.deepEqual(await cache.actuallyFetchModule([], 'missing', 'job'), { group: { 'module.js': 'abc' } });
  assert.deepEqual(events.map(e => e.type), ['cache-miss', 'cache-hit', 'fetch-completed']);
  assert.equal(events[2].files[0].bytes, 3);
  assert.equal(events[2].files[0].sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.ok(!JSON.stringify(events).includes('abc'));
});
test('incompatible SDK internals fail explicitly', () => {
  assert.throws(() => observeCache({}, []), /unavailable/);
});
