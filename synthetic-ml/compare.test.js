'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('comparison accepts matched rounds and rejects changed weights and incomplete runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-compare-'));
  try {
    const file = mode => path.join(dir, `${mode}.json`);
    const report = mode => ({ mode, selection: 'round', finishedAt: 'done', jobs: [{ ok: true, wallMs: 10 }], checks: [
      { name: 'federated-round', round: 1, aggregated: [1, 2, 3], meanLossBefore: 0.7, meanLossAfter: 0.4 },
      { name: 'round', passed: true },
    ] });
    const write = (mode, data) => fs.writeFileSync(file(mode), JSON.stringify(data));
    const run = () => spawnSync(process.execPath, [path.join(__dirname, 'compare.js'), file('local'), file('remote')]);
    write('local', report('local')); write('remote', report('remote'));
    assert.equal(run().status, 0);
    const changed = report('remote'); changed.checks[0].aggregated[1] += 0.01; write('remote', changed);
    assert.equal(run().status, 1);
    const incomplete = report('remote'); delete incomplete.finishedAt; write('remote', incomplete);
    assert.equal(run().status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
