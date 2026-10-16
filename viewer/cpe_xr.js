/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_xr.js — §CPE_WALK_WEBXR_VR (prompts/CPE_WALK_WEBXR_VR.md). STOPGAP FLAG-PLANT, not a
// finished feature (spec's own "Intent" section) — no headset/gamepad has been tested against.
// Feature detection + session lifecycle are real and wired. Controller locomotion and the
// rig-vs-camera pose read are INTENTIONAL stubs (spec §VERIFY 1 and 3) — guessing them would land
// VR snaps silently at the wrong place, worse than an honest gap. No headset in this environment,
// so session lifecycle (sessionstart/sessionend/_xrTick) is verified by code review + load/syntax
// checks only, not a live session.
(function() {
  'use strict';

  function A() { return window.APP; }

  function isSupported() {
    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') return Promise.resolve(false);
    return navigator.xr.isSessionSupported('immersive-vr').catch(function() { return false; });
  }

  var _session = null;

  // Real per-frame render call — same renderer/scene/camera main.js's idle-park loop uses (spec's
  // "render-loop conflict: non-issue" finding). With renderer.xr.enabled=true, Three.js swaps in
  // the tracked XR camera internally; the passed camera is the reference object (standard WebXR
  // boilerplate pattern), matching cpe_walk.js's own _renderMainOnce() precedent of calling render
  // directly from an independent rAF-equivalent loop.
  function _xrTick(timestamp, frame) {
    var a = A();
    if (!a || !a.renderer || !a.scene || !a.camera) return;
    a.renderer.render(a.scene, a.camera);
  }

  function _onSessionEnd() {
    var a = A();
    if (a && a.renderer) {
      a.renderer.setAnimationLoop(null);
      a.renderer.xr.enabled = false;
    }
    _session = null;
    console.log('§CPE_XR_SESSION_END');
    // Hand back to main.js's idle-park loop. APP.markDirty() (main.js:693) is the real public
    // entry point — sets _needsRender and calls the internal _startLoop() — same call cpe_walk.js's
    // own stop() relies on to resume main-view rendering after an independent render loop ends.
    if (a && a.markDirty) a.markDirty();
  }

  // Requires a real trusted user gesture — navigator.xr.requestSession() rejects on a synthetic
  // click, same constraint pointer-lock already hits in cpe_walk.js. Only call from a real click.
  function enter() {
    var a = A();
    if (!a || !a.renderer || !navigator.xr) return;
    navigator.xr.requestSession('immersive-vr').then(function(session) {
      _session = session;
      session.addEventListener('end', _onSessionEnd);
      a.renderer.xr.enabled = true;
      a.renderer.xr.setSession(session).then(function() {
        a.renderer.setAnimationLoop(_xrTick);
        console.log('§CPE_XR_SESSION_START');
      });
    }, function(err) {
      console.warn('§CPE_XR_REQUEST_FAIL ' + (err && err.message));
    });
  }

  // ══ STUBS below — each blocks on an open §VERIFY question in the spec that needs a real
  // headset/controller to answer. Do not fill in with a guess. ══

  var _stubWarned = false;
  // Same {axes,buttons}-in shape as cpe_walk.js's _gamepadMap(pad, dt) — XRInputSource.gamepad is
  // Gamepad-shaped, so this COULD reuse it directly, except xr-standard mapping's axis order is not
  // confirmed to match the "standard" mapping _gamepadMap assumes (spec §VERIFY 1). No real
  // controller here to check, so: no-op, honestly.
  function _xrControllerMap(inputSource, dt) {
    if (!_stubWarned) {
      console.warn('§CPE_XR_CONTROLLER_STUB not yet mapped — no locomotion from VR controllers yet, headset pose tracking works, controller input does not');
      _stubWarned = true;
    }
    return { moveRight: 0, moveFwd: 0, yawDelta: 0, pitchDelta: 0, snap: false, stop: false };
  }

  // Spec §VERIFY 3: does WebXR move the camera directly, or a parent "rig" Object3D it's tracked
  // under? Reading the wrong one silently lands a snap at the wrong world position — the sharpest
  // risk this spec names. Returns null; called from nowhere until a real session answers this.
  function _xrReadWorldPose() {
    return null;
  }

  window.CpeXr = {
    isSupported: isSupported,
    enter: enter,
    isActive: function() { return !!_session; },
    _xrTick: _xrTick,
    _xrControllerMap: _xrControllerMap,
    _xrReadWorldPose: _xrReadWorldPose
  };
  console.log('§CPE_XR_MODULE_LOADED');
})();
