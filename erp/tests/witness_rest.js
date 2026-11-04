#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REST-SHARED / W-REST-RELAY / W-REST-RES / W-REST-LAYOUT (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §32.2). READ THE LOG after every run (/tmp/rest_logs/rest.log): exit code is not evidence.
// THE ISSUES: (SHARED) open tables lived per device in localStorage, so a second till of the branch could not see or lock them (contradicts §10.4 item 11); (RELAY) a shared table must not cost one request
// per tap (the kitchen measured 38 requests per message, §20); (RES) a booking must end at a table chosen at check-in; (LAYOUT) moving tables is behind a permission.
// SCOPE (honest): erp/rest_core.js against a fake branch relay (rows in, rows out, requests counted). The real TeamSync wiring and the till screens come after the SODA merge (§32.1 item 5); until then the
// REAL-DEVICE claims are not made here. Mutants are in-memory edits of the real file, each proven applied exactly once; a crash (exit 3) is not a kill.
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module');
var MUT = process.env.REST_MUT || '', file = path.join(__dirname, '..', 'rest_core.js'), src = fs.readFileSync(file, 'utf8');
var MUTS = {
  'per-device-store': null,                                                                                                     // harness-level: each till gets its OWN store (the old localStorage)
  'save-per-tap': ["C.taps++; }", "C.taps++; this.__w = 1; }", 'relay'],                                                        // replaced below with a real per-tap save
  'no-lock-check': ["if (cur && cur.State === 'L' && cur.LockedBy !== me) { log('§REST_LOCK place=' + placeId + ' till=' + me + ' BLOCKED by ' + cur.LockedBy); return { ok: false, blockedBy: cur.LockedBy }; }", "", 'shared'],
  'pin-not-checked': ["(await sha(String(pin))) !== want", "false", 'shared'],
  'layout-no-permission': ["if (perms.indexOf('rest.layout') < 0) {", "if (false) {", 'layout'],
  'table-at-booking': ["row(placeId, cur, { State: 'O', Customer: r.Customer, Guests: r.Chairs, Body: '{\"lines\":[]}' })]", "row(placeId, cur, { State: 'O', Customer: r.Customer, Guests: r.Chairs, Body: '{\"lines\":[]}' })].slice(0, 1)", 'res']
};
if (MUT) {
  var m = MUTS[MUT]; if (MUT === 'save-per-tap') m = ["tap: function (placeId, line) { if (!held[placeId]) throw new Error('table not held'); held[placeId].lines.push(line); C.taps++; },", "tap: function (placeId, line) { if (!held[placeId]) throw new Error('table not held'); held[placeId].lines.push(line); C.taps++; return counted.write([row(placeId, null, { State: 'L', LockedBy: me, Body: JSON.stringify({ lines: held[placeId].lines }) })]); },", 'relay'];
  if (m) { var n = src.split(m[0]).length - 1; console.log('§REST_MUT ' + MUT + ' applied=' + n); if (n !== 1) { console.log('§REST_MUT NOT APPLIED exactly once: not a kill'); process.exit(2); } src = src.replace(m[0], function () { return m[1]; }); } else console.log('§REST_MUT ' + MUT + ' (harness-level)');
}
var mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file)); mod._compile(src, file); var RC = mod.exports;
var V = {}, tot = { j: 0, f: 0 };
function check(arm, ok, label, info) { V[arm] = V[arm] || { j: 0, f: 0 }; V[arm].j++; tot.j++; if (!ok) { V[arm].f++; tot.f++; } console.log('  §REST_CHECK arm=' + arm + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
function mkStore() { return []; }
var shared = mkStore(), own = {};
function till(key, perms) { var store = MUT === 'per-device-store' ? (own[key] = own[key] || mkStore()) : shared; return RC.create({ tillKey: key, perms: perms || [], relay: { read: async function () { return JSON.parse(JSON.stringify(store)); }, write: async function (rows) { rows.forEach(function (r) { store.push(JSON.parse(JSON.stringify(r))); }); } }, log: function (s) { console.log(s); } }); }
(async function () {
  console.log('═══ W-REST — rest_core.js on a fake branch relay (§32) ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  var pinHash = await RC.sha('1234'), seed = [{ _t: 'POS_FloorPlan', Kind: 'S', RecId: 'PinHash', Seq: 1, Value: pinHash }, { _t: 'POS_FloorPlan', Kind: 'F', RecId: 'F1', Name: 'Hall', Seq: 1 }];
  [1, 2, 3, 4, 5, 6].forEach(function (i) { seed.push({ _t: 'POS_FloorPlan', Kind: 'P', RecId: 'T' + i, Name: 'Table ' + i, FloorId: 'F1', Seats: 4, X: 100 * i, Y: 50, W: 90, H: 45, Seq: 1 }); });
  shared.push.apply(shared, seed); Object.keys(own).forEach(function (k) { own[k].push.apply(own[k], seed); });
  var A = till('tillA', ['rest.layout']), B = till('tillB'); if (MUT === 'per-device-store') { own.tillA = mkStore(); own.tillB = mkStore(); own.tillA.push.apply(own.tillA, seed); own.tillB.push.apply(own.tillB, seed); A = till('tillA', ['rest.layout']); B = till('tillB'); }
  // SHARED
  var o = await A.open('T1'); check('shared', o.ok, 'till A enters T1');
  ['tea', 'rice', 'soup'].forEach(function (p) { A.tap('T1', { p: p, q: 1 }); });
  var bBlocked = await B.open('T1'); check('shared', !bBlocked.ok && bBlocked.blockedBy === 'tillA', 'till B is blocked from T1 while A holds it', JSON.stringify(bBlocked));
  var bad = await B.override('T1', '0000'); check('shared', !bad.ok, 'override with a wrong PIN is refused', JSON.stringify(bad));
  await A.leave('T1');
  var seenB = RC.fold(JSON.parse(JSON.stringify(MUT === 'per-device-store' ? own.tillB : shared))).tables.T1;
  check('shared', seenB && JSON.parse(seenB.Body).lines.length === 3 && seenB.State === 'O', 'till B sees A\'s open table with 3 lines after A leaves', seenB ? 'lines=' + JSON.parse(seenB.Body).lines.length : 'none');
  var b1 = await B.open('T1'); check('shared', b1.ok && b1.ticket.lines.length === 3, 'till B picks the table up with A\'s lines', JSON.stringify(b1.ok));
  var aBlocked = await A.open('T1'); check('shared', !aBlocked.ok, 'now A is blocked by B');
  var ov = await A.override('T1', '1234'); check('shared', ov.ok, 'override with the right PIN takes the table over', JSON.stringify(ov.ok));
  await A.leave('T1');
  // race: both claim T2 from the same stale snapshot
  var stale = JSON.parse(JSON.stringify(shared)), W = [];
  var mk = function (k) { return RC.create({ tillKey: k, relay: { read: async function () { return W.length ? JSON.parse(JSON.stringify(shared)) : stale; }, write: async function (rows) { W.push(k); rows.forEach(function (r) { shared.push(JSON.parse(JSON.stringify(r))); }); } } }); };
  var ra = mk('tillA'), rb = mk('tillB'); var res = await Promise.all([ra.open('T2'), rb.open('T2')]); var winners = res.filter(function (x) { return x.ok; }).length;
  if (MUT !== 'per-device-store') check('shared', winners === 1, 'two tills claiming T2 from the same snapshot: exactly one wins, deterministically', 'winners=' + winners);
  // RELAY
  var R = till('tillR'), N = 12; for (var k = 0; k < 2; k++) { /* warm */ }
  var c0 = Object.assign({}, R.counts); await R.open('T3'); var c1 = Object.assign({}, R.counts);
  for (var i = 0; i < N; i++) { var rr = R.tap('T3', { p: 'item' + i, q: 1 }); if (rr && rr.then) await rr; } var c2 = Object.assign({}, R.counts);
  await R.guests('T3', 3); await R.leave('T3'); var c3 = Object.assign({}, R.counts);
  var rep = function (name, a, b) { var d = { writes: b.writes - a.writes, reads: b.reads - a.reads }; console.log('§REST_RELAY action=' + name + ' writes=' + d.writes + ' reads=' + d.reads); return d; };
  rep('open', c0, c1); var dt = rep('tap x' + N, c1, c2); var dl = rep('leave', c2, c3);
  check('relay', dt.writes === 0, N + ' taps cost 0 requests', 'writes=' + dt.writes);
  check('relay', dl.writes === 1, 'leaving the table is exactly ONE save', 'writes=' + dl.writes);
  var P = till('tillP'), Q = till('tillQ'); await P.open('T4'); P.tap('T4', { p: 'x', q: 1 }); await P.leave('T4');
  var m0 = Object.assign({}, P.counts); var mv = await P.move('T4', 'T6'); var m1 = Object.assign({}, P.counts); rep('move', m0, m1);
  check('relay', mv.ok && m1.writes - m0.writes === 1, 'move (2 rows) is ONE write group', 'ok=' + mv.ok + ' writes=' + (m1.writes - m0.writes));
  var Z = till('tillZ'); await Z.open('T3'); Z.tap('T3', { p: 'y', q: 1 }); await Z.leave('T3'); var g0 = Object.assign({}, Z.counts); var mg = await Z.merge('T3', 'T1'); var g1 = Object.assign({}, Z.counts); rep('merge', g0, g1);
  check('relay', mg.ok && g1.writes - g0.writes === 1, 'merge is ONE write group', JSON.stringify(mg));
  // RES
  var SS = function () { return JSON.parse(JSON.stringify(MUT === 'per-device-store' ? own.tillS : shared)); };
  var S = till('tillS'), id = await S.book({ Customer: 'Aminah', At: '2026-11-05T19:00', Chairs: 4 });
  var pre = RC.fold(SS()); var r0 = pre.reservations.filter(function (r) { return r.ResId === id; })[0];
  check('res', r0 && r0.State === 'B' && r0.PlaceId === '', 'booking holds no table (table chosen at check-in)', JSON.stringify({ State: r0 && r0.State, PlaceId: r0 && r0.PlaceId }));
  var ci = await S.checkIn(id, 'T5'); var mid = RC.fold(SS()), r1 = mid.reservations.filter(function (r) { return r.ResId === id; })[0], t2 = mid.tables.T5;
  check('res', ci.ok && r1.State === 'I' && r1.PlaceId === 'T5' && t2 && t2.Customer === 'Aminah' && t2.Guests === 4, 'check-in picks T5 and opens it for the customer with 4 guests', JSON.stringify(ci));
  await S.done(id); var fin = RC.fold(SS()).reservations.filter(function (r) { return r.ResId === id; })[0];
  check('res', fin.State === 'D', 'done marks the reservation (struck through in the view)');
  // LAYOUT
  var lo = await A.saveLayout([{ RecId: 'T1', X: 300, Y: 120 }]); var lb = await B.saveLayout([{ RecId: 'T2', X: 1, Y: 1 }]);
  check('layout', lo.ok && !lb.ok, 'layout save works with rest.layout permission and is refused without', JSON.stringify({ A: lo.ok, B: lb.ok }));
  var pl = RC.fold(JSON.parse(JSON.stringify(shared))).places.filter(function (p) { return p.RecId === 'T1'; })[0]; check('layout', pl.X === 300 && pl.Y === 120, 'the saved position is what the fold returns', 'x=' + pl.X + ' y=' + pl.Y);
  var lab = RC.label({ Name: 'Table 1', Seats: 4 }, { State: 'O', Body: '{"lines":[1]}', Guests: 3, Customer: 'Aminah', Waiter: 'Wan', Seq: Date.now() - 5400000 }, { colour: 'black', showCustomer: true, showWaiter: true, now: Date.now() });
  check('layout', lab.join('|') === 'Aminah|Wan|Table 1 / 4|Guests 3|Waiting 1h:30m', 'table button text follows uniCenta printState (customer, waiter, Name / Seats, Guests, Waiting)', lab.join('|'));
  // ADMIN: the branch POS admin's edits (floors/tables/settings) round-trip through the DB mapping and the fold
  var st0 = RC.fold(JSON.parse(JSON.stringify(shared))), z0 = RC.sizes(st0.settings);
  check('admin', z0['img-width'] === 107 && z0['img-height'] === 60 && z0['cat-height'] === 320, 'catalog sizes default to uniCenta Ticket.Buttons.xml (107 x 60, panel 320)', JSON.stringify(z0));
  var fr = RC.editRow(st0, 'F', { RecId: 'F2', Name: 'Terrace', Image: 'https://x/y.png' }), pr = RC.editRow(st0, 'P', { RecId: 'T9', Name: 'Table 9', FloorId: 'F2', Seats: 6, X: 10, Y: 20, W: 90, H: 45 }), sr = RC.editRow(st0, 'S', { RecId: 'img-width', Value: '120' });
  var back = [fr, pr, sr].map(function (r) { var d = RC.toDb(r); return RC.fromDb(r._t, d); });
  check('admin', JSON.stringify(back[1]) === JSON.stringify(Object.assign({}, pr, { Kind: pr.Kind })) || (back[1].Name === 'Table 9' && Number(back[1].Seats) === 6 && back[1].FloorId === 'F2'), 'a place survives toDb -> fromDb', JSON.stringify(back[1]));
  shared.push.apply(shared, [fr, pr, sr]); var st1 = RC.fold(JSON.parse(JSON.stringify(shared)));
  check('admin', st1.floors.some(function (f) { return f.RecId === 'F2'; }) && st1.places.some(function (p) { return p.RecId === 'T9'; }) && RC.sizes(st1.settings)['img-width'] === 120, 'the fold shows the new floor, table and the changed tile width');
  var dl = RC.editRow(st1, 'P', { RecId: 'T9', Deleted: 'Y' }); check('admin', dl.Seq === pr.Seq + 1 && dl.Name === 'Table 9', 'an edit carries the current row at Seq+1', 'seq=' + dl.Seq); shared.push(dl);
  check('admin', !RC.fold(JSON.parse(JSON.stringify(shared))).places.some(function (p) { return p.RecId === 'T9'; }), 'a deleted table drops out of the fold');
  Object.keys(V).forEach(function (a) { console.log('§REST_VERDICT arm=' + a + ' ' + (V[a].j === 0 ? 'INCONCLUSIVE' : V[a].f ? 'FAIL' : 'PASS') + ' judged=' + V[a].j + ' failed=' + V[a].f); });
  console.log('§REST_VERDICT ' + (tot.j === 0 ? 'INCONCLUSIVE' : tot.f ? 'FAIL' : 'PASS') + ' judged=' + tot.j + ' failed=' + tot.f); process.exit(tot.j && !tot.f ? 0 : 1);
})().catch(function (e) { console.log('§REST_CRASH ' + e.stack); process.exit(3); });
