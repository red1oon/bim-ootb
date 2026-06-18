// bonsai_kernel_worker.js — Bonsai authoring kernel hosted in a module Web Worker.
// prompts/BONSAI_KERNEL_RESEARCH.md §2 (kernel in a worker) + Item 2 leg 1 (in-viewer wiring).
// Receives a kernel_ops-shaped op-row, FOLDS it through occt-wasm -> mesh, posts back transferable
// typed arrays. The fold is the SAME code path proven by W-KERNEL-FOLD (build/kernel/spike.html).
// occt needs WASM tail-calls => Chrome 114+/Safari 17.2+, NO Firefox (gated host-side in bonsai_kernel.js).
import { OcctKernel } from './lib/kernel/index.js';

let kernelPromise = null;
let _wasmBytes = null;   // pre-fetched bytes handed in by the host (preload) → single download, no re-fetch
function getKernel() {
  // With host-supplied bytes, init from them; else OcctKernel.init() auto-locates the co-located wasm.
  if (!kernelPromise) kernelPromise = OcctKernel.init(_wasmBytes ? { wasm: _wasmBytes } : undefined);
  return kernelPromise;
}

// THE FOLD — pure (op-row) -> shape. Byte-identical to build/kernel/spike.html applyFeature.
function applyFeature(kernel, op) {
  const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
  if (op.op_type === 'GEOM_EXTRUDE') {            // IfcExtrudedAreaSolid: profile swept by direction
    const rect = kernel.makeRectangle(P.profile.w, P.profile.h);
    const solid = kernel.extrude(rect, P.dir[0], P.dir[1], P.dir[2]);
    kernel.release(rect);
    return solid;
  }
  if (op.op_type === 'GEOM_EXTRUDE_POLY') {       // sketch profile (planegcs-solved polygon) swept by depth
    const pts = P.profile.points;                 // [[x,y],...] ring (auto-closed); same path as W-SKETCH-SOLVE
    const v = (x, y) => ({ x, y, z: 0 });
    const edges = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      edges.push(kernel.makeLineEdge(v(a[0], a[1]), v(b[0], b[1])));
    }
    const wire = kernel.makeWire(edges);
    const face = kernel.makeFace(wire);
    const solid = kernel.extrude(face, 0, 0, P.depth);
    edges.forEach(e => kernel.release(e)); kernel.release(wire); kernel.release(face);
    return solid;
  }
  if (op.op_type === 'GEOM_SWEEP') {              // BRepOffsetAPI_MakePipe: rectangle profile swept along a polyline spine (MEP run / route)
    const w = P.profile.w, h = P.profile.h;
    const v = (x, y, z) => ({ x, y, z });
    const path = P.path;                          // [[x,y,z],...] ≥2 points
    // Place the profile PERPENDICULAR to the spine's initial tangent, CENTRED on path[0], so the sweep is
    // well-conditioned for ANY route direction (a horizontal ground route as well as the demo's +Z riser).
    // Frame: T = start tangent; pick up=+Y unless T is ~parallel to +Y (then +Z); U,V span the profile plane.
    // For T=+Z this yields U=+X,V=+Y → byte-identical to the original XY profile centred at the origin.
    const S = path[0];
    let tx = path[1][0] - S[0], ty = path[1][1] - S[1], tz = path[1][2] - S[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const up = Math.abs(ty) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    let ux = up[1] * tz - up[2] * ty, uy = up[2] * tx - up[0] * tz, uz = up[0] * ty - up[1] * tx;   // U = up × T
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;                   // V = T × U
    const corner = (su, sv) => v(S[0] + su * (w / 2) * ux + sv * (h / 2) * vx,
                                 S[1] + su * (w / 2) * uy + sv * (h / 2) * vy,
                                 S[2] + su * (w / 2) * uz + sv * (h / 2) * vz);
    const cpts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const pedges = [];
    for (let i = 0; i < cpts.length; i++) {
      pedges.push(kernel.makeLineEdge(cpts[i], cpts[(i + 1) % cpts.length]));
    }
    const pwire = kernel.makeWire(pedges);
    const face = kernel.makeFace(pwire);
    const sedges = [];
    for (let i = 0; i < path.length - 1; i++) {
      sedges.push(kernel.makeLineEdge(v(path[i][0], path[i][1], path[i][2]), v(path[i + 1][0], path[i + 1][1], path[i + 1][2])));
    }
    const spine = kernel.makeWire(sedges);
    const solid = kernel.pipe(face, spine);
    pedges.forEach(e => kernel.release(e)); kernel.release(pwire); kernel.release(face);
    sedges.forEach(e => kernel.release(e)); kernel.release(spine);
    return solid;
  }
  if (op.op_type === 'GEOM_OPENING') {            // IfcRelVoidsElement: base solid CUT by a void box
    const baseRect = kernel.makeRectangle(P.profile.w, P.profile.h);
    const wall = kernel.extrude(baseRect, P.dir[0], P.dir[1], P.dir[2]); kernel.release(baseRect);
    const v = (a) => ({ x: a[0], y: a[1], z: a[2] });   // kernel Vec3 = {x,y,z}, NOT array
    const void_ = kernel.makeBoxFromCorners(v(P.void.c1), v(P.void.c2));
    const cut = kernel.cut(wall, void_);
    kernel.release(wall); kernel.release(void_);
    return cut;
  }
  throw new Error('unknown op_type ' + op.op_type);
}

function meshOf(kernel, shape, featureId) {
  const m = kernel.tessellate(shape);
  const positions = Float32Array.from(m.positions);
  const normals = (m.normals && m.normals.length) ? Float32Array.from(m.normals) : null;
  const indices = (m.indices && m.indices.length) ? Uint32Array.from(m.indices) : null;
  return { featureId, triangleCount: m.triangleCount, positions, normals, indices };
}

// THE FEATURE-TREE FOLD: an ordered op-log -> a set of live solids. GEOM_CUT modifies its parent
// solid IN PLACE (the child references a prior feature by id), so the op-log IS the feature tree and
// the rendered geometry is a pure fold of the chain — replaying ops[0..k] is deterministic history.
function foldChain(kernel, ops) {
  const solids = new Map();   // featureId -> shape
  for (const op of ops) {
    if (op.op_type === 'GEOM_CUT') {                 // IfcRelVoidsElement: cut the referenced parent
      const parent = solids.get(op.parent);
      if (!parent) throw new Error('GEOM_CUT parent ' + op.parent + ' not found');
      const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
      const v = (a) => ({ x: a[0], y: a[1], z: a[2] });
      const void_ = kernel.makeBoxFromCorners(v(P.void.c1), v(P.void.c2));
      const cut = kernel.cut(parent, void_);
      kernel.release(void_); kernel.release(parent);
      solids.set(op.parent, cut);                    // parent geometry replaced by the cut result
    } else {
      solids.set(op.id, applyFeature(kernel, op));
    }
  }
  const meshes = [];
  for (const [fid, shape] of solids) { meshes.push(meshOf(kernel, shape, fid)); kernel.release(shape); }
  return meshes;
}

self.onmessage = async (e) => {
  const { id, op, ops, warm, wasm } = e.data || {};
  try {
    if (warm) {                                    // preload: warm the kernel (optionally from host bytes)
      if (wasm) _wasmBytes = wasm;
      await getKernel();
      self.postMessage({ id, ok: true, warmed: true });
      return;
    }
    const kernel = await getKernel();
    if (ops) {                                       // CHAIN fold (feature tree) -> array of meshes
      const meshes = foldChain(kernel, ops);
      const transfer = [];
      meshes.forEach(m => { transfer.push(m.positions.buffer); if (m.normals) transfer.push(m.normals.buffer); if (m.indices) transfer.push(m.indices.buffer); });
      self.postMessage({ id, ok: true, meshes }, transfer);
      return;
    }
    if (op == null) return;
    const shape = applyFeature(kernel, op);          // single-op path (leg 1/2 back-compat)
    const m = meshOf(kernel, shape, op.id);
    kernel.release(shape);
    const transfer = [m.positions.buffer];
    if (m.normals) transfer.push(m.normals.buffer);
    if (m.indices) transfer.push(m.indices.buffer);
    self.postMessage({ id, ok: true, triangleCount: m.triangleCount, positions: m.positions, normals: m.normals, indices: m.indices }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

self.postMessage({ ready: true });
