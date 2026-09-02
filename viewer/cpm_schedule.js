// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* cpm_schedule.js — Implementing prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md §CPM_SPEC
 * (bim-compiler, 2026-08-16). Witness: scripts/probe_cpm_schedule.js.
 *
 * ONE dependency DAG + ONE forward pass, side-by-side with the shipped 11-pass display pipeline
 * (replaces nothing yet — §EXECUTION_PLAN stages 1-3). A node is an element (dur = crew-leveled
 * duration from ScheduleGate.computeSchedule, which stays — §WHAT_STAYS) or a dur-0 milestone.
 * An edge means "T cannot start until S starts (SS) / finishes (FS)". Earliest-start = one Kahn
 * topological pass, ES(T) = max(crew-slot availability, max over in-edges) — see §S6_CREW_PASS in
 * solve() below. No fixpoint, no sweep cap.
 *
 * Edge types (§CPM_SPEC — every edge traces to a real geometry query or an already-shipped rule):
 *   E1 support   SS  designated physical support from the contact graph (judge's own relation)
 *   E2 host/open FS  ScheduleGate.hostPairs / openingPairs (the one shared definition)
 *   E3 discipline FS Tier-1 chain + Tier-2-after-Tier-1 per level, via hammock milestones
 *   E4 storey    FS  phase P complete at level k -> phase P elements at level k+1 (THE missing edge)
 *   E5 crew       -  RESOLVED (4D_GANTT_TM_REFACTOR.md §S19 Part B, 2026-08-17): originally a
 *                    per-element lower bound ES(T) >= computeSchedule(T).start (no explicit edges,
 *                    hence no counts.e5 in buildGraph()). §S6_CREW_PASS (below, in solve()) retired
 *                    that bound — ES no longer seeds from each element's own computeSchedule start,
 *                    only from a single shared epoch (`base` = min over all items). What's still
 *                    read from computeSchedule per element is DUR = e-s (the crew-leveled work
 *                    DURATION) — S6 has no independent duration model, so this is a live dependency,
 *                    not dead weight. Measured (§S19_RESULTS, probe_e5_resolution.js, Terminal
 *                    48,428 elements): cpmStart < rawStart for 12,131 elements (25%) — impossible if
 *                    the old per-element floor still held — while cpmDur === rawDur bit-exact
 *                    (maxDelta=0ms) for all 48,428. Comment corrected; solve()'s code needed no
 *                    change, it already only uses `.s`/`.e` this way.
 *
 * Cycle policy (§TIER_DAG_WINS doctrine — physics beats phase tidiness): Tarjan SCC first. A
 * cycle containing a hammock/membership edge drops exactly those edges INSIDE the cycle (tidiness
 * loses to physics, surgically — never a blanket drop). A remaining pure-physics cycle (e.g.
 * Clinic's parapet/roof-slab loop, mutual-contact pairs) is CONTRACTED: every member shares one
 * earliest-start, which satisfies the judge's own start-vs-start contact test with equality.
 * Every drop/contraction is counted and reported, never hidden.
 *
 * §S50 (2026-08-21, user ruling — 4D_GANTT_TM_REFACTOR.md §S50): the graph above is RETIRED as
 * the live precedence carrier where the data supports the cell grid. run() now gates per building
 * (see §S50 block before run()): location axis (location_axis.js: compiled rooms + §S35 levels) +
 * (location, trade) product order + §S47.3 hang filing. buildGraph/solve stay as the per-building
 * fallback (representability < 0.88) and for probes.
 */
(function (global) {
  'use strict';

  var TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];
  var SS = 0, FS = 1;

  // contactGraph(items) — same algorithm, same shipped ScheduleGate CELL/EPS/GAP constants as
  // time_machine.js _contactGraph (the judge). This module is the destined single home of the
  // relation (§CPM_SPEC stage 4); until retirement, probe_cpm_schedule.js §CPM_PARITY asserts the
  // two copies agree contact-for-contact so they cannot drift unnoticed.
  function contactGraph(items) {
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate
      : (typeof ScheduleGate !== 'undefined' ? ScheduleGate : null);
    if (!SG || !SG.CELL) return { ok: false, contacts: null, grounded: null, orphans: 0, groundedN: 0 };
    var CELL = SG.CELL, EPS = SG.EPS, GAP = SG.GAP;
    var n = items.length, i, j, k, c, S, T, arr, cs;
    var grid = {};
    function cellsOf(e) {
      var o = [], a, b;
      for (a = Math.floor(e.x0 / CELL); a <= Math.floor(e.x1 / CELL); a++)
        for (b = Math.floor(e.y0 / CELL); b <= Math.floor(e.y1 / CELL); b++) o.push(a + ',' + b);
      return o;
    }
    for (i = 0; i < n; i++) { cs = cellsOf(items[i]); for (c = 0; c < cs.length; c++) (grid[cs[c]] || (grid[cs[c]] = [])).push(i); }
    var contacts = new Array(n), grounded = new Uint8Array(n), stamp = new Int32Array(n);
    var orphans = 0, groundedN = 0;
    for (i = 0; i < n; i++) {
      T = items[i]; cs = cellsOf(T);
      var lowest = Infinity, list = null;
      for (c = 0; c < cs.length; c++) {
        arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) {
          j = arr[k]; if (j === i || stamp[j] === i + 1) continue;
          S = items[j];
          if (!(S.x0 <= T.x1 && S.x1 >= T.x0 && S.y0 <= T.y1 && S.y1 >= T.y0)) continue;
          stamp[j] = i + 1;
          if (S.bz < lowest) lowest = S.bz;
          if ((S.bz < T.bz - EPS && S.tz >= T.bz - GAP) ||        // bearing below — I rest on S
              (S.bz >= T.tz - GAP && S.tz > T.tz + EPS) ||        // carrier above — I hang from S
              (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS)) {       // embedded — S spans my height
            (list || (list = [])).push(j);
          }
        }
      }
      grounded[i] = (lowest < T.bz - GAP) ? 0 : 1;
      contacts[i] = list;
      if (grounded[i]) groundedN++; else if (!list) orphans++;
    }
    return { ok: true, contacts: contacts, grounded: grounded, orphans: orphans, groundedN: groundedN };
  }

  // designatedSupport(items, G) -> Int32Array: for each element with contacts, the ONE support
  // index whose SS edge satisfies the judge by construction (the designated support is a member of
  // the judge's own contact set, so min-over-contacts <= ES(T) holds). Deterministic preference:
  // bearing-below (nearest below = max tz), else embedded (smallest |bz gap|), else carrier-above
  // (nearest above = min bz); guid tie-break. -1 = no contacts (orphan/pure-ground).
  //
  // §GROUNDED_NEVER_HANGS (4D_GANTT_TM_REFACTOR.md §VERIFICATION, real-data cycle characterization;
  // NARROWED 2026-08-18 after conflicting with the already-proven §GROUNDED_OVERRIDE_FIX
  // (2026-08-13) precedent: "grounded" must never override a REAL detected relationship — a prior
  // blunt grounded-skip elsewhere caught 1,105 false negatives when removed). An element
  // G.grounded[i]===1 must never get a CARRIER-ABOVE (cls=2, the weakest fallback) designated
  // support — before this fix, a grounded element with ONLY a carrier-above candidate (something
  // built on top of it, within reach, no real support of its own) fell through to that weakest
  // match and got assigned it as a backward E1 SS edge, "I depend on the thing resting on me".
  // Measured on real fleet data (HHS/Duplex/Hospital/Terminal): this dominated the cycle-closing
  // share of the straggler-exemption removal's dropped E3/E4 edges (65-90% of sampled cases were
  // this exact backward-direction pattern, not the documented, deliberate long-distance-hang case
  // for genuinely suspended MEP). Serious specifically because E1 is the one edge type solve()'s
  // Tarjan cycle-breaker NEVER drops (physics is absolute, by design) — a backward E1 edge doesn't
  // get surgically removed like a wrong member/E3/E4 edge would; it becomes a permanent pure-
  // physics cycle, silently contracted every time.
  //
  // NARROWING: `grounded[i]` (contactGraph, above) is computed from the coarse GAP threshold
  // (`lowest < T.bz - GAP`) over ALL contacts regardless of classification — but a genuine
  // bearing-below match only needs `S.bz < T.bz - EPS`, a finer threshold (EPS << GAP). A real
  // support sitting between EPS and GAP below T (e.g. a thin bedding/formwork gap) can satisfy
  // cls=0 while still leaving `lowest >= T.bz - GAP`, so `grounded[i]` stays 1 even though a real
  // bearing-below relationship exists. Rejecting the WHOLE lookup for any grounded element (the
  // original fix) would discard that real relationship, repeating §GROUNDED_OVERRIDE_FIX's exact
  // mistake. Fix: run the same classification loop unconditionally; only reject the RESULT if it
  // landed on cls=2 AND the element is grounded. A genuine cls=0/cls=1 match always survives.
  function designatedSupport(items, G) {
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate : ScheduleGate;
    var EPS = SG.EPS, GAP = SG.GAP;
    var n = items.length, out = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = -1;
      var list = G.contacts[i]; if (!list) continue;
      // §S26.2 (2026-08-19) — STRUCTURE FIRST, contact only as a last resort. The election used to
      // take any lower touching box, so an IfcFlowSegment under a wall "bore" that wall: a CONTACT,
      // not a precedence, and those edges are what contradict phase order (Duplex: 761 physics-vs-
      // phase contradictions vs 1 when supports are restricted to load-bearing classes).
      // Electing ONLY from the pool was measured FIRST and is wrong: an element whose every contact
      // is non-pool then gets no support at all, starts at day 0, and appears before the thing it
      // touches — W-MZ-2 went 0 -> 2,781 on LTU, 0 -> 107 on Hospital. So the same classification
      // elects TWICE: the pool winner when one exists, else the unrestricted winner. Nothing loses
      // its support edge; a real structural support simply outranks a pipe.
      var T = items[i], bestJ = -1, bestCls = 9, bestScore = Infinity;
      var poolJ = -1, poolCls = 9, poolScore = Infinity;
      var inPool = SG.supportPool || function () { return true; };
      for (var k = 0; k < list.length; k++) {
        var j = list[k], S = items[j], cls, score;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { cls = 0; score = -S.tz; }
        else if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) { cls = 1; score = Math.abs(S.bz - T.bz); }
        else { cls = 2; score = S.bz; }
        if (cls < bestCls || (cls === bestCls && (score < bestScore ||
            (score === bestScore && (bestJ < 0 || String(S.guid) < String(items[bestJ].guid)))))) {
          bestCls = cls; bestScore = score; bestJ = j;
        }
        if (inPool(S) && (cls < poolCls || (cls === poolCls && (score < poolScore ||
            (score === poolScore && (poolJ < 0 || String(S.guid) < String(items[poolJ].guid))))))) {
          poolCls = cls; poolScore = score; poolJ = j;
        }
      }
      if (poolJ >= 0) { bestJ = poolJ; bestCls = poolCls; }   // §S26.2 structure outranks contact
      if (bestCls === 2 && G.grounded[i]) continue;   // carrier-above rejected ONLY when grounded
      out[i] = bestJ;
    }
    return out;
  }

  // buildGraph(items, G) — items need guid,cls,seq,phase,storey,x0,x1,y0,y1,bz,tz,s,e where s/e are
  // computeSchedule's crew-leveled generative times. Only e-s (duration) is read past this point —
  // s alone no longer seeds a per-element lower bound, see §S19 Part B note at the top of this file
  // and §S6_CREW_PASS in solve(). Returns the whole graph.
  //
  // §CPM_STRAGGLER_MEMBERSHIP: an element whose PHYSICS ancestry (E1/E2 transitive closure)
  // reaches a later (level, phase) group than its own is a dag-wins straggler — the shipped
  // pipeline's `_exempt`/`_t1Straggler` population, expressed as graph construction: it never
  // FEEDS its group's completion milestone (so it cannot drag the gate into a cycle with the
  // physics that forced it late), but still RECEIVES every gate in-edge. Since every hammock
  // target sits in a strictly-later group than its gate, and membership requires no ancestor from
  // any later group, a hammock edge can never close a cycle — the combined graph is acyclic by
  // construction except for pure-physics cycles (contracted in solve()). Stragglers are counted,
  // never hidden.
  function buildGraph(items, G) {
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate : ScheduleGate;
    var n = items.length, i, k;
    var out = new Array(n);           // out[u] = [{to, kind, type}]
    for (i = 0; i < n; i++) out[i] = null;
    var counts = { e1: 0, e2h: 0, e2o: 0, e3: 0, e4: 0, member: 0, stragglers: 0 };
    function addEdge(u, v, kind, type, bucket) {
      (out[u] || (out[u] = [])).push({ to: v, kind: kind, type: type });
      counts[bucket]++;
    }

    // E1 — designated physical support, SS
    var des = designatedSupport(items, G);
    for (i = 0; i < n; i++) if (des[i] >= 0) addEdge(des[i], i, SS, 1, 'e1');

    // E2 — host/opening pairs, FS (same element shape ScheduleGate's own pairs functions take)
    var gateEls = items.map(function (it) {
      return { guid: it.guid, cls: it.cls, seq: it.seq, x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1,
               base_z: it.bz, top_z: it.tz };
    });
    if (SG.hostPairs) SG.hostPairs(gateEls).forEach(function (p) { addEdge(p.h, p.i, FS, 2, 'e2h'); });
    if (SG.openingPairs) SG.openingPairs(gateEls).forEach(function (p) { addEdge(p.h, p.i, FS, 2, 'e2o'); });

    // Levels: collapsePhase identity, ordered by real mean base_z (extracted, never invented)
    var lvlOf = new Array(n), lvlAgg = {};
    for (i = 0; i < n; i++) {
      var L = items[i].storey ? SG.collapsePhase(items[i].storey) : null;
      lvlOf[i] = L;
      if (L) { var a = lvlAgg[L] || (lvlAgg[L] = { sum: 0, c: 0 }); a.sum += items[i].bz; a.c++; }
    }
    var levels = Object.keys(lvlAgg).sort(function (a, b) { return lvlAgg[a].sum / lvlAgg[a].c - lvlAgg[b].sum / lvlAgg[b].c; });

    // M1 (4D_GANTT_TM_REFACTOR.md) — a LEVEL, to the gates, is a physical 3-metre z-band, not a
    // storey name. Precedent: the shipped §GANTT banding (time_machine.js `band: Math.floor(cz/3)`)
    // and §4D_BAND_MONOTONIC's own band-rank gate — same quantum, reused here, not invented.
    // bandOfLevel = floor(meanZ/3m); bandRank = dense rank of the distinct band values PRESENT
    // (ascending), so federated pseudo-levels sharing one physical storey (Terminal's Kedai/Jalan/
    // Tanah cluster) collapse onto the SAME bandRank and are never chained to each other by E4.
    var bandOfLevel = {};
    levels.forEach(function (L) { bandOfLevel[L] = Math.floor((lvlAgg[L].sum / lvlAgg[L].c) / 3); });
    var bandValues = [];
    levels.forEach(function (L) { if (bandValues.indexOf(bandOfLevel[L]) < 0) bandValues.push(bandOfLevel[L]); });
    bandValues.sort(function (a, b) { return a - b; });
    var bandRankOfBand = {}; bandValues.forEach(function (b, r) { bandRankOfBand[b] = r; });
    var bandRank = {}; levels.forEach(function (L) { bandRank[L] = bandRankOfBand[bandOfLevel[L]]; });

    // Group key = lexicographic (bandRank, phaseRank) as one int; phaseRank = Tier-1 chain index,
    // Tier-2 = 3. Every hammock gate points to a strictly LARGER key than its own. bandRank (not
    // per-name lvlRank) is the M1 straggler group-key so cross-ladder ancestry inside one physical
    // band stops manufacturing false stragglers.
    function phaseRank(P) { var t = TIER1_ORDER.indexOf(P); return t >= 0 ? t : 3; }
    function groupKeyOf(i2) {
      if (!lvlOf[i2]) return -1;
      return bandRank[lvlOf[i2]] * 8 + phaseRank(items[i2].phase || '_UNPHASED');
    }

    // §CPM_STRAGGLER_MEMBERSHIP propagation: maxAncKey over the PHYSICS-ONLY condensation
    // (E1/E2 are all that exist in `out` at this point), one topological pass.
    var pscc = tarjanScc(n, out);
    var nPC = pscc.sizes.length;
    var maxAnc = new Float64Array(nPC); maxAnc.fill(-1);
    var pIndeg = new Int32Array(nPC);
    for (i = 0; i < n; i++) {
      var gk = groupKeyOf(i);
      if (gk > maxAnc[pscc.comp[i]]) maxAnc[pscc.comp[i]] = gk;
      var os0 = out[i]; if (!os0) continue;
      for (k = 0; k < os0.length; k++) if (pscc.comp[os0[k].to] !== pscc.comp[i]) pIndeg[pscc.comp[os0[k].to]]++;
    }
    var pMembers = new Array(nPC);
    for (i = 0; i < n; i++) (pMembers[pscc.comp[i]] || (pMembers[pscc.comp[i]] = [])).push(i);
    var pq = [], ph2 = 0;
    for (i = 0; i < nPC; i++) if (!pIndeg[i]) pq.push(i);
    while (ph2 < pq.length) {
      var pc = pq[ph2++], mem = pMembers[pc];
      if (mem) for (k = 0; k < mem.length; k++) {
        var os1 = out[mem[k]]; if (!os1) continue;
        for (var k4 = 0; k4 < os1.length; k4++) {
          var tc = pscc.comp[os1[k4].to]; if (tc === pc) continue;
          if (maxAnc[pc] > maxAnc[tc]) maxAnc[tc] = maxAnc[pc];
          if (--pIndeg[tc] === 0) pq.push(tc);
        }
      }
    }
    // stragglerOf is still computed and returned — it remains real, reportable data ("stragglers
    // are counted, never hidden") even though milestone() no longer excludes them from feeding
    // their own phase's completion gate (§CPM_STRAGGLER_EXEMPTION_DROPPED below).
    var stragglerOf = new Uint8Array(n);
    for (i = 0; i < n; i++) if (lvlOf[i] && maxAnc[pscc.comp[i]] > groupKeyOf(i)) { stragglerOf[i] = 1; counts.stragglers++; }

    // Milestones: M(level, phase) completion, dur 0, fed FS by EVERY member (straggler or not).
    var msId = {}, msMeta = [];     // node ids n.. ; msMeta[k] = {level, phase}
    var groups = {};                // level||phase -> [element idx]
    for (i = 0; i < n; i++) {
      if (!lvlOf[i]) continue;
      var key = lvlOf[i] + '||' + (items[i].phase || '_UNPHASED');
      (groups[key] || (groups[key] = [])).push(i);
    }
    // §CPM_STRAGGLER_EXEMPTION_DROPPED (4D_GANTT_TM_REFACTOR.md, decision after fleet-trace
    // diagnosis) — the isStraggler() skip that used to sit here has been removed. It excluded
    // ANY element whose physics ancestry reached a later group from feeding its own phase's
    // completion milestone — meaning "phase done" meant only the non-straggler subset was done,
    // which on real data was often the MINORITY of the phase (measured live: 54-100% of a phase's
    // elements classified as stragglers on Duplex/Hospital/HHS, at multiple levels), so the gate
    // fired on a small residual instead of the true bulk. Decision: "phase done" means the WHOLE
    // group is done, no filtered subset, no tuning knob.
    //
    // Why the exemption existed, and why removing it is still safe: a straggler element X is one
    // whose OWN E1/E2 physics ancestry reaches into a LATER (level,phase) group Y. If X also fed
    // its own group's completion milestone, and that milestone hammock-gates the very group Y
    // sits in, the graph would close a genuine cycle (Y->X physics edge, X->milestone->Y hammock
    // edge) — a real deadlock, not a hypothetical one. Every element now feeds its own milestone
    // unconditionally; any such cycle this creates is caught and broken by solve()'s own Round-1
    // Tarjan SCC pass (§TIER_DAG_WINS doctrine, top of file) — which ALREADY exists for exactly
    // this class of problem and ONLY ever drops the tidiness edge (member/E3/E4) inside the
    // detected cycle, never a physics edge (E1/E2) — so floating=0 (which depends only on E1/E2)
    // is structurally unaffected by this change. The difference is precision: the old pre-filter
    // excluded an element from ANY milestone it might ever reach, globally and conservatively;
    // solve()'s cycle-breaking only drops an edge if it is actually inside a real cycle. Verified
    // fleet-wide (see PR) before shipping, not assumed from this reasoning alone.
    function milestone(level, phase) {
      var key = level + '||' + phase;
      if (key in msId) return msId[key];
      var id = n + msMeta.length;
      msMeta.push({ level: level, phase: phase });
      msId[key] = id;
      out.push(null);
      var g = groups[key];
      if (g) for (var k5 = 0; k5 < g.length; k5++) {
        addEdge(g[k5], id, FS, 0, 'member');
      }
      return id;
    }
    // T1-complete milestone per level: fed FS by each Tier-1 phase milestone present at that level.
    var t1cId = {};
    function t1Complete(level) {
      if (level in t1cId) return t1cId[level];
      var id = n + msMeta.length;
      msMeta.push({ level: level, phase: '_T1_COMPLETE' });
      out.push(null);
      TIER1_ORDER.forEach(function (ph) {
        if (groups[level + '||' + ph]) addEdge(milestone(level, ph), id, FS, 3, 'e3');
      });
      t1cId[level] = id;
      return id;
    }

    // E3 — discipline hammocks per level: Tier-1 chain, then Tier-2 after Tier-1 complete.
    levels.forEach(function (L) {
      var present = TIER1_ORDER.filter(function (ph) { return groups[L + '||' + ph]; });
      for (var p = 0; p + 1 < present.length; p++) {
        var m = milestone(L, present[p]), succ = groups[L + '||' + present[p + 1]];
        for (var k = 0; k < succ.length; k++) addEdge(m, succ[k], FS, 3, 'e3');
      }
      if (!present.length) return;
      var tier2 = [];
      Object.keys(groups).forEach(function (key) {
        var cut = key.indexOf('||');
        if (key.slice(0, cut) !== L) return;
        var ph = key.slice(cut + 2);
        if (TIER1_ORDER.indexOf(ph) < 0) tier2.push(key);
      });
      if (!tier2.length) return;
      var t1c = t1Complete(L);
      tier2.forEach(function (key) {
        var g = groups[key];
        for (var k = 0; k < g.length; k++) addEdge(t1c, g[k], FS, 3, 'e3');
      });
    });

    // E4 — storey hammocks per phase, band-to-band (M1, THE MISSING/CORRECTED EDGE): every M(L,P)
    // with L in band b -> elements of (P, L') for every L' in the next PRESENT band. Levels sharing
    // one band are parallel sub-buildings (e.g. Terminal's Kedai shop block vs the main hall) and
    // are NEVER chained to each other — only band-to-band edges exist.
    var phases = {};
    Object.keys(groups).forEach(function (key) {
      var cut = key.indexOf('||');
      (phases[key.slice(cut + 2)] = phases[key.slice(cut + 2)] || []).push(key.slice(0, cut));
    });
    Object.keys(phases).forEach(function (P) {
      var byBand = {};
      phases[P].forEach(function (L) {
        var br = bandRank[L];
        (byBand[br] = byBand[br] || []).push(L);
      });
      var bandRanksPresent = Object.keys(byBand).map(Number).sort(function (a, b) { return a - b; });
      for (var p = 0; p + 1 < bandRanksPresent.length; p++) {
        var fromLevels = byBand[bandRanksPresent[p]], toLevels = byBand[bandRanksPresent[p + 1]];
        fromLevels.forEach(function (L) {
          var m = milestone(L, P);
          toLevels.forEach(function (L2) {
            var succ = groups[L2 + '||' + P];
            for (var k = 0; k < succ.length; k++) addEdge(m, succ[k], FS, 4, 'e4');
          });
        });
      }
    });

    return { out: out, nElements: n, nNodes: n + msMeta.length, msMeta: msMeta, stragglerOf: stragglerOf,
             levels: levels, counts: counts, designated: des };
  }

  // tarjanScc(total, out) — iterative Tarjan (no recursion; LTU_AHouse is 122k nodes). Returns
  // {comp: Int32Array node->component id, sizes: [component size]}.
  function tarjanScc(total, out) {
    var comp = new Int32Array(total); comp.fill(-1);
    var low = new Int32Array(total), num = new Int32Array(total); num.fill(-1);
    var onStack = new Uint8Array(total), stack = [], sizes = [];
    var idx = 0, callV = [], callE = [];
    for (var root = 0; root < total; root++) {
      if (num[root] >= 0) continue;
      callV.push(root); callE.push(0);
      while (callV.length) {
        var u = callV[callV.length - 1], ei = callE[callE.length - 1];
        if (ei === 0) { num[u] = low[u] = idx++; stack.push(u); onStack[u] = 1; }
        var os = out[u], advanced = false;
        if (os) {
          while (ei < os.length) {
            var edge = os[ei];
            if (edge.dropped) { ei++; continue; }
            var v = edge.to;
            if (num[v] < 0) { callE[callE.length - 1] = ei + 1; callV.push(v); callE.push(0); advanced = true; break; }
            if (onStack[v] && num[v] < low[u]) low[u] = num[v];
            ei++;
          }
        }
        if (advanced) continue;
        callV.pop(); callE.pop();
        if (low[u] === num[u]) {
          var cid = sizes.length, sz = 0, w;
          do { w = stack.pop(); onStack[w] = 0; comp[w] = cid; sz++; } while (w !== u);
          sizes.push(sz);
        } else if (callV.length) {
          var p = callV[callV.length - 1];
          if (low[u] < low[p]) low[p] = low[u];
        }
      }
    }
    return { comp: comp, sizes: sizes };
  }

  // solve(items, graph, opts) — SCC condensation + ONE crew-aware forward pass (serial
  // schedule-generation scheme). Returns per-element {s,e} + stats.
  //
  // §S6_CREW_PASS (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S2_REVIEW_VERDICT S6): E5's TIMES
  // stop being the lower bound. They were computed by computeSchedule at RAW dates — once the
  // precedence gates displace work (Terminal roof: 10,950 elements moved from day ~37 to day ~130),
  // nothing re-enforced "this trade has N crews" at the new date, so the tail built at effectively
  // infinite crew capacity (10,950 starts inside 0.4 days, §CREW_FEASIBILITY massively violated).
  // The fix: the SAME greedy crew-slot allocator computeSchedule already runs (schedule_gate.js
  // §CREW-CAP — per-resource slot array, claim-earliest-slot, cap = maxCrews[resource] with the
  // same MAX_CREWS_DEFAULT=3 fallback) claims slots INSIDE this topological pass. Ready components
  // come off a priority queue keyed (earliest precedence-feasible time, bz, guid — deterministic);
  // finalizing an element sets start = max(precedence bound, earliest slot of its resource pool),
  // then advances the claimed slot by the element's real crew-leveled duration (e-s, still
  // computeSchedule's own — durations stay E5's, only its TIMES retire). Delays only, so every
  // edge lower bound stays satisfied — floating-0 by construction is preserved. O((V+E)·log V).
  // Contracted pure-physics SCCs keep ONE shared start (the judge's own equality contract): each
  // member reserves its own slot, the shared start is the latest reservation, and a member that
  // finds its pool exhausted by its own SCC is counted in drops.crewOverCapScc — never hidden.
  function solve(items, graph, opts) {
    var maxCrews = opts && opts.maxCrews;
    var n = graph.nElements, total = graph.nNodes, out = graph.out;
    var i, u, k, e, os;
    var drops = { e3: 0, e4: 0, member: 0, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0,
                  crewOverCapScc: 0 };

    // Round 1 — cycles containing tidiness edges (E3/E4 hammocks + milestone membership) lose
    // exactly those edges inside the cycle; physics edges are never dropped here.
    var scc = tarjanScc(total, out);
    var multi = false;
    for (i = 0; i < scc.sizes.length; i++) if (scc.sizes[i] > 1) { multi = true; break; }
    if (multi) {
      for (u = 0; u < total; u++) {
        if (scc.sizes[scc.comp[u]] < 2) continue;
        os = out[u]; if (!os) continue;
        for (k = 0; k < os.length; k++) {
          e = os[k];
          if (e.dropped || scc.comp[e.to] !== scc.comp[u]) continue;
          if (e.type === 3) { e.dropped = 1; drops.e3++; }
          else if (e.type === 4) { e.dropped = 1; drops.e4++; }
          else if (e.type === 0) { e.dropped = 1; drops.member++; }
        }
      }
      // Round 2 — what still cycles is pure physics (mutual contact / host tangles): CONTRACT.
      scc = tarjanScc(total, out);
    }
    var comp = scc.comp, nComp = scc.sizes.length;
    for (i = 0; i < nComp; i++) {
      if (scc.sizes[i] > 1) { drops.contractedSccs++; drops.contractedNodes += scc.sizes[i]; }
    }

    // Crew-aware Kahn over the CONDENSATION (§S6_CREW_PASS): every node of a component shares one
    // earliest-start (an SS physics edge inside it holds with equality — the judge's own tolerance
    // accepts that; FS edges inside it are the counted cost of the break, never hidden). The base
    // epoch is the raw schedule's own earliest start (extracted, not invented) — E5's per-element
    // TIMES no longer seed ES.
    var base = Infinity;
    for (i = 0; i < n; i++) if (items[i].s < base) base = items[i].s;
    if (!isFinite(base)) base = 0;
    var ES = new Float64Array(total), DUR = new Float64Array(total);
    for (i = 0; i < total; i++) ES[i] = base;
    for (i = 0; i < n; i++) DUR[i] = Math.max(0, items[i].e - items[i].s);
    // Crew pools — same shape, same claim-earliest-slot rule, same default as schedule_gate.js's
    // own claimCrew (§CREW-CAP: MAX_CREWS_DEFAULT = 3; an element without a resource pools under
    // the same single 'undefined' key computeSchedule uses).
    function crewCapFor(resource) {
      if (typeof maxCrews === 'number') return maxCrews;
      if (maxCrews && maxCrews[resource]) return maxCrews[resource];
      return 3;   // schedule_gate.js MAX_CREWS_DEFAULT, mirrored not invented
    }
    var crews = {};
    function poolOf(resource) {
      return crews[resource] || (crews[resource] = new Array(crewCapFor(resource)).fill(base));
    }
    var compES = new Float64Array(nComp);
    for (i = 0; i < nComp; i++) compES[i] = base;
    var compNodes = new Array(nComp);
    for (u = 0; u < total; u++) {
      var c = comp[u];
      (compNodes[c] || (compNodes[c] = [])).push(u);
    }
    // Deterministic priority key per component: (compES at readiness, min member bz, min member
    // guid, comp id). Milestone-only components sort FIRST at equal time (bz -Infinity): they are
    // dur-0 gates with no crew claim, and releasing them eagerly keeps the ready set maximal so
    // slots go to the lowest precedence-feasible WORK first.
    var compBz = new Float64Array(nComp), compGuid = new Array(nComp);
    for (i = 0; i < nComp; i++) { compBz[i] = Infinity; compGuid[i] = null; }
    for (u = 0; u < n; u++) {
      var cb = comp[u];
      if (items[u].bz < compBz[cb]) compBz[cb] = items[u].bz;
      var g0 = String(items[u].guid);
      if (compGuid[cb] === null || g0 < compGuid[cb]) compGuid[cb] = g0;
    }
    for (i = 0; i < nComp; i++) if (compGuid[i] === null) { compBz[i] = -Infinity; compGuid[i] = ''; }
    var indeg = new Int32Array(nComp);
    for (u = 0; u < total; u++) {
      os = out[u]; if (!os) continue;
      for (k = 0; k < os.length; k++) {
        e = os[k];
        if (!e.dropped && comp[e.to] !== comp[u]) indeg[comp[e.to]]++;
      }
    }
    // Binary min-heap of ready components. compES is FINAL at push time (indeg 0 = every
    // predecessor finalized), so the key never moves while queued.
    var heap = [];
    function heapLess(a, b) {
      if (compES[a] !== compES[b]) return compES[a] < compES[b];
      if (compBz[a] !== compBz[b]) return compBz[a] < compBz[b];
      if (compGuid[a] !== compGuid[b]) return compGuid[a] < compGuid[b];
      return a < b;
    }
    function heapPush(v) {
      heap.push(v);
      var ci = heap.length - 1;
      while (ci > 0) {
        var pi = (ci - 1) >> 1;
        if (heapLess(heap[ci], heap[pi])) { var t = heap[ci]; heap[ci] = heap[pi]; heap[pi] = t; ci = pi; }
        else break;
      }
    }
    function heapPop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        var ci = 0;
        for (;;) {
          var l = 2 * ci + 1, r = l + 1, m = ci;
          if (l < heap.length && heapLess(heap[l], heap[m])) m = l;
          if (r < heap.length && heapLess(heap[r], heap[m])) m = r;
          if (m === ci) break;
          var t2 = heap[ci]; heap[ci] = heap[m]; heap[m] = t2; ci = m;
        }
      }
      return top;
    }
    var processed = 0;
    for (i = 0; i < nComp; i++) if (!indeg[i]) heapPush(i);
    function memberOrder(a, b) {   // deterministic within-component claim order
      if (items[a].bz !== items[b].bz) return items[a].bz - items[b].bz;
      var ga = String(items[a].guid), gb = String(items[b].guid);
      return ga < gb ? -1 : (ga > gb ? 1 : 0);
    }
    while (heap.length) {
      var cu = heapPop(); processed++;
      var members = compNodes[cu], contracted = members.length > 1;
      var es = compES[cu];
      if (!contracted) {
        u = members[0];
        if (u < n) {   // element: claim a crew slot; milestone: pure gate, no claim
          var pool1 = poolOf(items[u].resource), idx1 = 0;
          for (k = 1; k < pool1.length; k++) if (pool1[k] < pool1[idx1]) idx1 = k;
          es = Math.max(es, pool1[idx1]);
          pool1[idx1] = es + DUR[u];
        }
        ES[u] = es;
      } else {
        // Contracted pure-physics SCC (element-only by construction — round 1 dropped every
        // tidiness edge inside cycles): reserve one slot per member, shared start = the latest
        // reservation, then commit every slot to sharedStart + that member's duration.
        var mem = members.slice().sort(memberOrder);
        var picks = [], usedByPool = {};
        for (k = 0; k < mem.length; k++) {
          u = mem[k];
          var r1 = items[u].resource, pool2 = poolOf(r1);
          var used = usedByPool[r1] || (usedByPool[r1] = {});
          var idx2 = -1;
          for (var si = 0; si < pool2.length; si++)
            if (!used[si] && (idx2 < 0 || pool2[si] < pool2[idx2])) idx2 = si;
          if (idx2 < 0) {
            // pool exhausted by this SCC alone — cap physically cannot hold under the shared-start
            // contract; reuse the earliest slot and COUNT it (never hidden)
            drops.crewOverCapScc++;
            idx2 = 0;
            for (si = 1; si < pool2.length; si++) if (pool2[si] < pool2[idx2]) idx2 = si;
            picks.push({ u: u, r: r1, idx: idx2, reuse: true });
          } else {
            used[idx2] = 1;
            if (pool2[idx2] > es) es = pool2[idx2];
            picks.push({ u: u, r: r1, idx: idx2 });
          }
        }
        for (k = 0; k < picks.length; k++) {
          var p1 = picks[k], pool3 = poolOf(p1.r);
          var end1 = es + DUR[p1.u];
          if (end1 > pool3[p1.idx]) pool3[p1.idx] = end1;
          ES[p1.u] = es;
        }
        for (k = 0; k < members.length; k++) {
          u = members[k];
          if (u >= n) ES[u] = es;   // defensive: no milestone survives in a round-2 SCC
          // count internal FS violations honestly (S finishes after T starts, same instant)
          os = out[u];
          if (os) for (var k2 = 0; k2 < os.length; k2++) {
            e = os[k2];
            if (!e.dropped && comp[e.to] === cu && e.kind === FS && DUR[u] > 0) drops.fsViolInScc++;
          }
        }
      }
      for (k = 0; k < members.length; k++) {
        u = members[k]; os = out[u]; if (!os) continue;
        var ef = ES[u] + DUR[u];
        for (var k3 = 0; k3 < os.length; k3++) {
          e = os[k3]; if (e.dropped) continue;
          var cv = comp[e.to]; if (cv === cu) continue;
          var b = e.kind === FS ? ef : ES[u];
          if (b > ES[e.to]) ES[e.to] = b;
          if (ES[e.to] > compES[cv]) compES[cv] = ES[e.to];
          if (--indeg[cv] === 0) heapPush(cv);
        }
      }
    }
    var times = new Array(n), makespanS = Infinity, makespanE = -Infinity;
    for (i = 0; i < n; i++) {
      var s = ES[i], en = s + DUR[i];
      times[i] = { s: s, e: en };
      if (s < makespanS) makespanS = s;
      if (en > makespanE) makespanE = en;
    }
    return { times: times, drops: drops, processed: processed, total: nComp, comp: comp,
             makespanDays: (makespanE - makespanS) / 86400000 };
  }

  // ── §S50 THE CELL-GRAIN SCHEDULE (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S50, user
  // ruling 2026-08-21: the per-element support graph is RETIRED as the live precedence carrier;
  // precedence is (location, trade) ordering — two ordered lists, trades within a level, levels
  // bottom-up (§S26.11), rooms (location_axis.js) as the horizontal grain, plus ONE exception:
  // an element suspended from above is filed by what it hangs from (§S47.3, measured: Hospital
  // 78.69% -> 1.90% unrepresentable). buildGraph/solve below are KEPT as the per-building
  // fallback and for probes — §S50.1.g's gate decides per building, from the data, at runtime:
  //
  //   PASS MARK (declared before any run, §S48.3's measured split): representability =
  //   (E1 designated-support edges inside one (level,trade) cell + representable by the product
  //   order) / all E1 edges, at the FINAL filing, whole population. >= 0.88 -> cell path;
  //   below -> today's graph engine, unchanged. Measured 2026-08-21 (probe_s50_early):
  //   Terminal 98.32 / Hospital 97.06 / Clinic 91.24 -> CELL; Duplex 66.27 / HHS 71.13 /
  //   JKR 77.15 / LTU 78.06 -> GRAPH. Both branches live in the fleet = the gate is exercised.
  var CELL_GATE_MARK = 0.88;

  // _cellFiling(items, axis, des) — final location filing + the gate quantity.
  // axis = LocationAxis.derive() output; des = designatedSupport (the judge's own election,
  // read ONCE as EXTRACTION — never as precedence edges).
  function _cellFiling(items, axis, des) {
    var n = items.length, i;
    var lvl1 = new Array(n), loc1 = new Array(n);
    for (i = 0; i < n; i++) {
      var g = items[i].guid;
      lvl1[i] = (axis.lvlOf[g] != null ? axis.lvlOf[g] : -1);
      loc1[i] = (axis.locOf[g] != null ? axis.locOf[g] : ('L' + lvl1[i]));
    }
    // §S47.3 hang filing — a SINGLE pass reading the BASE filing (lvl1), writing the final one
    // (lvl2). NOT cascading: §S47b's measured mechanism promotes each element once, from the
    // unpromoted state (grid_probe.js lines 746-753). A cascading variant read 87.04% on Clinic
    // where the measured instrument reads 91.24% — caught by the smoke run, 2026-08-21.
    var lvl2 = lvl1.slice(), loc2 = loc1.slice();
    var promoted = 0;
    for (i = 0; i < n; i++) {
      if (des[i] < 0) continue;
      var a = des[i];
      if (lvl1[a] > lvl1[i]) { lvl2[i] = lvl1[a]; loc2[i] = loc1[a]; promoted++; }
    }
    // gate quantity — §S47b formula at LEVEL grain (the grain the 0.88 mark was calibrated on)
    var intra = 0, ok = 0, refused = 0;
    for (i = 0; i < n; i++) {
      if (des[i] < 0) continue;
      var u = des[i];
      var la = lvl2[u], lb = lvl2[i];
      var ta = _trdOf(items[u]), tb = _trdOf(items[i]);
      if (la === lb && ta === tb) intra++;
      else if (lb >= la && tb >= ta) ok++;
      else refused++;
    }
    var total = intra + ok + refused;
    return { lvl2: lvl2, loc2: loc2, promoted: promoted,
             e1Total: total, intra: intra, representable: ok, refused: refused,
             repr: total ? (intra + ok) / total : 1 };
  }
  function _trdOf(it) { return (typeof it.seq === 'number' ? it.seq : 99); }

  // solveCells(items, filing, opts) — the two ordered lists, scheduled. Cells in product order:
  // ES(L, loc, T) = max(epoch, finish of every cell (L, *, T'<T), finish of every cell (L'<L, *, T)).
  // Trade order is LEVEL-scoped (a room's own slab/walls are filed at the level location —
  // room-scoped order would leave slab->fit-out unrepresented, §S47.2's refused class); rooms at
  // one level are PARALLEL locations — global per-resource crew pools are what serialize them.
  // Packing inside a cell: members by (bz, guid), each claims the earliest slot of its GLOBAL
  // resource pool (same caps + default-3 as computeSchedule §CREW-CAP). Deterministic throughout.
  function solveCells(items, filing, opts) {
    var maxCrews = opts && opts.maxCrews;
    var n = items.length, i;
    var base = Infinity;
    for (i = 0; i < n; i++) if (items[i].s < base) base = items[i].s;
    if (!isFinite(base)) base = 0;
    function crewCapFor(resource) {
      if (typeof maxCrews === 'number') return maxCrews;
      if (maxCrews && maxCrews[resource]) return maxCrews[resource];
      return 3;   // schedule_gate.js MAX_CREWS_DEFAULT, mirrored not invented
    }
    var pools = {};
    function poolOf(resource) {
      return pools[resource] || (pools[resource] = new Array(crewCapFor(resource)).fill(base));
    }
    // group members per cell
    var SEP = '';
    var cellMem = {}, cellMeta = {}, keyOf = new Array(n);
    for (i = 0; i < n; i++) {
      var k = filing.lvl2[i] + SEP + _trdOf(items[i]) + SEP + filing.loc2[i];
      keyOf[i] = k;
      (cellMem[k] || (cellMem[k] = [])).push(i);
      cellMeta[k] || (cellMeta[k] = { lvl: filing.lvl2[i], trd: _trdOf(items[i]), loc: filing.loc2[i] });
    }
    var keys = Object.keys(cellMem).sort(function (x, y) {
      var a = cellMeta[x], b = cellMeta[y];
      if (a.lvl !== b.lvl) return a.lvl - b.lvl;
      if (a.trd !== b.trd) return a.trd - b.trd;
      return a.loc < b.loc ? -1 : (a.loc > b.loc ? 1 : 0);
    });
    var times = new Array(n);
    var prevLevelsByTrade = {};   // trd -> max finish over all LOWER levels
    var thisLevelByTrade = {};    // trd -> max finish at the CURRENT level
    var earlierTradesMax = base;  // max finish of this level's already-processed (strictly lower) trades
    var curLvl = null, curTrd = null;
    var lvlSet = {}, trdSet = {};
    var makespanS = Infinity, makespanE = -Infinity;
    function foldLevel() {
      for (var t in thisLevelByTrade) {
        if (!(t in prevLevelsByTrade) || thisLevelByTrade[t] > prevLevelsByTrade[t])
          prevLevelsByTrade[t] = thisLevelByTrade[t];
      }
      thisLevelByTrade = {};
      earlierTradesMax = base;
      curTrd = null;
    }
    function foldTrade(t) {
      if (thisLevelByTrade[t] != null && thisLevelByTrade[t] > earlierTradesMax)
        earlierTradesMax = thisLevelByTrade[t];
    }
    keys.forEach(function (k) {
      var c = cellMeta[k];
      lvlSet[c.lvl] = 1; trdSet[c.trd] = 1;
      if (curLvl === null) { curLvl = c.lvl; }
      else if (c.lvl !== curLvl) { foldLevel(); curLvl = c.lvl; }
      if (curTrd === null) curTrd = c.trd;
      else if (c.trd !== curTrd) { foldTrade(curTrd); curTrd = c.trd; }
      var es = earlierTradesMax;
      var pl = prevLevelsByTrade[c.trd];
      if (pl != null && pl > es) es = pl;
      if (es < base) es = base;
      var mem = cellMem[k].slice().sort(function (a, b) {
        if (items[a].bz !== items[b].bz) return items[a].bz - items[b].bz;
        var ga = String(items[a].guid), gb = String(items[b].guid);
        return ga < gb ? -1 : (ga > gb ? 1 : 0);
      });
      var fin = es;
      mem.forEach(function (u) {
        var pool = poolOf(items[u].resource);
        var idx = 0;
        for (var q = 1; q < pool.length; q++) if (pool[q] < pool[idx]) idx = q;
        var st = Math.max(es, pool[idx]);
        var dur = Math.max(0, items[u].e - items[u].s);
        var en = st + dur;
        pool[idx] = en;
        times[u] = { s: st, e: en };
        if (st < makespanS) makespanS = st;
        if (en > makespanE) makespanE = en;
        if (en > fin) fin = en;
      });
      if (!(c.trd in thisLevelByTrade) || fin > thisLevelByTrade[c.trd]) thisLevelByTrade[c.trd] = fin;
    });
    return { times: times, cells: keys.length, keyOf: keyOf,
             levels: Object.keys(lvlSet).length, trades: Object.keys(trdSet).length,
             makespanDays: (isFinite(makespanE) && isFinite(makespanS)) ? (makespanE - makespanS) / 86400000 : 0 };
  }

  // run(items, opts) — §S50: location axis + gate, THEN either the cell schedule (>= mark) or
  // the retained graph engine (< mark, or no db/LocationAxis — every legacy caller lands there
  // unchanged). opts.maxCrews: per-resource crew caps, same shape computeSchedule takes.
  // opts.db: the building DB; defaults to APP.db (the viewer's live app object) when present.
  function run(items, opts) {
    var t0 = Date.now();
    var G = contactGraph(items);
    var t1 = Date.now();
    if (!G.ok) return { ok: false, error: 'ScheduleGate not loaded' };
    var LA = (typeof global.LocationAxis !== 'undefined') ? global.LocationAxis
      : (typeof LocationAxis !== 'undefined' ? LocationAxis : null);
    var db = (opts && opts.db) || (global.APP && global.APP.db) || null;
    if (LA && db) {
      var axis = LA.derive(db, items, { label: (opts && opts.label) || ('n' + items.length) });
      var des0 = designatedSupport(items, G);
      var filing = _cellFiling(items, axis, des0);
      var path = filing.repr >= CELL_GATE_MARK ? 'CELL' : 'GRAPH';
      console.log('§CELL_GATE n=' + items.length + ' (whole scheduled population, §S46 discipline)' +
        ' E1edges=' + filing.e1Total + ' insideLT=' + filing.intra +
        ' representable=' + filing.representable + ' REFUSED=' + filing.refused +
        ' repr=' + (100 * filing.repr).toFixed(2) + '% mark=' + (100 * CELL_GATE_MARK) + '%' +
        ' promoted=' + filing.promoted + ' path=' + path +
        ' [gate quantity: §S47b formula, level grain, designatedSupport unchanged — a rule, not a dictionary]');
      if (path === 'CELL') {
        var solC = solveCells(items, filing, opts);
        var t2c = Date.now();
        console.log('§CELL_RUN n=' + items.length + ' cells=' + solC.cells +
          ' levels=' + solC.levels + ' trades=' + solC.trades +
          ' roomsUsed=' + (axis.stats ? axis.stats.inRoom : '?') + ' promoted=' + filing.promoted +
          ' refusedE1=' + filing.refused + ' (arrows-as-exception surface, NOT enforced — §S26.11 leg 4)' +
          ' makespanDays=' + solC.makespanDays.toFixed(1) +
          ' ms={contact:' + (t1 - t0) + ',axis+solve:' + (t2c - t1) + ',total:' + (t2c - t0) + '}');
        var nEl = items.length;
        var stub = { out: new Array(nEl), nElements: nEl, nNodes: nEl, msMeta: [],
                     stragglerOf: new Uint8Array(nEl),
                     counts: { e1: 0, e2h: 0, e2o: 0, e3: 0, e4: 0, member: 0, stragglers: 0 },
                     designated: des0, cellPath: true };
        for (var si = 0; si < nEl; si++) stub.out[si] = null;
        return { ok: true, G: G, graph: stub,
                 solution: { times: solC.times, makespanDays: solC.makespanDays,
                             drops: { e3: 0, e4: 0, member: 0, contractedSccs: 0, contractedNodes: 0,
                                      fsViolInScc: 0, crewOverCapScc: 0 },
                             cells: solC.cells },
                 gate: { path: 'CELL', repr: filing.repr, mark: CELL_GATE_MARK,
                         promoted: filing.promoted, refused: filing.refused,
                         cellKeys: solC.keyOf },
                 ms: { contact: t1 - t0, build: 0, solve: t2c - t1, total: t2c - t0 } };
      }
      // fall through to the graph engine — today's schedule, unchanged, for this building
    } else {
      console.log('§CELL_GATE unavailable (LocationAxis=' + !!LA + ' db=' + !!db +
        ') path=GRAPH — legacy caller or module not loaded; the graph engine runs unchanged');
    }
    var graph = buildGraph(items, G);
    var t2 = Date.now();
    var sol = solve(items, graph, opts);
    var t3 = Date.now();
    console.log('§CPM_RUN n=' + items.length + ' nodes=' + graph.nNodes +
      ' edges={E1:' + graph.counts.e1 + ',E2host:' + graph.counts.e2h + ',E2open:' + graph.counts.e2o +
      ',E3:' + graph.counts.e3 + ',E4:' + graph.counts.e4 + ',member:' + graph.counts.member + '}' +
      ' stragglers=' + graph.counts.stragglers +
      ' cycleDrops={E3:' + sol.drops.e3 + ',E4:' + sol.drops.e4 + ',member:' + sol.drops.member +
      ',contractedSccs:' + sol.drops.contractedSccs + ',contractedNodes:' + sol.drops.contractedNodes +
      ',fsViolInScc:' + sol.drops.fsViolInScc + '}' +
      ' crewOverCapScc=' + sol.drops.crewOverCapScc +
      ' makespanDays=' + sol.makespanDays.toFixed(1) +
      ' ms={contact:' + (t1 - t0) + ',build:' + (t2 - t1) + ',solve:' + (t3 - t2) + ',total:' + (t3 - t0) + '}');
    return { ok: true, G: G, graph: graph, solution: sol,
             ms: { contact: t1 - t0, build: t2 - t1, solve: t3 - t2, total: t3 - t0 } };
  }

  var API = { contactGraph: contactGraph, designatedSupport: designatedSupport,
              buildGraph: buildGraph, solve: solve, run: run, TIER1_ORDER: TIER1_ORDER };
  global.CpmSchedule = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
