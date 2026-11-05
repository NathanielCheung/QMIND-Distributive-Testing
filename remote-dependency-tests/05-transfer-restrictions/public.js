'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { validateClients } = require('../../synthetic-ml/workload');
const key = process.env.DCP_IDENTITY_KEY || process.env.DCP_API_KEY;
if (!key) { console.error('Set DCP_API_KEY; no job submitted.'); process.exit(1); }

async function work(input) {
  progress(0);
  if (!globalThis.qmindCacheProbe) globalThis.qmindCacheProbe = {
    token: Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')).join(''), calls: 0,
  };
  const probe = globalThis.qmindCacheProbe;
  const call = ++probe.calls;
  const start = performance.now();
  const tf = require('tfjs-wasm.js');
  const requireMs = performance.now() - start;
  const sameModule = tf === require('tfjs-wasm.js');
  if (!(await tf.setBackend('wasm'))) throw new Error('WASM backend unavailable');
  await tf.ready();
  const initializedMs = performance.now() - start;
  const x = tf.tensor1d([1, 2, 3]), y = tf.square(x);
  const values = Array.from(await y.data()); x.dispose(); y.dispose();
  progress(100);
  return { client: input.client, sandboxToken: probe.token, call, tfVersion: tf.version.tfjs, backend: tf.getBackend(), requireMs, initializedMs, sameModule, values };
}
async function main() {
  const startedAt = new Date().toISOString();
  const report = { startedAt, mode: 'remote', sdk: require('dcp-client/package.json').version,
    node: process.version, dependency: 'dcp-tfjs-wasm/tfjs-wasm.js', offerDCCPerSlice: 1, offerCeilingDCC: 4, events: [], results: [] };
  const out = path.join(__dirname, `${startedAt.replace(/[:.]/g, '-')}-public.json`);
  const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2));
  let job, accepted = false, timer, cancellation;
  const cancel = reason => {
    if (!cancellation) cancellation = job.cancel(reason).then(() => { report.cancelAcknowledged = true; }, e => { report.cancelError = e.message; });
    return cancellation;
  };
  try {
    save(); await require('dcp-client').init('https://scheduler.distributed.computer');
    const identity = require('dcp/identity'), compute = require('dcp/compute');
    await identity.set(key);
    job = compute.for([0, 1, 2, 3].map(client => ({ client })), work);
    job.public.name = 'QMIND public sandbox reuse'; job.requires([report.dependency]); job.setSlicePaymentOffer(1);
    job.on('accepted', () => { accepted = true; report.jobId = job.id; save(); console.log(`Accepted ${job.id}`); });
    for (const event of ['result', 'status', 'error', 'nofunds']) job.on(event, data => {
      report.events.push({ event, data });
      if ((event === 'error' || event === 'nofunds') && accepted) void cancel('Stopping after error');
      save();
    });
    const start = performance.now();
    const running = job.exec(1, identity.get());
    report.results = Array.from(await Promise.race([running, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out after 180 seconds')), 180000);
    })]));
    report.wallMs = performance.now() - start;
    validateClients(report.results, [0, 1, 2, 3]);
    for (const r of report.results) {
      assert.equal(r.backend, 'wasm'); assert.equal(r.sameModule, true);
      assert.match(r.sandboxToken, /^[a-f0-9]{32}$/); assert.ok(Number.isInteger(r.call) && r.call >= 1);
      assert.deepEqual(r.values, [1, 4, 9]);
    }
    assert.ok(!cancellation, 'Job emitted an error'); report.passed = true;
  } catch (error) {
    report.passed = false; report.error = error.message;
    if (accepted) await cancel('Test failed or timed out');
    else if (job) job.once('accepted', () => { void cancel('Late acceptance after timeout'); });
    process.exitCode = 1;
  } finally {
    clearTimeout(timer); if (cancellation) await cancellation;
    report.finishedAt = new Date().toISOString(); save();
    console.log(`${report.passed ? 'Passed' : 'Failed'}; evidence: ${out}`);
  }
}
main();
