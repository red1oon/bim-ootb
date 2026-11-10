// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
// native_props.js — read the authoring tool's own properties by MEANING (prompts/DISC_WALK_DRAWN_INTEGRATION.md §12b slice 2).
//   element_pset_native holds the values as the tool wrote them; dxf2bim/native_maps.json prop_map says which (pset, name) carries which meaning.
//   Read only. No table or no map row -> null: nothing stated is never reported as zero. Witness: W-NATIVE-CIRCUITS.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NativeProps = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function rows(db, sql) { var r = db.exec(sql); if (!r.length) return []; var c = r[0].columns; return r[0].values.map(function (v) { var o = {}; c.forEach(function (k, i) { o[k] = v[i]; }); return o; }); }
  function has(db) { try { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='element_pset_native'").length > 0; } catch (e) { return false; } }
  function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  // the rows a meaning names: [{ guid, pset, name, value, value_si, unit }]
  function byMeaning(db, maps, meaning) {
    var pm = ((maps && maps.prop_map) || []).filter(function (r) { return r.meaning === meaning; });
    if (!pm.length || !has(db)) return null;
    var where = pm.map(function (r) { return '(pset LIKE ' + q(r.pset) + ' AND name LIKE ' + q(r.name) + ')'; }).join(' OR ');
    return rows(db, 'SELECT guid, pset, name, value, value_si, unit FROM element_pset_native WHERE ' + where);
  }
  function circuits(db, maps) {
    var panel = byMeaning(db, maps, 'circuit.panel'); if (!panel) return null;
    var num = byMeaning(db, maps, 'circuit.number') || [], load = byMeaning(db, maps, 'load.apparent_va') || [];
    var numOf = {}, loadOf = {}; num.forEach(function (r) { numOf[r.guid] = r.value; }); load.forEach(function (r) { loadOf[r.guid] = r; });
    var byPanel = {}, circ = {}, devices = 0, loadVa = 0, unk = 0;
    panel.forEach(function (r) {
      var p = String(r.value == null ? '' : r.value).trim(); if (!p) return;
      devices++; byPanel[p] = (byPanel[p] || 0) + 1; circ[p + '\u0001' + (numOf[r.guid] == null ? '' : numOf[r.guid])] = 1;
      var l = loadOf[r.guid]; if (l) { if (l.value_si == null) unk++; else loadVa += Number(l.value_si); }
    });
    return { panels: Object.keys(byPanel).length, circuits: Object.keys(circ).length, devices: devices, load_va: loadVa, unitUnknown: unk, byPanel: byPanel };
  }
  function line(c) { return '§WALK-ELEC-CIRCUITS panels=' + c.panels + ' circuits=' + c.circuits + ' devices=' + c.devices + ' load_va=' + Math.round(c.load_va * 1000) / 1000 + ' unitUnknown=' + c.unitUnknown + ' byPanel=' + JSON.stringify(c.byPanel); }
  return { byMeaning: byMeaning, circuits: circuits, line: line };
});
