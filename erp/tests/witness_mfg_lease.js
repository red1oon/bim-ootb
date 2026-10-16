#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-LEASE (Milestone 8; spec ~/Projects/Mfg/MILESTONE_8_SPEC.md). READ THE LOG after every run: verdict = §MFG-LEASE-VERDICT.
// THE ISSUE it proves/disproves: through lease ops an order's claim on a resource window is exclusive (two orders cannot hold the same slot); an unused lease is released ONLY by an EXPIRE op that is itself ordered in
//   the log (no clock on replay); no two live leases ever overlap on a resource.  REAL data: legacy orders 8000/8001 both schedule S_Resource 50000 for the same window (a genuine double-booking in the seed); legacy
//   S_ResourceAssignment 100/101 give real window boundaries.  LEGACY ITSELF ALLOWS overlapping assignments (no constraint/trigger/model check) - leases are an ADDITIVE guard, CRUD is untouched.  Break (MUST be red): MFG_BREAK=nocheck.
'use strict';
var path = require('path'), fs = require('fs');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() { var t = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js', path.join(__dirname, '..', '..', 'node_modules', 'sql.js')]; for (var i = 0; i < t.length; i++) { try { return require(t[i]); } catch (e) {} } throw new Error('sql.js not resolvable'); }
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js')); require(path.join(ERP, 'erp_replay.js'));
var K = global.window.KernelOps, R = global.window.ErpReplay, BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0, T0 = 1700000000000;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(name, ok, info) { judged++; if (!ok) fails++; _log('  §MFG-LEASE ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }
if (BREAK === 'nocheck') R.leaseConflict = function () { return null; };   // BREAK: the lease conflict check is skipped

(async function () {
  var SQL = await reqSql()();
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  function rows(sql) { var s = seed.prepare(sql), r = []; try { while (s.step()) r.push(s.getAsObject()); } finally { s.free(); } return r; }
  var ord = rows('SELECT documentno, s_resource_id, datestartschedule AS f, datefinishschedule AS t FROM pp_order WHERE pp_order_id IN (50000,50001) ORDER BY pp_order_id');
  var asg = rows('SELECT s_resource_id AS r, assigndatefrom AS f, assigndateto AS t FROM s_resourceassignment WHERE s_resourceassignment_id IN (100,101) ORDER BY 1,2'.replace('ORDER BY 1,2', 'ORDER BY s_resourceassignment_id'));
  var other = rows('SELECT s_resource_id AS r FROM s_resource WHERE s_resource_id=50001')[0];
  if (ord.length !== 2 || ord[0].s_resource_id !== ord[1].s_resource_id || asg.length !== 2 || !other) { inconclusive++; _log('§MFG-LEASE E0 INCONCLUSIVE — fixtures missing from the seed (orders=' + ord.length + ' assignments=' + asg.length + ')'); }
  var A = 'dev:A', B = 'dev:B', C = 'dev:C', O1 = 'PP_Order:' + ord[0].documentno, O2 = 'PP_Order:' + ord[1].documentno, RES = String(ord[0].s_resource_id), RES2 = String(other.r);
  var WIN = { from: ord[0].f, to: ord[0].t }, RB = String(asg[0].r);
  function day(d) { return String(asg[0].f).slice(0, 10) + ' ' + d; }   // a time on the legacy assignment day
  var w1 = { from: asg[0].f, to: asg[0].t }, w2 = { from: asg[1].f, to: asg[1].t };   // real 10:00-13:00 and 17:00-18:00
  var mid = { from: day('11:00:00'), to: day('12:00:00') }, adj = { from: w1.to, to: day('14:00:00') };
  console.log('§MFG-LEASE-LOAD break=' + (BREAK || 'none') + ' orders=' + O1 + ',' + O2 + ' resource=' + RES + ' window=' + WIN.from + '..' + WIN.to + ' | legacy assignment windows res ' + RB + ': ' + w1.from + '..' + w1.to + ' , ' + w2.from + '..' + w2.to + ' | convention=half-open [from,to) (not evidenced by legacy)');
  var TL = [
    { n: 1, dev: A, type: 'CREATE', t: 1, p: { target: O1, doc_type: 'PP_Order', owner: A }, exp: 'A' },
    { n: 2, dev: B, type: 'CREATE', t: 2, p: { target: O2, doc_type: 'PP_Order', owner: B }, exp: 'A' },
    { n: 3, dev: A, type: 'LEASE', t: 10, p: { target: 'l1', resource: RES, from: WIN.from, to: WIN.to, order: O1, ttl: 5000 }, exp: 'A' },
    { n: 4, dev: B, type: 'LEASE', t: 11, p: { target: 'l2', resource: RES, from: WIN.from, to: WIN.to, order: O2, ttl: 5000 }, exp: 'X slot held by ' + O1 },        // the real double-booking
    { n: 5, dev: B, type: 'LEASE', t: 12, p: { target: 'l3', resource: RES2, from: WIN.from, to: WIN.to, order: O2, ttl: 5000 }, exp: 'A' },                       // other resource, same window
    { n: 6, dev: A, type: 'LEASE', t: 13, p: { target: 'lx', resource: RES2, from: '2009-01-01', to: '2009-01-02', order: O2, ttl: 5000 }, exp: 'X non-owner' },       // A leasing for B's order
    { n: 7, dev: A, type: 'LEASE', t: 20, p: { target: 'b1', resource: RB, from: w1.from, to: w1.to, order: O1, ttl: 5000 }, exp: 'A' },
    { n: 8, dev: B, type: 'LEASE', t: 21, p: { target: 'b2', resource: RB, from: mid.from, to: mid.to, order: O2, ttl: 5000 }, exp: 'X slot held by ' + O1 },        // overlap inside w1
    { n: 9, dev: B, type: 'LEASE', t: 22, p: { target: 'b3', resource: RB, from: adj.from, to: adj.to, order: O2, ttl: 5000 }, exp: 'A' },                          // adjacent: half-open
    { n: 10, dev: B, type: 'LEASE', t: 23, p: { target: 'b4', resource: RB, from: w2.from, to: w2.to, order: O2, ttl: 5000 }, exp: 'A' },
    { n: 11, dev: B, type: 'EXPIRE', t: 100, p: { target: 'l1' }, exp: 'X not yet expired' },
    { n: 12, dev: B, type: 'LEASE', t: 6000, p: { target: 'l4', resource: RES, from: WIN.from, to: WIN.to, order: O2, ttl: 5000 }, exp: 'X slot held by ' + O1 },       // ttl lapsed by timestamp, but NO expire op yet: still blocks
    { n: 13, dev: C, type: 'EXPIRE', t: 6001, p: { target: 'l1' }, exp: 'A' },                                                                                         // the ordered expiry (any device may issue it)
    { n: 14, dev: B, type: 'LEASE', t: 6002, p: { target: 'l5', resource: RES, from: WIN.from, to: WIN.to, order: O2, ttl: 5000 }, exp: 'A' },                      // now free
    { n: 15, dev: B, type: 'USE', t: 6003, p: { target: 'l3' }, exp: 'A' },
    { n: 16, dev: C, type: 'EXPIRE', t: 9000, p: { target: 'l3' }, exp: 'X in use' },
    { n: 17, dev: B, type: 'HANDOFF', t: 9100, p: { target: O2, to: C }, exp: 'A' },
    { n: 18, dev: B, type: 'USE', t: 9200, p: { target: 'l5' }, exp: 'X non-owner' },
    { n: 19, dev: C, type: 'USE', t: 9201, p: { target: 'l5' }, exp: 'A' },
    { n: 20, dev: B, type: 'USE', t: 9300, p: { target: 'l2' }, exp: 'X no such lease' }];   // l2 was never granted
  function id(n) { return 'u-' + (n < 10 ? '0' : '') + n; }
  function mk(list) { var db = new SQL.Database(); K.ensureTable(db); mute(); list.forEach(function (t) { K.commitOp(db, t.type, Object.assign({ actor: t.dev }, t.p), null, null, id(t.n), T0 + t.t); }); unmute(); return db; }
  function read(db) { var r = db.exec('SELECT op_uuid, timestamp, op_type, parameters FROM kernel_ops ORDER BY id'); return r.length ? r[0].values.map(function (v) { return R.normalize({ op_uuid: v[0], timestamp: v[1], op_type: v[2], parameters: v[3] }); }) : []; }
  function replay(ops) { var d = new SQL.Database(); mute(); var res = R.replayGuarded(d, ops); unmute(); return { res: res, docs: R.projectionRows(d), leases: R.leaseRows(d) }; }
  function rejSig(res) { return res.rejected.map(function (r) { return r.op.op_uuid + ':' + r.why; }).sort().join('|'); }

  var central = replay(read(mk(TL))), byId = {}; central.res.rejected.forEach(function (r) { byId[r.op.op_uuid] = r.why; });
  var wrong = [];
  TL.forEach(function (t) { var got = byId[id(t.n)];
    if (t.exp === 'A') { if (got) wrong.push('op' + t.n + ' ' + t.type + ' wanted accepted, got rejected: ' + got); } else if (!got || got.indexOf(t.exp.slice(2)) < 0) wrong.push('op' + t.n + ' ' + t.type + ' wanted rejected(' + t.exp.slice(2) + '), got ' + (got || 'ACCEPTED')); });
  console.log('§MFG-LEASE-E1 applied=' + central.res.applied + ' rejected=' + central.res.rejected.length + ' leases=' + central.leases.map(function (l) { return l[0] + ':' + l[5]; }).join(' '));
  check('E1 every lease/use/expire verdict matches the timeline (real double-booking refused, adjacent+other-resource granted, non-owner refused, expiry strictly ordered, used lease immune, handoff moves USE right)', wrong.length === 0, { wrong: wrong });

  // E4 order independence
  var dev = function (d) { return read(mk(TL.filter(function (t) { return t.dev === d; }))); }, L = { A: dev(A), B: dev(B), C: dev(C) };
  var perms = [['A', 'B', 'C'], ['C', 'B', 'A'], ['B', 'C', 'A'], ['C', 'A', 'B']];
  var sigs = perms.map(function (p) { var r = replay(R.mergeLogs(L[p[0]], L[p[1]], L[p[2]])); return djb(JSON.stringify(r.leases) + JSON.stringify(r.docs)) + '/' + djb(rejSig(r.res)); });
  var cs = djb(JSON.stringify(central.leases) + JSON.stringify(central.docs)) + '/' + djb(rejSig(central.res));
  console.log('§MFG-LEASE-E4 merge orders ' + perms.map(function (p) { return p.join(''); }).join(',') + ' -> ' + sigs.join(' '));
  check('E4 lease table + rejected set identical for every merge order (== central)', sigs.every(function (s) { return s === cs; }), { sigs: sigs, central: cs });

  // E5 invariant, computed independently of the gate: no two LIVE leases overlap on one resource
  function overlaps(leases) { var live = leases.filter(function (l) { return l[5] === 'held' || l[5] === 'used'; }), bad = [];
    for (var i = 0; i < live.length; i++) for (var j = i + 1; j < live.length; j++) if (live[i][1] === live[j][1] && live[i][2] < live[j][3] && live[j][2] < live[i][3]) bad.push(live[i][0] + '(' + live[i][4] + ') x ' + live[j][0] + '(' + live[j][4] + ') on res ' + live[i][1]);
    return { live: live.length, bad: bad }; }
  var inv = overlaps(central.leases);
  console.log('§MFG-LEASE-E5 live leases=' + inv.live + ' overlapping pairs=' + inv.bad.length + (inv.bad.length ? ' ' + JSON.stringify(inv.bad) : ''));
  var control = overlaps([['x', 'r', '2020-01-01', '2020-01-03', 'o1', 'held'], ['y', 'r', '2020-01-02', '2020-01-04', 'o2', 'used']]);   // the scanner CAN fail
  if (inv.live < 2) { inconclusive++; _log('§MFG-LEASE E5 INCONCLUSIVE — fewer than 2 live leases'); }
  else check('E5 no two live leases overlap on a resource (scanner proven able to fail: control finds ' + control.bad.length + ')', inv.bad.length === 0 && control.bad.length === 1, { bad: inv.bad });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  _log('§MFG-LEASE-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { unmute(); _log('§MFG-LEASE-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
