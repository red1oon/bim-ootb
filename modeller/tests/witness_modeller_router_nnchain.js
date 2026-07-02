#!/usr/bin/env node
/**
 * W-ROUTER-NNCHAIN — headless witness: the Router half LIVE on a real-MEP building (§ROUTER-NNCHAIN).
 * Residents (SH/DX/SC) carry no MEP network → the Router honestly returns 0. The Terminal (a resident,
 * Terminal_meta.db) IS MEP-rich, so walking PLB there produces real nearest-neighbour-3d chains. This witness
 * proves the modeller wiring: chains render as 3D lines AND fold to the signed op-log as GEOM_SWEEP.
 *
 * Wiring gate (TestArchitecture §Browser Testing); the chain VALUES (real endpoints, measured cadence, gap
 * bound, honest-skip) are proven by the node witness build/witness_disc_route_nnchain.js (6/6).
 *
 * Checks (7):
 *   N1 walk PLB on Terminal → w.chainSegs > 0 (§DISC-WALK ... chainSegs=N)
 *   N2 chains rendered as 3D lines in the DiscWalker root (THREE.LineSegments)
 *   N3 §ROUTER-CHAIN-COMMIT folded>0 logged
 *   N4 op-log contains GEOM_SWEEP ops carrying parameters._dw.from_guid + _dw.to_guid (real chain identity)
 *   N5 folded count == min(segs, cap) and honestly logged when capped
 *   N6 undo() removes the last sweep; redo() restores it
 *   N7 no script LOAD_FAIL / pageerror
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
  // Terminal_meta.db is ~19MB — give the open + DiscWalker init generous time
  await page.waitForFunction(function () { return window.DiscWalker && window.DiscWalker._ready(); }, null, { timeout: 60000 }).catch(function () {});
  await page.waitForFunction(function () { return !!window.__dwBuf; }, null, { timeout: 60000 }).catch(function () {});
  await page.waitForFunction(function () { return window.Bonsai && window.Bonsai.library && (window.Bonsai.library.catalog() || []).length > 0; }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(400);
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
  console.log('═══ W-ROUTER-NNCHAIN — Router half live on Terminal (headless) ═══');

  await openResident(page, 'Terminal');
  var opened = await page.evaluate(function () { return { buf: !!window.__dwBuf, name: window.__dwName || '', ready: !!(window.DiscWalker && window.DiscWalker._ready()) }; });
  chk('N0 Terminal opened + DiscWalker ready', opened.buf && opened.ready, 'name=' + opened.name);

  // WIRING gate (occt is slow headless) — shrink the op-log GEOM_SWEEP cap so the commit finishes fast.
  // The chain VALUES at full scale are proven by the node witness; here we prove render+commit+undo wiring.
  await page.evaluate(function () { window.DW_CHAIN_COMMIT_CAP = 12; });

  // ── walk PLB → real nn-chains ────────────────────────────────────────────────────────────────────
  logs.length = 0;
  await page.click('#bo-tree [data-disc="PLB"]');
  // wait for placement commit (sentinel) then chain commit (sentinel)
  await page.waitForFunction(function () { return window.__dwLastCommitDisc === 'PLB'; }, null, { timeout: 90000 }).catch(function () {});
  await page.waitForFunction(function () { return window.__dwLastChainDisc === 'PLB'; }, null, { timeout: 120000 }).catch(function () {});
  await page.waitForTimeout(500);

  var walkLog = logs.find(function (l) { return /§DISC-WALK PLB .*chainSegs=\d+/.test(l); }) || '';
  var nSeg = parseInt((walkLog.match(/chainSegs=(\d+)/) || [0, 0])[1], 10);
  chk('N1 walk PLB → chainSegs>0 (Router routes real nn-chains)', nSeg > 0, walkLog || 'no walk log');

  // N2 chains rendered in the DiscWalker root. STALE-CHECK FIX (found via W-TERMINAL-WALKALL-PERF regression
  // sweep, failed IDENTICALLY on unmodified main): §DW-TUBE upgraded the chain render from LineSegments to
  // InstancedMesh cylinder tubes (userData.dwChain unchanged) and this check was never updated — it counted
  // isLineSegments only, so it has been asserting 0 > 0 since the tube upgrade. Count tube instances (and
  // keep LineSegments for back-compat with any pre-tube build).
  var lineSegs = await page.evaluate(function () {
    var g = window.Bonsai.group && window.Bonsai.group(); if (!g) return -1;
    var root = g.children.find(function (o) { return o.userData && o.userData.dwRoot; }); if (!root) return 0;
    return root.children.filter(function (o) { return (o.isInstancedMesh || o.isLineSegments) && o.userData.dwChain; })
      .reduce(function (n, o) { return n + (o.isInstancedMesh ? (o.count || 0) : o.geometry.getAttribute('position').count / 2); }, 0);
  });
  chk('N2 chains rendered as 3D tubes in DiscWalker root', lineSegs > 0, 'tubeSegments=' + lineSegs);

  // N3 + N5 chain commit logged + cap honored
  var commitLog = logs.find(function (l) { return /§ROUTER-CHAIN-COMMIT disc=PLB/.test(l); }) || '';
  var folded = parseInt((commitLog.match(/folded=(\d+)/) || [0, 0])[1], 10);
  chk('N3 §ROUTER-CHAIN-COMMIT folded>0 logged', folded > 0, commitLog);

  var cap = await page.evaluate(function () { return window.DW_CHAIN_COMMIT_CAP || 300; });
  var expectFolded = Math.min(nSeg, cap);
  chk('N5 folded == min(segs, cap), capping honestly logged', folded === expectFolded &&
    (nSeg <= cap || /cap=\d+, occt-bounded; full \d+ rendered live/.test(commitLog)),
    'folded=' + folded + ' expect=' + expectFolded + ' cap=' + cap);

  // N4 op-log GEOM_SWEEP ops with _dw.from_guid/to_guid
  var sweeps = await page.evaluate(function () {
    if (!window.Bonsai.oplog || !window.Bonsai.oplog.db) return { total: 0, withDw: 0, sample: null };
    var ops = window.Bonsai.oplog._geomOps().filter(function (o) { return o.op_type === 'GEOM_SWEEP'; });
    var withDw = ops.filter(function (o) { return o.parameters && o.parameters._dw && o.parameters._dw.from_guid && o.parameters._dw.to_guid; });
    return { total: ops.length, withDw: withDw.length, sample: withDw[0] ? { f: withDw[0].parameters._dw.from_guid, t: withDw[0].parameters._dw.to_guid, gap: withDw[0].parameters._dw.gap } : null };
  });
  chk('N4 op-log GEOM_SWEEP ops carry _dw.from_guid + _dw.to_guid', sweeps.withDw === folded && sweeps.withDw > 0,
    'sweeps=' + sweeps.total + ' withDw=' + sweeps.withDw + (sweeps.sample ? ' eg ' + sweeps.sample.f.slice(0, 8) + '→' + sweeps.sample.t.slice(0, 8) + ' gap=' + sweeps.sample.gap : ''));

  // N6 undo/redo a sweep
  var sweepBefore = sweeps.withDw;
  await page.evaluate(function () { return window.Bonsai.oplog.undo(); });
  await page.waitForTimeout(300);
  var sweepAfterUndo = await page.evaluate(function () {
    return window.Bonsai.oplog._geomOps().filter(function (o) { return o.op_type === 'GEOM_SWEEP' && o.parameters && o.parameters._dw && o.parameters._dw.from_guid; }).length;
  });
  await page.evaluate(function () { return window.Bonsai.oplog.redo(); });
  await page.waitForTimeout(300);
  var sweepAfterRedo = await page.evaluate(function () {
    return window.Bonsai.oplog._geomOps().filter(function (o) { return o.op_type === 'GEOM_SWEEP' && o.parameters && o.parameters._dw && o.parameters._dw.from_guid; }).length;
  });
  chk('N6 undo() removes a chain sweep; redo() restores it', sweepAfterUndo === sweepBefore - 1 && sweepAfterRedo === sweepBefore,
    'before=' + sweepBefore + ' undo=' + sweepAfterUndo + ' redo=' + sweepAfterRedo);

  // N7 no script load failure / pageerror
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('N7 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  if (fail) {
    console.log('--- ROUTER-NNCHAIN logs ---');
    logs.filter(function (l) { return /DISC-WALK|ROUTER-CHAIN|DW |LOAD_FAIL|PAGEERROR|FAIL/.test(l); }).slice(0, 18).forEach(function (l) { console.log('   ' + l); });
  }
  console.log('W-ROUTER-NNCHAIN: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
