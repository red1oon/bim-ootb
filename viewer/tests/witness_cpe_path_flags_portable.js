#!/usr/bin/env node
// witness_cpe_path_flags_portable.js — W-CPE-FLAGS
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_FLAGS_PORTABLE).
// User, 2026-09-04: "the HHS silent i have set a stored path which are all those" — buildup, label
// and reveal ON — yet a CLI silent bake of that same .db resolved
//   §CLI_BAKE_RESOLVED source=db:cinema_path bands=4 total=61.0s buildup=0 roomTitle=0 reveal=0
// Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: the PORTABLE store (the building DB's `cinema_path` table)
// carried the path's geometry and beat seconds but NOT the four film flags, so a path saved with
// Ctrl+S travelled with every feature off while the IndexedDB working store kept them. This witness
// round-trips a real override through the SHIPPED writer and the SHIPPED reader over a real sql.js
// database and asserts the flags survive — and that a pre-flag .db still opens.
//
// Whitebox, no browser: `_writeCinemaPathTable` (viewer/scene.js) and `_cpeLoadFromDb`
// (viewer/effects.js) are SLICED OUT of the shipped files by brace matching and executed against
// stub A/transform objects — never re-typed, so this cannot pass against a copy that is not shipped.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HOME = require('os').homedir();
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));

const sceneSrc = fs.readFileSync(path.join(__dirname, '..', 'scene.js'), 'utf8');
const fxSrc = fs.readFileSync(path.join(__dirname, '..', 'effects.js'), 'utf8');

function sliceFn(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const writeSrc = sliceFn(sceneSrc, 'function _writeCinemaPathTable(');
const readSrc = sliceFn(fxSrc, 'function _cpeLoadFromDb(');

const OV_ON = {
  bands: [
    { c: { x: 0, y: 1, z: 2 }, d: { x: 1, y: 0, z: 0 }, len: 3, hold: 0 },
    { c: { x: 4, y: 5, z: 6 }, d: { x: 0, y: 0, z: 1 }, len: 7, hold: 2.5 }
  ],
  _total: 61.0, diveSec: 1.8, spinSec: 0, outSec: 21.8, riseSec: 2.7,
  buildup: true, roomTitle: true, reveal: true, dayCounter: 'bl'
};
const OV_OFF = Object.assign({}, OV_ON, { buildup: false, roomTitle: false, reveal: false, dayCounter: null });

function roundTrip(SQL, ov, legacy) {
  const db = new SQL.Database();
  const idf = (x, y, z) => ({ ix: x, iy: y, iz: z, x, y, z });
  const A = {
    _cinemaPathEdit: ov,
    _getCinemaPathEdit: () => ov,
    three2ifc: idf, three2ifcDir: idf, ifc2three: idf, ifc2threeDir: idf,
    dbQuery(sql) {
      const r = db.exec(sql);
      return r.length ? r[0].values : [];
    }
  };
  if (legacy) {
    // A .db written by any build before §CPE_FLAGS_PORTABLE: 14 columns, no flag columns.
    db.run('CREATE TABLE cinema_path (seq INTEGER, ifc_x REAL, ifc_y REAL, ifc_z REAL,' +
      ' dir_x REAL, dir_y REAL, dir_z REAL, len REAL, total_sec REAL, dive_sec REAL,' +
      ' spin_sec REAL, out_sec REAL, rise_sec REAL, hold_sec REAL)');
    ov.bands.forEach((b, i) => db.run('INSERT INTO cinema_path VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [i, b.c.x, b.c.y, b.c.z, b.d.x, b.d.y, b.d.z, b.len,
       ov._total, ov.diveSec, ov.spinSec, ov.outSec, ov.riseSec, b.hold || 0]));
  } else {
    const wsb = { A, db, console: { log() {}, warn() {} } };
    vm.createContext(wsb);
    vm.runInContext(writeSrc + '\n_writeCinemaPathTable(db);', wsb);
  }
  const rsb = { A, console: { log() {}, warn() {} }, Math };
  rsb._cpeLoaded = false;
  vm.createContext(rsb);
  vm.runInContext('var _cpeLoaded = false;\n' + readSrc + '\n_cpeLoadFromDb();', rsb);
  const cols = (db.exec("PRAGMA table_info(cinema_path)")[0] || { values: [] }).values.map(r => r[1]);
  db.close();
  return { restored: A._cinemaPathEdit, cols };
}

function population() {
  if (!writeSrc || !readSrc) return [];
  const rows = [];
  for (const [name, ov, legacy] of [['flags-on', OV_ON, false], ['flags-off', OV_OFF, false],
                                    ['legacy-14-col', OV_ON, true]]) {
    const r = roundTrip(population._SQL, JSON.parse(JSON.stringify(ov)), legacy);
    const g = r.restored || {};
    rows.push({
      scenario: name,
      hasFlagCols: r.cols.indexOf('buildup') !== -1,
      bands: (g.bands || []).length,
      total: +(g._total || 0).toFixed(1),
      buildup: g.buildup === undefined ? 'undef' : String(!!g.buildup),
      roomTitle: g.roomTitle === undefined ? 'undef' : String(!!g.roomTitle),
      reveal: g.reveal === undefined ? 'undef' : String(!!g.reveal),
      dayCounter: g.dayCounter === undefined ? 'undef' : String(g.dayCounter)
    });
  }
  return rows;
}

const schema = {
  type: 'object',
  required: ['scenario', 'hasFlagCols', 'bands', 'total', 'buildup', 'roomTitle', 'reveal', 'dayCounter'],
  properties: {
    scenario: { type: 'string' }, hasFlagCols: { type: 'boolean' }, bands: { type: 'integer' },
    total: { type: 'number' }, buildup: { type: 'string' }, roomTitle: { type: 'string' },
    reveal: { type: 'string' }, dayCounter: { type: 'string' }
  }
};

(async () => {
  population._SQL = await initSqlJs({
    locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f)
  });
  if (!writeSrc || !readSrc) {
    console.log('§WITNESS_CPE_PATH_FLAGS_VERDICT INCONCLUSIVE — could not slice ' +
      (!writeSrc ? '_writeCinemaPathTable' : '_cpeLoadFromDb') + '; nothing judged');
    process.exit(1);
  }
  const w = Witness('CPE_PATH_FLAGS_PORTABLE')
    .population(population)
    .schema(schema)
    // G1 — the defect: flags set ON when the path was saved must come back ON.
    .invariant('flags-on-survive', rows => {
      const r = rows.find(x => x.scenario === 'flags-on');
      return !!r && r.buildup === 'true' && r.roomTitle === 'true' && r.reveal === 'true' && r.dayCounter === 'bl';
    })
    // G2 — OFF must come back OFF, not undefined-as-anything.
    .invariant('flags-off-survive', rows => {
      const r = rows.find(x => x.scenario === 'flags-off');
      return !!r && r.buildup === 'false' && r.roomTitle === 'false' && r.reveal === 'false';
    })
    // G3 — version skew: a .db written before the flag columns still restores its PATH, and leaves
    // the flags undefined so the consumer's own default applies (never throws, never invents true).
    .invariant('legacy-db-still-loads', rows => {
      const r = rows.find(x => x.scenario === 'legacy-14-col');
      return !!r && r.hasFlagCols === false && r.bands === 2 && r.buildup === 'undef';
    })
    // G4 — the geometry the flags ride with is unharmed by the schema change.
    .invariant('path-preserved', rows => rows.every(r => r.bands === 2 && r.total === 61.0))
    // RED — the pre-fix writer: geometry only, flags dropped on the way out.
    .redControl(rows => rows.map(r => Object.assign({}, r,
      { buildup: 'false', roomTitle: 'false', reveal: 'false', dayCounter: 'undef' })));

  const res = w.run();
  const rows = population();
  rows.forEach(r => console.log('§CPE_PATH_FLAGS_ROW ' + r.scenario + ' flagCols=' + r.hasFlagCols +
    ' bands=' + r.bands + ' total=' + r.total + ' buildup=' + r.buildup + ' roomTitle=' + r.roomTitle +
    ' reveal=' + r.reveal + ' dayCounter=' + r.dayCounter));
  const noop = rows.every(r => r.buildup === 'undef' || r.buildup === 'false');
  console.log('§WITNESS_CPE_PATH_FLAGS_VERDICT ' +
    (rows.length === 0 ? 'VACUOUS — nothing judged'
     : noop ? 'NO-OP — no scenario ever restored a flag as ON; the columns are not carrying anything'
     : res.fail === 0 ? 'PASS' : 'FAIL') +
    ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail);
  process.exit(res.fail === 0 && rows.length > 0 && !noop ? 0 : 1);
})().catch(e => { console.error('§WITNESS_CPE_PATH_FLAGS_ERROR ' + (e && e.stack || e)); process.exit(2); });
