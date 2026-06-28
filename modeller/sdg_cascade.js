// sdg_cascade.js — §SDG-CASCADE (W-SDG-CASCADE-MODELLER): the HOSTED-BY ride, the SDG forward-fold cascade in the
// modeller. When a HOST (wall) moves, its hosted FILLINGS (door/window) ride by the SAME delta — resolved through
// the §ARC-1 featureId↔guid bridge over the REAL rel_fills_host edges (window.swXEdges.fills). See
// RESUME_ARC_EDITABLE_SUBSTRATE.md "slice (2)" + SPATIAL_DEPENDENCY_GRAPH.md §FORWARD.
//
// DIRECTIONAL: a host drags its fillings; a filling does NOT drag its host (you can slide a door without dragging
// the wall). ONE HOP (wall→door; doors are never hosts). PURE RIGID TRANSLATION by the host's delta → the door's
// offset to the wall is invariant → rosetta-invertible (apply −delta recovers the original; 0.000mm round-trip).
// NON-INVENT: rides only on edges the extractor recovered (provenance ifc:recovered); fabricates no relationship.
//
// Dual-export (window + node) like arc_editable.js / cross_edges.js, so the value witness runs pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SdgCascade = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ridersFor(movedFids, guidByFid, fidByGuid, fills, movedSet?) → [riderFid]
  //   the hosted FILLINGS of the moved HOSTS, deduped, excluding anything already in the moved set. Pure.
  //   guidByFid: featureId → guid (window.__arcGuidByFid)   fidByGuid: guid → featureId (window.__arcFidByGuid)
  //   fills: window.swXEdges.fills rows {host_guid, filling_guid, …}
  function ridersFor(movedFids, guidByFid, fidByGuid, fills, movedSet) {
    var out = [], seen = {};
    if (!Array.isArray(movedFids) || !guidByFid || !fidByGuid || !Array.isArray(fills)) return out;
    movedSet = movedSet || new Set(movedFids);
    for (var i = 0; i < movedFids.length; i++) {
      var g = guidByFid[movedFids[i]];
      if (g == null) continue;                                  // a moved synthetic primitive (no guid) → no ride
      for (var j = 0; j < fills.length; j++) {
        var e = fills[j];
        if (e.host_guid === g && e.filling_guid != null) {      // the moved element IS the host → its filling rides
          var rfid = fidByGuid[e.filling_guid];
          if (rfid != null && !movedSet.has(rfid) && !seen[rfid]) { seen[rfid] = 1; out.push(rfid); }
        }
      }
    }
    return out;
  }

  return { ridersFor: ridersFor };
});
