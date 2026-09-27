#!/usr/bin/env node
// WITNESS — z10_ao_indirect: §ZERO Z10 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z10 SPEC", audit #54/#55, L2).
//
// ISSUE THIS PROVES OR DISPROVES: the Alt+S AO (N8AO) multiplied the WHOLE finished frame — direct sun and lamps included — with a
// screen-pixel radius whose world size grows with depth. Z10 moves AO into the materials' INDIRECT terms (three's own aoMap maths,
// sourced_light.js aoPatch) with a world radius from LightLaw.AO. This witness proves, on the REAL three r186 aomap_fragment text,
// that the patch occludes only reflectedLight.indirectDiffuse / indirectSpecular (never direct*), is gated by uSLAo.x (0 = today's
// picture), is limited to lit materials, and keeps the original chunk byte-for-byte; that the law radius equals the sky-view field
// cell it is derived from; and states the maths of the change (direct light kept; radius fixed in metres).
// It does NOT prove the rendered still — that is the GPU witness in the spec.
// Prints INCONCLUSIVE (never PASS) when the r186 chunk, sourced_light.js or light_law.js cannot be loaded.
//
// Command: node viewer/tests/witness_z10_ao_indirect.js
'use strict';
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..');

function chunk(src, name) {   // the JS string literal `name:"..."` in the minified three, decoded
  const k = src.indexOf(name + ':"'); if (k < 0) return null;
  let i = k + name.length + 2, out = '';
  for (; i < src.length; i++) { const ch = src[i]; if (ch === '\\') { out += ch + src[i + 1]; i++; continue; } if (ch === '"') break; out += ch; }
  try { return JSON.parse('"' + out + '"'); } catch (e) { return null; }
}
let aomap = null, LL = null, SL = null, cell = null;
try { aomap = chunk(fs.readFileSync(path.join(V, 'lib', 'three.module.min.js'), 'utf8'), 'aomap_fragment'); } catch (e) {}
try { LL = require(path.join(V, 'light_law.js')); } catch (e) {}
try {   // sourced_light.js is a browser IIFE over window (it reads window.LightLaw at load): run it in a sandbox window
  const win = { LightLaw: LL, location: { search: '' } }; win.window = win;
  require('vm').runInNewContext(fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8'), { window: win, console: console, location: win.location });
  SL = win.SourcedLight;
} catch (e) { console.log('    (sourced_light.js sandbox load failed: ' + e.message + ')'); }
try { const mm = /var CELL = ([0-9.]+)/.exec(fs.readFileSync(path.join(V, 'light_zones.js'), 'utf8')); cell = mm ? parseFloat(mm[1]) : null; } catch (e) {}
if (!aomap || !LL || !LL.AO || !SL || !SL.aoPatch || cell == null) {
  console.log('§WITNESS_Z10_AO_INDIRECT INCONCLUSIVE missing: ' + [!aomap && 'r186 aomap_fragment', (!LL || !LL.AO) && 'LightLaw.AO', (!SL || !SL.aoPatch) && 'SourcedLight.aoPatch', cell == null && 'light_zones CELL'].filter(Boolean).join(', ') + ' — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
function near(a, b, t) { return Math.abs(a - b) <= t; }

const patched = SL.aoPatch(aomap), added = patched.slice(aomap.length);
row('original r186 aomap_fragment kept byte-for-byte (prefix)', patched.startsWith(aomap), true, patched.startsWith(aomap) && added.length > 0);
row('patch is idempotent (a second install adds nothing)', SL.aoPatch(patched) === patched, true, SL.aoPatch(patched) === patched);
const lhs = (added.match(/reflectedLight\.(\w+)\s*\*=/g) || []).map(s => s.replace(/reflectedLight\.|\s*\*=/g, ''));
row('occludes indirectDiffuse and indirectSpecular only', lhs.join(','), 'indirectDiffuse,indirectSpecular', lhs.join(',') === 'indirectDiffuse,indirectSpecular');
row('never touches a direct term', /direct(Diffuse|Specular)/.test(added.replace(/indirect(Diffuse|Specular)/g, '')), false, !/direct(Diffuse|Specular)/.test(added.replace(/indirect(Diffuse|Specular)/g, '')));
row('gated by uSLAo.x (0 = today\'s picture)', /if \( uSLAo\.x > 0\.5 \)/.test(added), true, /if \( uSLAo\.x > 0\.5 \)/.test(added));
row('lit materials only (STANDARD/LAMBERT/PHONG/TOON guard; MeshBasic never)', /#if defined\( STANDARD \) \|\| defined\( LAMBERT \) \|\| defined\( PHONG \) \|\| defined\( TOON \)/.test(added), true,
  /#if defined\( STANDARD \) \|\| defined\( LAMBERT \) \|\| defined\( PHONG \) \|\| defined\( TOON \)/.test(added));
row('specular occlusion uses three\'s computeSpecularOcclusion under the same guard as r186', /USE_ENVMAP \) && defined\( STANDARD \)[\s\S]*computeSpecularOcclusion/.test(added) && /computeSpecularOcclusion/.test(aomap), true,
  /USE_ENVMAP \) && defined\( STANDARD \)[\s\S]*computeSpecularOcclusion/.test(added) && /computeSpecularOcclusion/.test(aomap));
row('screen-space lookup at the fragment (gl_FragCoord x 1/size)', /gl_FragCoord\.xy \* uSLAo\.zw/.test(added), true, /gl_FragCoord\.xy \* uSLAo\.zw/.test(added));
// law values
row('LightLaw.AO.radiusM = light_zones CELL (' + cell + ' m) — the field carries >= one cell, AO the sub-cell band', LL.AO.radiusM, cell, LL.AO.radiusM === cell);
row('LightLaw.AO.power = 1 (a visibility, no exponent)', LL.AO.power, 1, LL.AO.power === 1);
row('LightLaw.AO.appliesTo = indirect', LL.AO.appliesTo, 'indirect', LL.AO.appliesTo === 'indirect');
// maths of the change: a sunlit crease, direct 1, indirect 0.25 (sky/sun ≈ 0.21-0.25, engine_light_laws §2), AO 0.7
const D = 1, I = 0.25, ao = 0.7, legacy = (D + I) * Math.pow(ao, 4), now = D + I * ao;
row('sunlit crease: legacy (D+I)·AO^4 = 0.300 → new D + I·AO = 1.175 (direct kept)', legacy.toFixed(3) + ' → ' + now.toFixed(3), '0.300 → 1.175', near(legacy, 0.300, 5e-4) && near(now, 1.175, 1e-9));
row('legacy loses −2.06 stops of direct sun at AO 0.7; new loses none', Math.log2(Math.pow(ao, 4)).toFixed(2), '-2.06', near(Math.log2(Math.pow(ao, 4)), -2.058, 0.005));
// radius: legacy 32 px screen radius -> world size grows with depth (fov 50 deg, H 921 = red1's still height)
const wAt = d => 32 * 2 * d * Math.tan(25 * Math.PI / 180) / 921;
row('legacy world radius 0.097 m at 3 m, 0.97 m at 30 m (×10); law radius 0.5 m at both', wAt(3).toFixed(3) + ' / ' + wAt(30).toFixed(3) + ' vs ' + LL.AO.radiusM, '0.097 / 0.972 vs 0.5',
  near(wAt(3), 0.0972, 5e-4) && near(wAt(30), 0.972, 5e-3) && LL.AO.radiusM === 0.5);
console.log('§Z10_AO_UNIT addedChars=' + added.length + ' terms=' + lhs.join('+') + ' radiusM=' + LL.AO.radiusM + ' cell=' + cell + ' creaseLegacy=' + legacy.toFixed(3) + ' creaseNew=' + now.toFixed(3));

rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('z10_ao_indirect')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every patch / law / maths row holds', rs => rs.length >= 13 && rs.every(r => r.ok))
  .redControl(rs => { const bad = aomap + '\nif ( uSLAo.x > 0.5 ) { reflectedLight.directDiffuse *= 0.5; }';   // a patch that occludes DIRECT light must fail
    const b = bad.slice(aomap.length); rs[3].ok = !/direct(Diffuse|Specular)/.test(b.replace(/indirect(Diffuse|Specular)/g, '')); return rs; })
  .run();
