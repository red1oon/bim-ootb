#!/usr/bin/env node
/**
 * W-GRID-INSERT — §STRETCH-1 value witness (PURE NODE). foldInsert now makes a box-proxy insert grid-STRETCHABLE
 * host-side: a GEOM_GRID_MOVE command applies to the WORLD positions, a faithful mirror of the worker's
 * TRANSLATE/SCALE (bonsai_kernel_worker.js). Proves the box math + back-compat (no command ⇒ byte-identical).
 *
 *   T1 TRANSLATE   — world box shifts by delta on the axis; extent + other axes unchanged
 *   T2 SCALE far   — min edge FIXED, width = f·w (worker formula: coord = f·coord + min·(1−f))
 *   T3 SCALE near  — translateDelta shifts the min edge by exactly td (left-edge stretch)
 *   T4 compose     — GEOM_MOVE then grid SCALE: min taken from the MOVED positions (op order respected)
 *   T5 back-compat — gridCmds undefined/[] ⇒ positions byte-identical to the 2-arg call (non-invent, no perturbation)
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
function approx(a, b) { return Math.abs(a - b) <= 1e-9; }
function ax(p) { var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; } return { xmin: mn[0], xmax: mx[0], ymin: mn[1], ymax: mx[1], zmin: mn[2], zmax: mx[2] }; }
// a raw-bbox insert: local box [-1,1,-0.5,0.5,-1.5,1.5] placed centred at (5,0,3) (ground-seat z=1.5 → centre z=3)
function op() { return { id: 1, op_type: 'GEOM_INSERT', parameters: { bbox: [-1, 1, -0.5, 0.5, -1.5, 1.5], placement: { x: 5, y: 0, z: 1.5, rot: 0 } } }; }

console.log('═══ W-GRID-INSERT — §STRETCH-1 grid-stretchable insert (node) ═══');

var base = ax(Library.foldInsert(op()).positions);                                  // world [4,6,-0.5,0.5,1.5,4.5]
chk('T0 base world box', approx(base.xmin, 4) && approx(base.xmax, 6) && approx(base.zmin, 1.5) && approx(base.zmax, 4.5), JSON.stringify(base));

// T1 — TRANSLATE x +2
var t1 = ax(Library.foldInsert(op(), null, [{ action: 'TRANSLATE', axis: 'x', delta: 2 }]).positions);
chk('T1 TRANSLATE x+2: box shifts +2, extent + y/z unchanged', approx(t1.xmin, 6) && approx(t1.xmax, 8) && approx(t1.ymin, -0.5) && approx(t1.zmin, 1.5), JSON.stringify(t1));

// T2 — SCALE x f=2 far edge (translateDelta 0): min fixed at 4, max 6→8, width 2→4
var t2 = ax(Library.foldInsert(op(), null, [{ action: 'SCALE', axis: 'x', newScale: 2, translateDelta: 0 }]).positions);
chk('T2 SCALE x f=2 far: min FIXED at 4, width = f·w (→[4,8])', approx(t2.xmin, 4) && approx(t2.xmax, 8), JSON.stringify({ xmin: t2.xmin, xmax: t2.xmax }));

// T3 — SCALE x f=2 near edge (translateDelta 0.5): min shifts by exactly td (matches worker min→min+td)
var t3 = ax(Library.foldInsert(op(), null, [{ action: 'SCALE', axis: 'x', newScale: 2, translateDelta: 0.5 }]).positions);
chk('T3 SCALE x f=2 near (td=0.5): min shifts by td → [4.5,8.5]', approx(t3.xmin, 4.5) && approx(t3.xmax, 8.5), JSON.stringify({ xmin: t3.xmin, xmax: t3.xmax }));

// T4 — compose: GEOM_MOVE dx=+2 then grid SCALE x f=2 → min taken from MOVED positions (6) → [6,10]
var t4 = ax(Library.foldInsert(op(), { dx: 2, dy: 0, dz: 0 }, [{ action: 'SCALE', axis: 'x', newScale: 2, translateDelta: 0 }]).positions);
chk('T4 compose move+scale: min from MOVED box → [6,10] (op order respected)', approx(t4.xmin, 6) && approx(t4.xmax, 10), JSON.stringify({ xmin: t4.xmin, xmax: t4.xmax }));

// T5 — back-compat: no gridCmds ⇒ byte-identical to a [] command list AND to the 2-arg call
var p2 = Library.foldInsert(op(), null).positions;
var pEmpty = Library.foldInsert(op(), null, []).positions;
var same = p2.length === pEmpty.length && Array.prototype.every.call(p2, function (v, i) { return v === pEmpty[i]; });
chk('T5 back-compat: gridCmds=[] ⇒ positions byte-identical to the 2-arg call', same);

console.log('W-GRID-INSERT: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
