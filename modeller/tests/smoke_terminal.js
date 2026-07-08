const { runE2E } = require('./e2e_harness');
runE2E('W-ARC-ONLY-SMOKE-Terminal', async (t) => {
  await t.open('Terminal');
  // Terminal's real ARC seed (35,552 ops) legitimately takes ~30-40s to settle — a quick single
  // check reads 0 and is a false negative, not a real failure. Poll patiently until count>0 and stable.
  let last = -1, stable = 0, meshCount = 0;
  for (let i = 0; i < 40; i++) {
    meshCount = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
    if (meshCount > 0 && meshCount === last) { stable++; if (stable >= 3) break; } else { stable = 0; }
    last = meshCount;
    await t.sleep(1500);
  }
  t.assert('Terminal opens with real meshes rendered', meshCount > 0, 'meshCount=' + meshCount);
  console.log('§SMOKE Terminal meshCount=' + meshCount);
  await t.shot('smoke-Terminal');
});
