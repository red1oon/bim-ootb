/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_walk.js — §CPE_WALK_EDIT_V1 (prompts/CPE_POV_WALK_PATHING.md).
//
// 🔒 LOCKED VISION (user 2026-08-07, "the perfect rehash"): POV walk is an INPUT DEVICE for the
// existing stick edit, not a new authoring model. Walk in B (the CPE viewfinder), press snap, a
// stick lands at the walked pose facing where you were looking, and the EXISTING re-plan
// (_replanFilm -> cinemaPathPlan) re-snakes the path exactly as a drag-release does today. There is
// no second path truth here and no continuous pose recording — that idea ("the walk becomes the
// path") was explicitly RETIRED by the same user ruling; see the spec file's own §SUPERSEDED note.
//
// This file is the ONLY new code for the feature (spec's "Handed to the implementation session as
// fact"). cinema_path_editor.js was touched at exactly four named seams — see that file's own
// §CPE_WALK_EDIT_V1 comments for each: (1) the `cpe-walk-toggle` button in `_buildPanel()`'s title
// row + `_wireWalkToggle()`, (2) `_walkMount`/`_walkUnmount` on the public `cinemaPathEditor`
// object, which are the ONLY callers of the private `_wire()`/`_unwire()` functions this feature
// needed, (3) `_walkSnap()` — the one new maths piece (band insertion at a walked pose, ordering +
// tangent from the curve, `lookAt` from a forward raycast — reuses §CPE_STICK's insertion rule and
// §CPE_AIM_PIN's `lookAt` storage verbatim), (4) one guard line at the top of `finish()` so walk
// mode cannot outlive the editor. effects.js / time_machine.js / schedule_*.js / main.js: zero edits.
//
// ══ §CPE_WALK_CANVAS_FREEZE — how "render only B while walking" is achieved with ZERO main.js
// edits ══════════════════════════════════════════════════════════════════════════════════════════
// main.js's animate() loop renders the MAIN view and the B scissor pass TOGETHER, gated by the SAME
// `_needsRender` flag (main.js:903/907/912 mobile, :922/925/927 desktop — read, not edited) — there
// is no existing lever to run one without the other from outside that file. So this module never
// calls `A.markDirty()` during continuous walking: main.js's own §IDLE-PARK self-parks (0 frames)
// the instant nothing keeps it awake, and this module drives B ITSELF, directly, in its own private
// rAF loop, by calling `A._cpeViewfinderRender()` — the exact hook main.js would have called, just
// invoked from here instead. The main view genuinely renders zero frames while walking; the only
// reason the user does not see it go stale is the freeze overlay below.
//
// The freeze overlay is a 2D `<canvas>` snapshot of the WebGL canvas, positioned exactly over it,
// with a hole `clearRect` cut where B's own rect lives (so B's live, scissored pixels keep showing
// through — B is not part of the overlay, it is a hole IN it). Three.js's default
// `preserveDrawingBuffer:false` means the capture MUST happen in the same synchronous task as the
// render that produced it (no rAF hop, no await in between) — `_renderMainOnce()` and
// `_recaptureFreeze()` are always called back-to-back, never separated by a yield.
//
// ══ §CPE_WALK_TM_LOCK — same zero-edit constraint applied to time_machine.js ═══════════════════
// time_machine.js exposes no public pause/resume function (checked: only tmGetState/tmSetCursor/
// tmActivateForBake/tm*Order*/tm*Schedule* are on `window`). Its own play/pause buttons
// (#tm-fwd-btn/#tm-rev-btn) are real DOM elements wired to `startPlayback(dir)`, which TOGGLES
// (call it twice with the same dir and it stops) — and `.tm-active` is the CSS class the SAME file
// already applies to whichever button is currently driving playback. So "pause TM" here means
// dispatching a real `pointerup` at whichever button already carries `.tm-active` — the exact
// gesture a user's own click would produce, through time_machine.js's own existing listener, not a
// re-implementation of its playback state machine. Resume is the identical dispatch, once, at
// unmount. `pointer-events:none` on the panel additionally blocks the user from starting a NEW
// scrub/play mid-walk (spec: "disables/backgrounds its panel").
(function() {
  'use strict';

  function A() { return window.APP; }

  var WALK_SPEED_MPS = 6;          // fly-speed in metres/sec — reasonable interior walking pace
  var MOUSE_SENSITIVITY = 0.002;   // identical constant to navigate_controls.js:45 (copied pattern)
  var LOOK_RAY_FALLBACK_M = 10;    // §CPE_WALK_EDIT_V1 spec's own fallback when the forward ray hits nothing
  var LOG_EVERY_N_FRAMES = 30;     // ~0.5s at 60fps — enough numeric truth without flooding the console
  var MAX_DT = 0.1;                // clamp a long stall (tab switch) so one frame cannot teleport the walker
  // §CPE_WALK_GLIDE (2026-08-07, user on Hospital: "only able to turn cam but not zoom in (via pinch
  // out)") — wheel / trackpad-pinch is locomotion: pinch-out / wheel-up glides forward along the
  // facing, Shift multiplies. Trackpad pinch arrives as ctrl+wheel — same handler, preventDefault
  // stops the browser's page-zoom.
  var WHEEL_GLIDE_M = 1.2;         // metres per wheel notch
  var WHEEL_SPRINT_X = 4;          // Shift multiplier
  // §CPE_WALK_GAMEPAD_NAV (prompts/CPE_WALK_GAMEPAD_NAV.md) — standard-mapping controller as a THIRD
  // input device alongside WASD+mouse and wheel/pinch-glide, not a replacement for either. Right
  // stick is a RATE (deflection -> turn-rate, held constant while pushed), unlike MOUSE_SENSITIVITY
  // which is a per-pixel DELTA gain — different units, so this needs its own constant. Tuned to
  // "full deflection ≈ 120deg/sec" (2.0944 rad/sec) — fast enough to spin around in ~3s at full
  // push, slow enough at partial deflection (dead-zone .. 1.0) to still frame a shot precisely;
  // no real controller in this environment to feel-tune against (spec §VERIFY Q2 open item, deferred
  // to a live-controller pass), so this is a considered starting value, not a measured one.
  var GAMEPAD_LOOK_RATE = Math.PI * (120 / 180);   // rad/sec at full stick deflection
  var GAMEPAD_DEADZONE = 0.15;     // spec's own value — avoids drift from worn/imprecise sticks

  var _active = false;
  var _cpe = null;          // window.APP.cinemaPathEditor, cached at mount
  var _vfCam = null;
  var _canvas = null;
  var _keys = { w: false, a: false, s: false, d: false };
  var _yaw = 0, _pitch = 0;
  var _rafId = 0;
  var _lastT = 0;
  var _frame = 0;
  var _snapCount = 0;
  var _pointerLocked = false;
  var _freezeEl = null;
  var _tm = null;            // { panel, prevPointerEvents, lockedBtn } or null if TM was not touched
  var _nav = null;           // prior A.controls.enabled value, or null if OrbitControls was not touched
  var _handlers = null;      // DOM listeners installed at mount, removed at unmount
  // §CPE_WALK_SPAWN (2026-08-07, user: "SCRUB BAR IS NOT TO BE USED! WALK!!!" — after their Hospital
  // bug report proved a shoes press at the aerial pose plants a sky stick at s=0.000): the walk is
  // self-sufficient. First shoes press spawns at the WALK STRETCH's eye-level start; Esc keeps this
  // resume pose so the next shoes press continues exactly where the user stood (snap → review →
  // continue). Only closing B / the editor (forceStop) clears it.
  var _resumePose = null;    // { x,y,z, yaw, pitch } from the last stop(); null = spawn fresh
  // §CPE_WALK_SNAP_GUARD — duplicate-stick guard for the click (snap-and-keep-walking) gesture.
  var SNAP_MIN_MOVE_M = 1.5;   // walker must move this far before the next stick can plant
  var SNAP_DEBOUNCE_MS = 700;  // and at least this long after the previous plant
  var _lastSnap = null;        // { x,y,z, t } of the last PLANTED stick this walk session
  var _glideLogged = false;
  // §CPE_WALK_GAMEPAD_NAV — connect-gated, per the spec's "zero cost when unused": _tick() only
  // calls navigator.getGamepads() when this flag is true (set by a real gamepadconnected event),
  // never speculatively every frame on the chance a pad exists.
  var _gpConnected = false;
  var _gpIndex = null;
  var _gpFirstInputLogged = false;
  var _gpSnapWasDown = false;   // edge-detect so A button plants one stick per press, not per frame held
  var _gpStopWasDown = false;   // edge-detect so B/Start stops once per press

  // ══════════════════ §CPE_WALK_CANVAS_FREEZE — capture / recapture ══════════════════
  function _renderMainOnce() {
    var a = A();
    if (!a.renderer || !a.scene || !a.camera) return false;
    // Same 3-way branch main.js's own animate() already uses (main.js:905-907/923-925, read not
    // edited) so a direct call here matches whatever the normal loop would have drawn.
    if (a._giComposer && a._giComposerActive) a._giComposer.render();
    else if (a._composer && a._composerEnabled) a._composer.render();
    else a.renderer.render(a.scene, a.camera);
    return true;
  }
  function _vfPanelHoleRect(canvasRect) {
    var panel = document.getElementById('cpe-vf-panel');
    if (!panel) return null;
    var pr = panel.getBoundingClientRect();
    return { x: pr.left - canvasRect.left, y: pr.top - canvasRect.top, w: pr.width, h: pr.height };
  }
  // Builds (mount) or repaints (snap) the frozen backdrop. MUST be called immediately after
  // `_renderMainOnce()` in the same synchronous task — see the file-header comment on
  // `preserveDrawingBuffer:false`.
  function _captureFreeze() {
    var a = A(), canvas = a.canvas;
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!_freezeEl) {
      _freezeEl = document.createElement('canvas');
      _freezeEl.id = 'cpe-walk-freeze';
      // Below both CPE panels (#cpe-panel z-index 10000, #cpe-vf-panel 10001 — cinema_path_editor.js,
      // read not edited) and above the plain (non-positioned) WebGL canvas, which stacks at the base
      // regardless of z-index since it has none of its own (viewer.html:18 `#canvas{...}` no z-index).
      _freezeEl.style.cssText = 'position:fixed;z-index:9990;pointer-events:none';
      document.body.appendChild(_freezeEl);
    }
    _freezeEl.style.left = rect.left + 'px';
    _freezeEl.style.top = rect.top + 'px';
    _freezeEl.style.width = rect.width + 'px';
    _freezeEl.style.height = rect.height + 'px';
    _freezeEl.width = Math.max(1, Math.round(rect.width));
    _freezeEl.height = Math.max(1, Math.round(rect.height));
    var ctx = _freezeEl.getContext('2d');
    try { ctx.drawImage(canvas, 0, 0, _freezeEl.width, _freezeEl.height); }
    catch (e) { console.warn('§CPE_WALK_FREEZE_CAPTURE_FAIL ' + e.message); return _freezeEl; }
    var hole = _vfPanelHoleRect(rect);
    if (hole) ctx.clearRect(hole.x, hole.y, hole.w, hole.h);
    console.log('§CPE_WALK_FREEZE_CAPTURE w=' + _freezeEl.width + ' h=' + _freezeEl.height +
      ' hole=' + (hole ? JSON.stringify({ x: Math.round(hole.x), y: Math.round(hole.y), w: Math.round(hole.w), h: Math.round(hole.h) }) : 'none'));
    return _freezeEl;
  }
  function _dropFreeze() {
    if (_freezeEl && _freezeEl.parentNode) _freezeEl.parentNode.removeChild(_freezeEl);
    _freezeEl = null;
  }

  // ══════════════════ §CPE_WALK_TM_LOCK ══════════════════
  function _tmLock() {
    var panel = document.getElementById('time-machine-panel');
    if (!panel) { console.log('§CPE_WALK_TM_LOCK no TM panel — nothing to lock'); return null; }
    var fwd = document.getElementById('tm-fwd-btn'), rev = document.getElementById('tm-rev-btn');
    var playingBtn = (fwd && fwd.classList.contains('tm-active')) ? fwd
                    : (rev && rev.classList.contains('tm-active')) ? rev : null;
    var rec = { panel: panel, prevPointerEvents: panel.style.pointerEvents || '', lockedBtn: playingBtn };
    if (playingBtn) {
      // Same gesture the button's own listener already handles (time_machine.js:2902-2908, read not
      // edited) — startPlayback(dir) toggles OFF when called twice with the same dir.
      playingBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    }
    panel.style.pointerEvents = 'none';
    console.log('§CPE_WALK_TM_LOCK paused=' + (playingBtn ? playingBtn.id : 'none') +
      ' panel pointer-events=none');
    return rec;
  }
  function _tmUnlock(rec) {
    if (!rec) return;
    rec.panel.style.pointerEvents = rec.prevPointerEvents;
    if (rec.lockedBtn) rec.lockedBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    console.log('§CPE_WALK_TM_LOCK restored resumed=' + (rec.lockedBtn ? rec.lockedBtn.id : 'none') +
      ' panel pointer-events="' + rec.prevPointerEvents + '"');
  }

  // ══════════════════ §CPE_WALK_CTRL_DRAG_EXIT fix — same pause/restore shape as §CPE_WALK_TM_LOCK
  // above, applied to the main-view OrbitControls (`A.controls`, scene.js:143). Two real bugs shared
  // this one root cause (OrbitControls.module.js:1550 confirmed via git show origin/main, prompts/
  // CPE_POV_WALK_PATHING.md §CPE_WALK_CTRL_DRAG_EXIT 2026-08-08): (1) OrbitControls stays `enabled`
  // and live on the SAME canvas the whole walk, so its own pointerdown handler still runs and calls
  // `setPointerCapture` — forbidden while the pointer is locked, throwing InvalidStateError on every
  // click; (2) OrbitControls maps Ctrl+Left-drag to PAN (screenSpacePanning, the "move laterally /
  // upstairs" gesture users reach for from normal-nav muscle memory) — but Ctrl+Left-Click is ALSO
  // Chromium's cross-platform alternate context-menu trigger, and a context-menu request forces the
  // browser to auto-release Pointer Lock, which `_onLockChange` below then reads as "user pressed
  // Esc" and exits walk mode. Disabling `A.controls` for the duration removes bug (1) outright;
  // suppressing `contextmenu` on the canvas removes the unplanned-unlock path in (2). Ctrl-drag still
  // does nothing INSIDE walk mode after this — turning it into an actual pan/climb gesture there is a
  // separate, not-yet-specified feature (see the same prompts-file section), deliberately not invented
  // here.
  function _navLock() {
    var a = A();
    if (!a.controls) { console.log('§CPE_WALK_NAV_LOCK no A.controls — nothing to lock'); return null; }
    var rec = { prevEnabled: a.controls.enabled };
    a.controls.enabled = false;
    console.log('§CPE_WALK_NAV_LOCK OrbitControls disabled (was enabled=' + rec.prevEnabled + ')');
    return rec;
  }
  function _navUnlock(rec) {
    if (!rec) return;
    var a = A();
    if (a.controls) a.controls.enabled = rec.prevEnabled;
    console.log('§CPE_WALK_NAV_LOCK restored enabled=' + rec.prevEnabled);
  }

  // ══════════════════ pointer-lock mouse-look + WASD — pattern copied from
  // navigate_controls.js:28-56 (canvas.requestPointerLock, mousemove yaw/pitch with clamp,
  // pointerlockchange flag), adapted to drive `_vfCam` instead of the main nav camera. ══════════
  function _onMouseMove(e) {
    if (!_active || !_pointerLocked) return;
    _yaw -= e.movementX * MOUSE_SENSITIVITY;
    _pitch -= e.movementY * MOUSE_SENSITIVITY;
    _pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _pitch));
    _vfCam.rotation.set(_pitch, _yaw, 0);
  }
  function _onLockChange() {
    _pointerLocked = (document.pointerLockElement === _canvas);
    if (_active && !_pointerLocked) {
      // Lock lost outside our own stop() (Escape, alt-tab, OS focus change) — treat it as the exit
      // gesture, same as the spec's own "user may stop walk" framing.
      console.log('§CPE_WALK_LOCK_LOST exiting walk mode');
      stop();
    }
  }
  function _onKeyDown(e) {
    if (!_active) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd') { _keys[k] = true; e.preventDefault(); e.stopPropagation(); return; }
    // §CPE_WALK_ENTER_LOCK (2026-08-07, user: "besides ESC, perhaps Enter can be used to lock -
    // plant stick and set cam pov"): Enter = snap the stick (facing becomes its lookAt pin) AND
    // exit to review, one stroke. stop() runs after the snap so the resume pose IS the snapped
    // spot — the next shoes press continues exactly there. Click (mousedown while locked) stays
    // the snap-and-keep-walking gesture.
    // Spacebar is Enter's twin (user: "for finger dexterity") — same one-stroke plant+release.
    if (k === 'enter' || k === ' ') {
      e.preventDefault(); e.stopPropagation();
      var r = _doSnap();
      if (r) console.log('§CPE_WALK_ENTER_LOCK stick planted + walk released for review (resume pose kept) key=' + (k === ' ' ? 'space' : 'enter'));
      stop();
      return;
    }
    if (k === 'escape') { e.preventDefault(); e.stopPropagation(); stop(); return; }
  }
  function _onKeyUp(e) {
    if (!_active) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd') { _keys[k] = false; e.preventDefault(); e.stopPropagation(); }
  }
  function _onMouseDown(e) {
    if (!_active || !_pointerLocked || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    _doSnap();
  }
  function _onCanvasClick() {
    if (_active && !document.pointerLockElement) _canvas.requestPointerLock();
  }
  // §CPE_WALK_CTRL_DRAG_EXIT — Ctrl+Left-Click is Chromium's alternate context-menu trigger
  // (cross-platform, not Mac-only); left unsuppressed, that request forces the browser to release
  // Pointer Lock before the user's ctrl-drag even starts, which `_onLockChange` then reads as an
  // Esc-exit. Block it for the duration of walk mode only.
  function _onContextMenu(e) {
    if (_active) { e.preventDefault(); e.stopPropagation(); }
  }
  // §CPE_WALK_GLIDE — trackpad-first locomotion (user: "it is all mousepad movement... pivot, zoom
  // in/out"): two-finger scroll and pinch (which browsers deliver as ctrl+wheel) glide the walker
  // along the facing. Pinch-out / scroll-up (deltaY<0) = forward, Shift = ×WHEEL_SPRINT_X.
  // preventDefault matters twice: ctrl+wheel would otherwise page-zoom, plain wheel would scroll.
  function _onWheel(e) {
    if (!_active || !_vfCam) return;
    e.preventDefault(); e.stopPropagation();
    var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_vfCam.quaternion);
    var notches = -e.deltaY / 100;   // wheel notch ≈ 100; trackpads deliver finer-grained deltas
    var step = notches * WHEEL_GLIDE_M * (e.shiftKey ? WHEEL_SPRINT_X : 1);
    if (!step) return;
    _vfCam.position.addScaledVector(fwd, step);
    if (!_glideLogged) {
      _glideLogged = true;
      console.log('§CPE_WALK_GLIDE first glide step=' + step.toFixed(2) + 'm ctrl=' + !!e.ctrlKey +
        ' (pinch/scroll drives forward-back along facing; ' + WHEEL_GLIDE_M + 'm/notch, Shift ×' + WHEEL_SPRINT_X + ')');
    }
  }

  // ══════════════════ §CPE_WALK_GAMEPAD_NAV — pure axis/button -> motion mapping ══════════════════
  // Takes a PLAIN {axes, buttons}-shaped object, never calls navigator.getGamepads() itself — per
  // the spec's architecture note, this is what makes the maths unit-testable with synthetic data in
  // an environment with no physical controller attached (getGamepads() can't be faked from JS).
  // `mapping` is checked by the caller (gamepadconnected handler), NOT here, so this function stays
  // a pure number-in/number-out transform with no DOM/global dependency at all.
  function _gamepadMap(pad, dt) {
    var axes = (pad && pad.axes) || [];
    var buttons = (pad && pad.buttons) || [];
    var dz = GAMEPAD_DEADZONE;
    var az = function(v) { v = v || 0; return Math.abs(v) < dz ? 0 : v; };
    var lx = az(axes[0]), ly = az(axes[1]);   // left stick: move
    var rx = az(axes[2]), ry = az(axes[3]);   // right stick: look
    // move: right*axes[0] + fwd*-axes[1] — same convention as WASD's `move.add(right)`/`move.add(fwd)`
    // in _tick(), scaled by the SAME WALK_SPEED_MPS so keyboard/gamepad feel identical (spec's own
    // "no new speed constant" requirement).
    var moveRight = lx, moveFwd = -ly;
    var moveLen = Math.sqrt(moveRight * moveRight + moveFwd * moveFwd);
    if (moveLen > 1) { moveRight /= moveLen; moveFwd /= moveLen; moveLen = 1; }   // clamp diagonal to unit circle
    var moveMag = moveLen * WALK_SPEED_MPS * dt;
    var yawDelta = -rx * GAMEPAD_LOOK_RATE * dt;
    var pitchDelta = -ry * GAMEPAD_LOOK_RATE * dt;
    var btn = function(i) { var b = buttons[i]; return !!(b && (b.pressed || b === true)); };
    return {
      moveRight: moveRight * moveMag, moveFwd: moveFwd * moveMag,   // metres this frame, world-relative-to-facing
      yawDelta: yawDelta, pitchDelta: pitchDelta,                   // radians this frame
      snap: btn(0),                                                 // A button -> _doSnap()
      stop: btn(1) || btn(9),                                       // B or Start -> stop()
      active: moveLen > 0 || rx !== 0 || ry !== 0 || btn(0) || btn(1) || btn(9)
    };
  }
  function _onGamepadConnected(e) {
    var gp = e.gamepad;
    if (!gp) return;
    if (gp.mapping !== 'standard') {
      console.log('§CPE_WALK_GAMEPAD_IGNORED id="' + gp.id + '" mapping="' + (gp.mapping || '(none)') +
        '" — v1 only supports standard-mapping controllers (spec CPE_WALK_GAMEPAD_NAV.md §Scope), skipping');
      return;
    }
    _gpConnected = true;
    _gpIndex = gp.index;
    _gpFirstInputLogged = false;
    console.log('§CPE_WALK_GAMEPAD_CONNECT id="' + gp.id + '" mapping="' + gp.mapping + '" index=' + gp.index +
      ' axes=' + gp.axes.length + ' buttons=' + gp.buttons.length);
  }
  function _onGamepadDisconnected(e) {
    var gp = e.gamepad;
    if (!gp || gp.index !== _gpIndex) return;
    _gpConnected = false;
    _gpIndex = null;
    console.log('§CPE_WALK_GAMEPAD_DISCONNECT id="' + gp.id + '" index=' + gp.index);
  }

  // ══════════════════ the per-frame walk loop — see §CPE_WALK_CANVAS_FREEZE header comment for
  // why this NEVER calls A.markDirty() ══════════════════
  function _tick(tNow) {
    if (!_active) return;
    _rafId = requestAnimationFrame(_tick);
    var dt = _lastT ? Math.min(MAX_DT, (tNow - _lastT) / 1000) : 0;
    _lastT = tNow;
    var right = new THREE.Vector3(1, 0, 0).applyQuaternion(_vfCam.quaternion);
    var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_vfCam.quaternion);
    var move = new THREE.Vector3();
    if (_keys.w) move.add(fwd);
    if (_keys.s) move.sub(fwd);
    if (_keys.d) move.add(right);
    if (_keys.a) move.sub(right);
    if (move.lengthSq() > 0 && dt > 0) {
      move.normalize().multiplyScalar(WALK_SPEED_MPS * dt);
      _vfCam.position.add(move);
    }
    // §CPE_WALK_GAMEPAD_NAV — alternate input, applied additively to the SAME right/fwd/_yaw/_pitch
    // state WASD+mouse-look already drive (no separate camera path). Only polls getGamepads() when a
    // gamepadconnected event has actually fired (_gpConnected) — see file-header cost note.
    if (_gpConnected && dt > 0 && navigator.getGamepads) {
      var pad = navigator.getGamepads()[_gpIndex];
      if (pad) {
        var gm = _gamepadMap(pad, dt);
        if (gm.moveRight || gm.moveFwd) {
          _vfCam.position.addScaledVector(right, gm.moveRight);
          _vfCam.position.addScaledVector(fwd, gm.moveFwd);
        }
        if (gm.yawDelta || gm.pitchDelta) {
          _yaw += gm.yawDelta;
          _pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _pitch + gm.pitchDelta));
          _vfCam.rotation.set(_pitch, _yaw, 0);
        }
        if (gm.active && !_gpFirstInputLogged) {
          _gpFirstInputLogged = true;
          console.log('§CPE_WALK_GAMEPAD_FIRST_INPUT moveRight=' + gm.moveRight.toFixed(3) + ' moveFwd=' + gm.moveFwd.toFixed(3) +
            ' yawDelta=' + gm.yawDelta.toFixed(4) + ' pitchDelta=' + gm.pitchDelta.toFixed(4) +
            ' snap=' + gm.snap + ' stop=' + gm.stop);
        }
        // Edge-triggered: _doSnap()/stop() fire once per press, not once per frame held.
        if (gm.snap && !_gpSnapWasDown) { _gpSnapWasDown = true; _doSnap(); }
        else if (!gm.snap) { _gpSnapWasDown = false; }
        if (gm.stop && !_gpStopWasDown) { _gpStopWasDown = true; stop(); return; }
        else if (!gm.stop) { _gpStopWasDown = false; }
      }
    }
    _vfCam.updateMatrixWorld(true);
    var a = A();
    if (a._cpeViewfinderRender) a._cpeViewfinderRender();   // B only — see header comment
    _frame++;
    if (_frame % LOG_EVERY_N_FRAMES === 0) {
      console.log('§CPE_WALK_POSE frame=' + _frame +
        ' pos=(' + _vfCam.position.x.toFixed(2) + ',' + _vfCam.position.y.toFixed(2) + ',' + _vfCam.position.z.toFixed(2) + ')' +
        ' yaw=' + (_yaw * 180 / Math.PI).toFixed(1) + 'deg pitch=' + (_pitch * 180 / Math.PI).toFixed(1) + 'deg');
    }
  }

  // ══════════════════ snap action — the one new maths piece lives in cinema_path_editor.js's
  // `_walkSnap`; this only gathers the walked pose and hands it over. ══════════════════
  function _doSnap() {
    if (!_active || !_cpe || !_vfCam) return null;
    var pos = { x: _vfCam.position.x, y: _vfCam.position.y, z: _vfCam.position.z };
    // §CPE_WALK_SNAP_GUARD (2026-08-08, user: "i accidentally hit multi sticks at a single spot
    // because i have not exited the walk mode... one cheap way is to auto ESC when the user clicks
    // on the stick he just landed") — the click gesture plants WITHOUT exiting, so clicking the
    // just-landed stick on the frozen backdrop planted a DUPLICATE at the same spot. Three-way
    // resolution on a repeat click, all decided from the walker's own numbers (under pointer lock
    // the crosshair IS where you stand — no cursor position exists to hit-test):
    //   1. within the debounce window        → a double-click bounce; swallow it, stay walking;
    //   2. later, but still at the same spot → the user is clicking AT the stick they just planted
    //      = the user's own auto-Esc: exit to review, plant nothing;
    //   3. moved a real distance             → a genuine next stick; plant and keep walking.
    var now = performance.now();
    if (_lastSnap) {
      var dLast = Math.hypot(pos.x - _lastSnap.x, pos.y - _lastSnap.y, pos.z - _lastSnap.z);
      if ((now - _lastSnap.t) < SNAP_DEBOUNCE_MS) {
        console.log('§CPE_WALK_SNAP_GUARD bounce swallowed dtMs=' + (now - _lastSnap.t).toFixed(0) +
          ' (min ' + SNAP_DEBOUNCE_MS + ') — still walking');
        return null;
      }
      if (dLast < SNAP_MIN_MOVE_M) {
        console.log('§CPE_WALK_SNAP_GUARD auto-Esc: repeat click at the just-planted stick (dist=' +
          dLast.toFixed(2) + 'm < ' + SNAP_MIN_MOVE_M + 'm) — exiting walk to review, nothing planted');
        stop();
        return null;
      }
    }
    var fwdV = new THREE.Vector3(0, 0, -1).applyQuaternion(_vfCam.quaternion);
    var fwd = { x: fwdV.x, y: fwdV.y, z: fwdV.z };
    var t0 = performance.now();
    var res = _cpe._walkSnap(pos, fwd);
    var ms = performance.now() - t0;
    if (!res) { console.warn('§CPE_WALK_SNAP_FAIL pos=(' + pos.x.toFixed(2) + ',' + pos.y.toFixed(2) + ',' + pos.z.toFixed(2) + ') — no flown path to snap onto yet'); return null; }
    // t is stamped AFTER the plant below completes (see the end of this function) — the debounce
    // window must start when the user can SEE the result, not at click time: the replan + wow
    // repaint between the two can exceed the window on slow renderers.
    _lastSnap = { x: pos.x, y: pos.y, z: pos.z, t: now };
    _snapCount++;
    console.log('§CPE_WALK_SNAP_RESULT n=' + _snapCount + ' bandIndex=' + res.bandIndex + ' s=' + res.s.toFixed(3) +
      ' centre=(' + res.centre.x.toFixed(2) + ',' + res.centre.y.toFixed(2) + ',' + res.centre.z.toFixed(2) + ')' +
      ' lookAt=' + (res.lookAt ? '(' + res.lookAt.x.toFixed(2) + ',' + res.lookAt.y.toFixed(2) + ',' + res.lookAt.z.toFixed(2) + ')' : 'none') +
      ' replanMs=' + (res.replanMs != null ? res.replanMs.toFixed(0) : '?') + ' snapCallMs=' + ms.toFixed(1));
    // §CPE_WALK_SNAP_WOW — replan already ran inside _walkSnap (via _replanFilm/_redrawScene). One
    // extra main repaint + re-capture, in the SAME task as that render, so the frozen backdrop shows
    // the new stick + re-snaked pipe the instant it lands — noise on top of the 0.3-1.2s replan the
    // spec already budgets for this.
    if (_renderMainOnce()) _captureFreeze();
    // §CPE_WALK_SNAP_GUARD — re-stamp now that the replan + wow repaint are done (see the comment
    // at the _lastSnap assignment above).
    if (_lastSnap) _lastSnap.t = performance.now();
    return res;
  }

  // ══════════════════ mount / unmount ══════════════════
  function start() {
    if (_active) return true;
    var cpe = A() && A().cinemaPathEditor;
    if (!cpe) { console.warn('§CPE_WALK_START_FAIL cinemaPathEditor not open'); return false; }
    var vf = cpe._probeVF ? cpe._probeVF() : null;
    if (!vf) { console.warn('§CPE_WALK_START_FAIL editor has no open path to walk'); return false; }
    if (!vf.on) { cpe._vfToggle(); }   // §CPE_WALK_EDIT_V1 spec: "B must be on"
    var vfCam = cpe.activePOVCamera();
    if (!vfCam) { console.warn('§CPE_WALK_START_FAIL viewfinder camera unavailable after turning B on'); return false; }
    var canvas = A().canvas;
    if (!canvas) { console.warn('§CPE_WALK_START_FAIL no canvas'); return false; }

    _cpe = cpe; _vfCam = vfCam; _canvas = canvas;
    // §CPE_WALK_SPAWN / §CPE_WALK_SCRUB_SPAWN — spawn priority:
    //   1. resume pose, IF the scrub has not moved since the last walk stopped (continue in place);
    //   2. a scrub sitting inside the walk stretch (user's optional accelerator: "bring further
    //      along the path, then began the stick planting");
    //   3. the walk stretch's start (the self-sufficient default — never the aerial dive pose).
    var _scrubNow = cpe._walkScrubTn ? cpe._walkScrubTn() : 0;
    if (_resumePose && _resumePose.scrubTn !== undefined && _scrubNow !== _resumePose.scrubTn) {
      console.log('§CPE_WALK_SPAWN scrub moved since last walk (' + _resumePose.scrubTn.toFixed(3) +
        ' -> ' + _scrubNow.toFixed(3) + ') — user chose a new start, resume dropped');
      _resumePose = null;
    }
    if (_resumePose) {
      _vfCam.position.set(_resumePose.x, _resumePose.y, _resumePose.z);
    } else if (cpe._walkSpawnPose) {
      var sp = cpe._walkSpawnPose();
      if (sp) console.log('§CPE_WALK_SPAWN ' + (sp.scrubbed ? 'scrubbed' : 'walk-start') + ' tn=' + sp.tn.toFixed(3) +
        ' pos=(' + sp.x.toFixed(2) + ',' + sp.y.toFixed(2) + ',' + sp.z.toFixed(2) +
        (sp.scrubbed ? ') — spawning at the scrubbed path point (accelerator)' :
                       ') — start of the authorable stretch (self-sufficient default)'));
    }
    _vfCam.rotation.reorder && _vfCam.rotation.reorder('XYZ');
    _yaw = _vfCam.rotation.y; _pitch = _vfCam.rotation.x;
    if (_resumePose) {
      _yaw = _resumePose.yaw; _pitch = _resumePose.pitch;
      _vfCam.rotation.set(_pitch, _yaw, 0);
      console.log('§CPE_WALK_SPAWN resume pos=(' + _resumePose.x.toFixed(2) + ',' + _resumePose.y.toFixed(2) +
        ',' + _resumePose.z.toFixed(2) + ') yaw=' + (_yaw * 180 / Math.PI).toFixed(1) +
        'deg pitch=' + (_pitch * 180 / Math.PI).toFixed(1) + 'deg — continuing where the last walk stopped');
    }
    _keys = { w: false, a: false, s: false, d: false };
    _frame = 0; _snapCount = 0; _lastT = 0;
    // §CPE_WALK_GAMEPAD_NAV — a pad already connected BEFORE this mount (event fired while walk mode
    // was closed) still needs picking up: gamepadconnected only fires once, at physical connect time.
    _gpFirstInputLogged = false; _gpSnapWasDown = false; _gpStopWasDown = false;
    if (!_gpConnected && navigator.getGamepads) {
      var _existing = navigator.getGamepads();
      for (var _gi = 0; _existing && _gi < _existing.length; _gi++) {
        if (_existing[_gi]) { _onGamepadConnected({ gamepad: _existing[_gi] }); break; }
      }
    }

    // Seam 2 — the ONLY caller of _wire()/_unwire() this feature needed.
    cpe._walkMount();

    _tm = _tmLock();
    _nav = _navLock();

    if (!_renderMainOnce()) console.warn('§CPE_WALK_FREEZE_SKIP renderer unavailable, walking without a frozen backdrop');
    _captureFreeze();

    _handlers = {
      mousemove: _onMouseMove, lockchange: _onLockChange, keydown: _onKeyDown, keyup: _onKeyUp,
      mousedown: _onMouseDown, click: _onCanvasClick, wheel: _onWheel, contextmenu: _onContextMenu,
      gamepadconnected: _onGamepadConnected, gamepaddisconnected: _onGamepadDisconnected
    };
    document.addEventListener('mousemove', _handlers.mousemove, true);
    document.addEventListener('pointerlockchange', _handlers.lockchange, true);
    window.addEventListener('keydown', _handlers.keydown, true);
    window.addEventListener('keyup', _handlers.keyup, true);
    canvas.addEventListener('mousedown', _handlers.mousedown, true);
    canvas.addEventListener('click', _handlers.click, true);
    canvas.addEventListener('contextmenu', _handlers.contextmenu, true);
    // §CPE_WALK_GLIDE — passive:false so preventDefault can stop ctrl+wheel page-zoom (trackpad pinch)
    window.addEventListener('wheel', _handlers.wheel, { capture: true, passive: false });
    // §CPE_WALK_GAMEPAD_NAV — mount/unmount scoped like every other listener here (spec: "gated the
    // same way _tick() already gates on _active"); _tick()'s own getGamepads() poll additionally
    // gates on _gpConnected, so this costs nothing until a real pad both connects AND walk is open.
    window.addEventListener('gamepadconnected', _handlers.gamepadconnected, true);
    window.addEventListener('gamepaddisconnected', _handlers.gamepaddisconnected, true);

    _active = true;
    _syncButton();
    canvas.requestPointerLock();   // synchronous within this click's call stack — a real user gesture
    _rafId = requestAnimationFrame(_tick);
    console.log('§CPE_WALK_MOUNT_DONE pos=(' + _vfCam.position.x.toFixed(2) + ',' + _vfCam.position.y.toFixed(2) +
      ',' + _vfCam.position.z.toFixed(2) + ') yaw=' + (_yaw * 180 / Math.PI).toFixed(1) +
      'deg pitch=' + (_pitch * 180 / Math.PI).toFixed(1) + 'deg — WASD + mouse-look live, main view frozen, B renders alone');
    return true;
  }

  function stop() {
    if (!_active) return true;
    _active = false;
    // §CPE_WALK_SPAWN — remember where the walk stopped so the next shoes press CONTINUES here
    // (snap → Esc review → shoes → next stick, no re-navigation). Cleared only by forceStop
    // (eye-off / editor close), where the path context that made this pose meaningful is gone.
    if (_vfCam) _resumePose = { x: _vfCam.position.x, y: _vfCam.position.y, z: _vfCam.position.z,
                                yaw: _yaw, pitch: _pitch,
                                // §CPE_WALK_SCRUB_SPAWN — the scrub value at stop time; a DIFFERENT
                                // value at the next start means the user scrubbed meanwhile = chose
                                // a new spawn (scrub beats resume, untouched scrub keeps resume).
                                scrubTn: (_cpe && _cpe._walkScrubTn) ? _cpe._walkScrubTn() : 0 };
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
    if (_handlers) {
      document.removeEventListener('mousemove', _handlers.mousemove, true);
      document.removeEventListener('pointerlockchange', _handlers.lockchange, true);
      window.removeEventListener('keydown', _handlers.keydown, true);
      window.removeEventListener('keyup', _handlers.keyup, true);
      if (_canvas) {
        _canvas.removeEventListener('mousedown', _handlers.mousedown, true);
        _canvas.removeEventListener('click', _handlers.click, true);
        _canvas.removeEventListener('contextmenu', _handlers.contextmenu, true);
      }
      window.removeEventListener('wheel', _handlers.wheel, { capture: true });
      window.removeEventListener('gamepadconnected', _handlers.gamepadconnected, true);
      window.removeEventListener('gamepaddisconnected', _handlers.gamepaddisconnected, true);
      _handlers = null;
    }
    _gpConnected = false; _gpIndex = null;
    if (document.pointerLockElement === _canvas && document.exitPointerLock) document.exitPointerLock();
    _dropFreeze();
    _tmUnlock(_tm); _tm = null;
    _navUnlock(_nav); _nav = null;
    // Seam 2's other half — restores the stick editor's own listeners.
    if (_cpe && _cpe._walkUnmount) _cpe._walkUnmount();
    console.log('§CPE_WALK_UNMOUNT_DONE snaps=' + _snapCount + ' frames=' + _frame +
      ' — freeze dropped, TM restored, stick editor re-wired, one markDirty repaint queued');
    _cpe = null; _vfCam = null; _canvas = null;
    _syncButton();
    return true;
  }

  function _syncButton() {
    var btn = document.getElementById('cpe-walk-toggle');
    if (!btn) return;
    // §CPE_WALK_SHOES_BTN: the button is the Lucide footprints SVG on B's frame header now
    // (stroke:currentColor) — active state is the color swap alone; never write textContent here,
    // that would erase the icon markup.
    btn.style.color = _active ? '#4fc3f7' : '#888';
    btn.style.borderColor = _active ? '#4fc3f7' : '#4a4f57';
    btn.title = _active ? 'walking — Esc or click to stop; Enter/click on the scene snaps a stick'
                        : 'walk this POV: mouse-look + WASD; click or Enter snaps a stick where you stand and face (Esc or click again to stop)';
  }

  function toggle() { return _active ? stop() : start(); }

  window.CpeWalk = {
    toggle: toggle,
    isActive: function() { return _active; },
    // §CPE_WALK_SPAWN — external stops (eye-off, editor close) also clear the resume pose: the
    // walk context is gone, the next session must spawn fresh at the walk stretch's start.
    // §CPE_WALK_SNAP_GUARD — same lifetime: the duplicate-stick memory belongs to this editor
    // context; a fresh editor session starts unguarded.
    forceStop: function() { _resumePose = null; _lastSnap = null; return stop(); },
    // ══ witness hooks — read-only or exercising the REAL internal function, same precedent
    // cinema_path_editor.js's own `_probe*`/`_*ForTest` hooks already use (e.g. `_setPin`,
    // `_spawnStickForTest`) — never a re-implementation of the maths under test.
    _snapForTest: function(pos, fwd) {
      // Drives the exact code path `_doSnap()` uses, but with a SYNTHETIC pose/facing instead of
      // reading `_vfCam` — deterministic, no live pointer-lock/rAF session required.
      if (!_cpe) return null;
      return _cpe._walkSnap(pos, fwd);
    },
    // §CPE_WALK_SNAP_GUARD witness hook — runs the REAL guarded _doSnap() (guard included), unlike
    // _snapForTest above which bypasses the guard on purpose (synthetic geometry tests need
    // arbitrary repeated positions). Requires a mounted walk; snaps at the live _vfCam pose.
    _doSnapForTest: function() { return _doSnap(); },
    _poseForTest: function() { return _vfCam ? { x: _vfCam.position.x, y: _vfCam.position.y, z: _vfCam.position.z, yaw: _yaw, pitch: _pitch } : null; },
    _setPoseForTest: function(pos, yaw, pitch) {
      if (!_vfCam) return false;
      _vfCam.position.set(pos.x, pos.y, pos.z);
      _yaw = yaw; _pitch = pitch;
      _vfCam.rotation.set(pitch, yaw, 0);
      _vfCam.updateMatrixWorld(true);
      return true;
    },
    _tmLockState: function() { return _tm ? { locked: true, lockedBtn: _tm.lockedBtn ? _tm.lockedBtn.id : null, prevPointerEvents: _tm.prevPointerEvents } : { locked: false }; },
    _freezeElId: function() { return _freezeEl ? _freezeEl.id : null; },
    // §CPE_WALK_GAMEPAD_NAV — exercises the REAL pure mapping function with a SYNTHETIC {axes,
    // buttons} pad, same precedent as _snapForTest above. This is the ONLY witnessable numeric
    // surface for gamepad input in an environment with no physical controller (navigator.getGamepads()
    // cannot be faked from JS — spec's own architecture note).
    _gamepadMapForTest: function(pad, dt) { return _gamepadMap(pad, dt); },
    _gamepadStateForTest: function() { return { connected: _gpConnected, index: _gpIndex }; },
    // Drives the connect/disconnect handlers directly with a synthetic Gamepad-shaped object — lets a
    // witness prove the mapping-gate (ignore non-standard) and the connect log without real hardware.
    _gamepadConnectForTest: function(gp) { _onGamepadConnected({ gamepad: gp }); },
    _gamepadDisconnectForTest: function(gp) { _onGamepadDisconnected({ gamepad: gp }); }
  };
  console.log('§CPE_WALK_MODULE_LOADED');
})();
