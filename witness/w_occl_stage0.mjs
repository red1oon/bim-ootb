// ⚠ DO NOT REMOVE — W-OCCL-STAGE0 (FLY_TOUR_DLOD_SCALE.md §15 POC-B Stage 0, REQUIRED gate).
// Issue this test proves/disproves: is the raycast line-of-sight occlusion classifier
// (witness/occl_classify.js — the EXACT function Stage 1 will run on real LTU data)
// mathematically correct, verified against a synthetic scene whose clear/occluded ground truth
// is known BY CONSTRUCTION (hand-placed AABBs + an independent segment-vs-AABB slab check that
// shares no code with three.js raycasting)? mismatch MUST be 0 or Stage 1 does not proceed.
// Report-only measurement tool. Read the log (witness/w_occl_stage0.log) after every run.
//
// Scene (all axis-aligned, hand-placed — ground truth derivable by hand):
//   WALL : box 4 x 3 x 0.2 centred (0, 1.5, -5)  → spans x[-2,2] y[0,3] z[-5.1,-4.9]
//   TGT_A: box 1^3 centred (0,   1.5, -10)  (dead behind the wall)
//   TGT_B: box 1^3 centred (6,   1.5, -10)  (clear from straight ahead; wall-blocked from far left)
//   TGT_C: box 1^3 centred (4.2, 1.5, -10)  (EDGE CASE: near the wall's +x edge — from x=0 its
//          center-ray crosses z=-5 at x≈2.1, just OUTSIDE the wall (half-width 2), while the left
//          part of its box IS behind the wall → classifies CLEAR by the documented center-only
//          boundary rule; from x=-3 the crossing is x=0.6 → OCCLUDED)
// Camera sweep: to-and-fro along z=0, y=1.5, x = SWEEP then reversed (same poses, both
// directions — verdicts must be identical pose-for-pose).
//
// Hand-derived literal expectations (the §OCCL0_HANDCHECK table; t=0.5 at the wall plane, so the
// center-ray from camX to target tX crosses z=-5 at x = (camX+tX)/2):
//   TGT_A @ x=0  → (0+0)/2   = 0.0 inside [-2,2] → OCCLUDED
//   TGT_A @ x=8  → (8+0)/2   = 4.0 outside      → CLEAR
//   TGT_B @ x=6  → (6+6)/2   = 6.0 outside      → CLEAR (straight shot; also proves self-first)
//   TGT_B @ x=-8 → (-8+6)/2  = -1.0 inside      → OCCLUDED
//   TGT_C @ x=0  → (0+4.2)/2 = 2.1 outside      → CLEAR   (boundary rule: center wins)
//   TGT_C @ x=-3 → (-3+4.2)/2= 0.6 inside       → OCCLUDED
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const classify = createRequire(import.meta.url)('./occl_classify.js');

// Same monkey-patch shape as viewer/loader.js §6.5 (BVH on plain meshes)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const LOG = [];
const sink = t => { LOG.push(t); console.log(t); };

// ── Scene ──────────────────────────────────────────────────────────────────
function el(guid, sx, sy, sz, cx, cy, cz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.computeBoundsTree();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.position.set(cx, cy, cz);
  m.updateMatrixWorld(true);
  m.userData.guid = guid;
  return { guid, mesh: m, center: { x: cx, y: cy, z: cz },
    aabb: { min: [cx - sx / 2, cy - sy / 2, cz - sz / 2], max: [cx + sx / 2, cy + sy / 2, cz + sz / 2] } };
}
const WALL = el('WALL', 4, 3, 0.2, 0, 1.5, -5);
const TGT_A = el('TGT_A', 1, 1, 1, 0, 1.5, -10);
const TGT_B = el('TGT_B', 1, 1, 1, 6, 1.5, -10);
const TGT_C = el('TGT_C', 1, 1, 1, 4.2, 1.5, -10);
const ELEMENTS = [WALL, TGT_A, TGT_B, TGT_C];
const TARGETS = [TGT_A, TGT_B, TGT_C];
const occluders = ELEMENTS.map(e => e.mesh);

// ── Independent expected-verdict oracle: segment-vs-AABB slab test (pure interval arithmetic,
//    ZERO shared code with the classifier / three.js raycasting) ────────────────────────────
function segHitsBox(p0, p1, box) {
  let t0 = 0, t1 = 1 - 1e-9; // blocker must sit strictly before the center (t<1)
  for (let i = 0; i < 3; i++) {
    const a = [p0.x, p0.y, p0.z][i], b = [p1.x, p1.y, p1.z][i];
    const d = b - a;
    if (Math.abs(d) < 1e-12) {
      if (a < box.min[i] || a > box.max[i]) return false;
      continue;
    }
    let tn = (box.min[i] - a) / d, tf = (box.max[i] - a) / d;
    if (tn > tf) { const tmp = tn; tn = tf; tf = tmp; }
    t0 = Math.max(t0, tn); t1 = Math.min(t1, tf);
    if (t0 > t1) return false;
  }
  return true;
}
function expectedVerdict(camPos, target) {
  for (const e of ELEMENTS) {
    if (e.guid === target.guid) continue; // self never occludes (same rule as classifier)
    if (segHitsBox(camPos, target.center, e.aabb)) return 'occluded';
  }
  return 'clear';
}

// ── Sweep ──────────────────────────────────────────────────────────────────
const SWEEP = [-8, -6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6, 8];
const POSES = SWEEP.concat(SWEEP.slice(0, -1).reverse()); // to-and-fro, 21 poses
const raycaster = new THREE.Raycaster();
const resolveGuid = h => (h.object.userData && h.object.userData.guid) || null;

let mismatch = 0, checks = 0, selfFirstSeen = 0;
for (let pi = 0; pi < POSES.length; pi++) {
  const camPos = { x: POSES[pi], y: 1.5, z: 0 };
  const parts = [];
  for (const t of TARGETS) {
    const exp = expectedVerdict(camPos, t);
    const got = classify(raycaster, occluders, camPos, t.guid, t.center, resolveGuid, 1e-4);
    checks++;
    if (got.via === 'self-first') selfFirstSeen++;
    const ok = got.verdict === exp;
    if (!ok) mismatch++;
    parts.push(t.guid + ' exp=' + exp + ' got=' + got.verdict + ' via=' + got.via +
      (got.blocker ? ' blocker=' + got.blocker + '@' + got.blockerDist.toFixed(3) : '') +
      ' d=' + got.targetDist.toFixed(3) + (ok ? '' : ' ***MISMATCH***'));
  }
  sink('§OCCL0_POSE i=' + pi + ' camX=' + POSES[pi].toFixed(1) + ' | ' + parts.join(' | '));
}

// ── Hand-derived literal table (independent of BOTH the classifier and the slab oracle) ──
const HAND = [
  ['TGT_A', 0, 'occluded'], ['TGT_A', 8, 'clear'],
  ['TGT_B', 6, 'clear'], ['TGT_B', -8, 'occluded'],
  ['TGT_C', 0, 'clear'], ['TGT_C', -3, 'occluded'],
];
let handMismatch = 0;
for (const [guid, camX, exp] of HAND) {
  const t = TARGETS.find(x => x.guid === guid);
  const got = classify(raycaster, occluders, { x: camX, y: 1.5, z: 0 }, t.guid, t.center, resolveGuid, 1e-4);
  const ok = got.verdict === exp;
  if (!ok) handMismatch++;
  sink('§OCCL0_HANDCHECK ' + guid + ' camX=' + camX + ' exp=' + exp + ' got=' + got.verdict +
    ' via=' + got.via + (ok ? ' OK' : ' ***MISMATCH***'));
}

sink('§OCCL0_RESULT poses=' + POSES.length + ' targets=' + TARGETS.length + ' checks=' + checks +
  ' mismatch=' + mismatch + ' handChecks=' + HAND.length + ' handMismatch=' + handMismatch +
  ' selfFirstSeen=' + selfFirstSeen +
  ' verdict=' + ((mismatch === 0 && handMismatch === 0 && selfFirstSeen > 0) ? 'PASS' : 'FAIL'));
fs.writeFileSync(path.join(__dirname, 'w_occl_stage0.log'), LOG.join('\n') + '\n');
process.exit((mismatch === 0 && handMismatch === 0 && selfFirstSeen > 0) ? 0 : 1);
