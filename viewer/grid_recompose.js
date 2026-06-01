// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * grid_recompose.js — §S270 Grid Recompose Module
 * Implementing REFACTOR_DOC_CANVAS.md §3.2
 *
 * Bridge between GridState and GridKinematicEngine. Owns element data
 * collection, engine lifecycle, command dispatch, and delta accumulation.
 *
 * Invariants:
 *   1. Bbox swizzle (IFC Z-up → Three.js Y-up) happens in rebuild(), nowhere else.
 *   2. applyDrag() receives incremental delta (already computed by caller).
 *   3. _lastAppliedDeltas lives here, not in GridState.
 *   4. Never touches pointer events, selection, or status bar.
 */
(function(exports) {
  'use strict';

  // ── Context — set by orchestrator via init() ─────────────────────────────
  var _ctx = null;  // { guidToSlot, guidToInstance, appRef, getShownGuids, db }

  // ── Engine state ─────────────────────────────────────────────────────────
  var _kinEngine = null;
  var _kinEngineDirty = true;
  var _lastAppliedDeltas = {};

  // ── BOM recompose state ──────────────────────────────────────────────────
  var _bomNodes = [];
  var _bomGridMgr = null;
  var _bomLevel = 0;
  var _bomRootId = null;
  var _bomDebounceTimer = null;
  var _bomDiscRules = null;

  // ── Zero matrix (lazy-init) ──────────────────────────────────────────────
  var _zeroMatrix = null;
  function _getZeroMatrix() {
    if (!_zeroMatrix && typeof THREE !== 'undefined') {
      _zeroMatrix = new THREE.Matrix4();
      _zeroMatrix.set(0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0);
    }
    return _zeroMatrix;
  }

  // ── Init / Reset ─────────────────────────────────────────────────────────

  /**
   * init(ctx) — set context references from orchestrator.
   * @param {Object} ctx — { guidToSlot, guidToInstance, appRef, getShownGuids, db }
   */
  function init(ctx) {
    _ctx = ctx;
    _kinEngineDirty = true;
  }

  function resetDeltas() {
    _lastAppliedDeltas = {};
  }

  function resetAll() {
    _kinEngine = null;
    _kinEngineDirty = true;
    _lastAppliedDeltas = {};
    _bomNodes = [];
    _bomGridMgr = null;
    _bomLevel = 0;
    _bomRootId = null;
    _bomDebounceTimer = null;
    _ctx = null;
  }

  function markDirty() { _kinEngineDirty = true; }
  function isDirty() { return _kinEngineDirty; }
  function getEngine() { return _kinEngine; }
  function getLastAppliedDelta(label) { return _lastAppliedDeltas[label] || 0; }
  function getLastAppliedDeltas() { return Object.assign({}, _lastAppliedDeltas); }

  // ── Mesh position reading ────────────────────────────────────────────────

  function _getMeshPosition(guid) {
    if (!_ctx) return null;
    var slot = _ctx.guidToSlot[guid];
    if (slot) {
      var mat = new THREE.Matrix4();
      slot.mesh.getMatrixAt(slot.slotId, mat);
      var pos = new THREE.Vector3();
      var scale = new THREE.Vector3();
      pos.setFromMatrixPosition(mat);
      scale.setFromMatrixScale(mat);
      return { x: pos.x, y: pos.y, z: pos.z, scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z };
    }
    var inst = _ctx.guidToInstance[guid];
    if (inst) {
      var imat = new THREE.Matrix4();
      inst.mesh.getMatrixAt(inst.index, imat);
      var ipos = new THREE.Vector3();
      var iscale = new THREE.Vector3();
      ipos.setFromMatrixPosition(imat);
      iscale.setFromMatrixScale(imat);
      return { x: ipos.x, y: ipos.y, z: ipos.z, scaleX: iscale.x, scaleY: iscale.y, scaleZ: iscale.z };
    }
    return null;
  }

  // ── Element data collection ──────────────────────────────────────────────

  function _collectElementData() {
    if (!_ctx) return [];
    var shownGuids = _ctx.getShownGuids();
    if (!shownGuids.length) return [];

    var bboxLookup = {};
    var classLookup = {};
    var db = _ctx.db;
    if (db) {
      try {
        var rows = db.exec("SELECT guid, bbox_x, bbox_y, bbox_z FROM element_transforms");
        if (rows.length && rows[0].values) {
          for (var ri = 0; ri < rows[0].values.length; ri++) {
            var r = rows[0].values[ri];
            bboxLookup[r[0]] = { bboxX: r[1] || 0, bboxY: r[2] || 0, bboxZ: r[3] || 0 };
          }
        }
      } catch(e) { /* bbox optional */ }
      try {
        var crows = db.exec("SELECT guid, ifc_class FROM elements_meta");
        if (crows.length && crows[0].values) {
          for (var ci = 0; ci < crows[0].values.length; ci++) {
            classLookup[crows[0].values[ci][0]] = crows[0].values[ci][1] || '';
          }
        }
      } catch(e2) { /* class optional */ }
    }

    var bboxMatchCount = 0, bboxTotal = Object.keys(bboxLookup).length;
    var elements = [];
    for (var gi = 0; gi < shownGuids.length; gi++) {
      var guid = shownGuids[gi];
      var mpos = _getMeshPosition(guid);
      if (!mpos) continue;

      var bbox = bboxLookup[guid] || { bboxX: 0, bboxY: 0, bboxZ: 0 };
      // §S270 BUG-4 fix: swizzle IFC bbox (Z-up) → Three.js bbox (Y-up)
      elements.push({
        guid: guid,
        x: mpos.x, y: mpos.y, z: mpos.z,
        bboxX: bbox.bboxX,
        bboxY: bbox.bboxZ,  // IFC Z (height) → Three Y (up)
        bboxZ: bbox.bboxY,  // IFC Y (depth) → Three Z
        ifcClass: classLookup[guid] || '',
        scaleX: mpos.scaleX, scaleY: mpos.scaleY, scaleZ: mpos.scaleZ
      });
      if (bboxLookup[guid]) bboxMatchCount++;
    }

    if (elements.length) {
      var sample = elements[0];
      console.log('§COLLECT_ELEMENTS guids=' + shownGuids.length +
        ' withMesh=' + elements.length +
        ' bboxMatches=' + bboxMatchCount + '/' + bboxTotal +
        ' sample: guid=' + sample.guid +
        ' pos=(' + sample.x.toFixed(2) + ',' + sample.y.toFixed(2) + ',' + sample.z.toFixed(2) + ')' +
        ' bbox=(' + sample.bboxX.toFixed(2) + ',' + sample.bboxY.toFixed(2) + ',' + sample.bboxZ.toFixed(2) + ')' +
        ' class=' + sample.ifcClass);
    }
    return elements;
  }

  // ── Engine lifecycle ─────────────────────────────────────────────────────

  function rebuild() {
    if (typeof GridKinematics === 'undefined' || !GridKinematics.GridKinematicEngine) {
      console.warn('§RECOMPOSE grid_kinematics.js not loaded — falling back');
      _kinEngine = null;
      return;
    }
    var GS = typeof GridState !== 'undefined' ? GridState : null;
    if (!GS) { _kinEngine = null; return; }

    var elementData = _collectElementData();
    var gridLines = GS.getLines();
    _kinEngine = new GridKinematics.GridKinematicEngine(elementData, gridLines);
    _kinEngine.attachGridToElements();
    _kinEngineDirty = false;
    _lastAppliedDeltas = {};

    var map = _kinEngine.getAttachMap();
    var totalAttached = 0;
    var relCounts = { ATTACH: 0, SPAN: 0, EDGE_RIGHT: 0, EDGE_LEFT: 0, ROOF_EAVE: 0, ROOF_FLAT: 0, ROOF_LIFT: 0 };
    for (var k in map) {
      var items = map[k];
      totalAttached += items.length;
      for (var mi = 0; mi < items.length; mi++) {
        var rel = items[mi].relation;
        if (relCounts[rel] !== undefined) relCounts[rel]++;
        else relCounts[rel] = 1;
      }
    }
    console.log('§RECOMPOSE_ENGINE built elements=' + elementData.length +
      ' grids=' + gridLines.length + ' attached=' + totalAttached +
      ' interior=' + _kinEngine.getInteriorElements().length +
      ' relations: ATTACH=' + relCounts.ATTACH +
      ' SPAN=' + relCounts.SPAN +
      ' EDGE_R=' + relCounts.EDGE_RIGHT +
      ' EDGE_L=' + relCounts.EDGE_LEFT +
      ' ROOF=' + (relCounts.ROOF_EAVE + relCounts.ROOF_FLAT + relCounts.ROOF_LIFT));
  }

  // ── Command dispatch ─────────────────────────────────────────────────────

  function _applyCommand(cmd) {
    switch (cmd.action) {
      case 'TRANSLATE': _translateMesh(cmd.guid, cmd.axis, cmd.delta); break;
      case 'SCALE': _scaleMeshFromCommand(cmd); break;
      case 'ROOF_VERTICES': _applyRoofVertices(cmd); break;
      case 'ROOF_LIFT': _applyRoofLift(cmd); break;
    }
  }

  function _translateMesh(guid, axis, delta) {
    if (!_ctx) return;
    var matIdx = axis === 'x' ? 12 : (axis === 'z' ? 14 : 13);

    var slot = _ctx.guidToSlot[guid];
    if (slot) {
      var mat = new THREE.Matrix4();
      slot.mesh.getMatrixAt(slot.slotId, mat);
      mat.elements[matIdx] += delta;
      slot.mesh.setMatrixAt(slot.slotId, mat);
      if (slot.mesh.instanceMatrix) slot.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    var inst = _ctx.guidToInstance[guid];
    if (inst) {
      var imat = new THREE.Matrix4();
      inst.mesh.getMatrixAt(inst.index, imat);
      imat.elements[matIdx] += delta;
      inst.mesh.setMatrixAt(inst.index, imat);
      if (inst.mesh.instanceMatrix) inst.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    // Single-mesh path
    if (_ctx.appRef && _ctx.appRef.scene) {
      _ctx.appRef.scene.traverse(function(obj) {
        if (obj.userData && obj.userData.guid === guid && obj.isMesh) {
          if (axis === 'x') obj.position.x += delta;
          else if (axis === 'y') obj.position.y += delta;
          else obj.position.z += delta;
        }
      });
    }
  }

  function _scaleMeshFromCommand(cmd) {
    if (!_ctx) return;
    var matIdx = cmd.axis === 'x' ? 12 : (cmd.axis === 'z' ? 14 : 13);
    var scaleIdx = cmd.axis === 'x' ? 0 : (cmd.axis === 'z' ? 10 : 5);

    var slot = _ctx.guidToSlot[cmd.guid];
    if (slot) {
      var mat = new THREE.Matrix4();
      slot.mesh.getMatrixAt(slot.slotId, mat);
      mat.elements[scaleIdx] = cmd.newScale;
      if (cmd.translateDelta) mat.elements[matIdx] += cmd.translateDelta;
      slot.mesh.setMatrixAt(slot.slotId, mat);
      if (slot.mesh.instanceMatrix) slot.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    var inst = _ctx.guidToInstance[cmd.guid];
    if (inst) {
      var imat = new THREE.Matrix4();
      inst.mesh.getMatrixAt(inst.index, imat);
      imat.elements[scaleIdx] = cmd.newScale;
      if (cmd.translateDelta) imat.elements[matIdx] += cmd.translateDelta;
      inst.mesh.setMatrixAt(inst.index, imat);
      if (inst.mesh.instanceMatrix) inst.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
  }

  function _applyRoofVertices(cmd) {
    if (!cmd.vertexDeltas) return;
    var mesh = _findMeshByGuid(cmd.guid);
    if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) return;
    var positions = mesh.geometry.attributes.position.array;
    var vd = cmd.vertexDeltas;
    for (var i = 0; i < vd.length && i < positions.length; i++) {
      positions[i] += vd[i];
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }

  function _applyRoofLift(cmd) {
    var mesh = _findMeshByGuid(cmd.guid);
    if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) return;
    var positions = mesh.geometry.attributes.position.array;
    var nVerts = positions.length / 3;
    for (var i = 0; i < nVerts; i++) {
      positions[i * 3 + 1] += cmd.deltaY;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }

  function _findMeshByGuid(guid) {
    if (_ctx && _ctx.appRef && _ctx.appRef.scene) {
      var found = null;
      _ctx.appRef.scene.traverse(function(obj) {
        if (!found && obj.userData && obj.userData.guid === guid && obj.isMesh) {
          found = obj;
        }
      });
      return found;
    }
    return null;
  }

  // ── Main recompose entry point ───────────────────────────────────────────

  function applyDrag(A) {
    var GS = typeof GridState !== 'undefined' ? GridState : null;
    if (!GS) return;

    var raw = GS.getDeltas(0.01);
    if (!raw.length) return;

    if (_kinEngineDirty || !_kinEngine) rebuild();
    if (!_kinEngine) return;

    var translated = 0, scaled = 0, roofOps = 0;

    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      if (Math.abs(d.absDelta) < 0.01) continue;
      var gridId = d.label;
      var lastDelta = _lastAppliedDeltas[gridId] || 0;
      var incrementalDelta = d.absDelta - lastDelta;
      if (Math.abs(incrementalDelta) < 0.001) continue;
      var cmds = _kinEngine.dragGrid(gridId, incrementalDelta);
      for (var ci = 0; ci < cmds.length; ci++) {
        _applyCommand(cmds[ci]);
        if (cmds[ci].action === 'TRANSLATE') translated++;
        else if (cmds[ci].action === 'SCALE') scaled++;
        else if (cmds[ci].action === 'ROOF_VERTICES' || cmds[ci].action === 'ROOF_LIFT') roofOps++;
      }
      _lastAppliedDeltas[gridId] = d.absDelta;
      console.log('§RECOMPOSE_GRID id=' + gridId +
        ' absDelta=' + (d.absDelta > 0 ? '+' : '') + d.absDelta.toFixed(3) +
        ' workedDelta=' + (incrementalDelta > 0 ? '+' : '') + incrementalDelta.toFixed(3) +
        ' commands=' + cmds.length);
    }

    console.log('§RECOMPOSE_DONE translated=' + translated + ' scaled=' + scaled +
      ' roofOps=' + roofOps);

    // §S272 Phase 3a: After L0 kinematics, fire L1 BOM recompose (debounced 16ms)
    if (_bomNodes.length && _kinEngine && typeof BomTree !== 'undefined' && typeof BomDiff !== 'undefined') {
      clearTimeout(_bomDebounceTimer);
      _bomDebounceTimer = setTimeout(function() { _fireBomRecompose(A); }, 16);
    }
  }

  // ── Attach info ──────────────────────────────────────────────────────────

  function getAttachInfo(gridLabel) {
    if (!_kinEngine) return '';
    var map = _kinEngine.getAttachMap();
    var items = map[gridLabel];
    if (!items || !items.length) return ' (no attached elements)';
    var counts = {};
    for (var i = 0; i < items.length; i++) {
      var rel = items[i].relation;
      counts[rel] = (counts[rel] || 0) + 1;
    }
    var parts = [];
    for (var k in counts) parts.push(counts[k] + ' ' + k);
    return ' (' + parts.join(', ') + ')';
  }

  function getAttachMap() {
    if (!_kinEngine) return {};
    return _kinEngine.getAttachMap();
  }

  // ── BOM recompose ────────────────────────────────────────────────────────

  function _fireBomRecompose(A) {
    if (!_kinEngine || !_bomNodes.length) return;
    if (typeof BomTree === 'undefined' || typeof BomDiff === 'undefined') return;

    var attachMap = _kinEngine.getAttachMap();
    var totalMoves = 0, totalAdds = 0, totalRemoves = 0, totalScales = 0;
    var allCommands = [];

    for (var gridId in attachMap) {
      var affectedParents = BomTree.getAffectedBranch(_bomNodes, attachMap, gridId);
      if (!affectedParents.length) continue;

      for (var pi = 0; pi < affectedParents.length; pi++) {
        var parent = affectedParents[pi];
        if (!parent.hostAABB) continue;

        var currentState = [];
        var children = parent.getChildren();
        for (var ci = 0; ci < children.length; ci++) {
          var ch = children[ci];
          if (ch.currentAABB) {
            currentState.push({
              id: ch._elementRef || ch.id,
              x: ch.currentAABB.x, y: ch.currentAABB.y, z: ch.currentAABB.z,
              w: ch.currentAABB.w, d: ch.currentAABB.d, h: ch.currentAABB.h,
              productId: ch.productId
            });
          }
        }

        var result = parent.recompose(parent.hostAABB);

        var targetState = [];
        var rechildren = parent.getChildren();
        for (var ti = 0; ti < rechildren.length; ti++) {
          var rch = rechildren[ti];
          if (rch.currentAABB) {
            targetState.push({
              id: rch._elementRef || rch.id,
              x: rch.currentAABB.x, y: rch.currentAABB.y, z: rch.currentAABB.z,
              w: rch.currentAABB.w, d: rch.currentAABB.d, h: rch.currentAABB.h,
              productId: rch.productId
            });
          }
        }

        var cmds = BomDiff.diff(currentState, targetState);
        for (var di = 0; di < cmds.length; di++) {
          _applyBomDiffCommand(cmds[di]);
          if (cmds[di].type === 'MOVE') totalMoves++;
          else if (cmds[di].type === 'ADD') totalAdds++;
          else if (cmds[di].type === 'REMOVE') totalRemoves++;
          else if (cmds[di].type === 'SCALE') totalScales++;
          allCommands.push(cmds[di]);
        }

        if (result.conflicts && result.conflicts.length) {
          console.log('§BOM_L3_CONFLICTS parent=' + parent.id +
            ' count=' + result.conflicts.length +
            ' first=' + result.conflicts[0]);
        }

        if (typeof BomRules !== 'undefined' && _bomDiscRules) {
          var ruleResult = BomRules.checkPlacement(parent, parent.hostAABB, targetState, _bomDiscRules);
          if (!ruleResult.ok) {
            for (var vi = 0; vi < ruleResult.violations.length; vi++) {
              var v = ruleResult.violations[vi];
              console.log('§BOM_RULE_VIOLATION parent=' + parent.id +
                ' rule=' + v.rule + ' severity=' + v.severity +
                ' ref=' + v.ref + ' ' + v.message);
            }
          }
        }

        console.log('§BOM_RECOMPOSE parent=' + parent.id +
          ' reserved=' + (result.commands ? result.commands.length : 0) +
          ' filled=' + targetState.length +
          ' phantom.w=' + (result.phantom ? result.phantom.w : 0));
      }
    }

    if (allCommands.length) {
      console.log('§BOM_L1_DONE moves=' + totalMoves + ' adds=' + totalAdds +
        ' removes=' + totalRemoves + ' scales=' + totalScales);
      _logBomRecomposeOp(A, allCommands);
    }
  }

  function _logBomRecomposeOp(A, commands) {
    if (typeof KernelOps === 'undefined' || !A || !A.db) return;
    if (!commands || !commands.length) return;

    var payload = [];
    var inputGuids = [];
    for (var i = 0; i < commands.length; i++) {
      var c = commands[i];
      if (c.type === 'KEEP') continue;
      payload.push({ type: c.type, id: c.id, from: c.from || null, to: c.to || null });
      inputGuids.push(c.id);
    }
    if (!payload.length) return;

    try {
      KernelOps.commitOp(A.db, 'BOM_RECOMPOSE', {
        bomLevel: _bomLevel,
        commandCount: payload.length,
        commands: payload
      }, inputGuids, null);
    } catch(e) {
      console.log('§BOM_RECOMPOSE_LOG_ERR ' + e.message);
    }
  }

  function _applyBomDiffCommand(cmd) {
    if (!_ctx || cmd.type === 'KEEP') return;
    var guid = cmd.id;

    if (cmd.type === 'MOVE' || cmd.type === 'SCALE') {
      var to = cmd.to;
      var mat = new THREE.Matrix4();
      var sx = (to.w || 1) / 1000;
      var sy = (to.h || 1) / 1000;
      var sz = (to.d || 1) / 1000;
      mat.makeScale(sx, sy, sz);
      mat.setPosition(to.x / 1000, to.z / 1000, -(to.y / 1000));

      var slot = _ctx.guidToSlot[guid];
      if (slot) {
        slot.mesh.setMatrixAt(slot.slotId, mat);
        if (slot.mesh.instanceMatrix) slot.mesh.instanceMatrix.needsUpdate = true;
        return;
      }
      var inst = _ctx.guidToInstance[guid];
      if (inst) {
        inst.mesh.setMatrixAt(inst.index, mat);
        inst.mesh.instanceMatrix.needsUpdate = true;
        return;
      }
      return;
    }

    if (cmd.type === 'ADD') {
      var template = null;
      for (var g in _ctx.guidToInstance) {
        template = _ctx.guidToInstance[g];
        break;
      }
      if (!template) return;
      var mesh = template.mesh;
      if (mesh.count < mesh.instanceMatrix.count) {
        var newIdx = mesh.count;
        mesh.count++;
        var addMat = new THREE.Matrix4();
        var t = cmd.to;
        addMat.makeScale((t.w || 1) / 1000, (t.h || 1) / 1000, (t.d || 1) / 1000);
        addMat.setPosition(t.x / 1000, t.z / 1000, -(t.y / 1000));
        mesh.setMatrixAt(newIdx, addMat);
        mesh.instanceMatrix.needsUpdate = true;
        _ctx.guidToInstance[guid] = { mesh: mesh, index: newIdx, origMatrix: addMat.clone() };
      }
      return;
    }

    if (cmd.type === 'REMOVE') {
      var zMat = new THREE.Matrix4();
      zMat.set(0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0);
      var rSlot = _ctx.guidToSlot[guid];
      if (rSlot) {
        rSlot.mesh.setMatrixAt(rSlot.slotId, zMat);
        if (rSlot.mesh.instanceMatrix) rSlot.mesh.instanceMatrix.needsUpdate = true;
        return;
      }
      var rInst = _ctx.guidToInstance[guid];
      if (rInst) {
        rInst.mesh.setMatrixAt(rInst.index, zMat);
        rInst.mesh.instanceMatrix.needsUpdate = true;
        return;
      }
      return;
    }
  }

  function _findRootBom(bomDb) {
    if (!bomDb) return null;
    try {
      var boms = BOMWalker.listBoms(bomDb);
    } catch(e) { return null; }
    for (var i = 0; i < boms.length; i++) {
      if (boms[i].bomType === 'BUILDING') return boms[i].bomId;
    }
    return boms.length ? boms[0].bomId : null;
  }

  // ── BOM level stepper ────────────────────────────────────────────────────

  function materializeBomLevel(A) {
    if (!A || !A.db) return;
    if (typeof BomTree === 'undefined') return;

    var bomDb = A.db;
    if (!_bomRootId) {
      _bomRootId = _findRootBom(bomDb);
      if (!_bomRootId) return;
    }

    if (!_bomGridMgr && typeof BomGrid !== 'undefined') {
      _bomGridMgr = new BomGrid.GridLineManager();
    }

    var parentBomId = _bomRootId;
    if (_bomNodes.length && _bomLevel > 0) {
      for (var ni = 0; ni < _bomNodes.length; ni++) {
        if (_bomNodes[ni].id) { parentBomId = _bomNodes[ni].id; break; }
      }
    }

    try {
      var result = BomTree.materializeLevel(bomDb, parentBomId, null);
      if (!result.parentNode || !result.children.length) {
        console.log('§BOM_NEXT no children for bomId=' + parentBomId);
        return;
      }
      _bomNodes = _bomNodes.concat(result.children);
      if (_bomNodes.indexOf(result.parentNode) === -1) {
        _bomNodes.push(result.parentNode);
      }
      if (_bomGridMgr) {
        var grids = _bomGridMgr.addGridsForLevel(result.children, _bomLevel);
      }
      _bomLevel++;
      console.log('§BOM_NEXT level=' + _bomLevel +
        ' children=' + result.children.length +
        ' grids=' + (grids ? grids.length : 0));
    } catch(e) {
      console.log('§BOM_NEXT_ERR ' + e.message);
    }
  }

  function dematerializeBomLevel() {
    if (_bomLevel <= 0) return;
    _bomLevel--;
    if (_bomGridMgr) {
      _bomGridMgr.removeGridsForLevel(_bomLevel);
    }
    var kept = [];
    for (var i = 0; i < _bomNodes.length; i++) {
      var node = _bomNodes[i];
      if (node._bomLevelTag === undefined || node._bomLevelTag < _bomLevel) {
        kept.push(node);
      }
    }
    _bomNodes = kept;
    console.log('§BOM_PREV level=' + _bomLevel + ' remainingNodes=' + _bomNodes.length);
  }

  function resetBomDepth() {
    if (_bomLevel <= 0 && !_bomNodes.length) return;
    if (_bomGridMgr) {
      for (var lv = _bomLevel - 1; lv >= 0; lv--) {
        _bomGridMgr.removeGridsForLevel(lv);
      }
    }
    _bomNodes = [];
    _bomLevel = 0;
    _bomRootId = null;
    _bomGridMgr = null;
    console.log('§BOM_DISC_RESET depth=0');
  }

  function setDiscRules(rules) { _bomDiscRules = rules; }

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.init = init;
  exports.resetDeltas = resetDeltas;
  exports.resetAll = resetAll;
  exports.markDirty = markDirty;
  exports.isDirty = isDirty;
  exports.getEngine = getEngine;
  exports.getLastAppliedDelta = getLastAppliedDelta;
  exports.getLastAppliedDeltas = getLastAppliedDeltas;
  exports.rebuild = rebuild;
  exports.applyDrag = applyDrag;
  exports.getAttachInfo = getAttachInfo;
  exports.getAttachMap = getAttachMap;
  exports.getZeroMatrix = _getZeroMatrix;
  exports.getMeshPosition = _getMeshPosition;
  exports.getShownGuids = function() { return _ctx ? _ctx.getShownGuids() : []; };
  exports.collectElementData = _collectElementData;
  exports.materializeBomLevel = materializeBomLevel;
  exports.dematerializeBomLevel = dematerializeBomLevel;
  exports.resetBomDepth = resetBomDepth;
  exports.setDiscRules = setDiscRules;

})(typeof module !== 'undefined' ? module.exports : (window.GridRecompose = {}));
