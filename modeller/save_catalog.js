// save_catalog.js — §SAVE-2: push a Modeller Save's physical-DB snapshot into the SAME shared landing-page
// IndexedDB catalog (`bim_ootb_imports`/`buildings`, record shape {meta, versions:[{key,importDate,db}],
// latestVersion}) that import_own.js's single-file import / importMultiIFC() write and openProject() reads.
// DECISION (MODELLER_SAVE_COMPLETEIT.md "VERSIONING", defaulted by the assistant while the user was away from
// keyboard, flagged for confirmation not hard sign-off): SAME shared catalog, not a parallel one — one version
// history per building regardless of whether a version came from a landing-page drop or a Modeller Save.
// Deliberately does NOT touch import_own.js (a separate concurrent lane — lane/landing-version-merge — is
// working that file's merge-detection popup; this module only opens the SAME IndexedDB by name/store/shape,
// no shared code, zero collision risk).
// Browser-only (indexedDB global) — window-only, no node/dual export (nothing meaningful to unit-test without
// a real IndexedDB; verified live in a real browser instead, per this project's "test the real user path" rule).
(function () {
  'use strict';
  var DB_NAME = 'bim_ootb_imports', STORE = 'buildings', DB_VERSION = 2;   // IDENTICAL to import_own.js

  function openDb() {
    return new Promise(function (resolve) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }
  function getRecord(db, key) {
    return new Promise(function (resolve) {
      var tx = db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  }
  function putRecord(db, key, rec) {
    return new Promise(function (resolve) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { resolve(false); };
    });
  }

  // pushVersion(key, bytes) -> { key, versions, latestVersion, created }
  // key = the catalog key — the SAME string import_own.js keys its records by (file.name / buildingName+'.ifc').
  // The Modeller passes window.__dwName (set by str_walker_outliner.js on Open — the resident/file/IFC name).
  // If no existing record (e.g. this session opened a resident or a local file that was never routed through
  // the landing-page import flow), CREATE one now: this Save becomes version 0 of a brand-new shared-catalog
  // record — so it appears in the landing catalog going forward and any later landing-page drop of a
  // similarly-named file has something real to detect/merge against (out of scope here — that's the OTHER
  // concurrent lane's merge-detection popup; this module only ever appends/creates, never asks).
  async function pushVersion(key, bytes) {
    var db = await openDb();
    if (!db) return { key: key, versions: 0, latestVersion: -1, error: 'indexeddb-unavailable' };
    var rec = await getRecord(db, key);
    var entry = { key: key + '#save-' + Date.now(), importDate: new Date().toISOString(), db: bytes };
    var created = !rec;
    if (!rec) {
      rec = { meta: { name: key, filename: key, source: 'modeller-save', elementCount: null }, versions: [entry], latestVersion: 0 };
    } else {
      rec.versions = rec.versions || [];
      rec.versions.push(entry);
      rec.latestVersion = rec.versions.length - 1;
    }
    await putRecord(db, key, rec);
    return { key: key, versions: rec.versions.length, latestVersion: rec.latestVersion, created: created };
  }

  window.SaveCatalog = { pushVersion: pushVersion, DB_NAME: DB_NAME, STORE: STORE, _openDb: openDb, _getRecord: getRecord };
})();
