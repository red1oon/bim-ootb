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
  var RESIDENTS = [
    { key: 'SampleHouse',  label: 'SampleHouse · wall-bearing',         db: 'SampleHouse_extracted.db' },
    { key: 'Duplex',       label: 'Duplex · wall-bearing',             db: 'Duplex_extracted.db' },
    { key: 'SampleCastle', label: 'SampleCastle · column-framed',      db: 'SampleCastle_extracted.db' },
    { key: 'Terminal',     label: 'Terminal · column-framed (oracle)', db: 'Terminal_meta.db' }
  ];

  // The modeller's own GH-Pages playground base — relative to viewer/modeller.html → repo-root modeller/.
  // NO OCI: the modeller is fully isolated from the viewer's cloud hosting (§101 Drift Law).
  function _modellerBase() { return '../modeller/'; }

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
      var st = window.swbInit(db);   // §STRWALK-INIT logged by the bridge
      // Same meta.db ALSO seeds the bom-graph tab (DISC/ARC): building→storey→room→disc→class→element.
      if (window.BOMTreeOutliner && window.BOMTreeOutliner.loadFromDb) {
        try { window.BOMTreeOutliner.loadFromDb(db, name); } catch (e) { console.warn(TAG + ' bom-graph seed failed', e && e.message); }
      }
      // Derive the typed cross-edges (the GRAPH half) on-the-fly from the bbox substrate — kept pristine,
      // not baked. Slice 1 = `abuts` (face-touch); stashed on window for the bom-graph render.
      if (window.CrossEdges && window.CrossEdges.deriveAdjacency) {
        try {
          var abuts = window.CrossEdges.deriveAdjacency(db);
          window.swXEdges = { abuts: abuts };
          console.log(TAG + ' §XEDGE-ABUTS ' + abuts.length + ' face-touch edges derived (provenance=derived:face-touch)');
        } catch (e) { console.warn(TAG + ' cross-edge derive failed', e && e.message); }
      }
      db.close();
      ready = !!st; lastEx = [];
      if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
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

  // Fork the per-building EDITABLE INSTANCE (op-log key 'mo_<building>') so this resident's signed edits
  // fold into its own instance while the loaded meta.db REFERENCE (the IDB cache entry) stays pristine.
  // Once the instance's op-log is loaded, replay its recorded edits back into the fresh walk.
  function _forkEditable(res) {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (O && O.setModelKey) O.setModelKey('mo_' + res.key).then(function (n) {
      console.log(TAG + ' §STRWALK-MO editable instance mo_' + res.key + ' active ops=' + n + ' (reference meta.db stays pristine)');
      _replayEdits();
    });
  }

  // Open a permanent resident: cache-first (local), else fetch the substrate from the modeller's GH
  // playground (../modeller/<db>) and cache it. GH Pages serves Range requests + gzip → fetch() auto-inflates.
  function openResident(res) {
    var url = _modellerBase() + res.db;
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

  function mountButton() {
    if (document.getElementById('strwalk-open')) return;
    // ▾ resident picker — the guided drop surface (cloud → local cache → walk).
    var sel = document.createElement('select'); sel.id = 'strwalk-resident';
    sel.title = 'Open a resident building (fetched from the cloud, then cached on your device)';
    sel.style.cssText = 'position:fixed;top:8px;left:336px;z-index:30;background:#1b1d23;color:#c7cdd8;' +
      'border:1px solid #2c303a;border-radius:6px;padding:5px 8px;font:12px system-ui;cursor:pointer';
    var ph = document.createElement('option'); ph.value = ''; ph.textContent = '▾ Open building…'; sel.appendChild(ph);
    RESIDENTS.forEach(function (r) { var o = document.createElement('option'); o.value = r.key; o.textContent = r.label; sel.appendChild(o); });
    sel.onchange = function () { var r = RESIDENTS.filter(function (x) { return x.key === sel.value; })[0]; if (r) openResident(r); sel.value = ''; };
    document.body.appendChild(sel);
    // 🏗 STR — open a LOCAL .db (kept alongside the curated residents).
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.db,.sqlite';
    inp.style.display = 'none'; inp.id = 'strwalk-file';
    inp.onchange = function () { if (inp.files && inp.files[0]) openStrDb(inp.files[0]); };
    document.body.appendChild(inp);
    var btn = document.createElement('button'); btn.id = 'strwalk-open'; btn.title = 'Open a local STR building file → walk the structure';
    btn.textContent = '🏗';
    btn.style.cssText = 'position:fixed;top:8px;left:486px;z-index:30;background:#1b1d23;color:#c7cdd8;' +
      'border:1px solid #2c303a;border-radius:6px;padding:5px 10px;font:12px system-ui;cursor:pointer';
    btn.onclick = function () { inp.click(); };
    document.body.appendChild(btn);
  }

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
      mountButton();
      wrapGridMove();
      console.log(TAG + ' registered — STR Walker category + 🏗 open + grid-drag re-walk (the wedge)');
    },
    _openStrDb: openStrDb, _category: category,
    _openResident: openResident, _openBuffer: _openBuffer, _residents: RESIDENTS, _modellerBase: _modellerBase
  };
})();
