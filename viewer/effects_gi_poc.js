/**
 * BIM OOTB — effects_gi_poc.js — SANDBOX SPIKE, isolated branch only (feat/ssgi-composer-poc)
 * §GI_POC (2026-07-16): tests whether N8AO (pmndrs `postprocessing` package) can render real
 * ambient-occlusion/contact-shadow correction against REAL streamed building geometry
 * (InstancedMesh/BatchedMesh-heavy), coexisting with the app's existing native EffectComposer
 * (viewer/effects.js) rather than replacing it. Gated behind Alt+G — OFF by default, touches
 * nothing when untriggered. Answers prompts/PHOTOREAL_STILL_RENDER.md §LAYER 4's open question:
 * is a classic-pipeline-compatible AO/GI library actually usable on THIS app's real data.
 */
async function setupGIPoc(A, renderer, scene, camera) {
  A._giComposer = null;
  A._giComposerActive = false;

  var _isMobile = (navigator.maxTouchPoints > 0 && window.screen.width < 1024);
  if (_isMobile) { console.log('§GI_POC_SKIP mobile'); A.toggleGIPreview = function() {}; return; }

  // §GI_POC_LAZY (2026-07-16, real-user mem concern): originally built the whole pmndrs
  // EffectComposer + N8AOPostPass eagerly at page load, every session, whether or not Alt+G was
  // ever pressed — that's several full-resolution WebGLRenderTargets (N8AO alone allocates
  // depth/normal/AO/accumulation buffers) held in GPU memory permanently, on top of the app's own
  // native composer (viewer/effects.js) which ALSO stays allocated always. On a memory-sensitive
  // page already streaming 70MB+ building DBs, paying that cost for a feature 99% of sessions
  // never touch is a real, avoidable tax — construction is now deferred to the FIRST Alt+G press.
  var _pp = null, _built = false;
  async function _ensureBuilt() {
    if (_built) return true;
    _built = true;  // set before await — a second rapid Alt+G press must not double-build
    try {
      _pp = await import('./lib/postprocessing-n8ao.bundle.js');
      var composer = new _pp.EffectComposer(renderer);
      composer.addPass(new _pp.RenderPass(scene, camera));

      var n8aoPass = new _pp.N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight);
      n8aoPass.configuration.aoRadius = 8;         // §GI_POC_RADIUS_TEST: bumped from 1.5 — at a whole-
      // building establishing-shot distance (envelope ~68m on Terminal), a 1.5m radius produces a
      // sub-pixel contact band, invisible in practice (confirmed: no visible difference vs staging-
      // only in a direct A/B test). Testing a building-scale radius instead — architectural AO
      // radii for exterior shots commonly run several meters, not sub-2m interior-detail scale.
      n8aoPass.configuration.intensity = 6;
      n8aoPass.configuration.aoSamples = 8;       // still-preview budget, not tuned for real-time nav
      // §GI_POC_GHOST_FIX: N8AO's accumulationRenderTarget is ONLY cleared on camera movement when
      // configuration.accumulate=true (read from n8ao's own source — the `else` branch that calls
      // renderer.clear() is gated on that flag, not on the view-matrix-changed check alone). Leaving
      // it at the default false meant the buffer was NEVER cleared, any frame, moving or still —
      // every frame blended onto stale data, exactly the "motion shadow" ghosting reported live.
      // accumulate:true is also n8ao's documented intended mode for a "refine when still" use case
      // (their README: "If the camera is moving, the accumulation effect will be disabled
      // automatically") — the same discipline this app's own TAA still-refine (Alt+S) already
      // follows, not a workaround. Per their docs, denoiseRadius=0/denoiseSamples=1 is recommended
      // alongside accumulate for the cleanest result (accumulation itself removes the noise that
      // spatial denoising was compensating for).
      n8aoPass.configuration.accumulate = true;
      // §GI_POC_DENOISE_TUNE (2026-07-16, user report: "still bit ghosting, may need denoise"):
      // denoiseSamples=1/denoiseRadius=0 was N8AO's own "purest temporal accumulation" recommendation,
      // but that trades away spatial smoothing — an early, still-converging accumulated frame shows
      // raw undenoised AO noise, which can read as flicker/ghosting even though the buffer-clear bug
      // is fixed. Testing a middle ground: some spatial denoise to hide inter-frame noise while
      // accumulation is still converging, without fully reintroducing the blur accumulate was meant
      // to avoid.
      n8aoPass.configuration.denoiseSamples = 4;
      n8aoPass.configuration.denoiseRadius = 6;
      n8aoPass.configuration.halfRes = false;     // full-res first pass — measure cost before optimizing
      composer.addPass(n8aoPass);  // N8AOPostPass is a Pass itself, not an Effect — no EffectPass wrap

      composer.setSize(window.innerWidth, window.innerHeight);
      A._giComposer = composer;
      A._giN8aoPass = n8aoPass;
      console.log('§GI_POC_INIT_OK N8AO wired via pmndrs/postprocessing composer (lazy, on first Alt+G)');

      // §GI_POC_STALE_FIX (2026-07-16, real-user report — "ghosting" persisted after the camera-
      // move fix): N8AO's own accumulate:true clear logic is keyed ONLY to the camera's view/
      // projection matrix changing — confirmed reading its source (§GI_POC_GHOST_FIX above). Any
      // scene change that ISN'T a camera move — new geometry streaming in, xray/selection material
      // swaps, room highlighting — never trips that check, so the AO buffer kept blending stale
      // data against updated geometry: exactly the "streaming refresh getting caught" symptom.
      // N8AO exposes a public firstFrame() that forces the same clear-next-frame path a camera
      // move does. Wrapping A.markDirty() (the app's own single choke point for "something
      // changed, render again" — used by selection, xray, streaming ticks, everything) so any of
      // those also force an AO reset, not just camera movement. Same discipline as this file's own
      // §PHOTO_STREAMING_RACE fix elsewhere in this codebase (re-assert every changed frame, don't
      // trust a one-shot signal).
      if (A.markDirty) {
        var _origMarkDirty = A.markDirty;
        A.markDirty = function() {
          if (A._giComposerActive && A._giN8aoPass) A._giN8aoPass.firstFrame();
          return _origMarkDirty.apply(A, arguments);
        };
      }
      return true;
    } catch (e) {
      console.warn('§GI_POC_INIT_FAIL ' + e.message);
      console.warn(e.stack);
      _built = false;  // §GI_BUILD_RETRY (review finding 5): don't latch a transient load failure
      _pp = null;      // into a permanent silent no-op — let the next Alt+G try again.
      return false;
    }
  }

  A.toggleGIPreview = async function(on) {
    var wantOn = (on === undefined) ? !A._giComposerActive : !!on;
    if (wantOn === A._giComposerActive) return A._giComposerActive;  // no-op
    if (wantOn && !(await _ensureBuilt())) { console.warn('§GI_POC toggle failed — build error'); return false; }
    if (wantOn) {
      // §SSGI_SPIKE mutual exclusion: Alt+J may have borrowed the _giComposer render slot —
      // reclaim it for N8AO before enabling.
      if (A._ssgiActive && typeof A.toggleSSGIPreview === 'function') A.toggleSSGIPreview(false);
      // §GI_EXCLUSION (review finding 5): Alt+S's own accumulation RAF renders A._composer while
      // the main loop prefers _giComposer — both running fight over every frame. Pause the
      // accumulation + disarm the Stage-2 auto-restage, but KEEP photo mode itself (frozen still
      // state, dusk staging, triplanar textures) — GI preview over the staged scene is the POC's
      // whole point. A camera move during GI preview re-enters the normal Stage-1/2 cycle.
      if (typeof A.pauseStillRefineForGI === 'function') A.pauseStillRefineForGI();
      // mutually exclusive with the native composer — only one composer renders per frame.
      A._giComposerActive = true;
      if (A._composerEnabled) A._composerEnabled = false;
    } else {
      A._giComposerActive = false;
      // §SSGI_SPIKE: toggleGIPreview(false) is the universal "preview off" (effects.js's
      // startStillRefine guard calls it) — clear a live SSGI borrow too, hand the slot back.
      if (A._ssgiActive) {
        A._ssgiActive = false;
        if (_n8aoComposerRef) A._giComposer = _n8aoComposerRef;
        console.log('§SSGI toggle=false (via GI off)');
      }
      // §GI_HANDOFF_GHOST_FIX (2026-07-16, user: "it happens after Alt-G"): do NOT blind-restore a
      // value saved at toggle-on — still-refine ALSO saved/restored _composerEnabled and the two
      // save/restore pairs interleave (Alt+S → Alt+G on → camera move soft-cancels the still →
      // Alt+G off restored the PRE-GI value, which no longer reflected reality), stranding the
      // composer force-on at baseline. RECOMPUTE what the composer state should be right now,
      // with the same formula effects.js's toggleSSAO/setOutline sites already use, plus the
      // still-refine flag (a photoshoot in progress needs its composer back).
      A._composerEnabled = !!(A._stillRefineActive ||
        (A._outlinePass && A._outlinePass.enabled) || (A._ssaoPass && A._ssaoPass.enabled));
    }
    console.log('§GI_POC toggle=' + A._giComposerActive);
    if (A.markDirty) A.markDirty();
    return A._giComposerActive;
  };

  // ── §SSGI_SPIKE (2026-07-16, feasibility spike — prompts/PHOTOREAL_STILL_RENDER.md §LAYER 4's
  // last open question): can realism-effects' SSGIEffect (screen-space GLOBAL illumination —
  // bounce light, not just occlusion) render on THIS app's real InstancedMesh/BatchedMesh
  // geometry under three r185? The vendored bundle now also carries realism-effects@1.1.2
  // (MIT, peer postprocessing>=6.30.1 — bundled 6.39.2 ✓, peer three>=0.148 ✓, zero hits for
  // any API three removed since r152, blue-noise embedded). Alt+J toggles it; lazy like Alt+G.
  // KNOWN RISK under test: the lib predates BatchedMesh — its VelocityDepthNormalPass overrides
  // scene materials to render velocity/depth/normal buffers; whether that works on batched
  // geometry is exactly what this spike answers. One preview at a time: Alt+J and Alt+G are
  // mutually exclusive (both reuse main.js's single _giComposer render branch).
  var _ssgiComposer = null, _n8aoComposerRef = null;
  async function _ensureSSGIBuilt() {
    if (_ssgiComposer) return true;
    try {
      if (!_pp) _pp = await import('./lib/postprocessing-n8ao.bundle.js');
      if (!_pp.SSGIEffect || !_pp.VelocityDepthNormalPass || !_pp.EffectPass) {
        console.warn('§SSGI_INIT_FAIL bundle lacks SSGI exports'); return false;
      }
      var composer = new _pp.EffectComposer(renderer);
      composer.addPass(new _pp.RenderPass(scene, camera));
      var vdnp = new _pp.VelocityDepthNormalPass(scene, camera);
      composer.addPass(vdnp);
      // §SSGI_PORT (2026-07-16, lighting port — supersedes §SSGI_SPIKE_INCOMPLETE): the spike's
      // "black building" had THREE stacked root causes, found by probing every buffer of the
      // live chain (gbuffer diffuse/depth were FINE — the original material-clone suspicion was
      // disproven by measurement):
      //   1. useDirectLight never engaged: the lib only sets that define inside
      //      updateUsingRenderPass() on an isUsingRenderPass TRANSITION — but it constructs as
      //      true and its "set false next frame" rAF is cancelled by every update() in a
      //      continuously-rendering composer, so the transition never fires and the define never
      //      lands. Without it (and with no scene.environment in this app) the effect's ONLY
      //      light inputs are emissive (zero here) + accumulated GI (starts black) → black,
      //      forever. Fixed by calling ssgi.updateUsingRenderPass() once after construction
      //      (public method; isUsingRenderPass is true, so it adds the defines — honest
      //      semantics, we really do use a RenderPass).
      //   2. r185 REVERSED packDepthToRGBA's byte order (.r is now the MSB ≈ depth value; the
      //      lib was written against the old LSB-in-r layout). Its denoiser's hand-rolled
      //      far-plane check `depthTexel.r>0.9999` therefore discarded ~every building fragment
      //      at establishing distance, and with this app's renderer.autoClear=false the denoise
      //      targets kept their initial zeros → hard black output. Patched IN THE BUNDLE
      //      (patch #5: unpackRGBAToDepth-based check — layout-agnostic).
      //   3. importanceSampling defaults ON and, with no scene.environment, sampled the default
      //      1x1 env-info textures (+ read uninitialized GLSL bools — bundle patch #6 inits
      //      them) → NaNs in the raw GI that poisoned temporal accumulation. Disabled below —
      //      black env = screen-space-only bounce + direct light, the port milestone's scope.
      // distance/thickness are world-scale-sensitive (50-150m envelopes here); steps/refineSteps
      // re-tuned live on HHS after the port (see PHOTOREAL_STILL_RENDER.md session record).
      var ssgi = new _pp.SSGIEffect(scene, camera, vdnp, {
        distance: 30, thickness: 5, denoiseIterations: 1, radius: 5,
        steps: 12, refineSteps: 4, spp: 1, resolutionScale: 1,
        importanceSampling: false
      });
      ssgi.updateUsingRenderPass();  // root cause 1 — engage direct-light injection NOW
      console.log('§SSGI_PORT_WIRED useDirectLight=' +
        ('useDirectLight' in ssgi.ssgiPass.fullscreenMaterial.defines) +
        ' importanceSampling=' + ('importanceSampling' in ssgi.ssgiPass.fullscreenMaterial.defines));
      composer.addPass(new _pp.EffectPass(camera, ssgi));
      composer.setSize(window.innerWidth, window.innerHeight);
      _ssgiComposer = composer;
      A._ssgiEffect = ssgi;
      console.log('§SSGI_INIT_OK realism-effects SSGI wired (lazy, Alt+J)');
      return true;
    } catch (e) {
      console.warn('§SSGI_INIT_FAIL ' + e.message);
      console.warn(e.stack);
      return false;
    }
  }

  A._ssgiActive = false;
  A.toggleSSGIPreview = async function(on) {
    var wantOn = (on === undefined) ? !A._ssgiActive : !!on;
    if (wantOn === A._ssgiActive) return A._ssgiActive;
    if (wantOn && !(await _ensureSSGIBuilt())) { console.warn('§SSGI toggle failed — build error'); return false; }
    if (wantOn) {
      if (A._giComposerActive) { _n8aoComposerRef = A._giComposer; A.toggleGIPreview(false); }
      else if (A._giComposer) _n8aoComposerRef = A._giComposer;
      if (typeof A.pauseStillRefineForGI === 'function') A.pauseStillRefineForGI();
      A._ssgiActive = true;
      A._giComposer = _ssgiComposer;       // reuse main.js's existing _giComposer render branch
      A._giComposerActive = true;
      if (A._composerEnabled) A._composerEnabled = false;
    } else {
      A._ssgiActive = false;
      A._giComposerActive = false;
      if (_n8aoComposerRef) A._giComposer = _n8aoComposerRef;  // hand the slot back to N8AO
      // same recompute as §GI_HANDOFF_GHOST_FIX above — never blind-restore
      A._composerEnabled = !!(A._stillRefineActive ||
        (A._outlinePass && A._outlinePass.enabled) || (A._ssaoPass && A._ssaoPass.enabled));
    }
    console.log('§SSGI toggle=' + A._ssgiActive);
    if (A.markDirty) A.markDirty();
    return A._ssgiActive;
  };
}
