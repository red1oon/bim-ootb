/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// picking.js — Click-to-identify (raycaster), walk/wall state, pointer handlers

// S258: InstancedMesh.raycast polyfill REMOVED — native since r132, using r156+
// §INSTANCED_RAYCAST native=true

// §S277d: Restore isolation — undo dim + picked element transparency
function _restoreIsolation(A) {
  if (A._pickIsolated) {
    A._pickIsolated.forEach(function(b) {
      b.mat.opacity = b.origOp;
      b.mat.transparent = b.origTr;
      delete b.mat.userData._pickDimmed;
      b.mat.needsUpdate = true;
    });
    A._pickIsolated = null;
  }
  // Restore picked element material
  var mc = A._matCache || {};
  for (var k in mc) {
    var m = mc[k];
    if (m && m.userData._pickTarget) {
      m.opacity = m.userData._pickOrigOp;
      m.transparent = m.userData._pickOrigTr;
      delete m.userData._pickTarget;
      delete m.userData._pickOrigOp;
      delete m.userData._pickOrigTr;
      m.needsUpdate = true;
    }
  }
}

// §S278: Cached temp objects — reused per pick to avoid GC pressure (lazy-init, THREE may not be loaded yet)
var _pickV1, _pickV2, _pickV3, _pickQ1, _pickM4;

function setupPicking(A) {
  _pickV1 = new THREE.Vector3(); _pickV2 = new THREE.Vector3(); _pickV3 = new THREE.Vector3();
  _pickQ1 = new THREE.Quaternion(); _pickM4 = new THREE.Matrix4();
  // Walk/Wall state (hoisted before first use in pointerdown/animate)
  A.walkMode = false;
  A.walkModeActive = false;
  A.walkAnchorGPS = null;
  A.walkAnchorIFC = null;
  A.walkBlueDot = null;
  A.walkGpsWatchId = null;
  A.walkStoreyLevels = [];
  A.walkGpsFollowCam = false;
  A.wallXrayActive = false;
  A.wallXrayOriginals = [];
  A.walkPath = [];
  A.walkT = 0;
  A.walkTotalLen = 0;
  A.walkSpeedMult = 1;
  A.walkCurrentRoom = '';
  A.walkLastTime = 0;
  A.wallXrayMepHighlights = [];
  A.measureActive = false;
  A.measureFirstPoint = null;
  A.measureFirstMarker = null;
  A.measureGroup = new THREE.Group();
  A.measureLabels = [];
  A.scene.add(A.measureGroup);

  // Fly state
  A.flyActive = false;
  A.flyAngle = 0;
  A.flyTargets = [];
  A.flyTargetIdx = 0;
  A.flyTransitioning = false;
  A.flyTransitionStart = 0;
  A.flyFromPos = null;
  A.flyFromTarget = null;

  // Walk action state
  A.walkActions = [];
  A.walkActionIdx = 0;
  A.walkActionT = 0;
  A.walkPanAngle = 0;
  A.walkOrbitAngle = 0;

  // Walk log
  A._wlog = [];
  A.wlog = function(msg) {
    A._wlog.push(msg);
    console.log('[WALK] ' + msg);
    const el = document.getElementById('walk-log');
    if (el) el.textContent = A._wlog.join('\n');
  };

  A._longPressTimer = null;
  A._canvasPointerDown = false;  // BUG-2: track that pointerdown started on canvas
  A.canvas.addEventListener('pointerdown', (e) => {
    A._canvasPointerDown = true;
    A.pointerDownPos.x = e.clientX;
    A.pointerDownPos.y = e.clientY;
    if (A.flyActive || A.walkMode) {
      A.flyActive = false;
      A.walkMode = false;
      A.walkPath = [];
      document.getElementById('fly-btn').style.background = '#444';
      document.getElementById('fly-btn').style.color = '#fff';
      document.getElementById('walk-speed-btn').style.display = 'none';
    }
    // Long-press (500ms) → volume info card (mobile-friendly right-click)
    // Only start on single-finger touch; cancel if pinch (2nd pointer) or any move
    A._longPressFired = false;
    A._pointerCount = (A._pointerCount || 0) + 1;
    if (A._pointerCount > 1 && A._longPressTimer) {
      // Second finger down = pinch — cancel long-press
      clearTimeout(A._longPressTimer);
      A._longPressTimer = null;
    } else if (A.measureActive && A._pointerCount === 1) {
      var ev = { clientX: e.clientX, clientY: e.clientY, preventDefault: function(){} };
      A._longPressTimer = setTimeout(function() {
        A._longPressTimer = null;
        // Re-check: if a 2nd finger arrived during the wait, abort (pinch/zoom in progress)
        if (A._pointerCount > 1) {
          console.log('§LONGPRESS cancelled — multi-touch (pinch/zoom)');
          return;
        }
        A._longPressFired = true;
        A.handleMeasureRightClick(ev);
      }, 500);
    }
  });
  A.canvas.addEventListener('pointerup', () => {
    A._pointerCount = Math.max(0, (A._pointerCount || 1) - 1);
  });
  A.canvas.addEventListener('pointercancel', () => {
    A._pointerCount = Math.max(0, (A._pointerCount || 1) - 1);
  });
  A.canvas.addEventListener('pointermove', (e) => {
    // Cancel long-press if finger/mouse moves
    if (A._longPressTimer) {
      var dx = e.clientX - A.pointerDownPos.x;
      var dy = e.clientY - A.pointerDownPos.y;
      if (Math.sqrt(dx*dx + dy*dy) > 10) {
        clearTimeout(A._longPressTimer);
        A._longPressTimer = null;
      }
    }
  });

  A.canvas.addEventListener('dblclick', (e) => {
    if (A.measureActive) { A.handleMeasureDblClick(e); return; }
  });

  A.canvas.addEventListener('contextmenu', (e) => {
    if (A.measureActive) { A.handleMeasureRightClick(e); return; }
  });

  A.canvas.addEventListener('pointerup', (e) => {
    // Cancel long-press on release — suppress click if long-press already fired
    if (A._longPressTimer) { clearTimeout(A._longPressTimer); A._longPressTimer = null; }
    if (A._longPressFired) { A._longPressFired = false; A._canvasPointerDown = false; return; }

    // BUG-2 S250: Only pick if pointerdown started on canvas (not on a panel)
    if (!A._canvasPointerDown) {
      console.log('§PICK_GUARD blocked — pointerdown was not on canvas');
      return;
    }
    A._canvasPointerDown = false;

    const dx = e.clientX - A.pointerDownPos.x;
    const dy = e.clientY - A.pointerDownPos.y;
    if (Math.sqrt(dx*dx + dy*dy) > 5) return; // drag, not tap — skip all click logic

    // Double-tap detection for mobile (dblclick doesn't fire on touch)
    var now = Date.now();
    if (A.measureActive && e.button === 0) {
      if (A._lastMeasureTap && (now - A._lastMeasureTap) < 350) {
        A._lastMeasureTap = 0;
        if (A._measureClickTimer) { clearTimeout(A._measureClickTimer); A._measureClickTimer = null; }
        A.handleMeasureDblClick(e);
        return;
      }
      A._lastMeasureTap = now;
      if (A.handleMeasureClick(e)) return;
    }
    if (e.shiftKey || e.button !== 0) return;

    A.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    A.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    A.raycaster.setFromCamera(A.mouse, A.camera);
    A.raycaster.firstHitOnly = false;  // §S260d: WYSIWYG — check all hits, pick best match (was BVH early termination)

    // City mode: check bbox wireframes first
    if (A.CITY_URL) {
      const bboxes = A.collectMeshes(o => o.isLineSegments && o.userData.building);
      const bboxHits = A.raycaster.intersectObjects(bboxes, false);
      if (bboxHits.length > 0) {
        const bldName = bboxHits[0].object.userData.building;
        A.flyTo(bldName);
        return;
      }
    }

    if (!A.db) return;

    // 2D mode: also pick contour Lines/LineSegments (door arcs, wall outlines, furniture)
    const isFloor2D = typeof GridViews !== 'undefined' &&
      (GridViews.activeView() === 'floor' || GridViews.activeView() === 'floor1');
    if (isFloor2D) {
      A.raycaster.params.Line = { threshold: 0.3 };
    }

    const meshes = A.collectMeshes(o => {
      if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible) return true;
      // In 2D mode, include contour lines for picking
      if (isFloor2D && (o.isLine || o.isLineSegments) && o.userData && o.userData.isContour && o.visible) return true;
      return false;
    });
    const hits = A.raycaster.intersectObjects(meshes, false);

    if (!hits.length) {
      document.getElementById('info-panel').style.display = 'none';
      A._lastPickGuid = null;
      // §S265: Clear highlight bbox on empty-spot tap (deselect)
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        window._pickHighlight.geometry.dispose();
        window._pickHighlight.material.dispose();
        window._pickHighlight = null;
        if (A.markDirty) A.markDirty();
      }
      // §S277c: Clear outline on deselect
      if (A.setOutline) A.setOutline([], 0xff8c00);
      // §S277d: Restore isolation
      _restoreIsolation(A);
      return;
    }

    // §S260d: WYSIWYG — skip non-pickable hits (outlines, low-opacity, invisible)
    var validHits = [];
    var _hitClashViz = false;
    for (var hi = 0; hi < hits.length; hi++) {
      var h = hits[hi];
      if (h.object.userData && h.object.userData._isOutline) continue;
      if (h.object.userData && h.object.userData._isClashViz) { _hitClashViz = true; continue; }
      if (h.object.material && h.object.material.opacity < 0.3) continue;
      if (h.object.userData && h.object.userData.isBboxPlaceholder) continue;
      validHits.push(h);
    }
    // §S278: If ray hit a clash overlay, suppress picking entirely — user is viewing clash, not picking
    if (_hitClashViz) validHits = [];
    if (!validHits.length) {
      document.getElementById('info-panel').style.display = 'none';
      A._lastPickGuid = null;
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        window._pickHighlight.geometry.dispose();
        window._pickHighlight.material.dispose();
        window._pickHighlight = null;
        if (A.markDirty) A.markDirty();
      }
      if (A.setOutline) A.setOutline([], 0xff8c00);
      _restoreIsolation(A);
      return;
    }

    // S275: Prefer smallest element among nearby hits — walls should not steal
    // picks from doors/windows/furniture embedded in them
    var hit = validHits[0];
    var DEPTH_BAND = 0.5; // metres — hits within this band compete on bbox volume
    if (validHits.length > 1 && A.db) {
      var candidates = [];
      var baseD = validHits[0].distance;
      for (var ci = 0; ci < Math.min(validHits.length, 8); ci++) {
        if (validHits[ci].distance - baseD > DEPTH_BAND) break;
        // Resolve guid for this candidate
        var cHit = validHits[ci];
        var cGuid = null;
        if (cHit.object.isBatchedMesh && cHit.batchId !== undefined && A._batchMeta && A._batchMeta[cHit.object.id]) {
          var bm = A._batchMeta[cHit.object.id];
          var be = bm.find(function(m) { return m.slotId === cHit.batchId; });
          if (be) cGuid = be.guid;
        }
        if (!cGuid && cHit.object.isInstancedMesh && cHit.instanceId !== undefined && A._instanceMeta[cHit.object.id]) {
          var im = A._instanceMeta[cHit.object.id][cHit.instanceId];
          if (im) cGuid = im.guid;
        }
        if (!cGuid) cGuid = A.guidMap[cHit.object.id];
        if (!cGuid && cHit.object.userData && cHit.object.userData.guid) cGuid = cHit.object.userData.guid;
        if (cGuid) candidates.push({ hit: cHit, guid: cGuid });
      }
      if (candidates.length > 1) {
        // Look up bbox volumes — pick smallest
        var guidList = candidates.map(function(c) { return "'" + c.guid.replace(/'/g, "''") + "'"; }).join(',');
        try {
          var volRows = A.dbQuery(
            'SELECT guid, bbox_x * bbox_y * bbox_z AS vol FROM element_transforms WHERE guid IN (' + guidList + ')');
          var volMap = {};
          volRows.forEach(function(r) { volMap[r[0]] = r[1] || 999999; });
          candidates.sort(function(a, b) { return (volMap[a.guid] || 999999) - (volMap[b.guid] || 999999); });
          hit = candidates[0].hit;
          if (candidates[0].guid !== candidates[candidates.length-1].guid) {
            var chosenVol = volMap[candidates[0].guid] || 0;
            var loserVol = volMap[candidates[candidates.length-1].guid] || 0;
            console.log('§PICK_PREFER_SMALL chose=' + candidates[0].guid.substring(0, 12) +
              ' vol=' + chosenVol.toFixed(2) +
              ' over=' + candidates[candidates.length-1].guid.substring(0, 12) +
              ' vol=' + loserVol.toFixed(2));
          }
        } catch(e) { /* fall back to closest hit */ }
      }
    }

    // §S260d: WYSIWYG pick diagnostic — log first 3 hits to trace accuracy
    var pickInfo = validHits.slice(0, 3).map(function(h, i) {
      var t = h.object.isBatchedMesh ? 'BM' : h.object.isInstancedMesh ? 'IM' : 'M';
      var g = h.object.userData && h.object.userData.guid || (h.batchId !== undefined ? 'slot:' + h.batchId : '?');
      var op = h.object.material ? h.object.material.opacity.toFixed(1) : '?';
      return i + ':' + t + ' d=' + h.distance.toFixed(2) + ' op=' + op + ' g=' + String(g).substring(0, 12);
    });
    console.log('§PICK hits=' + hits.length + ' chosen=' + validHits.indexOf(hit) + ' ' + pickInfo.join(' | '));
    let guid = null;
    // §S260: BatchedMesh — use batchId to look up guid from _batchMeta
    if (!guid && hit.object.isBatchedMesh && hit.batchId !== undefined && A._batchMeta && A._batchMeta[hit.object.id]) {
      const bmeta = A._batchMeta[hit.object.id];
      // batchId = slot index from addGeometry
      const entry = bmeta.find(m => m.slotId === hit.batchId);
      if (entry) {
        guid = entry.guid;
        console.log('§BATCHED_PICK guid=' + guid + ' batchId=' + hit.batchId + ' storey=' + entry.storey + ' disc=' + entry.disc);
      }
    }
    // S232: InstancedMesh — use instanceId to look up guid from metadata
    if (!guid && hit.object.isInstancedMesh && hit.instanceId !== undefined && A._instanceMeta[hit.object.id]) {
      const meta = A._instanceMeta[hit.object.id][hit.instanceId];
      if (meta) guid = meta.guid;
    }
    // S232: Merged mesh — resolve nearest element by hit-point distance in DB
    if (!guid && hit.object.userData.isMerged) {
      // Convert Three.js hit point back to IFC coordinates
      const hp = hit.point;
      const ix = hp.x + A.modelOffset.x;
      const iy = -hp.z + A.modelOffset.y;
      const iz = hp.y + A.modelOffset.z;
      const ud = hit.object.userData;
      // In floor plan view, constrain Z to near the cut plane so we pick furniture not roof
      const isFloorView = typeof GridViews !== 'undefined' &&
        (GridViews.activeView() === 'floor' || GridViews.activeView() === 'floor1');
      const zConstraint = isFloorView ? 'AND ABS(t.center_z - ?) < 2.0' : '';
      const params = [ix, ix, iy, iy, iz, iz, ud.storey || '', ud.disc || ''];
      if (isFloorView) params.push(iz);
      try {
        const near = A.dbQuery(`
          SELECT m.guid,
            (t.center_x - ?) * (t.center_x - ?) +
            (t.center_y - ?) * (t.center_y - ?) +
            (t.center_z - ?) * (t.center_z - ?) AS dist2
          FROM elements_meta m
          JOIN element_transforms t ON t.guid = m.guid
          WHERE m.storey = ? AND m.discipline = ? ${zConstraint}
          ORDER BY dist2 ASC LIMIT 1
        `, params);
        if (near.length) { guid = near[0][0]; hit._mergedResolved = true; }
      } catch(e) {
        console.log(`§PICK_MERGE_ERR ${e.message}`);
      }
      if (!guid) {
        // Fallback: show group-level info only
        document.getElementById('info-class').textContent = `Merged group (${ud.mergedCount} elements)`;
        document.getElementById('info-name').textContent = '—';
        document.getElementById('info-guid').textContent = '—';
        document.getElementById('info-building').textContent = A.activeBuilding || '—';
        document.getElementById('info-storey').textContent = ud.storey || '—';
        document.getElementById('info-disc').textContent = ud.disc || '—';
        document.getElementById('info-material').textContent = '—';
        document.getElementById('info-panel').style.display = 'block';
        const snagRow = document.getElementById('snag-btn-row');
        if (snagRow) snagRow.style.display = A.walkModeActive ? 'block' : 'none';
        console.log(`§PICK merged fallback storey=${ud.storey} disc=${ud.disc}`);
        return;
      }
      console.log(`§PICK merged→resolved guid=${guid}`);
    }
    if (!guid) guid = A.guidMap[hit.object.id];
    // 2D contour/arc/label/furniture meshes carry guid directly in userData (not in guidMap)
    if (!guid && hit.object.userData && hit.object.userData.guid) {
      guid = hit.object.userData.guid;
      var pickType = hit.object.userData.isFurniture ? 'furniture' :
                     hit.object.userData.isDoorArc ? 'arc' : 'contour';
      console.log(`§PICK_2D ${pickType}→guid=${guid} class=${hit.object.userData.ifcClass || '?'} name=${hit.object.userData.elementName || '—'}`);
    }
    if (!guid) {
      console.log(`§PICK no guid for mesh.id=${hit.object.id}`);
      return;
    }

    // S275: Toggle — clicking same element again deselects (closes info panel + clears highlight)
    if (guid === A._lastPickGuid) {
      document.getElementById('info-panel').style.display = 'none';
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        window._pickHighlight.geometry.dispose();
        window._pickHighlight.material.dispose();
        window._pickHighlight = null;
        if (A.markDirty) A.markDirty();
      }
      // §S277c: Clear outline on deselect toggle
      if (A.setOutline) A.setOutline([], 0xff8c00);
      // §S277d: Restore isolation
      _restoreIsolation(A);
      A._lastPickGuid = null;
      console.log('§PICK_DESELECT guid=' + guid.substring(0, 12));
      return;
    }
    A._lastPickGuid = guid;

    // Wall X-Ray in Walk Mode
    if (A.walkModeActive) {
      const faceNormal = hit.face ? _pickV3.copy(hit.face.normal) : _pickV3.set(1, 0, 0);
      if (A.handleWallXray(hit.object, hit.point, faceNormal)) return;
      A.restoreWallXray();
    }

    // Yellow highlight bbox — dispose previous to prevent GPU geometry/material leak
    if (window._pickHighlight) {
      const prev = window._pickHighlight;
      if (prev.parent) prev.parent.remove(prev);
      prev.geometry.dispose();
      prev.material.dispose();
      window._pickHighlight = null;
    }

    // Highlight: compute bbox position + size per mesh type
    let hlSizeX, hlSizeY, hlSizeZ;
    const hlPos = _pickV1;
    const hlQuat = _pickQ1.set(0, 0, 0, 1);

    if (hit.object.userData.isMerged && guid) {
      // S250 BUG-1: merged mesh geometry bbox covers entire group — use per-element DB data
      try {
        const bboxRows = A.dbQuery(
          'SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?',
          [guid]
        );
        if (bboxRows.length && bboxRows[0][0] != null) {
          const dbC = A.ifc2three(bboxRows[0][0], bboxRows[0][1], bboxRows[0][2]);
          hlPos.set(dbC.x, dbC.y, dbC.z);
          hlSizeX = bboxRows[0][3] || 0.3;                // IFC X → Three X
          hlSizeY = bboxRows[0][5] || 0.3;                // IFC Z → Three Y
          hlSizeZ = bboxRows[0][4] || 0.3;                // IFC Y → Three Z
          console.log('§BBOX_DEBUG MERGED guid=' + guid.substring(0, 8) +
            ' pos=(' + hlPos.x.toFixed(2) + ',' + hlPos.y.toFixed(2) + ',' + hlPos.z.toFixed(2) + ')' +
            ' size=(' + hlSizeX.toFixed(2) + ',' + hlSizeY.toFixed(2) + ',' + hlSizeZ.toFixed(2) + ')');
        } else {
          hlPos.copy(hit.point);
          hlSizeX = hlSizeY = hlSizeZ = 0.3;
          console.log('§BBOX_DEBUG MERGED fallback — no DB row for ' + guid.substring(0, 8));
        }
      } catch (e) {
        hlPos.copy(hit.point);
        hlSizeX = hlSizeY = hlSizeZ = 0.3;
        console.log('§BBOX_DEBUG MERGED err=' + e.message);
      }
    } else if (hit.object.isBatchedMesh && guid) {
      // DB per-element bbox — reliable for all mesh types
      try {
        const bboxRows = A.dbQuery(
          'SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?',
          [guid]
        );
        if (bboxRows.length && bboxRows[0][0] != null) {
          const dbC = A.ifc2three(bboxRows[0][0], bboxRows[0][1], bboxRows[0][2]);
          hlPos.set(dbC.x, dbC.y, dbC.z);
          hlSizeX = bboxRows[0][3] || 0.3;
          hlSizeY = bboxRows[0][5] || 0.3;
          hlSizeZ = bboxRows[0][4] || 0.3;
        } else {
          hlPos.copy(hit.point);
          hlSizeX = hlSizeY = hlSizeZ = 0.5;
        }
      } catch(e) {
        hlPos.copy(hit.point);
        hlSizeX = hlSizeY = hlSizeZ = 0.5;
      }
    } else {
      // Individual Mesh or InstancedMesh: geometry bbox is per-element — correct
      hit.object.geometry.computeBoundingBox();
      const bb = hit.object.geometry.boundingBox;
      bb.getCenter(_pickV2);
      bb.getSize(_pickV3);
      hlSizeX = _pickV3.x; hlSizeY = _pickV3.y; hlSizeZ = _pickV3.z;

      if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
        hit.object.getMatrixAt(hit.instanceId, _pickM4);
        hlPos.copy(_pickV2.applyMatrix4(_pickM4));
        _pickM4.decompose(_pickV2, _pickQ1, _pickV3);
        // hlQuat already === _pickQ1
      } else {
        hlPos.copy(hit.object.localToWorld(_pickV2));
        hlQuat.copy(hit.object.quaternion);
      }

      // §BBOX_DEBUG: compare geometry-derived vs DB position
      if (guid) {
        try {
          const dbRows = A.dbQuery(
            'SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [guid]
          );
          if (dbRows.length && dbRows[0][0] != null) {
            const dbC = A.ifc2three(dbRows[0][0], dbRows[0][1], dbRows[0][2]);
            console.log('§BBOX_DEBUG guid=' + guid.substring(0, 8) +
              ' hlPos=(' + hlPos.x.toFixed(2) + ',' + hlPos.y.toFixed(2) + ',' + hlPos.z.toFixed(2) + ')' +
              ' dbPos=(' + dbC.x.toFixed(2) + ',' + dbC.y.toFixed(2) + ',' + dbC.z.toFixed(2) + ')' +
              ' \u0394=(' + (hlPos.x - dbC.x).toFixed(3) + ',' + (hlPos.y - dbC.y).toFixed(3) + ',' + (hlPos.z - dbC.z).toFixed(3) + ')' +
              (hit.object.isInstancedMesh ? ' INSTANCED' : ' SINGLE'));
          }
        } catch (e) { /* debug only */ }
      }
    }

    // §S260e: EdgesGeometry + linewidth=1 (works on all WebGL2) + depthTest:false
    const hlGeo = new THREE.BoxGeometry(
      Math.max(hlSizeX, 0.01), Math.max(hlSizeY, 0.01), Math.max(hlSizeZ, 0.01));
    const hlEdges = new THREE.EdgesGeometry(hlGeo);
    hlGeo.dispose();
    const hlMesh = new THREE.LineSegments(hlEdges,
      A._bboxMaterial);
    hlMesh.renderOrder = 999;
    hlMesh.position.copy(hlPos);
    hlMesh.quaternion.copy(hlQuat);
    A.scene.add(hlMesh);
    // §S277d: Isolation pick — dim everything, picked element semi-transparent (see internals)
    _restoreIsolation(A);  // restore previous isolation first
    var _pickMat = hit.object.material;
    var _isolated = [];
    A.scene.traverse(function(obj) {
      if (!obj.isMesh && !obj.isInstancedMesh && !obj.isBatchedMesh) return;
      if (!obj.material || obj === A.ground) return;
      if (obj.material === _pickMat || obj === hit.object) return;  // skip picked element's material
      if (obj.material.userData._pickDimmed) return;  // already dimmed
      _isolated.push({ mat: obj.material, origOp: obj.material.opacity, origTr: obj.material.transparent });
      obj.material.transparent = true;
      obj.material.opacity = 0.15;
      obj.material.userData._pickDimmed = true;
      obj.material.needsUpdate = true;
    });
    A._pickIsolated = _isolated;
    // Picked element: semi-transparent to show internals + outline
    if (_pickMat && !_pickMat.userData._pickTarget) {
      _pickMat.userData._pickTarget = true;
      _pickMat.userData._pickOrigOp = _pickMat.opacity;
      _pickMat.userData._pickOrigTr = _pickMat.transparent;
      _pickMat.transparent = true;
      _pickMat.opacity = 0.7;  // slightly see-through — reveals internal structure
      _pickMat.needsUpdate = true;
    }
    if (A.setOutline && hit.object) A.setOutline([hit.object], 0xff8c00);
    hlMesh.visible = false;
    window._pickHighlight = hlMesh;
    if (A.markDirty) A.markDirty();
    console.log('§PICK_BBOX pos=' + hlPos.x.toFixed(1) + ',' + hlPos.y.toFixed(1) + ',' + hlPos.z.toFixed(1) +
      ' size=' + (hlSizeX||0).toFixed(2) + '×' + (hlSizeY||0).toFixed(2) + '×' + (hlSizeZ||0).toFixed(2) +
      ' guid=' + (guid || '?').substring(0, 12));

    try {
      // S239: parameterized query (was string interpolation — SQL injection risk)
      const rows = A.dbQuery(`
        SELECT m.ifc_class, m.element_name, m.guid, m.building, m.storey,
               m.discipline, m.material_rgba
        FROM elements_meta m WHERE m.guid = ?
      `, [guid]);
      if (!rows.length) {
        document.getElementById('info-panel').style.display = 'none';
        return;
      }
      const [cls, name, g, bld, storey, disc, mat] = rows[0];
      document.getElementById('info-class').textContent = cls || '—';
      document.getElementById('info-name').textContent = name || '—';
      document.getElementById('info-guid').textContent = g || '—';
      document.getElementById('info-building').textContent = bld || '—';
      document.getElementById('info-storey').textContent = storey || '—';
      document.getElementById('info-disc').textContent = disc || '—';
      document.getElementById('info-material').textContent = mat || '—';
      document.getElementById('info-panel').style.display = 'block';
      // Show Snag button during walk mode
      const snagRow = document.getElementById('snag-btn-row');
      if (snagRow) snagRow.style.display = A.walkModeActive ? 'block' : 'none';
      A.populateStoreys(bld);
      A.populateDiscs(bld);
      console.log(`§PICK ${cls} "${name}" ${disc} ${storey}`);
      if (window.KernelOps && A.db) KernelOps.commitOp(A.db, 'ELEMENT_PICK', {cls:cls,name:name,disc:disc,storey:storey}, [g]);
    } catch (err) {
      console.log(`§PICK_ERR ${err.message}`);
    }
  });

  // S275: Tap info panel → re-highlight the displayed element's bbox
  var infoPanel = document.getElementById('info-panel');
  if (infoPanel) {
    infoPanel.addEventListener('pointerup', function(e) {
      // Don't re-highlight if tapping the close button or snag button
      if (e.target.closest('#info-panel-close') || e.target.closest('#snag-btn-row')) return;
      var guid = document.getElementById('info-guid').textContent;
      if (!guid || guid === '—') return;
      // Clear previous highlight
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        window._pickHighlight.geometry.dispose();
        window._pickHighlight.material.dispose();
        window._pickHighlight = null;
      }
      // DB bbox highlight (same as picking)
      try {
        var bboxRows = A.dbQuery(
          'SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?', [guid]);
        if (bboxRows.length && bboxRows[0][0] != null) {
          var dbC = A.ifc2three(bboxRows[0][0], bboxRows[0][1], bboxRows[0][2]);
          var sx = bboxRows[0][3] || 0.3, sy = bboxRows[0][5] || 0.3, sz = bboxRows[0][4] || 0.3;
          var hlGeo = new THREE.BoxGeometry(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01));
          var hlEdges = new THREE.EdgesGeometry(hlGeo);
          hlGeo.dispose();
          var hlMesh = new THREE.LineSegments(hlEdges, A._bboxMaterial);
          hlMesh.renderOrder = 999;
          hlMesh.position.set(dbC.x, dbC.y, dbC.z);
          A.scene.add(hlMesh);
          window._pickHighlight = hlMesh;
          A._lastPickGuid = guid;
          if (A.markDirty) A.markDirty();
          console.log('§INFO_REHIGHLIGHT guid=' + guid.substring(0, 12));
        }
      } catch(e) { /* silent */ }
    });
  }

  // S275: Info panel close button — pointerup for mobile (onclick doesn't fire on touch)
  var infoClose = document.getElementById('info-panel-close');
  if (infoClose) {
    infoClose.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      document.getElementById('info-panel').style.display = 'none';
      // Clear highlight bbox on panel close
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        window._pickHighlight.geometry.dispose();
        window._pickHighlight.material.dispose();
        window._pickHighlight = null;
        if (A.markDirty) A.markDirty();
      }
    });
  }
}
