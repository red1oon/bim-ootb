#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BUILDING-TYPE-EXPORT: prompts/STRUCTURAL_SANITY.md T13.5. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: until T13.5 an exported model carried no building type, so every model read "building type: not stated" in the rule panel.
 *   B1 WRITE    — build(..., {buildingType:'Farming Shed'}) puts Pset_BuildingCommon.OccupancyType on the IfcBuilding (re-read from the IFC bytes).
 *   B2 DB       — the extractor maps it to project_metadata building_type = 'Farming Shed' (the key viewer/rule_checklist.js reads).
 *   B3 NOT-GUESSED — no type stated -> NO Pset and NO building_type row (never a default "General").
 *   B4 CONTROL  — a blank / whitespace type is treated as not stated (same as B3).
 *   B5 STATED-ONLY — the CLI's statedType(): file / sheet / choice count, default / type do not.
 * Falsify: delete the buildingType(...) call in dxf2ifc.js build() -> B1 + B2 RED.
 * Usage: NODE_PATH=<dir with web-ifc, sql.js> node modeller/tests/witness_building_type_export.js
 */
'use strict';
const path = require('path'), fs = require('fs');
const WebIFC = require('web-ifc'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), Core = require(path.join(M, 'dxf2bim/ifc_extract_core.js')), IFC = require(path.join(M, 'dxf2ifc.js'));
let fail = 0; const check = (id, issue, ok, d) => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const box = { class: 'IfcWall', name: 'W1', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]], storey: 'L1', storey_elev: 0 };
(async () => {
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init();
  const run = async bt => {
    const r = IFC.build([box], { api, WebIFC, name: 't.ifc', buildingType: bt });
    const text = Buffer.from(r.bytes).toString('latin1'), hasPset = /Pset_BuildingCommon/.test(text), occ = (/'OccupancyType',\$,IFCLABEL\('([^']*)'\)/.exec(text) || [])[1] || null;
    const db = new SQL.Database(), logs = [];
    await Core.extractToDb({ WebIFC, ifcApi: await (async () => { const a = new WebIFC.IfcAPI(); await a.Init(); return a; })(), ifcData: new Uint8Array(r.bytes), db: Core.sqljsDb(db), Buf: Core.browserBuf, buildingName: 'T', sourceName: 't.ifc', log: m => logs.push(m) });
    const q = db.exec("SELECT value FROM project_metadata WHERE key='building_type'"), row = q.length ? q[0].values[0][0] : null;
    return { hasPset, occ, row, log: logs.filter(l => /§BUILDING_TYPE/.test(l)) };
  };
  const a = await run('Farming Shed'); console.log('  ' + JSON.stringify(a));
  check('B1 WRITE', 'the IFC carries no OccupancyType for a stated type', a.hasPset && a.occ === 'Farming Shed', `pset=${a.hasPset} OccupancyType=${a.occ}`);
  check('B2 DB', 'the extractor does not map OccupancyType to project_metadata building_type', a.row === 'Farming Shed' && a.log.length === 1, `building_type=${a.row} log=${a.log}`);
  const n = await run(null); console.log('  ' + JSON.stringify(n));
  check('B3 NOT-GUESSED', 'a type appears with none stated', !n.hasPset && n.row === null && /not stated/.test(n.log[0] || ''), `pset=${n.hasPset} building_type=${n.row} log=${n.log}`);
  const b = await run('   ');
  check('B4 CONTROL', 'a blank type is written as if stated', !b.hasPset && b.row === null, `pset=${b.hasPset} building_type=${b.row}`);
  const src = fs.readFileSync(path.join(M, 'dxf2bim_cli.js'), 'utf8'), fn = new Function('return (' + /function statedType\(R\) \{[\s\S]*?\n/.exec(src)[0].replace(/\}\s*$/, '}') + ')')();
  const T = s => fn({ defaults_table: [{ key: 'building.type', value: 'Farming Shed', source: s }] });
  check('B5 STATED-ONLY', 'a default or type-override counts as a stated type', ['file', 'sheet', 'choice'].every(s => T(s) === 'Farming Shed') && T('default') === null && T('type') === null, ['file', 'sheet', 'choice', 'default', 'type'].map(s => s + '=' + T(s)).join(' '));
  console.log(fail ? 'FAIL ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
