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

  // stretchRide(commands, guidByFid, fidByGuid, fills, boxByFid) → { commands, riders }
  // Implementing RESUME_CASCADE_INTO_STRETCH.md §STRETCH-RIDE — Witness: W-STRETCH-RIDE.
  // A grid edit's per-feature commands (gridmove.computeCommands) classify EVERY authored mesh independently —
  // doors/windows included — so a filling can receive its own TRANSLATE (divorcing from a scaled host) or its own
  // SCALE (a stretched door — wrong). The REAL rel_fills_host relation overrides the engine's independent view:
  //   - the rider's OWN commands are STRIPPED from the list (returned `commands`), and
  //   - the rider gets ONE induced move (returned `riders`: [{featureId, dx, dy, dz}]) derived from its HOST's
  //     commands applied IN ORDER to the rider's pre-stretch centre c and the host's pre-stretch min m on the
  //     command axis — the SAME anchored-min mapping the fold applies to the host itself (bonsai_library.js
  //     foldInsert gridCmds branch / bonsai_kernel_worker.js):
  //       TRANSLATE {delta d}:            c += d;  m += d                    (rider delta accumulates +d)
  //       SCALE {newScale f, translateDelta t}:  c' = f·c + m·(1−f) + t;  m += t   (delta accumulates (f−1)·(c−m)+t)
  //     ⇒ the rider keeps its PROPORTIONAL position along the host ((c−m)/extent invariant) and its extent NEVER
  //     changes (no SCALE ever reaches a filling). A filling whose host has NO command keeps its own engine command
  //     untouched (it attached to a gridline on its own merit). NON-INVENT: host↔filling comes ONLY from the
  //     recovered rel_fills_host edges through the §ARC-1 bridge — no proximity heuristics.
  //   boxByFid: featureId → [minx,maxx,miny,maxy,minz,maxz] AABBs snapshotted BEFORE the commit (the _gateBoxes
  //   shape). A rider or host with no pre-state box is SKIPPED whole (no ride, no strip — byte-identical fallback:
  //   never strip a command we cannot honestly replace). Pure — no window/THREE access.
  function stretchRide(commands, guidByFid, fidByGuid, fills, boxByFid) {
    var out = { commands: commands, riders: [] };
    if (!Array.isArray(commands) || !commands.length || !guidByFid || !fidByGuid || !Array.isArray(fills) || !boxByFid) return out;
    var AX = { x: 0, y: 1, z: 2 };
    var byFid = {};                                             // host featureId → its commands, IN LIST ORDER
    for (var i = 0; i < commands.length; i++) { var cm = commands[i]; if (cm && cm.featureId != null) (byFid[cm.featureId] = byFid[cm.featureId] || []).push(cm); }
    var riders = [], ridden = {};                               // ridden: rider fid → 1 (dedupe + strip set)
    for (var j = 0; j < fills.length; j++) {
      var e = fills[j];
      var hfid = fidByGuid[e.host_guid], rfid = fidByGuid[e.filling_guid];
      if (hfid == null || rfid == null || !byFid[hfid]) continue;   // ride ONLY when the HOST has a command
      if (ridden[rfid]) continue;                                   // one ride per filling (first host wins)
      var hb = boxByFid[hfid], rb = boxByFid[rfid];
      if (!hb || !rb) continue;                                     // no honest pre-state → leave the engine's view alone
      var c3 = [(rb[0] + rb[1]) / 2, (rb[2] + rb[3]) / 2, (rb[4] + rb[5]) / 2];   // rider pre-stretch centre
      var m3 = [hb[0], hb[2], hb[4]];                                             // host pre-stretch min per axis
      var d3 = [0, 0, 0], cmds = byFid[hfid];
      for (var k = 0; k < cmds.length; k++) {
        var cmd = cmds[k], a = AX[cmd.axis];
        if (a == null) continue;                                    // axis-less command (ROOF_LIFT) → no plan-axis ride
        if (cmd.action === 'TRANSLATE') {
          var d = cmd.delta || 0; c3[a] += d; m3[a] += d; d3[a] += d;
        } else {                                                    // SCALE semantics — mirror the fold's else-branch
          var f = cmd.newScale != null ? cmd.newScale : 1, t = cmd.translateDelta || 0;
          var nc = f * c3[a] + m3[a] * (1 - f) + t;
          d3[a] += nc - c3[a]; c3[a] = nc; m3[a] += t;
        }
      }
      ridden[rfid] = 1;
      if (Math.abs(d3[0]) > 1e-12 || Math.abs(d3[1]) > 1e-12 || Math.abs(d3[2]) > 1e-12)
        riders.push({ featureId: rfid, dx: d3[0], dy: d3[1], dz: d3[2] });
    }
    if (!Object.keys(ridden).length) return out;                    // no rider touched → the input list, untouched
    out.commands = commands.filter(function (c) { return !(c && c.featureId != null && ridden[c.featureId]); });
    out.riders = riders;
    return out;
  }

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

  return { ridersFor: ridersFor, stretchRide: stretchRide };
});
