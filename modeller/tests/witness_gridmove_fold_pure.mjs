#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRIDMOVE-FOLD-PURE: closes prompts/GRID_KINEMATICS_SANDBOX_PROOF.md §3's identified
 * gap — "Stage 8 (the worker fold)... zero isolated coverage today. No test proves the worker fold turns a
 * KNOWN, hand-authored GEOM_GRID_MOVE.commands array into the EXACT expected final vertex positions,
 * independent of whether dragGrid() computed those commands correctly."
 *
 * §3 asked to check FIRST whether bonsai_kernel_worker.js's fold is ALSO pure/isolatable before assuming a
 * browser-only Tier 4 test is the only way to reach it — it is: bonsai_kernel_worker.js is plain occt-wasm
 * calls behind a postMessage protocol, no browser/DOM-specific API. This drives the REAL, UNMODIFIED file's
 * REAL self.onmessage handler (only `self`/`postMessage` are stubbed as plumbing — zero reimplementation of
 * the fold math itself, so this genuinely tests the shipped code, not a parallel model of it).
 *
 * TECHNIQUE: bonsai_kernel_worker.js is ESM (`import { OcctKernel } from './lib/kernel/index.js'`) written
 * as a Worker entry point (no exports, just a top-level `self.onmessage=...`). Node has no ambient
 * package.json in modeller/ marking it "type":"module" (and adding one would risk breaking the many
 * CommonJS-via-require witnesses that already load modeller/*.js as CJS — out of scope to touch). So: copy
 * the REAL source (read fresh off disk every run, byte-identical, never hand-edited) plus its real
 * lib/kernel/ dependency into a throwaway temp dir with its OWN scoped package.json, preserving the exact
 * relative layout the real `import './lib/kernel/index.js'` needs to resolve correctly. This is harness
 * plumbing only — no math, no logic, is duplicated.
 *
 * GEOM_GRID_MOVE fold math under test (bonsai_kernel_worker.js's own branch, read verbatim before writing
 * these expectations):
 *   TRANSLATE: out = kernel.translate(shape, axis==x?d:0, axis==y?d:0, axis==z?d:0)
 *   SCALE:     a = bbox.<axis>min; tx = a*(1-f) + translateDelta; M = axis-specific 3x4 general-transform
 *              (min-edge anchored: far-edge stretch keeps the MIN edge fixed, near-edge stretch shifts the
 *              min edge by exactly translateDelta) — kernel.generalTransform(shape, M)
 *
 * FIXTURE: one leaf GEOM_EXTRUDE_POLY (rectangle profile [0,0]-[4,0]-[4,2]-[0,2], depth=1) -> a real B-rep
 * box with world AABB x:[0,4] y:[0,2] z:[0,1] (base case verified in T0 before any grid command is layered
 * on, so a fixture bug can't masquerade as a fold bug). Each T1+ case is a FRESH op chain (distinct op_hash
 * per case -> no cache collision across cases).
 */
'use strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(__dirname, '..');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol != null ? tol : 1e-6); }
function aabb(positions) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    xmin = Math.min(xmin, positions[i]); xmax = Math.max(xmax, positions[i]);
    ymin = Math.min(ymin, positions[i + 1]); ymax = Math.max(ymax, positions[i + 1]);
    zmin = Math.min(zmin, positions[i + 2]); zmax = Math.max(zmax, positions[i + 2]);
  }
  return { xmin, xmax, ymin, ymax, zmin, zmax };
}

console.log('═══ W-GRIDMOVE-FOLD-PURE — §3: the worker fold, isolated in pure node against the real occt-wasm kernel ═══');

// ── Mirror the real worker + its real lib/kernel/ dependency into a throwaway ESM-scoped temp dir ────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gridfold-witness-'));
fs.mkdirSync(path.join(tmp, 'lib', 'kernel'), { recursive: true });
for (const f of fs.readdirSync(path.join(MOD, 'lib', 'kernel'))) {
  fs.copyFileSync(path.join(MOD, 'lib', 'kernel', f), path.join(tmp, 'lib', 'kernel', f));
}
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(MOD, 'bonsai_kernel_worker.js'), path.join(tmp, 'worker.mjs'));

globalThis.self = globalThis.self || {};
self.postMessage = () => {}; // top-level `self.postMessage({ready:true})` fires at import time
await import(path.join(tmp, 'worker.mjs'));

function send(data) {
  return new Promise((resolve) => {
    self.postMessage = (msg) => { if (msg.id === data.id) resolve(msg); };
    self.onmessage({ data });
  });
}

const RECT = { points: [[0, 0], [4, 0], [4, 2], [0, 2]] };
function extrudeOp(id, hashSuffix) {
  return { id, op_hash: 'leaf:' + hashSuffix, op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: RECT, depth: 1 } };
}
function gridMoveOp(id, hashSuffix, delta, commands) {
  return { id, op_hash: 'grid:' + hashSuffix, op_type: 'GEOM_GRID_MOVE', parameters: { gridId: 'gx1', delta, commands } };
}

// T0 — base case, no grid command: confirms the fixture itself is x:[0,4] y:[0,2] z:[0,1] before trusting
// any of the deltas below.
const r0 = await send({ id: 0, ops: [extrudeOp(1, 't0')] });
chk('T0 base fixture AABB (no grid command)', r0.ok, r0.error);
if (r0.ok) {
  const b0 = aabb(r0.meshes[0].positions);
  chk('T0 base x:[0,4] y:[0,2] z:[0,1]',
    approx(b0.xmin, 0) && approx(b0.xmax, 4) && approx(b0.ymin, 0) && approx(b0.ymax, 2) && approx(b0.zmin, 0) && approx(b0.zmax, 1),
    JSON.stringify(b0));
}

// T1 — TRANSLATE x by +2: x:[0,4]->[2,6], y/z unchanged.
const r1 = await send({ id: 1, ops: [extrudeOp(1, 't1'), gridMoveOp(2, 't1', 2, [{ featureId: 1, action: 'TRANSLATE', axis: 'x', delta: 2 }])] });
chk('T1 fold ok', r1.ok, r1.error);
if (r1.ok) {
  const b1 = aabb(r1.meshes[0].positions);
  chk('T1 TRANSLATE x+2 -> x:[2,6] y:[0,2] z:[0,1] (y/z untouched)',
    approx(b1.xmin, 2) && approx(b1.xmax, 6) && approx(b1.ymin, 0) && approx(b1.ymax, 2) && approx(b1.zmin, 0) && approx(b1.zmax, 1),
    JSON.stringify(b1));
}

// T2 — TRANSLATE y by -1.5 (a non-x axis, to catch an axis-mux transcription bug): y:[0,2]->[-1.5,0.5].
const r2 = await send({ id: 2, ops: [extrudeOp(1, 't2'), gridMoveOp(2, 't2', -1.5, [{ featureId: 1, action: 'TRANSLATE', axis: 'y', delta: -1.5 }])] });
chk('T2 fold ok', r2.ok, r2.error);
if (r2.ok) {
  const b2 = aabb(r2.meshes[0].positions);
  chk('T2 TRANSLATE y-1.5 -> y:[-1.5,0.5] x:[0,4] z:[0,1] (x/z untouched)',
    approx(b2.ymin, -1.5) && approx(b2.ymax, 0.5) && approx(b2.xmin, 0) && approx(b2.xmax, 4) && approx(b2.zmin, 0) && approx(b2.zmax, 1),
    JSON.stringify(b2));
}

// T3 — SCALE x, f=2, far edge (translateDelta=0): worker formula tx = xmin*(1-f)+0 = 0*(1-2) = 0 -> min FIXED
// at 0, width doubles 4->8 -> x:[0,8].
const r3 = await send({ id: 3, ops: [extrudeOp(1, 't3'), gridMoveOp(2, 't3', 4, [{ featureId: 1, action: 'SCALE', axis: 'x', newScale: 2, translateDelta: 0 }])] });
chk('T3 fold ok', r3.ok, r3.error);
if (r3.ok) {
  const b3 = aabb(r3.meshes[0].positions);
  chk('T3 SCALE x f=2 far (td=0): min FIXED at 0, width doubles -> x:[0,8]',
    approx(b3.xmin, 0) && approx(b3.xmax, 8), JSON.stringify({ xmin: b3.xmin, xmax: b3.xmax }));
}

// T4 — SCALE x, f=2, near edge (translateDelta=1.5): tx = 0*(1-2)+1.5 = 1.5 -> min shifts to 1.5, width
// f*origWidth = 2*4=8 -> x:[1.5,9.5].
const r4 = await send({ id: 4, ops: [extrudeOp(1, 't4'), gridMoveOp(2, 't4', 4, [{ featureId: 1, action: 'SCALE', axis: 'x', newScale: 2, translateDelta: 1.5 }])] });
chk('T4 fold ok', r4.ok, r4.error);
if (r4.ok) {
  const b4 = aabb(r4.meshes[0].positions);
  chk('T4 SCALE x f=2 near (td=1.5): min shifts by td -> x:[1.5,9.5]',
    approx(b4.xmin, 1.5) && approx(b4.xmax, 9.5), JSON.stringify({ xmin: b4.xmin, xmax: b4.xmax }));
}

// T5 — SCALE z (a 3rd distinct axis-matrix branch), f=0.5, far edge (translateDelta=0): tx = zmin*(1-f)+0 =
// 0*(0.5) = 0 -> min FIXED at 0, width halves 1->0.5 -> z:[0,0.5].
const r5 = await send({ id: 5, ops: [extrudeOp(1, 't5'), gridMoveOp(2, 't5', -0.5, [{ featureId: 1, action: 'SCALE', axis: 'z', newScale: 0.5, translateDelta: 0 }])] });
chk('T5 fold ok', r5.ok, r5.error);
if (r5.ok) {
  const b5 = aabb(r5.meshes[0].positions);
  chk('T5 SCALE z f=0.5 far (td=0): min FIXED at 0, width halves -> z:[0,0.5]',
    approx(b5.zmin, 0) && approx(b5.zmax, 0.5), JSON.stringify({ zmin: b5.zmin, zmax: b5.zmax }));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('W-GRIDMOVE-FOLD-PURE: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
