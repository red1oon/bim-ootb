// zone_index.js — the median-Z storey banding index, extracted from time_machine.js (§S62)
//
// Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S62
// Witness: witness_big_element_support_coverage / witness_tm_geo_order_cycles — both were RED with
// `ReferenceError: _zoneIndex is not defined` before this move (2 of the suite's 8 known reds).
//
// PURE. build(db) reads nothing but its argument: no app object, no memo, no DOM, no § log.
// time_machine.js keeps _zoneMemo, the _zoneIndex() accessor that owns the memo key and the
// §ZONE_INDEX log line, and the __tmZoneProbe test hook — that is state and reporting, the
// parent's half of the split. Same contract as gantt_model.js (§S53) and support_sweep.js (§S58).
//
// WHY IT WAS EXTRACTED, stated so the next reader does not have to reconstruct it: two witnesses
// slice _buildXrayElements out of time_machine.js by source text, and _buildXrayElements calls
// _zoneIndex(). Neither the accessor nor this builder was ever in their slice set, so both died
// before their first assertion — the same failure class that hid a dead witness for four days
// (§S53.5). A require() cannot half-import a function; a text slice can and did.
'use strict';
(function (global) {

  function _zoneIndexBuild(db) {
    var t0 = performance.now();
    var r;
    // Same population filter both former copies used, so the index is exactly their union.
    try {
      r = db.exec('SELECT m.guid, m.storey, COALESCE(t.center_z, 0) as cz ' +
        'FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    } catch (e) { return null; }
    if (!r.length || !r[0].values.length) return null;
    var rows = r[0].values;

    var zvals = {}, unknownN = 0;
    for (var i = 0; i < rows.length; i++) {
      var st = rows[i][1] || '_UNKNOWN';
      if (st === '_UNKNOWN' || /^unknown$/i.test(st)) { unknownN++; continue; }
      (zvals[st] || (zvals[st] = [])).push(rows[i][2] || 0);
    }
    var medianZ = {};
    for (var sk in zvals) {
      var vals = zvals[sk].sort(function (a, b) { return a - b; });
      var mid = Math.floor(vals.length / 2);
      medianZ[sk] = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    }
    var names = Object.keys(medianZ).sort(function (a, b) { return medianZ[a] - medianZ[b]; });
    var band = {};
    for (var bi = 0; bi < names.length; bi++) band[names[bi]] = bi;

    // Tie audit: the two former copies fed their maps in DIFFERENT row orders (injectGantt's SELECT
    // carries ORDER BY cz, _buildXrayElements' does not). Sorting by medianZ is only order-stable
    // when no two storeys SHARE a median — so a tie is the one condition under which the old pair
    // could legitimately have disagreed with each other, and under which this consolidation would
    // be picking a winner rather than preserving both. Counted and logged, never silently assumed.
    var tiesN = 0;
    for (var ti = 1; ti < names.length; ti++) if (medianZ[names[ti]] === medianZ[names[ti - 1]]) tiesN++;

    // Optional finest level — present only where the extractor produced it (Terminal today).
    var spaceOf = null, spaceN = 0;
    try {
      var sr = db.exec('SELECT element_guid, space_guid FROM rel_contained_in_space');
      if (sr.length && sr[0].values.length) {
        spaceOf = {};
        for (var si = 0; si < sr[0].values.length; si++) spaceOf[sr[0].values[si][0]] = sr[0].values[si][1];
        spaceN = sr[0].values.length;
      }
    } catch (e) { spaceOf = null; }   // table absent — expected on 6 of 7 buildings, not an error

    var level = spaceOf ? 'space' : (names.length > 1 ? 'band' : (names.length === 1 ? 'storey' : 'single'));
    return {
      medianZ: medianZ, names: names, band: band, spaceOf: spaceOf,
      level: level, tiesN: tiesN, unknownN: unknownN, spaceN: spaceN,
      totalN: rows.length, buildMs: performance.now() - t0,
      // The reassignment both former copies performed, verbatim — an element with no real storey
      // is placed on the nearest real one by |cz - medianZ|, first-wins on an exact distance tie
      // (loop keeps the earlier name on `<`), which is the previous behaviour exactly.
      assign: function (storey, cz) {
        if (storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
        if (!names.length) return storey;
        var best = names[0], bd = Infinity;
        for (var ai = 0; ai < names.length; ai++) {
          var d = Math.abs(cz - medianZ[names[ai]]);
          if (d < bd) { bd = d; best = names[ai]; }
        }
        return best;
      }
    };
  }

  var API = { build: _zoneIndexBuild };
  global.ZoneIndex = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
