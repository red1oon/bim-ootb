/**
 * BIM OOTB — Building Parts Outliner category (Stairway / Lift Shaft / Plant Room).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// building_parts_outliner.js — Modeller-side port of the Viewer's "Parts" axis (commit d04ddd5,
// branch feat/parts-axis, viewer/navigate_find.js) onto this repo's DESIGNED Outliner extension seam
// (Bonsai.outliner.addCategory — see bonsai_outliner.js ~line 70 "seam for Room/Phase/ERP"). Reuses the
// SAME STAIR_LIKE/LIFT_KEYWORDS/PLANT_KEYWORDS constants + query shape VERBATIM (sourced from
// bim-compiler's witnessed build/building_parts_taxonomy.js, 13/13 PASS — prompts/BUILDING_PARTS_TAXONOMY.md
// in that repo, read-only reference). §PARENT-NO-TRANSFORM there: existence-only match against
// elements_meta.ifc_class/element_name, no element_transforms JOIN (an IfcStair assembly parent often
// carries no transform of its own, only its child IfcStairFlight does).
//
// DATA SOURCE: the modeller keeps the currently-open building's raw meta.db bytes on window.__dwBuf
// (stashed by str_walker_outliner.js's _openBuffer), re-opened READ-ONLY per query — the SAME accessor
// disc_walker.js / modeller.html's discWalk dispatch already use (new window.SQL.Database(new
// Uint8Array(window.__dwBuf))), NOT window.Bonsai.oplog.db (that is the SIGNED op-log, a different db).
//
// NON-INVENT: three groups (Stairway/Lift Shaft/Plant Room), each rendered ONLY when its query returns
// >0 real elements_meta rows (data-gated per group; hideWhenEmpty on the category covers "none have data").
// Leaves are the real matched rows (guid/element_name/ifc_class) — leaf id = the raw guid (bom_tree_outliner.js
// convention: "the seeded ARC-BOM tree's leaf id IS THE GUID"), a group id = 'bpg|<TYPE>' (guids are already
// globally unique within a building; a group needs its own stable, non-guid id). Selection/highlight/camera-
// fly-to on a leaf click is FREE via bonsai_outliner.js's existing click path (frameElementByGuid over
// elements_meta⋈element_transforms, since these guids are not necessarily ARC-seeded into __arcFidByGuid) —
// nothing built here, per scope. A compound 'bp|TYPE|'+guid id was tried first and silently broke that free
// path (frameElementByGuid's WHERE guid=... never matches a prefixed string) — verified via §OLSYNC before/
// after (deadclick → instframe); raw guid is correct.
//
// dw_instances_outliner.js is the exact sibling template this mirrors (IIFE, tree() → roots, register()).
(function () {
  'use strict';
  var TAG = '§BUILDING-PARTS-OUTLINER';
  if (typeof window === 'undefined') return;

  // Ported verbatim from viewer/navigate_find.js @ d04ddd5 (feat/parts-axis) — do not re-derive.
  var STAIR_LIKE = ["IfcStair%", "IfcRamp%"];
  var LIFT_KEYWORDS = ["liftdeur", "lift", "elevator", "aufzug", "fahrstuhl", "hoist"];
  var PLANT_KEYWORDS = ["vent", "duct", "fan", "ahu", "damper", "chiller", "condens", "fancoil", "pump"];
  function _partsCond(part) {
    if (part === 'STAIRWAY') return STAIR_LIKE.map(function (p) { return "ifc_class LIKE '" + p + "'"; }).join(' OR ');
    var words = (part === 'LIFT_SHAFT') ? LIFT_KEYWORDS : PLANT_KEYWORDS;
    return words.map(function (w) { return "LOWER(element_name) LIKE '%" + w + "%'"; }).join(' OR ');
  }
  var _PARTS_GROUPS = [
    { type: 'STAIRWAY', label: 'Stairway' },
    { type: 'LIFT_SHAFT', label: 'Lift Shaft' },
    { type: 'PLANT_ROOM', label: 'Plant Room' }
  ];

  function _rows(db, sql) {
    var r = db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns, vals = r[0].values;
    return vals.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }

  // tree() re-queries the OPEN building's substrate live (mirrors dw_instances_outliner's tree() reading
  // window.__dwWalks live each call) — cheap (3 small LIKE scans), no caching needed at Modeller scale.
  function tree() {
    var roots = [];
    if (!window.__dwBuf || !window.SQL) return roots;
    var db = null, groupsShown = 0, totalRows = 0;
    try {
      db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
      _PARTS_GROUPS.forEach(function (pg) {
        var rows = [];
        try {
          rows = _rows(db, "SELECT guid, element_name, ifc_class FROM elements_meta WHERE (" + _partsCond(pg.type) + ")");
        } catch (e) { console.warn(TAG + ' query failed', pg.type, e && e.message); }
        if (!rows.length) return;   // data-gated: no row for this part in this building → no group
        groupsShown++; totalRows += rows.length;
        // Leaf id = the RAW guid (bom_tree_outliner.js's convention: "the seeded ARC-BOM tree's leaf id IS
        // THE GUID"), NOT a 'bp|TYPE|'-prefixed compound — bonsai_outliner.js's click handler passes n.id
        // straight into window.Bonsai.frameElementByGuid(guid) (elements_meta⋈element_transforms WHERE
        // guid=...) to get the free camera-fly-to for a non-ARC-bridged element; a prefixed id would never
        // match a real guid there and silently fall through to the "deadclick" toast (verified: it did,
        // before this fix — §OLSYNC deadclick). A guid is already globally unique within a building, and
        // STAIRWAY/LIFT_SHAFT/PLANT_ROOM are mutually exclusive keyword matches, so no cross-group collision.
        var kids = rows.map(function (r) {
          return { id: r.guid, kind: 'element',
            label: r.element_name || '(unnamed)', sub: String(r.ifc_class || '').replace(/^Ifc/, '') };
        });
        roots.push({ id: 'bpg|' + pg.type, label: pg.label, kind: 'part-group', children: kids });
      });
      console.log(TAG + ' groups=' + groupsShown + '/' + _PARTS_GROUPS.length + ' rows=' + totalRows +
        ' building=' + (window.__dwName || '?'));
    } catch (e) {
      console.warn(TAG + ' tree build failed', e && e.message);
    } finally {
      if (db) { try { db.close(); } catch (e2) { } }
    }
    return roots;
  }

  window.BuildingPartsOutliner = {
    register: function () {
      if (window.Bonsai && window.Bonsai.outliner)
        window.Bonsai.outliner.addCategory({ key: 'buildingparts', label: 'Building Parts', tree: tree, hideWhenEmpty: true });
      console.log(TAG + ' registered — Stairway/Lift Shaft/Plant Room from elements_meta (viewer d04ddd5 parity)');
    },
    _tree: tree
  };
})();
