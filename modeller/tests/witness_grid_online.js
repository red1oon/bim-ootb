#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-GRID-ONLINE (prompts/DXF2BIM_FOUNDATION_LANE.md §D91). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a one-bay drag of the shed's end grid line stretched the 6 thin end walls standing ON the line 25x across (SCALE f=25: 0.127 -> 3.18 m thick)
// and left the end bay's side walls and eave beams behind (no command), because an edge match outranked "on the line" and a member framed into the column on a line ends at the
// column's face, beyond EDGE_TOL of the line. Node: the shipped GridKinematicEngine on the converted shed's boxes + the drawing's grid, and built controls.
//   O1 the 6 end walls on line 42 TRANSLATE by the drag (main: SCALE f=25)
//   O2 the end bay's side walls (CC-L0+CC-L1, A6) and eave beams (2AF+2EA, 2D1+2B0) SCALE to (L + 3.048) / L (main: no command)
//   O3 control: a member ending 0.127 m from a line with NO column on it stays unattached by that line (the band comes from columns only)
//   O4 control: a 0.15 m wall centred on a line with no column ATTACHes and translates (main: EDGE -> SCALE)
// Input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked). Missing input -> MISSING, exit 2.
// usage: node modeller/tests/witness_grid_online.js        falsifier: GK_MODULE=<main's grid_kinematics.js>
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), M = path.join(__dirname, '..');
const I = require(path.join(M, 'dxf2bim_import.js')), ST = require(path.join(M, 'dxf2structure.js')), B = require(path.join(M, 'dxf2bodies.js')), GK = require(process.env.GK_MODULE || path.join(M, 'grid_kinematics.js'));
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort() : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets (' + MARKED + ', found ' + files.length + ')'); process.exit(2); }
// the page's own element set (bonsai_gridmove.js elementData): the structural allow-list, ifcClass 'IfcWall' for all, the real class beside it
const ALLOW = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcFooting', 'IfcColumn', 'IfcBeam', 'IfcRailing', 'IfcStairFlight', 'IfcRoof'];
const sh = I.readSheets(files.map(n => ({ name: n, text: fs.readFileSync(path.join(MARKED, n), 'utf8') })));
const R = ST.judge(sh, { I, B, defaultsRef: require(path.join(M, 'element_defaults.json')) }).gate.R, T = I.toOps(R, {}), pg = B.planGrid(sh);
const box = o => { const P = o.params, b = P.bbox, c = P.placement, h = (b[5] - b[4]) / 2; return [c.x + b[0], c.y + b[2], c.z + h + b[4], c.x + b[1], c.y + b[3], c.z + h + b[5]]; };
const el = (guid, b, cls, h) => ({ guid, x: (b[0] + b[3]) / 2, y: (b[1] + b[4]) / 2, z: (b[2] + b[5]) / 2, bboxX: b[3] - b[0], bboxY: b[4] - b[1], bboxZ: b[5] - b[2], ifcClass: 'IfcWall', realClass: cls, h, b });
const els = T.inserts.map((o, i) => ({ o, i })).filter(x => ALLOW.indexOf(x.o.params.ifc_class) >= 0).map(x => el(x.i, box(x.o), x.o.params.ifc_class, String(x.o.params.provenance.dxf_handle)));
const lines = []; pg.xs.forEach((x, i) => lines.push({ id: 'gx' + i, axis: 'x', pos: x })); pg.ys.forEach((y, j) => lines.push({ id: 'gy' + j, axis: 'y', pos: y }));
const drag = (E, L, id, d) => { const eng = new GK.GridKinematicEngine(E, L); eng.attachGridToElements(); const r = eng.dragGrid(id, d), by = {}; (r.commands || r || []).forEach(c => { by[c.featureId != null ? c.featureId : c.guid] = c; }); return by; };
const D = 3.048, last = 'gx' + (pg.xs.length - 1), L42 = pg.xs[pg.xs.length - 1], cmd = drag(els, lines, last, D);
const say = c => c ? c.action + (c.newScale != null ? ' f=' + c.newScale.toFixed(3) : '') + (c.delta != null ? ' d=' + c.delta.toFixed(3) : '') : 'none';
// O1 the thin end walls standing on line 42
const ends = els.filter(e => e.realClass === 'IfcWall' && e.bboxX < 0.2 && Math.abs(e.x - L42) < 0.1);
ok('O1 the 6 end walls on line 42 TRANSLATE with the drag (not stretched across)', ends.length === 6 && ends.every(e => cmd[e.guid] && cmd[e.guid].action === 'TRANSLATE' && Math.abs((cmd[e.guid].delta || 0) - D) < 1e-9),
  ends.map(e => e.h + ':' + say(cmd[e.guid])).join(' '));
// O2 the end bay's side walls and eave beams
const bay = ['CC-L0+CC-L1', 'A6', '2AF+2EA', '2D1+2B0'].map(h => els.find(e => e.h === h));
const want = e => (e.bboxX + D) / e.bboxX;
ok('O2 the end bay\'s side walls and eave beams stretch one bay: SCALE (L + 3.048) / L', bay.every(Boolean) && bay.every(e => cmd[e.guid] && cmd[e.guid].action === 'SCALE' && Math.abs(cmd[e.guid].newScale - want(e)) < 1e-6),
  bay.map(e => e ? e.h + ':' + say(cmd[e.guid]) + ' (want f=' + want(e).toFixed(3) + ')' : 'missing').join(' | '));
// O3 the same side wall with no column on either line: not attached by those lines
const noCol = els.filter(e => e.realClass !== 'IfcColumn'), c3 = drag(noCol, lines, last, D), w3 = bay[0];
ok('O3 control: without the columns on the lines, the side wall ending 0.127 m from them gets no command (the band is the columns\')', w3 && !c3[w3.guid], 'CC wall: ' + say(c3[w3.guid]));
// O4 a 0.15 m wall centred on a line, no column
const L4 = [{ id: 'gx0', axis: 'x', pos: 0 }, { id: 'gx1', axis: 'x', pos: 5 }], w4 = el('w4', [-0.075, 0, 0, 0.075, 4, 3], 'IfcWall', 'thin'), c4 = drag([w4], L4, 'gx0', 1);
ok('O4 control: a 0.15 m wall centred on a line with no column rides it (TRANSLATE), not stretched', c4.w4 && c4.w4.action === 'TRANSLATE' && Math.abs(c4.w4.delta - 1) < 1e-9, 'thin wall: ' + say(c4.w4));
console.log('§W-GRID-ONLINE ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails + ' (commands on the shed drag: ' + Object.keys(cmd).length + ')'); process.exit(fails || !judged ? 1 : 0);
