#!/usr/bin/env node
/* ⚠ WITNESS — §4D_HOST_BEFORE_HOSTED. Spec: bim-compiler prompts/RESUME_4D_TRUTH_AND_BE_HERE_WHEN.md
 *   §STAGE A (2026-07-30). Read that section before changing anything here.
 *
 * NAMES THE ISSUE: "the baked 4D film reveals a window before its supporting wall" (user, Hospital,
 * 2026-07-29). Four witnesses, each stating what it proves or disproves:
 *
 *   W-HOST-ORDER (crude proxy) — seq-7 openings starting before the EARLIEST seq-6 wall.
 *       Proves/disproves: "openings in a wall-less storey bucket fall through schedule_gate.js's
 *       per-Level trade gate and land at project start." MEASURED 0/571 — DISPROVED. This witness
 *       is structurally incapable of RED: geoGate + §CREW-CAP dominate the trade gate's baseMs.
 *
 *   W-HOST-ORDER (real, per-host) — host derived by MEASURED bbox containment from element_transforms
 *       (never proximity — Prime Directive). Ambiguous (>1 candidate) => NO host, COUNTED, never
 *       guessed. Asserts start_ts(host) <= start_ts(hosted).
 *       Proves/disproves: "some opening is revealed before the wall that contains it." MEASURED 0
 *       at every tolerance, and 0 for the widened superset (every 3D-OVERLAPPING wall must precede)
 *       — DISPROVED.
 *
 *   W-HOST-COVERAGE — hosted/ambiguous/noHost out of all openings, swept over tolerance so the
 *       coverage figure is visibly tolerance-sensitive rather than one cherry-picked number.
 *
 *   W-FACADE-ORDER — the one that IS RED, and the actual defect the user saw. On Hospital every
 *       IfcPlate is named "System Panel:Glazed" (curtain-wall glazing) and 7122/7127 IfcMember are
 *       curtain-wall mullions, yet rates/sequence_rules.json classifies them seq 4 / seq 3 =
 *       Superstructure => PASS A, the STRUCTURAL pass. The whole glazed facade is therefore erected
 *       ~250 days before the masonry it abuts. The "window" the user saw was a glazed panel.
 *
 * WHY start_ts: viewer/time_machine.js:1132-1157 puts an element on screen at op.start_ts (as
 * `frontier`), so start order IS reveal order. Verified, not assumed.
 *
 * Element construction below is replicated VERBATIM from viewer/time_machine.js injectGantt()
 * (query at :3190, §STOREY-Z at :3243-3268, element map at :3269, computeSchedule at :3358) — the
 * whitebox contract, same convention as viewer/tests/test_shop_dates.js. It runs the REAL deployed
 * viewer/schedule_gate.js, not a copy.
 *
 * DB: set HOST_TEST_DB, else ~/bim-ootb/buildings/Hospital_extracted.db. SKIPs (exit 0) if absent.
 * NOT wired into .github/workflows/ci.yml (that runs an explicit list; nothing globs tests/) —
 * it needs a 263MB building DB that CI does not have.
 *
 * Read the §-log lines. Exit code alone is not evidence.
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ScheduleGate = require('../viewer/schedule_gate.js');          // the REAL deployed gate
const RATES = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/sequence_rules.json'), 'utf8'));
const SR = RATES.SEQUENCE_RULES, LR = RATES.LABOR_RATES, SD = RATES.SEQUENCE_DEFAULT;
const NO = RATES.NAME_OVERRIDES || [];        // §4D_FACADE_ORDER — time_machine.js:matchNameOverride, replicated

const DB = process.env.HOST_TEST_DB ||
  path.join(process.env.HOME || '/home/red1', 'bim-ootb/buildings/Hospital_extracted.db');
if (!fs.existsSync(DB)) { console.log('§HOST_ORDER SKIP — no test DB at ' + DB); process.exit(0); }

const SEP = '~@~';                    // sqlite3 field separator; not present in any IFC name
const CELL = 4;                       // m — same XY cell size as schedule_gate.js
const DAY = 86400000;
const day = ms => ms / DAY;

// ── injectGantt() replica ────────────────────────────────────────────────────
function matchNameOverride(cls, name) {                                // time_machine.js:matchNameOverride
  if (!name) return null;
  for (const ov of NO) {
    if (ov.classes && ov.classes.indexOf(cls) < 0) continue;
    if (!ov._re) { try { ov._re = new RegExp(ov.pattern, ov.flags || 'i'); } catch (e) { ov._re = null; } }
    if (ov._re && ov._re.test(name)) return ov;
  }
  return null;
}
function matchRule(cls) {                                             // time_machine.js:3175
  if (!cls) return SD;
  let bestKey = null, bestLen = 0;
  for (const key in SR) if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
  return bestKey ? SR[bestKey] : SD;
}
function getInstallSecs(cls) {                                        // time_machine.js:3183
  const rule = matchRule(cls), resource = rule.resource;
  if (!resource || !LR[resource]) return 120;
  const labor = LR[resource];
  let bestPk = null, bestLen = 0;
  for (const pk in labor.productivity) if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
  const prod = bestPk ? labor.productivity[bestPk] : 0;
  return prod > 0 ? Math.round(28800 / prod) : 120;
}

const rows = execSync(
  `sqlite3 -noheader -separator '${SEP}' "${DB}" ` +
  `"SELECT m.guid, m.ifc_class, COALESCE(m.element_name,''), COALESCE(m.storey,''), ` +
  `COALESCE(t.center_z,0), COALESCE(t.bbox_z,0), COALESCE(t.center_x,0), COALESCE(t.center_y,0), ` +
  `COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0) FROM elements_meta m ` +
  `LEFT JOIN element_transforms t ON t.guid = m.guid ` +
  `WHERE m.ifc_class != 'IfcOpeningElement' ORDER BY 5,7,8;"`,
  { maxBuffer: 1 << 30 }).toString().trim().split('\n')
  .map(l => l.split(SEP)).filter(a => a.length >= 10);

// §STOREY-Z anchor basis — time_machine.js:3218-3268, verbatim
const storeyZvals = {};
rows.forEach(r => {
  const s = r[3] || '_UNKNOWN';
  if (s === '_UNKNOWN' || /^unknown$/i.test(s)) return;
  (storeyZvals[s] = storeyZvals[s] || []).push(+r[4] || 0);
});
const storeyMedianZ = {};
for (const k in storeyZvals) {
  const v = storeyZvals[k].sort((a, b) => a - b), mid = Math.floor(v.length / 2);
  storeyMedianZ[k] = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
const storeyNames = Object.keys(storeyMedianZ).sort((a, b) => storeyMedianZ[a] - storeyMedianZ[b]);
let reassigned = 0;
function assignStoreyByZ(storey, cz) {
  if (storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
  if (!storeyNames.length) return storey;
  let best = storeyNames[0], bd = Infinity;
  for (let i = 0; i < storeyNames.length; i++) {
    const d = Math.abs(cz - storeyMedianZ[storeyNames[i]]);
    if (d < bd) { bd = d; best = storeyNames[i]; }
  }
  reassigned++;
  return best;
}

// useStoreyZ=false is the W-HOST-NO-REGRESSION control arm: it forces the raw elements_meta.storey
// so the D2 hypothesis ("the wall-less 'Unknown' bucket dumps openings at project start") is tested
// on a bucket that really is wall-less, instead of one §STOREY-Z has already emptied.
function build(useStoreyZ) {
  reassigned = 0;
  let nameOverridden = 0;
  const elements = rows.map(r => {
    const cls = r[1], name = r[2] || '', rawStorey = r[3] || '_UNKNOWN';
    const cz = +r[4] || 0, bz = +r[5] || 0, cx = +r[6] || 0, cy = +r[7] || 0, bx = +r[8] || 0, by = +r[9] || 0;
    const storey = useStoreyZ ? assignStoreyByZ(rawStorey, cz) : rawStorey;
    const ov = matchNameOverride(cls, name);
    if (ov) nameOverridden++;
    const rule = ov || matchRule(cls);
    let seq = rule.sequence, phase = rule.phase;
    if (/roof/i.test(storey) && cls === 'IfcSlab' && seq < 8) { seq = 8; phase = 'Architecture'; }
    return {
      guid: r[0], cls, name, storey, rawStorey, cz,
      base_z: cz - bz / 2, top_z: cz + bz / 2,
      x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
      seq, phase, resource: rule.resource || '_DEFAULT', installSecs: getInstallSecs(cls)
    };
  });
  elements.sort((a, b) => {                                           // time_machine.js:3298
    const A = Math.floor(a.cz / 3), B = Math.floor(b.cz / 3);
    if (A !== B) return A - B;
    if (a.seq !== b.seq) return a.seq - b.seq;
    return a.cz - b.cz;
  });
  return { elements, reassigned, nameOverridden };
}
function schedule(elements) {
  let totalSecs = 0;
  elements.forEach(e => { totalSecs += e.installSecs; });
  const rawMs = totalSecs * 1000, rawDays = rawMs / DAY;
  const scaleFactor = rawDays < 10 ? (10 * DAY) / rawMs : 1;
  const maxCrews = {};
  for (const r in LR) if (LR[r].max_crews) maxCrews[r] = LR[r].max_crews;
  return { sched: ScheduleGate.computeSchedule(elements, 0, scaleFactor, maxCrews),
           projectDays: Math.max(10, Math.ceil(rawDays * scaleFactor)) };
}

// ── geometry predicates (MEASURED containment / overlap — never proximity) ───
const cellsOf = e => {
  const o = [];
  for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
    for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
  return o;
};
const contains = (h, o, t) =>
  o.x0 >= h.x0 - t && o.x1 <= h.x1 + t && o.y0 >= h.y0 - t && o.y1 <= h.y1 + t &&
  o.base_z >= h.base_z - t && o.top_z <= h.top_z + t;
const overlaps3d = (a, b, t) =>
  a.x0 <= b.x1 + t && a.x1 >= b.x0 - t && a.y0 <= b.y1 + t && a.y1 >= b.y0 - t &&
  a.base_z <= b.top_z + t && a.top_z >= b.base_z - t;

const isWall    = e => e.cls === 'IfcWall' || e.cls === 'IfcWallStandardCase';
const isWallish = e => isWall(e) || e.cls === 'IfcCurtainWall';
const isOpening = e => e.cls === 'IfcWindow' || e.cls === 'IfcDoor';

// Glazing detection is by NAME because ifc_class cannot distinguish curtain-wall fabric from
// structural plate — and that is precisely the ⛔ open decision in §STAGE A A.4, not a fix.
// It is DELIBERATELY fragile and the fragility is REPORTED, never hidden: Hospital says
// "System Panel:Glazed", HHS says "Systemelement:Verglasung" (German), and Terminal's 33,324
// IfcPlate are "Metal Deck" — genuinely structural, where seq 4 is CORRECT. A name regex is
// therefore evidence-gathering only; §PLATE_UNMATCHED below prints what it missed so the blind
// spot is a number on the log rather than a silent omission.
const GLAZE_RE  = /glaz|glass|verglas|vitrage|vidrio/i;
const isGlazed  = e => e.cls === 'IfcPlate' && GLAZE_RE.test(e.name);

console.log('§HOST_ORDER db=' + path.basename(DB) + ' rows=' + rows.length);

let RED = 0, measured = 0;

// ── W-HOST-NO-REGRESSION + the D2 control arm ────────────────────────────────
const arms = {};
[false, true].forEach(useZ => {
  const b = build(useZ), s = schedule(b.elements);
  arms[useZ ? 'storeyZ' : 'rawStorey'] = { ...b, ...s };
});
console.log('§W-HOST-NO-REGRESSION §STOREY-Z reassigned=' + arms.storeyZ.reassigned +
  ' (rawStorey arm reassigned=' + arms.rawStorey.reassigned + ', projectDays=' + arms.storeyZ.projectDays + ')');
console.log('§NAME_OVERRIDE nameOverridden=' + arms.storeyZ.nameOverridden +
  ' (' + (NO.map(o => o.id).join(',') || 'none') + ')');
Object.keys(arms).forEach(k => {
  const { elements, sched } = arms[k];
  const per = {};
  elements.forEach(e => {
    if (!isWall(e) && !isOpening(e)) return;
    const p = ScheduleGate.collapsePhase(e.storey);
    const rec = per[p] || (per[p] = { w: Infinity, o: Infinity, nw: 0, no: 0 });
    const st = sched[e.guid].start;
    if (isWall(e)) { rec.nw++; if (st < rec.w) rec.w = st; } else { rec.no++; if (st < rec.o) rec.o = st; }
  });
  Object.keys(per).sort().forEach(p => {
    const r = per[p];
    console.log('  §PER_STOREY[' + k + '] ' + p.padEnd(10) +
      ' walls=' + String(r.nw).padStart(4) + ' firstWallDay=' + (isFinite(r.w) ? day(r.w).toFixed(2) : 'n/a') +
      ' openings=' + String(r.no).padStart(4) + ' firstOpeningDay=' + (isFinite(r.o) ? day(r.o).toFixed(2) : 'n/a') +
      (isFinite(r.o) && isFinite(r.w) && r.o < r.w ? '  <<< OPENING BEFORE WALL IN BUCKET' : ''));
  });
});

// The production arm — everything below asserts against what the shipped viewer actually builds.
const { elements, sched, projectDays } = arms.storeyZ;

// ── W-HOST-ORDER, crude proxy (the brief's Stage A gate) ─────────────────────
{
  const walls = elements.filter(isWall), opens = elements.filter(isOpening);
  const first = Math.min.apply(null, walls.map(w => sched[w.guid].start));
  const v = opens.filter(o => sched[o.guid].start < first).length;
  measured++;
  console.log('§W-HOST-ORDER[crude] walls=' + walls.length + ' openings=' + opens.length +
    ' earliestWallStartDay=' + day(first).toFixed(2) + ' openingsBeforeAnyWall=' + v + '/' + opens.length +
    (v ? '  RED' : '  0 — cannot show RED; geoGate + §CREW-CAP dominate the trade gate (see §STAGE A A.1)'));
}

// ── W-HOST-ORDER (real, per-host) + W-HOST-COVERAGE ──────────────────────────
{
  const hosts = elements.filter(isWallish), opens = elements.filter(isOpening);
  const grid = {};
  hosts.forEach(h => cellsOf(h).forEach(c => (grid[c] = grid[c] || []).push(h)));
  const candidates = (o, tol, pred) => {
    const seen = {}, out = [];
    cellsOf(o).forEach(c => {
      const a = grid[c]; if (!a) return;
      for (let i = 0; i < a.length; i++) {
        const h = a[i];
        if (seen[h.guid] || h.guid === o.guid) continue;
        seen[h.guid] = 1;
        if (pred(h, o, tol)) out.push(h);
      }
    });
    return out;
  };
  [0, 0.05, 0.10, 0.25, 0.50].forEach(tol => {
    let hosted = 0, ambiguous = 0, none = 0, viol = 0, worst = 0;
    opens.forEach(o => {
      const c = candidates(o, tol, contains);
      if (!c.length) { none++; return; }
      if (c.length > 1) { ambiguous++; return; }        // NOT guessed — counted
      hosted++;
      const h = c[0];
      if (sched[h.guid].start > sched[o.guid].start) {
        viol++;
        const late = day(sched[h.guid].start) - day(sched[o.guid].start);
        if (late > worst) worst = late;
      }
    });
    measured++;
    if (viol) RED++;
    console.log('§W-HOST-COVERAGE tol=' + tol.toFixed(2) + 'm hosted=' + hosted + ' ambiguous=' + ambiguous +
      ' noHost=' + none + ' /' + opens.length +
      '   §W-HOST-ORDER[contain] violations=' + viol + '/' + hosted + ' worstLateDays=' + worst.toFixed(2));
  });
  // widened superset: EVERY 3D-overlapping wallish element must start no later
  let withN = 0, viol = 0, worst = 0;
  opens.forEach(o => {
    const c = candidates(o, 0.05, overlaps3d);
    if (!c.length) return;
    withN++;
    let bad = 0;
    c.forEach(h => { const l = day(sched[h.guid].start) - day(sched[o.guid].start); if (l > bad) bad = l; });
    if (bad > 0) { viol++; if (bad > worst) worst = bad; }
  });
  measured++;
  if (viol) RED++;
  console.log('§W-HOST-ORDER[overlap-superset] tol=0.05m openingsWithOverlappingWall=' + withN +
    ' violations=' + viol + '/' + withN + ' worstLateDays=' + worst.toFixed(2));
}

// ── W-FACADE-ORDER — the RED one ─────────────────────────────────────────────
{
  console.log('§CLASS_SPAN (reveal start day; projectDays=' + projectDays + ')');
  ['IfcColumn', 'IfcMember', 'IfcSlab', 'IfcPlate', 'IfcWall', 'IfcWallStandardCase',
   'IfcWindow', 'IfcDoor', 'IfcCurtainWall', 'IfcCovering'].forEach(c => {
    const es = elements.filter(e => e.cls === c);
    if (!es.length) return;
    const d = es.map(e => day(sched[e.guid].start)).sort((a, b) => a - b);
    console.log('  ' + c.padEnd(21) + ' n=' + String(es.length).padStart(5) + ' seq=' + es[0].seq +
      ' ' + String(es[0].phase).padEnd(14) + ' startDay min=' + d[0].toFixed(1) +
      ' p50=' + d[Math.floor(d.length / 2)].toFixed(1) + ' max=' + d[d.length - 1].toFixed(1));
  });

  const walls = elements.filter(isWall), glaze = elements.filter(isGlazed);
  const plates = elements.filter(e => e.cls === 'IfcPlate');
  const unmatched = {};
  plates.filter(p => !isGlazed(p)).forEach(p => {
    const kind = (p.name.split(':')[0] || '(unnamed)').trim();
    unmatched[kind] = (unmatched[kind] || 0) + 1;
  });
  console.log('§PLATE_UNMATCHED IfcPlate=' + plates.length + ' glazeNameMatched=' + glaze.length +
    ' unmatched=' + (plates.length - glaze.length) +
    (Object.keys(unmatched).length ? ' byName=' + JSON.stringify(unmatched).slice(0, 300) : '') +
    '  (unmatched are NOT asserted on — see GLAZE_RE comment)');
  if (!glaze.length || !walls.length) {
    console.log('§W-FACADE-ORDER SKIP — no glazed IfcPlate (' + glaze.length + ') or no walls (' + walls.length + ')');
  } else {
    const firstWall = Math.min.apply(null, walls.map(w => sched[w.guid].start));
    const before = glaze.filter(g => sched[g.guid].start < firstWall).length;
    measured++;
    if (before) RED++;
    console.log('§W-FACADE-ORDER glazedPanels=' + glaze.length + ' walls=' + walls.length +
      ' earliestWallStartDay=' + day(firstWall).toFixed(2) +
      ' glazedBeforeAnyWall=' + before + '/' + glaze.length + (before ? '  RED' : ''));

    const grid = {};
    walls.forEach(w => cellsOf(w).forEach(c => (grid[c] = grid[c] || []).push(w)));
    let touching = 0, viol = 0, worst = 0;
    const ex = [];
    glaze.forEach(g => {
      const seen = {}; let bad = null, hasOverlap = false;
      cellsOf(g).forEach(c => {
        const a = grid[c]; if (!a) return;
        for (let i = 0; i < a.length; i++) {
          const w = a[i];
          if (seen[w.guid]) continue;
          seen[w.guid] = 1;
          if (!overlaps3d(w, g, 0.25)) continue;   // MEASURED overlap only — a shared 4m grid
          hasOverlap = true;                       // cell is NOT contact and must not count
          const late = day(sched[w.guid].start) - day(sched[g.guid].start);
          if (late > 0 && (!bad || late > bad.late)) bad = { w, late };
        }
      });
      if (!hasOverlap) return;
      touching++;
      if (bad) {
        viol++;
        if (bad.late > worst) worst = bad.late;
        if (ex.length < 4) ex.push('glazed ' + g.guid + ' @day' + day(sched[g.guid].start).toFixed(2) +
          ' vs touching ' + bad.w.cls + ' @day' + day(sched[bad.w.guid].start).toFixed(2) +
          ' late=' + bad.late.toFixed(1) + 'd');
      }
    });
    measured++;
    if (viol) RED++;
    console.log('§W-FACADE-ORDER panelsWithTouchingWall=' + touching + ' violations=' + viol + '/' + touching +
      ' worstLateDays=' + worst.toFixed(2) + (viol ? '  RED' : ''));
    ex.forEach(e => console.log('     e.g. ' + e));
  }
}

console.log('§VERDICT ' + (RED ? 'RED' : 'GREEN') + ' — ' + RED + ' of ' + measured +
  ' witnesses violated. See bim-compiler prompts/RESUME_4D_TRUTH_AND_BE_HERE_WHEN.md §STAGE A.');
process.exit(RED ? 1 : 0);
