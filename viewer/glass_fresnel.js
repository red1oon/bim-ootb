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
  var saved = [];

  function isGlass(m) {
    return m && m.transparent && m.opacity < 0.95 && !m.map && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
  }

  function stage(A) {
    var THREE = global.THREE; if (!THREE || !A || !A.scene) return;
    unstage(A);
    var m0 = /[?&]fresnel=([0-9.]+)/.exec(location.search), on = (typeof A._stillFresnel === 'number') ? A._stillFresnel > 0 : (m0 ? parseFloat(m0[1]) > 0 : false);   // default OFF pending the broken-sheet check (watcher)
    if (!on) { console.log('§GLASS_FRESNEL off (&fresnel=0)'); return; }
    var set = new Set();
    A.scene.traverse(function (o) { if (o.visible && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (isGlass(m)) set.add(m); }); });
    // §GLASS_FRESNEL_NO_RECOMPILE (measured: toggling the shader per press recompiled the glass materials every still,
    // refine 14-41 s). The fragment code is patched ONCE per material and switched by a uniform (uGlassF); blending and
    // depthWrite are render state. From the second still on, nothing recompiles; off (nav) = the stock opaque_fragment.
    var fresh = 0;
    set.forEach(function (m) {
      if (!m.userData.gfU) {
        m.userData.gfU = { value: 0 };
        var orig = m.onBeforeCompile, origKey = m.customProgramCacheKey, U = m.userData.gfU;
        m.onBeforeCompile = function (sh, r) {
          if (orig) orig.call(this, sh, r);
          sh.uniforms.uGlassF = U;
          sh.fragmentShader = 'uniform float uGlassF;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', [
            'if ( uGlassF > 0.5 ) {',
            '  float gfNV = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );',
            '  float gfF = ' + F0.toFixed(3) + ' + ' + (1 - F0).toFixed(3) + ' * pow( 1.0 - gfNV, 5.0 );',
            '  gl_FragColor = vec4( totalDiffuse * ' + GLASS_BODY.toFixed(3) + ' + totalSpecular + totalEmissiveRadiance, max( gfF, ' + GLASS_BODY.toFixed(3) + ' ) );',
            '} else {',
            THREE.ShaderChunk.opaque_fragment,
            '}'].join('\n'));
        };
        m.customProgramCacheKey = function () { return (origKey ? origKey.call(this) : '') + '|glassFresnelSwitch'; };
        m.needsUpdate = true; fresh++;
      }
      saved.push({ m: m, blending: m.blending, bs: m.blendSrc, bd: m.blendDst, bsa: m.blendSrcAlpha, bda: m.blendDstAlpha, dw: m.depthWrite });
      m.userData.gfU.value = 1;
      m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      m.depthWrite = false;   // clear glass must not hide what is behind it from later transparent draws
    });
    if (A.markDirty) A.markDirty();
    console.log('§GLASS_FRESNEL mats=' + saved.length + ' newlyPatched=' + fresh + ' f0=' + F0 + ' body=' + GLASS_BODY + ' (alpha = Schlick F; reflection = full-strength specular, premultiplied add)');
  }

  function unstage(A) {
    if (!saved.length) return;
    saved.forEach(function (s) {
      var m = s.m; if (m.userData.gfU) m.userData.gfU.value = 0;   // switch, not recompile: the patch stays, inert
      m.blending = s.blending; m.blendSrc = s.bs; m.blendDst = s.bd; m.blendSrcAlpha = s.bsa; m.blendDstAlpha = s.bda; m.depthWrite = s.dw;
    });
    console.log('§GLASS_FRESNEL restored mats=' + saved.length);
    saved = [];
    if (A.markDirty) A.markDirty();
  }

  global.GlassFresnel = { stage: stage, unstage: unstage };
})(typeof window !== 'undefined' ? window : this);
