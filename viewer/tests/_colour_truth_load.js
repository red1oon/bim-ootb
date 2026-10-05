// Shared node loader for the Z19/Z20/Z21 unit witnesses: runs the SHIPPED streaming.js (setupStreaming) in a vm with a minimal
// THREE stub (Color / MeshStandardMaterial record their inputs), so every verdict is read off the real _getMaterial.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function loadStreaming() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'streaming.js'), 'utf8');
  class Color { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } }
  class MSM { constructor(o) { Object.assign(this, o); this.userData = {}; } }
  const THREE = { Color, MeshStandardMaterial: MSM, FrontSide: 0, BackSide: 1, DoubleSide: 2, Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    TextureLoader: class { load() { return {}; } }, RepeatWrapping: 1, SRGBColorSpace: 'srgb' };
  const A = { DISC_COLORS: { ARC: 0x4488ff, STR: 0x44cccc, MEP: 0x44cc44, ELEC: 0xcccc44, FP: 0xcc8844, ACMV: 0xcc4444, PLB: 0x8844cc, HEAT: 0xff6644, HVAC: 0x44aacc, SAN: 0xaa44aa, VENT: 0x88ccaa, VOID: 0x666666 }, _matCache: {}, _envMap: {} };
  const logs = [];
  const ctx = { URLSearchParams, URL, Map, Set, navigator: { maxTouchPoints: 0, userAgent: '' }, screen: { width: 1920 },
    document: { createElement: () => ({ getContext: () => null }), addEventListener() {} }, addEventListener() {}, setTimeout, clearTimeout,
    location: { search: '' }, console: { log: m => logs.push(String(m)), warn: m => logs.push(String(m)), error: m => logs.push(String(m)) }, THREE, performance: { now: () => 0 }, APP: A };
  ctx.window = ctx;
  vm.runInNewContext(src + '\nsetupStreaming(APP);', ctx);
  return { A, logs };
}
function mat(A, rgba, cls, variant, disc, hint, name) { A._matCache = {}; return A._getMaterial(rgba, cls, variant || '', disc || '', hint || null, name || ''); }
function col(m) { return [m.color.r, m.color.g, m.color.b].map(v => +v.toFixed(6)).join(','); }
module.exports = { loadStreaming, mat, col };
