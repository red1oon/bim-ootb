#!/usr/bin/env node
// witness_cpe_seed_few.js — §CPE_SEED_FEW + §CPE_STICK_CLEAR (bim-compiler prompts/ALTC_FOUNDATION.md §1, 2026-10-04).
// ISSUE IT PROVES/DISPROVES: Alt+C on Terminal seeded one band PER route waypoint (21 x 20.7 m = 435 m of band on a
// 207 m walk), the bands overlapped and the authored walk zig-zagged to 704 m (film 151 s -> 474 s); and the seeded
// middle bands had no delete button. Runs the SHIPPED _cinemaSeedBands source (sliced from effects.js), node only.
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var eff = fs.readFileSync(path.join(root, 'effects.js'), 'utf8');
var cpe = fs.readFileSync(path.join(root, 'cinema_path_editor.js'), 'utf8');
var fails = 0, judged = 0;
function gate(name, ok, msg) { judged++; if (!ok) fails++; console.log('§W_SEED_FEW ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + msg); }

var a0 = eff.indexOf('var CINEMA_BAND_FRAC'), a1 = eff.indexOf('A.cinemaSeedBands = _cinemaSeedBands;');
if (a0 < 0 || a1 < 0) { console.log('§W_SEED_FEW INCONCLUSIVE — seeder source not found in effects.js'); process.exit(2); }
var A = {};   // no camera -> screen-floor branch skipped, world rule only (the branch is unchanged by this fix)
var seed = new Function('A', 'console', eff.slice(a0, a1) + '\nreturn _cinemaSeedBands;')(A, { log: function () {} });

// Route shape: a walk of n waypoints whose length matches Terminal's measured 207 m (§CINEMA_PACING), corners
// alternating so the tangent rule is exercised. The invariant is a property of the seeder, not of this shape.
function route(n, totalM) {
  var step = totalM / Math.max(1, n - 1), pts = [], x = 0, z = 0;
  for (var i = 0; i < n; i++) { pts.push({ x: x, y: 1.7, z: z }); if (i % 2) x += step; else z += step; }
  return pts;
}
function plen(p) { var L = 0; for (var i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i-1].x, p[i].y - p[i-1].y, p[i].z - p[i-1].z); return L; }

[2, 3, 5, 21].forEach(function (n) {
  var wp = route(n, 207), L = plen(wp), b = seed(wp, L);
  var sum = b.reduce(function (s, x) { return s + x.len; }, 0);
  var midOk = n <= 3 || (b[1].c.x === wp[Math.floor(n / 2)].x && b[1].c.z === wp[Math.floor(n / 2)].z);
  var ends = b[0].c.x === wp[0].x && b[0].c.z === wp[0].z && b[b.length - 1].c.x === wp[n - 1].x && b[b.length - 1].c.z === wp[n - 1].z;
  gate('n=' + n, b.length === Math.min(3, n) && ends && midOk && sum <= 0.45 * L + 1e-9,
    'seeded=' + b.length + ' ends=' + ends + ' mid=' + midOk + ' bandSum=' + sum.toFixed(2) + 'm cap=' + (0.45 * L).toFixed(2) + 'm');
});

// NO-OP guard: the OLD rule (one band per waypoint, same length) on n=21 must break the invariant, or this witness
// could not have seen the defect it claims to fix.
var wp21 = route(21, 207), L21 = plen(wp21), len21 = seed(wp21, L21)[0].len;
gate('old-rule-visible', 21 * len21 > 0.45 * L21 && 21 * len21 > L21,
  'old bandSum=' + (21 * len21).toFixed(2) + 'm vs walk ' + L21.toFixed(2) + 'm (old rule overlapped; the witness sees it)');

// §CPE_STICK_CLEAR source asserts.
gate('x-on-every-middle', /if \(i > 0 && i < _state\.bands\.length - 1\) \{\s*var del/.test(cpe) && !/if \(b\._stick && i > 0 && i < _state\.bands\.length - 1\) \{\s*var del/.test(cpe),
  '× gated on position only, not on b._stick');
gate('clear-button', cpe.indexOf("clr.id = 'cpe-stick-clear'") > 0 && cpe.indexOf("'§CPE_STICK_CLEAR removed='") > 0 && cpe.indexOf('function _clearSticks()') > 0,
  'button + _clearSticks + § line present');
gate('seed-log', eff.indexOf("'§CPE_SEED_FEW wp='") > 0, '§CPE_SEED_FEW line present');

console.log('§W_SEED_FEW_VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fail=' + fails);
process.exit(fails ? 1 : 0);
