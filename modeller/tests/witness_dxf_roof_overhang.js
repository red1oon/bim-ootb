#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-L51 (the eave overhang, prompts/DXF2BIM_MODELLER_LANE.md §L51; BIMCompiler prompts/PDF2BIM_VECTOR_PROBE.md §59.3, §63). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the DE-1 section draws the roof continuing past the wall (0.74 m at 22 deg, printed -30 = a 30 cm drop of the eave end); the importer accepted only a roof outline EQUAL to the walls'
// envelope. A roof outline = the envelope + one margin on all four sides must be an overhang: the planes continue at the pitch, the drop follows; anything else stays refused.
'use strict';
const fs = require('fs'), path = require('path'), R0 = path.join(__dirname, '..');
const S = require(path.join(R0, 'dxf2bim/dxf2shell.js')), C = require(path.join(R0, 'dxf2bim/dxf2shell_config.js')), MK = require(path.join(R0, 'dxf2bim/dxf2marks.js')), ref = require(path.join(R0, 'element_defaults.json'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-5);
const rect = (h, x0, y0, x1, y1, layer) => ({ layer: layer || 'A-ROOF', type: 'LWPOLYLINE', shape: true, handle: h, vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
const MAP = C.STD && C.STD.MAP_ROOF ? C.STD.MAP_ROOF : (C.MAP_ROOF || null);
const E0 = [0, 0, 12.49, 11.99], CFG = { snap_tol: 0.005 }, OUT = [[0.365, 0.365], [12.125, 0.365], [12.125, 11.625], [0.365, 11.625]];
const plan = (x0, y0, x1, y1) => S.roofPlan([rect('R', x0, y0, x1, y1)], MAP, 1, E0, OUT, CFG);
if (!MAP) { console.log('§VACUOUS no MAP_ROOF layer map found in dxf2shell_config: nothing judged'); process.exit(2); }
const a = plan(0, 0, 12.49, 11.99), b = plan(-0.75, -0.75, 13.24, 12.74);
ok('O1 an outline equal to the envelope: ok, overhang 0 (as before)', a.ok && a.overhang === 0, JSON.stringify({ ok: a.ok, o: a.overhang }));
ok('O2 the envelope + 0.75 m on all four sides: ok, overhang 0.75', b.ok && near(b.overhang, 0.75, 1e-6), JSON.stringify({ ok: b.ok, o: b.overhang }));
const un = plan(-0.75, -0.5, 13.24, 12.74), sm = plan(0.2, 0.2, 12.29, 11.79), np = S.roofPlan([{ layer: 'A-ROOF', type: 'LWPOLYLINE', shape: true, handle: 'N', vertices: [{ x: -0.75, y: -0.75 }, { x: 13.24, y: -0.75 }, { x: 13.24, y: 5 }, { x: 14, y: 12.74 }, { x: -0.75, y: 12.74 }] }], MAP, 1, E0, OUT, CFG);
ok('O3 FALSIFIERS unequal margins / a roof smaller than the walls / a non-rectangle: still GAP:roof_outline_mismatch', [un, sm, np].every(r => !r.ok && r.gaps[0].code === 'GAP:roof_outline_mismatch'), [un, sm, np].map(r => r.ok + ':' + (r.gaps[0] || {}).code).join(' '));
// planes of the enlarged outline: the eave continues at the pitch
const PITCH = 22, tan = Math.tan(PITCH * Math.PI / 180), HM = 6.12 + 5.995 * tan, ridge = { layer: 'A-ROOF-RIDGE', type: 'LINE', handle: 'r', vertices: [{ x: -0.75, y: 5.995, z: HM }, { x: 13.24, y: 5.995, z: HM }] };
const f0 = S.gableRoof([rect('A', 0, 0, 12.49, 11.99, 'A-ROOF-GABLE'), { layer: 'A-ROOF-RIDGE', type: 'LINE', handle: 'r', vertices: [{ x: 0, y: 5.995, z: HM }, { x: 12.49, y: 5.995, z: HM }] }], 1, PITCH, 0.0254, 0.03);
const f1 = S.gableRoof([rect('A', -0.75, -0.75, 13.24, 12.74, 'A-ROOF-GABLE'), ridge], 1, PITCH, 0.0254, 0.03);
const zmin = f => Math.min(...f.planes.map(p => Math.min(...p.mesh.vertices.map(v => v[2])))), ext = f => { const v = [].concat(...f.planes.map(p => p.mesh.vertices)); return [Math.min(...v.map(q => q[0])), Math.max(...v.map(q => q[0])), Math.min(...v.map(q => q[1])), Math.max(...v.map(q => q[1]))]; };
ok('O4 the planes continue past the walls: x -0.75..13.24, y -0.75..12.74; the eave end is 0.75 x tan 22 = 0.303 m lower than at the wall; the roof line AT the wall face is unchanged (6.12)', near(zmin(f0) - zmin(f1), 0.75 * tan, 1e-4) && near(f1.heightAt([6, 0]), 6.12, 1e-4) && near(ext(f1)[0], -0.75, 1e-6) && near(ext(f1)[3], 12.74, 1e-6), 'eave z ' + zmin(f0).toFixed(4) + ' -> ' + zmin(f1).toFixed(4) + ' (drop ' + (zmin(f0) - zmin(f1)).toFixed(4) + ')');
ok('O5 the registry carries no synth.roof.eave_drop (the drop is derived), synth.roof.overhang stays', !ref.defaults['synth.roof.eave_drop'] && !!ref.defaults['synth.roof.overhang']);

const DIR = process.env.SCAN_SET_DIR, LIB = process.env.SCAN_LIB_DIR;
if (!DIR || !fs.existsSync(DIR) || !LIB) { console.log('§SKIP D1/D2: SCAN_SET_DIR / SCAN_LIB_DIR not set (private client set): INCONCLUSIVE, nothing judged for D'); done(); }
else (async () => {
  const I = require(path.join(R0, 'dxf2bim_import.js')), P = require(path.join(R0, 'dxf2prep.js'));
  const names = fs.readdirSync(DIR).filter(f => f.endsWith('.dxf')).sort(), T = names.map(n => ({ name: n, text: fs.readFileSync(path.join(DIR, n), 'utf8') }));
  const fetchJson = async u => { try { return JSON.parse(fs.readFileSync(u.startsWith('/') ? u : path.join(LIB, u), 'utf8')); } catch (e) { return null; } };
  const r = (await I.loadOci(I.readSheets(T, { prep: P, prepChoices: {} }), { base: LIB.replace(/\/?$/, '/'), fetchJson, convertOpts: { set: 'STD' } })).R;
  const roofs = (r.els || []).filter(e => e.class === 'IfcRoof'), v = [].concat(...roofs.map(e => e.vertices)), bb = [Math.min(...v.map(q => q[0])), Math.max(...v.map(q => q[0])), Math.min(...v.map(q => q[1])), Math.max(...v.map(q => q[1])), Math.min(...v.map(q => q[2]))];
  const T2 = I.toOps(r, { colorFor: () => null, glass: (require(path.join(R0, 'synthetic_ref.json')) || {}).glass, frame: r.frame || null }), refused = (T2.skipped || []).filter(x => x.refuse);
  const oh = r.roofPlan && r.roofPlan.overhang;
  ok('D1 the DE-1 sheets: the roof outline states an overhang, the planes reach beyond the walls on all four sides, the gate qualifies', oh > 0.3 && r.verdict.verdict === 'qualifies' && r.verdict.blocking.length === 0 && bb[0] < -0.3 && bb[1] > 12.49 + 0.3 && bb[2] < -12.29 - 0.3 && bb[3] > 0.3, 'overhang=' + oh + ' roof bbox x ' + bb[0].toFixed(3) + '..' + bb[1].toFixed(3) + ' y ' + bb[2].toFixed(3) + '..' + bb[3].toFixed(3) + ' z min ' + bb[4].toFixed(3) + ' verdict=' + r.verdict.verdict + ' blocking=' + r.verdict.blocking.length);
  ok('D2 the Convert path (toOps) refuses nothing', refused.length === 0, 'refused=' + JSON.stringify(refused).slice(0, 160));
  if (oh) console.log('§D1 derived eave drop = ' + (oh * tan).toFixed(3) + ' m (printed -30 = 0.30)');
  done();
})();
function done() { console.log('§RESULT judged=' + judged + ' fails=' + fails + (fails ? ' FAIL' : ' PASS')); process.exit(fails ? 1 : 0); }
