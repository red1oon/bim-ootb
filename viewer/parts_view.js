/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — parts_view.js, prompts/VIEWER_ELEMENT_PARTS.md. Read the §PARTS_VIEW line after every run; the exit code is not evidence.
// Parts view: a DB that carries an element AND its parts (table element_parts: parent_guid -> child_guid, e.g. a wall and its layer pieces) draws both in the same
// volume, so the parts cannot be seen. This hides every PARENT that has at least one child present in elements_meta, through the viewer's own generic isolate
// A.filterByGuids (the same one A.drawnOnlyView uses, never a second hide mechanism). No data is written. A.partsView(false) restores the previous isolate.
// LAZY: viewer.html has no tag for this file. main.js loads it after a DB open only when element_parts has rows (BROWSER_BOOT_WEIGHT: no cost for any other DB).
// partsKeepSet is a pure function so a Node witness judges the REAL rule, not a copy.

// rows: [{parent_guid, child_guid, parent_class?}] from element_parts. all: Map(guid -> ifc_class) | Set | Array of every guid in elements_meta.
// Returns { keep:Set, hostsHidden, partsShown, orphanLinks, byHostClass, elements }.
function partsKeepSet(rows, all) {
  'use strict';
  var cls = (all instanceof Map) ? all : null;
  var present = cls ? function (g) { return cls.has(g); } : (all instanceof Set ? function (g) { return all.has(g); } : (function () { var s = new Set(all || []); return function (g) { return s.has(g); }; })());
  var guids = cls ? Array.from(cls.keys()) : Array.from(all instanceof Set ? all : new Set(all || []));
  var hosts = new Set(), kids = new Set(), parentsSeen = new Set(), withKid = new Set(), pcls = {};
  (rows || []).forEach(function (r) {
    parentsSeen.add(r.parent_guid); if (r.parent_class && !pcls[r.parent_guid]) pcls[r.parent_guid] = r.parent_class;
    if (present(r.child_guid)) { kids.add(r.child_guid); withKid.add(r.parent_guid); if (present(r.parent_guid)) hosts.add(r.parent_guid); }
  });
  var orphans = 0; parentsSeen.forEach(function (p) { if (!withKid.has(p)) orphans++; });
  var keep = new Set(), byHostClass = {};
  guids.forEach(function (g) { if (hosts.has(g)) { var c = (cls && cls.get(g)) || pcls[g] || '?'; byHostClass[c] = (byHostClass[c] || 0) + 1; } else keep.add(g); });
  var shown = 0; kids.forEach(function (k) { if (keep.has(k)) shown++; });
  return { keep: keep, hostsHidden: hosts.size, partsShown: shown, orphanLinks: orphans, byHostClass: byHostClass, elements: guids.length };
}

function setupPartsView(A) {
  'use strict';
  var TAG = '§PARTS_VIEW', _on = null;
  function _hasTable(n) {
    try { var r = A.db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + n + "'"); return !!(r && r.length); } catch (e) { return false; }
  }
  function _rows(sql) {
    try { var r = A.db.exec(sql); if (!r || !r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); } catch (e) { return []; }
  }
  // S-G4a: while the parts view is on it is the BASE filter. A null (clear / restore-all, e.g. Find opening, nf_panel_search.js) applies the parts keep set
  // instead of showing every host again; a non-null isolate passes through unchanged.
  var _orig = A.filterByGuids;
  if (_orig && !_orig._partsBase) {
    A.filterByGuids = function (g) {
      if (g === null && _on) {
        console.log(TAG + ' base-restore isolate=' + _on.res.keep.size);
        g = _on.res.keep;
      }
      return _orig.call(A, g);
    };
    A.filterByGuids._partsBase = true;
    if (typeof window !== 'undefined' && window.filterByGuids === _orig) window.filterByGuids = A.filterByGuids;
  }
  A.partsView = function (on) {
    if (!A.db || !A.filterByGuids) { console.log(TAG + ' INCONCLUSIVE no db/filter'); return null; }
    if (!on) { if (_on) { var _p = _on; _on = null; A.filterByGuids(_p.prev || null); console.log(TAG + ' off restored=' + (_p.prev ? 'previous isolate' : 'all')); } return null; }
    if (_on) return _on.res;   // already on: keep the FIRST previous isolate, never stack
    var rows = _hasTable('element_parts') ? _rows('SELECT parent_guid, child_guid, parent_class FROM element_parts') : [];
    if (!rows.length) { console.log(TAG + ' VACUOUS (no element_parts rows: nothing hidden)'); return null; }
    var all = new Map(); _rows('SELECT guid, ifc_class FROM elements_meta').forEach(function (r) { all.set(r.guid, r.ifc_class); });
    var res = partsKeepSet(rows, all);
    _on = { prev: A.activeGuidFilter || null, res: res };
    A.filterByGuids(res.keep);
    console.log(TAG + ' hostsHidden=' + res.hostsHidden + ' partsShown=' + res.partsShown + ' elements=' + res.elements + ' byHostClass=' + JSON.stringify(res.byHostClass) +
      (res.orphanLinks ? ' orphanLinks=' + res.orphanLinks : '') + (res.hostsHidden ? '' : ' VACUOUS (every link is an orphan: nothing hidden)'));
    return res;
  };
  A.partsViewRows = function () { return (A.db && _hasTable('element_parts')) ? (_rows('SELECT COUNT(*) n FROM element_parts')[0] || { n: 0 }).n : 0; };
}
if (typeof window !== 'undefined') window.setupPartsView = setupPartsView;
if (typeof module !== 'undefined' && module.exports) module.exports = { partsKeepSet: partsKeepSet, setupPartsView: setupPartsView };
