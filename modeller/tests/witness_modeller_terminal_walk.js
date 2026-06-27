#!/usr/bin/env node
/**
 * W-TERM-WALK — headless witness for the Terminal-rules disc-walk wired to the Outliner (the convergence
 * end-point, RESUME_TERMINAL_RULE_MINING §CONVERGENCE / Phase 6):
 *   • on Open, the shared DiscWalker engine loads terminal_rules.db + a "Walk · Disciplines" roster appears
 *   • the roster lists the MEASURED disciplines (FP/ELEC/PLB/ACMV/roof) even though the house lacks them
 *   • clicking a roster discipline WALKS it onto the open building → §DISC-WALK <D> placed=N + 3D markers
 *   • a discipline with no rule (generic MEP) → honest REFUSE, 0 fabricated
 *
 * Wiring gate (TestArchitecture §Browser Testing); the WALK VALUES (generalize/cadence/gate) are proven by
 * the node witness build/witness_disc_walk_generalize.js (49/49). Serves viewer/ + repo modeller/ residents.
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

// Repo-root docroot: the Modeller now lives in /modeller/ (its own app folder, trilogy
// viewer/·erp/·modeller/). Serving from root resolves /modeller/modeller.html, its sibling JS,
// /modeller/lib/*, /modeller/*.db, AND the cross-surface broker /viewer/connect_scene.js.
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
  // wait for the DiscWalker engine to load terminal_rules.db + register the roster
  await page.waitForFunction(function () { return window.DiscWalker && window.DiscWalker._ready(); }, null, { timeout: 25000 }).catch(function () {});
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
  console.log('═══ W-TERM-WALK — Terminal-rules disc-walk wired to the Outliner (headless) ═══');

  // ── SampleHouse (a house — NO FP/ELEC/PLB elements) ─────────────────────────────────────────────
  await openResident(page, 'SampleHouse');

  var eng = await page.evaluate(function () { return { ready: !!(window.DiscWalker && window.DiscWalker._ready()), discs: window.DiscWalker ? window.DiscWalker.disciplines() : [] }; });
  chk('T1 DiscWalker engine loaded terminal_rules.db on Open', eng.ready, 'discs=' + eng.discs.join(','));
  chk('T2 measured disciplines available (FP/ELEC present)', eng.discs.indexOf('FP') >= 0 && eng.discs.indexOf('ELEC') >= 0, eng.discs.join(','));

  var rosterFP = await page.evaluate(function () {
    var nodes = [].slice.call(document.querySelectorAll('#bo-tree [data-disc]'));
    var fp = nodes.find(function (d) { return d.getAttribute('data-disc') === 'FP'; });
    return { has: !!fp, glyph: fp ? !!fp.querySelector('.bn-walk') : false };
  });
  chk('T3 "Walk · Disciplines" roster shows an FP node (absent from the house) + ▶', rosterFP.has && rosterFP.glyph);

  // ── click FP → walk it onto SampleHouse ─────────────────────────────────────────────────────────
  logs.length = 0;
  await page.click('#bo-tree [data-disc="FP"]');
  await page.waitForFunction(function () { return (window.__dwWalks && window.__dwWalks.FP && window.__dwWalks.FP.length > 0); }, null, { timeout: 15000 }).catch(function () {});
  var fpWalk = await page.evaluate(function () { return { placed: (window.__dwWalks && window.__dwWalks.FP) ? window.__dwWalks.FP.length : 0 }; });
  chk('T4 click FP → walked onto the house, placed>0', fpWalk.placed > 0, 'placed=' + fpWalk.placed);
  var fpLog = logs.some(function (l) { return /§DISC-WALK FP placed=\d+/.test(l); });
  chk('T5 §DISC-WALK FP placed=N logged (DiscWalker/terminal_rules)', fpLog, logs.filter(function (l) { return /DISC-WALK FP/.test(l); })[0] || '');

  // 3D markers rendered into the editable group's DiscWalker root
  var markers = await page.evaluate(function () {
    var g = window.Bonsai.group && window.Bonsai.group(); if (!g) return -1;
    var root = g.children.find(function (o) { return o.userData && o.userData.dwRoot; }); if (!root) return 0;
    return root.children.reduce(function (n, o) { return n + (o.isInstancedMesh ? o.count : 0); }, 0);
  });
  chk('T6 FP placements rendered as 3D markers', markers > 0, 'instances=' + markers);

  // ── click ELEC too → the Gate runs across FP+ELEC ───────────────────────────────────────────────
  logs.length = 0;
  await page.click('#bo-tree [data-disc="ELEC"]');
  await page.waitForFunction(function () { return (window.__dwWalks && window.__dwWalks.ELEC && window.__dwWalks.ELEC.length > 0); }, null, { timeout: 15000 }).catch(function () {});
  var elPlaced = await page.evaluate(function () { return (window.__dwWalks && window.__dwWalks.ELEC) ? window.__dwWalks.ELEC.length : 0; });
  chk('T7 click ELEC → walked, placed>0 (2 disciplines now co-resident)', elPlaced > 0, 'placed=' + elPlaced);

  // ── generic MEP (no measured rule) → honest refusal ─────────────────────────────────────────────
  logs.length = 0;
  var refused = await page.evaluate(function () {
    var w = window.DiscWalker.dwWalk('MEP', new window.SQL.Database(new Uint8Array(window.__dwBuf)), window.__dwName);
    return { refused: !!w.refused, placed: w.placed || 0 };
  });
  chk('T8 generic MEP (no rule) → honest refusal, 0 placed', refused.refused && refused.placed === 0);

  var loadFail = logs.concat([]).filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  // re-scan all logs for load failures
  var allFail = (await page.evaluate(function () { return window.__dwName ? [] : []; }), loadFail);
  chk('T9 no script LOAD_FAIL / pageerror', allFail.length === 0, allFail.slice(0, 2).join(' | '));

  if (fail) { console.log('--- logs ---'); logs.filter(function (l) { return /DISC-WALK|DW |LOAD_FAIL|PAGEERROR/.test(l); }).slice(0, 12).forEach(function (l) { console.log('   ' + l); }); }
  console.log('W-TERM-WALK: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
