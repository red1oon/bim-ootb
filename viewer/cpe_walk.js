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
  var _handlers = null;      // DOM listeners installed at mount, removed at unmount

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
    if (k === 'enter') { e.preventDefault(); e.stopPropagation(); _doSnap(); return; }
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
    var fwdV = new THREE.Vector3(0, 0, -1).applyQuaternion(_vfCam.quaternion);
    var fwd = { x: fwdV.x, y: fwdV.y, z: fwdV.z };
    var t0 = performance.now();
    var res = _cpe._walkSnap(pos, fwd);
    var ms = performance.now() - t0;
    if (!res) { console.warn('§CPE_WALK_SNAP_FAIL pos=(' + pos.x.toFixed(2) + ',' + pos.y.toFixed(2) + ',' + pos.z.toFixed(2) + ') — no flown path to snap onto yet'); return null; }
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
    // Start facing where B already faces (whatever pose the eye/scrub last set), not a hard reset —
    // continuing the walk from what the user was already looking at.
    _vfCam.rotation.reorder && _vfCam.rotation.reorder('XYZ');
    _yaw = _vfCam.rotation.y; _pitch = _vfCam.rotation.x;
    _keys = { w: false, a: false, s: false, d: false };
    _frame = 0; _snapCount = 0; _lastT = 0;

    // Seam 2 — the ONLY caller of _wire()/_unwire() this feature needed.
    cpe._walkMount();

    _tm = _tmLock();

    if (!_renderMainOnce()) console.warn('§CPE_WALK_FREEZE_SKIP renderer unavailable, walking without a frozen backdrop');
    _captureFreeze();

    _handlers = {
      mousemove: _onMouseMove, lockchange: _onLockChange, keydown: _onKeyDown, keyup: _onKeyUp,
      mousedown: _onMouseDown, click: _onCanvasClick
    };
    document.addEventListener('mousemove', _handlers.mousemove, true);
    document.addEventListener('pointerlockchange', _handlers.lockchange, true);
    window.addEventListener('keydown', _handlers.keydown, true);
    window.addEventListener('keyup', _handlers.keyup, true);
    canvas.addEventListener('mousedown', _handlers.mousedown, true);
    canvas.addEventListener('click', _handlers.click, true);

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
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
    if (_handlers) {
      document.removeEventListener('mousemove', _handlers.mousemove, true);
      document.removeEventListener('pointerlockchange', _handlers.lockchange, true);
      window.removeEventListener('keydown', _handlers.keydown, true);
      window.removeEventListener('keyup', _handlers.keyup, true);
      if (_canvas) {
        _canvas.removeEventListener('mousedown', _handlers.mousedown, true);
        _canvas.removeEventListener('click', _handlers.click, true);
      }
      _handlers = null;
    }
    if (document.pointerLockElement === _canvas && document.exitPointerLock) document.exitPointerLock();
    _dropFreeze();
    _tmUnlock(_tm); _tm = null;
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
    btn.style.color = _active ? '#4fc3f7' : '#888';
    btn.style.borderColor = _active ? '#4fc3f7' : '#4a4f57';
    btn.textContent = _active ? 'walking…' : 'walk';
  }

  function toggle() { return _active ? stop() : start(); }

  window.CpeWalk = {
    toggle: toggle,
    isActive: function() { return _active; },
    forceStop: stop,
    // ══ witness hooks — read-only or exercising the REAL internal function, same precedent
    // cinema_path_editor.js's own `_probe*`/`_*ForTest` hooks already use (e.g. `_setPin`,
    // `_spawnStickForTest`) — never a re-implementation of the maths under test.
    _snapForTest: function(pos, fwd) {
      // Drives the exact code path `_doSnap()` uses, but with a SYNTHETIC pose/facing instead of
      // reading `_vfCam` — deterministic, no live pointer-lock/rAF session required.
      if (!_cpe) return null;
      return _cpe._walkSnap(pos, fwd);
    },
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
    _freezeElId: function() { return _freezeEl ? _freezeEl.id : null; }
  };
  console.log('§CPE_WALK_MODULE_LOADED');
})();
