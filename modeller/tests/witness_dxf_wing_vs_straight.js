#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L122-VS-STRAIGHT: prompts/DXF2BIM_MODELLER_LANE.md §L1.22. Read the log after every run.
 * THE ISSUE THIS PROVES OR DISPROVES: the wing-only writer rules (long faces, per-storey elevation outline, collinear vertices, swingless doors, round columns) change what a REAL rectilinear
 * building (not only the Duplex) looks like to the reader. A wing at the building's own angle must (V1) be read at all (not refused), (V2) have the same building grid as the straight set,
 * (V3) not be judged worse (total blocking <= straight), and (V4) every difference in blocking codes is LISTED (no silent difference). It found: HHS wing refused (257 round columns dropped, L1.22).
 * Usage: NODE_PATH=<better-sqlite3 dir> node modeller/tests/witness_dxf_wing_vs_straight.js <Node model .db> [better-sqlite3 dir]
 */
'use strict';
const path = require('path'), crypto = require('crypto');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.argv[3] || path.join(process.env.HOME, 'bim-compiler/node_modules'), 'better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const check = (id, issue, ok, d) => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all();
const run = opts => { const R = S.writeStdSet(q, 'X', opts), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' });
  const sheets = I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), out = I.convert(sheets, {}), v = out.verdict, m = {};
  (v ? v.blocking : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; });
  return { R, refused: v ? null : JSON.stringify(out.refused || '').slice(0, 300), codes: m, total: v ? v.blocking.length : -1, grid: JSON.stringify([R.grid.x.map(g => g[0] + '@' + g[1].toFixed(3)), R.grid.y.map(g => g[0] + '@' + g[1].toFixed(3))]) }; };
const m0 = S.loadModel(q, { add() {}, gap() {} }), fam = S.wingAngles(m0);
console.log('model walls=' + m0.walls.length + ' angle families=' + JSON.stringify(fam));
const st = run(undefined);
if (st.refused) { console.log('SKIP the straight set is itself refused by the reader (' + st.refused + '): no comparison possible'); process.exit(0); }
const wg = run({ wing: { angle: fam.length ? fam[0].deg : 0, name: 'W' } });
check('V1 READ', 'the wing set is refused by the reader although the straight set is read', !wg.refused, wg.refused || 'read');
if (wg.refused) { console.log('SUMMARY fail=' + fail); process.exit(1); }
check('V2 GRID', 'the wing set has a different building grid than the straight set', wg.grid === st.grid, wg.grid === st.grid ? 'equal' : 'straight=' + st.grid.slice(0, 160) + ' wing=' + wg.grid.slice(0, 160));
check('V3 NOT WORSE', 'the wing set has more blocking than the straight set', wg.total <= st.total, `straight=${st.total} wing=${wg.total}`);
const keys = [...new Set(Object.keys(st.codes).concat(Object.keys(wg.codes)))].sort(), diff = keys.filter(k => st.codes[k] !== wg.codes[k]).map(k => `${k} ${st.codes[k] || 0}->${wg.codes[k] || 0}`);
console.log('V4 DIFFERENCES (listed, not hidden): ' + (diff.join('; ') || 'none'));
console.log('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
