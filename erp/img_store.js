// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * img_store.js — the POS images FOLDER + the out-of-band copy job (POS_ADDON_SPEC.md §P-9.1,
 * POS_ENGINE_LANE.md §E-3 / POS_KILLER_DEMO §LAYOUT.3).
 *
 * THE SPLIT (§P-9.1 plumbing bound): the op-log is the sync spine — an AD_Image op carries only the
 * CAPPED thumbnail (binarydata ≤ ~32KB) + a CONTENT KEY (imageurl). Full-resolution photos live in a
 * device-local FOLDER (browser = an IndexedDB object store; headless = an injected Map adapter) and
 * are copied between devices by an EXPLICIT, witnessed COPY JOB — never inside op sync.
 *
 * READ PATH (the lens renders): folder.get(key) → full-res; null → the ledger thumb (the op's
 * binarydata); null → placeholder. Honest interim state: a device that has synced ops but not run
 * the copy job shows THUMBS (`§IMG interim=thumb`), never a broken image, never a fabricated one.
 *
 * TRANSPORT CHOICE (named, extracted from what exists): **explicit-export-import** — the copy job
 * takes a caller-supplied `fetchBlob(key)` (file drop / share-sheet import / a fetch against the
 * peer's exported album). Riding the share/relay rails (share_sheet / erp_relay) is NAMED-DEFERRED:
 * the rails exist but wiring them is a lens/UI unit, not this engine file. No sync protocol invented.
 *
 * Separation contract: PURE module + an injected adapter. No Date.now/Math.random in any path; keys
 * are CONTENT addresses supplied by the caller (sha256 of the bytes — computed from content).
 * UMD wrapper = the pos_core.js house pattern. Witnesses: W-IMG-FOLDER (poc_img_folder.js) ·
 * W-IMG-SYNC (poc_img_sync.js).
 */
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ImgStore = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  var DB_NAME = 'pos_img_store';      // the IDB database ("the folder" lives here)
  var STORE = 'images';               // content-addressed object store: key -> blob bytes

  // ── adapters: ONE folder surface, two backings ────────────────────────────────────────────────
  // Map adapter — headless tests + any host that injects its own store (two namespaces = two devices).
  function mapAdapter(map) {
    var m = map || new Map();
    return {
      kind: 'map',
      put: function (key, blob) { m.set(String(key), blob); return Promise.resolve(true); },
      get: function (key) { return Promise.resolve(m.has(String(key)) ? m.get(String(key)) : null); },
      has: function (key) { return Promise.resolve(m.has(String(key))); },
      _map: m
    };
  }

  // IDB adapter — the browser folder. Lazy-opened once; every call rides the same db handle.
  function idbAdapter(idbFactory, dbName) {
    var name = dbName || DB_NAME;
    var dbP = null;
    function open() {
      if (dbP) return dbP;
      dbP = new Promise(function (resolve, reject) {
        var req = idbFactory.open(name, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      return dbP;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, mode), os = t.objectStore(STORE);
          var req = fn(os);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        });
      });
    }
    return {
      kind: 'idb',
      put: function (key, blob) { return tx('readwrite', function (os) { return os.put(blob, String(key)); }).then(function () { return true; }); },
      get: function (key) { return tx('readonly', function (os) { return os.get(String(key)); }).then(function (v) { return v === undefined ? null : v; }); },
      has: function (key) { return tx('readonly', function (os) { return os.count(String(key)); }).then(function (n) { return n > 0; }); }
    };
  }

  // ── createFolder: idempotent — returns the folder handle; same opts.adapter = same folder ──────
  // opts = { adapter: Map }            → Map-backed (headless / injected)
  //        { idb: indexedDB, name? }   → IDB-backed (browser)
  //        {} with window.indexedDB    → the default browser folder
  //        {} headless                 → a module-default Map (one folder per process, idempotent)
  var _defaultMapStore = null;
  function createFolder(opts) {
    opts = opts || {};
    if (opts.adapter instanceof Map || (opts.adapter && typeof opts.adapter.set === 'function')) return mapAdapter(opts.adapter);
    var idb = opts.idb || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    if (idb) return idbAdapter(idb, opts.name);
    if (!_defaultMapStore) _defaultMapStore = new Map();
    return mapAdapter(_defaultMapStore);
  }

  // module-level convenience (the §E-3 card surface): one default folder per host
  var _folder = null;
  function folder() { if (!_folder) _folder = createFolder(); return _folder; }
  function put(key, blob) { return folder().put(key, blob); }
  function get(key) { return folder().get(key); }
  function has(key) { return folder().has(key); }

  // ── the READ PATH the lens uses: folder full-res → ledger thumb → null (placeholder) ───────────
  // imageOps = the folded AD_Image rows/ops keyed by content key (imageurl). Returns
  // { src, tier: 'full'|'thumb'|'none', tampered? } — honest about WHICH resolution renders.
  //
  // CONTENT-ADDRESS INTEGRITY (W-IMG-LIVE falsifier): a 'sha256:<hex>' key NAMES its bytes. When the
  // host supplies digestOf(blob) -> Promise<hex> (browser = SubtleCrypto over the blob bytes), the
  // folder blob is RE-HASHED before it renders full-tier; a mismatch (tampered/corrupt folder entry)
  // demotes to the ledger thumb and reports tampered:true — never renders bytes the key disowns,
  // never fabricates. Keys outside the sha256: scheme (e.g. curated 'product-<id>') skip the check
  // (they are folder conventions, not content addresses). No digestOf → prior behavior, unchanged.
  function resolveImage(store, key, thumbOf, digestOf) {
    return store.get(key).then(function (blob) {
      var checkable = blob != null && digestOf && /^sha256:[0-9a-f]+$/.test(String(key));
      return Promise.resolve(checkable ? digestOf(blob) : null).then(function (hex) {
        if (blob != null) {
          if (!checkable || ('sha256:' + hex) === String(key)) return { src: blob, tier: 'full' };
          var t = thumbOf ? thumbOf(key) : null;   // key ≠ recomputed hash → demote, say so
          return { src: t != null ? t : null, tier: t != null ? 'thumb' : 'none', tampered: true };
        }
        var thumb = thumbOf ? thumbOf(key) : null;
        if (thumb != null) return { src: thumb, tier: 'thumb' };
        return { src: null, tier: 'none' };
      });
    });
  }

  // ── THE COPY JOB (out-of-band, witnessed; NOT part of op sync) ─────────────────────────────────
  // Given a synced op log on a SECOND device: every CREATE/CRUD_CREATE AD_Image op names a content
  // key (fields.imageurl). For each key absent from the local folder, fetchBlob(key) supplies the
  // full-res bytes (explicit-export-import transport — relay-rails named-deferred) and the folder
  // fills. Idempotent: keys already present are skipped; a key fetchBlob cannot supply is reported
  // missing (honest — the thumb keeps rendering), never fabricated.
  // Returns { copied, skipped, missing:[keys] }.
  function syncFromLog(store, ops, fetchBlob) {
    var keys = [];
    (ops || []).forEach(function (op) {
      var isCreate = op.op_type === 'CRUD_CREATE' || op.op_type === 'CREATE' || op.op_type === 'CREATE_DOCUMENT';
      if (!isCreate) return;
      var table = String(op.table || '').toLowerCase();
      if (table !== 'ad_image') return;
      var f = op.fields || op.params || {};
      if (f.imageurl != null) keys.push(String(f.imageurl));
    });
    var result = { copied: 0, skipped: 0, missing: [] };
    var chain = Promise.resolve();
    keys.forEach(function (key) {
      chain = chain.then(function () {
        return store.has(key).then(function (have) {
          if (have) { result.skipped++; return null; }
          return Promise.resolve(fetchBlob(key)).then(function (blob) {
            if (blob == null) { result.missing.push(key); return null; }
            return store.put(key, blob).then(function () { result.copied++; });
          });
        });
      });
    });
    return chain.then(function () { return result; });
  }

  return {
    createFolder: createFolder,
    put: put, get: get, has: has,
    resolveImage: resolveImage,
    syncFromLog: syncFromLog,
    TRANSPORT: 'explicit-export-import (relay-rails named-deferred)',
    DB_NAME: DB_NAME, STORE: STORE
  };
});
