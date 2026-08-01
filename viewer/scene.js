/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// scene.js — Three.js scene, camera, controls, lighting, ground
// §S276: async for WebGPURenderer.init()
async function setupScene(A) {
  const canvas = document.getElementById('canvas');
  A.canvas = canvas;

  // §S258: ColorManagement.enabled=false set in loader.js (before any THREE.Color created)
  // §S271b: Suppress WEBGL_multi_draw warning spam — r160 BatchedMesh logs it per draw call.
  // Cache the null result so console.warn fires only once, not 117K times per frame.
  var _origWarn = console.warn;
  var _multiDrawWarned = false;
  console.warn = function() {
    if (!_multiDrawWarned && arguments[0] && typeof arguments[0] === 'string' &&
        arguments[0].indexOf('WEBGL_multi_draw') !== -1) {
      _multiDrawWarned = true;
      _origWarn.apply(console, arguments);
      return;
    }
    if (_multiDrawWarned && arguments[0] && typeof arguments[0] === 'string' &&
        arguments[0].indexOf('WEBGL_multi_draw') !== -1) return;
    _origWarn.apply(console, arguments);
  };

  // §S283: beforeinstallprompt captured in viewer.html (early). Read from window._installPrompt.
  var _isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;

  // §S271: Mobile — disable antialias (4x MSAA fill cost), cap DPR at 1
  var _isMobileRenderer = (navigator.maxTouchPoints > 0 && window.screen.width < 1024);
  // §S277b: WebGL only — WebGPU deferred to future (unsafe usage warnings, canvas poisoning, compileAsync hangs).
  // Firefox and Chrome both run smooth on WebGL r184. No adapter probing needed.
  var _isWebGPU = false;
  var renderer;
  // Load standard WebGL build — WebGPU build's PMREMGenerator/Scene expect WebGPURenderer internals
  var _std = await import('./lib/three.module.min.js');
  for (var _k of Object.keys(_std)) THREE[_k] = _std[_k];
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !_isMobileRenderer,
    preserveDrawingBuffer: true
  });
  console.log('§S277b_RENDERER WebGLRenderer r184 (WebGPU deferred)');
  // §S281b: report multi_draw fast-path + GPU at startup. BatchedMesh collapses a bucket to ONE draw
  // call only when WEBGL_multi_draw is present; without it = per-draw fallback = slower final render.
  try {
    var _capGl = renderer.getContext();
    var _md = !!_capGl.getExtension('WEBGL_multi_draw');
    var _dbg = _capGl.getExtension('WEBGL_debug_renderer_info');
    var _gpu = _dbg ? _capGl.getParameter(_dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    console.log('§RENDERER_CAPS multi_draw=' + (_md ? 'on (fast batched path)' : 'off (slow — per-draw fallback)') + ' gpu=' + _gpu);
    // §MERGED_GUID (MOBILE_PERF.md §SPEC 2026-07-28 Part 4): PERSIST the capability — S280c's
    // `_hasMultiDraw` was computed and thrown away here, which is why the merged low-draw fallback
    // has been dead since 68bd9a7 (2026-05-27). streaming.js reads this to decide merge routing.
    // Default TRUE on probe failure = keep the BatchedMesh path (never merge on unknown caps).
    A._hasMultiDraw = _md;
  } catch(_e) {
    A._hasMultiDraw = true;
    console.log('§RENDERER_CAPS probe failed: ' + (_e && _e.message));
  }
  // ── Implementing FLY_TOUR_DLOD_SCALE.md §14 (bim-compiler prompts/Viewer/) — GPU capability
  // warning. Witnesses: W-GPU-WARN-FIRSTRUN / -DEGRADED / -RECOVERED / -NONAG.
  // Compares the caps just probed above against the "last known good" signature in localStorage
  // (key bim_gpu_lastgood) and shows ONE dismissible toast if it looks like a real degradation
  // (silent iGPU fallback / lost multi_draw — both real incidents were 100% silent before this).
  // Cheap by construction: one localStorage read + conditional write, zero extra GPU queries.
  // Decision logic lives in gpuBaselineCheck() (end of this file) so node witnesses can drive it
  // with a mocked storage. _gpu/_md are var-hoisted from the try above; undefined (probe failed)
  // → gpuBaselineCheck no-ops.
  function _showGpuWarnToast(msg) {
    // Amber warning toast, modeled on error_reporter.js's dismissible toast + main.js's
    // net-status-toast. NOT routed through A.reportError — that styles it as a red app error
    // ("Something went wrong" + Report button) and burns its 3-toasts-per-session error budget.
    var old = document.getElementById('_gpu_warn_toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = '_gpu_warn_toast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:rgba(45,32,5,0.95);border:1px solid #e6a817;border-radius:10px;padding:12px 20px;' +
      'font-family:"Segoe UI",sans-serif;color:#e0e0e0;font-size:13px;max-width:520px;width:90%;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:12px;';
    var m = document.createElement('div');
    m.style.cssText = 'flex:1;line-height:1.4;word-break:break-word';
    m.textContent = msg;
    var x = document.createElement('button');
    x.textContent = '✕';
    x.title = 'Dismiss';
    x.style.cssText = 'padding:6px 10px;background:transparent;color:#888;border:1px solid #555;' +
      'border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0';
    x.onclick = function() { t.remove(); };
    t.appendChild(m); t.appendChild(x);
    document.body.appendChild(t);
    // Auto-fade after 30s — it's a warning, not a modal; the don't-nag flag (see gpuBaselineCheck)
    // keeps it from returning on the next load for the same degraded state.
    setTimeout(function() { if (t.parentNode) t.remove(); }, 30000);
  }
  try { gpuBaselineCheck(_gpu, _md, window.localStorage, _showGpuWarnToast); }
  catch (_egpu) { console.log('§GPU_WARN_CHECK failed: ' + (_egpu && _egpu.message)); }
  A._isWebGPU = _isWebGPU;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(_isMobileRenderer ? 1 : Math.min(window.devicePixelRatio, 2));  // §S271: mobile=1x, desktop=cap 2x
  renderer.setClearColor(0x1a1a2e);
  renderer.shadowMap.enabled = false;
  // §S260: shadow setup deferred entirely to toggleShadow() in tools.js
  // §S260c: ACESFilmic tone mapping — preserves color saturation, adds cinematic contrast.
  // NoToneMapping was flat/grey. ACES gives "crisp vibrant" look like Bonsai/Autodesk.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // §PHOTO_EXPOSURE — 0.45 is DELIBERATE and stays. It has been the daytime value since the initial
  // migration, and the user recalls overexposure problems from raising it ("AFAIR before we may have
  // issue of overexposure"). Briefly set to 1.0 this session to fix "too dark drab" and reverted:
  // doubling the base brightens DAY NAVIGATION too, which is not what was being complained about.
  // The lift is applied to the frozen still ONLY — see PHOTO_EXPOSURE_LIFT in effects.js — matching
  // how bloom, ember and the 48-light budget are all still-only.
  renderer.toneMappingExposure = 0.45;
  console.log('§TONEMAPPING type=ACESFilmic exposure=0.45');
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;  // §S259: proper gamma curve for web display
  // §S276: r184 uses physically-correct lights by default (useLegacyLights removed in r165).
  // Intensities re-tuned: legacy I × π = physically-correct equivalent.
  A.renderer = renderer;

  const scene = new THREE.Scene();
  // §S277c: Distance fog — atmospheric depth on large buildings. Near-zero GPU cost.
  scene.fog = new THREE.FogExp2(0x1a1a2e, 0.00015);  // default: very light, auto-scaled on building load
  // §S277c: Auto-scale fog density after building loads — called from streaming.js
  A._updateFogDensity = function() {
    var env = 100;
    var bc = Object.values(A.buildingCentres || {})[0];
    if (bc && bc.envelope) env = bc.envelope;
    // Larger envelope = lighter fog (LTU 426m→0.0004, Castle 23m→0.003)
    scene.fog.density = Math.max(0.00015, Math.min(0.004, 1.5 / env));
    console.log('§FOG_DENSITY env=' + env.toFixed(0) + 'm density=' + scene.fog.density.toFixed(5));
  };
  A.scene = scene;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000);  // §S277c: near=0.1m (was 0.5) — get within 10cm of surfaces without clipping
  camera.position.set(300, 200, 400);
  A.camera = camera;

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 20000;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;  // Full vertical range (0=top, π=bottom)
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
  };
  controls.enablePan = true;
  controls.panSpeed = 1.5;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 1.2;
  controls.rotateSpeed = 0.8;
  controls.keyPanSpeed = 20;
  A.controls = controls;

  // Shift+Left = pan (for trackpad users without middle/right mouse)
  canvas.addEventListener('pointerdown', (e) => {
    if (e.shiftKey && e.button === 0) {
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
  });
  canvas.addEventListener('pointerup', () => {
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  });

  // Lighting
  // §S276: Physically-correct intensities (legacy × π). Tuned with ACESFilmic @ exposure 0.45.
  const ambient = new THREE.AmbientLight(0xffffff, 0.785);
  scene.add(ambient);
  A.ambient = ambient;

  const sun = new THREE.DirectionalLight(0xfff0dd, 4.4);
  sun.position.set(200, 400, 300);
  sun.castShadow = false;
  scene.add(sun);
  A.sun = sun;

  const hemi = new THREE.HemisphereLight(0xb0c4de, 0x8b7355, 1.257);
  scene.add(hemi);
  A.hemi = hemi;

  // §S276b: r184 Sky shader (Preetham atmospheric scattering) — realistic sky + env map.
  // Replaces vertex-color gradient sphere. Near-zero GPU cost (single fullscreen quad).
  // Drives env map reflections on all PBR materials via PMREMGenerator.fromScene(sky).
  var _pmrem = new THREE.PMREMGenerator(renderer);
  _pmrem.compileCubemapShader();
  var _sky = null;
  var _sunVec = new THREE.Vector3();
  try {
    var _skyMod = await import('./lib/Sky.js');
    if (!_skyMod.Sky) throw new Error('Sky class not exported');
    _sky = new _skyMod.Sky();
    _sky.scale.setScalar(100000);
    scene.add(_sky);
    var _skyUni = _sky.material.uniforms;
    _skyUni['turbidity'].value = 4;
    _skyUni['rayleigh'].value = 2;
    _skyUni['mieCoefficient'].value = 0.005;
    _skyUni['mieDirectionalG'].value = 0.8;
    _sky.visible = false;  // §S276b: Sky hidden by default — shown on Shadow toggle (H) or Time Machine sun cycle
    console.log('§SKY_SHADER loaded — Preetham r184 (hidden until Shadow H or TM sun)');
  } catch(e) {
    console.warn('§SKY_SHADER_FAIL ' + e.message);
    _sky = null;
  }
  A._sky = _sky;  // expose for tools.js shadow toggle

  // §S276b: updateSky(elevation, azimuth) — call from Time Machine or UI.
  // elevation: degrees (0=horizon, 90=zenith, negative=below horizon for night)
  // azimuth: degrees (0=north, 180=south)
  A.updateSky = function(elevation, azimuth) {
    var phi = THREE.MathUtils.degToRad(90 - elevation);
    var theta = THREE.MathUtils.degToRad(azimuth);
    _sunVec.setFromSphericalCoords(1, phi, theta);
    // §S276b: Update sky shader — never hide, Preetham darkens naturally below horizon.
    if (_sky && _sky.visible) {
      _sky.material.uniforms['sunPosition'].value.copy(_sunVec);
    }
    // Update directional light to match sky sun
    sun.position.copy(_sunVec).multiplyScalar(5000);
    // §S277f: Lensflare tracks sun position — visible when sun above horizon + in camera view
    if (_lensflare) {
      var _sunPos = sun.position;
      _lensflare.position.copy(_sunPos);
      if (_lensflare.userData._halo) _lensflare.userData._halo.position.copy(_sunPos);
      // Sun is above horizon if y > 0, and check angle to camera
      var _sunDir = _sunPos.clone().sub(camera.position).normalize();
      var _camDir = new THREE.Vector3();
      camera.getWorldDirection(_camDir);
      var _sunDot = _sunDir.dot(_camDir);
      var _sunAbove = _sunPos.y > 50;
      var _lfVisible = _sunAbove && _sunDot > 0.3 && _sky && _sky.visible;
      // Intensity: strongest near horizon (sunrise/sunset), fade at zenith
      var _sunElev = Math.max(0, Math.min(1, _sunPos.y / 5000));
      var _lfIntensity = _lfVisible ? (1 - _sunElev * 0.6) * Math.max(0, (_sunDot - 0.3) / 0.7) : 0;
      _lensflare.material.opacity = _lfIntensity * 0.9;
      _lensflare.visible = _lfIntensity > 0.01;
      if (_lensflare.userData._halo) {
        _lensflare.userData._halo.material.opacity = _lfIntensity * 0.4;
        _lensflare.userData._halo.visible = _lensflare.visible;
      }
    }
    // §S276b: Update env map from sky — apply per-material, NOT scene.environment.
    // scene.environment overrides ALL MeshStandardMaterial (including ground → white flash).
    // Instead: store texture in A._envMap, streaming.js applies it to building materials only.
    if (_sky && _sky.visible && !A._envMapThrottle) {
      A._envMapThrottle = true;
      setTimeout(function() {
        try {
          // §ALT_FRAME_LUMINANCE (2026-07-25): while a photoshoot/MaxQ bake has swapped A._envMap
          // to the real photographed HDRI (effects.js _applyPhotoStaging, A._envMapHdriActive),
          // this throttled callback must NOT stomp it back to the procedural sky-only PMREM — it
          // fires up to 2000ms after the updateSky() call that scheduled it, which lands mid-frame
          // on any capture loop (Alt+S/Alt+C) whose own cadence is close to that same 2000ms window,
          // silently swapping every material's reflection source frame-to-frame and reading as an
          // alternating bright/dark movie. Every OTHER updateSky() caller (plain nav, Time Machine)
          // is unaffected — this flag is only ever true during a staged photoshoot.
          if (!A._envMapHdriActive) {
            var envRT = _pmrem.fromScene(_sky);
            A._envMap = envRT.texture;
          } else {
            console.log('§ENVMAP_STOMP_GUARD skipped procedural regen — HDRI active');
          }
        } catch(e) {}
        A._envMapThrottle = false;
      }, 2000);
    }
    // §S277c: Fog color follows sky — blend from dark (night) to light blue (day)
    if (scene.fog) {
      var dayT = Math.max(0, Math.min(1, (elevation + 10) / 55));  // 0 at -10°, 1 at 45°
      var fogR = 0.10 + dayT * 0.55;  // 0.10→0.65
      var fogG = 0.10 + dayT * 0.60;  // 0.10→0.70
      var fogB = 0.18 + dayT * 0.55;  // 0.18→0.73
      scene.fog.color.setRGB(fogR, fogG, fogB);
    }
  };

  // Initial sky: mid-afternoon
  A.updateSky(45, 180);
  // Also generate initial env map synchronously
  try {
    if (_sky) {
      var _initRT = _pmrem.fromScene(_sky);
      A._envMap = _initRT.texture;
      // §S276b: Don't set scene.environment — it overrides ground material.
      // Building materials get envMap via streaming.js _getMaterial().
      console.log('§ENV_MAP Sky-based atmospheric env map ready (per-material, not scene.environment)');
    } else {
      // Fallback: simple gradient env map (no Sky shader)
      var envScene2 = new THREE.Scene();
      var envGeo = new THREE.SphereGeometry(500, 32, 16);
      var posAttr = envGeo.attributes.position;
      var colors = new Float32Array(posAttr.count * 3);
      for (var vi = 0; vi < posAttr.count; vi++) {
        var ny = posAttr.getY(vi) / 500;
        var t2 = ny * 0.5 + 0.5;
        colors[vi * 3] = 0.7 - t2 * 0.3;
        colors[vi * 3 + 1] = 0.65 + t2 * 0.1;
        colors[vi * 3 + 2] = 0.55 + t2 * 0.35;
      }
      envGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      envScene2.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envScene2.add(new THREE.AmbientLight(0xffffff, 1));
      var envRT2 = _pmrem.fromScene(envScene2, 0.04);
      A._envMap = envRT2.texture;
      envGeo.dispose();
      console.log('§ENV_MAP vertex-color gradient fallback applied');
    }
  } catch(e) {
    console.warn('§ENV_MAP_FAIL ' + e.message);
  }

  // §S277b: Cloud layer removed — blocky shadows detracted from sky beauty.
  // Dawn/dusk Preetham sky transitions are the real spectacle.
  A._cloudPlane = null;
  A._cloudTex = null;

  // ── §S277f: Lensflare — billboard sprite on sun position ──
  var _lensflare = null;
  try {
    // Generate lensflare texture on canvas — radial gradient disc
    var _lfCanvas = document.createElement('canvas');
    _lfCanvas.width = 128; _lfCanvas.height = 128;
    var _lfCtx = _lfCanvas.getContext('2d');
    var _lfGrad = _lfCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    _lfGrad.addColorStop(0, 'rgba(255,250,230,1.0)');
    _lfGrad.addColorStop(0.15, 'rgba(255,220,150,0.8)');
    _lfGrad.addColorStop(0.4, 'rgba(255,180,80,0.3)');
    _lfGrad.addColorStop(1, 'rgba(255,150,50,0)');
    _lfCtx.fillStyle = _lfGrad;
    _lfCtx.fillRect(0, 0, 128, 128);
    var _lfTex = new THREE.CanvasTexture(_lfCanvas);
    // Main sun disc
    _lensflare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _lfTex, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    _lensflare.scale.set(800, 800, 1);
    _lensflare.visible = false;
    _lensflare.renderOrder = 999;
    scene.add(_lensflare);
    // Secondary halo — larger, softer
    var _haloCanvas = document.createElement('canvas');
    _haloCanvas.width = 64; _haloCanvas.height = 64;
    var _haloCtx = _haloCanvas.getContext('2d');
    var _haloGrad = _haloCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    _haloGrad.addColorStop(0, 'rgba(255,200,100,0.15)');
    _haloGrad.addColorStop(0.5, 'rgba(255,180,80,0.05)');
    _haloGrad.addColorStop(1, 'rgba(255,150,50,0)');
    _haloCtx.fillStyle = _haloGrad;
    _haloCtx.fillRect(0, 0, 64, 64);
    var _haloTex = new THREE.CanvasTexture(_haloCanvas);
    var _halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _haloTex, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    _halo.scale.set(2000, 2000, 1);
    _halo.visible = false;
    _halo.renderOrder = 998;
    scene.add(_halo);
    _lensflare.userData._halo = _halo;
    console.log('§LENSFLARE loaded — disc + halo sprites');
  } catch(e) { console.warn('§LENSFLARE_FAIL ' + e.message); }
  A._lensflare = _lensflare;

  // Ground plane — positioned after DB load to sit below the lowest building
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50000, 50000),
    // §GROUND_METALLIC_REVERT (2026-07-17, user: "We have to contain what we want only within S
    // and J" — a permanent base metallic material was the wrong shape for this ask; superseded by
    // the wetness-override mechanism (effects.js §GROUND_WETNESS_OVERRIDE), auto-applied when Alt+S
    // stages and tunable via Alt+J's dial. Reverted to the original earth-brown matte default.
    new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.15, side: THREE.DoubleSide })  // §S276b: earth brown, subtle sky reflection (0.15)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.visible = false;
  scene.add(ground);
  A.ground = ground;

  // §S278 Phase 3: EffectComposer extracted to effects.js
  // setupEffects(A, renderer, scene, camera) — loads SSAO/Outline/Output on desktop, skips on mobile
  if (typeof setupEffects === 'function') await setupEffects(A, renderer, scene, camera);
  // §GI_POC (sandbox spike, feat/ssgi-composer-poc): N8AO via pmndrs/postprocessing, Alt+G gated
  if (typeof setupGIPoc === 'function') await setupGIPoc(A, renderer, scene, camera);

  // State
  A.db = null;
  A.libDb = null;
  A.buildingCentres = {};
  A.discCounts = {};
  A.meshCache = {};
  A._dlodBboxGeo = new THREE.BoxGeometry(1, 1, 1);  // §S261: shared bbox for DLOD slots (24 verts, 36 idx)
  A.streamedCount = 0;
  A.totalElements = 0;
  A.modelOffset = { x: 0, y: 0, z: 0 };
  A.activeBuilding = null;
  A.activeBuildingTotal = 0;
  A.buildingsRendered = new Set();
  A.status = document.getElementById('status');
  A.guidMap = {};
  A.pointerDownPos = { x: 0, y: 0 };

  // §S266: Recover from Chrome background-tab WebGL context kill (idle throttling)
  // Don't auto-reload — user loses Red Pill / Doc context. Just show a banner to tap.
  canvas.addEventListener('webglcontextlost', function(e) {
    e.preventDefault();
    // §MAXQ_CONTEXT_LOSS (2026-07-26, real user repro — Hospital, ~7min single-tab bake): a long
    // MaxQ capture keeps rendering "successfully" after context loss — WebGL calls become silent
    // no-ops rather than throwing, so every frame from this point on captures a blank/black canvas
    // with zero error. Expose the flag on A so cinema_maxq.js's per-frame loop can detect it and
    // stop+salvage, the same way it already handles a lost IndexedDB connection mid-bake.
    A._webglContextLost = true;
    console.log('§WEBGL_CONTEXT_LOST — tap banner to reload');
    var banner = document.createElement('div');
    banner.id = 'webgl-lost-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#cc0000;color:#fff;text-align:center;padding:14px;font-size:15px;font-weight:bold;cursor:pointer';
    banner.textContent = '3D view lost (Chrome idle throttle) — tap here to reload';
    banner.onclick = function() { location.reload(); };
    document.body.appendChild(banner);
  });
  canvas.addEventListener('webglcontextrestored', function() {
    A._webglContextLost = false;
    var banner = document.getElementById('webgl-lost-banner');
    if (banner) banner.remove();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
    if (A.markDirty) A.markDirty();
    console.log('§WEBGL_CONTEXT_RESTORED');
  });

  // Raycaster
  A.raycaster = new THREE.Raycaster();
  A.mouse = new THREE.Vector2();

  // IFC (X=east, Y=north, Z=up) → Three.js (X=east, Y=up, Z=south)
  A.ifc2three = function(ix, iy, iz) {
    return { x: ix - A.modelOffset.x, y: iz - A.modelOffset.z, z: -(iy - A.modelOffset.y) };
  };
  // Exact inverse. Anything PERSISTED must be stored in IFC space, never three.js space:
  // A.modelOffset is established at load time, so a three.js coordinate written into a .db is only
  // meaningful to the session that wrote it. This is why staffage_instances stores ifc_* columns,
  // and §CINEMA_PATH_EDITOR's cinema_path table follows it.
  A.three2ifc = function(x, y, z) {
    return { ix: x + A.modelOffset.x, iy: -z + A.modelOffset.y, iz: y + A.modelOffset.z };
  };
  // Direction vectors carry NO offset — only the axis swap. Running a direction through the point
  // converters would add the model offset to it and silently rotate/scale it into nonsense.
  A.three2ifcDir = function(x, y, z) { return { ix: x, iy: -z, iz: y }; };
  A.ifc2threeDir = function(ix, iy, iz) { return { x: ix, y: iz, z: -iy }; };

  // IndexedDB cache
  A.CACHE_DB_NAME = 'bim_ootb_cache';
  A.CACHE_STORE = 'dbs';

  // §S260b: Log storage quota at init — diagnoses private browsing / low-quota environments
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(function(e) {
      var qMB = (e.quota / 1024 / 1024).toFixed(0);
      var uMB = (e.usage / 1024 / 1024).toFixed(0);
      console.log('[S203] §QUOTA available=' + qMB + 'MB used=' + uMB + 'MB');
      if (e.quota < 100 * 1024 * 1024) {
        console.warn('[S203] §QUOTA_LOW — possible private/incognito mode. IDB cache disabled.');
        A._cacheDisabled = true;
      }
      // §S271b: Log quota but do NOT auto-delete — usage includes all sites, not just ours.
      // Old code nuked our IDB at 95% total quota, killing imported IFCs unnecessarily.
      if (e.usage > 0 && e.usage >= e.quota * 0.95) {
        console.warn('[S203] §QUOTA_HIGH usage=' + uMB + '/' + qMB + 'MB — browser storage nearly full (other sites). Our cache preserved.');
      }
    }).catch(function() {});
  }

  // §PERSIST (W-DB-CACHE-KEY F2 — prompts/HISTORY_PERSIST_RECALL.md §VERIFY-FIRST ITEM 1): ask ONCE per
  // load for durable storage. Until this, persist() was only ever called from the PWA-install overlay
  // (_ensureBuildingCached), so a normal viewer session ran on best-effort storage — the browser is then
  // free to silently evict the whole origin's IndexedDB, and a 251MB building blob is the first thing it
  // drops. Nothing in the log said so; you just saw §CACHE_MISS_READ and a fresh 251MB download next time.
  // Cheap, idempotent (already-granted resolves true without a prompt), and never blocks the boot.
  if (navigator.storage && navigator.storage.persisted && navigator.storage.persist) {
    navigator.storage.persisted().then(function(already) {
      if (already) { console.log('[S203] §PERSIST already=true'); return; }
      return navigator.storage.persist().then(function(granted) {
        console.log('[S203] §PERSIST granted=' + granted + (granted ? '' : ' — cache is best-effort, browser may evict'));
      });
    }).catch(function() {});
  }

  // §IDB_VERSION_FALLBACK (2026-07-18): a browser profile whose bim_ootb_cache is ALREADY at a
  // version higher than 2 (another tab/build that bumped it further, dev/test residue — IndexedDB
  // versions only ever increase, never reopen at a LOWER version) makes the explicit
  // indexedDB.open(name, 2) below throw VersionError on EVERY call, forever, for that profile —
  // silently breaking ALL caching routed through this opener (buildings, schedules, ad_seed.db —
  // confirmed live: user report "reopening the 4D schedule panel still shows initial stage" +
  // repeated §CACHE_SKIP reason=IDB_unavailable for every DB, not just schedules). kernel_ops.js
  // already proved the fix for this exact class of drift in its own fallback opener (unversioned
  // open — whatever version is actually stored, never throws VersionError); this applies the same
  // fallback to the app's SINGLE opener so every caller (buildings, kernel_ops, schedule_author)
  // benefits without touching their own code.
  function _openCacheDbUnversioned(resolve) {
    try {
      var req2 = indexedDB.open(A.CACHE_DB_NAME);   // no version → whatever's actually stored
      req2.onupgradeneeded = function() {
        var db = req2.result;
        if (!db.objectStoreNames.contains(A.CACHE_STORE)) db.createObjectStore(A.CACHE_STORE);
        if (!db.objectStoreNames.contains('timestamps')) db.createObjectStore('timestamps');
      };
      req2.onsuccess = function() {
        console.log('[S203] §IDB_VERSION_FALLBACK_OK opened at stored version (unversioned)');
        resolve(req2.result);
      };
      req2.onerror = function() {
        console.warn('[S203] §IDB_OPEN_ERR (unversioned) err=' + (req2.error || 'unknown'));
        resolve(null);
      };
      req2.onblocked = function() { resolve(null); };
    } catch (e) { resolve(null); }
  }
  A.openCacheDB = function() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(A.CACHE_DB_NAME, 2);
        req.onupgradeneeded = function(e) {
          var db = req.result;
          if (!db.objectStoreNames.contains(A.CACHE_STORE)) db.createObjectStore(A.CACHE_STORE);
          // v2: timestamps store for LRU eviction
          if (!db.objectStoreNames.contains('timestamps')) db.createObjectStore('timestamps');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = function() {
          if (req.error && req.error.name === 'VersionError') {
            console.warn('[S203] §IDB_VERSION_MISMATCH stored version > 2 — falling back to unversioned open');
            _openCacheDbUnversioned(resolve);
            return;
          }
          console.warn('[S203] §IDB_OPEN_ERR name=' + A.CACHE_DB_NAME + ' err=' + (req.error || 'unknown'));
          resolve(null);
        };
        req.onblocked = function() {
          console.warn('[S203] §IDB_BLOCKED — another tab has this DB open');
          resolve(null);
        };
      } catch(e) {
        console.warn('[S203] §IDB_EXCEPTION ' + e.name + ': ' + e.message);
        resolve(null);
      }
    });
  };

  // §S260b: LRU eviction — keep max 80 entries (~25 buildings × 3 files). Evict oldest on write.
  A._MAX_CACHE_ENTRIES = 80;
  // §CACHE_EVICT_LRU_FORCE (W-DB-CACHE-KEY F3): `forceN` drops the N oldest entries even when the
  // count is under the cap — the quota-abort path calls it that way. It used to .clear() the WHOLE
  // store instead, so one over-quota write threw away every other building that was fitting fine.
  A._evictOldest = async function(cacheDb, forceN) {
    try {
      var tx = cacheDb.transaction('timestamps', 'readonly');
      var store = tx.objectStore('timestamps');
      var allKeys = await new Promise(function(r) {
        var req = store.getAllKeys(); req.onsuccess = function() { r(req.result || []); }; req.onerror = function() { r([]); };
      });
      if (!forceN && allKeys.length < A._MAX_CACHE_ENTRIES) return 0;
      if (forceN && !allKeys.length) return 0;
      // Get all timestamps, sort by oldest
      var entries = [];
      var tx2 = cacheDb.transaction('timestamps', 'readonly');
      var store2 = tx2.objectStore('timestamps');
      for (var i = 0; i < allKeys.length; i++) {
        var ts = await new Promise(function(r) {
          var req = store2.get(allKeys[i]); req.onsuccess = function() { r(req.result || 0); }; req.onerror = function() { r(0); };
        });
        entries.push({ key: allKeys[i], ts: ts });
      }
      entries.sort(function(a, b) { return a.ts - b.ts; });
      // Remove oldest until we're under limit (or the forced count, for the quota-abort retry).
      var toRemove = forceN ? entries.slice(0, Math.min(forceN, entries.length))
                            : entries.slice(0, entries.length - A._MAX_CACHE_ENTRIES + 1);
      if (toRemove.length > 0) {
        await new Promise(function(done) {
          var tx3 = cacheDb.transaction([A.CACHE_STORE, 'timestamps'], 'readwrite');
          for (var j = 0; j < toRemove.length; j++) {
            tx3.objectStore(A.CACHE_STORE).delete(toRemove[j].key);
            tx3.objectStore('timestamps').delete(toRemove[j].key);
          }
          tx3.oncomplete = done; tx3.onerror = done; tx3.onabort = done;
        });
        console.log('[S203] §CACHE_EVICT_LRU removed=' + toRemove.length + ' forced=' + (forceN ? 'yes' : 'no') +
          ' keys=' + toRemove.map(function(e){return String(e.key).split('/').pop();}).join(','));
      }
      return toRemove.length;
    } catch(e) { /* eviction is best-effort */ return 0; }
  };

  // §S260b: Check if URL is in cache (returns buffer or null, no network)
  // §CACHE_KEY (W-DB-CACHE-KEY): must use the SAME canonical key as cachedFetch, and must fall back to
  // the legacy raw-url key for profiles cached before the fix. Missing this here re-opened the exact
  // §OFFLINE-GATEWAY-LEAK that streaming.js:2051 warns about: streaming's diagnostic size check calls
  // _checkCache(A.DB_URL) and, on a miss, fires a HEAD at the network for a building already in IDB —
  // visible in the field as `§DB_SIZE_CHECK size=0MB src=network` on a cached building.
  A._checkCache = async function(url) {
    try {
      const cacheDb = await A.openCacheDB();
      if (!cacheDb) return null;
      const key = (window.DbResolve && window.DbResolve.cacheKey) ? window.DbResolve.cacheKey(url, A.PROD_BASE) : url;
      const get = function(k) {
        return new Promise((resolve) => {
          const tx = cacheDb.transaction(A.CACHE_STORE, 'readonly');
          const req = tx.objectStore(A.CACHE_STORE).get(k);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      };
      const cached = await get(key);
      if (cached) return cached;
      return (key !== url) ? await get(url) : null;   // legacy raw-url entry, pre-fix profiles
    } catch(e) { return null; }
  };

  // ── Save Building → native Save As… (FSA), fallback download. Writes one self-contained .db. ──
  // Monolith (A.libDb === A.db): A.db already holds meta+geometry → export directly.
  // Split (A.db=meta, A.libDb=geometry): fold the geometry tables into a meta clone so the saved
  // single file re-opens WITH geometry (no-cubes gate — never save a geometry-less stub).
  // §STAFFAGE_PERSIST (2026-07-18, user: "only when save that last scene is stored in DB. If not,
  // discarded"): staffage (effects.js) lives only in the THREE.js scene graph — write it into
  // whichever sql.js DB is about to be exported so a reopen can rehydrate the exact placed set.
  // Decoupled via A._getStaffageInstances so this module doesn't need to know effects.js internals.
  function _writeStaffageTable(db) {
    var rows = (A._getStaffageInstances && A._getStaffageInstances()) || [];
    if (!rows.length) return;
    try {
      db.run("DROP TABLE IF EXISTS staffage_instances");
      db.run("CREATE TABLE staffage_instances (kind TEXT, file TEXT, ifc_x REAL, ifc_y REAL, ifc_z REAL, rot_y REAL)");
      var stmt = db.prepare("INSERT INTO staffage_instances VALUES (?,?,?,?,?,?)");
      rows.forEach(function(r) { stmt.run(r); });
      stmt.free();
      console.log('§STAFFAGE_SAVE rows=' + rows.length);
    } catch (e) { console.warn('§STAFFAGE_SAVE_FAIL ' + e.message); }
  }
  // §CINEMA_PATH_EDITOR (prompts/CINEMA_PATH_EDITOR.md, guardrail 5 + §CINEMA_PATH_EDITOR_MODEL):
  // an edited cinema path is AUTHORED data, so under the prime rule it must be STORED, never
  // re-guessed. Mirrors staffage_instances exactly — same explicit-action model: "Save this path"
  // stages the edit into memory, the user's normal Ctrl+S is what writes it to the file. Adjusting
  // and proceeding stays ephemeral, so a user experimenting with waypoints can walk away without
  // having changed the building.
  // Positions only, plus the beat seconds — camera ANGLE is never stored because it is never
  // authored (it is LOS to the next waypoint, re-derived on load).
  // §CPE_BANDS rule 6 — store BANDS, not the six loose waypoints they expand to. Rigidity then
  // survives a save/reload STRUCTURALLY: six free points would just be six points, with nothing
  // stopping them drifting apart or bending on the next session. One row per band: anchor, unit
  // direction, length. Both in IFC space, for the same reason staffage_instances is — A.modelOffset
  // is established at load time, so three.js coordinates are only meaningful to the session that
  // wrote them.
  function _writeCinemaPathTable(db) {
    var ov = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null;
    // §CPE_PATH_NOT_PORTABLE fix, part 2 (prompts/CINEMA_PATH_EDITOR.md): this guard used to `return`
    // silently — the only route that makes an authored path portable, dropping it with no trace. A
    // save that drops the path must be visible, not silent.
    if (!ov) { console.log('§CINEMA_PATH_WRITE skipped reason=no-staged-path'); return; }
    if (!ov.bands || ov.bands.length < 2) {
      console.log('§CINEMA_PATH_WRITE skipped reason=bands=' + (ov.bands ? ov.bands.length : 0) + '<2');
      return;
    }
    try {
      db.run("DROP TABLE IF EXISTS cinema_path");
      // §CPE_STICK_HOLD: hold_sec is APPENDED as the last column, never inserted among the existing
      // ones — a table written by an older build has 13 columns and the reader selects by NAME with
      // a fallback, so both directions of the version skew stay readable (§CPE_PATH_NOT_PORTABLE
      // only just made these files portable at all; do not break that in the next release).
      db.run("CREATE TABLE cinema_path (seq INTEGER, ifc_x REAL, ifc_y REAL, ifc_z REAL, " +
             "dir_x REAL, dir_y REAL, dir_z REAL, len REAL, " +
             "total_sec REAL, dive_sec REAL, spin_sec REAL, out_sec REAL, rise_sec REAL, " +
             "hold_sec REAL)");
      var stmt = db.prepare("INSERT INTO cinema_path VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      ov.bands.forEach(function(b, i) {
        var p = A.three2ifc(b.c.x, b.c.y, b.c.z);
        var d = A.three2ifcDir(b.d.x, b.d.y, b.d.z);
        stmt.run([i, p.ix, p.iy, p.iz, d.ix, d.iy, d.iz, b.len,
                  ov._total, ov.diveSec, ov.spinSec, ov.outSec, ov.riseSec,
                  +(b.hold || 0)]);
      });
      stmt.free();
      console.log('§CINEMA_PATH_SAVE bands=' + ov.bands.length + ' total=' + ov._total.toFixed(1) + 's');
    } catch (e) { console.warn('§CINEMA_PATH_SAVE_FAIL ' + e.message); }
  }
  A._exportBuildingDb = function() {
    if (!A.db) return null;
    if (!A.libDb || A.libDb === A.db) {
      console.log('§SAVE_EXPORT monolith (A.db holds geometry)');
      _writeStaffageTable(A.db);
      _writeCinemaPathTable(A.db);
      return A.db.export();
    }
    // Split → build a monolith: clone meta, copy every geometry table not already present.
    var Database = A.db.constructor;
    var mono = new Database(A.db.export());
    var have = {};
    var mres = mono.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (mres[0]) mres[0].values.forEach(function(r){ have[r[0]] = 1; });
    var copied = 0, rows = 0;
    var gres = A.libDb.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (gres[0]) gres[0].values.forEach(function(r){
      var tname = r[0], tsql = r[1];
      if (have[tname]) return;            // meta already owns it — don't clobber
      mono.run(tsql);
      var data = A.libDb.exec("SELECT * FROM " + tname);
      if (data[0] && data[0].values.length) {
        var cols = data[0].columns, ph = cols.map(function(){ return '?'; }).join(',');
        var stmt = mono.prepare("INSERT INTO " + tname + " VALUES (" + ph + ")");
        data[0].values.forEach(function(v){ stmt.run(v); rows++; });
        stmt.free();
      }
      copied++;
    });
    console.log('§SAVE_FOLD split→monolith geoTablesCopied=' + copied + ' rows=' + rows);
    _writeStaffageTable(mono);
    _writeCinemaPathTable(mono);
    var bytes = mono.export();
    mono.close();
    return bytes;
  };

  A.saveModelDb = async function() {
    if (!A.db) { if (A.status) A.status.textContent = 'Open a building first'; console.log('§SAVE_SKIP no A.db'); return; }
    var name = (A.activeBuilding || 'building').replace(/\.(ifc|db)$/i, '') + '.db';
    var bytes;
    try { bytes = A._exportBuildingDb(); }
    catch (e) { if (A.status) A.status.textContent = 'Save failed: ' + e.message; console.log('§SAVE_ERR ' + e.message); return; }
    if (!bytes) { console.log('§SAVE_SKIP export null'); return; }
    var blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    // Native Save As… (Chromium FSA) — the traditional desktop dialog. Fallback = download.
    if (window.showSaveFilePicker) {
      try {
        var handle = await window.showSaveFilePicker({ suggestedName: name,
          types: [{ description: 'Building database', accept: { 'application/x-sqlite3': ['.db'] } }] });
        var w = await handle.createWritable(); await w.write(blob); await w.close();
        if (A.status) A.status.textContent = 'Saved ' + handle.name;
        console.log('§SAVE_DONE mode=fsa name=' + handle.name + ' bytes=' + bytes.byteLength);
        return;
      } catch (e) { if (e.name === 'AbortError') { console.log('§SAVE_CANCEL user'); return; } /* else fall through to download */ }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    if (A.status) A.status.textContent = 'Saved ' + name + ' (download)';
    console.log('§SAVE_DONE mode=download name=' + name + ' bytes=' + bytes.byteLength);
  };

  // ── §SCENE_MERGE — the merge-or-replace prompt ────────────────────────────────────────────────
  // Implementing prompts/LANDING_MULTIMERGE_SAVEOPEN_RESURRECT.md §SM-3 / §SM-7 — Witness: W-SCENE-MERGE
  // PORT of archive/gallery.html:1045 showMergeModal(): same two-button shape, same copy, Enter=merge,
  // Esc=new. Two forced deltas, both because viewer.html has none of gallery's modal elements:
  //   (a) the DOM is built once here and reused, and
  //   (b) gallery's ">1 target → <select>" branch is DROPPED — a Viewer scene has exactly one active
  //       building, so there is never a target list. NO card / NO list surface (HARD CONSTRAINT).
  A._showMergeModal = function(fileName, targetName) {
    return new Promise(function(resolve) {
      var modal = document.getElementById('merge-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'merge-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;align-items:center;' +
          'justify-content:center;background:rgba(0,0,0,0.62);font:14px system-ui,sans-serif';
        modal.innerHTML =
          '<div style="background:#1b1e24;border:1px solid rgba(255,255,255,0.14);border-radius:10px;' +
          'padding:22px 24px;max-width:440px;color:#e8e8e8;box-shadow:0 10px 40px rgba(0,0,0,0.6)">' +
          '<div id="merge-target" style="font-size:15px;line-height:1.45;margin-bottom:6px"></div>' +
          '<div style="font-size:12px;opacity:0.65;margin-bottom:18px">Merge keeps the current scene and ' +
          'adds this file alongside it. New replaces the scene with just this file.</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end">' +
          '<button id="merge-new-btn" style="padding:8px 16px;border-radius:6px;cursor:pointer;' +
          'background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);color:#ddd">New (Esc)</button>' +
          '<button id="merge-btn" style="padding:8px 16px;border-radius:6px;cursor:pointer;' +
          'background:rgba(79,195,247,0.18);border:1px solid rgba(79,195,247,0.5);color:#4fc3f7;' +
          'font-weight:600">Merge (Enter)</button>' +
          '</div></div>';
        document.body.appendChild(modal);
      }
      document.getElementById('merge-target').textContent =
        'Merge "' + fileName + '" into "' + targetName + '"?';
      modal.style.display = 'flex';
      console.log('§MERGE_PROMPT file=' + fileName + ' target=' + targetName);

      function cleanup() { modal.style.display = 'none'; document.removeEventListener('keydown', onKey, true); }
      function done(action) { cleanup(); resolve({ action: action }); }
      function onKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done('merge'); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done('new'); }
      }
      document.addEventListener('keydown', onKey, true);
      document.getElementById('merge-btn').onclick = function() { done('merge'); };
      document.getElementById('merge-new-btn').onclick = function() { done('new'); };
    });
  };

  // Which tables get folded in. meta/transforms/instances are the streaming contract; the rest are
  // what rooms (rel_contained_in_space, spatial_structure) and 4D (tasks*) read. Folded only when the
  // table exists on BOTH sides. Dedup is INSERT OR IGNORE — the already-proven rule
  // (import_db_builder.js:45: same GUID twice collapses).
  A._MERGE_META_TABLES = ['elements_meta', 'element_transforms', 'element_instances',
    'rel_contained_in_space', 'spatial_structure', 'tasks', 'task_elements', 'task_sequences',
    'schedules', 'bom_tree'];
  A._MERGE_GEO_TABLES = ['component_geometries', 'base_geometries'];

  // ⚠ sql.js `exec` returns ONLY statements that produced rows, so `SELECT * … LIMIT 0` yields `[]`
  // and NOT a columns list — the first cut of this used that and silently merged nothing
  // (§MERGE_DONE newBuildings=0 with zero §MERGE_ROWS lines). PRAGMA table_info returns real rows.
  function _mergeCols(db, table) {
    try {
      var r = db.exec('PRAGMA table_info("' + table.replace(/"/g, '') + '")');
      if (!r || !r.length || !r[0].values.length) return null;
      return r[0].values.map(function(v) { return v[1]; });
    } catch (e) { return null; }
  }

  // §SM-7.0 landmine 3: real DBs disagree on columns (Duplex.component_geometries has `normals`,
  // Clinic's does not). Insert on the INTERSECTION, driven by the DESTINATION's schema so the
  // destination schema never changes — which is also what keeps the once-probed, cached
  // A._libHasNormals (streaming.js:868) honest after a merge.
  function _mergeTable(src, dst, table) {
    var sCols = _mergeCols(src, table), dCols = _mergeCols(dst, table);
    if (!sCols || !dCols) return null;
    var cols = dCols.filter(function(c) { return sCols.indexOf(c) >= 0; });
    if (!cols.length) return null;
    var q = cols.map(function(c) { return '"' + c + '"'; }).join(',');
    var before = 0, after = 0;
    try { before = dst.exec('SELECT COUNT(*) FROM "' + table + '"')[0].values[0][0]; } catch (e) {}
    // Stream row-by-row rather than materialising the whole table first — component_geometries is
    // ~100MB of BLOBs on Clinic and 311MB-class on KUL070 (§SM-5 memory is the real ceiling).
    var srcRows = 0, errs = 0;
    try {
      var st = src.prepare('SELECT ' + q + ' FROM "' + table + '"');
      var ins = dst.prepare('INSERT OR IGNORE INTO "' + table + '" (' + q + ') VALUES (' +
        cols.map(function() { return '?'; }).join(',') + ')');
      while (st.step()) { srcRows++; try { ins.run(st.get()); } catch (e2) { errs++; } }
      st.free(); ins.free();
    } catch (e) { console.warn('§MERGE_READ_FAIL table=' + table + ' ' + e.message); return null; }
    try { after = dst.exec('SELECT COUNT(*) FROM "' + table + '"')[0].values[0][0]; } catch (e) {}
    var added = after - before, dup = srcRows - added;
    console.log('§MERGE_ROWS table=' + table + ' src=' + srcRows + ' before=' + before +
      ' after=' + after + ' added=' + added + ' dup=' + dup + ' errs=' + errs +
      ' cols=' + cols.length + '/src' + sCols.length + '/dst' + dCols.length);
    return { src: srcRows, before: before, after: after, added: added, dup: dup, errs: errs };
  }

  function _georefPin(db) {
    if (!db) return null;
    try {
      var r = db.exec("SELECT key, value FROM project_metadata WHERE key IN " +
        "('georef_offset_x','georef_offset_y','georef_offset_z')");
      if (!r || !r.length) return null;
      var o = {};
      r[0].values.forEach(function(v) { o[v[0]] = parseFloat(v[1]); });
      if (isNaN(o.georef_offset_x) && isNaN(o.georef_offset_y) && isNaN(o.georef_offset_z)) return null;
      return [o.georef_offset_x || 0, o.georef_offset_y || 0, o.georef_offset_z || 0];
    } catch (e) { return null; }
  }

  // Merge an opened .db into the LIVE scene instead of navigating. §SM-7.1.
  A._mergeDbIntoScene = async function(fileName, bytes) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    var SQL = A._SQL || A.citySQL || A._citySQL;
    if (!SQL) { console.log('§MERGE_FAIL reason=no_sql_factory'); if (A.status) A.status.textContent = 'Merge failed — sql.js not ready'; return false; }
    if (!A.db) { console.log('§MERGE_FAIL reason=no_live_db'); return false; }
    var src;
    try { src = new SQL.Database(new Uint8Array(bytes)); }
    catch (e) { console.log('§MERGE_FAIL reason=open_src ' + e.message); return false; }

    var before = Object.keys(A.buildingCentres || {});
    var srcBlds = [];
    try {
      var br = src.exec('SELECT DISTINCT building FROM elements_meta');
      if (br && br.length) srcBlds = br[0].values.map(function(v) { return v[0]; });
    } catch (e) {}
    console.log('§MERGE_START file=' + fileName + ' bytes=' + bytes.byteLength +
      ' srcBuildings=' + JSON.stringify(srcBlds) + ' sceneBuildings=' + JSON.stringify(before));

    // ── §SM-7.1 step 2: frame rebase. The ALREADY-OPEN building's georef pins the frame; the
    // incoming DB rebases into it. Same rule as import.js:299-310's sessionGeorefOffset, applied to
    // a live scene instead of the first file of a drop. A.modelOffset is deliberately NOT touched —
    // building A's meshes are already placed against it (§SM-7.0 landmine 4).
    var pin = _georefPin(A.db), inc = _georefPin(src);
    if (pin && inc) {
      var dx = inc[0] - pin[0], dy = inc[1] - pin[1], dz = inc[2] - pin[2];
      if (dx || dy || dz) {
        try {
          src.run('UPDATE element_transforms SET center_x = center_x + ?, center_y = center_y + ?, center_z = center_z + ?', [dx, dy, dz]);
          console.log('§MERGE_GEOREF mode=rebase pin=(' + pin.join(',') + ') inc=(' + inc.join(',') + ') delta=(' + dx + ',' + dy + ',' + dz + ')');
        } catch (e) { console.log('§MERGE_GEOREF mode=rebase_fail ' + e.message); }
      } else {
        console.log('§MERGE_GEOREF mode=same pin=(' + pin.join(',') + ')');
      }
    } else {
      console.log('§MERGE_GEOREF mode=none pin=' + (pin ? '(' + pin.join(',') + ')' : 'absent') +
        ' inc=' + (inc ? '(' + inc.join(',') + ')' : 'absent') + ' — each DB keeps its own coordinates');
    }

    // ── §SM-7.1 step 3: fold the tables
    var stats = {};
    A._MERGE_META_TABLES.forEach(function(t) { var s = _mergeTable(src, A.db, t); if (s) stats[t] = s; });
    if (A.libDb) {
      A._MERGE_GEO_TABLES.forEach(function(t) {
        var s = _mergeTable(src, A.libDb, t);
        if (s) stats[t] = s;
        else if (A.libDb !== A.db) { var s2 = _mergeTable(src, A.db, t); if (s2) stats[t] = s2; }
      });
    }
    console.log('§MERGE_TABLES folded=' + JSON.stringify(Object.keys(stats)) +
      ' skipped=' + JSON.stringify(A._MERGE_META_TABLES.concat(A._MERGE_GEO_TABLES).filter(function(t){ return !stats[t]; })));
    if (!stats.elements_meta) {
      console.error('§MERGE_FAIL reason=elements_meta_not_folded — schema read failed, nothing merged');
      try { src.close(); } catch (e) {}
      if (A.status) A.status.textContent = 'Merge failed — could not read ' + fileName;
      return false;
    }
    if (!stats.elements_meta.added) {
      console.log('§MERGE_WARN elements_meta added=0 — nothing new (all GUIDs already present)');
    }
    try { src.close(); } catch (e) {}   // §SM-5 memory: free the source DB immediately

    // ── §SM-7.1 step 5: register in the City shape for API symmetry (one DB now holds both)
    A.cityBuildingDbs = A.cityBuildingDbs || {};
    srcBlds.forEach(function(n) { A.cityBuildingDbs[n] = { db: A.db, libDb: A.libDb }; });

    // ── §SM-7.1 step 6: add ONLY the new building names to buildingCentres (same GROUP BY query as
    // streaming.js:2119). Existing centres are left exactly as they are.
    var env = null;
    for (var k0 in A.buildingCentres) { if (A.buildingCentres[k0].envelope) { env = A.buildingCentres[k0].envelope; break; } }
    var added = [];
    try {
      var centres = A.dbQuery('SELECT m.building, COUNT(*), AVG(t.center_x), AVG(t.center_y), AVG(t.center_z) ' +
        'FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid GROUP BY m.building');
      for (var ci = 0; ci < centres.length; ci++) {
        var row = centres[ci];
        if (A.buildingCentres[row[0]]) { A.buildingCentres[row[0]].count = row[1]; continue; }
        A.buildingCentres[row[0]] = { ix: row[2], iy: row[3], iz: row[4], count: row[1] };
        if (env) A.buildingCentres[row[0]].envelope = env;
        added.push(row[0]);
      }
    } catch (e) { console.log('§MERGE_CENTRES_FAIL ' + e.message); }
    console.log('§MERGE_CENTRES before=' + before.length + ' after=' + Object.keys(A.buildingCentres).length +
      ' added=' + JSON.stringify(added));

    try {
      var er = A.dbQuery('SELECT COUNT(*) FROM elements_meta');
      A.totalElements = er.length ? er[0][0] : A.totalElements;
      var dr = A.dbQuery('SELECT discipline, COUNT(*) FROM elements_meta GROUP BY discipline');
      A.discCounts = {};
      for (var di = 0; di < dr.length; di++) A.discCounts[dr[di][0]] = dr[di][1];
    } catch (e) {}
    if (A.updateHUD) A.updateHUD();
    if (A.populateBuildingList) A.populateBuildingList();
    if (A._updateFogDensity) A._updateFogDensity();

    var ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
    console.log('§MERGE_DONE file=' + fileName + ' newBuildings=' + added.length +
      ' totalElements=' + A.totalElements + ' ms=' + ms.toFixed(0));
    if (A.status) A.status.textContent = 'Merged ' + fileName + ' — ' + added.length + ' building(s) added';

    // ── §SM-7.1 step 7: stream the new names sequentially (drained at stream-complete)
    A._mergePending = (A._mergePending || []).concat(added);
    A._mergeStreamNext();
    return true;
  };

  // Sequential drain, mirroring city.js's _cityStreamNext. Chained from the stream-complete hook in
  // streaming.js (right beside the existing City drain) — streamBuilding() handles ONE building, and
  // a real merged package (Clinic = 5 discipline buildings) has N.
  A._mergeStreamNext = function() {
    if (!A._mergePending || !A._mergePending.length) return;
    if (A.streaming) return;                     // re-chained at next stream-complete
    var next = null;
    while (A._mergePending.length) {
      var n = A._mergePending.shift();
      if (n && !(A.buildingsRendered && A.buildingsRendered.has(n))) { next = n; break; }
    }
    if (!next) { console.log('§MERGE_STREAM_DONE queue=empty'); return; }
    console.log('§MERGE_STREAM bld=' + next + ' remaining=' + A._mergePending.length);
    A.streamBuilding(next);
  };

  // ── Open Building → native Open… (FSA / file input). ──
  // §SCENE_MERGE: a building already open → ASK (merge into this scene / replace). Replace is
  // today's path, byte-for-byte: stash bytes in the cache store, navigate with ?db=import://…
  A._openDbBytes = async function(fileName, bytes) {
    var open = Object.keys(A.buildingCentres || {});
    if (A.db && open.length) {
      var target = (A.activeBuilding && A.buildingCentres[A.activeBuilding]) ? A.activeBuilding : open[0];
      var choice = await A._showMergeModal(fileName, target);
      console.log('§MERGE_CHOICE file=' + fileName + ' target=' + target + ' action=' + choice.action);
      if (choice.action === 'merge') { await A._mergeDbIntoScene(fileName, bytes); return; }
    } else {
      console.log('§MERGE_SKIP reason=no_building_open — replace path');
    }
    var key = fileName.replace(/\.(db|sqlite)$/i, '') + '.db';
    var dbUrl = 'import://' + key + '/v0';
    var cacheDb = await A.openCacheDB();
    if (!cacheDb) { if (A.status) A.status.textContent = 'Cache unavailable'; return; }
    await new Promise(function(resolve){
      var tx = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
      tx.objectStore(A.CACHE_STORE).put(bytes, dbUrl);
      tx.oncomplete = resolve; tx.onerror = resolve;
    });
    console.log('§OPEN_DB cached key=' + key + ' bytes=' + bytes.byteLength + ' → navigate');
    location.assign('viewer.html?db=' + encodeURIComponent(dbUrl) + '&lib=' + encodeURIComponent(dbUrl) + '&ghost=1');
  };

  // §SM-7.1 step 5 — source IFC in the SAME door. No new import path: route to the existing
  // A.importMultiIFC (import.js:267), take the DB it produced, feed it into the same merge/replace
  // flow. §SM-5 named the ceiling and it is measured, not theoretical: a single ~1GB+ source file
  // silently imports PARTIAL against the wasm32 4GB budget (IFC_LARGE_PRIVATE_STRESS_TEST §KUL009),
  // so say so out loud rather than hiding it behind a merge prompt.
  A._openIfcFiles = async function(files) {
    if (!A.importMultiIFC) { console.log('§OPEN_IFC_FAIL reason=no_importMultiIFC'); if (A.status) A.status.textContent = 'IFC import unavailable'; return; }
    var big = [];
    for (var i = 0; i < files.length; i++) if (files[i].size > 900 * 1048576) big.push(files[i].name + '=' + (files[i].size / 1048576).toFixed(0) + 'MB');
    if (big.length) {
      console.warn('§OPEN_IFC_WASM_RISK files=' + big.join(',') + ' — wasm32 4GB ceiling (§KUL009): this may import PARTIAL');
      if (A.status) A.status.textContent = 'Large IFC (' + big.join(',') + ') — may import partially (4GB wasm limit)';
    }
    console.log('§OPEN_IFC files=' + files.length + ' names=' + Array.prototype.map.call(files, function(f){ return f.name; }).join(','));
    var out = await A.importMultiIFC(files);
    if (!out || !out.record) { console.log('§OPEN_IFC_FAIL reason=no_record_returned'); return; }
    var bytes = out.record.extractedDb || out.record.metaDb;
    if (!bytes) { console.log('§OPEN_IFC_FAIL reason=no_db_bytes split=' + !!out.record.metaDb); return; }
    console.log('§OPEN_IFC_DB building=' + out.buildingName + ' bytes=' + bytes.byteLength + ' split=' + !!out.split);
    await A._openDbBytes(out.buildingName + '.db', new Uint8Array(bytes));
  };

  A.openModelDb = async function() {
    // Native Open… (Chromium FSA). Fallback = hidden <input type=file>.
    if (window.showOpenFilePicker) {
      try {
        var picks = await window.showOpenFilePicker({ multiple: true,
          types: [{ description: 'Building database or IFC', accept: { 'application/x-sqlite3': ['.db', '.sqlite'], 'application/x-step': ['.ifc'] } }] });
        var fsaFiles = [];
        for (var pi = 0; pi < picks.length; pi++) fsaFiles.push(await picks[pi].getFile());
        console.log('§OPEN_PICK mode=fsa n=' + fsaFiles.length + ' name=' + fsaFiles[0].name + ' bytes=' + fsaFiles[0].size);
        if (/\.ifc$/i.test(fsaFiles[0].name)) { await A._openIfcFiles(fsaFiles); return; }
        var buf = await fsaFiles[0].arrayBuffer();
        await A._openDbBytes(fsaFiles[0].name, new Uint8Array(buf));
        return;
      } catch (e) { if (e.name === 'AbortError') { console.log('§OPEN_CANCEL user'); return; } /* fall through */ }
    }
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.db,.sqlite,.ifc';
    input.multiple = true; input.style.display = 'none';
    input.addEventListener('change', async function(){
      if (!input.files.length) return;
      var file = input.files[0];
      console.log('§OPEN_PICK mode=input n=' + input.files.length + ' name=' + file.name + ' bytes=' + file.size);
      if (/\.ifc$/i.test(file.name)) { await A._openIfcFiles(input.files); }
      else { var buf = await file.arrayBuffer(); await A._openDbBytes(file.name, new Uint8Array(buf)); }
      if (input.parentNode) document.body.removeChild(input);
    });
    document.body.appendChild(input); input.click();
  };

  A.cachedFetch = async function(url) {
    // §CACHE_KEY (W-DB-CACHE-KEY — prompts/HISTORY_PERSIST_RECALL.md §VERIFY-FIRST ITEM 1): look the
    // blob up under the CANONICAL key, not the raw url. The landing opens a building with the absolute
    // OCI url and the ERP red pill opens the SAME building with '../buildings/<file>' — keyed raw, the
    // second one missed and re-downloaded 251MB every time. db_resolve.cacheKey folds the production
    // buildings/ set onto one key and leaves dev/deploy paths verbatim. Network still uses the real url.
    const key = (window.DbResolve && window.DbResolve.cacheKey) ? window.DbResolve.cacheKey(url, A.PROD_BASE) : url;
    if (key !== url) console.log(`[S203] §CACHE_KEY url=${url.split('/').pop()} key=${key}`);
    const cacheDb = await A.openCacheDB();
    if (cacheDb) {
      try {
        const cached = await new Promise((resolve, reject) => {
          const tx = cacheDb.transaction(A.CACHE_STORE, 'readonly');
          const req = tx.objectStore(A.CACHE_STORE).get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (cached) {
          // §PERF: log a cache hit ONCE per url, not on every call. A per-tick caller (e.g. the
          // dashboard's ad_seed.db read) turned this into 25.8MB-labelled console spam every tick.
          A._cacheHitLogged = A._cacheHitLogged || {};
          if (!A._cacheHitLogged[key]) {
            A._cacheHitLogged[key] = 1;
            console.log(`[S203] §CACHE_HIT ${url.split('/').pop()} size=${(cached.byteLength/1024/1024).toFixed(1)}MB`);
          }
          // Update LRU timestamp on hit
          try { var tx2 = cacheDb.transaction('timestamps', 'readwrite'); tx2.objectStore('timestamps').put(Date.now(), key); } catch(e2) {}
          return cached;
        }
        // §CACHE_KEY_LEGACY (W-DB-CACHE-KEY): profiles that cached BEFORE this fix hold the blob under
        // the raw url. Adopt it in place rather than making every existing user pay one more 251MB
        // download for the privilege of the fix. Re-key is best-effort; if it fails the legacy entry
        // is still found next load.
        if (key !== url) {
          var legacy = await new Promise(function(resolve) {
            try {
              var txL = cacheDb.transaction(A.CACHE_STORE, 'readonly');
              var reqL = txL.objectStore(A.CACHE_STORE).get(url);
              reqL.onsuccess = function() { resolve(reqL.result); };
              reqL.onerror = function() { resolve(null); };
            } catch(e3) { resolve(null); }
          });
          if (legacy) {
            console.log(`[S203] §CACHE_KEY_LEGACY_HIT url=${url.split('/').pop()} size=${(legacy.byteLength/1024/1024).toFixed(1)}MB → re-keying to ${key} (no re-download)`);
            try {
              await new Promise(function(resolve) {
                var txR = cacheDb.transaction([A.CACHE_STORE, 'timestamps'], 'readwrite');
                txR.objectStore(A.CACHE_STORE).put(legacy, key);
                txR.objectStore('timestamps').put(Date.now(), key);
                txR.objectStore(A.CACHE_STORE).delete(url);
                txR.objectStore('timestamps').delete(url);
                txR.oncomplete = function() { console.log(`[S203] §CACHE_KEY_REKEY_OK key=${key}`); resolve(); };
                txR.onerror = function() { resolve(); };
                txR.onabort = function() { console.warn(`[S203] §CACHE_KEY_REKEY_SKIP key=${key} — legacy entry left in place`); resolve(); };
              });
            } catch(e4) {}
            return legacy;
          }
        }
        console.log(`[S203] §CACHE_MISS_READ url=${url.split('/').pop()} — not in IDB, will fetch`);
      } catch(e) { console.log(`[S203] §CACHE_READ_ERR ${e.message}`); }
    } else {
      console.warn('[S203] §CACHE_DB_OPEN_FAIL — IDB unavailable');
    }

    // import:// URLs live only in IndexedDB — no network fallback
    if (url.startsWith('import://')) {
      A.status.textContent = 'Imported IFC not found — browser storage was cleared. Please re-import the file.';
      console.log('§IMPORT_CACHE_MISS url=' + url + ' — IDB cleared or quota reclaimed');
      throw new Error('DB not found in cache: ' + url);
    }

    let resp = await fetch(url);
    // §DB_404_OCI_RETRY (W-DB-404-OCI-RETRY): on GH-Pages the building DBs live on OCI (A.PROD_BASE),
    // not the relative buildings/ tree. A stale/relative db url (resumed pwa_last_db, old share link)
    // 404s here — rewrite the failing buildings/<file> to the OCI base and retry ONCE before giving up,
    // so a dead relative link self-heals instead of bricking the viewer boot. Pure decision in db_resolve.js.
    if (!resp.ok && window.DbResolve) {
      var _ociUrl = window.DbResolve.ociRetryUrl(url, A.PROD_BASE);
      if (_ociUrl) {
        console.warn(`[S203] §DB_404_OCI_RETRY status=${resp.status} orig=${url} → ${_ociUrl}`);
        var _ociResp = await fetch(_ociUrl);
        if (_ociResp.ok) { resp = _ociResp; console.log(`[S203] §DB_404_OCI_OK url=${_ociUrl.split('/').pop()}`); }
        else console.warn(`[S203] §DB_404_OCI_FAIL url=${_ociUrl} status=${_ociResp.status}`);
      }
    }
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    const contentLength = parseInt(resp.headers.get('Content-Length') || '0', 10);
    let buf;
    if (contentLength > 0 && resp.body) {
      const reader = resp.body.getReader();
      const chunks = []; let received = 0;
      const fileName = url.split('/').pop();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        // §S-PROGRESS-META — clamp ≤100%: gzip/transfer-encoding makes Content-Length (compressed)
        // smaller than received (decompressed) bytes, so the raw ratio can exceed 1.0.
        const pct = Math.min(100, Math.round((received / contentLength) * 100));
        if (A.status) A.status.textContent = `Downloading ${fileName}... ${pct}% (${(received/1024/1024).toFixed(0)}/${(contentLength/1024/1024).toFixed(0)}MB)`;
        // drive the visible bar during cachedFetch (meta.db phase), not just the status text
        var _sp = document.getElementById('s-progress');
        if (_sp) _sp.style.width = pct + '%';
      }
      const full = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { full.set(chunk, offset); offset += chunk.length; }
      buf = full.buffer;
    } else {
      buf = await resp.arrayBuffer();
    }

    if (cacheDb && !A._cacheDisabled) {
      try {
        // §S260b: LRU evict before write to keep under max entries
        await A._evictOldest(cacheDb);
        // One write attempt under `key`; resolves true on success, false if the tx aborted (quota).
        var _attemptWrite = function() {
          return new Promise(function(resolve) {
            var _writeOk = false;
            const tx = cacheDb.transaction([A.CACHE_STORE, 'timestamps'], 'readwrite');
            tx.objectStore('timestamps').put(Date.now(), key);
            const req = tx.objectStore(A.CACHE_STORE).put(buf, key);
            req.onsuccess = function() { _writeOk = true; console.log(`[S203] §CACHE_WRITE_OK url=${url.split('/').pop()} size=${(buf.byteLength/1024/1024).toFixed(1)}MB`); };
            req.onerror = function() {
              // §S260b: Quota exceeded — let the tx abort so the caller evicts LRU and retries.
              console.warn(`[S203] §CACHE_WRITE_ERR url=${url.split('/').pop()} err=${req.error}`);
            };
            tx.oncomplete = function() {
              if (!_writeOk) console.warn('[S203] §CACHE_TX_COMPLETE_BUT_NO_WRITE — data NOT persisted');
              resolve(_writeOk);
            };
            tx.onabort = function() { resolve(false); };
          });
        };
        // §CACHE_EVICT_LRU_RETRY (F3): on a quota abort, drop the OLDEST entries and try again —
        // bounded. The old code .clear()'d the entire store, so one oversized write wiped every
        // other cached building and turned the next open of ANY of them into a fresh download.
        var _ok = await _attemptWrite();
        for (var _try = 0; !_ok && _try < 4; _try++) {
          var _dropped = await A._evictOldest(cacheDb, 4);
          if (!_dropped) break;                       // nothing left to give up — stop, don't spin
          console.log(`[S203] §CACHE_EVICT_LRU_RETRY attempt=${_try + 1} dropped=${_dropped}`);
          _ok = await _attemptWrite();
        }
        if (!_ok) console.warn(`[S203] §CACHE_EVICT_WRITE_FAIL url=${url.split('/').pop()} — quota too small even after LRU eviction`);
      } catch(e) { console.log(`[S203] §CACHE_WRITE_ERR ${e.message}`); }
    }

    if (!cacheDb || A._cacheDisabled) {
      console.log(`[S203] §CACHE_SKIP url=${url.split('/').pop()} reason=${!cacheDb ? 'IDB_unavailable' : 'quota_low'}`);
    }
    return buf;
  };

  // §PATCH-SELFHEAL (Viewer side — ported from the Modeller's proven modeller/patches/ +
  // str_walker_outliner.js _applyPendingPatch convention, same LFS-blocked-until-2026-08-01
  // rationale: a shipped buildings/*.db can be stale relative to a small, real, already-witnessed
  // SQL fix that never crossed the network as a binary commit — VIEWER_FIND_PANEL_ROOM_ACCURACY.md
  // §2b, e.g. buildings/HHS_Office_Federated_extracted.db's spatial_structure). Convention:
  // `buildings/patches/<dbFile>.sql` names its target by the db's own filename (last path segment
  // of `url`), fetched from the SAME directory the db itself was fetched from (so it works whether
  // A.DB_URL is a relative `buildings/X.db` or an absolute OCI/GH-Pages URL). Applied on EVERY
  // load — cache-hit or fresh fetch — since a cached copy may itself predate the fix; the IDB cache
  // always stores the RAW server bytes, only the buffer handed to SQL.Database is patched. Every
  // patch script MUST be idempotent (DELETE-then-INSERT or INSERT OR IGNORE) so a repeat apply on
  // an already-current db is a safe no-op. Best-effort: a missing patch (404, the common case) or
  // any exec failure is swallowed and the ORIGINAL buffer returned untouched — never blocks an open.
  A._applyPendingPatch = async function(buf, url) {
    try {
      var dir = url.slice(0, url.lastIndexOf('/') + 1);
      var dbFile = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
      var patchUrl = dir + 'patches/' + dbFile + '.sql';
      var r = await fetch(patchUrl);
      if (!r.ok) { console.log(`[S203] §PATCH_NONE ${dbFile} (${r.status})`); return buf; }
      var sql = await r.text();
      var SQLFactory = A._SQL || window.SQL || window._SQL_CACHED;   // viewer caches the sql.js factory as A._SQL (streaming.js)
      if (!SQLFactory) { console.warn(`[S203] §PATCH_APPLY_FAIL ${url} — sql.js factory not loaded yet`); return buf; }
      var pdb = new SQLFactory.Database(new Uint8Array(buf));
      pdb.run(sql);
      var out = pdb.export().buffer;
      pdb.close();
      console.log(`[S203] §PATCH_APPLY ${dbFile} applied (${sql.length} bytes) from ${patchUrl}`);
      return out;
    } catch (e) {
      console.warn(`[S203] §PATCH_APPLY_FAIL ${url} — using unpatched db`, e && e.message);
      return buf;
    }
  };

  // BLOB → Three.js BufferGeometry (optional precomputed normals BLOB)
  A.blobToGeometry = function(vBlob, fBlob, nBlob) {
    try {
      const vArr = new Float32Array(vBlob.buffer, vBlob.byteOffset, vBlob.byteLength / 4);
      const fArr = new Uint32Array(fBlob.buffer, fBlob.byteOffset, fBlob.byteLength / 4);

      if (vArr.length < 9 || fArr.length < 3) return null;

      const positions = new Float32Array(vArr.length);
      for (let i = 0; i < vArr.length; i += 3) {
        positions[i]     = vArr[i];
        positions[i + 1] = vArr[i + 2];
        positions[i + 2] = -vArr[i + 1];
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(fArr, 1));
      if (nBlob && nBlob.byteLength >= 12) {
        // Precomputed normals — apply same Y↔Z swap as positions
        const nArr = new Float32Array(nBlob.buffer, nBlob.byteOffset, nBlob.byteLength / 4);
        const normals = new Float32Array(nArr.length);
        for (let i = 0; i < nArr.length; i += 3) {
          normals[i]     = nArr[i];
          normals[i + 1] = nArr[i + 2];
          normals[i + 2] = -nArr[i + 1];
        }
        geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        if (A) { A._normalsPrecomputed = (A._normalsPrecomputed || 0) + 1; }
      } else {
        geo.computeVertexNormals();
        if (A) { A._normalsComputed = (A._normalsComputed || 0) + 1; }
      }
      geo.computeBoundingSphere();
      // §S258: BVH deferred — don't build during streaming (86K builds = ~9s lag).
      // acceleratedRaycast falls back to normal raycast when boundsTree is absent.
      // BVH built lazily in background after streaming completes (see streaming.js).
      return geo;
    } catch (e) {
      return null;
    }
  };

  // Resize handler
  A._onResize = () => {
    A.camera.aspect = window.innerWidth / window.innerHeight;
    A.camera.updateProjectionMatrix();
    A.renderer.setSize(window.innerWidth, window.innerHeight);
    // §S277c: Resize EffectComposer
    if (A._composer) A._composer.setSize(window.innerWidth, window.innerHeight);
    if (A._ssaoPass) { A._ssaoPass.width = window.innerWidth; A._ssaoPass.height = window.innerHeight; }
    // §BLANK_IDLE: setSize() reallocates+CLEARS the WebGL drawing buffer. With the §IDLE-PARK
    // self-parking loop, a resize while parked leaves a cleared (blank) buffer until the next
    // pointer/wheel/key. markDirty() draws ONE frame at the new size; the gate re-parks at 0
    // GPU frames immediately after — idle-CPU savings untouched. (cf. webglcontextrestored:352)
    if (A.markDirty) A.markDirty();
  };
  window.addEventListener('resize', A._onResize);

  // ══════════════════════════════════════════════════════════════
  // S251: Key Sequence Engine + Command Palette + Panel Focus
  // Implementing S251_keyboard_modes.md — Witness: W-KBD
  // ══════════════════════════════════════════════════════════════

  // §1 — Sequence engine: buffer + debounce for multi-key shortcuts (SC, SU, etc.)
  var _seq = '';
  var _seqTimer = null;
  var _SEQ_MS = 600;

  // §RP-ZOOM-TIER — global "+ / −" context-zoom stepper (keyboard; consistent everywhere so users
  // build muscle memory). A feature PUBLISHES an ordered stack of framing thunks via
  // window.zoomTierSet (tightest→widest); "+" steps OUT a context ring, "−" steps IN. With no
  // stack (general context) +/− fall back to a plain camera dolly, so the keys ALWAYS do the same
  // gesture. Owner = scene.js (camera-level global); consumers call the window.* fns — same
  // convention as the other shortcuts (behaviour in owner, _shortcuts just dispatches).
  function _zoomStep(dir) {                          // +/- = standard zoom in/out (dolly to target)
    if (!A.camera || !A.controls || typeof THREE === 'undefined') return;
    var off = A.camera.position.clone().sub(A.controls.target);
    off.multiplyScalar(dir > 0 ? 0.8 : 1.25);        // + = in (closer), − = out (farther)
    A.camera.position.copy(A.controls.target.clone().add(off));
    A.controls.update();
    if (A.markDirty) A.markDirty();
    console.log('§ZOOM dir=' + dir + ' ' + (dir > 0 ? 'in' : 'out'));
  }

  // ══════════════════════════════════════════════════════════════
  // ROOM_CYCLE_HOME_SHORTCUTS.md — plain R cycles to progressively smaller rooms by real area;
  // plain Home resets the cycle + fits a tight exterior view. Fully independent of Alt+C
  // Cinema/MaxQ (no shared state, never calls startMaxQualityOrbit/startCinemaOrbit).
  // ══════════════════════════════════════════════════════════════
  var _roomCycleList = null;   // [{guid,area,name,cx,cy,cz,sx,sy}] sorted area DESC — IFC-space centers
  var _roomCycleIdx = -1;      // -1 = fresh/reset; 0 = largest; clamps at list.length-1
  var _roomCycleBld = null;    // building the list was built for — a building switch forces a rebuild

  // "Largest" per ROOM_CYCLE_HOME_SHORTCUTS.md §Spec: SUM(size_x*size_y) GROUP BY room_guid over
  // spatial_structure (existing columns — no schema change), excluding SUSPECT_* (compiler's own
  // low-confidence flag, same filter class as Alt+C's §CINEMA_SPACE_ENCLOSED_SKIP). `room_guid` is
  // only present after room_walker.js's writeRooms() ALTERs it in (§MULTI-RECT compiled rooms) —
  // real/un-compiled IfcSpace data has no such column, same schema-tolerance fallback (bare `guid`)
  // navigate_find.js/room_graph.js/hallway_backbone.js already use everywhere else.
  function _buildRoomAreaList() {
    if (!A.dbQuery) return [];
    var hasRoomGuid = false;
    try {
      var cols = A.dbQuery('PRAGMA table_info(spatial_structure)');
      hasRoomGuid = cols.some(function(c) { return c[1] === 'room_guid'; });
    } catch (e) { /* table missing — rows below will just come back empty */ }
    var rg = hasRoomGuid ? 'room_guid' : 'guid';
    var rows = A.dbQuery(
      'SELECT ' + rg + ' AS rg, SUM(size_x * size_y) AS area FROM spatial_structure ' +
      "WHERE type='IfcSpace' AND " + rg + ' IS NOT NULL ' +
      "AND (predefined_type IS NULL OR predefined_type NOT LIKE 'SUSPECT\\_%' ESCAPE '\\') " +
      'GROUP BY ' + rg + ' ORDER BY area DESC');
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var guid = rows[i][0], area = rows[i][1];
      if (!guid || !(area > 0)) continue;
      // Primary rect row (§MULTI-RECT: guid === room_guid is the un-suffixed first sub-rect) —
      // its own center/size is the room's anchor position, not an average across sub-rects.
      var pr = A.dbQuery('SELECT name, center_x, center_y, center_z, size_x, size_y ' +
        "FROM spatial_structure WHERE type='IfcSpace' AND guid = ?", [guid]);
      if (!pr.length) continue;
      list.push({ guid: guid, area: area, name: pr[0][0] || guid,
        cx: pr[0][1], cy: pr[0][2], cz: pr[0][3], sx: pr[0][4], sy: pr[0][5] });
    }
    return list;
  }

  // The building's main entrance = the lowest-cz 'exit' node of the room/corridor graph — reused
  // verbatim from tour.js's own entrance pick (never reimplemented, per the spec's Confirmed facts).
  function _graphEntrance(graph) {
    if (!graph || !graph.nodesByGuid) return null;
    var entrance = null;
    for (var k in graph.nodesByGuid) {
      var n = graph.nodesByGuid[k];
      if (n.kind === 'exit' && (!entrance || n.cz < entrance.cz)) entrance = n;
    }
    return entrance ? { cx: entrance.cx, cy: entrance.cy, cz: entrance.cz } : null;
  }

  // A specific room's OWN doorway — any graph edge touching this room's guid that carries a real
  // doorGuid (E1/E2/E4), reusing the door-carrying-room routing tag (bim-ootb#03a6cb7) rather than
  // reinventing door detection. Every such door is registered in graph.nodesByGuid (kind 'doorwp'/
  // 'exit') with its own real measured position — never a storey centroid.
  function _roomOwnDoor(graph, roomGuid) {
    if (!graph || !graph.edges) return null;
    for (var i = 0; i < graph.edges.length; i++) {
      var e = graph.edges[i];
      if (!e.doorGuid) continue;
      if (e.a === roomGuid || e.b === roomGuid) {
        var dn = graph.nodesByGuid && graph.nodesByGuid[e.doorGuid];
        if (dn) return { cx: dn.cx, cy: dn.cy, cz: dn.cz };
      }
    }
    return null;
  }

  // Point the camera at `room` (controls.target = room's own center, per spec) so its view
  // direction leans toward `facing` (entrance for the largest room, own doorway for the rest) —
  // i.e. the camera is positioned on the OPPOSITE side of the room from `facing`, so continuing
  // forward from the camera through the room center points at the facing point's bearing.
  function _faceRoom(room, facing, facingSrc) {
    var roomC3 = A.ifc2three(room.cx, room.cy, room.cz);
    var roomSpan = Math.max(room.sx || 0, room.sy || 0, 4);
    var dist = Math.max(4, roomSpan * 1.5); // same 1.5 fit-margin convention as streaming.js §CAMERA
    var camPos;
    if (facing) {
      var facing3 = A.ifc2three(facing.cx, facing.cy, facing.cz);
      var dx = facing3.x - roomC3.x, dz = facing3.z - roomC3.z;
      var horiz = Math.hypot(dx, dz);
      var ux = horiz > 1e-6 ? dx / horiz : 1, uz = horiz > 1e-6 ? dz / horiz : 0;
      camPos = { x: roomC3.x - ux * dist * 0.6, y: roomC3.y + dist * 0.8, z: roomC3.z - uz * dist * 0.6 };
    } else {
      facingSrc = 'none';
      camPos = { x: roomC3.x + dist * 0.6, y: roomC3.y + dist * 0.8, z: roomC3.z + dist * 0.6 };
    }
    A.camera.position.set(camPos.x, camPos.y, camPos.z);
    A.controls.target.set(roomC3.x, roomC3.y, roomC3.z);
    A.controls.update();
    if (A.markDirty) A.markDirty();
    return facingSrc;
  }

  async function _cycleRoom() {
    if (!A.camera || !A.controls || typeof THREE === 'undefined' || !A.dbQuery) {
      console.log('§ROOM_CYCLE no-op reason=no-engine'); return;
    }
    // Lazy-load the Navigate bundle — A.ensureRooms/A.getRoomGraph live there (78KB saved on first
    // paint; same warm-up pattern effects.js's §CINEMA_ROOMS already uses for the same reason).
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) {
      try { await A.loadNavigate(); } catch (e) { console.log('§ROOM_CYCLE loadNavigate_err=' + e.message); return; }
    }
    if (typeof A.ensureRooms === 'function') {
      try { await A.ensureRooms({}); } catch (e) { console.log('§ROOM_CYCLE ensureRooms_err=' + e.message); }
    }
    if (_roomCycleIdx < 0 || _roomCycleBld !== A.activeBuilding) {
      _roomCycleList = _buildRoomAreaList();
      _roomCycleBld = A.activeBuilding;
      _roomCycleIdx = -1;
    }
    if (!_roomCycleList || !_roomCycleList.length) { console.log('§ROOM_CYCLE no-op reason=no-rooms'); return; }
    if (_roomCycleIdx < _roomCycleList.length - 1) _roomCycleIdx++;  // clamp at the smallest, never wrap
    var room = _roomCycleList[_roomCycleIdx];
    var graph = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null;
    var isFirst = _roomCycleIdx === 0;
    // §JUDGMENT-CALL (spec "Out of scope", flagged not user-confirmed): room #2+ faces its OWN
    // doorway rather than the global entrance — falls back to the entrance if the room has no
    // tagged door edge (e.g. an isolated/no-door compiled room) so a facing is still attempted.
    var facing = isFirst ? _graphEntrance(graph) : (_roomOwnDoor(graph, room.guid) || _graphEntrance(graph));
    var facingSrc = isFirst ? 'entrance' : (_roomOwnDoor(graph, room.guid) ? 'own-door' : 'entrance-fallback');
    facingSrc = _faceRoom(room, facing, facing ? facingSrc : 'none');
    console.log('§ROOM_CYCLE press=' + (_roomCycleIdx + 1) + ' guid=' + room.guid +
      ' area=' + room.area.toFixed(1) + ' name=' + room.name + ' facing=' + facingSrc);
  }

  // Fit the camera to a TIGHT (zero-margin) exterior view of the whole building's
  // element_transforms bbox — byte-identical elevation/azimuth ratio (0.6,0.8,0.6) and buildingCentres
  // target as the initial-load §CAMERA framing (streaming.js, confirmed via grep before copying),
  // just with the padding multiplier dropped from 1.5 to 1.0 (the 80m floor is a degenerate-envelope
  // safety clamp, not "margin", so it stays).
  function _homeFillFrame() {
    if (!A.camera || !A.controls || !A.dbQuery || typeof THREE === 'undefined') {
      console.log('§ROOM_HOME no-op reason=no-engine'); return;
    }
    var bboxQ = A.dbQuery(A._hasBbox
      ? 'SELECT MAX(bbox_x), MAX(bbox_y), MAX(bbox_z), MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms'
      : 'SELECT NULL, NULL, NULL, MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms');
    var envW = 500, envD = 500, envH = 100;
    if (bboxQ.length > 0 && bboxQ[0][3] != null) {
      var xMin = bboxQ[0][3], xMax = bboxQ[0][4], yMin = bboxQ[0][5], yMax = bboxQ[0][6], zMin = bboxQ[0][7], zMax = bboxQ[0][8];
      envW = xMax - xMin; envD = yMax - yMin; envH = zMax - zMin;
    }
    if (envW < 1 && A.buildingCentres && Object.keys(A.buildingCentres).length > 0) {
      var bc0 = Object.values(A.buildingCentres)[0];
      envW = Math.max(50, Math.sqrt(bc0.count) * 2); envD = envW; envH = envW * 0.5;
    }
    var envelope = Math.max(envW, envD, envH);
    var dist = Math.max(80, envelope * 1.0);  // §ZERO_MARGIN: was envelope*1.5 at load time
    var firstBc = (A.buildingCentres && Object.keys(A.buildingCentres).length) ? Object.values(A.buildingCentres)[0] : null;
    var ctr = firstBc ? A.ifc2three(firstBc.ix, firstBc.iy, firstBc.iz) : A.ifc2three(0, 0, 0);
    A.camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.8, ctr.z + dist * 0.6);
    A.controls.target.set(ctr.x, ctr.y, ctr.z);
    A.controls.update();
    if (A.markDirty) A.markDirty();
    console.log('§ROOM_HOME reset=cycle+frame bbox=' + envW.toFixed(0) + 'x' + envD.toFixed(0) + 'x' + envH.toFixed(0) + 'm dist=' + dist.toFixed(0) + 'm');
  }

  function _homeResetAndFrame() {
    _roomCycleIdx = -1;   // next R press goes back to the largest room
    _homeFillFrame();
  }
  A._roomCycle = { list: function() { return _roomCycleList; }, idx: function() { return _roomCycleIdx; } }; // exposed for tests

  var _shortcuts = {
    '+':  function() { _zoomStep(1); },             // zoom in
    '-':  function() { _zoomStep(-1); },            // zoom out
    '2':  function() {
      if (A.measureActive || A._clashMatrixDiv) {
        A.status.textContent = 'Close Measure/Clash first'; return;
      }
      if (typeof window.open2DPlans === 'function') window.open2DPlans();
    },
    'x':  function() {
      // In 2D grid mode, scissors is managed by grid_overlay — don't toggle raw section
      if (A._gridOverlayState && A._gridOverlayState.active) {
        console.log('§KBD_X grid active — toggling section within 2D');
        if (A.toggleSection) A.toggleSection();
        return;
      }
      // §S281 fix: section-btn is display:none + empty (dead) — call the real toggle directly
      // (clicking the hidden button was a no-op, same class as the '.' bug).
      if (A.toggleSection) A.toggleSection();
    },
    '4':  function() { if (typeof A.export4D5D === 'function') A.export4D5D(); },
    'f':  function() { if (typeof A.openFindPanel === 'function') { A.openFindPanel(''); } else if (A.loadNavigate) { A.loadNavigate().then(function() { if (A.openFindPanel) A.openFindPanel(''); }); } },
    'p':  function() { if (typeof window.toggleSunglass === 'function') window.toggleSunglass(); },
    't':  function() { if (typeof toggleTimeMachine === 'function') toggleTimeMachine(); },
    'z':  function() { if (window.UniversalHistory && UniversalHistory.toggleOpen) UniversalHistory.toggleOpen(); }, // §UHIST: open/close the per-page timeline bar (Ctrl+Z = undo, bound in universal_history.js)
    'w':  function() { if (window.WholeHistory && WholeHistory.toggleOpen) WholeHistory.toggleOpen(); }, // §WHIST: open/close the cross-page World-history overlay (HISTORY_KNOB_DIAL.md)
    'l':  function() { if (typeof window.toggleFlyAround === 'function') window.toggleFlyAround(); },
    'o':  function() { if (typeof window.toggleDlodNav === 'function') window.toggleDlodNav(); }, // FLY_TOUR_DLOD_SCALE.md §9: nav LOD boxes (bOx; plain o — Ctrl+O stays open-model)
    'v':  function() { if (typeof window.toggleSfx === 'function') window.toggleSfx(); },
    's':  function() { if (typeof A.screenshot === 'function') A.screenshot(); },
    'n':  function() { if (typeof window.toggleNightMode === 'function') window.toggleNightMode(); },
    'b':  function() { if (typeof window.toggleBackground === 'function') window.toggleBackground(); },
    'i':  function() { if (typeof toggleIssues === 'function') toggleIssues(); },
    'h':  function() { if (typeof window.toggleShadow === 'function') window.toggleShadow(); },
    'c':  function() {
      // Block in 2D mode — Measure (parent of Clash) is greyed out
      if (A._gridOverlayState && A._gridOverlayState.active) {
        A.status.textContent = 'Exit 2D first'; return;
      }
      if (A._clashMatrixDiv) {
        A._clashMatrixDiv.remove(); A._clashMatrixDiv = null;
        // §BUG116: tear down panel registration + focus so a stale nav callback
        // can't fire against the now-null _clashMatrixDiv (TypeError at the getter).
        for (var _ci = _panels.length - 1; _ci >= 0; _ci--) {
          if (_panels[_ci].id === 'clash') { _panels.splice(_ci, 1); break; }
        }
        if (_focusedPanel && _focusedPanel.id === 'clash') _blurPanel();
        console.log('§CLASH_CLOSE_C unregistered, focus cleared');
        return;
      }
      console.log('§CLASH_KEY_C loadClashRules=' + !!A._loadClashRules);
      if (A._loadClashRules) A._loadClashRules(function(r) {
        A._currentClashRules = r;
        A._showClashMatrix(r, document.body);
        // Register matrix for Tab/arrow navigation after DOM is created
        setTimeout(function() {
          if (A._clashMatrixDiv && typeof window.makeListKeyNav === 'function') {
            var matNav = window.makeListKeyNav(
              // §BUG116: guard against a stale nav callback firing after the matrix
              // div was removed/nulled (e.g. closed by another path) — return empty.
              function() { return A._clashMatrixDiv ? Array.from(A._clashMatrixDiv.querySelectorAll('[data-pair]')) : []; },
              function() {},
              function(idx) {
                if (!A._clashMatrixDiv) return;
                var cells = Array.from(A._clashMatrixDiv.querySelectorAll('[data-pair]'));
                if (cells[idx]) cells[idx].click();
              }
            );
            var matClose = function() {
              if (A._clashRevealActive && A._dismissClashes) A._dismissClashes();
              if (A._clashMatrixDiv) { A._clashMatrixDiv.remove(); A._clashMatrixDiv = null; }
              if (A._clashModeActive && A._exitClashMode) A._exitClashMode();
              // §BUG116: unregister so reopen doesn't accumulate a duplicate 'clash' panel
              for (var _mi = _panels.length - 1; _mi >= 0; _mi--) {
                if (_panels[_mi].id === 'clash') { _panels.splice(_mi, 1); break; }
              }
            };
            _registerPanel('clash', A._clashMatrixDiv, matNav, matClose);
            _focusPanel('clash');
            // Watch for clash list popup — re-arms when list changes (new cell clicked)
            var _lastClashList = null;
            var _clashListWatcher = setInterval(function() {
              if (!A._clashMatrixDiv) { clearInterval(_clashListWatcher); return; }
              if (A._clashListDiv && A._clashListDiv !== _lastClashList) {
                _lastClashList = A._clashListDiv;
                A._clashListDiv._kbdWired = true;
                // Unregister old clashlist if exists
                for (var pi = _panels.length - 1; pi >= 0; pi--) {
                  if (_panels[pi].id === 'clashlist') { _panels.splice(pi, 1); break; }
                }
                var clashListNav = window.makeListKeyNav(
                  function() { return Array.from(A._clashListDiv.querySelectorAll('[data-clash-idx]')); },
                  function(indices) {
                    // Multi-select: highlight all selected, zoom to frame them all
                    if (indices.length > 1 && A._currentClashes && A.dbQuery && A.ifc2three) {
                      var cc = A._currentClashes;
                      // Map ListKeyNav cursor indices → actual data-clash-idx values
                      var rows = Array.from(A._clashListDiv.querySelectorAll('[data-clash-idx]'));
                      var clashIndices = [];
                      rows.forEach(function(r) { r.style.background = ''; });
                      indices.forEach(function(i) {
                        if (rows[i]) {
                          rows[i].style.background = 'rgba(79,195,247,0.25)';
                          var ci = parseInt(rows[i].getAttribute('data-clash-idx'));
                          if (!isNaN(ci)) clashIndices.push(ci);
                        }
                      });
                      if (!clashIndices.length) return;
                      // Clear previous highlights
                      if (A._clashHighlights) {
                        A._clashHighlights.forEach(function(h) { A.measureGroup.remove(h); });
                      }
                      A._clashHighlights = [];
                      // Query positions per clash pair for midpoint spheres
                      var minV = { x: Infinity, y: Infinity, z: Infinity };
                      var maxV = { x: -Infinity, y: -Infinity, z: -Infinity };
                      clashIndices.forEach(function(ci) {
                        if (!cc[ci]) return;
                        var pr = A.dbQuery(
                          'SELECT center_x, center_y, center_z FROM element_transforms WHERE guid IN (?, ?)',
                          [cc[ci][0], cc[ci][1]]
                        );
                        if (pr.length < 2) return;
                        var pA = A.ifc2three(pr[0][0], pr[0][1], pr[0][2]);
                        var pB = A.ifc2three(pr[1][0], pr[1][1], pr[1][2]);
                        var clashMid = new THREE.Vector3(
                          (pA.x + pB.x) / 2, (pA.y + pB.y) / 2, (pA.z + pB.z) / 2
                        );
                        // Highlight sphere at clash midpoint
                        var sGeo = new THREE.SphereGeometry(0.3, 8, 8);
                        var sMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.7, depthTest: false });
                        var sphere = new THREE.Mesh(sGeo, sMat);
                        sphere.position.copy(clashMid);
                        A.measureGroup.add(sphere);
                        A._clashHighlights.push(sphere);
                        // Expand bounding box
                        if (clashMid.x < minV.x) minV.x = clashMid.x; if (clashMid.x > maxV.x) maxV.x = clashMid.x;
                        if (clashMid.y < minV.y) minV.y = clashMid.y; if (clashMid.y > maxV.y) maxV.y = clashMid.y;
                        if (clashMid.z < minV.z) minV.z = clashMid.z; if (clashMid.z > maxV.z) maxV.z = clashMid.z;
                      });
                      if (!A._clashHighlights.length) return;
                      // Fly camera to frame all selected clash dots (overview)
                      var mid = new THREE.Vector3(
                        (minV.x + maxV.x) / 2, (minV.y + maxV.y) / 2, (minV.z + maxV.z) / 2
                      );
                      var span = Math.max(maxV.x - minV.x, maxV.y - minV.y, maxV.z - minV.z, 2);
                      var camDir = A.camera.position.clone().sub(A.controls.target).normalize();
                      var dist = span * 1.5;
                      var targetPos = mid.clone().add(camDir.multiplyScalar(dist));
                      var startPos = A.camera.position.clone();
                      var startTarget = A.controls.target.clone();
                      var frame = 0;
                      function step() {
                        frame++;
                        var t = frame / 20;
                        t = t * (2 - t); // ease-out
                        A.camera.position.lerpVectors(startPos, targetPos, t);
                        A.controls.target.lerpVectors(startTarget, mid, t);
                        A.controls.update();
                        A.markDirty();
                        if (frame < 20) requestAnimationFrame(step);
                      }
                      requestAnimationFrame(step);
                      console.log('§CLASH_MULTI count=' + indices.length + ' span=' + span.toFixed(1));
                    } else if (indices.length === 1 && A._flyToClash) {
                      var sRows = Array.from(A._clashListDiv.querySelectorAll('[data-clash-idx]'));
                      var sIdx = sRows[indices[0]] ? parseInt(sRows[indices[0]].getAttribute('data-clash-idx')) : indices[0];
                      A._flyToClash(sIdx);
                    }
                  },
                  function(idx) {
                    var rows = Array.from(A._clashListDiv.querySelectorAll('[data-clash-idx]'));
                    if (rows[idx] && A._flyToClash) {
                      var ci = parseInt(rows[idx].getAttribute('data-clash-idx'));
                      if (!isNaN(ci)) A._flyToClash(ci);
                    }
                  }
                );
                var clashListClose = function() {
                  // BUG-5 fix: unregister panel + reset watcher ref on close
                  for (var _ri = _panels.length - 1; _ri >= 0; _ri--) {
                    if (_panels[_ri].id === 'clashlist') { _panels.splice(_ri, 1); break; }
                  }
                  _lastClashList = null;
                  if (A._clashListDiv) { A._clashListDiv.remove(); A._clashListDiv = null; }
                  console.log('§CLASHLIST_CLOSE unregistered, watcher reset');
                };
                _registerPanel('clashlist', A._clashListDiv, clashListNav, clashListClose);
                A._clashListNav = clashListNav;
                // BUG-5 fix: delay focus to allow DOM layout before offsetWidth check
                setTimeout(function() { _focusPanel('clashlist'); }, 50);
              }
            }, 100);
          }
        }, 200);
      });
    },
    'm':  function() {
      if (A._gridOverlayState && A._gridOverlayState.active) {
        A.status.textContent = 'Exit 2D first'; return;
      }
      if (typeof A.toggleMeasure === 'function') A.toggleMeasure();
    },
    // §S280: -/+/= panel toggle removed — [] button replaces (single=F11, double=toggle panels)
    // 'r' (Record/Movie Maker) removed — the pill button + its DOM ref (_recBtn) were deleted in
    // the pill-drawer reorg (§DELETIONS, e433ac4) but this binding + window.toggleRecord() were
    // left behind, throwing ReferenceError: _recBtn is not defined on every press. No live caller
    // left anywhere in the codebase — matches the reorg's own "no longer in use, delete" verdict.
    // ROOM_CYCLE_HOME_SHORTCUTS.md (2026-07-22): 'r' reused for Room Cycle — plain R is confirmed
    // free (grepped), unrelated to the retired Record binding above.
    'r':  function() { _cycleRoom(); },
    'a':  function() { if (typeof window.resetCamOrbit === 'function') window.resetCamOrbit(); },   // Reset cam (Anchor) — precision-cam cluster w/ CapsLock+Q
    'q':  function() { if (typeof window.toggleCamPivot === 'function') window.toggleCamPivot(); },  // Auto-Pivot toggle
    'Ctrl+S': function() { if (A.saveModelDb) A.saveModelDb(); },   // Save Building → native Save As…
    'Ctrl+O': function() { if (A.openModelDb) A.openModelDb(); },   // Open Building → native Open…
    '=':  function() { // §S281: settings panel toggle — call action directly (pill wires
      // pointerup, so a synthetic btn.click() never reached it; don't depend on the DOM button).
      if (typeof window._openSettingsPanel === 'function') { window._openSettingsPanel(); console.log('§SETTINGS_TOGGLE via=keyboard'); }
      else if (A.status) A.status.textContent = 'UNDER CONSTRUCTION';
    },
    '/':  function() { if (A.quickShare) A.quickShare(); },
    // §HOVER_NAME (HOVER_NAME.md): verified free against this table 2026-07-29. Checkbox lives in
    // the Find panel; A.toggleHoverName exists from load (hover_name.js) regardless of whether the
    // panel was ever opened, so the key works standalone — same lazy-load-then-act shape as 'f'.
    "'": function() { if (A.toggleHoverName) A.toggleHoverName('key'); },
    '.':  function() { // §S281 P2: ⋯ toggle — prefer the live mobile pill, fall back to legacy overflow
      if (typeof window.toggleMobilePill === 'function') window.toggleMobilePill();
      else if (typeof window.toggleOverflow === 'function') window.toggleOverflow();
    }
  };

  // §S281 Layer 2: press-time shortcut firing — single place all dispatch routes through.
  // Announces what it fires, and if the handler throws it names the key loudly WITHOUT
  // taking down the keydown handler ("let it break so we know which"). Returns true if fired.
  function _fireShortcut(key) {
    var fn = _shortcuts[key];
    if (!fn) return false;
    console.log('§SHORTCUT_FIRE key=' + key);
    try {
      fn();
      return true;
    } catch (err) {
      console.error('§SHORTCUT_FAIL key=' + key + ' error=' + (err && err.message));
      return true; // it fired (and failed loudly) — don't fall through to other handling
    }
  }

  function _dispatchSeq(seq) {
    if (_shortcuts[seq]) {
      _fireShortcut(seq);
      console.log('§KBD_SEQ seq=' + seq);
      return true;
    }
    return false;
  }

  function _isPrefix(seq) {
    var keys = Object.keys(_shortcuts);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].length > seq.length && keys[i].indexOf(seq) === 0) return true;
    }
    return false;
  }

  // §1.2 — Sequence hint (transient label while waiting for second key)
  function _showSeqHint(text) {
    var el = document.getElementById('kbd-seq-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kbd-seq-hint';
      el.style.cssText = 'position:fixed;bottom:48px;right:16px;z-index:200;' +
        'background:rgba(0,0,0,0.7);color:#4fc3f7;font-family:monospace;font-size:18px;' +
        'padding:4px 10px;border-radius:6px;pointer-events:none;transition:opacity 0.2s';
      document.body.appendChild(el);
    }
    el.textContent = text ? text.toUpperCase() + '\u258C' : '';
    el.style.opacity = text ? '1' : '0';
  }

  // §5 — Command Palette (? key or 🛟 button)
  // §S282: _paletteEntries DELETED — Help reads from _mainPillActions (ONE source in panels.js)
  var _ic = function(d) { return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };

  function showCommandPalette() {
    var existing = document.getElementById('cmd-palette');
    if (existing) { existing.remove(); console.log('§KBD_HELP close'); return; }
    console.log('§KBD_HELP open');

    var pal = document.createElement('div');
    pal.id = 'cmd-palette';
    pal.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);' +
      'z-index:10001;background:rgba(10,10,30,0.97);border:1px solid rgba(79,195,247,0.3);' +
      'border-radius:12px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.6);' +
      'font-family:\'Segoe UI\',sans-serif;overflow:hidden';

    // §S283: Blue/Green triangle badge — always visible
    // Blue (#4fc3f7) = not installed, Green (#4caf50) = installed/standalone
    var _pwaInstalled = _isStandalone || window._pwaAccepted;
    var _badgeColor = _pwaInstalled ? '#4caf50' : '#4fc3f7';
    var _badgeTitle = _pwaInstalled ? 'Installed \u2714' : 'Download \xB7 Run Offline';
    var _badgeIcon = _pwaInstalled
      ? '<polyline points="20 6 9 17 4 12"/>'  // checkmark
      : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';  // download arrow
    console.log('§PWA_BADGE state=' + (_pwaInstalled ? 'green' : 'blue') +
      ' standalone=' + _isStandalone + ' accepted=' + !!window._pwaAccepted +
      ' prompt=' + !!window._installPrompt);
    var badgeHtml =
      '<div id="cmd-install-badge" title="' + _badgeTitle + '" style="position:absolute;top:0;right:0;' +
      'width:0;height:0;border-style:solid;border-width:0 48px 48px 0;' +
      'border-color:transparent ' + _badgeColor + ' transparent transparent;cursor:pointer;z-index:1;border-radius:0 12px 0 0">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ' +
      'style="position:absolute;top:4px;right:-42px">' +
      _badgeIcon + '</svg></div>';

    var html = '<div style="padding:6px 14px;color:#888;font-size:10px;border-bottom:1px solid #222;text-align:center">' +
      badgeHtml +
      '<div style="padding:10px 14px;border-bottom:1px solid #333">' +
      '<input id="cmd-search" type="text" placeholder="Type a command..." ' +
      'style="width:100%;background:#222;color:#eee;border:1px solid #555;border-radius:6px;' +
      'padding:8px 10px;font-size:13px;outline:none;box-sizing:border-box">' +
      '</div>' +
      '<div id="cmd-list" style="max-height:260px;overflow-y:auto;padding:4px 0"></div>' +
      '<div style="padding:8px 14px;border-top:1px solid #333;text-align:center;display:flex;align-items:center;justify-content:center;gap:14px">' +
      '<span id="cmd-report" title="Report Bug" style="color:#ff8a65;cursor:pointer;line-height:0">' + _ic(ICONS.circleHelp.svg) + '</span>' +
      '<a id="cmd-docs" href="https://red1oon.github.io/BIMCompiler/BIMUserGuide/" target="_blank" title="Viewer User Guide" ' +
      'style="color:#4fc3f7;line-height:0">' + _ic(ICONS.lightbulb.svg) + '</a></div>';
    pal.innerHTML = html;
    document.body.appendChild(pal);

    // §S283: Wire badge click — blue=download, green=check update
    var badge = document.getElementById('cmd-install-badge');
    if (badge) {
      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        pal.remove();
        if (_pwaInstalled) {
          console.log('§PWA_BADGE click=update (green)');
          _checkUpdate();
        } else {
          // ABOUT_BOX_CONSOLIDATE.md — the corner download triangle opens the shared
          // About/DIY modal (its DIY tab is the self-host installer). Help pill keeps the
          // shortcuts palette. Fallback to the raw offline download if AboutDIY is absent.
          console.log('§PWA_BADGE click=about-diy (blue)');
          if (window.AboutDIY) window.AboutDIY.open(); else _startOfflineDownload();
        }
      });
      console.log('§PWA_BADGE rendered color=' + _badgeColor);
    }

    var searchInput = document.getElementById('cmd-search');
    var listEl = document.getElementById('cmd-list');
    var cursor = 0;

    function renderList(filter) {
      var f = (filter || '').toLowerCase();
      // §S282: ONE source — read all entries from _mainPillActions (panels.js _actions)
      var all = [];
      if (window._mainPillActions) {
        window._mainPillActions.forEach(function(act) {
          all.push({
            seq: (act.key || '').toUpperCase(),
            name: act.name || (act.id.charAt(0).toUpperCase() + act.id.slice(1)),
            icon: act.icon ? _ic(act.icon) : (act.img ? '<img src="' + act.img + '" width="16" height="16">' : ''),
            action: act.fn,
            children: act.children || null
          });
        });
      }
      // §ZOOM: keyboard-only shortcuts (NOT pills) — surfaced in the Help listing for discoverability
      all.push({ seq: '+', name: 'Zoom In',  icon: '', action: function() { _shortcuts['+'](); }, children: null });
      all.push({ seq: '-', name: 'Zoom Out', icon: '', action: function() { _shortcuts['-'](); }, children: null });
      // §CINEMA_SHORTCUT (2026-07-17, user: "Cinema has no shortcut and not in Help box among the
      // others"): same keyboard-only pattern as Zoom above — Cinema Orbit lives as a row inside the
      // Sunglass panel, not its own pill, so it was never in _mainPillActions and never surfaced here.
      all.push({ seq: 'ALT+C', name: 'MaxQ Movie', icon: '', action: function() { if (typeof A.startMaxQualityOrbit === 'function') A.startMaxQualityOrbit(); else if (typeof A.startCinemaOrbit === 'function') A.startCinemaOrbit(); }, children: null });
      // §PHOTO_POPULATE (2026-07-17): Alt+P adds fabricated staffage (people + trees) for the
      // presentation shot — its own toggle, separate from Alt+S's clean extract-only still.
      all.push({ seq: 'ALT+P', name: 'Populate (people + trees)', icon: '', action: function() { if (typeof A.togglePopulate === 'function') A.togglePopulate(); }, children: null });
      // §HOVER_NAME: same keyboard-only pattern — lives as a Find-panel checkbox, not a pill.
      // Dead key on some international layouts (US-Intl, ES, PT, FR-CA) — fails harmlessly there.
      if (!window._isMobile) all.push({ seq: "'", name: 'Hover Name', icon: '', action: function() { if (A.toggleHoverName) A.toggleHoverName('key'); }, children: null });
      var matches = all.filter(function(e) {
        return e.name.toLowerCase().indexOf(f) >= 0 || e.seq.toLowerCase().indexOf(f) >= 0;
      });
      listEl.innerHTML = '';
      matches.forEach(function(entry, i) {
        var row = document.createElement('div');
        row.className = 'cmd-row';
        row.setAttribute('data-idx', String(i));
        row.style.cssText = 'padding:8px 14px;cursor:pointer;display:flex;align-items:center;' +
          'justify-content:space-between;font-size:13px;color:#e0e0e0;' +
          (i === cursor ? 'background:rgba(79,195,247,0.15)' : '');
        row.innerHTML = '<span style="display:flex;align-items:center;gap:8px">' +
          (entry.icon || '') + entry.name + '</span>' +
          (entry.seq ? '<kbd style="background:#333;color:#4fc3f7;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:12px;border:1px solid #555">' + entry.seq + '</kbd>' : '');
        row.addEventListener('click', function(e) {
          // S265 P10: left zone (bar+icon, <36px) toggles children; right zone launches action
          if (entry._childDiv) {
            var rect = row.getBoundingClientRect();
            if (e.clientX - rect.left < 36) {
              var open = entry._childDiv.style.display !== 'none';
              entry._childDiv.style.display = open ? 'none' : 'block';
              if (entry._bar) entry._bar.style.background = open ? '#4fc3f7' : '#f44336';
              return;
            }
          }
          pal.remove();
          if (entry.action) { entry.action(); }
          else { var seq = entry.seq.toLowerCase(); if (_shortcuts[seq]) _shortcuts[seq](); }
          console.log('§KBD_PALETTE_RUN name=' + entry.name + ' seq=' + entry.seq);
        });
        row.addEventListener('mouseenter', function() {
          cursor = i;
          highlightRows();
        });
        listEl.appendChild(row);
        // S265 P10: expandable children (+/−) inline tree
        if (entry.children && entry.children.length) {
          var childDiv = document.createElement('div');
          childDiv.style.cssText = 'display:none;padding:2px 14px 4px 28px;background:rgba(255,255,255,0.03);border-left:2px solid rgba(79,195,247,0.15);margin-left:14px';
          entry.children.forEach(function(c) {
            var ch = document.createElement('div');
            ch.style.cssText = 'font-size:12px;color:#aaa;padding:3px 0;display:flex;align-items:center;gap:6px';
            ch.innerHTML = (c.icon ? _ic(c.icon) : '') + '<span>' + c.name + '</span>';
            childDiv.appendChild(ch);
          });
          // Red bar in left margin — whole row toggles children
          row.style.position = 'relative';
          var bar = document.createElement('span');
          bar.style.cssText = 'position:absolute;left:4px;top:50%;transform:translateY(-50%);width:3px;height:16px;background:#4fc3f7;border-radius:1px';
          row.appendChild(bar);
          entry._childDiv = childDiv;
          entry._bar = bar;
          listEl.appendChild(childDiv);
        }
      });
      return matches;
    }

    function highlightRows() {
      var rows = listEl.querySelectorAll('.cmd-row');
      for (var i = 0; i < rows.length; i++) {
        rows[i].style.background = (i === cursor) ? 'rgba(79,195,247,0.15)' : '';
      }
    }

    var currentMatches = renderList('');
    // §G5: no auto-focus on mobile — soft keyboard is premature
    if (!window._isMobile) searchInput.focus();

    searchInput.addEventListener('input', function() {
      cursor = 0;
      currentMatches = renderList(this.value);
    });

    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { pal.remove(); console.log('§KBD_HELP close'); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, currentMatches.length - 1); highlightRows(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); cursor = Math.max(cursor - 1, 0); highlightRows(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        var entry = currentMatches[cursor];
        if (entry) {
          pal.remove();
          if (entry.action) { entry.action(); }
          else { var seq = entry.seq.toLowerCase(); if (_shortcuts[seq]) _shortcuts[seq](); }
          console.log('§KBD_PALETTE_RUN name=' + entry.name + ' seq=' + entry.seq);
        }
      }
    });

    // Report Bug link — calls existing APP.reportBug() (helpers.js)
    document.getElementById('cmd-report').addEventListener('click', function() {
      pal.remove();
      if (A.reportBug) A.reportBug();
    });

    // Click outside closes palette
    pal.addEventListener('click', function(e) { e.stopPropagation(); });
    setTimeout(function() {
      document.addEventListener('click', function _closePal() {
        var p = document.getElementById('cmd-palette');
        if (p) p.remove();
        document.removeEventListener('click', _closePal);
      }, { once: true });
    }, 100);
  }

  // Expose for 🛟 button
  A.showCommandPalette = showCommandPalette;
  window.showCommandPalette = showCommandPalette;

  // ── §S283: PWA Offline Install + CI-Gated Update ──────────────────────────

  // §S283 1.3: Create progress overlay (reuses reportBug styling)
  function _createProgressOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'pwa-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;' +
      'background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center';
    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:rgba(10,10,30,0.97);border-radius:14px;padding:24px 28px;' +
      'border:1px solid rgba(79,195,247,0.4);font-family:\'Segoe UI\',sans-serif;color:#e0e0e0;' +
      'max-width:400px;width:90%;text-align:center';
    dialog.innerHTML =
      '<div style="font-size:16px;font-weight:700;color:#4fc3f7;margin-bottom:12px">Download \xB7 Run Offline</div>' +
      '<div id="pwa-status" style="color:#aaa;font-size:13px;margin-bottom:12px">Preparing...</div>' +
      '<div style="background:#333;border-radius:6px;height:8px;margin-bottom:12px;overflow:hidden">' +
      '<div id="pwa-bar" style="background:#4fc3f7;height:100%;width:0%;transition:width 0.3s;border-radius:6px"></div></div>' +
      '<div id="pwa-buttons" style="display:none"></div>';
    overlay.appendChild(dialog);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return {
      setText: function(t) { document.getElementById('pwa-status').textContent = t; },
      setProgress: function(p) { document.getElementById('pwa-bar').style.width = Math.min(100, p) + '%'; },
      close: function() { overlay.remove(); },
      showButtons: function(html) {
        var el = document.getElementById('pwa-buttons');
        el.innerHTML = html;
        el.style.display = '';
      },
      el: overlay
    };
  }

  // §S283 1.3: Main offline download entry point
  function _startOfflineDownload() {
    if (_isStandalone) {
      if (A.status) A.status.textContent = 'Already installed';
      return;
    }
    var ov = _createProgressOverlay();
    ov.setText('Fetching asset list from service worker...');

    // Ask sw.js for the full precache list via MessageChannel
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      ov.setText('Service worker not ready. Reload and try again.');
      return;
    }
    var ch = new MessageChannel();
    ch.port1.onmessage = function(ev) {
      var assets = (ev.data.assets || []).concat(ev.data.libs || []);
      var version = ev.data.version || 'v515';
      window._pwaVersion = version; // stash for cache name
      _cacheAllAssets(assets, ov);
    };
    navigator.serviceWorker.controller.postMessage({ type: 'GET_PRECACHE' }, [ch.port2]);
  }

  // §S283 1.4: Force-cache every asset with progress
  function _cacheAllAssets(assets, ov) {
    ov.setText('Downloading ' + assets.length + ' files...');
    var cacheName = 'bim-ootb-' + (window._pwaVersion || 'v515');
    var _skipped = [];
    caches.open(cacheName).then(function(cache) {
      var done = 0;
      var total = assets.length;
      var queue = assets.slice();
      function batch() {
        var chunk = queue.splice(0, 6);
        if (chunk.length === 0) {
          // §S283: Verify — read cache back, count actual entries
          _verifyCacheWrite(cacheName, total, _skipped, ov);
          return;
        }
        Promise.all(chunk.map(function(url) {
          return cache.add(url).then(function() {
            done++;
            ov.setProgress(done / total * 80);
            ov.setText('Cached ' + done + '/' + total + '  ' + url.split('/').pop());
          }).catch(function(err) {
            done++;
            _skipped.push(url.split('/').pop());
            console.warn('§PWA_CACHE skip ' + url, err.message);
          });
        })).then(batch);
      }
      batch();
    });
  }

  // §S283: Verify cache write — read back and count
  function _verifyCacheWrite(cacheName, expected, skipped, ov) {
    ov.setProgress(82);
    ov.setText('Verifying cache...');
    caches.open(cacheName).then(function(cache) {
      return cache.keys();
    }).then(function(keys) {
      var actual = keys.length;
      var ok = actual >= (expected - skipped.length);
      console.log('§PWA_VERIFY cache=' + cacheName + ' expected=' + expected +
        ' actual=' + actual + ' skipped=' + skipped.length + ' ok=' + ok);
      if (skipped.length > 0) {
        console.warn('§PWA_VERIFY skipped: ' + skipped.join(', '));
      }
      // Store result for display in the install overlay
      window._pwaCacheResult = { expected: expected, actual: actual, skipped: skipped, ok: ok };
      _ensureBuildingCached(ov);
    });
  }

  // §S283 1.5: Ensure current building DB is fully in IndexedDB
  function _ensureBuildingCached(ov) {
    ov.setProgress(85);
    ov.setText('Verifying building data...');
    // Building DBs are already cached in IndexedDB by A.cachedFetch() during normal viewing.
    // Just verify the current building exists in cache.
    var buildingName = '';
    try {
      if (A.db) {
        var r = A.dbQueryFirst("SELECT value FROM project_metadata WHERE key='building_name'");
        if (r) buildingName = r[0];
      }
    } catch(e) {}
    if (buildingName) {
      console.log('§PWA_CACHE building=' + buildingName);
    }
    ov.setProgress(95);
    // Request persistent storage
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(function(granted) {
        console.log('§PWA_PERSIST granted=' + granted);
      });
    }
    ov.setProgress(100);
    ov.setText('All files cached!');
    // Trigger install prompt after short delay
    setTimeout(function() { _triggerInstall(ov); }, 500);
  }

  // §S283 1.6: Trigger native install prompt or show iOS guide
  function _triggerInstall(ov) {
    if (window._installPrompt) {
      ov.setText('Confirm the install prompt to add to home screen.');
      window._installPrompt.prompt();
      window._installPrompt.userChoice.then(function(r) {
        console.log('§PWA_INSTALL choice=' + r.outcome);
        window._installPrompt = null;
        if (r.outcome === 'accepted') {
          window._pwaAccepted = true;  // §S283: badge turns green on next Help open
          ov.setText('Installed! Find it on your home screen.');
        } else {
          ov.setText('Cancelled. Files are still cached for offline use.');
        }
        ov.showButtons(
          '<button id="pwa-done-ok" style="padding:8px 24px;background:#4fc3f7;color:#000;border:none;' +
          'border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">OK</button>'
        );
        document.getElementById('pwa-done-ok').addEventListener('click', function() { ov.close(); });
      });
      return;
    }
    // iOS — show guided overlay
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      ov.close();
      _showIOSGuide();
      return;
    }
    // No prompt available — prompt was consumed or browser doesn't support install
    console.log('§PWA_INSTALL no_prompt available. consumed=' + !window._installPrompt + ' iOS=false');
    var cr = window._pwaCacheResult || {};
    var statusEl = document.getElementById('pwa-status');
    if (statusEl) {
      var verifyLine = cr.ok
        ? '<div style="color:#4caf50;font-size:11px;margin-bottom:8px">\u2714 ' + cr.actual + ' files cached' +
          (cr.skipped && cr.skipped.length ? ', ' + cr.skipped.length + ' skipped' : '') + '</div>'
        : (cr.actual != null
          ? '<div style="color:#ff8a65;font-size:11px;margin-bottom:8px">\u26A0 ' + cr.actual + '/' + cr.expected + ' files cached</div>'
          : '');
      var _isFirefox = /Firefox\//.test(navigator.userAgent);
      var instructionHtml = _isFirefox
        ? '<div style="color:#4caf50;font-weight:700;margin-bottom:8px">Works offline in this tab!</div>' +
          '<div style="font-size:12px;color:#ccc;line-height:1.6">' +
          'Firefox does not support home screen install.<br>' +
          'For home screen shortcut, open in <b style="color:#4fc3f7">Chrome</b> or <b style="color:#4fc3f7">Edge</b>.</div>'
        : '<div style="color:#4caf50;font-weight:700;margin-bottom:8px">Ready for offline use!</div>' +
          '<div style="font-size:12px;color:#ccc;line-height:1.6">' +
          'Look for the install icon <b style="color:#4fc3f7;font-size:16px">\u229E</b> in your browser\'s address bar.<br>' +
          'Or close this tab, wait 30 seconds, and revisit to get the install prompt.</div>';
      statusEl.innerHTML = verifyLine + instructionHtml;
    }
    ov.showButtons(
      '<button id="pwa-fallback-ok" style="padding:8px 24px;background:#4fc3f7;color:#000;border:none;' +
      'border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">OK</button>'
    );
    document.getElementById('pwa-fallback-ok').addEventListener('click', function() { ov.close(); });
  }

  // §S283 1.7: iOS guided install overlay
  function _showIOSGuide() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;' +
      'background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML =
      '<div style="background:rgba(10,10,30,0.97);border-radius:14px;padding:24px 28px;' +
      'border:1px solid rgba(79,195,247,0.4);font-family:\'Segoe UI\',sans-serif;color:#e0e0e0;' +
      'max-width:340px;width:90%;text-align:left">' +
      '<div style="font-size:16px;font-weight:700;color:#4fc3f7;margin-bottom:16px;text-align:center">Add to Home Screen</div>' +
      '<div style="margin-bottom:12px;line-height:2">' +
      '<div><span style="background:#4fc3f7;color:#000;border-radius:50%;width:22px;height:22px;display:inline-flex;' +
      'align-items:center;justify-content:center;font-weight:700;font-size:12px;margin-right:8px">1</span>' +
      'Tap the <b style="color:#4fc3f7">Share</b> button <span style="font-size:18px">\u2B06\uFE0F</span></div>' +
      '<div><span style="background:#4fc3f7;color:#000;border-radius:50%;width:22px;height:22px;display:inline-flex;' +
      'align-items:center;justify-content:center;font-weight:700;font-size:12px;margin-right:8px">2</span>' +
      'Scroll down, tap <b style="color:#4fc3f7">"Add to Home Screen"</b></div>' +
      '<div><span style="background:#4fc3f7;color:#000;border-radius:50%;width:22px;height:22px;display:inline-flex;' +
      'align-items:center;justify-content:center;font-weight:700;font-size:12px;margin-right:8px">3</span>' +
      'Tap <b style="color:#4fc3f7">"Add"</b></div>' +
      '</div>' +
      '<div style="color:#888;font-size:11px;text-align:center">Your building is already cached. The app works offline once added.</div>' +
      '<div style="text-align:center;margin-top:14px"><button id="pwa-ios-ok" style="padding:8px 24px;' +
      'background:#333;color:#aaa;border:1px solid #555;border-radius:8px;font-size:12px;cursor:pointer">Got it</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('pwa-ios-ok').addEventListener('click', function() { overlay.remove(); });
    console.log('§PWA_INSTALL ios_guide_shown');
  }

  // §S283 3.2: CI-gated update check
  function _checkUpdate() {
    var ov = _createProgressOverlay();
    ov.setText('Checking for updates...');
    ov.setProgress(10);

    // Step 1: Get local version from sw.js via MessageChannel, then fetch remote sw.js
    var localVerPromise;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      localVerPromise = new Promise(function(resolve) {
        var ch = new MessageChannel();
        ch.port1.onmessage = function(ev) { resolve(ev.data.version || 'v0'); };
        navigator.serviceWorker.controller.postMessage({ type: 'GET_PRECACHE' }, [ch.port2]);
      });
    } else {
      localVerPromise = Promise.resolve('v0');
    }

    localVerPromise.then(function(localVersionStr) {
      var localVer = parseInt(localVersionStr.replace('v', ''));
      return fetch('sw.js', { cache: 'no-store' })
        .then(function(r) { return r.text(); })
        .then(function(text) {
          var match = text.match(/CACHE_VERSION\s*=\s*['"]v(\d+)['"]/);
          if (!match) throw new Error('Cannot read remote version');
          var remoteVer = parseInt(match[1]);
          ov.setProgress(30);

        if (remoteVer <= localVer) {
          ov.setText('You are up to date (v' + localVer + ')');
          ov.setProgress(100);
          setTimeout(function() { ov.close(); }, 2000);
          return;
        }

        // Step 2: Verify CI green on latest main commit
        ov.setText('Verifying CI status...');
        return fetch('https://api.github.com/repos/red1oon/bim-ootb/actions/runs?branch=main&status=success&per_page=1')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            ov.setProgress(50);
            if (!data.workflow_runs || data.workflow_runs.length === 0) {
              ov.setText('Not Ready, Try Later');
              ov.setProgress(100);
              console.log('§PWA_UPDATE ci=no_success_runs');
              setTimeout(function() { ov.close(); }, 3000);
              return;
            }
            console.log('§PWA_UPDATE ci=success');
            // Step 3: Fetch changelog
            return _fetchChangelog(remoteVer, localVer, ov);
          });
      });
    }).catch(function(err) {
      ov.setText('Cannot check now. Try when online.');
      console.warn('§PWA_UPDATE error', err.message);
      setTimeout(function() { ov.close(); }, 2000);
    });
  }

  // §S283 3.4: Show commit changelog with OK/Cancel
  function _fetchChangelog(remoteVer, localVer, ov) {
    ov.setText('Fetching changelog...');
    return fetch('https://api.github.com/repos/red1oon/bim-ootb/commits?sha=main&per_page=20')
      .then(function(r) { return r.json(); })
      .then(function(commits) {
        ov.setProgress(70);
        var changes = [];
        for (var i = 0; i < commits.length; i++) {
          var msg = commits[i].commit.message.split('\n')[0]; // first line only
          changes.push(msg);
          // Stop at the commit that bumped to our installed version
          if (msg.indexOf('v' + localVer) !== -1) break;
        }
        console.log('§PWA_UPDATE changelog=' + changes.length + ' items');

        // Render changelog
        var statusEl = document.getElementById('pwa-status');
        statusEl.innerHTML = '<div style="color:#4fc3f7;font-weight:700;margin-bottom:8px">Update Available: v' +
          localVer + ' \u2192 v' + remoteVer + '</div>' +
          '<div style="text-align:left;max-height:180px;overflow-y:auto;margin-bottom:12px">' +
          changes.map(function(c) {
            return '<div style="font-size:12px;color:#ccc;padding:3px 0;border-bottom:1px solid #222">\u2022 ' +
              c.replace(/</g, '&lt;') + '</div>';
          }).join('') + '</div>';
        ov.setProgress(100);

        // OK / Cancel buttons
        ov.showButtons(
          '<button id="pwa-update-ok" style="padding:8px 24px;background:#4fc3f7;color:#000;border:none;' +
          'border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-right:10px">OK</button>' +
          '<button id="pwa-update-cancel" style="padding:8px 24px;background:#333;color:#aaa;border:1px solid #555;' +
          'border-radius:8px;font-size:13px;cursor:pointer">Cancel</button>'
        );

        document.getElementById('pwa-update-ok').addEventListener('click', function() {
          console.log('§PWA_UPDATE confirmed v' + remoteVer);
          _applyUpdate(ov);
        });
        document.getElementById('pwa-update-cancel').addEventListener('click', function() {
          console.log('§PWA_UPDATE cancelled');
          ov.close();
        });
        // Esc to cancel
        var _escHandler = function(e) {
          if (e.key === 'Escape') { ov.close(); console.log('§PWA_UPDATE cancelled'); document.removeEventListener('keydown', _escHandler); }
        };
        document.addEventListener('keydown', _escHandler);
      });
  }

  // §S283 3.5: Apply update — re-cache all + reload
  function _applyUpdate(ov) {
    ov.setText('Updating...');
    ov.setProgress(0);
    // Tell new sw.js to take over
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    // Force sw.js re-register to pick up new CACHE_VERSION
    navigator.serviceWorker.register('sw.js').then(function(reg) {
      reg.update().then(function() {
        ov.setText('Updated! Reloading...');
        ov.setProgress(100);
        setTimeout(function() { window.location.reload(); }, 1000);
      });
    });
  }

  // §S283 4.1: Share Project (Web Share API or clipboard)
  function _shareProject() {
    var url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'BIM OOTB',
        text: 'View this building in your browser. Install for offline use.',
        url: url
      }).then(function() {
        console.log('§PWA_SHARE native');
      }).catch(function() {});
    } else {
      navigator.clipboard.writeText(url).then(function() {
        if (A.status) A.status.textContent = 'Link copied';
        console.log('§PWA_SHARE clipboard');
      });
    }
  }

  // §S283: Handle ?action= params from PWA shortcuts
  (function() {
    var params = new URLSearchParams(window.location.search);
    var action = params.get('action');
    if (action === 'update') {
      // Delay until viewer is loaded
      setTimeout(_checkUpdate, 2000);
    } else if (action === 'share') {
      setTimeout(_shareProject, 1000);
    }
  })();

  // Expose for external access
  A.checkUpdate = _checkUpdate;
  A.shareProject = _shareProject;
  A.startOfflineDownload = _startOfflineDownload;

  // §2 — Panel Focus Model (Tab to cycle, arrows within, mouse steals focus)
  var _panels = [];
  var _focusedPanel = null;
  var _focusStack = [];  // Esc pops back to previous panel

  function _registerPanel(id, el, nav, closeFn) {
    _panels.push({ id: id, el: el, nav: nav, close: closeFn || null });
    console.log('§PANEL_REGISTER id=' + id + ' hasNav=' + !!nav + ' hasClose=' + !!closeFn + ' totalPanels=' + _panels.length + ' allIds=[' + _panels.map(function(p){return p.id;}).join(',') + ']');
    // Desktop only — no focus glow on mobile touch
    if (!window._isMobile) {
      el.addEventListener('pointerdown', function() { _focusPanel(id); });
    }
  }
  function _focusPanel(id) {
    // Push current to stack before switching — §G2 fix: deduplicate
    var prevId = _focusedPanel ? _focusedPanel.id : 'none';
    if (_focusedPanel) {
      var _di = _focusStack.indexOf(_focusedPanel.id);
      if (_di >= 0) _focusStack.splice(_di, 1);
      _focusStack.push(_focusedPanel.id);
      if (_focusStack.length > 8) _focusStack.shift();
      _focusedPanel.el.style.boxShadow = '';
    }
    _focusedPanel = null;
    var found = false, checkedIds = [];
    for (var i = 0; i < _panels.length; i++) {
      var p = _panels[i];
      if (p.id === id) {
        var vis = p.el.style.display !== 'none' && p.el.offsetWidth > 0;
        checkedIds.push(p.id + '(vis=' + vis + ',w=' + p.el.offsetWidth + ')');
        if (vis) { _focusedPanel = p; found = true; break; }
      }
    }
    if (_focusedPanel) {
      _focusedPanel.el.style.boxShadow = 'inset 3px 0 0 #4fc3f7';
      var body = _focusedPanel.el.querySelector('.panel-body');
      var expanded = false;
      if (body && body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        expanded = true;
      }
      var hasNav = !!_focusedPanel.nav;
      var hasClose = !!_focusedPanel.close;
      console.log('§PANEL_FOCUS id=' + id + ' prev=' + prevId + ' hasNav=' + hasNav + ' hasClose=' + hasClose + ' expanded=' + expanded + ' stack=[' + _focusStack.join(',') + ']');
    } else {
      console.log('§PANEL_FOCUS_FAIL id=' + id + ' checked=[' + checkedIds.join(',') + '] totalPanels=' + _panels.length + ' allIds=[' + _panels.map(function(p){return p.id;}).join(',') + ']');
    }
  }
  function _blurPanel() {
    if (!_focusedPanel) { console.log('§PANEL_BLUR no-op (none focused)'); return; }
    var id = _focusedPanel.id;
    _focusedPanel.el.style.boxShadow = '';
    _focusedPanel = null;
    if (_focusStack.length) {
      var prevId = _focusStack.pop();
      console.log('§PANEL_BLUR id=' + id + ' → pop stack → ' + prevId + ' remaining=[' + _focusStack.join(',') + ']');
      _focusPanel(prevId);
    } else {
      console.log('§PANEL_BLUR id=' + id + ' → stack empty → unfocused');
    }
  }
  function _cyclePanel(dir) {
    var visible = _panels.filter(function(p) {
      return p.el.style.display !== 'none' && p.el.offsetWidth > 0;
    });
    if (!visible.length) { console.log('§PANEL_TAB no visible panels (total=' + _panels.length + ')'); return; }
    var idx = _focusedPanel ? visible.indexOf(_focusedPanel) : -1;
    var next = (idx + dir + visible.length) % visible.length;
    console.log('§PANEL_TAB dir=' + dir + ' from=' + (_focusedPanel ? _focusedPanel.id : 'none') + ' idx=' + idx + ' next=' + next + ' visible=[' + visible.map(function(p){return p.id;}).join(',') + ']');
    _focusPanel(visible[next].id);
  }

  A._registerPanel = _registerPanel;
  window._registerPanel = _registerPanel;
  window._focusPanel = _focusPanel;
  window._blurPanel = _blurPanel;
  window._cyclePanel = _cyclePanel;
  window._shortcuts = _shortcuts; // §S281: exposed so InputReg.checkShortcuts() can self-audit
  window._panels = _panels;
  window._focusStack = _focusStack; // §S280: exposed for [] double-tap
  // §S281 P0: expose CURRENT focused panel (a reassigned var, so via getter) for the
  // input registry facade + focusOnlyLatest. _focusStack only holds PREVIOUS focuses.
  window._getFocusedPanel = function() { return _focusedPanel; };

  // ── Keyboard handler ──────────────────────────────────────────
  // ORIGINAL shortcuts preserved. Sequence engine + panel focus added on top.
  window.addEventListener('keydown', function(e) {
    if (window._isMobile) return; // §5 mobile guard

    // Command palette open? Let it handle its own keys
    if (document.getElementById('cmd-palette')) { console.log('§KBD_ROUTE palette active, pass-through key=' + e.key); return; }

    // Always-on modifier shortcuts
    // Alt+Z = 3-state cycle Off→X-Ray→Bbox→Off (Blender Alt+Z convention, extended). Alt+X
    // deleted — merged into this single cycle, see A.cycleXrayBboxMode (tools.js).
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (typeof A.cycleXrayBboxMode === 'function') A.cycleXrayBboxMode(); console.log('§KBD_ROUTE Alt+Z → xray-cycle'); if (window.S) window.S('KBD_ROUTE', 'Alt+Z → xray-cycle', { xray: true }); return; }
    // Alt+S = still-refine — progressive TAA supersample of the current camera view (2026-07-15,
    // user ask). Cancels itself on any interaction via the A.markDirty() wrap in effects.js.
    if (e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (typeof A.toggleStillRefine === 'function') A.toggleStillRefine(); console.log('§KBD_ROUTE Alt+S → still-refine'); return; }
    // §GI_POC (sandbox spike, feat/ssgi-composer-poc, isolated branch — not a shipped feature)
    if (e.altKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); if (typeof A.toggleGIPreview === 'function') A.toggleGIPreview(); console.log('§KBD_ROUTE Alt+G → GI preview (N8AO POC)'); return; }
    if (e.altKey && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); if (typeof A.toggleSSGIPreview === 'function') A.toggleSSGIPreview(); console.log('§KBD_ROUTE Alt+J → SSGI preview (realism-effects spike)'); return; }
    // §CINEMA_SHORTCUT (2026-07-17, user: "Cinema... no shortcut... What do u suggest?" — confirmed
    // Alt+C, distinct namespace from plain 'c' (Clash), no conflict). Previously only reachable via
    // the Sunglass panel's Cinema row (panels.js) — user separately confirmed Cinema Orbit works
    // fine without ever pressing Alt+S first, just adjust the starting camera view and go.
    if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); if (typeof A.startMaxQualityOrbit === 'function') A.startMaxQualityOrbit(); else if (typeof A.startCinemaOrbit === 'function') A.startCinemaOrbit(); console.log('§KBD_ROUTE Alt+C → MaxQ movie (toggle=cancel)'); return; }
    // §PHOTO_POPULATE (2026-07-17): Alt+P toggles the fabricated staffage layer (people + trees),
    // separate from Alt+S. Distinct namespace from plain 'p' — no conflict.
    if (e.altKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); if (typeof A.togglePopulate === 'function') A.togglePopulate(); console.log('§KBD_ROUTE Alt+P → populate (staffage)'); return; }
    if (e.key === 'F1') { e.preventDefault(); console.log('§KBD_ROUTE F1 → help'); showCommandPalette(); return; }
    if (e.key === 'F11') { e.preventDefault(); console.log('§KBD_ROUTE F11 → fullscreen'); A.toggleFullscreen(); return; }
    // Ctrl/Cmd+S = Save Building, Ctrl/Cmd+O = Open Building — preventDefault suppresses the browser's
    // own Save-page / Open-file so the native app-style dialogs take over (traditional document verbs).
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); console.log('§KBD_ROUTE Ctrl+S → save'); if (A.saveModelDb) A.saveModelDb(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); console.log('§KBD_ROUTE Ctrl+O → open'); if (A.openModelDb) A.openModelDb(); return; }

    var noMod = !e.ctrlKey && !e.altKey && !e.metaKey;
    var notInput = e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA';

    // §S280 / §HSF-5b: Backspace = undo, \ = redo — now route through the ONE universal timeline
    // (skip-audit + replay + read-only picks), not the retired raw scene-undo.
    if (noMod && notInput && e.key === 'Backspace') {
      e.preventDefault();
      if (window.UniversalHistory) { UniversalHistory.open(); UniversalHistory.undo(); }
      else if (window._doSceneUndo) window._doSceneUndo();
      return;
    }
    if (noMod && notInput && e.key === '\\') {
      e.preventDefault();
      if (window.UniversalHistory) { UniversalHistory.open(); UniversalHistory.redo(); }
      else if (window._doSceneRedo) window._doSceneRedo();
      return;
    }

    // Tab — cycle panel focus (§2)
    if (e.key === 'Tab' && notInput) {
      e.preventDefault();
      console.log('§KBD_ROUTE tab shift=' + e.shiftKey + ' panels=' + _panels.length + ' focused=' + (_focusedPanel ? _focusedPanel.id : 'none'));
      _cyclePanel(e.shiftKey ? -1 : 1);
      return;
    }

    // Panel-focused keys: arrows, space, ctrl+space, escape, typeahead
    if (_focusedPanel && _focusedPanel.nav) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0 ||
          (e.key === ' ' && noMod) ||
          (e.ctrlKey && e.key === ' ') ||
          (e.key === 'PageUp') || (e.key === 'PageDown') ||
          (e.key === 'Home') || (e.key === 'End') ||
          (e.shiftKey && ['ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) ||
          (e.ctrlKey && e.key === 'a') ||
          (e.key === 'Enter')) {
        e.preventDefault();
        console.log('§KBD_ROUTE panel=' + _focusedPanel.id + ' key=' + e.key + ' shift=' + e.shiftKey + ' ctrl=' + e.ctrlKey);
        _focusedPanel.nav.onKey(e);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        console.log('§KBD_ROUTE esc panel=' + _focusedPanel.id + ' hasClose=' + !!_focusedPanel.close);
        if (_focusedPanel.close) { _focusedPanel.close(); console.log('§PANEL_CLOSE id=' + _focusedPanel.id); }
        _blurPanel();
        return;
      }
      // §S277b: Shortcuts take priority over typeahead — h/n/etc must not be swallowed
      if (noMod && notInput && e.key.length === 1 && _shortcuts[e.key.toLowerCase()]) {
        // Fall through to shortcut engine below — don't consume as typeahead
      }
      // Typeahead within focused panel (single printable char, no modifier)
      else if (noMod && notInput && e.key.length === 1 && e.key !== '?' && _focusedPanel.nav.onTypeahead) {
        console.log('§KBD_ROUTE typeahead panel=' + _focusedPanel.id + ' char=' + e.key);
        _focusedPanel.nav.onTypeahead(e.key);
        return;
      }
    }

    // ROOM_CYCLE_HOME_SHORTCUTS.md — plain Home resets the R-cycle + fits a tight exterior frame,
    // but ONLY in the genuine gap where Home is otherwise unclaimed: placed AFTER the _focusedPanel
    // block above (so a focused list-nav panel keeps owning Home for jump-to-top, case 2 in the
    // spec's Confirmed facts) and guarded off whenever corridor-nav is active (navigate_engine.js's
    // own separate keydown listener already owns Home for route-reset via A._nav.active, case 1) —
    // NOT placed in the top "always-on modifiers" section, which runs before the panel-focus check
    // and would wrongly steal case 2.
    if (noMod && notInput && e.key === 'Home' && !(A._nav && A._nav.active) && !_focusedPanel) {
      e.preventDefault();
      _homeResetAndFrame();
      return;
    }

    if (!noMod || !notInput) { console.log('§KBD_ROUTE drop key=' + e.key + ' noMod=' + noMod + ' notInput=' + notInput); return; }

    // Arrow ←→ — step section slider when section panel is visible
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !_focusedPanel) {
      var secPanel = document.getElementById('section-slider-panel');
      var slider = document.getElementById('section-slider');
      if (secPanel && secPanel.style.display !== 'none' && slider) {
        e.preventDefault();
        var step = parseFloat(slider.step) || 0.1;
        var val = parseFloat(slider.value) + (e.key === 'ArrowRight' ? step : -step);
        val = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), val));
        slider.value = val;
        if (typeof A.updateSectionPlane === 'function') A.updateSectionPlane(val);
        console.log('§KBD_SLIDER key=' + e.key + ' val=' + val.toFixed(2) + ' min=' + slider.min + ' max=' + slider.max + ' step=' + slider.step);
        return;
      }
    }

    // ? — command palette
    if (e.key === '?') { e.preventDefault(); console.log('§KBD_ROUTE ? → palette'); showCommandPalette(); return; }

    // §S280: Esc universal — close pill, then close any visible panel
    if (e.key === 'Escape') {
      e.preventDefault();
      // Close pill if open
      if (document.getElementById('mobile-pill') && document.getElementById('mobile-pill').style.display !== 'none') {
        if (typeof window.toggleMobilePill === 'function') window.toggleMobilePill();
        console.log('§KBD_ESC → close pill');
        return;
      }
      // Close last visible dynamic panel (find, clash, issues, etc.)
      var _dynPanels = document.querySelectorAll('#find-panel, #issues-panel, .glass-panel, #cmd-palette');
      for (var _di = _dynPanels.length - 1; _di >= 0; _di--) {
        var _dp = _dynPanels[_di];
        if (_dp.style.display !== 'none' && _dp.offsetWidth > 0) {
          var closeBtn = _dp.querySelector('.bim-panel-close, .panel-toggle, [id$="-close"]');
          if (closeBtn) closeBtn.click();
          else _dp.style.display = 'none';
          console.log('§KBD_ESC → close ' + (_dp.id || 'panel'));
          return;
        }
      }
      console.log('§KBD_ESC no-op (nothing to close)');
      return;
    }

    // Key sequence engine
    clearTimeout(_seqTimer);
    var prevSeq = _seq;
    _seq += e.key.toLowerCase();

    var hasExact = !!_shortcuts[_seq];
    var hasLonger = _isPrefix(_seq);
    console.log('§KBD_SEQ_ENGINE input=' + e.key + ' prevSeq="' + prevSeq + '" seq="' + _seq + '" exact=' + hasExact + ' prefix=' + hasLonger);

    if (hasExact && !hasLonger) {
      e.preventDefault(); // §S280d: block keypress so char doesn't enter focused input (e.g. 'f' → Find)
      console.log('§KBD_SEQ_FIRE seq=' + _seq + ' (immediate, no longer prefix)');
      _dispatchSeq(_seq);
      _seq = '';
      _showSeqHint('');
      return;
    }
    if (hasLonger) {
      e.preventDefault();
      console.log('§KBD_SEQ_WAIT seq=' + _seq + ' (prefix of longer, waiting ' + _SEQ_MS + 'ms)');
      _showSeqHint(_seq);
      _seqTimer = setTimeout(function() {
        if (_shortcuts[_seq]) {
          console.log('§KBD_SEQ_FIRE seq=' + _seq + ' (timeout, exact match)');
          _shortcuts[_seq]();
        } else {
          console.log('§KBD_SEQ_TIMEOUT seq=' + _seq + ' (no match, discarded)');
        }
        _seq = '';
        _showSeqHint('');
      }, _SEQ_MS);
      return;
    }
    // No match, no prefix — reset
    console.log('§KBD_SEQ_DISCARD seq=' + _seq + ' (no match, no prefix)');
    _seq = '';
    _showSeqHint('');
  });

  // §S280: Undo/Redo — shared by keyboard + buttons
  var _undoBtn = document.getElementById('undo-btn');
  var _redoBtn = document.getElementById('redo-btn');

  function _updateUrButtons() {
    if (!A.db || !window.KernelOps) return;
    // Check if undo is available
    var hasUndo = false, hasRedo = false;
    try {
      var u = A.db.exec('SELECT id FROM kernel_ops WHERE undone = 0 ORDER BY id DESC LIMIT 1');
      hasUndo = u.length > 0 && u[0].values.length > 0;
      var r = A.db.exec('SELECT id FROM kernel_ops WHERE undone = 1 ORDER BY id ASC LIMIT 1');
      hasRedo = r.length > 0 && r[0].values.length > 0;
    } catch(e) {}
    if (_undoBtn) { _undoBtn.classList.toggle('active-undo', hasUndo); }
    if (_redoBtn) { _redoBtn.classList.toggle('active-redo', hasRedo); }
  }

  // §HSF-5b: delegate to the universal timeline (ONE undo path). Back-compat shim for any caller.
  window._doSceneUndo = function() {
    if (window.UniversalHistory) { UniversalHistory.open(); UniversalHistory.undo(); return; }
    if (!window.KernelOps || !A.db) { A.status.textContent = 'No ops to undo'; return; }
    var op = KernelOps.undoOp(A.db);
    if (op) {
      A.status.textContent = 'Undo: ' + op.op_type;
      console.log('§UNDO type=' + op.op_type + ' id=' + op.id);
    } else {
      A.status.textContent = 'Nothing to undo';
    }
    _updateUrButtons();
  };
  window._doSceneRedo = function() {
    if (window.UniversalHistory) { UniversalHistory.open(); UniversalHistory.redo(); return; }
    if (!window.KernelOps || !A.db) { A.status.textContent = 'No ops to redo'; return; }
    var op = KernelOps.redoOp(A.db);
    if (op) {
      A.status.textContent = 'Redo: ' + op.op_type;
      console.log('§REDO type=' + op.op_type + ' id=' + op.id);
    } else {
      A.status.textContent = 'Nothing to redo';
    }
    _updateUrButtons();
  };

  // Update button state when any kernel_op is committed
  var _origCommitOp = window.KernelOps ? KernelOps.commitOp : null;
  if (_origCommitOp) {
    KernelOps.commitOp = function() {
      var result = _origCommitOp.apply(this, arguments);
      _updateUrButtons();
      return result;
    };
  }
  // Initial state
  setTimeout(_updateUrButtons, 2000);
}

// ── Implementing FLY_TOUR_DLOD_SCALE.md §14 (bim-compiler prompts/Viewer/) — GPU degradation
// decision logic. Witnesses: W-GPU-WARN-FIRSTRUN / -DEGRADED / -RECOVERED / -NONAG.
// Pure logic, no DOM/GPU access — node witnesses drive it with a mocked localStorage-shaped
// `storage` ({getItem,setItem,removeItem}). `onWarn(msg)` fires ONLY when a toast should show.
// Returns 'skip' | 'init' | 'warn' | 'nonag' | 'update' (witness-readable outcome tag).
//
// DON'T-NAG MECHANISM (§14 left this open; pinned here): PERSISTED, via localStorage key
// `bim_gpu_warned` holding the exact degraded signature ("<renderer>|<multiDraw>") already warned
// about. A session-only dismissed-flag was rejected because every fresh page load is a new JS
// session — it would re-toast on every open, exactly the nagging §14 forbids. The toast re-shows
// only when the degraded signature CHANGES (degrades further, or recovers then re-degrades); the
// flag is cleared on any same-or-improved load so a future degradation warns again.
function gpuBaselineCheck(gpu, md, storage, onWarn) {
  if (typeof gpu !== 'string' || typeof md !== 'boolean' || !storage) return 'skip';
  var raw = storage.getItem('bim_gpu_lastgood');
  var nowSig = JSON.stringify({ renderer: gpu, multiDraw: md, ts: Date.now() });
  var last = null;
  if (raw) { try { last = JSON.parse(raw); } catch (e) { last = null; } }
  if (!last || typeof last.renderer !== 'string') {
    // First-ever run (or unreadable stored blob): nothing to compare against — just store.
    storage.setItem('bim_gpu_lastgood', nowSig);
    console.log('§GPU_BASELINE_INIT gpu=' + gpu + ' multi_draw=' + md);
    return 'init';
  }
  // §14 heuristic — EXACTLY this simple by spec ("do not over-engineer a full GPU classifier"):
  // DEGRADED = multiDraw true→false, OR renderer string moved discrete-looking → integrated-looking.
  var degraded = (last.multiDraw === true && md === false) ||
    (/nvidia|amd|radeon/i.test(last.renderer) && /intel|uhd|iris/i.test(gpu));
  if (degraded) {
    // Baseline deliberately NOT overwritten — last-known-good stays meaningful so the warning
    // still fires against the true baseline on later checks (W-GPU-WARN-DEGRADED semantics).
    console.log('§GPU_DEGRADED_WARN was=' + last.renderer + ' multi_draw=' + last.multiDraw +
      ' now=' + gpu + ' multi_draw=' + md);
    var sig = gpu + '|' + md;
    if (storage.getItem('bim_gpu_warned') === sig) {
      console.log('§GPU_DEGRADED_NONAG same degraded signature already warned, toast suppressed sig=' + sig);
      return 'nonag';
    }
    storage.setItem('bim_gpu_warned', sig);
    if (onWarn) onWarn('Rendering fell back to a slower GPU (' + gpu + ') — if this seems wrong, check GPU drivers or reboot.');
    return 'warn';
  }
  // Same or IMPROVED: silently refresh what "good" means (a fixed driver / back on the dGPU must
  // not stay pinned to a stale weaker baseline) and clear the warned flag so a future degrade warns.
  storage.setItem('bim_gpu_lastgood', nowSig);
  storage.removeItem('bim_gpu_warned');
  return 'update';
}
