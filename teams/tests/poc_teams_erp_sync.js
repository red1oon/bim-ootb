#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ERP-SYNC (teams/ROADMAP.md §S8, Phase E — ERP edge transport, zero erp/ edits).
//   Node-only: a remote peer pulls an ERP kernel_ops branch over the EXISTING teams transport (mock
//   in-mem get/put = GitHub/OCI seam), VERIFIES the chain, and replays to the SAME projectionHash. Plus
//   a shared master over CAS. Deterministic (fixed ids/ts; supplied op_uuid/gid → byte-stable hashes).
//     §SYNC-VERIFY   — erpVerifyChain accepts the real kernel_ops chain; a tampered op is rejected at it.
//     §SYNC-PUSH     — pushOps store-and-forwards the branch through the ERP-verified transport.
//     §SYNC-PULL     — a remote peer pulls the branch and re-verifies (tamper/withhold would return []).
//     §SYNC-REPLAY   — the peer replays the pulled branch to the SAME projectionHash as the origin.
//     §SYNC-REWRITE  — a history-rewrite (shortened/forked log) is rejected (no silent overwrite).
//     §SYNC-CAS      — a shared master (BPartner) round-trips content-addressed (key stable, blob intact).
//     §SYNC-TIPS     — the tips directory advertises the branch tip for a joining peer.
//   Run: node teams/tests/poc_teams_erp_sync.js 2>&1 | tee teams/logs/erp_sync.log — then READ the log.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js', path.join(__dirname, '..', '..', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var ERP = path.join(__dirname, '..', '..', 'erp');
require(path.join(ERP, 'kernel_ops.js'));            // → window.KernelOps
var KernelOps = global.window.KernelOps;
var ERPKernel = require(path.join(ERP, 'erp_kernel.js'));
var Sync = require(path.join(__dirname, '..', 'erp', 'erp_sync.js'));
var HOST = { KernelOps: KernelOps, ERPKernel: ERPKernel };

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// a mock durable transport = an in-memory key→body map (the GitHub/OCI get/put seam, no network).
function mockStore() {
  var m = {};
  return { get: function (p) { return Promise.resolve(p in m ? m[p] : null); },
           put: function (p, body) { m[p] = body; return Promise.resolve(); }, _m: m };
}

(async function () {
  console.log('\n═══ W-ERP-SYNC — a remote peer pulls an ERP branch, verifies, replays to the same hash ═══\n');
  var SQL = await reqSql()();

  // ── ORIGIN (the "AP role" device): build a real sealed ERP kernel_ops log via commitGroup. ──
  var origin = new SQL.Database(); ERPKernel.initProjection(origin);
  // deterministic group: a doc create + status, supplied uuid/gid/baseTs → byte-stable chain.
  await KernelOps.commitGroup(origin, [
    { op_type: 'CREATE_DOCUMENT', op_uuid: 'u-1', params: { payload: { op_type: 'CREATE_DOCUMENT', uuid: 'DOC:SO-1', table: 'C_Order', doc_status: 'DR' }, actor: 'ap' } },
    { op_type: 'SET_STATUS',      op_uuid: 'u-2', params: { payload: { op_type: 'SET_STATUS', uuid: 'DOC:SO-1', table: 'C_Order', id: 1, doc_status: 'CO' }, actor: 'ap' } }
  ], { gid: 'g-ap', baseTs: 1000 });
  var originHash = ERPKernel.replay(origin, new SQL.Database()).hash;
  var branchOps = Sync.exportBranch(origin, {});

  // §SYNC-VERIFY — the exported chain verifies; a tampered op is rejected at exactly that op.
  var v = Sync.erpVerifyChain(branchOps);
  var tampered = branchOps.map(function (o) { return Object.assign({}, o); });
  tampered[1].parameters = tampered[1].parameters + 'X';
  var vt = Sync.erpVerifyChain(tampered);
  verdict(v.ok && v.len === 2 && !vt.ok && vt.at === 1, '§SYNC-VERIFY  ERP chain verifies; tamper rejected',
    'ok=' + v.ok + ' len=' + v.len + ' tamperAt=' + vt.at + '(' + vt.why + ')');

  // ── the SHARED transport (mock GH/OCI), pre-wired with the ERP verifier. ──
  var store = mockStore();
  var originTx = Sync.makeErpTransport({ get: store.get, put: store.put });
  var BRANCH = 'role:ap';

  // §SYNC-PUSH — origin pushes its branch through the ERP-verified transport.
  var pushed = await originTx.pushOps(BRANCH, branchOps);
  verdict(pushed.accepted === 2 && pushed.rejected.length === 0, '§SYNC-PUSH  branch store-and-forwarded',
    'accepted=' + pushed.accepted);

  // §SYNC-REWRITE — a forked/shortened log must be rejected (no silent history overwrite).
  var rewrite = await originTx.pushOps(BRANCH, branchOps.slice(0, 1));
  verdict(rewrite.accepted === 0 && rewrite.rejected[0].why === 'rewrite', '§SYNC-REWRITE  history-rewrite rejected',
    'why=' + (rewrite.rejected[0] && rewrite.rejected[0].why));

  // ── PEER (a second device): a fresh transport over the SAME store; pull + verify + replay. ──
  var peerTx = Sync.makeErpTransport({ get: store.get, put: store.put });
  var pulled = await peerTx.pullOps(BRANCH, 'GENESIS');
  // §SYNC-PULL — the peer received the verified branch.
  verdict(pulled.length === 2 && Sync.erpVerifyChain(pulled).ok, '§SYNC-PULL  peer pulls + re-verifies',
    'pulled=' + pulled.length);

  // §SYNC-REPLAY — the peer replays to the SAME projectionHash as the origin (deterministic World).
  var imported = Sync.importBranch(pulled, HOST, function () { return new SQL.Database(); });
  verdict(imported.projectionHash === originHash && imported.ops === 2,
    '§SYNC-REPLAY  peer replays to the SAME projectionHash', 'origin=' + originHash + ' peer=' + imported.projectionHash);

  // §SYNC-TIPS — the tips directory advertises the branch tip (a joining peer discovers it).
  var tips = await peerTx.tips();
  verdict(tips[BRANCH] === v.tip, '§SYNC-TIPS  tip directory advertises the branch', BRANCH + '=' + (tips[BRANCH] || '').slice(0, 12) + '…');

  // §SYNC-CAS — a shared master (BPartner) round-trips content-addressed (same key, blob intact).
  var master = { table: 'C_BPartner', id: 1001, name: 'ACME', taxId: 'MY-123' };
  var key = await originTx.putBlob(master);
  var got = await peerTx.getBlob(key);
  verdict(got && got.name === 'ACME' && got.taxId === 'MY-123' && key === (await peerTx.putBlob(master)),
    '§SYNC-CAS  shared master round-trips (content-addressed)', 'key=' + key.slice(0, 12) + '… name=' + (got && got.name));

  var n = 7;
  console.log('\n' + (fails === 0 ? '✅ W-ERP-SYNC ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
