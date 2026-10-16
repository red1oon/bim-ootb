// REAL-SCENE GI CLIP (red1-84, 2026-09-22) — the new lighting drawing the APP'S OWN scene.
// Everything the copied-scene harness could never show — the fixture lights along the path, the
// sprites/quads, whatever the app has put in the scene — is simply present, because this renders
// A.scene itself. One three.js instance only (window.THREE): a private copy is what made the app's
// lights invisible and every frame black (measured: own lights 479,280 lit pixels, app's lights 0).
(function () {
  const R = { phase: 'init' };
  window.__giClip = R;
  function log(s) { console.log('§GI_CLIP ' + s); }
  async function boot() {
    const t0 = performance.now();
    while (!(window.APP && window.APP.scene && window.APP.camera)) {
      await new Promise(r => setTimeout(r, 200));
      if (performance.now() - t0 > 120000) { R.phase = 'timeout-app'; return; }
    }
    const A = window.APP;
    R.phase = 'waiting-go';
    while (!window.__giClipGo) await new Promise(r => setTimeout(r, 250));
    const CFG = window.__GI_CLIP_CFG || {};
    const W = CFG.w || 1920, H = CFG.h || 1080, PORT = CFG.port;
    if (!(window.THREE && window.THREE.REVISION === '186' && window.THREE.WebGPURenderer)) {
      R.phase = 'app-not-r186'; R.appRevision = window.THREE && window.THREE.REVISION; log('ABORT app is not r186'); return;
    }
    const THREE = window.THREE;
    let TSL, ssgi, ao, traa;
    try {
      TSL = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.direct.js');
      ssgi = (await import('/sandbox/spike_ssgi_webgpu/vendor/SSGINode.direct.js')).ssgi;
    } catch (e) { R.phase = 'import-failed'; R.error = String(e && e.stack || e); log('IMPORT_FAIL ' + e.message); return; }
    let renderer;
    try {
      renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: false });
      renderer.setPixelRatio(1); renderer.setSize(W, H);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      // EXPOSURE (2026-09-22): first 75-frame clip came back at mean 12-15/255 — far darker than the
      // app's own view of the same pose. The app applies exposure 0.45 to a scene lit for its own
      // pipeline; this pipeline's composite (color*AO + albedo*GI) already loses the direct-light
      // headroom, so 0.45 lands it in the dark. Settable per run so the right value is MEASURED,
      // not assumed: window.__GI_CLIP_CFG.exposure.
      renderer.toneMappingExposure = (CFG.exposure != null) ? CFG.exposure : 0.45;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      await renderer.init();
    } catch (e) { R.phase = 'renderer-failed'; R.error = String(e && e.stack || e); log('RENDERER_FAIL ' + e.message); return; }
    R.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL(fallback)';
    const cam = A.camera;
    const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
    const pipeline = new Pipeline(renderer);
    const scenePass = TSL.pass(A.scene, cam);
    scenePass.setMRT(TSL.mrt({ output: TSL.output, diffuseColor: TSL.diffuseColor, normal: TSL.packNormalToRGB(TSL.normalView) }));
    const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth');
    scenePass.getTexture('diffuseColor').type = THREE.UnsignedByteType;
    scenePass.getTexture('normal').type = THREE.UnsignedByteType;
    const diffuse = scenePass.getTextureNode('diffuseColor');
    const nrm = TSL.sample((uv) => TSL.unpackRGBToNormal(scenePass.getTextureNode('normal').sample(uv)));
    const gi = ssgi(color, depth, nrm, cam);
    gi.sliceCount.value = 2; gi.stepCount.value = 8; gi.useTemporalFiltering = true;
    const aoNode = gi.getAONode(), giNode = gi.getGINode();
    // same composite the proven clip used: direct light shadowed by AO, plus bounced light on albedo
    // mode=composite (default): direct light shadowed by AO + bounced light on albedo.
    // mode=direct: the scene pass alone, GI off — the control for "is the composite what darkened it".
    pipeline.outputNode = (CFG.mode === 'direct')
      ? TSL.vec4(color.rgb, color.a)
      : TSL.vec4(TSL.add(color.rgb.mul(aoNode), diffuse.rgb.mul(giNode.rgb)), color.a);
    pipeline.outputColorTransform = true;
    const rt = new THREE.RenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(W, H);
    window.__GI_CLIP_CANVAS = c2;
    const stats = { frames: 0, giMeanSum: 0 };
    R.stats = stats;
    window.__giClipFrame = async function (i, pose, save) {
      if (pose) { A.camera.position.set(pose.x, pose.y, pose.z); A.controls.target.set(pose.tx, pose.ty, pose.tz); A.controls.update(); }
      cam.updateMatrixWorld(true);
      pipeline.needsUpdate = true;
      renderer.setRenderTarget(rt); pipeline.render(); renderer.setRenderTarget(null);
      const buf = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      const f = buf instanceof Float32Array ? buf : Float32Array.from(buf);
      let sum = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
        img.data[d] = Math.max(0, Math.min(255, f[s] * 255));
        img.data[d + 1] = Math.max(0, Math.min(255, f[s + 1] * 255));
        img.data[d + 2] = Math.max(0, Math.min(255, f[s + 2] * 255));
        img.data[d + 3] = 255;
        if ((x & 31) === 0) sum += (f[s] + f[s + 1] + f[s + 2]) / 3;
      }
      ctx2.putImageData(img, 0, 0);
      stats.frames++;
      if (save && PORT) {
        const blob = await new Promise(res => c2.toBlob(res, 'image/png'));
        await fetch('/__saveFrame/' + String(i).padStart(4, '0'), { method: 'POST', body: blob });
      }
      return { i, meanSampled: +(sum / ((W / 32) * H)).toFixed(5) };
    };
    // PRESENT TEST — the bake's capture does a SYNCHRONOUS ctx.drawImage(A.renderer.domElement).
    // To substitute GI frames there, the GI picture must already be ON a canvas at that instant;
    // an async pixel readback cannot be spliced into a synchronous call without lagging a frame.
    // §133 records headless Dawn failing the canvas swapchain import — but that was measured on a
    // separate context, so it is re-tested here rather than assumed.
    try {
      const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
      pc.style.cssText = 'position:fixed;left:-99999px;top:0';
      document.body.appendChild(pc);
      const pr = new THREE.WebGPURenderer({ canvas: pc, antialias: false, forceWebGL: false });
      pr.setPixelRatio(1); pr.setSize(W, H);
      pr.toneMapping = THREE.ACESFilmicToneMapping; pr.toneMappingExposure = (CFG.exposure != null) ? CFG.exposure : 1.8;
      await pr.init();
      pr.render(A.scene, cam);
      await pr.renderAsync ? await pr.renderAsync(A.scene, cam) : null;
      const t2 = document.createElement('canvas'); t2.width = 64; t2.height = 36;
      const tc = t2.getContext('2d'); tc.drawImage(pc, 0, 0, 64, 36);
      const d = tc.getImageData(0, 0, 64, 36).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      R.presentTest = { ok: true, meanOnCanvas: +(sum / (d.length / 4)).toFixed(2), backend: pr.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL' };
      log('PRESENT_TEST ' + JSON.stringify(R.presentTest));
      pr.dispose && pr.dispose(); pc.remove();
    } catch (e) { R.presentTest = { ok: false, error: String(e && e.message || e) }; log('PRESENT_TEST_FAIL ' + e.message); }
    R.phase = 'ready';
    log('READY ' + W + 'x' + H + ' backend=' + R.backend + ' sharedInstance=true');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
