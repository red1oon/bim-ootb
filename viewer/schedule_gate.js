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

  // deriveBandRanks(elements) — the §4D_BAND_MONOTONIC ladder (see computeSchedule's header for the
  // full ruling): storeys grouped by collapsePhase(), each ranked by the MEDIAN base_z of its own
  // elements, ascending. Extracted verbatim from computeSchedule's own `deriveRanks` IIFE (pure
  // refactor, zero behavior change — computeSchedule below now calls this instead of inlining it) so
  // a second consumer (schedule_author.js's zone-level CPM rollup) can get the SAME real floor order
  // without a duplicate copy of this math to drift out of sync with the live scheduler.
  // Returns { bandRank: {collapsedStorey: rank}, rankList: [{ph,z,n}, ...], unbanded: N }.
  function deriveBandRanks(elements) {
    var byPhase = {};
    elements.forEach(function (e) {
      var ph = collapsePhase(e.storey);
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
    var grid = {}, wallGrid = {}, out = {}, c, cs, k, arr, S;
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
      var elPool = el.seq <= 4 || isPromotedSlab(el);
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
          var contained = !below && !elPool && !S.promoted && S.base_z > el.base_z + EPS && S.top_z < el.top_z + EPS;
          if ((below || contained) && S.end > g && overlap(S, el)) g = S.end; } }
      return g;
    }
    // §DEQ_V1 (2026-08-07, 4D_SCHEDULE_PERFECTION.md §DEQ_V1_IMPL): a slab the load-path rule promoted
    // to roof role (seq>4) is REAL STRUCTURE — the ceiling everything beneath it hangs from — so it
    // joins the same support grid as PASS-A structure. As a support it sits ABOVE what it carries, so
    // the bearing-below predicate almost never matches it; only hangGate reads it upward.
    function isPromotedSlab(e) { return e.cls === 'IfcSlab' && e.seq > 4; }
    function place(el, start) {
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      var end = start + dur; out[el.guid] = { start: start, end: end };
      if (el.seq <= 4 || isPromotedSlab(el)) {
        var rec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, top_z: el.top_z, end: end, guid: el.guid,
                    promoted: isPromotedSlab(el) };
        (recsByGuid[el.guid] = recsByGuid[el.guid] || []).push(rec);
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(rec); }
      else if (el.cls && el.cls.indexOf('IfcWall') === 0) {   // §4D_WALLS_BEFORE_ROOF M5
        var wrec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, top_z: el.top_z, end: end, guid: el.guid };
        (recsByGuid[el.guid] = recsByGuid[el.guid] || []).push(wrec);
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(wrec); }
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
      var elPool = isPromotedSlab(el);     // §GEOMETRIC_SUPPORT_ORDER — see geoGate's pool rule
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (S.guid === el.guid) continue;
          // carrier's TOP strictly above mine (antisymmetric — same-z sibling slabs otherwise carry
          // each other, an unsatisfiable cycle for the repair loop; an embedding slab still tops me)
          // …and a pool member never hangs from what it sits BELOW of (S resting on el is not el's
          // carrier — the reverse below edge already orders the pair; same rule as geoGate's).
          if (S.base_z >= el.top_z - GAP && S.base_z <= el.top_z + GAP && S.top_z > el.top_z + EPS &&
              !(elPool && el.base_z < S.base_z - EPS) &&
              S.end > g && overlap(S, el)) g = S.end; } }
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
          if (S.base_z < el.base_z - EPS && S.top_z >= el.base_z - GAP && S.end > g && overlap(S, el)) g = S.end; } }
      return g;
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
      if (P.seq <= 4 || isPromotedSlab(P)) { cs = cellsOf(P); for (c = 0; c < cs.length; c++) (structIdxGrid[cs[c]] = structIdxGrid[cs[c]] || []).push(t); }
      else if (P.cls && P.cls.indexOf('IfcWall') === 0) { cs = cellsOf(P); for (c = 0; c < cs.length; c++) (wallIdxGrid[cs[c]] = wallIdxGrid[cs[c]] || []).push(t); } }
    // pair predicates — one definition, used for both indegree count and decrement-on-place
    function edgeBelow(S, E)     { return S.base_z < E.base_z - EPS; }                          // geoGate "below"
    function edgeContained(S, E) { return !edgeBelow(S, E) && !isPromotedSlab(S) && S.base_z > E.base_z + EPS && S.top_z < E.top_z + EPS; }  // geoGate §GEO_SUPPORT_LEAK clause
    function edgeBearing(S, E)   { return S.base_z < E.base_z - EPS && S.top_z >= E.base_z - GAP; }  // wallGate / hasBearingBelow
    function edgeCarrier(S, E)   { return S.base_z >= E.top_z - GAP && S.base_z <= E.top_z + GAP && S.top_z > E.top_z + EPS; }  // hangGate
    var indeg = new Int32Array(N), succs = new Array(N), hangs = new Uint8Array(N), _edges = 0;
    // stamp-array dedup (an {} per element measured 28s at 15k elements — dictionary churn), and a
    // reused cands array; _gen is bumped once per scan so stamps never need clearing
    var stamp = new Int32Array(N), _gen = 0, cands = [], nc;
    for (t = 0; t < N; t++) {
      var E = elements[t], hasB = false, isPoolE = E.seq <= 4 || isPromotedSlab(E);
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
      for (nc = 0; nc < cands.length; nc++) { si = cands[nc]; S = elements[si];
        if (edgeBelow(S, E) || (!isPoolE && edgeContained(S, E)) ||
            (hangs[t] && edgeCarrier(S, E) && !(isPoolE && E.base_z < S.base_z - EPS))) {
          (succs[si] = succs[si] || []).push(t); indeg[t]++; _edges++; } }
      if (isPromotedSlab(E)) {                                       // wallGate's relation
        _gen++;
        for (c = 0; c < cs.length; c++) { arr = wallIdxGrid[cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { si = arr[k]; if (si === t || stamp[si] === _gen) continue; stamp[si] = _gen;
            S = elements[si]; if (!overlap(S, E)) continue;
            if (edgeBearing(S, E)) { (succs[si] = succs[si] || []).push(t); indeg[t]++; _edges++; } } }
      }
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
      var start = Math.max(geoGate(el), wallGate(el), hangGate(el), tg, bg, slot.time);   // §4D_WALLS_BEFORE_ROOF M5 + §DEQ_V1
      if (bg > baseMs && bg >= Math.max(geoGate(el), wallGate(el), tg)) _bmGatedB++;
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
      console.log('§GEO_ORDER n=' + N + ' edges=' + _edges + ' orderMs=' + (Date.now() - _t0));
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
    var _rIter = 0, _rMovedTot = 0;
    for (; _rIter < 16; _rIter++) {
      var _moved = 0;
      nonst.slice().sort(function (a, b) { return out[a.guid].start - out[b.guid].start; })
        .forEach(function (el) {
        var need = Math.max(geoGate(el), wallGate(el), hangGate(el));
        var o = out[el.guid];
        if (o.start < need) {
          var dur = o.end - o.start; o.start = need; o.end = need + dur;
          var rl = recsByGuid[el.guid];
          if (rl) for (var q = 0; q < rl.length; q++) rl[q].end = o.end;
          _moved++;
        }
      });
      _rMovedTot += _moved;
      if (!_moved) break;
    }
    if (typeof console !== 'undefined' && console.log)
      console.log('§DEQ_REPAIR sweeps=' + _rIter + ' shifted=' + _rMovedTot + ' (0=order already dependency-consistent)');
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
  function auditFloating(elements, sched, classFilter) {
    var structGrid = {}, wallGrid = {}, i, c, cs, k, arr, S;
    for (i = 0; i < elements.length; i++) { var e = elements[i];
      if (e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4)) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (structGrid[cs[c]] = structGrid[cs[c]] || []).push(e); }
      else if (e.cls.indexOf('IfcWall') === 0) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(e); } }
    var v = 0;
    for (i = 0; i < elements.length; i++) { var T = elements[i];
      if (classFilter && !classFilter(T)) continue;
      var se = 0, hasBearing = false, seen = {}; cs = cellsOf(T);
      var pools = (T.cls === 'IfcSlab' && T.seq > 4) ? [structGrid, wallGrid] : [structGrid];
      for (var p = 0; p < pools.length; p++) {
        for (c = 0; c < cs.length; c++) { arr = pools[p][cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { S = arr[k]; if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
            if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
              hasBearing = true;
              var en = sched[S.guid].end; if (en > se) se = en; } } }
      }
      if (!hasBearing && T.seq > 4) {      // hangs — audit against its carrier above instead
        // §GEOMETRIC_SUPPORT_ORDER: a pool member (promoted slab) never hangs from what it sits
        // BELOW of — mirrors the scheduler's hangGate pool rule, so audit and scheduler agree
        var tPool = T.cls === 'IfcSlab' && T.seq > 4;
        var seenH = {};
        for (c = 0; c < cs.length; c++) { arr = structGrid[cs[c]]; if (!arr) continue;
          for (k = 0; k < arr.length; k++) { S = arr[k]; if (seenH[S.guid] || S.guid === T.guid) continue; seenH[S.guid] = 1;
            if (S.base_z >= T.top_z - GAP && S.base_z <= T.top_z + GAP && S.top_z > T.top_z + EPS &&
                !(tPool && T.base_z < S.base_z - EPS) && overlap(S, T)) {
              var eh = sched[S.guid].end; if (eh > se) se = eh; } } }
      }
      if (se > 0 && sched[T.guid].start < se - 1) v++;
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
  function deriveZones(elements, schedule) {
    var ranks = deriveBandRanks(elements).bandRank;
    var byZone = {};   // zoneId -> { phase, storey, rank, seq, guids:[], start:Infinity, end:-Infinity }
    elements.forEach(function (e) {
      var st = schedule[e.guid]; if (!st) return;   // unscheduled (e.g. a class computeSchedule skipped)
      var storey = collapsePhase(e.storey);
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

  var API = { computeSchedule: computeSchedule, collapsePhase: collapsePhase, elementsInPhase: elementsInPhase, auditFloating: auditFloating, deriveBandRanks: deriveBandRanks, deriveZones: deriveZones, CELL: CELL };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
