'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { work } = require('./work');
const { aggregate, validateClients } = require('../synthetic-ml/workload');
const [mode, selection] = process.argv.slice(2);
const stages = { smoke: '01-smoke', training: '02-training', federated: '03-federated' };
if (!['local', 'remote'].includes(mode) || ![...Object.keys(stages), 'all'].includes(selection)) {
  console.error('Usage: node run.js local|remote smoke|training|federated|all'); process.exit(1);
}
if (mode === 'remote' && !process.env.DCP_IDENTITY_KEY && !process.env.DCP_API_KEY) {
  console.error('Set DCP_API_KEY in your terminal; no job was submitted.'); process.exit(1);
}
const dependency = 'dcp-tfjs-wasm/tfjs-wasm.js';
async function main() {
  await require('dcp-client').init('https://scheduler.distributed.computer');
  const identity = require('dcp/identity'), wallet = require('dcp/wallet'), compute = require('dcp/compute');
  await identity.set(mode === 'local' ? await new wallet.Keystore(null, false) : (process.env.DCP_IDENTITY_KEY || process.env.DCP_API_KEY));
  const payment = identity.get();
  for (const stage of selection === 'all' ? Object.keys(stages) : [selection]) {
    const clients = stage === 'federated' ? [0, 1, 2, 3] : [0];
    const inputs = clients.map(client => ({ client, kind: stage === 'smoke' ? 'smoke' : 'training' }));
    const job = compute.for(inputs, work);
    job.public.name = `QMIND dependency ${stage}`;
    job.requires([dependency]);
    job.setSlicePaymentOffer(mode === 'local' ? 0 : 1);
    const startedAt = new Date().toISOString();
    const output = path.join(__dirname, stages[stage], `${startedAt.replace(/[:.]/g, '-')}-${mode}.json`);
    const record = { stage, mode, startedAt, dependency, sdk: require('dcp-client/package.json').version,
      node: process.version, offerDCCPerSlice: mode === 'local' ? 0 : 1, offerCeilingDCC: mode === 'local' ? 0 : clients.length, inputCount: clients.length, events: [], results: [] };
    const save = () => fs.writeFileSync(output, JSON.stringify(record, null, 2));
    save();
    let accepted = false, cancellation, timeout;
    const cancel = reason => {
      if (!cancellation) cancellation = job.cancel(reason).then(() => { record.cancelAcknowledged = true; }, e => { record.cancelError = e.message; });
      return cancellation;
    };
    const started = performance.now();
    job.on('accepted', () => {
      accepted = true; record.jobId = job.id; record.acceptedMs = performance.now() - started;
      if (mode === 'local') {
        job.localWorker.id = `localExec_${randomBytes(6).toString('hex')}`;
        job.localWorker.config.paymentAddress = payment.address;
      }
      console.log(`${stage}: accepted job ${job.id}`); save();
    });
    for (const event of ['result', 'status', 'error', 'nofunds']) job.on(event, data => {
      record.events.push({ event, elapsedMs: performance.now() - started, data });
      if ((event === 'error' || event === 'nofunds') && accepted) void cancel('Stopping after job error');
      save();
    });
    try {
      console.log(`${stage}: ${mode}, ${clients.length} slice(s), maximum offer ${record.offerCeilingDCC} DCC`);
      const running = mode === 'local' ? job.localExec(1) : job.exec(1, payment);
      const results = await Promise.race([running, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Job exceeded 180 seconds')), 180000);
      })]);
      record.results = Array.from(results);
      validateClients(record.results, clients);
      assert.ok(record.results.every(r => r.backend === 'wasm' && Number.isFinite(r.initializedMs)), 'Invalid backend or initialization time');
      if (stage === 'smoke') assert.deepEqual(record.results[0].values, [1, 4, 9]);
      else {
        assert.ok(record.results.every(r => r.rows === 1024 && r.epochs === 12 && Number.isFinite(r.lossBefore) && Number.isFinite(r.lossAfter) && r.lossAfter < r.lossBefore && Number.isFinite(r.trainingMs)), 'Invalid training result or loss did not fall');
        record.aggregate = aggregate(record.results, clients);
      }
      if (cancellation) throw new Error('Job emitted an error or no-funds event');
      record.passed = true;
    } catch (error) {
      record.passed = false; record.error = { name: error.name, message: error.message, code: error.code };
      if (accepted) await cancel('Experiment failed or timed out');
      else job.once('accepted', () => { void cancel('Late acceptance after timeout'); });
      throw error;
    } finally {
      clearTimeout(timeout);
      if (cancellation) await cancellation;
      record.wallMs = performance.now() - started; record.finishedAt = new Date().toISOString(); save();
      console.log(`${stage}: ${record.passed ? 'passed' : 'failed'}; evidence: ${output}`);
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
