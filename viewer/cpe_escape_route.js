/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ══════════════════════════════════════════════════════════════════════════════════════════════
// cpe_escape_route.js — §ESCAPE_ROUTE_REVEAL (bim-compiler prompts/ESCAPE_ROUTE_REVEAL.md).
//
// WHAT IT IS (§0 of the spec): inside the CLOSING ORBIT, after the storey-highlight beat has ended,
// the single worst-case room — the one already behind rule_checklist.js's headline "Longest path to
// exit" number — shines through, an ORANGE DOTTED LINE traces its REAL computed escape route to the
// exit, and a titled "Escape Route" card counts the distance up in two units as the line draws.
// The camera eases its angular motion for this window. NOTHING driven by the film clock slows.
//
// ── EVERY PIECE IS A REUSE. The confirmations the spec's §4/§6.1 asked for, made against real code
//    on origin/main (104ee009) rather than asserted:
//   the path          common/room_graph.js escapeRoute()            READ-ONLY, not touched
//   the drawn line    shortestPath(...).polyline (§RASTER-ASTAR)    the floor-hugging geometry
//   which room        argmax of escapeRoute().distance              see §SELECTION below
//   shine-through     cpe_storey_reveal.js's scoped-x-ray pattern   A.toggleXray + _xrayByUs
//   room box geometry navigate_find.js A.allRoomVolumes()           three-space centers+sizes
//   labels + leaders  clash_labels.js's plate/leader/halo language  same colours, same metrics
//   panel chrome      cpe_resource_panel.js bigStatsCompositeOntoCanvas via {card,idx,n,opacity}
//   overlay suppress  cinema_maxq.js's _hudHold shape, OWN trigger  A._escRouteHudSuppress
//   the toggle        cinema_path_editor.js's TOGGLES table         one row, id cpe-escape-route
// The two items the spec left "not identified precisely" are settled above: the shine-through is
// cpe_storey_reveal.js:249's tint pattern applied to a ROOM BOX rather than a storey's meshes (a
// room has no per-mesh membership in this schema — checked — so the box from A.allRoomVolumes() is
// the room's only real geometry), and the info panel is the bigStats card, which is what the freeze
// beat's own info card and the storey-reveal card both already use.
//
// ── §SELECTION — WHY argmax, AND WHY IT IS THE SAME ROOM THE PANEL MEANS ────────────────────────
// rule_checklist.js `_rcLongestExitSteps(rows)` returns `round(max(row.ratio)/0.75)` over the
// `circulation_distance` rows, and `row.ratio` IS `escapeRoute().distance` (egress_sanity.js:296).
// Those rows are FILTERED to the rooms above the rule's warning threshold — but filtering by a
// threshold cannot remove the maximum, so `max over rows == max over all rooms` whenever any row
// exists at all. Picking `argmax over graph.nodes of escapeRoute().distance` therefore names
// exactly the room behind that headline number, and additionally still names a room on a building
// where no room crosses the threshold and the headline is null. It does not re-derive a selection
// rule; it inverts the one already there. W-ESC-1 asserts the identity against the real evaluator.
//
// ⚠ escapeRouteViaProtectedStair() is NOT used, deliberately. It is opt-in in egress_sanity.js
// (`opts.protectedExitStair`, default off) precisely because it changes the number the report shows
// — so the headline this film must agree with is the plain escapeRoute() one. Using the hardened
// variant here would put a different number on screen from the one the panel prints for the same
// building. If that default ever flips, flip this with it; the § line below prints which was used.
//
// ── §3 — THE TWO NUMBERS ARE NOT EQUALLY RIGOROUS, AND THE PANEL SAYS SO ────────────────────────
//   steps   = length / 0.75 m   UNCITED. rule_checklist.js's own comment already admits it: "a
//             standard adult-stride ergonomic convention from OUTSIDE this project (no stride-length
//             constant exists anywhere in this codebase to extract)". Keeps its `~` here.
//   min:sec = length / 1.19 m/s CITED. SFPE default unimpeded horizontal walking speed, via NIST
//             "Bounding Defaults in Egress Models" (tsapps.nist.gov/publication/get_pdf.cfm?pub_id=913547).
// The card prints the SPEED ITSELF, which is what keeps this honest without two visual treatments.
//
// ══ §ESCAPE_ROUTE_COST_IS_NOT_A_DISTANCE — a DELIBERATE DEPARTURE from the spec's §3 ════════════
// The spec says both numbers come from `escapeRoute().distance`, "already the exact value
// _rcLongestExitSteps() reads today". That premise does not survive real data, and the departure is
// here rather than hidden: `escapeRoute().distance` is a PENALTY-WEIGHTED Dijkstra COST, not a
// length. common/room_graph.js's own §UTILITY-ROUTING-PENALTY multiplies any edge touching a
// utility-tagged room by UTILITY_EDGE_PENALTY (= 8) so the search PREFERS corridors — a routing
// preference, correctly, but it leaves the returned `distance` in cost units.
//   MEASURED 2026-09-20, this branch, real DBs (see the § line printed at build):
//     Hospital_meta.db — 156 rooms, 23 utility nodes. The WORST-CASE room's cost is 253.0 while its
//       drawn route measures 48.8 m: a ratio of 5.19. 19 of the 149 exit-reaching rooms are
//       inflated >5%; the median ratio is 0.50 (for most rooms the cost is HALF the drawn walk,
//       because the A*-refined floor-hugging polyline is longer than the straight-chord edge weight).
//     Terminal_meta.db — 0 utility nodes, median ratio 0.89, max 1.09: no inflation at all.
// So the counters here read the DRAWN ROUTE'S OWN MEASURED 3D LENGTH (`walkM`), which is the thing
// the picture actually shows. Putting "~337 steps" against a 48.8 m line would be handing over a
// known-wrong artefact with a caveat attached, and this project does not do that.
// ⚠ WHICH ROOM is still chosen by the cost, on purpose — that is how the film stays pointed at the
// room the Egress panel's headline is about (§SELECTION above, asserted by W-ESC-1).
// ⚠ NOT FIXED HERE: rule_checklist.js's "Longest path to exit — ~N steps" and egress_sanity.js's
// circulation_distance rows both divide that same cost by 0.75 m and present it as a distance. That
// is a real defect in shipped code, it predates this feature, and changing a number the Egress
// report already shows is not this lane's call to make. It is on the record in the § line below and
// in ESCAPE_ROUTE_REVEAL.md's own FINDINGS section.
//
// ── NO FREEZE (§2 item 9) ───────────────────────────────────────────────────────────────────────
// The §129.1 load-path freeze also stops `tNorm`. Everything here is a sibling of that mechanism,
// never a use of it: the camera ease warps ONLY the argument handed to plan.poseAt, and the overlay
// suppression is its own flag (A._escRouteHudSuppress) read by its own gate in _captureFrame.
// ══════════════════════════════════════════════════════════════════════════════════════════════
function setupCpeEscapeRoute(A) {
  'use strict';
  var THREE = (typeof window !== 'undefined') ? window.THREE : null;
  // §EGRESS_ROOMGRAPH_LATE_BIND, same trap, same fix (egress_sanity.js's own header): common/
  // room_graph.js is lazy-loaded by A.loadNavigate(), so capturing window.RoomGraph at module load
  // would capture `undefined` permanently. Resolved at CALL time in the browser; eagerly required
  // under Node, where no lazy loading exists — which is also what lets the §5 witness drive this
  // file directly, with the real graph and no renderer in the room.
  var _nodeRoomGraph = (typeof module !== 'undefined' && module.exports) ? require('../common/room_graph.js') : null;
  function _resolveRoomGraph() { return _nodeRoomGraph || ((typeof window !== 'undefined') && window.RoomGraph); }

  // ── the two unit conversions, and their evidence tier, in one place ──
  var STRIDE_M = 0.75;      // UNCITED — see the header. Shown with `~`, always.
  var WALK_MS = 1.19;       // CITED — SFPE default unimpeded horizontal walking speed.
  var WALK_CITE = 'SFPE';

  // ── the window, as fractions of the CLOSING ORBIT beat [beats.rise, 1] ──
  // It opens after the orbit has settled and closes with the last third of the orbit left to the
  // §MEASURE_BUILDING_CARD roll-to-stop, so the two can never contend for the same panel slot.
  var LEAD_FRAC = 0.15;     // of the orbit: dead air before the reveal opens
  var SPAN_FRAC = 0.55;     // of the orbit: the reveal's own length
  var DRAW_FRAC = 0.70;     // of the window: the progressive draw; the rest holds the finished line
  var FADE_FRAC = 0.10;     // of the window: the overlay's fade in and out
  // A CEILING in real seconds, the same shape effects.js's STOREY_REVEAL_WINDOW_SEC uses. Without
  // it the window is a pure fraction of the orbit, and a long film with a long pull-back gets a
  // reveal that outstays its welcome — MEASURED: the Hospital_silent path (279 s authored, 30.8 s
  // rise) would take ~17 s. Never a floor: a short orbit gets the short reveal it can afford, and
  // the §ESCAPE_ROUTE_WINDOW line prints the seconds either way so it is never a surprise.
  var WINDOW_MAX_SEC = 12;

  // ── §ESCAPE_ROUTE_CAMERA_EASE — a LOCAL time-warp on the pose argument, nothing else ──
  // warp(w) = w + (A/(16pi)) * (2 sin 2pi w - sin 4pi w)  on w in [0,1], identity outside.
  //   warp(0)=0, warp(1)=1          — the camera is exactly where it would have been, at both ends
  //   warp'(0)=warp'(1)=1           — and moving at exactly the speed it would have been: no step
  //   warp'(w) = 1 + (A/4)(cos 2pi w - cos 4pi w),  min 1-A/2 at w=0.5,  max 1+0.28125A
  // At EASE_A=1.2 the orbit's angular rate falls to 0.40x mid-reveal and peaks at 1.34x near the
  // edges. Monotone for any A < 2, so the camera can never run backwards.
  var EASE_A = 1.2;

  var PATH_HEX = 0xff9100;                    // §PATH_ORANGE — navigate_find.js's own route colour
  var PATH_RGB = 'rgb(255,145,0)';
  var PLATE = 'rgba(0,0,0,0.45)';             // clash_labels.js's plate — one HUD language
  var LEADER = 'rgba(255,255,255,0.92)', LEADER_HALO = 'rgba(0,0,0,0.55)';
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  // ══ BUILD — once per bake, before the frame loop. Never per frame. ═══════════════════════════
  var _rec = null, _builtFor = null, _buildTried = false;
  var _stats = null;
  function _freshStats() {
    return { frames: 0, drawnFrames: 0, maxProgress: 0, maxDrawnM: 0, easedFrames: 0,
             suppressedFrames: 0, minEaseRate: null, maxEaseRate: null };
  }
  _stats = _freshStats();

  function _fmtMS(sec) {
    var s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // Cumulative arc length over a 3-space point list, so a fraction of the walk can be cut exactly.
  function _cum(pts) {
    var c = [0];
    for (var i = 1; i < pts.length; i++) {
      c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
    }
    return c;
  }

  A.escapeRouteBuild = function () {
    // Cached per building — INCLUDING a null result. A build that came back empty must not be
    // retried once per frame: the scan is a Dijkstra per room and the reason it failed will not
    // change mid-bake. _buildTried is what makes "no worst case exists here" cost once.
    if (_builtFor === A.activeBuilding && _buildTried) return _rec;
    _builtFor = A.activeBuilding; _buildTried = true; _rec = null;
    var RG = _resolveRoomGraph();
    if (!RG || typeof A.getRoomGraph !== 'function') {
      console.log('§ESCAPE_ROUTE_BUILD INCONCLUSIVE — RoomGraph/A.getRoomGraph unavailable (the lazy Navigate bundle never loaded); the reveal is inert this bake');
      return null;
    }
    var graph = null;
    try { graph = A.getRoomGraph(); } catch (eG) {
      console.log('§ESCAPE_ROUTE_BUILD INCONCLUSIVE — getRoomGraph threw: ' + (eG && eG.message)); return null;
    }
    if (!graph || !graph.nodes || !graph.nodes.length) {
      console.log('§ESCAPE_ROUTE_BUILD INCONCLUSIVE — the room graph has no room nodes for this building'); return null;
    }
    // §SELECTION (header) — argmax of the SAME distance the rule's row carries.
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    var best = null, reached = 0;
    graph.nodes.forEach(function (n) {
      var esc = RG.escapeRoute(graph, n.guid, { log: function () {} });
      if (!esc || esc.distance == null || !isFinite(esc.distance)) return;
      reached++;
      if (!best || esc.distance > best.esc.distance) best = { node: n, esc: esc };
    });
    var scanMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
    if (!best) {
      console.log('§ESCAPE_ROUTE_BUILD VACUOUS rooms=' + graph.nodes.length + ' reachedAnExit=0 — no room in this' +
        ' building has a route to an EXIT node at all, so there is no worst case to show. Nothing is drawn' +
        ' and nothing is claimed (the same state egress_sanity.js reports as isolated_room).');
      return null;
    }
    var esc = best.esc, node = best.node;
    // The DRAWN line: shortestPath to the very exit escapeRoute chose, for its §RASTER-ASTAR
    // floor-hugging `polyline`. escapeRoute() does not return one (checked — it returns
    // path/doors/distance/exitGuid only). Same graph, same weights, same target, so the distance
    // must agree; the delta is logged rather than assumed, and a disagreement falls back to the
    // route's own anchors instead of drawing a line that is not the measured walk.
    var poly = null, polySrc = 'escapeRoute path anchors', delta = null;
    try {
      var sp = RG.shortestPath(graph, node.guid, esc.exitGuid);
      if (sp && sp.distance != null) {
        delta = Math.abs(sp.distance - esc.distance);
        if (delta < 1e-6 && sp.polyline && sp.polyline.length > 1) { poly = sp.polyline; polySrc = 'shortestPath.polyline (§RASTER-ASTAR)'; }
      }
    } catch (eSP) { console.log('§ESCAPE_ROUTE_POLY shortestPath threw: ' + (eSP && eSP.message) + ' — falling back to the route anchors'); }
    if (!poly) {
      poly = [];
      esc.path.forEach(function (g) { var nn = graph.nodesByGuid[g]; if (nn) poly.push({ x: nn.cx, y: nn.cy, z: nn.cz || 0 }); });
    }
    if (poly.length < 2) {
      console.log('§ESCAPE_ROUTE_BUILD VACUOUS room="' + (node.name || node.guid) + '" — the route resolved to ' +
        poly.length + ' drawable point(s); there is no line to trace');
      return null;
    }
    if (typeof A.ifc2three !== 'function') {
      console.log('§ESCAPE_ROUTE_BUILD INCONCLUSIVE — A.ifc2three unavailable, model coordinates cannot reach three-space'); return null;
    }
    var pts3 = poly.map(function (p) { var c = A.ifc2three(p.x, p.y, p.z || 0); return { x: c.x, y: c.y + 0.05, z: c.z }; });
    var cum = _cum(pts3), polyLenM = cum[cum.length - 1];
    // The room's own box(es), for the shine-through. A room has no per-mesh membership in this
    // schema, so A.allRoomVolumes()'s sub-rects ARE the room's geometry (§MULTI-RECT aware).
    var boxes = [];
    if (typeof A.allRoomVolumes === 'function') {
      try { boxes = (A.allRoomVolumes() || []).filter(function (v) { return v.guid === node.guid; }); }
      catch (eV) { console.log('§ESCAPE_ROUTE_ROOMBOX allRoomVolumes threw: ' + (eV && eV.message)); }
    }
    var exitNode = graph.nodesByGuid[esc.exitGuid] || null;
    _rec = {
      roomGuid: node.guid, roomName: node.name || node.guid, storey: node.storey,
      exitGuid: esc.exitGuid, exitName: (exitNode && exitNode.name) || 'Exit',
      // `walkM` is what the counters read: the measured 3D length of the line actually drawn.
      // `graphCostM` is escapeRoute()'s penalty-weighted cost — what SELECTED this room and what
      // the Egress panel prints. Two different quantities, never conflated. See the header.
      walkM: polyLenM, graphCostM: esc.distance, costRatio: polyLenM > 0 ? esc.distance / polyLenM : null,
      doors: (esc.doors || []).length, hops: (esc.path || []).length,
      steps: Math.round(polyLenM / STRIDE_M), walkSec: polyLenM / WALK_MS,
      pts3: pts3, cum: cum, polyLenM: polyLenM, polySrc: polySrc, boxes: boxes,
      roomsScanned: graph.nodes.length, roomsReachingAnExit: reached
    };
    console.log('§ESCAPE_ROUTE_BUILD room="' + _rec.roomName + '" (' + _rec.roomGuid + ') storey="' + _rec.storey + '"' +
      ' exit=' + _rec.exitGuid +
      ' walk=' + _rec.walkM.toFixed(2) + 'm (the DRAWN route, measured in 3D — what the counters read)' +
      ' steps=~' + _rec.steps + ' (÷' + STRIDE_M + 'm stride, UNCITED)' +
      ' time=' + _fmtMS(_rec.walkSec) + ' (÷' + WALK_MS + 'm/s, CITED ' + WALK_CITE + ')' +
      ' doorsOnRoute=' + _rec.doors + ' pathHops=' + _rec.hops +
      ' line=' + polySrc + ' pts=' + pts3.length +
      (delta != null ? ' spDelta=' + delta.toExponential(2) : ' spDelta=n/a') +
      ' roomBoxes=' + boxes.length +
      ' | selection=argmax escapeRoute().distance over ' + graph.nodes.length + ' rooms (' + reached + ' reach an exit)' +
      ' scanMs=' + scanMs.toFixed(0) + ' fn=escapeRoute (NOT escapeRouteViaProtectedStair — see file header)');
    // §ESCAPE_ROUTE_COST_IS_NOT_A_DISTANCE — printed EVERY build, not only when it looks bad, so the
    // ratio is on the record for whichever building was baked. >1 means §UTILITY-ROUTING-PENALTY
    // inflated the cost; <1 means the A*-refined drawn line is longer than the straight-chord edge
    // weights the cost was summed from. Either way the two are not the same quantity.
    console.log('§ESCAPE_ROUTE_COST_IS_NOT_A_DISTANCE room="' + _rec.roomName + '"' +
      ' graphCost=' + _rec.graphCostM.toFixed(2) + ' (escapeRoute().distance — penalty-weighted; this is' +
      ' what SELECTED this room and what rule_checklist.js divides by 0.75 for its "Longest path to exit"' +
      ' headline: ~' + Math.round(_rec.graphCostM / STRIDE_M) + ' steps)' +
      ' vs drawnWalk=' + _rec.walkM.toFixed(2) + 'm (measured 3D length of the line on screen: ~' + _rec.steps + ' steps)' +
      ' ratio=' + (_rec.costRatio == null ? '-' : _rec.costRatio.toFixed(2)) +
      (_rec.costRatio != null && Math.abs(_rec.costRatio - 1) > 0.05
        ? ' — THEY DISAGREE BY MORE THAN 5%. The film prints the drawn walk. The Egress report prints the cost. That report figure is wrong and is NOT fixed here (see ESCAPE_ROUTE_REVEAL.md FINDINGS).'
        : ' — within 5%, this building has little or no utility-edge penalty on the worst route'));
    return _rec;
  };
  A.escapeRouteRecord = function () { return _rec; };
  A.escapeRouteReset = function () { _rec = null; _builtFor = null; _buildTried = false; _stats = _freshStats(); };
  A.escapeRouteConstants = function () {
    return { strideM: STRIDE_M, walkMs: WALK_MS, walkCite: WALK_CITE, leadFrac: LEAD_FRAC,
             spanFrac: SPAN_FRAC, drawFrac: DRAW_FRAC, fadeFrac: FADE_FRAC, easeA: EASE_A,
             pathHex: PATH_HEX };
  };

  // ══ THE WINDOW — a pure function of (plan, tNorm). Null everywhere outside it. ═══════════════
  // DEGRADE, DON'T DISABLE: a plan with no beats, or a bake whose build came back null, simply
  // never enters the window and every caller below no-ops.
  A.escapeRouteWindow = function (plan) {
    var b = plan && plan.beats;
    if (!b || !(b.rise > 0) || !(b.rise < 1)) return null;
    var L = 1 - b.rise;
    var span = SPAN_FRAC * L;
    var capped = false;
    if (plan.durationSec > 0 && span * plan.durationSec > WINDOW_MAX_SEC) {
      span = WINDOW_MAX_SEC / plan.durationSec; capped = true;
    }
    var start = b.rise + LEAD_FRAC * L;
    return { start: start, end: start + span, orbitLen: L, capped: capped };
  };
  A.escapeRouteVisualAt = function (plan, tNorm) {
    if (!_rec) return null;
    var win = A.escapeRouteWindow(plan);
    if (!win || tNorm == null || tNorm <= win.start || tNorm > win.end) return null;
    var w = (tNorm - win.start) / (win.end - win.start);          // 0..1 across the window
    var progress = Math.max(0, Math.min(1, w / DRAW_FRAC));        // the line's own draw, then holds
    var alpha = Math.max(0, Math.min(1, Math.min(w, 1 - w) / FADE_FRAC));
    var drawnM = progress * _rec.walkM;            // §5: exactly progress x the measured drawn walk
    return { w: w, progress: progress, alpha: alpha, drawnM: drawnM,
             steps: Math.round(drawnM / STRIDE_M), walkSec: drawnM / WALK_MS,
             winStart: win.start, winEnd: win.end };
  };

  // ══ §ESCAPE_ROUTE_CAMERA_EASE — the ONLY thing this feature does to time, and it is not time ══
  // Hands back the FILM fraction the POSE should be sampled at. Every other consumer keeps the
  // real _tnFilm, which is why the day counter, the sun and tNorm itself cannot move (W-ESC-4).
  A.escapeRouteEaseFilmT = function (plan, tFilm) {
    if (!_rec) return tFilm;
    var win = A.escapeRouteWindow(plan);
    if (!win || tFilm == null || tFilm <= win.start || tFilm >= win.end) return tFilm;
    var w = (tFilm - win.start) / (win.end - win.start);
    // ⚠ 16pi, not 8pi. The first cut had 8pi and the rate function below (correct at A/4) then
    // disagreed with the warp it was supposed to describe: the real derivative was 1 + (A/2)(...),
    // whose minimum is 1 - A = -0.2 at A=1.2 — the camera ran BACKWARDS mid-reveal. W-ESC-4c
    // caught it; it is invisible in a picture and would have shipped. d/dw of (2 sin2pi w -
    // sin4pi w) is 4pi(cos2pi w - cos4pi w), so the 4pi has to cancel into the 16pi to leave A/4.
    var warp = w + (EASE_A / (16 * Math.PI)) * (2 * Math.sin(2 * Math.PI * w) - Math.sin(4 * Math.PI * w));
    var rate = 1 + (EASE_A / 4) * (Math.cos(2 * Math.PI * w) - Math.cos(4 * Math.PI * w));
    _stats.easedFrames++;
    if (_stats.minEaseRate === null || rate < _stats.minEaseRate) _stats.minEaseRate = rate;
    if (_stats.maxEaseRate === null || rate > _stats.maxEaseRate) _stats.maxEaseRate = rate;
    return win.start + (win.end - win.start) * warp;
  };
  // Exposed so the witness can measure the warp without re-implementing it.
  A.escapeRouteEaseRate = function (w) { return 1 + (EASE_A / 4) * (Math.cos(2 * Math.PI * w) - Math.cos(4 * Math.PI * w)); };

  // ══ THE CARD — the existing bigStats {card,idx,n,opacity} shape, so no new panel is drawn ══════
  // TITLED (§2 item 8, red1: "unambiguous"). Both live numbers, and the walking speed ITSELF, so a
  // viewer can see which standard produced the time rather than only the time it produced.
  A.escapeRouteStatCardAt = function (plan, tNorm) {
    var vis = A.escapeRouteVisualAt(plan, tNorm);
    if (!vis) return null;
    return { card: { big: _fmtMS(vis.walkSec), label: 'Escape Route',
                     sub: '~' + vis.steps + ' steps · ' + vis.drawnM.toFixed(0) + ' m walked · at ' +
                          WALK_MS + ' m/s (' + WALK_CITE + ') · ' + STRIDE_M + ' m stride assumed' },
             idx: 0, n: 1, opacity: vis.alpha };
  };
  // The caption slot, same A.roomTitleCompositeOntoCanvas every other beat draws through.
  A.escapeRouteCaptionAt = function (plan, tNorm) {
    var vis = A.escapeRouteVisualAt(plan, tNorm);
    if (!vis || !_rec) return null;
    return { name: 'Longest walk out — ' + _rec.roomName, opacity: vis.alpha };
  };

  // ══ PER-FRAME PROJECTION — screen geometry for the 2D pass (§P2.2's reasoning, reused) ════════
  // The line is composited onto the CAPTURE canvas, not drawn in 3D: _captureFrame draws the WebGL
  // canvas into a 2D context and the HUD onto that, so this is the only layer that reaches the
  // exported bytes; and a 2D stroke keeps a constant, readable width at orbit distance where
  // LineBasicMaterial.linewidth is silently ignored (navigate_find.js:1313 already records that).
  // The CUT is made in METRES along the real 3D route, then projected — so the drawn fraction is a
  // fraction of the walk, never of the screen.
  // THE CUT, on its own and THREE-free, so a Node witness can assert the drawn fraction is a
  // fraction of the real WALK without a renderer in the room (this project's own rule: no
  // pixel-derived evidence — slice the predicate out instead).
  A.escapeRouteCutAt = function (progress) {
    if (!_rec) return null;
    var want = progress * _rec.walkM;      // the same fraction as vis.drawnM/walkM, by construction
    var pts = [], i;
    for (i = 0; i < _rec.pts3.length; i++) {
      if (_rec.cum[i] <= want) { pts.push(_rec.pts3[i]); continue; }
      // partial segment — interpolate to the exact metre mark, so the head is not quantised to a vertex
      var prev = _rec.pts3[i - 1], seg = _rec.cum[i] - _rec.cum[i - 1];
      var f = seg > 1e-9 ? (want - _rec.cum[i - 1]) / seg : 0;
      pts.push({ x: prev.x + (_rec.pts3[i].x - prev.x) * f,
                 y: prev.y + (_rec.pts3[i].y - prev.y) * f,
                 z: prev.z + (_rec.pts3[i].z - prev.z) * f });
      break;
    }
    return { pts: pts, wantM: want, lenM: _cum(pts)[pts.length - 1] };
  };
  var _v = null;
  A.escapeRouteFrameAt = function (plan, tNorm, camera, w, h) {
    var vis = A.escapeRouteVisualAt(plan, tNorm);
    _stats.frames++;
    if (!vis || !_rec || !camera || !THREE) return null;
    if (!_v) _v = new THREE.Vector3();
    var cut = A.escapeRouteCutAt(vis.progress);
    var pts = cut.pts, want = cut.wantM;
    if (pts.length < 2) return null;
    function proj(p) {
      _v.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
      var behind = _v.z > 0;
      _v.set(p.x, p.y, p.z).project(camera);
      return { x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h, behind: behind };
    }
    var screen = pts.map(proj);
    // The two fixed leader labels. "Start" rides the room end, "Exit" the exit end — and the Exit
    // plate only appears once the line has actually arrived, so the label never promises a walk the
    // picture has not yet made.
    var labels = [];
    var sStart = screen[0];
    if (!sStart.behind) labels.push({ key: 'Start', rows: ['Start', _rec.roomName], sx: sStart.x, sy: sStart.y });
    if (vis.progress >= 1) {
      var sEnd = proj(_rec.pts3[_rec.pts3.length - 1]);
      if (!sEnd.behind) labels.push({ key: 'Exit', rows: ['Exit', _rec.exitName], sx: sEnd.x, sy: sEnd.y });
    }
    var rec = { alpha: vis.alpha, progress: vis.progress, drawnM: vis.drawnM,
                drawnPolyM: want, steps: vis.steps, walkSec: vis.walkSec,
                screen: screen, labels: labels, w: w, h: h };
    _stats.drawnFrames++;
    if (vis.progress > _stats.maxProgress) _stats.maxProgress = vis.progress;
    if (vis.drawnM > _stats.maxDrawnM) _stats.maxDrawnM = vis.drawnM;
    return rec;
  };

  // ══ DRAW — the 2D pass. `rec` is THIS frame's record; the caller hands it back so a stale
  // frame's geometry can never be drawn on a frame it was not projected for (clash_labels.js's
  // own contract, same reason). ═════════════════════════════════════════════════════════════════
  A.escapeRouteCompositeOntoCanvas = function (ctx, w, h, rec) {
    if (!ctx || !rec || !rec.screen || rec.screen.length < 2 || !(rec.alpha > 0)) return 0;
    var lw = Math.max(2, Math.round(h * 0.0035));
    var dash = Math.round(h * 0.012), gap = Math.round(h * 0.010);
    ctx.save();
    ctx.globalAlpha = Math.min(1, rec.alpha);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function stroke() {
      ctx.beginPath();
      var started = false;
      for (var k = 0; k < rec.screen.length; k++) {
        var p = rec.screen[k];
        if (p.behind) { started = false; continue; }   // a point behind the camera breaks the run
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // halo first, orange core on top — the same two-pass contrast guarantee clash_labels.js's
    // leader uses, and for the same reason: one stroke vanishes against a lit facade or the sky.
    if (ctx.setLineDash) ctx.setLineDash([dash, gap]);
    ctx.strokeStyle = LEADER_HALO; ctx.lineWidth = lw + 4;
    stroke();
    ctx.strokeStyle = PATH_RGB; ctx.lineWidth = lw;
    stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    // the moving head — a solid dot, so the eye has something to follow along the dashes
    var head = null;
    for (var q = rec.screen.length - 1; q >= 0; q--) if (!rec.screen[q].behind) { head = rec.screen[q]; break; }
    if (head) {
      ctx.fillStyle = LEADER_HALO; ctx.beginPath(); ctx.arc(head.x, head.y, lw * 1.9 + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PATH_RGB; ctx.beginPath(); ctx.arc(head.x, head.y, lw * 1.9, 0, Math.PI * 2); ctx.fill();
    }
    // the two plates — clash_labels.js's own metrics/colours, two rows, leader + dot
    var fontPx = Math.max(10, Math.round(h * 0.017)), padX = Math.round(fontPx * 0.7),
        padY = Math.round(fontPx * 0.55), rowGap = Math.round(fontPx * 0.32),
        off = Math.round(h * 0.022), margin = Math.round(h * 0.02);
    var bh = padY * 2 + fontPx * 2 + rowGap;
    var placed = [];
    for (var li = 0; li < rec.labels.length; li++) {
      var L = rec.labels[li];
      ctx.font = '700 ' + fontPx + 'px ' + FONT;
      var bw = padX * 2 + Math.ceil(Math.max(ctx.measureText(L.rows[0]).width, ctx.measureText(L.rows[1]).width));
      var x = L.sx + off, y = L.sy - off - bh;
      if (x + bw > w - margin) x = L.sx - off - bw;
      if (y < margin) y = L.sy + off;
      x = Math.round(Math.max(margin, Math.min(x, w - margin - bw)));
      y = Math.round(Math.max(margin, Math.min(y, h - margin - bh)));
      var ax = Math.max(x, Math.min(L.sx, x + bw)), ay = Math.max(y, Math.min(L.sy, y + bh));
      ctx.strokeStyle = LEADER_HALO; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(L.sx, L.sy); ctx.stroke();
      ctx.strokeStyle = LEADER; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(L.sx, L.sy); ctx.stroke();
      ctx.fillStyle = LEADER_HALO; ctx.beginPath(); ctx.arc(L.sx, L.sy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PATH_RGB; ctx.beginPath(); ctx.arc(L.sx, L.sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PLATE;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, bw, bh, Math.round(fontPx * 0.4)); ctx.fill(); }
      else ctx.fillRect(x, y, bw, bh);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = PATH_RGB; ctx.font = '700 ' + fontPx + 'px ' + FONT;
      ctx.fillText(L.rows[0], x + padX, y + padY + fontPx / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(L.rows[1], x + padX, y + padY + fontPx + rowGap + fontPx / 2);
      placed.push({ key: L.key, x: x, y: y, w: bw, h: bh });
    }
    ctx.restore();
    return placed.length;
  };

  // ══ 3D SHINE-THROUGH + the overlay-suppression gate ═══════════════════════════════════════════
  // cpe_storey_reveal.js's own scoped-x-ray pattern, verbatim in shape: engage x-ray only if it was
  // off, remember that WE engaged it (`_xrayByUs`), and put it back. A storey tints its meshes by
  // `userData.storey`; a ROOM has no equivalent per-mesh membership in this schema (checked), so
  // the room's real geometry here is its A.allRoomVolumes() sub-rect box(es) — the same boxes the
  // Room Lens draws — added as depthTest:false meshes so the room reads from an orbit distance
  // through the building, and disposed on restore.
  //
  // §2 item 7 — "other overlay signage hidden for this window", through its OWN flag. NOT the
  // §129.1 freeze flag: that one also stops tNorm, which item 3 rules out. cinema_maxq.js reads
  // A._escRouteHudSuppress in its own gate beside _hudHold.
  var _xrayByUs = false, _meshes = [], _on = false;
  function _tearDown() {
    _meshes.forEach(function (m) {
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
    _meshes = [];
    if (_xrayByUs && A.xrayOn && typeof A.toggleXray === 'function') {
      A.toggleXray();
      console.log('§ESCAPE_ROUTE_XRAY off (restored)');
    }
    _xrayByUs = false;
    A._escRouteHudSuppress = false;
    _on = false;
  }
  function _build3D() {
    if (!THREE || !A.scene || !_rec) return;
    if (!A.xrayOn && typeof A.toggleXray === 'function') {
      A.toggleXray(); _xrayByUs = true;
      console.log('§ESCAPE_ROUTE_XRAY on (scoped to this window; restored at its end and at every bake exit)');
    }
    _rec.boxes.forEach(function (b) {
      var geo = new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z);
      var mat = new THREE.MeshBasicMaterial({ color: PATH_HEX, transparent: true, opacity: 0.22,
                                              depthTest: false, depthWrite: false });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.center.x, b.center.y, b.center.z);
      mesh.renderOrder = 1004;
      A.scene.add(mesh); _meshes.push(mesh);
      var eg = new THREE.EdgesGeometry(geo.clone());
      var em = new THREE.LineBasicMaterial({ color: PATH_HEX, transparent: true, opacity: 0.85, depthTest: false });
      var edges = new THREE.LineSegments(eg, em);
      edges.position.copy(mesh.position); edges.renderOrder = 1005;
      A.scene.add(edges); _meshes.push(edges);
    });
    console.log('§ESCAPE_ROUTE_ROOMSHINE room="' + _rec.roomName + '" boxes=' + _rec.boxes.length +
      ' meshes=' + _meshes.length + (_rec.boxes.length ? '' : ' — NO room box exists for this guid' +
      ' (A.allRoomVolumes excluded it as non-habitable, or the Room Lens never queried); the route' +
      ' line and the labels still draw, only the room glow is absent'));
  }
  // Called every frame by the bake loop and the preview tick — one function, two callers, the
  // same contract A.storeyRevealApplyVisual keeps. plan===null is the FORCED restore at every exit
  // path (including the throw path), and must run unconditionally.
  A.escapeRouteApplyVisual = function (plan, tNorm) {
    if (!plan) { _tearDown(); return; }
    var vis = A.escapeRouteVisualAt(plan, tNorm);
    if (vis && !_on) { _on = true; _build3D(); }
    else if (!vis && _on) { _tearDown(); }
    A._escRouteHudSuppress = !!vis;
    if (vis) _stats.suppressedFrames++;
  };

  A.escapeRouteStats = function () {
    var s = {}; for (var k in _stats) s[k] = _stats[k];
    s.built = !!_rec;
    if (_rec) { s.roomName = _rec.roomName; s.walkM = _rec.walkM; s.graphCostM = _rec.graphCostM; s.steps = _rec.steps; s.walkSec = _rec.walkSec; }
    return s;
  };
  // ONE line after the loop. VACUOUS = the window never opened on a real frame, so the film proves
  // nothing about this feature however clean the code is (the project's own summary convention).
  A.escapeRouteSummary = function (framesDone) {
    var s = _stats;
    if (!_rec) { console.log('§ESCAPE_ROUTE_SUMMARY INCONCLUSIVE — nothing was built; see §ESCAPE_ROUTE_BUILD above for why'); return s; }
    if (!s.drawnFrames) {
      console.log('§ESCAPE_ROUTE_SUMMARY VACUOUS frames=' + s.frames + ' drawnFrames=0 — the reveal window' +
        ' never opened on a captured frame (a clip that misses it, or a film with no orbit beat).' +
        ' Nothing was drawn and nothing is proven.');
      return s;
    }
    console.log('§ESCAPE_ROUTE_SUMMARY frames=' + s.frames + (framesDone != null ? '/' + framesDone : '') +
      ' drawnFrames=' + s.drawnFrames + ' easedFrames=' + s.easedFrames +
      ' suppressedFrames=' + s.suppressedFrames +
      ' maxProgress=' + s.maxProgress.toFixed(3) + ' maxDrawn=' + s.maxDrawnM.toFixed(2) + 'm' +
      ' of ' + _rec.walkM.toFixed(2) + 'm' +
      ' easeRate=[' + (s.minEaseRate == null ? '-' : s.minEaseRate.toFixed(3)) + '..' +
      (s.maxEaseRate == null ? '-' : s.maxEaseRate.toFixed(3)) + ']x' +
      ' room="' + _rec.roomName + '" steps=~' + _rec.steps + ' walk=' + _fmtMS(_rec.walkSec));
    return s;
  };

  console.log('§ESCAPE_ROUTE_INIT wired stride=' + STRIDE_M + 'm (uncited) walk=' + WALK_MS + 'm/s (' +
    WALK_CITE + ', cited) window=orbit[' + LEAD_FRAC + '..' + (LEAD_FRAC + SPAN_FRAC) + '] draw=' +
    DRAW_FRAC + ' fade=' + FADE_FRAC + ' easeA=' + EASE_A + ' (no allocation until build)');
}
if (typeof window !== 'undefined') window.setupCpeEscapeRoute = setupCpeEscapeRoute;
if (typeof module !== 'undefined' && module.exports) module.exports = { setupCpeEscapeRoute: setupCpeEscapeRoute };
