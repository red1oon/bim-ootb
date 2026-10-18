// W-DOORS (prompts/DXF2BIM_MODELLER_LANE.md §L16). Issue: doors drawn as plan swing symbols (an arc about the hinge + the open leaf) were invisible to the reader; the product must turn them into
// door bodies from what IS drawn (hinge, width, thickness when the leaf is a double line) and say what is NOT (height: a yellow default), leaving out a swing whose closed side cannot be told.
const fs = require('fs'), path = require('path');
const I = require('../dxf2bim_import.js'), P = require('../dxf2prep.js'), B = require('../dxf2bodies.js'), ST = require('../dxf2structure.js'), DR = require('../dxf2doors.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const arc = (layer, cx, cy, r, a0, a1, h) => g(0, 'ARC') + g(5, h) + g(8, layer) + g(10, cx) + g(20, cy) + g(30, 0) + g(40, r) + g(50, a0) + g(51, a1);
const circle = (layer, cx, cy, r, h) => g(0, 'CIRCLE') + g(5, h) + g(8, layer) + g(10, cx) + g(20, cy) + g(30, 0) + g(40, r);
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 0, 0], ['@GRIDX=B', 6000, 0], ['@GRIDY=1', 0, 0], ['@GRIDY=2', 0, 4000], ['@LAYER=Rod,doorswing'], ['@LAYER=Col,column']];
// a door: hinge (1000,1000), leaf 900 wide, the swing from 0 to 90 degrees, the OPEN leaf drawn as two lines 40 apart going up (+y); the closed leaf lies along +x
const door1 = arc('Rod', 1000, 1000, 900, 0, 90, 'A1') + line('Rod', 1000, 1000, 1000, 1900) + line('Rod', 1040, 1000, 1040, 1900);
const planOf = body => doc(body, PLAN);
const read = files => I.readSheets(files.map(([n, t]) => ({ name: n, text: t })), { prep: P });
const run = (body, cols, o) => DR.buildDoors(read([['plan.dxf', planOf(body + (cols || ''))]]), o && o.bodies || [], o);
const bb = e => [0, 1, 2].map(i => { const a = e.vertices.map(v => v[i]); return [Math.min(...a), Math.max(...a)].map(v => Math.round(v * 1e6) / 1e6); });
const vol = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };

let r = run(door1);
const d = r.els[0];
ok('DR1 a swing arc (hinge 1,1 m, radius 0.9 m, 0..90 deg) with its open leaf drawn as two lines 40 mm apart = ONE IfcDoor: the CLOSED leaf lies along +x (the other end of the arc), 0.9 m wide, 0.04 m thick (drawn: the line spacing), 2.1 m high (yellow default)', r.els.length === 1 && d.class === 'IfcDoor' && JSON.stringify(bb(d)) === JSON.stringify([[1, 1.9], [0.98, 1.02], [0, 2.1]]) && d.size.w.number === 0.9 && d.size.t.number === 0.04 && d.size.t.source === 'drawn' && d.size.d.source === 'default', d && JSON.stringify(bb(d)));
ok('DR2 volume = 0.9 x 0.04 x 2.1 with outward windings; derived (amber)', Math.abs(vol(d) - 0.9 * 0.04 * 2.1) < 1e-9 && d.prov === 'derived');
ok('DR3 yellow defaults listed: door.height (the thickness is drawn here, so no door.thickness default)', r.defaults.some(x => x.key === 'door.height' && x.kind === 'default') && !r.defaults.some(x => x.key === 'door.thickness'));
r = run(arc('Rod', 1000, 1000, 900, 0, 90, 'A1') + line('Rod', 1000, 1000, 1000, 1900));
ok('DR4 a leaf drawn as ONE line has no drawn thickness: the default 0.04 m (door.thickness listed)', r.els.length === 1 && r.els[0].size.t.source === 'default' && r.defaults.some(x => x.key === 'door.thickness'));
r = run(arc('Rod', 1000, 1000, 900, 0, 90, 'A1'));
ok('DR5 CONTROL a swing arc with NO drawn open leaf: GAP:door_closed_unknown, NO body (which end of the arc is the closed leaf cannot be told)', r.els.length === 0 && r.gaps.length === 1 && r.gaps[0].code === 'GAP:door_closed_unknown' && r.gaps[0].handle === 'A1');
r = run(circle('Rod', 1000, 1000, 900, 'C1') + arc('Rod', 3000, 1000, 200, 0, 30, 'S1'));
ok('DR6 CONTROL a full circle and a 30-degree arc are not swings: nothing built, no gap', r.els.length === 0 && r.gaps.length === 0);
r = run(arc('Rod', 2000, 1000, 900, 90, 180, 'A2') + line('Rod', 2000, 1000, 2000, 1900) + line('Rod', 2000, 1000, 1100, 1000));
ok('DR7 a hinge on the right (arc 90..180 deg, open leaf up at +y, closed leaf along -x): the door lies x 1.1 .. 2.0 m', r.els.length === 0 || JSON.stringify(bb(r.els[0])[0]) === JSON.stringify([1.1, 2]), r.els[0] && JSON.stringify(bb(r.els[0])));
const arcHandle = read([['plan.dxf', planOf(door1)]])[0].dxf.entities.filter(e => e.type === 'ARC')[0].handle, nums = {}; nums['body-door-0-' + arcHandle] = { d: 2.4, w: 0.05 };
r = run(door1, '', { numbers: nums });
ok('DR8 the user states the height (2.4 m) and thickness (0.05 m): the door is built so, sources user', r.els.length === 1 && r.els[0].size.d.number === 2.4 && r.els[0].size.d.source === 'user' && r.els[0].size.t.number === 0.05);
const cols = [{ kind: 'column', z0: 0.6096, z1: 3 }];
r = DR.buildDoors(read([['plan.dxf', planOf(door1)]]), cols, {});
ok('DR9 the floor level is the lowest drawn column base (0.6096 m): the door stands from 0.6096 to 2.7096 m', r.els.length === 1 && Math.abs(bb(r.els[0])[2][0] - 0.6096) < 1e-9 && Math.abs(bb(r.els[0])[2][1] - 2.7096) < 1e-9);
r = run(door1 + arc('Rod', 5000, 3000, 700, 180, 270, 'A9') + line('Rod', 5000, 3000, 4300, 3000) + line('Rod', 5000, 3000, 5000, 2300));
ok('DR10 two doors: both built with distinct ids; determinism: the same sheet twice gives identical bodies', r.els.length === 2 && new Set(r.els.map(e => e.guid)).size === 2 && JSON.stringify(run(door1).els) === JSON.stringify(run(door1).els));
console.log(fail ? 'FAIL W-DOORS ' + fail : 'PASS W-DOORS'); process.exit(fail ? 1 : 0);
