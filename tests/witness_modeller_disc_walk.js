#!/usr/bin/env node
/**
 * W-UX-DISC — headless witness for "Disc = walker" (RESUME_MODELLER_UX_OUTLINER_PILL §W-UX-4):
 *   • a discipline node in the bom-graph is a clickable WALKER entry point (carries data-disc + a ▶ glyph)
 *   • click STR → SURFACES the real STR walk (swbInit done at Open) + expands the STR Walker tab
 *   • click MEP on SampleCastle → RouteWalker has no anchors for it → HONEST refusal, NO fabricated run
 *
 * Wiring gate (TestArchitecture §Browser Testing); the STR walk VALUES are proven by the node W-STR-* suite.
 * Serves viewer/ + the repo modeller/ residents (the live ../modeller/<db> playground).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

var VIEWER = path.join(__dirname, '..', 'viewer');
var MODELLER = path.join(__dirname, '..', 'modeller');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = p.indexOf('/modeller/') === 0 ? path.join(MODELLER, p.slice('/modeller/'.length))
             : path.join(VIEWER, p === '/' ? 'modeller.html' : p);
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

async function openResidentAndSeed(page, key) {
  await page.click('#b-open');
  await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="' + key + '"]');
  await page.waitForFunction(function (k) {
    var t = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
    return !!t && Object.keys(t.nodes).some(function (id) { return t.nodes[id].kind === 'disc'; });
  }, key, { timeout: 25000 }).catch(function () {});
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

  await page.goto('http://localhost:' + port + '/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-UX-DISC — disc = walker (headless) ═══');

  // ── STR disc → surfaces the real walk (SampleHouse) ─────────────────────────────────────────────
  await openResidentAndSeed(page, 'SampleHouse');
  var discDom = await page.evaluate(function () {
    var nodes = [].slice.call(document.querySelectorAll('#bo-tree [data-disc]'));
    return { count: nodes.length, hasSTR: nodes.some(function (d) { return d.getAttribute('data-disc') === 'STR'; }),
      glyph: nodes.length ? !!nodes[0].querySelector('.bn-walk') : false };
  });
  chk('B1 discipline nodes are walker entry points (data-disc + ▶ glyph)', discDom.count >= 1 && discDom.glyph, 'discNodes=' + discDom.count);
  chk('B2 SampleHouse exposes an STR disc node', discDom.hasSTR);

  logs.length = 0;
  await page.click('#bo-tree [data-disc="STR"]');
  await page.waitForTimeout(250);
  var strSurfaced = logs.some(function (l) { return /§DISC-WALK STR surfaced/.test(l); });
  chk('B3 click STR → §DISC-WALK STR surfaced (real walk, not faked)', strSurfaced, logs.filter(function (l) { return /DISC-WALK/.test(l); })[0] || '');
  var strTabOpen = await page.evaluate(function () { return window.Bonsai.outliner._collapsed['tcat|strwalk'] === false; });
  chk('B4 STR Walker tab expanded on STR click', strTabOpen);

  // ── MEP disc → honest refusal (SampleCastle has MEP but RouteWalker has no anchors for it) ───────
  await openResidentAndSeed(page, 'SampleCastle');
  var mepEl = await page.waitForSelector('#bo-tree [data-disc="MEP"]', { timeout: 30000 }).catch(function () { return null; });
  chk('B5 SampleCastle exposes an MEP disc node', !!mepEl);

  logs.length = 0;
  var sweepsBefore = await page.evaluate(function () { return (window.Bonsai.oplog && window.Bonsai.oplog.db) ? window.Bonsai.oplog._geomOps().filter(function (o) { return o.op_type === 'GEOM_SWEEP'; }).length : 0; });
  await page.click('#bo-tree [data-disc="MEP"]');
  // discWalk MEP is async (rwInit + route); wait for its honest-refusal (or routed) log to land
  await page.waitForTimeout(900);
  var sweepsAfter = await page.evaluate(function () { return (window.Bonsai.oplog && window.Bonsai.oplog.db) ? window.Bonsai.oplog._geomOps().filter(function (o) { return o.op_type === 'GEOM_SWEEP'; }).length : 0; });
  // DiscWalker (terminal_rules.db) now backs the MEP-family disc click. The generic 'MEP' disc has NO
  // measured rule in terminal_rules.db → honest REFUSE (the named PLB/ACMV/FP/ELEC DO walk — see
  // witness_modeller_terminal_walk.js). Either the old no-walk or the new REFUSE log is an honest refusal.
  var mepRefused = logs.some(function (l) { return /§DISC-WALK MEP (no-walk|REFUSE)/.test(l); });
  var mepRouted = logs.some(function (l) { return /§DISC-WALK MEP (routed|placed)/.test(l); });
  chk('B6 click MEP → honest §DISC-WALK MEP refusal (no measured rule)', mepRefused && !mepRouted, logs.filter(function (l) { return /DISC-WALK MEP/.test(l); })[0] || '');
  chk('B7 NO fabricated run — GEOM_SWEEP count unchanged', sweepsAfter === sweepsBefore, 'before=' + sweepsBefore + ' after=' + sweepsAfter);

  var loadFail = logs.concat([]).filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('B8 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  if (fail) { console.log('--- DISC-WALK logs ---'); logs.filter(function (l) { return /DISC-WALK|RW_INIT|rwInit|FAIL/.test(l); }).forEach(function (l) { console.log('   ' + l); }); }
  console.log('W-UX-DISC: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
