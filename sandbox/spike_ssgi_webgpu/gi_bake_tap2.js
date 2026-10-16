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
  // §GI_READBACK_ROWPAD — WebGPU pads each readback row to 256 bytes (16 px of RGBA float), the last
  // row excepted. At 854x480 the buffer was 1,658,840 floats for 1,639,680 pixels' worth and every row
  // slid sideways: the whole-path 480p film came back smeared. 1920 and 1280 are multiples of 16.
  function unpadRows(b, w, h) {
    const want = w * h * 4;
    if (b.length === want) return b;
    const stride = (b.length / 4 - w) / (h - 1);
    if (!Number.isInteger(stride) || stride < w) throw new Error('readback length ' + b.length + ' fits no row stride for ' + w + 'x' + h);
    const out = new Float32Array(want);
    for (let y = 0; y < h; y++) out.set(b.subarray(y * stride * 4, y * stride * 4 + w * 4), y * w * 4);
    if (!S.padLogged) { S.padLogged = true; log('READBACK_ROWPAD w=' + w + ' stride=' + stride + ' px — rows unpadded'); }
    return out;
  }
  const GI_LAYER = 31;   // private to the geometry pass; the app uses no layers (grep: 0 calls)
  // §GI_SHARED_ATTR_WIDEN — the second renderer must not rewrite the APP's geometry.
  // WebGPUAttributeUtils.createAttribute (three.webgpu.min.js:84196-84214) widens every non-normalized
  // 8/16-bit array to 32-bit and assigns it back onto the SHARED attribute. The app's WebGL buffer stays
  // 16-bit, but BatchedMesh.onBeforeRender then computes its draw offsets at 4 bytes per index and
  // every slab, wall and stair vanished from the film (355/614 frames against a no-tap control;
  // measured 60/128 index arrays Uint16 -> Uint32, starts 216 -> 432). WebGPU also reads the index
  // format off the array at draw time (:89025), so it must SEE 32-bit while it draws: swap in a
  // 32-bit copy we own before the render, put the app's array back after, and make every BatchedMesh
  // rebuild its draw list at the right width on the app's next frame.
  const WIDE = new WeakMap();
  function widenShared(scene) {
    const swapped = [], seen = new Set();
    const one = (a, isIndex) => {
      if (!a || a.isInterleavedBufferAttribute || a.normalized) return;
      const arr = a.array, C = arr && arr.constructor;
      if (C !== Uint16Array && C !== Uint8Array && C !== Int16Array && C !== Int8Array) return;
      let e = WIDE.get(a);
      if (!e || e.narrow !== arr || e.version !== a.version) {
        const wide = (C === Int16Array || C === Int8Array) ? new Int32Array(arr) : new Uint32Array(arr);
        if (isIndex && C === Uint16Array) for (let i = 0; i < wide.length; i++) if (wide[i] === 0xffff) wide[i] = 0xffffffff;   // primitive restart, as upstream
        e = { narrow: arr, wide: wide, version: a.version }; WIDE.set(a, e);
      }
      a.array = e.wide; swapped.push([a, arr]);
    };
    scene.traverse(o => {
      const g = o.geometry;
      if (!g || seen.has(g) || !(o.isMesh || o.isLine || o.isPoints)) return;
      seen.add(g); one(g.index, true); for (const k in g.attributes) one(g.attributes[k], false);
    });
    return swapped;
  }
  function restoreShared(scene, swapped) {
    for (let i = swapped.length - 1; i >= 0; i--) swapped[i][0].array = swapped[i][1];
    scene.traverse(o => { if (o.isBatchedMesh) o._visibilityChanged = true; });
    return swapped.length;
  }
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
    // §GI_TAP_GLASS_SKIP by LAYER — the pass has its OWN camera, copied from A.camera every frame,
    // that sees only GI_LAYER. Nothing the app reads is touched: not A.camera (WebGPU would otherwise
    // rewrite its coordinateSystem), not any object's `.visible`.
    const cam = new THREE.PerspectiveCamera();
    cam.layers.set(GI_LAYER);
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
    // §GI_TAP_DIALS — the SAME formula and dials as the Alt+S still (gi_still.js §GI_AO_STRENGTH), whose
    // results red1 called "the ones to publish". At full strength the film read darker than its no-bounce
    // control (mean luma 90.9 vs 99.2): occlusion dims whole surfaces at distance instead of shaping corners.
    const gain = (window.__GI_STILL_GAIN != null) ? window.__GI_STILL_GAIN : 0.6;
    const aoK = (window.__GI_STILL_AO != null) ? window.__GI_STILL_AO : 0.55;
    const aoMix = TSL.float(1).sub(TSL.float(aoK)).add(TSL.float(aoK).mul(gi.getAONode()));
    pipeline.outputNode = TSL.vec4(TSL.sRGBTransferOETF(C.rgb.mul(aoMix).add(C.rgb.mul(gi.getGINode().rgb).mul(gain))), maskNode);
    log('DIALS ao=' + aoK + ' gain=' + gain + ' (same as Alt+S: __GI_STILL_AO / __GI_STILL_GAIN)');
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
    const A = window.APP, s = A.scene, prev = s.overrideMaterial;
    // the pass camera follows the app camera exactly, every frame
    const src = A.camera, cam = G.cam;
    src.updateMatrixWorld();
    src.matrixWorld.decompose(cam.position, cam.quaternion, cam.scale);
    cam.fov = src.fov; cam.aspect = src.aspect; cam.near = src.near; cam.far = src.far; cam.zoom = src.zoom;
    cam.filmGauge = src.filmGauge; cam.filmOffset = src.filmOffset; cam.view = src.view ? Object.assign({}, src.view) : null;
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    // §GI_TAP_GLASS_SKIP — same rule as gi_still's §GI_GLASS_SKIP. Under the override the renderer
    // copies `transparent` but not opacity (three.webgpu.min.js:65410-65414), so a fading storey or a
    // glass pane is recorded as a solid wall and the bounce behind it goes near-black. Those meshes,
    // the sky dome and raw-GLSL objects sit out the geometry pass by LAYER: everything else carries
    // GI_LAYER, they do not. Not by flipping `.visible`: the app renders on its own between captures,
    // so nothing it can see may change. (Blank frames once blamed on a `.visible` flip were in fact
    // the override held across an await — §GI_TAP_NO_SHARED_ACROSS_AWAIT below.)
    // The app never uses layers and its own camera lacks GI_LAYER, so this changes nothing it sees.
    const GLASS_MAX_OPACITY = (window.__GI_GLASS_OPACITY != null) ? window.__GI_GLASS_OPACITY : 0.9;
    let glass = 0;
    s.traverse(o => {
      const m = o.material;
      let skip = (o === A._sky);
      if (!skip && m && !Array.isArray(m)) {
        if (m.isShaderMaterial && !m.isNodeMaterial) skip = true;
        else if (m.transparent && m.opacity < GLASS_MAX_OPACITY) { skip = true; if (o.visible) glass++; }
      }
      if (skip) o.layers.disable(GI_LAYER); else o.layers.enable(GI_LAYER);
    });
    S.glassMax = Math.max(S.glassMax || 0, glass);
    // §GI_TAP_NO_SHARED_ACROSS_AWAIT — the override and the widened arrays live ONLY for this one
    // synchronous render. They used to span `await renderAsync()`, and the app renders on its own in
    // between captures (measured 185 renders between two captures): a WebGL render that lands while
    // the scene carries a NodeMaterial override draws nothing, and on ~0.4% of frames that empty
    // render was the one the film kept — a blank picture under a live HUD.
    s.overrideMaterial = G.geoMat;
    const swapped = widenShared(s);
    try {
      G.pipeline.needsUpdate = true;
      G.renderer.setRenderTarget(G.rt);
      G.pipeline.render();
      G.renderer.setRenderTarget(null);
    } finally {
      s.overrideMaterial = prev;
      const n = restoreShared(s, swapped);
      if (!S.widenLogged) { S.widenLogged = true; log('SHARED_ATTR_WIDEN swapped=' + n + ' 8/16-bit attributes for the second renderer, app arrays restored after (sync render, nothing shared held across an await)'); }
    }
    const b = await G.renderer.readRenderTargetPixelsAsync(G.rt, 0, 0, G.w, G.h);
    return unpadRows(b instanceof Float32Array ? b : Float32Array.from(b), G.w, G.h);
  }
  // §GI_TAP_SYNC_GRAB — the app frame is copied at the hook's FIRST line, before any await. A WebGL
  // canvas does not keep its pixels past the task that drew them: measured on the load-path freeze,
  // the copy taken at entry was the correct blackout, while the same canvas read after `await ready`
  // (0 WebGL renders in between) handed back an older picture with the whole building in it — 123
  // frames of the film lost the freeze. This one copy is both the colour input and the underlay.
  let entryCv = null, entryCtx = null;
  window.__giCaptureFrame = async function (ctx, w, h) {
    if (!entryCv || entryCv.width !== w || entryCv.height !== h) {
      entryCv = document.createElement('canvas'); entryCv.width = w; entryCv.height = h;
      entryCtx = entryCv.getContext('2d');
    }
    entryCtx.clearRect(0, 0, w, h);
    entryCtx.drawImage(window.APP.renderer.domElement, 0, 0, w, h);
    // §GI_TAP_EMPTY_GRAB — on ~0.4% of frames (random) this grab came back EMPTY and the film showed a
    // blank picture under a live HUD. Detect it, say whether the app rendered since the last capture,
    // re-render synchronously and grab again.
    {
      const A = window.APP, rf = A.renderer.info && A.renderer.info.render ? A.renderer.info.render.frame : -1;
      if (!S.probe) { S.probe = document.createElement('canvas'); S.probe.width = 32; S.probe.height = 18; S.probeCtx = S.probe.getContext('2d', { willReadFrequently: true }); }
      const hasPixels = () => { S.probeCtx.clearRect(0, 0, 32, 18); S.probeCtx.drawImage(entryCv, 0, 0, 32, 18);
        const p = S.probeCtx.getImageData(0, 0, 32, 18).data; for (let i = 3; i < p.length; i += 4) if (p[i] > 0) return true; return false; };
      if (!hasPixels()) {
        const sinceLast = (S.lastRf == null) ? 'n/a' : (rf - S.lastRf);
        try { if (A._composer) A._composer.render(); else A.renderer.render(A.scene, A.camera); } catch (e) {}
        entryCtx.clearRect(0, 0, w, h);
        entryCtx.drawImage(A.renderer.domElement, 0, 0, w, h);
        S.emptyGrabs = (S.emptyGrabs || 0) + 1;
        log('EMPTY_GRAB n=' + S.emptyGrabs + ' atCapture=' + (S.frames + 1) + ' appRendersSinceLastCapture=' + sinceLast + ' reRendered -> pixels=' + hasPixels());
      }
      // DIAG (§GI_TAP_EMPTY_GRAB): a sudden brightness DROP in the grab against the previous capture.
      S.probeCtx.clearRect(0, 0, 32, 18); S.probeCtx.drawImage(entryCv, 0, 0, 32, 18);
      const pp = S.probeCtx.getImageData(0, 0, 32, 18).data; let r = 0, g = 0, b = 0, al = 0;
      for (let i = 0; i < pp.length; i += 4) { r += pp[i]; g += pp[i + 1]; b += pp[i + 2]; al += pp[i + 3]; }
      const np = pp.length / 4, lum = (r + g + b) / 3 / np;
      // A grab that is a FLAT field of exactly the renderer's clear colour right after a normal frame is
      // the blank-frame signature (film frames 2, 79, 94: rgb 8,8,24 = clear #080818, alpha 255).
      // Re-render synchronously and grab again; log whether the second grab has a picture.
      let flat = true; for (let i = 4; i < pp.length && flat; i += 4) if (Math.abs(pp[i] - pp[0]) > 2 || Math.abs(pp[i + 1] - pp[1]) > 2 || Math.abs(pp[i + 2] - pp[2]) > 2) flat = false;
      const cc = A.renderer.getClearColor ? A.renderer.getClearColor(new window.THREE.Color()) : null;
      const isClear = cc && Math.abs(pp[0] - Math.round(cc.r * 255)) <= 3 && Math.abs(pp[1] - Math.round(cc.g * 255)) <= 3 && Math.abs(pp[2] - Math.round(cc.b * 255)) <= 3;
      // No brightness condition: in the load-path freeze the frame before is mostly black too, and a
      // blank there dropped the stack for one frame (whole-path 935, 941). A genuinely empty frame
      // re-renders to the same picture, so re-rendering every flat clear-colour grab is harmless.
      if (flat && isClear) {
        try { if (A._composer) A._composer.render(); else A.renderer.render(A.scene, A.camera); } catch (e) {}
        entryCtx.clearRect(0, 0, w, h); entryCtx.drawImage(A.renderer.domElement, 0, 0, w, h);
        S.probeCtx.clearRect(0, 0, 32, 18); S.probeCtx.drawImage(entryCv, 0, 0, 32, 18);
        const q = S.probeCtx.getImageData(0, 0, 32, 18).data; let ql = 0; for (let i = 0; i < q.length; i += 4) ql += (q[i] + q[i + 1] + q[i + 2]) / 3;
        S.blankRecovered = (S.blankRecovered || 0) + 1;
        S.recLum = ql / (q.length / 4);
        log('BLANK_GRAB atCapture=' + (S.frames + 1) + ' flat clear-colour grab after prevLum=' + (S.prevLum == null ? 'n/a' : S.prevLum.toFixed(1)) + ' -> re-rendered, lum now=' + (ql / (q.length / 4)).toFixed(1) + ' (n=' + S.blankRecovered + ')');
      }
      if (S.prevLum != null && S.prevLum > 20 && lum < 0.4 * S.prevLum) {
        const d = (S.lastRf == null) ? 'n/a' : (rf - S.lastRf);
        log('GRAB_DROP atCapture=' + (S.frames + 1) + ' lum=' + lum.toFixed(1) + ' prevLum=' + S.prevLum.toFixed(1) +
            ' rgb=' + (r / np).toFixed(0) + ',' + (g / np).toFixed(0) + ',' + (b / np).toFixed(0) + ' alpha=' + (al / np).toFixed(0) +
            ' appRendersSinceLastCapture=' + d + ' clear=' + (A.renderer.getClearColor ? '#' + A.renderer.getClearColor(new window.THREE.Color()).getHexString() : '?') +
            ' bg=' + (A.scene.background && A.scene.background.isColor ? '#' + A.scene.background.getHexString() : String(A.scene.background && A.scene.background.type)));
      }
      S.prevLum = (S.recLum != null) ? S.recLum : lum; S.recLum = null;
      S.lastRf = A.renderer.info && A.renderer.info.render ? A.renderer.info.render.frame : -1;
    }
    if (!ready) { S.phase = 'building'; ready = build(w, h).catch(e => { S.phase = 'build-failed'; log('BUILD_FAIL ' + (e && e.stack || e)); throw e; }); }
    const G = await ready;
    if (G.w !== w || G.h !== h) throw new Error('capture size changed');
    // 1. the app's finished frame — the underlay AND the colour this pass modulates
    G.colorCtx.clearRect(0, 0, w, h);
    G.colorCtx.drawImage(entryCv, 0, 0, w, h);
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
    ctx.drawImage(entryCv, 0, 0, w, h);
    ctx.drawImage(G.c2, 0, 0, w, h);
    S.frames++;
    if (S.frames <= 2 || S.frames % 150 === 0) log('FRAME ' + S.frames + ' clear=' + (100 * clear / Math.max(1, tot)).toFixed(1) + '% glassSkippedMax=' + (S.glassMax || 0) + ' (sync grab at entry)');
  };
  log('INSTALLED v2 — colour from the app frame, geometry-only pass, depth mask');
})();
