// cinema_maxq family — part `start` (original cinema_maxq.js lines 2565–5341).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cinema_maxq.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as MQS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts = (typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts.start = function* __split_cinema_maxq_start(MQS) {
  'use strict';
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  async function start(opts) {
    var A = window.APP;
    opts = opts || {};
    if (MQS._active) { MQS._cancel = true; console.log('§MAXQ_CANCEL requested'); return; }
    if (!A || !A.camera || !A.controls || typeof A.startStillRefine !== 'function' ||
        typeof A.stopStillRefine !== 'function' || !A._composer) {
      console.warn('§MAXQ_FAIL prerequisites missing (mobile, or effects not initialised yet)');
      return;
    }
    if (A._stillRefineActive || A._stillRefineBusy) A.stopStillRefine(true);
    // §CINEMA_GHOST_RESET (2026-07-21, broadened): the ghost bbox shell can be on either because a
    // Find-panel lens auto-engaged it OR because the user manually cycled Alt+Z to Bbox mode
    // (tools.js `cycleXrayBboxMode`) — neither case was ever cleared before starting the orbit, so
    // a cinematic film could show the wireframe shell for its whole duration. See navigate_find.js
    // §CINEMA_GHOST_RESET (keys off visibility, not just auto-ownership).
    if (typeof A.resetCinemaGhostLens === 'function') A.resetCinemaGhostLens();
    // Same problem, same fix, for X-Ray: the SAME Alt+Z cycle can leave X-Ray engaged (transparent
    // geometry) instead of Bbox — equally wrong for a "photoreal" cinematic film, however it got on.
    if (A.xrayOn && typeof A.toggleXray === 'function') {
      A.toggleXray();
      console.log('§CINEMA_XRAY_RESET x-ray was on, turned off before orbit');
    }
    var nFrames = opts.frames || MQS.MAXQ_N_FRAMES, fps = opts.fps || MQS.MAXQ_FPS;
    // §DATUM_DECOUPLE (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §53) — bisect-only mode. When set,
    // _captureFrame skips its own GPU render and every OTHER 2D overlay (already baked into the source
    // clip) and draws only the datum layer on top of a pre-extracted clean frame. Reset every run so a
    // stale flag from a prior burn-in bake can never leak into a normal one.
    A._burninDatumDir = opts.burninDatumDir || null;
    if (A._burninDatumDir) console.log('§DATUM_DECOUPLE dir=' + A._burninDatumDir + ' — skipping GPU render + every non-datum overlay this run');
    MQS._active = true; MQS._cancel = false;
    // §MAXQ_HIDDEN_PAUSE / §MAXQ_QUALITY counters are per-RUN, not per-session — a second bake must
    // not inherit the first one's pauses or its unconverged count and report someone else's health.
    MQS._hiddenMsTotal = 0; MQS._hiddenPauses = 0; MQS._unconverged = 0;
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    A._lampsSum = null;   // W3(C) — fresh lamp census per film
    A._resPanelFrames = 0;   // W7
    A._filmLogCompact = /[?&]filmlog=compact\b/.test(location.search);   // W6
    MQS._filmRecInstall();   // W6 §F
    // §MAXQ_FRAME_BUDGET — the bake's still fold, cheaper than Alt+S's. Cleared on every exit path
    // below (_bakeBudgetRelease), so a still after a bake is never quietly degraded.
    // LARGE_DB_BAKE.md §2 L3 — the delivery budget (8/12) is the single biggest wall-time knob on a
    // large building (~1.7s of every LTU/Hospital frame is these re-renders) but was not reachable
    // from the CLI. opts.stillBudget (cli_silent_bake.js's --still-budget taa,ao) overrides it for a
    // quick-check bake; no flag on the CLI is byte-identical to before this change.
    var _sb = (opts.stillBudget && opts.stillBudget.taa != null && opts.stillBudget.ao != null)
      ? opts.stillBudget : MQS.MAXQ_STILL_BUDGET;
    A._stillBudget = { taa: _sb.taa, ao: _sb.ao };
    console.log('§MAXQ_FRAME_BUDGET taa=' + A._stillBudget.taa + ' ao=' + A._stillBudget.ao +
      ' renders/frame=' + (A._stillBudget.taa + A._stillBudget.ao) + ' (was 16+24=40) — bake only,' +
      ' Alt+S stills keep the full fold' + (_sb !== MQS.MAXQ_STILL_BUDGET ? ' (CLI override)' : ''));
    MQS._wakeAcquire();
    MQS._dampHold();   // §CINEMA_DAMPING_BLEED — the preview and the bake are both authored cameras
    // §MAXQ_STREAM_FIRST (user report, LTU_AHouse/122k: preview was SEEN showing boxes — initial
    // assumption was that this was a deliberate LOD-for-speed choice. WRONG, disproven by
    // investigation: dlod_nav.js already fully disengages the instant A._maxqActive is set above,
    // every frame, so DLOD/box-proxy cannot be the source — cinema_maxq.js had zero references to
    // A.streaming. The boxes were the geometry-streaming pipeline's own unpromoted-element
    // placeholders bleeding through because nothing waited for them. Same fix as tour.js's
    // §FLY_STREAM_WAIT, reused not reinvented: wait for streaming to fully drain BEFORE the preview
    // even starts, so neither the preview nor the bake ever shows a placeholder — a mid-clip switch
    // would still visibly pop in the baked video, waiting first avoids that entirely.
    // Post-fix result, load-bearing for FLY_TOUR_DLOD_SCALE.md: the preview now renders 100% real
    // geometry — zero DLOD, zero boxes, confirmed disengaged above — across the same dive→orbit
    // path plan tour.js's Fly Tour uses (shared A.cinemaPathPlan, effects.js), at a LARGER radius
    // (envelope×2.5 here vs tour.js's measured r=255) — and runs smooth. Full real geometry at a
    // wide-orbit distance is therefore not inherently expensive; whatever makes Fly Tour lag is not
    // simply "too much real geometry in view at range."
    var _streamWaitedMs = 0;
    while (A.streaming && !MQS._cancel) {
      MQS._status('🎬 Waiting for geometry to finish streaming…');
      await new Promise(function(r) { setTimeout(r, 500); });
      _streamWaitedMs += 500;
    }
    if (_streamWaitedMs) console.log('§MAXQ_STREAM_WAIT ms=' + _streamWaitedMs);
    if (MQS._cancel) {
      console.log('§MAXQ_CANCEL during stream-wait — nothing baked, nothing saved');
      MQS._status('🎬 MaxQ cancelled');
      MQS._active = false; MQS._cancel = false; A._maxqActive = false;
      MQS._wakeRelease(); MQS._dampRelease(); MQS._bakeBudgetRelease();
      return;
    }
    // §ZONE_BOX_TRUE (ALTC_FOUNDATION §1, 2026-10-03, read-only, &zonebox=1): light_zones.js build() bounds a BatchedMesh slot by
    // the WHOLE batch geometry's box (d.geo.boundingBox x slot matrix). Re-walk the same boundary population the same way ("built")
    // beside each slot's own getBoundingBoxAt ("true") to size that error. Kept OUT of light_zones.js: its code hash is the zone
    // cache key (SRC), so any edit there would invalidate every shipped .lightfield.bin sidecar. Class list = light_zones.js BOUNDARY.
    if (/[?&]zonebox=1\b/.test(location.search)) try {
      var _BND = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcRoof', 'IfcCovering', 'IfcDoor', 'IfcWindow', 'IfcCurtainWall', 'IfcPlate'];
      var _gs = new Set(); A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class IN ('" + _BND.join("','") + "')").forEach(function (r) { _gs.add(r[0]); });
      var _bB = new THREE.Box3(), _bT = new THREE.Box3(), _sb = new THREE.Box3(), _m = new THREE.Matrix4(), _nb = 0, _nNo = 0, _nm = 0, _cls = new Set(_BND);
      A.scene.traverse(function (o) {
        if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.geometry) return;
        if (o === A.ground || o === A._sky || (o.userData && (o.userData.skyPortal || o.userData.excludeFromShadow))) return;
        o.updateMatrixWorld(); var g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        if (o.isBatchedMesh) {
          var n = (typeof o.instanceCount === 'number') ? o.instanceCount : (o._instanceInfo ? o._instanceInfo.length : 0);
          for (var i = 0; i < n; i++) { var gd = A.guidMap[o.id + '_' + i]; if (!gd || !_gs.has(gd)) continue;
            var gid; try { gid = o.getGeometryIdAt(i); if (!o.getGeometryRangeAt(gid)) continue; } catch (e) { continue; }
            o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld); _nb++;
            _bB.union(_sb.copy(g.boundingBox).applyMatrix4(_m));
            if (o.getBoundingBoxAt(gid, _sb)) _bT.union(_sb.applyMatrix4(_m)); else _nNo++; }
          return; }
        if (!_cls.has(o.userData && o.userData.ifcClass)) return;
        var add = function (mw) { _sb.copy(g.boundingBox).applyMatrix4(mw); _bB.union(_sb); _bT.union(_sb); _nm++; };
        if (o.isInstancedMesh) { for (var k = 0; k < o.count; k++) { o.getMatrixAt(k, _m); if (_m.elements[0] === 0 && _m.elements[5] === 0 && _m.elements[10] === 0) continue; _m.premultiply(o.matrixWorld); add(_m); } }
        else add(o.matrixWorld);
      });
      var _r3 = function (b) { return b.isEmpty() ? 'EMPTY' : [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(function (v) { return v.toFixed(2); }).join(','); };
      var _sB = _bB.getSize(new THREE.Vector3()), _sT = _bT.getSize(new THREE.Vector3()), _C = 0.5;   // CELL = light_zones.js CELL
      var _xc = function (a, b) { return Math.ceil((a + _C * 4) / _C) - Math.ceil((b + _C * 4) / _C); };
      var _Z = window.LightZones && window.LightZones.get && window.LightZones.get(), _fp = _Z && _Z.fp ? _Z.fp.split('|').slice(5, 11).join(',') : 'n/a';
      console.log('§ZONE_BOX_TRUE bld=' + A.activeBuilding + ' built=' + _r3(_bB) + ' true=' + _r3(_bT) + ' storedFpBox=' + _fp +
        ' growM=' + (_sB.x - _sT.x).toFixed(2) + ',' + (_sB.y - _sT.y).toFixed(2) + ',' + (_sB.z - _sT.z).toFixed(2) +
        ' extraCells=' + _xc(_sB.x, _sT.x) + ',' + _xc(_sB.y, _sT.y) + ',' + _xc(_sB.z, _sT.z) + ' batchedSlots=' + _nb + ' meshDraws=' + _nm + ' noSlotBox=' + _nNo +
        (_nb ? '' : ' VACUOUS no batched boundary slots'));
    } catch (eZB) { console.warn('§ZONE_BOX_TRUE failed: ' + (eZB && eZB.message)); }
    // W4 (ALTC_FOUNDATION §1) — merge the progressive-flush batches into one BatchedMesh per bucket ONCE before frame 0. LTU-class
    // models stream into ~6,000 batches (§GI_FILM_CENSUS batched=5999) and the film is CPU draw-call bound. Opt-in (&consolidate=1)
    // until its witnesses pass; a film pays the one-off block that made it unusable in interactive navigation (9.9 s on LTU).
    // Runs AFTER the stream-wait (a merge before it left late batches unmerged) and AFTER LightZones.build: light_zones.js
    // build() bounds a BatchedMesh slot by the WHOLE batch geometry's box (d.geo.boundingBox x slot matrix), so 558 merged batches
    // give a larger grid box than 5,999 small ones — the round-2 §ZONE_IDB_CACHE miss + luma max |d| 27. Building the zones first
    // keeps the grid the unmerged scene's; build() then returns its cache after the merge while guidMap keeps its count.
    try {
      if (/[?&]consolidate=(1|opaque)\b/.test(location.search) && !A._filmConsolidated && typeof A._consolidateBatched === 'function') {
        A._filmConsolidated = true; A._consolidateOpaqueOnly = /[?&]consolidate=opaque\b/.test(location.search);
        var _lzc = window.LightZones, _zPre = null, _zPost = null;
        if (_lzc && _lzc.build) { try { if (_lzc.prime) await _lzc.prime(A); } catch (eP) {} _zPre = _lzc.build(A); }
        A._consolidateBatched();
        if (_lzc && _lzc.build && _zPre) _zPost = _lzc.build(A);
        var _zk = function (z) { return z ? z.nx + 'x' + z.ny + 'x' + z.nz + ':' + z.zones : 'none'; };
        console.log('§CONSOLIDATE_ZONES ' + (!_zPre ? 'INCONCLUSIVE no zone grid before the merge' : _zPost === _zPre ? 'PASS grid kept' : 'WRONG grid rebuilt after the merge') +
          ' before=' + _zk(_zPre) + ' after=' + _zk(_zPost));
      }
    } catch (eCons) { console.warn('§CONSOLIDATE_FAIL film start: ' + (eCons && eCons.message) + ' — film continues on the unmerged scene'); }
    // §CINEMA_PATH: fly the SAME orbit-path formula as the live-capture Cinema Orbit (push-in to
    // fill-frame → hold → band, sun-glint swoop, elliptical radius, pull-back flourish) — shared
    // plan from effects.js. Fallback: plain circle at current radius/height if the plan API is
    // unavailable (old effects.js in cache).
    // §CINEMA_ROOMS — the plan is SYNCHRONOUS but its two best data sources (A.getRoomGraph for
    // the largest interior space, and the 'exit' door nodes §CINEMA_EXIT chooses from) live in the
    // LAZY navigate bundle, which a session that never opened Find has not loaded. Warm it here,
    // where we are already async, so the film gets real rooms + real doors instead of silently
    // falling back to the bbox centre and the facade. Failure is non-fatal — the plan's fallbacks
    // (DB IfcDoor query, then nearest facade) still produce a film.
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) {
      try { await A.loadNavigate(); } catch (eN) { console.warn('§CINEMA_ROOMS loadNavigate failed: ' + eN.message); }
    }
    if (typeof A.ensureRooms === 'function') {
      try { await A.ensureRooms({}); } catch (eR) { console.warn('§CINEMA_ROOMS ensureRooms failed: ' + eR.message); }
    }
    var plan = null;
    if (typeof A.cinemaPathPlan === 'function') {
      try { plan = A.cinemaPathPlan(nFrames / fps); } catch (e) { console.warn('§MAXQ_PATH plan failed: ' + e.message); }
    }
    // §CPE_PACING: the film's length is a CONSEQUENCE of the building, not an input. Frames used to
    // set the duration (360/15 = 24s for everything); now the plan measures its own beats from real
    // distances and angles, and the frame count follows. A caller that asked for a specific frame
    // count still gets it — only the default defers to the geometry.
    if (plan && plan.naturalTotal && !opts.frames) {
      var _natFrames = Math.max(1, Math.round(plan.naturalTotal * fps));
      if (_natFrames !== nFrames) {
        console.log('§MAXQ_DURATION_DERIVED ' + (nFrames / fps).toFixed(1) + 's→' +
          plan.naturalTotal.toFixed(1) + 's, frames ' + nFrames + '→' + _natFrames +
          ' (paced from this building, not a fixed runtime)');
        nFrames = _natFrames;
        try { plan = A.cinemaPathPlan(nFrames / fps); } catch (e2) {}
      }
    }
    var tgt = A.controls.target.clone();
    var dx = A.camera.position.x - tgt.x, dy = A.camera.position.y - tgt.y, dz = A.camera.position.z - tgt.z;
    var radius = Math.hypot(dx, dz), height = dy, az0 = Math.atan2(dz, dx);
    // ══ §CPE_CLIP — in/out markers cut a clip out of the film ══════════════════════════════════
    // Set from the editor's override below. `poseAt` is the ONE place the window is applied, so
    // every consumer — the preview, the bake loop, and anything added later — flies the clip through
    // the same function, and there is no second notion of "which part of the film this is".
    var _clip = null, _buildup = false, _bkState = null, _roomTitle = false, _titleSegs = null, _reveal = false;
    var _loadPath = false;   // §129.1 LOAD PATH — geological-section beat held at topout
    var _ledger = false;     // §129.2 LEDGER TICKER — kernel-ops verification HUD during the buildup
    var _costOdo = false;    // §129.5 COST ODOMETER — running cost/hours figure beside the resource chart
    // §129.6 item 1 — CLOCK FREEZE state. 0/-1 = no hold this bake (byte-identical to pre-fix
    // behaviour). Set once, right after A.loadPathBuild, from A._loadPathWindow.
    var _lpNFramesOriginal = 0, _lpArmTn = null, _lpFramesInserted = 0, _lpHoldFrameStart = -1;
    var _lpArmFrameTn = null, _lpArmTnMatch = true;   // ROUND 9 item 1 — see _lpFrameForArmTn below
    // Per-frame camera-step log for §LOADPATH_RESUME (index -> distance from the PREVIOUS frame's
    // camera position) plus the frame index at which loadPathApplyVisual's own _restore() fired
    // (the "release"/first-resumed frame) — tracked every frame regardless of __lpNoClockFreeze, so
    // the witness works whether the fix is active or the control is reproducing the old bug.
    var _lpCamSteps = [], _lpPrevCamPos = null, _lpResumeAtIndex = -1, _lpPrevRestoreCount = 0;
    // LARGE_DB_BAKE.md §2 L4 — a frame-exact subset of the FULL film's own tn_i = i/(N-1) grid
    // (unlike --clip, whose n frames re-derive tn_i = i/(n-1) across [in,out] — NOT a subset of the
    // full film's own frame grid, see §0's Clip-to-frame mapping note). Lets K bakes on K ports
    // split one long film into disjoint frame ranges and concat byte-identical output.
    var _frameRange = null;   // { a, b, total } once resolved below
    var _clash = false;   // §CLASH_FILM_P1 — mesh-true clash pairs as persistent world content
    var _measure = false;      // §FLYTHRU_DATUM — Alt-C 'Measure' checkbox
    // §ESCAPE_ROUTE_REVEAL (bim-compiler prompts/ESCAPE_ROUTE_REVEAL.md) — the worst-case room's
    // real escape route, traced during the closing orbit. OFF unless asked for, so every saved
    // path re-bakes byte-identically. cpe_escape_route.js owns every decision this flag arms.
    var _escapeRoute = false;
    var _sunCompass = false;   // §SUN_COMPASS — the true-north ground rose; OFF unless requested
    // §SUN_COMPASS — the cursor handed to the rose each frame. NULL when the film has no buildup,
    // which is a real state the module handles; it is never defaulted to "now".
    var _sunCompassMs = null;
    var _sunDate = '';   // §SUN_DAY — yyyy-mm-dd to light the whole film on one day, or '' to follow
    // §CPE_PATH_OVERVIEW — prepared ONCE (the box is static by design, the user's own word), then
    // only the camera head is projected per frame. Rides the Label ON checkbox: the user's ruling
    // was "It is user's choice as its the Label ON option", so it needs no toggle of its own.
    var _ovPath = null, _ovPos = 'tl', _resOps = null, _bigCards = null;
    // §CPE_STATS_TAIL — the Reveal 2nd round's film fraction, read off the plan's own topout.
    var _revealU = null;
    var _dayPos = 'tr';
    function _tFilm(tNorm) { return _clip ? _clip.in + tNorm * (_clip.out - _clip.in) : tNorm; }
    // ROUND 9 item 1 (2026-09-16, real Terminal r8diag bake) — map a WHOLE-FILM `armTn` to the
    // frame index through the EXACT SAME grid the frame loop itself steps `_tn`/`_tnFilm` through
    // (below, near `_frameRange`/`_lpFramesInserted`) — never a bare `armTn*(N-1)`, which silently
    // assumed the clip's clip-local tn (`i/(n-1)`) WAS the whole-film tn. Proven wrong on Terminal
    // (--clip 0.1508:0.2032, 44 frames): armTn=0.1851 -> old formula round(0.1851*43)=8, whose own
    // tFilm is 0.1508+0.0524*8/43=0.160549 (exactly the wrong §LOADPATH_RESUME tFilmArm logged) —
    // the correct frame is round((0.1851-0.1508)/0.0524*43)=28. `nOrig` is the CLIP's/this run's own
    // frame count (`_lpNFramesOriginal`, captured before the hold's frames are spliced in).
    function _lpFrameForArmTn(armTn, nOrig) {
      var n1 = Math.max(1, nOrig - 1), frame, step, armFrameTn;
      if (_frameRange) {
        // Loop grid: _tn = (_frameRange.a + i) / (_frameRange.total - 1) — already whole-film.
        var fr1 = Math.max(1, _frameRange.total - 1);
        frame = Math.round(armTn * fr1 - _frameRange.a);
        step = 1 / fr1;
      } else if (_clip && _clip.out > _clip.in) {
        // Loop grid: _tn = i/(n-1) (clip-local), _tnFilm = _clip.in + _tn*(_clip.out-_clip.in).
        frame = Math.round((armTn - _clip.in) / (_clip.out - _clip.in) * n1);
        step = (_clip.out - _clip.in) / n1;
      } else {
        // Loop grid: _tn = i/(n-1), whole film, no clip/frame-range remap.
        frame = Math.round(armTn * n1);
        step = 1 / n1;
      }
      frame = Math.max(0, Math.min(nOrig - 1, frame));
      armFrameTn = _frameRange ? (_frameRange.a + frame) / Math.max(1, _frameRange.total - 1)
        : _clip ? (_clip.in + (frame / n1) * (_clip.out - _clip.in))
        : (frame / n1);
      return { frame: frame, armFrameTn: armFrameTn, step: step };
    }
    // §129.27 (2026-09-18, red1, re-stated after §129.18 drifted off it: "the HUD and overlays
    // fades off in a sec [after cut-in]... not same as the background... that needs to cut out" /
    // "the fade in by HUD happens before the freeze cuts back... within the last sec of the freeze
    // duration... don't fade them back after the cut, before") — HUD is the ONLY thing that still
    // eases; backdrop and the section-cut/whiten are both an INSTANT step now (§129.24/§129.27,
    // cpe_load_path.js), so HUD no longer shares a timing formula with them (that sharing, §129.18,
    // is exactly what desynced this: it made HUD start its return AT release, same as the OLD
    // ramping backdrop — but backdrop doesn't ramp any more, so HUD kept fading in AFTER an already-
    // instant cut, backwards from what red1 asked for). `_hudFadeT` below ramps OUT over the FIRST
    // `fadeSec` of `elapsed` (unchanged — arm side was always agreed correct) and back IN over the
    // LAST `fadeSec` of the hold's own known total `durSec` — front-loaded, so alpha is already 1
    // exactly AT the release instant, before the building's own instant cut, never after it.
    var HUD_FADE_SEC = 1.0;   // §129.16 (2026-09-18, red1: "same with the fade back in, a full sec")
    // ROUND 12 item 2 — the real hold's own durSec, snapshotted every hold frame (see the main
    // loop's own A._loadPathHudAlpha computation) so the END-OF-BAKE witness below can still read it
    // after A.loadPathDispose() has already nulled the live A._loadPathWindow.
    var _lpLastHoldDurSec = null;
    // ROUND 13 item C (2026-09-16, real HHS bake sighting: `§LOADPATH_HUD_FADE fadeOutFrames=5
    // alphaMid=0` / `§LOADPATH_FOCUS painted=0 hudAlpha=0.00` printed while the HUD was plainly on
    // screen through the freeze) — the analytic witness below asserted a property of the FORMULA
    // that drives `A._loadPathHudAlpha`, never the alpha actually used at the compositor calls that
    // put each HUD layer into the encoded frame (several of those — resourcePanel/bigStats/
    // dayCounter/pathOverview — take their OWN `opacity` parameter and set `ctx.globalAlpha`
    // straight from it, which silently overrode whatever ambient alpha `_drawUnlessHold` had set
    // before calling them; the call sites were passing a hardcoded `1`, never the real fade value).
    // `_lpMidHoldCompositeAlpha` snapshots the REAL per-layer alpha `_drawUnlessHold` recorded
    // (`A._hudCompositeAlphaSample`, fresh every frame) at whichever frame lands CLOSEST to the
    // hold's own middle (never a re-derived "is this the middle" guess — tracked by comparing
    // |elapsedSec - durSec/2| against the best seen so far, every hold frame).
    var _lpMidHoldCompositeAlpha = null, _lpMidHoldBestDistSec = Infinity;
    // §129.27 — pure, own-copy formula again (the §129.18 "share A._loadPathFadeT with backdrop"
    // idea is retired for HUD specifically — backdrop/cut no longer ramp at all, so there is nothing
    // left to share). `durSec` (the hold's own known total length, fixed since BUILD) drives the
    // release-side window instead of a detected `releaseFSec` — front-loading REQUIRES knowing the
    // release point in advance, which `durSec` gives for free and a live `fSec` does not.
    function _hudFadeT(elapsed, inWindow, durSec, fadeSec) {
      if (!(fadeSec > 0)) return inWindow ? 1 : 0;
      if (!inWindow || elapsed == null) return 0;   // outside the hold entirely — nothing suppressed
      var tArm = Math.max(0, Math.min(1, elapsed / fadeSec));                // ramps 0->1 over the FIRST fadeSec
      var tRelease = Math.max(0, Math.min(1, (durSec - elapsed) / fadeSec)); // ramps 1->0 over the LAST fadeSec
      return Math.min(tArm, tRelease);   // whichever edge is currently binding; degrades gracefully if durSec < 2*fadeSec
    }
    // ROUND 13 item C (2026-09-16) — SUPERSEDES the old purely-analytic witness ("a witness that
    // reads a flag instead of the composite is not a witness of the frame", per the real HHS
    // sighting: `alphaMid=0`/`painted=0` printed while the HUD was plainly on screen). `alphaMid`
    // and `compositeAlpha=[…]` come from `_lpMidHoldCompositeAlpha` — the REAL per-layer alpha
    // `_drawUnlessHold` applied at whatever compositor call actually put each HUD layer into the
    // encoded frame, sampled at the hold's own middle frame — never re-derived from the formula
    // alone. `window.__lpHudNoFade=1` (hard cut) must read `fadeOutFrames=0 => FAIL`; `window.
    // __lpNoFocusHold=1` (forces alpha=1 always) must now ALSO fail via `compositeAlpha` reading
    // non-zero at mid-hold, never just via §LOADPATH_FOCUS's own separate check.
    function _hudFadeWitnessPrint() {
      // ROUND 12 item 2 — read the SNAPSHOT (taken every hold frame, before dispose could clear the
      // live A._loadPathWindow), never A._loadPathWindow itself at this point in the bake.
      var durSec = _lpLastHoldDurSec;
      if (!(durSec > 0)) return;   // no hold this bake — nothing to witness
      var noFade = !!window.__lpHudNoFade;
      var fadeSecNow = A._loadPathFadeSecFor ? A._loadPathFadeSecFor(durSec) : HUD_FADE_SEC;
      var fadeOutFrames = noFade ? 0 : Math.max(1, Math.round(fadeSecNow * fps));
      var fadeInFrames = fadeOutFrames;
      // §129.27 — front-loaded release: `alphaAtRelease` must be back to `1` (fully visible) AT
      // `elapsed===durSec` now, the OPPOSITE of §129.18's "0 at release" expectation, because the
      // fade-in is required to finish BEFORE the cut, not start at it. `alphaJustBeforeFadeIn`
      // (evaluated at the fade-in window's own start, `durSec - fadeSecNow`) proves the HUD is still
      // genuinely suppressed right up until that window opens — not fading early. `alphaMidFadeIn`
      // (the window's own midpoint) proves this is a real ramp, not a snap disguised as one.
      var alphaAtRelease, alphaJustBeforeFadeIn, alphaMidFadeIn;
      if (noFade) {
        alphaAtRelease = 1; alphaJustBeforeFadeIn = 1; alphaMidFadeIn = 1;   // hard cut: already fully switched by release, nothing gradual to check
      } else {
        alphaAtRelease = 1 - _hudFadeT(durSec, true, durSec, fadeSecNow);
        alphaJustBeforeFadeIn = 1 - _hudFadeT(durSec - fadeSecNow, true, durSec, fadeSecNow);
        alphaMidFadeIn = 1 - _hudFadeT(durSec - fadeSecNow / 2, true, durSec, fadeSecNow);
      }
      var sample = _lpMidHoldCompositeAlpha, compositeStr, alphaMid, compositeOk;
      if (!sample) {
        // Never invent a PASS with no real sample — an absent snapshot means the mid-hold frame's
        // own composite calls were never observed (e.g. this bake never actually reached _captureFrame
        // during the hold), which is itself something to FAIL on, not paper over.
        compositeStr = 'UNSAMPLED'; alphaMid = null; compositeOk = false;
      } else {
        var names = Object.keys(sample).sort();
        alphaMid = names.length ? Math.max.apply(null, names.map(function (n) { return sample[n]; })) : 0;
        compositeOk = names.length > 0 && names.every(function (n) { return sample[n] === 0; });
        compositeStr = '[' + names.map(function (n) { return n + ':' + sample[n].toFixed(2); }).join(',') + ']';
      }
      var expectJustBefore = noFade ? 1 : 0, expectMid = noFade ? 1 : 0.5;
      var ok = fadeOutFrames > 0 && fadeInFrames > 0 && alphaAtRelease === 1 &&
        Math.abs(alphaJustBeforeFadeIn - expectJustBefore) < 1e-6 &&
        Math.abs(alphaMidFadeIn - expectMid) < 1e-6 && compositeOk;
      console.log('§LOADPATH_HUD_FADE fadeOutFrames=' + fadeOutFrames + ' alphaMid=' + (alphaMid == null ? 'n/a' : alphaMid.toFixed(2)) +
        ' fadeInFrames=' + fadeInFrames + ' alphaAtRelease=' + alphaAtRelease +
        ' alphaJustBeforeFadeIn=' + alphaJustBeforeFadeIn.toFixed(2) + ' alphaMidFadeIn=' + alphaMidFadeIn.toFixed(2) +
        ' compositeAlpha=' + compositeStr + ' => ' + (ok ? 'PASS' : 'FAIL'));
    }
    // §ESCAPE_ROUTE_REVEAL (merged 2026-09-20) — the pose lookup is SPLIT so the escape beat can
    // ease the camera in FILM time without disturbing anything that asks in tNorm. `poseAt` is
    // byte-identical to what it was: the same body, with `_tFilm` applied first.
    function poseAtFilm(tF) {
      if (plan) return plan.poseAt(tF);
      var az = az0 + tF * Math.PI * 2;
      return { x: tgt.x + radius * Math.cos(az), y: tgt.y + height, z: tgt.z + radius * Math.sin(az),
               tx: tgt.x, ty: tgt.y, tz: tgt.z };
    }
    function poseAt(tNorm) { return poseAtFilm(_tFilm(tNorm)); }

    // §57.5 (2026-09-11, user: "go ahead with that frames spacing into a jump") — smooth the
    // camera's LOOK DIRECTION across a small tNorm window around each captured frame. Does NOT
    // touch position or any beat's own duration.
    // MEASURED root cause: a beat whose own real-seconds span is shorter than one frame's tNorm
    // step (found: HHS's dive->spin handoff, an 87 deg gaze snap in a single frame —
    // out/HHS_lowres_v2_2026-09-11_poses.json frames 40->41, reproduced identically on a second,
    // independent bake) gets its whole turn skipped between the two frames straddling it.
    // poseAt's own math is continuous (Beat 1's end target and Beat 2's start target agree
    // exactly at tD — verified by hand against the source); the problem is purely that no
    // frame's own tNorm ever lands inside that beat's narrow window, so its motion never
    // appears in any exported frame at all.
    // Blending GAZE_BLEND_N samples' DIRECTION (yaw/pitch, wrap-safe — never raw target points:
    // averaging points can walk THROUGH the camera on some geometries, the exact bug
    // §CINEMA_TURN_SLERP / _cinemaGazeBlend above already found and fixed at a different seam in
    // this same file) spreads that motion across the frames whose windows overlap it, instead of
    // losing it entirely. Position is untouched — MEASURED position is already continuous
    // everywhere this was found, and blending it too would needlessly soften the carefully-paced
    // dive/walk/orbit speed tuning (§CPE_PACE_SWING and friends) for no benefit.
    // NOT a duration floor: §CPE_SETTLE_HOLD (2026-08-04) already settled that a beat with
    // nothing to turn through stays zero-length ("no hard coded" pause) — this is a sampling fix
    // at the capture step, not a timing change, and leaves every beat's own duration untouched.
    var GAZE_BLEND_N = 5;                 // odd: the frame's own exact tNorm is always one sample
    function _blendedGazeTarget(tn, pos, origDist) {
      // nFrames is read HERE, not precomputed at declaration time — it gets reassigned more than
      // once during setup (natural pacing §CPE_PACING, clip-window rescale) and this function
      // isn't actually invoked until the frame loop below, by which point nFrames already holds
      // its FINAL value. A precomputed half-width would silently use a stale/wrong one.
      // LARGE_DB_BAKE.md §2 L4 (found via §L4_PLAN_DUMP bisection, 2026-09-15): "1.5 frame-widths"
      // means 1.5 widths of a FULL-FILM frame — in --frame-range mode nFrames is this RUN's local
      // slice count (b-a), not the film's, so this blended THE WRONG WIDTH (17%-37% of the whole
      // film's tNorm range instead of ~0.17%), averaging gaze direction over a huge, run-size-
      // dependent arc instead of a tiny neighborhood. Camera POSITION (pure _tn) matched between
      // two --frame-range runs of the same global frame; only the LOOK-AT target diverged — this is
      // why. A normal/--clip bake is unaffected: _frameRange is null there, same as before.
      var gazeBlendHalf = 1.5 / Math.max(1, (_frameRange ? _frameRange.total : nFrames) - 1);   // ~1.5 frame-widths either side
      var refYaw = null, sumYaw = 0, sumPit = 0;
      for (var k = 0; k < GAZE_BLEND_N; k++) {
        var frac = (GAZE_BLEND_N === 1) ? 0 : (k / (GAZE_BLEND_N - 1) - 0.5) * 2;   // -1..1
        var t = Math.max(0, Math.min(1, tn + frac * gazeBlendHalf));
        var p = poseAt(t);
        var dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        var yaw = Math.atan2(dz, dx), pit = Math.atan2(dy, Math.hypot(dx, dz));
        if (refYaw === null) refYaw = yaw;
        var dYawK = yaw - refYaw;
        dYawK -= 2 * Math.PI * Math.round(dYawK / (2 * Math.PI));   // shortest way — same rule _cinemaGazeBlend uses
        sumYaw += refYaw + dYawK; sumPit += pit;
      }
      var ayaw = sumYaw / GAZE_BLEND_N, apit = sumPit / GAZE_BLEND_N, cp = Math.cos(apit);
      return { tx: pos.x + Math.cos(ayaw) * origDist * cp, ty: pos.y + Math.sin(apit) * origDist, tz: pos.z + Math.sin(ayaw) * origDist * cp };
    }
    // ROUND 7 (2026-09-16, real Terminal bake: PICK's own shot-search/visibility used the RAW
    // `plan.poseAt(tn)` pose — no gaze blend — so it evaluated a camera orientation the bake never
    // actually renders; FRAMING reads the REAL, live (gaze-blended) camera and disagreed). Exposes
    // the EXACT pose the frame loop builds (`pose = poseAt(_tn); ...; pose.tx/ty/tz = blended`, line
    // ~2163) for cpe_load_path.js's own hold-point search and PICK to probe against — never a
    // second, re-derived camera model. Operates in WHOLE-FILM tn (cpe_load_path.js's own convention
    // — `shot.tNorm`/`topoutU` are already whole-film fractions, matching its existing direct
    // `plan.poseAt(tn)` calls), so it calls `plan.poseAt` DIRECTLY here, never the clip-relative
    // `poseAt()`/`_tFilm()` wrapper the frame loop's own `_tn` uses — reusing THAT wrapper for a
    // whole-film tn would double-apply (or wrongly skip) the clip remap. A normal (no --clip) bake
    // is identical either way (`_tFilm` is the identity then), so this only matters under --clip.
    A._bakeCameraPoseAt = function (tn) {
      if (!plan || typeof plan.poseAt !== 'function') return null;
      var pose = plan.poseAt(tn);
      if (!pose) return null;
      var gazeDist = Math.hypot(pose.tx - pose.x, pose.ty - pose.y, pose.tz - pose.z);
      var gazeBlendHalf = 1.5 / Math.max(1, (_frameRange ? _frameRange.total : nFrames) - 1);
      var refYaw = null, sumYaw = 0, sumPit = 0, samples = 0;
      for (var k = 0; k < GAZE_BLEND_N; k++) {
        var frac = (GAZE_BLEND_N === 1) ? 0 : (k / (GAZE_BLEND_N - 1) - 0.5) * 2;
        var t = Math.max(0, Math.min(1, tn + frac * gazeBlendHalf));
        var p = plan.poseAt(t);
        if (!p) continue;
        samples++;
        var dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        var yaw = Math.atan2(dz, dx), pit = Math.atan2(dy, Math.hypot(dx, dz));
        if (refYaw === null) refYaw = yaw;
        var dYawK = yaw - refYaw;
        dYawK -= 2 * Math.PI * Math.round(dYawK / (2 * Math.PI));
        sumYaw += refYaw + dYawK; sumPit += pit;
      }
      if (!samples) return { x: pose.x, y: pose.y, z: pose.z, tx: pose.tx, ty: pose.ty, tz: pose.tz };
      var ayaw = sumYaw / samples, apit = sumPit / samples, cp = Math.cos(apit);
      return { x: pose.x, y: pose.y, z: pose.z,
        tx: pose.x + Math.cos(ayaw) * gazeDist * cp, ty: pose.y + Math.sin(apit) * gazeDist, tz: pose.z + Math.sin(ayaw) * gazeDist * cp };
    };
    // §CPE_STICK_APPROACH: same _tFilm remap as poseAt, so the reported stick matches the pose
    // actually flown THIS frame (a clip window shifts both together). No-op (null) on a circle
    // fallback plan or a plan/path with no user-dropped sticks (plan.stickCount === 0, the common
    // case) — the bake HUD then shows nothing extra, same as before this feature.
    function stickApproachAt(tNorm) {
      if (!plan || !plan.stickApproachAt) return null;
      return plan.stickApproachAt(_tFilm(tNorm));
    }
    var w = A.renderer.domElement.width, h = A.renderer.domElement.height;
    console.log('§MAXQ_START frames=' + nFrames + ' fps=' + fps + ' path=' + (plan ? 'cinema' : 'circle') +
      ' radius=' + radius.toFixed(1) + ' height=' + height.toFixed(1) + ' size=' + w + 'x' + h);
    // §MAXQ_PREVIEW (user spec 2026-07-19): 10s real-time mock of the EXACT path before baking —
    // "the user sees what its next 10 mins of rendering will be up to". Plain nav look, no Alt+S
    // staging/folds (path rehearsal, not a quality preview — per user, "the fast preview the
    // scene wont be in Alt-S mode"). Alt+C during the preview cancels the whole run for free.
    // ONE implementation, two call sites (§CPE_PREVIEW_AFTER below is the second). It reads `poseAt`,
    // which reads `plan` from this scope at CALL time — so whichever plan is current when it runs is
    // the plan it flies. That is not incidental: it is what makes the after-edit preview show the
    // EDITED film through the very same function the bake will step frame by frame, rather than a
    // second, parallel notion of the path that could drift from it (§CPE_PREVIEW_DIVERGENCE, again).
    // Returns true if the user cancelled during it.
    async function _runPreview(phase, status) {
      console.log('§MAXQ_PREVIEW start phase=' + phase +
        ' 10s real-time mock of the exact path (plain look, no Alt+S)');
      MQS._status(status);
      var camSave = { px: A.camera.position.x, py: A.camera.position.y, pz: A.camera.position.z,
                      qx: A.controls.target.x, qy: A.controls.target.y, qz: A.controls.target.z };
      var pv0 = performance.now(), PREV_MS = 10000;
      await new Promise(function(res) {
        (function pvStep() {
          if (MQS._cancel) return res();
          var tn = Math.min(1, (performance.now() - pv0) / PREV_MS);
          var pp = poseAt(tn);
          A.camera.position.set(pp.x, pp.y, pp.z);
          A.controls.target.set(pp.tx, pp.ty, pp.tz);
          A.controls.update();
          if (A.markDirty) A.markDirty();
          if (tn >= 1) return res();
          requestAnimationFrame(pvStep);
        })();
      });
      A.camera.position.set(camSave.px, camSave.py, camSave.pz);
      A.controls.target.set(camSave.qx, camSave.qy, camSave.qz);
      A.controls.update();
      if (A.markDirty) A.markDirty();
      if (MQS._cancel) return true;
      console.log('§MAXQ_PREVIEW done phase=' + phase + ' — camera restored');
      return false;
    }
    function _cancelledOut(where) {
      console.log('§MAXQ_CANCEL during ' + where + ' — nothing baked, nothing saved');
      MQS._status('🎬 MaxQ cancelled during ' + where);
      MQS._active = false; MQS._cancel = false; A._maxqActive = false;
      MQS._wakeRelease(); MQS._dampRelease(); MQS._bakeBudgetRelease();
    }
    // ══ §CPE_PREVIEW_REDUNDANT (user, 2026-07-28, after flying it: "I see the initial preview is
    // redundant. Straight showing this is good as preview button is always there and serving well.
    // Corelation with the whole pipe during the journey is great instant feedback.")
    // The pre-editor 10 s flight of the DERIVED path used to run here. It was written when the
    // editor could not preview at all — the film went from an unedited rehearsal straight to a
    // ten-minute cook. Both of its jobs are now done better by things that came after it: the editor
    // draws the whole film as a pipe the moment it opens (so the path is visible without flying it),
    // and §CPE_PREVIEW_BUTTON flies whatever is current, on demand, as many times as wanted.
    // Keeping it meant ten seconds of forced waiting before every single edit session.
    // `opts.preview` still gates §CPE_PREVIEW_AFTER below, so a caller can still turn previews off.
    if (opts.preview !== false && opts.editor === false) {
      // No editor in this run (a scripted/witness bake): the rehearsal is the ONLY chance to see the
      // path before the cook, so it still runs there.
      if (await _runPreview('derived', '🎬 Path preview (10s, plain look) — the bake follows; Alt+C cancels')) {
        _cancelledOut('preview');
        return;
      }
    }
    // ══ §CINEMA_PATH_EDITOR (prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL item 12): the
    // waypoint editor opens HERE — after the preview has shown the path and put the camera back.
    //
    // Item 20, a real defect this placement exposes and must fix: `A._maxqActive`, the wake lock and
    // the damping hold are all claimed at the TOP of start(), before the plan and preview. In
    // particular `A._maxqActive` makes dlod_nav.js:307 report 'cinema' and fully disengage DLOD. A
    // user editing for five minutes would otherwise hold a screen wake lock and run Terminal/Hospital
    // at full detail with no LOD the entire time. So all three are released for the duration of the
    // editor and re-claimed on OK. Gated by G11 — proven released, not merely described as released.
    var _cpeRes = null;
    if (A.cinemaPathEditor && plan && plan.waypoints && opts.editor !== false && !opts.override) {
      A._maxqActive = false;
      MQS._wakeRelease(); MQS._dampRelease(); MQS._bakeBudgetRelease();
      console.log('§CPE_LOCKS released for editing (maxqActive=false, wake+damping released)');
      MQS._status('🎬 Edit the path, then OK to record');
      try {
        _cpeRes = await A.cinemaPathEditor.open({ plan: plan, durationSec: nFrames / fps, fps: fps });
      } catch (eE) { console.warn('§CPE_FAIL ' + eE.message + ' — proceeding with the derived path'); }
      A._maxqActive = true;
      MQS._wakeAcquire(); MQS._dampHold();
      console.log('§CPE_LOCKS re-claimed for the bake (maxqActive=true)');
      if (_cpeRes && _cpeRes.action === 'cancel') {
        console.log('§MAXQ_CANCEL from path editor — nothing baked, nothing saved');
        MQS._status('🎬 Cancelled');
        MQS._active = false; MQS._cancel = false; A._maxqActive = false;
        MQS._wakeRelease(); MQS._dampRelease(); MQS._bakeBudgetRelease();
        return;
      }
      if (!(_cpeRes && _cpeRes.override)) {
        // Guardrail 2: OK with no edit re-uses the plan object computed before the editor opened —
        // literally the same object, so the film is byte-identical to one recorded without the
        // editor existing. The default cost of this feature is one click and nothing else.
        console.log('§CPE_APPLIED none — derived plan unchanged (guardrail 2: OK is a no-op)');
      }
    } else if (opts.override) {
      // ══ §CLI_SILENT_BAKE item 2 (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md) — a
      // scripted bake hands the stored override straight in, and it becomes the SAME _cpeRes shape
      // the editor returns, so the application block below runs unchanged for both sources: one
      // code path, no second format, no drift. The editor path stays byte-identical (its gate
      // above merely adds `&& !opts.override`).
      var _ovIn = opts.override;
      var _durIn;
      if (opts.frames) {
        // An explicit frame count wins outright — durationSec must reproduce it exactly, because
        // the application block below re-derives nFrames from durationSec (round-trip identity).
        _durIn = nFrames / fps;
      } else {
        _durIn = (typeof _ovIn._total === 'number' && isFinite(_ovIn._total) && _ovIn._total > 0)
          ? _ovIn._total : nFrames / fps;
        // §CPE_PACING, applied to the OVERRIDE plan: a stored _total that predates caller-added
        // reveal/hose flags must still buy those beats real frames — the plan's own naturalTotal
        // is the authority, same contract as the derived path above.
        try {
          var _pIn = A.cinemaPathPlan(_durIn, _ovIn);
          if (_pIn && _pIn.naturalTotal && isFinite(_pIn.naturalTotal) && _pIn.naturalTotal > 0)
            _durIn = _pIn.naturalTotal;
        } catch (eOvP) { console.warn('§MAXQ_OVERRIDE_IN plan-probe failed: ' + eOvP.message); }
      }
      _cpeRes = { action: 'ok', override: _ovIn, durationSec: _durIn, saved: false };
      console.log('§MAXQ_OVERRIDE_IN source=' + (opts.overrideSource || 'caller') +
        ' bands=' + (_ovIn.bands ? _ovIn.bands.length : 0) +
        ' hoseOps=' + (_ovIn.hose ? _ovIn.hose.length : 0) +
        ' buildup=' + (_ovIn.buildup ? 1 : 0) + ' roomTitle=' + (_ovIn.roomTitle ? 1 : 0) +
        ' reveal=' + (_ovIn.reveal ? 1 : 0) + ' durationSec=' + _durIn.toFixed(1));
    }
    if (_cpeRes && _cpeRes.override) {
        // Constant speed means an edited path generally changes the total, so the frame count is
        // re-derived from it (item 11 — this is the render cost the editor surfaced).
        var _framesWas = nFrames;
        nFrames = Math.max(1, Math.round(_cpeRes.durationSec * fps));
        plan = A.cinemaPathPlan(nFrames / fps, _cpeRes.override);
        window.__maxqPlanDurSec = nFrames / fps;   // W1 (ALTC_FOUNDATION §1): the duration this plan was built at, for the CLI pose check
        // §CPE_OK_CRASH (CINEMA_PATH_EDITOR.md) — this line used to read `override.waypoints.length`
        // and threw `undefined.length` on EVERY edited path: §CPE_BANDS changed the editor's override
        // to carry `bands` (3 bands → 6 waypoints, expanded inside effects.js), and this one consumer
        // was never ported. The plan above had already succeeded — a stale LOG line was killing the
        // bake. Count what the plan actually flew, and never let this line be the thing that throws.
        var _ov = _cpeRes.override;
        // LARGE_DB_BAKE.md §2 L4 — `--frame-range a:b` wins over `--clip` when both are given
        // (the CLI itself already refuses to accept both). Renders exactly frames a..b-1 of the
        // FULL film at THAT film's own tn_i = i/(N-1) step; poseAt/_tFilm are never touched, so a
        // frame rendered here and the same frame rendered in a K=1 full bake take the identical path.
        if (opts.frameRange) {
          var _fr = opts.frameRange;
          if (_fr.b > nFrames) throw new Error('§FRAME_RANGE_OOB b=' + _fr.b + ' > full film frames=' + nFrames);
          _frameRange = { a: _fr.a, b: _fr.b, total: nFrames };
          nFrames = _fr.b - _fr.a;
          console.log('§FRAME_RANGE a=' + _frameRange.a + ' b=' + _frameRange.b +
            ' totalFullFilmFrames=' + _frameRange.total + ' rendersThisRun=' + nFrames +
            ' (frame-exact subset of the FULL film, not a --clip remap)');
        // §CPE_CLIP: a clip is fewer frames of the SAME film, so the frame count scales with the
        // window — not the duration, which the editor already derived for the whole path.
        } else if (_ov.clip && _ov.clip.out > _ov.clip.in) {
          _clip = { in: _ov.clip.in, out: _ov.clip.out };
          var _span = _clip.out - _clip.in;
          var _framesFull = nFrames;
          nFrames = Math.max(1, Math.round(nFrames * _span));
          console.log('§CPE_CLIP applied window=' + _clip.in.toFixed(3) + '→' + _clip.out.toFixed(3) +
            ' span=' + (_span * 100).toFixed(0) + '% frames=' + _framesFull + '→' + nFrames +
            ' (poseAt remaps; the film itself is unchanged)');
        }
        _buildup = !!_ov.buildup;
        _roomTitle = !!_ov.roomTitle; // §CPE_ROOM_TITLE — off unless the editor's checkbox set it
        // §CPE_DISCIPLINE_REVEAL Mechanism C (prompts/CINEMA_DISCIPLINE_REVEAL.md) — both the round
        // and its visuals are real. effects.js's _cinemaPathPlan/poseAt inserts the retrace via this
        // same _ov.reveal flag, transparently to this file (plan.poseAt already returns the extended
        // film); A.cpeRevealApplyVisual(plan,_tn), called from the per-frame loop below, drives the
        // ARC/STR hide via A.filterDiscs. _reveal itself is only captured here for logging.
        _reveal = !!_ov.reveal;
        // §CLASH_FILM_P1 (MEP_CLASH_REVEAL_MOVIE.md) — clash_film.js builds the mesh-true pair set
        // ONCE below, before the frame loop; it is static world content, not per-frame work.
        _clash = !!_ov.clash;
        // §FLYTHRU_DATUM — the Measure overlay, authored beside Clash in the Alt-C panel.
        _measure = !!_ov.measure;
        // §129.31 (2026-09-18, red1: "give it its own checkbox") SUPERSEDES §129 GATING (2026-09-15)'s
        // fold-under-Measure: that made an unrelated checkbox ("setting-out drawing") silently gate a
        // completely different feature. Load path now has its own Alt-C checkbox (`_ov.loadPath`,
        // cinema_path_editor.js). Explicit wins outright — true or false, independent of Measure.
        // UNDEFINED (every path saved before this checkbox existed — the field is simply absent from
        // their stored override JSON, `__maxqBake`'s own merge never touches it) falls back to the
        // OLD `!!_measure` behaviour, so no bake made before today silently loses the feature.
        _loadPath = (_ov.loadPath !== undefined) ? !!_ov.loadPath : !!_measure;
        // §ALTC_V3 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_V3, user 2026-10-06: "Remove the loadpath freeze path"):
        // a road film never freezes on a load path (v2 measured 4 s of a still bridge diagram, picture change 0.1).
        if (_loadPath && A.isCivilModel && A.isCivilModel()) { _loadPath = false; console.log('§ALTC_V3 load-path freeze off (road film)'); }
        // §FREEZE_PERF_PANEL (PERFORMANCE_AS_CLASH.md §19): Audio / Visual panels draw only inside the load-path freeze composite.
        A._freezePerfOn = { visual: !!_ov.visualPanel, audio: !!_ov.audioPanel };
        if ((_ov.visualPanel || _ov.audioPanel) && !_loadPath) console.log('§FREEZE_PERF_PANEL group=' + (_ov.visualPanel ? 'visual' : '') + (_ov.audioPanel ? (_ov.visualPanel ? '+' : '') + 'audio' : '') + ' skipped reason=load-path-off');
        if (_ov.audioPanel) console.log('§FREEZE_PERF_PANEL group=audio skipped reason=not-built (α table + §N reference witness first)');
        // §129.6 item 6b (2026-09-15) SUPERSEDES the original fold-under-measure: Cost/Ledger are now
        // rows of the pie-chart HUD (cpe_resource_panel.js), gated by the SAME toggle as the
        // "4D/5D" (--label/--4d5d) checkbox — NOT --measure. The load path 3D effect itself is
        // untouched, still `_measure`-gated above. `--no-ledger`/`--no-cost` remain control-only
        // overrides.
        _ledger = !!_roomTitle && (_ov.ledger !== false);
        _costOdo = !!_roomTitle && (_ov.cost !== false);
        // §ESCAPE_ROUTE_REVEAL — its own flag, its own beat inside the closing orbit.
        _escapeRoute = !!_ov.escapeRoute;
        // §SUN_COMPASS — its own flag, NOT folded into Measure. The datum draws the model's own
        // setting-out grid; this draws the model's relationship to the planet. They answer
        // different questions and a viewer may well want one without the other.
        _sunCompass = !!_ov.sunCompass;
        // §SUN_DAY — '' (or absent) means follow the 4D timeline's own dates, which is what every
        // saved path predating this field carries, so none of them re-bake differently.
        _sunDate = _ov.sunDate || '';
        if (_reveal) console.log('§CPE_REVEAL flag=on — retrace round + ARC/STR reveal are real ' +
          '(spec: prompts/CINEMA_DISCIPLINE_REVEAL.md)');
        // §CPE_DAY_COUNTER_POS — the editor's corner choice. Absent (an older saved plan, or a bake
        // that never opened the editor) means TOP RIGHT, which is what shipped, so nothing re-bakes
        // differently by accident.
        _dayPos = _ov.dayCounter || 'tr';
        // §CPE_PATH_OVERVIEW — follows the DAY COUNTER's corner by default (§CPE_HUD_STACK):
        // the user's ruling is one top/down/left/right preference for the whole column, not a
        // separate corner per overlay.
        _ovPos = _ov.pathOverview || _dayPos;   // §CPE_HUD_STACK: one corner preference for the column
        var _wpN = _ov.bands ? _ov.bands.length * 2 : (_ov.waypoints ? _ov.waypoints.length : '?');
        console.log('§CPE_APPLIED total=' + _cpeRes.durationSec.toFixed(1) + 's frames=' + nFrames +
          ' waypoints=' + _wpN + ' saved=' + !!_cpeRes.saved);
        // §MAXQ_START was printed before the editor opened, so its frame count is now stale — a
        // pasted console must not disagree with what actually gets baked (observed live: START said
        // 360, the bake ran 489).
        if (nFrames !== _framesWas)
          console.log('§MAXQ_START_REVISED frames=' + _framesWas + '→' + nFrames +
            ' (path edited; §MAXQ_START above is superseded)');
        // ══ §CPE_PREVIEW_AFTER_RETIRED (prompts/CINEMA_PATH_EDITOR.md, user 2026-07-29: "when OK, do
        // not run preview again as there is already a Preview button") — the 10 s flight of the EDITED
        // path used to run HERE, between §CPE_APPLIED and frame 0.
        //
        // It was written for a build where the editor could not preview at all: the film you authored
        // went straight to a ten-minute bake unseen, so a forced rehearsal was the only way to catch a
        // bad edit. §CPE_PREVIEW_BUTTON closed that gap directly and better — it flies the CURRENT edit
        // on demand, any number of times, and its stale marker ('Preview ●') answers "have I seen THIS
        // version?" without guessing. What was left here was ten forced seconds proving something the
        // user had already chosen when to see. This is the same cut §CPE_PREVIEW_REDUNDANT made above
        // for the PRE-editor rehearsal, on the same reasoning, applied to the other end.
        //
        // The trade, stated rather than glossed: the replacement is opt-in, so a user who never presses
        // Preview now bakes unseen. That is the user's ruling, consistent with how they ruled on the
        // pre-editor preview.
        //
        // `_runPreview` STAYS — the `opts.editor === false` branch above (scripted/witness bakes: no
        // panel, therefore no Preview button) is the one caller that still needs a rehearsal, and
        // `opts.preview` keeps its meaning for it.
    }
    var db = null;
    var framesDone = 0;
    var _idbLost = false;
    var _glLost = false;
    var t0 = performance.now();
    // §MAXQ_ETA_ROLLING (user 2026-07-19: "74 mins... suddenly 38... now 33.. it is not accurate"):
    // lifetime-average ETA is poisoned by the expensive early frames (indoor prelude close-ups cost
    // far more than wide exterior frames). Use the mean of the LAST 15 frames instead — tracks the
    // current phase's real rate.
    var _etaPrev = t0, _etaRecent = [];
    var MAXQ_LOG_MS = 5000, _logPrev = t0;   // console cadence in TIME, not frames (§MAXQ_ETA_TICK)
    try {
      // IDB first, INSIDE the guard: this open used to sit bare between the preview and the warm-up,
      // so a blocked open froze the run with zero log lines, _active stuck true (swallowing the next
      // Alt+C as a cancel-toggle) and the wake lock held. Failing fast here also avoids paying the
      // warm-up fold before discovering the store is unusable.
      await MQS._idbDelete();
      db = MQS._db = await MQS._idbOpen();
      console.log('§MAXQ_IDB_READY store opened');
      // Warm-up fold (discarded): staging's async assets (sunset HDRI envMap, AO bundle, textures)
      // must be resident BEFORE frame 0, or early frames bake a different global lighting baseline
      // than later ones (whole-building tint shift — measured 21.6dB vs 24.3dB PSNR in the PoC).
      MQS._status('🎬 MaxQ warming up…');
      A.startStillRefine();
      await MQS._waitFoldDone(30000, 'warm-up fold');
      // §CINEMA_HDRI_RACE (2026-07-24, user-reported live via their own pasted console log —
      // "flicker or snapping... before Alt-S fully applied"): _waitFoldDone above only tracks the
      // TAA/AO accumulate fold's own busy flag. A.startStillRefine() ALSO kicks off the HDRI envMap
      // load (real photographed reflections) as a separate async texture fetch+PMREM-generate, and
      // that one is NOT what the fold's "done" flag tracks — confirmed live: the user's log showed
      // `§STILL_REFINE done` firing at elapsedMs=2221 while `§LAYER2_HDRI_READY` only arrived later.
      // Wait for it explicitly too, so frame 0 doesn't bake with placeholder lighting. 20s cap (vs
      // the flagged-dead-code live-capture path's 5s) — MaxQ is an offline multi-minute bake, not
      // latency-sensitive, and this is a ONE-TIME cost per session (cached after the first load).
      if (typeof A.ensureHdriEnvMapReady === 'function') {
        var _hdriT0 = performance.now();
        await Promise.race([
          A.ensureHdriEnvMapReady(),
          new Promise(function(res) { setTimeout(res, 20000); })
        ]);
        console.log('§MAXQ_HDRI_RACE waitedMs=' + Math.round(performance.now() - _hdriT0));
      }
      A.stopStillRefine(true);
      await MQS._raf2(); await MQS._sleep(3000);

      // ══ §CPE_BUILDUP / §MAXQ_TIME mode D — the model assembles itself as the camera flies ══════
      // The ordering is computed over the WHOLE path (plan.poseAt, deliberately NOT the clipped
      // poseAt): with a clip, the buildup must be sampled BY the window, not re-normalised to it, or
      // every clip would open on bare ground instead of on a partially-built building
      // (PHOTOREAL_STILL_RENDER.md §MAXQ_TIME code-read, §6).
      if (_buildup) {
        if (typeof window.tmOrderByCameraPath !== 'function' || typeof window.tmActivateForBake !== 'function') {
          console.warn('§CPE_BUILDUP_SKIP reason=time_machine.js not loaded — baking without the buildup');
          _buildup = false;
        } else if (typeof window.tmHasExistingSchedule === 'function' && !(await window.tmHasExistingSchedule())) {
          // §CPE_BUILDUP_REQUIRE_TM_FIRST — never let the movie button generate a building's FIRST
          // schedule; that's Time Machine's job, once, so the user actually sees the buildup before
          // it's baked. A visible status (not just a console warning) since this is a one-time thing
          // the user needs to go DO, not a background detail.
          console.warn('§CPE_BUILDUP_SKIP reason=no schedule generated yet — open Time Machine first');
          MQS._status('🎬 Open Time Machine first to build the construction schedule — baking without it this time');
          await MQS._sleep(2000);
          _buildup = false;
        } else if (!(await window.tmActivateForBake())) {
          console.warn('§CPE_BUILDUP_SKIP reason=no derived build order (Time Machine has no ops for this building)');
          _buildup = false;
        } else {
          // ══ §CPE_BUILDUP_FOLLOW_TM — the film PLAYS the Time Machine, it does not author an order ══
          // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_SOURCE_BLIND
          // User, 2026-07-29: "do not bake anything for TM.. it is user's own plan" /
          // "this practices good separation of tasks" / "so buildup it gives as it is basis".
          //
          // What this replaces: mode D (tmOrderByCameraPath) re-keyed every op to camera-path
          // proximity. §CPE_BUILDUP_REAL_SCHEDULE had already stopped it eating a CAPTURED schedule,
          // but a GENERATED timeline — schedule_gate's geometry-gated bottom-up order, which is what
          // the TM drawer is showing — was still discarded. Reported live on Hospital (63,439 ops, 36
          // mini-Gantt bars, zero rows in `tasks`): proximity to a 73.6m walk through a building of
          // boundingR=91.4 reveals every storey at once, which is the "flattens too much too early"
          // the user saw. One verb now decides for BOTH callers, so the Preview and the bake can no
          // longer disagree about what they are showing.
          _bkState = (typeof window.tmFollowTimeline === 'function') ? window.tmFollowTimeline() : null;
          if (!_bkState) { console.warn('§CPE_BUILDUP_SKIP reason=no timeline to follow — baking without the buildup'); _buildup = false; }
          if (_bkState) {
            var _top = MQS._buildupTopoutU(plan);
            _revealU = _top.u;   // §CPE_STATS_TAIL — where the Reveal 2nd round starts
            console.log('§CPE_BUILDUP_TOPOUT topoutU=' + _top.u.toFixed(3) + ' src=' + _top.src +
              ' — construction completes at the closing-orbit boundary; the pull-back shows the' +
              ' topping-out and the orbit circles the FINISHED building (solar-panel lesson 2026-08-02)');
          }
          else if (_bkState.source === 'captured') {
            // §CPE_BUILDUP_REAL_SCHEDULE §5 — the label moves with the data. States scope and
            // coverage; claims NO predecessor logic, float or resources (this data carries none).
            MQS._status('🎬 Building to the linked schedule (' + _bkState.leafTasks + ' phases, ' +
              _bkState.pct + '% of elements)');
          } else {
            // §5 tier 2 — a real, model-derived 4D. Never "the schedule", never "a programme".
            MQS._status('🎬 Building to this model\'s 4D timeline (' + _bkState.placed + ' elements, as the Time Machine has it)');
          }
          // §CPE_GHOST_GROUND: armed here because this is where the buildup timeline becomes real —
          // the trigger is a cursor timestamp, so it cannot be computed before the ops are ordered.
          if (_bkState) MQS._ghostGroundArm(_bkState);
        }
      }
      // §CPE_DAY_COUNTER — declared in the bake's scope, reset per frame. Must NOT be an implicit
      // global: two bakes in one tab would then share it and a film with no buildup would inherit
      // the previous film's badge.
      var _dayInfo = null;
      var _lblInfo = null;   // §CLASH_FILM_P2 — this frame's placed labels, same per-bake scoping as _dayInfo
      // §CPE_ROOM_TITLE — one coarse pre-pass over the WHOLE (already clip/buildup-resolved) frame
      // count, not a per-frame room query: nFrames/fps here is the bake's actual, final duration
      // (§CPE_CLIP has already resized it above), so the timeline never disagrees with what's about
      // to be captured.
      if (_roomTitle && plan && A.roomTitleBuildTimeline) {
        try { _titleSegs = A.roomTitleBuildTimeline(plan, nFrames / fps); }
        catch (eT) { console.warn('§CPE_ROOM_TITLE_ERR ' + eT.message); _titleSegs = null; }
      }
      t0 = _etaPrev = performance.now();
      // §CPE_PATH_OVERVIEW — prepared ONCE here, never in the loop. The projection, the path
      // polyline and the envelope are all static by design, so the per-frame cost is two projected
      // points (camera position + look target) and a triangle. Gated on the Label ON checkbox per
      // the user's ruling. The envelope traverse is a single Box3 pass at bake START — one ~48k
      // element walk against a multi-minute bake, not a per-frame cost.
      // §CPE_PATH_OVERVIEW_NEVER_KILLS_A_BAKE (2026-08-30 — real failure, user's HHS bake aborted
      // here). This block referenced `_ovCam`, a variable an earlier edit of mine had deleted along
      // with the Box3 envelope traverse it belonged to. The ReferenceError threw between
      // §CPE_ROOM_TITLE_COLLECTIVE and the frame loop, so a 3,048-frame bake set up staging, the
      // schedule, the buildup and the captions — then stopped without capturing a single frame and
      // without printing a §CPE_PATH_OVERVIEW line at all. The missing log line is what located it.
      //
      // The variable is fixed below, but the REAL fix is this try/catch: a decorative corner box
      // must never be able to abort a bake. Any failure here now costs the box, not the film.
      try {
        if (_roomTitle && A.pathOverviewPrepare && plan && plan.waypoints) {
          // Framing is the crafted stick span only (§CPE_PATH_OVERVIEW_FRAME, user ruling), so no
          // camera trajectory is sampled or passed — the head is clamped to the panel edge instead.
          _ovPath = A.pathOverviewPrepare(plan, null, null);
          console.log('§CPE_PATH_OVERVIEW ' + (_ovPath
            ? ('on waypoints=' + _ovPath.wpCount + ' pos=' + _ovPos)
            : 'INCONCLUSIVE reason=no-path-to-draw (plan has <2 waypoints) — box omitted, not blank'));
        } else if (!_roomTitle) {
          console.log('§CPE_PATH_OVERVIEW off — rides the Label ON checkbox, which is off for this bake');
        }
      } catch (eOv) {
        _ovPath = null;
        console.warn('§CPE_PATH_OVERVIEW_ERR ' + eOv.message + ' — box disabled, bake continues');
      }
      // §CPE_RESOURCE_PANEL — the ops snapshot is taken ONCE (read-only copy, §TM_OPS_SNAPSHOT);
      // per frame only the day's composition is recomputed, and the pie bitmap is cached on dayKey.
      // Rides the same Label ON checkbox and refuses honestly when there is no schedule to read.
      try {
        if (_roomTitle && A.resourcePanelAt && typeof window.tmOpsSnapshot === 'function' && _bkState) {
          A._resHoldFrames = 0; A._resHoldLogged = false;   // §CPE_PIE_HOLD counts are per-bake
          A._statTailFrames = 0; A._statTailLogged = false; // §CPE_STATS_TAIL, same
          A._measureCardLast = null;                        // §MEASURE_BUILDING_CARD, same per-bake reset
          A._clashLblStopped = false;                       // §CLASH_LABELS_STOP, same per-bake reset
          _resOps = window.tmOpsSnapshot();
          console.log('§CPE_RESOURCE_PANEL ' + (_resOps && _resOps.length
            ? ('on ops=' + _resOps.length + ' rates=' + (!!(window.LABOR_RATES)) + ' pos=' + _ovPos)
            : 'INCONCLUSIVE reason=no-ops — panel omitted, not blank'));
        } else if (_roomTitle) {
          console.log('§CPE_RESOURCE_PANEL INCONCLUSIVE reason=' +
            (!_bkState ? 'no-buildup-timeline' : 'no-ops-snapshot') + ' — panel omitted, not blank');
        }
      } catch (eR) { _resOps = null; console.warn('§CPE_RESOURCE_PANEL_ERR ' + eR.message + ' — panel disabled, bake continues'); }
      // ══ §CLASH_FILM_P1 — build the markers ONCE, before the first frame ═══════════════════
      // Deliberately BEFORE the loop and never inside it: the narrow phase costs ~2 s on Terminal,
      // and the pair set is static. The markers are a FORECAST (§3b) — they stand from frame 0 over
      // empty ground while the buildup rises around them, so nothing here consults the TM cursor.
      // §CLASH_HUD_ORDER (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item A — ROOT CAUSE of the
      // user's "HUD left out Clash stats" report on the full 195.8s film): this block used to run
      // AFTER §CPE_BIG_STATS below, so `bigStatsBuild()` always read `A.clashFilm.stats().built ===
      // false` on a fresh page load — the clash film had not been built yet — and §CLASH_HUD_CARD was
      // silently dropped on EVERY first bake of a tab, `--clash` and pair count notwithstanding. Moved
      // here, BEFORE §CPE_BIG_STATS, so the card sees the real, already-judged stats.
      // LARGE_DB_BAKE.md §2 L4 — same invariant the --clip branch already protects ("a full bake is
      // unchanged, _filmSecFull === nFrames / fps when no clip is set", see the comment near
      // _workCursorAt below): in frame-range mode `nFrames` has ALREADY been narrowed to this run's
      // slice (b-a), so falling through to the plain `nFrames / fps` here silently fed every
      // absolute-seconds effect below (clash timing, ghost-ground fade, flythru cues, slab/indoor
      // beats — all keyed off `_tnFilm * _filmSecFull`) the wrong film length. FOUND via the
      // §FRAME_HASH seam witness: a=780 rendered completely different pixels under b=781 vs b=785.
      var _filmSecFull = _frameRange ? (_frameRange.total / fps)
        : (_clip && _clip.out > _clip.in) ? (nFrames / (_clip.out - _clip.in)) / fps : nFrames / fps;
      // §FLYTHRU_CUES — baseline measurement cues (B1/B2/B4/B5). Built once, placed against the
      // REAL camera path. Never allowed to kill a bake: same try/catch contract as every overlay here.
      if (A.flythruCuesBuild) {
        try { A.flythruCuesBuild(plan, _filmSecFull); }
        catch (eFC) { console.warn('§FLYTHRU_CUES_BUILD failed: ' + (eFC && eFC.message) + ' — cues disabled for this bake'); }
      }
      // §ALTC_PANELS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_PANELS) — road data cards on quiet stretches of the
      // drive. Civil models only (the builder logs VACUOUS and returns null on a building). Never allowed to kill a bake.
      if (A.roadPanelsBuild) {
        try { await A.roadPanelsBuild(plan, _filmSecFull); }   // §ALTC_CHECKS: async (loads road_rules.json, runs road_check once)
        catch (eRP) { console.warn('§ROAD_PANELS_BUILD failed: ' + (eRP && eRP.message) + ' — road panels disabled for this bake'); }
      }
      // §129.6 item 1 (2026-09-15, after a real HHS bake showed a camera "resume jump"):
      // §LOADPATH_WINDOW_SHIFT is WITHDRAWN — pushing `_revealU` forward left `_tn`/`_tnFilm`
      // free to keep advancing during the hold (sun arc, buildup cursor, everything driven off
      // tFilm), so release snapped the camera to wherever the film had moved on to. The hold now
      // FREEZES THE FILM CLOCK instead: `_lpFramesInserted` extra frames are SPLICED into the
      // timeline at the arm point (`_lpHoldFrameStart`), the delivered film is longer by the hold
      // (red1: "I don't mind it adds few secs"), and `_tn` (below) is remapped so it holds constant
      // at the arm value for exactly those inserted frames, then resumes from that SAME value —
      // never shifting any OTHER beat's own boundary.
      if (_loadPath && A._freezePerfOn && A._freezePerfOn.visual && A.freezePerfBuild) { try { A.freezePerfBuild(A.dbQuery); } catch (eFP) { console.warn('§FREEZE_PERF_BUILD failed: ' + (eFP && eFP.message)); } }   // §FREEZE_PERF_PANEL BUILD, once per bake
      if (_loadPath && A.loadPathBuild) {
        try {
          A.loadPathBuild(plan, _filmSecFull, _revealU, A.db, w, h, fps);   // §129.7 items 3+6 — real output px/fps
          // Finding 4 fix (2026-09-16) — `!window.__lpNoClockFreeze` DROPPED from this condition: the
          // frame-splice/insertion setup below (armTn/holdFrameStart/framesInserted/nFrames inflation,
          // the §LOADPATH_HOLD_INSERT log) must run whenever a hold window exists, regardless of the
          // control — the hold must still visibly happen (still spliced in) under __lpNoClockFreeze.
          // ONLY the separate "hold `_tn` constant during those inserted frames" remap, below near
          // `_lpHoldCtl`, keeps the `!window.__lpNoClockFreeze` gate — that is the one piece this
          // control is meant to defeat, letting the film clock keep advancing under a still-pinned
          // camera pose (cpe_load_path.js's own armPose re-assert, unconditional on this control) so a
          // resume jump reappears, exactly reproducing the pre-splice bug for §LOADPATH_RESUME's own
          // stepAtResume/maxStepElsewhere witness to measure.
          if (A._loadPathWindow && A._loadPathWindow.durSec > 0) {
            _lpNFramesOriginal = nFrames;
            _lpArmTn = _filmSecFull > 0 ? A._loadPathWindow.holdStartSec / _filmSecFull : 0;
            _lpFramesInserted = Math.max(1, Math.round(A._loadPathWindow.durSec * fps));
            // ROUND 9 item 1 — through the SAME grid the frame loop uses (--clip / --frame-range /
            // full film), never a bare armTn*(N-1) (see _lpFrameForArmTn above).
            var _lpGrid = _lpFrameForArmTn(_lpArmTn, _lpNFramesOriginal);
            _lpHoldFrameStart = _lpGrid.frame;
            _lpArmFrameTn = _lpGrid.armFrameTn;
            _lpArmTnMatch = Math.abs(_lpArmFrameTn - _lpArmTn) <= _lpGrid.step + 1e-9;
            A._loadPathArmFrameTn = _lpArmFrameTn; A._loadPathArmTnMatch = _lpArmTnMatch;
            // §LOADPATH_CLIP_SKIP (2026-10-01, red1 clip 1065:1195): a clip that does not CONTAIN the freeze point got the 165 freeze
            // frames spliced onto its last frame anyway (armTnMatch=false => FAIL, ~35 min of wrong freeze). Outside the clip = no freeze.
            if (_frameRange && !_lpArmTnMatch) {
              console.log('§LOADPATH_CLIP_SKIP armTn=' + _lpArmTn.toFixed(4) + ' clipTn=[' + (_frameRange.a / (_frameRange.total - 1)).toFixed(4) + ',' + (_frameRange.b / (_frameRange.total - 1)).toFixed(4) +
                '] — the freeze point is outside this clip: no freeze frames inserted');
              _lpFramesInserted = 0; _lpArmTnMatch = true; A._loadPathArmTnMatch = true;
            }
            nFrames = _lpNFramesOriginal + _lpFramesInserted;
            console.log('§LOADPATH_HOLD_INSERT armTn=' + _lpArmTn.toFixed(4) + ' holdFrameStart=' + _lpHoldFrameStart +
              ' armFrameTn=' + _lpArmFrameTn.toFixed(6) + ' armTnMatch=' + _lpArmTnMatch +
              ' framesInserted=' + _lpFramesInserted + ' nFramesOriginal=' + _lpNFramesOriginal + ' nFrames=' + nFrames +
              (_lpArmTnMatch ? '' : ' => FAIL'));
          }
        } catch (eLPB) { console.warn('§LOADPATH_BUILD_ERR ' + (eLPB && eLPB.message) + ' — load path disabled for this bake'); }
      }
      // §129.2 LEDGER TICKER — built once here, AFTER load path's own window shift above, so the
      // ticker's topout marker lands at the SAME boundary the film actually reaches (§129 preamble
      // order: LOAD PATH hold -> LEDGER seal moment -> stats round). Never re-verifies per frame —
      // one async verifyChainIncremental pass, then the buildup window just paints the count-up.
      if (_ledger && A.ledgerTickerBuild) {
        try { A.ledgerTickerBuild(plan, _filmSecFull, _revealU, A.db); }
        catch (eLTB) { console.warn('§LEDGER_TICKER_BUILD_ERR ' + (eLTB && eLTB.message) + ' — ledger ticker disabled for this bake'); }
      }
      // §FLYTHRU_DATUM — built once from the DB, so it stands at frame one whatever the buildup has
      // reached. Only when Measure is on; a bake without it must cost nothing.
      A._flythruFilmSecFull = _filmSecFull;
      A._flythruDatumOn = !!_measure;
      A.filmLayer = MQS._filmLayerRegister;   // §FILM_LAYER — attached HERE, where A exists (see its note above)
      // §129.6 item 6b — Cost/Ledger pie-chart-HUD rows, gate only (the resource panel itself
      // always runs); the actual rows draw in cpe_resource_panel.js's own
      // resourcePanelCompositeOntoCanvas, reading these two flags (independently, so --no-cost/
      // --no-ledger keep working as separate control overrides even though both share the same
      // parent 4D/5D toggle).
      A._costOdometerOn = !!_costOdo;
      A._pieLedgerOn = !!_ledger;
      A._costOdometerFinalFired = false;   // per-bake reset — a stale true from an earlier bake this same page must never suppress the INCONCLUSIVE line
      if (_measure && A.flythruDatumBuild) {
        try { A.flythruDatumBuild(); }
        catch (eFDB) { console.warn('§FLYTHRU_DATUM_BUILD failed: ' + (eFDB && eFDB.message) + ' — the film bakes without the datum'); }
        // §37.2 — the datum's second life over the finished building, on the pull-out→flyback stretch.
        try { if (A.flythruDatumSetLife2 && plan && plan.beats) A.flythruDatumSetLife2(plan.beats.flyback * _filmSecFull, (plan.beats.rise - ((plan.storeyReveal && plan.storeyReveal.on && plan.storeyReveal.windowFrac > 0) ? plan.storeyReveal.windowFrac : 0)) * _filmSecFull); } catch (eL2) {}
      }
      // §SUN_COMPASS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7) — the true-north rose on
      // the ground, built once from the DB like the datum. OFF unless asked for: it is new, and an
      // overlay that appears in every existing plan's re-bake would silently change films the user
      // already signed off. `sunCompassBuild` returns null and SAYS why (no lat/long, no extent)
      // rather than drawing a rose it cannot justify, and this flag follows that answer so
      // _captureFrame does not have to re-ask every frame.
      A._sunCompassOn = false;
      // §SUN_DAY — set BEFORE the build so the very first frame is already on the pinned day.
      if (_sunCompass && A.sunCompassSetDate) {
        try { A.sunCompassSetDate(_sunDate); } catch (eSD2) {}
      }
      if (_sunCompass && A.sunCompassBuild) {
        // §PLACE — start the city table loading BEFORE the frame loop, so the geo-ref plate has
        // its innermost row from frame 0. Awaited, not fire-and-forget: a table that arrives on
        // frame 200 would put a row on screen halfway through the film, which reads as a glitch.
        // It never blocks for long (one local file, 1.14 MB gzipped) and a failure is silent by
        // design — placeTableLoad resolves null and the row is simply absent.
        if (A.placeTableLoad) { try { await A.placeTableLoad(); } catch (ePT) {} }
        try { A._sunCompassOn = !!A.sunCompassBuild(); }
        catch (eSCB) { console.warn('§SUN_COMPASS_BUILD failed: ' + (eSCB && eSCB.message) + ' — the film bakes without the compass'); }
      } else if (!_sunCompass) {
        console.log('§SUN_COMPASS off — not requested for this bake');
      }
      // §SLAB_BEAT (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §26) — ONE floor plate marked as it
      // is laid: depth-tested tint + X, shine-through label. Rides Measure with the datum. Needs the
      // buildup state (nothing pops without it) and the SAME cursor clock the loop below drives
      // (buildupTAt + buildupCursorAt with nFrames/fps), so the pop second it computes is the frame
      // the film shows. Same never-kills-a-bake contract as its neighbours.
      if (_measure && A.slabBeatBuild) {
        try { A.slabBeatBuild(plan, _filmSecFull, _bkState, _filmSecFull); }
        catch (eSB) { console.warn('§SLAB_BEAT_BUILD failed: ' + (eSB && eSB.message) + ' — the film bakes without the slab beat'); }
      }
      // §LINEAR_BEAT (§27) — one column + one beam during the dive, slots clear of the plate's. Rides Measure.
      if (_measure && A.linearBeatBuild) {
        try { A.linearBeatBuild(plan, _filmSecFull, _bkState, _filmSecFull); }
        catch (eLB) { console.warn('§LINEAR_BEAT_BUILD failed: ' + (eLB && eLB.message) + ' — the film bakes without the linear beat'); }
      }
      // §INDOOR_BEATS (§29) — hall walkable area, stair going, door type, clear height, inside the dive→out window. Rides Measure.
      if (_measure && A.indoorBeatsBuild) {
        try { A.indoorBeatsBuild(plan, _filmSecFull, _bkState); }
        catch (eIB) { console.warn('§INDOOR_BEAT_BUILD failed: ' + (eIB && eIB.message) + ' — the film bakes without the indoor beats'); }
      }
      // §FLYOUT_BEATS (§38.2 / §40.3) — wing spans + roof-edge-to-sill on the clean pull-out canvas.
      // LAST of the Measure builders on purpose: it reads every other layer's taken windows (§14
      // across layers) and must therefore be built after them.
      if (_measure && A.flyoutBeatsBuild) {
        try { A.flyoutBeatsBuild(plan, _filmSecFull); }
        catch (eFB2) { console.warn('§FLYOUT_BEAT_BUILD failed: ' + (eFB2 && eFB2.message) + ' — the film bakes without the fly-out beats'); }
      }
      // §RULE_FILM (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59) — Structural Sanity + Egress
      // findings, scheduled into the storey-reveal window built above. Async (fetches rules JSON,
      // may lazy-load RoomGraph), so awaited like §CLASH_FILM_BUILD below.
      if (_measure && A.ruleFindingsFilmBuild) {
        try { await A.ruleFindingsFilmBuild(A.dbQuery, plan); }
        catch (eRF) { console.warn('§RULE_FILM_BUILD failed: ' + (eRF && eRF.message) + ' — the film bakes without rule findings'); }
      }
      if (_clash && A.clashFilm && A.clashFilm.build) {
        try { await A.clashFilm.build(); }
        catch (eCF) { console.warn('§CLASH_FILM_BUILD failed: ' + (eCF && eCF.message) + ' — the film bakes without markers'); }
        // §CLASH_FILM_P2 — fresh hysteresis/fade state per bake; a previous bake's "near" set must
        // not leak into this one's first frame.
        if (A.clashLabels && A.clashLabels.reset) try { A.clashLabels.reset(); } catch (eCLr) {}
      } else if (_clash) {
        console.warn('§CLASH_FILM_BUILD INCONCLUSIVE reason=clash_film.js not loaded — nothing judged');
      }
      // §CPE_BIG_STATS — the second half's cards, built ONCE from real sources. The pie answers
      // "who is on site today", which is dead after §CPE_BUILDUP_TOPOUT: construction has finished
      // and no trade is active, so the panel drew nothing for the whole reveal round. Runs AFTER
      // §CLASH_FILM_P1 above (§CLASH_HUD_ORDER) so the clash/disc-pair cards see a built film.
      var _pairCards = [];
      try {
        if (_roomTitle && A.bigStatsBuild && _bkState) {
          _bigCards = A.bigStatsBuild(_resOps, _bkState.projectStart, _bkState.projectEnd);
          _pairCards = (_bigCards || []).filter(function (c) { return c && c.discPairKey; });
        }
      } catch (eBS) { _bigCards = null; console.warn('§CPE_BIG_STATS_ERR ' + eBS.message + ' — cards disabled, bake continues'); }
      // §HUD_BOX / §STATUS_BOX / §MEASURE_BOX (§38.1b, §40.1) — the three rectangles are decided ONCE
      // here, from which HUD members THIS bake has, and never again. Per-frame arming would put the
      // status box back on the move the moment the day counter or the pie dropped out for a stretch,
      // which is the whole defect. The stats slot is reserved whenever the labels are on: four
      // different contents take that slot over a film (roster, stat cards, storey-reveal card,
      // measure card) and they all sit at the same stack offset.
      if (A.filmBoxesArm) {
        try {
          A.filmBoxesArm(w, h, { pos: _ovPos,
                                 day: (_dayPos !== 'off' && !!_bkState && !!A.dayCounterAt),
                                 overview: !!_ovPath,
                                 stats: !!_roomTitle });
        } catch (eFB) { console.warn('§FILM_BOXES_ARM_ERR ' + eFB.message + ' — boxes fall back to the old caption plate'); }
      }
      // §CLASH_HUD_PULLBACK_WINDOW (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item C) — derived
      // from the SAME beat fractions/seconds effects.js already computes on `plan`, never re-baked or
      // hardcoded. beats.reveal(tV)/beats.rise(tR) bound the combined tail+pullback span; reveal.tailSec
      // / reveal.riseSec are the UNFOLDED seconds of the tail-caption sub-phase and the true pull-back
      // sub-phase §CPE_DISCIPLINE_REVEAL_PULLOUT's own comment says are blended across that span.
      // tailShare recovers where the tail's caption-cycling ends and the true pull-back begins.
      // Window ends 5s before orbit (plan.beats.rise) per this task's own boundary rule — the sibling
      // storey-reveal lane owns everything from there on.
      var _pullbackU = null;
      if (_clash && plan && plan.beats && plan.durationSec > 0 &&
          plan.beats.reveal != null && plan.beats.rise != null && plan.beats.rise > plan.beats.reveal) {
        var _tV = plan.beats.reveal, _tR = plan.beats.rise;
        var _tailSec = (plan.reveal && plan.reveal.tailSec) || 0;
        var _riseSec = (plan.reveal && plan.reveal.riseSec) || (plan.sec && plan.sec.rise) || 0;
        var _tailShare = (_tailSec + _riseSec) > 0 ? _tailSec / (_tailSec + _riseSec) : 0;
        var _pbStart = _tV + _tailShare * (_tR - _tV);
        var _pbEnd = _tR - (5 / plan.durationSec);
        if (_pbEnd > _pbStart) {
          _pullbackU = { start: _pbStart, end: _pbEnd };
          console.log('§CLASH_HUD_PULLBACK_WINDOW start=' + _pbStart.toFixed(3) + ' end=' + _pbEnd.toFixed(3) +
            ' (tV=' + _tV.toFixed(3) + ' tR=' + _tR.toFixed(3) + ' tailSec=' + _tailSec.toFixed(1) +
            ' riseSec=' + _riseSec.toFixed(1) + ' tailShare=' + _tailShare.toFixed(3) +
            ' durationSec=' + plan.durationSec.toFixed(1) + ' pairCards=' + _pairCards.length +
            ') — 5s before orbit reserved for the storey-reveal lane');
        } else {
          // §CLASH_WINDOW_DIAGNOSTIC (MEP_CLASH_REVEAL_MOVIE.md §66, 2026-09-11) — the old message said
          // "window-too-short" for what is really an INVERSION: the fixed 5s reservation above is
          // larger than the whole pullback sub-phase, so end lands BEFORE start. Same family as
          // §60.4 — a constant tuned on long films degenerating on short ones. Skipping stays correct
          // (clamping the reservation would leave ~0.25s per pair card, unreadable), but the numbers
          // have to be here or a reader cannot tell this is a fact about the film's beat geometry
          // rather than a defect. Real HHS: span 4.03s vs a 5.0s reservation.
          var _spanSec = (_tR - _pbStart) * plan.durationSec;
          var _shortfall = (_pbStart - _pbEnd) * plan.durationSec;
          console.log('§CLASH_HUD_PULLBACK_WINDOW INCONCLUSIVE reason=' +
            (_pbEnd < _pbStart ? 'reservation-exceeds-span' : 'window-too-short') +
            ' start=' + _pbStart.toFixed(3) + ' end=' + _pbEnd.toFixed(3) +
            ' pullbackSpanSec=' + _spanSec.toFixed(2) + ' reservedSec=5.00 shortBySec=' + _shortfall.toFixed(2) +
            ' pairCards=' + _pairCards.length + ' durationSec=' + plan.durationSec.toFixed(1) +
            ' — the 5s storey-reveal reservation is wider than this film\'s whole pullback;' +
            ' disc-pair highlight/cards skipped (a clamped window would give ' +
            (_pairCards.length ? (_spanSec / _pairCards.length).toFixed(2) : '0') + 's per card, unreadable)');
        }
      } else if (_clash) {
        console.log('§CLASH_HUD_PULLBACK_WINDOW INCONCLUSIVE reason=' +
          (!plan ? 'no-plan' : (!plan.beats ? 'no-beats-on-plan' : 'bad-beats')) +
          ' — disc-pair highlight/cards skipped for this bake');
      }
      // §CLASH_DISC_ARRIVAL (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md — user: "align the respective DISC
      // pull out with a focussed DISC by DISC clash set"). Built ONCE per bake off clash_film.js's
      // already-judged pairs and effects.js's OWN parade order (plan.reveal.discs) — never a second
      // ordering derived here, so the clash sets cannot drift from the order the camera reveals.
      var _arrival = null, _arrivalByDisc = {};
      if (_clash && A.clashFilm && A.clashFilm.discArrivalSchedule &&
          plan && plan.reveal && plan.reveal.discs && plan.reveal.discs.length) {
        try {
          _arrival = A.clashFilm.discArrivalSchedule(plan.reveal.discs);
          if (_arrival) _arrival.slots.forEach(function (sl) { _arrivalByDisc[sl.disc] = sl; });
        } catch (eAR) { console.warn('§CLASH_DISC_ARRIVAL failed: ' + eAR.message + ' — parade runs without clash sync'); }
      } else if (_clash) {
        console.log('§CLASH_DISC_ARRIVAL INCONCLUSIVE reason=' +
          (!A.clashFilm || !A.clashFilm.discArrivalSchedule ? 'clash_film-too-old'
            : 'no-reveal-discs-on-plan') + ' — disc parade runs without clash sync');
      }
      // Backdrop pairs (ARC|STR — both disciplines are the shell, which the parade excludes by design)
      // belong to no parade slot. They land at the START of the pullback rotation instead, which is the
      // exact instant the shell comes back SOLID (cpeRevealVisualAt returns null from there on). Done by
      // ORDERING the existing card array, not by a new branch: bigStatsAt walks it in order.
      if (_arrival && _arrival.backdrop.keys.length && _pairCards.length) {
        var _bd = {}; _arrival.backdrop.keys.forEach(function (k) { _bd[k] = 1; });
        _pairCards = _pairCards.slice().sort(function (x, y) {
          return (_bd[y.discPairKey] ? 1 : 0) - (_bd[x.discPairKey] ? 1 : 0);
        });
        console.log('§CLASH_DISC_ARRIVAL pullback card order (backdrop first) [' +
          _pairCards.map(function (c) { return c.discPairKey; }).join(' ') + ']');
      }
      // §MEASURE_BUILDING_CARD — the film's last 3 seconds (the closing roll-to-stop) show the
      // whole-building Measure figures. Queried once per bake, never per frame.
      // The CLOSING ORBIT belongs to the Measure totals, start to finish. (User, after watching the
      // 2026-09-06 ending bake: "The very last quick orbit the cards return to clash info. They should
      // be playing the Measure totals stats.") It previously took only the last 3s, so the normal
      // all-card rotation — clash cards included — played over the rest of the orbit, which is exactly
      // what the user saw. The window is now the whole orbit beat, [beats.rise, 1] — also the one span
      // the storey reveal never touches (it ends AT beats.rise), so the two cannot overlap.
      var _measureCards = null;
      try { if (A.buildingMeasureCards) _measureCards = A.buildingMeasureCards(); }
      catch (eMB) { console.warn('§MEASURE_BUILDING_CARD failed: ' + eMB.message + ' — final cards skipped'); }
      var _measureU = (_measureCards && _measureCards.length && plan && plan.beats &&
                       plan.beats.rise > 0 && plan.beats.rise < 1) ? plan.beats.rise : null;
      if (_measureU != null) {
        console.log('§MEASURE_BUILDING_CARD window=[' + _measureU.toFixed(4) + ',1] cards=' + _measureCards.length +
          ' (the whole closing orbit, ' + ((1 - _measureU) * plan.durationSec).toFixed(1) + 's, ' +
          (((1 - _measureU) * plan.durationSec) / _measureCards.length).toFixed(1) + 's per card)');
      } else if (_measureCards) {
        console.log('§MEASURE_BUILDING_CARD INCONCLUSIVE reason=no-usable-rise-beat — closing cards skipped');
      }
      A._clashHudHighlightLast = null;   // per-bake reset — a prior bake's held highlight must not leak in
      // §129.57 frame-reuse state — per bake, never module-level, so a second bake in the same
      // page can never be handed the previous bake's last frame.
      var _lastFrameKey = null, _lastFrameBlob = null, _frameReuseRun = 0, _frameReuseTotal = 0, _reuseSanityDenied = 0;
      var _prevVisualRev = -1;   // §129.57 — last frame's A._loadPathVisualRev; see the key's own note
      var _frameReuseRuns = 0;
      // ══ §ESCAPE_ROUTE_REVEAL — built ONCE, here, never per frame. It Dijkstras every room to its
      // nearest exit to find the worst case (see cpe_escape_route.js §SELECTION), which is real work
      // and must not land in the frame budget. A null return is a stated reason in the log, and every
      // per-frame call below then no-ops: DEGRADE, DON'T DISABLE.
      var _escRec = null;
      if (_escapeRoute && A.escapeRouteBuild) {
        // §ESCAPE_ROUTE_BREACH — the SAME rulebook the Egress panel reads (rates/egress_rules.json
        // plus whatever jurisdiction overlay is selected), never a re-typed threshold. Loaded
        // BEFORE the build so the record carries its flag from the first frame. A failure here
        // leaves the film with no breach flag, which is the honest degrade — never a guessed limit.
        if (A.loadRuleSet && A.escapeRouteSetRules) {
          try { var _er = await A.loadRuleSet('egress'); A.escapeRouteSetRules(_er.rules, _er.source); }
          catch (eRL) { console.warn('§ESCAPE_ROUTE_RULES load failed: ' + (eRL && eRL.message) + ' — no breach flag this bake'); }
        }
        try { _escRec = A.escapeRouteBuild(); }
        catch (eER) { console.warn('§ESCAPE_ROUTE_BUILD failed: ' + eER.message + ' — the reveal is inert this bake'); }
        var _escWin = (A.escapeRouteWindow && plan) ? A.escapeRouteWindow(plan) : null;
        if (_escRec && _escWin && plan && plan.durationSec > 0) {
          console.log('§ESCAPE_ROUTE_WINDOW film=[' + _escWin.start.toFixed(4) + ',' + _escWin.end.toFixed(4) + ']' +
            ' = ' + (_escWin.start * plan.durationSec).toFixed(1) + 's..' + (_escWin.end * plan.durationSec).toFixed(1) + 's' +
            ' of ' + plan.durationSec.toFixed(1) + 's (inside the closing orbit [' + plan.beats.rise.toFixed(4) +
            ',1]; the storey reveal ends AT beats.rise and the §MEASURE_BUILDING_CARD roll keeps the tail, so' +
            ' neither can collide with this)' +
            (_escWin.capped ? ' — length CAPPED to the ' + ((_escWin.end - _escWin.start) * plan.durationSec).toFixed(1) + 's ceiling' : ''));
        } else if (_escRec) {
          console.log('§ESCAPE_ROUTE_WINDOW INCONCLUSIVE reason=no-usable-rise-beat — the reveal has nowhere to play');
        }
      }
      // §FILM_FIT_PER_SHOT sampler — shots are the plan's beat intervals (plan.beats values inside (0,1)), limited to this
      // bake's film span; sample(t) poses the camera the way the loop does (poseAtFilm + §57.5 gaze blend) and sets t's sun.
      var _filmFitSampler = null;
      try {
        var _bt = [0, 1]; if (plan && plan.beats) Object.keys(plan.beats).forEach(function(k) { var v = plan.beats[k]; if (typeof v === 'number' && v > 0 && v < 1) _bt.push(v); });
        _bt = _bt.sort(function(a, b) { return a - b; }).filter(function(v, k, arr) { return k === 0 || v - arr[k - 1] > 1e-4; });
        var _span = (_clip && _clip.out > _clip.in) ? [_clip.in, _clip.out] : [0, 1];
        var _shots = []; for (var _si = 0; _si + 1 < _bt.length; _si++) { var _a = Math.max(_bt[_si], _span[0]), _b = Math.min(_bt[_si + 1], _span[1]); if (_b > _a) _shots.push([_a, _b]); }
        var _saveCam = null;
        _filmFitSampler = { shots: _shots,
          sample: function(t) { if (!_saveCam) _saveCam = { p: A.camera.position.clone(), q: A.camera.quaternion.clone(), tg: A.controls.target.clone() };
            var p = poseAtFilm(t), d = Math.hypot(p.tx - p.x, p.ty - p.y, p.tz - p.z), tc = (_clip && _clip.out > _clip.in) ? (t - _clip.in) / (_clip.out - _clip.in) : t;
            var g = _blendedGazeTarget(tc, p, d); A.camera.position.set(p.x, p.y, p.z); A.controls.target.set(g.tx, g.ty, g.tz); A.controls.update(); A.camera.lookAt(A.controls.target); A.camera.updateMatrixWorld(true);
            if (A._sunArcStep) A._sunArcStep(t); },
          restore: function() { if (_saveCam) { A.camera.position.copy(_saveCam.p); A.controls.target.copy(_saveCam.tg); A.controls.update(); A.camera.quaternion.copy(_saveCam.q); A.camera.updateMatrixWorld(true); _saveCam = null; } } };
        console.log('§FILM_FIT_SHOTS from plan.beats: ' + _shots.map(function(x) { return '[' + x[0].toFixed(3) + ',' + x[1].toFixed(3) + ']'; }).join(' ') + ' (span ' + _span.join('..') + ')');
      } catch (eFS) { console.warn('§FILM_FIT_SHOTS failed: ' + eFS.message); _filmFitSampler = null; }
      for (var i = 0; i < nFrames; i++) {
        if (MQS._cancel) { console.log('§MAXQ_CANCEL i=' + i); break; }
        // §MAXQ_CONTEXT_LOSS: scene.js's webglcontextlost handler (§S266) sets this — capturing
        // further frames now would just save blank/black canvas with no error, silently corrupting
        // the tail of the movie. Stop here and salvage whatever was captured before the loss,
        // same treatment as the IDB-connection-lost path below.
        if (A._webglContextLost) { _glLost = true; console.log('§MAXQ_GL_LOST i=' + i + ' salvaging ' + framesDone + ' already-captured frames'); break; }
        // §MAXQ_STAGE_KEEP (CPE_4D_PERF_MEM_FINDINGS.md §2c/R1, Witness: witness_maxq_stage_keep.js):
        // keepStaging=true — the photo staging (ground/puddles/HDRI/fog/sky) is per-BAKE state; only
        // the TAA/AO accumulation is per-frame. Tearing staging down here and rebuilding it in the
        // startStillRefine below cost the whole teardown→restage cycle on every frame (the measured
        // §BAKE_FAST_PATH_COST "~660ms/frame unaccounted"). Per-frame sun still moves: _sunArcStep
        // below calls updateSky + shadowMap.needsUpdate itself. The end-of-bake stopStillRefine
        // calls stay full-teardown, so the scene restore on exit is unchanged.
        if (A._stillRefineActive) A.stopStillRefine(true, true);
        // §MAXQ_HIDDEN_PAUSE: park BEFORE the cook, not after. Waiting here means the frame is
        // begun with the tab already visible, so the fold has a real rAF loop to converge on.
        await MQS._awaitVisible('frame ' + i + '/' + nFrames);
        // §DATUM_DECOUPLE — _raf2 waits for two real rAF ticks, falling back to a 1500ms timeout if
        // none fire. With no _composer.render() to composite, Chromium never schedules a real rAF for
        // this page, so BOTH _raf2 calls below hit their fallback every frame — MEASURED: exactly the
        // ~3s dead gap between frames (out/L2_burnin_2026-09-09.log, i=60→61 etc, zero log lines in
        // the gap). Skip them; there is no compositor tick to sync a static PNG draw against.
        if (!A._burninDatumDir) await MQS._raf2('frame ' + i + ' settle');
        // §MAXQ_STAGE_KEEP: SETTLE_MS existed to keep the NEXT staging from capturing mid-restore
        // sun-tint/exposure values as "original" (see its declaration). With staging kept alive
        // there is no restore in flight — sleep only when staging is actually down (frame 0, or a
        // teardown forced by an interaction mid-bake).
        if (!A._photoStagingOn) await MQS._sleep(MQS.SETTLE_MS);
        MQS._freezeRandom();
        // LARGE_DB_BAKE.md §2 L4 — in frame-range mode tNorm is the FULL film's own i/(N-1), offset
        // by the range's start, so a frame at global index g renders identically whether this run
        // covers [0,N) in one bake or [g,g+1) as one slice of a K-way split.
        // §129.6 item 1 — CLOCK FREEZE: when a hold was armed (_lpFramesInserted>0), splice
        // `_lpFramesInserted` frames at `_lpHoldFrameStart` that hold `_tn` CONSTANT at the arm
        // value, then resume the ORIGINAL (pre-insertion) tn progression from EXACTLY that same
        // point — never skipping or re-visiting an original frame. Byte-identical to the old
        // `i/(nFrames-1)` mapping when no hold armed (_lpFramesInserted===0). `_lpHoldCtl` is the
        // explicit, unambiguous "is THIS frame a hold frame" signal cpe_load_path.js's own
        // loadPathApplyVisual now takes instead of re-deriving window membership from (now frozen)
        // tNorm — never computed when frame-range mode is active (a separate large-DB-bake concern,
        // untouched by this fix).
        // Finding 4 fix (2026-09-16) — `!window.__lpNoClockFreeze` ADDED to the "hold `_tn` constant"
        // branch's own condition (it used to live only on whether frames got inserted at all, up at
        // the loadPathBuild call site, which is now unconditional — see that site's own comment).
        // Frames are still spliced in (nFrames/`_lpFramesInserted` are unchanged by this control), so
        // this branch's index ranges are still correct; under the control, EVERY frame — including
        // the spliced-in ones — now falls through to the `else` below, using the SAME plain, ever-
        // advancing `i/(nFrames-1)` mapping the "no hold armed" case always used, with `_lpHoldCtl`
        // left `null` throughout (cpe_load_path.js's own loadPathApplyVisual already has a dedicated,
        // pre-existing fallback for a falsy holdCtl: re-derive window membership from the now-
        // continuously-advancing `fSec` itself — "reproducing the pre-fix behaviour exactly, on
        // purpose, for that control", per its own comment). The camera still visually holds (armPose
        // is re-asserted every frame that fallback says is `inWindow`), but `_tn`/`_tnFilm` keep
        // moving underneath for the WHOLE, now-longer, inserted span — exactly the old "film clock
        // free to keep advancing during the hold" bug — so release snaps the camera to wherever
        // `poseAt(_tn)` has moved on to, reproducing the resume jump §LOADPATH_RESUME's stepAtResume/
        // maxStepElsewhere fields measure.
        var _lpHoldCtl = null, _tn;
        if (_frameRange) {
          // §LOADPATH_CLIP_CLOCK (red1 2026-10-01 on the Hospital mid clip: "it broke the momentum path … getting out of the freeze
          // supposed to continue the full ARC return … straight cut to no ARC DISCs only"). MEASURED: a --frame-range clip ran the
          // film clock THROUGH the 165 inserted hold frames (§FILM_GEOM_WHOLE f=250 tn=0.4653 on a clip whose range ends at 0.4516),
          // so the whole post-freeze return was consumed during the freeze and the clip resumed inside the discipline round. A clip
          // now freezes the clock exactly like the full film (branch below): hold frames pin _tn at the arm frame, later frames are
          // shifted back by the inserted count.
          var _iF = i;
          if (_lpFramesInserted > 0 && !window.__lpNoClockFreeze && i >= _lpHoldFrameStart) {
            if (i < _lpHoldFrameStart + _lpFramesInserted) { _iF = _lpHoldFrameStart; _lpHoldCtl = { inHold: true, elapsedSec: (i - _lpHoldFrameStart) / fps }; }
            else { _iF = i - _lpFramesInserted; _lpHoldCtl = { inHold: false, elapsedSec: null }; }
          } else if (_lpFramesInserted > 0 && !window.__lpNoClockFreeze) _lpHoldCtl = { inHold: false, elapsedSec: null };
          _tn = (_frameRange.a + _iF) / (_frameRange.total - 1);
        } else if (_lpFramesInserted > 0 && !window.__lpNoClockFreeze && i >= _lpHoldFrameStart) {
          if (i < _lpHoldFrameStart + _lpFramesInserted) {
            _tn = _lpNFramesOriginal > 1 ? _lpHoldFrameStart / (_lpNFramesOriginal - 1) : 0;
            _lpHoldCtl = { inHold: true, elapsedSec: (i - _lpHoldFrameStart) / fps };
          } else {
            var _iShifted = i - _lpFramesInserted;
            _tn = _lpNFramesOriginal > 1 ? _iShifted / (_lpNFramesOriginal - 1) : 0;
            _lpHoldCtl = { inHold: false, elapsedSec: null };
          }
        } else {
          // PRE-HOLD frames (i < _lpHoldFrameStart), once a hold has been armed THIS bake, must
          // still divide by the ORIGINAL frame count — `nFrames` was already inflated by
          // `_lpFramesInserted` at the loadPathBuild call site above, and dividing by the inflated
          // total here would silently COMPRESS every frame before the hold (caught by the node dry
          // run, scratchpad/test_clock_freeze.js — a real defect, not a hypothetical one).
          // Finding 4 fix — under `__lpNoClockFreeze` this `else` now ALSO covers what would have
          // been the inserted-hold-frame range (the `if` above no longer matches any frame in that
          // case), so it must divide by the INFLATED `nFrames`, never `_lpNFramesOriginal`, for `_tn`
          // to advance plainly and continuously straight through that span — the whole point of the
          // control. `_lpHoldCtl` is deliberately left `null` here too (never an explicit
          // `{inHold:false}`), so cpe_load_path.js's own fSec-based fallback — not an explicit "not in
          // the hold" signal — decides window membership every frame, including inside that span.
          var _lpDenom = (_lpFramesInserted > 0 && !window.__lpNoClockFreeze) ? _lpNFramesOriginal : nFrames;
          _tn = _lpDenom > 1 ? i / (_lpDenom - 1) : 0;
          if (_lpFramesInserted > 0 && !window.__lpNoClockFreeze) _lpHoldCtl = { inHold: false, elapsedSec: null };   // pre-hold frames, once a hold exists this bake
        }
        // ROUND 19 (2026-09-16, __lpNoClockFreeze regression: real HHS bake, load-path's own STACK
        // reveal stalled at 3/5 and VISIBLE onward never fired) — a SECOND, frame-index-only hold
        // signal, kept fully separate from `_lpHoldCtl` above: unlike `_lpHoldCtl` (left `null`
        // throughout under the control, by Finding 4's own design, so cpe_load_path.js falls back to
        // fSec-based window membership for the camera/clock-jump measurement), `_lpFrameHoldCtl` is
        // ALWAYS derived purely from the loop index `i` against `_lpHoldFrameStart`/`_lpFramesInserted`
        // — the frame-splice boundaries, which `__lpNoClockFreeze` never touches (Finding 4 left the
        // splice/insertion itself unconditional). Passed to loadPathApplyVisual as a NEW, 4th argument
        // so cpe_load_path.js can use it ONLY as its own internal reveal-pacing (STACK/VISIBLE/FRAMING/
        // .../arm+release cycle) fallback when `holdCtl` is falsy — never assigned into `_lpHoldCtl`
        // itself, so Finding 1's own A._loadPathHoldFrameActive/A._loadPathHudAlpha reads (both keyed
        // on `_lpHoldCtl` a few lines below, item 4b's FOCUS fade) are byte-identical, untouched.
        var _lpFrameHoldCtl = (!_frameRange && _lpFramesInserted > 0)
          ? ((i >= _lpHoldFrameStart && i < _lpHoldFrameStart + _lpFramesInserted)
              ? { inHold: true, elapsedSec: (i - _lpHoldFrameStart) / fps }
              : { inHold: false, elapsedSec: null })
          : null;
        // §129.61 FIX — the film-fraction assignment below was DROPPED by the merge. It is the film
        // fraction 40+ call sites below depend on, so every one of them would have thrown
        // ReferenceError on frame 0 and killed the bake. node --check cannot see an undeclared
        // read; W-ESC-4f ("_tnFilm is assigned exactly ONCE per frame") caught it — which is the
        // argument for pulling a peer's witness fixes BEFORE consolidating, not after.
        // It must be assigned here, above the pose ease, because the ease reads it.
        var _tnFilm = _tFilm(_tn);
        // §ESCAPE_ROUTE_REVEAL (merged) — their camera ease, on OUR `_tn`. Ours is the
        // hold-aware clock (§129.57 / the inserted freeze frames depend on it); theirs was the
        // plain i/(nFrames-1), which would have thrown the load-path freeze away. poseAt(_tn)
        // was exactly poseAtFilm(_tFilm(_tn)), so routing through poseAtFilm changes nothing
        // when the ease is off.
        var _poseFilmT = (_escapeRoute && A.escapeRouteEaseFilmT) ? A.escapeRouteEaseFilmT(plan, _tnFilm) : _tnFilm;
        var pose = poseAtFilm(_poseFilmT);  // tNorm hits 1.0 on the last frame so the pull-back completes
        var _gazeDist = Math.hypot(pose.tx - pose.x, pose.ty - pose.y, pose.tz - pose.z);
        // ══ §CAM_FACE_CLOCK (2026-09-20) — THE FACE RIDES THE SAME CLOCK AS THE BODY ═══════════
        // red1, twice: "the scene path seems to veer a bit off during the EscRoute. Check the
        // slowing down that time did not skew the cam face path." Then, after EASE_K was lowered:
        // "the path still veers."
        // MEASURED off the bake's own pose tap (`<out>_poses.json`, 81da0ca6, 846 frames — the bake
        // saying what it rendered, not a pixel): the camera's face ran up to 42.21° off the building
        // centre at frame 775, putting the look-at target 95.7 m off, and came back to 0.01° by
        // frame 833. Zero at both ends of the window, 42° in the middle — the building slides out of
        // frame and returns.
        // CAUSE: this line passed `_tn`, the RAW clock, while `pose` above came from `_poseFilmT`,
        // the EASED one. `_blendedGazeTarget` takes the yaw/pitch of poseAt(raw) and re-projects a
        // target from the eased POSITION — so the camera stood where the ease put it and faced where
        // it would have been looking had there been no ease. The closing orbit sweeps a full 360°
        // across this window, so a lead of k/4 of the window IS a facing error of k/4 × 360°:
        // 54° predicted at EASE_K=0.60 against 42° measured, and ~22° still left at 0.25. Lowering
        // the constant could only ever have divided the veer by 2.4; it could not remove it.
        // FIX: one clock. `_tFilm` is affine, so its inverse is exact, and with both ends on the
        // eased time the warp becomes a PURE REPARAMETRISATION — the camera runs the same curve
        // through space, faster then slower, and cannot leave it at any k. Pacing is untouched.
        // ⚠ This reverses W-ESC-4h ("_poseFilmT is handed to nothing but the pose"), which is what
        // held the two clocks apart. W-ESC-4i still holds the other side: the sun arc, the sun
        // compass, the day counter and the buildup cursor all still read the REAL film fraction.
        var _poseTn = (_clip && _clip.out > _clip.in) ? (_poseFilmT - _clip.in) / (_clip.out - _clip.in) : _poseFilmT;
        var _gazeB = _blendedGazeTarget(_poseTn, pose, _gazeDist);   // §57.5 — direction only, position untouched
        pose.tx = _gazeB.tx; pose.ty = _gazeB.ty; pose.tz = _gazeB.tz;
        var _stickNow = stickApproachAt(_tn);  // §CPE_STICK_APPROACH — null unless the path has sticks
        A.camera.position.set(pose.x, pose.y, pose.z);
        A.controls.target.set(pose.tx, pose.ty, pose.tz);
        A.controls.update();
        // §CLI_SILENT_BAKE item 4 — dev pose tap: undefined in every user session. A scripted
        // runner records the REAL pose each frame and asserts it numerically against the stored
        // path (a bake that runs but ignores the passed path is the silent failure this catches).
        if (typeof window.__maxqPoseTap === 'function')
          try { window.__maxqPoseTap(i, pose.x, pose.y, pose.z, pose.tx, pose.ty, pose.tz, _poseFilmT); } catch (ePT) {}   // W1: + the film time actually posed at (the load-path hold makes it non-linear in i)
        if (A._updateCamLight) A._updateCamLight(pose.tx, pose.ty, pose.tz);
        if (A._updateCamTorch) A._updateCamTorch(pose.tx, pose.ty, pose.tz);   // §CAM_TORCH film (§FILM_LAW Z17, L1b) — no-op unless staged
        // §CPE_BUILDUP: the SECOND per-frame state advance (§MAXQ_TIME's whole premise — mode A moves
        // only the camera, this adds construction state). _tFilm keeps the cursor on the film's own
        // parameter, so a clip samples the middle of the buildup rather than restarting it.
        _dayInfo = null;
        if (_buildup && _bkState) {
          // §CPE_BUILDUP_TOPOUT: the cursor rides the remapped fraction so construction completes
          // at the orbit boundary; the camera keeps its own film fraction untouched.
          var _bkT = MQS._buildupTAt(_tFilm(_tn), plan);
          // §CPE_BUILDUP_WORK_PACED: was `projectStart + t*span` — linear in DAYS. Now linear in
          // ELEMENTS, so the building rises at an even rate regardless of how the derived 4D order
          // clusters its timestamps.
          // §CPE_CLIP_BUILDUP_FILM_T (2026-09-08, found by witness_slab_beat.js's cursor cross-check against the
          // 3 s Clash+Measure bake): this passed `nFrames / fps` — the CLIP's length once §CPE_CLIP has scaled
          // nFrames — so the §CPE_BUILDUP_ONSET_BLEND window read onsetU = min(0.5, 10/3.0) = 0.5 on a 3 s
          // clip and 10/195.8 on the full film: a clip laid the building on a different clock from the film
          // it claims to be a window of. Third instance of the same class (§CPE_CLIP_REVEAL_FILM_T,
          // §CPE_CLIP_SUN_ARC_FILM_T): a clip is fewer frames of the SAME film, so the blend reads the FULL
          // film's seconds. A full bake is unchanged (_filmSecFull === nFrames / fps when no clip is set).
          var _bkMs = MQS._workCursorAt(_bkT, _bkState, _filmSecFull);
          window.tmSetCursor(_bkMs);
          // §CPE_GHOST_GROUND: same film fraction the cursor rides, so the ghost cannot drift out of
          // step with what is actually placed.
          // §CPE_DAY_COUNTER — read off `_bkMs`, the cursor the buildup is ALREADY showing. Any
          // separate clock would be a second opinion about the schedule and would drift from the
          // model on exactly the frames the counter exists to explain.
          if (A.dayCounterAt && _dayPos !== 'off') {
            _dayInfo = A.dayCounterAt(_bkMs, _bkState.projectStart, _bkState.projectEnd);
            // The corner rides ON the info object so _captureFrame needs no second parameter and
            // cannot be handed a position that belongs to a different frame.
            if (_dayInfo) _dayInfo.pos = _dayPos;
          }
          _sunCompassMs = _bkMs;   // §SUN_COMPASS — see the hoisted call below
          var _ggO = MQS._ghostGroundAt(_bkT, _filmSecFull, _bkState, _bkMs);   // §CPE_CLIP_BUILDUP_FILM_T — same class: the fade is in FILM seconds
          // ══ §CPE_BUILDUP_PLACED (MEP_CLASH_REVEAL_MOVIE.md §88.3/§88.6e) ═══════════════════════
          // The frame number lives HERE; what is actually on screen for a watched guid lives in the
          // Time Machine's traverse. This is the seam. Read every frame (so no state change is
          // missed between two §CPE_BUILDUP samples 60 frames apart) but LOG only on change — a
          // 4,699-frame Hospital bake costs a handful of lines, not 4,699 × |watch|.
          if (typeof window.tmWatchState === 'function') {
            var _bdNow = window.tmWatchState();
            if (_bdNow) {
              if (!A._bdSeenLast) A._bdSeenLast = {};
              for (var _bdG in _bdNow) {
                var _bdS = _bdNow[_bdG];
                var _bdK = _bdS.op + '|' + _bdS.mesh + '|' + _bdS.visible + '|' + _bdS.host + '|' + _bdS.y;
                if (A._bdSeenLast[_bdG] === _bdK) continue;
                A._bdSeenLast[_bdG] = _bdK;
                console.log('§CPE_BUILDUP_PLACED frame=' + i + '/' + nFrames + ' guid=' + _bdG +
                  ' cls=' + _bdS.cls + ' storey="' + _bdS.storey + '"' +
                  ' op=' + _bdS.op + ' mesh=' + _bdS.mesh + ' visible=' + _bdS.visible +
                  ' host=' + _bdS.host + ' y=' + _bdS.y +
                  ' groundY=' + (A.ground ? A.ground.position.y.toFixed(3) : 'n/a') +
                  (_ggO == null ? '' : ' groundOpacity=' + _ggO.toFixed(3)) +
                  (_bdS.mesh === 'MISSING' ? ' — scheduled, but NO mesh in the scene carries this guid'
                   : _bdS.visible ? ' — drawn' : ' — mesh exists, left hidden'));
              }
              if (!A._bdEverDrawn) A._bdEverDrawn = {};
              for (var _bdG2 in _bdNow) if (_bdNow[_bdG2].visible) A._bdEverDrawn[_bdG2] = i;
              // §88.5's "what DONE looks like": one line a grep can settle the question on.
              if (i === nFrames - 1) {
                var _bdAll = Object.keys(_bdNow), _bdNever = [];
                for (var _bdI = 0; _bdI < _bdAll.length; _bdI++)
                  if (A._bdEverDrawn[_bdAll[_bdI]] === undefined)
                    _bdNever.push(_bdAll[_bdI] + '(' + _bdNow[_bdAll[_bdI]].storey + ',' + _bdNow[_bdAll[_bdI]].mesh + ')');
                console.log('§CPE_BUILDUP_PLACED_SUMMARY watched=' + _bdAll.length +
                  ' drawn=' + (_bdAll.length - _bdNever.length) +
                  ' neverDrawn=' + (_bdNever.length ? '[' + _bdNever.join(' ') + ']' : 'none'));
              }
            }
          }
          if (i === 0 || i === nFrames - 1 || i % 60 === 0) {
            if (_dayInfo) console.log('§CPE_DAY_COUNTER frame=' + i + ' day=' + _dayInfo.day +
              ' of=' + _dayInfo.totalDays + ' pos=' + _dayInfo.pos + ' cursor=' + Math.round(_bkMs));
            else if (_dayPos === 'off' && i === 0) console.log('§CPE_DAY_COUNTER off — the editor set it off for this bake');
            console.log('§CPE_BUILDUP frame=' + i + '/' + nFrames + ' t=' + _bkT.toFixed(3) +
              ' cursor=' + Math.round(_bkMs) + ' placed=' + (window.tmPlacedCount ? window.tmPlacedCount(_bkMs) : '?') +
              '/' + _bkState.ops +
              (_ggO == null ? '' : ' groundOpacity=' + _ggO.toFixed(3)));
          }
        }
        // §SUN_COMPASS — HOISTED OUT OF THE BUILDUP BLOCK ON PURPOSE (fixed 2026-09-19).
        // ⚠ This call used to sit inside `if (_buildup && _bkState)`, next to the day counter,
        // because it reads the same `_bkMs`. That was wrong and it failed SILENTLY: a film baked
        // with the buildup off never called it, so `A.sunCompassInfo()` stayed null, `_captureFrame`
        // composited nothing, and the sun ray never moved — while `§SUN_COMPASS built` still printed
        // at arm time and every witness still passed. Found by looking at a real baked frame
        // (Hospital, buildup=0): the log said the rose was built and the picture had no overlay on
        // it. The wiring witnesses could not catch it because they call sunCompassAt directly.
        // ⚠ §6 IS STILL KEPT. There is no second date source: `_sunCompassMs` is `_bkMs` when the
        // buildup is driving, and NULL otherwise — because without a buildup cinema_maxq never
        // populates `_bkState`, so no 4D cursor exists to read. The module draws the rose and
        // suppresses the sun in that case rather than inventing a date; see §SUN_COMPASS_NO_CURSOR.
        // ⚠ THE FILM FRACTION IS A SECOND INPUT, not decoration. The compass sweeps the solar hour
        // from morning to late afternoon across the film (§SUN_ONE film clock) so the sun arcs
        // over the building the way the old scripted 55°→6° did — except real. `_tFilm(_tn)` and
        // not `_tn`, for the reason §CPE_CLIP_REVEAL_FILM_T names: a clip is fewer frames of the
        // SAME film, so a clipped bake must light its frames at the hours that stretch of film
        // really has, not replay a whole day inside a 23-frame window.
        if (A._sunCompassOn && A.sunCompassAt) {
          try { A.sunCompassAt(_sunCompassMs, _tFilm(_tn)); }
          catch (eSCA) { if (!A._sunCompassAtWarned) { A._sunCompassAtWarned = true;
            console.warn('§SUN_COMPASS_AT failed frame=' + i + ': ' + (eSCA && eSCA.message)); } }
        }
        // §CPE_DISCIPLINE_REVEAL Mechanism C — pure function of (plan, tNorm), same call the preview
        // loop makes (cinema_path_editor.js's _previewFly) so bake and preview cannot diverge. No-op
        // (returns immediately, does nothing) when reveal is off or tNorm is outside the round.
        // §CPE_CLIP_REVEAL_FILM_T (2026-09-04, found by §SDC's clipped bake — PHOTOREAL_STILL_RENDER.md
        // §BME.8): the Reveal, its lights-off phase and its caption are functions of the FILM's
        // fraction, and a clip is fewer frames of the SAME film (§CPE_CLIP). Feeding them the clip-
        // local _tn played the whole Reveal round inside a 23-frame window. A full bake is unchanged
        // (_tFilm(_tn) === _tn when no clip is set).
        // (_tnFilm is computed at the top of this iteration — see §ESCAPE_ROUTE_CAMERA_EASE there.)
        if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(plan, _tnFilm);
        A._roadPanelTn = _tnFilm;   // §ALTC_PANELS: the film fraction the composite pass draws this frame's road card at
        if (A.cpeArchFadeApplyVisual) A.cpeArchFadeApplyVisual(plan, _tnFilm);   // §57.4-REAL-FADE
        // §STOREY_HIGHLIGHT_REVEAL — the storey tint, windowed to the LAST 5s of `pullback` (ending
        // at plan.beats.rise, the orbit's own start — NOT the orbit beat itself). Pure function of
        // (plan, tNorm), null outside that narrow window by construction, so this can never fire
        // inside the disc-reveal round's own tail above. Same "one pure function, two callers" call
        // cinema_path_editor.js's preview step() makes.
        // §116 (user, 2026-09-13): "Better just hide them all at pull out or last stick as not really
        // needed." The per-storey light gate (§115) capped the SELECTION but the fixtures were still
        // reading as clutter on frames, so the ruling is simpler and absolute: from the LAST STICK
        // (beats.out — where the walk ends and the pull-out begins) to the end of the film, the
        // interior fixtures are OFF. By that point the camera is outside and climbing away; their
        // only contribution is glow in rooms nobody is looking into.
        // §118 — TWO separate facts, deliberately. `_ilPastStick` is WHEN THE WITNESS CHECKS (are we
        // past the last stick?); `_interiorLightsOff` is WHETHER THE GATE IS APPLIED. Tying the
        // witness to the gate flag would make the falsifiability control silence the very check it
        // exists to trip, and a check that switches itself off with the fix is not a check.
        A._ilPastStick = !!(plan && plan.beats && _tnFilm >= plan.beats.out);
        // §129.41 (2026-09-19, red1: "restore back night lighting only after storey build so when
        // dusk or dark its windows are lighted") — §116's ruling is NARROWED, not undone. It said
        // the fixtures are off "from the last stick to the END of the film", and its reason was
        // that they read as clutter while the camera is outside and climbing away. That reason
        // stops holding once the building tops out: from there the film is a closing orbit around a
        // FINISHED building, and the sun this lane now drives is genuinely setting (§SUN_ONE on the
        // HHS bake of this date: elevation 34.7 deg at tNorm 0 down to 1.4 deg at tNorm 1). A dark
        // building at dusk is not restraint, it is an unlit model.
        // So the off-window is now [beats.out, topoutU) instead of [beats.out, end]. `topoutU` is
        // NOT a new number: it is _buildupTopoutU's own, the same fraction the buildup already
        // completes at and the same one §CPE_BUILDUP_TOPOUT prints. Nothing before the last stick
        // changes, which is the part of §116 that was never in question.
        // §129.47 (2026-09-19, red1 on the Hospital film: "Lighting did not cease during Storeys
        // reveal. It can only resume after all storeys returned.") — §129.41 tied the relight to
        // _buildupTopoutU, and that is the WRONG CLOCK when the reveal round is on. MEASURED on
        // Hospital: §INTERIOR_LIGHTS_BOUNDARY lastStickFrac=0.3530 topoutFrac=0.3607
        // src=plan.beats.pullout — an off-window 0.77% of the film wide. The fixtures came back at
        // 36% and stayed on for the remaining 64%, which is the whole reveal round AND the whole
        // storey reveal. With the reveal round OFF, topout is the orbit boundary and §129.41 looked
        // right; with it on, topout moves to the pull-out and the window collapses.
        // The relight point is now the ORBIT START (plan.beats.rise), which is where the storey
        // reveal's own window ends — cpe_storey_reveal.js windows itself to the last seconds of the
        // pull-back "ending at plan.beats.rise, the orbit's own start". So the lights come back when
        // the storeys have returned and the camera is circling the finished building, which is
        // exactly red1's rule, and it no longer depends on where the buildup happens to complete.
        var _ilTopU = (plan && plan.beats && typeof plan.beats.rise === 'number')
          ? plan.beats.rise
          : ((plan && plan.beats) ? MQS._buildupTopoutU(plan).u : null);
        var _ilTop = (_ilTopU != null) ? { u: _ilTopU, src: (plan && plan.beats && typeof plan.beats.rise === 'number') ? 'plan.beats.rise (orbit start = storey reveal end)' : 'topoutU-fallback' } : null;
        A._ilPastTopout = !!(_ilTop && _tnFilm >= _ilTop.u);
        if (plan && plan.beats && !A._ilBoundaryLogged) {
          A._ilBoundaryLogged = true;
          console.log('§INTERIOR_LIGHTS_BOUNDARY lastStickFrac=' + plan.beats.out.toFixed(4) +
            ' relightFrac=' + (_ilTop ? _ilTop.u.toFixed(4) : 'n/a') + ' src=' + (_ilTop ? _ilTop.src : 'n/a') +
            ' offWindowPctOfFilm=' + (_ilTop ? (100 * (_ilTop.u - plan.beats.out)).toFixed(1) : 'n/a') + '%' +
            ' (§129.41 — fixtures ON before the last stick, OFF through the pull-out while the' +
            ' building is still rising, and ON AGAIN from topout to the end so the windows are lit' +
            ' at dusk; a bake clipped entirely below the first boundary must show no' +
            ' §INTERIOR_LIGHTS_OFF line at all)');
        }
        // Two controls, both falsifiable: __ilForceOn defeats the gate outright (§118's own), and
        // __ilNoRelight restores §116's original "off to the end" so the relight can be proved to be
        // the thing that lit the windows, rather than assumed.
        // §FILM_INHERIT: the Alt+S zone grid + sky field describe the FINISHED, uncut building (ALTC_SHOWSTOPPERS S3). Whole =
        // (no build-up, or past its topout) AND (no storey reveal, or past plan.beats.rise where the storeys have returned) AND no
        // discipline hidden by the reveal round (A.hiddenDiscs, set this frame by cpeRevealApplyVisual above). NOT the fixtures'
        // relight clock (§129.47 beats.rise even without a storey reveal): geometry, not lamps, decides. effects.js reads it.
        var _srOn = !!(plan && plan.storeyReveal && plan.storeyReveal.on);
        var _geoTop = (_buildup && plan && plan.beats) ? MQS._buildupTopoutU(plan).u : null;
        var _geoWhy = (_buildup && !(_geoTop != null && _tnFilm >= _geoTop)) ? 'buildup' :
          // storeys are cut only INSIDE the reveal's own window (rise - windowFrac, rise] — cpe_storey_reveal.js:635-637, same
          // arithmetic; not called directly because storeyRevealVisualAt counts parade-wait frames as a side effect.
          (_srOn && plan.beats && typeof plan.beats.rise === 'number' && plan.storeyReveal.windowFrac > 0 &&
            _tnFilm > plan.beats.rise - plan.storeyReveal.windowFrac && _tnFilm <= plan.beats.rise) ? 'storey-reveal' :
          (A.hiddenDiscs && A.hiddenDiscs.size) ? 'discs-hidden:' + Array.from(A.hiddenDiscs).join('+') : '';
        A._filmGeomWhole = !_geoWhy;
        if (_geoWhy !== A._filmGeomWhyLast) { A._filmGeomWhyLast = _geoWhy;
          console.log('§FILM_GEOM_WHOLE f=' + i + ' tn=' + _tnFilm.toFixed(4) + ' whole=' + (_geoWhy ? 0 : 1) + (_geoWhy ? ' why=' + _geoWhy : '') +
            ' topoutU=' + (_geoTop != null ? _geoTop.toFixed(4) : '-') + ' riseU=' + (plan && plan.beats && typeof plan.beats.rise === 'number' ? plan.beats.rise.toFixed(4) : '-') + ' storeyReveal=' + (_srOn ? 1 : 0)); }
        // §INTERIOR_LIGHTS_ARC (red1 2026-10-01, correcting the reading of §116/§129.47: "It is only to be off during freeze, no ARC but
        // to resume when ARC returns. Now this is in conflict with alt-s benefit. Bring it back on."): interior fixtures are OFF only on
        // frames with no architecture on screen — the load-path freeze (this frame's _lpHoldCtl) or a reveal round hiding ARC
        // (A.hiddenDiscs, set above by cpeRevealApplyVisual) — and ON whenever ARC is there. Replaces the film-time window
        // [beats.out, beats.rise). __ilForceOn still defeats the gate (control).
        var _ilNoArc = !!(_lpHoldCtl && _lpHoldCtl.inHold) || !!(A.hiddenDiscs && A.hiddenDiscs.has && A.hiddenDiscs.has('ARC'));
        A._interiorLightsOff = _ilNoArc && !(typeof window !== 'undefined' && window.__ilForceOn);
        if (A._interiorLightsOff !== A._ilArcOffLast) { A._ilArcOffLast = A._interiorLightsOff;
          console.log('§INTERIOR_LIGHTS_ARC f=' + i + ' tn=' + _tnFilm.toFixed(4) + ' lights=' + (A._interiorLightsOff ? 'OFF' : 'ON') +
            ' (' + (A._interiorLightsOff ? ((_lpHoldCtl && _lpHoldCtl.inHold) ? 'freeze' : 'ARC hidden by the reveal round') : 'ARC on screen') + ')'); }
        // §117's witness runs just before capture (search §INTERIOR_LIGHTS_WITNESS), not here:
        // sampled at this point it would read the PREVIOUS frame's lighting and report a phantom
        // FAIL on the first gated frame. Measured — that is exactly what the first version did.
        if (A.storeyRevealApplyVisual) A.storeyRevealApplyVisual(plan, _tnFilm);
        // §STOREY_SECTION_CUT — NOT key-gated like ApplyVisual above: the plane constant moves
        // every frame, so it cannot ride the slot key (§94.3).
        if (A.storeyRevealApplyCut) A.storeyRevealApplyCut(plan, _tnFilm);
        // §129.1/§129.6 item 1 LOAD PATH — arms/holds/restores itself off `_lpHoldCtl` (new,
        // explicit) when this bake armed a hold, else falls back to its own tNorm*filmSecFull
        // self-determination (old behaviour, exactly reproduced under __lpNoClockFreeze).
        // A._loadPathHoldFrameActive is item 8's own FOCUS flag — read by _drawUnlessHold above.
        A._loadPathHoldFrameActive = !!(_lpHoldCtl && _lpHoldCtl.inHold);
        // §129.8 item 4b (amendment, 2026-09-16) — the GLOBAL HUD alpha every _drawUnlessHold call
        // reads: 1 outside the hold; a fade curve (never a hard cut) across the hold's own edges —
        // see _hudFadeT below. window.__lpHudNoFade=1 forces the hard-cut shape the control's own
        // §LOADPATH_HUD_FADE FAIL depends on.
        // §129.27 (2026-09-18, red1 — see this file's own `_hudFadeT` comment above for the full
        // history) — HUD alpha is back to its own dedicated formula, decoupled from backdrop/cut
        // (which are instant now, nothing left to share a curve with). Front-loaded: ramps out over
        // the first `fadeSec` of `elapsed` after arm, back in over the LAST `fadeSec` of the hold's
        // own known `durSec` — finishing at alpha=1 exactly at release, before the building's cut.
        if (A._loadPathWindow && A._loadPathWindow.durSec > 0) {
          var _hudInWindow = !!(_lpHoldCtl && _lpHoldCtl.inHold);
          if (window.__lpHudNoFade) {
            A._loadPathHudAlpha = _hudInWindow ? 0 : 1;
          } else {
            var _hudElapsed = _lpHoldCtl ? _lpHoldCtl.elapsedSec : null;
            var _hudFadeSecNow = A._loadPathFadeSecFor(A._loadPathWindow.durSec);
            A._loadPathHudAlpha = 1 - _hudFadeT(_hudElapsed, _hudInWindow, A._loadPathWindow.durSec, _hudFadeSecNow);
          }
          // ROUND 12 item 2 (2026-09-16, real HHS bake: §LOADPATH_HUD_FADE never printed) —
          // A.loadPathDispose() (called right after the frame loop, BEFORE the end-of-bake summary
          // prints) nulls A._loadPathWindow, so the end-of-bake witness's own `A._loadPathWindow.
          // durSec > 0` guard always failed silently. Snapshot the real hold's own durSec here, every
          // hold frame (cheap, idempotent), so the witness reads THIS instead of the (by then
          // cleared) live window.
          _lpLastHoldDurSec = A._loadPathWindow.durSec;
        } else {
          A._loadPathHudAlpha = 1;
        }
        if (_loadPath && A.loadPathApplyVisual) A.loadPathApplyVisual(plan, _tnFilm, _lpHoldCtl, _lpFrameHoldCtl);
        // §129.6 item 1 — per-frame camera-step log + resume-frame detection for §LOADPATH_RESUME,
        // tracked every frame this beat is active regardless of __lpNoClockFreeze (the witness must
        // work whether the fix is on or the control is reproducing the old bug). Read AFTER the
        // call above so armPose's own re-assert (or its release) has already applied for this frame.
        if (_loadPath && A.camera) {
          var _lpCurCamPos = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
          var _lpStep = _lpPrevCamPos ? Math.hypot(_lpCurCamPos.x - _lpPrevCamPos.x,
            _lpCurCamPos.y - _lpPrevCamPos.y, _lpCurCamPos.z - _lpPrevCamPos.z) : 0;
          _lpCamSteps[i] = _lpStep;
          _lpPrevCamPos = _lpCurCamPos;
          var _lpRestoreCount = A._loadPathRestoreCount || 0;
          if (_lpRestoreCount > _lpPrevRestoreCount) { _lpResumeAtIndex = i; }
          _lpPrevRestoreCount = _lpRestoreCount;
        }
        // §129.2 LEDGER TICKER — per-frame: paints the count-up against its own build-time window,
        // never re-verifies (same no-op-outside-window contract as its neighbours).
        if (_ledger && A.ledgerTickerApplyVisual) A.ledgerTickerApplyVisual(plan, _tnFilm);
        // §ESCAPE_ROUTE_REVEAL — the room shine-through, the scoped x-ray and the overlay-
        // suppression flag (§2 item 7), all on the REAL film fraction. Same "one pure-ish function,
        // two callers" contract as the storey reveal directly above. With the flag off it is never
        // called at all; the forced restore on every bake exit path below is what guarantees the
        // x-ray and the room meshes can never be left engaged.
        if (_escapeRoute && A.escapeRouteApplyVisual) A.escapeRouteApplyVisual(plan, _tnFilm);
        // §FLYTHRU_DATUM — the 3D half: the grid and level rules fade on the same schedule the 2D
        // annotation uses, and depth-test normally so the rising build occludes them (§17.5).
        if (_measure && A.flythruDatumAt) {
          try { A.flythruDatumAt(_tnFilm * _filmSecFull, _filmSecFull); }
          catch (eFDA) { if (!A._flythruDatumAtWarned) { A._flythruDatumAtWarned = true; console.warn('§FLYTHRU_DATUM_AT failed frame=' + i + ': ' + (eFDA && eFDA.message)); } }
        }
        // §SLAB_BEAT — envelope + label lifetime, same film clock as the datum above.
        if (_measure && A.slabBeatAt) {
          // §SLAB_LABEL_STALE — asked BEFORE the beat's own update, so a frame in the closing
          // movement never re-posts the build-up's slab figures. See cpe_slab_beat.js for why the
          // bound is §FINDINGS_HUD_CLEAR and not a new clock.
          try { if (A.slabBeatLabelStaleCheck) A.slabBeatLabelStaleCheck(_tnFilm * _filmSecFull); } catch (eSS) {}
          try { A.slabBeatAt(_tnFilm * _filmSecFull); }
          catch (eSBA) { if (!A._slabBeatAtWarned) { A._slabBeatAtWarned = true; console.warn('§SLAB_BEAT_AT failed frame=' + i + ': ' + (eSBA && eSBA.message)); } }
        }
        // §129 FIX 4 (2026-09-17, root cause of "not a single change is evident" after every whiten/
        // backdrop/cap fix landed) — `indoorHallTint`, a floor-decal annotation this beat's own
        // classification never sees (no guid, `excludeFromAO` — its own comment: "annotation, not a
        // surface"), was found via raycast+visibility-chain diagnosis rendering the exact persistent
        // colour red1 kept reporting. It becomes visible and opaque partway through a beat driven
        // purely by `_tnFilm` — which the load-path hold FREEZES at a constant value — so it settles
        // at one non-zero opacity and calls this EVERY hold frame recomputing that SAME value, AFTER
        // `loadPathApplyVisual`'s own backdrop fade already ran this frame (call order above) — the
        // last write each frame is always this one, winning every single time regardless of what the
        // backdrop fade just set. Skipping the call outright during the hold (never touching its
        // internal state, no risk of leaving it mid-animation — `_tnFilm` is frozen anyway, so a
        // skipped frame is not a lost frame of real motion) lets the backdrop's own top-up/fade be
        // the last word once it discovers this newly-visible mesh.
        if (_measure && A.indoorBeatsAt && !A._loadPathHoldFrameActive) {
          try { A.indoorBeatsAt(_tnFilm * _filmSecFull); }
          catch (eIBA) { if (!A._indoorBeatsAtWarned) { A._indoorBeatsAtWarned = true; console.warn('§INDOOR_BEAT_AT failed frame=' + i + ': ' + (eIBA && eIBA.message)); } }
        }
        if (A.flythruCuesApplyVisual) {
          try { A._flythruFilmSec = _tnFilm * _filmSecFull; A.flythruCuesApplyVisual(A._flythruFilmSec); }
          catch (eFV) { if (!A._flythruCueWarned) { A._flythruCueWarned = true; console.warn('§FLYTHRU_CUE_VISUAL failed frame=' + i + ': ' + (eFV && eFV.message)); } }
        }
        // §CLASH_FILM_P1 (§4) — the pulse is a pure function of FILM seconds, never
        // performance.now(), so a 15 fps and a 24 fps bake of the same film pulse identically and a
        // re-bake is reproducible. Per-instance, so phase 2 can hold a labelled pair solid while the
        // rest keep breathing (§4b). No TM predicate here: the markers are a forecast (§3b).
        // §CLASH_FILM_P2 — the label selector runs BEFORE clashFilm.update so the fade it writes
        // (labelled → solid) lands in THIS frame's marker colours. Proximity + hysteresis + screen-
        // space placement only; it reads the camera and never moves it (ruling 3). The record is
        // handed to _captureFrame below, which draws it in the 2D pass (§P2.2).
        _lblInfo = null;
        // §CLASH_LABELS_STOP_AT_DISC_STATS (2026-09-06, user: "the lingering clash pair pop ups have to
        // end during DISCs stats"). The per-pair [tol/clash mm] pop-ups belong to the FIRST pass, where
        // the camera is close and each label names the pair under the lens. From beats.reveal onward
        // the film is telling a different story — whole SETS of clashes lit by trade, with the count in
        // the HUD — and individual pop-ups compete with the very stats they are meant to support.
        // Cut them at beats.reveal (the parade start), once, and reset so no placed label lingers.
        // DEGRADE, DON'T DISABLE: a plan with no usable reveal beat keeps the old always-on behaviour.
        var _lblStop = (plan && plan.beats && plan.beats.reveal > 0 && plan.beats.reveal < 1)
          ? plan.beats.reveal : null;
        if (_lblStop != null && _tnFilm >= _lblStop) {
          if (!A._clashLblStopped) {
            A._clashLblStopped = true;
            if (A.clashLabels && A.clashLabels.reset) try { A.clashLabels.reset(); } catch (eCLx) {}
            console.log('§CLASH_LABELS_STOP frame=' + i + ' tn=' + _tnFilm.toFixed(4) +
              ' — per-pair pop-ups end here; the disc stats own the screen from the parade on');
          }
        } else if (_clash && A.clashLabels && A.clashLabels.update) {
          try { _lblInfo = A.clashLabels.update(A.camera, _tnFilm * _filmSecFull, w, h, i); }
          catch (eCL) { if (!A._clashLblErrLogged) { A._clashLblErrLogged = true;
            console.warn('§CLASH_LABELS_ERR update: ' + eCL.message + ' — labels skipped, frames continue'); } }
        }
        // §CLASH_FILM_SKY_WASH: the camera goes with it — update() clamps each marker to a constant
        // small SCREEN size from this frame's distance. Guarded: a marker fault must not kill the
        // bake, and the finally's dispose (below) covers the case where it does throw.
        if (_clash && A.clashFilm && A.clashFilm.update) {
          try { A.clashFilm.update(_tnFilm * _filmSecFull, A.camera); }
          catch (eCFu) { if (!A._clashFilmUpdateWarned) { A._clashFilmUpdateWarned = true; console.warn('§CLASH_FILM_UPDATE failed frame=' + i + ': ' + (eCFu && eCFu.message) + ' — markers frozen for the rest of the bake'); } }
        }
        // §CPE_TAIL_LIGHTS_ALL_ONLY (2026-09-04, user: "during last part each DISCipline reveal, the
        // lights are all turned ON that obscures the delicate items scene. Should turn on only during
        // ALL DISCs"). Set BEFORE _applyPhotoStaging runs for this frame — staging is what turns the
        // night lights on and rebuilds the glow, so the flag has to be in place when it does, not
        // after. The answer comes from effects.js's own pure phase function, never re-derived here:
        // the bake, the editor preview and the witness all read the same one.
        A._cpeRevealLightsOff = A.cpeRevealLightsOffAt ? A.cpeRevealLightsOffAt(plan, _tnFilm) : false;
        if (A._cpeRevealLightsOff !== A._cpeRevealLightsOffLast) {
          A._cpeRevealLightsOffLast = A._cpeRevealLightsOff;
          console.log('§CPE_TAIL_LIGHTS_ALL_ONLY frame=' + i + '/' + nFrames + ' lights=' +
            (A._cpeRevealLightsOff ? 'OFF (one-discipline slot — the trade reads on its own)'
                                   : 'ON (not a one-discipline slot)'));
        }
        // §DATUM_DECOUPLE — no real render happens in this mode (§53), so there is no fold to
        // converge: starting it would just accumulate against a canvas nothing ever reads, and
        // §IDLE_GATE's general idle-parking (which normally sees per-frame _composer.render() calls
        // as activity) stalls it forever — MEASURED, first burn-in attempt hung 0 frames/580s+.
        if (!A._burninDatumDir) A.startStillRefine();
        // §SUN_ARC_STOMP_FIX (found live, 2026-08-11 — user report "not high noon" on a real
        // HHS_Office_Federated bake): startStillRefine() calls _applyPhotoStaging() synchronously,
        // which unconditionally re-runs A.updateSky(PHOTO_SUN_ELEVATION, ...) — the FIXED dusk
        // value — every frame (staging is torn down and rebuilt every frame, not once per bake).
        // Calling _sunArcStep() before startStillRefine() (as originally shipped in #1284) meant
        // every frame's noon-to-dusk elevation got immediately overwritten back to the static dusk
        // angle before the frame was ever captured — the arc never reached the output at all, only
        // ever the ORIGINAL fixed 6°. Moving the call to AFTER startStillRefine() re-asserts the
        // correct per-frame elevation once the staging reset has already happened.
        // §CPE_CLIP_SUN_ARC_FILM_T (2026-09-05, found in the §CLASH_FILM demo clip's own log): the arc
        // was fed the CLIP-LOCAL _tn, so a --clip bake swept the full 55°→6° arc inside its own
        // frames wherever the clip sat in the film (measured: elevation 55.0→6.0 across a 206-frame
        // clip at film 0.66–0.73). Same bug class §CPE_CLIP_REVEAL_FILM_T fixed for the Reveal above:
        // a clip is fewer frames of the SAME film, so the sun reads the film fraction. A full bake is
        // unchanged (_tFilm(_tn) === _tn when no clip is set).
        // §SUN_ARC_TOPOUT_SNAP REVERTED (2026-09-06): the sun reads the film fraction alone — the linear
        // 55°→6° arc is the film's own dusk. _revealU still drives the Reveal round and the fill pin below.
        if (A._sunArcStep) A._sunArcStep(_tnFilm);
        // §SUN_ARC_FILL / §BAKE_FILL_PIN (2026-09-05, effects.js, witness_sun_arc_fill.js): the interior
        // fill — ambient, hemi, fixture point-light scale/budget — is PINNED to the Alt+S baseline on
        // every frame, whatever the arc above just did to the sun (user ruling: "letting alt-s normal,
        // and sunlite is brighter"). Runs AFTER _sunArcStep and AFTER startStillRefine, so it is the
        // last word on the fill before this frame's capture. Bake-only by this gate; sun position/
        // intensity/shadow are not touched by it. Fed _tnFilm, same §CPE_CLIP_SUN_ARC_FILM_T reason —
        // its elevation fallback/log label must read the film fraction under a --clip bake too.
        // §PL_TOPOUT_UNPIN — _revealU exactly as _sunArcStep gets it: past topout the fixtures ease to their
        // tuned night intensity; before it (or with no plan beats) the pin is byte-identical to before.
        // §FILM_PARITY — this frame's Alt+S decisions (daylight glow, lamps-outside, shadow fit, portals) on this frame's sun
        // and camera, BEFORE the pin, so the pin's lamp pool update sees the flag (effects.js A._filmParityStep).
        if (A._maxqActive && A._filmParity && !A._giFilmArmed && window.GiFilm) { A._giFilmArmed = true; window.GiFilm.arm(); }   // §GI_FILM — staging decided parity
        if (A._maxqActive && A._filmParity && A._filmParityStep) A._filmParityStep(i, _tnFilm, _filmFitSampler);
        if (A._maxqActive && A._sunArcFillPin) A._sunArcFillPin(_tnFilm, _revealU);
        // §FILM_LAW S1 (bim-compiler ALTC_SHOWSTOPPERS.md §FILM_LAW; ALT+C R1): meter this frame (same §METER_EV chain as Alt+S)
        // and ease the exposure toward it at the engine adaptation speeds, frame clock 1/fps. LAST light write before the fold.
        // §LOADPATH_STACK_ONLY: exposure held through the freeze (a black frame with one stack would otherwise be metered up).
        if (A._maxqActive && A._filmParity && !A._burninDatumDir && A._filmExposureStep && !(A._lpStackOnly && A._loadPathHoldFrameActive)) { try { A._filmExposureStep(i, fps); } catch (eFE) { console.warn('§FILM_EXPOSURE failed: ' + eFE.message); } }
        var ok = A._burninDatumDir ? true : await MQS._waitFoldDone(30000, 'cook of frame ' + i + '/' + nFrames);
        if (!A._burninDatumDir) await MQS._raf2('frame ' + i + ' capture');
        // §SHADOW_FRONTIER_AT_CAPTURE (2026-08-12) — the real answer, checked at the real moment:
        // does the actively-installing (frontier) geometry have castShadow=true right now, right
        // before this exact frame gets saved? Only logs when there's something under construction
        // to check (self-throttling). window.__tmFrontierGuidsNow is set by time_machine.js's own
        // renderAtTime(), the same tick that just ran inside _raf2() above.
        if (window.__tmFrontierGuidsNow && window.__tmFrontierGuidsNow.size > 0) {
          var _fGuids = window.__tmFrontierGuidsNow;
          var _fTrue = 0, _fFalse = 0, _fMatched = 0;
          var _fBatchTrue = 0, _fBatchFalse = 0, _fBatchObjs = 0;
          // §MAXQ_STAGE_KEEP / R1 (CPE_4D_PERF_MEM_FINDINGS.md §2c): the answer this check gives is
          // unchanged, but a full scene.traverse with a linear _batchMeta/_instanceMeta scan per
          // batched object ran EVERY captured frame. Index guid→object ONCE per _metaGen (the same
          // staleness key TM's own event index uses — streaming/re-stream bumps it, sprite churn
          // does not), then answer each frame from the frontier set alone (O(frontier), not
          // O(scene×slots)). Counting semantics preserved exactly: individual meshes tally per
          // MESH; a batched/instanced object tallies ONCE if ANY of its slots is frontier — the
          // same batch-wide-castShadow caveat as before (see the retained comment below).
          // Steel beams/columns (isSteel, time_machine.js) are the most likely frontier class
          // to be batched/instanced, not individually meshed -- castShadow there is a BATCH-wide
          // flag (shared by every slot in that object, frontier or not), so this reports the
          // batch's own flag whenever ANY of its slots is currently a frontier guid, not a
          // per-instance answer -- the finest-grained truth this rendering architecture allows.
          if (!MQS._fcIdx || MQS._fcIdx.gen !== A._metaGen) {
            var _fcT0 = performance.now();
            MQS._fcIdx = { gen: A._metaGen, mesh: new Map(), group: new Map() };
            A.scene.traverse(function(o) {
              // Same branch precedence as the traverse this replaces: an isMesh with its own
              // userData.guid answers as an individual mesh first (BatchedMesh/InstancedMesh
              // included, matching the original's first-branch test); its slot guids still
              // register below so the batch answer exists for OTHER frontier slots.
              if (o.isMesh && o.userData && o.userData.guid) {
                var _ml = MQS._fcIdx.mesh.get(o.userData.guid);
                if (_ml) _ml.push(o); else MQS._fcIdx.mesh.set(o.userData.guid, [o]);
              }
              if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
                var _bm = A._batchMeta[o.id];
                for (var _bi = 0; _bi < _bm.length; _bi++)
                  if (!MQS._fcIdx.group.has(_bm[_bi].guid)) MQS._fcIdx.group.set(_bm[_bi].guid, o);
              } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
                var _im = A._instanceMeta[o.id];
                for (var _ii = 0; _ii < _im.length; _ii++)
                  if (!MQS._fcIdx.group.has(_im[_ii].guid)) MQS._fcIdx.group.set(_im[_ii].guid, o);
              }
            });
            console.log('§SHADOW_FRONTIER_IDX built gen=' + MQS._fcIdx.gen + ' meshGuids=' + MQS._fcIdx.mesh.size +
              ' groupGuids=' + MQS._fcIdx.group.size + ' ms=' + (performance.now() - _fcT0).toFixed(1));
          }
          var _fSeenGroups = new Set();
          // §VAC / §R14.1 (CPE_4D_PERF_MEM_STUDY.md): _fUnmatched counts the third outcome this
          // forEach always had and never reported — a frontier guid present in NEITHER index.
          // Without it, "frontierGuids=10 batchObjsContainingFrontier=4" cannot distinguish six
          // guids DEDUPED into already-seen batch objects from six guids the indexes never had
          // (the streamed set is 63,182 guids; TM places 63,417 — a 235-guid gap that nothing on
          // disk can currently attribute). This is a counter on an existing else-branch, not a
          // new measurement.
          var _fUnmatched = 0;
          _fGuids.forEach(function(g) {
            var _ml = MQS._fcIdx.mesh.get(g);
            if (_ml) { for (var _mi = 0; _mi < _ml.length; _mi++) { _fMatched++; if (_ml[_mi].castShadow) _fTrue++; else _fFalse++; } return; }
            var _go = MQS._fcIdx.group.get(g);
            if (_go) { if (!_fSeenGroups.has(_go)) { _fSeenGroups.add(_go); _fBatchObjs++; if (_go.castShadow) _fBatchTrue++; else _fBatchFalse++; } return; }
            _fUnmatched++;
          });
          // §VAC V1 — the singleMesh_* triplet is VACUOUS whenever the single-mesh index is empty,
          // and on a device that took the fast batched path it always is. MEASURED, s5_hospital.log
          // (2,027 frames): §SHADOW_FRONTIER_IDX meshGuids=0 groupGuids=63182, §BATCHED_FAIL count 0,
          // §RENDERER_CAPS multi_draw=on — so all three streaming.js fallbacks that give a lone
          // THREE.Mesh a userData.guid (BatchedMesh ctor throw / BatchedMesh unavailable / oversized
          // spill) were never taken. The matcher is NOT broken: it is a Map.get against a Map of
          // size 0. Printing three bare zeros made 286 firings look like a judged result; they were
          // never a result. The batch half of the line IS judging (batchObjsContainingFrontier was
          // non-zero on every one of those 286 firings) and is printed unchanged.
          var _fSingle = (MQS._fcIdx.mesh.size === 0)
            ? 'singleMesh=VACUOUS (no individually-meshed elements in this scene — §SHADOW_FRONTIER_IDX meshGuids=0; all geometry is batched/instanced)'
            : 'singleMesh_matched=' + _fMatched + ' castShadowTrue=' + _fTrue + ' castShadowFalse=' + _fFalse;
          console.log('§SHADOW_FRONTIER_AT_CAPTURE frame=' + i + ' frontierGuids=' + _fGuids.size +
            ' ' + _fSingle +
            ' batchObjsContainingFrontier=' + _fBatchObjs + ' batchCastShadowTrue=' + _fBatchTrue + ' batchCastShadowFalse=' + _fBatchFalse +
            ' unmatched=' + _fUnmatched +
            ((MQS._fcIdx.mesh.size === 0 && _fBatchObjs === 0) ? ' VERDICT=INCONCLUSIVE (nothing judged this frame)' : ''));
        }
        MQS._restoreRandom();
        // A timeout can now only mean a genuinely slow frame, since hidden time no longer counts
        // against the budget. Counted rather than merely warned: the total is what lets the run
        // state its own health at the end instead of leaving a degraded film to look identical to
        // a good one.
        if (!ok) { MQS._unconverged++; console.warn('§MAXQ_FRAME_TIMEOUT i=' + i + ' — capturing as-is (UNCONVERGED, count=' + MQS._unconverged + ')'); }
        // §CPE_DISCIPLINE_REVEAL_PULLOUT: the tail's disc-parade caption REPLACES the room title for
        // exactly its slots ('tail-one'/'tail-all') — pure function of (plan, tNorm), checked FIRST so
        // it can override; returns null everywhere else (round 1, pull-out, round 2, rise proper), in
        // which case the normal room-title lookup below runs untouched. Same call the preview tick
        // makes (cpe_room_title.js's roomTitleLiveTick) so bake and preview cannot diverge.
        // §40.1 — each source is asked EXACTLY ONCE and kept separately, then two things are built
        // from the same answers: `_statusSrc` (the four fixed §STATUS_BOX rows) and `_titleInfo`
        // (the old single-winner caption, still needed for the DOM status line below and for the
        // fallback path when cpe_film_boxes.js failed to load). Asking twice would double-log
        // §FLYTHRU_CUE_ON and §STOREY_REVEAL_TIMING.
        var _srReveal = (A.cpeRevealCaptionAt) ? A.cpeRevealCaptionAt(plan, _tnFilm) : null;
        var _srStorey = (A.storeyRevealCaptionAt) ? A.storeyRevealCaptionAt(plan, _tnFilm) : null;
        var _srRoom = (_titleSegs && A.roomTitleOpacityAt) ? A.roomTitleOpacityAt(_titleSegs, i / fps) : null;
        // §FLYTHRU_CUES caption — it used to ride the ROOM-TITLE renderer. §40.1 moves it to the
        // Measure box (cpe_flythru_cues.js posts it there); it is asked here only so the DOM status
        // line and the no-boxes fallback keep the behaviour they had.
        var _srCue = null;
        if (A.flythruCueCaptionAt) { try { _srCue = A.flythruCueCaptionAt(_tnFilm * _filmSecFull); } catch (eFCap) {} }
        // the frontier phase was smuggled into the room caption as " [phase]" by roomTitleFinalText,
        // which is what made that plate resize mid-shot. It gets its own fixed row now.
        // §STOREY_INFO_NOT_IN_HUB (2026-09-10, user: "the storey by storey info should not be in
        // the HUB but in that extra right bottom side info panel consistent with other measures") —
        // _srStorey is still computed above (keeps its own §STOREY_REVEAL_TIMING logging alive) but
        // deliberately excluded from both the STATUS_BOX's four fixed rows and the single-winner
        // caption fallback. storeyRevealStatCardAt's own card already carries the storey name — since
        // §STOREY_CARD_INK it is `card.big`, the slot the storey's own tint colour paints, not the
        // plain `card.label` — through the SAME bottom-right bigStats panel every other measure card
        // uses (§CPE_HUD_ORDER); that is the ONLY place storey info appears on screen.
        // §75 (2026-09-12, user: "Just the storey sub title is blank, take it from the long
        // truncating line"). The Room row was carrying the storey AND the rooms in one line —
        // "Level 1 ≈ Hall/Corridor 1, ≈ Hall/Corridor 2, Level 4 ≈ Hall/Corridor 4" — which
        // truncated, while the Storey row beside it sat empty. cpe_room_title.js now hands back the
        // two halves separately (split where the line is COMPOSED, never by re-parsing it), so each
        // row shows its own part and the room line is roughly half as long.
        var _srStoreyRow = (_srRoom && _srRoom.storeyName)
          ? { name: _srRoom.storeyName, opacity: _srRoom.opacity } : _srStorey;
        var _srRoomRow = (_srRoom && _srRoom.roomName)
          ? { name: _srRoom.roomName, opacity: _srRoom.opacity } : _srRoom;
        // §ALTC_V3_CHAINAGE_ROW (user 2026-10-06: "remove the term Jelapang from that HUD box on the right"): a road has no rooms, so the
        // Room row fell back to the model name. A road film shows the camera's chainage along the drive instead (A.civilChainageAt).
        var _civRowLabel = null;
        if (A.civilChainageAt && A.camera) {
          var _chM = A.civilChainageAt(A.camera.position.x, A.camera.position.z);
          if (_chM != null) { _srRoomRow = { name: Math.round(_chM).toLocaleString('en-US') + ' m (inferred)', opacity: 1 }; _civRowLabel = 'Chainage'; }
        }
        var _erCapRow = (_escRec && A.escapeRouteCaptionAt) ? A.escapeRouteCaptionAt(plan, _tnFilm) : null;
        // §STATUS_BOX owns the captions in a bake, so the escape caption goes in the Reveal row —
        // during its window the escape route IS the reveal, and it outranks the storey reveal for
        // the same reason it outranks it in the _titleInfo chain below. Without this the caption
        // would simply vanish with the duplicated lower-third bar deleted above.
        var _statusSrc = { storey: _srStoreyRow, room: _srRoomRow, roomLabel: _civRowLabel, buildup: A.tmFrontierPhase || '',
                           reveal: _erCapRow || _srReveal };
        // §ESCAPE_ROUTE_REVEAL (merged) — the escape caption OUTRANKS reveal/storey while its
        // window is open, which is the precedence their own chain had. Everything else keeps
        // ours: _srReveal/_srCue/_srRoom and the _statusSrc rows above are untouched.
        // §75 HALF-APPLIED (found 2026-09-20). §75 split the room title into its two halves and
        // wired the split into the STATUS BOX above — then left this chain reading `_srRoom`, the
        // pre-§75 COMBINED string. Evidence, from clip_1127.log and its frames: the status box got
        // Storey="Level 4, Level 1" Room="≈ Hall/Corridor 2, …" while the caption read
        // "Level 1 ≈ Hall/Corridor 4, ≈ Hall/Corridor 5 +3" — storey and rooms glued together,
        // exactly the format §75 retired, running off the right edge at 854 px.
        var _titleInfo = _erCapRow || _srReveal || _srCue || _srRoomRow || null;
        // §CPE_PATH_OVERVIEW — the pose is read HERE, after every camera write for this frame and
        // immediately before the capture, so the head marks the shot that was actually rendered.
        // §CPE_POV_MARKER's rule (cinema_path_editor.js:3789): read the REAL transform, never
        // re-derive it from the path parameter.
        var _ovInfo = null;
        if (_ovPath && A.camera) {
          _ovInfo = { ov: _ovPath, pos: _ovPos,
                      pose: { pos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
                              target: (A.controls && A.controls.target)
                                ? { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z }
                                : null } };
        }
        // §CPE_BIG_STATS — ONE panel slot, two answers. While trades are working it is the
        // composition pie; once the programme has topped out (nothing is being built, so the pie is
        // honestly empty) the same slot revolves big headline numbers instead. The switch is the
        // pie's OWN emptiness, not a hardcoded film fraction — a building whose work runs to the
        // last frame keeps the pie the whole way, with no second opinion about when topout was.
        // §CPE_PIE_HOLD + §CPE_STATS_TAIL — TWO ROUNDS, and the user's ruling is that they behave
        // differently (2026-08-30): "In the first round, if nothing is added, that last info holds
        // and wait till a new one arrives, not intersperse" … "[the highlights] should all be in
        // play during the 'Reveal' 2nd round."
        //   ROUND 1 (buildup, u < topoutU): the panel is the schedule and NOTHING rotates. If the
        //     day has no staffed op the last real composition HOLDS until a new one arrives.
        //   ROUND 2 (the Reveal, u >= topoutU): the schedule has topped out and the counter is
        //     pinned — MEASURED at ≈125 s of the user's 229.8 s Hospital film — so the whole set of
        //     highlights revolves here, with the roster as one of the slots so nothing is lost.
        // The boundary is the plan's own topout (§CPE_BUILDUP_TOPOUT), not a new constant. With no
        // plan beats to read it degrades to "the ops can no longer change" — DEGRADE, DON'T DISABLE.
        var _resInfo = null, _statInfo = null, _holdInfo = null;
        if (_resOps && _bkState && A.resourcePanelHoldAt) {
          _holdInfo = A.resourcePanelHoldAt(_bkMs, _resOps, _bkState.projectStart, _bkState.projectEnd);
        }
        // §HUD FIX (2026-09-15) — §COST_ODOMETER's own logic/logging (day-tracking, the FINAL
        // check) runs HERE, unconditionally, every frame this far — NEVER inside the resource
        // panel's own draw path, which stops being called once the film enters the Reveal/stats
        // round (a real HHS bake showed 8 day= lines and NO FINAL at all: the panel had already
        // swapped to the stats card by the time progress crossed 1.0). The DRAW path (cpe_resource_panel.js's
        // own _pieCostLedgerRows) only ever reads the cached result now.
        if (_costOdo && A.costOdometerTick) { try { A.costOdometerTick(_holdInfo); } catch (eCoT) { console.warn('§COST_ODOMETER_TICK_ERR ' + (eCoT && eCoT.message)); } }
        // §CPE_STATS_TAIL_CLIP (2026-09-06) — compare the FILM fraction, not the clip-local one.
        // `_revealU` is a fraction of the WHOLE film (it comes off the plan's own topout beat), so
        // testing it against `i/(nFrames-1)` — which runs 0..1 across whatever slice was baked — put
        // the Reveal round at the wrong instant on every `--clip` run: a clip of the film's last 20%
        // did not enter the Reveal round until 64% of the way through itself. Same clip-local-vs-film
        // confusion §BME.8 fixed a few lines above for the reveal visuals; `_tnFilm` is already that
        // corrected value, and `_tFilm(_tn) === _tn` when no clip is set, so a FULL bake is unchanged.
        var _inReveal = (_revealU != null)
          ? (nFrames > 1 ? _tnFilm >= _revealU : false)
          : !!(_resOps && _bkState && A.resourcePanelFrozenAt &&
               A.resourcePanelFrozenAt(_bkMs, _resOps, _bkState.projectStart, _bkState.projectEnd));
        if (!_inReveal) {
          if (_holdInfo) _resInfo = { info: _holdInfo, pos: _ovPos };   // round 1: hold, never rotate
        } else if (A.tailPanelAt) {
          // ══ §CPE_ROSTER_NOT_A_HIGHLIGHT (2026-09-04, user) ═══════════════════════════════════
          // USER: "the last card during buildUP gives way to rotating slides highlights. But the
          // last buildUp went along as part of the highlights. That slide of last buildup, drop
          // that only. Let highlights be just highlights which are fine."
          // §CPE_STATS_TAIL made the held crew roster ONE OF the revolving slots so that "nothing
          // the panel used to say is lost to the cards". That reasoning was about round 1's
          // content not vanishing — but the roster IS round 1: it is the build-up's last live
          // composition, frozen. Carrying it into the Reveal rotation puts a build-up slide in
          // among the finished-building highlights, which is the one thing the Reveal round exists
          // to stop doing. The crew is not lost: it holds, un-rotated, for the whole of round 1
          // (the `if (!_inReveal)` branch above), which is where it means something.
          // `_holdInfo` is still COMPUTED above because round 1 needs it — only the Reveal round's
          // rotation stops receiving it. Passing null makes tailPanelAt's own `hasRoster` false, so
          // the rotation is the cards and nothing else; no new constant, no second boundary.
          // ⚠ DEGRADE NOTE: with no cards built (§CPE_BIG_STATS INCONCLUSIVE — no source), the tail
          // rotation is now EMPTY and the panel is omitted, where before the roster alone would
          // have kept it on screen. That is the user's ruling ("just highlights"), and the §-line
          // below names it rather than leaving a blank corner unexplained.
          // §CLASH_HUD_PULLBACK_WINDOW / item C (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5) —
          // inside the pullback sub-window the tail rotation is FORCED to just the disc-pair cards,
          // one discipline pair at a time, and clash_film.js's own highlight (setFade) is driven from
          // the SAME shown card the SAME frame — "the highlighted markers and the flashed number are
          // the same fact, not two unrelated timers" (dispatch wording). Outside the window (or with
          // no disc-pair cards to show) the normal all-card rotation below runs exactly as it always
          // has, and any held highlight is explicitly released on the transition out.
          var _si;
          // §CLASH_DISC_ARRIVAL — during the tail's disc parade the clash set is driven off the parade's
          // OWN clock (A.cpeRevealVisualAt, the same pure function the camera/caption already use), not a
          // second window: when the parade slot shows discipline D, the pairs D BRINGS WITH IT light solid
          // and the HUD flashes that trade's count. A slot whose trade brings no clash (PLB on Hospital)
          // shows no clash card at all and clears the highlight — per the user's ruling that a 0 is not
          // worth a card here ("the idea with HUD is to be best effort and it is abstract, align to what
          // is been shown"), the same §VACUOUS rule bigStatsBuild already holds every card to.
          var _pv = (_arrival && A.cpeRevealVisualAt) ? A.cpeRevealVisualAt(plan, _tnFilm) : null;
          var _paradeSlot = null, _paradeKeys = null, _paradeCard = null;
          if (_pv && _pv.phase === 'tail-one' && _pv.discs && _pv.discs.length) {
            _paradeSlot = _arrivalByDisc[_pv.discs[0]] || null;
            if (_paradeSlot && _paradeSlot.count > 0) {
              _paradeKeys = _paradeSlot.keys;
              _paradeCard = { big: String(_paradeSlot.count),
                label: (A.cpeRevealDiscLabel ? A.cpeRevealDiscLabel(_paradeSlot.disc) : _paradeSlot.disc) + ' clashes',
                sub: _paradeSlot.running + ' of ' + _arrival.total + ' so far',
                src: 'clash_film pairs, assigned to the later-arriving trade' };
            }
          } else if (_pv && _pv.phase === 'tail-all' && _arrival) {
            // Services all on screen together — hold every parade-assigned set solid, show the subtotal.
            _paradeKeys = [];
            _arrival.slots.forEach(function (sl) { _paradeKeys = _paradeKeys.concat(sl.keys); });
            if (_paradeKeys.length) {
              _paradeCard = { big: String(_arrival.slots[_arrival.slots.length - 1].running),
                label: 'services clashes', sub: 'all trades installed',
                src: 'clash_film pairs, parade slots summed' };
            } else { _paradeKeys = null; }
          }
          var _inPullback = !!(_pullbackU && _tnFilm >= _pullbackU.start && _tnFilm < _pullbackU.end);
          if (_paradeCard) {
            _si = { card: _paradeCard, idx: (_paradeSlot ? _paradeSlot.idx : 0),
                    n: (_arrival ? _arrival.slots.length : 1), opacity: 1 };
            var _pk = 'PARADE:' + (_paradeSlot ? _paradeSlot.disc : 'ALL');
            if (A._clashHudHighlightLast !== _pk && A.clashFilm && A.clashFilm.highlightDiscPair) {
              var _ph = A.clashFilm.highlightDiscPair(_paradeKeys);
              A._clashHudHighlightLast = _pk;
              console.log('§CLASH_DISC_ARRIVAL_HIGHLIGHT frame=' + i + ' slot=' + _pk +
                ' keys=[' + _paradeKeys.join('+') + '] count=' + _paradeCard.big +
                ' groupSize=' + (_ph && _ph.groupSize) + ' changed=' + (_ph && _ph.changed));
            }
          } else if (_pv && (_pv.phase === 'tail-one' || _pv.phase === 'tail-all')) {
            // A parade slot with nothing to show (e.g. PLB): no clash card, no held highlight.
            _si = A.tailPanelAt(_bigCards, i / fps, null);
            if (A.clashFilm && A.clashFilm.highlightDiscPair && A._clashHudHighlightLast != null) {
              A.clashFilm.highlightDiscPair(null);
              console.log('§CLASH_DISC_ARRIVAL_HIGHLIGHT frame=' + i + ' slot=PARADE:' +
                (_pv.discs && _pv.discs[0]) + ' keys=[] count=0 — no clash for this trade, back to ambient');
              A._clashHudHighlightLast = null;
            }
          } else if (_inPullback && _pairCards.length) {
            // §CPE_CARD_SPAN — index off the WINDOW, not the absolute film clock. bigStatsAt made the
            // pullback open on whatever card the global rotation happened to be at (measured on the
            // 2026-09-06 ending bake: ELEC|STR for 0.6s before reaching the intended ARC|STR) and
            // 7 cards x 4.5s overran the 25.9s window, cutting the tail of the list and repeating the
            // first. bigStatsAtSpan walks all of them exactly once, so the backdrop card really does
            // land as the shell comes back solid.
            _si = A.bigStatsAtSpan(_pairCards, (_tnFilm - _pullbackU.start) / (_pullbackU.end - _pullbackU.start));
            if (_si && _si.card && A.clashFilm && A.clashFilm.highlightDiscPair) {
              if (A._clashHudHighlightLast !== _si.card.discPairKey) {
                var _hl = A.clashFilm.highlightDiscPair(_si.card.discPairKey);
                A._clashHudHighlightLast = _si.card.discPairKey;
                console.log('§CLASH_HUD_HIGHLIGHT frame=' + i + ' pair=' + _si.card.discPairKey +
                  ' groupSize=' + (_hl && _hl.groupSize) + ' changed=' + (_hl && _hl.changed));
              }
            }
          } else {
            _si = A.tailPanelAt(_bigCards, i / fps, null);
            if (_clash && A.clashFilm && A.clashFilm.highlightDiscPair && A._clashHudHighlightLast != null) {
              A.clashFilm.highlightDiscPair(null);   // leaving the window — drop back to ambient pulsing
              console.log('§CLASH_HUD_HIGHLIGHT frame=' + i + ' pair=null (window exited/no pair cards) — back to ambient');
              A._clashHudHighlightLast = null;
            }
          }
          if (!A._statTailRosterLogged) {
            A._statTailRosterLogged = true;
            console.log('§CPE_ROSTER_NOT_A_HIGHLIGHT reveal rotation slots=' +
              (_bigCards ? _bigCards.length : 0) + ' (cards only; the held build-up roster is NOT' +
              ' one of them — it holds through round 1 instead)' +
              (_bigCards && _bigCards.length ? '' : ' — NO CARDS: the tail panel is omitted entirely'));
          }
          if (_si) {
            // §CPE_PIE_FLYOUT_DROP (2026-09-01, user: "during last fly out, the last pie is not
            // needed. Remove to give max space to the revolving highlights."): in the Reveal round
            // the held pie is NOT drawn — held:null — so the cards and the roster slot take the
            // full panel width. The boundary is THIS branch's own _inReveal (topoutU / ops-frozen
            // degrade), no new constant, so the drop can never diverge from the rotation. Round 1
            // is untouched: §CPE_PIE_HOLD still owns every frame before the boundary. The crew is
            // NOT lost — it holds, un-rotated, for the whole of round 1. (Until 2026-09-04 the
            // roster also rode along as a revolving slot here; §CPE_ROSTER_NOT_A_HIGHLIGHT above
            // removed it — a build-up slide is not a finished-building highlight.)
            _statInfo = { shown: _si, pos: _ovPos, held: null };
            A._statTailFrames = (A._statTailFrames || 0) + 1;
            if (!A._statTailLogged) {
              A._statTailLogged = true;
              console.log('§CPE_STATS_TAIL reveal round entered at frame ' + i + '/' + nFrames +
                ' u=' + (nFrames > 1 ? (i / (nFrames - 1)).toFixed(3) : '1.000') +
                ' boundary=' + (_revealU != null ? 'topoutU ' + _revealU.toFixed(3) : 'ops-frozen (no plan beats)') +
                ' slots=' + _si.n + ' (roster' + (_bigCards ? ' + ' + _bigCards.length + ' cards' : ', NO cards built') + ')' +
                ' pie=dropped (§CPE_PIE_FLYOUT_DROP)');
            }
          } else if (_holdInfo) {
            _resInfo = { info: _holdInfo, pos: _ovPos };   // nothing to revolve — hold, never blank
          }
        }
        // §STOREY_HIGHLIGHT_REVEAL — takes over the SAME panel slot for exactly the narrow last-5s-
        // of-pullback window (ending at plan.beats.rise). Shaped identically to the `_si`/_statInfo branch above
        // (A.bigStatsCompositeOntoCanvas reads `.shown.card`/`.idx`/`.n`/`.opacity` either way), so no
        // new draw code is needed — only which content occupies the slot changes. `_resInfo` is
        // already null here by construction (it is only ever set in the `!_inReveal` branch far
        // above, and this window opens well after `_inReveal` goes true), so no second corner panel
        // can appear alongside it.
        if (A.storeyRevealStatCardAt) {
          var _srCard = A.storeyRevealStatCardAt(plan, _tnFilm);
          if (_srCard) _statInfo = { shown: _srCard, pos: _ovPos, held: null };
        }
        // §MEASURE_BUILDING_CARD — the closing roll-to-stop. Last override in the chain, and its window
        // (the final 3s) is past beats.rise, so it cannot collide with the storey block above (which
        // ends AT beats.rise) or with either clash window. Same _statInfo shape, no new draw code.
        if (_measureU != null && _tnFilm >= _measureU) {
          var _mc = A.bigStatsAtSpan(_measureCards, (_tnFilm - _measureU) / (1 - _measureU));
          if (_mc) {
            _statInfo = { shown: _mc, pos: _ovPos, held: null };
            if (A._measureCardLast !== _mc.idx) {
              A._measureCardLast = _mc.idx;
              console.log('§MEASURE_BUILDING_CARD frame=' + i + '/' + nFrames + ' tn=' + _tnFilm.toFixed(4) +
                ' card=' + (_mc.idx + 1) + '/' + _mc.n + ' — ' + _mc.card.big + ' ' + _mc.card.label);
            }
          }
        }
        window.APP._burninFrameIdx = i;   // §DATUM_DECOUPLE — which pre-extracted clean PNG this frame loads
        // §117 WITNESS (user: "Don't you WITNESS log to prove that it's not working?") — §113's
        // witness covers the CUT and proved nothing about lighting, which is exactly why §115's
        // per-storey cap read as working in the log while fixture GLOW was still on screen: the
        // PointLights and the glow sprites are two different object families and only one was being
        // counted. This counts every interior emitter there is, from the live scene, and must read
        // zero on every frame after the last stick. It reads the PREVIOUS frame's writes, which is
        // what makes it independent of the gate's own arithmetic rather than a restatement of it.
        // W3(C) 2026-10-03 — WHO OWNS THE LAMPS. Parity films light lamps on the DATA path (sourced_light lamp textures, tools.js
        // _filmLD: A._lampData) and deliberately park the pool at 0, so a pool-only count read "0/122 lit" on films whose lamps were
        // on (§LAMP_UNCAPPED on lit=122). Owner, data lamps lit, pool lit and every lamp-SET change (= a lamp popping in/out as the
        // camera's 122-cap pick moves) are logged on change, plus one §LAMPS_SUMMARY at the end.
        var _lOwner = (A._lampDataOn && A._lampData && A._lampData.lamps) ? 'data' : 'pool';
        var _lData = 0, _lDataN = 0;
        if (_lOwner === 'data') { _lDataN = A._lampData.lamps.length; for (var _ld = 0; _ld < _lDataN; _ld++) if (A._lampData.lamps[_ld].I > 0) _lData++; }
        var _lPool = 0;
        if (A._nightBakePool) for (var _lp2 = 0; _lp2 < A._nightBakePool.length; _lp2++) if (A._nightBakePool[_lp2].intensity > 0) _lPool++;
        var _lS = A._lampsSum || (A._lampsSum = { frames: 0, data: 0, pool: 0, minLit: 1e9, maxLit: 0, setChanges: 0, ver: null, key: null });
        _lS.frames++; _lS[_lOwner]++;
        var _lLit = _lOwner === 'data' ? _lData : _lPool;
        _lS.minLit = Math.min(_lS.minLit, _lLit); _lS.maxLit = Math.max(_lS.maxLit, _lLit);
        var _lVer = _lOwner === 'data' ? A._lampData.ver : null;
        if (_lVer !== null && _lS.ver !== null && _lVer !== _lS.ver) _lS.setChanges++;
        _lS.ver = _lVer;
        var _lKey = _lOwner + '/' + _lData + '/' + _lPool + '/' + (_lVer == null ? '-' : _lVer);
        A._frLamps = { owner: _lOwner, data: _lData, pool: _lPool };   // W6 §F
        if (_lS.key !== _lKey) {
          _lS.key = _lKey;
          console.log('§LAMPS f=' + i + ' owner=' + _lOwner + ' dataLit=' + _lData + '/' + _lDataN + ' poolLit=' + _lPool + '/' +
            ((A._nightBakePool && A._nightBakePool.length) || 0) + ' ver=' + (_lVer == null ? '-' : _lVer) +
            ' gateOff=' + (A._interiorLightsOff ? 1 : 0));
        }
        if (A._ilPastStick) {
          var _wPool = 0, _wNav = 0, _wData = _lData, _wDataN = _lDataN;
          if (A._nightBakePool) for (var _wi = 0; _wi < A._nightBakePool.length; _wi++) {
            if (A._nightBakePool[_wi].intensity > 0) _wPool++;
          }
          if (A._nightLightByPos && A._nightLightByPos.forEach) {
            A._nightLightByPos.forEach(function (l) { if (l && l.intensity > 0) _wNav++; });
          }
          // §118 — every family, not a subset: a witness that cannot see a family cannot fail on it.
          // §GLOW_LAYERS_OFF (2026-09-25): the sprite cloud and the lens quad were two of the families;
          // both were deleted from the viewer, so the families left are pool, nav, emissive materials.
          var _wEmis = 0;
          if (A._nightGlowMats) for (var _ge = 0; _ge < A._nightGlowMats.length; _ge++) {
            var _gm = A._nightGlowMats[_ge].mat;
            if (_gm && _gm.emissiveIntensity > 0 && _gm.emissive && _gm.emissive.getHex() !== 0) _wEmis++;
          }
          var _wKey = _lOwner + '/' + _wData + '/' + _wPool + '/' + _wNav + '/' + _wEmis;
          if (A._ilWitnessKey !== _wKey) {
            A._ilWitnessKey = _wKey;
            console.log('§INTERIOR_LIGHTS_WITNESS owner=' + _lOwner + ' dataLit=' + _wData + '/' + _wDataN + ' poolLit=' + _wPool + '/' +
              ((A._nightBakePool && A._nightBakePool.length) || 0) + ' navLit=' + _wNav +
              ' emissiveMatsLit=' + _wEmis + '/' + ((A._nightGlowMats && A._nightGlowMats.length) || 0) +
              ' => ' +
              // §129.41 (2026-09-19) — THE RULE THIS WITNESS CHECKS HAS CHANGED, so the verdict has
              // to change with it or it fails on the very behaviour red1 asked for. Under §116 the
              // bar was "nothing interior emits after the last stick", full stop; the relight makes
              // that true only up to topout. Past topout the CORRECT answer is the opposite — the
              // windows are meant to be lit at dusk — so a zero there is the failure and a non-zero
              // is the pass. Same five families, same denominators, the expectation flips with the
              // beat. Leaving the old assertion in place would have meant a red line on every
              // future bake and a witness nobody trusts, which is worse than no witness.
              // §129.49 (2026-09-19, red1: "get proper WITNESS logging in") — THE OLD BAR WAS TOO
              // LOW AND IT HID A REAL BUG FOR A WHOLE DAY. "Something is emitting" passed while
              // emissiveMatsLit was 0/4 on HHS and 0/8 on Hospital, because the pool lights were on
              // and one lit family was enough to carry the verdict. §129.48's fault — the relight
              // restoring PRE-GLOW DARK values — was printed in that field on every one of those
              // frames and the verdict said PASS over the top of it.
              // A family with members and none lit is now a FAIL on its own, named. Each family
              // prints over its own denominator so a zero can still be told from an absent family:
              // absent (denominator 0) is not judged, which is the VACUOUS case, not a pass.
              (!A._interiorLightsOff   // §INTERIOR_LIGHTS_ARC: expect lit whenever ARC is on screen, dark only when the gate is off
                ? ((function () {
                    // W3(C): judge the family that OWNS the lamps — under the data path the pool is parked at 0 on purpose.
                    var fam = [(_lOwner === 'data' ? ['data', _wData, _wDataN] : ['pool', _wPool, (A._nightBakePool && A._nightBakePool.length) || 0]),
                               ['nav', _wNav, (A._nightLightByPos && A._nightLightByPos.size) || 0],
                               ['emissiveMats', _wEmis, (A._nightGlowMats && A._nightGlowMats.length) || 0]];
                    var dark = fam.filter(function (f) { return f[2] > 0 && f[1] === 0; });
                    var judged = fam.filter(function (f) { return f[2] > 0; });
                    if (!judged.length) return 'INCONCLUSIVE — past topout and no interior emitter family' +
                      ' exists on this building at all; nothing judged, not a pass.';
                    if (dark.length) return 'FAIL — past topout and ' +
                      dark.map(function (f) { return f[0] + ' is 0/' + f[2]; }).join(', ') +
                      '. A family with members and none lit is the defect (§129.48: the relight used to' +
                      ' restore the PRE-GLOW values, i.e. darkness, and say "restored"). Another family' +
                      ' being lit does NOT cover for it — that is how this hid.';
                    return 'PASS (past topout: every interior family that exists is lit — ' +
                      judged.map(function (f) { return f[0] + ' ' + f[1] + '/' + f[2]; }).join(', ') + ')';
                  })())
                : ((_wPool + _wNav + _wEmis + _wData === 0)
                    ? 'PASS (between the last stick and topout, no interior emitter of any family is on)'
                    : 'FAIL — something interior is still emitting. Each count prints over its own' +
                      ' DENOMINATOR so a zero can be told apart from an absent family (a vacuous pass).')));
          }
        } else A._ilWitnessKey = null;
        // ══ §129.57 FRAME REUSE (2026-09-20) ══════════════════════════════════════════════════
        // MEASURED on the 09-20 Hospital hi-res bake's own §FRAME_HASH sequence: 199 of the 265
        // load-path freeze frames are BYTE-IDENTICAL to the frame before them, and 0 frames
        // anywhere else in the film are. Each of those 199 cost 6,892 ms — 22.9 min of GPU time
        // re-deriving bytes that already existed. Inside the hold the camera is pinned at armPose,
        // the sun is frozen (§SUN_ONE elevation=26.5 on all 264 samples) and the scene moves by 8
        // objects across the whole window.
        //
        // So: when nothing that drives the picture has moved, hand the encoder the PREVIOUS blob
        // and skip _captureFrame entirely — base render, the 20-render still fold (taa=8 ao=12)
        // and the HUD draw together, not a part of it.
        //
        // The key never GUESSES what the load path animates. `A._loadPathVisualRev` is a counter
        // the load-path module bumps only where it genuinely mutated something (see its own note
        // at _revealStackStep). If a future edit animates something every frame, the counter moves
        // every frame and reuse turns itself off with no change here.
        //
        // GATED TO THE HOLD, matching the measurement exactly. window.__noFrameReuse=1 disables it
        // — the control W-FRAME-REUSE's own FAIL leg depends on.
        // §129.61 MERGE — their §ESCAPE_ROUTE card/frame computation was MOVED UP to here.
        // On their branch it sat just above their own _captureFrame call; on ours that call is
        // inside §129.57's reuse if/else, so leaving it there computed _escInfo AFTER the frame
        // that needed it and duplicated the capture. It also has to run before the reuse key is
        // built, since _statInfo is what it overrides.

        // §ESCAPE_ROUTE_REVEAL — the titled card. LAST override in the chain on purpose: the
        // §MEASURE_BUILDING_CARD roll above owns the whole orbit beat, and this window lies inside
        // it, so the escape card has to be the one that wins for its own span and hand the slot
        // straight back afterwards. Same _statInfo shape, so no new panel drawing exists.
        // AFTER every beat's own per-frame update (the datum, the cues, the indoor beats and the
        // slab all write `.visible` themselves) and BEFORE the capture, so the last word on what
        // reaches the frame is the cease rule's.
        MQS._cease3D();
        var _escInfo = null, _escCardInfo = null;
        if (_escRec && A.escapeRouteStatCardAt) {
          var _ec = A.escapeRouteStatCardAt(plan, _tnFilm);
          if (_ec) {
            // ══ §ESCAPE_PANEL_SLOT (2026-09-20) ═══════════════════════════════════════════════
            // red1: "EscRoute should be taking over the opposing bottom HUD as it is no longer
            // having any new content. This leaves the main HUD to continue displaying its overall
            // building info." Then: "I mean, retain the same coloring. Just use that opposing HUD."
            // It used to overwrite `_statInfo`, which EVICTED the building card from the HUD column
            // for the whole escape window. Now it draws in the corner diagonally opposite — the one
            // the Measure panel takes — and `_statInfo` is left alone, so the route runs on one side
            // and 440 doors / 22,031,100 total cost on the other, which is what he asked for.
            // The corner comes from cpe_film_boxes.js's own OPP map, not a second copy of it.
            // ⚠ The prerequisite for sharing this corner was §SLAB_LABEL_STALE: the slab beat
            // re-posted its label every frame to the end of the film, so the Measure box never
            // yielded the slot and never could.
            _escCardInfo = { shown: _ec,
                             pos: (A.filmBoxesOppositeCorner ? A.filmBoxesOppositeCorner(_ovPos) : 'bl') };
            if (A.escapeRouteFrameAt) {
              // §ESCAPE_ROUTE_HUD_RESERVE — the corner column this frame, so the two scene-anchored
              // plates keep out of it (red1: the panel "must find an empty spot"). Since the
              // suppression was retired the column holds EVERY box again — day counter, sun clock,
              // compass readout, path box, pie/card — so the reserve is the whole strip down to the
              // bottom _captureFrame measured last frame (A._hudStackBottom), not two boxes.
              var _escReserved = A.escapeRouteReservedRects
                ? A.escapeRouteReservedRects(w, h, _ovPos, A._hudStackBottom) : [];
              try { _escInfo = A.escapeRouteFrameAt(plan, _tnFilm, A.camera, w, h, _escReserved); }
              catch (eEF) { if (!A._escFrameWarned) { A._escFrameWarned = true;
                console.warn('§ESCAPE_ROUTE_FRAME failed frame=' + i + ': ' + (eEF && eEF.message)); } }
            }
            if (_escInfo && (i % 10 === 0 || _escInfo.progress >= 1) && !A._escLoggedFull) {
              if (_escInfo.progress >= 1) A._escLoggedFull = true;
              console.log('§ESCAPE_ROUTE_DRAW frame=' + i + '/' + nFrames + ' tn=' + _tnFilm.toFixed(4) +
                ' progress=' + _escInfo.progress.toFixed(4) +
                ' drawn=' + _escInfo.drawnM.toFixed(2) + 'm of ' + _escRec.walkM.toFixed(2) + 'm' +
                ' steps=~' + _escInfo.steps + ' walk=' + Math.round(_escInfo.walkSec) + 's' +
                ' pts=' + _escInfo.screen.length + ' labels=' + _escInfo.labels.length +
                ' alpha=' + _escInfo.alpha.toFixed(2) + ' reserved=' + _escReserved.length +
                ' plateCollisions=' + _escInfo.labels.map(function (L) { return L.collisions; }).join('/'));
            }
          }
        }
        var _reuseKey = null;
        // §FRAME_REUSE_SANITY — never reuse while the last composited frame had a live Sanity box/wave (it moves with film
        // time, which the key below does not see). Counted and logged at the end with §FRAME_REUSE_TOTAL.
        if (!window.__noFrameReuse && _lpHoldCtl && _lpHoldCtl.inHold && _lastFrameBlob && A._ruleFilmLive) { _reuseSanityDenied = (_reuseSanityDenied || 0) + 1;
          if (_reuseSanityDenied === 1) console.log('§FRAME_REUSE_SANITY no reuse at i=' + i + ' — a Sanity set is live inside the hold'); }
        if (!window.__noFrameReuse && _lpHoldCtl && _lpHoldCtl.inHold && _lastFrameBlob && !A._ruleFilmLive) {
          var _rp = A.camera ? A.camera.position : null;
          var _rt = (A.controls && A.controls.target) ? A.controls.target : null;
          // `rev` AND `prevRev`. A load-path mutation lands in the picture ONE FRAME LATE — the
          // visual is applied in this loop and the change shows up in the next frame's render.
          // MEASURED: keying on `rev` alone reused at frames 1948, 1972, 1996, 2020 … each exactly
          // one after a hop step, and the real bake's own hashes say every one of those frames
          // DIFFERED from its predecessor. Caught by W-FRAME-REUSE's replay leg before any bake.
          // Carrying the previous frame's rev forces a render on the step frame and the one after
          // it, which is the same off-by-one §129.50 hit with the DLOD proxy ("ARC was coming back
          // one frame later").
          _reuseKey = 'h1|' + (A._loadPathHudAlpha == null ? 1 : +A._loadPathHudAlpha).toFixed(6) +
            '|rev' + (A._loadPathVisualRev || 0) + '+' + _prevVisualRev +
            '|p' + (_rp ? _rp.x.toFixed(4) + ',' + _rp.y.toFixed(4) + ',' + _rp.z.toFixed(4) : '-') +
            '|t' + (_rt ? _rt.x.toFixed(4) + ',' + _rt.y.toFixed(4) + ',' + _rt.z.toFixed(4) : '-') +
            '|s' + ((A.sunCompassInfo && A.sunCompassInfo()) ? (+A.sunCompassInfo().elevation).toFixed(3) : '-') +
            '|d' + (_dayInfo && _dayInfo.text != null ? String(_dayInfo.text) : '-') +
            '|a' + (A._freezeAnimKey ? A._freezeAnimKey() : '-');   // §FREEZE_ANIM: an animating panel frame is never reused
        }
        _prevVisualRev = (A._loadPathVisualRev || 0);
        var blob;
        if (_reuseKey !== null && _reuseKey === _lastFrameKey) {
          blob = _lastFrameBlob;
          _frameReuseRun++; _frameReuseTotal++;
        } else {
          if (_frameReuseRun > 0) {
            _frameReuseRuns++;
            console.log('§FRAME_REUSE run ended at i=' + i + ' reused=' + _frameReuseRun +
              ' consecutive frame(s) — identical picture, encoder handed the same blob');
            _frameReuseRun = 0;
          }
          if (typeof window.__maxqPreCaptureTap === 'function') { try { window.__maxqPreCaptureTap(i); } catch (ePC) {} }   // dev-only witness seam (--tap), like __maxqPoseTap
          // §LOADPATH_HOLD_CAMDIR (red1 2026-10-01: "the cam still pivot or pan around" in the freeze): the camera AS CAPTURED, every
          // 15th hold frame + the first and last — position and view direction, so a pan/pivot during the freeze is a number, not a look.
          if (A._loadPathMidHoldThisFrame && A.camera && A.camera.getWorldDirection) { try {
            A._lpCamDirN = (A._lpCamDirN || 0) + 1; var _cdv = A.camera.getWorldDirection(new THREE.Vector3());
            if (A._lpCamDirN === 1 || A._lpCamDirN % 15 === 0) console.log('§LOADPATH_HOLD_CAMDIR n=' + A._lpCamDirN + ' i=' + i + ' pos=[' + A.camera.position.x.toFixed(2) + ',' + A.camera.position.y.toFixed(2) + ',' + A.camera.position.z.toFixed(2) + '] dir=[' + _cdv.x.toFixed(3) + ',' + _cdv.y.toFixed(3) + ',' + _cdv.z.toFixed(3) + '] yawDeg=' + (Math.atan2(_cdv.x, _cdv.z) * 180 / Math.PI).toFixed(2) + ' pitchDeg=' + (Math.asin(Math.max(-1, Math.min(1, _cdv.y))) * 180 / Math.PI).toFixed(2) + ' frameRange=' + (_frameRange ? 1 : 0));
          } catch (eCD) {} }
          { var _bfm = /[?&]blankframe=(\d+):(\d+)/.exec(location.search); if (_bfm && (_frameRange ? _frameRange.a + i : i) === +_bfm[1]) window.__forceBlankLeft = +_bfm[2]; }
          blob = await MQS._captureFrame(w, h, _titleInfo, _dayInfo, _ovInfo, _resInfo, _statInfo, _lblInfo, _statusSrc, _escInfo, _escCardInfo);
          // §FILM_BLANK_FRAME (2026-10-01, Hospital full bake frames 2325-2341: 16 captures came back ALL ZERO — lumaMax=0.0, HUD included,
          // one hash — while §FILM_EXPOSURE metered a normal scene; GPU out-of-memory on the shared card at that minute). The capture canvas,
          // not the render, went blank, and the only blank guard lived in the bounce path (off by then). A real film frame always carries
          // light or HUD, so an all-zero capture is retried after a short wait (0.5 / 2 / 5 s); if it stays blank, the LAST GOOD frame is
          // used instead of black (a held frame reads as a stutter, black reads as a cut). Logged every time.
          if (A._frameQa && !A._frameQa.err && +A._frameQa.max === 0) {
            var _bfOk = false, _bfWaits = [500, 2000, 5000];
            for (var _bt = 0; _bt < _bfWaits.length && !_bfOk; _bt++) {
              await new Promise(function (r) { setTimeout(r, _bfWaits[_bt]); });
              blob = await MQS._captureFrame(w, h, _titleInfo, _dayInfo, _ovInfo, _resInfo, _statInfo, _lblInfo, _statusSrc, _escInfo, _escCardInfo);
              _bfOk = !!(A._frameQa && !A._frameQa.err && +A._frameQa.max > 0);
              console.warn('§FILM_BLANK_FRAME i=' + (_frameRange ? _frameRange.a + i : i) + ' try=' + (_bt + 1) + ' waitMs=' + _bfWaits[_bt] + ' recovered=' + _bfOk + (_bfOk ? ' lumaMean=' + (+A._frameQa.mean).toFixed(1) : ''));
            }
            if (!_bfOk && A._lastGoodFrameBlob) { blob = A._lastGoodFrameBlob; A._blankHeld = (A._blankHeld || 0) + 1;
              console.warn('§FILM_BLANK_FRAME i=' + (_frameRange ? _frameRange.a + i : i) + ' STILL BLANK after 3 tries -> held the last good frame (held so far ' + A._blankHeld + ')'); }
          }
          if (A._frameQa && +A._frameQa.max > 0) A._lastGoodFrameBlob = blob;
          _lastFrameKey = _reuseKey; _lastFrameBlob = blob;
        }
        // ROUND 13 item C — track whichever frame lands CLOSEST to the hold's own middle
        // (|elapsedSec - durSec/2|, never a re-derived "is this the middle" guess) and snapshot the
        // REAL per-layer composite alpha `_captureFrame`'s own `_drawUnlessHold` calls just recorded
        // for THIS frame (`A._hudCompositeAlphaSample`) — read by `_hudFadeWitnessPrint` at the end
        // of the bake, since `A.loadPathDispose()` clears the live hold state before that print runs.
        if (_lpHoldCtl && _lpHoldCtl.inHold && A._loadPathWindow && A._loadPathWindow.durSec > 0) {
          var _lpMidDist = Math.abs(_lpHoldCtl.elapsedSec - A._loadPathWindow.durSec / 2);
          if (_lpMidDist < _lpMidHoldBestDistSec) {
            _lpMidHoldBestDistSec = _lpMidDist;
            _lpMidHoldCompositeAlpha = Object.assign({}, A._hudCompositeAlphaSample || {});
          }
        }
        // LARGE_DB_BAKE.md §2 L4 — seam-equivalence witness: hash the ENCODED bytes of this frame,
        // keyed by its GLOBAL index in the full film (not this run's local i), so a K=1 bake and a
        // --frame-range slice of the same span can be diffed frame-for-frame without decoding video.
        var _tailT0 = performance.now();   // §CAPTURE_SPLIT tail: hash + QA log + IDB write
        try {
          var _fhBuf = await blob.arrayBuffer();
          var _fhDig = await crypto.subtle.digest('SHA-256', _fhBuf);
          var _fhHex = Array.prototype.map.call(new Uint8Array(_fhDig), function(b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 16);
          // §MAXQ_FRAME_DECODE — `bytes` added 2026-09-21. A 3,275-frame HHS bake died at stitch
          // time on "The source image could not be decoded" and the log could not say whether the
          // bad frame had ALREADY been anomalous at capture. arrayBuffer() proves a blob has bytes,
          // never that they are a valid image, so the size is the one cheap thing that can be
          // compared later against the frame the stitcher names.
          console.log('§FRAME_HASH i=' + (_frameRange ? _frameRange.a + i : i) + ' sha=' + _fhHex +
            ' bytes=' + (blob && blob.size != null ? blob.size : 'n/a'));
          // §FRAME_QA (every frame, qaEvery=1): the encoded canvas's luma; reused=1 = the §FRAME_REUSE path handed the previous blob
          var _fq = A._frameQa || {}, _fqR = (_reuseKey !== null && _reuseKey === _lastFrameKey && blob === _lastFrameBlob && _frameReuseRun > 0);
          console.log('§FRAME_QA i=' + (_frameRange ? _frameRange.a + i : i) + ' qaEvery=1 ' + (_fq.err ? 'ERR ' + _fq.err : 'lumaMean=' + (+_fq.mean).toFixed(2) + ' lumaMin=' + (+_fq.min).toFixed(1) +
            ' lumaMax=' + (+_fq.max).toFixed(1) + ' darkPct=' + (+_fq.dark).toFixed(2) + ' clipPct=' + (+_fq.clip).toFixed(2)) + ' reused=' + (_fqR ? 1 : 0) +
            ' cam=[' + (A.camera ? [A.camera.position.x, A.camera.position.y, A.camera.position.z].map(function(v) { return v.toFixed(3); }).join(',') : '-') + ']');
        } catch (eFh) { console.warn('§FRAME_HASH_ERR ' + eFh.message); }
        // §MAXQ_IDB_SALVAGE (2026-07-25, real user repro on Hospital AND HHS_Office — both mid-bake,
        // ~100+ frames in): a backgrounded/throttled tab can have Chrome force-close this run's IDB
        // connection out from under it (confirmed live: two consecutive rAF gaps of 29s and 67s right
        // before the failure — classic background-tab throttling, not a code race). Previously this
        // threw straight past the §MAXQ_PARTIAL stitch logic below (it only runs when the loop exits
        // normally/via `break`), silently discarding every frame captured so far — losing minutes of
        // cook the SAME way a manual cancel explicitly promises never to (see that logic's own
        // comment). Treat an IDB write failure the same as a cancel: stop capturing, keep what's
        // already saved, and try to hand the stitch phase a FRESH connection since the old handle is
        // permanently unusable once "closing" — reopening is cheap and the underlying stored data
        // (frames already put successfully) is untouched by the old handle dying.
        try {
          var _idbT0 = performance.now();
          await MQS._idbPut(db, i, blob);
          console.log('§CAPTURE_TAIL i=' + (_frameRange ? _frameRange.a + i : i) + ' hashMs=' + (_idbT0 - _tailT0).toFixed(1) + ' idbMs=' + (performance.now() - _idbT0).toFixed(1));
        } catch (idbErr) {
          _idbLost = true;
          console.warn('§MAXQ_IDB_LOST i=' + i + ' ' + idbErr.message +
            ' — tab likely backgrounded/throttled; salvaging ' + framesDone + ' already-captured frames');
          try { db = MQS._db = await MQS._idbOpen(); console.log('§MAXQ_IDB_REOPEN ok'); }
          catch (reopenErr) { console.warn('§MAXQ_IDB_REOPEN_FAIL ' + reopenErr.message); }
          break;
        }
        framesDone = i + 1;
        var _etaNow = performance.now();
        _etaRecent.push(_etaNow - _etaPrev); _etaPrev = _etaNow;
        if (_etaRecent.length > 15) _etaRecent.shift();
        // §MAXQ_ETA_TICK — the progress readout is driven by MEASURED TIME, not a frame count.
        // Both used to sit behind `i % 15`, which is a rate only if frames are fast. They are not:
        // a photoreal frame cooks the 16-sample TAA fold + the 24-frame AO pass, MEASURED at
        // 1600-1812 ms/frame on Hospital (942 frames, ~25 min). At that speed `i % 15` left the
        // status line frozen on a stale number for ~24 SECONDS at a time, which is exactly long
        // enough to read as a hang — reported as "it gets stuck" on a run that was progressing
        // normally the whole time.
        //
        // So: the STATUS updates every frame (a textContent write, free next to a 1.6s cook), and
        // the CONSOLE throttles on elapsed ms rather than frame index, so its cadence is the same
        // wall-clock rhythm whether a frame takes 20ms or 2s. Nothing here needs to know how slow
        // a frame is — it measures.
        var _el = _etaNow - t0;
        var _per = _etaRecent.reduce(function(a, b) { return a + b; }, 0) / _etaRecent.length;
        var _eta = i > 0 ? Math.round(_per * (nFrames - i - 1) / 1000) : -1;
        var _etaTxt = _eta < 0 ? 'estimating'
          : _eta < 90 ? Math.max(1, Math.round(_eta)) + 's left'
          : Math.ceil(_eta / 60) + ' min left';
        // §CPE_STICK_APPROACH: live path-structure feedback appended to the existing frame/ETA
        // readout — same per-frame cadence, not a separate slower/faster timer. Omitted entirely
        // (falls back to the pre-feature text) when the path has no user-dropped sticks or the walk
        // is already past the last one.
        var _stickTxt = _stickNow ? ', approaching Stick ' + _stickNow.index + '/' + _stickNow.count : '';
        // §CPE_MAXQ_STATUS_DAY_LABEL — Day # and current room label, same per-frame cadence as the
        // stick-approach text above. `_dayInfo`/`_titleInfo` are already computed earlier THIS
        // frame for the canvas-compositing path (_captureFrame, above) — this reads the SAME
        // values through the pure, witnessed formatter, nothing is recomputed here.
        var _segs = MQS._maxqStatusDayRoomSegs(_dayInfo, _titleInfo);
        MQS._status('🎬 MaxQ frame ' + (i + 1) + '/' + nFrames + ' — ' + Math.round(_el / 1000) + 's, ~' +
          _etaTxt + _segs.dayTxt + _segs.roomTxt + _stickTxt + ' (Alt+C / cinema icon cancels + saves partial)');
        if (_etaNow - _logPrev >= MAXQ_LOG_MS || i === 0 || i === nFrames - 1) {
          _logPrev = _etaNow;
          console.log('§MAXQ_FRAME i=' + i + '/' + nFrames + ' elapsedMs=' + Math.round(_el) +
            ' perFrameMs=' + Math.round(_per) + ' etaSec=' + _eta + ' (rolling-15, log every ' +
            (MAXQ_LOG_MS / 1000) + 's)');
          MQS._logFrameCost(i, nFrames, _per);
        }
      }
      // §129.6 item 1 WITNESS — §LOADPATH_RESUME: b==a (the film really did resume from the SAME
      // tFilm it froze at) and stepAtResume <= maxStepElsewhere (no threshold constant — the
      // release step must be no bigger than the largest step ANYWHERE ELSE in this same bake, real
      // camera-position deltas from the poses the bake actually set, never a guessed number).
      if (_loadPath && _lpResumeAtIndex >= 0) {
        var _lpA = A._loadPathArmTFilm, _lpB = A._loadPathReleaseTFilm;
        var _lpStepAtResume = _lpCamSteps[_lpResumeAtIndex] || 0;
        var _lpMaxElsewhere = 0;
        for (var _lpSi = 0; _lpSi < _lpCamSteps.length; _lpSi++) {
          if (_lpSi === _lpResumeAtIndex) continue;
          if (_lpCamSteps[_lpSi] > _lpMaxElsewhere) _lpMaxElsewhere = _lpCamSteps[_lpSi];
        }
        var _lpTFilmOk = (_lpA != null && _lpB != null && _lpA === _lpB);
        var _lpStepOk = _lpStepAtResume <= _lpMaxElsewhere;
        console.log('§LOADPATH_RESUME tFilmArm=' + (_lpA == null ? '?' : _lpA.toFixed(6)) +
          ' tFilmRelease=' + (_lpB == null ? '?' : _lpB.toFixed(6)) + ' framesInserted=' + _lpFramesInserted +
          ' stepAtResume=' + _lpStepAtResume.toFixed(4) + ' maxStepElsewhere=' + _lpMaxElsewhere.toFixed(4) +
          ' => ' + (_lpTFilmOk && _lpStepOk ? 'PASS' : 'FAIL'));
      }
      // §HUD FIX (2026-09-15) — §COST_ODOMETER_FINAL must say something, never nothing: a clip that
      // ends BEFORE topout (progress never reaches 1.0) legitimately never fires the FINAL check
      // inside A.costOdometerTick — printed here, once, at the true end of the bake, so a log reader
      // never has to infer "silence" as a pass.
      if (_costOdo && !A._costOdometerFinalFired) {
        console.log('§COST_ODOMETER_FINAL INCONCLUSIVE reason=no-final-frame');
      }
      if (A._stillRefineActive) A.stopStillRefine(true);
      MQS._restoreRandom();
      // §CPE_BUILDUP: hand the user's Time Machine back exactly as it was. Every loop exit — normal
      // end, cancel, GL loss, IDB loss — passes through here, so the re-keyed order can never
      // outlive the bake and silently become what the timeline slider scrubs.
      if (_bkState && typeof window.tmRestoreDerivedOrder === 'function') {
        window.tmRestoreDerivedOrder(); _bkState = null;
      }
      // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: same contract — a bake that silently turned Time Machine
      // on (tmActivateForBake, no real Play involved) must silently turn it back off, or the scene
      // is left mid-construction with nothing offering to restore it (the panel was never shown, so
      // there's no close button to do it).
      try { if (typeof window.tmDeactivateIfBakeOwned === 'function') window.tmDeactivateIfBakeOwned(); } catch (eTM) {}
      // §CPE_GHOST_GROUND: same contract, same exit — a ghosted ground left behind would follow the
      // user into normal navigation for the rest of the session.
      try { MQS._ghostGroundRestore(); } catch (eGG) {}
      try { if (A.roadPanelsDispose) A.roadPanelsDispose(); A._roadPanelTn = null; } catch (eRPD) {}   // §ALTC_PANELS
      // §CPE_DISCIPLINE_REVEAL: same contract — ARC/STR left hidden after a bake would follow the
      // user into normal navigation. plan=null is the explicit "force restore" signal.
      try { if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(null, 0); } catch (eRV) {}
      try { if (A.cpeArchFadeApplyVisual) A.cpeArchFadeApplyVisual(null, 0); } catch (eRVf) {}
      // §STOREY_HIGHLIGHT_REVEAL: same contract — a tinted storey left glowing after a bake would
      // follow the user into normal navigation. plan=null forces the restore.
      A._interiorLightsOff = false; A._ilBoundaryLogged = false;     // §116 restore
      // §SUN_ONE_ALL_DARK — judged over the WHOLE run, so it cannot be a per-frame warning.
      // A film dark end to end is real in polar winter and a mistake everywhere else.
      try { if (A._sunCompassOn && A.sunCompassDarkReport) A.sunCompassDarkReport(); } catch (eSD) {}
      try { if (A.storeyRevealApplyVisual) A.storeyRevealApplyVisual(null, 0); } catch (eSR) {}
      try { if (A.storeyRevealApplyCut) A.storeyRevealApplyCut(null, 0); } catch (eSC) {}
      // §129.1 LOAD PATH: same contract — a lit stack / clip plane left behind after a bake would
      // follow the user into normal navigation. plan=null forces the restore.
      try { if (A.loadPathApplyVisual) A.loadPathApplyVisual(null, 0); } catch (eLP) {}
      // §129.57 end-of-bake census. A saving nobody can read back out of the log is not a saving
      // anybody can check — and a reuse count of 0 on a film that HAS a load-path freeze is the
      // FAIL signal (the key is too fine, or the hold never armed), not a quiet non-event.
      if (_frameReuseRun > 0) { _frameReuseRuns++; }
      // W3(C) — the lamp census for the whole film (per-change lines are §LAMPS).
      (function () { var L = A._lampsSum;
        if (!L || !L.frames) { console.log('§LAMPS_SUMMARY INCONCLUSIVE — no frame recorded a lamp state (VACUOUS)'); return; }
        console.log('§LAMPS_SUMMARY frames=' + L.frames + ' owner data/pool=' + L.data + '/' + L.pool + ' lit min/max=' + L.minLit + '/' + L.maxLit +
          ' dataSetChanges=' + L.setChanges + ' (each = the lit lamp SET changed between frames — the 122-cap pick following the camera)' +
          (L.maxLit === 0 ? ' => FAIL — no lamp lit on any frame' : ''));
        A._lampsSum = null; })();
      console.log('§FRAME_REUSE_SANITY denied=' + _reuseSanityDenied + ' (hold frames rendered because a Sanity set was live)');
      console.log('§FRAME_REUSE_TOTAL reused=' + _frameReuseTotal + '/' + framesDone +
        ' runs=' + _frameReuseRuns + ' rendered=' + (framesDone - _frameReuseTotal) +
        ' disabled=' + (window.__noFrameReuse ? 1 : 0) +
        ' — ' + (window.__noFrameReuse ? 'reuse OFF by flag (control run)'
          : (_frameReuseTotal > 0 ? 'each reused frame is the previous encoded blob, byte-identical by construction'
             : 'INCONCLUSIVE: nothing was reused — no load-path hold in this film, or the key moved every frame')));
      MQS._filmRecSummary();   // W6 — after §FRAME_REUSE_TOTAL, which flushed the last pending §F
      // W7 — a requested draw-cost proxy that never boxed anything did nothing for the whole film; say so (Hospital 10-03: boxed=0
      // on all 3,249 census lines; LTU: requested, gate never passed, no page line at all).
      if (window.__dlodProxyBake) console.log(!window.__dlodProxyEngaged
        ? '§DLOD_BAKE_PROXY_RESULT NO-OP — requested, but the large-building gate never engaged it'
        : ('§DLOD_BAKE_PROXY_RESULT boxedMax=' + (window.__dlodBoxedMax || 0) + ((window.__dlodBoxedMax || 0) === 0 ? ' => NO-OP — engaged but boxed nothing on any frame' : ' => engaged')));
      try { if (A.loadPathDispose) A.loadPathDispose(); } catch (eLPd) {}
      try { if (A.ledgerTickerDispose) A.ledgerTickerDispose(); } catch (eLTd) {}
      // §ESCAPE_ROUTE_REVEAL — the forced restore. Runs unconditionally, NOT behind _escapeRoute:
      // by the time it arrives the film has normally already left the window, and a flag read here
      // could differ from the one that engaged the x-ray. Drops the room meshes, puts x-ray back if
      // WE turned it on, and clears the HUD-suppression flag so the next bake starts clean.
      try { if (A.escapeRouteApplyVisual) A.escapeRouteApplyVisual(null, 0); } catch (eER1) {}
      try { if (A.flythruCuesDispose) A.flythruCuesDispose(); } catch (eFD) {}
      try { if (A.slabBeatDispose) A.slabBeatDispose(); } catch (eSBD) {}   // §SLAB_BEAT — restores the tint, removes X + label
      try { if (A.linearBeatDispose) A.linearBeatDispose(); } catch (eLBD) {}
      try { if (A.indoorBeatsDispose) A.indoorBeatsDispose(); } catch (eIBD) {}
      try { if (A.flyoutBeatsDispose) A.flyoutBeatsDispose(); } catch (eFBD) {}
      MQS._workPacingReset();
      // §CLASH_FILM_P2 — say what the labels did over the whole film (VACUOUS if the camera never
      // came within 4 m of a pair), then release the selector's state with the markers.
      if (_clash && A.clashLabels && A.clashLabels.summary) { try { A.clashLabels.summary(framesDone); A.clashLabels.reset(); } catch (eCLs) {} }
      // §ESCAPE_ROUTE_SUMMARY — one line, and it says VACUOUS out loud when the window never opened
      // on a captured frame (a clip that misses it), because a film that never drew the route proves
      // nothing about it. Read the log, not the video.
      if (_escapeRoute && A.escapeRouteSummary) { try { A.escapeRouteSummary(framesDone); } catch (eERs) {} }
      // §CLASH_FILM_P1 — the markers are bake content; never let them survive into the user's scene.
      if (_clash && A.clashFilm && A.clashFilm.dispose) { try { A.clashFilm.dispose(); } catch (eCFd) {} }
      // §CPE_PIE_HOLD — say how much of the film the pie HELD a past composition rather than
      // showing today's. A bake where this equals framesDone means no day was ever staffed and the
      // whole panel was a hold: that is a schedule problem, not a HUD one, and must be visible.
      if (!A._resPanelFrames) console.log('§CPE_PIE_HOLD VACUOUS — no resource panel was drawn on any frame (no 4D crew data / panel off); nothing judged');
      else console.log('§CPE_PIE_HOLD heldFrames=' + (A._resHoldFrames || 0) + '/' + framesDone +
        (framesDone ? ' (' + Math.round((A._resHoldFrames || 0) / framesDone * 100) + '% of the film)' : '') +
        ((A._resHoldFrames || 0) === 0 ? ' — trades were active for every frame, the pie was never held'
          : ((A._resHoldFrames || 0) >= framesDone ? ' ⚠ NO frame had a live crew — the pie held throughout'
             : ' — pie holds the last real crew through the silent tail')));
      // §CPE_STATS_TAIL — how much of the film the Reveal round reclaimed. 0 on a bake whose plan
      // has no topout AND whose ops never freeze: that is the case where the dead tail stays dead.
      if (!A._resPanelFrames) console.log('§CPE_STATS_TAIL VACUOUS — no resource panel was drawn on any frame; nothing judged');
      else console.log('§CPE_STATS_TAIL revolvedFrames=' + (A._statTailFrames || 0) + '/' + framesDone +
        (framesDone ? ' (' + Math.round((A._statTailFrames || 0) / framesDone * 100) + '% of the film)' : '') +
        ((A._statTailFrames || 0) === 0
          ? ' — the Reveal round never revolved: no topout on the plan and the ops never froze'
          : ' — highlights in play for the whole Reveal round, roster included'));
      // §129.7 item 8c — §HUD_LAYOUT_STABLE: end-of-bake verdict from the per-frame sampling above.
      MQS._hudLayoutStablePrintImpl();
      // §129.8 item 4b (amendment) — §LOADPATH_HUD_FADE: end-of-bake, analytic (see its own comment).
      _hudFadeWitnessPrint();
      // ══ §MAXQ_QUALITY — the run states its own health, ALWAYS, before anything is stitched.
      // The defect this exists for is a film that looks complete and plays fine while its last
      // seconds are visually dead. A degraded bake must never finish quietly: `unconverged` is the
      // load-bearing number, because it counts frames captured before the fold finished — exactly
      // the frames that come out as near-duplicates and read as the film stalling. With
      // §MAXQ_HIDDEN_PAUSE in place a hidden tab should contribute ZERO of them, so a non-zero
      // count now means genuinely slow frames and nothing else.
      console.log('§MAXQ_QUALITY frames=' + framesDone + ' unconverged=' + MQS._unconverged +
        (MQS._unconverged ? ' ⚠ THOSE FRAMES DID NOT FINISH — expect dead-looking video where they land' : ' (every frame converged)') +
        ' hiddenPauses=' + MQS._hiddenPauses + ' totalHiddenMs=' + Math.round(MQS._hiddenMsTotal) +
        (MQS._hiddenPauses ? ' — the bake PARKED while the tab was hidden rather than degrading; the wall clock is longer, the film is not worse' : ''));
      // §MAXQ_PARTIAL: cancel SAVES what's cooked so far (user Q 2026-07-19 — losing minutes of
      // cook must never be the default). Threshold: at least 1s of footage (fps frames) on a
      // cancelled run — below that there's nothing worth stitching.
      if (framesDone >= (MQS._cancel ? fps : 1)) {
        if (MQS._cancel) console.log('§MAXQ_CANCEL_PARTIAL stitching ' + framesDone + ' frames (' +
          (framesDone / fps).toFixed(1) + 's of footage)');
        // §MAXQ_MP4: mp4/H.264 first (plays on iPhone/WhatsApp), webm MediaRecorder as fallback.
        // opts.forceWebm=true skips mp4 entirely — that is how the fallback path stays witnessed.
        var mp4ok = false;
        if (opts.forceWebm) console.log('§MAXQ_MP4_FALLBACK reason=forced-webm (opts.forceWebm)');
        else mp4ok = await MQS._stitchMp4(db, framesDone, fps, w, h);
        if (!mp4ok) await MQS._stitch(db, framesDone, fps, w, h);
      } else if (MQS._cancel) {
        MQS._status('🎬 MaxQ cancelled at frame ' + framesDone + ' — under 1s of footage, nothing saved');
      } else if (_idbLost) {
        // §MAXQ_IDB_SALVAGE: the non-cancel break path above falls through both branches above
        // silently otherwise — with zero user-visible feedback this reads as "hung", not "failed
        // with nothing to save" (real user report, 2026-07-26).
        MQS._status('🎬 MaxQ stopped at frame ' + framesDone +
          ' — lost its storage connection (tab backgrounded, or another MaxQ bake running in a ' +
          'different tab of this app) before enough footage was captured to save');
      } else if (_glLost) {
        MQS._status('🎬 MaxQ stopped at frame ' + framesDone +
          ' — the browser reclaimed the 3D view (long-idle GPU throttle) before enough footage ' +
          'was captured to save');
      }
    } catch (e) {
      console.warn('§MAXQ_FAIL ' + e.message);
      MQS._status('🎬 MaxQ failed: ' + e.message +
        (e.message === 'idb-open-timeout' ? ' — close other tabs of this app and retry' : ''));
    } finally {
      MQS._restoreRandom();
      // A throw mid-fold (e.g. the idb-open abort) skips the in-try stop — staging would otherwise
      // stay frozen on screen with the composer accumulating.
      try { if (A._stillRefineActive) A.stopStillRefine(true); } catch (e2) {}
      // §CPE_BUILDUP: same restore on the THROW path. A re-keyed op-log left behind by a crashed
      // bake would look like a corrupted schedule to the next person who opens the timeline.
      try { if (_bkState && window.tmRestoreDerivedOrder) { window.tmRestoreDerivedOrder(); _bkState = null; } } catch (e3) {}
      // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: same restore on the THROW path — see the in-try comment above.
      try { if (window.tmDeactivateIfBakeOwned) window.tmDeactivateIfBakeOwned(); } catch (eTM2) {}
      try { if (A.roadPanelsDispose) A.roadPanelsDispose(); A._roadPanelTn = null; } catch (eRPD2) {}   // §ALTC_PANELS (throw path)
      try { MQS._ghostGroundRestore(); } catch (e4) {}
      try { if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(null, 0); } catch (eRV2) {}
      try { if (A.cpeArchFadeApplyVisual) A.cpeArchFadeApplyVisual(null, 0); } catch (eRVf2) {}
      A._interiorLightsOff = false; A._ilBoundaryLogged = false;     // §116 restore
      try { if (A.storeyRevealApplyVisual) A.storeyRevealApplyVisual(null, 0); } catch (eSR2) {}
      try { if (A.storeyRevealApplyCut) A.storeyRevealApplyCut(null, 0); } catch (eSC2) {}
      try { if (A.loadPathApplyVisual) A.loadPathApplyVisual(null, 0); } catch (eLP2) {}
      try { if (A.loadPathDispose) A.loadPathDispose(); } catch (eLPd2) {}
      try { if (A.ledgerTickerDispose) A.ledgerTickerDispose(); } catch (eLTd2) {}
      try { if (A.escapeRouteApplyVisual) A.escapeRouteApplyVisual(null, 0); } catch (eER2) {}
      try { if (A.flythruCuesDispose) A.flythruCuesDispose(); } catch (eFD2) {}
      try { if (A.slabBeatDispose) A.slabBeatDispose(); } catch (eSBD2) {}
      try { if (A.linearBeatDispose) A.linearBeatDispose(); } catch (eLBD2) {}
      try { if (A.indoorBeatsDispose) A.indoorBeatsDispose(); } catch (eIBD2) {}
      try { if (A.flyoutBeatsDispose) A.flyoutBeatsDispose(); } catch (eFBD2) {}
      try { MQS._workPacingReset(); } catch (e5) {}
      // §CLASH_FILM_P1 — same restore on the THROW path (review of #1678): a throw inside the loop
      // skips the in-try dispose above and would leave the marker InstancedMeshes in the user's
      // scene. dispose() is idempotent, so after a normal exit this is a silent no-op.
      try { if (A.clashFilm && A.clashFilm.dispose) A.clashFilm.dispose(); } catch (eCFd2) {}
      // §CLASH_FILM_P2 — same: a thrown loop leaves the label's hysteresis/fade state for the next bake otherwise.
      try { if (A.clashLabels && A.clashLabels.reset) A.clashLabels.reset(); } catch (eCLr2) {}
      // §40.1 — a second bake, or the live editor preview, must not inherit THIS bake's armed
      // rectangles: a different frame size or a different corner would then draw into stale boxes.
      try { if (A.filmBoxesDisarm) A.filmBoxesDisarm(); } catch (eFBd) {}
      try { if (A._giFilmArmed && window.GiFilm) window.GiFilm.disarm(); } catch (eGF) {} A._giFilmArmed = false;   // §GI_FILM
      // Recoverability FIRST: clearing the store can itself block for seconds behind the very
      // zombie connection that failed this run, and until these flags reset the next Alt+C is
      // swallowed as a cancel-toggle. Cleanup must never gate the ability to retry.
      MQS._active = false; MQS._cancel = false;
      A._maxqActive = false;
      MQS._wakeRelease(); MQS._dampRelease(); MQS._bakeBudgetRelease();
      await MQS._idbDestroy(db);
    }
  }

  // No own key binding: Alt+C (scene.js §KBD_ROUTE) and the Palette cinema icon (panels.js)
  // are the triggers — this feature REPLACES the live-capture orbit at that icon per user spec.
  // start() while running = cancel (toggle), same as pressing the icon again.
  function cancel() {
    console.log('§MAXQ_CANCEL requested active=' + MQS._active);
    if (MQS._active) MQS._cancel = true;
  }
  // APP may not exist at parse time — attach the public API once it does.
  var _attach = setInterval(function() {
    if (window.APP) {
      window.APP.startMaxQualityOrbit = start;
      window.APP.cancelMaxQualityOrbit = cancel;
      // §CPE_GHOST_GROUND: exported so cinema_path_editor's REHEARSAL drives the identical curve —
      // one implementation, two call sites (the §CPE_ROOM_TITLE precedent).
      // §CPE_BUILDUP_WORK_PACED: the rehearsal must ask for the same cursor as the bake, or the
      // preview shows a different construction rate from the film it is previewing.
      window.APP.buildupCursorAt = MQS._workCursorAt;
      // §CPE_BUILDUP_TOPOUT — exposed for the preview (same remap as the bake, one implementation)
      // and for the witness, which gates the pure mapping instead of sitting through a bake.
      window.APP.buildupTAt = MQS._buildupTAt;
      window.APP.buildupTopoutU = MQS._buildupTopoutU;
      window.APP.buildupPacingReset = MQS._workPacingReset;
      window.APP.ghostGroundArm = MQS._ghostGroundArm;
      window.APP.ghostGroundAt = MQS._ghostGroundAt;
      window.APP.ghostGroundRestore = MQS._ghostGroundRestore;
      // §GHOST_GROUND_LIVE_TRIGGER: read-only accessor for the witness — returns the ACTUAL live
      // `firstT` this arm computed (elements-fraction or calendar-fraction, whichever domain
      // `tFilm` is really in) alongside both candidates, so a witness/diagnostic can assert against
      // the real value instead of re-deriving its own guess of which domain won.
      window.APP.ghostGroundDebugState = function() {
        return MQS._ggSpan ? { firstT: MQS._ggSpan.firstT, calendarFirstT: MQS._ggSpan.calendarFirstT,
                            elementsFirstT: MQS._ggSpan.elementsFirstT, fallback: MQS._ggSched && MQS._ggSched.fallback } : null;
      };
      // §CPE_MAXQ_STATUS_DAY_LABEL — exposed for the witness (gates the pure formatter directly,
      // same precedent as the other pure functions on this line, instead of sitting through a bake).
      window.APP.maxqStatusDayRoomSegs = MQS._maxqStatusDayRoomSegs;
      // ══ §CLI_SILENT_BAKE item 1 (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md) — dev-only
      // scripted entry, defined ONLY when the launcher pre-set __MAXQ_SILENT before any page
      // script ran (puppeteer evaluateOnNewDocument), so no user session ever sees it. Resolves
      // the stored path — object | named IndexedDB plan | the building DB's own cinema_path
      // table — into the ONE _buildOverride() shape and hands it to start(). No second schema.
      if (window.__MAXQ_SILENT) window.__maxqBake = async function(o) {
        o = o || {};
        var a = window.APP;
        var ov = null, src = null;
        if (o.override) { ov = o.override; src = 'caller-object'; }
        else if (o.name) {
          var bld = a.activeBuilding || a.buildingName || 'building';
          var rec = await new Promise(function(res, rej) {
            var rq = indexedDB.open('bim_ootb_cinema_paths', 1);
            rq.onupgradeneeded = function() {
              var d = rq.result;
              if (!d.objectStoreNames.contains('paths')) d.createObjectStore('paths', { keyPath: 'key' });
            };
            rq.onsuccess = function() {
              var db = rq.result;
              try {
                var g = db.transaction('paths', 'readonly').objectStore('paths').get(bld + '|' + o.name);
                g.onsuccess = function() { db.close(); res(g.result || null); };
                g.onerror = function() { db.close(); rej(g.error || new Error('idb-get-failed')); };
              } catch (e) { db.close(); rej(e); }
            };
            rq.onerror = function() { rej(rq.error || new Error('idb-open-failed')); };
          });
          if (!rec || !rec.override) throw new Error('no stored plan "' + o.name + '" for building ' + bld);
          ov = rec.override; src = 'idb:' + bld + '|' + o.name;
        } else {
          // The PORTABLE store: trigger effects.js's own lazy _cpeLoadFromDb via a throwaway
          // plan, then read the staged result — the shipped loader, never a re-implementation.
          // Guard FIRST: _cpeLoadFromDb latches _cpeLoaded=true on entry, so probing before the
          // DB is open would permanently blind this session to the stored path (found live on the
          // very first CLI smoke run, 2026-09-01 — the runner's readiness wait raced the load).
          if (!a.db) throw new Error('building DB not open yet — wait for load before __maxqBake');
          if (typeof a.cinemaPathPlan === 'function') try { a.cinemaPathPlan(60); } catch (ePl) {}
          var staged = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
          if (!staged) throw new Error('no stored path: cinema_path table absent/empty and no plan named');
          ov = staged; src = 'db:cinema_path';
        }
        // Shallow copy before the flag-merge so a staged holder (A._cinemaPathEdit) is never
        // mutated (§CPE_HOLDER_INTEGRITY, same reasoning as _buildOverride's deep copies).
        var ov2 = {}; for (var k in ov) ov2[k] = ov[k]; ov = ov2;
        if (o.flags) ['buildup', 'roomTitle', 'reveal', 'dayCounter', 'clash', 'measure', 'storeyReveal', 'loadPath', 'ledger', 'cost', 'sunCompass', 'sunDate', 'escapeRoute', 'visualPanel', 'audioPanel', 'filmBounce'].forEach(function(fk) {   // §FREEZE_PERF_PANEL added visualPanel/audioPanel
            // §FLYTHRU_DATUM §28.1: 'measure' was missing — a CLI --measure was silently dropped; §129 GATING added 'ledger'/'cost' (2026-09-15)
          if (o.flags[fk] !== undefined) ov[fk] = o.flags[fk];
        });
        // §CPE_CHECKBOX_SAVE: the saved Bounce-light box (default ON when absent) drives the same runtime switch the panel's
        // checkbox sets; an explicit CLI --bounce arrives as flags.filmBounce and wins via the merge above.
        if (ov.filmBounce !== undefined) { a._filmBounceOff = (ov.filmBounce === false); console.log('§CPE_FILM_BOUNCE source=' + (o.flags && o.flags.filmBounce !== undefined ? 'cli' : src) + ' bounce=' + (ov.filmBounce === false ? 0 : 1)); }
        // §SDC (2026-09-04, PHOTOREAL_STILL_RENDER.md §BME.7): a dev clip window rides the same
        // §CPE_CLIP field the editor writes, so the loop below needs no second notion of a window.
        if (o.clip && +o.clip.out > +o.clip.in) ov.clip = { in: +o.clip.in, out: +o.clip.out };
        window.__maxqResolvedOverride = ov;   // for the runner's post-bake pose assertion
        console.log('§CLI_BAKE_RESOLVED source=' + src + ' bands=' + (ov.bands ? ov.bands.length : 0) +
          (ov.clip ? ' clip=' + ov.clip.in + '→' + ov.clip.out : '') +
          ' total=' + (ov._total != null ? (+ov._total).toFixed(1) : '?') + 's' +
          ' buildup=' + (ov.buildup ? 1 : 0) + ' roomTitle=' + (ov.roomTitle ? 1 : 0) +
          ' reveal=' + (ov.reveal ? 1 : 0) + ' dayCounter=' + (ov.dayCounter || 'tr') +
          // §CLI_BAKE_CLASH_CENSUS (2026-09-19, red1: "Is Clashes overlay on too?") — `clash` rode
          // the override through _buildOverride and the flag list, and was the ONE overlay this
          // census never printed. So no bake log could answer that question: you had to read the
          // command line, or look at frames. Every other flag here is reported; this one is now too.
          ' clash=' + (ov.clash ? 1 : 0) +
          ' escapeRoute=' + (ov.escapeRoute ? 1 : 0) + ' visualPanel=' + (ov.visualPanel ? 1 : 0) + ' audioPanel=' + (ov.audioPanel ? 1 : 0) +
          ' storeyReveal=' + (ov.storeyReveal ? 1 : 0) + ' measure=' + (ov.measure ? 1 : 0) +
          ' loadPath=' + (ov.loadPath ? 1 : 0) + ' ledger=' + (ov.ledger ? 1 : 0) + ' cost=' + (ov.cost ? 1 : 0) +
          ' sunCompass=' + (ov.sunCompass ? 1 : 0) + ' sunDate=' + (ov.sunDate || '-'));
        await start({ editor: false, preview: false, override: ov, overrideSource: src,
                      frames: o.frames, fps: o.fps, forceWebm: o.forceWebm,
                      burninDatumDir: o.burninDatumDir,   // §DATUM_DECOUPLE — was silently dropped here
                      stillBudget: o.stillBudget,   // LARGE_DB_BAKE.md §2 L3 — CLI --still-budget override
                      frameRange: o.frameRange });   // LARGE_DB_BAKE.md §2 L4 — CLI --frame-range override
        return { source: src, deliveredBytes: window.__maxqDeliveredBytes || 0 };
      };
      clearInterval(_attach);
    }
  }, 500);
};
