'use strict';

// DCP serializes the work function, so it must not reference outer variables.
async function work(input) {
  progress(0);
  const started = performance.now();
  const tf = require('tfjs-wasm.js');
  if (!(await tf.setBackend('wasm'))) throw new Error('WASM backend did not initialize');
  await tf.ready();
  const initializedMs = performance.now() - started;
  if (input.kind === 'smoke') {
    const tensor = tf.tensor1d([1, 2, 3]);
    const squared = tf.square(tensor);
    const values = Array.from(await squared.data());
    tensor.dispose(); squared.dispose();
    progress(100);
    return { client: input.client, backend: tf.getBackend(), initializedMs, values };
  }
  const rows = 1024, epochs = 12;
  const data = [], labels = [];
  let seed = input.client + 1;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < rows; i++) {
    const x = random() * 2 - 1, y = random() * 2 - 1;
    data.push(x, y, 1); labels.push(x + y > 0 ? 1 : 0);
  }
  const xs = tf.tensor2d(data, [rows, 3]);
  const ys = tf.tensor2d(labels, [rows, 1]);
  const initial = tf.tensor2d([0, 0, 0], [3, 1]);
  const weights = tf.variable(initial); initial.dispose();
  const optimizer = tf.train.sgd(0.5);
  function loss() {
    return tf.tidy(() => tf.losses.sigmoidCrossEntropy(ys, xs.matMul(weights)).mean());
  }
  const beforeTensor = loss();
  const lossBefore = (await beforeTensor.data())[0]; beforeTensor.dispose();
  const trainingStarted = performance.now();
  for (let epoch = 0; epoch < epochs; epoch++) {
    optimizer.minimize(loss, false, [weights]);
    progress(100 * (epoch + 1) / (epochs + 1));
  }
  const trainingMs = performance.now() - trainingStarted;
  const afterTensor = loss();
  const lossAfter = (await afterTensor.data())[0]; afterTensor.dispose();
  const trainedWeights = Array.from(await weights.data());
  xs.dispose(); ys.dispose(); weights.dispose(); optimizer.dispose();
  progress(100);
  return { client: input.client, rows, epochs, backend: tf.getBackend(), initializedMs, trainingMs, lossBefore, lossAfter, weights: trainedWeights };
}
module.exports = { work };
