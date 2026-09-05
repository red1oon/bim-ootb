// ⚠ DO NOT REMOVE — §SUN_ARC_FILL / §BAKE_FILL_PIN page tap (2026-09-05, bim-compiler
// prompts/MEP_CLASH_REVEAL_MOVIE.md "Second open question" — the interior fill pinned to the Alt+S
// baseline on every frame of the §SUN_ARC noon→dusk bake). Installed by `cli_silent_bake.js --tap` at
// document start; driven by viewer/tests/witness_sun_arc_fill.js, which prepends
// `window.__SUN_ARC_FILL_PIN_OFF = true;` for the BEFORE run (A._sunArcFillPin replaced by a no-op —
// the bake runs exactly as it would without the pin) and nothing for the AFTER run. Read the log
// after every run.
//
// Scope, per frame of the REAL bake loop, at the capture moment (_captureFrame's own drawImage of
// renderer.domElement): record the lighting state the frame was rendered with — ambient / hemi /
// _nightPLScale / point-light budget + near-fade floor / lit pool slots, the staged baseline those
// are pinned to, and the sun's intensity, position, target, shadow camera, shadow matrix and a hash
// of the shadow-map BYTES — then hand it back through window.__maxqTapReport() as § lines + rows.
// Reads real object state only. Nothing here writes sun/shadow state; the only write is the
// pin-off replacement, and only when asked for.
(function () {
  'use strict';
  var T = window.__saf = { frames: [], cur: null, installed: false, err: [], pinOff: !!window.__SUN_ARC_FILL_PIN_OFF, pinReplaced: false, pinCallsSwallowed: 0 };
  var prevTap = window.__maxqPoseTap;

  window.__maxqPoseTap = function (i, x, y, z, tx, ty, tz) {
    if (prevTap) try { prevTap.apply(null, arguments); } catch (e) {}
    try { install(); } catch (e) { T.err.push('install ' + e.message); }
    T.cur = { i: i, planPose: [x, y, z, tx, ty, tz].map(function (n) { return +n.toFixed(4); }), captured: false };
  };

  function install() {
    var A = window.APP;
    if (T.installed || !A || !A.renderer) return;
    T.installed = true;
    // BEFORE run: the pin is a no-op — the frame's fill is whatever the shipped staging left it at
    if (T.pinOff && !T.pinReplaced) {
      A._sunArcFillPin = function () { T.pinCallsSwallowed++; return null; };
      T.pinReplaced = true;
    }
    var ctxP = window.CanvasRenderingContext2D.prototype, di = ctxP.drawImage;
    ctxP.drawImage = function (src) {
      if (src === A.renderer.domElement && T.cur && !T.cur.captured) { try { finalize(); } catch (e) { T.err.push('finalize ' + e.message); } }
      return di.apply(this, arguments);
    };
  }

  function fnv(buf) {
    var h = 0x811c9dc5 | 0;
    for (var i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  function shadowHash(A) {
    var sm = A.sun && A.sun.shadow && A.sun.shadow.map;
    if (!sm) return { hash: null, note: 'no shadow map' };
    var w = sm.width, h = sm.height, n = w * h * 4;
    if (!T.buf || T.buf.length !== n) T.buf = new Uint8Array(n);
    T.buf.fill(0);
    var note = 'fmt=' + (sm.texture && sm.texture.format) + ' type=' + (sm.texture && sm.texture.type) + ' ' + w + 'x' + h;
    try { A.renderer.readRenderTargetPixels(sm, 0, 0, w, h, T.buf); } catch (e) { return { hash: null, note: note + ' readback threw ' + e.message }; }
    var nz = 0; for (var i = 0; i < n; i += 4099) if (T.buf[i]) { nz++; if (nz > 3) break; }
    if (!nz) return { hash: null, note: note + ' readback all-zero (format not readable) — parameter series only' };
    return { hash: fnv(T.buf), note: note };
  }

  function finalize() {
    var A = window.APP, F = T.cur; F.captured = true;
    var s = A.sun, sc = s && s.shadow && s.shadow.camera, sm = s && s.shadow && s.shadow.matrix;
    var pool = A._nightBakePool || A._nightLights || [], lit = 0, sum = 0;
    for (var i = 0; i < pool.length; i++) if (pool[i].intensity > 0) { lit++; sum += pool[i].intensity; }
    var sh = shadowHash(A), base = A._photoFillBase || null;
    var row = {
      i: F.i, pinOff: T.pinOff, planPose: F.planPose,
      cam: [A.camera.position.x, A.camera.position.y, A.camera.position.z, A.controls.target.x, A.controls.target.y, A.controls.target.z].map(function (n) { return +n.toFixed(4); }),
      elevation: A._sunArcElevationDeg == null ? null : +(+A._sunArcElevationDeg).toFixed(4),
      ambient: +A.ambient.intensity.toFixed(6), hemi: +A.hemi.intensity.toFixed(6),
      plScale: +(+A._nightPLScale).toFixed(6), budget: A._nightMaxLights, nearFloor: A._nightNearFadeFloor,
      poolLit: lit, poolSum: +sum.toFixed(4), poolSize: pool.length, fixtures: (A._nightFixtures || []).length,
      baseAmbient: base ? +(+base.ambI).toFixed(6) : null, baseHemi: base ? +(+base.hemiI).toFixed(6) : null,
      plStaged: (typeof A._nightPLScaleStaged === 'number') ? +A._nightPLScaleStaged.toFixed(6) : null,
      budgetStill: A._nightMaxLightsStill, nearFloorStill: A._nightNearFadeFloorStill, plStill: A._nightPLScaleStill,
      exposure: +A.renderer.toneMappingExposure.toFixed(6),
      sunI: s ? +s.intensity.toFixed(6) : null, sunColor: s ? s.color.getHex() : null,
      sunPos: s ? [s.position.x, s.position.y, s.position.z].map(function (n) { return +n.toFixed(5); }) : null,
      sunTgt: s ? [s.target.position.x, s.target.position.y, s.target.position.z].map(function (n) { return +n.toFixed(5); }) : null,
      shadowCam: sc ? [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far].map(function (n) { return +(+n).toFixed(5); }) : null,
      shadowMat: sm ? Array.prototype.map.call(sm.elements, function (n) { return +n.toFixed(7); }) : null,
      shadowMapSize: s && s.shadow ? [s.shadow.mapSize.width, s.shadow.mapSize.height] : null,
      shadowHash: sh.hash, shadowNote: sh.note,
      shadowEnabled: !!(A.renderer.shadowMap && A.renderer.shadowMap.enabled), castShadow: !!(s && s.castShadow),
      canvas: [A.renderer.domElement.width, A.renderer.domElement.height]
    };
    row.line = '§SUN_ARC_FILL_TAP i=' + row.i + ' pinOff=' + row.pinOff + ' elevation=' + row.elevation + ' ambient=' + row.ambient + ' hemi=' + row.hemi +
      ' plScale=' + row.plScale + ' budget=' + row.budget + ' nearFloor=' + row.nearFloor + ' poolLit=' + row.poolLit + ' poolSum=' + row.poolSum +
      ' base=' + row.baseAmbient + '/' + row.baseHemi + '/' + row.plStaged + ' still=' + row.budgetStill + '/' + row.nearFloorStill + '/' + row.plStill +
      ' exposure=' + row.exposure + ' sun=' + row.sunI + ' sunPos=' + (row.sunPos || []).join(',') + ' sunTgt=' + (row.sunTgt || []).join(',') +
      ' shadowCam=' + (row.shadowCam || []).join(',') + ' shadowMat=' + (row.shadowMat ? fnv(new TextEncoder().encode(row.shadowMat.join(','))) : '-') +
      ' shadowMap=' + (row.shadowHash || 'unreadable') + ' (' + row.shadowNote + ') cam=' + row.cam.join(',');
    T.frames.push(row);
  }

  window.__maxqTapReport = function () {
    var lines = [], rows = [];
    lines.push('§SUN_ARC_FILL_TAP_MODE pinOff=' + T.pinOff + ' pinReplaced=' + T.pinReplaced + ' pinCallsSwallowed=' + T.pinCallsSwallowed);
    T.frames.forEach(function (f) { lines.push(f.line); rows.push(f); });
    if (T.err.length) lines.push('§SUN_ARC_FILL_TAP_ERR ' + T.err.slice(0, 6).join(' | '));
    if (!T.frames.length) lines.push('§SUN_ARC_FILL_TAP_VERDICT INCONCLUSIVE reason=no frame captured (installed=' + T.installed + ')');
    else lines.push('§SUN_ARC_FILL_TAP_VERDICT frames=' + T.frames.length + ' pinOff=' + T.pinOff);
    return { lines: lines, rows: rows, pinOff: T.pinOff, err: T.err };
  };
})();
