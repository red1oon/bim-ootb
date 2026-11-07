#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-IFC-STOREYS. SCOPE: bim-compiler prompts/MODELLER_MASTER.md §G3 SPEC. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: an imported file's own storey Elevation was never kept, and a federated drop mixes units. Is the ladder in metres, in the geometry's frame, and refused when it is not?
// Usage: node witness_ifc_storeys.js [--ifc a.ifc --ifc b.ifc] [--patched db --run run.json --run-axis run.json]   (real set is optional, stated when absent).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const WebIFC = require(path.join(NM, 'web-ifc'));
const S = require('../ifc_declared_storeys.js');
const SG = require('../schedule_gate.js'); global.ScheduleGate = SG; const SA = require('../schedule_author.js');
const arg = n => { const o = []; process.argv.forEach((a, i) => { if (a === n) o.push(process.argv[i + 1]); }); return o; };
let pass = 0, fail = 0; const chk = (id, ok, d) => { console.log('§W_STOREY ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };
const norm = nm => { const low = String(nm).toLowerCase(); for (const suf of [' ceiling', ' tos', ' t.o.s.', ' top of steel', ' soffit']) if (low.endsWith(suf)) return String(nm).slice(0, -suf.length).trim(); return String(nm); };   // import_worker.js normalizeStorey

// A minimal IFC4 file with one length unit and the storeys given.
function step(unitLines, unitRef, storeys) {
  const st = storeys.map((s, i) => `#${100 + i}=IFCBUILDINGSTOREY('${String(i).padStart(22, '0')}',$,'${s[0]}',$,$,$,$,$,.ELEMENT.,${s[1]});`).join('\n');
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('t','',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${unitLines}\n#50=IFCUNITASSIGNMENT((${unitRef}));\n${st}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
const M = '#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);', MM = '#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);';
const FT = '#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\n#2=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);\n#3=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#1);\n#4=IFCCONVERSIONBASEDUNIT(#2,.LENGTHUNIT.,\'FOOT\',#3);';

(async () => {
  const api = new WebIFC.IfcAPI(); api.SetWasmPath(path.join(NM, 'web-ifc') + '/', true); await api.Init();
  const read = (txt, z) => { const id = api.OpenModel(new TextEncoder().encode(txt)); const r = S.read(api, id, WebIFC, norm, z || 0); api.CloseModel(id); return r; };
  // Hand calculation: 3 m = 3; 3000 mm = 3; 10 ft x 0.3048 = 3.048.
  const a = read(step(M, '#1', [['L1', '3.']]));
  chk('U1 metres: Elevation 3. reads 3.0', a.rows[0].elevation_attr_m === 3 && a.scale === 1, JSON.stringify(a.rows[0]));
  const b = read(step(MM, '#1', [['L1', '3000.'], ['L2', '3999.9999999999995']]));
  chk('U2 millimetres: 3000. reads 3.0, and float noise is one floor', b.rows[0].elevation_attr_m === 3 && b.rows[1].elevation_attr_m === 4 && b.scale === 0.001, JSON.stringify(b.rows.map(r => r.elevation_attr_m)));
  const c = read(step(FT, '#4', [['L1', '10.']]));
  chk('U3 feet: 10. x 0.3048 reads 3.048', c.rows[0].elevation_attr_m === 3.048, 'scale=' + c.scale + ' z=' + c.rows[0].elevation_attr_m);
  const d = read(step(M, '#1', [['Level 2', '6.'], ['Level 2 Ceiling', '8.5']]));
  chk('U4 a folded reference plane is no rung, and is counted', d.rows.length === 1 && d.rows[0].name === 'Level 2' && d.refPlanes === 1, JSON.stringify(d.rows.map(r => r.name)) + ' refPlanes=' + d.refPlanes);
  const e = read(step(M, '#1', [['L1', '5.']]), 2);
  chk('U5 the import z offset puts the row in the geometry frame', e.rows[0].elevation_attr_m === 3, 'z=' + e.rows[0].elevation_attr_m);
  const f = read(step('#1=IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.);', '#1', [['L1', '5.']]));
  chk('U6 no length unit: nothing assumed, the row is skipped and counted', f.scale === null && f.rows.length === 0 && f.skipped === 1, 'skipped=' + f.skipped);
  // Frame test: the owner's judge, on the new candidate.
  const SQL = await require(path.join(NM, 'sql.js'))();
  const mk = (rows) => { const db = new SQL.Database(); db.run('CREATE TABLE spatial_structure (guid TEXT, type TEXT, name TEXT, center_z REAL)'); db.run("INSERT INTO spatial_structure VALUES ('x','IfcBuildingStorey','C0',0.5),('y','IfcBuildingStorey','C1',6.5)");
    if (rows) { db.run('CREATE TABLE storey_elevation (guid TEXT PRIMARY KEY, name TEXT, elevation_attr_m REAL, placement_z_m REAL)'); rows.forEach(r => db.run('INSERT INTO storey_elevation VALUES (?,?,?,NULL)', [r[0], r[0], r[1]])); } return db; };
  const ez = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const none = SA._storeyDatumCandidates(mk(null));
  chk('S1 no table: the candidates are what they were', none.length === 2 && none[0].source === 'elevation' && none[1].source === 'center_z' && SA._chooseStoreyDatum(none, ez).source === 'center_z', none.map(c => c.source).join(','));
  const good = SA._chooseStoreyDatum(SA._storeyDatumCandidates(mk([['G', 0], ['L1', 4.8], ['R', 9.05]])), ez);
  chk('S2 a declared ladder in metres goes ahead of a compiled rung', good.source === 'storey_elevation' && good.ladder.length === 3, good.source + ':' + good.ladder.map(r => r.z).join(','));
  // RED: wholly out of frame (all rungs above the geometry) must be refused; this is what the frame test CAN see.
  const red = SA._chooseStoreyDatum(SA._storeyDatumCandidates(mk([['G', 4000], ['L1', 4800], ['R', 9050]])), ez);
  chk('S3 RED: a ladder wholly out of the geometry frame is refused', red.source !== 'storey_elevation', 'chosen=' + red.source + ' mode=' + red.mode);
  // LIMIT, stated not hidden: the median test cannot see a unit error when the wrong span still contains the median. The unit reader (U1-U3, R1) is the only guard.
  const lim = SA._chooseStoreyDatum(SA._storeyDatumCandidates(mk([['G', 0], ['L1', 4800], ['R', 9050]])), ez);
  console.log('§W_STOREY LIMIT a millimetre ladder read at scale 1 with rung 0 still passes the frame test: chosen=' + lim.source + '. So U1-U3 + R1 guard the unit, not the frame test.');
  // Real set, optional: the web-ifc reading against the independent STEP-text reading.
  const ifcs = arg('--ifc');
  if (!ifcs.length) console.log('§W_STOREY REAL INCONCLUSIVE no --ifc given, the real-file legs were not judged');
  else {
    const patch = cp.execFileSync('python3', ['-P', path.join(__dirname, '..', '..', 'tools', 'ifc_storeys_patch.py')].concat(ifcs), { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
    const py = {}; patch.split('\n').forEach(l => { const m = /^INSERT OR REPLACE INTO storey_elevation VALUES \('([^']*)','(.*?)',([-\d.e]+),/.exec(l); if (m) py[m[1]] = +m[3]; });
    let n = 0, worst = 0;
    ifcs.forEach(file => { const id = api.OpenModel(new Uint8Array(fs.readFileSync(file)), { COORDINATE_TO_ORIGIN: false }); const r = S.read(api, id, WebIFC, norm, 0); api.CloseModel(id);
      console.log('§W_STOREY REAL file unitScale=' + r.scale + ' rows=' + r.rows.length + ' skipped=' + r.skipped);
      r.rows.forEach(x => { n++; worst = Math.max(worst, Math.abs(x.elevation_attr_m - py[x.guid])); }); });
    chk('R1 two independent readers agree on every storey of the real files', n > 0 && worst < 1e-9, 'storeys=' + n + ' worstDiff=' + worst);
  }
  const pdb = arg('--patched')[0];
  if (pdb) {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(pdb)));
    const lad = db.exec('SELECT DISTINCT elevation_attr_m FROM storey_elevation ORDER BY 1')[0].values.map(v => v[0]);
    chk('R2 ladder strictly rising in metres, inside a sane building height', lad.every((z, i) => !i || z > lad[i - 1]) && lad[lad.length - 1] < 1000, lad.join(' '));
    const labels = {}; db.exec("SELECT storey, count(*) FROM elements_meta GROUP BY 1")[0].values.forEach(v => labels[v[0]] = v[1]);
    const zOf = {}; db.exec('SELECT name, elevation_attr_m FROM storey_elevation')[0].values.forEach(v => zOf[v[0]] = v[1]);
    const nameOfZ = {}; Object.keys(zOf).forEach(k => (nameOfZ[zOf[k]] = nameOfZ[zOf[k]] || []).push(k));
    [['ladder only (shipped default)', arg('--run')[0]], ['ladder + deriver axis (opt-in)', arg('--run-axis')[0]]].forEach(([lab, f]) => {
      if (!f) return; const r = JSON.parse(fs.readFileSync(f)), have = new Set(r.tasks.map(t => t.storey));
      const missing = Object.keys(labels).filter(k => zOf[k] != null && !nameOfZ[zOf[k]].some(n => have.has(n)));
      console.log('§W_STOREY OPEN ' + lab + ': declared storeys holding elements with no task of their rung = ' + missing.length + ' [' + missing.map(k => k + '×' + labels[k]).join(', ') + '] midairPlayed=' + r.playStats.midairPlayed + ' tasks=' + r.tasks.length);
    });
    console.log('§W_STOREY OPEN the choice between those two lines is a sequence ruling (§J.4), not judged here');
  } else console.log('§W_STOREY REAL INCONCLUSIVE no --patched db, the task legs were not judged');
  console.log('§W_STOREY VERDICT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§W_STOREY ERROR ' + (e && e.stack || e)); process.exit(1); });
