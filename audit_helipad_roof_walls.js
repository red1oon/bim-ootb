#!/usr/bin/env node
/* ⚠ AUDIT — "the roof without walls on helipad still sticking out" (user, 2026-08-02, live bake).
 *
 * THE ISSUE IT PROVES OR DISPROVES: after §4D_ROOF_LOAD_PATH (#1120), §4D_WALLS_BEFORE_ROOF (#1128)
 * and §4D_BAND_MONOTONIC (#1129), does a helipad-hut roof slab STILL start before the walls that
 * carry it? Measured on real Hospital geometry through the SHIPPED scheduler, not asserted.
 *
 * It does NOT trust the promotion either: it reports, per roof-role slab, whether the load-path
 * promotion fired, which walls carry it geometrically, and the signed lag between the roof's start
 * and its last carrier's end. Negative lag = the roof lands before its own walls = the defect.
 *
 * RUN: node audit_helipad_roof_walls.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const SG = require('./viewer/schedule_gate.js');

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§HELIPAD SKIP — no DB at ' + DB); process.exit(0); }

// Same rule table the band-monotonic witness uses, so the two audits are comparable.
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

// ── Replicate time_machine.js's §4D_ROOF_LOAD_PATH M1 + §4D_WALLS_BEFORE_ROOF M4 promotion ──
// (time_machine.js:3331-3398). Reproduced here rather than imported because injectGantt is not a
// module; any divergence would show up as a promotion count different from the shipped log line.
const LP_GAP = 0.5;
const lpWalls = elements.filter(e => e.cls.indexOf('IfcWall') === 0);
const xy = (a,b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const lpSlabs = [], lpSeed = [];
elements.forEach(el => {
  if (el.cls !== 'IfcSlab') return;
  const carriers = lpWalls.filter(w => xy(el, w));
  if (!carriers.length) return;
  let midSum = 0; const above = [];
  carriers.forEach(w => { midSum += (w.base_z + w.top_z) / 2; if (w.base_z >= el.top_z) above.push(w); });
  const clauseA = el.base_z > midSum / carriers.length;
  lpSlabs.push({ el, clauseA, above, carriers });
  if (clauseA && !above.length) { el.seq = 8; el.phase = 'Architecture'; el.__seed = true; lpSeed.push(el); }
});
let m4 = 0;
if (lpSeed.length) lpSlabs.forEach(rec => {
  const el = rec.el;
  if (el.seq === 8 || !rec.clauseA || !rec.above.length) return;
  for (const w of rec.above) {
    let capped = false;
    for (const C of lpSeed) if (xy(C, w) && C.base_z >= w.base_z && C.base_z <= w.top_z + LP_GAP) { capped = true; break; }
    if (!capped) return;
  }
  el.seq = 8; el.phase = 'Architecture'; el.__m4 = true; m4++;
});
console.log('§HELIPAD_PROMOTE seed=' + lpSeed.length + ' m4=' + m4 + ' total=' + (lpSeed.length + m4));

// ── Run the SHIPPED scheduler ──
const baseMs = Date.now() - 200 * 86400000;
const sched = SG.computeSchedule(elements, baseMs, 1, {});
const DAY = 86400000;
const roofs = elements.filter(e => e.cls === 'IfcSlab' && e.seq === 8);
console.log('§HELIPAD_ROOFS n=' + roofs.length);

// ── For each roof-role slab, the walls that CARRY it, by the same geometry wallGate() uses ──
const EPS = 0.05, GAP = 0.5;
let defects = 0;
const rows = roofs.map(r => {
  const carriers = lpWalls.filter(w => w.base_z < r.base_z - EPS && w.top_z >= r.base_z - GAP && xy(w, r));
  let lastEnd = 0, lastGuid = '';
  carriers.forEach(w => { const s = sched[w.guid]; if (s && s.end > lastEnd) { lastEnd = s.end; lastGuid = w.guid; } });
  const rs = sched[r.guid];
  const lagDays = carriers.length ? (rs.start - lastEnd) / DAY : null;
  if (lagDays !== null && lagDays < -0.0001) defects++;
  return { guid: r.guid, storey: r.storey, base_z: r.base_z.toFixed(2), area: ((r.x1-r.x0)*(r.y1-r.y0)).toFixed(0),
           how: r.__seed ? 'seed' : (r.__m4 ? 'M4' : '?'), carriers: carriers.length,
           lagDays: lagDays === null ? 'NO CARRIER' : lagDays.toFixed(1), lastGuid };
});
rows.sort((a,b) => parseFloat(a.lagDays) - parseFloat(b.lagDays));
console.log('\nguid                    how   storey     base_z   area  carriers  lagDays(roofStart - lastWallEnd)');
rows.forEach(r => console.log(
  r.guid.padEnd(23) + r.how.padEnd(6) + String(r.storey).padEnd(11) + String(r.base_z).padStart(7) +
  String(r.area).padStart(7) + String(r.carriers).padStart(10) + String(r.lagDays).padStart(12)));

// ── The specific helipad huts the user is looking at ──
const HUTS = ['3eq15PZlbCi8$6xdfFtxpB', '3Vxmv9vT1DBOVGP9f4HeYO'];
console.log('\n§HELIPAD_HUTS — the two boxes on the deck');
HUTS.forEach(g => {
  const r = rows.find(x => x.guid === g);
  console.log('  ' + g + ' -> ' + (r ? 'roof-role=' + r.how + ' carriers=' + r.carriers + ' lagDays=' + r.lagDays
                                     : 'NOT PROMOTED to roof role (seq stayed ' + (elements.find(e=>e.guid===g)||{}).seq + ')'));
});

console.log('\n§HELIPAD_VERDICT roofsBeforeTheirWalls=' + defects + '/' + roofs.length);
process.exit(defects ? 1 : 0);
