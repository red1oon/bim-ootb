#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CONTENT-SIGN (bim-compiler prompts/KERNEL_HARDENING_BATCH1_SPEC.md §NEXT SESSION, T2).
//   THE ISSUE PROVED/DISPROVED: signatures bind to the LOCAL rowid — _canonical hashes `op.id` and the sig
//   attests over op_hash — so any id shift (a merge renumbering, the audit's §T2 permanence trap) breaks
//   EVERY signature, and the '|'-joined canonical lets two distinct field partitions collide to one hash
//   (delimiter injection, audit security#6). Roster verification across a merge (T1) is impossible until
//   signatures survive renumbering.
//   THE FIX PROVED (ADDITIVE-VERSION, the spec's recommended path — no flag-day, no re-seal of history):
//   ops stamped `_sigv:2` (a SIGNED fact inside parameters) are CONTENT-SIGNED — sig attests a JSON-canonical
//   (stableStringify, agrees with teams/connectors.js) payload over op_uuid|timestamp|op_type|parameters|
//   input_guids|output_guid|actor — NO id, NO prev. v1 rows verify exactly as before; the CHAIN (op_hash)
//   is byte-identical for all rows (v1 canonical incl. id — the local integrity/order layer is untouched).
//     §CS-V1-REGRESSION — a v1 log (content-signing OFF, the default) seals/signs/verifies UNCHANGED;
//                         chain tip byte-identical across rebuilds AND to the v1 formula recomputed here.
//     §CS-RENUMBER      — THE MERGE PROPERTY: a v2-signed log survives a simulated id renumbering
//                         (ids +100, re-seal) — sigs still verify. The SAME flow under v1 FAILS 'signature'.
//     §CS-DELIM         — '|'-bearing params re-partitioned to a v1-colliding canonical do NOT collide
//                         under _canonicalV2 (JSON escaping closes delimiter injection).
//     §CS-TAMPER        — a v2 row's parameters altered + whole chain RE-SEALED by the attacker still
//                         fails 'signature' (the sig binds CONTENT, not the recomputable chain).
//     §CS-MIXED         — v1 rows then v2 rows in ONE log: verifyChain OK (per-op canonical pick).
//     §CS-GROUP         — commitGroup path: a v2 group commits, verifies, and survives renumbering.
//   NON-INVENT: real erp/kernel_ops.js + erp/erp_snapshot_sign.js (ECDSA P-256) driven in node over sql.js.
//   §-log first — READ witness_content_sign.log before any conclusion.
//   Run (cwd = worktree root): node erp/tests/witness_content_sign.js 2>&1 | tee erp/tests/witness_content_sign.log
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

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var _real = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _real; }

// tolerate the pre-fix kernel (RED run): missing seams become no-ops so asserts go RED, not harness-crash.
var setCS = K.setContentSigning || function () { _real('   (setContentSigning MISSING — pre-T2 kernel, expect RED)'); };
var BASE_TS = 1700000000000;

async function makeSigner() {
  var kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  var priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  var pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { pub: pub,
    sign: function (msgHex) { return SIGN.signTip(priv, msgHex); },
    verify: function (msgHex, sigHex) { return SIGN.verifyTip(msgHex, sigHex, pub); } };
}
function seed3(SQL) {   // deterministic 3-op log (fixed uuids + ts)
  var db = new SQL.Database();
  K.ensureTable(db);
  K.commitOp(db, 'POST', { account: 'cash', cents: 100, memo: 'a|b' }, ['g1'], 'o1', 'u-1', BASE_TS + 1);
  K.commitOp(db, 'POST', { account: 'sales', cents: -100 }, ['g2'], 'o2', 'u-2', BASE_TS + 2);
  K.commitOp(db, 'MOVE', { from: 'w1', to: 'w2', qty: 3 }, null, null, 'u-3', BASE_TS + 3);
  return db;
}
function renumber(db) { db.run('UPDATE kernel_ops SET id = id + 100'); }
function tipOf(db) { var r = db.exec('SELECT op_hash FROM kernel_ops ORDER BY id DESC LIMIT 1'); return r.length ? r[0].values[0][0] : null; }
async function sha256hex(s) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

(async function () {
  console.log('\n═══ W-CONTENT-SIGN — v2 content-addressed signing, additive over v1 chain (T2) ═══\n');
  var SQL = await reqSql()();
  var signer = await makeSigner();

  // ── §CS-V1-REGRESSION — default (content-signing OFF) is byte-for-byte the v1 kernel ──
  console.log('§CS-V1-REGRESSION — existing v1 logs seal/sign/verify unchanged');
  mute();
  setCS(false);
  K.setSigner(signer);
  var v1a = seed3(SQL); await K.sealChain(v1a);
  var v1b = seed3(SQL); await K.sealChain(v1b);
  var rV1 = await K.verifyChain(v1a);
  unmute();
  verdict(rV1.ok === true, '§CS-V1-REGRESSION v1 log verifies (chain + sig)', 'ok=' + rV1.ok + ' len=' + rV1.len);
  verdict(tipOf(v1a) === tipOf(v1b), '§CS-V1-REGRESSION rebuild → byte-identical tip', String(tipOf(v1a)).slice(0, 12) + '…');
  // recompute the tip with the v1 formula IN-WITNESS: proves the chain bytes are the pre-T2 formula.
  var rows = v1a.exec('SELECT id,timestamp,op_type,parameters,input_guids,output_guid FROM kernel_ops ORDER BY id')[0].values;
  var prev = '0'.repeat(64);
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i][0] + '|' + rows[i][1] + '|' + rows[i][2] + '|' + (rows[i][3] || '') + '|' + (rows[i][4] || '') + '|' + (rows[i][5] || '');
    prev = await sha256hex(prev + '|' + c);
  }
  verdict(prev === tipOf(v1a), '§CS-V1-REGRESSION chain tip == v1 canonical formula (chain bytes untouched by T2)', prev.slice(0, 12) + '…');

  // ── §CS-RENUMBER — the merge property: v2 sigs survive id renumbering; v1 sigs do not ──
  console.log('\n§CS-RENUMBER — a v2-signed op survives a simulated id renumbering; v1 fails');
  mute();
  setCS(false);
  var dOld = seed3(SQL); await K.sealChain(dOld);
  renumber(dOld); await K.sealChain(dOld);            // re-seal after the shift (recomputes op_hash, keeps sigs)
  var rOld = await K.verifyChain(dOld);
  setCS(true);
  var dNew = seed3(SQL); await K.sealChain(dNew);
  var rNewBefore = await K.verifyChain(dNew);
  renumber(dNew); await K.sealChain(dNew);
  var rNew = await K.verifyChain(dNew);
  setCS(false);
  unmute();
  verdict(rOld.ok === false && rOld.why === 'signature', '§CS-RENUMBER v1 sig BREAKS on renumber (the documented trap)', 'ok=' + rOld.ok + ' why=' + rOld.why);
  verdict(rNewBefore.ok === true, '§CS-RENUMBER v2 log verifies before the shift', 'ok=' + rNewBefore.ok);
  verdict(rNew.ok === true, '§CS-RENUMBER v2 sig SURVIVES renumber (ids +100, re-sealed) — merge-safe', 'ok=' + rNew.ok + (rNew.why ? ' why=' + rNew.why : ''));

  // ── §CS-DELIM — '|' re-partitioning collides under v1 canonical, NOT under v2 ──
  console.log('\n§CS-DELIM — two distinct field partitions must not share one canonical');
  var A = { id: 1, timestamp: 5, op_type: 'POST', parameters: 'P', input_guids: 'X|Y', output_guid: 'O', op_uuid: 'u-A', user_tag: 'local' };
  var B = { id: 1, timestamp: 5, op_type: 'POST', parameters: 'P|X', input_guids: 'Y', output_guid: 'O', op_uuid: 'u-A', user_tag: 'local' };
  var v1collide = (A.id + '|' + A.timestamp + '|' + A.op_type + '|' + A.parameters + '|' + A.input_guids + '|' + A.output_guid) ===
                  (B.id + '|' + B.timestamp + '|' + B.op_type + '|' + B.parameters + '|' + B.input_guids + '|' + B.output_guid);
  verdict(v1collide === true, '§CS-DELIM v1 canonical COLLIDES (the flaw, shown live)', 'A==B under v1');
  var c2A = K._canonicalV2 ? K._canonicalV2(A) : null;
  var c2B = K._canonicalV2 ? K._canonicalV2(B) : null;
  verdict(c2A != null && c2B != null && c2A !== c2B, '§CS-DELIM v2 canonical does NOT collide (JSON escaping closes injection)',
          c2A == null ? '_canonicalV2 MISSING' : 'distinct');

  // ── §CS-TAMPER — altered v2 content fails even after the attacker re-seals the whole chain ──
  console.log('\n§CS-TAMPER — the v2 sig binds content: tamper + full re-seal still rejects');
  mute();
  setCS(true);
  var dT = seed3(SQL); await K.sealChain(dT);
  dT.run("UPDATE kernel_ops SET parameters = replace(parameters, '100', '999') WHERE id = 1");
  await K.sealChain(dT);                              // attacker re-seals — chain now self-consistent again
  var rT = await K.verifyChain(dT);
  setCS(false);
  unmute();
  verdict(rT.ok === false && rT.why === 'signature', '§CS-TAMPER altered params + re-sealed chain → sig REJECTS', 'ok=' + rT.ok + ' why=' + rT.why);

  // ── §CS-MIXED — v1 history + v2 new rows in ONE log verify together (the additive contract) ──
  console.log('\n§CS-MIXED — v1 rows and v2 rows coexist in one verifying log');
  mute();
  setCS(false);
  var dM = seed3(SQL); await K.sealChain(dM);         // 3 v1 rows
  setCS(true);
  K.commitOp(dM, 'POST', { account: 'new', cents: 7 }, null, null, 'u-4', BASE_TS + 4);   // v2 row
  await K.sealChain(dM);
  var rM = await K.verifyChain(dM);
  var svRow = dM.exec("SELECT parameters FROM kernel_ops ORDER BY id DESC LIMIT 1")[0].values[0][0];
  setCS(false);
  unmute();
  verdict(rM.ok === true && rM.len === 4, '§CS-MIXED mixed log verifies (per-op canonical pick)', 'ok=' + rM.ok + ' len=' + rM.len);
  verdict(/"_sigv":2/.test(svRow), '§CS-MIXED the v2 row carries _sigv:2 INSIDE signed parameters', svRow.slice(0, 60));

  // ── §CS-GROUP — the commitGroup staging path signs v2 and survives renumbering too ──
  console.log('\n§CS-GROUP — commitGroup v2 group verifies and survives renumbering');
  mute();
  setCS(true);
  var dG = new SQL.Database(); K.ensureTable(dG);
  var g = await K.commitGroup(dG, [
    { op_type: 'POST', params: { account: 'cash', cents: 50 }, op_uuid: 'u-g1' },
    { op_type: 'POST', params: { account: 'sales', cents: -50 }, op_uuid: 'u-g2' }
  ], { gid: 'g-cs', baseTs: BASE_TS + 10 });
  var rG1 = await K.verifyChain(dG);
  renumber(dG); await K.sealChain(dG);
  var rG2 = await K.verifyChain(dG);
  setCS(false);
  K.setSigner(null);
  unmute();
  verdict(g.committed === true && g.ids.length === 2, '§CS-GROUP v2 group commits atomically', 'ids=' + g.ids.join(','));
  verdict(rG1.ok === true, '§CS-GROUP group log verifies', 'ok=' + rG1.ok + (rG1.why ? ' why=' + rG1.why : ''));
  verdict(rG2.ok === true, '§CS-GROUP group sigs survive renumbering (staging path content-signs)', 'ok=' + rG2.ok + (rG2.why ? ' why=' + rG2.why : ''));

  console.log('\n' + (fails ? '🔴 W-CONTENT-SIGN ' + fails + ' FAIL' : '🟢 W-CONTENT-SIGN ALL PASS'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(2); });
