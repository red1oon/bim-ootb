#!/usr/bin/env node
// WITNESS — lamp_shadow: §LAMP_SHADOW (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §AO_LAMP_BUF "STANDARD MECHANISM").
//
// ISSUE THIS PROVES OR DISPROVES: the ceiling lamps' direct term had NO shadow — screen-space AO (any radius) cannot see a desk top
// above a floor point (fix/lamp-ao: under/open 0.745 -> 0.740 vs raycast truth 0.18). The fix shadows the lamp term with ONE
// orthographic depth map rendered straight down (lamp plane -> floor), PCSS-filtered (Fernando 2005) with the penumbra following the
// zone's lamp spread. This witness proves, on the REAL patched lights_fragment_begin text (sourced_light.js install() run over three
// r186's chunks), that (1) BOTH lamp loops take their visibility from slLampVis and no longer sample the screen AO themselves,
// (2) the aomap (indirect) block never reads the shadow map (no double count), (3) slLampVis falls back to the screen AO exactly
// where the map cannot judge (returns -1 outside the box / above the lamp plane) and is gated by the second-TAA phase (uSLAo.x),
// (4) slLampShadow is PCSS: a blocker search, then a PCF disc whose radius = (receiver - blocker) x tan(theta), 16 Vogel taps each,
// (5) the depth unpack is three r186's RGBADepthPacking order (r most significant), (6) LightLaw.LAMP_SHADOW cites the working
// plane (EN 12464-1, 0.75 m) and applies to lamps while AO stays indirect, (7) &lampshadow=0 / APP._stillLampShadow=false switch
// it off, and (8) lampShadowStage without lamp data returns null (off) and the release rebinds the white dummy on a sandbox program.
// It does NOT prove the rendered still (that is the GPU §CONTACT_BOUNCE / §LAMP_SHADOW_READ run). Prints INCONCLUSIVE (never PASS)
// when a chunk, sourced_light.js or light_law.js is missing. redControl: a lamp-data line that samples uSLAoT itself must FAIL row 1.
//
// Command: node viewer/tests/witness_lamp_shadow.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');

function chunk(src, name) {   // the JS string literal `name:"..."` in the minified three, decoded
  const k = src.indexOf(name + ':"'); if (k < 0) return null;
  let i = k + name.length + 2, out = '';
  for (; i < src.length; i++) { const ch = src[i]; if (ch === '\\') { out += ch + src[i + 1]; i++; continue; } if (ch === '"') break; out += ch; }
  try { return JSON.parse('"' + out + '"'); } catch (e) { return null; }
}
let LL = null, SL = null, SC = null, THREE = null, loadErr = null, src3 = null, win = null;
try { LL = require(path.join(V, 'light_law.js')); } catch (e) { loadErr = e.message; }
try {   // install() over a Proxy THREE carrying the real r186 chunks (the Z10 witness pattern): the patched text IS the shipped text
  src3 = fs.readFileSync(path.join(V, 'lib', 'three.module.min.js'), 'utf8');
  SC = {}; ['lights_fragment_begin', 'lights_fragment_maps', 'lights_pars_begin', 'dithering_fragment', 'aomap_fragment'].forEach(k => { SC[k] = chunk(src3, k); });
  function Tex() { this.isTexture = true; } Tex.prototype = {};
  THREE = new Proxy({ ShaderChunk: SC, ShaderLib: { standard: { uniforms: {} }, physical: { uniforms: {} }, lambert: { uniforms: {} }, phong: { uniforms: {} }, toon: { uniforms: {} } } },
    { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[A-Z]/.test(k) && /Texture$/.test(k) ? Tex : 0)) });
  win = { LightLaw: LL, location: { search: '' }, THREE }; win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8'), { window: win, console: { log() {}, warn() {}, error() {} }, location: win.location, performance: { now: () => Date.now() } });
  SL = win.SourcedLight; if (SL && SL.install) SL.install(THREE);
} catch (e) { loadErr = (loadErr ? loadErr + '; ' : '') + e.message; }
const fb = SC && SC.lights_fragment_begin, am = SC && SC.aomap_fragment, pb = SC && SC.lights_pars_begin;
if (!fb || !am || !pb || !LL || !LL.LAMP_SHADOW || !SL || !SL.lampShadowStage || fb.indexOf('slLampVis') < 0) {
  console.log('§WITNESS_LAMP_SHADOW INCONCLUSIVE missing: ' + [!fb && 'r186 lights_fragment_begin', !am && 'r186 aomap_fragment', !pb && 'r186 lights_pars_begin', (!LL || !LL.LAMP_SHADOW) && 'LightLaw.LAMP_SHADOW', (!SL || !SL.lampShadowStage) && 'SourcedLight.lampShadowStage',
    fb && fb.indexOf('slLampVis') < 0 && 'patched lamp loop (install did not run)'].filter(Boolean).join(', ') + (loadErr ? ' (' + loadErr + ')' : '') + ' — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }

// (1) the two lamp loops: the dynamic point loop (`#else` branch) and the lamp-data loop (_slAoL line)
const pl = (/#else\n\tfloat _slPLV = slLampVis\( geometryPosition, geometryNormal \);\n\tfor \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{[\s\S]*?\n\t\}\n\t#endif/.exec(fb) || [''])[0];
const ll = (/float _slAoL = [^\n]*/.exec(fb) || [''])[0];
const lampOk = s => /slLampVis\( geometryPosition, geometryNormal \)/.test(s) && !/uSLAoT/.test(s) && !/uSLLsT/.test(s);
row('dynamic point loop (pool path): one slLampVis per fragment, multiplies _slPLV, never samples uSLAoT/uSLLsT itself', pl ? ((pl.match(/slLampVis|uSLAoT|uSLLsT|_slPLV/g) || []).join(',')) : 'loop missing', 'slLampVis,_slPLV,_slPLV', !!pl && lampOk(pl) && /\* _slPLV;/.test(pl));
row('lamp-data loop (_slAoL) takes slLampVis, never samples uSLAoT/uSLLsT itself', ll ? ((ll.match(/slLampVis|uSLAoT|uSLLsT/g) || []).join(',')) : 'line missing', 'slLampVis', !!ll && lampOk(ll));
row('the data loop multiplies every lamp by _slAoL (the visibility reaches the lamp colour)', /getDistanceAttenuation\( _ld, _lb\.w, uSLLamp\.y \) \* _slAoL/.test(fb), true, /getDistanceAttenuation\( _ld, _lb\.w, uSLLamp\.y \) \* _slAoL/.test(fb));
// (2) the indirect block never reads the shadow map
row('aomap (indirect) block samples uSLAoT and never uSLLsT (no double count)', (am.match(/uSLAoT|uSLLsT/g) || []).join(','), 'uSLAoT only', /texture2D\( uSLAoT,/.test(am) && !/uSLLsT/.test(am));
// (3) slLampVis: fallback + gate
const lv = (/float slLampVis\( vec3 posView, vec3 nView \) \{[\s\S]*?return _slLsAo; \}/.exec(pb) || [''])[0];
row('slLampVis gates the map on uSLLsP.x (staged) && uSLAo.x (second TAA) && a known zone', /uSLLsP\.x > 0\.5 && uSLAo\.x > 0\.5 && _slFZ > -0\.5/.test(lv), true, /uSLLsP\.x > 0\.5 && uSLAo\.x > 0\.5 && _slFZ > -0\.5/.test(lv));
row('slLampVis returns the shadow only when >= 0, else the screen AO it computed first (fallback where the map cannot judge)', /_slLsV = slLampShadow\( _slWP, wn \); if \( _slLsV >= 0\.0 \) return _slLsV;/.test(lv) && /return _slLsAo; \}/.test(lv), true, /_slLsV = slLampShadow\( _slWP, wn \); if \( _slLsV >= 0\.0 \) return _slLsV;/.test(lv) && /return _slLsAo; \}/.test(lv));
row('slLampVis keeps the §AO_LAMPS gate for the AO half (uSLAo.x && uSLAo.y: &aolamps=0 honest)', /_slLsAo = \( uSLAo\.x > 0\.5 && uSLAo\.y > 0\.5 \) \? texture2D\( uSLAoT,/.test(lv), true, /_slLsAo = \( uSLAo\.x > 0\.5 && uSLAo\.y > 0\.5 \) \? texture2D\( uSLAoT,/.test(lv));
// (4) slLampShadow: PCSS
const ls = (/float slLampShadow\( vec3 wp, vec3 wn \) \{[\s\S]*?return vis \/ 16\.0; \}/.exec(pb) || [''])[0];
row('slLampShadow returns -1 outside the map box and above the lamp plane (the caller keeps the AO)', (ls.match(/return -1\.0;/g) || []).length, 2, (ls.match(/return -1\.0;/g) || []).length === 2 && /zr <= 0\.0 \) return -1\.0;/.test(ls));
row('PCSS step 1: blocker search over rs = zr x slab x tan(theta), mean blocker depth zb', /float rs = min\( zr \* uSLLsY\.z \* tanT, uSLLsY\.w \);/.test(ls) && /zb \/= nb;/.test(ls), true, /float rs = min\( zr \* uSLLsY\.z \* tanT, uSLLsY\.w \);/.test(ls) && /zb \/= nb;/.test(ls));
row('PCSS step 2: penumbra rp = (zr - zb) x slab x tan(theta), >= 1 texel, <= max kernel', /float rp = clamp\( \( zr - zb \) \* uSLLsY\.z \* tanT, uSLLsP\.z, uSLLsY\.w \);/.test(ls), true, /float rp = clamp\( \( zr - zb \) \* uSLLsY\.z \* tanT, uSLLsP\.z, uSLLsY\.w \);/.test(ls));
row('PCSS step 3: 16-tap Vogel PCF over rp; no blocker found -> 1.0', (ls.match(/for \( int i = 0; i < 16; i \+\+ \)/g) || []).length + ' loops, ' + /if \( nb < 0\.5 \) return 1\.0;/.test(ls), '2 loops, true', (ls.match(/for \( int i = 0; i < 16; i \+\+ \)/g) || []).length === 2 && /if \( nb < 0\.5 \) return 1\.0;/.test(ls));
row('normal offset 1.5 texel + depth bias in map units', /vec3 p = wp \+ wn \* uSLLsP\.z \* 1\.5;/.test(ls) && /float bias = uSLLsP\.w \* uSLLsY\.y;/.test(ls), true, /vec3 p = wp \+ wn \* uSLLsP\.z \* 1\.5;/.test(ls) && /float bias = uSLLsP\.w \* uSLLsY\.y;/.test(ls));
// (5) depth unpack = three r186 RGBADepthPacking (UnpackFactors4 = UnpackDownscale / PackFactors.rgb, 1 / PackFactors.a; PackFactors = 1, 256, 65536, 16777216)
const pf = /PackFactors = vec4\( 1\.0, 256\.0, 256\.0 \* 256\.0, 256\.0 \* 256\.0 \* 256\.0 \);/.test(src3) && /UnpackDownscale = 255\. \/ 256\.;/.test(src3) && /UnpackFactors4 = vec4\( UnpackDownscale \/ PackFactors\.rgb, 1\.0 \/ PackFactors\.a \);/.test(src3);
const un = /vec4\( 255\.0 \/ 256\.0, 255\.0 \/ 65536\.0, 255\.0 \/ 16777216\.0, 1\.0 \/ 16777216\.0 \)/.test(pb);
row('slLsDepth unpacks with r186 UnpackFactors4 (255/256, 255/65536, 255/16777216, 1/16777216): r most significant', pf + '/' + un, 'true/true', pf && un);
// (6) law
row('LightLaw.LAMP_SHADOW.wpM = 0.75 (EN 12464-1 working plane), appliesTo lamps; AO stays indirect', LL.LAMP_SHADOW.wpM + ' ' + LL.LAMP_SHADOW.appliesTo + ' | AO ' + LL.AO.appliesTo, '0.75 lamps | AO indirect', LL.LAMP_SHADOW.wpM === 0.75 && LL.LAMP_SHADOW.appliesTo === 'lamps' && LL.AO.appliesTo === 'indirect');
row('LightLaw.LAMP_SHADOW has texelM / biasM / taps 16 / size bounds', [LL.LAMP_SHADOW.texelM, LL.LAMP_SHADOW.biasM, LL.LAMP_SHADOW.taps, LL.LAMP_SHADOW.sizeMin, LL.LAMP_SHADOW.sizeMax].join(','), '0.02,0.02,16,1024,4096', LL.LAMP_SHADOW.texelM === 0.02 && LL.LAMP_SHADOW.biasM === 0.02 && LL.LAMP_SHADOW.taps === 16 && LL.LAMP_SHADOW.sizeMin === 1024 && LL.LAMP_SHADOW.sizeMax === 4096);
// (7) switches
row('lampShadowOn: default on; APP._stillLampShadow=false off', SL.lampShadowOn({}) + '/' + SL.lampShadowOn({ _stillLampShadow: false }), 'true/false', SL.lampShadowOn({}) === true && SL.lampShadowOn({ _stillLampShadow: false }) === false);
win.location.search = '?lampshadow=0'; const offQ = SL.lampShadowOn({}); win.location.search = '';
row('lampShadowOn: &lampshadow=0 off', offQ, false, offQ === false);
// (8) stage without lamp data -> null (off, logged); release rebinds the white dummy on a sandbox program
let st = null, rel = null;
try { const U = { uSLLsP: { value: null }, uSLLsB: { value: null }, uSLLsY: { value: null }, uSLLsT: { value: { tag: 'stale' } } }, mat = {};
  const A = { renderer: { properties: { get: m => (m === mat ? { uniforms: U } : null) } }, scene: { traverse: fn => fn({ material: mat }) }, camera: {} };
  st = SL.lampShadowStage(A); SL.lampShadowRelease(A, true); rel = { p: U.uSLLsP.value, t: U.uSLLsT.value };
} catch (e) { st = 'err ' + e.message; }
row('lampShadowStage(A without lamp data / zones) returns null (off), never a partial stage', st === null ? 'null' : String(st), 'null', st === null);
row('ShaderLib standard..toon carry uSLLsP/uSLLsB/uSLLsY/uSLLsT', ['standard', 'physical', 'lambert', 'phong', 'toon'].map(k => !!(THREE.ShaderLib[k].uniforms.uSLLsT && THREE.ShaderLib[k].uniforms.uSLLsP)).join(','), 'true x5', ['standard', 'physical', 'lambert', 'phong', 'toon'].every(k => !!(THREE.ShaderLib[k].uniforms.uSLLsT && THREE.ShaderLib[k].uniforms.uSLLsP)));
row('readback mode 14 emits (visibility, AO, 0.75 marker)', /uSLParams\.w > 13\.5 && uSLParams\.w < 14\.5 \) \{ gl_FragColor = vec4\( _slLsV, _slLsAo, 0\.75, 1\.0 \); \}/.test(SC.dithering_fragment), true, /uSLParams\.w > 13\.5 && uSLParams\.w < 14\.5 \) \{ gl_FragColor = vec4\( _slLsV, _slLsAo, 0\.75, 1\.0 \); \}/.test(SC.dithering_fragment));

console.log('§LAMP_SHADOW_UNIT wpM=' + LL.LAMP_SHADOW.wpM + ' texelM=' + LL.LAMP_SHADOW.texelM + ' biasM=' + LL.LAMP_SHADOW.biasM + ' taps=' + LL.LAMP_SHADOW.taps + ' loops=' + (pl ? 1 : 0) + (ll ? 1 : 0) + ' pcss=' + (ls ? 1 : 0) + ' rows=' + rows.length);
rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('lamp_shadow')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every loop / fallback / PCSS / unpack / law / switch row holds', rs => rs.length >= 18 && rs.every(r => r.ok))
  .redControl(rs => { const bad = ll.replace('slLampVis( geometryPosition, geometryNormal )', 'texture2D( uSLAoT, gl_FragCoord.xy * uSLAo.zw ).r'); rs[1].ok = lampOk(bad); return rs; })   // a lamp loop sampling the screen AO itself must fail
  .run();
