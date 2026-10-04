#!/usr/bin/env node
// W-UNITS-DECLARED + W-DISC-FILENAME (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §A.5, §B.2a)
// Issue proved/disproved: (1) a declared-metre model >1.5 km was crushed x0.001 by the old span
// heuristic; (2) civil discipline files (names with spaces, words not in VALID_DISCS) all landed
// as ARC. Runs the REAL viewer/import_worker.js in a vm sandbox (not a copy), web-ifc from node.
// Usage: node witness_import_units_disc.js <file.ifc> [<file.ifc> ...]   — read the § lines.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Buffer } = require('buffer');
const WEBIFC = process.env.WEBIFC_NODE || '/home/red1/bim-compiler/node_modules/web-ifc/web-ifc-api-node.js';
const WebIFC = require(WEBIFC);
const _init = WebIFC.IfcAPI.prototype.Init;
WebIFC.IfcAPI.prototype.Init = function () { return _init.call(this); };  // node resolves its own wasm
const SRC = fs.readFileSync(process.env.WORKER_SRC || path.join(__dirname, '..', 'import_worker.js'), 'utf8');

function runOne(file) {
  return new Promise((resolve) => {
    const logs = [];
    const self = {};
    const ctx = {
      self, WebIFC, console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
      importScripts: () => {}, URL, Blob, TextDecoder, TextEncoder, setTimeout, Math, JSON, Date,
      Float32Array, Int32Array, Uint8Array, Uint32Array, Uint16Array, ArrayBuffer, Map, Set, Promise, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    };
    self.postMessage = (msg) => { if (msg.type === 'done' || msg.type === 'error') resolve({ msg, logs }); };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'import_worker.js' });
    const buf = fs.readFileSync(file);
    self.onmessage({ data: { arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), filename: path.basename(file) } });
  });
}

(async () => {
  for (const f of process.argv.slice(2)) {
    const { msg, logs } = await runOne(f);
    const name = path.basename(f);
    if (msg.type === 'error') { console.log(`§W_IMPORT file=${name} ERROR ${msg.message}`); continue; }
    logs.filter(l => /§UNITS_V|§GEOREF_REBASE/.test(l)).forEach(l => console.log('  ' + l));
    const els = msg.elements || (msg.extracted && msg.extracted.elements) || [];
    const tr = msg.transforms || (msg.extracted && msg.extracted.transforms) || [];
    const disc = {};
    for (const e of els) disc[e.discipline] = (disc[e.discipline] || 0) + 1;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of tr) { const c = [t.cx, t.cy, t.cz]; for (let a = 0; a < 3; a++) { if (c[a] < mn[a]) mn[a] = c[a]; if (c[a] > mx[a]) mx[a] = c[a]; } }
    const span = tr.length ? mn.map((v, a) => (mx[a] - v).toFixed(1)).join('x') : 'n/a';
    const verdict = tr.length === 0 ? 'INCONCLUSIVE (0 transforms)' : 'MEASURED';
    console.log(`§W_IMPORT file=${name} elements=${els.length} transforms=${tr.length} centreSpan=${span}m disc=${JSON.stringify(disc)} unitScale=${msg.meta && msg.meta.unitScale} ${verdict}`);
  }
})();
