#!/usr/bin/env node
// WITNESS — gantt_bar_is_its_task: the drawn Gantt bar's SPAN, across the real fleet.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 3.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1 — three layers got
// conflated as "witnessed" during the crisis, so every witness now names its own):
//   the DRAWER'S MODEL layer — GanttModel.buildTasks/computeDays, the functions whose output the
//   canvas draws rectangles from. It proves nothing about the persisted kernel_ops table, nothing
//   about the movie's per-element playback, and nothing about pixels actually painted.
//
// ISSUE THIS PROVES OR DISPROVES — user, 2026-08-25: "a human gantt chart maker will easily arrange
// with zero such hell." They were right, and the reason is structural: a human writes ~17 bars and
// assigns elements to them; the drawer did the inverse, deriving each bar's outline as a Tukey fence
// over its member elements. When a task's elements bunch (routine under the crew/CPM solve) the
// fence collapses and the bar becomes a sliver — while the authored window sat UNREAD in the index
// the drawer was already handed (buildTaskIndex puts start/finish on every entry, time_machine.js
// :5295, and buildTasks read only .name).
//
// Measured on HHS_Office_Federated before the fix — 6839 ops, 17 bars, ALL with a real task_id:
//   Superstructure — Roof Level  0.6px vs its own 101.4px window (0.6%)
//   Architecture   — Roof Level  0.6px vs 58.0px (1.0%)
//   Architecture   — Level 3    46.9px vs 202.9px (23.1%), start off by 22.03 days
//   mean absolute start error 5.33 DAYS; 2 bars under 3px
// After: every bar 100.0% of its window, mean start/end error 0.00 days, 0 bars under 3px.
//
// COVERAGE IS DELIBERATE AND NOT LEFT TO JUDGEMENT (§CRISIS LESSON 2): the whole crisis ran on
// witnesses that only ever saw Duplex or 5 synthetic rows, never the building the live bug was on.
// HHS_Office_Federated is REQUIRED here — if it is missing from the fixture set the witness fails
// rather than quietly proving less.
//
// Command: node viewer/tests/witness_gantt_bar_is_its_task.js
'use strict';
const fs = require('fs');
const path = require('path');
const { Witness } = require('../../witness_kit/contract');
const { GanttBarRow } = require('../../witness_kit/schemas/gantt_bars');
const {
  barsMatchTaskWindow, authoredBarsUseTaskSpan, windowCoversWorkContent, barsOrdered, WORK_TOLERANCE
} = require('../../witness_kit/invariants/gantt_bars');
const { generateRealGanttBars } = require('../../witness_kit/generators/gantt_bars');

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const REQUIRED = 'HHS_Office_Federated';   // the building the live defect was reported on
const FIXTURES = ['Duplex', 'Clinic', 'JKR', REQUIRED];

(async () => {
  const present = FIXTURES.filter(b => fs.existsSync(path.join(BLD_DIR, b + '_extracted.db')));
  if (present.indexOf(REQUIRED) < 0) {
    console.log('§WITNESS_GANTT_BAR_IS_ITS_TASK pass=0 fail=1 ran=0 — REQUIRED fixture ' + REQUIRED +
      ' missing from ' + BLD_DIR + '; refusing to report a narrower run as green (§CRISIS LESSON 2)');
    process.exitCode = 1;
    return;
  }

  let rows = [];
  for (const b of present) {
    const r = await generateRealGanttBars(path.join(BLD_DIR, b + '_extracted.db'));
    console.log('§GBT_BUILDING ' + b + ' bars=' + r.length +
      ' fromTask=' + r.filter(x => x.spanFrom === 'task').length +
      ' fromOps=' + r.filter(x => x.spanFrom === 'ops').length +
      ' minWidthPx=' + (r.length ? Math.min.apply(null, r.map(x => x.widthPx)).toFixed(1) : 'n/a'));
    rows = rows.concat(r);
  }

  const authored = rows.filter(r => r.taskId && r.winStart != null);
  const worst = authored.reduce((w, r) => {
    const d = Math.max(Math.abs(r.startTs - r.winStart), Math.abs(r.endTs - r.winEnd));
    return (!w || d > w.d) ? { d, r } : w;
  }, null);
  console.log('§GBT_SCOPE buildings=' + present.length + ' bars=' + rows.length +
    ' authored=' + authored.length + ' thinnestPx=' +
    (rows.length ? Math.min.apply(null, rows.map(r => r.widthPx)).toFixed(1) : 'n/a') +
    ' worstWindowErrorDays=' + (worst ? (worst.d / 86400000).toFixed(3) : 'n/a') +
    (worst && worst.d > 1000 ? ' at=' + JSON.stringify(worst.r.name) : ''));

  // §GBT_WORK — a thin bar is only a defect if its window is shorter than its own members' work.
  // Reported for every bar, gated by windowCoversWorkContent. Pixel width stays in the log as
  // information, deliberately NOT as a gate: 7 of Clinic's 9 one-day windows are honest work.
  const over = rows.filter(r => r.taskId && r.crewDays > r.windowDays * WORK_TOLERANCE)
    .sort((a, b) => (b.crewDays / b.windowDays) - (a.crewDays / a.windowDays));
  console.log('§GBT_WORK overCommittedWindows=' + over.length + '/' + authored.length +
    ' tolerance=' + ((WORK_TOLERANCE - 1) * 100).toFixed(0) + '%');
  over.slice(0, 8).forEach(r => console.log('   ' + r.building + ' ' + JSON.stringify(r.name) +
    ' windowDays=' + r.windowDays.toFixed(2) + ' crewDays=' + r.crewDays.toFixed(3) +
    ' members=' + r.members + ' (' + ((r.crewDays / r.windowDays - 1) * 100).toFixed(0) + '% over)'));

  Witness('gantt_bar_is_its_task')
    .population(() => rows)
    .schema(GanttBarRow)
    .invariant('bars-match-task-window', barsMatchTaskWindow)
    .invariant('authored-bars-use-task-span', authoredBarsUseTaskSpan)
    .invariant('window-covers-work-content', windowCoversWorkContent)
    .invariant('bars-ordered', barsOrdered)
    // RED CONTROL — reproduce the REAL defect, not a synthetic break: put one authored bar back on
    // the ops-derived envelope it used to use. Before the fix every bar looked like this row.
    .redControl(rs => rs.map((r, i) => {
      if (i !== 0 || !r.taskId) return r;
      const collapsed = Object.assign({}, r);
      collapsed.spanFrom = 'ops';
      collapsed.endTs = collapsed.startTs + 120000;   // the 0.6px shape, measured
      collapsed.widthPx = 0.6;
      collapsed.windowDays = 120000 / 86400000;        // and the window no longer covers its own work
      return collapsed;
    }))
    .run();
})().catch(e => { console.error('WITNESS_FAIL', e && e.stack || e); process.exit(1); });
