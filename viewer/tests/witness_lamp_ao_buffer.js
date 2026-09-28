#!/usr/bin/env node
// WITNESS — lamp_ao_buffer: §AO_LAMP_BUF (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md OPEN(1) §CONTACT_BOUNCE RESULT -> proposal).
//
// ISSUE THIS PROVES OR DISPROVES: the lamps' direct term was occluded by the INDIRECT AO buffer (LightLaw.AO, radius 0.5 m = the
// sky-view field cell), which cannot see a desk top 0.74 m above the floor — measured under/open floor darkening 1-2 %. The fix
// gives the lamps a SECOND buffer at the working-plane radius (LightLaw.AO_LAMP). This witness proves, on the REAL patched
// lights_fragment_begin text (sourced_light.js install() run over three r186's chunks), that (1) BOTH lamp loops sample uSLAoL and
// never uSLAoT, (2) the aomap (indirect) block samples uSLAoT and never uSLAoL — so no occluder is multiplied into both terms (no
// double count), (3) the lamp gate is still uSLAo.x && uSLAo.y (the &aolamps=0 switch is honest), (4) aoSet binds the lamp texture
// to uSLAoL and falls back to the indirect texture when none is given (the &lampao=0 path is exactly the pre-v1497 picture),
// (5) the law radius is the cited plane (0.75 m, >= EN 527-1 desk 0.74 m) and differs from the indirect radius, and (6) states the
// n8ao world-kernel maths: the accepted occluder gap along the view ray is 0.2 x r x falloff (0.10 m at 0.5 m, 0.15 m at 0.75 m).
// It does NOT prove the rendered still (that is the GPU §CONTACT_BOUNCE run). Prints INCONCLUSIVE (never PASS) when a chunk,
// sourced_light.js or light_law.js is missing. redControl: a lamp loop that still samples uSLAoT must FAIL row 1.
//
// Command: node viewer/tests/witness_lamp_ao_buffer.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');

function chunk(src, name) {   // the JS string literal `name:"..."` in the minified three, decoded
  const k = src.indexOf(name + ':"'); if (k < 0) return null;
  let i = k + name.length + 2, out = '';
  for (; i < src.length; i++) { const ch = src[i]; if (ch === '\\') { out += ch + src[i + 1]; i++; continue; } if (ch === '"') break; out += ch; }
  try { return JSON.parse('"' + out + '"'); } catch (e) { return null; }
}
let LL = null, SL = null, SC = null, THREE = null, kernel = null, loadErr = null;
try { LL = require(path.join(V, 'light_law.js')); } catch (e) { loadErr = e.message; }
try {   // install() over a Proxy THREE carrying the real r186 chunks (the Z10 witness pattern): the patched text IS the shipped text
  const src3 = fs.readFileSync(path.join(V, 'lib', 'three.module.min.js'), 'utf8');
  SC = {}; ['lights_fragment_begin', 'lights_fragment_maps', 'lights_pars_begin', 'dithering_fragment', 'aomap_fragment'].forEach(k => { SC[k] = chunk(src3, k); });
  function Tex() { this.isTexture = true; } Tex.prototype = {};
  THREE = new Proxy({ ShaderChunk: SC, ShaderLib: { standard: { uniforms: {} }, physical: { uniforms: {} }, lambert: { uniforms: {} }, phong: { uniforms: {} }, toon: { uniforms: {} } } },
    { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[A-Z]/.test(k) && /Texture$/.test(k) ? Tex : 0)) });
  const win = { LightLaw: LL, location: { search: '' }, THREE }; win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8'), { window: win, console: { log() {}, warn() {}, error() {} }, location: win.location });
  SL = win.SourcedLight; if (SL && SL.install) SL.install(THREE);
} catch (e) { loadErr = (loadErr ? loadErr + '; ' : '') + e.message; }
try {
  const n8 = fs.readFileSync(path.join(V, 'lib', 'postprocessing-n8ao.bundle.js'), 'utf8');
  const i = n8.indexOf('float distanceFalloffToUse =screenSpaceRadius ?'); kernel = i >= 0 ? n8.slice(i, i + 400) : null;
} catch (e) {}
const fb = SC && SC.lights_fragment_begin, am = SC && SC.aomap_fragment, pb = SC && SC.lights_pars_begin;
if (!fb || !am || !LL || !LL.AO || !LL.AO_LAMP || !SL || !kernel || fb.indexOf('uSLAo') < 0) {
  console.log('§WITNESS_LAMP_AO_BUFFER INCONCLUSIVE missing: ' + [!fb && 'r186 lights_fragment_begin', !am && 'r186 aomap_fragment', (!LL || !LL.AO_LAMP) && 'LightLaw.AO_LAMP', !SL && 'SourcedLight', !kernel && 'n8ao world kernel',
    fb && fb.indexOf('uSLAo') < 0 && 'patched lamp loop (install did not run)'].filter(Boolean).join(', ') + (loadErr ? ' (' + loadErr + ')' : '') + ' — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }

// (1) the two lamp loops: the dynamic point loop (`for ( int i = 0; i < NUM_POINT_LIGHTS` body) and the lamp-data loop (_slAoL line)
const pl = (/#else\n\tfor \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{[\s\S]*?\n\t\}\n\t#endif/.exec(fb) || [''])[0];   // the DYNAMIC (#else) branch — the unrolled shadow branch above it is three's own text
const ll = (/float _slAoL = [^\n]*/.exec(fb) || [''])[0];
const lampOk = s => /texture2D\( uSLAoL,/.test(s) && !/uSLAoT/.test(s);
row('dynamic point loop (pool path) samples uSLAoL, never uSLAoT', pl ? (pl.match(/uSLAo[TL]/g) || []).join(',') : 'loop missing', 'uSLAoL only', !!pl && lampOk(pl));
row('lamp-data loop (_slAoL) samples uSLAoL, never uSLAoT', ll ? (ll.match(/uSLAo[TL]/g) || []).join(',') : 'line missing', 'uSLAoL only', !!ll && lampOk(ll));
// (2) the indirect block: uSLAoT only; the lamp lines never touch an indirect term
row('aomap (indirect) block samples uSLAoT, never uSLAoL (no double count)', (am.match(/uSLAo[TL]/g) || []).join(','), 'uSLAoT only', /texture2D\( uSLAoT,/.test(am) && !/uSLAoL/.test(am));
row('lamp lines never touch reflectedLight.indirect* (terms stay separate)', /indirect(Diffuse|Specular)/.test(pl + ll), false, !/indirect(Diffuse|Specular)/.test(pl + ll));
// (3) gates + declaration
const gate = /uSLAo\.x > 0\.5 && uSLAo\.y > 0\.5/;
row('lamp AO gate = uSLAo.x && uSLAo.y in both loops (x = still TAA2 phase, y = &aolamps switch)', gate.test(pl) + '/' + gate.test(ll), 'true/true', gate.test(pl) && gate.test(ll));
row('uSLAoL declared as a sampler2D beside uSLAoT (lights_pars_begin)', /uniform sampler2D uSLAoT;/.test(pb) + '/' + /uniform sampler2D uSLAoL;/.test(pb), 'true/true', /uniform sampler2D uSLAoT;/.test(pb) && /uniform sampler2D uSLAoL;/.test(pb));
row('ShaderLib standard..toon carry uSLAoL', ['standard', 'physical', 'lambert', 'phong', 'toon'].map(k => !!THREE.ShaderLib[k].uniforms.uSLAoL).join(','), 'true x5', ['standard', 'physical', 'lambert', 'phong', 'toon'].every(k => !!THREE.ShaderLib[k].uniforms.uSLAoL));
// (4) aoSet binding on a sandbox program: lamp texture -> uSLAoL; none -> the indirect texture (the &lampao=0 path); release -> dummy
let bind = null;
try {
  const U = { uSLAo: { value: null }, uSLAoT: { value: null }, uSLAoL: { value: null } }, mat = {}, rtI = { tag: 'indirectRT' }, rtL = { tag: 'lampRT' };
  const A = { renderer: { properties: { get: m => (m === mat ? { uniforms: U } : null) } }, scene: { traverse: fn => fn({ material: mat }) } };
  const nb = SL.aoSet(A, rtI, false, 1600, 900, rtL); const both = U.uSLAoT.value === rtI && U.uSLAoL.value === rtL;
  SL.aoSet(A, rtI, false, 1600, 900, null); const fallback = U.uSLAoT.value === rtI && U.uSLAoL.value === rtI;
  SL.aoSet(A, null, false); const released = U.uSLAoT.value !== rtI && U.uSLAoL.value !== rtI && U.uSLAoL.value === U.uSLAoT.value && !!U.uSLAoL.value;
  bind = { nb, both, fallback, released };
} catch (e) { bind = { err: e.message }; }
row('aoSet(indirect, lamp) binds uSLAoT=indirect, uSLAoL=lamp', JSON.stringify(bind), 'both=true', !!bind && bind.both === true && bind.nb === 1);
row('aoSet(indirect, null) binds uSLAoL to the INDIRECT texture (&lampao=0 = the pre-v1497 picture)', bind && bind.fallback, true, !!bind && bind.fallback === true);
row('aoSet(null) releases both to the same white dummy', bind && bind.released, true, !!bind && bind.released === true);
// (5) law values
row('LightLaw.AO_LAMP.radiusM = 0.75 (EN 12464-1 office reference plane)', LL.AO_LAMP.radiusM, 0.75, LL.AO_LAMP.radiusM === 0.75);
row('LightLaw.AO_LAMP.radiusM >= EN 527-1:2011 type-C desk 0.74 m (0.5 m buffer cannot reach it)', LL.AO_LAMP.radiusM + ' vs AO ' + LL.AO.radiusM, '>= 0.74 vs < 0.74', LL.AO_LAMP.radiusM >= 0.74 && LL.AO.radiusM < 0.74);
row('LightLaw.AO_LAMP.appliesTo = lamps; source cites EN 12464-1 + EN 527-1; AO stays indirect', LL.AO_LAMP.appliesTo + ' | ' + LL.AO_LAMP.source + ' | ' + LL.AO.appliesTo, 'lamps | EN 12464-1 … EN 527-1 | indirect',
  LL.AO_LAMP.appliesTo === 'lamps' && /EN 12464-1/.test(LL.AO_LAMP.source) && /EN 527-1/.test(LL.AO_LAMP.source) && LL.AO.appliesTo === 'indirect');
// (6) the n8ao world kernel: accepted along-view-ray gap = 0.2 x r x falloff (verbatim in the bundle)
const k02 = /radiusToUse \* distanceFalloff \* 0\.2/.test(kernel);
row('n8ao world kernel: distanceFalloffToUse = r x falloff x 0.2 (verbatim)', k02, true, k02);
const gap = (r, f) => +(r * f * 0.2).toFixed(3);
row('accepted occluder gap: AO 0.5 m -> 0.10 m; AO_LAMP 0.75 m -> 0.15 m', gap(LL.AO.radiusM, LL.AO.falloff) + ' / ' + gap(LL.AO_LAMP.radiusM, LL.AO_LAMP.falloff), '0.1 / 0.15', gap(LL.AO.radiusM, LL.AO.falloff) === 0.1 && gap(LL.AO_LAMP.radiusM, LL.AO_LAMP.falloff) === 0.15);

console.log('§LAMP_AO_UNIT radiusLamp=' + LL.AO_LAMP.radiusM + ' radiusIndirect=' + LL.AO.radiusM + ' gapLamp=' + gap(LL.AO_LAMP.radiusM, LL.AO_LAMP.falloff) + ' gapIndirect=' + gap(LL.AO.radiusM, LL.AO.falloff) + ' loops=' + (pl ? 1 : 0) + (ll ? 1 : 0));
rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('lamp_ao_buffer')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every loop / binding / law / kernel row holds', rs => rs.length >= 15 && rs.every(r => r.ok))
  .redControl(rs => { const bad = pl.replace(/uSLAoL/g, 'uSLAoT'); rs[0].ok = lampOk(bad); return rs; })   // a lamp loop reading the indirect buffer must fail
  .run();
