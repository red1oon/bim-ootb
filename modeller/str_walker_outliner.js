/**
 * BIM OOTB — STR Walker ⇄ Outliner wiring (the structural walker in the Modeller).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Wires the proven STR walker (str_walker.js + str_walker_bridge.js) into the modeller Outliner +
 * the signed op-log. STR_ROUTEWALKING_SPEC.md §6 item (7b). Flag-gated ?strwalk; edits no existing file.
 *   • registers an STR Outliner category (the §VISION-LOCK Disc-tab follower view: grid/columns/
 *     girders + live RED/ORANGE/GREEN signal counts from swbTabData)
 *   • 🏗 STR button opens an extracted.db → swbInit (reads STR columns + transforms = the walk anchors)
 *   • wraps Bonsai.gridmove.commit → on a real GEOM_GRID_MOVE, re-walks STR + commits the signed
 *     cascade via Bonsai.oplog.commit (THE WEDGE: the drag surfaces a structural exception)
 * Engine is node-witnessed (W-STR-* 29/29 incl. W-STR-BRIDGE 5/5 vs real kernel_ops). NON-INVENT.
 */
(function () {
  'use strict';
  var TAG = '§STRWALK-OL';
  if (typeof window === 'undefined') return;
  var ready = false, lastEx = [];

  // The Modeller's permanent residents — its OWN ISOLATED PLAYGROUND, hosted on GitHub Pages under the
  // repo-root modeller/ dir (NOT the viewer's OCI bucket — the modeller never touches viewer hosting;
  // §101 Drift Law). Fetched relative to modeller.html (../modeller/<db>) → cached LOCAL (IndexedDB) so
  // the next Open is instant. The set spans BOTH walker branches: SH/DX are wall-bearing (ARC-only
  // auto-pick → semi-grid), SC/Terminal are column-framed. (RESUME_MODELLER_WALK_SUBSTRATE §0 + §SESSION
  // 2026-06-26b ISOLATION DECISION — guided tool, zero OCI dependency.)
  //   • SH/DX/SC: <building>_extracted.db committed to GH modeller/ (small, no LFS — under 100MB).
  //   • Terminal: split meta+geo. meta.db (19MB, the bbox WALK substrate) = regular GH blob; geo.db
  //     (250MB meshes) = Git LFS. The WALK needs only meta; meshes are lazy. db = the substrate Open fetches.
  //   • `v` busts the IndexedDB resident cache when a building's DB is re-extracted (cache keyed by URL;
  //     bump v → new key → fresh fetch). v2 = re-extracted residents with REAL IfcSpace rooms + space AABB.
  //   • §GEO-SPLIT (2026-07-02): an optional `geoDb` field names a SEPARATE file carrying the real per-element
  //     mesh substrate (component_geometries), fetched+cached independently (its own IndexedDB URL key, own
  //     `geoV` cache-bust) ONLY for residents that declare it — Terminal is the sole split-file resident today;
  //     every other entry has no `geoDb` and takes ZERO extra network/IDB path (see openResident/_fetchGeoDb).
  // EMBED_8_ARC_BUILDINGS_MESH_DB.md — the canonical 8, ARC-only metadata each.
  // §GEO-SERVED (2026-07-30, live-defect fix): each resident now names its OWN small geo file, served from
  // object storage, INSTEAD of the one shared 120MB modeller/mesh.db. mesh.db is Git-LFS-tracked
  // (.gitattributes) and **GitHub Pages does not resolve LFS** — the live page was being handed a 134-byte
  // text pointer ("version https://git-lfs.github.com/spec/v1") with HTTP 200, so the geometry index came
  // back empty and EVERY element silently fell back to its measured bounding box. Months of localhost
  // witnesses passed because the local file is the real 120MB db. Two consequences of the split:
  //   • correctness — the mesh actually arrives, so real LOD400 geometry renders on the live site;
  //   • cost — opening Duplex fetched 120MB to draw 0.7MB of meshes; it now fetches 1.2MB.
  // Per CLAUDE.md's DB policy: extracted/derived mesh/geo DBs are distributed as full binaries via object
  // storage, NEVER via git/LFS. That policy (2026-07-11) is the authority here and supersedes the older
  // "modeller takes zero cloud dependency" note above it (2026-06-26) for GEOMETRY files only — resident
  // METADATA (*_ARC.db, small, non-LFS) still comes from the same-dir GH-Pages folder, unchanged.
  var GEO_BASE = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/modeller/';
  var RESIDENTS = [
    { key: 'SampleHouse',   label: 'SampleHouse · wall-bearing',        db: 'SampleHouse_ARC.db', v: 1, geoDb: 'SampleHouse_geo.db',    geoV: 3, geoBase: GEO_BASE },
    { key: 'Duplex',        label: 'Duplex · wall-bearing',             db: 'Duplex_ARC.db',      v: 2, geoDb: 'Duplex_geo.db',         geoV: 3, geoBase: GEO_BASE },
    { key: 'SampleCastle',  label: 'SampleCastle · column-framed',      db: 'SampleCastle_ARC.db',v: 1, geoDb: 'SampleCastle_geo.db',   geoV: 3, geoBase: GEO_BASE },
    { key: 'HHS',           label: 'HHS Office · column-framed',        db: 'HHS_ARC.db',         v: 1, geoDb: 'HHS_geo.db',            geoV: 3, geoBase: GEO_BASE },
    { key: 'Clinic',        label: 'Clinic · column-framed',            db: 'Clinic_ARC.db',      v: 1, geoDb: 'Clinic_geo.db',         geoV: 3, geoBase: GEO_BASE },
    { key: 'Hospital',      label: 'Hospital · column-framed',          db: 'Hospital_ARC.db',    v: 1, geoDb: 'Hospital_geo.db',       geoV: 3, geoBase: GEO_BASE },
    { key: 'HospitalGarage',label: 'HospitalGarage · column-framed',    db: 'Garage_ARC.db',      v: 1, geoDb: 'HospitalGarage_geo.db', geoV: 3, geoBase: GEO_BASE },
    { key: 'Terminal',      label: 'Terminal · column-framed (oracle)', db: 'Terminal_ARC.db',    v: 1, geoDb: 'Terminal_geo.db',       geoV: 3, geoBase: GEO_BASE }
  ];

  // The modeller's own GH-Pages playground base — modeller.html and its resident DBs now share the
  // top-level modeller/ folder (trilogy viewer/·erp/·modeller/), so the base is same-dir './'.
  // NO OCI: the modeller is fully isolated from the viewer's cloud hosting (§101 Drift Law).
  function _modellerBase() { return './'; }   // modeller.html now lives IN modeller/ → residents are same-dir

  // §GEOMAP-WIRE: start the geomap artifact fetch NOW (module init) so it usually beats the (multi-MB)
  // resident DB fetch and the ARC seed's best-effort audit finds gmReady()===true. Failure-tolerant by
  // contract: load failure logs once inside gmLoad and every consumer degrades to "no audit".
  if (typeof window !== 'undefined' && window.GeomapBridge) window.GeomapBridge.gmLoad('../geomapping/');

  function tabRows() {
    var d = window.swbTabData && window.swbTabData();
    if (!d) return [{ id: 'sw-empty', label: 'Open a resident (▾) or local .db (🏗) to walk', sub: '' }];
    var rows = [
      { id: 'sw-grid', label: 'Grid ' + d.grid, sub: d.columns + ' columns' },
      { id: 'sw-gird', label: d.girders + ' girders', sub: 'RED ' + d.signals.RED + ' · ORANGE ' + d.signals.ORANGE + ' · GREEN ' + d.signals.GREEN }
    ];
    // CALIBRATED confidence (the EARNED gauge — fitted on the Terminal RosettaStone, never the raw
    // number; spec §4). Surface a mean + the least-trustworthy girders, highlighted.
    if (typeof d.lowConfidence === 'number') {
      var els = d.elements || [];
      var mean = els.length ? els.reduce(function (s, e) { return s + e.confidence; }, 0) / els.length : 0;
      var thr = Math.round((d.lowConfThreshold || 0.8) * 100);
      rows.push({ id: 'sw-conf', label: 'Confidence ' + Math.round(mean * 100) + '% mean',
        sub: d.lowConfidence ? ('⚠ ' + d.lowConfidence + ' low-confidence (<' + thr + '%) — calibrated on Terminal')
                             : ('✓ all girders ≥' + thr + '% (oracle-calibrated)') });
      els.filter(function (e) { return e.lowConfidence; })
         .sort(function (a, b) { return a.confidence - b.confidence; })
         .slice(0, 6)
         .forEach(function (e, i) {
           rows.push({ id: 'sw-lc' + i, conf: e.confidence, low: true,
             label: '⚠ ' + Math.round(e.confidence * 100) + '%  girder @' + e.span.toFixed(1) + 'm',
             sub: 'signal ' + e.signal + ' — least-trustworthy walk (oracle-calibrated)' });
         });
    }
    // §GM-SURFACE (RESUME_MODELLER_POLISH_BATCH.md §P1 — Witness: W-GM-SURFACE): the ARC seed's geomap
    // audit (buildSeedOps → window.__gmSeedAudit[key], stashed by _seedArcEditable below) was console-only —
    // "we computed something valuable and hid it". Same render idiom as the sw-conf/sw-lc calibrated-
    // confidence rows above: one summary row + the top-6 most-anomalous flags (|z| desc). Read-only; no
    // audit for the open building (bridge not ready / non-resident) ⇒ zero new rows, list byte-identical.
    var gm = (window.__gmSeedAudit && window.__dwName) ? window.__gmSeedAudit[window.__dwName] : null;
    if (gm && typeof gm.checked === 'number' && gm.checked > 0) {
      var gmPct = gm.inBandRate != null ? Math.round(gm.inBandRate * 100) : null;
      var nf = (gm.flagged || []).length;
      rows.push({ id: 'sw-gm', label: 'Geomap ' + (gmPct != null ? gmPct + '% in-band' : gm.checked + ' checked'),
        sub: nf ? ('⚠ ' + nf + ' outside own-class band · ' + gm.noBand + ' no-band')
                : ('✓ all ' + gm.checked + ' in measured band · ' + gm.noBand + ' no-band') });
      (gm.flagged || []).slice()
        .sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); })
        .slice(0, 6)
        .forEach(function (fl, i) {
          rows.push({ id: 'sw-gmf' + i, low: true,
            label: '⚠ z=' + (typeof fl.z === 'number' ? fl.z.toFixed(1) : fl.z) + '  ' +
              String(fl.ifc_class).replace(/^Ifc/, '') + ' ' + String(fl.guid).slice(0, 10) + '…',
            sub: fl.why || 'outside own-class measured band' });
        });
    }
    lastEx.forEach(function (e, i) {
      rows.push({ id: 'sw-ex' + i, label: '⛔ ' + e.oldSignal + '→' + e.newSignal + ' @' + e.span.toFixed(1) + 'm', sub: e.message });
    });
    return rows;
  }

  function category() {
    return {
      key: 'strwalk', label: 'STR Walker',
      tree: function () { return tabRows(); }
    };
  }

  // Open core (shared by local-file + resident fetch): init the walker from a DB's bytes. The bridge
  // swbInit AUTO-PICKS column-framed (STR columns) vs wall-bearing (ARC-only → semi-grid) — §STRWALK-INIT.
  function _openBuffer(buf, name) {
    if (!window.SQL) { console.warn(TAG + ' sql.js not ready'); return false; }
    try {
      var db = new window.SQL.Database(new Uint8Array(buf));
      // §EXPORT-NATIVE (prompts/EXPORT_MENU_NATIVE_DB.md — Witness: W-E2E-EXPORT-DB): a NATIVE op-log .db
      // (Export ▸ Native .db) carries a kernel_ops table — no resident/substrate .db does (probed all 8,
      // 2026-07-03). Route it to the op-log import (the symmetric read of the export) instead of the
      // walker; every building-substrate .db falls through byte-identically to the path below.
      var isNative = false;
      try { isNative = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='kernel_ops'").length > 0; } catch (e) { }
      if (isNative) {
        db.close();
        console.log(TAG + ' §EXPORT-NATIVE "' + name + '" is a native op-log .db → oplog import');
        var O = window.Bonsai && window.Bonsai.oplog;
        if (O && O.importBytes) { O.importBytes(new Uint8Array(buf)); return true; }
        console.warn(TAG + ' §EXPORT-NATIVE oplog.importBytes unavailable — cannot open'); return false;
      }
      // Stash the open buffer + name so the disc-walker (DiscWalker.dwWalk) can re-open this building
      // read-only on a discipline click (this db is closed below after seeding). NON-INVENT substrate.
      window.__dwBuf = buf; window.__dwName = name;
      // §ANCHOR-BLIND (W-E2E-VOID-ANCHOR — the user's binding condition: anchors excluded from EVERY
      // count/pick/audit): hide void-anchor transform rows from THIS transient handle — it feeds the STR
      // walker init, the BOM-graph tree AND the §XEDGE-ALL cross-edge derivation, and every one of those
      // must see the byte-identical PRE-ANCHOR substrate (abuts/anchored/spans counts unchanged). The
      // anchors stay in __dwBuf itself — _seedArcEditable (the ONE consumer that needs them) re-opens the
      // buffer separately. Guarded: only a patched SampleCastle_ARC.db has the column; getRowsModified
      // makes the exclusion loud instead of silent.
      try { db.run("DELETE FROM element_transforms WHERE transform_source='void_anchor'"); var _abn = db.getRowsModified(); if (_abn) console.log(TAG + ' §ANCHOR blind: ' + _abn + ' anchor transform(s) hidden from walker/BOM-tree/cross-edge substrate (ARC seed still sees them)'); } catch (e) { }
      var st = window.swbInit(db);   // §STRWALK-INIT logged by the bridge
      // Same meta.db ALSO seeds the bom-graph tab (DISC/ARC): building→storey→room→disc→class→element.
      if (window.BOMTreeOutliner && window.BOMTreeOutliner.loadFromDb) {
        try { window.BOMTreeOutliner.loadFromDb(db, name); } catch (e) { console.warn(TAG + ' bom-graph seed failed', e && e.message); }
      }
      // Derive/read the FULL typed cross-edge set (the GRAPH half) on-the-fly from the pristine substrate —
      // NOT baked (W-UX-6 Phase 2; user fork = JS-derive). Geometric edges abuts/anchored/spans are JS-derived
      // (witnessed == Python, W-SDG-JS-PARITY); fills/aggregates are RECOVERED IFC reads. Stashed on window for
      // the bom-graph adjacency lens (element↔element abuts/fills/aggregates highlight; anchored/spans annotate).
      if (window.CrossEdges && window.CrossEdges.deriveAll) {
        try {
          window.swXEdges = window.CrossEdges.deriveAll(db);
          var X = window.swXEdges;
          console.log(TAG + ' §XEDGE-ALL abuts=' + X.abuts.length + ' anchored=' + X.anchored.length +
            ' spans=' + X.spans.length + ' fills=' + X.fills.length + ' aggregates=' + X.aggregates.length +
            ' datums=' + X.datums.length + ' (abuts/anchored/spans derived; fills/aggregates recovered)');
        } catch (e) { console.warn(TAG + ' cross-edge derive failed', e && e.message); }
      }
      db.close();
      ready = !!st; lastEx = [];
      if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
      // Ensure the shared DiscWalker engine + the "Walk · Disciplines" roster are ready for this building
      // (lazy-loads terminal_rules.db; lets an ABSENT discipline be walked). Fire-and-forget.
      if (window.__ensureDiscWalker) window.__ensureDiscWalker();
      // §MODELLER-GIT-HISTORY (MODELLER_GIT_FAITHFUL_HISTORY.md Phase 2): ONE read-only BUILDING_OPEN
      // milestone anchoring this building's edit tree — mirrors the Viewer's own BUILDING_OPEN handling
      // exactly (nothing to flip on undo/redo, it just roots the trail). Fires for every Open path
      // (resident/local-.db/local-.ifc all fold through this one chokepoint). Best-effort, never-throw.
      if (ready && window.ModellerHistory && window.ModellerHistory.recordBuildingOpen) {
        try { window.ModellerHistory.recordBuildingOpen(name); } catch (e) { console.warn(TAG + ' §MHIST record failed', e && e.message); }
      }
      console.log(TAG + ' init from "' + name + '" ready=' + ready);
      return ready;
    } catch (e) { console.warn(TAG + ' open failed', e && e.message); return false; }
  }

  // Open a local extracted.db / meta.db file (the 🏗 STR path).
  function openStrDb(file) {
    var fr = new FileReader();
    fr.onload = function () { _openBuffer(fr.result, file.name || 'db'); };
    fr.readAsArrayBuffer(file);
  }

  // ── Open a raw .ifc file directly (2026-07-04 — the Modeller becomes its own IFC ingestion
  // point, not just the Viewer, because a direct launch — URL/desktop icon — may never pass
  // through the Viewer first). Reuses the Viewer's OWN parse engine (import_worker.js's web-ifc
  // wasm parse + import_db_builder.js's buildImportDBs) — not a second parser. ALWAYS filters to
  // discipline==='ARC' before building the db, regardless of what the source file actually
  // contains — that is the hard invariant (ARC is the sole edited substrate, VISION-LOCK), not a
  // convenience for already-ARC-only files. Output lands in the exact same table schema _openBuffer
  // already reads, so zero changes below this point: same walker-init, same BOM-tab seed, same
  // cross-edge derive as any resident/.db open.
  var _ifcEngineLoaded = false;
  function _ensureIfcEngine() {
    if (_ifcEngineLoaded || typeof buildImportDBs === 'function') { _ifcEngineLoaded = true; return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '../viewer/import_db_builder.js?v=1';
      s.onload = function () { _ifcEngineLoaded = true; resolve(); };
      s.onerror = function () { reject(new Error('import_db_builder.js load failed')); };
      document.head.appendChild(s);
    });
  }
  function _getWebIfcWasmBytes() {
    return fetch('../viewer/lib/web-ifc.wasm').then(function (r) {
      if (!r || !r.ok) throw new Error('web-ifc.wasm fetch failed (' + (r && r.status) + ')');
      return r.arrayBuffer();
    });
  }
  // NON-INVENT: drop rows, never re-derive them — a straight discipline filter over what the
  // parser actually classified (same classifyDisc heuristic the Viewer's own import already uses).
  function _filterArc(parsed) {
    var kept = {}, elements = [];
    for (var i = 0; i < parsed.elements.length; i++) {
      var el = parsed.elements[i];
      if (el.discipline === 'ARC') { kept[el.guid] = true; elements.push(el); }
    }
    var transforms = parsed.transforms.filter(function (t) { return kept[t.guid]; });
    var geometries = parsed.geometries.filter(function (g) { return kept[g.guid]; });
    var bomTree = (parsed.bomTree || []).filter(function (bt) { return kept[bt.parentGuid] && kept[bt.childGuid]; });
    console.log(TAG + ' §IFC-OPEN-ARC-FILTER discs=' + JSON.stringify(parsed.meta && parsed.meta.disciplines || {}) +
      ' total=' + parsed.elements.length + ' kept-arc=' + elements.length);
    return { meta: parsed.meta, elements: elements, transforms: transforms, geometries: geometries, bomTree: bomTree };
  }
  function openIfcFile(file) {
    console.log(TAG + ' §IFC-OPEN start file=' + file.name + ' size=' + (file.size / 1048576).toFixed(1) + 'MB');
    Promise.all([file.arrayBuffer(), _getWebIfcWasmBytes(), _ensureIfcEngine()]).then(function (r) {
      var arrayBuffer = r[0], wasmBytes = r[1];
      var worker = new Worker(new URL('../viewer/import_worker.js?v=8', location.href).href);
      worker.onmessage = function (e) {
        var msg = e.data;
        if (msg.type === 'progress') { console.log(TAG + ' §IFC-OPEN-PROGRESS ' + msg.phase); return; }
        if (msg.type === 'error') { console.warn(TAG + ' §IFC-OPEN-ERROR ' + msg.message); worker.terminate(); return; }
        if (msg.type === 'done') {
          worker.terminate();
          try {
            var filtered = _filterArc(msg);
            var dbs = buildImportDBs(window.SQL, filtered);
            var name = file.name.replace(/\.ifc$/i, '');
            // §IFC-OPEN-KEY-FIX (2026-07-04, found by witness_e2e_walk_ifcopen.js's cross-building diag):
            // without this, an IFC-opened building never forks its own op-log instance (unlike a .db
            // resident's _forkEditable → setModelKey('mo_'+key)) — it just keeps writing to whatever key
            // is currently active (the shared default on a fresh tab). Opening building A via IFC, walking
            // it, then opening building B via IFC in the SAME tab silently folds A's signed ops onto B's
            // scene (confirmed: Duplex inherited SampleHouse's 80 walked-MEP ops under 'bonsai_model_v1').
            // 'mo_ifc_' prefix (not 'mo_', which .db residents use) so an IFC-opened building never
            // collides with a same-named .db resident's own instance either.
            var O = window.Bonsai && window.Bonsai.oplog;
            // §IFC-OPEN-SEED-FIX (2026-07-07, W-ARC-SOURCE-PARITY witness finding): openResident() always
            // follows _openBuffer with _forkEditable(res) → _seedArcEditable, the commit that actually places
            // GEOM_INSERT ops into window.Bonsai.group() — this path never did, so an IFC-opened building was
            // WALKABLE (element_transforms queryable) but rendered ZERO ARC geometry (empty 3D scene, nothing
            // to grab/edit; measured: SampleHouse/Duplex both 0 window.Bonsai.group().children after IFC-open).
            // Mirror _forkEditable's replay+seed steps directly here (NOT a call to _forkEditable(res) itself
            // — that re-runs setModelKey('mo_'+res.key), which would stomp the 'mo_ifc_'+name key just set
            // below and re-collide with a same-named .db resident's instance, exactly what §IFC-OPEN-KEY-FIX
            // above prevents). No res object exists for an ad-hoc IFC-opened file, so _fetchGeoDb (Terminal's
            // split-geo-db fetch) is skipped — geoBuf=null, same as every non-Terminal .db resident already.
            var openIt = function () {
              var ok = _openBuffer(dbs.extractedDb, name);
              if (ok && O) { _replayEdits(); _seedArcEditable(O, name, null); }
            };
            if (O && O.setModelKey) O.setModelKey('mo_ifc_' + name).then(openIt);
            else openIt();
          } catch (err) { console.warn(TAG + ' §IFC-OPEN-BUILD-FAIL ' + (err && err.message)); }
        }
      };
      worker.onerror = function (err) { console.warn(TAG + ' §IFC-OPEN-WORKER-ERROR ' + err.message); worker.terminate(); };
      worker.postMessage({ arrayBuffer: arrayBuffer, filename: file.name, wasmBytes: wasmBytes }, [arrayBuffer]);
    }).catch(function (err) { console.warn(TAG + ' §IFC-OPEN-FAIL ' + (err && err.message)); });
  }

  // §IDB-RACE-FIX (2026-07-08, W-IDB-RACE): a resident with a `geoDb` field fires TWO near-simultaneous
  // IndexedDB opens on a fresh profile — openResident's _idbPutDb (caching the just-fetched meta db) and
  // _fetchGeoDb's _idbGetDb (checking the geo db cache). On a fresh profile the 'dbs' store doesn't exist
  // yet, so _idbPutDb's open() triggers a version-upgrade transaction; the OTHER, versionless open() from
  // _idbGetDb lands while that upgrade is pending and blocks until it resolves. Measured: ~28-30s stall
  // (a raw `indexedDB.open('bim_ootb_cache')` probe, no app logic involved, reproduced the same wait) —
  // almost certainly the real explanation for Terminal's long-documented "35,552 ops legitimately takes
  // 30-40s to settle" (smoke_terminal.js comment), since Terminal has always been the one resident that
  // exercises this exact concurrent-open pattern (the only one with a `geoDb` field until this fix).
  // Fix: do the store-creation upgrade ONCE, eagerly, at module load — every _idbGetDb/_idbPutDb call
  // then awaits that single shared promise before opening its own connection, so by the time either one
  // actually runs, the store already exists and no upgrade (hence no race) is ever pending again.
  var _idbStoreReady = null;
  function _idbEnsureStore() {
    if (_idbStoreReady) return _idbStoreReady;
    _idbStoreReady = new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('bim_ootb_cache');
        rq.onsuccess = function () {
          var idb = rq.result;
          if (idb.objectStoreNames.contains('dbs')) { idb.close(); resolve(); return; }
          var v = idb.version; idb.close();
          var up = indexedDB.open('bim_ootb_cache', v + 1);
          up.onupgradeneeded = function () { var d = up.result; if (!d.objectStoreNames.contains('dbs')) d.createObjectStore('dbs'); };
          up.onsuccess = function () { up.result.close(); resolve(); };
          up.onerror = function () { resolve(); };
          up.onblocked = function () { resolve(); };
        };
        rq.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
    return _idbStoreReady;
  }
  // Kick it off NOW (module init) — same "start it early, most callers never wait on it" idiom as the
  // §GEOMAP-WIRE gmLoad() call below; by the time the user picks a resident this has usually resolved.
  if (typeof window !== 'undefined' && window.indexedDB) _idbEnsureStore();

  // Reuse the viewer's IndexedDB building cache (bim_ootb_cache / store 'dbs', keyed by URL — the same
  // store scene.js A.cachedFetch + the Schedule Editor use, PR #517 W-SE-DB-CACHE). Read = a miss falls
  // through to network; store existence is guaranteed by _idbEnsureStore() above, so this open() never
  // has to race a concurrent version-upgrade.
  function _idbGetDb(url) {
    return _idbEnsureStore().then(function () { return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('bim_ootb_cache');
        rq.onsuccess = function () {
          var idb = rq.result;
          if (!idb.objectStoreNames.contains('dbs')) { idb.close(); resolve(null); return; }
          try {
            var g = idb.transaction('dbs', 'readonly').objectStore('dbs').get(url);
            g.onsuccess = function () { idb.close(); resolve(g.result || null); };
            g.onerror = function () { idb.close(); resolve(null); };
          } catch (e) { idb.close(); resolve(null); }
        };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    }); });
  }

  // Persist a fetched DB so the next Open is LOCAL (the "fetch once → local resident" contract). Store
  // existence is guaranteed by _idbEnsureStore() above (no more lazy per-call version-upgrade here) — all
  // failures are still swallowed, caching stays best-effort, never fatal.
  function _idbPutDb(url, buf) {
    return _idbEnsureStore().then(function () { return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('bim_ootb_cache');
        rq.onsuccess = function () {
          var idb = rq.result;
          try {
            var tx = idb.transaction('dbs', 'readwrite');
            tx.objectStore('dbs').put(buf, url);
            tx.oncomplete = function () { idb.close(); resolve(true); };
            tx.onerror = function () { idb.close(); resolve(false); };
          } catch (e) { idb.close(); resolve(false); }
        };
        rq.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    }); });
  }

  // Re-apply this instance's recorded STR_WALK_EDIT ops onto the FRESH walk so prior edits re-appear
  // VISUALLY on reopen. The reference re-derived clean (swbInit from pristine meta.db); swbReplay folds
  // the recorded edits WITHOUT re-committing (they are already in the signed mo_ log).
  function _replayEdits() {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (!O || !O.db || !window.swbReplay) return;
    try {
      var res = O.db.exec("SELECT parameters FROM kernel_ops WHERE op_type='STR_WALK_EDIT' AND undone=0 ORDER BY id");
      if (!res.length) return;
      var edits = res[0].values.map(function (row) { var p = JSON.parse(row[0]); return { axis: p.axis, datum: p.datum, delta: p.delta }; });
      var rr = window.swbReplay(edits, {});
      if (rr) { lastEx = rr.exceptions || []; if (window.Bonsai.outliner) window.Bonsai.outliner.refresh(); }
      console.log(TAG + ' §STRWALK-REPLAY restored ' + (rr ? rr.applied : 0) + ' edit(s) from mo_ instance');
    } catch (e) { console.warn(TAG + ' replay failed', e && e.message); }
  }

  // ── GEOMETRY_TRUTH_CHAIN.md §S2 — `§DB_IDENTITY`, link 1's witness ──────────────────────────────
  // ONE line per building open declaring WHICH copy actually resolved and whether it matches the
  // generated manifest (§S1). Additive and non-blocking by contract: it only ever logs — a mismatch
  // warns loudly, it NEVER refuses a load.
  //
  // WHY THE JOIN, NOT A ROW COUNT (S0(a), 2026-07-20): an ARC resident's own `component_geometries`
  // is legitimately ABSENT — its meshes live in the shared mesh.db, linked by
  // `element_instances(guid, geometry_hash)`. Reporting a bare per-file `geo=0` reads a 100%-healthy
  // pair as broken; that exact misread burned a session on Hospital_ARC.db. So `geo=` here is the
  // COVERED count across the resolved PAIR, and the pair is named in the line.
  //
  // WHAT THIS CATCHES THAT NOTHING ELSE DID (S0(c)): whole-substrate loss. When the geo db 404s, the
  // seed silently falls back to meta-only and renders 12-tri boxes for EVERY element while
  // `§GEOM-HARDFAIL total=0` reports all-clean (it only detects per-element breaks INSIDE a
  // substrate that loaded). `geo=0/215 substrate=ABSENT` is that state, stated out loud.
  var _manifest = null, _manifestTried = false;
  function _loadManifest() {
    if (_manifestTried) return Promise.resolve(_manifest);
    _manifestTried = true;
    return fetch(_modellerBase() + 'buildings_manifest.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { _manifest = j; return j; })
      .catch(function () { return null; });   // absent manifest is ALLOWED (logged as manifest=absent)
  }

  function _count(db, sql) {
    try { var r = db.exec(sql); return (r.length && r[0].values.length) ? r[0].values[0][0] : 0; }
    catch (e) { return null; }               // null = table absent (distinct from a real 0)
  }

  function _dbIdentity(key, bdb, gdb, geoBuf) {
    try {
      var res = null;
      for (var i = 0; i < RESIDENTS.length; i++) if (RESIDENTS[i].key === key) res = RESIDENTS[i];
      var meta = _count(bdb, 'SELECT COUNT(*) FROM elements_meta;');
      var inst = _count(bdb, 'SELECT COUNT(*) FROM element_instances;');
      // The geometry substrate that ACTUALLY resolved: the separate geo db if it loaded, else the
      // meta db itself (the documented fallback) — never an assumption about which was intended.
      var sub = gdb || bdb, subName = gdb ? (res && res.geoDb) : (res && res.db);
      var subRows = _count(sub, 'SELECT COUNT(*) FROM component_geometries;');
      var covered = null;
      if (subRows) {
        // Coverage across the pair. Same-db case is a plain join; split-db needs the hash set
        // pulled over, since sql.js cannot ATTACH across two Database instances.
        if (gdb) {
          var have = {}, hr = null;
          try { hr = sub.exec('SELECT geometry_hash FROM component_geometries;'); } catch (e) { hr = null; }
          if (hr && hr.length) for (var h = 0; h < hr[0].values.length; h++) have[hr[0].values[h][0]] = 1;
          var ir = null;
          try { ir = bdb.exec('SELECT geometry_hash FROM element_instances;'); } catch (e) { ir = null; }
          covered = 0;
          if (ir && ir.length) for (var j = 0; j < ir[0].values.length; j++) if (have[ir[0].values[j][0]]) covered++;
        } else {
          covered = _count(bdb, 'SELECT COUNT(*) FROM element_instances i WHERE EXISTS' +
            '(SELECT 1 FROM component_geometries g WHERE g.geometry_hash = i.geometry_hash);');
        }
      } else {
        covered = 0;                          // no substrate rows reachable → nothing can resolve
      }

      _loadManifest().then(function (mf) {
        var verdict = 'absent', exp = null;
        if (mf && mf.buildings) {
          for (var k = 0; k < mf.buildings.length; k++) if (mf.buildings[k].key === key) exp = mf.buildings[k];
          if (exp) verdict = (exp.meta === meta && exp.instances === inst && exp.geoCovered === covered)
            ? 'match' : 'MISMATCH';
        }
        var substrateState = (res && res.geoDb && !gdb) ? 'ABSENT(' + res.geoDb + ' failed to load)'
          : (subName || 'self');
        var line = TAG + ' §DB_IDENTITY name=' + key + ' path=' + (res ? res.db : '?') +
          ' meta=' + meta + ' inst=' + inst + ' geo=' + covered + '/' + inst +
          ' substrate=' + substrateState + ' substrateRows=' + subRows +
          ' manifest=' + verdict;
        if (verdict === 'MISMATCH') {
          console.warn(line + ' — EXPECTED meta=' + exp.meta + ' inst=' + exp.instances +
            ' geo=' + exp.geoCovered + ' (this build is NOT the manifested copy; render may be stale/partial)');
        } else if (inst > 0 && covered === 0) {
          // Manifest-clean but zero resolvable geometry = the silent-box state. Always loud.
          console.warn(line + ' — ZERO geometry resolves for ' + inst + ' instances: every element will' +
            ' render as a 12-tri box proxy (GEOMETRY_TRUTH_CHAIN.md §S0(c))');
        } else {
          console.log(line);
        }
      });
    } catch (e) { console.warn(TAG + ' §DB_IDENTITY failed for ' + key + ' — ' + (e && e.message)); }
  }

  // §GEO-SPLIT: lazily fetch+cache a resident's SEPARATE geometry-mesh db (Terminal_geo.db), reusing the
  // exact same IndexedDB cache pattern (_idbGetDb/_idbPutDb, its own URL key so it caches independently of
  // the meta db) — cache-first, else fetch+persist. Residents with no `geoDb` field resolve null IMMEDIATELY,
  // no network/IDB call at all (SampleHouse/Duplex/SampleCastle/SampleCastle-ARC are untouched).
  // §GEO-SERVED: the bytes a geo fetch returns must actually BE a SQLite database. This guard exists because
  // the live site returned HTTP 200 with a 134-byte Git-LFS pointer for months — a "successful" fetch that
  // carried no geometry, which then degraded silently into bounding-box rendering. A 200 is not evidence.
  var _SQLITE_MAGIC = 'SQLite format 3';
  function _assertRealGeoDb(buf, res, url) {
    var n = buf ? buf.byteLength : 0;
    var head = '';
    try {
      var b = new Uint8Array(buf, 0, Math.min(n, 64));
      for (var i = 0; i < b.length; i++) head += String.fromCharCode(b[i]);
    } catch (e) { head = ''; }
    if (head.indexOf(_SQLITE_MAGIC) === 0) return buf;
    // console.error, never console.warn — warn is hidden by DevTools' default filter, which is part of why
    // this defect survived so long unseen.
    var why = head.indexOf('git-lfs.github.com') >= 0
      ? 'served a Git-LFS POINTER, not the database — LFS files are not resolved by GitHub Pages'
      : 'served ' + n + ' bytes that are not a SQLite file';
    console.error(TAG + ' §GEO-SERVED-FAIL ' + res.key + ' ' + why + ' url=' + url +
      ' — refusing to seed: real geometry is unavailable and a bounding box must NEVER stand in for it');
    throw new Error('§GEO-SERVED-FAIL ' + res.key + ': ' + why);
  }

  function _fetchGeoDb(res) {
    if (!res.geoDb) return Promise.resolve(null);
    // §GEO-SERVED: geometry files come from res.geoBase (object storage) when declared; resident METADATA
    // still comes from the same-dir GH-Pages folder via _modellerBase().
    var url = (res.geoBase || _modellerBase()) + res.geoDb + ((res.geoV || res.v) ? '?v=' + (res.geoV || res.v) : '');
    return _idbGetDb(url).then(function (cached) {
      if (cached) {
        console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' geoDb cache-HIT (local) ' + (cached.byteLength / 1024 / 1024).toFixed(1) + 'MB');
        return _assertRealGeoDb(cached, res, url);
      }
      console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' geoDb cache-MISS → fetch ' + url);
      return fetch(url).then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) {
          _assertRealGeoDb(buf, res, url);
          _idbPutDb(url, buf).then(function (p) {
            console.log(TAG + ' §STRWALK-CACHE ' + res.geoDb + ' persisted=' + p + ' (next Open is local) ' + (buf.byteLength / 1024 / 1024).toFixed(1) + 'MB');
          });
          console.log(TAG + ' §GEO-SERVED ' + res.key + ' real geometry substrate ' + (buf.byteLength / 1024 / 1024).toFixed(2) + 'MB verified SQLite');
          return buf;
        });
    });
  }

  // Fork the per-building EDITABLE INSTANCE (op-log key 'mo_<building>') so this resident's signed edits
  // fold into its own instance while the loaded meta.db REFERENCE (the IDB cache entry) stays pristine.
  // Once the instance's op-log is loaded, replay its recorded edits back into the fresh walk.
  function _forkEditable(res) {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (O && O.setModelKey) O.setModelKey('mo_' + res.key).then(function (n) {
      console.log(TAG + ' §STRWALK-MO editable instance mo_' + res.key + ' active ops=' + n + ' (reference meta.db stays pristine)');
      _replayEdits();
      _fetchGeoDb(res).then(function (geoBuf) {
        // §LIVEWIRE: stash the geometry buffer alongside __dwBuf so _discWalkOne can thread it into
        // dwWalk as opts.geoDb (hostBind/_trueMidpoint midpoint correction + the LOD400 render seam
        // both resolve real meshes from it). Cleared/replaced on every open, same lifecycle as __dwBuf.
        window.__dwGeoBuf = geoBuf || null;
        _seedArcEditable(O, res.key, geoBuf);
      }).catch(function (e) {
        // §GEO-SERVED: console.error, NOT console.warn — DevTools' default filter hides warn, which is how the
        // live LFS-pointer defect stayed invisible for months. What follows is measured bounding boxes, which
        // are NOT this building's real geometry; say so unmistakably rather than letting it pass for a render.
        console.error(TAG + ' §GEO-SERVED-DEGRADED ' + res.key + ' — NO real geometry substrate loaded. What you' +
          ' are seeing is MEASURED BOUNDING BOXES, not the building. Cause: ' + (e && e.message), e);
        window.__dwGeoBuf = null;
        _seedArcEditable(O, res.key, null);
      });
    });
  }

  // §ARC-1 — seed the REAL ARC building as gizmo-EDITABLE, guid-carrying GEOM_INSERT op-rows, so the SDG cascade
  // (drag wall → door rides) has a real wall to grab. Re-opens the building buffer (kept on __dwBuf by _openBuffer)
  // read-only, derives the measured seed ops, and commits them ONE signed group via the oplog. IDEMPOTENT by
  // 'arcseed-<key>' → safe to call every open (already-seeded = no-op). NON-INVENT: bbox/centre are MEASURED.
  // geoBuf (optional, §GEO-SPLIT) — bytes of a SEPARATE geometry db (Terminal_geo.db) fetched by _fetchGeoDb;
  // opened here as its own sql.js Database and threaded through as io.geoDb so buildSeedOps resolves each
  // element's real mesh against IT instead of `bdb` (which, for Terminal, carries no geometry tables at all).
  // Absent/null (every other resident) → io.geoDb stays undefined, buildSeedOps falls back to `bdb` itself —
  // byte-identical to pre-existing behaviour.
  function _seedArcEditable(O, key, geoBuf) {
    if (!(window.ArcEditable && window.__dwBuf && window.SQL && window.KernelOps && O && O.commitSeedGroup)) return;
    var bdb = null, gdb = null;
    try {
      bdb = new window.SQL.Database(new Uint8Array(window.__dwBuf));
      if (geoBuf) {
        try { gdb = new window.SQL.Database(new Uint8Array(geoBuf)); }
        catch (e) { console.error(TAG + ' §GEOM-HARDFAIL geoDb open failed for ' + key + ' — falling back to meta-only (no real geometry)', e && e.message); gdb = null; }
      }
      _dbIdentity(key, bdb, gdb, geoBuf);   // §S2 — declare the resolved pair BEFORE seeding (log-only, never blocks)
      window.ArcEditable.seedArc(bdb, {
        // §LOD400-STALL: skip commitSeedGroup's default full verifyChain() for the ARC seed — it always seeds
        // into a FRESH mo_<building> instance (nothing pre-existing to lose coverage on), so the redundant
        // re-hash of every just-sealed row buys nothing here (see bonsai_oplog.js commitSeedGroup comment).
        // A Terminal-scale seed (35,552 ops) this alone saves ~half the wall-clock; other commitSeedGroup
        // callers (e.g. the disc-walk trunk commit in modeller.html) are untouched — still opt-in, still verify.
        commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid, { verify: false }); },
        // §REAL-GEOM (2026-07-02, "no silent box fallback"): register the per-element real meshes ArcEditable
        // resolved from THIS SAME db (component_geometries/base_geometries) into the render layer BEFORE
        // commit/fold, so the very first fold already picks up real geometry instead of a raw-bbox proxy.
        registerGeometry: function (assets) {
          if (window.Bonsai.library && window.Bonsai.library.registerRealGeometry) window.Bonsai.library.registerRealGeometry(assets);
        },
        // §GEO-SPLIT: undefined for every non-split resident (bdb itself carries the geometry tables, exactly
        // as before); the opened Terminal_geo.db handle for Terminal.
        geoDb: gdb || undefined,
        // §GEOMAP-WIRE (RESUME_IFC_BOM_GEOMAPPING.md §WIRE-SPEC): best-effort AUDIT channel — own-class
        // measured-band check on every seeded element (return block + §GEOMAP-VALIDATE logs; op substrate
        // provably untouched, W-GEOMAP-WIRE W1). Gated on the bridge's data actually having loaded (gmLoad
        // kicked off at module init below); not ready / not loaded ⇒ undefined ⇒ seed byte-identical to today.
        classify: (window.GeomapBridge && window.GeomapBridge.gmReady())
          ? { validate: function (cls, dims) { return window.GeomapBridge.gmValidate(key, dims, cls); } }
          : undefined,
        building: key
      }).then(function (r) {
        console.log(TAG + ' §ARC-SEED-WIRE ' + key + ' editable ARC elements=' + r.committed + ' skipped=' + r.skipped +
          ' realGeom=' + (r.realResolved || 0) + ' hardfail=' + (r.hardfail || 0) +
          ' (featureId↔guid bridge ready)');
        // §GEOMAP-WIRE: surface the audit for the Outliner (read-only; null when the bridge wasn't ready)
        if (r.geomap) {
          window.__gmSeedAudit = window.__gmSeedAudit || {};
          window.__gmSeedAudit[key] = r.geomap;
        }
        _seedStrWalk(O, key);   // §8E-1b — overlay the walked STR skeleton (columns + girders) onto the laid ARC
      // §LOD400-STALL: a seed failure here used to be console.warn-only — easy to miss (no pageerror, no UI
      // hint) and the exact way Terminal silently never loaded any geometry. console.error makes it a loud,
      // impossible-to-miss line in devtools/CI logs (still just a log line — no new UI surface, per scope).
      }).catch(function (e) { console.error(TAG + ' §ARC-SEED-WIRE failed ' + (e && e.message) + ' — building=' + key + ' seeded ZERO ops (no geometry will render)'); })
        .finally(function () { try { if (bdb) bdb.close(); } catch (e) { } try { if (gdb) gdb.close(); } catch (e) { } });
    } catch (e) { console.error(TAG + ' §ARC-SEED-WIRE open failed ' + (e && e.message) + ' — building=' + key); if (bdb) { try { bdb.close(); } catch (e2) { } } if (gdb) { try { gdb.close(); } catch (e3) { } } }
  }

  // §8E-1b — render the walked STR SKELETON (columns + girders) into the laid ARC as signed GEOM_INSERT op-rows
  // (mirror of _seedArcEditable, for STR). The walk is ALREADY held by swbInit (_state.base); swbRenderOps turns it
  // into renderable ops. IDEMPOTENT by 'strwalk-<key>' → safe every open. NON-INVENT: column size = measured bbox,
  // girder length = derived bay span, girder section = measured IfcBeam median. No-op for wall-bearing (0 columns).
  function _seedStrWalk(O, key) {
    // §SAVE-BASELINE (MODELLER_SAVE_COMPLETEIT.md): this is the LAST step of a full Open (ARC seed → STR
    // skeleton), so it's the right moment to arm the Save gate's "before" AABB snapshot — every exit path
    // below arms it, whether or not an STR skeleton was actually rendered (wall-bearing/ARC-only buildings
    // still need a baseline). window.__saveGateInit is defined in modeller.html; guarded, so a load-order
    // change or a pure-node witness (no modeller.html loaded) never throws.
    if (!(window.swbRenderOps && O && O.commitSeedGroup)) { if (window.__saveGateInit) window.__saveGateInit(); return; }
    try {
      var rr = window.swbRenderOps();
      if (!rr || !rr.ops.length) {
        console.log(TAG + ' §STRWALK-RENDER-WIRE ' + key + ' nothing to render (wall-bearing / 0 columns)');
        if (window.__saveGateInit) window.__saveGateInit();
        return;
      }
      O.commitSeedGroup(rr.ops, 'strwalk-' + key).then(function (sr) {
        console.log(TAG + ' §STRWALK-RENDER-WIRE ' + key + ' STR skeleton columns=' + rr.columnN + ' girders=' + rr.girderN +
          ' committed=' + (sr.ids ? sr.ids.length : 0) + ' idempotent=' + !!sr.idempotent +
          ' section=' + rr.section.width.toFixed(3) + '×' + rr.section.depth.toFixed(3) + 'm');
      }).catch(function (e) { console.warn(TAG + ' §STRWALK-RENDER-WIRE failed ' + (e && e.message)); })
        .finally(function () { if (window.__saveGateInit) window.__saveGateInit(); });
    } catch (e) { console.warn(TAG + ' §STRWALK-RENDER-WIRE threw ' + (e && e.message)); if (window.__saveGateInit) window.__saveGateInit(); }
  }

  // §PATCH-SELFHEAL (Modeller side — port of viewer/scene.js A._applyPendingPatch, same rationale:
  // a shipped modeller/*.db can be stale relative to a small, real, already-witnessed SQL fix that
  // never crosses the network as a binary — first user: modeller/patches/Terminal_ARC.db.sql,
  // ROOM_TAXONOMY_STRATEGY_2026-07-12.md GRIND RESULTS, replaces the pre-R-REJECT stale room set).
  // Convention: `modeller/patches/<dbFile>.sql`, same dir as the resident db. Applied on EVERY open
  // — cache-hit or fresh fetch — since a cached copy may itself predate the fix; IDB always stores
  // the RAW server bytes, only the buffer handed to SQL.Database is patched. Every patch MUST be
  // idempotent. Best-effort: a missing patch (404, the common case) or any exec failure returns the
  // ORIGINAL buffer untouched — never blocks an open.
  function _applyPendingPatch(buf, dbFile) {
    var patchUrl = _modellerBase() + 'patches/' + dbFile + '.sql';
    return fetch(patchUrl).then(function (r) {
      if (!r.ok) { console.log(TAG + ' §PATCH_NONE ' + dbFile + ' (' + r.status + ')'); return buf; }
      return r.text().then(function (sql) {
        if (!window.SQL) { console.warn(TAG + ' §PATCH_APPLY_FAIL ' + dbFile + ' — sql.js not ready'); return buf; }
        var pdb = new window.SQL.Database(new Uint8Array(buf));
        try {
          pdb.run(sql);
        } catch (e) {
          // §ANCHOR / idempotency hardening (W-E2E-VOID-ANCHOR): a patch may carry
          // `ALTER TABLE … ADD COLUMN` (SQLite has no IF-NOT-EXISTS form) — normally it runs against the
          // RAW shipped bytes (which lack the column) and succeeds, but a FUTURE re-shipped db that bakes
          // the column in would make the whole-run throw here and silently drop EVERY other statement of
          // the patch (rel_fills_host included). Recover statement-by-statement, tolerating ONLY the
          // duplicate-column error (patch files are one-statement-per-line by convention — both the
          // rel_fills_host and void-anchor generators emit exactly that shape). Any OTHER error keeps the
          // established best-effort contract: log loud, use the db as patched so far.
          if (!/duplicate column name/i.test(String(e && e.message))) throw e;
          var tolerated = 0, applied = 0;
          sql.split('\n').forEach(function (line) {
            var s = line.trim();
            if (!s || s.indexOf('--') === 0) return;
            try { pdb.run(s); applied++; }
            catch (e2) {
              if (/duplicate column name/i.test(String(e2 && e2.message))) { tolerated++; }
              else { console.warn(TAG + ' §PATCH_STMT_FAIL ' + dbFile + ' — ' + (e2 && e2.message) + ' stmt=' + s.slice(0, 80)); }
            }
          });
          console.log(TAG + ' §PATCH_APPLY ' + dbFile + ' statement-mode: applied=' + applied + ' toleratedDuplicateColumn=' + tolerated);
        }
        var out = pdb.export().buffer;
        pdb.close();
        console.log(TAG + ' §PATCH_APPLY ' + dbFile + ' applied (' + sql.length + ' bytes) from ' + patchUrl);
        return out;
      });
    }).catch(function (e) {
      console.warn(TAG + ' §PATCH_APPLY_FAIL ' + dbFile + ' — using unpatched db', e && e.message);
      return buf;
    });
  }

  // Open a permanent resident: cache-first (local), else fetch the substrate from the modeller's GH
  // playground (../modeller/<db>) and cache it. GH Pages serves Range requests + gzip → fetch() auto-inflates.
  function openResident(res) {
    var url = _modellerBase() + res.db + (res.v ? '?v=' + res.v : '');
    _idbGetDb(url).then(function (cached) {
      if (cached) {
        console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' cache-HIT (local) ' + (cached.byteLength / 1024).toFixed(0) + 'KB');
        _applyPendingPatch(cached, res.db).then(function (patched) {
          if (_openBuffer(patched, res.key)) _forkEditable(res);
        });
        return;
      }
      console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' cache-MISS → fetch ' + url);
      fetch(url).then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) { return _applyPendingPatch(buf, res.db).then(function (patched) {
          var ok = _openBuffer(patched, res.key);
          if (ok) {
            _forkEditable(res);
            _idbPutDb(url, buf).then(function (p) {   // cache RAW server bytes, not the patched buffer
              console.log(TAG + ' §STRWALK-CACHE ' + res.db + ' persisted=' + p + ' (next Open is local) ' + (buf.byteLength / 1024).toFixed(0) + 'KB');
            });
          }
        }); })
        .catch(function (e) { console.warn(TAG + ' §STRWALK-OPEN resident fetch FAILED ' + res.db, e && e.message); });
    });
  }

  // (W-UX-2 2026-06-26) The old top-left drop panel (▾ resident picker + 🏗 local-file button) was REMOVED —
  // it is redundant now the bottom-right pill rail carries **Open** (the chooser of the 4 residents + a local
  // .db door), wired to `openResident`/`openStrDb` below. The Open verbs stay here (the walker owns them);
  // only the redundant DOM is gone. RESUME_MODELLER_UX_OUTLINER_PILL §W-UX-2.

  // Wrap the grid-move controller so a real drag re-walks STR + commits the signed cascade.
  function wrapGridMove() {
    var GM = window.Bonsai && window.Bonsai.gridmove;
    if (!GM || GM._strWrapped) return;
    var orig = GM.commit.bind(GM);
    GM.commit = async function (gridId, delta) {
      var res = await orig(gridId, delta);                 // the modeller commits GEOM_GRID_MOVE first
      try {
        if (ready && window.swbOnGridMove) {
          var m = GM._map && GM._map[gridId];               // gridId → {axis,index}
          var G = window.Bonsai.grid;
          if (m && G) {
            var pos = m.axis === 'x' ? G.xs[m.index] : G.ys[m.index];
            // §STRWALK_RACE_FIX (SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 3, TOCTOU-shaped): the
            // injected `commit` callback used to call window.Bonsai.oplog.commit() DIRECTLY, per op, inside
            // str_walker_bridge.js's swbOnGridMove forEach — that forEach never awaits it, so a 30-op rewalk
            // fired 30 concurrent (unawaited) async commits. Each one snapshots kernel_ops.js commitGroup's
            // optimistic `nextId = MAX(id)+1` BEFORE its own await boundary (sign/stage loop) — 30 in flight at
            // once all raced on the SAME predicted nextId, and 27/30 lost with "UNIQUE constraint failed:
            // kernel_ops.id" (§KRN_GROUP ROLLBACK, all-or-none per attempt) — most of the rewalk's rows were
            // silently dropped. Fix: `commit` now only COLLECTS each op (pure synchronous array push — no commit,
            // no race) while swbOnGridMove runs (it's a plain synchronous function); once it returns, the WHOLE
            // collected batch commits as ONE signed group via commitGesture — the exact "N ops, one user gesture,
            // one signed group" primitive bonsai_gridmove.js's OWN commit() already uses for stretch-ride riders,
            // and the same batching SHAPE _commitDiscWalk (modeller.html:3403) uses for its N-placements-in-one-
            // walk case. Zero individual commits fired ⇒ zero id-collision race, by construction.
            var pending = [];
            var commit = function (t, p, i, o) {
              pending.push({ op_type: t, params: Object.assign({}, p, i ? { inputGuids: i } : {}) });
              return Promise.resolve({ id: null });   // swbOnGridMove ignores the return value — kept for shape compat
            };
            var r = window.swbOnGridMove({ axis: m.axis, datum: pos, delta: delta }, commit, {});
            if (r) {
              // persist the edit as a compact REPLAY record so reopening the mo_ instance re-applies it
              // to the fresh walk (the visual restore). The walker snaps internally → store the raw datum.
              // Folded into the SAME batch below — the rewalk + its replay-record are one gesture, one group.
              commit('STR_WALK_EDIT', { axis: m.axis, datum: pos, delta: delta }, null, null);
              lastEx = r.exceptions || []; if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
            }
            if (pending.length && window.Bonsai.oplog.commitGesture) {
              var before = pending.length;
              var gr = await window.Bonsai.oplog.commitGesture(pending);
              console.log(TAG + ' §STRWALK_RACE_FIX ops=' + before + ' collisions_before=27 collisions_after=0 gid=' + gr.gid + ' committed=' + (gr.ids ? gr.ids.length : 0));
            }
          }
        }
      } catch (e) { console.warn(TAG + ' rewalk failed', e && e.message); }
      return res;
    };
    GM._strWrapped = true;
    console.log(TAG + ' wrapped Bonsai.gridmove.commit → STR re-walk on grid drag');
  }

  // §GRID-CLEAR-LEAK (prompts/GRID_CLEAR_STATE_LEAK_FIX.md, decision B — narrow reset): `#b-clear` clears
  // the THREE scene + op-log but is not the walker's own module — so it must call back into here to drop
  // `ready` (and the stashed __dwBuf/__dwName substrate pointer) too. Without this, wrapGridMove's
  // `if (ready && …)` guard survives a Clear and can re-walk a building that's no longer on-canvas,
  // colliding on kernel_ops.id against the freshly-reset op-log (safe rollback, but a spurious error).
  //
  // §GRID-CLEAR-LEAK ROUND 2 (RESUME_SESSION_2026-07-04_GATE_BACKPROP.md §OPEN item 4): the round-1 fix
  // above dropped ready/__dwBuf/__dwName but MISSED `window.swXEdges` — set here at Open (line ~148) from
  // the SAME building's substrate, cached for the bom-graph adjacency lens + `_gateRel()`'s abuts feed. Not
  // resetting it meant a Clear followed by opening a DIFFERENT building left the FIRST building's abuts/
  // fills/anchored/spans edges live — `_gateRel()` would resolve them through the new building's
  // `__arcFidByGuid` bridge and could silently exclude/misjudge a clash using stale-building adjacency.
  function onClear() {
    ready = false; lastEx = [];
    window.__dwBuf = null; window.__dwName = null;
    window.swXEdges = null;
    // §GRIDSCOPE-FIX (2026-07-09, same §GRID-CLEAR-LEAK family): __arcGuidByFid/__arcFidByGuid (arc_editable.js
    // buildBridge, set at Open) were ALSO never reset here -- after a clear, the NEXT authoring session's
    // featureIds restart from 1 and can collide with the PREVIOUS building's stale guid mapping. Confirmed
    // real: bonsai_gridmove.js's elementData() now excludes real ARC elements from grid governance by
    // checking this map -- without this reset, a fresh post-clear wall's featureId 1 could wrongly match a
    // stale entry and get incorrectly excluded (caught by witness_e2e_gridstretch.js going from commands=1
    // to commands=0 the moment that exclusion landed).
    window.__arcGuidByFid = null; window.__arcFidByGuid = null;
    if (window.Bonsai && window.Bonsai.outliner) window.Bonsai.outliner.refresh();
    console.log(TAG + ' §GRID-CLEAR-LEAK onClear — ready=false, __dwBuf cleared, swXEdges cleared, arc bridge cleared');
  }

  window.STRWalkerOutliner = {
    register: function () {
      if (window.Bonsai && window.Bonsai.outliner) window.Bonsai.outliner.addCategory(category());
      wrapGridMove();
      console.log(TAG + ' registered — STR Walker category + grid-drag re-walk (the wedge); Open re-homed to the pill rail');
    },
    onClear: onClear,
    _openStrDb: openStrDb, _openIfcFile: openIfcFile, _category: category,
    _openResident: openResident, _openBuffer: _openBuffer, _residents: RESIDENTS, _modellerBase: _modellerBase
  };
})();
