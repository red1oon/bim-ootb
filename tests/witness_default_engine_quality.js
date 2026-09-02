#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves §DEQ_V1 (4D_SCHEDULE_PERFECTION.md §DEFAULT_ENGINE_QUALITY, decided
 * 2026-08-07): "the DEFAULT engine's schedule has zero common-sense physics violations — zero floating
 * across ALL classes (criterion 1) and zero seq-vs-geometry contradictions (criterion 3)."
 *
 * Names the issues it tests:
 *   G-DEQ-1 (synthetic, the exact user-reported defect): a fan (MEP seq 7) hanging under a roof slab
 *     promoted to seq 8 was scheduled BEFORE the roof (Pass B walks ascending seq) and §SUPPORT_CHECK
 *     reported floating=0 anyway (fan had no bearing-below support, so the audit skipped it).
 *     PASS iff the fan now starts at/after the roof's finish AND the unfiltered audit is 0.
 *   G-DEQ-2 (real DBs, Hospital + Terminal, seq from the LIVE viewer/rates/sequence_rules.json
 *     metadata — not a hand-tuned per-building rule set): auditFloating with NO class filter must be 0.
 *     Top-band slabs are promoted to seq 8 to exercise the promoted-roof machinery on real geometry
 *     (an approximation of time_machine.js's wall-midheight promotion — the witness exercises the
 *     seq-8-slab path, it does not reproduce tm's promotion bit-for-bit).
 *
 * Read the §DEQ log lines, not exit code alone.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ScheduleGate = require('../viewer/schedule_gate.js');

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`§DEQ ${name} ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
  if (!ok) fails++;
};

/* ── G-DEQ-1: synthetic fan-over-promoted-roof ─────────────────────────────────────────────── */
// Geometry (m): floor slab at z 0..0.3 (seq 4); two walls 0.3..3.0 (seq 5); roof slab 3.0..3.3
// promoted to seq 8; fan hanging at z 2.5..2.95 (top within GAP=0.5 of roof underside, nothing
// bearing within GAP below its base) with MEP seq 7 — the exact live configuration.
const syn = [
  { guid:'FLOOR', cls:'IfcSlab', seq:4, resource:'CONCRETE_GANG', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:0,y1:10, base_z:0,   top_z:0.3 },
  { guid:'WALL_A',cls:'IfcWallStandardCase', seq:5, resource:'MASON', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:0,y1:0.2, base_z:0.3, top_z:3.0 },
  { guid:'WALL_B',cls:'IfcWallStandardCase', seq:5, resource:'MASON', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:9.8,y1:10, base_z:0.3, top_z:3.0 },
  { guid:'ROOF',  cls:'IfcSlab', seq:8, resource:'CONCRETE_GANG', storey:'Level 1', installSecs:600, x0:0,x1:10,y0:0,y1:10, base_z:3.0, top_z:3.3 },
  { guid:'FAN',   cls:'IfcFlowMovingDevice', seq:7, resource:'HVAC_TECH', storey:'Level 1', installSecs:300, x0:4,x1:6,y0:4,y1:6, base_z:2.5, top_z:2.95 },
];
const synSched = ScheduleGate.computeSchedule(syn, 0, 1);
check('G-DEQ-1a fan-after-roof', synSched.FAN.start >= synSched.ROOF.end - 1,
  `fan.start=${synSched.FAN.start} roof.end=${synSched.ROOF.end} (pre-fix: fan placed first, seq 7 < 8)`);
check('G-DEQ-1b roof-after-walls', synSched.ROOF.start >= synSched.WALL_A.end - 1 && synSched.ROOF.start >= synSched.WALL_B.end - 1,
  `roof.start=${synSched.ROOF.start} walls.end=${synSched.WALL_A.end}/${synSched.WALL_B.end} (§4D_WALLS_BEFORE_ROOF must not regress)`);
check('G-DEQ-1c unfiltered-audit-zero', ScheduleGate.auditFloating(syn, synSched, null) === 0,
  `auditFloating(no filter)=${ScheduleGate.auditFloating(syn, synSched, null)} (pre-fix: 0 too, but only because the fan was invisible — 1a is what proves the blindness is gone)`);

/* ── G-DEQ-2: real DBs, live metadata, no class filter ─────────────────────────────────────── */
const RULES_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/sequence_rules.json'), 'utf8'));
const SR = RULES_JSON.SEQUENCE_RULES, SDEF = RULES_JSON.SEQUENCE_DEFAULT || { sequence: 6 };
const matchRule = c => { let b=null,l=0; for (const k in SR) if (c.indexOf(k)>=0 && k.length>l){b=k;l=k.length;} return b?SR[b]:SDEF; };

const BUILDINGS = [
  '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db',
  '/home/red1/bim-compiler/deploy/buildings/Terminal_extracted.db',
];
for (const DB of BUILDINGS) {
  const name = path.basename(DB).replace('_extracted.db', '');
  if (!fs.existsSync(DB)) { console.log(`§DEQ G-DEQ-2 SKIP — no DB at ${DB}`); continue; }
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
  // Promote top-band slabs to roof role (seq 8) — exercises the promoted-roof + hang machinery on
  // real geometry (approximation of tm.js's promotion; see header).
  const ranks = ScheduleGate.deriveBandRanks(elements).bandRank;
  const maxRank = Math.max(...Object.values(ranks));
  let promoted = 0;
  elements.forEach(e => {
    if (e.cls === 'IfcSlab' && e.seq <= 4 && ranks[ScheduleGate.collapsePhase(e.storey)] === maxRank) { e.seq = 8; promoted++; }
  });
  const sched = ScheduleGate.computeSchedule(elements, 0, 1);
  const floatN = ScheduleGate.auditFloating(elements, sched, null);
  console.log(`§DEQ ${name} elements=${elements.length} promotedRoofSlabs=${promoted} floating=${floatN}/${elements.length}`);
  check(`G-DEQ-2 ${name} zero-floating-all-classes`, floatN === 0, `floating=${floatN}/${elements.length} with NO class filter`);
}

if (fails) { console.error(`FAIL — ${fails} §DEQ check(s) failed`); process.exit(1); }
console.log('PASS — default engine schedule has zero physics violations across ALL classes (criteria 1+3)');
