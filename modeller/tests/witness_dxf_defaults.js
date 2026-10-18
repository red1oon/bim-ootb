// W-DEFAULTS (prompts/DXF2BIM_MODELLER_LANE.md §L18). Issue: a 2D layout does not carry every measure of every element; the product must have a standard value or a guess READY for each element type,
// say which it is (yellow, with its basis), use it only when nothing is stated, and let a person state a value that the drawing set keeps (@DEFAULT). Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const I = require('../dxf2bim_import.js'), P = require('../dxf2prep.js'), DF = require('../dxf2defaults.js'), DR = require('../dxf2doors.js'), ref = require('../element_defaults.json'), synth = require('../synthetic_ref.json');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const arc = (layer, cx, cy, r, a0, a1, h) => g(0, 'ARC') + g(5, h) + g(8, layer) + g(10, cx) + g(20, cy) + g(30, 0) + g(40, r) + g(50, a0) + g(51, a1);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 0, 0], ['@GRIDX=B', 6000, 0], ['@GRIDY=1', 0, 0], ['@GRIDY=2', 0, 4000], ['@LAYER=Rod,doorswing']];
const door = arc('Rod', 1000, 1000, 900, 0, 90, 'A1') + line('Rod', 1000, 1000, 1000, 1900);
const read = (extra) => I.readSheets([{ name: 'plan.dxf', text: doc(door, PLAN.concat(extra || [])) }], { prep: P });
const D = ref.defaults, keys = Object.keys(D);

ok('DF1 the registry is READY for the element types: ' + keys.length + ' dotted keys; each has an element class, a unit, a kind (std | guess), a basis sentence and a value; numeric ones are positive numbers; every option list contains the default or is a text setting', keys.length >= 40 && keys.every(k => /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(k) && D[k].element && D[k].unit && ['std', 'guess'].includes(D[k].kind) && D[k].basis && D[k].value !== undefined && (D[k].unit === 'text' || (typeof D[k].value === 'number' && D[k].value >= 0)) && (!D[k].options || D[k].unit === 'text' || D[k].options.includes(D[k].value))), keys.filter(k => !D[k].basis).join());
const classes = new Set(keys.map(k => D[k].element)), need = Object.keys(synth.parts).filter(c => c !== 'IfcWallStandardCase');
ok('DF2 COVERAGE: every IFC class the bill knows (' + need.join(', ') + ') has at least one default, plus stairs, railings, ramps, piles, ceilings, curtain walls', need.every(c => classes.has(c)) && ['IfcStair', 'IfcRailing', 'IfcRamp', 'IfcPile', 'IfcCovering', 'IfcCurtainWall'].every(c => classes.has(c)), need.filter(c => !classes.has(c)).join());
const std = keys.filter(k => D[k].kind === 'std');
ok('DF3 "std" is reserved for a value with a NAMED source (the rate pack\'s own description or the drawing\'s label): ' + std.length + ' std entries (' + std.join(', ') + '), each basis names its source; everything else is an honest guess', std.length >= 2 && std.every(k => /rate pack|label|IfcWall|IfcSlab|1\/4 in/.test(D[k].basis)));
// resolution order
let d = DF.create(null, [{ desc: { defaults: [{ key: 'door.height', value: '2.4', by: 'user' }] } }], { 'door.height': '2.0', 'door.thickness': '0.05' });
ok('DF4 resolution: the drawing\'s @DEFAULT beats an editor choice beats the registry: door.height 2.4 (file, not 2.0 chosen), door.thickness 0.05 (choice), window.sill 0.9 (default)', d.num('door.height') === 2.4 && d.source('door.height') === 'stated' && d.num('door.thickness') === 0.05 && d.source('door.thickness') === 'chosen' && d.num('window.sill') === 0.9 && d.source('window.sill') === 'default');
const rows = d.rows(), byK = Object.fromEntries(rows.map(r => [r.key, r]));
ok('DF5 yellow rows exist ONLY for the defaults a module APPLIED (use): 3 rows (door.height stated, door.thickness chosen, window.sill default), each with its basis (guess|std), element and unit; an unused key has no row', rows.length === 3 && byK['door.height'].kind === 'stated' && byK['door.thickness'].kind === 'chosen' && byK['window.sill'].kind === 'default' && byK['window.sill'].basis === 'guess' && byK['window.sill'].element === 'IfcWindow' && !byK['stair.riser']);
d = DF.create(null, [{ desc: { defaults: [{ key: 'door.height', value: 'tall', by: 'user' }, { key: 'wall.height', value: '-3', by: 'user' }] } }], {});
ok('DF6 CONTROL a stated value that is not a non-negative number (text, negative) is refused: the default is used and the problem listed, never silently', d.num('door.height') === 2.1 && d.num('wall.height') === 3 && d.invalid().length === 2 && d.invalid().every(x => /default .* is used/.test(x.why)));
ok('DF7 CONTROL an unknown key throws (no silent default for a typo)', (() => { try { DF.create(null, [], {}).num('door.hieght'); return false; } catch (e) { return /unknown default/.test(e.message); } })());
const t = DF.create(null, [], {}).table();
ok('DF8 table(): every key with its in-force value, source and kind, so the editor and the CLI can show ALL settings before conversion', t.length === keys.length && t.every(r => r.source === 'default' && r.value === r.default && r.used === false));
// integration: a @DEFAULT in the drawing set changes the door
let r = DR.buildDoors(read(), [], {});
ok('DF9 the door height with nothing stated is the guess 2.1 m (yellow row, basis guess)', r.els[0].size.d.number === 2.1 && r.els[0].size.d.source === 'default' && r.defaults.find(x => x.key === 'door.height').kind === 'default');
r = DR.buildDoors(read([['@DEFAULT=door.height,2.4'], ['@DEFAULT=door.thickness,0.06']]), [], {});
ok('DF10 the person states @DEFAULT=door.height,2.4 in the drawing set: the door is 2.4 m, source stated, the row is stated (no longer a guess)', r.els[0].size.d.number === 2.4 && r.els[0].size.d.source === 'stated' && r.defaults.find(x => x.key === 'door.height').kind === 'stated' && Math.abs(r.els[0].vertices.map(v => v[2]).reduce((a, b) => Math.max(a, b), 0) - 2.4) < 1e-9);
const mod = JSON.parse(JSON.stringify(ref)); mod.defaults['door.height'].value = 2.0;
r = DR.buildDoors(read(), [], { ref: mod });
ok('DF11 FALSIFIER editing the registry JSON changes the result (door.height 2.0 -> a 2.0 m door): the reference, not the code, holds the value', r.els[0].size.d.number === 2.0);
console.log(fail ? 'FAIL W-DEFAULTS ' + fail : 'PASS W-DEFAULTS'); process.exit(fail ? 1 : 0);
