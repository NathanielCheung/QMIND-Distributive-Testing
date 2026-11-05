'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [localFile, remoteFile] = process.argv.slice(2);
if (!localFile || !remoteFile) throw new Error('Usage: node compare.js <local JSON> <remote JSON>');
const local = JSON.parse(fs.readFileSync(localFile));
const remote = JSON.parse(fs.readFileSync(remoteFile));
function round(report, mode) {
  assert.equal(report.mode, mode);
  assert.equal(report.selection, 'round');
  assert.ok(report.finishedAt && !report.fatal);
  assert.equal(report.jobs.length, 1);
  assert.ok(report.jobs[0].ok);
  const check = report.checks.find(c => c.name === 'federated-round' && c.round === 1);
  assert.ok(check && report.checks.some(c => c.name === 'round' && c.passed));
  return check;
}
const a = round(local, 'local'), b = round(remote, 'remote');
const differences = a.aggregated.map((v, i) => Math.abs(v - b.aggregated[i]));
const result = {
  localFile, remoteFile,
  localWallMs: local.jobs[0].wallMs, remoteWallMs: remote.jobs[0].wallMs,
  localAggregate: a.aggregated, remoteAggregate: b.aggregated,
  absoluteWeightDifferences: differences,
  aggregatesMatchWithin1eMinus9: differences.every(d => Number.isFinite(d) && d <= 1e-9),
  localMeanLoss: [a.meanLossBefore, a.meanLossAfter],
  remoteMeanLoss: [b.meanLossBefore, b.meanLossAfter],
  note: 'Single observations include scheduling and do not establish speed or scaling. Verify both runs used the same code revision and inputs.',
};
console.log(JSON.stringify(result, null, 2));
if (!result.aggregatesMatchWithin1eMinus9) process.exitCode = 1;
