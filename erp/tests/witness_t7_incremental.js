#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-T7-INC (FABLE5_WRAPUP_2026-07-03 §Item 4 + 4b; spec prompts/T7_INCREMENTAL_SHARD_SPEC.md;
//   diagnosis KERNEL_TIMEBOMB_AUDIT §T7). A ~5k-op synthetic POS-scale log with a REAL ECDSA P-256 signer,
//   measuring each fix — "a real, measured drop, not just 'should be faster'":
//     §T7-SEAL   — sealFrom seals ONLY the unsealed tail; tip identical to full sealChain; measured ms.
//     §T7-VERIFY — verifyChainIncremental == full verdict+tip; measured ms drop at 5k ops; a tamper AFTER
//                  the cached tip is caught incrementally; a tamper BEHIND it is (BY DESIGN) invisible to
//                  the hot path and caught by the next FULL verify — both directions witnessed honestly.
//     §T7-TIP    — TipFold readTip/tipValues verdicts EQUAL the unmemoized reference fold on every
//                  (table,id); measured per-paint-sweep drop; undo invalidation stays correct.
//     §T7-SNAP   — fold-from-snapshot projectionHash == fold-from-genesis; a failing archive store means
//                  NO delete (db byte-identical); post-shard hot log = snapshot + open ops only.
//     §T7-SHARD  — a tampered ARCHIVED shard is DETECTED on lazy verify; clean shards chain back to
//                  GENESIS across TWO shard generations (boundary link = recorded baseTipHash).
//     §T7-OFF    — below-threshold maybeShard is a no-op, export bytes byte-identical (default-off).
//   Run: node erp/tests/witness_t7_incremental.js 2>&1 | tee build/t7_incremental.log — then READ the log.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js', path.join(__dirname, '..', '..', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js'));
require(path.join(ERP, 'tip_fold.js'));
require(path.join(ERP, 'erp_shard.js'));
require(path.join(ERP, 'erp_signer.js'));
var K = global.window.KernelOps, TipFold = global.window.TipFold, Shard = global.window.ErpShard, Signer = global.window.ErpSigner;
var EK = require(path.join(ERP, 'erp_kernel.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function ms(t0) { return (Date.now() - t0); }

var N_GROUPS = 490, OPS_PER_GROUP = 10;                       // ≈4.9k ops + snapshots ≈ the audit's 5k cliff
var STATUSES = ['DR', 'IP', 'CO', 'CL'];

function statusOp(i) {                                        // crud-shaped SET_STATUS (readTip/TipFold food)
  return { op_type: 'SET_STATUS', op_uuid: 'u-s' + i, params: { table: 'C_Order', id: (i % 400), to: STATUSES[i % 4] } };
}
function updateOp(i) {                                        // crud-shaped CRUD_UPDATE (tipValues food)
  return { op_type: 'CRUD_UPDATE', op_uuid: 'u-u' + i, params: { table: 'C_Order', id: (i % 400), changes: { GrandTotal: { new: i }, Description: { new: 'row' + i } } } };
}
async function commitBatch(db, g) {                           // one POS "sale": 10 mixed ops
  var base = g * OPS_PER_GROUP;
  // the SEAM path (production shape): payload ops APPLY to the projection AND log via erp_kernel,
  // then the debounced persist seals them incrementally — sealFrom IS the fix-1 production path.
  EK.apply(db, [
    { op_type: 'CREATE_DOCUMENT', uuid: 'DOC:C_Order@from' + (base + 7), table: 'C_Order', source_id: base + 7, doc_status: 'DR' },
    { op_type: 'SET_STATUS', uuid: 'DOC:C_Order@from' + (base + 7), table: 'C_Order', id: base + 7, doc_status: 'CO' }
  ], { actor: 'pos', baseTs: 1000000 + base });
  await K.sealFrom(db);
  var ops = [];                                               // the POS group path (commitGroup, crud-shaped)
  for (var j = 0; j < 4; j++) ops.push(statusOp(base + j));
  for (j = 4; j < 7; j++) ops.push(updateOp(base + j));
  ops.push(statusOp(base + 9));
  var res = await K.commitGroup(db, ops, { gid: 'g-' + g, baseTs: 1000000 + g });
  if (!res.committed) throw new Error('commitBatch g=' + g + ' not committed: ' + res.reason);
  return res;
}
// the UNMEMOIZED reference fold — byte-copy of crud_overlay's legacy readTip/tipValues scans.
function refReadTip(db, table, id) {
  var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='SET_STATUS' AND undone=0 AND branch_id IS NULL ORDER BY id DESC");
  if (!r.length || !r[0].values.length) return null;
  var rows = r[0].values;
  for (var i = 0; i < rows.length; i++) {
    var p; try { p = JSON.parse(rows[i][0]); } catch (e) { continue; }
    if (p && p.table === table && String(p.id) === String(id)) return p.to || null;
  }
  return null;
}
function refTipValues(db, table, id) {
  var out = {};
  var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='CRUD_UPDATE' AND undone=0 AND branch_id IS NULL ORDER BY id ASC");
  if (!r.length || !r[0].values.length) return out;
  var rows = r[0].values;
  for (var i = 0; i < rows.length; i++) {
    var p; try { p = JSON.parse(rows[i][0]); } catch (e) { continue; }
    if (!p || p.table !== table || String(p.id) !== String(id)) continue;
    var ch = p.changes || {};
    for (var c in ch) { if (ch.hasOwnProperty(c)) out[c] = (ch[c] && ch[c].hasOwnProperty('new')) ? ch[c].new : ch[c]; }
  }
  return out;
}
function memStore() {
  var m = {};
  return { get: function (k) { return Promise.resolve(k in m ? m[k] : null); },
           put: function (k, b) { m[k] = b; return Promise.resolve(); }, _m: m };
}

(async function () {
  console.log('\n═══ W-T7-INC — incremental seal/verify/tip-folds + signed shard boundary, MEASURED at ~5k ops ═══\n');
  var SQL = await reqSql()();
  var db = new SQL.Database(); EK.initProjection(db);
  var kp = await Signer.mintKeypair();
  K.setSigner(Signer.makeSigner(kp));
  K.setContentSigning(true);                                   // production posture since T2/#630

  var t0 = Date.now();
  for (var g = 0; g < N_GROUPS; g++) await commitBatch(db, g);
  var total = db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  console.log('   built synthetic POS log: ' + total + ' signed ops in ' + N_GROUPS + ' groups (' + ms(t0) + 'ms)\n');

  // ── §T7-SEAL — the persist path: sealFrom (incremental) vs sealChain (what _idbPersist used to do) ──
  // erp_kernel.apply writes UNSEALED rows (the rule-edit path) — exactly what the debounced persist seals.
  EK.apply(db, [{ op_type: 'CREATE_DOCUMENT', uuid: 'DOC:RULE@1', table: 'AD_Rule', source_id: 9001, doc_status: 'DR' }],
           { actor: 'device:pos1', baseTs: 2000000 });
  var tSealFrom = Date.now();
  var sf = await K.sealFrom(db);
  tSealFrom = ms(tSealFrom);
  var tSealFull = Date.now();
  var sc = await K.sealChain(db);
  tSealFull = ms(tSealFull);
  verdict(sf.sealed === 1, '§T7-SEAL sealFrom sealed ONLY the unsealed tail', 'sealed=' + sf.sealed + ' (full re-seal would be ' + sc.sealed + ')');
  verdict(sf.tip === sc.tip, '§T7-SEAL incremental tip == full-re-seal tip', sf.tip.slice(0, 12) + '…');
  verdict(tSealFrom < tSealFull, '§T7-SEAL measured drop', 'sealFrom=' + tSealFrom + 'ms vs sealChain=' + tSealFull + 'ms (' + (total + 1) + ' ops)');

  // ── §T7-VERIFY — tip-cached incremental verify vs the full per-op-ECDSA verify per action ──
  var tFull1 = Date.now();
  var vFull = await K.verifyChain(db);                        // warms the cache (the boot verify)
  tFull1 = ms(tFull1);
  await commitBatch(db, N_GROUPS);                             // one more "sale"
  var tInc = Date.now();
  var vInc = await K.verifyChainIncremental(db);
  tInc = ms(tInc);
  var tFull2 = Date.now();
  var vFull2 = await K.verifyChain(db);
  tFull2 = ms(tFull2);
  verdict(vFull.ok && vInc.ok && vFull2.ok && vInc.tip === vFull2.tip && vInc.len === vFull2.len,
    '§T7-VERIFY incremental == full (verdict, tip, len)', 'tip=' + String(vInc.tip).slice(0, 12) + '… len=' + vInc.len);
  verdict(vInc.checked === OPS_PER_GROUP, '§T7-VERIFY only the NEW ops were re-verified', 'checked=' + vInc.checked + ' skipped=' + (vInc.len - vInc.checked));
  verdict(tInc < tFull2, '§T7-VERIFY measured drop per action', 'incremental=' + tInc + 'ms vs full=' + tFull2 + 'ms (boot full=' + tFull1 + 'ms)');

  // tamper AFTER the cached tip (cache is at the pre-tamper tip after vInc) → commit a group, corrupt one
  // of its rows, the incremental hot path must catch it.
  await commitBatch(db, N_GROUPS + 1);
  var lastId = db.exec('SELECT MAX(id) FROM kernel_ops')[0].values[0][0];
  var orig = db.exec('SELECT parameters FROM kernel_ops WHERE id=' + lastId)[0].values[0][0];
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [orig + 'X', lastId]);
  var vT = await K.verifyChainIncremental(db);
  verdict(vT.ok === false && vT.why === 'group torn', '§T7-VERIFY tamper AFTER cached tip caught incrementally', 'why=' + vT.why + ' failAt=' + vT.failAt);
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [orig, lastId]);
  var vHeal = await K.verifyChain(db);                         // restore + full re-verify re-warms the cache
  verdict(vHeal.ok === true, '§T7-VERIFY restored log verifies full again', 'len=' + vHeal.len);

  // tamper BEHIND the cached tip — the DOCUMENTED trust window: invisible to the hot path, caught by the
  // next FULL verify (boot/import/snapshot). Both directions asserted, honestly.
  var earlyId = db.exec('SELECT MIN(id) FROM kernel_ops')[0].values[0][0];
  var origEarly = db.exec('SELECT parameters FROM kernel_ops WHERE id=' + earlyId)[0].values[0][0];
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [origEarly + 'X', earlyId]);
  var vBehindInc = await K.verifyChainIncremental(db);
  var vBehindFull = await K.verifyChain(db);
  verdict(vBehindInc.ok === true && vBehindInc.incremental === true,
    '§T7-VERIFY tamper BEHIND tip: hot path trusts its verified prefix (BY DESIGN — see spec semantics)', 'incremental ok=' + vBehindInc.ok);
  verdict(vBehindFull.ok === false, '§T7-VERIFY …and the next FULL verify catches it', 'why=' + vBehindFull.why + ' at=' + vBehindFull.brokeAt);
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [origEarly, earlyId]);
  var vHeal2 = await K.verifyChain(db);
  verdict(vHeal2.ok === true, '§T7-VERIFY log restored clean', 'len=' + vHeal2.len);

  // ── §T7-TIP — memoized tip-folds == the unmemoized reference on EVERY (table,id), measured ──
  var mismatch = 0;
  for (var id = 0; id < 400; id++) {
    if (TipFold.readTip(db, 'C_Order', id, null) !== refReadTip(db, 'C_Order', id)) mismatch++;
    if (JSON.stringify(TipFold.tipValues(db, 'C_Order', id, null)) !== JSON.stringify(refTipValues(db, 'C_Order', id))) mismatch++;
  }
  verdict(mismatch === 0, '§T7-TIP memoized == reference fold on 400 ids × {readTip, tipValues}', 'mismatches=' + mismatch);
  var tRef = Date.now(); for (id = 0; id < 400; id++) refReadTip(db, 'C_Order', id); tRef = ms(tRef);
  var tMemo = Date.now(); for (id = 0; id < 400; id++) TipFold.readTip(db, 'C_Order', id, null); tMemo = ms(tMemo);
  verdict(tMemo < tRef, '§T7-TIP measured per-paint-sweep drop (400-row grid)', 'memoized=' + tMemo + 'ms vs full-scan=' + tRef + 'ms');
  await commitBatch(db, N_GROUPS + 2);                         // append → incremental fold path
  var mismatch2 = 0;
  for (id = 0; id < 400; id++) if (TipFold.readTip(db, 'C_Order', id, null) !== refReadTip(db, 'C_Order', id)) mismatch2++;
  verdict(mismatch2 === 0, '§T7-TIP append-only incremental fold stays equal', 'mismatches=' + mismatch2);
  var undoneId = db.exec("SELECT MAX(id) FROM kernel_ops WHERE op_type='SET_STATUS'")[0].values[0][0];
  db.run('UPDATE kernel_ops SET undone=1 WHERE id=' + undoneId);   // an undo — stamp undoneN changes → rebuild
  var mismatch3 = 0;
  for (id = 0; id < 400; id++) if (TipFold.readTip(db, 'C_Order', id, null) !== refReadTip(db, 'C_Order', id)) mismatch3++;
  verdict(mismatch3 === 0, '§T7-TIP undo invalidates + rebuilds correctly', 'mismatches=' + mismatch3);
  db.run('UPDATE kernel_ops SET undone=0 WHERE id=' + undoneId);
  await K.sealChain(db); var vClean = await K.verifyChain(db);   // undone isn't hashed, but re-assert clean
  verdict(vClean.ok, '§T7-TIP log still verifies after undo/redo round-trip', 'len=' + vClean.len);

  // ── §T7-SNAP — the signed snapshot: fold-from-snapshot == fold-from-genesis; archive gate ──
  var genesisHash = EK.replay(db, new SQL.Database()).hash;
  var preShardLen = db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  // (gate first) a FAILING archive store must change NOTHING:
  var preBytes = db.export();
  var badStore = { get: function () { return Promise.resolve(null); }, put: function () { return Promise.reject(new Error('disk full')); } };
  var rBad = await Shard.shard(db, { store: badStore, key: 'poslog', ts: 3000000 });
  var postBytes = db.export();
  verdict(rBad.sharded === false && /archive put failed/.test(rBad.reason), '§T7-SNAP failing archive sink ⇒ ABORT', rBad.reason);
  verdict(preBytes.length === postBytes.length && Buffer.from(preBytes).equals(Buffer.from(postBytes)),
    '§T7-SNAP aborted shard leaves the db BYTE-IDENTICAL', preBytes.length + ' bytes');
  var store = memStore();
  var tVerifyPre = Date.now(); await K.verifyChain(db); tVerifyPre = ms(tVerifyPre);
  var r1 = await Shard.shard(db, { store: store, key: 'poslog', ts: 3000001 });
  verdict(r1.sharded === true && r1.ok === true, '§T7-SNAP shard #1 committed + hot chain re-verifies', 'seq=' + r1.seq + ' archived=' + r1.archived + ' hotOps=' + r1.hotLen);
  verdict(r1.hotLen === 1, '§T7-SNAP hot log = the snapshot only (instant first paint load)', 'hotLen=' + r1.hotLen);
  var snapHash = EK.replay(db, new SQL.Database()).hash;
  verdict(snapHash === genesisHash, '§T7-SNAP projectionHash(fold-from-snapshot) == projectionHash(fold-from-genesis)', snapHash);
  var tVerifyPost = Date.now(); await K.verifyChain(db); tVerifyPost = ms(tVerifyPost);
  verdict(tVerifyPost < tVerifyPre, '§T7-SNAP measured boot-verify drop after shard', 'post=' + tVerifyPost + 'ms vs pre=' + tVerifyPre + 'ms (' + preShardLen + '→' + r1.hotLen + ' ops)');

  // ── §T7-SHARD — two generations + lazy tamper detection ──
  for (g = 0; g < 5; g++) await commitBatch(db, 600 + g);      // the next open shard
  var postShardReplay = EK.replay(db, new SQL.Database()).hash;
  var r2 = await Shard.shard(db, { store: store, key: 'poslog', ts: 3000002 });
  verdict(r2.sharded === true && r2.seq === 2, '§T7-SHARD shard #2 closes the next generation', 'seq=' + r2.seq + ' archived=' + r2.archived);
  var replay2 = EK.replay(db, new SQL.Database()).hash;
  verdict(replay2 === postShardReplay, '§T7-SHARD projection preserved across generation 2', replay2);
  var walk = await Shard.verifyShards(db, store, 'poslog');
  verdict(walk.ok === true && walk.shards === 2, '§T7-SHARD lazy backward walk verifies 2 shards to GENESIS', JSON.stringify(walk));
  var blob = JSON.parse(store._m['poslog::shard:1']);
  var origP = blob[100].parameters; blob[100].parameters = origP + 'X';
  store._m['poslog::shard:1'] = JSON.stringify(blob);
  var walkT = await Shard.verifyShards(db, store, 'poslog');
  verdict(walkT.ok === false && walkT.seq === 1 && walkT.why === 'payload altered',
    '§T7-SHARD tampered ARCHIVED op DETECTED on lazy verify (never eagerly loaded)', 'seq=' + walkT.seq + ' why=' + walkT.why + ' at=' + walkT.at);
  blob[100].parameters = origP; store._m['poslog::shard:1'] = JSON.stringify(blob);
  var walkR = await Shard.verifyShards(db, store, 'poslog');
  verdict(walkR.ok === true, '§T7-SHARD restored archive verifies again', 'shards=' + walkR.shards);

  // ── §T7-OFF — default-off: a small log is untouched byte-for-byte ──
  var db2 = new SQL.Database(); EK.initProjection(db2);
  for (g = 0; g < 3; g++) await commitBatch(db2, g);
  var b1 = db2.export();
  var rOff = await Shard.maybeShard(db2, { store: memStore(), key: 'small', threshold: 5000 });
  var b2 = db2.export();
  verdict(rOff.sharded === false && rOff.reason === 'below-threshold', '§T7-OFF below-threshold maybeShard is a no-op', 'n=' + rOff.n + ' threshold=' + rOff.threshold);
  verdict(b1.length === b2.length && Buffer.from(b1).equals(Buffer.from(b2)), '§T7-OFF export bytes BYTE-IDENTICAL', b1.length + ' bytes');

  // ── §T7-ANCHOR (review finding B) — verifyShards must NOT trust an unverified hot anchor ──
  var hotSnapId = db.exec("SELECT id FROM kernel_ops WHERE op_type='SHARD_SNAPSHOT' ORDER BY id DESC LIMIT 1")[0].values[0][0];
  var origSnapP = db.exec('SELECT parameters FROM kernel_ops WHERE id=' + hotSnapId)[0].values[0][0];
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [origSnapP.replace('"baseTipHash":"', '"baseTipHash":"ff'), hotSnapId]);
  var walkA = await Shard.verifyShards(db, store, 'poslog');
  verdict(walkA.ok === false && /hot chain verify failed/.test(walkA.why),
    '§T7-ANCHOR tampered hot-snapshot anchor REFUSED (hot chain verified inside verifyShards)', 'why=' + walkA.why);
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [origSnapP, hotSnapId]);
  var walkA2 = await Shard.verifyShards(db, store, 'poslog');
  verdict(walkA2.ok === true, '§T7-ANCHOR restored anchor walks clean again', 'shards=' + walkA2.shards);

  // ── §T7-RACE (review finding A) — a commit interleaved into shard()'s archive awaits must ABORT,
  // never silently delete an unarchived sealed op. The race store commits ONE op inside store.put.
  var raceStore = memStore(), rawPut = raceStore.put, raced = false;
  raceStore.put = function (k, b) {
    if (raced) return rawPut.call(raceStore, k, b);
    raced = true;
    return K.commitGroup(db2, [statusOp(99001)], { gid: 'g-race', baseTs: 4000000 })
      .then(function () { return rawPut.call(raceStore, k, b); });
  };
  var preRaceLen = db2.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  var rRace = await Shard.shard(db2, { store: raceStore, key: 'race', ts: 4000001 });
  verdict(rRace.sharded === false && /concurrent commit/.test(rRace.reason),
    '§T7-RACE interleaved commit during archive ⇒ ABORT (no delete)', rRace.reason);
  var postRaceLen = db2.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  var vRace = await K.verifyChain(db2);
  verdict(postRaceLen === preRaceLen + 1 && vRace.ok === true,
    '§T7-RACE the raced op SURVIVES, chain verifies (nothing lost, snapshot rolled back)', 'ops=' + postRaceLen + ' verify=' + vRace.ok);
  var rRetry = await Shard.shard(db2, { store: raceStore, key: 'race', ts: 4000002 });
  verdict(rRetry.sharded === true && rRetry.archived === postRaceLen,
    '§T7-RACE retry shards cleanly WITH the raced op archived', 'archived=' + rRetry.archived);

  // ── §T7-INJECT (review finding C) — forged projState column name must throw, never reach SQL ──
  var db3 = new SQL.Database(); EK.initProjection(db3);
  var evilRow = {}; evilRow['id, doc_type) VALUES (1,2); DROP TABLE journal; --'] = 'x';
  await K.commitGroup(db3, [{ op_type: 'SHARD_SNAPSHOT', op_uuid: 'evil-1',
    params: { payload: { op_type: 'SHARD_SNAPSHOT', uuid: 'SNAPSHOT:evil', shardSeq: 1, projState: { documents: [evilRow] } }, actor: 'evil' } }],
    { gid: 'g-evil', baseTs: 5000000 });
  var threw = false, injMsg = '';
  try { EK.replay(db3, new SQL.Database()); } catch (e) { threw = true; injMsg = e.message; }
  verdict(threw && /illegal column name/.test(injMsg), '§T7-INJECT forged projState column REJECTED loudly at replay', injMsg.slice(0, 90));

  K.setSigner(null); K.setContentSigning(false);
  console.log('\n' + (fails === 0 ? '✅ W-T7-INC ALL PASS' : '❌ W-T7-INC ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 W-T7-INC CRASH: ' + (e && e.stack || e)); process.exit(1); });
