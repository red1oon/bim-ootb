#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves: "the GENERATED 4D fallback floats beams above unfinished columns."
 * Loads the REAL deployed scheduler (../schedule_gate.js) and runs it on REAL Hospital geometry.
 * Names the issue: counts floating beams under the OLD center-Z band gate vs the NEW support gate.
 * PASS iff NEW floatingBeams === 0. Read the §-log lines, not the exit code alone.
 *
 * DB: set SCHEDULE_TEST_DB, else defaults to the bim-compiler Hospital extract. SKIPs (exit 0) if absent.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const ScheduleGate = require("../viewer/schedule_gate.js");   // the REAL deployed module under test

const DB = process.env.SCHEDULE_TEST_DB || '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
if (!fs.existsSync(DB)) { console.log('§SUPPORT_CHECK SKIP — no test DB at ' + DB); process.exit(0); }

// faithful rules mirror of rates.js SEQUENCE_RULES + LABOR_RATES productivity (seq<=4 = structure)
const RULES = { IfcFooting:{seq:1,prod:6}, IfcPile:{seq:1,prod:4}, IfcReinforcingBar:{seq:1,prod:50},
  IfcColumn:{seq:2,prod:6}, IfcBeam:{seq:3,prod:8}, IfcMember:{seq:3,prod:10}, IfcSlab:{seq:4,prod:35},
  IfcPlate:{seq:4,prod:12}, IfcDuct:{seq:5,prod:18}, IfcPipe:{seq:5,prod:25}, IfcCableCarrier:{seq:5,prod:30},
  IfcWall:{seq:6,prod:12}, IfcWallStandardCase:{seq:6,prod:12}, IfcDoor:{seq:7,prod:6}, IfcCovering:{seq:8,prod:20} };
const DEF = { seq:6, prod:10 };
const matchRule = c => { let b=null,l=0; for (const k in RULES) if (c.indexOf(k)>=0 && k.length>l){b=k;l=k.length;} return b?RULES[b]:DEF; };

const csv = execSync(
  `sqlite3 -noheader -csv "${DB}" "SELECT m.guid,m.ifc_class,COALESCE(t.center_z,0),COALESCE(t.bbox_z,0) ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
  { maxBuffer: 1 << 28 }).toString().trim().split('\n');
const elements = csv.map(line => {
  const m = line.match(/^([^,]+),([^,]+),([^,]+),([^,]+)$/); if (!m) return null;
  const cls = m[2], cz = parseFloat(m[3])||0, bz = parseFloat(m[4])||0, r = matchRule(cls);
  return { guid:m[1], cls, base_z:cz-bz/2, top_z:cz+bz/2, cz, seq:r.seq, resource:cls,
           installSecs: r.prod>0?Math.round(28800/r.prod):120 };
}).filter(Boolean);
const beamN = elements.filter(e=>e.cls==='IfcBeam').length;
console.log(`§WITNESS_LOAD elements=${elements.length} beams=${beamN} cols=${elements.filter(e=>e.cls==='IfcColumn').length}`);

// OLD gate (center-Z band, "band N waits N-1") — inline, names the issue
function schedOld(els){
  const E=els.map(e=>({...e,band:Math.floor(e.cz/3)})).sort((a,b)=>(Math.floor(a.cz/3)-Math.floor(b.cz/3))||(a.seq-b.seq)||(a.cz-b.cz));
  const rc={},bsd={},bd={};
  const run=el=>{const rk=el.seq+'|'+el.band;let e=rc[rk]||0;for(let p=1;p<el.seq;p++){const k=el.band+'|'+p;if(bsd[k]>e)e=bsd[k];}if(el.band>0&&bd[el.band-1]>e)e=bd[el.band-1];const end=e+el.installSecs*1000;el.start=e;el.end=end;rc[rk]=end;const sk=el.band+'|'+el.seq;if(!(bsd[sk]>end))bsd[sk]=end;if(!(bd[el.band]>end))bd[el.band]=end;};
  E.filter(e=>e.seq<=4).forEach(run);E.filter(e=>e.seq>4).forEach(run);
  const out={};E.forEach(e=>out[e.guid]={start:e.start,end:e.end});return out;
}

const oldSched = schedOld(elements);
const oldFloat = ScheduleGate.auditFloating(elements, oldSched, e=>e.cls==='IfcBeam');
const newSched = ScheduleGate.computeSchedule(elements, 0, 1);            // the REAL deployed gate
const newFloat = ScheduleGate.auditFloating(elements, newSched, e=>e.cls==='IfcBeam');

console.log(`§SUPPORT_CHECK OLD(center-band) floatingBeams=${oldFloat}/${beamN}`);
console.log(`§SUPPORT_CHECK NEW(support-gate) floatingBeams=${newFloat}/${beamN}  (0 = Z solved)`);

if (newFloat !== 0) { console.error(`FAIL — support gate still floats ${newFloat} beams`); process.exit(1); }
if (oldFloat === 0) { console.error('INCONCLUSIVE — old gate showed 0 floats; test cannot prove the fix'); process.exit(1); }
console.log(`PASS — support gate eliminates floating beams (${oldFloat} → 0) on real Hospital geometry`);
