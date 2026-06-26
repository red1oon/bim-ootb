#!/usr/bin/env node
/**
 * W-UX-PILL — headless witness for the Modeller UX redesign (RESUME_MODELLER_UX_OUTLINER_PILL):
 *   • W-UX-1  the pill "Open" loads a resident → swbInit walk + bom-graph seed (clicked, not faked)
 *   • W-UX-2  the OLD top-left drop panel (▾ resident / 🏗 / 📂 Open) is GONE
 *   • W-UX-3  ARC LEADS: the bom-graph (containment) category registers by DEFAULT (no flag) and renders
 *             FIRST in the Outliner; SampleHouse seeds the real qualified rooms (W-ROOM-STOREY-QUALIFY: 3).
 *
 * Per TestArchitecture §Browser Testing this is the secondary (wiring) gate; the VALUE proofs are the
 * node witnesses (W-BOM-GRAPH / W-ROOM-STOREY-QUALIFY / W-STR-*). Serves viewer/ + the repo modeller/
 * resident DBs (the GH-Pages playground the live loader fetches from ../modeller/<db>).
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

(async function () {
  var srv = await serve();
  var port = srv.address().port;
  var logs = [];
  var browser = await chromium.launch();
  var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:' + port + '/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true; }, { timeout: 20000 }).catch(function () {});
  await page.waitForTimeout(400);

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-UX-PILL — Modeller Open pill + ARC-leads outliner (headless) ═══');

  // ── W-UX-2: old drop panel gone ────────────────────────────────────────────────────────────────
  var state = await page.evaluate(function () {
    var cats = (window.Bonsai && window.Bonsai.outliner && window.Bonsai.outliner._categories) || [];
    var keys = cats.map(function (c) { return c.key; });
    return {
      oldGone: !document.getElementById('strwalk-open') && !document.getElementById('bomtree-open') && !document.getElementById('strwalk-resident'),
      openPill: !!document.getElementById('b-open'),
      keys: keys,
      bomIdx: keys.indexOf('bomtree'),
      strIdx: keys.indexOf('strwalk')
    };
  });
  chk('A1 old top-left drop panel GONE (strwalk/bomtree/resident)', state.oldGone);
  chk('A2 Open pill (#b-open) present', state.openPill);
  chk('A3 ARC (bomtree) + STR (strwalk) registered by DEFAULT', state.bomIdx >= 0 && state.strIdx >= 0, 'keys=[' + state.keys.join(',') + ']');
  chk('A4 ARC LEADS — bomtree registered before strwalk', state.bomIdx >= 0 && state.bomIdx < state.strIdx, 'bomIdx=' + state.bomIdx + ' strIdx=' + state.strIdx);

  // ── W-UX-1: click Open → panel → pick SampleHouse ───────────────────────────────────────────────
  // sql.js (WASM) initialises async; the live user opens well after boot, so wait for window.SQL here.
  await page.waitForFunction(function () { return !!window.SQL; }, { timeout: 20000 }).catch(function () {});
  await page.click('#b-open');
  await page.waitForTimeout(150);
  var panel = await page.evaluate(function () {
    var p = document.getElementById('m-open-panel');
    if (!p || p.style.display !== 'block') return { open: false };
    var rows = [].slice.call(p.querySelectorAll('.mo-row'));
    return { open: true, rows: rows.length, local: rows.some(function (d) { return d.getAttribute('data-key') === '__local'; }),
      sh: rows.some(function (d) { return d.getAttribute('data-key') === 'SampleHouse'; }) };
  });
  chk('A5 Open chooser opens with the 4 residents + local door', panel.open && panel.rows === 5 && panel.local && panel.sh,
    'rows=' + panel.rows + ' local=' + panel.local + ' SampleHouse=' + panel.sh);

  // click the SampleHouse row → the SHIPPED openResident() walks + seeds the bom-graph
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  // wait for the walk + seed to settle (swbTabData truthy + a bom-graph seed log)
  await page.waitForFunction(function () {
    return typeof window.swbTabData === 'function' && !!window.swbTabData() &&
      !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree());
  }, { timeout: 20000 }).catch(function () {});
  await page.waitForTimeout(300);

  var opened = await page.evaluate(function () {
    var t = window.BOMTreeOutliner._currentTree();
    var kinds = {};
    if (t) Object.keys(t.nodes).forEach(function (k) { var kd = t.nodes[k].kind; kinds[kd] = (kinds[kd] || 0) + 1; });
    var d = window.swbTabData && window.swbTabData();
    // is the bom-graph tree rendered FIRST in the outliner DOM (before the flat Walls group)?
    var treeEl = document.getElementById('bo-tree');
    var html = treeEl ? treeEl.innerHTML : '';
    var bomPos = html.indexOf('data-tcat="bomtree"');
    var wallsPos = html.indexOf('data-grp="walls"');
    return { kinds: kinds, walkReady: !!d, columns: d ? d.columns : null,
      arcRendersFirst: bomPos >= 0 && (wallsPos < 0 || bomPos < wallsPos), bomPos: bomPos, wallsPos: wallsPos };
  });
  chk('A6 SampleHouse walk ready (swbTabData populated)', opened.walkReady, 'columns=' + opened.columns);
  chk('A7 bom-graph seeded — storeys present', (opened.kinds.storey || 0) >= 1, 'kinds=' + JSON.stringify(opened.kinds));
  chk('A8 SampleHouse qualified ROOMS = 3 (W-ROOM-STOREY-QUALIFY)', (opened.kinds.room || 0) === 3, 'rooms=' + (opened.kinds.room || 0));
  chk('A9 ARC renders FIRST in the Outliner (before flat Walls group)', opened.arcRendersFirst, 'bomPos=' + opened.bomPos + ' wallsPos=' + opened.wallsPos);

  var openLogged = logs.some(function (l) { return /§STRWALK-OPEN SampleHouse/.test(l); });
  chk('A10 §STRWALK-OPEN SampleHouse logged (clicked, not faked)', openLogged);
  var seedLogged = logs.some(function (l) { return /§BOMTREE seeded "SampleHouse"/.test(l); });
  chk('A11 §BOMTREE seeded SampleHouse logged', seedLogged);
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('A12 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  if (fail) {
    console.log('--- relevant logs ---');
    logs.filter(function (l) { return /STRWALK|BOMTREE|XEDGE|fetch|FAIL|PAGEERROR|sql/.test(l); }).forEach(function (l) { console.log('   ' + l); });
  }
  console.log('W-UX-PILL: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
