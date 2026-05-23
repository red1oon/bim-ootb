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

  // §S271: Mobile — disable antialias (4x MSAA fill cost), cap DPR at 1
  var _isMobileRenderer = (navigator.maxTouchPoints > 0 && window.screen.width < 1024);
  // §S276 Phase 2: WebGPURenderer with compatibility mode — auto WebGPU or WebGL2 fallback.
  // Falls back to WebGLRenderer if WebGPURenderer not available (loader failed).
  var _RendererClass = THREE.WebGPURenderer || THREE.WebGLRenderer;
  var _isWebGPU = (_RendererClass === THREE.WebGPURenderer);
  const renderer = new _RendererClass({
    canvas,
    antialias: !_isMobileRenderer,
    preserveDrawingBuffer: true,
    forceWebGL: false  // §S276: try WebGPU first, auto-fallback to WebGL2
  });
  // §S276: WebGPURenderer requires async init before first render
  if (_isWebGPU && renderer.init) {
    await renderer.init();
    console.log('§S276_RENDERER WebGPURenderer init complete backend=' + (renderer.backend ? renderer.backend.constructor.name : 'unknown'));
  } else {
    console.log('§S276_RENDERER WebGLRenderer (no WebGPU)');
  }
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
  A.scene = scene;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 50000);
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

  // §S260c: Procedural environment map — gives all materials subtle reflections.
  // Uses vertex-colored sphere (no shader hacking) for r160 compatibility.
  try {
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envScene = new THREE.Scene();
    var envGeo = new THREE.SphereGeometry(500, 32, 16);
    // Paint vertices: brown at bottom → blue at top (outdoor IBL gradient)
    var posAttr = envGeo.attributes.position;
    var colors = new Float32Array(posAttr.count * 3);
    for (var vi = 0; vi < posAttr.count; vi++) {
      var ny = posAttr.getY(vi) / 500; // -1 (bottom) to +1 (top)
      var t = ny * 0.5 + 0.5; // 0 (bottom) to 1 (top)
      // Ground brown → horizon warm → sky blue
      colors[vi * 3]     = 0.7 - t * 0.3;  // R: brown→blue
      colors[vi * 3 + 1] = 0.65 + t * 0.1; // G: warm→cool
      colors[vi * 3 + 2] = 0.55 + t * 0.35; // B: tan→sky
    }
    envGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var envMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    // Add a dim light so PMREMGenerator produces usable irradiance
    envScene.add(new THREE.AmbientLight(0xffffff, 1));
    var envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    A._envMap = envRT.texture;
    pmrem.dispose();
    envGeo.dispose(); envMat.dispose();
    console.log('§ENV_MAP vertex-color gradient sky — applied to scene.environment');
  } catch(e) {
    console.warn('§ENV_MAP_FAIL ' + e.message);
  }

  // Ground plane — positioned after DB load to sit below the lowest building
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50000, 50000),
    new THREE.MeshLambertMaterial({ color: 0x5C4033, side: THREE.DoubleSide })  // §S260e: earth brown — not too bright for shadows, not too dark
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.visible = false;
  scene.add(ground);
  A.ground = ground;

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
      var b = document.getElementById('section-btn'); if (b) b.click();
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
                      // Fly camera to frame the bounding box
                      var mid = new THREE.Vector3(
                        (minV.x + maxV.x) / 2, (minV.y + maxV.y) / 2, (minV.z + maxV.z) / 2
                      );
                      var span = Math.max(maxV.x - minV.x, maxV.y - minV.y, maxV.z - minV.z, 2);
                      var camDir = A.camera.position.clone().sub(A.controls.target).normalize();
                      var dist = span * 1.5;
                      var targetPos = mid.clone().add(camDir.multiplyScalar(dist));
                      // Animate (20 frames)
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
                    if (rows[idx]) rows[idx].click();
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
                // BUG-5 fix: delay focus to allow DOM layout before offsetWidth check
                setTimeout(function() { _focusPanel('clashlist'); }, 50);
              }
            }, 300);
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
    '-':  function() { if (typeof window.toggleAllPanels === 'function') window.toggleAllPanels(); },
    '+':  function() { if (typeof window.toggleAllPanels === 'function') window.toggleAllPanels(); },
    '=':  function() { if (typeof window.toggleAllPanels === 'function') window.toggleAllPanels(); }
  };

  function _dispatchSeq(seq) {
    if (_shortcuts[seq]) {
      _shortcuts[seq]();
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
  // S265: inline SVG icons for command palette (16x16, stroke=currentColor)
  var _ic = function(d) { return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var _paletteEntries = [
    { seq: 'M',  name: 'Measure',        icon: _ic('<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>') },
    { seq: 'F',  name: 'Find / Navigate', icon: _ic('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>'), children: [
      { name: 'Search by name/class', icon: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>' },
      { name: 'Filter by storey/type', icon: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>' },
      { name: 'Voice search (mic)', icon: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>' },
      { name: 'Navigate to element', icon: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>' }
    ] },
    { seq: 'X',  name: 'Section Cut',     icon: _ic('<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>'), children: [
      { name: 'Y axis (vertical)', icon: '<path d="M12 2v20"/><path d="m8 6 4-4 4 4"/>' },
      { name: 'X axis (lateral)', icon: '<path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>' },
      { name: 'Z axis (depth)', icon: '<circle cx="12" cy="12" r="1"/><path d="M12 2v4"/><path d="M12 18v4"/>' },
      { name: 'Slider 0\u2013100%', icon: '<path d="M2 12h20"/><circle cx="12" cy="12" r="2"/>' },
      { name: 'Bookmarks', icon: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>' }
    ] },
    { seq: 'C',  name: 'Clash Matrix',    icon: _ic('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'), children: [
      { name: 'Discipline pair grid', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/>' },
      { name: 'Tolerance 1\u2013100mm', icon: '<path d="M2 12h20"/><circle cx="12" cy="12" r="2"/>' },
      { name: 'Status: Review/Resolve/Accept', icon: '<circle cx="12" cy="12" r="4"/>' },
      { name: 'HTML Report + CSV export', icon: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>' }
    ] },
    { seq: 'P',  name: 'Palette',         icon: _ic('<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>'), children: [
      { name: 'Ambience 0\u2013100', icon: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/>' },
      { name: 'Sun 0\u20135', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>' },
      { name: 'Exposure 0.1\u20133', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 4h.01"/><path d="M20 12h.01"/><path d="M12 20h.01"/><path d="M4 12h.01"/><path d="M17.66 6.34h.01"/><path d="M17.66 17.66h.01"/><path d="M6.34 17.66h.01"/><path d="M6.34 6.34h.01"/>' },
      { name: 'Ambient 0\u20132', icon: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>' },
      { name: 'Hemisphere 0\u20132', icon: '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/>' }
    ] },
    { seq: '2',  name: '2D Grid',         icon: _ic('<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>') },
    { seq: 'L',  name: 'Fly Tour',        icon: _ic('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>') },
    { seq: 'S',  name: 'Screenshot',      icon: _ic('<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>') },
    { seq: '4',  name: '4D / 5D',         icon: _ic('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>') },
    { seq: 'Alt+Z', name: 'X-Ray',       icon: _ic('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/>') },
    { seq: 'I',  name: 'Issues',          icon: _ic('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'), children: [
      { name: 'Snag photo + annotation', icon: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>' },
      { name: 'Fly to clash deep-link', icon: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>' },
      { name: 'Export Excel', icon: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>' }
    ] },
    { seq: 'N',  name: 'Night',           icon: _ic('<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>') },
    { seq: 'H',  name: 'Shadow',          icon: _ic('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>') },
    { seq: 'B',  name: 'Background',      icon: _ic('<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z"/>') },
    { seq: 'F11', name: 'Fullscreen',     icon: _ic('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>') },
    { seq: 'T',  name: 'Time Machine',    icon: _ic('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), children: [
      { name: 'Gantt timeline', icon: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h4"/>' },
      { name: 'Play / Pause sequence', icon: '<polygon points="6 3 20 12 6 21 6 3"/>' },
      { name: 'Phase slider', icon: '<path d="M2 12h20"/><circle cx="12" cy="12" r="2"/>' },
      { name: 'Share ?tm=play link', icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>' }
    ] },
    { seq: '',   name: 'Share',           icon: _ic('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>'), action: function() { if (A.quickShare) A.quickShare(); } },
    { seq: '',   name: 'Home',            icon: _ic('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'), action: function() { location.href='../index.html'; } },
    { seq: 'F1', name: 'Help',            icon: _ic('<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>') }
  ];

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

    var html = '<div style="padding:6px 14px;color:#888;font-size:10px;border-bottom:1px solid #222;text-align:center">' +
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

    var searchInput = document.getElementById('cmd-search');
    var listEl = document.getElementById('cmd-list');
    var cursor = 0;

    function renderList(filter) {
      var f = (filter || '').toLowerCase();
      var matches = _paletteEntries.filter(function(e) {
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
            ch.innerHTML = _ic(c.icon) + '<span>' + c.name + '</span>';
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
  window._panels = _panels;

  // ── Keyboard handler ──────────────────────────────────────────
  // ORIGINAL shortcuts preserved. Sequence engine + panel focus added on top.
  window.addEventListener('keydown', function(e) {
    if (window._isMobile) return; // §5 mobile guard

    // Command palette open? Let it handle its own keys
    if (document.getElementById('cmd-palette')) { console.log('§KBD_ROUTE palette active, pass-through key=' + e.key); return; }

    // Always-on modifier shortcuts (unchanged from original)
    if (e.altKey && e.key === 'z') { e.preventDefault(); console.log('§KBD_ROUTE alt+z → xray'); A.toggleXray(); return; }
    if (e.key === 'F1') { e.preventDefault(); console.log('§KBD_ROUTE F1 → help'); showCommandPalette(); return; }
    if (e.key === 'F11') { e.preventDefault(); console.log('§KBD_ROUTE F11 → fullscreen'); A.toggleFullscreen(); return; }

    var noMod = !e.ctrlKey && !e.altKey && !e.metaKey;
    var notInput = e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA';

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
      // Typeahead within focused panel (single printable char, no modifier)
      if (noMod && notInput && e.key.length === 1 && e.key !== '?' && _focusedPanel.nav.onTypeahead) {
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

    // Esc with no panel focused — no-op
    if (e.key === 'Escape') { console.log('§KBD_ROUTE esc no panel → no-op'); return; }

    // Key sequence engine
    clearTimeout(_seqTimer);
    var prevSeq = _seq;
    _seq += e.key.toLowerCase();

    var hasExact = !!_shortcuts[_seq];
    var hasLonger = _isPrefix(_seq);
    console.log('§KBD_SEQ_ENGINE input=' + e.key + ' prevSeq="' + prevSeq + '" seq="' + _seq + '" exact=' + hasExact + ' prefix=' + hasLonger);

    if (hasExact && !hasLonger) {
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
}
