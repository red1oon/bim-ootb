#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L49 (a void ring cuts the slab, prompts/DXF2BIM_MODELLER_LANE.md §L49; BIMCompiler prompts/PDF2BIM_VECTOR_PROBE.md §58). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the DE-1 OG plan prints LUFTRAUM (an open space from the ground floor through the first-floor slab) but the converted DB's Level 2 slab ran over it.
 * A closed ring on A-FLOR-VOID must be a hole in its storey's slab, through the ONE hole route the stairwell uses (§L44), and nothing else may change.
 *   V1 (pure)  Dxf2Stair.voids returns every closed ring on A-FLOR-VOID in metres; open rings, other layers and degenerate rings are skipped
 *   V2 (real DE-1 sheets + local library)  a ring added in memory to plan_og.dxf shrinks the Level 2 slab top area by exactly the ring's area (1e-6 m2), the stairwell hole is kept;
 *        falsifier: the same ring on a wrong layer name leaves the slab unchanged; V3 control: the sheet without the ring = the stair-only value
 * Usage: node modeller/tests/witness_dxf_void.js   (V2 needs SCAN_SET_DIR=<7 sheets> and SCAN_LIB_DIR=<local library>; §SKIP without them: private client set)
 */
'use strict';
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
const ST = require(path.join(R, 'dxf2bim/dxf2stair.js'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const poly = (layer, pts, closed) => ({ type: 'LWPOLYLINE', layer, shape: !!closed, handle: 'H' + Math.random().toString(16).slice(2, 6), vertices: pts.map(p => ({ x: p[0], y: p[1], bulge: 0 })) });
const V = ST.voids([poly('A-FLOR-VOID', [[0, 0], [2000, 0], [2000, 1000], [0, 1000]], true), poly('A-FLOR-VOID', [[0, 0], [1, 0], [1, 1]], false), poly('A-FLOR-STRS', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], true),
  poly('A-FLOR-VOID', [[0, 0], [1000, 0], [2000, 0]], true), poly('A-FLOR-VOID', [[5000, 5000], [6000, 5000], [6000, 6000], [5000, 6000]], true)], 0.001);
const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s / 2); };
ok('V1 voids: 2 closed rings on A-FLOR-VOID (2.0 x 1.0 m and 1.0 x 1.0 m); the open ring, the A-FLOR-STRS ring and the collinear (zero area) ring are skipped', V.length === 2 && Math.abs(area(V[0]) - 2) < 1e-9 && Math.abs(area(V[1]) - 1) < 1e-9, 'rings=' + V.length + ' areas=' + V.map(area).join(','));
ok('V1-F no entity: []', ST.voids([], 1).length === 0 && ST.voids(null, 1).length === 0);

const DIR = process.env.SCAN_SET_DIR, LIB = process.env.SCAN_LIB_DIR;
if (!DIR || !fs.existsSync(DIR) || !LIB) { console.log('§SKIP V2/V3: SCAN_SET_DIR / SCAN_LIB_DIR not set (the scanned set is a private client set, never committed): INCONCLUSIVE, nothing judged for V2/V3'); finish(); }
else (async () => {
  const I = require(path.join(R, 'dxf2bim_import.js')), P = require(path.join(R, 'dxf2prep.js'));
  const names = fs.readdirSync(DIR).filter(f => f.endsWith('.dxf')).sort(), text = Object.fromEntries(names.map(n => [n, fs.readFileSync(path.join(DIR, n), 'utf8')]));
  const fetchJson = async u => { try { return JSON.parse(fs.readFileSync(u.startsWith('/') ? u : path.join(LIB, u), 'utf8')); } catch (e) { return null; } };
  const convert = async T => { const read = I.readSheets(names.map(n => ({ name: n, text: T[n] })), { prep: P, prepChoices: {} }); return (await I.loadOci(read, { base: LIB.replace(/\/?$/, '/'), fetchJson, convertOpts: { set: 'STD' } })).R; };
  const topArea = e => { let a = 0; e.faces.forEach(f => { const p = f.map(i => e.vertices[i]); if (!p.every(q => Math.abs(q[2] - p[0][2]) < 1e-9)) return; const z = p[0][2]; if (Math.abs(z - e.vertices.reduce((m, q) => Math.max(m, q[2]), -1e9)) > 1e-9) return;
    const c = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]); a += Math.abs(c) / 2; }); return a; };
  const l2 = r => (r.els || []).filter(e => e.class === 'IfcSlab' && e.storey === 'Level 2').reduce((s, e) => s + topArea(e), 0);
  const og = names.find(n => /plan_og/.test(n)); if (!og) { console.log('§SKIP V2: no plan_og.dxf in ' + DIR); return finish(); }
  const ringText = layer => ['0', 'LWPOLYLINE', '5', 'FFF1', '8', layer, '90', '4', '70', '1', '10', '1500', '20', '-2000', '10', '3500', '20', '-2000', '10', '3500', '20', '-4000', '10', '1500', '20', '-4000'].join('\n') + '\n';   // 2.0 x 2.0 m (mm sheet), inside the OG footprint
  const addRing = (txt, layer) => { const i = txt.lastIndexOf('0\nENDSEC'); return txt.slice(0, i) + ringText(layer) + txt.slice(i); };
  const base = l2(await convert(text)), withRing = l2(await convert(Object.assign({}, text, { [og]: addRing(text[og], 'A-FLOR-VOID') }))), wrong = l2(await convert(Object.assign({}, text, { [og]: addRing(text[og], 'A-FLOR-VOIX') })));
  ok('V3 control: the sheet without the ring has a Level 2 slab top area (the stair-only value)', base > 50, 'area=' + base.toFixed(6) + ' m2');
  ok('V2 a 2.0 x 2.0 m ring on A-FLOR-VOID shrinks the Level 2 slab top by exactly 4.000000 m2', Math.abs((base - withRing) - 4) < 1e-6, 'base=' + base.toFixed(6) + ' with=' + withRing.toFixed(6) + ' diff=' + (base - withRing).toFixed(6));
  ok('V2-F falsifier: the same ring on a wrong layer name leaves the slab unchanged', Math.abs(wrong - base) < 1e-6, 'wrong-layer area=' + wrong.toFixed(6));
  finish();
})();
function finish() { console.log('§RESULT judged=' + judged + ' fails=' + fails + (fails ? ' FAIL' : ' PASS')); process.exit(fails ? 1 : 0); }
