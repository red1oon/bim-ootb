#!/usr/bin/env node
/**
 * §OBB-SMOKE — W-SDG-OBB browser wiring smoke (headless, self-served, REAL SampleHouse, REAL user path).
 * SECONDARY to the node value witness witness_sdg_gate_obb.js (whitebox §-log first). Proves the modeller
 * actually FEEDS the SAT narrow phase (CLASH_GATE_OBB_NARROWPHASE.md §2) — not just that sdg_gate.js could:
 *   S1 §GATE-OBB map builds from the live op-log. Recon fact (2026-07-11, verified live): the resident
 *      *_ARC.db flow PRE-BAKES yaw into world-oriented real meshes (op placement.rot=0) — those elements ARE
 *      axis-aligned boxes to the op-log and correctly stay OUT of the map (honest AABB, no invented
 *      orientation). What the map must carry: SampleHouse_ARC's 3 genuinely tilted elements (placement
 *      rotX/rotY — the §ARC-3AXIS branch). The non-90° yaw params live in the *_extracted.db substrate
 *      (local-file open path + every pure-node witness) — covered by witness_sdg_gate_obb.js W2.
 *   S2 the REAL production scenario the narrow phase serves: user ROTATES an element 45° (GEOM_ROTATE, the
 *      gizmo's own op) then MOVES it (window.__commitMove, the real user path) into a placement where the
 *      world AABBs interpenetrate (> tol) but the real OBBs are disjoint → the LIVE gate stays CLEAN, while
 *      SdgGate.evaluate on the SAME before/after boxes WITHOUT opts.obb (the old AABB-only path) flags a
 *      phantom RED clash. Old-vs-new verdict divergence on one real edit, in the real app.
 *   S3 no script LOAD_FAIL / pageerror
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
function serve() { return new Promise(function (r) { var s = http.createServer(function (rq, rs) { var p = decodeURIComponent(rq.url.split('?')[0]); var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p); fs.readFile(fp, function (e, b) { if (e) { rs.statusCode = 404; return rs.end('nf'); } rs.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream'); rs.setHeader('Accept-Ranges', 'bytes'); rs.end(b); }); }); s.listen(0, function () { r(s); }); }); }

(async function () {
  var srv = await serve(); var port = srv.address().port; var logs = [];
  var browser = await chromium.launch(); var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });
  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
  console.log('═══ §OBB-SMOKE — SAT narrow-phase browser wiring (headless, real user path) ═══');

  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () { return !!(window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0) && !!(window.SdgGate) && !!(window.__gateObb); }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(400);

  // S1 — the live map: SampleHouse_ARC.db carries 3 genuinely tilted elements (placement rotX/rotY, the
  // §ARC-3AXIS seed branch) — the op-log-derived map must carry them; the pre-baked-yaw elements (op rot=0,
  // world-oriented meshes) are correctly ABSENT (they are axis-aligned boxes — AABB is already exact).
  var s1 = await page.evaluate(function () {
    var m = window.__gateObb();
    var ks = m ? Object.keys(m) : [];
    var tilted = ks.filter(function (k) { return m[k].r[0] || m[k].r[1]; }).length;
    return { n: ks.length, tilted: tilted, sample: m ? m[ks[0]] : null };
  });
  chk('S1 §GATE-OBB live map built from the op-log (the 3 tilted elements; pre-baked-yaw honestly absent)',
    s1.n >= 3 && s1.tilted >= 3, 'entries=' + s1.n + ' tilted=' + s1.tilted + ' sample=' + JSON.stringify(s1.sample));

  // S2 — the real production scenario: pick an isolated elongated element A, ROTATE it 45° through the real
  // op (GEOM_ROTATE {parent, drot} — exactly what the rotate gizmo commits; refolds the mesh), confirm the
  // map picked it up, then sweep REAL live boxes for a placement near some unrelated B where the OLD
  // AABB-only evaluate flags exactly one phantom clash {A,B} and the NEW obb-fed evaluate is clean; DRIVE
  // that move through the real commitMove and read the LIVE gate.
  var s2plan = await page.evaluate(async function () {
    var boxes0 = window.__gateBoxes(), rel = window.__gateRel(), fbg = window.__arcFidByGuid || {};
    var X = window.swXEdges || {}, touched = {};
    (X.abuts || []).forEach(function (e) { var a = fbg[e.a], b = fbg[e.b]; if (a != null) touched[a] = 1; if (b != null) touched[b] = 1; });
    // most elongated untouched element (long thin footprint = biggest AABB inflation at 45° = clearest pocket)
    var A = null, bestElong = 0;
    Object.keys(boxes0).forEach(function (f) {
      if (touched[f]) return;
      var b = boxes0[f], ex = b[1] - b[0], ey = b[3] - b[2];
      var e = Math.max(ex, ey) / Math.max(0.05, Math.min(ex, ey));
      if (e > bestElong) { bestElong = e; A = +f; }
    });
    if (A == null) return { err: 'no isolated element' };
    var res = await window.Bonsai.oplog.commit({ op_type: 'GEOM_ROTATE', parameters: { parent: A, drot: 45 } }, {});
    var boxes = window.__gateBoxes();                        // post-rotation live boxes (mesh refolded)
    var obb = window.__gateObb();
    if (!obb || !obb[A]) return { err: 'rotated element missing from §GATE-OBB map', A: A, verify: res && res.verify };
    var ctr = function (b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2] };
    var cA = ctr(boxes[A]);
    var partners = Object.keys(boxes).map(Number).filter(function (f) { return f !== A && !rel.related(A, f); });
    partners.sort(function (p, q) {                          // nearest-first: pockets live around close neighbours
      var cp = ctr(boxes[p]), cq = ctr(boxes[q]);
      return Math.hypot(cp[0] - cA[0], cp[1] - cA[1]) - Math.hypot(cq[0] - cA[0], cq[1] - cA[1]);
    });
    for (var pi = 0; pi < Math.min(partners.length, 8); pi++) {
      var B = partners[pi], cB = ctr(boxes[B]);
      for (var di = 0; di < 16; di++) {
        var dir = [Math.cos(di * Math.PI / 8), Math.sin(di * Math.PI / 8), 0];
        for (var t = 4.0; t >= 0.2; t -= 0.02) {
          var d = [cB[0] + dir[0] * t - cA[0], cB[1] + dir[1] * t - cA[1], 0];
          var after = {}; Object.keys(boxes).forEach(function (f) { after[f] = boxes[f]; });
          after[A] = [boxes[A][0] + d[0], boxes[A][1] + d[0], boxes[A][2] + d[1], boxes[A][3] + d[1], boxes[A][4], boxes[A][5]];
          var gOld = window.SdgGate.evaluate(boxes, after, [A], rel, {});
          if (gOld.red.length !== 1 || gOld.red[0].kind !== 'clash') continue;
          if (!((gOld.red[0].a === A && gOld.red[0].b === B) || (gOld.red[0].a === B && gOld.red[0].b === A))) continue;
          var gNew = window.SdgGate.evaluate(boxes, after, [A], rel, { obb: obb });
          if (gNew.red.length === 0) return { A: A, B: B, d: d, aabbDepth: gOld.red[0].depth, elong: bestElong };
        }
      }
    }
    return { err: 'no divergence pocket found on live meshes', A: A };
  });
  if (s2plan.err) {
    chk('S2 divergence pocket exists on live meshes', false, s2plan.err);
  } else {
    console.log('  §OBB-SMOKE plan: fid ' + s2plan.A + ' (rotated 45°, elong=' + s2plan.elong.toFixed(1) + ') vs fid ' + s2plan.B + ' → Δ(' + s2plan.d[0].toFixed(3) + ',' + s2plan.d[1].toFixed(3) + ') aabbPhantomDepth=' + s2plan.aabbDepth + 'm');
    var s2 = await page.evaluate(async function (p) {
      var before = window.__gateBoxes();
      window.Bonsai.select(p.A);
      await window.__commitMove(+p.d[0].toFixed(4), +p.d[1].toFixed(4), 0);
      var after = window.__gateBoxes();
      // the OLD path's verdict on the exact same real edit (no obb):
      var gOld = window.SdgGate.evaluate(before, after, [p.A], window.__gateRel(), {});
      return { liveGate: window.__lastGate, oldRed: gOld.red.length, oldKinds: gOld.red.map(function (r) { return r.kind + ':' + r.a + '-' + r.b + '@' + r.depth; }) };
    }, s2plan);
    chk('S2a LIVE gate (obb-fed, real commitMove) stays CLEAN on the rotated near-miss', !/RED/.test(s2.liveGate || ''), 'lastGate="' + (s2.liveGate || '') + '"');
    chk('S2b SAME edit through the old AABB-only evaluate = phantom RED clash (the false positive this closes)', s2.oldRed >= 1, s2.oldKinds.join(','));
    var obbLogged = logs.some(function (l) { return /§GATE-OBB entries=\d+/.test(l); });
    chk('S2c §GATE-OBB whitebox log emitted on the live gate call', obbLogged, logs.filter(function (l) { return /§GATE-OBB/.test(l); }).slice(-1)[0] || '');
  }

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('S3 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('§OBB-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
