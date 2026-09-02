#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-T1-ATTRIB (FABLE5_WRAPUP_2026-07-03 §Item 3 + KERNEL_TIMEBOMB_AUDIT §T1):
//   PIN/login is AUDIT METADATA attached to the op — NOT a new signing key. The device key (#630
//   roster) stays the only cryptographic identity; the employee PIN identity is recorded alongside
//   the op (content-signed) and maker-checker enforces it at employee AND device grain.
//     §ATTRIB-SAMEDEV  — (a) same-device, two DIFFERENT PINs maker/checker → REFUSED (one keyboard
//                        typed both identities — the "two typed names" bypass, now dead).
//     §ATTRIB-SAMEPIN  — (b) same PIN across two devices (typed names differ!) → REFUSED self-approval.
//     §ATTRIB-LEGIT    — (c) different PIN + different device → Approved.
//     §ATTRIB-REQUIRED — opts.attribRequired: an UNATTRIBUTED (typed-name-only) checker is ineligible.
//     §ATTRIB-BACKCOMPAT— no attribution anywhere + no flag → coSignState behaves exactly as before.
//     §ATTRIB-PIN      — ErpAttrib.identify: unknown PIN → null (non-invent), known PIN → directory row.
//     §ATTRIB-CHAIN    — (d) REAL erp kernel: two different-PIN sessions on ONE device commit ops;
//                        sealChain signs with the ONE device key; verifyChain green; a FOREIGN key
//                        fails to verify those sigs (sigs bind the device key, not the PIN); the
//                        rich parameters carry attrib.emp per session; user_tag stays device-grain;
//                        an op committed with NO attribution carries NO attrib field (byte back-compat).
//   Run: node teams/tests/poc_teams_t1_attrib.js 2>&1 | tee teams/logs/t1_attrib.log — then READ the log.
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
require(path.join(ERP, 'erp_attrib.js'));            // → window.ErpAttrib
var KernelOps = global.window.KernelOps;
var ErpAttrib = global.window.ErpAttrib;
var ERPKernel = require(path.join(ERP, 'erp_kernel.js'));
var X = require(path.join(__dirname, '..', 'erp', 'cosign.js'));
var ErpSignerFactory = (function () {                 // erp_signer.js is window-only
  require(path.join(ERP, 'erp_signer.js'));
  return global.window.ErpSigner;
})();

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-T1-ATTRIB — PIN identity = audit metadata on the op; device key stays the only signer ═══\n');
  var T = 1000, eligible = function (a, r) { return r === 'Mgr' || r === 'Clerk'; };

  // ── (a) §ATTRIB-SAMEDEV — two different PINs typed on ONE device: REFUSED. ──
  var log1 = [];
  log1 = X.submit(log1, { id: 's1', ts: T, author: 'alice', role: 'Clerk', doc: 'PO-1', amount: 9000,
                          attrib: { emp: 'alice', dev: 'device:D1' } }).log;
  log1 = X.approve(log1, { id: 'a1', ts: T + 1, author: 'bob', role: 'Mgr', doc: 'PO-1',
                           attrib: { emp: 'bob', dev: 'device:D1' } }).log;
  var st1 = X.coSignState(log1, 'PO-1', { eligible: eligible });
  verdict(st1.status === 'Submitted' && /same device/.test(st1.reason),
    '§ATTRIB-SAMEDEV two PINs, one device REFUSED', 'PO-1=' + st1.status + ' (' + st1.reason + ')');

  // ── (b) §ATTRIB-SAMEPIN — same PIN identity across devices, typed names DIFFER: self-approval. ──
  var log2 = [];
  log2 = X.submit(log2, { id: 's2', ts: T, author: 'alice', role: 'Clerk', doc: 'PO-2', amount: 9000,
                          attrib: { emp: 'alice', dev: 'device:D1' } }).log;
  log2 = X.approve(log2, { id: 'a2', ts: T + 1, author: 'totally-not-alice', role: 'Mgr', doc: 'PO-2',
                           attrib: { emp: 'alice', dev: 'device:D2' } }).log;
  var st2 = X.coSignState(log2, 'PO-2', { eligible: eligible });
  verdict(st2.status === 'Submitted' && /self-approval/.test(st2.reason),
    '§ATTRIB-SAMEPIN same PIN, forged typed name REFUSED', 'PO-2=' + st2.status + ' (' + st2.reason + ')');

  // ── (c) §ATTRIB-LEGIT — different PIN + different device: Approved. ──
  var log3 = [];
  log3 = X.submit(log3, { id: 's3', ts: T, author: 'alice', role: 'Clerk', doc: 'PO-3', amount: 9000,
                          attrib: { emp: 'alice', dev: 'device:D1' } }).log;
  log3 = X.approve(log3, { id: 'a3', ts: T + 1, author: 'bob', role: 'Mgr', doc: 'PO-3',
                           attrib: { emp: 'bob', dev: 'device:D2' } }).log;
  var st3 = X.coSignState(log3, 'PO-3', { eligible: eligible });
  verdict(st3.status === 'Approved' && st3.checker === 'bob',
    '§ATTRIB-LEGIT different PIN + device Approved', 'PO-3=' + st3.status + ' checker=' + st3.checker);

  // ── §ATTRIB-REQUIRED — typed-name-only (no PIN) checker is ineligible under attribRequired. ──
  var log4 = [];
  log4 = X.submit(log4, { id: 's4', ts: T, author: 'alice', role: 'Clerk', doc: 'PO-4', amount: 9000,
                          attrib: { emp: 'alice', dev: 'device:D1' } }).log;
  log4 = X.approve(log4, { id: 'a4', ts: T + 1, author: 'bob', role: 'Mgr', doc: 'PO-4' }).log;  // no attrib
  var st4 = X.coSignState(log4, 'PO-4', { eligible: eligible, attribRequired: true });
  verdict(st4.status === 'Submitted' && /unattributed/.test(st4.reason),
    '§ATTRIB-REQUIRED unattributed checker REFUSED', 'PO-4=' + st4.status + ' (' + st4.reason + ')');
  var st4b = X.coSignState(log4, 'PO-4', { eligible: eligible });
  verdict(st4b.status === 'Approved',
    '§ATTRIB-REQUIRED same log passes WITHOUT the flag (policy is opt-in)', 'PO-4=' + st4b.status);

  // ── §ATTRIB-BACKCOMPAT — zero attribution anywhere → pre-T1 behaviour byte-for-byte. ──
  var log5 = [];
  log5 = X.submit(log5, { id: 's5', ts: T, author: 'alice', role: 'Clerk', doc: 'PO-5', amount: 9000 }).log;
  log5 = X.approve(log5, { id: 'a5', ts: T + 1, author: 'bob', role: 'Mgr', doc: 'PO-5' }).log;
  var st5 = X.coSignState(log5, 'PO-5', { eligible: eligible });
  verdict(st5.status === 'Approved' && st5.checker === 'bob',
    '§ATTRIB-BACKCOMPAT unattributed log behaves as before', 'PO-5=' + st5.status);
  verdict(!('attrib' in (log5[0].params || {})),
    '§ATTRIB-BACKCOMPAT no attrib field minted when none given', 'params keys=' + Object.keys(log5[0].params).join(','));

  // ── §ATTRIB-PIN — directory identify: known PIN resolves, unknown PIN → null (non-invent). ──
  var dir = ErpAttrib.makeDirectory([
    { empId: 'alice', name: 'Alice A', pinHash: await ErpAttrib.hashPin('1234') },
    { empId: 'bob',   name: 'Bob B',   pinHash: await ErpAttrib.hashPin('5678') }
  ]);
  var idA = await ErpAttrib.identify('1234', dir);
  var idZ = await ErpAttrib.identify('0000', dir);
  verdict(idA && idA.emp === 'alice' && idA.m === 'pin', '§ATTRIB-PIN known PIN → directory identity', JSON.stringify(idA));
  verdict(idZ === null, '§ATTRIB-PIN unknown PIN → null (never guessed)', 'got=' + JSON.stringify(idZ));
  var dup = null;
  try { ErpAttrib.makeDirectory([{ empId: 'x', pinHash: await ErpAttrib.hashPin('9') }, { empId: 'y', pinHash: await ErpAttrib.hashPin('9') }]); }
  catch (e) { dup = e.message; }
  verdict(!!dup && /duplicate PIN/.test(dup), '§ATTRIB-PIN duplicate PIN throws (ambiguous identity refused)', dup);

  // ── (d) §ATTRIB-CHAIN — REAL kernel: attribution is metadata; the sig chain is the device key's. ──
  var SQL = await reqSql()();
  var db = new SQL.Database(); ERPKernel.initProjection(db);
  var deviceKp = await ErpSignerFactory.mintKeypair();
  var foreignKp = await ErpSignerFactory.mintKeypair();
  KernelOps.setSigner(ErpSignerFactory.makeSigner(deviceKp));

  // session 1: alice (PIN) on device:D1 — session 2: bob (PIN) on the SAME device, SAME key.
  ERPKernel.apply(db, [{ op_type: 'CREATE_DOCUMENT', uuid: 'DOC:SO-1', table: 'C_Order', doc_status: 'DR' }],
    { actor: 'device:D1', baseTs: 1000, attrib: { emp: 'alice', m: 'pin', dev: 'device:D1' } });
  ERPKernel.apply(db, [{ op_type: 'SET_STATUS', uuid: 'DOC:SO-1', table: 'C_Order', id: 1, doc_status: 'CO' }],
    { actor: 'device:D1', baseTs: 2000, attrib: { emp: 'bob', m: 'pin', dev: 'device:D1' } });
  ERPKernel.apply(db, [{ op_type: 'CREATE_DOCUMENT', uuid: 'DOC:SO-2', table: 'C_Order', doc_status: 'DR' }],
    { actor: 'device:D1', baseTs: 3000 });                       // NO attribution — back-compat row

  await KernelOps.sealChain(db);
  var v = await KernelOps.verifyChain(db);
  verdict(v.ok === true, '§ATTRIB-CHAIN sealed chain verifies under the ONE device key', 'len=' + v.len + ' tip=' + String(v.tip).slice(0, 12) + '…');

  var rows = db.exec('SELECT parameters, user_tag, sig FROM kernel_ops ORDER BY id')[0].values;
  var p0 = JSON.parse(rows[0][0]), p1 = JSON.parse(rows[1][0]), p2 = JSON.parse(rows[2][0]);
  verdict(p0.attrib && p0.attrib.emp === 'alice' && p1.attrib && p1.attrib.emp === 'bob',
    '§ATTRIB-CHAIN rich params carry per-session PIN identity', 'op1.emp=' + (p0.attrib && p0.attrib.emp) + ' op2.emp=' + (p1.attrib && p1.attrib.emp));
  verdict(!('attrib' in p2), '§ATTRIB-CHAIN unattributed op carries NO attrib field (byte back-compat)', 'keys=' + Object.keys(p2).join(','));
  verdict(rows[0][1] === 'device:D1' && rows[1][1] === 'device:D1',
    '§ATTRIB-CHAIN user_tag stays DEVICE-grain (owner-gate unchanged)', 'user_tag=' + rows[0][1] + ',' + rows[1][1]);
  verdict(rows.every(function (r) { return r[2] && r[2].length > 0; }),
    '§ATTRIB-CHAIN every op signed (device key present on all rows)');

  // the sigs must bind the DEVICE key, not the PIN: a foreign key REFUSES to verify them.
  KernelOps.setSigner(ErpSignerFactory.makeSigner(foreignKp));
  var vf = await KernelOps.verifyChain(db);
  verdict(vf.ok === false, '§ATTRIB-CHAIN a FOREIGN key fails sig-verify (sigs are the device key\'s, not per-PIN)',
    'ok=' + vf.ok + ' why=' + (vf.why || vf.at || ''));
  KernelOps.setSigner(null);

  console.log('\n' + (fails === 0 ? '✅ W-T1-ATTRIB ALL PASS' : '❌ W-T1-ATTRIB ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 W-T1-ATTRIB CRASH: ' + (e && e.stack || e)); process.exit(1); });
