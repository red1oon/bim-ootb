#!/usr/bin/env node
// PROBE — §EDIT_LEGALITY: `verifyGanttIntegrity()` decides whether a planner's Gantt edit may be
// locked back in. It runs TWO of §I.1's disagreeing "does S support T" implementations over the
// same population and ANDs their verdicts. This measures which one is doing what, so the choice
// can be RECOMMENDED on numbers instead of picked.
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5d · prompts/4D_GANTT_TM_REFACTOR.md
// §FUTURE item 7 Stage 4 (§STAGE45_PLAN, queue item B-2). MEASURE-ONLY — decides nothing, changes
// nothing, applies nothing.
//
// ISSUE THIS PROVES OR DISPROVES. time_machine.js:4395 verifyGanttIntegrity():
//   :4419  var n  = ScheduleGate.auditFloating(audited, sched, null, guids);   <- §I.1 copy 3
//   :4431  var ma = _midairAudit(mrItems);                                     <- §I.1 copy 1
//   :4466  return { ok: n <= base.floating && ma.midair <= base.midair, ... }
// Copy 3 carries §S64's CARRY-AT-TOP bound (`S.top_z <= T.base_z + GAP`) on its WALL pool — the
// later false-positive fix, worth 73 fleet-wide false "floating" verdicts. Copy 1 (contactGraph →
// designatedSupport → midairAudit) has no upper bound anywhere. So the lock gate ANDs a judge that
// got the fix with a judge that did not.
//
// THREE THINGS THIS MEASURES, in the order they matter to the recommendation:
//   C — COVERAGE. |A\B| and |B\A| over the offender sets. If either difference is 0 the AND is
//       redundant in that direction and one judge could be dropped; if both are non-zero the AND
//       is buying real coverage and the question is only about precision.
//   P — PRECISION EXPOSURE. Among the supports _designatedSupport ELECTS (the edge midairAudit
//       actually judges on), how many would §S64's bound reject — i.e. how many midair verdicts
//       rest on a "support" whose top sits ABOVE the base it supposedly carries. Split by the
//       elected support's class, because §S64's bound is scoped to WALLS carrying promoted slabs;
//       a bound-violating non-wall election is exposure of a DIFFERENT rule, and saying so is the
//       difference between evidence and a plausible story.
//   D — DELTA UNDER A REAL EDIT. The gate is a DELTA gate (§GANTT_LOCK_DELTA), never absolute, so
//       a false positive already present at baseline never refuses anything. What can refuse a
//       legal edit is a judge whose count INCREASES on an edit the other judge accepts. Simulated
//       by pulling one whole task earlier — exactly the drag the editor performs — and reporting
//       both deltas, plus how many of the NEW midair offenders were elected onto a bound-violating
//       support (those are the refusals the missing fix would be responsible for).
//
// METHOD: the persisted cache (PRIMAL LAW clause 5), PLAYED layer — kernel_ops timestamps are what
// verifyGanttIntegrity actually audits (it reads `_ops`), so `display` would be the wrong map
// (§CACHE_PLAYED_LAYER, A-9). Geometry does not move under an edit, so contactGraph and
// designatedSupport are computed ONCE per building and only the verdict loop is re-run per edit.
//
// VACUITY: every count is guarded. A judge that returns 0 on a deliberately impossible schedule is
// judging nothing, and says VACUOUS rather than PASS. A building with no bound-violating election
// says so explicitly instead of reporting a bare 0.
//
// Usage: node viewer/tests/probe_edit_legality_judges.js [Building ...]
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const V = path.join(ROOT, 'viewer');
const fs = require('fs'), vm = require('vm');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SS = require(path.join(V, 'support_sweep.js'));

// ── THE BOUNDED VARIANT — the candidate "give copy 1 the fix copy 3 has", built from the SHIPPED
//    bytes by a VERBATIM string replacement, never by re-typing the judge (that would make a fifth
//    copy of the relation this whole section is about). Same guard discipline as PR #1563's probe:
//    if either clause is not found EXACTLY ONCE the probe THROWS rather than silently measuring an
//    unpatched variant and reporting "no change".
const BEARING_CG = 'if ((S.bz < T.bz - EPS && S.tz >= T.bz - GAP) ||';
const BEARING_DS = 'if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { cls = 0; score = -S.tz; }';
function boundedSupportSweep() {
  const src = fs.readFileSync(path.join(V, 'support_sweep.js'), 'utf8');
  const nA = src.split(BEARING_CG).length - 1, nB = src.split(BEARING_DS).length - 1;
  if (nA !== 1 || nB !== 1) {
    throw new Error('§EDIT_LEGALITY ABORT — expected exactly one contactGraph and one ' +
      'designatedSupport bearing clause, found ' + nA + '/' + nB + '. The predicate moved; re-read ' +
      'support_sweep.js before trusting this probe.');
  }
  const patched = src
    .split(BEARING_CG).join('if ((S.bz < T.bz - EPS && S.tz >= T.bz - GAP && S.tz <= T.bz + GAP) ||')
    .split(BEARING_DS).join('if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP && S.tz <= T.bz + GAP) { cls = 0; score = -S.tz; }');
  const sb = { console: console, ScheduleGate: SG, Math: Math, String: String, Object: Object,
    Array: Array, Int32Array: Int32Array, Uint8Array: Uint8Array, Number: Number, isFinite: isFinite,
    module: { exports: {} }, window: undefined };
  sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(patched, sb);
  return sb.module.exports;
}
const SSB = boundedSupportSweep();

const BUILDINGS = process.argv.slice(2).filter(a => a[0] !== '-').length
  ? process.argv.slice(2).filter(a => a[0] !== '-')
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];
const EDIT_TASKS = Number(process.env.EDIT_TASKS || 8);   // tasks sampled for the D measurement
const EDIT_DAYS = Number(process.env.EDIT_DAYS || 30);    // how far earlier the sampled task is dragged
const DAY = 86400000;

// ⚠ TWO NAMING CONVENTIONS — getting this wrong reads as a clean pass (§I.5d, and it has bitten two
// probes on this lane already). auditFloating wants base_z/top_z + sched{start,end}; contactGraph /
// midairAudit want bz/tz + items[].s/.e. Both shapes are built from the SAME cached run here.
function afEls(els) { return els.map(e => Object.assign({}, e, { base_z: e.bz, top_z: e.tz })); }
function afSched(map) { const o = {}; for (const g of Object.keys(map)) o[g] = { start: map[g].s, end: map[g].e }; return o; }
function mrItems(els, map) {
  return els.filter(e => map[e.guid]).map(e => ({
    guid: e.guid, cls: e.cls, seq: e.seq, s: map[e.guid].s, e: map[e.guid].e,
    bz: e.bz, tz: e.tz, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 }));
}
// auditFloating emits one §SUPPORT_UNCHECKED line per big unchecked element. TEE, never mute
// (PRIMAL LAW clause 3) — counted here instead of reprinting 63k lines.
function quiet(fn) {
  const _l = console.log; let n = 0;
  console.log = function () {
    const s = Array.prototype.map.call(arguments, String).join(' ');
    if (s.indexOf('§SUPPORT_UNCHECKED') === 0) { n++; return; }
    return _l.apply(console, arguments);
  };
  try { return { v: fn(), unchecked: n }; } finally { console.log = _l; }
}
// The verdict loop of _midairAudit, VERBATIM (support_sweep.js:509-514), re-run over new times with
// the geometry-invariant election reused. Not a fourth judge: the same expression, same threshold.
function midairFrom(items, des) {
  let n = 0; const guids = [];
  for (let i = 0; i < items.length; i++) {
    const sIdx = des[i]; if (sIdx < 0) continue;
    if (items[sIdx].s > items[i].s + 1) { n++; guids.push(items[i].guid); }
  }
  return { midair: n, guids: guids };
}

const GAP = SG.GAP, EPS = SG.EPS;
console.log('§EDIT_LEGALITY_CONST EPS=' + EPS + ' GAP=' + GAP + ' (ScheduleGate exports, never re-typed here)');

for (const bld of BUILDINGS) {
  const r = CACHE.read(bld);
  if (!r) { console.log('§EDIT_LEGALITY CACHE_MISS ' + bld + ' — node scripts/cache_4d_run.js ' + bld); continue; }
  const L = CACHE.layerOf(r);
  console.log('§EDIT_LEGALITY_LAYER ' + bld.padEnd(22) + 'layer=' + L.id + ' key=' + L.key + ' dir=' + r.dir);
  if (L.missing) {
    console.log('§EDIT_LEGALITY ' + bld.padEnd(22) + 'INCONCLUSIVE — layer=' + L.id + ' ABSENT from this cache. ' +
      'Rebuild: node scripts/cache_4d_run.js --force ' + bld + '. Not substituting the other layer.');
    continue;
  }
  const els = afEls(r.els), sched = afSched(L.map), items = mrItems(r.els, L.map);
  const idxOf = {}; items.forEach((it, i) => { idxOf[it.guid] = i; });

  // ── VACUITY GUARD, both judges. MIRROR the programme in time (s' = tMax - e, e' = tMax - s):
  //    every dependency now runs backwards, so a judge that is actually reading these elements
  //    MUST report violations. (A flat "start everything at once" shake does NOT work for
  //    midairAudit — its test is `support.s > mine.s + 1`, which equal starts can never satisfy;
  //    measured here first, and it reported a false VACUOUS on all four buildings. A vacuity guard
  //    that itself produces a vacuous input is the §I.5d data-shape trap one level up.)
  const tMax = Math.max.apply(null, items.map(it => it.e));
  const shakeS = {}; for (const g of Object.keys(sched)) shakeS[g] = { start: tMax - sched[g].end, end: tMax - sched[g].start };
  const shakeI = items.map(it => Object.assign({}, it, { s: tMax - it.e, e: tMax - it.s }));
  const vacA = quiet(() => SG.auditFloating(els, shakeS, null, null)).v;
  const vacB = SS.midairAudit(shakeI).midair;
  if (!vacA || !vacB) {
    console.log('§EDIT_LEGALITY ' + bld.padEnd(22) + 'VACUOUS layer=' + L.id + ' — on an impossible schedule ' +
      'auditFloating=' + vacA + ' midair=' + vacB + '; a 0 here means the judge read nothing. No verdict.');
    continue;
  }
  console.log('§EDIT_LEGALITY_VACGUARD ' + bld.padEnd(22) + 'impossible-schedule auditFloating=' + vacA + ' midair=' + vacB + ' (both non-zero ⇒ both judges are reading this population)');

  // ── C — COVERAGE ─────────────────────────────────────────────────────────────────────────────
  const gA = [];
  const A = quiet(() => SG.auditFloating(els, sched, null, gA));
  const G = SS.contactGraph(items);
  if (!G.ok) { console.log('§EDIT_LEGALITY ' + bld + ' INCONCLUSIVE — contactGraph not ok (ScheduleGate.CELL missing?)'); continue; }
  const des = SS.designatedSupport(items, G);
  const B0 = midairFrom(items, des);
  const shipped = SS.midairAudit(items);
  if (shipped.midair !== B0.midair) {
    console.log('§EDIT_LEGALITY ' + bld + ' ABORT — the re-run verdict loop (' + B0.midair +
      ') disagrees with the SHIPPED midairAudit (' + shipped.midair + '). The loop moved; re-read support_sweep.js.');
    continue;
  }
  const setA = new Set(gA), setB = new Set(B0.guids);
  const onlyA = gA.filter(g => !setB.has(g)), onlyB = B0.guids.filter(g => !setA.has(g));
  const both = gA.filter(g => setB.has(g));
  console.log('§EDIT_LEGALITY_COVERAGE ' + bld.padEnd(22) + 'n=' + items.length +
    ' auditFloating=' + A.v + ' midair=' + B0.midair +
    ' both=' + both.length + ' onlyFloating=' + onlyA.length + ' onlyMidair=' + onlyB.length +
    ' unchecked=' + A.unchecked);

  // ── P — PRECISION EXPOSURE of the missing §S64 bound, on the ELECTED edge ─────────────────────
  // Classify each election the way designatedSupport does, then ask §S64's question of it.
  let elected = 0, bearing = 0, bound = 0, boundWall = 0, boundOther = {};
  let boundMid = 0, boundMidWall = 0;
  const midSet = new Set(B0.guids);
  for (let i = 0; i < items.length; i++) {
    const j = des[i]; if (j < 0) continue;
    elected++;
    const T = items[i], S = items[j];
    const isBearing = (S.bz < T.bz - EPS && S.tz >= T.bz - GAP);
    if (!isBearing) continue;                       // §S64's bound is a statement about bearing-below
    bearing++;
    if (S.tz <= T.bz + GAP) continue;               // the bound HOLDS — a real carry-at-top
    bound++;
    const wall = S.cls && S.cls.indexOf('IfcWall') === 0;
    if (wall) boundWall++; else boundOther[S.cls] = (boundOther[S.cls] || 0) + 1;
    if (midSet.has(T.guid)) { boundMid++; if (wall) boundMidWall++; }
  }
  // The A/B: run the SAME judge with §S64's bound added to the bearing clause of BOTH the graph and
  // the election, and diff the verdict sets. This is what "give copy 1 the fix copy 3 has" would do.
  const Gb = SSB.contactGraph(items);
  const desB = Gb.ok ? SSB.designatedSupport(items, Gb) : null;
  const Bb = desB ? midairFrom(items, desB) : { midair: -1, guids: [] };
  const setBb = new Set(Bb.guids);
  const lostByBound = B0.guids.filter(g => !setBb.has(g));      // verdicts the bound would REMOVE
  const gainedByBound = Bb.guids.filter(g => !setB.has(g));     // verdicts the bound would ADD
  let desChanged = 0;
  if (desB) for (let i = 0; i < items.length; i++) if (des[i] !== desB[i]) desChanged++;
  console.log('§EDIT_LEGALITY_AB ' + bld.padEnd(22) + 'midairShipped=' + B0.midair + ' midairBounded=' + Bb.midair +
    ' electionsChanged=' + desChanged + '/' + items.length +
    ' verdictsRemovedByBound=' + lostByBound.length + ' verdictsAddedByBound=' + gainedByBound.length +
    ' orphansShipped=' + G.orphans + ' orphansBounded=' + Gb.orphans);

  const topOther = Object.keys(boundOther).sort((a, b) => boundOther[b] - boundOther[a]).slice(0, 4)
    .map(k => k + ':' + boundOther[k]).join(',') || 'none';
  console.log('§EDIT_LEGALITY_BOUND ' + bld.padEnd(22) + 'elected=' + elected + ' bearingElections=' + bearing +
    ' boundViolating=' + bound + ' (' + (bearing ? (100 * bound / bearing).toFixed(1) : '0.0') + '% of bearing elections)' +
    ' ofWhichWall=' + boundWall + ' otherClasses=[' + topOther + ']');
  console.log('§EDIT_LEGALITY_BOUND_MIDAIR ' + bld.padEnd(22) + 'midairVerdictsRestingOnABoundViolatingElection=' + boundMid +
    '/' + B0.midair + ' ofWhichWall=' + boundMidWall +
    (bound === 0 ? '  ⚠ VACUOUS-FOR-THIS-CLAIM: zero bound-violating elections exist on this building, so this 0 is an empty population, not evidence the bound is harmless' : ''));

  // ── D — DELTA UNDER A REAL EDIT ──────────────────────────────────────────────────────────────
  // Pull one whole task EDIT_DAYS earlier — the drag the Gantt editor performs — and read both
  // deltas. Deterministic sample: the EDIT_TASKS largest tasks that are not the first in the
  // programme (a task already at day 0 cannot be dragged earlier and would report a vacuous 0).
  const tasks = (r.tasks || []).filter(t => t.guids && t.guids.length && t.sDays > 0)
    .sort((a, b) => b.guids.length - a.guids.length || (a.id < b.id ? -1 : 1)).slice(0, EDIT_TASKS);
  if (!tasks.length) {
    console.log('§EDIT_LEGALITY_EDIT ' + bld.padEnd(22) + 'INCONCLUSIVE — no draggable task (all start at day 0)');
  } else {
    let refusedByMidairOnly = 0, refusedByFloatingOnly = 0, refusedByBoth = 0, refusedByNeither = 0;
    let newMidOnBound = 0, newMidTotal = 0, flipped = 0, totalEdits = 0;
    for (const t of tasks) {
      const move = new Set(t.guids);
      const eSched = {}; for (const g of Object.keys(sched)) eSched[g] = move.has(g)
        ? { start: sched[g].start - EDIT_DAYS * DAY, end: sched[g].end - EDIT_DAYS * DAY } : sched[g];
      const eItems = items.map(it => move.has(it.guid)
        ? Object.assign({}, it, { s: it.s - EDIT_DAYS * DAY, e: it.e - EDIT_DAYS * DAY }) : it);
      const eA = quiet(() => SG.auditFloating(els, eSched, null, null)).v;
      const eB = midairFrom(eItems, des);
      const eBb = desB ? midairFrom(eItems, desB) : { midair: 0, guids: [] };
      const dF = eA - A.v, dM = eB.midair - B0.midair, dMb = eBb.midair - Bb.midair;
      // THE DECISIVE PER-EDIT NUMBER: would this lock verdict CHANGE if copy 1 carried §S64's
      // bound? A flip means edit legality really is decided by the missing fix; no flip on any
      // sampled edit means the missing fix is latent for THIS gate, whatever it does elsewhere.
      const okShipped = !(dF > 0 || dM > 0), okBounded = !(dF > 0 || dMb > 0);
      if (okShipped !== okBounded) flipped++;
      totalEdits++;
      if (dF > 0 && dM > 0) refusedByBoth++;
      else if (dM > 0) refusedByMidairOnly++;
      else if (dF > 0) refusedByFloatingOnly++;
      else refusedByNeither++;
      // Of the offenders this edit CREATED, how many rest on a bound-violating election? Those are
      // the refusals §S64's missing fix is responsible for.
      const before = new Set(B0.guids);
      for (const g of eB.guids) {
        if (before.has(g)) continue;
        newMidTotal++;
        const i = idxOf[g], j = des[i]; if (j < 0) continue;
        const T = eItems[i], S = eItems[j];
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP && S.tz > T.bz + GAP) newMidOnBound++;
      }
      console.log('§EDIT_LEGALITY_EDIT ' + bld.padEnd(22) + t.id.slice(0, 44).padEnd(44) +
        ' n=' + t.guids.length + ' -' + EDIT_DAYS + 'd  dFloating=' + (dF >= 0 ? '+' : '') + dF +
        ' dMidair=' + (dM >= 0 ? '+' : '') + dM + ' dMidairBounded=' + (dMb >= 0 ? '+' : '') + dMb +
        ' verdict=' + (okShipped ? 'allowed' : 'REFUSED') +
        ' by=' + (dF > 0 && dM > 0 ? 'both' : dM > 0 ? 'midair-only' : dF > 0 ? 'floating-only' : '-') +
        ' boundedVerdict=' + (okBounded ? 'allowed' : 'REFUSED') + (okShipped !== okBounded ? ' ⚠FLIP' : ''));
    }
    console.log('§EDIT_LEGALITY_EDIT_SUMMARY ' + bld.padEnd(22) + 'tasks=' + tasks.length +
      ' refusedByBoth=' + refusedByBoth + ' midairOnly=' + refusedByMidairOnly +
      ' floatingOnly=' + refusedByFloatingOnly + ' allowed=' + refusedByNeither +
      ' newMidairOffenders=' + newMidTotal + ' ofWhichOnABoundViolatingElection=' + newMidOnBound +
      ' lockVerdictFlipsIfCopy1GetsTheBound=' + flipped + '/' + totalEdits +
      (newMidTotal === 0 ? '  ⚠ VACUOUS-FOR-THIS-CLAIM: the sampled edits created no new midair offender at all' : ''));
  }
}
