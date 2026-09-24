// LIVE ALT+S BOUNCE STILL (red1-84, 2026-09-23). §GI_LIVE: shipped in the viewer (viewer.html script
// tag) — desktop + WebGPU + three r186 only; anywhere else it stays out of the way (§GI_STILL_OFF).
// Sandbox origin: sandbox/spike_ssgi_webgpu/gi_still.js (kept for the dev server).
//
// Alt+S is NOT intercepted. The app's own photoreal still runs exactly as it always did
// (scene.js:3228 -> A.toggleStillRefine). We wait for it to finish, then add a bounce layer on top
// of the finished picture.
//
// ONE three.js instance: window.THREE (served as r186 by the same server), and the node modules are
// the *.appbound.js copies whose imports point at the app's own module URL. A private copy is what
// made the app's lights invisible and every frame black earlier. Do not reintroduce one.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §GI_STILL_GEOMPASS (2026-09-23) — WHAT THE STALL ACTUALLY WAS, and why this file now looks
// different. MEASURED, headless, HHS_Office_Federated_silent, 1280x720 (run_gi_still_headless.js,
// out/gi_still_headless/log_base.txt):
//
//     §GI_STILL stage compiling shaders for 664 scene objects 127065ms
//     HEARTBEAT rafMaxMs=127069  rafBlocks>50ms=4  worst5raf=[127069,417,119,52]
//
// ONE unbroken 127-second main-thread block — not many small ones. That is why none of the earlier
// attempts helped: dropping compileAsync, the 320x180 warm render, keeping the renderer, 8 passes
// instead of 24, the 1600x900 cap and the requestAnimationFrame yields all act OUTSIDE the block.
// The block is inside a single synchronous render.
//
// The cause is in three.js itself. r186 creates WebGPU render pipelines asynchronously ONLY when
// called from compileAsync(), which is the only caller that passes a non-null `promises` array:
//     three.webgpu.js:85689   if ( promises === null ) {
//     three.webgpu.js:85690       pipelineData.pipeline = device.createRenderPipeline( ... );   // BLOCKS
//     three.webgpu.js:85720       pipelinePromise = device.createRenderPipelineAsync( ... );    // only via compileAsync
// A normal render therefore calls the BLOCKING device.createRenderPipeline() once per distinct
// (material, geometry layout, blend state) it meets. The photoreal still stages the scene up to 664
// children, so the first render of the app's scene through a second renderer paid several hundred
// synchronous pipeline creations back to back.
//
// THE FIX: stop making the second renderer draw the app's materials at all.
//   1. The scene pass now renders with ONE shared override material (scene.overrideMaterial,
//      restored immediately afterwards) that writes only the view-space normal in RGB and a
//      geometry mask in A. Depth comes from the pass's own depth texture. One material for 664
//      objects instead of 664 materials.
//   2. The COLOUR comes from the app's own finished still: A.renderer.domElement copied into a
//      THREE.CanvasTexture and handed to SSGINode as the beauty/scene-colour input. SSGINode only
//      ever samples it — vendor/SSGINode.js:442  `const sampleBeauty = ( uv ) => this.beautyNode
//      .sample( uv );` — and vendor/SSGINode.js:692 passes it through `convertToTexture`, which
//      returns a TextureNode unchanged (three.webgpu.js:40386  `if ( node.isSampleNode ||
//      node.isTextureNode ) return node;`). So an external texture is accepted as-is.
//   3. The composite is unchanged in spirit: the app's picture underneath, the bounce layer over it.
//
// §GI_STILL_DOUBLE (2026-09-23, red1: "the bounce appears to be added TWICE") — same fix, second
// half. The old layer's alpha was the APP MATERIAL's alpha, so every glazed pixel came back partly
// transparent and got alpha-blended over an app pixel that already carried the app's own shading:
// both pictures contributed and the shading added to itself. The override material writes a strict
// geometry mask (1 wherever anything was drawn, 0 where nothing was), and the paste is a HARD mask
// — at or above GEOM_MASK_T the bounce replaces, below it the app's pixel is kept untouched. Both
// composites are computed and compared every shot; see §GI_STILL mask= in the log.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  const ACCUM_DEFAULT = 8;          // passes; a still has no motion, so it can average as long as it likes
  const MAX_PIXELS = 1600 * 900;    // bounce-pass resolution cap, scaled up for display
  const GEOM_MASK_T = 0.5;          // hard-mask threshold on the geometry mask (see §GI_STILL_DOUBLE)
  let busy = false, built = null;
  function toast(msg, ms) {
    let el = document.getElementById('gi-still-toast');
    if (!el) {
      el = document.createElement('div'); el.id = 'gi-still-toast';
      el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:100000;' +
        'background:rgba(20,22,28,.92);color:#e8eaf0;padding:10px 16px;border-radius:8px;font:14px/1.4 system-ui;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.45)';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.display = 'block';
    if (ms) setTimeout(() => { el.style.display = 'none'; }, ms);
    return el;
  }
  // Stage timing. Each stage reports its own time and yields the thread, so a run NAMES the slow
  // stage instead of us guessing at it — that is how the 127s block above was found.
  async function stage(name, fn) {
    toast('Bounce still — ' + name + '…');
    await new Promise(r => requestAnimationFrame(() => r()));
    const t = performance.now();
    const out = await fn();
    console.log('§GI_STILL stage ' + name + ' ' + (performance.now() - t).toFixed(0) + 'ms');
    await new Promise(r => requestAnimationFrame(() => r()));
    return out;
  }
  // Count the synchronous pipeline creations, because that is the thing that hung. Patches only OUR
  // renderer's own GPUDevice (the app's renderer is WebGL — §S277b_RENDERER WebGLRenderer r184), and
  // only ever adds a counter around the call.
  function instrumentPipelines(renderer) {
    try {
      const dev = renderer.backend && renderer.backend.device;
      if (!dev || dev.__giPipeStats) return null;
      const stats = { sync: 0, syncMs: 0, async: 0, modules: 0, moduleMs: 0 };
      const orig = dev.createRenderPipeline.bind(dev);
      dev.createRenderPipeline = function (d) { const t = performance.now(); const r = orig(d); stats.sync++; stats.syncMs += performance.now() - t; return r; };
      if (dev.createRenderPipelineAsync) { const oa = dev.createRenderPipelineAsync.bind(dev); dev.createRenderPipelineAsync = function (d) { stats.async++; return oa(d); }; }
      const om = dev.createShaderModule.bind(dev);
      dev.createShaderModule = function (d) { const t = performance.now(); const r = om(d); stats.modules++; stats.moduleMs += performance.now() - t; return r; };
      dev.__giPipeStats = stats;
      return stats;
    } catch (e) { console.warn('§GI_STILL pipeline instrumentation skipped: ' + (e && e.message)); return null; }
  }
  // Single readback point, so the orientation test and the accumulation passes cannot disagree.
  // __GI_STILL_INJECT_READBACK_FLIP is a TEST HOOK: it simulates a platform whose readback rows run
  // the other way, which is what the orientation search has to survive. Nothing sets it in normal use.
  async function readRT(G, rt, rw, rh) {
    rt = rt || G.rt; rw = rw || G.w; rh = rh || G.h;
    const b = await G.renderer.readRenderTargetPixelsAsync(rt, 0, 0, rw, rh);
    let fb = b instanceof Float32Array ? b : Float32Array.from(b);
    // §GI_READBACK_ROWPAD — WebGPU pads each readback row to 256 bytes (16 px of RGBA float), the last
    // row excepted. Any width that is not a multiple of 16 (red1's window gave 1666) came back with
    // every row sheared sideways — the "smearing". Unpad before anything reads it.
    if (fb.length !== rw * rh * 4) {
      const stride = (fb.length / 4 - rw) / (rh - 1);
      if (!Number.isInteger(stride) || stride < rw) throw new Error('readback length ' + fb.length + ' fits no row stride for ' + rw + 'x' + rh);
      const out = new Float32Array(rw * rh * 4);
      for (let y = 0; y < rh; y++) out.set(fb.subarray(y * stride * 4, y * stride * 4 + rw * 4), y * rw * 4);
      if (!G.padLogged) { G.padLogged = true; console.log('§GI_READBACK_ROWPAD w=' + rw + ' stride=' + stride + ' px — rows unpadded'); }
      fb = out;
    }
    if (window.__GI_STILL_INJECT_READBACK_FLIP) {
      const w = rw, h = rh, out = new Float32Array(fb.length);
      for (let y = 0; y < h; y++) out.set(fb.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      fb = out;
    }
    return fb;
  }
  // §GI_STILL_ORIENT — DECIDE THE ORIENTATION BY MATCHING, NEVER BY ASSUMPTION.
  // There are two independent unknowns and a brightness test cannot separate them: whether the
  // colour texture's v runs the same way as the pass's own render targets (flipTex — get this wrong
  // and the bounce lands on the wrong pixels, which no flip in JS can repair), and whether the
  // readback's rows run the same way as the canvas (flipOut — a plain row reversal).
  // All four combinations are rendered and scored against the app's own finished frame, ONLY over
  // the pixels the geometry pass actually covered. The mask travels in the same buffer as the
  // colour, so a wrong flipTex misaligns colour against geometry and a wrong flipOut misaligns both
  // against the app: exactly one of the four scores is small. All four are logged.
  // §GI_ROW_PROBE — a horizontal floor under a level camera, drawn with the SAME geometry material, the
  // SAME renderer and read back through the SAME readRT (row unpadding + test-injection hook). A floor
  // below the eye can only fill the BOTTOM half of the picture, so wherever its pixels land in the
  // buffer as read says how the rows run on this machine. Decisive by construction, any view.
  async function probeRowOrder(G) {
    const THREE = G.THREE, W = 64, H = 64;
    const sc = new THREE.Scene();
    const pg = new THREE.PlaneGeometry(4000, 4000); pg.rotateX(-Math.PI / 2);
    sc.add(new THREE.Mesh(pg, G.geoMat));
    const pc = new THREE.PerspectiveCamera(60, 1, 0.1, 10000); pc.position.set(0, 10, 0); pc.lookAt(0, 10, -100); pc.updateMatrixWorld(true);
    const prt = new THREE.RenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    try {
      G.renderer.setRenderTarget(prt); G.renderer.render(sc, pc); G.renderer.setRenderTarget(null);
      const fb = await readRT(G, prt, W, H);
      let top = 0, bottom = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fb[(y * W + x) * 4 + 3] > 0.5) { if (y < H / 2) top++; else bottom++; }
      const flipOut = top > bottom;
      console.log('§GI_ROW_PROBE floor pixels as read: top=' + top + ' bottom=' + bottom + ' -> flipOut=' + flipOut + ' (a floor below the eye fills the bottom half)');
      return { flipOut: flipOut, top: top, bottom: bottom };
    } finally { prt.dispose(); pg.dispose(); }
  }
  async function decideOrientation(G) {
    // 256x144, not 96x54: the two candidates a colour match cannot tell apart differ only in where
    // the AO lands, and AO's sharpest signal is the contact shading at wall/floor junctions, which a
    // 96x54 downsample averages away. Measured at 96x54 the margin was 0.58 of 8.85.
    const w = G.w, h = G.h, SW = 256, SH = 144;
    const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
    const scx = sc.getContext('2d', { willReadFrequently: true });
    scx.drawImage(G.colorCanvas, 0, 0, SW, SH);               // GPU downsample of the app frame
    const ap = scx.getImageData(0, 0, SW, SH).data;
    const appL = new Float32Array(SW * SH);
    for (let i = 0; i < SW * SH; i++) appL[i] = (ap[i * 4] + ap[i * 4 + 1] + ap[i * 4 + 2]) / 3;
    const scores = {}; let best = null;
    for (const ft of [false, true]) {
      G.setTexFlip(ft);
      await renderGeom(G);
      const fb = await readRT(G);
      for (const fo of [false, true]) {
        // TWO scores. `covered` is the sum of absolute differences over the pixels the geometry pass
        // drew — the plain match. `composite` scores the picture that would actually be shown: the
        // bounce where the mask is 1, the app's own pixel where it is 0. The second one is what
        // decides, because it is the one that separates the two candidates a colour-only match
        // cannot tell apart: the pair where the colour comes out upright but the MASK and the AO are
        // upside down scores the same on `covered` (measured 9.53 against 10.71, a margin of 1.18)
        // and badly on `composite`, because it paints shaded geometry over the app's sky and leaves
        // the real geometry unshaded. Every candidate masks the same number of pixels, so neither
        // score is biased by mask area.
        let sum = 0, n = 0, csum = 0, cn = 0;
        for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
          const x = Math.floor((i + 0.5) * w / SW), y = Math.floor((j + 0.5) * h / SH);
          const k = ((fo ? (h - 1 - y) : y) * w + x) * 4;
          const a = appL[j * SW + i];
          const l = (fb[k] + fb[k + 1] + fb[k + 2]) / 3 * 255;
          const drew = fb[k + 3] >= 0.5;
          if (drew) { sum += Math.abs(l - a); n++; }
          csum += Math.abs((drew ? l : a) - a); cn++;
        }
        const v = n > 200 ? sum / n : Infinity, cv = cn > 0 ? csum / cn : Infinity;
        const key = 'tex' + (ft ? 'Flip' : 'Same') + '_out' + (fo ? 'Flip' : 'Same');
        scores[key] = { covered: isFinite(v) ? +v.toFixed(2) : null, composite: isFinite(cv) ? +cv.toFixed(2) : null };
        if (!best || cv < best.score) best = { flipTex: ft, flipOut: fo, score: cv, covered: v, n: n };
      }
    }
    // §GI_STILL_ORIENT_GEOM (2026-09-23, red1: "image smearing from bounce ... even when indoors").
    // The colour score above cannot separate the two colour-upright candidates: measured margins
    // 0.08-0.33 on HHS and 0.05 on Terminal indoors, and it picked the upside-down one at 3 of 4
    // poses — AO, bounce and mask painted onto the mirror-image rows. flipOut is a pure row order,
    // so it is decided from GEOMETRY: a front-facing surface's view normal n and the camera ray r
    // through its pixel satisfy n·r <= 0. Count the covered pixels that break that with the rows
    // as read and reversed; the right order breaks it on ~0.1-2%, the wrong one on 21-32%.
    // flipTex then follows from colour: the lower composite score at that flipOut.
    const colourPick = { flipTex: best.flipTex, flipOut: best.flipOut };
    const geo = await (async () => {
      const prevMode = G.mode;
      G.setMode('normalsraw', 'raw');
      try {
        await renderGeom(G);
        const fb = await readRT(G);
        const t = Math.tan(G.cam.fov * Math.PI / 360), asp = w / h;
        let n = 0, asRead = 0, reversed = 0;
        for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
          const rx = (2 * (x + 0.5) / w - 1) * t * asp, ry = (1 - 2 * (y + 0.5) / h) * t, L = Math.hypot(rx, ry, 1);
          for (const fo of [false, true]) {
            const k = ((fo ? (h - 1 - y) : y) * w + x) * 4;
            if (fb[k + 3] < 0.5) continue;
            const d = ((fb[k] * 2 - 1) * rx + (fb[k + 1] * 2 - 1) * ry - (fb[k + 2] * 2 - 1)) / L;
            if (fo) { if (d > 0.05) reversed++; } else { n++; if (d > 0.05) asRead++; }
          }
        }
        return { n: n, asRead: n ? 100 * asRead / n : 0, reversed: n ? 100 * reversed / n : 0 };
      } finally {
        const pm = (prevMode || 'composite|' + encodeMode()).split('|');
        G.mode = null; G.setMode(pm[0], pm[1]);
      }
    })().catch(e => { console.warn('§GI_STILL_ORIENT_GEOM failed: ' + (e && e.message)); return null; });
    let decidedBy = 'colour';
    if (geo && geo.n > 2000 && !G.cam.isOrthographicCamera) {
      const lo = Math.min(geo.asRead, geo.reversed), hi = Math.max(geo.asRead, geo.reversed);
      // §GI_ORIENT_RATIO — a RATIO test with a small floor. The old `hi >= 2*lo + 1` carried a 1-point
      // absolute floor sized for indoor poses (21-32% vs 0.1-2%); at a low-contrast view (live site, HHS
      // default view) the signal was 0.02% vs 0.20% of ~90,000 samples — 10x, but under 1 point — so it
      // fell back to colour, which picked the upside-down pair.
      // __GI_STILL_FORCE_UNDECIDED is a TEST HOOK (like __GI_STILL_INJECT_READBACK_FLIP): it sends the
      // decision down the undecided path so §GI_ROW_PROBE can be witnessed. Nothing sets it in normal use.
      if (!window.__GI_STILL_FORCE_UNDECIDED && hi >= 3 * lo && hi - lo >= 0.1) {
        const fo = geo.reversed < geo.asRead;
        const pick = [false, true].map(ft => ({ ft: ft, s: scores['tex' + (ft ? 'Flip' : 'Same') + '_out' + (fo ? 'Flip' : 'Same')].composite }))
          .sort((a, b2) => a.s - b2.s)[0];
        best = { flipTex: pick.ft, flipOut: fo, score: pick.s, covered: best.covered, n: best.n };
        decidedBy = (best.flipTex === colourPick.flipTex && best.flipOut === colourPick.flipOut) ? 'geometry (agrees with colour)'
          : 'geometry (OVERRULED colour pick flipTex=' + colourPick.flipTex + ' flipOut=' + colourPick.flipOut + ')';
      } else {
        // §GI_ORIENT_RATIO — undecided (a view of mostly camera-facing walls: flipping rows barely changes
        // which surfaces face away, measured 0.02% vs 0.09-0.20%). NEVER fall back to colour: it picked the
        // upside-down pair in every weak case measured. The row order is a property of the pipeline, not
        // of the view — every decisive reading on this platform (13 runs, 9 poses, 3 servers) gave
        // flipTex=false flipOut=false. Reuse the last decisive answer this session, else that measured one.
        // §GI_ROW_PROBE — the row order is NOT the same on every machine: red1's desktop read flipOut=true
        // (20.93% vs 0.01%, Clinic) where every headless run reads false. So when this view cannot decide,
        // ask the pipeline itself with a scene whose answer is known.
        const prevGeo = window.__giOrientDecided;
        let probe = null;
        if (!prevGeo) probe = await probeRowOrder(G).catch(e => { console.warn('§GI_ROW_PROBE failed: ' + (e && e.message)); return null; });
        const fo = prevGeo ? prevGeo.flipOut : (probe ? probe.flipOut : false);
        best = { flipTex: prevGeo ? prevGeo.flipTex : false, flipOut: fo, score: best.score, covered: best.covered, n: best.n };
        decidedBy = prevGeo ? 'geometry UNDECIDED -> last decisive answer this session'
          : (probe ? 'geometry UNDECIDED -> row-order probe' : 'geometry UNDECIDED -> probe failed, no flips');
        if (probe) window.__giOrientDecided = { flipTex: false, flipOut: probe.flipOut };
      }
    }
    if (/^geometry \(/.test(decidedBy)) window.__giOrientDecided = { flipTex: best.flipTex, flipOut: best.flipOut };
    G.setTexFlip(best.flipTex); G.flipOut = best.flipOut;
    const sorted = Object.values(scores).map(v => v.composite).filter(v => v != null).sort((a, b2) => a - b2);
    G.orient = { scores: scores, flipTex: best.flipTex, flipOut: best.flipOut, score: +best.score.toFixed(2), samples: best.n,
                 margin: sorted.length > 1 ? +(sorted[1] - sorted[0]).toFixed(2) : null, geo: geo, decidedBy: decidedBy };
    console.log('§GI_STILL orientation by match (scored only where the geometry pass drew): ' + JSON.stringify(scores) +
                ' colour pick flipTex=' + colourPick.flipTex + ' flipOut=' + colourPick.flipOut + ' margin=' + G.orient.margin);
    console.log('§GI_STILL_ORIENT_GEOM backfacing asRead=' + (geo ? geo.asRead.toFixed(2) : '?') + '% reversed=' + (geo ? geo.reversed.toFixed(2) : '?') +
                '% covered=' + (geo ? geo.n : 0) + ' -> flipTex=' + best.flipTex + ' flipOut=' + best.flipOut + ' decidedBy=' + decidedBy +
                ' [a front-facing surface cannot face away from its own camera ray: the right row order breaks that on ~0.1-2% of' +
                ' pixels, the wrong one on 21-32% (HHS, 4 poses)]');
    return G.orient;
  }
  // Draw the app's OWN finished frame into our colour canvas. Render and copy in the SAME task: a
  // WebGL canvas is not guaranteed to hold its pixels afterwards, and the app parks its render loop
  // when idle (§IDLE_GATE park appears in the log right before Alt+S), so the buffer can be empty.
  // §GI_APP_FRAME (2026-09-24, measured: some presses fed the bounce a near-black app frame, appMean 13.3, while the
  // still on screen was normal, mean 119). The old code RE-RENDERED the app scene before reading it — one raw render,
  // not the finished accumulated still on screen, and on those presses that render came out dark. Now the displayed
  // still (preserveDrawingBuffer) is read FIRST; only an empty read (mean < 2, the idle-park case the re-render was
  // for) falls back to a re-render. Both means are logged.
  function readCanvasInto(G) {
    const A = window.APP;
    G.colorCtx.clearRect(0, 0, G.w, G.h);
    G.colorCtx.drawImage(A.renderer.domElement, 0, 0, G.w, G.h);
    G.colorTex.needsUpdate = true;
    const u = G.colorCtx.getImageData(0, 0, Math.min(128, G.w), Math.min(72, G.h)).data;   // 128x72 only
    let t = 0; for (let i = 0; i < u.length; i += 4) t += (u[i] + u[i + 1] + u[i + 2]) / 3;
    return +(t / (u.length / 4)).toFixed(1);
  }
  function grabAppFrame(G) {
    const A = window.APP;
    const first = readCanvasInto(G);
    if (first >= 2) { console.log('§GI_APP_FRAME read=displayed mean=' + first + ' (no re-render)'); return first; }
    try { if (A.markDirty) A.markDirty(); } catch (e) {}
    try { if (A._composer) A._composer.render(); else A.renderer.render(A.scene, A.camera); }
    catch (e) { console.warn('§GI_STILL app render failed: ' + (e && e.message)); }
    const second = readCanvasInto(G);
    console.log('§GI_APP_FRAME read=rerender displayedMean=' + first + ' rerenderMean=' + second + ' (the displayed buffer was empty)');
    return second;
  }
  // ONE render of the geometry pass, with the app's scene left exactly as found.
  //  • scene.overrideMaterial — the whole point; restored in `finally`.
  //  • scene.background — nulled, because the background mesh is built with allowOverride = false
  //    (three.webgpu.js:51258) so it would still draw its own colour with alpha 1 and fill the mask.
  //  • A._sky and any raw GLSL ShaderMaterial — hidden. Today the renderer REFUSES them: the
  //    baseline log carries exactly one `THREE.NodeBuilder: Material "ShaderMaterial" is not
  //    compatible.` and 8.6% of the frame stayed transparent because of it. With an override
  //    material they would suddenly start drawing, and A._sky is a full-screen dome — it would
  //    cover the picture and take the depth buffer with it.
  // MEASURED CHOICE (§GI_STILL_SWAP): scene.overrideMaterial does NOT give one program for the whole
  // scene. The renderer copies alphaTest/alphaMap/displacement*/transparent from each SOURCE material
  // onto the override before every draw (three.webgpu.js:65409-65416), so the cache key still moves
  // per object: measured 291 device.createRenderPipeline calls for 291 drawn objects. Swapping each
  // mesh's own material for the shared one avoids that path entirely (`material.allowOverride` is
  // only consulted when scene.overrideMaterial is set), so the numbers for both are logged and the
  // faster one is the default. Either way every material is put back in `finally`.
  // MEASURED A/B (fix3, same page, same still, fresh renderer for each): scene.overrideMaterial
  // compiled in 5384ms with 292 sync pipelines; the material swap compiled in 5393ms with 289. No
  // difference — the pipeline cache key moves per RENDER OBJECT, not per material — so the default
  // is the non-invasive one. The swap stays available behind the flag because it was measured.
  const SWAP = () => !!window.__GI_STILL_SWAP;
  // §GI_SHARED_ATTR_WIDEN — the second renderer must not rewrite the APP's geometry.
  // WebGPUAttributeUtils.createAttribute (three.webgpu.min.js:84196-84214) widens every non-normalized
  // 8/16-bit array to 32-bit and assigns it back onto the SHARED attribute. The app's WebGL buffer stays
  // 16-bit, but BatchedMesh.onBeforeRender then computes its draw offsets at 4 bytes per index: after
  // one bounce pass the app's own frame lost every slab, wall and stair (measured on HHS, 60/128 index
  // arrays Uint16 -> Uint32, 48% of pixels off by >60) — the see-through look red1 called smearing.
  // WebGPU also reads the index format off the array at draw time (:89025), so it must SEE 32-bit
  // while it draws: swap in a 32-bit copy we own before the render, put the app's array back after,
  // and make every BatchedMesh rebuild its draw list at the right width on the app's next frame.
  const WIDE = new WeakMap();
  function widenShared(scene) {
    const out = [], seen = new Set();
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
      a.array = e.wide; out.push([a, arr]);
    };
    scene.traverse(o => {
      const g = o.geometry;
      if (!g || seen.has(g) || !(o.isMesh || o.isLine || o.isPoints)) return;
      seen.add(g); one(g.index, true); for (const k in g.attributes) one(g.attributes[k], false);
    });
    return out;
  }
  function restoreShared(scene, widened) {
    for (let i = widened.length - 1; i >= 0; i--) widened[i][0].array = widened[i][1];
    scene.traverse(o => { if (o.isBatchedMesh) o._visibilityChanged = true; });
    return widened.length;
  }
  let widenLogged = false;
  async function renderGeom(G) {
    const A = window.APP, s = A.scene;
    const prevOverride = s.overrideMaterial, prevBg = s.background;
    const hidden = [], swapped = [];
    const useSwap = SWAP();
    const widened = widenShared(s);
    try {
      if (A._sky && A._sky.visible) { A._sky.visible = false; hidden.push(A._sky); }
      // §GI_GLASS_SKIP (red1, 2026-09-23: "eerie bouncing" indoors — a Terminal hall shot full of
      // milky translucent sheets). The geometry pass writes depth and normals with ONE opaque
      // material, so a glass panel is recorded as a solid wall: the occlusion and the bounce are then
      // computed against a surface that light actually passes through, and the mask marks it solid so
      // the app's own glass is replaced by that wrong shading. Transparent meshes are therefore left
      // OUT of the geometry pass entirely — their pixels stay exactly as the app drew them.
      // Terminal has 26 such meshes at opacity 0.25; HHS's facade is mostly glazing.
      const GLASS_MAX_OPACITY = (window.__GI_GLASS_OPACITY != null) ? window.__GI_GLASS_OPACITY : 0.9;
      let glass = 0;
      s.traverse(o => {
        const m = o.material;
        if (!o.visible || !m || Array.isArray(m)) return;
        if (m.isShaderMaterial && !m.isNodeMaterial) { o.visible = false; hidden.push(o); return; }
        if (m.transparent && m.opacity < GLASS_MAX_OPACITY) { o.visible = false; hidden.push(o); glass++; }
      });
      G.glassSkipped = glass;
      if (useSwap) {
        s.traverse(o => {
          if (!o.visible || !o.material || o.material === G.geoMat) return;
          // Lines, points and sprites are hidden rather than swapped: a mesh NodeMaterial is not a
          // line/point/sprite material, and a 1px sliver contributes nothing to depth-and-normal
          // ambient occlusion. Leaving them on their own materials would put the per-object shader
          // compile straight back, which is the thing being removed.
          if (o.isLine || o.isPoints || o.isSprite) { o.visible = false; hidden.push(o); return; }
          if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
          swapped.push([o, o.material]); o.material = G.geoMat;
        });
      } else {
        s.overrideMaterial = G.geoMat;
      }
      s.background = null;
      // NO `pipeline.needsUpdate = true` here. RenderPipeline._updateContext ends with
      // `this._quadMesh.material.needsUpdate = true` (three.webgpu.js:90729-90731), so setting it
      // per pass rebuilt the SSGI quad's program — the most expensive shader in the graph — on every
      // one of the 8 passes. The temporal filter does not need it: SSGINode reads frame.frameId,
      // which advances on its own (vendor/SSGINode.js:363).
      G.renderer.setRenderTarget(G.rt);
      if (G.pipeline.renderAsync) await G.pipeline.renderAsync(); else G.pipeline.render();
      G.renderer.setRenderTarget(null);
      G.hiddenCount = hidden.length;
      if (!G.glassLogged) { G.glassLogged = true; console.log('§GI_STILL glass skip: ' + (G.glassSkipped || 0) + ' transparent meshes left out of the geometry pass (they keep the app\'s own pixels)'); }
    } finally {
      for (let i = swapped.length - 1; i >= 0; i--) swapped[i][0].material = swapped[i][1];
      s.overrideMaterial = prevOverride;
      s.background = prevBg;
      for (const o of hidden) o.visible = true;
      G.swappedCount = swapped.length;
      const nw = restoreShared(s, widened);
      if (!widenLogged) { widenLogged = true; console.log('§GI_SHARED_ATTR_WIDEN swapped=' + nw + ' 8/16-bit attributes for the second renderer, app arrays restored after every pass'); }
    }
  }
  // §GI_STILL_ENCODE — MEASURED, not assumed. With `pipeline.outputColorTransform = true` the
  // finished frame came back in LINEAR light, not sRGB: over 19 luminance buckets the readback
  // tracked sRGB->linear of the app's own frame to within ~2/255 the whole way
  // (app 160.0 -> out 90.6 against a predicted 89.6; app 96.0 -> 31.3 against 29.8). The texture is
  // decoded on sample — three.js gives an sRGB texture the hardware 'rgba8unorm-srgb' format — but
  // the matching re-encode never ran, so the whole picture came out about half as bright. Encoding
  // explicitly with sRGBTransferOETF makes the round trip an identity, which mode 'coloronly'
  // checks every run. 'transform' keeps the old behaviour for comparison.
  function encodeMode() { return window.__GI_STILL_ENCODE || 'oetf'; }
  // §GI_STILL_GAIN_DIAL (2026-09-24, red1: bounce "MORE", tuned per press). Read at EVERY Alt+S:
  // APP._stillBounceGain, else window.__GI_STILL_GAIN, else &bounce=<0..3>, else 1.0 (was a fixed 0.6).
  // AO keeps its 0.55 default; window.__GI_STILL_AO still overrides, now per press too.
  const GI_GAIN_DEFAULT = 1.0, GI_AO_DEFAULT = 0.55, GI_RECV_DEFAULT = 1, GI_RADIUS_DEFAULT = 12, GI_THICK_DEFAULT = 1;
  function readGain() {
    const A = window.APP || {};
    let v = (typeof A._stillBounceGain === 'number') ? A._stillBounceGain : (typeof window.__GI_STILL_GAIN === 'number' ? window.__GI_STILL_GAIN : null);
    if (v == null) { const m = /[?&]bounce=([0-9.]+)/.exec(location.search); v = m ? parseFloat(m[1]) : GI_GAIN_DEFAULT; }
    return Math.max(0, Math.min(3, isFinite(v) ? v : GI_GAIN_DEFAULT));
  }
  // §GI_STILL_AO_DIAL (red1 via watcher: AO darkening outweighed the bounce outdoors) — APP._stillAo, else
  // window.__GI_STILL_AO, else &ao=<0..1>, else 0.55. 0 = no occlusion darkening, 1 = full.
  // §GI_BOUNCE_STRENGTH dials (red1: "outdoor bounce ... cannot have near-zero effect"). One reader for every SSGI
  // knob: APP[key] (number) > &name= > default, clamped. Read at EVERY press; all are uniforms, no rebuild.
  function readNum(key, name, def, lo, hi) {
    const A = window.APP || {};
    let v = (typeof A[key] === 'number') ? A[key] : null;
    if (v == null) { const m = new RegExp('[?&]' + name + '=([0-9.]+)').exec(location.search); v = m ? parseFloat(m[1]) : def; }
    return Math.max(lo, Math.min(hi, isFinite(v) ? v : def));
  }
  function readAo() {
    const A = window.APP || {};
    let v = (typeof A._stillAo === 'number') ? A._stillAo : (typeof window.__GI_STILL_AO === 'number' ? window.__GI_STILL_AO : null);
    if (v == null) { const m = /[?&]ao=([0-9.]+)/.exec(location.search); v = m ? parseFloat(m[1]) : GI_AO_DEFAULT; }
    return Math.max(0, Math.min(1, isFinite(v) ? v : GI_AO_DEFAULT));
  }
  // §GI_RECEIVER — what the bounce is multiplied by at the RECEIVING pixel. Physically that is the surface's
  // albedo; the pipeline has no albedo buffer, only the app's finished (LIT) colour, so a shaded soffit — dark in
  // the still — received ~no bounce: the bounce was scaled by the very shading it should fill. recv 0 = the lit
  // colour (old). recv 1 = an albedo ESTIMATE, not measured data: the lit colour's hue at a fixed brightness
  // GI_ALBEDO_EST (0.5 = mid grey), so shade no longer cancels the bounce. Blend in between. Uniform, per press.
  // Default recv=1 (§GI_BOUNCE_STRENGTH sweep, Hospital real GPU): bounce added courtyard 0.8% -> 4.9%, L1 interior
  // 13.0% -> 32.0% of the app frame (linear). Radius x2/x4 did not help (screen-space radius; x4 lowered it).
  const GI_ALBEDO_EST = 0.5;
  function receiver(G, C) {
    const T = G.TSL, lum = T.max(T.dot(C.rgb, T.vec3(0.2126, 0.7152, 0.0722)), T.float(1e-3));
    const est = T.min(C.rgb.div(lum).mul(GI_ALBEDO_EST), T.vec3(1));
    return T.mix(C.rgb, est, G.recvU);
  }
  function outputFor(G, mode, enc) {
    const T = G.TSL, C = G.colorNode.sample(G.TSL.uv()), gi = G.gi, mask = G.maskNode;
    let rgb;
    // §GI_STILL_ORIENT_GEOM — the packed view normal with NO transfer and NO colour transform, so
    // the readback is n*0.5+0.5 exactly and the sign test in decideOrientation needs no decoding.
    if (mode === 'normalsraw') { G.pipeline.outputColorTransform = false; return T.vec4(G.geomTexNode.rgb, mask); }
    if (mode === 'coloronly') rgb = C.rgb;                                      // alignment + transfer witness
    else if (mode === 'normals') rgb = G.geomTexNode.rgb;                       // packed view normal
    else if (mode === 'ao') rgb = T.vec3(gi.getAONode());
    // §GI_STILL_TERM — the two parts of the composite alone, so a § line can say what the bounce ADDS and what the
    // occlusion TAKES, in the same units as compositeMean: 'giterm' = colour x bounce x gain, 'aoloss' = colour x
    // aoK x (1 - AO).
    else if (mode === 'giterm') rgb = receiver(G, C).mul(gi.getGINode().rgb).mul(G.gainU);
    else if (mode === 'aoloss') rgb = C.rgb.mul(G.aoU).mul(T.float(1).sub(gi.getAONode()));
    else {
      // §GI_AO_STRENGTH (red1, 2026-09-23: "there seems to be some eerie bouncing" — an aerial still
      // where the whole roof and facade went dark and flat). Cause is scale: the occlusion term is
      // applied at full weight everywhere, and on a big exterior surface seen from distance almost
      // every sample reads as occluded, so it dims the whole building instead of picking out corners.
      // The occlusion is now BLENDED rather than multiplied outright: 1 means the old behaviour,
      // 0 leaves the app's picture alone. The bounce term keeps its own gain.
      // Terminal measured compositeMean=163.68 against appMean=159.81 — the bounce was ADDING light
      // in a white hall and washing it out. Default gain lowered; raise it with __GI_STILL_GAIN.
      // §GI_STILL_GAIN_DIAL — gain and AO are UNIFORMS (G.gainU / G.aoU), set per press in shoot(), so the
      // renderer kept across Alt+S presses picks up a new value without a shader rebuild (§GI_DIALS_FIRST_BUILD fix).
      const gain = G.gainU, aoK = G.aoU;
      const ao = T.float(1).sub(aoK).add(aoK.mul(gi.getAONode()));
      rgb = C.rgb.mul(ao).add(receiver(G, C).mul(gi.getGINode().rgb).mul(gain));
    }
    // enc 'linear' (§GI_STILL_TERM): no transfer at all, so coloronly/giterm/aoloss means ADD up in linear light.
    if (enc === 'linear') { G.pipeline.outputColorTransform = false; return T.vec4(rgb, mask); }
    G.pipeline.outputColorTransform = (enc === 'transform');
    return (enc === 'transform') ? T.vec4(rgb, mask) : T.vec4(T.sRGBTransferOETF(rgb), mask);
  }
  async function build(w, h) {
    const A = window.APP, THREE = window.THREE;
    if (!(THREE && THREE.REVISION === '186' && THREE.WebGPURenderer)) throw new Error('this page is three.js r' + (THREE && THREE.REVISION) + ' — the bounce still needs r186');
    if (!navigator.gpu) throw new Error('this browser exposes no WebGPU (navigator.gpu missing)');
    const TSL = await stage('loading modules', () => import('./lib/gi/three.tsl.appbound.js'));
    const { ssgi } = await import('./lib/gi/SSGINode.appbound.js');
    const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h);
    // §GI_PRESS_COST (measured 2026-09-24): with the app's lights visible to this renderer, every Alt+S after the first
    // rebuilt 3,034 pipelines + 2,799 shader modules (35 s) — the lights are new objects each press (portals, pads, lamps)
    // and the pipelines are keyed on the scene's light set. Nothing this renderer draws is lit (the geometry pass is an
    // unlit NodeMaterial; SSGI reads the app's finished frame), so it sees NO lights: one fixed, empty light set.
    // A property of this renderer only — the app's WebGL renderer and its lights are untouched.
    if (renderer.lighting) renderer.lighting.enabled = false;
    // NO tone mapping and NO exposure lift here any more. The colour we feed in is the app's own
    // FINISHED still — already tone-mapped, already at the app's exposure. Sampling decodes sRGB to
    // linear (three.js gives an sRGB texture the hardware 'rgba8unorm-srgb' format) and the output
    // node re-encodes it with sRGBTransferOETF, so an untouched pixel comes back exactly where it
    // started: MEASURED, mode 'coloronly' returns compositeMean=113.34 against appMean=113.34,
    // meanAbsDiff=0 over the full frame. The bake tap's exposure=1.8 exists because THAT path renders
    // the scene itself and has to match the app's brightness; this one starts from it.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);             // untouched pixels stay empty; the app's sky shows through
    if (renderer.setClearAlpha) renderer.setClearAlpha(0);
    await stage('starting the graphics device', () => renderer.init());
    const pipeStats = instrumentPipelines(renderer);
    const cam = A.camera;
    const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
    const pipeline = new Pipeline(renderer);

    // COLOUR INPUT — the app's own finished picture, as a texture.
    const colorCanvas = document.createElement('canvas'); colorCanvas.width = w; colorCanvas.height = h;
    const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.flipY = false;
    colorTex.colorSpace = THREE.SRGBColorSpace;     // canvas holds sRGB bytes -> decoded to linear on sample
    colorTex.generateMipmaps = false;
    colorTex.minFilter = THREE.LinearFilter; colorTex.magFilter = THREE.LinearFilter;
    colorTex.wrapS = colorTex.wrapT = THREE.ClampToEdgeWrapping;
    // §GI_STILL_ORIENT — the colour texture's v is steered by UNIFORMS, not by texture.flipY, so the
    // orientation can be decided by measurement at build time and switched without recompiling a
    // shader. `sample()` is accepted by SSGINode unchanged: vendor/SSGINode.js:692 pipes the beauty
    // input through convertToTexture, and that returns a SampleNode as-is
    // (three.webgpu.js:40386 `if ( node.isSampleNode || node.isTextureNode ) return node;`), and
    // vendor/SSGINode.js:442 only ever calls `.sample( uv )` on it. So the SSGI rays and the final
    // composite read the colour through the SAME flip — they cannot disagree.
    const flipSign = TSL.uniform(1), flipOff = TSL.uniform(0);
    const colorTexNode = TSL.texture(colorTex);
    const colorNode = TSL.sample((uv) => colorTexNode.sample(TSL.vec2(uv.x, uv.y.mul(flipSign).add(flipOff))));

    // GEOMETRY PASS — one material, unlit, no textures, no lights: RGB = packed view normal,
    // A = 1 wherever anything was drawn. normalViewGeometry (not normalView) on purpose: it is the
    // interpolated vertex normal and needs no material lighting context, so it compiles the same way
    // for every object in the scene.
    const geoMat = new THREE.NodeMaterial();
    geoMat.name = 'GI_STILL_GEOM';
    geoMat.lights = false; geoMat.fog = false;
    geoMat.forceSinglePass = true;                  // never split a transparent object into two passes
    geoMat.depthWrite = true; geoMat.depthTest = true;
    geoMat.colorNode = TSL.vec4(TSL.packNormalToRGB(TSL.normalViewGeometry), 1);

    const scenePass = TSL.pass(A.scene, cam);
    const geomTexNode = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const nrm = TSL.sample((uv) => TSL.unpackRGBToNormal(scenePass.getTextureNode('output').sample(uv)));
    // §GI_STILL_SKY — GEOMETRY MASK FROM DEPTH, not from the pass's colour alpha.
    // The colour alpha coming out of this pipeline is NOT a trustworthy "did anything draw here"
    // signal, and here is the one-variable bisect that shows it: the identical build, same frame,
    // same renderer, measured clear(a<0.02)=0.00% with the SSGI node referenced by the output node
    // and clear=7.87% with mode 'coloronly', where it is not. Nothing else changed.
    // The reason is in the two sources. PassNode.updateBefore (three.webgpu.js:42967-43043) saves
    // and sets autoClear/autoClearColor/autoClearDepth/autoClearStencil and the MRT, and never sets
    // a clear COLOUR — it uses whatever the renderer is holding. SSGINode.updateBefore wraps its own
    // quad render in `renderer.setClearColor( 0xffffff, 1 )` (vendor/SSGINode.js:391), and the scene
    // pass is updated from inside that window, so the frame comes back cleared to white at alpha 1
    // and the sky is "covered". It is not temporal history and it is not the accumulation.
    // Depth is cleared to 1.0 whatever the clear colour is, and reversedDepthBuffer is off by
    // default (three.webgpu.js:61759), so depth < 1 is exactly "something was drawn here".
    // Measured after the change: clear=8.09% / 5.87% / 12.15% across three runs, against 8.6% for
    // the old full-scene path on the same building — and partial(0.02..0.98)=0.00% every time.
    const maskNode = depth.r.lessThan(0.999999).select(TSL.float(1), TSL.float(0));
    const gi = ssgi(colorNode, depth, nrm, cam);
    gi.sliceCount.value = (window.__GI_SLICES || 3); gi.stepCount.value = (window.__GI_STEPS || 16);
    gi.useTemporalFiltering = true;                 // high preset
    pipeline.outputColorTransform = true;
    const rt = new THREE.RenderTarget(w, h, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    const G = { THREE, TSL, renderer, pipeline, rt, w, h, cam, geoMat, colorCanvas, colorCtx, colorTex, colorNode, geomTexNode, maskNode, gi, pipeStats, mode: null, flipTex: false, flipOut: false };
    G.gainU = TSL.uniform(GI_GAIN_DEFAULT); G.aoU = TSL.uniform(GI_AO_DEFAULT);   // §GI_STILL_GAIN_DIAL
    G.recvU = TSL.uniform(0);   // §GI_RECEIVER, set per press
    G.setTexFlip = (f) => { G.flipTex = !!f; flipSign.value = f ? -1 : 1; flipOff.value = f ? 1 : 0; };
    G.setMode = (m, enc) => { const k = m + '|' + enc; if (G.mode !== k) { G.mode = k; pipeline.outputNode = outputFor(G, m, enc); pipeline.needsUpdate = true; } };
    G.setMode('composite', encodeMode());

    // FIRST RENDER still compiles — far less than before, but MEASURED it was still one 5384ms
    // block, and only 5ms of that was inside device.createRenderPipeline (292 calls) and 5ms inside
    // createShaderModule (299). The rest is three.js building one program per RENDER OBJECT on the
    // main thread, and there is no async door into it (three.webgpu.js:85689 takes the blocking
    // branch for every call that is not compileAsync). So it is broken into chunks instead: the
    // scene is revealed a few objects at a time, at 320x180 so only the compiling costs anything
    // (a pipeline is keyed on formats, not on size, so these same pipelines serve the full-size
    // render), with the chunk size steered by a wall-clock budget and a yield between chunks.
    const BUDGET_MS = 40;
    await stage('compiling the geometry pass (1 shared material, ' + A.scene.children.length + ' scene objects)', async () => {
      grabAppFrame(G);
      const list = [];
      A.scene.traverse(o => { if (o.visible && (o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) list.push(o); });
      const wasVisible = list.map(o => o.visible);
      const t0 = performance.now();
      let chunks = 0, worst = 0;
      renderer.setSize(320, 180);
      try {
        for (const o of list) o.visible = false;
        let i = 0, n = 2;
        while (i < list.length) {
          for (let k = 0; k < n && i < list.length; k++, i++) list[i].visible = true;
          const t = performance.now();
          await renderGeom(G);
          const ms = performance.now() - t;
          chunks++; if (ms > worst) worst = ms;
          n = (ms < BUDGET_MS / 3) ? Math.min(16, n * 2) : (ms > BUDGET_MS ? Math.max(1, n >> 1) : n);   // cap 16: at 64 a chunk measured 134ms
          toast('Bounce still — preparing shaders ' + Math.round(100 * i / list.length) + '%…');
          await new Promise(r => requestAnimationFrame(() => r()));
          if (performance.now() - t0 > 60000) { for (const o of list) o.visible = true; await renderGeom(G); break; }   // give up chunking, finish it
        }
      } finally {
        for (let k = 0; k < list.length; k++) list[k].visible = wasVisible[k];
        renderer.setSize(w, h);
      }
      console.log('§GI_STILL progressive compile: ' + list.length + ' renderables in ' + chunks + ' chunks, worst chunk ' + worst.toFixed(0) + 'ms (budget ' + BUDGET_MS + 'ms)');
      await renderGeom(G);        // one full-size render so the final-size pipelines are hot too
    });
    // §GI_ORIENT_CACHE — the orientation is a fact about THIS platform (GPU + browser readback), measured at 12.7 s
    // (red1's desktop) to 52 s (headless) on every first build. Cached per adapter+browser in localStorage; a new
    // key, a failed read, or &giorient=measure measures again. Wrapped in try/catch: storage can be blocked.
    const orientKey = await (async () => { try { const d = renderer.backend && renderer.backend.device; const ai = (d && d.adapterInfo) || {};
      return [ai.vendor, ai.architecture, ai.device, ai.description, navigator.userAgent].join('|'); } catch (e) { return navigator.userAgent; } })();
    let orientHit = null;
    try { const c = JSON.parse(localStorage.getItem('giOrientCache') || 'null'); if (c && c.key === orientKey && !/[?&]giorient=measure/.test(location.search)) orientHit = c; } catch (e) {}
    if (orientHit) {
      G.setTexFlip(orientHit.flipTex); G.flipOut = orientHit.flipOut;
      console.log('§GI_ORIENT_CACHE hit flipTex=' + orientHit.flipTex + ' flipOut=' + orientHit.flipOut + ' measured=' + orientHit.when + ' (skipped the orientation check; &giorient=measure re-measures)');
    } else {
      await stage('checking orientation', () => decideOrientation(G));
      try { localStorage.setItem('giOrientCache', JSON.stringify({ key: orientKey, flipTex: G.flipTex, flipOut: G.flipOut, when: new Date().toISOString() })); } catch (e) {}
      console.log('§GI_ORIENT_CACHE stored flipTex=' + G.flipTex + ' flipOut=' + G.flipOut + ' key=' + orientKey.slice(0, 80));
    }
    if (pipeStats) console.log('§GI_STILL pipelines sync=' + pipeStats.sync + ' syncMs=' + pipeStats.syncMs.toFixed(0) +
      ' async=' + pipeStats.async + ' shaderModules=' + pipeStats.modules + ' moduleMs=' + pipeStats.moduleMs.toFixed(0) +
      ' (sync = device.createRenderPipeline, three.webgpu.js:85690 — the call the old path made several hundred times)');
    console.log('§GI_STILL geom pass mode=' + (SWAP() ? 'material-swap' : 'scene.overrideMaterial') +
      ' swapped=' + (G.swappedCount || 0) + ' hid ' + (G.hiddenCount || 0) + ' raw-GLSL/sky object(s)' +
      '; scene.overrideMaterial restored=' + (A.scene.overrideMaterial === null || A.scene.overrideMaterial === undefined));
    return G;
  }
  async function shoot(opts) {
    if (busy) return null;
    busy = true;
    if (window.APP) window.APP._sceneBorrowed = true;   // §GI_SCENE_BORROWED — app render loop holds its last frame
    opts = opts || {};
    const mode = opts.mode || 'composite';
    const t0 = performance.now();
    const A = window.APP;
    let w = Math.min(2560, window.innerWidth), h = Math.min(1440, window.innerHeight);
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
    w = Math.max(2, Math.round(w * scale) & ~1); h = Math.max(2, Math.round(h * scale) & ~1);
    const R = { mode: mode, w: w, h: h };
    try {
      toast('Bounce still — starting…');
      if (!built || built.w !== w || built.h !== h) { if (built) { try { built.renderer.dispose(); } catch (e) {} } built = await build(w, h); }
      const G = built;
      const enc = opts.encode || encodeMode();
      R.encode = enc;
      G.setMode(mode, enc);
      G.gainU.value = readGain(); G.aoU.value = readAo();
      G.recvU.value = readNum('_stillGiRecv', 'girecv', GI_RECV_DEFAULT, 0, 1);
      G.gi.radius.value = readNum('_stillGiRadius', 'girad', GI_RADIUS_DEFAULT, 0.5, 100);
      G.gi.thickness.value = readNum('_stillGiThick', 'githick', GI_THICK_DEFAULT, 0.01, 50);
      G.gi.stepCount.value = Math.round(readNum('_stillGiSteps', 'gisteps', window.__GI_STEPS || 16, 1, 32));
      G.gi.giIntensity.value = readNum('_stillGiInt', 'giint', 10, 0, 100);
      R.gain = G.gainU.value; R.ao = G.aoU.value; R.recv = G.recvU.value; R.girad = G.gi.radius.value; R.githick = G.gi.thickness.value;
      R.gisteps = G.gi.stepCount.value; R.giint = G.gi.giIntensity.value;
      console.log('§GI_STILL gain=' + G.gainU.value + ' ao=' + G.aoU.value + ' recv=' + G.recvU.value + ' applied (uniforms, read this press)' +
        ' ssgi: radius=' + G.gi.radius.value + ' (screen-space: ~' + Math.round(G.gi.radius.value * (w / 2) / 16) + 'px search at ' + w + 'px wide)' +
        ' steps=' + G.gi.stepCount.value + ' slices=' + G.gi.sliceCount.value + ' thickness=' + G.gi.thickness.value + 'm' +
        ' giIntensity=' + G.gi.giIntensity.value + ' expFactor=' + G.gi.expFactor.value + ' screenSpace=' + G.gi.useScreenSpaceSampling.value);
      const N = (opts.passes != null) ? opts.passes : (window.__GI_ACCUM || ACCUM_DEFAULT);
      // The app's finished frame, taken ONCE: it is both the colour the bounce is computed from and
      // the picture the bounce is pasted onto, so they cannot drift apart.
      R.underMean = await stage('reading the app’s finished still', async () => grabAppFrame(G));
      console.log('§GI_STILL underlay mean=' + R.underMean + ' (the app frame; it is also the colour fed to SSGI — ~0 means the app canvas handed back an empty buffer)');
      let acc = null;
      const _ps0 = G.pipeStats ? Object.assign({}, G.pipeStats) : null, _passMs = [];
      await stage('bounce passes', async () => {
        for (let i = 0; i < N; i++) {
          const _tp = performance.now();
          await renderGeom(G);
          _passMs.push(Math.round(performance.now() - _tp));
          const fb = await readRT(G);
          if (!acc) acc = Float32Array.from(fb); else for (let k = 0; k < acc.length; k++) acc[k] += fb[k];
          toast('Bounce still — pass ' + (i + 1) + ' of ' + N + '…');
          await new Promise(r => requestAnimationFrame(() => r()));   // hand the main thread back between passes
        }
        for (let k = 0; k < acc.length; k++) acc[k] /= N;
      });
      // §GI_PRESS_COST — what the bounce passes created THIS press (a kept renderer should create ~0 new pipelines).
      if (_ps0) console.log('§GI_PRESS_COST newPipelines=' + (G.pipeStats.sync - _ps0.sync) + ' (' + (G.pipeStats.syncMs - _ps0.syncMs).toFixed(0) + 'ms)' +
        ' newShaderModules=' + (G.pipeStats.modules - _ps0.modules) + ' geomPassMs=' + JSON.stringify(_passMs) + ' sceneLights=' + (function () { let n = 0; window.APP.scene.traverse(o => { if (o.isLight) n++; }); return n; })());

      // ── COMPOSITE ────────────────────────────────────────────────────────────────────────────
      // The app's own frame first (it is already in colorCanvas), then the bounce layer over it
      // through a HARD mask. §GI_STILL_DOUBLE: alpha blending is what added the bounce twice.
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const octx = out.getContext('2d', { willReadFrequently: true });
      octx.drawImage(G.colorCanvas, 0, 0);
      const appPix = octx.getImageData(0, 0, w, h).data;          // the app frame, for the measurement below
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
      const tctx = tmp.getContext('2d'); const img = tctx.createImageData(w, h);
      const d = img.data;
      // Alpha histogram of the RAW bounce layer. The "partial band" is exactly the set of pixels
      // red1 saw doubling on: partly transparent, so both pictures contributed.
      let nClear = 0, nPartial = 0, nSolid = 0;
      let pApp = 0, pBounce = 0, pBlend = 0, pHard = 0;
      const flipOut = G.flipOut;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const s = ((flipOut ? (h - 1 - y) : y) * w + x) * 4, o = (y * w + x) * 4;
        const a = acc[s + 3];
        const r = Math.max(0, Math.min(255, acc[s] * 255)), g = Math.max(0, Math.min(255, acc[s + 1] * 255)), bl = Math.max(0, Math.min(255, acc[s + 2] * 255));
        if (a < 0.02) nClear++; else if (a > 0.98) nSolid++; else {
          nPartial++;
          const la = (appPix[o] + appPix[o + 1] + appPix[o + 2]) / 3, lb = (r + g + bl) / 3;
          pApp += la; pBounce += lb; pBlend += a * lb + (1 - a) * la; pHard += (a >= GEOM_MASK_T ? lb : la);
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = bl;
        d[o + 3] = (a >= GEOM_MASK_T) ? 255 : 0;                  // HARD MASK, not alpha blending
      }
      const tot = w * h;
      R.clearPct = +(100 * nClear / tot).toFixed(2);
      R.partialPct = +(100 * nPartial / tot).toFixed(2);
      R.solidPct = +(100 * nSolid / tot).toFixed(2);
      console.log('§GI_STILL mask: clear(a<0.02)=' + R.clearPct + '%  partial(0.02..0.98)=' + R.partialPct + '%  solid(a>0.98)=' + R.solidPct + '%' +
                  ' — the partial band is where alpha blending used to add the bounce on top of itself');
      if (nPartial > 0) {
        R.partialApp = +(pApp / nPartial).toFixed(1); R.partialBounce = +(pBounce / nPartial).toFixed(1);
        R.partialBlend = +(pBlend / nPartial).toFixed(1); R.partialHard = +(pHard / nPartial).toFixed(1);
        console.log('§GI_STILL over the partial band (' + nPartial + 'px): app=' + R.partialApp + ' bounce=' + R.partialBounce +
                    ' alphaBlend=' + R.partialBlend + ' hardMask=' + R.partialHard + ' — alphaBlend-hardMask=' + (R.partialBlend - R.partialHard).toFixed(1));
      }
      tctx.putImageData(img, 0, 0);
      // Keep the un-composited bounce layer and the app frame around so a driver can measure them.
      const bounce = document.createElement('canvas'); bounce.width = w; bounce.height = h;
      bounce.getContext('2d').drawImage(tmp, 0, 0);
      octx.drawImage(tmp, 0, 0);
      const under = document.createElement('canvas'); under.width = w; under.height = h;
      under.getContext('2d').drawImage(G.colorCanvas, 0, 0);
      window.__giStillDebugCanvas = { bounce: bounce, under: under };
      // Mean luminance of the finished still against the app's own frame — blank and identical both fail.
      let sc = 0, sa = 0, sd = 0, n = 0;
      const fin = octx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < fin.length; i += 4 * 37) {
        const lc = (fin[i] + fin[i + 1] + fin[i + 2]) / 3, la = (appPix[i] + appPix[i + 1] + appPix[i + 2]) / 3;
        sc += lc; sa += la; sd += Math.abs(lc - la); n++;
      }
      R.compositeMean = +(sc / n).toFixed(2); R.appMean = +(sa / n).toFixed(2); R.meanAbsDiff = +(sd / n).toFixed(2);
      R.secs = +((performance.now() - t0) / 1000).toFixed(1);
      R.orient = G.orient || null;
      R.pipelines = G.pipeStats ? { sync: G.pipeStats.sync, syncMs: +G.pipeStats.syncMs.toFixed(0), async: G.pipeStats.async, modules: G.pipeStats.modules, moduleMs: +G.pipeStats.moduleMs.toFixed(0) } : null;
      console.log('§GI_STILL result mode=' + mode + ' encode=' + enc + ' compositeMean=' + R.compositeMean + ' appMean=' + R.appMean +
                  ' meanAbsDiff=' + R.meanAbsDiff + ' passes=' + N + ' secs=' + R.secs);
      console.log('§GI_STILL app state restored: overrideMaterial=' + String(A.scene.overrideMaterial) +
                  ' skyVisible=' + (A._sky ? A._sky.visible : 'no-sky') + ' background=' + String(A.scene.background));
      show(out, R.secs.toFixed(1), N);
      acc = null;
      window.__giStillDebug = R;
      console.log('§GI_STILL renderer kept for the next Alt+S (Alt+Shift+S releases it)');
      return R;
    } catch (e) {
      toast('Bounce still failed: ' + (e && e.message || e), 8000);
      console.warn('§GI_STILL_FAIL ' + (e && e.stack || e));
      R.error = String(e && e.message || e);
      window.__giStillDebug = R;
      return R;
    } finally { busy = false; if (window.APP) { window.APP._sceneBorrowed = false; if (window.APP.markDirty) window.APP.markDirty(); } }
  }
  function show(canvas, secs, passes) {
    const old = document.getElementById('gi-still-overlay'); if (old) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'gi-still-overlay';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column';
    const bar = document.createElement('div');
    bar.style.cssText = 'flex:0 0 auto;padding:8px 14px;background:#11141a;color:#e8eaf0;font:13px/1.5 system-ui;display:flex;gap:14px;align-items:center';
    bar.innerHTML = '<b>Bounce still</b><span>' + canvas.width + '×' + canvas.height + ' · ' + passes + ' passes · ' + secs + 's</span>';
    const save = document.createElement('button');
    save.textContent = 'Save PNG';
    save.style.cssText = 'margin-left:auto;padding:6px 14px;border-radius:6px;border:1px solid #3a4150;background:#1d2230;color:#e8eaf0;cursor:pointer';
    save.onclick = () => canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'bounce_still_' + Date.now() + '.png'; a.click(); });
    const close = document.createElement('button');
    close.textContent = 'Close (Esc)';
    close.style.cssText = save.style.cssText + ';margin-left:8px';
    close.onclick = () => wrap.remove();
    bar.appendChild(save); bar.appendChild(close);
    canvas.style.cssText = 'flex:1 1 auto;min-height:0;object-fit:contain;width:100%;height:100%';
    wrap.appendChild(bar); wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    const esc = (e) => { if (e.key === 'Escape') { wrap.remove(); window.removeEventListener('keydown', esc, true); } };
    window.addEventListener('keydown', esc, true);
    toast('Bounce still ready — ' + passes + ' passes in ' + secs + 's', 4000);
  }
  // ALT+S IS NOT INTERCEPTED (red1: "alt-s must be like original, not impacted.. just with the new
  // bounce is what i expect"). Let the key through, wait for the app's still to finish refining
  // (A._stillRefineActive true, A._stillRefineBusy false), then add the bounce on top of it.
  async function waitForStill(maxMs) {
    // §STILL_STATUS_FIRST: the app now paints its status and starts staging a frame AFTER the keypress,
    // so the synchronous staging (~5 s desktop, ~90 s headless) runs inside this wait. The budget counts
    // from when the still is actually active, as it did when staging ran before this handler.
    const A = window.APP; let t0 = performance.now(), seenActive = false;
    while (performance.now() - t0 < maxMs) {
      if (!seenActive && A._stillRefineActive) { seenActive = true; t0 = performance.now(); }
      if (A._stillRefineActive && !A._stillRefineBusy) {
        await new Promise(r => setTimeout(r, 600));            // let the last refinement land
        if (A._stillRefineActive && !A._stillRefineBusy) return true;
      }
      if (!A._stillRefineActive && performance.now() - t0 > 4000) return false;   // toggled off again
      await new Promise(r => setTimeout(r, 250));
    }
    return A._stillRefineActive && !A._stillRefineBusy;
  }
  // §GI_LIVE — the bounce needs a desktop GPU with WebGPU and the app's three.js at r186. Decided at the
  // keypress (window.THREE loads asynchronously), logged once, and never a toast: where it cannot run,
  // Alt+S is exactly the app's own still.
  let offLogged = false;
  function giSupported() {
    const T = window.THREE;
    let reason = null;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) reason = 'touch-device';
    else if (!navigator.gpu) reason = 'no-webgpu';
    else if (!(T && T.REVISION === '186' && T.WebGPURenderer)) reason = 'three-r' + (T && T.REVISION);
    if (reason && !offLogged) { offLogged = true; console.log('§GI_STILL_OFF reason=' + reason + ' — Alt+S keeps the app\'s own still, no bounce'); }
    return !reason;
  }
  window.addEventListener('keydown', function (e) {
    if (!(e.altKey && (e.key === 's' || e.key === 'S'))) return;
    if (e.shiftKey) return;
    if (busy) return;
    if (!giSupported()) return;              // §GI_LIVE gate: phones / no WebGPU / not r186 keep today's Alt+S
    const A = window.APP;
    // §STILL_GUARD — the app refuses this press (model not solid): no bounce, no second toast.
    if ((A._stillGuardRefusedAt && performance.now() - A._stillGuardRefusedAt < 1000) ||
        (typeof A._stillGuardReasons === 'function' && A._stillGuardReasons().length)) return;   // handler order is not guaranteed
    if (A._stillRefineActive) return;        // this press is the app's own toggle-OFF; leave it alone
    setTimeout(async () => {
      toast('Alt+S still — waiting for the app to finish refining, then adding bounce…');
      const ok = await waitForStill(120000);
      if (!ok) { toast('Still was cancelled — no bounce pass', 3000); return; }
      shoot();
    }, 0);
  }, false);     // NOT capture: the app's own handler runs first and does its normal work
  window.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      if (built) { try { built.rt.dispose(); built.renderer.dispose(); } catch (err) {} built = null; toast('Bounce renderer released', 2500); console.log('§GI_STILL released on request'); }
      else toast('Nothing to release', 2000);
    }
  }, true);
  window.__giStillShoot = shoot;
  window.__giStillRelease = function () { if (built) { try { built.rt.dispose(); built.renderer.dispose(); } catch (e) {} built = null; console.log('§GI_STILL released on request'); return true; } return false; };
  // §GI_STILL_DOUBLE WITNESS — renders the SAME geometry pass with only the partly-transparent
  // (glazed) meshes left visible, so the glazing gets a real measured mask instead of a rectangle
  // drawn by eye. Returns per-region means for the app frame, the bounce layer and the finished
  // composite, plus what the OLD alpha-blended paste would have produced at the app's own glass
  // opacity. Read-only apart from `visible`, which is put back in `finally`.
  window.__giStillGlassMask = async function () {
    if (!built) return { err: 'no renderer built — take a shot first' };
    const G = built, A = window.APP, s = A.scene, w = G.w, h = G.h;
    const hidden = []; const opac = [];
    try {
      s.traverse(o => {
        if (!o.visible) return;
        if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const glass = !!(m && m.transparent === true && m.opacity < 1);
        if (glass) opac.push(+m.opacity.toFixed(3)); else { o.visible = false; hidden.push(o); }
      });
      await renderGeom(G);
    } finally { for (const o of hidden) o.visible = true; }
    const fbRaw = await readRT(G);
    const fb = new Float32Array(fbRaw.length);
    for (let y = 0; y < h; y++) {                       // same row order as the composite
      const sy = G.flipOut ? (h - 1 - y) : y;
      fb.set(fbRaw.subarray(sy * w * 4, (sy + 1) * w * 4), y * w * 4);
    }
    const ov = document.getElementById('gi-still-overlay'), comp = ov && ov.querySelector('canvas');
    const dbg = window.__giStillDebugCanvas || {};
    if (!comp || !dbg.bounce || !dbg.under) return { err: 'no composite/bounce/under canvases yet' };
    const gc = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const C = gc(comp), B = gc(dbg.bounce), U = gc(dbg.under);
    const alphaMean = opac.length ? +(opac.reduce((x, y) => x + y, 0) / opac.length).toFixed(3) : 1;
    const R = { glassMeshes: opac.length, glassOpacityMean: alphaMean, glassOpacityMin: opac.length ? Math.min.apply(null, opac) : null, glassOpacityMax: opac.length ? Math.max.apply(null, opac) : null };
    const acc = { glass: [0, 0, 0, 0, 0], opaque: [0, 0, 0, 0, 0] };
    for (let i = 0; i < w * h; i++) {
      const k = i * 4;
      const isGlass = fb[k + 3] > 0.5;
      const bAlpha = B[k + 3] > 127;
      if (!bAlpha) continue;                                   // only where the bounce layer drew
      const g = acc[isGlass ? 'glass' : 'opaque'];
      const lu = (U[k] + U[k + 1] + U[k + 2]) / 3, lb = (B[k] + B[k + 1] + B[k + 2]) / 3, lc = (C[k] + C[k + 1] + C[k + 2]) / 3;
      // the OLD paste blended at the SOURCE MATERIAL's alpha: the measured glass opacity on glazing,
      // 1 on everything opaque. That asymmetry is the defect — same picture, two different strengths.
      const a = isGlass ? alphaMean : 1;
      g[0]++; g[1] += lu; g[2] += lb; g[3] += lc; g[4] += a * lb + (1 - a) * lu;
    }
    for (const key of ['glass', 'opaque']) {
      const g = acc[key], n = Math.max(1, g[0]);
      R[key] = { px: g[0], app: +(g[1] / n).toFixed(2), bounce: +(g[2] / n).toFixed(2), composite: +(g[3] / n).toFixed(2), oldAlphaBlend: +(g[4] / n).toFixed(2) };
      R[key].compositeMinusBounce = +(R[key].composite - R[key].bounce).toFixed(2);
      R[key].oldBlendMinusBounce = +(R[key].oldAlphaBlend - R[key].bounce).toFixed(2);
      R[key].shadingApplied = +((R[key].composite / Math.max(1e-6, R[key].app) - 1) * 100).toFixed(1);
      R[key].oldShadingApplied = +((R[key].oldAlphaBlend / Math.max(1e-6, R[key].app) - 1) * 100).toFixed(1);
    }
    console.log('§GI_STILL glass witness ' + JSON.stringify(R));
    return R;
  };
  console.log('§GI_STILL ready — Alt+S renders a bounce still (r186 WebGPU SSGI, ' + ACCUM_DEFAULT + ' passes, geometry-pass build)');
})();
