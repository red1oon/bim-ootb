/**
 * BIM OOTB — bim_embed.js — the DETECT (read) face of the BIM-in-window embed seam.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * A "BIM set" is declared as a STANDARD AD_Attachment row (AD_Table.AD_Table_ID=254) whose
 * `title` is sentinel-tagged 'BIM Set: <name>' and whose `textmsg` holds the viewer-DB URL
 * (DisplayType URL=40 semantics). The renderer's "AD flag" is therefore: does (AD_Table_ID,
 * Record_ID) own a BIM-set attachment? — ONE keyed query, NEVER `if window==130`. Any table
 * supporting attachments lights up for free (the generality proof).
 *
 * NON-INVENT: this rides the standard iDempiere AD_Attachment construct (verified in ad_seed.db,
 * AD_Table_ID 254). The URL value is our app's declaration. See
 * prompts/BIM_EMBED_WINDOW_SESSION.md §B0/§B1. Witness: scripts/poc_bim_embed.js (W-BIM-EMBED-DECLARE).
 */
(function (global) {
  'use strict';

  var BIM_SET_PREFIX = 'BIM Set:';
  var ATTACH_TABLE_ID = 254;  // AD_Table.AD_Table_ID for AD_Attachment (verified ad_seed.db)

  // sql.js helper — run a SELECT, return an array of plain row-objects.
  function _rows(db, sql, params) {
    var st = db.prepare(sql);
    if (params) st.bind(params);
    var out = [];
    while (st.step()) out.push(st.getAsObject());
    st.free();
    return out;
  }

  /**
   * bimSetFor — the renderer's AD flag. Returns {id,title,url} for the first ACTIVE BIM-set
   * attachment on (adTableId, recordId), or null when the record owns none (→ panel absent,
   * honest, not an empty frame). A BIM-set tag with an empty URL resolves null too.
   */
  function bimSetFor(db, adTableId, recordId) {
    var rows = _rows(db,
      "SELECT ad_attachment_id AS id, title, textmsg AS url FROM ad_attachment " +
      "WHERE ad_table_id=? AND record_id=? AND title LIKE ? " +
      "AND (isactive IS NULL OR isactive='Y') ORDER BY ad_attachment_id LIMIT 1",
      [adTableId, recordId, BIM_SET_PREFIX + '%']);
    if (!rows.length) return null;
    var r = rows[0];
    if (!r.url) return null;
    return { id: r.id, title: r.title, url: r.url };
  }

  /**
   * insertBimSet — idempotent DECLARE. Drops any prior BIM-set row for (adTableId,recordId),
   * then inserts ONE standard AD_Attachment with the sentinel title + url. Returns the new id.
   * ONE code path shared by scripts/seed_bim_attachment.js AND the witness (non-invent).
   * o = {adTableId, recordId, name, url, clientId, orgId, now?, uu?}
   */
  function insertBimSet(db, o) {
    db.run("DELETE FROM ad_attachment WHERE ad_table_id=? AND record_id=? AND title LIKE ?",
      [o.adTableId, o.recordId, BIM_SET_PREFIX + '%']);
    var mx = _rows(db, "SELECT COALESCE(MAX(ad_attachment_id),1000000) AS mx FROM ad_attachment")[0].mx;
    var id = mx + 1;
    var title = BIM_SET_PREFIX + ' ' + (o.name || ('Record ' + o.recordId));
    var now = o.now || '2026-06-17 00:00:00';
    var uu = o.uu || ('bimset-' + o.adTableId + '-' + o.recordId);
    db.run(
      "INSERT INTO ad_attachment " +
      "(ad_attachment_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, " +
      " ad_table_id, record_id, title, textmsg, ad_attachment_uu) " +
      "VALUES (?,?,?,'Y',?,100,?,100,?,?,?,?,?)",
      [id, o.clientId, o.orgId, now, now, o.adTableId, o.recordId, title, o.url, uu]);
    return id;
  }

  // resolve AD_Table.AD_Table_ID from a table name (case-insensitive; ad_seed.db is mixed-case).
  function tableId(db, tableName) {
    var rows = _rows(db, "SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=lower(?) LIMIT 1",
      [tableName]);
    return rows.length ? rows[0].id : null;
  }

  // bimSetForTable — the renderer's convenience flag: resolve by table NAME (what the active tab carries),
  // not the numeric AD_Table_ID. Returns {id,title,url} | null. No if-window==130 anywhere.
  function bimSetForTable(db, tableName, recordId) {
    var tid = tableId(db, tableName);
    if (tid == null) return null;
    return bimSetFor(db, tid, recordId);
  }

  // ── Declared BIM-set seed (the in-app declaration) ──────────────────────────────────────────────
  // Applied to the LOADED db at boot (ensureSeedBimSets) rather than baked into ad_seed.db — so there is
  // NO 26MB binary churn and it auto-survives a seed re-export (no re-apply needed). Each entry is a
  // standard AD_Attachment row. NON-INVENT: the URL points at a REAL served viewer building.
  var SEED_BIM_SETS = [
    // Project Order (C_Project 203) — the driving case.
    { adTableId: 203, recordId: 101, name: 'Landscape Complex (Hospital model)',
      url: '../viewer/viewer.html?db=buildings/Hospital_extracted.db&bld=Hospital', clientId: 11, orgId: 11 },
    // GENERALITY (§B4): a SECOND, non-Project table — M_Warehouse (190) record 103 "HQ Warehouse" — lights the
    // SAME "Open Model" affordance with ZERO new render code, purely from this AD flag. This is the framework proof.
    { adTableId: 190, recordId: 103, name: 'HQ Warehouse (Terminal model)',
      url: '../viewer/viewer.html?db=buildings/Terminal_extracted.db&bld=Terminal', clientId: 11, orgId: 11 }
  ];

  // ensureSeedBimSets — idempotently declare the SEED_BIM_SETS onto the loaded db (boot hook). Only inserts
  // a row that is absent, so a runtime/user-added BIM set is never clobbered. Returns the count present.
  function ensureSeedBimSets(db) {
    if (!db) return 0;
    var n = 0;
    SEED_BIM_SETS.forEach(function (o) {
      try { if (!bimSetFor(db, o.adTableId, o.recordId)) insertBimSet(db, o); n++; } catch (e) {}
    });
    return n;
  }

  // count of active BIM-set rows on a record (idempotency check helper).
  function bimSetCount(db, adTableId, recordId) {
    return _rows(db,
      "SELECT COUNT(*) AS n FROM ad_attachment WHERE ad_table_id=? AND record_id=? AND title LIKE ? " +
      "AND (isactive IS NULL OR isactive='Y')",
      [adTableId, recordId, BIM_SET_PREFIX + '%'])[0].n;
  }

  var API = {
    bimSetFor: bimSetFor, bimSetForTable: bimSetForTable, tableId: tableId,
    insertBimSet: insertBimSet, bimSetCount: bimSetCount,
    ensureSeedBimSets: ensureSeedBimSets, SEED_BIM_SETS: SEED_BIM_SETS,
    BIM_SET_PREFIX: BIM_SET_PREFIX, ATTACH_TABLE_ID: ATTACH_TABLE_ID
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.BimEmbed = API; else if (global) global.BimEmbed = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
