// room_walker.js — JS port of scripts/compile_rooms.py (verbatim algorithm, ported not re-derived).
// COMPILE rooms from wall/door enclosure (deterministic, not invented). Per storey: rasterize
// wall + door footprints into a 2D plan grid, flood-fill the exterior from the border, and treat
// each connected pocket of free space the exterior cannot reach as a ROOM (enclosed by walls).
// Output = spatial_structure IfcSpace rows (guid/name/parent + center_x/y/z, size_x/y/z) +
// rel_contained_in_space (elements whose XY centre falls in a room).
//
// This is COMPILE, not invent: every room is a region enclosed by REAL wall geometry. guid/name
// are deterministic labels for the computed cell. Geometry tables are never touched.
//
// Dual-mode: same sql.js `db.exec()` interface works unmodified in Node (embed8_scripts/
// finalize_all_8.js's own pattern) and in-browser (the Modeller's existing WASM sql.js) — no
// separate DB-access implementation per mode, matching disc_walker.js's own convention.
//
// ROOM_INJECTION_HYBRID.md Task 2/§DOOR-RESCUE/§DOOR-PARTITION (the algorithm's derivation) ·
// ROOM_WALKER_JS_PORT.md Task 2 (this port) · scripts/compile_rooms.py (the Python source of truth).
(function () {
  'use strict';
  var TAG = '§ROOM-WALKER';
  var ROOT = (typeof window !== 'undefined') ? window : {};

  // §ROOM_WALKER_VERSION_STAMP (ROOM_INJECTOR_NEEDLE.md) — algorithm version, EFFECTS_V convention:
  // bump on every ALGORITHM change, never on cosmetic edits. Kept in LOCKSTEP with the same-named
  // constant in scripts/compile_rooms.py (py/js parity discipline). 'v2' continues the existing
  // lib/room_walker.js?v=2 loader lineage rather than restarting at an arbitrary v1.
  // Stage 2 writes it to rooms_meta after each compile; nothing reads it yet (stage 3).
  var ROOM_WALKER_V = 'v2 (§LOCAL-FRAME + §RASTER-EPS, post-§SUSPECT-LARGE)';

  var RES = 0.20;          // grid cell size (m)
  var MIN_AREA = 4.0;      // m^2 — drop slivers / wall cavities
  // §SUSPECT-LARGE (compile_rooms.py port, 2026-07-14): MAX_AREA_ABS used to be a hard drop
  // threshold, calibrated to residential room sizes. That predates §DOOR-PARTITION-EXT-EXCLUDE,
  // now the real leak detector — measured fleet-wide, real confirmed-interior pockets range
  // 38-1544 m^2, so a fixed drop threshold is wrong for some real building (incl. "residential"-
  // classed SampleCastle at 315 m^2). Repurposed: still compiles, flagged for review instead of
  // silently vanishing.
  var MAX_AREA_ABS = 150.0;  // m^2 — SUSPECT_LARGE flag threshold, no longer a drop threshold
  var MAX_AREA_FRAC = 0.92;  // still a hard drop — self-scaling (% of THIS building's own storey plan)
  var SEAL = 2;             // dilate walls this many cells (×RES) to close hairline corner/door gaps
  // §RASTER-EPS (compile_rooms.py port — ROOM_WALKER_PHASE_INVARIANCE.md S1/S2, 2026-07-17):
  // wall edges routinely sit EXACTLY on a RES cell boundary relative to the data-derived grid
  // origin, so Math.floor((x-xs0)/RES) is a knife edge — translating the SAME geometry by a
  // constant Δ perturbs (x-xs0) by ~1 ulp and flips those cells (measured: 8/14 translations
  // changed Terminal's compile, rooms 50-54 vs baseline 51). Fix: floor(t + RASTER_EPS) for cell
  // indices, ceil(t - RASTER_EPS) for grid extents. 1e-6 cell-fractions = 0.2 µm of geometry:
  // >100x the worst FP error (~5e-9 cells at |x|=1e5 m), 5 orders below real coordinates.
  var RASTER_EPS = 1e-6;    // cell fractions — boundary snap band for raster quantization
  var WALL_LIKE = ["IfcWall%", "IfcDoor%", "IfcCurtainWall%", "IfcColumn%", "IfcWindow%"];
  // §STAIR-EXCLUDE: a stairwell is a wall-enclosed pocket, so the flood-fill flags it as a "room".
  // It is circulation, NOT a room. Reject any compiled pocket that a stair footprint substantially
  // overlaps. IfcStair% LIKE also covers IfcStairFlight. (User: "staircase is also marked as room".)
  var STAIR_LIKE = ["IfcStair%", "IfcRamp%"];
  var STAIR_OVERLAP_REJECT = 0.35;   // drop a pocket if a stair footprint covers >=35% of its area
  // §DOOR-RESCUE (abstract rule, not a fitted band): the definition of "room" is architectural, not a
  // size threshold — an enclosed pocket is a room IFF it has a DOOR (how a person enters/exits it). A
  // wall cavity, duct or structural void never has one. MIN_AREA alone is a blunt proxy that wrongly
  // drops real small rooms (toilets, risers, store/utility closets). Below MIN_AREA, door presence is
  // the actual test. Two supporting checks are geometry-derived, not observed-data-fitted: the
  // adjacency buffer is each DOOR's OWN extracted footprint (half its real leaf/frame span) plus one
  // grid cell of rasterization slack; NOISE_FLOOR_DIM rejects a pocket narrower than a few grid cells
  // in EITHER axis — a property of the flood-fill's own resolution, not a threshold tuned to one building.
  var NOISE_FLOOR_DIM = 3 * RES;   // m — a pocket narrower than this in x OR y is a grid artefact
  var DOOR_BUFFER_SLACK = RES;     // m — rasterization slack added on top of each door's own real footprint
  // §DOOR-NOT-ROOM: a door that leads to a SHAFT, not a habitable room, must not be used as the
  // §DOOR-RESCUE "this pocket is a room" signal — same shape of problem as §STAIR-EXCLUDE. Found on
  // real data (SampleCastle): 28 IfcDoor rows named 'liftdeur' (Dutch: lift/elevator door), width
  // 0.5m — real doors, but 2 of them were rescuing actual elevator-shaft fragments as fake "rooms".
  var NON_ROOM_DOOR_NAMES = ["liftdeur", "lift", "elevator", "aufzug", "fahrstuhl", "hoist"];
  // §7 ROOM WELL-FORMEDNESS (ROOM_INJECTION_HYBRID.md §7, 2026-07-11 — user doctrine: "a room must
  // be well formed, fully enclosed, has door"; failures become SUSPECT_* rows for a later review
  // feature). Both factors are SELF-SCALING to the building's own extracted doors — no fixed metres:
  // §WALL-VERT: IfcCurtainWall parents carry NO transform (center_x NULL), so curtain walls
  //   rasterized as NOTHING; real geometry is in IfcMember (mullions) + IfcPlate (glazing) children.
  //   Include a member/plate iff VERTICAL: bbox_z >= VERT_FACTOR × median real door height (Terminal's
  //   33k flat "Metal Deck" plates and Clinic's stair-part members stay excluded). No doors → skip.
  var VERT_FACTOR = 0.5;
  var CW_CHILD_CLASSES = ["IfcMember", "IfcPlate"];
  // §ROOM-FORM: openM = unsealed perimeter metres; more than OPEN_PERIM_FACTOR × median door width
  //   of unsealed edge is not "fully enclosed" → SUSPECT_OPEN; no adjacent door → SUSPECT_NO_DOOR.
  var OPEN_PERIM_FACTOR = 2.0;
  // §MULTI-RECT (ROOM_INJECTION_HYBRID.md §8, 2026-07-11): ONE inscribed rectangle under-covers a
  // non-rectangular room (measured single-rect coverage down to 0.23 on real Hospital/Clinic/
  // Terminal rooms). A confirmed room is a SET of non-overlapping rectangles carved from its
  // (seal-band-recovered) region by a repeated constrained maximal-rectangle scan. Knobs are
  // grid-derived: RECT_COVER_TARGET (remainder past 0.95 is sub-noise-floor stair-step fringe),
  // sub-rect min dimension = NOISE_FLOOR_DIM, MAX_SUBRECTS = pure safety bound.
  // SUSPECT rooms stay single-rect (decomposition applies to confirmed rooms only).
  var RECT_COVER_TARGET = 0.95;
  var MAX_SUBRECTS = 8;
  // §DOOR-PARTITION: on some real buildings (HHS confirmed) wall-enclosure flood-fill structurally
  // can't find rooms — most of the floor floods as one exterior-reachable blob because the walls that
  // would divide individual rooms simply aren't in this extraction. Gate: compare what flood-fill
  // (with door-rescue applied) found against how many real doors this storey has — every door leads
  // to a room, so a storey whose flood-fill result is a small fraction of its door count has failed.
  // Measured before picking the ratio: HHS's floors find 0-11% of their door count via flood-fill;
  // every other building's working floors find 20-100%+ (Garage sparsest: 5/8=62%; Hospital
  // sparsest: 1/5=20%) — DOOR_SHORTFALL_RATIO=0.15 sits below every working floor's ratio and above
  // every HHS one, so it never overrides an already-functioning floor.
  var DOOR_SHORTFALL_RATIO = 0.15;

  function _isRoomDoor(name) {
    var n = (name || '').toLowerCase();
    return !NON_ROOM_DOOR_NAMES.some(function (k) { return n.indexOf(k) >= 0; });
  }

  // §APPROX: these rooms are COMPILED from wall enclosure (flood-fill), NOT extracted IfcSpace.
  // Validated ~5/21 recall on ground-truth Duplex -> treat as APPROXIMATE. Labelled '≈' + COMPILED.

  function _rows(db, sql) {
    var r = db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns, vals = r[0].values;
    return vals.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }

  function _median(vals) {
    var s = vals.slice().sort(function (a, b) { return a - b; });
    return s.length ? s[Math.floor(s.length / 2)] : 0.0;
  }

  // Building-level medians of real door width/height — the self-scaling anchors for
  // §WALL-VERT / §ROOM-FORM. Width = max(bbox_x, bbox_y) (leaf+frame plan span).
  function doorStats(db) {
    var rows = _rows(db, "SELECT COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by2, COALESCE(t.bbox_z,0) bz " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    var ws = [], hs = [];
    rows.forEach(function (r) {
      var w = Math.max(r.bx, r.by2);
      if (w > 0) ws.push(w);
      if (r.bz > 0) hs.push(r.bz);
    });
    return { w: _median(ws), h: _median(hs) };
  }

  // §STOREY-Z: per-storey mean center_z of EXPLICITLY-assigned real walls — the anchor used to
  // reassign 'Unknown'-storey wall-like elements + doors to their actual floor (HHS: all 716
  // vertical curtain children carry storey 'Unknown'; their z clusters match Level 1/2/3 exactly).
  function storeyZAnchors(db) {
    var rows = _rows(db, "SELECT m.storey st, t.center_z cz FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcWall%' AND m.discipline='ARC' AND t.center_x IS NOT NULL " +
      "AND m.storey IS NOT NULL AND m.storey <> 'Unknown'");
    var acc = {};
    rows.forEach(function (r) { (acc[r.st] = acc[r.st] || []).push(r.cz); });
    var anchors = {};
    Object.keys(acc).forEach(function (st) {
      anchors[st] = acc[st].reduce(function (s, v) { return s + v; }, 0) / acc[st].length;
    });
    return anchors;
  }

  function _assignByZ(st, cz, anchors, anchorNames) {
    if (st && st !== 'Unknown') return st;
    if (!anchorNames.length) return 'Unknown';
    var best = null, bd = Infinity;
    for (var i = 0; i < anchorNames.length; i++) { // sorted order = deterministic tie-break
      var d = Math.abs(cz - anchors[anchorNames[i]]);
      if (d < bd) { bd = d; best = anchorNames[i]; }
    }
    return best;
  }

  function storeyWalls(db, vertMin, anchors) {
    vertMin = vertMin || 0.0;
    // §DISC-ARC: room enclosure is an ARCHITECTURAL concept — discipline='ARC' on every element
    // query here, not just ifc_class LIKE. WalkerDoctrine.md: "discipline is a WHERE column."
    // Real gap found (2026-07-11): a raw multi-discipline extract (deploy/buildings/*_extracted.db,
    // not ARC-only stripped) carries STR-discipline IfcColumn/IfcWallStandardCase/IfcMember/IfcPlate
    // rows that also match WALL_LIKE/CW_CHILD_CLASSES ifc_class patterns — structural framing, not
    // room-enclosing walls — and without this filter they silently pollute the raster.
    var cond = WALL_LIKE.map(function (p) { return "m.ifc_class LIKE '" + p + "'"; }).join(' OR ');
    var rows = _rows(db, "SELECT m.storey, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE (" + cond + ") AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    // §WALL-VERT: curtain-wall children (IfcMember/IfcPlate) that stand wall-height — the enclosure
    // the bare WALL_LIKE query misses because IfcCurtainWall parents have no transform of their own.
    if (vertMin > 0) {
      var inList = CW_CHILD_CLASSES.map(function (c) { return "'" + c + "'"; }).join(',');
      rows = rows.concat(_rows(db, "SELECT m.storey, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.ifc_class IN (" + inList + ") AND m.discipline='ARC' AND t.center_x IS NOT NULL AND t.bbox_z >= " + vertMin));
    }
    anchors = anchors || {};
    var anchorNames = Object.keys(anchors).sort();
    var by = {};
    rows.forEach(function (r) {
      var st = _assignByZ(r.storey || 'Unknown', r.center_z, anchors, anchorNames); // §STOREY-Z
      (by[st] = by[st] || []).push([r.center_x, r.center_y, r.center_z, r.bbox_x, r.bbox_y, r.bbox_z]);
    });
    return by;
  }

  // Per-storey stair/ramp footprints (cx,cy,bx,by) — circulation cores to exclude from rooms.
  function storeyStairs(db) {
    var cond = STAIR_LIKE.map(function (p) { return "m.ifc_class LIKE '" + p + "'"; }).join(' OR ');
    var rows = _rows(db, "SELECT m.storey, t.center_x,t.center_y, t.bbox_x,t.bbox_y " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE (" + cond + ") AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    var by = {};
    rows.forEach(function (r) {
      var st = r.storey || 'Unknown';
      (by[st] = by[st] || []).push([r.center_x, r.center_y, r.bbox_x, r.bbox_y]);
    });
    return by;
  }

  // Per-storey door (cx,cy,bx,by) — the §DOOR-RESCUE clue for genuine small rooms. Each door's OWN
  // real footprint is carried through so adjacency self-scales to that door, not a guessed metre.
  // §STOREY-Z applies here too: an 'Unknown'-storey door is reassigned to its z-nearest real floor.
  function storeyDoors(db, anchors) {
    var rows = _rows(db, "SELECT m.storey, m.element_name en, t.center_x,t.center_y, t.center_z, " +
      "COALESCE(t.bbox_x,0) bbox_x, COALESCE(t.bbox_y,0) bbox_y " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    anchors = anchors || {};
    var anchorNames = Object.keys(anchors).sort();
    var by = {};
    rows.forEach(function (r) {
      if (!_isRoomDoor(r.en)) return; // §DOOR-NOT-ROOM: lift/elevator doors aren't room evidence
      var st = _assignByZ(r.storey || 'Unknown', r.center_z !== null && r.center_z !== undefined ? r.center_z : 0.0, anchors, anchorNames);
      (by[st] = by[st] || []).push([r.center_x, r.center_y, r.bbox_x, r.bbox_y]);
    });
    return by;
  }

  function doorAdjacent(rx0, ry0, rx1, ry1, doors) {
    for (var k = 0; k < doors.length; k++) {
      var dx = doors[k][0], dy = doors[k][1], dbx = doors[k][2], dby = doors[k][3];
      var buf = Math.max(dbx, dby) / 2 + DOOR_BUFFER_SLACK; // this door's own span, not a fixed guess
      if (rx0 - buf <= dx && dx <= rx1 + buf && ry0 - buf <= dy && dy <= ry1 + buf) return true;
    }
    return false;
  }

  // Largest fraction of room rect [rx0,ry0,rx1,ry1] covered by any single stair footprint.
  function stairOverlapFrac(rx0, ry0, rx1, ry1, stairs) {
    var roomArea = Math.max(1e-6, (rx1 - rx0) * (ry1 - ry0));
    var best = 0.0;
    for (var k = 0; k < stairs.length; k++) {
      var scx = stairs[k][0], scy = stairs[k][1], sbx = stairs[k][2], sby = stairs[k][3];
      var sx0 = scx - sbx / 2, sx1 = scx + sbx / 2, sy0 = scy - sby / 2, sy1 = scy + sby / 2;
      var ox = Math.max(0.0, Math.min(rx1, sx1) - Math.max(rx0, sx0));
      var oy = Math.max(0.0, Math.min(ry1, sy1) - Math.max(ry0, sy0));
      best = Math.max(best, (ox * oy) / roomArea);
    }
    return best;
  }

  function _gridExtent(walls) {
    var xs0 = Infinity, xs1 = -Infinity, ys0 = Infinity, ys1 = -Infinity;
    walls.forEach(function (w) {
      xs0 = Math.min(xs0, w[0] - w[3] / 2); xs1 = Math.max(xs1, w[0] + w[3] / 2);
      ys0 = Math.min(ys0, w[1] - w[4] / 2); ys1 = Math.max(ys1, w[1] + w[4] / 2);
    });
    var pad = RES * 2;
    xs0 -= pad; ys0 -= pad; xs1 += pad; ys1 += pad;
    // §RASTER-EPS: ceil(t - eps) — an exact-multiple span gets the same cell count in any frame
    var nx = Math.max(4, Math.ceil((xs1 - xs0) / RES - RASTER_EPS));
    var ny = Math.max(4, Math.ceil((ys1 - ys0) / RES - RASTER_EPS));
    return { xs0: xs0, ys0: ys0, xs1: xs1, ys1: ys1, nx: nx, ny: ny };
  }

  function _rasterizeWalls(walls, ext) {
    var nx = ext.nx, ny = ext.ny, xs0 = ext.xs0, ys0 = ext.ys0;
    // §RASTER-EPS: floor(t + eps) — boundary-exact edges quantize identically in any frame
    var ix = function (x) { return Math.min(nx - 1, Math.max(0, Math.floor((x - xs0) / RES + RASTER_EPS))); };
    var iy = function (y) { return Math.min(ny - 1, Math.max(0, Math.floor((y - ys0) / RES + RASTER_EPS))); };
    var blocked = new Uint8Array(nx * ny);
    walls.forEach(function (w) {
      var cx = w[0], cy = w[1], bx = w[3], byv = w[4];
      var i0 = ix(cx - bx / 2), i1 = ix(cx + bx / 2);
      var j0 = iy(cy - byv / 2), j1 = iy(cy + byv / 2);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) blocked[i * ny + j] = 1;
    });
    return blocked;
  }

  // Morphological close: dilate walls SEAL cells to seal hairline corner/door-jamb gaps so the
  // exterior flood can't leak into a room through a 1-2 cell crack (it still leaves real ~1m
  // doorways open — by design those connect rooms, handled by the area filter / per-room split).
  function _dilate(blocked, nx, ny, seal) {
    var b = blocked;
    for (var s = 0; s < seal; s++) {
      var d = new Uint8Array(nx * ny);
      for (var i = 0; i < nx; i++) {
        for (var j = 0; j < ny; j++) {
          var k = i * ny + j, v = b[k];
          if (!v && i > 0 && b[k - ny]) v = 1;
          if (!v && i < nx - 1 && b[k + ny]) v = 1;
          if (!v && j > 0 && b[k - 1]) v = 1;
          if (!v && j < ny - 1 && b[k + 1]) v = 1;
          d[k] = v;
        }
      }
      b = d;
    }
    return b;
  }

  // exterior flood from border free cells (4-connectivity, iterative stack) -> returns `enclosed`
  function _floodExterior(free, nx, ny) {
    var ext = new Uint8Array(nx * ny);
    var stack = [];
    for (var i = 0; i < nx; i++) {
      [0, ny - 1].forEach(function (j) {
        var k = i * ny + j;
        if (free[k] && !ext[k]) { ext[k] = 1; stack.push(k); }
      });
    }
    for (var j = 0; j < ny; j++) {
      [0, nx - 1].forEach(function (i) {
        var k = i * ny + j;
        if (free[k] && !ext[k]) { ext[k] = 1; stack.push(k); }
      });
    }
    while (stack.length) {
      var k0 = stack.pop();
      var i0 = Math.floor(k0 / ny), j0 = k0 % ny;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var a = i0 + d[0], b = j0 + d[1];
        if (a >= 0 && a < nx && b >= 0 && b < ny) {
          var k = a * ny + b;
          if (free[k] && !ext[k]) { ext[k] = 1; stack.push(k); }
        }
      });
    }
    var enclosed = new Uint8Array(nx * ny);
    for (var m = 0; m < nx * ny; m++) enclosed[m] = free[m] && !ext[m] ? 1 : 0;
    return enclosed;
  }

  // §ROOM-FORM: metres of the region's boundary NOT backed by a raw wall. Each boundary contact
  // (cell face, RES metres each) marches outward through the dilation band (<= sealSteps+1 cells);
  // 3-wide probe (straight + both perpendicular neighbors) so stair-stepped curved/diagonal walls
  // read as wall, not open. A contact that exits to free space without meeting raw wall is open.
  function _openPerimeterM(cells, inSet, raw, dil, nx, ny, sealSteps) {
    var openC = 0;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var ci = 0; ci < cells.length; ci++) {
      var k = cells[ci];
      var i = Math.floor(k / ny), j = k % ny;
      for (var d = 0; d < 4; d++) {
        var di = dirs[d][0], dj = dirs[d][1];
        var a = i + di, b = j + dj;
        if (a < 0 || a >= nx || b < 0 || b >= ny) { openC++; continue; }
        if (inSet[a * ny + b]) continue;
        var pi = dj, pj = di;
        var hitWall = false;
        for (var s = 0; s <= sealSteps; s++) {
          var aa = i + di * (1 + s), bb = j + dj * (1 + s);
          if (aa < 0 || aa >= nx || bb < 0 || bb >= ny) break;
          var kk = aa * ny + bb;
          var hit = raw[kk];
          if (!hit) {
            var la = aa + pi, lb = bb + pj;
            if (la >= 0 && la < nx && lb >= 0 && lb < ny && raw[la * ny + lb]) hit = 1;
          }
          if (!hit) {
            var ra = aa - pi, rb = bb - pj;
            if (ra >= 0 && ra < nx && rb >= 0 && rb < ny && raw[ra * ny + rb]) hit = 1;
          }
          if (hit) { hitWall = true; break; }
          if (!dil[kk]) break; // re-entered free space without meeting raw wall
        }
        if (!hitWall) openC++;
      }
    }
    return openC * RES;
  }

  // §RECT-HONESTY: largest axis-aligned rectangle fully inside the claimed cells (maximal-rectangle
  // histogram scan; deterministic scan order + strict '>' so ties resolve identically in both ports).
  function _inscribedRect(inSet, ny, mni, mxi, mnj, mxj) {
    var w = mxi - mni + 1, h = mxj - mnj + 1;
    var hist = new Array(h);
    for (var z = 0; z < h; z++) hist[z] = 0;
    var bestArea = 0, bi0 = mni, bi1 = mni, bj0 = mnj, bj1 = mnj;
    for (var i = 0; i < w; i++) {
      for (var j = 0; j < h; j++) {
        hist[j] = inSet[(mni + i) * ny + (mnj + j)] ? hist[j] + 1 : 0;
      }
      var stk = [];
      for (var j2 = 0; j2 <= h; j2++) {
        var cur = j2 < h ? hist[j2] : 0;
        while (stk.length && hist[stk[stk.length - 1]] >= cur) {
          var top = stk.pop();
          var height = hist[top];
          var left = stk.length ? stk[stk.length - 1] + 1 : 0;
          var area = height * (j2 - left);
          if (area > bestArea) {
            bestArea = area;
            bi0 = mni + i - height + 1; bi1 = mni + i;
            bj0 = mnj + left; bj1 = mnj + j2 - 1;
          }
        }
        stk.push(j2);
      }
    }
    return [bi0, bi1, bj0, bj1];
  }

  // §MULTI-RECT: recover the SEAL erosion — grow the region up to `steps` layers into cells that
  // are raw-free but dilation-blocked (the band between the region and its real walls). Never grows
  // into other free space (exterior / another pocket), so every grown cell is this room's own floor.
  // Mutates inSet; returns { added, mni, mxi, mnj, mxj } with bounds covering the growth.
  function _growRegion(cells, inSet, raw, dil, nx, ny, steps) {
    var frontier = cells;
    var added = [];
    var mni = Math.floor(cells[0] / ny), mxi = mni, mnj = cells[0] % ny, mxj = mnj;
    for (var c = 0; c < cells.length; c++) {
      var i0 = Math.floor(cells[c] / ny), j0 = cells[c] % ny;
      if (i0 < mni) mni = i0; if (i0 > mxi) mxi = i0;
      if (j0 < mnj) mnj = j0; if (j0 > mxj) mxj = j0;
    }
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var s = 0; s < steps; s++) {
      var nxt = [];
      for (var f = 0; f < frontier.length; f++) {
        var k = frontier[f];
        var i = Math.floor(k / ny), j = k % ny;
        for (var d = 0; d < 4; d++) {
          var a = i + dirs[d][0], b = j + dirs[d][1];
          if (a >= 0 && a < nx && b >= 0 && b < ny) {
            var kk = a * ny + b;
            if (!inSet[kk] && !raw[kk] && dil[kk]) {
              inSet[kk] = 1; nxt.push(kk); added.push(kk);
              if (a < mni) mni = a; if (a > mxi) mxi = a;
              if (b < mnj) mnj = b; if (b > mxj) mxj = b;
            }
          }
        }
      }
      frontier = nxt;
    }
    return { added: added, mni: mni, mxi: mxi, mnj: mnj, mxj: mxj };
  }

  // §WALL-SNAP (compile_rooms.py port, 2026-07-13): raster quantization (RES=0.20m) plus
  // _growRegion's seal-band recovery cap (SEAL=2 cells=0.4m) leave a compiled room's rect short of
  // its TRUE (continuous-coordinate) wall face. Measured across 208 real non-suspect room-sides
  // fleet-wide (HHS): 0/208 ever overshoot a wall — every side is short by 0.003-0.599m. SNAP_MAX_GAP
  // is the measured worst case (0.599m) plus one RES step of headroom, not an arbitrary number. Move
  // each side OUT (never in) to the nearest real wall's own measured near face — each side only ever
  // reads the wall's NEAR face, so two rooms sharing one real wall each stop at their own side of it
  // and can never be made to overlap by this function (same non-invent discipline as R-MERGE/R-REJECT).
  var SNAP_MAX_GAP = 0.8; // m
  function _snapRectToWalls(x0, y0, x1, y1, walls) {
    var best = {};
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i], wcx = w[0], wcy = w[1], wbx = w[3], wby = w[4];
      var wx0 = wcx - wbx / 2, wx1 = wcx + wbx / 2;
      var wy0 = wcy - wby / 2, wy1 = wcy + wby / 2;
      var ovY = Math.min(y1, wy1) - Math.max(y0, wy0);
      if (ovY > 0) {
        var gXmin = x0 - wx1;
        if (gXmin >= 0 && gXmin <= SNAP_MAX_GAP && (best.xmin === undefined || gXmin < best.xmin)) best.xmin = gXmin;
        var gXmax = wx0 - x1;
        if (gXmax >= 0 && gXmax <= SNAP_MAX_GAP && (best.xmax === undefined || gXmax < best.xmax)) best.xmax = gXmax;
      }
      var ovX = Math.min(x1, wx1) - Math.max(x0, wx0);
      if (ovX > 0) {
        var gYmin = y0 - wy1;
        if (gYmin >= 0 && gYmin <= SNAP_MAX_GAP && (best.ymin === undefined || gYmin < best.ymin)) best.ymin = gYmin;
        var gYmax = wy0 - y1;
        if (gYmax >= 0 && gYmax <= SNAP_MAX_GAP && (best.ymax === undefined || gYmax < best.ymax)) best.ymax = gYmax;
      }
    }
    if (best.xmin !== undefined) x0 -= best.xmin;
    if (best.xmax !== undefined) x1 += best.xmax;
    if (best.ymin !== undefined) y0 -= best.ymin;
    if (best.ymax !== undefined) y1 += best.ymax;
    return [x0, y0, x1, y1];
  }

  // §MULTI-RECT: constrained maximal rectangle — both dims >= minCells (the NOISE_FLOOR in cells;
  // a thinner rect is rasterization fringe, not room space). Null if no such rect exists.
  // Same deterministic scan order / strict '>' tie-break as _inscribedRect.
  function _inscribedRectMin(inSet, ny, mni, mxi, mnj, mxj, minCells) {
    var w = mxi - mni + 1, h = mxj - mnj + 1;
    var hist = new Array(h);
    for (var z = 0; z < h; z++) hist[z] = 0;
    var bestArea = 0, best = null;
    for (var i = 0; i < w; i++) {
      for (var j = 0; j < h; j++) {
        hist[j] = inSet[(mni + i) * ny + (mnj + j)] ? hist[j] + 1 : 0;
      }
      var stk = [];
      for (var j2 = 0; j2 <= h; j2++) {
        var cur = j2 < h ? hist[j2] : 0;
        while (stk.length && hist[stk[stk.length - 1]] >= cur) {
          var top = stk.pop();
          var height = hist[top];
          var left = stk.length ? stk[stk.length - 1] + 1 : 0;
          var width = j2 - left;
          if (height >= minCells && width >= minCells) {
            var area = height * width;
            if (area > bestArea) {
              bestArea = area;
              best = [mni + i - height + 1, mni + i, mnj + left, mnj + j2 - 1];
            }
          }
        }
        stk.push(j2);
      }
    }
    return best;
  }

  // §MULTI-RECT: carve the region into non-overlapping rectangles — repeated constrained
  // maximal-rectangle scan, stopping at RECT_COVER_TARGET coverage / MAX_SUBRECTS / no rect left
  // above the noise floor. `single` (SUSPECT rooms) emits the first rect only. Clears carved cells
  // from inSet (caller resets the full region afterwards). Falls back to the unconstrained single
  // rect when the region is too small/thin for a 3x3 (door-rescued slivers).
  // Returns { rects, covered }.
  function _decomposeRegion(inSet, ny, mni, mxi, mnj, mxj, totalCells, single) {
    var minCells = Math.round(NOISE_FLOOR_DIM / RES);
    var rects = [];
    var covered = 0;
    for (var t = 0; t < MAX_SUBRECTS; t++) {
      var r = _inscribedRectMin(inSet, ny, mni, mxi, mnj, mxj, minCells);
      if (r === null) break;
      rects.push(r);
      for (var i = r[0]; i <= r[1]; i++) {
        var base = i * ny;
        for (var j = r[2]; j <= r[3]; j++) inSet[base + j] = 0;
      }
      covered += (r[1] - r[0] + 1) * (r[3] - r[2] + 1);
      if (single) break;
      if (covered >= RECT_COVER_TARGET * totalCells) break;
    }
    if (!rects.length) {
      var fb = _inscribedRect(inSet, ny, mni, mxi, mnj, mxj);
      rects.push(fb);
      covered = (fb[1] - fb[0] + 1) * (fb[3] - fb[2] + 1);
    }
    return { rects: rects, covered: covered };
  }

  // §ROOM-FORM: user doctrine 'a room must be well formed, fully enclosed, has door'.
  // Returns null (well-formed) / 'NO_DOOR' / 'OPEN'. doorWMed <= 0 (no real doors in the building)
  // → openM test is skipped (nothing to derive the limit from; such pockets are SUSPECT_NO_DOOR).
  function _classify(hasDoor, openM, doorWMed) {
    if (!hasDoor) return 'NO_DOOR';
    if (doorWMed > 0 && openM > OPEN_PERIM_FACTOR * doorWMed) return 'OPEN';
    return null;
  }

  // §SUSPECT-ELONGATED (compile_rooms.py port, 2026-07-13): a wall-bounded or door-partitioned
  // pocket can still be an absurdly long undivided span (real walls/doors on the enclosing sides,
  // nothing dividing the middle). Threshold measured, not eyeballed: HHS's own 105 door-partitioned
  // rooms had a clean bimodal aspect spread — 98 climb smoothly 1.00->7.50, then a hard gap to 7
  // outliers at 13.64->37.25 (R9 = 13.64, the smallest of the 7). SUSPECT_ELONGATED_ASPECT_MIN =
  // midpoint of that gap: (7.50 + 13.64) / 2 = 10.57. Runs against BOTH floodRooms and
  // partitionByDoors (a real HHS flood-fill room also came out 24.2m x 2.0m, aspect 12.1, proving
  // wall-bounded rooms aren't immune either). A flagged room still compiles (never invented away) —
  // same §ROOM-FORM treatment as SUSPECT_OPEN/SUSPECT_NO_DOOR.
  var SUSPECT_ELONGATED_ASPECT_MIN = 10.57;
  function _isElongated(wx0, wy0, wx1, wy1) {
    var spanX = wx1 - wx0, spanY = wy1 - wy0;
    var aspect = Math.max(spanX, spanY) / Math.max(Math.min(spanX, spanY), 0.01);
    return aspect > SUSPECT_ELONGATED_ASPECT_MIN;
  }

  function floodRooms(walls, stairs, doors, doorWMed) {
    stairs = stairs || []; doors = doors || []; doorWMed = doorWMed || 0.0;
    var ext = _gridExtent(walls);
    var nx = ext.nx, ny = ext.ny, xs0 = ext.xs0, ys0 = ext.ys0;
    var raw = _rasterizeWalls(walls, ext);
    var dil = SEAL > 0 ? _dilate(raw, nx, ny, SEAL) : raw;
    var free = new Uint8Array(nx * ny);
    for (var m = 0; m < nx * ny; m++) free[m] = dil[m] ? 0 : 1;
    var enclosed = _floodExterior(free, nx, ny);

    var rooms = [];
    var seen = new Uint8Array(nx * ny);
    var inSet = new Uint8Array(nx * ny);
    var cellArea = RES * RES;
    var planArea = nx * ny * cellArea;
    var cz = walls.reduce(function (s, w) { return s + w[2]; }, 0) / walls.length;
    var bz = walls.reduce(function (s, w) { return s + w[5]; }, 0) / walls.length;

    for (var si = 0; si < nx; si++) {
      for (var sj = 0; sj < ny; sj++) {
        var sk = si * ny + sj;
        if (!enclosed[sk] || seen[sk]) continue;
        var comp = [], stack = [sk]; seen[sk] = 1;
        var mni = si, mxi = si, mnj = sj, mxj = sj;
        while (stack.length) {
          var k = stack.pop();
          var i = Math.floor(k / ny), j = k % ny;
          comp.push(k);
          if (i < mni) mni = i; if (i > mxi) mxi = i;
          if (j < mnj) mnj = j; if (j > mxj) mxj = j;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            var a = i + d[0], b = j + d[1];
            if (a >= 0 && a < nx && b >= 0 && b < ny) {
              var kk = a * ny + b;
              if (enclosed[kk] && !seen[kk]) { seen[kk] = 1; stack.push(kk); }
            }
          });
        }
        var area = comp.length * cellArea;
        if (area > planArea * MAX_AREA_FRAC) continue;   // §SUSPECT-LARGE: MAX_AREA_ABS flags below, never drops
        var wx0 = xs0 + mni * RES, wx1 = xs0 + (mxi + 1) * RES;
        var wy0 = ys0 + mnj * RES, wy1 = ys0 + (mxj + 1) * RES;
        // §DOOR-RESCUE (abstract test, applies uniformly — not a size band): a pocket is a room if
        // it is big enough to obviously be one on its own (area >= MIN_AREA, unchanged) OR it has a
        // real door AND isn't a bare rasterization sliver (NOISE_FLOOR_DIM).
        var doorRescued = false;
        var hasDoor = doorAdjacent(wx0, wy0, wx1, wy1, doors);
        if (area < MIN_AREA) {
          // §RASTER-EPS: the noise-floor test is a CELL-COUNT rule (3 cells) — test it in integer
          // cells, not in metres reconstructed from xs0+i*RES (whose FP dirt made a 3-cell pocket
          // flip at exact equality with NOISE_FLOOR_DIM; same convention _decomposeRegion uses).
          var minCellsNF = Math.round(NOISE_FLOOR_DIM / RES);
          var dimsOk = (mxi - mni + 1) >= minCellsNF && (mxj - mnj + 1) >= minCellsNF;
          if (!(dimsOk && hasDoor)) continue;
          doorRescued = true;
        }
        // §STAIR-EXCLUDE: a stair/ramp footprint covering this pocket -> it's a circulation shaft,
        // not a room. Drop it.
        var sf = stairOverlapFrac(wx0, wy0, wx1, wy1, stairs);
        if (sf >= STAIR_OVERLAP_REJECT) continue;
        // §ROOM-FORM + §RECT-HONESTY + §MULTI-RECT (ROOM_INJECTION_HYBRID.md §7/§8)
        var c2;
        for (c2 = 0; c2 < comp.length; c2++) inSet[comp[c2]] = 1;
        var openM = _openPerimeterM(comp, inSet, raw, dil, nx, ny, SEAL);
        var suspect = _classify(hasDoor, openM, doorWMed);
        if (!suspect && _isElongated(wx0, wy0, wx1, wy1)) suspect = 'ELONGATED';
        if (!suspect && area > MAX_AREA_ABS) suspect = 'LARGE';
        var gr = _growRegion(comp, inSet, raw, dil, nx, ny, SEAL);
        var totalCells = comp.length + gr.added.length;
        var dec = _decomposeRegion(inSet, ny, gr.mni, gr.mxi, gr.mnj, gr.mxj, totalCells, !!suspect);
        for (c2 = 0; c2 < comp.length; c2++) inSet[comp[c2]] = 0;
        for (c2 = 0; c2 < gr.added.length; c2++) inSet[gr.added[c2]] = 0;
        var rects = [];
        for (c2 = 0; c2 < dec.rects.length; c2++) {
          var gRect = dec.rects[c2];
          var rx0 = xs0 + gRect[0] * RES, rx1 = xs0 + (gRect[1] + 1) * RES;
          var ry0 = ys0 + gRect[2] * RES, ry1 = ys0 + (gRect[3] + 1) * RES;
          var snapped = _snapRectToWalls(rx0, ry0, rx1, ry1, walls);
          rx0 = snapped[0]; ry0 = snapped[1]; rx1 = snapped[2]; ry1 = snapped[3];
          rects.push({ cx: (rx0 + rx1) / 2, cy: (ry0 + ry1) / 2, sx: rx1 - rx0, sy: ry1 - ry0 });
        }
        var r0 = dec.rects[0];
        var cover1 = ((r0[1] - r0[0] + 1) * (r0[3] - r0[2] + 1)) / totalCells;
        rooms.push({
          cx: rects[0].cx, cy: rects[0].cy, cz: cz,
          sx: rects[0].sx, sy: rects[0].sy, sz: Math.max(bz, 2.0), area: area,
          door_rescued: doorRescued, open_m: openM, suspect: suspect,
          rects: rects, cover1: cover1, cover_n: dec.covered / totalCells
        });
      }
    }
    return rooms;
  }

  // §DOOR-PARTITION-EXT-EXCLUDE (compile_rooms.py port, 2026-07-13): returns ONLY the ext mask
  // (reachable-from-border), unlike _floodExterior above which returns the final intersected
  // enclosed set — kept separate so partitionByDoors can compute ext on the DILATED footprint but
  // apply it against the RAW free cells (recovering the seal band), without touching floodRooms'
  // already-working _floodExterior call.
  function _exteriorMask(free, nx, ny) {
    var ext = new Uint8Array(nx * ny);
    var stack = [];
    for (var i = 0; i < nx; i++) {
      [0, ny - 1].forEach(function (j) {
        var k = i * ny + j;
        if (free[k] && !ext[k]) { ext[k] = 1; stack.push(k); }
      });
    }
    for (var j = 0; j < ny; j++) {
      [0, nx - 1].forEach(function (i) {
        var k = i * ny + j;
        if (free[k] && !ext[k]) { ext[k] = 1; stack.push(k); }
      });
    }
    while (stack.length) {
      var k0 = stack.pop();
      var i0 = Math.floor(k0 / ny), j0 = k0 % ny;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var a = i0 + d[0], b = j0 + d[1];
        if (a >= 0 && a < nx && b >= 0 && b < ny) {
          var k = a * ny + b;
          if (free[k] && !ext[k]) { ext[k] = 1; stack.push(k); }
        }
      });
    }
    return ext;
  }

  function partitionByDoors(walls, doors, stairs, doorWMed) {
    if (!doors.length) return [];
    doorWMed = doorWMed || 0.0;
    var extent = _gridExtent(walls);
    var nx = extent.nx, ny = extent.ny, xs0 = extent.xs0, ys0 = extent.ys0;
    var raw = _rasterizeWalls(walls, extent);
    // §DOOR-PARTITION-EXT-EXCLUDE (real HHS finding: R9's own footprint sampled 93% exterior-
    // reachable): the door-BFS must never claim exterior space as a room. ext determined on the
    // dilated (sealed) footprint, applied against RAW free cells — the ext flood never reaches a
    // raw-free/dilation-blocked cell, so the seal band is "given back" automatically.
    var freeRaw = new Uint8Array(nx * ny);
    for (var m0 = 0; m0 < nx * ny; m0++) freeRaw[m0] = raw[m0] ? 0 : 1;
    var dil = SEAL > 0 ? _dilate(raw, nx, ny, SEAL) : raw;
    var freeDil = new Uint8Array(nx * ny);
    for (var m1 = 0; m1 < nx * ny; m1++) freeDil[m1] = dil[m1] ? 0 : 1;
    var extMask = _exteriorMask(freeDil, nx, ny);
    var free = new Uint8Array(nx * ny);
    for (var m = 0; m < nx * ny; m++) free[m] = (freeRaw[m] && !extMask[m]) ? 1 : 0;
    var cz = walls.reduce(function (s, w) { return s + w[2]; }, 0) / walls.length;
    var bz = walls.reduce(function (s, w) { return s + w[5]; }, 0) / walls.length;
    // §RASTER-EPS: same boundary-snap quantization as _rasterizeWalls (translation invariance)
    var ix = function (x) { return Math.min(nx - 1, Math.max(0, Math.floor((x - xs0) / RES + RASTER_EPS))); };
    var iy = function (y) { return Math.min(ny - 1, Math.max(0, Math.floor((y - ys0) / RES + RASTER_EPS))); };

    var owner = new Int32Array(nx * ny).fill(-1);
    var queue = [], head = 0;
    doors.forEach(function (d, di) {
      var ci = ix(d[0]), cj = iy(d[1]);
      var seed = null;
      for (var r = 0; r <= 6 && !seed; r++) { // expand outward (~1.4m) to find a free cell to seed this door from
        for (var da = -r; da <= r && !seed; da++) {
          for (var db = -r; db <= r && !seed; db++) {
            if (Math.max(Math.abs(da), Math.abs(db)) !== r) continue;
            var a = ci + da, b = cj + db;
            if (a >= 0 && a < nx && b >= 0 && b < ny) {
              var k = a * ny + b;
              if (free[k] && owner[k] === -1) seed = k;
            }
          }
        }
      }
      if (seed === null) return;
      owner[seed] = di; queue.push(seed);
    });

    while (head < queue.length) {
      var k0 = queue[head++];
      var i0 = Math.floor(k0 / ny), j0 = k0 % ny;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var a = i0 + d[0], b = j0 + d[1];
        if (a >= 0 && a < nx && b >= 0 && b < ny) {
          var k = a * ny + b;
          if (free[k] && owner[k] === -1) { owner[k] = owner[k0]; queue.push(k); }
        }
      });
    }

    var cellArea = RES * RES, planArea = nx * ny * cellArea;
    var byOwner = {};
    for (var k = 0; k < nx * ny; k++) {
      var o = owner[k];
      if (o === -1) continue;
      (byOwner[o] = byOwner[o] || []).push(k);
    }
    var inSet = new Uint8Array(nx * ny);
    var rooms = [];
    doors.forEach(function (d, di) {
      var cells = byOwner[di];
      if (!cells || !cells.length) return;
      var mni = Infinity, mxi = -Infinity, mnj = Infinity, mxj = -Infinity;
      cells.forEach(function (k) {
        var i = Math.floor(k / ny), j = k % ny;
        if (i < mni) mni = i; if (i > mxi) mxi = i;
        if (j < mnj) mnj = j; if (j > mxj) mxj = j;
      });
      var area = cells.length * cellArea;
      var wx0 = xs0 + mni * RES, wx1 = xs0 + (mxi + 1) * RES;
      var wy0 = ys0 + mnj * RES, wy1 = ys0 + (mxj + 1) * RES;
      // §RASTER-EPS: integer-cell noise-floor test (see floodRooms) — no FP knife edge
      var minCellsNF = Math.round(NOISE_FLOOR_DIM / RES);
      if ((mxi - mni + 1) < minCellsNF || (mxj - mnj + 1) < minCellsNF) return;
      if (area > planArea * MAX_AREA_FRAC) return;   // §SUSPECT-LARGE: MAX_AREA_ABS flags below, never drops
      if (stairOverlapFrac(wx0, wy0, wx1, wy1, stairs) >= STAIR_OVERLAP_REJECT) return;
      // §ROOM-FORM + §RECT-HONESTY + §MULTI-RECT (ROOM_INJECTION_HYBRID.md §7/§8). No dilation on
      // this path → sealSteps=0 for the openM march, no seal band to grow back into.
      var c2;
      for (c2 = 0; c2 < cells.length; c2++) inSet[cells[c2]] = 1;
      var openM = _openPerimeterM(cells, inSet, raw, raw, nx, ny, 0);
      var hasDoor = doorAdjacent(wx0, wy0, wx1, wy1, doors);
      var suspect = _classify(hasDoor, openM, doorWMed);
      if (!suspect && _isElongated(wx0, wy0, wx1, wy1)) suspect = 'ELONGATED';
      if (!suspect && area > MAX_AREA_ABS) suspect = 'LARGE';
      var dec = _decomposeRegion(inSet, ny, mni, mxi, mnj, mxj, cells.length, !!suspect);
      for (c2 = 0; c2 < cells.length; c2++) inSet[cells[c2]] = 0;
      var rects = [];
      for (c2 = 0; c2 < dec.rects.length; c2++) {
        var gRect = dec.rects[c2];
        var rx0 = xs0 + gRect[0] * RES, rx1 = xs0 + (gRect[1] + 1) * RES;
        var ry0 = ys0 + gRect[2] * RES, ry1 = ys0 + (gRect[3] + 1) * RES;
        var snapped = _snapRectToWalls(rx0, ry0, rx1, ry1, walls);
        rx0 = snapped[0]; ry0 = snapped[1]; rx1 = snapped[2]; ry1 = snapped[3];
        rects.push({ cx: (rx0 + rx1) / 2, cy: (ry0 + ry1) / 2, sx: rx1 - rx0, sy: ry1 - ry0 });
      }
      var r0 = dec.rects[0];
      var cover1 = ((r0[1] - r0[0] + 1) * (r0[3] - r0[2] + 1)) / cells.length;
      rooms.push({
        cx: rects[0].cx, cy: rects[0].cy, cz: cz,
        sx: rects[0].sx, sy: rects[0].sy, sz: Math.max(bz, 2.0), area: area,
        door_rescued: false, door_partitioned: true, open_m: openM,
        suspect: suspect, rects: rects, cover1: cover1, cover_n: dec.covered / cells.length
      });
    });
    return rooms;
  }

  // ==========================================================================================
  // §R-MERGE / §R-REJECT (ROOM_TAXONOMY_STRATEGY_2026-07-12.md Tasks 1/1b — POC-validated: JKR
  // 79->51 rooms, split-hallway chains merged; Duplex control 0 false merges; JKR 48 non-OPEN
  // rooms 0 false rejects, 16/31 SUSPECT_OPEN correctly rejected). Verbatim port of
  // scripts/compile_rooms.py's own port (same file, same section header) — not re-derived.
  // Runs AFTER floodRooms/partitionByDoors produce a storey's room list, BEFORE guid/name
  // assignment: R-MERGE first (removes only synthetic dividing lines, never invents geometry),
  // then R-REJECT (merging raises enclosure of legitimate unions, so reject must see the
  // post-merge shape).
  var MERGE_GAP_TOL_FACTOR = 2.0;   // x median real-wall thickness = seam-adjacency search band
  var MERGE_SHARE_MIN = 0.50;       // shared edge >= 50% of the smaller room's parallel side
  var MERGE_WALL_COVER_MAX = 0.25;  // same family as STAIR_OVERLAP_REJECT
  var MERGE_DOOR_TOL = 0.60;        // m -- door center within this of the seam blocks the merge
  var WALL_TOL = 0.45;              // m -- band around a seam/perimeter side within which a wall
                                     // AABB counts as backing it (shared by merge + reject)
  var REJECT_ENCLOSURE = 0.25;      // enclosure < this => REJECT (not a room)
  var SUSPECT_OPEN_ENCLOSURE = 0.50; // enclosure < this (and >= REJECT_ENCLOSURE) => SUSPECT_OPEN
  // §STAIRWELL-STACK (mirror of compile_rooms.py, user report 2026-07-12): a shaft's per-storey
  // flight covers only ~0.22 of its pocket (under STAIR_OVERLAP_REJECT=0.35, which stays), but the
  // STACK across storeys covers 1.30-2.23x vs 0.37 max for any legitimate room — measured gap.
  var STAIRWELL_STACK_REJECT = 0.50;    // cumulative all-storey stair overlap >= this x area...
  var STAIRWELL_STACK_MIN_LEVELS = 3;   // ...across >= this many distinct ~2m z-buckets => shaft

  // §R-MERGE/§R-REJECT: whole-building real wall list (ifc_class LIKE 'IfcWall%' only -- NOT the
  // wider WALL_LIKE raster set floodRooms uses -- with z). [cx,cy,cz,bx,by,bz] arrays.
  function allWallsRaw(db) {
    var rows = _rows(db, "SELECT t.center_x cx,t.center_y cy,t.center_z cz,COALESCE(t.bbox_x,0) bx," +
      "COALESCE(t.bbox_y,0) by2,COALESCE(t.bbox_z,0) bz " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcWall%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    return rows.map(function (r) { return [r.cx, r.cy, r.cz, r.bx, r.by2, r.bz]; });
  }

  // §STAIRWELL-STACK: whole-building stair/ramp footprints WITH z ([cx,cy,cz,bx,by]) — the
  // vertical-stack test needs distinct z-levels, which the per-storey stairs list drops.
  function allStairsZ(db) {
    var cond = STAIR_LIKE.map(function (p) { return "m.ifc_class LIKE '" + p + "'"; }).join(' OR ');
    var rows = _rows(db, "SELECT t.center_x cx,t.center_y cy,t.center_z cz," +
      "COALESCE(t.bbox_x,0) bx,COALESCE(t.bbox_y,0) by2 " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE (" + cond + ") AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    return rows.map(function (r) { return [r.cx, r.cy, r.cz, r.bx, r.by2]; });
  }

  // §STAIRWELL-STACK: drop pockets that are vertical stair shafts (see constants above).
  function rejectStairwell(rooms, stairsZ) {
    var out = [];
    rooms.forEach(function (r) {
      var bb = _roomBbox(r);
      var x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3];
      var area = Math.max(1e-6, (x1 - x0) * (y1 - y0));
      var cum = 0, levels = {};
      stairsZ.forEach(function (s) {
        var ox = Math.max(0, Math.min(x1, s[0] + s[3] / 2) - Math.max(x0, s[0] - s[3] / 2));
        var oy = Math.max(0, Math.min(y1, s[1] + s[4] / 2) - Math.max(y0, s[1] - s[4] / 2));
        var o = ox * oy;
        if (o > 0.01) { cum += o; levels[Math.round((s[2] || 0) / 2)] = 1; }
      });
      if (cum / area >= STAIRWELL_STACK_REJECT &&
          Object.keys(levels).length >= STAIRWELL_STACK_MIN_LEVELS) return;
      out.push(r);
    });
    return out;
  }

  // §R-MERGE: whole-building real door centers (with z) for the seam door-block test.
  function allDoorsRaw(db) {
    var rows = _rows(db, "SELECT t.center_x cx,t.center_y cy,t.center_z cz " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
    return rows.map(function (r) { return [r.cx, r.cy, r.cz]; });
  }

  function _wallThickness(walls) {
    var ts = [];
    walls.forEach(function (w) { var t = Math.min(w[3], w[4]); if (t > 0.01) ts.push(t); });
    ts.sort(function (a, b) { return a - b; });
    return ts.length ? ts[Math.floor(ts.length / 2)] : 0.0;
  }

  function _unionLen(segs) {
    if (!segs.length) return 0.0;
    var s = segs.slice().sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0.0, lo = s[0][0], hi = s[0][1];
    for (var i = 1; i < s.length; i++) {
      var a = s[i][0], b = s[i][1];
      if (a > hi) { tot += hi - lo; lo = a; hi = b; }
      else { hi = Math.max(hi, b); }
    }
    return tot + (hi - lo);
  }

  function _roomBbox(r) {
    var xs0 = Infinity, xs1 = -Infinity, ys0 = Infinity, ys1 = -Infinity;
    r.rects.forEach(function (rc) {
      xs0 = Math.min(xs0, rc.cx - rc.sx / 2); xs1 = Math.max(xs1, rc.cx + rc.sx / 2);
      ys0 = Math.min(ys0, rc.cy - rc.sy / 2); ys1 = Math.max(ys1, rc.cy + rc.sy / 2);
    });
    return [xs0, ys0, xs1, ys1];
  }

  function _sharedEdge(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, gapTol) {
    var ox = Math.min(ax1, bx1) - Math.max(ax0, bx0);
    var oy = Math.min(ay1, by1) - Math.max(ay0, by0);
    var gapy = Math.max(ay0, by0) - Math.min(ay1, by1);
    var gapx = Math.max(ax0, bx0) - Math.min(ax1, bx1);
    if (ox > 0 && gapy >= 0 && gapy <= gapTol) {
      var lo = Math.max(ax0, bx0), hi = Math.min(ax1, bx1);
      var ymid = (Math.min(ay1, by1) + Math.max(ay0, by0)) / 2;
      return { axis: 'x', lo: lo, hi: hi, mid: ymid, slen: ox, frac: ox / Math.min(ax1 - ax0, bx1 - bx0) };
    }
    if (oy > 0 && gapx >= 0 && gapx <= gapTol) {
      var lo2 = Math.max(ay0, by0), hi2 = Math.min(ay1, by1);
      var xmid = (Math.min(ax1, bx1) + Math.max(ax0, bx0)) / 2;
      return { axis: 'y', lo: lo2, hi: hi2, mid: xmid, slen: oy, frac: oy / Math.min(ay1 - ay0, by1 - by0) };
    }
    return null;
  }

  // §R-MERGE: union same-storey pockets whose shared seam is wall-free (no real wall backing the
  // boundary => a synthetic flood-fill/door-partition split, not an architectural wall). `walls`/
  // `doorsXyz` are whole-building lists; the pairwise test itself only ever compares same-storey
  // rooms (the caller passes one storey's room list at a time).
  function mergeRooms(rooms, walls, doorsXyz) {
    var n = rooms.length;
    if (n < 2) return rooms;
    var wallT = _wallThickness(walls);
    var gapTol = MERGE_GAP_TOL_FACTOR * wallT;
    var boxes = rooms.map(_roomBbox);
    var parent = []; for (var p = 0; p < n; p++) parent.push(p);
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    var merges = 0;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (find(i) === find(j)) continue;
        var ab = boxes[i], bb = boxes[j];
        var se = _sharedEdge(ab[0], ab[1], ab[2], ab[3], bb[0], bb[1], bb[2], bb[3], gapTol);
        if (!se) continue;
        if (se.frac < MERGE_SHARE_MIN) continue;
        var zlo = Math.min(rooms[i].cz - rooms[i].sz / 2, rooms[j].cz - rooms[j].sz / 2);
        var zhi = zlo + 3.0;
        var segs = [];
        for (var w = 0; w < walls.length; w++) {
          var wl = walls[w], wcz = wl[2];
          if (!(zlo - 1 <= wcz && wcz <= zhi + 1)) continue;
          var wx0 = wl[0] - wl[3] / 2, wx1 = wl[0] + wl[3] / 2;
          var wy0 = wl[1] - wl[4] / 2, wy1 = wl[1] + wl[4] / 2;
          if (se.axis === 'x') {
            if (wy0 - WALL_TOL <= se.mid && se.mid <= wy1 + WALL_TOL) {
              var s0 = Math.max(wx0, se.lo), s1 = Math.min(wx1, se.hi);
              if (s1 > s0) segs.push([s0, s1]);
            }
          } else {
            if (wx0 - WALL_TOL <= se.mid && se.mid <= wx1 + WALL_TOL) {
              var s0b = Math.max(wy0, se.lo), s1b = Math.min(wy1, se.hi);
              if (s1b > s0b) segs.push([s0b, s1b]);
            }
          }
        }
        var cover = se.slen > 0 ? _unionLen(segs) / se.slen : 1.0;
        if (cover > MERGE_WALL_COVER_MAX) continue;
        var doorHere = false;
        for (var d = 0; d < doorsXyz.length; d++) {
          var dd = doorsXyz[d], dcx = dd[0], dcy = dd[1], dcz = dd[2];
          if (!(zlo - 0.3 <= dcz && dcz <= zlo + 2.5)) continue;
          if (se.axis === 'x' && se.lo <= dcx && dcx <= se.hi && Math.abs(dcy - se.mid) <= MERGE_DOOR_TOL) { doorHere = true; break; }
          if (se.axis === 'y' && se.lo <= dcy && dcy <= se.hi && Math.abs(dcx - se.mid) <= MERGE_DOOR_TOL) { doorHere = true; break; }
        }
        if (doorHere) continue;
        parent[find(i)] = find(j); merges++;
      }
    }
    if (!merges) return rooms;
    // §DETERMINISM: build groups keyed by find()-root, but iterate in FIRST-SEEN order (matching
    // Python 3.7+ dict insertion-order semantics exactly) — plain Object.keys() would silently
    // reorder to ASCENDING NUMERIC key order for integer-like string keys (JS's own property-
    // enumeration rule for array-index-like keys), which is NOT the same as insertion order and
    // was measured to desync guid assignment from the Python mirror (Hospital/Terminal parity
    // witness caught it: same room COUNT, wrong room per guid).
    var groups = {}, groupOrder = [];
    for (var k = 0; k < n; k++) {
      var f = find(k);
      if (!groups[f]) { groups[f] = []; groupOrder.push(f); }
      groups[f].push(k);
    }
    var out = [];
    groupOrder.forEach(function (gk) {
      var members = groups[gk];
      if (members.length === 1) { out.push(rooms[members[0]]); return; }
      var mergedRects = [];
      members.forEach(function (m) { mergedRects = mergedRects.concat(rooms[m].rects); });
      var totalArea = members.reduce(function (s, m) { return s + rooms[m].area; }, 0);
      var rep = members.reduce(function (best, m) { return rooms[m].area > rooms[best].area ? m : best; }, members[0]);
      var merged = {}; Object.keys(rooms[rep]).forEach(function (kk) { merged[kk] = rooms[rep][kk]; });
      merged.rects = mergedRects;
      merged.area = totalArea;
      merged.cx = mergedRects[0].cx; merged.cy = mergedRects[0].cy;
      merged.sx = mergedRects[0].sx; merged.sy = mergedRects[0].sy;
      merged.door_rescued = members.some(function (m) { return rooms[m].door_rescued; });
      merged.door_partitioned = members.some(function (m) { return rooms[m].door_partitioned; });
      merged.merged_from = members.length;
      out.push(merged);
    });
    return out;
  }

  function _rectEnclosure(rx0, ry0, rx1, ry1, walls) {
    var per = 2 * ((rx1 - rx0) + (ry1 - ry0));
    if (per <= 0) return 0.0;
    var covered = 0.0;
    ['N', 'S', 'E', 'W'].forEach(function (side) {
      var segs = [];
      if (side === 'N' || side === 'S') {
        var y = side === 'N' ? ry1 : ry0;
        walls.forEach(function (wl) {
          var wy0 = wl[1] - wl[4] / 2, wy1 = wl[1] + wl[4] / 2;
          if (wy0 - WALL_TOL <= y && y <= wy1 + WALL_TOL) {
            var wx0 = wl[0] - wl[3] / 2, wx1 = wl[0] + wl[3] / 2;
            var lo = Math.max(wx0, rx0), hi = Math.min(wx1, rx1);
            if (hi > lo) segs.push([lo, hi]);
          }
        });
      } else {
        var x = side === 'E' ? rx1 : rx0;
        walls.forEach(function (wl) {
          var wx0 = wl[0] - wl[3] / 2, wx1 = wl[0] + wl[3] / 2;
          if (wx0 - WALL_TOL <= x && x <= wx1 + WALL_TOL) {
            var wy0 = wl[1] - wl[4] / 2, wy1 = wl[1] + wl[4] / 2;
            var lo = Math.max(wy0, ry0), hi = Math.min(wy1, ry1);
            if (hi > lo) segs.push([lo, hi]);
          }
        });
      }
      covered += _unionLen(segs);
    });
    return covered / per;
  }

  function _roomEnclosure(r, walls) {
    var zlo = r.cz - r.sz / 2 - 1.5, zhi = r.cz + r.sz / 2 + 1.5;
    var ws = walls.filter(function (w) { return zlo <= w[2] && w[2] <= zhi; });
    var totArea = 0; r.rects.forEach(function (rc) { totArea += rc.sx * rc.sy; });
    if (!totArea) totArea = 1.0;
    var e = 0.0;
    r.rects.forEach(function (rc) {
      var rx0 = rc.cx - rc.sx / 2, rx1 = rc.cx + rc.sx / 2;
      var ry0 = rc.cy - rc.sy / 2, ry1 = rc.cy + rc.sy / 2;
      e += (rc.sx * rc.sy) * _rectEnclosure(rx0, ry0, rx1, ry1, ws);
    });
    return e / totArea;
  }

  // §R-REJECT: drop pockets whose enclosure (wall-backed fraction of their own perimeter) falls
  // below REJECT_ENCLOSURE — an unbounded/exterior pocket, not a room. Only ever REMOVES rooms.
  // Rooms in [REJECT_ENCLOSURE, SUSPECT_OPEN_ENCLOSURE) not already flagged suspect get newly
  // flagged SUSPECT_OPEN here — an already-suspect room's existing reason is left untouched.
  function rejectRooms(rooms, walls) {
    var out = [];
    rooms.forEach(function (r) {
      var enc = _roomEnclosure(r, walls);
      r.enclosure = enc;
      if (enc < REJECT_ENCLOSURE) return;
      if (enc < SUSPECT_OPEN_ENCLOSURE && !r.suspect) r.suspect = 'OPEN';
      out.push(r);
    });
    return out;
  }

  // Per-storey compile pass (compile_rooms.py's main() loop, minus DB write). Returns
  // { report: [...], rooms: [...] } — report matches ROOM_WALKER_JS_PORT.md Task 3's required table
  // shape (building/count/method/status/total is assembled by the CALLER, which knows the building
  // name; this function reports per-storey).
  function compileRooms(db) {
    var stGuid = {};
    // compile_rooms.py wraps this in try/except: a never-walked building (fresh import, or this
    // table intentionally dropped) has no spatial_structure table at all yet — that's not an error,
    // just "no known storey guids to reuse for parent_guid" (writeRooms falls back to a synthetic
    // STC_ guid per storey either way, see the `r.parent = stGuid[st] || ('STC_'+st)...` line below).
    if (db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='spatial_structure'").length) {
      _rows(db, "SELECT guid, name FROM spatial_structure WHERE type='IfcBuildingStorey'")
        .forEach(function (r) { stGuid[r.name] = r.guid; });
    }

    // §7 self-scaling anchors: this building's own median door width/height (§ROOM-FORM/§WALL-VERT)
    // + per-storey wall-z anchors (§STOREY-Z).
    var ds = doorStats(db);
    var doorWMed = ds.w;
    var vertMin = ds.h > 0 ? VERT_FACTOR * ds.h : 0.0;
    var anchors = storeyZAnchors(db);
    var wallsBy = storeyWalls(db, vertMin, anchors);
    var stairsBy = storeyStairs(db);
    var doorsBy = storeyDoors(db, anchors);
    // §STAIR-EXCLUDE: stair storey is often 'Unknown'/unassigned in the extract, and a stair is a
    // CONTINUOUS vertical shaft anyway — test every room pocket against the UNION of all stair
    // footprints by XY (not per-storey).
    var allStairs = [];
    Object.keys(stairsBy).forEach(function (st) { allStairs = allStairs.concat(stairsBy[st]); });
    // §R-MERGE/§R-REJECT: whole-building wall/door lists (not the per-storey raster set).
    var allWallsRawList = allWallsRaw(db);
    var allDoorsRawList = allDoorsRaw(db);
    var allStairsZList = allStairsZ(db);   // §STAIRWELL-STACK
    // §LOCAL-FRAME (compile_rooms.py port — ROOM_WALKER_PHASE_INVARIANCE.md S2, 2026-07-17):
    // rebase every x/y the compile touches to a building-local origin (the raster wall set's own
    // min corner) and quantize to QUANT=1e-6 m, so after any constant frame translation every
    // number entering flood/partition/merge/reject is BIT-IDENTICAL (FP jitter of rebased coords
    // measured ≤ ~1e-10 m at |Δ|=1e6). Before: 8/14 translations changed Terminal's compile
    // (rooms 50-54 vs 51) via knife-edge comparisons on absolute coords. After: 14/14 EQUAL.
    // Output rooms are un-rebased on emit (writeRooms containment tests absolute element coords).
    // Same floor(v/QUANT + 0.5) rounding as the Python (Math.round/py-round differ on .5 ties).
    var QUANT = 1e-6;
    var _q = function (v) { return Math.floor(v / QUANT + 0.5) * QUANT; };
    var _rwAll = [];
    Object.keys(wallsBy).forEach(function (st) { _rwAll = _rwAll.concat(wallsBy[st]); });
    var orgX = 0.0, orgY = 0.0;
    if (_rwAll.length) {
      orgX = Infinity; orgY = Infinity;
      _rwAll.forEach(function (w) {
        orgX = Math.min(orgX, w[0] - w[3] / 2);
        orgY = Math.min(orgY, w[1] - w[4] / 2);
      });
    }
    var _rb6 = function (t) { return [_q(t[0] - orgX), _q(t[1] - orgY), t[2], _q(t[3]), _q(t[4]), t[5]]; };
    var _rb4 = function (t) { return [_q(t[0] - orgX), _q(t[1] - orgY), _q(t[2]), _q(t[3])]; };
    Object.keys(wallsBy).forEach(function (st) { wallsBy[st] = wallsBy[st].map(_rb6); });
    allStairs = allStairs.map(_rb4);
    Object.keys(doorsBy).forEach(function (st) { doorsBy[st] = doorsBy[st].map(_rb4); });
    allWallsRawList = allWallsRawList.map(_rb6);
    allDoorsRawList = allDoorsRawList.map(function (t) { return [_q(t[0] - orgX), _q(t[1] - orgY), t[2]]; });
    allStairsZList = allStairsZList.map(function (t) { return [_q(t[0] - orgX), _q(t[1] - orgY), t[2], _q(t[3]), _q(t[4])]; });
    var mergedTotal = 0, rejectedTotal = 0;

    var allrooms = [], report = [], stZ = {};
    Object.keys(wallsBy).sort().forEach(function (st) {
      var ws = wallsBy[st];
      if (ws.length < 3) {
        report.push({ storey: st, walls: ws.length, doors: 0, method: 'skip (too few walls)', roomCount: 0 });
        return;
      }
      var doors = doorsBy[st] || [];
      var roomsFlood = floodRooms(ws, allStairs, doors, doorWMed);
      // §DOOR-PARTITION gate: flood-fill found far fewer rooms than this storey has real doors — it
      // has structurally failed here, fall back to nearest-door partitioning.
      var rooms, method;
      if (doors.length && roomsFlood.length < DOOR_SHORTFALL_RATIO * doors.length) {
        rooms = partitionByDoors(ws, doors, allStairs, doorWMed);
        method = 'door-partition (flood-fill only found ' + roomsFlood.length + '/' + doors.length + ' doors)';
      } else {
        rooms = roomsFlood;
        method = 'flood-fill';
      }
      // §R-MERGE then §R-REJECT (ordering per spec: merge first, reject sees the post-merge shape).
      var preMergeN = rooms.length;
      rooms = mergeRooms(rooms, allWallsRawList, allDoorsRawList);
      var mergedN = preMergeN - rooms.length;
      var preRejectN = rooms.length;
      rooms = rejectRooms(rooms, allWallsRawList);
      rooms = rejectStairwell(rooms, allStairsZList);   // §STAIRWELL-STACK, after R-REJECT
      var rejectedN = preRejectN - rooms.length;
      // §LOCAL-FRAME: un-rebase on emit — everything after this point (report, no-overlap guard,
      // writeRooms containment against absolute DB coords) sees the DB's own frame again.
      rooms.forEach(function (r) {
        r.cx += orgX; r.cy += orgY;
        (r.rects || []).forEach(function (rc) { rc.cx += orgX; rc.cy += orgY; });
      });
      mergedTotal += mergedN; rejectedTotal += rejectedN;
      var rescued = rooms.filter(function (r) { return r.door_rescued; }).length;
      var partitioned = rooms.filter(function (r) { return r.door_partitioned; }).length;
      var suspects = rooms.filter(function (r) { return r.suspect; }).length;
      stZ[st] = ws.reduce(function (s, w) { return s + w[2]; }, 0) / ws.length; // storey z = mean wall centre-z
      report.push({
        storey: st, walls: ws.length, doors: doors.length, method: method, roomCount: rooms.length,
        doorRescued: rescued, doorPartitioned: partitioned, suspect: suspects,
        areas: rooms.map(function (r) { return Math.round(r.area); })
      });
      rooms.forEach(function (r, k) {
        r.storey = st; r.guid = ('RM_' + st + '_' + (k + 1)).replace(/ /g, '_');
        // §APPROX: '≈' marks the room as compiled/approximate in the lens label; '⚠' marks a
        // §ROOM-FORM SUSPECT (kept visible for the future review feature, never silently dropped).
        // parent_guid -> a compiled storey row (created on write) so the Room lens groups per floor.
        var mark = r.suspect ? '⚠' : '≈';
        r.name = mark + ' ' + st + ' R' + (k + 1);
        r.parent = stGuid[st] || ('STC_' + st).replace(/ /g, '_');
        allrooms.push(r);
      });
    });
    var total = allrooms.length;
    var doorRescuedTotal = allrooms.filter(function (r) { return r.door_rescued; }).length;
    var doorPartitionTotal = allrooms.filter(function (r) { return r.door_partitioned; }).length;
    var suspectTotal = allrooms.filter(function (r) { return r.suspect; }).length;
    _verifyNoOverlap(allrooms);
    return { report: report, rooms: allrooms, stZ: stZ, total: total, doorRescuedTotal: doorRescuedTotal,
      doorPartitionTotal: doorPartitionTotal, suspectTotal: suspectTotal,
      mergedTotal: mergedTotal, rejectedTotal: rejectedTotal };
  }

  // §NO-OVERLAP (compile_rooms.py port, 2026-07-13 — user request "rooms are stacked to each
  // other, not overlapping"): permanent regression guard, informs like §PHASE0-HEALTH, never
  // blocks. Verified 0 violations across 773 real rect rows in 6 buildings at the time this was
  // added — both compile paths already guarantee disjointness by construction.
  function _verifyNoOverlap(allrooms) {
    var byStorey = {};
    allrooms.forEach(function (r) { (byStorey[r.storey] = byStorey[r.storey] || []).push(r); });
    var hits = 0;
    Object.keys(byStorey).forEach(function (st) {
      var rooms = byStorey[st];
      for (var i = 0; i < rooms.length; i++) {
        for (var j = i + 1; j < rooms.length; j++) {
          var ri = rooms[i], rj = rooms[j];
          if (ri.guid === rj.guid) continue;
          (ri.rects || [ri]).forEach(function (a) {
            var ax0 = a.cx - a.sx / 2, ax1 = a.cx + a.sx / 2;
            var ay0 = a.cy - a.sy / 2, ay1 = a.cy + a.sy / 2;
            (rj.rects || [rj]).forEach(function (b) {
              var bx0 = b.cx - b.sx / 2, bx1 = b.cx + b.sx / 2;
              var by0 = b.cy - b.sy / 2, by1 = b.cy + b.sy / 2;
              var ox = Math.min(ax1, bx1) - Math.max(ax0, bx0);
              var oy = Math.min(ay1, by1) - Math.max(ay0, by0);
              if (ox > 0 && oy > 0 && ox * oy > 0.5) {
                hits++;
                console.log('  ⚠ §NO-OVERLAP VIOLATION storey=' + st + ' ' + ri.guid +
                  ' vs ' + rj.guid + ' overlap=' + (ox * oy).toFixed(2) + 'm2');
              }
            });
          });
        }
      }
    });
    if (!hits) console.log('§NO-OVERLAP: 0 cross-room overlaps (invariant holds)');
    return hits;
  }

  // Persist a compileRooms() result into spatial_structure + rel_contained_in_space (the --write
  // half of compile_rooms.py's main()). Idempotent: prior compiled rows (RM_%/STC_%) are replaced.
  function writeRooms(db, compiled) {
    var allrooms = compiled.rooms, stZ = compiled.stZ;
    var hasTable = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='spatial_structure'").length > 0;
    if (!hasTable) {
      db.run("CREATE TABLE spatial_structure (guid TEXT, type TEXT, name TEXT, parent_guid TEXT, " +
        "object_type TEXT, predefined_type TEXT, center_x REAL, center_y REAL, center_z REAL, " +
        "size_x REAL, size_y REAL, size_z REAL, room_guid TEXT)");
    } else {
      ['center_x', 'center_y', 'center_z', 'size_x', 'size_y', 'size_z', 'object_type', 'predefined_type', 'room_guid']
        .forEach(function (col) {
          try { db.run('ALTER TABLE spatial_structure ADD COLUMN ' + col + (col.indexOf('center') === 0 || col.indexOf('size') === 0 ? ' REAL' : ' TEXT')); }
          catch (e) { /* already exists — fine */ }
        });
    }
    // §APPROX: compiled storey rows (only where the DB has none) so the Room lens can group rooms
    // per floor via parent_guid -> IfcBuildingStorey.name. Idempotent on the STC_ prefix.
    db.run("DELETE FROM spatial_structure WHERE type='IfcBuildingStorey' AND guid LIKE 'STC\\_%' ESCAPE '\\'");
    var stStmt = db.prepare("INSERT INTO spatial_structure (guid,type,name,parent_guid,object_type,predefined_type,center_z) VALUES (?,?,?,?,?,?,?)");
    Object.keys(stZ).sort().forEach(function (st) {
      if (!allrooms.some(function (r) { return r.storey === st; })) return;
      stStmt.run([('STC_' + st).replace(/ /g, '_'), 'IfcBuildingStorey', st, null, 'COMPILED', null, stZ[st]]);
    });
    stStmt.free();
    // remove any prior compiled rooms (idempotent)
    db.run("DELETE FROM spatial_structure WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\'");
    var roomStmt = db.prepare("INSERT INTO spatial_structure (guid,type,name,parent_guid,object_type,predefined_type," +
      "center_x,center_y,center_z,size_x,size_y,size_z,room_guid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
    var rectRows = 0;
    allrooms.forEach(function (r) {
      // predefined_type distinguishes which compile technique found each room, for traceability —
      // object_type stays 'COMPILED' either way (the tag spacesOf()'s exclusion filter keys on).
      // §ROOM-FORM: SUSPECT_* overrides — the room failed "well formed, fully enclosed, has door"
      // and is carried as a review candidate, not as a trusted room.
      var ptype = r.suspect ? ('SUSPECT_' + r.suspect) :
        r.door_partitioned ? 'INTERNAL_DOORPART' : r.door_rescued ? 'INTERNAL_SMALL' : 'INTERNAL';
      // §MULTI-RECT: one row per sub-rect, ALL sharing room_guid (= the primary rect's guid) and
      // the same name/type — N rects, ONE logical room. Sub-rect guids get a letter suffix
      // (RM_..._5, RM_..._5b, RM_..._5c) so 'RM\_%' patterns keep matching every row.
      var rcs = r.rects || [{ cx: r.cx, cy: r.cy, sx: r.sx, sy: r.sy }];
      for (var ri = 0; ri < rcs.length; ri++) {
        var g = ri === 0 ? r.guid : r.guid + String.fromCharCode(97 + ri);
        roomStmt.run([g, 'IfcSpace', r.name, r.parent, 'COMPILED', ptype,
          rcs[ri].cx, rcs[ri].cy, r.cz, rcs[ri].sx, rcs[ri].sy, r.sz, r.guid]);
        rectRows++;
      }
    });
    roomStmt.free();
    // rel_contained_in_space: elements whose XY centre falls inside a room (compiled)
    if (!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rel_contained_in_space'").length) {
      db.run('CREATE TABLE rel_contained_in_space (space_guid TEXT, element_guid TEXT)');
    }
    db.run("DELETE FROM rel_contained_in_space WHERE space_guid LIKE 'RM\\_%' ESCAPE '\\'");
    var els = _rows(db, "SELECT m.guid g, m.storey st, t.center_x ex, t.center_y ey FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE t.center_x IS NOT NULL");
    var byst = {};
    // §ROOM-FORM: SUSPECT rooms get no element containment — an unreviewed corridor/void must not
    // capture elements away from real rooms.
    allrooms.forEach(function (r) {
      if (r.suspect) return;
      (byst[r.storey] = byst[r.storey] || []).push(r);
    });
    var relStmt = db.prepare('INSERT INTO rel_contained_in_space (space_guid, element_guid) VALUES (?,?)');
    var rel = 0;
    els.forEach(function (e) {
      var candidates = byst[e.st] || [];
      for (var i = 0; i < candidates.length; i++) {
        var r = candidates[i];
        // §MULTI-RECT: contained iff inside ANY of the room's rects; the rel row keys the
        // LOGICAL room guid so downstream still sees one room, not N.
        var rcs = r.rects || [r];
        var hit = false;
        for (var q = 0; q < rcs.length; q++) {
          if (Math.abs(e.ex - rcs[q].cx) <= rcs[q].sx / 2 && Math.abs(e.ey - rcs[q].cy) <= rcs[q].sy / 2) { hit = true; break; }
        }
        if (hit) { relStmt.run([r.guid, e.g]); rel++; break; }
      }
    });
    relStmt.free();
    // §ROOM_WALKER_VERSION_STAMP stage 2 (write side only): record WHICH algorithm version compiled
    // these rooms, so stage 3 can later trust-until-version-moves-on instead of trust-forever.
    // Missing row = compiled before this shipped (counts as maximally stale once stage 3 reads it).
    db.run("CREATE TABLE IF NOT EXISTS rooms_meta (id INTEGER PRIMARY KEY CHECK(id=1), " +
      "version TEXT, built_at TEXT, room_count INTEGER)");
    db.run("INSERT OR REPLACE INTO rooms_meta (id, version, built_at, room_count) VALUES (1,?,?,?)",
      [ROOM_WALKER_V, new Date().toISOString(), allrooms.length]);
    console.log(TAG + ' §ROOMS_META stamped version=' + ROOM_WALKER_V + ' room_count=' + allrooms.length);
    return { roomsWritten: allrooms.length, rectRowsWritten: rectRows, relWritten: rel };
  }

  // Convenience matching compile_rooms.py's CLI main(): compute, optionally persist. `opts.write`
  // mirrors `--write`; without it this is a dry run (compute + report only, DB untouched).
  function walk(db, opts) {
    opts = opts || {};
    var compiled = compileRooms(db);
    var result = { report: compiled.report, total: compiled.total,
      doorRescuedTotal: compiled.doorRescuedTotal, doorPartitionTotal: compiled.doorPartitionTotal,
      suspectTotal: compiled.suspectTotal, mergedTotal: compiled.mergedTotal, rejectedTotal: compiled.rejectedTotal };
    if (opts.write) {
      var w = writeRooms(db, compiled);
      result.roomsWritten = w.roomsWritten; result.rectRowsWritten = w.rectRowsWritten; result.relWritten = w.relWritten;
    }
    return result;
  }

  var API = {
    storeyWalls: storeyWalls, storeyStairs: storeyStairs, storeyDoors: storeyDoors,
    doorStats: doorStats, storeyZAnchors: storeyZAnchors,
    doorAdjacent: doorAdjacent, stairOverlapFrac: stairOverlapFrac,
    floodRooms: floodRooms, partitionByDoors: partitionByDoors,
    mergeRooms: mergeRooms, rejectRooms: rejectRooms, allWallsRaw: allWallsRaw, allDoorsRaw: allDoorsRaw,
    compileRooms: compileRooms, writeRooms: writeRooms, walk: walk,
    RES: RES, MIN_AREA: MIN_AREA, DOOR_SHORTFALL_RATIO: DOOR_SHORTFALL_RATIO,
    VERT_FACTOR: VERT_FACTOR, OPEN_PERIM_FACTOR: OPEN_PERIM_FACTOR,
    MERGE_GAP_TOL_FACTOR: MERGE_GAP_TOL_FACTOR, MERGE_SHARE_MIN: MERGE_SHARE_MIN,
    MERGE_WALL_COVER_MAX: MERGE_WALL_COVER_MAX, MERGE_DOOR_TOL: MERGE_DOOR_TOL, WALL_TOL: WALL_TOL,
    REJECT_ENCLOSURE: REJECT_ENCLOSURE, SUSPECT_OPEN_ENCLOSURE: SUSPECT_OPEN_ENCLOSURE,
    SUSPECT_ELONGATED_ASPECT_MIN: SUSPECT_ELONGATED_ASPECT_MIN,
    ROOM_WALKER_V: ROOM_WALKER_V
  };
  ROOT.RoomWalker = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof console !== 'undefined') console.log(TAG + ' module loaded, version=' + ROOM_WALKER_V);
})();
