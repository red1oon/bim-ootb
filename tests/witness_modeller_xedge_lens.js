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

  var X0 = await page.evaluate(function () { var X = window.swXEdges || {}; return { abuts: (X.abuts || []).length, fills: (X.fills || []).length,
    aggregates: (X.aggregates || []).length, anchored: (X.anchored || []).length, spans: (X.spans || []).length, datums: (X.datums || []).length }; });
  chk('E1 full SDG derived on Open (abuts/anchored/spans/fills/aggregates/datums)',
    X0.abuts > 0 && X0.anchored > 0 && X0.spans > 0 && X0.fills > 0 && X0.aggregates > 0 && X0.datums > 0, JSON.stringify(X0));

  // Toggle the ⇄ lens ON
  await page.click('#bo-adj');
  await page.waitForTimeout(150);
  var lensOn = await page.evaluate(function () { return window.Bonsai.outliner._adjLens === true; });
  chk('E2 ⇄ lens toggles ON', lensOn);
  var lensLogged = logs.some(function (l) { return /§XEDGE-LENS adjacency=true edges=/.test(l); });
  chk('E3 §XEDGE-LENS toggle logged with edge count', lensLogged, logs.filter(function (l) { return /XEDGE-LENS adjacency/.test(l); })[0] || '');

  // Select the max-degree element over the ELEMENT↔ELEMENT union (abuts+fills+aggregates) → highlight EXACTLY
  // that union; the selected row's per-kind badge must equal the per-kind degree (parity vs the derived map).
  var sel = await page.evaluate(function () {
    var X = window.swXEdges || {};
    var nbrs = {};   // guid → {nbr → Set(kind)}
    ['abuts', 'fills', 'aggregates'].forEach(function (kind) {
      (X[kind] || []).forEach(function (e) {
        if (e.a == null || e.b == null || e.a === e.b) return;
        (nbrs[e.a] || (nbrs[e.a] = {}))[e.b] = (nbrs[e.a][e.b] || new Set()); nbrs[e.a][e.b].add(kind);
        (nbrs[e.b] || (nbrs[e.b] = {}))[e.a] = (nbrs[e.b][e.a] || new Set()); nbrs[e.b][e.a].add(kind);
      });
    });
    var best = null, bd = -1; Object.keys(nbrs).forEach(function (g) { var d = Object.keys(nbrs[g]).length; if (d > bd) { bd = d; best = g; } });
    if (best == null) return { ok: false };
    var present = new Set(); document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { present.add(d.getAttribute('data-bnode')); });
    var expected = Object.keys(nbrs[best]).filter(function (g) { return present.has(g); }).length;
    var kc = { abuts: 0, fills: 0, aggregates: 0 };
    Object.keys(nbrs[best]).forEach(function (g) { if (present.has(g)) nbrs[best][g].forEach(function (k) { kc[k]++; }); });
    var row = null; document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { if (d.getAttribute('data-bnode') === best) row = d; });
    if (!row) return { ok: false, best: best, degree: bd };
    row.click();   // fires the wired onclick → setActive + (lens) repaint
    var adjRows = document.querySelectorAll('#bo-tree [data-adj="1"]').length;
    var selRow = null; document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { if (d.getAttribute('data-bnode') === best) selRow = d; });
    var deg = selRow ? selRow.querySelector('.bn-deg') : null;
    return { ok: true, degree: bd, expected: expected, adjRows: adjRows, kc: kc, badge: deg ? deg.textContent : null };
  });
  chk('E4 selected element has element↔element neighbours', sel.ok && sel.degree > 0, 'unionDegree=' + sel.degree);
  chk('E5 highlighted rows == derived union neighbour set (parity, NON-INVENT)', sel.ok && sel.adjRows === sel.expected && sel.expected > 0, 'adjRows=' + sel.adjRows + ' expected=' + sel.expected);
  // badge must contain the abuts count (⇄N) and reflect each present kind
  var badgeOk = sel.ok && sel.badge && (!sel.kc.abuts || sel.badge.indexOf('⇄' + sel.kc.abuts) >= 0) &&
    (!sel.kc.fills || sel.badge.indexOf('⌂' + sel.kc.fills) >= 0) && (!sel.kc.aggregates || sel.badge.indexOf('⧉' + sel.kc.aggregates) >= 0);
  chk('E6 selected row badge shows per-kind degree (⇄/⌂/⧉)', badgeOk, 'badge=' + sel.badge + ' kc=' + JSON.stringify(sel.kc));
  var selLogged = logs.some(function (l) { return /§XEDGE-LENS select=.*neighbours=/.test(l); });
  chk('E7 §XEDGE-LENS select logged', selLogged);

  // A fills (door↔host) neighbour carries the ⌂ glyph (recovered-edge highlight, distinct from abuts)
  var fillsCheck = await page.evaluate(function () {
    var f = (window.swXEdges.fills || [])[0]; if (!f) return { ok: false, reason: 'no fills' };
    var present = new Set(); document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { present.add(d.getAttribute('data-bnode')); });
    if (!present.has(f.a) || !present.has(f.b)) return { ok: false, reason: 'endpoints not rows' };
    var row = null; document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { if (d.getAttribute('data-bnode') === f.a) row = d; });
    row.click();
    var nbr = null; document.querySelectorAll('#bo-tree [data-bnode]').forEach(function (d) { if (d.getAttribute('data-bnode') === f.b) nbr = d; });
    var badge = nbr ? nbr.querySelector('.bn-adj') : null;
    return { ok: !!(badge && /⌂/.test(badge.textContent)), badge: badge ? badge.textContent : null };
  });
  chk('E8 fills (door↔host) neighbour shows the ⌂ recovered-edge glyph', fillsCheck.ok, 'badge=' + (fillsCheck.badge || fillsCheck.reason));

  // Toggle the lens OFF → highlights cleared
  await page.click('#bo-adj');
  await page.waitForTimeout(150);
  var cleared = await page.evaluate(function () { return window.Bonsai.outliner._adjLens === false && document.querySelectorAll('#bo-tree [data-adj="1"]').length === 0; });
  chk('E9 lens OFF clears highlights', cleared);

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('E10 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('W-UX-XEDGE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
