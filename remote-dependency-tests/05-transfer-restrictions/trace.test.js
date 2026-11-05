'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { traceRequests } = require('./trace');
test('counts response-body bytes and blocks scoped requests without blocking unscoped requests', async () => {
  const server = http.createServer((req, res) => res.end('hello'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const options = { host: '127.0.0.1', port: server.address().port, path: '/', method: 'GET' };
  const get = () => new Promise((resolve, reject) => {
    const req = http.request(options, res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.end();
  });
  const events = []; let trace = traceRequests(events, false);
  try { await trace.run(get); await get(); } finally { trace.restore(); }
  assert.equal(events.length, 1); assert.equal(events[0].bodyBytes, 5); assert.equal(events[0].complete, true);
  const denied = []; trace = traceRequests(denied, true);
  try { await assert.rejects(trace.run(get), /Simulated restriction/); await trace.run(() => trace.without(get)); await get(); } finally { trace.restore(); server.close(); }
  assert.equal(denied.length, 1); assert.equal(denied[0].blocked, true);
});
