#!/usr/bin/env node
// WITNESS — z9_albedo_srgb: §ZERO Z9 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z9 SPEC", audit #48, §LIGHT_ONE_SCALE L2).
//
// ISSUE THIS PROVES OR DISPROVES: authored IFC albedos are sRGB but were used as linear (ColorManagement off). Z9 decodes them in
// the Alt+S still through LightLaw.srgbToLinear / decodeAlbedo. A decode that differs from three r186's SRGBToLinear (a gamma-2.2
// shortcut, a typo in a constant) would make flat colours disagree with sRGB textures three decodes itself; decoding a GAIN (the
// ground's §GROUND_ALBEDO 2.3 over an already-linear map mean) would blow the ground; a lossy restore would leak the still's
// albedos into navigation. This witness asserts all three numerically. It does NOT prove what the still looks like — that is the
// GPU witness in the spec (refs before/after, judged by numbers).
// Prints INCONCLUSIVE (never PASS) when light_law.js or the r186 function text cannot be loaded.
//
// Command: node viewer/tests/witness_z9_albedo_srgb.js
'use strict';
const fs = require('fs'), path = require('path');

let LL = null;
try { LL = require(path.join(__dirname, '..', 'light_law.js')); } catch (e) { LL = null; }
let r186 = null;
try {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'three.core.min.js'), 'utf8');
  const m = /function SRGBToLinear\(t\)\{return [^}]*\}/.exec(src);
  if (m) r186 = new Function(m[0] + '; return SRGBToLinear;')();
} catch (e) { r186 = null; }
if (!LL || !LL.srgbToLinear || !LL.decodeAlbedo || !r186) {
  console.log('§WITNESS_Z9_ALBEDO_SRGB INCONCLUSIVE ' + (!LL || !LL.srgbToLinear ? 'light_law.js (Z9) not loaded' : 'r186 SRGBToLinear not extracted') + ' — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
function near(a, b, t) { return Math.abs(a - b) <= t; }

// (a) bit-identity vs three r186 over 4097 inputs in [0,1]
let bad = 0, n = 0;
for (let i = 0; i <= 4096; i++) { const c = i / 4096; n++; if (!Object.is(LL.srgbToLinear(c), r186(c))) bad++; }
row('srgbToLinear bit-identical to three r186 SRGBToLinear (' + n + ' inputs)', bad + ' differ', '0 differ', bad === 0);
// (b) hand values (IEC 61966-2-1)
row('0.5 -> 0.21404', LL.srgbToLinear(0.5).toFixed(5), '0.21404', near(LL.srgbToLinear(0.5), 0.21404, 5e-6));
row('0.8 -> 0.60383', LL.srgbToLinear(0.8).toFixed(5), '0.60383', near(LL.srgbToLinear(0.8), 0.60383, 5e-6));
row('0.04 -> 0.003096 (linear toe)', LL.srgbToLinear(0.04).toFixed(6), '0.003096', near(LL.srgbToLinear(0.04), 0.003096, 1e-6));
row('1 -> 1, 0 -> 0 (white/black fixed)', LL.srgbToLinear(1) + ',' + LL.srgbToLinear(0), '1,0', near(LL.srgbToLinear(1), 1, 1e-9) && LL.srgbToLinear(0) === 0);
// (c) decodeAlbedo: in place, returns the original, skips gains and the ground
const wall = { r: 0.5, g: 0.8, b: 0.04 };
const orig = LL.decodeAlbedo(wall);
row('decodeAlbedo converts in place', [wall.r, wall.g, wall.b].map(v => v.toFixed(5)).join(','), '0.21404,0.60383,0.00310',
  near(wall.r, 0.21404, 5e-6) && near(wall.g, 0.60383, 5e-6) && near(wall.b, 0.003096, 1e-6));
row('decodeAlbedo returns the exact original for restore', orig && orig.join(','), '0.5,0.8,0.04', !!orig && orig[0] === 0.5 && orig[1] === 0.8 && orig[2] === 0.04);
const gain = { r: 2.3, g: 2.3, b: 2.3 };
row('a gain (channel > 1, the ground 2.3) is skipped', LL.decodeAlbedo(gain) + ' r=' + gain.r, 'null r=2.3', LL.decodeAlbedo(gain) === null && gain.r === 2.3);
const gnd = { r: 0.333, g: 0.333, b: 0.4 };
row('opts.isGround is skipped', LL.decodeAlbedo(gnd, { isGround: true }) + ' r=' + gnd.r, 'null r=0.333', LL.decodeAlbedo(gnd, { isGround: true }) === null && gnd.r === 0.333);
row('law says decode (ALBEDO.decode = true, authored sRGB)', JSON.stringify(LL.LAW.ALBEDO), '{"authored":"sRGB","decode":true}', LL.LAW.ALBEDO && LL.LAW.ALBEDO.decode === true && LL.LAW.ALBEDO.authored === 'sRGB');
// (d) the magnitude the audit states: mid grey used ×2.34 too bright before the fix
row('audit #48 ratio: 0.5 used as 0.5 vs true 0.214 = ×2.34', (0.5 / LL.srgbToLinear(0.5)).toFixed(2), '2.34', near(0.5 / LL.srgbToLinear(0.5), 2.336, 0.005));
console.log('§Z9_ALBEDO_UNIT inputs=' + n + ' differ=' + bad + ' mid0.5=' + LL.srgbToLinear(0.5).toFixed(5) + ' lawHash=' + LL.snapshot().lawHash);

rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('z9_albedo_srgb')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every decode / skip / restore row holds', rs => rs.length >= 10 && rs.every(r => r.ok))
  .redControl(rs => { const g22 = c => Math.pow(c, 2.2); let d = 0; for (let i = 0; i <= 4096; i++) if (!Object.is(g22(i / 4096), r186(i / 4096))) d++;
    rs[0].ok = d === 0; return rs; })   // a gamma-2.2 shortcut must fail bit-identity
  .run();
