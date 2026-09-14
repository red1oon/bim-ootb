// §MULTIRUN (MODELLER_MASTER.md row 24): this file is the ONE multi-run caller in modeller/tests/.
// Before 2026-09-15 it looked green while running only Duplex — runE2E ended with process.exit(), so the
// SampleCastle iteration was unreachable and the process still exited 0. `noExit` makes runE2E resolve
// instead; this file tallies both runs and owns the exit code.
const { runE2E } = require('./e2e_harness');
(async () => {
  const results = [];
  for (const key of ['Duplex', 'SampleCastle']) {
    results.push(await runE2E('W-ARC-ONLY-SMOKE-' + key, async (t) => {
      await t.open(key);
      const meshCount = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
      const errs = await t.pg.evaluate(() => window.__testErrors || []);
      t.assert(key + ' opens with real meshes rendered', meshCount > 0, 'meshCount=' + meshCount);
      console.log('§SMOKE ' + key + ' meshCount=' + meshCount);
      await t.shot('smoke-' + key);
    }, { noExit: true }));
  }
  const pass = results.reduce((n, r) => n + r.pass, 0), fail = results.reduce((n, r) => n + r.fail, 0);
  console.log('§SMOKE-ALL runs=' + results.length + '/2 ' + pass + ' PASS / ' + fail + ' FAIL  ' +
    results.map(r => r.name + '=' + r.pass + '/' + r.fail).join('  '));
  if (results.length !== 2) { console.log('§SMOKE-ALL INCOMPLETE — a run was skipped'); process.exit(1); }
  process.exit(fail ? 1 : 0);
})();
