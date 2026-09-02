// schedule_engine.js — 4D_GANTT_TM_REFACTOR.md's spec: ONE class, ONE method,
// compute(elements, opts) -> ScheduleModel. Wraps ScheduleGate.computeSchedule -> CpmSchedule.run
// (the actual duplicated pair) as the single place "when does each thing get built" is computed.
// Pure function — no DOM, no SQL, no rendering/editor/movie knowledge. `elements` is whatever
// ScheduleAuthor._buildScheduleElements already emits (classification stays exactly where it is,
// not duplicated here) — verified fields, not assumed: guid, cls, name, storey, base_z, top_z,
// x0, x1, y0, y1, seq, phase, resource, installSecs. `opts` is whatever computeSchedule/
// CpmSchedule.run already take today: baseMs, scaleFactor, maxCrews, shiftHours — passed through
// unchanged, not redesigned.
(function (global) {
  'use strict';

  var DAY = 86400000;
  var EDGE_KIND = ['SS', 'FS'];
  // type: 0=member (element->its phase/level milestone), 1=E1 support, 2=E2 host/opening,
  // 3=E3 discipline hammock, 4=E4 storey hammock — verified against cpm_schedule.js's own
  // addEdge() call sites, not assumed.
  var EDGE_TYPE = ['member', 'support', 'hostOpening', 'discipline', 'storey'];

  function compute(elements, opts) {
    opts = opts || {};
    var i;
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate
      : (typeof ScheduleGate !== 'undefined' ? ScheduleGate : null);
    var CPM = (typeof global.CpmSchedule !== 'undefined') ? global.CpmSchedule
      : (typeof CpmSchedule !== 'undefined' ? CpmSchedule : null);
    if (!SG || !CPM) return { ok: false, error: 'ScheduleGate/CpmSchedule not loaded' };
    if (!elements || !elements.length) return { ok: false, error: 'no elements' };

    // Step 1 — raw schedule. ScheduleGate.computeSchedule(elements, baseMs, scaleFactor, maxCrews,
    // shiftHours) -> {guid: {start, end}} in ms, verified by direct read of its own `out[el.guid] =
    // {start: start, end: end}` assignment (schedule_gate.js:559). Does not mutate `elements`.
    var raw = SG.computeSchedule(elements, opts.baseMs, opts.scaleFactor, opts.maxCrews, opts.shiftHours);

    // Step 2 — CpmSchedule.run(items, opts) needs items carrying .s/.e (ms, from step 1 — only the
    // DURATION e-s is actually read past graph construction, per cpm_schedule.js's own §S19 Part B
    // note) and .bz/.tz — cpm_schedule.js's own field names, verified DIFFERENT from
    // computeSchedule's .base_z/.top_z (schedule_gate.js uses base_z/top_z 41x, cpm_schedule.js uses
    // bz/tz 12x, zero overlap) — this rename is a real bridge this class exists to do, not an
    // assumption carried over.
    // §RAW_SCHEDULE_MISS — an element with no computeSchedule entry is dropped, not defaulted, per
    // the existing proven pattern (scripts/probe_cpm_schedule.js:118-123, `if (!st) return null` ->
    // `.filter(Boolean)`). Defaulting it to a synthetic time would invent a schedule for something
    // the raw scheduler explicitly did not place.
    var items = [];
    for (i = 0; i < elements.length; i++) {
      var e = elements[i], r = raw[e.guid];
      if (!r) continue;
      items.push({
        guid: e.guid, cls: e.cls, seq: e.seq, phase: e.phase, storey: e.storey, resource: e.resource,
        x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, bz: e.base_z, tz: e.top_z, s: r.start, e: r.end
      });
    }
    var run = CPM.run(items, { maxCrews: opts.maxCrews });
    if (!run.ok) return { ok: false, error: run.error || 'CpmSchedule.run failed' };

    // Step 3 — assemble ScheduleModel. Primary truth is per-element (spec's own correction: no
    // rollup baked in here — that summarization choice belongs to a future consumer). One clock:
    // day-offset from the solved schedule's own earliest start (extracted from the solve, not
    // invented). `run.solution.times[i]` indexes 1:1 with `items`/`elements` for i < nElements
    // (verified: solve() allocates `times = new Array(n)` where n = graph.nElements, milestones
    // are NOT included in `times`).
    var solvedTimes = run.solution.times, n = run.graph.nElements;
    var projStartMs = Infinity, projEndMs = -Infinity;
    for (i = 0; i < solvedTimes.length; i++) {
      if (solvedTimes[i].s < projStartMs) projStartMs = solvedTimes[i].s;
      if (solvedTimes[i].e > projEndMs) projEndMs = solvedTimes[i].e;
    }
    if (!isFinite(projStartMs)) projStartMs = 0;
    if (!isFinite(projEndMs)) projEndMs = 0;

    var els = new Array(n), taskIndex = {};
    for (i = 0; i < n; i++) {
      var it = items[i], t = solvedTimes[i];
      // Synthetic grouping key — this class is DB-free and has no knowledge of a real materialized
      // task_id (that lives in schedule_author.js's own table, a separate concern). A future wiring
      // stage reconciles this key to a real task identity if one is needed; not invented here.
      var taskId = it.phase + '||' + it.storey + '||' + (it.resource || '_DEFAULT');
      els[i] = { guid: it.guid, phase: it.phase, storey: it.storey, resource: it.resource,
                 start: (t.s - projStartMs) / DAY, end: (t.e - projStartMs) / DAY, taskId: taskId };
      var tk = taskIndex[taskId] || (taskIndex[taskId] = { id: taskId, phase: it.phase,
        storey: it.storey, resource: it.resource, name: taskId, guids: [] });
      tk.guids.push(it.guid);
    }

    // Milestones (phase/level completion gates, dur 0, synthetic — cpm_schedule.js's own
    // `msMeta[k] = {level, phase}` for node index n+k) are real DAG nodes, not WBS tasks. E3/E4 —
    // the storey/phase hammock edges, the actual precedence backbone for "staggered by trade and
    // level" — originate FROM these nodes (verified: addEdge(milestone(...), succ[k], FS, 3, 'e3')
    // and addEdge(m, succ[k], FS, 4, 'e4') in cpm_schedule.js). Excluding milestone-sourced edges
    // would silently drop E3/E4 entirely from the output — so milestones get a synthetic id here
    // and stay first-class dependency endpoints, not flattened into element-to-element pairs (which
    // would combinatorially explode for a milestone feeding/gating thousands of elements).
    var milestones = run.graph.msMeta.map(function (m, k) {
      return { id: 'MS:' + m.level + '||' + m.phase, level: m.level, phase: m.phase };
    });
    function nodeId(idx) { return idx < n ? items[idx].guid : milestones[idx - n].id; }

    // Dependencies — CpmSchedule.run's own graph edges, translated from node index to guid/
    // milestone id. Dropped edges (solve()'s cycle-breaking, mutated in place onto the same edge
    // objects) are excluded — they were NOT enforced, including them would misrepresent what
    // actually ran. This engine has NO lag concept: verified by reading solve()'s own edge
    // relaxation (`var b = e.kind === FS ? ef : ES[u];`) — no lag term exists anywhere in it, every
    // edge is a hard zero-lag constraint. lag:0 states that fact; it is not a placeholder for
    // missing data.
    var deps = [];
    for (var u = 0; u < run.graph.out.length; u++) {
      var edges = run.graph.out[u];
      if (!edges) continue;
      for (var k = 0; k < edges.length; k++) {
        var ed = edges[k];
        if (ed.dropped) continue;
        deps.push({ from: nodeId(u), to: nodeId(ed.to), kind: EDGE_KIND[ed.kind],
                    edgeType: EDGE_TYPE[ed.type], lag: 0 });
      }
    }

    return {
      ok: true,
      elements: els,
      tasks: Object.keys(taskIndex).map(function (k) { return taskIndex[k]; }),
      milestones: milestones,
      dependencies: deps,
      projectStart: 0,
      projectEnd: (projEndMs - projStartMs) / DAY,
      // No critical-path ids: CpmSchedule.run is a forward-only earliest-start solve — no backward
      // pass / float computation exists anywhere in the current engine (verified: solve() never
      // computes a late-start or float value). Omitted rather than invented; a future stage would
      // need to ADD that computation, not just expose it.
      criticalPathIds: null,
      // Reachability/evidence — which real functions this call actually exercised, per this
      // project's own standing rule (a probe must prove its call path, not just its behavior).
      _via: { computeSchedule: true, cpmScheduleRun: true, floating: null }
    };
  }

  var API = { compute: compute };
  global.ScheduleEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
