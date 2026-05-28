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

    const zRange = A.cityDb.exec(`SELECT MIN(min_z), MAX(max_z) FROM building_summary`);
    if (zRange.length > 0) {
      const groundY = (zRange[0].values[0][0] - A.modelOffset.z) - 2;
      A.ground.position.y = groundY;
      A.ground.visible = true;
    }

    A.updateHUD();
    A.populateBuildingList();

    // §S285: Show building list in city mode — was hidden by S280 UI overhaul
    var bldList = document.getElementById('building-list');
    if (bldList) {
      bldList.style.cssText = 'display:block;position:fixed;top:60px;left:12px;z-index:20;' +
        'background:rgba(17,17,17,0.95);border:1px solid #333;border-radius:10px;' +
        'padding:8px;max-height:70vh;overflow-y:auto;width:220px;' +
        'backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,0,0,0.5)';
      // Also show parent if hidden
      if (bldList.parentElement) bldList.parentElement.style.display = 'block';
    }

    const bboxRows = A.cityDb.exec(`
      SELECT building, discipline,
        min_x, min_y, min_z, max_x, max_y, max_z
      FROM building_summary
    `);
    if (bboxRows.length > 0) {
      for (const row of bboxRows[0].values) {
        const [bld, disc, minX, minY, minZ, maxX, maxY, maxZ] = row;
        const color = A.DISC_COLORS[disc] || A.DEFAULT_COLOR;
        const c = A.ifc2three((minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2);
        const sx = maxX - minX;
        const sy = maxZ - minZ;
        const sz = maxY - minY;
        if (sx < 0.1 || sy < 0.1 || sz < 0.1) continue;
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        const edges = new THREE.EdgesGeometry(geo);
        geo.dispose(); // intermediate geometry no longer needed
        const line = new THREE.LineSegments(edges,
          new THREE.LineBasicMaterial({ color, opacity: 0.6, transparent: true }));
        line.position.set(c.x, c.y, c.z);
        line.userData = { building: bld, discipline: disc };
        A.scene.add(line);
      }
    }

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
