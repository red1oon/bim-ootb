#!/usr/bin/env node
// WITNESS — z18_gridblend: §ZERO Z18 switch (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md Z18 + §LIGHT_TRUTH_AUDIT C causes 3/4).
//
// ISSUE (updated by ### Z18 DIAGNOSIS): the teeth are the §GLASS_SPEC_GATE binary mirror march -> Z18-5 §SPEC_SMOOTH (default ON).
// &gridblend (Z18-1..4) is the earlier hypothesis (ruled out as the cause); kept default OFF, harmless, witnessed.
// ISSUE THIS PROVES OR DISPROVES: red1's HHS still shows two-tier stair-stepped shadow edges. Suspected cause: the zone-grid terms step
// on the 0.5 m cell outline — the field stencil (sourced_light.js slFragZone, 8 texels) DROPS texels of another zone, and IR is ONE
// value per zone, so where two zones of one visible space meet the sky-view F / Gd / IR jump at the boundary. &gridblend=1
// (uSLSky.z) keeps other-zone texels (SOLID still rejected; cove stays own-zone) and blends IR by the same stencil.
// This witness proves, without a GPU:
//   Z18-1 the shader text: uSLIr is declared before slFragZone uses it; the zone gate is skipped only when uSLSky.z > 0.5; the cove
//         accumulates own-zone texels only; slIr() returns the blended value when set; braces/parens balance in the patched pars;
//   Z18-2 the CPU mirror (LightZones.skyField(p, n, blend), same stencil as the shader) on a synthetic floor crossing a zone
//         boundary inside one open room: OFF steps (max jump per 1 cm > 0.2 = the defect reproduced, else INCONCLUSIVE),
//         ON is continuous (max jump per 1 cm < 0.02);
//   Z18-3 across a SOLID wall the blend changes nothing (no light through walls);
//   Z18-4 the switch: default OFF, &gridblend=1 / APP._stillGridBlend = true ON.
// It does NOT prove the diagnosis (that the HHS steps ARE this cause) — that is the GPU agent's ### Z18 DIAGNOSIS; nor the rendered
// still (GPU harness row G2 gridblend + the step-count proxy).
// redControl: the blend arm replaced by the OFF values must fail Z18-2.
//
// Command: node viewer/tests/witness_z18_gridblend.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');
let PARS = null, SL = null, LZ = null;
try {
  const src = fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8'), a = src.indexOf('var PARS = ['), b = src.indexOf("].join('\\n');", a);
  if (a >= 0 && b > a) PARS = vm.runInNewContext(src.slice(a + 'var PARS = '.length, b + 1) + ".join('\\n')", {});
  const win = { LightLaw: require(path.join(V, 'light_law.js')), location: { search: '' } }; win.window = win;
  vm.runInNewContext(src, { window: win, console: { log() {}, warn() {} }, location: win.location }); SL = win.SourcedLight;
  const w2 = { location: { search: '' } }; w2.window = w2;
  vm.runInNewContext(fs.readFileSync(path.join(V, 'light_zones.js'), 'utf8'), { window: w2, console: { log() {}, warn() {} }, location: w2.location, performance: { now: () => Date.now() } }); LZ = w2.LightZones;
} catch (e) { console.log('    (load failed: ' + e.message + ')'); }
if (!PARS || !SL || !SL.gridBlendOn || !LZ || !LZ._testField) { console.log('§WITNESS_Z18_GRIDBLEND INCONCLUSIVE missing: ' + [!PARS && 'PARS', (!SL || !SL.gridBlendOn) && 'SourcedLight.gridBlendOn', (!LZ || !LZ._testField) && 'LightZones._testField'].filter(Boolean).join(', ')); process.exitCode = 2; return; }

const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
// ── Z18-1 shader text
const iDecl = PARS.indexOf('uniform highp sampler2D uSLIr;'), iFZ = PARS.indexOf('float slFragZone('), iUse = PARS.indexOf('texelFetch( uSLIr');
row('Z18-1 uSLIr declared before slFragZone / first use', iDecl + ' < ' + iFZ + ' <= ' + iUse, 'declared first', iDecl >= 0 && iDecl < iFZ && iFZ < iUse);
row('Z18-1 zone gate skipped only when uSLSky.z > 0.5', /if \( !own && uSLSky\.z < 0\.5 \) continue;/.test(PARS), 'true', /if \( !own && uSLSky\.z < 0\.5 \) continue;/.test(PARS));
row('Z18-1 cove accumulates own-zone texels only', /if \( cv && own \)/.test(PARS), 'true', /if \( cv && own \)/.test(PARS));
row('Z18-1 slIr returns the blended IR when set', /if \( _slIrB\.x >= 0\.0 \) return _slIrB \* uSLIrP\.y;/.test(PARS), 'true', /if \( _slIrB\.x >= 0\.0 \) return _slIrB \* uSLIrP\.y;/.test(PARS));
const bal = (o, c) => PARS.split(o).length - PARS.split(c).length;
row('Z18-1 braces / parens balance in the patched pars', 'braces ' + bal('{', '}') + ' parens ' + bal('(', ')'), '0 0', bal('{', '}') === 0 && bal('(', ')') === 0);
// ── Z18-2/3 CPU mirror on a synthetic room: floor slab j = 0; zone 1 (i < 10) and zone 2 (i >= 10) share one open room (no wall);
// a second pair (k >= 10) is split by a SOLID wall at i = 10. F set per zone: 0.2 / 0.6.
const SOLID = LZ.SOLID, nx = 20, ny = 8, nz = 20, nxy = nx * ny, N = nxy * nz, at = (i, j, k) => i + j * nx + k * nxy;
const zone = new Uint16Array(N);
for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { zone[at(i, 0, k)] = SOLID; zone[at(i, 7, k)] = SOLID; for (let j = 1; j < 7; j++) zone[at(i, j, k)] = i < 10 ? 1 : 2; }
for (let j = 1; j < 7; j++) for (let k = 11; k < nz; k++) zone[at(10, j, k)] = SOLID;
const Z = { bld: 'Z18SYN', nx, ny, nz, cell: 0.5, org: { x: 0, y: 0, z: 0 }, zone, glassT: new Uint8Array(N), groundJ: 1, zones: 2, zoneInfo: [{ surfaceM2: 50, apertureM2: 0 }, { surfaceM2: 50, apertureM2: 0 }] };
LZ._testField({ activeBuilding: 'Z18SYN', _stillGroundView: false, _stillSkyShell: false }, Z);
for (let c = 0; c < N; c++) { const t = zone[c]; if (t === SOLID) continue; Z.field.G[c] = (t & LZ.ZONE_MASK) === 1 ? 2000 : 6000; }
function line(z, blend) { let prev = null, maxJ = 0, vals = []; for (let x = 3.0; x <= 7.0 + 1e-9; x += 0.01) { const r = LZ.skyField({ x, y: 0.5, z }, { x: 0, y: 1, z: 0 }, blend); const F = r.F; vals.push(F); if (prev != null && F != null) maxJ = Math.max(maxJ, Math.abs(F - prev)); prev = F; } return { maxJ, vals }; }
const open0 = line(2.25, false), open1 = line(2.25, true), wall0 = line(7.25, false), wall1 = line(7.25, true);
console.log('    open room across the zone boundary: max jump per cm OFF ' + open0.maxJ.toFixed(4) + ' ON ' + open1.maxJ.toFixed(4) + ' | across a wall: OFF ' + wall0.maxJ.toFixed(4) + ' ON ' + wall1.maxJ.toFixed(4));
if (!(open0.maxJ > 0.2)) { console.log('§WITNESS_Z18_GRIDBLEND INCONCLUSIVE the OFF arm did not reproduce the step (max jump ' + open0.maxJ.toFixed(4) + ' <= 0.2) — the mirror cannot judge the fix'); process.exitCode = 2; return; }
row('Z18-2 OFF arm reproduces the zone-boundary step', open0.maxJ.toFixed(4), '> 0.2', open0.maxJ > 0.2);
row('Z18-2 ON arm continuous across the zone boundary', open1.maxJ.toFixed(4), '< 0.02', open1.maxJ < 0.02);
const wallSame = wall0.vals.every((v, i) => (v == null && wall1.vals[i] == null) || Math.abs(v - wall1.vals[i]) < 1e-12);
row('Z18-3 across a SOLID wall the blend changes nothing', wallSame, 'true', wallSame);
// ── Z18-5 §SPEC_SMOOTH (### Z18 DIAGNOSIS: the stepped tier is the §GLASS_SPEC_GATE binary march): a roof hole (j = 7, i >= 14) and
// a floor point whose mirror ray (eye 3 m back, 2.5 m up) climbs toward the hole edge; sweep the point along x (1 cm) and compare
// the binary gate (today) with the smooth transmittance gate (LightZones.specVis(p, n, eye, true) = the shader's uSLSky.w path)
for (let i = 14; i < nx; i++) for (let k = 0; k < nz; k++) zone[at(i, 7, k)] = 0;
function specLine(smooth) { let prev = null, maxJ = 0, n = 0, lo = 1, hi = 0; for (let x = 2.0; x <= 9.0 + 1e-9; x += 0.01) { const r = LZ.specVis({ x, y: 0.5, z: 2.25 }, { x: 0, y: 1, z: 0 }, { x: x - 3, y: 3.0, z: 2.25 }, smooth); if (!r) continue; n++; lo = Math.min(lo, r.spec); hi = Math.max(hi, r.spec); if (prev != null) maxJ = Math.max(maxJ, Math.abs(r.spec - prev)); prev = r.spec; } return { maxJ, n, lo, hi }; }
const sp0 = specLine(false), sp1 = specLine(true);
console.log('    mirror gate along the floor: binary max jump/cm ' + sp0.maxJ.toFixed(4) + ' (range ' + sp0.lo.toFixed(3) + '..' + sp0.hi.toFixed(3) + ') | smooth ' + sp1.maxJ.toFixed(4) + ' (range ' + sp1.lo.toFixed(3) + '..' + sp1.hi.toFixed(3) + ') samples ' + sp1.n);
if (!(sp0.maxJ > 0.3)) { console.log('§WITNESS_Z18_GRIDBLEND INCONCLUSIVE the binary gate did not reproduce the teeth (max jump ' + sp0.maxJ.toFixed(4) + ')'); process.exitCode = 2; return; }
row('Z18-5 binary mirror gate reproduces the teeth (jump F -> 1)', sp0.maxJ.toFixed(4), '> 0.3', sp0.maxJ > 0.3);
row('Z18-5 smooth gate continuous (max jump per cm < 0.05)', sp1.maxJ.toFixed(4), '< 0.05', sp1.maxJ < 0.05);
row('Z18-5 smooth gate spans the same range (not flattened)', sp1.lo.toFixed(3) + '..' + sp1.hi.toFixed(3), 'lo <= 0.3, hi >= 0.9', sp1.lo <= 0.3 && sp1.hi >= 0.9);
row('Z18-5 shader: smooth march present, gated by uSLSky.w, binary kept for &specsmooth=0', /if \( uSLSky\.w > 0\.5 \) \{ float P = 0\.0, Tr = 1\.0;/.test(PARS) && /if \( t == 65535u \) \{ if \( k >= 4 \) return base; \}/.test(PARS), 'true', /if \( uSLSky\.w > 0\.5 \) \{ float P = 0\.0, Tr = 1\.0;/.test(PARS) && /if \( t == 65535u \) \{ if \( k >= 4 \) return base; \}/.test(PARS));
row('Z18-5 switch: default ON, &specsmooth=0 / APP._stillSpecSmooth=false OFF', SL.specSmoothOn({}) + '/' + SL.specSmoothOn({ _stillSpecSmooth: false }), 'true/false', SL.specSmoothOn({}) === true && SL.specSmoothOn({ _stillSpecSmooth: false }) === false);
// ── Z18-4 switch
row('Z18-4 default OFF', SL.gridBlendOn({}), 'false', SL.gridBlendOn({}) === false);
row('Z18-4 APP._stillGridBlend = true -> ON', SL.gridBlendOn({ _stillGridBlend: true }), 'true', SL.gridBlendOn({ _stillGridBlend: true }) === true);
rows.forEach(r => console.log('    ' + (r.ok ? 'ok  ' : 'BAD ') + r.name + ': got ' + r.got + ' want ' + r.want));

const { Witness } = require('../../witness_kit/contract');
Witness('Z18_GRIDBLEND')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every Z18 row holds', rs => rs.length >= 15 && rs.every(r => r.ok))
  .redControl(rs => rs.map(r => /ON arm continuous/.test(r.name) ? Object.assign({}, r, { got: open0.maxJ.toFixed(4), ok: open0.maxJ < 0.02 }) : /smooth gate continuous/.test(r.name) ? Object.assign({}, r, { got: sp0.maxJ.toFixed(4), ok: sp0.maxJ < 0.05 }) : r))
  .run();
