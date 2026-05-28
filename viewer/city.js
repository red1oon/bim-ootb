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
  A._cityBboxReleased = false;

  // §S285 superweight: free the city bbox layer (the ~912k-instance per-discipline meshes)
  // to reclaim RAM before streaming a heavy split-DB building (geo.db ~400MB). Idempotent.
  A._cityReleaseBboxes = function(reason) {
    if (A._cityBboxReleased) return;
    var freed = 0, insts = 0;
    var toRemove = A.collectMeshes(function(o){ return o.isInstancedMesh && o.userData && o.userData.isBboxPlaceholder; });
    toRemove.forEach(function(o){
      insts += (o.count || 0);
      A.scene.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
      if (o.userData) o.userData.instanceBuilding = null;  // drop instanceId→building array
      freed++;
    });
    A._cityBboxReleased = true;
    if (A.markDirty) A.markDirty();
    console.log('[S285] §CITY_BBOX_RELEASE meshes=' + freed + ' instances=' + insts.toLocaleString() + ' reason=' + (reason || ''));
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

  // ── Clear button (free RAM) — city mode only ──
  if (A.CITY_URL) {
  const clearBtn = document.createElement('button');
  clearBtn.id = 'city-clear-btn';
  clearBtn.title = 'Clear loaded meshes (free RAM)';
  clearBtn.textContent = '\uD83D\uDDD1 ' + (typeof _TRL!=='undefined'&&_TRL.ui_clear||'Clear');
  clearBtn.style.cssText = 'position:fixed;bottom:40px;right:16px;z-index:15;padding:8px 16px;background:#cc4444;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:1px;box-shadow:0 2px 8px rgba(204,68,68,0.4)';
  clearBtn.onclick = function() { A.cityClear(); };
  document.body.appendChild(clearBtn);
  }

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

    // §S285: City mode — treat ground/sky exactly like a normal building viewer.
    // Ground at the MEDIAN building base, not global MIN(min_z): a single outlier
    // element (the city has one at z=-164) otherwise drags the ground ~164m below the
    // city so every bbox floats. Median ignores outliers. Visibility is pill-controlled
    // (Shadow/Night), matching streaming.js §GROUND_INIT, and the Shadow pill owns the sky.
    const baseRows = A.cityDb.exec(`SELECT MIN(min_z) AS b FROM building_summary GROUP BY building`);
    if (baseRows.length && baseRows[0].values.length) {
      const bases = baseRows[0].values.map(r => r[0]).sort((a, b) => a - b);
      const medianBase = bases[Math.floor(bases.length / 2)];
      A.ground.position.y = (medianBase - A.modelOffset.z) - 2;
    }
    A.ground.visible = !!(A._shadowOn || A._nightMode);
    console.log('[S285] §CITY_GROUND y=' + A.ground.position.y.toFixed(1) + ' visible=' + A.ground.visible + ' (median base, pill-controlled)');

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
      var elemRows = null, arcCen = null, _hasBbox = false;
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
      var vals = elemRows[0].values;

      // Accumulate every element of every city instance into per-discipline buffers.
      for (var ii = 0; ii < instances.length; ii++) {
        var inst = instances[ii];
        var offX = inst.ix - arcX, offY = inst.iy - arcY, offZ = inst.iz - arcZ;
        for (var ei = 0; ei < vals.length; ei++) {
          var er = vals[ei];
          var acc = _accum(er[0] || '_');
          var p = A.ifc2three(er[1] + offX, er[2] + offY, er[3] + offZ);
          acc.px.push(p.x); acc.py.push(p.y); acc.pz.push(p.z);
          acc.sx.push(er[4] || 0.3); acc.sy.push(er[6] || 0.3); acc.sz.push(er[5] || 0.3);  // IFC→Three swap Y/Z
          acc.blds.push(inst.building);
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

      // §S285 split-DB: large buildings (LTU etc.) are deployed as {arch}_meta.db (panels +
      // transforms — same tables as extracted.db) + {arch}_geo.db (component_geometries — same
      // role as library.db). HEAD-probe meta.db; if present, load meta+geo instead of
      // extracted+library. Same downstream query/stream — we only swap which two files feed
      // A.db (main) and A.libDb (geometry). Mirrors streaming.js §DB_SPLIT_DETECT.
      const metaUrl = extUrl.replace('_extracted.db', '_meta.db');
      const geoUrl  = extUrl.replace('_extracted.db', '_geo.db');
      let _split = false;
      if (metaUrl !== extUrl) {
        try { const h = await fetch(metaUrl, { method: 'HEAD' }); _split = h.ok; } catch (e) { _split = false; }
      }
      const mainUrl = _split ? metaUrl : extUrl;
      const auxUrl  = _split ? geoUrl  : libUrl;
      console.log(`[S285] §CITY_DL_DETECT archetype=${archetype} split=${_split} main=${mainUrl.split('/').pop()} aux=${auxUrl.split('/').pop()}`);

      // §S285 superweight: a split geo.db can be ~400MB. Free the city bbox layer FIRST so
      // that RAM is available, and log heap before/after so we can see if the PWA copes.
      if (_split) { A._cityReleaseBboxes('split-DB heavy load: ' + archetype); A._cityLogMem('before ' + archetype); }

      // A missing companion DB (e.g. library.db 404) must NOT throw an uncaught rejection.
      let mainBuf, auxBuf;
      try {
        [mainBuf, auxBuf] = await Promise.all([
          A.cachedFetch(mainUrl),
          A.cachedFetch(auxUrl),
        ]);
      } catch (e) {
        console.warn(`[S285] §CITY_DL_FAIL archetype=${archetype} split=${_split} ${e.message}`);
        A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_dl_failed||'Could not load {name} — {err}').replace('{name}', archetype).replace('{err}', e.message);
        return;
      }

      const mainDb = new A.citySQL.Database(new Uint8Array(mainBuf));
      const auxDb = new A.citySQL.Database(new Uint8Array(auxBuf));
      A.cityBuildingDbs[archetype] = { db: mainDb, libDb: auxDb };
      console.log(`[S285] §CITY_DL archetype=${archetype} split=${_split} main=${(mainBuf.byteLength/1024/1024).toFixed(1)}MB aux=${(auxBuf.byteLength/1024/1024).toFixed(1)}MB`);
      if (_split) A._cityLogMem('after ' + archetype);
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

    const bc = A.buildingCentres[buildingName];
    const tgtX = bc.ix, tgtY = bc.iy, tgtZ = bc.iz;

    const offX = tgtX - arcX;
    const offY = tgtY - arcY;
    const offZ = tgtZ - arcZ;

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

    A.streamQueue = offsetRows;
    A.streamIdx = 0;
    A.streaming = true;
    A.activeBuilding = buildingName;
    A.activeBuildingTotal = A.streamQueue.length;
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
    const toRemove = A.collectMeshes(o => o.isMesh);
    toRemove.forEach(obj => {
      A.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    A.streamedCount = 0;
    if (A.buildingsRendered) A.buildingsRendered.clear();
    A.guidMap = {};
    var el;
    if ((el = document.getElementById('s-streamed'))) el.textContent = '0';
    if ((el = document.getElementById('s-buildings-done'))) el.textContent = '0';
    if ((el = document.getElementById('s-active'))) el.textContent = '—';
    if ((el = document.getElementById('s-progress'))) el.style.width = '0%';
    console.log(`[S210] §CITY_CLEAR removed=${toRemove.length} meshes freed`);
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_cleared||'CLEARED \u2014 {n} meshes removed.').replace('{n}', toRemove.length);
  };
}
