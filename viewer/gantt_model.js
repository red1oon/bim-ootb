// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* gantt_model.js — the Gantt DRAWER'S MODEL, extracted verbatim from time_machine.js
 * (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S52.4 item F3, spec'd in §S53).
 *
 * WHY THIS FILE EXISTS. Two reasons, both measured, neither cosmetic:
 *   1. time_machine.js was 9,259 lines — 60% of the whole 4D surface (§S52.2). The bar model is a
 *      self-contained, side-effect-free computation sitting inside a file that is otherwise state
 *      and DOM; it does not need to be there.
 *   2. witness_midair_zero.js could not test the drawer's rules without either slicing them out of
 *      time_machine.js BY SOURCE TEXT (`_tukeyBound`, :139 — a slice that has already silently
 *      widened once, §S20) or RE-IMPLEMENTING them (§S51_SCREEN mirrored buildGanttTasks' grouping;
 *      §S51_RESIDUE re-derived §GANTT_ROW_ORDER's phase order). A mirrored judge is the
 *      §S25_REVIEW.1 failure class one step removed: the drawer's rule changes, the witness keeps
 *      measuring the old rule, and stays green. Now the witness calls THIS.
 *
 * CONTRACT: pure functions only. No module state, no TM variable, no DOM, no console side effects.
 * The caller (time_machine.js) owns the state assignment, the dirty-flag gate and the §-log lines —
 * this file computes and returns. Same dual-mode convention as cpm_schedule.js / lib/level_deriver.js.
 *
 * NOTHING HERE IS NEW. Every rule and every comment moved verbatim from time_machine.js; the WHY
 * stays attached to the rule it explains, because in this lane the comments ARE the provenance.
 */

(function (global) {
  'use strict';

  // §TUKEY_BOUND (4D_GANTT_TM_REFACTOR.md stage 2, 2026-08-17) — hoisted out of _tmDisplayRemap
  // (was a nested closure there) so buildGanttTasks() can share the SAME envelope math instead of
  // re-deriving its own. This is the proven, already-shipped, already-measured rule (Hospital
  // floating 664->63, window fidelity 97.03%->99.95% when this landed for §ZONE_WINDOW_DAGWINS_CLIP)
  // — uniform at every group size, no group-size branch, no cliff. Percentile convention matches
  // storeyOrderReport/§GANTT_GAP_CLAMP: sorted[Math.floor(n*p)], no interpolation.
  function tukeyBound(arr, lowSide) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var n = s.length, q1 = s[Math.floor(n * 0.25)], q3 = s[Math.floor(n * 0.75)], iqr = q3 - q1;
    return lowSide ? Math.max(s[0], q1 - 1.5 * iqr) : Math.min(s[n - 1], q3 + 1.5 * iqr);
  }

  // §GANTT_ROW_ORDER (K1, 2026-08-04) — user report: "are you using any 4D convention used by P6 on
  // gantt phase/task ordering? Last session was a mess putting substructure which has above ground
  // appearing first." Correct answer at the time: we followed NO convention. Rows were sorted purely
  // by `a.startTs - b.startTs`, so whichever zone happened to compute earliest floated to the top and
  // a phase's floors appeared interleaved with other phases' — arbitrary, and unreadable as a
  // construction programme.
  //
  // P6/MSP order rows by WBS path, THEN by early start. Our WBS is (phase → floor): the zone
  // decomposition materializeZones already persists. So: phase in real construction sequence first,
  // then start time within the phase (which tracks bottom-up floor order, because the engine builds
  // floors bottom-up). Falls back to alphabetical for any phase outside the canonical list rather
  // than silently bucketing it at position 0.
  //
  // ⚠ DERIVED FROM SEQUENCE_RULES, NEVER HARDCODED — and this matters, it is not tidiness.
  // The first draft of this fix copied the order out of _VAR_ORDER (~time_machine.js:4238) and was
  // WRONG: that array still reads Substructure/Superstructure/MEP Rough-in/Architecture/…, i.e. MEP
  // rough-in BEFORE the building envelope — the exact backwards discipline PR #1165 fixed in
  // SEQUENCE_RULES and across all 18 rate-template sources. _VAR_ORDER is a THIRD stale copy that
  // #1165 missed (the two known-stale PHASE_ORDER arrays in time_machine.js are the other two). The
  // real engine order, read from SEQUENCE_RULES' own sequence numbers, is:
  //   Substructure(1) → Superstructure(2) → Architecture(5) → MEP Rough-in(7) → MEP Final(9) → Finishes(10)
  // Deriving it kills this whole class of drift: the drawer cannot disagree with the engine again.
  var FALLBACK_PHASE_ORDER = ['Substructure', 'Superstructure', 'Architecture', 'MEP Rough-in',
                              'MEP Final', 'Finishes'];

  function phaseOrder(seqRules) {
    var SR = seqRules || (typeof global !== 'undefined' && global.SEQUENCE_RULES) || null;
    if (SR) {
      var minSeq = {};
      for (var k in SR) {
        var r = SR[k]; if (!r || !r.phase || r.sequence == null) continue;
        if (minSeq[r.phase] == null || r.sequence < minSeq[r.phase]) minSeq[r.phase] = r.sequence;
      }
      var ks = Object.keys(minSeq);
      if (ks.length) return ks.sort(function (a, b) { return minSeq[a] - minSeq[b]; });
    }
    // Fallback only when SEQUENCE_RULES has not loaded — matches the derived order above.
    return FALLBACK_PHASE_ORDER.slice();
  }

  // §S51 item d (PR #1444) — the drawer groups bars BY THE SCHEDULE'S OWN CELLS. Precedence, in
  // order: a real authored task id (exact, by guid) → the cell stamp the cell-path engine wrote →
  // the un-authored storey|phase fallback. Ops with no task stay non-editable.
  function groupKeyOf(taskId, cellId, storey, phase) {
    return taskId ? ('T:' + taskId)
         : (cellId ? ('C:' + cellId) : (storey + '|' + phase));
  }

  // buildTasks() — the storey|phase rollup, task-identity-aware (K0). Grouping key is the REAL
  // task_id whenever the op's guid resolves through task_elements, so each resulting bar carries
  // `taskId` and is addressable by moveTask/resizeTask/addDependency.
  //   ops       — the FULL mixed kernel_ops history (this function does the ELEMENT_PLACE filter
  //               itself; see §GANTT_OPS_BOOKKEEPING_LEAK below for why it must).
  //   idx       — buildTaskIndex() output: { guidTask: {guid:taskId}, tasks: {taskId:{name}} } or null.
  //   seqRules  — SEQUENCE_RULES (optional; falls back to global.SEQUENCE_RULES then the list above).
  // Returns { tasks, identified, unidentified } — the caller assigns them, this returns them.
  function buildTasks(ops, idx, seqRules) {
    var groups = {};
    var _idN = 0, _noIdN = 0;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      // §GANTT_OPS_BOOKKEEPING_LEAK: a non-construction op (BUILDING_OPEN, ELEMENT_PICK, GRID_*, ...)
      // is not a task and must not become a bar — see computeDays()'s own header comment for the
      // traced mechanism. _ops itself stays the full mixed history for other consumers (copyGuids).
      if (op.op_type !== 'ELEMENT_PLACE') continue;
      var p = op.parameters || {};
      var storey = p.storey || '_UNKNOWN';
      var phase = p.phase || 'Architecture';
      // Real task identity first (exact, by guid); then §S51's cell stamp (the schedule's own
      // grain, present only on cell-path generations); storey|phase only as the un-authored
      // fallback — graph-path buildings and pre-§S51 ops group exactly as before.
      var tid = idx && op.output_guid ? idx.guidTask[op.output_guid] : null;
      if (tid) _idN++; else _noIdN++;
      var cellId = (!tid && p._cell) ? String(p._cell) : null;
      var key = groupKeyOf(tid, cellId, storey, phase);
      if (!groups[key]) groups[key] = { storey: cellId ? (cellId.split('\u00b7')[2] || storey) : storey,
        phase: phase, cell: cellId || null, taskId: tid || null,
        taskName: tid && idx.tasks[tid] ? idx.tasks[tid].name : null,
        starts: [], ends: [], count: 0, cap: 0, guids: [] };
      var g = groups[key];
      g.starts.push(op.start_ts);
      g.ends.push(op.end_ts);
      g.guids.push(op.output_guid);   // W1 needs the member set to re-time an edited bar
      g.count++;
      if (p._captured) g.cap++;   // §gate: captured = preset IFC 4D (verbatim) — drives the yellow frame
    }

    // §GANTT_MINI_TRIM (2026-08-17, 4D_GANTT_TM_REFACTOR.md stage 2 — REPLACES the 2026-07-18
    // 2nd-98th-percentile-above-n20/true-min-max-below rule). The old rule's cliff at n=20 was
    // measured live to be exactly the mechanism behind "one pile, full project length": most
    // phase|storey groups are small (many storeys x 6 phases), so most bars got NO trim at all —
    // one mistagged/outlier element (this project's own numbers show non-zero outliers on every
    // building, by design) was enough to stretch an untrimmed small group's bar to cover it.
    // Fix: the SAME Tukey-fence envelope §ZONE_WINDOW_DAGWINS_CLIP already uses for task-window
    // authoring (tukeyBound above) — uniform at every group size, no cliff, no new tuned constant
    // (reuses the exact proven formula, not a fresh invention).
    // Members outside the fence still exist in the underlying data (§TIER_DAG_WINS doctrine:
    // counted, never hidden) — they just don't get to single-handedly define the bar's span.
    // §GANTT_BAR_IS_ITS_TASK (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 3)
    // — an AUTHORED bar's span is its TASK'S OWN WINDOW, not a statistical envelope over the elements
    // that happen to be in it.
    //
    // The defect this closes, measured on HHS_Office_Federated (6839 ops, 17 bars, ALL of them
    // carrying a real task_id — probe_bar_vs_task.js, §BVT_*):
    //   Superstructure — Roof Level   drawn   0.6px  vs its own task's 101.4px  =   0.6% of its window
    //   Architecture   — Roof Level   drawn   0.6px  vs                 58.0px  =   1.0%
    //   Architecture   — Level 3      drawn  46.9px  vs                202.9px  =  23.1%, start off 22.03d
    //   mean absolute start error across all 17 bars: 5.33 DAYS.
    // The window was never unknown — buildTaskIndex already puts `start`/`finish` on every entry of
    // idx.tasks (time_machine.js:5295) and this function read only `.name` from it. So the drawer
    // computed a worse answer than the one it was already holding.
    //
    // WHY THE TUKEY ENVELOPE IS WRONG HERE, specifically: it is a fence over the MEMBERS. When a
    // task's elements bunch (which the CPM/crew solve makes routine — one storey's steel goes up in a
    // burst inside a window sized for the whole storey), the fence collapses onto the bunch and the
    // bar becomes a sliver, while the real authored task is weeks long. That is the "tiny bars,
    // stacked" shape, and NO element-level fix can reach it: the bar's geometry simply wasn't derived
    // from the schedule. §S65's own §TPL_ZERO_MINUTE template fix moved 1217 zero-width elements to
    // 114 and did not change this at all, because this is a different layer.
    //
    // UN-AUTHORED groups (no task_id — the storey|phase and cell fallbacks) keep the Tukey rule
    // EXACTLY as before: there is no window to prefer, and those buildings must not shift. The
    // fallback also still applies to an authored task whose dates are missing/unparseable — never
    // invent a span, fall back to the measured one.
    var tasks = [];
    var _fromWin = 0, _fromOps = 0;
    for (var k in groups) {
      var gg = groups[k];
      var win = (gg.taskId && idx && idx.tasks && idx.tasks[gg.taskId]) ? idx.tasks[gg.taskId] : null;
      var ws = win && win.start != null ? Date.parse(win.start) : NaN;
      var we = win && win.finish != null ? Date.parse(win.finish) : NaN;
      if (isFinite(ws) && isFinite(we) && we > ws) {
        gg.startTs = ws; gg.endTs = we; gg.spanFrom = 'task'; _fromWin++;
      } else {
        gg.startTs = tukeyBound(gg.starts, true);
        gg.endTs = Math.max(tukeyBound(gg.ends, false), gg.startTs);   // degenerate-group safety (n=1)
        gg.spanFrom = 'ops'; _fromOps++;
      }
      // The member ops stay available as the bar's FILL/progress extent — the elements are not
      // hidden, they are just no longer allowed to define the bar's outline (§TIER_DAG_WINS
      // doctrine: counted, never hidden).
      gg.opsStartTs = tukeyBound(gg.starts, true);
      gg.opsEndTs = Math.max(tukeyBound(gg.ends, false), gg.opsStartTs);
      delete gg.starts; delete gg.ends;
      tasks.push(gg);
    }

    var ORDER = phaseOrder(seqRules);
    function _phaseRank(p2) {
      var i2 = ORDER.indexOf(p2);
      return i2 < 0 ? ORDER.length : i2;      // unknown phases sort after the known ones
    }
    tasks.sort(function (a, b) {
      var pa = _phaseRank(a.phase), pb = _phaseRank(b.phase);
      if (pa !== pb) return pa - pb;
      if (pa === ORDER.length && a.phase !== b.phase) return a.phase < b.phase ? -1 : 1;
      return (a.startTs - b.startTs) || (a.storey < b.storey ? -1 : a.storey > b.storey ? 1 : 0);
    });

    return { tasks: tasks, identified: _idN, unidentified: _noIdN,
             spanFromTask: _fromWin, spanFromOps: _fromOps };
  }

  // computeDays() — the day ladder and BOTH time axes, from the ELEMENT_PLACE ops only.
  // Returns { days, projectStart, projectEnd, axisStart, axisEnd, n }; the caller assigns them.
  //
  // §GANTT_AXIS_OUTLIER (2026-08-04, prompts/4D_SCHEDULE_PERFECTION.md) — axisStart/axisEnd are
  // SEPARATE from projectStart/projectEnd on purpose: those two remain the real, unqualified
  // playback bounds (renderAtTime, scrubbing, "every element must eventually build" — Prime Rule,
  // do not touch). The axis pair is the DISPLAY axis for the Gantt drawer only.
  // §GANTT_AXIS_COVERS_TASKS (2026-08-25, §S65 STAGE 3) — `taskWins` is the optional list of real
  // authored task windows ({start,finish} strings, i.e. idx.tasks' values). Since buildTasks() now
  // draws an authored bar at its TASK'S span rather than at its elements' Tukey envelope, a bar can
  // legitimately end LATER than the Tukey-qualified op axis — and would then be drawn past the right
  // edge of the chart. So the display axis is widened to cover every real window. This does NOT
  // touch projectStart/projectEnd (the true playback bounds, Prime Rule) and it is still never an
  // invention: a task window is real persisted schedule data, exactly like an op timestamp.
  // Callers that omit taskWins are byte-identical to before.
  function computeDays(placeOps, taskWins) {
    var cOps = placeOps;
    var seen = {};
    cOps.forEach(function (op) {
      var d = new Date(op.start_ts);
      var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      if (!seen[key]) seen[key] = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    });
    var out = { days: Object.values(seen).sort(function (a, b) { return a - b; }),
                projectStart: null, projectEnd: null, axisStart: null, axisEnd: null, n: cOps.length };
    if (cOps.length) {
      // projectStart = 1ms BEFORE first op so ⏪ = truly empty (no frontier)
      out.projectStart = cOps[0].start_ts - 1;
      out.projectEnd = Math.max.apply(null, cOps.map(function (o) { return o.end_ts; }));
    }
    // §GANTT_AXIS_OUTLIER — qualified DISPLAY axis. Was its own copy of the 2nd-98th-percentile-
    // above-n20/true-max-below cliff §GANTT_MINI_TRIM used to use per-bar (buildGanttTasks) — the
    // SAME broken rule, applied here to the GLOBAL population of end_ts that defines the whole
    // chart's axis instead of one bar's span. Stage 2 (4D_GANTT_TM_REFACTOR.md) fixed the per-bar
    // copy but not this one — a bar's DATA could be correct while its DRAWN pixel position was
    // still wrong, because the axis it's scaled against was still cliff-computed. Fixed here the
    // same way: the shared tukeyBound — uniform at every population size, no cliff, no new tuned
    // constant, reuses the exact proven formula. Never exceeds the true max (tukeyBound's own
    // Math.min(s[n-1], ...) clamp), so this stays a qualification of the real data, never an
    // invention beyond it.
    out.axisStart = out.projectStart;   // starts are not the observed problem; leave unqualified
    out.axisEnd = cOps.length
      ? tukeyBound(cOps.map(function (o) { return o.end_ts; }), false)
      : out.projectEnd;
    // §GANTT_AXIS_COVERS_TASKS — widen to cover every authored window, so no authored bar is drawn
    // off the right edge of its own axis.
    if (taskWins) {
      for (var wk in taskWins) {
        var w = taskWins[wk]; if (!w) continue;
        var ws = w.start != null ? Date.parse(w.start) : NaN;
        var we = w.finish != null ? Date.parse(w.finish) : NaN;
        if (isFinite(ws) && (out.axisStart == null || ws < out.axisStart)) out.axisStart = ws;
        if (isFinite(we) && (out.axisEnd == null || we > out.axisEnd)) out.axisEnd = we;
      }
    }
    return out;
  }

  var API = { tukeyBound: tukeyBound, phaseOrder: phaseOrder, groupKeyOf: groupKeyOf,
              buildTasks: buildTasks, computeDays: computeDays,
              FALLBACK_PHASE_ORDER: FALLBACK_PHASE_ORDER };
  global.GanttModel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
