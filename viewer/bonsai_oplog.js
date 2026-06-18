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
      // PERSISTENCE: restore the saved signed op-log from localStorage so work survives a reload.
      const saved = this._loadBytes();
      if (saved) { try { this.db = new SQL.Database(saved); console.log(TAG + ' restored saved model bytes=' + saved.length); } catch (e) { console.warn(TAG + ' restore failed ' + e); this.db = new SQL.Database(); } }
      else this.db = new SQL.Database();
      window.KernelOps.ensureTable(this.db);
      // W-SIGN: install an edge signer so every committed op carries a verifiable signature over its op_hash.
      window.KernelOps.setSigner({
        sign: async (h) => sha256hex(SECRET + '|' + h),
        verify: async (h, s) => s === await sha256hex(SECRET + '|' + h)
      });
      this._signed = true;
      // restore the group counter so new commits mint fresh gids (max existing group ordinal).
      try { const r = this.db.exec("SELECT gid FROM kernel_ops WHERE gid LIKE 'geom-grp-%'"); if (r.length) this._n = r[0].values.reduce((m, v) => Math.max(m, parseInt(String(v[0]).replace('geom-grp-', '')) || 0), 0); } catch (e) { }
      console.log(TAG + ' signed DB ready (kernel_ops chain + edge signer) groups=' + this._n);
      return this.db;
    },

    // ---- PERSISTENCE: autosave the whole signed op-log to localStorage on every change; restore on boot.
    // A modelling session's kernel_ops db is small (KB–tens of KB) → well within the localStorage budget.
    _KEY: 'bonsai_model_v1',
    _b64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); },
    _unb64(b64) { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; },
    _loadBytes() { try { const s = localStorage.getItem(this._KEY); return s ? this._unb64(s) : null; } catch (e) { return null; } },
    _save() { try { if (this.db) localStorage.setItem(this._KEY, this._b64(this.db.export())); } catch (e) { console.warn(TAG + ' save failed ' + e); } },

    // Boot-time restore: ensure the db (loads saved bytes), then fold it to the scene if non-empty.
    async restore() {
      await this._ensureDb();
      if (this.length) { await this._foldUpto(); this._emit(); }
      console.log(TAG + ' restore active=' + this.length);
      return this.length;
    },

    _emit() { try { window.dispatchEvent(new CustomEvent('bonsai:oplog')); } catch (e) { } this._save(); },
    clear() { if (this.db) { try { this.db.close(); } catch (e) { } } this.db = null; this._n = 0; this._cursor = 0; try { localStorage.removeItem(this._KEY); } catch (e) { } if (window.Bonsai && window.Bonsai.clearKernelCache) window.Bonsai.clearKernelCache(); this._emit(); },

    // Read the live GEOM ops out of the signed log, mapped to fold-op shape (parent rides in parameters).
    _geomOps() {
      const r = this.db.exec("SELECT id, op_type, parameters, op_hash FROM kernel_ops WHERE undone=0 AND " + GEOM + " ORDER BY id");
      if (!r.length) return [];
      return r[0].values.map(v => { const p = JSON.parse(v[2]); return { id: v[0], op_type: v[1], parameters: p, parent: p.parent, op_hash: v[3] }; });
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

    // ---- EDIT (operability): soft-delete / undo / redo by toggling the kernel_ops `undone` flag. `undone`
    // is NOT part of the signed payload (verifyChain never reads it), so the append-only chain stays valid and
    // every "edit" is reversible — features are hidden/shown, never rewritten. Invariant kept: never leave an
    // ACTIVE child (GEOM_CUT/FILLET/…) whose referenced parent is undone (that would break the fold).
    _allGeom() {
      const r = this.db.exec("SELECT id, op_type, parameters, undone FROM kernel_ops WHERE " + GEOM + " ORDER BY id");
      if (!r.length) return [];
      return r[0].values.map(v => { const p = JSON.parse(v[2]); return { id: v[0], op_type: v[1], parent: p.parent, undone: v[3] }; });
    },
    _setUndone(ids, val) { if (ids.length) this.db.run("UPDATE kernel_ops SET undone=" + (val ? 1 : 0) + " WHERE id IN (" + ids.join(',') + ")"); },

    // Delete ONE feature (+ its children that reference it as parent) — soft, reversible via redo.
    async deleteFeature(featureId) {
      if (!this.db) return { deleted: [] };
      const kids = this._allGeom().filter(o => o.parent === featureId && !o.undone).map(o => o.id);
      const ids = [featureId, ...kids];
      this._setUndone(ids, 1);
      await this._foldUpto(); this._emit();
      console.log(TAG + ' delete feature=' + featureId + (kids.length ? ' +kids[' + kids + ']' : '') + ' active=' + this.length);
      return { deleted: ids };
    },
    // Undo = soft-delete the most-recent ACTIVE feature (LIFO; newest has no active dependents).
    async undo() {
      if (!this.db) return { undone: null };
      const active = this._allGeom().filter(o => !o.undone);
      if (!active.length) return { undone: null };
      const top = active[active.length - 1].id;
      this._setUndone([top], 1);
      await this._foldUpto(); this._emit();
      console.log(TAG + ' undo id=' + top + ' active=' + this.length);
      return { undone: top };
    },
    // Redo = reactivate the most-recent undone feature, walking UP any undone ancestor chain (keep the invariant).
    async redo() {
      if (!this.db) return { redone: null };
      const all = this._allGeom(); const undoneRows = all.filter(o => o.undone);
      if (!undoneRows.length) return { redone: null };
      const byId = new Map(all.map(o => [o.id, o]));
      const on = []; let cur = undoneRows[undoneRows.length - 1]; const top = cur.id;
      while (cur && cur.undone) { on.push(cur.id); cur = cur.parent != null ? byId.get(cur.parent) : null; }
      this._setUndone(on, 0);
      await this._foldUpto(); this._emit();
      console.log(TAG + ' redo id=' + top + (on.length > 1 ? ' +ancestors' : '') + ' active=' + this.length);
      return { redone: top };
    },

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
