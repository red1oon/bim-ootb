// test_recolor_guard.js — WHITEBOX regression for the Sunglass palette crash.
//
// ISSUE PROVED: S280 (b142d94) removed the colorless-material guard that S279
// (3a3df2f) added to A._recolorMesh. Without it, applyPalette feeds EVERY isMesh
// in the scene to _recolorMesh, including the atmospheric Sky mesh whose
// ShaderMaterial has no `.color` → `TypeError: newMat.color is undefined`, flooding
// the console every time the Sunglass palette slider moves.
//
// This test loads the REAL setupTools() from viewer/tools.js (no source-string
// grepping) and calls the REAL A._recolorMesh against three material shapes:
//   1. a MeshStandard-like material WITH .color   → must recolor, no throw
//   2. a ShaderMaterial-like material WITHOUT .color (the Sky) → must NOT throw
//   3. a null material                            → must NOT throw
// PASS = no throw on (2)/(3) AND (1) still recolors. FAIL = any throw, or (1) skipped.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const toolsPath = path.join(__dirname, '..', 'viewer', 'tools.js');
const src = fs.readFileSync(toolsPath, 'utf8');

// Generic chainable stub so `new THREE.Plane(...)`, `THREE.DoubleSide`, etc. all work.
function makeStub() {
  const fn = function () { return STUB; };
  return new Proxy(fn, {
    get: () => STUB,
    apply: () => STUB,
    construct: () => STUB,
  });
}
const STUB = makeStub();

const sandbox = {
  THREE: STUB,
  document: { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) },
  window: {},
  console: { log() {}, warn() {}, error() {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// Define setupTools in the sandbox, then grab it.
vm.runInContext(src + '\n;this.__setupTools = setupTools;', sandbox, { filename: 'tools.js' });
const setupTools = sandbox.__setupTools;

// A tolerates arbitrary access (A.canvas.addEventListener, A.renderer, ...) at setup
// time while storing real assignments (A._recolorMesh, A._sunglassBackups).
const backing = {};
const A = new Proxy(backing, {
  get: (t, p) => (p in t ? t[p] : STUB),
  set: (t, p, v) => { t[p] = v; return true; },
});
setupTools(A);              // populates A._recolorMesh (and the rest)
A._sunglassBackups = [];

const color = {};           // stand-in THREE.Color arg
let pass = true, log = [];

// (1) colored material — must recolor
let copied = false;
const m1 = { material: { color: { copy() { copied = true; } }, clone() { return this; }, needsUpdate: false } };
try {
  A._recolorMesh(m1, color);
  const ok = copied && A._sunglassBackups.length === 1;
  log.push(`colored: recolored=${copied} backedUp=${A._sunglassBackups.length === 1} -> ${ok ? 'PASS' : 'FAIL'}`);
  pass = pass && ok;
} catch (e) { log.push(`colored: THREW ${e.message} -> FAIL`); pass = false; }

// (2) ShaderMaterial (Sky) — no .color — must NOT throw, must NOT recolor
const beforeBackups = A._sunglassBackups.length;
const m2 = { material: { /* no color */ clone() { return this; } } };
try {
  A._recolorMesh(m2, color);
  const ok = A._sunglassBackups.length === beforeBackups; // skipped, no backup
  log.push(`shader(Sky): noThrow=true skipped=${ok} -> ${ok ? 'PASS' : 'FAIL'}`);
  pass = pass && ok;
} catch (e) { log.push(`shader(Sky): THREW ${e.message} -> FAIL`); pass = false; }

// (3) null material — must NOT throw
const m3 = { material: null };
try {
  A._recolorMesh(m3, color);
  log.push(`null-mat: noThrow=true -> PASS`);
} catch (e) { log.push(`null-mat: THREW ${e.message} -> FAIL`); pass = false; }

console.log('§RECOLOR_GUARD ' + log.join(' | '));
console.log(`§RECOLOR_GUARD result=${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
