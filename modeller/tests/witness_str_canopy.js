#!/usr/bin/env node
/**
 * §8E-2a W-STR-CANOPY — headless proof that the STR space-frame renders as a BOUNDED GENERATIVE tessellation into the
 * laid ARC, and that the generative TOLERANCE bar holds vs the real plate cloud (ORACLE). The Terminal roof = 33,324
 * IfcPlate = one measured unit `instanced-by n`. We DO NOT reproduce positions (refused on principle) — we reconstruct
 * COUNT + CADENCE + COVERAGE and render a thinned-but-representative canopy. Substrate: Terminal_arcstr_proof.db (the
 * laid ARC shell) + Terminal_plates_proof.db (the real plate cloud, transforms only = oracle).
 *   P1 count |predictedN−extractedN|/extractedN ≤ 5% (the ONE confirmable thing — the measurement doctrine)
 *   P2 unit == MEASURED modal plate bbox (0-tol) + modal share reported
 *   P3 generated domain ≈ real domain in x/y (same footprint/frame within a unit; z is a known mid-surface simplification)
 *   P4 NN cadence — generated cloud spacing ≈ real cloud spacing (within band; NOT generated-to-real match = no collusion)
 *   P5 §READPIXELS A/B-isolated — the bounded canopy rasterizes over the laid ARC (> noise floor)
 *   P6 §DW-CAP logged (render bounded, count proven numerically not drawn)
 *   P7 NON-INVENT falsifier — empty plate set → null tessellation → zero ops (fabricates nothing)
 *   P8 no script LOAD_FAIL / pageerror
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
  await page.waitForFunction(function () {
    return window.__sceneReady === true && !!window.SQL && !!window.ArcEditable &&
           !!window.swbCanopyOps && !!window.swDeriveTessellation && !!window.swWalkTessellation;
  }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(n, c, x) { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } }
  console.log('═══ §8E-2a W-STR-CANOPY — STR space-frame generative tessellation into the laid ARC (headless) ═══');

  var R = await page.evaluate(async function (port) {
    var O = window.Bonsai.oplog; await O.setModelKey('mo_canopy');
    // 1) lay the real ARC shell (context — the canopy renders OVER it)
    var abuf = await (await fetch('http://localhost:' + port + '/modeller/Terminal_arcstr_proof.db')).arrayBuffer();
    var adb = new window.SQL.Database(new Uint8Array(abuf));
    var ar = await window.ArcEditable.seedArc(adb, {
      commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid); },
      registerGeometry: function (assets) { window.Bonsai.library.registerRealGeometry(assets); }, building: 'canopy' });
    adb.close();
    // 2) read the real plate cloud (oracle) from the focused plate fixture
    var pbuf = await (await fetch('http://localhost:' + port + '/modeller/Terminal_plates_proof.db')).arrayBuffer();
    var pdb = new window.SQL.Database(new Uint8Array(pbuf));
    var pres = pdb.exec("SELECT t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcPlate'");
    pdb.close();
    var plates = pres[0].values.map(function (v) { return { x: v[0], y: v[1], z: v[2], bx: v[3], by: v[4], bz: v[5] }; });
    // measured modal plate bbox (independent of the engine) — the P2 oracle
    var hist = {}; plates.forEach(function (p) { var k = p.bx.toFixed(1) + 'x' + p.by.toFixed(1) + 'x' + p.bz.toFixed(2); hist[k] = (hist[k] || 0) + 1; });
    var mk = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; })[0]; var mu = mk.split('x').map(Number);
    // real domain x/y
    var rx = plates.map(function (p) { return p.x; }), ry = plates.map(function (p) { return p.y; });
    var realDom = { minX: Math.min.apply(null, rx), maxX: Math.max.apply(null, rx), minY: Math.min.apply(null, ry), maxY: Math.max.apply(null, ry) };
    // 3) numerical bar — tessellation + generated cloud (independent of the render verb)
    var tess = window.swDeriveTessellation(plates);
    var full = window.swWalkTessellation(tess, tess.predictedN);
    function nn(pts, sample) {
      var K = Math.min(sample, pts.length), step = Math.max(1, Math.floor(pts.length / K)), ds = [];
      for (var i = 0; i < pts.length; i += step) {
        var a = pts[i], best = 1e9;
        for (var j = 0; j < pts.length; j++) { if (j === i) continue; var dx = a.x - pts[j].x, dy = a.y - pts[j].y, dz = a.z - pts[j].z, d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < best) best = d; }
        ds.push(best);
      }
      return ds.reduce(function (s, v) { return s + v; }, 0) / ds.length;
    }
    var realNN = nn(plates, 150), genNN = nn(full, 150);
    var gx = full.map(function (p) { return p.x; }), gy = full.map(function (p) { return p.y; });
    var genDom = { minX: Math.min.apply(null, gx), maxX: Math.max.apply(null, gx), minY: Math.min.apply(null, gy), maxY: Math.max.apply(null, gy) };
    // 4) RENDER via the production bridge verb (bounded, §DW-CAP)
    var rr = window.swbCanopyOps(plates, { cap: 2500 });
    var sr = await O.commitSeedGroup(rr.ops, 'canopy-render');
    var canFids = sr.ids || [];
    // 5) falsifier — empty plate set fabricates nothing
    var empty = window.swbCanopyOps([], {});
    return {
      arcCommitted: ar.committed, plateN: plates.length,
      unit: tess.unit, modalUnit: { bx: mu[0], by: mu[1], bz: mu[2] }, modalShare: tess.modalShare,
      predictedN: tess.predictedN, extractedN: tess.extractedN,
      countErr: Math.abs(tess.predictedN - tess.extractedN) / tess.extractedN,
      realNN: realNN, genNN: genNN, realDom: realDom, genDom: genDom,
      canFids: canFids, renderedN: rr.renderedN, generatedN: rr.generatedN, emptyOps: empty.ops.length, emptyTess: empty.tess
    };
  }, port);
  await page.waitForTimeout(500);

  var probeCan = await page.evaluate(function (fids) { return window.__arcPixelProbe(fids); }, R.canFids);
  var shot = path.join(ROOT, 'modeller', 'tests', 'str_canopy.png');
  await page.screenshot({ path: shot });

  chk('P1 COUNT predictedN ≈ extractedN (≤5% — the measurement-doctrine headline)', R.countErr <= 0.05 && R.extractedN === 33324,
    'predictedN=' + R.predictedN + ' extractedN=' + R.extractedN + ' err=' + (R.countErr * 100).toFixed(2) + '%');
  chk('P2 UNIT == MEASURED modal plate bbox (0-tol, non-invent)',
    R.unit.bx === R.modalUnit.bx && R.unit.by === R.modalUnit.by && R.unit.bz === R.modalUnit.bz,
    'unit=' + R.unit.bx + '×' + R.unit.by + '×' + R.unit.bz + 'm modalShare=' + (R.modalShare * 100).toFixed(1) + '%');
  var dxErr = Math.max(Math.abs(R.genDom.minX - R.realDom.minX), Math.abs(R.genDom.maxX - R.realDom.maxX));
  var dyErr = Math.max(Math.abs(R.genDom.minY - R.realDom.minY), Math.abs(R.genDom.maxY - R.realDom.maxY));
  chk('P3 generated DOMAIN ≈ real domain in x/y (same footprint within a unit)', dxErr <= 2 && dyErr <= 2,
    'Δx=' + dxErr.toFixed(2) + 'm Δy=' + dyErr.toFixed(2) + 'm (gen x[' + R.genDom.minX.toFixed(0) + ',' + R.genDom.maxX.toFixed(0) + '] vs real x[' + R.realDom.minX.toFixed(0) + ',' + R.realDom.maxX.toFixed(0) + '])');
  // CADENCE: same order of magnitude (cm-scale) — generated band model is slightly tighter than the real cloud; the
  // bar is "within band" (NOT a per-element match — that would be collusion). Calibrated: real 0.15m, gen 0.082m.
  var ratio = R.genNN / R.realNN;
  chk('P4 NN CADENCE — generated spacing within band of real spacing (0.3×–3×, no per-element match)', ratio >= 0.3 && ratio <= 3,
    'realNN=' + R.realNN.toFixed(3) + 'm genNN=' + R.genNN.toFixed(3) + 'm ratio=' + ratio.toFixed(2) + '×');
  chk('P5 §READPIXELS — bounded canopy rasterizes over the laid ARC (A/B-isolated > 2000 real px)', probeCan.arcPainted > 2000,
    'canopyPainted=' + probeCan.arcPainted + 'px (' + (probeCan.arcPaintedFrac * 100).toFixed(1) + '%, rendered=' + R.renderedN + ' of ' + R.generatedN + ' generated)');
  var capLog = logs.filter(function (l) { return /§DW-CAP canopy/.test(l); });
  chk('P6 §DW-CAP logged (render bounded; count proven numerically, not drawn)', capLog.length > 0 && R.renderedN < R.generatedN,
    capLog[0] || ('rendered=' + R.renderedN + ' generated=' + R.generatedN));
  chk('P7 NON-INVENT falsifier — empty plate cloud → null tessellation → zero ops', R.emptyOps === 0 && R.emptyTess === null,
    'emptyOps=' + R.emptyOps + ' emptyTess=' + R.emptyTess);
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('P8 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));
  console.log('  screenshot: ' + shot);
  console.log('§STR-CANOPY: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
