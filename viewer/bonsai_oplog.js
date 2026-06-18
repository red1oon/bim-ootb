// bonsai_oplog.js — Bonsai feature tree = the SIGNED kernel_ops op-log; geometry is a FOLD over it.
// prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 3b (ride the signed chain in-viewer). This closes the
// doctrine loop proven headless by W-KERNEL-SIGNED: every authored feature commits as a signed op-group
// through the SHIPPED engine (window.KernelOps.commitGroup → hash chain + edge signature), the chain
// verifies (verifyChain), and the rendered solids are a pure deterministic fold of the verified log.
// ONE signed op-log now backs BOTH ERP records and BIM geometry — the same git-for-data substrate.
(function () {
  'use strict';
  const TAG = '§OPLOG';
  const _base = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : location.href;
  const GEOM = "op_type LIKE 'GEOM%'";
  const SECRET = 'bonsai-modeller-demo-signer';   // W-SIGN demo edge key (binds sig to op_hash)

  async function sha256hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const OpLog = {
    db: null, _n: 0, _cursor: 0, _signed: false,

    async _ensureDb() {
      if (this.db) return this.db;
      const SQL = await window.initSqlJs({ locateFile: f => new URL('lib/' + f, _base).href });
      this.db = new SQL.Database();
      window.KernelOps.ensureTable(this.db);
      // W-SIGN: install an edge signer so every committed op carries a verifiable signature over its op_hash.
      window.KernelOps.setSigner({
        sign: async (h) => sha256hex(SECRET + '|' + h),
        verify: async (h, s) => s === await sha256hex(SECRET + '|' + h)
      });
      this._signed = true;
      console.log(TAG + ' signed DB ready (kernel_ops chain + edge signer)');
      return this.db;
    },

    _emit() { try { window.dispatchEvent(new CustomEvent('bonsai:oplog')); } catch (e) { } },
    clear() { if (this.db) { try { this.db.close(); } catch (e) { } } this.db = null; this._n = 0; this._cursor = 0; this._emit(); },

    // Read the live GEOM ops out of the signed log, mapped to fold-op shape (parent rides in parameters).
    _geomOps() {
      const r = this.db.exec("SELECT id, op_type, parameters FROM kernel_ops WHERE undone=0 AND " + GEOM + " ORDER BY id");
      if (!r.length) return [];
      return r[0].values.map(v => { const p = JSON.parse(v[2]); return { id: v[0], op_type: v[1], parameters: p, parent: p.parent }; });
    },
    get length() { return this.db ? this._geomOps().length : 0; },
    get cursor() { return this._cursor; },

    async _foldUpto(upto) {
      const ops = this._geomOps();
      const n = upto == null ? ops.length : Math.max(0, Math.min(upto, ops.length));
      this._cursor = n;
      return window.Bonsai.foldChainToScene(ops.slice(0, n));
    },

    // Commit a feature as a SIGNED op-group into the kernel_ops chain, verify, then fold the log to scene.
    async commit(op, opts) {
      const db = await this._ensureDb();
      const baseTs = 1700000000000 + this._n * 1000;          // deterministic ts (no Date.now → replay-stable)
      const gid = 'geom-grp-' + (++this._n);
      const res = await window.KernelOps.commitGroup(db, [{ op_type: op.op_type, params: op.parameters }], { gid, baseTs });
      if (!res.committed) throw new Error('commitGroup rejected: ' + res.reason);
      const rowId = res.ids[res.ids.length - 1];
      const v = await window.KernelOps.verifyChain(db);
      const signed = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE sig IS NOT NULL")[0].values[0][0];
      this._lastTip = v.tip;
      // OPTIMISTIC APPEND (responsiveness): a LEAF feature (extrude/sweep/poly — not a GEOM_CUT, which mutates
      // a parent in place) renders by authoring ONLY the new op and appending its mesh — O(1) — instead of
      // clearing the group and re-folding EVERY feature through occt (O(N), the felt lag). The fold is
      // deterministic so the optimistic mesh == the eventual chain-fold mesh (no flicker); any later scrub/cut
      // reconciles to the authoritative foldChainToScene. Full incremental regen = the op_hash-cache card.
      let r;
      // LEAF ops (extrude/sweep) build a fresh solid → O(1) optimistic append. Everything else (GEOM_CUT,
      // GEOM_FILLET, GEOM_GRID_MOVE) MUTATES prior solids in the fold → must take the authoritative re-fold.
      const LEAF = op.op_type === 'GEOM_EXTRUDE' || op.op_type === 'GEOM_EXTRUDE_POLY' || op.op_type === 'GEOM_SWEEP';
      if (!LEAF) {
        r = await this._foldUpto();                              // mutates a referenced solid → authoritative re-fold
      } else {
        const ad = await window.Bonsai.author({ id: rowId, op_type: op.op_type, parameters: op.parameters }, { color: opts && opts.color, featureId: rowId });
        this._cursor = this.length;                              // history cursor advances to the new tip
        r = { solids: this._cursor, triangleCount: ad.triangleCount, appended: true };
      }
      this._emit();
      console.log(TAG + ' commit rowId=' + rowId + ' op=' + op.op_type +
        (op.parameters && op.parameters.parent != null ? ' parent=' + op.parameters.parent : '') +
        ' verify=' + v.ok + ' tip=' + (v.tip || '').slice(0, 12) + ' signed=' + signed + ' tris=' + r.triangleCount);
      return { id: rowId, verify: v.ok, tip: v.tip, signed, ...r };
    },

    // History scrubber: fold the first `upto` GEOM rows of the verified log. Deterministic prefix replay.
    async scrubTo(upto) {
      const r = await this._foldUpto(upto);
      console.log(TAG + ' scrub upto=' + this._cursor + '/' + this.length + ' solids=' + r.solids + ' tris=' + r.triangleCount);
      return r;
    },

    async verify() { return window.KernelOps.verifyChain(this.db); },

    // Tamper test (W-SIGN in-viewer): mutate a committed parameter behind the chain's back → verify must fail.
    async tamperFirstGeom() {
      const r = this.db.exec("SELECT id FROM kernel_ops WHERE " + GEOM + " ORDER BY id LIMIT 1");
      if (!r.length) return { ok: true };
      const id = r[0].values[0][0];
      this.db.run("UPDATE kernel_ops SET parameters = ? WHERE id = ?", [JSON.stringify({ tampered: true }), id]);
      return window.KernelOps.verifyChain(this.db);
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.oplog = OpLog;
  console.log(TAG + ' module loaded (signed kernel_ops chain)');
})();
