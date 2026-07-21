/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * room_graph.js — §7 room-to-room adjacency graph + pathfinding
 * (prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7, 2026-07-11).
 * OCCUPANT UPGRADE (prompts/Modeller/DISC_Walker/OCCUPANT_PATHFINDER.md, 2026-07-12): the graph
 * below this point is E1-only (door touches >=2 rooms). That undercounts how people actually walk —
 * "it need not be door to door... along the hallway... even thru the stairs" (user intent, verbatim
 * in the spec). This file adds three more edge kinds on top of the untouched E1 logic:
 *   E2 — a door that touches exactly ONE room (previously discarded as "deadend") is that room's
 *        real door onto un-compiled circulation space (hallway/concourse) — rescued as room<->CIRC.
 *   E3 — stair/ramp flights (elements_meta IfcStairFlight/IfcRampFlight) bridge two storeys'
 *        circulation nodes, vertically, so cross-storey paths exist at all.
 *   E4 — the existing nonRoomDoors detection (a door name-filtered out of the room test, e.g. a
 *        building's few non-room-facing doors) becomes an N-EXIT node — free escape-route targets.
 * API-COMPATIBLE BY CONSTRUCTION: `graph.nodes` (the array the Viewer's From/To room picker
 * enumerates directly, viewer/navigate_find.js `_buildPathPanel()`) stays ROOM-ONLY, exactly as
 * before — CIRC/EXIT/waypoint entries are added ONLY to `graph.nodesByGuid` (a plain map, never
 * iterated as an array anywhere in this codebase), so every existing consumer keeps working with
 * ZERO edits. `shortestPath()`'s exposed `path` never contains a bare CIRC node guid either — see
 * that function's header for the waypoint-substitution rule that keeps the drawn polyline hugging
 * real door/stair positions, not an invented storey centroid.
 *
 * WHY THIS IS NEW: checked directly (see the spec doc) — no room-to-room adjacency graph exists
 * anywhere in this pipeline before this file. `scripts/compile_rooms.py`'s door-rescue computes
 * PER-ROOM door adjacency only ("does room X have a door nearby, for the flood-fill's own
 * classification"), never room-to-room connectivity. `build/room_type_classifier.js`'s
 * `countAdjacentDoors()` extends the same per-room test to a COUNT, still per-room.
 *
 * PROVENANCE — reuses, does not reinvent, the existing door-adjacency buffer test:
 * `scripts/compile_rooms.py` `_door_adjacent()` (DOOR_BUFFER_SLACK = RES = 0.20m, buffer =
 * max(door.bbox_x, door.bbox_y)/2 + DOOR_BUFFER_SLACK around the door's own real footprint) and
 * `_is_room_door()` (name-keyword exclusion for lift/elevator doors — real doors, not room
 * evidence, found on real SampleCastle data). This file's new contribution is applying that SAME
 * per-room test to EVERY room on the door's storey and recording which room(s) it falls inside —
 * a door whose buffered point falls inside exactly 2 rooms' footprints is a real, measured edge
 * between those 2 rooms, carrying the door's own real guid (edge provenance, not inferred).
 *
 * §MULTI-RECT aware: a room may be N spatial_structure rows sharing `room_guid` (grouped the same
 * way `viewer/navigate_find.js` `_allRoomVolumes()` already does) — a door counts as touching the
 * room if it hits ANY of that room's sub-rects.
 *
 * DISTANCE, not buffered-containment, is the match rule (measured directly against real Duplex
 * data — see spec doc §7 witness): for each room on the door's storey, compute the point-to-AABB
 * distance from the door's own center to that room's rect-set (0 if the point already falls
 * inside a rect, else the Euclidean distance to its nearest edge). A room is a CANDIDATE if that
 * distance is within the door's own buffer radius (max(bbox_x,bbox_y)/2 + DOOR_BUFFER_SLACK — same
 * constant compile_rooms.py uses, just as an acceptance radius here instead of a box-inflation).
 * An earlier "inflate every room's box by the buffer and count containment hits" version was tried
 * first and produced WRONG edges on real Duplex data — 3-way buffer overlaps on tightly-packed
 * rooms (e.g. Level 2's Bathroom/Utility/Bedroom cluster) resolved to the two rooms with the
 * closest CENTERS to the door, which is not the same as the two rooms the door actually opens
 * between (verified by hand: door `150478` sits literally inside Bedroom A203's rect (distance 0)
 * and 0.07m off Hallway A201's edge — center-distance wrongly preferred Bathroom A204 instead).
 * Distance-to-nearest-edge fixes this because the two REAL neighbours are always at ~0 distance
 * (the door sits on/inside their shared boundary); a merely-nearby third room is farther.
 *
 * Match counts, per door (all measured + §-logged by `buildGraph`, never invented):
 *   0 candidates → orphan door (log only, no edge — e.g. a door whose room's data is missing bbox)
 *   1 candidate  → the room's own door onto circulation (E2 rescue — see file header above)
 *   2 candidates → the normal case: one real edge, carrying the door's own guid
 *   3+ candidates → ambiguous (buffer overlap on tightly-packed rooms) — logged, primary E1 edge
 *              still drawn between the 2 CLOSEST-BY-DISTANCE candidates (a measured tie-break, not
 *              a guess); EVERY additional real candidate beyond the top-2 is ALSO wired (E9) to
 *              the door's own real waypoint position instead of being dropped — see
 *              §AMBIGUOUS-RESIDUAL-RESCUE below (a real 3-way doorway junction is not "one edge
 *              and 1+ orphans", it's every genuine neighbour reaching the same real door)
 *
 * Caller contract: `dbQuery(sql, params)` returns an array of row-ARRAYS (positional, the same
 * `A.dbQuery` convention `common/room_habitability.js` already assumes) — this module is DB/file
 * I/O-free otherwise, so it runs identically in the browser (viewer/modeller) and in a node
 * witness script against sql.js/better-sqlite3.
 */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : {};
  // §G3-REVISED (PATH_LEGAL_SEGMENTS.md) — pack/unpack + lookup for the offline-precomputed
  // per-storey walkable raster (scripts/build_storey_walkable_raster.js). Dual-mode like this file.
  var StoreyRaster = (typeof module !== 'undefined' && module.exports) ? require('./storey_raster.js') : ROOT.StoreyRaster;
  // §UTILITY-ROUTING-PENALTY (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10, 2026-07-22) — the utility-room
  // classifier, dual-mode loaded exactly like HallwayBackbone/StoreyRaster above. Reused (not
  // reinvented) from common/room_habitability.js `classifyUtilityRooms()` — the SAME real element-
  // composition signal (ACMV IfcFlowSegment duct-dominance or pure IfcFooting) already used by the
  // Type-lens display (viewer/navigate_find.js), batched for perf (proven safe on Hospital's 311
  // rooms). buildGraph() below uses it to TAG utility room nodes; _buildAdjacency() applies a
  // routing-cost penalty (NOT removal) to any edge touching one — see UTILITY_EDGE_PENALTY.
  var RoomHabitability = (typeof module !== 'undefined' && module.exports) ? require('./room_habitability.js') : ROOT.RoomHabitability;

  // Ported verbatim from scripts/compile_rooms.py — see file header. Not a new number.
  var DOOR_BUFFER_SLACK = 0.20;
  // §UTILITY-ROUTING-PENALTY: cost multiplier applied in _buildAdjacency() to any weighted edge
  // that touches a utility-classified room node (node.isUtility). This is the "penalise, prefer
  // circulation" design target VIEWER_FIND_PANEL_ROOM_ACCURACY.md §9/§10 named — a cabling/service
  // room stays REACHABLE (a maintenance-access "find path to the closet" query still resolves, just
  // costs more), but ordinary room→room routing never treats it as an equal-weight circulation hop.
  // Value chosen (not tuned to a fixture): real room-center-to-room-center edges in these buildings
  // run ~3–12m and a corridor alternative "a few hops longer" adds ~10–40m; ×8 makes even a single
  // ~5m utility hop cost ~40m, and a THROUGH-route (two touching edges, entry+exit, both penalised)
  // cost ~80m — reliably losing to any realistic corridor detour a few hops longer — while staying
  // finite (a multiplier, never Infinity/edge-removal, so reachability is preserved per §10's own
  // "do NOT hard-exclude" requirement). A path whose destination IS the utility room pays the
  // penalty on only its single arrival edge, which is fine/expected.
  var UTILITY_EDGE_PENALTY = 8;
  // §DOOR-NOT-ROOM ported verbatim from scripts/compile_rooms.py NON_ROOM_DOOR_NAMES.
  var NON_ROOM_DOOR_NAMES = ['liftdeur', 'lift', 'elevator', 'aufzug', 'fahrstuhl', 'hoist'];
  function isRoomDoor(name) {
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < NON_ROOM_DOOR_NAMES.length; i++) if (n.indexOf(NON_ROOM_DOOR_NAMES[i]) >= 0) return false;
    return true;
  }

  // §STAIR-GROUP: collapse a multi-flight stair's individual Run rows (Run 1/Run 2/... or a
  // trailing ":N" index — both real naming conventions measured across Terminal/JKR/Duplex source
  // data, see OCCUPANT_PATHFINDER.md POC log) to ONE base key per PHYSICAL stair. Order matters:
  // try " Run N" first — some names ALSO end in ":<ID>" (the flight's own numeric id), and
  // stripping ":\d+$" unconditionally would eat that id too (measured bug, POC run 1).
  var RUN_SUFFIX_RE = /\s+Run\s+\d+$/;
  var INDEX_SUFFIX_RE = /:\d+$/;
  function stairBaseKey(name) {
    var n = String(name || '');
    if (RUN_SUFFIX_RE.test(n)) return n.replace(RUN_SUFFIX_RE, '');
    return n.replace(INDEX_SUFFIX_RE, '');
  }

  // §STAIR-GROUPS (extracted from buildGraph's E3 logic, 2026-07-14 §HALLWAY-BACKBONE) — the ONE
  // trusted stair extractor for this codebase (WalkerDoctrine §10). §STAIR-CLASS-FALLBACK
  // (SampleCastle, 2026-07-13): flights (IfcStairFlight/IfcRampFlight) are PREFERRED — proven
  // z-span behavior on Terminal/JKR/Duplex — but some real buildings model stairs ONLY as
  // IfcStair/IfcRamp ASSEMBLIES (SampleCastle: 9 IfcStair, zero flights). If the flight query
  // returns nothing, fall back to the assembly classes; never mix both (a building with both —
  // Duplex — would double-count the same physical stair). Deliberately NO discipline filter — real
  // data (Clinic) shows the primary flight rows split ARC (the "Concrete Pan" stairs) vs STR (the
  // "Monolithic Concrete Stair") for the SAME building; an ARC-only filter would silently drop the
  // STR-tagged physical stair. Groups by stairBaseKey() so a multi-flight physical stair (Run 1/
  // Run 2, or a trailing ":N" flight index) counts as ONE stair, not one per flight — verified
  // against Clinic's real elements_meta 2026-07-14: 8 flight rows -> 4 stair groups + 1 ramp group
  // (Ramp:150mm Concrete ADA Ramp), matching the trusted Building Parts Taxonomy ground truth of 4
  // stairs, where three different ad-hoc `ifc_class LIKE 'IfcStair%'` phrasings returned 7/8/13.
  // §XY-FOOTPRINT (2026-07-14, §HALLWAY-BACKBONE): also tracks each group's real XY bbox extent
  // (xlo/xhi/ylo/yhi, from every flight row's own bbox_x/bbox_y) — needed by
  // common/hallway_backbone.js's terminateAtStair() for a real bbox-rect distance test, not just a
  // mean-center point. Additive only — the existing E3 z-bridging consumer (cx/cy/n/zlo/zhi) is
  // untouched.
  // Returns { groups: {key: {guids,cx,cy,n,zlo,zhi,xlo,xhi,ylo,yhi}}, order: [key,...] (insertion order) }.
  function getStairGroups(dbQuery, log) {
    log = log || function () {};
    var flightRows = [], assemblyRows = [];
    var _stairSelect = "SELECT m.guid, m.element_name, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z" +
      ' FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid';
    try {
      flightRows = dbQuery(_stairSelect +
        " WHERE (m.ifc_class LIKE 'IfcStairFlight%' OR m.ifc_class LIKE 'IfcRampFlight%') AND t.center_z IS NOT NULL") || [];
    } catch (eFl) { log('§ROOM_GRAPH_STAIR_ERR ' + eFl.message); }
    // §STAIR-FLIGHT-ASSEMBLY-MERGE (2026-07-14, real bug found via user report — Hospital: cross-
    // floor paths universally failed, "no door-connected route", on every pair). Root cause: the
    // OLD either/or fallback ("if flightRows.length is exactly 0, use assemblies instead") breaks
    // the moment a SINGLE unrelated flight row exists anywhere in the building — Hospital has
    // exactly 1 real IfcStairFlight ("Stair:Monolithic Stair:248870", an orphan, z-span only
    // 1.1m — too short to bridge any two real storeys) alongside 61 real IfcStair ASSEMBLY rows
    // ("Stair:180mm max riser 280mm going:*", real multi-floor stairs with real per-floor Z
    // variants) that the strict either/or NEVER reached, because flightRows.length was 1, not 0.
    // Fix: always query BOTH, then MERGE — an assembly-derived stair is added only if its
    // stairBaseKey ISN'T already covered by a flight-derived group, so a building where flights
    // and assemblies represent the SAME physical stairs (e.g. Duplex) never double-counts; a
    // building where they're genuinely DIFFERENT stairs (Hospital) gets both.
    var flightKeys = {};
    flightRows.forEach(function (f) { flightKeys[stairBaseKey(f[1])] = true; });
    try {
      assemblyRows = dbQuery(_stairSelect +
        " WHERE (m.ifc_class LIKE 'IfcStair%' OR m.ifc_class LIKE 'IfcRamp%') AND t.center_z IS NOT NULL") || [];
    } catch (eAs) { log('§ROOM_GRAPH_STAIR_ASSEMBLY_ERR ' + eAs.message); }
    var mergedAssemblyRows = assemblyRows.filter(function (a) { return !flightKeys[stairBaseKey(a[1])]; });
    if (mergedAssemblyRows.length) {
      log('§ROOM_GRAPH_STAIR_MERGE flightRows=' + flightRows.length + ' assemblyOnlyRows=' + mergedAssemblyRows.length +
        ' (assembly stairs not already covered by a flight — merged in, not replacing)');
    }
    flightRows = flightRows.concat(mergedAssemblyRows);

    var groups = {}, order = [];
    flightRows.forEach(function (f) {
      var key = stairBaseKey(f[1]);
      if (!groups[key]) {
        groups[key] = { guids: [], cx: 0, cy: 0, n: 0, zlo: Infinity, zhi: -Infinity,
          xlo: Infinity, xhi: -Infinity, ylo: Infinity, yhi: -Infinity,
          // §STAIR-RUN-ENDS (2026-07-14, real user report — a rendered stair hop looked like a
          // vertical "elevator shaft drop" instead of following the real stair run): a physical
          // stair's bottom and top landings are NOT at the same XY — real run/offset as you climb
          // (measured on HHS stair 576198: flight rows range Y=10.4 to Y=13.8, a real 3.4m
          // horizontal offset). Track each END's own real position (the row nearest zlo / nearest
          // zhi), not a single XY average across the whole stair — an average collapses both ends
          // to the same point, which is what produced the vertical-drop artifact.
          loRowZ: Infinity, loRowX: null, loRowY: null, hiRowZ: -Infinity, hiRowX: null, hiRowY: null };
        order.push(key);
      }
      var gr = groups[key];
      gr.guids.push(f[0]);
      var cx = f[2], cy = f[3], cz = f[4], bx = f[5] || 0, by = f[6] || 0, bz = f[7] || 0;
      gr.cx += cx; gr.cy += cy; gr.n++;
      gr.zlo = Math.min(gr.zlo, cz - bz / 2);
      gr.zhi = Math.max(gr.zhi, cz + bz / 2);
      gr.xlo = Math.min(gr.xlo, cx - bx / 2);
      gr.xhi = Math.max(gr.xhi, cx + bx / 2);
      gr.ylo = Math.min(gr.ylo, cy - by / 2);
      gr.yhi = Math.max(gr.yhi, cy + by / 2);
      if (cz < gr.loRowZ) { gr.loRowZ = cz; gr.loRowX = cx; gr.loRowY = cy; }
      if (cz > gr.hiRowZ) { gr.hiRowZ = cz; gr.hiRowX = cx; gr.hiRowY = cy; }
    });
    return { groups: groups, order: order };
  }

  // Build the room-adjacency graph from the SAME building db the Room Lens already reads.
  // Returns { nodes:[{guid,name,label,storey,rects,cx,cy}] (ROOM NODES ONLY — see file header),
  //           edges:[{a,b,doorGuid,doorName,storey,kind,ambiguous?}],
  //           nodesByGuid:{guid:node} (superset: rooms + circ + exit + waypoints), stats:{...} }.
  function buildGraph(dbQuery, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var nodes = {}, order = [];
    var hasRoomGuid = false;
    try {
      var cols = dbQuery('PRAGMA table_info(spatial_structure)') || [];
      hasRoomGuid = cols.some(function (c) { return c[1] === 'room_guid'; });
    } catch (eCols) { /* hasRoomGuid stays false */ }

    var spaceRows = [];
    try {
      spaceRows = dbQuery('SELECT s.guid, s.name, s.object_type, s.predefined_type, s.center_x, s.center_y, ' +
        's.size_x, s.size_y, p.name, s.center_z' + (hasRoomGuid ? ', s.room_guid' : ', NULL') +
        ' FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid' +
        " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL") || [];
    } catch (eSp) { log('§ROOM_GRAPH_SPACE_ERR ' + eSp.message); return { nodes: [], edges: [], nodesByGuid: {} }; }

    spaceRows.forEach(function (r) {
      var lg = r[10] || r[0]; // logical room guid: room_guid, falling back to this row's own guid (§MULTI-RECT)
      if (!nodes[lg]) {
        nodes[lg] = {
          guid: lg, kind: 'room', name: r[1] || lg,
          label: [r[2], r[3], r[1]].filter(Boolean).join(' '),
          storey: r[8] || '(no storey)', rects: [], _sumx: 0, _sumy: 0, _sumz: 0, _n: 0
        };
        order.push(lg);
      }
      var g = nodes[lg];
      g.rects.push({ x0: r[4] - r[6] / 2, x1: r[4] + r[6] / 2, y0: r[5] - r[7] / 2, y1: r[5] + r[7] / 2 });
      g._sumx += r[4]; g._sumy += r[5]; g._sumz += (r[9] || 0); g._n++;
    });
    order.forEach(function (lg) {
      var g = nodes[lg];
      g.cx = g._sumx / g._n; g.cy = g._sumy / g._n; g.cz = g._sumz / g._n;
      delete g._sumx; delete g._sumy; delete g._sumz; delete g._n;
    });
    var roomOrder = order.slice(); // §API-COMPAT: exposed graph.nodes stays room-only (see file header)

    // §STOREY-Z: derive each storey's z from its own rooms' average center_z (robust even where an
    // IfcBuildingStorey row's own center_z is NULL — measured on Duplex, see POC log) — needed to
    // work out which two storeys a stair/ramp flight bridges (E3).
    var storeyZSum = {}, storeyZN = {};
    roomOrder.forEach(function (lg) {
      var g = nodes[lg];
      storeyZSum[g.storey] = (storeyZSum[g.storey] || 0) + g.cz;
      storeyZN[g.storey] = (storeyZN[g.storey] || 0) + 1;
    });
    var storeyZ = {};
    Object.keys(storeyZSum).forEach(function (s) { storeyZ[s] = storeyZSum[s] / storeyZN[s]; });
    var storeysSorted = Object.keys(storeyZ).sort(function (a, b) { return storeyZ[a] - storeyZ[b]; });

    // §CORRIDOR-ROOM-BACKPROP (2026-07-14, user's own framing: "backward propagation"). The
    // corridor backbone (hallway_backbone.js) is built from RAW doors+walls — independent of room
    // compilation. When it finds a real, door+wall-verified hallway with NO compiled room there at
    // all, that is evidence room-compilation MISSED a real space, not evidence to discard — the
    // SAME standard this codebase already trusts for §DOOR-RESCUE (compile_rooms.py: "a door
    // proves a pocket is a room"). Measured on HHS (sparse-wall federated, only 14 compiled rooms
    // for the whole building): 12 of 15 real hallway buckets had NO room there at all. Injecting
    // them as real 'room' nodes HERE (before the E1/E2 door loop below runs) means a door sitting
    // in one of these corridors gets a REAL E1 two-room edge instead of a lone-door E2 rescue, AND
    // these corridors become real, selectable Path endpoints — the Find panel's From/To picker
    // enumerates `graph.nodes` directly (§API-COMPAT), so a room injected into `roomOrder` here is
    // automatically visible there, same as any real compiled room. This also delivers this
    // session's earlier "Type.Hall/Corridor" label directly — these nodes ARE that type by
    // construction (see `label`), not a separate classification pass over already-compiled data.
    // `backbone` is reused (not rebuilt) by the spine/E2 wiring further below.
    var HallwayBackbone = (typeof module !== 'undefined' && module.exports) ? require('./hallway_backbone.js') : ROOT.HallwayBackbone;
    var backbone = null;
    if (HallwayBackbone) {
      try {
        backbone = HallwayBackbone.buildBackbone(dbQuery, { log: log });
        var corridorRoomsInjected = 0, corridorRoomsSkippedOverlap = 0, corridorRoomIndexByStorey = {};
        // §OVERLAP-GUARD (real bug found+fixed same session, before this ever shipped): a
        // centroid-only "is this space covered" test is NOT enough — a corridor bucket's grown
        // WIDTH can still substantially overlap a real compiled room's rect even when the bucket's
        // own centroid sits outside that room. Confirmed on Clinic: a corridor rect nearly
        // engulfed real room RM_First_Floor_10 (5.0m^2 of ~5.3m^2 overlap) while its centroid was
        // outside R10 by more than the old 1m tolerance — R10 then LOST both of its own doors to
        // the corridor room in the E1 distance tie-break, going from 1 real edge to ZERO (a room
        // that used to be reachable became completely disconnected). Real rect-overlap-area test
        // instead: skip injection if the candidate corridor rect overlaps ANY real room by more
        // than a physically meaningful amount (0.5m^2 — bigger than wall-thickness/measurement
        // slop, far smaller than a real room) — never let a synthetic room shadow a real one.
        function rectOverlapArea(a, c) {
          var ox = Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0));
          var oy = Math.max(0, Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
          return ox * oy;
        }
        backbone.joined.forEach(function (b) {
          var rc = HallwayBackbone.bucketRect(b);
          var bcx = (rc.x0 + rc.x1) / 2, bcy = (rc.y0 + rc.y1) / 2;
          var overlapsRealRoom = roomOrder.some(function (lg) {
            var g = nodes[lg];
            if (g.storey !== b.storey) return false;
            return g.rects.some(function (r) { return rectOverlapArea(r, rc) > 0.5; });
          });
          if (overlapsRealRoom) { corridorRoomsSkippedOverlap++; return; } // a real compiled room already occupies (part of) this space — don't shadow it
          var crg = 'CORRIDOR_ROOM::' + b.key;
          var crIdx = (corridorRoomIndexByStorey[b.storey] = (corridorRoomIndexByStorey[b.storey] || 0) + 1);
          nodes[crg] = { guid: crg, kind: 'room', name: '≈ ' + b.storey + ' Hall/Corridor ' + crIdx, label: 'Hall / Corridor',
            storey: b.storey, rects: [rc], cx: bcx, cy: bcy, cz: storeyZ[b.storey] };
          order.push(crg); roomOrder.push(crg);
          b._corridorRoomGuid = crg;
          corridorRoomsInjected++;
        });
        if (corridorRoomsInjected || corridorRoomsSkippedOverlap) log('§CORRIDOR_ROOM_BACKPROP injected=' + corridorRoomsInjected +
          ' skippedOverlap=' + corridorRoomsSkippedOverlap + ' / ' + backbone.joined.length + ' joined buckets');
      } catch (eBb0) { log('§CORRIDOR_ROOM_BACKPROP_ERR ' + eBb0.message); backbone = null; }
    }

    // §UTILITY-ROUTING-PENALTY (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10, 2026-07-22): classify every
    // real room node by real element COMPOSITION (RoomHabitability.classifyUtilityRooms — see the
    // require's own comment) and TAG utility rooms with node.isUtility. _buildAdjacency() then
    // penalises (never removes) any edge touching a tagged node, so ordinary room→room routing
    // prefers a corridor over cutting through a cabling/service room while keeping it reachable.
    // Descriptor shape ({guid,cx,cy,sx,sy,storey}) mirrors navigate_find.js's two existing call
    // sites; sx/sy are derived here from each logical room's UNION rect bbox (§MULTI-RECT aware —
    // an L-shaped room's several sub-rects collapse to one covering box, same as a single-rect
    // room degenerates to its own rect), with the box center used for cx/cy so the descriptor is
    // self-consistent for the classifier's element range-scan. Batched call — 2 SQL queries total
    // regardless of room count (the Hospital-311 perf fix baked into classifyUtilityRooms).
    // Defensive: module absent / query error → no tags, penalty never fires, graph unchanged.
    var utilityRoomCount = 0;
    if (RoomHabitability && RoomHabitability.classifyUtilityRooms) {
      try {
        var utilDescs = roomOrder
          // §NEVER-PENALISE-A-CORRIDOR (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10, 2026-07-22): synthetic
          // CORRIDOR_ROOM::* nodes (injected by §CORRIDOR-ROOM-BACKPROP) ARE circulation by
          // construction — the very thing routing should PREFER. With the door exemption ignored a
          // footing under a corridor slab would otherwise tag the corridor itself utility:footing
          // (measured: Hospital_3 tagged all 8 of its corridor nodes) and penalise the route we want
          // to favour — exactly backwards. Exclude them from utility classification outright.
          .filter(function (lg) { return lg.indexOf('CORRIDOR_ROOM::') !== 0; })
          .map(function (lg) {
            var g = nodes[lg];
            var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
            g.rects.forEach(function (rc) {
              if (rc.x0 < minx) minx = rc.x0; if (rc.x1 > maxx) maxx = rc.x1;
              if (rc.y0 < miny) miny = rc.y0; if (rc.y1 > maxy) maxy = rc.y1;
            });
            return { guid: lg, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2,
              sx: maxx - minx, sy: maxy - miny, storey: g.storey };
          });
        // §DOOR-EXEMPTION-POLICY (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10, 2026-07-22): routing must
        // ignore classifyUtilityRooms's door-exemption. That exemption ("a room with a nearby door
        // is a serviced space, not a void") is right for the Type-lens DISPLAY, but for ROUTING it
        // meant every utility room that could ever be a through-hop (a graph edge REQUIRES a nearby
        // door) was exempted out — so the penalty never fired on a real door-carrying cabling closet.
        // ignoreDoorExemption:true classifies by element composition alone, closing that gap.
        var utilMap = RoomHabitability.classifyUtilityRooms(utilDescs, dbQuery, { ignoreDoorExemption: true }) || {};
        Object.keys(utilMap).forEach(function (guid) {
          if (nodes[guid]) { nodes[guid].isUtility = true; nodes[guid].utilityWhy = utilMap[guid]; utilityRoomCount++; }
        });
        if (utilityRoomCount) log('§ROOM_GRAPH_UTILITY utilityRooms=' + utilityRoomCount +
          ' (routing penalty x' + UTILITY_EDGE_PENALTY + ' on touching edges, not removed)');
      } catch (eUtil) { log('§ROOM_GRAPH_UTILITY_ERR ' + eUtil.message); }
    }

    var doorRows = [];
    try {
      doorRows = dbQuery('SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y' +
        ' FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid' +
        " WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL") || [];
    } catch (eDr) { log('§ROOM_GRAPH_DOOR_ERR ' + eDr.message); }

    // Point-to-AABB distance: 0 if (px,py) already inside [x0,x1]x[y0,y1], else Euclidean
    // distance to the nearest edge/corner.
    function rectDist(rc, px, py) {
      var dx = Math.max(rc.x0 - px, 0, px - rc.x1);
      var dy = Math.max(rc.y0 - py, 0, py - rc.y1);
      return Math.hypot(dx, dy);
    }

    function circNode(storey, cx, cy, cz) {
      var cg = 'CIRC::' + storey;
      if (!nodes[cg]) {
        nodes[cg] = { guid: cg, kind: 'circ', name: 'Circulation — ' + storey, storey: storey,
          cx: cx, cy: cy, cz: cz };
        order.push(cg);
      }
      return cg;
    }

    // §HALLWAY-BACKBONE (2026-07-14): a room's lone door used to rescue onto ONE per-storey
    // `CIRC::<storey>` blob (see circNode above) — every E2-rescued door on a floor collapsed to
    // the SAME point, so two rooms both reached only via E2 measured zero distance apart no matter
    // how far the real hallway actually runs between them, and the rendered path floated straight
    // through open space instead of hugging the corridor (user-reported, 2026-07-14). Fix: build a
    // real, wall-grounded corridor spine (common/hallway_backbone.js) and rescue each E2 door onto
    // its NEAREST real spine waypoint instead of the shared blob, with spine waypoints chained to
    // each other by real-distance edges along the actual corridor. Falls back to the OLD single-
    // blob behavior per storey if the backbone build finds nothing there (short/doorless corridor,
    // or the module isn't available) — never worse than before, never invents a spine that isn't
    // grounded in real doors+walls.
    var edges = [], deadend = 0, orphan = 0, ambiguous = 0, nonRoomDoors = 0, e2 = 0, orphanRescued = 0, ambiguousResidualRescued = 0;
    var spineByStorey = {}; // storey -> [{guid,cx,cy}]
    // §CORRIDOR-WIDTH: real, wall-measured corridor rects (see hallway_backbone.js bucketRect) fed
    // into _pointWalkable()'s room-rects fallback — WITHOUT this, a storey with no walkable raster
    // treats genuine open corridor floor (no room modeled there) as illegal, so a legality detour
    // can never succeed through it no matter how many spine candidate points are added.
    var corridorRectsByStorey = {};
    if (backbone) {
      try {
        backbone.joined.forEach(function (b, bi) {
          var mid = (b.span.lo + b.span.hi) / 2;
          var scx = (b.axis === 'x') ? mid : b.runCoord;
          var scy = (b.axis === 'x') ? b.runCoord : mid;
          var sg = 'SPINE::' + b.key;
          nodes[sg] = { guid: sg, kind: 'spine', name: 'Corridor — ' + b.storey, storey: b.storey, cx: scx, cy: scy, cz: storeyZ[b.storey], chainIndex: b._chainIndex };
          order.push(sg);
          b._spineGuid = sg;
          (spineByStorey[b.storey] = spineByStorey[b.storey] || []).push(nodes[sg]);
          (corridorRectsByStorey[b.storey] = corridorRectsByStorey[b.storey] || []).push(HallwayBackbone.bucketRect(b));
          // §CORRIDOR-ROOM-BACKPROP bridge: a bucket that got a synthetic room node (above, before
          // the door loop) needs a real edge to its OWN spine node too — without this it's only
          // reachable via whichever of its own doors also happen to E1-touch another real room,
          // cut off from the crossing/long-distance network same as the CIRC-SPINE-BRIDGE gap was.
          if (b._corridorRoomGuid) {
            var crRoom = nodes[b._corridorRoomGuid];
            var crw = Math.hypot(crRoom.cx - scx, crRoom.cy - scy);
            edges.push({ a: b._corridorRoomGuid, b: sg, doorGuid: null, doorName: 'Corridor junction', storey: b.storey, kind: 'E8', w: crw });
          }
        });
        backbone.crossings.forEach(function (c) {
          // §CROSSING-IDENTITY: c.a/c.b are real bucket OBJECTS (see hallway_backbone.js
          // walkBackbone) — do NOT index into backbone.joined with them (that was the bug: a
          // per-storey-local index treated as a global one, producing phantom cross-storey edges).
          var a = c.a, b = c.b;
          if (!a || !b || !a._spineGuid || !b._spineGuid) return;
          var w = Math.hypot(nodes[a._spineGuid].cx - nodes[b._spineGuid].cx, nodes[a._spineGuid].cy - nodes[b._spineGuid].cy);
          edges.push({ a: a._spineGuid, b: b._spineGuid, doorGuid: null, doorName: 'Corridor junction', storey: a.storey, kind: 'E5', w: w });
        });
        log('§HALLWAY_BACKBONE_WIRED spineNodes=' + backbone.joined.length + ' spineEdges=' + backbone.crossings.length +
          ' storeys=' + Object.keys(spineByStorey).length);
      } catch (eBb) { log('§HALLWAY_BACKBONE_ERR ' + eBb.message); }
    }
    function nearestSpine(storey, px, py) {
      var pts = spineByStorey[storey];
      if (!pts || !pts.length) return null;
      var best = null, bestD = Infinity;
      pts.forEach(function (p) { var d = Math.hypot(p.cx - px, p.cy - py); if (d < bestD) { bestD = d; best = p; } });
      return best;
    }

    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1] || '', storey = d[2] || '', dx = d[3], dy = d[4], dz = d[5], bx = d[6] || 0, by = d[7] || 0;
      if (!isRoomDoor(name)) { nonRoomDoors++; return; }
      var buf = Math.max(bx, by) / 2 + DOOR_BUFFER_SLACK;
      var cands = [];
      roomOrder.forEach(function (lg) {
        var g = nodes[lg];
        if (g.storey !== storey) return; // per-storey, same discipline as compile_rooms.py storey_doors()
        var best = Infinity;
        for (var i = 0; i < g.rects.length; i++) best = Math.min(best, rectDist(g.rects[i], dx, dy));
        if (best <= buf) cands.push({ lg: lg, dist: best });
      });
      cands.sort(function (p, q) { return p.dist - q.dist; });
      if (cands.length >= 2) {
        edges.push({ a: cands[0].lg, b: cands[1].lg, doorGuid: guid, doorName: name, storey: storey,
          kind: 'E1', ambiguous: cands.length > 2, hitCount: cands.length });
        // §G4-DETOUR-NODES (PATH_LEGAL_SEGMENTS.md): every room-facing door becomes a doorwp
        // waypoint too (not just E2's circulation-rescue case below) — shortestPath()'s
        // visibility-graph detour walks these as its candidate waypoints. Additive only:
        // graph.nodes (room-only, §API-COMPAT) is untouched, this only grows nodesByGuid's superset.
        if (!nodes[guid]) nodes[guid] = { guid: guid, kind: 'doorwp', name: name, storey: storey, cx: dx, cy: dy, cz: dz };
        if (cands.length > 2) {
          ambiguous++;
          log('§ROOM_GRAPH_AMBIGUOUS_DOOR "' + name + '" candidates=' + cands.length +
            ' picked=' + cands[0].lg + ',' + cands[1].lg);
          // §AMBIGUOUS-RESIDUAL-RESCUE (2026-07-15, real island root cause — Clinic R31/R40/R42/
          // R45/R58, all measured 2026-07-15): the OLD behavior drew exactly one E1 edge between
          // the 2 CLOSEST candidates and silently DISCARDED every candidate beyond that, even when
          // its own distance to the SAME door is well inside the buffer (e.g. R31 at 0.22m vs a
          // 0.73m buffer — a genuinely real doorway, just narrowly edged out of the top-2 by two
          // other equally-real neighbours at a 3-way junction). That is exactly what turned these
          // 5 Clinic rooms into zero-edge islands in fullConnectivity(). Fix: wire every residual
          // candidate (index>=2) to the door's OWN real waypoint position instead of dropping it —
          // never invented, same real door, same measured distance already computed above. Also
          // link the waypoint itself to the top candidate so the residual isn't its own island.
          edges.push({ a: guid, b: cands[0].lg, doorGuid: guid, doorName: name, storey: storey, kind: 'E9', w: cands[0].dist });
          for (var ci = 2; ci < cands.length; ci++) {
            edges.push({ a: guid, b: cands[ci].lg, doorGuid: guid, doorName: name, storey: storey, kind: 'E9', w: cands[ci].dist });
            ambiguousResidualRescued++;
            log('§ISLAND_BRIDGE ambiguous-residual room=' + cands[ci].lg + ' via door="' + name +
              '" dist=' + cands[ci].dist.toFixed(3) + 'm buffer=' + buf.toFixed(3) + 'm storey=' + storey);
          }
        }
      } else if (cands.length === 1) {
        deadend++; e2++;
        // §HALLWAY-BACKBONE: rescue onto the NEAREST real corridor spine point for this storey
        // when one exists (real distance, real hallway) — falls back to the old single per-storey
        // blob only when no backbone was built here (e.g. too few doors to form a corridor).
        var nearSpine = nearestSpine(storey, dx, dy);
        var cg = nearSpine ? nearSpine.guid : circNode(storey, dx, dy, dz);
        // §API-COMPAT-WAYPOINT: register the door's OWN real guid as a rendering waypoint for this
        // circ hop (see shortestPath() below) — a real position, not a storey centroid.
        if (!nodes[guid]) nodes[guid] = { guid: guid, kind: 'doorwp', name: name, storey: storey, cx: dx, cy: dy, cz: dz };
        var e2w = nearSpine ? Math.hypot(nearSpine.cx - dx, nearSpine.cy - dy) : undefined;
        edges.push({ a: cands[0].lg, b: cg, doorGuid: guid, doorName: name, storey: storey, kind: 'E2', wpA: null, wpB: guid, w: e2w });
      } else {
        orphan++;
        // §ORPHAN-SPINE-RESCUE (2026-07-14): a door with ZERO room candidates used to get NO graph
        // presence at all — dropped silently, even when it sits right on a real corridor. Common
        // on sparse-wall federated buildings (HHS: 117/133 doors orphaned, only 14 rooms compiled
        // for the whole building — most floor area was never compiled into a room, so most doors
        // can't reach one). This does NOT invent a room connection (there is genuinely no compiled
        // room here) — it only reconnects the door into the real spine network it's already
        // measured to sit near, so isolated pockets of real corridor (reachable only via these
        // orphan doors) stop being unreachable islands. Additive only, never touches E1/E2's own
        // room-facing logic.
        var orphanSpine = nearestSpine(storey, dx, dy);
        if (orphanSpine) {
          if (!nodes[guid]) nodes[guid] = { guid: guid, kind: 'doorwp', name: name, storey: storey, cx: dx, cy: dy, cz: dz };
          var ow = Math.hypot(orphanSpine.cx - dx, orphanSpine.cy - dy);
          edges.push({ a: guid, b: orphanSpine.guid, doorGuid: guid, doorName: name, storey: storey, kind: 'E7', w: ow });
          orphanRescued++;
        }
      }
    });

    // ── E3: stair/ramp flights bridge two storeys' circulation nodes ──
    // §STAIR-GROUPS: extracted to getStairGroups() below (2026-07-14, §HALLWAY-BACKBONE) so a
    // second consumer (common/hallway_backbone.js's terminateAtStair) can reuse the SAME trusted
    // flight-first/assembly-fallback query + physical-stair grouping instead of a fresh ad-hoc
    // IfcStair% query — WalkerDoctrine §10, one function not a new one. Verified against Clinic's
    // real data 2026-07-14: yields exactly 4 physical stairs (the trusted Building Parts Taxonomy
    // ground truth), where a naive `ifc_class LIKE 'IfcStair%'` count returns 7/8/13 depending on
    // phrasing — this function is the one to call, not a new query.
    var stairGroupsResult = getStairGroups(dbQuery, log);
    var flightGroups = stairGroupsResult.groups, flightGroupOrder = stairGroupsResult.order;

    var e3 = 0, e3Skipped = 0;
    var _e3Seen = {};
    // Shared E3 edge creation (§STAIR-CHAIN): one storey-pair edge per physical stair span, with
    // the stairwp render waypoints at the group's real z ends. Deduped on storeyA|storeyB — two
    // stair groups (or one tower emitting a chain) never produce parallel identical edges.
    function _e3Chain(sA, sB, gr, key) {
      var ek = sA + '|' + sB;
      if (_e3Seen[ek]) return;
      _e3Seen[ek] = 1;
      var gcx = gr.cx / gr.n, gcy = gr.cy / gr.n;
      var zA = storeyZ[sA], zB = storeyZ[sB];
      var circA = circNode(sA, gcx, gcy, zA), circB = circNode(sB, gcx, gcy, zB);
      // §API-COMPAT-WAYPOINT: two synthetic-but-deterministic waypoint guids (this flight group's
      // own representative guid + a side suffix) at the SEGMENT's real z ends — used to render
      // the vertical hop hugging the actual stair, not a storey centroid (see shortestPath()).
      var repGuid = gr.guids[0];
      var zLo = Math.min(zA, zB), zHi = Math.max(zA, zB);
      var loWp = repGuid + '::' + sA.replace(/\W/g, '_') + '::lo', hiWp = repGuid + '::' + sB.replace(/\W/g, '_') + '::hi';
      // §PATH_LEGAL_STAIRWP_STOREY (2026-07-13, real bug found live: user-reported path routing
      // "cuts across space" traced to only 1/4 chords of a real cross-floor path ever being legality-
      // tested). Root cause: these two nodes never carried a `storey` field at all — _legalizePath's
      // same-storey gate (`a.storey == null` -> skip) therefore skipped EVERY chord touching a stair
      // waypoint, including the two genuinely same-storey ones (room/door <-> stairwp on ITS OWN
      // floor), not just the one genuinely cross-floor stairwp<->stairwp E3 hop. loWp sits at the
      // LOWER of the two storeys' z (whichever of sA/sB that is), hiWp at the higher — same ternary
      // wpForA/wpForB already use below, so this can never disagree with which node an edge treats
      // as "storey sA's side" vs "storey sB's side".
      // §STAIR-RUN-ENDS: each end uses its OWN real measured position (the flight row nearest
      // that end's z), not the whole-stair average — see getStairGroups() comment for why (a
      // real ~3.4m horizontal run offset was being collapsed to a vertical drop). Falls back to
      // the average only if a real end-row position is somehow missing (defensive, never invents
      // a NEW point — gcx/gcy is itself real, just less precise).
      var loX = (gr.loRowX != null) ? gr.loRowX : gcx, loY = (gr.loRowY != null) ? gr.loRowY : gcy;
      var hiX = (gr.hiRowX != null) ? gr.hiRowX : gcx, hiY = (gr.hiRowY != null) ? gr.hiRowY : gcy;
      if (!nodes[loWp]) nodes[loWp] = { guid: loWp, kind: 'stairwp', name: key + ' (lower)', cx: loX, cy: loY, cz: zLo, storey: (zA <= zB) ? sA : sB };
      if (!nodes[hiWp]) nodes[hiWp] = { guid: hiWp, kind: 'stairwp', name: key + ' (upper)', cx: hiX, cy: hiY, cz: zHi, storey: (zA <= zB) ? sB : sA };
      var wpForA = (zA <= zB) ? loWp : hiWp, wpForB = (zA <= zB) ? hiWp : loWp;
      edges.push({ a: circA, b: circB, doorGuid: repGuid, doorName: key, storey: sA + ' / ' + sB,
        kind: 'E3', w: Math.abs(zB - zA) || Math.abs(gr.zhi - gr.zlo), wpA: wpForA, wpB: wpForB });
      e3++;
    }
    flightGroupOrder.forEach(function (key) {
      var gr = flightGroups[key];
      if (gr.n === 0) return;
      var gcx = gr.cx / gr.n, gcy = gr.cy / gr.n;
      // Rule (measured against real Terminal + JKR data, OCCUPANT_PATHFINDER.md POC log): prefer
      // storeys whose OWN z sits INSIDE the flight group's [zlo,zhi] span (the flight physically
      // reaches that floor's elevation) — bridge the lowest and highest such storey. When exactly
      // ONE storey is contained (the common real case — a flight's bbox usually reaches only one
      // storey's z exactly, extending past it toward the real partner floor without quite
      // reaching that floor's own z too), use whichever side's extension is a SUBSTANTIAL share
      // (>=30%) of the flight's own span to pick the real neighbour storey — never invent a
      // bridge in a direction with no storey there (verified: this correctly excludes Terminal's
      // below-grade entrance stairs, whose upward poke past Aras Tanah is only ~24% of their span).
      var contained = storeysSorted.filter(function (s) { return gr.zlo <= storeyZ[s] && storeyZ[s] <= gr.zhi; });
      var sA, sB;
      if (contained.length >= 2) {
        // §STAIR-CHAIN (SampleCastle, 2026-07-13): a group spanning 3+ storeys (a stair TOWER —
        // the assembly-class case, one IfcStair per whole tower) must connect CONSECUTIVE floors,
        // not just its two ends — bridging only lowest<->highest left every middle storey with no
        // vertical edge (user-reported: 00->03 refused while the stair tower plainly serves all
        // floors). Emit the chain here for the middle pairs; fall through for the end pair so the
        // shared edge-creation below stays single-source. Duplicate physical stairs produce the
        // same chain — deduped by _e3Seen.
        for (var ci = 1; ci + 1 < contained.length; ci++) {
          _e3Chain(contained[ci], contained[ci + 1], gr, key);
        }
        // §STAIR-TOWER-ENDS (SampleCastle, 2026-07-13): storeyZ is MEAN WALL-CENTER z, which sits
        // roughly half a wall above the floor a stair's top actually lands on — so a tower whose
        // top flight genuinely serves the next storey's floor still falls short of that storey's
        // z (castle: tower tops at 9.11, storey 03 walls average 10.02, gap 02→03 = 3.0m, the
        // extension covers 70% of it). If the group's end extends >=30% (the same constant the
        // single-contained rule already uses) of the gap toward the adjacent storey, chain it too
        // — gap-relative, not span-relative, because a multi-storey tower's own span dwarfs any
        // one storey's gap.
        var lastC = contained[contained.length - 1], lastIdx = storeysSorted.indexOf(lastC);
        if (lastIdx + 1 < storeysSorted.length) {
          var nxtS = storeysSorted[lastIdx + 1], gapUp = storeyZ[nxtS] - storeyZ[lastC];
          if (gapUp > 0 && (gr.zhi - storeyZ[lastC]) >= 0.3 * gapUp) _e3Chain(lastC, nxtS, gr, key);
        }
        var firstC = contained[0], firstIdx = storeysSorted.indexOf(firstC);
        if (firstIdx - 1 >= 0) {
          var prvS = storeysSorted[firstIdx - 1], gapDn = storeyZ[firstC] - storeyZ[prvS];
          if (gapDn > 0 && (storeyZ[firstC] - gr.zlo) >= 0.3 * gapDn) _e3Chain(prvS, firstC, gr, key);
        }
        sA = contained[0]; sB = contained[1];
      } else if (contained.length === 1) {
        var s0 = contained[0], idx = storeysSorted.indexOf(s0);
        var downExt = storeyZ[s0] - gr.zlo, upExt = gr.zhi - storeyZ[s0];
        var span = gr.zhi - gr.zlo;
        var hasBelow = idx - 1 >= 0, hasAbove = idx + 1 < storeysSorted.length;
        var upOk = hasAbove && upExt >= 0.3 * span;
        var downOk = hasBelow && downExt >= 0.3 * span;
        var nbrIdx;
        if (upOk && (!downOk || upExt >= downExt)) nbrIdx = idx + 1;
        else if (downOk) nbrIdx = idx - 1;
        else { e3Skipped++; return; }
        sA = s0; sB = storeysSorted[nbrIdx];
      } else {
        var below = storeysSorted.filter(function (s) { return storeyZ[s] <= gr.zlo; });
        var above = storeysSorted.filter(function (s) { return storeyZ[s] >= gr.zhi; });
        if (!below.length || !above.length) { e3Skipped++; return; }
        sA = below[below.length - 1]; sB = above[0];
      }
      _e3Chain(sA, sB, gr, key);
    });

    // §CIRC-SPINE-BRIDGE (2026-07-14, real regression found via user screenshot + HHS report):
    // E3's stair edges connect circA<->circB (the per-storey CIRC blob, still created here
    // unconditionally for stair-bridging even though E2 now prefers a real spine waypoint over
    // it). On a storey where a backbone WAS built, E2 never rescues onto CIRC anymore — so CIRC
    // silently became an ISLAND: reachable from a real stair, reachable from nothing else, no path
    // could ever cross that floor transition even though a real stair genuinely connects it.
    // Confirmed live: Clinic First Floor R10 -> Second Floor R5 returned a real (if imperfect)
    // path before this session's spine-wiring change, then NULL after it — a straight regression,
    // not an improvement. Fix: bridge every CIRC node into its own storey's nearest real spine
    // point (real distance, same nearestSpine() helper E2 already uses) so the two subgraphs merge
    // into one connected network again. No-op (never created, nothing to bridge) on a storey with
    // no backbone — same graceful-degrade discipline as the rest of this feature.
    // §CIRC-PER-CHAIN-BRIDGE (2026-07-15, real island root cause — HHS components 1/2/3, all
    // measured 2026-07-15): the OLD version bridged CIRC to only the SINGLE globally-nearest spine
    // point on that storey — but a real storey can have MULTIPLE distinct corridor chains
    // (walkBackbone()'s own union-find grouping, `_chainIndex`) that don't cross each other at all
    // (separate wings). Bridging to just one chain left every OTHER real chain on the same floor an
    // island, even though the SAME stair genuinely gives floor-wide circulation access to all of
    // them (measured on HHS: Level 1/2/3 each had a second/third chain — e.g. "Level 1 Hall/
    // Corridor 3" — stranded despite a real stair reaching that exact floor). Fix: bridge one edge
    // per DISTINCT chain present on the storey (real distance to that chain's own nearest bucket),
    // not just one edge overall — same real stair, same real corridor data, just no longer
    // arbitrarily picking a single winner among multiple real chains.
    var circBridges = 0;
    order.forEach(function (lg) {
      var g = nodes[lg];
      if (g.kind !== 'circ') return;
      var pts = spineByStorey[g.storey];
      if (!pts || !pts.length) return;
      var nearestByChain = {};
      pts.forEach(function (p) {
        var ck = (p.chainIndex != null) ? p.chainIndex : ('nochain::' + p.guid);
        var d = Math.hypot(p.cx - g.cx, p.cy - g.cy);
        if (!nearestByChain[ck] || d < nearestByChain[ck].d) nearestByChain[ck] = { p: p, d: d };
      });
      Object.keys(nearestByChain).forEach(function (ck) {
        var sp = nearestByChain[ck].p, w = nearestByChain[ck].d;
        // §CIRC-CLOSEBY-RENDER (2026-07-15h): unlike E2/E3, this edge never carried a `wp` —
        // _publicHop()'s circ-substitution (line ~832) fell through to the raw arrivedGuid, i.e.
        // CIRC::<storey>'s own (cx,cy), which is just whichever stair group's AVERAGED flight
        // position happened to create that node first (circNode() call site, §E3 above) — not a
        // point on THIS chain's corridor at all. A route hopping onto CIRC via this E6 edge (same-
        // storey chain-to-chain bridge, or the spine-side leg of a stair crossing) rendered a
        // segment straight to that unrelated averaged point instead of hugging the real corridor —
        // the "x-crossing"/"detouring toward an unrelated adjoining space" user report. Fix: wpA
        // points arrival-at-CIRC to the REAL spine waypoint `sp` this edge already bridges from —
        // same closeby-verb shape as E3's wpA/wpB (prefer a genuinely near real point over the
        // graph's own bookkeeping node), just for the same-storey case E3 didn't cover.
        edges.push({ a: lg, b: sp.guid, doorGuid: null, doorName: 'Corridor junction', storey: g.storey, kind: 'E6', w: w, wpA: sp.guid });
        circBridges++;
        log('§ISLAND_BRIDGE circ-per-chain storey=' + g.storey + ' chain=' + ck + ' spine=' + sp.guid + ' dist=' + w.toFixed(2) + 'm');
      });
    });
    if (circBridges) log('§CIRC_SPINE_BRIDGE bridged=' + circBridges);

    // ── E4: escape — the existing nonRoomDoors detection becomes an N-EXIT node (free fire-escape
    // target); connect the nearest room-or-circ node on that storey (real distance, not invented).
    var exits = 0, e4 = 0;
    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1] || '', storey = d[2] || '', dx = d[3], dy = d[4], dz = d[5];
      if (isRoomDoor(name)) return; // only the name-filtered set — see file header
      var exitGuid = 'EXIT::' + guid;
      nodes[exitGuid] = { guid: exitGuid, kind: 'exit', name: 'Exit — ' + (name || guid), storey: storey,
        cx: dx, cy: dy, cz: dz };
      order.push(exitGuid); exits++;
      var best = null, bestD = Infinity;
      order.forEach(function (lg) {
        var g = nodes[lg];
        if (g.guid === exitGuid || g.storey !== storey) return;
        if (g.kind !== 'room' && g.kind !== 'circ') return;
        var dd = Math.hypot(g.cx - dx, g.cy - dy);
        if (dd < bestD) { bestD = dd; best = lg; }
      });
      if (best) {
        edges.push({ a: best, b: exitGuid, doorGuid: guid, doorName: name, storey: storey, kind: 'E4', w: bestD });
        e4++;
      }
    });

    var circCount = order.filter(function (lg) { return nodes[lg].kind === 'circ'; }).length;
    log('§ROOM_GRAPH nodes=' + roomOrder.length + ' doors=' + doorRows.length + ' nonRoomDoors=' + nonRoomDoors +
      ' edges=' + edges.filter(function (e) { return e.kind === 'E1'; }).length +
      ' deadend=' + deadend + ' orphan=' + orphan + ' orphanRescued=' + orphanRescued + ' ambiguous=' + ambiguous +
      ' ambiguousResidualRescued=' + ambiguousResidualRescued +
      ' circ=' + circCount + ' stairs=' + e3 + ' (skipped=' + e3Skipped + ') exits=' + exits + ' e2=' + e2);

    // §G3-REVISED (PATH_LEGAL_SEGMENTS.md): read-only lookup of the offline-precomputed per-storey
    // walkable raster (scripts/build_storey_walkable_raster.js self-heals this table onto a
    // building's db). Defensive: table absent (older patch / building not yet mined) -> rasters
    // stays {} and shortestPath()'s chord-legality test falls back to roomRectsByStorey alone.
    var rasters = {};
    try {
      var rasterRows = dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster') || [];
      rasterRows.forEach(function (row) { rasters[row[0]] = StoreyRaster.fromRow(row); });
    } catch (eRas) { /* table absent — rasters stays {}, defensive fallback in shortestPath() */ }
    if (Object.keys(rasters).length) log('§PATH_LEGAL_RASTER storeys=' + Object.keys(rasters).join(','));
    var roomRectsByStorey = {};
    roomOrder.forEach(function (lg) {
      var g = nodes[lg];
      if (!roomRectsByStorey[g.storey]) roomRectsByStorey[g.storey] = [];
      g.rects.forEach(function (rc) { roomRectsByStorey[g.storey].push(rc); });
    });

    return {
      nodes: roomOrder.map(function (lg) { return nodes[lg]; }), // §API-COMPAT: room-only, see file header
      edges: edges,
      nodesByGuid: nodes, // superset: room + circ + exit + waypoint entries, see file header
      rasters: rasters, // §G3-REVISED: {storey: StoreyRaster instance}, see shortestPath()
      roomRectsByStorey: roomRectsByStorey, // §G3-REVISED fallback when a storey has no raster
      corridorRectsByStorey: corridorRectsByStorey, // §CORRIDOR-WIDTH: real backbone corridor rects, same fallback
      stats: { doors: doorRows.length, nonRoomDoors: nonRoomDoors,
        edges: edges.filter(function (e) { return e.kind === 'E1'; }).length,
        deadend: deadend, orphan: orphan, orphanRescued: orphanRescued, ambiguous: ambiguous,
        ambiguousResidualRescued: ambiguousResidualRescued,
        circ: circCount, stairs: e3, stairsSkipped: e3Skipped, exits: exits, e2: e2 }
    };
  }

  // Degree per node guid (edge count, ambiguous edges count too — they ARE real edges, just tie-broken).
  // Room-only by construction (graph.nodes is room-only) — unchanged from the pre-occupant-graph
  // behavior; a room's degree DOES reflect its new E2/E4 edges (edges reference real room guids on
  // one side), it simply never reports a degree FOR a circ/exit node (those aren't in graph.nodes).
  function degree(graph) {
    var deg = {};
    graph.nodes.forEach(function (n) { deg[n.guid] = 0; });
    graph.edges.forEach(function (e) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
    return deg;
  }

  // Connected-component id per node guid (for "is every room reachable from every other" honesty check).
  // Room-only by construction (unchanged from pre-occupant-graph behavior — only counts E1 edges,
  // since an edge is only followed when BOTH endpoints are already-seeded room guids). Kept this way
  // deliberately: this is a separate, pre-existing function the spec doesn't ask to extend: only
  // shortestPath() is specified to walk the full occupant graph (circ/exit included).
  function components(graph) {
    var adj = {};
    graph.nodes.forEach(function (n) { adj[n.guid] = []; });
    graph.edges.forEach(function (e) { if (adj[e.a] && adj[e.b]) { adj[e.a].push(e.b); adj[e.b].push(e.a); } });
    var comp = {}, cid = 0;
    graph.nodes.forEach(function (n) {
      if (comp[n.guid] != null) return;
      var stack = [n.guid]; comp[n.guid] = cid;
      while (stack.length) {
        var u = stack.pop();
        (adj[u] || []).forEach(function (v) { if (comp[v] == null) { comp[v] = cid; stack.push(v); } });
      }
      cid++;
    });
    return comp;
  }

  // §FULL-CONNECTIVITY (2026-07-14, user ask: "is there a simple test where every door can go to
  // any other door via a covered path... is there no gap?"). components() above deliberately stays
  // ROOM-ONLY (E1 edges only, a pre-existing honesty metric the spec doesn't ask to extend — see
  // its own comment). This is the NEW, COMPLETE version: same union-find shape, but walks the
  // FULL adjacency shortestPath()'s Dijkstra already uses (graph.nodesByGuid — the documented
  // superset of rooms + circ/spine + stair + exit + waypoint nodes — and ALL edge kinds E1-E8, not
  // just E1). A door only ever appears in this graph AS an edge (E1/E2/E7 carry doorGuid/doorName),
  // never as its own node — so "every door reaches every other door with no gap" is exactly the
  // question "is this full graph ONE connected component" (fullyConnected === true, components===1
  // for a non-empty graph). Where it's NOT, `sizes`/`comp` let a caller name the actual isolated
  // island(s) by node guid — see witness_full_connectivity.js for the concrete report pattern.
  function fullConnectivity(graph) {
    // §NOT-EVERY-NODE-IS-A-VERTEX (2026-07-14, real bug found building this): `graph.nodesByGuid`
    // is a superset that also holds 'doorwp'/'stairwp' entries which are PURE POSITION LOOKUPS for
    // two entirely separate on-demand systems (_detourForChord's per-chord visibility graph;
    // shortestPath's path-rendering waypoint substitution) — most of them are NEVER an edge
    // endpoint in `graph.edges` at all. Seeding the node universe from nodesByGuid wholesale
    // produced ~200 phantom size-1 "islands" on Clinic that were never real gaps, just unused
    // lookup entries. The correct universe: every 'room'/'circ'/'exit' node (the real destinations
    // that must be reachable — a genuinely doorless room SHOULD show as a real isolated island)
    // UNION every guid that actually appears as an edge endpoint (covers bridging nodes that ARE
    // real graph vertices, e.g. spine/orphan-doorwp-via-E7, without also pulling in the untouched
    // majority of doorwp/stairwp entries that never appear in `graph.edges` at all).
    var adj = {};
    function ensure(g) { if (!adj[g]) adj[g] = []; }
    Object.keys(graph.nodesByGuid || {}).forEach(function (g) {
      var n = graph.nodesByGuid[g];
      if (n && (n.kind === 'room' || n.kind === 'circ' || n.kind === 'exit')) ensure(g);
    });
    (graph.edges || []).forEach(function (e) {
      ensure(e.a); ensure(e.b);
      adj[e.a].push(e.b); adj[e.b].push(e.a);
    });
    var comp = {}, cid = 0, sizes = [];
    Object.keys(adj).forEach(function (g) {
      if (comp[g] != null) return;
      var stack = [g], size = 0; comp[g] = cid;
      while (stack.length) {
        var u = stack.pop(); size++;
        adj[u].forEach(function (v) { if (comp[v] == null) { comp[v] = cid; stack.push(v); } });
      }
      sizes.push(size); cid++;
    });
    var totalNodes = Object.keys(adj).length;
    var largestComponent = sizes.length ? Math.max.apply(null, sizes) : 0;
    return { comp: comp, components: cid, sizes: sizes, totalNodes: totalNodes,
      largestComponent: largestComponent, fullyConnected: totalNodes > 0 && cid === 1 };
  }

  // §OCCUPANT-DIJKSTRA: walks the FULL graph — rooms + circ + exit nodes, E1-E4 edges — weighted by
  // real 3D distance (E1: room-center to room-center, unchanged formula so Duplex's existing
  // door-connected paths are byte-identical, see OCCUPANT_PATHFINDER.md W-PATH-DUPLEX-REGRESSION;
  // E2/E3/E4: the edge's own measured `w`, computed at buildGraph time from real door/flight/exit
  // positions). Internal only — shortestPath() below builds the adjacency and reconstructs the
  // EXPOSED path from this.
  function _buildAdjacency(graph) {
    var adj = {};
    graph.nodesByGuid && Object.keys(graph.nodesByGuid).forEach(function (g) { adj[g] = []; });
    graph.edges.forEach(function (e) {
      var a = e.a, b = e.b;
      if (!(a in adj) || !(b in adj)) return;
      var w;
      if (e.kind === 'E1' || e.kind == null) {
        var ga = graph.nodesByGuid[a], gb = graph.nodesByGuid[b];
        w = Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy);
      } else {
        w = (typeof e.w === 'number') ? e.w : Math.hypot(
          graph.nodesByGuid[a].cx - graph.nodesByGuid[b].cx, graph.nodesByGuid[a].cy - graph.nodesByGuid[b].cy);
      }
      // §UTILITY-ROUTING-PENALTY (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10): an edge with a utility-
      // classified room at EITHER end (tagged in buildGraph, see UTILITY_EDGE_PENALTY's comment)
      // costs UTILITY_EDGE_PENALTY× its real distance — so Dijkstra prefers a corridor route a few
      // hops longer over cutting through a cabling/service room, yet the room stays reachable (a
      // finite multiplier, never removed). Both shortestPath() and escapeRoute() consume this
      // adjacency, so both inherit the preference (an emergency exit route also shouldn't thread a
      // service room when a corridor exists). No-op on every graph with no utility-tagged node.
      var na = graph.nodesByGuid[a], nb = graph.nodesByGuid[b];
      if ((na && na.isUtility) || (nb && nb.isUtility)) w *= UTILITY_EDGE_PENALTY;
      adj[a].push({ to: b, w: w, e: e, arriveSide: 'b' });
      adj[b].push({ to: a, w: w, e: e, arriveSide: 'a' });
    });
    return adj;
  }

  function _dijkstraCore(graph, adj, fromGuid, toGuid) {
    if (!adj[fromGuid] || !adj[toGuid]) return null;
    var dist = {}, prev = {}, visited = {};
    Object.keys(adj).forEach(function (g) { dist[g] = Infinity; });
    dist[fromGuid] = 0;
    var pq = [fromGuid];
    while (pq.length) {
      pq.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = pq.shift();
      if (visited[u]) continue;
      visited[u] = true;
      if (u === toGuid) break;
      (adj[u] || []).forEach(function (edge) {
        var nd = dist[u] + edge.w;
        if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = { from: u, edge: edge.e, arriveSide: edge.arriveSide }; pq.push(edge.to); }
      });
    }
    if (dist[toGuid] === Infinity) return null;
    return { dist: dist, prev: prev };
  }

  // §PUBLIC-HOP: what guid to expose in the returned `path` for a node we just arrived at. Rooms
  // and exits already carry a REAL position (their own guid is fine, unchanged for rooms — exactly
  // today's behavior). A CIRC node is an internal bookkeeping node only (one per storey, no single
  // real-world point actually walked) — never exposed directly; substituted with the specific
  // door/stair waypoint the arriving EDGE carries, so the drawn line hugs the real walk instead of
  // bending toward an invented storey centroid (OCCUPANT_PATHFINDER.md SPEC).
  // §CIRC-DUAL-BRIDGE (2026-07-15, §18 item 5 — user-reported live: a rendered path visibly cuts
  // straight through open space on an L-shaped HHS floor instead of hugging the walkway).
  // `hasDeparture`: true when this CIRC node is a genuine MIDDLE hop — edges on BOTH sides (one
  // bridging IN via `edge`, one already-processed bridging further OUT toward toGuid). The old
  // unconditional substitution always used only the ARRIVAL edge's own wp (which, for a same-
  // storey chain-to-chain bridge, is just the arriving spine's OWN point — a redundant duplicate
  // of the node already adjacent to it) and silently discarded the departure edge's real distance
  // entirely — measured live on HHS: a `SPINE::Level 1|y|-4.65 -> SPINE::Level 1|y|10.56` chord
  // (18.3m, meant to be TWO real hops via the stair core, 3.8m + 15.5m) rendered as ONE straight
  // line, 58/75 sampled points illegal (`§PATH_LEGAL_DETOUR_FAIL`). Neither edge's wp field can
  // fix this — both sides only ever point back to "the far spine's own guid", there is no third
  // coordinate recorded anywhere for the bridge itself. CIRC's own (cx,cy) — real, measured
  // (stair-flight-derived), not invented — is the honest middle point in that case: keep it
  // un-substituted rather than collapse it away.
  // §SCOPE-GUARD (found via regression, not guessed): the suppression below is deliberately
  // narrowed to BOTH edges being 'E6' (the same-storey chain-to-chain bridge this bug is specific
  // to) — an EARLIER, broader "any departure edge" version silently broke the cross-floor stair
  // case too (`CIRC::First Floor <-> CIRC::Second Floor`, kind 'E3'), which genuinely NEEDS its
  // substitution (a real `stairwp` point) and was working correctly before — confirmed by
  // witness_backbone_routing.js's G0c / witness_corridor_room_backprop.js's B3 both regressing
  // when the guard was too broad, both green again once narrowed to E6-only. Every other
  // combination (E2/E3 involved on either side) keeps the ORIGINAL unconditional substitution
  // behavior, unchanged.
  function _publicHop(graph, arrivedGuid, edge, arriveSide, departEdge) {
    var n = graph.nodesByGuid[arrivedGuid];
    if (!n || n.kind === 'room' || n.kind === 'exit') return arrivedGuid;
    if (n.kind === 'circ' && edge) {
      if (departEdge && edge.kind === 'E6' && departEdge.kind === 'E6') return arrivedGuid;
      var wp = (arriveSide === 'a') ? edge.wpA : edge.wpB;
      if (wp && graph.nodesByGuid[wp]) return wp;
    }
    return arrivedGuid; // defensive fallback — should not happen with a well-formed edge
  }

  // shortestPath()'s signature is frozen (§API-COMPATIBLE, no opts/log param) — same direct-console
  // convention modeller/real_geometry.js's own `_log` already uses in this codebase, since there is
  // no caller-injected logger to route through here (unlike buildGraph's `opts.log`).
  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  // §PATH_LEGAL_SEGMENTS.md §G3-REVISED — is (px,py) on `storey` walkable? Raster first (real
  // mesh-derived, accurate on concave floors — the real slab physically continues under interior
  // walls, so two adjacent rooms' rects never leave a spurious gap there). Room-rects fallback when
  // this storey has no raster (older patch / building not yet mined — never a hard failure): each
  // rect is inflated by DOOR_BUFFER_SLACK (the SAME constant this file already uses for the real
  // gap between a door's own footprint and its neighbouring rooms, ported from compile_rooms.py —
  // see file header) so the real wall/doorway sliver between two adjacent rooms' own rects — e.g.
  // Duplex Level 2 A204/A205, measured ~0.12m gap — doesn't spuriously flag a genuinely-walked
  // doorway as illegal (a chord's OTHER end still has to reach an actual rect; a real multi-metre
  // void like the HHS courtyard is far too wide for this small a buffer to paper over). Returns
  // true/false/null (null = no data AT ALL for this storey — caller must not penalize a chord it
  // cannot judge).
  function _pointWalkable(graph, storey, px, py) {
    var raster = graph.rasters && graph.rasters[storey];
    if (raster) return raster.contains(px, py);
    var rects = graph.roomRectsByStorey && graph.roomRectsByStorey[storey];
    // §CORRIDOR-WIDTH: real, wall-measured corridor rects (hallway_backbone.js bucketRect) — see
    // that fix's comment above the caller for WHY this is a different, stronger-evidence case than
    // just widening DOOR_BUFFER_SLACK (a courtyard-sized void still correctly fails; a corridor
    // only gets a rect here when it's an ACTUAL wall-bounded run with >=3 real doors).
    var corridors = graph.corridorRectsByStorey && graph.corridorRectsByStorey[storey];
    if ((!rects || !rects.length) && (!corridors || !corridors.length)) return null;
    if (rects) {
      for (var i = 0; i < rects.length; i++) {
        var rc = rects[i];
        if (px >= rc.x0 - DOOR_BUFFER_SLACK && px <= rc.x1 + DOOR_BUFFER_SLACK &&
          py >= rc.y0 - DOOR_BUFFER_SLACK && py <= rc.y1 + DOOR_BUFFER_SLACK) return true;
      }
    }
    // §CORRIDOR-RECT-SLACK (2026-07-15, §18 item 5 — user-reported live: a rendered path visibly
    // cuts straight through open space on an L-shaped HHS floor instead of hugging the walkway).
    // This branch had NO tolerance at all, unlike the room-rects branch just above (which forgives
    // DOOR_BUFFER_SLACK on every edge) — a sampled point sitting a few cm outside a corridor
    // bucket's rect (real wall thickness / measurement rounding, or the small gap where two
    // adjacent corridor buckets meet at a T-junction/corner) registered as illegal with zero
    // margin. Measured live on HHS (14 rooms, 91 real pairs): 173/253=68% of directed room pairs
    // hit >=1 `§PATH_LEGAL_DETOUR_FAIL` chord before this fix — the detour visibility graph's own
    // candidate-to-candidate edges suffer the identical zero-margin test, so a sparse-coverage
    // building can end up with NO legal detour at all, and `_legalizePath`'s honest-degrade leaves
    // the original illegal straight chord in the rendered path. Fixed with the SAME wall-thickness
    // slack `hallway_backbone.js`'s own `wallCrossSlack` already uses for this exact class of
    // problem ("real walls are rasterized transforms, not infinitely thin planes") — not a new
    // magic number.
    var CORRIDOR_RECT_SLACK = 0.3;
    if (corridors) {
      for (var j = 0; j < corridors.length; j++) {
        var cc = corridors[j];
        if (px >= cc.x0 - CORRIDOR_RECT_SLACK && px <= cc.x1 + CORRIDOR_RECT_SLACK &&
          py >= cc.y0 - CORRIDOR_RECT_SLACK && py <= cc.y1 + CORRIDOR_RECT_SLACK) return true;
      }
    }
    return false;
  }

  var PATH_LEGAL_SAMPLE_RES = 0.25; // matches PATH_LEGAL_SEGMENTS.md's own sampling step

  // Sample a->b @0.25m, count illegal points. A storey with NO walkable data at all (raster absent
  // AND zero rooms — should not happen for a real storey, defensive only) never flags illegal, so
  // pre-this-feature behavior is preserved byte-for-byte when there is nothing to judge against.
  function _chordIllegalCount(graph, storey, ax, ay, bx, by) {
    var len = Math.hypot(bx - ax, by - ay);
    var n = Math.max(1, Math.ceil(len / PATH_LEGAL_SAMPLE_RES));
    var illegal = 0, anyData = false;
    for (var i = 0; i <= n; i++) {
      var t = i / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      var w = _pointWalkable(graph, storey, px, py);
      if (w === null) continue;
      anyData = true;
      if (!w) illegal++;
    }
    return anyData ? illegal : 0;
  }

  // §G4 visibility-graph detour: nodes = this storey's real door-waypoint centers (doorwp entries,
  // registered for EVERY room-facing door — see buildGraph's E1/E2 branches) + the chord's own two
  // endpoints. Edge iff the straight segment between two points is legal (0 illegal @0.25m).
  // Dijkstra over that small graph. Returns the INTERIOR doorwp guids only (endpoints excluded —
  // caller already has them in `path`), or null if no legal detour exists (chord left as-is,
  // honest degrade — never invents a waypoint that isn't a real door).
  // §DETOUR-LOCALITY (2026-07-14, real user report — a room-to-room path visibly walked to the
  // FAR end of a 13m-long room, away from the target, before doubling back): the visibility-graph
  // candidate set below was scoped to the WHOLE STOREY, with no preference for waypoints actually
  // BETWEEN the chord's two endpoints. Dijkstra over that graph finds the cheapest LEGAL chain —
  // if the direct/nearby route is illegal, it will happily route via a real door at the opposite
  // end of the building, because that's still "legal" and the small graph has no sense of overall
  // direction. Root-caused with real data (Clinic, live-matching 205-room compile): chord R96->
  // R106 illegal, detour picked R96's own door at y=27.6 (its far end) then a second waypoint at
  // y=14.7, even though the target sits at y~12 — a real ~15m detour in the wrong direction first.
  // Fix: try LOCAL candidates first (within the chord's own bounding box + a margin — generous
  // enough for a genuine corridor jog, not enough to reach across an unrelated room). Only fall
  // back to the full unrestricted storey-wide search if no local detour exists — never REMOVES a
  // detour that used to work, only prefers a nearby one when one exists.
  var DETOUR_LOCALITY_MARGIN = 6.0; // m — padding around the chord's own bbox for the local pass
  function _detourCandidates(graph, storey, ax, ay, bx, by, localOnly) {
    var pts = [{ id: null, x: ax, y: ay }, { id: null, x: bx, y: by }];
    var x0 = Math.min(ax, bx) - DETOUR_LOCALITY_MARGIN, x1 = Math.max(ax, bx) + DETOUR_LOCALITY_MARGIN;
    var y0 = Math.min(ay, by) - DETOUR_LOCALITY_MARGIN, y1 = Math.max(ay, by) + DETOUR_LOCALITY_MARGIN;
    Object.keys(graph.nodesByGuid).forEach(function (g) {
      var n = graph.nodesByGuid[g];
      // §HALLWAY-BACKBONE: real corridor spine points are ALSO valid detour candidates, not just
      // doorwp — a door-only visibility graph can genuinely have no legal edge between two doors
      // that face each other across an open corridor (every straight door-to-door chord crosses
      // the gap the raster marks non-walkable near a jutting wall corner), even though a real
      // route along the corridor's own centerline exists. Adding spine/circ nodes only ADDS
      // candidate points/edges to this visibility graph — it can only turn a FAIL into a real
      // route, never remove an already-legal one.
      if (!((n.kind === 'doorwp' || n.kind === 'spine' || n.kind === 'circ') && n.storey === storey)) return;
      if (localOnly && (n.cx < x0 || n.cx > x1 || n.cy < y0 || n.cy > y1)) return;
      pts.push({ id: g, x: n.cx, y: n.cy });
    });
    return pts;
  }
  function _detourDijkstra(graph, storey, pts) {
    var n = pts.length, adj = [];
    for (var i = 0; i < n; i++) adj.push([]);
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (_chordIllegalCount(graph, storey, pts[i].x, pts[i].y, pts[j].x, pts[j].y) === 0) {
          var w = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
          adj[i].push({ to: j, w: w }); adj[j].push({ to: i, w: w });
        }
      }
    }
    var dist = pts.map(function () { return Infinity; });
    var prev = pts.map(function () { return -1; });
    var visited = pts.map(function () { return false; });
    dist[0] = 0;
    var pq = [0];
    while (pq.length) {
      pq.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = pq.shift();
      if (visited[u]) continue;
      visited[u] = true;
      if (u === 1) break;
      adj[u].forEach(function (e) {
        var nd = dist[u] + e.w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; pq.push(e.to); }
      });
    }
    if (dist[1] === Infinity) return null;
    var hopIdx = [], cur = 1;
    while (cur !== -1) { hopIdx.unshift(cur); cur = prev[cur]; }
    var mid = [];
    for (var k = 1; k < hopIdx.length - 1; k++) mid.push(pts[hopIdx[k]].id);
    return mid;
  }
  function _detourForChord(graph, storey, ax, ay, bx, by) {
    var localPts = _detourCandidates(graph, storey, ax, ay, bx, by, true);
    var localResult = _detourDijkstra(graph, storey, localPts);
    if (localResult) return localResult;
    var globalPts = _detourCandidates(graph, storey, ax, ay, bx, by, false);
    var globalResult = _detourDijkstra(graph, storey, globalPts);
    if (!globalResult) { _log('§PATH_LEGAL_DETOUR_FAIL storey=' + storey + ' no legal detour among ' + (globalPts.length - 2) + ' doors'); return null; }
    _log('§PATH_LEGAL_DETOUR_NONLOCAL storey=' + storey + ' no local detour within ' + DETOUR_LOCALITY_MARGIN + 'm margin, used a wider one');
    return globalResult;
  }

  // §PATH_LEGAL_SEGMENTS.md — walk the just-built `path`, testing every consecutive same-storey
  // chord (both endpoints resolve to the SAME storey — a stairwp<->stairwp vertical hop never
  // matches, left untouched per this spec's own fence) and splicing in a visibility-graph detour
  // wherever a chord fails. Never touches WHICH rooms/doors the route uses (`doors` list
  // untouched) — only the polyline's intermediate points, exactly per the spec's scope fence.
  function _legalizePath(graph, path) {
    var legalized = 0, detoured = 0;
    var out = [path[0]];
    for (var i = 0; i + 1 < path.length; i++) {
      var a = graph.nodesByGuid[path[i]], b = graph.nodesByGuid[path[i + 1]];
      if (!a || !b || a.storey == null || a.storey !== b.storey) { out.push(path[i + 1]); continue; }
      legalized++;
      var illegal = _chordIllegalCount(graph, a.storey, a.cx, a.cy, b.cx, b.cy);
      if (illegal > 0) {
        var mid = _detourForChord(graph, a.storey, a.cx, a.cy, b.cx, b.cy);
        if (mid && mid.length) { detoured++; mid.forEach(function (g) { out.push(g); }); }
      }
      out.push(path[i + 1]);
    }
    if (legalized) _log('§PATH_LEGAL legalized=' + legalized + ' detoured=' + detoured);
    return out;
  }

  // Dijkstra shortest path over the FULL occupant graph. SAME SIGNATURE / SAME RESULT SHAPE as
  // before ({path, doors, distance}) — every existing consumer (viewer/navigate_find.js) needs
  // zero edits: `path` entries still resolve via `graph.nodesByGuid[g]` to a real {cx,cy,cz,name}
  // (rooms as before; circ hops now surface as a real door/stair waypoint instead, see _publicHop).
  function shortestPath(graph, fromGuid, toGuid) {
    if (fromGuid === toGuid) return { path: [fromGuid], doors: [], distance: 0 };
    var adj = _buildAdjacency(graph);
    var core = _dijkstraCore(graph, adj, fromGuid, toGuid);
    if (!core) return null;
    var path = [toGuid], doors = [], cur = toGuid;
    var departEdge = null; // §CIRC-DUAL-BRIDGE: the edge used to LEAVE `cur` toward toGuid, from the prior iteration
    while (cur !== fromGuid) {
      var p = core.prev[cur];
      if (!p) return null; // defensive — should not happen if dist[toGuid] finite
      // §HALLWAY-BACKBONE E5 (corridor-junction) hops carry no real elements_meta guid — this
      // file's own invariant is "doors[] = real doors only" (see G1 witness), so they contribute
      // to `path` (a real, wall-grounded position either way) but not to the exposed doors list.
      if (p.edge.doorGuid) doors.unshift({ guid: p.edge.doorGuid, name: p.edge.doorName });
      var publicCur = _publicHop(graph, cur, p.edge, p.arriveSide, departEdge);
      path[0] = publicCur; // replace the just-pushed guid with its public form
      path.unshift(p.from);
      departEdge = p.edge;
      cur = p.from;
    }
    path = _legalizePath(graph, path);
    return { path: path, doors: doors, distance: core.dist[toGuid] };
  }

  // §ESCAPE-ROUTE (OCCUPANT_PATHFINDER.md SPEC — "falls out" of shortestPath, not a separate
  // feature): nearest N-EXIT node from a room, by the same Dijkstra used for Room-Path.
  function escapeRoute(graph, fromGuid, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var adj = _buildAdjacency(graph);
    if (!adj[fromGuid]) { log('§ESCAPE_ROUTE from=' + fromGuid + ' NO_GRAPH_NODE'); return null; }
    // Dijkstra from fromGuid across the whole graph (no fixed target), then pick the closest EXIT.
    var dist = {}, prev = {}, visited = {};
    Object.keys(adj).forEach(function (g) { dist[g] = Infinity; });
    dist[fromGuid] = 0;
    var pq = [fromGuid];
    while (pq.length) {
      pq.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = pq.shift();
      if (visited[u]) continue;
      visited[u] = true;
      (adj[u] || []).forEach(function (edge) {
        var nd = dist[u] + edge.w;
        if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = { from: u, edge: edge.e, arriveSide: edge.arriveSide }; pq.push(edge.to); }
      });
    }
    var bestExit = null, bestD = Infinity;
    Object.keys(graph.nodesByGuid).forEach(function (g) {
      if (graph.nodesByGuid[g].kind === 'exit' && dist[g] < bestD) { bestD = dist[g]; bestExit = g; }
    });
    if (!bestExit) { log('§ESCAPE_ROUTE from=' + fromGuid + ' NO_EXIT_REACHABLE'); return null; }
    var path = [bestExit], doors = [], cur = bestExit;
    var departEdge = null; // §CIRC-DUAL-BRIDGE: same tracking as shortestPath() — see _publicHop's own comment
    while (cur !== fromGuid) {
      var p = prev[cur];
      if (!p) { log('§ESCAPE_ROUTE from=' + fromGuid + ' RECONSTRUCT_FAIL'); return null; }
      // §HALLWAY-BACKBONE E5 (corridor-junction) hops carry no real elements_meta guid — this
      // file's own invariant is "doors[] = real doors only" (see G1 witness), so they contribute
      // to `path` (a real, wall-grounded position either way) but not to the exposed doors list.
      if (p.edge.doorGuid) doors.unshift({ guid: p.edge.doorGuid, name: p.edge.doorName });
      path[0] = _publicHop(graph, cur, p.edge, p.arriveSide, departEdge);
      path.unshift(p.from);
      departEdge = p.edge;
      cur = p.from;
    }
    var result = { path: path, doors: doors, distance: dist[bestExit], exitGuid: bestExit };
    log('§ESCAPE_ROUTE from=' + fromGuid + ' exit=' + bestExit + ' hops=' + doors.length + ' distance=' + dist[bestExit].toFixed(1));
    return result;
  }

  var API = {
    buildGraph: buildGraph, degree: degree, components: components, fullConnectivity: fullConnectivity,
    shortestPath: shortestPath, escapeRoute: escapeRoute, isRoomDoor: isRoomDoor,
    stairBaseKey: stairBaseKey, DOOR_BUFFER_SLACK: DOOR_BUFFER_SLACK, getStairGroups: getStairGroups,
    // FLY_TOUR_CORRIDOR_GRAPH.md §S4 — read-only witness helper: count of walkability-illegal
    // sample points on a same-storey chord (the same test _legalizePath uses internally).
    chordIllegalCount: _chordIllegalCount
  };
  ROOT.RoomGraph = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
