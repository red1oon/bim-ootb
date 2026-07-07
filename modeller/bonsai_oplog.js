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
      // PERSISTENCE: restore the saved signed op-log — localStorage first, IndexedDB fallback (§AUTOSAVE_FIX,
      // SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 4) if a Terminal-scale save overflowed localStorage's
      // quota and had to persist there instead. See _loadBytesEither() for the precedence rule.
      const restored = await this._loadBytesEither();
      if (restored.bytes) {
        try {
          this.db = new SQL.Database(restored.bytes);
          console.log(TAG + ' restored saved model bytes=' + restored.bytes.length + ' source=' + restored.source);
          if (restored.source === 'idb') console.log(TAG + ' §AUTOSAVE_FIX path=idb_fallback bytes=' + restored.bytes.length + ' reload_restore=true');
        } catch (e) { console.warn(TAG + ' restore failed ' + e); this.db = new SQL.Database(); }
      } else this.db = new SQL.Database();
      window.KernelOps.ensureTable(this.db);
      // W-SIGN: install an edge signer so every committed op carries a verifiable signature over its op_hash.
      window.KernelOps.setSigner({
        sign: async (h) => sha256hex(SECRET + '|' + h),
        verify: async (h, s) => s === await sha256hex(SECRET + '|' + h)
      });
      this._signed = true;
      // restore the group counter so new commits mint fresh gids (max existing group ordinal). §P8: scan BOTH
      // minted prefixes — a reloaded session whose max ordinal lives on a gesture-grp gid would otherwise
      // re-mint that ordinal and commitGroup's idempotency would SILENTLY return the old group instead of
      // committing the new gesture.
      try { const r = this.db.exec("SELECT gid FROM kernel_ops WHERE gid LIKE 'geom-grp-%' OR gid LIKE 'gesture-grp-%'"); if (r.length) this._n = r[0].values.reduce((m, v) => Math.max(m, parseInt(String(v[0]).replace(/^(geom|gesture)-grp-/, '')) || 0), 0); } catch (e) { }
      console.log(TAG + ' signed DB ready (kernel_ops chain + edge signer) groups=' + this._n);
      return this.db;
    },

    // ---- PERSISTENCE: autosave the whole signed op-log to localStorage on every change; restore on boot.
    // A modelling session's kernel_ops db is small (KB–tens of KB) → well within the localStorage budget.
    _KEY: 'bonsai_model_v1',
    // §LOD400-STALL: byte-by-byte `s += String.fromCharCode(u8[i])` is a MILLIONS-of-calls string-concat loop —
    // invisible for the small db this comment's original assumption covers, but for a Terminal-scale ARC seed
    // (35,552 signed rows → a multi-MB db export) this turned out to be the SINGLE BIGGEST stall in the whole
    // open path: ~108s measured, dwarfing the (already-fixed) kernel_ops signing loop. Chunked
    // String.fromCharCode.apply produces the byte-for-byte IDENTICAL binary string (same btoa output) with
    // thousands of chunk calls instead of millions of single-char ones — a pure speed fix, zero output change.
    _b64(u8) {
      let s = '';
      const CHUNK = 0x8000;   // 32768 — safely under engines' String.fromCharCode.apply argument-count ceiling
      for (let i = 0; i < u8.length; i += CHUNK) { s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)); }
      return btoa(s);
    },
    _unb64(b64) { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; },
    _loadBytes() { try { const s = localStorage.getItem(this._KEY); return s ? this._unb64(s) : null; } catch (e) { return null; } },

    // ── §AUTOSAVE_FIX (SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 4) ──────────────────────────────
    // localStorage is ~5-10MB/origin; a Terminal-scale signed op-log export (35k+ rows, base64-encoded) can
    // exceed that — confirmed in the raw scale-check log: 20x "§OPLOG autosave FAILED ... QuotaExceededError
    // ... 'mo_Terminal' exceeded the quota". Before this fix that was console.error-only: the edit stayed
    // correct in-session but SILENTLY did not survive a reload — a real data-loss risk with zero visible signal.
    // Fix: on a caught save failure, fall back to IndexedDB (typically hundreds of MB-to-GB quota), reusing the
    // SAME 'bim_ootb_cache' IndexedDB database str_walker_outliner.js's _idbGetDb/_idbPutDb already use for the
    // building-geometry cache (own dedicated object store here, 'oplog_fallback', so the two caches never
    // collide on key-space) — no new IDB wrapper invented, same shape. IDB stores the raw Uint8Array directly
    // (no base64 needed — IndexedDB's structured clone handles binary natively), which is also strictly cheaper
    // than the localStorage path's chunked btoa() encode.
    _idbGet(key) {
      return new Promise((resolve) => {
        try {
          const rq = indexedDB.open('bim_ootb_cache');
          rq.onsuccess = () => {
            const idb = rq.result;
            if (!idb.objectStoreNames.contains('oplog_fallback')) { resolve(null); return; }
            try {
              const g = idb.transaction('oplog_fallback', 'readonly').objectStore('oplog_fallback').get(key);
              g.onsuccess = () => resolve(g.result || null);
              g.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
          };
          rq.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    },
    _idbPut(key, bytes) {
      return new Promise((resolve) => {
        function put(idb) {
          try {
            const tx = idb.transaction('oplog_fallback', 'readwrite');
            tx.objectStore('oplog_fallback').put(bytes, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch (e) { resolve(false); }
        }
        try {
          const rq = indexedDB.open('bim_ootb_cache');
          rq.onsuccess = () => {
            const idb = rq.result;
            if (idb.objectStoreNames.contains('oplog_fallback')) { put(idb); return; }
            const v = idb.version; idb.close();
            const up = indexedDB.open('bim_ootb_cache', v + 1);
            up.onupgradeneeded = () => { const d = up.result; if (!d.objectStoreNames.contains('oplog_fallback')) d.createObjectStore('oplog_fallback'); };
            up.onsuccess = () => put(up.result);
            up.onerror = () => resolve(false);
          };
          rq.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    },
    // §AUTOSAVE_FIX companion — clear()'s IndexedDB counterpart to localStorage.removeItem (Witness:
    // W-E2E-OPLOG-CLEAR-IDB). Same defensive shape as _idbGet/_idbPut above: try/catch around indexedDB.open,
    // every error path resolve(false), never throw. A missing store means nothing to delete → resolve(false).
    _idbDelete(key) {
      return new Promise((resolve) => {
        try {
          const rq = indexedDB.open('bim_ootb_cache');
          rq.onsuccess = () => {
            const idb = rq.result;
            if (!idb.objectStoreNames.contains('oplog_fallback')) { resolve(false); return; }
            try {
              const tx = idb.transaction('oplog_fallback', 'readwrite');
              tx.objectStore('oplog_fallback').delete(key);
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
          };
          rq.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    },
    // Restore precedence: localStorage first (the common case, zero async cost); if empty, check the IDB
    // fallback (a prior save that overflowed localStorage). If BOTH exist (localStorage held an older,
    // pre-overflow save; IDB holds a later fallback save, or vice versa on a since-cleared localStorage),
    // prefer the LONGER export — kernel_ops is append-only (only clear() shrinks it, which empties both keys
    // together), so a longer byte length is measurably the more-complete history, never an invented guess.
    async _loadBytesEither() {
      const ls = this._loadBytes();
      const idb = await this._idbGet(this._KEY);
      if (ls && idb) {
        if (idb.length > ls.length) { console.log(TAG + ' §AUTOSAVE_FIX both localStorage(' + ls.length + 'B) and IDB(' + idb.length + 'B) present for key=' + this._KEY + ' — IDB is longer (more complete), preferring it'); return { bytes: idb, source: 'idb' }; }
        return { bytes: ls, source: 'localStorage' };
      }
      if (idb) return { bytes: idb, source: 'idb' };
      if (ls) return { bytes: ls, source: 'localStorage' };
      return { bytes: null, source: 'none' };
    },
    // A save failure (e.g. QuotaExceededError — localStorage is typically ~5-10MB/origin, and a Terminal-scale
    // export can approach or exceed that) used to be console.error-only, no recovery — the user's edits stayed
    // correct in-session but silently did NOT survive a reload. Now: fall back to the IndexedDB store above so
    // the edit actually persists, and surface a one-time visible toast (reusing modeller.html's existing
    // window.toast() mechanism — no new UI-notice code) so a silent-forever failure never recurs either.
    _save() {
      if (!this.db) return;
      let bytes;
      try { bytes = this.db.export(); } catch (e) { console.error(TAG + ' autosave FAILED — could not export db ' + e); return; }
      try {
        localStorage.setItem(this._KEY, this._b64(bytes));
      } catch (e) {
        console.error(TAG + ' autosave FAILED to localStorage (edits stay in-session; falling back to IndexedDB) ' + e);
        this._idbPut(this._KEY, bytes).then((ok) => {
          if (ok) {
            console.log(TAG + ' §AUTOSAVE_FIX path=idb_fallback bytes=' + bytes.length + ' key=' + this._KEY);
            if (!this._idbFallbackNotified && window.toast) {
              this._idbFallbackNotified = true;
              window.toast('This model is too large for quick-save storage — now autosaving via a larger backup store (your edits are safe).', 'info');
            }
          } else {
            console.error(TAG + ' §AUTOSAVE_FIX path=idb_fallback FAILED bytes=' + bytes.length + ' key=' + this._KEY + ' — this edit may NOT survive a reload');
            if (window.toast) window.toast('⚠ Autosave failed — this edit may not survive a reload. Use Export ▸ Native .db to be safe.', 'error');
          }
        });
      }
    },

    // Boot-time restore: ensure the db (loads saved bytes), then fold it to the scene if non-empty.
    async restore() {
      await this._ensureDb();
      if (this.length) { await this._foldUpto(); this._emit(); }
      console.log(TAG + ' restore active=' + this.length);
      return this.length;
    },

    // Re-read the signed op-log from the SHARED store (localStorage) WITHOUT clearing it, then re-fold to scene.
    // The Connect Scene identity channel (CONNECT_SCENE_SPEC.md P3) calls this: a commit in another surface grew
    // the shared signed chain → this surface reloads it and re-folds. verifyChain still holds (same signed log).
    async reload() {
      // Preserve the user's scrub position: if they are LIVE at the tip, follow to the new tip; if they are
      // scrubbed BACK reviewing history, a peer's commit must NOT yank them forward (it appends beyond cursor).
      const wasAtTip = this.db ? (this._cursor >= this.length) : true;
      const prevCursor = this._cursor;
      if (window.Bonsai && window.Bonsai.clearKernelCache) window.Bonsai.clearKernelCache();
      if (this.db) { try { this.db.close(); } catch (e) { } }
      this.db = null;                      // force _ensureDb to re-load the saved bytes from the shared store
      await this._ensureDb();
      this._cursor = wasAtTip ? this.length : Math.min(prevCursor, this.length);
      await this._foldUpto(this._cursor);
      this._emit();
      console.log(TAG + ' reload active=' + this.length + ' cursor=' + this._cursor);
      return this.length;
    },

    // §EXPORT-NATIVE (prompts/EXPORT_MENU_NATIVE_DB.md — Witness: W-E2E-EXPORT-DB): load a native .db
    // (a signed kernel_ops op-log exported by Export ▸ Native .db) as the CURRENT model — the symmetric
    // READ of Bonsai.exportDb's sealChain→db.export() write. Discriminated + routed by _openBuffer (the
    // same code path #b-open uses) on its kernel_ops table; building-substrate .db files never reach here.
    // Verify the imported chain, fold to tip, persist under the current key. NON-INVENT: bytes are the model.
    async importBytes(u8) {
      await this._ensureDb();                             // SQL runtime + edge signer ready
      if (window.Bonsai && window.Bonsai.clearKernelCache) window.Bonsai.clearKernelCache();
      const SQL = await window.initSqlJs({ locateFile: f => new URL('lib/' + f, _base).href });   // cached module
      if (this.db) { try { this.db.close(); } catch (e) { } }
      this.db = new SQL.Database(u8);
      window.KernelOps.ensureTable(this.db);
      // restore the group counter — the exact _ensureDb idiom (both minted gid prefixes, §P8)
      this._n = 0;
      try { const r = this.db.exec("SELECT gid FROM kernel_ops WHERE gid LIKE 'geom-grp-%' OR gid LIKE 'gesture-grp-%'"); if (r.length) this._n = r[0].values.reduce((m, v) => Math.max(m, parseInt(String(v[0]).replace(/^(geom|gesture)-grp-/, '')) || 0), 0); } catch (e) { }
      let v = null;
      try { v = await window.KernelOps.verifyChain(this.db); } catch (e) { console.warn(TAG + ' import verify threw ' + e); }
      this._cursor = this.length;
      await this._foldUpto(this._cursor);
      this._save();                                       // the imported model persists like any authored one
      this._emit();
      console.log(TAG + ' §EXPORT-NATIVE imported ops=' + this.length + ' verify=' + !!(v && v.ok) + ' cursor=' + this._cursor);
      return { ops: this.length, verify: !!(v && v.ok) };
    },

    // §MO — point the op-log at a per-building EDITABLE INSTANCE (key 'mo_<building>'). The loaded
    // building DB (the fetched meta.db) is the PRISTINE REFERENCE — it lives in IndexedDB and is never
    // written here; this op-log is the editable fold and persists to localStorage under its OWN key. So
    // each resident carries its own signed edit history, and switching buildings never mutates either
    // the reference or another building's instance. Default key (the scratch model) is untouched until
    // a building sets one. (RESUME_MODELLER_WALK_SUBSTRATE task 3 — the mo_ editable instance.)
    async setModelKey(key) {
      if (!key || key === this._KEY) return this.length;
      this._save();                                       // flush the current instance under its OLD key
      if (window.Bonsai && window.Bonsai.clearKernelCache) window.Bonsai.clearKernelCache();
      if (this.db) { try { this.db.close(); } catch (e) { } }
      this.db = null; this._n = 0; this._cursor = 0;
      this._KEY = key;                                    // the editable instance is now mo_<building>
      await this._ensureDb();                             // load THIS building's saved op-log (empty on first open)
      this._cursor = this.length;
      if (this.length) await this._foldUpto(this._cursor);
      this._emit();
      console.log(TAG + ' model key → ' + key + ' active=' + this.length + ' (reference stays pristine)');
      return this.length;
    },

    // §OUTLINER-STALL: every real mutating flow (commit — incl. the LEAF optimistic-append path, which does
    // NOT go through _foldUpto — commitSeedGroup, delete/undo/redo) calls _emit() unconditionally right after
    // touching kernel_ops. That makes _emit() the one safe choke point to invalidate the _geomOps() memo below;
    // clearing it in _foldUpto() alone (the originally drafted fix) would MISS the LEAF-commit path (bonsai_
    // oplog.js commit(): LEAF ops skip _foldUpto and append optimistically, but still _emit()).
    _emit() { this._opsCache = null; try { window.dispatchEvent(new CustomEvent('bonsai:oplog')); } catch (e) { } this._save(); },
    // clear() empties BOTH persisted copies of this._KEY — localStorage AND the §AUTOSAVE_FIX IndexedDB fallback
    // (the _loadBytesEither precedence comment above PROMISES "clear() ... empties both keys together"; before this
    // fix only localStorage was removed, so a Terminal-scale model whose autosave had overflowed into IDB silently
    // RESURRECTED from the stale IDB entry on the next open of the same key). The IDB purge is fire-and-forget —
    // same style as _save()'s _idbPut — because no clear() call site awaits it; the synchronous localStorage
    // removal + in-memory reset semantics stay exactly as before. Witness: W-E2E-OPLOG-CLEAR-IDB.
    clear() { if (this.db) { try { this.db.close(); } catch (e) { } } this.db = null; this._n = 0; this._cursor = 0; try { localStorage.removeItem(this._KEY); } catch (e) { } this._idbDelete(this._KEY); if (window.Bonsai && window.Bonsai.clearKernelCache) window.Bonsai.clearKernelCache(); this._emit(); },

    // Read the live GEOM ops out of the signed log, mapped to fold-op shape (parent rides in parameters).
    // §OUTLINER-STALL: memoized on db-object identity (auto-invalidates on setModelKey/reload/clear, which all
    // swap in a NEW SQL.Database instance) + explicitly cleared in _emit() (see comment there) on every real
    // mutation. Before this fix: a FRESH SQL scan+JSON.parse of every GEOM row, on EVERY call — the Outliner's
    // "Components" category calls moveDeltaFor(id) ONCE PER matching row during paint, so painting N disc-walk
    // fixtures cost O(N × total-ops). Measured (real browser, SampleCastle ELEC walk, 2648 fixtures): a single
    // Outliner paint went 176ms → 41,576ms (236x) as cumulative Components rows grew 3,597→6,245.
    _geomOps() {
      if (this._opsCache && this._opsCacheDb === this.db) return this._opsCache;
      const r = this.db.exec("SELECT id, op_type, parameters, op_hash FROM kernel_ops WHERE undone=0 AND " + GEOM + " ORDER BY id");
      const out = !r.length ? [] : r[0].values.map(v => { const p = JSON.parse(v[2]); return { id: v[0], op_type: v[1], parameters: p, parent: p.parent, op_hash: v[3] }; });
      this._opsCache = out; this._opsCacheDb = this.db;
      return out;
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
      // §OUTLINER-STALL: invalidate the _geomOps() memo RIGHT HERE, at the actual DB write — this.db is a
      // mutable SQL.js Database mutated IN PLACE (commitGroup's INSERT doesn't change object identity), so
      // clearing only in _emit() is too late for the _foldUpto()/this.length calls a few lines below, which
      // run BEFORE _emit() in this same function and would otherwise reuse a stale (possibly pre-seed empty)
      // cached array keyed to this same db object.
      this._opsCache = null;
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
      // LEAF ops (extrude/sweep/loft) build a fresh solid → O(1) optimistic append. Everything else (GEOM_CUT,
      // GEOM_FILLET, GEOM_GRID_MOVE) MUTATES prior solids in the fold → must take the authoritative re-fold.
      // GEOM_LOFT (prompts/BONSAI_LOFT_SPEC.md): the wires ARE the payload — no `parent` reference, exactly
      // GEOM_SWEEP's shape (a fresh self-contained solid from its own parameters), NOT GEOM_CUT/GEOM_FILLET/
      // GEOM_ARRAY's shape (which all resolve+mutate/replace a referenced prior feature). Decided explicitly,
      // not defaulted — checked against buildSolids()'s branching in bonsai_kernel_worker.js, where GEOM_LOFT
      // falls into the same terminal `else` (applyFeature) branch as GEOM_SWEEP, not the parent-lookup branches.
      // Tier 1 (§GAP-TO-COMPETITIVE, prompts/BONSAI_KERNEL_RESEARCH.md): GEOM_REVOLVE joins this LEAF set for
      // the SAME reason as GEOM_LOFT — its profile+axis+angle payload builds a fresh self-contained solid with
      // NO `parent` reference (checked against bonsai_kernel_worker.js applyFeature(), the terminal-else branch).
      // GEOM_SHELL/GEOM_OFFSET/GEOM_FILLET_VARIABLE/GEOM_CHAMFER_DIST_ANGLE/GEOM_DRAFT are DELIBERATELY
      // EXCLUDED — each references a `parent` and MUTATES that solid in place (same class as GEOM_CUT/
      // GEOM_FILLET, checked against the same file's buildSolids() parent-lookup branches for each), so they
      // must take the authoritative re-fold like GEOM_CUT/GEOM_FILLET do, not the optimistic leaf append.
      const LEAF = op.op_type === 'GEOM_EXTRUDE' || op.op_type === 'GEOM_EXTRUDE_POLY' || op.op_type === 'GEOM_SWEEP' || op.op_type === 'GEOM_LOFT' || op.op_type === 'GEOM_REVOLVE';
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

    // §P8 (RESUME_MODELLER_POLISH_BATCH.md — Witness: W-GESTURE-UNDO): commit ONE user gesture that lands as
    // SEVERAL ops (grid-stretch + its induced rider moves) as ONE signed group under a 'gesture-grp-*' gid, so
    // undo()/redo() treat it as one step (see the gesture-aware branches below). Mirrors commit() exactly
    // (same deterministic baseTs band, same verify + authoritative re-fold + emit); the ONLY difference is N
    // ops share the gid. opsArray = [{op_type, params}, …] in commit order.
    async commitGesture(opsArray) {
      const db = await this._ensureDb();
      if (!opsArray || !opsArray.length) return { ids: [], verify: true };
      const baseTs = 1700000000000 + this._n * 1000;
      const gid = 'gesture-grp-' + (++this._n);
      const res = await window.KernelOps.commitGroup(db, opsArray, { gid, baseTs });
      if (!res.committed) throw new Error('commitGroup rejected: ' + res.reason);
      this._opsCache = null;                                   // §OUTLINER-STALL: see commit()'s identical comment
      const v = await window.KernelOps.verifyChain(db);
      this._lastTip = v.tip;
      const r = await this._foldUpto();                        // a gesture mutates prior solids → authoritative re-fold
      this._emit();
      console.log(TAG + ' commitGesture gid=' + gid + ' ops=' + res.ids.length + ' verify=' + v.ok + ' tip=' + (v.tip || '').slice(0, 12));
      return { ids: res.ids, id: res.ids[res.ids.length - 1], gid, verify: v.ok, tip: v.tip, ...r };
    },

    // §ARC-1 (RESUME_ARC_EDITABLE_SUBSTRATE.md): seed a BATCH of RECOVERED building ops (each carrying its real
    // IFC guid as output_guid) as ONE signed group — the editable-ARC substrate. Mirrors commit() (verify +
    // persist + fold) but writes N ops + their guids at once. IDEMPOTENT by gid ('arcseed-<building>') so
    // re-opening a building never double-seeds. opsArray = [{op_type:'GEOM_INSERT', params, outputGuid}, …].
    // Returns {ids, idempotent}: ids[i] == the kernel_ops row id == featureId of ops[i] (the bridge anchor).
    // opts.verify (default true — UNCHANGED behaviour for every existing caller, incl. modeller.html's
    // disc-walk trunk commit): §LOD400-STALL — KernelOps.verifyChain() re-derives sha256(prev|canonical(op))
    // (+ re-checks the signature) for EVERY row in the log, INCLUDING the rows commitGroup+sealFrom just
    // staged/sealed moments earlier with the exact same deterministic function — for a big seed (Terminal:
    // 35,552 ops) that's a fully redundant 3rd hash pass (see kernel_ops.js commitGroup/sealFrom comments),
    // ~half the total wall-clock. commitGroup's own returned {committed,sealed,tip} already proves the group
    // inserted atomically and chained correctly — enough for the ARC-seed path (str_walker_outliner.js), which
    // always seeds into a FRESH mo_<building> instance (nothing "pre-existing" to lose coverage on). Opt-in
    // per call site, not a global default change — any other caller keeps the full check unless it explicitly
    // asks not to.
    async commitSeedGroup(opsArray, gid, opts) {
      opts = opts || {};
      const db = await this._ensureDb();
      if (!opsArray.length) return { ids: [], idempotent: false };
      const baseTs = 1700000000000;                           // fixed → deterministic seed-row timestamps (replay-stable)
      const res = await window.KernelOps.commitGroup(db, opsArray, { gid, baseTs });
      if (!res.committed) throw new Error('commitSeedGroup rejected: ' + res.reason);
      this._opsCache = null;   // §OUTLINER-STALL: see commit()'s identical comment — must precede _foldUpto() below
      if (!res.idempotent) this._n = Math.max(this._n, res.ids.length);   // push future geom-grp gids past the seed
      const doVerify = opts.verify !== false;
      const v = doVerify ? await window.KernelOps.verifyChain(db) : { ok: res.committed, tip: res.tip, skipped: true };
      this._lastTip = v.tip;
      await this._foldUpto();                                 // redraw the chain → the seeded boxes appear, gizmo-ready
      this._emit();                                           // persist mo_<building> + notify (autosave)
      console.log(TAG + ' commitSeedGroup gid=' + gid + ' ops=' + res.ids.length + ' verify=' + (doVerify ? v.ok : 'SKIPPED(trusted commitGroup, tip=' + String(v.tip).slice(0, 12) + '…)') + ' idempotent=' + !!res.idempotent);
      return { ids: res.ids, idempotent: !!res.idempotent };
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
      const r = this.db.exec("SELECT id, op_type, parameters, undone, gid FROM kernel_ops WHERE " + GEOM + " ORDER BY id");
      if (!r.length) return [];
      return r[0].values.map(v => { const p = JSON.parse(v[2]); return { id: v[0], op_type: v[1], parent: p.parent, undone: v[3], gid: v[4] }; });
    },
    // §P8 (RESUME_MODELLER_POLISH_BATCH.md — Witness: W-GESTURE-UNDO): ONLY a 'gesture-grp-*' gid undoes/
    // redoes as one unit — one user gesture, one Ctrl+Z. Every other gid keeps the one-row behaviour: the
    // 'arcseed-*' whole-building group must NEVER mass-undo, 'geom-grp-*' singles are one row anyway.
    _isGestureGid(gid) { return typeof gid === 'string' && gid.indexOf('gesture-grp-') === 0; },
    // §OUTLINER-STALL: the other real mutation primitive (delete/undo/redo all funnel through this) — invalidate
    // here too, same reason as commit()/commitSeedGroup(): this.db is mutated in place, cache must clear at the
    // write, not deferred to _emit() (which runs after the callers' own _foldUpto()).
    _setUndone(ids, val) { if (ids.length) { this.db.run("UPDATE kernel_ops SET undone=" + (val ? 1 : 0) + " WHERE id IN (" + ids.join(',') + ")"); this._opsCache = null; } },

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
    // §P8: if the top row belongs to a gesture group, the WHOLE group undoes together (one gesture = one Ctrl+Z —
    // a grid-stretch's induced rider moves revert with the stretch, never a half-reverted gesture).
    async undo() {
      if (!this.db) return { undone: null };
      const active = this._allGeom().filter(o => !o.undone);
      if (!active.length) return { undone: null };
      const topRow = active[active.length - 1], top = topRow.id;
      const ids = this._isGestureGid(topRow.gid) ? active.filter(o => o.gid === topRow.gid).map(o => o.id) : [top];
      this._setUndone(ids, 1);
      await this._foldUpto(); this._emit();
      console.log(TAG + ' undo id=' + top + (ids.length > 1 ? ' §GESTURE-UNDO group=' + topRow.gid + ' rows=' + ids.length : '') + ' active=' + this.length);
      return { undone: top, group: ids.length > 1 ? ids : undefined };
    },
    // Redo = reactivate the EARLIEST-undone feature (LIFO: the row closest to the active boundary — the
    // one undo() removed MOST RECENTLY), walking UP any undone ancestor chain (keep the invariant).
    // §P8: a gesture group reactivates whole (mirror of the group undo above), each member still ancestor-walked.
    // §MODELLER_REDO_ORDER (MODELLER_GIT_FAITHFUL_HISTORY.md Phase 1): was `undoneRows[undoneRows.length-1]`
    // — the HIGHEST-id undone row ("most recently created"), which is the OPPOSITE of correct LIFO redo and
    // diverged from the proven invariant both `viewer/kernel_ops.js redoOp` and `erp/kernel_ops.js redoOp`
    // already use (`ORDER BY id ASC LIMIT 1` = lowest-id undone first). Confirmed by trace: rows 1,2,3 active,
    // undo() twice → undone={2,3} in that order; correct redo() must reactivate 2 first (it was undone LAST,
    // i.e. it sits nearest the active/undone boundary), not 3. The old code picked 3 first — wrong order even
    // with zero forking involved, and the root enabler of a later fork silently resurrecting alongside a
    // diverged edit once a tree layer is added on top (see file header WHY #3/#4).
    async redo() {
      if (!this.db) return { redone: null };
      const all = this._allGeom(); const undoneRows = all.filter(o => o.undone);
      if (!undoneRows.length) return { redone: null };
      const byId = new Map(all.map(o => [o.id, o]));
      const topRow = undoneRows[0], top = topRow.id;
      const seeds = this._isGestureGid(topRow.gid) ? undoneRows.filter(o => o.gid === topRow.gid) : [topRow];
      const on = [];
      seeds.forEach(s => { let cur = s; while (cur && cur.undone && on.indexOf(cur.id) < 0) { on.push(cur.id); cur = cur.parent != null ? byId.get(cur.parent) : null; } });
      this._setUndone(on, 0);
      await this._foldUpto(); this._emit();
      console.log(TAG + ' redo id=' + top + (seeds.length > 1 ? ' §GESTURE-REDO group=' + topRow.gid + ' rows=' + seeds.length : (on.length > 1 ? ' +ancestors' : '')) + ' active=' + this.length);
      return { redone: top, group: seeds.length > 1 ? seeds.map(s => s.id) : undefined };
    },

    // W-BONSAI-MOVE: net translation applied to a feature by its ACTIVE GEOM_MOVE rows (parent===id). Read-only,
    // used by the Outliner so a moved insert's row shows the new grid ref (its signed GEOM_INSERT.placement is
    // never rewritten — the move is a separate signed row, a pure fold override like LOD).
    moveDeltaFor(id) {
      const o = { dx: 0, dy: 0, dz: 0 };
      if (!this.db) return o;
      this._geomOps().forEach(op => {
        if (op.op_type === 'GEOM_MOVE' && op.parent === id) { const p = op.parameters; o.dx += p.dx || 0; o.dy += p.dy || 0; o.dz += p.dz || 0; }
      });
      return o;
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
