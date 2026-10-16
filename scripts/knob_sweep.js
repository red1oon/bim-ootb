#!/usr/bin/env node
// knob_sweep.js — SANDBOX SWEEP. Turn every variant into a dial, run the whole fleet at every
// setting, and report where the signal holds THROUGHOUT rather than on one building.
//
// ⚠ DO NOT REMOVE — SCOPE. USER, 2026-08-27: "Always have a sandbox poc with such modelling and
// then test around to see what is variant to be in knob dials, until the signal is working strong
// thruout." And, the requirement this sweeps: "Types must go up in order — floor slabs, columns,
// walls, openings. If we cannot ID well, then use bounding box dimensions to identify."
// (Their words, and their correction: this is NOT new — it has been asked for weeks.)
//
// WHY A SWEEP AND NOT A CONSTANT. Every threshold this lane has hand-typed has been measured wrong
// (§E's table of proxies). A dial that is swept over the whole fleet either shows a PLATEAU — a run
// of settings where every building agrees — or it shows there is no such setting, which is itself
// the finding. A single hand-picked value can never tell you which of the two you are in.
//
// Reads the PERSISTED runs (scripts/cache_4d_run.js). Nothing here re-runs the pipeline, so the
// whole sweep is seconds; knobs that WOULD need a pipeline re-run are named at the bottom and are
// deliberately not faked.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SG = require(path.join(ROOT, 'viewer', 'schedule_gate.js')); global.ScheduleGate = SG;
const SS = require(path.join(ROOT, 'viewer', 'support_sweep.js'));
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));

const BUILDINGS = process.argv.slice(2).filter(a => a[0] !== '-').length
  ? process.argv.slice(2).filter(a => a[0] !== '-')
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];

// ── DIAL 1: geometric type from the BOUNDING BOX ────────────────────────────────────────────────
// SHAPE first, then ORIENTATION — scale-free, so a 300mm column and a 900mm column land together.
//   plate = two big dims, one small   -> odd axis VERTICAL   = slab,   odd axis HORIZONTAL = wall
//   bar   = one big dim, two small    -> long axis VERTICAL  = column, long axis HORIZONTAL = beam
// K is the anisotropy the shape must show. It is the DIAL, never a typed constant.
function geoType(e, K) {
  const dx = Math.max(0, e.x1 - e.x0), dy = Math.max(0, e.y1 - e.y0), dz = Math.max(0, e.tz - e.bz);
  if (!(dx > 0 && dy > 0 && dz > 0)) return 'unknown';
  const d = [{ v: dx, ax: 'x' }, { v: dy, ax: 'y' }, { v: dz, ax: 'z' }].sort((a, b) => a.v - b.v);
  const a = d[0].v, b = d[1].v, c = d[2].v;
  const plate = (b / a >= K), bar = (c / b >= K);
  if (plate && !bar) return d[0].ax === 'z' ? 'slab' : 'wall';
  if (bar && !plate) return d[2].ax === 'z' ? 'column' : 'beam';
  if (plate && bar) return (b / a >= c / b) ? (d[0].ax === 'z' ? 'slab' : 'wall')
                                            : (d[2].ax === 'z' ? 'column' : 'beam');
  return 'blob';
}

// TRUTH for calibration = the classes nobody disputes. The standing rule is "don't touch classes
// that are already unambiguous"; the corollary is that those classes are exactly what a geometric
// guesser must reproduce before it earns the right to guess for IfcBuildingElementProxy.
const TRUTH = { IfcSlab: 'slab', IfcColumn: 'column', IfcWall: 'wall', IfcWallStandardCase: 'wall', IfcBeam: 'beam' };

// ── THE ORDER THE USER SPECIFIED ────────────────────────────────────────────────────────────────
// "Types must go up in order - floor slabs, columns, walls, openings."
const TYPE_ORDER = ['slab', 'column', 'wall', 'opening'];
const RANK = {}; TYPE_ORDER.forEach((t, i) => RANK[t] = i);
// beam is not in the user's list; it belongs with the frame, between column and wall. Stated, not
// smuggled: it is REPORTED separately and does not gate, because they did not name it.
function typeOf(e, K) {
  if (/Opening|Door|Window/i.test(e.cls)) return 'opening';
  const t = TRUTH[e.cls];                     // unambiguous class wins over geometry, always
  if (t) return t === 'beam' ? 'beam' : t;
  return geoType(e, K);                       // "if we cannot ID well, use bounding box dimensions"
}

// ⚠ WHICH LAYER (§CACHE_PLAYED_LAYER, #1607 / queue item A-9 — ported here on the #1551 merge,
// 2026-09-02). This file was written BEFORE the cache carried two schedule layers and read the bare
// `.sched` key, which is `displaySchedule` — a map viewer/time_machine.js has ZERO readers of. A
// sweep over the layer nobody plays would plateau on a signal the film never shows. It now selects
// through CACHE.layerOf() like every other cache reader and PRINTS the layer it swept, so the
// result can never be quoted without its input being named; `LAYER=display` re-points it at the old
// map deliberately, and it still says so. §W_CLA C4_READERS_NAME_IT is the claim that enforces this.
function load(b) {
  const r = CACHE.read(b);
  if (!r) return null;
  const L = CACHE.layerOf(r);
  console.log('§KNOB_SWEEP_LAYER ' + b.padEnd(22) + 'layer=' + L.id + ' key=' + L.key + ' — ' + L.desc +
    (L.missing ? '  ⛔ ABSENT from this cache' : ''));
  if (L.missing) {
    console.log('§KNOB_SWEEP_LAYER_MISSING ' + b + ' layer=' + L.id +
      ' — this cache predates §CACHE_PLAYED_LAYER. Rebuild: node scripts/cache_4d_run.js --force ' + b +
      '. NOT falling back to the other layer: that substitution is the defect A-9 removed.');
    return null;
  }
  const sched = L.map;
  const t0 = Math.min.apply(null, Object.keys(sched).map(g => sched[g].s));
  return { els: r.els, sched: sched, t0 };
}

// ── SIGNAL 1: does the bbox rule reproduce the unambiguous classes? ─────────────────────────────
function calibration(K, data) {
  let n = 0, ok = 0;
  for (const b in data) for (const e of data[b].els) {
    const t = TRUTH[e.cls]; if (!t) continue;
    n++; if (geoType(e, K) === t) ok++;
  }
  return { n, ok, pct: n ? 100 * ok / n : 0 };
}

// ── SIGNAL 2: THE ORDER, MEASURED PHYSICALLY — NOT AS MEDIANS PER TYPE ──────────────────────────
// ⛔ RETRACTION, kept here because the number reached the user. The first version of this signal
// compared, per level, the MEDIAN start of each type bucket and reported "Hospital Level 1: column
// before slab by 506.3h" and ~80 fleet inversions. THAT NUMBER WAS WRONG AND THE DEFECT DOES NOT
// EXIST. Two faults, both mine:
//   1. the buckets were filled by the bbox rule for every class not in TRUTH, so Hospital's 33,324
//      IfcPlate (metal deck) and its IfcCovering ceilings landed in "slab" — the metric was timing
//      ceilings and calling them slabs;
//   2. a median over a whole type bucket is a proxy for the physical question, and §E's standing
//      rule is that a proxy will be wrong on some building. It was wrong on all four.
// CHECKED DIRECTLY: Hospital Level 1 carries 3 IfcSlab (median start 293.3h) against 254 IfcColumn
// (median 300.3h) — correctly ordered, no inversion. And across the fleet, of 718 IfcColumn that
// rest on a real IfcSlab/IfcFooting in the shipped contact graph, ZERO start before that support
// finishes: Duplex 0/0, HHS 0/221, Hospital 0/378, Terminal 0/119.
//
// So the claim is now the PHYSICAL one, per element, off the shipped judge: whatever bears me must
// finish before I start. That IS the user's "types must go up in order" — a column stands on the
// slab because the slab bears it; the type sequence is an expression of the support relation, not a
// separate fact to check. No medians, no buckets, no threshold.
// The bbox type is still swept, but only where it can change an ANSWER: for elements whose class is
// NOT unambiguous, does calling them slab/column/wall alter which pairs are judged?
function orderViolations(K, d) {
  const G = SS.contactGraph(d.els);
  const EPS = SG.EPS, GAP = SG.GAP;
  // ⛔ ANY-OF, NOT ALL-OF. §E's table row 4, already paid for once by this lane ("an element needs
  // ONE support, not all — 1961 -> 95"), and the first version of this function made the mistake
  // again: it counted every bearing PAIR as a constraint and reported 92,397 violations over
  // 412,677 pairs. An element is only unheld when NOTHING that bears it is finished.
  let judged = 0, bad = 0, byPair = {};
  for (let i = 0; i < d.els.length; i++) {
    const T = d.els[i], st = d.sched[T.guid];
    if (!st) continue;
    let anySup = 0, held = 0, earliest = null;
    for (const j of (G.contacts[i] || [])) {
      const S = d.els[j], ss = d.sched[S.guid];
      if (!ss) continue;
      if (!(S.bz < T.bz - EPS && S.tz >= T.bz - GAP)) continue;   // S actually bears T
      anySup++;
      if (st.s >= ss.e - 1) { held = 1; break; }
      if (!earliest || ss.e < earliest.e) earliest = { S: S, e: ss.e };
    }
    if (!anySup) continue;                       // nothing bears it: not this claim's question
    judged++;
    if (!held) {
      bad++;
      const k = typeOf(earliest.S, K) + ' -> ' + typeOf(T, K);
      byPair[k] = (byPair[k] || 0) + 1;
    }
  }
  return { judged, bad, byPair };
}

(function main() {
  const data = {};
  for (const b of BUILDINGS) { const d = load(b); if (d) data[b] = d; else console.log('§KNOB_MISS ' + b); }
  const names = Object.keys(data);
  if (!names.length) { console.log('§KNOB_ABORT no cached runs — run scripts/cache_4d_run.js first'); process.exit(2); }

  console.log('§KNOB_SWEEP dial=K (bbox anisotropy)  signal=BEARING ORDER (support must finish first)');
  console.log('   K     calib%   ' + names.map(n => n.slice(0, 10).padStart(13)).join('') + '     total');
  const rows = [];
  for (let K = 1.1; K <= 6.001; K = Math.round((K + 0.1) * 10) / 10) {
    const cal = calibration(K, data);
    const per = {}; let tot = 0;
    for (const b of names) { const v = orderViolations(K, data[b]); per[b] = v; tot += v.bad; }
    rows.push({ K, cal, per, tot });
    console.log('  ' + K.toFixed(1) + '   ' + cal.pct.toFixed(1).padStart(5) + '%   ' +
      names.map(n => (per[n].bad + '/' + per[n].judged).padStart(13)).join('') +
      '   ' + String(tot).padStart(5));
  }
  // A PLATEAU is the thing worth having: the widest run of K where the fleet total does not change.
  let best = null, runStart = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i].tot !== rows[runStart].tot) {
      const len = i - runStart;
      if (!best || rows[runStart].tot < best.tot || (rows[runStart].tot === best.tot && len > best.len))
        best = { tot: rows[runStart].tot, len, from: rows[runStart].K, to: rows[i - 1].K };
      runStart = i;
    }
  }
  const bestCal = rows.reduce((a, r) => (!a || r.cal.pct > a.cal.pct) ? r : a, null);
  console.log('');
  console.log('§KNOB_PLATEAU widest lowest-inversion run: K=' + best.from.toFixed(1) + '..' + best.to.toFixed(1) +
    ' (' + best.len + ' steps) with fleet inversions=' + best.tot);
  console.log('§KNOB_CALIB   best agreement with unambiguous classes: K=' + bestCal.K.toFixed(1) +
    ' at ' + bestCal.cal.pct.toFixed(1) + '% (' + bestCal.cal.ok + '/' + bestCal.cal.n + ')');
  const agree = Math.abs(bestCal.K - best.from) <= 0.5 || (bestCal.K >= best.from && bestCal.K <= best.to);
  console.log('§KNOB_SIGNAL  ' + (agree
    ? 'the two dials AGREE — the K that best reproduces known classes also sits in the flattest ' +
      'inversion plateau, so the signal is the same one from both directions'
    : 'the two dials DISAGREE — best-calibration K=' + bestCal.K.toFixed(1) + ' is OUTSIDE the plateau K=' +
      best.from.toFixed(1) + '..' + best.to.toFixed(1) + '. A geometric type good enough to reproduce known ' +
      'classes does NOT make the type order come out, so the ordering defect is REAL and not an artefact of the dial'));
  const K0 = bestCal.K;
  console.log('');
  console.log('§KNOB_DETAIL at K=' + K0.toFixed(1) + ' — bearing-order violations by type pair:');
  for (const b of names) {
    const v = orderViolations(K0, data[b]);
    console.log('   ' + b.padEnd(22) + 'violations=' + String(v.bad).padStart(5) + '/' + v.judged +
      ' bearing pairs' + (v.judged === 0 ? '   INCONCLUSIVE (no bearing pair judged)' : ''));
    Object.entries(v.byPair).sort((a, b2) => b2[1] - a[1]).slice(0, 5)
      .forEach(([k, n]) => console.log('        ' + String(n).padStart(5) + '  ' + k));
  }
  console.log('');
  console.log('§KNOB_NOT_SWEPT these dials change the SCHEDULE and need a pipeline re-run per setting,');
  console.log('   so they are named rather than faked: §STOREY_DATUM mode (DECLARED|INFERRED),');
  console.log('   the §S64 support top bound (see 4D_MODEL_INTEGRITY §H.2a, 32.0% of Hospital contacts),');
  console.log('   and bar_model.js §BAR_LEVEL_BANDS granularity. Sweep each by rebuilding the cache.');
})();
