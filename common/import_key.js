// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (SEAM-W2 · prompts/SEAM_IDENTITY_AUDIT.md F5/F6)
// SCOPE: the ONE owner of the `import://` identity — project key + url — for an imported/materialised building.
//        Callers: import_own.js (landing), viewer/import.js (viewer), viewer/materialize.js (designs).
// WHY:   each caller used to rebuild `'import://' + key + '/' + key.replace(/\.ifc$/i, …)` itself; the monolith url
//        was `/v0` in one and `/extracted`+`/library` in the other (duplicate 100MB+ blobs), and materialize kept `.ifc`.
// RULES: R1 project key = file name VERBATIM (every stored bim_ootb_imports record is keyed that way — never sanitise).
//        R2 split urls end `_extracted.db` / `_meta.db` / `_geo.db` (streaming.js derives meta/geo by string replace).
//        R3 monolith url = import://K/v0 (revisions import://K/vN).
//        R4 USER DATA: legacy monolith shapes (K/extracted, K/library) are re-keyed, never dropped: put new, verify, THEN delete old.
// Witness: viewer/tests/witness_one_import_key.js — read the §IMPORT_KEY log after every run.
(function (root) {
  'use strict';

  function importProjectKey(fileName) { return String(fileName == null ? '' : fileName); }

  // Multi-file: LTU_AHouse_ARC.ifc + LTU_AHouse_STR.ifc → LTU_AHouse.ifc  (the former duplicated _commonPrefix rule, verbatim)
  function _commonPrefix(strs) {
    if (!strs.length) return '';
    var prefix = strs[0];
    for (var i = 1; i < strs.length; i++) {
      while (strs[i].indexOf(prefix) !== 0) {
        prefix = prefix.substring(0, prefix.length - 1);
        if (!prefix) return '';
      }
    }
    return prefix;
  }
  function importMultiProjectKey(fileNames) {
    var stems = [];
    for (var i = 0; i < fileNames.length; i++) stems.push(importProjectKey(fileNames[i]).replace(/\.(ifc|IFC)$/, ''));
    var name = _commonPrefix(stems).replace(/[_\-]+$/, '') || stems[0];
    return { buildingName: name, key: name + '.ifc' };
  }

  function importStem(projectKey) { return importProjectKey(projectKey).replace(/\.ifc$/i, ''); }

  // part: 'extracted' | 'library' (split primary, same url) | 'meta' | 'geo' | 'monolith' (= 'v0') | 'vN'
  function importUrl(projectKey, part) {
    var k = importProjectKey(projectKey);
    switch (part) {
      case 'extracted': case 'library': return 'import://' + k + '/' + importStem(k) + '_extracted.db';
      case 'meta': return 'import://' + k + '/' + importStem(k) + '_meta.db';
      case 'geo': return 'import://' + k + '/' + importStem(k) + '_geo.db';
      case undefined: case null: case 'monolith': return 'import://' + k + '/v0';
      default:
        if (/^v\d+$/.test(part)) return 'import://' + k + '/' + part;
        throw new Error('ImportKey.importUrl: unknown part ' + part);
    }
  }

  // Old shapes a monolith blob may still sit under (viewer/import.js before SEAM-W2).
  function importLegacyUrls(projectKey, part) {
    var k = importProjectKey(projectKey);
    if (part === 'monolith' || part === 'v0' || part == null) return ['import://' + k + '/extracted', 'import://' + k + '/library'];
    return [];
  }
  // currentUrlFor(url) — the url a LEGACY monolith url now lives under (import://K/extracted|library → import://K/v0),
  // or null. Lets an old ?db= link / restored tab / pwa_last_db still open after importRekey moved its blob (R4).
  // Split urls end `_extracted.db` etc. and are never matched.
  function currentUrlFor(url) {
    var m = /^import:\/\/(.+)\/(extracted|library)$/.exec(String(url || ''));
    return m ? importUrl(m[1], 'monolith') : null;
  }

  // Old materialize shape (stem kept). Informational: never moved or deleted (a saved ?db= link carries the whole url).
  function legacyDesignUrls(safeKey) {
    var u = 'import://' + safeKey + '/' + safeKey + '_extracted.db';
    return u === importUrl(safeKey, 'extracted') ? [] : [u];
  }

  function _same(a, b) {
    if (!a || !b) return false;
    var x = new Uint8Array(a.buffer ? a.buffer : a, a.byteOffset || 0, a.byteLength);
    var y = new Uint8Array(b.buffer ? b.buffer : b, b.byteOffset || 0, b.byteLength);
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  // store = { get(url)→Promise<value|undefined>, put(url,value)→Promise, del(url)→Promise }
  // Resolves { url, value, rekeyed:[oldUrl…], dupDeleted:[oldUrl…] }. Never deletes an entry not first held under the new key.
  async function importRekey(store, projectKey, part) {
    var url = importUrl(projectKey, part);
    var out = { url: url, value: await store.get(url), rekeyed: [], dupDeleted: [] };
    var legacy = importLegacyUrls(projectKey, part);
    for (var i = 0; i < legacy.length; i++) {
      var old = await store.get(legacy[i]);
      if (old === undefined || old === null) continue;
      if (out.value === undefined || out.value === null) {
        await store.put(url, old);
        var back = await store.get(url);
        if (!_same(back, old)) { console.log('§IMPORT_KEY_REKEY_FAIL old=' + legacy[i] + ' new=' + url + ' (read-back mismatch, old kept)'); continue; }
        out.value = back;
        await store.del(legacy[i]);
        out.rekeyed.push(legacy[i]);
        console.log('§IMPORT_KEY_REKEY old=' + legacy[i] + ' new=' + url);
      } else if (_same(out.value, old)) {
        await store.del(legacy[i]);
        out.dupDeleted.push(legacy[i]);
        console.log('§IMPORT_KEY_REKEY old=' + legacy[i] + ' new=' + url + ' (identical duplicate removed)');
      }
    }
    return out;
  }

  // Browser adapter over an open IDBDatabase + object-store name.
  function importIdbStore(idb, storeName) {
    function req(mode, fn) {
      return new Promise(function (resolve) {
        try {
          var tx = idb.transaction(storeName, mode); var r = fn(tx.objectStore(storeName));
          tx.oncomplete = function () { resolve(r && r.result); }; tx.onerror = tx.onabort = function () { resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    }
    return {
      get: function (u) { return req('readonly', function (s) { return s.get(u); }); },
      put: function (u, v) { return req('readwrite', function (s) { return s.put(v, u); }); },
      del: function (u) { return req('readwrite', function (s) { return s.delete(u); }); }
    };
  }

  var api = { importProjectKey: importProjectKey, importMultiProjectKey: importMultiProjectKey, importStem: importStem,
    importUrl: importUrl, importLegacyUrls: importLegacyUrls, currentUrlFor: currentUrlFor, legacyDesignUrls: legacyDesignUrls,
    importRekey: importRekey, importIdbStore: importIdbStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ImportKey = api;
})(typeof window !== 'undefined' ? window : this);
