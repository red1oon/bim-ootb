#!/usr/bin/env node
/* ⚠ AUDIT — THE DECIDING MEASUREMENT for §ELEMENT_CPM.
 *
 * THE ISSUE IT PROVES OR DISPROVES: three engines in a row have now hit the same wall — support=0
 * and band-inversions=0 refuse to hold together. Every attempt so far has assumed that is a
 * SCHEDULING problem. This audit asks whether it is a DATA problem instead:
 *
 *     does the storey ladder ever disagree with gravity?
 *
 * i.e. is there a support edge S -> T (S physically carries T) where S's collapsed storey ranks
 * ABOVE T's? If so, "all of trade k on rank r-1 before any of trade k on rank r" is not merely hard
 * to schedule — it is UNSATISFIABLE together with "nothing before its carrier", and no engine can
 * ever pass both gates. The band ladder is a per-storey MEDIAN base_z, but individual elements'
 * z-ranges overlap across storeys, which is exactly how that can happen.
 *
 * It also reports the same count against an ELEMENT-Z band (each element assigned to the band its
 * OWN base_z falls in, instead of its storey label's median) — because if that count is 0, the
 * contradiction is in the LABEL, not in the geometry, and the ladder is the thing to fix.
 *
 * RUN: node audit_rank_vs_support.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const SG = require('./viewer/schedule_gate.js');

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§RANK_VS_SUPPORT SKIP — no DB at ' + DB); process.exit(0); }

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

// ── the SAME ladder schedule_gate.js derives (median base_z per collapsed storey, _UNKNOWN excluded)
const collapse = SG.collapsePhase;
const byPhase = {};
elements.forEach(e => (byPhase[collapse(e.storey)] = byPhase[collapse(e.storey)] || []).push(e.base_z));
const rows = [];
for (const ph in byPhase) {
  if (ph === '_UNKNOWN' || /^unknown$/i.test(ph)) continue;
  const zs = byPhase[ph].slice().sort((a,b) => a-b);
  rows.push({ ph, z: zs[Math.floor(zs.length/2)] });
}
rows.sort((a,b) => a.z - b.z);
const rank = {}; rows.forEach((r,i) => rank[r.ph] = i);
console.log('§RANK_VS_SUPPORT ladder=' + rows.map(r => `${r.ph}@${r.z.toFixed(1)}`).join(' < '));

// element-z band: the band whose median z is nearest below the element's OWN base_z
const bounds = rows.map(r => r.z);
function zBand(e) {
  let b = 0;
  for (let i = 0; i < bounds.length; i++) if (e.base_z >= bounds[i]) b = i;
  return b;
}

// ── the SAME support edges the scheduler extracts
const CELL = SG.CELL || 4, EPS = 0.05, GAP = 0.5;
const xy = (a,b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const cellsOf = e => { const o=[]; for (let x=Math.floor(e.x0/CELL); x<=Math.floor(e.x1/CELL); x++)
  for (let y=Math.floor(e.y0/CELL); y<=Math.floor(e.y1/CELL); y++) o.push(x+'|'+y); return o; };
const sGrid = {}, wGrid = {};
elements.forEach((e,i) => {
  const tgt = e.seq <= 4 ? sGrid : (e.cls.indexOf('IfcWall') === 0 ? wGrid : null);
  if (tgt) cellsOf(e).forEach(c => (tgt[c] = tgt[c] || []).push(i));
});

let edges = 0, labelInv = 0, zInv = 0, sameTradeLabelInv = 0;
const byPair = {};
elements.forEach((T,ti) => {
  const promoted = (T.cls === 'IfcSlab' && T.seq > 4);
  const mark = {};
  for (const c of cellsOf(T)) {
    for (const [grid, isWall] of [[sGrid,false],[wGrid,true]]) {
      const arr = grid[c]; if (!arr) continue;
      for (const si of arr) {
        if (si === ti || mark[si]) continue; mark[si] = 1;
        const S = elements[si];
        if (!(S.base_z < T.base_z - EPS) || !xy(S,T)) continue;
        const bears = isWall ? (promoted ? (S.top_z >= T.base_z - GAP) : (Math.abs(S.top_z - T.base_z) <= GAP))
                             : (S.top_z >= T.base_z - GAP);
        if (!bears) continue;
        edges++;
        const rS = rank[collapse(S.storey)], rT = rank[collapse(T.storey)];
        if (rS != null && rT != null && rS > rT) {
          labelInv++;
          const key = `${collapse(S.storey)} carries ${collapse(T.storey)}`;
          byPair[key] = (byPair[key] || 0) + 1;
          if (S.seq === T.seq) sameTradeLabelInv++;
        }
        if (zBand(S) > zBand(T)) zInv++;
      }
    }
  }
});

console.log(`§RANK_VS_SUPPORT edges=${edges}`);
console.log(`§RANK_VS_SUPPORT byStoreyLabel  carrier_ranks_ABOVE_carried=${labelInv}` +
  ` (${(100*labelInv/edges).toFixed(1)}%)  sameTrade=${sameTradeLabelInv}`);
console.log(`§RANK_VS_SUPPORT byElementZ     carrier_band_ABOVE_carried=${zInv}` +
  ` (${(100*zInv/edges).toFixed(1)}%)`);
if (labelInv) {
  console.log('\nworst storey pairs (carrier storey ranks above the storey it carries):');
  Object.keys(byPair).sort((a,b) => byPair[b]-byPair[a]).slice(0,12)
    .forEach(k => console.log('  ' + String(byPair[k]).padStart(6) + '  ' + k));
}
console.log('\n§RANK_VS_SUPPORT_VERDICT ' + (labelInv === 0
  ? 'the storey ladder AGREES with gravity — band=0 and support=0 can hold together'
  : 'the storey ladder CONTRADICTS gravity in ' + labelInv + ' edges — "band-monotonic by storey" ' +
    'and "nothing before its carrier" cannot BOTH be zero, for any engine'));
