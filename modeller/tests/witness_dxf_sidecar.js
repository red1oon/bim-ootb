#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-2D-SIDECAR: prompts/DXF2BIM_FOUNDATION_LANE.md F7. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the Viewer's building db has none of the six tables the 2D writer reads (measured on the OCI Duplex db); a self-contained `_2d.db` sidecar (one extraction: the six tables + the drawable classes) gives the writer everything on its own. Proven when the sheets written from the sidecar ALONE are byte-for-byte the sheets
 * written from the full db, for the whole building and for each angle family (wing).
 *   S1 CONTROL  — the db without the six tables cannot write a set (the writer needs them: the witness can see the gap).
 *   S2 SIDECAR  — the sidecar holds exactly the six tables, row counts equal the source; size reported against the db.
 *   S3 WHOLE    — whole-building sheets: same file names, same bytes as the full db.
 *   S4 WINGS    — every angle family (wingAngles) as a wing: same file names, same bytes.
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_sidecar.js <Node model .db>
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('sql.js');
const D = path.join(__dirname, '..', 'dxf2bim') + '/', S = require(D + 'std2d.js'), SC = require(D + 'std2d_sidecar.js');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const qf = db => sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.join('|') === kb.join('|') && ka.every(k => a[k] === b[k]); };
(async () => {
  const file = process.argv[2], SQL = await initSqlJs(), buf = new Uint8Array(fs.readFileSync(file));
  const full = new SQL.Database(buf), built = SC.build(SQL, full), side = new SQL.Database(built.bytes), bare = new SQL.Database(buf);
  SC.SIX.forEach(t => bare.run('DROP TABLE IF EXISTS ' + t));
  let threw = null; try { S.writeStdSet(qf(bare), 'X'); } catch (e) { threw = e.message; }
  check('S1', 'the db without the six tables cannot write a set', !!threw, threw ? 'refused: ' + threw.slice(0, 80) : 'WROTE A SET: the six tables are not what the writer needs');
  const counts = SC.SIX.map(t => [t, qf(full)('SELECT count(*) n FROM ' + t)[0].n, qf(side)('SELECT count(*) n FROM ' + t)[0].n]);
  check('S2', 'sidecar holds the six tables in full', counts.every(c => c[1] === c[2]) && !built.missing.length, counts.map(c => c[0] + ':' + c[2]).join(' ') + ' | missing=' + JSON.stringify(built.missing));
  const gz = require('zlib').gzipSync(Buffer.from(built.bytes)).length;
  check('S2b', 'size reported (must be a small share of the db for the Viewer to fetch it lazily)', built.bytes.length < buf.length, 'sidecar ' + (built.bytes.length / 1048576).toFixed(2) + ' MB, gzip ' + (gz / 1048576).toFixed(2) + ' MB, of a ' + (buf.length / 1048576).toFixed(1) + ' MB db (' + (100 * built.bytes.length / buf.length).toFixed(1) + '%)');
  const A = S.writeStdSet(qf(full), 'X'), Bm = S.writeStdSet(qf(side), 'X');
  check('S3', 'whole-building sheets from the sidecar ALONE are byte-equal to the full db', same(A.files, Bm.files), Object.keys(A.files).length + ' sheets');
  const fam = S.wingAngles(S.loadModel(qf(full), { add() {}, gap() {} }));
  fam.forEach(f => { const a = S.writeStdSet(qf(full), 'X', { wing: { angle: f.deg, name: 'W' } }), b = S.writeStdSet(qf(side), 'X', { wing: { angle: f.deg, name: 'W' } }); check('S4', 'wing ' + f.deg + ' deg sheets byte-equal', same(a.files, b.files), Object.keys(a.files).length + ' sheets'); });
  if (!fam.length) check('S4', 'at least one wing family to compare', false, 'no angle family in this model');
  console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
