// GI BAKE TAP v2 (red1-84, 2026-09-23) — the film path rebuilt on the shape the Alt+S work proved.
//
// WHY v1 HAD TO GO. v1 re-rendered the whole scene with its own renderer and pasted the result over
// the frame. That silently dropped everything the APP draws that this renderer does not: red1 found
// four in one viewing — the window lights (they are bloom, a post pass), the stack-freeze blackout,
// the discipline reveal, and the sun shadows. The app's own logic ran correctly in every case —
// marker counts in my film and in the r185 baseline are identical (§GLOW_LENS_QUAD 68/68,
// §PHOTO_GLOW_SPRITE_GATE 615/615, §CPE_REVEAL_LENS_QUAD_OFF 42/42, §LOADPATH_HOLD 3/3) — the
// pixels simply never reached the picture.
//
// v2 starts FROM the app's finished frame: that frame is the colour input, and this pass only
// modulates it with ambient occlusion and bounced light. Shadows, bloom, blackout, reveal, sky and
// anything else the app draws survive by construction, because they are already in the picture.
(function () {
  const S = { phase: 'idle', frames: 0 };
  window.__giBakeTap = S;
  function log(s) { console.log('§GI_BAKE_TAP ' + s); }
  let ready = null;
  async function build(w, h) {
    const A = window.APP, THREE = window.THREE;
    if (!(THREE && THREE.REVISION === '186' && THREE.WebGPURenderer)) throw new Error('app three.js is r' + (THREE && THREE.REVISION) + ', need r186');
    const TSL = await import('/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.appbound.js');
    const { ssgi } = await import('/sandbox/spike_ssgi_webgpu/vendor/SSGINode.appbound.js');
    const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h);
    // No tone mapping, no exposure: the colour going in is the app's FINISHED frame, already
    // tone-mapped at the app's own exposure. Sampling decodes sRGB to linear, the output node
    // re-encodes with sRGBTransferOETF, so an untouched pixel comes back exactly where it started.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    if (renderer.setClearAlpha) renderer.setClearAlpha(0);
    await renderer.init();
    const cam = A.camera;
    const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
    const pipeline = new Pipeline(renderer);
    const colorCanvas = document.createElement('canvas'); colorCanvas.width = w; colorCanvas.height = h;
    const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: false });
    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.flipY = false; colorTex.colorSpace = THREE.SRGBColorSpace; colorTex.generateMipmaps = false;
    colorTex.minFilter = THREE.LinearFilter; colorTex.magFilter = THREE.LinearFilter;
    colorTex.wrapS = colorTex.wrapT = THREE.ClampToEdgeWrapping;
    const flipSign = TSL.uniform(1), flipOff = TSL.uniform(0);
    const colorTexNode = TSL.texture(colorTex);
    const colorNode = TSL.sample((uv) => colorTexNode.sample(TSL.vec2(uv.x, uv.y.mul(flipSign).add(flipOff))));
    // Geometry pass: ONE unlit material for the whole scene — RGB is the packed view normal, and
    // depth comes from the pass. This is what removed the 127-second compile on the still path.
    const geoMat = new THREE.NodeMaterial();
    geoMat.name = 'GI_BAKE_GEOM'; geoMat.lights = false; geoMat.fog = false;
    geoMat.forceSinglePass = true; geoMat.depthWrite = true; geoMat.depthTest = true;
    geoMat.colorNode = TSL.vec4(TSL.packNormalToRGB(TSL.normalViewGeometry), 1);
    const scenePass = TSL.pass(A.scene, cam);
    const depth = scenePass.getTextureNode('depth');
    const nrm = TSL.sample((uv) => TSL.unpackRGBToNormal(scenePass.getTextureNode('output').sample(uv)));
    // Coverage from DEPTH. The colour alpha out of this pipeline is not a coverage signal: SSGINode
    // wraps its own quad render in setClearColor(0xffffff, 1) (vendor/SSGINode.js:391) and PassNode
    // never sets a clear colour of its own, so the frame comes back cleared white at alpha 1.
    const maskNode = depth.r.lessThan(0.999999).select(TSL.float(1), TSL.float(0));
    const gi = ssgi(colorNode, depth, nrm, cam);
    gi.sliceCount.value = (window.__GI_SLICES || 3); gi.stepCount.value = (window.__GI_STEPS || 16);
    gi.useTemporalFiltering = true;
    const C = colorNode.sample(TSL.uv());
    pipeline.outputColorTransform = false;
    pipeline.outputNode = TSL.vec4(TSL.sRGBTransferOETF(C.rgb.mul(gi.getAONode()).add(C.rgb.mul(gi.getGINode().rgb))), maskNode);
    const rt = new THREE.RenderTarget(w, h, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(w, h);
    const G = { THREE, TSL, renderer, pipeline, rt, c2, ctx2, img, w, h, cam, geoMat, colorCanvas, colorCtx, colorTex,
                flipTex: false, flipOut: false, setTexFlip: (f) => { flipSign.value = f ? -1 : 1; flipOff.value = f ? 1 : 0; G.flipTex = !!f; } };
    log('READY ' + w + 'x' + h + ' geometry-pass, colour from the app frame, no tone mapping');
    S.phase = 'ready';
    return G;
  }
  // one pipeline render with the geometry override in force; always restored
  async function renderGeom(G) {
    const s = window.APP.scene, prev = s.overrideMaterial;
    s.overrideMaterial = G.geoMat;
    try {
      G.pipeline.needsUpdate = true;
      G.renderer.setRenderTarget(G.rt);
      if (G.pipeline.renderAsync) await G.pipeline.renderAsync(); else G.pipeline.render();
      G.renderer.setRenderTarget(null);
      const b = await G.renderer.readRenderTargetPixelsAsync(G.rt, 0, 0, G.w, G.h);
      return b instanceof Float32Array ? b : Float32Array.from(b);
    } finally { s.overrideMaterial = prev; }
  }
  window.__giCaptureFrame = async function (ctx, w, h) {
    if (!ready) { S.phase = 'building'; ready = build(w, h).catch(e => { S.phase = 'build-failed'; log('BUILD_FAIL ' + (e && e.stack || e)); throw e; }); }
    const G = await ready;
    if (G.w !== w || G.h !== h) throw new Error('capture size changed');
    // 1. the app's finished frame — the underlay AND the colour this pass modulates
    G.colorCtx.drawImage(window.APP.renderer.domElement, 0, 0, w, h);
    G.colorTex.needsUpdate = true;
    // 2. bounce
    const f = await renderGeom(G);
    // 3. orientation, decided once by matching this pass against the app's own frame
    if (!S.oriented) {
      S.oriented = true;
      try {
        const SW = 96, SH = 54, sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
        const scx = sc.getContext('2d'); scx.drawImage(G.colorCanvas, 0, 0, SW, SH);
        const app = scx.getImageData(0, 0, SW, SH).data;
        let same = 0, flip = 0, n = 0;
        for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
          const x = Math.floor((i + 0.5) * w / SW), y = Math.floor((j + 0.5) * h / SH), k = (y * w + x) * 4;
          if (f[k + 3] < 0.5) continue;
          const g = (f[k] + f[k + 1] + f[k + 2]) / 3 * 255;
          same += Math.abs(g - (app[(j * SW + i) * 4] + app[(j * SW + i) * 4 + 1] + app[(j * SW + i) * 4 + 2]) / 3);
          const jf = SH - 1 - j;
          flip += Math.abs(g - (app[(jf * SW + i) * 4] + app[(jf * SW + i) * 4 + 1] + app[(jf * SW + i) * 4 + 2]) / 3);
          n++;
        }
        G.flipOut = n > 50 && flip < same;
        log('ORIENT same=' + (same / Math.max(1, n)).toFixed(1) + ' flipped=' + (flip / Math.max(1, n)).toFixed(1) + ' samples=' + n + ' -> flipOut=' + G.flipOut);
      } catch (e) { log('ORIENT_FAIL ' + e.message); }
    }
    // 4. composite: the app's frame first, the bounce layer over it where geometry was drawn
    const d = G.img.data;
    let clear = 0, tot = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sY = G.flipOut ? (h - 1 - y) : y, s = (sY * w + x) * 4, o = (y * w + x) * 4;
      d[o] = Math.max(0, Math.min(255, f[s] * 255));
      d[o + 1] = Math.max(0, Math.min(255, f[s + 1] * 255));
      d[o + 2] = Math.max(0, Math.min(255, f[s + 2] * 255));
      d[o + 3] = f[s + 3] > 0.5 ? 255 : 0;
      if ((x & 31) === 0) { tot++; if (d[o + 3] === 0) clear++; }
    }
    G.ctx2.putImageData(G.img, 0, 0);
    ctx.drawImage(window.APP.renderer.domElement, 0, 0, w, h);
    ctx.drawImage(G.c2, 0, 0, w, h);
    S.frames++;
    if (S.frames <= 2 || S.frames % 150 === 0) log('FRAME ' + S.frames + ' clear=' + (100 * clear / Math.max(1, tot)).toFixed(1) + '%');
  };
  log('INSTALLED v2 — colour from the app frame, geometry-only pass, depth mask');
})();
