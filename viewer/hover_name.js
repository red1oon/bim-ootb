/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// hover_name.js — §HOVER_NAME (prompts/Viewer/HOVER_NAME.md): a "hover name" checkbox in the
// Find panel + the `'` shortcut. With it on, hovering the model shows the friendly name (and
// containing room) of whatever is under the cursor — zero clicks. Click still SELECTS, untouched.
function setupHoverName(A) {
  var _on = false;
  var _raf = 0;
  var _mouseX = 0, _mouseY = 0, _haveMouse = false;
  var _lastGuid; // undefined = never resolved; null = last hover hit nothing
  var _label = null;
  var _rc = null;
  var _meshes = null, _meshT = 0;
  var _MESH_REFRESH_MS = 1000; // scene is mostly static between streams — same cache window as §SFX-RAYBLAST

  function _ensureLabel() {
    if (_label) return _label;
    _label = document.createElement('div');
    _label.id = 'hover-name-label';
    _label.style.cssText = 'position:fixed;z-index:9000;pointer-events:none;display:none;' +
      'background:rgba(20,20,24,0.88);color:#fff;padding:5px 10px;border-radius:6px;' +
      'font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:nowrap;';
    document.body.appendChild(_label);
    return _label;
  }

  function _hideLabel() {
    if (_label) _label.style.display = 'none';
    _lastGuid = undefined;
  }

  function _positionLabel() {
    if (!_label) return;
    _label.style.left = (_mouseX + 14) + 'px';
    _label.style.top = (_mouseY + 16) + 'px';
  }

  // Mirrors picking.js's guid-resolution chain (BatchedMesh → InstancedMesh → merged-mesh raycast
  // tag → guidMap/userData), read-only against the SAME shared indices picking.js populates.
  // Deliberately NOT a refactor of the click path — hover runs every frame while armed, so it
  // must never touch click-select state (A._lastPickGuid, A._pickIsolated, the info panel, …).
  function _guidForHit(hit) {
    var o = hit.object;
    if (o.isBatchedMesh && hit.batchId !== undefined && A._batchMeta && A._batchMeta[o.id]) {
      var bm = A._batchMeta[o.id];
      for (var i = 0; i < bm.length; i++) { if (bm[i].slotId === hit.batchId) return bm[i].guid; }
    }
    if (o.isInstancedMesh && hit.instanceId !== undefined && A._instanceMeta && A._instanceMeta[o.id]) {
      var im = A._instanceMeta[o.id][hit.instanceId];
      if (im) return im.guid;
    }
    if (o.userData && o.userData.isMerged && hit._mergedGuid) return hit._mergedGuid;
    if (A.guidMap && A.guidMap[o.id]) return A.guidMap[o.id];
    if (o.userData && o.userData.guid) return o.userData.guid;
    return null;
  }

  function _resolveMeshes() {
    var now = performance.now();
    if (_meshes && now - _meshT < _MESH_REFRESH_MS) return _meshes;
    _meshes = A.collectMeshes(function(o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible) return false;
      if (o.userData && (o.userData.isBboxPlaceholder || o.userData._isOutline)) return false;
      return true;
    });
    _meshT = now;
    return _meshes;
  }

  function _name(elementName, ifcClass) {
    // A.friendlyName is defined in the lazy Navigate bundle — same verb the Find panel and
    // navigate_engine.js use (HOVER_NAME.md: "use this verb, do not invent a second naming path").
    // Fall back to the raw fields only in the brief window before that bundle has loaded.
    if (typeof A.friendlyName === 'function') return A.friendlyName(elementName, ifcClass);
    return elementName || ifcClass || '?';
  }

  function _roomLabelFor(guid) {
    try {
      var rel = A.dbQuery('SELECT space_guid FROM rel_contained_in_space WHERE element_guid = ? LIMIT 1', [guid]);
      if (!rel.length || !rel[0][0]) return null;
      var rows = A.dbQuery('SELECT element_name, ifc_class FROM elements_meta WHERE guid = ?', [rel[0][0]]);
      if (!rows.length) return null;
      return _name(rows[0][0], rows[0][1]);
    } catch (e) { return null; }
  }

  // Event-driven, not a perpetual loop: a raycast only runs when the mouse actually moves, and at
  // most once per animation frame no matter how many pointermove events land in that frame
  // (HOVER_NAME.md's trap — "raycast per pointermove is not free at 63k elements"). A continuous
  // 60fps rAF loop that re-raycasts even while the mouse sits still would burn the same budget for
  // nothing — the earlier draft did exactly that.
  function _tick() {
    _raf = 0;
    if (!_on) return;
    if (!_haveMouse || !A.camera || typeof THREE === 'undefined') { _hideLabel(); return; }
    var t0 = performance.now();
    if (!_rc) _rc = new THREE.Raycaster();
    var nx = (_mouseX / window.innerWidth) * 2 - 1;
    var ny = -(_mouseY / window.innerHeight) * 2 + 1;
    _rc.setFromCamera({ x: nx, y: ny }, A.camera);
    var meshes = _resolveMeshes();
    var hits = meshes.length ? _rc.intersectObjects(meshes, false) : [];
    var guid = null;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].object.material && hits[i].object.material.opacity < 0.3) continue;
      guid = _guidForHit(hits[i]);
      if (guid) break;
    }
    _positionLabel();
    if (guid === _lastGuid) return; // same target as last frame — cursor-follow position already updated above
    _lastGuid = guid;
    if (!guid) { _hideLabel(); return; }
    var rows;
    try { rows = A.dbQuery('SELECT element_name, ifc_class FROM elements_meta WHERE guid = ?', [guid]); }
    catch (e) { rows = []; }
    if (!rows.length) { _hideLabel(); return; }
    var name = _name(rows[0][0], rows[0][1]);
    var room = _roomLabelFor(guid);
    var lbl = _ensureLabel();
    lbl.innerHTML = '<div>' + String(name).replace(/</g, '&lt;') + '</div>' +
      (room ? '<div style="opacity:0.65;font-size:10px;margin-top:2px">' + String(room).replace(/</g, '&lt;') + '</div>' : '');
    lbl.style.display = 'block';
    _positionLabel();
    // §IDLE_GATE parks the rAF chain when nothing moves — force one frame so the label isn't
    // stranded on a still scene (same trap §CPE_HOVER_SCRUB names for the Cinema hover).
    if (A.markDirty) A.markDirty();
    console.log('§HOVER_NAME guid=' + guid.substring(0, 12) + ' name="' + name + '" ifc=' +
      (rows[0][1] || '') + ' room="' + (room || '') + '" ms=' + (performance.now() - t0).toFixed(1));
  }

  function _onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return; // hover is a mouse concept — no touch
    _mouseX = e.clientX; _mouseY = e.clientY; _haveMouse = true;
    if (_on && !_raf) _raf = requestAnimationFrame(_tick);
  }
  function _onLeave() { _haveMouse = false; _hideLabel(); }

  function _syncCheckbox() {
    var cb = document.getElementById('find-hover-name-cb');
    if (cb) cb.checked = _on;
  }

  // src: 'key' | 'checkbox' | 'api'. force: explicit boolean, or omit to flip.
  A.toggleHoverName = function(src, force) {
    if (window._isMobile) return; // HOVER_NAME.md: no hover on touch — checkbox hidden there too
    var next = (force !== undefined) ? !!force : !_on;
    if (next === _on) { _syncCheckbox(); return; }
    _on = next;
    _syncCheckbox();
    console.log('§HOVER_NAME toggle=' + (_on ? 'on' : 'off') + ' src=' + (src || 'api'));
    if (_on) {
      if (typeof A.friendlyName !== 'function' && typeof A.loadNavigate === 'function') A.loadNavigate();
      if (!_raf) _raf = requestAnimationFrame(_tick);
    } else {
      _hideLabel();
      if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
    }
  };

  A.canvas.addEventListener('pointermove', _onMove);
  A.canvas.addEventListener('pointerleave', _onLeave);

  // Test-only accessor (same convention as sfx.js's window.__sfx) — witness_hover_name.js reads
  // the ACTUAL resolved guid rather than guessing one, since dense BIM scenes overlap in depth
  // (a wall in front of the MEP behind it) and a screen position's nearest hit is legitimately
  // not whichever element a witness expected to be there.
  A._hoverNameState = function() { return { on: _on, guid: _lastGuid || null }; };
}
