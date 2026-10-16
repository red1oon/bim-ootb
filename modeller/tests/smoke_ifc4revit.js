const { runE2E } = require('./e2e_harness');
runE2E('W-ARC-ONLY-SMOKE-Ifc4Revit', async (t) => {
  await t.open('Ifc4_Revit');
  const meshCount = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
  t.assert('Ifc4_Revit opens with real meshes rendered', meshCount > 0, 'meshCount=' + meshCount);
  console.log('§SMOKE Ifc4_Revit meshCount=' + meshCount);
  await t.shot('smoke-Ifc4Revit');
});
