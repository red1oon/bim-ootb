#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DOOR-GAP (prompts/DXF2BIM_FOUNDATION_LANE.md §D88 B). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: on a structure set (the shed) the drawing breaks a wall at its door, so the door was hosted by no wall: 0 cuts, 0 fills edges; moving the wall or adding
// a bay left the door behind, and the gate's door checks could not fire. Node, the CLI-marked shed through the shipped Dxf2Structure.judge + toOps:
//   D1 the double door 33B + 353: wall pieces CC-L1 + CC-L0 become ONE wall body; 2 cuts in it, each naming one leaf; the voids' union along the line = the gap (1 mm); each void from the
//      wall foot to its leaf head; walls 41 -> 40, cuts 0 -> 2
//   D2 the single doors 1D7 / 2D1 (a column on one side, no wall piece) stay unhosted: no cut names them, their wall pieces 125 / 115 stay single bodies
//   D3 control: leaf 353 removed (the gap no longer filled) -> the pieces stay two bodies, 0 cuts
//   D4 control at the reach: leaf 33B trimmed so 0.3115 m of the gap is left at CC-L0 (> host_tol 0.3) -> two bodies, 0 cuts; trimmed to 0.2965 m (<= 0.3) -> joined, 2 cuts
// Input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked). Missing input -> MISSING, exit 2.
// usage: node modeller/tests/witness_dxf_door_gap.js
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), M = path.join(__dirname, '..');
const I = require(path.join(M, 'dxf2bim_import.js')), ST = require(path.join(M, 'dxf2structure.js')), B = require(path.join(M, 'dxf2bodies.js'));
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort() : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets (' + MARKED + ', found ' + files.length + ')'); process.exit(2); }
const sheets = () => I.readSheets(files.map(n => ({ name: n, text: fs.readFileSync(path.join(MARKED, n), 'utf8') })));
const judge = () => { const out = ST.judge(sheets(), { I, B, defaultsRef: require(path.join(M, 'element_defaults.json')) }); if (!out.gate.ok) throw new Error('the shed did not qualify: ' + out.log); return out.gate.R; };
const box = o => { const P = o.params, b = P.bbox, c = P.placement, h = (b[5] - b[4]) / 2; return [c.x + b[0], c.y + b[2], c.z + h + b[4], c.x + b[1], c.y + b[3], c.z + h + b[5]]; };
const H = o => String(o.params.provenance && o.params.provenance.dxf_handle);
const summary = T => { const W = T.inserts.filter(o => o.params.ifc_class === 'IfcWall'); return { walls: W.length, cuts: T.cuts.length, lines: T.lines }; };
// D1 + D2
const R = judge(), T = I.toOps(R, {}), S = summary(T);
console.log('§DOOR-GAP shed inserts=' + T.inserts.length + ' walls=' + S.walls + ' cuts=' + S.cuts + ' lines=' + JSON.stringify(S.lines));
const cc = T.inserts.map((o, i) => ({ o, i })).filter(x => x.o.params.ifc_class === 'IfcWall' && /CC-L1/.test(H(x.o)) && /CC-L0/.test(H(x.o)));
const leaf = h => T.inserts.findIndex(o => o.params.ifc_class === 'IfcDoor' && H(o) === h);
const gc = cc.length === 1 ? T.cuts.filter(c => c.params.parent === cc[0].i) : [];
const named = gc.map(c => c.params.slide.fillingIdx).sort((a, b) => a - b), want = [leaf('33B'), leaf('353')].sort((a, b) => a - b);
const lo = gc.length ? Math.min(...gc.map(c => Math.min(c.params.void.c1[0], c.params.void.c2[0]))) : NaN, hi = gc.length ? Math.max(...gc.map(c => Math.max(c.params.void.c1[0], c.params.void.c2[0]))) : NaN;
const heads = gc.map(c => { const d = box(T.inserts[c.params.slide.fillingIdx]); return Math.abs(c.params.void.c2[2] - d[5]) <= 0.001 && Math.abs(c.params.void.c1[2] - 0.610) <= 0.001; });
// the gap as drawn: the facing ends of the two pieces (measured 2026-10-28: −643.587 .. −642.063)
const pieces = R.els.filter(e => e.class === 'IfcWall' && /^CC-L[01]$/.test(String(e.handle))).map(e => { const xs = e.vertices.map(v => v[0]); return [Math.min(...xs), Math.max(...xs)]; }).sort((a, b) => a[0] - b[0]);
const g0 = pieces.length === 2 ? pieces[0][1] : NaN, g1 = pieces.length === 2 ? pieces[1][0] : NaN;
ok('D1 the double door: CC-L1 + CC-L0 = ONE wall, 2 cuts each naming one leaf, voids = the gap along the line, foot to leaf head; walls 41 -> 40, cuts 0 -> 2',
  cc.length === 1 && gc.length === 2 && JSON.stringify(named) === JSON.stringify(want) && Math.abs(lo - g0) <= 0.001 && Math.abs(hi - g1) <= 0.001 && heads.every(Boolean) && S.walls === 40 && S.cuts === 2,
  'joined ' + cc.map(x => '#' + x.i + ' ' + H(x.o)).join(',') + ' | cuts ' + gc.map(c => H({ params: { provenance: c.params.provenance } }) + ' x ' + c.params.void.c1[0] + '..' + c.params.void.c2[0] + ' z ' + c.params.void.c1[2] + '..' + c.params.void.c2[2]).join(' ; ') +
  ' | gap as drawn ' + g0.toFixed(4) + '..' + g1.toFixed(4) + ' | walls ' + S.walls + ' cuts ' + S.cuts);
const single = ['1D7', '2D1'].map(h => leaf(h)), namedAny = T.cuts.some(c => single.indexOf(c.params.slide.fillingIdx) >= 0);
const w125 = T.inserts.filter(o => o.params.ifc_class === 'IfcWall' && (H(o) === '125' || H(o) === '115'));
ok('D2 the single doors 1D7 / 2D1 (a column on one side) stay unhosted; walls 125 / 115 stay single bodies', !namedAny && w125.length === 2 && w125.every(o => !o.params.provenance.members),
  'a cut names 1D7/2D1: ' + namedAny + ' | walls 125/115 as own bodies: ' + w125.length);
// D3 leaf 353 removed
const R3 = judge(); R3.els = R3.els.filter(e => !(e.class === 'IfcDoor' && String(e.handle) === '353')); const S3 = summary(I.toOps(R3, {}));
ok('D3 control: the gap no longer filled (leaf 353 removed) -> two bodies, 0 cuts', S3.walls === 41 && S3.cuts === 0, 'walls ' + S3.walls + ' cuts ' + S3.cuts);
// D4 leaf 33B trimmed at its CC-L0 end
const trim = by => { const R4 = judge(); R4.els = R4.els.map(e => { if (!(e.class === 'IfcDoor' && String(e.handle) === '33B')) return e; const xs = e.vertices.map(v => v[0]), mid = (Math.min(...xs) + Math.max(...xs)) / 2;   // the CC-L0-facing end (its corners differ by 0.2 mm: the drawn leaf is a skewed quad)
  return Object.assign({}, e, { vertices: e.vertices.map(v => [v[0] > mid ? v[0] - by : v[0], v[1], v[2]]) }); }); return summary(I.toOps(R4, {})); };
const far = trim(0.235), nearOk = trim(0.22);
ok('D4 control at the reach: 0.3115 m left at the wall end (> host_tol 0.3) -> two bodies; 0.2965 m (<= 0.3) -> joined', far.walls === 41 && far.cuts === 0 && nearOk.walls === 40 && nearOk.cuts === 2,
  '0.3115 m: walls ' + far.walls + ' cuts ' + far.cuts + ' | 0.2965 m: walls ' + nearOk.walls + ' cuts ' + nearOk.cuts);
console.log('§W-DOOR-GAP ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
