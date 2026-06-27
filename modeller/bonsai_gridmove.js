// bonsai_gridmove.js — Bonsai modeller adapter for the shipped Grid Kinematics engine (§S270).
// prompts/BONSAI_KERNEL_RESEARCH.md §NEXT depth-track leg 4. The viewer's GridKinematicEngine.dragGrid is a
// PURE fn (positions, delta) -> recompose commands [{guid, action:TRANSLATE|SCALE, axis, ...}]; grid_recompose
// is the VIEWER-coupled glue (mutates THREE instance matrices). The modeller is decoupled, so this adapter feeds
// the AUTHORED solids as the engine's elementData, runs the pure engine, and commits ONE signed GEOM_GRID_MOVE
// op carrying the engine's commands — the worker fold then translates/stretches the attached solids. Drag a
// gridline → attached walls RECOMPOSE, deterministic + scrub + tamper-evident like any feature in the op-log.
(function () {
  'use strict';
  const TAG = '§GRIDMOVE';
  const GM = {
    _map: {},

    // The engine's elementData = each authored solid's centre + bbox extents (the geometry it must recompose).
    elementData() {
      const g = window.Bonsai.group && window.Bonsai.group(); if (!g) return [];
      return g.children.filter(o => o.isMesh && o.userData.featureId != null).map(m => {
        m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox;
        return { guid: m.userData.featureId,
          x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2, z: (bb.min.z + bb.max.z) / 2,
          bboxX: bb.max.x - bb.min.x, bboxY: bb.max.y - bb.min.y, bboxZ: bb.max.z - bb.min.z,
          ifcClass: 'IfcWall' };
      });
    },

    // The engine's gridLines = the authoring grid's x + y lines, with a back-map gridId -> {axis, index}.
    gridLines() {
      const G = window.Bonsai.grid; const lines = []; this._map = {};
      G.xs.forEach((x, i) => { const id = 'gx' + i; lines.push({ id, axis: 'x', pos: x }); this._map[id] = { axis: 'x', index: i }; });
      G.ys.forEach((y, j) => { const id = 'gy' + j; lines.push({ id, axis: 'y', pos: y }); this._map[id] = { axis: 'y', index: j }; });
      return lines;
    },

    // PURE recompose: build the engine from the current state and ask it for the commands for this drag.
    computeCommands(gridId, delta) {
      const Eng = window.GridKinematics && window.GridKinematics.GridKinematicEngine;
      if (!Eng) throw new Error('GridKinematics engine not loaded');
      const eng = new Eng(this.elementData(), this.gridLines());
      eng.attachGridToElements();
      // engine guid === our featureId; carry it forward as featureId so the worker fold is unambiguous.
      return eng.dragGrid(gridId, delta).map(c => ({
        featureId: c.guid, action: c.action, axis: c.axis,
        delta: c.delta, newScale: c.newScale, translateDelta: c.translateDelta, edge: c.edge }));
    },

    // Commit ONE signed GEOM_GRID_MOVE per drag-release; the worker folds the recompose deterministically.
    async commit(gridId, delta) {
      const commands = this.computeCommands(gridId, delta);
      const res = await window.Bonsai.oplog.commit({ op_type: 'GEOM_GRID_MOVE',
        parameters: { gridId, delta, commands } }, {});
      // The authoring gridline advances via Grid.foldFromOplog — a FOLD of the op-log fired on this commit's
      // bonsai:oplog event — NOT mutated here, so undo/redo/scrub revert it deterministically (M1 fix).
      console.log(TAG + ' commit grid=' + gridId + ' delta=' + delta + ' cmds=' + commands.length +
        ' verify=' + res.verify + ' tris=' + res.triangleCount);
      return { ...res, commands };
    }
  };
  window.Bonsai = window.Bonsai || {};
  window.Bonsai.gridmove = GM;
  console.log(TAG + ' module loaded');
})();
