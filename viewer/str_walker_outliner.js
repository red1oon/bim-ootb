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

  function tabRows() {
    var d = window.swbTabData && window.swbTabData();
    if (!d) return [{ id: 'sw-empty', label: 'Open an STR building (🏗) to walk', sub: '' }];
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

  // Open an extracted.db and init the walker from its STR columns (the walk anchors).
  function openStrDb(file) {
    if (!window.SQL) { console.warn(TAG + ' sql.js not ready'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var db = new window.SQL.Database(new Uint8Array(fr.result));
        var st = window.swbInit(db);   // §STRWALK-INIT logged by the bridge
        db.close();
        ready = !!st; lastEx = [];
        if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
        console.log(TAG + ' init from "' + (file.name || 'db') + '" ready=' + ready);
      } catch (e) { console.warn(TAG + ' open failed', e && e.message); }
    };
    fr.readAsArrayBuffer(file);
  }

  // One-click: fetch a pre-converted extracted.db by URL (the IFC→DB conversion already done at the
  // Viewer) and init the walker directly — the GH-hosted Terminal RosettaStone for the str-walk demo.
  function openStrUrl(url) {
    if (!window.SQL) { console.warn(TAG + ' sql.js not ready'); return; }
    console.log(TAG + ' fetching ' + url);
    fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        var db = new window.SQL.Database(new Uint8Array(buf));
        var st = window.swbInit(db);   // §STRWALK-INIT logged by the bridge
        db.close();
        ready = !!st; lastEx = [];
        if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
        console.log(TAG + ' init from ' + url + ' ready=' + ready);
      }).catch(function (e) { console.warn(TAG + ' url load failed', e && e.message); });
  }

  function mountButton() {
    if (document.getElementById('strwalk-open')) return;
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.db,.sqlite';
    inp.style.display = 'none'; inp.id = 'strwalk-file';
    inp.onchange = function () { if (inp.files && inp.files[0]) openStrDb(inp.files[0]); };
    document.body.appendChild(inp);
    var btn = document.createElement('button'); btn.id = 'strwalk-open'; btn.title = 'Open an STR building → walk the structure';
    btn.textContent = '🏗 STR';
    btn.style.cssText = 'position:fixed;top:8px;left:336px;z-index:30;background:#1b1d23;color:#c7cdd8;' +
      'border:1px solid #2c303a;border-radius:6px;padding:5px 10px;font:12px system-ui;cursor:pointer';
    btn.onclick = function () { inp.click(); };
    document.body.appendChild(btn);
    // One-click demo: open the GH-hosted, pre-converted Terminal RosettaStone directly.
    var demo = document.createElement('button'); demo.id = 'strwalk-demo';
    demo.title = 'Open the GH-hosted Terminal RosettaStone → walk + calibrated confidence';
    demo.textContent = 'Terminal ▸';
    demo.style.cssText = 'position:fixed;top:8px;left:398px;z-index:30;background:#1b1d23;color:#c7cdd8;' +
      'border:1px solid #2c303a;border-radius:6px;padding:5px 10px;font:12px system-ui;cursor:pointer';
    demo.onclick = function () { openStrUrl('buildings/Terminal_extracted.db'); };
    document.body.appendChild(demo);
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
            if (r) { lastEx = r.exceptions || []; if (window.Bonsai.outliner) window.Bonsai.outliner.refresh(); }
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
    _openStrDb: openStrDb, _openStrUrl: openStrUrl, _category: category
  };
})();
