#!/usr/bin/env node
// WITNESS — z21_placeholder_colour: §ZERO Z21 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z21 SPEC").
// ISSUE THIS PROVES OR DISPROVES: the exporter default 0.920,0.900,0.850 (~60k Hospital elements, empty material_name) is NO colour,
// yet every non-MEP class kept it as cream although STD_MAT has a sourced class default (beam/member steel, column concrete, ...).
// Proves, on the SHIPPED _getMaterial: detection is exact; STD_MAT classes take their default colour (rough/metal unchanged);
// MEP tier 2 output is byte-identical to the rule off; proxies / no-STD_MAT classes / real colours are byte-identical; red control.
// Also counts the real Hospital DB population the rule moves (sqlite3), so the witness cannot pass on an empty population.
// Command: node viewer/tests/witness_z21_placeholder_colour.js
'use strict';
const path = require('path'), cp = require('child_process'), os = require('os');
let L = null; try { L = require('./_colour_truth_load.js').loadStreaming(); } catch (e) { console.log('§WITNESS_Z21_PLACEHOLDER_COLOUR INCONCLUSIVE streaming.js did not load: ' + e.message); process.exitCode = 2; return; }
const { mat, col } = require('./_colour_truth_load.js'), A = L.A;
if (!A._isExporterPlaceholder || !A._stdMatClasses && !mat(A, null, 'IfcBeam')) { console.log('§WITNESS_Z21_PLACEHOLDER_COLOUR INCONCLUSIVE owner not published'); process.exitCode = 2; return; }
const { Witness } = require('../../witness_kit/contract');
const rows = []; const row = (name, got, want, ok) => rows.push({ name, got: String(got), want: String(want), ok: !!ok });
const PH = '0.920,0.900,0.850,1.000', STD = A._stdMatClasses;
// 1. detection
[['0.920,0.900,0.850,1.000', '', true], ['0.920,0.900,0.850', '', true], ['0.920,0.900,0.850,0.250', '', false], ['0.921,0.900,0.850,1.000', '', false],
 ['0.920,0.900,0.850,1.000', 'Concrete', false], ['0.920,0.900,0.850,1.000', '≈ Off-White', true], [null, '', false]].forEach(c =>
  row('detect ' + c[0] + ' name="' + c[1] + '"', A._isExporterPlaceholder(c[0], c[1]), c[2], A._isExporterPlaceholder(c[0], c[1]) === c[2]));
// 2. STD_MAT classes take the default colour, finish unchanged
['IfcBeam', 'IfcMember', 'IfcColumn', 'IfcFooting', 'IfcCovering', 'IfcDoor', 'IfcFurnishingElement'].forEach(c => {
  const m = mat(A, PH, c, '', 'ARC'), s = STD[c], want = [s.r, s.g, s.b].map(v => +v.toFixed(6)).join(',');
  A._placeholderOff = true; const off = mat(A, PH, c, '', 'ARC'); A._placeholderOff = false;
  row(c + ' placeholder -> STD_MAT colour (rough/metal as off)', col(m) + ' r=' + m.roughness + ' m=' + m.metalness, want + ' r=' + off.roughness + ' m=' + off.metalness,
    col(m) === want && m.roughness === off.roughness && m.metalness === off.metalness && col(off) !== want);
});
// 3. byte-identical: MEP tier 2, proxy, no STD_MAT, real colour, authored name
[[PH, 'IfcPipeSegment', 'FP', ''], [PH, 'IfcDuctSegment', 'MEP', ''], [PH, 'IfcBuildingElementProxy', 'MEP', ''], [PH, 'IfcOpeningElement', 'ARC', ''],
 [PH, 'IfcDistributionControlElement', 'FP', ''], ['0.843,0.137,0.102,1.000', 'IfcPipeFitting', 'FP', ''], ['0.500,0.500,0.500,1.000', 'IfcBeam', 'STR', ''],
 [PH, 'IfcBeam', 'STR', 'Steel S355'], ['0.920,0.900,0.850,0.250', 'IfcMember', 'ARC', '']].forEach(c => {
  const on = mat(A, c[0], c[1], '', c[2], null, c[3]); A._placeholderOff = true; const off = mat(A, c[0], c[1], '', c[2], null, c[3]); A._placeholderOff = false;
  const a = col(on) + '|' + on.roughness + '|' + on.metalness + '|' + on.envMapIntensity + '|' + (on.opacity || 1), b = col(off) + '|' + off.roughness + '|' + off.metalness + '|' + off.envMapIntensity + '|' + (off.opacity || 1);
  row('untouched ' + c[1] + ' ' + c[0] + ' "' + c[3] + '"', a, b, a === b);
});
// 4. cache key carries the red control
A._matCache = {}; const k1 = mat(A, PH, 'IfcBeam', '', 'STR'); A._placeholderOff = true; const k2 = A._getMaterial(PH, 'IfcBeam', '', 'STR', null, ''); A._placeholderOff = false;
row('cache: flag flip is never served the other material', col(k1) + ' vs ' + col(k2), 'differ', col(k1) !== col(k2));
// 5. real population (Hospital DB), through the shipped rollup
const DB = path.join(process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), 'buildings', 'Hospital_extracted.db');
let q = []; try { q = cp.execFileSync('sqlite3', ['-separator', '\t', DB, "select m.guid,'',m.material_rgba,m.discipline,0,0,0,0,0,0,m.storey,m.ifc_class,m.element_name,0,0,0,coalesce(m.material_name,'') from elements_meta m"], { maxBuffer: 1 << 28 }).toString().trim().split('\n').map(l => l.split('\t')); } catch (e) {}
A.streamQueue = q; A.activeBuilding = 'Hospital'; L.logs.length = 0; const R = q.length ? A._colourTruthRollup() : null;
L.logs.filter(l => /§PLACEHOLDER/.test(l)).forEach(l => console.log(l));
row('Hospital population judged (not VACUOUS)', R ? R.placeholder : 'no DB', '> 50000', R && R.placeholder > 50000);
row('Hospital replaced: IfcMember + IfcBeam + IfcColumn all moved', R ? JSON.stringify({ m: R.byCls.IfcMember, b: R.byCls.IfcBeam, c: R.byCls.IfcColumn }) : 'no DB', 'm 6635 b 1970 c 506', R && R.byCls.IfcMember === 6635 && R.byCls.IfcBeam === 1970 && R.byCls.IfcColumn === 506);
row('Hospital proxies kept (teal flag not applied)', R ? R.proxy : 'no DB', '> 4900', R && R.proxy > 4900 && !R.byCls.IfcBuildingElementProxy);
rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
console.log('§Z21_UNIT rows=' + rows.length + ' ok=' + rows.filter(r => r.ok).length);
Witness('z21_placeholder_colour')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every detection / mapping / identity / population row holds', rs => rs.length >= 20 && rs.every(r => r.ok))
  .redControl(rs => { A._placeholderOff = true; const m = mat(A, PH, 'IfcBeam', '', 'STR'); A._placeholderOff = false; const b = rs.find(r => /^IfcBeam placeholder/.test(r.name)); b.ok = col(m) === [STD.IfcBeam.r, STD.IfcBeam.g, STD.IfcBeam.b].map(v => +v.toFixed(6)).join(','); return rs; })
  .run();
