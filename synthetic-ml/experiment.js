'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { work, aggregate, validateClients } = require('./workload');

const [mode = 'local', selection = 'all'] = process.argv.slice(2);
const cases = ['smoke', 'scaling', 'federated', 'failure', 'libraries'];
const selections = ['round', ...cases];
if (!['local', 'remote', 'access'].includes(mode) || !['all', ...selections].includes(selection) || (mode === 'remote' && selection !== 'round')) {
  console.error('Usage: node experiment.js local|remote|access [round|smoke|scaling|federated|failure|libraries|all]; remote requires round');
  process.exit(1);
}
const report = {
  startedAt: new Date().toISOString(), mode, selection, node: process.version,
  sdk: require('dcp-client/package.json').version, platform: `${os.platform()} ${os.release()}`,
  logicalCpus: os.availableParallelism(), scheduler: 'https://scheduler.distributed.computer',
  paymentOfferDCCPerSlice: mode === 'remote' ? 1 : 0, jobs: [], checks: [],
};
fs.mkdirSync('results', { recursive: true });
const output = path.join('results', `${report.startedAt.replace(/[:.]/g, '-')}-${mode}-${selection}.json`);
function save() { fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
function errorInfo(error) { return { name: error.name, code: error.code, message: error.message }; }
function log(message) { console.log(`${new Date().toISOString()} ${message}`); }

async function main() {
  save();
  await require('dcp-client').init(report.scheduler);
  report.schedulerConnected = true;
  const identity = require('dcp/identity');
  const wallet = require('dcp/wallet');
  if (mode === 'local') {
    await identity.set(await new wallet.Keystore(null, false));
    report.identity = 'ephemeral, local only';
  } else {
    // SDK prompts locally for passphrases. Never persist credentials in the report.
    const key = process.env.DCP_IDENTITY_KEY || process.env.DCP_API_KEY;
    if (!key) throw new Error('Set DCP_API_KEY in your terminal before running remotely');
    await identity.set(key);
    report.identity = 'portal identity loaded';
  }
  save();
  if (mode === 'access') { report.checks.push({ name: 'scheduler initialization and local credential unlock', passed: true, note: 'Does not prove deployment authorization or account balance.' }); return; }
  const compute = require('dcp/compute');
  const payment = identity.get();

  async function execute(name, inputs, weights = [0, 0, 0], dependencies = [], cancelOnError = false) {
    const job = compute.for(inputs, work, [weights]);
    job.public.name = `QMIND synthetic: ${name}`;
    if (dependencies.length) job.requires(dependencies);
    job.setSlicePaymentOffer(report.paymentOfferDCCPerSlice);
    const record = { name, jobId: job.id, inputCount: inputs.length, events: [], results: [], startedAt: new Date().toISOString() };
    report.jobs.push(record);
    const started = performance.now();
    let peakRss = process.memoryUsage().rss;
    const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 25);
    let accepted = false, cancelPromise;
    function cancel(reason) {
      if (!cancelPromise) cancelPromise = job.cancel(reason).then(() => { record.cancelAcknowledged = true; }, e => { record.cancelError = errorInfo(e); });
      return cancelPromise;
    }
    job.on('accepted', () => {
      accepted = true;
      record.jobId = job.id;
      record.acceptedMs = performance.now() - started;
      // SDK reuses its persisted worker ID; preserve its prefix/length while separating supervisors.
      if (mode === 'local') {
        job.localWorker.id = `localExec_${randomBytes(6).toString('hex')}`;
        job.localWorker.config.paymentAddress = payment.address;
      }
      record.localWorkerId = mode === 'local' ? job.localWorker?.id : undefined;
      log(`${name}: accepted`); save();
    });
    for (const event of ['status', 'result', 'error', 'cancel', 'nofunds']) {
      job.on(event, data => {
        // Keep only public job events, never keystore or full job objects.
        record.events.push({ event, elapsedMs: performance.now() - started, data });
        if (event === 'error') {
          log(`${name}: worker error ${data.message}`);
          if (cancelOnError && accepted) void cancel('Intentional failure experiment; stop retries');
        }
        save();
      });
    }
    let timeout;
    try {
      log(`${name}: starting ${inputs.length} slices`);
      const running = mode === 'local' ? job.localExec(1) : job.exec(1, payment);
      const results = await Promise.race([
        running,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Job exceeded 180 second observation window')), 180000); }),
      ]);
      record.sdkPromiseResolved = true;
      record.results = Array.from(results);
      // DCP can resolve with serialized exceptions instead of rejecting the job promise.
      validateClients(record.results, inputs.map(input => input.client));
      record.ok = true;
      return record.results;
    } catch (error) {
      record.error = errorInfo(error); record.ok = false;
      if (accepted) await cancel('Experiment failed or observation window expired');
      else {
        // A late deployment must not remain running after the caller has timed out.
        job.once('accepted', () => { void cancel('Late acceptance after experiment stopped'); });
      }
      throw error;
    } finally {
      clearTimeout(timeout); clearInterval(sample);
      record.wallMs = performance.now() - started;
      record.submitterPeakRssBytes = peakRss;
      record.submitterMaxRssBytes = process.resourceUsage().maxRSS * 1024;
      if (cancelPromise) await cancelPromise;
      save(); log(`${name}: ${record.ok ? 'complete' : 'failed'} in ${(record.wallMs / 1000).toFixed(2)}s`);
    }
  }

  function trainInputs(rows, epochs = 32) { return [0, 1, 2, 3].map(client => ({ client, rows, epochs })); }
  async function smoke() {
    const results = await execute('smoke', [1, 53, 2, 12].map((value, client) => ({ kind: 'square', client, value })));
    assert.deepEqual(results.sort((a, b) => a.client - b.client).map(r => r.value), [1, 2809, 4, 144]);
  }
  async function scaling() {
    // Separate localExec jobs give distinct local supervisors; remote slots are jobs, not a worker-count control.
    for (const rows of [256, 4096]) {
      for (const slots of [1, 2, 4]) {
        const inputs = trainInputs(rows);
        const started = performance.now();
        const outcomes = await Promise.allSettled(Array.from({ length: slots }, (_, slot) =>
          execute(`scale-rows${rows}-slots${slots}-${slot}`, inputs.filter((_, i) => i % slots === slot))));
        const failed = outcomes.find(r => r.status === 'rejected');
        if (failed) throw failed.reason;
        const results = outcomes.flatMap(r => r.value);
        aggregate(results, [0, 1, 2, 3]);
        assert.ok(results.every(r => r.lossAfter < r.lossBefore));
        report.checks.push({ name: 'scaling', rowsPerClient: rows, clients: 4, slots, wallMs: performance.now() - started,
          workerComputeMs: results.map(r => r.elapsedMs), explicitDataBytesPerSlice: rows * 3 * 8,
          note: mode === 'local' ? 'Distinct local DCP supervisors, one requested core each; one host.' : 'Concurrent jobs; actual remote worker count is uncontrolled.' });
        save();
      }
    }
  }
  async function federated(rounds = 3) {
    let weights = [0, 0, 0];
    for (let round = 1; round <= rounds; round++) {
      const before = weights.slice();
      const results = await execute(`federated-round-${round}`, trainInputs(1024, 12), before);
      assert.ok(results.every(r => JSON.stringify(r.receivedWeights) === JSON.stringify(before)));
      assert.ok(results.every(r => r.lossAfter < r.lossBefore));
      weights = aggregate(results, [0, 1, 2, 3]);
      report.checks.push({ name: 'federated-round', round, broadcast: before, aggregated: weights,
        meanLossBefore: results.reduce((s, r) => s + r.lossBefore, 0) / results.length,
        meanLossAfter: results.reduce((s, r) => s + r.lossAfter, 0) / results.length });
      save();
    }
  }
  async function failure() {
    let observed = false;
    try { await execute('injected-exception', [{ kind: 'fail', client: 0 }], undefined, [], true); }
    catch (error) { observed = true; }
    assert.ok(observed, 'Fault injection must fail');
    const fault = report.jobs.at(-1);
    assert.ok(fault.events.some(e => e.event === 'error' && /Injected failure/.test(e.data.message)), 'Must observe the injected worker error');
    const results = await execute('coordinator-retry', trainInputs(256));
    aggregate(results, [0, 1, 2, 3]);
    report.checks.push({ name: 'failure-and-coordinator-retry', passed: true,
      note: 'Thrown exception followed by explicit coordinator resubmission; does not prove automatic recovery after physical worker loss.' });
  }
  async function libraries() {
    const results = await execute('tensorflow-wasm-probe', [{ kind: 'probe', client: 0 }], undefined, ['dcp-tfjs-wasm/tfjs-wasm.js']);
    const tf = results[0].capabilities.tensorflow;
    report.checks.push({ name: 'tensorflow-wasm', passed: !tf.error, details: tf });
    assert.equal(tf.error, undefined, 'TensorFlow WASM must load and initialize');
    assert.deepEqual(tf.values, [1, 4, 9]);
  }
  const tasks = { smoke, scaling, federated, failure, libraries, round: () => federated(1) };
  for (const name of selection === 'all' ? cases : [selection]) {
    try { await tasks[name](); report.checks.push({ name, passed: true }); }
    catch (error) { report.checks.push({ name, passed: false, error: errorInfo(error) }); process.exitCode = 1; }
    save();
  }
}

main().catch(error => { report.fatal = errorInfo(error); process.exitCode = 1; console.error(error.message); })
  .finally(() => { report.finishedAt = new Date().toISOString(); save(); log(`Evidence saved to ${output}`); });
