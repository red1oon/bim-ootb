// bonsai_kernel_worker.js — Bonsai authoring kernel hosted in a module Web Worker.
// prompts/BONSAI_KERNEL_RESEARCH.md §2 (kernel in a worker) + Item 2 leg 1 (in-viewer wiring).
// Receives a kernel_ops-shaped op-row, FOLDS it through occt-wasm -> mesh, posts back transferable
// typed arrays. The fold is the SAME code path proven by W-KERNEL-FOLD (build/kernel/spike.html).
// occt needs WASM tail-calls => Chrome 114+/Safari 17.2+, NO Firefox (gated host-side in bonsai_kernel.js).
import { OcctKernel } from './lib/kernel/index.js';

let kernelPromise = null;
function getKernel() {
  // OcctKernel.init() with no args auto-locates the co-located lib/kernel/occt-wasm.wasm.
  if (!kernelPromise) kernelPromise = OcctKernel.init();
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

self.onmessage = async (e) => {
  const { id, op } = e.data || {};
  if (op == null) return;
  try {
    const kernel = await getKernel();
    const shape = applyFeature(kernel, op);
    const mesh = kernel.tessellate(shape);
    const positions = Float32Array.from(mesh.positions);
    const normals = (mesh.normals && mesh.normals.length) ? Float32Array.from(mesh.normals) : null;
    const indices = (mesh.indices && mesh.indices.length) ? Uint32Array.from(mesh.indices) : null;
    kernel.release(shape);
    const transfer = [positions.buffer];
    if (normals) transfer.push(normals.buffer);
    if (indices) transfer.push(indices.buffer);
    self.postMessage({ id, ok: true, triangleCount: mesh.triangleCount, positions, normals, indices }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

self.postMessage({ ready: true });
