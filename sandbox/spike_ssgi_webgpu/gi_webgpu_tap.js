// GI-WEBGPU TAP (sandbox spike, opt-in, NOT wired into any shipped file) — injects an import map via
// document.write (runs before the destination document is parsed, so it lands before any module
// script resolves a bare specifier), then once the real app + its DB are ready, dynamically imports
// the vendored r186 WebGPU/SSGI/GTAO/TRAA stack and builds a SECOND, independent scene from the SAME
// building DB (self-fetches it, same proven approach as spike.js's loadDb/buildScene, including the
// far-plane fix), kept in sync with window.APP.camera/controls.target. Defines
// window.__giWebgpuRenderFrame + window.__GI_WEBGPU_CANVAS for a (currently unwired — see report)
// opt-in hook in cinema_maxq.js's _captureFrame(). Does not touch effects_gi_poc.js (Alt-G) or any
// other shipped file. Resolution is intentionally small here (proof stage) — see PROOF_W/PROOF_H.
(function () {
  // NOTE: originally injected an <script type=importmap> via document.write() here so the vendored
  // SSGINode/GTAONode/TRAANode's bare 'three/webgpu'/'three/tsl' specifiers would resolve — that hung
  // page navigation outright (60s puppeteer timeout, real app never loaded). Switched to *.direct.js
  // patched copies (vendor/SSGINode.direct.js etc., see their own header comments) whose only change
  // is those two imports rewritten to direct relative paths — no import map needed at all.
  // Resolution + output are now configurable (were hardcoded 960x540 with no save mechanism) — set
  // window.__GI_TAP_CONFIG = {w,h,port} via an EARLIER evaluateOnNewDocument call before this script
  // runs (see run_dual_gpu_test.js / run_full_overlay_test.js). Falls back to the old proof defaults.
  const CFG = window.__GI_TAP_CONFIG || {};
  const PROOF_W = CFG.w || 960, PROOF_H = CFG.h || 540;
  const SAVE_PORT = CFG.port || null;   // null = no frame-save server (old proof-only behavior)
  function log(s) { console.log('§GI_WEBGPU_TAP ' + s); }
  window.__giWebgpuTapStatus = { phase: 'waiting-app' };
  // Frame-save mechanism (was missing) — reuses spike.js/run_spike.js's own model: POST the PNG blob
  // to a tiny local server the driver already runs (POST /__saveFrame/NNNN), same as the SEQ mode's
  // proven pipeline. No-op (just leaves the canvas in place) when no port is configured.
  async function saveFrame(canvas, idx) {
    if (!SAVE_PORT) return;
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    await fetch('http://127.0.0.1:' + SAVE_PORT + '/__saveFrame/' + String(idx).padStart(4, '0'), { method: 'POST', body: blob });
  }

  async function boot() {
    const t0 = performance.now();
    while (!(window.APP && window.APP.db && window.APP.camera && window.APP.dbQuery)) {
      await new Promise(r => setTimeout(r, 200));
      if (performance.now() - t0 > 120000) { window.__giWebgpuTapStatus = { phase: 'timeout-waiting-app' }; log('TIMEOUT waiting for window.APP.db'); return; }
    }
    const A = window.APP;
    log('APP ready after ' + (performance.now() - t0).toFixed(0) + 'ms; navigator.gpu=' + (!!navigator.gpu));
    window.__giWebgpuTapStatus = { phase: 'app-ready', hasNavigatorGpu: !!navigator.gpu };
    if (!navigator.gpu) { window.__giWebgpuTapStatus = { phase: 'no-navigator-gpu' }; log('BLOCKED no navigator.gpu in this page/launch'); return; }

    let THREE, TSL, ssgi, ao, traa;
    try {
      THREE = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.webgpu.js');
      TSL = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.direct.js');
      ssgi = (await import('/sandbox/spike_ssgi_webgpu/vendor/SSGINode.direct.js')).ssgi;
      ao = (await import('/sandbox/spike_ssgi_webgpu/vendor/GTAONode.direct.js')).ao;
      traa = (await import('/sandbox/spike_ssgi_webgpu/vendor/TRAANode.direct.js')).traa;
    } catch (e) {
      window.__giWebgpuTapStatus = { phase: 'import-failed', error: String(e && e.stack || e) };
      log('IMPORT_FAILED ' + (e && e.stack || e));
      return;
    }
    log('modules imported OK, revision=' + THREE.REVISION);
    window.__giWebgpuTapStatus = { phase: 'modules-ok' };

    // ---- geometry load: mirrors spike.js loadDb/buildScene exactly (self-fetch, proven code) ----
    function blobToGeometry(vBlob, fBlob) {
      const vArr = new Float32Array(vBlob.buffer, vBlob.byteOffset, vBlob.byteLength / 4);
      const fArr = new Uint32Array(fBlob.buffer, fBlob.byteOffset, fBlob.byteLength / 4);
      if (vArr.length < 9 || fArr.length < 3) return null;
      const positions = new Float32Array(vArr.length);
      for (let i = 0; i < vArr.length; i += 3) { positions[i] = vArr[i]; positions[i + 1] = vArr[i + 2]; positions[i + 2] = -vArr[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const vCount = positions.length / 3;
      let idx = fArr;
      if (vCount < 65536) { idx = new Uint16Array(fArr.length); for (let i = 0; i < fArr.length; i++) idx[i] = fArr[i]; }
      else { idx = new Uint32Array(fArr); }
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      return geo;
    }
    async function loadDb() {
      const SQL = await initSqlJs({ locateFile: f => '/viewer/lib/' + f });
      // Parameterized via CFG.dbFile (was hardcoded) — A.activeBuilding is a building NAME parsed
      // from metadata, not the db filename/path, so it can't be used to derive this; the driver must
      // pass the exact file it navigated to via ?db=.
      const dbName = CFG.dbFile || '/buildings/HHS_Office_Federated_silent.db';
      const buf = await (await fetch(dbName)).arrayBuffer();
      const db = new SQL.Database(new Uint8Array(buf));
      log('db ' + dbName + ' ' + (buf.byteLength / 1048576).toFixed(1) + ' MB self-fetched');
      const rows = [];
      const st = db.prepare(`SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline, t.center_x, t.center_y, t.center_z,
          t.rotation_x, t.rotation_y, t.rotation_z, m.storey, m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z
          FROM elements_meta m JOIN element_instances i ON m.guid = i.guid JOIN element_transforms t ON t.guid = m.guid`);
      while (st.step()) rows.push(st.get());
      st.free();
      const hashes = [...new Set(rows.map(r => r[1]).filter(Boolean))];
      const meshCache = {};
      let fetched = 0;
      for (let ci = 0; ci < hashes.length; ci += 200) {
        const chunk = hashes.slice(ci, ci + 200);
        const ph = chunk.map(() => '?').join(',');
        const gs = db.prepare(`SELECT geometry_hash, vertices, faces FROM component_geometries WHERE geometry_hash IN (${ph})`);
        gs.bind(chunk);
        while (gs.step()) { const r = gs.get(); if (r[1] && r[2]) { const g = blobToGeometry(r[1], r[2]); if (g) { meshCache[r[0]] = g; fetched++; } } }
        gs.free();
      }
      const off = new THREE.Vector3();
      for (const r of rows) off.add(new THREE.Vector3(r[4], r[5], r[6]));
      off.divideScalar(rows.length || 1);
      db.close();
      log('elements=' + rows.length + ' hashes=' + hashes.length + ' geometries=' + fetched);
      return { rows, meshCache, modelOffset: off };
    }
    function ifc2three(ix, iy, iz, off) { return { x: ix - off.x, y: iz - off.z, z: -(iy - off.y) }; }
    const _matCache = {};
    function getMaterial(rgba) {
      const key = rgba || '_default';
      if (_matCache[key]) return _matCache[key];
      let r = 0.92, g = 0.90, b = 0.85, a = 1;
      if (rgba && rgba.indexOf(',') !== -1) { const p = rgba.split(',').map(Number); r = p[0]; g = p[1]; b = p[2]; a = p[3]; }
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
      if (a < 0.99) { m.transparent = true; m.opacity = a; }
      _matCache[key] = m;
      return m;
    }
    function buildScene(scene, { rows, meshCache, modelOffset }) {
      const pending = {};
      for (const row of rows) {
        const [guid, hash, rgba, disc, cx, cy, cz, rotX, rotY, rotZ, storey, ifcClass] = row;
        if (!hash || !meshCache[hash]) continue;
        (pending[hash] = pending[hash] || []).push({ guid, hash, rgba, disc, cx, cy, cz, rotX: rotX || 0, rotY: rotY || 0, rotZ: rotZ || 0, storey: storey || '', ifcClass });
      }
      const _pos = new THREE.Vector3(), _euler = new THREE.Euler(), _quat = new THREE.Quaternion(), _scale = new THREE.Vector3(1, 1, 1), _m4 = new THREE.Matrix4();
      const batchBuckets = {};
      const LOW_INSTANCE_BATCH_MAX = 3;
      for (const [hash, elements] of Object.entries(pending)) {
        const geo = meshCache[hash];
        if (elements.length <= LOW_INSTANCE_BATCH_MAX) {
          for (const el of elements) {
            const key = (el.storey || '_') + '|' + (el.disc || '_') + '|' + (el.rgba || '_default');
            (batchBuckets[key] = batchBuckets[key] || []).push({ el, geo });
          }
        } else {
          const iMesh = new THREE.InstancedMesh(geo, getMaterial(elements[0].rgba), elements.length);
          iMesh.frustumCulled = false;
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i]; const p = ifc2three(el.cx, el.cy, el.cz, modelOffset);
            _pos.set(p.x, p.y, p.z); _euler.set(el.rotX, el.rotZ, -el.rotY); _quat.setFromEuler(_euler); _m4.compose(_pos, _quat, _scale);
            iMesh.setMatrixAt(i, _m4);
          }
          iMesh.instanceMatrix.needsUpdate = true;
          scene.add(iMesh);
        }
      }
      for (const [key, items] of Object.entries(batchBuckets)) {
        let totalVerts = 0, totalIdx = 0;
        for (const it of items) { totalVerts += it.geo.attributes.position.count; totalIdx += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
        const rgba = key.split('|')[2];
        const mat = getMaterial(rgba === '_default' ? null : rgba);
        let bm;
        try { bm = new THREE.BatchedMesh(items.length, totalVerts, totalIdx, mat); } catch (e) { continue; }
        bm.frustumCulled = true;
        for (const it of items) {
          let slotId;
          try { const geoId = bm.addGeometry(it.geo); slotId = bm.addInstance(geoId); } catch (e) { continue; }
          const el = it.el; const p = ifc2three(el.cx, el.cy, el.cz, modelOffset);
          _pos.set(p.x, p.y, p.z); _euler.set(el.rotX, el.rotZ, -el.rotY); _quat.setFromEuler(_euler); _m4.compose(_pos, _quat, _scale);
          bm.setMatrixAt(slotId, _m4);
        }
        bm.matrixAutoUpdate = false; bm.updateMatrix();
        scene.add(bm);
      }
    }

    window.__giWebgpuTapStatus = { phase: 'loading-geometry' };
    const data = await loadDb();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fb8d4);
    const camera = new THREE.PerspectiveCamera(60, PROOF_W / PROOF_H, 0.1, 500);
    buildScene(scene, data);
    // far-plane fix (found 2026-09-22, this same thread): guard against an empty/Infinity box
    const box = new THREE.Box3();
    scene.traverse(o => { if (o.isBatchedMesh || o.isInstancedMesh) { o.computeBoundingBox(); if (o.boundingBox) box.union(o.boundingBox); } });
    const size = box.getSize(new THREE.Vector3());
    const finiteFar = Number.isFinite(size.length()) ? size.length() * 2 : 0;
    camera.near = 0.1; camera.far = Math.max(200, finiteFar || 500);
    camera.updateProjectionMatrix();

    // §GI_LIGHT_PARITY (red1-84, 2026-09-22) — STEP 1 of the adoption plan. These lights were the
    // harness's own invention and did NOT match the app, which is why bounce light measured 7-20x
    // weaker on the big buildings than on Duplex: bounce can only bounce what is already lit, and
    // this scene had one sun plus a weak sky fill with NO ambient, while the real viewer has a
    // stronger sun, an ambient term and a tone-mapping exposure. Every value below is copied from
    // viewer/scene.js (ambient :193, sun :197-199, hemi :203, exposure :122) — read from that file,
    // not chosen. The old numbers are kept in this comment so the earlier measurements stay
    // interpretable: sun 0xfff2e0/3.0 at (30,60,20) castShadow=true sb=80, hemi 0xbfd4ff/0x806a50/0.6.
    const ambient = new THREE.AmbientLight(0xffffff, 0.386);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff0dd, 4.4);
    sun.position.set(200, 400, 300);
    sun.castShadow = false;   // scene.js:199 — the app casts no sun shadow; the old ±80m shadow
    // camera could not cover Hospital (101x151x43m) anyway, so it was both wrong and a per-frame cost.
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xb0c4de, 0x8b7355, 0.617));
    // Environment map — the app builds one (scene.js:355-373: a vertex-colour gradient sky through
    // PMREMGenerator) and this scene had none at all, so surfaces had no sky to reflect and the
    // clip read as "without environment". Same gradient, same PMREM roughness, guarded.
    try {
      const envScene = new THREE.Scene();
      const envGeo = new THREE.SphereGeometry(500, 32, 16);
      const posAttr = envGeo.attributes.position;
      const colors = new Float32Array(posAttr.count * 3);
      for (let vi = 0; vi < posAttr.count; vi++) {
        const t2 = (posAttr.getY(vi) / 500) * 0.5 + 0.5;
        colors[vi * 3] = 0.7 - t2 * 0.3; colors[vi * 3 + 1] = 0.65 + t2 * 0.1; colors[vi * 3 + 2] = 0.55 + t2 * 0.35;
      }
      envGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envScene.add(new THREE.AmbientLight(0xffffff, 1));
      scene.userData._envScene = envScene;   // PMREM needs the renderer, which exists below
    } catch (e) { log('ENV_SCENE_BUILD_FAIL ' + e.message); }

    window.__giWebgpuTapStatus = { phase: 'creating-renderer' };
    let renderer;
    try {
      renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: false });
      renderer.setPixelRatio(1);
      renderer.setSize(PROOF_W, PROOF_H);
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      await renderer.init();
    } catch (e) {
      window.__giWebgpuTapStatus = { phase: 'renderer-init-failed', error: String(e && e.stack || e) };
      log('RENDERER_INIT_FAILED ' + (e && e.stack || e));
      return;
    }
    // scene.js:122 — the app renders at exposure 0.45; at the default 1.0 this harness was showing a
    // brighter, flatter image than the film and any look comparison was meaningless.
    renderer.toneMappingExposure = 0.45;
    renderer.outputColorSpace = THREE.SRGBColorSpace;   // scene.js:125
    if (scene.userData._envScene) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(scene.userData._envScene, 0.04).texture;
        scene.background = scene.environment;
        log('ENV_MAP applied (PMREM gradient sky, same as scene.js:373)');
      } catch (e) { log('ENV_MAP_FAIL ' + e.message); }
    }
    const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL(fallback)';
    let adapterInfo = 'n/a';
    try { const a2 = await navigator.gpu.requestAdapter(); adapterInfo = a2 && a2.info ? (a2.info.vendor + '/' + a2.info.architecture) : 'n/a'; } catch (e) {}
    log('backend=' + backend + ' adapter=' + adapterInfo + ' (this is the SECOND context; the app\'s own WebGLRenderer is A.renderer)');
    window.__giWebgpuTapStatus = { phase: 'renderer-ready', backend: backend, adapter: adapterInfo };

    const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
    const pipeline = new Pipeline(renderer);
    const scenePass = TSL.pass(scene, camera);
    const mrtSpec = { output: TSL.output, diffuseColor: TSL.diffuseColor, normal: TSL.packNormalToRGB(TSL.normalView), velocity: TSL.velocity };
    scenePass.setMRT(TSL.mrt(mrtSpec));
    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassDiffuse = scenePass.getTextureNode('diffuseColor');
    const scenePassDepth = scenePass.getTextureNode('depth');
    const scenePassNormal = scenePass.getTextureNode('normal');
    scenePass.getTexture('diffuseColor').type = THREE.UnsignedByteType;
    scenePass.getTexture('normal').type = THREE.UnsignedByteType;
    const sceneNormal = TSL.sample((uv) => TSL.unpackRGBToNormal(scenePassNormal.sample(uv)));
    const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
    giPass.sliceCount.value = 2; giPass.stepCount.value = 8; giPass.useTemporalFiltering = true;
    const aoNode = giPass.getAONode(); const giNode = giPass.getGINode();
    const composite = TSL.vec4(TSL.add(scenePassColor.rgb.mul(aoNode), scenePassDiffuse.rgb.mul(giNode.rgb)), scenePassColor.a);
    const finalNode = traa(composite, scenePassDepth, scenePass.getTextureNode('velocity'), camera);
    pipeline.outputNode = finalNode;
    pipeline.outputColorTransform = true;
    const rt = new THREE.RenderTarget(PROOF_W, PROOF_H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });
    const c2 = document.createElement('canvas'); c2.width = PROOF_W; c2.height = PROOF_H;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(PROOF_W, PROOF_H);
    window.__GI_WEBGPU_CANVAS = c2;

    let frameCount = 0;
    window.__giWebgpuRenderFrame = async function () {
      camera.position.copy(A.camera.position);
      const t = A.controls && A.controls.target ? A.controls.target : A.camera.position;
      camera.lookAt(t.x, t.y, t.z);
      camera.updateMatrixWorld(true);
      pipeline.needsUpdate = true;
      renderer.setRenderTarget(rt);
      pipeline.render();
      renderer.setRenderTarget(null);
      const buf = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, PROOF_W, PROOF_H);
      const f32 = buf instanceof Float32Array ? buf : Float32Array.from(buf);
      for (let y = 0; y < PROOF_H; y++) for (let x = 0; x < PROOF_W; x++) {
        const s = ((PROOF_H - 1 - y) * PROOF_W + x) * 4, d = (y * PROOF_W + x) * 4;
        img.data[d] = Math.max(0, Math.min(255, f32[s] * 255));
        img.data[d + 1] = Math.max(0, Math.min(255, f32[s + 1] * 255));
        img.data[d + 2] = Math.max(0, Math.min(255, f32[s + 2] * 255));
        img.data[d + 3] = 255;
      }
      ctx2.putImageData(img, 0, 0);
      frameCount++;
      window.__giWebgpuFrameCount = frameCount;
    };
    // ══ FULL-BAKE OVERLAY DRIVER (2026-09-22, red1-84-reviewed plan) ═══════════════════════════════
    // Reimplements the RELEVANT slice of cinema_maxq.js's start()/bake-loop/_captureFrame — traced
    // line-by-line from the real file (viewer/cinema_maxq.js), not guessed — calling the SAME real
    // window.APP functions in the SAME order, but drawing onto OUR GI canvas instead of A.renderer's.
    // SCOPE (explicit, per instruction): 2D overlays only — room title captions, path-overview box,
    // sun-compass (rose readout + clock), flythru cues (unconditional in the real code, no flag gate).
    // OUT OF SCOPE this pass: buildup (Time Machine mutates the REAL A.scene's element visibility —
    // our scene is a separate, once-built copy that can never see that, so the model looks fully
    // built for the whole clip — expected/accepted), clash (clash_film.js:329 adds real meshes to
    // A.scene — same reason), reveal/storey-reveal (tie into discipline filtering/tinting, same class
    // as clash/buildup), measure/datum (verified via grep: flythru_datum.js adds NO meshes to
    // A.scene — it is actually pure-2D and could be added later — excluded THIS pass only because it
    // wasn't in the explicit go-ahead list, not because it's architecturally blocked).
    // §OVERLAY_EVIDENCE (red1-84, 2026-09-22) — the overlay calls below were wrapped in EMPTY
    // catches, so a clip could come back with no captions and the log would say nothing. CLAUDE.md's
    // Log Mandate: a silent failure must appear in the log. Each failure is logged ONCE per tag
    // (same one-shot pattern cinema_maxq.js:823 uses for clash labels), and every overlay that
    // actually DRAWS is counted — "did not throw" is not evidence that it fired.
    const _ovErrSeen = {};
    function _ovWarn(tag, e) {
      if (_ovErrSeen[tag]) return; _ovErrSeen[tag] = true;
      log('OVERLAY_ERR ' + tag + ': ' + ((e && e.message) || e));
    }
    const _ovStats = { frames: 0, cues: 0, title: 0, clock: 0, compass: 0, ovpath: 0 };
    window.__giOverlayStats = _ovStats;
    window.__giOverlayErrors = _ovErrSeen;
    let _fb = null;   // per-bake state, set by __giFullBakeSetup, read by __giFullBakeFrame
    window.__giFullBakeSetup = async function (fps) {
      // Real ov, exactly as effects.js:9203 _cpeLoadFromDb builds it — triggered the same way
      // cinema_maxq.js/cli_silent_bake.js do (a throwaway cinemaPathPlan(60) call lazy-loads it).
      try { A.cinemaPathPlan(60); } catch (e) {}
      const staged = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null;
      if (!staged) { log('FULLBAKE_SETUP_FAILED no staged cinema_path override'); return null; }
      const ov = {}; for (const k in staged) ov[k] = staged[k];
      // "All options" scope for THIS pass — see the header comment above for what's excluded and why.
      ov.buildup = false; ov.roomTitle = true; ov.reveal = false; ov.storeyReveal = false;
      ov.clash = false; ov.measure = false; ov.sunCompass = true;
      const total = ov._total;
      const nFrames = Math.max(1, Math.round(total * fps));
      const plan = A.cinemaPathPlan(total, ov);
      // ── one-time setup, mirrors cinema_maxq.js:1543-1638 (buildup/clash/measure blocks omitted —
      // their flags are false above, so the real file's own gates would skip them too) ──
      let titleSegs = null;
      try { titleSegs = A.roomTitleBuildTimeline ? A.roomTitleBuildTimeline(plan, nFrames / fps) : null; }
      catch (e) { log('roomTitleBuildTimeline failed: ' + e.message); }
      let ovPath = null;
      try { ovPath = A.pathOverviewPrepare ? A.pathOverviewPrepare(plan, null, null) : null; }
      catch (e) { log('pathOverviewPrepare failed: ' + e.message); }
      const filmSecFull = nFrames / fps;
      if (A.flythruCuesBuild) { try { A.flythruCuesBuild(plan, filmSecFull); } catch (e) { log('flythruCuesBuild failed: ' + e.message); } }
      A._sunCompassOn = false;
      if (A.sunCompassBuild) { try { A._sunCompassOn = !!A.sunCompassBuild(); } catch (e) { log('sunCompassBuild failed: ' + e.message); } }
      _fb = { plan, nFrames, fps, filmSecFull, titleSegs, ovPath, ovPos: 'tl' };
      log('FULLBAKE_SETUP nFrames=' + nFrames + ' fps=' + fps + ' total=' + total.toFixed(2) + 's ' +
        'titleSegs=' + (titleSegs ? titleSegs.length : 0) + ' ovPath=' + !!ovPath + ' sunCompassOn=' + A._sunCompassOn);
      return { nFrames, fps, total };
    };

    // Mirrors _captureFrame's 2D compositing tail (cinema_maxq.js:783-905), scoped to the overlays
    // enabled above. `srcCanvas` is our GI-rendered frame (window.__GI_WEBGPU_CANVAS after a
    // __giWebgpuRenderFrame() call) — everything below draws ON TOP of a copy of it, same order.
    const _ovCanvas = document.createElement('canvas'); _ovCanvas.width = PROOF_W; _ovCanvas.height = PROOF_H;
    const _ovCtx = _ovCanvas.getContext('2d');
    window.__giFullBakeFrame = async function (i) {
      if (!_fb) throw new Error('__giFullBakeSetup was not called or failed');
      const { plan, nFrames, fps, filmSecFull, titleSegs, ovPath, ovPos } = _fb;
      const tn = nFrames > 1 ? i / (nFrames - 1) : 0;
      const tnFilm = tn;   // no clip in this pass, so _tFilm(tn) === tn exactly as the real file notes
      const pose = plan.poseAt(tn);
      A.camera.position.set(pose.x, pose.y, pose.z);
      A.controls.target.set(pose.tx, pose.ty, pose.tz);
      A.controls.update();
      // per-frame state advance — mirrors cinema_maxq.js:1908-1934 for the enabled overlays only
      if (A.flythruCuesApplyVisual) { try { A._flythruFilmSec = tnFilm * filmSecFull; A.flythruCuesApplyVisual(A._flythruFilmSec); } catch (e) { _ovWarn('cuesApplyVisual', e); } }
      if (A._sunCompassOn && A.sunCompassAt) { try { A.sunCompassAt(null, tnFilm); } catch (e) { _ovWarn('sunCompassAt', e); } }   // null cursor: no buildup, same degrade the real file documents (§SUN_COMPASS_NO_CURSOR)
      // titleInfo — mirrors cinema_maxq.js:2108-2120 (reveal/storeyReveal/cue captions all return
      // null with those features off; kept in the same order as the real file for fidelity)
      let titleInfo = (A.cpeRevealCaptionAt) ? A.cpeRevealCaptionAt(plan, tnFilm) : null;
      if (!titleInfo && A.storeyRevealCaptionAt) titleInfo = A.storeyRevealCaptionAt(plan, tnFilm);
      if (!titleInfo && A.flythruCueCaptionAt) { try { titleInfo = A.flythruCueCaptionAt(tnFilm * filmSecFull); } catch (e) { _ovWarn('cueCaptionAt', e); } }
      if (!titleInfo) titleInfo = (titleSegs && A.roomTitleOpacityAt) ? A.roomTitleOpacityAt(titleSegs, i / fps) : null;
      // ovInfo — mirrors cinema_maxq.js:2125-2130
      let ovInfo = null;
      if (ovPath && A.camera) {
        ovInfo = { ov: ovPath, pos: ovPos, pose: { pos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
          target: (A.controls && A.controls.target) ? { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z } : null } };
      }
      // render our GI frame, then composite the real overlays on top of a copy of it
      await window.__giWebgpuRenderFrame();
      _ovCtx.drawImage(window.__GI_WEBGPU_CANVAS, 0, 0, PROOF_W, PROOF_H);
      const w = PROOF_W, h = PROOF_H;
      if (A.flythruCuesCompositeOntoCanvas) { try { A.flythruCuesCompositeOntoCanvas(_ovCtx, w, h, A._flythruFilmSec || 0); _ovStats.cues++; } catch (e) { _ovWarn('cuesComposite', e); } }
      if (titleInfo && titleInfo.opacity > 0 && A.roomTitleCompositeOntoCanvas) { try { A.roomTitleCompositeOntoCanvas(_ovCtx, w, h, titleInfo.name, titleInfo.opacity); _ovStats.title++; } catch (e) { _ovWarn('roomTitleComposite', e); } }
      let stackY = 0;
      const gapY = Math.round(h * 0.012);
      if (A._sunCompassOn && A.sunClockCompositeOntoCanvas && A.sunCompassInfo) {
        try { const ch = A.sunClockCompositeOntoCanvas(_ovCtx, w, h, A.sunCompassInfo(), 1, 'tr', stackY); if (ch > 0) { stackY += ch + gapY; _ovStats.clock++; } } catch (e) { _ovWarn('sunClockComposite', e); }
      }
      if (A._sunCompassOn && A.sunCompassCompositeOntoCanvas && A.sunCompassInfo) {
        try { const sh = A.sunCompassCompositeOntoCanvas(_ovCtx, w, h, A.sunCompassInfo(), 1, 'tr', stackY); if (sh > 0) { stackY += sh + gapY; _ovStats.compass++; } } catch (e) { _ovWarn('sunCompassComposite', e); }
      }
      if (ovInfo && ovInfo.ov && A.pathOverviewCompositeOntoCanvas) { try { A.pathOverviewCompositeOntoCanvas(_ovCtx, w, h, ovInfo.ov, ovInfo.pose, 1, ovInfo.pos, stackY); _ovStats.ovpath++; } catch (e) { _ovWarn('pathOverviewComposite', e); } }
      _ovStats.frames++;
      await saveFrame(_ovCanvas, i);
      return { i, titleInfo: titleInfo && titleInfo.name, sunCompassOn: A._sunCompassOn };
    };
    window.__GI_FULL_BAKE_CANVAS = _ovCanvas;

    window.__giWebgpuTapStatus = { phase: 'ready', backend: backend, adapter: adapterInfo };
    log('READY — window.__giWebgpuRenderFrame armed, backend=' + backend + ' adapter=' + adapterInfo);
  }
  // don't block document parsing; boot once DOM/app machinery is available
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
