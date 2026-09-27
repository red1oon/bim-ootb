#!/usr/bin/env node
// WITNESS — z20_porcelain: §ZERO Z20 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z20 SPEC").
// ISSUE THIS PROVES OR DISPROVES: no porcelain/ceramic/sanitary finish rule existed — toilet bowls rendered with their class's
// generic finish (Hospital proxies matte 0.5 roughness; HHS NULL proxies TEAL; JKR NULL WCs plumbing PURPLE via MEP tier 2).
// Proves on the SHIPPED owners: the census rows (real names/classes/materials from the fleet DBs) are in/out exactly; the porcelain
// material keeps the element's own colour, takes the cited physicallybased.info Porcelain roughness (0, floored at §refl 0.08) and
// metalness 0; NULL/placeholder fixtures take STD_MAT.IfcSanitaryTerminal ceramic; per-building counts from the DBs; red control.
// Command: node viewer/tests/witness_z20_porcelain.js
'use strict';
const path = require('path'), cp = require('child_process'), os = require('os');
let L = null; try { L = require('./_colour_truth_load.js').loadStreaming(); } catch (e) { console.log('§WITNESS_Z20_PORCELAIN INCONCLUSIVE streaming.js did not load: ' + e.message); process.exitCode = 2; return; }
const { mat, col } = require('./_colour_truth_load.js'), A = L.A;
if (!A._porcelainKey || !A.PORCELAIN_PBR) { console.log('§WITNESS_Z20_PORCELAIN INCONCLUSIVE owner not published'); process.exitCode = 2; return; }
const { Witness } = require('../../witness_kit/contract');
const rows = []; const row = (name, got, want, ok) => rows.push({ name, got: String(got), want: String(want), ok: !!ok });
// census rows [class, element_name, material_name, expected] — copied from the spec's fleet census
const C = [
  ['IfcBuildingElementProxy', 'Toilet-Wall-Mounted_:Toilet-Wall-Mounted:454944', '', true],
  ['IfcBuildingElementProxy', 'Sink_Wall-Mounted:Sink_Wall-Mounted:462163', '', true],
  ['IfcBuildingElementProxy', 'M_Urinal - Wall Hung:20 mm Flush Valve:597816', '', true],
  ['IfcBuildingElementProxy', 'Urinal-Wall-3D:Urinal-Wall-3D:722532', '', true],
  ['IfcFlowTerminal', 'M_Lavatory - Oval:535 mmx485 mm - Public:535 mmx48', '', true],
  ['IfcFlowTerminal', 'M_Water Closet - Flush Valve - Wall Mounted:Public', '', true],
  ['IfcFlowTerminal', 'jkr13AR_plm_(TD2)-3 WC:(TD2) tandas duduk:1205413', '', true],
  ['IfcFurnishingElement', 'WC', 'tomt mönster', false],   // LTU: authored name that is not porcelain decides
  ['IfcFlowTerminal', 'WC Toilet:Toilet-Domestic-3D:2565467', 'Porcelain - Linen', true],
  ['IfcFlowTerminal', 'Urinal_-_Floor_Mounted_3934:Floor Mount:2744502', 'Fixtures - Porcelain - Ivory', true],
  ['IfcFlowTerminal', '005_915x535_single_end_bowl_sink:36" x 21":2559630', 'Metal - Steel, Polished', false],
  ['IfcFlowTerminal', 'MRV basic round sink:6" Deep:2585393', '<Unnamed>', false],
  ['IfcSanitaryTerminal', 'anything', '', true],
  ['IfcSpace', 'TOILET', '', false],
  ['IfcOpeningElement', 'M_Counter Top w Sink Hole:600mm Depth', '', false],
  ['IfcWallStandardCase', 'Basic Wall:Interior - Toilet Partition (25mm):4114', '', false],
  ['IfcDoor', 'M_Toilet Partition:0865 x 1500mm', '', false],
  ['IfcFlowController', 'Lavatory Faucet:Lavatory Faucet:Lavatory Faucet:11', '', false],
  ['IfcFurnishingElement', 'M_Counter Top w Sink Hole:600mm Depth:600mm Depth:', '', false],
  ['IfcFurnishingElement', 'M_Vanity Cabinet-Double Door Sink Unit:650 x 450 m', '', false],
  ['IfcBuildingElementProxy', '10_Urinal Screen:24":722501', '', false],
  ['IfcFlowTerminal', 'jkrAR15_plm-fx_(B02) Hand Bidet Flexible Hose:(B02', '', false],
  ['IfcBuildingElementProxy', 'Indoor AHU - Horizontal - Chilled Water Coil:WCPU-', '<Unnamed>', false],
  ['IfcBuildingElementProxy', 'JWCC_Mask_Dispenser:JWCC_Mask_Dispenser:486679', '', false],
  ['IfcWall', 'Basic Wall:A_Wall_Ext_150mm_CeramicPaint_V1:121472', 'Basic Wall:A_Wall_Ext_150mm_CeramicPaint_V1', false],
];
C.forEach(c => { const k = A._porcelainKey(c[0], c[1], c[2]); row((c[3] ? 'IN  ' : 'OUT ') + c[0] + ' "' + c[1].slice(0, 40) + '" [' + c[2] + ']', k || '-', c[3] ? 'match' : '-', !!k === c[3]); });
// finish: own colour kept, cited roughness, metal 0, no triplanar
const want = Math.max(0.08, A.PORCELAIN_PBR.roughness);
row('cited source + value', A.PORCELAIN_PBR.src + ' r=' + A.PORCELAIN_PBR.roughness + ' m=' + A.PORCELAIN_PBR.metalness, 'physicallybased.info Porcelain r=0 m=0', /physicallybased\.info/.test(A.PORCELAIN_PBR.src) && A.PORCELAIN_PBR.roughness === 0 && A.PORCELAIN_PBR.metalness === 0);
const own = mat(A, '0.949,0.953,0.953,1.000', 'IfcBuildingElementProxy', 'porcelain', 'PLB');
row('Hospital toilet keeps own white, taming as every white (x0.92)', col(own), [0.949, 0.953, 0.953].map(v => +(v * 0.92).toFixed(6)).join(','), col(own) === [0.949, 0.953, 0.953].map(v => +(v * 0.92).toFixed(6)).join(','));
row('porcelain roughness / metalness / env / tri', own.roughness + ' / ' + own.metalness + ' / ' + own.envMapIntensity + ' / ' + own.userData._triSrc, want + ' / 0 / 0.6 / porcelain', own.roughness === want && own.metalness === 0 && own.envMapIntensity === 0.6 && own.userData._triSrc === 'porcelain');
const base = mat(A, '0.949,0.953,0.953,1.000', 'IfcBuildingElementProxy', '', 'PLB');
row('same row WITHOUT the variant = old finish (proves the variant is what moved it)', base.roughness + ' / ' + base.metalness, '0.375 / 0.1', base.roughness === 0.375 && base.metalness === 0.1);
const nul = mat(A, null, 'IfcFlowTerminal', 'porcelain', 'PLB'), ph = mat(A, '0.920,0.900,0.850,1.000', 'IfcFlowTerminal', 'porcelain', 'PLB'), hhs = mat(A, null, 'IfcBuildingElementProxy', 'porcelain', 'MEP');
row('NULL / placeholder / HHS NULL proxy fixture -> ceramic 0.88,0.88,0.85 (not purple, not teal)', col(nul) + ' | ' + col(ph) + ' | ' + col(hhs), '0.88,0.88,0.85 x3', [nul, ph, hhs].every(m => col(m) === '0.88,0.88,0.85'));
const noPorc = mat(A, null, 'IfcFlowTerminal', '', 'PLB');
row('control: the same NULL PLB terminal without the variant is tier-2 purple', col(noPorc), '0.533333,0.266667,0.8', col(noPorc) === '0.533333,0.266667,0.8');
// per-building counts through the shipped rollup
const root = process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), per = {};
['Hospital', 'Clinic', 'Duplex', 'HHS_Office_Federated', 'JKR', 'LTU_AHouse', 'Terminal'].forEach(b => {
  let q = []; try { q = cp.execFileSync('sqlite3', ['-separator', '\t', path.join(root, 'buildings', b + '_extracted.db'), "select m.guid,'',coalesce(m.material_rgba,''),m.discipline,0,0,0,0,0,0,m.storey,m.ifc_class,replace(coalesce(m.element_name,''),char(9),' '),0,0,0,coalesce(m.material_name,'') from elements_meta m"], { maxBuffer: 1 << 28 }).toString().trim().split('\n').map(l => l.split('\t')).map(r => { if (!r[2]) r[2] = null; return r; }); } catch (e) {}
  A.streamQueue = q; A.activeBuilding = b; L.logs.length = 0; const R = q.length ? A._colourTruthRollup() : null; per[b] = R ? R.porcelain : null;
  L.logs.filter(l => /§PORCELAIN/.test(l)).forEach(l => console.log(l));
});
row('Hospital matched = 282 toilets + 119+20 sinks + 12+13 urinals + 1-sink rows (>= 446)', per.Hospital, '>= 446', per.Hospital >= 446);
row('every building judged (DB read)', JSON.stringify(per), 'no null', Object.values(per).every(v => v !== null));
rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
console.log('§Z20_UNIT rows=' + rows.length + ' ok=' + rows.filter(r => r.ok).length + ' perBuilding=' + JSON.stringify(per) + ' roughness=' + want);
Witness('z20_porcelain')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('census in/out + finish + counts hold', rs => rs.length >= 30 && rs.every(r => r.ok))
  .redControl(rs => { const bent = /(^|[^a-z0-9])(lavatory|water closet|urinal|sink|basin|toilet|wc|bidet)([^a-z0-9]|$)/i;   // accessory words removed
    C.forEach((c, i) => { if (!c[3] && !A._isAuthoredMatName(c[2]) && c[0] !== 'IfcSpace' && /Terminal|Proxy|Furnishing/.test(c[0]) && bent.test(c[1])) rs[i].ok = false; }); return rs; })
  .run();
