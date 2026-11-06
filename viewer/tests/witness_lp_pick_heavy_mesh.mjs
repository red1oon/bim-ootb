// ⚠ DO NOT REMOVE — §LP_PICK_HEAVY_MESH witness. Scope: bim-compiler prompts/LOD400_UPGRADER.md §H. Read the log after every run.
// Proves/disproves: (C1) the load-path raycast cost guard (lp_geom_pick.js ROUND 18) is triangle-blind;
// (C2) brute-force ray cost vs the real roof geometry; (C3) a BVH returns the SAME hits (look-neutral fix).
// Env: THREE_URL, BVH_URL (file:// URLs), GEO_DIR (g0/g1 .v float32 xyz, .f uint32 tri indices, meta.json).
import fs from 'node:fs';
const THREE = await import(process.env.THREE_URL);
let bvh = null; try { bvh = await import(process.env.BVH_URL); } catch (e) { console.log('§LP_BVH_IMPORT_FAIL ' + e.message); }
const D = process.env.GEO_DIR;
const meta = JSON.parse(fs.readFileSync(D + '/meta.json'));
const BUDGET = 20000;   // lp_chain.js:116 RAYCAST_INSTANCE_BUDGET
function load(n) {
  const v = fs.readFileSync(D + '/g' + n + '.v'), f = fs.readFileSync(D + '/g' + n + '.f');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v.buffer, v.byteOffset, v.length / 4), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(f.buffer, f.byteOffset, f.length / 4), 1));
  g.computeBoundingBox(); return g;
}
const meshes = [0, 1].map(n => new THREE.Mesh(load(n), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
meshes.forEach(m => m.updateMatrixWorld(true));
const tris = meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0);
// C1 — the guard's own arithmetic (plain mesh counts 1; instance count upper bound = every element an instance)
console.log('§LP_PICK_GATE instanceSumUpperBound=' + meta.instanceUpperBound + ' budget=' + BUDGET + ' heavyPlainMeshTris=' + tris + ' placedTrisTotal=' + meta.trisPlacedTotal);
console.log('§LP_PICK_GATE_BLIND ' + ((meta.instanceUpperBound < BUDGET && tris > 1e6) ? 'PASS (guard cannot fire: instances < budget while ' + tris + ' triangles are raycast brute-force)' : 'FAIL (guard sees this model)'));
// rays: fixed-seed LCG, from outside the combined bbox toward random interior points
let s = 12345; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const box = new THREE.Box3(); meshes.forEach(m => box.union(m.geometry.boundingBox));
const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
const N = +(process.env.RAYS || 60), rays = [];
for (let i = 0; i < N; i++) {
  const tgt = new THREE.Vector3(box.min.x + R() * size.x, box.min.y + R() * size.y, box.min.z + R() * size.z);
  const dir = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
  const o = ctr.clone().addScaledVector(dir, size.length());
  rays.push({ o, d: tgt.clone().sub(o).normalize() });
}
const origRaycast = THREE.Mesh.prototype.raycast;
function run() {
  const rc = new THREE.Raycaster(), out = [];
  const t0 = performance.now();
  for (const r of rays) { rc.set(r.o, r.d); const h = rc.intersectObjects(meshes, false); out.push(h.length ? h[0].distance : null); }
  return { ms: performance.now() - t0, out };
}
const A = run();
const perRay = A.ms / N, hitN = A.out.filter(x => x != null).length;
// the real pick: candidates x hops x samples (SCORE_TOP_N=40, S 9..49; hops ~5 is a placeholder — the in-browser §LP_PICK_COST gives the real count)
const predRays = 40 * 5 * 25;
console.log('§LP_PICK_COST_BRUTE rays=' + N + ' hits=' + hitN + ' msPerRay=' + perRay.toFixed(2) + ' predictedRays(40x5x25)=' + predRays + ' predictedSec=' + (perRay * predRays / 1000).toFixed(0));
if (!bvh) { console.log('§LP_BVH_NEUTRAL INCONCLUSIVE (three-mesh-bvh not importable)'); process.exit(0); }
THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree;
THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
if (global.gc) global.gc();
const m0 = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
const tb = performance.now(); meshes.forEach(m => m.geometry.computeBoundsTree({ maxLeafTris: 8 })); const buildMs = performance.now() - tb;
if (global.gc) global.gc();
const m1 = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
const B = run();
let maxDiff = 0, hitMismatch = 0;
for (let i = 0; i < N; i++) {
  const a = A.out[i], b = B.out[i];
  if ((a == null) !== (b == null)) { hitMismatch++; continue; }
  if (a != null) maxDiff = Math.max(maxDiff, Math.abs(a - b));
}
console.log('§LP_RAYCAST_BVH built=2 tris=' + tris + ' buildMs=' + buildMs.toFixed(0) + ' heapAddMB=' + ((m1 - m0) / 1048576).toFixed(1) + ' msPerRay=' + (B.ms / N).toFixed(3) + ' speedup=' + (A.ms / B.ms).toFixed(0) + 'x');
const vac = hitN === 0;
console.log('§LP_BVH_NEUTRAL ' + (vac ? 'INCONCLUSIVE (no ray hit anything — nothing judged)' : (hitMismatch === 0 && maxDiff < 1e-4 ? 'PASS' : 'FAIL') ) + ' rays=' + N + ' hits=' + hitN + ' hitMismatch=' + hitMismatch + ' maxDistDiff=' + maxDiff.toExponential(2));
