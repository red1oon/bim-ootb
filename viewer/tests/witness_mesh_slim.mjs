// ⚠ DO NOT REMOVE — WITNESS §MESH_SLIM (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MESH_SLIM). Read the log, not the exit code.
// ISSUE: a civil import stored 251 MB of normals (42 % of geometry). §MESH_SLIM stops storing/reading them and lets the
// viewer derive them with three.js BufferGeometry.computeVertexNormals() — the SAME call A.blobToGeometry makes for every
// fleet DB. PROVES OR DISPROVES that the derived normal equals the stored one, per vertex, using the renderer's own three.js
// build (viewer/lib/three.core.min.js), not a re-implementation. The viewer's (x,y,z)->(x,z,-y) is a proper rotation
// (det +1), applied to positions AND normals alike, so angles are judged in DB space. Also times the derivation (load cost).
// VACUOUS if the DB stores no normals. Run: node viewer/tests/witness_mesh_slim.mjs <db>
import { createRequire } from 'module';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
// Node reads viewer/lib/*.js as CommonJS (no package "type") — load a byte-identical .mjs copy of the SAME build.
const _src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'three.core.min.js');
const _tmp = path.join(os.tmpdir(), 'three.core.' + process.pid + '.mjs'); fs.copyFileSync(_src, _tmp);
const { BufferGeometry, BufferAttribute } = await import(pathToFileURL(_tmp).href); fs.unlinkSync(_tmp);
const require = createRequire(import.meta.url);
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const db = new Database(process.argv[2], { readonly: true });
const rows = db.prepare(`SELECT g.geometry_hash h, g.vertices v, g.faces f, g.normals n,
  (SELECT m.discipline FROM element_instances i JOIN elements_meta m ON m.guid=i.guid WHERE i.geometry_hash=g.geometry_hash LIMIT 1) d
  FROM component_geometries g`).all();
const by = {}; let withN = 0, ms = 0, zeroStored = 0, all = { n: 0, a1: 0, a5: 0, worst: 0 };
for (const r of rows) {
  if (!r.n || r.n.length !== r.v.length) continue; withN++;
  const P = new Float32Array(r.v.buffer, r.v.byteOffset, r.v.length / 4).slice();
  const F = new Uint32Array(r.f.buffer, r.f.byteOffset, r.f.length / 4).slice();
  const N = new Float32Array(r.n.buffer, r.n.byteOffset, r.n.length / 4);
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(P, 3)); g.setIndex(new BufferAttribute(F, 1));
  const t = performance.now(); g.computeVertexNormals(); ms += performance.now() - t;
  const C = g.getAttribute('normal').array, s = by[r.d] || (by[r.d] = { n: 0, a1: 0, a5: 0, worst: 0 });
  for (let i = 0; i < C.length; i += 3) {
    const ln = Math.hypot(N[i], N[i + 1], N[i + 2]);
    if (ln < 1e-6) { zeroStored++; continue; }   // stored normal is (0,0,0): nothing to match — derived is the only real value
    const dot = (C[i] * N[i] + C[i + 1] * N[i + 1] + C[i + 2] * N[i + 2]) / ln;
    const deg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    for (const o of [s, all]) { o.n++; if (deg <= 1) o.a1++; if (deg <= 5) o.a5++; if (deg > o.worst) o.worst = deg; }
  }
}
if (!withN) { console.log('§WITNESS_MESH_SLIM VACUOUS — no stored normals in ' + process.argv[2]); process.exit(0); }
for (const [d, o] of Object.entries(by)) console.log('  disc=' + d + ' verts=' + o.n + ' within1deg=' + (100 * o.a1 / o.n).toFixed(3) + '% within5deg=' + (100 * o.a5 / o.n).toFixed(3) + '% worstDeg=' + o.worst.toFixed(1));
const p1 = 100 * all.a1 / all.n, p5 = 100 * all.a5 / all.n;
console.log('§WITNESS_MESH_SLIM geoms=' + withN + ' verts=' + all.n + ' within1deg=' + p1.toFixed(3) + '% within5deg=' + p5.toFixed(3) + '% worstDeg=' + all.worst.toFixed(1) +
  ' zeroLengthStored=' + zeroStored + ' deriveMs=' + ms.toFixed(0) + ' → ' + (p1 >= 99.9 ? 'PASS (derived = stored)' : 'FAIL (derived differs on ' + (100 - p1).toFixed(3) + '% of vertices)'));
process.exit(p1 >= 99.9 ? 0 : 1);
