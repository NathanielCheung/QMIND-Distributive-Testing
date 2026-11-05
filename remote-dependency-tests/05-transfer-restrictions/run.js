'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { observeCache } = require('../04-cache-observation/observe');
const { traceRequests } = require('./trace');
const { validateClients } = require('../../synthetic-ml/workload');

async function work(input) {
  progress(0);
  globalThis.qmindDependencyProbeCalls = (globalThis.qmindDependencyProbeCalls || 0) + 1;
  const invocationInSandbox = globalThis.qmindDependencyProbeCalls;
  const started = performance.now();
  const tf = require('tfjs-wasm.js');
  const requireMs = performance.now() - started;
  const beforeSecond = performance.now();
  const sameModule = tf === require('tfjs-wasm.js');
  const secondRequireMs = performance.now() - beforeSecond;
  if (!(await tf.setBackend('wasm'))) throw new Error('WASM backend unavailable');
  await tf.ready();
  const initializedMs = performance.now() - started;
  const x = tf.tensor1d([1, 2, 3]), y = tf.square(x);
  const values = Array.from(await y.data()); x.dispose(); y.dispose();
  progress(100);
  return { client: input.client, invocationInSandbox, tfVersion: tf.version.tfjs, backend: tf.getBackend(), requireMs, secondRequireMs, initializedMs, sameModule, values };
}

const scenario = process.argv[2];
if (!['measure', 'deny', 'warm-deny'].includes(scenario)) throw new Error('Usage: node run.js measure|deny|warm-deny');
const cores = 1;

async function main() {
  const report = { startedAt: new Date().toISOString(), mode: 'local', scenario, sdk: require('dcp-client/package.json').version,
    node: process.version, cores, dependency: 'dcp-tfjs-wasm/tfjs-wasm.js', cacheEvents: [], httpEvents: [], events: [], results: [] };
  const out = path.join(__dirname, `${report.startedAt.replace(/[:.]/g, '-')}-${scenario}-local.json`);
  const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2));
  let job, accepted = false, timeout, cancelPromise, restrictionTimer, denyRequests = scenario === 'deny';
  const trace = traceRequests(report.httpEvents, () => denyRequests, () => {
    if (!restrictionTimer) restrictionTimer = setTimeout(() => { trace.without(() => { void cancel('Ending blocked dependency test'); }); }, 3000);
  });
  const cancel = reason => {
    if (!cancelPromise) cancelPromise = job.cancel(reason).then(() => { report.cancelAcknowledged = true; }, e => { report.cancelError = e.message; });
    return cancelPromise;
  };
  try {
    save();
    await require('dcp-client').init('https://scheduler.distributed.computer');
    const wallet = require('dcp/wallet'), identity = require('dcp/identity'), compute = require('dcp/compute');
    await identity.set(await new wallet.Keystore(null, false));
    const payment = identity.get();
    job = compute.for([0, 1, 2, 3].map(client => ({ client })), work);
    job.public.name = 'QMIND local dependency cache observation';
    job.requires([report.dependency]);
    job.setSlicePaymentOffer(0);
    job.on('accepted', () => {
      accepted = true; report.jobId = job.id;
      job.localWorker.id = `localExec_${randomBytes(6).toString('hex')}`;
      job.localWorker.config.paymentAddress = payment.address;
      try {
        const cache = job.localWorker.badSupervisorBackdoor.moduleCache;
        observeCache(cache, report.cacheEvents);
        const fetch = cache.actuallyFetchModule;
        cache.actuallyFetchModule = async function (...args) {
          const result = await trace.run(() => fetch.apply(this, args));
          if (scenario === 'warm-deny' && result) { denyRequests = true; report.denyEnabledAfterFetch = true; }
          return result;
        };
        report.instrumented = true;
      }
      catch (error) { report.instrumentError = error.message; void cancel('Cache instrumentation failed'); }
      console.log(`Accepted local job ${job.id}`); save();
    });
    for (const event of ['result', 'error', 'status']) job.on(event, data => {
      report.events.push({ event, data });
      if (event === 'error' && accepted) void cancel('Worker error');
      save();
    });
    const started = performance.now();
    const running = job.localExec(cores);
    report.results = Array.from(await Promise.race([running, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Timed out after 240 seconds')), 240000);
    })]));
    report.wallMs = performance.now() - started;
    validateClients(report.results, [0, 1, 2, 3]);
    assert.ok(report.instrumented, 'Cache instrumentation not installed');
    assert.ok(!cancelPromise, 'Worker error or instrumentation failure');
    for (const result of report.results) {
      assert.equal(result.backend, 'wasm'); assert.equal(result.sameModule, true);
      assert.deepEqual(result.values, [1, 4, 9]);
    }
    assert.ok(report.cacheEvents.length > 0, 'No worker module-cache calls observed');
    assert.ok(report.httpEvents.some(e => e.complete && e.bodyBytes > 0), 'No complete module HTTP response observed');
    assert.notEqual(scenario, 'deny', 'Blocked dependency unexpectedly completed');
    if (scenario === 'warm-deny') assert.ok(report.denyEnabledAfterFetch, 'Restriction not enabled after fetch');
    report.passed = true;
  } catch (error) {
    report.restrictionObserved = scenario === 'deny' && report.httpEvents.some(e => e.blocked && e.host === 'packages.distributed.computer') && !report.events.some(e => e.event === 'result');
    report.passed = false;
    report.error = error.message;
    if (accepted) await cancel('Observation failed');
    else if (job) job.once('accepted', () => { void cancel('Late acceptance after timeout'); });
    if (report.restrictionObserved && report.cancelAcknowledged && !report.httpEvents.some(e => e.blocked && e.host === 'scheduler.distributed.computer')) report.passed = true;
    if (!report.passed) process.exitCode = 1;
  } finally {
    clearTimeout(timeout); clearTimeout(restrictionTimer); if (cancelPromise) await cancelPromise; trace.restore();
    report.finishedAt = new Date().toISOString(); save();
    console.log(`${report.passed ? 'Passed' : 'Failed'}; evidence: ${out}`);
  }
}
main();

