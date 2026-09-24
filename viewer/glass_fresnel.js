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
      if (!(GLAZE_CLASSES[cls] || r10) || o.isBatchedMesh) { skipped[cls] = (skipped[cls] || 0) + 1; return; }
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

  function unstage(A) {
    if (!swaps.length) return;
    swaps.forEach(function (s) { s[0].material = s[1]; });
    console.log('§GLASS_FRESNEL restored meshes=' + swaps.length + ' (stock materials back; clones kept for the next still)');
    swaps = [];
    if (A.markDirty) A.markDirty();
  }

  global.GlassFresnel = { stage: stage, unstage: unstage };
})(typeof window !== 'undefined' ? window : this);
