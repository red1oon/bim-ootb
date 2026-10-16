#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-OWN (Milestone 7; spec ~/Projects/Mfg/MILESTONE_7_SPEC.md). READ THE LOG after every run: verdict = §MFG-OWN-VERDICT.
// THE ISSUE it proves/disproves: only the recorded owner of a PP_Order may mutate it on replay; ownership moves only by an ordered HANDOFF (no two-owner window, either side of it); the verdicts do not
//   depend on which device log is merged first; a tampered op — even with the hash chain re-sealed — is caught by verifyChain (content signature).  Break (MUST be red, named): MFG_BREAK=tamper.
//   Real erp/kernel_ops.js (commit/seal/verify, T2 content signing ON) + real erp/erp_replay.js + ECDSA P-256 (erp_snapshot_sign.js), node over sql.js.  Key custody (roster/rotation/revocation) = W-ROSTER-VERIFY, cited not re-proved.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() { var t = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js', path.join(__dirname, '..', '..', 'node_modules', 'sql.js')]; for (var i = 0; i < t.length; i++) { try { return require(t[i]); } catch (e) {} } throw new Error('sql.js not resolvable'); }
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js')); require(path.join(ERP, 'erp_replay.js'));
var K = global.window.KernelOps, R = global.window.ErpReplay, SIGN = require(path.join(ERP, 'erp_snapshot_sign.js'));
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0, BASE = 1700000000000;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(name, ok, info) { judged++; if (!ok) fails++; _log('  §MFG-OWN ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
async function makeSigner() {
  var kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  var priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { sign: function (m) { return SIGN.signTip(priv, m); }, verify: function (m, s) { return SIGN.verifyTip(m, s, pub); } };
}
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }

// the order timeline (n = timestamp offset). expect: A = accepted, X = rejected (reason substring)
var A = 'dev:A', B = 'dev:B', C = 'dev:C', O1 = 'PP_Order:8000', O2 = 'PP_Order:8001';
var TL = [
  { n: 1, dev: A, type: 'CREATE', p: { target: O1, doc_type: 'PP_Order', owner: A }, exp: 'A' },
  { n: 2, dev: B, type: 'SET_STATUS', p: { target: O1, status: 'released' }, exp: 'X non-owner' },                // non-owner mutation
  { n: 3, dev: A, type: 'SET_STATUS', p: { target: O1, status: 'released' }, exp: 'A' },
  { n: 4, dev: B, type: 'SET_STATUS', p: { target: O1, status: 'in_progress' }, exp: 'X non-owner' },            // new owner's op stamped BEFORE the handoff
  { n: 5, dev: A, type: 'HANDOFF', p: { target: O1, to: B }, exp: 'A' },
  { n: 6, dev: A, type: 'SET_STATUS', p: { target: O1, status: 'closed' }, exp: 'X non-owner' },                  // old owner AFTER the handoff: no two-owner window
  { n: 7, dev: B, type: 'SET_STATUS', p: { target: O1, status: 'in_progress' }, exp: 'A' },
  { n: 8, dev: C, type: 'HANDOFF', p: { target: O1, to: C }, exp: 'X non-owner' },                                 // a stranger cannot take ownership
  { n: 9, dev: B, type: 'HANDOFF', p: { target: O1, to: C }, exp: 'A' },
  { n: 10, dev: B, type: 'SET_STATUS', p: { target: O1, status: 'closed' }, exp: 'X non-owner' },
  { n: 11, dev: C, type: 'HANDOFF', p: { target: O1 }, exp: 'X handoff without target' },
  // control: the pre-existing ALLOCATE / CLAIM behaviour must survive the refactor
  { n: 12, dev: A, type: 'CREATE', p: { target: O2, doc_type: 'PP_Order', owner: A }, exp: 'A' },
  { n: 13, dev: B, type: 'ALLOCATE', p: { target: O2 }, exp: 'X non-owner' },
  { n: 14, dev: A, type: 'ALLOCATE', p: { target: O2 }, exp: 'A' },
  { n: 15, dev: B, type: 'CLAIM', p: { target: O2 }, exp: 'A' },
  { n: 16, dev: C, type: 'CLAIM', p: { target: O2 }, exp: 'X already claimed' }];
function mk(SQL, rows) {   // a kernel_ops DB holding the given timeline rows, deterministic uuid + ts
  var db = new SQL.Database(); K.ensureTable(db); mute();
  rows.forEach(function (t) { K.commitOp(db, t.type, Object.assign({ actor: t.dev }, t.p), null, null, 'u-' + (t.n < 10 ? '0' : '') + t.n, BASE + t.n); });
  unmute(); return db;
}
function read(db) { var r = db.exec('SELECT op_uuid, timestamp, op_type, parameters FROM kernel_ops ORDER BY id'); return r.length ? r[0].values.map(function (v) { return R.normalize({ op_uuid: v[0], timestamp: v[1], op_type: v[2], parameters: v[3] }); }) : []; }
function replay(SQL, ops) { var d = new SQL.Database(); mute(); var res = R.replayGuarded(d, ops); unmute(); return { res: res, rows: R.projectionRows(d) }; }
function rejSig(res) { return res.rejected.map(function (r) { return r.op.op_uuid + ':' + r.why; }).sort().join('|'); }

(async function () {
  var SQL = await reqSql()();
  var signer = await makeSigner();
  // ── central log: every device's ops in one chained, content-signed log ──
  mute(); K.setContentSigning && K.setContentSigning(true); K.setSigner(signer);
  var central = mk(SQL, TL); await K.sealChain(central); unmute();
  var tamperId = central.exec("SELECT id FROM kernel_ops WHERE op_uuid='u-02'")[0].values[0][0];   // the non-owner's op: rewriting its actor to the owner would make it pass the gate
  function tamper(db) { db.run("UPDATE kernel_ops SET parameters=replace(parameters,'\"actor\":\"dev:B\"','\"actor\":\"dev:A\"') WHERE op_uuid='u-02'"); }
  console.log('§MFG-OWN-LOAD break=' + (BREAK || 'none') + ' ops=' + TL.length + ' devices=3 orders=2 tamperTarget=id' + tamperId);

  // W5 chain verifies (BREAK tamper rewrites the non-owner's actor to the owner first)
  if (BREAK === 'tamper') tamper(central);
  mute(); var v = await K.verifyChain(central); unmute();
  console.log('§MFG-OWN-W5 verifyChain ok=' + v.ok + (v.ok ? '' : ' brokeAt=' + v.brokeAt + ' why=' + v.why) + (v.ok ? ' len=' + v.len : ''));
  check('W5 the signed log verifies (chain + content signature)', v.ok === true, { brokeAt: v.brokeAt, why: v.why });
  if (!v.ok) { inconclusive++; _log('§MFG-OWN NOTE the log did NOT verify; W1..W4 below replay it anyway ONLY to show what the tamper would have achieved (a production replay must stop here)'); }

  // W1/W2: replay from the central (verified) log, compare every op's verdict with the timeline
  var ops = read(central), full = replay(SQL, ops), byUuid = {}; full.res.rejected.forEach(function (r) { byUuid[r.op.op_uuid] = r.why; });
  var wrong = [];
  TL.forEach(function (t) { var id = 'u-' + (t.n < 10 ? '0' : '') + t.n, got = byUuid[id], want = t.exp;
    if (want === 'A') { if (got) wrong.push('op' + t.n + ' wanted accepted, got rejected: ' + got); } else { if (!got || got.indexOf(want.slice(2)) < 0) wrong.push('op' + t.n + ' wanted rejected(' + want.slice(2) + '), got ' + (got || 'accepted')); } });
  var o1 = full.rows.filter(function (r) { return r[0] === O1; })[0];
  console.log('§MFG-OWN-W1 applied=' + full.res.applied + ' rejected=' + full.res.rejected.length + ' final ' + O1 + '=' + JSON.stringify(o1));
  check('W1/W2 every op verdict matches the timeline (non-owner rejected, handoff ordered, no two-owner window, stranger/no-target handoff refused)', wrong.length === 0, { wrong: wrong });
  check('W2b final state: owner dev:C, status in_progress (last accepted status op)', !!o1 && o1[2] === C && o1[3] === 'in_progress', { o1: o1 });

  // W3 order-independence: three devices' own logs merged in different arrival orders
  var logs = { A: read(mk(SQL, TL.filter(function (t) { return t.dev === A; }))), B: read(mk(SQL, TL.filter(function (t) { return t.dev === B; }))), C: read(mk(SQL, TL.filter(function (t) { return t.dev === C; }))) };
  var perms = [['A', 'B', 'C'], ['C', 'B', 'A'], ['B', 'A', 'C'], ['B', 'C', 'A']], sigs = perms.map(function (p) { var r = replay(SQL, R.mergeLogs(logs[p[0]], logs[p[1]], logs[p[2]])); return djb(JSON.stringify(r.rows)) + '/' + djb(rejSig(r.res)); });
  console.log('§MFG-OWN-W3 merge orders ' + perms.map(function (p) { return p.join(''); }).join(',') + ' -> ' + sigs.join(' '));
  check('W3 projection + rejected set identical for every merge order (and == the central replay)', sigs.every(function (s) { return s === sigs[0]; }) && sigs[0] === djb(JSON.stringify(full.rows)) + '/' + djb(rejSig(full.res)), { sigs: sigs });

  // W4 controls: ALLOCATE / CLAIM behaviour preserved (covered by ops 12-16 above; restated as its own verdict)
  var o2 = full.rows.filter(function (r) { return r[0] === O2; })[0];
  check('W4 control: ALLOCATE non-owner rejected, owner allocates, CLAIM first-wins (O2 status allocated, claimed_by dev:B)', !!o2 && o2[3] === 'allocated' && o2[4] === B, { o2: o2 });

  // W6 negative controls (on copies of the honest log): the witness must be ABLE to see tampering
  var honest = new SQL.Database(); K.ensureTable(honest);
  mute(); K.setContentSigning && K.setContentSigning(true); K.setSigner(signer); var h = mk(SQL, TL); await K.sealChain(h); unmute();
  var a = new SQL.Database(h.export()); tamper(a); mute(); var va = await K.verifyChain(a); unmute();
  var b2 = new SQL.Database(h.export()); tamper(b2); mute(); await K.sealChain(b2); var vb = await K.verifyChain(b2); unmute();
  var c2 = new SQL.Database(h.export()); tamper(c2); mute(); K.setSigner(null); await K.sealChain(c2); var vc = await K.verifyChain(c2); K.setSigner(signer); unmute();
  console.log('§MFG-OWN-W6 (a) tamper: ok=' + va.ok + ' why=' + va.why + ' brokeAt=' + va.brokeAt + ' | (b) tamper+re-seal, signed: ok=' + vb.ok + ' why=' + vb.why + ' | (c) tamper+re-seal, NO signer: ok=' + vc.ok);
  check('W6a tampered op detected (verifyChain fails, brokeAt = the tampered op)', va.ok === false && va.brokeAt === tamperId, { va: va });
  check('W6b tampered op + attacker re-sealed chain still detected (content signature)', vb.ok === false && /signature/.test(String(vb.why)), { vb: vb });
  _log('§MFG-OWN-GAP (shown, not asserted away) without a signer a re-sealed tamper verifies=' + vc.ok + ': the signature/roster is what makes ownership tamper-evident, the bare hash chain is not (W-ROSTER-VERIFY covers key custody)');

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  _log('§MFG-OWN-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { unmute(); _log('§MFG-OWN-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
