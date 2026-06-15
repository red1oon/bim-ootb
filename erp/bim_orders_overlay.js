/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bim_orders_overlay.js — BIM → Project round-trip §B (docs/BIMtoERP.md §B write-path).
//
// The viewer's > ERP (proj_fold) and > VO (vo_fold) pushes write a folded copy of ad_seed.db to
// OPFS (bim_analysis/bim_project_orders.db) — the SAME origin as the ERP app. This module is the
// READ side: at idempiere.html boot it overlays the BIM-folded rows (the high PK band, >= BIM_BASE)
// from that OPFS db onto the freshly-loaded ad_seed.db, so a pushed Project Order AND its VO
// amendments appear in the STANDARD C_Project / C_Order windows — completing the round-trip.
//
// Why overlay-the-delta (not load-the-whole-file): the base stays the live ad_seed.db (never stale),
// and only the BIM rows (PK >= 990000, the band proj_fold/vo_fold allocate in) are layered on top.
// INSERT OR IGNORE on the PK → idempotent (re-boot / re-push adds nothing already present). The idb
// seed cache is written from the RAW seed bytes BEFORE this overlay, so the cache is never polluted.
//
// Dual export: node (require → tests/poc_bim_overlay.js) + browser (window.BimOrdersOverlay).
(function (global) {
  'use strict';
  var BIM_BASE = 990000;
  // parent → child order (no FK enforcement in sql.js, but keep it sane for any future ATTACH path).
  var TABLES = ['M_Product_Category', 'M_Product', 'C_Project', 'C_ProjectPhase', 'C_ProjectTask',
    'C_ProjectLine', 'C_Order', 'C_OrderLine'];

  function _cols(db, table) {
    try { var r = db.exec("SELECT name FROM pragma_table_info('" + table + "')"); return (r.length ? r[0].values.map(function (x) { return x[0]; }) : []); }
    catch (e) { return []; }
  }
  // the PK column, case-insensitively (ad_seed.db is mixed-case: C_Project_ID vs c_projectline_id).
  function _pk(cols, table) {
    var want = (table + '_id').toLowerCase();
    for (var i = 0; i < cols.length; i++) if (cols[i].toLowerCase() === want) return cols[i];
    return cols.length ? cols[0] : null;
  }

  // copy BIM rows (PK >= BIM_BASE) of one table from srcDb into dstDb; INSERT OR IGNORE → idempotent.
  function overlayTable(srcDb, dstDb, table) {
    var dcols = _cols(dstDb, table); if (!dcols.length) return 0;
    var pk = _pk(dcols, table); if (!pk) return 0;
    var res;
    try { res = srcDb.exec('SELECT * FROM "' + table + '" WHERE "' + pk + '" >= ' + BIM_BASE); }
    catch (e) { return 0; }
    if (!res.length || !res[0].values.length) return 0;
    var c = res[0].columns, vals = res[0].values, n = 0;
    var sql = 'INSERT OR IGNORE INTO "' + table + '" ("' + c.join('","') + '") VALUES (' + c.map(function () { return '?'; }).join(',') + ')';
    for (var i = 0; i < vals.length; i++) { try { dstDb.run(sql, vals[i]); n++; } catch (e) {} }
    return n;
  }

  // overlay all BIM tables; returns { total, counts }.
  function overlayRows(srcDb, dstDb, tables) {
    var T = tables || TABLES, counts = {}, total = 0;
    for (var i = 0; i < T.length; i++) { var n = overlayTable(srcDb, dstDb, T[i]); counts[T[i]] = n; total += n; }
    return { total: total, counts: counts };
  }

  // browser: read the OPFS store the viewer pushes wrote, overlay onto the live ERP db.
  function apply(SQL, dstDb) {
    if (!SQL || !dstDb || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
      return Promise.resolve({ total: 0, counts: {}, src: 'none' });
    }
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle('bim_analysis'); })
      .then(function (dir) { return dir.getFileHandle('bim_project_orders.db'); })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.arrayBuffer(); })
      .then(function (buf) {
        var srcDb = new SQL.Database(new Uint8Array(buf));
        var r = overlayRows(srcDb, dstDb, TABLES);
        srcDb.close();
        r.src = 'opfs';
        console.log('§BIM_OVERLAY rows=' + r.total + ' ' + JSON.stringify(r.counts));
        return r;
      })
      .catch(function (e) { console.log('§BIM_OVERLAY none (' + (e && e.name || e && e.message || 'no store') + ')'); return { total: 0, counts: {}, src: 'none' }; });
  }

  var API = { overlayRows: overlayRows, overlayTable: overlayTable, apply: apply, BIM_BASE: BIM_BASE, TABLES: TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BimOrdersOverlay = API;
})(typeof self !== 'undefined' ? self : this);
