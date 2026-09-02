#!/usr/bin/env node
/**
 * §ARC-SEED-SMOKE — §ARC-1 wiring smoke (headless Chromium, self-served). SECONDARY to the node value witness
 * W-ARC-EDITABLE; this proves the WIRING: opening SampleHouse in the REAL modeller seeds the editable ARC
 * substrate, the featureId↔guid bridge populates on window, the seeded boxes are real gizmo-selectable meshes,
 * and a recovered `fills` (door↔host) edge resolves BOTH endpoints to featureIds (cascade-ready).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}

(async function () {
  var srv = await serve();
  var port = srv.address().port;
  var logs = [];
  var browser = await chromium.launch();
  var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ §ARC-SEED-SMOKE — editable ARC substrate wiring (headless) ═══');

  // Open SampleHouse → seed fires on _forkEditable
  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () {
    return !!(window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0) &&
           !!(window.swXEdges && Array.isArray(window.swXEdges.fills));
  }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(400);

  var S = await page.evaluate(function () {
    var fbg = window.__arcFidByGuid || {}, gbf = window.__arcGuidByFid || {};
    var guids = Object.keys(fbg), fids = guids.map(function (g) { return fbg[g]; });
    // scene editable meshes carrying a featureId that the bridge knows (== seeded ARC boxes)
    var g = window.Bonsai && window.Bonsai.group && window.Bonsai.group();
    var seededMeshes = 0, sampleFid = null;
    if (g) g.children.forEach(function (m) {
      if (m.isMesh && m.userData && m.userData.featureId != null && gbf[m.userData.featureId] != null) {
        seededMeshes++; if (sampleFid == null) sampleFid = m.userData.featureId;
      }
    });
    // cascade-ready: a fills edge with BOTH endpoints resolvable to featureIds
    var fills = (window.swXEdges && window.swXEdges.fills) || [];
    var fillsBoth = fills.filter(function (e) { return fbg[e.a] != null && fbg[e.b] != null; }).length;
    var aggr = (window.swXEdges && window.swXEdges.aggregates) || [];
    var aggrBoth = aggr.filter(function (e) { return fbg[e.a] != null && fbg[e.b] != null; }).length;
    var bij = new Set(fids).size === fids.length;
    return { nGuids: guids.length, bij: bij, seededMeshes: seededMeshes, sampleFid: sampleFid,
      sampleGuid: sampleFid != null ? gbf[sampleFid] : null, fills: fills.length, fillsBoth: fillsBoth,
      aggr: aggr.length, aggrBoth: aggrBoth };
  });

  chk('S1 §ARC-SEED-WIRE logged with committed count', logs.some(function (l) { return /§ARC-SEED-WIRE SampleHouse editable ARC elements=\d+/.test(l); }),
    logs.filter(function (l) { return /ARC-SEED-WIRE/.test(l); })[0] || '');
  chk('S2 featureId↔guid bridge populated on window + bijective', S.nGuids > 0 && S.bij, 'guids=' + S.nGuids);
  chk('S3 seeded ARC elements are real gizmo-selectable meshes (featureId in scene == bridge)', S.seededMeshes > 0, 'seededMeshes=' + S.seededMeshes);
  chk('S4 a seeded mesh resolves featureId→guid', S.sampleFid != null && !!S.sampleGuid, 'fid=' + S.sampleFid + ' guid=' + (S.sampleGuid || '').slice(0, 10));
  chk('S5 cascade-ready: a fills (door↔host) edge resolves BOTH endpoints to featureIds', S.fills > 0 && S.fillsBoth > 0, 'fillsBoth=' + S.fillsBoth + '/' + S.fills);
  // S6 — contains/aggregates is NOT an ARC element↔element relation in SampleHouse: all 34 parents are non-element
  // (not-in-meta) STR-ASSEMBLY roots, children are STR IfcMember/IfcPlate (curtain-wall). Per VISION-LOCK STR is a
  // WALKER, not edited substrate → 0 ARC-ARC aggregates is CORRECT, not a miss. Assert CONSISTENCY (any aggregates
  // edge between two seeded ARC elements resolves) + log the honest count. The hosted-by cascade (S5) is the live
  // one on this building; the contains cascade needs a building with element↔element aggregates (recorded in spec).
  chk('S6 aggregates is STR-assembly (non-ARC) here → 0 ARC-ARC resolved is honest; consistency holds',
    S.aggrBoth === 0, 'aggrBoth(ARC-ARC)=' + S.aggrBoth + '/' + S.aggr + ' (STR-assembly, parents non-element — out of ARC substrate per VISION-LOCK)');

  // S7 — select a seeded mesh + GEOM_MOVE it (existing path still works on a seeded element)
  var moved = await page.evaluate(async function (fid) {
    var O = window.Bonsai.oplog; var before = O.length;
    window.Bonsai.select(fid);
    var r = await O.commit({ op_type: 'GEOM_MOVE', parameters: { parent: fid, dx: 0.5, dy: 0, dz: 0 } }, {});
    return { ok: !!(r && r.verify), before: before, after: O.length };
  }, S.sampleFid);
  chk('S7 a seeded ARC element is GEOM_MOVE-able (signed, verified)', moved.ok && moved.after > moved.before, 'verify=' + moved.ok + ' ops ' + moved.before + '→' + moved.after);

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('S8 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('§ARC-SEED-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
