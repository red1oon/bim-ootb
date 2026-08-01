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
    var _bandRank = {}, _rankList = [], _unbanded = 0;
    (function deriveRanks() {
      var byPhase = {};
      elements.forEach(function (e) {
        var ph = collapsePhase(e.storey);
        (byPhase[ph] = byPhase[ph] || []).push(e.base_z);
      });
      var rows = [];
      for (var ph in byPhase) {
        // ⚠ THE UNKNOWN BUCKET IS NOT A FLOOR. Caught by this rule's own ladder line on the very
        // first Hospital run: `Unknown@184.5m(9457)` took a rank BETWEEN Level 3 and Level 4. Those
        // 9,457 elements are the ones with no storey of their own (the same population
        // §GANTT_STOREY_Z reassigns by median Z); they are scattered through the whole building, so
        // their median z is a centroid, not a level. Ranking them would (a) gate all 9,457 against
        // Level 3 as if they were one floor and (b) hold every Level 4 trade behind that fiction.
        // A band rule laid on a wrong grouping enforces a wrong order CONFIDENTLY — which is the
        // failure mode the ruling explicitly warned about. So the bucket is excluded from the
        // ladder: its elements keep every geometric gate ("nothing without support" is untouched)
        // and simply take no band constraint. Refusing to order what cannot be placed is the honest
        // degradation; inventing a floor for it is not.
        if (ph === '_UNKNOWN' || /^unknown$/i.test(ph)) { _unbanded += byPhase[ph].length; continue; }
        var zs = byPhase[ph].slice().sort(function (a, b) { return a - b; });
        rows.push({ ph: ph, z: zs[Math.floor(zs.length / 2)], n: zs.length });
      }
      rows.sort(function (a, b) { return a.z - b.z; });
      rows.forEach(function (r, i) { _bandRank[r.ph] = i; });
      _rankList = rows;
    })();
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
      // §4D_WALL_BORNE_STRUCTURE: a load-bearing wall enters the STRUCTURE grid, so geoGate gates
      // everything above it exactly as it gates a column or a beam. It ALSO stays in wallGrid below —
      // the same wall can carry a beam and cap a roof slab, and both gates must keep seeing it.
      if (el.seq <= 4 || _lbw[el.guid]) {
        var rec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, end: end };
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(rec); }
      if (el.seq > 4 && el.cls && el.cls.indexOf('IfcWall') === 0) {   // §4D_WALLS_BEFORE_ROOF M5
        var wrec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, top_z: el.top_z, end: end };
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(wrec); }
      return end;
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
    // §4D_WALL_BORNE_STRUCTURE widened this from `IfcSlab` to EVERY seq>4 class. The slab-only scope
    // was correct for §4D_WALLS_BEFORE_ROOF's question but left 385 measured violations after the
    // PASS A promotion above: things resting on walls that carry no structure (so those walls stayed
    // in PASS B), plus wall-on-wall. Safe and order-preserving by construction — wallGrid holds only
    // walls ALREADY PLACED in this pass, so a class scheduled before walls (MEP is seq 5, walls are
    // seq 6) simply finds an empty pool and is unaffected, while doors/coverings/walls above them do
    // get gated. No new pass, no reordering, so it cannot manufacture a floating element.
    function wallGate(el) {
      if (el.seq <= 4) return baseMs;
      var g = baseMs; cs = cellsOf(el);
      for (c = 0; c < cs.length; c++) { arr = wallGrid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k];
          if (S.base_z < el.base_z - EPS && S.top_z >= el.base_z - GAP && S.end > g && overlap(S, el)) g = S.end; } }
      return g;
    }
    // §4D_WALL_BORNE_STRUCTURE (2026-08-02, prompts/GANTT_ACCURACY.md §SUPPORT_ALL) — A WALL THAT
    // CARRIES STRUCTURE IS STRUCTURE. User's standing invariant: "as long as the 4D schedule does not
    // put anything without support first." It did not hold, and for structure it could not:
    //   place() wrote the support grid only for seq<=4; geoGate reads that grid; walls are seq 6
    //   (PASS B); beams/columns/members/plates/slabs are seq<=4 (PASS A); PASS A completes before
    //   PASS B begins. A beam bearing on a wall was therefore NEVER gated on that wall — 6,778
    //   violations MEASURED on real Hospital (beams 1294, members 708, columns 181, plates 162,
    //   slabs 34 bearing on walls; worst 100.5 days early), while §SUPPORT_CHECK reported floating=0
    //   because auditFloating offers its wall pool ONLY to `IfcSlab && seq>4` — the roof case.
    // This is the SAME defect §4D_ROOF_LOAD_PATH (#1120) and §4D_WALLS_BEFORE_ROOF (#1128) fixed for
    // roof slabs by moving them across the pass boundary. Generalised here to the whole load path.
    //   THE RULE: a wall is load-bearing when some seq<=4 element RESTS on it — the wall tops out at
    //   that element's underside (|top_z - base_z| <= GAP), starts below it, and overlaps in XY.
    //   "Rests on" not "runs past": `top_z >= base_z - GAP` alone accepts any wall taller than my
    //   base, which counted pipe risers threading past 3m walls (measured: 29,759 vs 6,778).
    //   Load-bearing walls JOIN PASS A and are written into the structure grid, so everything above
    //   them — structure and non-structure alike — is gated on them by the existing geoGate. No new
    //   gate, no new constant, no cycle: PASS A is sorted by base_z ascending and a carrier's base_z
    //   is strictly below what it carries, so every carrier is placed before its dependent.
    //   MEASURED on Hospital: 1243/1468 walls (84.7%) carry structure — but that is only 2.44% of
    //   PASS B, and PASS A's bottom-up-by-base_z order is itself monotonic in height, so what those
    //   walls lose in band gating they largely regain in ordering. Both counters are gated below.
    var _lbw = {}, _lbwN = 0, _borneN = 0;
    (function deriveLoadBearingWalls() {
      var wIdx = {}, i, j, cs2, c2, arr2;
      for (i = 0; i < elements.length; i++) {
        var W = elements[i];
        if (!W.cls || W.cls.indexOf('IfcWall') !== 0) continue;
        cs2 = cellsOf(W);
        for (c2 = 0; c2 < cs2.length; c2++) (wIdx[cs2[c2]] = wIdx[cs2[c2]] || []).push(W);
      }
      for (i = 0; i < elements.length; i++) {
        var T = elements[i];
        if (T.seq > 4) continue;
        var seen2 = {}, borne = false;
        cs2 = cellsOf(T);
        for (c2 = 0; c2 < cs2.length; c2++) {
          arr2 = wIdx[cs2[c2]]; if (!arr2) continue;
          for (j = 0; j < arr2.length; j++) {
            var W2 = arr2[j]; if (seen2[W2.guid]) continue; seen2[W2.guid] = 1;
            if (W2.base_z < T.base_z - EPS && Math.abs(W2.top_z - T.base_z) <= GAP && overlap(W2, T)) {
              if (!_lbw[W2.guid]) { _lbw[W2.guid] = 1; _lbwN++; }
              borne = true;
            }
          }
        }
        if (borne) _borneN++;
      }
    })();

    // PASS A — structure, bottom-up by base_z (supports scheduled before what rests on them).
    // §CREW-CAP: crew slot is picked PROJECT-WIDE per resource, not per Z-band — lower floors claim
    // the limited crews first (processing order is already bottom-up), higher floors cascade behind.
    // §4D_WALL_BORNE_STRUCTURE: load-bearing walls join PASS A. base_z-ascending is what makes this
    // safe — a carrier's base_z is strictly below what it carries, so the wall is always placed
    // before the beam/column/slab that rests on it, without a second pass or a dependency solve.
    var struct = elements.filter(function (e) { return e.seq <= 4 || _lbw[e.guid]; })
      .sort(function (a, b) { return (a.base_z - b.base_z) || (a.seq - b.seq); });
    function runPassA() {
      struct.forEach(function (el) {
      var slot = claimCrew(el.resource);
      // §4D_BAND_MONOTONIC deliberately does NOT gate PASS A. Both alternatives were measured on
      // real Hospital geometry and both were rejected:
      //   - band-gate WITHOUT re-sorting: structure inversions 551 -> 519 (6%). bandTrade[r-1] gets
      //     read before that band is fully placed, so the gate is a lower bound and does almost
      //     nothing. Carrying code that implies structure is handled when it is not is worse than
      //     not carrying it.
      //   - band-gate WITH re-sorting by rank: inversions -> 0, but 2,341 elements FLOAT again
      //     (beams 15/1970, members 2304/7127, slabs 22/35). geoGate reads `grid`, which holds only
      //     what is already placed, so re-ordering PASS A places elements before their own supports.
      //     That is the 1127/1970 defect the support gate exists to kill. Ruling A keeps "nothing
      //     without support" as the hard role-blind gate, so floating WINS.
      // Structure sequencing therefore stays bottom-up-by-base_z + support gate, unchanged, and
      // cross-storey structural ordering is a NAMED OPEN ITEM rather than a silently weak gate.
      // ⚠ The user's other symptom, "the floor slabs coming on too fast", is NOT an ordering defect
      // and is not addressed here: structure inversions were only 551/2316 to begin with, while the
      // non-structure count was 29,824. A burst of slabs is a RATE — a whole floor plate becomes
      // eligible the moment the columns under it top out, then competes only for CONCRETE_GANG's
      // 3 crews. Fixing that means crew caps / eligibility smoothing, not monotonicity.
      // §4D_WALL_BORNE_STRUCTURE: the promoted walls — and ONLY them — keep the band gate they had in
      // PASS B, read from a FROZEN pre-pass ladder (see runPassA below). Reading it LIVE was measured
      // and is not enough: non-structure inversions 0 -> 1,026, worst only 115d -> 108d, because
      // PASS A is ordered by base_z so bandTrade[r-1] is still filling when rank r is reached — the
      // same "gate without re-sorting is a lower bound" this comment already records for structure.
      var start = Math.max(geoGate(el), slot.time,
                           (_frozenBand && _lbw[el.guid]) ? frozenBandGate(el) : baseMs);
      var end = place(el, start);
      bandCommit(el, end);
      slot.commit(end);
      });
    }
    // §4D_WALL_BORNE_STRUCTURE — TWO-PHASE PASS A. This is `prompts/GANTT_ACCURACY.md` open item 2's
    // own proposal ("gating on bandTrade[r-1] computed from a PRE-PASS rather than read live"), and
    // it is what makes the promotion free of the band regression. Phase 1 places PASS A with no band
    // gate and yields a COMPLETE bandTrade ladder; phase 2 resets and replays the IDENTICAL element
    // order, now able to read a finished ladder.
    //   WHY THIS DOES NOT REINTRODUCE FLOATING (Ruling A's prohibition, honoured): the ban is on
    //   RE-SORTING PASS A — geoGate reads `grid`, which holds only what is already placed, so a new
    //   ORDER places elements before their own supports. Phase 2 keeps the order byte-for-byte and
    //   only ever moves a start LATER (every term enters through Math.max). Supports can therefore
    //   only finish later, never earlier, and `start >= geoGate` still holds for every element.
    //   Cost: PASS A runs twice — 13.7k elements against PASS B's 50.9k, so a minority of the work.
    function frozenBandGate(el) {
      var r = _bandRank[collapsePhase(el.storey)];
      if (!(r > 0)) return baseMs;
      var below = _frozenBand[r - 1];
      return (below && below[el.seq] > baseMs) ? below[el.seq] : baseMs;
    }
    var _frozenBand = null;
    runPassA();                       // phase 1 — provisional, builds the complete ladder
    _frozenBand = bandTrade;          // freeze it
    bandTrade = {}; grid = {}; wallGrid = {}; out = {}; crews = {};
    runPassA();                       // phase 2 — same order, complete ladder
    // PASS B — non-structure, by trade then base_z, on the COMPLETED structure grid.
    // Per-Level trade gate: trade k waits for all lower trades (s<k) in its Level → MEP late, furniture last.
    // §CREW-CAP: same shared project-wide crew pool as PASS A (a resource like CONCRETE_GANG appears
    // in both — foundations here, ramps there — real crews don't duplicate across passes).
    // §4D_BAND_MONOTONIC: sort is (seq, RANK, base_z) — rank inserted deliberately. PASS B walks one
    // trade at a time, so ordering by rank inside a trade means every element of rank r-1 for THIS
    // trade is placed before rank r is reached, and bandTrade[r-1][seq] is complete rather than a
    // partial max. Unlike PASS A this cannot disturb geoGate: PASS B never writes the structure grid
    // it reads (structure is entirely placed by then), so its order cannot create a floating element.
    var nonst = elements.filter(function (e) { return e.seq > 4 && !_lbw[e.guid]; })
      .sort(function (a, b) {
        return (a.seq - b.seq) ||
               ((_bandRank[collapsePhase(a.storey)] || 0) - (_bandRank[collapsePhase(b.storey)] || 0)) ||
               (a.base_z - b.base_z);
      });
    var phaseTrade = {};
    nonst.forEach(function (el) {
      var ph = collapsePhase(el.storey);
      var pt = phaseTrade[ph] || {}, tg = baseMs, s;
      for (s in pt) if (+s < el.seq && pt[s] > tg) tg = pt[s];
      var slot = claimCrew(el.resource);
      // §4D_BAND_MONOTONIC: the "upper floors gets walled first" half — the cross-storey term that
      // did not exist. Walls are seq 6, so this is a wall waiting for the walls one floor down.
      var bg = bandGate(el);
      var start = Math.max(geoGate(el), wallGate(el), tg, bg, slot.time);   // §4D_WALLS_BEFORE_ROOF M5
      if (bg > baseMs && bg >= Math.max(geoGate(el), wallGate(el), tg)) _bmGatedB++;
      var end = place(el, start);
      if (bg > baseMs && start - bg > _bmMaxLagMs) _bmMaxLagMs = start - bg;
      bandCommit(el, end);
      slot.commit(end);
      (phaseTrade[ph] = phaseTrade[ph] || {});
      if (!(phaseTrade[ph][el.seq] > end)) phaseTrade[ph][el.seq] = end;
    });
    // The ladder this rule is standing on, printed so it can be audited rather than trusted — see
    // the §GANTT_STOREY_Z reassignment warning in the header comment above.
    if (typeof console !== 'undefined' && console.log) {
      console.log('§4D_BAND_MONOTONIC ranks=' + _rankList.length +
        ' gatedB=' + _bmGatedB + ' unbanded=' + _unbanded + ' (passA intentionally ungated)' +
        ' ladder=[' + _rankList.map(function (r) {
          return r.ph + '@' + r.z.toFixed(1) + 'm(' + r.n + ')';
        }).join(', ') + ']');
      // §4D_WALL_BORNE_STRUCTURE — logged, not trusted. If loadBearingWalls is 0 on a building that
      // clearly has masonry carrying beams, the rests-on predicate missed and the invariant is NOT
      // being enforced, whatever auditSupport then reports.
      console.log('§4D_WALL_BORNE_STRUCTURE loadBearingWalls=' + _lbwN +
        ' carrying=' + _borneN + ' structural elements — these walls moved from PASS B into PASS A' +
        ' and into the structure grid, so geoGate now gates everything resting on them' +
        ' (0 would mean the rests-on test found nothing and the invariant is unenforced)');
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

  // §4D_WALL_BORNE_STRUCTURE audit (2026-08-02) — the instrument for the user's standing invariant,
  // "the 4D schedule does not put anything without support first". SEPARATE from auditFloating on
  // purpose: that function's pool and predicate are load-bearing for three shipped witnesses and its
  // narrow scope is correct FOR WHAT IT ASKS. This asks the wider question, with the predicate that
  // makes the wider question answerable.
  //
  // ⚠ CORRECTS THE CONCLUSION IN auditFloating's HEADER ABOVE. That header records attempt 1 —
  // "grid = structure PLUS walls, offered to everything" — producing 3,421 false positives, mostly
  // "IfcBeam floats over IfcWallStandardCase", and concludes "Walls do not structurally carry beams/
  // members/furniture in this DB." The DATA was right and the CONCLUSION was wrong: attempt 1 used
  // `S.top_z >= T.base_z - GAP`, which accepts ANY carrier taller than my base, so a beam running
  // alongside a 3m wall read as carried by it. Re-measured 2026-08-02 with the rests-on predicate
  // (`|S.top_z - T.base_z| <= GAP`, carrier tops out AT my underside): the same widening gives 6,778,
  // and 2,379 of them ARE beams/members/columns/plates/slabs genuinely bearing on wall tops. Walls
  // carry structure in this DB in 1,243 places. The false-positive count was a predicate artifact,
  // not evidence of absence — which is why "roof before walls" kept returning in a new costume.
  function auditSupport(elements, sched) {
    var carrierGrid = {}, i, c, cs, k, arr, S;
    for (i = 0; i < elements.length; i++) { var e = elements[i];
      if (e.seq <= 4 || (e.cls && e.cls.indexOf('IfcWall') === 0)) {
        cs = cellsOf(e); for (c = 0; c < cs.length; c++) (carrierGrid[cs[c]] = carrierGrid[cs[c]] || []).push(e); } }
    var v = 0, worst = 0;
    for (i = 0; i < elements.length; i++) { var T = elements[i];
      var ts = sched[T.guid]; if (!ts) continue;
      var se = 0, seen = {}; cs = cellsOf(T);
      for (c = 0; c < cs.length; c++) { arr = carrierGrid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
          if (S.base_z < T.base_z - EPS && Math.abs(S.top_z - T.base_z) <= GAP && overlap(S, T)) {
            var sc = sched[S.guid]; if (sc && sc.end > se) se = sc.end; } } }
      if (se > 0 && ts.start < se - 1000) { v++; if (se - ts.start > worst) worst = se - ts.start; }
    }
    return { violations: v, worstLagMs: worst };
  }

  var API = { computeSchedule: computeSchedule, collapsePhase: collapsePhase, elementsInPhase: elementsInPhase, auditFloating: auditFloating, auditSupport: auditSupport, CELL: CELL };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
