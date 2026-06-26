#!/usr/bin/env node
/**
 * W-UX-XEDGE — headless witness for the adjacency lens (RESUME_MODELLER_UX_OUTLINER_PILL §W-UX-6, JS-derive fork):
 *   • abuts cross-edges are DERIVED on Open (window.swXEdges.abuts, pristine substrate — not baked)
 *   • the ⇄ lens toggle (#bo-adj) lights up on click and reports the edge count
 *   • selecting an element highlights EXACTLY its abuts neighbours on the containment backbone (data-adj=1),
 *     and the selected row shows its degree — the highlight set == the derived map (parity, NON-INVENT)
 *   • toggling the lens OFF clears the highlights
 *
 * Wiring/parity gate; the abuts edge VALUES are the node witness W-CROSS-EDGES-ABUTS (JS==Python). Serves
 * viewer/ + the repo modeller/ residents.
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
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-UX-XEDGE — adjacency lens (headless) ═══');

  // Open SampleHouse → abuts derived
  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () { return !!(window.swXEdges && Array.isArray(window.swXEdges.abuts)) &&
    !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree()); }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(300);

  var nAbuts = await page.evaluate(function () { return (window.swXEdges && window.swXEdges.abuts) ? window.swXEdges.abuts.length : -1; });
  chk('E1 abuts derived on Open (window.swXEdges.abuts)', nAbuts > 0, 'edges=' + nAbuts);

  // Toggle the ⇄ lens ON
  await page.click('#bo-adj');
  await page.waitForTimeout(150);
  var lensOn = await page.evaluate(function () { return window.Bonsai.outliner._adjLens === true; });
  chk('E2 ⇄ lens toggles ON', lensOn);
  var lensLogged = logs.some(function (l) { return /§XEDGE-LENS adjacency=true edges=/.test(l); });
  chk('E3 §XEDGE-LENS toggle logged with edge count', lensLogged, logs.filter(function (l) { return /XEDGE-LENS adjacency/.test(l); })[0] || '');

  // Select the max-degree element → highlight EXACTLY its neighbours
  var sel = await page.evaluate(function () {
    var X = (window.swXEdges && window.swXEdges.abuts) || [];
    var nbrs = {};
    X.forEach(function (e) { (nbrs[e.a] || (nbrs[e.a] = new Set())).add(e.b); (nbrs[e.b] || (nbrs[e.b] = new Set())).add(e.a); });
    var best = null, bd = -1; Object.keys(nbrs).forEach(function (g) { if (nbrs[g].size > bd) { bd = nbrs[g].size; best = g; } });
    if (best == null) return { ok: false };
    var present = new Set(); document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { present.add(d.getAttribute('data-bnode')); });
    var expected = Array.from(nbrs[best]).filter(function (g) { return present.has(g); }).length;
    var row = null; document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { if (d.getAttribute('data-bnode') === best) row = d; });
    if (!row) return { ok: false, best: best, degree: bd };
    row.click();   // fires the wired onclick → setActive + (lens) repaint
    var adjRows = document.querySelectorAll('#bo-tree [data-adj="1"]').length;
    var selRow = null; document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { if (d.getAttribute('data-bnode') === best) selRow = d; });
    var deg = selRow ? selRow.querySelector('.bn-deg') : null;
    return { ok: true, best: best.slice(0, 10), degree: bd, expected: expected, adjRows: adjRows, badge: deg ? deg.textContent : null };
  });
  chk('E4 selected element has abuts neighbours', sel.ok && sel.degree > 0, 'degree=' + sel.degree);
  chk('E5 highlighted rows == derived neighbour set (parity, NON-INVENT)', sel.ok && sel.adjRows === sel.expected && sel.expected > 0, 'adjRows=' + sel.adjRows + ' expected=' + sel.expected);
  chk('E6 selected row shows its ⇄degree badge', sel.ok && sel.badge === ('⇄' + sel.degree), 'badge=' + sel.badge + ' degree=' + sel.degree);
  var selLogged = logs.some(function (l) { return /§XEDGE-LENS select=.*neighbours=/.test(l); });
  chk('E7 §XEDGE-LENS select logged', selLogged);

  // Toggle the lens OFF → highlights cleared
  await page.click('#bo-adj');
  await page.waitForTimeout(150);
  var cleared = await page.evaluate(function () { return window.Bonsai.outliner._adjLens === false && document.querySelectorAll('#bo-tree [data-adj="1"]').length === 0; });
  chk('E8 lens OFF clears highlights', cleared);

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('E9 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('W-UX-XEDGE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
