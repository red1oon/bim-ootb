#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REST-UI (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §33.3, §33.5). READ THE LOG (/tmp/tillui_logs/rest_ui.log): exit code is not evidence.
// THE ISSUE: move table, merge tables, guests and the PIN popups existed only as core functions (§32.R); no on-screen control reached them. uniCenta's controls: JTicketsBagRestaurant.java:240-290,318-429,
// JTicketsBagRestaurantMap.java:356-373,781-880. Every step is a REAL CLICK on the real till page (mode restaurant); the verdict is read from the branch rows (pos_opentable) the core writes, as witness_rest.js does.
// Mutants (copies served by the harness, proven applied): move-nowrite, merge-noask, delete-nopin, guests-nosave.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), MUT = process.env.RUI_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §RUI_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var MUTS = { 'move-nowrite': ["var m = await core.move(from, to);", "var m = { ok: true };"], 'merge-noask': ["if (await ask('Merge Tables:", "if (true || await ask('Merge Tables:"],
  'delete-nopin': ["if (!(await core.checkPin('')).none) { var pin = await askNumber('Enter PIN Number', true); if (pin === null) return;", "if (false) { var pin = null;"], 'guests-nosave': ["await core.guests(cur, n);", ""] };
var srv = http.createServer(function (q, r) { var u = q.url.split('?')[0], p = path.join(ROOT, decodeURIComponent(u)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  if (MUT && u.endsWith('/till_rest.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT], n = src.split(m[0]).length - 1; console.log('§RUI_MUT ' + MUT + ' applied=' + n); r.end(src.replace(m[0], m[1])); return; } fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), errs = [];
  pg.on('console', function (m) { var t = m.text(); if (/§TILL_REST_(MOVE|MERGE|GUESTS|DELETE|OVERRIDE)|🔴/.test(t)) console.log(t.slice(0, 220)); }); pg.on('pageerror', function (e) { errs.push(e.message); console.log('PAGEERR ' + e.message.slice(0, 200)); });
  console.log('═══ W-REST-UI ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/till.html?mode=restaurant', { waitUntil: 'load' });
  await pg.waitForFunction('window.Till && window.Till.ready && window.TillRest', null, { timeout: 170000 });
  await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]'); await pg.waitForSelector('#fl-map .place');
  async function apply(rowsDef) { await pg.evaluate(async function (defs) { var A = Till, E = A.engine(), cl = A.state().cfg.client, og = A.state().cfg.org; var ops = defs.map(function (d) { return { op_type: 'CRUD_CREATE', key: d[0], table: d[0], verb: 'create', fields: Object.assign({ ad_client_id: cl, ad_org_id: og }, d[1]) }; }); await new Promise(function (ok) { E.__crud.applyOpGroup(ops, ok); }); }, rowsDef); }
  var plan = [['pos_floorplan', { kind: 'F', recid: 'F1', name: 'Hall', seq: 1 }]]; [1, 2, 3, 4].forEach(function (i) { plan.push(['pos_floorplan', { kind: 'P', recid: 'T' + i, name: 'Table ' + i, floorid: 'F1', seats: 4, x: 100 * i, y: 100, w: 90, h: 45, seq: 1 }]); }); await apply(plan);
  await pg.click('#fl-reload'); await pg.waitForFunction("document.querySelectorAll('#fl-map .place').length===4");
  var vis = function (sel) { return pg.waitForSelector(sel, { timeout: 4000 }).then(function () { return true; }, function () { return false; }); };   // a missing popup is a FAIL line, never a crash
  var row = function (id) { return pg.evaluate(function (i) { return Till.rows("SELECT state, lockedby, guests, body, override FROM pos_opentable WHERE placeid='" + i + "' ORDER BY seq DESC LIMIT 1").then(function (r) { var x = r[0]; return x && { state: x.state, lockedby: x.lockedby, guests: Number(x.guests || 0), n: JSON.parse(x.body || '{"lines":[]}').lines.length, override: x.override }; }); }, id); };
  var scr = function () { return pg.evaluate(function () { return Till.state().screen; }); };
  async function table(id, n) { await pg.click('#fl-map [data-place="' + id + '"]'); await pg.waitForFunction("Till.state().screen==='sales'", null, { timeout: 5000 }).catch(function () {}); if (n) await pg.evaluate(function (k) { var S = Till.state(); for (var i = 0; i < k; i++) Till.addLine(S.prods[i], 1); }, n); }
  async function toMap() { await pg.click('#floorbar [data-btn="Tables"]'); await pg.waitForFunction("Till.state().screen==='floors'", null, { timeout: 5000 }).catch(function () {}); await pg.waitForSelector('#fl-map .place'); await pg.waitForTimeout(300); }
  var ctl = await pg.evaluate(function () { return ['tb-move', 'guestsbtn', 'tb-delete'].map(function (i) { var e = document.getElementById(i); return e && e.offsetParent !== null ? e.textContent : null; }); });
  await table('T1', 2); ctl = await pg.evaluate(function () { return ['tb-move', 'guestsbtn', 'tb-delete'].map(function (i) { var e = document.getElementById(i); return e && e.offsetParent !== null ? e.textContent : null; }); });
  check(ctl.every(Boolean), 'the table sales screen shows Move, Guests and Delete (uniCenta JTicketsBagRestaurant controls)', JSON.stringify(ctl));
  // GUESTS
  await pg.click('#guestsbtn'); var t1 = await pg.$eval('#num-title', function (e) { return e.textContent; }); check(t1 === 'Enter Number of Guests', 'Guests opens uniCenta\'s popup title', t1);
  await pg.fill('#num-input', '3'); await pg.click('#num-ok'); var gl = await pg.$eval('#guestsbtn', function (e) { return e.textContent; }); check(gl === 'Guests 3', 'the Guests button shows the count', gl);
  await toMap(); var r1 = await row('T1'); check(r1 && r1.guests === 3 && r1.n === 2, 'guests reach the saved branch row with the ticket (3 guests, 2 lines)', JSON.stringify(r1));
  // MOVE to an empty table
  await table('T1'); await pg.click('#tb-move'); await pg.waitForFunction("Till.state().screen==='floors'", null, { timeout: 5000 }).catch(function () {}); var mv = await pg.$eval('#fl-state', function (e) { return e.textContent; });
  check(/^Moving table Table 1\. Select another Table or the original Table/.test(mv), 'the map says what uniCenta says while moving (label.restaurantmove)', mv);
  await pg.click('#fl-map [data-place="T2"]'); await pg.waitForFunction("Till.state().screen==='sales'", null, { timeout: 5000 }).catch(function () {}); await pg.waitForTimeout(300);
  var a1 = await row('T1'), a2 = await row('T2'); var tt = await pg.evaluate(function () { return Till.state().ticket.table; });
  check(a1 && a1.state === 'C' && a1.n === 0 && a1.guests === 0, 'move: the source table is cleared', JSON.stringify(a1)); check(a2 && a2.n === 2 && a2.guests === 3 && tt === 'Table 2', 'move: the lines and guests are on the target, which is now open', JSON.stringify(a2) + ' ' + tt);
  await toMap();
  // MERGE (confirm yes)
  await table('T3', 1); await toMap(); await table('T2'); await pg.click('#tb-move'); await pg.waitForFunction("Till.state().screen==='floors'", null, { timeout: 5000 }).catch(function () {}); await pg.click('#fl-map [data-place="T3"]'); check(await vis('#confirmbox:not([hidden])'), 'the confirm popup appears');
  var ct = await pg.$eval('#confirm-text', function (e) { return e.textContent; }).catch(function () { return ''; }); check(/Merge Tables/.test(ct) && /This will Merge tables/.test(ct), 'merging asks uniCenta\'s question first', ct);
  var pre3 = await row('T3'); await pg.click('#confirm-no', { timeout: 3000 }).catch(function () {}); await pg.waitForFunction("Till.state().screen==='sales'", null, { timeout: 5000 }).catch(function () {}); await pg.waitForTimeout(300);
  var n3 = await row('T3'), n2 = await row('T2'); check(n3.n === pre3.n && n2.n === 2 && await scr() === 'sales', 'merge answered No: nothing merged, the original table is reopened', JSON.stringify({ t3: n3, t2: n2 }));
  await toMap(); await table('T2'); await pg.click('#tb-move'); await pg.waitForFunction("Till.state().screen==='floors'", null, { timeout: 5000 }).catch(function () {}); await pg.click('#fl-map [data-place="T3"]'); check(await vis('#confirmbox:not([hidden])'), 'the confirm popup appears'); await pg.click('#confirm-yes', { timeout: 3000 }).catch(function () {}); await pg.waitForFunction("Till.state().screen==='sales'", null, { timeout: 5000 }).catch(function () {}); await pg.waitForTimeout(300);
  var m3 = await row('T3'), m2 = await row('T2'); check(m3.n === 3 && m3.guests === 3 && m2.state === 'C' && m2.n === 0, 'merge answered Yes: the lines are appended (1 + 2 = 3), guests added, the source cleared', JSON.stringify({ t3: m3, t2: m2 }));
  await toMap();
  // CANCEL (same table)
  await table('T3'); await pg.click('#tb-move'); await pg.waitForFunction("Till.state().screen==='floors'", null, { timeout: 5000 }).catch(function () {}); await pg.click('#fl-map [data-place="T3"]'); await pg.waitForFunction("Till.state().screen==='sales'", null, { timeout: 5000 }).catch(function () {}); await pg.waitForTimeout(300);
  var c3 = await row('T3'); check(c3.n === 3 && await pg.evaluate(function () { return TillRest.clip(); }) === null, 'Move then the original table cancels the move', JSON.stringify(c3));
  await toMap();
  // PIN
  var pinh = await pg.evaluate(function () { return RestCore.sha('1234'); }); await apply([['pos_floorplan', { kind: 'S', recid: 'PinHash', value: pinh, seq: 1 }]]);
  await table('T3'); await pg.click('#tb-delete'); check(await vis('#numbox:not([hidden])'), 'the PIN popup appears'); var pt = await pg.$eval('#num-title', function (e) { return e.textContent; }).catch(function () { return ''; }); check(pt === 'Enter PIN Number', 'Delete asks for the PIN first (title.override.enterpin)', pt);
  await pg.fill('#num-input', '9999', { timeout: 3000 }).catch(function () {}); await pg.click('#num-ok', { timeout: 3000 }).catch(function () {}); await pg.waitForTimeout(500); var bm = await pg.$eval('#msg', function (e) { return e.textContent; }); var d3 = await row('T3');
  check(/PIN Number Incorrect/.test(bm) && d3.n === 3 && await scr() === 'sales', 'a wrong PIN is refused with uniCenta\'s message and deletes nothing', bm + ' ' + JSON.stringify(d3));
  await pg.click('#tb-delete'); check(await vis('#numbox:not([hidden])'), 'the PIN popup appears'); await pg.fill('#num-input', '1234', { timeout: 3000 }).catch(function () {}); await pg.click('#num-ok', { timeout: 3000 }).catch(function () {}); check(await vis('#confirmbox:not([hidden])'), 'the confirm popup appears'); var dc = await pg.$eval('#confirm-text', function (e) { return e.textContent; }).catch(function () { return ''; });
  check(dc === 'Are you sure you want to Delete the current Order?', 'the right PIN leads to uniCenta\'s delete question', dc); await pg.click('#confirm-yes', { timeout: 3000 }).catch(function () {}); await pg.waitForFunction("Till.state().screen==='floors'", null, { timeout: 5000 }).catch(function () {}); await pg.waitForTimeout(300);
  var d3b = await row('T3'); check(d3b.state === 'C' && d3b.n === 0, 'Delete Current Order clears the table', JSON.stringify(d3b));
  // OVERRIDE of a lock held by another till
  await apply([['pos_opentable', { placeid: 'T4', seq: 9, state: 'L', lockedby: 'tillOther', body: '{"lines":[]}', guests: 0 }]]); await pg.click('#fl-reload'); await pg.waitForTimeout(600);
  await pg.click('#fl-map [data-place="T4"]'); check(await vis('#numbox:not([hidden])'), 'the PIN popup appears'); await pg.fill('#num-input', '9999', { timeout: 3000 }).catch(function () {}); await pg.click('#num-ok', { timeout: 3000 }).catch(function () {}); await pg.waitForTimeout(600); var s1 = await scr(), o1 = await row('T4');
  check(s1 === 'floors' && o1.lockedby === 'tillOther', 'a locked table + wrong PIN stays refused', s1 + ' ' + JSON.stringify(o1));
  await pg.click('#fl-map [data-place="T4"]'); check(await vis('#numbox:not([hidden])'), 'the PIN popup appears'); await pg.fill('#num-input', '1234', { timeout: 3000 }).catch(function () {}); await pg.click('#num-ok', { timeout: 3000 }).catch(function () {}); await pg.waitForFunction("Till.state().screen==='sales'", null, { timeout: 8000 }).catch(function () {}); var o2 = await row('T4');
  check(await scr() === 'sales' && o2.lockedby && o2.lockedby !== 'tillOther' && o2.override === 'Y', 'the right PIN overrides the other till\'s lock (row taken, Override=Y)', JSON.stringify(o2));
  check(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | '));
  console.log('§RUI_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
