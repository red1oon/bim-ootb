#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves §GEOMETRIC_SUPPORT_ORDER (4D_SCHEDULE_PERFECTION.md, 2026-08-07):
 * "nothing floats" must be a STRUCTURAL fact of the placement order (geometry-derived DAG first,
 * seq/trade as tiebreak only) — not a seq-primary order patched into consistency by a post-hoc
 * repair loop, one discovered building shape at a time.
 *
 * Names the issues it tests:
 *   G-GSO-1 (synthetic, legacy-seq rule set — the exact class the §DEQ_REPAIR comment names): a fan
 *     with LEGACY MEP seq 5 (below walls seq 6) hangs from a roof slab promoted to seq 8. Seq order
 *     places the fan BEFORE its carrier exists in any support grid, so on seq-primary main the fan
 *     is placed at day 0 and only the repair loop drags it back (§DEQ_REPAIR shifted>0). Geometry-
 *     primary order must place the carrier first: shifted MUST be 0 AND fan.start >= roof.end.
 *   G-GSO-2 (real DBs — Hospital 63k, Terminal 48k, PLUS Duplex, the small/residential class the
 *     original gap list §2 says large-building proof does not cover): §DEQ_REPAIR shifted=0 — the
 *     initial placement order is already dependency-consistent, on any building, by construction.
 *     RED on main: Hospital measured shifted=8 (wall-on-roof chain, §DEQ_V1_IMPL).
 *   G-GSO-3 (same runs): auditFloating with NO class filter = 0 on all three buildings (extends the
 *     §DEQ_V1 all-class zero-floating bar to the small-building regime).
 *   G-GSO-4 (same runs): §SUPPORT_CYCLE is REPORTED (count, even 0) — a true geometric cycle is a
 *     modeling fact to name, never silently resolved. RED on main: the line does not exist.
 *
 * Read the §GSO log lines, not exit code alone.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ScheduleGate = require('../viewer/schedule_gate.js');

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`§GSO ${name} ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
  if (!ok) fails++;
};

// Capture §-lines computeSchedule prints (repair count, cycle report) while still passing them through.
let captured = [];
const realLog = console.log.bind(console);
function capture(fn) {
  captured = [];
  console.log = function () { captured.push(Array.prototype.join.call(arguments, ' ')); realLog.apply(null, arguments); };
  try { return fn(); } finally { console.log = realLog; }
}
const grab = (tag) => captured.filter(l => l.indexOf(tag) === 0);
const repairShifted = () => { const l = grab('§DEQ_REPAIR')[0] || ''; const m = l.match(/shifted=(\d+)/); return m ? +m[1] : null; };
const cycleCount = () => { const l = grab('§SUPPORT_CYCLE')[0] || ''; const m = l.match(/cycles=(\d+)/); return m ? +m[1] : null; };

/* ── G-GSO-1: synthetic legacy-seq — carrier sorts AFTER its dependent by seq ───────────────── */
// Geometry (m): floor slab 0..0.3 (seq 4); two walls 0.3..3.0 (seq 6); roof slab 3.0..3.3 promoted
// to seq 8 (sorts wallSeqMax+0.5=6.5 on main); fan hanging at 2.5..2.95 with LEGACY seq 5 — the
// "legacy rule sets where MEP seq < wall seq place carriers after dependents" case the repair-loop
// comment itself names. Fan (5) sorts before wall (6) and roof (6.5): on seq-primary order its
// carrier is in no grid when it is gated, so only the repair loop saves it.
const syn = [
  { guid:'FLOOR', cls:'IfcSlab', seq:4, resource:'CONCRETE_GANG', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:0,y1:10, base_z:0,   top_z:0.3 },
  { guid:'WALL_A',cls:'IfcWallStandardCase', seq:6, resource:'MASON', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:0,y1:0.2, base_z:0.3, top_z:3.0 },
  { guid:'WALL_B',cls:'IfcWallStandardCase', seq:6, resource:'MASON', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:9.8,y1:10, base_z:0.3, top_z:3.0 },
  { guid:'ROOF',  cls:'IfcSlab', seq:8, resource:'CONCRETE_GANG', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:0,y1:10, base_z:3.0, top_z:3.3 },
  { guid:'FAN',   cls:'IfcFlowMovingDevice', seq:5, resource:'HVAC_TECH', storey:'Level 1', installSecs:300, x0:4,x1:6,y0:4,y1:6, base_z:2.5, top_z:2.95 },
];
const synSched = capture(() => ScheduleGate.computeSchedule(syn, 0, 1));
check('G-GSO-1a legacy-seq order-not-repair', repairShifted() === 0,
  `§DEQ_REPAIR shifted=${repairShifted()} (seq-primary main: fan placed before its carrier, repaired after — must be 0 by ORDER)`);
check('G-GSO-1b fan-after-roof', synSched.FAN.start >= synSched.ROOF.end - 1,
  `fan.start=${synSched.FAN.start} roof.end=${synSched.ROOF.end}`);
check('G-GSO-1c unfiltered-audit-zero', ScheduleGate.auditFloating(syn, synSched, null) === 0,
  `auditFloating(no filter)=${ScheduleGate.auditFloating(syn, synSched, null)}`);

/* ── G-GSO-2/3/4: real DBs, live metadata, no class filter, small building included ─────────── */
const RULES_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/sequence_rules.json'), 'utf8'));
const SR = RULES_JSON.SEQUENCE_RULES, SDEF = RULES_JSON.SEQUENCE_DEFAULT || { sequence: 6 };
const matchRule = c => { let b=null,l=0; for (const k in SR) if (c.indexOf(k)>=0 && k.length>l){b=k;l=k.length;} return b?SR[b]:SDEF; };

const BUILDINGS = [
  '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db',
  '/home/red1/bim-compiler/deploy/buildings/Terminal_extracted.db',
  '/home/red1/bim-compiler/deploy/buildings/Duplex_extracted.db',   // small/residential — the regime §2 says large-building proof does not cover
];
for (const DB of BUILDINGS) {
  const name = path.basename(DB).replace('_extracted.db', '');
  if (!fs.existsSync(DB)) { console.log(`§GSO ${name} SKIP — no DB at ${DB}`); continue; }
  const csv = execSync(
    `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(t.center_x,0),COALESCE(t.center_y,0),` +
    `COALESCE(t.center_z,0),COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0),COALESCE(m.storey,'_UNKNOWN') ` +
    `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
    { maxBuffer: 1 << 28 }).toString().trim().split('\n');
  const elements = csv.map(line => {
    const a = line.split(','); if (a.length < 8) return null;
    const cls=a[1], cx=+a[2], cy=+a[3], cz=+a[4], bx=+a[5], by=+a[6], bz=+a[7], r=matchRule(cls);
    return { guid:a[0], cls, seq:r.sequence, resource:r.resource||cls, storey:(a[8]||'_UNKNOWN').replace(/"/g,''),
             installSecs:120, x0:cx-bx/2, x1:cx+bx/2, y0:cy-by/2, y1:cy+by/2, base_z:cz-bz/2, top_z:cz+bz/2 };
  }).filter(Boolean);
  // Promote top-band slabs to roof role (seq 8) — same approximation of tm.js's promotion the §DEQ
  // witness uses, so the promoted-roof + hang machinery is exercised on real geometry.
  const ranks = ScheduleGate.deriveBandRanks(elements).bandRank;
  const maxRank = Math.max(...Object.values(ranks));
  let promoted = 0;
  elements.forEach(e => {
    if (e.cls === 'IfcSlab' && e.seq <= 4 && ranks[ScheduleGate.collapsePhase(e.storey)] === maxRank) { e.seq = 8; promoted++; }
  });
  const t0 = Date.now();
  const sched = capture(() => ScheduleGate.computeSchedule(elements, 0, 1));
  const ms = Date.now() - t0;
  const shifted = repairShifted(), cycles = cycleCount();
  const floatN = ScheduleGate.auditFloating(elements, sched, null);
  console.log(`§GSO ${name} elements=${elements.length} promotedRoofSlabs=${promoted} shifted=${shifted} cycles=${cycles} floating=${floatN}/${elements.length} computeMs=${ms}`);
  check(`G-GSO-2 ${name} order-dependency-consistent`, shifted === 0,
    `§DEQ_REPAIR shifted=${shifted} (0 = order needed no post-hoc repair; main measured Hospital=8)`);
  check(`G-GSO-3 ${name} zero-floating-all-classes`, floatN === 0, `floating=${floatN}/${elements.length} with NO class filter`);
  check(`G-GSO-4 ${name} cycles-named-not-hidden`, cycles !== null && cycles === 0,
    `§SUPPORT_CYCLE cycles=${cycles} (null = line absent, order machinery not geometry-primary; >0 = real modeling cycle, must be examined not assumed)`);
}

if (fails) { console.error(`FAIL — ${fails} §GSO check(s) failed`); process.exit(1); }
console.log('PASS — placement order is geometry-derived (DAG-topological, seq as tiebreak): 0 repair shifts, 0 floating, cycles reported, on large AND small real buildings');
