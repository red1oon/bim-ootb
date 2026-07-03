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
  var RESIDENTS = [
    { key: 'SampleHouse',  label: 'SampleHouse · wall-bearing',         db: 'SampleHouse_extracted.db',  v: 2 },
    { key: 'Duplex',       label: 'Duplex · wall-bearing',             db: 'Duplex_extracted.db',       v: 2 },
    { key: 'SampleCastle', label: 'SampleCastle · column-framed',      db: 'SampleCastle_extracted.db', v: 2 },
    { key: 'SampleCastle-ARC', label: 'SampleCastle · ARC only (diagnostic)', db: 'SampleCastle_ARC_extracted.db', v: 1 },
    { key: 'Terminal',     label: 'Terminal · column-framed (oracle)', db: 'Terminal_meta.db',          v: 1,
      geoDb: 'Terminal_geo.db', geoV: 1 }
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

  // Reuse the viewer's IndexedDB building cache (bim_ootb_cache / store 'dbs', keyed by URL — the same
  // store scene.js A.cachedFetch + the Schedule Editor use, PR #517 W-SE-DB-CACHE). Read = a miss falls
  // through to network; opened WITHOUT a version so we never clobber the viewer's schema (drift trap).
  function _idbGetDb(url) {
    return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('bim_ootb_cache');
        rq.onsuccess = function () {
          var idb = rq.result;
          if (!idb.objectStoreNames.contains('dbs')) { resolve(null); return; }
          try {
            var g = idb.transaction('dbs', 'readonly').objectStore('dbs').get(url);
            g.onsuccess = function () { resolve(g.result || null); };
            g.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  // Persist a fetched DB so the next Open is LOCAL (the "fetch once → local resident" contract). If the
  // shared 'dbs' store doesn't exist yet (modeller-only user who never streamed in the viewer), create
  // it via a single version+1 upgrade. All failures are swallowed → caching is best-effort, never fatal.
  function _idbPutDb(url, buf) {
    return new Promise(function (resolve) {
      function put(idb) {
        try {
          var tx = idb.transaction('dbs', 'readwrite');
          tx.objectStore('dbs').put(buf, url);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      }
      try {
        var rq = indexedDB.open('bim_ootb_cache');
        rq.onsuccess = function () {
          var idb = rq.result;
          if (idb.objectStoreNames.contains('dbs')) { put(idb); return; }
          var v = idb.version; idb.close();
          var up = indexedDB.open('bim_ootb_cache', v + 1);
          up.onupgradeneeded = function () { var d = up.result; if (!d.objectStoreNames.contains('dbs')) d.createObjectStore('dbs'); };
          up.onsuccess = function () { put(up.result); };
          up.onerror = function () { resolve(false); };
        };
        rq.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
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

  // §GEO-SPLIT: lazily fetch+cache a resident's SEPARATE geometry-mesh db (Terminal_geo.db), reusing the
  // exact same IndexedDB cache pattern (_idbGetDb/_idbPutDb, its own URL key so it caches independently of
  // the meta db) — cache-first, else fetch+persist. Residents with no `geoDb` field resolve null IMMEDIATELY,
  // no network/IDB call at all (SampleHouse/Duplex/SampleCastle/SampleCastle-ARC are untouched).
  function _fetchGeoDb(res) {
    if (!res.geoDb) return Promise.resolve(null);
    var url = _modellerBase() + res.geoDb + ((res.geoV || res.v) ? '?v=' + (res.geoV || res.v) : '');
    return _idbGetDb(url).then(function (cached) {
      if (cached) {
        console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' geoDb cache-HIT (local) ' + (cached.byteLength / 1024 / 1024).toFixed(1) + 'MB');
        return cached;
      }
      console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' geoDb cache-MISS → fetch ' + url);
      return fetch(url).then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) {
          _idbPutDb(url, buf).then(function (p) {
            console.log(TAG + ' §STRWALK-CACHE ' + res.geoDb + ' persisted=' + p + ' (next Open is local) ' + (buf.byteLength / 1024 / 1024).toFixed(1) + 'MB');
          });
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
        _seedArcEditable(O, res.key, geoBuf);
      }).catch(function (e) {
        console.warn(TAG + ' §STRWALK-OPEN geoDb fetch failed for ' + res.key + ' — seeding meta-only (no real geometry)', e && e.message);
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
    if (!(window.swbRenderOps && O && O.commitSeedGroup)) return;
    try {
      var rr = window.swbRenderOps();
      if (!rr || !rr.ops.length) { console.log(TAG + ' §STRWALK-RENDER-WIRE ' + key + ' nothing to render (wall-bearing / 0 columns)'); return; }
      O.commitSeedGroup(rr.ops, 'strwalk-' + key).then(function (sr) {
        console.log(TAG + ' §STRWALK-RENDER-WIRE ' + key + ' STR skeleton columns=' + rr.columnN + ' girders=' + rr.girderN +
          ' committed=' + (sr.ids ? sr.ids.length : 0) + ' idempotent=' + !!sr.idempotent +
          ' section=' + rr.section.width.toFixed(3) + '×' + rr.section.depth.toFixed(3) + 'm');
      }).catch(function (e) { console.warn(TAG + ' §STRWALK-RENDER-WIRE failed ' + (e && e.message)); });
    } catch (e) { console.warn(TAG + ' §STRWALK-RENDER-WIRE threw ' + (e && e.message)); }
  }

  // Open a permanent resident: cache-first (local), else fetch the substrate from the modeller's GH
  // playground (../modeller/<db>) and cache it. GH Pages serves Range requests + gzip → fetch() auto-inflates.
  function openResident(res) {
    var url = _modellerBase() + res.db + (res.v ? '?v=' + res.v : '');
    _idbGetDb(url).then(function (cached) {
      if (cached) {
        console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' cache-HIT (local) ' + (cached.byteLength / 1024).toFixed(0) + 'KB');
        if (_openBuffer(cached, res.key)) _forkEditable(res);
        return;
      }
      console.log(TAG + ' §STRWALK-OPEN ' + res.key + ' cache-MISS → fetch ' + url);
      fetch(url).then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) {
          var ok = _openBuffer(buf, res.key);
          if (ok) {
            _forkEditable(res);
            _idbPutDb(url, buf).then(function (p) {
              console.log(TAG + ' §STRWALK-CACHE ' + res.db + ' persisted=' + p + ' (next Open is local) ' + (buf.byteLength / 1024).toFixed(0) + 'KB');
            });
          }
        })
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
            var commit = function (t, p, i, o) {
              return window.Bonsai.oplog.commit({ op_type: t, parameters: Object.assign({}, p, i ? { inputGuids: i } : {}) }, {});
            };
            var r = window.swbOnGridMove({ axis: m.axis, datum: pos, delta: delta }, commit, {});
            if (r) {
              // persist the edit as a compact REPLAY record so reopening the mo_ instance re-applies it
              // to the fresh walk (the visual restore). The walker snaps internally → store the raw datum.
              commit('STR_WALK_EDIT', { axis: m.axis, datum: pos, delta: delta }, null, null);
              lastEx = r.exceptions || []; if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
            }
          }
        }
      } catch (e) { console.warn(TAG + ' rewalk failed', e && e.message); }
      return res;
    };
    GM._strWrapped = true;
    console.log(TAG + ' wrapped Bonsai.gridmove.commit → STR re-walk on grid drag');
  }

  window.STRWalkerOutliner = {
    register: function () {
      if (window.Bonsai && window.Bonsai.outliner) window.Bonsai.outliner.addCategory(category());
      wrapGridMove();
      console.log(TAG + ' registered — STR Walker category + grid-drag re-walk (the wedge); Open re-homed to the pill rail');
    },
    _openStrDb: openStrDb, _category: category,
    _openResident: openResident, _openBuffer: _openBuffer, _residents: RESIDENTS, _modellerBase: _modellerBase
  };
})();
