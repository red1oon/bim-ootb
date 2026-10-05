#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS d2_mep_metal: ### ALTS-ALL FIX 11 (D2) (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### ALTS-ALL FIX 10–16 SPEC").
// READ THE OUTPUT before any conclusion — the exit code is not evidence.
// ISSUES THIS PROVES OR DISPROVES (each row can fail on its own):
//  (a) the Revit name hint beat the discipline: Hospital's FP pipes (hint 'pipe' = PLB) rendered PLB purple. After: a specific-trade
//      discipline decides; the hint decides only for the generic 'MEP' / no discipline (HHS).
//  (b) pipes / ducts / structural steel carried metalness 0.40-0.65 (no source; PBR metalness is near-binary): after, metal 0 unless the
//      name states bare metal -> metal 1 + the cited physicallybased.info srgb-linear colour (stored sRGB-encoded).
//  (c) the pipe/duct envInt 0.05 dimming override is gone (global 0.6); beam envInt 0 (red1 2026-08-15) kept.
//  Population: the real Hospital DB through the shipped _mepTradeHue (FP pipe rows -> FP hue), so the witness cannot pass on nothing.
//  Red control: &metalpbr=0 (A._metalPbrOff) restores the old order + table -> the D2 rows must fail.
// Command: node viewer/tests/witness_d2_mep_metal.js
'use strict';
const path = require('path'), cp = require('child_process'), os = require('os');
let L = null; try { L = require('./_colour_truth_load.js').loadStreaming(); } catch (e) { console.log('§WITNESS_D2_MEP_METAL INCONCLUSIVE streaming.js did not load: ' + e.message); process.exitCode = 2; return; }
const { mat, col } = require('./_colour_truth_load.js'), A = L.A;
if (!A._mepTradeHue || !A._bareMetalKey || !A.METAL_PBR_CLASSES) { console.log('§WITNESS_D2_MEP_METAL INCONCLUSIVE owner not published (_mepTradeHue/_bareMetalKey)'); process.exitCode = 2; return; }
const { Witness } = require('../../witness_kit/contract');
const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const hue = c => { const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const oe = c => c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const PH = '0.920,0.900,0.850,1.000', PIPE_HINT = A._mepNameHint('Pipe Types:Standard'), DUCT_HINT = A._mepNameHint('Rectangular Duct');
function build() {
  const rows = [], row = (name, got, want, ok) => rows.push({ name, got: String(got), want: String(want), ok: !!ok });
  // (a) trade order
  const fp = A._mepTradeHue('FP', PIPE_HINT), mep = A._mepTradeHue('MEP', PIPE_HINT), none = A._mepTradeHue('', PIPE_HINT), plb = A._mepTradeHue('PLB', PIPE_HINT);
  row('FP pipe with the PLB name hint -> FP (discipline decides)', fp && fp.code + '/' + fp.src, 'FP/discipline', fp && fp.code === 'FP' && fp.src === 'discipline');
  row('generic MEP pipe with the hint -> PLB (name hint decides, HHS case)', mep && mep.code + '/' + mep.src, 'PLB/name-hint', mep && mep.code === 'PLB' && mep.src === 'name-hint');
  row('no discipline + hint -> hint', none && none.code, 'PLB', none && none.code === 'PLB');
  row('PLB pipe -> PLB (discipline)', plb && plb.code + '/' + plb.src, 'PLB/discipline', plb && plb.code === 'PLB' && plb.src === 'discipline');
  const fpm = mat(A, PH, 'IfcPipeSegment', '', 'FP', PIPE_HINT), hf = hue([fpm.color.r, fpm.color.g, fpm.color.b]), hFP = hue(hex(0xcc8844));
  row('FP placeholder pipe material hue == FP DISC_COLORS hue (±1°)', hf && hf.toFixed(1), hFP.toFixed(1), hf != null && Math.abs(hf - hFP) < 1);
  // (b) metalness + (c) envInt
  ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcFlowSegment', 'IfcBeam', 'IfcMember', 'IfcPlate'].forEach(c => {
    const m = mat(A, '0.500,0.500,0.500,1.000', c, '', 'MEP'); row(c + ' (grey, no bare-metal name) metalness 0', m.metalness, 0, m.metalness === 0); });
  ['IfcPipeSegment', 'IfcDuctSegment'].forEach(c => { const m = mat(A, '0.500,0.500,0.500,1.000', c, '', 'MEP'); row(c + ' envMapIntensity = global 0.6 (0.05 override dropped)', m.envMapIntensity, 0.6, m.envMapIntensity === 0.6); });
  const bm = mat(A, '0.500,0.500,0.500,1.000', 'IfcBeam', '', 'STR'); row('IfcBeam envInt 0 kept (red1 2026-08-15)', bm.envMapIntensity, 0, bm.envMapIntensity === 0);
  const wall = mat(A, '0.500,0.500,0.500,1.000', 'IfcWallStandardCase', '', 'ARC'), rail = mat(A, '0.500,0.500,0.500,1.000', 'IfcRailing', '', 'ARC');
  row('out of scope untouched: wall metal 0, railing metal 0.55', wall.metalness + ' / ' + rail.metalness, '0 / 0.55', wall.metalness === 0 && rail.metalness === 0.55);
  // bare metal
  row('bare-metal key from names', ['Galvanized Steel Pipe', 'SS304 stainless', 'Copper - Type L', 'Aluminium duct', 'Pipe'].map(n => A._bareMetalKey('IfcPipeSegment', n, '')).join(','), 'zinc,stainless,copper,aluminum,', ['Galvanized Steel Pipe', 'SS304 stainless', 'Copper - Type L', 'Aluminium duct', 'Pipe'].map(n => A._bareMetalKey('IfcPipeSegment', n, '')).join(',') === 'zinc,stainless,copper,aluminum,');
  row('bare-metal key: authored material name counts; class scope (window "aluminium" out)', A._bareMetalKey('IfcDuctSegment', 'x', 'Copper') + '|' + A._bareMetalKey('IfcWindow', 'Aluminium frame', ''), 'copper|', A._bareMetalKey('IfcDuctSegment', 'x', 'Copper') === 'copper' && A._bareMetalKey('IfcWindow', 'Aluminium frame', '') === '');
  const v = A._elementVariant('IfcPipeSegment', 'Copper - Type L', ''); row('element variant carries it', v, 'metal:copper', v === 'metal:copper');
  const cu = mat(A, PH, 'IfcPipeSegment', 'metal:copper', 'PLB', PIPE_HINT), want = A.BARE_METAL_PBR.copper.lin.map(c => +oe(c).toFixed(6)).join(',');
  row('copper placeholder pipe: metal 1, cited colour sRGB-encoded, no trade hue', cu.metalness + ' ' + col(cu), '1 ' + want, cu.metalness === 1 && col(cu) === want);
  const cu2 = mat(A, '0.300,0.200,0.100,1.000', 'IfcPipeSegment', 'metal:copper', 'PLB'); row('copper pipe WITH its own colour keeps it (data first), metal 1', cu2.metalness + ' ' + col(cu2), '1 0.3,0.2,0.1', cu2.metalness === 1 && col(cu2) === '0.3,0.2,0.1');
  // population: real Hospital FP pipes through the owner
  const DB = path.join(process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), 'buildings', 'Hospital_extracted.db');
  let q = []; try { q = cp.execFileSync('sqlite3', ['-separator', '\t', DB, "select coalesce(discipline,''), coalesce(element_name,''), coalesce(material_name,'') from elements_meta where ifc_class='IfcPipeSegment'"], { maxBuffer: 1 << 26 }).toString().trim().split('\n').map(l => l.split('\t')); } catch (e) {}
  let fpN = 0, fpOk = 0, bare = 0; q.forEach(([d, n, mn]) => { if (A._bareMetalKey('IfcPipeSegment', n, mn)) bare++; if (d !== 'FP') return; fpN++; const t = A._mepTradeHue(d, A._mepNameHint(n)); if (t && t.code === 'FP') fpOk++; });
  row('Hospital IfcPipeSegment FP rows -> FP hue (population, not VACUOUS)', fpOk + '/' + fpN, fpN + '/' + fpN + ' (> 1000)', fpN > 1000 && fpOk === fpN);
  row('Hospital IfcPipeSegment bare-metal names (census, VACUOUS expected on shipped data)', bare, 'reported', true);
  console.log('§D2_POPULATION Hospital IfcPipeSegment rows=' + q.length + ' FP=' + fpN + ' FPtoFP=' + fpOk + ' bareMetalNamed=' + bare);
  return rows;
}
const rows = build();
rows.forEach(r => console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + ' ' + r.name + ' got=' + r.got + ' want=' + r.want));
Witness('d2_mep_metal')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every trade-order / metalness / envInt / bare-metal / population row holds', rs => rs.length >= 18 && rs.every(r => r.ok))
  .redControl(() => { A._metalPbrOff = true; const r = build(); A._metalPbrOff = false; return r; })   // old order + old table: the D2 rows fail
  .run();
