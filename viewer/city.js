/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// city.js — City mode: lightweight index, bboxes, on-demand building download
function setupCity(A) {
  A.cityDb = null;
  A.citySQL = null;
  A.cityArchetypes = {};
  A.cityBuildingDbs = {};
  // §S285 unified scene: when a building streams its real geometry, hide ONLY that
  // building's own bbox instances in the merged per-discipline meshes (zero-scale), so the
  // detailed building replaces its boxes while every other building keeps its bbox. Keeps
  // the city context visible instead of blanking the whole scene.
  A._cityHidden = [];  // {mesh, i, m} originals of bboxes hidden by loaded buildings (for restore on Clear)
  A._cityHideBuildingBboxes = function(buildingName) {
    if (!buildingName) return;
    var _z = new THREE.Matrix4().makeScale(0, 0, 0);
    var hidden = 0;
    var meshes = A.collectMeshes(function(o){ return o.isInstancedMesh && o.userData && o.userData.isBboxPlaceholder && o.userData.instanceBuilding; });
    meshes.forEach(function(o){
      var ib = o.userData.instanceBuilding, changed = false;
      for (var i = 0; i < ib.length; i++) {
        if (ib[i] === buildingName) {
          var orig = new THREE.Matrix4(); o.getMatrixAt(i, orig);
          A._cityHidden.push({ mesh: o, i: i, m: orig, building: buildingName });  // building stamp → per-building restore on evict
          o.setMatrixAt(i, _z); hidden++; changed = true;
        }
      }
      if (changed) o.instanceMatrix.needsUpdate = true;
    });
    if (hidden && A.markDirty) A.markDirty();
    console.log('[S285] §CITY_BBOX_HIDE building=' + buildingName + ' instances=' + hidden);
  };

  // Restore all bboxes hidden by previously-loaded buildings → the full bbox city returns.
  A._cityRestoreBboxes = function() {
    if (!A._cityHidden || !A._cityHidden.length) return;
    var n = A._cityHidden.length, dirty = {};
    A._cityHidden.forEach(function(h){ h.mesh.setMatrixAt(h.i, h.m); dirty[h.mesh.uuid] = h.mesh; });
    for (var k in dirty) { if (dirty[k].instanceMatrix) dirty[k].instanceMatrix.needsUpdate = true; }
    A._cityHidden = [];
    if (A.markDirty) A.markDirty();
    console.log('[S285] §CITY_BBOX_RESTORE instances=' + n);
  };

  // §S285: log JS heap (Chromium-only performance.memory) around heavy loads — superweight POC.
  A._cityLogMem = function(label) {
    var m = (typeof performance !== 'undefined') && performance.memory;
    if (m) {
      console.log('[S285] §CITY_MEM ' + label + ' usedHeap=' + (m.usedJSHeapSize/1048576).toFixed(0) + 'MB / limit=' + (m.jsHeapSizeLimit/1048576).toFixed(0) + 'MB');
    } else {
      console.log('[S285] §CITY_MEM ' + label + ' (performance.memory unavailable — non-Chromium)');
    }
  };

  // §S285: per-building bbox restore — bring back ONE building's bboxes (evict path),
  // leaving every other loaded building's bboxes hidden. (cityClear still uses the all-restore.)
  A._cityRestoreBuildingBboxes = function(name) {
    if (!A._cityHidden || !A._cityHidden.length) return;
    var dirty = {}, restored = 0, keep = [];
    A._cityHidden.forEach(function(h){
      if (h.building === name) { h.mesh.setMatrixAt(h.i, h.m); dirty[h.mesh.uuid] = h.mesh; restored++; }
      else keep.push(h);
    });
    for (var k in dirty) { if (dirty[k].instanceMatrix) dirty[k].instanceMatrix.needsUpdate = true; }
    A._cityHidden = keep;
    if (restored && A.markDirty) A.markDirty();
    console.log('[S285] §CITY_BBOX_RESTORE_ONE building=' + name + ' instances=' + restored);
  };

  // §S285: bounded working set — memory-budget LRU eviction of streamed buildings.
  // Buildings are arbitrary; the viewer must scale to ANY combination. We dispose only
  // per-building-OWNED scene objects (InstancedMesh instanceMatrix; BatchedMesh / merged-Mesh
  // owned buffers). SHARED meshCache geometry + BVH + cached materials are NEVER disposed
  // → no refcounting needed, same-archetype repeats keep working, and re-stream is cheap
  // (geometry already in meshCache). Budget is bytes, not a count (one LTU ≠ one SampleHouse).
  A._cityBuildingBytes = {};   // building -> owned buffer bytes (the part that grows)
  A._cityResidentOrder = [];   // resident buildings, oldest first (LRU order)
  A._cityMemBudgetMB = 384;    // aggressive default; live-tunable from console (re-stream is fast)

  A._cityGeoBytes = function(g) {
    var b = 0;
    if (g && g.attributes) for (var k in g.attributes) { var a = g.attributes[k]; if (a && a.array) b += a.array.byteLength; }
    if (g && g.index && g.index.array) b += g.index.array.byteLength;
    return b;
  };
  A._cityObjBytes = function(o) {
    if (o.isInstancedMesh) {  // geometry is SHARED in meshCache — count only the instance buffers
      var b = 0;
      if (o.instanceMatrix && o.instanceMatrix.array) b += o.instanceMatrix.array.byteLength;
      if (o.instanceColor && o.instanceColor.array) b += o.instanceColor.array.byteLength;
      return b;
    }
    return A._cityGeoBytes(o.geometry);  // BatchedMesh + fallback/merged Mesh own their geometry
  };
  A._cityResidentBytes = function() { var s = 0; for (var k in A._cityBuildingBytes) s += A._cityBuildingBytes[k]; return s; };

  // Tag the just-streamed building's NEW scene objects (children added since the pre-stream
  // snapshot), tally owned bytes, then evict oldest while over budget. Single site — no
  // per-creation-site edits, no userData sniffing: scene-children delta is the tag source.
  A._cityTagAndBudget = function(buildingName) {
    if (!buildingName) return;
    var pre = A._cityPreStreamIds || new Set();
    var bytes = 0, tagged = 0;
    A.scene.children.forEach(function(o){
      if (pre.has(o.id)) return;                                // existed before this building streamed
      if (o.userData && o.userData.isBboxPlaceholder) return;    // bbox layer, not streamed geometry
      if (o.userData && o.userData.building) return;             // already tagged (defensive)
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
      o.userData = o.userData || {};
      o.userData.building = buildingName;
      bytes += A._cityObjBytes(o);
      tagged++;
    });
    A._cityBuildingBytes[buildingName] = (A._cityBuildingBytes[buildingName] || 0) + bytes;
    if (A._cityResidentOrder.indexOf(buildingName) === -1) A._cityResidentOrder.push(buildingName);
    console.log('[S285] §CITY_TAG building=' + buildingName + ' objects=' + tagged + ' ownedMB=' + (bytes/1048576).toFixed(1) + ' residentMB=' + (A._cityResidentBytes()/1048576).toFixed(1));
    A._cityEvictToBudget(buildingName);
  };

  // §S285 HOTFIX2: the WHOLE eviction cascade runs in ONE pass over each big structure
  // (scene.children, guidMap, _cityHidden) — cost is independent of how many buildings are
  // evicted. The previous per-building version (collectMeshes + scene.remove PER object +
  // _cityHidden scan PER building) was O(victims × scene): evicting ~18 buildings at once
  // (with Terminal/LTU bbox layers ~174k hidden entries) timed out the script. Same
  // scissors-rule: never loop per-object/per-building over a global structure.
  // §S285: run the one-pass eviction cascade over a chosen victims Set. Cost is independent of
  // victim count — ONE pass over scene.children / guidMap / _cityHidden. Victim SELECTION is the
  // caller's job (LRU+budget via _cityEvictToBudget, or visibility via _cityEvictNonVisible).
  A._cityEvictVictims = function(victims) {
    if (!victims || !victims.size) return;
    // ONE pass over scene.children: dispose + bulk-remove victims' owned objects.
    var evictIds = new Set();
    var kids = A.scene.children, keepKids = [];
    for (var ki = 0; ki < kids.length; ki++) {
      var o = kids[ki];
      if (o.userData && o.userData.building && victims.has(o.userData.building) && !o.userData.isBboxPlaceholder) {
        evictIds.add(String(o.id));
        if (A._instanceMeta) delete A._instanceMeta[o.id];
        if (A._batchMeta) delete A._batchMeta[o.id];                  // else stale → §CONTRACT_FAIL phantom orphans + leak
        if (o.isBatchedMesh) { if (o.dispose) o.dispose(); }         // frees owned buffers + its BVH
        else if (o.isInstancedMesh) { if (o.dispose) o.dispose(); }   // frees instanceMatrix; geometry SHARED — keep
        else if (o.geometry) { o.geometry.dispose(); }               // fallback/merged Mesh owns geometry
        o.parent = null;                                             // material shared via cache — NEVER dispose
      } else {
        keepKids.push(o);
      }
    }
    A.scene.children = keepKids;                                     // single bulk removal (was O(objects × children))
    // ONE guidMap sweep for the whole cascade (keys are `meshId` or `meshId_slot`).
    if (A.guidMap) {
      for (var gk in A.guidMap) {
        var us = gk.indexOf('_');
        if (evictIds.has(us >= 0 ? gk.substring(0, us) : gk)) delete A.guidMap[gk];
      }
    }
    // ONE pass over _cityHidden: restore victims' bboxes, keep the rest.
    if (A._cityHidden && A._cityHidden.length) {
      var dirty = {}, keepHidden = [];
      for (var hi = 0; hi < A._cityHidden.length; hi++) {
        var h = A._cityHidden[hi];
        if (victims.has(h.building)) { h.mesh.setMatrixAt(h.i, h.m); dirty[h.mesh.uuid] = h.mesh; }
        else keepHidden.push(h);
      }
      for (var uk in dirty) { if (dirty[uk].instanceMatrix) dirty[uk].instanceMatrix.needsUpdate = true; }
      A._cityHidden = keepHidden;
    }
    // Bookkeeping per victim (cheap — ≤ resident count).
    var freedTotal = 0;
    victims.forEach(function(name){
      freedTotal += (A._cityBuildingBytes[name] || 0);
      if (A.buildingsRendered) A.buildingsRendered.delete(name);     // re-click re-streams (DB still cached)
      if (A.savedStreams) delete A.savedStreams[name];
      delete A._cityBuildingBytes[name];
      if (A._citySneak) delete A._citySneak[name];   // §S285: don't sneak-resurrect an evicted building
      var idx = A._cityResidentOrder.indexOf(name); if (idx >= 0) A._cityResidentOrder.splice(idx, 1);
    });
    if (A.markDirty) A.markDirty();
    console.log('[S285] §CITY_EVICT buildings=' + victims.size + ' objects=' + evictIds.size + ' freedMB=' + (freedTotal/1048576).toFixed(1) + ' residentNow=' + A._cityResidentOrder.length + ' bytesNow=' + (A._cityResidentBytes()/1048576).toFixed(1));
    // DLOD refs are rebuilt by the dlodEnable() call that runs right after this in streaming.js.
  };

  // §S285 HOTFIX2: whole cascade in ONE pass (scissors-rule). LRU+budget victim selection.
  A._cityEvictToBudget = function(keepBuilding) {
    var budgetBytes = (A._cityMemBudgetMB || 384) * 1048576;
    // Pick ALL victims first — bookkeeping only, oldest-first, never the active building, keep ≥1.
    var victims = new Set();
    var running = A._cityResidentBytes();
    var order = A._cityResidentOrder;
    for (var oi = 0; oi < order.length && running > budgetBytes; oi++) {
      var nm = order[oi];
      if (nm === keepBuilding) continue;
      if (order.length - victims.size <= 1) break;   // keep at least the active building
      victims.add(nm);
      running -= (A._cityBuildingBytes[nm] || 0);
    }
    A._cityEvictVictims(victims);
  };

  // §S285 AUTOLOAD wave trailing-edge: evict resident buildings that LEFT the view (not in the
  // ray-blast's visible set), FARTHEST-first, down to a 60% watermark so newly-visible can stream.
  // Keeps the active building + everything still visible. Watermark = hysteresis: only frees under
  // real pressure (>60% budget), so turning the camera back doesn't thrash (recently-seen stays
  // cached below the line). This turns the fill-and-hold wave-front into a camera-FOLLOWING wave.
  A._cityEvictNonVisible = function(visibleSet, keepBuilding) {
    if (!A._cityResidentOrder || A._cityResidentOrder.length <= 1) return;
    var watermark = (A._cityMemBudgetMB || 384) * 1048576 * 0.6;
    if (A._cityResidentBytes() <= watermark) return;                 // under pressure threshold → no thrash
    var cam = A.camera && A.camera.position;
    var _bd2 = function(nm) {
      var bc = A.buildingCentres && A.buildingCentres[nm];
      if (!bc || !cam || !A.ifc2three) return 0;
      var t = A.ifc2three(bc.ix, bc.iy, bc.iz);
      var dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
      return dx*dx + dy*dy + dz*dz;
    };
    var cands = A._cityResidentOrder.filter(function(nm){
      return nm !== keepBuilding && !(visibleSet && visibleSet.has(nm));
    });
    if (cam) cands.sort(function(a, b){ return _bd2(b) - _bd2(a); });  // farthest-first
    var victims = new Set();
    var running = A._cityResidentBytes();
    for (var i = 0; i < cands.length && running > watermark; i++) {
      if (A._cityResidentOrder.length - victims.size <= 1) break;     // keep ≥1 resident
      victims.add(cands[i]);
      running -= (A._cityBuildingBytes[cands[i]] || 0);
    }
    A._cityEvictVictims(victims);
  };

  // §S285 Bug1: per-archetype GROUND-FLOOR z (sql.js Database). Mirrors tools.js
  // _calcGroundY's slab logic: largest IfcSlab (bbox_z<1) → lowest center_z among the
  // top-5 by area. Fallback = 5th-percentile center_z (skips underground piling). We
  // anchor instances to THIS, not AVG(center_z) — the centroid floats tall garages /
  // deep-piled Terminals half a km up. Returns null only if the DB has no transforms.
  A._archGroundZ = function(db) {
    try {
      var zr = db.exec(
        "SELECT t.center_z FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid " +
        "WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z<1.0 " +
        "AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL " +
        "ORDER BY (t.bbox_x*t.bbox_y) DESC LIMIT 5");
      if (zr.length && zr[0].values.length) {
        var lowest = Infinity;
        for (var i = 0; i < zr[0].values.length; i++) {
          var v = zr[0].values[i][0];
          if (v != null && v < lowest) lowest = v;
        }
        if (lowest !== Infinity) return { z: lowest, src: 'slab-top5' };
      }
    } catch (e) {}
    try {  // fallback: 5th-percentile center_z — ignores underground piling at the bottom
      var cr = db.exec("SELECT center_z FROM element_transforms WHERE center_z IS NOT NULL ORDER BY center_z");
      if (cr.length && cr[0].values.length) {
        var vals = cr[0].values;
        return { z: vals[Math.floor(vals.length * 0.05)][0], src: 'p5' };
      }
    } catch (e) {}
    return null;
  };

  // §S285 AUTOLOAD: Clear (trash) button REMOVED — the city auto-streams on load like the
  // single-building viewer, and memory is bounded automatically (wave-front stop now,
  // distance-eviction next). A.cityClear() stays as the cascade/reset engine (used by
  // eviction + queue reset), just no longer surfaced as a button. See S285_CITY_AUTOLOAD.md.

  // S250 §6: Manual trigger for deferred mobile city load
  A.loadCityManual = async function() {
    if (A.cityDb) return; // already loaded
    var sql = A._citySQL || A._SQL;
    if (!sql) { console.warn('§CITY_DEFER no SQL engine available'); return; }
    console.log('§CITY_DEFER mobile — manual trigger, loading now');
    await A.initCity(sql);
  };

  A.initCity = async function(SQL) {
    A.citySQL = SQL;
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_fetching_city||'Fetching city index ({url})...').replace('{url}', A.CITY_URL);
    const buf = await A.cachedFetch(A.CITY_URL);
    A.cityDb = new SQL.Database(new Uint8Array(buf));
    console.log(`[S203] §CITY_INDEX size=${(buf.byteLength/1024).toFixed(0)}KB`);

    const archRows = A.cityDb.exec(`SELECT DISTINCT archetype FROM building_archetype`);
    if (archRows.length > 0) {
      for (const row of archRows[0].values) {
        const arch = row[0];
        A.cityArchetypes[arch] = {
          db: `${arch}_extracted.db`,
          lib: `${arch}_library.db`,
        };
      }
    }

    const rows = A.cityDb.exec(`
      SELECT building, SUM(element_count),
        AVG(center_x), AVG(center_y), AVG(center_z)
      FROM building_summary
      WHERE discipline IN ('ARC','STR')
      GROUP BY building
    `);
    if (rows.length > 0) {
      for (const row of rows[0].values) {
        A.buildingCentres[row[0]] = { ix: row[2], iy: row[3], iz: row[4], count: row[1] };
      }
    }
    const allRows = A.cityDb.exec(`
      SELECT building, SUM(element_count),
        AVG(center_x), AVG(center_y), AVG(center_z)
      FROM building_summary
      GROUP BY building
    `);
    if (allRows.length > 0) {
      for (const row of allRows[0].values) {
        if (!A.buildingCentres[row[0]]) {
          A.buildingCentres[row[0]] = { ix: row[2], iy: row[3], iz: row[4], count: row[1] };
        }
      }
    }

    const te = A.cityDb.exec(`SELECT SUM(total_elements) FROM building_archetype`);
    A.totalElements = te[0]?.values[0][0] || 0;

    const dc = A.cityDb.exec(`SELECT discipline, SUM(element_count) FROM building_summary GROUP BY discipline ORDER BY SUM(element_count) DESC`);
    if (dc.length > 0) {
      for (const r of dc[0].values) { A.discCounts[r[0]] = r[1]; }
    }

    const allIX = Object.values(A.buildingCentres).map(b => b.ix);
    const allIY = Object.values(A.buildingCentres).map(b => b.iy);
    const allIZ = Object.values(A.buildingCentres).map(b => b.iz);
    if (allIX.length) {
      A.modelOffset.x = (Math.min(...allIX) + Math.max(...allIX)) / 2;
      A.modelOffset.y = (Math.min(...allIY) + Math.max(...allIY)) / 2;
      A.modelOffset.z = (Math.min(...allIZ) + Math.max(...allIZ)) / 2;
    }

    // §S285: every building is ground-anchored (its ground floor → y=0 via
    // offZ = modelOffset.z - arcGroundZ), so the city ground plane is simply y=0.
    // (The old median-of-min_z derivation was the pre-anchor convention and left
    // buildings floating above the shadow/night ground plane.) Pill-controlled visibility.
    A.ground.position.y = 0;
    A.ground.visible = !!(A._shadowOn || A._nightMode);
    console.log('[S285] §CITY_GROUND y=0 visible=' + A.ground.visible + ' (ground-anchored)');

    A.updateHUD();
    A.populateBuildingList();
    // §S285: No building-list panel in city mode — a Viewer behaves apples-to-apples
    // with every other viewer: click a building's AABB to stream it (picking.js §CITY_PICK).
    // The #building-list stays hidden (S280); populateBuildingList still feeds search/HUD.

    // §S285: Draw individual element AABBs from cached building DBs (not big building bboxes)
    // For each archetype: read element_transforms from cached _extracted.db in IDB,
    // then for each city instance, offset element positions and draw as InstancedMesh wireframe.
    // Falls back to building-level bboxes for uncached buildings.
    var _t0 = performance.now();
    var _totalBboxes = 0;
    var _cachedArchetypes = 0;
    var _skippedArch = 0;
    var cacheDb = await A.openCacheDB();

    // Group city instances by archetype: { archetype → [{ building, offsetX/Y/Z }] }
    var archInstances = {};
    var archCentreRows = A.cityDb.exec(`
      SELECT ba.building, ba.archetype,
        AVG(bs.center_x), AVG(bs.center_y), AVG(bs.center_z)
      FROM building_archetype ba
      JOIN building_summary bs ON ba.building = bs.building
      GROUP BY ba.building
    `);
    if (archCentreRows.length > 0) {
      for (var ai = 0; ai < archCentreRows[0].values.length; ai++) {
        var r = archCentreRows[0].values[ai];
        var arch = r[1];
        if (!archInstances[arch]) archInstances[arch] = [];
        archInstances[arch].push({ building: r[0], ix: r[2], iy: r[3], iz: r[4] });
      }
    }

    var geo = new THREE.BoxGeometry(1, 1, 1);
    var _m4 = new THREE.Matrix4();
    var _pos = new THREE.Vector3();
    var _scl = new THREE.Vector3();
    var _quat = new THREE.Quaternion();

    // §S285 A+C: ONE merged InstancedMesh per DISCIPLINE across the whole city — not one
    // per building×discipline (that was hundreds of meshes, heavy RAM + draw calls). We
    // accumulate every element's transform into per-discipline buffers, YIELDING to the
    // event loop between archetypes (C) so the ~900k-element build never freezes the tab,
    // then create ~8 meshes total. instanceBuilding[] maps instanceId → building for picking.
    // No building-level fallback: city rests only on exact per-element IFC AABBs.
    var _yield = function(){ return new Promise(function(r){ setTimeout(r, 0); }); };
    var discAccum = {};  // disc -> { px,py,pz,sx,sy,sz: number[], blds: string[] }
    A._cityBuildingAABB = {};  // §S285: per-building WORLD AABB (one box/bldg) for the cheap ray-blast
    function _accum(disc) {
      if (!discAccum[disc]) discAccum[disc] = { px:[], py:[], pz:[], sx:[], sy:[], sz:[], blds:[] };
      return discAccum[disc];
    }

    for (var archName in archInstances) {
      var instances = archInstances[archName];
      var bldEntry = A.cityArchetypes[archName] || null;
      if (!bldEntry) { _skippedArch++; continue; }

      // Read cached _extracted.db from IDB (bbox layer is cache-only — never fetches)
      var dbUrl = A.BLD_BASE + bldEntry.db;
      var cachedBuf = null;
      if (cacheDb) {
        try {
          cachedBuf = await new Promise(function(resolve) {
            var tx = cacheDb.transaction('dbs', 'readonly');
            var req = tx.objectStore('dbs').get(dbUrl);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { resolve(null); };
          });
        } catch(e) { cachedBuf = null; }
      }
      if (!cachedBuf) { _skippedArch++; continue; }

      // §S285: Older extractions lack bbox_* columns — probe + skip gracefully (no crash).
      var archDb = new SQL.Database(new Uint8Array(cachedBuf));
      var elemRows = null, arcCen = null, arcGround = null, _hasBbox = false;
      try {
        var _cols = archDb.exec(`PRAGMA table_info(element_transforms)`);
        _hasBbox = _cols.length && _cols[0].values.some(function(c){ return c[1] === 'bbox_x'; });
        if (_hasBbox) {
          elemRows = archDb.exec(`
            SELECT m.discipline, t.center_x, t.center_y, t.center_z,
                   t.bbox_x, t.bbox_y, t.bbox_z
            FROM element_transforms t
            JOIN elements_meta m ON t.guid = m.guid
          `);
          arcCen = archDb.exec(`SELECT AVG(center_x), AVG(center_y), AVG(center_z) FROM element_transforms`);
          arcGround = A._archGroundZ(archDb);  // §S285 Bug1: ground-floor z (not centroid)
        }
      } catch (e) {
        console.warn(`[S285] §CITY_BBOX_DEGRADE archetype=${archName} reason=${e.message}`);
        elemRows = null;
      }
      archDb.close();

      if (!_hasBbox || !elemRows || !elemRows.length || !elemRows[0].values.length || !arcCen || !arcCen.length) {
        console.warn(`[S285] §CITY_BBOX_SKIP archetype=${archName} reason=${!_hasBbox ? 'no bbox_* columns' : 'no rows'} (exact AABBs only, no fallback)`);
        _skippedArch++;
        continue;
      }
      _cachedArchetypes++;
      var arcX = arcCen[0].values[0][0];
      var arcY = arcCen[0].values[0][1];
      var arcZ = arcCen[0].values[0][2];
      // §S285 Bug1: anchor on ground-floor z (fallback centroid) so the building sits ON
      // the ground instead of floating by its centroid (tall garages / deep-piled Terminals).
      var arcGroundZ = (arcGround && arcGround.z != null) ? arcGround.z : arcZ;
      var vals = elemRows[0].values;

      // Accumulate every element of every city instance into per-discipline buffers.
      for (var ii = 0; ii < instances.length; ii++) {
        var inst = instances[ii];
        // offZ anchors the detected GROUND floor to modelOffset.z (all buildings share ground).
        var offX = inst.ix - arcX, offY = inst.iy - arcY, offZ = A.modelOffset.z - arcGroundZ;
        for (var ei = 0; ei < vals.length; ei++) {
          var er = vals[ei];
          var acc = _accum(er[0] || '_');
          var p = A.ifc2three(er[1] + offX, er[2] + offY, er[3] + offZ);
          acc.px.push(p.x); acc.py.push(p.y); acc.pz.push(p.z);
          acc.sx.push(er[4] || 0.3); acc.sy.push(er[6] || 0.3); acc.sz.push(er[5] || 0.3);  // IFC→Three swap Y/Z
          acc.blds.push(inst.building);
          var _hx=(er[4]||0.3)*0.5, _hy=(er[6]||0.3)*0.5, _hz=(er[5]||0.3)*0.5;  // half-extents (Y/Z swap as above)
          var _bb=A._cityBuildingAABB[inst.building]||(A._cityBuildingAABB[inst.building]={x0:Infinity,y0:Infinity,z0:Infinity,x1:-Infinity,y1:-Infinity,z1:-Infinity});
          if(p.x-_hx<_bb.x0)_bb.x0=p.x-_hx; if(p.x+_hx>_bb.x1)_bb.x1=p.x+_hx;
          if(p.y-_hy<_bb.y0)_bb.y0=p.y-_hy; if(p.y+_hy>_bb.y1)_bb.y1=p.y+_hy;
          if(p.z-_hz<_bb.z0)_bb.z0=p.z-_hz; if(p.z+_hz>_bb.z1)_bb.z1=p.z+_hz;
          _totalBboxes++;
        }
      }
      await _yield();  // (C) breathe between archetypes — keeps the tab responsive
    }

    // (A) Build ONE InstancedMesh per discipline (~8 meshes instead of hundreds).
    var _meshCount = 0;
    for (var dName in discAccum) {
      var dacc = discAccum[dName];
      var n = dacc.px.length;
      if (!n) continue;
      var color = A.DISC_COLORS[dName] || A.DEFAULT_COLOR;
      var mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.35 });
      var iMesh = new THREE.InstancedMesh(geo, mat, n);
      iMesh.frustumCulled = false;
      // Merged mesh spans many buildings → instanceBuilding maps instanceId → building (picking.js).
      iMesh.userData = { isBboxPlaceholder: true, discipline: dName, instanceBuilding: dacc.blds };
      for (var k = 0; k < n; k++) {
        _pos.set(dacc.px[k], dacc.py[k], dacc.pz[k]);
        _scl.set(dacc.sx[k], dacc.sy[k], dacc.sz[k]);
        _m4.compose(_pos, _quat, _scl);
        iMesh.setMatrixAt(k, _m4);
      }
      iMesh.instanceMatrix.needsUpdate = true;
      A.scene.add(iMesh);
      _meshCount++;
    }
    var _dt = (performance.now() - _t0).toFixed(0);
    console.log(`[S285] §CITY_BBOX individual=${_totalBboxes.toLocaleString()} cachedArch=${_cachedArchetypes} skippedArch=${_skippedArch} meshes=${_meshCount} ms=${_dt}`);
    if (A.markDirty) A.markDirty();

    document.getElementById('s-buildings').textContent =
      Object.keys(A.buildingCentres).length.toLocaleString();
    document.getElementById('s-elements').textContent = A.totalElements.toLocaleString();

    const extentX = allIX.length ? Math.max(...allIX) - Math.min(...allIX) : 500;
    const extentY = allIY.length ? Math.max(...allIY) - Math.min(...allIY) : 500;
    const dist = Math.max(extentX, extentY) * 0.6;
    A.camera.position.set(dist * 0.3, dist * 0.5, dist * 0.4);
    A.camera.far = Math.max(10000, dist * 3);
    A.camera.updateProjectionMatrix();
    A.controls.target.set(0, 10, 0);
    A.controls.update();

    console.log(`[S203] §CITY_READY buildings=${Object.keys(A.buildingCentres).length} archetypes=${Object.keys(A.cityArchetypes).length} elements=${A.totalElements}`);
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_city_mode||'CITY MODE \u2014 {n} buildings, {m} elements. Click a building to load.').replace('{n}', Object.keys(A.buildingCentres).length).replace('{m}', A.totalElements.toLocaleString());

    // §S285 AUTOLOAD: stream the city automatically on load (like the single-building viewer
    // auto-loads its ?db=). The stream SET is chosen by a RAY-BLAST from the camera POV
    // (A._cityRayBlast): a grid of rays hits the bbox layer, first-hit per ray → we stream
    // only what is VISIBLE and UN-OCCLUDED (a building behind another isn't hit), nearest
    // first. Re-blasts on camera-stop (controls 'end') so the streamed set follows the view.
    // Wave-front stop in _cityStreamNext bounds RAM. Desktop only (mobile = demo). Falls back
    // to nearest-first-by-centre if the blast is empty (camera not yet aimed / bbox not ready).
    if (!A._isMobile && A.CITY_URL) {
      A._cityAutoLoad = true;                       // wave-front stop gate in _cityStreamNext
      A._cityDiscGate = ['ARC', 'STR'];            // §S285: city streams the ARC/STR shell first
      A._citySneak = A._citySneak || {};           // building -> {archetype, rows} (the rest, to sneak)
      if (!A._cityFollowHooked && A.controls && A.controls.addEventListener) {
        A._cityFollowHooked = true;               // §S285: re-blast on camera-stop → set follows the view
        A.controls.addEventListener('end', function() {
          if (!A.CITY_URL || A._isMobile || !A._cityAutoLoad) return;
          var vis = A._cityRayBlast();
          if (!vis.length) return;
          var visSet = new Set(vis);
          A._cityEvictNonVisible(visSet, A.activeBuilding);   // free the trailing edge (left-the-view)
          A._cityPendingQueue = vis.filter(function(n){ return !(A.buildingsRendered && A.buildingsRendered.has(n)); });
          A._cityStreamNext();                    // stream the now-visible, room freed by the eviction above
        });
      }
      var _visible = A._cityRayBlast();
      if (!_visible.length) {
        _visible = A._cityNearestFirst();
        console.log('[S285] §AUTOLOAD fallback=distance-sort (ray-blast empty)');
      }
      A._cityPendingQueue = _visible;
      console.log('[S285] §AUTOLOAD queued=' + _visible.length + ' nearest=' + (_visible[0] || '\u2014') + ' budgetMB=' + (A._cityMemBudgetMB || 384));
      A._cityStreamNext();
    }
  };

  // Override flyTo for city mode
  A.flyTo = function(buildingName) {
    const bc = A.buildingCentres[buildingName];
    if (!bc) return;
    const t = A.ifc2three(bc.ix, bc.iy, bc.iz);
    const dist = Math.max(50, Math.sqrt(bc.count) * 1.5);
    A.camera.position.set(t.x + dist * 0.7, t.y + dist * 1.0, t.z + dist * 0.7);
    A.controls.target.set(t.x, t.y, t.z);
    A.camera.far = Math.max(5000, dist * 10);
    A.camera.updateProjectionMatrix();
    A.controls.update();

    if (!A.CITY_URL) {
      document.getElementById('s-active').style.color = '#4fc3f7';
      document.getElementById('s-progress').style.width = '0%';
      document.getElementById('s-progress').style.background = '#4fc3f7';
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_flew_to||'Flew to {name} ({n} elements)').replace('{name}', buildingName).replace('{n}', bc.count);
      if (A.libDb) A.streamBuilding(buildingName);
      return;
    }

    if (A.buildingsRendered.has(buildingName)) {
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_already_loaded||'{name} already loaded ({n} elements)').replace('{name}', buildingName).replace('{n}', bc.count);
      return;
    }
    A.cityLoadBuilding(buildingName);
  };

  A.cityLoadBuilding = async function(buildingName) {
    const archRow = A.cityDb.exec(`SELECT archetype FROM building_archetype WHERE building = ?`, [buildingName]);
    if (!archRow.length) { A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_unknown_building||'Unknown building: {name}').replace('{name}', buildingName); return; }
    const archetype = archRow[0].values[0][0];
    const files = A.cityArchetypes[archetype];
    if (!files) { A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_no_db_arch||'No DB for archetype: {name}').replace('{name}', archetype); return; }

    if (!A.cityBuildingDbs[archetype]) {
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_downloading||'Downloading {name}...').replace('{name}', archetype);
      const extUrl = A.BLD_BASE + files.db;
      const libUrl = A.BLD_BASE + files.lib;
      const metaUrl = extUrl.replace('_extracted.db', '_meta.db');
      const geoUrl  = extUrl.replace('_extracted.db', '_geo.db');

      // §S285: three deployment formats — detect, don't assume:
      //   (1) SPLIT     {arch}_meta.db + {arch}_geo.db        (large: LTU/Terminal/Clinic)
      //   (2) SINGLE-DB {arch}_extracted.db w/ component_geometries inline  (SmileyWest, BimWhale…)
      //   (3) OLD SPLIT {arch}_extracted.db + {arch}_library.db
      // HEAD-probe meta.db → (1). Else fetch extracted.db, and if it has component_geometries
      // inline → (2) libDb = db (mirrors streaming.js A.libDb = A.db). Else → (3) fetch library.
      let _split = false;
      if (metaUrl !== extUrl) {
        try { const h = await fetch(metaUrl, { method: 'HEAD' }); _split = h.ok; } catch (e) { _split = false; }
      }
      let _mode, _mainDb, _auxDb, _mainMB = 0, _auxMB = 0;
      try {
        if (_split) {
          _mode = 'split-meta-geo';
          A._cityLogMem('before ' + archetype);   // heavy split (geo.db can be ~400MB)
          const [mb, gb] = await Promise.all([A.cachedFetch(metaUrl), A.cachedFetch(geoUrl)]);
          _mainDb = new A.citySQL.Database(new Uint8Array(mb));
          _auxDb  = new A.citySQL.Database(new Uint8Array(gb));
          _mainMB = mb.byteLength/1048576; _auxMB = gb.byteLength/1048576;
          A._cityLogMem('after ' + archetype);
        } else {
          const eb = await A.cachedFetch(extUrl);
          _mainDb = new A.citySQL.Database(new Uint8Array(eb));
          _mainMB = eb.byteLength/1048576;
          // Inline geometry? → single-DB, no companion needed (libDb = db).
          let _inline = false;
          try { _inline = _mainDb.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='component_geometries'").length > 0; } catch (e) {}
          if (_inline) {
            _mode = 'single-db';
            _auxDb = _mainDb;
          } else {
            _mode = 'extracted-library';
            const lb = await A.cachedFetch(libUrl);
            _auxDb = new A.citySQL.Database(new Uint8Array(lb));
            _auxMB = lb.byteLength/1048576;
          }
        }
      } catch (e) {
        // A missing/404 companion DB must NOT throw an uncaught rejection.
        console.warn(`[S285] §CITY_DL_FAIL archetype=${archetype} ${e.message}`);
        A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_dl_failed||'Could not load {name} — {err}').replace('{name}', archetype).replace('{err}', e.message);
        return;
      }

      A.cityBuildingDbs[archetype] = { db: _mainDb, libDb: _auxDb };
      console.log(`[S285] §CITY_DL archetype=${archetype} mode=${_mode} main=${_mainMB.toFixed(1)}MB aux=${_auxMB.toFixed(1)}MB`);
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_downloaded_bld||'Downloaded {name}. Streaming {bld}...').replace('{name}', archetype).replace('{bld}', buildingName);
    }

    const saved = { db: A.db, libDb: A.libDb };
    A.db = A.cityBuildingDbs[archetype].db;
    A.libDb = A.cityBuildingDbs[archetype].libDb;

    const bldInDb = A.dbQuery(`SELECT DISTINCT building FROM elements_meta`);
    const dbBldName = bldInDb.length > 0 ? bldInDb[0][0] : buildingName;

    const arcCentre = A.dbQuery(`SELECT AVG(center_x), AVG(center_y), AVG(center_z) FROM element_transforms`);
    const arcX = arcCentre[0][0];
    const arcY = arcCentre[0][1];
    const arcZ = arcCentre[0][2];
    // §S285 Bug1: same ground-anchoring as the bbox layer, so the streamed real mesh lines
    // up with the bbox it replaces (and Terminal piling levels to ground, not floats).
    const arcG = A._archGroundZ(A.db);
    const arcGroundZ = (arcG && arcG.z != null) ? arcG.z : arcZ;

    const bc = A.buildingCentres[buildingName];
    const tgtX = bc.ix, tgtY = bc.iy, tgtZ = bc.iz;

    const offX = tgtX - arcX;
    const offY = tgtY - arcY;
    const offZ = A.modelOffset.z - arcGroundZ;
    console.log(`[S285] §CITY_GROUND_ANCHOR building=${buildingName} groundZ=${arcGroundZ.toFixed(2)} src=${arcG ? arcG.src : 'centroid'} offZ=${offZ.toFixed(2)}`);

    const rows = A.dbQuery(`
      SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
             t.center_x, t.center_y, t.center_z,
             t.rotation_x, t.rotation_y, t.rotation_z,
             m.storey, m.ifc_class
      FROM elements_meta m
      JOIN element_instances i ON m.guid = i.guid
      JOIN element_transforms t ON t.guid = m.guid
      WHERE i.geometry_hash IS NOT NULL
        AND m.ifc_class != 'IfcOpeningElement'
    `);

    if (!rows.length) {
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_no_elements||'No streamable elements for {name}').replace('{name}', buildingName);
      A.db = saved.db; A.libDb = saved.libDb;
      return;
    }

    const offsetRows = rows.map(row => {
      const r = [...row];
      r[4] += offX;
      r[5] += offY;
      r[6] += offZ;
      return r;
    });

    // §S285: snapshot current scene children so stream-complete can tag THIS building's
    // new objects by delta (anything added during streaming, minus the bbox layer).
    A._cityPreStreamIds = new Set(A.scene.children.map(function(c){ return c.id; }));

    // §S285 ARC gate + ARC-first: in city mode stream the ARC/STR shell FIRST (light → small BVH/
    // build → the loop breathes for movement + pills), and stash the rest to SNEAK in after the
    // visible wave is idle, so the building finally gets everything (bounded by the 290k budget).
    var _gate = A._cityDiscGate;
    if (_gate && _gate.length) {
      var _gi = {}; for (var _gk=0; _gk<_gate.length; _gk++) _gi[_gate[_gk]] = _gk;
      var _arcRows = [], _restRows = [];
      for (var _rr=0; _rr<offsetRows.length; _rr++) {
        if (_gi[offsetRows[_rr][3]] !== undefined) _arcRows.push(offsetRows[_rr]); else _restRows.push(offsetRows[_rr]);
      }
      _arcRows.sort(function(a, b){ return (_gi[a[3]]||0) - (_gi[b[3]]||0); });   // ARC before STR
      if (_arcRows.length) {
        A.streamQueue = _arcRows;
        if (_restRows.length) { A._citySneak = A._citySneak || {}; A._citySneak[buildingName] = { archetype: archetype, rows: _restRows }; }
        console.log('[S285] §CITY_GATE building=' + buildingName + ' arc=' + _arcRows.length + ' sneak=' + _restRows.length);
      } else {
        A.streamQueue = offsetRows;            // archetype has no ARC/STR → stream all (don't gate to empty)
      }
    } else {
      A.streamQueue = offsetRows;              // single-building / gate off → unchanged
    }
    A.streamIdx = 0;
    A.streaming = true;
    A.activeBuilding = buildingName;
    A.activeBuildingTotal = A.streamQueue.length;
    // §S285 Bug2: do NOT hide the bboxes here — that left a blank gap until streaming
    // finished. The building keeps its own bboxes until its real geometry has fully
    // streamed in; the hide now fires at stream-complete (streaming.js, §CITY_BBOX_HIDE),
    // matching how the normal viewer keeps its placeholder until the mesh is ready.
    document.getElementById('s-active').textContent = buildingName;
    document.getElementById('s-active').style.color = '#4fc3f7';
    document.getElementById('s-building-total').textContent = A.activeBuildingTotal.toLocaleString();
    document.getElementById('s-progress').style.width = '0%';
    document.getElementById('s-progress').style.background = '#4fc3f7';
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_streaming_bld||'STREAMING {name} \u2014 0/{n} elements').replace('{name}', buildingName).replace('{n}', A.streamQueue.length.toLocaleString());

    A.db = saved.db;
    A.libDb = A.cityBuildingDbs[archetype].libDb;
  };

  // ── Clear all streamed meshes, free RAM, keep bboxes + cached DBs ──
  A.cityClear = function() {
    A.streaming = false;
    A.streamQueue = [];
    A.streamIdx = 0;
    A._cityPendingQueue = [];   // §S285: stop any in-flight marquee stream sequence
    // §S285: free ONLY streamed building geometry — KEEP the bbox layer. InstancedMesh
    // IS a Mesh, so the bare `o.isMesh` filter was also wiping the 12 bbox placeholders
    // → everything blank. Exclude isBboxPlaceholder so the city bboxes survive Clear.
    const toRemove = A.collectMeshes(o => o.isMesh && !(o.userData && o.userData.isBboxPlaceholder));
    toRemove.forEach(obj => {
      A.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    A.streamedCount = 0;
    if (A.buildingsRendered) A.buildingsRendered.clear();
    A.guidMap = {};
    A._cityBuildingBytes = {};   // §S285: reset eviction tally — fresh working set
    A._cityResidentOrder = [];
    A._citySneak = {};
    A._cityRestoreBboxes();  // bring back the bboxes of buildings that were streamed
    var el;
    if ((el = document.getElementById('s-streamed'))) el.textContent = '0';
    if ((el = document.getElementById('s-buildings-done'))) el.textContent = '0';
    if ((el = document.getElementById('s-active'))) el.textContent = '—';
    if ((el = document.getElementById('s-progress'))) el.style.width = '0%';
    console.log(`[S210] §CITY_CLEAR removed=${toRemove.length} meshes freed`);
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_cleared||'CLEARED \u2014 {n} meshes removed.').replace('{n}', toRemove.length);
  };

  // \u2500\u2500 \u00a7S285: Shift+drag marquee \u2014 stream every building inside a screen rectangle, in
  // sequence (one-by-one is too slow). The pick handler bails on shiftKey (picking.js:185)
  // so Shift is free; we disable OrbitControls during the drag. Streams via the normal
  // pipeline; the memory budget evicts older ones as newer load ("stream + evict").
  // §S285 AUTOLOAD ray-blast: choose the stream set by VISIBILITY. Spray a grid of rays from
  // the camera through the viewport, first-hit each against the bbox layer, resolve the hit
  // building (userData.instanceBuilding[instanceId] — same resolve as the click pick), order
  // unique buildings nearest-first. First-hit = free occlusion: a building behind another isn't
  // hit, so we never stream what we can't see. Re-run on camera-stop → the set follows the view.
  A._cityRayBlastCols = 6;
  A._cityRayBlastRows = 4;
  A._cityOrderBlastHits = function(hitList) {   // pure: [{building,distance}] → nearest-first unique
    var nearest = {};
    for (var i = 0; i < hitList.length; i++) {
      var h = hitList[i];
      if (!h || !h.building) continue;
      if (nearest[h.building] === undefined || h.distance < nearest[h.building]) nearest[h.building] = h.distance;
    }
    return Object.keys(nearest).sort(function(a, b) { return nearest[a] - nearest[b]; });
  };
  A._cityNearestFirst = function() {            // fallback: ALL buildings by centre distance to camera
    if (!A.camera) return Object.keys(A.buildingCentres);
    var cam = A.camera.position;
    return Object.keys(A.buildingCentres).map(function(name) {
      var bc = A.buildingCentres[name]; var t = A.ifc2three(bc.ix, bc.iy, bc.iz);
      var dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
      return { name: name, d2: dx*dx + dy*dy + dz*dz };
    }).sort(function(a, b) { return a.d2 - b.d2; }).map(function(o) { return o.name; });
  };
  // §S285: pure ray-vs-AABB (slab method). Returns nearest t>=0 of intersection, else -1.
  // Origin inside the box → tmin<0, returns tmax (still a hit). No THREE, Node-testable.
  A._rayAABB = function(ox,oy,oz, dx,dy,dz, b) {
    var tmin=-Infinity, tmax=Infinity, t1, t2, tt;
    if (dx!==0){ t1=(b.x0-ox)/dx; t2=(b.x1-ox)/dx; if(t1>t2){tt=t1;t1=t2;t2=tt;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2; } else if(ox<b.x0||ox>b.x1) return -1;
    if (dy!==0){ t1=(b.y0-oy)/dy; t2=(b.y1-oy)/dy; if(t1>t2){tt=t1;t1=t2;t2=tt;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2; } else if(oy<b.y0||oy>b.y1) return -1;
    if (dz!==0){ t1=(b.z0-oz)/dz; t2=(b.z1-oz)/dz; if(t1>t2){tt=t1;t1=t2;t2=tt;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2; } else if(oz<b.z0||oz>b.z1) return -1;
    if (tmax<0 || tmin>tmax) return -1;
    return tmin>=0 ? tmin : tmax;
  };
  // §S285: ray-blast over ~52 per-building AABBs (was 24 rays × ~67k per-element instances = 3.5s
  // freeze). First-hit per ray = free occlusion; hits LOADED buildings too (AABB never zero-scaled),
  // fixing the old thin-coverage. Pure math via raycaster.ray → microseconds.
  A._cityRayBlast = function() {
    if (!A.raycaster || !A.camera || !A._cityBuildingAABB) return [];
    var boxes = A._cityBuildingAABB, names = Object.keys(boxes);
    if (!names.length) return [];
    var _t0 = (typeof performance!=='undefined'&&performance.now)?performance.now():0;
    var cols=A._cityRayBlastCols, rows=A._cityRayBlastRows;
    var coord={x:0,y:0}, hitList=[], rays=0;
    for (var ci=0; ci<cols; ci++){
      for (var ri=0; ri<rows; ri++){
        coord.x=-1+(ci+0.5)*(2/cols); coord.y=-1+(ri+0.5)*(2/rows);
        A.raycaster.setFromCamera(coord, A.camera);
        var o=A.raycaster.ray.origin, d=A.raycaster.ray.direction;
        rays++;
        var bestT=Infinity, bestName=null;
        for (var ni=0; ni<names.length; ni++){
          var t=A._rayAABB(o.x,o.y,o.z, d.x,d.y,d.z, boxes[names[ni]]);
          if (t>=0 && t<bestT){ bestT=t; bestName=names[ni]; }
        }
        if (bestName) hitList.push({building:bestName, distance:bestT});
      }
    }
    var ordered = A._cityOrderBlastHits(hitList);
    var _ms = _t0 ? (((typeof performance!=='undefined'&&performance.now)?performance.now():0)-_t0).toFixed(1) : '?';
    console.log('[S285] §RAYBLAST rays=' + rays + ' hits=' + hitList.length + ' buildings=' + ordered.length + ' ms=' + _ms);
    return ordered;
  };
  A._cityPendingQueue = [];
  // §S285 SNEAK: once the visible wave is idle and there's budget headroom, stream a resident
  // building's stashed non-ARC disciplines (the 'next level'). Render loop drives streamTick.
  A._cityStreamRows = function(buildingName, archetype, rows) {
    var entry = A.cityBuildingDbs && A.cityBuildingDbs[archetype];
    if (!entry) return;
    A.db = entry.db; A.libDb = entry.libDb;
    A._cityPreStreamIds = new Set(A.scene.children.map(function(c){ return c.id; }));
    A.streamQueue = rows; A.streamIdx = 0; A.streaming = true; A.activeBuilding = buildingName;
    A.activeBuildingTotal = rows.length;
    console.log('[S285] §CITY_SNEAK building=' + buildingName + ' rows=' + rows.length);
  };
  A._citySneakNext = function() {
    if (A.streaming || !A._citySneak) return;
    if (A._cityResidentBytes && A._cityResidentBytes() >= (A._cityMemBudgetMB||384)*1048576*0.85) return;  // no room
    var name = null;
    for (var k in A._citySneak) { if (A._citySneak[k] && A._citySneak[k].rows && A._citySneak[k].rows.length) { name = k; break; } }
    if (!name) return;
    var job = A._citySneak[name]; delete A._citySneak[name];
    A._cityStreamRows(name, job.archetype, job.rows);
  };
  A._cityStreamNext = function() {
    if (A.streaming) return;                                   // chained again at next stream-complete
    // §S285 AUTOLOAD wave-front stop: under auto-load (NOT marquee), stop pulling once the
    // nearest cluster fills ~85% of budget. Queue is nearest-first, so this keeps the NEAREST
    // resident and never forces eviction (no churn-to-farthest, no OOM). Marquee leaves the
    // flag falsy \u2192 unchanged "stream + evict" behaviour.
    if (A._cityAutoLoad && A._cityResidentBytes) {
      var _budget = (A._cityMemBudgetMB || 384) * 1048576 * 0.85;
      if (A._cityResidentBytes() >= _budget) {
        console.log('[S285] \u00a7AUTOLOAD_STOP residentMB=' + (A._cityResidentBytes()/1048576).toFixed(1) + ' budgetMB=' + (A._cityMemBudgetMB || 384) + ' remaining=' + (A._cityPendingQueue ? A._cityPendingQueue.length : 0));
        return;
      }
    }
    var next = null;
    while (A._cityPendingQueue && A._cityPendingQueue.length) {
      var n = A._cityPendingQueue.shift();
      if (n && !(A.buildingsRendered && A.buildingsRendered.has(n))) { next = n; break; }
    }
    if (!next) { if (A._cityAutoLoad) A._citySneakNext(); return; }  // §S285: visible all loaded → sneak the rest
    A.status.textContent = (A._cityAutoLoad ? 'Loading city \u2014 ' : 'Marquee \u2014 streaming ') + next + ' (' + A._cityPendingQueue.length + ' queued)';
    A.cityLoadBuilding(next);
  };
  if (A.canvas) {
    var _mq = null, _mqEl = null;
    var _mqBox = function(s) { return { l: Math.min(s.x, s.cx), t: Math.min(s.y, s.cy), r: Math.max(s.x, s.cx), b: Math.max(s.y, s.cy) }; };
    A.canvas.addEventListener('pointerdown', function(e) {
      if (!A.CITY_URL || !e.shiftKey || e.button !== 0) return;
      _mq = { x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY };
      if (A.controls) A.controls.enabled = false;              // don't rotate the camera during marquee
      if (!_mqEl) {
        _mqEl = document.createElement('div');
        _mqEl.style.cssText = 'position:fixed;border:1.5px dashed #4fc3f7;background:rgba(79,195,247,0.12);pointer-events:none;z-index:9999;display:none';
        document.body.appendChild(_mqEl);
      }
      _mqEl.style.display = 'block';
      e.preventDefault();
    });
    A.canvas.addEventListener('pointermove', function(e) {
      if (!_mq) return;
      _mq.cx = e.clientX; _mq.cy = e.clientY;
      var r = _mqBox(_mq);
      _mqEl.style.left = r.l + 'px'; _mqEl.style.top = r.t + 'px';
      _mqEl.style.width = (r.r - r.l) + 'px'; _mqEl.style.height = (r.b - r.t) + 'px';
    });
    var _mqEnd = function() {
      if (!_mq) return;
      var s = _mq; _mq = null;
      if (_mqEl) _mqEl.style.display = 'none';
      if (A.controls) A.controls.enabled = true;
      var r = _mqBox(s);
      if ((r.r - r.l) < 6 && (r.b - r.t) < 6) return;          // too small \u2014 not a real drag
      var cr = A.canvas.getBoundingClientRect();
      var _v = new THREE.Vector3();                            // lazy \u2014 THREE ready by city interaction
      var picked = [];
      for (var name in A.buildingCentres) {
        if (A.buildingsRendered && A.buildingsRendered.has(name)) continue;
        var bc = A.buildingCentres[name];
        var t = A.ifc2three(bc.ix, bc.iy, bc.iz);
        _v.set(t.x, t.y, t.z).project(A.camera);
        if (_v.z > 1) continue;                                // behind camera / beyond far plane
        var sx = cr.left + (_v.x * 0.5 + 0.5) * cr.width;
        var sy = cr.top + (-_v.y * 0.5 + 0.5) * cr.height;
        if (sx >= r.l && sx <= r.r && sy >= r.t && sy <= r.b) picked.push({ name: name, d: _v.z });
      }
      picked.sort(function(a, b) { return a.d - b.d; });        // nearest first
      var MAX = 50, capped = picked.length > MAX;
      var names = picked.slice(0, MAX).map(function(p) { return p.name; });
      console.log('[S285] \u00a7CITY_MARQUEE selected=' + picked.length + (capped ? ' (capped to ' + MAX + ')' : '') + ' queued=' + names.length);
      if (!names.length) { A.status.textContent = 'Marquee \u2014 no unloaded buildings in selection'; return; }
      A._cityPendingQueue = names;
      A._cityStreamNext();                                      // kick off if idle; else chained at stream-complete
    };
    A.canvas.addEventListener('pointerup', _mqEnd);
    A.canvas.addEventListener('pointercancel', _mqEnd);
  }
}
