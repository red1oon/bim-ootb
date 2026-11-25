// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bim-compiler prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8.10 item 4 (owner 2026-11-26: "no red pill, just link back"; Witness: W-BIM-LINK-KERNEL,
//   viewer/tests/witness_bim_link_kernel.js). The Project window's "BIM Model" field: C_Project.BIM_ViewerURL, display type URL (40), read-only, right after Description — the SAME
//   AD_Element / AD_Column / AD_Field rows (same UUs) the legacy plugin's 2Pack_13.1.1 creates (ad_bim_link_rows.js, generated from that 2Pack), the physical column, and the retired
//   BIM tab (AD_Tab 200500, UU b1a00100-…) made inactive as 13.1.1 does on legacy.
// An idempotent boot OVERLAY like ad_taxcat_overlay.js: NOT a line in patches/ad_seed.db.sql (hashed into the Team BASE, team_sync.js hashBase, no upgrade path). Identity is the UU, as in a
//   legacy Pack In: a row whose UU is present is left as is; a new row takes the next free id of its table (the same on every device: same base, same order); a reference by UU resolves to
//   the local id. Must run BEFORE BimOrdersOverlay (idempiere.html) so a pushed project's BIM_ViewerURL is copied, and on the Viewer's own ERP store (proj_order_state.js).
(function (global) {
  'use strict';
  function log(m) { try { console.log(m); } catch (e) {} }
  function data() { return global.AD_BIM_LINK_ROWS || (typeof module !== 'undefined' && module.exports ? require('./ad_bim_link_rows.js') : null); }
  var COL = 'BIM_ViewerURL';
  function cols(db, t) { try { var r = db.exec("SELECT name FROM pragma_table_info('" + t + "')"); return r.length ? r[0].values.map(function (x) { return String(x[0]); }) : []; } catch (e) { return []; } }
  function one(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
  // the physical table name as the db holds it (ad_seed.db is mixed-case: C_Project vs ad_field); null = absent
  function tbl(db, t) { var n = one(db, "SELECT name FROM sqlite_master WHERE type='table' AND lower(name)=lower(?)", [t]); return n == null ? null : String(n); }
  // ensure(db, opts) - a sql.js Database. Returns { column, inserted, present, tab, ms } (column: 'added' | 'present' | 'no-table').
  function ensure(db, opts) {
    var t0 = Date.now(), D = data(), ins = [], pres = 0, column = 'no-table', tab = '-';
    if (!D) { log('§BIMLINK_OVERLAY none (ad_bim_link_rows.js not loaded)'); return { column: column, inserted: 0, present: 0, tab: tab, ms: 0 }; }
    var cp = tbl(db, 'C_Project');
    if (!cp) { log('§BIMLINK_OVERLAY skipped (no C_Project on this host)'); return { column: column, inserted: 0, present: 0, tab: tab, ms: 0 }; }
    var have = cols(db, cp).map(function (c) { return c.toLowerCase(); });
    if (have.indexOf(COL.toLowerCase()) >= 0) column = 'present';
    else { db.run('ALTER TABLE "' + cp + '" ADD COLUMN ' + COL + ' TEXT'); column = 'added'; }
    var stamp = String(D.packCreated || '').slice(0, 19) || null;
    D.rows.forEach(function (row) {
      var t = tbl(db, row.table); if (!t) return;
      var tc = cols(db, t), byLower = {}; tc.forEach(function (c) { byLower[c.toLowerCase()] = c; });
      var pk = byLower[(row.table + '_id').toLowerCase()], uuc = byLower[(row.table + '_uu').toLowerCase()];
      if (row.table === 'AD_Tab') {   // the retired BIM tab: carry legacy's IsActive only (the tab row itself comes from the hashed patch)
        var want = row.vals.IsActive || 'N';
        db.run('UPDATE "' + t + '" SET IsActive=? WHERE ' + uuc + '=? AND IsActive<>?', [want, row.uu, want]);
        tab = String(one(db, 'SELECT IsActive FROM "' + t + '" WHERE ' + uuc + '=?', [row.uu]) || 'absent');
        return;
      }
      if (one(db, 'SELECT COUNT(*) FROM "' + t + '" WHERE ' + uuc + '=?', [row.uu])) { pres++; return; }
      var v = {};
      Object.keys(row.vals).forEach(function (k) { if (byLower[k.toLowerCase()]) v[byLower[k.toLowerCase()]] = row.vals[k]; });
      var ok = true;
      Object.keys(row.refs).forEach(function (k) {
        var c = byLower[k.toLowerCase()], r = row.refs[k]; if (!c) return;
        if (r.by === 'id') { v[c] = Number(r.key); return; }
        var rt = tbl(db, r.table), rc = rt && cols(db, rt).filter(function (x) { return x.toLowerCase() === (r.table + '_uu').toLowerCase(); })[0], rp = rt && cols(db, rt).filter(function (x) { return x.toLowerCase() === (r.table + '_id').toLowerCase(); })[0];
        var id = rc ? one(db, 'SELECT ' + rp + ' FROM "' + rt + '" WHERE ' + rc + '=?', [r.key]) : null;
        if (id == null) { ok = false; log('§BIMLINK_OVERLAY_ERR ' + row.table + ' ' + row.uu + ' reference ' + k + ' -> ' + r.table + ' ' + r.key + ' not found'); return; }
        v[c] = Number(id);
      });
      if (!ok) return;
      v[pk] = Number(one(db, 'SELECT COALESCE(MAX(' + pk + '),0)+1 FROM "' + t + '"'));
      ['Created', 'Updated'].forEach(function (k) { var c = byLower[k.toLowerCase()]; if (c && v[c] == null && stamp) v[c] = stamp; });
      ['CreatedBy', 'UpdatedBy'].forEach(function (k) { var c = byLower[k.toLowerCase()]; if (c && v[c] == null) v[c] = 100; });
      var ks = Object.keys(v);
      db.run('INSERT INTO "' + t + '" (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return v[k]; }));
      ins.push(row.table + '=' + v[pk]);
    });
    var out = { column: column, inserted: ins.length, present: pres, tab: tab, ms: Date.now() - t0 };
    log('§BIMLINK_OVERLAY ensure column=' + column + ' inserted=' + ins.length + (ins.length ? '(' + ins.join(',') + ')' : '') + ' present=' + pres + ' tab200500=' + tab + ' ms=' + out.ms +
      ' (C_Project.BIM_ViewerURL "BIM Model", URL, read-only; rows from the legacy 2Pack ' + (D.packVersion || '?') + '; boot overlay, outside the team base hash)');
    return out;
  }
  var API = { ensure: ensure, data: data, COLUMN: COL };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdBimLinkOverlay = API;
})(typeof window !== 'undefined' ? window : globalThis);
