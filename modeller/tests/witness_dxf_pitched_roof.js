#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-PITCHED-ROOF (prompts/DXF2BIM_MODELLER_LANE.md §L36). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the standard path built every roof as a solid block. A sheet stating @PITCH must get real sloped planes, with valleys found by the rule "the highest plane at every point", never authored.
'use strict';
const path = require('path'), S = require(path.join(__dirname, '..', 'dxf2bim', 'dxf2shell.js'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const rect = (h, x0, y0, x1, y1) => ({ layer: 'A-ROOF-GABLE', type: 'LWPOLYLINE', shape: true, handle: h, vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
const ridge = (h, x0, y0, x1, y1, z) => ({ layer: 'A-ROOF-RIDGE', type: 'LINE', handle: h, vertices: [{ x: x0, y: y0, z }, { x: x1, y: y1, z }] });
const tan = Math.tan(25 * Math.PI / 180), near = (a, b, t) => Math.abs(a - b) <= (t || 1e-5);
const volume = m => { let v = 0; m.faces.forEach(([a, b, c]) => { const A = m.vertices[a], B = m.vertices[b], C = m.vertices[c]; v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; }); return v; };
const closed = m => { const e = {}; m.faces.forEach(f => [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]].forEach(([a, b]) => { const k = a + '>' + b; e[k] = (e[k] || 0) + 1; })); return Object.keys(e).every(k => { const [a, b] = k.split('>'); return e[b + '>' + a] === e[k]; }); };
// one gable: 10 x 6, ridge along x at y = 0, z 5
let R = S.gableRoof([rect('A', 0, -3, 10, 3), ridge('r', 0, 0, 10, 0, 5)], 1, 25, 0.05, 0.03);
ok('O1 one gable gives 2 planes, no gap', R.planes.length === 2 && !R.gaps.length, 'planes=' + R.planes.length);
const p0 = R.planes[0], zs = p0.mesh.vertices.map(v => v[2]), zmax = Math.max(...zs); ok('O2 ridge and eave exact: ridge z 5, eave z = 5 - 3 tan 25', near(zmax, 5) && near(R.heightAt([5, 3]), 5 - 3 * tan) && near(R.heightAt([5, -3]), 5 - 3 * tan), 'eave ' + R.heightAt([5, 3]).toFixed(4));
ok('O3 the slope measured from the mesh equals the pitch', near(Math.atan2(R.heightAt([5, 0]) - R.heightAt([5, 2]), 2) * 180 / Math.PI, 25));
ok('O4 each body is closed, volume = plan area x thickness', R.planes.every(p => closed(p.mesh) && near(Math.abs(volume(p.mesh)), p.area * 0.05, 1e-4)) && near(R.planes[0].area, 30), 'area ' + R.planes[0].area + ' volume ' + Math.abs(volume(R.planes[0].mesh)).toFixed(4));
// the house shape: a main gable and a porch gable running into its south slope, equal pitch, a lower ridge
const HM = 4.872, HP = 4.182, main = rect('M', -0.75, -6.95, 10.65, 0.75), porch = rect('P', 2.971, -9.144, 6.919, -3.1), rm = ridge('rm', -0.75, -3.1, 10.65, -3.1, HM), rp = ridge('rp', 4.945, -9.144, 4.945, -3.1, HP);
R = S.gableRoof([main, porch, rm, rp], 1, 25, 0.05, 0.03);
ok('T1 two gables, 4 planes (the porch\'s and the main\'s), no gap', R.planes.length === 4 && !R.gaps.length, 'planes=' + R.planes.length);
// the valley: main south z = HM - t (-3.1 - y), porch west z = HP - t (4.945 - x); they meet where (-3.1 - y) - (4.945 - x) = (HM - HP) / t
const c = (HM - HP) / tan, valleyY = x => -3.1 - c - (4.945 - x);   // a 45 degree line in plan
const sample = (x, y) => R.heightAt([x, y]);
let vOk = true; for (const x of [3.2, 3.8, 4.4, 4.9]) { const y = valleyY(x), up = Math.hypot; if (y < -6.95) continue; const z = sample(x, y), zm = HM - tan * (-3.1 - y), zp = HP - tan * (4.945 - x); if (!near(z, zm, 1e-3) || !near(zm, zp, 1e-3)) vOk = false; }
ok('T2 the valley is the 45 degree line where the planes meet: both planes have the same height on it', vOk, 'join on the ridge at y=' + valleyY(4.945).toFixed(3));
let areaSum = 0; R.planes.forEach(p => { areaSum += p.area; });
const unionArea = 11.4 * 7.7 + 3.948 * (9.144 - 6.95); ok('T3 the planes cover the roof once: their areas sum to the union of the two footprints', near(areaSum, unionArea, 1e-3), 'sum ' + areaSum.toFixed(3) + ' union ' + unionArea.toFixed(3));
ok('T4 the main roof is cut by the porch: its south plane holds less than its full rectangle', R.planes.filter(p => p.handle === 'M').some(p => p.area < 11.4 * 3.85 - 0.5), R.planes.map(p => p.handle + p.s + ':' + p.area).join(' '));
ok('T5 every body is closed', R.planes.every(p => closed(p.mesh)));
// gable-end walls: a rectangle on A-WALL-GABLE rises to the roof's underside, broken at the ridge
const wall = (h, x0, y0, x1, y1) => Object.assign(rect(h, x0, y0, x1, y1), { layer: 'A-WALL-GABLE' });
R.thickness = 0.0254; let W = S.gableWalls([wall('g', -0.05, -6.25, 0.05, 0.05)], 1, R, 3.15), w0 = W.walls[0], under = y => HM - tan * Math.abs(y + 3.1) - 0.0254, top = w0 && Math.max(...w0.mesh.vertices.map(v => v[2]));
ok('G1 a gable-end wall: from z0 to the underside, its peak under the ridge, closed', W.walls.length === 1 && near(top, HM - 0.0254) && closed(w0.mesh) && w0.mesh.vertices.some(v => near(v[1], 0.05) && near(v[2], under(0.05), 1e-4)), 'peak ' + (top || 0).toFixed(3) + ' at the wall end ' + under(0.05).toFixed(3));
ok('G2 its volume = the profile area x thickness (a pentagon, measured exactly)', near(Math.abs(volume(w0.mesh)), 0.1 * (6.3 * (under(0.05) - 3.15) + 6.3 * (HM - 0.0254 - under(0.05)) / 2), 1e-3), Math.abs(volume(w0.mesh)).toFixed(4));
ok('G3 a wall outside the roof, or under a roof lower than z0: refused', S.gableWalls([wall('g', 20, -6, 20.1, 0)], 1, R, 3.15).gaps.length === 1 && S.gableWalls([wall('g', -0.05, -6.25, 0.05, 0.05)], 1, R, 9).gaps.length === 1);
// falsifiers
const code = r => (r.gaps[0] || {}).code;
ok('F1 no ridge: refused, not guessed', code(S.gableRoof([rect('A', 0, -3, 10, 3)], 1, 25, 0.05, 0.03)) === 'GAP:roof_gable_no_ridge');
ok('F2 a ridge off the mid-line: refused', code(S.gableRoof([rect('A', 0, -3, 10, 3), ridge('r', 0, 1, 10, 1, 5)], 1, 25, 0.05, 0.03)) === 'GAP:roof_gable_no_ridge');
ok('F3 pitch 0: refused', code(S.gableRoof([rect('A', 0, -3, 10, 3), ridge('r', 0, 0, 10, 0, 5)], 1, 0, 0.05, 0.03)) === 'GAP:roof_bad_pitch');
ok('F4 a ridge with no gable: refused', S.gableRoof([rect('A', 0, -3, 10, 3), ridge('r', 0, 0, 10, 0, 5), ridge('q', 50, 50, 60, 50, 5)], 1, 25, 0.05, 0.03).gaps.some(g => g.code === 'GAP:roof_ridge_no_gable'));
console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (fails ? 'FAIL' : judged ? 'PASS' : 'VACUOUS')); process.exit(fails ? 1 : 0);
