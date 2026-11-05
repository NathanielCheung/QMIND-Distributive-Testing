'use strict';

// Self-contained: DCP serializes this function; outer variables do not travel with it.
async function work(input, parameters) {
  progress(0);
  const started = performance.now();
  if (input.kind === 'fail') throw new Error(`Injected failure: client ${input.client}`);
  if (input.kind === 'square') {
    progress(100);
    return { client: input.client, value: input.value ** 2 };
  }
  if (input.kind === 'probe') {
    const capabilities = {
      process: typeof process, require: typeof require, fetch: typeof fetch,
      WebAssembly: typeof WebAssembly, SharedArrayBuffer: typeof SharedArrayBuffer,
      worker: typeof worker, tensorflow: null,
    };
    try {
      const tf = require('tfjs-wasm.js');
      const ok = await tf.setBackend('wasm');
      await tf.ready();
      if (!ok || tf.getBackend() !== 'wasm') throw new Error('WASM backend did not initialize');
      const a = tf.tensor1d([1, 2, 3]);
      const b = tf.square(a);
      capabilities.tensorflow = { backend: tf.getBackend(), values: Array.from(await b.data()), memory: tf.memory() };
      a.dispose();
      b.dispose();
    } catch (error) {
      capabilities.tensorflow = { error: error.message };
    }
    progress(100);
    return { client: input.client, capabilities, elapsedMs: performance.now() - started };
  }
  const { rows, epochs, client } = input;
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(epochs) || epochs < 1 ||
      !parameters || parameters.length !== 3 || !parameters.every(Number.isFinite)) {
    throw new Error('Invalid training input');
  }
  // Synthetic data generated at each client; only weights and metrics are returned.
  const data = new Float64Array(rows * 3);
  let seed = client + 1;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < rows; i++) {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    data[i * 3] = x;
    data[i * 3 + 1] = y;
    data[i * 3 + 2] = x + y > 0 ? 1 : 0;
  }
  const weights = parameters.slice();
  let lossBefore = null;
  function loss() {
    let total = 0;
    for (let i = 0; i < rows; i++) {
      const p = 1 / (1 + Math.exp(-(weights[0] * data[i * 3] + weights[1] * data[i * 3 + 1] + weights[2])));
      const target = data[i * 3 + 2];
      total -= target * Math.log(Math.max(p, 1e-12)) + (1 - target) * Math.log(Math.max(1 - p, 1e-12));
    }
    return total / rows;
  }
  lossBefore = loss();
  for (let epoch = 0; epoch < epochs; epoch++) {
    let g0 = 0, g1 = 0, g2 = 0;
    for (let i = 0; i < rows; i++) {
      const x = data[i * 3], y = data[i * 3 + 1];
      const error = 1 / (1 + Math.exp(-(weights[0] * x + weights[1] * y + weights[2]))) - data[i * 3 + 2];
      g0 += error * x; g1 += error * y; g2 += error;
      if (i % 4096 === 0) progress(99 * (epoch + i / rows) / epochs);
    }
    weights[0] -= 0.5 * g0 / rows;
    weights[1] -= 0.5 * g1 / rows;
    weights[2] -= 0.5 * g2 / rows;
    progress(99 * (epoch + 1) / epochs);
  }
  const result = {
    client, rows, weights, receivedWeights: parameters.slice(), lossBefore, lossAfter: loss(),
    elapsedMs: performance.now() - started, dataBytes: data.byteLength,
    heapUsedBytes: typeof performance.memory === 'object' ? performance.memory.usedJSHeapSize : null,
  };
  progress(100);
  return result;
}

function validateClients(results, expectedClients) {
  if (results.length !== expectedClients.length ||
      results.some(r => !r || !expectedClients.includes(r.client) || r.errorCode) ||
      new Set(results.map(r => r.client)).size !== results.length) {
    throw new Error('Missing, duplicate, or invalid client update');
  }
}

function aggregate(results, expectedClients) {
  validateClients(results, expectedClients);
  if (results.some(r => !Number.isInteger(r.rows) || r.rows < 1 ||
        !Array.isArray(r.weights) || r.weights.length !== 3 || !r.weights.every(Number.isFinite))) {
    throw new Error('Missing, duplicate, or invalid client update');
  }
  const total = results.reduce((sum, r) => sum + r.rows, 0);
  return [0, 1, 2].map(i => results.reduce((sum, r) => sum + r.weights[i] * r.rows / total, 0));
}

module.exports = { work, aggregate, validateClients };
