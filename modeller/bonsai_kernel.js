// bonsai_kernel.js — Bonsai authoring FACE (host side): fold a kernel_ops op-row into a THREE
// mesh placed in A.scene. prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 1 (in-viewer kernel worker).
// LAZY: the worker (and the ~22MB occt wasm) spawns only on first author() — a normal viewer
// session that never authors pays nothing. three.js BufferGeometry is built host-side from the
// raw arrays the worker returns; the worker never touches THREE (clean ESM/global separation).
(function () {
  'use strict';
  const TAG = '§BONSAI';
  const _self = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : (typeof location !== 'undefined' ? location.href : '');

  // §LOD400-STALL: yield to the browser between CHUNKS of a large fold so it actually gets a paint turn
  // (rAF ties the yield to the paint cycle; setTimeout(0) is the fallback for a non-browser host). Mirrors
  // kernel_ops.js's _yieldFrame — same pattern, separate module (no shared state needed).
  function _nextFrame() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }
  function _reportProgress(msg) {
    if (typeof window !== 'undefined' && typeof window.setStat === 'function') { try { window.setStat(msg); } catch (e) { } }
  }

  const Bonsai = {
    _worker: null, _seq: 0, _pending: new Map(), _group: null,

    // occt-wasm needs WASM tail-calls (Chrome 114+/Safari 17.2+, NO Firefox) + Worker support.
    isSupported() {
      return typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof WebAssembly.instantiate === 'function';
    },

    init() {
      if (this._worker) return this._worker;
      if (!this.isSupported()) { console.warn(TAG + ' unsupported host (needs WASM tail-calls + Worker)'); return null; }
      const url = new URL('bonsai_kernel_worker.js?v=7', _self);   // v2: GEOM_MOVE PATH A · v3: GEOM_ROTATE tolerant branch · v4: GEOM_ROTATE real occt solid spin · v5: GEOM_SCALE tolerant no-op (W-BONSAI-SCALE; solid scale deferred #3b) · v6: §CUT-ON-ARC seedBoxes (promote box-like insert to B-rep for GEOM_CUT/FILLET) · v7: Tier 1 shoulders GEOM_REVOLVE/SHELL/OFFSET/FILLET_VARIABLE/CHAMFER_DIST_ANGLE/DRAFT + listFaces
      this._worker = new Worker(url.href, { type: 'module' });
      this._worker.onmessage = (e) => {
        const d = e.data || {};
        if (d.ready) { console.log(TAG + ' worker ready'); return; }
        const p = this._pending.get(d.id); if (!p) return;
        this._pending.delete(d.id);
        if (d.ok) p.resolve(d); else p.reject(new Error(d.error));
      };
      this._worker.onerror = (e) => console.warn(TAG + ' worker error ' + ((e && e.message) || e));
      console.log(TAG + ' init worker spawned');
      return this._worker;
    },

    _fold(op) {
      const w = this.init();
      if (!w) return Promise.reject(new Error('bonsai unsupported'));
      const id = ++this._seq;
      return new Promise((resolve, reject) => {
        this._pending.set(id, { resolve, reject });
        w.postMessage({ id, op });
      });
    },

    // PRELOAD — background-fetch the heavy assets (occt wasm + any others, e.g. the iDempiere seed.db)
    // with per-asset streamed progress, and WARM the kernel worker from the fetched bytes (single download,
    // no re-fetch). Built to be called on the Morpheus red-pill pulse so the surface is hot on entry, with a
    // status shower driven by onProgress({asset, loaded, total, pct, done}). The occt asset is warm:true (the
    // bytes drive OcctKernel.init in the worker); others (the seed.db) are cache-warm fetches.
    async _fetchProgress(url, key, onProgress) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(url + ' ' + resp.status);
      const total = +resp.headers.get('Content-Length') || 0;
      const reader = resp.body.getReader();
      const chunks = []; let loaded = 0, mark = 0;
      for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        if (onProgress) onProgress({ asset: key, loaded, total, pct: total ? loaded / total : 0 });
        if (loaded - mark >= 4e6) { mark = loaded; console.log(TAG + ' load ' + key + ' ' + (loaded / 1e6).toFixed(1) + '/' + (total / 1e6).toFixed(1) + 'MB'); }
      }
      const buf = new Uint8Array(loaded); let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.length; }
      if (onProgress) onProgress({ asset: key, loaded, total: total || loaded, pct: 1, done: true });
      console.log(TAG + ' load ' + key + ' DONE ' + (loaded / 1e6).toFixed(1) + 'MB');
      return buf.buffer;
    },

    preload(opts, onProgress) {
      if (typeof opts === 'function') { onProgress = opts; opts = null; }
      if (this._preload) return this._preload;
      const occt = new URL('lib/kernel/occt-wasm.wasm', _self).href;
      const assets = (opts && opts.assets) || [{ key: 'occt-wasm', url: occt, warm: true }];
      this._preload = (async () => {
        for (const a of assets) {
          let bytes = null;
          try { bytes = await this._fetchProgress(a.url, a.key, onProgress); }
          catch (e) { console.warn(TAG + ' preload ' + a.key + ' failed ' + e); continue; }
          if (a.warm && bytes && this.isSupported()) {
            const w = this.init();
            const id = ++this._seq;
            const warmed = new Promise((res, rej) => this._pending.set(id, { resolve: res, reject: rej }));
            w.postMessage({ id, warm: true, wasm: bytes }, [bytes]);   // transfer bytes → worker inits from them
            await warmed;
            console.log(TAG + ' preload warmed worker from ' + a.key);
          }
        }
        return true;
      })();
      return this._preload;
    },

    // EDGE-PICK support: ask the worker for the edge midpoints of a parent feature's solid (in canonical
    // getSubShapes order). The host renders these as pickable markers; the picked indices ride a GEOM_FILLET op.
    queryEdges(parentId) {
      const w = this.init();
      if (!w) return Promise.reject(new Error('bonsai unsupported'));
      const ops = (window.Bonsai.oplog && window.Bonsai.oplog._geomOps) ? window.Bonsai.oplog._geomOps() : [];
      const id = ++this._seq;
      return new Promise((resolve, reject) => {
        this._pending.set(id, { resolve, reject });
        w.postMessage({ id, listEdges: { ops, parentId } });
      });
    },

    // §FACE-PICK (Tier 1 GEOM_SHELL/GEOM_DRAFT): ask the worker for the face midpoints of a parent feature's
    // solid (canonical getSubShapes('face') order). Mirrors queryEdges() exactly — the picked indices ride a
    // GEOM_SHELL (facesToRemove) or GEOM_DRAFT (the one pulled face) op.
    queryFaces(parentId) {
      const w = this.init();
      if (!w) return Promise.reject(new Error('bonsai unsupported'));
      const ops = (window.Bonsai.oplog && window.Bonsai.oplog._geomOps) ? window.Bonsai.oplog._geomOps() : [];
      const id = ++this._seq;
      return new Promise((resolve, reject) => {
        this._pending.set(id, { resolve, reject });
        w.postMessage({ id, listFaces: { ops, parentId } });
      });
    },

    // Fold a whole op-log CHAIN -> array of mesh payloads (the feature tree, evaluated in one pass).
    // seedBoxes (optional): {featureId: {c1,c2}} pre-seeds B-rep boxes for box-like inserts that are cut/fillet
    // targets (§CUT-ON-ARC) so the worker can subtract a void from a baked ARC wall.
    _foldChain(ops, seedBoxes) {
      const w = this.init();
      if (!w) return Promise.reject(new Error('bonsai unsupported'));
      const id = ++this._seq;
      return new Promise((resolve, reject) => {
        this._pending.set(id, { resolve, reject });
        w.postMessage({ id, ops, seedBoxes });
      });
    },

    // §CUT-ON-ARC (W-E2E-CUT): the exact world-AABB corners of a box-like insert, or null if the placed geometry
    // is NOT an axis-aligned box (rotated wall / non-box component) → the caller refuses the cut (non-invent: we
    // never approximate a non-box shape). Built from foldInsert's UN-MOVED placement so the worker's in-order
    // GEOM_MOVE/ROTATE branches still apply transforms to the promoted box.
    _insertCutBox(op) {
      if (!window.Bonsai.library) return null;
      let fold; try { fold = window.Bonsai.library.foldInsert(op, null, null); } catch (e) { return null; }
      const p = fold && fold.positions; if (!p || p.length < 24) return null;   // need ≥ 8 verts
      let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        if (p[i] < xmin) xmin = p[i]; if (p[i] > xmax) xmax = p[i];
        if (p[i + 1] < ymin) ymin = p[i + 1]; if (p[i + 1] > ymax) ymax = p[i + 1];
        if (p[i + 2] < zmin) zmin = p[i + 2]; if (p[i + 2] > zmax) zmax = p[i + 2];
      }
      const sx = xmax - xmin, sy = ymax - ymin, sz = zmax - zmin;
      if (!(sx > 1e-6 && sy > 1e-6 && sz > 1e-6)) return null;                  // degenerate
      const tol = 1e-4 * Math.max(sx, sy, sz);
      const near = (v, lo, hi) => Math.abs(v - lo) <= tol || Math.abs(v - hi) <= tol;
      for (let i = 0; i < p.length; i += 3) {                                   // every vert ON an AABB face plane → axis-aligned box
        if (!(near(p[i], xmin, xmax) && near(p[i + 1], ymin, ymax) && near(p[i + 2], zmin, zmax))) return null;
      }
      return { c1: [xmin, ymin, zmin], c2: [xmax, ymax, zmax] };
    },

    _buildMesh(d, opts) {
      opts = opts || {};
      const THREE = window.THREE;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
      if (d.normals) geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
      if (d.indices) geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
      if (!d.normals) geo.computeVertexNormals();
      geo.computeBoundingBox();
      // §ANCHOR (W-E2E-VOID-ANCHOR): an anchorOnly fold becomes a REAL-but-INVISIBLE mesh — a real
      // m.isMesh in the group is REQUIRED (bonsai_gridmove.js _buildBoxByFid/elementData only see real
      // meshes; a bare map entry provably does not ride) but it must never render, never pick, never
      // count. .visible=false (skipped by the renderer AND by every §V1 o.visible pick filter),
      // userData.anchor=true (the unmistakable tag for every count/audit exclusion), minimal
      // MeshBasicMaterial (no lighting cost — it never rasterizes anyway).
      if (d.anchor) {
        const amesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
        amesh.name = 'anchor:' + d.featureId;
        amesh.visible = false;
        amesh.userData.featureId = d.featureId;
        amesh.userData.anchor = true;
        return amesh;
      }
      const matOpts = { color: opts.color != null ? opts.color : 0x9fb4c8, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide };
      // §MAT-PARITY (MODELLER_RENDER_MATERIAL_PARITY.md Task 1): mirror viewer/streaming.js A._getMaterial's
      // own opacity gate exactly (`if (parts.length >= 4 && parts[3] < 1.0) { opts.transparent = true; opts.opacity = a; }`)
      // — glass/IfcWindow etc. now render see-through instead of solid, sourced from real material_rgba alpha
      // (arc_editable.js → bonsai_library.js foldInsert → here). opts.opacity absent/>=1 ⇒ unchanged opaque path.
      if (opts.opacity != null && opts.opacity < 1.0) { matOpts.transparent = true; matOpts.opacity = opts.opacity; }
      const mat = new THREE.MeshStandardMaterial(matOpts);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = opts.name || ('bonsai:' + d.featureId);
      mesh.userData.featureId = d.featureId;
      return mesh;
    },

    // Rebuild A.scene's authored group from a CHAIN of op-rows (history replay = fold ops[0..k]).
    // GEOM_INSERT (a library component = a BAKED mesh, not a B-rep) folds HOST-side via Bonsai.library —
    // it is filtered OUT of the occt worker batch (the worker has no THREE / no component db) and rebuilt
    // here. Order among independent solids doesn't affect geometry, so determinism holds.
    async foldChainToScene(ops, opts) {
      opts = opts || {};
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      const g = this.group();
      // W-BONSAI-MOVE 3-way split: GEOM_INSERT folds HOST-side (baked mesh); everything else (incl. GEOM_MOVE)
      // rides the occt worker so a move can TRANSLATE a wall's B-rep in place (PATH A). GEOM_MOVE rows are ALSO
      // summed here into a net per-parent delta — applied host-side to inserts via foldInsert (PATH B). A move
      // whose parent is an insert harmlessly reaches the worker too: PATH A no-ops (the insert isn't a worker solid).
      // §CUT-ON-ARC: a box-like insert that is the parent of a GEOM_CUT/GEOM_FILLET is PROMOTED to a worker B-rep
      // box (seedBoxes) and rendered by the worker (with the void subtracted) — NOT host-side (else the uncut baked
      // mesh would paint over the cut). Rotated/non-box inserts return null from _insertCutBox → stay host-side
      // (the cut handler refuses them up front, so no dead op reaches here).
      // Tier 1 (§GAP-TO-COMPETITIVE): GEOM_SHELL/OFFSET/FILLET_VARIABLE/CHAMFER_DIST_ANGLE/DRAFT are ALSO
      // parent-mutating ops on a worker B-rep solid (same class as GEOM_CUT/GEOM_FILLET) — an ARC-seeded
      // box-like insert must be promoted for these too, or shelling/drafting a seeded box would throw
      // "parent not found" exactly like an un-promoted cut did before §CUT-ON-ARC.
      const PARENT_MUTATING = new Set(['GEOM_CUT', 'GEOM_FILLET', 'GEOM_SHELL', 'GEOM_OFFSET', 'GEOM_FILLET_VARIABLE', 'GEOM_CHAMFER_DIST_ANGLE', 'GEOM_DRAFT']);
      const cutFilletParents = new Set();
      for (const o of ops) { if (PARENT_MUTATING.has(o.op_type)) { const P = typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters; if (P && P.parent != null) cutFilletParents.add(P.parent); } }
      const seedBoxes = {}; const promoted = new Set();
      for (const o of ops) {
        if (o.op_type !== 'GEOM_INSERT' || !cutFilletParents.has(o.id)) continue;
        const box = this._insertCutBox(o);
        if (box) { seedBoxes[o.id] = box; promoted.add(o.id); }
      }
      const hasSeed = promoted.size > 0;
      const insertOps = ops.filter(o => o.op_type === 'GEOM_INSERT' && !promoted.has(o.id));
      const kernelOps = ops.filter(o => o.op_type !== 'GEOM_INSERT');   // KEEPS GEOM_MOVE → PATH A translates moved walls
      const moveBy = new Map();                                          // targetFeatureId -> {dx,dy,dz,drot} (net, summed)
      for (const op of ops) {
        if (op.op_type !== 'GEOM_MOVE' && op.op_type !== 'GEOM_ROTATE' && op.op_type !== 'GEOM_SCALE') continue;
        const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
        const a = moveBy.get(P.parent) || { dx: 0, dy: 0, dz: 0, drot: 0, fx: 1, fy: 1, fz: 1 };
        if (op.op_type === 'GEOM_MOVE') { a.dx += P.dx || 0; a.dy += P.dy || 0; a.dz += P.dz || 0; }
        else if (op.op_type === 'GEOM_ROTATE') { a.drot += P.drot || 0; }   // net yaw (about Z), host-side to inserts (W-BONSAI-ROTATE PATH B)
        else { a.fx *= P.fx != null ? P.fx : 1; a.fy *= P.fy != null ? P.fy : 1; a.fz *= P.fz != null ? P.fz : 1; }   // GEOM_SCALE: net multiplicative scale (W-BONSAI-SCALE PATH B)
        moveBy.set(P.parent, a);
      }
      // §ROOMMOVE — Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §2.4 — Witness: W-ROOM-MOVE.
      // ONE signed GEOM_ROOM_MOVE row carries the whole resolved member list plus ONE rigid (dx,dy,dz): the spec's
      // own words, "semantically N GEOM_MOVEs, folded from one row". It accumulates into the SAME net-per-feature
      // delta map the GEOM_MOVE loop above fills, so bonsai_library.js foldInsert applies it through its EXISTING
      // `mv` path — that file needs (and gets) ZERO change. The accumulation itself lives in bonsai_roommove.js so
      // the production fold and the pure-node witnesses share exactly ONE definition of what the op means; it is
      // resolved LAZILY at call time (this codebase's own "check window.X fresh at call time" pattern —
      // cross_edges.js:52 documents why a load-time capture would freeze a null). Module absent ⇒ REFUSE to
      // half-apply: warn loudly and fold nothing, never a partial room move.
      for (const op of ops) {
        if (op.op_type !== 'GEOM_ROOM_MOVE') continue;
        const RM = (typeof window !== 'undefined' && window.Bonsai) ? window.Bonsai.roommove : null;
        if (!RM || !RM.accumulate) { console.warn(TAG + ' §ROOMMOVE bonsai_roommove.js not loaded — GEOM_ROOM_MOVE rows NOT folded (refusing to half-apply)'); break; }
        RM.accumulate(typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters, moveBy);
      }
      // §STRETCH-1: GEOM_GRID_MOVE makes inserts grid-STRETCHABLE host-side. Collect each op's per-feature commands
      // IN OP ORDER (the worker folds B-rep solids; inserts are skipped there → host-side here, NO double-apply).
      const gridBy = new Map();                                          // featureId -> [command,…] (ordered)
      for (const op of ops) {
        if (op.op_type !== 'GEOM_GRID_MOVE') continue;
        const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
        for (const cmd of (P.commands || [])) { if (cmd.featureId == null) continue; const list = gridBy.get(cmd.featureId) || []; list.push(cmd); gridBy.set(cmd.featureId, list); }
      }
      const d = (kernelOps.length || hasSeed) ? await this._foldChain(kernelOps, hasSeed ? seedBoxes : undefined) : { meshes: [] };
      const meshes = (d.meshes || []).slice();
      if (g) { while (g.children.length) g.remove(g.children[0]); }   // replay = clear then re-fold
      let totalTris = 0, anchorN = 0;   // §ANCHOR: anchors are counted SEPARATELY, never in solids/tris
      // PER-MESH colour wins over the fold-level colour: a folded insert (RouteWalker fixture) carries md.color
      // (its discipline hex from parameters.color); B-rep solids have none → fall back to the fold-level opts.color.
      meshes.forEach(md => { const m = this._buildMesh(md, { color: md.color != null ? md.color : opts.color, opacity: md.opacity }); totalTris += md.triangleCount; if (g) g.add(m); });

      // §LOD400-STALL: GEOM_INSERT folds HOST-side (bonsai.library) — CHUNKED + YIELDED above CHUNK ops so a
      // Terminal-scale open (tens of thousands of raw-bbox ARC inserts) actually PAINTS PROGRESSIVELY between
      // batches instead of computing+building everything in one synchronous tick with zero feedback. Small/
      // medium buildings (Duplex 265, SampleCastle 3,583 ARC elements) stay UNDER CHUNK → the ORIGINAL
      // single-pass path, unchanged — same op-log, same final scene, byte-identical result either way; only
      // the add-order/paint cadence differs when a fold is large enough to chunk.
      const CHUNK = 5000;
      if (window.Bonsai.library) {
        const buildOne = (op) => {
          const md = window.Bonsai.library.foldInsert(op, moveBy.get(op.id), gridBy.get(op.id));
          meshes.push(md);
          const m = this._buildMesh(md, { color: md.color != null ? md.color : opts.color, opacity: md.opacity });
          if (md.anchor) anchorN++; else totalTris += md.triangleCount;   // §ANCHOR: excluded from every count
          if (g) g.add(m);
        };
        if (insertOps.length > CHUNK) {
          for (let i = 0; i < insertOps.length; i += CHUNK) {
            const end = Math.min(i + CHUNK, insertOps.length);
            for (let k = i; k < end; k++) { try { buildOne(insertOps[k]); } catch (e) { console.warn(TAG + ' insert fold fail ' + e); } }
            _reportProgress('loading ' + end + '/' + insertOps.length + ' elements…');
            if (window.A && typeof A.requestRender === 'function') A.requestRender();   // progressive reveal — paint what landed so far
            await _nextFrame();
          }
        } else {
          for (const op of insertOps) { try { buildOne(op); } catch (e) { console.warn(TAG + ' insert fold fail ' + e); } }
        }
      }
      this._lastRegenStats = d.stats || null;   // {rebuilt, hits, tess, tessHits} — incremental-regen cache witness hook
      const ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
      const st = d.stats ? ' regen[rebuilt=' + d.stats.rebuilt + ' hits=' + d.stats.hits + ' tess=' + d.stats.tess + ' tessHits=' + d.stats.tessHits + ']' : '';
      // §ANCHOR: solids/tris count RENDERED geometry only; anchors get their own separate tally.
      const solidsN = meshes.length - anchorN;
      console.log(TAG + ' chain ops=' + ops.length + ' solids=' + solidsN + ' tris=' + totalTris + ' ms=' + Math.round(ms) + ' inScene=' + !!g + st +
        (anchorN ? ' §ANCHOR invisible-anchors=' + anchorN + ' (excluded from solids/tris)' : ''));
      if (window.A && typeof A.requestRender === 'function') A.requestRender();
      // §SEL-TINT-REFOLD (MODELLER_MASTER.md row 16 — Witness: W-E2E-SEL-TINT-REFOLD): every authoritative
      // re-fold lands HERE with its rebuilt meshes already in the group — announce it so selection paint
      // (modeller.html _paintSel) can re-apply the emissive tint to the NEW mesh objects (same featureIds).
      // Needed because bonsai_oplog.scrubTo (history slider undo/redo, x-ray restore, Connect timeline)
      // deliberately never _emit()s — the existing bonsai:oplog → _paintSel hook cannot fire on those paths.
      try { window.dispatchEvent(new CustomEvent('bonsai:refold', { detail: { solids: solidsN } })); } catch (e) { }
      return { solids: solidsN, triangleCount: totalTris, meshes };
    },

    // INCREMENTAL REGEN CACHE control: drop the worker's op_hash-keyed shape/mesh cache (a new/cleared model).
    clearKernelCache() {
      if (!this._worker) return Promise.resolve();   // no worker yet → nothing cached
      const id = ++this._seq;
      return new Promise((resolve) => { this._pending.set(id, { resolve, reject: resolve }); this._worker.postMessage({ id, clearCache: true }); });
    },

    group() {
      if (!this._group && window.A && A.scene && window.THREE) {
        this._group = new THREE.Group(); this._group.name = 'BonsaiAuthored'; A.scene.add(this._group);
      }
      return this._group;
    },

    // Author ONE op-row -> THREE.Mesh in A.scene's BonsaiAuthored group. Returns {mesh, triangleCount, bbox}.
    async author(op, opts) {
      opts = opts || {};
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      const d = await this._fold(op);
      const THREE = window.THREE;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
      if (d.normals) geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
      if (d.indices) geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
      if (!d.normals) geo.computeVertexNormals();
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const mat = new THREE.MeshStandardMaterial({ color: opts.color != null ? opts.color : 0x9fb4c8, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = opts.name || ('bonsai:' + (opts.featureId != null ? opts.featureId : op.op_type));
      mesh.userData.bonsaiOp = op;
      if (opts.featureId != null) mesh.userData.featureId = opts.featureId;   // match chain-built meshes → pick-select + cut-target work on an optimistically-appended feature
      const g = this.group();
      if (g) g.add(mesh);
      const ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
      const r = (n) => Math.round(n * 1e3) / 1e3;
      const bbox = [r(bb.min.x), r(bb.min.y), r(bb.min.z), r(bb.max.x), r(bb.max.y), r(bb.max.z)].join(',');
      console.log(TAG + ' author op=' + op.op_type + ' tris=' + d.triangleCount + ' bbox=[' + bbox + '] ms=' + Math.round(ms) + ' inScene=' + !!g);
      if (window.A && typeof A.requestRender === 'function') A.requestRender();
      return { mesh, triangleCount: d.triangleCount, bbox };
    }
  };

  window.Bonsai = Bonsai;
  console.log(TAG + ' module loaded supported=' + Bonsai.isSupported());
})();
