// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-TIMELINE witness (§RESUME NEXT#4(c) — derive a maintenance 4D timeline from
//   PM_Asset, NON-INVENT). Each check NAMES the issue it proves. The load-bearing claim: the 4D schedule is
//   DERIVED from real fields (next_due + pm_cycle), shaped to the viewer's OWN schema so the merged editor can
//   fold it, with every due date traced to the declared cycle and every task bound to a REAL asset element —
//   nothing fabricated. Run: node hr_bim_asset/tests/witness_timeline.js
'use strict';
var fs = require('fs'), path = require('path');
var T = require('../timeline'), M = require('../models'), B = require('../binding');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-TL ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var asset = M.records('Asset')[0];

// T1 — recurrence is DERIVED from pm_cycle, not invented: monthly from 2026-07 over 12mo → 13 occurrences,
//      each exactly one month apart, the FIRST equal to next_due.
var ex = T.expandAsset(asset, { from: asset.next_due, months: 12 });
var dues = ex.occurrences.map(function (o) { return o.due; });
var stepOK = dues.every(function (d, i) { return i === 0 || d === T.addMonths(dues[i - 1], 1); });
ok('T1-derived-recurrence', ex.occurrences.length === 13 && dues[0] === asset.next_due && stepOK,
  'monthly PM from ' + asset.next_due + ' → ' + dues.length + ' occurrences, 1-month step, first==next_due (derived, not invented)');

// T2 — uninterpretable / sub-month cadence → HONEST SKIP (no guessed cadence).
ok('T2-honest-skip', T.expandAsset({ asset: 'X', next_due: '2026-07', pm_cycle: 'whenever' }).skipped
  && T.expandAsset({ asset: 'Y', next_due: '2026-07', pm_cycle: 'weekly' }).skipped
  && !T.expandAsset({ asset: 'Z', next_due: '2026-07', pm_cycle: 'quarterly' }).skipped,
  'unknown/sub-month pm_cycle skipped honestly; a known cadence (quarterly) expands');

// T3 — viewer-schema conformance: schedule + tasks + task_elements + task_sequences with the right columns.
var sch = T.buildSchedule(M.records('Asset'), { from: '2026-07', months: 12, today: '2026-06-30' });
var taskCols = ['task_id', 'schedule_id', 'name', 'start_date', 'finish_date', 'duration_days', 'status'];
var t0 = sch.tasks[0];
ok('T3-schema', sch.schedule.schedule_id && sch.tasks.length === 13 && sch.task_elements.length === 13 && sch.task_sequences.length === 12
  && taskCols.every(function (c) { return t0.hasOwnProperty(c); }),
  'emits the viewer 4D schema (1 schedule · ' + sch.tasks.length + ' tasks · ' + sch.task_elements.length + ' elem-binds · ' + sch.task_sequences.length + ' FS links) — foldable by the merged editor');

// T4 — NON-INVENT: each task is a MILESTONE (duration 0) at the due month floored to '-01'; no fabricated
//      work-length, no fabricated day-of-month.
ok('T4-milestone-noinvent', sch.tasks.every(function (t) { return t.duration_days === 0 && t.start_date === t.finish_date && /-01$/.test(t.start_date); }),
  'every PM task = milestone (duration 0, day floored to -01): only the real datum (due month) is asserted');

// T5 — REAL binding: every task_elements.guid is the asset bim_guid AND that guid is a real HHS element.
var assetGuid = asset.bim_guid, realAsset = FX.assets.filter(function (a) { return a.guid === assetGuid; })[0];
ok('T5-real-binding', !!realAsset && sch.task_elements.every(function (e) { return e.guid === assetGuid; })
  && B.resolveGuid(assetGuid, { assets: FX.assets, rooms: [] }) === false /* rooms-only set rejects it */,
  'PM tasks bind to the asset bim_guid "' + assetGuid + '" = a real HHS ' + (realAsset ? realAsset.ifc_class : 'NONE') + ' (actual geometry)');

// T6 — recurrence-aware status tracks the series: before=ok, on a due month=due, after a due=overdue.
ok('T6-status', T.statusAt(asset, '2026-06').state === 'ok' && T.statusAt(asset, '2026-07').state === 'due'
  && T.statusAt(asset, '2026-08').state === 'due' /* monthly → every month is a due */ && T.statusAt({ asset: 'Q', bim_guid: 'g', next_due: '2026-07', pm_cycle: 'quarterly' }, '2026-08').state === 'overdue',
  'statusAt is recurrence-aware: ok before series, due on an occurrence, overdue after a missed quarterly due');

// T7 — deterministic: same inputs → identical schedule (no Date.now / hidden state).
var a = JSON.stringify(T.buildSchedule(M.records('Asset'), { from: '2026-07', months: 12 }));
var b = JSON.stringify(T.buildSchedule(M.records('Asset'), { from: '2026-07', months: 12 }));
ok('T7-deterministic', a === b, 'two builds with the same inputs → byte-identical schedule (deterministic)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-TL ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
