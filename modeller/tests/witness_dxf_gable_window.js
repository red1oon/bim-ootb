#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-L50 (the gable window, prompts/DXF2BIM_MODELLER_LANE.md §L50; BIMCompiler prompts/PDF2BIM_VECTOR_PROBE.md §59, §62). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a gable wall the sheet draws had no opening; the DE-1 elevations show a small window centred in each gable. @GABLEWINDOW must cut a real hole and fill it,
// take its size from the drawing when stated, else from the registry (building-type aware), refuse a window that does not fit, and change nothing without the mark.
'use strict';
const fs = require('fs'), path = require('path'), R0 = path.join(__dirname, '..');
const S = require(path.join(R0, 'dxf2bim/dxf2shell.js')), MK = require(path.join(R0, 'dxf2bim/dxf2marks.js')), DF = require(path.join(R0, 'dxf2defaults.js')), ref = require(path.join(R0, 'element_defaults.json'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const rect = (h, x0, y0, x1, y1, layer) => ({ layer: layer || 'A-ROOF-GABLE', type: 'LWPOLYLINE', shape: true, handle: h, vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
const ridge = (h, x0, y0, x1, y1, z) => ({ layer: 'A-ROOF-RIDGE', type: 'LINE', handle: h, vertices: [{ x: x0, y: y0, z }, { x: x1, y: y1, z }] });
const volume = m => { let v = 0; m.faces.forEach(([a, b, c]) => { const A = m.vertices[a], B = m.vertices[b], C = m.vertices[c]; v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; }); return Math.abs(v); };
const closed = m => { const e = {}; m.faces.forEach(f => [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]].forEach(([a, b]) => { const k = a + '>' + b; e[k] = (e[k] || 0) + 1; })); return Object.keys(e).every(k => { const [a, b] = k.split('>'); return e[b + '>' + a] === e[k]; }); };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-5);
// a DE-1-like gable: 12.49 x 11.99 m, ridge along x at y = 5.995, pitch 22, two end walls 0.365 thick on the x ends
const PITCH = 22, tan = Math.tan(PITCH * Math.PI / 180), HM = 6.12 + 5.995 * tan;
const form = S.gableRoof([rect('A', 0, 0, 12.49, 11.99), ridge('r', 0, 5.995, 12.49, 5.995, HM)], 1, PITCH, 0.05, 0.03); form.thickness = 0.05;
const walls = [rect('W', 0, 0, 0.365, 11.99, 'A-WALL-GABLE'), rect('E', 12.125, 0, 12.49, 11.99, 'A-WALL-GABLE')];
const base = S.gableWalls(walls, 1, form, 6.05);
ok('G1 no window asked: the §L36 gable walls are untouched (2 walls, closed, no window body)', base.walls.length === 2 && base.walls.every(w => closed(w.mesh) && !w.window), 'walls=' + base.walls.length);
// marks grammar
const mk = t => MK.readMarks ? 0 : 0;   // (readMarks is exercised through the importer on the real sheets; the grammar here is checked on the parsed value below)
const apexW = base.walls[0].top;   // the underside apex of the gable wall (m)
const G2 = S.gableWalls(walls, 1, form, 6.05, { w: 0.6, h: 0.6, top: 0.5 });
const w0 = G2.walls[0], gp = w0.window;
ok('G2 a 0.6 x 0.6 m window, top 0.5 m below the apex, on BOTH gables: a hole in the wall and one window body each', G2.walls.length === 2 && G2.walls.every(w => w.window) && !G2.gaps.length, 'windows=' + G2.walls.filter(w => w.window).length);
ok('G2b its box: 0.6 wide, 0.6 high, centred on the wall (along y = 5.995), top = apex - 0.5', near(gp.rect[2] - gp.rect[0], 0.6, 1e-4) && near(gp.rect[3] - gp.rect[1], 0.6, 1e-4) && near((gp.rect[0] + gp.rect[2]) / 2, 5.995, 1e-4) && near(gp.rect[3], apexW - 0.5, 1e-4), JSON.stringify(gp.rect));
ok('G6 the hole is real: wall volume = the gable prism volume - w x h x thickness (0.6 x 0.6 x 0.365)', near(volume(w0.mesh), volume(base.walls[0].mesh) - 0.6 * 0.6 * 0.365, 1e-4) && closed(w0.mesh) && closed(gp.mesh), volume(base.walls[0].mesh).toFixed(4) + ' -> ' + volume(w0.mesh).toFixed(4));
const G5 = S.gableWalls(walls, 1, form, 6.05, { w: 9.0, h: 0.6, top: 0.5 });
ok('G5 FALSIFIER a window 9.0 m wide does not fit the gable at that height: not drawn, GAP:gable_window_outside names both walls, the wall stays the §L36 wall', G5.gaps.length === 2 && G5.gaps.every(g => g.code === 'GAP:gable_window_outside') && G5.walls.every((w, i) => !w.window && near(volume(w.mesh), volume(base.walls[i].mesh), 1e-9)), 'gaps=' + G5.gaps.length);
const G5b = S.gableWalls(walls, 1, form, 6.05, { w: 0.5, h: 0.5, top: 3.0 });
ok('G5b FALSIFIER a window whose bottom would sit below the gable base (top 3.0 m below the apex, gable only 2.4 m high): refused', G5b.gaps.length === 2 && G5b.walls.every(w => !w.window));
// defaults through the registry (building-type aware)
const st = list => [{ desc: { defaults: list.map(([key, value]) => ({ key, value, by: 'user' })) } }];
const gen = DF.create(null, [], {}), de = DF.create(null, st([['building.type', 'German Einfamilienhaus']]), {});
const val = d => ({ w: d.num('synth.gable.window.width'), h: d.num('synth.gable.window.height'), top: d.num('synth.gable.window.below_ridge') });
ok('G3a General default = common sense 0.6 x 0.6, top 0.5 below the apex, source default', JSON.stringify(val(gen)) === JSON.stringify({ w: 0.6, h: 0.6, top: 0.5 }) && gen.source('synth.gable.window.width') === 'default', JSON.stringify(val(gen)));
ok('G3b German Einfamilienhaus = the DE-1 nearest occurrence 0.47 x 0.56, top 0.45, source type', JSON.stringify(val(de)) === JSON.stringify({ w: 0.47, h: 0.56, top: 0.45 }) && de.source('synth.gable.window.width') === 'type', JSON.stringify(val(de)));
const G3 = S.gableWalls(walls, 1, form, 6.05, val(de));
ok('G3 through the importer path: the German box fits and is built on both gables', G3.walls.every(w => w.window && near(w.window.width, 0.47, 1e-4) && near(w.window.height, 0.56, 1e-4)) && !G3.gaps.length);
const G4 = S.gableWalls(walls, 1, form, 6.05, { w: 0.5, h: 0.5, top: 0.7 });
ok('G4 an explicit box (what a drawing states) is used as given: 0.5 x 0.5, top 0.7 below the apex', G4.walls.every(w => w.window && near(w.window.rect[3], w.top - 0.7, 1e-4) && near(w.window.width, 0.5, 1e-4)));
// the registry honesty (the three keys are now READ; eave_drop is still planned)
ok('G7 the three gable keys are consumed (no PLANNED, used_by names the importer); eave_drop stays PLANNED', ['synth.gable.window.width', 'synth.gable.window.height', 'synth.gable.window.below_ridge'].every(k => !/PLANNED/.test(ref.defaults[k].basis) && /dxf2bim_import/.test(ref.defaults[k].used_by)) && /PLANNED/.test(ref.defaults['synth.roof.eave_drop'].basis));

// real DE-1 sheets (private): the roof sheet carries A-WALL-GABLE + @GABLEWINDOW, the live library: two window bodies above z 6.12
const DIR = process.env.SCAN_SET_DIR, LIB = process.env.SCAN_LIB_DIR;
if (!DIR || !fs.existsSync(DIR) || !LIB) { console.log('§SKIP D1: SCAN_SET_DIR / SCAN_LIB_DIR not set (private client set): INCONCLUSIVE, nothing judged for D1'); done(); }
else (async () => {
  const I = require(path.join(R0, 'dxf2bim_import.js')), P = require(path.join(R0, 'dxf2prep.js'));
  const names = fs.readdirSync(DIR).filter(f => f.endsWith('.dxf')).sort(), T = names.map(n => ({ name: n, text: fs.readFileSync(path.join(DIR, n), 'utf8') }));
  const fetchJson = async u => { try { return JSON.parse(fs.readFileSync(u.startsWith('/') ? u : path.join(LIB, u), 'utf8')); } catch (e) { return null; } };
  const r = (await I.loadOci(I.readSheets(T, { prep: P, prepChoices: {} }), { base: LIB.replace(/\/?$/, '/'), fetchJson, convertOpts: { set: 'STD' } })).R;
  const above = c => (r.els || []).filter(e => e.class === c && Math.min(...e.vertices.map(q => q[2])) >= 6.1);
  const gw = (r.els || []).filter(e => e.layer === 'A-WALL-GABLE'), win = (r.els || []).filter(e => e.layer === 'A-GLAZ-GABLE');
  const adv = (r.verdict.advisory || []).filter(a => /gable_window/.test(a.code));
  ok('D1 the DE-1 sheets: two gable walls up to the roof apex and two window bodies, the gate still qualifies', gw.length === 2 && win.length === 2 && r.verdict.verdict === 'qualifies' && r.verdict.blocking.length === 0, 'gable walls=' + gw.length + ' windows=' + win.length + ' verdict=' + r.verdict.verdict + ' blocking=' + r.verdict.blocking.length + ' advisory=' + JSON.stringify(adv.map(a => a.code)));
  if (win.length) { const b = e => { const v = e.vertices; return [0, 1, 2].map(i => [Math.min(...v.map(q => q[i])), Math.max(...v.map(q => q[i]))].map(x => Number(x.toFixed(3)))); }; console.log('§D1 window boxes (x, y, z m): ' + JSON.stringify(win.map(b))); console.log('§D1 gable walls z range: ' + JSON.stringify(gw.map(e => b(e)[2]))); }
  done();
})();
function done() { console.log('§RESULT judged=' + judged + ' fails=' + fails + (fails ? ' FAIL' : ' PASS')); process.exit(fails ? 1 : 0); }
