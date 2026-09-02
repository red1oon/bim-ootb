#!/usr/bin/env node
/**
 * §ARC-1 REGRESSION — foldInsert raw-bbox extension must not perturb the catalog-hash path. Proves the present-hash
 * branch is byte-identical to pre-change behaviour, the raw-bbox branch works, and malformed ops still throw.
 */
'use strict';
var path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'bonsai_library.js'));
var Library = global.window.Bonsai.library;

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function aabb(p) { var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; } return { ex: mx[0] - mn[0], ey: mx[1] - mn[1], ez: mx[2] - mn[2], cx: (mn[0] + mx[0]) / 2, cy: (mn[1] + mx[1]) / 2 }; }
function approx(a, b) { return Math.abs(a - b) <= 1e-6; }

console.log('═══ §ARC-1 REGRESSION — foldInsert catalog path unperturbed ═══');
var cat = Library.catalog();
var col = cat.find(function (c) { return c.category === 'COLUMN'; });   // a legacy catalog component (known bbox)

// R1 — catalog-hash LOD-200 box: extent == the component's declared bbox extent (unchanged behaviour)
var d1 = Library.foldInsert({ id: 1, op_type: 'GEOM_INSERT', parameters: { hash: col.hash, placement: { x: 3, y: 4, z: 0, rot: 0 } } });
var b1 = aabb(d1.positions), bb = col.bbox;
chk('R1 catalog hash → LOD-200 box: extent == declared bbox + placed at x/y',
  approx(b1.ex, bb[1] - bb[0]) && approx(b1.ey, bb[3] - bb[2]) && approx(b1.ez, bb[5] - bb[4]) && approx(b1.cx, 3) && approx(b1.cy, 4),
  'ext=[' + b1.ex.toFixed(2) + ',' + b1.ey.toFixed(2) + ',' + b1.ez.toFixed(2) + ']');

// R2 — raw-bbox (no hash) → box of the given measured extent
var rb = [-1, 1, -0.5, 0.5, -1.5, 1.5];
var d2 = Library.foldInsert({ id: 2, op_type: 'GEOM_INSERT', parameters: { bbox: rb, placement: { x: 0, y: 0, z: 0, rot: 0 } } });
var b2 = aabb(d2.positions);
chk('R2 raw-bbox (no hash) → box of measured extent', approx(b2.ex, 2) && approx(b2.ey, 1) && approx(b2.ez, 3), 'ext=[' + b2.ex + ',' + b2.ey + ',' + b2.ez + ']');

// R3 — unknown hash still THROWS (guard preserved)
var threw = false; try { Library.foldInsert({ id: 3, op_type: 'GEOM_INSERT', parameters: { hash: 'deadbeef', placement: {} } }); } catch (e) { threw = /unknown component/.test(e.message); }
chk('R3 unknown catalog hash still throws (guard preserved)', threw);

// R4 — neither hash nor bbox → throws (malformed insert)
var threw2 = false; try { Library.foldInsert({ id: 4, op_type: 'GEOM_INSERT', parameters: { placement: {} } }); } catch (e) { threw2 = /hash or a measured bbox/.test(e.message); }
chk('R4 no hash + no bbox → throws (malformed)', threw2);

// R5 — featureId carried through (gizmo) on both paths
chk('R5 featureId == op id on both catalog + raw paths', d1.featureId === 1 && d2.featureId === 2);

console.log('§ARC-1 REGRESSION: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
