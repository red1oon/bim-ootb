#!/usr/bin/env node
/**
 * W-DW-OPLOG — headless witness for tack-chain op-log emit (RESUME_NEXT_SESSION §Tack-chain):
 *   disc-walk placements are committed as signed GEOM_INSERT ops in the op-log so the walk is
 *   undoable and enterprise-foldable. Each op carries parameters._dw (disc/storey/prov/ifc/host)
 *   that persists in the DB via JSON.stringify and survives scrub/replay.
 *
 * Uses SampleHouse: 55 FP placements (50 array IfcFireSuppressionTerminal + 5 SHIM IfcAlarm).
 *
 * Checks (6):
 *   O1 FP walk emits §DISC-WALK-COMMIT with committed>0
 *   O2 oplog contains N GEOM_INSERT ops with parameters._dw.disc === 'FP'
 *   O3 SHIM placement: ≥1 op has parameters._dw.host not null (IfcAlarm → host-wall tacked)
 *   O4 undo (scrubTo length−1) reduces the FP GEOM_INSERT count by 1
 *   O5 redo (scrubTo length) restores the count
 *   O6 no script LOAD_FAIL / pageerror
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

async function openResident(page, key) {
  await page.click('#b-open');
  await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="' + key + '"]');
  await page.waitForFunction(function () {
    var t = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
    return !!t && Object.keys(t.nodes).some(function (id) { return t.nodes[id].kind === 'disc'; });
  }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForFunction(function () { return window.DiscWalker && window.DiscWalker._ready(); }, null, { timeout: 25000 }).catch(function () {});
  // wait for catalog to load so hash lookups work
  await page.waitForFunction(function () { return window.Bonsai && window.Bonsai.library && (window.Bonsai.library.catalog() || []).length > 0; }, null, { timeout: 10000 }).catch(function () {});
  await page.waitForTimeout(300);
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
  console.log('═══ W-DW-OPLOG — tack-chain op-log emit (headless, SampleHouse) ═══');

  await openResident(page, 'SampleHouse');

  // ── walk FP onto SampleHouse ─────────────────────────────────────────────────────────────────────
  logs.length = 0;
  await page.click('#bo-tree [data-disc="FP"]');

  // wait for markers to render (fast) then for commit loop to finish (sentinel set by _commitDiscWalk)
  await page.waitForFunction(function () { return !!(window.__dwWalks && window.__dwWalks.FP && window.__dwWalks.FP.length > 0); }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForFunction(function () { return window.__dwLastCommitDisc === 'FP'; }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(300);

  // O1: §DISC-WALK-COMMIT logged with committed>0
  var commitLog = logs.find(function (l) { return /§DISC-WALK-COMMIT disc=FP/.test(l); }) || '';
  var committedN = parseInt((commitLog.match(/committed=(\d+)/) || [0, 0])[1], 10);
  chk('O1 FP walk emits §DISC-WALK-COMMIT committed>0', committedN > 0, commitLog || 'no log found');

  // O2: oplog contains N GEOM_INSERT ops with parameters._dw.disc === 'FP'
  var fpOps = await page.evaluate(function () {
    if (!window.Bonsai.oplog || !window.Bonsai.oplog.db) return [];
    return window.Bonsai.oplog._geomOps().filter(function (o) {
      return o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'FP';
    }).map(function (o) { return { id: o.id, ifc: o.parameters._dw.ifc, host: o.parameters._dw.host, prov: o.parameters._dw.prov }; });
  });
  chk('O2 oplog contains FP GEOM_INSERT ops with _dw.disc', fpOps.length > 0 && fpOps.length === committedN,
    'oplog FP ops=' + fpOps.length + ' committed=' + committedN);

  // O3: ≥1 SHIM op has _dw.host not null (IfcAlarm tacked onto host wall guid)
  var shimOps = fpOps.filter(function (o) { return o.host; });
  chk('O3 SHIM: ≥1 op has _dw.host guid (IfcAlarm→host-wall tacked)', shimOps.length > 0,
    'shim ops=' + shimOps.length + (shimOps[0] ? ' eg host=' + String(shimOps[0].host).slice(0, 14) + '…' : ''));

  // O4: undo() marks the last FP GEOM_INSERT as undone → active count drops by 1
  await page.evaluate(function () { return window.Bonsai.oplog.undo(); });
  await page.waitForTimeout(200);
  var fpCountAfterUndo = await page.evaluate(function () {
    if (!window.Bonsai.oplog || !window.Bonsai.oplog.db) return -1;
    return window.Bonsai.oplog._geomOps().filter(function (o) {
      return o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'FP';
    }).length;
  });
  chk('O4 undo() marks last FP GEOM_INSERT undone (count −1)', fpCountAfterUndo === fpOps.length - 1,
    'before=' + fpOps.length + ' after-undo=' + fpCountAfterUndo);

  // O5: redo() restores the undone op → count back to N
  await page.evaluate(function () { return window.Bonsai.oplog.redo(); });
  await page.waitForTimeout(200);
  var fpCountAfterRedo = await page.evaluate(function () {
    if (!window.Bonsai.oplog || !window.Bonsai.oplog.db) return -1;
    return window.Bonsai.oplog._geomOps().filter(function (o) {
      return o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'FP';
    }).length;
  });
  chk('O5 redo() restores FP op count', fpCountAfterRedo === fpOps.length,
    'expected=' + fpOps.length + ' got=' + fpCountAfterRedo);

  // O6: no script LOAD_FAIL / pageerror
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('O6 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  if (fail) {
    console.log('--- DW-OPLOG logs ---');
    logs.filter(function (l) { return /DISC-WALK|DW|LOAD_FAIL|PAGEERROR|FAIL/.test(l); }).slice(0, 16).forEach(function (l) { console.log('   ' + l); });
  }
  console.log('W-DW-OPLOG: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
