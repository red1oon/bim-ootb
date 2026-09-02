#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — §PCLOSE-RACE: constructed witness for the TOCTOU shape flagged in
//   feedback_toctou_race_scrutiny_pattern.md against erp_period_close.js closePeriod():
//     1. snapshot = _snapshotLog(db, null)   -- captured BEFORE the archiveSink await
//     2. await archiveSink(snapshot)          -- event-loop yields here
//     3. ckptId = kernel.commitOp(...)        -- boundary MINTED AFTER the await
//     4. db.run('DELETE FROM kernel_ops WHERE id < ckptId')  -- deletes by the POST-await boundary
//   If a real op is committed to kernel_ops DURING the archiveSink await (simulating a concurrent
//   POS sale mid period-close), it gets id < ckptId (since ckptId is minted after) but was NOT in
//   the snapshot (captured before) — so it would be silently deleted, never archived, never replayed.
//   Run: node erp/tests/witness_pclose_race.js 2>&1 | tee build/pclose_race.log
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
require(path.join(ERP, 'erp_period_close.js'));
var K = global.window.KernelOps, PC = global.window.ErpPeriodClose;

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  var SQL = await reqSql()();
  var db = new SQL.Database();

  K.commitOp(db, 'POST', { account: 'A', cents: 1000 });
  K.commitOp(db, 'POST', { account: 'B', cents: -1000 });
  var preRaceCount = db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  console.log('§PCLOSE-RACE-SETUP preRaceCount=' + preRaceCount);

  var raceCommitted = false;
  var raceId = null;
  var archiveSink = function (snapshot) {
    return new Promise(function (resolve) {
      // fire the "concurrent commit" INSIDE the archive await window — a sale landing mid-close.
      if (!raceCommitted) {
        raceCommitted = true;
        raceId = K.commitOp(db, 'POST', { account: 'RACE', cents: 4413 });
        console.log('§PCLOSE-RACE-FIRE committed op id=' + raceId + ' during archiveSink await; snapshot had ' + snapshot.length + ' rows (pre-race)');
      }
      setTimeout(function () { resolve({ ok: true, ref: 'archive-1' }); }, 10);
    });
  };

  var kernel = { sealChain: K.sealChain, verifyChain: K.verifyChain, replayOps: K.replayOps, commitOp: K.commitOp };
  var res = await PC.closePeriod(db, kernel, null, { period: 1, ts: 5000, archiveSink: archiveSink });
  console.log('§PCLOSE-RACE-RESULT compacted=' + res.compacted + ' archived=' + res.archived + ' liveLen=' + res.liveLen + ' ckptTip=' + (res.tip || '').slice(0, 12));

  var survivorRow = db.exec("SELECT id FROM kernel_ops WHERE id=" + Number(raceId));
  var survives = survivorRow.length > 0 && survivorRow[0].values.length > 0;
  verdict(survives, '§PCLOSE-RACE the mid-close concurrent op (id=' + raceId + ') SURVIVES in the hot log', survives ? 'present' : 'MISSING — silently deleted, never archived (signed op vanished)');

  var replay = K.replayOps(db);
  var raceInReplay = replay.some(function (o) { return o.id === raceId; });
  verdict(raceInReplay, '§PCLOSE-RACE the survivor is reachable by replay (fold does not silently drop it)', 'foundInReplay=' + raceInReplay);

  console.log('§PCLOSE-RACE-VERDICT ' + (fails === 0 ? 'PASS (no loss)' : 'FAIL (' + fails + ' — TOCTOU confirmed: concurrent op lost)'));
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('PROBE-ERR', e); process.exit(2); });
