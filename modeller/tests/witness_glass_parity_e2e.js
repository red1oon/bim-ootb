// witness_glass_parity_e2e.js — real-browser proof for MODELLER_RENDER_MATERIAL_PARITY.md Task 1.
// Opens the real Duplex resident, inspects the LIVE THREE materials of every IfcWindow mesh, and
// screenshots a close-up. NOT committed as a permanent suite member — ad-hoc verification script.
const { runE2E } = require('./e2e_harness');
(async () => {
  await runE2E('W-GLASS-PARITY', async (t) => {
    await t.open('Duplex');
    const info = await t.pg.evaluate(() => {
      var out = { windows: [], total: 0 };
      var g = window.Bonsai.group();
      var ops = window.Bonsai.oplog._geomOps();
      var winFids = {};
      ops.forEach(function (o) {
        if (o.op_type !== 'GEOM_INSERT') return;
        var P = typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters;
        if (P && P.ifc_class === 'IfcWindow') winFids[o.id] = true;
      });
      out.total = g.children.filter(function (o) { return o.isMesh; }).length;
      g.children.forEach(function (m) {
        if (!m.isMesh || !winFids[m.userData.featureId]) return;
        out.windows.push({ fid: m.userData.featureId, transparent: !!m.material.transparent, opacity: m.material.opacity, color: m.material.color.getHexString() });
      });
      return out;
    });
    console.log('§GLASS_PARITY total_meshes=' + info.total + ' window_meshes=' + info.windows.length);
    console.log('§GLASS_PARITY windows=' + JSON.stringify(info.windows));
    // Ground truth (sqlite3 buildings/Duplex_extracted.db): 22/24 IfcWindow rows carry real material_rgba
    // alpha=0.100 (glass); exactly 2 rows (guids 1Eo2$BaHX42AEkDvQQDocD/…Doy2) have NULL/empty material_rgba
    // — no alpha data exists for them, so honest data-driven parity means THEY stay opaque too (the Viewer's
    // own A._getMaterial has no alpha to read for these either — same STD_MAT-color-only fallback, a=1.0).
    var glassOnes = info.windows.filter(function (w) { return w.opacity < 1; });
    var noDataOnes = info.windows.filter(function (w) { return w.opacity === 1; });
    var glassOk = glassOnes.length === 22 && glassOnes.every(function (w) { return w.transparent && w.opacity === 0.1; });
    var noDataOk = noDataOnes.length === 2 && noDataOnes.every(function (w) { return !w.transparent; });
    t.assert('22/24 real-glass IfcWindow meshes are transparent opacity=0.1 (matches material_rgba alpha)', glassOk, JSON.stringify(glassOnes.length));
    t.assert('2/24 no-material-data IfcWindow meshes stay honestly opaque (no invented transparency)', noDataOk, JSON.stringify(noDataOnes));
    // Non-glass sanity: walls stay opaque (no regression)
    const wallInfo = await t.pg.evaluate(() => {
      var g = window.Bonsai.group();
      var ops = window.Bonsai.oplog._geomOps();
      var wallFids = {};
      ops.forEach(function (o) {
        if (o.op_type !== 'GEOM_INSERT') return;
        var P = typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters;
        if (P && P.ifc_class === 'IfcWallStandardCase') wallFids[o.id] = true;
      });
      var out = [];
      g.children.forEach(function (m) { if (m.isMesh && wallFids[m.userData.featureId] && out.length < 3) out.push({ transparent: !!m.material.transparent, opacity: m.material.opacity }); });
      return out;
    });
    console.log('§GLASS_PARITY walls_sample=' + JSON.stringify(wallInfo));
    t.assert('walls remain opaque (no regression)', wallInfo.length > 0 && wallInfo.every(function (w) { return !w.transparent; }), JSON.stringify(wallInfo));
    // Frame a window close-up for a visual before/after screenshot
    const winFid = await t.pg.evaluate(() => {
      var ops = window.Bonsai.oplog._geomOps();
      var fid = null;
      ops.forEach(function (o) {
        if (fid || o.op_type !== 'GEOM_INSERT') return;
        var P = typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters;
        if (P && P.ifc_class === 'IfcWindow' && P.opacity != null) fid = o.id;
      });
      return fid;
    });
    if (winFid != null) {
      await t.frameElement(winFid, 0.5);
      await t.shotClip('glass-window-closeup', winFid, 80);
    }
    await t.shot('duplex-full');
  });
})();
