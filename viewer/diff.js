/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// diff.js — S222 Incremental Diff: GUID set diff, change_log, colour overlay
// Loaded by viewer index.html after streaming.js

function setupDiff(A) {
  const DIFF_COLORS = {
    added:   { color: 0x44cc44, opacity: 1.0 },   // green solid
    removed: { color: 0xcc4444, opacity: 0.5 },   // red ghost
    changed: { color: 0xcccc44, opacity: 1.0 },   // yellow solid
  };

  // Called after base DB loaded, if variation DB exists
  // A.db = base, A.diffDb = variation (both sql.js instances)
  A.computeDiff = function() {
    if (!A.db || !A.diffDb) { console.log('[S225] §DIFF_SKIP db=' + !!A.db + ' diffDb=' + !!A.diffDb); return null; }

    console.log('[S225] §DIFF_COMPUTE_START');
    const guids1 = new Set(A.dbQuery("SELECT guid FROM elements_meta").map(r => r[0]));
    const g2raw = A.diffDb.exec("SELECT guid FROM elements_meta");
    const guids2 = new Set(g2raw.length ? g2raw[0].values.map(r => r[0]) : []);
    console.log('[S225] §DIFF_GUIDS base=' + guids1.size + ' variation=' + guids2.size);

    const added = [...guids2].filter(g => !guids1.has(g));
    const common = [...guids2].filter(g => guids1.has(g));
    var changedDetails = []; // §S260c: track first 5 changed fields for log
    const changed = common.filter(g => {
      const r1 = A.dbQueryFirst("SELECT element_name, material_rgba, storey FROM elements_meta WHERE guid=?", [g]);
      const r2raw = A.diffDb.exec("SELECT element_name, material_rgba, storey FROM elements_meta WHERE guid=?", [g]);
      const r2 = r2raw.length ? r2raw[0].values[0] : null;
      var isDiff = JSON.stringify(r1) !== JSON.stringify(r2);
      if (isDiff && changedDetails.length < 5) {
        changedDetails.push(g.substring(0,12) + ': base=' + JSON.stringify(r1) + ' var=' + JSON.stringify(r2));
      }
      return isDiff;
    });

    // S225: Detect merge vs revision — if <10% GUID overlap, this is a merge
    // of distinct buildings, not a revision. Don't mark base elements as "removed".
    const overlap = common.length / Math.max(guids1.size, guids2.size);
    const isMerge = overlap < 0.1;
    const removed = isMerge ? [] : [...guids1].filter(g => !guids2.has(g));

    A.diffResult = { added, removed, changed, isMerge };
    console.log('[S225] §DIFF added=' + added.length + ' removed=' + removed.length + ' changed=' + changed.length + ' common=' + common.length + ' overlap=' + (overlap * 100).toFixed(1) + '% mode=' + (isMerge ? 'MERGE' : 'REVISION'));
    if (changedDetails.length) console.log('[S225] §DIFF_CHANGED_SAMPLE ' + changedDetails.join(' | '));
    if (added.length) console.log('[S225] §DIFF_ADDED_SAMPLE ' + added.slice(0,5).map(function(g) { return g.substring(0,12); }).join(', '));
    if (removed.length) console.log('[S225] §DIFF_REMOVED_SAMPLE ' + removed.slice(0,5).map(function(g) { return g.substring(0,12); }).join(', '));
    return A.diffResult;
  };

  // Apply diff colours to already-streamed meshes + stream added elements from diffDb
  A.applyDiffOverlay = function() {
    if (!A.diffResult) { console.log('[S225] §DIFF_OVERLAY_SKIP no diffResult'); return; }
    console.log('[S225] §DIFF_OVERLAY_START added=' + A.diffResult.added.length + ' removed=' + A.diffResult.removed.length + ' changed=' + A.diffResult.changed.length);

    const removedSet = new Set(A.diffResult.removed);
    const changedSet = new Set(A.diffResult.changed);

    // S239: Colour existing meshes (removed = red ghost, changed = yellow)
    var coloredRemoved = 0, coloredChanged = 0, totalMeshesScanned = 0;
    A.collectMeshes(o => o.isMesh && o.userData.guid).forEach(function(obj) {
      totalMeshesScanned++;
      const guid = obj.userData.guid;
      if (removedSet.has(guid)) {
        obj.material = new THREE.MeshPhongMaterial({
          color: DIFF_COLORS.removed.color,
          transparent: true,
          opacity: DIFF_COLORS.removed.opacity,
          side: THREE.DoubleSide,
          flatShading: true,
        });
        coloredRemoved++;
      } else if (changedSet.has(guid)) {
        obj.material = new THREE.MeshPhongMaterial({
          color: DIFF_COLORS.changed.color,
          transparent: false,
          opacity: DIFF_COLORS.changed.opacity,
          flatShading: true,
        });
        coloredChanged++;
      }
    });
    console.log('[S225] §DIFF_OVERLAY_COLORS meshesScanned=' + totalMeshesScanned + ' coloredRemoved=' + coloredRemoved + '/' + removedSet.size + ' coloredChanged=' + coloredChanged + '/' + changedSet.size);

    // S225: Stream added elements from diffDb into scene (green solid)
    var addedRendered = 0;
    var addedNoGeo = 0;  // §S260c: count elements with no geometry (missing hash)
    if (A.diffResult.added.length > 0 && A.diffDb) {
      console.log('[S225] §DIFF_ADDED_STREAM_START count=' + A.diffResult.added.length);
      try {
        var rows = A.diffDb.exec(
          'SELECT m.guid, i.geometry_hash, m.material_rgba, ' +
          't.center_x, t.center_y, t.center_z, ' +
          't.rotation_x, t.rotation_y, t.rotation_z, m.storey, m.ifc_class ' +
          'FROM elements_meta m ' +
          'JOIN element_instances i ON m.guid = i.guid ' +
          'JOIN element_transforms t ON t.guid = m.guid ' +
          "WHERE m.guid IN (" + A.diffResult.added.map(function(g) { return "'" + g.replace(/'/g, "''") + "'"; }).join(',') + ")"
        );
        var joinedRows = rows.length ? rows[0].values.length : 0;
        console.log('[S225] §DIFF_ADDED_QUERY rows=' + joinedRows + ' (of ' + A.diffResult.added.length + ' added GUIDs — missing rows = no transform or no instance)');
        if (rows.length > 0) {
          // Fetch geometry BLOBs from diffDb
          var hashes = new Set();
          rows[0].values.forEach(function(r) { if (r[1]) hashes.add(r[1]); });
          console.log('[S225] §DIFF_ADDED_HASHES unique=' + hashes.size);
          var diffGeoCache = {};
          if (hashes.size > 0) {
            var hashList = Array.from(hashes);
            for (var table of ['component_geometries', 'base_geometries']) {
              try {
                var geoRows = A.diffDb.exec(
                  'SELECT geometry_hash, vertices, faces FROM ' + table +
                  ' WHERE geometry_hash IN (' + hashList.map(function(h) { return "'" + h.replace(/'/g, "''") + "'"; }).join(',') + ')'
                );
                if (geoRows.length > 0) {
                  var geoOk = 0, geoFail = 0;
                  geoRows[0].values.forEach(function(gr) {
                    var geo = A.blobToGeometry(gr[1], gr[2]);
                    if (geo) { diffGeoCache[gr[0]] = geo; geoOk++; }
                    else geoFail++;
                  });
                  console.log('[S225] §DIFF_ADDED_GEO table=' + table + ' ok=' + geoOk + ' fail=' + geoFail);
                  if (Object.keys(diffGeoCache).length > 0) break;
                }
              } catch(e) { console.log('[S225] §DIFF_ADDED_GEO_TABLE_MISS table=' + table + ' err=' + e.message); }
            }
          }
          // Create green meshes for added elements
          var addedMat = new THREE.MeshPhongMaterial({
            color: DIFF_COLORS.added.color,
            transparent: false,
            opacity: DIFF_COLORS.added.opacity,
            flatShading: true,
          });
          rows[0].values.forEach(function(r) {
            var guid = r[0], hash = r[1];
            var cx = r[3], cy = r[4], cz = r[5];
            var rx = r[6] || 0, ry = r[7] || 0, rz = r[8] || 0;
            var geo = diffGeoCache[hash];
            if (!geo) { addedNoGeo++; return; }
            var mesh = new THREE.Mesh(geo, addedMat.clone());
            var pos = A.ifc2three(cx, cy, cz);
            mesh.position.set(pos.x, pos.y, pos.z);
            if (rx || ry || rz) mesh.rotation.set(rx, rz, -ry);
            mesh.userData.guid = guid;
            mesh.userData.diffStatus = 'ADDED';
            mesh.userData.ifcClass = r[10] || '';
            mesh.userData.storey = r[9] || '';
            A.scene.add(mesh);
            addedRendered++;
          });
          addedMat.dispose(); // template material no longer needed
        }
      } catch(e) {
        console.log('[S225] §DIFF_ADDED_ERROR ' + e.message);
      }
    }

    console.log('[S225] §DIFF_OVERLAY_DONE added_rendered=' + addedRendered + ' added_noGeo=' + addedNoGeo + ' removed_colored=' + coloredRemoved + '/' + removedSet.size + ' changed_colored=' + coloredChanged + '/' + changedSet.size);
  };

  // Get diff details for a specific GUID (for info panel)
  A.getDiffDetail = function(guid) {
    if (!A.diffResult) return null;
    if (A.diffResult.added.includes(guid)) { console.log('[S222] §DIFF_DETAIL guid=' + guid.substring(0,12) + ' status=ADDED'); return { status: 'ADDED', color: '#44cc44' }; }
    if (A.diffResult.removed.includes(guid)) { console.log('[S222] §DIFF_DETAIL guid=' + guid.substring(0,12) + ' status=REMOVED'); return { status: 'REMOVED', color: '#cc4444' }; }
    if (A.diffResult.changed.includes(guid)) {
      // Show what changed
      // S239: parameterized queries (was manual escaping — SQL injection risk)
      const r1 = A.dbQueryFirst("SELECT element_name, material_rgba, storey FROM elements_meta WHERE guid=?", [guid]);
      const r2raw = A.diffDb.exec("SELECT element_name, material_rgba, storey FROM elements_meta WHERE guid=?", [guid]);
      return {
        status: 'CHANGED', color: '#cccc44',
        old: r1,
        new: r2raw.length ? r2raw[0].values[0] : null,
      };
    }
    return null;
  };

  // S225: Zoom camera to a mesh by GUID + yellow bbox highlight
  A.zoomToGuid = function(guid) {
    var target = A.collectMeshes(o => o.isMesh && o.userData.guid === guid)[0] || null;
    if (!target) { console.log('[S225] §ZOOM_MISS guid=' + guid.substring(0, 12)); return; }

    // Yellow bbox highlight (same as picking.js)
    if (window._pickHighlight) {
      const prev = window._pickHighlight;
      if (prev.parent) prev.parent.remove(prev);
      prev.geometry.dispose();
      prev.material.dispose();
      window._pickHighlight = null;
    }
    target.geometry.computeBoundingBox();
    var bb = target.geometry.boundingBox;
    var sz = new THREE.Vector3(); bb.getSize(sz);
    var ctr = new THREE.Vector3(); bb.getCenter(ctr);
    var hlGeo = new THREE.BoxGeometry(sz.x, sz.y, sz.z);
    var hlEdges = new THREE.EdgesGeometry(hlGeo);
    var hlLine = new THREE.LineSegments(hlEdges, new THREE.LineBasicMaterial({ color: 0xffff00 }));
    hlLine.position.copy(ctr);
    target.add(hlLine);
    window._pickHighlight = hlLine;

    // Zoom camera
    var box = new THREE.Box3().setFromObject(target);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var dist = Math.max(size.x, size.y, size.z) * 3 + 2;
    var end = center.clone().add(new THREE.Vector3(dist * 0.5, dist * 0.5, dist * 0.7));
    var start = A.camera.position.clone();
    var t = 0;
    function anim() {
      t += 0.04;
      if (t > 1) t = 1;
      var e = 1 - Math.pow(1 - t, 3);
      A.camera.position.lerpVectors(start, end, e);
      A.controls.target.copy(center);
      A.controls.update();
      if (t < 1) requestAnimationFrame(anim);
    }
    anim();
    console.log('[S225] §ZOOM guid=' + guid.substring(0, 12));
  };

  // Look up element info from either DB
  function _elInfo(guid) {
    var dbs = [A.diffDb, A.db];
    for (var i = 0; i < dbs.length; i++) {
      if (!dbs[i]) continue;
      try {
        // S239: parameterized query (was manual escaping)
        var r = dbs[i].exec("SELECT ifc_class, element_name, storey FROM elements_meta WHERE guid=?", [guid]);
        if (r.length && r[0].values.length) return r[0].values[0];
      } catch(e) {}
    }
    return ['?', guid.substring(0, 20), '?'];
  }

  // Show diff summary panel — scrollable element list with click-to-zoom
  A.showDiffSummary = function() {
    if (!A.diffResult) return;
    var panel = document.getElementById('diff-summary');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'diff-summary';
      panel.style.cssText = 'position:fixed;top:60px;left:16px;z-index:20;background:rgba(0,0,0,0.9);border-radius:8px;padding:12px 16px;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(8px);font-size:12px;color:#ccc;min-width:240px;max-width:320px;max-height:70vh;display:flex;flex-direction:column';
      document.body.appendChild(panel);
    }
    var d = A.diffResult;
    var modeLabel = d.isMerge ? 'Merge — New Elements' : 'Variation Diff';

    // Header
    var html = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">' + modeLabel + '</div>';
    html += '<div style="color:#44cc44">+ Added: ' + d.added.length + '</div>';
    if (!d.isMerge) html += '<div style="color:#cc4444">\u2212 Removed: ' + d.removed.length + '</div>';
    html += '<div style="color:#cccc44">~ Changed: ' + d.changed.length + '</div>';
    html += '<div style="margin-top:4px;color:#888;font-size:11px">Click element to zoom</div>';

    // Scrollable element list
    html += '<div style="margin-top:8px;max-height:40vh;overflow-y:auto;border-top:1px solid #333;padding-top:6px">';
    function row(guid, status, color) {
      var info = _elInfo(guid);
      var cls = info[0] || '?', name = (info[1] || '').substring(0, 30), storey = info[2] || '';
      html += '<div onclick="APP.zoomToGuid(\'' + guid.replace(/'/g, "\\'") + '\')" style="padding:4px 6px;margin:2px 0;border-radius:4px;cursor:pointer;border-left:3px solid ' + color + ';background:rgba(255,255,255,0.03);transition:background 0.1s" onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.03)\'">';
      html += '<div style="color:' + color + ';font-size:10px;font-weight:600">' + status + '</div>';
      html += '<div style="font-size:11px;color:#ddd">' + cls + '</div>';
      html += '<div style="font-size:10px;color:#888">' + name + '</div>';
      if (storey) html += '<div style="font-size:9px;color:#666">' + storey + '</div>';
      html += '</div>';
    }
    for (var i = 0; i < d.added.length; i++) row(d.added[i], 'ADDED', '#44cc44');
    for (var i = 0; i < d.removed.length; i++) row(d.removed[i], 'REMOVED', '#cc4444');
    for (var i = 0; i < d.changed.length; i++) row(d.changed[i], 'CHANGED', '#cccc44');
    html += '</div>';

    // Footer
    html += '<div style="margin-top:8px;font-size:10px;color:#666">📊 4D/5D for costed Excel &middot; <a href="https://red1oon.github.io/BIMCompiler/BIM_Designer_Browser/#phase-2b-ifc-import-variation-order-s220s222-done" target="_blank" style="color:#4fc3f7;text-decoration:none">See rates &amp; templates</a></div>';
    html += '<button onclick="this.parentElement.style.display=\'none\'" style="margin-top:6px;padding:5px 12px;background:#444;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:11px;width:100%">Close</button>';

    panel.innerHTML = html;
    panel.style.display = 'flex';
    console.log('[S225] §DIFF_SUMMARY added=' + d.added.length + ' removed=' + d.removed.length + ' changed=' + d.changed.length);
  };

  // Toggle variance panel visibility (called from HUD button)
  A.toggleVariance = function() {
    var panel = document.getElementById('diff-summary');
    if (panel && panel.style.display !== 'none') {
      panel.style.display = 'none';
    } else {
      A.showDiffSummary();
    }
  };
}
