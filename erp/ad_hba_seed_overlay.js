// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE - W-HBA-SEED-PLUGIN (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §HBA-SEED-SPEC; coordinator ruling 2026-11-11). TWIN CARDINAL RULE: the ERP base seed equals legacy. Legacy
//   GardenWorld has 18 business partners; the shipped ad_seed.db also carries the HBA demo's party cluster (6 partners + their users, resources, leave, payroll movements, subscriptions: rows
//   with a 'hba-%' UU, baked by scripts/seed_hba_erp.js, PR #645). Those rows now come from the plugin plugins/hba_demo.mjs (installed, not started). This boot OVERLAY takes the baked copies
//   out of the working db, child tables first. Idempotent; NOT in the hashed patches (Team base hash unchanged - same reason as ad_taxcat_overlay.js). The raw ad_seed.db file is not edited
//   (no binary commit): the Viewer's own HBA lens reads the raw file and is unaffected.
(function (global) {
  'use strict';
  function log(m) { try { console.log(m); } catch (e) {} }
  var TABLES = ['c_subscription', 'hr_movement', 'hr_employee', 's_resourceunavailable', 's_resourceassignment', 's_resource', 'ad_user', 'c_bpartner'];   // child first; = erp/tools/gen_hba_demo_plugin.js CLUSTER reversed
  // ensure(db, opts) - a sql.js Database. opts.breakIt (witness only) skips the removal. Returns { removed, perTable }.
  function ensure(db, opts) {
    var removed = 0, per = {};
    if (opts && opts.breakIt) return { removed: 0, perTable: per };
    TABLES.forEach(function (t) {
      try {
        var info = db.exec("PRAGMA table_info(" + t + ")"); if (!info.length) return;
        var uu = info[0].values.map(function (c) { return String(c[1]); }).filter(function (n) { return /_uu$/i.test(n); })[0]; if (!uu) return;
        db.run("DELETE FROM " + t + " WHERE " + uu + " LIKE 'hba-%'"); var n = db.getRowsModified(); if (n) { per[t] = n; removed += n; }
      } catch (e) { log('§HBA_SEED_OVERLAY ' + t + ' skipped: ' + e.message); }
    });
    log('§HBA_SEED_OVERLAY ensure removed=' + removed + ' ' + JSON.stringify(per) + ' (base seed == legacy; the rows are plugin org.kernel.hba.demo, boot overlay outside the team base hash)');
    return { removed: removed, perTable: per };
  }
  var API = { ensure: ensure, TABLES: TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdHbaSeedOverlay = API;
})(typeof window !== 'undefined' ? window : globalThis);
