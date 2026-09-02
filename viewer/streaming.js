/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Calls sql.js API (MIT, sql-js/sql.js) — loaded from CDN at runtime, not bundled here.
 * Calls Three.js API (MIT, mrdoob/three.js) — loaded from CDN at runtime, not bundled here.
 * All code in this file is original work by the author:
 *   DB BLOB → Float32Array → BufferGeometry → GPU streaming, instancing,
 *   discipline phasing, storey filtering, geometry cache.
 */
// streaming.js — DB loading, building streaming, geometry cache
function setupStreaming(A) {
  A.streamQueue = [];
  A.streamIdx = 0;
  A.streaming = false;
  A.savedStreams = {};
  A._libHasNormals = null; // cached: does libDb have normals column?
  A._useDlodPath = false;  // §S261: true for buildings >= 5K elements on desktop
  A._dlodSlots = {};       // §S261: bmId → [{slotId, hash, promoted, reservedVerts, reservedIdx, bboxMatrix, realMatrix, wx, wy, wz}]

  // drawBuildingBoxes() retired — replaced by per-element _drawBboxPlaceholders()
  A.drawBuildingBoxes = function() {};
  var _idx16Saved = 0, _idx16Geoms = 0;

  // ══ §MEP_SMOOTH_NORMALS (2026-08-30, user: "we know that may ducts, dome, are not fully rounded"
  // … "it must not impact non curve intending surfaces") ═══════════════════════════════════════
  // MEASURED FIRST (§SHADE_PROBE, Clinic, 448 real streamed geometries): every class ships hard
  // per-face normals — weldRatio 0.107-0.29 and splitNormal 96-100% — so `flatShading: false` is
  // silently overridden by the data, because with no shared vertices there is nothing to average.
  // The decisive number is distinctNormals: IfcFlowFitting 114.3, IfcFlowTerminal 128.6,
  // IfcFlowController 189.0 — richly tessellated shapes whose roundness is being thrown away by
  // flat shading, recoverable with ZERO new triangles. IfcFlowSegment is 10.3 over 26 triangles: a
  // genuine 10-sided prism, so its SHADING improves here but its silhouette cannot, and straight
  // ducts will gain less than fittings do. Every box class reports distinctNormals = 7, which is
  // what makes the gate below safe by construction rather than by tuning.
  //
  // TWO GATES, because a crease angle alone is not enough: an 8-sided duct's facets are 45 deg
  // apart, so any threshold able to smooth it would also round a 45 deg roof ridge or chamfer.
  //   1. CLASS — only curve-intending IFC classes are eligible, ever. A wall is never a candidate
  //      regardless of its geometry, which is the user's constraint met by construction.
  //   2. CREASE — inside those classes, a vertex keeps its own face normal when the smoothed result
  //      would swing more than CREASE_DEG away, so duct flanges and end caps stay crisp.
  //
  // IN PLACE, BY DESIGN — NO WELD, NO RE-INDEX. Merged meshes carry many elements and `ranges`
  // addresses them by idxStart/idxCount; picking, per-element hide, the BVH and §TRIPLANAR's own
  // vTriWorldNormal all read that layout. Rewriting normal VALUES touches none of it. Welding would
  // renumber vertices and break all four, which is the "no side effects" line the user drew.
  var MEP_CURVE_CLASSES = {
    IfcFlowSegment: 1, IfcFlowFitting: 1, IfcFlowTerminal: 1, IfcFlowController: 1,
    IfcFlowMovingDevice: 1, IfcFlowStorageDevice: 1, IfcValve: 1,
    IfcPipeSegment: 1, IfcPipeFitting: 1, IfcDuctSegment: 1, IfcDuctFitting: 1
  };
  var CREASE_DEG = 55;   // above an 8-sided prism's 45 deg facet step, below a 90 deg box corner
  // §MEP_SMOOTH_MEASURED_GATE (2026-08-30, user: "The rounding shading is still not fully working.
  // Many cylindrical type candidates can be smoothly curved."). A class list can only ever name the
  // shapes someone thought of — MEASURED on the user's Hospital bake it reached just 96 geometries,
  // and round columns, domes, tanks and curtain-wall mullions are all cylindrical yet none are
  // IfcFlow*. The gate is now THE SHAPE ITSELF, using the separation §SHADE_PROBE already measured:
  // curve-intending geometry carries 36-189 distinct facet directions (IfcFlowController 189.0,
  // IfcFlowTerminal 128.6, IfcFlowFitting 114.3, IfcColumn 36.3) while EVERY box-like class measured
  // exactly 7 (IfcWallStandardCase, IfcPlate, IfcMember, IfcDoor). 16 sits in the empty middle of
  // that gap, so "must not impact non curve intending surfaces" holds by measurement, not by a name
  // I had to guess. The class list stays as an OR: a 10-sided duct (IfcFlowSegment, 10.3) is
  // genuinely curve-intending and would fail a pure-shape test.
  var CURVE_MIN_DISTINCT = 16;
  // §MEP_SMOOTH_PERF (2026-08-30) — MEASURED 18,718 ms on Hospital (14,075 spans, 25.2M vertices),
  // which is 18.7 s added to every Alt+S and every bake stage. Unacceptable next to a bake the user
  // already called slow. Two costs, both cut here rather than accepted:
  //   1. gate sampling — 1500 samples per span existed to count distinct facet directions, but the
  //      decision is only "is this nearer 7 or nearer 16+". 192 samples settle that; the early-out
  //      at >64 distinct usually stops far sooner.
  //   2. the position map — see _smoothKey below.
  var DISTINCT_SAMPLE_CAP = 192;
  function _distinctNormals(nor, idx, start, count) {
    var seen = {}, n = 0, step = Math.max(1, Math.floor(count / DISTINCT_SAMPLE_CAP)), i, vi, k;
    for (i = start; i < start + count; i += step) {
      vi = idx ? idx.getX(i) : i;
      k = Math.round(nor.getX(vi) * 8) + ',' + Math.round(nor.getY(vi) * 8) + ',' + Math.round(nor.getZ(vi) * 8);
      if (!seen[k]) { seen[k] = 1; if (++n > 64) return n; }   // early out: well past the threshold
    }
    return n;
  }
  A.mepSmoothNormals = function() {
    if (!A.scene) return null;
    var t0 = performance.now(), cosCrease = Math.cos(CREASE_DEG * Math.PI / 180);
    var geomsTouched = 0, rangesTouched = 0, vertsSmoothed = 0, vertsKeptHard = 0, skippedNoNormal = 0;
    var seen = new Set();
    A.scene.traverse(function(o) {
      if (!(o.isMesh || o.isBatchedMesh || o.isInstancedMesh) || !o.geometry) return;
      var g = o.geometry;
      if (seen.has(g.uuid)) return;
      seen.add(g.uuid);
      var pos = g.attributes && g.attributes.position, nor = g.attributes && g.attributes.normal;
      if (!pos || !nor) { skippedNoNormal++; return; }
      var idx = g.index; if (!idx) return;
      // Which index spans are eligible? A merged mesh mixes elements, so the gate is applied per
      // RANGE (which records its own ifcClass), never per mesh — a duct sharing a merged bucket
      // with a wall must not drag the wall in with it.
      var spans = [];
      // Ranges live in A._mergedMeta keyed by mesh.id (:1924), NOT on userData — checked, because
      // reading the wrong place would leave every merged mesh with no eligible span and the gate
      // would silently do nothing on exactly the buildings that need it.
      var rngs = A._mergedMeta && A._mergedMeta[o.id];
      if (rngs && rngs.length) {
        // Judged per RANGE, never per mesh: a merged bucket mixes elements, and a mesh full of boxes
        // would score a high distinct-normal count in aggregate while every individual box is 7.
        for (var ri = 0; ri < rngs.length; ri++) {
          var rg = rngs[ri];
          if (MEP_CURVE_CLASSES[rg.ifcClass] ||
              _distinctNormals(nor, idx, rg.idxStart, rg.idxCount) >= CURVE_MIN_DISTINCT) {
            spans.push([rg.idxStart, rg.idxCount]);
          }
        }
      } else if (o.isBatchedMesh) {
        // §MEP_SMOOTH_BATCHED (2026-08-30 — the gap the user's Hospital bake exposed). Hospital
        // reports §CONTRACT_CHECK batch=38169 instanced=25013 merged=0: NO merged meshes at all, so
        // the ranges branch above never fires and §MEP_SMOOTH_NORMALS did not even log there. The
        // fix is not to relax the single-element rule but to satisfy it: a BatchedMesh holds each
        // element's geometry as its OWN entry, so `_geometryInfo[gid]` (vertexStart/vertexCount +
        // index start/count) IS a single element's span inside the shared buffer. Judging one entry
        // is judging one element, exactly the safety condition G-MEP-2 enforces.
        // Private three.js field, so it is feature-detected: if the shape is not what r184/185
        // provides, the mesh is skipped rather than guessed at.
        var gi = o._geometryInfo;
        if (gi && gi.length) {
          for (var bi = 0; bi < gi.length; bi++) {
            var e = gi[bi];
            var iStart = (e.start != null) ? e.start : e.indexStart;
            var iCount = (e.count != null) ? e.count : e.indexCount;
            if (iStart == null || !(iCount > 0)) continue;
            if (_distinctNormals(nor, idx, iStart, iCount) >= CURVE_MIN_DISTINCT) spans.push([iStart, iCount]);
          }
        } else if (!A._bmShapeWarned) {
          A._bmShapeWarned = true;
          console.warn('§MEP_SMOOTH_BATCHED INCONCLUSIVE — BatchedMesh exposes no _geometryInfo; ' +
            'batched elements skipped rather than judged as one mesh');
        }
      } else if (o.isInstancedMesh) {
        // An InstancedMesh's geometry IS one element's shape — that is what instancing means, one
        // geometry repeated N times. So judging it whole IS judging a single element, and smoothing
        // it correctly affects every instance of that same shape. A wall instanced 500 times still
        // measures 7 distinct facet directions and fails the threshold, so the box case is safe.
        var icls = (o.userData && (o.userData.ifc_class || o.userData.ifcClass)) || '';
        if (MEP_CURVE_CLASSES[icls] || _distinctNormals(nor, idx, 0, idx.count) >= CURVE_MIN_DISTINCT) {
          spans.push([0, idx.count]);
        }
      } else {
        // §MEP_SMOOTH_GATE_SCOPE (2026-08-30 — caught by G-MEP-2, which failed with 5,233,835
        // non-curve vertices changed; the previous revision of this branch judged ANY rangeless mesh
        // whole). A BATCHED mesh holds hundreds of elements in one geometry: hundreds of boxes score
        // a high distinct-normal count IN AGGREGATE while every individual box is 7, so the shape
        // test caught the lot and smoothed real walls. That is exactly the regression the user's
        // "must not impact non curve intending surfaces" forbids.
        //
        // The shape test is therefore only allowed where a single ELEMENT is being judged: a mesh
        // carrying its own ifc_class is one element. A multi-element mesh with no ranges cannot be
        // resolved into elements here, so it falls back to the CLASS gate alone — narrower, but
        // never wrong. Coverage lost this way is a reason to expose ranges for batched meshes, not
        // a reason to smooth a wall.
        var cls = (o.userData && (o.userData.ifc_class || o.userData.ifcClass)) || '';
        var singleElement = !!cls;
        if (MEP_CURVE_CLASSES[cls] ||
            (singleElement && _distinctNormals(nor, idx, 0, idx.count) >= CURVE_MIN_DISTINCT)) {
          spans.push([0, idx.count]);
        }
      }
      if (!spans.length) return;
      var acc = new Map(), k, i, a, b, c;
      // §MEP_SMOOTH_PERF — was a 3-part STRING key built per vertex: on Hospital that is ~75M string
      // concatenations and the bulk of the 18.7 s. Now a single number. Positions are quantised to
      // 0.1 mm exactly as before (1e4), then folded into one integer; the multipliers are the
      // standard large primes used for spatial hashing, and the value is kept inside the safe
      // integer range so it can key a Map without allocating.
      // A hash CAN collide, unlike the string it replaces. The consequence is bounded and local:
      // two genuinely separate vertices would average their normals, shading one vertex slightly
      // wrong on one element — it cannot move geometry, cross the class gate, or affect a
      // non-curve surface. G-MEP-2 still measures the real output either way.
      function key(i2) {
        var qx = Math.round(pos.getX(i2) * 1e4);
        var qy = Math.round(pos.getY(i2) * 1e4);
        var qz = Math.round(pos.getZ(i2) * 1e4);
        return ((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) >>> 0;
      }
      // pass 1 — accumulate area-weighted face normals per shared POSITION
      for (var s2 = 0; s2 < spans.length; s2++) {
        for (i = spans[s2][0]; i + 2 < spans[s2][0] + spans[s2][1]; i += 3) {
          a = idx.getX(i); b = idx.getX(i + 1); c = idx.getX(i + 2);
          var ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
          var e1x = pos.getX(b) - ax, e1y = pos.getY(b) - ay, e1z = pos.getZ(b) - az;
          var e2x = pos.getX(c) - ax, e2y = pos.getY(c) - ay, e2z = pos.getZ(c) - az;
          var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          var tri = [a, b, c];
          for (var t2 = 0; t2 < 3; t2++) {
            k = key(tri[t2]);
            var e = acc.get(k);
            if (!e) { e = [0, 0, 0]; acc.set(k, e); }
            e[0] += nx; e[1] += ny; e[2] += nz;   // unnormalised = area weighted, the standard rule
          }
        }
      }
      // pass 2 — write back, crease-limited
      var wrote = 0;
      for (var s3 = 0; s3 < spans.length; s3++) {
        for (i = spans[s3][0]; i < spans[s3][0] + spans[s3][1]; i++) {
          var vi = idx.getX(i);
          var e2 = acc.get(key(vi)); if (!e2) continue;
          var L = Math.sqrt(e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2]);
          if (!(L > 1e-12)) continue;
          var sx = e2[0] / L, sy = e2[1] / L, sz = e2[2] / L;
          var ox = nor.getX(vi), oy = nor.getY(vi), oz = nor.getZ(vi);
          if (sx * ox + sy * oy + sz * oz < cosCrease) { vertsKeptHard++; continue; }  // hard edge
          nor.setXYZ(vi, sx, sy, sz); wrote++;
        }
      }
      if (wrote) {
        vertsSmoothed += wrote; rangesTouched += spans.length; geomsTouched++;
        nor.needsUpdate = true;
        // §NORMAL_REPAIR_GPU_UPLOAD (same file, ~:1004) already learned that needsUpdate alone does
        // not always reach the GPU for a cached geometry — drop the renderer's cached properties so
        // buffers rebind, exactly as that fix does.
        if (A.renderer && A.renderer.properties) A.renderer.properties.remove(g);
      }
    });
    var out = { geomsTouched: geomsTouched, rangesTouched: rangesTouched, vertsSmoothed: vertsSmoothed,
                vertsKeptHard: vertsKeptHard, ms: +(performance.now() - t0).toFixed(1) };
    console.log('§MEP_SMOOTH_NORMALS geoms=' + geomsTouched + ' ranges=' + rangesTouched +
      ' vertsSmoothed=' + vertsSmoothed + ' vertsKeptHard=' + vertsKeptHard +
      ' creaseDeg=' + CREASE_DEG + ' minDistinctN=' + CURVE_MIN_DISTINCT + ' ms=' + out.ms +
      (geomsTouched === 0 ? '  INCONCLUSIVE — no curve-class range was found; nothing was judged' : '') +
      '');
    // §DUCT_SILHOUETTE reports alongside, because the two passes are the two halves of one answer
    // and reading them apart is what made "roundness works on lamps but not on ducts" hard to
    // diagnose: this line says how many vertices got a smoother NORMAL, the next says how many
    // elements got a rounder OUTLINE. A pass that changed nothing prints NO-OP, not silence.
    if (window.SilhouetteRefine) { try { window.SilhouetteRefine.report(); } catch (e) {} }
    // §IDX16 reports SEPARATELY (2026-08-30): it used to ride the line above, so on Hospital —
    // where this pass did not fire at all — its saving was invisible rather than absent.
    console.log('§IDX16 geoms=' + _idx16Geoms + ' saved=' + (_idx16Saved / 1048576).toFixed(1) + 'MB' +
      (_idx16Geoms === 0 ? ' (merged path unused on this building — the per-element site in scene.js carries it)' : ''));
    return out;
  };   // §IDX16 tally, reported by A.mepSmoothNormals' log line

  // Implementing FLY_TOUR_DLOD_SCALE.md §17.17.4 — Witness: W-OCC3-LTU.
  // CPE_4D_PERF_MEM_FINDINGS.md §R6 measured the blocker: the 2026-08-10 re-extracted
  // LTU_AHouse_meta.db's elements_meta has NO `building` column (PRAGMA-verified: id, guid,
  // discipline, ifc_class, element_name, element_type, storey, material_name, material_rgba), so
  // every `WHERE m.building = ?` filter throws → §HELPERS_QUERY_ERR no such column: m.building →
  // §CENTRES_RESULT rows=0 → startStreaming() finds no building and returns silently. Geo downloads,
  // ZERO meshes ever stream. R6 named two fixes; this is the code-side one (a re-extract is bigger,
  // riskier, and out of scope — and this repo bans committing DB binaries outright regardless).
  //
  // Scope is deliberately narrow: probe the column ONCE per loaded DB; when it is ABSENT treat the
  // DB as containing exactly ONE building and drop the predicate. A DB that HAS the column takes the
  // identical path it takes today — the probe is the only added work, and that equivalence is the
  // witness. The label is EXTRACTED from the DB URL basename (a real source), never invented.
  A._buildingCol = undefined;   // true = column present (normal), false = single-building fallback
  A._hasBuildingCol = function(db) {
    if (A._buildingCol !== undefined) return A._buildingCol;
    if (!db) return true;       // unknown yet — assume normal, re-probed once the DB is real
    try {
      var res = db.exec("PRAGMA table_info(elements_meta)");
      var cols = (res && res.length) ? res[0].values.map(function(r) { return r[1]; }) : [];
      A._buildingCol = cols.indexOf('building') !== -1;
      if (!A._buildingCol) {
        console.log('§SINGLE_BLD_FALLBACK reason=no-building-column cols=' + JSON.stringify(cols) +
          ' name=' + A._singleBuildingName());
      }
    } catch (e) {
      console.log('§SINGLE_BLD_PROBE_ERR ' + (e && e.message));
      A._buildingCol = true;    // probe failed ⇒ do not change behaviour
    }
    return A._buildingCol;
  };
  // Derive the one building's label from the DB URL basename — LTU_AHouse_meta.db → LTU_AHouse.
  A._singleBuildingName = function() {
    var u = A.DB_URL || 'building.db';
    var base = u.split('?')[0].split('/').pop() || 'building.db';
    return base.replace(/\.db$/i, '').replace(/_(meta|geo|extracted)$/i, '') || 'building';
  };

  // Implementing CINEMA_PATH_EDITOR.md §CPE_MATERIAL_KEY — Witness: W-CPE-MATERIAL-KEY.
  // `elements_meta.material_name` is the element's own authored IFC material. It is NOT universal:
  // some older/partial DBs have no such column at all (measured: every `*_library.db` and
  // `*_geo.db`, plus deploy/buildings/LTUAHouse_extracted.db, which has no elements_meta table).
  // Selecting a missing column throws and would kill streaming outright, so probe ONCE per DB and
  // substitute a literal NULL when absent — identical shape to A._hasBuildingCol (§17.17.4).
  A._matNameCol = undefined;
  A._hasMatNameCol = function(db) {
    if (A._matNameCol !== undefined) return A._matNameCol;
    if (!db) return false;              // unknown yet — assume absent, i.e. today's behaviour
    try {
      var res = db.exec("PRAGMA table_info(elements_meta)");
      var cols = (res && res.length) ? res[0].values.map(function(r) { return r[1]; }) : [];
      A._matNameCol = cols.indexOf('material_name') !== -1;
      console.log('§MATNAME_COL present=' + A._matNameCol);
    } catch (e) {
      console.log('§MATNAME_COL_PROBE_ERR ' + (e && e.message));
      A._matNameCol = false;            // probe failed ⇒ do not change behaviour
    }
    return A._matNameCol;
  };

  A.startStreaming = function() {
    let nearest = null, nearestDist = Infinity;
    for (const [name, bc] of Object.entries(A.buildingCentres)) {
      const t = A.ifc2three(bc.ix, bc.iy, bc.iz);
      const dx = t.x - A.camera.position.x;
      const dz = t.z - A.camera.position.z;
      const d = Math.sqrt(dx*dx + dz*dz);
      if (d < nearestDist) { nearestDist = d; nearest = name; }
    }
    if (!nearest) return;
    console.log(`[S192] §DS_AUTO_START bld=${nearest} dist=${nearestDist.toFixed(0)}m`);
    A.streamBuilding(nearest);
  };

  A.streamBuilding = function(nearest) {
    if (A.buildingsRendered.has(nearest)) { console.log('§DS_SKIP_RENDERED bld=' + nearest); return; }
    if (A.activeBuilding && A.streaming && A.streamIdx < A.streamQueue.length) {
      A.savedStreams[A.activeBuilding] = { queue: A.streamQueue, idx: A.streamIdx };
    }
    A.streaming = false;

    if (A.savedStreams[nearest]) {
      A.streamQueue = A.savedStreams[nearest].queue;
      A.streamIdx = A.savedStreams[nearest].idx;
      delete A.savedStreams[nearest];
      A.streaming = true;
      A.activeBuilding = nearest;
      A.activeBuildingTotal = A.streamQueue.length;
      console.log(`[S192] §DS_RESUME bld=${nearest} at=${A.streamIdx}/${A.streamQueue.length}`);
    } else if (A._useRangeStream && A._rangeDb && !A._splitHasMeta) {
      // §S260: Async stream queue from range DB — only for single-DB range mode
      // Split mode has full metadata in sync A.db — falls through to sync path below
      A.streamQueue = [];
      A.streamIdx = 0;
      A.activeBuilding = nearest;
      A.status.textContent = 'Querying elements via streaming...';
      var _sqT0 = performance.now();
      (async function() {
        try {
          // Probe bbox columns
          if (A._hasBbox === undefined) {
            try { await A._rangeDb.exec("SELECT bbox_x FROM element_transforms LIMIT 1"); A._hasBbox = true; }
            catch(e) { A._hasBbox = false; }
          }
          // §CPE_MATERIAL_KEY: bbox slots are now ALWAYS emitted (NULL when the columns are absent)
          // so material_name can live at a FIXED slot 16 — slots 0-15 keep the §BBOX_ROW_SHIFT
          // 16-slot layout byte-for-byte, and `A._hasBbox ? r[13] : null` below still reads null.
          var bboxCols = A._hasBbox ? ', t.bbox_x, t.bbox_y, t.bbox_z' : ', NULL, NULL, NULL';
          if (A._matNameCol === undefined) {
            try { await A._rangeDb.exec("SELECT material_name FROM elements_meta LIMIT 1"); A._matNameCol = true; }
            catch(e) { A._matNameCol = false; }
            console.log('§MATNAME_COL present=' + A._matNameCol + ' path=range');
          }
          var matNameCol = A._matNameCol ? ', m.material_name' : ', NULL';
          var result = await A._rangeDb.exec(`
            SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
                   t.center_x, t.center_y, t.center_z,
                   t.rotation_x, t.rotation_y, t.rotation_z,
                   m.storey, m.ifc_class, m.element_name${bboxCols}${matNameCol}
            FROM elements_meta m
            JOIN element_instances i ON m.guid = i.guid
            JOIN element_transforms t ON t.guid = m.guid
            WHERE m.building = '${nearest.replace(/'/g,"''")}'
              AND i.geometry_hash IS NOT NULL
              AND m.ifc_class != 'IfcOpeningElement'
          `);
          var rows = (result && result.length > 0) ? result[0].values : [];
          console.log(`§RANGE_STREAM_QUEUE bld=${nearest} elements=${rows.length} ms=${(performance.now() - _sqT0).toFixed(0)}`);
          if (!rows.length) {
            console.log(`[S192] §DS_EMPTY bld=${nearest} — no streamable elements`);
            return;
          }

          // §S260: Also replicate metadata for this building into sync DB for panels etc.
          var _repT0 = performance.now();
          var _insertMeta = A.db.prepare('INSERT OR IGNORE INTO elements_meta VALUES (?,?,?,?,?)');
          var _insertTx = A.db.prepare('INSERT OR IGNORE INTO element_transforms VALUES (?,?,?,?,?,?,?)');
          var _insertInst = A.db.prepare('INSERT OR IGNORE INTO element_instances VALUES (?,?)');
          for (var ri = 0; ri < rows.length; ri++) {
            var r = rows[ri];
            // r: [guid, hash, rgba, disc, cx, cy, cz, rx, ry, rz, storey, ifcClass, elementName, bx?, by?, bz?]
            _insertMeta.run([r[0], nearest, r[10], r[3], r[11]]);
            _insertTx.run([r[0], r[4], r[5], r[6], A._hasBbox ? r[13] : null, A._hasBbox ? r[14] : null, A._hasBbox ? r[15] : null]);
            _insertInst.run([r[0], r[1]]);
          }
          _insertMeta.free(); _insertTx.free(); _insertInst.free();
          console.log(`§RANGE_LOCAL_REPLICATE bld=${nearest} rows=${rows.length} ms=${(performance.now() - _repT0).toFixed(0)}`);

          A.streamQueue = rows;
          A.streamIdx = 0;
          A._lastFlushIdx = 0;
          A._bboxCleared = false;
          A.activeBuildingTotal = rows.length;
          A._useDlodPath = false; // §S262: no bbox swap path — real geometry only, DLOD = visibility culling
          A._drawBboxPlaceholders(rows);
          A.streaming = true;
          A.status.textContent = `Streaming ${rows.length.toLocaleString()} elements...`;
          console.log(`[S192] §DS_QUEUED bld=${nearest} elements=${rows.length}`);
        } catch(e) {
          console.error(`§RANGE_STREAM_QUEUE_FAIL bld=${nearest} err=${e.message}`);
          A.status.textContent = 'Stream query failed: ' + e.message;
        }
      })();
    } else {
      A.streamQueue = [];
      A.streamIdx = 0;
      // Detect bbox columns (old DBs may not have them)
      if (A._hasBbox === undefined) {
        try { A.db.exec("SELECT bbox_x FROM element_transforms LIMIT 1"); A._hasBbox = true; }
        catch(e) { A._hasBbox = false; }
      }
      // §CPE_MATERIAL_KEY: always 3 bbox slots (NULL when absent) so material_name is at a FIXED
      // slot 16 — see the range-path comment above.
      const bboxCols = A._hasBbox ? ', t.bbox_x, t.bbox_y, t.bbox_z' : ', NULL, NULL, NULL';
      // §17.17.4 (W-OCC3-LTU): on a DB with no `building` column the predicate becomes 1=1 and the
      // bind list drops with it — every row IS this building by definition of the fallback.
      const _bldOk = A._hasBuildingCol(A.db);
      const matNameCol = A._hasMatNameCol(A.db) ? ', m.material_name' : ', NULL';
      const rows = A.dbQuery(`
        SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
               t.center_x, t.center_y, t.center_z,
               t.rotation_x, t.rotation_y, t.rotation_z,
               m.storey, m.ifc_class, m.element_name${bboxCols}${matNameCol}
        FROM elements_meta m
        JOIN element_instances i ON m.guid = i.guid
        JOIN element_transforms t ON t.guid = m.guid
        WHERE ${_bldOk ? 'm.building = ?' : '1=1'}
          AND i.geometry_hash IS NOT NULL
          AND m.ifc_class != 'IfcOpeningElement'
      `, _bldOk ? [nearest] : []);
      if (!rows.length) {
        console.log(`[S192] §DS_EMPTY bld=${nearest} — no streamable elements`);
        return;
      }
      // §S260: Sort by distance to camera — nearest elements render first
      var _camPos = A.camera.position;
      var _ox = A.modelOffset.x, _oy = A.modelOffset.y, _oz = A.modelOffset.z;
      rows.sort(function(a, b) {
        var ax = a[4] - _ox - _camPos.x, ay = a[6] - _oz - _camPos.y, az = -(a[5] - _oy) - _camPos.z;
        var bx = b[4] - _ox - _camPos.x, by = b[6] - _oz - _camPos.y, bz = -(b[5] - _oy) - _camPos.z;
        return (ax*ax + ay*ay + az*az) - (bx*bx + by*by + bz*bz);
      });
      A.streamQueue = rows;
      A.streamIdx = 0;
      A._lastFlushIdx = 0;
      A._bboxCleared = false;
      A.activeBuilding = nearest;
      A.activeBuildingTotal = A.streamQueue.length;
      A._useDlodPath = false; // §S262: no bbox swap path — real geometry only, DLOD = visibility culling
      // Draw one wireframe cube per element instantly — disappear when real meshes arrive
      A._drawBboxPlaceholders(rows);
      A.streaming = true;
      console.log(`[S192] §DS_QUEUED bld=${nearest} elements=${A.streamQueue.length} dlod=${A._useDlodPath} (sorted by camera distance)`);
    }
    document.getElementById('s-active').textContent = `${nearest}`;
    document.getElementById('s-building-total').textContent = A.activeBuildingTotal.toLocaleString();
    document.getElementById('s-progress').style.width = (A.streamIdx / A.streamQueue.length * 100).toFixed(1) + '%';
    document.getElementById('s-progress').style.background = '#4fc3f7';
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_streaming||'STREAMING {name} — {i}/{n} elements').replace('{name}',nearest).replace('{i}',A.streamIdx.toLocaleString()).replace('{n}',A.streamQueue.length.toLocaleString());
  };

  // ── S231: InstancedMesh batching ─────────────────────────────────────
  // Hashes with 2+ instances get ONE InstancedMesh (1 draw call).
  // Hashes with 1 instance stay as individual Mesh (pick/filter compatible).
  // Material dedup: one MeshStandardMaterial per unique RGBA + ifcClass.
  // ── S232: Mobile merge — single-instance meshes grouped by storey|disc|rgba ──
  // Bakes transform into vertices, concatenates buffers → ~200 draw calls on mobile.
  A._matCache = {};
  A._instanceMeta = {};  // instancedMesh.id → [{guid,storey,disc,instanceIndex}, ...]
  A._instanceGuids = {}; // guid → {meshId, instanceIndex} for reverse lookup
  A._isMobile = (navigator.maxTouchPoints > 0 && window.screen.width < 1024)
    && !new URLSearchParams(location.search).has('tm');
  // §MERGED_GUID: `?tm` has always meant "I need per-element slots" — it forced the non-merged path
  // via _isMobile back when merging was device-gated. Merging is capability-gated now, so carry the
  // same promise onto the new gate. Set once here and NOT cleared on clearStreamed: TM (which also
  // sets it) re-streams, and a re-stream that silently re-merged would defeat the whole point.
  A._forceNoMerge = new URLSearchParams(location.search).has('tm');
  A._bboxPlaceholder = null;

  // Per-element wireframe cubes, one InstancedMesh per discipline for disc-based coloring
  // §S276b: Mobile cap at 20K + chunked matrix build (yields to main thread via setTimeout)
  A._bboxPlaceholders = [];
  A._drawBboxPlaceholders = function(rows) {
    A._clearBboxPlaceholders();
    if (!rows.length) return;
    var MAX_PLACEHOLDERS = A._isMobile ? 20000 : 200000;
    // Sample evenly if building has more elements than cap
    const step = rows.length > MAX_PLACEHOLDERS ? Math.ceil(rows.length / MAX_PLACEHOLDERS) : 1;
    // row: [guid, hash, rgba, disc, cx, cy, cz, rotX, rotY, rotZ, storey, ifc_class, element_name, bbox_x, bbox_y, bbox_z]
    // §BBOX_ROW_SHIFT guard: bbox MUST sit at 13-15 (16-slot row). A 15-slot producer (pre-#839
    // layout) silently reads bbox_y/bbox_z/undefined here → squashed 0.3m-tall bars (ghost_bbxes.png).
    const byDisc = {};
    let _shortRows = 0;
    for (let i = 0; i < rows.length; i += step) {
      if (rows[i].length < 16) _shortRows++;
      const disc = rows[i][3] || '_';
      if (!byDisc[disc]) byDisc[disc] = [];
      byDisc[disc].push(rows[i]);
    }
    if (_shortRows) console.warn(`[BBOX] §BBOX_ROW_SHIFT short_rows=${_shortRows} — 15-slot rows reaching 16-slot reader, bbox misread`);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const _m4 = new THREE.Matrix4();
    const _pos = new THREE.Vector3();
    const _scl = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    var CHUNK = A._isMobile ? 5000 : 999999;  // §S276b: mobile yields every 5K matrices
    var discEntries = Object.entries(byDisc);
    var di = 0;
    function _buildNextDisc() {
      if (di >= discEntries.length) {
        var shown = Object.values(byDisc).reduce((s, a) => s + a.length, 0);
        console.log(`[BBOX] §BBOX_PLACEHOLDERS total=${rows.length} shown=${shown} step=${step} discs=${discEntries.length} mobile=${A._isMobile} short_rows=${_shortRows}`);
        return;
      }
      var disc = discEntries[di][0], drows = discEntries[di][1];
      var color = A.DISC_COLORS[disc] || A.DEFAULT_COLOR;
      var mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.4 });
      var iMesh = new THREE.InstancedMesh(geo, mat, drows.length);
      iMesh.frustumCulled = false;
      iMesh.userData.isBboxPlaceholder = true;
      A.scene.add(iMesh);
      A._bboxPlaceholders.push(iMesh);
      var ri = 0;
      function _buildChunk() {
        var end = Math.min(ri + CHUNK, drows.length);
        for (var j = ri; j < end; j++) {
          var r = drows[j];
          var p = A.ifc2three(r[4], r[5], r[6]);
          var bx = r[13] || 0.3, by = r[14] || 0.3, bz = r[15] || 0.3;
          _pos.set(p.x, p.y, p.z);
          _scl.set(bx, bz, by);
          _m4.compose(_pos, _quat, _scl);
          iMesh.setMatrixAt(j, _m4);
        }
        ri = end;
        iMesh.instanceMatrix.needsUpdate = true;
        if (A.markDirty) A.markDirty();  // §S276b: trigger render after each chunk
        if (ri < drows.length) {
          setTimeout(_buildChunk, 0);  // yield to main thread
        } else {
          di++;
          if (A._isMobile) setTimeout(_buildNextDisc, 0);
          else _buildNextDisc();
        }
      }
      _buildChunk();
    }
    _buildNextDisc();
  };

  A._clearBboxPlaceholders = function() {
    // All InstancedMeshes share one BoxGeometry — dispose it once from the first mesh only
    if (A._bboxPlaceholders.length) {
      A._bboxPlaceholders[0].geometry.dispose();
    }
    for (const iMesh of A._bboxPlaceholders) {
      A.scene.remove(iMesh);
      iMesh.material.dispose();
    }
    if (A._bboxPlaceholders.length) console.log('[BBOX] §BBOX_CLEARED');
    A._bboxPlaceholders = [];
  };


  // §ENTOURAGE (PHOTOREAL_STILL_RENDER.md, 2026-07-17 "SuperLook / advance-realism" spec, real-data
  // -first item): the Revit RPC entourage exported into some IFCs (people, deciduous trees, facade
  // logo text) all land as class IfcBuildingElementProxy with a generic cream placeholder color
  // (0.920,0.900,0.850) — the RPC exporter's default, NOT a deliberate design color, so it reads as
  // pale ghosts. This maps the real element_name → a presentation material variant. Anchored-prefix
  // match on the observed real names (RPC Male/Female/Tree, Model Text:Logo) — deterministic,
  // extracted from actual DB rows (see spec's DB census), no invented classes. Returns '' for
  // everything else so non-entourage geometry is completely untouched.
  // §RPC_M_PREFIX (2026-07-17, found via BimWhale_Advanced): some Revit exports use the metric-
  // template family prefix "M_" (M_RPC Male/Female/Beetle) instead of the bare "RPC ..." name seen
  // in Ifc4_Revit — same RPC content, different export convention. Strip a leading "M_" before the
  // anchored match so both conventions land the same variant; without this BimWhale's real RPC
  // entourage never gets the flat-exporter-grey fix.
  A._entourageVariant = function(ifcClass, name) {
    if (ifcClass !== 'IfcBuildingElementProxy' || !name) return '';
    var n = name.indexOf('M_') === 0 ? name.slice(2) : name;
    if (n.indexOf('RPC Male') === 0 || n.indexOf('RPC Female') === 0) return 'person';
    if (n.indexOf('RPC Tree') === 0) return 'tree';
    if (n.indexOf('RPC Beetle') === 0) return 'vehicle';
    if (n.indexOf('Model Text:Logo') === 0) return 'logo';
    return '';
  };

  // §MEP_DISC_TINT (2026-08-14): family-name classifier for the 3 IFC2x3 generic-MEP classes
  // (see DISC_TINT_CLASSES below). Needed because `elements_meta.discipline` is flat "MEP" for
  // ALL of HHS_Office_Federated's 3390 unassigned elements (confirmed by direct DB query) — no
  // FP/ACMV/PLB/ELEC breakdown at the discipline-column level, so a discipline-only tint would
  // just swap flat blue for flat green. The real trade IS recoverable from the authored Revit
  // family name (e.g. "M_Sprinkler...", "M_Supply Diffuser...", "Rectangular Duct"), which is
  // real BIM-authored data, not invented. Returns { code, r, g, b } sourced from EITHER an
  // existing A.DISC_COLORS hex or an existing STD_MAT preset already defined in this file/config
  // — no new colour values — or null if the name doesn't match a known family pattern (falls
  // back to the flat discipline tint below). `code` doubles as a bucket-key discriminator
  // (§S260's batch/merge buckets group by storey|disc|rgba|matVariant, none of which vary
  // between e.g. a duct and a pipe sharing the same NULL rgba + "MEP" discipline — without
  // `code` in the key, one shared BatchedMesh material would wrongly paint both the same colour).
  A._mepNameHint = function(name) {
    if (!name) return null;
    if (/duct/i.test(name)) return { code: 'DUCT', r: 0.55, g: 0.58, b: 0.55 };  // STD_MAT.IfcDuct — galvanized sheet-metal grey
    if (/sprinkler|groove|coupling|victaulic/i.test(name)) return _hexToRgb('FP', 0xcc8844); // DISC_COLORS.FP — brick/orange. Grooved/Victaulic couplings are the standard FP sprinkler-pipe joint (same trade as sprinkler heads) — were falling through to the flat blue-grey IfcFlowFitting default (user report 2026-08-15: "the nice red groove tooling joints are replaced as blue")
    if (/diffuser|grille|grill|exhaust/i.test(name)) return _hexToRgb('ACMV', 0xcc4444); // DISC_COLORS.ACMV — red, air terminals
    if (/dwv|sanitary/i.test(name)) return _hexToRgb('SAN', 0xaa44aa);           // DISC_COLORS.SAN — magenta
    if (/pipe/i.test(name)) return _hexToRgb('PLB', 0x8844cc);                  // DISC_COLORS.PLB — purple
    if (/light|sconce|pendant|lamp/i.test(name)) return _hexToRgb('ELEC', 0xcccc44); // DISC_COLORS.ELEC — yellow
    return null;
  };
  function _hexToRgb(code, hex) {
    return { code: code, r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  }

  // ── §MEP_COLOR_SURVIVES_PHOTOREAL (PHOTOREAL_STILL_RENDER.md, 2026-09-02) ────────────────────
  // Implementing PHOTOREAL_STILL_RENDER.md §MEP_COLOR_SURVIVES_PHOTOREAL — Witness: W-MEP-COLOR-PHOTOREAL.
  //
  // ⚠ THE PALETTE IS AN AUTHORED CHOICE, NOT A PUBLISHED STANDARD. There is no MEP colour convention
  // anywhere in the model data — no IfcSystem/`system` column exists on any shipped building DB, and
  // the colour columns that do exist are either one undifferentiated default or the extractor's own
  // `≈`-prefixed approximations. EXTRACTED here: `elements_meta.discipline`, `material_rgba`,
  // `material_name`, `element_name`. AUTHORED here: the discipline→hue assignment, which reuses
  // A.DISC_COLORS (config.js:43-49) VERBATIM — the same table the HUD bars, bbox placeholders,
  // city.js, measure.js and the §SUNGLASS band already paint with. NO NEW COLOUR VALUE IS INTRODUCED.
  //
  // THE MEASURED DEFECT (spec §MEP_COLOR_SURVIVES_PHOTOREAL, sat_census.log): §MEP_DISC_TINT's gate
  // `!rgbaStr` asks "does the element have a colour", but on 4 of the 5 shipped buildings 100% of MEP
  // elements DO carry one — an ACHROMATIC off-white default: Hospital `0.920,0.900,0.850` x 40,563
  // (material_name NULL), Clinic the same value x 11,712 (`≈ Off-White`), Terminal white/`Silver`.
  // The tint therefore fired only on HHS. _TRI_METAL then multiplies over that off-white
  // (`diffuseColor.rgb *= triContrasted` — the shader already tints, it does not replace) and the
  // frame reads exactly as the user described it: greyish metallic. Its second gate,
  // DISC_TINT_CLASSES, is the 3 IFC2x3 generic classes, and 0 of Hospital's 41,987 MEP elements are
  // in it (Hospital exports IFC4-style IfcPipeSegment/IfcDuctFitting/...).
  //
  // THE RULE — hue comes from the first source that HAS one; the element always keeps its own value:
  //   1a. a real authored IFC material name (not `≈`-prefixed)  -> UNTOUCHED, byte-identical
  //   1b. the element's own rgba already carries a hue (sat>=T) -> UNTOUCHED, byte-identical
  //       (this is what preserves the user's fire-red lever: Hospital IfcPipeFitting|FP|
  //        0.843,0.137,0.102 x 1,298, saturation 0.879)
  //   2.  MEP class, no authored name, colour absent or achromatic -> trade hue+saturation, the
  //       element's OWN V. Trade colour = _mepNameHint (authored Revit family name, more specific)
  //       if IT carries a hue, else A.DISC_COLORS[discipline].
  //   3.  anything else -> unchanged.
  var MEP_HUE_CLASSES = {
    // Exactly the two MEP blocks STD_MAT already delimits with its own comments ("MEP: pipes +
    // ducts", "MEP: terminals + devices") plus the IFC2x3 generic trio DISC_TINT_CLASSES named.
    // Not a new grouping — the same classes _TRI_METAL/STD_MAT already treat as MEP.
    IfcFlowSegment: 1, IfcFlowFitting: 1, IfcFlowTerminal: 1, IfcFlowController: 1,
    IfcFlowMovingDevice: 1, IfcFlowTreatmentDevice: 1, IfcFlowStorageDevice: 1, IfcFlowInstrument: 1,
    IfcEnergyConversionDevice: 1,
    IfcPipe: 1, IfcPipeSegment: 1, IfcPipeFitting: 1,
    IfcDuct: 1, IfcDuctSegment: 1, IfcDuctFitting: 1,
    IfcCableCarrier: 1, IfcCableCarrierSegment: 1, IfcCableCarrierFitting: 1,
    IfcValve: 1, IfcAirTerminal: 1, IfcLightFixture: 1, IfcSanitaryTerminal: 1,
    IfcFireSuppressionTerminal: 1, IfcElectricAppliance: 1, IfcAlarm: 1, IfcSwitchingDevice: 1,
    IfcDistributionControlElement: 1, IfcElectricDistributionPoint: 1
  };
  A._mepHueClasses = MEP_HUE_CLASSES;   // exposed for witness assertions, read-only

  // T — the achromatic threshold. NOT picked: over the tier-2-eligible population fleet-wide (MEP
  // classes, no authored material name) the distinct HSV saturations present are
  // {0.000, 0.033, 0.076, 0.100, 0.588, 0.713, 0.879, 1.000}. The widest EMPTY band is
  // 0.100 -> 0.588 (width 0.4884); T is its midpoint. Split 53,204 achromatic / 85,934 chromatic,
  // with ZERO elements within +/-0.1 of T — no element's tier depends on the third decimal.
  // Re-measured by the witness on every run (gap2.log).
  A.MEP_HUE_ACHROMATIC_MAX = 0.344;

  // ONE owner for "does this colour carry a hue". HSV saturation, the same (max-min)/max the census
  // used. Returns null when there is no colour at all — a caller must never read that as 0.
  A._chromaOf = function(rgbaStr) {
    if (!rgbaStr || rgbaStr.indexOf(',') === -1) return null;
    var p = rgbaStr.split(',').map(Number);
    if (!(p.length >= 3) || isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2])) return null;
    var mx = Math.max(p[0], p[1], p[2]), mn = Math.min(p[0], p[1], p[2]);
    return mx <= 0 ? 0 : (mx - mn) / mx;
  };
  // ONE owner for "is this a real authored IFC material name". The `≈ ` prefix is the EXTRACTOR's own
  // marker for a synthetic colour approximation — §CPE_MATERIAL_KEY established this test and it is
  // reused verbatim rather than re-derived (Hospital 6,664/6,664 approx, Terminal 48,428/48,428 real).
  A._isAuthoredMatName = function(matName) {
    return !!matName && matName.charAt(0) !== '≈';
  };
  // ONE owner for "which trade colour does this MEP element belong to" — the first source that
  // carries a hue. An achromatic source (the DUCT hint's galvanized grey, sat 0.052; DISC_COLORS.VOID
  // 0x666666, sat 0) supplies no trade hue and is passed over. Returns null when none does.
  A._mepTradeHue = function(discipline, mepHint) {
    var T = A.MEP_HUE_ACHROMATIC_MAX;
    if (mepHint) {
      var hs = A._chromaOf(mepHint.r + ',' + mepHint.g + ',' + mepHint.b);
      if (hs !== null && hs >= T) return { code: mepHint.code, r: mepHint.r, g: mepHint.g, b: mepHint.b, src: 'name-hint' };
    }
    if (discipline && A.DISC_COLORS && A.DISC_COLORS[discipline] != null) {
      var d = _hexToRgb(discipline, A.DISC_COLORS[discipline]);
      var ds = A._chromaOf(d.r + ',' + d.g + ',' + d.b);
      if (ds !== null && ds >= T) return { code: discipline, r: d.r, g: d.g, b: d.b, src: 'discipline' };
    }
    return null;
  };
  // HSV hue transfer: H and S from the trade colour, V from the element's own albedo. HSV and not
  // HSL because HSL desaturates hard as L->1 — at the off-white default's L=0.885 an HSL
  // recombination returns near-white, which is the very look being fixed. HSV keeps the chroma:
  // 0.920,0.900,0.850 under FP (0xcc8844) -> 0.920,0.613,0.306.
  function _hsvHueTransfer(trade, v) {
    var mx = Math.max(trade.r, trade.g, trade.b);
    if (mx <= 0) return { r: 0, g: 0, b: 0 };
    // Scale the trade colour so its own max channel becomes the element's V. This preserves the
    // trade colour's H and S exactly (both are ratios between channels, invariant under scaling)
    // while handing the element's own brightness to the result.
    var k = v / mx;
    return { r: trade.r * k, g: trade.g * k, b: trade.b * k };
  }

  // THE OWNER. Returns the new albedo, or null when the element must be left exactly as it is.
  // (r,g,b) is the albedo decided so far (the element's own IFC colour, or its STD_MAT class
  // default when it has none). `A._mepHueOff` is the witness RED CONTROL — it is deliberately NOT
  // part of _getMaterial's cacheKey, so a caller flipping it MUST clear A._matCache.
  A._mepDiscAlbedo = function(r, g, b, rgbaStr, ifcClass, discipline, mepHint, matName) {
    if (A._mepHueOff) return null;                                   // RED CONTROL
    if (!ifcClass || !MEP_HUE_CLASSES[ifcClass]) return null;        // tier 3 — not MEP, never touched
    if (A._isAuthoredMatName(matName)) return null;                  // tier 1a — real authored material
    var chroma = A._chromaOf(rgbaStr);
    if (chroma !== null && chroma >= A.MEP_HUE_ACHROMATIC_MAX) return null;  // tier 1b — already has a hue
    var trade = A._mepTradeHue(discipline, mepHint);
    if (!trade) return null;                                         // tier 3 — no trade hue available
    if (chroma === null) {
      // The element has no colour at all. Shipped §MEP_DISC_TINT behaviour, byte-identical: the
      // trade colour is used verbatim (HHS's 3,390 NULL rows are the whole of this population).
      return { r: trade.r, g: trade.g, b: trade.b, tier: 2, code: trade.code, src: trade.src, v: null };
    }
    var out = _hsvHueTransfer(trade, Math.max(r, g, b));
    out.tier = 2; out.code = trade.code; out.src = trade.src; out.v = Math.max(r, g, b);
    return out;
  };

  // ── §CPE_MATERIAL_KEY helpers (CINEMA_PATH_EDITOR.md, 2026-09-01) ────────────────────────────
  // Implementing CINEMA_PATH_EDITOR.md §CPE_MATERIAL_KEY — Witness: W-CPE-MATERIAL-KEY.
  // ONE owner for "is this surface transparent". §GLASS_NOT_METAL's rule (alpha<1 ⇒ never an opaque
  // wear texture) is evaluated from this and nothing else.
  A._alphaOf = function(rgbaStr) {
    if (!rgbaStr || rgbaStr.indexOf(',') === -1) return 1.0;
    var parts = rgbaStr.split(',').map(Number);
    return (parts.length >= 4 && parts[3] < 1.0) ? parts[3] : 1.0;
  };
  // ONE owner for "which triplanar texture does this element get, and WHICH KEY decided".
  // name FIRST, ifc_class as fallback, alpha guard ahead of both. Returns src ∈
  // {name, class, alpha-none, none}. `INCONCLUSIVE` when the maps have not been published yet
  // (no material has ever been built) — so a caller can never read a 0 as a real answer.
  A._triResolve = function(alpha, ifcClass, matName) {
    var byName = A._TRIPLANAR_BY_NAME, byClass = A._TRIPLANAR_MAT;
    if (!byName || !byClass) return { mat: null, src: 'INCONCLUSIVE' };
    if (alpha < 1.0) return { mat: null, src: 'alpha-none' };
    var n = (matName && byName[matName]) ? byName[matName] : null;
    if (n) return { mat: n, src: 'name' };
    var c = (ifcClass && byClass[ifcClass]) ? byClass[ifcClass] : null;
    if (c) return { mat: c, src: 'class' };
    return { mat: null, src: 'none' };
  };
  // Shipped §-log rollup, fired once at stream-complete. PRIMAL LAW 3: the log is the primary
  // evidence, so the numbers a witness asserts are emitted by the running app, not re-derived.
  // Reports NO-OP (no element resolved by name — the change did nothing on this building) and
  // VACUOUS (nothing was judged) explicitly, per PRIMAL LAW 4.
  A._triSrcTally = function() {
    var q = A.streamQueue || [];
    if (!q.length) { console.log('§TRI_SRC_TALLY VACUOUS bld=' + (A.activeBuilding || '?') + ' rows=0 — nothing judged'); return null; }
    if (!A._TRIPLANAR_BY_NAME) { console.log('§TRI_SRC_TALLY INCONCLUSIVE bld=' + (A.activeBuilding || '?') + ' — no material was ever built'); return null; }
    var bySrc = { name: 0, class: 0, 'alpha-none': 0, none: 0 };
    var namesHit = {}, named = 0, approxNamed = 0;
    for (var i = 0; i < q.length; i++) {
      var row = q[i];
      var mn = row[16] || '';
      if (mn) { named++; if (mn.charAt(0) === '≈') approxNamed++; }
      var res = A._triResolve(A._alphaOf(row[2]), row[11] || '', mn);
      bySrc[res.src] = (bySrc[res.src] || 0) + 1;
      if (res.src === 'name') namesHit[mn] = (namesHit[mn] || 0) + 1;
    }
    var distinct = Object.keys(namesHit);
    var textured = bySrc.name + bySrc['class'];
    // §SUNGLASS_TRIPLANAR_TINT (measured by the concurrent palette lane, 2026-09-01): _recolorMesh's
    // material.clone() DROPS the triplanar onBeforeCompile hook on 347/347 sampled originals, so an
    // ACTIVE palette REPLACES the texture with a flat colour rather than tinting it. This tally is
    // computed from the resolver, not from what is on screen, so a live palette cannot corrupt the
    // numbers — but a reader comparing them against the screen must know the palette state, so it is
    // stated here rather than left to be guessed. tick 0 = Off.
    var _palTick = A._ambienceTick || 0;
    var _palMeshes = (A._sunglassBackups && A._sunglassBackups.length) || 0;
    console.log('§TRI_SRC_TALLY bld=' + (A.activeBuilding || '?') + ' rows=' + q.length +
      ' palette_tick=' + _palTick + ' palette_recoloured=' + _palMeshes +
      ' named=' + named + ' approx_named=' + approxNamed +
      ' by_name=' + bySrc.name + ' by_class=' + bySrc['class'] +
      ' alpha_none=' + bySrc['alpha-none'] + ' none=' + bySrc.none +
      ' textured=' + textured + ' distinct_names_resolved=' + distinct.length +
      (bySrc.name === 0 ? ' NO-OP — no element resolved by material_name on this building' : ''));
    distinct.sort(function(x, y) { return namesHit[y] - namesHit[x]; });
    for (var d = 0; d < distinct.length; d++)
      console.log('§TRI_SRC_NAME name="' + distinct[d] + '" n=' + namesHit[distinct[d]] +
        ' tex=' + A._TRIPLANAR_BY_NAME[distinct[d]].diffuse);
    return { bySrc: bySrc, namesHit: namesHit, rows: q.length, named: named, approxNamed: approxNamed };
  };

  // §MEP_COLOR_SURVIVES_PHOTOREAL — shipped §-log rollup, fired once at stream-complete alongside
  // §TRI_SRC_TALLY. PRIMAL LAW 3: the numbers a witness asserts are emitted by the running app.
  // Computed over the REAL stream queue through the REAL owner (A._mepDiscAlbedo), element by
  // element — not from the material cache, which counts materials, and not re-derived.
  // PRIMAL LAW 4: reports VACUOUS (nothing judged), NO-OP (the rule moved no element) and
  // INCONCLUSIVE (the owner is not published) explicitly, and never prints a bare 0 as an answer.
  A._mepHueRollup = function() {
    var q = A.streamQueue || [];
    var bld = A.activeBuilding || '?';
    if (!q.length) { console.log('§MEP_HUE_TALLY VACUOUS bld=' + bld + ' rows=0 — nothing judged'); return null; }
    if (!A._mepDiscAlbedo) { console.log('§MEP_HUE_TALLY INCONCLUSIVE bld=' + bld + ' — owner not published'); return null; }
    var mepPop = 0, tinted = 0, tier1name = 0, tier1chroma = 0, noTrade = 0;
    var hues = {}, codes = {}, minGapDist = 1, tConsulted = 0;
    for (var i = 0; i < q.length; i++) {
      var row = q[i], cls = row[11] || '';
      if (!A._mepHueClasses[cls]) continue;
      mepPop++;
      var rgba = row[2], disc = row[3] || '', nm = row[16] || '';
      var chroma = A._chromaOf(rgba);
      if (A._isAuthoredMatName(nm)) { tier1name++; continue; }
      // min_dist_to_T is measured ONLY over the population that actually CONSULTS T. An element
      // with a real authored material name is settled at tier 1a before T is ever read, so folding
      // its saturation in here would report a knife-edge that no decision depends on (Terminal's
      // `Rastelli … Brass - Bronze`, sat 0.314, is 0.030 from T and never once compared against it).
      if (chroma !== null) { tConsulted++; minGapDist = Math.min(minGapDist, Math.abs(chroma - A.MEP_HUE_ACHROMATIC_MAX)); }
      if (chroma !== null && chroma >= A.MEP_HUE_ACHROMATIC_MAX) { tier1chroma++; continue; }
      // Reproduce the element's pre-tint albedo exactly as _getMaterial derives it, so the V handed
      // to the hue transfer is the real one and not an approximation.
      var r0 = 0.7, g0 = 0.7, b0 = 0.7;
      if (rgba && rgba.indexOf(',') !== -1) { var p = rgba.split(',').map(Number); r0 = p[0]; g0 = p[1]; b0 = p[2]; }
      var alb = A._mepDiscAlbedo(r0, g0, b0, rgba, cls, disc, A._mepNameHint(row[12]), nm);
      if (!alb) { noTrade++; continue; }
      tinted++;
      codes[alb.code] = (codes[alb.code] || 0) + 1;
      // Hue is what is COUNTED (the ask is "distinct hues", not distinct RGB values — V varies per
      // element by design). Quantised to 0.1 degree so float noise cannot inflate the count.
      var mx = Math.max(alb.r, alb.g, alb.b), mn = Math.min(alb.r, alb.g, alb.b), h = 0;
      if (mx > mn) {
        if (mx === alb.r) h = 60 * (((alb.g - alb.b) / (mx - mn)) % 6);
        else if (mx === alb.g) h = 60 * ((alb.b - alb.r) / (mx - mn) + 2);
        else h = 60 * ((alb.r - alb.g) / (mx - mn) + 4);
        if (h < 0) h += 360;
      }
      hues[h.toFixed(1)] = (hues[h.toFixed(1)] || 0) + 1;
    }
    var nHues = Object.keys(hues).length;
    var legendSize = Object.keys(A.DISC_COLORS || {}).length;
    if (!mepPop) { console.log('§MEP_HUE_TALLY VACUOUS bld=' + bld + ' rows=' + q.length + ' mep_elements=0 — this building has no MEP class in MEP_HUE_CLASSES, its 0 means nothing'); return null; }
    console.log('§MEP_HUE_TALLY bld=' + bld + ' rows=' + q.length + ' mep_elements=' + mepPop +
      ' tinted=' + tinted + ' tier1_authored_name=' + tier1name + ' tier1_own_hue=' + tier1chroma +
      ' no_trade_hue=' + noTrade + ' distinct_hues=' + nHues + ' trade_codes=' + Object.keys(codes).length +
      ' legend_ceiling=' + legendSize + ' T=' + A.MEP_HUE_ACHROMATIC_MAX +
      ' inst_mep_uniform=' + (A._instMepUniform || 0) + ' inst_mep_mixed=' + (A._instMepMixed || 0) +
      ' consulted_T=' + tConsulted +
      ' min_dist_to_T=' + (tConsulted ? minGapDist.toFixed(4) : 'VACUOUS') +
      ' hue_off=' + (A._mepHueOff ? 1 : 0) +
      (tinted === 0 ? ' NO-OP — the rule moved no element on this building' : ''));
    Object.keys(codes).sort(function(x, y) { return codes[y] - codes[x]; }).forEach(function(c) {
      console.log('§MEP_HUE_CODE bld=' + bld + ' code=' + c + ' n=' + codes[c]);
    });
    return { mepPop: mepPop, tinted: tinted, tier1name: tier1name, tier1chroma: tier1chroma,
             noTrade: noTrade, hues: hues, codes: codes, legendSize: legendSize,
             minGapDist: minGapDist, tConsulted: tConsulted,
             instMepUniform: A._instMepUniform || 0, instMepMixed: A._instMepMixed || 0 };
  };

  // §CPE_MATERIAL_KEY: `matName` = elements_meta.material_name for this bucket. Measured on
  // Terminal/Hospital/Clinic: material_name is fully determined by (storey, discipline,
  // material_rgba), so adding it to the batch key would add ZERO buckets (244→244, 160→160, 65→65)
  // — every bucket therefore carries exactly ONE name and taking items[0]'s is exact, not an
  // approximation (unlike `batchCls`, which really is items[0]'s of a possibly mixed-class bucket).
  // §WALL_SIDE (2026-09-01, PHOTOREAL_STILL_RENDER.md §WALL_SIDE_AND_LIGHT_FLOOR): class-keyed
  // material side, derived from the fleet winding census (§WALL_WINDING_MEASURE + this session's
  // per-class re-census, census_{Terminal,Hospital}.log): a class is FrontSide iff its pooled
  // (sheet + mixed-winding + inverted + open-negative) fraction is <= 2.0% of elements-with-
  // geometry across both measured buildings, population >= 30 (T1). Sheet-heavy classes measured
  // ABOVE T1 keep DoubleSide because a one-sided sheet is invisible from one side under FrontSide
  // regardless of winding: IfcPipeFitting 20.4%, IfcDuctFitting 14.9%, IfcBuildingElementProxy
  // 16.4% (and 18.9% of Hospital's drawn triangles), IfcWindow 32.7%, IfcDoor 2.1%,
  // IfcFlowTerminal 5.1%, IfcFlowController/IfcController/IfcRampFlight/IfcRoof under population.
  // Unlisted classes default DoubleSide (conservative). `side` is a pure function of
  // (ifcClass, a<1.0) and ifcClass is already a cacheKey dimension below -> cannot fragment the
  // material cache (asserted by witness_wall_side_light_floor.js M1).
  // §WALL_SIDE_PICK_GATE: IfcLightFixture was in the census-derived list (0% winding defect,
  // 2,086 elements) but is WITHDRAWN by the S3 pick witness: a ray whose origin sits inside a
  // recessed fixture shell (M_Plain Recessed Lighting Fixture 600x600, Hospital ray
  // out|IfcElectricAppliance|1cL9Mv$oTAD8jv7e2bmYul) first-hit the fixture's own interior back
  // face under DoubleSide; FrontSide culls that self-hit and resolves to the diffuser beyond it.
  // The gate is mechanical: any first-hit divergence drops the class (§WWSLF_PICK_DIVERGE line,
  // wwslf_assert.log 2026-09-01). Winding did not fail here — pick behaviour did.
  var FRONT_SIDE_CLASSES = {
    IfcAirTerminal: 1, IfcAlarm: 1, IfcBeam: 1, IfcCableCarrierFitting: 1,
    IfcCableCarrierSegment: 1, IfcColumn: 1, IfcCovering: 1, IfcDistributionControlElement: 1,
    IfcDuctSegment: 1, IfcElectricAppliance: 1, IfcFireSuppressionTerminal: 1, IfcFooting: 1,
    IfcFurniture: 1, IfcMember: 1, IfcPipeSegment: 1, IfcPlate: 1,
    IfcRailing: 1, IfcSlab: 1, IfcStair: 1, IfcStairFlight: 1, IfcSwitchingDevice: 1,
    IfcValve: 1, IfcWall: 1, IfcWallStandardCase: 1
  };
  A._frontSideClasses = FRONT_SIDE_CLASSES; // exposed for witness assertions, read-only

  // §MEP_COLOR_SURVIVES_PHOTOREAL: `noMepHue` suppresses the trade-hue tier for THIS material.
  // Its one caller is the InstancedMesh branch, which buckets by GEOMETRY HASH ALONE and can
  // therefore hand one material to a set that is not uniform on MEP-ness — see the guard there.
  A._getMaterial = function(rgbaStr, ifcClass, matVariant, discipline, mepHint, matName, noMepHue) {
    // §S265: Standard reference materials — real-world color + roughness + metalness per IFC class.
    // Applied when IFC author assigned no material (NULL or monochrome grey).
    // Does NOT modify the DB — runtime only.
    var STD_MAT = {
      // ── Structure: concrete + steel ──
      IfcWall:                { r: 0.85, g: 0.82, b: 0.78, rough: 0.85, metal: 0.00 },  // concrete/plaster
      IfcWallStandardCase:    { r: 0.92, g: 0.91, b: 0.88, rough: 0.75, metal: 0.00 },  // painted plaster
      IfcSlab:                { r: 0.72, g: 0.70, b: 0.68, rough: 0.90, metal: 0.00 },  // cast concrete
      IfcColumn:              { r: 0.65, g: 0.64, b: 0.62, rough: 0.80, metal: 0.05 },  // reinforced concrete
      // §HOSPITAL_BLUE_TINT (2026-08-14 session 2, CINEMA_DISCIPLINE_REVEAL.md): these 3 + IfcRailing
      // below are the 4 highest `metal` values in this whole table — envInt overrides the global
      // envMapIntensity=0.6 (streaming.js _getMaterial, below) down to 0.18 for JUST these 4 classes.
      // Measured+analytically confirmed root cause: the sky's own PMREM-reflected colour is strongly,
      // legitimately blue (A.updateSky(45,180) + Sky.js's configured rayleigh=2/turbidity=4 — computed
      // directly from that formula, zenith sat=0.767; live-rendered probe at these classes' own
      // roughness/reflection angle: sat=0.141), and these classes' unusually high metalness (0.55-0.70,
      // vs 0.35-0.50 for every other reflective MEP/steel class in this table) lets that real sky
      // colour dominate the final hue over the REAL, correctly-trusted IFC albedo underneath (never
      // touched here — only the reflection strength is dialled back for these classes).
      IfcBeam:                { r: 0.55, g: 0.57, b: 0.60, rough: 0.35, metal: 0.65, envInt: 0 },  // steel I-beam — zero sky reflection, user 2026-08-15: "get rid of those railings and overhead beams from been recolorized"
      IfcMember:              { r: 0.50, g: 0.52, b: 0.55, rough: 0.40, metal: 0.60, envInt: 0.05 },  // steel section
      IfcPlate:               { r: 0.48, g: 0.50, b: 0.53, rough: 0.30, metal: 0.70, envInt: 0.05 },  // steel plate
      IfcFooting:             { r: 0.60, g: 0.58, b: 0.56, rough: 0.95, metal: 0.00 },  // foundation
      IfcPile:                { r: 0.58, g: 0.56, b: 0.54, rough: 0.95, metal: 0.00 },  // deep foundation
      // ── Envelope ──
      IfcRoof:                { r: 0.62, g: 0.38, b: 0.28, rough: 0.75, metal: 0.00 },  // clay tile
      IfcCovering:            { r: 0.90, g: 0.88, b: 0.84, rough: 0.70, metal: 0.00 },  // plasterboard
      IfcCurtainWall:         { r: 0.60, g: 0.75, b: 0.82, rough: 0.08, metal: 0.10 },  // glass facade
      // ── Openings ──
      IfcDoor:                { r: 0.55, g: 0.35, b: 0.18, rough: 0.65, metal: 0.00 },  // timber
      IfcWindow:              { r: 0.70, g: 0.82, b: 0.88, rough: 0.05, metal: 0.00 },  // glass
      // ── Circulation ──
      IfcStair:               { r: 0.68, g: 0.66, b: 0.63, rough: 0.80, metal: 0.00 },  // concrete/stone
      IfcRailing:             { r: 0.50, g: 0.49, b: 0.47, rough: 0.35, metal: 0.55, envInt: 0 },  // brushed-steel warm grey — zero sky reflection, user 2026-08-15: "get rid of those railings and overhead beams from been recolorized"
      IfcRamp:                { r: 0.70, g: 0.68, b: 0.65, rough: 0.85, metal: 0.00 },  // concrete ramp
      // ── Furniture/fittings ──
      IfcFurniture:           { r: 0.65, g: 0.48, b: 0.32, rough: 0.60, metal: 0.00 },  // wood/fabric
      IfcFurnishingElement:   { r: 0.65, g: 0.48, b: 0.32, rough: 0.60, metal: 0.00 },  // wood/fabric
      // ── MEP: pipes + ducts ──
      // §PIPE_DUCT_BLUE_TINT (2026-08-15, same mechanism as §HOSPITAL_BLUE_TINT above, just never
      // applied to this block): none of these 7 classes had an envInt override, so they all sat on
      // the GLOBAL default 0.6 — which _reassertPhotoMatBoost then tripled to 1.8 during Alt+S/Alt+G,
      // 10x higher than the beam/railing classes' already-tuned 0.18. User report 2026-08-15: "the
      // piping, from nice grey become all bluish." Same fix, same value, extended to this block.
      IfcPipe:                { r: 0.60, g: 0.62, b: 0.65, rough: 0.40, metal: 0.45, envInt: 0.05 },  // galvanized
      IfcPipeFitting:         { r: 0.58, g: 0.60, b: 0.63, rough: 0.40, metal: 0.45, envInt: 0.05 },
      IfcPipeSegment:         { r: 0.58, g: 0.60, b: 0.63, rough: 0.40, metal: 0.45, envInt: 0.05 },
      IfcDuct:                { r: 0.55, g: 0.58, b: 0.55, rough: 0.45, metal: 0.40, envInt: 0.05 },  // sheet metal
      IfcDuctFitting:         { r: 0.53, g: 0.56, b: 0.53, rough: 0.45, metal: 0.40, envInt: 0.05 },
      IfcDuctSegment:         { r: 0.53, g: 0.56, b: 0.53, rough: 0.45, metal: 0.40, envInt: 0.05 },
      IfcCableCarrier:        { r: 0.50, g: 0.52, b: 0.48, rough: 0.50, metal: 0.35, envInt: 0.05 },
      // ── MEP: terminals + devices ──
      // These 3 are DISC_TINT_CLASSES (below) — when null, they get swapped to a real trade colour
      // (orange/red/purple/etc, not this flat blue-grey). envInt keeps that trade colour from being
      // blue-washed by the Alt+S reflection boost same as the pipe/duct block above.
      IfcFlowTerminal:        { r: 0.45, g: 0.50, b: 0.55, rough: 0.40, metal: 0.30, envInt: 0.05 },
      IfcFlowSegment:         { r: 0.48, g: 0.52, b: 0.58, rough: 0.40, metal: 0.30, envInt: 0.05 },
      IfcFlowFitting:         { r: 0.50, g: 0.53, b: 0.57, rough: 0.40, metal: 0.30, envInt: 0.05 },
      IfcFlowController:      { r: 0.80, g: 0.30, b: 0.25, rough: 0.50, metal: 0.20 , envInt: 0.05 },  // red valve
      IfcFlowMovingDevice:    { r: 0.50, g: 0.60, b: 0.55, rough: 0.45, metal: 0.30 , envInt: 0.05 },
      IfcFlowTreatmentDevice: { r: 0.50, g: 0.58, b: 0.55, rough: 0.50, metal: 0.20 , envInt: 0.05 },
      IfcEnergyConversionDevice: { r: 0.45, g: 0.55, b: 0.50, rough: 0.50, metal: 0.25 , envInt: 0.05 },
      IfcLightFixture:        { r: 0.80, g: 0.75, b: 0.50, rough: 0.25, metal: 0.30 , envInt: 0.05 },  // brass/chrome
      IfcSanitaryTerminal:    { r: 0.88, g: 0.88, b: 0.85, rough: 0.15, metal: 0.05 , envInt: 0.05 },  // ceramic
      IfcAirTerminal:         { r: 0.55, g: 0.65, b: 0.70, rough: 0.40, metal: 0.30 , envInt: 0.05 },
      IfcFireSuppressionTerminal: { r: 0.80, g: 0.30, b: 0.25, rough: 0.50, metal: 0.30 , envInt: 0.05 }, // red
      IfcValve:               { r: 0.55, g: 0.50, b: 0.45, rough: 0.40, metal: 0.45 , envInt: 0.05 },
      IfcAlarm:               { r: 0.75, g: 0.25, b: 0.25, rough: 0.50, metal: 0.20 , envInt: 0.05 },  // red
      IfcElectricAppliance:   { r: 0.60, g: 0.65, b: 0.55, rough: 0.50, metal: 0.15 , envInt: 0.05 },
      // ── Proxy/other ──
      IfcBuildingElementProxy:{ r: 0.00, g: 0.78, b: 0.78, rough: 0.50, metal: 0.10 , envInt: 0.05 },  // teal
      IfcTransportElement:    { r: 0.50, g: 0.50, b: 0.55, rough: 0.40, metal: 0.50 , envInt: 0.05 },  // elevator
    };

    // §MEP_DISC_TINT's class gate WAS `{IfcFlowSegment, IfcFlowFitting, IfcFlowTerminal}` — the 3
    // IFC2x3 generic-MEP classes, confirmed by direct DB query (HHS_Office_Federated:
    // 1381+1284+725=3390, exactly its whole NULL-material MEP count). §MEP_COLOR_SURVIVES_PHOTOREAL
    // (2026-09-02) RETIRED that variable: it excluded the IFC4-style classes Hospital/Terminal/LTU
    // actually export, so 0 of Hospital's 41,987 MEP elements were ever eligible. The class set now
    // lives in MEP_HUE_CLASSES (top of this file, next to _mepNameHint) and the ownership question
    // "does this element get a trade hue" has ONE answer there. The old rule's caution — do not
    // overwrite a class that already carries a distinct, correct colour (red valve, greenish
    // device) — is PRESERVED and generalised: that caution is now tier 1b (an albedo that already
    // carries a hue is never touched), applied per ELEMENT instead of per class.

    // §TRIPLANAR: real PBR texture, still-render-only (PHOTOREAL_STILL_RENDER.md §LAYER 3).
    // World-space triplanar sampling — needs no UV data (IFC extraction has none). Gated at
    // RUNTIME by uTriActive (flipped every frame by each material's own onBeforeRender, reading
    // A._stillRefineActive — see §TRIPLANAR_RECOMPILE_FIX below), not at compile time — a uniform
    // branch costs ~nothing when false, so normal navigation pays no per-fragment triplanar cost.
    // Two maps only (diffuse + roughness). Concrete verified first per spec (real bug found+fixed
    // — see PHOTOREAL_STILL_RENDER.md §SESSION RECORD); plaster+metal now wired on the same proven
    // pattern. Class → texture-group assignment matches STD_MAT's own real-world-material comments
    // above (e.g. IfcSlab "cast concrete", IfcCovering "plasterboard") — not invented groupings.
    // §TRIPLANAR_CONTRAST (resume-brief item 2, user verbatim: "surface material of metal,
    // concrete are all not evident enough"). normFactor above only re-centers the texture's
    // AVERAGE luminance to ~1.0 (so the multiply-blend doesn't darken/brighten the base IFC
    // color on average) — it does NOT change how much the texture varies AROUND that average,
    // and diffuse photo textures tend to have fairly subtle local variance to begin with, which
    // reads as a near-flat wash once multiplied against a mid-grey base color. contrastBoost
    // expands each texture's deviation from the 1.0 average before the multiply (see the
    // `(triDiffuse - 1.0) * uTriContrast + 1.0` shader line below) — same average brightness,
    // more visible grain/streak. Metal gets the strongest boost (brushed-streak highlights are
    // the most visually distinctive of the three); concrete/plaster more modest.
    // §TRIPLANAR_CAST_FIX (2026-08-15, real bug found+fixed — PHOTOREAL_STILL_RENDER.md
    // §HOSPITAL_META_DB_STALE resume block): normFactor above was always a single scalar
    // (1/overall-luminance), which only re-centers BRIGHTNESS — it silently preserves any
    // per-channel colour cast the source texture already has, and contrastBoost then AMPLIFIES
    // that cast along with the intended grain (same formula, `(value-1.0)*boost+1.0` doesn't
    // distinguish "real grain" from "systematic tint"). Measured directly
    // (`textures/materials/*_color_1k.jpg`, mean RGB, 1024x1024): concrete is exactly
    // grayscale (R=G=B=0.7228, no cast, scalar factor is exact and correct, untouched here).
    // plaster is 2% off (0.7448/0.7477/0.7324, essentially neutral). metal is NOT: mean RGB
    // (0.4901, 0.5353, 0.5784) — B is 18% above R — a real, systematic blue-grey cast, not
    // grain, and metal's contrastBoost (1.9, the strongest of the 3 groups) was amplifying it
    // on every metal-class element (IfcBeam/Railing/Pipe*/Duct*/CableCarrier*/Flow*) during
    // Alt+S/Alt+G, independent of and in addition to that element's own real IFC colour —
    // this is why a correctly red-albedo pipe fitting or cream-albedo beam read cooler/greyer
    // specifically when staged, never in plain nav (uTriActive gates it to staging only).
    // Fix: normFactorRGB is the PER-CHANNEL inverse mean (removes the cast entirely, each
    // channel now genuinely centres at 1.0) instead of a single scalar broadcast to all three.
    // §TRINORM_LINEAR (2026-08-16 — PHOTOREAL_STILL_RENDER.md §ONGOING_TINT root cause): every
    // normFactor above (scalar AND per-channel) was derived from the JPG's raw sRGB byte means,
    // but the shader multiply happens in LINEAR light — these textures are flagged
    // SRGBColorSpace, so the GPU decodes them BEFORE texture2D() returns. In linear space the
    // real means are far lower (metal 0.205/0.248/0.294, not 0.490/0.535/0.578), so the sRGB-
    // derived factors under-normalize ~2.0-2.4x: the "centred at 1.0" product actually centred
    // at ~0.42-0.53, and the contrast line `(x-1.0)*boost+1.0` then clamps every texel below
    // 1-1/boost to LITERAL ZERO (metal boost 1.9 → 41% of texels → multiply-by-0 → pure-black
    // pixels on every metal-class element under Alt+S, with a blue-dominant residue on the rest
    // because the R factor over-crushes red hardest — the reported "bluish, darker" piping and
    // the black valve pixels are both exactly this). normFactorRGB below is now the inverse of
    // the LINEAR mean (sRGB-decoded before averaging); measured multiply now centres at 1.000
    // per channel with 0.00% of texels clamping to zero, at unchanged contrastBoost.
    var _TRI_CONCRETE = {
      diffuse: 'textures/materials/concrete_color_1k.jpg',
      roughness: 'textures/materials/concrete_rough_1k.jpg',
      normal: 'textures/materials/concrete_normal_1k.jpg',   // §TRIPLANAR_NORMAL
      tileMeters: 2.5,     // world units per texture repeat
      normFactorRGB: [2.0755, 2.0755, 2.0755],  // §TRINORM_LINEAR — inverse LINEAR mean (grayscale tex)
      contrastBoost: 1.6
    };
    var _TRI_PLASTER = {
      diffuse: 'textures/materials/plaster_color_1k.jpg',
      roughness: 'textures/materials/plaster_rough_1k.jpg',
      normal: 'textures/materials/plaster_normal_1k.jpg',   // §TRIPLANAR_NORMAL
      tileMeters: 2.0,
      normFactorRGB: [1.9428, 1.9262, 2.0172],  // §TRINORM_LINEAR — inverse LINEAR mean per channel
      contrastBoost: 1.5
    };
    var _TRI_METAL = {
      diffuse: 'textures/materials/metal_color_1k.jpg',
      roughness: 'textures/materials/metal_rough_1k.jpg',
      normal: 'textures/materials/metal_normal_1k.jpg',   // §TRIPLANAR_NORMAL
      tileMeters: 0.6,     // finer tile — railings/pipes/ducts are thin members
      normFactorRGB: [4.8763, 4.0250, 3.3988],  // §TRINORM_LINEAR — inverse LINEAR mean per channel
      contrastBoost: 1.9
    };
    var TRIPLANAR_MAT = {
      // ── Concrete (STD_MAT: "concrete/plaster", "cast concrete", "reinforced concrete", ...) ──
      IfcWall: _TRI_CONCRETE,
      IfcSlab: _TRI_CONCRETE,
      IfcColumn: _TRI_CONCRETE,
      IfcFooting: _TRI_CONCRETE,
      IfcStair: _TRI_CONCRETE,
      IfcStairFlight: _TRI_CONCRETE,
      // ── Plaster (STD_MAT: "painted plaster", "plasterboard") ──
      IfcWallStandardCase: _TRI_PLASTER,
      IfcCovering: _TRI_PLASTER,
      // ── Metal (STD_MAT: metal > 0.3 — steel structure, railings, MEP) ──
      IfcBeam: _TRI_METAL,
      IfcMember: _TRI_METAL,
      IfcPlate: _TRI_METAL,
      IfcRailing: _TRI_METAL,
      IfcPipeFitting: _TRI_METAL,
      IfcPipeSegment: _TRI_METAL,
      IfcDuctFitting: _TRI_METAL,
      IfcDuctSegment: _TRI_METAL,
      IfcCableCarrierSegment: _TRI_METAL,
      IfcCableCarrierFitting: _TRI_METAL,
      // ── IFC2x3 generic-MEP convention (Clinic/LTU/HHS export these instead of the above) ──
      IfcFlowSegment: _TRI_METAL,
      IfcFlowTerminal: _TRI_METAL,
      IfcFlowFitting: _TRI_METAL,
      // §TRIPLANAR_MEP_GAPS (PHOTOREAL_STILL_RENDER.md ▶RESUME item 2, user: "it replaces
      // selectively in some piping but not exactly similar next to it"). Real MEP runs mix inline
      // devices (valves/dampers/pumps/gauges) between segments/fittings — those classes carried no
      // triplanar entry, so an untextured device sitting between two grain-streaked pipe/duct
      // segments on the SAME run read flat/plain right next to its textured neighbours, exactly the
      // "selective" symptom. IfcValve found the same way as the other 4 (STD_MAT metal>0.3, same as
      // the group comment above) but had no triplanar entry either — Terminal alone carries 111 of
      // them, a real gap, not a hypothetical one; confirmed via elements_meta counts before adding
      // (Clinic: IfcFlowController 369, IfcFlowMovingDevice 13, IfcFlowStorageDevice 1; Terminal:
      // IfcFlowController 21, IfcValve 111). IfcFlowInstrument has zero real occurrences in any
      // building checked but is added anyway for schema completeness, same as its siblings.
      IfcFlowController: _TRI_METAL,
      IfcFlowMovingDevice: _TRI_METAL,
      IfcFlowInstrument: _TRI_METAL,
      IfcFlowStorageDevice: _TRI_METAL,
      IfcValve: _TRI_METAL
    };

    // §CPE_MATERIAL_KEY (CINEMA_PATH_EDITOR.md, 2026-09-01) — the element's OWN authored IFC
    // material name, consulted BEFORE its ifc_class. Same defect family as §GLASS_NOT_METAL: the
    // class alone was deciding a question the element itself already answers. Terminal carries
    // material_name on 48,428/48,428 elements (41 distinct, 0 of them the synthetic `≈ ` colour
    // labels Hospital/Clinic/HHS carry) — none of it was reaching this function.
    //
    // GROUNDING RULES, so this stays presentation-authoring and not invention:
    //  1. Only the THREE texture sets that already exist in viewer/textures/materials/ are used.
    //     No new asset is introduced; a name whose substance has no texture stays unmapped.
    //  2. A key is a name that DENOTES A MATERIAL SUBSTANCE. Component names ("Seat Base", "Fin"),
    //     colour words ("Red", "Grigio"), placeholders ("Default", "<Unnamed>") and Revit TYPE
    //     names are not materials and are deliberately absent.
    //  3. Absent ⇒ fall through to TRIPLANAR_MAT[ifcClass] ⇒ byte-identical to today.
    //
    // The trap this map is shaped around, measured on Terminal_meta.db:
    // `Basic Wall:A_Wall_Ext_150mm_BrickPlaster_V1` covers 7,714 elements but only 327 (4.2%) are
    // IfcWall — it is a wall-TYPE name leaked onto elements hosted in that wall (IfcPipeFitting
    // 4,243, IfcDuctFitting 713, IfcDuctSegment 568, IfcLightFixture 486, IfcAirTerminal 286…).
    // Keying it to plaster would strip metal off 5,892 MEP elements that §TRIPLANAR_MEP_GAPS
    // deliberately textured. It is NOT a material name, so it is NOT here.
    var TRIPLANAR_BY_NAME = {
      // ── Metal ── (Terminal counts in comments; substance is in the name itself)
      'Metal Deck': _TRI_METAL,                                   // 33,756
      'Silver': _TRI_METAL,                                       //  4,263
      'Copper': _TRI_METAL,                                       //  1,169
      'Aluminum': _TRI_METAL,                                     //    256
      'Steel, Paint Finish, Ivory, Glossy': _TRI_METAL,           //    157
      'Rastelli Rubinetterie - Metal - Brass - Bronze': _TRI_METAL, //   41
      'Metal - Steel, Polished': _TRI_METAL,                      //     24
      'Door Handle - Aluminium': _TRI_METAL,                      //      9
      'Metal - Generic - Black Finish': _TRI_METAL,               //      4
      'Metal Panel': _TRI_METAL,                                  //      2
      'Steel - Zurn Industries - Stainless - Type 304': _TRI_METAL, //     1
      'Metal-WATTS-ASTM A-536 Ductile Iron-Blue': _TRI_METAL,     //      1
      'Metal - IEC - Steel': _TRI_METAL,                          //      1
      // ── Concrete ──
      'Concrete - Cast-in-Place Concrete - 45 MPa': _TRI_CONCRETE, //   448
      'Concrete, C12/15': _TRI_CONCRETE,                          //      1
      // ── Plaster / board finishes (the JKR ceiling family) ──
      'jkrAR_clg-f_(pv60)-3 600mm x 600mm PVC Laminated Gypsum Board': _TRI_PLASTER,      // 34
      'jkrAR_clg-f_(cf60)-3 1220 x 1220 x 4.5mm Papan simen gentian': _TRI_PLASTER,       // 22
      'jkrAR_clg-f_(pv60)-3 600mm x 1200mm PVC Laminated Gypsum Board(1)': _TRI_PLASTER,  // 15
      'jkrAR_clg-f_(sk)-2 Skim Coat Plastering': _TRI_PLASTER                             // 11
    };
    // §CPE_MATERIAL_KEY: publish the SAME two objects (not copies) so the rollup below and any
    // witness resolve through one implementation instead of re-deriving the rule. Ownership rule,
    // CLAUDE.md §PRIMAL LAW 0: one owner per question.
    A._TRIPLANAR_MAT = TRIPLANAR_MAT;
    A._TRIPLANAR_BY_NAME = TRIPLANAR_BY_NAME;

    const key = rgbaStr || '_default';
    // §CPE_MATERIAL_KEY: matName joins the cache key (two elements with the same rgba+class but
    // different authored materials must not share one material object). It is appended LAST so the
    // `rgba|class` prefix every existing reader uses (witness_glass_not_metal, effects.js) is
    // untouched, and its `Ifc` is de-capitalised because time_machine.js:2485 decides night-glow by
    // `_mk.indexOf('IfcWindow') >= 0` — a SUBSTRING scan of the whole composite key. An authored
    // material literally containing an Ifc class name would otherwise silently join the bloom set.
    // Case-only change: the key stays readable, and the real name lives in mat.userData._matName.
    var cacheKey = key + '|' + (ifcClass || '') + '|' + (matVariant || '') + '|' + (discipline || '') + '|' + (mepHint ? mepHint.code : '') + '|' + (matName || '').replace(/Ifc/g, 'ifc')
      + (noMepHue ? '|noMepHue' : '');   // §MEP_COLOR_SURVIVES_PHOTOREAL — a suppressed material must never be served from the un-suppressed entry
    if (A._matCache[cacheKey]) return A._matCache[cacheKey];
    let r = 0.7, g = 0.7, b = 0.7, a = 1.0;
    if (rgbaStr && rgbaStr.includes(',')) {
      const parts = rgbaStr.split(',').map(Number);
      r = parts[0]; g = parts[1]; b = parts[2];
    }
    a = A._alphaOf(rgbaStr);   // §CPE_MATERIAL_KEY: one owner for "is this surface transparent"
    // §S265c: Trust IFC data. Only NULL (no color assigned) gets class fallback.
    // For grey buildings (Terminal/LTU), user applies Sunglasses slider on demand.
    var stdMat = (ifcClass && STD_MAT[ifcClass]) ? STD_MAT[ifcClass] : null;
    if (!rgbaStr && stdMat) {
      r = stdMat.r; g = stdMat.g; b = stdMat.b;
      // §MEP_DISC_TINT (2026-08-14, CINEMA_DISCIPLINE_REVEAL.md §Findings): IFC2x3's 3 generic
      // flow classes carry no trade info in the class name, so fire/plumbing/HVAC/etc all fell
      // into one identical flat blue-grey metal look when unassigned (confirmed: HHS's whole MEP
      // discipline, 3390/3399 elements, NULL material_rgba, all landing here). Swap the flat
      // fallback hue for the real trade colour outright (full replace, not a wash — user's
      // explicit call: "replace color for color", not a blend). Roughness/metalness stay from
      // STD_MAT, so the metallic PBR read is unchanged, only the hue moves.
      // §MEP_COLOR_SURVIVES_PHOTOREAL: DISC_TINT_CLASSES' narrow 3-class gate is subsumed by
      // A._mepDiscAlbedo below — which is reached from BOTH the has-rgba and the no-rgba path, and
      // covers every MEP class STD_MAT already lists, not just the IFC2x3 generic trio. The
      // no-rgba branch of that owner returns the trade colour VERBATIM, so this path is preserved
      // byte-identically for the one building it ever fired on (HHS, 3,390 NULL rows).
    }
    // §MEP_COLOR_SURVIVES_PHOTOREAL (2026-09-02, PHOTOREAL_STILL_RENDER.md): ONE owner decides
    // whether an MEP element's albedo gains a trade hue, and which. It is called on EVERY element
    // (not only the !rgbaStr ones) because the measured defect is that 100% of MEP on Hospital /
    // Clinic / Terminal / LTU DOES carry a colour — an achromatic off-white default the metal
    // triplanar texture then multiplies into "greyish metallic". Tier 1 (a real authored material
    // name, or an rgba that already carries a hue — the user's fire-red lever) returns null here
    // and is byte-identical. Only HUE moves: the element keeps its own V, and roughness/metalness/
    // envMapIntensity/the triplanar multiply below are all untouched, so the metallic PBR read the
    // user complimented survives.
    var _mepAlb = noMepHue ? null : A._mepDiscAlbedo(r, g, b, rgbaStr, ifcClass, discipline, mepHint, matName);
    if (_mepAlb) {
      r = _mepAlb.r; g = _mepAlb.g; b = _mepAlb.b;
      A._mepHueCounts = A._mepHueCounts || {};
      var _mhk = _mepAlb.code + '|' + _mepAlb.src;
      A._mepHueCounts[_mhk] = (A._mepHueCounts[_mhk] || 0) + 1;
    }
    // §S260d: Gentler near-white taming — let ACES tone mapping handle the rest
    if (r > 0.85 && g > 0.85 && b > 0.85) { r *= 0.92; g *= 0.92; b *= 0.92; }
    const opts = { color: new THREE.Color(r, g, b), flatShading: false };
    if (a < 1.0) { opts.transparent = true; opts.opacity = a; opts.side = THREE.DoubleSide; }
    // §S265: PBR roughness + metalness from standard material (or defaults)
    // §refl: ease matte surfaces toward a soft sheen so walls/floors/concrete CATCH the lights
    // (realistic emphasis) instead of reading as flat pale fills. Scale all roughness down ~25%;
    // metals/glass stay glossy by ratio. Floor at 0.08 so nothing becomes a mirror artefact.
    var _rough = stdMat ? stdMat.rough : 0.55;
    opts.roughness = Math.max(0.08, _rough * 0.75);
    // §GLASS_NOT_METAL (2026-08-30): STD_MAT is chosen by ifc_class ALONE, so an element carrying a
    // real, transparent IFC material still got its class's OPAQUE PBR. Measured on live Clinic: the
    // IDENTICAL IFC material `0.000,0.502,0.753,0.100` renders two different ways purely by class —
    //   IfcWindow → metalness 0.00, envMapIntensity 0.6   (correct clear glass, 58 elements)
    //   IfcPlate  → metalness 0.70, envMapIntensity 0.05  (STD_MAT "steel plate", 167 elements)
    // — so 167 of Clinic's 225 glass panels rendered as metal: at metalness 0.7 the diffuse albedo is
    // suppressed and envInt 0.05 leaves almost nothing to reflect, i.e. "loss of glass / no longer
    // see thru" (§A), with no X-ray involved. §S265c's "trust IFC data" was only ever applied to
    // COLOUR; alpha<1 is the IFC itself declaring the surface transparent, and in a metal/rough
    // workflow a transparent surface is BY DEFINITION not a metal (metals are opaque). So when the
    // element's own material says a<1, the opaque class default does not describe it — drop the
    // metalness rather than let a steel-plate preset override real glazing.
    opts.metalness = (a < 1.0) ? 0.0 : (stdMat ? stdMat.metal : 0.08); // §refl: slight metal lift gives surfaces real specular response
    // §WALL_SIDE (2026-09-01): class-keyed side — see FRONT_SIDE_CLASSES above. This corrects
    // §S260d's premise "IFC geometry has inconsistent normals — DoubleSide ensures pick works":
    // MEASURED FALSE in §WALL_WINDING_MEASURE (PHOTOREAL_STILL_RENDER.md) — no geo DB ships a
    // normals column, computeVertexNormals() derives the shading normal FROM the winding, and the
    // winding is consistent (uniformly-inverted meshes fleet-wide: 2 of 111,610 = 0.003%).
    // FrontSide on the measured-closed classes gives back-face-correct shading + backface-culling;
    // DoubleSide stays for the sheet-heavy classes where a one-sided face must render both ways.
    // Pick integrity across the flip is witness-gated (witness_wall_side_light_floor.js S3).
    // Transparent path (a<1.0, above) already forced DoubleSide and is untouched.
    if (a >= 1.0) {
      opts.side = (ifcClass && FRONT_SIDE_CLASSES[ifcClass]) ? THREE.FrontSide : THREE.DoubleSide;
    }
    // §refl: 0.3->0.6 — more realistic reflection emphasis (global default).
    // §HOSPITAL_BLUE_TINT: per-class override (STD_MAT[...].envInt) for the small set of classes
    // whose unusually high metalness otherwise lets the sky's real, strongly-blue PMREM reflection
    // dominate the hue over their own correctly-trusted real IFC albedo — see STD_MAT comments above.
    // §GLASS_NOT_METAL: the envInt overrides exist ONLY to stop a high-metalness class letting the
    // sky's real blue PMREM reflection dominate its albedo (§HOSPITAL_BLUE_TINT / §PIPE_DUCT_BLUE_TINT
    // above). A transparent surface has metalness 0 here, so that reason does not apply to it — and
    // 0.05 on glass kills the reflection that makes glazing read as glass at all. Use the global 0.6.
    if (A._envMap) {
      opts.envMap = A._envMap;
      opts.envMapIntensity = (a < 1.0) ? 0.6
        : ((stdMat && stdMat.envInt != null) ? stdMat.envInt : 0.6);
    }
    const mat = new THREE.MeshStandardMaterial(opts);
    // §PHOTO_ENVMAP_DOUBLE_BOOST_FIX (2026-08-15): effects.js's _reassertPhotoMatBoost() blindly
    // multiplies envMapIntensity x3 and tightens roughness x0.4 on every metal/glossy material
    // during Alt+S/Alt+G, with no awareness of this per-class envInt tuning above — so the SAME
    // blue-sky-reflection this envInt was set to fight comes back 3x stronger specifically during a
    // photoreal capture (user report 2026-08-15: beams/railings/plates/members "already nice" in
    // plain nav, "too much bluish" in the baked MP4 — exactly the Alt+S-only symptom this explains).
    // Flag so the boost pass can exempt materials that were already hand-tuned for this exact issue.
    if (stdMat && stdMat.envInt != null) mat.userData._photoEnvExempt = true;
    // §TRIPLANAR: classes with a real texture set skip the fake-grain perturbation below —
    // the real photo texture takes over that job, stacking both would double-bump the normal
    // with two uncorrelated patterns.
    // §GLASS_NOT_METAL: TRIPLANAR_MAT is also class-keyed, so IfcPlate glazing was being given
    // _TRI_METAL (`metal_color_1k.jpg`) — a brushed-metal weathering texture painted onto glass
    // (visible in the user's own log as `§TRIPLANAR_INIT class=IfcPlate tex=…/metal_color_1k.jpg`).
    // A transparent surface never wants an opaque material's surface-wear texture.
    // §CPE_MATERIAL_KEY: name FIRST, class as fallback. The alpha guard above is evaluated before
    // both and is unchanged — a transparent surface never gets an opaque wear texture, whatever it
    // is called. `_triSrc` is recorded so the witness can assert WHICH key decided, not just that
    // some texture appeared.
    var _triR = A._triResolve(a, ifcClass, matName);
    var triMat = _triR.mat;
    var _triSrc = _triR.src;

    // §S277: Procedural normal perturbation — gives surface texture to flat IFC geometry.
    // Metallic surfaces (pipes, ducts, beams): fine brushed-metal grain.
    // Rough surfaces (concrete, slabs, walls): coarse pebble texture.
    // Zero geometry cost. Reduces temporal aliasing shimmer on flat-color surfaces.
    var _perturbScale = 0;
    if (!triMat) {
      if (stdMat && stdMat.metal > 0.3) _perturbScale = 0.15;  // metal: subtle brushed grain
      else if (stdMat && stdMat.rough > 0.7) _perturbScale = 0.25;  // concrete: visible grain
    }
    if (_perturbScale > 0) {
      var _ps = _perturbScale;
      mat.onBeforeCompile = function(shader) {
        // Inject hash function + normal perturbation into fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          [
            '#include <normal_fragment_maps>',
            '{',
            '  vec3 wp = vViewPosition;',
            '  float nx = fract(sin(dot(wp.xy, vec2(12.9898, 78.233))) * 43758.5453);',
            '  float ny = fract(sin(dot(wp.yz, vec2(93.989, 67.345))) * 24634.6345);',
            '  float nz = fract(sin(dot(wp.xz, vec2(45.164, 38.927))) * 63251.1274);',
            '  normal += normalize(vec3(nx - 0.5, ny - 0.5, nz - 0.5)) * ' + _ps.toFixed(3) + ';',
            '  normal = normalize(normal);',
            '}'
          ].join('\n')
        );
      };
    }
    // §TRIPLANAR: real PBR diffuse+roughness, still-render-only (see table + comment above).
    if (triMat) {
      A._triplanarTexCache = A._triplanarTexCache || {};
      A._triplanarLoader = A._triplanarLoader || new THREE.TextureLoader();
      function _triTex(path, isColor) {
        if (A._triplanarTexCache[path]) return A._triplanarTexCache[path];
        var tex = A._triplanarLoader.load(path, function() {
          console.log('§TRIPLANAR_TEX_READY path=' + path);
        }, undefined, function() {
          console.warn('§TRIPLANAR_TEX_FAIL path=' + path);
        });
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (isColor) {
          if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
          else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
        }
        A._triplanarTexCache[path] = tex;
        return tex;
      }
      var _diffuseTex = _triTex(triMat.diffuse, true);
      var _roughTex = _triTex(triMat.roughness, false);
      var _normalTex = triMat.normal ? _triTex(triMat.normal, false) : null;
      var _triUvScale = 1.0 / triMat.tileMeters;
      var _triNorm = new THREE.Vector3(triMat.normFactorRGB[0], triMat.normFactorRGB[1], triMat.normFactorRGB[2]);
      var _triContrast = triMat.contrastBoost || 1.0;
      mat.onBeforeCompile = function(shader) {
        shader.uniforms.uTriActive = { value: 0.0 };  // flipped by A.startStillRefine()/_teardownStillRefine()
        shader.uniforms.uTriDiffuse = { value: _diffuseTex };
        shader.uniforms.uTriRoughness = { value: _roughTex };
        shader.uniforms.uTriNormalMap = { value: _normalTex };
        shader.uniforms.uTriNormalScale = { value: _normalTex ? 1.0 : 0.0 };
        shader.uniforms.uTriScale = { value: _triUvScale };
        shader.uniforms.uTriNorm = { value: _triNorm };
        shader.uniforms.uTriContrast = { value: _triContrast };
        // §PHOTO_PAINT (2026-07-16, user ask, realreflect.jpg: "uneven colored... easy to run a
        // sort of random paint treat, so each time it is done first time it returns a diff"):
        // A._photoPaintSeed (effects.js §PHOTO_VARIATION — re-rolled per Alt+S trigger, locked by
        // Cinema Orbit) drives a coarse, low-frequency blotch/weathering tint on top of the real
        // photographic texture below — a genuinely different-looking "paint job" each roll, not
        // just a UV-tile shift (which would look near-identical on a seamlessly-tiled texture).
        shader.uniforms.uPaintSeed = { value: A._photoPaintSeed || 0 };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', [
            '#include <common>',
            'varying vec3 vTriWorldPos;',
            'varying vec3 vTriWorldNormal;'
          ].join('\n'))
          .replace('#include <worldpos_vertex>', [
            '#include <worldpos_vertex>',
            '{',
            '  vec4 triWp = vec4(transformed, 1.0);',
            '  #ifdef USE_BATCHING',
            '    triWp = batchingMatrix * triWp;',
            '  #endif',
            '  #ifdef USE_INSTANCING',
            '    triWp = instanceMatrix * triWp;',
            '  #endif',
            '  vTriWorldPos = (modelMatrix * triWp).xyz;',
            '}'
          ].join('\n'))
          .replace('#include <defaultnormal_vertex>', [
            '#include <defaultnormal_vertex>',
            '{',
            '  vec3 triN = objectNormal;',
            '  #ifdef USE_INSTANCING',
            '    triN = mat3(instanceMatrix) * triN;',
            '  #endif',
            '  vTriWorldNormal = normalize(mat3(modelMatrix) * triN);',
            '}'
          ].join('\n'));
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', [
            '#include <common>',
            'varying vec3 vTriWorldPos;',
            'varying vec3 vTriWorldNormal;',
            'uniform sampler2D uTriDiffuse;',
            'uniform sampler2D uTriRoughness;',
            'uniform sampler2D uTriNormalMap;',
            'uniform float uTriNormalScale;',
            'uniform float uTriActive;',
            'uniform float uTriScale;',
            'uniform vec3 uTriNorm;',   // §TRIPLANAR_CAST_FIX — per-channel, was a scalar
            'uniform float uTriContrast;',
            'uniform float uPaintSeed;'
          ].join('\n'))
          .replace('#include <normal_fragment_maps>', [
            '#include <normal_fragment_maps>',
            // §TRIPLANAR_NORMAL (2026-08-30) — the missing third map. NOTICE.txt recorded the gap
            // from day one: "Diffuse+roughness only (no normal/AO ... two-maps-only first pass)".
            // Without it every fragment of a flat wall/floor/slab shares ONE surface normal, so the
            // lighting term is CONSTANT across the whole surface: the texture tints the albedo and
            // the light never varies. Measured on a real Alt+S Terminal frame: ceiling patch luma
            // std 5.67, floor patch std 16.92 — flat, and no tuning can fix it because there is no
            // relief for the light to catch. Same still-only uTriActive gate as the other two maps,
            // so navigation still pays nothing.
            // Whiteout/UDN blend: each axis sample is swizzled into world space and blended by the
            // same triW weights the diffuse uses, then taken to VIEW space (three.js `normal` is
            // view-space at this point).
            'if (uTriActive > 0.5 && uTriNormalScale > 0.0) {',
            '  vec3 nW = normalize(vTriWorldNormal);',
            '  vec3 nTriW = pow(abs(nW), vec3(4.0));',
            '  nTriW /= (nTriW.x + nTriW.y + nTriW.z + 1e-5);',
            '  vec2 nUvX = vTriWorldPos.zy * uTriScale;',
            '  vec2 nUvY = vTriWorldPos.xz * uTriScale;',
            '  vec2 nUvZ = vTriWorldPos.xy * uTriScale;',
            '  vec3 tX = texture2D(uTriNormalMap, nUvX).xyz * 2.0 - 1.0;',
            '  vec3 tY = texture2D(uTriNormalMap, nUvY).xyz * 2.0 - 1.0;',
            '  vec3 tZ = texture2D(uTriNormalMap, nUvZ).xyz * 2.0 - 1.0;',
            '  tX = vec3(tX.xy + nW.zy, abs(tX.z) * nW.x);',
            '  tY = vec3(tY.xy + nW.xz, abs(tY.z) * nW.y);',
            '  tZ = vec3(tZ.xy + nW.xy, abs(tZ.z) * nW.z);',
            '  vec3 triWorldN = normalize(tX.zyx * nTriW.x + tY.xzy * nTriW.y + tZ.xyz * nTriW.z);',
            '  vec3 triViewN = normalize((viewMatrix * vec4(triWorldN, 0.0)).xyz);',
            '  normal = normalize(mix(normal, triViewN, uTriNormalScale));',
            '}'
          ].join('\n'))
          .replace('#include <roughnessmap_fragment>', [
            '#include <roughnessmap_fragment>',
            'if (uTriActive > 0.5) {',   // uniform branch — near-zero cost when off (normal nav)
            '  vec3 triW = abs(normalize(vTriWorldNormal));',
            '  triW = pow(triW, vec3(4.0));',
            '  triW /= (triW.x + triW.y + triW.z + 1e-5);',
            '  vec2 uvX = vTriWorldPos.zy * uTriScale;',
            '  vec2 uvY = vTriWorldPos.xz * uTriScale;',
            '  vec2 uvZ = vTriWorldPos.xy * uTriScale;',
            '  vec3 dX = texture2D(uTriDiffuse, uvX).rgb;',
            '  vec3 dY = texture2D(uTriDiffuse, uvY).rgb;',
            '  vec3 dZ = texture2D(uTriDiffuse, uvZ).rgb;',
            '  vec3 triDiffuse = dX * triW.x + dY * triW.y + dZ * triW.z;',
            '  float rX = texture2D(uTriRoughness, uvX).r;',
            '  float rY = texture2D(uTriRoughness, uvY).r;',
            '  float rZ = texture2D(uTriRoughness, uvZ).r;',
            '  float triRough = rX * triW.x + rY * triW.y + rZ * triW.z;',
            // §TRIPLANAR_CONTRAST (resume-brief item 2): normFactor (uTriNorm) recenters the
            // texture's AVERAGE to ~1.0 so the multiply doesn't shift overall brightness, but
            // does nothing for how much it varies around that average — expand the deviation
            // from 1.0 by uTriContrast BEFORE the multiply, same average, more visible grain.
            '  vec3 triNormalized = triDiffuse * uTriNorm;',
            '  vec3 triContrasted = clamp((triNormalized - 1.0) * uTriContrast + 1.0, 0.0, 2.5);',
            // §PHOTO_PAINT: coarse blotch noise, seeded per-session — two octaves (a broad blotch
            // + a finer freckle) so it reads as uneven weathering, not a single flat tint shift.
            '  vec2 paintCoord = vTriWorldPos.xz * 0.12 + vec2(uPaintSeed * 71.317, uPaintSeed * 113.729);',
            '  float paintA = fract(sin(dot(floor(paintCoord * 1.5), vec2(12.9898, 78.233))) * 43758.5453);',
            '  float paintB = fract(sin(dot(paintCoord * 4.0, vec2(39.201, 61.789))) * 24634.6345);',
            '  float paintBlotch = mix(paintA, paintB, 0.35);',
            '  vec3 paintTint = mix(vec3(0.72, 0.71, 0.69), vec3(1.22, 1.16, 1.04), paintBlotch);',
            '  triContrasted *= paintTint;',
            '  diffuseColor.rgb *= triContrasted;',
            '  roughnessFactor *= mix(0.6, 1.4, triRough);',
            '}'
          ].join('\n'));
        // §TRIPLANAR_CLONE_BOMB: plain property, NEVER mat.userData — Material.copy() deep-copies
        // userData via JSON.parse(JSON.stringify(...)), so a shader stored there made every
        // material.clone() (_buildShapeMeshes on any Find-panel select) serialize the full GLSL
        // source + every uniform INCLUDING textures/envMap — a multi-second main-thread stall per
        // tap on a large building (live LTU hang, 2026-07-16). A clone recompiles fresh anyway.
        mat._triplanarShader = shader;
        // §TRIPLANAR_RECOMPILE_FIX: three.js can silently recompile a material's program
        // (fresh onBeforeCompile call, fresh default-valued uniforms) in response to renderer
        // state changes — observed here on the very first still-refine frame, which reset
        // uTriActive back to 0 and silently undid effects.js's one-time uniform push, leaving
        // the texture dark for the whole accumulation. onBeforeRender runs every frame per
        // object and re-asserts the CURRENT value from live state, so it self-heals across
        // any recompile instead of relying on a single push at start time.
        shader.uniforms.uTriActive.value = A._stillRefineActive ? 1.0 : 0.0;
        shader.uniforms.uPaintSeed.value = A._photoPaintSeed || 0;
      };
      mat.onBeforeRender = function() {
        var sh = mat._triplanarShader;
        if (sh) {
          sh.uniforms.uTriActive.value = A._stillRefineActive ? 1.0 : 0.0;
          sh.uniforms.uPaintSeed.value = A._photoPaintSeed || 0;
          // §TRIPLANAR_NORMAL A/B switch, re-asserted here for the same reason uTriActive is
          // (§TRIPLANAR_RECOMPILE_FIX): a silent program recompile resets uniforms to defaults.
          // APP._triNormalOff = true reverts to the shipped two-map look with no reload.
          if (sh.uniforms.uTriNormalMap && sh.uniforms.uTriNormalMap.value)
            sh.uniforms.uTriNormalScale.value = A._triNormalOff ? 0.0 : 1.0;
        }
      };
      A._triplanarMaterials = A._triplanarMaterials || [];
      A._triplanarMaterials.push(mat);
      console.log('§TRIPLANAR_INIT class=' + ifcClass + ' tex=' + triMat.diffuse +
        ' src=' + _triSrc + ' name=' + (matName || ''));   // §CPE_MATERIAL_KEY
    }
    // §CPE_MATERIAL_KEY: which key decided, recorded on the material itself so a witness can assert
    // it without re-deriving. Plain strings only — see the §TRIPLANAR_CLONE_STALL note above about
    // never putting the shader object in userData.
    mat.userData._triSrc = _triSrc;
    mat.userData._triTex = triMat ? triMat.diffuse : '';
    mat.userData._matName = matName || '';
    // §ENTOURAGE: real RPC people/tree/logo get a presentation material, but ONLY during the Alt+S
    // still-refine pass — gated at RUNTIME by uEntActive (re-asserted every frame from
    // A._stillRefineActive via onBeforeRender, exactly like §TRIPLANAR_RECOMPILE_FIX self-heals),
    // NOT at compile time. During normal navigation the real IFC cream color is shown untouched
    // (§S265c "trust IFC data" — the cream IS an assigned rgba, so it is never overridden always-on;
    // this treatment is a presentation RESULT-stage effect, same standing as the dusk-staging props).
    var ENTOURAGE_MAT = {
      person:  { color: [0.55, 0.48, 0.42], mix: 0.80, emissive: [0, 0, 0] },   // clothing/skin mid-tone
      tree:    { color: [0.26, 0.40, 0.20], mix: 0.90, emissive: [0, 0, 0] },   // deciduous foliage green
      vehicle: { color: [0.74, 0.76, 0.79], mix: 0.75, emissive: [0, 0, 0] },   // neutral car-body grey
      logo:    { color: [0.12, 0.12, 0.14], mix: 0.90, emissive: [0.48, 0.40, 0.22] } // warm lit/printed sign
    };
    var entMat = (matVariant && ENTOURAGE_MAT[matVariant]) ? ENTOURAGE_MAT[matVariant] : null;
    if (entMat && !triMat && _perturbScale === 0) {
      var _entColor = new THREE.Vector3(entMat.color[0], entMat.color[1], entMat.color[2]);
      var _entMix = entMat.mix;
      var _entEmissive = new THREE.Vector3(entMat.emissive[0], entMat.emissive[1], entMat.emissive[2]);
      mat.onBeforeCompile = function(shader) {
        shader.uniforms.uEntActive = { value: A._stillRefineActive ? 1.0 : 0.0 };
        shader.uniforms.uEntColor = { value: _entColor };
        shader.uniforms.uEntMix = { value: _entMix };
        shader.uniforms.uEntEmissive = { value: _entEmissive };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', [
            '#include <common>',
            'uniform float uEntActive;',
            'uniform vec3 uEntColor;',
            'uniform float uEntMix;',
            'uniform vec3 uEntEmissive;'
          ].join('\n'))
          .replace('#include <color_fragment>', [
            '#include <color_fragment>',
            'if (uEntActive > 0.5) { diffuseColor.rgb = mix(diffuseColor.rgb, uEntColor, uEntMix); }'
          ].join('\n'))
          .replace('#include <emissivemap_fragment>', [
            '#include <emissivemap_fragment>',
            'if (uEntActive > 0.5) { totalEmissiveRadiance += uEntEmissive; }'
          ].join('\n'));
        // Plain property, never mat.userData — see §TRIPLANAR_CLONE_BOMB rationale above.
        mat._entShader = shader;
      };
      mat.onBeforeRender = function() {
        var sh = mat._entShader;
        if (sh) sh.uniforms.uEntActive.value = A._stillRefineActive ? 1.0 : 0.0;
      };
      console.log('§ENTOURAGE_INIT variant=' + matVariant + ' class=' + ifcClass);
    }
    mat.userData.origOpacity = a;
    // §WALL_SIDE: record the RESOLVED side (before any x-ray override below). The old line
    // (`a < 1.0 ? DoubleSide : FrontSide`) claimed FrontSide for every opaque material while the
    // material was actually created DoubleSide — a latent mismatch against the x-ray restore
    // fallback chain (tools.js:337/359). mat.side here IS the class-keyed resolved value.
    mat.userData.origSide = mat.side;
    if (A.xrayOn) { mat.transparent = true; mat.opacity = 0.3; mat.side = THREE.DoubleSide; }
    if (A.wireOn) { mat.wireframe = true; }
    if (A.sectionOn) { mat.clippingPlanes = [A.sectionPlane]; mat.clipShadows = true; }
    A._matCache[cacheKey] = mat;
    return mat;
  };

  // §RED_GREY_MYSTERY (2026-08-15, prompts/PHOTOREAL_STILL_RENDER.md §RED_GREY_MYSTERY — ROOT
  // CAUSE FOUND): a real, non-null-coloured element (Hospital IfcValve guid
  // 0HuLVU0hf5gxwY8y9yDvc0, and likely others — unmeasured how widespread) still renders literal
  // [0,0,0] under Alt+S on ~43% of its own screen area, traced all the way down to the shader's
  // `normal` variable itself: some source vertices in the `normal` BufferAttribute have magnitude
  // ~0 (confirmed directly, CPU-side, on this element: 24 of 129,162 vertices in its shared
  // BatchedMesh buffer). `normalize(vec3(0))` in GLSL is 0/0 = NaN, and NaN poisons every
  // subsequent lighting term it touches (ambient/hemi/direct all multiply through it), which is
  // why the affected fragments are LITERAL [0,0,0] regardless of how bright the scene is — proven
  // by directly disabling AO, shadow-restore, the sun shadow map, triplanar, and env reflection
  // one at a time (raw single-frame renders, not the TAA-accumulated composite) with zero change
  // to the black-pixel count each time, then confirming the base albedo (diffuseColor, pre-
  // lighting) is 0% black and an unlit MeshBasicMaterial swap is 0% black too — so it is neither a
  // colour-data bug nor a geometry-coverage bug, only the normal-dependent lighting stage.
  // Attempted fix #1 (recompute a face normal per degenerate vertex from its own triangle's
  // positions) does NOT work here: checked directly, every one of this element's 24 degenerate
  // vertices belongs ONLY to triangles that are THEMSELVES zero-area (duplicate/collinear
  // positions — a genuine tessellation defect, not just a missing-normal bug), so recomputing from
  // the same triangle gives zero again. Fix actually used: nearest-VALID-vertex fallback — when no
  // triangle referencing a degenerate vertex has real area, copy the normal from whichever OTHER
  // vertex in the SAME geometry buffer sits closest to it by position (these are near-duplicate
  // points from the same collapsed tessellation, so a spatially-adjacent valid vertex is almost
  // always right there). Runs ONCE, after streaming finishes (see the `A.streaming = false`
  // branch in streamTick below) — cheap (a few dozen degenerate vertices expected per building,
  // most meshes have zero and short-circuit immediately) and self-contained: no extraction
  // re-run, no DB change, matches this project's existing "self-heal at the point of consumption"
  // pattern rather than a migration script (this is mesh geometry, not DB rows).
  A._repairDegenerateNormals = function() {
    var t0 = performance.now();
    var meshesScanned = 0, meshesAffected = 0, degenTotal = 0, fixedFromFace = 0, fixedFromNeighbor = 0, unfixed = 0;
    var _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
    var _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _cr = new THREE.Vector3();
    A.scene.traverse(function(o) {
      if (!(o.isMesh || o.isBatchedMesh || o.isInstancedMesh)) return;
      var geom = o.geometry;
      if (!geom) return;
      var nAttr = geom.getAttribute('normal');
      var pAttr = geom.getAttribute('position');
      var idx = geom.index;
      if (!nAttr || !pAttr || !idx) return;  // repair needs triangle topology; skip non-indexed
      meshesScanned++;
      var narr = nAttr.array, parr = pAttr.array, iarr = idx.array;
      var n = nAttr.count;
      var degen = [];
      for (var vi = 0; vi < n; vi++) {
        var x = narr[vi*3], y = narr[vi*3+1], z = narr[vi*3+2];
        if (x*x + y*y + z*z < 0.01) degen.push(vi);  // magnitude < 0.1
      }
      if (!degen.length) return;
      // §RED_GREY_MYSTERY safety valve: a mesh with a LARGE fraction of degenerate normals points
      // at something worse than a handful of collapsed triangles (e.g. a whole-mesh decode
      // failure) — repairing individual points would be papering over a bigger problem. Skip and
      // report instead of guessing at a fix.
      if (degen.length / n > 0.05) {
        console.warn('§NORMAL_REPAIR_SKIP mesh=' + o.id + ' degen=' + degen.length + '/' + n +
          ' (>5% — likely a different/larger defect, not repairing)');
        return;
      }
      meshesAffected++;
      degenTotal += degen.length;
      var stillBroken = [];
      for (var di = 0; di < degen.length; di++) {
        var dvi = degen[di];
        var fixed = false;
        for (var ii = 0; ii < iarr.length; ii += 3) {
          var a = iarr[ii], b = iarr[ii+1], c = iarr[ii+2];
          if (a !== dvi && b !== dvi && c !== dvi) continue;
          _va.set(parr[a*3], parr[a*3+1], parr[a*3+2]);
          _vb.set(parr[b*3], parr[b*3+1], parr[b*3+2]);
          _vc.set(parr[c*3], parr[c*3+1], parr[c*3+2]);
          _e1.subVectors(_vb, _va); _e2.subVectors(_vc, _va);
          _cr.crossVectors(_e1, _e2);
          var len = _cr.length();
          if (len > 1e-8) {
            _cr.multiplyScalar(1 / len);
            narr[dvi*3] = _cr.x; narr[dvi*3+1] = _cr.y; narr[dvi*3+2] = _cr.z;
            fixed = true; fixedFromFace++;
            break;
          }
        }
        if (!fixed) stillBroken.push(dvi);
      }
      // Nearest-valid-vertex fallback for anything whose own triangles are ALL degenerate
      // (confirmed the actual case for Hospital's IfcValve 0HuLVU0hf5gxwY8y9yDvc0 — every one of
      // its 24 degenerate vertices sits on a zero-area triangle, so face-recompute above can't
      // reach them).
      for (var sbi = 0; sbi < stillBroken.length; sbi++) {
        var bvi = stillBroken[sbi];
        var bx = parr[bvi*3], by = parr[bvi*3+1], bz = parr[bvi*3+2];
        var bestVi = -1, bestD2 = Infinity;
        for (var ovi = 0; ovi < n; ovi++) {
          var nx = narr[ovi*3], ny = narr[ovi*3+1], nz = narr[ovi*3+2];
          if (nx*nx + ny*ny + nz*nz < 0.9) continue;  // only trust an already-valid (~unit) normal
          var dx = parr[ovi*3] - bx, dy = parr[ovi*3+1] - by, dz = parr[ovi*3+2] - bz;
          var d2 = dx*dx + dy*dy + dz*dz;
          if (d2 < bestD2) { bestD2 = d2; bestVi = ovi; }
        }
        if (bestVi >= 0) {
          narr[bvi*3] = narr[bestVi*3]; narr[bvi*3+1] = narr[bestVi*3+1]; narr[bvi*3+2] = narr[bestVi*3+2];
          fixedFromNeighbor++;
        } else {
          unfixed++;  // whole mesh has no valid normal at all — nothing to borrow from
        }
      }
      // §NORMAL_REPAIR_GPU_UPLOAD: neither `nAttr.needsUpdate = true` on the existing attribute
      // NOR swapping in a brand-new BufferAttribute object changed a single rendered pixel, even
      // though the JS-side array reads back correctly patched both times (confirmed live,
      // separately). That means WebGLRenderer's cached GPU state for this geometry (VAO/binding
      // cache, keyed by geometry.id which never changes here) is the thing not being invalidated.
      // Force it: drop the renderer's cached properties for this geometry entirely so it rebuilds
      // buffers/bindings from scratch on the next draw — the documented way to invalidate GPU
      // state three.js doesn't auto-detect from an attribute-array mutation alone.
      geom.setAttribute('normal', new THREE.BufferAttribute(narr, 3));
      if (A.renderer && A.renderer.properties) { A.renderer.properties.remove(geom); }
    });
    console.log('§NORMAL_REPAIR meshesScanned=' + meshesScanned + ' meshesAffected=' + meshesAffected +
      ' degenTotal=' + degenTotal + ' fixedFromFace=' + fixedFromFace +
      ' fixedFromNeighbor=' + fixedFromNeighbor + ' unfixed=' + unfixed +
      ' ms=' + (performance.now() - t0).toFixed(1));
  };

  A.streamTick = function() {
    // §S260: Range mode uses async _rangeDb — libDb may be null, that's OK
    // _streamPaused = async geometry fetch in progress, skip this tick
    if (A._streamPaused) return;
    if (!A.streaming || (!A.libDb && !A._useRangeStream) || A.streamIdx >= A.streamQueue.length) {
      if (A.streaming && A.streamIdx >= A.streamQueue.length) {
        // ── Flush: build InstancedMesh for hashes with 2+ elements ──
        // §S261: _flushInstanced defers single-instance buckets when _useDlodPath
        A._flushInstanced();
        // §S261: Bbox DLOD flush — one BatchedMesh per bucket, all bbox, reserved ranges
        if (A._useDlodPath && A._pendingBboxBuckets) {
          A._flushBboxBatched(A._pendingBboxBuckets);
          A._pendingBboxBuckets = null;
        }
        // §S261: Keep bbox placeholders if no real geometry was rendered (all BLOB_MISS)
        // §S276: On WebGPU, defer bbox clear until compileAsync completes (prevents blank gap)
        if (A.streamedCount > 0) {
          if (A._isWebGPU && A._onStreamDone) {
            // Bboxes stay visible while pipelines compile — cleared in _onStreamDone callback
            console.log('§S276_BBOX_DEFER keeping bboxes until compileAsync completes');
          } else {
            A._clearBboxPlaceholders();
          }
          A._bboxCleared = true;
        } else {
          console.warn('§BBOX_KEEP placeholders=' + A._bboxPlaceholders.length + ' — no real geometry, keeping bboxes visible');
          A._bboxCleared = false;
        }
        A.streaming = false;
        if (A._triSrcTally) A._triSrcTally();   // §CPE_MATERIAL_KEY rollup — shipped §-log evidence
        if (A._mepHueRollup) A._mepHueRollup();  // §MEP_COLOR_SURVIVES_PHOTOREAL rollup — same reason
        // §RED_GREY_MYSTERY: DISABLED for now — the repair itself is verified correct (patches the
        // broken normal data, confirmed by direct readback) but does NOT change the rendered
        // black-pixel output at all, and costs ~12s per building load for zero visible benefit.
        // The real cause is still open — see prompts/PHOTOREAL_STILL_RENDER.md §RED_GREY_MYSTERY.
        // A._repairDegenerateNormals();
        if (A.activeBuilding) {
          A.buildingsRendered.add(A.activeBuilding);
          A.populateStoreys(A.activeBuilding);
          A.populateDiscs(A.activeBuilding);
          // §S285 Bug2: city mode — now that the real mesh is fully streamed, hide THIS
          // building's bbox placeholders (no blank gap; surrounding city bboxes stay).
          if (A.CITY_URL && A._cityHideBuildingBboxes) A._cityHideBuildingBboxes(A.activeBuilding);
          // §S285: tag this building's streamed objects + evict oldest if over memory budget.
          // Runs BEFORE dlodEnable() below so DLOD refs are rebuilt over the post-eviction scene.
          if (A.CITY_URL && A._cityTagAndBudget) A._cityTagAndBudget(A.activeBuilding);
          // §S285: marquee — stream the next queued building (sequential drain).
          if (A.CITY_URL && A._cityStreamNext) A._cityStreamNext();
          // §SCENE_MERGE (§SM-7.1 step 7): same sequential drain for buildings folded in by
          // Open→Merge. A real merged package (Clinic = 5 discipline buildings) has N names and
          // streamBuilding() handles ONE, so it chains here exactly like City's queue above.
          if (A._mergePending && A._mergePending.length && A._mergeStreamNext) A._mergeStreamNext();
          // §MERGE_CONTRACT (W-SCENE-MERGE): §CONTRACT_CHECK is scene-wide and building-blind, so
          // the merge needs its own per-building split of what is ACTUALLY registered for picking.
          // guidMap values joined back to elements_meta.building — both sides must be > 0.
          if (A.cityBuildingDbs && Object.keys(A.buildingCentres || {}).length > 1 && A.db) {
            try {
              var _mcOwn = {}, _mcGuids = Object.values(A.guidMap);
              for (var _mgi in A._mergedIndex) _mcGuids.push(_mgi);
              var _mcSt = A.db.prepare('SELECT building FROM elements_meta WHERE guid = ?');
              for (var _mgj = 0; _mgj < _mcGuids.length; _mgj++) {
                _mcSt.bind([_mcGuids[_mgj]]);
                if (_mcSt.step()) { var _b = _mcSt.get()[0]; _mcOwn[_b] = (_mcOwn[_b] || 0) + 1; }
                _mcSt.reset();
              }
              _mcSt.free();
              console.log('§MERGE_CONTRACT buildings=' + Object.keys(_mcOwn).length +
                ' rendered=' + JSON.stringify(_mcOwn) +
                ' centres=' + Object.keys(A.buildingCentres).length);
            } catch (e) { console.warn('§MERGE_CONTRACT_FAIL ' + e.message); }
          }
        }
        // §S262: Enable DLOD frustum + storey visibility culling (no geometry swap)
        if (A.dlodEnable) {  // §S265: DLOD visibility culling on all devices
          A.dlodEnable();
          if (A.dlodTick) A.dlodTick();
        }
        // §S258/§S285: Deferred BVH — build ONLY newly-added geometries (drain A._bvhPending) in a
        // SINGLE background chain. WAS Object.keys(meshCache) re-walked every stream-complete, with
        // overlapping chains → §BVH_DEFERRED built=141878 re-scanned 8× at ~50s each = frozen tab.
        // Now O(new), one chain (the _bvhRunning guard), already-built geometries never re-touched.
        if (window._bvhReady) {
          A._bvhPending = A._bvhPending || [];
          if (!A._bvhRunning && A._bvhPending.length) {
            A._bvhRunning = true;
            var _bvhT0 = performance.now();
            var _bvhDone = 0;
            (function _bvhBatch() {
              var n = 0;
              while (A._bvhPending.length && n < 500) {
                var geo = A.meshCache[A._bvhPending.shift()];
                if (geo && geo.computeBoundsTree && !geo.boundsTree) {
                  try { geo.computeBoundsTree(); _bvhDone++; } catch(e) {}
                }
                n++;
              }
              if (A._bvhPending.length) {
                setTimeout(_bvhBatch, 0);
              } else {
                A._bvhRunning = false;
                console.log('[S258] §BVH_DEFERRED built=' + _bvhDone + ' ms=' + (performance.now() - _bvhT0).toFixed(0) + ' (incremental)');
                // §S260b: BatchedMesh BVH — only NEW batched meshes (marked _bmBvhDone), not all every time.
                if (typeof window.computeBatchedBoundsTree === 'function') {
                  var _bmT0 = performance.now();
                  A.scene.traverse(function(obj) {
                    if (obj.isBatchedMesh && !obj._bmBvhDone) {
                      try { window.computeBatchedBoundsTree(obj); obj._bmBvhDone = true; } catch(e) {}
                    }
                  });
                  console.log('[S260b] §BATCHED_BVH ms=' + (performance.now() - _bmT0).toFixed(0));
                }
              }
            })();
          }
        }
        // §S260b: Disable matrixAutoUpdate on all static meshes (only camera moves)
        A.scene.traverse(function(obj) {
          if (obj.isMesh || obj.isInstancedMesh) {
            obj.matrixAutoUpdate = false;
          }
        });
        document.getElementById('s-buildings-done').textContent = A.buildingsRendered.size;
        document.getElementById('s-active').textContent = (typeof _TRL!=='undefined'&&_TRL.ui_active_done||'{name} — DONE').replace('{name}',A.activeBuilding);
        document.getElementById('s-active').style.color = '#44cc44';
        document.getElementById('s-current-element').textContent = '';
        document.getElementById('s-progress').style.width = '100%';
        document.getElementById('s-progress').style.background = '#44cc44';
        A.updateHash();
        const iCount = Object.keys(A._instanceMeta).length;
        A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_done||'DONE — {name} {n} elements ({g} instanced groups). {b} building(s) rendered.').replace('{name}',A.activeBuilding).replace('{n}',A.streamedCount.toLocaleString()).replace('{g}',iCount).replace('{b}',A.buildingsRendered.size);
        // §S276: Pre-compile WebGPU pipelines after all materials in scene
        if (A._onStreamDone) A._onStreamDone();
        // §HSF-7: record "building opened" ONCE per building (the first time its geometry finishes)
        // so a fresh session's timeline is non-empty even before any tap. Read-only milestone.
        if (window.KernelOps && A.db && A.activeBuilding) {
          A._historyOpened = A._historyOpened || {};
          if (!A._historyOpened[A.activeBuilding]) {
            A._historyOpened[A.activeBuilding] = true;
            try { KernelOps.commitOp(A.db, 'BUILDING_OPEN', { name: A.activeBuilding, count: A.streamedCount }, []); }
            catch (e) { console.log('§BUILDING_OPEN_ERR ' + e.message); }
          }
        }
        // §S265: Force render after stream-complete — DLOD/consolidation/bbox-clear happen after streaming=false
        if (A.markDirty) A.markDirty();
      }
      return;
    }

    // ── Phase 1: collect elements, fetch geometry ──
    // §S260b: First batch smaller (500) for fast first paint, then ramp up to 2000
    var _batchSize = A._bboxCleared ? 2000 : 500;
    const batch = Math.min(_batchSize, A.streamQueue.length - A.streamIdx);
    const hashesNeeded = new Set();

    for (let i = 0; i < batch; i++) {
      const row = A.streamQueue[A.streamIdx + i];
      const hash = row[1];
      if (hash && !A.meshCache[hash]) hashesNeeded.add(hash);
    }

    if (hashesNeeded.size > 0) {
      const hashList = [...hashesNeeded];
      let fetched = 0;

      if (A._useRangeStream && A._rangeDb) {
        // ── §S260: Async geometry fetch via range-request httpvfs ──
        // Pause sync tick, fetch async, then resume
        A._streamPaused = true;
        A.status.textContent = 'Streaming geometry... ' + A.streamIdx + '/' + A.streamQueue.length + ' (' + hashesNeeded.size + ' shapes)';
        (async function() {
          var _t0 = performance.now();
          // Probe normals once
          if (A._libHasNormals === null) {
            try {
              await A._rangeDb.exec("SELECT normals FROM component_geometries LIMIT 0");
              A._libHasNormals = true;
            } catch(e) { A._libHasNormals = false; }
            console.log(`[S260] §RANGE_NORMALS_PROBE libHasNormals=${A._libHasNormals}`);
          }
          var cols = A._libHasNormals
            ? 'geometry_hash, vertices, faces, normals'
            : 'geometry_hash, vertices, faces';
          // §S260b: Fetch in chunks of 150 (balance between HTTP round-trips and first paint)
          for (var ci = 0; ci < hashList.length; ci += 150) {
            var chunk = hashList.slice(ci, ci + 150);
            var ph = chunk.map(function(h) { return "'" + h.replace(/'/g,"''") + "'"; }).join(',');
            for (var table of ['component_geometries', 'base_geometries']) {
              try {
                var result = await A._rangeDb.exec(
                  `SELECT ${cols} FROM ${table} WHERE geometry_hash IN (${ph})`
                );
                if (result && result.length > 0) {
                  for (var ri = 0; ri < result[0].values.length; ri++) {
                    var row = result[0].values[ri];
                    var ghash = row[0], vBlob = row[1], fBlob = row[2];
                    var nBlob = A._libHasNormals ? (row[3] || null) : null;
                    if (vBlob && fBlob) {
                      var geo = A.blobToGeometry(vBlob, fBlob, nBlob);
                      if (geo) { A.meshCache[ghash] = geo; (A._bvhPending || (A._bvhPending = [])).push(ghash); fetched++; }
                    }
                  }
                }
              } catch(e) { /* table doesn't exist — try next */ }
            }
          }
          var _ms = (performance.now() - _t0).toFixed(0);
          if (fetched > 0) {
            console.log(`[S260] §RANGE_BLOB_FETCH new=${fetched} total_cached=${Object.keys(A.meshCache).length} ms=${_ms} pages=${hashList.length}`);
          }
          if (fetched === 0 && hashesNeeded.size > 0) {
            console.warn(`[S260] §RANGE_BLOB_MISS hashes=${hashesNeeded.size}`);
          }
          // Resume streaming
          A._streamPaused = false;
        })();
        return; // Exit streamTick — will be re-entered via requestAnimationFrame
      }

      // ── Sync geometry fetch (original path for small DBs) ──
      // Probe once: does libDb have normals column?
      if (A._libHasNormals === null) {
        try {
          A.libDb.exec("SELECT normals FROM component_geometries LIMIT 0");
          A._libHasNormals = true;
        } catch (e) {
          A._libHasNormals = false;
        }
        console.log(`[S231] §NORMALS_PROBE libHasNormals=${A._libHasNormals}`);
      }
      const cols = A._libHasNormals
        ? 'geometry_hash, vertices, faces, normals'
        : 'geometry_hash, vertices, faces';
      // Fetch in chunks of 200 to avoid sql.js bind limit
      for (let ci = 0; ci < hashList.length; ci += 200) {
        const chunk = hashList.slice(ci, ci + 200);
        const ph = chunk.map(() => '?').join(',');
        for (const table of ['component_geometries', 'base_geometries']) {
          try {
            const stmt = A.libDb.prepare(
              `SELECT ${cols} FROM ${table} WHERE geometry_hash IN (${ph})`
            );
            stmt.bind(chunk);
            while (stmt.step()) {
              const row = stmt.get();
              const ghash = row[0], vBlob = row[1], fBlob = row[2];
              const nBlob = A._libHasNormals ? (row[3] || null) : null;
              if (vBlob && fBlob) {
                const geo = A.blobToGeometry(vBlob, fBlob, nBlob);
                if (geo) { A.meshCache[ghash] = geo; (A._bvhPending || (A._bvhPending = [])).push(ghash); fetched++; }
              }
            }
            stmt.free();
          } catch (e) {
            // Table doesn't exist — try next
          }
        }
      }
      if (fetched > 0) {
        if (!A._normalsPrecomputed) A._normalsPrecomputed = 0;
        if (!A._normalsComputed) A._normalsComputed = 0;
        const bvhCount = window._bvhReady ? Object.values(A.meshCache).filter(g => g && g.boundsTree).length : 0;
        // §S276: log first, every 50K, and final only — suppress intermediate spam
        var _cacheSize = Object.keys(A.meshCache).length;
        if (_cacheSize <= fetched || _cacheSize % 50000 < fetched || A.streamIdx >= A.streamQueue.length - 1)
          console.log(`[S231] §BLOB_FETCH new=${fetched} total_cached=${_cacheSize} normals_pre=${A._normalsPrecomputed} normals_cpu=${A._normalsComputed} bvh=${bvhCount}`);
      }
      if (fetched === 0 && hashesNeeded.size > 0) {
        console.warn(`[S231] §BLOB_MISS hashes=${hashesNeeded.size} — no geometry found in library`);
      }
    }

    // ── Phase 2: bucket elements by geometry_hash ──
    // (accumulate into A._pendingInstances for flush at end)
    if (!A._pendingInstances) A._pendingInstances = {};

    for (let i = 0; i < batch; i++) {
      const row = A.streamQueue[A.streamIdx + i];
      const [guid, hash, rgba, disc, cx, cy, cz, rotX, rotY, rotZ, storey, ifcClass, elementName] = row;
      if (!hash || !A.meshCache[hash]) continue;
      if (!A._pendingInstances[hash]) A._pendingInstances[hash] = [];
      A._pendingInstances[hash].push({ guid, hash, rgba, disc, cx, cy, cz,
        rotX: rotX || 0, rotY: rotY || 0, rotZ: rotZ || 0,
        storey: storey || '', ifcClass,
        matVariant: A._entourageVariant(ifcClass, elementName),
        mepHint: A._mepNameHint(elementName),
        matName: row[16] || '',   // §CPE_MATERIAL_KEY — fixed slot 16, after the 16-slot bbox layout
        bx: row[13] || 0.3, by: row[14] || 0.3, bz: row[15] || 0.3 });
      A.streamedCount++;
    }

    if (A.streamIdx === 0) {
      console.log(`[S231] §INSTANCED_STREAM batch=${batch} pending_hashes=${Object.keys(A._pendingInstances).length}`);
    }

    A.streamIdx += batch;

    // §S260c: Progressive flush — first at 500 (quick first paint), then every 5000.
    // §S262: Progressive flush runs on ALL paths (incl. DLOD) — instanced meshes appear
    // while streaming. DLOD bbox BatchedMesh is still flushed once at end.
    if (A._lastFlushIdx === undefined) A._lastFlushIdx = 0;
    var _flushAt = A._bboxCleared ? 5000 : 500;
    if (A.streamIdx - A._lastFlushIdx >= _flushAt && A.streamIdx < A.streamQueue.length) {
      A._flushInstanced();
      if (!A._bboxCleared) A._bboxCleared = true;  // §S260c: switch to 5000 after first flush
      A._lastFlushIdx = A.streamIdx;
      // §S276: log first flush + every 50K only — suppress intermediate spam
      if (A.streamIdx <= _flushAt + 1 || A.streamIdx % 50000 < _flushAt)
        console.log(`[S260] §PROGRESSIVE_FLUSH at=${A.streamIdx}/${A.streamQueue.length} drawCalls=${A.scene.children.length}`);
    }

    // §S280: Streaming progress in status bar (HUD hidden)
    var _pct = A.activeBuildingTotal > 0 ? Math.min(100, (A.streamIdx / A.streamQueue.length) * 100).toFixed(0) : '?';
    A.status.textContent = (A.activeBuilding || '?') + ' — ' + A.streamedCount.toLocaleString() + '/' + A.streamQueue.length.toLocaleString() + ' (' + _pct + '%)';
    // Legacy HUD writes (hidden but referenced by tests)
    var _sStr = document.getElementById('s-streamed');
    if (_sStr) _sStr.textContent = A.streamedCount.toLocaleString();
  };

  // ── S231+S232+S260: Flush pending → BatchedMesh (desktop single) or InstancedMesh (2+) or MergedMesh (mobile) ──
  // §S260: _batchMeta[meshId] = [{guid, storey, disc, ifcClass, slotId}, ...]
  // §S260: _batchStoreyMap[storey] = [{mesh, slotId}, ...] — reverse index for filter
  if (!A._batchMeta) A._batchMeta = {};
  if (!A._batchStoreyMap) A._batchStoreyMap = {};
  if (!A._batchDiscMap) A._batchDiscMap = {};
  // §MERGED_GUID: _mergedMeta[meshId] = [{guid, storey, disc, ifcClass, idxStart, idxCount,
  //   hidden, minX..maxZ}, ...] — the merged path's slot table. _mergedIndex is the guid→
  //   {meshId, rangeIdx} reverse lookup (guidMap can't hold it: keyed by mesh.id, one-to-many).
  if (!A._mergedMeta) A._mergedMeta = {};
  if (!A._mergedIndex) A._mergedIndex = {};
  // Raycast accounting — makes the Walk/fly protection MEASURABLE (elements actually triangle-tested
  // vs elements scanned), so the AABB pre-cull can be proven working instead of assumed.
  if (!A._mergedRayStats) A._mergedRayStats = { casts: 0, tested: 0, scanned: 0 };

  // ── §S280d: Streaming Contract ────────────────────────────────────────────
  // ROUTING RULE (sacred — do NOT change without testing TM, picking, storey/disc filter):
  //   elements.length === 1  → BatchedMesh  → metadata in _batchMeta
  //   elements.length >= 2   → InstancedMesh → metadata in _instanceMeta
  //   single-instance, no WEBGL_multi_draw → MergedMesh → metadata in _mergedMeta (§MERGED_GUID,
  //     2026-07-28: was "no per-GUID metadata"; merged elements now carry full identity via
  //     index ranges, so picking/filter/TM hold on this path too)
  // CONSUMERS (16 files): time_machine, picking, helpers, walk, dlod, ghostglass,
  //   grid_views, scene, doc_canvas, city, wizard_classify, nlp, tools, main
  // CONTRACT: every element must appear in exactly ONE of _batchMeta / _instanceMeta /
  //   _mergedMeta, AND be reachable by guid (guidMap, or _mergedIndex for merged).
  //   Violation = TM/picking/filter breakage.

  // §S280d: Shared metadata registration — used by _flushInstanced AND _flushBboxBatched.
  // Ensures both paths populate the same 4 structures (the contract surface).
  A._registerBatchSlot = function(bm, el, slotId) {
    A.guidMap[bm.id + '_' + slotId] = el.guid;
    var sk = el.storey || '';
    if (!A._batchStoreyMap[sk]) A._batchStoreyMap[sk] = [];
    A._batchStoreyMap[sk].push({ mesh: bm, slotId: slotId });
    var dk = el.disc || '';
    if (!A._batchDiscMap[dk]) A._batchDiscMap[dk] = [];
    A._batchDiscMap[dk].push({ mesh: bm, slotId: slotId });
    return { guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass || '', slotId: slotId, bx: el.bx || 0.3, by: el.by || 0.3, bz: el.bz || 0.3 };
  };

  // §MERGED_GUID — per-element raycast for merged meshes. Witness: W-MERGED-RAYCAST.
  // ISSUE IT PROVES: a merged bucket is ONE geometry with no BVH (three-mesh-bvh builds boundsTree
  // on the shared meshCache source geometries, not on baked merged copies). Plain Mesh.raycast
  // would brute-force every triangle in the bucket — and sfx.js:445 fly-rayblast casts at 11Hz
  // during Walk/fly, so that cost would land directly on the mobile navigation path this whole
  // change is supposed to protect. Two-level instead: ray→element-AABB slab test (a few ns each,
  // and the AABBs came from the baked vertices so they are exact), then the STOCK Mesh.raycast
  // restricted by drawRange to just the surviving elements' index slices — stock triangle maths,
  // stock intersect record (point/face/faceIndex/uv), no hand-rolled geometry.
  var _mgSphere = null, _mgInvMat = null, _mgRay = null;
  A._installMergedRaycast = function(mesh) {
    var _stockRaycast = THREE.Mesh.prototype.raycast;
    mesh.raycast = function(raycaster, intersects) {
      var meta = A._mergedMeta[this.id];
      if (!meta) return _stockRaycast.call(this, raycaster, intersects);
      var geo = this.geometry, idxAttr = geo.index;
      if (!idxAttr) return _stockRaycast.call(this, raycaster, intersects);

      // Whole-bucket reject first (stock does this too, but we must do it before the AABB sweep).
      if (!_mgSphere) { _mgSphere = new THREE.Sphere(); _mgInvMat = new THREE.Matrix4(); _mgRay = new THREE.Ray(); }
      if (geo.boundingSphere === null) geo.computeBoundingSphere();
      _mgSphere.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld);
      if (!raycaster.ray.intersectsSphere(_mgSphere)) return;

      // Ray → this mesh's local space (identity in practice — merged verts are baked world-space —
      // but never assume it; a parented/offset merged mesh must still pick correctly).
      _mgInvMat.copy(this.matrixWorld).invert();
      _mgRay.copy(raycaster.ray).applyMatrix4(_mgInvMat);
      var ox = _mgRay.origin.x, oy = _mgRay.origin.y, oz = _mgRay.origin.z;
      var dx = _mgRay.direction.x, dy = _mgRay.direction.y, dz = _mgRay.direction.z;
      // 1/0 = Infinity would make 0*Infinity = NaN for a ray exactly on a slab plane; a large
      // finite reciprocal keeps the slab test branch-free and NaN-free.
      var ix = dx !== 0 ? 1 / dx : 1e30, iy = dy !== 0 ? 1 / dy : 1e30, iz = dz !== 0 ? 1 / dz : 1e30;
      var near = raycaster.near || 0, far = raycaster.far === undefined ? Infinity : raycaster.far;

      var _prevStart = geo.drawRange.start, _prevCount = geo.drawRange.count;
      var tested = 0;
      for (var i = 0; i < meta.length; i++) {
        var m = meta[i];
        if (m.hidden) continue;                       // respects filterMergedMesh / Room Lens
        var t1 = (m.minX - ox) * ix, t2 = (m.maxX - ox) * ix;
        var tmin = t1 < t2 ? t1 : t2, tmax = t1 < t2 ? t2 : t1;
        t1 = (m.minY - oy) * iy; t2 = (m.maxY - oy) * iy;
        var lo = t1 < t2 ? t1 : t2, hi = t1 < t2 ? t2 : t1;
        if (lo > tmin) tmin = lo;  if (hi < tmax) tmax = hi;
        t1 = (m.minZ - oz) * iz; t2 = (m.maxZ - oz) * iz;
        lo = t1 < t2 ? t1 : t2; hi = t1 < t2 ? t2 : t1;
        if (lo > tmin) tmin = lo;  if (hi < tmax) tmax = hi;
        if (tmax < 0 || tmin > tmax || tmin > far || tmax < near) continue;

        // Stock triangle intersection, scoped to this element's index slice.
        geo.setDrawRange(m.idxStart, m.idxCount);
        var before = intersects.length;
        _stockRaycast.call(this, raycaster, intersects);
        for (var k = before; k < intersects.length; k++) {
          intersects[k]._mergedGuid = m.guid;          // exact identity, O(1) — no faceIndex search
          intersects[k]._mergedRange = m;
        }
        tested++;
      }
      geo.setDrawRange(_prevStart, _prevCount);
      if (A._mergedRayStats) { A._mergedRayStats.casts++; A._mergedRayStats.tested += tested; A._mergedRayStats.scanned += meta.length; }
    };
  };

  A._registerInstanceSlot = function(iMesh, el, instanceIndex) {
    A._instanceGuids[el.guid] = { meshId: iMesh.id, instanceIndex: instanceIndex };
    A.guidMap[iMesh.id + '_' + instanceIndex] = el.guid;
    return { guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass || '', instanceIndex: instanceIndex, bx: el.bx || 0.3, by: el.by || 0.3, bz: el.bz || 0.3 };
  };

  // §S279: Reuse flush temp objects across calls — avoids alloc per flush (every 500-5000 elements)
  var _flushM4, _flushEuler, _flushQuat, _flushPos, _flushScale;
  A._flushInstanced = function() {
    if (!A._pendingInstances) return;
    if (!_flushM4) {
      _flushM4 = new THREE.Matrix4(); _flushEuler = new THREE.Euler();
      _flushQuat = new THREE.Quaternion(); _flushPos = new THREE.Vector3();
      _flushScale = new THREE.Vector3(1, 1, 1);
    }
    const _m4 = _flushM4, _euler = _flushEuler, _quat = _flushQuat;
    const _pos = _flushPos, _scale = _flushScale;
    let instancedCount = 0, batchedCount = 0, mergedCount = 0, drawCalls = 0;
    var _prevDrawCalls = 0;

    // ── S232: bucket single-instance elements for merge (see A._useMerge below) ──
    const mergeBuckets = {};  // key: "storey|disc|rgba" → [{el, geo}, ...]
    // ── S260: On desktop, bucket single-instance elements for BatchedMesh ──
    // §S261: When _useDlodPath, these buckets are passed to _flushBboxBatched instead
    const batchBuckets = {};  // key: "storey|disc|rgba" → [{el, geo}, ...]
    // §MERGED_GUID (MOBILE_PERF.md §SPEC 2026-07-28) — Witness: W-MERGED-GUID.
    // WITHOUT WEBGL_multi_draw a BatchedMesh costs ONE DRAW CALL PER SLOT (~13.5K on LTU); merging
    // the bucket's geometry into one buffer costs one draw per bucket (~200). WITH multi_draw the
    // BatchedMesh path is already one draw per bucket AND keeps the per-slot APIs, so merging would
    // only add vertex-baking cost for nothing — hence the gate is the CAPABILITY, not the device.
    // (68bd9a7's lag was `_useMerge` always-true because `_hasMultiDraw` was never defined; it is
    // now persisted in scene.js. Default-true on probe failure keeps the safe BatchedMesh path.)
    // `?merge=1` / `?merge=0` forces the routing either way — the A/B handle for measuring draw
    // counts on a real device, and how the witness drives the merged path on hardware that has
    // multi_draw. Parsed once per session, not per flush (this runs every 500-5000 elements).
    if (A._mergeOverride === undefined) A._mergeOverride = new URLSearchParams(location.search).get('merge');
    const _mergeOverride = A._mergeOverride;
    // _forceNoMerge OUTRANKS the override: it is set by TM (and `?tm`) to get per-element slots, and
    // TM re-streams to obtain them. If `?merge=1` could still win, that re-stream would re-merge,
    // TM's activate() would see merged meshes again and re-stream again — an infinite unmerge loop
    // (observed in the probe run before this ordering was fixed, not theorised).
    const _useMerge = A._forceNoMerge ? false
                    : _mergeOverride === '1' ? true
                    : _mergeOverride === '0' ? false
                    : (A._hasMultiDraw === false);
    if (_useMerge && !A._mergeLogged) {
      A._mergeLogged = true;
      console.log('§MERGE_ROUTE on — multi_draw=' + A._hasMultiDraw + ' mobile=' + A._isMobile +
        ' override=' + (_mergeOverride === null ? 'none' : _mergeOverride));
    }

    for (const [hash, elements] of Object.entries(A._pendingInstances)) {
      const geo = A.meshCache[hash];
      if (!geo) continue;

      // §S280e (2026-07-25, FLY_TOUR_DLOD_SCALE.md §21 follow-up — verified live via
      // scene.traverse() on LTU_AHouse: 13,453 InstancedMesh scene objects averaging only 2.7
      // instances each. Each is a real, separate scene-graph object paying full per-object
      // frustum-cull traversal every frame (three.js perObjectFrustumCulled) regardless of
      // visibility — confirmed as the cause of a frame-cost floor that persisted even with draw
      // calls cut to ~16 via box-proxy (Duplex, ~150 objects total, ran 4-8x faster at a
      // comparable draw-call count). Raising the BatchedMesh cutoff from "1 instance only" to
      // "LOW_INSTANCE_BATCH_MAX or fewer" folds these near-empty hashes into the SAME
      // already-existing multi-geometry BatchedMesh bucketing used for single-instance elements
      // (bucketed by storey|disc|rgba|matVariant, not by hash — a bucket already holds many
      // different geometries, so a few instances of the same geometry is not a new capability).
      // UNVERIFIED against TM/picking/storey+disc filter — this is the "sacred, do NOT change
      // without testing" line above. Do not treat this as shipped/done until those three are
      // re-tested on a large building; _batchMeta/_instanceMeta contract shape is unchanged
      // (every element still lands in exactly one, via the same _registerBatchSlot call), which
      // is why this is expected to be safe, but expectation is not the same as verification.
      var LOW_INSTANCE_BATCH_MAX = 3;
      if (elements.length <= LOW_INSTANCE_BATCH_MAX) {
        // §S260/§S280e: Desktop — bucket for BatchedMesh (low-instance-count hashes)
        for (let li = 0; li < elements.length; li++) {
          const el = elements[li];
          // §ENTOURAGE: matVariant appended so real RPC people/tree/logo split into their own
          // bucket + own (Alt+S-gated) material instead of merging into a shared cream BatchedMesh.
          // §MEP_DISC_TINT: mepHint's `code` appended too, so e.g. duct vs pipe (same NULL rgba,
          // same "MEP" disc, same '' matVariant) don't merge into one shared-colour BatchedMesh.
          // Positional key.split('|') consumers read parts[0..2] only — trailing fields are inert.
          // §MEP_COLOR_SURVIVES_PHOTOREAL: whether the element is an MEP-hue class joins the key.
          // MEASURED: on Hospital 21 of 160 (storey|disc|rgba) buckets mix an MEP class with a
          // non-MEP one, up to 3,714 non-MEP elements (Clinic 2/65, LTU 21/231, Terminal 0/244).
          // This branch gives the whole bucket ONE material built from items[0]'s class, so
          // without this bit a mixed bucket would paint its non-MEP members an MEP trade hue.
          // Splitting the bucket keeps BOTH halves correct; it cannot fragment by more than the
          // 21 mixed buckets (160 -> at most 181 on the worst building).
          const key = (el.storey || '_') + '|' + (el.disc || '_') + '|' + (el.rgba || '_default') + '|' + (el.matVariant || '') + '|' + (el.mepHint ? el.mepHint.code : '') + '|' + (A._mepHueClasses[el.ifcClass] ? 'M' : '-');
          // §MERGED_GUID: single target selection — merge bucket or batch bucket, never both.
          // Applies to §S280e's low-instance elements too: each is baked individually into the
          // merged buffer with its own index range, so identity survives exactly as for singles.
          const _target = _useMerge ? mergeBuckets : batchBuckets;
          if (!_target[key]) _target[key] = [];
          _target[key].push({ el, geo });
        }
      } else {
        // LOW_INSTANCE_BATCH_MAX+1 or more instances — InstancedMesh (both desktop and mobile)
        // §MEP_COLOR_SURVIVES_PHOTOREAL: this branch buckets by GEOMETRY HASH ALONE, so its members
        // are not guaranteed to share an ifc_class — the same caveat §MEP_DISC_PALETTE recorded for
        // discipline below. MEASURED: Hospital 0 of 20,609 hashes and Clinic 0 of 8,459 span an MEP
        // and a non-MEP class, but LTU_AHouse has 108 of 51,393 (1,386 elements). The bucket cannot
        // be split here without adding a draw call per mixed hash, so on a mixed set the trade hue
        // is SUPPRESSED (prior behaviour) and COUNTED — never applied to a set that is not all MEP.
        var _mepU = !!A._mepHueClasses[elements[0].ifcClass];
        for (var _mqi = 1; _mqi < elements.length; _mqi++) {
          if (!!A._mepHueClasses[elements[_mqi].ifcClass] !== _mepU) { _mepU = null; break; }
        }
        if (_mepU === null) A._instMepMixed = (A._instMepMixed || 0) + 1;
        else A._instMepUniform = (A._instMepUniform || 0) + 1;
        const mat = A._getMaterial(elements[0].rgba, elements[0].ifcClass, elements[0].matVariant, elements[0].disc, elements[0].mepHint, elements[0].matName, _mepU === null);
        const iMesh = new THREE.InstancedMesh(geo, mat, elements.length);
        iMesh.frustumCulled = false;  // §S271b: must stay false — InstancedMesh boundingSphere is base geometry only, not instance spread
        const meta = [];

        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const pos = A.ifc2three(el.cx, el.cy, el.cz);
          _pos.set(pos.x, pos.y, pos.z);
          _euler.set(el.rotX, el.rotZ, -el.rotY);
          _quat.setFromEuler(_euler);
          _m4.compose(_pos, _quat, _scale);
          iMesh.setMatrixAt(i, _m4);

          meta.push(A._registerInstanceSlot(iMesh, el, i));
        }
        iMesh.instanceMatrix.needsUpdate = true;
        iMesh.userData.isInstanced = true;
        iMesh.userData.hash = hash;
        iMesh.userData.ifcClass = elements[0].ifcClass || '';
        // §MEP_DISC_PALETTE coverage fix (2026-09-02) — MEASURED DEFECT: the §SUNGLASS discipline
        // band (tools.js ticks 56-65) groups on `mesh.userData.disc`, but this path never set it,
        // so EVERY InstancedMesh fell into A._groupBy's 'Unknown' bucket and took one flat colour.
        // (Corroborated independently by PR #1594's own note: Clinic reported "7 discs" while its
        // DB holds only 6 — the 7th was 'Unknown'.)
        // ⚠ EXTRACTED, NOT ASSUMED: this branch buckets by GEOMETRY HASH ALONE (the storey|disc|rgba
        // key above governs only the merge/batch branch), so instances here are NOT guaranteed to
        // share a discipline. Set the key only when the set is genuinely uniform; otherwise leave it
        // unset (prior behaviour, 'Unknown') and COUNT it, so a mixed-discipline instance set can
        // never be silently painted as one discipline it does not all belong to.
        var _dU = elements[0].disc || '';
        for (var _dqi = 1; _dqi < elements.length; _dqi++) {
          if ((elements[_dqi].disc || '') !== _dU) { _dU = null; break; }
        }
        if (_dU) { iMesh.userData.disc = _dU; A._instDiscUniform = (A._instDiscUniform || 0) + 1; }
        else { A._instDiscMixed = (A._instDiscMixed || 0) + 1; }
        A._instanceMeta[iMesh.id] = meta;
        A.scene.add(iMesh);
        instancedCount += elements.length;
        drawCalls++;
      }
    }

    // ── S261: DLOD path — accumulate single-instance buckets for _flushBboxBatched ──
    if (A._useDlodPath && !A._isMobile) {
      if (!A._pendingBboxBuckets) A._pendingBboxBuckets = {};
      for (var _bk in batchBuckets) {
        if (!A._pendingBboxBuckets[_bk]) A._pendingBboxBuckets[_bk] = [];
        for (var _bi = 0; _bi < batchBuckets[_bk].length; _bi++) {
          A._pendingBboxBuckets[_bk].push(batchBuckets[_bk][_bi]);
        }
      }
      console.log('§S261_DEFER_BBOX buckets=' + Object.keys(A._pendingBboxBuckets).length);
    }
    // ── S260: Build BatchedMesh per desktop bucket (non-DLOD path) ──────────────
    else if (THREE.BatchedMesh) {  // §S265: BatchedMesh on all devices
      for (const [key, items] of Object.entries(batchBuckets)) {
        if (items.length === 0) continue;
        const [storey, disc, rgba] = key.split('|');

        // Sum verts + indices for capacity
        let totalVerts = 0, totalIdx = 0;
        for (const item of items) {
          const p = item.geo.attributes.position;
          totalVerts += p ? p.count : 0;
          totalIdx += item.geo.index ? item.geo.index.count : (p ? p.count : 0);
        }

        var batchCls = items.length ? (items[0].el.ifcClass || '') : '';
        const mat = A._getMaterial(rgba === '_default' ? null : rgba, batchCls, items.length ? items[0].el.matVariant : '', disc, items.length ? items[0].el.mepHint : null, items.length ? items[0].el.matName : '');
        var bm;
        try {
          bm = new THREE.BatchedMesh(items.length, totalVerts, totalIdx, mat);
        } catch(e) {
          // §S260: If BatchedMesh creation fails, fall back to individual meshes
          console.warn('§BATCHED_FAIL bucket=' + key + ' count=' + items.length + ' err=' + e.message);
          for (const item of items) {
            const el = item.el;
            const m = new THREE.Mesh(item.geo, mat);
            const p = A.ifc2three(el.cx, el.cy, el.cz);
            m.position.set(p.x, p.y, p.z);
            if (el.rotX || el.rotY || el.rotZ) m.rotation.set(el.rotX, el.rotZ, -el.rotY);
            m.userData.storey = el.storey; m.userData.disc = el.disc;
            m.userData.guid = el.guid; m.userData.ifcClass = el.ifcClass || '';
            A.guidMap[m.id] = el.guid;
            A.scene.add(m);
            drawCalls++;
          }
          batchedCount += items.length;
          continue;
        }

        bm.frustumCulled = true;  // §S260b: let Three.js skip off-screen batches
        bm.userData.isBatched = true;
        bm.userData.storey = storey === '_' ? '' : storey;
        bm.userData.disc = disc === '_' ? '' : disc;
        const meta = [];

        for (let i = 0; i < items.length; i++) {
          const el = items[i].el;
          const geo = items[i].geo;
          var slotId;
          try {
            // §S276: r166+ requires addInstance() after addGeometry() to enable rendering
            var geoId = bm.addGeometry(geo);
            slotId = bm.addInstance(geoId);
          } catch(e) {
            console.warn('§BATCHED_ADDGEO_FAIL bucket=' + key + ' i=' + i + ' err=' + e.message);
            continue;
          }
          // FLY_TOUR_DLOD_SCALE.md §9: slot→source-geometry ref for dlod_nav's overlay-hoist
          // cross-fade (BatchedMesh has no per-instance alpha on r185). Reference only — geo
          // already resident in A.meshCache; contract structures (_batchMeta etc.) untouched.
          (bm.userData.slotGeo = bm.userData.slotGeo || {})[slotId] = geo;

          // Position via matrix
          const pos = A.ifc2three(el.cx, el.cy, el.cz);
          _pos.set(pos.x, pos.y, pos.z);
          _euler.set(el.rotX || 0, el.rotZ || 0, -(el.rotY || 0));
          _quat.setFromEuler(_euler);
          _m4.compose(_pos, _quat, _scale);
          bm.setMatrixAt(slotId, _m4);

          // Storey/disc visibility filter
          var vis = true;
          if (!A._storeyVisible(el.storey)) vis = false;
          if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) vis = false;
          if (!vis) bm.setVisibleAt(slotId, false);

          // §S280d: Metadata via shared contract function
          meta.push(A._registerBatchSlot(bm, el, slotId));
        }

        A._batchMeta[bm.id] = meta;
      A._metaGen = (A._metaGen | 0) + 1;   // §PERF_INCR: invalidates TM's event index
        A._metaGen = (A._metaGen | 0) + 1;   // §PERF_INCR: invalidates TM's event index
        bm.matrixAutoUpdate = false;  // §S260b: static scene — skip per-frame matrix recalc
        bm.updateMatrix();
        A.scene.add(bm);
        batchedCount += items.length;
        drawCalls++;
      }
      _prevDrawCalls = batchedCount;
    } else {
      // §S260: Fallback if BatchedMesh unavailable — individual meshes
      for (const [key, items] of Object.entries(batchBuckets)) {
        for (const item of items) {
          const el = item.el;
          const mat = A._getMaterial(el.rgba, el.ifcClass, el.matVariant, el.disc, el.mepHint, el.matName);
          const mesh = new THREE.Mesh(item.geo, mat);
          const pos = A.ifc2three(el.cx, el.cy, el.cz);
          mesh.position.set(pos.x, pos.y, pos.z);
          if (el.rotX || el.rotY || el.rotZ) mesh.rotation.set(el.rotX, el.rotZ, -el.rotY);
          mesh.userData.storey = el.storey; mesh.userData.disc = el.disc;
          mesh.userData.guid = el.guid; mesh.userData.ifcClass = el.ifcClass || '';
          A.guidMap[mesh.id] = el.guid;
          if (!A._storeyVisible(el.storey)) mesh.visible = false;
          if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) mesh.visible = false;
          A.scene.add(mesh);
          batchedCount++;
          drawCalls++;
        }
      }
      _prevDrawCalls = batchedCount;
    }

    // ── S232 + §MERGED_GUID: Merge single-instance buckets (no-multi_draw devices) ──
    if (_useMerge) {
      for (const [key, items] of Object.entries(mergeBuckets)) {
        if (items.length === 0) continue;
        const [storey, disc, rgba] = key.split('|');
        // §MERGED_GUID: per-element index range map — built inside the existing bake loop below,
        // so identity costs one array push per element and NO extra geometry pass.
        const ranges = [];

        // Bake transform into vertices and concatenate all geometries in this bucket
        let totalVerts = 0, totalIdx = 0;
        for (const item of items) {
          const srcPos = item.geo.attributes.position;
          totalVerts += srcPos.count;
          totalIdx += item.geo.index ? item.geo.index.count : srcPos.count;
        }

        const mergedPos = new Float32Array(totalVerts * 3);
        const mergedNorm = items[0].geo.attributes.normal ? new Float32Array(totalVerts * 3) : null;
        const mergedIdx = new Uint32Array(totalIdx);
        let vOff = 0, iOff = 0, vBase = 0;
        const _v = new THREE.Vector3();
        const _n = new THREE.Vector3();

        for (const item of items) {
          const el = item.el;
          const srcGeo = item.geo;
          const srcPos = srcGeo.attributes.position;
          const srcNorm = srcGeo.attributes.normal;
          const count = srcPos.count;

          // Build transform matrix for this element
          const pos = A.ifc2three(el.cx, el.cy, el.cz);
          _pos.set(pos.x, pos.y, pos.z);
          _euler.set(el.rotX, el.rotZ, -el.rotY);
          _quat.setFromEuler(_euler);
          _m4.compose(_pos, _quat, _scale);

          // Normal matrix (inverse transpose of upper 3x3)
          const _nm = new THREE.Matrix3().getNormalMatrix(_m4);

          // Bake positions
          // §MERGED_GUID: accumulate this element's world AABB from the BAKED vertices — exact
          // under any rotation, and free (we already touch every vertex here). Deliberately NOT
          // derived from the DB bbox_x/y/z, which is axis-aligned in IFC space and would understate
          // the world extent of a rotated element.
          let _eMinX = Infinity, _eMinY = Infinity, _eMinZ = Infinity;
          let _eMaxX = -Infinity, _eMaxY = -Infinity, _eMaxZ = -Infinity;
          for (let v = 0; v < count; v++) {
            _v.set(srcPos.getX(v), srcPos.getY(v), srcPos.getZ(v));
            _v.applyMatrix4(_m4);
            mergedPos[(vOff + v) * 3] = _v.x;
            mergedPos[(vOff + v) * 3 + 1] = _v.y;
            mergedPos[(vOff + v) * 3 + 2] = _v.z;
            if (_v.x < _eMinX) _eMinX = _v.x;  if (_v.x > _eMaxX) _eMaxX = _v.x;
            if (_v.y < _eMinY) _eMinY = _v.y;  if (_v.y > _eMaxY) _eMaxY = _v.y;
            if (_v.z < _eMinZ) _eMinZ = _v.z;  if (_v.z > _eMaxZ) _eMaxZ = _v.z;
          }

          // Bake normals
          if (mergedNorm && srcNorm) {
            for (let v = 0; v < count; v++) {
              _n.set(srcNorm.getX(v), srcNorm.getY(v), srcNorm.getZ(v));
              _n.applyMatrix3(_nm).normalize();
              mergedNorm[(vOff + v) * 3] = _n.x;
              mergedNorm[(vOff + v) * 3 + 1] = _n.y;
              mergedNorm[(vOff + v) * 3 + 2] = _n.z;
            }
          }

          // Rebase indices
          const _idxStart = iOff;
          if (srcGeo.index) {
            const srcIdx = srcGeo.index;
            for (let j = 0; j < srcIdx.count; j++) {
              mergedIdx[iOff + j] = srcIdx.getX(j) + vBase;
            }
            iOff += srcIdx.count;
          } else {
            for (let j = 0; j < count; j++) {
              mergedIdx[iOff + j] = vBase + j;
            }
            iOff += count;
          }
          // §MERGED_GUID: the identity record. idxStart/idxCount address this element's slice of
          // the shared index buffer — the merged equivalent of a BatchedMesh slotId. Everything
          // downstream (exact picking, per-element hide, promote-on-demand) reads those two numbers;
          // the AABB pre-culls raycasts so a merged mesh without a BVH stays cheap for Walk/fly ray
          // probes (sfx.js fly-rayblast, 11Hz) — see mesh.raycast below.
          ranges.push({
            guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass || '',
            idxStart: _idxStart, idxCount: iOff - _idxStart, hidden: false,
            bx: el.bx || 0.3, by: el.by || 0.3, bz: el.bz || 0.3,
            minX: _eMinX, maxX: _eMaxX, minY: _eMinY, maxY: _eMaxY, minZ: _eMinZ, maxZ: _eMaxZ
          });
          vOff += count;
          vBase += count;
        }

        const mergedGeo = new THREE.BufferGeometry();
        mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
        if (mergedNorm) mergedGeo.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
        // §IDX16 (2026-08-30) — a Uint32 index addressing fewer than 65,536 vertices spends twice
        // the bytes it needs. MEASURED on Terminal (§MEM_PROBE): index = 71.8 MB of a 469 MB
        // geometry footprint, against a 1,226 MB heap. The guard is exact (totalVerts, the count
        // this very buffer was sized from), so a geometry that genuinely needs 32-bit keeps it —
        // this can never truncate an index. Nothing downstream reads the index's TYPE: `ranges`
        // stores idxStart/idxCount as plain numbers and three.js re-reads .count/.array either way.
        var _mIdx = mergedIdx;
        if (totalVerts < 65536) {
          _mIdx = new Uint16Array(totalIdx);
          for (var _q = 0; _q < totalIdx; _q++) _mIdx[_q] = mergedIdx[_q];
          _idx16Saved += totalIdx * 2; _idx16Geoms++;
        }
        mergedGeo.setIndex(new THREE.BufferAttribute(_mIdx, 1));

        var mergedCls = items.length ? (items[0].el.ifcClass || '') : '';
        const mat = A._getMaterial(rgba === '_default' ? null : rgba, mergedCls, items.length ? items[0].el.matVariant : '', disc, items.length ? items[0].el.mepHint : null, items.length ? items[0].el.matName : '');
        const mesh = new THREE.Mesh(mergedGeo, mat);
        mesh.userData.storey = storey === '_' ? '' : storey;
        mesh.userData.disc = disc === '_' ? '' : disc;
        mesh.userData.isMerged = true;
        mesh.userData.mergedCount = items.length;
        // §MERGED_GUID — CONTRACT REGISTRATION. §S280d's contract says every non-merged element must
        // live in exactly one of _batchMeta/_instanceMeta with a guidMap entry; merged elements now
        // satisfy the same shape via _mergedMeta + _mergedIndex, so the "no per-GUID metadata"
        // exemption is retired. guidMap is NOT written per element (it is keyed by mesh.id, which is
        // one-to-many here) — _mergedIndex is the reverse lookup instead.
        A._mergedMeta[mesh.id] = ranges;
        for (let r = 0; r < ranges.length; r++) {
          if (ranges[r].guid) A._mergedIndex[ranges[r].guid] = { meshId: mesh.id, rangeIdx: r };
        }
        A._mergeActive = true;
        A._installMergedRaycast(mesh);
        if (!A._storeyVisible(mesh.userData.storey)) mesh.visible = false;
        if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(mesh.userData.disc)) mesh.visible = false;
        A.scene.add(mesh);
        mergedCount += items.length;
        drawCalls++;
      }
      if (mergedCount > 0) {
        console.log('§MERGED_FLUSH buckets=' + Object.keys(mergeBuckets).length +
          ' elements=' + mergedCount + ' draws=' + Object.keys(mergeBuckets).length +
          ' (BatchedMesh-without-multi_draw would be ' + mergedCount + ')');
      }
    }

    A._pendingInstances = {};
    // §S276: suppress intermediate flush logs — final summary logged at stream end
    if (!A._batchFlushCount) A._batchFlushCount = 0;
    A._batchFlushCount++;
    if (A._batchFlushCount <= 1 || A.streamIdx >= A.streamQueue.length - 1) {
      console.log(`[S260] §BATCHED_FLUSH instanced=${instancedCount} batched=${batchedCount} drawCalls=${drawCalls} (was ${instancedCount + batchedCount}) mobile=${A._isMobile}`);
      // §MEP_DISC_PALETTE coverage — how many InstancedMeshes now carry a real discipline key, and
      // how many genuinely could not (mixed-discipline geometry set). `mixed` is not a failure; it
      // is the honest count of sets this fix must NOT paint. Both zero = VACUOUS (no instancing).
      console.log(`§MEP_DISC_COVERAGE instancedMeshes uniformDisc=${A._instDiscUniform || 0} mixedDisc=${A._instDiscMixed || 0}` +
        (!(A._instDiscUniform || A._instDiscMixed) ? ' — VACUOUS, no InstancedMesh built on this building'
          : ` (${Math.round((A._instDiscUniform || 0) / ((A._instDiscUniform || 0) + (A._instDiscMixed || 0)) * 100)}% now keyed; these were ALL 'Unknown' before §MEP_DISC_PALETTE)`));
      if (batchedCount > 0) {
        console.log(`§BATCHED_DETAIL buckets=${Object.keys(batchBuckets).length} elements=${batchedCount} saved=${_prevDrawCalls - Object.keys(batchBuckets).length} drawCalls`);
      }
    }
    document.getElementById('s-meshes').textContent = drawCalls.toLocaleString() + ' draw calls';

    // §S280d: Contract assertion — verify metadata integrity at final flush
    if (A.streamIdx >= A.streamQueue.length) {
      var _ca_batch = 0, _ca_inst = 0, _ca_guid = 0, _ca_orphan = 0, _ca_merged = 0, _ca_mgIdx = 0;
      for (var _bmId in A._batchMeta) _ca_batch += A._batchMeta[_bmId].length;
      for (var _imId in A._instanceMeta) _ca_inst += A._instanceMeta[_imId].length;
      // §MERGED_GUID: merged elements are now a FIRST-CLASS side of the contract — counted here so
      // "zero metadata" stays a real alarm on the merged path instead of being excused by _isMobile.
      for (var _mgId in A._mergedMeta) _ca_merged += A._mergedMeta[_mgId].length;
      _ca_mgIdx = Object.keys(A._mergedIndex).length;
      _ca_guid = Object.keys(A.guidMap).length;
      var _ca_registered = _ca_batch + _ca_inst + _ca_merged;
      if (_ca_registered === 0 && A.streamedCount > 0) {
        console.error('§CONTRACT_FAIL zero metadata entries but streamedCount=' + A.streamedCount +
          ' — routing broke: no GUIDs in _batchMeta, _instanceMeta or _mergedMeta. TM/picking will fail.');
      }
      // guidMap covers the batched+instanced sides; merged identity lives in _mergedIndex instead
      // (guidMap is keyed by mesh.id, which is one-to-many for a merged bucket).
      if (_ca_guid < _ca_batch + _ca_inst) {
        _ca_orphan = (_ca_batch + _ca_inst) - _ca_guid;
        console.error('§CONTRACT_FAIL guidMap=' + _ca_guid + ' but meta=' + (_ca_batch + _ca_inst) +
          ' — ' + _ca_orphan + ' orphaned GUIDs. Picking will miss elements.');
      }
      if (_ca_merged > 0 && _ca_mgIdx === 0) {
        console.error('§CONTRACT_FAIL merged meta=' + _ca_merged + ' but _mergedIndex is empty' +
          ' — merged elements unreachable by guid. Lens/isolate will miss them.');
      }
      for (var _ciId in A._instanceMeta) {
        var _ciMeta = A._instanceMeta[_ciId];
        if (_ciMeta.length < 2) {
          console.error('§CONTRACT_FAIL InstancedMesh id=' + _ciId + ' has ' + _ciMeta.length +
            ' instances — should be >=2. Single-instance belongs in BatchedMesh.');
        }
      }
      console.log('§CONTRACT_CHECK batch=' + _ca_batch + ' instanced=' + _ca_inst +
        ' merged=' + _ca_merged + ' mergedIndex=' + _ca_mgIdx +
        ' guidMap=' + _ca_guid + ' streamed=' + A.streamedCount + ' orphans=' + _ca_orphan);
    }
    // §TM_STREAM_RESWEEP: newly-flushed geometry defaults to visible — if Time Machine is
    // active, sweep it against the current cursor (no-op when TM isn't active).
    if (window.tmResweep) window.tmResweep();
    // §BILLBOARD_ALWAYS: the model is fully streamed here, so any billboard element in the DB can
    // now be read and given its face. Idempotent and a no-op for buildings that have no billboard.
    if (A._billboardAutoBuild) A._billboardAutoBuild();
    // §PHOTO_PREWARM (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R11): the model is fully
    // streamed here, which is the EARLIEST point the curve-smoothing pass can legally run — it
    // walks streamed geometry. MEASURED on the user's own Hospital session: that pass costs
    // 8,923.6 ms and it was being paid on the first Alt+S press, not here. Same idempotent,
    // no-op-if-absent contract as the billboard build above.
    if (A._photoPrewarm) A._photoPrewarm();
  };

  // §S261: Bbox-only BatchedMesh flush — ONE flush, all elements start as bbox cubes.
  // Each slot reserves vertex/index space for future setGeometryAt() promotion.
  // Used for buildings >= 5K elements on desktop. Replaces progressive flush + consolidation.
  A._flushBboxBatched = function(batchBuckets) {
    if (!batchBuckets || !THREE.BatchedMesh) return;
    var _m4 = new THREE.Matrix4();
    var _m4real = new THREE.Matrix4();
    var _euler = new THREE.Euler();
    var _quat = new THREE.Quaternion();
    var _pos = new THREE.Vector3();
    var _bboxScale = new THREE.Vector3();
    var _realScale = new THREE.Vector3(1, 1, 1);
    var GPU_VERT_BUDGET = 8000000;  // 8M verts = ~96MB
    var BBOX_VERTS = 24;  // BoxGeometry(1,1,1)
    var BBOX_IDX = 36;
    var bboxGeo = A._dlodBboxGeo;
    var totalReservedVerts = 0;
    var bboxCount = 0, skipCount = 0, drawCalls = 0;

    for (var key in batchBuckets) {
      var items = batchBuckets[key];
      if (!items.length) continue;
      var parts = key.split('|');
      var storey = parts[0], disc = parts[1], rgba = parts[2];

      // First pass: compute per-slot reservations and totals
      var slotReservations = [];
      var bucketVerts = 0, bucketIdx = 0;
      var fallbackItems = [];  // elements too large for DLOD reservation

      for (var i = 0; i < items.length; i++) {
        var el = items[i].el;
        var geo = items[i].geo;
        var vc = geo && geo.attributes.position ? geo.attributes.position.count : 0;
        var ic = geo && geo.index ? geo.index.count : (vc || 0);

        // §S262: Reserve exact real-geometry size (no tiered cap).
        // Geometry is in meshCache at flush time — use actual size so promote always fits.
        var rv = Math.max(vc, BBOX_VERTS);
        var ri = Math.max(ic, BBOX_IDX);

        slotReservations.push({ item: items[i], rv: rv, ri: ri });
        bucketVerts += rv;
        bucketIdx += ri;
      }

      // GPU budget guard
      if (totalReservedVerts + bucketVerts > GPU_VERT_BUDGET) {
        console.warn('§S261_BUDGET_EXCEEDED budget=' + GPU_VERT_BUDGET +
          ' required=' + (totalReservedVerts + bucketVerts) + ' bucket=' + key);
        // Demote entire bucket to fallback
        for (var fi = 0; fi < slotReservations.length; fi++) fallbackItems.push(slotReservations[fi].item);
        slotReservations = [];
        bucketVerts = 0;
        bucketIdx = 0;
      }
      totalReservedVerts += bucketVerts;

      // Fallback: individual meshes for oversized/over-budget elements
      if (fallbackItems.length > 0) {
        var batchCls = fallbackItems[0].el.ifcClass || '';
        var mat = A._getMaterial(rgba === '_default' ? null : rgba, batchCls, fallbackItems[0].el.matVariant, disc, fallbackItems[0].el.mepHint, fallbackItems[0].el.matName);
        for (var fi = 0; fi < fallbackItems.length; fi++) {
          var el = fallbackItems[fi].el;
          var m = new THREE.Mesh(fallbackItems[fi].geo, mat);
          var p = A.ifc2three(el.cx, el.cy, el.cz);
          m.position.set(p.x, p.y, p.z);
          if (el.rotX || el.rotY || el.rotZ) m.rotation.set(el.rotX, el.rotZ, -el.rotY);
          m.userData.storey = el.storey; m.userData.disc = el.disc;
          m.userData.guid = el.guid; m.userData.ifcClass = el.ifcClass || '';
          A.guidMap[m.id] = el.guid;
          if (!A._storeyVisible(el.storey)) m.visible = false;
          if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) m.visible = false;
          A.scene.add(m);
          drawCalls++;
          skipCount++;
        }
      }

      if (!slotReservations.length) continue;

      // Create BatchedMesh with reserved capacity
      var batchCls = slotReservations[0].item.el.ifcClass || '';
      var mat = A._getMaterial(rgba === '_default' ? null : rgba, batchCls, slotReservations[0].item.el.matVariant, disc, slotReservations[0].item.el.mepHint, slotReservations[0].item.el.matName);
      var bm;
      try {
        bm = new THREE.BatchedMesh(slotReservations.length, bucketVerts, bucketIdx, mat);
      } catch(e) {
        console.warn('§S261_BM_FAIL bucket=' + key + ' count=' + slotReservations.length + ' err=' + e.message);
        continue;
      }
      bm.frustumCulled = true;
      bm.userData.isBatched = true;
      bm.userData.storey = storey === '_' ? '' : storey;
      bm.userData.disc = disc === '_' ? '' : disc;
      var meta = [];
      var dlodSlots = [];

      for (var si = 0; si < slotReservations.length; si++) {
        var sr = slotReservations[si];
        var el = sr.item.el;
        var realGeo = sr.item.geo;
        var slotId;

        // §S262: Start with REAL geometry — looks correct immediately.
        // DLOD demotes far elements to bbox later as an optimization.
        try {
          // §S276: r166+ requires addInstance() after addGeometry()
          var geoId = bm.addGeometry(realGeo, sr.rv, sr.ri);
          slotId = bm.addInstance(geoId);
        } catch(e) {
          console.warn('§S261_ADDGEO_FAIL bucket=' + key + ' i=' + si + ' err=' + e.message);
          continue;
        }

        // Real-geometry matrix (scale=1,1,1)
        var pos = A.ifc2three(el.cx, el.cy, el.cz);
        _pos.set(pos.x, pos.y, pos.z);
        _euler.set(el.rotX || 0, el.rotZ || 0, -(el.rotY || 0));
        _quat.setFromEuler(_euler);
        _m4real.compose(_pos, _quat, _realScale);
        bm.setMatrixAt(slotId, _m4real);

        // Bbox-scaled matrix — cached for demote
        var bx = el.bx || 0.3, by = el.bz || 0.3, bz = el.by || 0.3;  // IFC→Three: swap Y↔Z
        _bboxScale.set(bx, by, bz);
        _m4.compose(_pos, _quat, _bboxScale);

        // Storey/disc visibility filter
        var vis = true;
        if (!A._storeyVisible(el.storey)) vis = false;
        if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) vis = false;
        if (!vis) bm.setVisibleAt(slotId, false);

        // §S280d: Metadata via shared contract function (same as _flushInstanced)
        meta.push(A._registerBatchSlot(bm, el, slotId));

        // DLOD slot data — starts promoted (real geometry), demotes to bbox when far
        dlodSlots.push({
          slotId: slotId,
          hash: el.hash,
          promoted: true,
          reservedVerts: sr.rv,
          reservedIdx: sr.ri,
          bboxMatrix: _m4.clone(),
          realMatrix: _m4real.clone(),
          wx: pos.x, wy: pos.y, wz: pos.z  // world position for distance calc
        });

        bboxCount++;
      }

      A._batchMeta[bm.id] = meta;
      A._dlodSlots[bm.id] = dlodSlots;
      dlodSlots._bmRef = bm;  // direct reference for fast lookup in dlodTick
      bm.matrixAutoUpdate = false;
      bm.updateMatrix();
      A.scene.add(bm);
      drawCalls++;
    }

    var reservedMB = (totalReservedVerts * 12 / 1048576).toFixed(1);
    console.log('§DLOD_FLUSH buckets=' + drawCalls + ' elements=' + bboxCount +
      ' draw_calls=' + drawCalls + ' skip=' + skipCount +
      ' start=real reserved_mb=' + reservedMB);
    document.getElementById('s-meshes').textContent = drawCalls.toLocaleString() + ' draw calls (DLOD)';
    // §TM_STREAM_RESWEEP: see _flushInstanced — same reasoning, DLOD bbox flush path.
    if (window.tmResweep) window.tmResweep();
  };

  // §S260c: Consolidate fragmented BatchedMesh from progressive flushes into one set.
  // Progressive flush creates N sets of BatchedMesh (one per 5000-element chunk).
  // After streaming ends, this removes them and rebuilds ONE BatchedMesh per bucket
  // from streamQueue + meshCache. r160 has no getGeometryIdAt, so we rebuild from source.
  // LTU 122K: 26 flushes × 40 buckets = 1040 draw calls → consolidated to ~40.
  A._consolidateBatched = function() {
    if (!THREE.BatchedMesh) return;  // §S265: consolidation on all devices
    var t0 = performance.now();

    // Count existing BatchedMesh — if already compact, skip
    var oldBMs = [];
    A.scene.traverse(function(obj) { if (obj.isBatchedMesh) oldBMs.push(obj); });
    if (oldBMs.length <= 40) {
      console.log('§CONSOLIDATE_SKIP batched=' + oldBMs.length + ' — already compact');
      return;
    }

    // Remove all old BatchedMesh + their metadata
    var oldBMIds = new Set();
    for (var bi = 0; bi < oldBMs.length; bi++) {
      oldBMIds.add(oldBMs[bi].id);
      delete A._batchMeta[oldBMs[bi].id];
      A.scene.remove(oldBMs[bi]);
      if (oldBMs[bi].dispose) oldBMs[bi].dispose();
    }
    A._batchStoreyMap = {};
    A._batchDiscMap = {};
    // Clean guidMap entries from old BMs
    for (var gk in A.guidMap) {
      if (gk.indexOf('_') > 0) {
        var prefix = parseInt(gk.split('_')[0], 10);
        if (oldBMIds.has(prefix)) delete A.guidMap[gk];
      }
    }

    // Build set of guids in InstancedMesh (6+ instances, stay untouched)
    var instancedGuids = new Set();
    for (var imId in A._instanceMeta) {
      var imMeta = A._instanceMeta[imId];
      for (var imi = 0; imi < imMeta.length; imi++) {
        instancedGuids.add(imMeta[imi].guid);
      }
    }

    // Rebuild buckets from streamQueue (the original source of truth)
    var buckets = {};  // "storey|disc|rgba" → [{el, geo}, ...]
    var _m4 = new THREE.Matrix4();
    var _euler = new THREE.Euler();
    var _quat = new THREE.Quaternion();
    var _pos = new THREE.Vector3();
    var _scale = new THREE.Vector3(1, 1, 1);

    for (var qi = 0; qi < A.streamQueue.length; qi++) {
      var row = A.streamQueue[qi];
      var guid = row[0], hash = row[1], rgba = row[2], disc = row[3];
      var cx = row[4], cy = row[5], cz = row[6];
      var rotX = row[7] || 0, rotY = row[8] || 0, rotZ = row[9] || 0;
      var storey = row[10] || '', ifcClass = row[11] || '';
      var matVariant = A._entourageVariant(ifcClass, row[12]);
      var mepHint = A._mepNameHint(row[12]);
      var matName = row[16] || '';   // §CPE_MATERIAL_KEY
      if (!hash || !A.meshCache[hash]) continue;
      // Skip elements already in InstancedMesh
      if (instancedGuids.has(guid)) continue;

      var key = (storey || '_') + '|' + (disc || '_') + '|' + (rgba || '_default') + '|' + (matVariant || '') + '|' + (mepHint ? mepHint.code : '') + '|' + (A._mepHueClasses[ifcClass] ? 'M' : '-');   // §MEP_COLOR_SURVIVES_PHOTOREAL — see the same bit on the batch key above
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ guid: guid, hash: hash, rgba: rgba, disc: disc,
        cx: cx, cy: cy, cz: cz, rotX: rotX, rotY: rotY, rotZ: rotZ,
        storey: storey, ifcClass: ifcClass, matVariant: matVariant, mepHint: mepHint, matName: matName });
    }

    // Build consolidated BatchedMesh per bucket
    var newDrawCalls = 0, totalElements = 0;
    for (var key in buckets) {
      var items = buckets[key];
      if (items.length === 0) continue;

      if (items.length === 0) continue;

      var totalVerts = 0, totalIdx = 0;
      for (var vi = 0; vi < items.length; vi++) {
        var geo = A.meshCache[items[vi].hash];
        var p = geo.attributes.position;
        totalVerts += p ? p.count : 0;
        totalIdx += geo.index ? geo.index.count : (p ? p.count : 0);
      }

      var parts = key.split('|');
      var rgbaKey = parts[2];
      var batchCls = items[0].ifcClass;
      var mat = A._getMaterial(rgbaKey === '_default' ? null : rgbaKey, batchCls, items[0].matVariant, items[0].disc, items[0].mepHint, items[0].matName);
      var newBM;
      try {
        newBM = new THREE.BatchedMesh(items.length, totalVerts, totalIdx, mat);
      } catch(e) {
        console.warn('§CONSOLIDATE_FAIL bucket=' + key + ' count=' + items.length + ' err=' + e.message);
        continue;
      }

      newBM.frustumCulled = true;
      newBM.userData.isBatched = true;
      newBM.userData.storey = parts[0] === '_' ? '' : parts[0];
      newBM.userData.disc = parts[1] === '_' ? '' : parts[1];
      newBM.matrixAutoUpdate = false;
      var newMeta = [];

      for (var ji = 0; ji < items.length; ji++) {
        var el = items[ji];
        var geo = A.meshCache[el.hash];
        var slotId;
        // §S276: r166+ requires addInstance() after addGeometry()
        try { var geoId = newBM.addGeometry(geo); slotId = newBM.addInstance(geoId); } catch(e) { continue; }

        var pos = A.ifc2three(el.cx, el.cy, el.cz);
        _pos.set(pos.x, pos.y, pos.z);
        _euler.set(el.rotX, el.rotZ, -el.rotY);
        _quat.setFromEuler(_euler);
        _m4.compose(_pos, _quat, _scale);
        newBM.setMatrixAt(slotId, _m4);

        var vis = true;
        if (!A._storeyVisible(el.storey)) vis = false;
        if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) vis = false;
        if (!vis) newBM.setVisibleAt(slotId, false);

        newMeta.push({ guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass, slotId: slotId });
        A.guidMap[newBM.id + '_' + slotId] = el.guid;

        var sk = el.storey || '';
        if (!A._batchStoreyMap[sk]) A._batchStoreyMap[sk] = [];
        A._batchStoreyMap[sk].push({ mesh: newBM, slotId: slotId });
        var dk = el.disc || '';
        if (!A._batchDiscMap[dk]) A._batchDiscMap[dk] = [];
        A._batchDiscMap[dk].push({ mesh: newBM, slotId: slotId });
      }

      A._batchMeta[newBM.id] = newMeta;
      A._metaGen = (A._metaGen | 0) + 1;   // §PERF_INCR: §CONSOLIDATE rebuilds meshes -> new slotIds
      newBM.updateMatrix();
      A.scene.add(newBM);
      newDrawCalls++;
      totalElements += items.length;
    }

    var ms = (performance.now() - t0).toFixed(0);
    console.log('§CONSOLIDATE old_bm=' + oldBMs.length + ' new_bm=' + newDrawCalls +
      ' elements=' + totalElements + ' ms=' + ms);
    document.getElementById('s-meshes').textContent = newDrawCalls.toLocaleString() + ' draw calls';
    if (A.markDirty) A.markDirty();
    // §TM_STREAM_RESWEEP: see _flushInstanced — consolidation rebuilds BatchedMesh objects
    // (new object identities), so this needs its own sweep even though nothing NEW streamed in.
    if (window.tmResweep) window.tmResweep();
  };

  // DB init
  A.init = async function() {
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_wasm||'Loading WebAssembly...');
    // Use WASM binary pre-fetched by loader.js (started in parallel with JS libs)
    var sqlOpts = { locateFile: f => 'lib/' + f };
    if (typeof _wasmBinaryPromise !== 'undefined') {
      var preloaded = await _wasmBinaryPromise;
      if (preloaded) sqlOpts.wasmBinary = preloaded;
    }
    const SQL = await initSqlJs(sqlOpts);
    A._SQL = SQL; // Cache for reuse (diff DB, import) — avoids re-downloading WASM

    // Implementing prompts/Viewer/BLANK_VIEWER_LANDING_CARD.md §1 (bim-ootb port) — Witness: manual, see §STATUS
    // Blank mode with nothing opened: fetch(A.DB_URL) below would resolve '' to the page's own HTML and
    // fail confusingly. A.openModelDb() (Ctrl+O / Open Building pill) navigates to viewer.html?db=import://…
    // once a file is picked — a fresh page load, so no re-entry guard is needed here.
    if (A.BLANK_MODE && !A.DB_URL) {
      A.status.textContent = 'Blank scene — press Ctrl+O (Open Building) to load a .db file';
      console.log('§BLANK_MODE active=1 waiting_for_open=1');
      return;
    }

    if (A.CITY_URL) {
      // S250 §6: On mobile, defer city_index.db auto-load to save memory
      if (A._isMobile) {
        console.log('§CITY_DEFER mobile — skipped auto-load');
        A._citySQL = SQL; // stash for manual trigger
        A.status.textContent = 'City mode available — tap City button to load';
      } else {
        await A.initCity(SQL);
      }
      return;
    }

    // §6.9 Split DB detection: try _meta.db alongside any .db URL
    // §SPLIT_PAIR_REQUIRED (2026-07-13): meta.db's presence alone is NOT sufficient to commit to
    // split mode — a stray/incomplete split upload (meta.db present, geo.db never uploaded, e.g.
    // Duplex: small building, never needed a split at all) forced every such building down the
    // split path on meta.db alone, then failed the mesh fetch on the missing geo half. Require
    // BOTH halves to actually exist (network) before trusting split mode. The import:// (browser
    // Drop-IFC) case is unaffected — its cache entries are always written together atomically in
    // import_own.js, so checking meta alone there was never unsafe.
    var _splitMode = false;
    var metaUrl = A.DB_URL.replace('_extracted.db', '_meta.db');
    var geoUrl = A.DB_URL.replace('_extracted.db', '_geo.db');
    // §S260b: Also handle plain names like "hospital.db" → "hospital_meta.db"
    if (metaUrl === A.DB_URL) metaUrl = A.DB_URL.replace(/\.db$/, '_meta.db');
    if (geoUrl === A.DB_URL) geoUrl = A.DB_URL.replace(/\.db$/, '_geo.db');
    if (metaUrl !== A.DB_URL) {
      try {
        // §OFFLINE-GATEWAY-LEAK: check IndexedDB before ever touching the network — a repeat/offline
        // open of a building already downloaded must not re-probe the network to rediscover split-mode.
        var _metaCached = await A._checkCache(metaUrl);
        if (_metaCached || A.DB_URL.startsWith('import://')) {
          _splitMode = !!_metaCached;
        } else {
          var headResp = await fetch(metaUrl, { method: 'HEAD' });
          var _geoHeadOk = headResp.ok && await fetch(geoUrl, { method: 'HEAD' }).then(r => r.ok, () => false);
          _splitMode = headResp.ok && _geoHeadOk;
        }
      } catch(e) { _splitMode = false; }
    }
    console.log(`[S192] §DB_SPLIT_DETECT meta=${metaUrl} geo=${geoUrl} found=${_splitMode}`);

    if (_splitMode) {
      // ── §S260b: Three-phase — positions.bin (instant bboxes) → meta.db (panels) → geo.db (meshes) ──
      // geoUrl already computed above (§SPLIT_PAIR_REQUIRED detection).
      // Bypass new URL() for import:// URLs (would throw)
      var _geoAbsUrl = geoUrl.startsWith('import://') ? geoUrl : new URL(geoUrl, location.href).href;
      var posUrl = A.DB_URL.replace('_extracted.db', '_positions.bin');

      // Phase 0: Try positions.bin for instant bboxes (< 3MB, loads in <1s)
      // §S261: Skip if early bbox already drawn above
      var _posLoaded = false;
      if (!_posLoaded) try {
        A.status.textContent = 'Loading positions...';
        var posBuf = await A.cachedFetch(posUrl);
        var posView = new DataView(posBuf);
        var posCount = posView.getUint32(0, true);
        var posRows = [];
        for (var pi = 0; pi < posCount; pi++) {
          var off = 4 + pi * 24;
          posRows.push([
            null, null, null, null,  // guid, hash, rgba, disc (not needed for bboxes)
            posView.getFloat32(off, true),      // center_x
            posView.getFloat32(off + 4, true),  // center_y
            posView.getFloat32(off + 8, true),  // center_z
            null, null, null, null, null, null,  // rotation, storey, class, element_name
            posView.getFloat32(off + 12, true), // bbox_x (idx 13 — _drawBboxPlaceholders 16-slot layout)
            posView.getFloat32(off + 16, true), // bbox_y
            posView.getFloat32(off + 20, true)  // bbox_z
          ]);
        }
        _posLoaded = true;
        A._positionRows = posRows;
        console.log(`[S260b] §POSITIONS_LOADED count=${posCount} size=${(posBuf.byteLength/1024).toFixed(0)}KB`);
        A.status.textContent = posCount.toLocaleString() + ' elements positioned. Loading metadata...';
      } catch(e) {
        console.log(`[S260b] §POSITIONS_MISS — falling back to meta.db for bboxes`);
      }

      // §S260b: If positions loaded, compute modelOffset + draw bboxes before meta.db
      // §S260e: Guard — _positionRows only exists when positions.bin loaded (not S261 early bbox)
      if (_posLoaded && A._drawBboxPlaceholders && A._positionRows) {
        // Compute modelOffset from positions (same as buildingCentres logic)
        var _sumX = 0, _sumY = 0, _sumZ = 0, _n = A._positionRows.length;
        for (var _pi = 0; _pi < _n; _pi++) {
          _sumX += A._positionRows[_pi][4];
          _sumY += A._positionRows[_pi][5];
          _sumZ += A._positionRows[_pi][6];
        }
        var _avgX = _sumX / _n, _avgY = _sumY / _n, _avgZ = _sumZ / _n;
        A.modelOffset.x = _avgX; A.modelOffset.y = _avgY; A.modelOffset.z = _avgZ;
        A._drawBboxPlaceholders(A._positionRows);
        // Don't set A.streaming = true yet — streamBuilding() does that after meta loads
        // Otherwise streamTick sees empty queue and declares done
        A.activeBuildingTotal = _n;
        // Set camera
        var _env = Math.max(80, _n > 50000 ? 300 : 150);
        A.camera.position.set(_env * 0.6, _env * 0.8, _env * 0.6);
        A.camera.far = Math.max(10000, _env * 5);
        A.camera.updateProjectionMatrix();
        A.controls.target.set(0, 0, 0);
        A.controls.update();
        A.markDirty();
        console.log(`[S260b] §BBOX_FROM_POSITIONS count=${_n} offset=[${_avgX.toFixed(0)},${_avgY.toFixed(0)},${_avgZ.toFixed(0)}]`);
      }

      // Phase 1: Download meta.db (sync DB for panels + queries)
      A.status.textContent = _posLoaded ? 'Bboxes drawn. Loading metadata...' : 'Fetching metadata...';
      var metaBuf = await A.cachedFetch(metaUrl);
      // §PATCH-SELFHEAL: the split path must heal the SAME way the whole-db path does
      // (streaming.js §whole-db load calls this on A.DB_URL) — meta.db is the file the Room
      // lens/graph actually read in split mode, so a shipped-stale room set (e.g. Terminal's
      // pre-STAIRWELL-STACK 43 rooms) is patched here or nowhere. Raw bytes stay in IDB.
      if (A._applyPendingPatch) metaBuf = await A._applyPendingPatch(metaBuf, metaUrl);
      // §SQLJS_CLOSE (housekeeping/sqljs-close-leaks): free the prior sql.js WASM instance before
      // reassigning — an orphaned Database keeps its whole DB copy alive on the WASM heap forever
      // (no GC reaches it). Defensive-only today: A.init() runs exactly once per page life
      // (main.js:942; Ctrl+O "replace" navigates to a fresh page, scene.js:1073, and the merge path
      // folds into the LIVE A.db without reassigning), so no current user path re-enters here.
      // A.libDb may alias A.db (set just below, and at §SPLIT_GEO_FALLBACK_META / §BBOX_PAINT_YIELD)
      // — clear the alias so no closed handle survives. City-mode swaps (city.js:707/744/796/950)
      // never run this code (A.init returns before the split/single load in city mode).
      if (A.db && typeof A.db.close === 'function') {
        try { A.db.close(); } catch (e) {}
        if (A.libDb === A.db) A.libDb = null;
      }
      A.db = new SQL.Database(new Uint8Array(metaBuf));
      if (A.composeGhostsFromAggregates) A.composeGhostsFromAggregates(A.db);
      // §SQLJS_CLOSE: on a (hypothetical) re-entry a previous split-load's separate geo instance
      // would be orphaned by this alias — close it first. Never closes the live meta (!== A.db).
      if (A.libDb && A.libDb !== A.db && typeof A.libDb.close === 'function') { try { A.libDb.close(); } catch (e) {} }
      A.libDb = A.db;
      A._splitHasMeta = true;
      // §TM_SPLITMODE_PERSIST_KEY (4D_GANTT_TM_REFACTOR.md §S78): A.db's content just came from
      // metaUrl, not A.DB_URL — a persist keyed on A.DB_URL writes a slot this same loader never
      // reads back (cachedFetch(metaUrl) above resolves its OWN key from metaUrl, never A.DB_URL,
      // in split mode). One source of truth: whoever persists app.db reads THIS field instead of
      // re-deriving split state, so read-key and write-key can never drift apart.
      A._dbPersistUrl = metaUrl;
      console.log(`[S192] §DB_META_LOADED size=${(metaBuf.byteLength/1024/1024).toFixed(1)}MB`);

      // §S260b: Set activeBuilding + _hasBbox early so 4D5D relay + clash work during geo download
      try {
        // §17.17.4 (W-OCC3-LTU): no `building` column ⇒ one building, label extracted from the URL.
        var _bldRows = A._hasBuildingCol(A.db)
          ? A.db.exec("SELECT building, COUNT(*) c FROM elements_meta GROUP BY building ORDER BY c DESC LIMIT 1")
          : A.db.exec("SELECT '" + A._singleBuildingName().replace(/'/g, "''") + "' b, COUNT(*) c FROM elements_meta");
        if (_bldRows.length && _bldRows[0].values[0][0]) {
          A.activeBuilding = _bldRows[0].values[0][0];
          console.log(`[S260b] §ACTIVE_BUILDING_EARLY name=${A.activeBuilding}`);
          // §S260e: Populate HUD panels immediately on meta.db (before geo.db download)
          if (A.populateStoreys) A.populateStoreys(A.activeBuilding);
          if (A.populateDiscs) A.populateDiscs(A.activeBuilding);
          // §S260e: Building label — singular + name in single-building mode
          var _sBld = document.getElementById('s-buildings');
          if (_sBld) _sBld.textContent = A.activeBuilding;
          var _sBldLabel = _sBld && _sBld.previousElementSibling;
          if (_sBldLabel && _sBldLabel.getAttribute('data-trl') === 'ui_buildings') _sBldLabel.textContent = 'Building';
          // §S260e: Element count from meta.db
          try {
            var _bldOk2 = A._hasBuildingCol(A.db);   // §17.17.4 (W-OCC3-LTU)
            var _elCnt = _bldOk2
              ? A.db.exec("SELECT COUNT(*) FROM elements_meta WHERE building=?", [A.activeBuilding])
              : A.db.exec("SELECT COUNT(*) FROM elements_meta");
            if (_elCnt.length) {
              var _n = _elCnt[0].values[0][0];
              var _sEl = document.getElementById('s-elements');
              if (_sEl) _sEl.textContent = Number(_n).toLocaleString();
              document.getElementById('s-building-total').textContent = Number(_n).toLocaleString();
            }
          } catch(e) {}
          // §S260b: Redraw bboxes with discipline colors now that meta.db is loaded
          if (_posLoaded && A._drawBboxPlaceholders) {
            var _bldOk3 = A._hasBuildingCol(A.db);   // §17.17.4 (W-OCC3-LTU)
            var _colorRows = A.dbQuery(`SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
              t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z,
              m.storey, m.ifc_class, m.element_name, t.bbox_x, t.bbox_y, t.bbox_z
              FROM elements_meta m JOIN element_instances i ON m.guid=i.guid
              JOIN element_transforms t ON t.guid=m.guid
              WHERE ${_bldOk3 ? 'm.building=?' : '1=1'} AND i.geometry_hash IS NOT NULL AND m.ifc_class!='IfcOpeningElement'`,
              _bldOk3 ? [A.activeBuilding] : []);
            if (_colorRows.length) {
              A._drawBboxPlaceholders(_colorRows);
              console.log('[S260b] §BBOX_RECOLOR discs=' + new Set(_colorRows.map(function(r){return r[3]})).size);
            }
          }
        }
      } catch(e) {}
      if (A._hasBbox === undefined) {
        try { A.db.exec("SELECT bbox_x FROM element_transforms LIMIT 1"); A._hasBbox = true; }
        catch(e) { A._hasBbox = false; }
      }

      // §S260b: Phase 2 ��� Download geo.db fully (with progress). Sync streaming = fast.
      // Bboxes keep user engaged during download. Cached on second visit = instant.
      var _geoT0 = performance.now();
      var _geoOk = false;
      try {
        var _geoCached = await A._checkCache(geoUrl);
        console.log(`[S260b] §GEO_CACHE_CHECK url=${geoUrl.split('/').pop()} hit=${!!_geoCached}`);
        A.status.textContent = _geoCached
          ? `Loading geometry from cache...`
          : `First visit — downloading geometry (${_posLoaded ? 'bboxes visible' : 'please wait'})...`;
        var geoBuf = _geoCached || await A.cachedFetch(geoUrl);
        // §SQLJS_CLOSE: A.libDb aliases the live meta A.db here (set above) — the guard's !== A.db
        // check makes it a no-op in the normal flow; it only fires if a future reorder leaves a
        // separate prior geo instance in A.libDb. Never closes the meta DB through its alias.
        if (A.libDb && A.libDb !== A.db && typeof A.libDb.close === 'function') { try { A.libDb.close(); } catch (e) {} }
        A.libDb = new SQL.Database(new Uint8Array(geoBuf));
        A._splitHasMeta = false;  // use sync streaming path (libDb has geometry)
        var _geoMs = (performance.now() - _geoT0).toFixed(0);
        var _geoMB = (geoBuf.byteLength / 1024 / 1024).toFixed(0);
        var _src = _geoCached ? 'cache' : 'download';
        console.log(`§SPLIT_GEO_LOADED src=${_src} size=${_geoMB}MB ms=${_geoMs}`);
        A.status.textContent = `Geometry ready (${_geoMB}MB, ${(_geoMs/1000).toFixed(1)}s). Streaming meshes...`;
        _geoOk = true;
      } catch(_geoErr) {
        console.log(`§SPLIT_GEO_FAIL url=${geoUrl} err=${_geoErr.message}`);
        // Fallback: try loading _extracted.db as libDb (library pattern — geometry lives there)
        try {
          A.status.textContent = 'geo.db not found — loading extracted DB as geometry source...';
          var _extBuf = await A.cachedFetch(A.DB_URL);
          // §SQLJS_CLOSE: same alias-aware guard as the geo.db site above.
          if (A.libDb && A.libDb !== A.db && typeof A.libDb.close === 'function') { try { A.libDb.close(); } catch (e) {} }
          A.libDb = new SQL.Database(new Uint8Array(_extBuf));
          A._splitHasMeta = false;
          console.log(`§SPLIT_GEO_FALLBACK_EXTRACTED url=${A.DB_URL} size=${(_extBuf.byteLength/1024/1024).toFixed(1)}MB`);
          A.status.textContent = 'Geometry loaded from extracted DB (fallback). Streaming meshes...';
          _geoOk = true;
        } catch(_extErr) {
          console.log(`§SPLIT_GEO_FALLBACK_META err=${_extErr.message} — using meta.db (bboxes only)`);
          // §SQLJS_CLOSE: same alias-aware guard (a prior separate geo instance would be orphaned here).
          if (A.libDb && A.libDb !== A.db && typeof A.libDb.close === 'function') { try { A.libDb.close(); } catch (e) {} }
          A.libDb = A.db;
          A._splitHasMeta = true;
          A.status.textContent = 'Geometry unavailable — showing bounding boxes only.';
        }
      }
    } else {
      // ── Single DB — always full download. Range streaming only works with split DBs
      // (split = meta instant + geo range). Without split, metadata scanning via range is too chatty.
      // §OFFLINE-GATEWAY-LEAK: this size check is diagnostic-only (feeds one log line) — it must not
      // touch the network for a building already sitting in IndexedDB.
      var _dbSize = 0;
      var _dbCached = await A._checkCache(A.DB_URL);
      if (_dbCached) {
        _dbSize = _dbCached.byteLength;
      } else {
        try {
          var headR = await fetch(A.DB_URL, { method: 'HEAD' });
          _dbSize = parseInt(headR.headers.get('Content-Length') || '0', 10);
        } catch(e) {}
      }
      console.log(`[S260] §DB_SIZE_CHECK size=${(_dbSize/1024/1024).toFixed(0)}MB src=${_dbCached ? 'cache' : 'network'}`);

      // ── §S281: Single-DB instant bboxes — try the tiny positions.bin sidecar first (the same one
      // split builds use), so the wireframe preview paints before the full _extracted.db downloads.
      // Additive: a missing sidecar 404s → cachedFetch throws → caught → normal full download (unchanged).
      try {
        var _posUrl = A.DB_URL.replace('_extracted.db', '_positions.bin');
        A.status.textContent = 'Loading positions...';
        var _posBuf = await A.cachedFetch(_posUrl);
        var _posView = new DataView(_posBuf);
        var _posCount = _posView.getUint32(0, true);
        var _posRows = [];
        for (var _spi = 0; _spi < _posCount; _spi++) {
          var _soff = 4 + _spi * 24;
          _posRows.push([
            null, null, null, null,
            _posView.getFloat32(_soff, true), _posView.getFloat32(_soff + 4, true), _posView.getFloat32(_soff + 8, true),
            null, null, null, null, null, null,  // rotation, storey, class, element_name (16-slot layout — bbox at 13-15)
            _posView.getFloat32(_soff + 12, true), _posView.getFloat32(_soff + 16, true), _posView.getFloat32(_soff + 20, true)
          ]);
        }
        if (A._drawBboxPlaceholders && _posCount > 0) {
          A._positionRows = _posRows;
          var _sx = 0, _sy = 0, _sz = 0;
          for (var _qi = 0; _qi < _posCount; _qi++) { _sx += _posRows[_qi][4]; _sy += _posRows[_qi][5]; _sz += _posRows[_qi][6]; }
          A.modelOffset.x = _sx / _posCount; A.modelOffset.y = _sy / _posCount; A.modelOffset.z = _sz / _posCount;
          A._drawBboxPlaceholders(_posRows);
          A.activeBuildingTotal = _posCount;
          var _env = Math.max(80, _posCount > 50000 ? 300 : 150);
          A.camera.position.set(_env * 0.6, _env * 0.8, _env * 0.6);
          A.camera.far = Math.max(10000, _env * 5);
          A.camera.updateProjectionMatrix();
          A.controls.target.set(0, 0, 0); A.controls.update();
          A.markDirty();
          console.log(`[S260b] §POSITIONS_LOADED count=${_posCount} size=${(_posBuf.byteLength/1024).toFixed(0)}KB (single-DB preview)`);
          console.log(`[S260b] §BBOX_FROM_POSITIONS count=${_posCount} (single-DB preview)`);
        }
      } catch(e) {
        console.log(`[S281] §POSITIONS_SKIP single-DB — ${(e && e.message) ? e.message : 'no sidecar'}; full download`);
      }

      // ── Full download (single-DB path — use split_db.sh for large buildings) ──
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_fetching||'Fetching {url}...').replace('{url}',A.DB_URL);
      var dbBuf = await A.cachedFetch(A.DB_URL);
      if (A._applyPendingPatch) dbBuf = await A._applyPendingPatch(dbBuf, A.DB_URL);
      // §SQLJS_CLOSE: same defensive close-before-reassign as the split path (see comment there).
      if (A.db && typeof A.db.close === 'function') {
        try { A.db.close(); } catch (e) {}
        if (A.libDb === A.db) A.libDb = null;
      }
      A.db = new SQL.Database(new Uint8Array(dbBuf));
      if (A.composeGhostsFromAggregates) A.composeGhostsFromAggregates(A.db);
      // §TM_SPLITMODE_PERSIST_KEY — whole-db path: A.db's content IS A.DB_URL's bytes, set
      // explicitly (not left unset) so this field is never stale from a prior split-mode load.
      A._dbPersistUrl = A.DB_URL;
      console.log(`[S192] §DB_LOADED size=${(dbBuf.byteLength/1024/1024).toFixed(0)}MB`);
      // §S283: Remember last building URL for PWA resume
      try { localStorage.setItem('pwa_last_db', A.DB_URL); } catch(e) {}
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_db_loaded||'DB loaded ({size}MB). Querying...').replace('{size}',(dbBuf.byteLength/1024/1024).toFixed(0));
    }

    // §S260: Skip only if already populated (single-DB range mode does it above).
    if (Object.keys(A.buildingCentres).length === 0) {
      console.log('§CENTRES_QUERY A.db=' + (!!A.db) + ' tables=' + (A.db ? JSON.stringify(A.db.exec("SELECT name FROM sqlite_master WHERE type='table'")) : 'none'));
      try {
        // §17.17.4 (W-OCC3-LTU): with no `building` column this query used to throw inside dbQuery
        // (§HELPERS_QUERY_ERR), return [], and leave buildingCentres empty — startStreaming() then
        // silently found no building and nothing ever streamed. One building, one centre instead.
        const _bldOk = A._hasBuildingCol(A.db);
        const rows = _bldOk ? A.dbQuery(`
          SELECT m.building, COUNT(*),
            AVG(t.center_x), AVG(t.center_y), AVG(t.center_z)
          FROM elements_meta m
          JOIN element_transforms t ON t.guid = m.guid
          GROUP BY m.building
        `) : A.dbQuery(`
          SELECT '${A._singleBuildingName().replace(/'/g, "''")}', COUNT(*),
            AVG(t.center_x), AVG(t.center_y), AVG(t.center_z)
          FROM elements_meta m
          JOIN element_transforms t ON t.guid = m.guid
        `);
        console.log('§CENTRES_RESULT rows=' + rows.length + ' bldCol=' + _bldOk +
          (rows.length > 0 ? ' first=' + JSON.stringify(rows[0]) : ''));
        for (const row of rows) {
          A.buildingCentres[row[0]] = { ix: row[2], iy: row[3], iz: row[4], count: row[1] };
        }
      } catch(e) {
        console.error('§CENTRES_QUERY_ERROR ' + e.message);
      }
    }
    console.log(`[S192] §BOOTSTRAP centres=${Object.keys(A.buildingCentres).length}`);
    // §S277c: Auto-scale fog density to building envelope
    if (A._updateFogDensity) A._updateFogDensity();

    // §S261b: Populate building name + element count for all paths (single-DB was missing this)
    if (!A.activeBuilding && Object.keys(A.buildingCentres).length > 0) {
      var _firstBld = Object.keys(A.buildingCentres)[0];
      A.activeBuilding = _firstBld;
      var _sBld = document.getElementById('s-buildings');
      if (_sBld) _sBld.textContent = _firstBld;
      var _sBldLabel = _sBld && _sBld.previousElementSibling;
      if (_sBldLabel && _sBldLabel.getAttribute('data-trl') === 'ui_buildings') _sBldLabel.textContent = 'Building';
      try {
        var _elCnt = A.db.exec("SELECT COUNT(*) FROM elements_meta WHERE building=?", [_firstBld]);
        if (_elCnt.length) {
          var _n = _elCnt[0].values[0][0];
          var _sEl = document.getElementById('s-elements');
          if (_sEl) _sEl.textContent = Number(_n).toLocaleString();
          document.getElementById('s-building-total').textContent = Number(_n).toLocaleString();
        }
      } catch(e) {}
      if (A.populateStoreys) A.populateStoreys(_firstBld);
      if (A.populateDiscs) A.populateDiscs(_firstBld);
      console.log('[S261b] §SINGLE_DB_HUD building=' + _firstBld);
    }

    const allIX = Object.values(A.buildingCentres).map(b => b.ix);
    const allIY = Object.values(A.buildingCentres).map(b => b.iy);
    const allIZ = Object.values(A.buildingCentres).map(b => b.iz);
    if (allIX.length) {
      A.modelOffset.x = (Math.min(...allIX) + Math.max(...allIX)) / 2;
      A.modelOffset.y = (Math.min(...allIY) + Math.max(...allIY)) / 2;
      A.modelOffset.z = (Math.min(...allIZ) + Math.max(...allIZ)) / 2;
    }
    console.log(`[S192] §OFFSET ifc=(${A.modelOffset.x.toFixed(0)}, ${A.modelOffset.y.toFixed(0)}, ${A.modelOffset.z.toFixed(0)})`);

    // §S260c: Use _calcGroundY (slab-based) instead of raw MIN(center_z) which is wrong
    // for buildings with underground piling/basement. _calcGroundY sets A.ground.position.y.
    if (A._calcGroundY) {
      A._calcGroundY();
    } else {
      // Fallback if tools.js hasn't loaded yet
      const zRange = A.dbQuery(`SELECT MIN(center_z), MAX(center_z) FROM element_transforms`);
      if (zRange.length > 0 && zRange[0][0] != null) {
        var p = A.ifc2three(0, 0, zRange[0][0]);
        A.ground.position.y = p.y;
        console.log('[S200] §GROUND_FALLBACK minZ_y=' + p.y.toFixed(1));
      }
    }
    // §S260: Ground hidden by default — shown only when shadow or night toggled on
    A.ground.visible = !!(A._shadowOn || A._nightMode);
    console.log('[S200] §GROUND_INIT y=' + A.ground.position.y.toFixed(1) + ' visible=' + A.ground.visible);

    const elemRows = A.dbQuery(`SELECT COUNT(*) FROM elements_meta`);
    A.totalElements = elemRows.length ? elemRows[0][0] : 0;
    const discRows = A.dbQuery(`SELECT discipline, COUNT(*) FROM elements_meta GROUP BY discipline ORDER BY COUNT(*) DESC`);
    if (discRows.length > 0) {
      for (const r of discRows) {
        A.discCounts[r[0]] = r[1];
      }
    }

    A.updateHUD();
    A.populateBuildingList();
    A.drawBuildingBoxes();

    // Camera setup — use element bbox extents for envelope, buildingCentres for position
    // (new extractions have re-centred center_x/y/z near 0, so MIN/MAX of those is unreliable)
    const bboxQ = A.dbQuery(A._hasBbox
      ? `SELECT MAX(bbox_x), MAX(bbox_y), MAX(bbox_z),
              MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z)
         FROM element_transforms`
      : `SELECT NULL, NULL, NULL,
              MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z)
         FROM element_transforms`
    );
    let envW = 500, envD = 500, envH = 100;
    if (bboxQ.length > 0 && bboxQ[0][3] != null) {
      const [, , , xMin, xMax, yMin, yMax, zMin, zMax] = bboxQ[0];
      envW = xMax - xMin;
      envD = yMax - yMin;
      envH = zMax - zMin;
    }
    // If envelope is too small (re-centred DB), use sum of bbox spreads from buildingCentres
    if (envW < 1 && Object.keys(A.buildingCentres).length > 0) {
      const bc = Object.values(A.buildingCentres)[0];
      // Estimate from element count: sqrt(count) * typical spacing
      envW = Math.max(50, Math.sqrt(bc.count) * 2);
      envD = envW; envH = envW * 0.5;
    }
    const envelope = Math.max(envW, envD, envH);
    for (const bc of Object.values(A.buildingCentres)) {
      bc.envelope = envelope;
    }
    const dist = Math.max(80, envelope * 1.5);
    // Use buildingCentres for camera target (has IFC world coords via modelOffset)
    const firstBc = Object.values(A.buildingCentres)[0];
    const ctr = firstBc
      ? A.ifc2three(firstBc.ix, firstBc.iy, firstBc.iz)
      : A.ifc2three(0, 0, 0);
    A.camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.8, ctr.z + dist * 0.6);
    A.camera.far = Math.max(10000, dist * 5);
    A.camera.updateProjectionMatrix();
    A.controls.target.set(ctr.x, ctr.y, ctr.z);
    A.controls.update();
    console.log(`[S203] §CAMERA envelope=${envW.toFixed(0)}x${envD.toFixed(0)}x${envH.toFixed(0)}m dist=${dist.toFixed(0)}m`);

    window._trueNorthAngle = 0;
    try {
      const tnRows = A.dbQuery("SELECT value FROM project_metadata WHERE key = 'true_north_angle'");
      if (tnRows.length > 0) {
        window._trueNorthAngle = parseFloat(tnRows[0][0]) || 0;
        console.log(`[S204] §TRUE_NORTH ${window._trueNorthAngle}° from grid Y`);
      }
    } catch(e) { /* no project_metadata table */ }

    // Deep-link camera restore
    const hashParams = A.loadFromHash();
    if (hashParams && hashParams.cx) {
      A.camera.position.set(Number(hashParams.cx), Number(hashParams.cy), Number(hashParams.cz));
      A.controls.target.set(Number(hashParams.tx), Number(hashParams.ty), Number(hashParams.tz));
      A.controls.update();
    }

    // Draw bbox placeholders immediately (extDb has all needed data)
    // streamTick() guards on !A.libDb so real meshes won't start until library arrives
    if (hashParams && hashParams.bld && A.buildingCentres[hashParams.bld]) {
      A.streamBuilding(hashParams.bld);
    } else {
      A.startStreaming();
    }
    console.log(`[S241] §BBOX_EARLY placeholders drawn before library fetch`);

    // Single DB — geometry is in the same DB (split mode sets libDb asynchronously)
    // §S260: Range mode uses async _rangeDb for geometry; sync A.db for metadata
    // Non-range, non-split: libDb = same sync DB
    // §BBOX-PAINT-FIRST — yield ~2 frames so the bbox placeholders actually paint before
    // libDb is enabled (streamTick gates on libDb), i.e. before mesh streaming grabs the thread.
    if (!_splitMode && !A._useRangeStream) {
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      // §SQLJS_CLOSE: same alias-aware guard — a re-entry after a previous SPLIT load would
      // otherwise orphan that load's separate geo instance here.
      if (A.libDb && A.libDb !== A.db && typeof A.libDb.close === 'function') { try { A.libDb.close(); } catch (e) {} }
      A.libDb = A.db;
      console.log('[S241] §BBOX_PAINT_YIELD bboxes painted; enabling mesh stream');
    }
  };

  // URL deep-link
  A.updateHash = function() {
    if (!A.activeBuilding) return;
    // Don't overwrite clash deep-link hash
    if (location.hash.indexOf('clash=') >= 0) return;
    const p = A.camera.position;
    const t = A.controls.target;
    location.hash = `bld=${A.activeBuilding}&cx=${p.x.toFixed(0)}&cy=${p.y.toFixed(0)}&cz=${p.z.toFixed(0)}&tx=${t.x.toFixed(0)}&ty=${t.y.toFixed(0)}&tz=${t.z.toFixed(0)}`;
  };

  A.loadFromHash = function() {
    const h = location.hash.slice(1);
    if (!h) return null;
    const params = {};
    h.split('&').forEach(p => { const [k, v] = p.split('='); params[k] = v; });
    return params;
  };

  // Clear — handles both Mesh and InstancedMesh
  A.clearStreamed = function() {
    // §6.8 DLOD — disable before clearing scene
    if (A.dlodDisable) A.dlodDisable('clear');
    // Dispose active pick highlight
    if (window._pickHighlight) {
      const prev = window._pickHighlight;
      if (prev.parent) prev.parent.remove(prev);
      if (prev.geometry) prev.geometry.dispose();
      if (prev.material) prev.material.dispose();
      window._pickHighlight = null;
    }
    const toRemove = A.collectMeshes(o => o.isMesh || o.isInstancedMesh || o.isBatchedMesh);
    toRemove.forEach(obj => {
      A.scene.remove(obj);
      // §MEMLEAK_BVH_DISPOSE: three-mesh-bvh's `geometry.boundsTree` is a monkey-patched
      // property (loader.js) sitting outside BufferGeometry's own 'dispose' event chain —
      // plain geometry.dispose() does NOT free it. Must call disposeBoundsTree() first.
      if (obj.geometry && obj.geometry.boundsTree && obj.geometry.disposeBoundsTree) obj.geometry.disposeBoundsTree();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    // Dispose cached geometry BLOBs — these are the raw BufferGeometry objects
    // that back all scene meshes. Safe to dispose now that meshes are removed.
    for (const geo of Object.values(A.meshCache)) {
      if (geo && geo.boundsTree && geo.disposeBoundsTree) geo.disposeBoundsTree();
      if (geo && geo.dispose) geo.dispose();
    }
    A.meshCache = {};
    A.streamedCount = 0;
    A.streaming = false;
    A.streamQueue = [];
    A.streamIdx = 0;
    A.activeBuilding = null;
    A.activeBuildingTotal = 0;
    A.buildingsRendered.clear();
    A._pendingInstances = {};
    A._instanceMeta = {};
    A._instanceGuids = {};
    A._matCache = {};
    A._mepHueCounts = {}; A._instMepUniform = 0; A._instMepMixed = 0;   // §MEP_COLOR_SURVIVES_PHOTOREAL — per-building, die with the material cache
    // §CPE_MATERIAL_KEY: the material_name column probe is per-DB, so a scene reset (which is where
    // a DIFFERENT db gets opened) must re-probe rather than carry a stale answer — the exact
    // stale-cache hazard §MERGE_BLDCOL calls out for A._buildingCol.
    A._matNameCol = undefined;
    // §MERGED_GUID: merged identity dies with the meshes it addressed (index ranges are per-mesh).
    A._mergedMeta = {};
    A._mergedIndex = {};
    A._mergeActive = false;
    A._mergeLogged = false;
    document.getElementById('s-streamed').textContent = '0';
    document.getElementById('s-building-total').textContent = '0';
    document.getElementById('s-buildings-done').textContent = '0';
    document.getElementById('s-active').textContent = '—';
    document.getElementById('s-active').style.color = '#4fc3f7';
    console.log(`[S231] §CLEAR removed=${toRemove.length}`);
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_search||'Cleared. Search and click a building to stream.');
  };

  // Fly to building
  A.flyTo = function(buildingName) {
    const bc = A.buildingCentres[buildingName];
    if (!bc) return;
    if (!A.libDb) {
      // Library DB still loading — reposition camera but don't stream yet
      A.status.textContent = `Loading library… click ${buildingName} again in a moment.`;
      console.log(`[S192] §FLY_TO_EARLY bld=${buildingName} libDb not ready yet`);
      const t = A.ifc2three(bc.ix, bc.iy, bc.iz);
      const dist = Math.max(50, Math.sqrt(bc.count) * 1.5);
      A.camera.position.set(t.x + dist * 0.7, t.y + dist * 1.0, t.z + dist * 0.7);
      A.controls.target.set(t.x, t.y, t.z);
      A.controls.update();
      return;
    }
    const t = A.ifc2three(bc.ix, bc.iy, bc.iz);
    const dist = Math.max(50, Math.sqrt(bc.count) * 1.5);
    A.camera.position.set(t.x + dist * 0.7, t.y + dist * 1.0, t.z + dist * 0.7);
    A.controls.target.set(t.x, t.y, t.z);
    A.camera.far = Math.max(5000, dist * 10);
    A.camera.updateProjectionMatrix();
    A.controls.update();
    console.log(`[S192] §FLY_TO bld=${buildingName} three=(${t.x.toFixed(0)},${t.y.toFixed(0)},${t.z.toFixed(0)}) dist=${dist.toFixed(0)}`);
    document.getElementById('s-active').style.color = '#4fc3f7';
    document.getElementById('s-progress').style.width = '0%';
    document.getElementById('s-progress').style.background = '#4fc3f7';
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_flew_to||'Flew to {name} ({n} elements)').replace('{name}',buildingName).replace('{n}',bc.count);

    if (A.libDb && !A.buildingsRendered.has(buildingName) && A.activeBuilding !== buildingName) {
      A.streamBuilding(buildingName);
    }
  };
}
