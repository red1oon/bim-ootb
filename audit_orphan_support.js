#!/usr/bin/env node
/* ⚠ AUDIT — §SUPPORT_ORPHAN (prompts/GANTT_ACCURACY.md).
 *
 * THE ISSUE IT PROVES OR DISPROVES (user, 2026-08-03): "elements with NO valid carrier under the
 * strict §SUPPORT_ALL predicate should not schedule immediately/unconstrained — defer them until
 * some nearby support exists."  Before building any relaxed-proximity fallback, MEASURE the
 * population it would serve.  If it is dominated by things legitimately standing ON THE GROUND, a
 * fallback is over-engineering and this audit says so instead of a fallback being written blind.
 *
 * TRUE ORPHAN = zero incoming edges under the SAME strict predicate the engine extracts:
 *   carriers = structure (seq<=4) + IfcWall*, S.base_z < T.base_z - EPS, XY overlap, and
 *   rests-on: structure `S.top_z >= T.base_z - GAP`, walls `|S.top_z - T.base_z| <= GAP`.
 * This is DISTINCT from "carrier exists but not yet placed", which the DAG already handles.
 *
 * RUN: node audit_orphan_support.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§SUPPORT_ORPHAN SKIP — no test DB at ' + DB); process.exit(0); }

const RULES = { IfcFooting:{seq:1}, IfcPile:{seq:1}, IfcReinforcingBar:{seq:1}, IfcColumn:{seq:2},
  IfcBeam:{seq:3}, IfcMember:{seq:3}, IfcSlab:{seq:4}, IfcPlate:{seq:4}, IfcDuct:{seq:5}, IfcPipe:{seq:5},
  IfcCableCarrier:{seq:5}, IfcWall:{seq:6}, IfcWallStandardCase:{seq:6}, IfcDoor:{seq:7}, IfcCovering:{seq:8} };
const matchRule = c => { let b=null,l=0; for (const k in RULES) if (c.indexOf(k)>=0 && k.length>l){b=k;l=k.length;} return b?RULES[b]:{seq:6}; };

const csv = execSync(
  `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(t.center_x,0),COALESCE(t.center_y,0),` +
  `COALESCE(t.center_z,0),COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0),COALESCE(m.storey,'_UNKNOWN') ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
  { maxBuffer: 1 << 28 }).toString().trim().split('\n');
const elements = csv.map(line => {
  const a = line.split(','); if (a.length < 8) return null;
  const cls=a[1], cx=+a[2], cy=+a[3], cz=+a[4], bx=+a[5], by=+a[6], bz=+a[7];
  return { guid:a[0], cls, seq:matchRule(cls).seq, storey:(a[8]||'_UNKNOWN').replace(/"/g,''),
           x0:cx-bx/2, x1:cx+bx/2, y0:cy-by/2, y1:cy+by/2, base_z:cz-bz/2, top_z:cz+bz/2 };
}).filter(Boolean);

const CELL = 4, EPS = 0.05, GAP = 0.5;
const cellsOf = e => { const o=[]; for (let i=Math.floor(e.x0/CELL);i<=Math.floor(e.x1/CELL);i++)
  for (let j=Math.floor(e.y0/CELL);j<=Math.floor(e.y1/CELL);j++) o.push(i+','+j); return o; };
const overlap = (a,b) => a.x0<=b.x1 && a.x1>=b.x0 && a.y0<=b.y1 && a.y1>=b.y0;

const structGrid = {}, wallGrid = {};
elements.forEach((e,i) => {
  const g = e.seq <= 4 ? structGrid : (e.cls.indexOf('IfcWall') === 0 ? wallGrid : null);
  if (!g) return; cellsOf(e).forEach(c => (g[c] = g[c] || []).push(i));
});

// ⚠ NOT `Math.min(base_z)` — measured and wrong: one stray element sits at z=0 while the building's
// own lowest storey median is 168.8m (site datum), so a min-based ground put EVERY element "168m in
// the air" and made the airborne/grounded split meaningless. The 1st percentile is the model's real
// lowest working surface.
const _sortedZ = elements.map(e => e.base_z).sort((a, b) => a - b);
const GROUND = _sortedZ[Math.floor(_sortedZ.length * 0.01)];
const carriers = new Int32Array(elements.length);
elements.forEach((T,i) => {
  const promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
  const mark = {}; let n = 0;
  cellsOf(T).forEach(c => {
    (structGrid[c]||[]).forEach(j => { if (j===i||mark[j]) return; mark[j]=1; const S=elements[j];
      if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S,T)) n++; });
    (wallGrid[c]||[]).forEach(j => { if (j===i||mark[j]) return; mark[j]=1; const S=elements[j];
      if (!(S.base_z < T.base_z - EPS) || !overlap(S,T)) return;
      if (promotedSlab ? (S.top_z >= T.base_z - GAP) : (Math.abs(S.top_z - T.base_z) <= GAP)) n++; });
  });
  carriers[i] = n;
});

// An element within GROUND_BAND of the lowest base_z in the model is standing on the earth, not
// floating. That is not an orphan needing a fallback — it is the DAG's legitimate seed set.
const GROUND_BAND = 1.0;
const orphans = [], grounded = [];
elements.forEach((e,i) => { if (carriers[i] === 0) ((e.base_z - GROUND) <= GROUND_BAND ? grounded : orphans).push(e); });

const tally = (arr, f) => { const m={}; arr.forEach(e => m[f(e)] = (m[f(e)]||0)+1);
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+'='+v).join(' '); };

console.log(`§SUPPORT_ORPHAN nodes=${elements.length} groundZ=${GROUND.toFixed(2)}m noCarrier=${orphans.length+grounded.length}`);
console.log(`§SUPPORT_ORPHAN grounded(<=${GROUND_BAND}m above groundZ, legitimate DAG seeds)=${grounded.length} (${(100*grounded.length/elements.length).toFixed(1)}%)  ${tally(grounded,e=>e.cls)}`);
console.log(`§SUPPORT_ORPHAN TRUE_ORPHAN(airborne, zero carriers)=${orphans.length} (${(100*orphans.length/elements.length).toFixed(1)}%)  ${tally(orphans,e=>e.cls)}`);
console.log(`§SUPPORT_ORPHAN true-orphan height above ground: ` +
  [1,2,5,10,20,50].map(h => `<=${h}m:` + orphans.filter(e=>e.base_z-GROUND<=h).length).join(' ') +
  ` max=${orphans.length?Math.max(...orphans.map(e=>e.base_z-GROUND)).toFixed(1):0}m`);
console.log(`§SUPPORT_ORPHAN true-orphan by trade seq: ${tally(orphans,e=>'seq'+e.seq)}`);

// How far would a RELAXED fallback have to reach to find "some nearby support"?  For each true
// orphan, the vertical drop to the nearest structure/wall TOP that overlaps it in XY — measured, so
// any tolerance chosen later is read off this distribution instead of guessed.
const drops = [];
orphans.forEach(T => {
  let best = Infinity, mark = {};
  cellsOf(T).forEach(c => [structGrid[c]||[], wallGrid[c]||[]].forEach(arr => arr.forEach(j => {
    if (mark[j]) return; mark[j]=1; const S = elements[j];
    if (S.guid === T.guid || !overlap(S,T)) return;
    if (S.base_z < T.base_z - EPS) { const d = T.base_z - S.top_z; if (d >= 0 && d < best) best = d; }
  })));
  drops.push(best);
});
const reach = drops.filter(d => isFinite(d));
console.log(`§SUPPORT_ORPHAN relaxed-reach: XY-overlapping carrier exists below for ${reach.length}/${orphans.length};` +
  ` drop <=1m:${reach.filter(d=>d<=1).length} <=2m:${reach.filter(d=>d<=2).length} <=5m:${reach.filter(d=>d<=5).length}` +
  ` none-below-at-all=${drops.length-reach.length}`);
