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
  // §CHAINAGE_V2: road trade name → its declared sequence, read from the owner (rates.js SEQUENCE_CIVIL). Empty when rates.js
  // is not loaded (node harnesses on buildings) → every rank/edge below is exactly as before.
  var CIVIL_SEQ = (function () {
    var SC = (typeof global !== 'undefined' && global.SEQUENCE_CIVIL) || null, m = {};
    if (SC) for (var d in SC) if (SC[d] && SC[d].phase) m[SC[d].phase] = SC[d].sequence;
    return m;
  })();
  var SS = 0, FS = 1;

  // contactGraph(items) — THE owner of the physical support relation (bim-compiler prompts/4D_MODEL_INTEGRITY.md
  // §I.1a, 2026-10-06). support_sweep.js's contactGraph/designatedSupport delegate here; there is no second copy.
  // contactGraph(items) — the one place the physical world is derived. Both the repair below and
  // the LOCK-GATE audit (_midairAudit → verifyGanttIntegrity) build on this single definition, so a
  // planner's own edit is judged by exactly the rule the generator enforced. items need bbox
  // (x0,x1,y0,y1,bz,tz) — times are read later, never here: geometry does not move — plus
  // seq/phase for the §GROUND_CONNECTED classification seeds (absent ⇒ NOT exempt, never looser;
  // a population carrying none at all takes the ground-band fallback, see below).
  // Returns { contacts: [idx[]|null], grounded: Uint8Array, orphans, groundedN, ok,
  //           groundConnected: Uint8Array, groundConnectedN, groundSeeds, groundSeedMode }.
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
      grounded[i] = (lowest < T.bz - GAP) ? 0 : 1;                // 1 ⇒ I am my footprint's ground layer
      contacts[i] = list;
      if (grounded[i]) groundedN++;
    }
    // §GROUND_CONNECTED (2026-09-12, bim-compiler prompts/4D_MODEL_INTEGRITY.md §N) — the orphan
    // exemption is DERIVED from classification and graph reachability, never from `grounded[i]`.
    // `grounded[i]` answers "is nothing beneath me in my own XY column" (footprint-local; correct
    // for "rests on soil in its footprint", §I.2) and was reused on this line as "is this element
    // allowed to be unsupported" — a different question whose answer §I.2 already names: seq===1.
    // Two failure shapes, one root line: (a) an element with ZERO contacts and nothing below it
    // defaulted into "grounded" by the absence of any comparison; (b) the bottom of a stack that
    // never reaches real ground read grounded=1 because "nothing below me in my column" is locally
    // true (HHS's three 7m Stahlbalkon brackets at bz 3.74: contacts=0, grounded=1 — absorbed into
    // groundedN, never an orphan, revealed alone in the bake). Fix: a DIRECTED walk along the
    // support edges this function already built (contacts[i] = "what supports i"; the walk goes
    // supporter -> supported), seeded from the true-ground population. An element is ground-
    // connected iff it is a seed or something ground-connected supports it; everything else is an
    // orphan REGARDLESS of grounded[i]. Directed, not undirected: the segment resting ON a floating
    // bracket lists the bracket as its bearing contact, and an undirected walk would let that
    // segment "rescue" the bracket — the backward "I depend on the thing resting on me" edge
    // §GROUNDED_NEVER_HANGS already rejects (measured: undirected reaches all 6839 of HHS).
    //   seeds (classification, §I.2): seq===1 (IfcFooting/IfcPile/§SLAB_ON_GRADE_RECLASS) OR
    //   phase==='Substructure' (§GROUNDWORK_SLAB reclassifies slab-on-grade by mutating phase ONLY,
    //   seq stays 4 — JKR's 16 are its whole classified ground, reachable no other way). A missing
    //   .seq/.phase is NOT a seed — stricter, never looser.
    //   fallback (ONLY when the population carries no classified ground at all — schedule_gate's
    //   own buildingModelsSubstructure=false, "this building never modeled a foundation layer",
    //   HHS today): footprint-grounded elements within ScheduleGate.GROUND_BAND of the building's
    //   1st-percentile base — the same ground datum witness_true_orphan_floating.js (PR #1712)
    //   exempts. Without it a building with no substructure would be 100% orphans; with it a stack
    //   bottom metres above the datum (the HHS brackets) still cannot seed itself. The mode is
    //   RETURNED, never silent.
    // MEASURED on the 7 shipped buildings (2026-09-12, extracted DBs, before -> after):
    //   Duplex 1->0 (the one old "orphan" was a seq===1 slab-on-grade — §I.2's own example, wrongly
    //   flagged before) · Clinic 27->27 · HHS 36->44 (+3 brackets, +5 that rest only on them) ·
    //   JKR 1->2 · Hospital 35->69 (+a 30-railing island with NOTHING beneath its lowest member) ·
    //   Terminal 7->14 · LTU_AHouse 51->1096 (a ground-floor MEP network with no modelled substrate;
    //   PR #1712's engine-blind detector already reports 2548 true orphans on this building).
    //   W-MZ-4's lock (meta DBs where they exist) moves further on the two patched-elevation files:
    //   Terminal_meta 25->2740 (2711 co-planar "Metal Deck" IfcPlate roof sheets with 18.7m of
    //   nothing beneath them in that DB) and LTU_AHouse_meta 865->3288 — data findings the old
    //   exemption hid, recorded in baselines/midair.json `_relocked_2026_09_12`.
    // `grounded`/`groundedN` keep their footprint-local meaning (designatedSupport's cls=2
    // rejection still reads them). Return fields are additive; `orphans` now counts !groundConnected.
    var reach = new Uint8Array(n), stack = new Int32Array(n), sp = 0, seeds = 0, seedMode = 'classification', groundDatum = null;
    for (i = 0; i < n; i++) {
      T = items[i];
      if (T.seq === 1 || T.phase === 'Substructure') { reach[i] = 1; stack[sp++] = i; seeds++; }
    }
    if (!seeds && n) {
      seedMode = 'ground-band';
      var zs = new Float64Array(n);
      for (i = 0; i < n; i++) zs[i] = items[i].bz;
      zs.sort();                                                   // typed-array sort is numeric
      var datum = zs[Math.floor(n * 0.01)] + SG.GROUND_BAND; groundDatum = datum;
      for (i = 0; i < n; i++) if (grounded[i] && items[i].bz <= datum) { reach[i] = 1; stack[sp++] = i; seeds++; }
    }
    var deg = new Int32Array(n + 1);                               // CSR of the REVERSE edges: supporter -> supported
    for (i = 0; i < n; i++) { arr = contacts[i]; if (arr) for (k = 0; k < arr.length; k++) deg[arr[k] + 1]++; }
    for (i = 0; i < n; i++) deg[i + 1] += deg[i];
    var fill = deg.slice(0, n), sup = new Int32Array(deg[n]);
    for (i = 0; i < n; i++) { arr = contacts[i]; if (arr) for (k = 0; k < arr.length; k++) sup[fill[arr[k]]++] = i; }
    while (sp) { j = stack[--sp]; for (k = deg[j]; k < deg[j + 1]; k++) { c = sup[k]; if (!reach[c]) { reach[c] = 1; stack[sp++] = c; } } }
    var groundConnectedN = 0;
    for (i = 0; i < n; i++) if (reach[i]) groundConnectedN++;
    orphans = n - groundConnectedN;
    return { ok: true, contacts: contacts, grounded: grounded, orphans: orphans, groundedN: groundedN,
             groundConnected: reach, groundConnectedN: groundConnectedN, groundSeeds: seeds, groundSeedMode: seedMode, groundDatum: groundDatum };
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
  // §D4_SUPPORT_FINISHED (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.6 D4, §Q.12 — 2026-11-17). "Supported" means the
  // support is FINISHED: nothing is landed on a half-built column, nothing is hung from a half-built slab. A cast-in or
  // same-pour item goes in WITH its host. So bearing-below and carrier-above are FINISH-to-start; embedded stays
  // START-to-start. supportBound(S, T, sS, eS) is the ONE place that says which instant of the support binds T — the
  // graph edge (buildGraph E1) and the judge (support_sweep.js midairAudit) all call it,
  // so the generator and the lock gate cannot drift apart. Curing time is not modelled — no data, none invented.
  function supportIsEmbedded(S, T) {
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate : ScheduleGate;
    if (S.bz < T.bz - SG.EPS && S.tz >= T.bz - SG.GAP) return false;        // bearing-below (the election's own first clause)
    return S.bz <= T.bz + SG.EPS && S.tz >= T.tz - SG.EPS;                  // embedded; anything else is carrier-above
  }
  function supportBound(S, T, sS, eS) { return supportIsEmbedded(S, T) ? sS : eS; }
  // §ONE_LIFT (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.6 D3 "a tie is one lift", §Q.13 — 2026-11-17).
  // electionRings(des) -> Int32Array: a ring id for every element that sits on a RING of the election (A elects B,
  // B elects A — a pipe run and its fitting, two same-depth beams, a footing pair), -1 otherwise. Each element elects
  // at most one support, so a ring is a simple cycle. A ring is ONE LIFT: its members go in together, so between ring
  // members the bound is always the START, whatever the relation. The graph edge (buildGraph), the judge
  // (support_sweep midairAudit) and the within-bar tiler (schedule_author remapSolveToTasks, via the `lift` field the
  // display map carries) all read this one definition.
  function electionRings(des) {
    var n = des.length, ring = new Int32Array(n), st = new Uint8Array(n), next = 0;
    ring.fill(-1);
    for (var i = 0; i < n; i++) {
      if (st[i]) continue;
      var walk = [], u = i;
      while (u >= 0 && !st[u]) { st[u] = 1; walk.push(u); u = des[u]; }
      if (u >= 0 && st[u] === 1) { for (var k = walk.indexOf(u); k < walk.length; k++) ring[walk[k]] = next; next++; }
      for (var w = 0; w < walk.length; w++) st[walk[w]] = 2;
    }
    ring.count = next;
    return ring;
  }

  function designatedSupport(items, G) {
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate : ScheduleGate;
    var EPS = SG.EPS, GAP = SG.GAP;
    var n = items.length, out = new Int32Array(n), noSup = [], noSupGrounded = 0;
    // §D3_MAIN_BEFORE_SECONDARY (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.6 D3, §Q.12 — 2026-11-17).
    // Practice: girders that span bearer to bearer go first; the beams that frame into them follow. Two boxes of
    // the same depth are EMBEDDED in each other both ways (§Q.3 Gap 3: Hospital 73 of 73), so which one "supports"
    // which was the guid tie-break. bearsOnPool(j) = j has a bearing-below contact inside the pool (memoised);
    // it is the extracted fact that tells the main beam from the one framing into it. Where NEITHER bears on
    // structure the election is unchanged — the pair elects each other and the solve places it as one lift
    // (the contracted SCC's shared start). Nothing is left unelected by D3.
    var bearMemo = new Int8Array(n), d3Demoted = 0;
    var contactOnly = [], d7Contacts = 0, d7Reelected = 0, seedSkipped = 0;
    // §GROUND_BAND_RESTS_ON_SOIL (owner 2026-11-18, bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.16.4 item 3 / §Q.17):
    // a building that models NO foundations (no sequence-1 / Substructure element: contactGraph's own groundSeedMode
    // 'ground-band') still stands on soil. There a STRUCTURAL element whose base is inside the ground band (the same
    // datum the orphan walk seeds from) is a ground seed for the election. Not `grounded[i]`: that is footprint-local
    // (§I.2) — one buried pipe under a 3,400 m2 ground slab voided it and the slab was elected onto a stair flight.
    var bandMode = G.groundSeedMode === 'ground-band' && typeof G.groundDatum === 'number', bandSeeds = 0;
    function isSeed(X, xStruct) {
      // real structure only: a pool member admitted for visibility (sequence > 4 — a stair flight, a promoted roof slab) is
      // not what a building stands on (the same line §STRUCTURE_BEARS_ON_STRUCTURE draws below)
      return X.seq === 1 || X.phase === 'Substructure' ||
        (bandMode && xStruct && typeof X.seq === 'number' && X.seq <= 4 && X.bz <= G.groundDatum);
    }
    function bearsOnPool(j) {
      if (bearMemo[j]) return bearMemo[j] === 1;
      var lj = G.contacts[j], Tj = items[j], hit = false;
      if (lj && SG.supportPool) for (var q2 = 0; q2 < lj.length; q2++) {
        var Sj = items[lj[q2]];
        if (SG.supportPool(Sj) && Sj.bz < Tj.bz - EPS && Sj.tz >= Tj.bz - GAP) { hit = true; break; }
      }
      bearMemo[j] = hit ? 1 : 2;
      return hit;
    }
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
      // §D2_STRUCT_NO_CARRIER (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.6 D2, 2026-11-14) — a
      // STRUCTURAL element (T itself in supportPool) never hangs from what it carries: for such T
      // carrier-above is NOT eligible and ONLY pool contacts are eligible. Measured before: every
      // beam whose pool winner was carrier-above was midair by construction (Hospital 30/30,
      // Terminal 26/26, Duplex 4/4 — §Q.3 Gap 1: R1 puts the slab after the beam it "hangs" from).
      // No eligible contact ⇒ -1 and the element is COUNTED and NAMED (out.structNoSupport,
      // §STRUCT_NO_SUPPORT) — a model gap, never hidden and never called midair. Non-structural T
      // (services, ceilings, fit-out): election unchanged, §S26.2 pool override included. Without a
      // supportPool no T is structural — the old behaviour, exactly.
      var T = items[i], bestJ = -1, bestCls = 9, bestScore = Infinity;
      var poolJ = -1, poolCls = 9, poolScore = Infinity;
      var inPool = SG.supportPool || function () { return true; };
      var tStruct = !!(SG.supportPool && SG.supportPool(T));
      var skippedLater = 0;
      var tSeed = tStruct && isSeed(T, true);
      if (tSeed && bandMode && !(T.seq === 1 || T.phase === 'Substructure')) bandSeeds++;
      for (var k = 0; k < list.length; k++) {
        var j = list[k], S = items[j], cls, score;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { cls = 0; score = -S.tz; }
        else if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) {
          cls = 1; score = Math.abs(S.bz - T.bz);
          // §D3_MAIN_BEFORE_SECONDARY: for a structural T, an embedded contact that itself bears on structure
          // (the main beam) outranks one that does not (cls 1 vs 1.5). The old order was the tie-break alone.
          if (tStruct && !bearsOnPool(j)) { cls = 1.5; d3Demoted++; }
        }
        else { cls = 2; score = S.bz; }
        // §D7_CONTACT_ONLY (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.9 F4b, §Q.9.4 D7 — 2026-11-17). Practice and the
        // template agree: services go in before ceilings and floor finishes. For a NON-structural T, a contact that
        // is outside the pool and that the class sequence builds LATER than T (a ceiling tile under a duct, a floor
        // finish under a pipe) is a contact, not a support — §E row 1. It is not eligible; the best of the remaining
        // contacts is elected as before. If nothing remains T has no elected support and is COUNTED and NAMED on
        // §CONTACT_ONLY — never hidden, never called midair. Structural T is untouched (§D2 governs it).
        var laterContact = !tStruct && SG.supportPool && !SG.supportPool(S) &&
          typeof S.seq === 'number' && typeof T.seq === 'number' && S.seq > T.seq;
        if (laterContact) { skippedLater++; continue; }
        if (cls < bestCls || (cls === bestCls && (score < bestScore ||
            (score === bestScore && (bestJ < 0 || String(S.guid) < String(items[bestJ].guid)))))) {
          bestCls = cls; bestScore = score; bestJ = j;
        }
        if (tStruct && cls === 2) continue;                   // §D2: structure is not hung from what it carries
        // §GROUND_RESTS_ON_SOIL (bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.2, §Q.13 — 2026-11-17): a ground seed
        // (sequence 1 or phase Substructure) rests on soil. It may elect another ground seed, never something of a
        // later phase — a column or wall whose box runs down through its footing was elected as the footing's "bearer"
        // (LTU 236, Hospital 8, Clinic 6), so the footing was judged against the frame it carries.
        if (tSeed && !isSeed(S, inPool(S))) { seedSkipped++; continue; }
        // §STRUCTURE_BEARS_ON_STRUCTURE (§Q.13): a contact that is in the pool only for VISIBILITY (sequence > 4: a
        // stair flight, a promoted roof slab) and is built later than the structural T ranks behind any bearer that is
        // real structure (cls +0.25). A slab with a beam under it no longer elects the stair flight beside the beam.
        if (tStruct && cls < 2 && typeof S.seq === 'number' && typeof T.seq === 'number' && S.seq > 4 && S.seq > T.seq) cls += 0.25;
        if (inPool(S) && (cls < poolCls || (cls === poolCls && (score < poolScore ||
            (score === poolScore && (poolJ < 0 || String(S.guid) < String(items[poolJ].guid))))))) {
          poolCls = cls; poolScore = score; poolJ = j;
        }
      }
      if (tStruct) {                                          // §D2: only a pool contact below/embedded
        if (poolJ < 0) {
          // ground seeds (§I.2 / §GROUND_CONNECTED: seq===1 or Substructure) rest on soil — not a gap
          if (!tSeed) { noSup.push(i); if (G.grounded[i]) noSupGrounded++; }
          continue;
        }
        out[i] = poolJ; continue;
      }
      if (poolJ >= 0) { bestJ = poolJ; bestCls = poolCls; }   // §S26.2 structure outranks contact
      if (bestJ < 0) { if (skippedLater) { contactOnly.push(i); d7Contacts += skippedLater; } continue; }   // §D7: only later-built contacts
      if (skippedLater) d7Reelected++;
      if (bestCls === 2 && G.grounded[i]) continue;   // carrier-above rejected ONLY when grounded
      out[i] = bestJ;
    }
    // §STRUCT_NO_SUPPORT — counted and named on every call (PRIMAL LAW 4: the count is printed even at 0)
    var byCls = {};
    for (var q = 0; q < noSup.length; q++) byCls[items[noSup[q]].cls] = (byCls[items[noSup[q]].cls] || 0) + 1;
    console.log('§STRUCT_NO_SUPPORT n=' + noSup.length + ' footprintGrounded=' + noSupGrounded +
      ' structural=' + (SG.supportPool ? 'supportPool' : 'NONE (no pool loaded — rule inactive)') +
      ' byCls=' + JSON.stringify(byCls) +
      ' guids=' + noSup.slice(0, 20).map(function (x) { return items[x].guid; }).join(',') + (noSup.length > 20 ? ',…' : ''));
    console.log('§D3_MAIN_BEFORE_SECONDARY embeddedContactsRankedBehindABearingOne=' + d3Demoted + (SG.supportPool ? '' : ' (no pool loaded — rule inactive)'));
    var coCls = {};
    for (var q3 = 0; q3 < contactOnly.length; q3++) coCls[items[contactOnly[q3]].cls] = (coCls[items[contactOnly[q3]].cls] || 0) + 1;
    console.log('§CONTACT_ONLY n=' + contactOnly.length + ' (non-structural, every contact is a later-built non-structural box)' +
      ' electedFromRemainingContacts(hadALaterContactIgnored)=' + d7Reelected + ' byCls=' + JSON.stringify(coCls) +
      ' guids=' + contactOnly.slice(0, 20).map(function (x) { return items[x].guid; }).join(',') + (contactOnly.length > 20 ? ',…' : ''));
    out.contactOnly = contactOnly;
    console.log('§GROUND_RESTS_ON_SOIL laterPhaseContactsIgnoredForGroundSeeds=' + seedSkipped +
      ' groundSeedMode=' + (G.groundSeedMode || '?') + (bandMode ? ' groundBandDatum=' + G.groundDatum.toFixed(2) + 'm structuralSeedsInBand=' + bandSeeds : ''));
    out.structNoSupport = noSup;
    out.d3Demoted = d3Demoted;
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
    // §E1_BOND_CARRIERS switch (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.41, default ON since §Q.42). Off for a comparison run only:
    // browser window.__TPL_BOND_CARRIERS = false; node env TPL_BOND_CARRIERS=0. `have` remembers the edges already in the graph.
    var _envB = (typeof process !== 'undefined' && process && process.env) ? process.env : {};
    var bondOn = !(global.__TPL_BOND_CARRIERS === false || _envB.TPL_BOND_CARRIERS === '0'), have = bondOn ? new Set() : null;
    function addEdge(u, v, kind, type, bucket) {
      (out[u] || (out[u] = [])).push({ to: v, kind: kind, type: type });
      counts[bucket]++;
      if (have) have.add(u * n + v);
    }

    // E1 — designated physical support, SS
    var des = designatedSupport(items, G);
    // E1 kind: FS for bearing-below / carrier-above, SS for embedded (§D4_SUPPORT_FINISHED)
    var e1fs = 0;
    var ring = electionRings(des);
    for (i = 0; i < n; i++) if (des[i] >= 0) {
      var _emb = supportIsEmbedded(items[des[i]], items[i]) || (ring[i] >= 0 && ring[i] === ring[des[i]]);   // §ONE_LIFT: ring members bind at the START
      if (!_emb) e1fs++;
      addEdge(des[i], i, _emb ? SS : FS, 1, 'e1');
    }
    counts.e1fs = e1fs;

    // §E1_ALL_CARRIERS (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.33.9) — a floor/roof PLATE (a structural element wider than it is tall in
    // BOTH plan directions) that rests on >= 2 pool carriers waits for ALL of them, not only for the one E1 elected. Practice: a slab is cast
    // once the columns/walls/beams under it are up; physics as the renderer already applies it (tm_sched_xray.js _buildXraySupportCache
    // maxCarrierEnd). Measured before: the HHS L2 slab played day 1.09, its 87 columns finished day 9.22 (§Q.33.9). Carrier = pool contact whose
    // top meets the plate's underside (S.bz < T.bz-EPS, T.bz-GAP <= S.tz <= T.bz+GAP). Every edge points strictly below -> above, so these
    // edges cannot close a cycle among themselves; FS, physics bucket 'e1all'.
    var e1all = 0, e1allPlates = 0, e1allSkipNoPool = 0, EPS = SG.EPS, GAP = SG.GAP;
    if (SG.supportPool) {
      for (i = 0; i < n; i++) {
        var Tp = items[i], lp = G.contacts[i];
        if (!lp || lp.length < 2 || !SG.supportPool(Tp)) continue;
        var hgt = Tp.tz - Tp.bz, dxp = Tp.x1 - Tp.x0, dyp = Tp.y1 - Tp.y0;
        if (!(hgt < dxp && hgt < dyp)) continue;                          // a plate, not a beam / column / wall
        var carriers = [];
        for (var kp = 0; kp < lp.length; kp++) {
          var jp = lp[kp], Sp = items[jp];
          if (!SG.supportPool(Sp)) continue;
          if (Sp.bz < Tp.bz - EPS && Sp.tz >= Tp.bz - GAP && Sp.tz <= Tp.bz + GAP) carriers.push(jp);
        }
        if (carriers.length < 2) continue;
        e1allPlates++;
        for (var cp = 0; cp < carriers.length; cp++) { if (carriers[cp] !== des[i]) { addEdge(carriers[cp], i, FS, 1, 'e1all'); e1all++; } }
      }
    } else e1allSkipNoPool = 1;
    counts.e1all = e1all; counts.e1allPlates = e1allPlates;
    if (typeof console !== 'undefined') console.log('§E1_ALL_CARRIERS plates=' + e1allPlates + ' edges=' + e1all +
      (e1allSkipNoPool ? ' INCONCLUSIVE no supportPool' : '') + ' — a floor/roof plate waits for every structural carrier under it, not one');

    // §E1_BOND_CARRIERS (§Q.41, S3c redesigned; default on since §Q.42) — the shim-anchor bond's hosts are ADDED as carriers; nothing the election
    // named is taken away (§Q.40.1: replacing the elected support made 27 Terminal fittings run ahead of it). An element bonded bears-on-top /
    // hangs-below waits for each bond host to FINISH; one bonded fixes-on-side / opening-accepts / joins goes in WITH its host (start-to-start,
    // as an embedded contact does). continues-same-kind draws no order (rule C); a ground seed has no host.
    var e1bond = 0, e1bondEls = 0, e1bondBy = {}, e1bondReversed = 0;
    if (bondOn) {
      var SBg = global.ShimBonds || null;
      if (!SBg && typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { SBg = require('./shim_bonds.js'); } catch (eSBg) { SBg = null; } }
      if (!SBg || !SBg.compute) { if (typeof console !== 'undefined') console.log('§E1_BOND_CARRIERS INACTIVE — shim_bonds.js not loaded; the graph carries only the edges of the election'); }
      else {
        var bresG = SBg.compute(items, G, { EPS: EPS, GAP: GAP });
        for (i = 0; i < n; i++) {
          var capB = SBg.capOf(bresG, i), hsB = bresG.hosts[i];
          if (!capB || !hsB || capB === 'continues-same-kind' || capB === 'ground') continue;
          var kindB = (capB === 'bears-on-top' || capB === 'hangs-below') ? FS : SS, addedB = 0;
          for (var hb = 0; hb < hsB.length; hb++) {
            var uB = hsB[hb]; if (uB === i || have.has(uB * n + i)) continue;
            // §Q.42: a bond never runs AGAINST an edge the graph already has. Measured (Terminal): the election said T rests on S, S's bond
            // said S fixes onto T — the two start-to-start edges closed a loop, the pair became one lift and T was tiled ahead of its support.
            if (have.has(i * n + uB)) { e1bondReversed++; continue; }
            addEdge(uB, i, kindB, 1, 'e1bond'); addedB++;
          }
          if (addedB) { e1bond += addedB; e1bondEls++; e1bondBy[capB] = (e1bondBy[capB] || 0) + addedB; }
        }
        if (typeof console !== 'undefined') console.log('§E1_BOND_CARRIERS on edges=' + e1bond + ' elements=' + e1bondEls + ' byNeed=' + JSON.stringify(e1bondBy) +
          ' skippedAgainstAnExistingEdge=' + e1bondReversed + ' bonded=' + (bresG.counts.bonded || 0) + ' of ' + n + ' — bond hosts added as carriers beside the election (§Q.41 / §Q.42; off: TPL_BOND_CARRIERS=0)');
      }
    }
    if (!bondOn && typeof console !== 'undefined') console.log('§E1_BOND_CARRIERS off (switched off for this run) — the graph carries only the edges of the election');
    counts.e1bond = e1bond;

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
      if (L) { var a = lvlAgg[L] || (lvlAgg[L] = { sum: 0, c: 0, sec: 0, sc: 0 }); a.sum += items[i].bz; a.c++;
        if (typeof items[i].lvlSec === 'number') { a.sec += items[i].lvlSec; a.sc++; } }   // §CHAINAGE_LEVELS
    }
    var levels = Object.keys(lvlAgg).sort(function (a, b) { return lvlAgg[a].sum / lvlAgg[a].c - lvlAgg[b].sum / lvlAgg[b].c; });

    // M1 (4D_GANTT_TM_REFACTOR.md) — a LEVEL, to the gates, is a physical 3-metre z-band, not a
    // storey name. Precedent: the shipped §GANTT banding (time_machine.js `band: Math.floor(cz/3)`)
    // and §4D_BAND_MONOTONIC's own band-rank gate — same quantum, reused here, not invented.
    // bandOfLevel = floor(meanZ/3m); bandRank = dense rank of the distinct band values PRESENT
    // (ascending), so federated pseudo-levels sharing one physical storey (Terminal's Kedai/Jalan/
    // Tanah cluster) collapse onto the SAME bandRank and are never chained to each other by E4.
    var bandOfLevel = {};
    // §CHAINAGE_LEVELS (CIVIL_HIGHWAY_JELAPANG.md 2f): civil items carry a chainage section — the band key becomes
    // (section, 3 m z-band) so the ladder climbs ALONG THE ROUTE first; same lexicographic key, one int. Buildings carry
    // no lvlSec → the z-band key alone, unchanged.
    var _cpmBySec = levels.some(function (L) { return lvlAgg[L].sc > 0; });
    levels.forEach(function (L) {
      var zb = Math.floor((lvlAgg[L].sum / lvlAgg[L].c) / 3);
      bandOfLevel[L] = _cpmBySec ? (Math.round(lvlAgg[L].sc ? lvlAgg[L].sec / lvlAgg[L].sc : 0) * 100000 + zb + 50000) : zb;
    });
    var bandValues = [];
    levels.forEach(function (L) { if (bandValues.indexOf(bandOfLevel[L]) < 0) bandValues.push(bandOfLevel[L]); });
    bandValues.sort(function (a, b) { return a - b; });
    var bandRankOfBand = {}; bandValues.forEach(function (b, r) { bandRankOfBand[b] = r; });
    var bandRank = {}; levels.forEach(function (L) { bandRank[L] = bandRankOfBand[bandOfLevel[L]]; });

    // Group key = lexicographic (bandRank, phaseRank) as one int; phaseRank = Tier-1 chain index,
    // Tier-2 = 3. Every hammock gate points to a strictly LARGER key than its own. bandRank (not
    // per-name lvlRank) is the M1 straggler group-key so cross-ladder ancestry inside one physical
    // band stops manufacturing false stragglers.
    // §CHAINAGE_V2 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §CHAINAGE_V2): road trades rank by their own declared
    // sequence (rates.js SEQUENCE_CIVIL — the owner; 1..7 fits the ×8 key). Building phases never carry these names.
    function phaseRank(P) { var t = TIER1_ORDER.indexOf(P); if (t >= 0) return t; return CIVIL_SEQ[P] || 3; }
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

    // §CHAINAGE_V2 E3-civil — inside one chainage section the road trades follow their declared sequence (SEQUENCE_CIVIL:
    // earthworks → drainage → pavement → furniture → signage → lighting → marking), the per-section half of a line of balance;
    // E4 below is the other half (each trade section to section). Before this every civil phase was "Tier-2" with no Tier-1
    // on the level, so a section's trades ran in parallel — MEASURED 46 lamp columns before their own section's pavement.
    // Levels with no civil phase (every building) add nothing here.
    levels.forEach(function (L) {
      var civ = [];
      Object.keys(groups).forEach(function (key) {
        var cut = key.indexOf('||');
        if (key.slice(0, cut) === L && CIVIL_SEQ[key.slice(cut + 2)]) civ.push(key.slice(cut + 2));
      });
      if (civ.length < 2) return;
      civ.sort(function (a, b) { return CIVIL_SEQ[a] - CIVIL_SEQ[b]; });
      for (var p = 0; p + 1 < civ.length; p++) {
        var m = milestone(L, civ[p]), succ = groups[L + '||' + civ[p + 1]];
        for (var k = 0; k < succ.length; k++) addEdge(m, succ[k], FS, 3, 'e3');
      }
    });
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
        if (TIER1_ORDER.indexOf(ph) < 0 && !CIVIL_SEQ[ph]) tier2.push(key);   // §CHAINAGE_V2: civil trades chain above
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
             levels: levels, counts: counts, designated: des, ring: ring };
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
    // §TIE_ORDER (§Q.13): the rank at which the solve finalised each element — supports always before what they
    // support. Two elements may share a start (a start-to-start edge allows it); the within-bar tiler broke that tie
    // by guid and could lay the dependent first. The display map carries this rank (`ord`) so the tie is the solve's.
    var order = new Int32Array(n);
    for (i = 0; i < nComp; i++) if (!indeg[i]) heapPush(i);
    function memberOrder(a, b) {   // deterministic within-component claim order
      if (items[a].bz !== items[b].bz) return items[a].bz - items[b].bz;
      var ga = String(items[a].guid), gb = String(items[b].guid);
      return ga < gb ? -1 : (ga > gb ? 1 : 0);
    }
    while (heap.length) {
      var cu = heapPop(); processed++;
      for (var _oi = 0; _oi < compNodes[cu].length; _oi++) if (compNodes[cu][_oi] < n) order[compNodes[cu][_oi]] = processed;   // §TIE_ORDER
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
    return { times: times, drops: drops, processed: processed, total: nComp, comp: comp, order: order,
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
    return { lvl2: lvl2, loc2: loc2, promoted: promoted, des: des,
             e1Total: total, intra: intra, representable: ok, refused: refused,
             repr: total ? (intra + ok) / total : 1 };
  }
  function _trdOf(it) { return (typeof it.seq === 'number' ? it.seq : 99); }

  function _perf() { var e = global.CoreEdge; return e && typeof e.perfMs === 'function' ? e.perfMs() : null; }
  function _dt(a, b) { return a == null || b == null ? null : Math.round(b - a); }
  function _ms(v) { return v == null ? '?' : v; }

  // run(items, opts) — §S50: location axis + gate, THEN either the cell schedule (>= mark) or
  // the retained graph engine (< mark, or no db/LocationAxis — every legacy caller lands there
  // unchanged). opts.maxCrews: per-resource crew caps, same shape computeSchedule takes.
  // opts.db: the building DB; defaults to APP.db (the viewer's live app object) when present.
  function run(items, opts) {
    var t0 = _perf();
    var G = contactGraph(items);
    var t1 = _perf();
    if (!G.ok) return { ok: false, error: 'ScheduleGate not loaded' };
    var LA = (typeof global.LocationAxis !== 'undefined') ? global.LocationAxis
      : (typeof LocationAxis !== 'undefined' ? LocationAxis : null);
    var db = (opts && opts.db) || (global.APP && global.APP.db) || null;
    if (LA && db) {
      var axis = LA.derive(db, items, { label: (opts && opts.label) || ('n' + items.length) });
      var des0 = designatedSupport(items, G);
      var filing = _cellFiling(items, axis, des0);
      // §CIVIL_GRAPH_GATE (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md): a road's location is its chainage section
      // (item.lvlSec, §CHAINAGE_LEVELS), which only the graph engine reads (E3-civil + E4 line of balance). The cell path
      // files by HEIGHT levels — measured on a road + bridge + ground works merge: lamps below the road's height band were
      // placed before the pavement. Any item with a chainage section → graph. No building item carries lvlSec → unchanged.
      var _chainN = 0; for (var _ci = 0; _ci < items.length; _ci++) if (typeof items[_ci].lvlSec === 'number') _chainN++;
      // §GRAPH_EVERYWHERE (owner ruling 2026-11-17, bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.13 — it REVERSES the
      // 2026-08-21 §S50 ruling that made the cell engine the live precedence carrier). With D1-D7 in, both engines were
      // forced on the same code and judged on the played layer: Hospital 245 (cell) vs 54 (graph) · Terminal 343 vs 324 ·
      // Clinic 160 vs 53 · JKR 213 vs 52 · HHS 468 vs 40 · Duplex equal; programme length and stacking identical.
      // The cell solve enforces an elected support only inside one (level, trade); the graph enforces every one.
      // The representability gate is still MEASURED and printed (wouldHaveBeen=), it no longer chooses.
      var _wouldBe = (_chainN > 0) ? 'GRAPH' : (filing.repr >= CELL_GATE_MARK ? 'CELL' : 'GRAPH');
      var path = 'GRAPH';
      console.log('§CELL_GATE n=' + items.length + ' (whole scheduled population, §S46 discipline)' +
        ' E1edges=' + filing.e1Total + ' insideLT=' + filing.intra +
        ' representable=' + filing.representable + ' REFUSED=' + filing.refused +
        ' repr=' + (100 * filing.repr).toFixed(2) + '% mark=' + (100 * CELL_GATE_MARK) + '%' +
        ' promoted=' + filing.promoted + ' path=' + path + ' wouldHaveBeen=' + _wouldBe + ' (§GRAPH_EVERYWHERE: the graph engine runs on every building)' +
        (_chainN ? ' reason=chainage(' + _chainN + ' items carry a section)' : '') +
        ' [gate quantity: §S47b formula, level grain, designatedSupport unchanged — a rule, not a dictionary]');
      // The cell solver is deleted (owner ruling §GRAPH_EVERYWHERE, 2026-11-17): the graph engine below is the one solve.
    } else {
      console.log('§CELL_GATE unavailable (LocationAxis=' + !!LA + ' db=' + !!db +
        ') path=GRAPH — legacy caller or module not loaded; the graph engine runs unchanged');
    }
    var graph = buildGraph(items, G);
    var t2 = _perf();
    var sol = solve(items, graph, opts);
    var t3 = _perf();
    console.log('§CPM_RUN n=' + items.length + ' nodes=' + graph.nNodes +
      ' edges={E1:' + graph.counts.e1 + '(FS ' + (graph.counts.e1fs || 0) + ')' + ',E2host:' + graph.counts.e2h + ',E2open:' + graph.counts.e2o +
      ',E3:' + graph.counts.e3 + ',E4:' + graph.counts.e4 + ',member:' + graph.counts.member + '}' +
      ' stragglers=' + graph.counts.stragglers +
      ' cycleDrops={E3:' + sol.drops.e3 + ',E4:' + sol.drops.e4 + ',member:' + sol.drops.member +
      ',contractedSccs:' + sol.drops.contractedSccs + ',contractedNodes:' + sol.drops.contractedNodes +
      ',fsViolInScc:' + sol.drops.fsViolInScc + '}' +
      ' crewOverCapScc=' + sol.drops.crewOverCapScc +
      ' makespanDays=' + sol.makespanDays.toFixed(1) +
      ' ms={contact:' + _ms(_dt(t0, t1)) + ',build:' + _ms(_dt(t1, t2)) + ',solve:' + _ms(_dt(t2, t3)) + ',total:' + _ms(_dt(t0, t3)) + '}');
    return { ok: true, G: G, graph: graph, solution: sol,
             ms: { contact: _dt(t0, t1), build: _dt(t1, t2), solve: _dt(t2, t3), total: _dt(t0, t3) } };
  }

  var API = { contactGraph: contactGraph, designatedSupport: designatedSupport, supportBound: supportBound, supportIsEmbedded: supportIsEmbedded, electionRings: electionRings,
              buildGraph: buildGraph, solve: solve, run: run, TIER1_ORDER: TIER1_ORDER };
  global.CpmSchedule = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
