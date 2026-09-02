#!/usr/bin/env node
/**
 * §STR-INTO-ARC (§8E-1) — headless proof that the STR skeleton walk lands INTO the laid real ARC, in the SAME
 * frame, coherent on the emergent grid. Substrate = Terminal_arcstr_proof.db (1557 real ARC shell meshes +
 * 158 STR columns). CORRECTNESS of the walk is already proven by W-WALKBACK-STR (column RMSE 0.104m); this proves
 * the INTEGRATION: (1) seed real ARC, (2) derive grid + walk the 158 columns onto it (f(grid)), (3) render the
 * walked columns over the ARC, (4) prove by MATHS they sit WITHIN the ARC footprint (same frame) + ON the grid,
 * and (5) by A/B-isolated readPixels that STR actually rasterizes over the ARC.
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
  '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.png': 'image/png' };
function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes'); res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}
(async function () {
  var srv = await serve(); var port = srv.address().port;
  var logs = []; var browser = await chromium.launch(); var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });
  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL && !!window.ArcEditable && !!window.swWalkSkeleton; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(n, c, x) { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } }
  console.log('═══ §STR-INTO-ARC — STR skeleton walks into the laid real ARC (headless) ═══');

  var R = await page.evaluate(async function (port) {
    var buf = await (await fetch('http://localhost:' + port + '/modeller/Terminal_arcstr_proof.db')).arrayBuffer();
    var db = new window.SQL.Database(new Uint8Array(buf));
    var O = window.Bonsai.oplog; await O.setModelKey('mo_arcstr');
    // 1) seed real ARC (filters discipline='ARC')
    var ar = await window.ArcEditable.seedArc(db, {
      commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid); },
      registerGeometry: function (assets) { window.Bonsai.library.registerRealGeometry(assets); }, building: 'arcstr'
    });
    // ARC world bbox (after seed, before STR) — the footprint STR must land within
    var g = window.Bonsai.group(); var THREE = window.THREE || (g.children[0] && g.children[0].constructor);
    function worldBox() { var b = new window.THREE.Box3().setFromObject(g); return b; }
    var arcBox = worldBox(); var aMin = arcBox.min, aMax = arcBox.max;
    // 2) read STR columns + walk
    var res = db.exec("SELECT m.guid, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'");
    var cols = [], bboxByGuid = {};
    if (res.length) res[0].values.forEach(function (v) {
      cols.push({ guid: v[0], x: v[1], y: v[2], z: v[3] }); bboxByGuid[v[0]] = { bx: v[4], by: v[5], bz: v[6] };
    });
    var sk = window.swWalkSkeleton(cols);   // deterministic — the maths oracle for footprint/residual
    // 3) §8E-1b — render via the PRODUCTION bridge verbs (no inline duplicate): swbInit holds the walk, swbRenderOps
    //    emits the GEOM_INSERT ops for columns + girders, committed as one signed group. fids: columns then girders.
    window.swbInit(db);
    var rr = window.swbRenderOps();
    var sr = await O.commitSeedGroup(rr.ops, 'strwalk-arcstr');
    var strFids = sr.ids || [];
    var colFids = strFids.slice(0, rr.columnN), girFids = strFids.slice(rr.columnN);
    // 4) coherence MATHS: walked columns within ARC xy footprint + residual stats
    var inFoot = 0, resid = [];
    sk.walked.forEach(function (w) {
      if (w.x >= aMin.x - 0.5 && w.x <= aMax.x + 0.5 && w.y >= aMin.y - 0.5 && w.y <= aMax.y + 0.5) inFoot++;
      resid.push(w.residual);
    });
    resid.sort(function (a, b) { return a - b; });
    var rms = Math.sqrt(resid.reduce(function (s, r) { return s + r * r; }, 0) / (resid.length || 1));
    // 5) GIRDER coherence (§8E-1b): endpoints land on walked-column intersections; section vs MEASURED beam median
    var colSet = {}; sk.walked.forEach(function (w) { colSet[w.x.toFixed(2) + '|' + w.y.toFixed(2)] = 1; });
    var girOnGrid = 0;
    sk.girders.forEach(function (g) {
      var a = g.from[0].toFixed(2) + '|' + g.from[1].toFixed(2), b = g.to[0].toFixed(2) + '|' + g.to[1].toFixed(2);
      if (colSet[a] && colSet[b]) girOnGrid++;
    });
    // measured beam median section (two smaller dims) + span distribution (length = max dim) — the render-coherence oracle
    function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[(s.length - 1) >> 1]; }
    var bres = db.exec("SELECT t.bbox_x,t.bbox_y,t.bbox_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.discipline='STR' AND m.ifc_class='IfcBeam'");
    var beamMedW = 0, beamMedD = 0, beamMedLen = 0, beamN = 0;
    if (bres.length && bres[0].values.length) {
      var dx = bres[0].values.map(function (r) { return r[0]; }), dy = bres[0].values.map(function (r) { return r[1]; }),
          dz = bres[0].values.map(function (r) { return r[2]; });
      var md = [median(dx), median(dy), median(dz)].sort(function (a, b) { return a - b; });
      beamMedW = md[0]; beamMedD = md[1]; beamMedLen = md[2]; beamN = bres[0].values.length;
    }
    var girSpans = sk.girders.map(function (g) { return g.span; }).sort(function (a, b) { return a - b; });
    var girMedSpan = girSpans.length ? girSpans[(girSpans.length - 1) >> 1] : 0;
    db.close();
    return { arcCommitted: ar.committed, arcMesh: ar.realResolved, cols: cols.length, walked: sk.walked.length,
      gx: sk.grid.xLines.length, gy: sk.grid.yLines.length, strFids: strFids, colFids: colFids, girFids: girFids,
      strCommitted: strFids.length, inFoot: inFoot, residRMS: rms, residMax: resid[resid.length - 1],
      girders: sk.girders.length, girRendered: rr.girderN, girOnGrid: girOnGrid, secW: rr.section.width, secD: rr.section.depth,
      beamMedW: beamMedW, beamMedD: beamMedD, beamMedLen: beamMedLen, beamN: beamN, girMedSpan: girMedSpan,
      arcBox: { min: [aMin.x, aMin.y, aMin.z], max: [aMax.x, aMax.y, aMax.z] } };
  }, port);
  await page.waitForTimeout(500);

  var probeAll = await page.evaluate(function () { return window.__arcPixelProbe(); });
  var probeStr = await page.evaluate(function (fids) { return window.__arcPixelProbe(fids); }, R.strFids);
  var probeGir = await page.evaluate(function (fids) { return window.__arcPixelProbe(fids); }, R.girFids);
  var shot = path.join(ROOT, 'modeller', 'tests', 'str_into_arc.png');
  await page.screenshot({ path: shot });

  chk('I1 STR skeleton walked all 158 columns onto an emergent grid', R.walked === R.cols && R.cols === 158 && R.gx > 4 && R.gy > 4,
    'columns=' + R.cols + ' walked=' + R.walked + ' grid=' + R.gx + '×' + R.gy);
  chk('I2 walked STR columns land WITHIN the laid ARC footprint (same frame)', R.inFoot === R.walked,
    'inFootprint=' + R.inFoot + '/' + R.walked + ' arcBox.x=[' + R.arcBox.min[0].toFixed(0) + ',' + R.arcBox.max[0].toFixed(0) + ']');
  chk('I3 walked columns sit ON the grid (residual RMS ≤ 0.5m = f(grid) coherence)', R.residRMS <= 0.5,
    'residRMS=' + R.residRMS.toFixed(3) + 'm max=' + R.residMax.toFixed(3) + 'm');
  chk('I4 STR meshes added to the scene over ARC + in-frustum', probeAll.meshes >= R.arcCommitted + R.strCommitted * 0.99 && probeAll.inFrustum > R.arcCommitted,
    'sceneMeshes=' + probeAll.meshes + ' (arc=' + R.arcCommitted + '+str=' + R.strCommitted + ') inFrustum=' + probeAll.inFrustum);
  // STR columns are INTERIOR structure, mostly OCCLUDED by the ARC shell (correct depth compositing) → only edges
  // peek through. The honest bar = a clearly-real isolated pixel count (≫ noise: avg >10px across 158 columns),
  // proving STR rasterizes and depth-composites into the ARC scene, not that it covers the frame.
  chk('I5 §READPIXELS — STR rasterizes + depth-composites into the ARC (A/B-isolated > 2000 real px)', probeStr.arcPainted > 2000,
    'strPainted=' + probeStr.arcPainted + 'px (' + (probeStr.arcPaintedFrac * 100).toFixed(1) + '%, ~' + Math.round(probeStr.arcPainted / R.walked) + 'px/col; rest occluded by ARC shell) whole-scene=' + (probeAll.arcPaintedFrac * 100).toFixed(1) + '%');

  // ── §8E-1b GIRDER RENDER — finish the STR skeleton (columns done above; girders here) ──
  chk('G1 production swbRenderOps rendered every girder swWalkGirders computed', R.girRendered === R.girders && R.girders > 0,
    'girders=' + R.girders + ' rendered=' + R.girRendered + ' (columns=' + R.colFids.length + ' + girders=' + R.girFids.length + ' = ' + R.strCommitted + ' STR fids)');
  chk('G2 every girder endpoint sits ON a walked-column grid intersection (no floating girder)', R.girOnGrid === R.girders,
    'onGrid=' + R.girOnGrid + '/' + R.girders);
  chk('G3 girder cross-section == MEASURED IfcBeam median (non-invent, 0-tol)',
    R.beamN > 0 && Math.abs(R.secW - R.beamMedW) < 1e-9 && Math.abs(R.secD - R.beamMedD) < 1e-9,
    'rendered=' + R.secW.toFixed(3) + '×' + R.secD.toFixed(3) + 'm  measured-beam-median=' + R.beamMedW.toFixed(3) + '×' + R.beamMedD.toFixed(3) + 'm (n=' + R.beamN + ')');
  chk('G4 §READPIXELS — girders rasterize over the ARC (A/B-isolated > 2000 real px)', probeGir.arcPainted > 2000,
    'girderPainted=' + probeGir.arcPainted + 'px (' + (probeGir.arcPaintedFrac * 100).toFixed(1) + '%, ~' + Math.round(probeGir.arcPainted / Math.max(1, R.girRendered)) + 'px/girder)');
  // G5 = TOLERANCE / generative-coverage (NOT per-element): derived bay spans share the order of magnitude of the
  // real beam lengths. Same frame, same structure scale — the recall coverage gap (W-WALKBACK-STR 0.227) is expected.
  chk('G5 derived girder span distribution within band of real IfcBeam lengths (tolerance)',
    R.girMedSpan > 0.25 * R.beamMedLen && R.girMedSpan < 6 * R.beamMedLen,
    'girderMedianSpan=' + R.girMedSpan.toFixed(2) + 'm  beamMedianLength=' + R.beamMedLen.toFixed(2) + 'm');

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('I6 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));
  console.log('  screenshot: ' + shot);
  console.log('§STR-INTO-ARC: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
