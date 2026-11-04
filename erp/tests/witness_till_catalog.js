#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-CATALOG (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §29.N rows 4-7, §32.2). READ THE LOG (/tmp/rest_logs/catalog.log): exit code is not evidence.
// THE ISSUE: product tiles were text buttons; uniCenta shows a picture (img-width x img-height, default 107 x 60, Ticket.Buttons.xml:77) with the name and price, a placeholder when there is no picture, in the
// product query's order (ORDER BY value). Real till page in headless Chromium. The pictures are given as URLs only (the bytes are the SW media cache's, judged by witness_till_media.js).
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §CATALOG_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var srv = http.createServer(function (q, r) { var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), pg = await b.newPage(); pg.on('console', function (m) { var t = m.text(); if (/§TILL_CATALOG|§TILL_MEDIA|🔴/.test(t)) console.log(t.slice(0, 220)); }); pg.on('pageerror', function (e) { console.log('PAGEERR ' + e.message.slice(0, 200)); });
  console.log('═══ W-TILL-CATALOG ═══');
  await pg.goto('http://localhost:' + srv.address().port + '/erp/till.html', { waitUntil: 'load' });
  await pg.waitForFunction('window.Till && window.Till.ready', null, { timeout: 170000 });
  await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]');
  var pick = await pg.evaluate(function () { var S = Till.state(), by = {}; S.prods.forEach(function (p) { (by[p.cat] = by[p.cat] || []).push(p); }); var best = Object.keys(by).sort(function (a, c) { return by[c].length - by[a].length; })[0]; return best == null ? null : { cat: Number(best), n: by[best].length, hasKey: 'img' in S.prods[0] }; });
  if (!pick || pick.n < 3) { console.log('§CATALOG_VERDICT INCONCLUSIVE no category with 3 products'); await b.close(); srv.close(); process.exit(2); }
  check(pick.hasKey, 'the product query carries imageurl (S.prods[].img)');
  var res = await pg.evaluate(function (cat) { var S = Till.state(); S.catPath = [cat]; var inCat = S.prods.filter(function (p) { return Number(p.cat) === cat; }); inCat[0].img = 'https://objectstorage.example/icons/a.svg'; inCat[1].img = 'https://objectstorage.example/icons/b.svg'; inCat[2].img = ''; S.sizes = null; Till.go('sales');
    var tiles = Array.from(document.querySelectorAll('#products .prod')), im = Array.from(document.querySelectorAll('#products .prod img'));
    return { pids: tiles.map(function (t) { return Number(t.getAttribute('data-pid')); }), expect: inCat.map(function (p) { return p.pid; }), widths: tiles.map(function (t) { return t.style.width; }), img: im.map(function (i) { return { l: i.getAttribute('loading'), d: i.getAttribute('decoding'), c: i.getAttribute('crossorigin'), w: i.getAttribute('width'), h: i.getAttribute('height') }; }),
      ph: document.querySelectorAll('#products .prod svg.noimg').length, noimg: inCat.filter(function (p) { return !p.img; }).length, txt: tiles[0].querySelector('.pn').firstChild.textContent + '|' + tiles[0].querySelector('.pp').textContent, name0: inCat[0].name }; }, pick.cat);
  check(JSON.stringify(res.pids) === JSON.stringify(res.expect), 'tile order = the product query order (ORDER BY value) for the category', res.pids.length + ' tiles');
  check(res.widths.every(function (w) { return w === '107px'; }), 'tile box = img-width 107 (uniCenta default; the picture fills it)', res.widths[0]);
  check(res.img.length === 2 && res.img.every(function (i) { return i.l === 'lazy' && i.d === 'async' && i.c === 'anonymous' && i.w === '107' && i.h === '60'; }), 'pictures are lazy, async-decoded, CORS, 107 x 60', JSON.stringify(res.img[0]));
  check(res.ph === res.noimg && res.ph >= 1, 'every product without ImageURL shows the Lucide image-off placeholder', 'placeholders=' + res.ph + ' noimg=' + res.noimg);
  check(res.txt.split('|')[0] === res.name0 && /\d/.test(res.txt.split('|')[1]), 'a tile shows the name and a price line', res.txt);
  var big = await pg.evaluate(function () { var S = Till.state(); S.sizes = { 'img-width': 150, 'img-height': 80 }; Till.go('sales'); var i = document.querySelector('#products .prod img'); return i && [i.getAttribute('width'), i.getAttribute('height')].join('x'); });
  check(big === '150x80', 'a branch setting changes the tile picture size', big);
  console.log('§CATALOG_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
