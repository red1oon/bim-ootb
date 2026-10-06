// cinema_maxq family — part `infra` (original cinema_maxq.js lines 545–783).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cinema_maxq.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as MQS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts = (typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts.infra = function* __split_cinema_maxq_infra(MQS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  MQS._wakeAcquire = _wakeAcquire;
  MQS._bakeBudgetRelease = _bakeBudgetRelease;
  MQS._wakeRelease = _wakeRelease;
  MQS._raf2 = _raf2;
  MQS._sleep = _sleep;
  MQS._status = _status;
  MQS._maxqStatusDayRoomSegs = _maxqStatusDayRoomSegs;
  MQS._dampHold = _dampHold;
  MQS._dampRelease = _dampRelease;
  MQS._idbDelete = _idbDelete;
  MQS._idbOpen = _idbOpen;
  MQS._idbPut = _idbPut;
  MQS._idbGet = _idbGet;
  MQS._idbDestroy = _idbDestroy;
  MQS._freezeRandom = _freezeRandom;
  MQS._restoreRandom = _restoreRandom;
  MQS._awaitVisible = _awaitVisible;
  MQS._waitFoldDone = _waitFoldDone;
  Object.defineProperty(MQS, '_db', { get: function () { return _db; }, set: function (v) { _db = v; }, enumerable: true });
  Object.defineProperty(MQS, '_hiddenMsTotal', { get: function () { return _hiddenMsTotal; }, set: function (v) { _hiddenMsTotal = v; }, enumerable: true });
  Object.defineProperty(MQS, '_hiddenPauses', { get: function () { return _hiddenPauses; }, set: function (v) { _hiddenPauses = v; }, enumerable: true });
  Object.defineProperty(MQS, '_unconverged', { get: function () { return _unconverged; }, set: function (v) { _unconverged = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  async function _wakeAcquire() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        MQS._wakeLock = await navigator.wakeLock.request('screen');
        console.log('§MAXQ_WAKELOCK acquired (screen stays awake for the bake)');
        if (!MQS._wakeWired) {
          MQS._wakeWired = true;
          document.addEventListener('visibilitychange', function() {
            if (MQS._active && document.visibilityState === 'visible' && (!MQS._wakeLock || MQS._wakeLock.released)) _wakeAcquire();
          });
        }
      } else {
        console.log('§MAXQ_WAKELOCK unavailable — keep the tab visible and screen awake manually');
      }
    } catch (e) { console.log('§MAXQ_WAKELOCK denied: ' + e.message); }
  }
  // §MAXQ_FRAME_BUDGET — the bake's cheaper fold must never outlive the bake. Paired with every
  // _wakeRelease() call site, which is this file's existing "the run is over" marker.
  function _bakeBudgetRelease() { try { window.APP._stillBudget = null; } catch (e) {} }
  function _wakeRelease() {
    try { if (MQS._wakeLock && !MQS._wakeLock.released) MQS._wakeLock.release(); } catch (e) {}
    MQS._wakeLock = null;
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

  // §CPE_MAXQ_STATUS_DAY_LABEL (CINEMA_PATH_EDITOR.md) — Day # and current room label, appended
  // to the same per-frame status line §CPE_STICK_APPROACH already writes to. Pure and exposed on
  // APP below (same treatment as `A.dayCounterAt`/`A.roomTitleOpacityAt` themselves) so the
  // witness can gate this exact composition without spinning up a live bake — `dayInfo`/
  // `titleInfo` are exactly the objects the per-frame loop already computed for the canvas-
  // compositing path (_captureFrame), this function only formats them into the two extra
  // status-line segments. Nothing is recomputed: `dayInfo` null means the day-counter is off for
  // this bake (§CPE_DAY_COUNTER, `_dayPos === 'off'`); `titleInfo`/`titleInfo.name` null/empty
  // means §CPE_ROOM_TITLE is off or the walk is between rooms (no active caption) — both segments
  // are omitted entirely rather than ever printing "Day null/null" or empty quotes.
  function _maxqStatusDayRoomSegs(dayInfo, titleInfo) {
    var dayTxt = (dayInfo && dayInfo.day != null && dayInfo.totalDays != null)
      ? ', Day ' + dayInfo.day + '/' + dayInfo.totalDays : '';
    var roomTxt = (titleInfo && titleInfo.name) ? ', "' + titleInfo.name + '"' : '';
    return { dayTxt: dayTxt, roomTxt: roomTxt };
  }

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
      try { rq = indexedDB.deleteDatabase(MQS.IDB_NAME); } catch (e) { return res(false); }
      rq.onsuccess = function() { res(true); };
      rq.onerror = function() { res(false); };
      rq.onblocked = function() {
        console.warn('§MAXQ_IDB_BLOCKED delete blocked — another tab holds ' + MQS.IDB_NAME + ' open');
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
      try { rq = indexedDB.open(MQS.IDB_NAME, 1); } catch (e) { return done(rej, e); }
      rq.onupgradeneeded = function() { rq.result.createObjectStore(MQS.IDB_STORE); };
      rq.onsuccess = function() {
        var db = rq.result;
        // A later version-change request (another tab, or our own next-run delete) must not find
        // this connection still open — close on demand instead of becoming the zombie blocker.
        db.onversionchange = function() { try { db.close(); } catch (e) {} if (_db === db) _db = null; };
        done(res, db);
      };
      rq.onerror = function() { done(rej, rq.error || new Error('idb-open-error')); };
      rq.onblocked = function() {
        console.warn('§MAXQ_IDB_BLOCKED open blocked behind a pending delete of ' + MQS.IDB_NAME);
      };
    });
  }
  function _idbPut(db, k, v) {
    return new Promise(function(res, rej) {
      var tx = db.transaction(MQS.IDB_STORE, 'readwrite');
      tx.objectStore(MQS.IDB_STORE).put(v, k);
      tx.oncomplete = res; tx.onerror = function() { rej(tx.error); };
    });
  }
  function _idbGet(db, k) {
    return new Promise(function(res, rej) {
      var rq = db.transaction(MQS.IDB_STORE).objectStore(MQS.IDB_STORE).get(k);
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
  function _leanPoll() { return /[?&]bakelean=1/.test(location.search) ? 5 : 100; }
  async function _waitFoldDone(timeoutMs, why) {
    var A = window.APP;
    var spentVisible = 0, last = performance.now();
    for (;;) {
      if (_isHidden()) { await _awaitVisible(why); last = performance.now(); }
      if (!A._stillRefineBusy) return true;
      if (spentVisible > timeoutMs) return false;
      await _sleep(_leanPoll());   // §BAKE_LEAN L1: &bakelean=1 polls every 5 ms (was 100: ~50 ms idle per frame)
      var now = performance.now();
      spentVisible += now - last;
      last = now;
    }
  }
};
