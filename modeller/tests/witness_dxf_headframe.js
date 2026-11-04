#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-HEADFRAME (prompts/DXF2BIM_MODELLER_LANE.md §L38). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a door height from the schedule always gained a 76 mm head frame, even on a drawing whose elevations show the schedule's height IS the opening: 5 doors on the low-cost house floated 38 mm. Can a set state this through the real import, and is a set that does not state it untouched?
// Pure, node: the real readMarks and the real import path, on one small drawn set. VACUOUS (exit 2) if the door never reached the schedule branch.
// usage: node modeller/tests/witness_dxf_headframe.js
'use strict';
const path = require('path'), R = path.join(__dirname, '..');
const I = require(path.join(R, 'dxf2bim_import.js')), MK = require(path.join(R, 'dxf2bim/dxf2marks.js')), DxfParser = require(path.join(R, 'lib/dxf-parser.js'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
let hd = 0x100; const H = () => (hd++).toString(16).toUpperCase();
const mark = (t, i) => ['0', 'TEXT', '5', H(), '8', 'DXF2BIM-MARK', '10', '-3000', '20', String(-2500 - 300 * i), '30', '0', '40', '150', '1', t + ' @BY=user'];
const tag = (t, x, y) => ['0', 'TEXT', '5', H(), '8', 'DXF2BIM-MARK', '10', String(x), '20', String(y), '30', '0', '40', '150', '1', t + ' @BY=model'];
const rect = (lay, x0, y0, x1, y1) => ['0', 'LWPOLYLINE', '5', H(), '8', lay, '90', '4', '70', '1', '10', x0, '20', y0, '10', x1, '20', y0, '10', x1, '20', y1, '10', x0, '20', y1].map(String);
const arc = (lay, x, y, r, a0, a1) => ['0', 'ARC', '5', H(), '8', lay, '10', x, '20', y, '30', 0, '40', r, '50', a0, '51', a1].map(String);
const file = ents => ['0', 'SECTION', '2', 'ENTITIES'].concat(ents, ['0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n';
// a 6 x 4 m room: a door in the south wall (y 0..100), drawn at +Y, 900 wide, shown on no elevation (so its height can only come from the schedule)
const gridMarks = (key, list, at) => list.map(([n, v]) => tag('@' + key + '=' + n, ...at(v)).map(q => q.replace(' @BY=model', ' @BY=user')));
const line = (lay, x0, y0, x1, y1) => ['0', 'LINE', '5', H(), '8', lay, '10', x0, '20', y0, '30', 0, '11', x1, '21', y1, '31', 0].map(String);
const plan = extra => file([].concat(
  rect('A-WALL-FULL', 0, 0, 2000, 100), rect('A-WALL-FULL', 2900, 0, 6000, 100), rect('A-WALL-FULL', 0, 3900, 6000, 4000), rect('A-WALL-FULL', 0, 100, 100, 3900), rect('A-WALL-FULL', 5900, 100, 6000, 3900),
  arc('A-DOOR', 2000, 100, 900, 0, 90), tag('@TAG=door,DR1', 2450, 550),
  line('A-GRID', 0, -500, 0, 4500), line('A-GRID', 6000, -500, 6000, 4500), line('A-GRID', -500, 0, 6500, 0), line('A-GRID', -500, 4000, 6500, 4000),
  ...gridMarks('GRIDX', [['A', 0], ['B', 6000]], v => [v, 4500]), ...gridMarks('GRIDY', [['1', 0], ['2', 4000]], v => [-500, v]),
  ...['@UNITS=mm', '@SET=STD', '@VIEW=PLAN', '@LEVEL=0', '@SCHEDULE=DR1,door,900,2100'].concat(extra || []).map(mark)));
const user = q => q.map(v => v.replace(' @BY=model', ' @BY=user'));
const elev = (face, haxis, w, names) => ({ name: 'elev_' + face + '.dxf', text: file([].concat(rect('A-WALL', 0, 0, w, 3000), line('A-GRID', 0, -300, 0, 3300), line('A-GRID', w, -300, w, 3300),
  ...['@UNITS=mm', '@SET=STD', '@VIEW=ELEV', '@FACE=' + face, '@HAXIS=' + haxis, '@ROOF=3'].map(mark), user(tag('@Z=0', -500, 0)), user(tag('@Z=3', -500, 3000)), user(tag('@GRIDH=' + names[0], 0, 3300)), user(tag('@GRIDH=' + names[1], w, 3300)))) });
const ROOF = { name: 'roof.dxf', text: file([].concat(rect('A-ROOF', 0, 0, 6000, 4000), line('A-GRID', 0, -500, 0, 4500), line('A-GRID', 6000, -500, 6000, 4500), line('A-GRID', -500, 0, 6500, 0), line('A-GRID', -500, 4000, 6500, 4000),
  ...gridMarks('GRIDX', [['A', 0], ['B', 6000]], v => [v, 4500]), ...gridMarks('GRIDY', [['1', 0], ['2', 4000]], v => [-500, v]), ...['@UNITS=mm', '@SET=STD', '@VIEW=ROOF', '@LEVEL=3', '@ROOF=3'].map(mark))) };
const ELEVS = [elev('minY', '+X', 6000, ['A', 'B']), elev('maxY', '+X', 6000, ['A', 'B']), elev('minX', '+Y', 4000, ['1', '2']), elev('maxX', '+Y', 4000, ['1', '2']), ROOF];
const doorOf = extra => { const sh = I.readSheets([{ name: 'plan.dxf', text: plan(extra) }].concat(ELEVS)), o = I.convert(sh, {}), st = (o.ST || [])[0], d = st && (st.after || []).find(q => q.op_type === 'DXF_OPENING' && q.params.kind === 'door'); return { o, st, sh, d: d && d.params }; };
const a = doorOf();
if (!a.d || a.d.height_source !== 'schedule') { console.log('§VACUOUS the door did not reach the schedule branch: ' + JSON.stringify(a.d || null).slice(0, 300) + ' refused ' + JSON.stringify(a.o.refused || null).slice(0, 200)); process.exit(2); }
console.log('§BASE no mark: door ' + JSON.stringify({ height: a.d.height, leaf: a.d.leaf_height, head: a.d.head_frame, src: a.d.height_source }));
ok('H1 no mark: as today, schedule + CASING, leaf is the schedule', a.d.height === 2.176 && a.d.leaf_height === 2.1 && a.d.head_frame === 0.076);
const b = doorOf(['@HEADFRAME=0']);
ok('H2 @HEADFRAME=0: the opening is the schedule\'s height', b.d && b.d.height === 2.1 && b.d.leaf_height === 2.1 && b.d.head_frame === 0, JSON.stringify(b.d && { h: b.d.height, l: b.d.leaf_height }));
const c = doorOf(['@HEADFRAME=50']);
ok('H3 a value is read in the sheet\'s units', c.d && c.d.height === 2.15 && c.d.leaf_height === 2.1 && c.d.head_frame === 0.05, JSON.stringify(c.d && { h: c.d.height, l: c.d.leaf_height }));
const errs = t => MK.describe(MK.readMarks(new DxfParser().parseSync(file([].concat(...['@UNITS=mm', '@SET=STD', '@VIEW=PLAN', '@LEVEL=0', t].map(mark)))).entities)).errors || [];
const bad = ['@HEADFRAME=abc', '@HEADFRAME=-5'].map(t => errs(t).some(e => e.code === 'MARK:malformed'));
ok('H4 not a number, or negative: MARK:malformed', bad.every(Boolean), JSON.stringify(bad));
const noKey = Object.keys(a.sh.find(q => q.name === 'plan.dxf').desc).includes('headframe');
ok('H5 a sheet with no mark carries no new key', !noKey);
console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
