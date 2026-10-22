#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CURTAIN-ELEV (rule D31, prompts/DXF2BIM_FOUNDATION_LANE.md §F8). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (D31 is writer-only): our elevations drew only walls and curtain walls flush with the building face; a curtain wall set into the facade (HHS west face: 113 mm
 * behind the wall face) was missing, so the spandrel wall above it read as an unstated storey (`QF:set_storey_unstated` at z 3.228 m).
 *   C1 DRAWN     — every A-WALL-CURT rectangle of an elevation comes from a curtain wall that runs along that face, set back by more than 10 mm and at most the face's wall depth
 *                  (or on a stepped wing's storey face), from the glazing's own bottom (§ELEV_CURTAIN_SET).
 *   C2 STATED    — an elevation that draws one carries @LAYER=A-WALL-CURT,elevwall; one that does not draws no A-WALL-CURT and carries no such marking.
 *   C3 SPANDREL  — on HHS no `QF:set_storey_unstated` remains (the drawn glazing completes the face under the spandrel).
 *   C4 CONTROL   — the same HHS sheets with the drawn glazing removed bring the flag back: the drawn glazing is what resolves it (no reader rule is involved).
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_curtain_elev.js <Node model .db> [FI]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), P = new DxfParser();
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all(), FI = process.argv[3];
const fam = S.wingAngles(S.loadModel(q, { add() {}, gap() {} })), opts = FI !== undefined && FI !== 'none' ? { wing: { angle: fam[+FI].deg, name: 'W' } } : undefined;
const R = S.writeStdSet(q, 'X', opts), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' });
const elevs = Object.keys(R.files).filter(n => /_(FRONT|REAR|LEFT|RIGHT)_std\.dxf$/.test(n)), logged = R.log.filter(l => /^§ELEV_CURTAIN_SET /.test(l));
let nRect = 0, bad = [], stated = true;
elevs.forEach(n => { const face = /_(FRONT|REAR|LEFT|RIGHT)_std/.exec(n)[1], rects = P.parseSync(R.files[n]).entities.filter(e => e.layer === 'A-WALL-CURT'); nRect += rects.length;
  const mine = logged.filter(l => l.indexOf('§ELEV_CURTAIN_SET ' + face + ' ') === 0);
  if (rects.length !== mine.length) bad.push(face + ':' + rects.length + '/' + mine.length);
  mine.forEach(l => { const sb = +/set_back=(-?[\d.]+)mm/.exec(l)[1], dp = +/depth=([\d.]+)mm/.exec(l)[1]; if (sb > dp + 0.001 || sb < -10.001) bad.push(face + ':setback ' + sb + '>' + dp); });
  const mk = /@LAYER=A-WALL-CURT,elevwall/.test(Dm.files[n] || ''); if (mk !== rects.length > 0) stated = false; });
check('C1', 'every elevation A-WALL-CURT rectangle is a logged set-back curtain band within the face depth', bad.length === 0, `rects=${nRect} logged=${logged.length} bad=${bad.length} ${bad.slice(0, 3).join(' ')}`);
check('C2', 'an elevation states @LAYER=A-WALL-CURT,elevwall exactly when it draws one', stated, `elevations=${elevs.length}`);
const verdictOf = files => { const o = I.convert(I.readSheets(Object.keys(files).map(n => ({ name: n, text: files[n] }))), {}); return (o.verdict ? o.verdict.blocking : []).filter(b => b.code === 'QF:set_storey_unstated'); };
const now = verdictOf(Dm.files);
if (/HHS/i.test(process.argv[2])) {
  check('C3', 'HHS: no unstated level band remains (the spandrel rests on drawn glazing)', now.length === 0, `set_storey_unstated=${now.length} ${now.map(b => b.level).join(',')}`);
  const R0 = S.writeStdSet(q, 'X', Object.assign({}, opts || {}, { curtainSetBack: false })), D0 = Mk.deriveMarks(R0, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' });
  const removed = Object.keys(Dm.files).reduce((t, n) => t + (Dm.files[n].match(/\n8\nA-WALL-CURT\n/g) || []).length - ((D0.files[n] || '').match(/\n8\nA-WALL-CURT\n/g) || []).length, 0), back = verdictOf(D0.files);
  check('C4', 'CONTROL: the same set without the drawn glazing (test hook curtainSetBack=false) brings the unstated level band back', back.length > 0 && removed > 0, `glazing rects removed=${removed}, set_storey_unstated=${back.length} ${back.map(b => b.level).join(',')}`);
} else say(`INFO C3/C4 | not HHS; set_storey_unstated on this set=${now.length} ${now.map(b => b.level).join(',')}`);
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
