// §PHOTO_BLOOM — a compact bloom pass, written rather than imported.
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §PHOTO_EMBER.
//
// WHY THIS FILE EXISTS AT ALL: three.js ships UnrealBloomPass, but it is not vendored here and this
// app must work OFFLINE — pulling it from a CDN at runtime is not an option (the whole product is a
// static site users open with no network). The pmndrs `postprocessing` bundle already vendored for
// N8AO does contain BloomEffect, but it belongs to a DIFFERENT composer implementation and cannot be
// added to three's native EffectComposer that viewer/effects.js uses. So: bright-pass, separable
// blur, additive composite, built from the Pass/FullScreenQuad primitives already in this folder.
//
// WHAT IT IS FOR: measured 2026-07-27, emissive luminaires were INVISIBLE in the render — mean
// luminance 56.13 -> 56.13 with the glow on, because a luminaire is a handful of pixels and nothing
// spreads its energy. Raising emissiveIntensity cannot fix that; it makes the same few pixels
// whiter. Bloom is what turns a bright pixel into a lamp, which is why glow and bloom are one
// feature and not two increments.
//
// Placed BEFORE OutputPass in the chain so it works in linear HDR, where emissive materials with
// toneMapped=false genuinely exceed 1.0 and the threshold means something.
const { ShaderMaterial, UniformsUtils, WebGLRenderTarget, Vector2, HalfFloatType, LinearFilter, ClampToEdgeWrapping } = window.THREE;
import { Pass, FullScreenQuad } from './Pass.js';

// Everything above `threshold` is kept, smoothly, and scaled by how far above it sits. `knee` softens
// the cutoff so a surface hovering at the threshold does not pop in and out between frames — with TAA
// accumulating 16 samples a hard cutoff shimmers.
const BrightShader = {
  uniforms: { tDiffuse: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.6 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float threshold; uniform float knee; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float soft = clamp((l - threshold + knee) / max(0.0001, 2.0 * knee), 0.0, 1.0);
      float w = max(l - threshold, 0.0) * soft;
      gl_FragColor = vec4(c.rgb * (l > 0.0001 ? w / l : 0.0), 1.0);
    }`
};

// Separable 9-tap gaussian. Two passes (H then V) per level; running it over several progressively
// smaller targets is what gives a wide, soft falloff without a large kernel.
const BlurShader = {
  uniforms: { tDiffuse: { value: null }, direction: { value: new Vector2(1, 0) }, texelSize: { value: new Vector2() } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 direction; uniform vec2 texelSize; varying vec2 vUv;
    void main(){
      vec2 d = direction * texelSize;
      vec4 s = texture2D(tDiffuse, vUv) * 0.227027;
      s += (texture2D(tDiffuse, vUv + d * 1.3846) + texture2D(tDiffuse, vUv - d * 1.3846)) * 0.316216;
      s += (texture2D(tDiffuse, vUv + d * 3.2308) + texture2D(tDiffuse, vUv - d * 3.2308)) * 0.070270;
      gl_FragColor = vec4(s.rgb, 1.0);
    }`
};

const CompositeShader = {
  uniforms: { tDiffuse: { value: null }, tBloom0: { value: null }, tBloom1: { value: null },
              tBloom2: { value: null }, strength: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tBloom0; uniform sampler2D tBloom1;
    uniform sampler2D tBloom2; uniform float strength; varying vec2 vUv;
    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      // Coarser levels weigh less, so the halo falls off instead of forming a flat disc.
      vec3 b = texture2D(tBloom0, vUv).rgb * 1.0
             + texture2D(tBloom1, vUv).rgb * 0.6
             + texture2D(tBloom2, vUv).rgb * 0.35;
      gl_FragColor = vec4(base + b * strength, texture2D(tDiffuse, vUv).a);
    }`
};

const LEVELS = 3;

class BloomPass extends Pass {
  constructor(width, height, opts) {
    super();
    opts = opts || {};
    this.strength = opts.strength !== undefined ? opts.strength : 0.9;
    this.threshold = opts.threshold !== undefined ? opts.threshold : 1.0;
    this.knee = opts.knee !== undefined ? opts.knee : 0.6;
    this.needsSwap = true;

    // HalfFloat because the whole point is values ABOVE 1.0; an 8-bit target would clip the very
    // pixels this pass exists to find, and the threshold would then be meaningless.
    const rtOpts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter,
                     wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false };
    this._rtBright = new WebGLRenderTarget(Math.max(1, width >> 1), Math.max(1, height >> 1), rtOpts);
    this._levels = [];
    for (let i = 0; i < LEVELS; i++) {
      const w = Math.max(1, width >> (i + 1)), h = Math.max(1, height >> (i + 1));
      this._levels.push({
        a: new WebGLRenderTarget(w, h, rtOpts),
        b: new WebGLRenderTarget(w, h, rtOpts),
        size: new Vector2(1 / w, 1 / h)
      });
    }
    // §BLOOM_BLACK_BOXES (2026-07-27, user: "Still getting black boxes...") — THE BUG, and it is
    // here, not in the emissive that was blamed for it last session.
    //
    // render() sets renderer.autoClear = false for the whole pass (correct — each _draw covers its
    // target completely, so clearing colour would be wasted work). But a ShaderMaterial defaults to
    // depthTest: true / depthWrite: true, and the composer's targets still hold the DEPTH BUFFER
    // written by the scene passes that ran before this one. So a full-screen quad sitting at a fixed
    // NDC depth gets DEPTH-REJECTED everywhere the old scene depth is nearer — and those pixels keep
    // whatever the target already held, which for a bloom target that was never written is BLACK.
    // Rectangular black patches locked to geometry are exactly that signature.
    //
    // A post-processing pass has no business depth-testing at all: it is 2D compositing over a
    // finished frame. Turning both off makes every _draw write unconditionally, which is what
    // autoClear=false was assuming in the first place.
    var _postDepth = { depthTest: false, depthWrite: false };
    this._bright = new ShaderMaterial(Object.assign({ uniforms: UniformsUtils.clone(BrightShader.uniforms),
      vertexShader: BrightShader.vertexShader, fragmentShader: BrightShader.fragmentShader }, _postDepth));
    this._blur = new ShaderMaterial(Object.assign({ uniforms: UniformsUtils.clone(BlurShader.uniforms),
      vertexShader: BlurShader.vertexShader, fragmentShader: BlurShader.fragmentShader }, _postDepth));
    this._comp = new ShaderMaterial(Object.assign({ uniforms: UniformsUtils.clone(CompositeShader.uniforms),
      vertexShader: CompositeShader.vertexShader, fragmentShader: CompositeShader.fragmentShader }, _postDepth));
    this._quad = new FullScreenQuad(null);
  }

  setSize(width, height) {
    this._rtBright.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
    for (let i = 0; i < LEVELS; i++) {
      const w = Math.max(1, width >> (i + 1)), h = Math.max(1, height >> (i + 1));
      this._levels[i].a.setSize(w, h); this._levels[i].b.setSize(w, h);
      this._levels[i].size.set(1 / w, 1 / h);
    }
  }

  _draw(renderer, material, target) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    this._quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    this._bright.uniforms.tDiffuse.value = readBuffer.texture;
    this._bright.uniforms.threshold.value = this.threshold;
    this._bright.uniforms.knee.value = this.knee;
    this._draw(renderer, this._bright, this._rtBright);

    // Each level blurs the level above it, so the kernel widens geometrically for free.
    let src = this._rtBright;
    for (let i = 0; i < LEVELS; i++) {
      const L = this._levels[i];
      this._blur.uniforms.texelSize.value.copy(L.size);
      this._blur.uniforms.tDiffuse.value = src.texture;
      this._blur.uniforms.direction.value.set(1, 0);
      this._draw(renderer, this._blur, L.a);
      this._blur.uniforms.tDiffuse.value = L.a.texture;
      this._blur.uniforms.direction.value.set(0, 1);
      this._draw(renderer, this._blur, L.b);
      src = L.b;
    }

    this._comp.uniforms.tDiffuse.value = readBuffer.texture;
    this._comp.uniforms.tBloom0.value = this._levels[0].b.texture;
    this._comp.uniforms.tBloom1.value = this._levels[1].b.texture;
    this._comp.uniforms.tBloom2.value = this._levels[2].b.texture;
    this._comp.uniforms.strength.value = this.strength;
    this._draw(renderer, this._comp, this.renderToScreen ? null : writeBuffer);

    renderer.autoClear = oldAutoClear;
    renderer.setRenderTarget(oldTarget);
  }

  dispose() {
    this._rtBright.dispose();
    this._levels.forEach(L => { L.a.dispose(); L.b.dispose(); });
    this._bright.dispose(); this._blur.dispose(); this._comp.dispose(); this._quad.dispose();
  }
}

export { BloomPass };
