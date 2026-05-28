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

    // §S285: City mode — keep the ground positioned but hidden. The default plane sat
    // too high (occluding the bottom pill / blocking interaction). The Shadow toggle
    // re-adds a ground plane when the user wants one.
    const zRange = A.cityDb.exec(`SELECT MIN(min_z), MAX(max_z) FROM building_summary`);
    if (zRange.length > 0) {
      const groundY = (zRange[0].values[0][0] - A.modelOffset.z) - 2;
      A.ground.position.y = groundY;
    }
    A.ground.visible = false;
    console.log('[S285] §CITY_GROUND hidden (Shadow toggle restores a ground)');

    // §S285: City mode — realistic Preetham sky on by default (mid-afternoon).
    // Same path the Shadow toggle uses (tools.js); gives an outdoor horizon instead
    // of the flat dark clear-color, and drives env-map reflections on buildings.
    if (A._sky) {
      A._sky.visible = true;
      if (A.updateSky) A.updateSky(45, 180);
      console.log('[S285] §CITY_SKY realistic Preetham sky enabled');
    }

    A.updateHUD();
    A.populateBuildingList();

    // §S285: Show building list in city mode — was hidden by S280 UI overhaul.
    // viewer.html has `#building-list { display:none !important }`, so a plain inline
    // display:block loses to the stylesheet !important and the list never appears.
    // Use setProperty(...'important') so the city-mode list beats the stylesheet rule.
    var bldList = document.getElementById('building-list');
    if (bldList) {
      bldList.style.cssText = 'position:fixed;top:60px;left:12px;z-index:20;' +
        'background:rgba(17,17,17,0.95);border:1px solid #333;border-radius:10px;' +
        'padding:8px;max-height:70vh;overflow-y:auto;width:220px;' +
        'backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,0,0,0.5)';
      bldList.style.setProperty('display', 'block', 'important');
      // Also show parent if hidden
      if (bldList.parentElement) bldList.parentElement.style.display = 'block';
      console.log(`[S285] §CITY_LIST shown cards=${(A.allBuildingCards||[]).length} display=${getComputedStyle(bldList).display}`);
    }

    // §S285: Draw individual element AABBs from cached building DBs (not big building bboxes)
    // For each archetype: read element_transforms from cached _extracted.db in IDB,
    // then for each city instance, offset element positions and draw as InstancedMesh wireframe.
    // Falls back to building-level bboxes for uncached buildings.
    var _t0 = performance.now();
    var _totalBboxes = 0;
    var _cachedArchetypes = 0;
    var _fallbackBuildings = 0;
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

    // ── Fallback: building-level bboxes from city_index (LineSegments, clickable) ──
    function _drawBuildingFallback(insts) {
      for (var fi = 0; fi < insts.length; fi++) {
        _fallbackBuildings++;
        var fb = insts[fi];
        var fbRows = A.cityDb.exec(`SELECT discipline, min_x, min_y, min_z, max_x, max_y, max_z FROM building_summary WHERE building = ?`, [fb.building]);
        if (!fbRows.length) continue;
        for (var fri = 0; fri < fbRows[0].values.length; fri++) {
          var fr = fbRows[0].values[fri];
          var fColor = A.DISC_COLORS[fr[0]] || A.DEFAULT_COLOR;
          var fc = A.ifc2three((fr[1]+fr[4])/2, (fr[2]+fr[5])/2, (fr[3]+fr[6])/2);
          var fsx = fr[4]-fr[1], fsy = (fr[6]-fr[3]), fsz = fr[5]-fr[2];
          if (fsx < 0.1 || fsy < 0.1 || fsz < 0.1) continue;
          var fGeo = new THREE.BoxGeometry(fsx, fsy, fsz);
          var fEdges = new THREE.EdgesGeometry(fGeo);
          fGeo.dispose();
          var fLine = new THREE.LineSegments(fEdges,
            new THREE.LineBasicMaterial({ color: fColor, opacity: 0.6, transparent: true }));
          fLine.position.set(fc.x, fc.y, fc.z);
          fLine.userData = { building: fb.building, discipline: fr[0] };
          A.scene.add(fLine);
        }
      }
    }

    for (var archName in archInstances) {
      var instances = archInstances[archName];
      var bldEntry = null;
      // Look up the BUILDINGS map for the DB filename
      for (var bk in A.cityArchetypes) {
        if (bk === archName) { bldEntry = A.cityArchetypes[bk]; break; }
      }
      if (!bldEntry) continue;

      // Try to read cached _extracted.db from IDB
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

      if (cachedBuf) {
        // ── Individual element AABBs from cached DB ──
        // §S285: Older extractions lack bbox_* columns in element_transforms. Probe the
        // schema first; if absent (or any query throws) degrade gracefully to building-level
        // bboxes instead of throwing an uncaught error that would abort the whole city init
        // (no §CITY_BBOX / §CITY_READY, blank scene).
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
          if (!_hasBbox) console.warn(`[S285] §CITY_BBOX_DEGRADE archetype=${archName} no bbox_* columns — building-level fallback`);
          _drawBuildingFallback(instances);
          continue;
        }
        _cachedArchetypes++;
        var arcX = arcCen[0].values[0][0];
        var arcY = arcCen[0].values[0][1];
        var arcZ = arcCen[0].values[0][2];

        // Group by discipline for coloring
        var byDisc = {};
        for (var ei = 0; ei < elemRows[0].values.length; ei++) {
          var er = elemRows[0].values[ei];
          var disc = er[0] || '_';
          if (!byDisc[disc]) byDisc[disc] = [];
          byDisc[disc].push(er);
        }

        // For each city instance of this archetype, draw offset element bboxes
        for (var ii = 0; ii < instances.length; ii++) {
          var inst = instances[ii];
          var offX = inst.ix - arcX;
          var offY = inst.iy - arcY;
          var offZ = inst.iz - arcZ;

          for (var dName in byDisc) {
            var drows = byDisc[dName];
            var color = A.DISC_COLORS[dName] || A.DEFAULT_COLOR;
            var mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.35 });
            var iMesh = new THREE.InstancedMesh(geo, mat, drows.length);
            iMesh.frustumCulled = false;
            iMesh.userData = { isBboxPlaceholder: true, building: inst.building };

            for (var di = 0; di < drows.length; di++) {
              var dr = drows[di];
              var p = A.ifc2three(dr[1] + offX, dr[2] + offY, dr[3] + offZ);
              var bx = dr[4] || 0.3, by = dr[5] || 0.3, bz = dr[6] || 0.3;
              _pos.set(p.x, p.y, p.z);
              _scl.set(bx, bz, by);  // IFC→Three: swap Y/Z
              _m4.compose(_pos, _quat, _scl);
              iMesh.setMatrixAt(di, _m4);
            }
            iMesh.instanceMatrix.needsUpdate = true;
            A.scene.add(iMesh);
            _totalBboxes += drows.length;
          }
        }
      } else {
        // ── Fallback: building-level bboxes from city_index ──
        _drawBuildingFallback(instances);
      }
    }
    var _dt = (performance.now() - _t0).toFixed(0);
    console.log(`[S285] §CITY_BBOX individual=${_totalBboxes.toLocaleString()} cachedArch=${_cachedArchetypes} fallback=${_fallbackBuildings} ms=${_dt}`);
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

      const [extBuf, libBuf] = await Promise.all([
        A.cachedFetch(extUrl),
        A.cachedFetch(libUrl),
      ]);

      const extDb = new A.citySQL.Database(new Uint8Array(extBuf));
      const libDb2 = new A.citySQL.Database(new Uint8Array(libBuf));
      A.cityBuildingDbs[archetype] = { db: extDb, libDb: libDb2 };
      console.log(`[S203] §CITY_DL archetype=${archetype} ext=${(extBuf.byteLength/1024/1024).toFixed(1)}MB lib=${(libBuf.byteLength/1024/1024).toFixed(1)}MB`);
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
