/**
 * BIM OOTB — effects.js — EffectComposer post-processing pipeline
 * Extracted from scene.js (S278 Phase 3)
 * SSAO + OutlinePass + OutputPass. Desktop only — skipped on mobile.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// Implementing S278_REFACTOR_CLASH_PANELS.md §Phase 3 — Witness: W-EFFECTS
async function setupEffects(A, renderer, scene, camera) {
  A._composer = null;
  A._ssaoPass = null;
  A._outlinePass = null;
  A._composerEnabled = false;

  // §EFFECTS_SKIP: Mobile — no EffectComposer creation, zero GPU allocation
  var _isMobile = (navigator.maxTouchPoints > 0 && window.screen.width < 1024);
  if (_isMobile) {
    console.log('§EFFECTS_SKIP mobile — direct render only');
    A.toggleSSAO = function() {};
    A.setOutline = function() {};
    return;
  }

  try {
    // §S277c: Parallel import — all 6 addons load concurrently, not sequentially
    var [_ecMod, _rpMod, _taaMod, _ssaoMod, _outMod, _opMod] = await Promise.all([
      import('./lib/EffectComposer.js'),
      import('./lib/RenderPass.js'),
      import('./lib/TAARenderPass.js'),
      import('./lib/SSAOPass.js'),
      import('./lib/OutlinePass.js'),
      import('./lib/OutputPass.js')
    ]);

    var _composer = new _ecMod.EffectComposer(renderer);
    _composer.setSize(window.innerWidth, window.innerHeight);
    _composer.setPixelRatio(renderer.getPixelRatio());

    // §NIGHT-STILL-REFINE (2026-07-15, user ask): Pass 1 is a TAARenderPass instead of a plain
    // RenderPass — with `.accumulate=false` (default) it behaves identically to RenderPass, zero
    // added cost during normal navigation. `A.startStillRefine()` below flips accumulate=true and
    // drives 16 jittered-camera accumulation samples across idle frames to build a crisp
    // supersampled still; any interaction (markDirty, wrapped below) cancels it immediately.
    var _renderPass = new _taaMod.TAARenderPass(scene, camera);
    _composer.addPass(_renderPass);

    // Pass 2: SSAO — contact shadows in room corners, pipe junctions
    var _ssaoPass = new _ssaoMod.SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    _ssaoPass.kernelRadius = 0.5;    // 0.5m — architectural scale
    _ssaoPass.minDistance = 0.001;
    _ssaoPass.maxDistance = 0.1;
    _ssaoPass.enabled = false;  // off by default — toggled with Shadow or UI
    _composer.addPass(_ssaoPass);

    // Pass 3: Outline — mesh silhouette on pick/clash/find
    var _outlinePass = new _outMod.OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera
    );
    _outlinePass.edgeStrength = 3;
    _outlinePass.edgeGlow = 0;
    _outlinePass.edgeThickness = 1.5;
    _outlinePass.visibleEdgeColor.set(0xff8c00);  // orange pick
    _outlinePass.hiddenEdgeColor.set(0xff4400);
    _outlinePass.enabled = false;  // enabled on demand by pick/clash
    _composer.addPass(_outlinePass);

    // Pass 4: Output — tone mapping + color space
    var _outputPass = new _opMod.OutputPass();
    _composer.addPass(_outputPass);

    A._composer = _composer;
    A._ssaoPass = _ssaoPass;
    A._outlinePass = _outlinePass;
    A._renderPass = _renderPass;
    A._taaPass = _renderPass;
    console.log('§EFFECTS_INIT loaded — TAARenderPass + SSAO + Outline + Output');
  } catch(e) {
    console.warn('§EFFECTS_INIT_FAIL ' + e.message + ' — falling back to direct render');
    A._composer = null;
  }

  // §S277c: Toggle SSAO (called from Shadow toggle or UI)
  A.toggleSSAO = function(on) {
    if (!A._ssaoPass) return;
    A._ssaoPass.enabled = on;
    A._composerEnabled = on || (A._outlinePass && A._outlinePass.enabled);
    console.log('§SSAO toggle=' + on);
  };

  // §S277c: Set outline targets (called from pick/clash/find)
  A.setOutline = function(objects, color) {
    if (!A._outlinePass) return;
    A._outlinePass.selectedObjects = objects || [];
    if (color) A._outlinePass.visibleEdgeColor.set(color);
    A._outlinePass.enabled = objects && objects.length > 0;
    A._composerEnabled = A._outlinePass.enabled || (A._ssaoPass && A._ssaoPass.enabled);
  };

  // §NIGHT-STILL-REFINE (2026-07-15, user ask): progressive TAA still — accumulates 16 jittered
  // samples across idle frames into a crisp supersampled image, cancels on any interaction.
  A._stillRefineActive = false;
  var _stillRefineRAF = null;
  var _stillRefinePrevComposerEnabled = false;
  // §STILL_REFINE_TEARDOWN (2026-07-15, real-user bug): natural completion used to skip this —
  // A._taaPass.accumulate stayed true and A._composerEnabled stayed forced-on forever afterward,
  // so every subsequent normal render kept re-painting the FROZEN accumulated image instead of a
  // fresh live frame (accumulateIndex>=16 short-circuits TAARenderPass's sampling loop but still
  // re-blends the stale _sampleRenderTarget). That's exactly the "blurred/multi-shot after moving
  // the camera" the user hit live. Both the done-path and the cancel-path must reset the SAME
  // state — only the log line differs.
  // §TRIPLANAR: the actual uTriActive toggle now lives in each material's own onBeforeRender
  // (streaming.js §TRIPLANAR_RECOMPILE_FIX — self-heals across shader recompiles, which a
  // one-time push from here cannot). This just counts registered materials for the perf log.
  var _stillRefineStartMs = 0;
  function _setTriplanarActive(active) {
    return (A._triplanarMaterials || []).length;
  }
  // §PHOTO_STAGING_PROPS (2026-07-15, POC — presentation only, explicitly authorized fabricated
  // staging, not extracted BIM data, not touching any real logic/geometry the compiler produces).
  // Building-only ground uplights + roof-mounted downlights (both washing the wall — a common
  // real facade night-lighting technique, per user) + a distant skyline silhouette with sparkled
  // window-lights — all anchored to THIS building's own real bbox/position (queried fresh, not
  // invented numbers) even though the fixtures themselves are fabricated. Built once per building
  // (cached, rebuilt only if the active building changes), then just shown/hidden each photoshoot
  // — cheap: a handful of point lights + one Points sparkle field, no shadow-casting, no new
  // texture/loader dependencies.
  // §PHOTO_EDGE_DROPPED (2026-07-15, user ask): the roofline edge-lining is REMOVED — even after
  // fixing the "cached from a stale camera angle" bug, the bbox-rectangle approximation for this
  // L-shaped building still didn't read as connected to the real geometry ("floating around").
  // Not worth the complexity for a POC; ground+roof wall-wash lighting covers the same "evening
  // facade" mood more simply and reliably.
  // §PHOTO_FACING (2026-07-15, resume-brief item 1): the 4 uniform corner pairs above spread
  // the wall-wash evenly around the whole footprint, which is NOT what the user's stated goal
  // ("artificial lights are placed to light up the facade facing camera") asks for. Switched to
  // one uplight+downlight pair per FOOTPRINT EDGE (not corner) — each pair sits at its edge's own
  // midpoint, so it washes exactly one facade — and each pair's intensity is recomputed FRESH
  // every photoshoot trigger (never cached across triggers, only the fixture geometry/position is
  // cached per-building) from the CURRENT camera position, reusing the exact dot-product-of-
  // outward-normal-vs-camera-direction math already proven correct for the now-removed edge-
  // lining (see git history commit cd8df02 — that MATH was right, only the line-mesh rendering
  // of it was dropped for looking disconnected on an L-shaped bbox). A point light has no such
  // "floating line" failure mode, so the same facing math is safe to reuse here.
  var _photoPropsBuilding = null;
  var _photoUplights = [], _photoSkyline = null, _photoSkylineLights = null;
  var _photoFacadeLights = [];  // [{mid:{x,z}(three), normalThree:{x,z}, up:PointLight, down:PointLight}]
  var PHOTO_FACADE_UP_BASE = 9, PHOTO_FACADE_DOWN_BASE = 7;
  var PHOTO_FACADE_DIM_FRACTION = 0.3;  // non-facing facades still lit, just weaker — not pitch dark
  var PHOTO_BACK_ACCENT_BOOST = 1.8;  // user ask: "ground based spotlights too" on the back portion —
                                       // paired with the roof-corner twin spot, not just the dim baseline
  var _photoRoofCorners = [], _photoRoofSpotA = null, _photoRoofSpotB = null;
  var _photoSparkles = [];  // [{sprite:THREE.Sprite, mid3:{x,y,z}(three), normalThree:{x,z}}]
  var _sparkleTexCache = null;
  var PHOTO_SPARKLE_DOT_MIN = 0.90;   // half-vector/normal alignment needed before any glint shows
  var PHOTO_SPARKLE_SCALE_MAX = 8;    // world-units sprite size at perfect alignment
  var PHOTO_SPARKLE_FACING_MIN = 0.15; // facade must be roughly camera-facing, not edge-on/behind
  // §PHOTO_SPARKLE_REBUILD (2026-07-16, user spec, RESUME BRIEF "sparkle needs a rebuild"):
  // Terminal exposed a real bug — "it moves opposite to the angle of attack" — because the old
  // 4-point model used INVENTED bbox-rectangle midpoints/normals that don't match Terminal's real
  // curved/angled facades at all. Fix sources real candidate points from actual geometry instead:
  //  FLAT (IfcWall/IfcWallStandardCase/IfcWindow): real per-element outward normal via simple
  //   trig — local thickness axis (the shorter of bbox_x/bbox_y) rotated by the element's own
  //   rotation_z. Verified empirically this session against real rendered geometry (raycast the
  //   actual mesh, compare face normals) that the correct convention is THREE.rotation.y =
  //   +rotation_z (no sign flip) — the SAME Euler streaming.js/_buildShapeMeshes already use to
  //   PLACE these meshes, confirmed consistent across ~20 real Terminal wall samples. Outward
  //   sign resolved against the building centroid.
  //  ROUNDED (IfcCurtainWall/IfcPlate/IfcMember): confirmed empirically this session that
  //   rotation_z is UNINFORMATIVE for these classes — every IfcPlate on Terminal shares one
  //   constant rotation_x/y/z (the dome's curve is baked into the mesh geometry itself, not
  //   exposed via the rotation columns). The physically-correct general fallback for ANY
  //   curved/domed envelope is the RADIAL direction from the building's own horizontal centroid
  //   to the element — still "simple trigonometry" per the user's own effort ceiling. This is
  //   also the principled version of "rounded surfaces accept a wider angle": a curved surface's
  //   true normal sweeps continuously, so a coarse sample point on it SHOULD get a wider
  //   acceptance cone — that's why the class gets one, not an arbitrary tuning knob.
  var PHOTO_SPARKLE_FLAT_CLASSES = "'IfcWall','IfcWallStandardCase','IfcWindow'";
  var PHOTO_SPARKLE_ROUND_CLASSES = "'IfcCurtainWall','IfcPlate','IfcMember'";
  var PHOTO_SPARKLE_DOT_MIN_FLAT = 0.90;   // flat mirror — narrow band
  var PHOTO_SPARKLE_DOT_MIN_ROUND = 0.55;  // rounded edge/frame — wide band ("shot out a bit")
  var PHOTO_SPARKLE_CAP = 24;  // "few points" (user's own ceiling) — modest, clustered, not a per-panel scan
  // Real points, orientation-clustered to a small representative sample — never per-triangle/
  // per-panel. flatBucket keys by (15°-rounded facing angle × ~20m position cell); roundBucket
  // keys by 20°-rounded angle-from-centroid — each keeps only the largest/first candidate found,
  // general to any building/footprint shape, nothing hardcoded.
  function _buildSparklePoints(cx, cy) {
    var pts = [];
    if (!A.dbQuery) return pts;
    var flatRows = A.dbQuery(
      "SELECT et.center_x, et.center_y, et.center_z, et.rotation_z, et.bbox_x, et.bbox_y " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + PHOTO_SPARKLE_FLAT_CLASSES + ") " +
      "AND et.bbox_x IS NOT NULL AND et.bbox_y IS NOT NULL AND et.rotation_z IS NOT NULL " +
      "AND MAX(et.bbox_x, et.bbox_y) > 2.0 " +
      "ORDER BY (et.bbox_x * et.bbox_y) DESC LIMIT 300"
    );
    var roundRows = A.dbQuery(
      "SELECT et.center_x, et.center_y, et.center_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + PHOTO_SPARKLE_ROUND_CLASSES + ") AND et.center_x IS NOT NULL " +
      "ORDER BY RANDOM() LIMIT 300"
    );
    var flatBuckets = {};
    flatRows.forEach(function(r) {
      var bucketAngle = Math.round(THREE.MathUtils.radToDeg(r[3]) / 15) * 15;
      var key = 'F' + bucketAngle + '_' + Math.round(r[0] / 20) + '_' + Math.round(r[1] / 20);
      if (!flatBuckets[key]) flatBuckets[key] = r;
    });
    var roundBuckets = {};
    roundRows.forEach(function(r) {
      var ang = Math.round(THREE.MathUtils.radToDeg(Math.atan2(r[1] - cy, r[0] - cx)) / 20) * 20;
      var key = 'R' + ang;
      if (!roundBuckets[key]) roundBuckets[key] = r;
    });
    var flatKeys = Object.keys(flatBuckets), roundKeys = Object.keys(roundBuckets);
    var capFlat = Math.min(flatKeys.length, Math.ceil(PHOTO_SPARKLE_CAP * 0.5));
    var capRound = Math.min(roundKeys.length, PHOTO_SPARKLE_CAP - capFlat);
    flatKeys.slice(0, capFlat).forEach(function(k) {
      var r = flatBuckets[k];
      var ex = r[0], ey = r[1], ez = r[2], rz = r[3], bx = r[4], by = r[5];
      var lx = (bx < by) ? 1 : 0, ly = (bx < by) ? 0 : 1;  // local thickness axis
      var localThree = { x: lx, z: -ly };  // ifc2three direction mapping (offset-free)
      // THREE RotationY(+rotation_z) — verified convention, matches streaming.js placement.
      var wx = Math.cos(rz) * localThree.x + Math.sin(rz) * localThree.z;
      var wz = -Math.sin(rz) * localThree.x + Math.cos(rz) * localThree.z;
      var posThree = A.ifc2three(ex, ey, ez);
      var centerThree = A.ifc2three(cx, cy, ez);
      var toEl = { x: posThree.x - centerThree.x, z: posThree.z - centerThree.z };
      if (wx * toEl.x + wz * toEl.z < 0) { wx = -wx; wz = -wz; }  // resolve outward sign
      pts.push({ mid3: posThree, normalThree: { x: wx, z: wz }, dotMin: PHOTO_SPARKLE_DOT_MIN_FLAT });
    });
    roundKeys.slice(0, capRound).forEach(function(k) {
      var r = roundBuckets[k];
      var posThree = A.ifc2three(r[0], r[1], r[2]);
      var centerThree = A.ifc2three(cx, cy, r[2]);
      var toEl = { x: posThree.x - centerThree.x, z: posThree.z - centerThree.z };
      var len = Math.hypot(toEl.x, toEl.z) || 1;
      pts.push({ mid3: posThree, normalThree: { x: toEl.x / len, z: toEl.z / len }, dotMin: PHOTO_SPARKLE_DOT_MIN_ROUND });
    });
    return pts;
  }
  function _getSparkleTexture() {
    if (_sparkleTexCache) return _sparkleTexCache;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var ctx = c.getContext('2d');
    // Soft warm glow — dominant, matches the user's reference photo (relfectsunlight.jpg).
    var glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 30);
    glow.addColorStop(0, 'rgba(255,250,205,1.0)');
    glow.addColorStop(0.35, 'rgba(255,228,140,0.55)');
    glow.addColorStop(1, 'rgba(255,215,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
    // Thin cross streak — subtle, secondary to the glow ("sharp spikes too" as an accent, not
    // the dominant look).
    function ray() {
      var lg = ctx.createLinearGradient(0, 0, 128, 0);
      lg.addColorStop(0, 'rgba(255,240,180,0)');
      lg.addColorStop(0.5, 'rgba(255,250,215,0.5)');
      lg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 62, 128, 4);
    }
    ray();
    ctx.save(); ctx.translate(64, 64); ctx.rotate(Math.PI / 2); ctx.translate(-64, -64);
    ray();
    ctx.restore();
    _sparkleTexCache = new THREE.CanvasTexture(c);
    return _sparkleTexCache;
  }
  // §PHOTO_SKYLINE_WINDOW_RECT (2026-07-16, user ask: "rectangles of lights depicting lighted
  // window rather than ghostly"): the skyline's window-light Points cloud used PointsMaterial's
  // default round sprite — reads as fuzzy dots at a distance, not lit windows. Swap ONLY the
  // sprite texture for a soft-edged RECTANGLE (a real window's aspect, not a point) — same Points
  // system, same single draw call, same per-point cost, just a different `map`. Cached once.
  var _skylineWinTexCache = null;
  function _getSkylineWindowTexture() {
    if (_skylineWinTexCache) return _skylineWinTexCache;
    // A THREE.Points sprite's on-screen footprint is always a SQUARE (PointsMaterial has one
    // scalar `size`, no independent width/height) — so the canvas itself is square, and the
    // window PANE is drawn narrower than tall inside it with transparent padding left/right.
    // The visible shape still reads as a rectangular window; only the (fully transparent)
    // billboard bounds are square.
    var N = 96;
    var c = document.createElement('canvas');
    c.width = N; c.height = N;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, N, N);
    function roundedRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    var padX = 26, padY = 8, w = N - padX * 2, h = N - padY * 2;
    // Soft blurred glow first (larger than the pane, gives it a lit-from-within halo)...
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(255,240,190,0.55)';
    roundedRect(padX - 4, padY - 4, w + 8, h + 8, 10);
    ctx.fill();
    // ...then the crisp window pane on top so it still reads as a rectangle, not just a blob.
    ctx.filter = 'none';
    var grad = ctx.createLinearGradient(0, padY, 0, N - padY);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,250,225,0.85)');
    ctx.fillStyle = grad;
    roundedRect(padX, padY, w, h, 4);
    ctx.fill();
    _skylineWinTexCache = new THREE.CanvasTexture(c);
    return _skylineWinTexCache;
  }
  // §PHOTO_SPARKLE reassert: Blinn-Phong half-vector test against each facade's real normal —
  // "the correct angle of attack" (user), the same standard specular-highlight condition a shader
  // computes per-pixel, applied here to one representative point per facade instead. Horizontal-
  // only (x/z), same simplification _updateFacadeFacingLights already uses for facade normals.
  // §NIGHT_GLOW_REASSERT (2026-07-16, real bug — "cannot see the building lights yet"): the
  // window/fixture emissive glow (tools.js A.toggleNightMode) used to be a ONE-TIME pass over
  // A._matCache at the instant it fires — on a still-streaming building (the normal case, Alt+S
  // usually fires long before a large building finishes loading) it only ever caught whichever
  // handful of materials existed at that exact moment, confirmed live as 1 window-glow material
  // on a building with far more real glass. Same streaming-race bug class already fixed twice
  // this session for other systems (triplanar shader uniforms, shadow/envMap) — re-call the
  // (cheap, already-processed-keys-skipped) tools.js function every accumulation/orbit frame.
  function _reassertPhotoGlow() {
    if (A._applyNightGlowToMatCache) A._applyNightGlowToMatCache();
  }
  function _reassertPhotoSparkles() {
    if (!A.sun || !A.camera || !_photoSparkles.length) return;
    _photoSparkles.forEach(function(s) {
      var sdx = A.sun.position.x - s.mid3.x, sdz = A.sun.position.z - s.mid3.z;
      var sLen = Math.hypot(sdx, sdz) || 1;
      sdx /= sLen; sdz /= sLen;
      var cdx = A.camera.position.x - s.mid3.x, cdz = A.camera.position.z - s.mid3.z;
      var cLen = Math.hypot(cdx, cdz) || 1;
      cdx /= cLen; cdz /= cLen;
      var hx = sdx + cdx, hz = sdz + cdz;
      var hLen = Math.hypot(hx, hz);
      var facingCam = cdx * s.normalThree.x + cdz * s.normalThree.z;
      var sunUp = A.sun.position.y > 0;
      if (hLen < 1e-4 || facingCam < PHOTO_SPARKLE_FACING_MIN || !sunUp) { s.sprite.visible = false; return; }
      hx /= hLen; hz /= hLen;
      var dotHN = hx * s.normalThree.x + hz * s.normalThree.z;
      // §PHOTO_SPARKLE_REBUILD: rounded/edge-classified points (curtain-wall panels, mullions —
      // real curved-surface normal sweeps continuously) get a lower/wider dotMin than flat wall
      // panels (a true flat mirror only glints within a narrow band) — see _buildSparklePoints.
      var dotMin = (s.dotMin != null) ? s.dotMin : PHOTO_SPARKLE_DOT_MIN;
      if (dotHN <= dotMin) { s.sprite.visible = false; return; }
      var t = Math.min(1, (dotHN - dotMin) / (1 - dotMin));
      var sc = 1 + t * PHOTO_SPARKLE_SCALE_MAX;
      s.sprite.position.set(s.mid3.x, s.mid3.y, s.mid3.z);
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.material.opacity = t * t;
      s.sprite.visible = true;
    });
  }
  function _buildingBBoxIfc() {
    if (!A.dbQuery) return null;
    var r = A.dbQuery('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms');
    if (!r.length || r[0][0] == null) return null;
    return { xMin: r[0][0], xMax: r[0][1], yMin: r[0][2], yMax: r[0][3], zMin: r[0][4], zMax: r[0][5] };
  }
  // §CINEMA_ARC_BBOX (2026-07-16, user ask: "ignore any non ARC elements outside frame" —
  // "solves LTU too far"): the whole-building bbox above includes every discipline, including
  // scattered exterior MEP piping (LTU) that inflates the envelope and pushes the Cinema Orbit's
  // "reasonable band" and fill-frame target far past what the actual architectural volume needs.
  // ARC-only bbox is the real building envelope for framing purposes — general to any building,
  // no hardcoding (a building with zero ARC rows falls back to the whole-building bbox below).
  function _buildingBBoxArc() {
    if (!A.dbQuery) return null;
    var r = A.dbQuery(
      "SELECT MIN(et.center_x), MAX(et.center_x), MIN(et.center_y), MAX(et.center_y), MIN(et.center_z), MAX(et.center_z) " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid WHERE em.discipline = 'ARC'"
    );
    if (!r.length || r[0][0] == null) return null;
    return { xMin: r[0][0], xMax: r[0][1], yMin: r[0][2], yMax: r[0][3], zMin: r[0][4], zMax: r[0][5] };
  }
  function _disposePhotoProps() {
    _photoUplights.forEach(function(l) { A.scene.remove(l); });
    if (_photoSkyline) { A.scene.remove(_photoSkyline); _photoSkyline.children.forEach(function(b) { b.geometry.dispose(); b.material.dispose(); }); }
    if (_photoSkylineLights) { A.scene.remove(_photoSkylineLights); _photoSkylineLights.geometry.dispose(); _photoSkylineLights.material.dispose(); }
    _photoSparkles.forEach(function(s) { A.scene.remove(s.sprite); s.sprite.material.dispose(); });
    _photoUplights = []; _photoFacadeLights = []; _photoSkyline = null; _photoSkylineLights = null;
    _photoRoofCorners = []; _photoRoofSpotA = null; _photoRoofSpotB = null; _photoSparkles = [];
  }
  function _buildPhotoProps() {
    var bbox = _buildingBBoxIfc();
    if (!bbox) return;
    _photoPropsBuilding = A.activeBuilding;
    var cx = (bbox.xMin + bbox.xMax) / 2, cy = (bbox.yMin + bbox.yMax) / 2;
    var w = bbox.xMax - bbox.xMin, d = bbox.yMax - bbox.yMin;
    var groundZ = bbox.zMin, roofZ = bbox.zMax;

    // Ground uplight + roof downlight per FOOTPRINT EDGE (4 edges of the bbox rectangle — same
    // approximation the removed edge-lining used, general to any building/any angle since it's
    // derived fresh from this building's own real bbox, not hardcoded). Pair sits at the edge
    // midpoint, inset inward so it reads as washing that specific wall face, not floating past it.
    var inset = Math.min(3, w * 0.1, d * 0.1);
    var corners = [[bbox.xMin, bbox.yMin], [bbox.xMax, bbox.yMin], [bbox.xMax, bbox.yMax], [bbox.xMin, bbox.yMax]];
    var normalsIfc = [[0, -1], [1, 0], [0, 1], [-1, 0]];  // outward normal per edge, IFC XY
    for (var ei = 0; ei < 4; ei++) {
      var c1 = corners[ei], c2 = corners[(ei + 1) % 4];
      var midIfcX = (c1[0] + c2[0]) / 2, midIfcY = (c1[1] + c2[1]) / 2;
      var n = normalsIfc[ei];
      // Pull the fixture position inward along the inward normal so it sits against the wall.
      var fx = midIfcX - n[0] * inset, fy = midIfcY - n[1] * inset;
      var pg = A.ifc2three(fx, fy, groundZ);
      var up = new THREE.PointLight(0xffaa55, PHOTO_FACADE_UP_BASE, 14, 2);
      up.position.set(pg.x, pg.y + 0.3, pg.z);
      A.scene.add(up);
      _photoUplights.push(up);

      var pr = A.ifc2three(fx, fy, roofZ);
      var down = new THREE.PointLight(0xffcf9a, PHOTO_FACADE_DOWN_BASE, 16, 2);
      down.position.set(pr.x, pr.y - 0.3, pr.z);
      A.scene.add(down);
      _photoUplights.push(down);

      var midThree = A.ifc2three(midIfcX, midIfcY, groundZ);
      _photoFacadeLights.push({
        mid: { x: midThree.x, z: midThree.z },
        normalThree: { x: n[0], z: -n[1] },  // ifc2three: three.z = -(ifc.y - offset)
        up: up, down: down
      });
    }

    // §PHOTO_ADDONS (user ask, from RealistHospital.jpeg reference analysis): three discrete,
    // real-data-driven fixtures the reference image relies on, instead of another broad wash —
    // roof-corner twin spotlight, entry-door sconces, tree uplighting. All derived from REAL
    // element positions (doors/vegetation queried fresh), not fabricated placement, addressing
    // the same bbox-approximation weakness Hospital exposed in the facade-wash lights above.
    // Roof-corner twin spotlight: two tiny bright points at ONE roof corner (picked per-trigger,
    // nearest the camera — see _updateRoofCornerSpotlight), matching the reference's single
    // hero highlight rather than uniform coverage.
    _photoRoofCorners = corners.map(function(c) { return A.ifc2three(c[0], c[1], roofZ); });
    var _rc = new THREE.PointLight(0xfff2d0, 10, 10, 1.8);
    var _rc2 = new THREE.PointLight(0xfff2d0, 8, 8, 1.8);
    A.scene.add(_rc); A.scene.add(_rc2);
    _photoRoofSpotA = _rc; _photoRoofSpotB = _rc2;
    _photoUplights.push(_rc, _rc2);  // reuse existing show/hide + dispose list

    // Entry-door sconces: real IfcDoor positions, lowest storeys first (proxy for ground-floor
    // entries — good enough without a full exterior-perimeter check), capped to avoid clutter.
    if (A.dbQuery) {
      var _doors = A.dbQuery(
        "SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et " +
        "JOIN elements_meta em ON et.guid = em.guid WHERE em.ifc_class = 'IfcDoor' " +
        "ORDER BY et.center_z ASC LIMIT 6"
      );
      for (var di = 0; di < _doors.length; di++) {
        var dp = A.ifc2three(_doors[di][0], _doors[di][1], _doors[di][2]);
        var sconce = new THREE.PointLight(0xffcf9a, 4, 6, 1.6);
        sconce.position.set(dp.x, dp.y + 2.1, dp.z);
        A.scene.add(sconce);
        _photoUplights.push(sconce);
      }
    }

    // Tree uplighting: real vegetation elements (name-keyword match — same technique already
    // used to confirm Hospital's 589 real trees exist), capped to a modest sample for perf —
    // reads as "the trees are lit" without a per-tree light-count explosion.
    if (A.dbQuery) {
      var _trees = A.dbQuery(
        "SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et " +
        "JOIN elements_meta em ON et.guid = em.guid " +
        "WHERE lower(em.element_name) LIKE '%tree%' OR lower(em.element_name) LIKE '%plant%' " +
        "LIMIT 15"
      );
      for (var ti = 0; ti < _trees.length; ti++) {
        var tp = A.ifc2three(_trees[ti][0], _trees[ti][1], _trees[ti][2]);
        var treeLight = new THREE.PointLight(0xffddaa, 2.5, 4, 1.8);
        treeLight.position.set(tp.x, tp.y + 0.3, tp.z);
        A.scene.add(treeLight);
        _photoUplights.push(treeLight);
      }
      console.log('§PHOTO_ADDONS doors=' + Math.min(_doors ? _doors.length : 0, 6) + ' trees=' + _trees.length);
    }

    // Distant skyline silhouette (full ring — robust to any orbit angle, per user's own
    // "different angle later" expectation) + sparkled window-lights, dusk-city look.
    // §PHOTO_SKYLINE_DENSER (user ask, "we need more building silhouette" — the original radius
    // (envelope*4) put these so far out they subtended almost no visible angle from a normal
    // camera position, reading as tiny specks. Pulled closer + bigger + more of them.
    var envelope = Math.max(w, d, 50);
    var radius = envelope * 2.2;
    var group = new THREE.Group();
    var winPos = [], winCol = [];
    var N = 40;
    // §PHOTO_SKYLINE_SUN_GAP (user ask, "silhouette buildings too close, obscure the Sun"):
    // computed via real vectors, not a hand-derived angle offset between the skyline loop's
    // IFC-plane angle and the sun's azimuth-driven THREE-space direction (fragile to get right by
    // hand across two different coordinate conventions) — just compare each candidate box's actual
    // THREE-space direction from the building center against the sun's actual THREE-space
    // direction, and skip the box if it falls inside the clearance cone. General to any building/
    // any sun angle, nothing hardcoded.
    var _skyCenterThree = A.ifc2three(cx, cy, groundZ);
    var _sunClearDot = null;
    if (A.sun) {
      var _sLen = Math.hypot(A.sun.position.x, A.sun.position.z);
      if (_sLen > 1) {
        var _sdx = A.sun.position.x / _sLen, _sdz = A.sun.position.z / _sLen;
        _sunClearDot = { x: _sdx, z: _sdz, minDot: Math.cos(THREE.MathUtils.degToRad(18)) };
      }
    }
    for (var i = 0; i < N; i++) {
      var ang = (i / N) * Math.PI * 2;
      var bw = 18 + Math.random() * 32, bh = 20 + Math.random() * 60;
      var bx = cx + Math.cos(ang) * radius, by = cy + Math.sin(ang) * radius;
      var base = A.ifc2three(bx, by, groundZ);
      if (_sunClearDot) {
        var _dx = base.x - _skyCenterThree.x, _dz = base.z - _skyCenterThree.z;
        var _dLen = Math.hypot(_dx, _dz) || 1;
        var _dot = (_dx / _dLen) * _sunClearDot.x + (_dz / _dLen) * _sunClearDot.z;
        if (_dot > _sunClearDot.minDot) continue;  // leave a clear gap for the sun, skip this box
      }
      // §PHOTO_SKYLINE_SUN_REACT (2026-07-16, user ask, "the silhouette if also react to the
      // Sun"): reuses the SAME real sun-direction dot product just computed for the gap-clearance
      // check above — boxes on the sun-facing arc (closer to the sun's own direction, but still
      // outside the clearance cone) get a subtle warm rim-brighten, boxes on the far side of the
      // ring stay exactly as dark/cool as before. General to any building/sun angle, no new query.
      var sunFacing = _sunClearDot ? Math.max(0, _dot) : 0;  // 0 (far side) .. ~0.95 (near the gap edge)
      var warmBoost = sunFacing * 0.10;
      var shade = 0.06 + Math.random() * 0.07;
      var box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(
          shade * 0.9 + warmBoost * 1.3, shade * 0.85 + warmBoost * 0.9, shade * 1.15 + warmBoost * 0.5
        ) }));
      box.position.set(base.x, base.y + bh / 2, base.z);
      group.add(box);
      // §PHOTO_SKYLINE_WINDOW_OCCLUSION (2026-07-16, real bug — "lights not visible on the
      // silhouette buildings"): window-light points used to be scattered randomly through the
      // box's HORIZONTAL FOOTPRINT (both X and Z randomized within bw), which places most of them
      // INSIDE the box's own solid volume — depth-occluded by the box's own nearest opaque wall
      // from any outside viewing angle. Confirmed via screenshot: the Points object existed,
      // visible=true, 4308 points, yet zero were actually visible on any skyline box. Fix: place
      // each point on one of the box's 4 vertical FACE planes (a small outward epsilon so it
      // isn't z-fighting the box's own surface), like a real building's window grid — not
      // scattered through the interior.
      var winCount = Math.floor((bw * bh) / 14);
      for (var wi = 0; wi < winCount; wi++) {
        var face = Math.floor(Math.random() * 4);
        var along = (Math.random() - 0.5) * bw * 0.9;
        var wy = base.y + Math.random() * bh * 0.9 + 2;
        var wx, wz, eps = 0.15;
        if (face === 0) { wx = base.x + bw / 2 + eps; wz = base.z + along; }
        else if (face === 1) { wx = base.x - bw / 2 - eps; wz = base.z + along; }
        else if (face === 2) { wx = base.x + along; wz = base.z + bw / 2 + eps; }
        else { wx = base.x + along; wz = base.z - bw / 2 - eps; }
        winPos.push(wx, wy, wz);
        if (Math.random() > 0.25) winCol.push(1.0, 0.8 + Math.random() * 0.2, 0.5 + Math.random() * 0.3); // warm window
        else winCol.push(0.6, 0.75, 1.0); // occasional cool/blue window
      }
    }
    A.scene.add(group);
    _photoSkyline = group;
    var winGeo = new THREE.BufferGeometry();
    winGeo.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
    winGeo.setAttribute('color', new THREE.Float32BufferAttribute(winCol, 3));
    _photoSkylineLights = new THREE.Points(winGeo, new THREE.PointsMaterial({
      size: 2.4, map: _getSkylineWindowTexture(), alphaTest: 0.02, vertexColors: true,
      sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false
    }));
    A.scene.add(_photoSkylineLights);
    console.log('§PHOTO_PROPS built uplights=' + _photoUplights.length + ' skylineBoxes=' + group.children.length + ' windowLights=' + (winPos.length / 3));

    // §PHOTO_SPARKLE (user ask: "some sparkle where it hits right angle from Sun to surface" —
    // reference `relfectsunlight.jpg`: a soft warm glow, not a hard geometric shape). One sprite
    // per facade-wash edge (reuses the SAME mid/normal already computed above, no new geometry
    // query), reusing the sun's own lensflare technique (canvas radial gradient, additive sprite —
    // scene.js §S277f) rather than a new shader. Visibility/size/opacity driven every reassert
    // tick by the Blinn-Phong half-vector test (dot(normalize(toSun+toCam), facadeNormal)) — the
    // same physically-standard "specular highlight" condition, just applied to a real facade point
    // instead of a per-pixel shader term. A thin cross-streak is layered on top of the glow per
    // "we can have sharp spikes too" — kept subtle so the soft glow (the actual reference) still
    // dominates. (_photoSparkles already cleared by _disposePhotoProps, always called right
    // before this function — see line ~445.)
    var _sparkTex = _getSparkleTexture();
    var sparklePts = _buildSparklePoints(cx, cy);
    var _sparkFlatN = 0, _sparkRoundN = 0;
    if (!sparklePts.length) {
      // Fallback only — a building with no matching IfcWall/CurtainWall/Plate/Member rows at all
      // (rare). Keeps the old invented bbox-rectangle points so sparkle never goes fully empty,
      // same discipline as the door-sconce/tree-uplight addons falling back gracefully above.
      for (var si = 0; si < corners.length; si++) {
        var c1s = corners[si], c2s = corners[(si + 1) % 4];
        var midIfcXs = (c1s[0] + c2s[0]) / 2, midIfcYs = (c1s[1] + c2s[1]) / 2;
        var midHeightThree = A.ifc2three(midIfcXs, midIfcYs, (groundZ + roofZ) / 2);
        var ns = normalsIfc[si];
        sparklePts.push({ mid3: midHeightThree, normalThree: { x: ns[0], z: -ns[1] }, dotMin: PHOTO_SPARKLE_DOT_MIN_FLAT });
      }
    }
    sparklePts.forEach(function(sp) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _sparkTex, transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      sprite.visible = false;
      sprite.renderOrder = 997;
      A.scene.add(sprite);
      if (sp.dotMin === PHOTO_SPARKLE_DOT_MIN_ROUND) _sparkRoundN++; else _sparkFlatN++;
      _photoSparkles.push({ sprite: sprite, mid3: sp.mid3, normalThree: sp.normalThree, dotMin: sp.dotMin });
    });
    console.log('§PHOTO_SPARKLE_REBUILD points=' + _photoSparkles.length + ' flat=' + _sparkFlatN + ' round=' + _sparkRoundN);
  }
  // §PHOTO_FACING: recomputed FRESH every call from A.camera's CURRENT position/orientation —
  // deliberately NOT cached alongside the building-level fixture cache above. This is the exact
  // bug already found+fixed once this session for the removed edge-lining (a second Alt+S from a
  // different angle silently reused the first angle's facing) — don't reintroduce it here by
  // caching this result anywhere.
  function _updateFacadeFacingLights() {
    var facings = _photoFacadeLights.map(function(f) {
      var toCam = { x: A.camera.position.x - f.mid.x, z: A.camera.position.z - f.mid.z };
      var tcLen = Math.hypot(toCam.x, toCam.z) || 1;
      return (f.normalThree.x * toCam.x + f.normalThree.z * toCam.z) / tcLen;  // [-1, 1]
    });
    // §PHOTO_ROOF_CORNER (user ask: "standard for the BACK portion of any building" — the twin
    // spotlight AND a stronger ground spotlight belong on the LEAST camera-facing edge, not the
    // front). backIdx computed first so the strength loop below can special-case it.
    var backIdx = 0;
    for (var fi = 1; fi < 4; fi++) { if (facings[fi] < facings[backIdx]) backIdx = fi; }
    _photoFacadeLights.forEach(function(f, i) {
      var facingFrac = Math.max(0, Math.min(1, facings[i]));  // 0 (away/edge-on) .. 1 (directly facing)
      var strength = PHOTO_FACADE_DIM_FRACTION + (1 - PHOTO_FACADE_DIM_FRACTION) * facingFrac;
      if (i === backIdx) strength *= PHOTO_BACK_ACCENT_BOOST;  // ground-based spotlight, back portion
      f.up.intensity = PHOTO_FACADE_UP_BASE * strength;
      f.down.intensity = PHOTO_FACADE_DOWN_BASE * strength;
    });
    // Recomputed fresh here alongside the facade wash, same discipline (never cached across triggers).
    if (_photoRoofSpotA && _photoRoofCorners.length === 4 && facings.length === 4) {
      var c1 = _photoRoofCorners[backIdx], c2 = _photoRoofCorners[(backIdx + 1) % 4];
      _photoRoofSpotA.position.set(c1.x, c1.y + 0.5, c1.z);
      _photoRoofSpotB.position.set(c1.x + (c2.x - c1.x) * 0.15, c1.y + 0.4, c1.z + (c2.z - c1.z) * 0.15);
    }
    console.log('§PHOTO_FACING facades=' + _photoFacadeLights.length + ' strengths=' +
      _photoFacadeLights.map(function(f) { return (f.up.intensity / PHOTO_FACADE_UP_BASE).toFixed(2); }).join(','));
  }
  function _showPhotoProps(show) {
    if (show && (!_photoUplights.length || _photoPropsBuilding !== A.activeBuilding)) {
      _disposePhotoProps();
      _buildPhotoProps();
    }
    if (show) _updateFacadeFacingLights();
    _photoUplights.forEach(function(l) { l.visible = show; });
    if (_photoSkyline) _photoSkyline.visible = show;
    if (_photoSkylineLights) _photoSkylineLights.visible = show;
  }
  // §PHOTO_STAGING (2026-07-15, POC — presentation only, not extracted BIM data): bundles the
  // sunset sky + amber building glow + the ground/edge/skyline props above into the SAME
  // still-refine trigger, all auto-reverting on teardown exactly like the texture toggle.
  // Reuses A.toggleNightMode()'s existing fixture-glow mechanism (synthetic per-storey fallback
  // already built for buildings with zero real IfcLightFixture data) rather than duplicating it,
  // then immediately restores the non-glow (sun/ambient/hemi/exposure/fog) side effects
  // toggleNightMode also applies — we want the amber glow, not night's moonlight override, since
  // the sunset sky set up above is the intended mood, not full night-black.
  // §PHOTO_STAGING_NO_SHADOW (2026-07-15, user ask): dropped toggleShadow() entirely — sky-only,
  // no ground/shadow-cycling. Simpler, and the sky alone already reads as the target evening mood.
  // §PHOTO_STAGING_GROUND (2026-07-15, user ask): dropping toggleShadow() also hid A.ground
  // entirely (pure black void, user-observed live) — restore a real ground plane directly,
  // using the existing earth texture + a warm dusk tint, without engaging the shadow-cycle
  // machinery. User confirmed this is meant to be an elaborate, deliberately-expensive prep —
  // don't hold back on this just because it's more code than a flat color.
  // §PHOTO_WARM_SUN (resume-brief item 3): the building's own walls used to get the ORIGINAL
  // daytime-neutral sun/ambient/hemi colors restored here — right call to avoid moonlight-blue,
  // but it meant the walls themselves never got a deliberate evening treatment, only the
  // separate light props around them changed. These are global, building-INDEPENDENT constants
  // (no per-building numbers) — a genuine golden-hour warm tint, distinct from both neutral
  // daylight and toggleNightMode's moonlight-blue, applied as a scale/hex-override on top of
  // this building's own saved daytime baseline (A._nightSaved), not a replacement of it.
  var PHOTO_SUN_COLOR = 0xffa55c;       // warm golden-hour sun, not neutral white
  var PHOTO_AMBIENT_COLOR = 0x8a6a55;   // warm dim ambient — shadow side reads dusk-toned, not grey
  var PHOTO_HEMI_SKY_COLOR = 0x6a5a7a;  // dusky violet-warm sky half of the hemi light
  var PHOTO_SUN_INTENSITY_SCALE = 0.7;  // dimmer than full daylight — evening, not noon
  var PHOTO_EXPOSURE_SCALE = 0.85;      // slightly underexposed overall — "materials in little light"
  // §PHOTO_SUN_REFLECTION (user ask, continued session — "get the Sun reflection beautiful
  // realistic surface material impact correct firsts"): three things were found reading the
  // existing sun/sky code rather than adding a new one:
  // 1. A.updateSky(elevation, azimuth) ALREADY repositions the real A.sun DirectionalLight to
  //    match the sky's visual sun disc, AND already drives an existing lensflare sprite
  //    (scene.js §S277f) whose intensity is naturally strongest near the horizon — this IS the
  //    "sun reflection" the user already sees correlate with camera angle. It was never broken.
  // 2. But A.renderer.toneMappingExposure gets scaled down (PHOTO_EXPOSURE_SCALE) for the
  //    "materials in little light" mood — and THREE.SpriteMaterial is tone-mapped by default, so
  //    that same exposure cut was ALSO dimming the lensflare, undercutting exactly the glare a
  //    real dusk photo would still show brightly. Fix: mark the flare sprites toneMapped=false
  //    for the photoshoot only, so exposure affects the building but not the sun glare.
  // 3. A.sun.position/A.sun.target.position were never saved/restored — after a photoshoot, the
  //    sun stayed aimed at the dusk direction forever, silently wrong-lighting normal daytime
  //    navigation afterward. Fixed here alongside the elevation change since it's the same code path.
  var PHOTO_SUN_ELEVATION = 6;    // was 8 — lower = longer/more dramatic dusk shadows, still above
                                   // Preetham's near-black cutoff (TM's own dawn/dusk boost kicks in <10°)
  var PHOTO_SUN_AZIMUTH = 200;
  var PHOTO_ENVMAP_BOOST = 3.0;   // multiply each material's existing envMapIntensity — stronger
                                   // glass/metal reflections without changing overall scene exposure
                                   // (history: 2.2 -> 3.2 -> 4.5 -> 3.0. The 4.5 step, combined with
                                   // the §PHOTO_ENVMAP_STALE fix below finally pointing every
                                   // material at the CORRECT dusk env map, made the glint work for
                                   // the first time — but also overshot: user reported "all shadows
                                   // on building are gone." Root cause of THAT: env-map/IBL
                                   // reflection is NOT shadow-map-occluded in three.js (same class of
                                   // bug as the earlier ground-emissive landmine above) — and the old
                                   // gate below applied the boost to EVERY material, not just
                                   // glass/metal, because `envMapIntensity` defaults to 1.0 (a
                                   // number) on ALL MeshStandardMaterial regardless of roughness, so
                                   // the `typeof m.envMapIntensity !== 'number'` check never actually
                                   // excluded plain concrete/plaster walls. Fixed by gating on
                                   // glossiness below; boost itself also dialed back one notch
                                   // per "glint is slightly too much."
  var PHOTO_GLOSSY_ROUGHNESS_MAX = 0.5;  // only materials this glossy or better (glass ~0.05-0.08,
                                          // tightened/native metal ~0.3-0.5) get the envMap boost —
                                          // excludes concrete/plaster/wood (STD_MAT rough 0.6-0.95),
                                          // whose shadow-darkened diffuse read must stay untouched.
  // §PHOTO_HOTSPOT (user ask: "tiny bright reflect off any part of the building that is steel or
  // smooth... just like a real scene" — the direct-glint effect you get when the sun is roughly
  // behind the camera, reflecting straight back off any glossy surface). envMapIntensity alone
  // boosts the SOFT ambient reflection; a crisp small "hotspot" specular highlight also needs
  // low roughness. Only touches materials already classed metallic (metalness>0.3 — same threshold
  // streaming.js's own STD_MAT table already uses for "metal" elsewhere), not every surface.
  var PHOTO_METAL_THRESHOLD = 0.3;
  var PHOTO_METAL_ROUGHNESS_SCALE = 0.4;  // tighter/brighter specular highlight (was 0.6)
  // §PHOTO_HEMI_FILL (user ask, "Ground still too dark"): re-read _setGroundColor (tools.js) and
  // found the actual bug — when the ground has a texture map (which it does, 'paved'), that
  // function IGNORES whatever hex tint is passed and forces plain WHITE (full brightness, no
  // darkening) as long as the tint's own channel-sum isn't very dark. So the ground was ALREADY
  // rendering at maximum brightness for its given light level — no tint could ever make it
  // brighter than that. The real cause is physical: PHOTO_SUN_ELEVATION=6 degrees is a nearly
  // horizontal ray — a horizontal ground plane's illumination from a directional light scales
  // with sin(elevation) (~10% at 6 degrees), while a VERTICAL facade gets nearly full illumination
  // from the same ray (cos of a near-90-degree incidence) — the dramatic-facade / dim-ground
  // split is real dusk-lighting physics, not a bug. Fix: boost the hemisphere/ambient fill
  // (omnidirectional sky light, doesn't depend on the sun's grazing angle) specifically for the
  // photoshoot, like a photographer's fill card compensating for what direct light can't reach.
  // §PHOTO_CONTRAST_DIALBACK (user reported "Shadows? None on the ground" + roof/ground spotlights
  // not distinctly visible right after 1.6/1.3 shipped): a strong blanket fill flattens the whole
  // scene toward the same brightness, which dilutes the RELATIVE contrast the shadow and the
  // discrete point-light addons depend on to read as distinct. Dialed back — some lift over the
  // raw sin(6 deg) ground darkness, not enough to wash out contrast.
  var PHOTO_HEMI_INTENSITY_SCALE = 1.25;
  var PHOTO_AMBIENT_INTENSITY_SCALE = 1.15;
  var _photoSunPosSaved = null, _photoSunTargetSaved = null;
  var _photoFlarePrevTone = null, _photoHaloPrevTone = null;
  var _photoEnvBoostedMats = [];
  var _photoMatBoostActive = false;
  // §PHOTO_STREAMING_RACE (user ask, continued — "shadows on rooftop still not there"): the
  // original one-shot traverse (both for shadow-casting AND the material envMap/roughness boost)
  // only covers whatever meshes/materials exist in A.scene/A._matCache at the EXACT moment Alt+S
  // fires. Hospital's rooftop content (589 trees, helipad, 567 solar panels — confirmed real via
  // direct DB query, not guessed) may stream/load lazily and not exist yet at that instant — the
  // one-shot push would silently skip them forever, the same class of bug already found+fixed
  // once this session for the triplanar shader uniform (§TRIPLANAR_RECOMPILE_FIX), just not
  // applied here the first time. Fix: re-run both traversals every accumulation frame (idempotent
  // — already-flagged objects/materials are skipped instantly) from startStillRefine's step()
  // loop below, so anything that streams in mid-accumulation still gets caught within the same
  // still-refine, not just at the first instant.
  function _reassertPhotoShadowCoverage() {
    if (!_photoShadowSelfEnabled || !A.scene) return;
    var changed = false;
    A.scene.traverse(function(o) {
      if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && !o.castShadow) {
        o.castShadow = true; o.receiveShadow = true; changed = true;
      }
    });
    if (changed && A.renderer) A.renderer.shadowMap.needsUpdate = true;
  }
  // §PHOTO_ENVMAP_STALE (user ask: "sunlight bounce has not occurred even once" — found the real
  // cause, not a tuning miss): streaming.js assigns each material's `.envMap` ONCE, at streaming
  // time, from whatever `A._envMap` was then — Hospital's 63,182 elements finish streaming almost
  // immediately on page load, long before Alt+S, so every material is permanently locked to the
  // DAYTIME env map baked at startup (sun elevation 45°/azimuth 180°, scene.js:225). The dusk
  // photoshoot repositions the real sun + regenerates a fresh env map (`A.updateSky`'s throttled
  // `_pmrem.fromScene`, scene.js:204-212) but never pushes that new texture back onto existing
  // materials — they kept reflecting a sun that isn't where the dusk scene actually put it, so no
  // camera angle could ever catch a correctly-aligned glint. Fix: refresh `.envMap` from the
  // CURRENT `A._envMap` unconditionally, every reassert tick (cheap reference swap) — decoupled
  // from the one-time `_photoBoosted` intensity/roughness flag below, since the fresh dusk texture
  // can arrive (2s-throttled) well after a material was already flagged boosted.
  function _reassertPhotoEnvMap() {
    if (!A._matCache || !A._envMap) return;
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (m && 'envMap' in m && m.envMap !== A._envMap) { m.envMap = A._envMap; m.needsUpdate = true; }
    });
  }
  function _reassertPhotoMatBoost() {
    if (!_photoMatBoostActive || !A._matCache) return;
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (!m || (m.userData && m.userData._photoBoosted) || typeof m.envMapIntensity !== 'number') return;
      var isMetal = typeof m.metalness === 'number' && m.metalness > PHOTO_METAL_THRESHOLD;
      var isGlossy = isMetal || (typeof m.roughness === 'number' && m.roughness <= PHOTO_GLOSSY_ROUGHNESS_MAX);
      if (isGlossy) {
        m.userData._photoOrigEnvMapIntensity = m.envMapIntensity;
        m.envMapIntensity = m.envMapIntensity * PHOTO_ENVMAP_BOOST;
      }
      if (isMetal) {
        m.userData._photoOrigRoughness = m.roughness;
        m.roughness = Math.max(0.05, m.roughness * PHOTO_METAL_ROUGHNESS_SCALE);
      }
      m.userData._photoBoosted = true;
      m.needsUpdate = true;
      if (isGlossy) _photoEnvBoostedMats.push(m);
    });
  }
  // §PHOTO_DUSK_SHADOWS: real shadow-casting at the dusk sun angle (the "long shadow... dramatic
  // Sun at dusk as shown in Time Machine" ask) — reuses time_machine.js's own proven sun-cycle
  // shadow mechanics (real castShadow/receiveShadow traverse + shadow-camera frustum sized to the
  // building envelope), NOT reinvented, just triggered from here instead of the 'h' Shadow pill.
  // If the user's OWN Shadow mode is already on, this leaves it alone entirely — never double-set.
  var _photoShadowSelfEnabled = false;
  function _enablePhotoShadows() {
    if (A._shadowOn) { _photoShadowSelfEnabled = false; return; }  // user's own Shadow mode active — don't touch
    if (!A.sun || !A.renderer || !A.scene) return;
    _photoShadowSelfEnabled = true;
    if (!A._shadowInited) {
      A.renderer.shadowMap.enabled = true;
      A.renderer.shadowMap.type = THREE.PCFShadowMap;
      A.renderer.shadowMap.autoUpdate = (window._shadowAutoUpdate === true);
      A._shadowInited = true;
    }
    A.sun.castShadow = true;
    var _ctr = A.controls ? A.controls.target : { x: 0, y: 0, z: 0 };
    A.sun.target.position.copy(_ctr);
    A.sun.target.updateMatrixWorld();
    var _env = 300;
    var _bc = Object.values(A.buildingCentres || {})[0];
    if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
    _env = Math.max(_env, 50);
    // NOTE: computed AFTER A.updateSky() has already positioned A.sun at the dusk direction (see
    // call order in _applyPhotoStaging below) — using the ORIGINAL toggleShadow() order (frustum
    // math before the sun is repositioned) would size this frustum for the wrong sun distance.
    var _sunDist = A.sun.position.distanceTo(_ctr);
    A.sun.shadow.mapSize.width = 2048;
    A.sun.shadow.mapSize.height = 2048;
    A.sun.shadow.camera.near = Math.max(1, _sunDist * 0.05);
    A.sun.shadow.camera.far = _sunDist * 4;
    A.sun.shadow.camera.left = -_env;
    A.sun.shadow.camera.right = _env;
    A.sun.shadow.camera.top = _env;
    A.sun.shadow.camera.bottom = -_env;
    A.sun.shadow.bias = -0.0005;
    A.sun.shadow.camera.updateProjectionMatrix();
    if (A.ground) A.ground.receiveShadow = true;
    var _shadowList = [];
    A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _shadowList.push(o); });
    var _si = 0;
    (function _chunk() {
      var end = Math.min(_si + 5000, _shadowList.length);
      for (; _si < end; _si++) { var o = _shadowList[_si]; if (o.visible) { o.castShadow = true; o.receiveShadow = true; } }
      A.renderer.shadowMap.needsUpdate = true;
      if (_si < _shadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW enabled casters=' + _shadowList.length + ' sunDist=' + _sunDist.toFixed(0) + ' env=' + _env);
    })();
  }
  function _disablePhotoShadows() {
    if (!_photoShadowSelfEnabled) return;
    _photoShadowSelfEnabled = false;
    A.sun.castShadow = false;
    var _unshadowList = [];
    A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _unshadowList.push(o); });
    var _ui = 0;
    (function _chunk() {
      var end = Math.min(_ui + 5000, _unshadowList.length);
      for (; _ui < end; _ui++) { _unshadowList[_ui].castShadow = false; _unshadowList[_ui].receiveShadow = false; }
      if (_ui < _unshadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW disabled');
    })();
  }
  var _photoNightWasOn = false, _photoSkyWasVisible = false;
  var _photoGroundWasVisible = false, _photoGroundPrevKey = null, _photoGroundPrevColor = null;
  var _photoFogColorSaved = null, _photoFogDensitySaved = null;
  var _photoSkyUniSaved = null;
  // §PHOTO_VARIATION (2026-07-16, user spec): "each time it is done first time it returns a diff
  // and once user agrees, press 'cinema' icon, it takes that persisted cache." A single random
  // seed (`A._photoPaintSeed`) drives every randomized presentation touch (ground puddle
  // placement here; surface paint jitter in streaming.js's triplanar shader). Re-rolled on every
  // Alt+S trigger while unlocked (so repeated triggers let the user browse different results);
  // A.startCinemaOrbit() locks it so the capture uses whichever variation was on screen when the
  // user pressed the button, and it stays locked for the rest of the session. No explicit clear-
  // on-close/Home code needed: `A._photoPaintSeed` is plain in-memory JS state and Home navigates
  // via a real `location.href` page reload (panels.js), which destroys it for free — matching
  // "clears each time viewer closes or returns to Home" without any extra plumbing.
  var _photoVariationLocked = false;
  function _seededRand(seed) { var s = Math.sin(seed * 12345.6789) * 43758.5453; return s - Math.floor(s); }
  // §PHOTO_PUDDLE (user ask: "wet ground... selective reflection over selective areas" — not an
  // even wet sheen, real puddles). A small fixed count of randomly-placed circular wet patches
  // (seeded, so reproducible while the variation is locked), each lowering roughness/darkening
  // diffuse ONLY inside its radius via a ground-material onBeforeCompile injection — same gated,
  // still-render-only pattern already proven for the triplanar textures (streaming.js), reusing
  // the EXISTING ground envMapIntensity (scene.js, 0.15) rather than adding a new one: lower
  // roughness alone makes a GGX/IBL reflection read sharper/more visible at the same intensity,
  // so this is real reflective play without re-touching the hemi/ambient landmine already
  // documented earlier in this file.
  var PHOTO_PUDDLE_COUNT = 6;
  var _groundPuddleShaderWired = false;
  var _puddleSeedBuilt = null, _puddleCenters = [], _puddleRadii = [];
  function _buildGroundPuddles(cx, cy) {
    var seed = A._photoPaintSeed || 0;
    if (_puddleSeedBuilt === seed && _puddleCenters.length) return;
    _puddleSeedBuilt = seed;
    _puddleCenters = []; _puddleRadii = [];
    var bbox = _buildingBBoxIfc();
    var envelope = bbox ? Math.max(bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin, 30) : 40;
    for (var i = 0; i < PHOTO_PUDDLE_COUNT; i++) {
      var rx = _seededRand(seed + i * 0.618034 + 0.11) - 0.5;
      var rz = _seededRand(seed + i * 0.618034 + 0.37) - 0.5;
      var rr = _seededRand(seed + i * 0.618034 + 0.59);
      var pos = A.ifc2three(cx + rx * envelope * 1.4, cy + rz * envelope * 1.4, 0);
      _puddleCenters.push({ x: pos.x, z: pos.z });
      _puddleRadii.push(2 + rr * (envelope * 0.09));
    }
  }
  function _applyPuddleUniforms(shader) {
    var n = Math.min(_puddleCenters.length, 8);
    shader.uniforms.uPuddleCount.value = n;
    for (var i = 0; i < n; i++) {
      shader.uniforms.uPuddleCenters.value[i].set(_puddleCenters[i].x, _puddleCenters[i].z);
      shader.uniforms.uPuddleRadii.value[i] = _puddleRadii[i];
    }
  }
  function _wireGroundPuddleShader() {
    if (_groundPuddleShaderWired || !A.ground) return;
    _groundPuddleShaderWired = true;
    var mat = A.ground.material;
    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uPuddleActive = { value: 0.0 };
      shader.uniforms.uPuddleCount = { value: 0 };
      shader.uniforms.uPuddleCenters = { value: (new Array(8)).fill(null).map(function() { return new THREE.Vector2(); }) };
      shader.uniforms.uPuddleRadii = { value: new Float32Array(8) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorldPos;')
        .replace('#include <worldpos_vertex>', [
          '#include <worldpos_vertex>',
          'vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        ].join('\n'));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec3 vGroundWorldPos;',
          'uniform float uPuddleActive;',
          'uniform int uPuddleCount;',
          'uniform vec2 uPuddleCenters[8];',
          'uniform float uPuddleRadii[8];'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', [
          '#include <roughnessmap_fragment>',
          'if (uPuddleActive > 0.5) {',   // uniform branch — near-zero cost when off (normal nav)
          '  float wetness = 0.0;',
          '  for (int pi = 0; pi < 8; pi++) {',
          '    if (pi >= uPuddleCount) break;',
          '    float d = distance(vGroundWorldPos.xz, uPuddleCenters[pi]);',
          '    float w = 1.0 - smoothstep(uPuddleRadii[pi] * 0.55, uPuddleRadii[pi], d);',
          '    wetness = max(wetness, w);',
          '  }',
          '  roughnessFactor = mix(roughnessFactor, 0.08, wetness);',
          '  diffuseColor.rgb *= mix(1.0, 0.72, wetness);',  // wet patches read darker/more saturated
          '}'
        ].join('\n'));
      mat.userData.puddleShader = shader;
      shader.uniforms.uPuddleActive.value = A._stillRefineActive ? 1.0 : 0.0;
      _applyPuddleUniforms(shader);
    };
    // §PHOTO_PUDDLE self-heal: same recompile-resets-uniforms landmine already found+fixed once
    // this session for the triplanar shader (§TRIPLANAR_RECOMPILE_FIX) — re-assert every frame
    // instead of relying on a single push at compile time.
    mat.onBeforeRender = function() {
      var sh = mat.userData.puddleShader;
      if (sh) { sh.uniforms.uPuddleActive.value = A._stillRefineActive ? 1.0 : 0.0; _applyPuddleUniforms(sh); }
    };
    mat.needsUpdate = true;
  }
  function _applyPhotoStaging() {
    // §PHOTO_VARIATION: roll (or keep locked) the shared seed before anything below reads it.
    if (!_photoVariationLocked || A._photoPaintSeed == null) A._photoPaintSeed = Math.random();
    _wireGroundPuddleShader();
    var _pbbox = _buildingBBoxIfc();
    if (_pbbox) _buildGroundPuddles((_pbbox.xMin + _pbbox.xMax) / 2, (_pbbox.yMin + _pbbox.yMax) / 2);
    console.log('§PHOTO_PAINT_SEED seed=' + A._photoPaintSeed.toFixed(4) + ' locked=' + _photoVariationLocked +
      ' puddles=' + _puddleCenters.length);
    _photoGroundWasVisible = !!(A.ground && A.ground.visible);
    _photoGroundPrevKey = A._groundTexKey || null;
    _photoGroundPrevColor = A._groundSolidColor;
    if (A.ground && A._applyGroundTexture && A._calcGroundY) {
      A.ground.visible = true;
      A._calcGroundY();
      // §PHOTO_GROUND_LIT (user ask, "It is almost black"): was 'earth' + a dark 0x6a5238 tint —
      // too dark once the evening exposure/ambient cuts also apply on top of it. Switched to the
      // existing 'paved' texture (same real asset Shadow mode already uses — concrete look, per
      // user's own suggestion) with a much brighter warm tint. Fancier grass+paved-rectangle
      // pattern is a separate later experiment, not needed just to fix "too dark."
      A._applyGroundTexture('paved');
      if (A._setGroundColor) A._setGroundColor(0xd9c39a);  // bright warm sunlit-concrete tone
      // §PHOTO_GROUND_WHITE_REVERTED (user reported "Shadows? None on the ground" right after
      // this shipped): a flat emissive add is NOT shadow-map-occluded at all in three.js — it
      // washes out relative contrast between the sun's shadowed and lit ground patches, which is
      // likely exactly what killed shadow visibility. Reverted; ground brightness now comes ONLY
      // from real texture + hemi/ambient (both of which DO preserve shadow contrast, since they
      // light shadowed/unshadowed ground unequally) + fog haze at distance (see PHOTO_FOG below).
    }
    // §PHOTO_FOG (user ask: "ground goes dark in distance too much.. can be bright and foggy in
    // the distance"): the scene's default fog (scene.js) is a dark blue-purple (0x1a1a2e) — at
    // Hospital's scale that DARKENS the distant ground further, the opposite of what's wanted.
    // Override with a warm hazy tone matching the dusk horizon for the photoshoot only. Save the
    // ORIGINAL color/density here (before any of this function's changes) so teardown restores the
    // true pre-photoshoot state — the actual override is applied AFTER A.updateSky() below, see
    // §PHOTO_FOG_ORDER_FIX.
    if (A.scene && A.scene.fog) {
      _photoFogColorSaved = A.scene.fog.color.getHex();
      _photoFogDensitySaved = A.scene.fog.density;
    }
    _photoSkyWasVisible = !!(A._sky && A._sky.visible);
    if (A.sun) {
      _photoSunPosSaved = A.sun.position.clone();
      _photoSunTargetSaved = A.sun.target.position.clone();
    }
    if (A._sky && A.updateSky) { A._sky.visible = true; A.updateSky(PHOTO_SUN_ELEVATION, PHOTO_SUN_AZIMUTH); }
    // §PHOTO_SKY_DRAMA (user ask: "more dramatic sky... reddish clouds in the distance"): Preetham
    // (Sky.js) is a clear-sky atmospheric-scattering model — it has no cloud geometry/texture at
    // all, so literal cloud SHAPES aren't something this shader can produce (a separate textured-
    // layer feature, not attempted here). What IS real and cheap: push the same uniforms scene.js
    // sets once at startup (turbidity/rayleigh/mie) further for the photoshoot only, richer/more
    // saturated toward the reddish end — scoped here, not touched globally, so normal daytime
    // navigation is unaffected.
    if (A._sky) {
      var _su = A._sky.material.uniforms;
      _photoSkyUniSaved = {
        turbidity: _su['turbidity'].value, rayleigh: _su['rayleigh'].value,
        mieCoefficient: _su['mieCoefficient'].value, mieDirectionalG: _su['mieDirectionalG'].value
      };
      _su['turbidity'].value = 8;         // more haze/color depth (was 4)
      _su['rayleigh'].value = 3.2;        // richer red/orange scatter (was 2)
      _su['mieCoefficient'].value = 0.012; // denser sun-glow bloom in the sky itself (was 0.005)
      _su['mieDirectionalG'].value = 0.9;  // tighter forward-scatter, punchier horizon glow (was 0.8)
    }
    // §PHOTO_SUN_REFLECTION fix 2: keep the lensflare's own brightness independent of the
    // photoshoot's exposure cut (see comment above PHOTO_SUN_ELEVATION).
    if (A._lensflare) {
      _photoFlarePrevTone = A._lensflare.material.toneMapped;
      A._lensflare.material.toneMapped = false;
      A._lensflare.material.needsUpdate = true;
      if (A._lensflare.userData._halo) {
        _photoHaloPrevTone = A._lensflare.userData._halo.material.toneMapped;
        A._lensflare.userData._halo.material.toneMapped = false;
        A._lensflare.userData._halo.material.needsUpdate = true;
      }
    }
    // §PHOTO_SUN_REFLECTION fix 3: boost existing per-material envMapIntensity — stronger
    // glass/metal glint, same free PBR mechanism, no new shader work. Re-asserted every
    // accumulation frame (see _reassertPhotoMatBoost) so streamed-in materials aren't missed.
    _photoEnvBoostedMats = [];
    _photoMatBoostActive = true;
    _reassertPhotoMatBoost();
    _enablePhotoShadows();  // called AFTER updateSky — see note in _enablePhotoShadows
    _photoNightWasOn = !!A._nightMode;
    if (!_photoNightWasOn && A.toggleNightMode) {
      A.toggleNightMode();  // amber fixture glow (synthetic fallback) + window glow
      if (A._nightSaved) {  // undo the moonlight override, but land on a deliberate warm evening
                             // tint (§PHOTO_WARM_SUN) instead of plain neutral-daytime restore
        A.sun.intensity = A._nightSaved.sunI * PHOTO_SUN_INTENSITY_SCALE;
        A.sun.color.setHex(PHOTO_SUN_COLOR);
        // §PHOTO_HEMI_FILL: boosted above the daytime baseline (not just restored to it) — see
        // comment above PHOTO_HEMI_INTENSITY_SCALE for why the ground needs this specifically.
        A.ambient.intensity = A._nightSaved.ambI * PHOTO_AMBIENT_INTENSITY_SCALE;
        A.ambient.color.setHex(PHOTO_AMBIENT_COLOR);
        A.hemi.intensity = A._nightSaved.hemiI * PHOTO_HEMI_INTENSITY_SCALE;
        A.hemi.color.setHex(PHOTO_HEMI_SKY_COLOR);
        A.renderer.toneMappingExposure = A._nightSaved.exposure * PHOTO_EXPOSURE_SCALE;
      }
    }
    // §PHOTO_FOG_ORDER_FIX (2026-07-16, RESUME BRIEF ADDENDUM item 2 — "sky/ground darkness, one
    // root cause?"): confirmed YES, one root cause, and it's a real bug, not just physical dusk
    // dimness. TWO things clobber the warm §PHOTO_FOG color if it's applied any earlier in this
    // function: (1) A.updateSky() (scene.js) sets scene.fog.color itself from a dim elevation-
    // derived blend ("dayT" — at PHOTO_SUN_ELEVATION's low dusk angle, dayT≈0.3, giving a dim
    // blue-grey); (2) A.toggleNightMode() (tools.js §S277c), called just above for its amber-glow
    // mechanism, ALSO sets fog to a near-black moonlight blue as its own side effect — the same
    // side effect this block already undoes for sun/ambient/hemi/exposure ("undo the moonlight
    // override, land on a deliberate warm evening tint") just never included fog. Both run BEFORE
    // this point, so applying the warm override HERE (after both) is the one place it actually
    // sticks — confirmed the fog the user saw was neither dim-blend nor moonlight-blue-corrected,
    // it was whichever of the two ran last. Since fog is the one shared medium touching both the
    // sky's tone and any distant ground pixel, this single clobber explains BOTH "sky too dark"
    // and "ground reflecting off that also" as ONE bug, not two.
    if (A.scene && A.scene.fog) {
      A.scene.fog.color.setHex(0xc9a878);
      A.scene.fog.density = Math.min(A.scene.fog.density, 0.00006);  // lighter haze, not a wall of fog
    }
    _showPhotoProps(true);
    console.log('§PHOTO_STAGING on nightWasOn=' + _photoNightWasOn);
  }
  function _teardownPhotoStaging() {
    if (!_photoNightWasOn && A.toggleNightMode) A.toggleNightMode();  // restores its own saved state
    if (!_photoSkyWasVisible && A._sky) A._sky.visible = false;
    if (A.sun && _photoSunPosSaved) {
      A.sun.position.copy(_photoSunPosSaved);
      A.sun.target.position.copy(_photoSunTargetSaved);
      A.sun.target.updateMatrixWorld();
      _photoSunPosSaved = null; _photoSunTargetSaved = null;
    }
    if (A._lensflare) {
      A._lensflare.material.toneMapped = _photoFlarePrevTone;
      A._lensflare.material.needsUpdate = true;
      if (A._lensflare.userData._halo) {
        A._lensflare.userData._halo.material.toneMapped = _photoHaloPrevTone;
        A._lensflare.userData._halo.material.needsUpdate = true;
      }
    }
    _photoMatBoostActive = false;
    _photoEnvBoostedMats.forEach(function(m) {
      m.envMapIntensity = m.userData._photoOrigEnvMapIntensity;
      delete m.userData._photoOrigEnvMapIntensity;
      if (m.userData._photoOrigRoughness !== undefined) {
        m.roughness = m.userData._photoOrigRoughness;
        delete m.userData._photoOrigRoughness;
      }
      delete m.userData._photoBoosted;
      m.needsUpdate = true;
    });
    _photoEnvBoostedMats = [];
    _disablePhotoShadows();
    if (A.ground && A._applyGroundTexture) {
      A._applyGroundTexture(_photoGroundPrevKey);  // null → clears map, restores flat color
      if (_photoGroundPrevColor != null && A._setGroundColor) A._setGroundColor(_photoGroundPrevColor);
      A.ground.visible = _photoGroundWasVisible;
    }
    if (A.scene && A.scene.fog && _photoFogColorSaved != null) {
      A.scene.fog.color.setHex(_photoFogColorSaved);
      A.scene.fog.density = _photoFogDensitySaved;
      _photoFogColorSaved = null; _photoFogDensitySaved = null;
    }
    if (A._sky && _photoSkyUniSaved) {
      var _su2 = A._sky.material.uniforms;
      _su2['turbidity'].value = _photoSkyUniSaved.turbidity;
      _su2['rayleigh'].value = _photoSkyUniSaved.rayleigh;
      _su2['mieCoefficient'].value = _photoSkyUniSaved.mieCoefficient;
      _su2['mieDirectionalG'].value = _photoSkyUniSaved.mieDirectionalG;
      _photoSkyUniSaved = null;
    }
    _showPhotoProps(false);
    console.log('§PHOTO_STAGING off');
  }
  // §STILL_REFINE_FREEZE (2026-07-15, user-observed): on a real GPU, 16 samples finish in
  // ~150ms — reverting composer/textures/sky the instant accumulation naturally completes made
  // the whole effect flash past almost invisibly, nothing like how Night/Shadow mode normally
  // stay on until you explicitly turn them off. Natural completion now only stops the RAF
  // stepping loop and logs the timing — composer/triplanar/photo-staging all stay exactly as
  // accumulated (the finished still stays frozen on screen) until a REAL interaction fires
  // A.stopStillRefine() (main.js's pointerdown/wheel/controls-start hooks). Only that path does
  // the full revert.
  function _finishStillRefine(idx) {
    if (_stillRefineRAF) { cancelAnimationFrame(_stillRefineRAF); _stillRefineRAF = null; }
    var ms = _stillRefineStartMs ? Math.round(performance.now() - _stillRefineStartMs) : 0;
    console.log('§STILL_REFINE done accumulateIndex=' + idx + ' elapsedMs=' + ms + ' (frozen — stays until interaction)');
  }
  function _teardownStillRefine(reason) {
    A._stillRefineActive = false;
    if (_stillRefineRAF) { cancelAnimationFrame(_stillRefineRAF); _stillRefineRAF = null; }
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    A._composerEnabled = _stillRefinePrevComposerEnabled;
    var n = _setTriplanarActive(false);
    _teardownPhotoStaging();
    var ms = _stillRefineStartMs ? Math.round(performance.now() - _stillRefineStartMs) : 0;
    console.log('§STILL_REFINE ' + reason + ' elapsedMs=' + ms);
    if (n > 0) console.log('§TRIPLANAR_PERF ms=' + ms + ' materials=' + n);
  }
  A._getPhotoSparkles = function() { return _photoSparkles; };  // diagnostic accessors — closures
  A._getPhotoSkyline = function() { return _photoSkyline; };    // always read the CURRENT value
  A._reassertPhotoSparkles = _reassertPhotoSparkles;  // exposed for orbit/camera-driven test scripts —
                                                        // sparkle visibility is camera-position-dependent
                                                        // and the natural step() loop stops re-evaluating
                                                        // it once still-refine freezes.
  A.startStillRefine = function() {
    if (!A._composer || !A._taaPass || A._stillRefineActive) return;
    A._stillRefineActive = true;
    _stillRefinePrevComposerEnabled = A._composerEnabled;
    A._composerEnabled = true;
    A._taaPass.accumulate = true;
    A._taaPass.accumulateIndex = -1;
    _stillRefineStartMs = performance.now();
    var _triCount = _setTriplanarActive(true);
    _applyPhotoStaging();
    console.log('§STILL_REFINE start samples=16 triplanarMaterials=' + _triCount);
    // §PHOTO_ENVMAP_STALE safety net: the fresh dusk env map is 2s-throttled (scene.js
    // A.updateSky), but a fast/cached accumulate can finish (and stop calling _reassertPhotoEnvMap
    // via step() below) before that 2s elapses — one extra guaranteed pass past the throttle
    // window, independent of whether the accumulate loop is still running.
    setTimeout(function() { if (A._stillRefineActive) _reassertPhotoEnvMap(); }, 2200);
    // §NIGHT_GLOW_REASSERT safety net: the per-frame reassert in step() below only runs while the
    // 16-sample accumulation RAF loop is active — that loop stops (by design, "freezes" the still)
    // long before a large building finishes streaming (confirmed this session: 20-30s+ under load,
    // far past the ~150ms-2s accumulation itself). A one-off extra pass (like envMap's above)
    // isn't enough on a slow-loading building — this repeats independently every 3s for up to a
    // minute, for as long as photo mode stays active (A._stillRefineActive, which per the
    // still-refine-freeze behavior stays true until a REAL interaction tears it down).
    (function() {
      var _tries = 0;
      var _glowInterval = setInterval(function() {
        _tries++;
        if (!A._stillRefineActive || _tries > 20) { clearInterval(_glowInterval); return; }
        _reassertPhotoGlow();
      }, 3000);
    })();
    function step() {
      if (!A._stillRefineActive) return;
      // §PHOTO_STREAMING_RACE: re-catch any mesh/material that streamed in AFTER the initial
      // push above (see comment block near _reassertPhotoShadowCoverage) — idempotent, cheap.
      _reassertPhotoShadowCoverage();
      _reassertPhotoMatBoost();
      _reassertPhotoEnvMap();
      _reassertPhotoSparkles();
      _reassertPhotoGlow();
      A._composer.render();
      var idx = A._taaPass.accumulateIndex;
      if (idx >= 16) { _finishStillRefine(idx); return; }
      _stillRefineRAF = requestAnimationFrame(step);
    }
    _stillRefineRAF = requestAnimationFrame(step);
  };
  // §STILL_REFINE_GRACE (2026-07-15, user-observed): pressing Alt+S can itself nudge the mouse
  // a hair (reaching for the shortcut), and cancellation is wired to real pointerdown/wheel/
  // controls-start signals — so the still-refine could self-cancel within the same gesture that
  // triggered it, making the effect nearly impossible to actually see. Absorb that incidental
  // nudge with a short grace window; a real subsequent interaction still cancels normally.
  var STILL_REFINE_GRACE_MS = 500;
  A.stopStillRefine = function() {
    if (!A._stillRefineActive) return;
    if (_stillRefineStartMs && (performance.now() - _stillRefineStartMs) < STILL_REFINE_GRACE_MS) return;
    _teardownStillRefine('cancelled (interaction)');
  };
  A.toggleStillRefine = function() {
    if (A._stillRefineActive) A.stopStillRefine(); else A.startStillRefine();
  };

  // §CINEMA_ORBIT (2026-07-16, user spec): the "Cinema pill" 360 fly-around, wired to a real
  // button this time (Palette panel), not just a test script. Camera strategy per the user's own
  // words: begin from wherever the camera already is ("so he can spawn his preferred line of
  // attack"), a slightly elliptical path, pivot stays at the real building bbox center.
  // §CINEMA_PUSHIN (2026-07-16, user spec — RESUME BRIEF ADDENDUM item 1 + same-day follow-up):
  // "cam must within 3 sec or so draw as near until main building fills whole screen frame, lat[er]
  // 5 sec can draw out. Ignore any non ARC elements outside frame. Solves LTU too far." Two changes
  // from the original ease-only arc:
  //  1. A genuine PUSH-IN beat (not just "correct if outside band"): radius eases from the start
  //     position toward a computed FILL-FRAME distance — the distance at which the building's own
  //     bounding sphere just touches the tighter of the camera's horizontal/vertical FOV, real
  //     perspective-camera trigonometry (R / tan(halfFOV)), not a guessed constant — within the
  //     first CINEMA_PUSHIN_SEC. Never pushes OUTWARD (clamped to min(startRadius, fillDistance)) —
  //     an already-close start is left alone. Brief hold, then eases back out toward the normal
  //     orbit band for the main body + the existing wide pull-back flourish at the very end.
  //  2. Both the fill-frame bounding sphere AND the orbit band are now computed from the ARC-
  //     DISCIPLINE-ONLY bbox (_buildingBBoxArc), not the whole-building bbox — LTU's scattered
  //     non-ARC exterior MEP piping was inflating the envelope and keeping the camera parked too
  //     far to ever genuinely fill the frame. General to any building (falls back to the whole
  //     bbox if a building has zero ARC-tagged rows), nothing hardcoded to LTU specifically.
  var CINEMA_N_FRAMES = 360, CINEMA_FPS = 15;      // 24s
  var CINEMA_PULLBACK_START = 0.80, CINEMA_PULLBACK_SCALE = 1.4;
  var CINEMA_ELLIPTICITY = 0.15;
  var CINEMA_TILT_MIN_DEG = 8, CINEMA_TILT_MAX_DEG = 45;
  var CINEMA_RADIUS_MIN_FACTOR = 0.9, CINEMA_RADIUS_MAX_FACTOR = 2.5;  // x ARC envelope
  var CINEMA_PUSHIN_SEC = 3, CINEMA_HOLD_SEC = 5, CINEMA_BAND_EASE_SEC = 3;
  var CINEMA_FILL_MARGIN = 1.0;  // no padding — loose-axis trig alone already gives "almost full screen"
  // §CINEMA_SWOOP (2026-07-16, user ask: "camera angle has to be at building level to give best
  // effect... make the camera path passing in front of that reflection at building mid angle at
  // least once"): the reflection reads best with the sun roughly BEHIND the camera (the same
  // condition `_reassertPhotoSparkles`'s half-vector test and the envMapIntensity glint boost both
  // key off) — that happens when the camera's AZIMUTH around the target matches the sun's azimuth.
  // A full 360° sweep crosses that azimuth exactly once, guaranteed, regardless of building/sun
  // angle — general, nothing hardcoded. Dip the tilt toward eye/building level in a smooth window
  // around that one crossing, layered on top of whatever the push-in/band/pull-back phase above
  // already computed, so the orbit is guaranteed to pass low and facing the glint at least once.
  var CINEMA_SWOOP_HALF_SEC = 2.0, CINEMA_SWOOP_TILT_DEG = 4;
  var _cinemaActive = false;
  function _cinemaSmoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  A.startCinemaOrbit = function() {
    if (_cinemaActive || A._stillRefineActive || !A.camera || !A.controls || !A.renderer) return;
    if (!A.renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') {
      console.warn('§CINEMA_FAIL captureStream/MediaRecorder unsupported in this browser');
      return;
    }
    // §PHOTO_VARIATION: lock whichever random paint/puddle variation is currently on screen —
    // "once user agrees, press cinema icon, it takes that persisted cache" — so the capture
    // doesn't re-roll mid-recording, and stays locked for the rest of the session.
    _photoVariationLocked = true;
    var arcBboxRaw = _buildingBBoxArc();
    var arcBbox = arcBboxRaw || _buildingBBoxIfc();
    var envelope = arcBbox ? Math.max(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, 50) : 100;
    var boundingRadius = arcBbox
      ? 0.5 * Math.hypot(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, arcBbox.zMax - arcBbox.zMin)
      : envelope * 0.6;
    var radiusMin = envelope * CINEMA_RADIUS_MIN_FACTOR, radiusMax = envelope * CINEMA_RADIUS_MAX_FACTOR;
    var tiltMin = CINEMA_TILT_MIN_DEG * Math.PI / 180, tiltMax = CINEMA_TILT_MAX_DEG * Math.PI / 180;
    var tgt = A.controls.target;
    var dx0 = A.camera.position.x - tgt.x, dy0 = A.camera.position.y - tgt.y, dz0 = A.camera.position.z - tgt.z;
    var horizR0 = Math.hypot(dx0, dz0);
    var base = {
      tx: tgt.x, ty: tgt.y, tz: tgt.z,
      startRadius: Math.hypot(dx0, dy0, dz0),
      startTilt: Math.atan2(dy0, horizR0),
      startAzimuth: Math.atan2(dz0, dx0)
    };
    var targetTilt = Math.max(tiltMin, Math.min(tiltMax, base.startTilt));
    var targetRadius = Math.max(radiusMin, Math.min(radiusMax, base.startRadius));

    // Fill-frame distance: real perspective-camera trigonometry, not a guessed constant. Per user
    // spec ("ensure it fills almost full screen... some edges may even momentarily be out of
    // frame"), bias to the LOOSER of the vertical/horizontal half-FOV (the wider-angle axis) —
    // this pulls the camera closer than "fit both axes fully," deliberately letting the tighter
    // axis's edges brush past frame at the closest point, in exchange for a genuinely full-screen
    // subject rather than a comfortably-contained one.
    var vFovRad = THREE.MathUtils.degToRad(A.camera.fov || 50);
    var aspect = A.camera.aspect || (window.innerWidth / Math.max(1, window.innerHeight));
    var hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    var looseTan = Math.max(Math.tan(vFovRad / 2), Math.tan(hFovRad / 2));
    var fillDistance = (boundingRadius / Math.max(looseTan, 1e-3)) * CINEMA_FILL_MARGIN;
    var pushInRadius = Math.min(base.startRadius, fillDistance);  // only ever draws NEARER, never out

    var durationSec = CINEMA_N_FRAMES / CINEMA_FPS;
    var pushInEndT = Math.min(0.4, CINEMA_PUSHIN_SEC / durationSec);
    var holdEndT = Math.min(0.55, CINEMA_HOLD_SEC / durationSec);
    var bandEaseEndT = Math.min(0.7, holdEndT + CINEMA_BAND_EASE_SEC / durationSec);

    // Sun-behind-camera azimuth crossing — the one guaranteed "best reflection" moment in the loop.
    var sunAzimuth = A.sun ? Math.atan2(A.sun.position.z - base.tz, A.sun.position.x - base.tx) : base.startAzimuth;
    var swoopTNorm = (((sunAzimuth - base.startAzimuth) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    var swoopHalfT = CINEMA_SWOOP_HALF_SEC / durationSec;
    var swoopTiltRad = THREE.MathUtils.degToRad(CINEMA_SWOOP_TILT_DEG);
    console.log('§CINEMA_SWOOP tNorm=' + swoopTNorm.toFixed(3) + ' (~' + (swoopTNorm * durationSec).toFixed(1) + 's)');

    _cinemaActive = true;
    // Reuse the exact still-refine staging setup (ground/shadow/sky/sun/fog/addons/sparkle), minus
    // its own TAA-accumulate rAF loop — this function drives its own render loop for the moving
    // camera (accumulating supersamples across motion would just blur/ghost, not help).
    A._stillRefineActive = true;
    _stillRefinePrevComposerEnabled = A._composerEnabled;
    A._composerEnabled = true;
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    _stillRefineStartMs = performance.now();
    var _triCount = _setTriplanarActive(true);
    _applyPhotoStaging();
    console.log('§CINEMA_ORBIT start envelope=' + envelope.toFixed(1) + ' arcOnly=' + !!arcBboxRaw +
      ' fillDistance=' + fillDistance.toFixed(1) + ' pushInRadius=' + pushInRadius.toFixed(1) +
      ' radiusBand=[' + radiusMin.toFixed(1) + ',' + radiusMax.toFixed(1) + '] triplanarMaterials=' + _triCount);

    var stream = A.renderer.domElement.captureStream(CINEMA_FPS);
    var chunks = [];
    var mimeType = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
      ? 'video/webm;codecs=vp9' : 'video/webm';
    var recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mimeType }); }
    catch (e) { console.warn('§CINEMA_FAIL MediaRecorder ctor: ' + e.message); _teardownStillRefine('cinema-fail'); _cinemaActive = false; return; }
    recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function() {
      var blob = new Blob(chunks, { type: mimeType });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_Cinema_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§CINEMA_ORBIT saved size=' + blob.size + ' type=' + mimeType);
      _teardownStillRefine('cinema-orbit-done');
      _cinemaActive = false;
    };
    recorder.start();

    var startMs = performance.now();
    var durationMs = (CINEMA_N_FRAMES / CINEMA_FPS) * 1000;
    function step() {
      if (!_cinemaActive) return;
      var tNorm = Math.min(1, (performance.now() - startMs) / durationMs);
      var azimuth = base.startAzimuth + tNorm * Math.PI * 2;
      // §CINEMA_PUSHIN phases: push in to fill-frame (radius only, tilt held at the user's own
      // starting line of attack) → brief hold → ease back out to the normal orbit band (radius +
      // tilt together) → hold in band through the main body → existing wide pull-back flourish.
      var radius, tilt;
      if (tNorm <= pushInEndT) {
        var eIn = _cinemaSmoothstep(pushInEndT > 0 ? tNorm / pushInEndT : 1);
        radius = base.startRadius + (pushInRadius - base.startRadius) * eIn;
        tilt = base.startTilt;
      } else if (tNorm <= holdEndT) {
        radius = pushInRadius;
        tilt = base.startTilt;
      } else if (tNorm <= bandEaseEndT) {
        var span = bandEaseEndT - holdEndT;
        var eOut = _cinemaSmoothstep(span > 0 ? (tNorm - holdEndT) / span : 1);
        radius = pushInRadius + (targetRadius - pushInRadius) * eOut;
        tilt = base.startTilt + (targetTilt - base.startTilt) * eOut;
      } else {
        radius = targetRadius;
        tilt = targetTilt;
      }
      // §CINEMA_SWOOP: dip toward building-level tilt in a smooth window around the one
      // guaranteed sun-behind-camera crossing, layered on top of whichever phase is active above.
      var swoopDelta = Math.abs(tNorm - swoopTNorm);
      swoopDelta = Math.min(swoopDelta, 1 - swoopDelta);  // wrap-around near tNorm=0/1
      if (swoopHalfT > 0 && swoopDelta < swoopHalfT) {
        var swoopW = 1 - _cinemaSmoothstep(swoopDelta / swoopHalfT);  // 1 at crossing, 0 at window edge
        tilt = tilt + (swoopTiltRad - tilt) * swoopW;
      }
      radius *= 1 + CINEMA_ELLIPTICITY * Math.cos(2 * (azimuth - base.startAzimuth));
      if (tNorm > CINEMA_PULLBACK_START) {
        var p = (tNorm - CINEMA_PULLBACK_START) / (1 - CINEMA_PULLBACK_START);
        radius *= 1 + (CINEMA_PULLBACK_SCALE - 1) * p;
      }
      var horizR = radius * Math.cos(tilt), dy = radius * Math.sin(tilt);
      A.camera.position.set(base.tx + horizR * Math.cos(azimuth), base.ty + dy, base.tz + horizR * Math.sin(azimuth));
      A.controls.target.set(base.tx, base.ty, base.tz);
      A.controls.update();
      _reassertPhotoShadowCoverage();
      _reassertPhotoMatBoost();
      _reassertPhotoEnvMap();
      _reassertPhotoSparkles();
      _reassertPhotoGlow();
      if (A._composer) A._composer.render();
      if (tNorm >= 1) { recorder.stop(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  A.stopCinemaOrbit = function() { _cinemaActive = false; };  // early-abort hook, e.g. a Stop button

  // §STILL_REFINE cancellation lives in main.js, on the actual pointerdown/wheel/controls-start
  // signals — NOT here on markDirty. Confirmed live (2026-07-15, real user) that markDirty fires
  // from far more than "user touched the canvas" (e.g. the history bar's own event-sniffer
  // refreshing itself right after logging the very Alt+S keypress that started the refine),
  // which self-cancelled the refine within the same keypress. Precise interaction signals only.
}
