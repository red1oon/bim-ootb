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
const gridOp = (id, h, f, td) => ({ id, op_hash: 'grid:' + h + ':' + id, op_type: 'GEOM_GRID_MOVE', parameters: { gridId: 'gx1', delta: 1, commands: [{ featureId: 1, action: 'SCALE', axis: 'x', newScale: f, translateDelta: td }] } });
async function fold(ops) { const r = await send({ id: ++seq, ops }); if (!r.ok) throw new Error('fold failed: ' + r.error); const m = r.meshes.find(x => x.featureId === 1); return { box: aabb(m.positions), hole: holeX(m.positions, 0, 3), stats: r.stats }; }

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

console.log('W-CUT-MOVE: ' + pass + ' PASS / ' + fail + ' FAIL');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
process.exit(fail ? 1 : 0);
