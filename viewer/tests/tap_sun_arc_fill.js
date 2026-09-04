// ⚠ DO NOT REMOVE — §SUN_ARC_FILL page tap (2026-09-05, bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md
// "Second open question" — the interior-fill compensation for the §SUN_ARC noon→dusk sweep).
// Installed by `cli_silent_bake.js --tap` at document start; driven by viewer/tests/witness_sun_arc_fill.js,
// which prepends `window.__SUN_ARC_FILL_K = <k>;` (k = SUN_ARC_FILL_NOON_BOOST for this run; 0 = the
// compensation numerically OFF, i.e. the pre-fix bake). Read the log after every run.
//
// Scope, per frame of the REAL bake loop:
//   1. hold the camera at ONE fixed indoor pose derived from the building DB (a storey's window, the
//      eye 6 m inside it at 1.6 m, looking at the window) and validated by raycast enclosure — so the
//      five frames differ ONLY in tNorm (sun elevation), never in what is in view;
//   2. at the capture moment (_captureFrame's own drawImage of renderer.domElement) record the lighting
//      state the frame was rendered with — ambient/hemi/_nightPLScale/pool, the sun's intensity,
//      position, target, shadow camera, shadow matrix and a hash of the shadow-map bytes — plus the
//      screen rectangles of every glazing element in view (IfcWindow/IfcPlate/IfcCurtainWall), which
//      the witness masks OUT of the frame before reading the interior luma;
//   3. hand it all back through window.__maxqTapReport() as § lines + rows (numbers only).
// Reads real object state only. Nothing here writes sun/shadow state.
(function () {
  'use strict';
  var T = window.__saf = { frames: [], cur: null, installed: false, pose: null, cands: [], err: [], glazing: null, k: null, primed: null };
  var EYE_M = 1.6, INSET_M = 6.0, GLAZE_R_M = 60;
  var CAND = (window.__SUN_ARC_FILL_CAND != null) ? +window.__SUN_ARC_FILL_CAND : 0;   // n-th ENCLOSED candidate
  // optional facing filter: 'sun' = windows whose outward normal faces the arc's sun, 'away' = the
  // opposite. The witness passes PHOTO_SUN_AZIMUTH (read from effects.js) as __SUN_ARC_FILL_AZ; the
  // direction uses scene.js updateSky's own convention (setFromSphericalCoords: x=sinθ, z=cosθ) and
  // the chosen pose's real `sunFacing` is measured again at capture from A.sun.position, so a wrong
  // convention here would show up as a sign mismatch in the log, not pass silently.
  var FACING = window.__SUN_ARC_FILL_FACING || null;
  var AZ = (window.__SUN_ARC_FILL_AZ != null) ? +window.__SUN_ARC_FILL_AZ : null;
  var prevTap = window.__maxqPoseTap;

  window.__maxqPoseTap = function (i, x, y, z, tx, ty, tz) {
    if (prevTap) try { prevTap.apply(null, arguments); } catch (e) {}
    var A = window.APP;
    try { install(); } catch (e) { T.err.push('install ' + e.message); }
    try {
      if (T.k == null) {
        T.k = (window.__SUN_ARC_FILL_K != null) ? +window.__SUN_ARC_FILL_K : null;
        if (T.k != null) A._sunArcFillNoonBoost = T.k;
      }
      // FRAME-0 QUIRK, neutralised for the MEASUREMENT only (pre-existing, not this fix's): in
      // effects.js startStillRefine the §NIGHT_STILL_LIGHTS block (raise to the 50-light still budget,
      // near-fade floor 1) runs BEFORE _applyPhotoStaging() — on a bake's first frame night mode is
      // not on yet, so the block is skipped and frame 0's pool is born at the NAV budget (30 lights,
      // floor 0.3; §SUN_ARC_FILL poolLit=30 vs 50 on every later frame — same order in the real
      // Hospital bake log). Left as is, the noon sample would carry a light-count confound that no
      // other frame of a real film has. Set the still budget up front so frame 0 is lit like frame 1.
      if (T.primed == null && A._nightMaxLightsStill != null) {
        A._nightMaxLights = A._nightMaxLightsStill;
        A._nightNearFadeFloor = A._nightNearFadeFloorStill;
        T.primed = { budget: A._nightMaxLights, floor: A._nightNearFadeFloor };
      }
      if (!T.pose) T.pose = derivePose(A);
      if (T.pose) {
        var P = T.pose;
        A.camera.position.set(P.cam.x, P.cam.y, P.cam.z);
        A.controls.target.set(P.tgt.x, P.tgt.y, P.tgt.z);
        A.controls.update();
        A.camera.updateMatrixWorld(true);
      }
    } catch (e) { T.err.push('pose ' + e.message); }
    T.cur = { i: i, planPose: [x, y, z, tx, ty, tz], captured: false };
  };

  function install() {
    var A = window.APP;
    if (T.installed || !A || !A.renderer) return;
    T.installed = true;
    // the plan's cam-light aim rides the plan target; pin it to the fixed target so every frame's
    // cam light sits at the same place (the loop calls this AFTER the pose tap with the plan's pose)
    if (typeof A._updateCamLight === 'function' && !A.__safCamLightWrapped) {
      var _ucl = A._updateCamLight; A.__safCamLightWrapped = true;
      A._updateCamLight = function (tx, ty, tz) {
        if (T.pose) return _ucl.call(this, T.pose.tgt.x, T.pose.tgt.y, T.pose.tgt.z);
        return _ucl.apply(this, arguments);
      };
    }
    var ctxP = window.CanvasRenderingContext2D.prototype, di = ctxP.drawImage;
    ctxP.drawImage = function (src) {
      if (src === A.renderer.domElement && T.cur && !T.cur.captured) { try { finalize(); } catch (e) { T.err.push('finalize ' + e.message); } }
      return di.apply(this, arguments);
    };
  }

  // ── the fixed indoor pose: extracted from the DB, validated by raycast, never hand-placed ──────
  function derivePose(A) {
    var THREE = window.THREE;
    var rows = A.dbQuery("SELECT e.guid,e.storey,e.ifc_class,t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z " +
      "FROM elements_meta e JOIN element_transforms t ON t.guid=e.guid " +
      "WHERE e.ifc_class IN ('IfcWindow','IfcPlate','IfcCurtainWall')");
    T.glazing = rows.map(function (r) { return { guid: r[0], storey: r[1], cls: r[2], x: r[3], y: r[4], z: r[5], bx: r[6], by: r[7], bz: r[8] }; });
    var wins = T.glazing.filter(function (g) { return g.cls === 'IfcWindow'; });
    if (!wins.length) { T.err.push('no IfcWindow rows'); return null; }
    var perStorey = {};
    wins.forEach(function (w) { perStorey[w.storey] = (perStorey[w.storey] || 0) + 1; });
    var storey = Object.keys(perStorey).sort(function (a, b) { return perStorey[b] - perStorey[a] || (a < b ? -1 : 1); })[0];
    var walls = A.dbQuery("SELECT t.center_x,t.center_y FROM elements_meta e JOIN element_transforms t ON t.guid=e.guid " +
      "WHERE e.storey=? AND e.ifc_class IN ('IfcWallStandardCase','IfcWall')", [storey]);
    if (!walls.length) { T.err.push('no walls on ' + storey); return null; }
    var cx = 0, cy = 0; walls.forEach(function (r) { cx += r[0]; cy += r[1]; }); cx /= walls.length; cy /= walls.length;
    var stc = A.dbQueryFirst("SELECT center_z FROM spatial_structure WHERE name=? AND guid LIKE 'STC_%'", [storey]);
    var floorZ = stc && stc[0] != null ? +stc[0] : null;
    if (floorZ == null) { var mn = Infinity; wins.forEach(function (w) { if (w.storey === storey) mn = Math.min(mn, w.z - w.bz / 2); }); floorZ = mn; }
    // candidates: this storey's windows, largest glazed face first (a storefront before a 0.9 m fixed light)
    var cands = wins.filter(function (w) { return w.storey === storey; })
      .sort(function (a, b) { return (Math.max(b.bx, b.by) * b.bz) - (Math.max(a.bx, a.by) * a.bz) || (a.guid < b.guid ? -1 : 1); });
    var meshes = A.collectMeshes(function (o) { return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible; });
    var rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    function hit(origin, dir, far) {
      rc.set(origin, dir.clone().normalize()); rc.far = far; rc.near = 0.01;
      var hs = rc.intersectObjects(meshes, false);
      return hs.length ? +hs[0].distance.toFixed(3) : null;
    }
    var chosen = null, tried = 0, enclosedSeen = 0, skippedFacing = 0;
    var sunH = (FACING && AZ != null) ? { x: Math.sin(AZ * Math.PI / 180), z: Math.cos(AZ * Math.PI / 180) } : null;
    for (var ci = 0; ci < cands.length && ci < 80; ci++) {
      var w = cands[ci]; tried++;
      var dx = cx - w.x, dy = cy - w.y, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      if (sunH) {
        var ow = A.ifc2threeDir(-dx, -dy, 0), fd = ow.x * sunH.x + ow.z * sunH.z;
        if ((FACING === 'sun' && fd < 0.3) || (FACING === 'away' && fd > -0.3)) { skippedFacing++; continue; }
      }
      var camIfc = { x: w.x + dx * INSET_M, y: w.y + dy * INSET_M, z: floorZ + EYE_M };
      var cam = A.ifc2three(camIfc.x, camIfc.y, camIfc.z), tgt = A.ifc2three(w.x, w.y, w.z);
      var o = new THREE.Vector3(cam.x, cam.y, cam.z), t = new THREE.Vector3(tgt.x, tgt.y, tgt.z);
      var fwd = t.clone().sub(o); fwd.y = 0; fwd.normalize();
      var right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      var t0 = performance.now();
      var dDown = hit(o, new THREE.Vector3(0, -1, 0), 4), dUp = hit(o, new THREE.Vector3(0, 1, 0), 8);
      var dFwd = hit(o, fwd, 12), dL = hit(o, right.clone().negate(), 12), dR = hit(o, right, 12);
      var ok = dDown != null && dDown <= 2.5 && dUp != null && dUp <= 6.0 &&
               (dFwd == null || dFwd >= 2.0) && (dL == null || dL >= 0.4) && (dR == null || dR >= 0.4);
      var line = '§SUN_ARC_FILL_POSE cand=' + ci + ' guid=' + w.guid + ' storey="' + storey + '" face=' +
        (Math.max(w.bx, w.by) * w.bz).toFixed(2) + 'm2 camIfc=' + camIfc.x.toFixed(2) + ',' + camIfc.y.toFixed(2) + ',' + camIfc.z.toFixed(2) +
        ' floorZ=' + floorZ.toFixed(2) + ' rays(m) down=' + dDown + ' up=' + dUp + ' fwd=' + dFwd + ' left=' + dL + ' right=' + dR +
        ' ms=' + (performance.now() - t0).toFixed(0) + ' ' + (ok ? 'ENCLOSED#' + enclosedSeen : 'rejected');
      T.cands.push({ line: line, ok: ok });
      if (ok) {
        if (enclosedSeen++ < CAND) continue;
        var od = A.ifc2threeDir(-dx, -dy, 0);   // window's OUTWARD horizontal normal (away from the storey centroid)
        chosen = { guid: w.guid, storey: storey, cam: { x: cam.x, y: cam.y, z: cam.z }, tgt: { x: tgt.x, y: tgt.y, z: tgt.z },
          camIfc: camIfc, winIfc: { x: w.x, y: w.y, z: w.z }, rays: { down: dDown, up: dUp, fwd: dFwd, left: dL, right: dR },
          centroidIfc: { x: cx, y: cy }, outward: { x: od.x, y: od.y, z: od.z }, cand: CAND, facing: FACING, tried: tried,
          skippedFacing: skippedFacing, meshes: meshes.length };
        break;
      }
    }
    if (!chosen) T.err.push('no candidate pose passed the enclosure rays (tried ' + tried + ', skippedFacing ' + skippedFacing + ')');
    return chosen;
  }

  // ── screen rectangles of the glazing in view (normalised 0..1, y down) ─────────────────────────
  function glazingRects(A) {
    var THREE = window.THREE, cam = A.camera, out = [];
    if (!T.glazing) return out;
    var cp = cam.position, inv = cam.matrixWorldInverse, v = new THREE.Vector3();
    for (var gi = 0; gi < T.glazing.length; gi++) {
      var g = T.glazing[gi];
      var c = A.ifc2three(g.x, g.y, g.z);
      if (Math.hypot(c.x - cp.x, c.y - cp.y, c.z - cp.z) > GLAZE_R_M) continue;
      var minX = 2, minY = 2, maxX = -2, maxY = -2, behind = false;
      for (var k = 0; k < 8; k++) {
        var p = A.ifc2three(g.x + (k & 1 ? 1 : -1) * g.bx / 2, g.y + (k & 2 ? 1 : -1) * g.by / 2, g.z + (k & 4 ? 1 : -1) * g.bz / 2);
        v.set(p.x, p.y, p.z);
        var vz = v.clone().applyMatrix4(inv).z;
        if (vz >= -0.05) { behind = true; break; }
        v.project(cam);
        var sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx; if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      }
      if (behind) continue;
      var x0 = Math.max(0, minX), y0 = Math.max(0, minY), x1 = Math.min(1, maxX), y1 = Math.min(1, maxY);
      if (x1 <= x0 || y1 <= y0) continue;
      out.push({ guid: g.guid, cls: g.cls, x0: +x0.toFixed(4), y0: +y0.toFixed(4), x1: +x1.toFixed(4), y1: +y1.toFixed(4) });
    }
    return out;
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
    var sh = shadowHash(A);
    // does this window face the arc's sun? outward normal · the sun's horizontal direction (read off
    // A.sun.position, which updateSky set from PHOTO_SUN_AZIMUTH — no constant re-typed here)
    var sunFacing = null;
    if (s && T.pose && T.pose.outward) {
      var sl = Math.hypot(s.position.x, s.position.z) || 1;
      sunFacing = +((T.pose.outward.x * s.position.x + T.pose.outward.z * s.position.z) / sl).toFixed(3);
    }
    var row = {
      i: F.i, k: T.k, sunFacing: sunFacing, budget: A._nightMaxLights, nearFloor: A._nightNearFadeFloor,
      cam: [A.camera.position.x, A.camera.position.y, A.camera.position.z, A.controls.target.x, A.controls.target.y, A.controls.target.z].map(function (n) { return +n.toFixed(4); }),
      elevation: A._sunArcElevationDeg == null ? null : +(+A._sunArcElevationDeg).toFixed(4),
      ambient: +A.ambient.intensity.toFixed(6), hemi: +A.hemi.intensity.toFixed(6),
      plScale: +(+A._nightPLScale).toFixed(6), poolLit: lit, poolSum: +sum.toFixed(4),
      exposure: +A.renderer.toneMappingExposure.toFixed(6),
      fog: A.scene.fog ? A.scene.fog.color.getHex() : null,
      sunI: s ? +s.intensity.toFixed(6) : null, sunColor: s ? s.color.getHex() : null,
      sunPos: s ? [s.position.x, s.position.y, s.position.z].map(function (n) { return +n.toFixed(5); }) : null,
      sunTgt: s ? [s.target.position.x, s.target.position.y, s.target.position.z].map(function (n) { return +n.toFixed(5); }) : null,
      shadowCam: sc ? [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far].map(function (n) { return +(+n).toFixed(5); }) : null,
      shadowMat: sm ? Array.prototype.map.call(sm.elements, function (n) { return +n.toFixed(7); }) : null,
      shadowMapSize: s && s.shadow ? [s.shadow.mapSize.width, s.shadow.mapSize.height] : null,
      shadowHash: sh.hash, shadowNote: sh.note,
      shadowEnabled: !!(A.renderer.shadowMap && A.renderer.shadowMap.enabled), castShadow: !!(s && s.castShadow),
      canvas: [A.renderer.domElement.width, A.renderer.domElement.height],
      rects: glazingRects(A)
    };
    var win = 0; row.rects.forEach(function (r) { win += (r.x1 - r.x0) * (r.y1 - r.y0); });
    row.rectArea = +win.toFixed(4);
    row.line = '§SUN_ARC_FILL_TAP i=' + row.i + ' k=' + row.k + ' elevation=' + row.elevation + ' ambient=' + row.ambient + ' hemi=' + row.hemi +
      ' plScale=' + row.plScale + ' poolLit=' + row.poolLit + ' poolSum=' + row.poolSum + ' budget=' + row.budget + ' nearFloor=' + row.nearFloor +
      ' sunFacing=' + row.sunFacing + ' exposure=' + row.exposure +
      ' sun=' + row.sunI + ' sunPos=' + (row.sunPos || []).join(',') + ' sunTgt=' + (row.sunTgt || []).join(',') +
      ' shadowCam=' + (row.shadowCam || []).join(',') + ' shadowMat=' + (row.shadowMat ? fnv(new TextEncoder().encode(row.shadowMat.join(','))) : '-') +
      ' shadowMap=' + (row.shadowHash || 'unreadable') + ' (' + row.shadowNote + ') glazingRects=' + row.rects.length + ' rectArea=' + row.rectArea +
      ' cam=' + row.cam.join(',');
    T.frames.push(row);
  }

  window.__maxqTapReport = function () {
    var lines = [], rows = [];
    if (T.primed) lines.push('§SUN_ARC_FILL_PRIME stillBudget=' + T.primed.budget + ' nearFadeFloor=' + T.primed.floor +
      ' — frame-0 nav-budget quirk (effects.js startStillRefine: §NIGHT_STILL_LIGHTS block precedes _applyPhotoStaging) neutralised for the measurement');
    T.cands.forEach(function (c) { lines.push(c.line); });
    if (T.pose) lines.push('§SUN_ARC_FILL_POSE_CHOSEN cand=' + T.pose.cand + ' facing=' + (T.pose.facing || 'any') + ' skippedFacing=' + T.pose.skippedFacing +
      ' guid=' + T.pose.guid + ' storey="' + T.pose.storey + '" outward=' +
      [T.pose.outward.x, T.pose.outward.y, T.pose.outward.z].map(function (n) { return n.toFixed(3); }).join(',') + ' cam=' +
      [T.pose.cam.x, T.pose.cam.y, T.pose.cam.z].map(function (n) { return n.toFixed(3); }).join(',') + ' tgt=' +
      [T.pose.tgt.x, T.pose.tgt.y, T.pose.tgt.z].map(function (n) { return n.toFixed(3); }).join(',') +
      ' camIfc=' + [T.pose.camIfc.x, T.pose.camIfc.y, T.pose.camIfc.z].map(function (n) { return n.toFixed(2); }).join(',') +
      ' meshes=' + T.pose.meshes + ' tried=' + T.pose.tried);
    T.frames.forEach(function (f) { lines.push(f.line); rows.push(f); });
    if (T.err.length) lines.push('§SUN_ARC_FILL_TAP_ERR ' + T.err.slice(0, 6).join(' | '));
    if (!T.frames.length) lines.push('§SUN_ARC_FILL_TAP_VERDICT INCONCLUSIVE reason=no frame captured (installed=' + T.installed + ')');
    else if (!T.pose) lines.push('§SUN_ARC_FILL_TAP_VERDICT INCONCLUSIVE reason=no enclosed indoor pose found — frames were baked at the plan pose');
    else lines.push('§SUN_ARC_FILL_TAP_VERDICT frames=' + T.frames.length + ' k=' + T.k + ' pose=fixed');
    return { lines: lines, rows: rows, pose: T.pose, k: T.k, err: T.err };
  };
})();
