#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SPACE-RECORD, prompts/IMPORT_KEEPS_IFCSPACE.md "Second part". Read the log after every run.
// ISSUE THIS PROVES OR DISPROVES: the walker saw no rooms on a browser-imported file and only room numbers on a python-extracted one, so a room schedule never reached them.
// Reading the record of the rooms a file states must fix that, must leave every DB without the record exactly as it walks today, and must not write what the Find panel owns.
// Runs the SHIPPED spacesOf / dwWalk on the real rules DBs. Generic: no project's names, the fixture rooms are invented labels for a code path, not rules.
// Command: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_space_record.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), DW = require(path.join(ROOT, 'modeller', 'disc_walker.js'));
const B = path.join(process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), 'buildings');
let fail = 0, pass = 0; const log0 = console.log, say = (...a) => log0(...a);
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; say((ok ? '  PASS ' : '  ✗ FAIL ') + name + ' got=' + JSON.stringify(got) + (ok ? '' : ' want=' + JSON.stringify(want))); };
const RECORD = 'CREATE TABLE ifc_spaces (guid TEXT PRIMARY KEY, name TEXT, long_name TEXT, storey TEXT, object_type TEXT, predefined_type TEXT, center_x REAL, center_y REAL, center_z REAL, size_x REAL, size_y REAL, size_z REAL)';
const room = (d, g, name, ln, ot, x, sz) => d.run('INSERT INTO ifc_spaces VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [g, name, ln, 'L1', ot, null, x, 0, 1.5, sz, sz, 3]);
const quiet = f => { const lines = []; const c = console.log; console.log = (...x) => lines.push(x.join(' ')); try { return { r: f(), lines }; } finally { console.log = c; } };
const sig = w => JSON.stringify((w.placements || []).map(p => [p.device || p.ifc_class, +(+p.x).toFixed(3), +(+p.y).toFixed(3), +(+p.z).toFixed(3)]));
const dump = (d, t) => JSON.stringify(d.exec('SELECT * FROM ' + t + ' ORDER BY 1'));
const inferred = d => {
  d.run('CREATE TABLE spatial_structure (guid TEXT PRIMARY KEY, type TEXT, name TEXT, parent_guid TEXT, object_type TEXT, predefined_type TEXT, center_x REAL, center_y REAL, center_z REAL, size_x REAL, size_y REAL, size_z REAL)');
  d.run("INSERT INTO spatial_structure VALUES ('RM_1','IfcSpace','R1',NULL,'COMPILED','INTERNAL',0,0,1.5,5,5,3)");
};
const base = d => {
  d.run('CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT)');
  d.run('CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL)');
};
(async () => {
  const SQL = await initSqlJs(), load = f => new SQL.Database(new Uint8Array(fs.readFileSync(f)));
  const dup = load(path.join(ROOT, 'modeller', 'duplex_rules.db')); dup._dwFile = 'duplex_rules.db';
  DW.dwOpen(dup); DW.dwScheduleSource(null);

  say('S2 only inferred rooms: the walker has none; the record gives it rooms (red control = the same DB without it)');
  const a = new SQL.Database(); base(a); inferred(a);
  eq('without the record: 0 rooms', DW.spacesOf(a).length, 0);
  a.run(RECORD); room(a, 'g1', '01-01', 'Staff Toilet', null, 0, 4);
  const withRec = quiet(() => DW.spacesOf(a));
  eq('with the record: 1 room', withRec.r.length, 1);
  eq('source is logged', withRec.lines.some(l => /§DW-SPACE-SOURCE source=ifc_spaces rooms=1 named=1 noBox=0/.test(l)), true);

  say('S3 label order: long name, else object type, else name');
  const b = new SQL.Database(); base(b); b.run(RECORD);
  room(b, 'l', '01-02', 'Kitchen', 'Office', 0, 4); room(b, 'o', '01-03', '', 'Office', 10, 4); room(b, 'n', '01-04', null, null, 20, 4);
  const labels = {}; quiet(() => DW.spacesOf(b)).r.forEach(s => { labels[s.guid] = s.label; });
  eq('labels', labels, { l: 'Kitchen', o: 'Office', n: '01-04' });

  say('S4 a room with no usable box is skipped and counted');
  room(b, 'nb', '01-05', 'Bathroom', null, null, null);
  const s4 = quiet(() => DW.spacesOf(b));
  eq('NULL box skipped', s4.r.some(s => s.guid === 'nb'), false);
  eq('counted in the log', s4.lines.some(l => /noBox=1/.test(l)), true);
  const allNull = new SQL.Database(); base(allNull); inferred(allNull); allNull.run(RECORD); room(allNull, 'nb', 'x', 'Bathroom', null, null, null);
  eq('a record with no box falls through to the older sources', quiet(() => DW.spacesOf(allNull)).lines.some(l => /§DW-SPACE-SOURCE/.test(l)), false);

  say('S5 the record wins over both older sources');
  const c = new SQL.Database(); base(c); inferred(c);
  c.run("INSERT INTO spatial_structure VALUES ('real','IfcSpace','9-99',NULL,NULL,NULL,50,0,1.5,5,5,3)");
  c.run("INSERT INTO elements_meta VALUES ('em','IfcSpace','Old Name','L1','ARC')"); c.run("INSERT INTO element_transforms VALUES ('em',60,0,1.5,5,5,3,0,0,0)");
  eq('older source used without it', DW.spacesOf(c).map(s => s.guid), ['em']);
  c.run(RECORD); room(c, 'g1', '01-01', 'Kitchen', null, 0, 4);
  eq('record used with it', quiet(() => DW.spacesOf(c)).r.map(s => s.guid), ['g1']);

  say('S6 a schedule walk types and serves rooms from the record; room numbers alone serve none');
  const typedDb = names => {
    const d = new SQL.Database(); base(d); inferred(d); d.run(RECORD);
    names.forEach((n, i) => room(d, 'g' + i, '01-0' + i, n, null, i * 12, 5)); return d;
  };
  const named = typedDb(['Kitchen', 'Bathroom', 'Living Room']), numbersOnly = typedDb([null, null, null]);
  const w1 = quiet(() => DW.placeSchedule('ACMV', named, {})).r, w0 = quiet(() => DW.placeSchedule('ACMV', numbersOnly, {})).r;
  say('  named rooms: spacesUsed=' + w1.spacesUsed + ' placements=' + w1.placements.length + ' refused=' + JSON.stringify(w1.refused) + '; numbers only: spacesUsed=' + w0.spacesUsed);
  if (!w1.spacesUsed) { fail++; say('  ✗ FAIL VACUOUS: no room was served, so this judged nothing'); }
  else { pass++; say('  PASS long names reach the schedule, rooms served ' + w1.spacesUsed); }
  eq('room numbers alone serve no room', w0.spacesUsed, 0);

  say('S7 the walk leaves what the Find panel owns untouched');
  const before = dump(named, 'spatial_structure'); quiet(() => DW.placeSchedule('ACMV', named, {}));
  eq('spatial_structure unchanged', dump(named, 'spatial_structure') === before, true);

  say('S1 a real building with no record: the same walk with the code as with an empty table');
  const p = path.join(B, 'Duplex_extracted.db');
  if (!fs.existsSync(p) || fs.statSync(p).size < 1e5) { fail++; say('  ✗ FAIL INCONCLUSIVE: no real building held at ' + p); }
  else {
    const DX = load(p), run = () => quiet(() => DW.dwWalk('ACMV', DX, 'Duplex', { schedule: true })).r;
    const s0 = quiet(() => DW.spacesOf(DX)).r, w = run();
    say('  rooms=' + s0.length + ' placed=' + (w.placed || 0));
    if (!s0.length || !(w.placed > 0)) { fail++; say('  ✗ FAIL VACUOUS: the real building gave no rooms or placed nothing'); }
    else {
      const sigA = sig(w); DX.run(RECORD); const w2 = run();
      eq('identical with an empty record', sig(w2) === sigA, true);
      DX.run('DROP TABLE ifc_spaces');
    }
  }
  say('§W VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + ' of ' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
