// STEP 3 PROBE (red1-84, 2026-09-22) — can the r186 WebGPU/SSGI pipeline render the APP'S OWN
// SCENE (window.APP.scene), instead of a rebuilt copy?
//
// WHY IT MATTERS: every "the clip can't show X" limit so far — build-up, clash markers, storey
// reveal, the fixture point lights along the path, the emissive light quads — is the same defect:
// the harness builds its own copy of the building and the copy lacks whatever the app added. If
// the r186 renderer can draw A.scene directly, all of it comes for free and nothing needs
// mirroring. red1's own correction (the film DOES have lights; they just never bounce) is what
// makes this the decisive question.
//
// THE RISK THIS PROBES: A.scene's objects were built by the app's r185 THREE; this renderer is
// r186 — two separate module instances. three.js renderers duck-type (.isMesh/.isBatchedMesh/
// .isMeshStandardMaterial), so it MAY work. This script finds out and reports, it does not assume.
// It renders ONE frame and reads it back. Nothing is saved, no shipped file is touched.
(function () {
  const R = { phase: 'init' };
  window.__giAppSceneProbe = R;
  function log(s) { console.log('§GI_APPSCENE ' + s); }
  async function boot() {
    const t0 = performance.now();
    while (!(window.APP && window.APP.scene && window.APP.camera && window.APP.renderer)) {
      await new Promise(r => setTimeout(r, 200));
      if (performance.now() - t0 > 120000) { R.phase = 'timeout-waiting-app'; log('TIMEOUT'); return; }
    }
    const A = window.APP;
    if (!navigator.gpu) { R.phase = 'no-navigator-gpu'; log('BLOCKED no navigator.gpu'); return; }
    // WAIT FOR GEOMETRY. First run of this probe reported meshes:2 batched:0 instanced:0 and a
    // black frame: APP.scene/camera/renderer exist at page load, so boot() ran long BEFORE the
    // driver had streamed the building in. An empty scene renders black and proves nothing. Hold
    // until the driver says go (it sets __giProbeGo after streaming AND posing the camera).
    R.phase = 'waiting-for-go';
    const tGo = performance.now();
    while (!window.__giProbeGo) {
      await new Promise(r => setTimeout(r, 250));
      if (performance.now() - tGo > 300000) { R.phase = 'timeout-waiting-go'; log('TIMEOUT waiting for __giProbeGo'); return; }
    }
    R.phase = 'go';
    let THREE, TSL, ssgi;
    try {
      // Use the APP'S OWN module instance when it is r186 — see the driver's note. A private import
      // here is what made the app's lights invisible to this renderer.
      if (window.THREE && window.THREE.REVISION === '186' && window.THREE.WebGPURenderer) { THREE = window.THREE; R.sharedInstance = true; }
      else { THREE = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.webgpu.js'); R.sharedInstance = false; }
      TSL = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.direct.js');
      ssgi = (await import('/sandbox/spike_ssgi_webgpu/vendor/SSGINode.direct.js')).ssgi;
    } catch (e) { R.phase = 'import-failed'; R.error = String(e && e.stack || e); log('IMPORT_FAIL ' + e.message); return; }
    // What the app's scene actually holds — recorded BEFORE any render, so a failure below still
    // leaves evidence of what we were pointing at.
    let meshes = 0, batched = 0, instanced = 0, lights = 0, emissive = 0, sprites = 0;
    A.scene.traverse(o => {
      if (o.isBatchedMesh) batched++; else if (o.isInstancedMesh) instanced++; else if (o.isMesh) meshes++;
      if (o.isLight) lights++;
      if (o.isSprite) sprites++;
      const m = o.material;
      if (m && !Array.isArray(m) && m.emissive && (m.emissiveIntensity === undefined || m.emissiveIntensity > 0)) {
        const e = m.emissive; if (e.r + e.g + e.b > 0.01) emissive++;
      }
    });
    R.appScene = { meshes, batched, instanced, lights, sprites, emissiveMaterials: emissive,
                   threeAppRevision: (window.THREE && window.THREE.REVISION) || '?', threeProbeRevision: THREE.REVISION };
    log('APP SCENE ' + JSON.stringify(R.appScene));
    const W = 960, H = 540;
    let renderer;
    try {
      renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: false });
      renderer.setPixelRatio(1); renderer.setSize(W, H);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.45;
      await renderer.init();
    } catch (e) { R.phase = 'renderer-init-failed'; R.error = String(e && e.stack || e); log('RENDERER_FAIL ' + e.message); return; }
    R.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL(fallback)';
    // A camera THIS renderer owns, matching the app's — a cross-instance camera is the most likely
    // thing to be rejected, and it is also the easiest to avoid.
    // Both sides are the SAME three.js version now, so use the app's OWN camera rather than a copy —
    // that removes camera set-up as a variable. (The copy was needed only while versions differed.)
    const cam = A.camera;
    cam.updateMatrixWorld(true);
    // Diagnose a black frame before blaming the pipeline: where is the camera, where is the model,
    // and how much of the scene is actually visible?
    try {
      const bb = new THREE.Box3();
      let vis = 0, hidden = 0;
      A.scene.traverse(o => { if (o.isMesh || o.isBatchedMesh || o.isInstancedMesh) { (o.visible ? vis++ : hidden++); if (o.visible) { o.computeBoundingBox && o.computeBoundingBox(); if (o.boundingBox) bb.union(o.boundingBox); } } });
      const c = bb.isEmpty() ? null : bb.getCenter(new THREE.Vector3());
      R.framing = { visibleObjects: vis, hiddenObjects: hidden,
        camPos: [cam.position.x, cam.position.y, cam.position.z].map(v => +v.toFixed(1)),
        camFar: cam.far, camNear: cam.near, camLayersMask: cam.layers.mask,
        sceneBoxEmpty: bb.isEmpty(), sceneCenter: c ? [c.x, c.y, c.z].map(v => +v.toFixed(1)) : null,
        distCamToCenter: c ? +cam.position.distanceTo(c).toFixed(1) : null };
      log('FRAMING ' + JSON.stringify(R.framing));
    } catch (e) { log('FRAMING_FAIL ' + e.message); }
    // The app's control screenshot at this exact pose shows the building lit and legible, so the
    // pose is right and the black frame is in THIS render path. Leading suspect: every material
    // carries an envMap that the APP'S WebGL renderer generated (scene.js PMREM), plus
    // scene.environment/background pointing at the same WebGL render target — textures a second,
    // independent WebGPU renderer cannot sample. Swap them out for the probe render and put them
    // straight back, so the app is untouched either way.
    const _savedEnv = A.scene.environment, _savedBg = A.scene.background;
    const _savedMatEnv = [];
    if (window.__giProbeDropEnv !== false) {
      A.scene.environment = null; A.scene.background = null;
      A.scene.traverse(o => {
        const m = o.material; if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm && mm.envMap) { _savedMatEnv.push([mm, mm.envMap]); mm.envMap = null; mm.needsUpdate = true; } });
      });
      R.envDropped = _savedMatEnv.length;
      log('ENV_DROPPED materialsWithEnvMap=' + _savedMatEnv.length);
    }
    const _restoreEnv = () => { A.scene.environment = _savedEnv; A.scene.background = _savedBg;
      _savedMatEnv.forEach(([mm, tex]) => { mm.envMap = tex; mm.needsUpdate = true; }); };
    const rt = new THREE.RenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    // TEST 1 — plain render of the app's scene, no GI. If this fails, cross-version is dead and
    // the r186 library swap is required; if it works, the scene graph is portable.
    try {
      renderer.setRenderTarget(rt); renderer.render(A.scene, cam); renderer.setRenderTarget(null);
      const buf = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      const f = buf instanceof Float32Array ? buf : Float32Array.from(buf);
      let sum = 0, nz = 0; for (let i = 0; i < f.length; i += 4) { const l = f[i] + f[i + 1] + f[i + 2]; sum += l; if (l > 0.01) nz++; }
      R.plainRender = { ok: true, meanLum: +(sum / (f.length / 4) / 3).toFixed(5), litFrac: +(nz / (f.length / 4)).toFixed(4) };
      log('PLAIN_RENDER ' + JSON.stringify(R.plainRender));
    } catch (e) { R.plainRender = { ok: false, error: String(e && e.message || e) }; log('PLAIN_RENDER_FAIL ' + e.message); }
    // TEST 2 — the same scene through the SSGI pipeline. Reports the GI buffer's own statistics,
    // which is the number that has to beat Hospital's 0.007-0.022 from the copied-scene runs.
    try {
      const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
      const pipeline = new Pipeline(renderer);
      const scenePass = TSL.pass(A.scene, cam);
      scenePass.setMRT(TSL.mrt({ output: TSL.output, diffuseColor: TSL.diffuseColor, normal: TSL.packNormalToRGB(TSL.normalView) }));
      const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth');
      const nrm = TSL.sample((uv) => TSL.unpackRGBToNormal(scenePass.getTextureNode('normal').sample(uv)));
      const gi = ssgi(color, depth, nrm, cam);
      gi.sliceCount.value = 2; gi.stepCount.value = 8; gi.useTemporalFiltering = true;
      pipeline.outputNode = TSL.vec4(gi.getGINode().rgb, 1);
      pipeline.outputColorTransform = false;
      for (let k = 0; k < 8; k++) { renderer.setRenderTarget(rt); pipeline.render(); renderer.setRenderTarget(null); }
      const buf2 = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      const g = buf2 instanceof Float32Array ? buf2 : Float32Array.from(buf2);
      let s2 = 0, lit = 0, nan = 0;
      for (let i = 0; i < g.length; i += 4) { const l = (g[i] + g[i + 1] + g[i + 2]) / 3; if (Number.isNaN(l)) { nan++; continue; } s2 += l; if (l > 0.01) lit++; }
      R.giRender = { ok: true, meanGILum: +(s2 / (g.length / 4)).toFixed(5), fracLit: +(lit / (g.length / 4)).toFixed(4), nan,
                     radius: gi.radius.value, giIntensity: gi.giIntensity.value };
      log('GI_RENDER ' + JSON.stringify(R.giRender));
    } catch (e) { R.giRender = { ok: false, error: String(e && e.stack || e).slice(0, 400) }; log('GI_RENDER_FAIL ' + e.message); }
    try { _restoreEnv(); } catch (e) { log('ENV_RESTORE_FAIL ' + e.message); }
    // BISECT — the env-map theory is dead (29 materials stripped, byte-identical result), so stop
    // theorising about the building and ask a simpler question: can THIS renderer draw ANYTHING
    // into THIS render target? A plain box with a self-lit material, right in front of the app's
    // own camera. If the box shows and the building doesn't, the fault is in the building's
    // materials/geometry; if even the box is black, it is this render/readback path.
    try {
      const probeBox = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
      probeBox.position.copy(cam.position).add(fwd.multiplyScalar(4));
      probeBox.updateMatrixWorld(true);
      A.scene.add(probeBox);
      renderer.setRenderTarget(rt); renderer.render(A.scene, cam); renderer.setRenderTarget(null);
      const bb2 = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      const fb = bb2 instanceof Float32Array ? bb2 : Float32Array.from(bb2);
      let red = 0, lum = 0;
      for (let i = 0; i < fb.length; i += 4) { lum += (fb[i] + fb[i + 1] + fb[i + 2]) / 3; if (fb[i] > 0.2 && fb[i + 1] < 0.2) red++; }
      R.boxTest = { redPixels: red, meanLum: +(lum / (fb.length / 4)).toFixed(5) };
      log('BOX_TEST ' + JSON.stringify(R.boxTest));
      A.scene.remove(probeBox);
      // SECOND HALF OF THE BISECT. The red box proves the renderer draws and the readback works —
      // but it used MeshBasicMaterial, which needs NO lights. The building uses MeshStandardMaterial,
      // which does. So: the same box again, this time in the lit material, plus the renderer's own
      // draw-call count for a building-only render. Lit box black => lights are not reaching node
      // materials in this renderer. Lit box visible + drawCalls 0 => the building is never submitted.
      const litBox = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }));
      litBox.position.copy(probeBox.position); litBox.updateMatrixWorld(true);
      A.scene.add(litBox);
      renderer.setRenderTarget(rt); renderer.render(A.scene, cam); renderer.setRenderTarget(null);
      const lb = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      const lf = lb instanceof Float32Array ? lb : Float32Array.from(lb);
      let bright = 0, lum2 = 0;
      for (let i = 0; i < lf.length; i += 4) { const l = (lf[i] + lf[i + 1] + lf[i + 2]) / 3; lum2 += l; if (l > 0.05) bright++; }
      R.litBoxTest = { brightPixels: bright, meanLum: +(lum2 / (lf.length / 4)).toFixed(5) };
      log('LITBOX_TEST ' + JSON.stringify(R.litBoxTest));
      // THIRD BISECT. Unlit box: bright. Lit box: BLACK. Building: 1377 draw calls, 805k triangles
      // submitted — so geometry reaches the GPU and only light-dependent shading comes out black.
      // Remaining question: is it the APP'S light objects (built by the app, possibly bound to its
      // own renderer's state) or this renderer doing no lighting at all? Add lights created HERE,
      // by this module, next to the same lit box. Lights up => the app's light objects are the
      // problem. Still black => this renderer is not lighting this scene, whoever owns the lights.
      const ownAmb = new THREE.AmbientLight(0xffffff, 0.8);
      const ownDir = new THREE.DirectionalLight(0xffffff, 3.0);
      ownDir.position.copy(cam.position).add(new THREE.Vector3(5, 10, 5));
      A.scene.add(ownAmb); A.scene.add(ownDir); A.scene.add(litBox);
      renderer.setRenderTarget(rt); renderer.render(A.scene, cam); renderer.setRenderTarget(null);
      const ob = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      const of = ob instanceof Float32Array ? ob : Float32Array.from(ob);
      let ob2 = 0, olum = 0;
      for (let i = 0; i < of.length; i += 4) { const l = (of[i] + of[i + 1] + of[i + 2]) / 3; olum += l; if (l > 0.05) ob2++; }
      R.ownLightTest = { brightPixels: ob2, meanLum: +(olum / (of.length / 4)).toFixed(5) };
      log('OWNLIGHT_TEST ' + JSON.stringify(R.ownLightTest));
      A.scene.remove(ownAmb); A.scene.remove(ownDir);
      // and what do the app's own light objects look like from here?
      const li = [];
      A.scene.traverse(o => { if (o.isLight) li.push({ type: o.type, intensity: o.intensity, visible: o.visible, layers: o.layers.mask, isFromThisModule: o instanceof THREE.Light }); });
      R.appLights = li;
      log('APP_LIGHTS ' + JSON.stringify(li));
      A.scene.remove(litBox);
      // draw-call accounting for the building alone
      if (renderer.info && renderer.info.render) {
        try { renderer.info.reset && renderer.info.reset(); } catch (e) {}
        renderer.setRenderTarget(rt); renderer.render(A.scene, cam); renderer.setRenderTarget(null);
        const ri = renderer.info.render || {};
        R.drawInfo = { drawCalls: ri.drawCalls, triangles: ri.triangles, frame: ri.frame };
        log('DRAW_INFO ' + JSON.stringify(R.drawInfo));
      }
      // what ARE the building's materials?
      const matTypes = {};
      A.scene.traverse(o => { const m = o.material; if (!m) return; (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm) matTypes[mm.type] = (matTypes[mm.type] || 0) + 1; }); });
      R.materialTypes = matTypes;
      log('MATERIAL_TYPES ' + JSON.stringify(matTypes));
      // and what do the building's own culling volumes look like? a NaN sphere culls silently.
      let nanSphere = 0, okSphere = 0, sample = null;
      A.scene.traverse(o => {
        if (!(o.isBatchedMesh || o.isInstancedMesh || o.isMesh)) return;
        const g = o.geometry; if (!g) return;
        if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) {} }
        const bs = g.boundingSphere;
        if (!bs || !Number.isFinite(bs.radius) || !Number.isFinite(bs.center.x)) nanSphere++;
        else { okSphere++; if (!sample) sample = { r: +bs.radius.toFixed(1), c: [bs.center.x, bs.center.y, bs.center.z].map(v => +v.toFixed(1)), type: o.type, frustumCulled: o.frustumCulled, visible: o.visible }; }
      });
      R.culling = { nanOrMissingSphere: nanSphere, finiteSphere: okSphere, sample };
      log('CULLING ' + JSON.stringify(R.culling));
    } catch (e) { R.boxTest = { error: String(e && e.message || e) }; log('BOX_TEST_FAIL ' + e.message); }
    try { _restoreEnv(); } catch (e) { log('ENV_RESTORE_FAIL ' + e.message); }
    R.phase = 'done';
    log('DONE ' + JSON.stringify({ plain: R.plainRender && R.plainRender.ok, gi: R.giRender && R.giRender.ok }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
