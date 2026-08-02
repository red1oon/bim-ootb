#!/usr/bin/env node
/* ⚠ AUDIT — the user's standing invariant, 2026-08-02:
 *     "as long as the 4D schedule does not put anything without support first"
 *
 * THE ISSUE IT PROVES OR DISPROVES: §SUPPORT_CHECK reports floating=0 on Hospital, but its pool is
 * role-aware — ScheduleGate.auditFloating offers the WALL support pool only to `IfcSlab && seq>4`
 * (schedule_gate.js:304). Every other class is tested against STRUCTURE ONLY. So an element that
 * rests on a wall — a rooftop proxy, a covering, a plate, a parapet cap — can start before that wall
 * finishes and still be reported as floating=0. This audit is ROLE-BLIND: every element is a
 * candidate support for every other element, by geometry alone, exactly as gravity is.
 *
 * A support S carries T when S starts below T (S.base_z < T.base_z - EPS), tops out at T's underside
 * (S.top_z >= T.base_z - GAP) and overlaps T in XY. T floats when T.start < S.end.
 * EPS/GAP are schedule_gate.js's own constants, not new numbers.
 *
 * RUN: node audit_support_roleblind.js        exit 0 = invariant holds, 1 = violations
 */
const { execSync } = require('child_process');
const fs = require('fs');
const SG = require('./viewer/schedule_gate.js');

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§SUPPORT_ALL SKIP — no DB at ' + DB); process.exit(0); }

const RULES = { IfcFooting:{seq:1,prod:6}, IfcPile:{seq:1,prod:4}, IfcReinforcingBar:{seq:1,prod:50},
  IfcColumn:{seq:2,prod:6}, IfcBeam:{seq:3,prod:8}, IfcMember:{seq:3,prod:10}, IfcSlab:{seq:4,prod:35},
  IfcPlate:{seq:4,prod:12}, IfcDuct:{seq:5,prod:18}, IfcPipe:{seq:5,prod:25}, IfcCableCarrier:{seq:5,prod:30},
  IfcWall:{seq:6,prod:12}, IfcWallStandardCase:{seq:6,prod:12}, IfcDoor:{seq:7,prod:6}, IfcCovering:{seq:8,prod:20} };
const DEF = { seq:6, prod:10 };
const matchRule = c => { let b=null,l=0; for (const k in RULES) if (c.indexOf(k)>=0 && k.length>l){b=k;l=k.length;} return b?RULES[b]:DEF; };

const csv = execSync(
  `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(t.center_x,0),COALESCE(t.center_y,0),` +
  `COALESCE(t.center_z,0),COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0),COALESCE(m.storey,'_UNKNOWN') ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
  { maxBuffer: 1 << 28 }).toString().trim().split('\n');
const elements = csv.map(line => {
  const a = line.split(','); if (a.length < 8) return null;
  const cls=a[1], cx=+a[2], cy=+a[3], cz=+a[4], bx=+a[5], by=+a[6], bz=+a[7], r=matchRule(cls);
  return { guid:a[0], cls, seq:r.seq, resource:cls, storey:(a[8]||'_UNKNOWN').replace(/"/g,''),
           installSecs: r.prod>0?Math.round(28800/r.prod):120,
           x0:cx-bx/2, x1:cx+bx/2, y0:cy-by/2, y1:cy+by/2, base_z:cz-bz/2, top_z:cz+bz/2 };
}).filter(Boolean);

// §4D_ROOF_LOAD_PATH M1 seed + §4D_WALLS_BEFORE_ROOF M4 — same promotion time_machine.js:3331-3398 does.
const LP_GAP = 0.5;
const xy = (a,b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
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

const sched = SG.computeSchedule(elements, Date.now() - 200 * 86400000, 1, {});

// ── ROLE-BLIND support audit ──
const CELL = SG.CELL || 4, EPS = 0.05, GAP = 0.5, DAY = 86400000;
// THE CARRIER POOL. Role-blind was measured first and REJECTED: with every class eligible as a
// support it reported 40,754 "violations", top pair "IfcPipeFitting on IfcCovering" (5,606) — a pipe
// running above a ceiling tile is not held up by that tile. That audit over-reports as badly as the
// shipped one under-reports. What actually carries load is STRUCTURE (seq<=4: footing/pile/column/
// beam/member/slab/plate) and WALLS — offered here to EVERY carried class, which is the half the
// shipped auditFloating is missing (it offers walls only to `IfcSlab && seq>4`).
const isCarrier = e => e.seq <= 4 || e.cls.indexOf('IfcWall') === 0;
const grid = {};
const cellsOf = e => {
  const out = [];
  for (let x = Math.floor(e.x0/CELL); x <= Math.floor(e.x1/CELL); x++)
    for (let y = Math.floor(e.y0/CELL); y <= Math.floor(e.y1/CELL); y++) out.push(x+'|'+y);
  return out;
};
elements.filter(isCarrier).forEach(e => cellsOf(e).forEach(c => (grid[c] = grid[c] || []).push(e)));

const byClass = {};
let violations = 0, worstLag = 0, worst = null;
elements.forEach(T => {
  const ts = sched[T.guid]; if (!ts) return;
  const seen = {}; let lastEnd = 0, lastS = null;
  for (const c of cellsOf(T)) {
    const arr = grid[c]; if (!arr) continue;
    for (const S of arr) {
      if (S.guid === T.guid || seen[S.guid]) continue; seen[S.guid] = 1;
      // RESTS ON, not RUNS PAST: the carrier must top out AT my underside. `top_z >= base_z - GAP`
      // alone accepts any wall taller than my base, which is why a pipe riser threading past a
      // 3m wall counted as 'carried by' it (8,592 such pairs). Bounded both sides.
      if (S.base_z < T.base_z - EPS && Math.abs(S.top_z - T.base_z) <= GAP && xy(S, T)) {
        const se = sched[S.guid]; if (se && se.end > lastEnd) { lastEnd = se.end; lastS = S; }
      }
    }
  }
  if (lastEnd && ts.start < lastEnd - 1000) {          // 1s slack, not a tolerance on the rule
    violations++;
    const key = T.cls + ' on ' + lastS.cls;
    byClass[key] = (byClass[key] || 0) + 1;
    const lag = (lastEnd - ts.start) / DAY;
    if (lag > worstLag) { worstLag = lag; worst = { T, S: lastS, lag }; }
  }
});

console.log('§SUPPORT_ALL elements=' + elements.length + ' violations=' + violations +
  ' (carriers = structure + walls, offered to EVERY carried class)');
if (violations) {
  console.log('\nby pair (carried on carrier), worst first:');
  Object.keys(byClass).sort((a,b) => byClass[b]-byClass[a]).slice(0, 20)
    .forEach(k => console.log('  ' + String(byClass[k]).padStart(6) + '  ' + k));
  console.log('\nworst single: ' + worst.T.cls + ' ' + worst.T.guid + ' (storey ' + worst.T.storey +
    ', base_z ' + worst.T.base_z.toFixed(2) + ')\n  starts ' + worst.lag.toFixed(1) +
    ' days BEFORE its carrier ' + worst.S.cls + ' ' + worst.S.guid + ' finishes');
}
console.log('\n§SUPPORT_ALL_VERDICT ' + (violations ? 'FAIL' : 'PASS') +
  ' — the user\'s invariant: nothing is built before what holds it up');
process.exit(violations ? 1 : 0);
