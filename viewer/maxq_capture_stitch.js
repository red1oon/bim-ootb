// cinema_maxq family — part `capture_stitch` (original cinema_maxq.js lines 1702–2563).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cinema_maxq.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as MQS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts = (typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts.capture_stitch = function* __split_cinema_maxq_capture_stitch(MQS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  MQS._captureFrame = _captureFrame;
  MQS._stitchMp4 = _stitchMp4;
  MQS._stitch = _stitch;
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  // §ESCAPE_ROUTE_HUD_SUPPRESS is WIRED — `_escSuppresses` above says what ceases (the Sanity
  // rule-findings chips and the clash labels) and what keeps drawing (the sun clock, the compass
  // readout, the day counter, the path box, the pie). These are working decisions red1 adjusts as
  // he sees results; this comment states what the code does, not how it got here.
  // ⚠ ONE THING THAT IS NOT SUPPRESSION: the Escape Route card occupies the bigStats slot for its
  // window, the same slot the tail/storey/measure cards already take turns in. One slot holds one
  // card; that is the chain's existing behaviour.
  // §SPEED_AB S-A (bim-compiler prompts/ALTC_FOUNDATION.md §SPEED_AB): one encoder for both capture sites. Default WebP 0.92 (unchanged);
  // &capfmt=jpeg (&capq=0.95) = JPEG. §CAPTURE_ENC logs the encode ms + bytes every frame on every arm, so the WebP cost is measured.
  var _capFmt = /[?&]capfmt=jpeg/.test(location.search) ? 'image/jpeg' : 'image/webp';
  var _capQ = (function () { var m = /[?&]capq=([0-9.]+)/.exec(location.search); return m ? +m[1] : (_capFmt === 'image/jpeg' ? 0.95 : 0.92); })();
  var _capN = 0;
  function _capEncode(c, idx) {
    var t0 = performance.now();
    var _cm = window.APP && window.APP._capMarks;
    if (_cm && _cm.length) { _cm.push(['hud', t0]); var _ps = []; for (var _k = 1; _k < _cm.length; _k++) _ps.push(_cm[_k][0] + '=' + (_cm[_k][1] - _cm[_k - 1][1]).toFixed(1));
      console.log('§CAPTURE_PARTS ' + _ps.join(' ') + ' (ms; hud = everything after the 3D draw: window pull, bounce composite, overlays)'); window.APP._capMarks = null; }
    return new Promise(function (res) { c.toBlob(function (b) {
      console.log('§CAPTURE_ENC n=' + (_capN++) + (idx != null ? ' i=' + idx : '') + ' fmt=' + _capFmt.slice(6) + ' q=' + _capQ + ' ms=' + (performance.now() - t0).toFixed(1) + ' compMs=' + (window.APP && window.APP._capT0 ? (t0 - window.APP._capT0).toFixed(1) : '-') + ' bytes=' + (b ? b.size : 'null'));
      res(b); }, _capFmt, _capQ); });
  }
  async function _captureFrame(w, h, titleInfo, dayInfo, ovInfo, resInfo, statInfo, lblInfo, statusSrc, escInfo, escCardInfo) {
    if (window.APP) window.APP._capT0 = performance.now();   // §CAPTURE_SPLIT: composite ms = this -> toBlob call
    var _fcFilmSec = (window.APP && window.APP._flythruFilmSec) || 0;
    var A = window.APP;
    A._hudLayoutRects = [];   // §HUD_LAYOUT — fresh registry every frame, never carries a stale rect
    A._hudCompositeAlphaSample = {};   // ROUND 13 item C — fresh per frame, keyed by _drawUnlessHold's own name
    A._hudLayoutRegister = MQS._hudLayoutRegisterImpl;
    A._hudLayoutWitness = MQS._hudLayoutWitnessImpl;
    A._hudLayoutFocusWitness = MQS._hudLayoutFocusWitnessImpl;
    // §40.1 — the Measure queue is per FRAME. Reset before the beat compositors run so a
    // posting can never survive into the next frame's box.
    if (A.filmBoxesMeasureReset) A.filmBoxesMeasureReset();
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    A._captureCtx = ctx;   // §129.8 item 4b — the ONE ctx _drawUnlessHold's HUD alpha fade applies to
    // §DATUM_DECOUPLE (prompts/MEP_CLASH_REVEAL_MOVIE.md §53) — bisect-only mode, NOT the normal path.
    // No GPU render, no other overlay: the source PNG already carries everything except the datum
    // (baked with its two draw entry points stubbed, out/tap_datum_off.js). Isolates whether the
    // defect is in the function's own math/state or in something about the live GPU bake loop.
    if (A._burninDatumDir) {
      var _bIdx = A._burninFrameIdx || 0;
      var _bUrl = A._burninDatumDir + 'frame_' + String(_bIdx).padStart(5, '0') + '.png';
      var _bImg = await new Promise(function (resolve, reject) {
        var im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { reject(new Error('§DATUM_DECOUPLE_ERR frame load failed: ' + _bUrl)); };
        im.src = _bUrl;
      });
      ctx.drawImage(_bImg, 0, 0, w, h);
      // ROUND 16 item 2 (2026-09-16, §129.9 item 2) — DELETED: this call drew the datum overlay
      // UNCONDITIONALLY, outside `_drawUnlessHold`'s own hold-fade wrapper (the SAME overlay is
      // drawn again below, correctly wrapped, on the normal live-render path) — an unwrapped
      // composite call that would survive a load-path hold undetected by any alpha check. §53's own
      // bisect-only decouple mode does not need the datum burned into its diagnostic frames at all;
      // if it ever does again, it must go through the SAME wrapper as everything else, never a
      // second unwrapped call.
      if (A.loadPathCompositeOntoCanvas) {
        try { A.loadPathCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eLPD) { console.warn('§LOADPATH_DRAW_ERR failed (burn-in): ' + (eLPD && eLPD.message)); }
      }
      if (A.ledgerTickerCompositeOntoCanvas) {
        try { A.ledgerTickerCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eLTD) { console.warn('§LEDGER_TICKER_DRAW_ERR failed (burn-in): ' + (eLTD && eLTD.message)); }
      }
      if (_bIdx === 0 || _bIdx % 100 === 0) console.log('§DATUM_DECOUPLE_FRAME i=' + _bIdx + ' src=' + _bUrl);
      return _capEncode(c, _bIdx);
    }
    // §129 DIAGNOSTIC (2026-09-17, red1: "not a single change is evident" — re-checking with real
    // frame reads, not another blind bake) — sample LIVE scene state at the EXACT instant this
    // frame's render actually happens, immediately before it, from the SAME `A.scene` traversal the
    // apply-side code used. Every apply-side witness (§LOADPATH_WHITEN, §LOADPATH_BACKDROP) reads
    // its OWN bookkeeping arrays right after mutating them — never disproves that the mutation
    // reached the object actually drawn. This does.
    if (A._loadPathHoldFrameActive && A._loadPathDiagSample) {
      try { A._loadPathDiagSample('pre-render'); } catch (eLPD2) { console.warn('§LOADPATH_DIAG_ERR ' + (eLPD2 && eLPD2.message)); }
    }
    A._capMarks = [['start', A._capT0 || performance.now()]];   // §CAPTURE_PARTS
    // §RENDER_INFO: what ONE jittered scene render submitted (TAARenderPass records renderer.info after its scene render), every 24th capture
    A._riN = (A._riN || 0) + 1; if (A._taaPass && A._taaPass.lastSceneCalls != null && A._riN % 24 === 1) { var _ri = A.renderer.info;
      console.log('§RENDER_INFO capture=' + A._riN + ' sceneCalls=' + A._taaPass.lastSceneCalls + ' sceneTris=' + A._taaPass.lastSceneTris + ' geometries=' + (_ri.memory ? _ri.memory.geometries : '-') + ' textures=' + (_ri.memory ? _ri.memory.textures : '-') + ' programs=' + (_ri.programs ? _ri.programs.length : '-')); }
    if (A._composer) A._composer.render();
    A._capMarks.push(['composer', performance.now()]);
    // §GI_CAPTURE_HOOK (worktree only, 2026-09-22) — opt-in seam for an alternative renderer to
    // supply THIS frame's 3D pixels. Absent hook = byte-identical to before (the else branch is the
    // original line, unchanged). Present hook = it draws into the same ctx at the same point, before
    // any HUD/overlay work, so the 2D overlays, storey reveal, build-up, clash and escape route all
    // behave exactly as in a normal bake — they are driven by the bake loop, not by the renderer.
    // WHY A HOOK AND NOT A CANVAS SWAP: this capture is synchronous, and a WebGPU frame must be read
    // back asynchronously — presenting straight to a canvas was re-tested on this box and comes back
    // black (headless Dawn swapchain, as §133 records: meanOnCanvas=0). _captureFrame is already
    // async, so awaiting a hook is the one seam that keeps the pose and its pixels on the same frame.
    if (typeof window.__giCaptureFrame === 'function') {
      try { await window.__giCaptureFrame(ctx, w, h); }
      catch (eGI) {
        if (!A._giCaptureErrLogged) { A._giCaptureErrLogged = true;
          console.warn('§GI_CAPTURE_ERR ' + (eGI && eGI.message) + ' at ' + String(eGI && eGI.stack || '').split('\n').slice(1, 6).map(l => l.trim()).join(' | ') + ' — reverting to the app renderer for the rest of this bake'); }
        window.__giCaptureFrame = null;
        ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
      }
    } else {
      ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
    }
    A._capMarks.push(['draw3d', performance.now()]);
    // §129 DIAGNOSTIC (2026-09-17) — GROUND TRUTH pixel readback, right after the 3D scene lands in
    // the 2D capture canvas, before any HUD/overlay draws touch it. Every prior check (apply-side
    // witnesses, the live pre-render state sample above) proves JS OBJECT STATE, never proves a
    // PHOTON actually changed. This reads the real encoded pixels themselves, a 5x5 median sample at
    // 5 fixed fractional points across the frame (building-heavy regions in the sighted stills), on
    // hold frames only, so a real change (or its total absence) is undeniable either way.
    // §FILM_WINDOW_PULL (bim-compiler prompts/ALTC_FOUNDATION.md "§FILM_INHERIT" item 3): the still's window pull, per frame, on the
    // composited scene before any HUD — only while the new lighting is on (A._filmFieldOn) AND the camera stands inside a zone (its
    // mask depends on where the camera looks, so it cannot be reused per shot). Outside frames pay one zone lookup and nothing else.
    // &filmwindowpull=0 = off.
    if (A._filmFieldOn && window.GiFilm && window.GiFilm.windowPull && window.LightZones && window.LightZones.atRaw && !/[?&]filmwindowpull=0/.test(location.search)) {
      try { var _wpc = A.camera.position, _wpz = window.LightZones.atRaw({ x: _wpc.x, y: _wpc.y, z: _wpc.z });
        if (_wpz !== 0 && _wpz !== -1) { var _wpR = {}; window.GiFilm.windowPull(A, ctx, w, h, _wpR); A._filmWinPullN = (A._filmWinPullN || 0) + (_wpR.windowPull ? 1 : 0); } }
      catch (eWP) { if (!A._filmWinPullErr) { A._filmWinPullErr = true; console.warn('§FILM_WINDOW_PULL failed ' + (eWP && eWP.message)); } }
    }
    // §FRAME_COST S4 (2026-10-01): its own spec above says "on hold frames only" but it ran on EVERY frame (255 lines in a 255-frame
    // clip, mid2.log) — 16 getImageData readbacks per frame on a canvas without willReadFrequently (Chrome's own warning in the log).
    if (A._loadPathHoldFrameActive) try {
      var _pxPts = [[0.30, 0.55], [0.45, 0.65], [0.60, 0.45], [0.20, 0.75], [0.70, 0.70],
        [0.53, 0.87], [0.62, 0.92], [0.05, 0.42], [0.10, 0.50], [0.85, 0.60], [0.784, 0.77],
        [0.913, 0.031], [0.95, 0.08], [0.80, 0.15], [0.41, 0.21], [0.35, 0.12]];
      var _pxOut = [];
      for (var _pp = 0; _pp < _pxPts.length; _pp++) {
        var _px = Math.round(_pxPts[_pp][0] * w), _py = Math.round(_pxPts[_pp][1] * h);
        var _d = ctx.getImageData(_px, _py, 1, 1).data;
        _pxOut.push(_px + ',' + _py + '=' + _d[0] + ',' + _d[1] + ',' + _d[2]);
      }
      console.log('§LOADPATH_PIXEL_DIAG_PRE_HUD hold=' + !!A._loadPathHoldFrameActive + ' hudAlpha=' + (A._loadPathHudAlpha == null ? 'n/a' : A._loadPathHudAlpha.toFixed(3)) + ' ' + _pxOut.join(' '));
      if (A._loadPathHoldFrameActive && A._loadPathMidHoldThisFrame && !A._loadPathDiagRaycastFired && A._loadPathDiagRaycast) {
        A._loadPathDiagRaycastFired = true;
        var _ndcPts = _pxPts.map(function (fp) { return [fp[0] * 2 - 1, 1 - fp[1] * 2]; });
        A._loadPathDiagRaycast(_ndcPts, 'midHold');
      }
    } catch (ePxD) { console.warn('§LOADPATH_PIXEL_DIAG_ERR ' + (ePxD && ePxD.message)); }
    // ROUND 16 item 2 — instrument the capture ctx for this frame's WHOLE HUD/overlay composite
    // pass, ONLY on a hold frame (never the cost of a per-frame wrapper on every other frame): the
    // base scene render just above is deliberately OUTSIDE this window (it is not a HUD overlay and
    // must never be fade-gated). Uninstalled right after §LOADPATH_FOCUS reads the count, below.
    var _lpInstrumentedThisFrame = !!A._loadPathHoldFrameActive;
    MQS._lpUnwrappedDrawCount = 0;
    MQS._lpAlphaAtDraw = {};
    if (_lpInstrumentedThisFrame) MQS._lpInstallDrawInstrument(ctx);
    // §CLASH_FILM_P2 — the clash-pair labels, FIRST in the 2D pass: they are scene-anchored and
    // wander, the corner HUD below is fixed furniture, so the HUD must always paint over a label.
    // Same never-kills-a-bake contract as every other overlay here.
    // §FLYTHRU_DIM_CUE — the measurement marking. Composited here because the bake captures this
    // 2D context, not the WebGL canvas: a marking drawn in 3D text would not survive the capture.
    // §FLYTHRU_DATUM (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §24) — the opening setting-out
    // drawing: grid bubbles, bay chains and level rules laid IN THE MODEL'S OWN PLANES.
    // ⚠ Until now this layer existed only in scripts/snap_timeline.js: it had never been composited
    // by a real bake, so no Alt-C film has ever carried it. Same never-kills-a-bake contract as the
    // overlays around it, and gated by the Measure checkbox rather than always-on.
    // ⚠ _captureFrame is its OWN function, not a closure over the bake body — which is exactly why
    // _fcFilmSec above is read off window.APP rather than captured. The datum's two values cross the
    // same way; declaring them in the bake body would have compiled cleanly and thrown at run time.
    // §129.6 item 8 FOCUS — every overlay below with its OWN real-time animation is wrapped in
    // _drawUnlessHold so it paints nothing at all on a hold frame (window.__lpNoFocusHold=1 forces
    // it through, for the control). load path + the (now no-op) ledger ticker composite are NEVER
    // wrapped — load path is the one thing that keeps animating through the hold by design.
    if (A._flythruDatumOn && A.flythruDatumCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.datum', function () {
        try { A.flythruDatumCompositeOntoCanvas(ctx, w, h, _fcFilmSec, A._flythruFilmSecFull || 0); }
        catch (eFDM) { if (!A._flythruDatumWarned) { A._flythruDatumWarned = true; console.warn('§FLYTHRU_DATUM_DRAW failed: ' + (eFDM && eFDM.message)); } }
      });
    }
    if (A.flythruCuesCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.cues', function (a) {
        // ROUND 13 item C — `a` (the ambient hold-fade alpha) is now passed through as the cue
        // layer's own external multiplier (flythruCuesCompositeOntoCanvas's 5th param, NEW), since
        // its internal `ctx.globalAlpha = a.opacity` (its own cue fade-in/out) is an absolute
        // assignment that would otherwise clobber the ambient alpha `_drawUnlessHold` set before
        // this call.
        try { A.flythruCuesCompositeOntoCanvas(ctx, w, h, _fcFilmSec, a); }
        catch (eFDC) { if (!A._flythruDimWarned) { A._flythruDimWarned = true; console.warn('§FLYTHRU_DIM_DRAW failed: ' + (eFDC && eFDC.message)); } }
      });
    }
    // §HUD FIX (2026-09-15, real HHS bake: the label ladder collided with the pie/resource panel)
    // — A.loadPathCompositeOntoCanvas/A.ledgerTickerCompositeOntoCanvas (the latter a no-op since
    // §129.6 item 6b) MOVED to the END of this function (see below, right before the §HUD_LAYOUT/
    // §LOADPATH_FOCUS trigger): the label ladder's OWN column-placement algorithm now reads
    // A._hudLayoutRects to avoid every rect already registered THIS frame, which only works if
    // status-box/resource-panel/roster have already drawn (and registered) by the time it runs.
    // §LINEAR_BEAT (§27) — the column/beam dimension cues, same 2D pass, same never-kills-a-bake contract.
    if (A._flythruDatumOn && A.linearBeatCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.linear', function () {
        try { A.linearBeatCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eLBC) { if (!A._linearBeatWarned) { A._linearBeatWarned = true; console.warn('§LINEAR_BEAT_DRAW failed: ' + (eLBC && eLBC.message)); } }
      });
    }
    // §SLAB_BEAT (§40.2) — the plate's surface area posts into the Measure queue here, in the 2D
    // pass, for the same reason every other beat does: this is the only point that reaches the
    // exported bytes. Its in-model marks (tint + box outline) are 3D and already in the frame.
    if (A._flythruDatumOn && A.slabBeatCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.slab', function () {
        try { A.slabBeatCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eSBC) { if (!A._slabBeatWarned) { A._slabBeatWarned = true; console.warn('§SLAB_BEAT_DRAW failed: ' + (eSBC && eSBC.message)); } }
      });
    }
    if (A._flythruDatumOn && A.indoorBeatsCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.indoor', function () {
        try { A.indoorBeatsCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eIBC) { if (!A._indoorBeatsWarned) { A._indoorBeatsWarned = true; console.warn('§INDOOR_BEAT_DRAW failed: ' + (eIBC && eIBC.message)); } }
      });
    }
    if (A._flythruDatumOn && A.flyoutBeatsCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.flyout', function () {
        try { A.flyoutBeatsCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eFBC) { if (!A._flyoutBeatsWarned) { A._flyoutBeatsWarned = true; console.warn('§FLYOUT_BEAT_DRAW failed: ' + (eFBC && eFBC.message)); } }
      });
    }
    if (A._flythruDatumOn && A.ruleFindingsFilmCompositeOntoCanvas) {
      MQS._drawUnlessHold('measure.rulefindings', function (a) {
        try { A.ruleFindingsFilmCompositeOntoCanvas(ctx, w, h, _fcFilmSec, a); }
        catch (eRFC) { if (!A._ruleFindingsFilmWarned) { A._ruleFindingsFilmWarned = true; console.warn('§RULE_FILM_DRAW failed: ' + (eRFC && eRFC.message)); } }
      });
    }
    // §ESCAPE_ROUTE_REVEAL — the dotted route and its two leader labels. Scene-anchored like the
    // clash labels above it and drawn in the same 2D pass for the same reason (§P2.2): this is the
    // only layer that reaches the exported bytes. Before the corner HUD, which is fixed furniture.
    if (escInfo && A.escapeRouteCompositeOntoCanvas) try {
      A.escapeRouteCompositeOntoCanvas(ctx, w, h, escInfo);
    } catch (eERd) {
      if (!A._escDrawErrLogged) { A._escDrawErrLogged = true;
        console.warn('§ESCAPE_ROUTE_ERR draw: ' + eERd.message + ' — route skipped, frames continue'); }
    }
    // §STATUS_BOX — the centred lower-third caption plate is NOT drawn here. It was, from a
    // keep-both merge resolution in d63c59d6, and the exported frame then carried BOTH the
    // right-hand status box AND the bar that box replaced (§38.1b: "REPLACES the centred
    // lower-third caption plate for the bake ... only the exported frame stops using it"). red1
    // saw it: "there is an old Measure status bottom bar which we first moved to the HUD, but that
    // copy still there in this clip."
    // ⚠ WORSE THAN A DUPLICATE. That call sat OUTSIDE _drawUnlessHold, so it registered no rect
    // (which is how §HUD_LAYOUT never saw two captions), it did not fade with the load-path freeze
    // when every other overlay does, and it would have ignored the §FINDINGS_HUD_CLEAR gate, which
    // lives inside that wrapper.
    // The surviving draw is the `else` of `if (A.filmBoxesDrawStatus)` further down — the fallback
    // for a build where the status box is absent. Deleting this one alone would have taken the
    // escape-route caption off screen with it (checked: filmBoxesDrawStatus exists in a bake, so
    // that else never runs), which is why `_erCap` now rides the status box's Reveal row.
    if (lblInfo && lblInfo.placed && lblInfo.placed.length && A.clashLabelsCompositeOntoCanvas) {
      MQS._drawUnlessHold('clash.labels', function (a) {
        try { A.clashLabelsCompositeOntoCanvas(ctx, w, h, lblInfo.placed, a); }
        catch (eCLd) {
          if (!A._clashLblDrawErrLogged) { A._clashLblDrawErrLogged = true;
            console.warn('§CLASH_LABELS_ERR draw: ' + eCLd.message + ' — labels skipped, frames continue'); }
        }
      });
    }
    // §MEASURE_BOX (§38.1a, §40.1) — every Measure beat above posted into the queue instead of
    // hanging a roaming plate off its subject; ONE fixed panel draws them, and draws NOTHING when
    // nothing posted. After the beats (so the queue is complete), before the HUD furniture.
    // §ESCAPE_PANEL_SLOT — ONE SLOT, ONE OCCUPANT. red1: "And the old opposing HUD is replaced."
    // While the Escape Route card holds this corner (its window plus its linger) the Measure box
    // does not draw there at all — the same rotating-occupant model the bigStats slot already uses
    // for the pie, the tail cards and the storey card. This is a REPLACEMENT, not a coexistence:
    // two panels in one corner is the crowding the move exists to end.
    // The Measure box takes the slot back by simply drawing again once escCardInfo is null. Whether
    // it SHOULD come back during the closing orbit is red1's call; with §SLAB_LABEL_STALE in place
    // the slab label has already stood down by then, so in practice the corner stays clear.
    if (A.filmBoxesDrawMeasure && !escCardInfo) {
      MQS._drawUnlessHold('measure.box', function () {
        try { A.filmBoxesDrawMeasure(ctx, w, h, null, _fcFilmSec); }
        catch (eMB) { if (!A._measureBoxWarned) { A._measureBoxWarned = true; console.warn('§MEASURE_BOX draw failed: ' + (eMB && eMB.message)); } }
      }, function () { return A.filmBoxesMeasureLastBox; });   // §129.55 C
    }
    // §STATUS_BOX (§38.1b, §40.1) — REPLACES the centred lower-third caption plate for the bake.
    // A.roomTitleCompositeOntoCanvas is untouched and still serves the live editor preview and its
    // six witnesses; only the exported frame stops using it, because that plate sized itself to its
    // own text and re-centred every frame — the "status that flickers around" the user named.
    // §129.8 item 4b — SUPERSEDES §129.6 item 8's old "status box stays, frozen" exemption ("during
    // the freeze, completely remove any HUD"): the status box now fades with everything else.
    // §HUD_COLUMN_FLOOR — the status box is drawn AFTER the card/panel stack below, not here,
    // because its slot sits in the SAME column and the panel above it is variable height. Moved
    // 2026-09-21; see the note at the draw site.
    // §HUD_ROW — the day counter used to draw here, alone, before the column below it was even
    // measured. It is now the first member of the top ROW assembled further down, so its width
    // is known to the boxes beside it. Nothing else moved.
    // §SUN_COMPASS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7) — the "N" and the day-of-
    // year ride the ROSE in world space; the sun-angle readout is a fixed bottom-left pill.
    // ⚠ Read off A.sunCompassInfo() rather than taken as a 9th parameter, for the reason the
    // §FLYTHRU_DATUM note above gives: _captureFrame is its own function, not a closure over the
    // bake body. The bake loop already called A.sunCompassAt(_bkMs) for THIS frame, so the state
    // it reads is this frame's, not a neighbour's. Same never-kills-a-bake contract.
    // §CPE_PATH_OVERVIEW — drawn LAST so its backdrop-blur samples the finished frame and never
    // smears the caption or the counter into its own glass. `ovInfo.pose` is the REAL pose this
    // frame was rendered with, captured by the caller immediately before this call.
    // §CPE_RESOURCE_PANEL — drawn between the counter and the overview, one column, one corner.
    // Same never-kills-a-bake contract as the box below it.
    // §CPE_HUD_ORDER (2026-08-30, user after seeing a real baked frame): counter -> PATH BOX -> pie.
    // The path box answers "where am I", which a viewer tracks continuously, so it sits directly
    // under the clock; the pie is a readout you consult rather than follow, so it goes below.
    // ONE running offset builds the column so the three can never overlap or leave a gap.
    // ══ §HUD_ROW (2026-09-19) — ONE TOP ROW, then everything else below it ══════════════════
    // red1, after a 1080p frame: "align the clock, data, day counter in a single row ... put the
    // cam path map same row too? in that way it will always have room for its 4D5D HUD below it".
    //
    // WHAT WAS WRONG: these four were ONE VERTICAL COLUMN (counter -> clock -> readout -> path
    // map -> pie -> storey card). At 1920x1080 the column ran past the frame: measured on the
    // delivered film, the path map's plate cut straight through the storey card's top row and the
    // pie panel sat on what was left. Taller frames made it worse, not better, because every box
    // is a fraction of frame HEIGHT and the column is their SUM — the one arrangement that cannot
    // buy room by baking bigger.
    //
    // WHAT IT IS NOW: the four read-at-a-glance boxes run ACROSS the top in one row, and the
    // column below starts under the tallest of them. The row spends width, which a 16:9 frame has
    // in surplus, instead of height, which it does not.
    //
    // ORDER, from the anchored corner inward: day counter (the headline figure, so it keeps the
    // corner it has always had), clock, sun readout, path map (widest, so it trails). `_rowX` is
    // the running X offset each box is pushed inward by — the exact X twin of the `_stackY` this
    // code already used, and each overlay applies it against its OWN corner, so a left-hand corner
    // preference still builds the row left-to-right without a second code path.
    //
    // WIDTHS COME FROM THE DRAWERS, NOT FROM A SECOND OPINION HERE. Each compositor publishes the
    // rect it actually painted (A.dayCounterLastBox and friends) because two of these four size
    // themselves by MEASURING TEXT, which the caller cannot do without measuring it twice and
    // drifting. Same "one owner of that arithmetic" rule as dayCounterBoxSize.
    var _gapY = Math.round(h * 0.012);
    var _gapX = Math.round(h * 0.014);
    var _rowX = 0, _rowH = 0;
    // Cleared every frame: a compositor that draws nothing (faded out mid-hold, or switched off)
    // returns early and leaves its LastBox untouched, and a STALE rect would reserve row width for
    // a box that is not on screen. Absent must read as absent.
    A.dayCounterLastBox = A.sunClockLastBox = A.sunReadoutLastBox = A.pathOverviewLastBox = null;
    var _rowPos = (dayInfo && dayInfo.pos) || 'tr';
    function _rowAdvance(box) {
      if (!box || !(box.w > 0)) return;          // drew nothing — reserve nothing
      _rowX += box.w + _gapX;
      if (box.h > _rowH) _rowH = box.h;
    }

    // ORDER ALONG THE ROW, from the anchored corner inward (red1, 2026-09-19: "I meant the cam
    // path map to be edge most not centred so it's aligned to the pie 4D5D HUD as was before. It's
    // the new compass clock stuff that is added on top to centre"):
    //     [edge] path map -> day counter -> clock -> sun readout [toward centre]
    // The path map keeps the corner it has always had, so it and the pie panel beneath it share one
    // right edge exactly as they did when they were a column. Everything ADDED since — the counter
    // and the two sun boxes — grows inward from it, so the newest overlays are the ones that move.
    // §CPE_PATH_OVERVIEW — EDGE-MOST, so it stays column-aligned with the pie panel below it. Drawn LAST of the four so its
    // backdrop blur samples a finished frame and never smears its neighbours into its own glass.
    // §129.8 item 4b — it fades with everything else during the hold ("no path map/compass ... no
    // pie panel"), same `_drawUnlessHold` mechanism; `a` is passed as its own opacity param for the
    // absolute-assignment reason above.
    // W2 (ALTC_FOUNDATION §1 rounds 3-4): the load-path card is drawn opaque at [30,30] (~970 px wide) from the arm frame — part of
    // the frozen scene, §129.12/§129.29, it must NOT fade with the HUD — AFTER this row, while the row's boxes are still at alpha 1
    // on the first hold frame (_hudFadeT(0) = 0) => §HUD_OVERLAP_WORST FAIL f=23 1.00/1.00: hud.pathmap (round 3), then
    // suncompass.readout once the map yielded (round 4). The whole top row yields for exactly the card's window
    // (A.loadPathCardOn = the composite's own gate) and keeps its _rowAdvance, so nothing below moves; §129.8 item 4b already
    // fades every row member out during the hold.
    var _cardOn = !!(A.loadPathCardOn && A.loadPathCardOn());
    A._hudRowYield = _cardOn;
    if (_cardOn && !A._hudRowYieldLogged) { A._hudRowYieldLogged = true; console.log('§HUD_ROW_YIELD card on — top-row HUD (' + Object.keys(MQS._HUD_ROW).join(',') + ') not drawn while the load-path card holds the row'); }
    if (!_cardOn) A._hudRowYieldLogged = false;
    if (ovInfo && ovInfo.ov && A.pathOverviewCompositeOntoCanvas) {
      MQS._drawUnlessHold('hud.pathmap', function (a) {
        try {
          A.pathOverviewCompositeOntoCanvas(ctx, w, h, ovInfo.ov, ovInfo.pose, a, ovInfo.pos, 0, _rowX);
        } catch (eOvD) {
          if (!A._ovDrawErrLogged) { A._ovDrawErrLogged = true;
            console.warn('§CPE_PATH_OVERVIEW_ERR draw: ' + eOvD.message + ' — box skipped, frames continue'); }
        }
      }, function () { return A.pathOverviewLastBox; });   // §129.55 B — the rect _rowAdvance already reads, now also registered
      _rowAdvance(A.pathOverviewLastBox);
    }
    if (dayInfo && dayInfo.pos !== 'off' && A.dayCounterCompositeOntoCanvas) {
      // ROUND 13 item C — `a` passed as dayCounter's own `opacity` param (its `ctx.globalAlpha = op`
      // is an absolute assignment from that param, was clobbering the ambient hold-fade alpha).
      MQS._drawUnlessHold('daycounter', function (a) {
        A.dayCounterCompositeOntoCanvas(ctx, w, h, dayInfo, a, dayInfo.pos, _rowX);
      }, function () { return A.dayCounterLastBox; });   // §129.55 B
      _rowAdvance(A.dayCounterLastBox);
    }
    // §SUN_CLOCK — the analogue face for the hour this frame is lit at. It keeps the day counter's
    // corner (§CPE_HUD_STACK: one preference for the whole group, not a corner per overlay) and now
    // sits BESIDE the counter rather than under it. Wrapped in _drawUnlessHold like every other HUD
    // box, so the §129.1 load-path FREEZE clears it with the rest (red1: "Freeze removes all other
    // overlays including geo-ref"). `a` is the hold alpha, passed through as the compositor's own
    // opacity per ROUND 13 item C — a compositor that assigns globalAlpha absolutely would
    // otherwise clobber the ambient fade set by the wrapper.
    if (A._sunCompassOn && A.sunClockCompositeOntoCanvas && A.sunCompassInfo) {
      MQS._hudHold('suncompass.clock', function (a) {
        try {
          A.sunClockCompositeOntoCanvas(ctx, w, h, A.sunCompassInfo(), a, _rowPos, 0, _rowX);
        } catch (eClk) { if (!A._sunClockWarned) { A._sunClockWarned = true;
          console.warn('§SUN_CLOCK_DRAW failed: ' + (eClk && eClk.message)); } }
      }, function () { return A.sunClockLastBox; });   // §129.55 B
      _rowAdvance(A.sunClockLastBox);
    }
    // §SUN_COMPASS readout — date / sun angles / facade, next along the row (red1: "same line as
    // the Day counter? Clock, the azimuth thing, and the 4D day counter"). It was bottom-left and
    // was drawing underneath the loadpath session's own room box there.
    if (A._sunCompassOn && A.sunCompassCompositeOntoCanvas && A.sunCompassInfo) {
      MQS._hudHold('suncompass.readout', function (a) {
        try {
          A.sunCompassCompositeOntoCanvas(ctx, w, h, A.sunCompassInfo(), a, _rowPos, 0, _rowX);
        } catch (eSCd) { if (!A._sunCompassDrawWarned) { A._sunCompassDrawWarned = true;
          console.warn('§SUN_COMPASS_DRAW failed: ' + (eSCd && eSCd.message)); } }
      }, function () { return A.sunReadoutLastBox; });   // §129.55 B
      _rowAdvance(A.sunReadoutLastBox);
    }
    A._hudRowYield = false;   // W2 — the row ends here
    // Everything below the row — the pie panel, the storey card — starts under the TALLEST member,
    // not under a sum. An empty row (all four off) leaves _rowH at 0 and the column starts at the
    // margin exactly as it did before any of this existed.
    var _stackY = _rowH ? _rowH + _gapY : 0;
    // §129.52 — cleared each frame for the same reason the row boxes are: a panel that draws
    // nothing this frame must reserve nothing, and a stale rect would push the card below it down
    // past a panel that is not on screen.
    A.resourcePanelLastBox = null;
    A.bigStatsLastBox = null;
    // ══ §HUD_STACK_ORDER (2026-09-21) — THE FIXED-HEIGHT CARD GOES FIRST ════════════════════════
    // red1: "the 2nd HUD is obscured by the first. Since the 1st HUD is dynamic height depending on
    // Resource pax working on site, i suggest it be swapped with the 2nd HUD so it does not cover
    // when taller in height."
    // He is right, and for a reason the old order could not fix by measuring harder: the resource
    // panel's height is a function of the CREW ON SITE that day, so it changes frame to frame. Put
    // it first and every frame has to get the advance exactly right or it covers its neighbour; put
    // it LAST and it grows into empty space, where being wrong costs nothing. A variable-height
    // panel should never have a neighbour below it.
    // §129.52's advance stays — it is still needed, it is just no longer load-bearing.
    //
    // ⚠ NO boxFn IS PASSED HERE, AND THAT IS DELIBERATE. `_drawUnlessHold(name, fn, boxFn)` can
    // register a real rect, but these two drawers already register their own under `resource-panel`
    // and `stats-panel` — witness_hud_layout_coverage.js:124 exempts `hud.pie`/`roster` for exactly
    // that reason, and says a second registration would be "the same rect twice — a permanent false
    // FAIL". I tried adding one and the witness's own comment is what caught it.
    if (statInfo && statInfo.shown && A.bigStatsCompositeOntoCanvas) {
      MQS._drawUnlessHold('roster', function (a) {
        // §CPE_PIE_HOLD — statInfo.held is the composition the pie holds beside the card.
        try { A.bigStatsCompositeOntoCanvas(ctx, w, h, statInfo.shown, a, statInfo.pos, _stackY, statInfo.held); }
        catch (eBs) {
          if (!A._bsDrawErrLogged) { A._bsDrawErrLogged = true;
            console.warn('§CPE_BIG_STATS_ERR draw: ' + eBs.message + ' — card skipped, frames continue'); }
        }
      });
    }
    // ABSOLUTE, not `+=`. MEASURED on the HHS clip after the first attempt: the panel's own box
    // came back at y=115 while the accumulator stood at 100 — a drawer may apply an offset of its
    // own inside its slot, and advancing by height alone silently loses it. The HHS re-bake then
    // still reported §HUD_OVERLAP_WORST resource-panel x hud.status 173x7px, exactly that 15 px
    // of lost offset. Taking the real box's bottom cannot drift, whatever a drawer does inside.
    if (A.bigStatsLastBox && A.bigStatsLastBox.h > 0) {
      _stackY = Math.max(_stackY, A.bigStatsLastBox.y + A.bigStatsLastBox.h + _gapY);
    }
    if (resInfo && resInfo.info && A.resourcePanelCompositeOntoCanvas) {
      A._resPanelFrames = (A._resPanelFrames || 0) + 1;   // W7: did a resource panel exist at all (pie/stats verdicts below)
      MQS._drawUnlessHold('hud.pie', function (a) {
        try { A.resourcePanelCompositeOntoCanvas(ctx, w, h, resInfo.info, a, resInfo.pos, _stackY); }
        catch (eRp) {
          if (!A._resDrawErrLogged) { A._resDrawErrLogged = true;
            console.warn('§CPE_RESOURCE_PANEL_ERR draw: ' + eRp.message + ' — panel skipped, frames continue'); }
        }
      });
    }
    if (A.resourcePanelLastBox && A.resourcePanelLastBox.h > 0) {
      _stackY = Math.max(_stackY, A.resourcePanelLastBox.y + A.resourcePanelLastBox.h + _gapY);
    }

    // ══ §HUD_COLUMN_FLOOR (2026-09-21) — THE STATUS BOX IS THE NEXT SLOT IN THIS COLUMN ═════════
    // red1: "the 2nd HUD is obscured by the first." It was, and the pair was not the one I first
    // swapped. MEASURED on the HHS 1080p bake: resource-panel 1501,259,389,456 spans y 259..715
    // against hud.status at its computed 1501,602,389,154 — 113 px of overlap, same x, same width.
    // TWO POSITIONING SYSTEMS SHARED ONE COLUMN. cpe_film_boxes.js stacks its own slots (hud ->
    // status) off the layout grid, while this file stacks the stats card and the resource panel off
    // `_stackY`, and neither knew the other existed. The panel's height is a function of the crew on
    // site that day, so it cannot be made safe by choosing a better constant — it has to push.
    // The draw MOVED here from ~line 1778 so `_stackY` is already past the card and the panel; the
    // box takes max(its own slot, the running stack) via the new `yFloor` argument. A film without a
    // panel is unchanged, because then _stackY never advances past the slot's own y.
    if (A.filmBoxesDrawStatus) {
      MQS._drawUnlessHold('hud.status', function () {
        try { A.filmBoxesDrawStatus(ctx, w, h, A.filmBoxesStatusRows(statusSrc), undefined, _stackY); }
        catch (eSB) { if (!A._statusBoxWarned) { A._statusBoxWarned = true; console.warn('§STATUS_BOX draw failed: ' + (eSB && eSB.message)); } }
      }, function () { return A.filmBoxesStatusLastBox; });   // §129.55 C
      if (A.filmBoxesStatusLastBox && A.filmBoxesStatusLastBox.h > 0) {
        _stackY = A.filmBoxesStatusLastBox.y + A.filmBoxesStatusLastBox.h + _gapY;
      }
    } else if (titleInfo && titleInfo.opacity > 0 && A.roomTitleCompositeOntoCanvas) {
      MQS._drawUnlessHold('roomtitle.fallback', function () { A.roomTitleCompositeOntoCanvas(ctx, w, h, titleInfo.name, titleInfo.opacity); });
    }
    if (escCardInfo && escCardInfo.shown && A.bigStatsCompositeOntoCanvas) {
      MQS._drawUnlessHold('escroute.card', function (a) {
        try { A.bigStatsCompositeOntoCanvas(ctx, w, h, escCardInfo.shown, a, escCardInfo.pos, 0, null); }
        catch (eEc) {
          if (!A._escCardDrawErrLogged) { A._escCardDrawErrLogged = true;
            console.warn('§ESCAPE_CARD_ERR draw: ' + eEc.message + ' — card skipped, frames continue'); }
        }
      }, function () { return A.bigStatsLastBox; });
    }
    // §129.55 D/E — `roster` deliberately keeps its 0,0,1,1 placeholder, for the SAME reason
    // `hud.pie` does: the card's real rect is already in the registry, registered by the drawer
    // itself as `stats-panel` (cpe_resource_panel.js, beside its own `_plate` call) so its held pie
    // can declare it as parent. Giving this wrapper a `boxFn` too would put the IDENTICAL rect in
    // the registry under a second name — a rect overlapping itself, a permanent false FAIL.
    // §HUD FIX — load path/ledger composite draw LAST, so the label ladder's own column-placement
    // can read every OTHER HUD rect (status box, resource panel, pie.cost/ledger, roster) already
    // registered this frame and avoid them (item 5's own "avoid every registered HUD rect").
    // ROUND 16 item 2 — `_inLoadPathComposite` is true for the WHOLE call: load path is the one
    // overlay that keeps drawing unwrapped through the hold BY DESIGN (never `_drawUnlessHold`), so
    // its own draws must never count toward `unwrappedDraws`.
    // §ALTC_PANELS — road data card (civil films only; draws nothing between its slots or when none were built). Through
    // _drawUnlessHold so it fades with a freeze and registers its rect; before the load path so the ladder avoids it.
    if (A.roadPanelsCompositeOntoCanvas && A._roadPanelTn != null) {
      MQS._drawUnlessHold('road.panels', function (a) {
        try { A.roadPanelsCompositeOntoCanvas(ctx, w, h, A._roadPanelTn, a); }
        catch (eRPC) { if (!A._roadPanelsWarned) { A._roadPanelsWarned = true; console.warn('§ROAD_PANELS_DRAW failed: ' + (eRPC && eRPC.message)); } }
      }, function () { return A.roadPanelsLastBox; });
    }
    if (A.loadPathCompositeOntoCanvas) {
      A._inLoadPathComposite = true;
      try { A.loadPathCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
      catch (eLPC) { if (!A._loadPathDrawWarned) { A._loadPathDrawWarned = true; console.warn('§LOADPATH_DRAW_ERR ' + (eLPC && eLPC.message)); } }
      A._inLoadPathComposite = false;
    }
    if (A.ledgerTickerCompositeOntoCanvas) {
      try { A.ledgerTickerCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
      catch (eLTC) { if (!A._ledgerTickerDrawWarned) { A._ledgerTickerDrawWarned = true; console.warn('§LEDGER_TICKER_DRAW_ERR ' + (eLTC && eLTC.message)); } }
    }
    // §129.6 items 4/8 — once per hold (the SAME mid-hold frame cpe_load_path.js's own
    // _visibleWitness/_framingWitness fire on, via A._loadPathMidHoldThisFrame), print §HUD_LAYOUT
    // and §LOADPATH_FOCUS from the registry every drawer above just finished populating THIS frame.
    // Finding 1 broadened fix (2026-09-16) — the ARM-frame §HUD_LAYOUT_ARM sample: fires once, on the
    // same frame cpe_load_path.js's own loadPathApplyVisual just armed the hold (A._loadPathHudAlpha
    // is still 1 there — the fade hasn't started — so the resource panel legitimately draws and
    // registers real pie.cost/pie.ledger/roster/pie.band rects THIS frame, unlike the mid-hold sample
    // below where §129.8 item 4b's FOCUS fade has taken it to nothing).
    if (A._loadPathArmFrameThisFrame) {
      A._loadPathArmFrameThisFrame = false;
      if (A._hudLayoutWitness) A._hudLayoutWitness(h, '§HUD_LAYOUT_ARM');
    }
    if (A._loadPathMidHoldThisFrame) {
      A._loadPathMidHoldThisFrame = false;
      if (A._hudLayoutWitness) A._hudLayoutWitness(h);   // ROUND 13 item D — h needed for the rowFontPx formula check
      if (A._hudLayoutFocusWitness) A._hudLayoutFocusWitness();
    }
    // ROUND 16 item 2 — uninstall the instrumentation for this frame (installed right after the
    // base scene render, above), regardless of whether the FOCUS witness actually fired this frame
    // (it only fires once per hold, at the mid-hold moment) — never leak the wrapper into the next
    // frame's ctx methods.
    if (_lpInstrumentedThisFrame) MQS._lpUninstallDrawInstrument();
    // §129.7 item 8c — §HUD_LAYOUT_STABLE sampling: EVERY frame, never gated on the load-path hold
    // (the resource panel is up through the whole buildup) — see _hudLayoutStableSampleImpl above.
    MQS._hudLayoutStableSampleImpl(h);
    // §129 FIX 6 (2026-09-17) — REAL root cause of the earlier "PRE_HUD" sample always reading
    // black/correct while the actual encoded frame still showed full HUD: that sample ran right
    // after the 3D scene composited, BEFORE any `_drawUnlessHold` HUD call below it in this SAME
    // function had run — it could never have caught a HUD clobber even in principle, only ever
    // proved the 3D scene layer. THIS sample runs here, at the true end of compositing, on the SAME
    // canvas `c` that `toBlob` is about to encode — the only point that can prove what the shipped
    // frame actually contains.
    // §129 FIX 8 (2026-09-17) — red1: "silhouette building openings and sky/ground seems to not
    // return" post-release. Extended this same true-end-of-compositing sample to ALSO fire for a
    // short window AFTER release (tracked via `A._loadPathRestoreCount`, incremented once at the
    // exact release frame), not just during the hold — the earlier version could only ever prove the
    // FADE-IN side, never whether the fade-OUT (release) genuinely completes. Also logs `A._sky`'s
    // own live `.visible` directly, since that's a binary hide/show this beat owns, separate from
    // the backdrop's own continuous opacity fade for ordinary materials.
    if (A._loadPathHoldFrameActive) {
      A._lp129PostReleaseFrameCount = null;   // still held — no post-release window open yet
    } else if (A._loadPathRestoreCount > 0) {
      A._lp129PostReleaseFrameCount = (A._lp129PostReleaseFrameCount == null) ? 0 : A._lp129PostReleaseFrameCount + 1;
    }
    if (A._loadPathHoldFrameActive || (A._lp129PostReleaseFrameCount != null && A._lp129PostReleaseFrameCount <= 15)) {
      try {
        var _pxPts2 = [[0.30, 0.55], [0.45, 0.65], [0.60, 0.45], [0.20, 0.75], [0.70, 0.70],
          [0.53, 0.87], [0.62, 0.92], [0.05, 0.42], [0.10, 0.50], [0.85, 0.60], [0.784, 0.77],
          [0.913, 0.031], [0.95, 0.08], [0.80, 0.15], [0.41, 0.21], [0.35, 0.12]];
        var _pxOut2 = [];
        for (var _pp2 = 0; _pp2 < _pxPts2.length; _pp2++) {
          var _px2 = Math.round(_pxPts2[_pp2][0] * w), _py2 = Math.round(_pxPts2[_pp2][1] * h);
          var _d2 = ctx.getImageData(_px2, _py2, 1, 1).data;
          _pxOut2.push(_px2 + ',' + _py2 + '=' + _d2[0] + ',' + _d2[1] + ',' + _d2[2]);
        }
        console.log('§LOADPATH_PIXEL_DIAG_FINAL hold=' + !!A._loadPathHoldFrameActive + ' postRelFrame=' + (A._lp129PostReleaseFrameCount == null ? 'n/a' : A._lp129PostReleaseFrameCount) +
          ' hudAlpha=' + (A._loadPathHudAlpha == null ? 'n/a' : A._loadPathHudAlpha.toFixed(3)) +
          ' skyVisible=' + (A._sky ? A._sky.visible : 'no-sky') + ' ' + _pxOut2.join(' '));
        // §129.12 — the pixel readback above proves the black patch persists post-release, but not
        // WHAT object is there (that's what `r71` left unresolved). Raycast the SAME points, at a
        // few frames spread across the post-release window (the camera has resumed moving by now,
        // unlike the frozen-arm-camera mid-hold raycast, so each of these is its own real sample,
        // not a repeat) — cheap, diagnostic-only, matches the proven mid-hold identification pattern.
        if (A._lp129PostReleaseFrameCount != null && A._loadPathDiagRaycast &&
            (A._lp129PostReleaseFrameCount === 1 || A._lp129PostReleaseFrameCount === 5 ||
             A._lp129PostReleaseFrameCount === 11)) {
          var _ndcPts2 = _pxPts2.map(function (fp) { return [fp[0] * 2 - 1, 1 - fp[1] * 2]; });
          A._loadPathDiagRaycast(_ndcPts2, 'postRelFrame=' + A._lp129PostReleaseFrameCount);
        }
      } catch (ePxD2) { console.warn('§LOADPATH_PIXEL_DIAG_FINAL_ERR ' + (ePxD2 && ePxD2.message)); }
    }
    // §ESCAPE_ROUTE_HUD_RESERVE — the column's real bottom THIS frame, stashed for the next
    // frame's plate placement. Measured here because this is the only place that knows it: the sun
    // clock and the compass readout return their own drawn heights and nothing else can predict
    // them. One frame stale by construction (placement runs just before this capture), which moves
    // a plate by whatever the column grew in 1/24 s — in practice zero, since these boxes are fixed
    // furniture. The first frame has no measurement and falls back to reserving the whole column.
    A._hudStackBottom = _stackY + (statInfo && statInfo.shown ? Math.round(h * 0.24) : 0);
    // §129.61 MERGE — their unconditional bigStats draw was DROPPED here, not kept: ours already
    // draws the same card through _drawUnlessHold('roster', ...) above, which is hold-aware and
    // registers `stats-panel` for §HUD_LAYOUT (§129.55). Keeping both would have composited the
    // card TWICE per frame. Their A._hudStackBottom stash just above IS kept — it is the new thing.
    // §FRAME_QA (§ALTS_ALL G6 / §BAKE_RELEASE_GATE, bim-compiler PHOTOREAL_STILL_RENDER.md "### ALTS-ALL BUILD"): the luma of the
    // EXACT canvas about to be encoded (scene + overlays), 64x36 box-downsampled — a black / white / NaN frame is visible in the log,
    // not only by eye. Logged by the capture loop beside §FRAME_HASH (same global index). ~1 ms per frame.
    // §FILM_BLANK_FRAME witness switch (&blankframe=F:K, test only): K captures starting at frame F come back all black, the way the
    // 2026-10-01 out-of-memory blank did. K=1 proves the retry recovers; K>=4 proves the last-good hold.
    if (window.__forceBlankLeft > 0) { window.__forceBlankLeft--; ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
    try { var _qc = A.__frameQaCv || (A.__frameQaCv = document.createElement('canvas')); _qc.width = 64; _qc.height = 36;
      var _qx = _qc.getContext('2d', { willReadFrequently: true }); _qx.drawImage(c, 0, 0, 64, 36); var _qd = _qx.getImageData(0, 0, 64, 36).data, _qs = 0, _qmn = 255, _qmx = 0, _qdk = 0, _qcl = 0;
      for (var _qi = 0; _qi < _qd.length; _qi += 4) { var _ql = 0.2126 * _qd[_qi] + 0.7152 * _qd[_qi + 1] + 0.0722 * _qd[_qi + 2]; _qs += _ql; if (_ql < _qmn) _qmn = _ql; if (_ql > _qmx) _qmx = _ql; if (_ql <= 15) _qdk++; if (_ql >= 250) _qcl++; }
      var _qn = _qd.length / 4; A._frameQa = { mean: _qs / _qn, min: _qmn, max: _qmx, dark: 100 * _qdk / _qn, clip: 100 * _qcl / _qn };
    } catch (eQa) { A._frameQa = { err: eQa.message }; }
    return _capEncode(c, null);
  }

  // §MAXQ_MP4 — mp4/H.264 stitch (preferred path). Spec: PHOTOREAL_STILL_RENDER.md §MAXQ_MP4 SPEC.
  // WHY: the webm/VP9 the MediaRecorder path produces does not play on iPhone or in WhatsApp, which
  // is the entire distribution channel this movie exists for. mp4/H.264 plays everywhere.
  // Returns true if an mp4 was produced and downloaded; false = caller must run the webm fallback.
  // Every failure mode is a clean `return false` with a §MAXQ_MP4_FALLBACK reason — never a throw,
  // because losing a finished bake to a muxing bug would be far worse than shipping webm.
  var MP4_CODECS = [
    'avc1.640034',  // High 5.2 — headroom for large canvases
    'avc1.4d0034',  // Main 5.2
    'avc1.42003c',  // Baseline 6.0 (widest device compatibility, if the encoder takes the level)
    'avc1.640028',  // High 4.0
    'avc1.42001f'   // Baseline 3.1 — the universally-supported floor
  ];
  // ══ §MAXQ_FRAME_DECODE — NAME THE BAD FRAME, AND NEVER LOSE THE RENDER OVER ONE ═════════════
  // A full 1920x1080 HHS bake rendered all 3,275 frames, every one converged, and then delivered
  // ZERO BYTES: `§MAXQ_MP4_FALLBACK reason=The source image could not be decoded.` then
  // `§MAXQ_FAIL The source image could not be decoded.` then `deliveredBytes:0`. 38 minutes gone.
  //
  // Both stitchers read the same per-run IndexedDB store and both call createImageBitmap on what
  // comes back, so the defect is in a STORED FRAME, not in either encoder — mp4 and webm failed
  // identically, 12 s apart. Neither call site logged WHICH frame, its size or its type, so a very
  // verbose log could not say which of 3,275 blobs was bad. That is what this fixes first.
  //
  // AND IT DEGRADES INSTEAD OF THROWING. _stitchMp4's own try/catch turned a decode error into a
  // clean `return false`; _stitch had none, so the same error propagated and threw away a finished
  // render. One unreadable frame out of thousands should cost one frame, not the film: the previous
  // good bitmap is reused for that slot and the substitution is logged. A run that loses MANY is a
  // different failure and says so through the count rather than quietly shipping a stutter.
  // ⚠ The stand-in is the last good BLOB, re-decoded — never the last bitmap. Both loops call
  // bmp.close() after drawing (:2240, :2326), so handing back a previous ImageBitmap would hand
  // back a CLOSED one. Re-decoding costs one createImageBitmap on a frame that is already failing.
  var _decodeFails = 0, _decodeFailFirst = null, _lastGoodBlob = null, _lastGoodBlob2 = null;
  async function _frameBitmap(db, i, prevBlob) {
    var blob = null;
    try { blob = await MQS._idbGet(db, i); } catch (eG) { blob = null; }
    try {
      if (!blob) throw new Error('no blob in the frame store');
      return { bmp: await createImageBitmap(blob), blob: blob, reused: false };
    } catch (e) {
      _decodeFails++;
      if (_decodeFailFirst == null) _decodeFailFirst = i;
      console.log('§MAXQ_FRAME_DECODE_FAIL i=' + i + ' size=' + (blob ? blob.size : 'n/a') +
        ' type=' + (blob ? (blob.type || '?') : 'n/a') + ' reason=' + (e && e.message ? e.message : String(e)) +
        ' — standing in the previous frame for this slot; the render is NOT thrown away. fails=' + _decodeFails);
      if (prevBlob) {
        try { return { bmp: await createImageBitmap(prevBlob), blob: prevBlob, reused: true }; }
        catch (e2) { console.log('§MAXQ_FRAME_DECODE_FAIL i=' + i + ' the stand-in failed too: ' + e2.message); }
      }
      return { bmp: null, blob: null, reused: true };
    }
  }

  async function _stitchMp4(db, framesDone, fps, w, h) {
    var A = window.APP;
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      console.log('§MAXQ_MP4_FALLBACK reason=no-webcodecs (VideoEncoder/VideoFrame unavailable)');
      return false;
    }
    if (!window.MP4Mux || typeof window.MP4Mux.mux !== 'function') {
      console.log('§MAXQ_MP4_FALLBACK reason=no-muxer (lib/mp4_mux.js not loaded — stale precache?)');
      return false;
    }
    // H.264 requires even dimensions; the renderer really does hand us odd sizes (1854x963 seen live).
    var ew = w & ~1, eh = h & ~1;
    // Photoreal architectural footage — generous bitrate, this is a deliverable not a stream.
    var bitrate = Math.min(50e6, Math.max(2e6, Math.round(ew * eh * fps * 0.2)));
    var enc = null, chosen = null, avcC = null, chunks = [], encErr = null;
    var t0 = performance.now();
    try {
      for (var ci = 0; ci < MP4_CODECS.length; ci++) {
        var codec = MP4_CODECS[ci];
        var cfg = { codec: codec, width: ew, height: eh, bitrate: bitrate, framerate: fps,
                    avc: { format: 'avc' }, latencyMode: 'quality' };
        var sup = false;
        try { sup = (await VideoEncoder.isConfigSupported(cfg)).supported; } catch (e) { sup = false; }
        console.log('§MAXQ_MP4 probe codec=' + codec + ' supported=' + sup);
        if (!sup) continue;
        // Mozilla bug 1918769: isConfigSupported can answer true and configure() then throws.
        // Only a real configure() proves the codec — never trust the capability query alone.
        try {
          enc = new VideoEncoder({
            output: function(chunk, md) {
              if (md && md.decoderConfig && md.decoderConfig.description && !avcC) {
                var d = md.decoderConfig.description;
                avcC = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
              }
              var buf = new Uint8Array(chunk.byteLength);
              chunk.copyTo(buf);
              // cts = presentation timestamp; chunks arrive in DECODE order, so the muxer needs
              // this to emit a ctts box when the encoder reorders (Firefox uses B-frames).
              chunks.push({ data: buf, key: chunk.type === 'key', cts: chunk.timestamp });
            },
            error: function(e) { encErr = e.message || String(e); }
          });
          enc.configure(cfg);
          chosen = codec;
          break;
        } catch (e2) {
          console.log('§MAXQ_MP4 probe codec=' + codec + ' configure-threw=' + e2.name + ':' + e2.message);
          try { if (enc) enc.close(); } catch (e3) {}
          enc = null;
        }
      }
      if (!enc) { console.log('§MAXQ_MP4_FALLBACK reason=no-usable-h264-codec'); return false; }
      console.log('§MAXQ_MP4 configured codec=' + chosen + ' size=' + ew + 'x' + eh +
        ' bitrate=' + bitrate + ' fps=' + fps + ' frames=' + framesDone);
      MQS._status('🎬 MaxQ encoding mp4/H.264 (' + framesDone + ' frames)…');

      var usPerFrame = 1e6 / fps, gop = Math.max(1, Math.round(fps * 2));
      for (var i = 0; i < framesDone; i++) {
        // §129 FIX 7 (2026-09-17) — every prior stage (live capture-time readback, IDB storage,
        // THIS SAME stitch loop's own readback right after createImageBitmap) proved the correct,
        // per-frame-distinct pixel data reaches this point — yet the final decoded MP4 still showed
        // stale/wrong content on frames well past the first. A FRESH canvas per iteration (was one
        // canvas object REUSED across all `framesDone` VideoFrame constructions) rules out a known
        // class of WebCodecs/hardware-encoder issue where reusing the same canvas/GPU-texture source
        // object across encode() calls can let the encoder treat it as "unchanged" and skip a real
        // texture re-upload — cheap insurance, no logic changed, only the object identity per frame.
        var cv = document.createElement('canvas');
        cv.width = ew; cv.height = eh;
        var cx = cv.getContext('2d');
        var _fb = await _frameBitmap(db, i, _lastGoodBlob);
        if (!_fb.bmp) throw new Error('frame ' + i + ' could not be decoded and there is no previous frame to stand in');
        var bmp = _fb.bmp;
        if (!_fb.reused) _lastGoodBlob = _fb.blob;
        cx.drawImage(bmp, 0, 0);
        bmp.close();
        // §129 FIX 7 (2026-09-17) — isolating whether the discrepancy (encoded output still showing
        // full HUD on frames the live capture-time diagnostic confirmed suppressed) is a CAPTURE bug
        // or a STITCH/encode bug: read back the SAME diagnostic pixel from what was ACTUALLY PULLED
        // OUT OF IDB right here, at the exact point it gets handed to the encoder — the one spot nol
        // further transform (beyond H.264 encoding itself) can explain a difference from this point on.
        if (i >= 20 && i <= 82 && window.__lpDebugStitchPixels) {
          try {
            var _sd = cx.getImageData(Math.round(0.784 * ew), Math.round(0.77 * eh), 1, 1).data;
            console.log('§STITCH_PIXEL_DIAG i=' + i + ' 784x770frac=' + _sd[0] + ',' + _sd[1] + ',' + _sd[2]);
          } catch (eSD) {}
        }
        var vf = new VideoFrame(cv, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
        enc.encode(vf, { keyFrame: (i % gop) === 0 });
        vf.close();
        // Backpressure — the encoder is the slow end here, not IDB.
        while (enc.encodeQueueSize > 8) await MQS._sleep(5);
        if (encErr) throw new Error('encoder-error: ' + encErr);
      }
      await enc.flush();
      try { enc.close(); } catch (e4) {}
      enc = null;
      if (encErr) throw new Error('encoder-error: ' + encErr);
      if (!chunks.length) { console.log('§MAXQ_MP4_FALLBACK reason=zero-chunks'); return false; }
      if (!avcC) { console.log('§MAXQ_MP4_FALLBACK reason=no-avcC-description'); return false; }
      var encMs = Math.round(performance.now() - t0);
      var totalBytes = 0;
      for (var k = 0; k < chunks.length; k++) totalBytes += chunks[k].data.length;
      console.log('§MAXQ_MP4 encoded chunks=' + chunks.length + ' bytes=' + totalBytes +
        ' avcCBytes=' + avcC.length + ' ms=' + encMs +
        ' (no real-time replay — ' + (framesDone / fps).toFixed(1) + 's of footage)');

      var mp4 = window.MP4Mux.mux({ width: ew, height: eh, fps: fps, avcC: avcC, samples: chunks });
      var blob = new Blob([mp4], { type: 'video/mp4' });
      var _dlName = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.mp4';
      // §CLI_SILENT_BAKE item 3 — the a.click() below is INERT headless. When a scripted runner
      // installed __maxqDeliverBlob, hand it the finished bytes so node writes + asserts the file.
      if (typeof window.__maxqDeliverBlob === 'function') {
        try {
          await window.__maxqDeliverBlob(blob, _dlName, 'video/mp4');
          window.__maxqDeliveredBytes = blob.size;
          console.log('§MAXQ_DELIVERED bytes=' + blob.size + ' name=' + _dlName);
        } catch (eDl) { console.warn('§MAXQ_DELIVER_FAIL ' + eDl.message); }
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = _dlName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      }
      console.log('§MAXQ_DONE frames=' + framesDone + ' bytes=' + blob.size + ' type=video/mp4 codec=' + chosen);
      MQS._status('🎬 MaxQ mp4 saved (' + (blob.size / 1e6).toFixed(1) + ' MB) — plays on iPhone/WhatsApp');
      return true;
    } catch (e) {
      console.log('§MAXQ_MP4_FALLBACK reason=' + (e && e.message ? e.message : String(e)));
      try { if (enc && enc.state !== 'closed') enc.close(); } catch (e5) {}
      return false;
    }
  }

  // §MAXQ_STITCH_GUARD (2026-09-21) — the webm fallback is the LAST chance a finished render has.
  // _stitchMp4 wraps its whole body and degrades to `return false`; this one had no try/catch at
  // all, so the same decode error propagated to the outer handler, printed §MAXQ_FAIL, and threw
  // away a completed 3,275-frame, 38-minute HHS render with deliveredBytes:0. A fallback that can
  // itself throw is not a fallback. Whatever it hits now, it says so and returns instead of taking
  // the render with it — and _frameBitmap above already keeps a single bad frame from getting here.
  async function _stitch(db, framesDone, fps, w, h) {
    try { return await _stitchInner(db, framesDone, fps, w, h); }
    catch (eSt) {
      console.log('§MAXQ_STITCH_FAILED reason=' + (eSt && eSt.message ? eSt.message : String(eSt)) +
        ' decodeFails=' + _decodeFails + (_decodeFailFirst != null ? ' firstBadFrame=' + _decodeFailFirst : '') +
        ' — the webm fallback threw; the render is lost, and THIS line is what names why');
      return false;
    }
  }
  async function _stitchInner(db, framesDone, fps, w, h) {
    var A = window.APP;
    console.log('§MAXQ_STITCH frames=' + framesDone + ' fps=' + fps);
    MQS._status('🎬 MaxQ stitching ' + framesDone + ' frames (' + Math.round(framesDone / fps) + 's realtime)…');
    var proxy = document.createElement('canvas');
    proxy.width = w; proxy.height = h;
    var ctx = proxy.getContext('2d');
    var stream = proxy.captureStream(fps);
    var mime = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
      ? 'video/webm;codecs=vp9' : 'video/webm';
    var rec = new MediaRecorder(stream, { mimeType: mime });
    var chunks = [];
    rec.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    var stopped = new Promise(function(res) { rec.onstop = res; });
    var bmp0 = await createImageBitmap(await MQS._idbGet(db, 0));
    ctx.drawImage(bmp0, 0, 0); bmp0.close();
    rec.start();
    var interval = 1000 / fps;
    for (var i = 1; i < framesDone; i++) {
      var t = performance.now();
      var _fb2 = await _frameBitmap(db, i, _lastGoodBlob2);
      if (!_fb2.bmp) { console.log('§MAXQ_FRAME_DECODE_SKIP i=' + i + ' — no previous frame to stand in, slot dropped'); continue; }
      var bmp = _fb2.bmp;
      if (!_fb2.reused) _lastGoodBlob2 = _fb2.blob;
      var wait = interval - (performance.now() - t);
      if (wait > 0) await MQS._sleep(wait);
      ctx.drawImage(bmp, 0, 0); bmp.close();
    }
    await MQS._sleep(interval);
    rec.stop();
    await stopped;
    var blob = new Blob(chunks, { type: mime });
    var _dlName = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
    // §CLI_SILENT_BAKE item 3 — same delivery seam as _stitchMp4: the fallback container must be
    // capturable headlessly too (§MAXQ_MP4_FALLBACK is expected there, not a blocker).
    if (typeof window.__maxqDeliverBlob === 'function') {
      try {
        await window.__maxqDeliverBlob(blob, _dlName, mime);
        window.__maxqDeliveredBytes = blob.size;
        console.log('§MAXQ_DELIVERED bytes=' + blob.size + ' name=' + _dlName);
      } catch (eDl2) { console.warn('§MAXQ_DELIVER_FAIL ' + eDl2.message); }
    } else {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = _dlName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
    }
    console.log('§MAXQ_DONE frames=' + framesDone + ' bytes=' + blob.size + ' type=' + mime);
    MQS._status('🎬 MaxQ movie saved (' + (blob.size / 1e6).toFixed(1) + ' MB)');
  }
};
