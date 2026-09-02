#!/usr/bin/env node
/**
 * §GATE-SMOKE — §GATE-1 wiring smoke (headless, self-served). Drives the REAL commitMove: a clean move raises NO
 * flag; driving one element onto another raises a RED conformity violation (§GATE log + RED toast + status tag).
 * SECONDARY to the node value witness W-SDG-GATE.
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
  console.log('═══ §GATE-SMOKE — conformity gate wiring (headless) ═══');

  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () { return !!(window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0) && !!(window.SdgGate); }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(400);

  // pick the two MOST-SEPARATED editable elements (guaranteed unrelated) → moving A onto B is a clean clash.
  // §XEDGE-REAL-AABB regression (cross_edges.js now correctly resolves real per-element abuts — see
  // RESUME_SESSION_2026-07-04_GATE_BACKPROP.md item 3 / witness_cross_edges_real_aabb.js): the "clean lift"
  // leg needs an element with ZERO real abuts edges (e.g. a wall resting flush on the floor slab now
  // correctly reads as touching it — lifting it away is a REAL, correct abuts-realign ORANGE, not a bug).
  // bestA is picked from the isolated set for the lift; bestB stays "most separated from bestA" over ALL
  // boxes for the clash-drive leg (unaffected by this constraint).
  var plan = await page.evaluate(function () {
    var g = window.Bonsai.group(); var boxes = [];
    g.children.forEach(function (m) { if (m.isMesh && m.userData && m.userData.featureId != null && window.__arcGuidByFid[m.userData.featureId] != null) { m.geometry.computeBoundingBox(); var b = m.geometry.boundingBox; boxes.push({ fid: m.userData.featureId, c: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2] }); } });
    var fbg = window.__arcFidByGuid || {}, X = window.swXEdges || {}, touched = {};
    (X.abuts || []).forEach(function (e) { var a = fbg[e.a], b = fbg[e.b]; if (a != null) touched[a] = 1; if (b != null) touched[b] = 1; });
    var isolated = boxes.filter(function (bx) { return !touched[bx.fid]; });
    var pool = isolated.length ? isolated : boxes;   // graceful: if somehow everything abuts, fall back (old behaviour)
    var bestA = null, bestB = null, bd = -1;
    for (var i = 0; i < pool.length; i++) for (var j = 0; j < boxes.length; j++) {
      if (pool[i].fid === boxes[j].fid) continue;
      var d = Math.hypot(pool[i].c[0] - boxes[j].c[0], pool[i].c[1] - boxes[j].c[1], pool[i].c[2] - boxes[j].c[2]);
      if (d > bd) { bd = d; bestA = pool[i]; bestB = boxes[j]; }
    }
    return { aFid: bestA.fid, bFid: bestB.fid, delta: [bestB.c[0] - bestA.c[0], bestB.c[1] - bestA.c[1], bestB.c[2] - bestA.c[2]], n: boxes.length, isolatedN: isolated.length };
  });
  chk('G1 substrate ready (editable elements + SdgGate loaded)', plan.n > 0 && plan.aFid != null, 'elements=' + plan.n);

  // clean move: lift element A +10m into open space → NO gate flag
  await page.evaluate(async function (p) { window.Bonsai.select(p.aFid); await window.__commitMove(0, 0, 10); }, plan);
  await page.waitForTimeout(250);
  var cleanGate = await page.evaluate(function () { return window.__lastGate; });
  chk('G2 clean move (lift into open space) raises NO flag', !cleanGate, 'lastGate="' + cleanGate + '"');
  var redLogsBefore = logs.filter(function (l) { return /§GATE red=[1-9]/.test(l); }).length;

  // clash move: drive A onto B (delta = B.centre − A.centre) → RED conformity violation
  await page.evaluate(async function (p) { window.Bonsai.select(p.aFid); await window.__commitMove(p.delta[0], p.delta[1], p.delta[2] - 10); }, plan);
  await page.waitForTimeout(350);
  var clashGate = await page.evaluate(function () { return window.__lastGate; });
  var redLogged = logs.some(function (l) { return /§GATE red=[1-9]/.test(l); });
  var redToast = logs.some(function (l) { return /§TOAST kind=error.*conformity violation/.test(l); });
  chk('G3 driving one element onto another → RED conformity violation flagged', /RED/.test(clashGate || ''), 'lastGate="' + clashGate + '"');
  chk('G4 §GATE red=N logged', redLogged, logs.filter(function (l) { return /§GATE red=/.test(l); }).slice(-1)[0] || '');
  chk('G5 RED toast raised (the MRP exception message)', redToast, logs.filter(function (l) { return /§TOAST.*conformity/.test(l); }).slice(-1)[0] || '');
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('G6 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('§GATE-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
