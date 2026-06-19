// bonsai_kernel_worker.js — Bonsai authoring kernel hosted in a module Web Worker.
// prompts/BONSAI_KERNEL_RESEARCH.md §2 (kernel in a worker) + Item 2 leg 1 (in-viewer wiring).
// Receives a kernel_ops-shaped op-row, FOLDS it through occt-wasm -> mesh, posts back transferable
// typed arrays. The fold is the SAME code path proven by W-KERNEL-FOLD (build/kernel/spike.html).
// occt needs WASM tail-calls => Chrome 114+/Safari 17.2+, NO Firefox (gated host-side in bonsai_kernel.js).
import { OcctKernel } from './lib/kernel/index.js';

let kernelPromise = null;
let _wasmBytes = null;   // pre-fetched bytes handed in by the host (preload) → single download, no re-fetch

// INCREMENTAL REGEN CACHE (prompts/BONSAI_KERNEL_RESEARCH.md §4#1 "the real core"). The signed op_hash is the
// perfect, free invalidation key: in an append-only hash chain op_hash = SHA(prev_hash | op), so it encodes the
// ENTIRE prefix → a committed row's folded geometry is IMMUTABLE once computed. So we cache the resulting occt
// shape (and its tessellated mesh) per op_hash across folds; a re-fold rebuilds ONLY genuinely-new ops (the
// dirty feature + nothing else). Single-lineage, content-addressed — decades-old dependency-graph regen prior
// art (Pro/E, SolidWorks); the patent-sensitive surface is cloud branch&merge, NOT this (card §6 — build freely).
const shapeCache = new Map();   // op_hash -> occt shape (persists across folds; cache owns it → never released mid-fold)
const meshCache = new Map();    // op_hash -> tessellated mesh payload (skip re-tessellation of unchanged features)
let _stats = { rebuilt: 0, hits: 0, tess: 0, tessHits: 0 };
function clearCache(kernel) { for (const s of shapeCache.values()) { try { kernel.release(s); } catch (e) { } } shapeCache.clear(); meshCache.clear(); }
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

// Edge midpoints of a solid in CANONICAL getSubShapes('edge') order — the SAME order the fold uses to
// resolve GEOM_FILLET edge indices, so an edge picked by index is stable across deterministic re-folds.
// Midpoint = bbox centre (exact for the straight edges of our box/extrude solids); len = bbox diagonal.
function edgeMidpoints(kernel, solid) {
  const edges = kernel.getSubShapes(solid, 'edge');
  const out = edges.map((e, i) => {
    const b = kernel.getBoundingBox(e, false);
    return { i, mid: [(b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2, (b.zmin + b.zmax) / 2],
             len: +Math.hypot(b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin).toFixed(4) };
  });
  edges.forEach(e => kernel.release(e));
  return out;
}

// THE FEATURE-TREE FOLD (solids map): an ordered op-log -> a set of live solids. GEOM_CUT and GEOM_FILLET
// modify their referenced parent solid IN PLACE (the child references a prior feature by id), so the op-log
// IS the feature tree and the rendered geometry is a pure fold of the chain — replaying ops[0..k] = history.
// Fold the chain into live solids, REUSING cached shapes by op_hash. solids: featureId -> {shape, hash}; the
// `hash` (op_hash that produced the current shape) keys the mesh cache. Cached shapes/inputs are NEVER released
// here — the cache owns them (released only by clearCache). Only LOCAL intermediates (void box, edge subshapes)
// are released. A cache MISS rebuilds via occt (and counts); a HIT skips occt entirely.
function buildSolids(kernel, ops) {
  const solids = new Map();
  for (const op of ops) {
    const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
    const key = op.op_hash || ('nohash:' + op.id);    // op_hash = unique per immutable prefix → the cache key
    if (op.op_type === 'GEOM_CUT') {
      const pe = solids.get(op.parent); if (!pe) throw new Error('GEOM_CUT parent ' + op.parent + ' not found');
      if (shapeCache.has(key)) { _stats.hits++; solids.set(op.parent, { shape: shapeCache.get(key), hash: key }); continue; }
      _stats.rebuilt++;
      const v = (a) => ({ x: a[0], y: a[1], z: a[2] });
      const void_ = kernel.makeBoxFromCorners(v(P.void.c1), v(P.void.c2));
      const cut = kernel.cut(pe.shape, void_);
      kernel.release(void_);                          // local intermediate (parent is cached → NOT released)
      shapeCache.set(key, cut); solids.set(op.parent, { shape: cut, hash: key });
    } else if (op.op_type === 'GEOM_FILLET') {
      const pe = solids.get(op.parent); if (!pe) throw new Error('GEOM_FILLET parent ' + op.parent + ' not found');
      if (shapeCache.has(key)) { _stats.hits++; solids.set(op.parent, { shape: shapeCache.get(key), hash: key }); continue; }
      _stats.rebuilt++;
      const all = kernel.getSubShapes(pe.shape, 'edge');           // canonical order — must match edgeMidpoints()
      const sel = (P.edges || []).map(i => all[i]).filter(s => s != null);
      const r = P.radius != null ? P.radius : 0.1;
      const result = (P.kind === 'chamfer') ? kernel.chamfer(pe.shape, sel, r) : kernel.fillet(pe.shape, sel, r);
      all.forEach(e => kernel.release(e));            // local edge subshapes (parent cached → NOT released)
      shapeCache.set(key, result); solids.set(op.parent, { shape: result, hash: key });
    } else if (op.op_type === 'GEOM_MOVE') {          // free translate of one referenced solid (W-BONSAI-MOVE PATH A)
      // A signed GEOM_MOVE references a prior feature by `parent` and TRANSLATES its solid IN PLACE, so a later
      // GEOM_CUT on the moved wall (solids.get(op.parent), above) reads the TRANSLATED shape — move-then-cut is
      // geometrically honest. Successive moves compose (each writes solids.set(op.parent) forward; the op_hash
      // encodes the whole prefix → distinct cache key per move). TOLERANT like GRID_MOVE (NOT CUT's throw): a move
      // whose parent is a HOST-folded GEOM_INSERT (not in this worker's solids map) is a silent NO-OP — the host
      // re-places inserts via library.foldInsert (PATH B), and every GEOM_MOVE rides the kernel batch regardless.
      const pe = solids.get(op.parent);
      if (pe) {
        const ckey = key + ':' + op.parent;            // op_hash = immutable prefix → content-addressed per move
        if (shapeCache.has(ckey)) { _stats.hits++; solids.set(op.parent, { shape: shapeCache.get(ckey), hash: ckey }); }
        else {
          _stats.rebuilt++;
          const out = kernel.translate(pe.shape, P.dx || 0, P.dy || 0, P.dz || 0);   // SAME primitive as GRID_MOVE TRANSLATE
          shapeCache.set(ckey, out); solids.set(op.parent, { shape: out, hash: ckey });   // parent cached → NOT released
        }
      }
    } else if (op.op_type === 'GEOM_GRID_MOVE') {     // one op recomposes N features → cache per (op_hash, featureId)
      for (const c of (P.commands || [])) {
        const pe = solids.get(c.featureId); if (!pe) continue;
        const ckey = key + ':' + c.featureId;
        if (shapeCache.has(ckey)) { _stats.hits++; solids.set(c.featureId, { shape: shapeCache.get(ckey), hash: ckey }); continue; }
        _stats.rebuilt++;
        let out;
        if (c.action === 'TRANSLATE') {
          const d = c.delta || 0;
          out = kernel.translate(pe.shape, c.axis === 'x' ? d : 0, c.axis === 'y' ? d : 0, c.axis === 'z' ? d : 0);
        } else {                                       // SCALE: non-uniform axis-stretch about the stationary (min) edge
          const f = c.newScale != null ? c.newScale : 1;
          const b = kernel.getBoundingBox(pe.shape, false);
          const a = c.axis === 'x' ? b.xmin : c.axis === 'y' ? b.ymin : b.zmin;
          const tx = a * (1 - f) + (c.translateDelta || 0);
          const M = c.axis === 'x' ? [f, 0, 0, tx, 0, 1, 0, 0, 0, 0, 1, 0]
                  : c.axis === 'y' ? [1, 0, 0, 0, 0, f, 0, tx, 0, 0, 1, 0]
                  :                  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, f, tx];
          out = kernel.generalTransform(pe.shape, M);  // gp_GTrsf supports non-uniform scale (input cached → NOT released)
        }
        shapeCache.set(ckey, out); solids.set(c.featureId, { shape: out, hash: ckey });
      }
    } else if (op.op_type === 'GEOM_ROTATE') {         // W-BONSAI-ROTATE: insert yaw folds HOST-side (PATH B via library.foldInsert).
      // TOLERANT like GEOM_MOVE: an insert parent isn't in this worker's solids map → silent NO-OP. (Solid B-rep
      // rotation about its centre = a follow-up leg; would generalTransform the shape here, mirroring GRID_MOVE SCALE.)
      void solids.get(op.parent);
    } else {                                           // LEAF feature (extrude/poly/sweep/opening)
      if (shapeCache.has(key)) { _stats.hits++; solids.set(op.id, { shape: shapeCache.get(key), hash: key }); continue; }
      _stats.rebuilt++;
      const shape = applyFeature(kernel, op);
      shapeCache.set(key, shape); solids.set(op.id, { shape, hash: key });
    }
  }
  return solids;
}
function foldChain(kernel, ops) {
  const solids = buildSolids(kernel, ops);
  const meshes = [];
  for (const [fid, ent] of solids) {
    let m = meshCache.get(ent.hash);
    if (!m) { m = meshOf(kernel, ent.shape, fid); meshCache.set(ent.hash, m); _stats.tess++; } else { _stats.tessHits++; }
    // Return CLONES — the host transfers (detaches) buffers; the cached copy must stay intact for the next fold.
    meshes.push({ featureId: fid, triangleCount: m.triangleCount,
      positions: m.positions.slice(), normals: m.normals ? m.normals.slice() : null, indices: m.indices ? m.indices.slice() : null });
  }
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
    if (e.data.clearCache) {                          // host signalled a new/cleared model → drop the regen cache
      if (kernelPromise) { const k = await getKernel(); clearCache(k); } else { shapeCache.clear(); meshCache.clear(); }
      self.postMessage({ id, ok: true, cleared: true });
      return;
    }
    const kernel = await getKernel();
    if (e.data.listEdges) {                          // EDGE-PICK: fold to the parent solid, report its edge midpoints
      const { ops: cops, parentId } = e.data.listEdges;
      const solids = buildSolids(kernel, cops);
      const pe = solids.get(parentId);
      const edges = pe ? edgeMidpoints(kernel, pe.shape) : [];   // solids are cached shapes — do NOT release
      self.postMessage({ id, ok: true, edges });
      return;
    }
    if (ops) {                                       // CHAIN fold (feature tree) -> array of meshes
      _stats = { rebuilt: 0, hits: 0, tess: 0, tessHits: 0 };
      const meshes = foldChain(kernel, ops);
      const transfer = [];
      meshes.forEach(m => { transfer.push(m.positions.buffer); if (m.normals) transfer.push(m.normals.buffer); if (m.indices) transfer.push(m.indices.buffer); });
      self.postMessage({ id, ok: true, meshes, stats: _stats }, transfer);
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
