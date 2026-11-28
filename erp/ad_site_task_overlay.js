// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SITE-TASK-ENSURE (bim-compiler prompts/MOBILE_PERF.md WO-25 "The desktop processor"; fix of the Team BASE hash moved by #3519). The Request Type "Site Task" and its Status Category are
//   ordinary rows (no dictionary or schema change): R_StatusCategory 990001, five R_Status 990001-990005, R_RequestType 990001. They are a boot OVERLAY, NOT a line of patches/ad_seed.db.sql: that file is hashed
//   into the Team BASE (team_sync.js hashBase) and no base-upgrade path exists, so a line there turned every already-paired team 'base-mismatch' (comm_store.js checkBase; its operations then go local-only,
//   team_sync.js "reason=base-mismatch"). Same class as ad_rule.js ensure(db), ad_import_tables.js, ad_docvalue_overlay.js: idempotent, device-local, outside the base identity, the SAME fixed ids and UUs on every
//   device (so a team member needs no synced op to hold them).
// ONE SOURCE: the statements below. erp/idempiere.html, erp/ws_kernel.js, erp/ws_server.js, erp/ws_kernel_web.js (boot) and viewer/mission_processor.js (a store made by the viewer) all call ensure(db) - nothing else
//   holds the rows. The SAME rows, with the SAME UUs, exist on the legacy pilot (bim-compiler scripts/bridge/pilot/site_task_status.sql). Ids sit in the high band the seed keeps for its own rows (990000+).
// Statuses in SeqNo order: New (default, open) -> Prepared (open) -> On site (open) -> Reported (open) -> Verified (closed, final close). Next_Status_ID follows that order. LEGACY NOTE (MStatus.java:268-282
//   beforeSave; RequestProcessor.java:431-437): legacy keeps Next_Status_ID only for a timeout (TimeoutDays > 0) and clears it on a save otherwise; the Request Processor moves a request on only when TimeoutDays > 0.
//   These rows set no timeout, so nothing moves by itself; the processor reads the order from SeqNo when Next_Status_ID is cleared.
// Determinism: no Date.now / Math.random in the rows (the timestamps are fixed text).
(function (global) {
  'use strict';
  function log(m) { try { console.log(m); } catch (e) {} }
  // [table, uu column, uu, id column, id, statement]: a row is added only when neither its id nor its UU is there (r_status has no unique key on the UU, so INSERT OR IGNORE alone is not enough).
  var ROWS = [
    ["r_statuscategory", "r_statuscategory_uu", "bdf15a57-436f-44d1-89f6-3925563cf296", "r_statuscategory_id", 990001,
      "INSERT OR IGNORE INTO r_statuscategory (r_statuscategory_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, help, isdefault, r_statuscategory_uu) VALUES (990001, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'Site Task', 'Status of a task done on site (BIM mission)', NULL, 'N', 'bdf15a57-436f-44d1-89f6-3925563cf296');"],
    ["r_status", "r_status_uu", "f42d4f70-60e7-42ea-b353-81a290de9552", "r_status_id", 990001,
      "INSERT OR IGNORE INTO r_status (r_status_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, help, isdefault, isopen, isclosed, value, next_status_id, update_status_id, timeoutdays, iswebcanupdate, isfinalclose, seqno, r_statuscategory_id, r_status_uu) VALUES (990001, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'New', 'Issued from the Project Order, not yet prepared', NULL, 'Y', 'Y', 'N', 'New', 990002, NULL, NULL, 'Y', 'N', 10, 990001, 'f42d4f70-60e7-42ea-b353-81a290de9552');"],
    ["r_status", "r_status_uu", "8c0b1bc3-1cba-4f37-8dd4-ae3d626da1da", "r_status_id", 990002,
      "INSERT OR IGNORE INTO r_status (r_status_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, help, isdefault, isopen, isclosed, value, next_status_id, update_status_id, timeoutdays, iswebcanupdate, isfinalclose, seqno, r_statuscategory_id, r_status_uu) VALUES (990002, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'Prepared', 'In a mission file made at the desktop', NULL, 'N', 'Y', 'N', 'Prepared', 990003, NULL, NULL, 'Y', 'N', 20, 990001, '8c0b1bc3-1cba-4f37-8dd4-ae3d626da1da');"],
    ["r_status", "r_status_uu", "6419e9a6-5088-4052-91a6-1f01ec1f8fce", "r_status_id", 990003,
      "INSERT OR IGNORE INTO r_status (r_status_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, help, isdefault, isopen, isclosed, value, next_status_id, update_status_id, timeoutdays, iswebcanupdate, isfinalclose, seqno, r_statuscategory_id, r_status_uu) VALUES (990003, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'On site', 'The person on site has started it', NULL, 'N', 'Y', 'N', 'On site', 990004, NULL, NULL, 'Y', 'N', 30, 990001, '6419e9a6-5088-4052-91a6-1f01ec1f8fce');"],
    ["r_status", "r_status_uu", "b969cfa5-c2b1-41cb-af6b-fe860afa02b6", "r_status_id", 990004,
      "INSERT OR IGNORE INTO r_status (r_status_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, help, isdefault, isopen, isclosed, value, next_status_id, update_status_id, timeoutdays, iswebcanupdate, isfinalclose, seqno, r_statuscategory_id, r_status_uu) VALUES (990004, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'Reported', 'The site report reached the office', NULL, 'N', 'Y', 'N', 'Reported', 990005, NULL, NULL, 'Y', 'N', 40, 990001, 'b969cfa5-c2b1-41cb-af6b-fe860afa02b6');"],
    ["r_status", "r_status_uu", "7019139b-3407-4efd-a42a-a5e012eb0c54", "r_status_id", 990005,
      "INSERT OR IGNORE INTO r_status (r_status_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, help, isdefault, isopen, isclosed, value, next_status_id, update_status_id, timeoutdays, iswebcanupdate, isfinalclose, seqno, r_statuscategory_id, r_status_uu) VALUES (990005, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'Verified', 'The office checked the report', NULL, 'N', 'N', 'Y', 'Verified', NULL, NULL, NULL, 'Y', 'Y', 50, 990001, '7019139b-3407-4efd-a42a-a5e012eb0c54');"],
    ["r_requesttype", "r_requesttype_uu", "be7c0c0c-4b1e-4fbb-ac29-3ad08c1d13a9", "r_requesttype_id", 990001,
      "INSERT OR IGNORE INTO r_requesttype (r_requesttype_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, isdefault, isselfservice, duedatetolerance, isemailwhenoverdue, isemailwhendue, isinvoiced, autoduedatedays, confidentialtype, isautochangerequest, isconfidentialinfo, r_statuscategory_id, isindexed, r_requesttype_uu, headercolor, contentcolor) VALUES (990001, 11, 0, 'Y', '2026-11-28 00:00:00', 100, '2026-11-28 00:00:00', 100, 'Site Task', 'A task done on site on one element of the model (BIM mission)', 'N', 'N', 7, 'N', 'N', 'N', NULL, 'C', 'N', 'N', 990001, 'Y', 'be7c0c0c-4b1e-4fbb-ac29-3ad08c1d13a9', NULL, NULL);"]
  ];
  // ensure(db) - a sql.js Database. Returns { added, present, skipped }; a host without the Request tables skips (counted). Idempotent.
  function ensure(db) {
    var added = 0, present = 0, skipped = 0;
    ROWS.forEach(function (r) {
      try {
        if (!db.exec('PRAGMA table_info("' + r[0] + '")').length) { skipped++; return; }
        var have = db.exec('SELECT 1 FROM "' + r[0] + '" WHERE "' + r[1] + '" = \'' + r[2] + '\' OR "' + r[3] + '" = ' + r[4] + ' LIMIT 1');
        if (have.length) { present++; return; }
        db.run(r[5]); added++;
      } catch (e) { skipped++; log('§SITE_TASK_ENSURE ' + r[0] + ' ' + r[4] + ' skipped: ' + (e && e.message)); }
    });
    log('§SITE_TASK_ENSURE added=' + added + ' present=' + present + ' skipped=' + skipped + ' (Request Type "Site Task" + its Status Category; boot overlay, outside the team base hash)');
    return { added: added, present: present, skipped: skipped };
  }
  var API = { ensure: ensure, ROWS: ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdSiteTaskOverlay = API;
})(typeof window !== 'undefined' ? window : globalThis);
