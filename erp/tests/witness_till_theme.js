#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-THEME (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §36.1/§36.3/§36.8). READ THE LOG (/tmp/theme_logs/theme.log): exit code is not evidence.
// THE ISSUE: the owner asked for "the same design and color schema" as his 2011 Openbravo POS (guide p23) and a switchable schema. The expected hex values below are the §36.1 table (extracted from the p23 pixels,
// /tmp/theme_logs/palette_p23.log), typed here INDEPENDENTLY of erp/till_theme.js, so a wrong theme file cannot pass its own witness. Computed styles of the real till page, never screenshots.
// Judges: (1) every themed region's computed colour == the p23 hex under Classic (the default); (2) Setup "Look and Feel" -> Modern changes them and Classic<->Modern survives a reload;
// (3) the left menu panel exists with Main/Administration/System, `‹` collapses it and the ticket column widens by the measured panel width, cat-height 320 and 107x60 tiles unchanged.
// Mutant (copy served by the harness, proven applied once): THEME_MUT=wrongkey changes the classic key text colour in till_theme.js. Logs /tmp/theme_logs/.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), MUT = process.env.THEME_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var MUTS = { wrongkey: ['#391CAA', '#391CAB'] };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §THEME_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var rgb = function (h) { return 'rgb(' + [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }).join(', ') + ')'; };
// region -> [selector, css property, expected hex list ('has' = every hex must appear in the value), source = §36.1 row]
var CLASSIC = [
  ['window bg', 'body', 'backgroundColor', ['#EEEEEE'], 'p23 window_bg_titlebar'], ['left menu body', '#leftmenu', 'backgroundColor', ['#EEEEEE'], 'p23 left_menu_body'],
  ['catalog bg', '#south', 'backgroundColor', ['#EEEEEE'], 'p23 catalog_bg'],
  ['ticket surface (unselected rows)', '#lines table', 'backgroundColor', ['#FFFFFF'], 'p23 ticket_row_unselected'], ['totals field', '#t-tot', 'backgroundColor', ['#FFFFFF'], 'p23 totals_field'],
  ['clock/ticket field', '#tid', 'backgroundColor', ['#FFFFFF'], 'p23 clock_field'], ['ticket row selected', '#tl tr.sel', 'backgroundColor', ['#B9CEE7'], 'p23 ticket_row_selected'],
  ['category row selected', '#cats button.on', 'backgroundColor', ['#B9CEE7'], 'p23 category_row_selected'],
  ['button gradient', 'button[data-btn="Print preview"]', 'backgroundImage', ['#F8FAFC', '#E1EBF5', '#C7D8EC'], 'p23 button_gradient_print'],
  ['button outline', 'button[data-btn="Print preview"]', 'borderTopColor', ['#8090A1'], 'p23 button_gradient_print y833'],
  ['keypad key text', '#east .key', 'color', ['#391CAA'], 'p23 keypad_CE_text'], ['label text', '#totals', 'color', ['#343434'], 'p23 label_text_Subtotal_Total'],
  ['menu section header', '#leftmenu .lm-h', 'backgroundImage', ['#F1F5F9', '#C7D8EC'], 'p23 menu_section_header'], ['product tile gradient', '#products .prod', 'backgroundImage', ['#F8FAFC', '#BBD0E8'], 'p23 tile_gradient'],
  ['placeholder icon (tile colour)', '#products .prod .noimg', 'color', ['#8090A1'], 'p23 tile outline'], ['hairline under the top strip', '#topbar', 'borderBottomColor', ['#B7C0C9'], 'p23 window_hairline_under_titlebar']];
var srv = http.createServer(function (q, r) { var u = q.url.split('?')[0], p = path.join(ROOT, decodeURIComponent(u)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  if (MUT && u.endsWith('/till_theme.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT], n = src.split(m[0]).length - 1; console.log('§THEME_MUT ' + MUT + ' applied=' + n); return r.end(src.split(m[0]).join(m[1])); } fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), errs = [];
  pg.on('console', function (m) { var t = m.text(); if (/§TILL_THEME|§TILL_LAYOUT|🔴/.test(t)) console.log(t.slice(0, 220)); }); pg.on('pageerror', function (e) { errs.push(e.message); console.log('PAGEERR ' + e.message.slice(0, 200)); });
  console.log('═══ W-TILL-THEME ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  var url = 'http://localhost:' + srv.address().port + '/erp/till.html';
  async function boot() { await pg.goto(url, { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready', null, { timeout: 170000 }); await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]');
    await pg.evaluate(function () { var S = Till.state(), by = {}; S.prods.forEach(function (p) { (by[p.cat] = by[p.cat] || []).push(p); }); S.catPath = [Number(Object.keys(by).sort(function (a, c) { return by[c].length - by[a].length; })[0])]; Till.go('sales'); });
    await pg.waitForTimeout(400); }
  async function addTwo() { var n = await pg.evaluate(function () { return Till.state().ticket.lines.length; }); if (n >= 2) return; await pg.locator('#products .prod').nth(0).click(); await pg.waitForTimeout(200); await pg.locator('#products .prod').nth(1).click(); await pg.waitForTimeout(300); }
  async function read(list) { var r = await read0(list); await pg.evaluate(function () { var S = Till.state(); window.__prev = [S.cat, S.catPath]; S.catPath = []; Till.go('sales'); var b = document.querySelector('#cats button[data-cat]'); if (b) { S.cat = Number(b.getAttribute('data-cat')); Till.go('sales'); } }); var cl = list.map(function (x) { return x[1] === '#cats button.on' ? x : ['', 'html', 'color']; }), rc = await read0(cl); r = r.map(function (v, i) { return list[i][1] === '#cats button.on' ? rc[i] : v; }); await pg.evaluate(function () { var S = Till.state(); S.cat = window.__prev[0]; S.catPath = window.__prev[1]; Till.go('sales'); }); return r; }
  async function read0(list) { return pg.evaluate(function (list) { return list.map(function (r) { var e = document.querySelector(r[1]); return e ? getComputedStyle(e)[r[2]] : null; }); }, list.map(function (r) { return [r[0], r[1], r[2]]; })); }
  function judge(tag, list, vals) { list.forEach(function (r, i) { var v = vals[i], want = r[3]; var ok = v != null && want.every(function (h) { return v.indexOf(rgb(h)) >= 0; }); check(ok, tag + ': ' + r[0] + ' == ' + want.join('+') + ' [' + r[4] + ']', 'computed=' + (v == null ? 'NO-ELEMENT' : v.slice(0, 110))); }); }
  await boot(); await addTwo();
  var th = await pg.evaluate(function () { return document.documentElement.getAttribute('data-theme'); }); check(th === 'classic', 'the DEFAULT theme is classic (no setting made)', 'data-theme=' + th);
  var c1 = await read(CLASSIC); judge('classic', CLASSIC, c1);
  // layout under classic + left panel collapse
  var L = function () { return pg.evaluate(function () { var w = function (s) { var e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width * 10) / 10 : -1; }; var h = function (s) { var e = document.querySelector(s); return e ? e.getBoundingClientRect().height : -1; };
    var tiles = Array.prototype.map.call(document.querySelectorAll('#products .prod'), function (e) { var r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); return { menu: w('#leftmenu'), ticket: w('#ticketcol'), south: h('#south'), tiles: tiles, hides: !!document.querySelector('#lm-hide'), secs: Array.prototype.map.call(document.querySelectorAll('#leftmenu .lm-h'), function (e) { return e.textContent.trim(); }) }; }); };
  var e0 = await L(); console.log('§THEME_MEASURE expanded ' + JSON.stringify({ menu: e0.menu, ticket: e0.ticket, south: e0.south, secs: e0.secs, t0: e0.tiles[0], n: e0.tiles.length }));
  check(e0.secs.length === 3 && e0.secs.join('|').replace(/[^A-Za-z|]/g, '') === 'Main|Administration|System', 'left panel sections Main / Administration / System [p23]', JSON.stringify(e0.secs));
  check(e0.hides && Math.abs(e0.south - 320) <= 1 && e0.tiles.length > 0 && e0.tiles.every(function (t) { return t[0] === 107 && t[1] === 60; }), 'W-TILL-LAYOUT numbers with the panel open: cat-height 320, tiles 107x60', 'south=' + e0.south + ' t0=' + JSON.stringify(e0.tiles[0]));
  if (e0.hides) { await pg.click('#lm-hide'); await pg.waitForTimeout(350); }
  var e1 = await L(); console.log('§THEME_MEASURE collapsed ' + JSON.stringify({ menu: e1.menu, ticket: e1.ticket, south: e1.south }));
  check(e0.hides && e1.ticket > e0.ticket && Math.abs((e1.ticket - e0.ticket) - (e0.menu - e1.menu)) <= 1.5, 'collapse widens the ticket column by exactly the freed panel width (+-1.5 px)', 'ticket ' + e0.ticket + '->' + e1.ticket + ' panel ' + e0.menu + '->' + e1.menu);
  check(Math.abs(e1.south - 320) <= 1 && e1.tiles.every(function (t) { return t[0] === 107 && t[1] === 60; }), 'cat-height 320 and 107x60 tiles unchanged after collapse', 'south=' + e1.south);
  if (e0.hides) { await pg.click('#lm-hide'); await pg.waitForTimeout(350); }
  // switch in Setup (the real screen), Save
  await pg.click('#cfg-open'); await pg.waitForSelector('#cfg-body [data-key="ui.theme"]', { timeout: 4000 }).catch(function () {});
  var has = await pg.$('#cfg-body [data-key="ui.theme"]'); check(!!has, 'Setup General has the Look and Feel key ui.theme [swing.defaultlaf]', '');
  if (has) { await pg.selectOption('#cfg-body [data-key="ui.theme"]', 'modern'); await pg.click('#cfg-save'); await pg.waitForTimeout(400); }
  var th2 = await pg.evaluate(function () { return document.documentElement.getAttribute('data-theme'); }); check(th2 === 'modern', 'Save applies the theme at once', 'data-theme=' + th2);
  await pg.evaluate(function () { Till.go('sales'); }); await pg.waitForTimeout(300);
  var c2 = await read(CLASSIC); var diff = CLASSIC.filter(function (r, i) { return c1[i] !== c2[i]; }).length;
  console.log('§THEME_MEASURE modern differs in ' + diff + ' of ' + CLASSIC.length + ' regions');
  check(diff >= 12, 'Modern changes the themed regions (not a no-op)', 'differs=' + diff + '/' + CLASSIC.length);
  var bg = await pg.evaluate(function () { return getComputedStyle(document.body).backgroundColor; }); check(bg === rgb('#F0F0F0'), 'Modern keeps the previous look: body bg #f0f0f0', bg);
  await boot(); var th3 = await pg.evaluate(function () { return document.documentElement.getAttribute('data-theme'); }); check(th3 === 'modern', 'the choice survives a reload (device store)', 'data-theme=' + th3);
  // back to classic through the UI, survives reload
  await pg.click('#cfg-open'); await pg.selectOption('#cfg-body [data-key="ui.theme"]', 'classic').catch(function () {}); await pg.click('#cfg-save'); await pg.waitForTimeout(300);
  await boot(); await addTwo(); var c3 = await read(CLASSIC); judge('classic-after-reload', CLASSIC, c3);
  check(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | '));
  console.log('§THEME_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
