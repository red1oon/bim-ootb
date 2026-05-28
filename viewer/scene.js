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

  // §S283: PWA install prompt capture — must run before any UI
  var _installPrompt = null;
  var _isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    _installPrompt = e;
    console.log('§PWA_INSTALL prompt captured');
  });

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
  A._isWebGPU = _isWebGPU;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(_isMobileRenderer ? 1 : Math.min(window.devicePixelRatio, 2));  // §S271: mobile=1x, desktop=cap 2x
  renderer.setClearColor(0x1a1a2e);
  renderer.shadowMap.enabled = false;
  // §S260: shadow setup deferred entirely to toggleShadow() in tools.js
  // §S260c: ACESFilmic tone mapping — preserves color saturation, adds cinematic contrast.
  // NoToneMapping was flat/grey. ACES gives "crisp vibrant" look like Bonsai/Autodesk.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
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
          var envRT = _pmrem.fromScene(_sky);
          A._envMap = envRT.texture;
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
    console.log('§WEBGL_CONTEXT_LOST — tap banner to reload');
    var banner = document.createElement('div');
    banner.id = 'webgl-lost-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#cc0000;color:#fff;text-align:center;padding:14px;font-size:15px;font-weight:bold;cursor:pointer';
    banner.textContent = '3D view lost (Chrome idle throttle) — tap here to reload';
    banner.onclick = function() { location.reload(); };
    document.body.appendChild(banner);
  });
  canvas.addEventListener('webglcontextrestored', function() {
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
  A._evictOldest = async function(cacheDb) {
    try {
      var tx = cacheDb.transaction('timestamps', 'readonly');
      var store = tx.objectStore('timestamps');
      var allKeys = await new Promise(function(r) {
        var req = store.getAllKeys(); req.onsuccess = function() { r(req.result || []); }; req.onerror = function() { r([]); };
      });
      if (allKeys.length < A._MAX_CACHE_ENTRIES) return;
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
      // Remove oldest until we're under limit
      var toRemove = entries.slice(0, entries.length - A._MAX_CACHE_ENTRIES + 1);
      if (toRemove.length > 0) {
        var tx3 = cacheDb.transaction([A.CACHE_STORE, 'timestamps'], 'readwrite');
        for (var j = 0; j < toRemove.length; j++) {
          tx3.objectStore(A.CACHE_STORE).delete(toRemove[j].key);
          tx3.objectStore('timestamps').delete(toRemove[j].key);
        }
        console.log('[S203] §CACHE_EVICT_LRU removed=' + toRemove.length + ' keys=' + toRemove.map(function(e){return e.key.split('/').pop();}).join(','));
      }
    } catch(e) { /* eviction is best-effort */ }
  };

  // §S260b: Check if URL is in cache (returns buffer or null, no network)
  A._checkCache = async function(url) {
    try {
      const cacheDb = await A.openCacheDB();
      if (!cacheDb) return null;
      const cached = await new Promise((resolve) => {
        const tx = cacheDb.transaction(A.CACHE_STORE, 'readonly');
        const req = tx.objectStore(A.CACHE_STORE).get(url);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      return cached;
    } catch(e) { return null; }
  };

  A.cachedFetch = async function(url) {
    const cacheDb = await A.openCacheDB();
    if (cacheDb) {
      try {
        const cached = await new Promise((resolve, reject) => {
          const tx = cacheDb.transaction(A.CACHE_STORE, 'readonly');
          const req = tx.objectStore(A.CACHE_STORE).get(url);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (cached) {
          console.log(`[S203] §CACHE_HIT ${url.split('/').pop()} size=${(cached.byteLength/1024/1024).toFixed(1)}MB`);
          // Update LRU timestamp on hit
          try { var tx2 = cacheDb.transaction('timestamps', 'readwrite'); tx2.objectStore('timestamps').put(Date.now(), url); } catch(e2) {}
          return cached;
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

    const resp = await fetch(url);
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
        const pct = Math.round((received / contentLength) * 100);
        if (A.status) A.status.textContent = `Downloading ${fileName}... ${pct}% (${(received/1024/1024).toFixed(0)}/${(contentLength/1024/1024).toFixed(0)}MB)`;
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
        await new Promise(function(resolve) {
          var _writeOk = false;
          const tx = cacheDb.transaction([A.CACHE_STORE, 'timestamps'], 'readwrite');
          tx.objectStore('timestamps').put(Date.now(), url);
          const req = tx.objectStore(A.CACHE_STORE).put(buf, url);
          req.onsuccess = function() { _writeOk = true; console.log(`[S203] §CACHE_WRITE_OK url=${url.split('/').pop()} size=${(buf.byteLength/1024/1024).toFixed(1)}MB`); };
          req.onerror = function(e) {
            // §S260b: Quota exceeded — let tx abort so onabort evicts+retries
            console.warn(`[S203] §CACHE_WRITE_ERR url=${url.split('/').pop()} err=${req.error}`);
          };
          tx.oncomplete = function() {
            if (!_writeOk) console.warn('[S203] §CACHE_TX_COMPLETE_BUT_NO_WRITE — data NOT persisted');
            resolve();
          };
          tx.onabort = function() {
            // Evict all entries then retry write
            console.log(`[S203] §CACHE_EVICT clearing all cached DBs for space`);
            var tx2 = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
            tx2.objectStore(A.CACHE_STORE).clear();
            tx2.oncomplete = function() {
              var tx3 = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
              var req3 = tx3.objectStore(A.CACHE_STORE).put(buf, url);
              req3.onsuccess = function() { console.log(`[S203] §CACHE_EVICT_WRITE_OK url=${url.split('/').pop()}`); };
              req3.onerror = function() { console.warn(`[S203] §CACHE_EVICT_WRITE_FAIL — quota too small`); };
              tx3.oncomplete = resolve;
              tx3.onerror = function() { resolve(); };
            };
            tx2.onerror = function() { resolve(); };
          };
        });
      } catch(e) { console.log(`[S203] §CACHE_WRITE_ERR ${e.message}`); }
    }

    if (!cacheDb || A._cacheDisabled) {
      console.log(`[S203] §CACHE_SKIP url=${url.split('/').pop()} reason=${!cacheDb ? 'IDB_unavailable' : 'quota_low'}`);
    }
    return buf;
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
  };
  window.addEventListener('resize', A._onResize);

  // ── §S277d: Movie Maker — canvas recording to MP4 ──
  // Desktop only. MediaRecorder + canvas.captureStream.
  A._recording = false;
  A._mediaRecorder = null;
  A._recordChunks = [];
  // §S280: Record removed from pill — accessible via Help palette (R shortcut)
  console.log('§RECORD_READY MediaRecorder=' + (typeof MediaRecorder !== 'undefined'));
  window.toggleRecord = function() {
    if (A._recording) {
      // Stop recording
      if (A._mediaRecorder && A._mediaRecorder.state !== 'inactive') A._mediaRecorder.stop();
      return;
    }
    // Start recording
    try {
      var stream = A.canvas.captureStream(30);  // 30fps
      var options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm' };
        }
      }
      A._recordChunks = [];
      A._mediaRecorder = new MediaRecorder(stream, options);
      A._mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) A._recordChunks.push(e.data); };
      A._mediaRecorder.onstop = function() {
        A._recording = false;
        if (_recBtn) { _recBtn.style.background = ''; _recBtn.style.color = ''; _recBtn.classList.remove('active'); }
        var blob = new Blob(A._recordChunks, { type: options.mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bim-ootb-' + new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19) + '.webm';
        a.click();
        URL.revokeObjectURL(url);
        console.log('§RECORD_STOP chunks=' + A._recordChunks.length + ' size=' + (blob.size / 1024 / 1024).toFixed(1) + 'MB');
        A._recordChunks = [];
      };
      A._mediaRecorder.start(100);  // collect data every 100ms
      A._recording = true;
      if (_recBtn) { _recBtn.style.background = '#ff2222'; _recBtn.style.color = '#fff'; _recBtn.classList.add('active'); }
      console.log('§RECORD_START mime=' + options.mimeType + ' fps=30');
    } catch(e) {
      console.warn('§RECORD_FAIL ' + e.message);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // S251: Key Sequence Engine + Command Palette + Panel Focus
  // Implementing S251_keyboard_modes.md — Witness: W-KBD
  // ══════════════════════════════════════════════════════════════

  // §1 — Sequence engine: buffer + debounce for multi-key shortcuts (SC, SU, etc.)
  var _seq = '';
  var _seqTimer = null;
  var _SEQ_MS = 600;

  var _shortcuts = {
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
    'l':  function() { if (typeof window.toggleFlyAround === 'function') window.toggleFlyAround(); },
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
      if (A._clashMatrixDiv) { A._clashMatrixDiv.remove(); A._clashMatrixDiv = null; return; }
      console.log('§CLASH_KEY_C loadClashRules=' + !!A._loadClashRules);
      if (A._loadClashRules) A._loadClashRules(function(r) {
        A._currentClashRules = r;
        A._showClashMatrix(r, document.body);
        // Register matrix for Tab/arrow navigation after DOM is created
        setTimeout(function() {
          if (A._clashMatrixDiv && typeof window.makeListKeyNav === 'function') {
            var matNav = window.makeListKeyNav(
              function() { return Array.from(A._clashMatrixDiv.querySelectorAll('[data-pair]')); },
              function() {},
              function(idx) {
                var cells = Array.from(A._clashMatrixDiv.querySelectorAll('[data-pair]'));
                if (cells[idx]) cells[idx].click();
              }
            );
            var matClose = function() {
              if (A._clashRevealActive && A._dismissClashes) A._dismissClashes();
              if (A._clashMatrixDiv) { A._clashMatrixDiv.remove(); A._clashMatrixDiv = null; }
              if (A._clashModeActive && A._exitClashMode) A._exitClashMode();
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
    'r':  function() { if (typeof toggleRecord === 'function') toggleRecord(); },
    ',':  function() { if (typeof toggleDocPill === 'function') toggleDocPill(); }, // §S281: comma = Doc mode (was 'e')
    '=':  function() { // §S281: settings panel toggle
      var btn = document.getElementById('pill-settings');
      if (btn) btn.click();
      else if (A.status) A.status.textContent = 'UNDER CONSTRUCTION';
    },
    '/':  function() { if (A.quickShare) A.quickShare(); },
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
      ' prompt=' + !!_installPrompt);
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
      '<div style="padding:8px 14px;border-top:1px solid #333;text-align:center">' +
      '<span id="cmd-report" style="color:#ff8a65;font-size:12px;cursor:pointer;font-weight:600">' +
      '\uD83D\uDEDF Report Bug</span>' +
      '<span style="color:#555;margin:0 8px">|</span>' +
      '<a id="cmd-docs" href="https://red1oon.github.io/BIMCompiler/MOBILE_DEPLOY/" target="_blank" ' +
      'style="color:#4fc3f7;font-size:12px;text-decoration:none;font-weight:600">' +
      '\uD83D\uDCDA Documentation</a></div>';
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
          console.log('§PWA_BADGE click=download (blue)');
          _startOfflineDownload();
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
    caches.open(cacheName).then(function(cache) {
      var done = 0;
      var total = assets.length;
      // Cache assets sequentially in small batches to avoid flooding
      var queue = assets.slice();
      function batch() {
        var chunk = queue.splice(0, 6);
        if (chunk.length === 0) {
          // All JS/assets cached — now cache building DB
          _ensureBuildingCached(ov);
          return;
        }
        Promise.all(chunk.map(function(url) {
          return cache.add(url).then(function() {
            done++;
            ov.setProgress(done / total * 80);
            ov.setText('Cached ' + done + '/' + total + '  ' + url.split('/').pop());
          }).catch(function(err) {
            done++;
            console.warn('§PWA_CACHE skip ' + url, err.message);
          });
        })).then(batch);
      }
      batch();
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
    if (_installPrompt) {
      ov.setText('Confirm the install prompt to add to home screen.');
      _installPrompt.prompt();
      _installPrompt.userChoice.then(function(r) {
        console.log('§PWA_INSTALL choice=' + r.outcome);
        _installPrompt = null;
        if (r.outcome === 'accepted') {
          window._pwaAccepted = true;  // §S283: badge turns green on next Help open
          ov.setText('Installed! Find it on your home screen.');
        } else {
          ov.setText('Cancelled. Files are still cached for offline use.');
        }
        setTimeout(function() { ov.close(); }, 3000);
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
    console.log('§PWA_INSTALL no_prompt available. consumed=' + !_installPrompt + ' iOS=false');
    ov.setText('Files cached for offline use. Reload page to retry install.');
    setTimeout(function() { ov.close(); }, 4000);
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
    // §S282: Alt+Z = X-Ray (Blender convention) — restored
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (typeof toggleXray === 'function') toggleXray(); console.log('§KBD_ROUTE Alt+Z → xray'); return; }
    if (e.key === 'F1') { e.preventDefault(); console.log('§KBD_ROUTE F1 → help'); showCommandPalette(); return; }
    if (e.key === 'F11') { e.preventDefault(); console.log('§KBD_ROUTE F11 → fullscreen'); A.toggleFullscreen(); return; }

    var noMod = !e.ctrlKey && !e.altKey && !e.metaKey;
    var notInput = e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA';

    // §S280: Backspace = undo, \ = redo (kernel_ops)
    if (noMod && notInput && e.key === 'Backspace') {
      e.preventDefault();
      if (window._doSceneUndo) window._doSceneUndo();
      return;
    }
    if (noMod && notInput && e.key === '\\') {
      e.preventDefault();
      if (window._doSceneRedo) window._doSceneRedo();
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

  window._doSceneUndo = function() {
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
