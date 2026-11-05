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
  var BIM_BASE = 990000, STORE_FILE = 'bim_project_orders.db', BASE_T = 'erp_base';
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
  // masked by a stale BIM band frozen into the idb seed cache. (the ERP_SEED_KEY idb blob can be persisted POST-overlay by a
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

  // overlay all BIM tables; returns { total, counts }. The viewer's tables hold the committed state (§DEL below), but the ERP's base must stay the row AS PUSHED: the signed op log folds over it, and a History reversal falls back to it.
  //   erp_base keeps, per row the ERP touched, the pushed values and what the last sync wrote. A column the ERP changed goes back to its pushed value here, unless the viewer has written that column since; a deleted row returns as a base row, under its tombstone.
  function overlayRows(srcDb, dstDb, tables) {
    var T = tables || TABLES, counts = {}, total = 0;
    for (var i = 0; i < T.length; i++) { var n = overlayTable(srcDb, dstDb, T[i]); counts[T[i]] = n; total += n; }
    var kept = 0, res = null;
    try { res = srcDb.exec('SELECT tbl, id, pushed, synced FROM ' + BASE_T); } catch (e) { res = null; }
    if (res && res.length) res[0].values.forEach(function (v) {
      var dcols = _cols(dstDb, v[0]), pk = _pk(dcols, v[0]); if (!pk) return;
      var pushed = JSON.parse(v[2]), synced = JSON.parse(v[3]), now = _rowOf(srcDb, v[0], pk, v[1]), row = {};
      Object.keys(pushed).forEach(function (c) { row[c] = (now && !_same(now[c], synced[c])) ? now[c] : pushed[c]; });
      var cols = dcols.filter(function (c) { return Object.prototype.hasOwnProperty.call(row, c.toLowerCase()); });
      try { dstDb.run('DELETE FROM "' + v[0] + '" WHERE "' + pk + '" = ?', [v[1]]);
        dstDb.run('INSERT INTO "' + v[0] + '" ("' + cols.join('","') + '") VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return row[c.toLowerCase()]; })); kept++; } catch (e) {}
    });
    if (kept) counts.erp_base = kept;
    return { total: total, counts: counts };
  }
  function _same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }
  function _rowOf(db, table, pk, id) { var r = db.exec('SELECT * FROM "' + table + '" WHERE "' + pk + '" = ' + Number(id)); if (!r.length) return null; var o = {}; r[0].columns.forEach(function (c, i) { o[c.toLowerCase()] = r[0].values[0][i]; }); return o; }

  // §DEL / §PROJ-VARIANCE gap 2 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md): the WRITE side. A committed or reversed ERP op on a pushed row reaches the store the viewer reads, so both apps show one project. Generic: it copies the
  //   committed state (base + signed tip) of each touched row, whatever the op was; rows the store never held (a seed-baked band row, a row created in the ERP) are left out. A deleted row leaves the viewer's tables but keeps its id
  //   (proj_fold._allocator reads erp_base: a reused id would sit under the old tombstone). The store is one file, so one write rewrites it (the viewer's own format; storeStamp() tells an open viewer tab to reload).
  function touched(rows) {
    var names = {}, out = [], seen = {}; TABLES.forEach(function (t) { names[t.toLowerCase()] = t; });
    (rows || []).forEach(function (r) { var p = r && r.parameters; if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
      var t = p && p.table ? names[String(p.table).toLowerCase()] : null, id = p ? Number(p.id) : NaN;
      if (t && id >= BIM_BASE && !seen[t + id]) { seen[t + id] = 1; out.push({ table: t, id: id }); } });
    return out;
  }
  var _queue = Promise.resolve();
  function syncRows(SQL, tipQuery, list) {   // tipQuery(sql) -> rows with lower-case keys. Read now: the tip is the state of THIS commit; the file work is queued so two commits never interleave a read-modify-write.
    var items = list.map(function (x) { var pk = (x.table + '_ID'); return { table: x.table, id: x.id, row: tipQuery('SELECT * FROM ' + x.table + ' WHERE ' + pk + ' = ' + x.id)[0] || null }; });
    var t0 = Date.now();
    _queue = _queue.then(function () {
      return navigator.storage.getDirectory().then(function (root) { return root.getDirectoryHandle('bim_analysis'); }).then(function (dir) { return dir.getFileHandle(STORE_FILE); })
        .then(function (fh) { return fh.getFile().then(function (f) { return f.arrayBuffer(); }).then(function (buf) {
          var db = new SQL.Database(new Uint8Array(buf)), n = { updated: 0, deleted: 0, restored: 0, absent: 0 };
          try {
            db.run('CREATE TABLE IF NOT EXISTS ' + BASE_T + ' (tbl TEXT, id INTEGER, pushed TEXT, synced TEXT, PRIMARY KEY (tbl, id))');
            items.forEach(function (it) { applyToStore(db, it, n); });
            if (!n.updated && !n.deleted && !n.restored) { console.log('§BIM_PUSH_WRITE none rows=' + items.length + ' absent=' + n.absent); return; }
            var out = db.export();
            return fh.createWritable().then(function (w) { return w.write(out).then(function () { return w.close(); }); }).then(function () {
              console.log('§BIM_PUSH_WRITE updated=' + n.updated + ' deleted=' + n.deleted + ' restored=' + n.restored + ' absent=' + n.absent + ' bytes=' + out.length + ' ms=' + (Date.now() - t0)); });
          } finally { db.close(); }
        }); });
    }).catch(function (e) { if (e && e.name === 'NotFoundError') return; console.log('§BIM_PUSH_WRITE error ' + (e && e.message)); });
    return _queue;
  }
  function applyToStore(db, it, n) {
    var cols = _cols(db, it.table), pk = _pk(cols, it.table); if (!pk) { n.absent++; return; }
    var cur = _rowOf(db, it.table, pk, it.id), kept = db.exec('SELECT pushed FROM ' + BASE_T + " WHERE tbl='" + it.table + "' AND id=" + it.id), pushed = kept.length ? JSON.parse(kept[0].values[0][0]) : cur;
    if (!cur && !kept.length) { n.absent++; return; }              // not a pushed row: the store never held it
    if (!it.row) {                                                 // deleted in the ERP
      if (!cur) { n.absent++; return; }
      db.run('INSERT OR REPLACE INTO ' + BASE_T + ' (tbl, id, pushed, synced) VALUES (?,?,?,?)', [it.table, it.id, JSON.stringify(pushed), JSON.stringify(cur)]);
      db.run('DELETE FROM "' + it.table + '" WHERE "' + pk + '" = ' + it.id); n.deleted++; return;
    }
    var use = cols.filter(function (c) { return Object.prototype.hasOwnProperty.call(it.row, c.toLowerCase()); }), vals = use.map(function (c) { var v = it.row[c.toLowerCase()]; return v === undefined ? null : v; }), synced = {};
    Object.keys(pushed).forEach(function (c) { synced[c] = pushed[c]; }); use.forEach(function (c, i) { synced[c.toLowerCase()] = vals[i]; });
    if (cur) { db.run('UPDATE "' + it.table + '" SET ' + use.map(function (c) { return '"' + c + '" = ?'; }).join(',') + ' WHERE "' + pk + '" = ' + it.id, vals); n.updated++; }
    else { db.run('INSERT INTO "' + it.table + '" ("' + use.join('","') + '") VALUES (' + use.map(function () { return '?'; }).join(',') + ')', vals); n.restored++; }
    db.run('INSERT OR REPLACE INTO ' + BASE_T + ' (tbl, id, pushed, synced) VALUES (?,?,?,?)', [it.table, it.id, JSON.stringify(pushed), JSON.stringify(synced)]);
  }

  // browser: read the OPFS store the viewer pushes wrote, overlay onto the live ERP db.
  function apply(SQL, dstDb) {
    if (!SQL || !dstDb || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
      return Promise.resolve({ total: 0, counts: {}, src: 'none' });
    }
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle('bim_analysis'); })
      .then(function (dir) { return dir.getFileHandle(STORE_FILE); })
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

  var API = { overlayRows: overlayRows, overlayTable: overlayTable, apply: apply, touched: touched, syncRows: syncRows, BIM_BASE: BIM_BASE, TABLES: TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BimOrdersOverlay = API;
})(typeof self !== 'undefined' ? self : this);
