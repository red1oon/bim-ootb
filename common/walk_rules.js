// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (SEAM-W3C · prompts/SEAM_IDENTITY_AUDIT.md F8)
// SCOPE: the ONE owner of "which WALK RULES DB does this building use" (the Modeller's disc walk). The rule is the former
//        modeller.html `_dwRules` verbatim (WalkerDoctrine.md §1 LOCKED: SH/DX/SC/Duplex/SampleHouse/SampleCastle ->
//        duplex_rules.db; farm/shed -> farm_rules.db; everything else -> terminal_rules.db, the LOD400 reference).
// NOT the building-TYPE question: the Find-panel PLANT_ROOM gate (viewer/nf_tree_lens.js, modeller/building_parts_outliner.js
//        `_buildingClass`) deliberately mirrors config/building_taxonomy.yaml's classes and hides PLANT_ROOM on unlisted
//        buildings — ruled in bim-compiler prompts/FIND_PANEL_PLANT_ROOM_GATE_FIX.md (2026-07-11). Do not "unify" it with this.
// Witness: modeller/tests/witness_seam_w3_class.js — read the §WALK_RULES log after every run.
(function (root) {
  'use strict';
  var RESIDENTIAL_RE = /duplex|sample.?house|sample.?castle|schependomlaan|(^|[^A-Z])(SH|DX|SC)([^A-Z]|$)/i;
  var FARM_RE = /shed|farm|barn|poultry|livestock|broiler/i;
  var RULES_DBS = ['duplex_rules.db', 'terminal_rules.db', 'farm_rules.db'];
  var CLASS_OF = { 'duplex_rules.db': 'residential', 'terminal_rules.db': 'terminal', 'farm_rules.db': 'farm' };

  function rulesDb(name) {
    var s = name || '';
    if (FARM_RE.test(s)) return 'farm_rules.db';
    return RESIDENTIAL_RE.test(s) ? 'duplex_rules.db' : 'terminal_rules.db';
  }
  function buildingClass(name) {
    var db = rulesDb(name);
    return { cls: CLASS_OF[db], rulesDb: db };
  }
  var API = { rulesDb: rulesDb, buildingClass: buildingClass, RULES_DBS: RULES_DBS.slice() };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.WalkRules = API;
})(typeof window !== 'undefined' ? window : this);
