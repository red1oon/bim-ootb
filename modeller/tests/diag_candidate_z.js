'use strict';
// §CAMERA-LESSON cross-check: get real world bbox z-range (not just size) for each real-layer-seedable
// wallish candidate, to find one clear of Duplex's sloped roof (z≈6.0-6.6, per this guide's own round-1
// grid-editor finding) — a ground-floor wall (low z-min/z-max) avoids frameElement's naive dolly-along-
// current-direction camera ending up grazing/inside the roof mesh.
const { runE2E } = require('./e2e_harness');
runE2E('DIAG-CAND-Z', async (t) => {
  await t.open('Duplex');
  const report = await t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps();
    const wallish = c => c.sz && c.sz[2] >= 1.2 && Math.min(c.sz[0], c.sz[1]) <= 0.6 && Math.max(c.sz[0], c.sz[1]) >= 1.0 && Math.max(c.sz[0], c.sz[1]) <= 8;
    const g = window.Bonsai.group();
    const out = [];
    ops.forEach(op => {
      if (op.op_type !== 'GEOM_INSERT') return;
      const P = op.parameters; if (!P || !P.ifc_class || !/^IfcWall/.test(P.ifc_class)) return;
      let boxOk = false, layerSeed = null;
      try { boxOk = !!window.Bonsai._insertCutBox(op); } catch (e) {}
      if (boxOk) return;
      try { layerSeed = window.Bonsai._insertCutLayerSeed(op); } catch (e) {}
      if (!layerSeed) return;
      const bb = P.bbox, sz = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
      if (!wallish({ sz })) return;
      const m = g.children.find(o => o.isMesh && o.userData.featureId === op.id);
      let zmin = null, zmax = null;
      if (m) { const b = new window.THREE.Box3().setFromObject(m); zmin = b.min.z; zmax = b.max.z; }
      out.push({ fid: op.id, nLayers: layerSeed.layers.length, sz, zmin, zmax });
    });
    out.sort((a, b) => b.nLayers - a.nLayers);
    return out;
  });
  report.forEach(c => console.log('  §CAND-Z fid=' + c.fid + ' nLayers=' + c.nLayers + ' z=[' + (c.zmin==null?'?':c.zmin.toFixed(2)) + ',' + (c.zmax==null?'?':c.zmax.toFixed(2)) + ']'));
  t.assert('DIAG-Z done', report.length > 0, 'n=' + report.length);
}, { width: 1200, height: 850, dpr: 2 });
