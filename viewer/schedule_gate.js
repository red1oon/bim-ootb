// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* schedule_gate.js — §gate (2026-05-30, two-pass: geometry + trade order)
 *                     §CREW-CAP (2026-07-18, real-world crew count)
 * Support-gate FALLBACK scheduler for generated 4D (Time Machine) = "synthetic 4D" organised by
 * phase/task, the same shape a captured MS Project / IFC programme would have. Pure + app-agnostic
 * so the browser (time_machine.js) and the Node witness (tests/test_schedule_gate.js) run identical code.
 *
 * TWO RULES, two passes:
 *   PASS A — STRUCTURE (seq<=4), bottom-up by base_z: an element waits for the structure whose XY
 *            footprint overlaps it and whose base is below ("build from below, at this location").
 *            Eliminates floating beams/members/slabs.
 *   PASS B — NON-STRUCTURE (seq>4), by trade then base_z: each item waits for (1) the structure under
 *            its footprint (no floating furniture/MEP) AND (2) the lower trades in its own Level/phase
 *            (so MEP is late and furniture is last, per Level).
 *
 * ε = 0.05m: a support need only start just below me — the thin slab a chair/duct sits on (~0.2m
 * below) counts. (ε=0.5 wrongly skipped it → furniture/flow floated.) Scope: GENERATED fallback only;
 * captured IFC 4D is absorbed verbatim by the overlay AFTER this. No CPM/dependency solving (planner's).
 *
 * §CREW-CAP: user, live on Hospital — "It is an impossible timed Gantt chart to have all such work
 * at once, and within each the items should have a cascading flow." Root cause: the resource-
 * availability key used to be `resource + '|' + Z-band`, giving EVERY distinct 3m Z-slice (~one per
 * floor) its OWN independent, uncapped crew — a 14-storey building spun up 14+ simultaneous
 * STEEL_ERECTOR crews with no shared labor pool, so every level's Superstructure appeared to build
 * in parallel instead of cascading floor-by-floor like a real site. Fixed: a FIXED, small number of
 * crew "slots" per resource (maxCrews param — default MAX_CREWS_DEFAULT if not supplied, or a
 * per-resource lookup object), shared PROJECT-WIDE (not per-band) and shared ACROSS both passes
 * (a resource like CONCRETE_GANG appears in both — foundations in PASS A, ramps in PASS B — real
 * crews don't duplicate across passes). Elements are already processed bottom-up by base_z (PASS A)
 * / by trade-then-base_z (PASS B), so capping crews naturally produces cascading: lower/earlier
 * elements claim the limited crews first, later ones wait for both their structural dependency
 * (geoGate) AND crew availability — exactly the two waits a real site has.
 */
(function (global) {
  'use strict';
  var CELL = 4;     // m — XY grid cell for the spatial support index
  var EPS  = 0.05;  // m — a support must start at least this far below me (excludes same-level peers)
  var GAP  = 0.5;   // m — audit: a support tops within this of my base (the thing I bear on)
  var MAX_CREWS_DEFAULT = 3;  // §CREW-CAP: fallback crew count per resource when no lookup is given

  function cellsOf(e) {
    var o = [], i, j;
    for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o;
  }
  function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }

  // Collapse sub-storeys onto their Level so the phase list stays ~8 (user: "collapsing is better").
  // "Level 3 Ceiling" / "Level 3 TOS" -> "Level 3". Also the JSON phase key + the trade-gate group.
  function collapsePhase(storey) {
    if (!storey) return '_UNKNOWN';
    var s = String(storey).replace(/\s+(Ceiling|TOS|Top of Steel|Soffit|Slab)\b.*$/i, '').trim();
    return s || String(storey);
  }

  // elements: [{ guid, x0,x1,y0,y1, base_z, top_z, seq, storey, resource, installSecs }] (seq<=4 = structure)
  // maxCrews: optional — a plain number (uniform cap for every resource) or a { resource: N } lookup
  //   (e.g. built from LABOR_RATES[resource].max_crews). Falls back to MAX_CREWS_DEFAULT per resource
  //   when omitted or a resource has no entry. Shared PROJECT-WIDE across both passes (not per-band,
  //   not per-Level) — see §CREW-CAP header comment.
  // returns { guid: { start, end } } ms.
  function computeSchedule(elements, baseMs, scaleFactor, maxCrews) {
    baseMs = baseMs || 0; scaleFactor = scaleFactor || 1;
    var grid = {}, out = {}, c, cs, k, arr, S;
    function crewCapFor(resource) {
      if (typeof maxCrews === 'number') return maxCrews;
      if (maxCrews && maxCrews[resource]) return maxCrews[resource];
      return MAX_CREWS_DEFAULT;
    }
    var crews = {};  // resource -> [nextFreeMs, nextFreeMs, ...] (length = that resource's crew cap)
    function claimCrew(resource) {                 // earliest-available of this resource's N crew slots
      var cap = crewCapFor(resource);
      var slots = crews[resource] || (crews[resource] = new Array(cap).fill(baseMs));
      var idx = 0;
      for (var i = 1; i < slots.length; i++) if (slots[i] < slots[idx]) idx = i;
      return { time: slots[idx], commit: function (end) { slots[idx] = end; } };
    }
    function geoGate(el) {                 // latest finish of XY-overlapping structure rising from below
      var g = baseMs; cs = cellsOf(el);
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k];
          if (S.base_z < el.base_z - EPS && S.end > g && overlap(S, el)) g = S.end; } }
      return g;
    }
    function place(el, start) {
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      var end = start + dur; out[el.guid] = { start: start, end: end };
      if (el.seq <= 4) { var rec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, end: end };
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(rec); }
      return end;
    }
    // PASS A — structure, bottom-up by base_z (supports scheduled before what rests on them).
    // §CREW-CAP: crew slot is picked PROJECT-WIDE per resource, not per Z-band — lower floors claim
    // the limited crews first (processing order is already bottom-up), higher floors cascade behind.
    var struct = elements.filter(function (e) { return e.seq <= 4; })
      .sort(function (a, b) { return (a.base_z - b.base_z) || (a.seq - b.seq); });
    struct.forEach(function (el) {
      var slot = claimCrew(el.resource);
      var start = Math.max(geoGate(el), slot.time);
      slot.commit(place(el, start));
    });
    // PASS B — non-structure, by trade then base_z, on the COMPLETED structure grid.
    // Per-Level trade gate: trade k waits for all lower trades (s<k) in its Level → MEP late, furniture last.
    // §CREW-CAP: same shared project-wide crew pool as PASS A (a resource like CONCRETE_GANG appears
    // in both — foundations here, ramps there — real crews don't duplicate across passes).
    var nonst = elements.filter(function (e) { return e.seq > 4; })
      .sort(function (a, b) { return (a.seq - b.seq) || (a.base_z - b.base_z); });
    var phaseTrade = {};
    nonst.forEach(function (el) {
      var ph = collapsePhase(el.storey);
      var pt = phaseTrade[ph] || {}, tg = baseMs, s;
      for (s in pt) if (+s < el.seq && pt[s] > tg) tg = pt[s];
      var slot = claimCrew(el.resource);
      var start = Math.max(geoGate(el), tg, slot.time);
      var end = place(el, start);
      slot.commit(end);
      (phaseTrade[ph] = phaseTrade[ph] || {});
      if (!(phaseTrade[ph][el.seq] > end)) phaseTrade[ph][el.seq] = end;
    });
    return out;
  }

  // Pick the elements assigned to a JSON phase/task. phaseKey = collapsed Level name; optional seq
  // (trade) narrows to a task within the phase. The seam to captured tasks AND to MSP/MSPDI export.
  function elementsInPhase(elements, phaseKey, seq) {
    return elements.filter(function (e) {
      return collapsePhase(e.storey) === phaseKey && (seq == null || e.seq === seq);
    });
  }

  // Independent audit: count elements that start before a TRUE support finishes — structural,
  // XY-overlapping, rising from below (base < base-ε), topping within GAP of the target base.
  // 0 ⇒ nothing floats over its physical support. Works for any class (beams, furniture, MEP…).
  // §4D_ROOF_LOAD_PATH M3 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_ROOF_LOAD_PATH): the support
  // grid used to be built ONLY from seq<=4 (structure) elements — the SAME trade-number assumption
  // the scheduler's PASS A/B split makes. A wall (seq 6) can never be a support in that grid, so a
  // roof slab carried by walls read as floating=0 (nothing to compare against) even while the real
  // schedule built it before the walls under it — the audit shared the defect's own blind spot
  // instead of catching it. Fix, MEASURED through two iterations:
  //   attempt 1 | grid = EVERY element (any class a support for any class) | Hospital floating
  //     0 -> 3421/10979, almost all "IfcBeam floats over IfcWallStandardCase" (1056), "IfcBeam
  //     floats over IfcMember" (191) etc — seq<=4 PASS-A structure held to falsely "float" over
  //     unrelated seq>4 PASS-B trades that finish much later in the crew-capped schedule for reasons
  //     that have nothing to do with this defect. Walls do not structurally carry beams/members/
  //     furniture in this DB.
  //   attempt 2 | grid = structure PLUS walls, offered to every audited IfcSlab | Hospital floating
  //     0 -> 24/10979 — better, but ALL 24 were ORDINARY (non-promoted, still seq 4) floor slabs
  //     comparing themselves against a wall from a DIFFERENT storey that happens to sit geometrically
  //     underneath. An un-promoted floor slab is PASS-A structure; it was never gated on any wall in
  //     the real schedule (PASS A finishes long before PASS B's crew-capped walls even start), so
  //     auditing it against a wall manufactures a violation the scheduler itself never claimed to
  //     avoid.
  //   correct scope | walls are only EVER a real candidate support for a slab M1 itself promoted to
  //     seq 8 (roof role) — that is the one case where the real scheduler also moved the slab into
  //     PASS B and made it wait on walls (§4D_ROOF_LOAD_PATH M2). An ordinary seq<=4 slab keeps its
  //     original structure-only pool, unchanged from the proven pre-fix behaviour.
  function auditFloating(elements, sched, classFilter) {
    var structGrid = {}, wallGrid = {}, i, c, cs, k, arr, S;
    for (i = 0; i < elements.length; i++) { var e = elements[i];
      if (e.seq <= 4) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (structGrid[cs[c]] = structGrid[cs[c]] || []).push(e); }
      else if (e.cls.indexOf('IfcWall') === 0) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(e); } }
    var v = 0;
    for (i = 0; i < elements.length; i++) { var T = elements[i];
      if (classFilter && !classFilter(T)) continue;
      var se = 0, seen = {}; cs = cellsOf(T);
      var pools = (T.cls === 'IfcSlab' && T.seq > 4) ? [structGrid, wallGrid] : [structGrid];
      for (var p = 0; p < pools.length; p++) {
        for (c = 0; c < cs.length; c++) { arr = pools[p][cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { S = arr[k]; if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
            if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
              var en = sched[S.guid].end; if (en > se) se = en; } } }
      }
      if (se > 0 && sched[T.guid].start < se - 1) v++;
    }
    return v;
  }

  var API = { computeSchedule: computeSchedule, collapsePhase: collapsePhase, elementsInPhase: elementsInPhase, auditFloating: auditFloating, CELL: CELL };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
