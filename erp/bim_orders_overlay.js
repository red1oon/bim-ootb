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
// The OPFS push is AUTHORITATIVE: overlayTable CLEARS the dst BIM band, then INSERTs (was INSERT OR IGNORE).
// The idb seed cache is written from RAW seed bytes BEFORE this overlay — but a LATER action (demo-tenant
// install / seed reset / genesis / tenant delete) can persist the already-overlaid db back into the cache,
// freezing a stale band; clearing-then-inserting makes a fresh push immune to that (round-trip regression fix).
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

  // Copy BIM rows (PK >= BIM_BASE) of one table from srcDb (OPFS) into dstDb. The OPFS push is AUTHORITATIVE:
  // when OPFS has band rows for this table we CLEAR the dst band first, then INSERT — so a fresh push is NEVER
  // masked by a stale BIM band frozen into the idb seed cache. (ad_seed_v16 can be persisted POST-overlay by a
  // demo-tenant install / seed reset / genesis / tenant delete → it captures the overlaid band; the old
  // INSERT OR IGNORE then silently skipped the new push on the PK collision = the round-trip regression.)
  // W-BIM-OVERLAY-AUTHORITATIVE. The push/OPFS-write path is untouched (revert-safe).
  function overlayTable(srcDb, dstDb, table) {
    var dcols = _cols(dstDb, table); if (!dcols.length) return 0;
    var pk = _pk(dcols, table); if (!pk) return 0;
    var res;
    try { res = srcDb.exec('SELECT * FROM "' + table + '" WHERE "' + pk + '" >= ' + BIM_BASE); }
    catch (e) { return 0; }
    if (!res.length || !res[0].values.length) return 0;
    var c = res[0].columns, vals = res[0].values, n = 0;
    // PER-PK authoritative replace: drop ONLY the dst rows whose PK the OPFS push actually provides, then insert.
    // NOT a band-wide wipe — the seed itself carries band rows (e.g. the Hospital twin C_Project 990000) that are
    // NOT in OPFS and must survive. So OPFS overwrites its own pushed rows; seed-baked band rows are untouched.
    var pkIdx = -1; for (var k = 0; k < c.length; k++) if (c[k].toLowerCase() === pk.toLowerCase()) { pkIdx = k; break; }
    var del = 'DELETE FROM "' + table + '" WHERE "' + pk + '" = ?';
    var sql = 'INSERT INTO "' + table + '" ("' + c.join('","') + '") VALUES (' + c.map(function () { return '?'; }).join(',') + ')';
    for (var i = 0; i < vals.length; i++) {
      try { if (pkIdx >= 0) dstDb.run(del, [vals[i][pkIdx]]); dstDb.run(sql, vals[i]); n++; } catch (e) {}
    }
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
