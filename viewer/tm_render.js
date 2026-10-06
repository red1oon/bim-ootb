// time_machine family — part `render` (original time_machine.js lines 1420–2841).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.render = function* __split_time_machine_render(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.renderAtTime = renderAtTime;
  TMS._applyRemoteTimeline = _applyRemoteTimeline;
  TMS.clearHighlight = clearHighlight;
  TMS.applySunCycle = applySunCycle;
  TMS.restoreSky = restoreSky;
  Object.defineProperty(TMS, '_savedClearColor', { get: function () { return _savedClearColor; }, set: function (v) { _savedClearColor = v; }, enumerable: true });
  Object.defineProperty(TMS, '_savedLighting', { get: function () { return _savedLighting; }, set: function (v) { _savedLighting = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  function renderAtTime(cursorMs) {
    var app = TMS.A();
    if (!app || !app.scene) return;
    TMS._tmEnsure();
    TMS._gspCand.length = 0;   // §GROUP_SPARK: reset candidates each tick, before the traverse
    TMS._gspFrontierN = 0; TMS._gspRecentN = 0;
    if (!TMS._zeroMatrix) TMS._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    if (!TMS._whiteColor) TMS._whiteColor = new THREE.Color(1, 1, 1);
    TMS._prevCursor = TMS._cursor;
    TMS._cursor = cursorMs;

    // Restore previously highlighted meshes to solid
    clearHighlight();

    // Determine which elements to show and their state
    var placed = {};    // guid → true (fully built: end_ts <= cursor)
    var frontier = {};  // guid → {t: 0-1 progress, isSteel: bool}
    var recent = {};    // guid → fade 0-1 (1 = just finished)
    var arrival = {};   // guid → true (just appeared this tick — white flash)
    var _sfxPhases = null; // phase set at the frontier this tick (§SFX voice + §CPE_ROOM_TITLE_COLLECTIVE bracket)
    var lingerMs = TMS.tickMs() * 3; // linger for 3 ticks after completion
    var _isMobileTM = !!(window._isMobile || window._isMobileTM);

    for (var i = 0; i < TMS._ops.length; i++) {
      var op = TMS._ops[i];
      if (op.start_ts > cursorMs) break;
      var guid = op.output_guid;
      if (!guid && op.input_guids && op.input_guids.length) guid = op.input_guids[0];
      if (!guid) continue;

      if (op.end_ts <= cursorMs) {
        placed[guid] = true;
        // Recently finished — amber linger with fade
        var age = cursorMs - op.end_ts;
        if (age < lingerMs) recent[guid] = 1 - (age / lingerMs);
      } else {
        var progress = (cursorMs - op.start_ts) / Math.max(1, op.end_ts - op.start_ts);
        var p = op.parameters || {};
        var cls = p.cls || '';
        var isSteel = /^Ifc(Beam|Column|Member|Plate)$/.test(cls) ||
                      (p.resource === 'STEEL_ERECTOR');
        frontier[guid] = { t: progress, isSteel: isSteel };
        // Arrival = first 15% of install time (white flash)
        if (progress < 0.15) arrival[guid] = true;
        // §SFX seam (sfx.js) + §CPE_ROOM_TITLE_COLLECTIVE (cpe_room_title.js): collect the
        // construction phase(s) at the frontier. Two consumers now — the sfx voice AND the
        // caption's [phase] bracket — so the collection no longer gates on __sfxTM; each
        // consumer still decides for itself what to do with it (SoC).
        if (p.phase) { if (!_sfxPhases) _sfxPhases = {}; _sfxPhases[p.phase] = (_sfxPhases[p.phase] || 0) + 1; }
      }
    }

    // §S260d: Whitebox material state logger — module-level counter persists across ticks
    function _wbMat(tag, obj) {
      // §PERF: whitebox material logger — a DIAGNOSTIC, not for production playback. It fired once
      // per mesh every tick (~20+ console.logs/tick on a large model, each with heavy string
      // building), which is real per-tick cost and, with devtools open in Firefox, a major stall.
      // Default OFF; set window.__TM_WBDEBUG=true in the console to re-enable when diagnosing colors.
      if (!window.__TM_WBDEBUG) return;
      _wbLogCount++;
      if (_wbLogCount > 10 && _wbLogCount % 500 !== 0) return;
      var m = obj.material;
      if (!m) return;
      var rgb = m.color ? ('rgb=' + m.color.r.toFixed(2) + ',' + m.color.g.toFixed(2) + ',' + m.color.b.toFixed(2)) : 'no-color';
      var em = m.emissive ? ('em=' + m.emissive.r.toFixed(2) + ',' + m.emissive.g.toFixed(2) + ',' + m.emissive.b.toFixed(2) + ' eI=' + (m.emissiveIntensity || 0).toFixed(2)) : 'no-em';
      var pbr = (m.roughness !== undefined) ? (' rough=' + m.roughness.toFixed(2) + ' metal=' + (m.metalness || 0).toFixed(2)) : '';
      var bright = m.color && (m.color.r > 0.9 && m.color.g > 0.9 && m.color.b > 0.9);
      var emBright = m.emissive && m.emissiveIntensity > 0.3 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0;
      var flag = (bright ? ' ⚠WHITE' : '') + (emBright ? ' ⚠EMISSIVE' : '');
      console.log('§WB_MAT ' + tag + ' guid=' + (obj.userData && obj.userData.guid || '?').substring(0,12) +
        ' cls=' + (obj.userData && obj.userData.ifcClass || '?') +
        ' type=' + (m.type || '?') +
        ' ' + rgb + ' ' + em + pbr + ' op=' + (m.opacity || 1).toFixed(2) +
        ' transp=' + !!m.transparent + ' hi=' + !!obj._tm_highlighted +
        ' mesh=' + (obj.isBatchedMesh ? 'BM' : obj.isInstancedMesh ? 'IM' : 'M') + flag);
    }

    // ── Single unified traverse: visibility + shadow + sparks + guidPosMap ──
    // Merged from 4 separate traversals → 1 for 100K+ element performance.
    var _shadowCasters = 0, _shadowReceivers = 0;
    var _frontierCentroids = [];  // for shadow proximity promotion (2nd pass)
    var _frontierPositions = [];  // for camera follow
    var _guidPosMap = {};         // guid → Vector3 for look-ahead (O(1) per guid)
    var _placedMeshes = [];       // for shadow promotion pass

    // Pre-compute which GUIDs the look-ahead needs — avoids getWorldPosition on ALL 100K meshes
    var _previewGuids = null;
    if (TMS._camFollow) {
      _previewGuids = {};
      var _preMs = TMS.tickMs() * 2;
      for (var _pi = 0; _pi < TMS._ops.length; _pi++) {
        if (TMS._ops[_pi].start_ts > TMS._cursor + _preMs) break;
        if (TMS._ops[_pi].start_ts <= TMS._cursor) continue;
        var _pg = TMS._ops[_pi].output_guid;
        if (!_pg && TMS._ops[_pi].input_guids && TMS._ops[_pi].input_guids.length) _pg = TMS._ops[_pi].input_guids[0];
        if (_pg) _previewGuids[_pg] = true;
      }
    }

    // §S260d: All particle effects removed

    // ── TM_DLOD_SCALE.md §3 (redesigned): real = frontier ∪ recent ∪ in-view; box = placed, not
    // in either. Box index must exist BEFORE the traverse below reads _dlodInView, so build it here
    // (not lazily inside _dlodUpdateBoxes) — else the first engaged tick would see an empty index
    // and fail every element open to "real", one tick behind. Zero cost when the toggle is off.
    var _dlodOn = TMS._dlodEngaged(app);
    // §129.51c — did the proxy just engage or disengage? The incremental path below only revisits
    // elements whose PLACED STATE changed in this cursor step, so on a disengage tick every row the
    // proxy had zero-scaled would simply stay zero-scaled: nothing looks at it again. MEASURED, the
    // §129.51b attempt: the stand-down flag rose 41 frames before the storey window and the arm
    // STILL snapshotted 4,544 zero-scaled rows, handing back 2,981 members off. The flag was right
    // and inert. This is the term that makes it act.
    var _dlodJustToggled = (TMS._dlodPrevOn !== null && TMS._dlodPrevOn !== _dlodOn);
    TMS._dlodPrevOn = _dlodOn;
    if (_dlodOn) {
      TMS._dlodBuildBoxes(app);
      if (TMS._dlodBoxIndex && app.camera) {
        if (!TMS._dlodFrustum) { TMS._dlodFrustum = new THREE.Frustum(); TMS._dlodPSM = new THREE.Matrix4(); TMS._dlodSphere = new THREE.Sphere(); }
        // §DLOD_VF_CAMGUARD — gate against whichever camera the user is actually looking through.
        var _dlodActiveCam = TMS._dlodResolveCamera(app);
        // §DLOD_VF_MATRIX_STALE (2026-08-05) — this function runs off Time Machine's OWN setTimeout
        // ticker (_playTimer, see playTick), never synchronized with the rAF-driven animate() loop.
        // app.camera's matrixWorld/matrixWorldInverse get refreshed every rAF frame because
        // renderer.render(scene, app.camera) runs there unconditionally. vfCam's ONLY gets refreshed
        // by cinema_path_editor.js's own _vfRender(), itself gated behind the SAME rAF loop's
        // needsRender check — so on a POV-only rehearsal, whichever of these two independent timers
        // (TM's setTimeout vs. rAF) happens to fire first in a given moment can read vfCam's matrix
        // BEFORE this tick's _applyVFPose() move has actually reached it, i.e. the frustum below is
        // built from the WRONG pose. updateMatrixWorld() recomputes both matrixWorld and
        // matrixWorldInverse from whatever position/quaternion _applyVFPose already set — cheap
        // (single camera, not a scene traverse) and makes this tick's frustum correct regardless of
        // which timer got here first. This is exactly the vfCam-goes-blank mechanism named in the
        // prior session's handoff ("vfCam ends up looking at nothing").
        _dlodActiveCam.updateMatrixWorld();
        TMS._dlodCamPos = _dlodActiveCam.position;
        TMS._dlodPSM.multiplyMatrices(_dlodActiveCam.projectionMatrix, _dlodActiveCam.matrixWorldInverse);
        TMS._dlodFrustum.setFromProjectionMatrix(TMS._dlodPSM);
      } else {
        _dlodOn = false; // box build failed (deps/query) — fall back to legacy behavior this tick
      }
    }

    // §PERF_INCR: decide delta vs full for THIS tick.
    // Full is required (not merely allowed) when: index missing/stale, no previous cursor, shadows
    // just toggled (see _lastShadowOn above), or the jump is large enough that skipping saves
    // nothing. A long scrub legitimately changes tens of thousands of elements -- forcing delta
    // there would be SLOWER than the full path, which is the failure this guard prevents.
    // §PERF_INCR Phase 2: shadows staying ON/OFF steady-state does NOT need a blanket full-mode
    // gate -- _placedMeshes/_frontierCentroids/_shadowCasters are built in the single-mesh branch
    // below, which is unconditional (never skipped) regardless of _incrOK. Only the EDGE tick
    // (shadow flag flips) needs a forced full pass, to (re)seed Batched/Instanced shadow flags.
    var _sig = TMS._tmSceneSig(app);
    // §PERF_INCR_DEFER (TM_STREAM_REBUILD_COALESCE.md; CPE_4D_PERF_MEM_FINDINGS.md §3-R5): TM
    // active WHILE a big building still streams = every batch bumps _metaGen = a full 50-159ms
    // index rebuild per batch (10+ on LTU, 0.5-2s stacked) — and each rebuild forced mode=full
    // anyway (_incrPrimed reset). While app.streaming, skip the builds entirely and render
    // full-mode (identical output — the full path never consults the index); build ONCE on the
    // first pass after streaming settles. Mirrors _dlodEngaged's !app.streaming gate. A stale
    // index is never consulted: the index is DROPPED here, not kept (§4 Risk discipline —
    // "a stale index silently corrupts the scene").
    if (!TMS._evMesh || _sig !== TMS._evSig) {
      if (app.streaming) {
        // Drop (never keep-stale) any existing index once; then stay index-less and silent —
        // every pass below renders the full path (_incrPrimed=false ⇒ _incrOK=false).
        if (TMS._evMesh) {
          TMS._evMesh = null; TMS._evSig = ''; TMS._incrPrimed = false;
          console.log('§PERF_INCR_DEFER streaming — index dropped, builds deferred until settle');
        }
      } else {
        TMS._tmBuildEventIndex(app, lingerMs);
      }
    }
    var _dLo = Math.min(TMS._prevCursor, cursorMs), _dHi = Math.max(TMS._prevCursor, cursorMs);
    var _shadowNow = !!app._shadowOn;
    var _shadowJustToggled = (TMS._lastShadowOn !== null && TMS._lastShadowOn !== _shadowNow);
    // §DLOD_TM_CAMGUARD (TM_DLOD_SCALE.md §10, direction b): _dlodInView is a pure function of
    // camera pose, but it's only ever read inside the BatchedMesh/InstancedMesh branches below,
    // which the incremental-delta skip can bypass entirely when nothing was built/finished this
    // tick (span=0, pure orbit). Force a full pass whenever the camera pose actually changed on a
    // DLOD-engaged tick, so the real-mesh restore (box→real) is re-evaluated same as the box path
    // already is (_dlodUpdateBoxes has no such skip). Off the DLOD path this is always false — zero
    // behavioural change (W-DLOD-EQUIV).
    var _dlodCamMoved = false;
    if (_dlodOn) {
      // §DLOD_VF_CAMGUARD_SIG: same camera _dlodCamPos/frustum were just built from above
      // (_dlodActiveCam — vfCam when POV is active, main otherwise), not always app.camera — see
      // that function's own comment for why using the wrong one here goes stale silently.
      var _dlodCamSigNow = TMS._giHoldCamSig(app, _dlodActiveCam);
      _dlodCamMoved = (TMS._dlodLastCamSig !== null && TMS._dlodLastCamSig !== _dlodCamSigNow);
      TMS._dlodLastCamSig = _dlodCamSigNow;
    } else {
      TMS._dlodLastCamSig = null; // reset: engaging DLOD later must not compare against a stale pose
    }
    // §129.51c — !_dlodJustToggled joins !_shadowJustToggled and !_dlodCamMoved: all three are
    // "something changed that the delta cannot see", and a proxy edge is exactly that. One full
    // pass on the edge is enough; the tick after it goes back to the incremental path.
    var _incrOK = !!TMS._evMesh && TMS._prevCursor != null && !_shadowJustToggled && !_dlodCamMoved &&
                  !_dlodJustToggled &&
                  (_dHi - _dLo) <= TMS._INCR_MAX_SPAN_MS && TMS._incrPrimed;
    // W-INCR-EQUIV hook: the verification harness sets window.__forceFull to re-render the SAME
    // cursor via the full path, so the two results can be diffed. Test-only; no production effect.
    if (window.__forceFull) { _incrOK = false; window.__forceFull = false; }
    if (_incrOK) TMS._incrStats.delta++; else TMS._incrStats.full++;
    TMS._lastShadowOn = _shadowNow;

    // §SHADOW_FRONTIER_AT_CAPTURE (2026-08-12, real user report: "not casting shadows inside
    // early construction"): existing §SHADOW_FRONTIER casters/receivers counters only increment
    // when app._shadowOn (native Sunglass toggle) is true -- always false during a PHOTO_SHADOW/
    // MaxQ bake, so that log reads 0/0 every bake regardless of whether the PHOTO_SHADOW system's
    // OWN separate reassert (effects.js _reassertPhotoShadowCoverage) actually corrects it -- an
    // unrelated internal counter, not proof either way. Built directly from `frontier` (already
    // fully populated above, straight from the schedule ops) rather than captured during the
    // scene traversal below -- an earlier version tried the traversal and came back empty every
    // time: steel beams/columns (isSteel above) are exactly the elements most likely rendered via
    // BatchedMesh/InstancedMesh, which never carry a single userData.guid the "single mesh" branch
    // below can match against. Reading straight from `frontier` is correct regardless of which
    // rendering path a given guid ends up on.
    window.__tmFrontierGuidsNow = new Set(Object.keys(frontier));
    // §CPE_BUILDUP_PLACED — refresh ONLY the schedule half of each watched guid's record. The scene
    // half is written by the traverse below and deliberately survives ticks the delta path skips.
    var _bdW = TMS._bdWatchSet(app);
    if (_bdW) for (var _bg in _bdW) {
      TMS._bdRec(_bg).op = frontier[_bg] ? 'frontier' : (placed[_bg] ? 'placed' : 'pending');
    }
    // §REVEAL_DOOR_LEAK (bim-compiler prompts/ALTC_FOUNDATION.md): this pass owns "is it built at the cursor"; whether its DISCIPLINE is shown is
    // owned by the discipline filter (panels.js _applyDiscVisibility / app.hiddenDiscs). A single mesh is visible only when both say yes —
    // before, this pass wrote visible=true every tick and undid the reveal round's once-per-slot hide (HHS: 17 IfcDoor meshes, §REVEAL_TRAP).
    var _hd = (app.hiddenDiscs && app.hiddenDiscs.size) ? app.hiddenDiscs : null, _discKept = 0;
    function _discShown(o) { if (_hd && o.userData.disc && _hd.has(o.userData.disc)) { _discKept++; return false; } return true; }
    var _perfT0 = performance.now(), _perfObjs = 0, _perfSkipped = 0, _perfHideForProxy = 0;
    app.scene.traverse(function(obj) {
      _perfObjs++;
      if (!obj.userData) return;

      // ── Single mesh (has userData.guid) ──
      if (obj.userData.guid) {
        var g = obj.userData.guid;
        var isFrontier = !!frontier[g];
        var isPlaced = !!placed[g];
        var isRecent = recent[g] !== undefined;
        // §XRAY_STAGING_REMOVED (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
        // §HOSPITAL_LIGHTING_STILL_FLOATING — user directive: "remove that staging stage!!!" after
        // "on Day 5... hanging MEP elements started hanging in mid air"). §Z_STACK_XRAY_STAGING
        // (2026-08-03) used to show a placed-but-not-yet-fully-supported element as a translucent
        // ghost instead of solid — a deliberate "still under construction" visual. That ghost IS a
        // real element appearing before its support finishes, i.e. exactly the mid-air look, just
        // translucent instead of opaque. It also only ever applied to obj.isMesh — BatchedMesh/
        // InstancedMesh (where the bulk of MEP actually renders) got NO such gating at all and
        // showed the same unsupported population fully SOLID, worse than the ghost. Folding the
        // same one condition into `showReal` here removes the ghost path entirely and closes the
        // BatchedMesh/InstancedMesh gap the same way, in one place: nothing appears until its own
        // support is actually finished, full stop — never a ghost, never an early solid.
        var isStagedNow = !isFrontier && (TMS._tmXraySolidifyTs[g] !== undefined && cursorMs < TMS._tmXraySolidifyTs[g]);
        // §DLOD_TM landmine-5 guard (double-draw): hideForProxy can only be true for placed-only
        // elements — isFrontier already excludes it, so real-mesh and box visibility stay disjoint.
        var hideForProxy = _dlodOn && isPlaced && !isFrontier && !isRecent && !TMS._dlodInView(g);
        if (hideForProxy) _perfHideForProxy++;
        var showReal = (isRecent || isPlaced) && !hideForProxy && !isStagedNow;

        // Visibility + highlighting
        if (isFrontier) {
          obj.visible = _discShown(obj);   // §REVEAL_DOOR_LEAK: built AND its discipline shown (the filter owns the second half)
          if (obj.isMesh) {
            _wbMat('FRONTIER', obj);
            var ft = frontier[g].t;
            // §S260e: Emissive glow on frontier — visible on all GPUs
            // Cyan flash (first 15%) then orange glow during install
            var fColor = ft < 0.15 ? 0x44ffff : 0xff8c00;
            applyHighlight(obj, fColor, 0.85, 0.4);
          }
        } else if (showReal) {
          obj.visible = _discShown(obj);   // §REVEAL_DOOR_LEAK
          if (obj._tm_highlighted) { _wbMat('RESTORE', obj); restoreMaterial(obj); }
        } else {
          obj.visible = false;
          if (obj._tm_highlighted) restoreMaterial(obj);
        }
        if (_bdW && _bdW[g]) TMS._bdSeen(g, obj.isMesh ? 'Mesh' : 'Obj', obj.visible, obj);

        // Shadow + camera (merged — was 3 separate traversals)
        // §S260b: Only set shadow flags if Sunglass shadow is ON
        if (obj.isMesh) {
          if (isFrontier) {
            obj.castShadow = !!app._shadowOn;
            obj.receiveShadow = !!app._shadowOn;
            if (app._shadowOn) { _shadowCasters++; _shadowReceivers++; }
            var swp = new THREE.Vector3();
            obj.getWorldPosition(swp);
            _frontierCentroids.push(swp);
            _frontierPositions.push(swp);
            if (TMS._camFollow) _guidPosMap[g] = swp;
            TMS._gspCollect(swp.x, swp.y, swp.z); TMS._gspFrontierN++;   // §GROUP_SPARK: single-mesh frontier
            // §S260d: Sparks removed (white square artifacts)
          } else if (showReal) {
            obj.receiveShadow = false;  // §S259: shadows globally disabled
            obj.castShadow = false;
            _placedMeshes.push(obj);
            // Only getWorldPosition for preview GUIDs (not all 100K meshes)
            if (_previewGuids && _previewGuids[g]) {
              var pmp = new THREE.Vector3();
              obj.getWorldPosition(pmp);
              _guidPosMap[g] = pmp;
            }
          } else {
            obj.castShadow = false;
            obj.receiveShadow = false;
            // Only getWorldPosition for preview GUIDs (future elements in look-ahead window)
            if (_previewGuids && _previewGuids[g]) {
              var fmp = new THREE.Vector3();
              obj.getWorldPosition(fmp);
              _guidPosMap[g] = fmp;
            }
          }
        }
        return;
      }

      // ── BatchedMesh (per-slot GUIDs in _batchMeta) — S260 ──
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        // §PERF_INCR Phase 2: same event index already indexes _batchMeta guids (see
        // _tmBuildEventIndex) but this branch never consulted it -- LTU's BatchedMesh-consolidated
        // geometry (8 draw calls) got ZERO benefit from Phase 1, only InstancedMesh did.
        if (_incrOK && !TMS._tmHasEventIn(TMS._evMesh[obj.id], _dLo, _dHi)) { _perfSkipped++; return; }
        var bmetas = app._batchMeta[obj.id];
        var anyVis = false;
        var _bmHasFrontier = false;
        var _bmM4 = TMS._tmM4;
        var _bmPos = TMS._tmV1;
        for (var bi = 0; bi < bmetas.length; bi++) {
          var bg = bmetas[bi].guid;
          var sid = bmetas[bi].slotId;
          var bHideForProxy = _dlodOn && !!placed[bg] && !frontier[bg] && recent[bg] === undefined && !TMS._dlodInView(bg);
          // §XRAY_STAGING_REMOVED — same gate as the single-mesh branch: this population (mostly
          // MEP, batched for performance) previously had NO staging check at all and showed fully
          // solid before its own support finished — the worse half of the bug this removal closes.
          var bStaged = !frontier[bg] && (TMS._tmXraySolidifyTs[bg] !== undefined && cursorMs < TMS._tmXraySolidifyTs[bg]);
          var bShow = (placed[bg] || frontier[bg] || recent[bg] !== undefined) && !bHideForProxy && !bStaged;
          if (_bdW && _bdW[bg]) {
            TMS._bdSeen(bg, 'BM', bShow, null);
            // §CPE_BUILDUP_PLACED — a batched slot's world Y comes from its own slot matrix, not
            // from the host mesh's position (the host is one object for thousands of elements).
            obj.getMatrixAt(sid, _bmM4); _bmPos.setFromMatrixPosition(_bmM4);
            TMS._bdRec(bg).y = +(_bmPos.y + (obj.position ? obj.position.y : 0)).toFixed(3);
          }
          if (bShow) {
            obj.setVisibleAt(sid, true);
            anyVis = true;
            if (frontier[bg]) {
              _bmHasFrontier = true;
              obj.getMatrixAt(sid, _bmM4);
              _bmPos.setFromMatrixPosition(_bmM4);
              TMS._gspCollect(_bmPos.x, _bmPos.y, _bmPos.z);   // §GROUP_SPARK: BatchedMesh slot
              TMS._gspFrontierN++;
              if (TMS._camFollow) {
                _frontierPositions.push(_bmPos.clone());
                _guidPosMap[bg] = _bmPos.clone();
              }
              // §YELLOW_BOX_RETIRED (2026-07-18, user: "bleed badly for Hospital") — the
              // depthTest:false edge box shone through walls/floors it should have been hidden
              // behind, reading as a bug not a feature on real buildings. Position tracking above
              // (camFollow/_frontierPositions/_guidPosMap) is unrelated and stays; only the
              // visible marker itself is removed.
            } else if (recent[bg] !== undefined) {
              // §GROUP_SPARK: recently-finished pieces are still cooling — include them as spark
              // candidates. Real frontier on Hospital is only ~7 elements at a time (crew-cap),
              // far too sparse to read; `recent` is the pool that makes the effect visible.
              // Still pure decoration: it only widens WHAT gets decorated, nothing is inferred.
              obj.getMatrixAt(sid, _bmM4);
              _bmPos.setFromMatrixPosition(_bmM4);
              TMS._gspCollect(_bmPos.x, _bmPos.y, _bmPos.z);
              TMS._gspRecentN++;
            }
            if (TMS._camFollow && _previewGuids && _previewGuids[bg]) {
              obj.getMatrixAt(sid, _bmM4);
              _bmPos.setFromMatrixPosition(_bmM4);
              _guidPosMap[bg] = _bmPos.clone();
            }
          } else {
            obj.setVisibleAt(sid, false);
          }
        }
        obj.visible = anyVis;
        // §S260f: No material swap on BatchedMesh — elements visible by setVisibleAt is enough
        if (anyVis) _wbMat('BATCHED', obj);
        if (app._shadowOn) {
          obj.castShadow = anyVis;
          obj.receiveShadow = anyVis;
        }
      }

      // ── InstancedMesh (per-instance GUIDs in _instanceMeta) ──
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        if (_incrOK && !TMS._tmHasEventIn(TMS._evMesh[obj.id], _dLo, _dHi)) { _perfSkipped++; return; }
        var metas = app._instanceMeta[obj.id];
        var meshId = obj.id;
        var anyVisible = false;
        var anyFrontier = false;

        if (!TMS._savedInstanceMatrices[meshId]) {
          TMS._savedInstanceMatrices[meshId] = {};
          var tmpM = new THREE.Matrix4();
          for (var mi = 0; mi < metas.length; mi++) {
            obj.getMatrixAt(mi, tmpM);
            TMS._savedInstanceMatrices[meshId][mi] = tmpM.clone();
          }
        }

        for (var mi = 0; mi < metas.length; mi++) {
          var ig = metas[mi].guid;
          var iHideForProxy = _dlodOn && !!placed[ig] && !frontier[ig] && recent[ig] === undefined && !TMS._dlodInView(ig);
          // §XRAY_STAGING_REMOVED — same gate as the single-mesh/BatchedMesh branches.
          var iStaged = !frontier[ig] && (TMS._tmXraySolidifyTs[ig] !== undefined && cursorMs < TMS._tmXraySolidifyTs[ig]);
          var iShow = (placed[ig] || frontier[ig] || recent[ig] !== undefined) && !iHideForProxy && !iStaged;
          if (_bdW && _bdW[ig]) {
            TMS._bdSeen(ig, 'IM', iShow, null);
            var _isv = TMS._savedInstanceMatrices[meshId][mi];
            if (_isv) { TMS._tmV2.setFromMatrixPosition(_isv);
              TMS._bdRec(ig).y = +(TMS._tmV2.y + (obj.position ? obj.position.y : 0)).toFixed(3); }
          }
          if (iShow) {
            if (TMS._savedInstanceMatrices[meshId][mi]) {
              obj.setMatrixAt(mi, TMS._savedInstanceMatrices[meshId][mi]);
            }
            anyVisible = true;
            if (frontier[ig]) {
              anyFrontier = true;
              // §GROUP_SPARK: InstancedMesh instance — position from the saved matrix
              if (TMS._savedInstanceMatrices[meshId][mi]) {
                TMS._tmV2.setFromMatrixPosition(TMS._savedInstanceMatrices[meshId][mi]);
                TMS._gspCollect(TMS._tmV2.x, TMS._tmV2.y, TMS._tmV2.z); TMS._gspFrontierN++;
              }
            }
          } else {
            obj.setMatrixAt(mi, TMS._zeroMatrix);
          }
        }
        obj.instanceMatrix.needsUpdate = true;
        obj.visible = anyVisible;
        if (anyVisible) _wbMat('INSTANCED' + (anyFrontier ? '_FRONTIER' : ''), obj);

        // §S260d: DO NOT highlight InstancedMesh — shared material affects ALL instances,
        // not just frontier ones. This was the white box flash (entire mesh turned orange).
        // Frontier instances are visible via matrix restore; non-frontier via zero matrix.
        if (obj._tm_highlighted) {
          restoreMaterial(obj); // clean up any leftover highlight from previous code
        }
      }
    });

    var _travMs = performance.now() - _perfT0;
    if (TMS._gspRoll % 10 === 0) console.log('§PERF_TRAVERSE ms=' + _travMs.toFixed(1) +
      ' objs=' + _perfObjs + ' skipped=' + _perfSkipped + ' mode=' + (_incrOK ? 'delta' : 'full') +
      ' span=' + Math.round((_dHi - _dLo) / 3600000) + 'h cand=' + (TMS._gspCand.length / 3) + (_hd ? ' discKept=' + _discKept + ' hiddenDiscs=[' + Array.from(_hd).join(',') + ']' : ''));
    // Diagnostic hook (harmless, cheap): last-traverse stats for perf verification without relying
    // on the throttled log. Read via window.__tmTrav in a probe.
    window.__tmTrav = { ms: +_travMs.toFixed(1), objs: _perfObjs, skipped: _perfSkipped,
                        mode: _incrOK ? 'delta' : 'full' };
    // §DLOD_VF_VISCOUNT (2026-08-05) — every tick while DLOD is engaged AND a POV camera (not main)
    // is the active gate, per the prior session's ask: "add a log of visible-element-count from
    // vfCam's perspective... at the moment _vfRender()'s box goes visually blank". Not throttled
    // like §PERF_TRAVERSE — only fires while B is on, so volume is bounded by rehearsal length, not
    // general use. hideForProxy climbing toward objs (few/no real meshes left near the camera) at
    // the SAME tick the user reports "blank" would confirm the DLOD-culling theory directly; staying
    // low would point elsewhere (e.g. scissor/viewport, see §CPE_VF_RENDER_TRACE).
    if (_dlodOn && _dlodActiveCam !== app.camera) {
      window.__tmDlodVf = { hideForProxy: _perfHideForProxy, objs: _perfObjs,
        camPos: { x: +TMS._dlodCamPos.x.toFixed(2), y: +TMS._dlodCamPos.y.toFixed(2), z: +TMS._dlodCamPos.z.toFixed(2) } };
      console.log('§DLOD_VF_VISCOUNT hideForProxy=' + _perfHideForProxy + ' objs=' + _perfObjs +
        ' camPos=' + JSON.stringify(window.__tmDlodVf.camPos));
    }
    TMS._incrPrimed = true;   // a full pass has now established slot state for every mesh
    // §GROUP_SPARK: emit AFTER the traverse — capping and per-group random selection need the
    // whole candidate set, which spawn-as-you-find (the reverted #866 shape) cannot provide.
    // `_playing` gates it: sparks during playback only, never on scrub.
    TMS._gspEmit(TMS._playing);

    // TM_DLOD_SCALE.md §2/§5.1: box-proxy sync — separate objects, never registered in
    // _batchMeta/_instanceMeta above, so this never touches _metaGen (W-DLOD-NO-REBUILD).
    TMS._dlodUpdateBoxes(app, _dlodOn, placed, frontier, recent);

    // ── Shadow promotion pass: nearby placed meshes → castShadow (cap 500) ──
    // §S260b: Only when Sunglass shadow is ON
    if (app._shadowOn && _frontierCentroids.length && _shadowCasters < 500) {
      var maxExtra = 500 - _shadowCasters;
      var stride = Math.max(1, Math.floor(_placedMeshes.length / 1000));
      for (var spi = 0; spi < _placedMeshes.length && maxExtra > 0; spi += stride) {
        var sobj = _placedMeshes[spi];
        sobj.getWorldPosition(TMS._tmV2);
        for (var si = 0; si < _frontierCentroids.length; si++) {
          if (TMS._tmV2.distanceToSquared(_frontierCentroids[si]) < 400) {
            sobj.castShadow = true;
            _shadowCasters++;
            maxExtra--;
            break;
          }
        }
      }
    }
    // §SHADOW_FRONTIER — log every 60 ticks
    // §VAC V1 / §R14.1 (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md): this line printed
    // "casters=0 receivers=0" on all 33 firings of the 2,027-frame Hospital bake, and BOTH of its
    // counters are structurally unreachable in that run — so the zeros were never a judgement.
    //   (a) _shadowCasters/_shadowReceivers only increment behind `if (app._shadowOn)` (:1463 and
    //       the promotion pass directly above); that run logged §TM_SHADOW_INHERIT shadowOn=false.
    //   (b) both counters live in the SINGLE-MESH branch (see the §PERF_INCR Phase 2 comment near
    //       :1342). On a device that took the fast batched path there are no individually-meshed
    //       elements at all — §SHADOW_FRONTIER_IDX measured meshGuids=0 groupGuids=63182 on the
    //       same building, and §BATCHED_FAIL never fired.
    // The log line sits OUTSIDE the `if (app._shadowOn …)` block on purpose (a zero must still be
    // reportable), so it has to name WHICH predicate is empty rather than print a bare 0.
    TMS._shadowLogTick++;
    if (TMS._shadowLogTick >= 60) {
      TMS._shadowLogTick = 0;
      if (!app._shadowOn) {
        console.log('§SHADOW_FRONTIER VACUOUS — shadowOn=false, the casters/receivers counters are gated off; 0 means "not asked", not "none found"');
      } else if (!_placedMeshes.length && !_frontierCentroids.length) {
        console.log('§SHADOW_FRONTIER VACUOUS — shadowOn=true but the single-mesh branch placed 0 meshes and 0 frontier centroids (batched/instanced scene); these counters cannot see batched geometry');
      } else {
        console.log('§SHADOW_FRONTIER casters=' + _shadowCasters + ' receivers=' + _shadowReceivers +
          ' (single-mesh branch only; placedMeshes=' + _placedMeshes.length + ' frontierCentroids=' + _frontierCentroids.length + ')');
      }
    }

    // §S260c: Cinematic Director — storyboard-driven camera (Film Studio mode)
    // Scene types: 'flythrough' (tight on devices) vs 'panoramic' (wide orbit over dense area)
    // §S260c BUG6: Run camera when storyboard exists, not just when frontier elements are present.
    // The storyboard is pre-planned — camera must move even between frontier bursts.
    if (TMS._camFollow && TMS._cineStoryboard.length && app.controls && app.camera) {
      var nowPerf = performance.now();
      TMS._cineTick++;
      var target = app.controls.target;

      function easeInOut(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

      // ── Line-of-sight peel: temporarily hide meshes blocking camera → target ──
      // Restores them next tick. Essential for MEP in constrained ceiling/shaft spaces.
      // §S260c: SKIP on mobile — material clones consume memory
      var _isMobileCine = !!(window._isMobile || window._isMobileTM);
      function peelObstructions(camPos, tgtPos) {
        if (_isMobileCine) return; // no peel on mobile
        // Restore anything peeled last tick
        TMS.restorePeeled();
        TMS._tmV2.subVectors(tgtPos, camPos).normalize();
        var dist = camPos.distanceTo(tgtPos);
        TMS._tmRay.set(camPos, TMS._tmV2);
        TMS._tmRay.far = dist * 0.9; // only hide things between cam and 90% of target
        var meshes = [];
        app.scene.traverse(function(o) { if (o.isMesh && o.visible) meshes.push(o); });
        var hits = TMS._tmRay.intersectObjects(meshes, false);
        // Hide up to 5 obstructing meshes (walls, slabs blocking the view)
        for (var hi = 0; hi < Math.min(hits.length, 5); hi++) {
          var obj = hits[hi].object;
          if (obj.userData && obj.userData.guid) {
            obj._cinePeeled = true;
            obj._cinePeelOrigMat = obj.material; // §S278: save original to restore + dispose clone
            obj.material = obj.material.clone();
            obj.material.transparent = true;
            obj.material.opacity = 0.08;
            obj.material.needsUpdate = true;
            TMS._cinePeeled.push(obj);
          }
        }
      }

      // Advance storyboard: move to next scene when cursor passes current scene's end time
      var scene = TMS._cineStoryboard[TMS._cineSceneIdx];
      // §S260d: Scene ends when BOTH conditions met:
      // 1. Cursor past scene's timeline end (ops are done)
      // 2. Minimum beat ticks elapsed (ensures enough real screen time for camera arc)
      var sceneEnded = false;
      var beatLen = scene && scene.type === 'panoramic' ? TMS._BEAT_ESTAB : TMS._BEAT_CLOSEUP;
      var timelineEnded = scene && scene.endTs ? (TMS._cursor >= scene.endTs) : true;
      var beatDone = TMS._cineTick > beatLen;
      sceneEnded = timelineEnded && beatDone;

      if (scene && TMS._cineBeat === 'closeup' && sceneEnded) {
        // §S260d: If background builder still running and we're at the end, hold here
        if (TMS._bgBuildRaf && TMS._cineSceneIdx >= TMS._cineStoryboard.length - 1) {
          TMS._cineTick = 0;
          TMS.viewerStatus('🚁 Composing flight path... ' + TMS._cineStoryboard.length + ' scenes');
        } else {
        TMS.restorePeeled();
        TMS._cineHeroSlowdown = false;
        if (scene) { delete scene._arcStart; delete scene._arcEnd; }
        TMS._cineCloseupCount++;
        TMS._cineTick = 0;
        TMS._cineSceneIdx++;
        // §S260f: Skip scenes whose construction is already done — jump to where action is
        while (TMS._cineSceneIdx < TMS._cineStoryboard.length - 1) {
          var _peek = TMS._cineStoryboard[TMS._cineSceneIdx];
          if (_peek.endTs && TMS._cursor >= _peek.endTs) {
            TMS._cineSceneIdx++;
          } else {
            break;
          }
        }

        // §S260f: No establishing beat — transit directly to next scene (no lingering)
        {
          TMS._cineBeat = 'transit';
          TMS._cineTransitFrom = app.camera.position.clone();
          var ns = TMS._cineStoryboard[TMS._cineSceneIdx];
          if (ns) {
            var nDist = ns.type === 'panoramic' ? TMS._PANORAMIC_DIST : ns.type === 'hero' ? TMS._HERO_DIST : TMS._FLYTHROUGH_DIST;
            TMS._cineTransitTo = new THREE.Vector3(
              ns.center.x + Math.cos(ns.angle) * nDist,
              ns.center.y + nDist * 0.5,
              ns.center.z + Math.sin(ns.angle) * nDist
            );
            TMS._cineNextTarget = ns.center;
          } else {
            TMS._cineTransitTo = app.camera.position.clone();
          }
          console.log('§CINE_BEAT transit → scene ' + TMS._cineSceneIdx + '/' + TMS._cineStoryboard.length);
        }
      } // else (not waiting for bg build)
      } // sceneEnded

      // ── CLOSEUP (flythrough or panoramic scene) ──
      // §S260c v2: Boost exposure during close-up for vivid materials
      if (app.renderer) {
        var targetExp = (TMS._cineBeat === 'closeup') ? 1.3 : 1.15;
        var curExp = app.renderer.toneMappingExposure;
        if (Math.abs(curExp - targetExp) > 0.01) {
          app.renderer.toneMappingExposure += (targetExp - curExp) * 0.08;
        }
      }
      // §S260e: OPENING — 10s establishing orbit, look-at starts at foundation (first scene)
      if (TMS._cineBeat === 'opening') {
        TMS._sunCycle = true;
        var openT = Math.min(1, TMS._cineTick / TMS._BEAT_OPENING);
        if (TMS._cineOpenStart && TMS._cineOpenTarget) {
          var openAz = openT * Math.PI; // 180° sweep
          var openOff = TMS._tmV2.subVectors(TMS._cineOpenStart, TMS._cineOpenTarget);
          var openR = Math.sqrt(openOff.x * openOff.x + openOff.z * openOff.z);
          var openBaseAz = Math.atan2(openOff.z, openOff.x);
          // §S260e: Look-at target — lerp from first scene (foundation) to building center
          // First scene is lowest Y after spatial sort = underground piling/footing
          var foundationY = (TMS._cineStoryboard.length > 0) ? TMS._cineStoryboard[0].center.y : TMS._cineOpenTarget.y;
          var lookY = foundationY + (TMS._cineOpenTarget.y - foundationY) * easeInOut(openT);
          // Camera Y — orbit at building-center height, looking DOWN at foundation initially
          var camY = TMS._cineOpenStart.y;
          app.camera.position.set(
            TMS._cineOpenTarget.x + Math.cos(openBaseAz + openAz) * openR,
            camY,
            TMS._cineOpenTarget.z + Math.sin(openBaseAz + openAz) * openR
          );
          target.set(TMS._cineOpenTarget.x, lookY, TMS._cineOpenTarget.z);
          if (TMS._cineTick % 25 === 0) {
            console.log('§CINE_OPEN_CAM t=' + openT.toFixed(2) + ' camY=' + camY.toFixed(1) +
              ' lookY=' + lookY.toFixed(1) + ' foundationY=' + foundationY.toFixed(1) +
              ' az=' + (openBaseAz + openAz).toFixed(2) + ' tick=' + TMS._cineTick + '/' + TMS._BEAT_OPENING);
          }
        }
        if (TMS._cineTick >= TMS._BEAT_OPENING) {
          // §S260e: Opening done — construction already playing, transition camera to first scene
          TMS._cineBeat = 'transit';
          TMS._cineTick = 0;
          TMS._cineSceneIdx = 0;
          TMS._cineTransitFrom = app.camera.position.clone();
          var firstSc = TMS._cineStoryboard[0];
          if (firstSc) {
            var fDist = firstSc.type === 'panoramic' ? TMS._PANORAMIC_DIST : TMS._FLYTHROUGH_DIST;
            TMS._cineTransitTo = new THREE.Vector3(
              firstSc.center.x + Math.cos(firstSc.angle || 0) * fDist * 2,
              firstSc.center.y + fDist * 0.7,
              firstSc.center.z + Math.sin(firstSc.angle || 0) * fDist * 2
            );
            TMS._cineNextTarget = firstSc.center;
            console.log('§CINE_OPENING_END → transit to scene 0 type=' + firstSc.type +
              ' y=' + firstSc.center.y.toFixed(1) + ' cls=' + (firstSc.cls || '?') +
              ' count=' + firstSc.count);
          } else {
            TMS._cineTransitTo = app.camera.position.clone();
          }
          console.log('§CINE_OPENING_END → transit to scene 0');
        }
      } else if (TMS._cineBeat === 'closeup') {
        var sc = TMS._cineStoryboard[TMS._cineSceneIdx];
        if (sc) {
          // §S260f: Blend scene center (stable) with frontier centroid (where action is)
          // 70% scene center + 30% frontier = smooth path biased toward action
          var _lookAt = sc.center;
          if (_frontierPositions.length > 0) {
            var _fx = 0, _fy = 0, _fz = 0;
            for (var fi = 0; fi < _frontierPositions.length; fi++) {
              _fx += _frontierPositions[fi].x; _fy += _frontierPositions[fi].y; _fz += _frontierPositions[fi].z;
            }
            var _fc = new THREE.Vector3(_fx / _frontierPositions.length, _fy / _frontierPositions.length, _fz / _frontierPositions.length);
            _lookAt = new THREE.Vector3(
              sc.center.x * 0.7 + _fc.x * 0.3,
              sc.center.y * 0.7 + _fc.y * 0.3,
              sc.center.z * 0.7 + _fc.z * 0.3);
          }
          TMS._cineNextTarget = _lookAt;
          var _userIdle = (nowPerf - TMS._camUserInteracted > 3000);
          if (!TMS._camTarget) TMS._camTarget = _lookAt.clone();
          if (_userIdle) {
            // §S260f: Slow lerp for smooth glide (0.08), not chasing (0.25)
            TMS._camTarget.x += (_lookAt.x - TMS._camTarget.x) * 0.08;
            TMS._camTarget.y += (_lookAt.y - TMS._camTarget.y) * 0.08;
            TMS._camTarget.z += (_lookAt.z - TMS._camTarget.z) * 0.08;

            target.x += (TMS._camTarget.x - target.x) * 0.06;
            target.y += (TMS._camTarget.y - target.y) * 0.06;
            target.z += (TMS._camTarget.z - target.z) * 0.06;

            var baseDist = sc.type === 'panoramic' ? TMS._PANORAMIC_DIST :
                           sc.type === 'hero' ? TMS._HERO_DIST : TMS._FLYTHROUGH_DIST;
            var desiredDist = baseDist + Math.min(20, (sc.count || 8) * 0.3);
            var camDist = app.camera.position.distanceTo(target);
            var minDist = desiredDist * 0.5;
            if (camDist < minDist) {
              TMS._tmV2.subVectors(app.camera.position, target).normalize();
              app.camera.position.copy(target).addScaledVector(TMS._tmV2, minDist);
              camDist = minDist;
            }
            var diff = camDist - desiredDist;
            if (Math.abs(diff) > 0.5) {
              var spd = diff > 0 ? 0.08 : 0.04;
              TMS._tmV2.subVectors(target, app.camera.position).normalize();
              app.camera.position.addScaledVector(TMS._tmV2, diff * spd);
            }
          }

          // Slow orbit
          if (TMS._playing && _userIdle) {
            var orbitSpd = sc.type === 'hero' ? (Math.PI * 2 / TMS._BEAT_CLOSEUP) : 0.006;
            TMS._camAngle += orbitSpd;
            TMS._tmV2.subVectors(app.camera.position, target);
            var dist2D = Math.sqrt(TMS._tmV2.x * TMS._tmV2.x + TMS._tmV2.z * TMS._tmV2.z);
            var curAz = Math.atan2(TMS._tmV2.z, TMS._tmV2.x);
            TMS._tmV2.x = Math.cos(curAz + orbitSpd) * dist2D;
            TMS._tmV2.z = Math.sin(curAz + orbitSpd) * dist2D;
            app.camera.position.copy(target).add(TMS._tmV2);
          }

          // Peel obstructions
          peelObstructions(app.camera.position, target);

          // Hero: slow time + outline
          if (sc.type === 'hero') {
            TMS._cineHeroSlowdown = true;
            app.scene.traverse(function(obj) {
              if (obj.userData && obj.userData.guid === sc.guids[0] && obj.isMesh) {
                applyOutline(obj, 0xff6600);
              }
            });
          }
          if (sc.type === 'panoramic') TMS._sunCycle = true;
        }

      // ── ESTABLISHING: wide pull-back, full building orbit, shadow sweep ──
      } else if (TMS._cineBeat === 'establishing') {
        TMS._sunCycle = true;
        var bldCenter = TMS._tmV2.set(0, 10, 0);
        if (app.buildingCentres && app.activeBuilding && app.buildingCentres[app.activeBuilding]) {
          var bc = app.buildingCentres[app.activeBuilding];
          var p = app.ifc2three(bc.ix, bc.iy, bc.iz);
          bldCenter.set(p.x, p.y, p.z);
        }

        // §S260d: Reverted to S260c establishing — pull back + orbit
        target.x += (bldCenter.x - target.x) * 0.04;
        target.y += (bldCenter.y - target.y) * 0.04;
        target.z += (bldCenter.z - target.z) * 0.04;

        var wideDesired = 80;
        var camDist = app.camera.position.distanceTo(target);
        if (camDist < wideDesired) {
          TMS._tmV3.subVectors(app.camera.position, target).normalize();
          app.camera.position.addScaledVector(TMS._tmV3, (wideDesired - camDist) * 0.04);
        }
        if (TMS._playing && (nowPerf - TMS._camUserInteracted > 2000)) {
          TMS._camAngle += 0.012;
          TMS._tmV3.subVectors(app.camera.position, target);
          var dist2D = Math.sqrt(TMS._tmV3.x * TMS._tmV3.x + TMS._tmV3.z * TMS._tmV3.z);
          var curAz = Math.atan2(TMS._tmV3.z, TMS._tmV3.x);
          TMS._tmV3.x = Math.cos(curAz + 0.012) * dist2D;
          TMS._tmV3.z = Math.sin(curAz + 0.012) * dist2D;
          app.camera.position.copy(target).add(TMS._tmV3);
        }

        if (TMS._cineTick > TMS._BEAT_ESTAB) {
          TMS._cineBeat = 'transit';
          TMS._cineTick = 0;
          TMS._cineTransitFrom = app.camera.position.clone();
          // Wrap storyboard if exhausted
          // §S260c v2: Don't wrap/loop — when storyboard exhausted, stay in establishing
          if (TMS._cineSceneIdx >= TMS._cineStoryboard.length) TMS._cineSceneIdx = TMS._cineStoryboard.length - 1;
          var ns = TMS._cineStoryboard[TMS._cineSceneIdx];
          if (ns) {
            var nDist = ns.type === 'panoramic' ? TMS._PANORAMIC_DIST : ns.type === 'hero' ? TMS._HERO_DIST : TMS._FLYTHROUGH_DIST;
            TMS._cineTransitTo = new THREE.Vector3(
              ns.center.x + Math.cos(ns.angle) * nDist,
              ns.center.y + nDist * 0.5,
              ns.center.z + Math.sin(ns.angle) * nDist
            );
            TMS._cineNextTarget = ns.center;
          } else {
            TMS._cineTransitTo = app.camera.position.clone();
            TMS._cineNextTarget = null;
          }
          console.log('§CINE_BEAT transit from establishing → scene ' + TMS._cineSceneIdx);
        }

      // ── TRANSIT: continuous crane shot — arc lift, never a jump cut ──
      } else if (TMS._cineBeat === 'transit') {
        TMS.restorePeeled(); // clear peeled meshes during travel
        var t = Math.min(1, TMS._cineTick / TMS._BEAT_TRANSIT);
        var et = easeInOut(t);

        var midLift = Math.sin(t * Math.PI) * 5;
        app.camera.position.lerpVectors(TMS._cineTransitFrom, TMS._cineTransitTo, et);
        app.camera.position.y += midLift;

        // S260c: smooth target convergence during transit
        if (TMS._cineNextTarget) {
          target.x += (TMS._cineNextTarget.x - target.x) * (et * 0.12 + 0.03);
          target.y += (TMS._cineNextTarget.y - target.y) * (et * 0.12 + 0.03);
          target.z += (TMS._cineNextTarget.z - target.z) * (et * 0.12 + 0.03);
        }

        if (t >= 1) {
          TMS._cineBeat = 'closeup';
          TMS._cineTick = 0;
          TMS._camTarget = TMS._cineNextTarget ? TMS._cineNextTarget.clone() : null;
          // §S260d: Lazy angle — raycast once on arrival (not during storyboard build)
          var arrScene = TMS._cineStoryboard[TMS._cineSceneIdx];
          if (arrScene && arrScene._angleLazy) {
            var lDist = arrScene.type === 'panoramic' ? TMS._PANORAMIC_DIST :
                        arrScene.type === 'hero' ? TMS._HERO_DIST : TMS._FLYTHROUGH_DIST;
            arrScene.angle = TMS.pickClearAngle(arrScene.center, lDist);
            delete arrScene._angleLazy;
            console.log('§LAZY_ANGLE scene=' + TMS._cineSceneIdx + ' angle=' + arrScene.angle.toFixed(2));
          }
          // §S260d: Arc system computes start/end on first closeup tick — no snap needed here
          console.log('§CINE_BEAT closeup — arrived at scene ' + TMS._cineSceneIdx +
            ' type=' + (arrScene ? arrScene.type : '?'));
        }
      }

      app.controls.update();

      // §CINE_DIRECTOR — log every 40 ticks
      TMS._camLogTick++;
      if (TMS._camLogTick >= 40) {
        TMS._camLogTick = 0;
        var scInfo = TMS._cineStoryboard[TMS._cineSceneIdx];
        var _cp = app.camera.position, _ct = app.controls.target;
        var _cd = _cp.distanceTo(_ct);
        console.log('§CINE_DIRECTOR beat=' + TMS._cineBeat + ' scene=' + TMS._cineSceneIdx + '/' +
          TMS._cineStoryboard.length + ' type=' + (scInfo ? scInfo.type : '?') +
          ' tick=' + TMS._cineTick + ' peeled=' + TMS._cinePeeled.length +
          ' cam=(' + _cp.x.toFixed(1) + ',' + _cp.y.toFixed(1) + ',' + _cp.z.toFixed(1) + ')' +
          ' tgt=(' + _ct.x.toFixed(1) + ',' + _ct.y.toFixed(1) + ',' + _ct.z.toFixed(1) + ')' +
          ' dist=' + _cd.toFixed(1));
      }
    }

    // §S260d: Distant particles REMOVED — PointsMaterial white square artifacts

    // §SFX seam (sfx.js): report frontier phases + a representative world centroid (→ stereo
    // pan) + progress/activity (→ the cinematic bed's two dials). No-op when audio off/absent.
    // most-active phase first (by element count) — stable dominant, not alphabetical flicker
    var _sfxArr = _sfxPhases ? Object.keys(_sfxPhases).sort(function (a, b) { return _sfxPhases[b] - _sfxPhases[a]; }) : [];
    // §CPE_ROOM_TITLE_COLLECTIVE: the dominant frontier phase, refreshed EVERY tick — null the
    // moment the frontier empties (construction complete), so the caption bracket can never
    // outlive the work it names. cpe_room_title.js reads this at draw time.
    var _appPh = (typeof TMS.A === 'function') ? TMS.A() : null;
    if (_appPh) _appPh.tmFrontierPhase = _sfxArr[0] || null;
    if (window.__sfxTM) {
      var _sfxCen = null;
      if (_frontierPositions.length) {
        var _sx = 0, _sy = 0, _sz = 0;
        for (var _spi = 0; _spi < _frontierPositions.length; _spi++) { _sx += _frontierPositions[_spi].x; _sy += _frontierPositions[_spi].y; _sz += _frontierPositions[_spi].z; }
        _sfxCen = { x: _sx / _frontierPositions.length, y: _sy / _frontierPositions.length, z: _sz / _frontierPositions.length };
      }
      var _sfxSpan = TMS._projectEnd - TMS._projectStart;
      var _sfxProg = _sfxSpan > 0 ? Math.max(0, Math.min(1, (TMS._cursor - TMS._projectStart) / _sfxSpan)) : 0;
      window.__sfxTM(_sfxArr, _sfxCen, { progress: _sfxProg, active: _frontierPositions.length });
      _sfxPhases = null;
    }

    // Implementing prompts/PHOTOREAL_STILL_RENDER.md §BILLBOARD_NAME_ELEMENT §5 —
    // Witness: W-BILLBOARD-NAME-ELEMENT V1/V2.
    // §TM_OVERLAY_SYNC seam — presentation overlays (the billboard artwork quad and the building
    // name-plate lettering in effects.js) are NOT elements: they carry no userData.guid, so the
    // traverse above never touches them and they render from frame 0 of a buildup, even at cursors
    // where the REAL element they sit on is hidden. Handing them the element's guid instead would
    // make two scene objects answer to one guid for picking/Find/BOM, and would run applyHighlight
    // (cyan/orange emissive at 0.85 opacity) over the artwork during its install window.
    // So: one O(1) feature-detected call, same shape and same place as the §SFX seam above. TM
    // hands over the visibility it has ALREADY computed for this tick — the overlay owner cannot
    // drift from the element because it is not re-deriving anything. Passing null (see deactivate)
    // means "TM is off, show your overlays".
    if (window.__tmOverlaySync) {
      try {
        window.__tmOverlaySync(function (g) {
          return !!placed[g] || !!frontier[g] || recent[g] !== undefined;
        });
      } catch (e) { /* an overlay owner must never be able to break the scrub */ }
    }

    applySunCycle(cursorMs);
    if (TMS._ganttVisible) TMS.drawGanttMini();
    if (TMS._dashVisible) TMS.drawDashboard();
    if (TMS._varVisible) TMS.drawVariance();   // §S1 — variance drawer tracks the scrub (hairline + phase-under-cursor)

    if (app.markDirty) app.markDirty();
    // Force immediate render — mobile browsers defer rAF until touch.
    // §TM_GI_RENDER (2026-07-17): honor the Alt+G N8AO composer here directly, in SINGLE-PASS mode.
    // Two facts force this exact shape: (1) TM's desktop render gate wakes, draws ONE frame, then
    // self-parks the rAF chain (main.js §S286 "§IDLE_GATE park — 0 frames"), so N8AO's temporal
    // accumulation (accumulate:true) can NEVER converge on a static-camera scrub — it's frozen at a
    // partial buffer, and whether firstFrame()'s clear won the race with the main loop's own composer
    // render decided clean-vs-ghost => the intermittent ghost the user saw. Single-pass AO
    // (accumulate=false) produces a COMPLETE frame in the one render the gate allows. (2) rendering
    // through the composer here (not raw) makes the AO frame deterministic in this call, not racing
    // the main loop. No-op unless Alt+G is already engaged. accumulate is restored to true in
    // deactivate() so a normal (non-TM) Alt+G keeps its converged-still quality.
    if (app._giComposer && app._giComposerActive) {
      TMS._giCancelConverge();   // §TM_GI_HOLD: this call IS motion (scrub/tick) — abandon any hold-polish
      if (app._giN8aoPass && app._giN8aoPass.configuration) app._giN8aoPass.configuration.accumulate = false;
      if (!renderAtTime._giLogged) { console.log('§TM_GI_RENDER Time Machine → Alt+G N8AO composer, single-pass (accumulate off)'); renderAtTime._giLogged = true; }
      app._giComposer.render();
      if (!TMS._playing) TMS._giScheduleHoldConverge(app);   // §TM_GI_HOLD: arm the 300ms "settled → polish" timer
    } else if (app.renderer && app.scene && app.camera) {
      app.renderer.render(app.scene, app.camera);
    }
    // §CPE_VF_BUILDUP_BLANK (2026-08-06) — user report: "B blank during BuildUp playback, only
    // shows when paused" (HANDOFF 2026-08-06 LATE, Item 1). renderAtTime() just painted the FULL
    // canvas with the MAIN camera, wiping out whatever B's own scissor sub-render
    // (cinema_path_editor.js _vfRender, installed as app._cpeViewfinderRender) drew on a prior
    // frame. B only got repainted afterward if main.js's animate() rAF loop happened to run again
    // and see _needsRender still true — during a povOnly BuildUp rehearsal that is a race against
    // cinema_path_editor.js's OWN independent rAF chain (_previewFly's step(), which calls
    // tmSetCursor -> renderAtTime every frame and so re-wins the race almost every tick). Confirmed
    // live: witness_cpe_vf_buildup_blank.js (scratchpad, not yet committed) measured B's render
    // count against §PERF_TRAVERSE tick count during a 5s povOnly+buildup rehearsal — HHS_Office_
    // Federated, ~75% coverage before this fix (occasional flicker of real content between long
    // stale/frozen stretches — matches the earlier HANDOFF's inconclusive pixel-readback samples),
    // 100%+ after. Calling the hook here — same call main.js's animate() already makes at both its
    // own render branches — repaints B immediately after every tick, unconditionally, removing the
    // race instead of hoping to win it. No-op (single property check) when B is off.
    if (app._cpeViewfinderRender) app._cpeViewfinderRender();
    TMS.updateStatus();
    _broadcastTimeline();   // §S3 — realtime cross-tab scrub + pinpoint the item the data is addressing
  }

  // ── §S3 (TM_4D5D_VARIANCE_LANE) — realtime cross-tab timeline broadcast + scene pinpoint ──
  // The 4D ALREADY EXISTS (injectGantt). This stage does NOT regenerate it — it BROADCASTS the scrub over the
  // shared Connect bus (same channel the modeller speaks) so sibling tabs/surfaces follow in lockstep, and it
  // PINPOINTS the element(s) the cursor is addressing at this instant (the frontier) — publishing them as a
  // selection (so an ERP tab lights the matching record) + a HUD callout that singles them out.
  var _applyingRemoteScrub = false;   // echo guard: don't re-publish a scrub we're applying from another surface
  var _lastTLms = 0;                   // throttle wall-clock (runtime only; never used by witnesses)
  // PURE: the guids "addressed by the data" at cursorMs = ops whose window straddles the cursor (being built now).
  // Falls back to the most-recently-finished op when nothing is mid-flight, so a parked cursor still pinpoints.
  function _frontierAt(cursorMs) {
    var live = [], lastDone = null;
    for (var i = 0; i < TMS._ops.length; i++) {
      var op = TMS._ops[i];
      if (op.start_ts > cursorMs) continue;
      var guid = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      if (!guid) continue;
      if (op.end_ts > cursorMs) live.push({ guid: guid, phase: (op.parameters || {}).phase || 'Architecture' });
      else if (!lastDone || op.end_ts > lastDone.end) lastDone = { guid: guid, phase: (op.parameters || {}).phase || 'Architecture', end: op.end_ts };
    }
    if (!live.length && lastDone) live.push({ guid: lastDone.guid, phase: lastDone.phase });
    return live;
  }
  function _broadcastTimeline() {
    var C = window.Connect;
    if (!TMS._ops.length) return;
    var frontier = _frontierAt(TMS._cursor);
    var guids = frontier.map(function (f) { return f.guid; });
    var lead = frontier.length ? frontier[0] : null;
    // HUD callout — single out the item(s) the data is addressing at this moment (always, even off-bus)
    _updatePinpoint(frontier);
    if (!C || !C.on || _applyingRemoteScrub) return;     // off-bus or echoing a remote scrub → no publish
    var now = (function () { try { return Date.now(); } catch (e) { return _lastTLms + 100; } })();
    if (now - _lastTLms < 80) return;                    // throttle the fan-out during playback/drag
    _lastTLms = now;
    var app = TMS.A(), span = TMS._projectEnd - TMS._projectStart;
    C.publish('timeline', { cursor: TMS._cursor, frac: span > 0 ? (TMS._cursor - TMS._projectStart) / span : 0,
      frontier: guids.slice(0, 40), lead: lead ? lead.guid : null, phase: lead ? lead.phase : null,
      building: (app && app.activeBuilding) || null, surface: 'viewer' });
    // pinpoint cross-surface: publish the lead addressed element as a selection (ERP/sibling lights its record)
    if (lead) C.publish('selection', { guid: lead.guid, ifcClass: null, surface: 'viewer' });
    console.log('§TM_BROADCAST cursor=' + Math.round(TMS._cursor) + ' frontier=' + guids.length + ' lead=' + String(lead && lead.guid).slice(0, 10) + ' phase=' + (lead ? lead.phase : '-'));
  }
  // inbound scrub from a sibling viewer tab (same building) → move our cursor to match, echo-guarded.
  function _applyRemoteTimeline(t) {
    if (!t || t.surface !== 'viewer' || !TMS._active || !TMS._ops.length) return;
    var app = TMS.A();
    if (t.building && app && app.activeBuilding && t.building !== app.activeBuilding) return;  // different model
    var span = TMS._projectEnd - TMS._projectStart;
    var c = (typeof t.cursor === 'number') ? t.cursor : (typeof t.frac === 'number' ? TMS._projectStart + t.frac * span : null);
    if (c == null) return;
    _applyingRemoteScrub = true;
    try { renderAtTime(Math.max(TMS._projectStart, Math.min(TMS._projectEnd, c))); try { TMS.anchorFromCursor(); TMS.configSlider(); } catch (e) {} }
    finally { _applyingRemoteScrub = false; }
    console.log('§TM_TL_IN cursor=' + Math.round(TMS._cursor) + ' from=' + (t.surface || '?'));
  }
  // HUD callout that names the addressed item(s) — created lazily, sits above the TM panel.
  function _updatePinpoint(frontier) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var el = document.getElementById('tm-pinpoint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tm-pinpoint';
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:128px;z-index:16;background:rgba(8,16,40,0.78);' +
        'border:1px solid #4fc3f7;border-radius:14px;padding:4px 12px;font-size:12px;color:#e8f4ff;pointer-events:none;' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);white-space:nowrap;display:none';
      document.body.appendChild(el);
    }
    if (!TMS._active || !frontier || !frontier.length) { el.style.display = 'none'; return; }
    var byPhase = {}; frontier.forEach(function (f) { byPhase[f.phase] = (byPhase[f.phase] || 0) + 1; });
    var ph = Object.keys(byPhase).sort(function (a, b) { return byPhase[b] - byPhase[a]; })[0];
    el.innerHTML = '<span style="color:#4fc3f7">' + _L('tm_now_building', '⊕ Now building') + '</span> · ' + frontier.length + ' ' +
      (frontier.length > 1 ? _L('tm_items', 'items') : _L('tm_item', 'item')) + ' · <b>' + ph + '</b>';
    el.style.display = 'block';
  }

  // ── §S260c: Outline effect — wireframe edge overlay on mesh ──
  // Adds EdgesGeometry LineSegments as a child. Preserves original material.
  // Reusable by TM frontier, picking, clash, etc.
  var _outlineMeshes = []; // tracked for bulk cleanup

  var _highlightLogTick = 0; // throttle §HIGHLIGHT_APPLY logging
  var _wbLogCount = 0;       // §S260d: whitebox material log counter (persists across ticks)
  function applyOutline(obj, color) {
    if (!obj.isMesh || !obj.geometry) return;
    if (obj._tm_outline) return; // already has outline
    if (_highlightLogTick++ % 50 === 0) console.log('§HIGHLIGHT_APPLY type=outline guid=' + (obj.userData && obj.userData.guid) + ' color=0x' + (color || 0xff8c00).toString(16));
    try {
      var edges = new THREE.EdgesGeometry(obj.geometry, 30); // 30° threshold
      var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: color || 0xff8c00, linewidth: 2, depthTest: true
      }));
      line.renderOrder = 1;
      line.userData._isOutline = true;
      obj.add(line);
      obj._tm_outline = line;
      _outlineMeshes.push(obj);
    } catch(e) {} // EdgesGeometry can fail on degenerate geometry
  }

  function removeOutline(obj) {
    if (!obj._tm_outline) return;
    obj.remove(obj._tm_outline);
    obj._tm_outline.geometry.dispose();
    obj._tm_outline.material.dispose();
    delete obj._tm_outline;
  }

  function clearAllOutlines() {
    for (var i = _outlineMeshes.length - 1; i >= 0; i--) {
      var om = _outlineMeshes[i];
      // §S260e: Frontier bbox glow lines are standalone scene children (not mesh children)
      if (om.userData && om.userData._isTmFrontier) {
        if (om.parent) om.parent.remove(om);
        // geometry + material are shared — just remove from scene, don't dispose
        continue;
      }
      removeOutline(om);
    }
    _outlineMeshes = [];
  }

  function applyHighlight(obj, color, opacity, emissiveI) {
    color = color || 0xff8c00;
    opacity = opacity || 0.9;
    emissiveI = emissiveI || 0.25;
    if (!obj._tm_highlighted && _highlightLogTick++ % 50 === 0) console.log('§HIGHLIGHT_APPLY type=highlight guid=' + (obj.userData && obj.userData.guid) + ' color=0x' + color.toString(16) + ' opacity=' + opacity);
    if (!obj._tm_highlighted) {
      obj._tm_origMaterial = obj.material;
      obj.material = obj.material.clone();
      obj._tm_highlighted = true;
      TMS._highlightMeshes.push(obj);
    }
    var mat = obj.material;
    // §S260e: Emissive glow + depthTest:false — shines through ground for underground elements
    if (mat.emissive) { mat.emissive.setHex(color); mat.emissiveIntensity = emissiveI; }
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthTest = false;
    mat.needsUpdate = true;
    obj.renderOrder = 10;
    // §S260d: whitebox — log AFTER material modification to catch over-bright
    if (_highlightLogTick % 100 === 0) {
      var _hC = mat.color; var _hE = mat.emissive;
      var _hBright = _hC && (_hC.r > 0.9 && _hC.g > 0.9 && _hC.b > 0.9);
      var _hEmB = _hE && mat.emissiveIntensity > 0.3 && (_hE.r + _hE.g + _hE.b) > 0;
      console.log('§WB_HIGHLIGHT_AFTER guid=' + (obj.userData && obj.userData.guid || '?').substring(0,12) +
        ' type=' + (mat.type || '?') +
        ' rgb=' + (_hC ? _hC.r.toFixed(2)+','+_hC.g.toFixed(2)+','+_hC.b.toFixed(2) : '?') +
        ' em=' + (_hE ? _hE.r.toFixed(2)+','+_hE.g.toFixed(2)+','+_hE.b.toFixed(2) : '?') +
        ' eI=' + (mat.emissiveIntensity||0).toFixed(2) + ' op=' + mat.opacity.toFixed(2) +
        (_hBright ? ' ⚠WHITE' : '') + (_hEmB ? ' ⚠EMISSIVE' : ''));
    }
  }

  // Flash: brief arrival glow — subtle, not blinding
  function applyFlash(obj, color) {
    if (!obj._tm_highlighted && _highlightLogTick++ % 50 === 0) console.log('§HIGHLIGHT_APPLY type=flash guid=' + (obj.userData && obj.userData.guid) + ' color=0x' + (color || 0).toString(16));
    if (!obj._tm_highlighted) {
      obj._tm_origMaterial = obj.material;
      obj.material = obj.material.clone();
      obj._tm_highlighted = true;
      TMS._highlightMeshes.push(obj);
    }
    var mat = obj.material;
    // §S260d: Capped emissive — 0.15 prevents white flash on light materials
    if (mat.emissive) { mat.emissive.setHex(color); mat.emissiveIntensity = 0.15; }
    mat.transparent = false;
    mat.opacity = 1.0;
    mat.depthTest = true;
    mat.needsUpdate = true;
  }

  function restoreMaterial(obj) {
    if (!obj._tm_highlighted) return;
    // Restore original material reference — no leftover color contamination
    if (obj._tm_origMaterial) {
      obj.material.dispose(); // free cloned material
      obj.material = obj._tm_origMaterial;
      delete obj._tm_origMaterial;
    }
    obj.renderOrder = 0;
    obj._tm_highlighted = false;
  }

  function clearHighlight(force) {
    // §Z_STACK_XRAY_STAGING: this runs at the TOP of every renderAtTime tick (§S260c "restore
    // previously highlighted meshes to solid"), which is correct for the transient frontier glow
    // (~a handful of elements at a time, per §CREW-CAP) but would be an O(staged-population)
    // clone+dispose CYCLE every tick if it also swept a large, SUSTAINED staged population — the
    // exact per-tick cost W-XRAY-4 exists to keep bounded. _tm_xrayStaged objects are left alone
    // here; renderAtTime's own showReal branch restores them explicitly, exactly once, on the tick
    // they actually resolve (or scrub behind their own reveal) — see the _tm_xrayStaged checks there.
    // §TM_CLOSE_RESTORE (2026-08-04): that per-tick skip must NOT apply when TM itself is being
    // switched off — deactivate()'s restoreVisibility() passes force=true so a still-staged (ghosted,
    // grey/0.3-opacity) element does not survive TM closing. Same "nothing may survive TM being
    // switched off" convention this file already applies to _gspClear/_tmXraySolidifyTs/etc.
    var keep = [];
    for (var i = 0; i < TMS._highlightMeshes.length; i++) {
      var hm = TMS._highlightMeshes[i];
      if (!force && hm._tm_xrayStaged) { keep.push(hm); continue; }
      hm._tm_xrayStaged = false;
      restoreMaterial(hm);
    }
    TMS._highlightMeshes = keep;
    clearAllOutlines(); // §S260c: also remove wireframe outlines
  }

  // ── Day/night — smooth sky + lighting, no shadow plumbing ──
  var _savedClearColor = null;
  var _savedLighting = null;  // §S277b: save full lighting state on TM entry

  // Smooth color lerp between two hex colors
  function lerpColor(a, b, t) {
    var ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    var br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  function applySunCycle(cursorMs) {
    if (!TMS._sunCycle) return;
    var app = TMS.A();
    if (!app || !app.sun) return;

    // §S276b: Show Sky shader during sun cycle
    if (app._sky && !app._sky.visible) app._sky.visible = true;
    app._sunCycleActive = true;

    // §S277b: Save full lighting state once on TM entry — restore on exit
    if (_savedLighting === null) {
      _savedLighting = {
        clearColor: app.renderer ? app.renderer.getClearColor(TMS._tmColor).getHex() : 0x1a1a2e,
        sunI: app.sun.intensity,
        ambI: app.ambient ? app.ambient.intensity : 0.785,
        hemiI: app.hemi ? app.hemi.intensity : 1.257,
        exposure: app.renderer ? app.renderer.toneMappingExposure : 0.45
      };
      console.log('§TM_SAVE_LIGHTING sunI=' + _savedLighting.sunI.toFixed(2) +
        ' ambI=' + _savedLighting.ambI.toFixed(2) + ' hemiI=' + _savedLighting.hemiI.toFixed(2) +
        ' exposure=' + _savedLighting.exposure.toFixed(2));
    }
    // Save original sky color once (legacy compat)
    if (_savedClearColor === null && app.renderer) {
      _savedClearColor = app.renderer.getClearColor(TMS._tmColor).getHex();
    }

    var h = new Date(cursorMs).getHours();
    var m = new Date(cursorMs).getMinutes();
    var t = h + m / 60; // 0-24 fractional hour

    // Sun arc: smooth sine curve
    var angle = (t / 24) * Math.PI * 2 - Math.PI / 2;
    var elevation = Math.sin(angle); // -1 midnight, +1 noon
    var azimuth = Math.cos(angle);
    var dayFactor = Math.max(0, elevation); // 0 at night, 1 at noon

    // §S276b: Sun position moves every tick (shadows follow smoothly).
    // Sky shader visual update throttled to every 10th tick (avoids rapid sky flicker).
    var elDeg = elevation * 90;
    TMS._lastElDeg = elDeg;  // §S277b: expose for adaptive TICK_MS
    var azDeg = (azimuth * 0.5 + 0.5) * 360;
    // Always move sun — shadows must track every tick
    var phi = (90 - elDeg) * Math.PI / 180;
    var theta = azDeg * Math.PI / 180;
    var sx = Math.sin(phi) * Math.cos(theta);
    var sy = Math.cos(phi);
    var sz = Math.sin(phi) * Math.sin(theta);
    // §S276b: Position sun relative to building center (not origin) for shadow coverage
    var _ctr = app.controls ? app.controls.target : { x: 0, y: 0, z: 0 };
    var _env = 300;
    var _bc = Object.values(app.buildingCentres || {})[0];
    if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
    app.sun.position.set(_ctr.x + sx * _env * 2, Math.max(sy * _env * 2, 10), _ctr.z + sz * _env * 2);
    app.sun.target.position.copy(_ctr);
    app.sun.target.updateMatrixWorld();
    app.sun.updateMatrixWorld();
    if (app.sun.shadow && app.sun.shadow.camera) {
      app.sun.shadow.camera.updateProjectionMatrix();
      app.sun.shadow.camera.updateMatrixWorld();
    }
    if (app.renderer && app.renderer.shadowMap) app.renderer.shadowMap.needsUpdate = true;
    // §S276b: Sky shader visual — update every tick near horizon (dawn/dusk fade),
    // throttle to every 5th tick during midday/midnight (less visual change).
    if (!applySunCycle._count) applySunCycle._count = 0;
    applySunCycle._count++;
    // §S276b: Sky transitions — Preetham for day/dusk/dawn, starfield for night.
    var _nearHorizon = Math.abs(elDeg) < 25;
    var _skyInterval = _nearHorizon ? 1 : 3;
    // §S276b: Sky always visible — Preetham goes dark naturally at low sun, no flash.
    if (app._sky && applySunCycle._count % _skyInterval === 0) {
      app._sky.visible = true;
      // Clamp sun slightly below horizon — Preetham darkens to deep blue/purple
      var _clampedSy = Math.max(sy, -0.08);
      app._sky.material.uniforms['sunPosition'].value.set(sx, _clampedSy, sz);
      // Richer dusk/dawn: boost turbidity + rayleigh near horizon
      app._sky.material.uniforms['turbidity'].value = elDeg < 10 ? 8 : 4;
      app._sky.material.uniforms['rayleigh'].value = elDeg < 10 ? 4 : 2;
    }
    // §S276b: Night starfield — appears when sun is well below horizon
    if (elDeg <= -15 && !app._nightStars) {
      var _starGeo = new THREE.BufferGeometry();
      var _starPos = new Float32Array(600 * 3);  // 600 stars
      for (var si = 0; si < 600; si++) {
        // Random positions on a large sphere
        var _sth = Math.random() * Math.PI * 2;
        var _sph = Math.acos(2 * Math.random() - 1);
        var _sr = 40000;
        _starPos[si * 3]     = _sr * Math.sin(_sph) * Math.cos(_sth);
        _starPos[si * 3 + 1] = Math.abs(_sr * Math.cos(_sph));  // upper hemisphere only
        _starPos[si * 3 + 2] = _sr * Math.sin(_sph) * Math.sin(_sth);
      }
      _starGeo.setAttribute('position', new THREE.BufferAttribute(_starPos, 3));
      var _starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 30, sizeAttenuation: true });
      app._nightStars = new THREE.Points(_starGeo, _starMat);
      app._nightStars.userData.isTmEffect = true;
      app.scene.add(app._nightStars);
      // Moon — simple bright sphere
      var _moonGeo = new THREE.SphereGeometry(200, 16, 16);
      var _moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeedd });
      app._moon = new THREE.Mesh(_moonGeo, _moonMat);
      app._moon.position.set(15000, 25000, -10000);
      app._moon.userData.isTmEffect = true;
      app.scene.add(app._moon);
      // Dim ambient for moonlight feel
      console.log('§TM_NIGHT stars=600 moon=1');
    }
    if (elDeg > -10 && app._nightStars) {
      // Dawn — remove stars and moon
      app.scene.remove(app._nightStars);
      app._nightStars.geometry.dispose();
      app._nightStars.material.dispose();
      app._nightStars = null;
      if (app._moon) {
        app.scene.remove(app._moon);
        app._moon.geometry.dispose();
        app._moon.material.dispose();
        app._moon = null;
      }
      console.log('§TM_DAWN stars removed');
    }

    // Smooth lighting — intensity follows day/night
    app.sun.intensity = 0.05 + dayFactor * 4.4;
    if (app.ambient) app.ambient.intensity = 0.15 + dayFactor * 0.6;
    if (app.hemi) app.hemi.intensity = 0.1 + dayFactor * 1.1;
    // §S277c: Fog color follows sun cycle — dark at night, warm at dawn/dusk, light blue at day
    if (app.scene && app.scene.fog) {
      var fogT = Math.max(0, Math.min(1, (elDeg + 10) / 55));
      // Dawn/dusk: warm orange tint when near horizon
      var warmT = (Math.abs(elDeg) < 15) ? (1 - Math.abs(elDeg) / 15) * 0.3 : 0;
      app.scene.fog.color.setRGB(0.10 + fogT * 0.55 + warmT, 0.10 + fogT * 0.55, 0.18 + fogT * 0.50);
    }

    // §S277f: Lensflare — track sun position directly (don't call updateSky, it conflicts with TM sun)
    if (app._lensflare) {
      var _lfSunPos = app.sun.position;
      app._lensflare.position.copy(_lfSunPos);
      if (app._lensflare.userData._halo) app._lensflare.userData._halo.position.copy(_lfSunPos);
      var _lfSunDir = TMS._tmV2.copy(_lfSunPos).sub(app.camera.position).normalize();
      app.camera.getWorldDirection(TMS._tmV3);
      var _lfDot = _lfSunDir.dot(TMS._tmV3);
      var _lfAbove = _lfSunPos.y > 50;
      var _lfShow = _lfAbove && _lfDot > 0.3 && dayFactor > 0.1;
      var _lfElev = Math.max(0, Math.min(1, _lfSunPos.y / (_env * 2)));
      var _lfI = _lfShow ? (1 - _lfElev * 0.6) * Math.max(0, (_lfDot - 0.3) / 0.7) : 0;
      app._lensflare.material.opacity = _lfI * 0.9;
      app._lensflare.visible = _lfI > 0.01;
      if (app._lensflare.userData._halo) {
        app._lensflare.userData._halo.material.opacity = _lfI * 0.4;
        app._lensflare.userData._halo.visible = app._lensflare.visible;
      }
    }

    // §S277b/§TM-NIGHT-TONE: Night floodlight — warm emissive on cached materials (not scene traverse).
    // _matCache has ~100-150 entries vs 122K scene objects. Zero freeze.
    // FIX (W-TM-NIGHT-TONE): was 0xffaa44@0.2 on ALL matCache → whole building self-lit brown,
    // burying moonlight and killing natural night. Now glow ONLY lit sources (fixtures/windows);
    // walls/floors stay dark. Soft peach 0xffe4b5 matches Night mode (tools.js toggleNightMode).
    // matCache key is 'rgba|IfcClass' — match class via key suffix, same as toggleNightMode.
    var _tmGlowClasses = ['IfcLightFixture', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcWindow'];
    if (elDeg <= -15 && !app._tmBloomActive) {
      app._tmBloomActive = true;
      var _bloomCount = 0, _bloomSkip = 0;
      var _mc = app._matCache || {};
      for (var _mk in _mc) {
        var _mm = _mc[_mk];
        if (!_mm || !_mm.emissive || _mm.userData._origEmissive !== undefined) continue;
        var _isLit = false;
        for (var _gi = 0; _gi < _tmGlowClasses.length; _gi++) {
          if (_mk.indexOf(_tmGlowClasses[_gi]) >= 0) { _isLit = true; break; }
        }
        if (!_isLit) { _bloomSkip++; continue; }   // surface material — stays dark
        _mm.userData._origEmissive = _mm.emissive.getHex();
        _mm.userData._origEmissiveI = _mm.emissiveIntensity || 0;
        _mm.emissive.setHex(0xffe4b5);    // soft peach, not brown 0xffaa44
        _mm.emissiveIntensity = 0.2;
        _mm.needsUpdate = true;
        _bloomCount++;
      }
      console.log('§TM_BLOOM_ON lit=' + _bloomCount + ' darkSurfaces=' + _bloomSkip + ' color=0xffe4b5');
    }
    if (elDeg > -10 && app._tmBloomActive) {
      var _mc2 = app._matCache || {};
      for (var _mk2 in _mc2) {
        var _mm2 = _mc2[_mk2];
        if (!_mm2 || _mm2.userData._origEmissive === undefined) continue;
        _mm2.emissive.setHex(_mm2.userData._origEmissive);
        _mm2.emissiveIntensity = _mm2.userData._origEmissiveI;
        delete _mm2.userData._origEmissive;
        delete _mm2.userData._origEmissiveI;
        _mm2.needsUpdate = true;
      }
      app._tmBloomActive = false;
      console.log('§TM_BLOOM_OFF');
    }
  }

  function restoreSky() {
    var app = TMS.A();
    if (!app) return;
    // §S277b: Full lighting restore — sun/ambient/hemi/exposure back to pre-TM values
    app._sunCycleActive = false;
    if (app._sky && !app._shadowOn) app._sky.visible = false;  // keep sky if shadows still on
    // §S277f: Hide lensflare
    if (app._lensflare) { app._lensflare.visible = false; if (app._lensflare.userData._halo) app._lensflare.userData._halo.visible = false; }
    // §S277b: Clear bloom emissive via matCache (not scene traverse — avoids 122K freeze)
    if (app._tmBloomActive) {
      var _rmc = app._matCache || {};
      for (var _rmk in _rmc) {
        var _rmm = _rmc[_rmk];
        if (!_rmm || _rmm.userData._origEmissive === undefined) continue;
        _rmm.emissive.setHex(_rmm.userData._origEmissive);
        _rmm.emissiveIntensity = _rmm.userData._origEmissiveI;
        delete _rmm.userData._origEmissive;
        delete _rmm.userData._origEmissiveI;
        _rmm.needsUpdate = true;
      }
      app._tmBloomActive = false;
    }
    if (app.updateSky) app.updateSky(45, 180);
    if (_savedLighting) {
      app.sun.intensity = _savedLighting.sunI;
      if (app.ambient) app.ambient.intensity = _savedLighting.ambI;
      if (app.hemi) app.hemi.intensity = _savedLighting.hemiI;
      if (app.renderer) {
        app.renderer.toneMappingExposure = _savedLighting.exposure;
        app.renderer.setClearColor(_savedLighting.clearColor);
      }
      console.log('§TM_RESTORE_LIGHTING sunI=' + _savedLighting.sunI.toFixed(2) +
        ' ambI=' + _savedLighting.ambI.toFixed(2) + ' hemiI=' + _savedLighting.hemiI.toFixed(2) +
        ' exposure=' + _savedLighting.exposure.toFixed(2));
      _savedLighting = null;
    } else if (app.renderer && _savedClearColor !== null) {
      app.renderer.setClearColor(_savedClearColor);
    }
    _savedClearColor = null;
    // §S277b: Remove night stars/moon if still present
    if (app._nightStars) {
      app.scene.remove(app._nightStars);
      app._nightStars.geometry.dispose();
      app._nightStars.material.dispose();
      app._nightStars = null;
    }
    if (app._moon) {
      app.scene.remove(app._moon);
      app._moon.geometry.dispose();
      app._moon.material.dispose();
      app._moon = null;
    }
  }
};
