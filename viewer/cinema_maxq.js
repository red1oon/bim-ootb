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
  var MAXQ_V = 'v10 (§CINEMA_SIMPLE path; room-graph warmed before planning)';
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

  function _raf2() { return new Promise(function(res) { requestAnimationFrame(function() { requestAnimationFrame(res); }); }); }
  function _sleep(ms) { return new Promise(function(res) { setTimeout(res, ms); }); }
  function _status(t) { var A = window.APP; if (A && A.status) A.status.textContent = t; }

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

  function _waitFoldDone(timeoutMs) {
    var A = window.APP;
    return new Promise(function(res) {
      var t0 = performance.now();
      (function poll() {
        if (!A._stillRefineBusy) return res(true);
        if (performance.now() - t0 > timeoutMs) return res(false);
        setTimeout(poll, 100);
      })();
    });
  }

  // One explicit composer render, then SAME-TASK drawImage into a 2D canvas (clash_snag.js's
  // proven capture pattern — the WebGL buffer is only guaranteed valid within the task that drew it).
  function _captureFrame(w, h) {
    var A = window.APP;
    if (A._composer) A._composer.render();
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(A.renderer.domElement, 0, 0, w, h);
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
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    _wakeAcquire();
    // §MAXQ_STREAM_FIRST (user report, LTU_AHouse/122k: preview correctly showed boxes for speed,
    // but the bake should auto-switch to solid — investigation found the boxes were NOT a
    // deliberate LOD choice: dlod_nav.js already fully disengages the instant A._maxqActive is set
    // above, every frame, so it can't be the source. cinema_maxq.js had zero references to
    // A.streaming — the boxes are the geometry-streaming pipeline's own unpromoted-element
    // placeholders bleeding through because nothing waited for them. Same fix as tour.js's
    // §FLY_STREAM_WAIT, reused not reinvented: wait for streaming to fully drain BEFORE the preview
    // even starts, so neither the preview nor the bake ever shows a placeholder — a mid-clip switch
    // would still visibly pop in the baked video, waiting first avoids that entirely.)
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
      _wakeRelease();
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
    var tgt = A.controls.target.clone();
    var dx = A.camera.position.x - tgt.x, dy = A.camera.position.y - tgt.y, dz = A.camera.position.z - tgt.z;
    var radius = Math.hypot(dx, dz), height = dy, az0 = Math.atan2(dz, dx);
    function poseAt(tNorm) {
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
    if (opts.preview !== false) {
      console.log('§MAXQ_PREVIEW start 10s real-time mock of the exact path (plain look, no Alt+S)');
      _status('🎬 Path preview (10s, plain look) — the bake follows; Alt+C cancels');
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
      if (_cancel) {
        console.log('§MAXQ_CANCEL during preview — nothing baked, nothing saved');
        _status('🎬 MaxQ cancelled during preview');
        _active = false; _cancel = false; A._maxqActive = false;
        _wakeRelease();
        return;
      }
      console.log('§MAXQ_PREVIEW done — camera restored, commencing capture');
    }
    var db = null;
    var framesDone = 0;
    var t0 = performance.now();
    // §MAXQ_ETA_ROLLING (user 2026-07-19: "74 mins... suddenly 38... now 33.. it is not accurate"):
    // lifetime-average ETA is poisoned by the expensive early frames (indoor prelude close-ups cost
    // far more than wide exterior frames). Use the mean of the LAST 15 frames instead — tracks the
    // current phase's real rate.
    var _etaPrev = t0, _etaRecent = [];
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
      await _waitFoldDone(30000);
      A.stopStillRefine(true);
      await _raf2(); await _sleep(3000);
      t0 = _etaPrev = performance.now();
      for (var i = 0; i < nFrames; i++) {
        if (_cancel) { console.log('§MAXQ_CANCEL i=' + i); break; }
        if (A._stillRefineActive) A.stopStillRefine(true);
        await _raf2();
        await _sleep(SETTLE_MS);
        _freezeRandom();
        var pose = poseAt(nFrames > 1 ? i / (nFrames - 1) : 0);  // tNorm hits 1.0 on the last frame so the pull-back completes
        A.camera.position.set(pose.x, pose.y, pose.z);
        A.controls.target.set(pose.tx, pose.ty, pose.tz);
        A.controls.update();
        A.startStillRefine();
        var ok = await _waitFoldDone(30000);
        await _raf2();
        _restoreRandom();
        if (!ok) console.warn('§MAXQ_FRAME_TIMEOUT i=' + i + ' — capturing as-is');
        var blob = await _captureFrame(w, h);
        await _idbPut(db, i, blob);
        framesDone = i + 1;
        var _etaNow = performance.now();
        _etaRecent.push(_etaNow - _etaPrev); _etaPrev = _etaNow;
        if (_etaRecent.length > 15) _etaRecent.shift();
        if (i % 15 === 0 || i === nFrames - 1) {
          var _el = _etaNow - t0;
          var _per = _etaRecent.reduce(function(a, b) { return a + b; }, 0) / _etaRecent.length;
          var _eta = i > 0 ? Math.round(_per * (nFrames - i - 1) / 1000) : -1;
          console.log('§MAXQ_FRAME i=' + i + '/' + nFrames + ' elapsedMs=' + Math.round(_el) +
            ' perFrameMs=' + Math.round(_per) + ' etaSec=' + _eta + ' (rolling-15)');
          _status('🎬 MaxQ frame ' + (i + 1) + '/' + nFrames + ' — ' + Math.round(_el / 1000) + 's, ~' +
            (_eta >= 0 ? Math.ceil(_eta / 60) + ' min left' : 'estimating') +
            ' (Alt+C / cinema icon cancels + saves partial)');
        }
      }
      if (A._stillRefineActive) A.stopStillRefine(true);
      _restoreRandom();
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
      // Recoverability FIRST: clearing the store can itself block for seconds behind the very
      // zombie connection that failed this run, and until these flags reset the next Alt+C is
      // swallowed as a cancel-toggle. Cleanup must never gate the ability to retry.
      _active = false; _cancel = false;
      A._maxqActive = false;
      _wakeRelease();
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
      clearInterval(_attach);
    }
  }, 500);
})();
