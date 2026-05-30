#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves: "the GENERATED 4D fallback floats beams/members/slabs above the
 * structure ACTUALLY under their XY footprint." Loads the REAL deployed scheduler
 * (../viewer/schedule_gate.js) and runs it on REAL Hospital geometry. Names the issue: counts
 * XY-floating structure under the OLD center-Z band gate vs the NEW XY-aware support gate.
 * PASS iff NEW floating === 0 for beams, members AND slabs. Read the §-log lines, not exit code alone.
 *
 * DB: set SCHEDULE_TEST_DB, else defaults to the bim-compiler Hospital extract. SKIPs (exit 0) if absent.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const ScheduleGate = require('../viewer/schedule_gate.js');   // the REAL deployed module under test

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§SUPPORT_CHECK SKIP — no test DB at ' + DB); process.exit(0); }

const RULES = { IfcFooting:{seq:1,prod:6}, IfcPile:{seq:1,prod:4}, IfcReinforcingBar:{seq:1,prod:50},
  IfcColumn:{seq:2,prod:6}, IfcBeam:{seq:3,prod:8}, IfcMember:{seq:3,prod:10}, IfcSlab:{seq:4,prod:35},
  IfcPlate:{seq:4,prod:12}, IfcDuct:{seq:5,prod:18}, IfcPipe:{seq:5,prod:25}, IfcCableCarrier:{seq:5,prod:30},
  IfcWall:{seq:6,prod:12}, IfcWallStandardCase:{seq:6,prod:12}, IfcDoor:{seq:7,prod:6}, IfcCovering:{seq:8,prod:20} };
const DEF = { seq:6, prod:10 };
const matchRule = c => { let b=null,l=0; for (const k in RULES) if (c.indexOf(k)>=0 && k.length>l){b=k;l=k.length;} return b?RULES[b]:DEF; };

const csv = execSync(
  `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(t.center_x,0),COALESCE(t.center_y,0),` +
  `COALESCE(t.center_z,0),COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0) ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
  { maxBuffer: 1 << 28 }).toString().trim().split('\n');
const elements = csv.map(line => {
  const a = line.split(','); if (a.length < 8) return null;
  const cls=a[1], cx=+a[2], cy=+a[3], cz=+a[4], bx=+a[5], by=+a[6], bz=+a[7], r=matchRule(cls);
  return { guid:a[0], cls, seq:r.seq, resource:cls, installSecs: r.prod>0?Math.round(28800/r.prod):120,
           x0:cx-bx/2, x1:cx+bx/2, y0:cy-by/2, y1:cy+by/2, base_z:cz-bz/2, top_z:cz+bz/2 };
}).filter(Boolean);
const n = c => elements.filter(e=>e.cls===c).length;
console.log(`§WITNESS_LOAD elements=${elements.length} beams=${n('IfcBeam')} members=${n('IfcMember')} slabs=${n('IfcSlab')}`);

// OLD gate (center-Z band, "band N waits N-1") — inline, names the issue
function schedOld(els){
  const E=els.map(e=>({...e,band:Math.floor(((e.base_z+e.top_z)/2)/3)})).sort((a,b)=>(a.band-b.band)||(a.seq-b.seq)||(a.base_z-b.base_z));
  const rc={},bsd={},bd={};
  const run=el=>{const rk=el.seq+'|'+el.band;let e=rc[rk]||0;for(let p=1;p<el.seq;p++){const k=el.band+'|'+p;if(bsd[k]>e)e=bsd[k];}if(el.band>0&&bd[el.band-1]>e)e=bd[el.band-1];const end=e+el.installSecs*1000;el.start=e;el.end=end;rc[rk]=end;const sk=el.band+'|'+el.seq;if(!(bsd[sk]>end))bsd[sk]=end;if(!(bd[el.band]>end))bd[el.band]=end;};
  E.filter(e=>e.seq<=4).forEach(run);E.filter(e=>e.seq>4).forEach(run);
  const out={};E.forEach(e=>out[e.guid]={start:e.start,end:e.end});return out;
}

const CL = ['IfcBeam','IfcMember','IfcSlab'];
const flt = (sched, cls) => ScheduleGate.auditFloating(elements, sched, e=>e.cls===cls);
const oldSched = schedOld(elements);
const newSched = ScheduleGate.computeSchedule(elements, 0, 1);   // the REAL deployed XY-aware gate

let oldTot = 0, newTot = 0;
CL.forEach(cl => { const o=flt(oldSched,cl), x=flt(newSched,cl); oldTot+=o; newTot+=x;
  console.log(`§SUPPORT_CHECK ${cl.padEnd(10)} OLD(center-band)=${o}/${n(cl)}  NEW(XY-gate)=${x}/${n(cl)}`); });

if (newTot !== 0) { console.error(`FAIL — XY-aware gate still floats ${newTot} structural elements`); process.exit(1); }
if (oldTot === 0) { console.error('INCONCLUSIVE — old gate showed 0 floats; test cannot prove the fix'); process.exit(1); }
console.log(`PASS — XY-aware support gate eliminates floating structure (${oldTot} → 0) on real Hospital geometry`);
