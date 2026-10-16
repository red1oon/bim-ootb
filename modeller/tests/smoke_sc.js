const { runE2E } = require('./e2e_harness');
runE2E('W-ARC-ONLY-SMOKE-SampleCastle', async (t) => {
  await t.open('SampleCastle');
  const meshCount = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
  t.assert('SampleCastle opens with real meshes rendered', meshCount > 0, 'meshCount=' + meshCount);
  console.log('§SMOKE SampleCastle meshCount=' + meshCount);
  await t.shot('smoke-SampleCastle');
});
