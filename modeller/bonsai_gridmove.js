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

    // §STRETCH-RIDE snapshot: pre-stretch AABBs of every authored mesh, the SAME shape modeller.html's own
    // _gateBoxes() builds for the conformity gate — SdgCascade.stretchRide needs the rider's + host's PRE-edit
    // boxes to derive the induced move (see sdg_cascade.js header). Read BEFORE this drag's commit so it's honest.
    _boxByFid() {
      const g = window.Bonsai.group && window.Bonsai.group(); const out = {}; if (!g) return out;
      g.children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null) {
        m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
        out[m.userData.featureId] = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; } });
      return out;
    },

    // Commit ONE signed GEOM_GRID_MOVE per drag-release; the worker folds the recompose deterministically.
    // Implementing RESUME_CASCADE_INTO_STRETCH.md §STRETCH-RIDE — Witness: W-STRETCH-RIDE.
    async commit(gridId, delta) {
      let commands = this.computeCommands(gridId, delta);
      let riders = [];
      // §STRETCH-RIDE: a hosted opening must NOT divorce or scale when its host wall is grid-stretched — the
      // engine classifies EVERY authored mesh independently (doors/windows included), so strip any rider's OWN
      // command and induce ONE rigid move instead, resolved ONLY over the REAL rel_fills_host edges through the
      // §ARC-1 bridge (non-invent — never a proximity heuristic). Absent the bridge (no fills data for this
      // resident, e.g. SampleCastle — see RESUME_CASCADE_INTO_STRETCH.md recon) stretchRide already no-ops
      // byte-identically, so this branch is a pure regression-safe extension, never a behavior change when unfed.
      if (window.SdgCascade && window.SdgCascade.stretchRide &&
          window.__arcGuidByFid && window.__arcFidByGuid && window.swXEdges && window.swXEdges.fills) {
        const boxByFid = this._boxByFid();
        const ride = window.SdgCascade.stretchRide(commands, window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, boxByFid);
        commands = ride.commands; riders = ride.riders;
        if (riders.length) console.log(TAG + ' §STRETCH-RIDE stripped=' + riders.length + ' rider cmd(s) → induced move instead: ' + riders.map(r => r.featureId).join(','));
      }
      // §P8 (RESUME_MODELLER_POLISH_BATCH.md — Witness: W-GESTURE-UNDO): with riders, the stretch + its
      // induced rider moves are ONE user gesture — commit them as ONE signed gesture group so a single
      // Ctrl+Z reverts the whole thing (before: GEOM_GRID_MOVE then N separate GEOM_MOVEs = N+1 undos, a
      // half-reverted stretch in between). Rider ops stay byte-identical GEOM_MOVE {parent,d*,induced} rows —
      // only the grouping changes. Zero riders ⇒ the existing single-op path below, untouched.
      if (riders.length && window.Bonsai.oplog.commitGesture) {
        const ops = [{ op_type: 'GEOM_GRID_MOVE', params: { gridId, delta, commands } }]
          .concat(riders.map(r => ({ op_type: 'GEOM_MOVE',
            params: { parent: r.featureId, dx: r.dx, dy: r.dy, dz: r.dz, induced: 'hosted-by' } })));
        const gres = await window.Bonsai.oplog.commitGesture(ops);
        console.log(TAG + ' commit grid=' + gridId + ' delta=' + delta + ' cmds=' + commands.length +
          ' §GESTURE gid=' + gres.gid + ' riders=' + riders.length + ' verify=' + gres.verify + ' tris=' + gres.triangleCount);
        riders.forEach(r => console.log(TAG + ' §STRETCH-RIDE hosted-by rider=' + r.featureId + ' induced dx=' + r.dx.toFixed(3) +
          ' dy=' + r.dy.toFixed(3) + ' dz=' + r.dz.toFixed(3) + ' (in gesture group)'));
        return { ...gres, commands, riders };
      }
      const res = await window.Bonsai.oplog.commit({ op_type: 'GEOM_GRID_MOVE',
        parameters: { gridId, delta, commands } }, {});
      // The authoring gridline advances via Grid.foldFromOplog — a FOLD of the op-log fired on this commit's
      // bonsai:oplog event — NOT mutated here, so undo/redo/scrub revert it deterministically (M1 fix).
      console.log(TAG + ' commit grid=' + gridId + ' delta=' + delta + ' cmds=' + commands.length +
        ' verify=' + res.verify + ' tris=' + res.triangleCount);
      return { ...res, commands, riders };
    }
  };
  window.Bonsai = window.Bonsai || {};
  window.Bonsai.gridmove = GM;
  console.log(TAG + ' module loaded');
})();
