#!/usr/bin/env node
/**
 * §SDG-CASCADE-SMOKE — wiring smoke (headless, self-served). End-to-end: open SampleHouse → select a HOST wall →
 * enter Move → ArrowRight nudge → commitMove fires the hosted-by cascade → the hosted DOOR mesh RIDES by the same
 * delta. SECONDARY to the node value witness W-SDG-CASCADE-MODELLER; proves the commitMove integration + §-log.
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
  console.log('═══ §SDG-CASCADE-SMOKE — hosted-by ride wiring (headless) ═══');

  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () { return !!(window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0) && !!(window.swXEdges && Array.isArray(window.swXEdges.fills)); }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(400);

  // pick a host wall that has a seeded filling; record both mesh centres BEFORE
  var pick = await page.evaluate(function () {
    var fbg = window.__arcFidByGuid, fills = window.swXEdges.fills;
    var e = fills.find(function (e) { return fbg[e.host_guid] != null && fbg[e.filling_guid] != null; });
    if (!e) return { ok: false };
    function meshC(fid) { var g = window.Bonsai.group(); var m = g && g.children.find(function (o) { return o.isMesh && o.userData.featureId === fid; }); if (!m) return null; m.geometry.computeBoundingBox(); var b = m.geometry.boundingBox; return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2]; }
    var hostFid = fbg[e.host_guid], doorFid = fbg[e.filling_guid];
    window.Bonsai.select(hostFid);
    return { ok: true, hostFid: hostFid, doorFid: doorFid, hostBefore: meshC(hostFid), doorBefore: meshC(doorFid), step: (function () { var i = document.getElementById('dim-move'); return i ? parseFloat(i.value) : 1; })() };
  });
  chk('G1 a host wall with a seeded filling is selectable', pick.ok && pick.hostBefore && pick.doorBefore, 'host=' + (pick.hostFid) + ' door=' + (pick.doorFid));

  // enter Move mode, nudge +X via ArrowRight → commitMove fires the cascade
  await page.click('#b-move'); await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(function () { return window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog.length >= 41; }, { timeout: 8000 }).catch(function () {});
  await page.waitForTimeout(400);

  var after = await page.evaluate(function (p) {
    function meshC(fid) { var g = window.Bonsai.group(); var m = g && g.children.find(function (o) { return o.isMesh && o.userData.featureId === fid; }); if (!m) return null; m.geometry.computeBoundingBox(); var b = m.geometry.boundingBox; return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2]; }
    return { hostAfter: meshC(p.hostFid), doorAfter: meshC(p.doorFid), ops: window.Bonsai.oplog.length };
  }, pick);

  function approx(a, b) { return Math.abs(a - b) <= 1e-4; }
  var step = pick.step;
  var hostDx = after.hostAfter[0] - pick.hostBefore[0];
  var doorDx = after.doorAfter[0] - pick.doorBefore[0];
  chk('G2 host wall moved +' + step + 'm in X', approx(hostDx, step), 'hostDx=' + hostDx.toFixed(3));
  chk('G3 hosted DOOR RIDES the wall (same +' + step + 'm in X, not left behind)', approx(doorDx, step), 'doorDx=' + doorDx.toFixed(3));
  chk('G4 rigid: door & wall moved by the SAME delta', approx(hostDx, doorDx), 'host=' + hostDx.toFixed(3) + ' door=' + doorDx.toFixed(3));
  chk('G5 §SDG-CASCADE hosted-by logged with a rider', logs.some(function (l) { return /§SDG-CASCADE hosted-by rider=/.test(l); }), logs.filter(function (l) { return /SDG-CASCADE/.test(l); })[0] || '');
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('G6 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('§SDG-CASCADE-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
