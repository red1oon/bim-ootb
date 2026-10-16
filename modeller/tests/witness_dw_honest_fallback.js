#!/usr/bin/env node
/**
 * W-DW-HONEST-FALLBACK — regression witness for DW_FIXTURE_DOUBLE_RENDER_FINDING.md G5 (2026-07-13):
 * DiscWalker fixtures with no rule-mined geometry_hash AND no catalog match for their ifc_class used to
 * fall back to cat[0] — the catalog's first entry, borrowed regardless of class — e.g. a full-height
 * Column box for an electrical outlet (measured on SampleCastle: h=4.0m, unoccluded "spikes" under X-ray).
 * Fixed in modeller.html's disc-walk commit loop: an unmatched class now renders an honest measured/
 * default box (same §LIVEWIRE convention as the geometry_hash branch), never a borrowed catalog mesh.
 *
 * SampleCastle's ELEC catalog match is independently known to be EMPTY for every placed ifc_class here
 * (confirmed live: catalogHash=0/325 even pre-fix's alternative removed) — so on THIS building/discipline,
 * ANY hash-based fixture render is provably the cat[0] bug, never a legitimate match. Assertion: 0/325
 * fixtures render via a borrowed hash, 0/325 exceed 1.5m in any dimension.
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright'));

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
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL && !!window.Bonsai; }, { timeout: 25000 }).catch(function () {});

  await page.click('#b-open'); await page.waitForTimeout(200);
  await page.click('#m-open-panel .mo-row[data-key="SampleCastle"]');
  var lastN = -1, stable = 0;
  var deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    var n = await page.evaluate(function () { var g = window.Bonsai.group && window.Bonsai.group(); return g ? g.children.length : -1; });
    if (n === lastN) { stable++; if (stable >= 8) break; } else { stable = 0; lastN = n; }
    await page.waitForTimeout(250);
  }
  console.log('§OPEN SampleCastle children=' + lastN);
  // snapshot pre-walk children (uuids) so we can isolate exactly the NEW individual fold-copy meshes
  await page.evaluate(function () {
    var g = window.Bonsai.group();
    window.__preWalkUUIDs = {}; g.children.forEach(function (o) { window.__preWalkUUIDs[o.uuid] = true; });
  });

  await page.click('#bo-tree [data-disc="ELEC"]').catch(function (e) { console.log('  click ELEC failed: ' + e.message); });
  await page.waitForTimeout(2500);
  // wait for commit to settle (child count stable again, post-walk)
  lastN = -1; stable = 0; deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    var n2 = await page.evaluate(function () { var g = window.Bonsai.group && window.Bonsai.group(); return g ? g.children.length : -1; });
    if (n2 === lastN) { stable++; if (stable >= 6) break; } else { stable = 0; lastN = n2; }
    await page.waitForTimeout(250);
  }
  console.log('§WALK children=' + lastN);

  // Query the signed op-log directly (source of truth for what committed, sidesteps THREE mesh/userData
  // plumbing entirely) — every GEOM_INSERT whose params carry _dw is one of DiscWalker's individual
  // fold-copies (same mechanism every ARC element uses, per DW_FIXTURE_DOUBLE_RENDER_FINDING.md G1).
  var sample = await page.evaluate(function () {
    var ops = window.Bonsai.oplog._geomOps ? window.Bonsai.oplog._geomOps() : [];
    var out = [];
    ops.forEach(function (o) {
      var params = o.parameters || null;   // kernel_ops column name (bonsai_oplog.js _geomOps), not "params"
      if (!params) return;
      var dw = params._dw;
      if (!dw) return;
      var h, w, d, via;
      if (params.bbox) { w = params.bbox[1] - params.bbox[0]; d = params.bbox[3] - params.bbox[2]; h = params.bbox[5] - params.bbox[4]; via = 'bbox'; }
      else if (params.hash) { via = 'hash:' + params.hash; h = w = d = null; }
      out.push({ ifc: dw.ifc, disc: dw.disc, via: via, h: h != null ? +h.toFixed(3) : null, w: w != null ? +w.toFixed(3) : null, d: d != null ? +d.toFixed(3) : null });
    });
    return out;
  });
  console.log('§SAMPLE individual DW fold-copies n=' + sample.length);
  var tall = sample.filter(function (s) { return s.h >= 1.5 || s.w >= 1.5 || s.d >= 1.5; });
  // SampleCastle's ELEC catalog match is independently known to be EMPTY for every placed ifc_class
  // (confirmed via instrumented run, 2026-07-17: catalogHash=0/325 even with the fix removing the cat[0]
  // borrow) — so ANY hash-based render here is provably the old wrong-class/wrong-size cat[0] borrow,
  // not a legitimate catalog match. bbox-based = the honest fallback (fixed); hash-based = the bug (unfixed).
  var borrowed = sample.filter(function (s) { return s.via && s.via.indexOf('hash:') === 0; });
  console.log('§RESULT tallOrWide(>=1.5m)=' + tall.length + '/' + sample.length + '  cat0Borrowed=' + borrowed.length + '/' + sample.length);
  if (tall.length) console.log('  examples: ' + JSON.stringify(tall.slice(0, 5)));
  if (borrowed.length) console.log('  borrowed examples: ' + JSON.stringify(borrowed.slice(0, 5)));
  if (!tall.length && !borrowed.length) console.log('  max dim seen: ' + JSON.stringify(sample.slice().sort(function (a, b) { return Math.max(b.h||0, b.w||0, b.d||0) - Math.max(a.h||0, a.w||0, a.d||0); })[0]));

  console.log(logs.filter(function (l) { return /PAGEERROR|§DISC-WALK|§DW-FOLD-DEBUG/.test(l); }).join('\n'));
  await browser.close();
  srv.close();
  process.exit((tall.length || borrowed.length) ? 1 : 0);
})().catch(function (e) { console.log('❌ UNCAUGHT ' + String(e && e.message || e)); process.exit(1); });
