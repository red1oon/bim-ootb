#!/usr/bin/env node
// WITNESS — z12_ground_penumbra: §ZERO Z12 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z12 SPEC", audit #21/#57, L1/L2).
//
// ISSUE THIS PROVES OR DISPROVES: (1) the hemi's ground half was a fixed hex (0x8b7355 x hemi I = 0.571 u upward) regardless of the
// ground's albedo or the sun on it; Z12 derives it as rho_g x (sun x sinE x f + E_sky) through LightLaw (L2: L = rho E / pi, the
// upward irradiance from a Lambertian plane is pi L = rho E). This witness checks the formula against the §LIGHT_TRUTH_AUDIT row #21
// numbers (1.458 u upward, 0.73 u on a vertical wall vs today's 0.286), the groundColor round trip, and that the old hex fails the
// rule. (2) the sun penumbra: today's PCF width is a per-cascade constant; the law is w = d tan(0.53 deg). The witness checks
// penumbra(d) and the dMatch arithmetic the §SUN_PENUMBRA line prints. It does NOT prove the rendered still (GPU witness, spec).
// Prints INCONCLUSIVE (never PASS) when light_law.js (Z12) cannot be loaded.
//
// Command: node viewer/tests/witness_z12_ground_penumbra.js
'use strict';
const path = require('path');
let LL = null;
try { LL = require(path.join(__dirname, '..', 'light_law.js')); } catch (e) {}
if (!LL || !LL.groundIrradiance || !LL.groundColor || !LL.penumbra) {
  console.log('§WITNESS_Z12_GROUND_PENUMBRA INCONCLUSIVE light_law.js (Z12: groundIrradiance/groundColor/penumbra) not loaded — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
function near(a, b, t) { return Math.abs(a - b) <= t; }
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// audit #21 inputs: rho_g 0.36 (effects.js §GROUND_ALBEDO effAlbedo), sun 4.4 at 45 deg, horizontal sky 0.760 x 1.234 = 0.938 u
const sinE = Math.SQRT1_2, skyE = 0.760 * 1.234, hemiI = 1.234;
const Eg = LL.groundIrradiance(1, 4.4, sinE, skyE, 1);
row('E_g = 4.4 sin45 + 0.938 = 4.049 u (92 klx at 22,727 lx/u)', Eg.toFixed(3), '4.049', near(Eg, 4.4 * sinE + skyE, 1e-12) && near(Eg, 4.049, 5e-4));
const up = LL.groundIrradiance(0.36, 4.4, sinE, skyE, 1);
row('upward = rho E_g = 0.36 x 4.049 = 1.458 u', up.toFixed(3), '1.458', near(up, 1.4577, 5e-4));
row('vertical wall ground half (three hemi weight 0.5) = 0.729 u (audit #21: 0.73)', (0.5 * up).toFixed(3), '0.729', near(0.5 * up, 0.729, 5e-4));
const oldHex = [0x8b / 255, 0x73 / 255, 0x55 / 255], oldUp = lum(oldHex) * hemiI;
row('today: lum(0x8b7355) x 1.234 = 0.571 u upward, wall half 0.286 (audit)', oldUp.toFixed(3) + ' / ' + (0.5 * oldUp).toFixed(3), '0.571 / 0.286', near(oldUp, 0.5709, 5e-4) && near(0.5 * oldUp, 0.2855, 5e-4));
row('today = 0.39x the law upward (the ground half alone; −1.35 stop)', (oldUp / up).toFixed(2), '0.39', near(oldUp / up, 0.3917, 0.005));
const gc = LL.groundColor([0.36, 0.36, 0.36], Eg, hemiI);
row('groundColor x hemiI = rho x E_g (round trip, per channel)', (gc[0] * hemiI).toFixed(6), up.toFixed(6), near(gc[0] * hemiI, up, 1e-12));
row('ground in full shadow (f = 0): upward = rho x E_sky = 0.338 u', LL.groundIrradiance(0.36, 4.4, sinE, skyE, 0).toFixed(3), '0.338', near(LL.groundIrradiance(0.36, 4.4, sinE, skyE, 0), 0.36 * skyE, 1e-12));
row('sun below the horizon (sinE < 0): sky only', LL.groundIrradiance(0.36, 4.4, -0.2, skyE, 1).toFixed(3), (0.36 * skyE).toFixed(3), near(LL.groundIrradiance(0.36, 4.4, -0.2, skyE, 1), 0.36 * skyE, 1e-12));
row('law default f = LightLaw.GROUND.sunlitFraction = 1', LL.GROUND.sunlitFraction, 1, LL.GROUND.sunlitFraction === 1);
// penumbra
row('penumbra(10 m) = 10 tan(0.53 deg) = 0.0925 m', LL.penumbra(10).toFixed(4), '0.0925', near(LL.penumbra(10), 0.09251, 1e-5));
row('sun disc = 0.53 deg (Frostbite fn 29: 6.6-7.1e-5 sr => 0.52-0.54 deg)', LL.SUN.discDeg, 0.53, LL.SUN.discDeg === 0.53 &&
  near(2 * Math.sqrt(6.6e-5 / Math.PI) * 180 / Math.PI, 0.525, 0.005) && near(2 * Math.sqrt(7.1e-5 / Math.PI) * 180 / Math.PI, 0.545, 0.005));
const texel = 100 / 4096, dMatch = (2 * 1.5 + 1) * texel / LL.penumbra(1);
row('dMatch for a 4096 map over 100 m at R 1.5: 4 x 0.0244 / 0.00925 = 10.56 m', dMatch.toFixed(2), '10.56', near(dMatch, 10.556, 0.01));
console.log('§Z12_GROUND_UNIT Eg=' + Eg.toFixed(3) + ' upward=' + up.toFixed(3) + ' today=' + oldUp.toFixed(3) + ' ratio=' + (oldUp / up).toFixed(3) + ' penumbra10=' + LL.penumbra(10).toFixed(4) + ' dMatch=' + dMatch.toFixed(2) + ' lawHash=' + LL.snapshot().lawHash);

rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('z12_ground_penumbra')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every ground / penumbra row holds', rs => rs.length >= 12 && rs.every(r => r.ok))
  .redControl(rs => { rs[1].ok = near(oldUp, up, 0.01); return rs; })   // the old fixed hex must fail the rho x E rule
  .run();
