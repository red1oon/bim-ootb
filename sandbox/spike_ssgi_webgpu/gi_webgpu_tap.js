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
  const PROOF_W = 960, PROOF_H = 540;
  function log(s) { console.log('§GI_WEBGPU_TAP ' + s); }
  window.__giWebgpuTapStatus = { phase: 'waiting-app' };

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
      // Proof-stage: hardcoded to match this test's own ?db= query param (A.activeBuilding is a
      // building NAME parsed from metadata, not the db filename/path — using it here fetched the
      // wrong, nonexistent file; see run_dual_gpu_test.js for the real URL this must match).
      const dbName = '/buildings/HHS_Office_Federated_silent.db';
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

    const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
    sun.position.set(30, 60, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sb = 80; sun.shadow.camera.left = -sb; sun.shadow.camera.right = sb; sun.shadow.camera.top = sb; sun.shadow.camera.bottom = -sb; sun.shadow.camera.far = 300;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x806a50, 0.6));

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
    window.__giWebgpuTapStatus = { phase: 'ready', backend: backend, adapter: adapterInfo };
    log('READY — window.__giWebgpuRenderFrame armed, backend=' + backend + ' adapter=' + adapterInfo);
  }
  // don't block document parsing; boot once DOM/app machinery is available
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
