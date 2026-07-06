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
  if (op.op_type === 'GEOM_LOFT') {                // BRepOffsetAPI_ThruSections: solid/shell lofted through N sketched profile wires
    // Payload mirrors GEOM_EXTRUDE_POLY's `profile.points` ring EXACTLY (the real planegcs-solved-polygon
    // representation the sketch tool already emits — see bonsai_sketch.js), generalized to N stacked
    // profiles instead of one: each wire is { points: [[x,y],...], z } — the same 2D ring format, placed
    // at its own z-height. NON-INVENT: no cross-section is synthesized here — occt's loft() interpolates
    // the surface BETWEEN the wires the caller actually supplied; this branch only builds the wire handles.
    const wires = P.wires;
    if (!wires || wires.length < 2) throw new Error('GEOM_LOFT needs >=2 wire profiles');
    const wireHandles = [];
    const localEdges = [];
    for (const w of wires) {
      const pts = w.points;
      const z = w.z || 0;
      const edges = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        edges.push(kernel.makeLineEdge({ x: a[0], y: a[1], z }, { x: b[0], y: b[1], z }));
      }
      const wire = kernel.makeWire(edges);
      wireHandles.push(wire);
      localEdges.push(...edges);
    }
    const isSolid = P.isSolid !== false;   // default true (a closed loft between closed rings is a solid, not a shell)
    const ruled = !!P.ruled;               // default false (smooth B-spline through sections) — see kernel.loft() doc comment
    const solid = kernel.loft(wireHandles, isSolid, ruled);
    localEdges.forEach(e => kernel.release(e));
    wireHandles.forEach(w => kernel.release(w));
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

// ── GEOM_ARRAY (prompts/BONSAI_ARRAY_PATTERN_SPEC.md) ───────────────────────────────────────────────
// "N instances of a referenced feature, placed along a line/curve, each instance's parameters
// optionally varying by a deterministic formula." NON-INVENT: positions are COMPUTED transform math
// (no Math.random/Date.now); the formula evaluator below is a whitelisted recursive-descent parser,
// never eval()/Function() — see W-BONSAI-ARRAY witness for the hand-calculated per-instance proof.

// Whitelisted dot-path get/set into a plain op-parameters object (used to read/override the ONE
// numeric field a formula drives, e.g. 'depth' or 'profile.w'). Illegal characters are rejected
// outright — this is the ONLY way GEOM_ARRAY ever touches a parameter, no dynamic eval.
function getPath(obj, path) {
  if (!/^[a-zA-Z0-9_.]+$/.test(path || '')) throw new Error('GEOM_ARRAY paramPath: illegal characters');
  return path.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
}
function setPath(obj, path, val) {
  const parts = path.split('.'); let o = obj;
  for (let k = 0; k < parts.length - 1; k++) { o = o[parts[k]]; if (o == null) throw new Error('GEOM_ARRAY paramPath: missing segment ' + parts[k]); }
  o[parts[parts.length - 1]] = val;
}

// Deterministic, whitelisted formula evaluator: `+ - * /`, parens, unary minus, the instance index `i`,
// the count `n`, and the parent's base value at paramPath `v0`. NEVER eval()/Function() — a small
// recursive-descent parser only. Any character outside the whitelist is rejected before parsing starts.
function evalFormula(expr, vars) {
  const s = String(expr == null ? '' : expr);
  if (!/^[0-9.+\-*/()\s a-zA-Z_]*$/.test(s)) throw new Error('GEOM_ARRAY formula: illegal character in expression');
  let pos = 0;
  const peek = () => s[pos];
  const skip = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  function parseExpr() {
    skip(); let v = parseTerm();
    for (; ;) {
      skip(); const c = peek();
      if (c === '+') { pos++; v += parseTerm(); }
      else if (c === '-') { pos++; v -= parseTerm(); }
      else break;
    }
    return v;
  }
  function parseTerm() {
    skip(); let v = parseFactor();
    for (; ;) {
      skip(); const c = peek();
      if (c === '*') { pos++; v *= parseFactor(); }
      else if (c === '/') { pos++; v /= parseFactor(); }
      else break;
    }
    return v;
  }
  function parseFactor() {
    skip();
    if (peek() === '-') { pos++; return -parseFactor(); }
    if (peek() === '+') { pos++; return parseFactor(); }
    if (peek() === '(') { pos++; const v = parseExpr(); skip(); if (peek() !== ')') throw new Error('GEOM_ARRAY formula: expected )'); pos++; return v; }
    const numMatch = /^[0-9]*\.?[0-9]+/.exec(s.slice(pos));
    if (numMatch) { pos += numMatch[0].length; return parseFloat(numMatch[0]); }
    const idMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(pos));
    if (idMatch) {
      pos += idMatch[0].length;
      if (!(idMatch[0] in vars)) throw new Error('GEOM_ARRAY formula: unknown identifier ' + idMatch[0]);
      return vars[idMatch[0]];
    }
    throw new Error('GEOM_ARRAY formula: unexpected token at ' + pos);
  }
  const result = parseExpr();
  skip();
  if (pos !== s.length) throw new Error('GEOM_ARRAY formula: trailing input');
  return result;
}

// Per-instance translate DELTA from the reference instance (i=0, always zero delta — the reference
// stays exactly where the parent feature was authored). 'linear': along a (normalized) axis vector,
// `spacing` apart. 'along_curve': evenly spaced by ARC LENGTH along a polyline (>=2 points) — reuses
// plain linear interpolation per segment (the same "walk the polyline" idea GEOM_SWEEP's spine uses,
// no new curve-sampling primitive invented).
function arrayDeltas(P, count) {
  const out = [];
  if (P.mode === 'along_curve') {
    const pts = P.curve;
    if (!pts || pts.length < 2) throw new Error('GEOM_ARRAY along_curve needs >=2 curve points');
    const seglen = []; let total = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const d = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]);
      seglen.push(d); total += d;
    }
    const at = (s) => {
      let acc = 0;
      for (let k = 0; k < seglen.length; k++) {
        if (s <= acc + seglen[k] || k === seglen.length - 1) {
          const t = seglen[k] > 0 ? (s - acc) / seglen[k] : 0;
          const a = pts[k], b = pts[k + 1];
          return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
        }
        acc += seglen[k];
      }
      return pts[pts.length - 1];
    };
    const p0 = pts[0];
    for (let i = 0; i < count; i++) {
      const s = count > 1 ? (i / (count - 1)) * total : 0;
      const p = at(s);
      out.push({ dx: p[0] - p0[0], dy: p[1] - p0[1], dz: p[2] - p0[2] });
    }
  } else {   // 'linear' (default)
    const axis = P.axis || [1, 0, 0];
    const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const ux = axis[0] / al, uy = axis[1] / al, uz = axis[2] / al;
    const sp = P.spacing != null ? P.spacing : 1;
    for (let i = 0; i < count; i++) out.push({ dx: ux * sp * i, dy: uy * sp * i, dz: uz * sp * i });
  }
  return out;
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
function buildSolids(kernel, ops, seedBoxes) {
  const solids = new Map();
  // §CUT-ON-ARC (W-E2E-CUT): a seeded ARC wall is a baked GEOM_INSERT mesh, not a worker B-rep — so a GEOM_CUT/
  // GEOM_FILLET on it had no parent solid to subtract from (threw "parent not found"). The host PROMOTES a box-like
  // insert that is a cut/fillet target to a B-rep box built from its EXACT measured world-AABB corners (non-invent:
  // the box == the baked mesh vertex-for-vertex; only axis-aligned boxes are promoted, rotated/non-box refused
  // host-side). Seed those boxes BEFORE the loop so the in-order GEOM_MOVE/ROTATE/CUT/FILLET branches find them
  // (order among independent solids is geometry-irrelevant). The seed box is always cut/filleted away, so its own
  // mesh-cache key need only be deterministic.
  if (seedBoxes) {
    for (const fid in seedBoxes) {
      const b = seedBoxes[fid]; const v = (a) => ({ x: a[0], y: a[1], z: a[2] });
      const box = kernel.makeBoxFromCorners(v(b.c1), v(b.c2));
      solids.set(+fid, { shape: box, hash: 'seedbox:' + fid + ':' + b.c1.join(',') + ':' + b.c2.join(',') });
    }
  }
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
    } else if (op.op_type === 'GEOM_ARRAY') {          // N real independent solids from ONE signed op (W-BONSAI-ARRAY).
      // Unlike GEOM_CUT/FILLET/MOVE/ROTATE (which mutate the parent's SINGLE solid in place), an array REPLACES
      // the one referenced template with N clones — so the template's own map entry is deleted and N fresh
      // entries (synthetic featureIds 'arr:<op.id>:<i>') take its place. Each instance is a REAL, independent
      // B-rep solid (fresh occt handle via translate, never a shared/aliased reference — see cache note below),
      // not an instanced-render trick: this project's own instanced-by-n vs real-solids doctrine (Spatial
      // Dependency Graph work) is decided explicitly HERE because array elements are frequently cut/filleted
      // individually downstream, which an instanced mesh cannot support.
      const pe = solids.get(op.parent); if (!pe) throw new Error('GEOM_ARRAY parent ' + op.parent + ' not found');
      const parentOp = ops.find(o => o.id === op.parent);
      if (!parentOp) throw new Error('GEOM_ARRAY parent op-row ' + op.parent + ' not found in chain');
      const count = Math.max(1, P.count | 0);
      const deltas = arrayDeltas(P, count);
      const parentP = typeof parentOp.parameters === 'string' ? JSON.parse(parentOp.parameters) : parentOp.parameters;
      const v0 = P.formula ? getPath(parentP, P.paramPath) : null;
      if (P.formula && typeof v0 !== 'number') throw new Error('GEOM_ARRAY paramPath ' + P.paramPath + ' is not a numeric field');
      solids.delete(op.parent);
      for (let i = 0; i < count; i++) {
        const ikey = key + ':a' + i;              // op_hash-derived → same free incremental-regen-cache discipline
        const fid = 'arr:' + op.id + ':' + i;
        if (shapeCache.has(ikey)) { _stats.hits++; solids.set(fid, { shape: shapeCache.get(ikey), hash: ikey }); continue; }
        _stats.rebuilt++;
        let base;
        if (P.formula) {
          const val = evalFormula(P.formula, { i, n: count, v0 });
          if (typeof val !== 'number' || !isFinite(val)) throw new Error('GEOM_ARRAY formula produced a non-finite value at i=' + i);
          const modP = JSON.parse(JSON.stringify(parentP)); setPath(modP, P.paramPath, val);
          base = applyFeature(kernel, { op_type: parentOp.op_type, parameters: modP });   // fresh, independently-parameterized solid
        } else {
          base = pe.shape;                          // no per-instance variation → clone the template as-is
        }
        const d = deltas[i];
        const out = kernel.translate(base, d.dx, d.dy, d.dz);   // ALWAYS a fresh occt handle (translate never mutates input)
        if (P.formula) kernel.release(base);         // base was a one-off regen, not the cached template → free it
        shapeCache.set(ikey, out); solids.set(fid, { shape: out, hash: ikey });
      }
    } else if (op.op_type === 'GEOM_ROTATE') {         // yaw a referenced solid about its bbox-centre Z (W-BONSAI-ROTATE-SOLID).
      // Mirror of GEOM_MOVE: rotate the parent's B-rep IN PLACE so a later GEOM_CUT on the rotated wall reads the
      // SPUN shape (move-then-rotate-then-cut is honest), successive rotations COMPOSE (each writes solids forward;
      // op_hash = immutable prefix → distinct cache key), and it stays TOLERANT — an INSERT parent isn't in this
      // worker's solids map (the host folds insert yaw via PATH B/library.foldInsert) → silent NO-OP.
      const pe = solids.get(op.parent);
      if (pe) {
        const ckey = key + ':' + op.parent;
        if (shapeCache.has(ckey)) { _stats.hits++; solids.set(op.parent, { shape: shapeCache.get(ckey), hash: ckey }); }
        else {
          _stats.rebuilt++;
          const deg = (P.drot != null ? P.drot : (P.deg || 0));
          const b = kernel.getBoundingBox(pe.shape, false);
          const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2;   // spin about the shape's centre, not the origin
          const out = kernel.rotate(pe.shape, { point: { x: cx, y: cy, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, deg * Math.PI / 180);
          shapeCache.set(ckey, out); solids.set(op.parent, { shape: out, hash: ckey });   // parent cached → NOT released
        }
      }
    } else if (op.op_type === 'GEOM_SCALE') {          // non-uniform EDGE-ANCHORED scale (W-BONSAI-SCALE) — INSERTS only.
      // The gizmo only offers scale handles on INSERTS (catalog components), which fold host-side in pure JS
      // (library.foldInsert PATH B: scale base geometry edge-anchored, net factor accumulated in bonsai_kernel) —
      // deterministic + composes exactly, no occt. A B-rep SOLID scale is DEFERRED: occt-wasm generalTransform uses
      // BRepBuilderAPI_GTransform with Copy=false, so the derived shape ALIASES the shared base TShape and an
      // intervening scrub/release corrupts it → a 2nd scale (or scale-X-then-Y, both real gizmo flows) leaks the prior
      // factor onto the untouched axes (witnessed: x×2 then x×1.5 → z×2). The fix is a kernel-level Copy=true
      // GTransform / bake primitive in lib/kernel — a separate effort, not a polish leg. So GEOM_SCALE on a worker
      // solid is a TOLERANT NO-OP here until that lands (the gizmo never emits it for solids). RESUME_MODELLER_POLISH.md #3b.
    } else {                                           // LEAF feature (extrude/poly/sweep/opening)
      if (shapeCache.has(key)) { _stats.hits++; solids.set(op.id, { shape: shapeCache.get(key), hash: key }); continue; }
      _stats.rebuilt++;
      const shape = applyFeature(kernel, op);
      shapeCache.set(key, shape); solids.set(op.id, { shape, hash: key });
    }
  }
  return solids;
}
function foldChain(kernel, ops, seedBoxes) {
  const solids = buildSolids(kernel, ops, seedBoxes);
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
      const meshes = foldChain(kernel, ops, e.data.seedBoxes);
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
