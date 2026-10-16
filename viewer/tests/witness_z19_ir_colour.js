#!/usr/bin/env node
// WITNESS — z19_ir_colour: §ZERO Z19 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z19 SPEC", law L2).
// ISSUE THIS PROVES OR DISPROVES: the Alt+S zone interreflection (§IRC_MAX v2) added a COLOURLESS term (R = 0.5 on every channel) —
// measured +45 % frame saturation with &ir=0 on the Hospital interior. Z19 tints each zone's IR by the area-weighted mean albedo of its
// surfaces, renormalised so the zone's IR LUMINANCE is unchanged. Proves on the SHIPPED SourcedLight.irTint / zoneAlbedo: Y kept to
// 1e-9 over 2000 random zones; grey albedo = identity; red walls red-shift with the same Y; NULL/black albedo = identity; zoneAlbedo
// reads the SOLID cell behind each face (not the empty one) and skips no-albedo cells; light_zones.js accumulates alb over opaque
// triangles only and stores it in the cache record. Does NOT prove the rendered frame — that is the GPU witness in the spec.
// Command: node viewer/tests/witness_z19_ir_colour.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');
let SL = null, lz = null;
try { const src = fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8'); const win = { location: { search: '' }, console: { log() {}, warn() {} } }; win.window = win;
  // merge fix/alts-all-3: sourced_light.js reads window.LightLaw (§LIGHT_LAW_MODULE) at load — load light_law.js first, as viewer.html does
  try { win.LightLaw = require(path.join(V, 'light_law.js')); } catch (e) {}
  vm.runInNewContext(src, { window: win, console: win.console, location: win.location, performance: { now: () => 0 } }); SL = win.SourcedLight; } catch (e) { console.log('load: ' + e.message); }
try { lz = fs.readFileSync(path.join(V, 'light_zones.js'), 'utf8'); } catch (e) {}
if (!SL || !SL.irTint || !SL.zoneAlbedo || !lz) { console.log('§WITNESS_Z19_IR_COLOUR INCONCLUSIVE missing: ' + [!SL && 'SourcedLight', SL && !SL.irTint && 'irTint', !lz && 'light_zones.js'].filter(Boolean).join(', ') + ' — nothing judged'); process.exitCode = 2; return; }
const { Witness } = require('../../witness_kit/contract');
const rows = []; const row = (name, got, want, ok) => rows.push({ name, got: String(got), want: String(want), ok: !!ok });
const Y = e => 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2], sat = e => { const m = Math.max(...e); return m > 0 ? (m - Math.min(...e)) / m : 0; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let worst = 0; for (let i = 0; i < 2000; i++) { const e = [rnd(), rnd(), rnd()].map(v => v * 5), a = [rnd(), rnd(), rnd()], t = SL.irTint(e, a); worst = Math.max(worst, Math.abs(Y(t) - Y(e)) / Y(e)); }
row('luminance unchanged, 2000 random zones (max relative dY)', worst.toExponential(2), '< 1e-9', worst < 1e-9);
const e0 = [0.3, 0.3, 0.3];
const g = SL.irTint(e0, [0.5, 0.5, 0.5]); row('grey albedo -> identity', g.map(v => v.toFixed(9)).join(','), '0.3 x3', g.every(v => Math.abs(v - 0.3) < 1e-12));
const r = SL.irTint(e0, [0.6, 0.2, 0.15]); row('red walls -> red-shifted IR, same Y', r.map(v => v.toFixed(4)).join(',') + ' sat ' + sat(r).toFixed(3) + ' dY ' + Math.abs(Y(r) - Y(e0)).toExponential(1), 'r > g,b; sat > 0.5; dY ~ 0', r[0] > r[1] && r[0] > r[2] && sat(r) > 0.5 && Math.abs(Y(r) - Y(e0)) < 1e-12);
const n1 = SL.irTint(e0, null), n2 = SL.irTint(e0, [0, 0, 0]); row('NULL / black albedo -> identity', n1.join(',') + ' | ' + n2.join(','), '0.3 x3 x2', n1.concat(n2).every(v => v === 0.3));
const w = SL.irTint([0.5, 0.4, 0.2], [0.8, 0.8, 0.8]); row('warm lamp IR under white walls keeps its own colour', w.map(v => v.toFixed(6)).join(','), '0.5,0.4,0.2', Math.abs(w[0] - 0.5) + Math.abs(w[1] - 0.4) + Math.abs(w[2] - 0.2) < 1e-12);
// zoneAlbedo: 3x1x1 grid, cell 0 SOLID red (alb set), cell 1 empty, cell 2 SOLID no albedo; one face from cell 1 toward cell 0 (normal +x into cell 1)
const Z = { cell: 0.5, nx: 3, ny: 1, nz: 1, org: { x: 0, y: 0, z: 0 }, alb: new Uint8Array([204, 51, 38, 0, 0, 0, 0, 0, 0]) };
const face0 = [0.75 - 0.49 * 0.5, 0.25, 0.25, 1, 0, 0], face2 = [0.75 + 0.49 * 0.5, 0.25, 0.25, -1, 0, 0];
const za = SL.zoneAlbedo(Z, face0); row('zoneAlbedo reads the SOLID cell behind the face', za ? za.a.map(v => v.toFixed(3)).join(',') + ' n=' + za.n : 'null', '0.800,0.200,0.149 n=1', za && za.n === 1 && Math.abs(za.a[0] - 0.8) < 1e-9);
const zb = SL.zoneAlbedo(Z, face2); row('zoneAlbedo skips a cell with no albedo (VACUOUS -> null -> neutral)', zb, 'null', zb === null);
row('zoneAlbedo on a grid without alb (old cache) -> null', SL.zoneAlbedo({ cell: 0.5, nx: 3, ny: 1, nz: 1, org: Z.org }, face0), 'null', SL.zoneAlbedo({ cell: 0.5, nx: 3, ny: 1, nz: 1, org: Z.org }, face0) === null);
// light_zones.js source contract: opaque-only accumulation, stored, cached, fingerprinted
row('rasteriser accumulates mat.color over OPAQUE triangles only', /mc = \(!isG && albAcc && mat && mat\.color\)/.test(lz), true, /mc = \(!isG && albAcc && mat && mat\.color\)/.test(lz));
row('alb joins the zone record KEYS (IDB cache)', /'stats', 'alb'\]/.test(lz), true, /'stats', 'alb'\]/.test(lz));
row('material colours join the cache fingerprint', /bsum, glN, glO, csum,/.test(lz), true, /bsum, glN, glO, csum,/.test(lz));
const slsrc = fs.readFileSync(path.join(V, 'sourced_light.js'), 'utf8');
row('IR key carries the colour switch (&ircol=0 never served the tinted texture)', /'\|col' \+ \(irColOn\(A\) \? 1 : 0\)/.test(slsrc), true, /'\|col' \+ \(irColOn\(A\) \? 1 : 0\)/.test(slsrc));
rows.forEach(q => { if (!q.ok) console.log('    FAILED ROW: ' + q.name + ' got=' + q.got + ' want=' + q.want); });
console.log('§Z19_UNIT rows=' + rows.length + ' ok=' + rows.filter(q => q.ok).length + ' worstRelDY=' + worst.toExponential(2) + ' redWallTint=' + r.map(v => v.toFixed(4)).join(','));
Witness('z19_ir_colour')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('luminance kept, tint direction, identities, sampling, cache', rs => rs.length >= 12 && rs.every(q => q.ok))
  .redControl(rs => { let s2 = 7, wb = 0; const rn = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;   // un-normalised tint (e x a / Y(a)) on coloured lamp IR must break row 0
    for (let i = 0; i < 2000; i++) { const e = [rn(), rn(), rn()].map(v => v * 5), a = [rn(), rn(), rn()], ya = Y(a), t = e.map((v, k) => v * a[k] / ya); wb = Math.max(wb, Math.abs(Y(t) - Y(e)) / Y(e)); }
    rs[0].ok = wb < 1e-9; rs[0].got = wb.toExponential(2); return rs; })
  .run();
