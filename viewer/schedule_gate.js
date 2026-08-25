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
  // §SUPPORT_UNCHECKED — 4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11 (1a), Witness:
  // witness_big_element_support_coverage.js. "Big element" bbox-volume cutoff = the MEASURED p95 of
  // bbox_x*bbox_y*bbox_z across 135,630 real elements in the 5 shipped buildings
  // (Terminal/Hospital/Duplex/HHS/Clinic, extraction logged 2026-08-11; p99 was 11.808 m³ — same
  // class mix, less coverage). EXTRACTED, not invented — do not retune without re-measuring.
  var BIG_ELEMENT_VOL = 1.556;  // m³
  var MAX_CREWS_DEFAULT = 3;  // §CREW-CAP: fallback crew count per resource when no lookup is given
  // ══ §ARCH_START_TEMPO / M1 — THE 8-HOUR CREW DAY (2026-08-12) ═══════════════════════════════
  // `el.installSecs` is 28800/productivity — 28800 s IS one 8-hour crew-day (schedule_author.js
  // _installSecs line 71, and its own phase widths already divide by `28800 * maxCrews`). But
  // place() below spent those seconds as PURE CONTINUOUS WALL-CLOCK ms: nothing capped how many of
  // them could land inside one calendar day, so a crew that ran out of one day's quota simply
  // started the next day's work in the same day's hour 9. Effective model: every crew works 24 real
  // hours, non-stop, forever — 3x the shift the productivity table is quoted in.
  // MEASURED (Terminal Substructure): 236 IfcSlab x 822.9 s / 3 CONCRETE_GANG crews = 64,732 s =
  // 0.75 wall-clock days, and the probe reported Substructure=[0.0..0.8]d. On a real 8-h shift the
  // same labour is 2.25 days — exactly 24/8, structural, not a coincidence.
  //
  // THE FIX, at the ONE layer every gate and every crew slot already funnels through: a crew's clock
  // is kept in PRODUCTIVE ms and mapped to wall-clock ms for storage. Each calendar day donates
  // SHIFT_MS productive ms; the remaining 16 h are idle for that crew and the work rolls over to the
  // START of the next day's window — never lost, never double-counted, and a `dur` longer than one
  // window consumes as many following windows as it needs (toWall's floor/mod does that by
  // construction, no per-day loop).
  //
  // WHAT DOES NOT CHANGE, deliberately: the calendar stays 24/7 — no weekend, no holiday, work may
  // start or continue on ANY day. That settled ruling is about not SKIPPING days; this is about the
  // length of a day's shift, which it never spoke to.
  // Because toWall is strictly increasing and toProductive is its exact left inverse on every time
  // this module produces, the whole generative schedule is toWall(old schedule): every gate max,
  // every ordering and every start<end comparison is preserved element-for-element. Only the
  // wall-clock SPAN grows (~3x on crew-bound phases) — which is the fix.
  var SHIFT_MS = 8 * 3600 * 1000;    // productive ms one crew can spend in one calendar day
  var DAY_MS   = 24 * 3600 * 1000;   // the calendar day the film advances through (24/7, unchanged)
  // toProductive(t, base): wall-clock ms -> productive ms elapsed for a crew since `base`.
  // toWall(p, base): the inverse. toProductive(toWall(p)) === p for every p >= 0, so a duration can
  // be recovered from a stored [start,end] pair without carrying it alongside (the repair loop).
  function toProductive(t, base) {
    var off = t - base; if (off <= 0) return 0;
    var d = Math.floor(off / DAY_MS), r = off - d * DAY_MS;
    return d * SHIFT_MS + (r < SHIFT_MS ? r : SHIFT_MS);
  }
  function toWall(p, base) {
    if (p <= 0) return base;
    var d = Math.floor(p / SHIFT_MS), r = p - d * SHIFT_MS;
    return base + d * DAY_MS + r;
  }
  // ══ §HOSTED_BEFORE_HOST (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ═══════════
  // The class sets and the ±HOST_Z bracket below are NOT new: they are verbatim the host inference
  // that bim-compiler scripts/probe_arch_start.js measured the defect with (§HOSTED_BEFORE_HOST),
  // so the scheduler now enforces exactly the predicate the witness asserts — one rule, every
  // consumer, the same discipline §HANG_NEAREST follows. IFC ships no host link for these elements
  // (no IfcRelVoidsElement/host column exists in the shipped extracted DBs — same fact
  // §DOOR_WINDOW_HOST_WALL records), so the host is inferred geometrically and nothing is invented.
  var HOSTED_CLS = /^(IfcOutlet|IfcLightFixture|IfcSwitchingDevice|IfcSensor|IfcAlarm|IfcFlowTerminal|IfcAirTerminal|IfcElectricAppliance|IfcFireSuppressionTerminal)$/;
  var HOST_CLS   = /^(IfcWall|IfcWallStandardCase|IfcSlab|IfcRoof|IfcCovering|IfcCurtainWall)$/;
  // ══ §CURTAIN_WALL_OPENING (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ═════════
  // User, live: HHS_Office_Federated Level 3 doors float — visible before their host wall exists.
  // MEASURED (bim-compiler scripts/probe_door_wall.js, the file §DOOR_WINDOW_HOST_WALL below cites
  // but which was never actually committed until today): openingGate holds PERFECTLY where it
  // applies — rawEARLY=0.0% against wallGrid on all 7 shipped buildings. The defect is COVERAGE, not
  // the predicate: 34 of HHS's 133 openings (25.6%) have ZERO wallGrid candidate, because place()
  // fills wallGrid from `cls.indexOf('IfcWall') === 0` and HHS's façade is a CURTAIN WALL, whose
  // openings are framed by parts that are not prefixed IfcWall at all. openingGate therefore fell
  // straight through to baseMs for them and they were ungated from day 0 — the same shape of bug as
  // §HOSTED_BEFORE_HOST's IfcCovering (a real class in NO pool), one layer over.
  //
  // The classes are EXTRACTED from the data, never guessed — HHS's own element_name column names
  // them: IfcCurtainWall = "Curtain Wall:Standard" (the assembly), IfcPlate = "Systemelement:
  // Verglasung" (glazing infill), IfcMember = "Rechteckiger Pfosten:6 x 15 mit Deckprofil"
  // (rectangular mullion). That is the standard IFC curtain-wall decomposition, and it is the ONLY
  // representation available: the shipped DBs carry no IfcRelAggregates/IfcRelFillsElement (checked
  // — spatial_structure holds only IfcBuildingStorey/IfcSpace, and no IfcPlate/IfcMember has a
  // parent row), so the assembly exists solely as its geometric parts. Note IfcCurtainWall itself
  // has ZERO geometry rows in HHS — it is a pure container — which is exactly why gating on the
  // assembly class alone would have been a no-op and the parts are what must be indexed.
  //
  // Why these parts are invisible to every OTHER gate, and it is one fact: IfcMember is seq 3 and
  // IfcPlate seq 4, so both live in the STRUCTURE grid, where geoGate only tests bearing-below
  // (S.base_z < el.base_z - EPS) or contained-in-my-lower-half. A full-height mullion beside a door
  // starts at the SAME floor level as the door, so it satisfies neither — a door cut into a curtain
  // wall is a SIDEWAYS relationship, precisely the one §DOOR_WINDOW_HOST_WALL was written for, and
  // the only reason it was missed is that the pool it reads is keyed on a class-name prefix.
  var CW_HOST_CLS = /^(IfcCurtainWall|IfcPlate|IfcMember)$/;
  var HOST_Z     = 1.0;  // m — hosted centre must sit within the host's Z extent ± this (probe's measured bracket)
  // ONE host-inference definition at module scope, three consumers: computeSchedule's hostGate, its
  // DAG edge, and time_machine.js's display-layer repair (exported as hostPairs below, the same
  // reason EPS/GAP are exported — "a second copy is a second thing to drift").
  // Nearest bracketing host: among hosts whose bbox spans the hosted element's own XY cell and whose
  // Z extent brackets its centre (±HOST_Z), the one nearest in XY. Verbatim probe_arch_start.js.
  // isHosted needs no wall/slab guard — HOSTED_CLS ∩ HOST_CLS = ∅ by construction, which is also
  // what makes a hosted element a pure DAG sink (see the host edge's cycle argument).
  function isHosted(el) { return HOSTED_CLS.test(el.cls || '') && el.seq > 4; }
  function hostCellKey(el) {
    return Math.floor((el.x0 + el.x1) / 2 / CELL) + ',' + Math.floor((el.y0 + el.y1) / 2 / CELL);
  }
  function nearestHostAt(el, list, els) {   // list: indices into els
    var cx = (el.x0 + el.x1) / 2, cy = (el.y0 + el.y1) / 2, cz = (el.base_z + el.top_z) / 2;
    var bi = -1, bd = Infinity, q, H, d;
    for (q = 0; q < list.length; q++) {
      H = els[list[q]];
      if (H.guid === el.guid) continue;
      if (cz < H.base_z - HOST_Z || cz > H.top_z + HOST_Z) continue;   // not at this host's height
      d = Math.abs((H.x0 + H.x1) / 2 - cx) + Math.abs((H.y0 + H.y1) / 2 - cy);
      if (d < bd) { bd = d; bi = q; }
    }
    return bi;
  }
  // hostPairs(els) -> [{ i, h }] index pairs into els (i = hosted, h = its inferred host).
  // els: [{ guid, cls, seq, x0,x1,y0,y1, base_z, top_z }]. Pure geometry — no timing read, so a
  // caller can pair once and then compare whatever stage of the timeline it owns.
  function hostPairs(els) {
    var idx = {}, out = [], t, cs, c, e, k, bi;
    // §S58 (§S58.1b): §HOSTED_BEFORE_HOST had NO log line anywhere — it is the fix for the reported
    // "outlets and hanging elements appearing a bit early" bug, and §GEO_ORDER reported only
    // hostEdges= (matches found), with no denominator and no count of hosted elements that fell
    // through UNGUARDED to baseMs. Its own sibling §CURTAIN_WALL_OPENING already reports
    // cwGated=/stillUngated=; this is the same shape. Counted here, reported by the caller.
    var _hostedTotal = 0, _noCell = 0, _noNearest = 0;
    for (t = 0; t < els.length; t++) { e = els[t];
      if (!HOST_CLS.test(e.cls || '')) continue;
      cs = cellsOf(e); for (c = 0; c < cs.length; c++) (idx[cs[c]] = idx[cs[c]] || []).push(t); }
    for (t = 0; t < els.length; t++) { e = els[t];
      if (!isHosted(e)) continue;
      _hostedTotal++;
      k = idx[hostCellKey(e)]; if (!k) { _noCell++; continue; }
      bi = nearestHostAt(e, k, els);
      if (bi >= 0) out.push({ i: t, h: k[bi] }); else _noNearest++;
    }
    out.census = { hostedTotal: _hostedTotal, matched: out.length,
                   fellThroughNoHostCell: _noCell, fellThroughNoNearest: _noNearest };
    return out;
  }

  function cellsOf(e) {
    var o = [], i, j;
    for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o;
  }
  function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
  // ══ §GROUNDWORK_SLAB (2026-08-16, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S9 / M5 v4) ═══
  // groundworkSlabs(els) -> { guid: 1 } for every IfcSlab/IfcBeam currently classified
  // Superstructure that is GROUNDWORK, not deck/frame. Two membership routes, both extracted:
  //  (a) ZERO structural bearings (slab-on-grade over soil): joins iff its 3m z-band (the shipped
  //      §GANTT quantum) equals the LOWEST band among the candidate classes themselves (IfcSlab/
  //      IfcBeam Superstructure — NOT all Superstructure: measured live, 3 stray IfcColumn bases
  //      one band below Terminal's plate voided every candidate, and band quantization shifts
  //      between z-datums; keying on the candidate population is frame-invariant).
  //  (b) HAS structural bearings: FIXPOINT — joins when every structure-pool bearing-below contact
  //      (seq<=4 / IfcWall* / promoted slab / stair flight — the module's own bearing definition;
  //      under-slab MEP never counts, a pipe cannot bear a slab) is Substructure-phase or already
  //      a member. Grade beams join first (they bear on piles/footings), the plate joins next
  //      (piles + grade beams), toppings join off the plate. A deck slab bears on frame beams and
  //      a frame beam on columns — columns are not candidates, so neither ever joins.
  // The SEQUENCE_RULES class defaults (IfcBeam seq 3 / IfcSlab seq 4, Superstructure) are FRAME
  // logic, right for upper floors — groundwork sequenced by them appears with the steel all round
  // it, the user-reported symptom. Same shared-pure-function status as hostPairs: one definition,
  // both element recipes call it, so zone authoring, task bars, milestones (E3's existing
  // Substructure→Superstructure chain then orders groundwork-before-frame with zero solver
  // changes) and the movie stay one truth. Pure geometry — no timing read.
  function groundworkSlabs(els) {
    var out = {}, idx = {}, t, e, cs, c, k, S;
    function isStructBearing(s2) {
      return s2.seq <= 4 || (s2.cls && s2.cls.indexOf('IfcWall') === 0) ||
             (s2.cls === 'IfcSlab' && s2.seq > 4) || s2.cls === 'IfcStairFlight';
    }
    function isCand(e2) {
      return (e2.cls === 'IfcSlab' || e2.cls === 'IfcBeam') && e2.phase === 'Superstructure';
    }
    // v6: the ground window is PER CANDIDATE CLASS and DATUM-INVARIANT. Two measured traps led
    // here: (v5) Terminal's grade beams base one 3m band below the plate, so one shared minimum
    // starved the plate — the ground reference must be each class's own; and (v6) the viewer
    // rebases the z-datum in its in-memory DB, so floor(z/3) BIN EQUALITY gave 233 members on the
    // raw datum and 29 on the shifted one for the SAME building — the same 3m quantum must be
    // applied as a continuous window above the class's own minimum base_z, not as a bin boundary.
    var minZByCls = {};
    for (t = 0; t < els.length; t++) {
      if (isCand(els[t])) {
        if (!(els[t].cls in minZByCls) || els[t].base_z < minZByCls[els[t].cls]) minZByCls[els[t].cls] = els[t].base_z;
      }
    }
    if (!('IfcSlab' in minZByCls) && !('IfcBeam' in minZByCls)) return out;
    for (t = 0; t < els.length; t++) {
      e = els[t];
      if (e.phase === 'Substructure') continue;   // only non-Substructure can disqualify a bearing
      if (!isStructBearing(e)) continue;
      cs = cellsOf(e);
      for (c = 0; c < cs.length; c++) (idx[cs[c]] = idx[cs[c]] || []).push(t);
    }
    // candidates + their potentially-disqualifying structural bearing lists, computed once
    var cand = [], bearings = [];
    for (t = 0; t < els.length; t++) {
      e = els[t];
      if (!isCand(e)) continue;
      var bl = [], seen = {};
      cs = cellsOf(e);
      for (c = 0; c < cs.length; c++) {
        var arr = idx[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) {
          S = els[arr[k]];
          if (S.guid === e.guid || seen[arr[k]]) continue;
          seen[arr[k]] = 1;
          if (S.base_z < e.base_z - EPS && S.top_z >= e.base_z - GAP && overlap(S, e)) bl.push(arr[k]);
        }
      }
      // route (a): no structural bearing — within one 3m quantum of its own class's lowest base
      if (!bl.length) {
        if (e.base_z <= minZByCls[e.cls] + 3) out[e.guid] = 1;
        continue;
      }
      cand.push(t); bearings.push(bl);
    }
    var changed = true;
    while (changed) {
      changed = false;
      for (t = 0; t < cand.length; t++) {
        e = els[cand[t]];
        if (out[e.guid]) continue;
        var blocked = false;
        for (k = 0; k < bearings[t].length; k++) {
          S = els[bearings[t][k]];
          if (S.phase !== 'Substructure' && !out[S.guid]) { blocked = true; break; }
        }
        if (!blocked) { out[e.guid] = 1; changed = true; }
      }
    }
    return out;
  }
  // ══ §DOOR_WINDOW_HOST_WALL_DISPLAY (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ══
  // MEASURED (witness_curtain_wall_opening's own G-CWO-DISPLAY, left non-asserting on purpose so a
  // fix could promote it): openingGate holds PERFECTLY on the generative timeline — rawEARLY 0.0% on
  // all 7 shipped buildings — and the DISPLAY timeline the movie actually plays undoes it, LTU_AHouse
  // 28.5%, Terminal 16.4%, JKR 10.1%, Hospital 2.5% of openings starting before their own host wall
  // FINISHES. Identical shape to §HOSTED_BEFORE_HOST one layer over: a gate that is correct where it
  // runs, re-broken by _twoTierRemap/_midairRepair rewriting the times afterwards. Same remedy, and
  // deliberately the same SHAPE as hostPairs above rather than a second mechanism: one pairing at
  // module scope, so the display-layer repair enforces the exact relation openingGate enforces.
  //
  // isOpening/openingBrackets are hoisted here so openingGate's openingScan and this twin test ONE
  // predicate (the reason EPS/GAP are exported rather than re-typed — "a second copy is a second
  // thing to drift"). Pool ORDER is openingGate's, verbatim: the IfcWall* pool when the opening has
  // ANY wall host, else the §CURTAIN_WALL_OPENING fallback pool. Getting that order wrong would make
  // the display layer enforce something the scheduler was never asked to.
  function isOpening(e) { return e.cls === 'IfcDoor' || e.cls === 'IfcWindow'; }
  function openingBrackets(S, el) {                 // openingScan's own bracket, one definition
    return S.base_z <= el.top_z + EPS && S.top_z >= el.base_z - EPS && overlap(S, el);
  }
  // openingPairs(els) -> [{ i, h }] index pairs into els (i = opening, h = a host bracketing it).
  // EVERY host of the chosen pool is returned, not the nearest — openingGate returns the MAX end
  // over its whole pool, so a consumer that honours every pair reproduces the gate's exact bound.
  // Pure geometry, no timing read: a caller pairs once and then compares whatever stage it owns.
  function openingPairs(els) {
    var wallIdx = {}, cwIdx = {}, out = [], t, e, cs, c, isW;
    for (t = 0; t < els.length; t++) { e = els[t];
      isW = !!(e.cls && e.cls.indexOf('IfcWall') === 0);
      if (!isW && !CW_HOST_CLS.test(e.cls || '')) continue;
      cs = cellsOf(e);
      for (c = 0; c < cs.length; c++)
        if (isW) (wallIdx[cs[c]] = wallIdx[cs[c]] || []).push(t);
        else (cwIdx[cs[c]] = cwIdx[cs[c]] || []).push(t);
    }
    var seen = {}, gen = 0;
    function scan(idx, el, into) {                  // dedup by index — an element spans many cells
      var cs2 = cellsOf(el), c2, arr, k2, si;
      into.length = 0; gen++;
      for (c2 = 0; c2 < cs2.length; c2++) { arr = idx[cs2[c2]]; if (!arr) continue;
        for (k2 = 0; k2 < arr.length; k2++) { si = arr[k2]; if (seen[si] === gen) continue;
          seen[si] = gen;
          if (openingBrackets(els[si], el)) into.push(si); } }
      return into;
    }
    var wall = [], cw = [], pool, q;
    for (t = 0; t < els.length; t++) { e = els[t];
      if (!isOpening(e)) continue;
      pool = scan(wallIdx, e, wall);
      if (!pool.length) pool = scan(cwIdx, e, cw);
      for (q = 0; q < pool.length; q++) out.push({ i: t, h: pool[q] });
    }
    return out;
  }
  // bbox volume — the same m³ the BIG_ELEMENT_VOL p95 was measured in (§SUPPORT_UNCHECKED 1a and
  // the §HANG_NEAREST fallback below share this one definition so their populations can never drift)
  function bboxVol(e) { return (e.x1 - e.x0) * (e.y1 - e.y0) * (e.top_z - e.base_z); }

  // deriveBandRanks(elements) — the §4D_BAND_MONOTONIC ladder (see computeSchedule's header for the
  // full ruling): storeys grouped by collapsePhase(), each ranked by the MEDIAN base_z of its own
  // elements, ascending. Extracted verbatim from computeSchedule's own `deriveRanks` IIFE (pure
  // refactor, zero behavior change — computeSchedule below now calls this instead of inlining it) so
  // a second consumer (schedule_author.js's zone-level CPM rollup) can get the SAME real floor order
  // without a duplicate copy of this math to drift out of sync with the live scheduler.
  // Returns { bandRank: {collapsedStorey: rank}, rankList: [{ph,z,n}, ...], unbanded: N }.
  // storeyMergeMap: OPTIONAL {collapsedName: canonicalName}, built by deriveStoreyMergeMap() below
  // from spatial_structure's EXTRACTED IfcBuildingStorey.Elevation (§S18, 2026-08-17,
  // prompts/4D_GANTT_TM_REFACTOR.md). When supplied, storey names that share one physical floor
  // collapse to ONE band before ranking — DISPLAY/AUDIT layer only. computeSchedule's own internal
  // call to this function (line ~418, inside PASS-B's band-monotonic trade gate) never passes this
  // map, so engine timing and the floating=0 gate are provably unaffected by this parameter existing.
  function deriveBandRanks(elements, storeyMergeMap) {
    var byPhase = {};
    elements.forEach(function (e) {
      var ph = collapsePhase(e.storey);
      if (storeyMergeMap && storeyMergeMap[ph]) ph = storeyMergeMap[ph];
      (byPhase[ph] = byPhase[ph] || []).push(e.base_z);
    });
    var rows = [], bandRank = {}, unbanded = 0;
    for (var ph in byPhase) {
      // ⚠ THE UNKNOWN BUCKET IS NOT A FLOOR — see computeSchedule's header comment for the measured
      // Hospital regression this guards against. Excluded from the ladder, not ranked.
      if (ph === '_UNKNOWN' || /^unknown$/i.test(ph)) { unbanded += byPhase[ph].length; continue; }
      var zs = byPhase[ph].slice().sort(function (a, b) { return a - b; });
      rows.push({ ph: ph, z: zs[Math.floor(zs.length / 2)], n: zs.length });
    }
    rows.sort(function (a, b) { return a.z - b.z; });
    rows.forEach(function (r, i) { bandRank[r.ph] = i; });
    return { bandRank: bandRank, rankList: rows, unbanded: unbanded };
  }

  // deriveStoreyMergeMap(spatialStructure) — §S18 (2026-08-17): groups storey NAMES that share one
  // physical floor using EXTRACTED IfcBuildingStorey.Elevation, never inferred from element z-values
  // (§PATHS NOT TO TAKE #7 forbids exactly that — mean/median-Z-of-ELEMENTS proximity). Each
  // collapsePhase()'d name's representative elevation is the MEDIAN of every spatial_structure row
  // with that name — robust to a single mis-scaled outlier (measured need: one of Clinic's 5
  // federated discipline files has a "Second Floor" row reading 4570 where its own IfcProject
  // declares LENGTHUNIT=METRE — a real source-file authoring defect, not a units-conversion miss;
  // 3 of that name's 4 rows agree at ~4.57, so the median rejects the one bad row the same way this
  // project's other Tukey/median derivations already do). Names within GAP (this module's own 0.5m
  // "audit: within this of" constant, line ~39 — reused, not a new tuned constant) of a lower band's
  // representative elevation join that band; chaining compares to the BAND'S elevation, not the
  // previous row's, so a band stays bounded to within GAP of where it started rather than drifting
  // through a long chain of small steps. Measured same-floor agreement in real data is far tighter
  // than GAP (~1e-13m — floating-point noise between independently-authored files) — GAP is
  // deliberately generous headroom above that, not a floor-height heuristic; it is far below every
  // measured real floor-to-floor gap in the fleet (Clinic's smallest is 4.57m).
  //
  // Parentage (spatial_structure.parent_guid, IfcBuilding<-IfcBuildingStorey, also extracted by
  // §S18) is NOT used as a hard partition here. Every federated "IfcBuilding" row measured in the
  // fleet so far (Clinic's 5 discipline files, LTU_AHouse's 9) represents ONE physical building
  // split across per-discipline exports, not genuinely distinct structures sharing a site — there is
  // no fleet case yet where an elevation coincidence could falsely merge two REAL different
  // buildings. If one appears, gate this merge to same-building parentage groups first; inventing
  // that partition today, with no case to verify it against, is exactly what Prime Rule forbids.
  function deriveStoreyMergeMap(spatialStructure) {
    var byName = {};
    (spatialStructure || []).forEach(function (r) {
      if (!r || r.type !== 'IfcBuildingStorey' || r.elevation == null || r.name == null) return;
      var name = collapsePhase(r.name);
      (byName[name] = byName[name] || []).push(r.elevation);
    });
    var rows = Object.keys(byName).map(function (name) {
      var zs = byName[name].slice().sort(function (a, b) { return a - b; });
      return { name: name, z: zs[Math.floor(zs.length / 2)] };
    });
    rows.sort(function (a, b) { return a.z - b.z; });
    var map = {}, bandName = null, bandZ = null;
    rows.forEach(function (r) {
      if (bandName === null || Math.abs(r.z - bandZ) > GAP) { bandName = r.name; bandZ = r.z; }
      map[r.name] = bandName;
    });
    return map;
  }

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
  // shiftHours: §SHIFT_HOURS (rates.js, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) — productive
  // hours per calendar day. Optional; when omitted this module's own 8h default holds (every caller
  // that doesn't pass it — the witnesses/probes — is unaffected, since a uniform time rescale changes
  // no order/floating assertion). Reassigned fresh at the TOP of every call, never inherited from a
  // previous one, so back-to-back calls with different values (or none) never cross-contaminate.
  function computeSchedule(elements, baseMs, scaleFactor, maxCrews, shiftHours) {
    baseMs = baseMs || 0; scaleFactor = scaleFactor || 1;
    SHIFT_MS = (shiftHours > 0 ? shiftHours : 8) * 3600 * 1000;
    var grid = {}, wallGrid = {}, cwGrid = {}, out = {}, c, cs, k, arr, S;
    // §CURTAIN_WALL_OPENING observability — keyed by guid, not a counter: openingGate is called
    // several times per element (placeNonst plus every §DEQ_REPAIR sweep), so a bare ++ would report
    // sweeps rather than openings.
    var _cwSeen = {}, _cwFellThrough = {};
    // §HOSTED_BEFORE_HOST: the host pairing is resolved ONCE, up front, off pure geometry — NOT from
    // an incremental placement grid. That is deliberate and it was a measured bug before it was a
    // design: a grid filled in PLACEMENT order and the DAG's index built in ELEMENT order break
    // Manhattan-distance ties differently, so the gate could wait on one host while the DAG had
    // ordered a different one — 125 of LTU_AHouse's 5,466 hosted elements survived the gate that way.
    // One pairing, shared by the gate below, the DAG edge, and (through hostPairs) the display layer.
    var _hostOf = {}, _hostPairs = hostPairs(elements), _hp;
    for (_hp = 0; _hp < _hostPairs.length; _hp++)
      _hostOf[elements[_hostPairs[_hp].i].guid] = elements[_hostPairs[_hp].h].guid;
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
    // ══ §4D_BAND_MONOTONIC (2026-08-02) — CINEMA_PATH_EDITOR.md, user Design Ruling A ═══════════
    // User, on a baked film: "upper floors gets walled first.. as seen on last strectch" and "the
    // floor slabs coming on too fast".
    //
    // WHY IT HAPPENED, and it was not a regression. On 2026-05-30 the center-Z band gate ("band N
    // waits N-1") was REPLACED by the support gate, because the band gate floated beams over
    // still-building tall columns (Hospital cols avg 6.87m vs 3m bands). That swap took floating
    // from 1127/1970 to 0/1970 — and in exchange it gave up floor-by-floor progression entirely.
    // Afterwards a wall was gated by only (1) overlapping structure strictly BELOW it and (2) earlier
    // trades on ITS OWN collapsed storey (`phaseTrade[ph][seq]`). Neither term mentions another
    // storey, so Level 3's walls need nothing from Level 2's walls and the model considers running
    // ahead correct. The user watched exactly that.
    //
    // THE RULING, not re-litigated here: band-monotonic WITHIN a phase, with a lag between phases.
    // A global floor gate would serialize the project and destroy the trade train — the bands carry
    // Superstructure, MEP Rough-in and Architecture simultaneously on purpose. So the constraint is
    // per-TRADE: a trade may not run ahead of ITSELF on the floor below. Different trades still
    // overlap across floors, which is what a trade train IS. "Nothing without support" stays exactly
    // where it was, as the role-blind geometric gate — this adds sequencing, it removes no safety.
    //
    // THE RANK IS EXTRACTED, NEVER INVENTED: storeys are grouped by the same collapsePhase() the
    // trade gate already keys on, each gets the MEDIAN base_z of its own elements, and ranks are
    // those medians in ascending order. A bungalow and a hospital each get their own ladder; no
    // constant, no assumed floor height. ⚠ The grouping is only as good as `el.storey`, and
    // time_machine.js reassigns ~9457 no-storey elements to a nearest storey by median Z before we
    // see them — a band rule laid on a wrong grouping enforces a wrong order confidently, so the
    // §4D_BAND_MONOTONIC log prints the ladder it derived for exactly that audit.
    var _ranks = deriveBandRanks(elements);
    var _bandRank = _ranks.bandRank, _rankList = _ranks.rankList, _unbanded = _ranks.unbanded;
    // bandTrade[rank][seq] = latest finish of that trade on that storey. A trade at rank r waits for
    // the SAME trade at rank r-1 — one floor, not all floors below: the lower floors are already
    // transitively covered through r-1, and reaching further down would only add slack.
    var bandTrade = {}, _bmGatedB = 0, _bmMaxLagMs = 0;
    function bandGate(el) {
      var r = _bandRank[collapsePhase(el.storey)];
      if (!(r > 0)) return baseMs;                 // ground floor, or unbanded — nothing beneath it
      var below = bandTrade[r - 1];
      var g = (below && below[el.seq] > baseMs) ? below[el.seq] : baseMs;
      return g;
    }
    function bandCommit(el, end) {
      var r = _bandRank[collapsePhase(el.storey)];
      if (r == null) return;
      var b = (bandTrade[r] = bandTrade[r] || {});
      if (!(b[el.seq] > end)) b[el.seq] = end;
    }
    // §GEO_SUPPORT_LEAK (2026-08-04, prompts/4D_SCHEDULE_PERFECTION.md): `S.base_z < el.base_z` alone
    // assumes MY OWN base_z is a reliable "where I actually rest" point. Measured false on 10/34,102
    // real elements across 6 buildings (2 classes: IfcWallStandardCase, IfcBuildingElementProxy) — a
    // large element's own computed base can sit BELOW every real structural base in its footprint even
    // though real structure (confirmed live: an IfcSlab ramp + retaining walls) plainly sits there.
    // `witness_geo_support_leak.js` proved this is a general geometric gap, not item/class-specific —
    // no name or class check is added here, only geometry.
    // Second clause is a STRICT ADDITION, never a removal: it only fires when the first clause (S
    // below me) doesn't already match, and only counts S whose ENTIRE vertical span sits inside MY
    // OWN [base_z,top_z] — real structure genuinely occupying part of my own bounding volume, at this
    // XY location. It can only make a gate MORE conservative (a later `g`), never weaker — the
    // existing "nothing without support" invariant (§SUPPORT_CHECK, 0 floating) cannot regress from
    // this; it can only catch support this test previously missed.
    function geoGate(el) {                 // latest finish of XY-overlapping structure rising from below
      var g = baseMs; cs = cellsOf(el);
      // §GEOMETRIC_SUPPORT_ORDER: contained-support only for NON-pool elements. contained(S,el)
      // definitionally implies below(el,S) — for a support-pool el that pair is a 2-cycle (every
      // element nested inside a taller pool member's z-span), which the old base_z-ascending PASS-A
      // order silently resolved in favor of below and the nonst-only repair loop never re-checked.
      // The DAG makes the rule explicit and uniform: between two pool members only BELOW orders
      // them; the §GEO_SUPPORT_LEAK cases this clause exists for were all non-pool consumers
      // (IfcWallStandardCase / Proxy) and keep it unchanged.
      var elPool = supportPool(el);   // §S26.2: same test, one definition (was inline here)
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
          var below = S.base_z < el.base_z - EPS;
          // §DEQ_V1: containment is STRICT (S.base_z > el.base_z + EPS, was > el.base_z - EPS) so the
          // relation is antisymmetric — with the old bound two same-z sibling slabs each counted the
          // other as contained support, a cycle the repair loop below can never satisfy (measured:
          // Hospital promoted roof slabs re-shifting every sweep, 30/sweep, no fixpoint). The
          // §GEO_SUPPORT_LEAK cases this clause exists for all had S strictly above el's base.
          // …and never a PROMOTED slab: a roof nested at the top of a tall wall's span is what BEARS
          // ON the wall, not structure the wall rests within — counting it here is a wallGate cycle
          // (measured: Hospital roof@199.66..199.81 inside wall@191.81..199.81, both re-shifting
          // every repair sweep). Promoted slabs support others via bearing-below and hangGate only.
          // §TM_GEO_ORDER_CYCLES fix (2026-08-10, 4D_SCHEDULE_PERFECTION.md — Witness:
          // witness_tm_geo_order_cycles.js): contained support must live in MY LOWER HALF. What I
          // rest within sits near my base (every measured §GEO_SUPPORT_LEAK case: ramp/retaining
          // structure near the consumer's base); a thin slab/beam/plate nested near my CROWN is
          // what rests on ME. The old top bound (S.top_z < el.top_z + EPS) let a 3cm topping slab
          // at a 22m wall's crown count as that wall's support — on Terminal that closed 37,927
          // elements into Kahn-leftover cycles (wall→promoted-roof→topping-slab→wall). Lower-half
          // bound measured on Terminal: leftover 37,927 → 0, only 0.8% of edges removed.
          var contained = !below && !elPool && !S.promoted && S.base_z > el.base_z + EPS &&
                          S.top_z <= (el.base_z + el.top_z) / 2;
          if ((below || contained) && S.end > g && overlap(S, el)) g = S.end; } }
      return g;
    }
    // §DEQ_V1 (2026-08-07, 4D_SCHEDULE_PERFECTION.md §DEQ_V1_IMPL): a slab the load-path rule promoted
    // to roof role (seq>4) is REAL STRUCTURE — the ceiling everything beneath it hangs from — so it
    // joins the same support grid as PASS-A structure. As a support it sits ABOVE what it carries, so
    // the bearing-below predicate almost never matches it; only hangGate reads it upward.
    function isPromotedSlab(e) { return e.cls === 'IfcSlab' && e.seq > 4; }
    // §STAIR_FLIGHT_GRID_VISIBILITY (2026-08-14, 4D_SCHEDULE_PERFECTION.md SESSION 6): a flight is
    // real structure but routes through placeNonst (seq=6), so it was never inserted into
    // structIdxGrid/grid — invisible AS SUPPORT to anything resting on it (a mid-landing, a floor
    // above). Same shape as isPromotedSlab: one narrow class admitted to the support-visibility
    // index without becoming a structure-pool member for GATE-ROUTING purposes (placeNonst,
    // its own full gate set, is unchanged for the flight itself).
    function isStairFlight(e) { return e.cls === 'IfcStairFlight'; }
    // §ARCH_START_TEMPO / M1 — the crew day, bound to this run's epoch (see the module header).
    // Every crew slot, every gate and the repair loop below read/write wall-clock ms exactly as
    // before; only the ADVANCE of the clock by a duration goes through the shift window.
    function prodAt(t) { return toProductive(t, baseMs); }
    function wallAt(p) { return toWall(p, baseMs); }
    var _prodMsTot = 0;   // §CREW_DAY audit: productive ms actually committed
    function place(el, start) {
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      // 8 productive h per calendar day: the remainder rolls to the next day's window start, and a
      // multi-window `dur` consumes as many following windows as it needs.
      var end = wallAt(prodAt(start) + dur); _prodMsTot += dur;
      out[el.guid] = { start: start, end: end };
      var prec = null;   // §CURTAIN_WALL_OPENING: the rec this element contributes, reused by cwGrid
      if (el.seq <= 4 || isPromotedSlab(el) || isStairFlight(el)) {
        var rec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, top_z: el.top_z, end: end, guid: el.guid,
                    promoted: isPromotedSlab(el) };
        (recsByGuid[el.guid] = recsByGuid[el.guid] || []).push(rec); prec = rec;
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(rec); }
      else if (el.cls && el.cls.indexOf('IfcWall') === 0) {   // §4D_WALLS_BEFORE_ROOF M5
        var wrec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, top_z: el.top_z, end: end, guid: el.guid };
        (recsByGuid[el.guid] = recsByGuid[el.guid] || []).push(wrec); prec = wrec;
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(wrec); }
      // §CURTAIN_WALL_OPENING — a SECOND INDEX over records that already exist, not a second pool
      // membership: the mullion/glazing rec is the SAME object the structure grid holds, so a
      // §DEQ_REPAIR shift of that part is seen through both indexes with no copy to drift. Only
      // IfcCurtainWall itself (seq 6, not IfcWall-prefixed ⇒ no rec today) ever mints a new one.
      // Nothing is REMOVED from any existing grid, so geoGate/wallGate/hangGate are untouched.
      if (el.cls && CW_HOST_CLS.test(el.cls)) {
        if (!prec) {
          prec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, top_z: el.top_z, end: end, guid: el.guid };
          (recsByGuid[el.guid] = recsByGuid[el.guid] || []).push(prec);
        }
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (cwGrid[cs[c]] = cwGrid[cs[c]] || []).push(prec);
      }
      return end;
    }
    var recsByGuid = {};   // §DEQ_V1 repair loop: guid -> its support-grid recs, so a shift updates them
    // §DEQ_V1 hang support — the physics the gates were missing: support is bearing-below OR
    // carrier-above. A ceiling fan/duct/terminal has NOTHING bearing under its base (the floor slab
    // tops metres below it) — it is MOUNTED to the structure whose underside meets its top. Scoped
    // hard: only an element with NO bearing-below support is treated as hanging (a wall/chair resting
    // on its slab is never hang-gated on the ceiling above it), which is also what keeps the audit
    // free of attempt-1-style mutual-wait false positives (a beam under a slab bears on its columns,
    // so it is excluded here even though the slab's underside meets its top).
    function hasBearingBelow(el) {
      cs = cellsOf(el);
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
          if (S.base_z < el.base_z - EPS && S.top_z >= el.base_z - GAP && overlap(S, el)) return true; } }
      return false;
    }
    function hangGate(el) {                // latest finish of the structure this element hangs from
      if (el.seq <= 4 || hasBearingBelow(el)) return baseMs;
      var g = baseMs; cs = cellsOf(el);
      var elPool = isPromotedSlab(el) || isStairFlight(el);     // §GEOMETRIC_SUPPORT_ORDER — see geoGate's pool rule
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
          // carrier's TOP strictly above mine (antisymmetric — same-z sibling slabs otherwise carry
          // each other, an unsatisfiable cycle for the repair loop; an embedding slab still tops me)
          // …and a pool member never hangs from what it sits BELOW of (S resting on el is not el's
          // carrier — the reverse below edge already orders the pair; same rule as geoGate's).
          // …and a WALL never hangs from a promoted slab IT BEARS (wallGate's own relation, reversed:
          // the slab waits for the wall whose top reaches its base — measured livelock on Duplex,
          // §DEQ_REPAIR 16 sweeps/379 shifts, seq-5 upper walls vs the load-path roof at bz 6.00).
          // A fan/duct in the same geometric relation keeps its hang: it is not wall-pool material,
          // and class-scoped carrier pools are this module's established, measured practice
          // (§4D_ROOF_LOAD_PATH attempt-1: class-blind widening = 3421 false positives).
          if (S.base_z >= el.top_z - GAP && S.base_z <= el.top_z + GAP && S.top_z > el.top_z + EPS &&
              !(elPool && el.base_z < S.base_z - EPS) &&
              !(S.promoted && el.cls && el.cls.indexOf('IfcWall') === 0 &&
                el.base_z < S.base_z - EPS && el.top_z >= S.base_z - GAP) &&
              S.end > g && overlap(S, el)) g = S.end; } }
      // §HANG_NEAREST (2026-08-11, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md big-element
      // follow-up — Witness: witness_big_element_support_coverage.js): the ±GAP carrier band
      // assumes DIRECT mount ("the structure whose underside meets its top"), but rod-suspended
      // MEP hangs 0.5–9.5m below its real carrier (MEASURED on the 5 shipped buildings: Hospital's
      // 139 §SUPPORT_UNCHECKED IfcDuctSegment all have pool structure 0.51–4.61m above, p50 1.22m —
      // just outside the band). STRICT ADDITION, same shape as §GEO_SUPPORT_LEAK's second clause:
      // only fires when the band scan found NOTHING, and only for a BIG (>BIG_ELEMENT_VOL, the same
      // measured p95 the 1a warn uses) pure-SINK element (seq>4, never a wall, never a promoted
      // slab — sinks are in neither support pool, so they have no outgoing DAG edges and an added
      // carrier edge can NEVER close a cycle; walls are excluded because wall→promoted-slab→wall
      // triangles are constructible through wallCarries). Carrier = the NEAREST overlapping pool
      // member above (parameter-free — no invented reach constant), plus co-planar members within
      // GAP of it (a beam grid rods to every beam of the plane, not one). Small sinks keep the old
      // ungated behavior — widening ALL sinks would re-gate 48,904 elements across the 5 shipped
      // buildings (measured 2026-08-11), a Part-2-scale reorder, not this seam close.
      if (g === baseMs && !elPool && !(el.cls && el.cls.indexOf('IfcWall') === 0) &&
          bboxVol(el) > BIG_ELEMENT_VOL) {
        var nb = Infinity;
        for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
            if (S.base_z > el.top_z + GAP && S.base_z < nb && overlap(S, el)) nb = S.base_z; } }
        if (nb < Infinity) {
          for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
            for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
              if (S.base_z > el.top_z + GAP && S.base_z <= nb + GAP &&
                  S.end > g && overlap(S, el)) g = S.end; } }
        }
      }
      return g;
    }
    // §4D_WALLS_BEFORE_ROOF M5 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_WALLS_BEFORE_ROOF) — a
    // roof-role slab (seq>4, promoted by the load-path rule in time_machine.js) must wait for the
    // walls that CARRY it, by geometry. Before this, a promoted slab's only dependency on walls was
    // the per-PHASE trade gate below, keyed on collapsePhase(storey) — and MEASURED on Hospital the
    // roof deck's key is "Level 7" while 12 of its 14 carriers are key "Level 6", so 12 of 14 were
    // covered by coincidence, not by a rule. This gate is the SAME pool auditFloating already offers
    // seq>4 slabs (structure + walls), so scheduler and auditor now test the same thing. No new pass
    // and no cycle: PASS B sorts by (seq, base_z) and walls are seq 6 vs roof slabs seq 8, so every
    // carrier is already placed when the slab is reached. EPS/GAP are this module's own constants.
    function wallGate(el) {
      if (el.cls !== 'IfcSlab' || el.seq <= 4) return baseMs;
      var g = baseMs; cs = cellsOf(el);
      for (c = 0; c < cs.length; c++) { arr = wallGrid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
          // §TM_GEO_ORDER_CYCLES fix: a wall CARRIES a promoted slab AT ITS TOP (top within GAP of
          // the slab's base — the M5 Hospital measurement: wall tops meeting the roof base), never a
          // slab embedded metres below its crown. Unbounded, a 22m Terminal wall "bore" a slab at
          // its mid-height, and that slab's below-edges closed the wall into a cycle. Same bound as
          // the DAG's wallCarries().
          if (S.base_z < el.base_z - EPS && S.top_z >= el.base_z - GAP && S.top_z <= el.base_z + GAP &&
              S.end > g && overlap(S, el)) g = S.end; } }
      return g;
    }
    // ══ §DOOR_WINDOW_HOST_WALL (2026-08-11, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ══════
    // A door/window is not borne from below (geoGate) or hung from above (hangGate) — it is cut
    // SIDEWAYS into a wall. Neither existing gate models that relationship, so a door/window has
    // never been checked against the wall it is physically embedded in. Measured on all 7 shipped
    // buildings (probe_door_wall.js): 0.5%-21.8% of doors/windows started before their own host
    // wall finished, real cases up to 120+ days early — reported live, HHS_Office_Federated Level
    // 2: door starts day 17.0, its wall doesn't finish until day 27.3.
    // No IfcRelFillsElement/IfcRelVoidsElement data is extracted (no such table exists in the
    // shipped DB), so the host wall is found geometrically — same wallGrid + overlap() primitive
    // wallGate already uses, XY/Z bbox overlap instead of the "rests on top of" band wallGate
    // tests. STRICT ADDITION: only Door/Window elements are gated; every other element's timing,
    // and wallGate's own existing roof-slab-on-wall behavior, are untouched.
    // The bracket predicate, hoisted verbatim so both pools are tested by ONE definition. Returns
    // the latest end among bracketing hosts in `gr`, or -1 when NOTHING in that pool brackets el —
    // the distinction the old single-pool version could not make (it returned baseMs both for "no
    // host" and "host already finished", which is exactly why a missing pool was silent).
    function openingScan(gr, el) {
      var g = -1, cs2 = cellsOf(el), c2, k2, arr2, S2;
      for (c2 = 0; c2 < cs2.length; c2++) { arr2 = gr[cs2[c2]]; if (!arr2) continue;
        for (k2 = 0; k2 < arr2.length; k2++) { S2 = arr2[k2];
          // §DOOR_WINDOW_HOST_WALL_DISPLAY: the bracket now lives at module scope (openingBrackets)
          // so this gate and its display-layer twin can never test different geometry.
          if (openingBrackets(S2, el) && S2.end > g) g = S2.end; } }
      return g;
    }
    // §CURTAIN_WALL_OPENING: STRICT ADDITION, and the fallback ordering is what makes it strict —
    // the curtain-wall pool is consulted ONLY when the opening has no IfcWall* host at all. An
    // opening that is gated today keeps its EXACT current start (measured: Terminal/JKR have 0
    // ungated openings ⇒ literally zero elements move there). No new threshold is introduced: the
    // fallback reuses openingScan's own EPS bracket. Cannot cycle — IfcMember/IfcPlate are seq 3/4,
    // so the §DEQ_REPAIR loop (which shifts seq>4 only) never moves them, and the one seq>4 member
    // of the pool, IfcCurtainWall, is not an opening so nothing ever gates it back.
    function openingGate(el) {
      if (!isOpening(el)) return baseMs;
      var g = openingScan(wallGrid, el);
      if (g < 0) {
        g = openingScan(cwGrid, el);
        // cwGrid GROWS during placement, so an opening reached early can fall through and be gated
        // on a later sweep — the two tallies must not double-count it. The §DEQ_REPAIR loop
        // re-evaluates every opening against the FINAL grid, so the last verdict is the true one.
        if (g >= 0) { _cwSeen[el.guid] = 1; delete _cwFellThrough[el.guid]; }
        else if (!_cwSeen[el.guid]) _cwFellThrough[el.guid] = 1;
      }
      return g > baseMs ? g : baseMs;
    }
    // ══ §HOSTED_BEFORE_HOST (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ═════════
    // User, live 2026-08-12: "electrical outlets and hanging elements appearing bit early." MEASURED
    // on the DISPLAY timeline before this gate existed (probe_arch_start.js §HOSTED_BEFORE_HOST, all
    // 7 shipped buildings): Hospital 1480/2830 (52.3%) hosted elements start before the element they
    // are mounted in, worst 147.7d; Terminal 25.6%, LTU_AHouse 37.8% (worst 573.9d), Clinic 24.1%,
    // HHS 17.8%, Duplex 8.7%, JKR 5.9%. Long-standing, NOT a §TIER_SERIAL_BY_ZONE regression — the
    // same probe run against 42539c9 (pre-#1313) reports 50.3/25.2/37.7/23.2/17.7/9.6/5.7%.
    //
    // WHY NO EXISTING GATE CAUGHT IT, and it is one fact: the host of essentially every offender is
    // IfcCovering — a ceiling — and IfcCovering is in NO support pool. geoGate/hangGate read the
    // structure grid (seq<=4 + promoted slabs), wallGate/openingGate read the wall grid. A ceiling is
    // in neither, so a light fixture had literally nothing to be checked against. Worse, the shipped
    // trade order makes the inversion the DEFAULT rather than an accident: sequence_rules.json puts
    // MEP Final at seq 9 and Finishes (IfcCovering) at seq 10, so a lay-in fixture is scheduled
    // BEFORE the ceiling it drops into, by rule, everywhere. hangGate cannot save it either — its
    // §HANG_NEAREST fallback is scoped to BIG (>BIG_ELEMENT_VOL) elements, and outlets/fixtures are
    // exactly the small ones it deliberately leaves ungated.
    //
    // THE RULE: a hosted element inherits its HOST's floor — it may not start before the host it is
    // mounted in/on has FINISHED (the same S.end every other gate in this module returns). STRICT
    // ADDITION: only HOSTED_CLS elements are gated, nothing else's timing moves, and an element with
    // no bracketing host in its cell keeps exactly its previous behaviour.
    // Reads the host's CURRENT end straight out of `out`, so a §DEQ_REPAIR shift of a host is seen
    // by what it hosts on the very next sweep — no stale grid copy to keep in step. An unplaced host
    // (a §SUPPORT_CYCLE fallback member) yields baseMs here and the repair loop closes it after.
    function hostGate(el) {                // finish of the wall/slab/ceiling this element is mounted in
      var hg = _hostOf[el.guid];
      if (!hg) return baseMs;
      var o = out[hg];
      return (o && o.end > baseMs) ? o.end : baseMs;
    }
    // ══ §GEOMETRIC_SUPPORT_ORDER (2026-08-07, 4D_SCHEDULE_PERFECTION.md) ════════════════════════
    // Placement order is derived from GEOMETRY FIRST: a support DAG built from XYZ data alone —
    // edge S→E for exactly the pair predicates the timing gates above consult (geoGate's
    // below/contained, wallGate's wall-under-promoted-roof, hangGate's carrier-above for a
    // statically-hanging E) — placed topologically (Kahn + priority heap), with the old seq-primary
    // sort demoted to the TIEBREAK among elements the DAG says are mutually placeable. `seq` is a
    // CLASS/TRADE guess; every floating defect to date (fan-before-roof, walls-before-foundation,
    // legacy rule sets ordering carriers after dependents) was seq placing a dependent before its
    // support existed in any grid, caught after the fact — or missed — by reactive gate/repair
    // machinery, one discovered building shape at a time. With the DAG primary, "support before
    // supported" is structural for ANY building's IFC; the §DEQ_REPAIR loop below is retained as a
    // FALLBACK and must report shifted=0 (witness_geometric_support_order.js).
    //
    // PASS A/B semantics are UNCHANGED per element — structure (seq<=4) is gated by geoGate+crew
    // only (§4D_BAND_MONOTONIC's ruling that PASS A stays band-ungated holds; the DAG can only
    // order structure support-before-supported, which is geoGate's own relation, never the rank
    // re-sort that measured 2,341 floats), non-structure gets the full gate set. The tiebreak
    // reproduces the old processing order exactly wherever geometry doesn't force otherwise:
    // all structure (base_z, seq) before non-structure (seq, rank, base_z).
    // §DEQ_V1's sortSeq hack (promoted roof slabs forced to wallSeqMax+0.5 so hangGate never read a
    // grid the roof wasn't in yet) is REMOVED as subsumed: wall→roof and roof→hanger are DAG edges
    // now, so the placement order guarantees it for free — witnessed green with the plain-seq
    // tiebreak before removal (witness_geometric_support_order.js + witness_default_engine_quality.js).
    var _t0 = Date.now();
    var N = elements.length, t, si;
    // static support pools (whole element set, not the incremental placement grids) — the same
    // pools auditFloating scans, so scheduler order and audit test the same physics
    var structIdxGrid = {}, wallIdxGrid = {};
    for (t = 0; t < N; t++) { var P = elements[t];
      if (P.seq <= 4 || isPromotedSlab(P) || isStairFlight(P)) { cs = cellsOf(P); for (c = 0; c < cs.length; c++) (structIdxGrid[cs[c]] = structIdxGrid[cs[c]] || []).push(t); }
      else if (P.cls && P.cls.indexOf('IfcWall') === 0) { cs = cellsOf(P); for (c = 0; c < cs.length; c++) (wallIdxGrid[cs[c]] = wallIdxGrid[cs[c]] || []).push(t); } }
    // pair predicates — one definition, used for both indegree count and decrement-on-place
    function edgeBelow(S, E)     { return S.base_z < E.base_z - EPS; }                          // geoGate "below"
    // §TM_GEO_ORDER_CYCLES fix (2026-08-10): contained support must live in E's LOWER HALF —
    // mirrors geoGate's clause above (see the full rationale there; Terminal leftover 37,927 → 0).
    function edgeContained(S, E) { return !edgeBelow(S, E) && !isPromotedSlab(S) && S.base_z > E.base_z + EPS && S.top_z <= (E.base_z + E.top_z) / 2; }  // geoGate §GEO_SUPPORT_LEAK clause
    function edgeBearing(S, E)   { return S.base_z < E.base_z - EPS && S.top_z >= E.base_z - GAP; }  // hasBearingBelow / audit
    // §TM_GEO_ORDER_CYCLES fix: wallGate's relation, bounded — a wall carries a promoted slab AT
    // ITS TOP (top within GAP of the slab's base), never one embedded metres below its crown.
    function wallCarries(S, E)   { return edgeBearing(S, E) && S.top_z <= E.base_z + GAP; }
    function edgeCarrier(S, E)   { return S.base_z >= E.top_z - GAP && S.base_z <= E.top_z + GAP && S.top_z > E.top_z + EPS; }  // hangGate
    var indeg = new Int32Array(N), succs = new Array(N), hangs = new Uint8Array(N), _edges = 0,
        _hangNearest = 0,  // §HANG_NEAREST fallback edges added (logged in §GEO_ORDER)
        _hostEdges = 0;    // §HOSTED_BEFORE_HOST host→hosted edges added (logged in §GEO_ORDER)
    // stamp-array dedup (an {} per element measured 28s at 15k elements — dictionary churn), and a
    // reused cands array; _gen is bumped once per scan so stamps never need clearing
    var stamp = new Int32Array(N), _gen = 0, cands = [], nc;
    for (t = 0; t < N; t++) {
      var E = elements[t], hasB = false, isPoolE = E.seq <= 4 || isPromotedSlab(E) || isStairFlight(E);
      _gen++; cands.length = 0;
      cs = cellsOf(E);
      for (c = 0; c < cs.length; c++) { arr = structIdxGrid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { si = arr[k]; if (si === t || stamp[si] === _gen) continue; stamp[si] = _gen;
          S = elements[si]; if (!overlap(S, E)) continue;
          cands.push(si);
          if (edgeBearing(S, E)) hasB = true; } }
      // static "hangs" flag: with topological order every bearing support is placed before E, so
      // the runtime hasBearingBelow() the hangGate consults agrees with this static fact
      hangs[t] = (!hasB && E.seq > 4) ? 1 : 0;
      // §GEOMETRIC_SUPPORT_ORDER antisymmetry (mirrors the geoGate/hangGate pool rule above):
      //   contained edges never target a pool member (contained(S,E) ⇒ below(E,S) — every nested
      //   pool pair would be a 2-cycle); a pool member never hangs from what it sits below of.
      // With that, pool-vs-pool edges are BELOW/BEARING only — strictly base_z-ordered, so the DAG
      // is acyclic for any real geometry; §SUPPORT_CYCLE below reports whatever remains, never hides it.
      var hadCarrier = false;
      for (nc = 0; nc < cands.length; nc++) { si = cands[nc]; S = elements[si];
        var isCarrierEdge = hangs[t] && edgeCarrier(S, E) && !(isPoolE && E.base_z < S.base_z - EPS) &&
             !(isPromotedSlab(S) && E.cls && E.cls.indexOf('IfcWall') === 0 && edgeBearing(E, S));
        if (isCarrierEdge) hadCarrier = true;
        if (edgeBelow(S, E) || (!isPoolE && edgeContained(S, E)) || isCarrierEdge) {
          (succs[si] = succs[si] || []).push(t); indeg[t]++; _edges++; } }
      // §HANG_NEAREST — the DAG twin of hangGate's fallback above (one relation, two consumers, or
      // placement order and runtime gate would disagree). Scope identical: big pure-sink hanger with
      // ZERO in-band carriers → edge from every member of the nearest carrier plane. Sinks are in
      // neither support pool ⇒ no outgoing edges ⇒ these added in-edges cannot create a cycle
      // (W-TMREPRO-4 cycles=0 stays structural, not lucky).
      if (hangs[t] && !isPoolE && !(E.cls && E.cls.indexOf('IfcWall') === 0) && !hadCarrier &&
          bboxVol(E) > BIG_ELEMENT_VOL) {
        var nbD = Infinity;
        for (nc = 0; nc < cands.length; nc++) { S = elements[cands[nc]];
          if (S.base_z > E.top_z + GAP && S.base_z < nbD) nbD = S.base_z; }
        if (nbD < Infinity) {
          for (nc = 0; nc < cands.length; nc++) { si = cands[nc]; S = elements[si];
            if (S.base_z > E.top_z + GAP && S.base_z <= nbD + GAP) {
              (succs[si] = succs[si] || []).push(t); indeg[t]++; _edges++; _hangNearest++; } }
        }
      }
      if (isPromotedSlab(E)) {                                       // wallGate's relation
        _gen++;
        for (c = 0; c < cs.length; c++) { arr = wallIdxGrid[cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { si = arr[k]; if (si === t || stamp[si] === _gen) continue; stamp[si] = _gen;
            S = elements[si]; if (!overlap(S, E)) continue;
            if (wallCarries(S, E)) { (succs[si] = succs[si] || []).push(t); indeg[t]++; _edges++; } } }   // §TM_GEO_ORDER_CYCLES: bounded, carry-at-top
      }
    }
    // §HOSTED_BEFORE_HOST — the DAG twin of hostGate, from the SAME _hostPairs the gate reads, so
    // placement order and runtime gate cannot pick different hosts (they did, until they shared one
    // pairing — see _hostOf's header). CANNOT CREATE A CYCLE, structurally, not by luck: HOSTED_CLS
    // ∩ HOST_CLS = ∅ and isHosted requires seq>4, so a hosted element is in NO pool — struct, wall
    // or host — hence has zero outgoing edges and an added in-edge closes nothing. Same argument
    // §HANG_NEAREST rests on (W-TMREPRO-4 cycles=0 stays structural).
    for (_hp = 0; _hp < _hostPairs.length; _hp++) {
      si = _hostPairs[_hp].h; t = _hostPairs[_hp].i;
      (succs[si] = succs[si] || []).push(t); indeg[t]++; _edges++; _hostEdges++;
    }
    // tiebreak = the old seq-primary processing order (precomputed keys — collapsePhase is regex)
    var rankKey = new Float64Array(N), seqKey = new Float64Array(N);
    for (t = 0; t < N; t++) { rankKey[t] = _bandRank[collapsePhase(elements[t].storey)] || 0; seqKey[t] = elements[t].seq; }
    function orderCmp(ai, bi) {
      var a = elements[ai], b = elements[bi];
      var ga = a.seq <= 4 ? 0 : 1, gb = b.seq <= 4 ? 0 : 1;
      if (ga !== gb) return ga - gb;
      if (ga === 0) return (a.base_z - b.base_z) || (a.seq - b.seq) || (ai - bi);
      return (seqKey[ai] - seqKey[bi]) || (rankKey[ai] - rankKey[bi]) || (a.base_z - b.base_z) || (ai - bi);
    }
    var heap = [];
    function hpush(x) { heap.push(x); var i = heap.length - 1;
      while (i > 0) { var p = (i - 1) >> 1; if (orderCmp(heap[i], heap[p]) < 0) { var tm = heap[p]; heap[p] = heap[i]; heap[i] = tm; i = p; } else break; } }
    function hpop() { var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; var i = 0;
        for (;;) { var l = 2 * i + 1, r = l + 1, m = i;
          if (l < heap.length && orderCmp(heap[l], heap[m]) < 0) m = l;
          if (r < heap.length && orderCmp(heap[r], heap[m]) < 0) m = r;
          if (m === i) break; var tm = heap[m]; heap[m] = heap[i]; heap[i] = tm; i = m; } }
      return top; }
    // per-element placement bodies — PASS A/B logic verbatim from the pre-§GEOMETRIC_SUPPORT_ORDER
    // sorted loops (see git history), only the ITERATION ORDER changed
    var phaseTrade = {};
    function placeStruct(el) {
      var slot = claimCrew(el.resource);
      var start = Math.max(geoGate(el), slot.time);
      var end = place(el, start);
      bandCommit(el, end);
      slot.commit(end);
    }
    function placeNonst(el) {
      var ph = collapsePhase(el.storey);
      var pt = phaseTrade[ph] || {}, tg = baseMs, s;
      for (s in pt) if (+s < el.seq && pt[s] > tg) tg = pt[s];
      var slot = claimCrew(el.resource);
      // §4D_BAND_MONOTONIC: the "upper floors gets walled first" half — the cross-storey term.
      var bg = bandGate(el);
      // §PERF_GATE_DEDUP (2026-08-14): geoGate/wallGate are pure (read-only over the grids built so
      // far), so the audit line below reuses these instead of re-scanning the same grid cells twice
      // per element — same values, half the grid work, byte-identical decisions.
      var gg = geoGate(el), wg = wallGate(el);
      var start = Math.max(gg, wg, hangGate(el), openingGate(el), hostGate(el), tg, bg, slot.time);   // §4D_WALLS_BEFORE_ROOF M5 + §DEQ_V1 + §DOOR_WINDOW_HOST_WALL + §HOSTED_BEFORE_HOST
      if (bg > baseMs && bg >= Math.max(gg, wg, tg)) _bmGatedB++;
      var end = place(el, start);
      if (bg > baseMs && start - bg > _bmMaxLagMs) _bmMaxLagMs = start - bg;
      bandCommit(el, end);
      slot.commit(end);
      (phaseTrade[ph] = phaseTrade[ph] || {});
      if (!(phaseTrade[ph][el.seq] > end)) phaseTrade[ph][el.seq] = end;
    }
    // ⚠ the placement bodies clobber the shared c/cs/k/arr/S scratch vars (geoGate et al) — every
    // loop below that calls them must use its OWN index variable, never the shared k
    var placedFlag = new Uint8Array(N), dl, di;
    for (t = 0; t < N; t++) if (!indeg[t]) hpush(t);
    while (heap.length) {
      var ti = hpop(), el = elements[ti];
      if (el.seq <= 4) placeStruct(el); else placeNonst(el);
      placedFlag[ti] = 1;
      dl = succs[ti];
      if (dl) for (di = 0; di < dl.length; di++) if (--indeg[dl[di]] === 0) hpush(dl[di]);
    }
    // A true geometric cycle (two elements spatially "supporting" each other) is a MODELING fact —
    // named here, never silently resolved (no-invent discipline). Members fall back to the old
    // seq-primary order; the §DEQ_REPAIR loop below still covers them. Always logged, count 0
    // included, so the witness can assert cycles are reported rather than hidden.
    var _cyc = [];
    for (t = 0; t < N; t++) if (!placedFlag[t]) _cyc.push(t);
    if (_cyc.length) {
      _cyc.sort(orderCmp);
      for (di = 0; di < _cyc.length; di++) { var ce = elements[_cyc[di]];
        if (ce.seq <= 4) placeStruct(ce); else placeNonst(ce); }
    }
    if (typeof console !== 'undefined' && console.log) {
      console.log('§SUPPORT_CYCLE cycles=' + _cyc.length +
        (_cyc.length ? ' sample=[' + _cyc.slice(0, 5).map(function (x) { return elements[x].guid; }).join(',') + ']' : ''));
      console.log('§GEO_ORDER n=' + N + ' edges=' + _edges + ' hangNearest=' + _hangNearest +
        ' hostEdges=' + _hostEdges + ' orderMs=' + (Date.now() - _t0));
      // §S58 (§S58.1b) — §HOSTED_BEFORE_HOST's own proof line. hostEdges above is the numerator
      // only; this is the denominator and the miss breakdown, so "did the outlets-appear-early fix
      // actually cover this building" is readable from the log instead of inferred. Same shape as
      // §CURTAIN_WALL_OPENING's cwGated=/stillUngated=. matched+fellThrough == hostedTotal is an
      // accounting identity a witness can assert, not a bare count.
      var _hc = _hostPairs && _hostPairs.census;
      if (_hc) console.log('§HOSTED_BEFORE_HOST hostedTotal=' + _hc.hostedTotal +
        ' matched=' + _hc.matched + ' fellThrough=' + (_hc.fellThroughNoHostCell + _hc.fellThroughNoNearest) +
        ' (noHostCell=' + _hc.fellThroughNoHostCell + ' noNearest=' + _hc.fellThroughNoNearest + ')' +
        ' — fellThrough elements are gated at baseMs only, i.e. NOT held behind their host');
    }
    var nonst = elements.filter(function (e) { return e.seq > 4; });
    // §DEQ_V1 repair loop — the zero-contradiction guarantee. The gates above are only as good as
    // placement ORDER (a gate can't wait on a support that isn't in the grid yet), and seq metadata
    // can order a carrier after its dependent (legacy rule sets put MEP below walls; walls STANDING ON
    // a promoted roof sort before it). So: re-check every PASS-B element against the FINAL grids and
    // push violators later until fixpoint (≤16 sweeps — shifts are monotone and the support relation
    // is acyclic by its physics scoping, so a fixpoint exists; each sweep walks elements in current
    // start order so support chains settle in few sweeps, measured 8 residual at cap=4 on Hospital
    // from a wall-on-roof chain deeper than the cap). Crew slots are NOT re-solved for shifted
    // elements — counted and logged, accepted v1 tradeoff (4D_SCHEDULE_PERFECTION.md §DEQ_V1_IMPL #4).
    var _rIter = 0, _rMovedTot = 0, _crewPackMovedTot = 0;
    for (; _rIter < 16; _rIter++) {
      var _moved = 0;
      // §CURTAIN_WALL_OPENING tally reset — cwGrid/wallGrid are complete by now, so the LAST sweep's
      // verdicts are the true ones. Without this the counts keep entries from placement time, when
      // the grids were still filling and an opening could transiently have no wall in its cell.
      _cwSeen = {}; _cwFellThrough = {};
      nonst.slice().sort(function (a, b) { return out[a.guid].start - out[b.guid].start; })
        .forEach(function (el) {
        var need = Math.max(geoGate(el), wallGate(el), hangGate(el), openingGate(el), hostGate(el));
        var o = out[el.guid];
        if (o.start < need) {
          // §ARCH_START_TEMPO / M1: a shift preserves the element's PRODUCTIVE duration, not its
          // wall-clock width — moving it across a different number of idle windows would otherwise
          // silently invent or destroy crew hours. toProductive is toWall's exact inverse on both
          // stored times, so the duration is recovered, never carried.
          var dur = prodAt(o.end) - prodAt(o.start);
          o.start = need; o.end = wallAt(prodAt(need) + dur);
          var rl = recsByGuid[el.guid];
          if (rl) for (var q = 0; q < rl.length; q++) rl[q].end = o.end;
          _moved++;
        }
      });
      // ══ §CREW_CAP_FINAL (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S67) ═══
      // THE CREW CAP HAS TO BIND THE FINAL TIMES, NOT ONLY PLACEMENT.
      //
      // claimCrew above enforces LABOR_RATES[trade].max_crews correctly — but only at the moment an
      // element is first placed. The geometry sweep immediately above then writes o.start/o.end
      // DIRECTLY, so every shifted element lands wherever its gate demands with no regard for
      // whether that trade has a free crew there. hostGate is the biggest shifter and its whole
      // population is hosted openings (IfcDoor/IfcWindow = CARPENTER), so they pile onto the same
      // instants: MEASURED 2026-08-25, final emitted times, 24h shift —
      //   Terminal CARPENTER peak 20 vs cap 2 (10.0x) · HHS 8 vs 2 (4.0x) · Duplex 3 vs 2 (1.5x),
      // every other trade legal on every building. A/B with this loop disabled returns all three to
      // their caps, which isolates the sweep as the cause. The breach never shortened the programme
      // (HHS span 46.9d either way) — it just authored work no crew exists to do.
      //
      // The fix re-packs crews over the CURRENT times, inside the SAME convergence loop, so the two
      // constraints settle together instead of one undoing the other: geometry may only push an
      // element later, and so may the re-pack, so the loop is monotone and terminates. A re-pack
      // move counts as _moved, which is what makes the next geometry sweep re-check what it broke.
      // Duration is carried in PRODUCTIVE ms exactly as the geometry sweep does it (§ARCH_START_TEMPO
      // / M1) — a shift across a different number of idle windows must not invent or destroy hours.
      var _packSlots = {};
      function _packClaim(resource, notBefore) {
        var cap = crewCapFor(resource);
        var slots = _packSlots[resource] || (_packSlots[resource] = new Array(cap).fill(baseMs));
        var idx = 0;
        for (var pi = 1; pi < slots.length; pi++) if (slots[pi] < slots[idx]) idx = pi;
        return { start: Math.max(notBefore, slots[idx]), commit: function (e) { slots[idx] = e; } };
      }
      var _packMoved = 0;
      elements.slice().filter(function (e) { return out[e.guid]; })
        .sort(function (a, b) { return (out[a.guid].start - out[b.guid].start) || (a.seq - b.seq); })
        .forEach(function (el) {
          var o = out[el.guid];
          var dur = prodAt(o.end) - prodAt(o.start);
          var cl = _packClaim(el.resource, o.start);
          var end = wallAt(prodAt(cl.start) + dur);
          cl.commit(end);
          if (cl.start > o.start) {
            o.start = cl.start; o.end = end;
            var prl = recsByGuid[el.guid];
            if (prl) for (var pq = 0; pq < prl.length; pq++) prl[pq].end = o.end;
            _moved++; _packMoved++;
          }
        });
      _crewPackMovedTot += _packMoved;
      _rMovedTot += _moved;
      if (!_moved) break;
    }
    if (typeof console !== 'undefined' && console.log)
      console.log('§DEQ_REPAIR sweeps=' + _rIter + ' shifted=' + _rMovedTot + ' (0=order already dependency-consistent)');
    if (typeof console !== 'undefined' && console.log)
      console.log('§CREW_CAP_FINAL crewRepacked=' + _crewPackMovedTot +
        ' (elements pushed later because their trade had no free crew at the time a geometry gate wanted them; 0=every gate landing already had a crew)');
    // §CURTAIN_WALL_OPENING — the coverage number, so the pool is auditable rather than trusted.
    // cwGated = openings with NO IfcWall* host that the curtain-wall pool caught; stillUngated =
    // openings bracketed by neither pool (a genuinely wall-less opening — reported, never invented
    // a host for). Both 0 on a building with no curtain wall, which is the no-op proof.
    if (typeof console !== 'undefined' && console.log)
      console.log('§CURTAIN_WALL_OPENING cwGated=' + Object.keys(_cwSeen).length +
        ' stillUngated=' + Object.keys(_cwFellThrough).length +
        ' cwCells=' + Object.keys(cwGrid).length);
    // §CREW_DAY (§ARCH_START_TEMPO / M1) — the whitebox proof that the shift cap is live and that it
    // neither lost nor invented labour. spanD = wall-clock days the programme now occupies;
    // serialProdD = the same labour on ONE crew at 8 h/day (Σ installSecs*scale / SHIFT_MS) — the
    // number materializeDefault's phase widths have always been quoted in. spanD24 is what the same
    // schedule would have spanned on the old 24-h clock, printed so the 3x is measured, not claimed.
    if (typeof console !== 'undefined' && console.log) {
      var _cdEnd = baseMs, _cdG;
      for (_cdG in out) if (out[_cdG].end > _cdEnd) _cdEnd = out[_cdG].end;
      console.log('§CREW_DAY shift=' + (SHIFT_MS / 3600000) + 'h/' + (DAY_MS / 3600000) + 'h n=' + N +
        ' spanD=' + ((_cdEnd - baseMs) / DAY_MS).toFixed(1) +
        ' spanD24=' + (toProductive(_cdEnd, baseMs) / DAY_MS).toFixed(1) +
        ' serialProdD=' + (_prodMsTot / SHIFT_MS).toFixed(1) +
        ' (a crew works ' + (SHIFT_MS / 3600000) + 'h of every calendar day — 24/7 calendar unchanged)');
    }
    // The ladder this rule is standing on, printed so it can be audited rather than trusted — see
    // the §GANTT_STOREY_Z reassignment warning in the header comment above.
    if (typeof console !== 'undefined' && console.log) {
      console.log('§4D_BAND_MONOTONIC ranks=' + _rankList.length +
        ' gatedB=' + _bmGatedB + ' unbanded=' + _unbanded + ' (passA intentionally ungated)' +
        ' ladder=[' + _rankList.map(function (r) {
          return r.ph + '@' + r.z.toFixed(1) + 'm(' + r.n + ')';
        }).join(', ') + ']');
    }
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
  // §DEQ_V1 (2026-08-07, 4D_SCHEDULE_PERFECTION.md §DEQ_V1_IMPL #5): the audit mirrors the scheduler's
  // upgraded physics — support is bearing-below OR carrier-above. structGrid now includes promoted
  // roof slabs (seq>4 IfcSlab), and an audited seq>4 element with NO bearing-below support is checked
  // against what it HANGS from (structure whose underside is within ±GAP of its top) — the fan-over-
  // roof case §SUPPORT_CHECK was blind to by construction. The hang check is scoped exactly like the
  // scheduler's hangGate (no bearing-below only), which is what keeps attempt-1's mutual-wait false
  // positives out: a beam bearing on its columns is never audited against the slab resting on it.
  // collectGuids (optional, §GANTT_LOCK_INTEGRITY): an array to receive the offending GUIDs so a
  // caller can NAME what floats (the lock-back "Integrity Breach" flag), not just count it. The
  // count return is unchanged for every existing caller.
  // collectUnchecked (optional, §SUPPORT_UNCHECKED — 4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11 1a):
  // an array to receive {guid, cls, vol, buildingModelsSubstructure} for every element ABOVE
  // BIG_ELEMENT_VOL for which the scoped-pool scan found ZERO support candidates (neither bearing
  // nor hang) — the zero-candidate blind spot where `se===0` used to silently pass with literally
  // no support check applied. WARN-ONLY: the floating count `v` (this function's return) and the
  // floating flag are byte-identical to before — observability only, never a gate, until real
  // occurrence counts on shipped buildings are known.
  function auditFloating(elements, sched, classFilter, collectGuids, collectUnchecked) {
    var structGrid = {}, wallGrid = {}, i, c, cs, k, arr, S;
    for (i = 0; i < elements.length; i++) { var e = elements[i];
      if (e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4)) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (structGrid[cs[c]] = structGrid[cs[c]] || []).push(e); }
      else if (e.cls.indexOf('IfcWall') === 0) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(e); } }
    // buildingModelsSubstructure — "Gap B exemption DECIDED" (4D_SCHEDULE_PERFECTION.md 2026-08-11):
    // annotate, don't suppress. true iff ≥1 element resolves to phase==='Substructure' — seq===1 is
    // that exact test (SEQUENCE_RULES: IfcFooting/IfcPile/IfcReinforcingBar carry sequence 1, all
    // Substructure — IfcPile added 2026-08-11 closure pass, Gap A close, latent on all shipped
    // buildings; plus TWO name-overrides deliberately assign seq 1, see rates/sequence_rules.json:
    // 'foundation_pile_misclassified_slab' — Terminal's 236 'jkrST_str-fo_pc_rcp' 30m precast piles
    // authored as IfcSlab, flipping Terminal to bms=true — and 'slab_on_grade_substructure' —
    // Duplex/Clinic's 8 measured slab-on-grade IfcSlab, the 1c spec's own named ground-bearing
    // class). false (HHS today) means "this building never modeled a foundation layer at all —
    // weight findings with that context," never hides or downgrades them.
    var bms = false;
    for (i = 0; i < elements.length; i++) { if (elements[i].seq === 1) { bms = true; break; } }
    var v = 0;
    for (i = 0; i < elements.length; i++) { var T = elements[i];
      if (classFilter && !classFilter(T)) continue;
      var se = 0, hasBearing = false, hasHang = false, seen = {}; cs = cellsOf(T);
      var pools = (T.cls === 'IfcSlab' && T.seq > 4) ? [structGrid, wallGrid] : [structGrid];
      for (var p = 0; p < pools.length; p++) {
        for (c = 0; c < cs.length; c++) { arr = pools[p][cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { S = arr[k]; if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
            // §S64 (2026-08-22) — the WALL pool (p===1, offered only to a promoted slab) must carry
            // the same CARRY-AT-TOP bound the scheduler puts on the identical relation: wallGate
            // (:684) and the DAG's wallCarries (:797) both require S.top_z <= T.base_z + GAP, the
            // §TM_GEO_ORDER_CYCLES rule that "a wall carries a promoted slab AT ITS TOP, never one
            // embedded metres below its crown". Without it the audit counted a wall the scheduler
            // never gated on — measured: Terminal IfcWall top 37.06 against a slab base 30.57,
            // LTU_AHouse 10.80 against 8.60 — 73 fleet-wide false "floating" verdicts (Terminal 8,
            // Clinic 1, LTU_AHouse 64). structGrid (p===0) is unbounded here as before: that pool's
            // bearing test is edgeBearing's exact twin and already agrees with the gate.
            if (p === 1 && !(S.top_z <= T.base_z + GAP)) continue;
            if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
              hasBearing = true;
              var en = sched[S.guid].end; if (en > se) se = en; } } }
      }
      if (!hasBearing && T.seq > 4) {      // hangs — audit against its carrier above instead
        // §GEOMETRIC_SUPPORT_ORDER: a pool member never hangs from what it sits BELOW of —
        // mirrors the scheduler's hangGate pool rule, so audit and scheduler agree.
        // §S64 (2026-08-22, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md — Witness:
        // witness_tm_geo_order_cycles.js W-TMREPRO-5/5b, scripts/probe_support_asymmetry.js):
        // this line STOPPED mirroring at #1345, which added isStairFlight() to hangGate's elPool
        // (:611) and to the scheduler's whole support pool (supportPool(), :1246) without touching
        // the audit twin here. Result, measured on 3 of 7 buildings: the scheduler REFUSES to hang
        // a stair flight on the landing it sits below, and the audit hangs it there anyway — 17
        // fleet-wide false "floating" verdicts (Terminal 4, HHS 4, LTU_AHouse 9), deficits as small
        // as 0.006 d. elPool's exact test, one concept, both sides.
        var tPool = (T.cls === 'IfcSlab' && T.seq > 4) || T.cls === 'IfcStairFlight';
        var tWall = T.cls.indexOf('IfcWall') === 0;
        var seenH = {};
        for (c = 0; c < cs.length; c++) { arr = structGrid[cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { S = arr[k]; if (seenH[S.guid] || S.guid === T.guid) continue; seenH[S.guid] = 1;
            if (S.base_z >= T.top_z - GAP && S.base_z <= T.top_z + GAP && S.top_z > T.top_z + EPS &&
                !(tPool && T.base_z < S.base_z - EPS) &&
                !(tWall && S.cls === 'IfcSlab' && S.seq > 4 &&
                  T.base_z < S.base_z - EPS && T.top_z >= S.base_z - GAP) &&
                overlap(S, T)) {
              hasHang = true;
              var eh = sched[S.guid].end; if (eh > se) se = eh; } } }
        // §HANG_NEAREST — audit twin of the scheduler's fallback (hangGate/edgeCarrier above):
        // a BIG pure-sink hanger with zero in-band carriers is audited against the nearest
        // overlapping pool member above + its co-planar GAP band, exactly what the scheduler now
        // gates it on. Keeping audit and gate symmetric is what keeps floating at its locked
        // baselines (a wider audit alone would flag carriers the scheduler never waited for).
        if (!hasHang && !tPool && !tWall && bboxVol(T) > BIG_ELEMENT_VOL) {
          var nbA = Infinity, seenN = {};
          for (c = 0; c < cs.length; c++) { arr = structGrid[cs[c]]; if (!arr) continue;
            for (k = 0; k < arr.length; k++) { S = arr[k]; if (seenN[S.guid] || S.guid === T.guid) continue; seenN[S.guid] = 1;
              if (S.base_z > T.top_z + GAP && S.base_z < nbA && overlap(S, T)) nbA = S.base_z; } }
          if (nbA < Infinity) {
            var seenP = {};
            for (c = 0; c < cs.length; c++) { arr = structGrid[cs[c]]; if (!arr) continue;
              for (k = 0; k < arr.length; k++) { S = arr[k]; if (seenP[S.guid] || S.guid === T.guid) continue; seenP[S.guid] = 1;
                if (S.base_z > T.top_z + GAP && S.base_z <= nbA + GAP && overlap(S, T)) {
                  hasHang = true;
                  var ehn = sched[S.guid].end; if (ehn > se) se = ehn; } } }
          }
        }
      }
      if (se > 0 && sched[T.guid].start < se - 1) { v++; if (collectGuids) collectGuids.push(T.guid); }
      // §SUPPORT_UNCHECKED (warn-only, additive) — 4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11 1a/1c,
      // Witness: witness_big_element_support_coverage.js. Zero candidates in EITHER scoped pool ⇒
      // this element scheduled with NO support check applied at all (the seam a big element falls
      // through). 1c exemption: seq===1 (phase==='Substructure') legitimately rests on unmodeled
      // soil, never flagged. Does NOT touch v / the floating flag — observability only.
      if (!hasBearing && !hasHang && T.seq !== 1) {
        var _vol = (T.x1 - T.x0) * (T.y1 - T.y0) * (T.top_z - T.base_z);
        if (_vol > BIG_ELEMENT_VOL) {
          console.log('§SUPPORT_UNCHECKED guid=' + T.guid + ' cls=' + T.cls + ' vol=' + _vol.toFixed(3) +
            ' buildingModelsSubstructure=' + bms);
          if (collectUnchecked) collectUnchecked.push({ guid: T.guid, cls: T.cls, vol: _vol, buildingModelsSubstructure: bms });
        }
      }
    }
    return v;
  }

  // deriveZones(elements, schedule) — CPM_FLOAT_GAP.md Gap 1 (element-level, rolled up). Rolls the
  // ALREADY-COMPUTED, ALREADY-PROVEN per-element real start/end times (from computeSchedule — the
  // same numbers the live Time Machine movie plays) up into readable (phase × real floor) zones, and
  // derives real CPM-solvable edges between them — WITHOUT re-deriving or duplicating any of
  // computeSchedule's own gating math. Every edge here traces to an OBSERVED pair of real start
  // times already produced by the proven scheduler, not a re-simulation of its rules:
  //   (a) within-phase, across adjacent real floors (the §4D_BAND_MONOTONIC relationship, rolled up)
  //   (b) same real floor, across phases in the order they actually started (the PASS-B per-storey
  //       trade-order gate, rolled up)
  // DAG-safety is structural, not asserted: every edge is only added pred→succ when
  // zone[pred].start <= zone[succ].start (ties broken by phase sequence, then zone id) — so the
  // whole graph is consistent with one global "real start time" ordering and cannot cycle by
  // construction; computeCpm's cycle guard is defence-in-depth, not the primary safeguard here.
  // Returns { zones: [{id,phase,storey,rank,start,end,guids,count}], edges: [{predId,succId,lagMs}] }.
  // storeyMergeMap: same optional §S18 parameter as deriveBandRanks — applied identically here so a
  // zone's storey label and the rank it looks up (both keyed by the SAME merged name) never diverge.
  function deriveZones(elements, schedule, storeyMergeMap) {
    var ranks = deriveBandRanks(elements, storeyMergeMap).bandRank;
    var byZone = {};   // zoneId -> { phase, storey, rank, seq, guids:[], start:Infinity, end:-Infinity }
    elements.forEach(function (e) {
      var st = schedule[e.guid]; if (!st) return;   // unscheduled (e.g. a class computeSchedule skipped)
      var storey = collapsePhase(e.storey);
      if (storeyMergeMap && storeyMergeMap[storey]) storey = storeyMergeMap[storey];
      var zid = (e.phase || '_UNPHASED') + '||' + storey;
      var z = byZone[zid] || (byZone[zid] = {
        id: zid, phase: e.phase || '_UNPHASED', storey: storey, rank: ranks[storey],
        seq: e.seq, guids: [], start: Infinity, end: -Infinity
      });
      if (e.seq < z.seq) z.seq = e.seq;   // representative sequence = the zone's earliest trade
      z.guids.push(e.guid);
      if (st.start < z.start) z.start = st.start;
      if (st.end > z.end) z.end = st.end;
    });
    var zones = Object.keys(byZone).map(function (k) { var z = byZone[k]; z.count = z.guids.length; return z; });

    var edges = [], edgeSeen = {};
    function addEdge(pred, succ) {
      if (!pred || !succ || pred.id === succ.id) return;
      if (pred.start > succ.start) return;                    // structural DAG guard — see header
      var key = pred.id + '->' + succ.id; if (edgeSeen[key]) return; edgeSeen[key] = 1;
      // §ZONE_EDGE_LEAD (2026-08-04, prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT):
      // the lag used to be Math.max(0, succ.start - pred.end), which CLAMPED AWAY every real overlap.
      // Zones genuinely run in parallel (crews work floor N+1 while floor N finishes), so whenever
      // succ.start < pred.end the true relationship is a NEGATIVE lag — a "lead" in P6/MSP terms,
      // written FS-5d. Clamping it to 0 persisted an FS+0 edge asserting "successor starts at or
      // after predecessor finishes", which the zone's OWN dates then contradicted.
      // MEASURED before the fix (witness_gantt_edit_constraints.js G-CON-1, Terminal): 53 of 105
      // persisted edges were violated by the very dates materializeZones wrote alongside them.
      // This was invisible to computeCpm(fixedDates:true) — that path trusts the real dates and only
      // derives float — but it is load-bearing the moment the edges become drag CONSTRAINTS: a clamp
      // built on FS+0 refuses legal moves, and a cascade pushes bars that never needed to move.
      // Negative lag is standard scheduling semantics, not an invention, and it reproduces the real
      // observed element times exactly instead of approximating them.
      edges.push({ predId: pred.id, succId: succ.id, lagMs: succ.start - pred.end });
    }
    // (a) within-phase, adjacent REAL floor (rank) — the rolled-up band-monotonic relationship.
    var byPhase = {};
    zones.forEach(function (z) { if (z.rank != null) (byPhase[z.phase] = byPhase[z.phase] || []).push(z); });
    Object.keys(byPhase).forEach(function (ph) {
      var list = byPhase[ph].sort(function (a, b) { return a.rank - b.rank; });
      for (var i = 1; i < list.length; i++) addEdge(list[i - 1], list[i]);
    });
    // (b) same REAL floor, across phases in the order they actually started — the rolled-up
    // per-storey trade-order relationship (PASS B's phaseTrade[ph][seq] gate).
    var byStorey = {};
    zones.forEach(function (z) { (byStorey[z.storey] = byStorey[z.storey] || []).push(z); });
    Object.keys(byStorey).forEach(function (st) {
      var list = byStorey[st].sort(function (a, b) { return (a.start - b.start) || (a.seq - b.seq); });
      for (var i = 1; i < list.length; i++) addEdge(list[i - 1], list[i]);
    });
    console.log('§ZONE_CPM zones=' + zones.length + ' edges=' + edges.length +
      ' (within-phase-band=' + Object.keys(byPhase).reduce(function (s, k) { return s + Math.max(0, byPhase[k].length - 1); }, 0) +
      ', same-floor-cross-phase≈' + (edges.length - Object.keys(byPhase).reduce(function (s, k) { return s + Math.max(0, byPhase[k].length - 1); }, 0)) + ')');
    return { zones: zones, edges: edges };
  }

  // EPS/GAP exported alongside CELL so a consumer of the same geometry (time_machine.js
  // §MIDAIR_REPAIR) can test contact with THIS module's measured constants instead of re-typing
  // them — a second copy is a second thing to drift.
  // SHIFT_MS/DAY_MS + the two mappers are exported for the same reason EPS/GAP/CELL are: the live
  // movie clock (time_machine.js injectGantt's scaleFactor/projectDays) must size a day with THIS
  // module's shift, not a second hand-typed 8h constant to drift (§TM_DURATION_SYNC's lesson).
  // §S26.2 (2026-08-19, prompts/4D_GANTT_TM_REFACTOR.md) — the SUPPORT POOL, expressed once and
  // exported. This is not a new concept: it is verbatim the membership test computeSchedule's
  // geoGate already used inline (`el.seq <= 4 || isPromotedSlab(el) || isStairFlight(el)`), lifted
  // to module scope so designatedSupport() in cpm_schedule.js and _designatedSupport() in
  // time_machine.js can ask the same question instead of treating every touching box as structure.
  // Measured on Duplex (§S26.2): support = anything below gives 4,706 bearing relations and 761
  // physics-vs-phase contradictions; support = load-bearing classes gives 702 and 1. The 760
  // difference is the engine insisting a pipe must be installed before the wall above it.
  function supportPool(e) {
    return e.seq <= 4 ||                                   // PASS-A structure
           (e.cls === 'IfcSlab' && e.seq > 4) ||           // §DEQ_V1 promoted roof slab
           e.cls === 'IfcStairFlight';                     // §STAIR_FLIGHT_GRID_VISIBILITY
  }

  var API = { supportPool: supportPool, computeSchedule: computeSchedule, collapsePhase: collapsePhase, elementsInPhase: elementsInPhase, auditFloating: auditFloating, deriveBandRanks: deriveBandRanks, deriveZones: deriveZones, deriveStoreyMergeMap: deriveStoreyMergeMap, hostPairs: hostPairs, openingPairs: openingPairs, groundworkSlabs: groundworkSlabs, CELL: CELL, EPS: EPS, GAP: GAP, BIG_ELEMENT_VOL: BIG_ELEMENT_VOL, SHIFT_MS: SHIFT_MS, DAY_MS: DAY_MS, toProductive: toProductive, toWall: toWall };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
