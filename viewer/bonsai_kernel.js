// bonsai_kernel.js — Bonsai authoring FACE (host side): fold a kernel_ops op-row into a THREE
// mesh placed in A.scene. prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 1 (in-viewer kernel worker).
// LAZY: the worker (and the ~22MB occt wasm) spawns only on first author() — a normal viewer
// session that never authors pays nothing. three.js BufferGeometry is built host-side from the
// raw arrays the worker returns; the worker never touches THREE (clean ESM/global separation).
(function () {
  'use strict';
  const TAG = '§BONSAI';
  const _self = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : (typeof location !== 'undefined' ? location.href : '');

  const Bonsai = {
    _worker: null, _seq: 0, _pending: new Map(), _group: null,

    // occt-wasm needs WASM tail-calls (Chrome 114+/Safari 17.2+, NO Firefox) + Worker support.
    isSupported() {
      return typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof WebAssembly.instantiate === 'function';
    },

    init() {
      if (this._worker) return this._worker;
      if (!this.isSupported()) { console.warn(TAG + ' unsupported host (needs WASM tail-calls + Worker)'); return null; }
      const url = new URL('bonsai_kernel_worker.js?v=4', _self);   // v2: GEOM_MOVE PATH A · v3: GEOM_ROTATE tolerant branch · v4: GEOM_ROTATE real occt solid spin (W-BONSAI-ROTATE-SOLID)
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

    // Fold a whole op-log CHAIN -> array of mesh payloads (the feature tree, evaluated in one pass).
    _foldChain(ops) {
      const w = this.init();
      if (!w) return Promise.reject(new Error('bonsai unsupported'));
      const id = ++this._seq;
      return new Promise((resolve, reject) => {
        this._pending.set(id, { resolve, reject });
        w.postMessage({ id, ops });
      });
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
      const mat = new THREE.MeshStandardMaterial({ color: opts.color != null ? opts.color : 0x9fb4c8, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide });
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
      const insertOps = ops.filter(o => o.op_type === 'GEOM_INSERT');
      const kernelOps = ops.filter(o => o.op_type !== 'GEOM_INSERT');   // KEEPS GEOM_MOVE → PATH A translates moved walls
      const moveBy = new Map();                                          // targetFeatureId -> {dx,dy,dz,drot} (net, summed)
      for (const op of ops) {
        if (op.op_type !== 'GEOM_MOVE' && op.op_type !== 'GEOM_ROTATE') continue;
        const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
        const a = moveBy.get(P.parent) || { dx: 0, dy: 0, dz: 0, drot: 0 };
        if (op.op_type === 'GEOM_MOVE') { a.dx += P.dx || 0; a.dy += P.dy || 0; a.dz += P.dz || 0; }
        else { a.drot += P.drot || 0; }                                  // GEOM_ROTATE: net yaw (about Z), applied host-side to inserts (W-BONSAI-ROTATE PATH B)
        moveBy.set(P.parent, a);
      }
      const d = kernelOps.length ? await this._foldChain(kernelOps) : { meshes: [] };
      const meshes = (d.meshes || []).slice();
      if (window.Bonsai.library) {
        for (const op of insertOps) { try { meshes.push(window.Bonsai.library.foldInsert(op, moveBy.get(op.id))); } catch (e) { console.warn(TAG + ' insert fold fail ' + e); } }
      }
      if (g) { while (g.children.length) g.remove(g.children[0]); }   // replay = clear then re-fold
      let totalTris = 0;
      meshes.forEach(md => { const m = this._buildMesh(md, { color: opts.color }); totalTris += md.triangleCount; if (g) g.add(m); });
      this._lastRegenStats = d.stats || null;   // {rebuilt, hits, tess, tessHits} — incremental-regen cache witness hook
      const ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
      const st = d.stats ? ' regen[rebuilt=' + d.stats.rebuilt + ' hits=' + d.stats.hits + ' tess=' + d.stats.tess + ' tessHits=' + d.stats.tessHits + ']' : '';
      console.log(TAG + ' chain ops=' + ops.length + ' solids=' + meshes.length + ' tris=' + totalTris + ' ms=' + Math.round(ms) + ' inScene=' + !!g + st);
      if (window.A && typeof A.requestRender === 'function') A.requestRender();
      return { solids: meshes.length, triangleCount: totalTris, meshes };
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
