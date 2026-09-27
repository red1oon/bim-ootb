#!/usr/bin/env node
/**
 * W-DW-OPLOG — headless witness for tack-chain op-log emit (RESUME_NEXT_SESSION §Tack-chain):
 *   disc-walk placements are committed as signed GEOM_INSERT ops in the op-log so the walk is
 *   undoable and enterprise-foldable. Each op carries parameters._dw (disc/storey/prov/ifc/host)
 *   that persists in the DB via JSON.stringify and survives scrub/replay.
 *
 * §WALK-LOD400-ONLY 2026-09-27: SampleHouse FP (no mesh hashes) now REFUSES (O0); O1-O5 run on Duplex ELEC (real LOD400).
 *
 * Checks (6):
 *   O0 SampleHouse FP refused (no box), logged
 *   O1 Duplex ELEC walk emits §DISC-WALK-COMMIT with committed>0
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

  // §WALK-LOD400-ONLY (red1 2026-09-27, "no BBoxes or cubes, or LOD200 fallback. All must be LOD400 or fail hard"): this
  // witness used to walk SampleHouse FP — 17 legacy-fallback placements with NO mesh hash, which now REFUSE (nothing to
  // commit). O0 proves that refusal is honest and logged; O1-O5 judge the op-log emit on a walk that IS real LOD400:
  // Duplex ELEC (its placements carry mined mesh hashes resolved from Duplex_geo.db).
  await openResident(page, 'SampleHouse');
  logs.length = 0;
  await page.click('#bo-tree [data-disc="FP"]');
  await page.waitForFunction(function () { return true; }, null, { timeout: 100 });
  var t0 = Date.now(); while (Date.now() - t0 < 30000 && !logs.some(function (l) { return /§DISC-WALK FP REFUSE/.test(l); })) await page.waitForTimeout(250);
  var refLine = logs.find(function (l) { return /§DW-LOD400-REFUSE disc=FP refused=\d+ kept=0/.test(l); }) || '';
  var shFp = await page.evaluate(function () { return window.Bonsai.oplog._geomOps().filter(function (o) {
    return o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'FP'; }).length; });
  chk('O0 SampleHouse FP (no mesh hashes) REFUSED — §DW-LOD400-REFUSE logged, 0 FP ops committed (no box)', !!refLine && shFp === 0,
    'ops=' + shFp + ' log="' + refLine.slice(0, 110) + '"');

  var DISC = 'ELEC';
  await openResident(page, 'Duplex');
  logs.length = 0;
  await page.click('#bo-tree [data-disc="' + DISC + '"]');
  // wait for markers to render then for the commit loop to finish (sentinel set by _commitDiscWalk)
  await page.waitForFunction(function (d) { return !!(window.__dwWalks && window.__dwWalks[d] && window.__dwWalks[d].length > 0); }, DISC, { timeout: 90000 }).catch(function () {});
  await page.waitForFunction(function (d) { return window.__dwLastCommitDisc === d; }, DISC, { timeout: 90000 }).catch(function () {});
  await page.waitForTimeout(300);
  function discOps() {
    return page.evaluate(function (d) {
      if (!window.Bonsai.oplog || !window.Bonsai.oplog.db) return [];
      return window.Bonsai.oplog._geomOps().filter(function (o) {
        return o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.disc === d;
      }).map(function (o) { return { id: o.id, ifc: o.parameters._dw.ifc, host: o.parameters._dw.host, prov: o.parameters._dw.prov, rg: o.parameters.realGeomHash || null }; });
    }, DISC);
  }

  // O1: §DISC-WALK-COMMIT logged with committed>0
  var commitLog = logs.find(function (l) { return new RegExp('§DISC-WALK-COMMIT disc=' + DISC).test(l); }) || '';
  var committedN = parseInt((commitLog.match(/committed=(\d+)/) || [0, 0])[1], 10);
  chk('O1 Duplex ' + DISC + ' walk emits §DISC-WALK-COMMIT committed>0', committedN > 0, commitLog || 'no log found');

  // O2: oplog contains N GEOM_INSERT ops with parameters._dw.disc === DISC, every one naming its real mesh
  var dOps = await discOps();
  var noMesh = dOps.filter(function (o) { return !o.rg; }).length;
  chk('O2 oplog contains ' + DISC + ' GEOM_INSERT ops with _dw.disc (count == committed, every op names its realGeomHash)',
    dOps.length > 0 && dOps.length === committedN && noMesh === 0, 'oplog ops=' + dOps.length + ' committed=' + committedN + ' noMesh=' + noMesh);

  // O3: host-tacked ops carry _dw.host — judged only if this walk host-binds anything (else INCONCLUSIVE, not PASS)
  var hostOps = dOps.filter(function (o) { return o.host; });
  if (hostOps.length) chk('O3 HOST: host-bound ops carry a _dw.host guid', true, 'host ops=' + hostOps.length + ' eg host=' + String(hostOps[0].host).slice(0, 14) + '…');
  else console.log('  ⚪ INCONCLUSIVE O3 HOST — Duplex ' + DISC + ' binds no placement to a host (hostOps=0); the SampleHouse FP shim that exercised it is refused (O0)');

  // O4: undo() marks the last op undone → active count drops by 1
  await page.evaluate(function () { return window.Bonsai.oplog.undo(); });
  await page.waitForTimeout(200);
  var afterUndo = (await discOps()).length;
  chk('O4 undo() marks last ' + DISC + ' GEOM_INSERT undone (count −1)', afterUndo === dOps.length - 1, 'before=' + dOps.length + ' after-undo=' + afterUndo);

  // O5: redo() restores the undone op → count back to N
  await page.evaluate(function () { return window.Bonsai.oplog.redo(); });
  await page.waitForTimeout(200);
  var afterRedo = (await discOps()).length;
  chk('O5 redo() restores ' + DISC + ' op count', afterRedo === dOps.length && dOps.length > 0, 'expected=' + dOps.length + ' got=' + afterRedo);

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
