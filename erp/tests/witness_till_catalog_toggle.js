#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-CATALOG-TOGGLE (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §33.8). READ THE LOG (/tmp/tillui_logs/toggle.log): exit code is not evidence.
// THE ISSUE (owner request, an addition beyond uniCenta; default unchanged): the catalog folds to a slim bar and back; the ticket takes the freed height; the choice is remembered per device (the §29.D.1 settings store).
// Mutant TOG_MUT=nopersist (copy served by the harness, proven applied once): the toggle does not save the store.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), MUT = process.env.TOG_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var MUTS = { nopersist: ["saveStore(); renderCats(); log('§TILL_CATALOG_TOGGLE", "renderCats(); log('§TILL_CATALOG_TOGGLE"] };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §TOGGLE_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var srv = http.createServer(function (q, r) { var u = q.url.split('?')[0], p = path.join(ROOT, decodeURIComponent(u)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  if (MUT && u.endsWith('/till.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT], n = src.split(m[0]).length - 1; console.log('§TOG_MUT ' + MUT + ' applied=' + n); return r.end(src.split(m[0]).join(m[1])); } fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), errs = [];
  pg.on('console', function (m) { var t = m.text(); if (/§TILL_CATALOG_TOGGLE|§TILL_LAYOUT/.test(t)) console.log(t.slice(0, 200)); }); pg.on('pageerror', function (e) { errs.push(e.message); });
  console.log('═══ W-TILL-CATALOG-TOGGLE ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  var url = 'http://localhost:' + srv.address().port + '/erp/till.html';
  async function boot() { await pg.goto(url, { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready', null, { timeout: 170000 }); await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]');
    await pg.evaluate(function () { var S = Till.state(), by = {}; S.prods.forEach(function (p) { (by[p.cat] = by[p.cat] || []).push(p); }); S.catPath = [Number(Object.keys(by).sort(function (a, c) { return by[c].length - by[a].length; })[0])]; Till.go('sales'); }); }
  var H = function () { return pg.evaluate(function () { var h = function (s) { var e = document.querySelector(s); return e ? e.getBoundingClientRect().height : -1; }; return { south: h('#south'), bar: h('#catbar'), ticket: h('#ticketcol'), body: document.querySelector('#catbody').hidden }; }); };
  await boot(); await pg.evaluate(function () { var S = Till.state(); if (S.store.setup) delete S.store.setup['catalog.collapsed']; Till.go('sales'); });
  var e = await H(); console.log('§TOGGLE_MEASURE expanded ' + JSON.stringify(e));
  check(Math.abs(e.south - 320) <= 1 && !e.body, 'default = expanded at cat-height 320', JSON.stringify(e));
  await pg.click('#catbar'); await pg.waitForTimeout(400); var c = await H(); console.log('§TOGGLE_MEASURE collapsed ' + JSON.stringify(c));
  check(Math.abs(c.south - c.bar) <= 1 && c.bar > 0 && c.body, 'collapsed: the catalog region is the slim bar', JSON.stringify(c));
  check(Math.abs((c.ticket - e.ticket) - (e.south - c.south)) <= 1 && c.ticket > e.ticket, 'the ticket region grows by exactly the freed height (+-1 px)', 'grew=' + (c.ticket - e.ticket) + ' freed=' + (e.south - c.south));
  var ic = await pg.$eval('#catbar svg path', function (p) { return p.getAttribute('d'); }); check(ic === 'm18 15-6-6-6 6', 'collapsed bar shows Lucide chevron-up (tap to expand)', ic);
  await boot(); var r = await H(); check(r.body && Math.abs(r.south - r.bar) <= 1, 'the collapsed state survives a reload (device store)', JSON.stringify(r));
  await pg.click('#catbar'); await pg.waitForTimeout(400); var x = await H(); check(Math.abs(x.south - 320) <= 1 && !x.body, 're-expanded at cat-height', JSON.stringify(x));
  var n0 = await pg.evaluate(function () { return Till.state().ticket.lines.length; }); await pg.click('#products .prod', { timeout: 3000 }).catch(function () {}); await pg.waitForTimeout(300); var n1 = await pg.evaluate(function () { return Till.state().ticket.lines.length; });
  check(n1 === n0 + 1, 'a product picked after re-expanding rings normally', n0 + '->' + n1);
  await boot(); var y = await H(); check(!y.body && Math.abs(y.south - 320) <= 1, 'expanded state also survives a reload', JSON.stringify(y));
  check(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | '));
  console.log('§TOGGLE_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
