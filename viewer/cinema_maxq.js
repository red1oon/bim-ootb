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
  var MAXQ_V = 'v7 (rolling ETA + screen wake-lock)';
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

  function _idbOpen() {
    return new Promise(function(res, rej) {
      var rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = function() { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function() { res(rq.result); };
      rq.onerror = function() { rej(rq.error); };
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
  function _idbDestroy(db) { try { db.close(); indexedDB.deleteDatabase(IDB_NAME); } catch (e) {} }

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
    var nFrames = opts.frames || MAXQ_N_FRAMES, fps = opts.fps || MAXQ_FPS;
    _active = true; _cancel = false;
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    _wakeAcquire();
    // §CINEMA_PATH: fly the SAME orbit-path formula as the live-capture Cinema Orbit (push-in to
    // fill-frame → hold → band, sun-glint swoop, elliptical radius, pull-back flourish) — shared
    // plan from effects.js. Fallback: plain circle at current radius/height if the plan API is
    // unavailable (old effects.js in cache).
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
    var db = await _idbOpen();
    var framesDone = 0;
    // Warm-up fold (discarded): staging's async assets (sunset HDRI envMap, AO bundle, textures)
    // must be resident BEFORE frame 0, or early frames bake a different global lighting baseline
    // than later ones (whole-building tint shift — measured 21.6dB vs 24.3dB PSNR in the PoC).
    _status('🎬 MaxQ warming up…');
    A.startStillRefine();
    await _waitFoldDone(30000);
    A.stopStillRefine(true);
    await _raf2(); await _sleep(3000);
    var t0 = performance.now();
    // §MAXQ_ETA_ROLLING (user 2026-07-19: "74 mins... suddenly 38... now 33.. it is not accurate"):
    // lifetime-average ETA is poisoned by the expensive early frames (indoor prelude close-ups cost
    // far more than wide exterior frames). Use the mean of the LAST 15 frames instead — tracks the
    // current phase's real rate.
    var _etaPrev = t0, _etaRecent = [];
    try {
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
        await _stitch(db, framesDone, fps, w, h);
      } else if (_cancel) {
        _status('🎬 MaxQ cancelled at frame ' + framesDone + ' — under 1s of footage, nothing saved');
      }
    } catch (e) {
      console.warn('§MAXQ_FAIL ' + e.message);
      _status('🎬 MaxQ failed: ' + e.message);
    } finally {
      _restoreRandom();
      _idbDestroy(db);
      _active = false; _cancel = false;
      A._maxqActive = false;
      _wakeRelease();
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
