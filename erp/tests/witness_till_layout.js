#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-LAYOUT + W-TILL-SCREENS (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §33.1, §33.2, §33.5). READ THE LOG (/tmp/tillui_logs/layout.log): exit code is not evidence.
// THE ISSUES: (1) the catalog region was a short row under an empty band; uniCenta sizes it by cat-height (JPanelTicketSales.java:78-80, Ticket.Buttons.xml:77-80) as the SOUTH of the form (JPanelTicket.form:1050),
// the lines take the rest, tiles are img-width x img-height. (2) #u3 {display:grid} beats .screen {display:none}, so the sales screen shows under every other screen. Real till page, numbers from the DOM.
// Mutant (copy served by the harness, proven applied once): TLAY_MUT=nocat drops the cat-height row from till.js.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), MUT = process.env.TLAY_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var MUTS = { nocat: ["$('#south').style.height", "$('#south').style.xheight"] };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §LAYOUT_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var srv = http.createServer(function (q, r) { var u = q.url.split('?')[0], p = path.join(ROOT, decodeURIComponent(u)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  if (MUT && u.endsWith('/till.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT], n = src.split(m[0]).length - 1; console.log('§TLAY_MUT ' + MUT + ' applied=' + n); return r.end(src.split(m[0]).join(m[1])); } fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), errs = [];
  async function open(w, h) { var pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); pg.on('console', function (m) { var t = m.text(); if (/§TILL_LAYOUT|§TILL_CATALOG|🔴/.test(t)) console.log(t.slice(0, 240)); }); pg.on('pageerror', function (e) { errs.push(e.message); console.log('PAGEERR ' + e.message.slice(0, 200)); });
    await pg.goto('http://localhost:' + srv.address().port + '/erp/till.html', { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready', null, { timeout: 170000 });
    await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]'); return pg; }
  console.log('═══ W-TILL-LAYOUT / W-TILL-SCREENS ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  async function measure(pg, ch) {
    return pg.evaluate(function (ch) { var S = Till.state(); if (ch != null) S.sizes = Object.assign({}, S.sizes || { 'img-width': 107, 'img-height': 60 }, { 'cat-height': ch });
      var by = {}; S.prods.forEach(function (p) { (by[p.cat] = by[p.cat] || []).push(p); }); var cat = Number(Object.keys(by).sort(function (a, c) { return by[c].length - by[a].length; })[0]); S.catPath = [cat]; Till.go('sales'); return new Promise(function (resolve) { setTimeout(function () { resolve(read()); }, 320); }); function read() {   /* the catalog height has one CSS transition (.15 s): measure after it */
      var R = function (s) { var e = document.querySelector(s), r = e && e.getBoundingClientRect(); return r && { t: r.top, b: r.bottom, h: r.height, w: r.width, l: r.left }; };
      var tiles = Array.prototype.map.call(document.querySelectorAll('#products .prod'), function (e) { var r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      var lines = R('#lines'), tot = R('#totals'), rc = R('#rightcol'), south = R('#south'), mid = Math.max(lines ? lines.b : 0, tot ? tot.b : 0, rc ? rc.b : 0);
      return { south: south, lines: lines, totals: tot, tiles: tiles, gap: south.t - mid, vh: innerHeight, expectCat: (S.sizes || {})['cat-height'], ntiles: tiles.length, mid: mid }; } }, ch); }
  async function judge(w, h, tag) {
    var pg = await open(w, h), m = await measure(pg, null), want = 320;
    console.log('§LAYOUT_MEASURE ' + tag + ' ' + JSON.stringify({ south: m.south, gap: m.gap, tiles: m.ntiles, t0: m.tiles[0], vh: m.vh }));
    if (!m.ntiles) { console.log('§LAYOUT_VERDICT INCONCLUSIVE no product tiles in the best category'); await b.close(); srv.close(); process.exit(2); }
    check(Math.abs(m.south.h - want) <= 1, tag + ': catalog region height == cat-height ' + want + ' (+-1)', 'measured=' + m.south.h);
    check(m.tiles.every(function (t) { return t[0] === 107 && t[1] === 60; }), tag + ': every product tile box == img-width x img-height 107x60', JSON.stringify(m.tiles[0]) + ' of ' + m.ntiles);
    check(m.gap <= 8 && m.gap >= -1, tag + ': no empty band between the ticket region and the catalog', 'gap=' + Math.round(m.gap));
    check(m.lines.h > 0 && m.totals.h > 0, tag + ': the ticket region has height', 'lines=' + Math.round(m.lines.h));
    if (w >= 1000) check(Math.abs(m.south.b - m.vh) <= 12, tag + ': the sales screen fills the viewport (catalog is its bottom edge)', 'south.bottom=' + Math.round(m.south.b) + ' vh=' + m.vh);
    if (w >= 1000) { var fit = await pg.evaluate(function () { var r = document.getElementById('rightcol'); return { sh: r.scrollHeight, ch: r.clientHeight }; }); check(fit.sh <= fit.ch + 1, tag + ': the keypad column fits (nothing clipped or scrolled)', JSON.stringify(fit)); }
    var m2 = await measure(pg, 200); check(Math.abs(m2.south.h - 200) <= 1, tag + ': the branch setting cat-height=200 drives the region height', 'measured=' + m2.south.h);
    return pg; }
  var pg = await judge(1280, 800, '1280x800'); await judge(390, 844, 'phone390');
  // W-TILL-SCREENS: after every go(), exactly one screen is visible
  var res = await pg.evaluate(function () { var out = [], names = Object.keys({ login: 1, menu: 1, sales: 1, pay: 1, receipt: 1, close: 1, editsales: 1, refund: 1, custpay: 1, payments: 1, vouchers: 1, presence: 1, pickup: 1, floors: 1, reservations: 1, setup: 1, heldlist: 1, reprintlist: 1 });
    names.forEach(function (n) { try { Till.go(n); } catch (e) { /* a hook may need data; the screen switch itself ran first */ } var vis = Array.prototype.filter.call(document.querySelectorAll('.screen'), function (e) { return getComputedStyle(e).display !== 'none'; }).map(function (e) { return e.id; }); out.push({ n: n, vis: vis, on: Till.state().screen }); }); return out; });
  var bad = res.filter(function (r) { return r.vis.length !== 1; });
  console.log('§SCREENS_MEASURE ' + JSON.stringify(res.map(function (r) { return r.n + ':' + r.vis.join('+'); })));
  check(res.length >= 15 && bad.length === 0, 'exactly one screen visible after each of ' + res.length + ' screen switches', 'bad=' + JSON.stringify(bad.map(function (r) { return r.n + '->' + r.vis.join('+'); })));
  check(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | '));
  console.log('§LAYOUT_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
