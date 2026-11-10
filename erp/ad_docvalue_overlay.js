// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOCVALUE-WF (bim-ootb prompts/CAPEX_DASHBOARD.md §11.1): the document-value workflows legacy starts after a save (DocWorkflowManager; GardenWorld 131 "Business Partner Approval")
//   need their AD_Workflow / AD_WF_Node / AD_WF_NodeNext rows on the twin. The hashed patch ships only the DocAction workflows; these rows come as an idempotent boot OVERLAY (the ad_index_overlay.js /
//   ad_import_tables.js pattern), so the Team BASE hash does not move. Rows: ad_docvalue_wf.js, generated from the reference DB (patches/build_docvalue_overlay.py). A host without the workflow tables skips (counted).
(function (global) {
  'use strict';
  function log(m) { try { console.log(m); } catch (e) {} }
  function list() { return global.AD_DOCVALUE_WF || (typeof module !== 'undefined' && module.exports ? require('./ad_docvalue_wf.js') : []); }
  // ensure(db) - a sql.js Database. Returns { applied, skipped, ms }.
  function ensure(db) {
    var t0 = Date.now(), ok = 0, skip = 0, have = {}, touched = {};
    (list() || []).forEach(function (st) {
      var t = (/INTO (\w+)/.exec(st) || [])[1];
      if (!(t in have)) { try { have[t] = !!db.exec('PRAGMA table_info("' + t + '")').length; } catch (e) { have[t] = false; } }
      if (!have[t]) { skip++; return; }
      try { db.run(st); ok++; touched[t] = 1; } catch (e) { skip++; }
    });
    // F1: ad_workflow / ad_wf_node have no key, so INSERT OR IGNORE re-added the rows on every reload of a persisted db: heal whole-row duplicates (seed_patch.js)
    var SP = global.SeedPatch || (typeof module !== 'undefined' && module.exports ? require('./seed_patch.js') : null); if (SP) SP.dedupe(db, touched);
    var out = { applied: ok, skipped: skip, ms: Date.now() - t0 };
    log('§DOCVALUE_OVERLAY ensure applied=' + ok + ' skipped=' + skip + ' ms=' + out.ms + ' (document-value workflows, DocWorkflowManager; boot overlay, outside the team base hash)');
    return out;
  }
  var API = { ensure: ensure, list: list };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdDocValueOverlay = API;
})(typeof window !== 'undefined' ? window : globalThis);
