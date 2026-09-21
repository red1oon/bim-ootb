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
//   room glow         navigate_find.js A.allRoomVolumes() box, depthTest:false (NO x-ray — §ESCAPE_ROUTE_NO_XRAY)
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
// ── §SELECTION — THE LONGEST REAL WALK, NOT THE HIGHEST COST ───────────────────────────────────
// The spec's §1 table says to reuse `_rcLongestExitSteps()`'s own worst-case selection. That was
// the right instinct and it is NOT what this does, because that selection is itself wrong for this
// purpose — see §ESCAPE_ROUTE_COST_IS_NOT_A_DISTANCE below. MEASURED on the real Hospital DBs:
//   HospitalAjaibPath — by cost the worst is "Level 1 R31" (cost 175.0), whose real walk is 33 m /
//     28 secs. The genuinely longest walk is "Level 4 R2": 313 m / 263 secs, cost only 119.3.
//   Hospital_meta     — by cost "Level 1 R18" (cost 253.0, walk 49 m / 41 secs); longest walk is
//     "Level 4 R1" at 313 m / 263 secs.
// A ground-floor room that happens to route past a plant room outranks a fourth-floor room that
// genuinely walks 313 m. A film captioned "longest walk out" that shows the 28-second one is
// simply wrong, so the ranking is the measured walk. RED1'S CALL, 2026-09-20, verbatim: "Get the
// longest of course."
//
// COST: two passes per room — escapeRoute() to learn which exit it reaches, then shortestPath() to
// that same exit for the §RASTER-ASTAR polyline whose 3D length is measured. The winning polyline
// is CARRIED FORWARD, not re-derived, so the length that won the selection is byte-identically the
// length drawn and counted. Runs ONCE per bake, before the frame loop; `scanMs` is in the § line.
//
// ⚠ THE FILM AND THE EGRESS PANEL NOW NAME DIFFERENT ROOMS, on purpose, and the build log says so
// on every bake. The panel ranks by cost; this ranks by walk. Both figures are printed.
//
// ⚠ escapeRouteViaProtectedStair() is NOT used, deliberately. It is opt-in in egress_sanity.js
// (`opts.protectedExitStair`, default off) and would change the exit a route terminates at without
// changing how that route is measured. If that default ever flips, revisit this with it; the §
// line below prints which was used.
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
  // §ESCAPE_FINALE — seconds of clean building at the end of the film, with nothing drawn ON it.
  // red1: "Its last second is like a finale. It should not have any overlay on the building."
  var FINALE_SEC = 1;

  // ── §ESCAPE_ROUTE_CAMERA_EASE — a LOCAL time-warp on the pose argument, nothing else ──
  // BACK-LOADED as of 2026-09-20. red1: "It should then slow further towards the end, to let the
  // matured info sinks in."
  // THE OLD CURVE DID THE OPPOSITE AT THE END, and no value of its constant could fix it:
  //   warp = w + (A/16pi)(2 sin 2pi w - sin 4pi w),  rate = 1 + (A/4)(cos 2pi w - cos 4pi w)
  // That rate is SYMMETRIC about w=0.5 for EVERY A — 1.00x, 1.30x, 0.40x, 1.30x, 1.00x. The camera
  // lingered halfway through, while the line was still drawing and the counters still climbing, and
  // was back to full orbit speed exactly when the route completed and the card showed its final
  // figures. So this is a shape change, not a tuning change.
  //   warp(w) = w + k*w*(1-w)        rate(w) = 1 + k*(1 - 2w)
  //   warp(0)=0, warp(1)=1           the beat occupies the SAME span; nothing downstream moves
  //   rate falls monotonically       1+k entering, 1-k leaving, no turning point
  //   monotone for k <= 1            at k=1 the rate reaches 0, a dead stop; below that it drifts
  // At EASE_K=0.6 the rate runs 1.60x -> 1.00x -> 0.40x: the camera arrives moving and settles onto
  // the finished picture, which is where the matured information actually is.
  // ⚠ THE RATE IS DELIBERATELY NO LONGER 1 AT THE EDGES. The old curve's "eases in and out, never
  // steps" property is given up on purpose — a beat that ends at full orbit speed is precisely what
  // red1 asked to change. It still starts and ends at the same POSE, which is the property that
  // keeps the rest of the film untouched.
  // ⚠ k IS BOUNDED BY HOW FAR THE CAMERA MAY LEAVE ITS NOMINAL PATH, not by how slow the end looks.
  // red1, 2026-09-20 on the hi-res bake: "the scene path seems to veer a bit off during the
  // EscRoute. Check the slowing down that time did not skew the cam face path." He is right, and
  // the tension is intrinsic rather than a bug: warp(0)=0 and warp(1)=1, so a rate that ENDS below
  // 1 must have RUN ABOVE 1 earlier, and the camera therefore LEADS its nominal pose in the middle.
  // The lead is the integral of (rate - 1) and peaks at k/4 of the window.
  // MEASURED over 10,001 samples of both curves, on this film's 5.8 s window:
  //     old symmetric curve   max lead 0.0620 of the window = 0.36 s   (never complained about)
  //     k = 0.60              max lead 0.1500              = 0.87 s   <- what red1 saw
  //     k = 0.25              max lead 0.0625              = 0.36 s
  // So k=0.25 holds the camera exactly as close to its path as the beat ALREADY was before any of
  // this, and still falls monotonically — 1.25x entering, 0.75x leaving, slowest on the final
  // frames, which is what he asked for. The end is less dramatic than 0.40x; the beat is also
  // 1.4 s longer now and its last 30% is a hold at full progress (DRAW_FRAC=0.70), so the settling
  // is carried by the hold rather than by an excursion the picture cannot afford.
  var EASE_K = 0.25;
  var EASE_A = 1.2;   // kept for §ESCAPE_ROUTE_INIT's own log line and the constants witness

  var PATH_HEX = 0xff9100;                    // §PATH_ORANGE — navigate_find.js's own route colour
  var PATH_RGB = 'rgb(255,145,0)';
  var PLATE = 'rgba(0,0,0,0.45)';             // clash_labels.js's plate — one HUD language
  var LEADER = 'rgba(255,255,255,0.92)', LEADER_HALO = 'rgba(0,0,0,0.55)';
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  // ══ §13.1 THE COLOURS ARE THE RULE (ESCAPE_ROUTE_REVEAL.md §13.1, APPROVED by red1 2026-09-20:
  // "Agree with your color code") ══════════════════════════════════════════════════════════════
  // Each colour carries a code QUANTITY, not a decoration. Changing any one of these changes which
  // rule the picture draws, so they are not to be re-assigned without re-opening §13.1.
  //   RED    room -> divergence   the COMMON PATH. No choice exists here: one blockage takes
  //                               everyone. Its length is exactly what §1006.2.1 caps.
  //   YELLOW divergence -> nearest the primary route once a choice exists. Reuses §PATH_ORANGE,
  //                               already this project's "this is the walk" colour.
  //   BLUE   divergence -> others the alternates, ranked, dimmer with rank. NOT the warning family
  //                               on purpose — an alternate existing is the GOOD news.
  //   GREY   any cased segment    sprinkler coverage (§13.2). Its ABSENCE is the finding.
  var RED_RGB = 'rgb(229,57,53)';             // the common-path alarm colour
  var BLUE_RGB = '0,145,234';                 // alternates — alpha applied per rank, so kept as parts
  var GREY_RGB = 'rgba(200,205,210,0.30)';    // the casing tube: wide, translucent, UNDER everything
  var BLUE_MIN_ALPHA = 0.28;                  // rank N never fades to invisible — §13.6 forbids thinning

  // ── §13.2 THE CASING RADIUS IS DERIVED, NOT CHOSEN ──
  // NFPA 13 light hazard (which covers hospitals) caps coverage at 225 sq ft per sprinkler and
  // 15 ft maximum spacing. On a compliant 15x15 ft grid the furthest any point can be from a head
  // is the half-diagonal: 15*sqrt(2)/2 = 10.6 ft = 3.23 m.
  // ⚠ A PROXIMITY TEST, NOT A HYDRAULIC CALCULATION. It cannot see obstructions, ceiling height,
  // head type, or whether the system is charged. It answers "is there a head near this walk". It
  // must never be captioned as "this route is protected" — §13.2's own ruling.
  var SPRINKLER_R_M = 3.23;
  var SPRINKLER_CLASS = 'IfcFireSuppressionTerminal';
  var SPRINKLER_CITE = 'NFPA 13 light hazard, 3.23 m';
  var COMMON_PATH_CITE = 'IBC 2021 T1006.2.1';
  var BREACH_CITE = 'IBC 2021 T1017.2';

  // ══ BUILD — once per bake, before the frame loop. Never per frame. ═══════════════════════════
  var _rec = null, _builtFor = null, _buildTried = false, _failReason = null;
  var _stats = null;
  function _freshStats() {
    return { frames: 0, drawnFrames: 0, maxProgress: 0, maxDrawnM: 0, easedFrames: 0,
             suppressedFrames: 0, minEaseRate: null, maxEaseRate: null };
  }
  _stats = _freshStats();

  // red1, 2026-09-20, after watching the first clip: "It be good to indicate so with 'secs'".
  // A bare "0:28" reads as a clock, and a viewer has to decide whether it is minutes or seconds.
  // Under a minute the unit is spelled out; over it, mm:ss with the unit still named. The panel's
  // big-number slot auto-shrinks to fit (cpe_resource_panel.js), so the extra word costs nothing.
  function _fmtWalk(sec) {
    var s = Math.max(0, Math.round(sec));
    if (s < 60) return s + ' secs';
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' mins';
  }
  // The log keeps the bare mm:ss — it is read by grep, not by a viewer.
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

  // ══ §13.1/§13.2 GEOMETRY HELPERS — all in MODEL space, all THREE-free ════════════════════════
  // A.ifc2three is a pure axis swap plus a translation (scene.js:504), so it is an isometry: a
  // cumulative METRE mark measured on the raw polyline is the SAME mark on the converted pts3, and
  // the +0.05 lift is a constant offset that changes no segment length. That is why the split and
  // the casing are computed once, here, in model coordinates, and never re-derived in three space.
  function _len3(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)); }
  function _cumOf(pts) { var c = [0], i; for (i = 1; i < pts.length; i++) c.push(c[i - 1] + _len3(pts[i - 1], pts[i])); return c; }
  // The point at metre mark `m`, interpolated inside its segment — never quantised to a vertex.
  function _atM(pts, cum, m) {
    if (m <= 0) return { x: pts[0].x, y: pts[0].y, z: pts[0].z || 0 };
    var last = pts.length - 1;
    if (m >= cum[last]) return { x: pts[last].x, y: pts[last].y, z: pts[last].z || 0 };
    for (var i = 1; i <= last; i++) {
      if (cum[i] < m) continue;
      var seg = cum[i] - cum[i - 1], f = seg > 1e-9 ? (m - cum[i - 1]) / seg : 0, a = pts[i - 1], b = pts[i];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * f };
    }
    return { x: pts[last].x, y: pts[last].y, z: pts[last].z || 0 };
  }
  // The sub-polyline between two metre marks, both ends interpolated. Returns [] when the range is
  // empty, which is a real state (a zero-length common path) and not an error.
  function _cutRange(pts, cum, aM, bM) {
    var last = cum.length - 1;
    aM = Math.max(0, Math.min(aM, cum[last])); bM = Math.max(aM, Math.min(bM, cum[last]));
    if (bM - aM <= 1e-9) return [];
    var out = [_atM(pts, cum, aM)];
    for (var i = 0; i <= last; i++) if (cum[i] > aM && cum[i] < bM) out.push({ x: pts[i].x, y: pts[i].y, z: pts[i].z || 0 });
    out.push(_atM(pts, cum, bM));
    return out;
  }
  // Closest point on a polyline to p, as a metre mark plus the distance it had to snap. The SNAP IS
  // LOGGED, never swallowed: the divergence is a graph NODE and the drawn line is a §RASTER-ASTAR
  // polyline that carries no node identity per vertex, so a large snap means the cut is not where
  // the graph says the choice appears — and a reader has to be able to see that.
  function _nearestOnPoly(pts, cum, p) {
    var bestM = 0, bestD = Infinity;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
      var L2 = dx * dx + dy * dy + dz * dz;
      var t = L2 > 1e-12 ? (((p.x - a.x) * dx + (p.y - a.y) * dy + ((p.z || 0) - (a.z || 0)) * dz) / L2) : 0;
      t = Math.max(0, Math.min(1, t));
      var qx = a.x + dx * t, qy = a.y + dy * t, qz = (a.z || 0) + dz * t;
      var d = Math.hypot(p.x - qx, p.y - qy, (p.z || 0) - qz);
      if (d < bestD) { bestD = d; bestM = cum[i - 1] + Math.sqrt(L2) * t; }
    }
    return { m: bestM, dist: bestD };
  }
  // Storey elevations derived from the GRAPH'S OWN nodes — the same mean-cz-per-storey the graph
  // builds internally (room_graph.js:288-295) — rather than a second source that could disagree.
  function _storeyElevations(graph) {
    var sum = {}, n = {};
    graph.nodes.forEach(function (g) {
      if (!g.storey || g.cz == null || !isFinite(g.cz)) return;
      sum[g.storey] = (sum[g.storey] || 0) + g.cz; n[g.storey] = (n[g.storey] || 0) + 1;
    });
    var z = {}; Object.keys(sum).forEach(function (k) { z[k] = sum[k] / n[k]; });
    return z;
  }
  // ── §13.2 the heads, read ONCE from the dropped file ──
  // Positions come from element_transforms, which every extracted element has; the class filter is
  // elements_meta.ifc_class. No authoring step, no fire-engineering model — §13.6's load-bearing
  // claim, kept true.
  var _heads = null, _headsFor = null, _headsNote = '';
  function _sprinklerHeads() {
    if (_headsFor === A.activeBuilding) return _heads;
    _headsFor = A.activeBuilding; _heads = []; _headsNote = '';
    if (typeof A.dbQuery !== 'function') { _headsNote = 'A.dbQuery unavailable'; return _heads; }
    var rows = [];
    try {
      rows = A.dbQuery('SELECT m.storey, t.center_x, t.center_y, t.center_z FROM elements_meta m' +
        ' JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class = ?', [SPRINKLER_CLASS]) || [];
    } catch (eH) { _headsNote = 'query threw: ' + (eH && eH.message); return _heads; }
    rows.forEach(function (r) {
      var x = +(r.center_x != null ? r.center_x : r[1]), y = +(r.center_y != null ? r.center_y : r[2]),
          z = +(r.center_z != null ? r.center_z : r[3]), st = (r.storey != null ? r.storey : r[0]);
      if (isFinite(x) && isFinite(y)) _heads.push({ x: x, y: y, z: isFinite(z) ? z : 0, storey: st });
    });
    return _heads;
  }
  // A vertex is CASED when a head lies within SPRINKLER_R_M HORIZONTALLY and on the SAME STOREY.
  // "Same storey" is decided by name: each head carries elements_meta.storey, and each vertex is
  // assigned the storey whose mean elevation is nearest its own z. Both sides are extracted data —
  // no invented vertical band, which is what a "within N metres above the walk" rule would be.
  // Returns metre spans along the polyline, merged, plus the census the § line prints.
  // ⚠ RESAMPLED, and it has to be. MEASURED on Hospital_silent: the drawn route is 247.0 m long and
  // carries only 13 vertices, so a per-VERTEX test judges stretches of ~30 m by their two ends and
  // would report a 30 m gap as cased because both ends happen to sit under a head. The walk is
  // resampled at STEP_M before the proximity test; at 1 m against a 3.23 m radius no covered
  // stretch can be missed by more than half a step, which is well inside what a proximity test
  // claims in the first place.
  var CASE_STEP_M = 1.0;
  function _casedSpans(rawPts, rawCum, heads, storeyZ) {
    var names = Object.keys(storeyZ);
    if (!rawPts.length || !heads.length || !names.length) {
      return { spans: [], vertsCased: 0, verts: rawPts.length, samples: 0, headsOnRoute: 0 };
    }
    var totalM = rawCum[rawCum.length - 1], pts = [], cum = [];
    for (var sM = 0; sM < totalM; sM += CASE_STEP_M) { pts.push(_atM(rawPts, rawCum, sM)); cum.push(sM); }
    pts.push(_atM(rawPts, rawCum, totalM)); cum.push(totalM);
    var byStorey = {};
    heads.forEach(function (hd) { (byStorey[hd.storey] = byStorey[hd.storey] || []).push(hd); });
    function storeyOf(z) {
      var best = null, bd = Infinity;
      for (var i = 0; i < names.length; i++) { var d = Math.abs(storeyZ[names[i]] - z); if (d < bd) { bd = d; best = names[i]; } }
      return best;
    }
    var flags = [], cased = 0, used = {};
    for (var i = 0; i < pts.length; i++) {
      var st = storeyOf(pts[i].z || 0), list = byStorey[st] || [], hit = false;
      for (var k = 0; k < list.length; k++) {
        if (Math.hypot(list[k].x - pts[i].x, list[k].y - pts[i].y) <= SPRINKLER_R_M) { hit = true; used[st + '|' + k] = 1; break; }
      }
      flags.push(hit); if (hit) cased++;
    }
    // A SEGMENT is cased when both its ends are — the honest reading of a per-vertex proximity test.
    var spans = [], open = null;
    for (var j = 1; j < pts.length; j++) {
      if (flags[j - 1] && flags[j]) { if (open === null) open = cum[j - 1]; }
      else if (open !== null) { spans.push([open, cum[j - 1]]); open = null; }
    }
    if (open !== null) spans.push([open, cum[cum.length - 1]]);
    return { spans: spans, vertsCased: cased, verts: rawPts.length, samples: pts.length,
             headsOnRoute: Object.keys(used).length };
  }

  A.escapeRouteBuild = function () {
    // Cached per building — INCLUDING a null result. A build that came back empty must not be
    // retried once per frame: the scan is a Dijkstra per room and the reason it failed will not
    // change mid-bake. _buildTried is what makes "no worst case exists here" cost once.
    if (_builtFor === A.activeBuilding && _buildTried) return _rec;
    _builtFor = A.activeBuilding; _buildTried = true; _rec = null; _failReason = null;
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
    // §SELECTION (header) — argmax of the REAL WALKED LENGTH. TWO passes per room, deliberately:
    // escapeRoute() to find which exit that room actually reaches, then shortestPath() to that same
    // exit for its §RASTER-ASTAR floor-hugging polyline, whose 3D length is measured here. The cost
    // is kept alongside (it is what the Egress panel ranks by) but it does NOT choose.
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    var best = null, reached = 0, worstByCost = null, noPoly = 0, corridors = 0, noExit = 0;
    graph.nodes.forEach(function (n) {
      // §ESCAPE_ROUTE_NOT_A_CORRIDOR — a CORRIDOR_ROOM:: node is a pseudo-room injected by
      // §CORRIDOR-ROOM-BACKPROP for the hallway backbone; nobody starts an escape there, the
      // corridor IS the escape route. FOUND ON A REAL BAKE (Hospital_silent, 2026-09-20): the
      // longest walk was "≈ Level 4 Hall/Corridor 3" — a corridor, with no room box, so the film
      // also had nothing to light up (roomBoxes=0). The test is room_graph.js's OWN, line 379,
      // verbatim, not a second way of spotting them.
      if (String(n.guid).indexOf('CORRIDOR_ROOM::') === 0) { corridors++; return; }
      var esc = RG.escapeRoute(graph, n.guid, { log: function () {} });
      if (!esc || esc.distance == null || !isFinite(esc.distance)) noExit++;
      if (!esc || esc.distance == null || !isFinite(esc.distance)) return;
      reached++;
      if (!worstByCost || esc.distance > worstByCost.esc.distance) worstByCost = { node: n, esc: esc };
      var sp = null;
      try { sp = RG.shortestPath(graph, n.guid, esc.exitGuid); } catch (eS) { sp = null; }
      var poly = (sp && sp.polyline && sp.polyline.length > 1) ? sp.polyline : null;
      if (!poly) { noPoly++; return; }
      var L = 0;
      for (var q = 1; q < poly.length; q++) {
        L += Math.hypot(poly[q].x - poly[q - 1].x, poly[q].y - poly[q - 1].y, (poly[q].z || 0) - (poly[q - 1].z || 0));
      }
      if (!best || L > best.walkM) best = { node: n, esc: esc, poly: poly, walkM: L, spDist: sp.distance };
    });
    var scanMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
    // §ESCAPE_ROUTE_METADATA_MISSING (red1, 2026-09-20: "Make the EscRoute option flag in log a
    // fail when such metadata is absent") — separate "this building genuinely has no worst case"
    // from "this building was never given the data to compute one". Without storey_walkable_raster
    // there is no EXIT DETECTION at all, so escapeRoute() returns null for EVERY room and a
    // VACUOUS line reads exactly like a clean building. That is the silent failure. Now a FAIL,
    // on console.error so a CLI log scan catches it. graph.rasters is {} when the table is absent
    // (room_graph.js §G3-REVISED's own documented degrade).
    var rasterStoreys = Object.keys(graph.rasters || {}).length;
    if (!best && rasterStoreys === 0) {
      _failReason = 'FAIL reason=metadata-absent (no storey_walkable_raster)';
      console.error('§ESCAPE_ROUTE_BUILD FAIL reason=metadata-absent storey_walkable_raster=0' +
        ' rooms=' + graph.nodes.length + ' exitsDetected=0 — this building carries no walkable' +
        ' raster, so exit detection cannot run and no room can have an escape route. This is NOT a' +
        ' clean building and NOT a feature no-op: the data was never built. Fix:' +
        ' scripts/build_storey_walkable_raster.js -> buildings/patches/<db>.sql, which the' +
        ' A._applyPendingPatch self-heal already applies at load. See' +
        ' §SAVE_CARRIES_BUT_NEVER_BUILDS_THE_RASTER in viewer/scene.js.');
      return null;
    }
    if (!best) {
      console.log('§ESCAPE_ROUTE_BUILD VACUOUS rooms=' + graph.nodes.length + ' reachedAnExit=' + reached +
        ' withDrawableRoute=0 noPolyline=' + noPoly + ' — ' + (reached === 0
          ? 'no room in this building has a route to an EXIT node at all'
          : reached + ' rooms reach an exit but none produced a drawable polyline') +
        ', so there is no worst case to show. Nothing is drawn and nothing is claimed.');
      return null;
    }
    var esc = best.esc, node = best.node;
    // The DRAWN line: shortestPath to the very exit escapeRoute chose, for its §RASTER-ASTAR
    // floor-hugging `polyline`. escapeRoute() does not return one (checked — it returns
    // path/doors/distance/exitGuid only). Same graph, same weights, same target, so the distance
    // must agree; the delta is logged rather than assumed, and a disagreement falls back to the
    // route's own anchors instead of drawing a line that is not the measured walk.
    // The polyline the scan already measured — not re-derived, so the length that WON the selection
    // is byte-identically the length that gets drawn and counted.
    var poly = best.poly, polySrc = 'shortestPath.polyline (§RASTER-ASTAR)';
    var delta = (best.spDist != null) ? Math.abs(best.spDist - esc.distance) : null;
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
      roomsScanned: graph.nodes.length, roomsReachingAnExit: reached, scanMs: scanMs,
      corridorsSkipped: corridors, roomsWithNoExit: noExit,
      costWorstName: worstByCost ? (worstByCost.node.name || worstByCost.node.guid) : null,
      costWorstCost: worstByCost ? worstByCost.esc.distance : null,
      isAlsoCostWorst: !!(worstByCost && worstByCost.node.guid === node.guid)
    };
    // ══ §13.1 THE COLOURS / §13.2 THE CASING — built here, ONCE, never per frame ════════════════
    // Everything below rides ONE extra Dijkstra (escapeRoutes) for the chosen room. The per-ROOM
    // scan above is untouched: the "~90 s over 149 rooms" rule is about growing a second search
    // INSIDE that loop, and nothing here is inside it. MEASURED on this DB: the whole room scan is
    // scanMs=8 over 7 real rooms, so one more search for the winner is not a cost worth shaping
    // the design around.
    _rec.alternates = []; _rec.redPts = null; _rec.yellowPts = null;
    _rec.commonPathM = null; _rec.divergence = null; _rec.divSnapM = null;
    _rec.exitsReachable = 1; _rec.cased = null;
    var _allT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    var _all = null;
    try { _all = RG.escapeRoutes ? RG.escapeRoutes(graph, node.guid, { log: function () {} }) : null; }
    catch (eA) { console.log('§ESCAPE_ROUTE_ALTERNATES INCONCLUSIVE — escapeRoutes threw: ' + (eA && eA.message)); }
    if (_all && _all.routes && _all.routes.length) {
      _rec.exitsReachable = _all.routes.length;
      // Route 0 is the nearest exit — the SAME exit escapeRoute() chose, so the drawn primary is
      // the line the selection already measured. A disagreement is logged, never papered over.
      var primaryAgrees = (_all.routes[0].exitGuid === esc.exitGuid);
      // The divergence: where the occupant FIRST gains a choice. `null` is a REAL state, not a
      // failure — one route is a prefix of the other, or there is only one exit — and it means the
      // WHOLE walk is common path. That is §13.6's "red line with no heads", the worst reading
      // available, and it is drawn as such rather than hidden behind a yellow line.
      var div = (_all.routes.length > 1 && RG.divergenceFrom)
        ? RG.divergenceFrom(_all.routes[0].path, _all.routes[1].path) : null;
      var divNode = div ? (graph.nodesByGuid[div.node] || null) : null;
      var splitM = null;
      if (divNode && divNode.cx != null && divNode.cy != null) {
        var snap = _nearestOnPoly(poly, _cum(poly), { x: divNode.cx, y: divNode.cy, z: divNode.cz || 0 });
        splitM = snap.m; _rec.divSnapM = snap.dist;
        _rec.divergence = { guid: div.node, name: divNode.name || div.node, index: div.index };
      }
      var cum0 = _cum(poly), total0 = cum0[cum0.length - 1];
      if (splitM == null) splitM = total0;      // no divergence found -> the whole walk is common
      _rec.commonPathM = splitM;
      function toThree(list) {
        return list.map(function (q) { var c = A.ifc2three(q.x, q.y, q.z || 0); return { x: c.x, y: c.y + 0.05, z: c.z }; });
      }
      _rec.redPts = toThree(_cutRange(poly, cum0, 0, splitM));
      _rec.yellowPts = toThree(_cutRange(poly, cum0, splitM, total0));
      // ── the BLUE fan. §13.6: NO CAP. Every reachable exit gets a head, because capping them
      // would make a snake and a hydra look the same, which is the one reading this picture is for.
      for (var ri = 1; ri < _all.routes.length; ri++) {
        var rr = _all.routes[ri], spr = null;
        try { spr = RG.shortestPath(graph, node.guid, rr.exitGuid); } catch (eP) { spr = null; }
        var pl = (spr && spr.polyline && spr.polyline.length > 1) ? spr.polyline : null;
        if (!pl) continue;
        var cumR = _cum(pl), totR = cumR[cumR.length - 1], sM = totR;
        if (divNode && divNode.cx != null) sM = _nearestOnPoly(pl, cumR, { x: divNode.cx, y: divNode.cy, z: divNode.cz || 0 }).m;
        var tail = _cutRange(pl, cumR, sM, totR);
        if (tail.length < 2) continue;
        _rec.alternates.push({ exitGuid: rr.exitGuid,
          exitName: (graph.nodesByGuid[rr.exitGuid] && graph.nodesByGuid[rr.exitGuid].name) || 'Exit',
          rank: ri, pts3: toThree(tail), lenM: _cum(tail)[tail.length - 1], totalM: totR });
      }
      var _allMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - _allT0;
      console.log('§ESCAPE_ROUTE_ALTERNATES exitsReachable=' + _all.routes.length +
        ' primaryExitAgreesWithSelection=' + primaryAgrees +
        ' divergence=' + (_rec.divergence ? '"' + _rec.divergence.name + '" (' + _rec.divergence.guid + ') atIndex=' + _rec.divergence.index : 'NONE') +
        ' commonPathRED=' + splitM.toFixed(2) + 'm (§1006.2.1 quantity: no choice exists over this stretch)' +
        ' primaryYELLOW=' + (total0 - splitM).toFixed(2) + 'm' +
        ' blueAlternates=' + _rec.alternates.length + '/' + (_all.routes.length - 1) + ' drawn (NO CAP — §13.6)' +
        ' altSpanM=[' + (_all.routes.length > 1 ? _all.routes[1].distance.toFixed(1) + '..' + _all.routes[_all.routes.length - 1].distance.toFixed(1) : '-') + ']' +
        ' divSnapM=' + (_rec.divSnapM == null ? 'n/a' : _rec.divSnapM.toFixed(2)) +
        ' (how far the graph\'s divergence NODE sat from the drawn polyline — a large snap means the' +
        ' cut is not where the graph says the choice appears)' +
        ' shape=' + (_rec.alternates.length === 0 ? 'NO-HEADS (routes never diverge — the worst case, §13.6)'
          : (splitM / Math.max(1e-9, total0) > 0.5 ? 'SNAKE (long common spine, choice only at the end — BAD egress)'
            : 'HYDRA (choice close to the room, many heads — GOOD egress)')) +
        ' ms=' + _allMs.toFixed(0));
    } else {
      console.log('§ESCAPE_ROUTE_ALTERNATES NONE — escapeRoutes returned no routes for the chosen' +
        ' room, so no divergence and no alternates can be drawn. The primary line is drawn alone.');
    }
    // ── §13.2 the grey casing, over the PRIMARY route (the one the numbers are about) ──
    var _hd = _sprinklerHeads();
    var _cov = _casedSpans(poly, _cum(poly), _hd, _storeyElevations(graph));
    _rec.cased = _cov.spans; _rec.headsTotal = _hd.length;
    console.log('§ESCAPE_ROUTE_CASING heads=' + _hd.length + ' (' + SPRINKLER_CLASS + ', real positions from' +
      ' element_transforms — no authoring step)' +
      (_headsNote ? ' note=' + _headsNote : '') +
      ' radius=' + SPRINKLER_R_M + 'm (' + SPRINKLER_CITE + ', derived half-diagonal of a compliant 15x15ft grid)' +
      ' routeVerts=' + _cov.verts + ' resampledAt=' + CASE_STEP_M + 'm samples=' + _cov.samples +
      ' cased=' + _cov.vertsCased +
      ' spans=' + _cov.spans.length +
      ' casedM=' + _cov.spans.reduce(function (a, sp) { return a + (sp[1] - sp[0]); }, 0).toFixed(1) + 'm of ' + _rec.walkM.toFixed(1) + 'm' +
      ' — ⚠ PROXIMITY ONLY. This cannot see obstructions, ceiling height, head type or whether the' +
      ' system is charged. A GAP in the casing along the common path is the finding; presence is not' +
      ' a claim that the route is protected.');
    console.log('§ESCAPE_ROUTE_BUILD room="' + _rec.roomName + '" (' + _rec.roomGuid + ') storey="' + _rec.storey + '"' +
      ' exit=' + _rec.exitGuid +
      ' walk=' + _rec.walkM.toFixed(2) + 'm (the DRAWN route, measured in 3D — what the counters read)' +
      ' steps=~' + _rec.steps + ' (÷' + STRIDE_M + 'm stride, UNCITED)' +
      ' time=' + _fmtMS(_rec.walkSec) + ' (÷' + WALK_MS + 'm/s, CITED ' + WALK_CITE + ')' +
      ' doorsOnRoute=' + _rec.doors + ' pathHops=' + _rec.hops +
      ' line=' + polySrc + ' pts=' + pts3.length +
      (delta != null ? ' spDelta=' + delta.toExponential(2) : ' spDelta=n/a') +
      ' roomBoxes=' + boxes.length +
      ' | selection=argmax MEASURED WALK over ' + graph.nodes.length + ' rooms (' + reached + ' reach an exit, ' +
      noPoly + ' had no drawable polyline)' +
      ' scanMs=' + scanMs.toFixed(0) + ' fn=escapeRoute+shortestPath (NOT escapeRouteViaProtectedStair — see file header)');
    _rec.breach = A.escapeRouteBreach();
    // §ESCAPE_ROUTE_NOT_THE_ONLY_FINDING — "the longest route" is not the worst egress fact in a
    // building that has rooms with NO route at all. Those are egress_sanity.js's `isolated_room`
    // CRITICAL rows: an infinite escape route, which no line can draw. Printed every build so the
    // film's claim is never read as "and everything else is fine".
    console.log('§ESCAPE_ROUTE_POPULATION roomNodes=' + graph.nodes.length +
      ' corridorPseudoRoomsSkipped=' + corridors + ' (CORRIDOR_ROOM:: — nobody starts an escape in a corridor)' +
      ' realRoomsConsidered=' + (graph.nodes.length - corridors) +
      ' reachAnExit=' + reached + ' reachNOexit=' + noExit +
      (noExit > 0 ? ' — ⚠ ' + noExit + ' room(s) have NO route to any exit at all. That is a WORSE finding than'
        + ' any long route and this film cannot draw it (there is no line). egress_sanity.js reports them as'
        + ' isolated_room CRITICAL.' : ' — every real room reaches an exit'));
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
      ' | THE COST ALSO PICKS A DIFFERENT ROOM: by cost the worst is "' + _rec.costWorstName + '" at ' +
      (_rec.costWorstCost == null ? '-' : _rec.costWorstCost.toFixed(2)) +
      (_rec.isAlsoCostWorst ? ' — which is the SAME room, so the two rankings agree here' :
        ' — a DIFFERENT room from the one shown. The film shows the longest real WALK (red1, 2026-09-20: "Get the longest of course")') +
      (_rec.costRatio != null && Math.abs(_rec.costRatio - 1) > 0.05
        ? ' — THEY DISAGREE BY MORE THAN 5%. The film prints the drawn walk. The Egress report prints the cost. That report figure is wrong and is NOT fixed here (see ESCAPE_ROUTE_REVEAL.md FINDINGS).'
        : ' — within 5%, this building has little or no utility-edge penalty on the worst route'));
    return _rec;
  };
  // ══ §ESCAPE_ROUTE_BREACH (red1, 2026-09-20: "is that breaking any fire dept conditions? If so,
  // it be good to flag in the HUD") ═══════════════════════════════════════════════════════════
  // The thresholds are NEVER re-typed here. They come from the same rulebook the Egress panel
  // reads — rates/egress_rules.json via A.loadRuleSet('egress'), which also applies whatever
  // jurisdiction overlay (§RULE_OVERLAY T8.14) the user has selected — falling back to
  // EgressSanity.FALLBACK_RULES, the §RULE_FALLBACK_ONE_SOURCE literal. Absent both, there is no
  // flag at all rather than an invented limit.
  //
  // ⚠ WHAT THE FLAG DOES AND DOES NOT CLAIM. egress_sanity.js's own header states the mismatch and
  // it is not softened here: critical_m 60.96 is IBC 2021 Table 1017.2 Group I-2 (200 ft), which
  // limits travel to the NEAREST AVAILABLE EXIT — normally the protected exit-stair enclosure on
  // the occupant's own floor. This route is measured all the way to a real EXTERIOR door, because
  // that is what the graph's E4 exit nodes are. On an upper storey that OVERSTATES the regulated
  // quantity, so an over-limit flag here is a possible FALSE POSITIVE, never a false negative.
  // It also assumes I-2 occupancy, which this pipeline extracts nothing to confirm. So the HUD
  // says the route is over the screening limit and names the rule; it does not say "violation".
  var _rules = null, _cpRule = null, _rulesSrc = 'none';
  A.escapeRouteSetRules = function (rules, source) {
    _rules = null; _cpRule = null; _rulesSrc = source || 'unknown';
    ((rules && rules.egress_rules) || []).forEach(function (r) {
      if (r.name === 'circulation_distance') _rules = r;
      // §13.1 RED — the COMMON PATH limit is a DIFFERENT rule from the travel-distance one above,
      // with a different citation and a different number. Read from the same rulebook, never
      // re-typed here, for the same reason the breach never re-types its own.
      if (r.name === 'common_path_of_egress_travel') _cpRule = r;
    });
    console.log('§ESCAPE_ROUTE_RULES source=' + _rulesSrc + (_rules
      ? ' circulation_distance warning=' + _rules.warning_m + 'm critical=' + _rules.critical_m + 'm'
      : ' — NO circulation_distance rule found; the HUD will carry no breach flag rather than an invented limit') +
      (_cpRule ? ' | common_path_of_egress_travel unsprinklered=' + _cpRule.critical_m + 'm sprinklered=' +
        (_cpRule.critical_m_sprinklered != null ? _cpRule.critical_m_sprinklered + 'm' : 'n/a')
        : ' | NO common_path_of_egress_travel rule — the RED row will carry no limit rather than an invented one'));
    if (_rec) _rec.breach = A.escapeRouteBreach();
  };
  // ── §13.1 RED's own limit, and WHICH of the two figures applies ──
  // The rulebook's own note: "The evaluator uses the UNSPRINKLERED figure unless real sprinkler
  // evidence is found, matching this file's own over-flag-never-under-flag bias." §13.2 now
  // PRODUCES that evidence — real IfcFireSuppressionTerminal positions along this very route — so
  // the sprinklered figure is used only when the route is actually cased, and the card says which
  // one it used and on what basis. Occupancy class stays unextractable either way (§12.3), so the
  // I-2 half of the citation remains an assumption and is marked as one.
  A.escapeRouteCommonPathLimit = function () {
    if (!_cpRule || !(_cpRule.critical_m > 0)) return null;
    var casedM = (_rec && _rec.cased) ? _rec.cased.reduce(function (a, sp) { return a + (sp[1] - sp[0]); }, 0) : 0;
    var evidence = !!(_rec && _rec.headsTotal > 0 && casedM > 0);
    return { limitM: evidence && _cpRule.critical_m_sprinklered > 0 ? _cpRule.critical_m_sprinklered : _cpRule.critical_m,
             sprinklered: evidence, unsprinkleredM: _cpRule.critical_m,
             sprinkleredM: _cpRule.critical_m_sprinklered, casedM: casedM };
  };
  A.escapeRouteBreach = function () {
    if (!_rec || !_rules) return null;
    var m = _rec.walkM, crit = _rules.critical_m, warn = _rules.warning_m;
    if (!(crit > 0)) return null;
    var lvl = (m >= crit) ? 'critical' : (warn > 0 && m >= warn ? 'warning' : null);
    if (!lvl) return { level: null, limitM: crit, warnM: warn, overBy: null, rule: 'circulation_distance' };
    return { level: lvl, limitM: crit, warnM: warn, rule: 'circulation_distance',
             overBy: m / (lvl === 'critical' ? crit : warn) };
  };
  A.escapeRouteRecord = function () { return _rec; };
  A.escapeRouteReset = function () { _rec = null; _builtFor = null; _buildTried = false; _failReason = null; _stats = _freshStats(); };
  A.escapeRouteFmtWalk = function (sec) { return _fmtWalk(sec); };   // exposed for the witness
  A.escapeRouteConstants = function () {
    return { strideM: STRIDE_M, walkMs: WALK_MS, walkCite: WALK_CITE, leadFrac: LEAD_FRAC,
             spanFrac: SPAN_FRAC, drawFrac: DRAW_FRAC, fadeFrac: FADE_FRAC, easeA: EASE_A,
             easeK: EASE_K, pathHex: PATH_HEX, usesXray: false };
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
    var end = start + span;
    // ══ §ESCAPE_FINALE — the route runs to one second before the film, and no further ══════════
    // red1, 2026-09-20: "its a bit rich, so let it linger a sec more and shuts off only a sec
    // before ... the info is rich and its too little time to let it sink in." Then, on what the
    // last second is for: "Its last second is like a finale. It should not have any overlay on the
    // building."
    // MEASURED on the 1211 run: the window was [0.9651,0.9877] = 189.0s..193.4s of 195.8s — a 4.4 s
    // beat that ended 2.4 s before the film did, so the route came off and then nothing happened.
    // It now ends at 1 - FINALE_SEC/durationSec (194.8s here, +1.4 s of route) and the film's last
    // second is a clean building shot.
    // ⚠ THE 3D COMES OFF WITH IT, and that is already true rather than newly arranged:
    // escapeRouteApplyVisual tears the scene meshes down the frame escapeRouteVisualAt returns
    // null, which is this end. The room shine and the polyline both go at once. The CARD does not —
    // see §ESCAPE_PANEL_LINGER, which red1 asked to run "till the very end".
    // Stretching the window stretches the back-loaded ease with it, so the slowest camera frames
    // now land on the completed route rather than partway through its draw.
    if (plan.durationSec > 0) {
      var finaleEnd = 1 - (FINALE_SEC / plan.durationSec);
      if (finaleEnd > start) end = finaleEnd;
    }
    return { start: start, end: end, orbitLen: L, capped: capped, finaleSec: FINALE_SEC };
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
    var warp = w + EASE_K * w * (1 - w);
    var rate = 1 + EASE_K * (1 - 2 * w);
    _stats.easedFrames++;
    if (_stats.minEaseRate === null || rate < _stats.minEaseRate) _stats.minEaseRate = rate;
    if (_stats.maxEaseRate === null || rate > _stats.maxEaseRate) _stats.maxEaseRate = rate;
    return win.start + (win.end - win.start) * warp;
  };
  // Exposed so the witness can measure the warp without re-implementing it.
  A.escapeRouteEaseRate = function (w) { return 1 + EASE_K * (1 - 2 * w); };

  // ══ THE CARD — the existing bigStats {card,idx,n,opacity} shape, so no new panel is drawn ══════
  // TITLED (§2 item 8, red1: "unambiguous"). Both live numbers, and the walking speed ITSELF, so a
  // viewer can see which standard produced the time rather than only the time it produced.
  // ══ §ESCAPE_PANEL_LINGER — the panel outlives the line ══════════════════════════════════════
  // red1, 2026-09-20: "So that the EscRoute panel lingers rather than cuts off when its overlay
  // goes off. This allows user to sense its work further."
  // THE DWELL IS NOT A NEW NUMBER. cpe_film_boxes.js's LINGER_S is published as
  // A.filmBoxesMeasureLingerS and was spec'd by red1 himself (§56.1, on the Measure box in the very
  // corner this panel now takes): "the marker line on canvas may disappear out of frame but the
  // info box should linger on ... so that user can eyeball what just went past." Same request, same
  // box, same reason — so the same constant, read from the module that owns it rather than copied.
  // Falls back to 2.2 only if that module is absent, and says so nowhere else.
  // The card holds its FINAL figures through the dwell and fades out over it, so the last thing on
  // screen is the completed route's numbers rather than a partial draw frozen mid-count.
  function _cardVisAt(plan, tNorm) {
    var vis = A.escapeRouteVisualAt(plan, tNorm);
    if (vis) return vis;
    if (!_rec || !plan || !(plan.durationSec > 0) || tNorm == null) return null;
    var win = A.escapeRouteWindow(plan);
    if (!win || tNorm <= win.end || tNorm > 1) return null;
    // TILL THE VERY END, BY INTENT — not by arithmetic. red1: "The HUD may remain till the very
    // end ... So that when EscRoute overlay in building ends, that HUD remains as it is almost
    // ended. What more to replace it?" The first cut used cpe_film_boxes' 2.2 s LINGER_S, which
    // happened to outlast the 1.0 s finale on THIS film and would have cut the panel short on a
    // film whose finale was longer. The panel now holds to the last frame at full opacity: the
    // route comes off the building, the numbers stay readable, and nothing reclaims the corner.
    // (§ESCAPE_PANEL_SLOT's own gate is what keeps the Measure box from taking it back.)
    var full = A.escapeRouteVisualAt(plan, win.end - 1e-9);
    if (!full) return null;
    return { w: 1, progress: 1, alpha: 1, drawnM: _rec.walkM, steps: _rec.steps,
             walkSec: _rec.walkSec, winStart: win.start, winEnd: win.end, lingering: true };
  }
  A.escapeRouteStatCardAt = function (plan, tNorm) {
    var vis = _cardVisAt(plan, tNorm);
    if (!vis) return null;
    var b = _rec.breach, label = 'Escape Route — ' + _rec.roomName;
    if (b && b.level === 'critical') label = 'Escape Route — OVER LIMIT';
    else if (b && b.level === 'warning') label = 'Escape Route — over warning';
    // ══ §13.5 THE EVIDENCE TIER IS A GLYPH, AND IT IS VISIBLE BEFORE THE SOURCE IS READ ═════════
    // A citation on screen IS a credibility claim, and half of these are assumptions. A footnote
    // block that let the 0.75 m stride sit in the same visual register as SFPE's 1.19 m/s would
    // LAUNDER the weak number with the strong ones — and would do it more effectively than no
    // footnotes at all, because the reader has been told to trust the block.
    //   NUMBERED SUPERSCRIPT = CITED.   ASTERISK = UNCITED.
    // A cited row whose MEASUREMENT is approximate says so in its own footnote's words, never in
    // a symbol — a third glyph would just be a third thing to decode.
    var cp = A.escapeRouteCommonPathLimit ? A.escapeRouteCommonPathLimit() : null;
    var redM = (_rec.commonPathM != null) ? Math.min(vis.drawnM, _rec.commonPathM) : null;
    var yellowM = (_rec.commonPathM != null) ? Math.max(0, vis.drawnM - _rec.commonPathM) : null;
    var nAlt = _rec.alternates ? _rec.alternates.length : 0;
    var casedM = (_rec.cased || []).reduce(function (a, sp) { return a + (sp[1] - sp[0]); }, 0);
    var legend = [];
    // RED — the §1006.2.1 quantity, with its own limit and its own citation. When no divergence
    // exists the row does NOT print a number as if it were an ordinary one: §12.1/§13.6 say an
    // infinite common path is a different state, not a long one, and it reads as the verdict.
    // ══ EACH ROW SAYS WHAT ITS COLOUR MEANS, IN WORDS ═══════════════════════════════════════
    // red1, 2026-09-20: "the HUD color ie red '..' and grey need explanation such as 'sprinklered
    // zone'". The first cut printed a colour, a number and a terse fragment — "177 m · sprinkler
    // cover" reads as a measurement of something the viewer has not been told the name of. A legend
    // whose rows do not name their own meaning is a colour swatch, not a legend.
    // Each row carries a SHORT form too: at 854x480 the plate is 211 px and the full phrase cannot
    // fit, and a bare number there would be the very thing red1 is objecting to. The ladder in
    // cpe_resource_panel.js takes the longest form that fits, so the meaning survives every size
    // even when the phrasing has to shrink.
    // The words are the CODE QUANTITY each colour carries (§13.1), said plainly: the common path is
    // the stretch with no alternative, the primary is the walk to the nearest exit, the alternates
    // are the other ways out, and grey is the sprinklered stretch of the walk.
    legend.push(nAlt === 0
      ? { key: 'RED', rgb: RED_RGB, value: 'whole route', text: 'NO alternative exists', textShort: 'no alternative',
          right: cp ? 'limit ' + cp.limitM + ' m' : '', marker: cp ? '1' : '' }
      : { key: 'RED', rgb: RED_RGB, value: (redM != null ? redM.toFixed(0) + ' m' : '\u2014'),
          text: 'common path \u2014 no alternative', textShort: 'no alternative',
          right: cp ? 'limit ' + cp.limitM + ' m' : '', marker: cp ? '1' : '' });
    legend.push({ key: 'YELLOW', rgb: PATH_RGB, value: (yellowM != null ? yellowM.toFixed(0) + ' m' : '\u2014'),
                  text: 'onward to the nearest exit', textShort: 'to nearest exit', right: '', marker: '' });
    legend.push(nAlt === 0
      ? { key: 'BLUE', rgb: 'rgba(' + BLUE_RGB + ',1)', value: 'none', text: 'no other way out', textShort: 'no other way', right: '', marker: '' }
      : { key: 'BLUE', rgb: 'rgba(' + BLUE_RGB + ',1)', value: nAlt + (nAlt === 1 ? ' alternate' : ' alternates'),
          text: 'other exits from that point', textShort: 'other exits', right: '', marker: '' });
    legend.push(_rec.headsTotal > 0
      ? { key: 'GREY', rgb: 'rgba(200,205,210,0.9)', value: casedM.toFixed(0) + ' m',
          text: 'sprinklered zone', textShort: 'sprinklered', right: '', marker: '3' }
      : { key: 'GREY', rgb: 'rgba(200,205,210,0.9)', value: 'none',
          text: 'no sprinklers extracted', textShort: 'none found', right: '', marker: '3' });
    // ── the counters row. §3's disclosure rule, and §E of §13.7.
    // ⚠ THE DISCLOSURES STAY ON THE CARD, they do NOT move into the footnotes. Caught by
    // W-ESC-6c/6d/10e/10f on the first cut of §13, which had pushed the speed, the metres and the
    // rule name into footnotes ² and ⁴ — and §13.5's own ruling DROPS the footnote block at clip
    // height, so at 854x480 the card would have shown "~329 steps*" with the asterisk pointing at
    // nothing. A marker whose footnote is gone is worse than no marker. So: the FACT lives on the
    // row and survives every resolution; the footnote carries the fuller source text for the sizes
    // that can read it.
    // The stride's own mark now rides BOTH branches. It used to be dropped from the sub whenever a
    // breach fired — so "~329 steps" showed with nothing saying it is the one number with no
    // source, in exactly the frames where the card is read hardest.
    // ══ §ESCAPE_NO_EXIT (2026-09-21) — THE FINDING THIS FILM CANNOT DRAW ═══════════════════════
    // red1: "noticed that it found a bad Escape Route no way out problem."
    // §ESCAPE_ROUTE_POPULATION has been reporting it all along and saying, in its own words, that
    // "this film cannot draw it (there is no line)". That is exactly the problem: the beat draws a
    // LINE from the worst room to an exit, so a room with NO exit produces nothing to draw, and the
    // single most serious egress finding is the one thing the film is structurally blind to.
    // MEASURED across the fleet: Hospital 1 of 7 rooms, Terminal 3 of 47, LTU_AHouse 3 of 394,
    // HHS 0 of 75. Note the rate falls as the room data improves — Hospital's 1-in-7 sits on seven
    // SYNTHETIC rooms and is likely a graph artefact, while LTU's 3-in-394 sits on real room data
    // and is the one worth believing. The card states the count; it does not interpret it.
    // IT LEADS THE COUNTERS ROW on purpose: a room that cannot be escaped outranks how far the
    // longest walk was. And it lives on the row rather than in a footnote for the reason §13.5
    // already settled — the footnote block is dropped at clip height, and a marker whose footnote
    // is gone is worse than no marker.
    var sub = '';
    if (_rec.roomsWithNoExit > 0) {
      sub += '\u26a0 ' + _rec.roomsWithNoExit + ' room' + (_rec.roomsWithNoExit === 1 ? '' : 's') +
             ' reach NO exit  ·  ';
    }
    sub += '~' + vis.steps + ' steps*  ·  ' + vis.drawnM.toFixed(0) + ' m walked  ·  ';
    if (b && b.level) sub += vis.drawnM.toFixed(0) + ' m vs ' + b.limitM + ' m ' +
      (b.level === 'critical' ? 'limit' : 'warning') + ' (' + BREACH_CITE + ', I-2)⁴  ·  ';
    sub += 'at ' + WALK_MS + ' m/s (' + WALK_CITE + ')²  ·  ' + STRIDE_M + ' m stride assumed';
    // ── the footnotes. NEVER abbreviated past the point of being findable (§13.5): "IBC 2021
    // T1006.2.1" is brief and lookupable; "IBC" alone is a logo, not a citation. Packed onto four
    // lines at most, the way §13.5's own mock packs ² and ³ together, because the card has 259-293
    // px of height and the legend has first claim on it.
    var footnotes = [];
    if (cp) footnotes.push('¹ ' + COMMON_PATH_CITE + ' — ' +
      (cp.sprinklered ? 'sprinklered ' + cp.sprinkleredM + ' m, from real heads on this route'
                      : 'unsprinklered ' + cp.unsprinkleredM + ' m, no cased span found') +
      '; I-2 assumed; from room centre');
    footnotes.push('² ' + WALK_CITE + ' ' + WALK_MS + ' m/s    ³ ' + SPRINKLER_CITE + ' — proximity, not coverage');
    if (b && b.level) footnotes.push('⁴ ' + BREACH_CITE + ' — measured to an exterior door, so it may over-state');
    footnotes.push('* ' + STRIDE_M + ' m stride — no source; this project’s own convention');
    // A FALLBACK CHAIN, longest first, and the card draws the first one that fits WHOLE.
    // §13.5's mock has a SHORT counters row because the sources sit in the footnote block right
    // below it; when that block is dropped — §13.5's ruling at clip height — the markers would
    // point at nothing, so the LONG form carries the sources inline instead. And at 854x480 the
    // plate leaves the sub about 13 px of height and one 8 px line, where even the short form is
    // ellipsed: there the MINIMUM form keeps the one number that must never appear unmarked.
    // An ellipsed long sub is strictly worse than a whole short one — it loses the disclosures it
    // exists for AND keeps none of the room. Whichever form is drawn, no number ever appears
    // without its evidence tier, which is the rule this chain exists to hold.
    // §ESCAPE_NO_EXIT — THE PREFIX GOES ON ALL THREE FORMS, and that is the whole point.
    // Caught by a real 854x480 bake, not by reasoning: the first cut put it only on `sub`, and both
    // the Hospital and Terminal clips came back with `~208 steps* · 156 m walked · …` and no sign
    // of it, because the card drops to `subAlts` at clip height and draws subShort. A fact that
    // vanishes at the size most people watch is not on the card at all. §13.5 settled this once
    // already for the colour legend — "the meaning survives every size" — and it applies here with
    // more force, because this is the most serious thing the beat can find.
    // subMin is the last-ditch form, so it carries the count alone: the walk figures can go before
    // this does.
    var _noExitPre = (_rec.roomsWithNoExit > 0)
      ? ('\u26a0 ' + _rec.roomsWithNoExit + ' room' + (_rec.roomsWithNoExit === 1 ? '' : 's') + ' NO exit  \u00b7  ')
      : '';
    var subShort = _noExitPre + '~' + vis.steps + ' steps*  \u00b7  ' + vis.drawnM.toFixed(0) + ' m walked';
    if (b && b.level) subShort += '  \u00b7  ' + vis.drawnM.toFixed(0) + ' m vs ' + b.limitM + ' m ' +
      (b.level === 'critical' ? 'limit' : 'warning') + '\u2074';
    var subMin = _noExitPre + '~' + vis.steps + ' steps*  \u00b7  ' + vis.drawnM.toFixed(0) + ' m\u00b2';
    // §ESCAPE_PANEL_SLOT (red1: "make it bigger to fit", then "I mean, retain the same coloring.
    // Just use that opposing HUD"). NOTHING about the card's look changes — same keys, same plate,
    // same type ladder, all still guarded by §CARDFIT. The only ask is that the slot it now sits in
    // is sized to the card rather than the card squeezed into the slot: the opposing Measure slot
    // is 367x186 at 1920x1080 against the card's natural 389x293.
    return { card: { big: _fmtWalk(vis.walkSec), label: label, sub: sub, subAlts: [subShort, subMin],
                     legend: legend, footnotes: footnotes },
             boxScale: 1.22, lingering: !!vis.lingering,
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
  // ══ §ESCAPE_ROUTE_HUD_RESERVE (red1, 2026-09-20: "this added HUD panel also must find an empty
  // spot to display to avoid overlapping the others") ═══════════════════════════════════════════
  // TWO different problems, and only the second was real:
  //   THE CARD does not need a spot. It takes the bigStats slot the tail/storey/measure cards
  //   already share, so it REPLACES one card with another and cannot overlap anything by
  //   construction — see cinema_maxq.js's own §-comment on that chain.
  //   THE TWO PLATES do. "Start" and "Exit" are scene-anchored and wander with the orbit, so they
  //   can land on each other and on the corner HUD. clash_labels.js solved exactly this with a
  //   screen-space non-overlap walk; this is that walk, plus the corner column as a no-go area.
  //
  // The column during this beat is EXACTLY the day counter then the card — because
  // A._escRouteHudSuppress clears the sun clock, the compass readout, the path box and the pie out
  // of the middle of it (cinema_maxq.js `_escSuppresses`, re-wired 2026-09-20 on red1's current
  // instruction; between the first retirement and that re-wiring this sentence was false, which is
  // why it now names the function that makes it true). That coupling is what makes this three lines instead of a
  // second copy of _captureFrame's stack maths, and W-ESC-8d asserts it rather than trusting it.
  // `stackBottom` is cinema_maxq.js's OWN measured column depth from the previous captured frame
  // (A._hudStackBottom) — the only thing that knows it, because the sun clock and the compass
  // readout each return their drawn height and nothing can predict them. ONE rectangle covering
  // the whole strip, because since the suppression was retired every box in that column is drawn
  // through the reveal and a plate must clear all of them, not just two.
  // ⚠ WIDTH: cpe_day_counter.js's dayCounterBoxSize() returns { h, margin } and NOTHING ELSE — its
  // own comment says it exists so callers get the HEIGHT without re-deriving it, and the pill's
  // width depends on the text it is about to draw. So the strip takes the CARD's width, which is
  // the widest box in the column. Over-reserving is the safe direction: a plate is pushed clear of
  // space it might not have touched, and never placed on top of a box it would have.
  A.escapeRouteReservedRects = function (w, h, pos, stackDepth) {
    if (!A.bigStatsBoxRect) return [];   // no card geometry to reserve against — place freely
    var margin = Math.round(h * 0.028);
    var card = A.bigStatsBoxRect(w, h, pos, 0);   // the card at offset 0 gives the column's x and width
    // `stackDepth` is cinema_maxq.js's A._hudStackBottom: the column's DEPTH from its anchor edge,
    // measured on the last captured frame. Frame 1 has none, so fall back to the card's own depth —
    // never to an empty reserve, which would drop a plate straight onto the HUD.
    var depth = (stackDepth > 0) ? Math.max(stackDepth, card.h) : card.h;
    var bottomAnchored = (pos === 'bl' || pos === 'br');
    var y = bottomAnchored ? (h - margin - depth) : margin;
    return [ { x: card.x, y: Math.max(0, y), w: card.w, h: Math.min(depth, h) } ];
  };
  function _hits(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  var _v = null;
  A.escapeRouteFrameAt = function (plan, tNorm, camera, w, h, reserved) {
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
    // Place them HERE, not in the draw pass, for clash_labels.js's own reason: a placement a Node
    // witness can assert about is worth far more than one that only exists inside a canvas call.
    _place(labels, w, h, reserved || []);
    // ══ §13.1 THE COLOURED STROKES ══════════════════════════════════════════════════════════════
    // One projected polyline per colour, cut by METRES WALKED exactly as the primary is, so every
    // colour advances with the same walk rather than each running its own clock. The alternates
    // open from the divergence: they share the red spine, so they cannot appear before the walk
    // reaches the point where the choice exists. That IS the reading — the fan opening is the
    // occupant gaining a choice.
    var strokes = [];
    function projList(list) { return list && list.length > 1 ? list.map(proj) : null; }
    function cutBy(list, m) {
      if (!list || list.length < 2) return null;
      var c = _cumOf(list);
      return _cutRange(list, c, 0, m);
    }
    var pastDiv = (_rec.commonPathM != null) ? Math.max(0, want - _rec.commonPathM) : 0;
    // GREY first — it is a casing, so it must sit UNDER every coloured line it cases.
    if (_rec.cased && _rec.cased.length) {
      var cumFull = _cumOf(_rec.pts3);
      for (var ci = 0; ci < _rec.cased.length; ci++) {
        var sp = _rec.cased[ci];
        if (sp[0] >= want) continue;                       // not walked yet
        var seg = _cutRange(_rec.pts3, cumFull, sp[0], Math.min(sp[1], want));
        var sc = projList(seg);
        if (sc) strokes.push({ kind: 'grey', screen: sc });
      }
    }
    // BLUE next, dimmest first, so a nearer alternate is never buried by a further one.
    for (var ai = _rec.alternates.length - 1; ai >= 0; ai--) {
      var alt = _rec.alternates[ai];
      var bs = projList(cutBy(alt.pts3, pastDiv));
      if (bs) strokes.push({ kind: 'blue', rank: alt.rank, of: _rec.alternates.length, screen: bs });
    }
    // RED then YELLOW on top — the two halves of the primary, in the order they are walked.
    var redCut = projList(cutBy(_rec.redPts, want));
    if (redCut) strokes.push({ kind: 'red', screen: redCut });
    var yellowCut = projList(cutBy(_rec.yellowPts, pastDiv));
    if (yellowCut) strokes.push({ kind: 'yellow', screen: yellowCut });
    var rec = { alpha: vis.alpha, progress: vis.progress, drawnM: vis.drawnM,
                drawnPolyM: want, steps: vis.steps, walkSec: vis.walkSec,
                screen: screen, labels: labels, w: w, h: h,
                strokes: strokes, commonPathM: _rec.commonPathM,
                commonDrawnM: Math.min(want, _rec.commonPathM == null ? want : _rec.commonPathM),
                altCount: _rec.alternates.length };
    _stats.drawnFrames++;
    if (vis.progress > _stats.maxProgress) _stats.maxProgress = vis.progress;
    if (vis.drawnM > _stats.maxDrawnM) _stats.maxDrawnM = vis.drawnM;
    return rec;
  };

  // ══ DRAW — the 2D pass. `rec` is THIS frame's record; the caller hands it back so a stale
  // frame's geometry can never be drawn on a frame it was not projected for (clash_labels.js's
  // own contract, same reason). ═════════════════════════════════════════════════════════════════
  // Metrics live here so placement and drawing cannot disagree about a plate's size.
  function _metrics(h) {
    var fontPx = Math.max(10, Math.round(h * 0.017));
    return { fontPx: fontPx, padX: Math.round(fontPx * 0.7), padY: Math.round(fontPx * 0.55),
             rowGap: Math.round(fontPx * 0.32), off: Math.round(h * 0.022),
             margin: Math.round(h * 0.02), radius: Math.round(fontPx * 0.4) };
  }
  // A crude text width — no canvas here, and none needed: the plate only has to be placed, and a
  // per-character estimate at this weight is within a few px of the measured width. The DRAW pass
  // re-measures with the real ctx and uses the placed x/y, so a small estimate error moves nothing.
  function _estW(txt, fontPx) { return Math.ceil(String(txt).length * fontPx * 0.56); }
  // FOUR candidate corners around the anchor, then the one with the fewest collisions. Never drops
  // a plate: "Start" and "Exit" are FIXED labels by the spec (§2 item 6), so a frame that cannot
  // place one cleanly still shows it — overlapping beats vanishing for a two-label set.
  function _place(labels, w, h, reserved) {
    var M = _metrics(h), placed = [];
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var bw = M.padX * 2 + Math.max(_estW(L.rows[0], M.fontPx), _estW(L.rows[1], M.fontPx));
      var bh = M.padY * 2 + M.fontPx * 2 + M.rowGap;
      // FOUR corners at the base offset first — the default reading, tried in order — then the same
      // four pushed progressively further out. Four alone was not enough and the witness proved it:
      // with the two anchors a few px apart, every corner of the second plate landed on the first
      // (W-ESC-8c), and an anchor inside the corner column could not escape a 389 px-wide reserve
      // (W-ESC-8d, 3/15 clean). The ladder costs nothing — the loop breaks the moment a candidate
      // is clean, so the common case is still the first try.
      var cands = [];
      for (var step = 1; step <= 5; step++) {
        var ox = M.off * step, oy = M.off * step + (step - 1) * bh;
        cands.push({ x: L.sx + ox, y: L.sy - oy - bh });        // up-right
        cands.push({ x: L.sx - ox - bw, y: L.sy - oy - bh });   // up-left
        cands.push({ x: L.sx + ox, y: L.sy + oy });             // down-right
        cands.push({ x: L.sx - ox - bw, y: L.sy + oy });        // down-left
      }
      // …then candidates that deliberately CLEAR each obstacle, rather than nibbling past it.
      // The diagonal ladder above cannot escape a tall strip from inside it: at step 5 it has moved
      // ~350 px vertically against a 620 px column (W-ESC-8d caught this at 26/35 when the retired
      // suppression turned the reserve from two boxes into the whole column). One candidate per
      // side of each obstacle fixes it in a single try and costs nothing when nothing is contested.
      var obstacles = reserved.concat(placed);
      for (var oi = 0; oi < obstacles.length; oi++) {
        var R = obstacles[oi];
        cands.push({ x: R.x - M.off - bw, y: L.sy - bh / 2 });      // wholly left of it
        cands.push({ x: R.x + R.w + M.off, y: L.sy - bh / 2 });     // wholly right of it
        cands.push({ x: L.sx - bw / 2, y: R.y - M.off - bh });      // wholly above it
        cands.push({ x: L.sx - bw / 2, y: R.y + R.h + M.off });     // wholly below it
      }
      var bestRect = null, bestHits = Infinity;
      for (var c = 0; c < cands.length; c++) {
        var r = { x: Math.round(Math.max(M.margin, Math.min(cands[c].x, w - M.margin - bw))),
                  y: Math.round(Math.max(M.margin, Math.min(cands[c].y, h - M.margin - bh))),
                  w: bw, h: bh };
        var n = 0, k;
        for (k = 0; k < reserved.length; k++) if (_hits(r, reserved[k])) n++;
        for (k = 0; k < placed.length; k++) if (_hits(r, placed[k])) n++;
        if (n < bestHits) { bestHits = n; bestRect = r; if (n === 0) break; }
      }
      L.x = bestRect.x; L.y = bestRect.y; L.w = bestRect.w; L.h = bestRect.h;
      L.collisions = bestHits;   // 0 on a clean placement; >0 means every corner was contested
      placed.push(bestRect);
    }
    return labels;
  }
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
    // halo first, coloured core on top — the same two-pass contrast guarantee clash_labels.js's
    // leader uses, and for the same reason: one stroke vanishes against a lit facade or the sky.
    // ══ §13.1 — one pass per colour, back to front. `rec.strokes` is this frame's own projection
    // (escapeRouteFrameAt), so a stale frame's geometry can never be painted here. A rec WITHOUT
    // strokes falls back to the single orange line, byte-identically to before §13, so nothing
    // that calls this with an older record changes.
    function strokeList(pts) {
      ctx.beginPath();
      var started = false;
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        if (p.behind) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    if (rec.strokes && rec.strokes.length) {
      for (var si = 0; si < rec.strokes.length; si++) {
        var S = rec.strokes[si];
        if (!S.screen || S.screen.length < 2) continue;
        if (S.kind === 'grey') {
          // THE CASING — a wide, soft, UNBROKEN tube under the route. Solid, not dashed: it is a
          // volume around the walk, not a walk of its own, and dashing it would read as a third
          // route. §13.2: its ABSENCE along the red spine is the finding worth seeing.
          if (ctx.setLineDash) ctx.setLineDash([]);
          ctx.strokeStyle = GREY_RGB; ctx.lineWidth = lw * 5;
          strokeList(S.screen);
          continue;
        }
        if (ctx.setLineDash) ctx.setLineDash([dash, gap]);
        ctx.strokeStyle = LEADER_HALO; ctx.lineWidth = lw + 4;
        strokeList(S.screen);
        if (S.kind === 'red') { ctx.strokeStyle = RED_RGB; ctx.lineWidth = lw + 1; }
        else if (S.kind === 'blue') {
          // Dimmer with rank, never below BLUE_MIN_ALPHA — §13.6 forbids thinning the fan, and an
          // alternate faded to nothing has been thinned whatever the draw loop says.
          var a = S.of > 1 ? 1 - (S.rank - 1) / S.of * (1 - BLUE_MIN_ALPHA) : 1;
          ctx.strokeStyle = 'rgba(' + BLUE_RGB + ',' + Math.max(BLUE_MIN_ALPHA, a).toFixed(3) + ')';
          ctx.lineWidth = lw;
        } else { ctx.strokeStyle = PATH_RGB; ctx.lineWidth = lw; }
        strokeList(S.screen);
      }
      if (ctx.setLineDash) ctx.setLineDash([]);
    } else {
      if (ctx.setLineDash) ctx.setLineDash([dash, gap]);
      ctx.strokeStyle = LEADER_HALO; ctx.lineWidth = lw + 4;
      stroke();
      ctx.strokeStyle = PATH_RGB; ctx.lineWidth = lw;
      stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    // the moving head — a solid dot, so the eye has something to follow along the dashes
    var head = null;
    for (var q = rec.screen.length - 1; q >= 0; q--) if (!rec.screen[q].behind) { head = rec.screen[q]; break; }
    if (head) {
      ctx.fillStyle = LEADER_HALO; ctx.beginPath(); ctx.arc(head.x, head.y, lw * 1.9 + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PATH_RGB; ctx.beginPath(); ctx.arc(head.x, head.y, lw * 1.9, 0, Math.PI * 2); ctx.fill();
    }
    // the two plates — clash_labels.js's own metrics/colours, two rows, leader + dot. The RECTANGLE
    // was decided in escapeRouteFrameAt (§ESCAPE_ROUTE_HUD_RESERVE): this pass only draws it, so a
    // stale frame's placement can never be painted on a frame it was not placed for, and the Node
    // witness can assert the layout without a canvas. Same update/draw split as clash_labels.js.
    var M = _metrics(h), n = 0;
    for (var li = 0; li < rec.labels.length; li++) {
      var L = rec.labels[li];
      if (L.x == null) continue;
      var x = L.x, y = L.y, bw = L.w, bh = L.h;
      var ax = Math.max(x, Math.min(L.sx, x + bw)), ay = Math.max(y, Math.min(L.sy, y + bh));
      ctx.strokeStyle = LEADER_HALO; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(L.sx, L.sy); ctx.stroke();
      ctx.strokeStyle = LEADER; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(L.sx, L.sy); ctx.stroke();
      ctx.fillStyle = LEADER_HALO; ctx.beginPath(); ctx.arc(L.sx, L.sy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PATH_RGB; ctx.beginPath(); ctx.arc(L.sx, L.sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PLATE;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, bw, bh, M.radius); ctx.fill(); }
      else ctx.fillRect(x, y, bw, bh);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = PATH_RGB; ctx.font = '700 ' + M.fontPx + 'px ' + FONT;
      ctx.fillText(L.rows[0], x + M.padX, y + M.padY + M.fontPx / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = '700 ' + M.fontPx + 'px ' + FONT;
      ctx.fillText(L.rows[1], x + M.padX, y + M.padY + M.fontPx + M.rowGap + M.fontPx / 2);
      n++;
    }
    ctx.restore();
    return n;
  };

  // ══ 3D — THE ROOM GLOW, AND NOTHING ELSE TOUCHES THE SCENE ═══════════════════════════════════
  // A storey tints its meshes by `userData.storey`; a ROOM has no equivalent per-mesh membership in
  // this schema (checked), so the room's real geometry here is its A.allRoomVolumes() sub-rect
  // box(es) — the same boxes the Room Lens draws — added as depthTest:false meshes so the room
  // reads from an orbit distance through the building, and disposed on exit.
  //
  // This beat leaves the BUILDING'S OWN MATERIALS ALONE. Nothing is x-rayed, tinted, hidden or
  // restored — see §ESCAPE_ROUTE_NO_XRAY below — so the only teardown it owes is its own meshes.
  var _meshes = [], _on = false;
  function _tearDown() {
    _meshes.forEach(function (m) {
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
    _meshes = [];
    A._escRouteHudSuppress = false;
    _on = false;
  }
  function _build3D() {
    if (!THREE || !A.scene || !_rec) return;
    // ══ §ESCAPE_ROUTE_NO_XRAY (red1, 2026-09-20, after watching a real bake) ═══════════════════
    // VERDICT, his: "x-ray even be bad to judge 3D space from experience. So i go for no x-ray
    // since it save time, and the info is already clear and intuitive enough — user would get the
    // idea right away." Three reasons and all three hold up, so this beat engages NO x-ray at all.
    //   LEGIBILITY — a uniformly translucent building destroys the depth cues the eye uses to read
    //     3D, which is his experience talking, not a preference.
    //   COST — MEASURED with a dev tap, two 88-frame 854x480 runs back to back, same box, same
    //     clip, same DB, only the x-ray differing: 334 s / 4.24 s per frame WITH, 146 s / 1.40 s
    //     WITHOUT. The scoped x-ray was 2.3x the wall clock and 3.0x per frame — essentially the
    //     whole cost of the reveal window.
    //   IT WAS NOT EVEN WORKING — his words on the first bake, "I dont see the x-ray giving any
    //     effect as the whole building looks very solid". It fired (nothing else explains a 3x
    //     frame cost), but Alt+Z's 0.3 is per SURFACE: the eye sees 0.7^n of the interior through
    //     n of them, and DoubleSide makes every wall two. Through a hospital that is ~3%. Milk.
    // NOTHING IS LOST FROM THE REVEAL ITSELF. The route line is composited in 2D onto the capture
    // canvas and the room glow is depthTest:false, so both still read through the building — the
    // x-ray was only ever adding interior CONTEXT around them, at 3x the frame cost.
    // A briefly-added strength parameter on A.toggleXray was reverted with this: no caller wants
    // it now, and a knob nothing turns is just a thing to explain later. Alt+Z is untouched.
    _rec.boxes.forEach(function (b) {
      var geo = new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z);
      var mat = new THREE.MeshBasicMaterial({ color: PATH_HEX, transparent: true, opacity: 0.22,
                                              depthTest: false, depthWrite: false });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.center.x, b.center.y, b.center.z);
      mesh.renderOrder = 1004;
      // §FINDINGS_CEASE_3D reads this name. The cease is a PREDICATE — it hides everything in the
      // scene that draws with depthTest:false once the closing beats open — and the room glow is
      // depthTest:false by design, so the beat that is actually on screen has to say so by name or
      // the gate would switch off its own content. Disposed at beat exit like the rest of _meshes.
      mesh.name = 'escapeRouteGlow';
      A.scene.add(mesh); _meshes.push(mesh);
      var eg = new THREE.EdgesGeometry(geo.clone());
      var em = new THREE.LineBasicMaterial({ color: PATH_HEX, transparent: true, opacity: 0.85, depthTest: false });
      var edges = new THREE.LineSegments(eg, em);
      edges.position.copy(mesh.position); edges.renderOrder = 1005;
      edges.name = 'escapeRouteGlowEdges';   // same exemption, see above
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

  // Exposed so the §5 witness can assert the LAYOUT without a renderer or a fake camera — the same
  // "slice the predicate out" rule the rest of this file follows. Returns the labels, mutated with
  // x/y/w/h and a `collisions` count.
  A.escapeRoutePlaceLabels = function (labels, w, h, reserved) { return _place(labels, w, h, reserved || []); };
  A.escapeRouteRectsHit = function (a, b) { return _hits(a, b); };
  A.escapeRouteStats = function () {
    var s = {}; for (var k in _stats) s[k] = _stats[k];
    s.built = !!_rec; s.failReason = _failReason;
    if (_rec) { s.roomName = _rec.roomName; s.walkM = _rec.walkM; s.graphCostM = _rec.graphCostM; s.steps = _rec.steps; s.walkSec = _rec.walkSec; }
    return s;
  };
  // ONE line after the loop. VACUOUS = the window never opened on a real frame, so the film proves
  // nothing about this feature however clean the code is (the project's own summary convention).
  A.escapeRouteSummary = function (framesDone) {
    var s = _stats;
    if (!_rec) {
      // Missing metadata is a FAIL, not an INCONCLUSIVE — that distinction is the whole point of
      // §ESCAPE_ROUTE_METADATA_MISSING above, and the summary must not soften it back.
      if (_failReason) console.error('§ESCAPE_ROUTE_SUMMARY ' + _failReason +
        ' — the beat drew nothing because the building lacks the data, NOT because it is clean');
      else console.log('§ESCAPE_ROUTE_SUMMARY INCONCLUSIVE — nothing was built; see §ESCAPE_ROUTE_BUILD above for why');
      return s;
    }
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
