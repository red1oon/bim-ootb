#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-REST (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §32.1 items 2-3, §29.N rows 8-18). READ THE LOG (/tmp/rest_logs/till_rest.log): exit code is not evidence.
// THE ISSUE: the till kept open tables per device in localStorage. This drives the REAL till page (mode restaurant) over the branch rows: floors/tables from POS_FloorPlan, a table saved ONCE when the waiter leaves it
// (counted at the till's deposit + Visit), a lock held by another till blocks, reservation booking -> check-in picks the table -> done. TWO-DEVICE visibility over a real pipe is NOT judged here (witness_rest.js judges the
// fold on a shared relay; a paired-device run needs the witness_eoda harness): that claim is open. Mutant TREST_MUT=no-leave-on-map serves a till_rest.js that never saves on leaving.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), MUT = process.env.TREST_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §TREST_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var MUTS = { 'no-leave-on-map': ["await leaveCurrent();                                   // coming back", "// await leaveCurrent();                                   // coming back"] };
var srv = http.createServer(function (q, r) { var u = q.url.split('?')[0], p = path.join(ROOT, decodeURIComponent(u)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  if (MUT && u.endsWith('/till_rest.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT]; var n = src.split(m[0]).length - 1; console.log('§TREST_MUT ' + MUT + ' applied=' + n); r.end(src.replace(m[0], m[1])); return; } fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), pg = await b.newPage(); pg.on('console', function (m) { var t = m.text(); if (/§TILL_REST|🔴/.test(t)) console.log(t.slice(0, 220)); }); pg.on('pageerror', function (e) { console.log('PAGEERR ' + e.message.slice(0, 200)); });
  console.log('═══ W-TILL-REST ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/till.html?mode=restaurant', { waitUntil: 'load' });
  await pg.waitForFunction('window.Till && window.Till.ready && window.TillRest', null, { timeout: 170000 });
  await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]'); await pg.waitForSelector('#floors #fl-map .place');
  var seed = await pg.$$eval('#fl-map .place', function (x) { return x.length; }); check(seed === 24, 'no branch floors yet: uniCenta seed floor shows 24 tables (in memory)', 'tables=' + seed);
  // the branch admin's rows (what branch_floors.js writes)
  await pg.evaluate(async function () { var A = Till, E = A.engine(), cl = A.state().cfg.client, og = A.state().cfg.org, mk = function (t, f) { return { op_type: 'CRUD_CREATE', key: t, table: t, verb: 'create', fields: Object.assign({ ad_client_id: cl, ad_org_id: og }, f) }; };
    var ops = [mk('pos_floorplan', { kind: 'F', recid: 'F1', name: 'Hall', seq: 1 }), mk('pos_floorplan', { kind: 'F', recid: 'F2', name: 'Terrace', seq: 1 })];
    [1, 2, 3].forEach(function (i) { ops.push(mk('pos_floorplan', { kind: 'P', recid: 'T' + i, name: 'Table ' + i, floorid: 'F1', seats: 4, x: 100 * i, y: 50, w: 90, h: 45, seq: 1 })); }); ops.push(mk('pos_floorplan', { kind: 'P', recid: 'T9', name: 'Patio 1', floorid: 'F2', seats: 2, x: 100, y: 50, w: 90, h: 45, seq: 1 }));
    await new Promise(function (ok) { E.__crud.applyOpGroup(ops, ok); }); });
  await pg.click('#fl-reload'); await pg.waitForFunction("document.querySelectorAll('#fl-tabs button').length===2"); 
  var hall = await pg.$$eval('#fl-map .place', function (x) { return x.map(function (e) { return e.getAttribute('data-place'); }); }); check(hall.join() === 'T1,T2,T3', 'floor tabs: Hall shows its 3 tables from the branch rows', hall.join());
  await pg.click('#fl-tabs button[data-floor="F2"]'); await pg.waitForFunction("document.querySelectorAll('#fl-map .place').length===1"); await pg.click('#fl-tabs button[data-floor="F1"]'); await pg.waitForFunction("document.querySelectorAll('#fl-map .place').length===3");
  // open T1, add 3 lines, leave
  await pg.click('#fl-map [data-place="T1"]'); await pg.waitForSelector('#u3.screen.on, #u3:not([hidden])');
  var c0 = await pg.evaluate(function () { return Object.assign({}, TillRest.counts); });
  await pg.evaluate(function () { var S = Till.state(); for (var i = 0; i < 3; i++) Till.addLine(S.prods[i], 1); });
  var c1 = await pg.evaluate(function () { return Object.assign({}, TillRest.counts); });
  check(c1.deposits === c0.deposits && c1.visits === c0.visits, '3 line taps cost 0 deposits and 0 visits', JSON.stringify({ d: c1.deposits - c0.deposits, v: c1.visits - c0.visits }));
  await pg.click('#floorbar [data-btn="Tables"]'); await pg.waitForSelector('#fl-map .place'); await pg.waitForTimeout(500);
  var c2 = await pg.evaluate(function () { return Object.assign({}, TillRest.counts); });
  console.log('§TILL_REST_RELAY action=leave deposits=' + (c2.deposits - c1.deposits) + ' visits=' + (c2.visits - c1.visits));
  check(c2.deposits - c1.deposits === 1, 'leaving the table is exactly ONE deposit group', 'deposits=' + (c2.deposits - c1.deposits));
  var row = await pg.evaluate(function () { return Till.rows("SELECT state, lockedby, body FROM pos_opentable WHERE placeid='T1' ORDER BY seq DESC LIMIT 1"); });
  check(row[0] && row[0].state === 'O' && !row[0].lockedby && JSON.parse(row[0].body).lines.length === 3, 'T1 is stored open with 3 lines and the lock released', JSON.stringify(row[0] && { s: row[0].state, l: JSON.parse(row[0].body).lines.length }));
  var busy = await pg.$eval('#fl-map [data-place="T1"]', function (e) { return e.getAttribute('data-occupied') + '|' + e.textContent; }); check(/^1\|/.test(busy) && /Guests|Table 1/.test(busy), 'the map marks T1 occupied with uniCenta text', busy.replace(/\s+/g, ' '));
  await pg.click('#fl-map [data-place="T1"]'); await pg.waitForSelector('#u3:not([hidden])'); var n = await pg.evaluate(function () { return Till.state().ticket.lines.length; }); check(n === 3, 're-entering T1 recalls its 3 lines from the branch row', 'lines=' + n);
  await pg.click('#floorbar [data-btn="Tables"]'); await pg.waitForSelector('#fl-map .place');
  // lock by another till
  await pg.evaluate(async function () { var A = Till, mk = { op_type: 'CRUD_CREATE', key: 'pos_opentable', table: 'pos_opentable', verb: 'create', fields: { ad_client_id: A.state().cfg.client, ad_org_id: A.state().cfg.org, placeid: 'T2', seq: 5, state: 'L', lockedby: 'tillOther', body: '{"lines":[]}', guests: 0 } }; await new Promise(function (ok) { A.engine().__crud.applyOpGroup([mk], ok); }); });
  await pg.click('#fl-reload'); await pg.waitForTimeout(800); var lk = await pg.$eval('#fl-map [data-place="T2"]', function (e) { return e.getAttribute('data-locked'); }); check(lk === '1', 'a table locked by another till is shown locked');
  await pg.click('#fl-map [data-place="T2"]'); await pg.waitForTimeout(800); var scr = await pg.evaluate(function () { return Till.state().screen; }); check(scr === 'floors', 'opening the locked table is refused (stays on the map)', 'screen=' + scr);
  // reservation
  await pg.click('#fl-res'); await pg.waitForSelector('#reservations'); await pg.fill('#rs-customer', 'Aminah'); await pg.fill('#rs-chairs', '4'); await pg.fill('#rs-date', '2026-11-05T19:00'); await pg.click('#rs-save'); await pg.waitForSelector('[data-rr-in]');
  var pre = await pg.evaluate(function () { return Till.rows("SELECT state, placeid FROM pos_reservation"); }); check(pre.length === 1 && pre[0].state === 'B' && !pre[0].placeid, 'booking stores no table', JSON.stringify(pre));
  await pg.selectOption('#rs-place', 'T3'); await pg.click('[data-rr-in]'); await pg.waitForSelector('#u3:not([hidden])');
  var post = await pg.evaluate(function () { return Till.rows("SELECT state, placeid FROM pos_reservation ORDER BY seq DESC LIMIT 1"); }); check(post[0].state === 'I' && post[0].placeid === 'T3', 'check-in picks T3', JSON.stringify(post[0]));
  await pg.click('#floorbar [data-btn="Tables"]'); await pg.waitForSelector('#fl-map .place'); await pg.click('#fl-res'); await pg.waitForSelector('[data-rr-done]'); await pg.click('[data-rr-done]'); await pg.waitForSelector('[data-res][data-state="D"]');
  var st = await pg.$eval('[data-res][data-state="D"]', function (e) { return e.style.textDecoration; }); check(/line-through/.test(st), 'done is struck through', st);
  console.log('§TREST_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
