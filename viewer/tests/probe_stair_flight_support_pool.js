#!/usr/bin/env node
// PROBE — §STAIR_POOL_AB: what does admitting IfcStairFlight to auditFloating's support grid
// actually change? Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5a.
//
// ISSUE THIS PROVES OR DISPROVES. The support pool has five inline definitions. The SCHEDULER's
// grid (schedule_gate.js:787 `P.seq<=4 || isPromotedSlab(P) || isStairFlight(P)`) admits stair
// flights; `auditFloating`'s structurally identical grid (:1125) and time_machine.js's
// `_buildXraySupportCache` (:3739) do not — they were never given the §STAIR_FLIGHT_GRID_VISIBILITY
// fix of 2026-08-14. IfcStairFlight carries sequence 6 (rates.js:259), so `seq<=4` is false and the
// `else if` only catches IfcWall*: a stair flight is invisible AS SUPPORT to the floating audit
// while the scheduler that produced the times treats it as structure.
//
// DIRECTION OF THE ERROR: a target resting on a stair flight finds no bearing candidate, `se`
// stays 0, and :1204's `if (se > 0 && ...)` can never fire. So this is a FALSE NEGATIVE — floating
// is UNDER-reported. Fixing it should make the count go UP (or stay equal), never down.
//
// METHOD: run the SHIPPED auditFloating from two viewer checkouts over BYTE-IDENTICAL inputs (the
// persisted cache, PRIMAL LAW clause 5 — the pipeline is not re-run), and diff the returned count
// and the collected guid sets. Reports the stair-flight population so a 0-delta on a building with
// no stair flights is called VACUOUS, never PASS.
//
//   VIEWER_A=<unfixed viewer> VIEWER_B=<fixed viewer> node viewer/tests/probe_stair_flight_support_pool.js [Building ...]
'use strict';
const path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const HOME = os.homedir();
const VA = process.env.VIEWER_A || path.join(HOME, 'bim-ootb', 'viewer');
const VB = process.env.VIEWER_B || path.join(ROOT, 'viewer');
// Read the cache keyed on the UNFIXED viewer (VIEWER_A). cache_4d_run's key covers the CONTENT of
// schedule_gate.js, so editing auditFloating invalidates every entry — but `els`/`sched` come from
// computeSchedule/materializeZones, which this change does not touch (auditFloating feeds nothing
// upstream of them). So the BEFORE run is the correct shared input for both sides, and taking it
// from A's key is what makes A and B provably see byte-identical elements.
const CACHE = require(path.join(VA, '..', 'scripts', 'cache_4d_run.js'));
// §CACHE_PLAYED_LAYER — layerOf is a PURE selector over the persisted run object (no viewer state in
// it), so it is taken from THIS checkout, not from VIEWER_A: VIEWER_A may deliberately be an older
// tree that predates the two-layer cache, and a missing selector must not silently become "read
// whatever key happens to be there".
const SEL = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));

const SGA = require(path.join(VA, 'schedule_gate.js'));
const SGB = require(path.join(VB, 'schedule_gate.js'));
// contactGraph needs a ScheduleGate in scope for CELL/EPS/GAP. A and B carry identical constants
// (this change touches a pool, not a threshold), so either serves; A is the untouched reference.
global.ScheduleGate = SGA;
const SS = require(path.join(VA, 'support_sweep.js'));

const BUILDINGS = process.argv.slice(2).filter(a => a[0] !== '-').length
  ? process.argv.slice(2).filter(a => a[0] !== '-')
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];

// ⚠ TWO NAMING CONVENTIONS, AND GETTING THIS WRONG READS AS A CLEAN PASS.
// The cache persists elements as `bz`/`tz` (support_sweep.js contactGraph's convention) and the
// schedule as `{s,e}`. `auditFloating` reads `base_z`/`top_z` and `sched[guid].start/.end`. Feed it
// the cache shape unmapped and EVERY comparison is `undefined < undefined` = false, so it returns
// floating=0 for any input — an all-green verdict produced by judging nothing. That is precisely
// §I.5d's observation that these two judges "receive different data shapes for the same elements",
// biting a probe rather than production. Measured while writing this probe: unmapped, both the
// before and after audits returned 0 on all 7 buildings AND the red control recovered 0, which is
// what exposed it. The vacuity guard below now fails loudly instead.
function remapEls(els) {
  return els.map(e => Object.assign({}, e, { base_z: e.bz, top_z: e.tz }));
}
function remapSched(sched) {
  const o = {};
  for (const g of Object.keys(sched)) o[g] = { start: sched[g].s, end: sched[g].e };
  return o;
}

// The §-log this probe must not drown in: auditFloating emits §SUPPORT_UNCHECKED per big unchecked
// element. TEE it (never mute — PRIMAL LAW clause 3), counting rather than reprinting 63k lines.
function quietCount(fn) {
  const _l = console.log;
  let n = 0;
  console.log = function () {
    const s = Array.prototype.map.call(arguments, String).join(' ');
    if (s.indexOf('§SUPPORT_UNCHECKED') === 0) { n++; return; }
    return _l.apply(console, arguments);
  };
  try { return { v: fn(), unchecked: n }; } finally { console.log = _l; }
}

let anyDelta = 0, rows = [];
for (const bld of BUILDINGS) {
  // The cached run keyed on VIEWER_A is the preferred input (see the note on CACHE above). If that
  // checkout predates §CACHE_PLAYED_LAYER its run carries no played layer — then, and only then,
  // this falls back to THIS checkout's cache key. That is still ONE run feeding BOTH sides, so the
  // byte-identical-input invariant holds; what it must never do is silently read the other LAYER.
  let r = CACHE.read(bld), keyedOn = 'VIEWER_A';
  if (r && !r.play) { const r2 = SEL.read(bld); if (r2 && r2.play) { r = r2; keyedOn = 'this checkout (VIEWER_A cache predates §CACHE_PLAYED_LAYER)'; } }
  if (!r && SEL.read(bld)) { r = SEL.read(bld); keyedOn = 'this checkout (no VIEWER_A-keyed cache)'; }
  if (!r) { console.log('§STAIR_POOL CACHE_MISS ' + bld + ' — run: node scripts/cache_4d_run.js ' + bld); continue; }
  console.log('§STAIR_POOL_CACHE ' + bld.padEnd(22) + 'keyedOn=' + keyedOn + ' dir=' + r.dir);
  // §CACHE_PLAYED_LAYER (2026-09-02, queue item A-9) — the layer is SELECTED and NAMED, never
  // implicit. This probe asks "does the audit see a stair flight as support", which is a question
  // about the times the schedule actually presents; the PLAYED layer (kernel_ops) is what the
  // viewer's own _buildXraySupportCache audits, so that is the default. `LAYER=display` re-points
  // it at materializeZones' unread displaySchedule deliberately, and it still says so on every line.
  const L = SEL.layerOf(r);
  console.log('§STAIR_POOL_LAYER ' + bld.padEnd(22) + 'layer=' + L.id + ' key=' + L.key + ' — ' + L.desc);
  if (L.missing) {
    console.log('§STAIR_POOL ' + bld.padEnd(22) + 'INCONCLUSIVE — layer=' + L.id + ' ABSENT from this cache ' +
      '(predates §CACHE_PLAYED_LAYER). Rebuild: node scripts/cache_4d_run.js --force ' + bld +
      '. NOT falling back to the other layer: that substitution is the defect A-9 removed.');
    continue;
  }
  const LAY = L.id;
  const els = remapEls(r.els), sched = remapSched(L.map);

  // VACUITY GUARD — does auditFloating judge ANYTHING on this input? Break the schedule for every
  // element (start everything a day before the earliest start) and demand a non-zero floating
  // count. If a deliberately impossible schedule still audits clean, the audit is not reading these
  // elements at all and every number below is meaningless. PRIMAL LAW clause 4: report VACUOUS,
  // never PASS, when nothing was actually judged.
  const t0 = Math.min.apply(null, Object.keys(sched).map(g => sched[g].start));
  const shake = {};
  for (const g of Object.keys(sched)) shake[g] = { start: t0 - 86400000, end: sched[g].end };
  const shakeN = quietCount(() => SGA.auditFloating(els, shake, null, null)).v;
  if (shakeN === 0) {
    console.log('§STAIR_POOL ' + bld.padEnd(22) + 'VACUOUS layer=' + LAY + ' — auditFloating returned 0 on a schedule where ' +
      'EVERY element starts before its supports finish. It is judging nothing (field-name mismatch?); no verdict is possible.');
    continue;
  }

  // The population that makes the verdict meaningful. A building with 0 stair flights CANNOT show
  // a delta, so its 0 is VACUOUS, not evidence the fix is a no-op (PRIMAL LAW clause 4).
  const flights = els.filter(e => e.cls === 'IfcStairFlight');
  const flightSeqs = Array.from(new Set(flights.map(e => e.seq))).sort();

  const gA = [], gB = [];
  const A = quietCount(() => SGA.auditFloating(els, sched, null, gA));
  const B = quietCount(() => SGB.auditFloating(els, sched, null, gB));

  const setA = new Set(gA), setB = new Set(gB);
  const newlySeen = gB.filter(g => !setA.has(g));      // previously-hidden floating, now visible
  const nowClean = gA.filter(g => !setB.has(g));       // was flagged, no longer — must be 0
  const byCls = {};
  newlySeen.forEach(g => { const e = els.find(x => x.guid === g); const c = e ? e.cls : '?'; byCls[c] = (byCls[c] || 0) + 1; });

  // BLAST RADIUS — asked of the OWNER of "does S support T" (support_sweep.js:384 contactGraph),
  // never re-derived here. How many BEARING relations does the shipped graph assert whose support
  // is a stair flight? That is exactly the set auditFloating's grid could not see. It is the size
  // of the blind spot; the floating delta above is only the part that was ALSO mis-scheduled today.
  // A zero floating delta over a non-zero blind spot means "the schedule happens to be right here",
  // not "the pool was already correct" — those are different claims and this separates them.
  let blind = 0, blindTargets = new Set();
  const G = SS.contactGraph(els);
  if (!G.ok) console.log('   §STAIR_POOL JUDGE_UNAVAILABLE — contactGraph declined, blind-spot size UNKNOWN');
  else {
    const EPS = SGA.EPS, GAP = SGA.GAP;
    for (let i = 0; i < els.length; i++) {
      const list = G.contacts[i]; if (!list) continue;
      const T = els[i];
      for (const j of list) {
        const S = els[j];
        if (S.cls !== 'IfcStairFlight') continue;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { blind++; blindTargets.add(T.guid); }
      }
    }
  }
  console.log('   blindSpot: ' + blind + ' bearing relations carried by a stair flight, over ' +
    blindTargets.size + ' distinct targets — invisible to auditFloating before this change');

  // RED CONTROL — RECOVERED SENSITIVITY. A zero delta on today's schedule proves nothing on its
  // own: it is equally consistent with "the pool was already right" and with "the audit still
  // cannot see this class of violation." So MANUFACTURE the violation the blind spot hides — pull
  // every stair-flight-supported target's start EARLIER than everything it rests on — and re-audit.
  // The geometry and the pools stay shipped; only the SCHEDULE is perturbed, which is the input a
  // real regression would corrupt. If B does not flag strictly more than A here, the fix did not
  // restore the audit's ability to catch a stair-flight ordering regression, and the NO-OP above
  // would be a scope-blind PASS (PRIMAL LAW clause 4).
  let redA = 0, redB = 0, redRan = 0;
  if (blindTargets.size) {
    // t0 computed above by the vacuity guard.
    const bad = {};
    for (const g of Object.keys(sched)) bad[g] = { start: sched[g].start, end: sched[g].end };
    for (const g of blindTargets) bad[g].start = t0 - 86400000;   // one day before anything begins
    redA = quietCount(() => SGA.auditFloating(els, bad, null, null)).v;
    redB = quietCount(() => SGB.auditFloating(els, bad, null, null)).v;
    redRan = 1;
    console.log('   redControl (every stair-flight-supported target started before its support): floating ' +
      redA + ' -> ' + redB + ' (recovered ' + (redB - redA) + ' violations the old pool could not see)');
  }

  const verdict = flights.length === 0 ? 'VACUOUS' : (A.v === B.v && newlySeen.length === 0 ? 'NO-OP' : 'CHANGED');
  console.log('§STAIR_POOL ' + bld.padEnd(22) + verdict.padEnd(9) + 'layer=' + LAY + ' ' +
    'stairFlights=' + String(flights.length).padEnd(6) + 'seq=' + JSON.stringify(flightSeqs).padEnd(6) +
    ' floating ' + A.v + ' -> ' + B.v + ' (delta ' + (B.v - A.v >= 0 ? '+' : '') + (B.v - A.v) + ')' +
    ' newlyVisible=' + newlySeen.length + ' nowClean=' + nowClean.length +
    ' unchecked ' + A.unchecked + ' -> ' + B.unchecked);
  if (newlySeen.length) console.log('   newly-visible floating by class: ' + JSON.stringify(byCls));
  // A FALSE NEGATIVE fix can only ADD. Anything disappearing means the pool change altered a
  // verdict it had no business altering — report it loudly rather than averaging it away.
  if (nowClean.length) console.log('   ⛔ UNEXPECTED — these were floating BEFORE and are not now: ' + nowClean.slice(0, 10).join(','));
  rows.push({ bld, flights: flights.length, a: A.v, b: B.v, newly: newlySeen.length, nowClean: nowClean.length });
  if (B.v !== A.v || newlySeen.length) anyDelta++;
}

const judged = rows.filter(r => r.flights > 0).length;
const regress = rows.filter(r => r.nowClean > 0).length;
console.log('§STAIR_POOL VERDICT layer=' + (process.env.LAYER || 'played') + ' =' + (judged === 0 ? 'INCONCLUSIVE — no building in this run has a stair flight'
  : (regress ? 'REGRESSION on ' + regress + ' building(s)' : (anyDelta ? 'CHANGED on ' + anyDelta + '/' + judged + ' buildings with flights' : 'NO-OP across ' + judged + ' buildings with flights'))));
process.exit(regress ? 1 : 0);
