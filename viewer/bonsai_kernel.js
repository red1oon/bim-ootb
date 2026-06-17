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
      const url = new URL('bonsai_kernel_worker.js?v=1', _self);
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
      mesh.name = opts.name || ('bonsai:' + op.op_type);
      mesh.userData.bonsaiOp = op;
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
