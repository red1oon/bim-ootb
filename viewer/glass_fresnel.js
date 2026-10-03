// ══ §GLASS_FRESNEL — physically weighted glass in Alt+S (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§GLASS_FRESNEL
// spec") ══ red1: "reflection has to follow the physics: a lit surface reflects well." Plain opacity scaled the
// reflection down with the body (weak even at grazing) and lit a grey body like a wall. Here the reflection runs at full
// strength — three's own specular (Schlick-weighted env radiance + sun highlight), so its brightness follows what is
// reflected — and the glass hides what is behind it only as much as it reflects: alpha = Schlick F (f0 0.04), plus a
// near-invisible body GLASS_BODY. Blending is premultiplied (ONE, ONE_MINUS_SRC_ALPHA) without scaling the rgb, so the
// reflection is added, not faded. No strength dial: &fresnel=0 turns it off for comparison. Glass materials only; nav
// and films untouched; restored at teardown.
(function (global) {
  var F0 = 0.04, GLASS_BODY = 0.08;   // 0.08 = red1's near-clear pane start value (glass ruling, 2026-09-24)

  function isGlass(m) {
    return m && m.transparent && m.opacity < 0.95 && !m.map && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
  }

  // §GLASS_FRESNEL_SCOPE (watcher, 2026-09-24): glazing ONLY. The authored transparent materials are shared with
  // mullions (IfcMember) and unknown-class batches; patching them in place faded the mullions to ~4%. So each glazing
  // mesh (GLAZE_CLASSES, plus R10 window panes) gets a CLONE of its glass material, created and patched ONCE per
  // original (kept across presses, so its program compiles once); everything else keeps the stock material.
  var GLAZE_CLASSES = { IfcWindow: 1, IfcPlate: 1 };
  // §GLASS_BATCHED (2026-09-26, red1 "Clinic from outside glasses still black"; state at …385774229: 40 of 80 glass hits were
  // STOCK glass — untagged batched buckets, skipped here as '?'). Batch buckets are class-pure since §BATCH_BUCKET_CLASS_PAINT,
  // so an untagged mesh's class is read from its members (A.guidMap "<id>[_<i>]" -> guid -> elements_meta.ifc_class): all
  // glazing -> it is glazing. Mixed or unknown members stay skipped (the mullion rule above).
  var memberCls = new Map();
  function classOfMembers(A, o) {
    if (memberCls.has(o.id)) return memberCls.get(o.id);
    var g = [], pre = o.id + '_'; for (var k in A.guidMap) { if (k === String(o.id) || k.indexOf(pre) === 0) g.push(A.guidMap[k]); }
    var cls = null;
    if (g.length && A.dbQuery) { var set = {}, n = 0;
      for (var i = 0; i < g.length; i += 400) { var part = g.slice(i, i + 400).map(function (x) { return "'" + String(x).replace(/'/g, "''") + "'"; }).join(',');
        A.dbQuery('SELECT DISTINCT ifc_class FROM elements_meta WHERE guid IN (' + part + ')').forEach(function (r) { if (!set[r[0]]) { set[r[0]] = 1; n++; } }); }
      var ks = Object.keys(set); cls = (ks.length === 1) ? ks[0] : (ks.length ? 'mixed:' + ks.join('+') : null); }
    memberCls.set(o.id, cls); return cls;
  }
  var swaps = [], r10Arr = new Map();
  // §GLASS_PLANAR_REFL shared uniforms (every clone reads the same K planes; uGfK = 0 = today's cube path everywhere)
  var PK_MAX = 6, PCOLS = 3, PROWS = 2, PLANE_TOL = 0.10, PLANE_COS = Math.cos(2 * Math.PI / 180);
  var PU = { uGfK: { value: 0 }, uGfPl: { value: [] }, uGfTex: { value: [] }, uGfAtlas: { value: null } };
  function ensurePU(THREE) { if (PU.uGfPl.value.length) return; for (var i = 0; i < PK_MAX; i++) { PU.uGfPl.value.push(new THREE.Vector4()); PU.uGfTex.value.push(new THREE.Matrix4()); } }
  // §GLASS_PLANAR_REFL P3 (shared by the glazing clones and the §MIRROR_OWN_MAT mirrors): on a mirrored plane the IBL radiance := the plane's
  // mirror render (lit, blockers included, no sky gate). Must run BEFORE any caller expands #include <lights_fragment_maps>.
  function gfPatchShader(sh) {
      if (global.THREE) ensurePU(global.THREE);
      sh.uniforms.uGfK = PU.uGfK; sh.uniforms.uGfPl = PU.uGfPl; sh.uniforms.uGfTex = PU.uGfTex; sh.uniforms.uGfAtlas = PU.uGfAtlas;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform int uGfK; uniform vec4 uGfPl[ ' + PK_MAX + ' ]; uniform mat4 uGfTex[ ' + PK_MAX + ' ]; uniform sampler2D uGfAtlas;\nvoid main() {')
        .replace('#include <lights_fragment_maps>', ['#include <lights_fragment_maps>',
          '#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )',
          '  for ( int gk = 0; gk < ' + PK_MAX + '; gk ++ ) { if ( gk >= uGfK ) break;',
          '    if ( abs( dot( uGfPl[ gk ].xyz, geometryPosition ) + uGfPl[ gk ].w ) > ' + PLANE_TOL.toFixed(3) + ' ) continue;',
          '    vec4 gq = uGfTex[ gk ] * vec4( geometryPosition, 1.0 ); if ( gq.w <= 0.0 ) continue; vec2 guv = gq.xy / gq.w;',
          '    if ( any( lessThan( guv, vec2( 0.0 ) ) ) || any( greaterThan( guv, vec2( 1.0 ) ) ) ) continue;',
          '    vec2 gt = vec2( float( gk - ( gk / ' + PCOLS + ' ) * ' + PCOLS + ' ), float( gk / ' + PCOLS + ' ) );',
          '    radiance = texture2D( uGfAtlas, ( gt + clamp( guv, vec2( 0.002 ), vec2( 0.998 ) ) ) / vec2( ' + PCOLS + '.0, ' + PROWS + '.0 ) ).rgb; break; }',
          '#endif'].join('\n'));
  }
  function patchedClone(THREE, orig) {
    if (orig.userData.gfClone) return orig.userData.gfClone;
    ensurePU(THREE); var c = orig.clone(); c.userData = { gfOf: orig.uuid };
    var origKey = c.customProgramCacheKey;
    c.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', [
        '{',
        '  float gfNV = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );',
        '  float gfF = ' + F0.toFixed(3) + ' + ' + (1 - F0).toFixed(3) + ' * pow( 1.0 - gfNV, 5.0 );',
        '  gl_FragColor = vec4( totalDiffuse * ' + GLASS_BODY.toFixed(3) + ' + totalSpecular + totalEmissiveRadiance, max( gfF, ' + GLASS_BODY.toFixed(3) + ' ) );',
        '}'].join('\n'));
      gfPatchShader(sh);
    };
    c.customProgramCacheKey = function () { return 'glassFresnelClone2'; };
    c.blending = THREE.CustomBlending; c.blendSrc = THREE.OneFactor; c.blendDst = THREE.OneMinusSrcAlphaFactor;
    c.blendSrcAlpha = THREE.OneFactor; c.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    c.depthWrite = false;   // clear glass must not hide what is behind it from later transparent draws
    orig.userData.gfClone = c;
    return c;
  }

  function stage(A) {
    var THREE = global.THREE; if (!THREE || !A || !A.scene) return;
    unstage(A);
    var m0 = /[?&]fresnel=([0-9.]+)/.exec(location.search), on = (typeof A._stillFresnel === 'number') ? A._stillFresnel > 0 : (m0 ? parseFloat(m0[1]) > 0 : true);   // default ON after the clean gated sheet (witness_glass_fresnel.js, 2026-09-24)
    if (!on) { console.log('§GLASS_FRESNEL off (&fresnel=0 or default)'); return; }
    var patched = {}, skipped = {}, clones = new Set(), fresh = 0;
    A.scene.traverse(function (o) {
      if (!o.visible || !o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
      var cls = (o.userData && o.userData.ifcClass) || '?';
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some(isGlass)) return;
      var r10 = !!(o.material && o.material.isR10MaterialArray);
      if (cls === '?') { var mc = classOfMembers(A, o); if (mc && GLAZE_CLASSES[mc] && !Array.isArray(o.material)) cls = mc + '(members)'; }
      var glazing = GLAZE_CLASSES[cls] || /\(members\)$/.test(cls) || r10;
      if (!glazing || (o.isBatchedMesh && !/\(members\)$/.test(cls))) { skipped[cls] = (skipped[cls] || 0) + 1; return; }
      var before = clones.size;
      if (Array.isArray(o.material)) {
        var arr = o.material, rep = r10Arr.get(arr);
        if (!rep) {
          // R10 arrays forward `map` (the texture) to arr[0]: never arr.map
          var list = Array.prototype.map.call(arr, function (m) { if (isGlass(m)) { var had = !!m.userData.gfClone, c = patchedClone(THREE, m); if (!had) fresh++; clones.add(c); return c; } return m; });
          rep = (r10 && A._r10MatArray) ? A._r10MatArray(list) : list; r10Arr.set(arr, rep);
        } else rep.forEach(function (m) { if (m.userData && m.userData.gfOf) clones.add(m); });
        swaps.push([o, arr]); o.material = rep;
      } else {
        var had2 = !!o.material.userData.gfClone, c2 = patchedClone(THREE, o.material); if (!had2) fresh++; clones.add(c2);
        swaps.push([o, o.material]); o.material = c2;
      }
      var k = r10 ? 'IfcWindow(R10 pane)' : cls; patched[k] = (patched[k] || 0) + 1;
    });
    if (A.markDirty) A.markDirty();
    console.log('§GLASS_FRESNEL patched=' + JSON.stringify(patched) + ' skippedShared=' + JSON.stringify(skipped) + ' clones=' + clones.size +
      ' newClones=' + fresh + ' f0=' + F0 + ' body=' + GLASS_BODY + ' (glazing meshes only; alpha = Schlick F; reflection = full-strength specular, premultiplied add)');
  }

  // ══ §GLASS_ENV (red1 2026-09-26: "can the glass reflects?" -> "Agree"). The clones reflected the sky HDRI only, so a facade
  // pane showed ~4% of sky (F0 0.04 face-on) and none of the sunlit ground or facades opposite — what real daytime windows mostly
  // mirror. Once per still, after staging (lights final), one cube capture of the STAGED scene from the camera position (6 renders,
  // HalfFloat, linear radiance, glass meshes hidden so a pane never reflects itself) becomes the clones' envMap (three's PMREM
  // prefilters it for roughness). Fresnel, the §GLASS_SPEC_GATE and the premultiplied blend are unchanged: it only changes WHAT is
  // reflected. Alt+S only; &glassenv=0 = the sky HDRI as before.
  var capRT = null, capCam = null, CAP_SIZE = 256, pmremGen = null, pmremRT = null, captureN = 0;
  function liveClones() { var set = new Set(); swaps.forEach(function (s) { var m = s[0].material, ms = Array.isArray(m) ? m : [m]; ms.forEach(function (x) { if (x && x.userData && x.userData.gfOf) set.add(x); }); }); return set; }
  function capture(A) {
    var THREE = global.THREE; var mirM = A && A._mirrorOwnMats || []; if (!THREE || !A || !A.renderer || !A.scene || !A.camera || (!swaps.length && !mirM.length)) return null;   // §MIRROR_OWN_MAT: mirrors take the capture too
    if (A._stillGlassEnv === false || /[?&]glassenv=0/.test(location.search)) { console.log('§GLASS_ENV off (&glassenv=0) — panes reflect the sky HDRI'); return null; }
    var t0 = performance.now(), R = A.renderer;
    if (!capRT) { capRT = new THREE.WebGLCubeRenderTarget(CAP_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); capCam = new THREE.CubeCamera(0.05, 5000, capRT); }
    var hidden = [];
    A.scene.traverse(function (o) { if (!o.visible || !o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return; var ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some(function (m) { return m && ((m.userData && (m.userData.gfOf || m.userData.slMirror)) || isGlass(m)); })) { o.visible = false; hidden.push(o); } });
    capCam.position.copy(A.camera.position); capCam.layers.mask = A.camera.layers.mask; A.scene.add(capCam); capCam.updateMatrixWorld(true);
    var prevRT = R.getRenderTarget();
    // ### ALTS-ALL FIX 14 (F11, first-press black glass): the cube faces are a render-target variant the scene has not drawn before on a
    // page's first still; a material served a NEW program key gets a fresh uniforms object carrying the §SOURCED_LIGHT dummy textures
    // (### ALTS-ALL FIX 1 class), and the staged scene's onBeforeRender re-pushes it only before the NEXT face — so the faces that first
    // drew it hold garbage (MEASURED Terminal tr4 press 1: the clones rendered NaN at 1208 float-probe pixels, envMapIntensity 0 did not
    // clear it = NaN in the env; a second capture cleared it: 0). Rule: capture again while any scene material's uniforms object changed
    // during the capture (max 3 passes; a later press with every key bound = 1 pass, cost unchanged).
    var props = R.properties, snap = function () { var m = new Map(); A.scene.traverse(function (o) { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (x) { if (x && !m.has(x)) { var pp = props.get(x); m.set(x, pp && pp.uniforms); } }); }); return m; };
    var passes = 0, rekeyed = [], csmOC = A._stillShadowWide ? A._stillShadowWide(true) : false;
    try { for (passes = 1; passes <= 3; passes++) { var s0 = snap(); capCam.update(R, A.scene); var ch = 0; s0.forEach(function (u, x) { var pp = props.get(x); if (pp && pp.uniforms !== u) ch++; }); rekeyed.push(ch); if (!ch) break; } }
    finally { if (csmOC) A._stillShadowWide(false); R.setRenderTarget(prevRT); A.scene.remove(capCam); hidden.forEach(function (o) { o.visible = true; }); }
    if (passes > 3) passes = 3;
    // ### ALTS-ALL FIX 14 diagnostic: non-finite texels per face (HalfFloat: exponent bits all 1 = Inf/NaN), read after the passes
    var nf = [], capLum = 0, capN = 0; try { var n0 = CAP_SIZE, hb = new Uint16Array(n0 * n0 * 4), h2f = function (h) { var e = (h >> 10) & 31, m = h & 1023; return e === 31 ? NaN : (e ? (1 + m / 1024) * Math.pow(2, e - 15) : m / 1024 * Math.pow(2, -14)) * (h & 0x8000 ? -1 : 1); };
      for (var f = 0; f < 6; f++) { R.readRenderTargetPixels(capRT, 0, 0, n0, n0, hb, f); var bad = 0, inf = 0; for (var i = 0; i < hb.length; i++) { if ((i & 3) === 3) continue; if ((hb[i] & 0x7c00) === 0x7c00) { bad++; if (!(hb[i] & 0x03ff)) inf++; } }
        for (var j = 0; j < hb.length; j += 4 * 17) { var lj = 0.2126 * h2f(hb[j]) + 0.7152 * h2f(hb[j + 1]) + 0.0722 * h2f(hb[j + 2]); if (isFinite(lj)) { capLum += lj; capN++; } }
        nf.push(bad + (inf ? '(inf' + inf + ')' : '')); } R.setRenderTarget(prevRT); } catch (eNF) { nf = ['err ' + eNF.message]; }
    captureN++;
    // ### ALTS-ALL FIX 14: prefilter the capture HERE, at top level, with an explicit PMREMGenerator (was: needsPMREMUpdate, which three
    // services lazily from inside the first scene render that meets the clone — on a page's first still that is a nested render
    // (the meter's prime) and the first-time PMREM target allocation there produced NaN at every glass fragment: MEASURED Terminal tr4
    // press 1 = 1208 NaN float-probe pixels on the clones, envMapIntensity 0 still NaN (NaN x 0), a second capture (target already
    // allocated) = 0; presses 2+ = 0). The clones take the prefiltered CubeUV texture directly (no lazy conversion left).
    var tP = performance.now();
    if (!pmremGen) pmremGen = new THREE.PMREMGenerator(R);
    pmremRT = pmremGen.fromCubemap(capRT.texture, pmremRT); R.setRenderTarget(prevRT);
    var pmMs = Math.round(performance.now() - tP);
    var n = 0; liveClones().forEach(function (c) { if (c.envMap !== pmremRT.texture) { c.envMap = pmremRT.texture; c.needsUpdate = true; } n++; });
    mirM.forEach(function (c) { if (c.envMap !== pmremRT.texture) { c.envMap = pmremRT.texture; c.needsUpdate = true; } });
    // §MIRROR_PARALLAX: the capture room's box = per axis (+-x/+-y/+-z) the FARTHEST opaque hit of a 9-ray fan (+-15 deg) from the capture
    // point, capped 40 m (a sink / toilet / rail stops some rays, the wall behind it stops the rest). MEASURED v1: the zone-grid walk gave
    // 0.30 m on 5 of 6 axes (the camera sits among fattened wall cells in a 1.x m toilet) -> real geometry, not the grid. Mirrors / glass skipped.
    if (mirM.length) { var cp = A.camera.position, bx = null;
      try { var tg = [], rcB = new THREE.Raycaster(); A.scene.traverse(function (o) { if (!o.visible || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || o === A._sky) return; var ms = Array.isArray(o.material) ? o.material : [o.material];
          if (ms.some(function (m) { return m && ((m.userData && (m.userData.slMirror || m.userData.gfOf)) || isGlass(m) || m.isMeshBasicMaterial); })) return; tg.push(o); });
        var ext = [], AXS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], sp = Math.tan(15 * Math.PI / 180);
        AXS.forEach(function (e) { var u = Math.abs(e[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0], w = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]], far = 0;
          for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) { var d = new THREE.Vector3(e[0] + sp * (i * u[0] + j * w[0]), e[1] + sp * (i * u[1] + j * w[1]), e[2] + sp * (i * u[2] + j * w[2])).normalize();
            rcB.set(cp, d); rcB.far = 40; var h = rcB.intersectObjects(tg, false)[0], along = h ? h.distance * (d.x * e[0] + d.y * e[1] + d.z * e[2]) : 40; if (along > far) far = along; }
          ext.push(Math.max(0.3, far)); });
        bx = { min: [cp.x - ext[1], cp.y - ext[3], cp.z - ext[5]], max: [cp.x + ext[0], cp.y + ext[2], cp.z + ext[4]], ext: ext, targets: tg.length }; } catch (eB) { console.warn('§MIRROR_PARALLAX box failed: ' + eB.message); }
      mirM.forEach(function (c) { var U = c.userData.mirU; if (!U) return; U.uMirCapPos.value.copy(cp); if (bx) { U.uMirBoxMin.value.fromArray(bx.min); U.uMirBoxMax.value.fromArray(bx.max); U.uMirBoxOn.value = 1; } else U.uMirBoxOn.value = 0; });
      console.log('§MIRROR_PARALLAX ' + (bx ? 'on box ext[+x,-x,+y,-y,+z,-z]=[' + bx.ext.map(function (v) { return v.toFixed(2); }).join(',') + '] m targets=' + bx.targets : 'off (box failed)') + ' capPos=[' + cp.toArray().map(function (v) { return v.toFixed(2); }).join(',') + ']'); }
    console.log('§MIRROR_OWN_MAT envFromCapture mats=' + mirM.length + ' capture#' + (captureN));
    if (A.markDirty) A.markDirty();
    var line = '§GLASS_ENV captured ' + CAP_SIZE + 'x6 at camera [' + A.camera.position.toArray().map(function (v) { return v.toFixed(2); }).join(',') + '] glassMeshesHidden=' + hidden.length + ' clonesReflecting=' + n + ' passes=' + passes + ' rekeyedPerPass=[' + rekeyed.join(',') + ']' + ' nonFinitePerFace=[' + nf.join(',') + '] pmrem=explicit ' + pmMs + 'ms' + ' capture#' + captureN + ' capMeanL=' + (capN ? (capLum / capN).toExponential(3) : 'n/a') + ' exposureAtCapture=' + (R.toneMappingExposure != null ? R.toneMappingExposure.toFixed(4) : '?') + ' toneMapping=' + R.toneMapping + ' clonesEnvInt=[' + Array.from(liveClones()).map(function (c) { return c.envMapIntensity; }).join(',') + ']' + ' ms=' + Math.round(performance.now() - t0);
    console.log(line); return { clones: n, hidden: hidden.length, ms: Math.round(performance.now() - t0) };
  }

  // ══ §GLASS_PLANAR_REFL (red1 2026-10-03 GO; spec v2 in bim-compiler prompts/PHOTOREAL_STILL_RENDER.md). §GLASS_ENV's cube is centred on
  // the EYE, so a pane looks up its reflected direction from the wrong point (parallax): a wing beside the pane reads as the sky behind
  // the eye, and slMirK then scales it down. A flat pane is a plane mirror: per plane, render the scene from the mirrored eye (oblique
  // near plane at the glass) into one tile of an atlas; the clone shader reads its tile instead of the cube (P3 above). Alt+S only,
  // after capture(); &planarrefl=0 = today; &planark=N (<= 6). §GLASS_REFL_TRUTH (&refltruth=1) checks the tiles against raycasts.
  var atlasRT = null, distRT = null, mirCam = null, lastPlanes = [];
  function planesOf(A, THREE) {
    var cam = A.camera, C = cam.position, vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    var pa = new THREE.Vector4(), pb = new THREE.Vector4(), pc = new THREE.Vector4(), M = new THREE.Matrix4(), IM = new THREE.Matrix4();
    var bins = new Map(), tris = 0, batchedSkipped = 0, batchedInst = 0, mirrorMeshes = 0, seen = new Set();
    function proj(v, o) { o.set(v.x, v.y, v.z, 1).applyMatrix4(vp); return o.w > 1e-3; }
    function tri(o, M) {
      a.applyMatrix4(M); b.applyMatrix4(M); c.applyMatrix4(M); e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2); var area = n.length() / 2; if (area < 1e-6) return;
      n.normalize(); if (n.dot(e1.subVectors(C, a)) < 0) n.negate(); var d = -n.dot(a); tris++;
      var scr = 0; if (proj(a, pa) && proj(b, pb) && proj(c, pc)) { var ax = pa.x / pa.w, ay = pa.y / pa.w, bx = pb.x / pb.w, by = pb.y / pb.w, cx = pc.x / pc.w, cy = pc.y / pc.w;
        if (Math.max(ax, bx, cx) > -1 && Math.min(ax, bx, cx) < 1 && Math.max(ay, by, cy) > -1 && Math.min(ay, by, cy) < 1) scr = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2; }
      var key = Math.round(n.x * 60) + ',' + Math.round(n.y * 60) + ',' + Math.round(n.z * 60) + ',' + Math.round(d / PLANE_TOL), P = bins.get(key);
      if (!P) { P = { n: [0, 0, 0], d: 0, w: 0, area: 0, scr: 0, tris: 0, dOut: Infinity }; bins.set(key, P); }
      P.n[0] += n.x * area; P.n[1] += n.y * area; P.n[2] += n.z * area; P.d += d * area; P.w += area; P.area += area; P.scr += scr; P.tris++; if (d < P.dOut) P.dOut = d;   // n faces the eye: the smallest d = the pane's eye-side (outer) face
    }
    var src = swaps.map(function (s) { return s[0]; }); A.scene.traverse(function (o) { if (!o.visible || !o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return; var ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.some(function (m) { return m && m.userData && m.userData.slMirror; })) { src.push(o); mirrorMeshes++; } });
    src.forEach(function (o) { if (seen.has(o)) return; seen.add(o); var g = o.geometry, pos = g && g.attributes && g.attributes.position; if (!pos) return;
      if (o.isBatchedMesh) {   // per active+visible instance: its geometry's index range (BatchedMesh stores indices already offset by vertexStart)
        if (!o.getGeometryRangeAt || !o._instanceInfo) { batchedSkipped++; return; } o.updateMatrixWorld(true); var rg = {}, idxB = g.index;
        for (var bi = 0; bi < o._instanceInfo.length; bi++) { var inf = o._instanceInfo[bi]; if (!inf || inf.active === false || inf.visible === false) continue;
          o.getMatrixAt(bi, IM); M.multiplyMatrices(o.matrixWorld, IM); o.getGeometryRangeAt(o.getGeometryIdAt(bi), rg); batchedInst++;
          for (var bt = 0; bt + 2 < rg.count; bt += 3) { var j0 = rg.start + bt, b0 = idxB ? idxB.getX(j0) : j0, b1 = idxB ? idxB.getX(j0 + 1) : j0 + 1, b2 = idxB ? idxB.getX(j0 + 2) : j0 + 2;
            a.fromBufferAttribute(pos, b0); b.fromBufferAttribute(pos, b1); c.fromBufferAttribute(pos, b2); tri(o, M); } }
        return; }
      var idx = g.index, nt = idx ? idx.count / 3 : pos.count / 3, inst = o.isInstancedMesh ? o.count : 1; o.updateMatrixWorld(true);
      for (var ii = 0; ii < inst; ii++) { if (o.isInstancedMesh) { o.getMatrixAt(ii, IM); M.multiplyMatrices(o.matrixWorld, IM); } else M.copy(o.matrixWorld);
        for (var t = 0; t < nt; t++) { var i0 = idx ? idx.getX(3 * t) : 3 * t, i1 = idx ? idx.getX(3 * t + 1) : 3 * t + 1, i2 = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
          a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2); tri(o, M); } } });
    // merge neighbouring bins (a plane split across a quantisation edge) greedily, largest first
    var list = Array.from(bins.values()).map(function (P) { var l = Math.hypot(P.n[0], P.n[1], P.n[2]) || 1; return { n: [P.n[0] / l, P.n[1] / l, P.n[2] / l], d: P.d / P.w, dOut: P.dOut, area: P.area, scr: P.scr, tris: P.tris }; });
    list.sort(function (x, y) { return y.area - x.area; }); var out = [];
    list.forEach(function (P) { for (var i = 0; i < out.length; i++) { var Q = out[i]; if (P.n[0] * Q.n[0] + P.n[1] * Q.n[1] + P.n[2] * Q.n[2] > PLANE_COS && Math.abs(P.d - Q.d) < PLANE_TOL) { Q.area += P.area; Q.scr += P.scr; Q.tris += P.tris; if (P.dOut < Q.dOut) Q.dOut = P.dOut; return; } } out.push(P); });
    return { planes: out, tris: tris, batchedSkipped: batchedSkipped, batchedInst: batchedInst, mirrorMeshes: mirrorMeshes, meshes: seen.size };
  }
  // three Reflector construction + Lengyel oblique near plane; returns the world->uv texture matrix (bias x P x V)
  function mirrorCam(THREE, cam, P) {
    var N = new THREE.Vector3().fromArray(P.n), C = cam.position, dM = (P.dOut != null && isFinite(P.dOut)) ? P.dOut : P.d, X = N.clone().multiplyScalar(-dM - N.dot(C)).add(C);   // X = eye projected onto the plane
    var R = new THREE.Matrix4().extractRotation(cam.matrixWorld), view = new THREE.Vector3().subVectors(X, C).reflect(N).negate().add(X);
    var look = new THREE.Vector3(0, 0, -1).applyMatrix4(R).add(C), target = new THREE.Vector3().subVectors(X, look).reflect(N).negate().add(X);
    if (!mirCam) mirCam = new THREE.PerspectiveCamera();
    mirCam.position.copy(view); mirCam.up.set(0, 1, 0).applyMatrix4(R).reflect(N); mirCam.lookAt(target); mirCam.layers.mask = cam.layers.mask;
    mirCam.near = cam.near; mirCam.far = cam.far; mirCam.updateMatrixWorld(true); mirCam.projectionMatrix.copy(cam.projectionMatrix);
    var T = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirCam.projectionMatrix).multiply(mirCam.matrixWorldInverse);
    var pl = new THREE.Plane().setFromNormalAndCoplanarPoint(N, X).applyMatrix4(mirCam.matrixWorldInverse), cp = new THREE.Vector4(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant), e = mirCam.projectionMatrix.elements;
    var q = new THREE.Vector4((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]); cp.multiplyScalar(2 / cp.dot(q));
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1 - 0.003; e[14] = cp.w; mirCam.projectionMatrixInverse.copy(mirCam.projectionMatrix).invert();
    return T;
  }
  function planar(A) {
    var THREE = global.THREE; PU.uGfK.value = 0;
    if (!THREE || !A || !A.renderer || !A.camera || (!swaps.length && !(A._mirrorOwnMats && A._mirrorOwnMats.length))) return null;
    var mk = /[?&]planarrefl=([0-9.]+)/.exec(location.search); if (mk && !(parseFloat(mk[1]) > 0)) { console.log('§GLASS_PLANAR off (&planarrefl=0) — panes keep the eye-centred cube'); lastPlanes = []; if (/[?&]refltruth=1/.test(location.search)) { try { truth(A, THREE); } catch (eT0) { console.warn('§GLASS_REFL_TRUTH failed: ' + eT0.message); } } return null; }
    var R = A.renderer, cam = A.camera, cap = R.capabilities || {};
    if (cap.logarithmicDepthBuffer || cap.reversedDepthBuffer) { console.log('§GLASS_PLANAR off (log/reversed depth: oblique near plane not valid)'); return null; }
    var t0 = performance.now(); ensurePU(THREE); cam.updateMatrixWorld(true);
    var kk = /[?&]planark=([0-9]+)/.exec(location.search), K = Math.min(PK_MAX, kk ? parseInt(kk[1], 10) : PK_MAX);
    var G = planesOf(A, THREE), cand = G.planes.filter(function (P) { return P.scr > 0; }).sort(function (x, y) { return y.scr - x.scr; }), use = cand.slice(0, K);
    var db = R.getDrawingBufferSize(new THREE.Vector2()), th = Math.max(64, Math.round(db.y / 2)), tw = Math.max(64, Math.round(th * (cam.aspect || db.x / db.y)));
    if (!atlasRT || atlasRT.width !== tw * PCOLS || atlasRT.height !== th * PROWS) { if (atlasRT) atlasRT.dispose(); atlasRT = new THREE.WebGLRenderTarget(tw * PCOLS, th * PROWS, { type: THREE.HalfFloatType, depthBuffer: true }); }
    var hidden = []; A.scene.traverse(function (o) { if (!o.visible || !o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return; var ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some(function (m) { return m && ((m.userData && (m.userData.gfOf || m.userData.slMirror)) || isGlass(m)); })) { o.visible = false; hidden.push(o); } });
    var prevRT = R.getRenderTarget(), props = R.properties, snap = function () { var m = new Map(); A.scene.traverse(function (o) { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (x) { if (x && !m.has(x)) { var pp = props.get(x); m.set(x, pp && pp.uniforms); } }); }); return m; };
    var ms = [], passes = [], V = cam.matrixWorldInverse, VI = cam.matrixWorld, pv = new THREE.Vector4();
    var csmOP = A._stillShadowWide ? A._stillShadowWide(true) : false;
    try { use.forEach(function (P, k) { var tk = performance.now(), T = mirrorCam(THREE, cam, P), col = k % PCOLS, row = Math.floor(k / PCOLS);
        atlasRT.viewport.set(col * tw, row * th, tw, th); atlasRT.scissor.set(col * tw, row * th, tw, th); atlasRT.scissorTest = true;
        var np = 0; for (np = 1; np <= 3; np++) { var s0 = snap(); R.setRenderTarget(atlasRT); R.clear(); R.render(A.scene, mirCam); var ch = 0; s0.forEach(function (u, x) { var pp = props.get(x); if (pp && pp.uniforms !== u) ch++; }); if (!ch) break; }
        passes.push(Math.min(np, 3));
        // view-space plane for the fragment test; view->uv for the lookup
        var nW = new THREE.Vector3().fromArray(P.n), nV = nW.clone().transformDirection(V), pW = nW.clone().multiplyScalar(-P.d), pVv = pW.applyMatrix4(V);
        PU.uGfPl.value[k].set(nV.x, nV.y, nV.z, -nV.dot(pVv)); PU.uGfTex.value[k].multiplyMatrices(T, VI);
        P.T = T; P.mirPos = mirCam.position.clone(); P.proj = mirCam.projectionMatrix.clone(); P.view = mirCam.matrixWorldInverse.clone(); P.tile = [col, row];
        ms.push(Math.round(performance.now() - tk)); }); }
    finally { if (csmOP) A._stillShadowWide(false); atlasRT.scissorTest = false; R.setRenderTarget(prevRT); hidden.forEach(function (o) { o.visible = true; }); }
    PU.uGfAtlas.value = atlasRT.texture; PU.uGfK.value = use.length; lastPlanes = use; lastPlanes.tw = tw; lastPlanes.th = th;
    if (A.markDirty) A.markDirty();
    var top = use.map(function (P) { return '[n=' + P.n.map(function (v) { return v.toFixed(2); }).join(',') + ' d=' + P.d.toFixed(2) + ' dOut=' + P.dOut.toFixed(3) + ' scr=' + (P.scr / 4 * 100).toFixed(1) + '% tris=' + P.tris + ']'; }).join(' ');
    var restScr = cand.slice(K).reduce(function (s, P) { return s + P.scr; }, 0);
    console.log('§GLASS_PLANAR K=' + use.length + '/' + PK_MAX + ' planesTotal=' + G.planes.length + ' onScreen=' + cand.length + ' tris=' + G.tris + ' meshes=' + G.meshes + ' batchedSkipped=' + G.batchedSkipped + ' batchedInst=' + G.batchedInst + ' mirrorMeshes=' + G.mirrorMeshes +
      ' tile=' + tw + 'x' + th + ' sunWide=' + (csmOP ? csmOP.w + 'x' + csmOP.h + 'm' : 'off') + ' passes=[' + passes.join(',') + '] msPerMirror=[' + ms.join(',') + '] fallbackScreen=' + (restScr / 4 * 100).toFixed(1) + '% totalMs=' + Math.round(performance.now() - t0) + ' mirrored=' + top);
    if (/[?&]refltruth=1/.test(location.search)) { try { truth(A, THREE, hidden); } catch (eT) { console.warn('§GLASS_REFL_TRUTH failed: ' + eT.message); } }
    return { K: use.length, ms: Math.round(performance.now() - t0) };
  }
  // §GLASS_REFL_TRUTH: does the tile show what the reflected ray actually meets? 32x18 grid from the eye; glazing-clone hit -> reflected
  // ray (scene raycast, glass skipped) -> hitDist; on a mirrored plane, the mirror distance render at that uv must be |eye-X| + hitDist (5 %).
  function truth(A, THREE) {
    var cam = A.camera, R = A.renderer, rc = new THREE.Raycaster(), all = [], opq = [];
    A.scene.traverse(function (o) { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || o === A._sky) return; all.push(o); var ms = Array.isArray(o.material) ? o.material : [o.material];
      if (!ms.some(function (m) { return m && ((m.userData && (m.userData.gfOf || m.userData.slMirror)) || isGlass(m)); })) opq.push(o); });   // the mirror pass draws unlit (Basic) props too, so the truth ray must meet them
    var tw = lastPlanes.tw, th = lastPlanes.th, FAR = 2000;
    var dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking }); dm.side = THREE.DoubleSide; var cc0 = R.getClearColor(new THREE.Color()), ca0 = R.getClearAlpha();
    var glassSamples = 0, mirrorSamples = 0, hitSamples = 0, onSlot = 0, agree = 0, edge = 0, off = {}, worst = [], px = new Float32Array(4), prevRT = R.getRenderTarget(), prevOv = A.scene.overrideMaterial, prevBg = A.scene.background;
    var hide = []; A.scene.traverse(function (o) { if (!o.visible || !o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return; var ms = Array.isArray(o.material) ? o.material : [o.material];
      if (o === A._sky || ms.some(function (m) { return m && ((m.userData && (m.userData.gfOf || m.userData.slMirror)) || isGlass(m)); })) { o.visible = false; hide.push(o); } });
    var rendered = -1;
    try {
      for (var gy = 0; gy < 18; gy++) for (var gx = 0; gx < 32; gx++) {
        rc.setFromCamera(new THREE.Vector2((gx + 0.5) / 32 * 2 - 1, 1 - (gy + 0.5) / 18 * 2), cam); rc.far = Infinity;
        hide.forEach(function (o) { o.visible = true; }); var h = rc.intersectObjects(all, false)[0]; hide.forEach(function (o) { o.visible = false; });
        if (!h) continue; var ob = h.object, mm = Array.isArray(ob.material) ? (h.face && ob.material[h.face.materialIndex]) || ob.material[0] : ob.material;
        if (!(mm && mm.userData && (mm.userData.gfOf || mm.userData.slMirror))) continue; glassSamples++; if (mm.userData.slMirror) mirrorSamples++;
        var nW = h.face.normal.clone().transformDirection(ob.matrixWorld); if (nW.dot(rc.ray.direction) > 0) nW.negate();
        var rd = rc.ray.direction.clone().reflect(nW), o0 = h.point.clone().addScaledVector(nW, 0.02); rc.set(o0, rd); rc.far = FAR;
        var hr = rc.intersectObjects(opq, false)[0]; if (!hr) continue; hitSamples++;
        var X = h.point, k = -1; for (var i = 0; i < lastPlanes.length; i++) { var P = lastPlanes[i]; if (Math.abs(P.n[0] * X.x + P.n[1] * X.y + P.n[2] * X.z + P.d) < PLANE_TOL && Math.abs(P.n[0] * nW.x + P.n[1] * nW.y + P.n[2] * nW.z) > PLANE_COS) { k = i; break; } }
        if (k < 0) { var why = ob.isBatchedMesh ? 'batchedNotTopK' : 'notTopK'; off[why] = (off[why] || 0) + 1; continue; } var P2 = lastPlanes[k], q = new THREE.Vector4(X.x, X.y, X.z, 1).applyMatrix4(P2.T); var u = q.x / q.w, v = q.y / q.w; if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) { off.uvOut = (off.uvOut || 0) + 1; continue; } onSlot++;
        if (!distRT || distRT.width !== tw || distRT.height !== th) { if (distRT) distRT.dispose(); distRT = new THREE.WebGLRenderTarget(tw, th, { type: THREE.FloatType, depthBuffer: true }); }
        if (rendered !== k) { mirrorCam(THREE, cam, P2); A.scene.overrideMaterial = dm; A.scene.background = null;
          R.setRenderTarget(distRT); R.setClearColor(0x000000, 1); R.clear(); R.render(A.scene, mirCam); rendered = k; }
        var ix = Math.min(tw - 1, Math.floor(u * tw)), iy = Math.min(th - 1, Math.floor(v * th)); R.readRenderTargetPixels(distRT, ix, iy, 1, 1, px);
        // BasicDepthPacking writes 1 - fragCoordZ: back to NDC, then through the (oblique) inverse projection to the mirrored eye's space
        var pe = new THREE.Vector4(2 * (ix + 0.5) / tw - 1, 2 * (iy + 0.5) / th - 1, 2 * (1 - px[0]) - 1, 1).applyMatrix4(mirCam.projectionMatrixInverse);
        var got = px[0] <= 0 ? Infinity : Math.hypot(pe.x / pe.w, pe.y / pe.w, pe.z / pe.w), want = cam.position.distanceTo(X) + hr.distance, err = Math.abs(got - want) / want;
        if (err <= 0.05) agree++; else {
          // a miss within one texel of an agreeing texel = a depth edge at half resolution (sampling), not a wrong mirror
          var nb = false, pb = new Float32Array(4); for (var dy = -1; dy <= 1 && !nb; dy++) for (var dx = -1; dx <= 1 && !nb; dx++) { var jx = ix + dx, jy = iy + dy; if (jx < 0 || jy < 0 || jx >= tw || jy >= th || (!dx && !dy)) continue;
            R.readRenderTargetPixels(distRT, jx, jy, 1, 1, pb); if (pb[0] <= 0) continue; var pn = new THREE.Vector4(2 * (jx + 0.5) / tw - 1, 2 * (jy + 0.5) / th - 1, 2 * (1 - pb[0]) - 1, 1).applyMatrix4(mirCam.projectionMatrixInverse);
            if (Math.abs(Math.hypot(pn.x / pn.w, pn.y / pn.w, pn.z / pn.w) - want) / want <= 0.05) nb = true; }
          if (!nb && got < want) {   // diag: what the mirror pass drew nearer than the truth ray's hit — every drawable whose world box the reflected segment crosses
            var seg = new THREE.Ray(o0, rd), bb = new THREE.Box3(), cands = []; A.scene.traverse(function (oo) { if (!oo.visible || (!oo.isMesh && !oo.isPoints && !oo.isLine && !oo.isSprite)) return; if (oo.geometry && !oo.geometry.boundingBox && oo.geometry.computeBoundingBox) oo.geometry.computeBoundingBox();
              if (oo.isInstancedMesh || oo.isBatchedMesh) { if (oo.computeBoundingBox) { try { oo.computeBoundingBox(); bb.copy(oo.boundingBox).applyMatrix4(oo.matrixWorld); } catch (eBB) { return; } } else return; } else if (oo.geometry && oo.geometry.boundingBox) bb.copy(oo.geometry.boundingBox).applyMatrix4(oo.matrixWorld); else return;
              var hp = seg.intersectBox(bb, new THREE.Vector3()); if (hp && hp.distanceTo(o0) < got * 1.05 - cam.position.distanceTo(X)) cands.push(oo.type + ':' + ((oo.userData && oo.userData.ifcClass) || oo.name || '?') + (hide.indexOf(oo) >= 0 ? '(hidden)' : '') + (opq.indexOf(oo) < 0 ? '(notInTruth)' : '') + '@' + hp.distanceTo(o0).toFixed(1)); });
            console.log('§GLASS_REFL_TRUTH_MISS [' + gx + ',' + gy + '] got=' + got.toFixed(2) + ' want=' + want.toFixed(2) + ' eyeToGlass=' + cam.position.distanceTo(X).toFixed(2) + ' boxesCrossed=' + cands.slice(0, 12).join(' ')); }
          if (nb) edge++; if (worst.length < 6) worst.push('[' + gx + ',' + gy + ' got ' + (isFinite(got) ? got.toFixed(2) : 'sky') + ' want ' + want.toFixed(2) + (nb ? ' edge' : '') + ' obj=' + (hr.object.userData && hr.object.userData.ifcClass || hr.object.type) + ']'); }
      }
    } finally { A.scene.overrideMaterial = prevOv; A.scene.background = prevBg; R.setClearColor(cc0, ca0); R.setRenderTarget(prevRT); hide.forEach(function (o) { o.visible = true; }); dm.dispose(); }
    var verdict = onSlot === 0 ? 'INCONCLUSIVE (no mirrored sample)' : (agree === onSlot ? 'PASS' : (agree + edge === onSlot ? 'PASS (misses only at half-res depth edges)' : 'FAIL'));
    console.log('§GLASS_REFL_TRUTH ' + verdict + ' glassSamples=' + glassSamples + ' (mirror ' + mirrorSamples + ') hitSamples=' + hitSamples + ' onSlot=' + onSlot + ' depthAgree=' + agree + '/' + onSlot + ' missAtDepthEdge=' + edge + ' offSlot=' + JSON.stringify(off) + (worst.length ? ' worst=' + worst.join('') : '') + ' K=' + lastPlanes.length);
  }

  function unstage(A) {
    PU.uGfK.value = 0;   // §GLASS_PLANAR_REFL: nav / films never read a stale mirror
    if (!swaps.length) return;
    swaps.forEach(function (s) { s[0].material = s[1]; });
    console.log('§GLASS_FRESNEL restored meshes=' + swaps.length + ' (stock materials back; clones kept for the next still)');
    swaps = [];
    if (A.markDirty) A.markDirty();
  }

  global.GlassFresnel = { capture: capture, planar: planar, patchShader: gfPatchShader, planarState: function () { return { K: PU.uGfK.value, planes: lastPlanes, atlas: atlasRT }; }, stage: stage, unstage: unstage, classOfMembers: function (A, o) { return classOfMembers(A, o); } };
})(typeof window !== 'undefined' ? window : this);
