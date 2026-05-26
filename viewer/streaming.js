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
          var bboxCols = A._hasBbox ? ', t.bbox_x, t.bbox_y, t.bbox_z' : '';
          var result = await A._rangeDb.exec(`
            SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
                   t.center_x, t.center_y, t.center_z,
                   t.rotation_x, t.rotation_y, t.rotation_z,
                   m.storey, m.ifc_class${bboxCols}
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
            // r: [guid, hash, rgba, disc, cx, cy, cz, rx, ry, rz, storey, ifcClass, bx?, by?, bz?]
            _insertMeta.run([r[0], nearest, r[10], r[3], r[11]]);
            _insertTx.run([r[0], r[4], r[5], r[6], A._hasBbox ? r[12] : null, A._hasBbox ? r[13] : null, A._hasBbox ? r[14] : null]);
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
      const bboxCols = A._hasBbox ? ', t.bbox_x, t.bbox_y, t.bbox_z' : '';
      const rows = A.dbQuery(`
        SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
               t.center_x, t.center_y, t.center_z,
               t.rotation_x, t.rotation_y, t.rotation_z,
               m.storey, m.ifc_class${bboxCols}
        FROM elements_meta m
        JOIN element_instances i ON m.guid = i.guid
        JOIN element_transforms t ON t.guid = m.guid
        WHERE m.building = ?
          AND i.geometry_hash IS NOT NULL
          AND m.ifc_class != 'IfcOpeningElement'
      `, [nearest]);
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
    // row: [guid, hash, rgba, disc, cx, cy, cz, rotX, rotY, rotZ, storey, ifc_class, bbox_x, bbox_y, bbox_z]
    const byDisc = {};
    for (let i = 0; i < rows.length; i += step) {
      const disc = rows[i][3] || '_';
      if (!byDisc[disc]) byDisc[disc] = [];
      byDisc[disc].push(rows[i]);
    }
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
        console.log(`[BBOX] §BBOX_PLACEHOLDERS total=${rows.length} shown=${shown} step=${step} discs=${discEntries.length} mobile=${A._isMobile}`);
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
          var bx = r[12] || 0.3, by = r[13] || 0.3, bz = r[14] || 0.3;
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


  A._getMaterial = function(rgbaStr, ifcClass) {
    // §S265: Standard reference materials — real-world color + roughness + metalness per IFC class.
    // Applied when IFC author assigned no material (NULL or monochrome grey).
    // Does NOT modify the DB — runtime only.
    var STD_MAT = {
      // ── Structure: concrete + steel ──
      IfcWall:                { r: 0.85, g: 0.82, b: 0.78, rough: 0.85, metal: 0.00 },  // concrete/plaster
      IfcWallStandardCase:    { r: 0.92, g: 0.91, b: 0.88, rough: 0.75, metal: 0.00 },  // painted plaster
      IfcSlab:                { r: 0.72, g: 0.70, b: 0.68, rough: 0.90, metal: 0.00 },  // cast concrete
      IfcColumn:              { r: 0.65, g: 0.64, b: 0.62, rough: 0.80, metal: 0.05 },  // reinforced concrete
      IfcBeam:                { r: 0.55, g: 0.57, b: 0.60, rough: 0.35, metal: 0.65 },  // steel I-beam
      IfcMember:              { r: 0.50, g: 0.52, b: 0.55, rough: 0.40, metal: 0.60 },  // steel section
      IfcPlate:               { r: 0.48, g: 0.50, b: 0.53, rough: 0.30, metal: 0.70 },  // steel plate
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
      IfcRailing:             { r: 0.40, g: 0.42, b: 0.45, rough: 0.35, metal: 0.55 },  // metal railing
      IfcRamp:                { r: 0.70, g: 0.68, b: 0.65, rough: 0.85, metal: 0.00 },  // concrete ramp
      // ── Furniture/fittings ──
      IfcFurniture:           { r: 0.65, g: 0.48, b: 0.32, rough: 0.60, metal: 0.00 },  // wood/fabric
      IfcFurnishingElement:   { r: 0.65, g: 0.48, b: 0.32, rough: 0.60, metal: 0.00 },  // wood/fabric
      // ── MEP: pipes + ducts ──
      IfcPipe:                { r: 0.60, g: 0.62, b: 0.65, rough: 0.40, metal: 0.45 },  // galvanized
      IfcPipeFitting:         { r: 0.58, g: 0.60, b: 0.63, rough: 0.40, metal: 0.45 },
      IfcPipeSegment:         { r: 0.58, g: 0.60, b: 0.63, rough: 0.40, metal: 0.45 },
      IfcDuct:                { r: 0.55, g: 0.58, b: 0.55, rough: 0.45, metal: 0.40 },  // sheet metal
      IfcDuctFitting:         { r: 0.53, g: 0.56, b: 0.53, rough: 0.45, metal: 0.40 },
      IfcDuctSegment:         { r: 0.53, g: 0.56, b: 0.53, rough: 0.45, metal: 0.40 },
      IfcCableCarrier:        { r: 0.50, g: 0.52, b: 0.48, rough: 0.50, metal: 0.35 },
      // ── MEP: terminals + devices ──
      IfcFlowTerminal:        { r: 0.45, g: 0.50, b: 0.55, rough: 0.40, metal: 0.30 },
      IfcFlowSegment:         { r: 0.48, g: 0.52, b: 0.58, rough: 0.40, metal: 0.30 },
      IfcFlowFitting:         { r: 0.50, g: 0.53, b: 0.57, rough: 0.40, metal: 0.30 },
      IfcFlowController:      { r: 0.80, g: 0.30, b: 0.25, rough: 0.50, metal: 0.20 },  // red valve
      IfcFlowMovingDevice:    { r: 0.50, g: 0.60, b: 0.55, rough: 0.45, metal: 0.30 },
      IfcFlowTreatmentDevice: { r: 0.50, g: 0.58, b: 0.55, rough: 0.50, metal: 0.20 },
      IfcEnergyConversionDevice: { r: 0.45, g: 0.55, b: 0.50, rough: 0.50, metal: 0.25 },
      IfcLightFixture:        { r: 0.80, g: 0.75, b: 0.50, rough: 0.25, metal: 0.30 },  // brass/chrome
      IfcSanitaryTerminal:    { r: 0.88, g: 0.88, b: 0.85, rough: 0.15, metal: 0.05 },  // ceramic
      IfcAirTerminal:         { r: 0.55, g: 0.65, b: 0.70, rough: 0.40, metal: 0.30 },
      IfcFireSuppressionTerminal: { r: 0.80, g: 0.30, b: 0.25, rough: 0.50, metal: 0.30 }, // red
      IfcValve:               { r: 0.55, g: 0.50, b: 0.45, rough: 0.40, metal: 0.45 },
      IfcAlarm:               { r: 0.75, g: 0.25, b: 0.25, rough: 0.50, metal: 0.20 },  // red
      IfcElectricAppliance:   { r: 0.60, g: 0.65, b: 0.55, rough: 0.50, metal: 0.15 },
      // ── Proxy/other ──
      IfcBuildingElementProxy:{ r: 0.00, g: 0.78, b: 0.78, rough: 0.50, metal: 0.10 },  // teal
      IfcTransportElement:    { r: 0.50, g: 0.50, b: 0.55, rough: 0.40, metal: 0.50 },  // elevator
    };

    const key = rgbaStr || '_default';
    var cacheKey = key + '|' + (ifcClass || '');
    if (A._matCache[cacheKey]) return A._matCache[cacheKey];
    let r = 0.7, g = 0.7, b = 0.7, a = 1.0;
    if (rgbaStr && rgbaStr.includes(',')) {
      const parts = rgbaStr.split(',').map(Number);
      r = parts[0]; g = parts[1]; b = parts[2];
      if (parts.length >= 4 && parts[3] < 1.0) a = parts[3];
    }
    // §S265c: Trust IFC data. Only NULL (no color assigned) gets class fallback.
    // For grey buildings (Terminal/LTU), user applies Sunglasses slider on demand.
    var stdMat = (ifcClass && STD_MAT[ifcClass]) ? STD_MAT[ifcClass] : null;
    if (!rgbaStr && stdMat) {
      r = stdMat.r; g = stdMat.g; b = stdMat.b;
    }
    // §S260d: Gentler near-white taming — let ACES tone mapping handle the rest
    if (r > 0.85 && g > 0.85 && b > 0.85) { r *= 0.92; g *= 0.92; b *= 0.92; }
    const opts = { color: new THREE.Color(r, g, b), flatShading: false };
    if (a < 1.0) { opts.transparent = true; opts.opacity = a; opts.side = THREE.DoubleSide; }
    // §S265: PBR roughness + metalness from standard material (or defaults)
    opts.roughness = stdMat ? stdMat.rough : 0.7;
    opts.metalness = stdMat ? stdMat.metal : 0.05;
    opts.side = THREE.DoubleSide; // §S260d: IFC geometry has inconsistent normals — DoubleSide ensures pick works
    if (A._envMap) { opts.envMap = A._envMap; opts.envMapIntensity = 0.3; }
    const mat = new THREE.MeshStandardMaterial(opts);
    // §S277: Procedural normal perturbation — gives surface texture to flat IFC geometry.
    // Metallic surfaces (pipes, ducts, beams): fine brushed-metal grain.
    // Rough surfaces (concrete, slabs, walls): coarse pebble texture.
    // Zero geometry cost. Reduces temporal aliasing shimmer on flat-color surfaces.
    var _perturbScale = 0;
    if (stdMat && stdMat.metal > 0.3) _perturbScale = 0.15;  // metal: subtle brushed grain
    else if (stdMat && stdMat.rough > 0.7) _perturbScale = 0.25;  // concrete: visible grain
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
    mat.userData.origOpacity = a;
    mat.userData.origSide = a < 1.0 ? THREE.DoubleSide : THREE.FrontSide;
    if (A.xrayOn) { mat.transparent = true; mat.opacity = 0.3; mat.side = THREE.DoubleSide; }
    if (A.wireOn) { mat.wireframe = true; }
    if (A.sectionOn) { mat.clippingPlanes = [A.sectionPlane]; mat.clipShadows = true; }
    A._matCache[cacheKey] = mat;
    return mat;
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
        if (A.activeBuilding) {
          A.buildingsRendered.add(A.activeBuilding);
          A.populateStoreys(A.activeBuilding);
          A.populateDiscs(A.activeBuilding);
        }
        // §S280c: Perf diagnostics — count draw calls, VRAM, mesh types
        var _bmCount = 0, _imCount = 0, _bmSlots = 0, _imInstances = 0, _otherMesh = 0;
        var _bmVerts = 0, _imVerts = 0;
        A.scene.traverse(function(obj) {
          if (obj.isBatchedMesh) {
            _bmCount++;
            if (A._batchMeta && A._batchMeta[obj.id]) _bmSlots += A._batchMeta[obj.id].length;
            if (obj.geometry && obj.geometry.attributes.position) _bmVerts += obj.geometry.attributes.position.count;
          } else if (obj.isInstancedMesh) {
            _imCount++;
            _imInstances += obj.count;
            if (obj.geometry && obj.geometry.attributes.position) _imVerts += obj.geometry.attributes.position.count;
          } else if (obj.isMesh) {
            _otherMesh++;
          }
        });
        console.log('§S280c_PERF_REPORT ──────────────────────────────');
        console.log('§S280c  BatchedMesh:  ' + _bmCount + ' objects, ' + _bmSlots + ' slots, ' + (_bmVerts/1000).toFixed(0) + 'K verts');
        console.log('§S280c  InstancedMesh: ' + _imCount + ' objects, ' + _imInstances + ' instances, ' + (_imVerts/1000).toFixed(0) + 'K unique verts');
        console.log('§S280c  Other meshes: ' + _otherMesh);
        console.log('§S280c  TOTAL draw calls: ' + (_bmCount + _imCount + _otherMesh));
        console.log('§S280c  GPU verts/frame: ~' + ((_bmVerts + _imVerts)/1000).toFixed(0) + 'K (BM copied + IM shared)');
        console.log('§S280c ──────────────────────────────────────────');
        // §S262: Enable DLOD frustum + storey visibility culling (no geometry swap)
        if (A.dlodEnable) {  // §S265: DLOD visibility culling on all devices
          A.dlodEnable();
          if (A.dlodTick) A.dlodTick();
        }
        // §S258: Deferred BVH build — batch in background so streaming isn't blocked
        if (window._bvhReady) {
          var _bvhHashes = Object.keys(A.meshCache);
          var _bvhIdx = 0;
          var _bvhT0 = performance.now();
          (function _bvhBatch() {
            // §S280b: Time-budgeted — max 8ms per batch to stay under 16ms frame budget
            var _batchT0 = performance.now();
            while (_bvhIdx < _bvhHashes.length && (performance.now() - _batchT0) < 8) {
              var geo = A.meshCache[_bvhHashes[_bvhIdx]];
              if (geo && geo.computeBoundsTree && !geo.boundsTree) {
                try { geo.computeBoundsTree(); } catch(e) {}
              }
              _bvhIdx++;
            }
            if (_bvhIdx < _bvhHashes.length) {
              (window.requestIdleCallback || setTimeout)(_bvhBatch);
            } else {
              console.log('[S258] §BVH_DEFERRED built=' + _bvhHashes.length +
                ' ms=' + (performance.now() - _bvhT0).toFixed(0));
              // §S260b: BVH for BatchedMesh — per-slot frustum culling
              if (typeof window.computeBatchedBoundsTree === 'function') {
                var _bmT0 = performance.now();
                A.scene.traverse(function(obj) {
                  if (obj.isBatchedMesh) {
                    try { window.computeBatchedBoundsTree(obj); } catch(e) {}
                  }
                });
                console.log('[S260b] §BATCHED_BVH ms=' + (performance.now() - _bmT0).toFixed(0));
              }
            }
          })();
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
                      if (geo) { A.meshCache[ghash] = geo; fetched++; }
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
                if (geo) { A.meshCache[ghash] = geo; fetched++; }
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
      const [guid, hash, rgba, disc, cx, cy, cz, rotX, rotY, rotZ, storey, ifcClass] = row;
      if (!hash || !A.meshCache[hash]) continue;
      if (!A._pendingInstances[hash]) A._pendingInstances[hash] = [];
      A._pendingInstances[hash].push({ guid, hash, rgba, disc, cx, cy, cz,
        rotX: rotX || 0, rotY: rotY || 0, rotZ: rotZ || 0,
        storey: storey || '', ifcClass,
        bx: row[12] || 0.3, by: row[13] || 0.3, bz: row[14] || 0.3 });
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

    // ── S232: On mobile, bucket single-instance elements for merge ──
    const mergeBuckets = {};  // key: "storey|disc|rgba" → [{el, geo}, ...]
    // ── S260: On desktop, bucket single-instance elements for BatchedMesh ──
    // §S261: When _useDlodPath, these buckets are passed to _flushBboxBatched instead
    const batchBuckets = {};  // key: "storey|disc|rgba" → [{el, geo}, ...]

    for (const [hash, elements] of Object.entries(A._pendingInstances)) {
      const geo = A.meshCache[hash];
      if (!geo) continue;

      if (elements.length === 1) {
        // §S260: Single-instance hash → BatchedMesh bucket (one draw call per bucket)
        // ≤5 threshold reverted: IM shares geometry buffer, BM copies it per addGeometry.
        // 5 instances of 100-vert mesh: IM=100 verts, BM=500 verts. 3× VRAM inflation.
        const el = elements[0];
        const key = (el.storey || '_') + '|' + (el.disc || '_') + '|' + (el.rgba || '_default');
        if (!batchBuckets[key]) batchBuckets[key] = [];
        batchBuckets[key].push({ el: el, geo: geo });
      } else {
        // 2+ instances — InstancedMesh (shared geometry buffer, GPU instancing)
        const mat = A._getMaterial(elements[0].rgba, elements[0].ifcClass);
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

          meta.push({ guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass || '', instanceIndex: i, bx: el.bx || 0.3, by: el.by || 0.3, bz: el.bz || 0.3 });
          A._instanceGuids[el.guid] = { meshId: iMesh.id, instanceIndex: i };
          A.guidMap[iMesh.id + '_' + i] = el.guid;
        }
        iMesh.instanceMatrix.needsUpdate = true;
        iMesh.userData.isInstanced = true;
        iMesh.userData.hash = hash;
        iMesh.userData.ifcClass = elements[0].ifcClass || '';
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
        const mat = A._getMaterial(rgba === '_default' ? null : rgba, batchCls);
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

          // Position via matrix
          const pos = A.ifc2three(el.cx, el.cy, el.cz);
          _pos.set(pos.x, pos.y, pos.z);
          _euler.set(el.rotX || 0, el.rotZ || 0, -(el.rotY || 0));
          _quat.setFromEuler(_euler);
          _m4.compose(_pos, _quat, _scale);
          bm.setMatrixAt(slotId, _m4);

          // Storey/disc visibility filter
          var vis = true;
          if (A.activeStoreyFilter !== null && el.storey !== A.activeStoreyFilter) vis = false;
          if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) vis = false;
          if (!vis) bm.setVisibleAt(slotId, false);

          // Metadata for pick + filter
          meta.push({ guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass || '', slotId: slotId, bx: el.bx || 0.3, by: el.by || 0.3, bz: el.bz || 0.3 });
          A.guidMap[bm.id + '_' + slotId] = el.guid;

          // Reverse maps for filter
          var sk = el.storey || '';
          if (!A._batchStoreyMap[sk]) A._batchStoreyMap[sk] = [];
          A._batchStoreyMap[sk].push({ mesh: bm, slotId: slotId });
          var dk = el.disc || '';
          if (!A._batchDiscMap[dk]) A._batchDiscMap[dk] = [];
          A._batchDiscMap[dk].push({ mesh: bm, slotId: slotId });
        }

        A._batchMeta[bm.id] = meta;
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
          const mat = A._getMaterial(el.rgba, el.ifcClass);
          const mesh = new THREE.Mesh(item.geo, mat);
          const pos = A.ifc2three(el.cx, el.cy, el.cz);
          mesh.position.set(pos.x, pos.y, pos.z);
          if (el.rotX || el.rotY || el.rotZ) mesh.rotation.set(el.rotX, el.rotZ, -el.rotY);
          mesh.userData.storey = el.storey; mesh.userData.disc = el.disc;
          mesh.userData.guid = el.guid; mesh.userData.ifcClass = el.ifcClass || '';
          A.guidMap[mesh.id] = el.guid;
          if (A.activeStoreyFilter !== null && el.storey !== A.activeStoreyFilter) mesh.visible = false;
          if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) mesh.visible = false;
          A.scene.add(mesh);
          batchedCount++;
          drawCalls++;
        }
      }
      _prevDrawCalls = batchedCount;
    }

    // ── S232: Merge single-instance buckets on mobile ──
    if (A._isMobile) {
      for (const [key, items] of Object.entries(mergeBuckets)) {
        if (items.length === 0) continue;
        const [storey, disc, rgba] = key.split('|');

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
          for (let v = 0; v < count; v++) {
            _v.set(srcPos.getX(v), srcPos.getY(v), srcPos.getZ(v));
            _v.applyMatrix4(_m4);
            mergedPos[(vOff + v) * 3] = _v.x;
            mergedPos[(vOff + v) * 3 + 1] = _v.y;
            mergedPos[(vOff + v) * 3 + 2] = _v.z;
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
          vOff += count;
          vBase += count;
        }

        const mergedGeo = new THREE.BufferGeometry();
        mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
        if (mergedNorm) mergedGeo.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
        mergedGeo.setIndex(new THREE.BufferAttribute(mergedIdx, 1));

        const mat = A._getMaterial(rgba === '_default' ? null : rgba, null);
        const mesh = new THREE.Mesh(mergedGeo, mat);
        mesh.userData.storey = storey === '_' ? '' : storey;
        mesh.userData.disc = disc === '_' ? '' : disc;
        mesh.userData.isMerged = true;
        mesh.userData.mergedCount = items.length;
        if (A.activeStoreyFilter !== null && mesh.userData.storey !== A.activeStoreyFilter) mesh.visible = false;
        if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(mesh.userData.disc)) mesh.visible = false;
        A.scene.add(mesh);
        mergedCount += items.length;
        drawCalls++;
      }
    }

    A._pendingInstances = {};
    // §S276: suppress intermediate flush logs — final summary logged at stream end
    if (!A._batchFlushCount) A._batchFlushCount = 0;
    A._batchFlushCount++;
    if (A._batchFlushCount <= 1 || A.streamIdx >= A.streamQueue.length - 1) {
      console.log(`[S260] §BATCHED_FLUSH instanced=${instancedCount} batched=${batchedCount} drawCalls=${drawCalls} (was ${instancedCount + batchedCount}) mobile=${A._isMobile}`);
      if (batchedCount > 0) {
        console.log(`§BATCHED_DETAIL buckets=${Object.keys(batchBuckets).length} elements=${batchedCount} saved=${_prevDrawCalls - Object.keys(batchBuckets).length} drawCalls`);
      }
    }
    document.getElementById('s-meshes').textContent = drawCalls.toLocaleString() + ' draw calls';
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
        var mat = A._getMaterial(rgba === '_default' ? null : rgba, batchCls);
        for (var fi = 0; fi < fallbackItems.length; fi++) {
          var el = fallbackItems[fi].el;
          var m = new THREE.Mesh(fallbackItems[fi].geo, mat);
          var p = A.ifc2three(el.cx, el.cy, el.cz);
          m.position.set(p.x, p.y, p.z);
          if (el.rotX || el.rotY || el.rotZ) m.rotation.set(el.rotX, el.rotZ, -el.rotY);
          m.userData.storey = el.storey; m.userData.disc = el.disc;
          m.userData.guid = el.guid; m.userData.ifcClass = el.ifcClass || '';
          A.guidMap[m.id] = el.guid;
          if (A.activeStoreyFilter !== null && el.storey !== A.activeStoreyFilter) m.visible = false;
          if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) m.visible = false;
          A.scene.add(m);
          drawCalls++;
          skipCount++;
        }
      }

      if (!slotReservations.length) continue;

      // Create BatchedMesh with reserved capacity
      var batchCls = slotReservations[0].item.el.ifcClass || '';
      var mat = A._getMaterial(rgba === '_default' ? null : rgba, batchCls);
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
        if (A.activeStoreyFilter !== null && el.storey !== A.activeStoreyFilter) vis = false;
        if (A.hiddenDiscs.size > 0 && A.hiddenDiscs.has(el.disc)) vis = false;
        if (!vis) bm.setVisibleAt(slotId, false);

        // Metadata (same as _flushInstanced)
        meta.push({ guid: el.guid, storey: el.storey, disc: el.disc, ifcClass: el.ifcClass || '', slotId: slotId });
        A.guidMap[bm.id + '_' + slotId] = el.guid;
        var sk = el.storey || '';
        if (!A._batchStoreyMap[sk]) A._batchStoreyMap[sk] = [];
        A._batchStoreyMap[sk].push({ mesh: bm, slotId: slotId });
        var dk = el.disc || '';
        if (!A._batchDiscMap[dk]) A._batchDiscMap[dk] = [];
        A._batchDiscMap[dk].push({ mesh: bm, slotId: slotId });

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
  };

  // §S260c: Consolidate fragmented BatchedMesh from progressive flushes into one set.
  // Progressive flush creates N sets of BatchedMesh (one per 5000-element chunk).
  // After streaming ends, this removes them and rebuilds ONE BatchedMesh per bucket
  // from streamQueue + meshCache. r160 has no getGeometryIdAt, so we rebuild from source.
  // LTU 122K: 26 flushes × 40 buckets = 1040 draw calls → consolidated to ~40.
  // §S280c: _consolidateBatched removed — progressive BMs from flushes are fine.
  // Was: rebuild all BMs from streamQueue after streaming ends.
  // Problem: synchronous 63K iteration + 14K addGeometry = 1-5s main thread block.
  // The 420 progressive BMs + 6K IMs rendered fast without consolidation.

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
    var _splitMode = false;
    var metaUrl = A.DB_URL.replace('_extracted.db', '_meta.db');
    // §S260b: Also handle plain names like "hospital.db" → "hospital_meta.db"
    if (metaUrl === A.DB_URL) metaUrl = A.DB_URL.replace(/\.db$/, '_meta.db');
    if (metaUrl !== A.DB_URL) {
      try {
        var headResp = await fetch(metaUrl, { method: 'HEAD' });
        _splitMode = headResp.ok;
      } catch(e) { _splitMode = false; }
    }
    console.log(`[S192] §DB_SPLIT_DETECT meta=${metaUrl} found=${_splitMode}`);

    if (_splitMode) {
      // ── §S260b: Three-phase — positions.bin (instant bboxes) → meta.db (panels) → geo.db (meshes) ──
      var geoUrl = A.DB_URL.replace('_extracted.db', '_geo.db');
      var _geoAbsUrl = new URL(geoUrl, location.href).href;
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
            null, null, null, null, null,        // rotation, storey, class
            posView.getFloat32(off + 12, true), // bbox_x
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
      A.db = new SQL.Database(new Uint8Array(metaBuf));
      A.libDb = A.db;
      A._splitHasMeta = true;
      console.log(`[S192] §DB_META_LOADED size=${(metaBuf.byteLength/1024/1024).toFixed(1)}MB`);

      // §S260b: Set activeBuilding + _hasBbox early so 4D5D relay + clash work during geo download
      try {
        var _bldRows = A.db.exec("SELECT building, COUNT(*) c FROM elements_meta GROUP BY building ORDER BY c DESC LIMIT 1");
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
            var _elCnt = A.db.exec("SELECT COUNT(*) FROM elements_meta WHERE building=?", [A.activeBuilding]);
            if (_elCnt.length) {
              var _n = _elCnt[0].values[0][0];
              var _sEl = document.getElementById('s-elements');
              if (_sEl) _sEl.textContent = Number(_n).toLocaleString();
              document.getElementById('s-building-total').textContent = Number(_n).toLocaleString();
            }
          } catch(e) {}
          // §S260b: Redraw bboxes with discipline colors now that meta.db is loaded
          if (_posLoaded && A._drawBboxPlaceholders) {
            var _colorRows = A.dbQuery(`SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
              t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z,
              m.storey, m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z
              FROM elements_meta m JOIN element_instances i ON m.guid=i.guid
              JOIN element_transforms t ON t.guid=m.guid
              WHERE m.building=? AND i.geometry_hash IS NOT NULL AND m.ifc_class!='IfcOpeningElement'`, [A.activeBuilding]);
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
          A.libDb = new SQL.Database(new Uint8Array(_extBuf));
          A._splitHasMeta = false;
          console.log(`§SPLIT_GEO_FALLBACK_EXTRACTED url=${A.DB_URL} size=${(_extBuf.byteLength/1024/1024).toFixed(1)}MB`);
          A.status.textContent = 'Geometry loaded from extracted DB (fallback). Streaming meshes...';
          _geoOk = true;
        } catch(_extErr) {
          console.log(`§SPLIT_GEO_FALLBACK_META err=${_extErr.message} — using meta.db (bboxes only)`);
          A.libDb = A.db;
          A._splitHasMeta = true;
          A.status.textContent = 'Geometry unavailable — showing bounding boxes only.';
        }
      }
    } else {
      // ── Single DB — always full download. Range streaming only works with split DBs
      // (split = meta instant + geo range). Without split, metadata scanning via range is too chatty.
      var _dbSize = 0;
      try {
        var headR = await fetch(A.DB_URL, { method: 'HEAD' });
        _dbSize = parseInt(headR.headers.get('Content-Length') || '0', 10);
      } catch(e) {}
      console.log(`[S260] §DB_SIZE_CHECK size=${(_dbSize/1024/1024).toFixed(0)}MB`);

      // ── Full download (single-DB path — use split_db.sh for large buildings) ──
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_fetching||'Fetching {url}...').replace('{url}',A.DB_URL);
      var dbBuf = await A.cachedFetch(A.DB_URL);
      A.db = new SQL.Database(new Uint8Array(dbBuf));
      console.log(`[S192] §DB_LOADED size=${(dbBuf.byteLength/1024/1024).toFixed(0)}MB`);
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_status_db_loaded||'DB loaded ({size}MB). Querying...').replace('{size}',(dbBuf.byteLength/1024/1024).toFixed(0));
    }

    // §S260: Skip only if already populated (single-DB range mode does it above).
    if (Object.keys(A.buildingCentres).length === 0) {
      console.log('§CENTRES_QUERY A.db=' + (!!A.db) + ' tables=' + (A.db ? JSON.stringify(A.db.exec("SELECT name FROM sqlite_master WHERE type='table'")) : 'none'));
      try {
        const rows = A.dbQuery(`
          SELECT m.building, COUNT(*),
            AVG(t.center_x), AVG(t.center_y), AVG(t.center_z)
          FROM elements_meta m
          JOIN element_transforms t ON t.guid = m.guid
          GROUP BY m.building
        `);
        console.log('§CENTRES_RESULT rows=' + rows.length + (rows.length > 0 ? ' first=' + JSON.stringify(rows[0]) : ''));
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
    if (!_splitMode && !A._useRangeStream) A.libDb = A.db;
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
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    // Dispose cached geometry BLOBs — these are the raw BufferGeometry objects
    // that back all scene meshes. Safe to dispose now that meshes are removed.
    for (const geo of Object.values(A.meshCache)) {
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
