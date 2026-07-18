// §MAXQ — Max-Quality Orbiter export (Alt+M).
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ SPEC (2026-07-19).
// Ports the proven offline PoC loop in-app: each frame is a COMPLETE Alt+S fold (photoshoot
// staging + 16-sample TAA + full §PHOTO_AO converge) captured to a per-feature IDB store, then
// replay-recorded onto a proxy canvas at MAXQ_FPS (MediaRecorder in its real-time happy path —
// the same recorder pattern Cinema Orbit ships with, NOT the frame-starved capture that sank the
// retired TM exporter). Single tab = serial: ~1.3s/frame → 360 frames ≈ 8 min cook + 24s stitch.
(function() {
  'use strict';
  var MAXQ_N_FRAMES = 360, MAXQ_FPS = 15;  // 24s clip (360/15) — opts-overridable
  var SETTLE_MS = 250;   // teardown→restage settle. Flicker fix, PoC-proven: without it the next
                         // staging captures mid-restore sun-tint/exposure values as "original"
                         // and the whole building oscillates color frame-to-frame.
  var IDB_NAME = 'bim_ootb_cinema_maxq', IDB_STORE = 'frames';
  var _active = false, _cancel = false;

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
    var tgt = A.controls.target.clone();
    var dx = A.camera.position.x - tgt.x, dy = A.camera.position.y - tgt.y, dz = A.camera.position.z - tgt.z;
    var radius = Math.hypot(dx, dz), height = dy, az0 = Math.atan2(dz, dx);
    var w = A.renderer.domElement.width, h = A.renderer.domElement.height;
    console.log('§MAXQ_START frames=' + nFrames + ' fps=' + fps + ' radius=' + radius.toFixed(1) +
      ' height=' + height.toFixed(1) + ' size=' + w + 'x' + h);
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
    try {
      for (var i = 0; i < nFrames; i++) {
        if (_cancel) { console.log('§MAXQ_CANCEL i=' + i); break; }
        if (A._stillRefineActive) A.stopStillRefine(true);
        await _raf2();
        await _sleep(SETTLE_MS);
        _freezeRandom();
        var az = az0 + (i / nFrames) * Math.PI * 2;
        A.camera.position.set(tgt.x + radius * Math.cos(az), tgt.y + height, tgt.z + radius * Math.sin(az));
        A.controls.target.copy(tgt);
        A.controls.update();
        A.startStillRefine();
        var ok = await _waitFoldDone(30000);
        await _raf2();
        _restoreRandom();
        if (!ok) console.warn('§MAXQ_FRAME_TIMEOUT i=' + i + ' — capturing as-is');
        var blob = await _captureFrame(w, h);
        await _idbPut(db, i, blob);
        framesDone = i + 1;
        if (i % 15 === 0 || i === nFrames - 1) {
          console.log('§MAXQ_FRAME i=' + i + '/' + nFrames + ' elapsedMs=' + Math.round(performance.now() - t0));
          _status('🎬 MaxQ frame ' + (i + 1) + '/' + nFrames + ' — ' +
            Math.round((performance.now() - t0) / 1000) + 's (Alt+M cancels)');
        }
      }
      if (A._stillRefineActive) A.stopStillRefine(true);
      _restoreRandom();
      if (!_cancel && framesDone > 0) await _stitch(db, framesDone, fps, w, h);
      else if (_cancel) _status('🎬 MaxQ cancelled at frame ' + framesDone);
    } catch (e) {
      console.warn('§MAXQ_FAIL ' + e.message);
      _status('🎬 MaxQ failed: ' + e.message);
    } finally {
      _restoreRandom();
      _idbDestroy(db);
      _active = false; _cancel = false;
    }
  }

  // capture-phase so no bubbling handler can swallow it; witnessed (headless) that synthetic
  // keydown delivery can lag behind a running cook — the explicit cancel API below is the
  // guaranteed path either way.
  document.addEventListener('keydown', function(e) {
    if (e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); start(); }
  }, true);
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
