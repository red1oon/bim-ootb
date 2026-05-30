/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// import.js — Multi-Format Import: IFC + DAE/OBJ/GLB/3DS/FBX/STL
// S220: IFC import. S228: mesh format support via semantic enrichment.

// S228: Multi-format detection
var FORMAT_ROUTES = {
  'ifc':  'ifc',
  'dae':  'mesh',
  'obj':  'mesh',
  'glb':  'mesh',
  'gltf': 'mesh',
  '3ds':  'mesh',
  'fbx':  'mesh',
  'stl':  'mesh',
};

function detectFormat(filename) {
  var ext = filename.split('.').pop().toLowerCase();
  return { ext: ext, route: FORMAT_ROUTES[ext] || null };
}

// §S284d: get the web-ifc WASM bytes (offline-safe) and transfer them into the import worker,
// so emscripten never does its own fetch — which aborts offline ("both async and sync ... failed")
// whenever the 1.3MB binary isn't in a cache layer. The viewer is SW-controlled, so caches.match
// reads the precache offline. Throws a CLEAR error if genuinely unavailable.
async function _getWebIfcWasmBytes() {
  var url = 'lib/web-ifc.wasm';
  try { var hit = await caches.match(url); if (hit) { console.log('[S220] §IFC_WASM_FROM_CACHE'); return await hit.arrayBuffer(); } } catch (e) {}
  try { var r = await fetch(url); if (r && r.ok) { console.log('[S220] §IFC_WASM_FROM_NET'); return await r.arrayBuffer(); } } catch (e) {}
  console.warn('[S220] §IFC_ENGINE_UNAVAILABLE web-ifc.wasm not cached and offline');
  throw new Error('IFC engine not available offline — connect to the internet once to enable offline IFC import.');
}

function setupImport(A) {
  const IMPORT_DB_NAME = 'bim_ootb_imports';
  const IMPORT_STORE = 'buildings';
  const IMPORT_DB_VERSION = 2;  // S224: versioned storage model

  // ── IndexedDB for imported buildings (v2: versioned) ──
  function openImportDB() {
    return new Promise((resolve) => {
      const req = indexedDB.open(IMPORT_DB_NAME, IMPORT_DB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = req.result;
        if (!db.objectStoreNames.contains(IMPORT_STORE)) {
          db.createObjectStore(IMPORT_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  function saveImport(key, value) {
    return openImportDB().then(db => {
      if (!db) return;
      return new Promise((resolve) => {
        const tx = db.transaction(IMPORT_STORE, 'readwrite');
        tx.objectStore(IMPORT_STORE).put(value, key);
        tx.oncomplete = () => resolve();
      });
    });
  }

  function getImport(key) {
    return openImportDB().then(db => {
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(IMPORT_STORE, 'readonly');
        const req = tx.objectStore(IMPORT_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    });
  }

  function deleteImport(key) {
    return openImportDB().then(db => {
      if (!db) return;
      return new Promise((resolve) => {
        const tx = db.transaction(IMPORT_STORE, 'readwrite');
        tx.objectStore(IMPORT_STORE).delete(key);
        tx.oncomplete = () => resolve();
      });
    });
  }

  function listImports() {
    return openImportDB().then(db => {
      if (!db) return [];
      return new Promise((resolve) => {
        const tx = db.transaction(IMPORT_STORE, 'readonly');
        const store = tx.objectStore(IMPORT_STORE);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          const keys = req.result;
          if (keys.length === 0) { resolve([]); return; }
          const items = [];
          let done = 0;
          for (const key of keys) {
            const r2 = store.get(key);
            r2.onsuccess = () => {
              items.push({ key, meta: r2.result ? r2.result.meta : null });
              done++;
              if (done === keys.length) resolve(items);
            };
            r2.onerror = () => { done++; if (done === keys.length) resolve(items); };
          }
        };
        req.onerror = () => resolve([]);
      });
    });
  }

  // ── S260b: Download split DBs when present ──
  function _downloadSplitDBs(dbs, buildingName) {
    if (!dbs.metaDb || !dbs.geoDb) return;
    var baseName = buildingName.replace(/\.(ifc|dae|obj|glb|gltf|3ds|fbx|stl)$/i, '');
    // meta DB download
    var metaBlob = new Blob([dbs.metaDb], { type: 'application/octet-stream' });
    var metaLink = document.createElement('a');
    metaLink.href = URL.createObjectURL(metaBlob);
    metaLink.download = baseName + '_meta.db';
    metaLink.click();
    URL.revokeObjectURL(metaLink.href);
    // geo DB download
    var geoBlob = new Blob([dbs.geoDb], { type: 'application/octet-stream' });
    var geoLink = document.createElement('a');
    geoLink.href = URL.createObjectURL(geoBlob);
    geoLink.download = baseName + '_geo.db';
    geoLink.click();
    URL.revokeObjectURL(geoLink.href);
    console.log('[S260b] §SPLIT_DOWNLOAD meta=' + baseName + '_meta.db (' +
      (dbs.metaDb.byteLength / 1024).toFixed(0) + 'KB) geo=' + baseName + '_geo.db (' +
      (dbs.geoDb.byteLength / 1024).toFixed(0) + 'KB)');
  }

  // ── Process IFC file ──
  A.importIFC = async function(file) {
    const status = document.getElementById('import-status');
    const progressBar = document.getElementById('import-progress-bar');
    const importZone = document.getElementById('import-zone');
    if (status) status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_reading_file||'Reading file...';
    if (progressBar) { progressBar.style.width = '0%'; progressBar.parentElement.style.display = 'block'; }

    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    if (file.size > 200 * 1024 * 1024) {
      if (status) status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_large_file||'Very large file ({n}MB) \u2014 may take a few minutes').replace('{n}', sizeMB);
    } else if (file.size > 50 * 1024 * 1024) {
      if (status) status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_med_file||'Large file ({n}MB) \u2014 please wait...').replace('{n}', sizeMB);
    }

    const arrayBuffer = await file.arrayBuffer();
    console.log('[S220] §IMPORT_START file=' + file.name + ' size=' + sizeMB + 'MB');

    return new Promise((resolve, reject) => {
      const workerUrl = new URL('import_worker.js?v=8', location.href).href;
      const worker = new Worker(workerUrl);

      worker.onmessage = async function(e) {
        const msg = e.data;
        if (msg.type === 'progress') {
          if (status) status.textContent = msg.phase;
          if (progressBar) progressBar.style.width = msg.pct + '%';
          return;
        }
        if (msg.type === 'error') {
          console.log('[S220] §IMPORT_ERROR ' + msg.message);
          if (status) status.textContent = 'Import failed: ' + msg.message;
          if (progressBar) { progressBar.style.background = '#cc4444'; }
          if (A.reportError) A.reportError(new Error('IFC import failed: ' + msg.message));
          worker.terminate();
          reject(new Error(msg.message));
          return;
        }
        if (msg.type === 'done') {
          if (status) status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_building_dbs||'Building databases...';
          console.log('[S220] §IMPORT_PARSED elements=' + msg.meta.elementCount + ' geom=' + msg.meta.geomCount);

          // Build sql.js DBs on main thread (sql.js already loaded)
          try {
            const SQL = await initSqlJs({ locateFile: f => 'lib/' + f });
            const dbs = buildImportDBs(SQL, msg);

            // Save to IndexedDB. S224: when split (meta+geo) exists, store ONLY the split.
            // Storing the full monolith too duplicates the same ~656MB and overflows
            // IndexedDB's ~1GB structured-clone limit (§MULTI_DB_ERROR). Open path loads
            // meta as primary, so the monolith is redundant. Monolith kept only when no split.
            const _recSplit = dbs.metaDb && dbs.geoDb;
            const record = { meta: msg.meta };
            if (_recSplit) {
              record.metaDb = dbs.metaDb;
              record.geoDb = dbs.geoDb;
            } else {
              record.extractedDb = dbs.extractedDb;
              record.libraryDb = dbs.extractedDb;  // same buffer — viewer reads libDb from here
            }
            console.log('[S224] §STORE_RECORD key=' + file.name + ' split=' + !!_recSplit + ' MB=' + ((_recSplit ? dbs.metaDb.byteLength + dbs.geoDb.byteLength : dbs.extractedDb.byteLength) / 1048576).toFixed(1));
            await saveImport(file.name, record);

            // S260b: Download split DBs for large buildings
            _downloadSplitDBs(dbs, file.name);

            console.log('[S220] §IMPORT_SAVED key=' + file.name +
              ' db=' + (dbs.extractedDb.byteLength / 1024).toFixed(0) + 'KB');

            // Notify parent window (iDempiere BIM Tab) of successful import
            if (window.parent !== window) {
              window.parent.postMessage({
                type: 'BIM_IFC_LOADED',
                name: file.name,
                elementCount: msg.meta.elementCount || 0
              }, '*');
            }

            if (status) status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_imported||'Imported {n} elements').replace('{n}', msg.meta.elementCount);
            if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#44cc44'; }

            // Refresh card list
            if (A.renderImportCards) A.renderImportCards();

            worker.terminate();
            resolve(record);
          } catch(dbErr) {
            console.log('[S220] §IMPORT_DB_ERROR ' + dbErr.message);
            if (status) status.textContent = 'DB build failed: ' + dbErr.message;
            worker.terminate();
            reject(dbErr);
          }
        }
      };

      worker.onerror = function(err) {
        console.log('[S220] §IMPORT_WORKER_ERROR ' + err.message);
        if (status) status.textContent = 'Worker error: ' + err.message;
        worker.terminate();
        reject(err);
      };

      // §S284d: transfer the wasm bytes so the worker never fetches the binary itself.
      _getWebIfcWasmBytes().then(function(wasmBytes){
        worker.postMessage({ arrayBuffer, filename: file.name, wasmBytes: wasmBytes }, [arrayBuffer]);
      }).catch(function(engineErr){
        if (status) status.textContent = engineErr.message;
        if (progressBar) progressBar.style.background = '#cc4444';
        worker.terminate(); reject(engineErr);
      });
    });
  };

  // ── Multi-IFC merge: process N files sequentially, merge into one building DB ──
  A.importMultiIFC = async function(files) {
    const status = document.getElementById('import-status');
    const progressBar = document.getElementById('import-progress-bar');
    if (progressBar) { progressBar.style.width = '0%'; progressBar.parentElement.style.display = 'block'; }

    // Derive building name from common prefix: LTU_AHouse_ARC.ifc + LTU_AHouse_STR.ifc → LTU_AHouse
    var stems = [];
    for (var i = 0; i < files.length; i++) {
      stems.push(files[i].name.replace(/\.(ifc|IFC)$/, ''));
    }
    var buildingName = _commonPrefix(stems).replace(/[_\-]+$/, '') || stems[0];

    console.log('[S220] §MULTI_IMPORT_START files=' + files.length + ' building=' + buildingName +
      ' names=' + Array.from(files).map(function(f) { return f.name; }).join(','));
    if (status) status.textContent = 'Merging ' + files.length + ' IFC files → ' + buildingName + '...';

    // Process each file sequentially — accumulate results
    var allElements = [], allGeometries = [], allTransforms = [];
    var allDiscs = {}, allStoreys = new Set();
    var totalElements = 0;

    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi];
      var fileLabel = (fi + 1) + '/' + files.length + ': ' + file.name;
      if (status) status.textContent = 'Parsing ' + fileLabel;
      console.log('[S220] §MULTI_FILE_START ' + fileLabel);

      try {
        var result = await _parseOneIFC(file, function(pct, phase) {
          // Scale progress: each file gets an equal slice
          var filePct = (fi / files.length + pct / 100 / files.length) * 90;
          if (progressBar) progressBar.style.width = filePct.toFixed(1) + '%';
          if (status) status.textContent = fileLabel + ' — ' + phase;
        });

        allElements = allElements.concat(result.elements);
        allGeometries = allGeometries.concat(result.geometries);
        allTransforms = allTransforms.concat(result.transforms);
        totalElements += result.meta.elementCount;
        for (var d in result.meta.disciplines) {
          allDiscs[d] = (allDiscs[d] || 0) + result.meta.disciplines[d];
        }
        result.meta.storeys.forEach(function(s) { allStoreys.add(s); });

        console.log('[S220] §MULTI_FILE_DONE ' + fileLabel +
          ' elements=' + result.meta.elementCount + ' geom=' + result.meta.geomCount);
      } catch (err) {
        console.log('[S220] §MULTI_FILE_ERROR ' + fileLabel + ' err=' + err.message);
        if (status) status.textContent = 'Failed: ' + fileLabel + ' — ' + err.message;
        if (progressBar) progressBar.style.background = '#cc4444';
        return;
      }
    }

    // Merge: build single DB from accumulated data
    if (status) status.textContent = 'Building merged database (' + totalElements + ' elements)...';
    if (progressBar) progressBar.style.width = '92%';

    try {
      var SQL = await initSqlJs({ locateFile: function(f) { return 'lib/' + f; } });
      var mergedData = {
        meta: {
          name: buildingName,
          filename: buildingName,
          elementCount: totalElements,
          geomCount: allGeometries.length,
          disciplines: allDiscs,
          storeys: Array.from(allStoreys).sort(),
        },
        elements: allElements,
        geometries: allGeometries,
        transforms: allTransforms,
      };
      var dbs = buildImportDBs(SQL, mergedData);

      // S224: split present → store split only (monolith would overflow IDB ~1GB limit)
      var _recSplit = dbs.metaDb && dbs.geoDb;
      var record = { meta: mergedData.meta };
      if (_recSplit) {
        record.metaDb = dbs.metaDb;
        record.geoDb = dbs.geoDb;
      } else {
        record.extractedDb = dbs.extractedDb;
        record.libraryDb = dbs.extractedDb;
      }
      var key = buildingName + '.ifc';
      console.log('[S224] §STORE_RECORD key=' + key + ' split=' + !!_recSplit + ' MB=' + ((_recSplit ? dbs.metaDb.byteLength + dbs.geoDb.byteLength : dbs.extractedDb.byteLength) / 1048576).toFixed(1));
      await saveImport(key, record);

      // S260b: Download split DBs for large merged buildings
      _downloadSplitDBs(dbs, buildingName);

      console.log('[S220] §MULTI_IMPORT_DONE building=' + buildingName +
        ' elements=' + totalElements + ' files=' + files.length +
        ' discs=' + Object.keys(allDiscs).join(',') +
        ' db=' + (dbs.extractedDb.byteLength / 1024).toFixed(0) + 'KB');

      if (status) status.textContent = 'Merged ' + files.length + ' files → ' + totalElements + ' elements';
      if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#44cc44'; }

      if (A.renderImportCards) A.renderImportCards();
    } catch (dbErr) {
      console.log('[S220] §MULTI_DB_ERROR ' + dbErr.message);
      if (status) status.textContent = 'DB merge failed: ' + dbErr.message;
      if (progressBar) progressBar.style.background = '#cc4444';
    }
  };

  // Parse one IFC file via worker — returns promise with raw data
  function _parseOneIFC(file, onProgress) {
    return new Promise(function(resolve, reject) {
      file.arrayBuffer().then(function(arrayBuffer) {
        var worker = new Worker(new URL('import_worker.js?v=8', location.href).href);
        worker.onmessage = function(e) {
          var msg = e.data;
          if (msg.type === 'progress') {
            if (onProgress) onProgress(msg.pct, msg.phase);
            return;
          }
          if (msg.type === 'error') {
            worker.terminate();
            reject(new Error(msg.message));
            return;
          }
          if (msg.type === 'done') {
            worker.terminate();
            resolve(msg);
          }
        };
        worker.onerror = function(err) {
          worker.terminate();
          reject(err);
        };
        // §S284d: transfer the wasm bytes so the worker never fetches the binary itself.
        _getWebIfcWasmBytes().then(function(wasmBytes){
          worker.postMessage({ arrayBuffer: arrayBuffer, filename: file.name, wasmBytes: wasmBytes }, [arrayBuffer]);
        }).catch(function(engineErr){ worker.terminate(); reject(engineErr); });
      });
    });
  }

  // Find common prefix of an array of strings
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

  // ── Process mesh file (DAE/OBJ/GLB/3DS/FBX/STL) — S228 ──
  A.importMesh = async function(file, ext) {
    var status = document.getElementById('import-status');
    var progressBar = document.getElementById('import-progress-bar');
    if (status) status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_reading_fmt||'Reading {fmt} file...').replace('{fmt}', ext.toUpperCase());
    if (progressBar) { progressBar.style.width = '0%'; progressBar.parentElement.style.display = 'block'; }

    var sizeMB = (file.size / 1024 / 1024).toFixed(1);
    console.log('[S228] §MESH_IMPORT_START file=' + file.name + ' ext=' + ext + ' size=' + sizeMB + 'MB');

    var arrayBuffer = await file.arrayBuffer();

    return new Promise(function(resolve, reject) {
      var workerUrl = new URL('mesh_import_worker.js?v=1', location.href).href;
      var worker = new Worker(workerUrl);

      worker.onmessage = async function(e) {
        var msg = e.data;
        if (msg.type === 'progress') {
          if (status) status.textContent = msg.phase;
          if (progressBar) progressBar.style.width = msg.pct + '%';
          return;
        }
        if (msg.type === 'error') {
          console.log('[S228] §MESH_IMPORT_ERROR ' + msg.message);
          if (status) status.textContent = 'Import failed: ' + msg.message;
          if (progressBar) progressBar.style.background = '#cc4444';
          worker.terminate();
          reject(new Error(msg.message));
          return;
        }
        if (msg.type === 'done') {
          if (status) status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_building_dbs||'Building databases...';
          console.log('[S228] §MESH_PARSED elements=' + msg.meta.elementCount +
            ' geom=' + msg.meta.geomCount + ' format=' + msg.meta.sourceFormat);

          try {
            var SQL = await initSqlJs({ locateFile: function(f) { return 'lib/' + f; } });
            var dbs = buildImportDBs(SQL, msg);

            // S224: split present → store split only (monolith would overflow IDB ~1GB limit)
            var _recSplit = dbs.metaDb && dbs.geoDb;
            var record = { meta: msg.meta };
            if (_recSplit) {
              record.metaDb = dbs.metaDb;
              record.geoDb = dbs.geoDb;
            } else {
              record.extractedDb = dbs.extractedDb;
              record.libraryDb = dbs.extractedDb;
            }
            console.log('[S224] §STORE_RECORD key=' + file.name + ' split=' + !!_recSplit + ' MB=' + ((_recSplit ? dbs.metaDb.byteLength + dbs.geoDb.byteLength : dbs.extractedDb.byteLength) / 1048576).toFixed(1));
            await saveImport(file.name, record);

            // S260b: Download split DBs for large mesh imports
            _downloadSplitDBs(dbs, file.name);

            console.log('[S228] §MESH_SAVED key=' + file.name +
              ' db=' + (dbs.extractedDb.byteLength / 1024).toFixed(0) + 'KB');

            // Notify parent window (iDempiere BIM Tab) of successful import
            if (window.parent !== window) {
              window.parent.postMessage({
                type: 'BIM_IFC_LOADED',
                name: file.name,
                elementCount: msg.meta.elementCount || 0
              }, '*');
            }

            if (status) status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_imported_fmt||'Imported {n} elements from {fmt}').replace('{n}', msg.meta.elementCount).replace('{fmt}', ext.toUpperCase());
            if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#44cc44'; }
            if (A.renderImportCards) A.renderImportCards();

            worker.terminate();
            resolve(record);
          } catch(dbErr) {
            console.log('[S228] §MESH_DB_ERROR ' + dbErr.message);
            if (status) status.textContent = 'DB build failed: ' + dbErr.message;
            worker.terminate();
            reject(dbErr);
          }
        }
      };

      worker.onerror = function(err) {
        console.log('[S228] §MESH_WORKER_ERROR ' + err.message);
        if (status) status.textContent = 'Worker error: ' + err.message;
        worker.terminate();
        reject(err);
      };

      worker.postMessage({ arrayBuffer: arrayBuffer, filename: file.name, ext: ext }, [arrayBuffer]);
    });
  };

  // ── Open imported building in viewer (S224: versioned) ──
  A.openImported = async function(key) {
    console.log('[S274] §OPEN_IMPORTED key=' + key + ' sw=v517');
    const record = await getImport(key);
    if (!record) { alert('Building not found in storage'); return; }

    // S224: handle versioned format
    var dbBuf;
    if (record.versions && record.versions.length > 0) {
      dbBuf = record.versions[record.latestVersion || 0].db;
    } else {
      dbBuf = record.extractedDb;  // legacy v1 format
    }
    // S224: split-only records have no monolith dbBuf — that is valid (open path uses meta+geo).
    if (!dbBuf && !(record.metaDb && record.geoDb)) { alert('No DB data in storage'); return; }

    const cacheDb = await A.openCacheDB();
    if (cacheDb) {
      // §S274: Use split DBs if available — meta (15MB) loads instantly, geo (200MB) streams on demand.
      // Falls back to monolith for legacy imports that don't have split DBs.
      var hasSplit = record.metaDb && record.geoDb;
      var importDbUrl, importLibUrl;

      if (hasSplit) {
        // Store split DBs — viewer's split-DB detection in streaming.js picks these up
        importDbUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_extracted.db');
        importLibUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_extracted.db');
        var metaUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_meta.db');
        var geoUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_geo.db');
        await new Promise(resolve => {
          var tx = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
          var store = tx.objectStore(A.CACHE_STORE);
          store.put(record.metaDb, metaUrl);
          store.put(record.geoDb, geoUrl);
          store.put(record.metaDb, importDbUrl);   // meta as primary — fast load
          store.put(record.metaDb, importLibUrl);
          tx.oncomplete = resolve;
        });
        console.log('[S274] §IMPORT_OPEN_SPLIT meta=' + (record.metaDb.byteLength/1024/1024).toFixed(1) + 'MB geo=' + (record.geoDb.byteLength/1024/1024).toFixed(1) + 'MB');
      } else {
        importDbUrl = 'import://' + key + '/extracted';
        importLibUrl = 'import://' + key + '/library';
        await new Promise(resolve => {
          var tx = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
          tx.objectStore(A.CACHE_STORE).put(dbBuf, importDbUrl);
          tx.objectStore(A.CACHE_STORE).put(dbBuf, importLibUrl);
          tx.oncomplete = resolve;
        });
        console.log('[S274] §IMPORT_OPEN_MONOLITH size=' + (dbBuf.byteLength/1024/1024).toFixed(1) + 'MB (no split DBs)');
      }

      const viewerBase = location.href.replace(/[^/]*$/, '');
      const viewerUrl = viewerBase + 'viewer.html?db=' +
        encodeURIComponent(importDbUrl) + '&lib=' + encodeURIComponent(importLibUrl);
      window.open(viewerUrl, '_blank');
    }
  };

  // ── Delete imported building ──
  A.deleteImported = async function(key) {
    await deleteImport(key);
    if (A.renderImportCards) A.renderImportCards();
    console.log('[S220] §IMPORT_DELETE key=' + key);
  };

  // ── S250 §8: Share Sheet — lazy-loaded from share.js ──
  // Zero bytes on initial fetch. Script loads only when user clicks Share.
  // Unified: Save as IFC / Save as DB / Contribute to OOTB + WhatsApp / Email / Copy Link.
  // See docs/EnterpriseAuthentication.md for security architecture.
  A._getImport = getImport;  // Expose for share.js
  A.openShareSheet = async function(key) {
    if (!A._shareLoaded) {
      var script = document.createElement('script');
      script.src = 'share.js?v=2';
      script.onload = function() { A._shareLoaded = true; A.openShareSheet(key); };
      script.onerror = function() { alert('Failed to load share module'); };
      document.head.appendChild(script);
      return;
    }
    console.log('§SHARE stub — should not reach here after load');
  };

  // ── Render import cards (for landing page) ──
  A.renderImportCards = async function() {
    const container = document.getElementById('my-buildings-grid');
    const section = document.getElementById('my-buildings-section');
    if (!container || !section) return;

    const imports = await listImports();
    if (imports.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    container.innerHTML = '';

    const DISC_COLORS = {
      ARC: '#4488ff', STR: '#44cccc', MEP: '#44cc44',
      ELEC: '#cccc44', FP: '#cc8844', ACMV: '#cc4444',
      PLB: '#8844cc',
    };

    for (const item of imports) {
      // S224: handle versioned format — item.meta may be from versioned record
      var meta = item.meta;
      if (!meta) continue;
      const card = document.createElement('div');
      card.className = 'card';
      const discs = meta.disciplines || {};
      const total = meta.elementCount || 0;
      const discBars = Object.entries(discs).map(([d, c]) => {
        const pct = Math.max(3, (c / total) * 100);
        const color = DISC_COLORS[d] || '#888';
        return '<span class="disc-bar" style="width:' + pct + '%;background:' + color + '" title="' + d + ': ' + c + '"></span>';
      }).join('');

      var displayName = (item.meta.filename || item.meta.name || '').replace(/\.(ifc|dae|obj|glb|gltf|3ds|fbx|stl)$/i, '');
      var formatBadge = (meta.sourceFormat && meta.sourceFormat !== '.ifc')
        ? ' <span style="background:rgba(79,195,247,0.15);padding:2px 6px;border-radius:4px;font-size:11px">'
          + meta.sourceFormat.toUpperCase().replace('.','') + '</span>'
        : '';
      card.innerHTML =
        '<div class="name">' + displayName + formatBadge + '</div>' +
        '<div class="meta">' +
          '<b>' + total.toLocaleString() + '</b> elements' +
          ' · ' + Object.keys(discs).join(', ') +
        '</div>' +
        '<div class="disc-bars">' + discBars + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:10px">' +
          '<button class="open-btn" style="flex:1" data-key="' + item.key + '">Open</button>' +
          '<button class="open-btn" data-share="' + item.key + '" style="flex:0;padding:6px 10px;background:rgba(76,175,80,0.15);border-color:rgba(76,175,80,0.3);color:#4caf50;font-size:10px">Share</button>' +
          '<button class="open-btn" style="flex:0;padding:6px 10px;background:rgba(204,68,68,0.15);border-color:rgba(204,68,68,0.3);color:#cc4444" data-del="' + item.key + '">x</button>' +
        '</div>';

      card.querySelector('[data-key]').onclick = function() { A.openImported(this.dataset.key); };
      card.querySelector('[data-share]').onclick = function(e) { e.stopPropagation(); A.openShareSheet(this.dataset.share); };
      card.querySelector('[data-del]').onclick = function(e) {
        e.stopPropagation();
        if (confirm('Delete ' + item.meta.name + '?')) A.deleteImported(this.dataset.del);
      };
      container.appendChild(card);
    }
  };

  // ── S229: Export IFC from IndexedDB ──
  A.exportIFC = async function(key) {
    var record = await getImport(key);
    if (!record) { alert('Building not found'); return; }

    // S233: Read versioned DB (wizard-modified), not legacy v1
    var dbBuf;
    if (record.versions && record.versions.length > 0) {
      dbBuf = record.versions[record.latestVersion || 0].db;
    } else {
      dbBuf = record.extractedDb;
    }
    if (!dbBuf) { alert('No DB data'); return; }

    // Load sql.js if needed
    var SQL = await initSqlJs({ locateFile: function(f) { return 'lib/' + f; } });
    var db = new SQL.Database(new Uint8Array(dbBuf));

    var elements = [], transforms = [], geometries = [];
    var meta = { buildingName: key.replace(/\.(ifc|obj|stl|dae|glb|gltf|3ds|fbx)$/i, '') };

    try {
      var pmRows = db.exec("SELECT key, value FROM project_metadata");
      if (pmRows.length > 0) {
        for (var r = 0; r < pmRows[0].values.length; r++) {
          if (pmRows[0].values[r][0] === 'building_name') meta.buildingName = pmRows[0].values[r][1];
          if (pmRows[0].values[r][0] === 'project_name') meta.projectName = pmRows[0].values[r][1];
        }
      }
    } catch(e) {}

    try {
      var elRows = db.exec("SELECT guid, ifc_class, element_name, storey, discipline, material_rgba FROM elements_meta");
      if (elRows.length > 0) {
        for (var r = 0; r < elRows[0].values.length; r++) {
          var row = elRows[0].values[r];
          elements.push({ guid: row[0], ifcClass: row[1], name: row[2], storey: row[3], discipline: row[4], material: row[5] });
        }
      }
    } catch(e) { alert('Error reading elements: ' + e.message); return; }

    try {
      var txRows = db.exec("SELECT guid, center_x, center_y, center_z FROM element_transforms");
      if (txRows.length > 0) {
        for (var r = 0; r < txRows[0].values.length; r++) {
          var row = txRows[0].values[r];
          transforms.push({ guid: row[0], cx: row[1], cy: row[2], cz: row[3] });
        }
      }
    } catch(e) {}

    try {
      var geoRows = db.exec("SELECT ei.guid, cg.vertices, cg.faces FROM element_instances ei JOIN component_geometries cg ON ei.geometry_hash = cg.geometry_hash");
      if (geoRows.length > 0) {
        for (var r = 0; r < geoRows[0].values.length; r++) {
          var row = geoRows[0].values[r];
          geometries.push({ guid: row[0], vertices: row[1], faces: row[2] });
        }
      }
    } catch(e) {}

    db.close();

    var status = document.getElementById('import-status');
    if (status) status.textContent = 'Exporting IFC (' + elements.length + ' elements)...';

    var worker = new Worker(new URL('ifc_export_worker.js?v=1', location.href).href);
    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.type === 'progress') {
        if (status) status.textContent = msg.phase;
        return;
      }
      if (msg.type === 'error') {
        if (status) status.textContent = 'Export failed: ' + msg.message;
        worker.terminate();
        return;
      }
      if (msg.type === 'done') {
        var blob = new Blob([msg.ifcData], { type: 'application/octet-stream' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = meta.buildingName + '.ifc';
        a.click();
        URL.revokeObjectURL(a.href);
        if (status) status.textContent = 'Downloaded ' + meta.buildingName + '.ifc (' + (msg.ifcData.byteLength / 1024).toFixed(0) + ' KB)';
        console.log('[S229] §EXPORT_IFC key=' + key + ' size=' + (msg.ifcData.byteLength / 1024).toFixed(0) + 'KB');
        worker.terminate();
      }
    };
    worker.onerror = function(err) {
      if (status) status.textContent = 'Export error: ' + err.message;
      worker.terminate();
    };
    worker.postMessage({ elements: elements, transforms: transforms, geometries: geometries, meta: meta });
  };

  // ── Wire up drop zone + file picker ──
  const dropZone = document.getElementById('import-zone');
  const fileInput = document.getElementById('import-file-input');

  if (dropZone) {
    // Drag and drop (desktop)
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = '#4fc3f7';
      dropZone.style.background = 'rgba(79,195,247,0.1)';
    });
    dropZone.addEventListener('dragleave', function() {
      dropZone.style.borderColor = 'rgba(79,195,247,0.3)';
      dropZone.style.background = 'rgba(79,195,247,0.04)';
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(79,195,247,0.3)';
      dropZone.style.background = 'rgba(79,195,247,0.04)';
      var files = e.dataTransfer.files;
      if (!files.length) return;
      // Multi-IFC merge: if 2+ IFC files dropped, merge into one building
      var ifcFiles = [];
      for (var fi = 0; fi < files.length; fi++) {
        if (detectFormat(files[fi].name).route === 'ifc') ifcFiles.push(files[fi]);
      }
      if (ifcFiles.length > 1) {
        A.importMultiIFC(ifcFiles);
      } else if (ifcFiles.length === 1) {
        A.importIFC(ifcFiles[0]);
      } else {
        // Single non-IFC file
        var file = files[0];
        var fmt = detectFormat(file.name);
        if (fmt.route === 'mesh') {
          A.importMesh(file, fmt.ext);
        } else {
          document.getElementById('import-status').textContent =
            (typeof _TRL!=='undefined'&&_TRL.ui_unsupported||'Unsupported: .{ext} \u2014 Accepted: IFC, DAE, OBJ, GLB, 3DS, FBX, STL').replace('{ext}', fmt.ext);
        }
      }
    });

    // Click to browse (phone + desktop)
    dropZone.addEventListener('click', function() {
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    // S228: accept multi-format. multiple=true for multi-discipline merge.
    fileInput.accept = '.ifc,.dae,.obj,.glb,.gltf,.3ds,.fbx,.stl';
    fileInput.multiple = true;
    fileInput.addEventListener('change', function() {
      var files = fileInput.files;
      if (!files.length) return;
      // Multi-IFC merge
      var ifcFiles = [];
      for (var fi = 0; fi < files.length; fi++) {
        if (detectFormat(files[fi].name).route === 'ifc') ifcFiles.push(files[fi]);
      }
      if (ifcFiles.length > 1) {
        A.importMultiIFC(ifcFiles);
        return;
      }
      var file = files[0];
      if (file) {
        var fmt = detectFormat(file.name);
        if (fmt.route === 'ifc') {
          A.importIFC(file);
        } else if (fmt.route === 'mesh') {
          A.importMesh(file, fmt.ext);
        }
      }
      fileInput.value = '';
    });
  }

  // Render existing imports on load
  A.renderImportCards();
}
