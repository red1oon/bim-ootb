// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* time_machine.js — 4D Construction Timeline
   ⏳ toolbar → draggable panel with weighted construction playback.

   Starts fully built. ◀ deconstructs, ▶ builds. << >> jump to start/end.
   DAY/HR/MIN = playback speed AND slider scope.
   Slider drills into where the player stopped:
     DAY → scrub across project days
     HR  → 24 ticks within the stopped day
     MIN → 60 ticks (seconds) within the stopped minute

   Elements have weighted durations from LABOR_RATES productivity.
   Parallel trades: multiple elements active simultaneously.
   Active elements highlighted orange glow, see-through.
   Auto-injects from IFC classes + SEQUENCE_RULES + LABOR_RATES. */

(function() {
  'use strict';
  // <split-driver> (readUnsplit() in viewer/tests/_split_families.js rebuilds the original body here)
  // Body split move-only into tm_core.js, tm_render.js, tm_panel.js, tm_sched_xray.js, tm_gantt_build.js, tm_gantt_edit.js, tm_dash.js, tm_lifecycle_api.js (loaded before this file) by scripts/split_closure.js
  // (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Each part is a generator: phase 1 (to its `yield`) hoists its
  // functions/vars and publishes shared names on TMS; phase 2 runs its original statements, parts in original order.
  var R = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
  var ORDER = ["core","render","panel","sched_xray","gantt_build","gantt_edit","dash","lifecycle_api"];
  var missing = ORDER.filter(function (n) { return typeof R[n] !== 'function'; });
  if (missing.length) { console.warn('§SPLIT_PART_MISSING time_machine ' + missing.join(',')); return; }
  var TMS = {};
  var parts = ORDER.map(function (n) { return R[n](TMS); });
  parts.forEach(function (p) { p.next(); });   // phase 1
  for (var j = 0; j < parts.length; j++) { var r2 = parts[j].next();   // phase 2
    if (r2 && r2.value && r2.value.__splitReturn) return r2.value.value; }   // an early `return` in the original stops the whole setup
  // </split-driver>
})();
