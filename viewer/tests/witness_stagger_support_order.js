#!/usr/bin/env node
/* ⚠ DO NOT REMOVE — read the log after every run.
 *
 * WITNESS: §PLAYBACK-STAGGER support order — prompts/GANTT_ACCURACY.md ▶RESUME 2026-08-02 (late).
 *
 * THE ISSUE IT PROVES OR DISPROVES: viewer/time_machine.js §PLAYBACK-STAGGER distributes each
 * captured task's guids across the task window sorted by (seq, center_z). center_z is a CENTROID,
 * not a bearing surface — a 6.87m Hospital column's centroid sits ABOVE the slab it carries — so
 * within one captured task window, carried elements are revealed before their carriers. On the
 * user's live Hospital (§CPE_BUILDUP_SOURCE source=captured leafTasks=6) schedule_gate.js is never
 * consulted, so every scheduler-side fix is invisible to that film; the stagger comparator is the
 * only ordering authority. The fix: base_z-primary order. base_z is a valid topological potential
 * of the support DAG (a carrier ALWAYS has S.base_z < T.base_z - EPS — the audit's own predicate),
 * so a walk in base_z order cannot place anything before its support.
 *
 * GATES (all must hold, exit 1 otherwise):
 *   G-SSO-1  RED: the SHIPPED comparator (seq, cz), one captured window over all elements, real
 *            Hospital geometry → role-blind support violations > 0. A witness that cannot show
 *            the RED is not a witness.
 *   G-SSO-2  GREEN: the FIXED comparator (base_z, seq, cz), same window → violations = 0.
 *   G-SSO-3  §4D_FACADE_ORDER / §4D_HOST_BEFORE_HOSTED control: under the fixed order, no hosted
 *            element (glazing-override IfcPlate/IfcMember, IfcWindow, IfcDoor) starts before an
 *            XY-touching wall whose z-range CONTAINS it (measured containment — the host relation).
 *            The raw (base_z, seq, cz) sort alone REGRESSES this: 101/5,924 host pairs on Hospital
 *            are float-noise near-ties (wall base 0–0.043m above the panel's, all < EPS), so the
 *            fixed order includes the §4D_HOST_BEFORE_HOSTED post-pass — hosted elements move to
 *            just after their last host wall, a constraint AFTER the sort, never a replacement.
 *            Moving an element LATER cannot create a support violation (hosted classes are never
 *            carriers), so G-SSO-2 and this gate hold together, not in trade.
 *   G-SSO-4  multi-task shape (mirrors live leafTasks=6): elements bucketed into 6 z-sliced
 *            windows → WITHIN-task violations = 0 under the fixed comparator. Cross-task
 *            violations are REPORTED, not gated — task windows are the planner's data and the
 *            stagger may not re-key them (§CPE_BUILDUP_FOLLOW_TM).
 *
 * The support predicate, EPS/GAP/CELL, carrier pool (structure + walls, offered to EVERY class)
 * and the roof-load-path promotion are copied VERBATIM from audit_support_roleblind.js
 * (branch fix/helipad-roof-separation) — the instrument the lane already trusts. The stagger
 * bucketing/distribution is copied verbatim from viewer/time_machine.js §PLAYBACK-STAGGER.
 *
 * RUN: node witness_stagger_support_order.js        (SCHEDULE_TEST_DB overrides the DB path)
 */
const { execSync } = require('child_process');
const fs = require('fs');

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§STAGGER_SUPPORT SKIP — no DB at ' + DB); process.exit(0); }

// ── seq assignment: the browser's own rules file, name overrides first (time_machine.js matchRule) ──
const RJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..') + '/viewer/rates/sequence_rules.json', 'utf8'));
const SR = RJ.SEQUENCE_RULES, SD = RJ.SEQUENCE_DEFAULT, NO = (RJ.NAME_OVERRIDES || []).map(o =>
  ({ re: new RegExp(o.pattern, o.flags || 'i'), classes: o.classes || null, seq: o.sequence }));
function seqOf(cls, name) {
  for (const o of NO) {
    if (o.classes && o.classes.indexOf(cls) < 0) continue;
    if (name && o.re.test(name)) return o.seq;
  }
  let best = null, bl = 0;
  for (const k in SR) if (cls.indexOf(k) >= 0 && k.length > bl) { best = SR[k]; bl = k.length; }
  return (best || SD).sequence;
}

const csv = execSync(
  `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(m.element_name,''),` +
  `COALESCE(t.center_x,0),COALESCE(t.center_y,0),COALESCE(t.center_z,0),` +
  `COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0) ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
  { maxBuffer: 1 << 28 }).toString().trim().split('\n');
// csv quoting: element_name may contain commas — parse with a real splitter.
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
const elements = csv.map(line => {
  const a = splitCsv(line); if (a.length < 9) return null;
  const cls = a[1], name = a[2], cx = +a[3], cy = +a[4], cz = +a[5], bx = +a[6], by = +a[7], bz = +a[8];
  const seq = seqOf(cls, name);
  return { guid: a[0], cls, seq, cz,
           hostable: (cls === 'IfcWindow' || cls === 'IfcDoor') ||
                     ((cls === 'IfcPlate' || cls === 'IfcMember') && seq === 7),
           x0: cx - bx/2, x1: cx + bx/2, y0: cy - by/2, y1: cy + by/2,
           base_z: cz - bz/2, top_z: cz + bz/2 };
}).filter(Boolean);

// ── §4D_ROOF_LOAD_PATH M1 seed + §4D_WALLS_BEFORE_ROOF M4 promotion (verbatim from the audit) ──
const LP_GAP = 0.5;
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

// ── §PLAYBACK-STAGGER distribution, verbatim from time_machine.js §PLAYBACK-STAGGER ──
// hostPass: the §4D_HOST_BEFORE_HOSTED constraint pass replicated from the fix. The bucket is
// base_z-sorted, so any host wall sorted AFTER a hosted element must have base_z within
// [H.base_z, H.base_z + EPS] — a forward scan bounded by that window finds every offender.
function hostPass(items) {
  const HEPS = 0.05;
  const keys = items.map((_, i) => i);
  let moved = 0;
  for (let i = 0; i < items.length; i++) {
    const H = items[i]; if (!H.hostable) continue;
    let last = -1;
    for (let j = i + 1; j < items.length && items[j].base_z <= H.base_z + HEPS; j++) {
      const W = items[j];
      if (W.cls.indexOf('IfcWall') === 0 && xy(H, W) &&
          W.base_z <= H.base_z + HEPS && W.top_z >= H.top_z - HEPS) last = j;
    }
    if (last > i) { keys[i] = last + 0.5; moved++; }
  }
  if (moved) {
    const order = items.map((el, i) => ({ el, k: keys[i], i }));
    order.sort((a, b) => (a.k - b.k) || (a.i - b.i));
    for (let i = 0; i < items.length; i++) items[i] = order[i].el;
  }
  return moved;
}
function stagger(buckets, comparator, withHostPass) {
  const sched = {};
  let movedTotal = 0;
  for (const tid in buckets) {
    const { w, items } = buckets[tid];
    items.sort(comparator);
    if (withHostPass) movedTotal += hostPass(items);
    const n = items.length, span = Math.max(1, w.e - w.s);
    items.forEach((item, i) => {
      const s_i = w.s + Math.floor((i / n) * span);
      let e_i = (i + 1 < n) ? (w.s + Math.floor(((i + 1) / n) * span)) : w.e;
      if (e_i <= s_i) e_i = s_i + 60000;
      sched[item.guid] = { start: s_i, end: e_i, task: tid };
    });
  }
  if (withHostPass) console.log('§STAGGER_HOST movedAfterHost=' + movedTotal);
  return sched;
}
const SHIPPED = (a, b) => (a.seq - b.seq) || (a.cz - b.cz);
const FIXED = (a, b) => (a.base_z - b.base_z) || (a.seq - b.seq) || (a.cz - b.cz);

// ── role-blind support audit (verbatim predicate from audit_support_roleblind.js) ──
const CELL = 4, EPS = 0.05, GAP = 0.5, DAY = 86400000;
const isCarrier = e => e.seq <= 4 || e.cls.indexOf('IfcWall') === 0;
const cellsOf = e => {
  const out = [];
  for (let x = Math.floor(e.x0/CELL); x <= Math.floor(e.x1/CELL); x++)
    for (let y = Math.floor(e.y0/CELL); y <= Math.floor(e.y1/CELL); y++) out.push(x + '|' + y);
  return out;
};
const grid = {};
elements.filter(isCarrier).forEach(e => cellsOf(e).forEach(c => (grid[c] = grid[c] || []).push(e)));

function audit(sched, label) {
  let viol = 0, cross = 0, worstLag = 0, worst = null; const byClass = {};
  elements.forEach(T => {
    const ts = sched[T.guid]; if (!ts) return;
    const seen = {}; let lastEnd = 0, lastS = null;
    for (const c of cellsOf(T)) {
      const arr = grid[c]; if (!arr) continue;
      for (const S of arr) {
        if (S.guid === T.guid || seen[S.guid]) continue; seen[S.guid] = 1;
        if (S.base_z < T.base_z - EPS && Math.abs(S.top_z - T.base_z) <= GAP && xy(S, T)) {
          const se = sched[S.guid]; if (se && se.end > lastEnd) { lastEnd = se.end; lastS = S; }
        }
      }
    }
    if (lastEnd && ts.start < lastEnd - 1000) {
      const sameTask = sched[lastS.guid].task === ts.task;
      if (sameTask) {
        viol++;
        const key = T.cls + ' on ' + lastS.cls;
        byClass[key] = (byClass[key] || 0) + 1;
        const lag = (lastEnd - ts.start) / DAY;
        if (lag > worstLag) { worstLag = lag; worst = { T, S: lastS, lag }; }
      } else cross++;
    }
  });
  const top = Object.keys(byClass).sort((a, b) => byClass[b] - byClass[a]).slice(0, 5)
    .map(k => byClass[k] + '× ' + k).join(' | ');
  console.log('§STAGGER_SUPPORT [' + label + '] elements=' + elements.length +
    ' withinTaskViolations=' + viol + ' crossTaskViolations=' + cross +
    (viol ? ' worst=' + worstLag.toFixed(1) + 'd (' + worst.T.cls + ' on ' + worst.S.cls + ')' : ''));
  if (viol) console.log('§STAGGER_SUPPORT_PAIRS [' + label + '] ' + top);
  return { viol, cross };
}

// ── the fixture windows: dates are arbitrary by design — within-task order (the thing under test)
//    is invariant to the window's dates; only the ORDER INDEX inside the bucket matters. ──
const BASE = Date.parse('2026-01-01T07:00:00Z'), SPAN = 180 * DAY;

// Arm 1+2: ONE captured window over ALL elements (degenerate captured case, order fully exposed).
const oneWin = { w: { s: BASE, e: BASE + SPAN }, items: elements };
const red = audit(stagger({ T1: oneWin }, SHIPPED, false), 'RED shipped (seq,cz) 1 task');
const green = audit(stagger({ T1: { w: oneWin.w, items: elements.slice() } }, FIXED, true), 'GREEN fixed (base_z,seq,cz)+hostPass 1 task');

// Arm 4: 6 z-sliced windows — mirrors the live leafTasks=6 shape. Sequential, non-overlapping.
const zs = elements.map(e => e.base_z).sort((a, b) => a - b);
const buckets6 = {};
for (let k = 0; k < 6; k++) buckets6['P' + k] = { w: { s: BASE + k * 30 * DAY, e: BASE + (k + 1) * 30 * DAY }, items: [] };
elements.forEach(e => {
  let k = 0;
  for (; k < 5; k++) if (e.base_z < zs[Math.floor((k + 1) * zs.length / 6)]) break;
  buckets6['P' + k].items.push(e);
});
const multi = audit(stagger(buckets6, FIXED, true), 'GREEN fixed 6 tasks');

// Arm 3: §4D_FACADE_ORDER / §4D_HOST_BEFORE_HOSTED control under the FIXED order (single window,
// all pairs in-task): every hosted class, against every XY-touching wall that z-contains it.
const gSched = stagger({ T1: { w: { s: BASE, e: BASE + SPAN }, items: elements.slice() } }, FIXED, true);
let facadeViol = 0, facadePairs = 0;
const glaz = elements.filter(e => e.hostable);
glaz.forEach(G => {
  const seen = {};
  for (const c of cellsOf(G)) {
    const arr = grid[c]; if (!arr) continue;
    for (const W of arr) {
      if (W.cls.indexOf('IfcWall') !== 0 || seen[W.guid]) continue; seen[W.guid] = 1;
      // host-candidate: wall's z-range CONTAINS the panel and they touch in XY
      if (xy(G, W) && W.base_z <= G.base_z + EPS && W.top_z >= G.top_z - EPS) {
        facadePairs++;
        if (gSched[G.guid].start < gSched[W.guid].start) facadeViol++;
      }
    }
  }
});
console.log('§STAGGER_FACADE hostedClasses=glazing+window+door pairs=' + facadePairs +
  ' hostedBeforeHostWall=' + facadeViol + ' (must be 0 — §4D_FACADE_ORDER / §4D_HOST_BEFORE_HOSTED guard)');

// ── verdicts ──
const g1 = red.viol > 0, g2 = green.viol === 0, g3 = facadeViol === 0, g4 = multi.viol === 0;
console.log('§STAGGER_SUPPORT_VERDICT G-SSO-1(RED>0)=' + (g1 ? 'PASS(' + red.viol + ')' : 'FAIL') +
  ' G-SSO-2(GREEN=0)=' + (g2 ? 'PASS' : 'FAIL(' + green.viol + ')') +
  ' G-SSO-3(facade=0)=' + (g3 ? 'PASS' : 'FAIL(' + facadeViol + ')') +
  ' G-SSO-4(multiWithin=0)=' + (g4 ? 'PASS' : 'FAIL(' + multi.viol + ')') +
  ' crossTask(reported)=' + multi.cross);
process.exit(g1 && g2 && g3 && g4 ? 0 : 1);
