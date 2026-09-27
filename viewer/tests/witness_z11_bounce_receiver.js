#!/usr/bin/env node
// WITNESS — z11_bounce_receiver: §ZERO Z11 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z11 SPEC" (a)+(b), audit #56, L2).
//
// ISSUE THIS PROVES OR DISPROVES: the Alt+S bounce (gi_still.js) (a) applied a SECOND AO (0.55) on top of §PHOTO_AO — an L2 double
// count — and (b) multiplied the bounce by an INVENTED receiver albedo (the lit colour's hue at a fixed 0.5), so a white soffit and a
// dark floor received the same bounce. Z11 sets the still's second AO to 0 (films keep 0.55 until Z13) and feeds the receiver the
// albedo the app actually shades with (sourced_light.js readback mode 13 -> albedoMap -> sRGB canvas). This witness proves the
// defaults, the shader readback line, the encoder (bytes round-trip through three r186's decode within 1 code, alpha rule), and the
// receiver maths the change makes. It does NOT prove the rendered bounce — that is the GPU witness (desktop WebGPU) in the spec.
// Prints INCONCLUSIVE (never PASS) when gi_still.js / sourced_light.js / light_law.js / the r186 decode cannot be loaded.
//
// Command: node viewer/tests/witness_z11_bounce_receiver.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');
let gsrc = null, slsrc = null, LL = null, SL = null, r186 = null;
try { gsrc = fs.readFileSync(path.join(V, 'gi_still.js'), 'utf8'); } catch (e) {}
try { slsrc = fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8'); } catch (e) {}
try { LL = require(path.join(V, 'light_law.js')); } catch (e) {}
try { const win = { LightLaw: LL, location: { search: '' } }; win.window = win; vm.runInNewContext(slsrc, { window: win, console, location: win.location }); SL = win.SourcedLight; } catch (e) {}
try { const m = /function SRGBToLinear\(t\)\{return [^}]*\}/.exec(fs.readFileSync(path.join(V, 'lib', 'three.core.min.js'), 'utf8')); if (m) r186 = new Function(m[0] + '; return SRGBToLinear;')(); } catch (e) {}
if (!gsrc || !slsrc || !SL || !SL.albedoEncode || !r186) {
  console.log('§WITNESS_Z11_BOUNCE_RECEIVER INCONCLUSIVE missing: ' + [!gsrc && 'gi_still.js', !slsrc && 'sourced_light.js', (!SL || !SL.albedoEncode) && 'SourcedLight.albedoEncode', !r186 && 'r186 SRGBToLinear'].filter(Boolean).join(', ') + ' — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }

const aoDef = (/GI_AO_DEFAULT = ([0-9.]+)/.exec(gsrc) || [])[1];
row('still second AO default GI_AO_DEFAULT = 0 (AO counted once, §PHOTO_AO)', aoDef, '0', aoDef === '0');
const filmAo = (/GI_AO_FILM_PRE_Z11 = ([0-9.]+)/.exec(gsrc) || [])[1];
row('films keep the pre-Z11 0.55 (Alt+C unchanged until Z13)', filmAo + ' / readAo(true) in filmFrame', '0.55 / yes', filmAo === '0.55' && /G\.aoU\.value = readAo\(true\); G\.albU\.value = 0;/.test(gsrc));
row('receiver prefers the real albedo where alpha x albU > 0.5, else the old estimate', /alb\.a\.mul\(G\.albU\)\.greaterThan\(0\.5\)\.select\(alb\.rgb, old\)/.test(gsrc), true, /alb\.a\.mul\(G\.albU\)\.greaterThan\(0\.5\)\.select\(alb\.rgb, old\)/.test(gsrc));
const m13 = /uSLParams\.w > 12\.5 && uSLParams\.w < 13\.5 \) \{ gl_FragColor = vec4\( material\.diffuseColor, 0\.75 \); \}/.test(slsrc);
row('readback mode 13 writes material.diffuseColor with marker 0.75', m13, true, m13);
// mode 13 must sit BEFORE the catch-all `else if ( uSLParams.w > 1.5 )` of the same chain, or w = 13 would never reach it
const i13 = slsrc.indexOf('uSLParams.w > 12.5 && uSLParams.w < 13.5'), iCatch = slsrc.indexOf("'else if ( uSLParams.w > 1.5 )");
row('mode 13 precedes the > 1.5 catch-all in the dithering chain', i13 + ' < ' + iCatch, 'true', i13 > 0 && iCatch > i13);
// encoder: 2x2 float frame, rows bottom-up (GL) -> canvas rows top-down; marker rule
const F = new Float32Array([0.8, 0.8, 0.8, 0.75, 0.1, 0.05, 0.02, 0.75,   0.5, 0.5, 0.5, 1.0, 0.214, 0.214, 0.214, 0.6]);
const E = SL.albedoEncode(F, 2, 2);
row('encoder: real = 2 (marker 0.75), sky/unpatched (1.0) and blended (0.6) = none', E.real, 2, E.real === 2);
// GL row 0 (bottom) -> canvas row 1: pixels at canvas index 2,3 are the marker ones
const px = i => [E.data[i * 4], E.data[i * 4 + 1], E.data[i * 4 + 2], E.data[i * 4 + 3]];
row('encoder flips GL rows to canvas order (the irShare flip)', JSON.stringify([px(0)[3], px(1)[3], px(2)[3], px(3)[3]]), '[0,0,255,255]', px(0)[3] === 0 && px(1)[3] === 0 && px(2)[3] === 255 && px(3)[3] === 255);
let worst = 0; for (let i = 0; i <= 1000; i++) { const c = i / 1000; const b = SL.albedoEncode(new Float32Array([c, c, c, 0.75]), 1, 1).data[0];
  const back = r186(b / 255); const want = Math.round(255 * c); worst = Math.max(worst, Math.abs(Math.round(255 * back) - want)); }
row('encoded bytes decode (r186 SRGBToLinear) back to the linear albedo within 2 linear codes (8-bit sRGB step at white = 2.28 linear codes; 1001 steps)', worst, '<= 2', worst <= 2);
// receiver maths: bounce added = rho x GI; old estimate = 0.5 x hue
const GI = 0.3;
row('white soffit rho 0.8: bounce 0.24 vs estimate 0.15 (x1.6)', (0.8 * GI).toFixed(2) + ' vs ' + (0.5 * GI).toFixed(2), '0.24 vs 0.15', Math.abs(0.8 / 0.5 - 1.6) < 1e-12);
row('dark floor rho 0.1: bounce 0.03 vs estimate 0.15 (x0.2)', (0.1 * GI).toFixed(2) + ' vs ' + (0.5 * GI).toFixed(2), '0.03 vs 0.15', Math.abs(0.1 / 0.5 - 0.2) < 1e-12);
console.log('§Z11_BOUNCE_UNIT aoDefault=' + aoDef + ' filmAo=' + filmAo + ' mode13=' + m13 + ' encReal=' + E.real + ' worstCode=' + worst + ' meanAlbLum=' + E.meanAlbLum);

rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('z11_bounce_receiver')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every default / readback / encoder / receiver row holds', rs => rs.length >= 10 && rs.every(r => r.ok))
  .redControl(rs => { const bent = gsrc.replace('GI_AO_DEFAULT = 0,', 'GI_AO_DEFAULT = 0.55,'); rs[0].ok = (/GI_AO_DEFAULT = ([0-9.]+)/.exec(bent) || [])[1] === '0'; return rs; })   // the old 0.55 must fail
  .run();
