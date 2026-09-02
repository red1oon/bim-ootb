const { runE2E } = require('./e2e_harness');
(async () => {
  for (const key of ['Duplex', 'SampleCastle']) {
    await runE2E('W-ARC-ONLY-SMOKE-' + key, async (t) => {
      await t.open(key);
      const meshCount = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
      const errs = await t.pg.evaluate(() => window.__testErrors || []);
      t.assert(key + ' opens with real meshes rendered', meshCount > 0, 'meshCount=' + meshCount);
      console.log('§SMOKE ' + key + ' meshCount=' + meshCount);
      await t.shot('smoke-' + key);
    });
  }
})();
