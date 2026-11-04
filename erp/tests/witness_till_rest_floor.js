#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REST-FLOOR (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §33.7). READ THE LOG (/tmp/tillui_logs/rest_floor.log): exit code is not evidence.
// THE ISSUE (owner 2026-11-04): the restaurant lens must look like uniCenta's: drawn tables WITH chairs on a 960x600 floor, places as transparent buttons centred on (x, y) (Place.java:204-227), occupied = users icon + the configured colours.
// Numbers are the DOM's, measured in the 960x600 space through the stage scale. Real till page, mode restaurant.
// Mutants (copies served by the harness, proven applied): chairs-const (chairs not from seats), round-inverted (round rule flipped).
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), MUT = process.env.RFL_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §RFL_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var MUTS = { 'chairs-const': ['function drawTable(W, H, n) {', 'function drawTable(W, H, n) { n = 4;'], 'round-inverted': ['var round = W === H,', 'var round = W !== H,'] };
var srv = http.createServer(function (q, r) { var u = q.url.split('?')[0], p = path.join(ROOT, decodeURIComponent(u)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  if (MUT && u.endsWith('/till_rest.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT], n = src.split(m[0]).length - 1; console.log('§RFL_MUT ' + MUT + ' applied=' + n); return r.end(src.split(m[0]).join(m[1])); } fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), errs = [];
  async function open(w) { var pg = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage(); pg.on('console', function (m) { var t = m.text(); if (/§TILL_REST_DRAW|🔴/.test(t)) console.log(t.slice(0, 200)); }); pg.on('pageerror', function (e) { errs.push(e.message); });
    await pg.goto('http://localhost:' + srv.address().port + '/erp/till.html?mode=restaurant', { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready && window.TillRest', null, { timeout: 170000 });
    await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]'); await pg.waitForSelector('#fl-map .place'); return pg; }
  // measure every table of the current map in the 960x600 space
  function measure(pg) { return pg.evaluate(function () { var st = document.getElementById('fl-stage').getBoundingClientRect(), k = st.width / 960;
    return { k: k, stageH: st.height / k, t: Array.prototype.map.call(document.querySelectorAll('#fl-map .place'), function (e) { var bd = e.querySelector('.tbl-body'), br = e.getBoundingClientRect(), r = bd && bd.getBoundingClientRect(), s = e.querySelector('svg.tbl');
      return { id: e.getAttribute('data-place'), W: Number(e.getAttribute('data-w')), H: Number(e.getAttribute('data-h')), seats: Number(e.getAttribute('data-seats')), btn: [(br.left - st.left) / k, (br.top - st.top) / k, br.width / k, br.height / k], body: r && [(r.left - st.left) / k, (r.top - st.top) / k, r.width / k, r.height / k], chairs: e.querySelectorAll('.chair').length, shape: s && s.getAttribute('data-shape'), occ: e.querySelectorAll('svg.occ').length, busy: e.getAttribute('data-occupied'), cols: Array.prototype.map.call(e.querySelectorAll('.lbl span'), function (x) { return getComputedStyle(x).color; }) }; }) }; }); }
  var near = function (a, b) { return Math.abs(a - b) <= 1; };
  console.log('═══ W-REST-FLOOR ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  for (var w of [1280, 700]) {
    var pg = await open(w), m = await measure(pg), tag = w + 'px k=' + m.k.toFixed(3);
    if (!m.t.length) { console.log('§RFL_VERDICT INCONCLUSIVE no tables drawn'); await b.close(); srv.close(); process.exit(2); }
    var seedX = function (i) { return 100 + 150 * (i % 6); }, seedY = function (i) { return 50 + 100 * Math.floor(i / 6); };
    var badBox = m.t.filter(function (t, i) { return !t.body || !near(t.body[0], seedX(i) - t.W / 2) || !near(t.body[1], seedY(i) - t.H / 2) || !near(t.body[2], t.W) || !near(t.body[3], t.H) || t.W !== 90 || t.H !== 45; });
    check(m.t.length === 24 && badBox.length === 0, tag + ': the uniCenta seed floor: 24 tables, each drawn box == 90x45 centred on its seeded x,y (+-1 px in 960x600)', 'tables=' + m.t.length + ' bad=' + JSON.stringify(badBox.slice(0, 2)));
    check(near(m.stageH, 600), tag + ': the floor is uniCenta\'s 960x600 space', 'h=' + m.stageH);
    var badCh = m.t.filter(function (t, i) { return t.chairs !== [2, 4, 6][i % 3] || t.seats !== t.chairs; }); check(badCh.length === 0, tag + ': chair count == seats for every table (2/4/6)', JSON.stringify(badCh.slice(0, 2)));
    if (w === 700) continue;
    // a branch floor with round, rectangular, square and odd-seat tables, one open table
    await pg.evaluate(async function () { var A = Till, E = A.engine(), cl = A.state().cfg.client, og = A.state().cfg.org, mk = function (t, f) { return { op_type: 'CRUD_CREATE', key: t, table: t, verb: 'create', fields: Object.assign({ ad_client_id: cl, ad_org_id: og }, f) }; };
      var ops = [mk('pos_floorplan', { kind: 'F', recid: 'F1', name: 'Hall', seq: 1, image: 'https://objectstorage.example/floors/hall.png' })];
      [['R1', 300, 200, 60, 60, 4], ['R2', 500, 200, 120, 50, 6], ['R3', 700, 200, 50, 50, 2], ['R4', 300, 400, 100, 40, 5], ['R5', 500, 400, 90, 45, 1], ['R6', 700, 400, 150, 150, 8]].forEach(function (t) { ops.push(mk('pos_floorplan', { kind: 'P', recid: t[0], name: t[0], floorid: 'F1', seats: t[5], x: t[1], y: t[2], w: t[3], h: t[4], seq: 1 })); });
      ops.push(mk('pos_opentable', { placeid: 'R2', seq: 3, state: 'O', lockedby: '', customer: 'Aminah', waiter: 'Ravi', guests: 2, since: Date.now() - 600000, body: '{"lines":[{"name":"x","qty":1,"price":1}]}' }));
      await new Promise(function (ok) { E.__crud.applyOpGroup(ops, ok); }); });
    await pg.click('#fl-reload'); await pg.waitForFunction("document.querySelectorAll('#fl-map .place').length===6"); await pg.waitForTimeout(300); m = await measure(pg);
    var exp = { R1: [300, 200, 60, 60, 4, 'round'], R2: [500, 200, 120, 50, 6, 'rect'], R3: [700, 200, 50, 50, 2, 'round'], R4: [300, 400, 100, 40, 5, 'rect'], R5: [500, 400, 90, 45, 1, 'rect'], R6: [700, 400, 150, 150, 8, 'round'] };
    m.t.forEach(function (t) { var e = exp[t.id]; check(t.body && near(t.body[0], e[0] - e[2] / 2) && near(t.body[1], e[1] - e[3] / 2) && near(t.body[2], e[2]) && near(t.body[3], e[3]), 'table ' + t.id + ': drawn box == ' + e[2] + 'x' + e[3] + ' centred on (' + e[0] + ',' + e[1] + ')', JSON.stringify(t.body));
      check(t.chairs === e[4] && t.shape === e[5], 'table ' + t.id + ': ' + e[4] + ' chairs, ' + e[5] + ' (round iff width == height)', 'chairs=' + t.chairs + ' shape=' + t.shape); });
    var r2 = m.t.filter(function (t) { return t.id === 'R2'; })[0], others = m.t.filter(function (t) { return t.id !== 'R2'; });
    check(r2.busy === '1' && r2.occ === 1 && others.every(function (t) { return t.occ === 0 && t.busy === '0'; }), 'occupied shows the Lucide users icon, free tables show none', 'r2.occ=' + r2.occ);
    check(r2.cols[0] === 'rgb(88, 176, 0)' && r2.cols[1] === 'rgb(37, 143, 176)' && r2.cols[2] === 'rgb(214, 46, 82)', 'occupied label uses the configured colours (customer #58B000, waiter #258FB0, table name #D62E52)', JSON.stringify(r2.cols));
    // IMAGE mode: table.transbtn on = the floor picture, transparent buttons only, nothing drawn
    await pg.evaluate(function () { var S = Till.state(); S.store.setup = S.store.setup || {}; S.store.setup['table.transbtn'] = true; }); await pg.click('#fl-reload'); await pg.waitForTimeout(500); m = await measure(pg);
    var img = await pg.evaluate(function () { var f = document.querySelector('#fl-stage .floorimg'); return f ? getComputedStyle(f).backgroundImage : ''; });
    check(m.t.length === 6 && m.t.every(function (t) { return t.body === null && t.chairs === 0; }), 'image mode: no drawn table and no chair on any of the 6 tables', 'drawn=' + m.t.filter(function (t) { return t.body; }).length);
    check(/hall\.png/.test(img), 'image mode: the floor\'s own picture is the background', img);
    check(m.t.every(function (t) { var e = exp[t.id]; return near(t.btn[0], e[0] - e[2] / 2) && near(t.btn[1], e[1] - e[3] / 2) && near(t.btn[2], e[2]) && near(t.btn[3], e[3]); }), 'image mode: each transparent button box == its width x height centred on (x, y)', JSON.stringify(m.t[0].btn));
    var bg = await pg.$eval('#fl-map .place', function (e) { return getComputedStyle(e).backgroundColor; }); check(bg === 'rgba(0, 0, 0, 0)', 'image mode: the buttons are transparent', bg);
  }
  check(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | '));
  console.log('§RFL_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
