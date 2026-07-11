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
    // §SCALE_CHECK_FIX (SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 1): previewCommands() used to build
    // a BRAND-NEW GridKinematicEngine from elementData() (every authored mesh) + call attachGridToElements()
    // (an O(n) reclassification of ALL scene elements against ALL grid lines) on EVERY pointermove frame of a
    // drag — measured ~1.2-1.5s/frame at Terminal scale (35,818 elements), sustained across all 15 sampled
    // frames. attachGridToElements()'s result does NOT change during a single drag (only dragGrid(gridId,delta)'s
    // computation does — the classification is a function of element positions + grid lines, neither of which
    // move mid-drag; the dragged gridline's on-canvas preview line is cosmetic only, the real grid.xs/ys array
    // does not update until commit/fold). So: cache the built+attached engine (and the two other per-frame O(n)
    // scans previewCommands() feeds — the mesh-by-featureId map gmTint() needs, and the pre-stretch box-by-fid
    // map §STRETCH-RIDE needs) ONCE per drag SESSION (beginDragSession(), called on gridline-grab) and reuse
    // across every subsequent pointermove frame of the SAME drag; endDragSession() (called on commit/cancel)
    // drops the cache so the NEXT drag rebuilds fresh off the post-commit scene. Every caller that does NOT run
    // inside a session (a direct computeCommands()/meshByFid()/_boxByFid() call, e.g. from a test) still
    // build-and-discards exactly as before — byte-identical behavior, just not recomputed 15x per drag.
    _engine: null, _meshCache: null, _boxCache: null,
    // §GREEN-EXCLUDE (GRID_PREDRAG_GREENORANGE_PREVIEW.md): per-drag-session opt-out set. Orange (proportional
    // follow) is the DEFAULT for every governed element — this set holds the featureIds the user ctrl-clicked
    // OUT of the current drag (green). Seeded empty every session (modeller.html enterGridMove/exitGridMove
    // call resetOverrides()) — NOT persisted, NOT a per-user config (that's explicitly deferred).
    _overrides: new Set(),
    resetOverrides() { this._overrides = new Set(); console.log(TAG + ' §GREEN-EXCLUDE reset (new drag session, all orange)'); },
    // toggleOverride(fid) → true if now EXCLUDED (green), false if now back to included (orange). Bidirectional.
    toggleOverride(fid) {
      const wasExcluded = this._overrides.has(fid);
      if (wasExcluded) this._overrides.delete(fid); else this._overrides.add(fid);
      console.log(TAG + ' §GREEN-EXCLUDE toggle fid=' + fid + ' -> ' + (wasExcluded ? 'orange(included)' : 'green(excluded)'));
      return !wasExcluded;
    },
    isExcluded(fid) { return this._overrides.has(fid); },
    excludedList() { return Array.from(this._overrides); },
    // Pure filter — strips any excluded (green) featureId's command/rider. Shared by previewCommands() (live
    // gmTint) AND commit() below so the live preview and the actual commit can NEVER disagree (item 4).
    applyOverrides(commands, riders) {
      riders = riders || [];
      const ov = this._overrides;
      if (!ov.size) return { commands, riders, excluded: [] };
      const excluded = [];
      const commands2 = commands.filter(c => { const hit = c && c.featureId != null && ov.has(c.featureId); if (hit) excluded.push(c.featureId); return !hit; });
      const riders2 = riders.filter(r => { const hit = r && r.featureId != null && ov.has(r.featureId); if (hit) excluded.push(r.featureId); return !hit; });
      return { commands: commands2, riders: riders2, excluded };
    },

    // §GRIDSCOPE (prompts/GRID_SMART_ELEMENT_SCOPE.md, 2026-07-09 — decided direction, built here):
    // TWO independent narrowings of grid governance, both applied here, neither touching the shared
    // (Viewer-used) grid_kinematics.js engine itself:
    //
    // 1. CLASS ALLOWLIST — furniture/coverings/openings never participate in DIRECT grid attachment (a
    //    couch sitting in a room doesn't drag when the room's wall stretches). Doors/windows are excluded
    //    here too -- they ride via §STRETCH-RIDE (resolved off REAL rel_fills_host edges, sdg_cascade.js),
    //    NOT by being independently classified against the grid -- excluding them from elementData() does
    //    not affect their movement, only removes a redundant (and sometimes WRONG-tint) direct classification.
    _STRUCTURAL_CLASSES: ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcFooting', 'IfcColumn', 'IfcBeam',
      'IfcRailing', 'IfcStairFlight', 'IfcRoof'],
    // fid -> ifc_class, read from the REAL committed GEOM_INSERT op parameters (arc_editable.js's
    // buildSeedOps already writes params.ifc_class per seed op -- extracted, not invented). A synthetic/
    // hand-authored wall (GEOM_EXTRUDE_POLY etc.) has no ifc_class recorded at all -- treated as UNKNOWN,
    // kept eligible (unchanged behavior for the tool's actual primary use case: freshly-sketched content).
    // §ROTATION-GUARD (prompts/GRID_ROTATION_GUARD.md §1 step 3): the SAME pass over the SAME parsed JSON
    // also yields fid -> yawRad from params.placement.rot — which is DEGREES at this boundary (buildSeedOps
    // commits `rot: rz * 180 / Math.PI`); convert to RADIANS here, the engine speaks radians only. Absent
    // (synthetic content, or the §ARC-3AXIS tilted shape that carries rotZRad instead) → undefined →
    // unguarded/eligible, symmetric with the class-UNKNOWN rule above.
    // §ROTATION-GUARD-3AXIS (GRID_ROTATION_GUARD.md §5): the §ARC-3AXIS placement shape ({rotX,rotY,rotZRad},
    // arc_editable.js buildSeedOps ~line 218) carries genuine roll/pitch tilt the yaw-only read above never
    // sees (no `.rot` field on that shape) — read rotX/rotY here too. Already RADIANS at this boundary (no
    // degrees step, unlike `.rot`). Found live-reachable: SampleCastle_ARC.db fids 933/1291/2514/3055 all
    // have yawRadByFid undefined (§ARC-3AXIS rows) yet ATTACH/EDGE-classified today with zero guard.
    _buildInsertMaps() {
      const O = window.Bonsai.oplog;
      const maps = { classByFid: {}, yawRadByFid: {}, tiltXRadByFid: {}, tiltYRadByFid: {} };
      if (!O || !O.db) return maps;
      try {
        const r = O.db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'");
        if (r.length) r[0].values.forEach(v => { try {
          const p = JSON.parse(v[1]);
          if (p && p.ifc_class) maps.classByFid[v[0]] = p.ifc_class;
          if (p && p.placement && typeof p.placement.rot === 'number') maps.yawRadByFid[v[0]] = p.placement.rot * Math.PI / 180;
          if (p && p.placement && typeof p.placement.rotX === 'number') maps.tiltXRadByFid[v[0]] = p.placement.rotX;
          if (p && p.placement && typeof p.placement.rotY === 'number') maps.tiltYRadByFid[v[0]] = p.placement.rotY;
        } catch (e) { } });
      } catch (e) { }
      return maps;
    },
    _buildClassByFid() { return this._buildInsertMaps().classByFid; },
    // 2. GRAB-LOCALITY — a gridline is otherwise infinite (grid_kinematics.js's _findBestGrid classifies
    // purely by along-axis centerline distance, §ATTACH_TOL=0.5m, with NO awareness of position along the
    // line's own length). Fine for a small authored scene; genuinely wrong for a real, dense building where
    // dozens of walls at completely different rooms can all coincidentally sit within 0.5m of the SAME x or
    // y coordinate (confirmed real: Duplex, one gridline drag, ~50 real elements swept into one commit).
    // Scope candidates to elements near WHERE THE USER ACTUALLY GRABBED the line (the pointerdown hit's
    // ORTHOGONAL coordinate — e.g. hit.y for an x-axis line) — matches how a user actually thinks about it
    // ("I grabbed THIS stretch"), not a re-derivation of "architectural convenience" via face tolerance.
    // Radius is DERIVED from the grid's own orthogonal-axis line spacing (one bay, +50% margin so an
    // element right at a bay boundary still qualifies) — extracted from the real grid definition already
    // present, not an invented constant. `draggedAxis` names the axis of the GRIPPED line ('x' or 'y') --
    // the orthogonal-axis lines (whose spacing defines the bay) are the OTHER grid axis.
    _localityRadius(draggedAxis) {
      const G = window.Bonsai.grid; const lines = (draggedAxis === 'x' ? G.ys : G.xs) || [];
      if (lines.length < 2) return Infinity;   // a single-line grid on the orthogonal axis has no "bay" to derive -- don't filter
      const sorted = lines.slice().sort((a, b) => a - b);
      let maxGap = 0;
      for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
      return maxGap * 1.5;
    },

    // The engine's elementData = each authored solid's centre + bbox extents (the geometry it must recompose).
    elementData() {
      const g = window.Bonsai.group && window.Bonsai.group(); if (!g) return [];
      const maps = this._buildInsertMaps();
      const classByFid = maps.classByFid, yawRadByFid = maps.yawRadByFid;
      const tiltXRadByFid = maps.tiltXRadByFid, tiltYRadByFid = maps.tiltYRadByFid;
      const allow = this._STRUCTURAL_CLASSES;
      const draggedAxis = this._dragAxis, orthoAt = this._dragOrthoAt;   // set by beginDragSession(); null outside a session (unchanged/global behavior for direct computeCommands() callers, e.g. discovery-sweep tests)
      const radius = draggedAxis != null ? this._localityRadius(draggedAxis) : Infinity;
      return g.children.filter(o => {
        if (!(o.isMesh && o.userData.featureId != null)) return false;
        const cls = classByFid[o.userData.featureId];
        if (cls != null && allow.indexOf(cls) === -1) return false;   // known class, not structural/enclosure -> exclude
        return true;
      }).map(m => {
        m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox;
        return { guid: m.userData.featureId,
          x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2, z: (bb.min.z + bb.max.z) / 2,
          bboxX: bb.max.x - bb.min.x, bboxY: bb.max.y - bb.min.y, bboxZ: bb.max.z - bb.min.z,
          ifcClass: 'IfcWall',
          yawRad: yawRadByFid[m.userData.featureId],   // §ROTATION-GUARD: undefined when unrecorded ⇒ engine behavior unchanged
          tiltXRad: tiltXRadByFid[m.userData.featureId],   // §ROTATION-GUARD-3AXIS: ditto
          tiltYRad: tiltYRadByFid[m.userData.featureId] };
      }).filter(elem => {
        if (draggedAxis == null || !isFinite(radius)) return true;
        const orthoPos = draggedAxis === 'x' ? elem.y : elem.x;   // draggedAxis names the GRIPPED line's axis; the element's ORTHOGONAL coordinate is the OTHER one
        return Math.abs(orthoPos - orthoAt) <= radius;
      });
    },

    // The engine's gridLines = the authoring grid's x + y lines, with a back-map gridId -> {axis, index}.
    gridLines() {
      const G = window.Bonsai.grid; const lines = []; this._map = {};
      G.xs.forEach((x, i) => { const id = 'gx' + i; lines.push({ id, axis: 'x', pos: x }); this._map[id] = { axis: 'x', index: i }; });
      G.ys.forEach((y, j) => { const id = 'gy' + j; lines.push({ id, axis: 'y', pos: y }); this._map[id] = { axis: 'y', index: j }; });
      return lines;
    },

    // Build a fresh engine + attach map (the pre-fix per-call cost). Extracted so both the cached session path
    // (beginDragSession) and the uncached fallback (no session active) share ONE implementation.
    _buildEngine() {
      const Eng = window.GridKinematics && window.GridKinematics.GridKinematicEngine;
      if (!Eng) throw new Error('GridKinematics engine not loaded');
      const eng = new Eng(this.elementData(), this.gridLines());
      eng.attachGridToElements();
      return eng;
    },
    // §SCALE_CHECK_FIX: call once on gridline-grab (pointerdown) — builds + CACHES the attach-map engine plus
    // the two sibling per-frame O(n) scans (mesh-by-fid for gmTint, box-by-fid for §STRETCH-RIDE) for the
    // duration of this ONE drag session. Logged so the cache lifecycle is visible in the console, not just
    // inferred from timing.
    // §GRIDSCOPE: draggedAxis/orthoAt (OPTIONAL, both new params) are the grabbed line's axis + the
    // pointerdown hit's orthogonal-axis coordinate (modeller.html's pointerdown handler) — feeds
    // elementData()'s grab-locality filter above. Omitted (any pre-existing caller) ⇒ draggedAxis stays
    // null ⇒ locality filtering is skipped entirely (byte-identical to before this change for those callers).
    beginDragSession(draggedAxis, orthoAt) {
      this._dragAxis = draggedAxis != null ? draggedAxis : null;
      this._dragOrthoAt = orthoAt != null ? orthoAt : null;
      this._engine = this._buildEngine();
      this._meshCache = this._buildMeshByFid();
      this._boxCache = this._buildBoxByFid();
      // §SCALE-YAW-GUARD (GRID_ROTATED_SCALE_HARDENING.md §1.1): session-cached fid -> yawRad/tiltXRad/tiltYRad
      // so computeCommands() can stamp each command WITHOUT re-querying kernel_ops per pointermove frame
      // (§SCALE_CHECK_FIX invariant). One shared cache object (one query) for all three optional fields.
      this._insertMapsCache = this._buildInsertMaps();
      console.log(TAG + ' §SCALE_CHECK_FIX drag-session begin — attach-map + mesh/box caches built ONCE (reused every pointermove frame)' +
        (this._dragAxis != null ? (' §GRIDSCOPE axis=' + this._dragAxis + ' orthoAt=' + this._dragOrthoAt.toFixed(3) + ' radius=' + this._localityRadius(this._dragAxis).toFixed(3)) : '') +
        (this._engine.getYawSkipCount && this._engine.getYawSkipCount() ? ' §ROTATION-GUARD yawSkipped=' + this._engine.getYawSkipCount() + ' element-axis classification(s) (oblique yaw, AABB edges unreal — fell through to interior)' : '') +
        (this._engine.getTiltSkipCount && this._engine.getTiltSkipCount() ? ' §ROTATION-GUARD-3AXIS tiltSkipped=' + this._engine.getTiltSkipCount() + ' element-axis classification(s) (non-negligible rotX/rotY — fell through to interior)' : ''));
    },
    // Called on commit/cancel — the NEXT drag (or any non-session caller) rebuilds fresh off the post-commit
    // scene, so a scene edit between drags is never served a stale attach map.
    endDragSession() {
      if (this._engine) console.log(TAG + ' §SCALE_CHECK_FIX drag-session end — caches cleared');
      this._engine = null; this._meshCache = null; this._boxCache = null; this._insertMapsCache = null;
      this._dragAxis = null; this._dragOrthoAt = null;
    },
    // PURE recompose: use the cached attached engine if a drag session is active, else build-and-discard
    // (unchanged fallback behavior for any caller outside a session, e.g. tests).
    computeCommands(gridId, delta) {
      const eng = this._engine || this._buildEngine();
      // §SCALE-YAW-GUARD / §ROTATION-GUARD-3AXIS: fid -> yawRad/tiltXRad/tiltYRad ride each command so the
      // worker's SCALE fold can refuse a world-axis stretch of an obliquely-yawed OR tilted solid (defense in
      // depth — GRID_ROTATION_GUARD.md already keeps such elements out of ATTACH/EDGE/SPAN classification
      // upstream). Unrecorded fid ⇒ undefined ⇒ worker behavior byte-identical to before.
      const maps = this._insertMapsCache || this._buildInsertMaps();
      const yawByFid = maps.yawRadByFid, tiltXByFid = maps.tiltXRadByFid, tiltYByFid = maps.tiltYRadByFid;
      // engine guid === our featureId; carry it forward as featureId so the worker fold is unambiguous.
      return eng.dragGrid(gridId, delta).map(c => ({
        featureId: c.guid, action: c.action, axis: c.axis,
        delta: c.delta, newScale: c.newScale, translateDelta: c.translateDelta, edge: c.edge,
        yawRad: yawByFid[c.guid], tiltXRad: tiltXByFid[c.guid], tiltYRad: tiltYByFid[c.guid] }));
    },
    // fid -> mesh map (gmTint's per-command lookup — was g.children.find(), O(n) per command per frame).
    _buildMeshByFid() {
      const g = window.Bonsai.group && window.Bonsai.group(); const out = {}; if (!g) return out;
      g.children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null) out[m.userData.featureId] = m; });
      return out;
    },
    meshByFid() { return this._meshCache || this._buildMeshByFid(); },

    // §STRETCH-RIDE snapshot: pre-stretch AABBs of every authored mesh, the SAME shape modeller.html's own
    // _gateBoxes() builds for the conformity gate — SdgCascade.stretchRide needs the rider's + host's PRE-edit
    // boxes to derive the induced move (see sdg_cascade.js header). Read BEFORE this drag's commit so it's
    // honest — and, being a snapshot of the PRE-edit state, it is by definition invariant across every frame of
    // the same drag (no mesh transform actually changes until the commit folds), so it is safe and correct to
    // cache it for the session exactly like the engine/mesh caches above (§SCALE_CHECK_FIX).
    _buildBoxByFid() {
      const g = window.Bonsai.group && window.Bonsai.group(); const out = {}; if (!g) return out;
      g.children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null) {
        m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
        out[m.userData.featureId] = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; } });
      return out;
    },
    _boxByFid() { return this._boxCache || this._buildBoxByFid(); },

    // §PREDRAG shared pipeline (GRID_PREDRAG_GREENORANGE_PREVIEW.md): computeCommands → stretchRide (hosted-
    // opening override — fixes the gap where the live gmTint preview saw only the engine's raw, possibly-WRONG
    // per-element command for a door/window) → applyOverrides (green opt-out, item 3/4). Used by BOTH the live
    // gmTint preview (modeller.html pointermove) AND commit() below — one code path, so preview and the actual
    // commit can never disagree.
    previewCommands(gridId, delta) {
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
      }
      const applied = this.applyOverrides(commands, riders);
      return { commands: applied.commands, riders: applied.riders, excluded: applied.excluded };
    },

    // Commit ONE signed GEOM_GRID_MOVE per drag-release; the worker folds the recompose deterministically.
    // Implementing RESUME_CASCADE_INTO_STRETCH.md §STRETCH-RIDE — Witness: W-STRETCH-RIDE.
    async commit(gridId, delta) {
      const preview = this.previewCommands(gridId, delta);
      let commands = preview.commands, riders = preview.riders;
      if (preview.excluded.length) console.log(TAG + ' §GREEN-EXCLUDE commit skipped=' + preview.excluded.length + ' fid(s) (green, did not move): ' + preview.excluded.join(','));
      if (riders.length) console.log(TAG + ' §STRETCH-RIDE stripped=' + riders.length + ' rider cmd(s) → induced move instead: ' + riders.map(r => r.featureId).join(','));
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
