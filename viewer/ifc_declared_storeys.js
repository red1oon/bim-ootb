// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ifc_declared_storeys.js — a file's own IfcBuildingStorey.Elevation, in metres (§IFC_STOREYS).
// Spec: bim-compiler prompts/MODELLER_MASTER.md §G3 SPEC. Witness: viewer/tests/witness_ifc_storeys.js.
// Elevation is an IfcLengthMeasure in the FILE's unit, never auto-normalised by web-ifc: a federated drop can
// carry one file in metres and another in millimetres, so the unit is read per file from IfcUnitAssignment.
(function (root) {
  'use strict';
  var PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10,
    DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
  var NOISE_M = 1e4;   // 0.1 mm: authoring-tool float noise (3.9999999999997842 vs 4.0000000000000005 is one floor)

  function _val(x) { return x && x.value !== undefined ? x.value : x; }

  // metres per one file unit, from a unit line. IfcSIUnit: its prefix. IfcConversionBasedUnit: the factor times its own base.
  function _scaleOfUnitLine(api, id, T, unit) {
    if (_val(unit.UnitType) !== 'LENGTHUNIT') return null;
    if (unit.ConversionFactor) {
      var m = api.GetLine(id, _val(unit.ConversionFactor)), value = Number(_val(m.ValueComponent));
      var base = m.UnitComponent ? _scaleOfUnitLine(api, id, T, api.GetLine(id, _val(m.UnitComponent))) : null;
      return isFinite(value) && base != null ? value * base : null;
    }
    var pfx = _val(unit.Prefix);
    return pfx && PREFIX[pfx] ? PREFIX[pfx] : 1;
  }

  /**
   * Metres per one length unit of this file, read from IfcUnitAssignment.
   * @param {Object} api web-ifc IfcAPI @param {number} id model id @param {Object} T the web-ifc namespace
   * @returns {?number} the scale, or null when the file declares no length unit (nothing is assumed).
   */
  function lengthUnitScale(api, id, T) {
    var ua = api.GetLineIDsWithType(id, T.IFCUNITASSIGNMENT);
    for (var i = 0; i < ua.size(); i++) {
      var units = api.GetLine(id, ua.get(i)).Units || [];
      for (var j = 0; j < units.length; j++) {
        var s = _scaleOfUnitLine(api, id, T, api.GetLine(id, _val(units[j])));
        if (s != null) return s;
      }
    }
    return null;
  }

  /**
   * Every IfcBuildingStorey that declares an Elevation, in metres.
   * @param {Object} api @param {number} id @param {Object} T
   * @param {function(string):string} normalize the importer's own storey-name folding, so names match elements_meta.storey.
   * @param {number} zOffset the whole-metre z the import subtracts from every centre, so a row sits in the geometry frame.
   * @returns {{rows:Object[], scale:?number, skipped:number, refPlanes:number}} rows in the shape of `storey_elevation`, the table the shared extractor already writes.
   */
  function read(api, id, T, normalize, zOffset) {
    var scale = lengthUnitScale(api, id, T), rows = [], skipped = 0, refPlanes = 0, ids = api.GetLineIDsWithType(id, T.IFCBUILDINGSTOREY);
    for (var i = 0; i < ids.size(); i++) {
      var s = api.GetLine(id, ids.get(i)), raw = _val(s.Name), e = Number(_val(s.Elevation));
      if (scale == null || s.Elevation == null || !isFinite(e) || raw == null) { skipped++; continue; }
      var name = normalize ? normalize(raw) : String(raw);
      if (name !== String(raw)) { refPlanes++; continue; }   // a reference plane the importer folds (… Ceiling, … TOS): its elements carry the base level's name, so it is no rung
      rows.push({ guid: _val(s.GlobalId), name: name, elevation_attr_m: Math.round((e * scale - (zOffset || 0)) * NOISE_M) / NOISE_M + 0, placement_z_m: null });
    }
    return { rows: rows, scale: scale, skipped: skipped, refPlanes: refPlanes };
  }

  var API = { read: read, lengthUnitScale: lengthUnitScale };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.IfcDeclaredStoreys = API;
})(typeof self !== 'undefined' ? self : this);
