// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* schedule_gate.js — §gate (2026-05-30, two-pass: geometry + trade order)
 *                     §CREW-CAP (2026-07-18, real-world crew count)
 *                     §4D_BAND_MONOTONIC (2026-08-02, cross-storey trade ordering)
 *                     §ELEMENT_CPM (2026-08-02, THIS ENGINE — one walk of the extracted support DAG)
 * Support-gate scheduler for generated 4D (Time Machine) = "synthetic 4D" organised by phase/task,
 * the same shape a captured MS Project / IFC programme would have. Pure + app-agnostic so the browser
 * (time_machine.js) and the Node witness (tests/test_schedule_gate.js) run identical code.
 *
 * ══ §ELEMENT_CPM — WHY THE TWO-PASS SCHEDULER WAS REPLACED ══════════════════════════════════════
 * The old engine ran PASS A (structure, sorted by base_z) then PASS B (everything else, sorted by
 * (seq, rank, base_z)), each gate reading only what was ALREADY PLACED. That works only while the
 * sort order happens to agree with the constraint being gated, and on real geometry it does not:
 *   - the SUPPORT gate needs carriers placed first  -> demands a base_z (z-major) order
 *   - the BAND gate needs lower ranks placed first  -> demands a (seq, rank) (rank-major) order
 * and because a wall BOTH carries structure AND rests on structure, the two demand CONFLICTING sort
 * orders of the same elements. Five pass-level repairs were built and measured on real Hospital
 * geometry on 2026-08-02 and ALL FIVE were rejected — the table and the reason for each is in
 * prompts/GANTT_ACCURACY.md §ROOT CAUSE. The shipped two-pass engine left 6,778 elements (1,294 of
 * them IfcBeam) starting before the walls that carry them, which the user saw live as "beams
 * without support".
 *
 * base_z and (seq, rank) are both PROXIES for a topological order. Each encodes one constraint
 * family and loses the other. So this engine stops using a proxy and uses THE GRAPH:
 *   1. SUPPORT edges are EXTRACTED FROM GEOMETRY, never authored — S carries T when S starts below T,
 *      tops out at T's underside, and overlaps T in XY. Acyclic BY CONSTRUCTION: base_z strictly
 *      increases along every support edge, so no cycle is possible and no cycle-breaking is needed.
 *   2. ONE pass walks that DAG in topological order (Kahn), and among the nodes whose carriers are
 *      all finished it takes them in (seq, rank, base_z) priority — trade first, then floor, then
 *      height. So the walk is support-correct BY CONSTRUCTION and trade-ordered BY PREFERENCE.
 *   3. The trade gate and the band gate are then evaluated LIVE against that walk, and they are
 *      EXACT rather than lower bounds: the priority guarantees every lower trade on a storey is
 *      already placed when a higher one is reached — except where a carrier forces otherwise, which
 *      is precisely the conflict the ruling below settles, and each one is COUNTED.
 *
 * ⚠ SYNC NODES WERE TRIED FIRST AND MEASURED — do not re-attempt them. One milestone node per
 * (phase, seq), with trade/band as SOFT edges through them, plus a residual cycle-breaker. On real
 * Hospital it broke 155,170 of 160,726 soft edges: storey z-ranges OVERLAP, so an element on rank r
 * routinely carries one on rank r-1 with a different trade, and each such pair makes an entire
 * milestone cyclic. Support and floating both went to 0, but the trade train was destroyed — span
 * collapsed 176d -> 82d, gatedB=0, walls (seq 6) starting at day 25 while beams (seq 3) started at
 * day 42. Aggregating a milestone over elements at wildly different z is the error.
 *
 * ⚠ THIS IS NOT PHASE-LEVEL CPM AND MUST NOT BECOME IT. User's ruling, 2026-08-02: "Isn't CPM for
 * Phase level? CPM at element level is what supposed to be granted innately." A planner authoring
 * activities and logic links stays OUT of scope. Element precedence is a FACT OF THE GEOMETRY — the
 * edges are read, not invented, and nothing here dates or re-orders anything a human declared.
 *
 * ⚖ THE CYCLE RULING (user, 2026-08-02 — do not re-litigate): extracted geometry says wall-before-beam
 * in ~21.5k pairs where trade convention says structure-before-walls. SUPPORT WINS. Where a carrier
 * forces an element ahead of its own trade order the trade/band constraint YIELDS, and every such
 * override is COUNTED in the §ELEMENT_CPM log line — a wildly different count means the predicate
 * drifted, which is exactly what the number is there to catch.
 *
 * ε = 0.05m: a support need only start just below me — the thin slab a chair/duct sits on (~0.2m
 * below) counts. (ε=0.5 wrongly skipped it → furniture/flow floated.) Scope: GENERATED fallback only;
 * captured IFC 4D is absorbed verbatim by the overlay AFTER this.
 *
 * §CREW-CAP: user, live on Hospital — "It is an impossible timed Gantt chart to have all such work
 * at once, and within each the items should have a cascading flow." A FIXED, small number of crew
 * "slots" per resource (maxCrews param), shared PROJECT-WIDE. Elements reach the crew pool in
 * topological order, so lower/earlier work claims the limited crews first and later work waits for
 * BOTH its precedence and crew availability — exactly the two waits a real site has.
 */
(function (global) {
  'use strict';
  var CELL = 4;     // m — XY grid cell for the spatial support index
  var EPS  = 0.05;  // m — a support must start at least this far below me (excludes same-level peers)
  var GAP  = 0.5;   // m — a support tops within this of my base (the thing I bear on)
  var MAX_CREWS_DEFAULT = 3;  // §CREW-CAP: fallback crew count per resource when no lookup is given

  function cellsOf(e) {
    var o = [], i, j;
    for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o;
  }
  function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
  function _now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  // Collapse sub-storeys onto their Level so the phase list stays ~8 (user: "collapsing is better").
  // "Level 3 Ceiling" / "Level 3 TOS" -> "Level 3". Also the JSON phase key + the trade-gate group.
  function collapsePhase(storey) {
    if (!storey) return '_UNKNOWN';
    var s = String(storey).replace(/\s+(Ceiling|TOS|Top of Steel|Soffit|Slab)\b.*$/i, '').trim();
    return s || String(storey);
  }

  // ── A minimal binary heap over element ids, keyed by the STATIC (seq, rank, base_z) priority.
  // "Ready" means every carrier is finished; among the ready set this decides who goes next, so the
  // trade train is a PREFERENCE expressed here rather than a constraint that could fight gravity.
  // The key never changes, so there is no stale-key problem to handle.
  function Heap() { this.n = []; this.k = []; }
  Heap.prototype.push = function (id, key) {
    var n = this.n, k = this.k, i = n.length;
    n.push(id); k.push(key);
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      var t = n[p]; n[p] = n[i]; n[i] = t;
      var tk = k[p]; k[p] = k[i]; k[i] = tk;
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    var n = this.n, k = this.k, top = n[0], last = n.pop(), lastK = k.pop();
    if (n.length) {
      n[0] = last; k[0] = lastK;
      var i = 0, len = n.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < len && k[l] < k[m]) m = l;
        if (r < len && k[r] < k[m]) m = r;
        if (m === i) break;
        var t = n[m]; n[m] = n[i]; n[i] = t;
        var tk = k[m]; k[m] = k[i]; k[i] = tk;
        i = m;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.n.length; };

  // elements: [{ guid, cls, x0,x1,y0,y1, base_z, top_z, seq, storey, resource, installSecs }] (seq<=4 = structure)
  // maxCrews: optional — a plain number (uniform cap for every resource) or a { resource: N } lookup.
  //   Shared PROJECT-WIDE (not per-band, not per-Level) — see §CREW-CAP header comment.
  // returns { guid: { start, end } } ms.
  function computeSchedule(elements, baseMs, scaleFactor, maxCrews) {
    baseMs = baseMs || 0; scaleFactor = scaleFactor || 1;
    var N = elements.length, out = {}, i, j, c, cs, k, arr, S, T;
    var tBuild0 = _now();

    function crewCapFor(resource) {
      if (typeof maxCrews === 'number') return maxCrews;
      if (maxCrews && maxCrews[resource]) return maxCrews[resource];
      return MAX_CREWS_DEFAULT;
    }
    var crews = {};  // resource -> [nextFreeMs, ...] (length = that resource's crew cap)
    function claimCrew(resource) {                 // earliest-available of this resource's N crew slots
      var cap = crewCapFor(resource);
      var slots = crews[resource] || (crews[resource] = new Array(cap).fill(baseMs));
      var idx = 0;
      for (var q = 1; q < slots.length; q++) if (slots[q] < slots[idx]) idx = q;
      return { time: slots[idx], commit: function (end) { slots[idx] = end; } };
    }

    // ══ THE BAND LADDER — extracted, never invented ═══════════════════════════════════════════════
    // Storeys are grouped by the same collapsePhase() the trade gate keys on, each gets the MEDIAN
    // base_z of its own elements, and ranks are those medians in ascending order. A bungalow and a
    // hospital each get their own ladder; no constant, no assumed floor height.
    // ⚠ THE UNKNOWN BUCKET IS NOT A FLOOR. Caught by this rule's own ladder line on the first
    // Hospital run: `Unknown@184.5m(9457)` took a rank BETWEEN Level 3 and Level 4. Those elements
    // have no storey of their own and are scattered through the whole building, so their median z is
    // a centroid, not a level. They are excluded from the ladder: they keep every geometric gate
    // ("nothing without support" is untouched) and simply take no band constraint. Refusing to order
    // what cannot be placed is the honest degradation; inventing a floor for it is not.
    var _bandRank = {}, _rankList = [], _unbanded = 0;
    (function deriveRanks() {
      var byPhase = {};
      elements.forEach(function (e) {
        var ph = collapsePhase(e.storey);
        (byPhase[ph] = byPhase[ph] || []).push(e.base_z);
      });
      var rows = [];
      for (var ph in byPhase) {
        if (ph === '_UNKNOWN' || /^unknown$/i.test(ph)) { _unbanded += byPhase[ph].length; continue; }
        var zs = byPhase[ph].slice().sort(function (a, b) { return a - b; });
        rows.push({ ph: ph, z: zs[Math.floor(zs.length / 2)], n: zs.length });
      }
      rows.sort(function (a, b) { return a.z - b.z; });
      rows.forEach(function (r, idx) { _bandRank[r.ph] = idx; });
      _rankList = rows;
    })();

    // ══ THE BAND IS KEYED ON ELEVATION, NOT ON THE STOREY LABEL ═══════════════════════════════════
    // MEASURED, audit_rank_vs_support.js on real Hospital (81,722 support edges):
    //   by STOREY LABEL — 1,735 edges (2.1%) have the carrier's storey ranking ABOVE the storey it
    //                     carries ("Level 3 carries Level 2" 619 times, "Level 4 carries Level 3" 422)
    //   by ELEMENT z     — ZERO.
    // So "a trade may not run ahead of itself on the floor below" and "nothing before its carrier"
    // are UNSATISFIABLE TOGETHER while the floor is a label, and PERFECTLY COMPATIBLE once the floor
    // is an elevation. The contradiction was never in the schedule — it was in the key. Three engines
    // were measured fighting it (sync nodes, priority-only, group-barrier preconditions) before this
    // audit was written; the ladder itself is the thing that was wrong.
    // The ladder's median-z rows still DEFINE the bands (extracted, not invented — same rows, same
    // order, same _UNKNOWN exclusion); an element is simply assigned to the band its OWN base_z falls
    // in rather than to the band of whatever storey string it carries. An element with no storey and
    // an element with a wrong storey both land where gravity puts them.
    var phOf = new Array(N), rkOf = new Int32Array(N), seqOf = new Int32Array(N);
    var _zBounds = _rankList.map(function (r) { return r.z; }), _relabelled = 0;
    function zBandOf(bz) {
      var b = 0;
      for (var q = 0; q < _zBounds.length; q++) if (bz >= _zBounds[q]) b = q;
      return b;
    }
    // ⚖ BOTH GATES ON THE SAME ELEVATION KEY (user, 2026-08-02: "solve Z stacking as a construction
    // maths ... it is all first principles maths"). A carrier is ALWAYS lower than what it carries,
    // so base_z is a valid topological potential for the whole support relation — walk it in that
    // order and placing something before its carrier is impossible. The band gate is the same
    // statement ("lower z happens first"), so once both are keyed on elevation they point the SAME
    // direction and CANNOT conflict.
    //
    // ⚠ THE HALF-MEASURE WAS MEASURED AND FAILED — do not go back to it. Band on elevation with the
    // TRADE gate still on `collapsePhase(storey)` put 23,121 elements in two different groupings and
    // deadlocked the barrier across the two keys (33,960 yields, inversions 38,816). One key or the
    // conflict simply moves.
    //
    // The storey LABEL is kept only for reporting (`phLabelOf`), never for gating: labels disagree
    // with gravity in 1,735 of 81,722 support edges — "Level 3 carries Level 2" 619 times
    // (audit_rank_vs_support.js). Gating on a label that contradicts the geometry is what made
    // band-monotonic and nothing-before-its-carrier look mutually exclusive; they never were.
    var phLabelOf = new Array(N);
    for (i = 0; i < N; i++) {
      var p = collapsePhase(elements[i].storey);
      phLabelOf[i] = p;
      seqOf[i] = elements[i].seq;
      rkOf[i] = _zBounds.length ? zBandOf(elements[i].base_z) : -1;
      phOf[i] = 'Z' + (rkOf[i] < 0 ? 0 : rkOf[i]);   // the trade gate's group IS the elevation band
      if (_bandRank[p] != null && _bandRank[p] !== rkOf[i]) _relabelled++;
    }

    // ── Edge store. The nodes ARE the elements — nothing synthetic. succ[u] = what u carries.
    // Every edge is a support edge: hard, extracted from geometry, and never dropped.
    var succ = new Array(N), indeg = new Int32Array(N), eSupport = 0;
    function addEdge(u, v) { (succ[u] = succ[u] || []).push(v); indeg[v]++; }

    // ══ THE SUPPORT EDGES, EXTRACTED FROM GEOMETRY ════════════════════════════════════════════════
    // Two predicates, both from this module's own constants, both physical:
    //  (a) THE FLOAT GATE, structure pool: S carries T when S starts below T and tops AT OR ABOVE T's
    //      underside (`top_z >= base_z - GAP`). This is exactly what auditFloating tests, so
    //      floating=0 now holds BY CONSTRUCTION rather than by the old engine's much broader "any
    //      structure below me at all" wait — which also delayed elements for structure that never
    //      reaches them. Tighter AND more physical.
    //  (b) THE SUPPORT INVARIANT, structure + WALLS pool offered to EVERY class: the carrier must top
    //      out AT my underside (`|S.top_z - T.base_z| <= GAP`). This is the half the shipped engine
    //      was missing — it offered walls only to promoted roof slabs, so 6,778 elements bore on
    //      walls scheduled after them.
    //  ⚠ PREDICATE TRAP, already paid for once: `top_z >= base_z - GAP` alone accepts ANY carrier
    //  taller than my base, so a riser threading PAST a 3m wall reads as carried by it — 29,759
    //  phantom pairs vs 6,778 real. "Rests on" is bounded on BOTH sides; "runs past" is not.
    //  Promoted roof slabs (§4D_ROOF_LOAD_PATH M5) keep the looser wall predicate, unchanged, because
    //  that is the relation the roof rule was measured against.
    var structGrid = {}, wallGrid = {};
    for (i = 0; i < N; i++) {
      var e = elements[i];
      if (e.seq <= 4) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (structGrid[cs[c]] = structGrid[cs[c]] || []).push(i); }
      else if (e.cls && e.cls.indexOf('IfcWall') === 0) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(i); }
    }
    for (i = 0; i < N; i++) {
      T = elements[i];
      var promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
      cs = cellsOf(T);
      var mark = {};
      for (c = 0; c < cs.length; c++) {
        arr = structGrid[cs[c]];
        if (arr) for (k = 0; k < arr.length; k++) {
          j = arr[k]; if (j === i || mark[j]) continue; mark[j] = 1;
          S = elements[j];
          if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) { addEdge(j, i); eSupport++; }
        }
        arr = wallGrid[cs[c]];
        if (arr) for (k = 0; k < arr.length; k++) {
          j = arr[k]; if (j === i || mark[j]) continue; mark[j] = 1;
          S = elements[j];
          if (!(S.base_z < T.base_z - EPS) || !overlap(S, T)) continue;
          var bears = promotedSlab ? (S.top_z >= T.base_z - GAP)
                                   : (Math.abs(S.top_z - T.base_z) <= GAP);
          if (bears) { addEdge(j, i); eSupport++; }
        }
      }
    }
    var msBuild = _now() - tBuild0, tSolve0 = _now();

    // ══ THE WALK — topological over support, (seq, rank, base_z) preferred among the ready ═════════
    // The key is packed into one double so the heap stays a plain numeric compare:
    //   seq (<=8) * 1e10  +  rank (<=99) * 1e7  +  (base_z + 5000) * 10   — all well inside 2^53.
    // rank -1 (the unbanded bucket) sorts with the ground floor rather than ahead of everything.
    function prioOf(idx) {
      var rk = rkOf[idx] < 0 ? 0 : rkOf[idx];
      return seqOf[idx] * 1e10 + rk * 1e7 + Math.round((elements[idx].base_z + 5000) * 10);
    }
    var earliest = new Float64Array(N), done = new Uint8Array(N);
    for (i = 0; i < N; i++) earliest[i] = baseMs;

    // Live gates. phaseTrade[ph][seq] and bandTrade[rank][seq] are the SAME two structures the
    // shipped engine kept — the difference is that the walk order now makes them complete instead of
    // partial maxima. `remain[ph][seq]` counts what is still unplaced, which is how an override is
    // DETECTED rather than assumed: if an element is reached while a lower trade on its own storey
    // is still outstanding, a carrier pulled it forward and the trade constraint yielded.
    var phaseTrade = {}, bandTrade = {}, remain = {}, remainRank = {};
    for (i = 0; i < N; i++) {
      var rp = remain[phOf[i]] = remain[phOf[i]] || {};
      rp[seqOf[i]] = (rp[seqOf[i]] || 0) + 1;
      if (rkOf[i] >= 0) {
        var rr = remainRank[rkOf[i]] = remainRank[rkOf[i]] || {};
        rr[seqOf[i]] = (rr[seqOf[i]] || 0) + 1;
      }
    }
    var overrideTrade = 0, overrideBand = 0, gatedB = 0, gatedT = 0, deadlocks = 0;

    // ══ PRECONDITIONS, not merely priority ════════════════════════════════════════════════════════
    // Preferring (seq, rank, base_z) among the READY set is not enough and the measurement said so:
    // the heap only ever holds nodes whose carriers are done, so when no low-trade node happens to be
    // ready a high-trade node pops and the trade/band order is lost anyway (45,241 such pops; band
    // inversions went 29,824 -> 34,665, WORSE than the engine this replaces). So trade and band are
    // real preconditions here — a node that fails one is DEFERRED onto the group it is waiting for
    // and re-armed when that group empties. They yield ONLY on a genuine deadlock (nothing else is
    // placeable), which is exactly the wall-carries-MEP conflict the ruling settles: support wins,
    // the yield is counted, and it is a measured number rather than a silent weakening.
    // TWO separate waivers, deliberately. One flag for both was measured and it is WRONG: releasing a
    // TRADE deadlock (walls carry the MEP that the trade order puts before them — 51,767 nodes on
    // Hospital) also waived those nodes' BAND precondition, so their band gate read an incomplete
    // bandTrade[r-1] and cross-storey inversions went to 39,743. A yield on one constraint must not
    // silently yield the other.
    // A node sits in exactly ONE waitList at a time (inWait), and every deferral is ALSO pushed onto
    // defHeap so a deadlock can find the best-priority blocked node without rescanning the world.
    var waitList = {}, inWait = new Array(N), deferred = 0;
    var waivedT = new Uint8Array(N), waivedB = new Uint8Array(N), defHeap = new Heap();
    function defer(node, key) {
      (waitList[key] = waitList[key] || []).push(node);
      inWait[node] = key; deferred++; defHeap.push(node, prioOf(node));
    }
    function lowestOutstandingBelow(ph, sq) {          // smallest lower trade on this storey not yet done
      var rp = remain[ph]; if (!rp) return -1;
      var best = -1;
      for (var s in rp) { var n2 = +s; if (n2 < sq && rp[s] > 0 && (best < 0 || n2 < best)) best = n2; }
      return best;
    }
    function release(key) {
      var w = waitList[key]; if (!w || !w.length) return;
      for (var q2 = 0; q2 < w.length; q2++) {
        var n3 = w[q2];
        if (done[n3] || inWait[n3] !== key) continue;   // already taken by a deadlock release
        inWait[n3] = null; deferred--; heap.push(n3, prioOf(n3));
      }
      waitList[key] = null;
    }

    var heap = new Heap(), placed = 0;
    for (i = 0; i < N; i++) if (indeg[i] === 0) heap.push(i, prioOf(i));
    for (;;) {
      var u = -1, forced = false;
      while (heap.size()) {
        var cand = heap.pop();
        if (done[cand]) continue;
        var cph = phOf[cand], csq = seqOf[cand], crk = rkOf[cand];
        var lowSeq = waivedT[cand] ? -1 : lowestOutstandingBelow(cph, csq);
        if (lowSeq >= 0) {                              // a lower trade on my own storey is unfinished
          defer(cand, 'T|' + cph + '|' + lowSeq); continue;
        }
        var rrc = (crk > 0 && !waivedB[cand]) ? remainRank[crk - 1] : null;
        if (rrc && rrc[csq] > 0) {                      // my own trade is unfinished one floor down
          defer(cand, 'B|' + (crk - 1) + '|' + csq); continue;
        }
        u = cand; break;
      }
      if (u < 0) {
        if (!deferred) break;                           // everything placed
        // DEADLOCK — nothing satisfies its trade/band precondition, so a carrier is holding the whole
        // set. ⚖ Support wins, but only just barely: release exactly ONE node — the best-priority
        // blocked one — and let the walk continue. Releasing the whole waiting GROUP was measured
        // first and it AMPLIFIES: one genuinely stuck element waived thousands of its neighbours'
        // constraints (35,397 band waivers, inversions 34,595). The minimum release is the honest one.
        var pick = -1;
        while (defHeap.size()) {
          var cd = defHeap.pop();
          if (done[cd] || inWait[cd] == null) continue;   // stale entry — already released normally
          pick = cd; break;
        }
        if (pick < 0) break;
        deadlocks++;
        var wasKey = inWait[pick]; inWait[pick] = null; deferred--;
        if (wasKey.charAt(0) === 'T') { waivedT[pick] = 1; overrideTrade++; }
        else { waivedB[pick] = 1; overrideBand++; }
        heap.push(pick, prioOf(pick));
        forced = true;
      }
      if (forced) continue;
      done[u] = 1; placed++;
      var el = elements[u], ph = phOf[u], sq = seqOf[u], rk = rkOf[u];

      // Trade gate — every LOWER trade on this storey, now a COMPLETE maximum (the precondition above
      // guarantees they are all placed, except on a counted deadlock release).
      var pt = phaseTrade[ph], tg = baseMs, s;
      if (pt) for (s in pt) if (+s < sq && pt[s] > tg) tg = pt[s];

      // Band gate — the SAME trade one floor down. Per-trade on purpose: a global floor gate would
      // serialize the project and destroy the trade train, since the bands carry Superstructure, MEP
      // rough-in and Architecture simultaneously.
      var bg = baseMs;
      if (rk > 0) { var below = bandTrade[rk - 1]; if (below && below[sq] > bg) bg = below[sq]; }

      var slot = claimCrew(el.resource);
      var geo = earliest[u];                      // max end of every carrier — set by relaxation
      var start = Math.max(geo, tg, bg, slot.time);
      if (bg > baseMs && bg >= Math.max(geo, tg)) gatedB++;
      if (tg > baseMs && tg >= Math.max(geo, bg)) gatedT++;
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      var end = start + dur;
      out[el.guid] = { start: start, end: end };
      slot.commit(end);

      (phaseTrade[ph] = phaseTrade[ph] || {});
      if (!(phaseTrade[ph][sq] > end)) phaseTrade[ph][sq] = end;
      if (rk >= 0) {
        (bandTrade[rk] = bandTrade[rk] || {});
        if (!(bandTrade[rk][sq] > end)) bandTrade[rk][sq] = end;
        if (--remainRank[rk][sq] === 0) release('B|' + rk + '|' + sq);
      }
      // A group emptying is the ONLY thing that can satisfy a waiting node, so it is also the only
      // place a re-arm is needed — no polling, no re-scan of the deferred set per placement.
      if (--remain[ph][sq] === 0) release('T|' + ph + '|' + sq);

      var sc = succ[u];
      if (sc) for (var q = 0; q < sc.length; q++) {
        var v = sc[q];
        if (end > earliest[v]) earliest[v] = end;
        if (--indeg[v] === 0) heap.push(v, prioOf(v));
      }
    }

    // ── The § lines. The ladder is PRINTED rather than trusted (the §GANTT_STOREY_Z reassignment can
    // put ~9k elements in a bucket that is not a floor), and every yielded constraint is counted so a
    // drifted predicate shows up as a wildly different number instead of a silently worse schedule.
    var msSolve = _now() - tSolve0;
    if (typeof console !== 'undefined' && console.log) {
      var spanEnd = baseMs;
      for (i = 0; i < N; i++) { var o = out[elements[i].guid]; if (o && o.end > spanEnd) spanEnd = o.end; }
      console.log('§ELEMENT_CPM nodes=' + N + ' supportEdges=' + eSupport + ' placed=' + placed +
        ' overrideTrade=' + overrideTrade + ' overrideBand=' + overrideBand +
        ' gatedByTrade=' + gatedT + ' gatedByBand=' + gatedB +
        ' buildMs=' + Math.round(msBuild) + ' solveMs=' + Math.round(msSolve) +
        ' spanDays=' + Math.round((spanEnd - baseMs) / 86400000));
      if (placed !== N) console.log('§ELEMENT_CPM_ALARM placed=' + placed + ' of ' + N +
        ' — the support graph did not fully drain, which means it contained a CYCLE. It is meant to ' +
        'be acyclic by construction (base_z strictly increases along every edge); this is a real ' +
        'defect in the extraction predicate, not a tolerance to widen.');
      console.log('§4D_BAND_MONOTONIC ranks=' + _rankList.length +
        ' gatedB=' + gatedB + ' unbanded=' + _unbanded + ' relabelledByZ=' + _relabelled + ' (§ELEMENT_CPM: band keyed on ELEVATION)' +
        ' ladder=[' + _rankList.map(function (rr) {
          return rr.ph + '@' + rr.z.toFixed(1) + 'm(' + rr.n + ')';
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
  // §4D_ROOF_LOAD_PATH M3: the support grid used to be built ONLY from seq<=4 (structure) — the SAME
  // trade-number assumption the old PASS A/B split made — so a roof slab carried by walls read as
  // floating=0 while the schedule built it before those walls. Walls are added to the pool for
  // promoted (seq>4) roof slabs, which is the one case the real scheduler also gates on walls.
  // ⚠ This audit is DELIBERATELY NOT the whole invariant. It is role-aware, and the role-blind
  // question ("does ANYTHING start before what holds it up") is asked by audit_support_roleblind.js.
  // Keep running both — this one alone reported 0 while 6,778 elements bore on unbuilt walls.
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
