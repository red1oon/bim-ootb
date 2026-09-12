#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CUT-MOVE: GEOM_CUT_MOVE folded by the REAL worker (pure node, real occt-wasm) + the shared
 * frame math (modeller/cut_move.js). Implementing prompts/SPEC_GEOM_CUT_MOVE.md §5. Read the log after every run —
 * exit code alone is not evidence.
 *
 * Issue under test: a signed GEOM_CUT's void could never move — the slide REFUSED any filling over a carved void
 * (witness_opening_slide S6 "no op can move a committed void"), and a grid stretch with the door HELD let the fold's
 * SCALE carry the hole away from the door. This proves the ONE new op fixes both, at the kernel level, with numbers:
 *
 *   C0 BASE        — wall [0,4]×[0,0.2]×[0,3] + through-void x∈[1.2,2.8] z∈[0.9,2.1]: hole measured off the vertices
 *   C1 NET-SHIFT   — netShifts sums per cut, ignores a row naming a non-active cut, '' signature when unused
 *   C2 FOLD-SHIFT  — + GEOM_CUT_MOVE dx=0.8 ⇒ the hole is at [2.0,3.6], width unchanged, wall outline unchanged
 *   C3 ANCHOR      — GRID SCALE f=1.25 alone moves the hole centre 2.0→2.5; with the anchorShift rider s=−0.4 the
 *                    centre STAYS at 2.0 (min-edge drag with translateDelta, and a prior stretch F=1.25, likewise);
 *                    the width residual (f−1)·F·w is reported exactly
 *   C4 CACHE       — the original chain folded again after a moved fold hits the cache AND yields the original hole
 *   C5 FRAME       — frameScale: post-cut SCALE/MOVE counted, pre-cut ignored, ROTATE after cut ⇒ ok:false; slideShift
 *   C6 SLIDE-FOLD  — after a prior stretch, a slide of world 0.8 rides as authored 0.64 and the folded hole moves 0.8
 *
 * TECHNIQUE (verbatim from witness_gridmove_fold_pure.mjs): the REAL bonsai_kernel_worker.js + its real lib/kernel/
 * + the real cut_move.js it imports are copied byte-identical into a scoped ESM temp dir; only self/postMessage are
 * stubbed. Zero fold math is re-implemented here.
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
const approx = (a, b, tol) => Math.abs(a - b) <= (tol != null ? tol : 1e-6);
const j = (x) => JSON.stringify(x);
function aabb(p) {
  let b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { b[2 * k] = Math.min(b[2 * k], p[i + k]); b[2 * k + 1] = Math.max(b[2 * k + 1], p[i + k]); }
  return b;
}
// The hole's x-extent: a through-void's edge loops are the ONLY vertices strictly between the wall's top and bottom
// (the wall's own corners sit at z=0 / z=3; OCCT triangulates a planar face from its boundary nodes only).
function holeX(p, zlo, zhi) {
  let xmin = Infinity, xmax = -Infinity, n = 0;
  for (let i = 0; i < p.length; i += 3) { const z = p[i + 2]; if (z > zlo + 1e-6 && z < zhi - 1e-6) { xmin = Math.min(xmin, p[i]); xmax = Math.max(xmax, p[i]); n++; } }
  return { xmin, xmax, c: (xmin + xmax) / 2, w: xmax - xmin, n };
}
// §CUT-FRAME-ROTATE: the same technique, generalized to any axis (0=x,1=y) — after a 90°/270° rotation the hole's
// long axis is Y, not X.
function holeExtent(p, axis, zlo, zhi) {
  let mn = Infinity, mx = -Infinity, n = 0;
  for (let i = 0; i < p.length; i += 3) { const z = p[i + 2]; if (z > zlo + 1e-6 && z < zhi - 1e-6) { const v = p[i + axis]; mn = Math.min(mn, v); mx = Math.max(mx, v); n++; } }
  return { min: mn, max: mx, c: (mn + mx) / 2, w: mx - mn, n };
}

console.log('═══ W-CUT-MOVE — GEOM_CUT_MOVE through the REAL worker fold + cut_move.js frame math (node, occt-wasm) ═══');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cutmove-witness-'));
fs.mkdirSync(path.join(tmp, 'lib', 'kernel'), { recursive: true });
for (const f of fs.readdirSync(path.join(MOD, 'lib', 'kernel'))) fs.copyFileSync(path.join(MOD, 'lib', 'kernel', f), path.join(tmp, 'lib', 'kernel', f));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(MOD, 'bonsai_kernel_worker.js'), path.join(tmp, 'worker.mjs'));
fs.copyFileSync(path.join(MOD, 'cut_move.js'), path.join(tmp, 'cut_move.js'));   // the worker's own `import './cut_move.js?v=1'`

globalThis.self = globalThis.self || {};
self.postMessage = () => {};
await import(path.join(tmp, 'worker.mjs'));
const CM = self.CutMove;   // bound by the worker's import — the SAME object the fold uses
chk('C0 cut_move.js is bound on the worker global by the worker\'s own import', !!(CM && CM.netShifts && CM.anchorShift));

function send(data) {
  return new Promise((resolve) => { self.postMessage = (msg) => { if (msg.id === data.id) resolve(msg); }; self.onmessage({ data }); });
}
let seq = 0;
const WALL_BOX = [0, 4, 0, 0.2, 0, 3];
const wallOp = (h) => ({ id: 1, op_hash: 'wall:' + h, op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } });
const cutOp = (h) => ({ id: 2, op_hash: 'cut:' + h, op_type: 'GEOM_CUT', parent: 1, parameters: { parent: 1, void: { c1: [1.2, -0.5, 0.9], c2: [2.8, 0.7, 2.1] } } });
const cmOp = (id, h, s, cutId) => ({ id, op_hash: 'cm:' + h + ':' + id, op_type: 'GEOM_CUT_MOVE', parent: 1, parameters: { cutId: cutId == null ? 2 : cutId, parent: 1, dx: s[0], dy: s[1], dz: s[2], induced: 'test' } });
const rzOp = (id, h, fx, fy, fz, cutId) => ({ id, op_hash: 'rz:' + h + ':' + id, op_type: 'GEOM_CUT_RESIZE', parent: 1, parameters: { cutId: cutId == null ? 2 : cutId, parent: 1, fx: fx, fy: fy, fz: fz, induced: 'test' } });
const gridOp = (id, h, f, td) => ({ id, op_hash: 'grid:' + h + ':' + id, op_type: 'GEOM_GRID_MOVE', parameters: { gridId: 'gx1', delta: 1, commands: [{ featureId: 1, action: 'SCALE', axis: 'x', newScale: f, translateDelta: td }] } });
const rotOp = (id, h, drot) => ({ id, op_hash: 'rot:' + h + ':' + id, op_type: 'GEOM_ROTATE', parent: 1, parameters: { parent: 1, drot } });
async function fold(ops) { const r = await send({ id: ++seq, ops }); if (!r.ok) throw new Error('fold failed: ' + r.error); const m = r.meshes.find(x => x.featureId === 1); return { box: aabb(m.positions), hole: holeX(m.positions, 0, 3), positions: m.positions, stats: r.stats }; }

// ── C0 BASE ──────────────────────────────────────────────────────────────────────────────────────────────────
const c0 = await fold([wallOp('A'), cutOp('A')]);
console.log('  C0 box=' + j(c0.box.map(v => +v.toFixed(4))) + ' hole=' + j(c0.hole));
chk('C0 BASE: wall [0,4]×[0,0.2]×[0,3] with a through-void ⇒ hole x∈[1.2,2.8] (8 loop vertices), outline unchanged',
  approx(c0.box[0], 0) && approx(c0.box[1], 4) && approx(c0.box[5], 3) && approx(c0.hole.xmin, 1.2) && approx(c0.hole.xmax, 2.8) && c0.hole.n >= 8, j(c0.hole));

// ── C1 NET-SHIFT (pure) ──────────────────────────────────────────────────────────────────────────────────────
const n1 = CM.netShifts([wallOp('A'), cutOp('A'), cmOp(3, 'n', [0.5, 0, 0]), cmOp(4, 'n', [0.3, 0, 0.1]), cmOp(5, 'n', [9, 9, 9], 777)]);
const n1b = CM.netShifts([wallOp('A'), cutOp('A'), cmOp(4, 'n', [0.3, 0, 0.1]), cmOp(3, 'n', [0.5, 0, 0])]);
const n0 = CM.netShifts([wallOp('A'), cutOp('A')]);
chk('C1 NET-SHIFT: two rows on cut #2 sum to (0.8,0,0.1); a row naming non-active cut #777 is IGNORED; the signature is order-independent; no rows ⇒ \'\' (keys byte-identical when unused)',
  n1.byCut['2'] && approx(n1.byCut['2'][0], 0.8) && approx(n1.byCut['2'][2], 0.1) && !n1.byCut['777'] && n1.sig === n1b.sig && /^2:0\.8,0,0\.1$/.test(n1.sig) &&
  n0.sig === '' && CM.keySuffix(n0.sig) === '' && CM.keySuffix(n1.sig) === '|cm:2:0.8,0,0.1', j({ sig: n1.sig, sigB: n1b.sig, byCut: n1.byCut }));

// ── C2 FOLD-SHIFT ────────────────────────────────────────────────────────────────────────────────────────────
const c2 = await fold([wallOp('A'), cutOp('A'), cmOp(3, 'c2', [0.8, 0, 0])]);
console.log('  C2 hole=' + j(c2.hole) + ' box=' + j(c2.box.map(v => +v.toFixed(4))) + ' stats=' + j(c2.stats));
chk('C2 FOLD-SHIFT: + GEOM_CUT_MOVE {cutId:2, dx:0.8} ⇒ the worker subtracts the void at [2.0,3.6] (width 1.6 unchanged); the wall outline stays [0,4]; the cut was REBUILT (not a stale cache hit)',
  approx(c2.hole.xmin, 2.0) && approx(c2.hole.xmax, 3.6) && approx(c2.hole.w, 1.6) && approx(c2.box[0], 0) && approx(c2.box[1], 4) && c2.stats.rebuilt >= 1, j(c2.hole));

// ── C3 ANCHOR ────────────────────────────────────────────────────────────────────────────────────────────────
const c3a = await fold([wallOp('A'), cutOp('A'), gridOp(3, 'c3', 1.25, 0)]);
const a3 = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A')], hostBox: WALL_BOX, axis: 0, f: 1.25, translateDelta: 0 });
const c3b = await fold([wallOp('A'), cutOp('A'), gridOp(3, 'c3', 1.25, 0), cmOp(4, 'c3', [a3.s, 0, 0])]);
console.log('  C3 no-rider hole=' + j(c3a.hole) + '  anchorShift=' + j(a3) + '  with-rider hole=' + j(c3b.hole) + ' box=' + j(c3b.box.map(v => +v.toFixed(4))));
chk('C3a ANCHOR (the issue): GRID SCALE f=1.25 about min 0 alone carries the hole centre 2.0→2.5 and widens it 1.6→2.0 while a held door stays at 2.0',
  approx(c3a.hole.c, 2.5) && approx(c3a.hole.w, 2.0) && approx(c3a.box[1], 5), j(c3a.hole));
chk('C3b ANCHOR inverse: anchorShift ⇒ s=−Δ/(f·F)=−0.4 (Δ=0.5, F=1, q=2.0); folding the rider AFTER the grid op keeps the hole centre at 2.0 exactly; width 2.0 = the reported residual +0.4',
  a3.ok && approx(a3.s, -0.4) && approx(a3.q, 2.0) && approx(a3.delta, 0.5) && approx(a3.residual, 0.4) && approx(c3b.hole.c, 2.0) && approx(c3b.hole.w, 2.0) && approx(c3b.box[1], 5), j({ s: a3.s, hole: c3b.hole }));
// min-edge drag: the left gridline moves −1 ⇒ SCALE f=1.25 with translateDelta=−1 (wall → [−1,4])
const a3c = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A')], hostBox: WALL_BOX, axis: 0, f: 1.25, translateDelta: -1 });
const c3c = await fold([wallOp('A'), cutOp('A'), gridOp(3, 'c3c', 1.25, -1), cmOp(4, 'c3c', [a3c.s, 0, 0])]);
console.log('  C3c anchorShift=' + j(a3c) + ' hole=' + j(c3c.hole) + ' box=' + j(c3c.box.map(v => +v.toFixed(4))));
chk('C3c ANCHOR min-edge: f=1.25, translateDelta=−1 ⇒ Δ=2.0·0.25−1=−0.5, s=+0.4; folded wall is [−1,4] and the hole centre stays at 2.0',
  a3c.ok && approx(a3c.delta, -0.5) && approx(a3c.s, 0.4) && approx(c3c.box[0], -1) && approx(c3c.box[1], 4) && approx(c3c.hole.c, 2.0), j({ s: a3c.s, hole: c3c.hole }));
// a PRIOR stretch (F=1.25, hole unheld then ⇒ centre 2.5 in world) followed by a second stretch f=1.2 with the door held
const prior = [wallOp('A'), cutOp('A'), gridOp(3, 'c3d', 1.25, 0)];
const a3d = CM.anchorShift({ cutOp: cutOp('A'), ops: prior, hostBox: [0, 5, 0, 0.2, 0, 3], axis: 0, f: 1.2, translateDelta: 0 });
const c3d = await fold(prior.concat([gridOp(4, 'c3d', 1.2, 0), cmOp(5, 'c3d', [a3d.s, 0, 0])]));
console.log('  C3d anchorShift=' + j(a3d) + ' hole=' + j(c3d.hole) + ' box=' + j(c3d.box.map(v => +v.toFixed(4))));
chk('C3d ANCHOR with a prior stretch: F=1.25 ⇒ q=2.5 (the hole\'s CURRENT world centre, read from the log), Δ=0.5, s=−0.5/(1.2·1.25)=−0.3333; the doubly-scaled fold keeps the centre at 2.5',
  a3d.ok && approx(a3d.F, 1.25) && approx(a3d.q, 2.5) && approx(a3d.s, -0.5 / 1.5) && approx(c3d.box[1], 6) && approx(c3d.hole.c, 2.5, 1e-6), j({ s: a3d.s, hole: c3d.hole }));

// ── C4 CACHE ─────────────────────────────────────────────────────────────────────────────────────────────────
const c4 = await fold([wallOp('A'), cutOp('A')]);   // the SAME op_hashes as C0 — must hit the ORIGINAL (unsuffixed) keys
console.log('  C4 hole=' + j(c4.hole) + ' stats=' + j(c4.stats));
chk('C4 CACHE: re-folding the original chain (same op_hashes) after the moved folds is a cache HIT and yields the ORIGINAL hole [1.2,2.8] — no stale shifted shape under the old key',
  approx(c4.hole.xmin, 1.2) && approx(c4.hole.xmax, 2.8) && c4.stats.hits >= 1 && c4.stats.rebuilt === 0, j(c4.stats));

// ── C5 FRAME (pure) ──────────────────────────────────────────────────────────────────────────────────────────
const mv = { id: 4, op_type: 'GEOM_MOVE', parent: 1, parameters: { parent: 1, dx: 0.5, dy: 0, dz: 0 } };
const preGrid = { id: 0, op_type: 'GEOM_GRID_MOVE', parameters: { commands: [{ featureId: 1, action: 'SCALE', axis: 'x', newScale: 3, translateDelta: 0 }] } };
const f5 = CM.frameScale([preGrid, wallOp('A'), cutOp('A'), gridOp(3, 'f5', 1.25, 0), mv], cutOp('A'), 0);
const f5y = CM.frameScale([wallOp('A'), cutOp('A'), gridOp(3, 'f5', 1.25, 0), mv], cutOp('A'), 1);
const f5r = CM.frameScale([wallOp('A'), cutOp('A'), { id: 3, op_type: 'GEOM_ROTATE', parent: 1, parameters: { parent: 1, drot: 30 } }], cutOp('A'), 0);
const f5o = CM.frameScale([wallOp('A'), cutOp('A'), { id: 3, op_type: 'GEOM_GRID_MOVE', parameters: { commands: [{ featureId: 1, action: 'SCALE', axis: 'x', newScale: 1.1, yawRad: 0.4 }] } }], cutOp('A'), 0);
chk('C5 FRAME: post-cut SCALE×1.25 + MOVE 0.5 ⇒ {F:1.25, tPost:0.5} on x, {1,0} on y; a PRE-cut scale (id<cut) is ignored; ROTATE after cut ⇒ ok:false; oblique-yaw SCALE ⇒ ok:false; slideShift(0.8,1.25)=0.64',
  f5.ok && approx(f5.f, 1.25) && approx(f5.tPost, 0.5) && f5y.ok && f5y.f === 1 && f5y.tPost === 0 && f5r.ok === false && /rotated-after-cut/.test(f5r.reason) &&
  f5o.ok === false && /oblique/.test(f5o.reason) && approx(CM.slideShift(0.8, 1.25), 0.64) && approx(CM.slideShift(0.8, 1), 0.8), j({ f5, f5y, f5r: f5r.reason, f5o: f5o.reason }));

// ── C6 SLIDE-FOLD ────────────────────────────────────────────────────────────────────────────────────────────
const s6 = CM.slideShift(0.8, CM.frameScale(prior, cutOp('A'), 0).f);
const c6 = await fold(prior.concat([cmOp(4, 'c6', [s6, 0, 0])]));
console.log('  C6 authored shift=' + s6 + ' hole=' + j(c6.hole));
chk('C6 SLIDE-FOLD: after the prior stretch (hole centre 2.5), a slide of world +0.8 rides as authored 0.64; the folded hole centre is 3.3 = 2.5 + 0.8 exactly',
  approx(s6, 0.64) && approx(c6.hole.c, 3.3) && approx(c6.hole.w, 2.0), j(c6.hole));

// ── R1 NET-OVERRIDES (pure) ─────────────────────────────────────────────────────────────────────────────────
const n1r = CM.netOverrides([wallOp('A'), cutOp('A'), rzOp(3, 'r1', 0.5), rzOp(4, 'r1', 0.8), rzOp(5, 'r1', 0), rzOp(6, 'r1', 9, 9, 9, 777)]);
const nsOnly = CM.netShifts([wallOp('A'), cutOp('A'), cmOp(3, 'r1s', [0.5, 0, 0]), cmOp(4, 'r1s', [0.3, 0, 0.1])]);
console.log('  R1 f=' + j(n1r.byCut['2'] && n1r.byCut['2'].f) + ' sig=' + n1r.sig + ' netShifts-only sig=' + nsOnly.sig);
chk('R1 NET-OVERRIDES: two GEOM_CUT_RESIZE rows fx=0.5 and fx=0.8 on cut #2 multiply to f=[0.4,1,1]; a row with fx=0 is IGNORED (and one naming non-active cut #777); sig contains both s and f; the netShifts wrapper (shift rows only, no resize in play) still returns the SAME sig SHAPE step 1 produced (backwards-compatible keys)',
  n1r.byCut['2'] && approx(n1r.byCut['2'].f[0], 0.4) && approx(n1r.byCut['2'].f[1], 1) && approx(n1r.byCut['2'].f[2], 1) && !n1r.byCut['777'] &&
  /^2:0,0,0\*0\.4,1,1$/.test(n1r.sig) && nsOnly.sig === '2:0.8,0,0.1' && CM.keySuffix(nsOnly.sig) === '|cm:2:0.8,0,0.1',
  j({ sig: n1r.sig, f: n1r.byCut['2'].f, nsOnlySig: nsOnly.sig }));

// ── R2 FOLD-RESIZE ───────────────────────────────────────────────────────────────────────────────────────────
const r2 = await fold([wallOp('A'), cutOp('A'), rzOp(3, 'r2', 0.5)]);
console.log('  R2 hole=' + j(r2.hole) + ' box=' + j(r2.box.map(v => +v.toFixed(4))));
chk('R2 FOLD-RESIZE: + GEOM_CUT_RESIZE {cutId:2, fx:0.5} ⇒ the worker resizes the void ABOUT ITS OWN CENTRE to [1.6,2.4] (centre 2.0 kept, width 0.8); wall outline unchanged',
  approx(r2.hole.xmin, 1.6) && approx(r2.hole.xmax, 2.4) && approx(r2.hole.c, 2.0) && approx(r2.hole.w, 0.8) && approx(r2.box[0], 0) && approx(r2.box[1], 4), j(r2.hole));

// ── R3 WIDTH-HOLD ────────────────────────────────────────────────────────────────────────────────────────────
const a3x = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A')], hostBox: WALL_BOX, axis: 0, f: 1.25, translateDelta: 0 });
const a3y = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A')], hostBox: WALL_BOX, axis: 1, f: 1, translateDelta: 0 });
const r3 = await fold([wallOp('A'), cutOp('A'), gridOp(3, 'r3', 1.25, 0), cmOp(4, 'r3', [a3x.s, 0, 0]), rzOp(5, 'r3', a3x.g)]);
console.log('  R3 anchorShift.x=' + j(a3x) + ' anchorShift.y=' + j(a3y) + ' hole=' + j(r3.hole) + ' box=' + j(r3.box.map(v => +v.toFixed(4))));
chk('R3 WIDTH-HOLD: GRID SCALE f=1.25 + GEOM_CUT_MOVE s=−0.4 (step 1\'s centre-hold) + GEOM_CUT_RESIZE fx=1/f=0.8 (the width-hold) ⇒ hole centre 2.0 AND width 1.6 EXACTLY (the step-1 residual is gone); anchorShift returns g=0.8 on x, through=false on x (in-plane) and through=true on y (the ±0.5 thickness overhang past the 0.2m-thick wall)',
  a3x.ok && approx(a3x.g, 0.8) && a3x.through === false && a3y.through === true &&
  approx(r3.hole.c, 2.0) && approx(r3.hole.w, 1.6) && approx(r3.box[1], 5), j({ a3x, a3y, hole: r3.hole }));

// ── R4 COMMUTE ───────────────────────────────────────────────────────────────────────────────────────────────
const r4 = await fold([wallOp('A'), cutOp('A'), gridOp(3, 'r4', 1.25, 0), rzOp(4, 'r4', a3x.g), cmOp(5, 'r4', [a3x.s, 0, 0])]);
console.log('  R4 hole=' + j(r4.hole) + ' box=' + j(r4.box.map(v => +v.toFixed(4))));
chk('R4 COMMUTE: the R3 chain with the MOVE and RESIZE rows swapped in id/array order ⇒ byte-identical hole (the resize is about the void\'s OWN centre and the shift moves that centre, so shift and resize commute — the row order in the log is irrelevant)',
  approx(r4.hole.c, r3.hole.c, 1e-9) && approx(r4.hole.w, r3.hole.w, 1e-9) && approx(r4.hole.xmin, r3.hole.xmin, 1e-9) && approx(r4.hole.xmax, r3.hole.xmax, 1e-9), j({ r3: r3.hole, r4: r4.hole }));

// ── R5 CACHE ─────────────────────────────────────────────────────────────────────────────────────────────────
const r5 = await fold([wallOp('A'), cutOp('A')]);   // the SAME op_hashes as C0/C4 — must hit the ORIGINAL (unsuffixed) keys
const sigR3 = CM.netOverrides([wallOp('A'), cutOp('A'), gridOp(3, 'r3', 1.25, 0), cmOp(4, 'r3', [a3x.s, 0, 0]), rzOp(5, 'r3', a3x.g)]).sig;
console.log('  R5 hole=' + j(r5.hole) + ' stats=' + j(r5.stats) + ' sigR3=' + sigR3);
chk('R5 CACHE: after the R2/R3 folds, re-folding the plain wall+cut chain (same op_hashes as C0) is a cache HIT and yields the ORIGINAL hole [1.2,2.8]; the R3 fold\'s cut-move+resize signature differs from step 1\'s shift-only signature (\'2:-0.4,0,0\') — resize is in the cache key, no stale hits either way',
  approx(r5.hole.xmin, 1.2) && approx(r5.hole.xmax, 2.8) && r5.stats.hits >= 1 && r5.stats.rebuilt === 0 && sigR3 !== '2:-0.4,0,0', j({ hole: r5.hole, stats: r5.stats, sigR3 }));

// ── F0 IDENTITY (pure) ───────────────────────────────────────────────────────────────────────────────────────
// A chain with no rotation: hostFrame must give byte-identical numbers to frameScale/anchorShift/slideShift (step 1/2).
const f0hf = CM.hostFrame([wallOp('A'), cutOp('A'), gridOp(3, 'f0', 1.25, 0), mv], cutOp('A'), [0, 5, 0.5, 0.7, 0, 3]);
const f0anchor = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A')], hostBox: WALL_BOX, axis: 0, f: 1.25, translateDelta: 0 });
const f0slide = CM.slideShiftM([0.8, 0, 0], CM.hostFrame(prior, cutOp('A'), [0, 5, 0, 0.2, 0, 3]).M);
console.log('  F0 hostFrame=' + j(f0hf) + ' anchorShift.s=' + f0anchor.s + ' slideShiftM=' + j(f0slide));
chk('F0 IDENTITY: a chain with no rotation gives M = {perm id, a=[1.25,1,1], b=[0.5,0,0]} for the C5 fixture (SCALE f=1.25 then MOVE dx=0.5 — the general-point affine offset b, NOT frameScale\'s old tPost which only tracked the min\'s own telescoping trajectory: here hostBoxNow starts at [0,5,0.5,0.7,...] so boxAtCut is [-0.5,3.5,0.5,0.7,...], and b = 0.5 − 0.25·boxAtCut.min = 0.625, independently verified by direct point-mapping below); anchorShift/slideShiftM reduce to the EXACT C3b/C6 numbers (s=−0.4, slideShiftM=0.64)',
  f0hf.ok && JSON.stringify(f0hf.M.perm) === '[0,1,2]' && approx(f0hf.M.a[0], 1.25) && approx(f0hf.M.b[0], 0.625) &&
  approx(f0anchor.s, -0.4) && approx(f0slide[0], 0.64), j({ M: f0hf.M, anchorS: f0anchor.s, slide: f0slide }));
// independent cross-check of b via direct point-mapping (authored x=2 → world, through SCALE then MOVE, by hand):
// SCALE(f=1.25, m=boxAtCut.min=-0.5, t=0): world = 1.25*2 + (-0.5)*(1-1.25) = 2.5+0.125 = 2.625; MOVE +0.5 ⇒ 3.125.
const f0check = CM.mapPoint(f0hf.M, [2, 0, 0])[0];
chk('F0 CROSS-CHECK: mapPoint(M,[2,0,0]) on x = 3.125 (independently hand-derived above) — confirms M.b is correct even though it differs from the spec text\'s parenthetical example (b=[0.5,0,0], which conflates b with frameScale\'s tPost)',
  approx(f0check, 3.125), 'mapPoint=' + f0check);

// ── F1 ROTATE-90 ─────────────────────────────────────────────────────────────────────────────────────────────
const r1pre = await fold([wallOp('A'), cutOp('A'), rotOp(3, 'f1', 90)]);
console.log('  F1 pre-slide box=' + j(r1pre.box.map(v => +v.toFixed(4))));
const f1hf = CM.hostFrame([wallOp('A'), cutOp('A'), rotOp(3, 'f1', 90)], cutOp('A'), r1pre.box);
const holeY1 = holeExtent(r1pre.positions, 1, r1pre.box[4], r1pre.box[5]);
const holeXr1 = holeExtent(r1pre.positions, 0, r1pre.box[4], r1pre.box[5]);
console.log('  F1 hostFrame=' + j(f1hf) + ' holeY=' + j(holeY1) + ' holeX=' + j(holeXr1));
chk('F1 ROTATE-90: wall+cut+GEOM_ROTATE drot=90 ⇒ hostFrame gives perm=[1,0,2] (world x reads authored y, world y reads authored x), a=[-1,1,1] (a 90° spin swaps axes and flips one sign), the sanity invariant mapBox(M,boxAtCut)==hostBoxNow held (hf.ok); folded through the REAL worker the hole\'s world extent is now along Y (centre 0.1, width 1.6 = the authored X/door-width, unchanged by rotation) with a narrow X extent (centre 2.0, width 0.2 = the wall\'s own thickness — the void\'s oversized authored through-overshoot on Y was already CLIPPED to the wall\'s [0,0.2] at cut time, before the rotate) — the hole followed the host\'s spin',
  f1hf.ok && JSON.stringify(f1hf.M.perm) === '[1,0,2]' && approx(f1hf.M.a[0], -1) && approx(f1hf.M.a[1], 1) &&
  approx(holeY1.c, 0.1, 1e-3) && approx(holeY1.w, 1.6, 1e-3) && approx(holeXr1.c, 2.0, 1e-3) && approx(holeXr1.w, 0.2, 1e-3), j({ M: f1hf.M, holeY1, holeXr1 }));
// SLIDE after the rotate: a world +0.8 along Y maps to authored s — sign/axis per the rotation (slideShiftM, not slideShift/F).
const f1slide = CM.slideShiftM([0, 0.8, 0], f1hf.M);
const r1post = await fold([wallOp('A'), cutOp('A'), rotOp(3, 'f1', 90), cmOp(4, 'f1', f1slide)]);
const holeY1b = holeExtent(r1post.positions, 1, r1post.box[4], r1post.box[5]);
console.log('  F1 SLIDE authored s=' + j(f1slide) + ' holeY-after=' + j(holeY1b));
chk('F1 SLIDE: slideShiftM([0,0.8,0], M) ⇒ authored shift lands on x (s=[0.8,0,0], the pre-image axis perm[1]=0) since a[1]=1 (no sign flip on this component); folding the resulting GEOM_CUT_MOVE moves the hole +0.8 in world Y exactly (0.1→0.9)',
  approx(f1slide[0], 0.8) && f1slide[1] === 0 && f1slide[2] === 0 && approx(holeY1b.c, 0.9, 1e-3) && approx(holeY1b.w, 1.6, 1e-3), j({ f1slide, holeY1b }));

// ── F2 ROTATE-180 ────────────────────────────────────────────────────────────────────────────────────────────
const r2pre = await fold([wallOp('A'), cutOp('A'), rotOp(3, 'f2', 180)]);
const f2hf = CM.hostFrame([wallOp('A'), cutOp('A'), rotOp(3, 'f2', 180)], cutOp('A'), r2pre.box);
console.log('  F2 pre-stretch box=' + j(r2pre.box.map(v => +v.toFixed(4))) + ' hostFrame=' + j(f2hf));
chk('F2 ROTATE-180: perm stays identity (no axis swap) but a=[-1,-1,1] and b=[4,0.2,0] — a point reflection through the box\'s own centre, so world min = authored max on this axis (authored x=0 maps to world x=4, the wall\'s hi edge)',
  f2hf.ok && JSON.stringify(f2hf.M.perm) === '[0,1,2]' && approx(f2hf.M.a[0], -1) && approx(f2hf.M.a[1], -1) && approx(f2hf.M.b[0], 4) && approx(f2hf.M.b[1], 0.2), j(f2hf.M));
// ANCHOR stretch f=1.25 on the rotated wall — the void happens to be centred on the host's own bbox centre in this
// fixture, so a 180° spin leaves its WORLD position unchanged (2.0,0.1) and the held-centre/width numbers match F0/C3b
// exactly, reached through the sign-flipped (mirrored) authored path instead of the identity one.
const f2anchorX = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A'), rotOp(3, 'f2', 180)], hostBox: r2pre.box, axis: 0, f: 1.25, translateDelta: 0 });
const f2anchorY = CM.anchorShift({ cutOp: cutOp('A'), ops: [wallOp('A'), cutOp('A'), rotOp(3, 'f2', 180)], hostBox: r2pre.box, axis: 1, f: 1, translateDelta: 0 });
const f2moveVec = [0, 0, 0]; f2moveVec[f2anchorX.authoredAxis] = f2anchorX.s;
const f2resizeVec = [1, 1, 1]; f2resizeVec[f2anchorX.authoredAxis] = f2anchorX.g;
const r2post = await fold([wallOp('A'), cutOp('A'), rotOp(3, 'f2', 180), gridOp(4, 'f2', 1.25, 0),
  cmOp(5, 'f2', f2moveVec), rzOp(6, 'f2', f2resizeVec[0], f2resizeVec[1], f2resizeVec[2])]);
const holeXr2 = holeExtent(r2post.positions, 0, r2post.box[4], r2post.box[5]);
console.log('  F2 anchorShift.x=' + j(f2anchorX) + ' anchorShift.y=' + j(f2anchorY) + ' holeX-after=' + j(holeXr2) + ' box=' + j(r2post.box.map(v => +v.toFixed(4))));
chk('F2 ANCHOR: a GRID SCALE f=1.25 stretch of the 180°-rotated wall, held via anchorShift\'s computed rider (authoredAxis, s, g placed correctly despite the sign flip) ⇒ hole centre AND width EXACTLY UNCHANGED at 2.0/1.6 (fold-verified) — the resize keeps its width under the mirrored frame too; anchorShift.y.through=true (the ±0.5 thickness overhang, unaffected by the in-plane rotation)',
  f2anchorX.ok && f2anchorX.authoredAxis === 0 && f2anchorY.through === true &&
  approx(holeXr2.c, 2.0, 1e-3) && approx(holeXr2.w, 1.6, 1e-3) && approx(r2post.box[1], 5, 1e-3), j({ f2anchorX, holeXr2 }));

// ── F3 ROTATE-270 and 90+90 COMPOSE TO 180 ──────────────────────────────────────────────────────────────────
const r3pre = await fold([wallOp('A'), cutOp('A'), rotOp(3, 'f3', 270)]);
const f3hf = CM.hostFrame([wallOp('A'), cutOp('A'), rotOp(3, 'f3', 270)], cutOp('A'), r3pre.box);
console.log('  F3 ROTATE-270 hostFrame=' + j(f3hf));
chk('F3 ROTATE-270: perm=[1,0,2] (axes swap, same as 90°) but a=[1,-1,1] (the OPPOSITE sign pattern to 90°) — folded, the hole is along Y again but on the other side',
  f3hf.ok && JSON.stringify(f3hf.M.perm) === '[1,0,2]' && approx(f3hf.M.a[0], 1) && approx(f3hf.M.a[1], -1), j(f3hf.M));
const r3double = await fold([wallOp('A'), cutOp('A'), rotOp(3, 'f3d', 90), rotOp(4, 'f3d', 90)]);
const f3dhf = CM.hostFrame([wallOp('A'), cutOp('A'), rotOp(3, 'f3d', 90), rotOp(4, 'f3d', 90)], cutOp('A'), r3double.box);
console.log('  F3 TWO×90 hostFrame=' + j(f3dhf) + ' box=' + j(r3double.box.map(v => +v.toFixed(4))));
chk('F3 COMPOSE: TWO GEOM_ROTATE drot=90 rows in the log compose to the SAME M as F2\'s single drot=180 (perm identity, a=[-1,-1,1], b matches F2\'s [4,0.2,0]) — rotation composition is associative regardless of how many discrete 90° rows produced it',
  f3dhf.ok && JSON.stringify(f3dhf.M.perm) === '[0,1,2]' && approx(f3dhf.M.a[0], -1) && approx(f3dhf.M.a[1], -1) && approx(f3dhf.M.b[0], f2hf.M.b[0], 1e-6) && approx(f3dhf.M.b[1], f2hf.M.b[1], 1e-6), j({ f3dhf: f3dhf.M, f2: f2hf.M }));

// ── F4 OBLIQUE ───────────────────────────────────────────────────────────────────────────────────────────────
const f4hf = CM.hostFrame([wallOp('A'), cutOp('A'), rotOp(3, 'f4', 30)], cutOp('A'), WALL_BOX);
console.log('  F4 hostFrame=' + j(f4hf));
chk('F4 OBLIQUE: drot=30 (not a 90°-multiple) ⇒ hostFrame REFUSES (ok:false, reason oblique-rotate-after-cut) — never an approximated frame; bonsai_itemdrag.js S6b (witness_opening_slide.js) independently confirms the slide session still refuses for this same fixture',
  f4hf.ok === false && /oblique-rotate-after-cut/.test(f4hf.reason), j(f4hf));

// ── F5 REPLAY ────────────────────────────────────────────────────────────────────────────────────────────────
const r5pre = await fold([wallOp('A'), cutOp('A'), mv, gridOp(5, 'f5', 1.25, 0), rotOp(6, 'f5', 90)]);
const f5hf = CM.hostFrame([wallOp('A'), cutOp('A'), mv, gridOp(5, 'f5', 1.25, 0), rotOp(6, 'f5', 90)], cutOp('A'), r5pre.box);
const f5check = f5hf.ok ? CM.mapBox(f5hf.M, f5hf.boxAtCut) : null;
console.log('  F5 hostBoxNow=' + j(r5pre.box.map(v => +v.toFixed(6))) + ' hostFrame=' + j(f5hf) + ' mapBox(M,boxAtCut)=' + j(f5check && f5check.map(v => +v.toFixed(6))));
chk('F5 REPLAY: TRANSLATE 0.5 then SCALE f=1.25 then ROTATE 90 ⇒ hostFrame succeeds (its OWN internal sanity check already asserts this) AND an independent re-computation here of mapBox(M,boxAtCut) matches the REAL measured hostBoxNow (from the actual worker fold) to ≤1e-6 on every one of the 6 box numbers — the backward/forward replay is self-consistent, not just internally trusted',
  f5hf.ok && f5check && f5check.every((v, i) => approx(v, r5pre.box[i], 1e-6)), j({ mapBox: f5check, hostBoxNow: r5pre.box }));

console.log('W-CUT-MOVE: ' + pass + ' PASS / ' + fail + ' FAIL');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
process.exit(fail ? 1 : 0);
