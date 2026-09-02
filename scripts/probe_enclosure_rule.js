#!/usr/bin/env node
// probe_enclosure_rule.js — Implementing the USER'S RULE (2026-08-26):
//   "midair is all OK as long as it is within walls, floor slab and a roof."
//
// ⚠ DO NOT REMOVE — SCOPE: test the ENCLOSURE rule as a midair TOLERANCE against every delinquent
// set this lane has produced, and report whether it STICKS. Read the log after every run.
//
// Stages 1-5 (raw solve -> CpmSchedule -> Tukey window clip -> deriveZones -> _tmRescaleToTaskWindow)
// are COPIED VERBATIM from scripts/probe_floating_guid_audit.js (branch probe/floating-guid-audit,
// commit 004ab84) so both probes replay the identical live chain. The judge is REQUIRED from
// viewer/support_sweep.js, never re-derived (§10.1 rule 1).
//
// THE RULE, stated precisely so it can fail:
//   ENCLOSED(T, t) is true iff, among elements ALREADY PLACED at time t:
//     (a) FLOOR   — a horizontal element XY-overlapping T with its TOP at or below T's base
//     (b) ROOF    — a horizontal element XY-overlapping T with its BASE at or above T's top
//     (c) WALLS   — vertical elements whose Z-band overlaps T's, within R metres in XY, present in
//                   at least K distinct compass directions (-x,+x,-y,+y) around T's centre
//   Evaluated at T's OWN appearance instant (op[guid].s) — the moment the eye first sees it.
//
// ⚠ THIS IS NOT A SECOND COPY OF §FGA_EYE_FLOATING. The two ask DIFFERENT questions and this probe
// consumes the other one rather than restating it:
//   §FGA_EYE_FLOATING (probe_floating_guid_audit.js)  "is anything holding it up ON SCREEN yet?"
//                                                     — a SUPPORT test. Produces the population.
//   §ENC_* (this file)                                "would a viewer notice?"
//                                                     — a TOLERANCE test. FILTERS that population.
// `eyeFloating()` below is the §FGA rule verbatim; every §ENC_ number is a subset of an §FGA one.
// `unforgiven = eyeFloating AND NOT enclosed` is the only number this probe adds. If the enclosure
// rule is ever adopted, §FGA_EYE_FLOATING stays the reported count and `unforgiven` is what gates —
// a tolerance must never replace the measurement it tolerates.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(ROOT, 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(ROOT, 'viewer', 'schedule_author.js'));
const CpmSchedule = require(path.join(ROOT, 'viewer', 'cpm_schedule.js'));
const SupportSweep = require(path.join(ROOT, 'viewer', 'support_sweep.js'));
global.ScheduleGate = ScheduleGate;

const _contactGraph = SupportSweep.contactGraph;
const _designatedSupport = SupportSweep.designatedSupport;

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const NAME = process.env.ONLY || 'HHS_Office_Federated_extracted';
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;
const START = process.env.START || '2026-01-01';
const DAY_MS = 86400000;
const R = process.env.R != null ? Number(process.env.R) : 5;     // metres, lateral wall search
const K = process.env.K != null ? Number(process.env.K) : 2;     // distinct directions required

function _slug(n) { return String(n).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function _addDays(iso, d) { const t = Date.parse(iso + 'T00:00:00Z') + d * DAY_MS; return new Date(t).toISOString().slice(0, 10); }
function tukeyBound(arr, lowSide) {
  const s = arr.slice().sort((a, b) => a - b);
  const n = s.length, q1 = s[Math.floor(n * 0.25)], q3 = s[Math.floor(n * 0.75)], iqr = q3 - q1;
  return lowSide ? Math.max(s[0], q1 - 1.5 * iqr) : Math.min(s[n - 1], q3 + 1.5 * iqr);
}
// Envelope class sets — EXTRACTED from the model's own ifc_class inventory, not invented.
// STRICT walls: the three wall classes. WIDE adds the curtain-wall fabric (IfcPlate panels +
// IfcMember mullions), which in this FEDERATED model IS the vertical envelope of a glass building.
const HORIZ = /^Ifc(Slab|Roof|Covering)$/;
const WALL_STRICT = /^Ifc(Wall|WallStandardCase|CurtainWall)$/;
const WALL_WIDE = /^Ifc(Wall|WallStandardCase|CurtainWall|Plate|Member)$/;
// STRUCT = load-bearing fabric. A floating one is ALWAYS a defect — the enclosure pass must
// never forgive it. Classes taken from the model's own inventory, no invention.
const STRUCT_RE = /^Ifc(Wall|WallStandardCase|CurtainWall|Column|Beam|Slab|Member|Footing|Pile|Roof|Stair|StairFlight)$/;
// ON by default. NOGUARD=1 reproduces the UNGUARDED rule, which is what exposed the Duplex defect:
// day-0 forgiven goes 5 -> 9, two of them IfcWallStandardCase. A floating WALL must never be
// forgiven — you can see it. That is the whole reason this guard exists; keep both numbers runnable.
const STRUCT_GUARD = !process.env.NOGUARD;
const MEP_RE = /^Ifc(Flow|Distribution|Pipe|Duct|Cable|Energy|Electric|Air|Valve|Pump|Fan|Sanitary|Fire|Junction|Protective|Controller|Actuator|Alarm|Light|Outlet|Switch)/;

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();

  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, NAME + '.db')));
  const elements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES,
    nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  console.log('§ENC_BUILDING ' + NAME + ' elements=' + elements.length + ' R=' + R + 'm K=' + K);

  const maxCrews = {}, dtMaxCrews = {};
  for (const r in RATES.LABOR_RATES) {
    if (RATES.LABOR_RATES[r].max_crews) maxCrews[r] = RATES.LABOR_RATES[r].max_crews;
    if (RATES.LABOR_RATES[r].max_crews_fixed != null) dtMaxCrews[r] = RATES.LABOR_RATES[r].max_crews_fixed;
    else if (RATES.LABOR_RATES[r].max_crews) dtMaxCrews[r] = RATES.LABOR_RATES[r].max_crews;
  }
  const raw = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, SHIFT_HOURS);
  const items = [];
  elements.forEach(el => {
    const st = raw[el.guid]; if (!st) return;
    items.push({ guid: el.guid, s: st.start, e: st.end, bz: el.base_z, tz: el.top_z,
      x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq,
      phase: el.phase, storey: el.storey, resource: el.resource, name: el.name });
  });
  const r = CpmSchedule.run(items, { maxCrews: dtMaxCrews });
  if (!r || !r.ok) throw new Error('CpmSchedule.run failed');
  for (let i = 0; i < items.length; i++) { items[i].s = r.solution.times[i].s; items[i].e = r.solution.times[i].e; }

  const gkOf = it => (it.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(it.storey);
  const groups = {};
  items.forEach(it => { const g = groups[gkOf(it)] || (groups[gkOf(it)] = { s: [], e: [] }); g.s.push(it.s); g.e.push(it.e); });
  const bar = {};
  Object.keys(groups).forEach(k => { const lo = tukeyBound(groups[k].s, true), hi = tukeyBound(groups[k].e, false); bar[k] = { lo, hi: Math.max(hi, lo) }; });
  const winAuthored = {};
  items.forEach(it => {
    const b = bar[gkOf(it)]; let st = it.s, en = it.e;
    if (b) { let ns = Math.min(Math.max(st, b.lo), b.hi), ne = Math.min(Math.max(en, b.lo), b.hi);
      if (ne <= ns) { ns = Math.max(b.lo, b.hi - 60000); ne = b.hi; } st = ns; en = ne; }
    winAuthored[it.guid] = { start: st, end: en };
  });
  const rolled = ScheduleGate.deriveZones(elements, winAuthored, null);
  const minStart = Math.min.apply(null, rolled.zones.map(z => z.start));
  const elByGuid = {}; elements.forEach(e => elByGuid[e.guid] = e);
  const shiftMs = SHIFT_HOURS * 3600 * 1000;
  const win = {}, guidTask = {};
  rolled.zones.forEach(z => {
    const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
    let sDays = Math.floor((z.start - minStart) / DAY_MS);
    let eDays = Math.ceil((z.end - minStart) / DAY_MS);
    if (eDays <= sDays) eDays = sDays + 1;
    let wSecs = 0; const wTrades = {};
    z.guids.forEach(g => { const e = elByGuid[g]; if (!e) return; wSecs += e.installSecs || 0;
      if (e.resource && e.resource !== '_DEFAULT') wTrades[e.resource] = 1; });
    let wCrews = 0; for (const t in wTrades) wCrews += (RATES.LABOR_RATES[t] && RATES.LABOR_RATES[t].max_crews) || 1;
    if (!wCrews) wCrews = 1;
    const needDays = Math.ceil((wSecs * 1000) / (shiftMs * wCrews));
    if (eDays - sDays < needDays) eDays = sDays + needDays;
    const s = Date.parse(_addDays(START, sDays)), e = Date.parse(_addDays(START, eDays));
    win[tid] = { s, e, name: z.phase + ' — ' + z.storey };
    z.guids.forEach(g => { if (!guidTask[g] || win[tid].s < win[guidTask[g]].s) guidTask[g] = tid; });
  });
  const winGroups = {};
  items.forEach(it => { const t = guidTask[it.guid]; if (t == null || !win[t]) return;
    const g = winGroups[t] || (winGroups[t] = { min: Infinity, max: -Infinity });
    if (it.s < g.min) g.min = it.s; if (it.e > g.max) g.max = it.e; });
  const op = {};
  items.forEach(it => {
    const tid = guidTask[it.guid], w = tid != null ? win[tid] : null, g = tid != null ? winGroups[tid] : null;
    if (!w || !g || !isFinite(g.min) || !isFinite(g.max)) { op[it.guid] = { s: it.s, e: it.e }; return; }
    const scale = Math.max(1, w.e - w.s) / Math.max(1, g.max - g.min);
    let st = w.s + (it.s - g.min) * scale, en = w.s + (it.e - g.min) * scale;
    st = Math.min(Math.max(st, w.s), w.e); en = Math.min(Math.max(en, w.s), w.e);
    if (en <= st) { st = Math.max(w.s, w.e - 60000); en = w.e; }
    op[it.guid] = { s: st, e: en };
  });
  const projectStart = Math.min.apply(null, items.map(it => op[it.guid].s));
  const projectEnd = Math.max.apply(null, items.map(it => op[it.guid].e));
  console.log('§ENC_TIMELINE days=' + ((projectEnd - projectStart) / DAY_MS).toFixed(1));

  // ── THE JUDGE (verbatim) ─────────────────────────────────────────────────────────────────────
  const G = _contactGraph(items);
  const des = _designatedSupport(items, G);
  const EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP;
  const groundZ = Math.min.apply(null, items.map(it => it.bz));

  // ── THE ENCLOSURE RULE ───────────────────────────────────────────────────────────────────────
  // Bucket the envelope elements into an XY grid once, so the per-element test is local.
  const CELL = 10;   // metres — envelope search grid, independent of ScheduleGate.CELL
  const cellsOfB = (e, pad) => { const o = [];
    for (let a = Math.floor((e.x0 - pad) / CELL); a <= Math.floor((e.x1 + pad) / CELL); a++)
      for (let b = Math.floor((e.y0 - pad) / CELL); b <= Math.floor((e.y1 + pad) / CELL); b++) o.push(a + ',' + b);
    return o; };
  function buildEnvIndex(wallRe) {
    const H = {}, W = {};
    items.forEach((it, i) => {
      if (HORIZ.test(it.cls)) cellsOfB(it, 0).forEach(c => (H[c] || (H[c] = [])).push(i));
      else if (wallRe.test(it.cls)) cellsOfB(it, 0).forEach(c => (W[c] || (W[c] = [])).push(i));
    });
    return { H, W };
  }
  function encloseTest(i, t, idx, placedAt) {
    const T = items[i];
    let floor = -1, roof = -1;
    const seen = {};
    for (const c of cellsOfB(T, 0)) {
      const arr = idx.H[c]; if (!arr) continue;
      for (const j of arr) {
        if (j === i || seen[j]) continue; seen[j] = 1;
        const S = items[j];
        if (!placedAt(S, t)) continue;
        if (!(S.x0 <= T.x1 && S.x1 >= T.x0 && S.y0 <= T.y1 && S.y1 >= T.y0)) continue;
        if (S.tz <= T.bz + GAP) { if (floor < 0 || S.tz > items[floor].tz) floor = j; }
        if (S.bz >= T.tz - GAP) { if (roof < 0 || S.bz < items[roof].bz) roof = j; }
      }
    }
    const cx = (T.x0 + T.x1) / 2, cy = (T.y0 + T.y1) / 2;
    const dirs = {}; let wallN = 0;
    const seenW = {};
    for (const c of cellsOfB(T, R)) {
      const arr = idx.W[c]; if (!arr) continue;
      for (const j of arr) {
        if (seenW[j]) continue; seenW[j] = 1;
        const S = items[j];
        if (!placedAt(S, t)) continue;
        if (!(S.bz < T.tz + GAP && S.tz > T.bz - GAP)) continue;              // Z-band overlap
        if (S.x0 - R > T.x1 || S.x1 + R < T.x0 || S.y0 - R > T.y1 || S.y1 + R < T.y0) continue;
        wallN++;
        const sx = (S.x0 + S.x1) / 2 - cx, sy = (S.y0 + S.y1) / 2 - cy;
        if (Math.abs(sx) >= Math.abs(sy)) dirs[sx >= 0 ? '+x' : '-x'] = 1; else dirs[sy >= 0 ? '+y' : '-y'] = 1;
      }
    }
    const dn = Object.keys(dirs).length;
    const opposed = (dirs['+x'] && dirs['-x']) || (dirs['+y'] && dirs['-y']) ? 1 : 0;
    return { floor: floor >= 0, roof: roof >= 0, wallN, dirs: dn, opposed,
             enclosed: (floor >= 0 && roof >= 0 && dn >= K && !(STRUCT_GUARD && STRUCT_RE.test(T.cls))) };
  }
  const placedAtT = (S, t) => op[S.guid].s <= t;
  const idxStrict = buildEnvIndex(WALL_STRICT), idxWide = buildEnvIndex(WALL_WIDE);

  // eye rule, verbatim from probe_floating_guid_audit.js
  function eyeFloating(i, t) {
    const T = items[i]; if (T.bz <= groundZ + GAP) return false;
    const lst = G.contacts[i] || [];
    for (const j of lst) {
      const S = items[j]; if (op[S.guid].s > t) continue;
      if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) return false;
      if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) return false;
    }
    return true;
  }

  // ── TEST 1: the DAY 0 HR 3 photograph — the eye-floaters this lane reproduced ─────────────────
  for (const [label, idx] of [['STRICT', idxStrict], ['WIDE', idxWide]]) {
    const cursor = projectStart + 3 * 3600000;
    const flo = [];
    items.forEach((it, i) => { if (op[it.guid].s <= cursor && eyeFloating(i, cursor)) flo.push(i); });
    let enc = 0; const detail = [];
    flo.forEach(i => { const e = encloseTest(i, cursor, idx, placedAtT); if (e.enclosed) enc++;
      detail.push({ i, e }); });
    console.log('§ENC_DAY0HR3 walls=' + label + ' eyeFloating=' + flo.length + ' ofWhichENCLOSED=' + enc +
      ' stillFlagged=' + (flo.length - enc));
    if (label === 'WIDE') detail.slice(0, 6).forEach(d => console.log('  §ENC_D0 guid=' + items[d.i].guid +
      ' cls=' + items[d.i].cls + ' bz=' + items[d.i].bz.toFixed(2) + ' floor=' + d.e.floor + ' roof=' + d.e.roof +
      ' walls=' + d.e.wallN + ' dirs=' + d.e.dirs + ' -> enclosed=' + d.e.enclosed));
  }

  // ── TEST 2: the 63 the judge can never count (des = -1) ──────────────────────────────────────
  for (const [label, idx] of [['STRICT', idxStrict], ['WIDE', idxWide]]) {
    let n = 0, enc = 0, above = 0;
    for (let i = 0; i < items.length; i++) {
      if (des[i] >= 0) continue;
      n++; if (items[i].bz - groundZ <= GAP) continue;
      above++;
      if (encloseTest(i, op[items[i].guid].s, idx, placedAtT).enclosed) enc++;
    }
    console.log('§ENC_BLIND63 walls=' + label + ' des=-1 total=' + n + ' aboveGround=' + above +
      ' ofWhichENCLOSED=' + enc + ' stillFlagged=' + (above - enc));
  }

  // ── TEST 3: the 783 that only float on the PLAYED timeline ───────────────────────────────────
  for (const [label, idx] of [['STRICT', idxStrict], ['WIDE', idxWide]]) {
    let n = 0, enc = 0;
    for (let i = 0; i < items.length; i++) {
      const sI = des[i]; if (sI < 0) continue;
      if (!(op[items[sI].guid].s > op[items[i].guid].s + 1)) continue;
      n++;
      if (encloseTest(i, op[items[i].guid].s, idx, placedAtT).enclosed) enc++;
    }
    console.log('§ENC_PLAYED783 walls=' + label + ' playedFloating=' + n + ' ofWhichENCLOSED=' + enc +
      ' stillFlagged=' + (n - enc));
  }

  // ── TEST 4: does it stick ACROSS THE WHOLE MOVIE? daily samples, eye rule vs enclosure ───────
  const samples = [];
  const days = Math.ceil((projectEnd - projectStart) / DAY_MS);
  for (let d = 0; d <= days; d++) samples.push(projectStart + d * DAY_MS);
  let worstDay = -1, worstUnforgiven = -1, totFloat = 0, totUnf = 0;
  samples.forEach((t, d) => {
    let nf = 0, nu = 0;
    for (let i = 0; i < items.length; i++) {
      if (op[items[i].guid].s > t) continue;
      if (!eyeFloating(i, t)) continue;
      nf++;
      if (!encloseTest(i, t, idxWide, placedAtT).enclosed) nu++;
    }
    totFloat += nf; totUnf += nu;
    if (nu > worstUnforgiven) { worstUnforgiven = nu; worstDay = d; }
    if (d % 10 === 0 || d === days) console.log('§ENC_DAY d=' + d + ' eyeFloating=' + nf + ' unforgiven=' + nu +
      ' forgiven=' + (nf - nu));
  });
  console.log('§ENC_SWEEP days=' + days + ' sumEyeFloating=' + totFloat + ' sumUnforgiven=' + totUnf +
    ' forgivenPct=' + (totFloat ? (100 * (totFloat - totUnf) / totFloat).toFixed(1) : '0') +
    '% worstDay=' + worstDay + ' worstUnforgiven=' + worstUnforgiven);

  // ── TRACE: the full mechanics of ONE float ───────────────────────────────────────────────────
  if (process.env.TRACE) {
    const want = process.env.TRACE;
    const i = items.findIndex(it => it.guid === want);
    if (i < 0) { console.log('§TRACE guid not found: ' + want); }
    else {
      const T = items[i];
      console.log('\n════ §TRACE ' + T.guid + ' ════');
      console.log('  cls=' + T.cls + ' phase=' + JSON.stringify(T.phase) + ' storey=' + JSON.stringify(T.storey) +
        ' seq=' + T.seq + ' resource=' + T.resource);
      console.log('  bbox x[' + T.x0.toFixed(2) + ',' + T.x1.toFixed(2) + '] y[' + T.y0.toFixed(2) + ',' + T.y1.toFixed(2) +
        '] z[' + T.bz.toFixed(2) + ',' + T.tz.toFixed(2) + ']  height=' + (T.tz - T.bz).toFixed(2) + 'm');
      console.log('  groundZ=' + groundZ.toFixed(2) + '  aboveGround=' + (T.bz - groundZ).toFixed(2) + 'm' +
        '  judgeSaysGrounded=' + G.grounded[i] + '  (1 = "I am my footprint\'s ground layer")');
      const lst = G.contacts[i] || [];
      console.log('  contacts=' + lst.length + '  designatedSupport des[i]=' + des[i] +
        (des[i] >= 0 ? ' -> ' + items[des[i]].guid + ' (' + items[des[i]].cls + ')' : '  ⛔ NONE — uncountable by _midairAudit'));
      console.log('  ── every contact the judge found, classified by its OWN three clauses ──');
      lst.forEach(j => {
        const S2 = items[j];
        let kind = 'carrier-ABOVE (I hang from it)';
        if (S2.bz < T.bz - EPS && S2.tz >= T.bz - GAP) kind = 'bearing-BELOW (I rest on it)';
        else if (S2.bz <= T.bz + EPS && S2.tz >= T.tz - EPS) kind = 'embedded (spans my height)';
        const pool = ScheduleGate.supportPool({ seq: S2.seq, cls: S2.cls });
        console.log('    ' + (j === des[i] ? '►' : ' ') + ' ' + S2.cls.padEnd(22) +
          ' seq=' + S2.seq + ' inPool=' + (pool ? 'YES' : 'no ') +
          ' z[' + S2.bz.toFixed(2) + ',' + S2.tz.toFixed(2) + '] ' + kind.padEnd(30) +
          ' playedDay=' + ((op[S2.guid].s - projectStart) / DAY_MS).toFixed(2));
      });
      console.log('  ── times ──');
      const dS = (ms) => ((ms - projectStart) / DAY_MS).toFixed(2);
      console.log('    ME       rawSolveDay=' + ((raw[T.guid].start - Math.min.apply(null, Object.keys(raw).map(g=>raw[g].start))) / DAY_MS).toFixed(2) +
        '  cpmDay=' + ((T.s - Math.min.apply(null, items.map(x=>x.s))) / DAY_MS).toFixed(2) +
        '  PLAYEDday=' + dS(op[T.guid].s) + '  task=' + guidTask[T.guid]);
      if (des[i] >= 0) { const S2 = items[des[i]];
        console.log('    SUPPORT  cpmDay=' + ((S2.s - Math.min.apply(null, items.map(x=>x.s))) / DAY_MS).toFixed(2) +
          '  PLAYEDday=' + dS(op[S2.guid].s) + '  task=' + guidTask[S2.guid]);
        console.log('    -> judge test is on STARTS: support.s > me.s + 1ms ?  cpm=' + (S2.s > T.s + 1) +
          '  played=' + (op[S2.guid].s > op[T.guid].s + 1));
      }
      const eyeAt = (t) => eyeFloating(i, t);
      console.log('  ── the eye, hour by hour, first 12h ──');
      for (let h = 0; h <= 12; h += 3) { const t = projectStart + h * 3600000;
        console.log('    h=' + h + ' onScreen=' + (op[T.guid].s <= t) + ' eyeFloating=' + (op[T.guid].s <= t && eyeAt(t))); }
    }
  }
}
main().catch(e => { console.error('FAILED', e); process.exit(1); });
