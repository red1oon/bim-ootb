#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ROSTER-VERIFY (bim-compiler prompts/KERNEL_HARDENING_BATCH1_SPEC.md §NEXT SESSION, T1).
//   THE ISSUE PROVED/DISPROVED: the merge/import path (teams/erp/erp_sync.js importBranch) checked the
//   KEYLESS chain only — a forged op signed by ANY key (or none of ours) with a self-consistently re-sealed
//   chain was SILENTLY ACCEPTED into the peer's World (audit T1/security#1). And the kernel's single
//   module-global _signer knows one key forever — no rotation, no revocation (forge-forever, audit §T1).
//   THE FIX PROVED (PORTED from witnessed doctrine — scripts/poc_rotate.js W-ROTATE + DistributedERP.md
//   §228/§290/§445 — NOT fresh design): erp/erp_key_epochs.js = HQ-signed device roster (pinned-key
//   pattern) + key-epoch map (ROTATE counter-signed by the outgoing key; REVOKE = burn-not-reattribute),
//   verifying every op under the key valid AT ITS seq, over the T2 CONTENT hash for v2 rows (merge-safe).
//   Wired onto importBranch via opts.roster.
//     §RV-ROSTER          — HQ-signed roster verifies; a roster with ONE swapped device key REJECTS.
//     §RV-ROTATE          — ROTATE counter-signed by the outgoing key installs the new key; a ROTATE
//                           signed by a stranger REJECTS.
//     §RV-HISTORY         — ops before the rotation still verify under the OLD key (never re-signed).
//     §RV-FUTURE          — after rotation the OLD key REJECTS, the NEW key ACCEPTS.
//     §RV-REVOKE          — a revoked key's FUTURE op REJECTS; its PAST ops stay valid.
//     §RV-RENUMBER-EPOCH  — the T2×T1 payoff: a branch WITH a rotation, ids renumbered (merge), still
//                           roster-verifies (v2 content sigs are id-independent).
//     §RV-IMPORT-FORGE    — a forged foreign-key op in a re-sealed branch: TODAY's keyless import path
//                           accepts it (the gap, shown live); roster-gated import REJECTS it.
//     §RV-IMPORT-RENUMBER — a renumbered honest branch imports + replays under the roster gate.
//   NON-INVENT: real erp/kernel_ops.js (T2 content signing ON) + erp/erp_snapshot_sign.js ECDSA P-256 +
//   real teams/erp/erp_sync.js import path, driven in node over sql.js.
//   §-log first — READ witness_roster_verify.log before any conclusion.
//   Run (cwd = worktree root): node erp/tests/witness_roster_verify.js 2>&1 | tee erp/tests/witness_roster_verify.log
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
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js'));
var K = global.window.KernelOps;
var SIGN = require(path.join(ERP, 'erp_snapshot_sign.js'));
var EP = null; try { EP = require(path.join(ERP, 'erp_key_epochs.js')); } catch (e) {}
var ERPKernel = require(path.join(ERP, 'erp_kernel.js'));
var Sync = require(path.join(__dirname, '..', '..', 'teams', 'erp', 'erp_sync.js'));
var C = require(path.join(__dirname, '..', '..', 'teams', 'connectors.js'));
var sha256sync = C._util.sha256;
var HOST = { KernelOps: K, ERPKernel: ERPKernel, ErpKeyEpochs: EP };

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var _real = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _real; }
var BASE_TS = 1700000000000;

// ── key registry: kid → {priv, pub}; op params carry only the kid (key material out-of-band) ──
var KEYS = {};
async function genKey(kid) {
  var kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  KEYS[kid] = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey),
                pub:  await crypto.subtle.exportKey('jwk', kp.publicKey) };
}
function devices() { return { K0: KEYS.K0.pub, K1: KEYS.K1.pub, K2: KEYS.K2.pub }; }
var verifyFn = function (msg, sig, pub) { return SIGN.verifyTip(msg, sig, pub); };

// commit an op naming its signer kid, T2 content signing ON, deterministic uuid/ts.
var _seq = 0;
function add(db, opType, params, kid) {
  _seq++;
  params.signed_by = kid;
  return K.commitOp(db, opType, params, null, null, 'u-' + _seq, BASE_TS + _seq);
}
// seal the chain (integrity, kernel-signer OFF), then sign each row with the key its params name —
// v2 rows over their CONTENT hash (K._contentHash), exactly what production edge devices do post-T2.
async function sealAndSign(db, signWithOverride) {
  await K.sealChain(db);
  var r = db.exec('SELECT id, op_uuid, timestamp, op_type, parameters, input_guids, output_guid, op_hash, user_tag FROM kernel_ops WHERE sig IS NULL ORDER BY id');
  var rows = r.length ? r[0].values : [];
  for (var i = 0; i < rows.length; i++) {
    var op = { id: rows[i][0], op_uuid: rows[i][1], timestamp: rows[i][2], op_type: rows[i][3],
               parameters: rows[i][4], input_guids: rows[i][5], output_guid: rows[i][6],
               op_hash: rows[i][7], user_tag: rows[i][8] };
    var kid = JSON.parse(op.parameters).signed_by;
    var msg = (K._isV2 && K._isV2(op.parameters)) ? await K._contentHash(op) : op.op_hash;
    var priv = (signWithOverride && signWithOverride[op.id]) || KEYS[kid].priv;
    db.run('UPDATE kernel_ops SET sig=? WHERE id=?', [await SIGN.signTip(priv, msg), op.id]);
  }
}
// renumber an EXPORTED array (the merge simulation): shift ids, re-derive the v1 chain over the array.
function renumberBranch(ops, shift) {
  var prev = '0'.repeat(64);
  return ops.map(function (src) {
    var o = {}; Object.keys(src).forEach(function (k) { o[k] = src[k]; });
    o.id = o.id + shift;
    var canon = o.id + '|' + o.timestamp + '|' + o.op_type + '|' + (o.parameters || '') + '|' + (o.input_guids || '') + '|' + (o.output_guid || '');
    o.prev_hash = prev; o.op_hash = sha256sync(prev + '|' + canon); prev = o.op_hash;
    return o;
  });
}
function docOp(n, kid) {   // a replayable CREATE_DOCUMENT (mirrors poc_teams_erp_sync shapes)
  return { payload: { op_type: 'CREATE_DOCUMENT', uuid: 'DOC:SO-' + n, table: 'C_Order', doc_status: 'DR' }, actor: 'ap' };
}

(async function () {
  console.log('\n═══ W-ROSTER-VERIFY — HQ-signed device roster + ROTATE/REVOKE key epochs on the verify/import path (T1) ═══\n');
  var SQL = await reqSql()();
  await genKey('K0'); await genKey('K1'); await genKey('K2'); await genKey('HQ'); await genKey('FORGE');
  if (K.setContentSigning) K.setContentSigning(true); else _real('   (setContentSigning MISSING — pre-T2 kernel)');
  var mk = function () { return new SQL.Database(); };

  // ── §RV-ROSTER — the HQ-signed device list is the trust root; tampering it fails the pinned check ──
  console.log('§RV-ROSTER — HQ-signed roster verifies; a swapped device key REJECTS');
  var roster = null, rosterOk = { ok: false }, rosterTampered = { ok: true };
  if (EP) {
    mute();
    roster = await EP.signRoster({ devices: devices(), genesisKid: 'K0' }, KEYS.HQ.priv);
    rosterOk = await EP.verifyRoster(roster, { hqPub: KEYS.HQ.pub });
    var evil = JSON.parse(JSON.stringify(roster));
    evil.payload.devices.K1 = KEYS.FORGE.pub;          // HQ never signed this key for K1
    rosterTampered = await EP.verifyRoster(evil, { hqPub: KEYS.HQ.pub });
    unmute();
  }
  verdict(!!EP, '§RV-ROSTER erp_key_epochs.js loads (ported module present)', EP ? 'loaded' : 'MISSING');
  verdict(rosterOk.ok === true, '§RV-ROSTER HQ-signed roster verifies under the pinned HQ key', 'ok=' + rosterOk.ok);
  verdict(rosterTampered.ok === false, '§RV-ROSTER roster with a swapped device key is REJECTED', 'why=' + rosterTampered.why);
  var RO = { roster: roster, hqPub: KEYS.HQ ? KEYS.HQ.pub : null };

  // ── §RV-ROTATE / §RV-HISTORY — counter-signed rotation; the past stays old-key-anchored ──
  console.log('\n§RV-ROTATE / §RV-HISTORY — counter-signed ROTATE installs the new key; history untouched');
  mute();
  var dbA = mk(); K.ensureTable(dbA); _seq = 0;
  add(dbA, 'POST', { account: 'cash', cents: 1 }, 'K0');
  add(dbA, 'POST', { account: 'cash', cents: 2 }, 'K0');
  add(dbA, 'ROTATE', { kind: 'ROTATE', newKid: 'K1' }, 'K0');           // counter-signed by outgoing K0
  add(dbA, 'POST', { account: 'cash', cents: 3 }, 'K1');
  await sealAndSign(dbA);
  var vA = EP ? await EP.verifyEpochSigs(dbA, RO) : { ok: false };
  var dbBad = mk(); K.ensureTable(dbBad); _seq = 0;
  add(dbBad, 'POST', { account: 'cash', cents: 1 }, 'K0');
  add(dbBad, 'ROTATE', { kind: 'ROTATE', newKid: 'K1' }, 'K1');         // stranger-signed — NOT the outgoing key
  add(dbBad, 'POST', { account: 'cash', cents: 2 }, 'K1');
  await sealAndSign(dbBad);
  var vBad = EP ? await EP.verifyEpochSigs(dbBad, RO) : { ok: true };
  // history: op id=1 (pre-rotation, K0) verifies under K0 directly, not under K1.
  var r1 = dbA.exec('SELECT op_uuid,timestamp,op_type,parameters,input_guids,output_guid,op_hash,user_tag FROM kernel_ops WHERE id=1')[0].values[0];
  var op1 = { op_uuid: r1[0], timestamp: r1[1], op_type: r1[2], parameters: r1[3], input_guids: r1[4], output_guid: r1[5], op_hash: r1[6], user_tag: r1[7] };
  var msg1 = (K._contentHash && K._isV2 && K._isV2(op1.parameters)) ? await K._contentHash(op1) : op1.op_hash;
  var sig1 = dbA.exec('SELECT sig FROM kernel_ops WHERE id=1')[0].values[0][0];
  var histOld = await SIGN.verifyTip(msg1, sig1, KEYS.K0.pub);
  var histNew = await SIGN.verifyTip(msg1, sig1, KEYS.K1.pub);
  unmute();
  verdict(vA.ok === true && vA.activeKid === 'K1', '§RV-ROTATE valid ROTATE accepted; active key advanced K0→K1', 'active=' + vA.activeKid);
  verdict(vBad.ok === false, '§RV-ROTATE stranger-signed ROTATE is REJECTED', 'why=' + vBad.why);
  verdict(histOld === true && histNew === false, '§RV-HISTORY pre-rotation op verifies under OLD key only (past never re-signed)', 'old=' + histOld + ' new=' + histNew);

  // ── §RV-FUTURE — after S the old key rejects, the new key accepts ──
  console.log('\n§RV-FUTURE — post-rotation: OLD key rejected, NEW key accepted');
  mute();
  var dbOld = mk(); K.ensureTable(dbOld); _seq = 0;
  add(dbOld, 'POST', { account: 'x', cents: 1 }, 'K0');
  add(dbOld, 'ROTATE', { kind: 'ROTATE', newKid: 'K1' }, 'K0');
  add(dbOld, 'POST', { account: 'x', cents: 2 }, 'K0');                 // OLD key after rotation
  await sealAndSign(dbOld);
  var vOld = EP ? await EP.verifyEpochSigs(dbOld, RO) : { ok: true };
  unmute();
  verdict(vOld.ok === false && vOld.brokeAt === 3, '§RV-FUTURE post-rotation OLD-key op is REJECTED at id=3', 'brokeAt=' + vOld.brokeAt + ' why=' + vOld.why);
  verdict(vA.ok === true, '§RV-FUTURE the same position signed by the NEW key is ACCEPTED (dbA id=4)', 'ok=' + vA.ok);

  // ── §RV-REVOKE — burn-not-reattribute: future dies, past stays ──
  console.log('\n§RV-REVOKE — a revoked key loses the future, keeps the past');
  mute();
  var dbR = mk(); K.ensureTable(dbR); _seq = 0;
  add(dbR, 'POST', { account: 'x', cents: 1 }, 'K0');
  add(dbR, 'ROTATE', { kind: 'ROTATE', newKid: 'K1' }, 'K0');
  add(dbR, 'POST', { account: 'x', cents: 2 }, 'K1');                   // genuine K1 op BEFORE revocation
  add(dbR, 'REVOKE', { kind: 'REVOKE', revokedKid: 'K1', newKid: 'K2' }, 'K1');   // K1 offboards → K2
  add(dbR, 'POST', { account: 'x', cents: 3 }, 'K2');
  await sealAndSign(dbR);
  var vR = EP ? await EP.verifyEpochSigs(dbR, RO) : { ok: false };
  var dbF = mk(); K.ensureTable(dbF); _seq = 0;
  add(dbF, 'POST', { account: 'x', cents: 1 }, 'K0');
  add(dbF, 'ROTATE', { kind: 'ROTATE', newKid: 'K1' }, 'K0');
  add(dbF, 'POST', { account: 'x', cents: 2 }, 'K1');
  add(dbF, 'REVOKE', { kind: 'REVOKE', revokedKid: 'K1', newKid: 'K2' }, 'K1');
  add(dbF, 'POST', { account: 'x', cents: 3 }, 'K2');
  add(dbF, 'POST', { account: 'x', cents: 4 }, 'K1');                   // forged: revoked K1 reused
  await sealAndSign(dbF);
  var vF = EP ? await EP.verifyEpochSigs(dbF, RO) : { ok: true };
  unmute();
  verdict(vR.ok === true && vR.activeKid === 'K2', '§RV-REVOKE graceful offboard verifies; successor K2 active', 'active=' + vR.activeKid);
  verdict(vF.ok === false && vF.brokeAt === 6, '§RV-REVOKE a FUTURE op by the revoked key is REJECTED', 'brokeAt=' + vF.brokeAt + ' why=' + vF.why);

  // ── §RV-RENUMBER-EPOCH — the T2×T1 payoff: rotation branch survives a merge renumbering ──
  console.log('\n§RV-RENUMBER-EPOCH — a rotated branch, ids renumbered, still roster-verifies (content sigs)');
  mute();
  var expA = Sync.exportBranch(dbA, {});
  var renA = renumberBranch(expA, 100);
  var chainA = Sync.erpVerifyChain(renA);
  var vRen = EP ? await EP.verifyEpochSigsOps(renA, RO) : { ok: false };
  unmute();
  verdict(chainA.ok === true, '§RV-RENUMBER-EPOCH renumbered branch re-chains cleanly (ids 101…)', 'len=' + chainA.len);
  verdict(vRen.ok === true && vRen.activeKid === 'K1', '§RV-RENUMBER-EPOCH sigs + ROTATE still verify after renumbering — merge-safe', 'ok=' + vRen.ok + ' active=' + (vRen.activeKid || '?') + (vRen.why ? ' why=' + vRen.why : ''));

  // ── §RV-IMPORT-FORGE — the security#1 gap closed at the import seam ──
  console.log('\n§RV-IMPORT-FORGE — forged foreign-key op: keyless import accepts (the gap), roster import REJECTS');
  mute();
  var origin = mk(); ERPKernel.initProjection(origin); _seq = 0;
  add(origin, 'CREATE_DOCUMENT', docOp(1, 'K0'), 'K0');
  add(origin, 'CREATE_DOCUMENT', docOp(2, 'K0'), 'K0');
  await sealAndSign(origin);
  // the attacker: appends an op CLAIMING signed_by=K0 but signed with FORGE's key, re-seals the chain.
  var attack = mk(); K.ensureTable(attack);
  Sync.exportBranch(origin, {}).forEach(function (o) {
    attack.run('INSERT INTO kernel_ops (id,op_uuid,timestamp,op_type,parameters,input_guids,output_guid,prev_hash,op_hash,sig,gid,branch_id,user_tag) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [o.id, o.op_uuid, o.timestamp, o.op_type, o.parameters, o.input_guids, o.output_guid, o.prev_hash, o.op_hash, o.sig, o.gid, o.branch_id, o.user_tag != null ? o.user_tag : 'local']);
  });
  _seq = 2;
  add(attack, 'CREATE_DOCUMENT', docOp(99, 'K0'), 'K0');               // claims K0…
  await sealAndSign(attack, { 3: KEYS.FORGE.priv });                   // …but FORGE signs it
  var forgedOps = Sync.exportBranch(attack, {});
  var chainForged = Sync.erpVerifyChain(forgedOps);
  var legacyAccepted = false, legacyHash = null;
  try { var leg = Sync.importBranch(forgedOps, HOST, mk); legacyAccepted = !!(leg && leg.projectionHash); legacyHash = leg && leg.projectionHash; } catch (e) {}
  var rosterRejected = false, rosterWhy = null;
  try {
    var res = Sync.importBranch(forgedOps, HOST, mk, RO);
    if (res && typeof res.then === 'function') { await res; }
    else if (!EP) { throw new Error('legacy path ignored opts (pre-T1 erp_sync)'); }
  } catch (e) { rosterRejected = true; rosterWhy = e.message; }
  unmute();
  verdict(chainForged.ok === true, '§RV-IMPORT-FORGE the forged branch\'s CHAIN is self-consistent (chain alone cannot catch it)', 'len=' + chainForged.len);
  verdict(legacyAccepted === true, '§RV-IMPORT-FORGE keyless import ACCEPTS the forgery (the documented pre-T1 gap, live)', 'hash=' + String(legacyHash).slice(0, 12) + '…');
  verdict(rosterRejected === true && /signature invalid|REJECTED/.test(rosterWhy || ''), '§RV-IMPORT-FORGE roster-gated import REJECTS the forgery', String(rosterWhy).slice(0, 80));

  // ── §RV-IMPORT-RENUMBER — an honest renumbered branch imports + replays under the roster gate ──
  console.log('\n§RV-IMPORT-RENUMBER — honest renumbered branch roster-imports and replays');
  mute();
  var honest = Sync.exportBranch(origin, {});
  var renH = renumberBranch(honest, 500);
  var impOk = false, impActive = null, impHash = null, impErr = null;
  try {
    var imp = await Sync.importBranch(renH, HOST, mk, RO);
    impOk = !!(imp && imp.projectionHash && imp.sigCheck && imp.sigCheck.ok);
    impActive = imp.sigCheck && imp.sigCheck.activeKid; impHash = imp.projectionHash;
  } catch (e) { impErr = e.message; }
  var originHash = ERPKernel.replay(origin, mk()).hash;
  unmute();
  verdict(impOk === true && impActive === 'K0', '§RV-IMPORT-RENUMBER renumbered honest branch ACCEPTED (sigs id-independent)', impErr ? 'ERR=' + impErr : 'active=' + impActive);
  verdict(impHash === originHash, '§RV-IMPORT-RENUMBER peer replay == origin projectionHash (byte-identical World)', String(impHash).slice(0, 12) + '… == ' + String(originHash).slice(0, 12) + '…');

  if (K.setContentSigning) K.setContentSigning(false);
  console.log('\n' + (fails ? '🔴 W-ROSTER-VERIFY ' + fails + ' FAIL' : '🟢 W-ROSTER-VERIFY ALL PASS'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(2); });
