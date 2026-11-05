#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-SECTION-Z (prompts/DXF2BIM_MODELLER_LANE.md §L39). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: @Z marks on a section that disagree with the drawing left a map with no zOf, and the import threw "map.zOf is not a function" instead of refusing. Does it now say so in words, with no exception, and is a section whose marks agree still read?
// Pure, node: the real import. VACUOUS (exit 2) if the good section is not read.
// usage: node modeller/tests/witness_dxf_section_z.js
'use strict';
const path = require('path'), R = path.join(__dirname, '..'), I = require(path.join(R, 'dxf2bim_import.js'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
let hd = 0x100; const H = () => (hd++).toString(16).toUpperCase();
const txt = (t, x, y) => ['0', 'TEXT', '5', H(), '8', 'DXF2BIM-MARK', '10', String(x), '20', String(y), '30', '0', '40', '150', '1', t + ' @BY=user'];
const mark = (t, i) => txt(t, -3000, -2500 - 300 * i);
const rect = (lay, x0, y0, x1, y1) => ['0', 'LWPOLYLINE', '5', H(), '8', lay, '90', '4', '70', '1', '10', x0, '20', y0, '10', x1, '20', y0, '10', x1, '20', y1, '10', x0, '20', y1].map(String);
const line = (lay, x0, y0, x1, y1) => ['0', 'LINE', '5', H(), '8', lay, '10', x0, '20', y0, '30', 0, '11', x1, '21', y1, '31', 0].map(String);
const file = e => ['0', 'SECTION', '2', 'ENTITIES'].concat(e, ['0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n';
const grids = () => [].concat(line('A-GRID', 0, -500, 0, 4500), line('A-GRID', 6000, -500, 6000, 4500), line('A-GRID', -500, 0, 6500, 0), line('A-GRID', -500, 4000, 6500, 4000), txt('@GRIDX=A', 0, 4500), txt('@GRIDX=B', 6000, 4500), txt('@GRIDY=1', -500, 0), txt('@GRIDY=2', -500, 4000));
const plan = { name: 'plan.dxf', text: file([].concat(rect('A-WALL-FULL', 0, 0, 6000, 100), rect('A-WALL-FULL', 0, 3900, 6000, 4000), rect('A-WALL-FULL', 0, 100, 100, 3900), rect('A-WALL-FULL', 5900, 100, 6000, 3900), grids(), ...['@UNITS=mm', '@SET=STD', '@VIEW=PLAN', '@LEVEL=0'].map(mark))) };
const elev = (face, hax, w, n) => ({ name: 'elev_' + face + '.dxf', text: file([].concat(rect('A-WALL', 0, 0, w, 3000), line('A-GRID', 0, -300, 0, 3300), line('A-GRID', w, -300, w, 3300), ...['@UNITS=mm', '@SET=STD', '@VIEW=ELEV', '@FACE=' + face, '@HAXIS=' + hax, '@ROOF=3'].map(mark), txt('@Z=0', -500, 0), txt('@Z=3', -500, 3000), txt('@GRIDH=' + n[0], 0, 3300), txt('@GRIDH=' + n[1], w, 3300))) });
const roof = { name: 'roof.dxf', text: file([].concat(rect('A-ROOF', 0, 0, 6000, 4000), grids(), ...['@UNITS=mm', '@SET=STD', '@VIEW=ROOF', '@LEVEL=3', '@ROOF=3'].map(mark))) };
const sect = zs => ({ name: 'section.dxf', text: file([].concat(rect('S-SLAB', 0, -150, 6000, 0), line('A-GRID', 0, -300, 0, 3300), line('A-GRID', 6000, -300, 6000, 3300), ...['@SET=STD', '@VIEW=SECTION', '@NAME=S', '@UNITS=mm', '@HAXIS=+X', '@CUT=Y,2000'].map(mark), txt('@GRIDH=A', 0, 3300), txt('@GRIDH=B', 6000, 3300), ...zs.map(([z, y]) => txt('@Z=' + z, -500, y)))) });
const run = zs => { const sh = I.readSheets([plan, elev('minY', '+X', 6000, ['A', 'B']), elev('maxY', '+X', 6000, ['A', 'B']), elev('minX', '+Y', 4000, ['1', '2']), elev('maxX', '+Y', 4000, ['1', '2']), roof, sect(zs)]); let out = null, err = null; try { out = I.convert(sh, {}); } catch (e) { err = e; } return { out, err, sh }; };
const good = run([[-0.15, -150], [0, 0], [3, 3000]]);
if (good.err || !good.out || !good.out.R && good.out.refused && good.out.refused.length) { console.log('§VACUOUS the good section did not read: ' + (good.err ? good.err.message : JSON.stringify(good.out.refused).slice(0, 300))); process.exit(2); }
ok('Z1 marks that agree: the section is read, no exception', !good.err, 'section ' + !!(good.out.section));
const bad = run([[0, -150], [0.3, 0], [3.1, 2800]]), sec = bad.sh.find(s => s.name === 'section.dxf'), txtE = JSON.stringify((sec && sec.errors) || []) + JSON.stringify((bad.out && bad.out.refused) || []) + JSON.stringify((bad.out && bad.out.verdict && bad.out.verdict.blocking) || []);
ok('Z2 marks that disagree: no exception', !bad.err, bad.err ? bad.err.message : '');
ok('Z3 and it says why: MARK:level_scale_fail', /level_scale_fail/.test(txtE), txtE.slice(0, 220));
console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
