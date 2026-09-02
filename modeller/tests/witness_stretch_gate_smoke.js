#!/usr/bin/env node
/**
 * §STRETCH-GATE-SMOKE — §STRETCH-1 wiring smoke (headless). Proves the seeded ARC building is now actually
 * grid-STRETCHABLE (a gridline drag changes a real wall's geometry) AND that the conformity gate runs on a stretch.
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
  console.log('═══ §STRETCH-GATE-SMOKE — ARC grid-stretchable + gated (headless) ═══');

  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () { return !!(window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0) && !!(window.Bonsai.gridmove); }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(400);

  // find a gridline whose drag produces a recompose command for a SEEDED wall (so the stretch is on the real building)
  var plan = await page.evaluate(function () {
    var GM = window.Bonsai.gridmove, gbf = window.__arcGuidByFid;   // fid → guid (a command targets a SEEDED element)
    var lines = GM.gridLines();
    for (var d = 0; d < 2; d++) {
      var delta = d === 0 ? 0.6 : -0.6;
      for (var i = 0; i < lines.length; i++) {
        var cmds = GM.computeCommands(lines[i].id, delta);
        var hit = cmds.find(function (c) { return gbf[c.featureId] != null; });   // prefer a SCALE (a true stretch) if present
        var scaleHit = cmds.find(function (c) { return gbf[c.featureId] != null && c.action === 'SCALE'; });
        if (scaleHit || hit) { var pick = scaleHit || hit; return { id: lines[i].id, delta: delta, fid: pick.featureId, action: pick.action, n: cmds.length }; }
      }
    }
    return { id: null };
  });
  chk('S1 a gridline drag recomposes a SEEDED wall (the real building is grid-attached)', plan.id != null, 'grid=' + plan.id + ' fid=' + plan.fid + ' action=' + plan.action);

  function meshBox(fid) { return page.evaluate(function (f) { var g = window.Bonsai.group(); var m = g.children.find(function (o) { return o.isMesh && o.userData.featureId === f; }); if (!m) return null; m.geometry.computeBoundingBox(); var b = m.geometry.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; }, fid); }

  var before = await meshBox(plan.fid);
  await page.evaluate(async function (p) { await window.__gridStretch(p.id, p.delta); }, plan);
  await page.waitForTimeout(500);
  var after = await meshBox(plan.fid);
  var changed = before && after && before.some(function (v, i) { return Math.abs(v - after[i]) > 1e-4; });
  chk('S2 the seeded wall GEOMETRY changed (insert is now grid-stretchable, was a no-op before)', changed,
    'before=[' + (before || []).map(function (x) { return x.toFixed(2); }) + '] after=[' + (after || []).map(function (x) { return x.toFixed(2); }) + ']');

  // gate ran on the stretch: §GATE evaluated (look for the gate to have executed — log line OR a clean pass with no error)
  var gateRan = await page.evaluate(function () { return window.__lastGate !== undefined; });
  chk('S3 the conformity gate RAN on the stretch (commitGridMove → _runGate wired)', gateRan, 'lastGate="' + (await page.evaluate(function () { return window.__lastGate; })) + '"');

  // force a clash: drag the same gridline by a LARGE delta so the recomposed wall drives into the building → RED
  var redBefore = logs.filter(function (l) { return /§GATE red=[1-9]/.test(l); }).length;
  await page.evaluate(async function (p) { await window.__gridStretch(p.id, p.delta > 0 ? 8 : -8); }, plan);
  await page.waitForTimeout(500);
  var redLogged = logs.filter(function (l) { return /§GATE red=[1-9]/.test(l); }).length > redBefore;
  var gateMsg = await page.evaluate(function () { return window.__lastGate; });
  chk('S4 a large stretch that drives a wall into the building → RED conformity flagged', redLogged || /RED/.test(gateMsg || ''),
    'red=' + redLogged + ' lastGate="' + gateMsg + '" ' + (logs.filter(function (l) { return /§GATE red=/.test(l); }).slice(-1)[0] || ''));

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('S5 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('§STRETCH-GATE-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
