#!/usr/bin/env node
/**
 * §STRWALK-SMOKE — headless WIRING check for ?strwalk in the live modeller (deploy gate, secondary
 * to the node witnesses W-STR-* 29/29). Per TestArchitecture §Browser Testing: Playwright verifies
 * WIRING only (scripts load, category registers, button mounts, grid-move wrap installs) — value
 * verification is the §-log/witness, not this. Serves the worktree viewer/, loads modeller.html?strwalk.
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

  // DEFAULT load (no flag) — the modeller's outliner now registers ARC + STR Walker on EVERY load (W-UX-3).
  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  // wait for the register hook to fire (or scene ready)
  await page.waitForFunction(function () {
    return window.__sceneReady === true || (window.STRWalkerOutliner && document.getElementById('b-open'));
  }, { timeout: 20000 }).catch(function () {});
  await page.waitForTimeout(800);

  var r = await page.evaluate(function () {
    return {
      engineLoaded: typeof window.swWalkSkeleton === 'function' && typeof window.swReWalk === 'function',
      bridgeLoaded: typeof window.swbInit === 'function' && typeof window.swbOnGridMove === 'function',
      olLoaded: !!window.STRWalkerOutliner,
      categoryAdded: !!(window.Bonsai && window.Bonsai.outliner && window.Bonsai.outliner._categories &&
        window.Bonsai.outliner._categories.some(function (c) { return c.key === 'strwalk'; })),
      // W-UX-2: the OLD top-left drop controls are gone; W-UX-1: the pill Open replaces them.
      oldButtonGone: !document.getElementById('strwalk-open') && !document.getElementById('bomtree-open') &&
        !document.getElementById('strwalk-resident'),
      openPill: !!document.getElementById('b-open'),
      gridWrapped: !!(window.Bonsai && window.Bonsai.gridmove && window.Bonsai.gridmove._strWrapped)
    };
  });

  var pass = 0, fail = 0;
  function chk(name, cond) { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } }
  console.log('═══ §STRWALK-SMOKE — modeller default wiring (headless) ═══');
  chk('C1 engine loaded (str_walker.js)', r.engineLoaded);
  chk('C2 bridge loaded (str_walker_bridge.js)', r.bridgeLoaded);
  chk('C3 outliner-wiring loaded (STRWalkerOutliner)', r.olLoaded);
  chk('C4 STR category registered in Outliner (default load, no flag)', r.categoryAdded);
  chk('C5 old top-left drop panel GONE (strwalk/bomtree open buttons removed)', r.oldButtonGone);
  chk('C5b Open pill (#b-open) present', r.openPill);
  chk('C6 Bonsai.gridmove.commit wrapped (re-walk hook)', r.gridWrapped);
  var registered = logs.some(function (l) { return /§MODELLER outliner ready/.test(l); });
  chk('C7 §MODELLER outliner ready logged', registered);
  var loadFail = logs.filter(function (l) { return /STRWALK LOAD_FAIL/.test(l); });
  chk('C8 no STRWALK script LOAD_FAIL', loadFail.length === 0);

  console.log('§STRWALK-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
