const { runE2E } = require('./e2e_harness');
runE2E('W-ARC-ONLY-SMOKE-SampleHouse', async (t) => {
  await t.open('SampleHouse');
  const meshCount = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
  t.assert('SampleHouse opens with real meshes rendered', meshCount > 0, 'meshCount=' + meshCount);
  console.log('§SMOKE SampleHouse meshCount=' + meshCount);
});
