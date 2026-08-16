// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* cpm_schedule.js — Implementing prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md §CPM_SPEC
 * (bim-compiler, 2026-08-16). Witness: scripts/probe_cpm_schedule.js.
 *
 * ONE dependency DAG + ONE forward pass, side-by-side with the shipped 11-pass display pipeline
 * (replaces nothing yet — §EXECUTION_PLAN stages 1-3). A node is an element (dur = crew-leveled
 * duration from ScheduleGate.computeSchedule, which stays — §WHAT_STAYS) or a dur-0 milestone.
 * An edge means "T cannot start until S starts (SS) / finishes (FS)". Earliest-start = one Kahn
 * topological pass, ES(T) = max(crew lower bound, max over in-edges). No fixpoint, no sweep cap.
 *
 * Edge types (§CPM_SPEC — every edge traces to a real geometry query or an already-shipped rule):
 *   E1 support   SS  designated physical support from the contact graph (judge's own relation)
 *   E2 host/open FS  ScheduleGate.hostPairs / openingPairs (the one shared definition)
 *   E3 discipline FS Tier-1 chain + Tier-2-after-Tier-1 per level, via hammock milestones
 *   E4 storey    FS  phase P complete at level k -> phase P elements at level k+1 (THE missing edge)
 *   E5 crew       -  per-element lower bound ES(T) >= computeSchedule(T).start (no explicit edges)
 *
 * Cycle policy (§TIER_DAG_WINS doctrine — physics beats phase tidiness): Tarjan SCC first. A
 * cycle containing a hammock/membership edge drops exactly those edges INSIDE the cycle (tidiness
 * loses to physics, surgically — never a blanket drop). A remaining pure-physics cycle (e.g.
 * Clinic's parapet/roof-slab loop, mutual-contact pairs) is CONTRACTED: every member shares one
 * earliest-start, which satisfies the judge's own start-vs-start contact test with equality.
 * Every drop/contraction is counted and reported, never hidden.
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
  function designatedSupport(items, G) {
    var SG = (typeof global.ScheduleGate !== 'undefined') ? global.ScheduleGate : ScheduleGate;
    var EPS = SG.EPS, GAP = SG.GAP;
    var n = items.length, out = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = -1;
      var list = G.contacts[i]; if (!list) continue;
      var T = items[i], bestJ = -1, bestCls = 9, bestScore = Infinity;
      for (var k = 0; k < list.length; k++) {
        var j = list[k], S = items[j], cls, score;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { cls = 0; score = -S.tz; }
        else if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) { cls = 1; score = Math.abs(S.bz - T.bz); }
        else { cls = 2; score = S.bz; }
        if (cls < bestCls || (cls === bestCls && (score < bestScore ||
            (score === bestScore && (bestJ < 0 || String(S.guid) < String(items[bestJ].guid)))))) {
          bestCls = cls; bestScore = score; bestJ = j;
        }
      }
      out[i] = bestJ;
    }
    return out;
  }

  // buildGraph(items, G) — items need guid,cls,seq,phase,storey,x0,x1,y0,y1,bz,tz,s,e where s/e are
  // the crew-leveled generative times (E5 lower bound + durations). Returns the whole graph.
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
    var lvlRank = {}; levels.forEach(function (L, r) { lvlRank[L] = r; });

    // Group key = lexicographic (levelRank, phaseRank) as one int; phaseRank = Tier-1 chain index,
    // Tier-2 = 3. Every hammock gate points to a strictly LARGER key than its own.
    function phaseRank(P) { var t = TIER1_ORDER.indexOf(P); return t >= 0 ? t : 3; }
    function groupKeyOf(i2) {
      if (!lvlOf[i2]) return -1;
      return lvlRank[lvlOf[i2]] * 8 + phaseRank(items[i2].phase || '_UNPHASED');
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
    var stragglerOf = new Uint8Array(n);
    for (i = 0; i < n; i++) if (lvlOf[i] && maxAnc[pscc.comp[i]] > groupKeyOf(i)) { stragglerOf[i] = 1; counts.stragglers++; }
    function isStraggler(i2) { return stragglerOf[i2] === 1; }

    // Milestones: M(level, phase) completion, dur 0, fed FS by every NON-STRAGGLER member.
    var msId = {}, msMeta = [];     // node ids n.. ; msMeta[k] = {level, phase}
    var groups = {};                // level||phase -> [element idx]
    for (i = 0; i < n; i++) {
      if (!lvlOf[i]) continue;
      var key = lvlOf[i] + '||' + (items[i].phase || '_UNPHASED');
      (groups[key] || (groups[key] = [])).push(i);
    }
    function milestone(level, phase) {
      var key = level + '||' + phase;
      if (key in msId) return msId[key];
      var id = n + msMeta.length;
      msMeta.push({ level: level, phase: phase });
      msId[key] = id;
      out.push(null);
      var g = groups[key];
      if (g) for (var k5 = 0; k5 < g.length; k5++) {
        if (isStraggler(g[k5])) continue;
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

    // E4 — storey hammocks per phase: M(P, level k) -> elements of (P, next level where P present).
    var phases = {};
    Object.keys(groups).forEach(function (key) {
      var cut = key.indexOf('||');
      (phases[key.slice(cut + 2)] = phases[key.slice(cut + 2)] || []).push(key.slice(0, cut));
    });
    Object.keys(phases).forEach(function (P) {
      var ls = phases[P].sort(function (a, b) { return lvlRank[a] - lvlRank[b]; });
      for (var p = 0; p + 1 < ls.length; p++) {
        var m = milestone(ls[p], P), succ = groups[ls[p + 1] + '||' + P];
        for (var k = 0; k < succ.length; k++) addEdge(m, succ[k], FS, 4, 'e4');
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

  // solve(items, graph) — SCC condensation + ONE forward pass. Returns per-element {s,e} + stats.
  function solve(items, graph) {
    var n = graph.nElements, total = graph.nNodes, out = graph.out;
    var i, u, k, e, os;
    var drops = { e3: 0, e4: 0, member: 0, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0 };

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

    // Kahn over the CONDENSATION: every node of a component shares one earliest-start (an SS
    // physics edge inside it holds with equality — the judge's own tolerance accepts that; FS
    // edges inside it are the counted cost of the break, never hidden).
    var ES = new Float64Array(total), DUR = new Float64Array(total);
    for (i = 0; i < n; i++) { ES[i] = items[i].s; DUR[i] = Math.max(0, items[i].e - items[i].s); }
    var compES = new Float64Array(nComp);
    var compNodes = new Array(nComp);
    for (u = 0; u < total; u++) {
      var c = comp[u];
      (compNodes[c] || (compNodes[c] = [])).push(u);
      if (ES[u] > compES[c]) compES[c] = ES[u];
    }
    var indeg = new Int32Array(nComp);
    for (u = 0; u < total; u++) {
      os = out[u]; if (!os) continue;
      for (k = 0; k < os.length; k++) {
        e = os[k];
        if (!e.dropped && comp[e.to] !== comp[u]) indeg[comp[e.to]]++;
      }
    }
    var q = [], head = 0, processed = 0;
    for (i = 0; i < nComp; i++) if (!indeg[i]) q.push(i);
    while (head < q.length) {
      var cu = q[head++]; processed++;
      var members = compNodes[cu], contracted = members.length > 1;
      var es = compES[cu];
      for (k = 0; k < members.length; k++) {
        u = members[k];
        ES[u] = es;
        if (contracted) {
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
          if (--indeg[cv] === 0) q.push(cv);
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

  // run(items) — contact graph + build + solve, with per-phase §CPM timing stats.
  function run(items) {
    var t0 = Date.now();
    var G = contactGraph(items);
    var t1 = Date.now();
    if (!G.ok) return { ok: false, error: 'ScheduleGate not loaded' };
    var graph = buildGraph(items, G);
    var t2 = Date.now();
    var sol = solve(items, graph);
    var t3 = Date.now();
    console.log('§CPM_RUN n=' + items.length + ' nodes=' + graph.nNodes +
      ' edges={E1:' + graph.counts.e1 + ',E2host:' + graph.counts.e2h + ',E2open:' + graph.counts.e2o +
      ',E3:' + graph.counts.e3 + ',E4:' + graph.counts.e4 + ',member:' + graph.counts.member + '}' +
      ' stragglers=' + graph.counts.stragglers +
      ' cycleDrops={E3:' + sol.drops.e3 + ',E4:' + sol.drops.e4 + ',member:' + sol.drops.member +
      ',contractedSccs:' + sol.drops.contractedSccs + ',contractedNodes:' + sol.drops.contractedNodes +
      ',fsViolInScc:' + sol.drops.fsViolInScc + '}' +
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
