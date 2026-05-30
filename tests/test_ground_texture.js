// test_ground_texture.js — WHITEBOX for the S280g ground-texture engine.
//
// ISSUE PROVED: applying a photo texture to the ground must (1) set material.map, (2) keep
// material.color WHITE so the photo shows true (color multiplies the map), (3) DIM not
// BLACKEN for night-dark color targets (so the photo survives night mode), and (4) on
// 'none' clear the map and restore the flat color. Loads the REAL setupTools from
// viewer/tools.js and drives A._applyGroundTexture / A._setGroundColor directly.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'tools.js'), 'utf8');

function makeStub() {
  const fn = function () { return STUB; };
  return new Proxy(fn, { get: () => STUB, apply: () => STUB, construct: () => STUB });
}
const STUB = makeStub();

// FAKE texture returned synchronously by the stub TextureLoader.
function fakeTex() {
  return { wrapS: null, wrapT: null, repeat: { x: 0, y: 0, set(a, b) { this.x = a; this.y = b; } },
           anisotropy: 0, colorSpace: null };
}
const THREE_OVR = {
  RepeatWrapping: 'REPEAT',
  SRGBColorSpace: 'SRGB',
  sRGBEncoding: 'SRGBENC',
  TextureLoader: function () { this.load = function (s, onLoad) { onLoad(fakeTex()); }; },
};
const THREE = new Proxy(function () {}, {
  get: (t, p) => (p in THREE_OVR ? THREE_OVR[p] : STUB),
  apply: () => STUB, construct: () => STUB,
});

const sandbox = { THREE, document: { getElementById: () => null }, window: {}, console: { log() {}, warn() {}, error() {} } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\n;this.__setupTools = setupTools;', sandbox, { filename: 'tools.js' });

const backing = {};
const A = new Proxy(backing, { get: (t, p) => (p in t ? t[p] : STUB), set: (t, p, v) => { t[p] = v; return true; } });
sandbox.__setupTools(A);

// Real inspectable ground + harness deps (override the few setup-time stubs).
const mat = { map: 'INIT', needsUpdate: false,
  color: { _hex: 0x222233, setHex(h) { this._hex = h; }, getHex() { return this._hex; } } };
backing.ground = { visible: false, receiveShadow: false, material: mat };
backing.renderer = { capabilities: { getMaxAnisotropy: () => 16 } };
backing.markDirty = () => {};
backing._calcGroundY = () => {};            // no-op (not under test)
backing._groundConfig = backing._groundCfgDefault;  // skip fetch; use built-in options

let pass = true, log = [];
function check(name, cond) { log.push(name + '=' + (cond ? 'PASS' : 'FAIL')); pass = pass && cond; }

// 1. apply grass → map set, color WHITE (0x222233 sum=0x77 ≥ 0x60 → true), repeat tiled, visible
A._applyGroundTexture('grass');
check('grass_map_set', mat.map && mat.map !== null && mat.map !== 'INIT');
check('grass_color_white', mat.color._hex === 0xffffff);
check('grass_repeat_tiled', mat.map.repeat.x === 64 && mat.map.repeat.y === 64);
check('grass_srgb', mat.map.colorSpace === 'SRGB');
check('grass_key', A._groundTexKey === 'grass');
check('grass_visible', backing.ground.visible === true);

// 2. night-dark target WITH photo active → DIM (0x555566), NOT blacken, map kept
A._setGroundColor(0x0a0a15);                 // night
check('night_dimmed_not_black', mat.color._hex === 0x555566);
check('night_keeps_photo', mat.map && mat.map !== null);

// 3. switch to 'none' → map cleared, flat color restored (no throw)
A._applyGroundTexture('none');
check('none_map_cleared', mat.map === null);
check('none_key', A._groundTexKey === 'none');

// 4. with NO photo, a normal color sets through verbatim
A._setGroundColor(0x222233);
check('nomap_color_verbatim', mat.color._hex === 0x222233);

console.log('§GROUND_TEST ' + log.join(' | '));
console.log('§GROUND_TEST result=' + (pass ? 'PASS' : 'FAIL'));
process.exit(pass ? 0 : 1);
