// import_own.js — drop-own-IFC for the Matrix hub (index2 ONLY).
// VERBATIM EXTRACT from index.html (the live landing) — non-invent. S224 merge prompt removed
// per MORPHEUS_PLATE_REBUILD.md (always new project → auto-open viewer). Loaded after import_db_builder.js.
var _base = '';            // GH Pages = same-origin root (index.html _ociMatch → '')
function trackTab(){}      // landing tab-tracker not present on the plate — no-op

// ── discipline-from-filename ──
var _VALID_DISCS = ['ARC','STR','MEP','PLB','ACMV','ELEC','FP','VENT','HEAT','SAN','COOL','VOID'];
var _DISC_ALIAS = {
  // Short forms from real-world IFC filenames
  ELE:'ELEC', ELECTRICAL:'ELEC',
  FIRE:'FP', SPR:'FP', SPRINKLER:'FP',
  AIR:'ACMV', DUCT:'ACMV', HVAC:'ACMV', MECH:'ACMV', MECHANICAL:'ACMV',
  ARCHITECTURAL:'ARC', STRUCTURAL:'STR', PLUMBING:'PLB',
};
function _discFromFilename(fname) {
  var stem = fname.replace(/\.(ifc|obj|stl|dae|glb|gltf|3ds|fbx)$/i, '');
  var parts = stem.split(/[_\-]/);
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i].toUpperCase();
    if (_VALID_DISCS.indexOf(p) >= 0) return p;
    if (_DISC_ALIAS[p]) return _DISC_ALIAS[p];
  }
  return null;
}

// ── versioned import IDB + cache IDB ──
const IMPORT_DB_NAME = 'bim_ootb_imports';
const IMPORT_STORE = 'buildings';
const IMPORT_DB_VERSION = 2;  // v2: versioned storage model
function openImportDB() {
  return new Promise(resolve => {
    const req = indexedDB.open(IMPORT_DB_NAME, IMPORT_DB_VERSION);
    req.onupgradeneeded = function(e) {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMPORT_STORE)) {
        db.createObjectStore(IMPORT_STORE);
      }
      // Migrate v1 → v2: wrap old per-file records into versioned format
      if (e.oldVersion < 2) {
        const tx = req.transaction;
        const store = tx.objectStore(IMPORT_STORE);
        const getAll = store.getAllKeys();
        getAll.onsuccess = function() {
          const keys = getAll.result;
          for (const key of keys) {
            const gr = store.get(key);
            gr.onsuccess = function() {
              const old = gr.result;
              if (old && !old.versions) {
                // Old format: { meta, extractedDb, libraryDb } → new: { meta, versions[], latestVersion }
                const migrated = {
                  meta: old.meta,
                  versions: [{ key: key, importDate: new Date().toISOString(), db: old.extractedDb }],
                  latestVersion: 0
                };
                store.put(migrated, key);
                console.log('[S224] §MIGRATE_V1 key=' + key);
              }
            };
          }
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

const CACHE_DB_NAME = 'bim_ootb_cache';
const CACHE_STORE = 'dbs';
function openCacheDB() {
  return new Promise(resolve => {
    const req = indexedDB.open(CACHE_DB_NAME, 2);
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
      if (!db.objectStoreNames.contains('timestamps')) db.createObjectStore('timestamps');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
// Get a single project record
async function getProject(key) {
  const db = await openImportDB();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(IMPORT_STORE, 'readonly');
    const req = tx.objectStore(IMPORT_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

// Save a project record
async function saveProject(key, record) {
  const db = await openImportDB();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(IMPORT_STORE, 'readwrite');
    tx.objectStore(IMPORT_STORE).put(record, key);
    tx.oncomplete = resolve;
  });
}
// Open latest version of a project in viewer
// opts: { wizard: true } to launch classification wizard in viewer
async function openProject(key, btnEl, opts) {
  if (btnEl) { btnEl.textContent = 'Opening...'; btnEl.disabled = true; }

  // §S274: Check cache store FIRST (lightweight key check, no 760MB record read).
  // If split-DB was pre-populated during import, skip reading the heavy project record entirely.
  const cacheDb = await openCacheDB();
  var dbUrl, libUrl;
  var _splitUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_extracted.db');
  var _geoUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_geo.db');

  // IDB getKey() doesn't exist everywhere — use count() to check presence without loading data
  var _hasCachedGeo = false;
  if (cacheDb) {
    _hasCachedGeo = await new Promise(function(resolve) {
      var tx = cacheDb.transaction(CACHE_STORE, 'readonly');
      var req = tx.objectStore(CACHE_STORE).count(IDBKeyRange.only(_geoUrl));
      req.onsuccess = function() { resolve(req.result > 0); };
      req.onerror = function() { resolve(false); };
    });
  }

  if (_hasCachedGeo) {
    // Fast path — cache already populated during import. Just open.
    dbUrl = _splitUrl;
    libUrl = _splitUrl;
    console.log('[S274] §OPEN_PROJECT_INSTANT key=' + key + ' (cache pre-populated)');
  } else {
    // Slow path — read full record for legacy imports or monolith fallback
    var record = await getProject(key);
    if (!record || !record.versions.length) {
      alert('Building not found');
      if (btnEl) { btnEl.textContent = 'Open'; btnEl.disabled = false; }
      return;
    }
    var base = record.versions[0];
    if (!cacheDb) { if (btnEl) { btnEl.textContent = 'Open'; btnEl.disabled = false; } return; }

    if (record.metaDb && record.geoDb) {
      // Split-DB but cache not populated — legacy import, populate now
      dbUrl = _splitUrl;
      libUrl = _splitUrl;
      var _metaUrl = 'import://' + key + '/' + key.replace(/\.ifc$/i, '_meta.db');
      await new Promise(function(resolve) {
        var tx = cacheDb.transaction(CACHE_STORE, 'readwrite');
        var store = tx.objectStore(CACHE_STORE);
        store.put(record.metaDb, _metaUrl);
        store.put(record.metaDb, dbUrl);
        store.put(record.geoDb, _geoUrl);
        tx.oncomplete = resolve;
      });
      console.log('[S274] §OPEN_PROJECT_CACHE_FILL key=' + key + ' (legacy, populating cache)');
    } else {
      // Monolith — no split DBs available
      dbUrl = 'import://' + key + '/v0';
      libUrl = dbUrl;
      await new Promise(resolve => {
        var tx = cacheDb.transaction(CACHE_STORE, 'readwrite');
        tx.objectStore(CACHE_STORE).put(base.db, dbUrl);
        tx.objectStore(CACHE_STORE).put(base.db, libUrl);
        tx.oncomplete = resolve;
      });
      console.log('[S274] §OPEN_PROJECT_MONOLITH key=' + key + ' size=' + (base.db.byteLength/1024/1024).toFixed(1) + 'MB');
    }
  }

  // Variance/wizard — only needed on slow path (record already loaded).
  // Fast path skips: IFC imports have no variance or wizard.
  var diffParam = '';
  var wizardParam = '';
  if (typeof record !== 'undefined' && record) {
    if (record.versions && record.versions.length > 1) {
      for (var vi = 1; vi < record.versions.length; vi++) {
        if (/revised/i.test(record.versions[vi].key || '')) {
          var revUrl = 'import://' + key + '/v' + vi;
          await new Promise(resolve => {
            var tx2 = cacheDb.transaction(CACHE_STORE, 'readwrite');
            tx2.objectStore(CACHE_STORE).put(record.versions[vi].db, revUrl);
            tx2.oncomplete = resolve;
          });
          diffParam = '&diffdb=' + encodeURIComponent(revUrl);
          console.log('[S225] §OPEN_DIFF key=' + key + ' base=v0(combined) diff=v' + vi + '(revised)');
          break;
        }
      }
    }
    var isMesh = record.meta && record.meta.sourceFormat && record.meta.sourceFormat !== '.ifc';
    var wizardDone = record.meta && record.meta.wizard_complete;
    if (((opts && opts.wizard) || isMesh) && !wizardDone) {
      wizardParam = '&wizard=1&wizardKey=' + encodeURIComponent(key);
    }
  }

  var viewerUrl = (_base || '') + 'viewer/viewer.html?db=' +
    encodeURIComponent(dbUrl) + '&lib=' + encodeURIComponent(libUrl) + diffParam + wizardParam + '&ghost=1';
  var win = window.open(viewerUrl, '_blank');
  // Popup blocker kills a window.open fired long after the gesture (import = ~15s of async parse).
  // Card clicks keep their live gesture → new tab; the post-import auto-open falls back to same-tab.
  if (!win) { console.log('§OPEN_POPUP_BLOCKED → same-tab nav key=' + key); location.href = viewerUrl; return; }
  trackTab((record && record.meta && record.meta.name) || key, '3D', win);
  if (btnEl) { btnEl.textContent = 'Open'; btnEl.disabled = false; }
}

// ── format detect + sql.js + web-ifc wasm + worker ──
var LANDING_FORMAT_ROUTES = { ifc:'ifc', dae:'mesh', obj:'mesh', glb:'mesh', gltf:'mesh', '3ds':'mesh', fbx:'mesh', stl:'mesh' };
function detectLandingFormat(filename) {
  var ext = filename.split('.').pop().toLowerCase();
  return { ext: ext, route: LANDING_FORMAT_ROUTES[ext] || null };
}

// §S284c: Get a same-origin resource — network first, then the SW Cache Storage.
// The landing page is root-scoped and NOT controlled by the viewer/ service worker, so an
// offline fetch() rejects; but caches.match() reads the precache directly, working offline.
async function _fetchLocalOrCache(url) {
  try { var r = await fetch(url); if (r && r.ok) return r; } catch (e) {}
  var c = await caches.match(url);
  if (c) { console.log('§SQL_FROM_CACHE ' + url); return c; }
  throw new Error('unavailable offline: ' + url);
}
// §S284c: Load sql.js from LOCAL precached files (no CDN) so DB-build works offline.
// Standalone uses embedded base64 sources; PWA/online uses viewer/lib/ + Cache Storage.
async function _loadSqlJs() {
  if (typeof initSqlJs === 'undefined') {
    if (window._STANDALONE && window._SQL_WASM_JS) {
      // Inject embedded sql-wasm.js
      var fn = new Function(window._SQL_WASM_JS + '\n; window.initSqlJs = initSqlJs;');
      fn();
      console.log('§STANDALONE_SQL inline initSqlJs loaded');
    } else {
      // Load local sql-wasm.js text (network or SW cache), then eval to define initSqlJs
      var jsResp = await _fetchLocalOrCache('viewer/lib/sql-wasm.js');
      var jsText = await jsResp.text();
      (new Function(jsText + '\n; if (typeof initSqlJs !== "undefined") window.initSqlJs = initSqlJs;'))();
      console.log('§SQL_LOCAL initSqlJs loaded from viewer/lib');
    }
  }
  if (window._STANDALONE && window._SQL_WASM_B64) {
    // Decode base64 WASM → ArrayBuffer
    var raw = atob(window._SQL_WASM_B64);
    var buf = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return await initSqlJs({ wasmBinary: buf.buffer });
  }
  // PWA / online: feed the local WASM binary directly (works offline via Cache Storage)
  var wasmResp = await _fetchLocalOrCache('viewer/lib/sql-wasm.wasm');
  var wasmBuf = await wasmResp.arrayBuffer();
  return await initSqlJs({ wasmBinary: wasmBuf });
}
var _IFC_ENGINE_CACHE = 'bim-ifc-engine';
var _IFC_WASM_URL = 'viewer/lib/web-ifc.wasm';
async function _getWebIfcWasm() {
  // 1. Standalone HTML — bytes embedded as base64.
  if (window._WEBIFC_WASM_B64) {
    var raw = atob(window._WEBIFC_WASM_B64);
    var buf = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    console.log('§IFC_WASM_FROM_B64 size=' + buf.length);
    return buf.buffer;
  }
  // 2. Page-owned cache (survives SW purge / version skew) — offline-safe.
  try {
    var pc = await caches.open(_IFC_ENGINE_CACHE);
    var hit = await pc.match(_IFC_WASM_URL);
    if (hit) { console.log('§IFC_WASM_FROM_CACHE page-cache'); return await hit.arrayBuffer(); }
  } catch (e) {}
  // 3. SW Cache Storage (precache) — offline-safe; caches.match reads across all caches.
  try {
    var swHit = await caches.match(_IFC_WASM_URL);
    if (swHit) {
      console.log('§IFC_WASM_FROM_CACHE sw-precache');
      var swBuf = await swHit.arrayBuffer();
      try { (await caches.open(_IFC_ENGINE_CACHE)).put(_IFC_WASM_URL, new Response(swBuf.slice(0), { headers: { 'Content-Type': 'application/wasm' } })); } catch (e) {}
      return swBuf;
    }
  } catch (e) {}
  // 4. Network (online only) — then warm the page cache for next time.
  try {
    var r = await fetch(_IFC_WASM_URL);
    if (r && r.ok) {
      var netBuf = await r.arrayBuffer();
      console.log('§IFC_WASM_FROM_NET size=' + netBuf.byteLength);
      try { (await caches.open(_IFC_ENGINE_CACHE)).put(_IFC_WASM_URL, new Response(netBuf.slice(0), { headers: { 'Content-Type': 'application/wasm' } })); } catch (e) {}
      return netBuf;
    }
  } catch (e) {}
  // 5. Genuinely unavailable — clear, honest error (NOT the cryptic emscripten abort).
  console.warn('§IFC_ENGINE_UNAVAILABLE web-ifc.wasm not cached and offline');
  throw new Error('IFC engine not available offline — connect to the internet once to enable offline IFC import.');
}
// §S284: Create Worker from Blob URL in standalone mode (file:// blocks script URLs)
function _createWorker(scriptUrl) {
  if (window._STANDALONE && window._WORKER_SOURCES) {
    var key = scriptUrl.replace(/\?.*$/, '').replace(/^.*\//, '');
    var src = window._WORKER_SOURCES[key];
    if (src) {
      // §S284b: Read web-ifc from <script type="text/plain" id="webifc-src"> DOM element
      var webIfcEl = document.getElementById('webifc-src');
      if (webIfcEl && (key === 'import_worker.js' || key === 'ifc_export_worker.js')) {
        var webIfcSrc = webIfcEl.textContent;
        // Replace the importScripts line with the actual source
        src = src.replace(/importScripts\([^)]*web-ifc[^)]*\);?/, '// §S284b: web-ifc inlined by packager');
        src = webIfcSrc + '\n' + src;
        console.log('§STANDALONE_WEBIFC size=' + webIfcSrc.length);
      }
      // §S284c: Pass the base64 WASM STRING into the worker — the worker decodes it and
      // mints the Blob URL in its OWN context. A blob URL minted on the main thread is NOT
      // fetchable from a null-origin (file://) blob worker, which silently aborted IFC parse.
      if (window._WEBIFC_WASM_B64 && key === 'import_worker.js') {
        src = 'self._WEBIFC_WASM_B64 = "' + window._WEBIFC_WASM_B64 + '";\n' + src;
        console.log('§STANDALONE_WASM_B64 injected len=' + window._WEBIFC_WASM_B64.length);
      }
      console.log('§STANDALONE_WORKER blob key=' + key + ' size=' + src.length);
      return new Worker(URL.createObjectURL(new Blob([src], {type: 'application/javascript'})));
    }
  }
  return new Worker(scriptUrl);
}

// ── trimmed import handler: single file, NEW project only (no S224 merge modal), auto-open viewer ──
// Mirrors index.html handleImportFile new-project path verbatim, minus merge/renderImportCards.
async function handleImportFile(file) {
  if (!file) return;
  var fmt = detectLandingFormat(file.name);
  if (!fmt.route) { document.getElementById('import-status').textContent = 'Unsupported: .' + fmt.ext + ' — Accepted: IFC, OBJ, DAE, GLB, STL, FBX, 3DS'; return; }
  const status = document.getElementById('import-status');
  const progressBar = document.getElementById('import-progress-bar');

  // §VERSION_MERGE: catalog-similarity check BEFORE the heavy parse — one popup max, no card/list.
  var _mergeTarget = null;
  var _similar = await _findSimilarProject(file.name);
  if (_similar) {
    if (_confirmVersionMerge(_similar.name)) {
      _mergeTarget = _similar;
      console.log('§VERSION_MERGE_ACCEPT_PENDING existingKey=' + _similar.key + ' newFile=' + file.name);
    } else {
      console.log('§VERSION_MERGE_DECLINE key=' + file.name + ' existingKey=' + _similar.key);
    }
  } else {
    console.log('§VERSION_MERGE_NOMATCH key=' + file.name);
  }

  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  status.textContent = 'Reading ' + file.name + ' (' + sizeMB + 'MB)...';
  progressBar.parentElement.style.display = 'block'; progressBar.style.width = '0%'; progressBar.style.background = '#0277bd';
  if (file.size > 200 * 1024 * 1024) status.textContent = 'Very large (' + sizeMB + 'MB) — may take a few minutes';
  const arrayBuffer = await file.arrayBuffer();
  var workerFile = (fmt.route === 'ifc') ? 'viewer/import_worker.js?v=10' : 'viewer/mesh_import_worker.js?v=2';
  var workerMsg = (fmt.route === 'ifc') ? { arrayBuffer, filename: file.name } : { arrayBuffer, filename: file.name, ext: fmt.ext };
  if (fmt.route === 'ifc') {
    try { workerMsg.wasmBytes = await _getWebIfcWasm(); }
    catch (engineErr) { status.textContent = engineErr.message; progressBar.style.background = '#cc4444'; return; }
  }
  const worker = _createWorker(workerFile);
  worker.onmessage = async function (e) {
    const msg = e.data;
    if (msg.type === 'progress') { status.textContent = msg.phase; progressBar.style.width = msg.pct + '%'; return; }
    if (msg.type === 'error') { status.textContent = 'Failed: ' + msg.message; progressBar.style.background = '#cc4444'; worker.terminate(); return; }
    if (msg.type === 'done') {
      status.textContent = 'Building databases...';
      try {
        const SQL = await _loadSqlJs();
        var _fnDisc = _discFromFilename(file.name);
        if (_fnDisc && msg.elements) {
          msg.meta.disciplines = {};
          for (var ei = 0; ei < msg.elements.length; ei++) msg.elements[ei].discipline = _fnDisc;
          msg.meta.disciplines[_fnDisc] = msg.elements.length;
          console.log('§DISC_OVERRIDE file=' + file.name + ' disc=' + _fnDisc + ' elements=' + msg.elements.length);
        }
        const dbs = buildImportDBs(SQL, msg);
        const dbBuf = dbs.extractedDb;
        var _recSplit = dbs.metaDb && dbs.geoDb;
        var projectKey, _rec;
        if (_mergeTarget) {
          // §VERSION_MERGE accept path: append onto the EXISTING record, don't create a new one.
          projectKey = _mergeTarget.key;
          _rec = (await getProject(projectKey)) || _mergeTarget.record;
          if (!_rec.versions) _rec.versions = [];
          _rec.versions.push({ key: file.name, importDate: new Date().toISOString(), db: _recSplit ? null : dbBuf });
          _rec.latestVersion = _rec.versions.length - 1;
          _rec.meta = msg.meta;
          if (_recSplit) { _rec.metaDb = dbs.metaDb; _rec.geoDb = dbs.geoDb; }
          await saveProject(projectKey, _rec);
          console.log('§VERSION_MERGE_ACCEPT existingKey=' + projectKey + ' versions=' + _rec.versions.length + ' latestVersion=' + _rec.latestVersion);
        } else {
          projectKey = file.name;
          _rec = { meta: msg.meta, versions: [{ key: file.name, importDate: new Date().toISOString(), db: _recSplit ? null : dbBuf }], latestVersion: 0 };
          if (_recSplit) { _rec.metaDb = dbs.metaDb; _rec.geoDb = dbs.geoDb; }
          await saveProject(projectKey, _rec);
          console.log('§IMPORT_SAVED key=' + projectKey + ' elements=' + msg.meta.elementCount + ' split=' + !!_recSplit);
        }
        var _cacheDb = await openCacheDB();
        if (_cacheDb && dbs.metaDb && dbs.geoDb) {
          var _ck = projectKey;
          var _cDbUrl = 'import://' + _ck + '/' + _ck.replace(/\.ifc$/i, '_extracted.db');
          var _cMetaUrl = 'import://' + _ck + '/' + _ck.replace(/\.ifc$/i, '_meta.db');
          var _cGeoUrl = 'import://' + _ck + '/' + _ck.replace(/\.ifc$/i, '_geo.db');
          await new Promise(function (resolve) {
            var tx = _cacheDb.transaction(CACHE_STORE, 'readwrite'); var store = tx.objectStore(CACHE_STORE);
            store.put(dbs.metaDb, _cMetaUrl); store.put(dbs.metaDb, _cDbUrl); store.put(dbs.geoDb, _cGeoUrl);
            tx.oncomplete = resolve;
          });
          console.log('§IMPORT_CACHE_PRELOAD meta+geo populated');
        }
        status.textContent = 'Imported ' + msg.meta.elementCount + ' elements — opening viewer...';
        progressBar.style.width = '100%'; progressBar.style.background = '#44cc44';
        openProject(projectKey);
        console.log('§IMPORT_AUTO_OPEN key=' + projectKey);
        setTimeout(function () { status.textContent = ''; progressBar.style.width = '0%'; progressBar.style.background = '#0277bd'; progressBar.parentElement.style.display = 'none'; }, 3000);
      } catch (dbErr) { status.textContent = 'DB error: ' + dbErr.message; progressBar.style.background = '#cc4444'; console.log('§IMPORT_DB_ERROR ' + dbErr.message); }
      worker.terminate();
    }
  };
  worker.onerror = function (err) { status.textContent = 'Worker error: ' + err.message; progressBar.style.background = '#cc4444'; worker.terminate(); };
  worker.postMessage(workerMsg, [arrayBuffer]);
}

// ── §VERSION_MERGE: stem-match-ignoring-trailing-version-suffix catalog similarity check ──
// LANDING_VERSION_MERGE_PROMPT.md §OPEN DESIGN CALL — decision picked (DEFAULT while user was away from
// keyboard, flagged for confirmation not a hard sign-off): strip a trailing version-ish suffix from BOTH the
// new drop's stem and each existing catalog record's stem, then require the STRIPPED stems to match exactly.
// Deliberately NOT using _commonPrefix() here — the spec flags loose partial-prefix matching as the riskiest
// option (false positives on short prefixes matching unrelated buildings); _commonPrefix stays reserved for
// naming a multi-file merge's combined building only.
// Suffix patterns chosen (reasonable-judgment set, documented per the decision): trailing "_v<N>"/"-v<N>",
// " (<N>)", "-copy"/"_copy"/" copy", "-final"/"_final", "-rev<N>"/"_rev<N>", "-r<N>"/"_r<N>", "-new"/"_new",
// "-old"/"_old", "-updated"/"_updated", "-revised"/"_revised". Stripped repeatedly so e.g.
// "MyBuilding_v2_final" fully reduces to "MyBuilding".
var _VERSION_SUFFIX_PATTERNS = [
  /[_\-]v\d+$/i,
  /\s*\(\d+\)$/,
  /[_\-\s]copy$/i,
  /[_\-]final\d*$/i,
  /[_\-]rev\d*$/i,
  /[_\-]r\d+$/i,
  /[_\-]new$/i,
  /[_\-]old$/i,
  /[_\-]updated$/i,
  /[_\-]revised$/i,
];
function _stripVersionSuffix(stem) {
  var s = String(stem || '');
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < _VERSION_SUFFIX_PATTERNS.length; i++) {
      var stripped = s.replace(_VERSION_SUFFIX_PATTERNS[i], '');
      if (stripped !== s) { s = stripped; changed = true; }
    }
  }
  return s;
}
function _stemOf(nameOrKey) {
  return String(nameOrKey || '').replace(/\.(ifc|IFC)$/, '');
}

// Lightweight: existing catalog KEYS only (no full-record read) for the similarity scan.
async function _getAllProjectKeys() {
  const db = await openImportDB();
  if (!db) return [];
  return new Promise(resolve => {
    const tx = db.transaction(IMPORT_STORE, 'readonly');
    const req = tx.objectStore(IMPORT_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

// Find the closest existing catalog record whose stripped stem matches the new drop's stripped stem.
// Returns { key, record, name } or null — NEVER a list. If several records match, picks the single closest
// (exact raw-stem match wins first, else the longest shared raw stem) and the caller's popup names only that one.
async function _findSimilarProject(newName) {
  var newStem = _stemOf(newName);
  var newStripped = _stripVersionSuffix(newStem);
  var keys = await _getAllProjectKeys();
  var candidates = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var record = await getProject(key);
    if (!record) continue;
    var existingName = (record.meta && record.meta.name) || _stemOf(key);
    var existingKeyStripped = _stripVersionSuffix(_stemOf(key));
    var existingNameStripped = _stripVersionSuffix(_stemOf(existingName));
    if (existingKeyStripped === newStripped || existingNameStripped === newStripped) {
      candidates.push({
        key: key, record: record, name: existingName,
        exact: (_stemOf(key) === newStem),
        sharedLen: existingKeyStripped.length
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort(function (a, b) {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return b.sharedLen - a.sharedLen;
  });
  return candidates[0];
}

// ONE lightweight, one-time, contextual popup — NOT a persistent card, NOT a candidate list (the caller has
// already narrowed to the single closest match before this is called). Native confirm() is deliberately used:
// guaranteed single modal popup, no custom card/list UI to build or maintain.
function _confirmVersionMerge(existingName) {
  return confirm(
    "Similar to existing '" + existingName + "' — merge as a new version, or import separately?\n\n" +
    "OK = merge as a new version of '" + existingName + "'\n" +
    "Cancel = import as a separate, unrelated project"
  );
}

// ── common prefix (building name from N IFC stems) — VERBATIM from index.html import.js ──
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

// Parse ONE IFC file via worker → resolves the 'done' msg (elements/geometries/transforms/meta),
// with discipline-from-filename override applied (mirrors handleImportFile's parse half).
function _parseOwnIFC(file, onProgress, forceGeorefOffset) {
  return new Promise(async function (resolve, reject) {
    var workerMsg = { arrayBuffer: await file.arrayBuffer(), filename: file.name, forceGeorefOffset: forceGeorefOffset || null };
    try { workerMsg.wasmBytes = await _getWebIfcWasm(); }
    catch (engineErr) { reject(engineErr); return; }
    var worker = _createWorker('viewer/import_worker.js?v=10');
    worker.onmessage = function (e) {
      var msg = e.data;
      if (msg.type === 'progress') { if (onProgress) onProgress(msg.pct, msg.phase); return; }
      if (msg.type === 'error') { worker.terminate(); reject(new Error(msg.message)); return; }
      if (msg.type === 'done') {
        var _fnDisc = _discFromFilename(file.name);
        if (_fnDisc && msg.elements) {
          msg.meta.disciplines = {};
          for (var ei = 0; ei < msg.elements.length; ei++) msg.elements[ei].discipline = _fnDisc;
          msg.meta.disciplines[_fnDisc] = msg.elements.length;
          console.log('§DISC_OVERRIDE file=' + file.name + ' disc=' + _fnDisc + ' elements=' + msg.elements.length);
        }
        worker.terminate(); resolve(msg);
      }
    };
    worker.onerror = function (err) { worker.terminate(); reject(new Error(err.message)); };
    worker.postMessage(workerMsg, [workerMsg.arrayBuffer]);
  });
}

// ── Multi-IFC merge: N files → ONE building DB → auto-open viewer. NO merge modal, NO card. ──
// Mirrors index.html A.importMultiIFC, self-contained on the plate's saveProject/openProject path.
async function importMultiIFC(files) {
  var status = document.getElementById('import-status');
  var progressBar = document.getElementById('import-progress-bar');
  if (progressBar) { progressBar.parentElement.style.display = 'block'; progressBar.style.width = '0%'; progressBar.style.background = '#0277bd'; }

  var stems = [];
  for (var i = 0; i < files.length; i++) stems.push(files[i].name.replace(/\.(ifc|IFC)$/, ''));
  var buildingName = _commonPrefix(stems).replace(/[_\-]+$/, '') || stems[0];

  // §VERSION_MERGE: catalog-similarity check on the COMBINED building name, before the (slow) N-file parse.
  var _mergeTarget = null;
  var _similar = await _findSimilarProject(buildingName + '.ifc');
  if (_similar) {
    if (_confirmVersionMerge(_similar.name)) {
      _mergeTarget = _similar;
      console.log('§VERSION_MERGE_ACCEPT_PENDING existingKey=' + _similar.key + ' newFile=' + buildingName + '.ifc');
    } else {
      console.log('§VERSION_MERGE_DECLINE key=' + buildingName + '.ifc existingKey=' + _similar.key);
    }
  } else {
    console.log('§VERSION_MERGE_NOMATCH key=' + buildingName + '.ifc');
  }

  console.log('§MULTI_IMPORT_START files=' + files.length + ' building=' + buildingName +
    ' names=' + Array.prototype.map.call(files, function (f) { return f.name; }).join(','));
  if (status) status.textContent = 'Merging ' + files.length + ' IFC files → ' + buildingName + '...';

  var allElements = [], allGeometries = [], allTransforms = [], allDiscs = {}, allStoreys = new Set(), totalElements = 0;
  // §GEOREF_REBASE federation frame (ported from viewer/import.js fe535d5 — this landing-page
  // path builds its OWN worker calls and was missing the fix entirely): the first file that
  // computes a georef offset pins it for every subsequent file in this drop, so all disciplines
  // rebase into ONE shared local frame. Without this, each file rebases independently and a
  // multi-discipline federated drop (e.g. JKR's 7 files) shears apart by however much each
  // file's own bbox-midpoint rounds differently — verified live 2026-07-12: JKR disciplines
  // landed up to ~7m apart, and the CW file (zeroed IfcSite defect) silently landed ~300m away
  // with no warning at all.
  var sessionGeorefOffset = null, sessionUnitScale = 1;

  for (var fi = 0; fi < files.length; fi++) {
    var file = files[fi];
    var fileLabel = (fi + 1) + '/' + files.length + ': ' + file.name;
    if (status) status.textContent = 'Parsing ' + fileLabel;
    console.log('§MULTI_FILE_START ' + fileLabel);
    try {
      var result = await _parseOwnIFC(file, function (pct, phase) {
        var filePct = (fi / files.length + pct / 100 / files.length) * 90;
        if (progressBar) progressBar.style.width = filePct.toFixed(1) + '%';
        if (status) status.textContent = fileLabel + ' — ' + phase;
      }, sessionGeorefOffset);
      if (!sessionGeorefOffset && result.meta.georefOffset &&
          (result.meta.georefOffset[0] || result.meta.georefOffset[1] || result.meta.georefOffset[2])) {
        sessionGeorefOffset = result.meta.georefOffset;
        console.log('§GEOREF_SESSION frame pinned by ' + file.name + ' offset=(' + sessionGeorefOffset.join(',') + ')');
      }
      if (result.meta.unitScale && result.meta.unitScale !== 1) sessionUnitScale = result.meta.unitScale;
      allElements = allElements.concat(result.elements);
      allGeometries = allGeometries.concat(result.geometries);
      allTransforms = allTransforms.concat(result.transforms);
      totalElements += result.meta.elementCount;
      for (var d in result.meta.disciplines) allDiscs[d] = (allDiscs[d] || 0) + result.meta.disciplines[d];
      result.meta.storeys.forEach(function (s) { allStoreys.add(s); });
      console.log('§MULTI_FILE_DONE ' + fileLabel + ' elements=' + result.meta.elementCount + ' geom=' + result.meta.geomCount);
    } catch (err) {
      console.log('§MULTI_FILE_ERROR ' + fileLabel + ' err=' + err.message);
      if (status) status.textContent = 'Failed: ' + fileLabel + ' — ' + err.message;
      if (progressBar) progressBar.style.background = '#cc4444';
      return;
    }
  }

  if (status) status.textContent = 'Building merged database (' + totalElements + ' elements)...';
  if (progressBar) progressBar.style.width = '92%';
  try {
    var SQL = await _loadSqlJs();
    var mergedData = {
      meta: { name: buildingName, filename: buildingName, elementCount: totalElements, geomCount: allGeometries.length,
              disciplines: allDiscs, storeys: Array.from(allStoreys).sort(),
              georefOffset: sessionGeorefOffset || [0, 0, 0], unitScale: sessionUnitScale },
      elements: allElements, geometries: allGeometries, transforms: allTransforms,
    };
    var dbs = buildImportDBs(SQL, mergedData);
    var _recSplit = dbs.metaDb && dbs.geoDb;
    var _newVersionKey = buildingName + '.ifc';
    var projectKey, _rec;
    if (_mergeTarget) {
      // §VERSION_MERGE accept path: append onto the EXISTING record, don't create a new one.
      projectKey = _mergeTarget.key;
      _rec = (await getProject(projectKey)) || _mergeTarget.record;
      if (!_rec.versions) _rec.versions = [];
      _rec.versions.push({ key: _newVersionKey, importDate: new Date().toISOString(), db: _recSplit ? null : dbs.extractedDb });
      _rec.latestVersion = _rec.versions.length - 1;
      _rec.meta = mergedData.meta;
      if (_recSplit) { _rec.metaDb = dbs.metaDb; _rec.geoDb = dbs.geoDb; }
      await saveProject(projectKey, _rec);
      console.log('§VERSION_MERGE_ACCEPT existingKey=' + projectKey + ' versions=' + _rec.versions.length + ' latestVersion=' + _rec.latestVersion);
    } else {
      projectKey = _newVersionKey;
      _rec = { meta: mergedData.meta, versions: [{ key: projectKey, importDate: new Date().toISOString(), db: _recSplit ? null : dbs.extractedDb }], latestVersion: 0 };
      if (_recSplit) { _rec.metaDb = dbs.metaDb; _rec.geoDb = dbs.geoDb; }
      await saveProject(projectKey, _rec);
    }
    var _cacheDb = await openCacheDB();
    if (_cacheDb && dbs.metaDb && dbs.geoDb) {
      var _cDbUrl = 'import://' + projectKey + '/' + projectKey.replace(/\.ifc$/i, '_extracted.db');
      var _cMetaUrl = 'import://' + projectKey + '/' + projectKey.replace(/\.ifc$/i, '_meta.db');
      var _cGeoUrl = 'import://' + projectKey + '/' + projectKey.replace(/\.ifc$/i, '_geo.db');
      await new Promise(function (resolve) {
        var tx = _cacheDb.transaction(CACHE_STORE, 'readwrite'); var store = tx.objectStore(CACHE_STORE);
        store.put(dbs.metaDb, _cMetaUrl); store.put(dbs.metaDb, _cDbUrl); store.put(dbs.geoDb, _cGeoUrl);
        tx.oncomplete = resolve;
      });
    }
    console.log('§MULTI_IMPORT_DONE building=' + buildingName + ' elements=' + totalElements + ' files=' + files.length +
      ' discs=' + Object.keys(allDiscs).join(',') + ' split=' + !!_recSplit);
    if (status) status.textContent = 'Merged ' + files.length + ' files → ' + totalElements + ' elements — opening viewer...';
    if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#44cc44'; }
    openProject(projectKey);
    console.log('§MULTI_AUTO_OPEN key=' + projectKey);
    setTimeout(function () { if (status) status.textContent = ''; if (progressBar) { progressBar.style.width = '0%'; progressBar.style.background = '#0277bd'; progressBar.parentElement.style.display = 'none'; } }, 3000);
  } catch (dbErr) {
    console.log('§MULTI_DB_ERROR ' + dbErr.message);
    if (status) status.textContent = 'DB merge failed: ' + dbErr.message;
    if (progressBar) progressBar.style.background = '#cc4444';
  }
}

// Route dropped/picked files: 2+ IFC → silent merge into one building; else single-file import.
// Mirrors index.html's decision (ifcFiles.length > 1 ? merge : single). NO card, NO modal.
function handleImportFiles(files) {
  if (!files || !files.length) return;
  var ifcFiles = [];
  for (var fi = 0; fi < files.length; fi++) {
    if (detectLandingFormat(files[fi].name).route === 'ifc') ifcFiles.push(files[fi]);
  }
  if (ifcFiles.length > 1) importMultiIFC(ifcFiles);
  else handleImportFile(files[0]);
}

// wire the hub drop zone + file input (called when the hub opens)
function wireImportZone() {
  var zone = document.getElementById('m-import-zone'); var input = document.getElementById('m-import-file');
  if (!zone || !input || zone._wired) return; zone._wired = 1;
  input.multiple = true;   // multi-select → merge in one shot
  zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('drag'); });
  zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('drag'); handleImportFiles(e.dataTransfer.files); });
  zone.addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { handleImportFiles(input.files); });
  console.log('§IMPORT_ZONE wired (drop-own-IFC, multi-merge)');
}
