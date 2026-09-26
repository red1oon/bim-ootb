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
  function patchedClone(THREE, orig) {
    if (orig.userData.gfClone) return orig.userData.gfClone;
    var c = orig.clone(); c.userData = { gfOf: orig.uuid };
    var origKey = c.customProgramCacheKey;
    c.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', [
        '{',
        '  float gfNV = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );',
        '  float gfF = ' + F0.toFixed(3) + ' + ' + (1 - F0).toFixed(3) + ' * pow( 1.0 - gfNV, 5.0 );',
        '  gl_FragColor = vec4( totalDiffuse * ' + GLASS_BODY.toFixed(3) + ' + totalSpecular + totalEmissiveRadiance, max( gfF, ' + GLASS_BODY.toFixed(3) + ' ) );',
        '}'].join('\n'));
    };
    c.customProgramCacheKey = function () { return 'glassFresnelClone'; };
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
  var capRT = null, capCam = null, CAP_SIZE = 256;
  function liveClones() { var set = new Set(); swaps.forEach(function (s) { var m = s[0].material, ms = Array.isArray(m) ? m : [m]; ms.forEach(function (x) { if (x && x.userData && x.userData.gfOf) set.add(x); }); }); return set; }
  function capture(A) {
    var THREE = global.THREE; if (!THREE || !A || !A.renderer || !A.scene || !A.camera || !swaps.length) return null;
    if (A._stillGlassEnv === false || /[?&]glassenv=0/.test(location.search)) { console.log('§GLASS_ENV off (&glassenv=0) — panes reflect the sky HDRI'); return null; }
    var t0 = performance.now(), R = A.renderer;
    if (!capRT) { capRT = new THREE.WebGLCubeRenderTarget(CAP_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); capCam = new THREE.CubeCamera(0.05, 5000, capRT); }
    var hidden = [];
    A.scene.traverse(function (o) { if (!o.visible || !o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return; var ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some(function (m) { return m && ((m.userData && m.userData.gfOf) || isGlass(m)); })) { o.visible = false; hidden.push(o); } });
    capCam.position.copy(A.camera.position); capCam.layers.mask = A.camera.layers.mask; A.scene.add(capCam); capCam.updateMatrixWorld(true);
    var prevRT = R.getRenderTarget();
    try { capCam.update(R, A.scene); } finally { R.setRenderTarget(prevRT); A.scene.remove(capCam); hidden.forEach(function (o) { o.visible = true; }); }
    capRT.texture.needsPMREMUpdate = true;
    var n = 0; liveClones().forEach(function (c) { if (c.envMap !== capRT.texture) { c.envMap = capRT.texture; c.needsUpdate = true; } n++; });
    if (A.markDirty) A.markDirty();
    var line = '§GLASS_ENV captured ' + CAP_SIZE + 'x6 at camera [' + A.camera.position.toArray().map(function (v) { return v.toFixed(2); }).join(',') + '] glassMeshesHidden=' + hidden.length + ' clonesReflecting=' + n + ' ms=' + Math.round(performance.now() - t0);
    console.log(line); return { clones: n, hidden: hidden.length, ms: Math.round(performance.now() - t0) };
  }

  function unstage(A) {
    if (!swaps.length) return;
    swaps.forEach(function (s) { s[0].material = s[1]; });
    console.log('§GLASS_FRESNEL restored meshes=' + swaps.length + ' (stock materials back; clones kept for the next still)');
    swaps = [];
    if (A.markDirty) A.markDirty();
  }

  global.GlassFresnel = { capture: capture, stage: stage, unstage: unstage, classOfMembers: function (A, o) { return classOfMembers(A, o); } };
})(typeof window !== 'undefined' ? window : this);
