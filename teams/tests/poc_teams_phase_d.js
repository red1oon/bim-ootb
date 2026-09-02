#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EMIT + W-SCOPE (teams/ROADMAP.md §S7, Phase D — THE GATE: the only erp/ runtime edits).
//   Drives the REAL erp/ modules (kernel_ops.js, erp_seam.js + erp_kernel.js) in node and proves the two
//   Phase-D touches are ADDITIVE + DEFAULT-OFF + reversible — they change NOTHING when unused.
//     §EMIT-IDENTICAL — commitGroup with an emitter installed produces a BYTE-IDENTICAL log + group_hash
//                       + tip vs no emitter (same fixed inputs) — emit does not alter the commit.
//     §EMIT-FIRES     — the emitter fires EXACTLY once, AFTER commit (rows already present), with gid/ids/tip.
//     §EMIT-SAFE      — an emitter that THROWS cannot break the commit (committed stays true).
//     §EMIT-DEFAULT   — with NO emitter set, commitGroup commits cleanly (zero new path, zero overhead).
//     §SCOPE-ABSENT   — erp_seam.read returns IDENTICAL rows when ctx.scope is absent (== today, byte-for-byte).
//     §SCOPE-ORG      — ctx.scope={org} narrows rows to that org (present → filters).
//     §SCOPE-PROJECT  — ctx.scope={project} narrows to that project (multi-key, NON-INVENT on missing col).
//     §SCOPE-DISPATCH-ABSENT — dispatch with NO scope takes the exact current path (never 'scope-mismatch').
//     §SCOPE-DISPATCH-GATE   — dispatch with scope.org ≠ intent.org → refused 'scope-mismatch' (present → filters).
//     §EMIT-BUS        — teams/op_subscribe wires the kernel emit onto the team bus → a TEAM_OP is delivered.
//     §EMIT-UNINSTALL  — uninstall() restores default-off (reversible) → no further TEAM_OP on commit.
//   Run: node teams/tests/poc_teams_phase_d.js 2>&1 | tee teams/logs/phase_d.log — then READ the log.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js',
               path.join(__dirname, '..', '..', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var ERP = path.join(__dirname, '..', '..', 'erp');
require(path.join(ERP, 'kernel_ops.js'));          // → window.KernelOps
var KernelOps = global.window.KernelOps;
var ERPKernel = require(path.join(ERP, 'erp_kernel.js'));
var ERPSeam = require(path.join(ERP, 'erp_seam.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// dump the signed log's stable columns (the byte-identical comparison surface).
function dumpLog(db) {
  var r = db.exec('SELECT id,op_uuid,timestamp,op_type,parameters,prev_hash,op_hash,sig,gid,branch_id FROM kernel_ops ORDER BY id');
  return r.length ? JSON.stringify(r[0].values) : '[]';
}
// a fixed, deterministic op-group (op_uuid/gid/baseTs supplied → byte-stable hashes, no crypto.randomUUID).
function fixedGroup() {
  return [{ op_type: 'SET_STATUS', op_uuid: 'u-1', params: { to: 'CO', id: 1 } },
          { op_type: 'SET_STATUS', op_uuid: 'u-2', params: { to: 'CO', id: 2 } }];
}
var META = { gid: 'g-fixed', baseTs: 1000 };

(async function () {
  console.log('\n═══ W-EMIT + W-SCOPE — Phase-D erp/ touches are additive + default-off (prove byte-identical) ═══\n');
  var SQL = await reqSql()();

  // ════ W-EMIT ════
  // run A — NO emitter (today's behaviour). reset the singleton emitter to be safe.
  KernelOps.setOpEmitter(null);
  var dbA = new SQL.Database(); ERPKernel.initProjection(dbA);
  var resA = await KernelOps.commitGroup(dbA, fixedGroup(), META);
  var logA = dumpLog(dbA);
  verdict(resA.committed && resA.ids.length === 2, '§EMIT-DEFAULT  commitGroup commits with no emitter', 'committed=' + resA.committed + ' ops=' + resA.ids.length);

  // run B — emitter INSTALLED, same fixed inputs.
  var events = [];
  var rowsAtEmit = -1;
  var dbB = new SQL.Database(); ERPKernel.initProjection(dbB);
  KernelOps.setOpEmitter(function (evt) {
    events.push(evt);
    rowsAtEmit = dbB.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];   // rows EXIST at emit time
  });
  var resB = await KernelOps.commitGroup(dbB, fixedGroup(), META);
  var logB = dumpLog(dbB);
  KernelOps.setOpEmitter(null);

  verdict(logA === logB && resA.group_hash === resB.group_hash && resA.tip === resB.tip,
    '§EMIT-IDENTICAL  emitter on == off (byte-identical log + hash + tip)',
    'logEq=' + (logA === logB) + ' groupHashEq=' + (resA.group_hash === resB.group_hash));
  verdict(events.length === 1 && events[0].kind === 'TEAM_OP' && events[0].gid === 'g-fixed' &&
          events[0].count === 2 && events[0].tip === resB.tip && rowsAtEmit === 2,
    '§EMIT-FIRES  fires once, AFTER commit, with gid/ids/tip', 'n=' + events.length + ' rowsAtEmit=' + rowsAtEmit + ' tip=' + (events[0] && events[0].tip || '').slice(0, 10));

  // §EMIT-SAFE — a throwing emitter must NOT break the commit.
  var dbC = new SQL.Database(); ERPKernel.initProjection(dbC);
  KernelOps.setOpEmitter(function () { throw new Error('boom'); });
  var resC = await KernelOps.commitGroup(dbC, fixedGroup(), META);
  KernelOps.setOpEmitter(null);
  verdict(resC.committed === true && resC.ids.length === 2, '§EMIT-SAFE  throwing emitter cannot break commit', 'committed=' + resC.committed);

  // ════ W-SCOPE ════
  // a tiny master db with org + project columns; adQ runs over it via erp_kernel.query.
  var master = new SQL.Database();
  master.run("CREATE TABLE c_order (id INTEGER, ad_org_id INTEGER, c_project_id TEXT, doc_status TEXT)");
  master.run("INSERT INTO c_order VALUES (1,11,'PX','DR'),(2,7,'PY','DR'),(3,11,'PY','DR')");
  var adQ = function (sql, p) { return ERPKernel.query(master, sql, p || []); };
  var projDb = new SQL.Database(); ERPKernel.initProjection(projDb);
  var seam = ERPSeam.makeSeam({ projDb: projDb, adQ: adQ, manifestObj: { version: 1, axis: '', shards: [], tables: [] },
                                wfmc: { transitions: [] }, newDb: function () { return new SQL.Database(); } });

  // §SCOPE-ABSENT — read with no scope == today (all 3 rows), byte-for-byte.
  var base = seam.read({ table: 'c_order' }, {});
  var baseScopedUndefined = seam.read({ table: 'c_order' }, { actor: 'x' });   // ctx present, scope absent
  verdict(base.length === 3 && JSON.stringify(base) === JSON.stringify(baseScopedUndefined),
    '§SCOPE-ABSENT  read identical when scope absent', 'rows=' + base.length + ' identical=' + (JSON.stringify(base) === JSON.stringify(baseScopedUndefined)));

  // §SCOPE-ORG — scope.org narrows.
  var org11 = seam.read({ table: 'c_order' }, { scope: { org: 11 } });
  verdict(org11.length === 2 && org11.every(function (r) { return r.ad_org_id === 11; }),
    '§SCOPE-ORG  scope.org narrows rows', 'org11 rows=' + org11.length + ' ids=' + org11.map(function (r) { return r.id; }).join(','));

  // §SCOPE-PROJECT — scope.project narrows (different key).
  var px = seam.read({ table: 'c_order' }, { scope: { project: 'PX' } });
  verdict(px.length === 1 && px[0].id === 1, '§SCOPE-PROJECT  scope.project narrows rows', 'PX rows=' + px.length);

  // §SCOPE-DISPATCH-ABSENT — dispatch with no scope takes the current path (role gate), NEVER scope-mismatch.
  var dAbsent = seam.dispatch({ table: 'c_order', action: 'Complete', org: 7 }, { role: { actions: [] } });
  verdict(dAbsent.rejected && dAbsent.why === 'role-no-grant', '§SCOPE-DISPATCH-ABSENT  no scope → exact current path',
    'why=' + dAbsent.why + ' (not scope-mismatch)');

  // §SCOPE-DISPATCH-GATE — scope.org ≠ intent.org → refused (present → filters), BEFORE the role gate.
  var dGate = seam.dispatch({ table: 'c_order', action: 'Complete', org: 7 }, { scope: { org: 11 }, role: { actions: ['c_order:Complete'] } });
  verdict(dGate.rejected && dGate.why === 'scope-mismatch', '§SCOPE-DISPATCH-GATE  out-of-scope write refused',
    'why=' + dGate.why + ' detail=' + dGate.detail);

  // ════ teams-side wiring (GAP-SUBSCRIBE / GAP-BUS-SCOPE) ════
  var Connectors = require(path.join(__dirname, '..', 'connectors.js'));
  var OpSubscribe = require(path.join(__dirname, '..', 'erp', 'op_subscribe.js'));
  var got = [];
  OpSubscribe.subscribeErpOps(Connectors.bus, function (evt) { got.push(evt); });
  var uninstall = OpSubscribe.installErpEmitter(KernelOps, Connectors.bus, { scope: { org: 11 } });
  var dbD = new SQL.Database(); ERPKernel.initProjection(dbD);
  await KernelOps.commitGroup(dbD, fixedGroup(), META);
  // §EMIT-BUS — the commit's TEAM_OP arrived on the team bus, scope-tagged.
  verdict(got.length === 1 && got[0].kind === 'TEAM_OP' && got[0].gid === 'g-fixed' && got[0].scope && got[0].scope.org === 11,
    '§EMIT-BUS  kernel emit wired onto the team bus', 'delivered=' + got.length + ' scope.org=' + (got[0] && got[0].scope && got[0].scope.org));
  // §EMIT-UNINSTALL — reversible: after uninstall, a commit emits NOTHING (kernel back to default-off).
  uninstall();
  var dbE = new SQL.Database(); ERPKernel.initProjection(dbE);
  await KernelOps.commitGroup(dbE, fixedGroup(), META);
  verdict(got.length === 1, '§EMIT-UNINSTALL  uninstall → default-off (reversible)', 'still delivered=' + got.length + ' (no new TEAM_OP)');

  var n = 11;
  console.log('\n' + (fails === 0 ? '✅ W-EMIT + W-SCOPE ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
