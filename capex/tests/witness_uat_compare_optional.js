#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-UAT-COMPARE-OPTIONAL (spec prompts/CAPEX_DASHBOARD.md §5.90). READ THE LOG: verdict = §UATOPT_VERDICT.
// ISSUE it proves/disproves: "the checker fails a tester who followed the guide exactly, because a row only an optional step writes is counted"
// (guide B2.2c's Accept all is optional; only it makes building.type a stated choice, and only a stated type writes project_metadata building_type).
// O1 reference with building_type, tester without -> B2.8 PASS (the issue) · O2 tester missing a DIFFERENT metadata row -> FAIL (no blanket skip) ·
// O3 one element row changed -> FAIL · O4 equal -> PASS · O5 (only when UAT_OPT_REF + UAT_OPT_YOURS are given) a real reference/tester pair -> PASS.
// UAT_OPT_BREAK=1 restores the pre-§5.90 count: O1 must FAIL. Usage: node capex/tests/witness_uat_compare_optional.js
'use strict';
const fs = require('fs'), path = require('path'), log = console.log;
const UC = require(path.join(__dirname, '..', 'uat', 'uat_compare.js'));
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §UATOPT ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
(async () => {
  const SQL = await require('sql.js')();
  const summary = db => UC.summarizeDb(q => { const r = db.exec(q); return r.length ? r[0].values : []; });
  const make = (meta, els) => { const db = new SQL.Database();
    db.run("CREATE TABLE project_metadata (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, material_name TEXT); CREATE TABLE element_world_bbox (guid TEXT, minX REAL, maxX REAL, minY REAL, maxY REAL, minZ REAL, maxZ REAL)");
    Object.keys(meta).forEach(k => db.run('INSERT INTO project_metadata VALUES (?, ?)', [k, meta[k]]));
    els.forEach(e => { db.run('INSERT INTO elements_meta VALUES (?, ?, ?)', [e[0], e[1], e[2]]); db.run('INSERT INTO element_world_bbox VALUES (?, ?, ?, ?, ?, ?, ?)', [e[0]].concat(e[3])); });
    const s = summary(db); db.close(); return s; };
  // the real export's four common rows + the one only Accept all adds (values as measured 2026-11-19, FILM_UAT_GUIDE §5.10)
  const META = { project_name: 'Bonsai model', import_date: '2026-11-15T02:34:14.788Z', building_name: 'SHED', source_file: 'SHED.ifc' };
  const ELS = [['g1', 'IfcColumn', 'Steel', [0, 0.2, 0, 0.2, 0, 3]], ['g2', 'IfcBeam', 'Steel', [0, 6, 0, 0.2, 3, 3.3]], ['g3', 'IfcSlab', 'Concrete', [0, 6, 0, 10, -0.15, 0]]];
  const ref = make(Object.assign({}, META, { building_type: 'General' }), ELS);
  const v = (t, r) => UC.compareDb(t, r);
  const o1 = v(make(Object.assign({}, META, { import_date: '2026-11-19T11:26:40.203Z' }), ELS), ref);
  ck('O1 tester skipped the optional Accept all (no building_type) -> PASS', o1.verdict === 'PASS', { verdict: o1.verdict, tables: o1.tables });
  const m2 = Object.assign({}, META); delete m2.building_name; const o2 = v(make(Object.assign(m2, { building_type: 'General' }), ELS), ref);
  ck('O2 tester missing building_name (a different row) -> FAIL', o2.verdict === 'FAIL', { verdict: o2.verdict, tables: o2.tables });
  const e3 = ELS.map(e => e.slice()); e3[1] = ['g2', 'IfcBeam', 'Steel', [0, 6.01, 0, 0.2, 3, 3.3]]; const o3 = v(make(Object.assign({}, META), e3), ref);
  ck('O3 one element 10 mm longer -> FAIL', o3.verdict === 'FAIL', { verdict: o3.verdict, onlyYours: o3.onlyYours.length });
  const o4 = v(make(Object.assign({}, META, { building_type: 'General' }), ELS), ref);
  ck('O4 equal (Accept all pressed) -> PASS', o4.verdict === 'PASS', { verdict: o4.verdict });
  if (process.env.UAT_OPT_REF && process.env.UAT_OPT_YOURS) {
    const real = f => { const db = new SQL.Database(new Uint8Array(fs.readFileSync(f))); const s = summary(db); db.close(); return s; };
    const o5 = v(real(process.env.UAT_OPT_YOURS), real(process.env.UAT_OPT_REF));
    ck('O5 the real pair (reference vs the tester export) -> PASS', o5.verdict === 'PASS', { verdict: o5.verdict, elements: o5.elements, reference: o5.reference, tables: o5.tables });
  } else log('  §UATOPT O5 SKIP (no UAT_OPT_REF/UAT_OPT_YOURS: the real pair is not judged)');
  log('§UATOPT_VERDICT ' + (!judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + (process.env.UAT_OPT_BREAK === '1' ? ' (BREAK: the pre-§5.90 count)' : ''));
  process.exit(fails || !judged ? 1 : 0);
})();
