// §MAXQ — Max-Quality Orbiter export (Alt+M).
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ SPEC (2026-07-19).
// Ports the proven offline PoC loop in-app: each frame is a COMPLETE Alt+S fold (photoshoot
// staging + 16-sample TAA + full §PHOTO_AO converge) captured to a per-feature IDB store, then
// replay-recorded onto a proxy canvas at MAXQ_FPS (MediaRecorder in its real-time happy path —
// the same recorder pattern Cinema Orbit ships with, NOT the frame-starved capture that sank the
// retired TM exporter). Single tab = serial: ~1.3s/frame → 360 frames ≈ 8 min cook + 24s stitch.
(function() {
  'use strict';
  // §MAXQ_LOADED: version fingerprint FIRST — a pasted console log must answer "which build is
  // this?" on its own (user feedback 2026-07-19: "u got to make the logs tell u"). Bump MAXQ_V
  // on every behavior change to this module.
  // ══ §CPE_GHOST_GROUND (CINEMA_PATH_EDITOR.md) — a buildup film opens on SUBSTRUCTURE, and
  // substructure sits BELOW the ground plane (§GROUND_Y, the L1 slab datum). Measured on the user's
  // own Hospital bake: `placed=210/63421` at frame 120, every one of those 210 under an opaque paved
  // plane with 4,043 shadow casters on it. The opening was not empty — it was OCCLUDED, and no
  // camera or gaze change could have revealed it.
  //
  // While the buildup has placed nothing at or above the ground datum the plane renders at GHOST
  // opacity — the pile caps and ground beams read through it like a survey drawing. When the first
  // at-or-above-ground element lands (the L1 slab itself qualifies — user: "until its above slabs
  // appears") the plane eases back to fully opaque and STAYS there.
  //
  // The fade is a smoothstep over FILM time, not a cut (user: "it be cool when they return back to
  // opaque gradually rather than right away") and not wall time — expressed as a film FRACTION so
  // the 10 s rehearsal and the 148 s bake show the identical curve.
  //
  // Deliberately NOT "switch the ground off", which the user floated first and flagged the risk of
  // themselves: that takes §PHOTO_SHADOW's casters and the sense of a site with it, and the
  // foundation floats in blackness.
  var GHOST_OPACITY = 0.22;      // survey-drawing translucency; low enough to read what is under it
  var GHOST_FADE_SEC = 3.0;      // seconds of FILM time the return to opaque is eased over
  var _ggT = null, _ggSaved = null;

  // Called ONCE per preview/bake, after the buildup timeline is in force. Returns true when armed.
  function _ghostGroundArm(bkState) {
    var A = window.APP;
    _ggT = null;
    if (!A || !A.ground || !A.ground.material || !A.ground.visible) return false;
    if (!bkState || typeof window.tmFirstAboveGroundMs !== 'function') return false;
    var z = A.groundIfcZ;
    if (!isFinite(z)) { console.log('§GHOST_GROUND skip reason=no groundIfcZ (tools.js §GROUND_Y never ran)'); return false; }
    var span = bkState.projectEnd - bkState.projectStart;
    if (!(span > 0)) return false;
    var ms = window.tmFirstAboveGroundMs(z);
    if (ms == null) { console.log('§GHOST_GROUND skip reason=nothing is ever placed at or above the ground datum'); return false; }
    var t = (ms - bkState.projectStart) / span;
    // A trigger at or before t=0 means the film never opens underground — ghosting would be a lie
    // about this building, so it stays off rather than ghosting a frame or two for symmetry.
    if (!(t > 0)) { console.log('§GHOST_GROUND skip reason=first above-ground element is placed at t=' + t.toFixed(3) + ' (film never opens below ground)'); return false; }
    var m = A.ground.material;
    _ggSaved = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
    _ggT = t;
    console.log('§GHOST_GROUND armed triggerT=' + t.toFixed(4) + ' ghost=' + GHOST_OPACITY +
      ' fadeSec=' + GHOST_FADE_SEC + ' — ground is see-through until the first at-or-above-ground element');
    return true;
  }

  // Per frame. `tFilm` is the film fraction the BUILDUP is at (the same number that drives the
  // cursor), `totalSec` the film's own length. Returns the opacity applied, or null when not armed.
  function _ghostGroundAt(tFilm, totalSec) {
    var A = window.APP;
    if (_ggT == null || !A || !A.ground || !A.ground.material) return null;
    var fadeFrac = (totalSec > 0) ? Math.min(0.5, GHOST_FADE_SEC / totalSec) : 0.05;
    var u = (tFilm - _ggT) / Math.max(1e-6, fadeFrac), o;
    if (u <= 0) o = GHOST_OPACITY;
    else if (u >= 1) o = 1;
    else o = GHOST_OPACITY + (1 - GHOST_OPACITY) * (u * u * (3 - 2 * u));   // smoothstep, no cut
    var m = A.ground.material, solid = o > 0.999;
    m.opacity = o;
    m.transparent = !solid;
    // A translucent floor that writes depth can occlude other transparent geometry drawn after it;
    // the opaque substructure is already in the depth buffer either way, so this only affects the
    // transparent pass. Restored with everything else.
    m.depthWrite = solid;
    return o;
  }

  // MUST run on every exit path. The ground material is shared with normal viewing — a bake that
  // leaves it at 0.22 ghosts the ground for the rest of the session.
  function _ghostGroundRestore() {
    var A = window.APP;
    if (_ggSaved && A && A.ground && A.ground.material) {
      var m = A.ground.material;
      m.transparent = _ggSaved.transparent; m.opacity = _ggSaved.opacity; m.depthWrite = _ggSaved.depthWrite;
      console.log('§GHOST_GROUND restored opacity=' + m.opacity + ' transparent=' + m.transparent);
    }
    _ggSaved = null; _ggT = null;
  }

  var MAXQ_V = 'v18 (§CPE_GHOST_GROUND the ground goes see-through while the buildup is entirely below it, then eases back to opaque; §CPE_BUILDUP_FOLLOW_TM — the buildup PLAYS the Time Machine timeline, it does not author one; §CPE_PREVIEW_AFTER_RETIRED — OK records, no rehearsal either side of the editor; §CPE_PREVIEW_REDUNDANT pre-editor rehearsal removed; §CPE_CLIP in/out window remaps poseAt + scales frames; §MAXQ_HIDDEN_PAUSE — a hidden tab parks the bake instead of ruining it; §MAXQ_QUALITY health line)';
  console.log('§MAXQ_LOADED ' + MAXQ_V);
  var MAXQ_N_FRAMES = 360, MAXQ_FPS = 15;  // 24s clip (360/15) — opts-overridable
  var SETTLE_MS = 250;   // teardown→restage settle. Flicker fix, PoC-proven: without it the next
                         // staging captures mid-restore sun-tint/exposure values as "original"
                         // and the whole building oscillates color frame-to-frame.
  var IDB_NAME = 'bim_ootb_cinema_maxq', IDB_STORE = 'frames';
  var _active = false, _cancel = false;
  // §MAXQ_WAKELOCK (user 2026-07-19: left the machine, bake paused until they came back — the
  // screen slept and rAF throttled with it). Hold a screen wake lock for the duration of the
  // bake+stitch so an unattended machine keeps rendering; re-acquire on visibilitychange (the
  // browser auto-releases the lock when the tab hides). Best-effort — browsers without the API
  // just log unavailable, and the standing rule stays: keep the tab VISIBLE (rAF throttles in
  // hidden tabs regardless of any lock; frames are never lost, the bake just waits).
  var _wakeLock = null, _wakeWired = false;
  async function _wakeAcquire() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        _wakeLock = await navigator.wakeLock.request('screen');
        console.log('§MAXQ_WAKELOCK acquired (screen stays awake for the bake)');
        if (!_wakeWired) {
          _wakeWired = true;
          document.addEventListener('visibilitychange', function() {
            if (_active && document.visibilityState === 'visible' && (!_wakeLock || _wakeLock.released)) _wakeAcquire();
          });
        }
      } else {
        console.log('§MAXQ_WAKELOCK unavailable — keep the tab visible and screen awake manually');
      }
    } catch (e) { console.log('§MAXQ_WAKELOCK denied: ' + e.message); }
  }
  function _wakeRelease() {
    try { if (_wakeLock && !_wakeLock.released) _wakeLock.release(); } catch (e) {}
    _wakeLock = null;
  }

  // §MAXQ_HIDDEN_PAUSE — THE chokepoint, found by probing the browser rather than reasoning about
  // it. requestAnimationFrame does not merely slow down in a hidden tab, it STOPS: a probe counted
  // rAF ticks frozen at exactly 167 for a full 6s of hiding, resuming only on reveal. So every
  // `await _raf2()` in the bake blocks indefinitely while hidden — the loop parks HERE, before any
  // frame-boundary or fold-timeout check can run, which is why the first cut of this fix logged
  // hiddenPauses=0 after being hidden for 20 real seconds. Waiting for visibility FIRST is what
  // makes the pause observable; the rAF-vs-timeout race then covers the case where the tab hides
  // between the check and the callback, so a lost frame cannot wedge a multi-minute bake.
  function _raf2(why) {
    return (async function() {
      for (;;) {
        if (_isHidden()) await _awaitVisible(why || 'render tick');
        var got = await new Promise(function(r) {
          var settled = false;
          var fin = function(v) { if (!settled) { settled = true; r(v); } };
          requestAnimationFrame(function() { requestAnimationFrame(function() { fin(true); }); });
          setTimeout(function() { fin(false); }, 1500);
        });
        if (got) return;
      }
    })();
  }
  function _sleep(ms) { return new Promise(function(res) { setTimeout(res, ms); }); }
  function _status(t) { var A = window.APP; if (A && A.status) A.status.textContent = t; }

  // §CINEMA_DAMPING_BLEED (2026-07-26 — PHOTOREAL_STILL_RENDER.md §CINEMA_DAMPING_BLEED).
  // Both authored loops below (the 10s path preview AND the frame bake) do
  // camera.position.set(pose) → controls.update(). OrbitControls.update() recomputes the position
  // from its own spherical state with the dampened deltas applied, OVERWRITING the authored pose.
  // With scene.js's dampingFactor=0.08 the residual from whatever the user did right before Alt+C
  // bleeds in at 1.637% of the look distance on frame 0, decaying by exactly 1-dampingFactor per
  // frame — the reported "slight twitch at the first second of the movie". Damping is an
  // interaction affordance; an authored camera must not be subject to it. Paired with
  // _wakeAcquire/_wakeRelease so every exit path that releases the wake lock releases this too.
  var _dampSaved = null;
  function _dampHold() {
    var A = window.APP;
    if (!A || !A.controls || _dampSaved !== null) return;
    _dampSaved = A.controls.enableDamping;
    A.controls.enableDamping = false;
    A.controls.update();   // flush the residual BEFORE the first authored pose
    console.log('§CINEMA_DAMPING_BLEED held (enableDamping ' + _dampSaved + ' -> false for preview+bake)');
  }
  function _dampRelease() {
    var A = window.APP;
    if (_dampSaved === null) return;
    if (A && A.controls) A.controls.enableDamping = _dampSaved;
    console.log('§CINEMA_DAMPING_BLEED released (enableDamping restored to ' + _dampSaved + ')');
    _dampSaved = null;
  }

  // §MAXQ_IDB — open must NEVER hang silently. An earlier run that exited abnormally (or a second
  // app tab still holding a connection) leaves _idbDestroy's deleteDatabase() pending-blocked, and
  // every later open() then queues behind it FOREVER with no event, no error, no log — the exact
  // "stuck right after §MAXQ_PREVIEW done, zero further lines" report (LTU, v810/MAXQ v7).
  // Three guards: track+close our own connection, purge any pending delete BEFORE opening, and
  // race the whole thing against a timeout so a block surfaces as a clean §MAXQ_FAIL abort.
  var IDB_OPEN_TIMEOUT_MS = 5000;
  var _db = null;
  function _idbDelete() {
    return new Promise(function(res) {
      var rq;
      try { rq = indexedDB.deleteDatabase(IDB_NAME); } catch (e) { return res(false); }
      rq.onsuccess = function() { res(true); };
      rq.onerror = function() { res(false); };
      rq.onblocked = function() {
        console.warn('§MAXQ_IDB_BLOCKED delete blocked — another tab holds ' + IDB_NAME + ' open');
        res(false);
      };
      setTimeout(function() { res(false); }, IDB_OPEN_TIMEOUT_MS);
    });
  }
  function _idbOpen() {
    return new Promise(function(res, rej) {
      var settled = false;
      var timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        rej(new Error('idb-open-timeout'));
      }, IDB_OPEN_TIMEOUT_MS);
      var done = function(fn, arg) {
        if (settled) { try { if (arg && arg.close) arg.close(); } catch (e) {} return; }
        settled = true; clearTimeout(timer); fn(arg);
      };
      var rq;
      try { rq = indexedDB.open(IDB_NAME, 1); } catch (e) { return done(rej, e); }
      rq.onupgradeneeded = function() { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function() {
        var db = rq.result;
        // A later version-change request (another tab, or our own next-run delete) must not find
        // this connection still open — close on demand instead of becoming the zombie blocker.
        db.onversionchange = function() { try { db.close(); } catch (e) {} if (_db === db) _db = null; };
        done(res, db);
      };
      rq.onerror = function() { done(rej, rq.error || new Error('idb-open-error')); };
      rq.onblocked = function() {
        console.warn('§MAXQ_IDB_BLOCKED open blocked behind a pending delete of ' + IDB_NAME);
      };
    });
  }
  function _idbPut(db, k, v) {
    return new Promise(function(res, rej) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(v, k);
      tx.oncomplete = res; tx.onerror = function() { rej(tx.error); };
    });
  }
  function _idbGet(db, k) {
    return new Promise(function(res, rej) {
      var rq = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(k);
      rq.onsuccess = function() { res(rq.result); };
      rq.onerror = function() { rej(rq.error); };
    });
  }
  function _idbDestroy(db) {
    try { if (db) db.close(); } catch (e) {}
    if (_db === db) _db = null;
    return _idbDelete();
  }

  // Deterministic staging randomness for the duration of each trigger — identical PRNG sequence
  // every frame → zero paint/puddle/skyline-sparkle flicker (staffage is NOT re-placed here; the
  // user's pre-placed Alt+P layout is ordinary scene state and stays fixed on its own).
  var _seed = 0;
  function _freezeRandom() {
    if (!window.__maxqOrigRandom) window.__maxqOrigRandom = Math.random;
    _seed = 987654321;
    Math.random = function() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
  }
  function _restoreRandom() { if (window.__maxqOrigRandom) Math.random = window.__maxqOrigRandom; }

  // ══ §MAXQ_HIDDEN_PAUSE (PHOTOREAL_STILL_RENDER.md §MAXQ_HIDDEN_PAUSE, 2026-07-27).
  //
  // A backgrounded tab does not merely slow the bake down — it RUINS it, silently. Chrome throttles
  // rAF to a near-stop when hidden, so the per-frame TAA fold + §PHOTO_AO never converge,
  // _waitFoldDone's wall-clock timeout expires, and §MAXQ_FRAME_TIMEOUT saves a frame that never
  // finished. Consecutive such captures come out near-duplicates, so the delivered MP4 ends in a
  // stretch of visually dead video. It does not throw, it does not stop, and the file plays fine:
  // the user lost a 45s Hospital film to this and only knew because they remembered the tab was
  // unfocused — a measurement pass looking for defects had already mis-attributed it to pacing.
  //
  // NOT re-plumbed onto timers, and the reason is physical rather than stylistic: a hidden tab does
  // not reliably composite WebGL at all, so a timer-driven fold would accumulate nothing either. It
  // would fail identically while looking fixed. A converged frame cannot be rendered in a
  // backgrounded tab, so the only honest behaviour is to refuse to pretend.
  var _hiddenMsTotal = 0, _hiddenPauses = 0, _unconverged = 0;
  function _isHidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
  // Resolves as soon as the tab is visible. `why` is logged so a pasted console shows WHERE the bake
  // was parked, not merely that it was slow.
  function _awaitVisible(why) {
    if (!_isHidden()) return Promise.resolve(0);
    return new Promise(function(res) {
      var t0 = performance.now();
      _hiddenPauses++;
      console.log('§MAXQ_HIDDEN_PAUSE at ' + why + ' — tab is hidden; the bake is PARKED, not ' +
        'degrading. A hidden tab cannot converge a frame, so advancing here would save unconverged ' +
        'frames and silently ruin the film. Bring the tab back to resume.');
      _status('⏸ Paused — bring this tab back to the front to continue the bake');
      // Two things can notice the reveal — the visibilitychange listener and the poll below — and
      // without this guard BOTH run, so the hidden time is added twice. Measured: one 20516ms pause
      // reported totalHiddenMs=40908. A health line that overstates is as useless as one that lies.
      var settled = false;
      var done = function() {
        if (_isHidden() || settled) return;
        settled = true;
        document.removeEventListener('visibilitychange', done);
        var ms = performance.now() - t0;
        _hiddenMsTotal += ms;
        console.log('§MAXQ_HIDDEN_RESUME at ' + why + ' hiddenMs=' + Math.round(ms) +
          ' totalHiddenMs=' + Math.round(_hiddenMsTotal) + ' pauses=' + _hiddenPauses);
        res(ms);
      };
      document.addEventListener('visibilitychange', done);
      // Belt and braces: visibilitychange is the signal, but a poll means a missed event cannot
      // wedge a multi-minute bake forever.
      (function poll() { if (_isHidden()) return setTimeout(poll, 250); done(); })();
    });
  }
  // The fold's budget must be measured in VISIBLE time, AND the wait must itself park when the tab
  // goes hidden. Parking only at the frame boundary is not enough and the witness proved it: a
  // 20s hide landed entirely inside ONE frame's cook (swiftshader frames are slow), so the loop
  // never reached the boundary check, nothing was logged, and the run reported hiddenPauses=0 while
  // having been hidden for 20 seconds. A pause that does not announce itself is the same silent
  // failure this whole section exists to kill — so the wait reports through the same bookkeeping.
  async function _waitFoldDone(timeoutMs, why) {
    var A = window.APP;
    var spentVisible = 0, last = performance.now();
    for (;;) {
      if (_isHidden()) { await _awaitVisible(why); last = performance.now(); }
      if (!A._stillRefineBusy) return true;
      if (spentVisible > timeoutMs) return false;
      await _sleep(100);
      var now = performance.now();
      spentVisible += now - last;
      last = now;
    }
  }

  // One explicit composer render, then SAME-TASK drawImage into a 2D canvas (clash_snag.js's
  // proven capture pattern — the WebGL buffer is only guaranteed valid within the task that drew it).
  // §CPE_ROOM_TITLE: titleInfo ({name, opacity}, or null/opacity<=0) is composited onto THIS 2D
  // context, after the WebGL frame is drawn in but before toBlob — the only point that reaches the
  // actual exported bytes (RESUME_CPE_ROOM_TITLE.md §2's trap: a DOM caption never would).
  function _captureFrame(w, h, titleInfo) {
    var A = window.APP;
    if (A._composer) A._composer.render();
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
    if (titleInfo && titleInfo.opacity > 0 && A.roomTitleCompositeOntoCanvas) {
      A.roomTitleCompositeOntoCanvas(ctx, w, h, titleInfo.name, titleInfo.opacity);
    }
    return new Promise(function(res) { c.toBlob(res, 'image/webp', 0.92); });
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
      _status('🎬 MaxQ encoding mp4/H.264 (' + framesDone + ' frames)…');

      var cv = document.createElement('canvas');
      cv.width = ew; cv.height = eh;
      var cx = cv.getContext('2d');
      var usPerFrame = 1e6 / fps, gop = Math.max(1, Math.round(fps * 2));
      for (var i = 0; i < framesDone; i++) {
        var bmp = await createImageBitmap(await _idbGet(db, i));
        cx.drawImage(bmp, 0, 0);
        bmp.close();
        var vf = new VideoFrame(cv, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
        enc.encode(vf, { keyFrame: (i % gop) === 0 });
        vf.close();
        // Backpressure — the encoder is the slow end here, not IDB.
        while (enc.encodeQueueSize > 8) await _sleep(5);
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
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§MAXQ_DONE frames=' + framesDone + ' bytes=' + blob.size + ' type=video/mp4 codec=' + chosen);
      _status('🎬 MaxQ mp4 saved (' + (blob.size / 1e6).toFixed(1) + ' MB) — plays on iPhone/WhatsApp');
      return true;
    } catch (e) {
      console.log('§MAXQ_MP4_FALLBACK reason=' + (e && e.message ? e.message : String(e)));
      try { if (enc && enc.state !== 'closed') enc.close(); } catch (e5) {}
      return false;
    }
  }

  async function _stitch(db, framesDone, fps, w, h) {
    var A = window.APP;
    console.log('§MAXQ_STITCH frames=' + framesDone + ' fps=' + fps);
    _status('🎬 MaxQ stitching ' + framesDone + ' frames (' + Math.round(framesDone / fps) + 's realtime)…');
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
    var bmp0 = await createImageBitmap(await _idbGet(db, 0));
    ctx.drawImage(bmp0, 0, 0); bmp0.close();
    rec.start();
    var interval = 1000 / fps;
    for (var i = 1; i < framesDone; i++) {
      var t = performance.now();
      var bmp = await createImageBitmap(await _idbGet(db, i));
      var wait = interval - (performance.now() - t);
      if (wait > 0) await _sleep(wait);
      ctx.drawImage(bmp, 0, 0); bmp.close();
    }
    await _sleep(interval);
    rec.stop();
    await stopped;
    var blob = new Blob(chunks, { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
    console.log('§MAXQ_DONE frames=' + framesDone + ' bytes=' + blob.size + ' type=' + mime);
    _status('🎬 MaxQ movie saved (' + (blob.size / 1e6).toFixed(1) + ' MB)');
  }

  async function start(opts) {
    var A = window.APP;
    opts = opts || {};
    if (_active) { _cancel = true; console.log('§MAXQ_CANCEL requested'); return; }
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
    var nFrames = opts.frames || MAXQ_N_FRAMES, fps = opts.fps || MAXQ_FPS;
    _active = true; _cancel = false;
    // §MAXQ_HIDDEN_PAUSE / §MAXQ_QUALITY counters are per-RUN, not per-session — a second bake must
    // not inherit the first one's pauses or its unconverged count and report someone else's health.
    _hiddenMsTotal = 0; _hiddenPauses = 0; _unconverged = 0;
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    _wakeAcquire();
    _dampHold();   // §CINEMA_DAMPING_BLEED — the preview and the bake are both authored cameras
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
    while (A.streaming && !_cancel) {
      _status('🎬 Waiting for geometry to finish streaming…');
      await new Promise(function(r) { setTimeout(r, 500); });
      _streamWaitedMs += 500;
    }
    if (_streamWaitedMs) console.log('§MAXQ_STREAM_WAIT ms=' + _streamWaitedMs);
    if (_cancel) {
      console.log('§MAXQ_CANCEL during stream-wait — nothing baked, nothing saved');
      _status('🎬 MaxQ cancelled');
      _active = false; _cancel = false; A._maxqActive = false;
      _wakeRelease(); _dampRelease();
      return;
    }
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
    var _clip = null, _buildup = false, _bkState = null, _roomTitle = false, _titleSegs = null;
    function _tFilm(tNorm) { return _clip ? _clip.in + tNorm * (_clip.out - _clip.in) : tNorm; }
    function poseAt(tNorm) {
      tNorm = _tFilm(tNorm);
      if (plan) return plan.poseAt(tNorm);
      var az = az0 + tNorm * Math.PI * 2;
      return { x: tgt.x + radius * Math.cos(az), y: tgt.y + height, z: tgt.z + radius * Math.sin(az),
               tx: tgt.x, ty: tgt.y, tz: tgt.z };
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
      _status(status);
      var camSave = { px: A.camera.position.x, py: A.camera.position.y, pz: A.camera.position.z,
                      qx: A.controls.target.x, qy: A.controls.target.y, qz: A.controls.target.z };
      var pv0 = performance.now(), PREV_MS = 10000;
      await new Promise(function(res) {
        (function pvStep() {
          if (_cancel) return res();
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
      if (_cancel) return true;
      console.log('§MAXQ_PREVIEW done phase=' + phase + ' — camera restored');
      return false;
    }
    function _cancelledOut(where) {
      console.log('§MAXQ_CANCEL during ' + where + ' — nothing baked, nothing saved');
      _status('🎬 MaxQ cancelled during ' + where);
      _active = false; _cancel = false; A._maxqActive = false;
      _wakeRelease(); _dampRelease();
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
    if (A.cinemaPathEditor && plan && plan.waypoints && opts.editor !== false) {
      A._maxqActive = false;
      _wakeRelease(); _dampRelease();
      console.log('§CPE_LOCKS released for editing (maxqActive=false, wake+damping released)');
      _status('🎬 Edit the path, then OK to record');
      var _cpeRes = null;
      try {
        _cpeRes = await A.cinemaPathEditor.open({ plan: plan, durationSec: nFrames / fps, fps: fps });
      } catch (eE) { console.warn('§CPE_FAIL ' + eE.message + ' — proceeding with the derived path'); }
      A._maxqActive = true;
      _wakeAcquire(); _dampHold();
      console.log('§CPE_LOCKS re-claimed for the bake (maxqActive=true)');
      if (_cpeRes && _cpeRes.action === 'cancel') {
        console.log('§MAXQ_CANCEL from path editor — nothing baked, nothing saved');
        _status('🎬 Cancelled');
        _active = false; _cancel = false; A._maxqActive = false;
        _wakeRelease(); _dampRelease();
        return;
      }
      if (_cpeRes && _cpeRes.override) {
        // Constant speed means an edited path generally changes the total, so the frame count is
        // re-derived from it (item 11 — this is the render cost the editor surfaced).
        var _framesWas = nFrames;
        nFrames = Math.max(1, Math.round(_cpeRes.durationSec * fps));
        plan = A.cinemaPathPlan(nFrames / fps, _cpeRes.override);
        // §CPE_OK_CRASH (CINEMA_PATH_EDITOR.md) — this line used to read `override.waypoints.length`
        // and threw `undefined.length` on EVERY edited path: §CPE_BANDS changed the editor's override
        // to carry `bands` (3 bands → 6 waypoints, expanded inside effects.js), and this one consumer
        // was never ported. The plan above had already succeeded — a stale LOG line was killing the
        // bake. Count what the plan actually flew, and never let this line be the thing that throws.
        var _ov = _cpeRes.override;
        // §CPE_CLIP: a clip is fewer frames of the SAME film, so the frame count scales with the
        // window — not the duration, which the editor already derived for the whole path.
        if (_ov.clip && _ov.clip.out > _ov.clip.in) {
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
      } else {
        // Guardrail 2: OK with no edit re-uses the plan object computed before the editor opened —
        // literally the same object, so the film is byte-identical to one recorded without the
        // editor existing. The default cost of this feature is one click and nothing else.
        console.log('§CPE_APPLIED none — derived plan unchanged (guardrail 2: OK is a no-op)');
      }
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
      await _idbDelete();
      db = _db = await _idbOpen();
      console.log('§MAXQ_IDB_READY store opened');
      // Warm-up fold (discarded): staging's async assets (sunset HDRI envMap, AO bundle, textures)
      // must be resident BEFORE frame 0, or early frames bake a different global lighting baseline
      // than later ones (whole-building tint shift — measured 21.6dB vs 24.3dB PSNR in the PoC).
      _status('🎬 MaxQ warming up…');
      A.startStillRefine();
      await _waitFoldDone(30000, 'warm-up fold');
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
      await _raf2(); await _sleep(3000);

      // ══ §CPE_BUILDUP / §MAXQ_TIME mode D — the model assembles itself as the camera flies ══════
      // The ordering is computed over the WHOLE path (plan.poseAt, deliberately NOT the clipped
      // poseAt): with a clip, the buildup must be sampled BY the window, not re-normalised to it, or
      // every clip would open on bare ground instead of on a partially-built building
      // (PHOTOREAL_STILL_RENDER.md §MAXQ_TIME code-read, §6).
      if (_buildup) {
        if (typeof window.tmOrderByCameraPath !== 'function' || typeof window.tmActivateForBake !== 'function') {
          console.warn('§CPE_BUILDUP_SKIP reason=time_machine.js not loaded — baking without the buildup');
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
          else if (_bkState.source === 'captured') {
            // §CPE_BUILDUP_REAL_SCHEDULE §5 — the label moves with the data. States scope and
            // coverage; claims NO predecessor logic, float or resources (this data carries none).
            _status('🎬 Building to the linked schedule (' + _bkState.leafTasks + ' phases, ' +
              _bkState.pct + '% of elements)');
          } else {
            // §5 tier 2 — a real, model-derived 4D. Never "the schedule", never "a programme".
            _status('🎬 Building to this model\'s 4D timeline (' + _bkState.placed + ' elements, as the Time Machine has it)');
          }
          // §CPE_GHOST_GROUND: armed here because this is where the buildup timeline becomes real —
          // the trigger is a cursor timestamp, so it cannot be computed before the ops are ordered.
          if (_bkState) _ghostGroundArm(_bkState);
        }
      }
      // §CPE_ROOM_TITLE — one coarse pre-pass over the WHOLE (already clip/buildup-resolved) frame
      // count, not a per-frame room query: nFrames/fps here is the bake's actual, final duration
      // (§CPE_CLIP has already resized it above), so the timeline never disagrees with what's about
      // to be captured.
      if (_roomTitle && plan && A.roomTitleBuildTimeline) {
        try { _titleSegs = A.roomTitleBuildTimeline(plan, nFrames / fps); }
        catch (eT) { console.warn('§CPE_ROOM_TITLE_ERR ' + eT.message); _titleSegs = null; }
      }
      t0 = _etaPrev = performance.now();
      for (var i = 0; i < nFrames; i++) {
        if (_cancel) { console.log('§MAXQ_CANCEL i=' + i); break; }
        // §MAXQ_CONTEXT_LOSS: scene.js's webglcontextlost handler (§S266) sets this — capturing
        // further frames now would just save blank/black canvas with no error, silently corrupting
        // the tail of the movie. Stop here and salvage whatever was captured before the loss,
        // same treatment as the IDB-connection-lost path below.
        if (A._webglContextLost) { _glLost = true; console.log('§MAXQ_GL_LOST i=' + i + ' salvaging ' + framesDone + ' already-captured frames'); break; }
        if (A._stillRefineActive) A.stopStillRefine(true);
        // §MAXQ_HIDDEN_PAUSE: park BEFORE the cook, not after. Waiting here means the frame is
        // begun with the tab already visible, so the fold has a real rAF loop to converge on.
        await _awaitVisible('frame ' + i + '/' + nFrames);
        await _raf2('frame ' + i + ' settle');
        await _sleep(SETTLE_MS);
        _freezeRandom();
        var _tn = nFrames > 1 ? i / (nFrames - 1) : 0;
        var pose = poseAt(_tn);  // tNorm hits 1.0 on the last frame so the pull-back completes
        A.camera.position.set(pose.x, pose.y, pose.z);
        A.controls.target.set(pose.tx, pose.ty, pose.tz);
        A.controls.update();
        // §CPE_BUILDUP: the SECOND per-frame state advance (§MAXQ_TIME's whole premise — mode A moves
        // only the camera, this adds construction state). _tFilm keeps the cursor on the film's own
        // parameter, so a clip samples the middle of the buildup rather than restarting it.
        if (_buildup && _bkState) {
          var _bkT = _tFilm(_tn);
          var _bkMs = _bkState.projectStart + _bkT * (_bkState.projectEnd - _bkState.projectStart);
          window.tmSetCursor(_bkMs);
          // §CPE_GHOST_GROUND: same film fraction the cursor rides, so the ghost cannot drift out of
          // step with what is actually placed.
          var _ggO = _ghostGroundAt(_bkT, nFrames / fps);
          if (i === 0 || i === nFrames - 1 || i % 60 === 0) {
            console.log('§CPE_BUILDUP frame=' + i + '/' + nFrames + ' t=' + _bkT.toFixed(3) +
              ' cursor=' + Math.round(_bkMs) + ' placed=' + (window.tmPlacedCount ? window.tmPlacedCount(_bkMs) : '?') +
              '/' + _bkState.ops +
              (_ggO == null ? '' : ' groundOpacity=' + _ggO.toFixed(3)));
          }
        }
        A.startStillRefine();
        var ok = await _waitFoldDone(30000, 'cook of frame ' + i + '/' + nFrames);
        await _raf2('frame ' + i + ' capture');
        _restoreRandom();
        // A timeout can now only mean a genuinely slow frame, since hidden time no longer counts
        // against the budget. Counted rather than merely warned: the total is what lets the run
        // state its own health at the end instead of leaving a degraded film to look identical to
        // a good one.
        if (!ok) { _unconverged++; console.warn('§MAXQ_FRAME_TIMEOUT i=' + i + ' — capturing as-is (UNCONVERGED, count=' + _unconverged + ')'); }
        var _titleInfo = (_titleSegs && A.roomTitleOpacityAt) ? A.roomTitleOpacityAt(_titleSegs, i / fps) : null;
        var blob = await _captureFrame(w, h, _titleInfo);
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
          await _idbPut(db, i, blob);
        } catch (idbErr) {
          _idbLost = true;
          console.warn('§MAXQ_IDB_LOST i=' + i + ' ' + idbErr.message +
            ' — tab likely backgrounded/throttled; salvaging ' + framesDone + ' already-captured frames');
          try { db = _db = await _idbOpen(); console.log('§MAXQ_IDB_REOPEN ok'); }
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
        _status('🎬 MaxQ frame ' + (i + 1) + '/' + nFrames + ' — ' + Math.round(_el / 1000) + 's, ~' +
          _etaTxt + ' (Alt+C / cinema icon cancels + saves partial)');
        if (_etaNow - _logPrev >= MAXQ_LOG_MS || i === 0 || i === nFrames - 1) {
          _logPrev = _etaNow;
          console.log('§MAXQ_FRAME i=' + i + '/' + nFrames + ' elapsedMs=' + Math.round(_el) +
            ' perFrameMs=' + Math.round(_per) + ' etaSec=' + _eta + ' (rolling-15, log every ' +
            (MAXQ_LOG_MS / 1000) + 's)');
        }
      }
      if (A._stillRefineActive) A.stopStillRefine(true);
      _restoreRandom();
      // §CPE_BUILDUP: hand the user's Time Machine back exactly as it was. Every loop exit — normal
      // end, cancel, GL loss, IDB loss — passes through here, so the re-keyed order can never
      // outlive the bake and silently become what the timeline slider scrubs.
      if (_bkState && typeof window.tmRestoreDerivedOrder === 'function') {
        window.tmRestoreDerivedOrder(); _bkState = null;
      }
      // §CPE_GHOST_GROUND: same contract, same exit — a ghosted ground left behind would follow the
      // user into normal navigation for the rest of the session.
      try { _ghostGroundRestore(); } catch (eGG) {}
      // ══ §MAXQ_QUALITY — the run states its own health, ALWAYS, before anything is stitched.
      // The defect this exists for is a film that looks complete and plays fine while its last
      // seconds are visually dead. A degraded bake must never finish quietly: `unconverged` is the
      // load-bearing number, because it counts frames captured before the fold finished — exactly
      // the frames that come out as near-duplicates and read as the film stalling. With
      // §MAXQ_HIDDEN_PAUSE in place a hidden tab should contribute ZERO of them, so a non-zero
      // count now means genuinely slow frames and nothing else.
      console.log('§MAXQ_QUALITY frames=' + framesDone + ' unconverged=' + _unconverged +
        (_unconverged ? ' ⚠ THOSE FRAMES DID NOT FINISH — expect dead-looking video where they land' : ' (every frame converged)') +
        ' hiddenPauses=' + _hiddenPauses + ' totalHiddenMs=' + Math.round(_hiddenMsTotal) +
        (_hiddenPauses ? ' — the bake PARKED while the tab was hidden rather than degrading; the wall clock is longer, the film is not worse' : ''));
      // §MAXQ_PARTIAL: cancel SAVES what's cooked so far (user Q 2026-07-19 — losing minutes of
      // cook must never be the default). Threshold: at least 1s of footage (fps frames) on a
      // cancelled run — below that there's nothing worth stitching.
      if (framesDone >= (_cancel ? fps : 1)) {
        if (_cancel) console.log('§MAXQ_CANCEL_PARTIAL stitching ' + framesDone + ' frames (' +
          (framesDone / fps).toFixed(1) + 's of footage)');
        // §MAXQ_MP4: mp4/H.264 first (plays on iPhone/WhatsApp), webm MediaRecorder as fallback.
        // opts.forceWebm=true skips mp4 entirely — that is how the fallback path stays witnessed.
        var mp4ok = false;
        if (opts.forceWebm) console.log('§MAXQ_MP4_FALLBACK reason=forced-webm (opts.forceWebm)');
        else mp4ok = await _stitchMp4(db, framesDone, fps, w, h);
        if (!mp4ok) await _stitch(db, framesDone, fps, w, h);
      } else if (_cancel) {
        _status('🎬 MaxQ cancelled at frame ' + framesDone + ' — under 1s of footage, nothing saved');
      } else if (_idbLost) {
        // §MAXQ_IDB_SALVAGE: the non-cancel break path above falls through both branches above
        // silently otherwise — with zero user-visible feedback this reads as "hung", not "failed
        // with nothing to save" (real user report, 2026-07-26).
        _status('🎬 MaxQ stopped at frame ' + framesDone +
          ' — lost its storage connection (tab backgrounded, or another MaxQ bake running in a ' +
          'different tab of this app) before enough footage was captured to save');
      } else if (_glLost) {
        _status('🎬 MaxQ stopped at frame ' + framesDone +
          ' — the browser reclaimed the 3D view (long-idle GPU throttle) before enough footage ' +
          'was captured to save');
      }
    } catch (e) {
      console.warn('§MAXQ_FAIL ' + e.message);
      _status('🎬 MaxQ failed: ' + e.message +
        (e.message === 'idb-open-timeout' ? ' — close other tabs of this app and retry' : ''));
    } finally {
      _restoreRandom();
      // A throw mid-fold (e.g. the idb-open abort) skips the in-try stop — staging would otherwise
      // stay frozen on screen with the composer accumulating.
      try { if (A._stillRefineActive) A.stopStillRefine(true); } catch (e2) {}
      // §CPE_BUILDUP: same restore on the THROW path. A re-keyed op-log left behind by a crashed
      // bake would look like a corrupted schedule to the next person who opens the timeline.
      try { if (_bkState && window.tmRestoreDerivedOrder) { window.tmRestoreDerivedOrder(); _bkState = null; } } catch (e3) {}
      try { _ghostGroundRestore(); } catch (e4) {}
      // Recoverability FIRST: clearing the store can itself block for seconds behind the very
      // zombie connection that failed this run, and until these flags reset the next Alt+C is
      // swallowed as a cancel-toggle. Cleanup must never gate the ability to retry.
      _active = false; _cancel = false;
      A._maxqActive = false;
      _wakeRelease(); _dampRelease();
      await _idbDestroy(db);
    }
  }

  // No own key binding: Alt+C (scene.js §KBD_ROUTE) and the Palette cinema icon (panels.js)
  // are the triggers — this feature REPLACES the live-capture orbit at that icon per user spec.
  // start() while running = cancel (toggle), same as pressing the icon again.
  function cancel() {
    console.log('§MAXQ_CANCEL requested active=' + _active);
    if (_active) _cancel = true;
  }
  // APP may not exist at parse time — attach the public API once it does.
  var _attach = setInterval(function() {
    if (window.APP) {
      window.APP.startMaxQualityOrbit = start;
      window.APP.cancelMaxQualityOrbit = cancel;
      // §CPE_GHOST_GROUND: exported so cinema_path_editor's REHEARSAL drives the identical curve —
      // one implementation, two call sites (the §CPE_ROOM_TITLE precedent).
      window.APP.ghostGroundArm = _ghostGroundArm;
      window.APP.ghostGroundAt = _ghostGroundAt;
      window.APP.ghostGroundRestore = _ghostGroundRestore;
      clearInterval(_attach);
    }
  }, 500);
})();
