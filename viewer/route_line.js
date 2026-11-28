// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-24 + the designer's ruling of 2026-11-28 ("do the move-only extraction, as its own small module").
// ISSUE: the orange walking line with its halo and marker spheres was drawn by the room-path code (viewer/nf_highlight_cost.js _drawPathHighlight),
//        which needs the whole Find stack (room graph, room shells, zoom). The phone's mission draws a route to the next task with NO rooms,
//        so the drawing is the ONE owner here and both callers use it. Witness: viewer/tests/witness_task_mission.js (M10: the room path comes out
//        number-for-number identical to the recording made on origin/main before this move; viewer/tests/fixtures/room_path_baseline.json).
// WHAT:  setupRouteLine(A) publishes  A.drawRoutePoints(points, markers, opts)  and  A.clearRoutePoints(owner).
//          points  = [{x,y,z}] IFC coordinates, the line's vertices        markers = [{x,y,z}] IFC coordinates, one halo + one sphere each
//          opts    = { owner: string }   tags the meshes so one caller's clear never removes another's (default 'route')
//        Returns the number of meshes added (0 when markers < 2 or the scene is not ready). Lift, colour, renderOrder and the §DOT_DROP rule are the
//        room path's own, moved here unchanged (the block below is nf_highlight_cost.js's, de-indented two spaces, the polyline/marker points
//        arriving as arguments instead of being read from the room graph). Reads no NF, no room graph, no room boxes, no zoom.
// LOADED: by APP.loadNavigate (before nf_highlight_cost.js) and by the `tasks` row of APP.lazy (viewer/main.js); no boot tag. Idempotent.
function setupRouteLine(A) {
  'use strict';
  if (A.drawRoutePoints) return;
  var _meshes = [];   // every mesh this drawer added, in draw order; each tagged userData._routeOwner
  function _keep(m, owner) { m.userData._routeOwner = owner; _meshes.push(m); }

  A.clearRoutePoints = function(owner) {
    var keep = [], n = 0;
    _meshes.forEach(function(m) {
      if (owner != null && m.userData._routeOwner !== owner) { keep.push(m); return; }
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
      n++;
    });
    _meshes = keep;
    return n;
  };

  A.drawRoutePoints = function(points, markers, opts) {
    var owner = (opts && opts.owner) || 'route';
    if (!A.scene || !A.ifc2three || typeof THREE === 'undefined') return 0;
    var _lift = function(p) { var c = A.ifc2three(p.x, p.y, p.z || 0); return new THREE.Vector3(c.x, c.y + 0.05, c.z); };   // +0.05 lift so the line clears room-shell faces
    var linePts = (points || []).map(_lift), pts = (markers || []).map(_lift), before = _meshes.length;
    var _keepO = function(m) { _keep(m, owner); };
    if (pts.length > 1) {
      var geo = new THREE.BufferGeometry().setFromPoints(linePts);
      // §PATH_ORANGE (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §2/§9, 2026-07-15, supersedes the
      // earlier neon-green §PATH_NEON): bright orange reads cleanly against BOTH the purple
      // (habitable) and blue (corridor) room-shell category colors §9 introduced — green risked
      // blending into the blue-family boxes, red risked an unintended "danger/error" read; user's
      // own steer, verbatim: "bright orange as most bbxes drown the green dots". Thickness:
      // LineBasicMaterial.linewidth is silently ignored by nearly every browser/GPU (WebGL spec
      // limitation, unchanged from before) — a box-style scaled-duplicate trick (§BORDER_STRONG
      // above) doesn't transfer to an arbitrary polyline (no single center to scale about), so
      // legibility instead comes from a bigger core marker sphere + a larger, softer "halo" sphere
      // behind it at each waypoint (same "duplicate underneath" spirit as §BORDER_STRONG, applied
      // to spheres instead of box edges) — line itself stays a thin hairline, same as before.
      var PATH_COLOR = 0xff9100;
      var mat = new THREE.LineBasicMaterial({ color: PATH_COLOR, linewidth: 3, transparent: true, opacity: 0.95, depthTest: false });
      var line = new THREE.Line(geo, mat);
      line.renderOrder = 1003;
      A.scene.add(line);
      _keepO(line);
      var markerGeo = new THREE.SphereGeometry(0.22, 12, 12);
      var markerMat = new THREE.MeshBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.9, depthTest: false });
      var haloGeo = new THREE.SphereGeometry(0.38, 12, 12);
      var haloMat = new THREE.MeshBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.28, depthTest: false });
      // §DOT_DROP (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §6/§9, threshold measured against real
      // Clinic/HHS/Duplex data — see prompt file for the full distance survey): the path's own
      // FIRST/LAST marker sits redundantly close to its neighbor waypoint only in the rare
      // near-degenerate case (measured min 0.02m on HHS) — most room-center-to-door separations
      // are 2-8m (real room depth, not clutter). Drop ONLY an endpoint marker, and only when it's
      // genuinely within 1.0m of its one neighbor — never an interior waypoint (those are real,
      // distinct positions along the route, not a redundant pair).
      var DOT_DROP_DIST = 1.0;
      var skip = pts.map(function() { return false; });
      if (pts.length > 1 && pts[0].distanceTo(pts[1]) < DOT_DROP_DIST) skip[0] = true;
      if (pts.length > 1 && pts[pts.length - 1].distanceTo(pts[pts.length - 2]) < DOT_DROP_DIST) skip[pts.length - 1] = true;
      var dotsDropped = 0;
      pts.forEach(function(p, pi) {
        if (skip[pi]) { dotsDropped++; return; }
        var halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.copy(p); halo.renderOrder = 1004;
        A.scene.add(halo); _keepO(halo);
        var marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.copy(p); marker.renderOrder = 1005;
        A.scene.add(marker); _keepO(marker);
      });
      if (dotsDropped) console.log('[RP-PATH] §DOT_DROP endpoints dropped=' + dotsDropped + ' (within ' + DOT_DROP_DIST + 'm of their one neighbor)');
    }
    console.log('§ROUTE_DRAW owner=' + owner + ' points=' + linePts.length + ' markers=' + pts.length + ' meshes=' + (_meshes.length - before));
    return _meshes.length - before;
  };
}
if (typeof window !== 'undefined') window.setupRouteLine = setupRouteLine;
