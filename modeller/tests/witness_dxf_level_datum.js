#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L127: prompts/DXF2BIM_MODELLER_LANE.md §L1.27. Read the log after every run.
 * THE ISSUE THIS PROVES OR DISPROVES: a building whose walls start below their storey level (SampleCastle: -0.09 m) is refused by Convert although its elevations DRAW every level datum,
 * because the LV rule only accepted a wall rectangle that starts at the level. After §L1.27 a drawn datum line is also evidence; wall heights are not guessed from it.
 *   L1 SC-VERDICT — SampleCastle straight set: Convert reaches a verdict (not refused); every storey is accepted by a rectangle OR a datum; the codes are printed.
 *   L2 EVIDENCE   — at least one storey is accepted by datum ALONE (no rectangle starts at it): the new rule is what lets it through (not a side effect).
 *   L3 CONTROL    — the same set with the ground plan's @LEVEL moved to 0.5 (no rectangle, no datum there) is STILL refused with the LV reason.
 *   L4 DUPLEX     — Duplex: every storey has a rectangle AND a datum, and its verdict is unchanged by construction (rule (a) decides) -> evidence lists non-empty.
 * Usage: NODE_PATH=<better-sqlite3 dir> node modeller/tests/witness_dxf_level_datum.js <SampleCastle .db> <Duplex .db>
 */
'use strict';
const path = require('path'), crypto = require('crypto');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require('better-sqlite3'), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const check = (id, issue, ok, d) => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const files = db => { const c = new Database(db, { readonly: true }), q = s => c.prepare(s).all(), R = S.writeStdSet(q, 'X'), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' }); return Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })); };
const [sc, dx] = process.argv.slice(2);
const f = files(sc), out = I.convert(I.readSheets(f), {}), v = out.verdict;
check('L1 SC-VERDICT', 'SampleCastle is refused by Convert although its levels are drawn', !!v && out.ST.every(s => s.levelDrawn.length + s.levelDatum.length > 0), v ? `verdict ${v.verdict}, blocking ${v.blocking.length}, storeys ${out.ST.map(s => s.level + ':rect' + s.levelDrawn.length + '/datum' + s.levelDatum.length + '/top' + s.top).join(' ')}` : JSON.stringify(out.refused));
check('L2 EVIDENCE', 'no storey was accepted by the datum alone (the new rule did nothing)', !!v && out.ST.some(s => s.levelDrawn.length === 0 && s.levelDatum.length > 0), v ? out.ST.filter(s => !s.levelDrawn.length).map(s => s.level).join(',') + ' accepted by datum alone' : 'refused');
const lv0 = f.find(x => /FLOOR_00/.test(x.name)), moved = f.map(x => x === lv0 ? { name: x.name, text: x.text.replace(/@LEVEL=0 @BY=model/, "@LEVEL=0.5 @BY=model") } : x);
const o2 = I.convert(I.readSheets(moved), {});
check('L3 CONTROL', 'a level with neither a rectangle nor a datum is no longer refused', !o2.verdict && (o2.refused || []).some(r => /is not a drawn elevation boundary/.test(r.reason)), JSON.stringify(o2.refused || 'no refusal').slice(0, 200));
const o3 = I.convert(I.readSheets(files(dx)), {});
check('L4 DUPLEX', 'a Duplex storey has no drawn rectangle or datum', !!o3.verdict && o3.ST.every(s => s.levelDrawn.length > 0 && s.levelDatum.length > 0), o3.ST ? o3.ST.map(s => s.level + ':rect' + s.levelDrawn.length + '/datum' + s.levelDatum.length).join(' ') : 'refused');
console.log('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
