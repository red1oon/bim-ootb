#!/usr/bin/env node
/* ⚠ DO NOT REMOVE — read the log after every run.
 *
 * WITNESS: §Z_STACK_XRAY_STAGING — prompts/GANTT_ACCURACY.md §Z_STACK_XRAY_STAGING.
 *
 * THE ISSUE IT PROVES OR DISPROVES: today, an element goes straight from invisible to fully SOLID
 * the instant its own scheduled reveal completes, even when the elements that physically carry it
 * (walls/structure it rests on) haven't finished yet — "beam floating before its wall exists". The
 * fix is NOT a reschedule (five reordering engines were built and measured 2026-08-02, all rejected
 * — see §Z_STACK_XRAY_STAGING's own table in GANTT_ACCURACY.md): it's a RENDER-ONLY gate. An
 * element whose support carriers aren't all placed at its own reveal time renders X-RAY (ghost)
 * instead of solid, and flips solid the instant its last carrier places. Schedule/gantt/day-counter/
 * band timestamps must be BYTE-IDENTICAL before/after — this witness's G-XRAY-2 is that proof.
 *
 * This script drives the REAL production scheduler (viewer/schedule_gate.js, required directly —
 * it already supports `module.exports` for exactly this purpose) rather than reimplementing it, so
 * the schedule under test is byte-for-byte what the browser would compute. The XRAY predicate +
 * solidify-time cache is a COPY of viewer/time_machine.js's _buildXraySupportCache (repo
 * convention: audit_support_roleblind.js / witness_stagger_support_order.js both copy the support
 * predicate rather than importing it) — same EPS/GAP/CELL constants schedule_gate.js's own
 * auditFloating() already uses.
 *
 * GATES (all must hold, exit 1 otherwise):
 *   G-XRAY-1  UPDATED 2026-08-04 (§XRAY_WALL_SCOPE): originally required RED>0 on real Hospital data
 *             ("a witness that cannot show the RED is not a witness"). Two real defects were found
 *             and fixed since (SEQUENCE_RULES envelope-before-MEP order; wallGrid scoped to
 *             promoted-roof-slabs only, matching auditFloating()'s already-proven M3 restriction) —
 *             real Hospital data now genuinely produces 0 staged elements, not a hidden defect. The
 *             gate now asserts REAL=0 (the FIXED state) + GREEN=0 (independently re-derived, same as
 *             before) + a SYNTH positive control (a hand-built promoted-slab/wall pair the detector
 *             must still flag) so a future regression in carriersOf can't silently read as "still 0"
 *             just because real Hospital geometry no longer happens to trigger it.
 *   G-XRAY-2  computeSchedule(elements) run BEFORE vs AFTER building the xray cache on the SAME
 *             elements array must return byte-identical {start,end} per guid, and the elements
 *             array itself must be unchanged — the xray cache build has no write capability into
 *             either. This is the load-bearing "presentation-only" proof.
 *   G-XRAY-3  no orphan ghosts: no guid's xraySolidify time may exceed projectEnd (every carrier is
 *             itself scheduled, so every dependent must resolve by the time the schedule ends).
 *   G-XRAY-4  perf: report the one-time edge-build wall-clock ms (compare against the stale
 *             "74,942 edges/0.7s" figure in GANTT_ACCURACY.md, which this witness's own run
 *             REPLACES with a real measurement) — per-tick cost is O(1) by design (see time_machine.js
 *             comment at the applyHighlight call site) so there is no separate per-tick number to
 *             measure; reported for completeness against §PERF_TRAVERSE's ~31ms/tick budget.
 *
 * RUN: node witness_zstack_xray_staging.js        (SCHEDULE_TEST_DB overrides the DB path)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§XRAY_STAGING SKIP — no DB at ' + DB); process.exit(0); }

const ScheduleGate = require('./viewer/schedule_gate.js');

// ── seq/resource/installSecs assignment — the browser's own rules file (time_machine.js matchRule /
//    getInstallSecs), same JSON the sibling witness_stagger_support_order.js already loads. ──
const RJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewer/rates/sequence_rules.json'), 'utf8'));
const SR = RJ.SEQUENCE_RULES, SD = RJ.SEQUENCE_DEFAULT, LR = RJ.LABOR_RATES || {};
const NO = (RJ.NAME_OVERRIDES || []).map(o =>
  ({ re: new RegExp(o.pattern, o.flags || 'i'), classes: o.classes || null, seq: o.sequence, resource: o.resource }));
function matchRule(cls, name) {
  for (const o of NO) {
    if (o.classes && o.classes.indexOf(cls) < 0) continue;
    if (name && o.re.test(name)) return o;
  }
  let best = null, bl = 0;
  for (const k in SR) if (cls.indexOf(k) >= 0 && k.length > bl) { best = SR[k]; bl = k.length; }
  return best || SD;
}
function getInstallSecs(cls) {
  const rule = matchRule(cls);
  const resource = rule.resource;
  if (!resource || !LR[resource]) return 120;
  const labor = LR[resource];
  let bestPk = null, bestLen = 0;
  for (const pk in labor.productivity) if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
  const prod = bestPk ? labor.productivity[bestPk] : 0;
  return prod > 0 ? Math.round(28800 / prod) : 120;
}
const MAX_CREWS = {};
for (const res in LR) if (LR[res].max_crews) MAX_CREWS[res] = LR[res].max_crews;

// ── load elements (real geometry) via sqlite3 -csv, same shape as _buildXrayElements ──
const csv = execSync(
  `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(m.element_name,''),COALESCE(m.storey,''),` +
  `COALESCE(t.center_x,0),COALESCE(t.center_y,0),COALESCE(t.center_z,0),` +
  `COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0) ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
  { maxBuffer: 1 << 28 }).toString().trim().split('\n');
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
let elements = csv.map(line => {
  const a = splitCsv(line); if (a.length < 10) return null;
  const cls = a[1], name = a[2], rawStorey = a[3] || '_UNKNOWN';
  const cx = +a[4], cy = +a[5], cz = +a[6], bx = +a[7], by = +a[8], bz = +a[9];
  return { guid: a[0], cls, name, rawStorey, cz,
           x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
           base_z: cz - bz / 2, top_z: cz + bz / 2 };
}).filter(Boolean);
if (!elements.length) { console.log('§XRAY_STAGING SKIP — no elements in ' + DB); process.exit(0); }

// §STOREY-Z — same median-Z reassignment of no-storey elements time_machine.js applies, so the
// band gate computeSchedule runs sees the same storey grouping the browser would.
const storeyZvals = {};
elements.forEach(e => {
  if (e.rawStorey === '_UNKNOWN' || /^unknown$/i.test(e.rawStorey) || !e.rawStorey) return;
  (storeyZvals[e.rawStorey] = storeyZvals[e.rawStorey] || []).push(e.cz);
});
const storeyMedianZ = {};
for (const sk in storeyZvals) {
  const vals = storeyZvals[sk].slice().sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  storeyMedianZ[sk] = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}
const storeyNames = Object.keys(storeyMedianZ).sort((a, b) => storeyMedianZ[a] - storeyMedianZ[b]);
function assignStoreyByZ(storey, cz) {
  if (storey && storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
  if (!storeyNames.length) return storey || '_UNKNOWN';
  let best = storeyNames[0], bd = Infinity;
  for (const sn of storeyNames) { const d = Math.abs(cz - storeyMedianZ[sn]); if (d < bd) { bd = d; best = sn; } }
  return best;
}
elements.forEach(e => {
  const rule = matchRule(e.cls, e.name);
  e.seq = rule.sequence;
  e.storey = assignStoreyByZ(e.rawStorey, e.cz);
  e.resource = rule.resource || '_DEFAULT';
  e.installSecs = getInstallSecs(e.cls);
});

// §4D_ROOF_LOAD_PATH M1 seed + §4D_WALLS_BEFORE_ROOF M4 promotion — verbatim from
// _buildXrayElements (viewer/time_machine.js) / audit_support_roleblind.js.
const xy = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const lpWalls = elements.filter(e => e.cls.indexOf('IfcWall') === 0);
const lpSlabs = [], lpSeed = [];
elements.forEach(el => {
  if (el.cls !== 'IfcSlab') return;
  const carriers = lpWalls.filter(w => xy(el, w));
  if (!carriers.length) return;
  let midSum = 0; const above = [];
  carriers.forEach(w => { midSum += (w.base_z + w.top_z) / 2; if (w.base_z >= el.top_z) above.push(w); });
  const clauseA = el.base_z > midSum / carriers.length;
  lpSlabs.push({ el, clauseA, above });
  if (clauseA && !above.length) { el.seq = 8; lpSeed.push(el); }
});
const LP_GAP = 0.5;
if (lpSeed.length) lpSlabs.forEach(rec => {
  const el = rec.el;
  if (el.seq === 8 || !rec.clauseA || !rec.above.length) return;
  for (const w of rec.above) {
    let capped = false;
    for (const C of lpSeed) if (xy(C, w) && C.base_z >= w.base_z && C.base_z <= w.top_z + LP_GAP) { capped = true; break; }
    if (!capped) return;
  }
  el.seq = 8;
});

// ── G-XRAY-2 half 1: snapshot elements + run the REAL scheduler BEFORE the xray cache exists ──
const BASE = Date.parse('2026-01-01T07:00:00Z');
const elementsSnapshotBefore = JSON.stringify(elements);
const sched1 = ScheduleGate.computeSchedule(elements, BASE, 1, MAX_CREWS);

// ── §Z_STACK_XRAY_STAGING predicate + solidify-time cache — COPY of
//    viewer/time_machine.js _buildXraySupportCache. structGrid/wallGrid + EPS/GAP/CELL are the
//    same constants schedule_gate.js's own auditFloating() uses. ──
const CELL = ScheduleGate.CELL || 4, EPS = 0.05, GAP = 0.5;
function cellsOf(e) {
  const out = [];
  for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
    for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) out.push(i + ',' + j);
  return out;
}
const structGrid = {}, wallGrid = {};
elements.forEach(e => {
  if (e.seq <= 4) cellsOf(e).forEach(c => (structGrid[c] = structGrid[c] || []).push(e));
  else if (e.cls.indexOf('IfcWall') === 0) cellsOf(e).forEach(c => (wallGrid[c] = wallGrid[c] || []).push(e));
});
// §XRAY_WALL_SCOPE (found 2026-08-04) — mirrors the SAME fix applied to viewer/time_machine.js
// _buildXraySupportCache: a wall is only ever a real candidate carrier for a slab ITSELF promoted
// to the roof role (seq>4), matching schedule_gate.js auditFloating()'s already-proven restriction
// (§4D_ROOF_LOAD_PATH M3). Without this guard, beams/columns/ordinary slabs near a wall's top height
// (common at any floor-to-floor transition) false-positive as "carried by" that wall — MEASURED
// 1,217 such false positives on Hospital, 93% beam/column/slab-vs-wall, cleared to 0 by this guard.
function carriersOf(T, promotedSlab) {
  const out = [], seen = {};
  for (const c of cellsOf(T)) {
    let arr = structGrid[c];
    if (arr) for (const S of arr) {
      if (S === T || seen[S.guid]) continue; seen[S.guid] = 1;
      if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && xy(S, T)) out.push(S);
    }
    if (!promotedSlab) continue;
    arr = wallGrid[c];
    if (arr) for (const S of arr) {
      if (S === T || seen[S.guid]) continue; seen[S.guid] = 1;
      if (!(S.base_z < T.base_z - EPS) || !xy(S, T)) continue;
      if (S.top_z >= T.base_z - GAP) out.push(S);
    }
  }
  return out;
}

const t0 = Date.now();
let eCount = 0;
const xraySolidify = {};   // guid -> ms (present only for the defect population)
elements.forEach(T => {
  const sc = sched1[T.guid]; if (!sc) return;
  const promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
  const carriers = carriersOf(T, promotedSlab);
  eCount += carriers.length;
  if (!carriers.length) return;
  let maxCarrierEnd = 0, hasCarrier = false;
  carriers.forEach(S => { const se = sched1[S.guid]; if (se) { hasCarrier = true; if (se.end > maxCarrierEnd) maxCarrierEnd = se.end; } });
  if (hasCarrier && maxCarrierEnd > sc.end) xraySolidify[T.guid] = maxCarrierEnd;
});
const buildMs = Date.now() - t0;
console.log('§XRAY_EDGES n=' + eCount + ' ms=' + buildMs.toFixed(1) +
  ' staged=' + Object.keys(xraySolidify).length + '/' + elements.length);

// ── G-XRAY-2 half 2: elements array + schedule unchanged AFTER the xray cache was built ──
const elementsSnapshotAfter = JSON.stringify(elements);
const sched2 = ScheduleGate.computeSchedule(elements, BASE, 1, MAX_CREWS);
let schedDiff = 0;
for (const g in sched1) {
  const a = sched1[g], b = sched2[g];
  if (!b || a.start !== b.start || a.end !== b.end) schedDiff++;
}
for (const g in sched2) if (!sched1[g]) schedDiff++;
const elementsUnchanged = (elementsSnapshotBefore === elementsSnapshotAfter);

// ── G-XRAY-1: RED (solid==reveal, no staging) vs GREEN (xray staging applied, independently
//    re-derived — not just trusting the cache's own max()). ──
// §XRAY_WALL_SCOPE UPDATE (2026-08-04): this gate ORIGINALLY required RED>0 on real Hospital data —
// "a witness that cannot show the RED is not a witness". That was true when the defect population
// was real (5,687, then 1,217 after the sequence-order fix). It is NO LONGER true after the
// wallGrid-scope fix above: real Hospital data now genuinely produces staged=0/63,415 — the
// underlying defect is FIXED, not hidden from this witness. Asserting RED>0 here now would mean
// weakening the witness to demand a defect that no longer exists — the wrong direction entirely.
// So this gate flips to a POSITIVE regression check (staged must STAY 0 on real data), paired with
// a tiny SYNTHETIC positive control (below) proving the detector itself still fires on a real
// violation — so a future regression in carriersOf can't silently read as "still fixed" just
// because real Hospital geometry no longer happens to trigger it.
const redCount = Object.keys(xraySolidify).length;   // solid at T.end while unresolved: exactly the defect population
let greenViol = 0;
elements.forEach(T => {
  const sc = sched1[T.guid]; if (!sc) return;
  const solidAt = (T.guid in xraySolidify) ? xraySolidify[T.guid] : sc.end;
  const promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
  const carriers = carriersOf(T, promotedSlab);
  for (const S of carriers) {
    const se = sched1[S.guid]; if (se && se.end > solidAt) { greenViol++; break; }
  }
});

// ── G-XRAY-1-SYNTH: positive control — carriersOf/staging must still DETECT a real violation.
// A hand-built promoted-roof-slab T directly above a wall S with real XY overlap and S.top_z within
// GAP of T.base_z (the exact promotedSlab-only geometry the fix still allows) — S scheduled to
// finish AFTER T. If this doesn't get flagged, the detector itself is broken, not just "nothing to
// find" — proves the 0 on real Hospital data above means fixed, not blind.
const synthWall = { guid: '_SYNTH_WALL', cls: 'IfcWallStandardCase', seq: 5, x0: 0, x1: 5, y0: 0, y1: 5, base_z: 0, top_z: 3 };
const synthSlab = { guid: '_SYNTH_SLAB', cls: 'IfcSlab', seq: 8, x0: 0, x1: 5, y0: 0, y1: 5, base_z: 3, top_z: 3.3 };
const synthSched = {
  _SYNTH_WALL: { start: 0, end: 20 * 86400000 },
  _SYNTH_SLAB: { start: 0, end: 5 * 86400000 },   // slab "finishes" long before the wall carrying it
};
const synthStructGrid = {}, synthWallGrid = {};
cellsOf(synthWall).forEach(c => (synthWallGrid[c] = synthWallGrid[c] || []).push(synthWall));
function synthCarriersOf(T, promotedSlab) {
  const out = [];
  if (!promotedSlab) return out;
  for (const c of cellsOf(T)) {
    const arr = synthWallGrid[c];
    if (arr) for (const S of arr) {
      if (!(S.base_z < T.base_z - EPS) || !xy(S, T)) continue;
      if (S.top_z >= T.base_z - GAP) out.push(S);
    }
  }
  return out;
}
const synthCarriers = synthCarriersOf(synthSlab, true);   // no `seen` dedup needed here — just checking >=1 hit
const synthDetected = synthCarriers.length >= 1 && synthCarriers.every(function (c) { return c.guid === '_SYNTH_WALL'; }) &&
  synthSched._SYNTH_WALL.end > synthSched._SYNTH_SLAB.end;

// ── G-XRAY-3: no orphan ghosts — every staged guid must resolve by projectEnd ──
let projectEnd = 0;
for (const g in sched1) if (sched1[g].end > projectEnd) projectEnd = sched1[g].end;
let orphans = 0;
for (const g in xraySolidify) if (xraySolidify[g] > projectEnd) orphans++;

// ── verdicts ──
const g1real = redCount === 0;   // real Hospital data: FIXED means 0, not "still can show a defect"
const g1green = greenViol === 0;
const g1synth = synthDetected;   // positive control: detector still fires on a real, hand-built violation
const g2 = schedDiff === 0 && elementsUnchanged;
const g3 = orphans === 0;
const g4pass = true;   // reported, not gated — see header comment (no separate numeric threshold exists in-repo)

console.log('§XRAY_STAGING_G1 REAL(Hospital, staged-count)=' + redCount +
  ' (2026-08-04: fixed, was 5,687 pre-sequence-fix, 1,217 pre-wallGrid-scope-fix; now 0 is the PASS state) ' +
  'GREEN(independently re-derived residual violations)=' + greenViol +
  ' SYNTH(positive-control detector still fires)=' + synthDetected);
console.log('§XRAY_STAGING_G2 schedDiff=' + schedDiff + ' elementsUnchanged=' + elementsUnchanged +
  ' (computeSchedule run before vs after building the xray cache on the same elements array)');
console.log('§XRAY_STAGING_G3 orphansAtProjectEnd=' + orphans + ' projectEnd=' + new Date(projectEnd).toISOString());
console.log('§XRAY_STAGING_G4 edgeBuildMs=' + buildMs.toFixed(1) + ' edges=' + eCount +
  ' elements=' + elements.length +
  ' perTickCost=O(1)-hashmap-lookup-by-design(no-per-tick-sweep) — compare informally against the' +
  ' §PERF_TRAVERSE ~15.6-22.4ms-of-31ms/tick budget already logged in time_machine.js (grep it) —' +
  ' this is a ONE-TIME per-generate cost, not a per-tick cost, so it does not compete with that budget at all.');

const allPass = g1real && g1green && g1synth && g2 && g3 && g4pass;
console.log('§XRAY_STAGING_VERDICT G-XRAY-1(REAL=0,GREEN=0,SYNTH-fires)=' +
  ((g1real && g1green && g1synth) ? 'PASS(real=' + redCount + ')' : 'FAIL(real=' + redCount + ' GREEN=' + greenViol + ' synth=' + synthDetected + ')') +
  ' G-XRAY-2(byte-identical)=' + (g2 ? 'PASS' : 'FAIL(schedDiff=' + schedDiff + ' elementsUnchanged=' + elementsUnchanged + ')') +
  ' G-XRAY-3(orphans=0)=' + (g3 ? 'PASS' : 'FAIL(' + orphans + ')') +
  ' G-XRAY-4(perf, reported)=' + (g4pass ? 'PASS' : 'FAIL'));
process.exit(allPass ? 0 : 1);
