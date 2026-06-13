// ⚠ DO NOT REMOVE — Red Pill P5 Materialization (RED_PILL.md §11.5 P5 + §9 MATERIALIZE;
//   NEW_FROM_REFERENCE.md §8.3 / §12 Phase 5; CLOSES RedPillRosetta.md F9 + enables identity mode 1(b)).
//
// SCOPE: turn an EDITED Red Pill session into an exported NewIFC.db.
//   NON-INVENT — the materialized geometry is exactly what the edited in-memory db already holds:
//   the reference loaded into sql.js, with B1-persisted governed moves in `element_transforms`
//   plus the replayed `kernel_ops` event log. NO coordinate is computed here. `db.export()`
//   serializes the editor's own state; the schema == any extracted IFC.db BY CONSTRUCTION (the
//   file IS a copy of the reference's tables with mutated rows), so the existing viewer / clash /
//   ERP layer AND the G8-GOVERNANCE RosettaStone identity gate (RedPillRosetta §3 mode 1(b),
//   redpill_gate.aabbRows reads element_transforms⋈elements_meta) all read it unmodified.
//
//   The REFERENCE db is NEVER written back — only the in-memory WORKING copy is exported — so the
//   NEW_FROM_REFERENCE §16.7 byte-identity precondition holds by construction.
//   NewIFC.db is a materialized VIEW (§8.3): deletable, regenerable from grammar + event_log.
//
// WITNESS: viewer/tests/poc_redpill_materialize.js (W-REDPILL-MATERIALIZE) —
//   M1 identity round-trip on the REAL exported file (1b, the F9 closer);
//   M2 schema round-trips (viewer-loadable); M3 edited session → file carries governed edits &
//   stays governed (ungoverned=0); M4 reference untouched (§16.7); M5 determinism (same log → same geometry).
//
// "read the log after every run" — honour until DONE.
(function (root) {
  'use strict';

  // toBuffer(db) — PURE. Edited in-memory sql.js Database → NewIFC.db bytes (Uint8Array).
  //   This is the whole of materialization: serialize what the editor already holds. No invention.
  function toBuffer(db) {
    if (!db || typeof db.export !== 'function') {
      throw new Error('Materialize.toBuffer: argument is not a sql.js Database');
    }
    return db.export();
  }

  // urlsFor(designKey) — the import:// scheme streaming.js already resolves from CACHE_STORE,
  //   so a stored NewIFC.db round-trips through the viewer with ZERO streaming change.
  function urlsFor(designKey) {
    var safe = String(designKey || 'NewIFC').replace(/[^A-Za-z0-9_.-]/g, '_');
    var dbUrl = 'import://' + safe + '/' + safe + '_extracted.db';
    return {
      db: dbUrl,
      lib: dbUrl,
      viewer: 'viewer.html?db=' + encodeURIComponent(dbUrl) + '&lib=' + encodeURIComponent(dbUrl)
    };
  }

  // materialize(A, designKey, cb) — BROWSER. Export the edited db → store it under import:// in
  //   CACHE_STORE so the viewer can open it; cb(err, { url, viewerUrl, size }).
  //   In node / no-IDB it still returns the buffer (the pure result) so callers can persist it.
  function materialize(A, designKey, cb) {
    cb = cb || function () {};
    try {
      if (!A || !A.db) return cb(new Error('Materialize: no A.db (load a building first)'));
      var buf = toBuffer(A.db);
      var u = urlsFor(designKey);
      var opening = (A && typeof A.openCacheDB === 'function') ? A.openCacheDB() : null;
      Promise.resolve(opening).then(function (cacheDb) {
        if (!cacheDb || !A.CACHE_STORE) { return _finish(buf, u, cb); }
        var tx = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
        // store the ArrayBuffer (cachedFetch returns it directly to new SQL.Database)
        tx.objectStore(A.CACHE_STORE).put(buf.buffer, u.db);
        tx.oncomplete = function () { _finish(buf, u, cb); };
        tx.onerror = function (e) { cb(e.target.error); };
      }).catch(function (e) { cb(e); });
    } catch (e) { cb(e); }
  }

  function _finish(buf, u, cb) {
    console.log('§MATERIALIZE url=' + u.db + ' size=' + (buf.byteLength / 1024 / 1024).toFixed(2) + 'MB');
    cb(null, { url: u.db, viewerUrl: u.viewer, size: buf.byteLength, buffer: buf });
  }

  var api = { toBuffer: toBuffer, urlsFor: urlsFor, materialize: materialize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Materialize = api;
})(typeof window !== 'undefined' ? window : this);
