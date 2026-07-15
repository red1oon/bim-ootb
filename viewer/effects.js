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
  // Building-only ground uplights + roofline edge-lining + a distant skyline silhouette with
  // sparkled window-lights — all anchored to THIS building's own real bbox/position (queried
  // fresh, not invented numbers) even though the fixtures themselves are fabricated. Built once
  // per building (cached, rebuilt only if the active building changes), then just shown/hidden
  // each photoshoot — cheap: a handful of point lights + thin boxes + one Points sparkle field,
  // no shadow-casting, no new texture/loader dependencies.
  var _photoPropsBuilding = null;
  var _photoUplights = [], _photoEdgeStrips = [], _photoSkyline = null, _photoSkylineLights = null;
  function _buildingBBoxIfc() {
    if (!A.dbQuery) return null;
    var r = A.dbQuery('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms');
    if (!r.length || r[0][0] == null) return null;
    return { xMin: r[0][0], xMax: r[0][1], yMin: r[0][2], yMax: r[0][3], zMin: r[0][4], zMax: r[0][5] };
  }
  function _disposePhotoProps() {
    _photoUplights.forEach(function(l) { A.scene.remove(l); });
    _photoEdgeStrips.forEach(function(m) { A.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    if (_photoSkyline) { A.scene.remove(_photoSkyline); _photoSkyline.children.forEach(function(b) { b.geometry.dispose(); b.material.dispose(); }); }
    if (_photoSkylineLights) { A.scene.remove(_photoSkylineLights); _photoSkylineLights.geometry.dispose(); _photoSkylineLights.material.dispose(); }
    _photoUplights = []; _photoEdgeStrips = []; _photoSkyline = null; _photoSkylineLights = null;
  }
  function _buildPhotoProps() {
    var bbox = _buildingBBoxIfc();
    if (!bbox) return;
    _photoPropsBuilding = A.activeBuilding;
    var cx = (bbox.xMin + bbox.xMax) / 2, cy = (bbox.yMin + bbox.yMax) / 2;
    var w = bbox.xMax - bbox.xMin, d = bbox.yMax - bbox.yMin;
    var groundZ = bbox.zMin, roofZ = bbox.zMax;

    // Ground uplights — 4 footprint corners, pulled in slightly from the corner so the light
    // sits AGAINST the wall face rather than floating off the outside edge, warm, short-range,
    // no shadow (cheap). Brighter + closer than the first pass — that one wasn't visibly
    // reading as a wall-wash.
    var inset = Math.min(3, w * 0.1, d * 0.1);
    [[bbox.xMin + inset, bbox.yMin + inset], [bbox.xMax - inset, bbox.yMin + inset],
     [bbox.xMin + inset, bbox.yMax - inset], [bbox.xMax - inset, bbox.yMax - inset]].forEach(function(c) {
      var p = A.ifc2three(c[0], c[1], groundZ);
      var lt = new THREE.PointLight(0xffaa55, 9, 14, 2);
      lt.position.set(p.x, p.y + 0.3, p.z);
      A.scene.add(lt);
      _photoUplights.push(lt);
    });

    // Roofline edge-lining — ONLY the edge(s) actually facing the camera (per user: "need not
    // be around, just what is facing camera"). Also fixes the earlier bug where a far/notch-
    // crossing edge (this building is L-shaped, bbox rectangle floats over the empty notch)
    // read as a stray line cutting across open space at a grazing angle — skipping edges that
    // don't face the camera avoids exactly that edge.
    var edgeMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8 });
    var corners = [[bbox.xMin, bbox.yMin], [bbox.xMax, bbox.yMin], [bbox.xMax, bbox.yMax], [bbox.xMin, bbox.yMax]];
    var normalsIfc = [[0, -1], [1, 0], [0, 1], [-1, 0]];  // outward normal per edge, IFC XY
    for (var ei = 0; ei < 4; ei++) {
      var c1 = corners[ei], c2 = corners[(ei + 1) % 4];
      var p1 = A.ifc2three(c1[0], c1[1], roofZ), p2 = A.ifc2three(c2[0], c2[1], roofZ);
      var mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
      var n = normalsIfc[ei];
      var nThree = { x: n[0], z: -n[1] };  // ifc2three: three.z = -(ifc.y - offset)
      var toCam = { x: A.camera.position.x - mid.x, z: A.camera.position.z - mid.z };
      var tcLen = Math.hypot(toCam.x, toCam.z) || 1;
      var facing = (nThree.x * toCam.x + nThree.z * toCam.z) / tcLen;
      if (facing <= 0.15) continue;  // not facing the camera — skip (fixes the stray-line bug too)
      var len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.1), edgeMat);
      mesh.position.set(mid.x, mid.y + 0.3, mid.z);
      mesh.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
      A.scene.add(mesh);
      _photoEdgeStrips.push(mesh);
    }

    // Distant skyline silhouette (full ring — robust to any orbit angle, per user's own
    // "different angle later" expectation) + sparkled window-lights, dusk-city look
    var envelope = Math.max(w, d, 50);
    var radius = envelope * 4;
    var group = new THREE.Group();
    var winPos = [], winCol = [];
    var N = 28;
    for (var i = 0; i < N; i++) {
      var ang = (i / N) * Math.PI * 2;
      var bw = 15 + Math.random() * 25, bh = 15 + Math.random() * 45;
      var bx = cx + Math.cos(ang) * radius, by = cy + Math.sin(ang) * radius;
      var base = A.ifc2three(bx, by, groundZ);
      var shade = 0.06 + Math.random() * 0.07;
      var box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(shade * 0.9, shade * 0.85, shade * 1.15) }));
      box.position.set(base.x, base.y + bh / 2, base.z);
      group.add(box);
      var winCount = Math.floor((bw * bh) / 14);
      for (var wi = 0; wi < winCount; wi++) {
        winPos.push(base.x + (Math.random() - 0.5) * bw * 0.8, base.y + Math.random() * bh * 0.9 + 2, base.z + (Math.random() - 0.5) * bw * 0.8);
        if (Math.random() > 0.25) winCol.push(1.0, 0.8 + Math.random() * 0.2, 0.5 + Math.random() * 0.3); // warm window
        else winCol.push(0.6, 0.75, 1.0); // occasional cool/blue window
      }
    }
    A.scene.add(group);
    _photoSkyline = group;
    var winGeo = new THREE.BufferGeometry();
    winGeo.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
    winGeo.setAttribute('color', new THREE.Float32BufferAttribute(winCol, 3));
    _photoSkylineLights = new THREE.Points(winGeo, new THREE.PointsMaterial({ size: 1.2, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
    A.scene.add(_photoSkylineLights);
    console.log('§PHOTO_PROPS built uplights=' + _photoUplights.length + ' edges=' + _photoEdgeStrips.length + ' skylineBoxes=' + N + ' windowLights=' + (winPos.length / 3));
  }
  function _showPhotoProps(show) {
    if (show && (!_photoUplights.length || _photoPropsBuilding !== A.activeBuilding)) {
      _disposePhotoProps();
      _buildPhotoProps();
    }
    _photoUplights.forEach(function(l) { l.visible = show; });
    _photoEdgeStrips.forEach(function(m) { m.visible = show; });
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
  var _photoNightWasOn = false, _photoSkyWasVisible = false;
  var _photoGroundWasVisible = false, _photoGroundPrevKey = null, _photoGroundPrevColor = null;
  function _applyPhotoStaging() {
    _photoGroundWasVisible = !!(A.ground && A.ground.visible);
    _photoGroundPrevKey = A._groundTexKey || null;
    _photoGroundPrevColor = A._groundSolidColor;
    if (A.ground && A._applyGroundTexture && A._calcGroundY) {
      A.ground.visible = true;
      A._calcGroundY();
      A._applyGroundTexture('earth');
      if (A._setGroundColor) A._setGroundColor(0x6a5238);  // warm dusk tint over the earth map
    }
    _photoSkyWasVisible = !!(A._sky && A._sky.visible);
    if (A._sky && A.updateSky) { A._sky.visible = true; A.updateSky(8, 200); }
    _photoNightWasOn = !!A._nightMode;
    if (!_photoNightWasOn && A.toggleNightMode) {
      A.toggleNightMode();  // amber fixture glow (synthetic fallback) + window glow
      if (A._nightSaved) {  // undo JUST the moonlight sun/ambient/hemi/fog override — keep the sunset
        A.sun.intensity = A._nightSaved.sunI;
        A.sun.color.setHex(A._nightSaved.sunColor);
        A.ambient.intensity = A._nightSaved.ambI;
        A.ambient.color.setHex(A._nightSaved.ambColor);
        A.hemi.intensity = A._nightSaved.hemiI;
        A.hemi.color.setHex(A._nightSaved.hemiSky);
        A.renderer.toneMappingExposure = A._nightSaved.exposure;
      }
    }
    _showPhotoProps(true);
    console.log('§PHOTO_STAGING on nightWasOn=' + _photoNightWasOn);
  }
  function _teardownPhotoStaging() {
    if (!_photoNightWasOn && A.toggleNightMode) A.toggleNightMode();  // restores its own saved state
    if (!_photoSkyWasVisible && A._sky) A._sky.visible = false;
    if (A.ground && A._applyGroundTexture) {
      A._applyGroundTexture(_photoGroundPrevKey);  // null → clears map, restores flat color
      if (_photoGroundPrevColor != null && A._setGroundColor) A._setGroundColor(_photoGroundPrevColor);
      A.ground.visible = _photoGroundWasVisible;
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
    function step() {
      if (!A._stillRefineActive) return;
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
  // §STILL_REFINE cancellation lives in main.js, on the actual pointerdown/wheel/controls-start
  // signals — NOT here on markDirty. Confirmed live (2026-07-15, real user) that markDirty fires
  // from far more than "user touched the canvas" (e.g. the history bar's own event-sniffer
  // refreshing itself right after logging the very Alt+S keypress that started the refine),
  // which self-cancelled the refine within the same keypress. Precise interaction signals only.
}
