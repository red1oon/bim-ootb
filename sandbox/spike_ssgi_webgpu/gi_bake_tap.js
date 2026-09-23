// GI BAKE TAP (red1-84, 2026-09-22) — supplies the bake's 3D pixels from the WebGPU SSGI/GTAO
// pipeline, rendering the APP'S OWN SCENE, while cinema_maxq drives everything else exactly as in a
// normal bake: build-up, clash, storey reveal, escape route, load path, all 2D overlays.
//
// Installed via cli_silent_bake's --tap. It defines window.__giCaptureFrame, which §GI_CAPTURE_HOOK
// in cinema_maxq.js awaits in place of ctx.drawImage(A.renderer.domElement, ...). No hook, no effect.
//
// ONE three.js INSTANCE ONLY. A private copy of three.js is what made the app's lights invisible to
// this renderer and every frame black (measured: own lights 479,280 lit pixels vs the app's 0,
// because `light instanceof THREE.Light` is false across module instances). So this uses
// window.THREE, which the r186 root serves, and the TSL/SSGI modules are imported from URLs that
// resolve to that same module.
(function () {
  const S = { phase: 'idle', frames: 0, failures: 0 };
  window.__giBakeTap = S;
  function log(s) { console.log('§GI_BAKE_TAP ' + s); }
  const EXPOSURE = 1.8;   // MEASURED, not chosen: at the app's own 0.45 this composite renders at
  // mean 12.6/255 against the app's own 60.3 for the same pose; 1.8 gives 66.9. See §GI_EXPOSURE.
  let ready = null;       // promise of the built pipeline
  async function build(w, h) {
    const A = window.APP;
    if (!(window.THREE && window.THREE.REVISION === '186' && window.THREE.WebGPURenderer)) {
      throw new Error('app three.js is r' + (window.THREE && window.THREE.REVISION) + ', need r186 with WebGPURenderer');
    }
    const THREE = window.THREE;
    // *.appbound.js: identical to the *.direct.js copies except their imports point at the very URL
    // the APP loaded (/viewer/lib/three.webgpu.min.js). The .direct copies import vendor/r186/…,
    // which is a SECOND module instance — the same fault that made the app's lights invisible, and
    // here it made the TSL pipeline return a black frame while a plain render of the same scene
    // through the same renderer came back correctly lit (0.134). Nodes must share the app's instance.
    const TSL = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.appbound.js');
    const { ssgi } = await import('/sandbox/spike_ssgi_webgpu/vendor/SSGINode.appbound.js');
    const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // SKY: the previous attempt kept color.a but never made the CLEAR transparent, so every pixel
    // still came back solid and painted over the app's sky (measured: sky band 94.8 with the app's
    // own render, 45.6 with this paste on top). Clear to alpha 0 — anything this pipeline does not
    // draw stays empty and the app's own sky, drawn underneath, shows through untouched.
    renderer.setClearColor(0x000000, 0);
    if (renderer.setClearAlpha) renderer.setClearAlpha(0);
    await renderer.init();
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
    // HIGH preset (SSGINode's own table: high = sliceCount 3, stepCount 16, with temporal filtering).
    // The medium 2x8 left visible grain because the film invalidates the temporal history twice over
    // — the camera moves AND the model changes as it builds. A bake is offline, so it can pay for it.
    gi.sliceCount.value = (window.__GI_SLICES || 3); gi.stepCount.value = (window.__GI_STEPS || 16);
    gi.useTemporalFiltering = true;
    // COVERAGE FROM DEPTH, not from alpha or brightness. Four earlier attempts failed for one
    // reason, found by the Alt+S work: SSGINode wraps its own quad render in
    // renderer.setClearColor(0xffffff, 1) (vendor/SSGINode.js:391) and PassNode.updateBefore never
    // sets a clear colour of its own (three.webgpu.js:42967-43043), so the scene pass inherits it —
    // the frame comes back cleared WHITE at alpha 1. There was never an empty signal to read.
    // Depth clears to 1.0 whatever the clear colour is (reversedDepthBuffer is off by default), so
    // "depth still at far" is the one honest answer to "did anything draw here".
    const rgbOut = TSL.add(color.rgb.mul(gi.getAONode()), diffuse.rgb.mul(gi.getGINode().rgb));
    let coverage = null;
    try {
      coverage = TSL.float(1).sub(TSL.step(0.999999, depth.r));
      pipeline.outputNode = TSL.vec4(rgbOut, coverage);
      log('COVERAGE from depth (step 0.999999)');
    } catch (eCov) {
      pipeline.outputNode = TSL.vec4(rgbOut, color.a);
      log('COVERAGE_FALLBACK depth expression failed (' + eCov.message + ') — using colour alpha, the sky will be covered');
    }
    pipeline.outputColorTransform = true;
    const rt = new THREE.RenderTarget(w, h, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(w, h);
    // warm-up: SSGI/TRAA have no history on the first render and come out flat (measured: frame 0
    // stdev 18.1 against 44.1 for its neighbours before a warm-up was added to the earlier clip).
    for (let k = 0; k < 8; k++) {
      renderer.setRenderTarget(rt);
      if (pipeline.renderAsync) await pipeline.renderAsync(); else pipeline.render();
      renderer.setRenderTarget(null);
    }
    log('READY ' + w + 'x' + h + ' exposure=' + EXPOSURE + ' backend=' + (renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL-fallback'));
    S.phase = 'ready';
    try { const ad = await navigator.gpu.requestAdapter(); S.adapter = ad && ad.info ? (ad.info.vendor + '/' + ad.info.architecture) : 'unknown'; } catch (e) { S.adapter = 'err'; }
    log('ADAPTER ' + S.adapter);
    return { THREE, renderer, pipeline, rt, c2, ctx2, img, w, h, cam, gi };
  }
  window.__giCaptureFrame = async function (ctx, w, h) {
    if (!ready) { S.phase = 'building'; ready = build(w, h).catch(e => { S.phase = 'build-failed'; S.error = String(e && e.message || e); log('BUILD_FAIL ' + e.message); throw e; }); }
    const G = await ready;
    if (G.w !== w || G.h !== h) throw new Error('capture size changed ' + G.w + 'x' + G.h + ' -> ' + w + 'x' + h);
    // ONE-SHOT BISECT on the first frame: is it the GI pipeline, or does this renderer draw nothing
    // at all inside a live bake? (Standalone, the identical code rendered at mean 0.13.)
    if (S.frames === 0 && !S.bisected) {
      S.bisected = true;
      const T = G.THREE;
      const mean = (arr) => { let t = 0, n = 0; for (let i = 0; i < arr.length; i += 4 * 97) { t += (arr[i] + arr[i + 1] + arr[i + 2]) / 3; n++; } return +(t / Math.max(1, n)).toFixed(5); };
      G.renderer.setRenderTarget(G.rt); G.renderer.render(window.APP.scene, G.cam); G.renderer.setRenderTarget(null);
      const p1 = await G.renderer.readRenderTargetPixelsAsync(G.rt, 0, 0, w, h);
      const plainMean = mean(p1 instanceof Float32Array ? p1 : Float32Array.from(p1));
      const box = new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshBasicMaterial({ color: 0xff2222 }));
      const fwd = new T.Vector3(); G.cam.getWorldDirection(fwd);
      box.position.copy(G.cam.position).add(fwd.multiplyScalar(4)); box.updateMatrixWorld(true);
      window.APP.scene.add(box);
      G.renderer.setRenderTarget(G.rt); G.renderer.render(window.APP.scene, G.cam); G.renderer.setRenderTarget(null);
      const p2 = await G.renderer.readRenderTargetPixelsAsync(G.rt, 0, 0, w, h);
      const boxMean = mean(p2 instanceof Float32Array ? p2 : Float32Array.from(p2));
      window.APP.scene.remove(box);
      log('BISECT plainSceneMean=' + plainMean + ' unlitBoxMean=' + boxMean +
          ' appRendererType=' + (window.APP.renderer && window.APP.renderer.constructor && window.APP.renderer.constructor.name) +
          ' sameTHREE=' + (T === window.THREE));
    }
    G.pipeline.needsUpdate = true;
    // renderAsync, not render: the bake calls this hook from an async loop, and the plain-render
    // bisect proved the renderer itself draws the scene correctly here (mean 0.135) while the
    // pipeline returned 0 — a sync pipeline.render() hands back before its work is submitted.
    // ACCUMULATION: the bounce is sampled, so a single render carries speckle. A bake is offline,
    // so render the SAME frame N times and average — the camera and the model are frozen between
    // these passes, which is exactly the condition the per-frame temporal filter never gets.
    const N = window.__GI_ACCUM || 3;
    let f = null, alpha0 = null;
    // COVERAGE MASK, taken with temporal filtering OFF. Taking it from the first accumulation pass
    // was not enough: the GI node keeps history BETWEEN captured frames too, so by mid-film even
    // pass 0 arrives with alpha already blended toward 1 and the sky gets painted over again
    // (measured: opening frames fine at 93.5, mid-film still covered at 45.6). With temporal off
    // there is no history to inherit, so this pass reports exactly where geometry was drawn.
    {
      const gi = G.gi;
      const hadTemporal = gi ? gi.useTemporalFiltering : null;
      if (gi) gi.useTemporalFiltering = false;
      G.pipeline.needsUpdate = true;
      G.renderer.setRenderTarget(G.rt);
      if (G.pipeline.renderAsync) await G.pipeline.renderAsync(); else G.pipeline.render();
      G.renderer.setRenderTarget(null);
      const mb = await G.renderer.readRenderTargetPixelsAsync(G.rt, 0, 0, w, h);
      const mf = mb instanceof Float32Array ? mb : Float32Array.from(mb);
      alpha0 = new Float32Array(mf.length >> 2);
      for (let i = 0; i < alpha0.length; i++) alpha0[i] = mf[i * 4 + 3];
      if (gi && hadTemporal !== null) gi.useTemporalFiltering = hadTemporal;
      G.pipeline.needsUpdate = true;
    }
    for (let pass = 0; pass < N; pass++) {
      G.pipeline.needsUpdate = true;
      G.renderer.setRenderTarget(G.rt);
      if (G.pipeline.renderAsync) await G.pipeline.renderAsync(); else G.pipeline.render();
      G.renderer.setRenderTarget(null);
      const b = await G.renderer.readRenderTargetPixelsAsync(G.rt, 0, 0, w, h);
      const fb = b instanceof Float32Array ? b : Float32Array.from(b);
      if (!f) f = (N === 1) ? Float32Array.from(fb) : Float32Array.from(fb);
      else for (let i = 0; i < f.length; i++) f[i] += fb[i];
    }
    if (N > 1) for (let i = 0; i < f.length; i++) f[i] /= N;
    // ALPHA COMES FROM THE FIRST PASS ONLY. With one pass the sky came through (measured 93.5
    // against the app's own 94.8); with three it went back to 45.6 — covered. The GI node's own
    // temporal filtering blends each render into the last, and the alpha channel rides along with
    // it, creeping toward 1 and making the empty sky opaque again. Averaging colour is the point;
    // averaging coverage is not — the first pass already knows exactly where geometry was drawn.
    if (alpha0) for (let i = 3; i < f.length; i += 4) f[i] = alpha0[i >> 2];
    const d = G.img.data;
    // ORIENTATION (2026-09-23, red1 spotted it): this loop flipped rows, which is right when the
    // readback is bottom-up — but in THIS path it is not, and the result went out upside down.
    // Measured at the same frame, same pose: app renderer top=74.1/bottom=43.8, this pipeline
    // top=75.7/bottom=93.8 — inverted against the renderer it stands in for. No flip.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, o = (y * w + x) * 4;
      d[o] = Math.max(0, Math.min(255, f[s] * 255));
      d[o + 1] = Math.max(0, Math.min(255, f[s + 1] * 255));
      d[o + 2] = Math.max(0, Math.min(255, f[s + 2] * 255));
      // LEAVE THE SKY ALONE (red1, 2026-09-23: "why not simply not disturb the original sky? It has
      // good Sun path appearance, everything quite perfect"). Forcing every pixel opaque painted this
      // frame OVER the app's own render, including its Preetham sky — which this renderer cannot draw
      // at all (the sky is the scene's one old-style ShaderMaterial; WebGPU compiles no GLSL, so it
      // came out black). Keeping the real alpha means we replace only where there IS geometry, and
      // the app's sky, sun position and flare show through untouched, drawn by the renderer that
      // already draws them correctly.
      // COVERAGE, decided from the PICTURE, not from the alpha channel. Alpha proved unusable: the
      // GI node blends history between captured frames, so alpha creeps toward 1 and the sky gets
      // painted over (opening frames 93.5, mid-film 45.6), and a temporal-off mask pass made it
      // worse (0.0). What IS reliable: this renderer cannot draw the sky at all — it is the scene's
      // one old-style shader material — so sky pixels come back BLACK. Near-black therefore means
      // "this pipeline drew nothing here", and the app's own frame underneath is kept. A genuinely
      // black surface keeps the app's version of itself, which is the safe way to be wrong.
      d[o + 3] = f[s + 3] > 0.5 ? 255 : 0;   // hard mask: depth says drawn, or it does not
    }
    G.ctx2.putImageData(G.img, 0, 0);
    // UNDERLAY FIRST. The mask was right all along — frame 1 measured clear=56.3%, frame 2 clear=7.5%,
    // no partial band — but the hook REPLACES cinema_maxq's own `ctx.drawImage(A.renderer.domElement)`,
    // so wherever this layer is transparent there was simply nothing underneath: a fresh capture
    // canvas, i.e. black. The app's frame has to be laid down first, exactly as the original line did,
    // and the bounce goes over it. That is the sky, the ground and anything this pipeline cannot draw.
    try { ctx.drawImage(window.APP.renderer.domElement, 0, 0, w, h); }
    catch (eU) { if (!S.underErr) { S.underErr = 1; log('UNDERLAY_FAIL ' + eU.message); } }
    ctx.drawImage(G.c2, 0, 0, w, h);
    S.frames++;
    // The first bake attempt produced perfect overlays over a BLACK 3D frame, so measure the GI
    // output itself here rather than inferring from the finished video: mean luminance, the camera
    // this pipeline is actually pointed at, and whether that is still the app's live camera object
    // (a stale camera reference would render a fixed, empty view and look exactly like this).
    if (S.frames <= 2) {
      let a0 = 0, a1 = 0, mid = 0, n = 0, dmin = 9, dmax = -9;
      for (let i = 0; i < f.length; i += 4 * 53) {
        const a = f[i + 3]; n++;
        if (a < 0.02) a0++; else if (a > 0.98) a1++; else mid++;
        if (a < dmin) dmin = a; if (a > dmax) dmax = a;
      }
      log('MASK_STATS clear=' + (100 * a0 / n).toFixed(1) + '% solid=' + (100 * a1 / n).toFixed(1) +
          '% partial=' + (100 * mid / n).toFixed(1) + '% alphaRange=' + dmin.toFixed(3) + '..' + dmax.toFixed(3) +
          ' — clear% should be roughly the sky area; 0% means the coverage signal is still not empty anywhere');
    }
    if (S.frames <= 3 || S.frames % 100 === 0) {
      let sum = 0, n = 0;
      for (let i = 0; i < f.length; i += 4 * 97) { sum += (f[i] + f[i + 1] + f[i + 2]) / 3; n++; }
      const A2 = window.APP;
      S.lastMean = +(sum / Math.max(1, n)).toFixed(5);
      log('FRAME ' + S.frames + ' giMean=' + S.lastMean +
          ' camIsAppCam=' + (G.cam === A2.camera) +
          ' camPos=' + [A2.camera.position.x, A2.camera.position.y, A2.camera.position.z].map(v => v.toFixed(1)).join(',') +
          ' sceneChildren=' + A2.scene.children.length +
          ' overrideMaterial=' + !!A2.scene.overrideMaterial +
          ' adapter=' + (S.adapter || '?'));
    }
  };
  log('INSTALLED — cinema_maxq §GI_CAPTURE_HOOK will call window.__giCaptureFrame');
})();
