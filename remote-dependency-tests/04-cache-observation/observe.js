'use strict';
const { createHash } = require('node:crypto');

// This probes dcp-client 5.8.8 internals on our own local worker only.
function observeCache(cache, events) {
  if (!cache || typeof cache.fetch !== 'function' || typeof cache.actuallyFetchModule !== 'function') {
    throw new Error('Worker module-cache instrumentation unavailable');
  }
  const fetch = cache.fetch;
  const download = cache.actuallyFetchModule;
  cache.fetch = function (key, job) {
    const value = fetch.call(this, key, job);
    events.push({ type: value ? 'cache-hit' : 'cache-miss', key, job, at: new Date().toISOString() });
    return value;
  };
  cache.actuallyFetchModule = async function (modules, key, job) {
    const started = performance.now();
    try {
      const result = await download.call(this, modules, key, job);
      const files = [];
      if (result) for (const group of Object.values(result)) {
        for (const [name, content] of Object.entries(group)) {
          if (typeof content === 'string') files.push({ name, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
        }
      }
      events.push({ type: 'fetch-completed', key, job, elapsedMs: performance.now() - started, files, success: !!result });
      return result;
    } catch (error) {
      events.push({ type: 'fetch-failed', key, job, elapsedMs: performance.now() - started, message: error.message });
      throw error;
    }
  };
}
module.exports = { observeCache };
