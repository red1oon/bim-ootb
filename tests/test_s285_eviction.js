// test_s285_eviction.js — S285 City bounded-working-set eviction (logic/maths proof)
//
// Proves issue S285-EVICT: streamed buildings accumulate without bound (Firefox OOM).
// This test loads the REAL viewer/city.js and exercises the eviction machinery against
// a mock scene to prove the BUILDING-AGNOSTIC logic — what gets evicted, the byte tally,
// active-building protection, and guidMap/_instanceMeta teardown. (The WebGL dispose +
// visual bbox return is browser-verified; this proves the maths that decides eviction.)
//
// Run: node tests/test_s285_eviction.js   (writes + reads tests/log/s285_eviction.log)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(__dirname, 'log', 's285_eviction.log');
const lines = [];
const L = (s) => { lines.push(s); };

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; L('  PASS ' + msg); } else { fail++; L('  FAIL ' + msg); } }

// ── Load the real city.js into a sandbox (THREE stubbed; setupCity only DEFINES fns) ──
const src = fs.readFileSync(path.join(ROOT, 'viewer', 'city.js'), 'utf8');
function stubEl() {
  const el = { style: {}, classList: { add() {}, remove() {} }, textContent: '', disabled: false,
    appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector: () => stubEl(),
    onclick: null };
  return el;
}
const _doc = { createElement: () => stubEl(), getElementById: () => stubEl(), body: stubEl(),
  querySelector: () => stubEl(), addEventListener() {} };
const sandbox = {
  THREE: { Matrix4: function () { this.makeScale = () => this; this.elements = []; } },
  console: { log: (...a) => L('§ ' + a.join(' ')), warn: (...a) => L('WARN ' + a.join(' ')) },
  performance: undefined, document: _doc, fetch: undefined, Set, Map, _TRL: undefined,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\n;this.setupCity = setupCity;', sandbox);

// ── Mock APP ──
let _idSeq = 1;
function makeScene() {
  const children = [];
  return {
    children,
    add(o) { children.push(o); },
    remove(o) { const i = children.indexOf(o); if (i >= 0) children.splice(i, 1); },
  };
}
function instMesh(elementCount) {        // instance buffer = elementCount * 16 floats * 4 bytes
  return { id: _idSeq++, isMesh: true, isInstancedMesh: true, userData: {},
    instanceMatrix: { array: { byteLength: elementCount * 16 * 4 }, needsUpdate: false },
    _disposed: false, dispose() { this._disposed = true; } };
}
function batchedMesh(vertBytes, idxBytes) {  // owns merged geometry buffers
  return { id: _idSeq++, isMesh: true, isBatchedMesh: true, userData: {},
    geometry: { attributes: { position: { array: { byteLength: vertBytes } } }, index: { array: { byteLength: idxBytes } } },
    _disposed: false, dispose() { this._disposed = true; } };
}

const A = {
  CITY_URL: 'x', scene: makeScene(), _cityHidden: [],
  _instanceMeta: {}, guidMap: {}, buildingsRendered: new Set(), savedStreams: {},
  markDirty() {}, dlodEnable: null,
  collectMeshes(fn) { return A.scene.children.filter(fn); },
};
sandbox.setupCity(A);

const MB = 1048576;
A._cityMemBudgetMB = 100;   // aggressive budget for the test

// Helper: simulate a building stream — snapshot, add objects, tag+budget.
function streamBuilding(name, objs) {
  A._cityPreStreamIds = new Set(A.scene.children.map(c => c.id));   // pre-stream snapshot
  objs.forEach(o => {
    A.scene.add(o);
    // register guidMap + instanceMeta as the real streamer would, to prove teardown
    A.guidMap[o.id] = name + '_guid';
    A.guidMap[o.id + '_0'] = name + '_slot0';
    A._instanceMeta[o.id] = [{ guid: name }];
  });
  A._cityTagAndBudget(name);
}

L('=== S285 eviction logic — budget=' + A._cityMemBudgetMB + 'MB ===');

// T1 — first building under budget: resident, no eviction
L('T1: Building A (~62MB) — under budget, stays');
const aObjs = [instMesh(500000), batchedMesh(20 * MB, 10 * MB)];  // 32MB inst + 30MB batched = 62MB < 100
streamBuilding('A', aObjs);
assert(A._cityResidentOrder.length === 1 && A._cityResidentOrder[0] === 'A', 'A resident, no evict');
const aBytes = A._cityResidentBytes();
assert(aBytes > 0 && aBytes <= 100 * MB, 'A ownedMB tallied and under budget (' + (aBytes / MB).toFixed(1) + 'MB)');

// T2 — second building pushes over budget: oldest (A) evicted, B kept
L('T2: Building B (~62MB) — over budget, evicts oldest A');
const bObjs = [instMesh(500000), batchedMesh(20 * MB, 10 * MB)];
streamBuilding('B', bObjs);
assert(A._cityResidentOrder.length === 1 && A._cityResidentOrder[0] === 'B', 'only B resident (A evicted as oldest)');
assert(aObjs.every(o => o._disposed), 'A objects disposed');
assert(aObjs.every(o => A.scene.children.indexOf(o) === -1), 'A objects removed from scene');
assert(!A.buildingsRendered.has('A'), 'A dropped from buildingsRendered (re-click re-streams)');
assert(Object.keys(A.guidMap).filter(k => A.guidMap[k].startsWith('A_')).length === 0, 'A guidMap entries cleaned');
assert(!A._instanceMeta[aObjs[0].id], 'A _instanceMeta cleaned');
assert(A._cityBuildingBytes['A'] === undefined, 'A byte tally removed');

// T3 — active building alone exceeds budget: NOT evicted (never evict the just-streamed one)
L('T3: Building C (150MB) alone > budget — active C protected');
const cObjs = [batchedMesh(100 * MB, 50 * MB)];  // 150MB > 100MB budget
streamBuilding('C', cObjs);
assert(A._cityResidentOrder.length === 1 && A._cityResidentOrder[0] === 'C', 'C resident; B evicted; C kept despite > budget');
assert(A._cityResidentBytes() > 100 * MB, 'residentBytes may exceed budget when single active building is oversized (expected)');
assert(cObjs.every(o => !o._disposed), 'C (active) not disposed');

// T4 — InstancedMesh geometry is NOT counted (shared); only instance buffer counts
L('T4: byte accounting — InstancedMesh counts instanceMatrix only');
const im = instMesh(2);                       // 2*16*4 = 128 bytes
assert(A._cityObjBytes(im) === 128, 'InstancedMesh ownedBytes = instanceMatrix only (128B, geometry shared)');
const bm = batchedMesh(1000, 400);
assert(A._cityObjBytes(bm) === 1400, 'BatchedMesh ownedBytes = vert+index buffers (1400B, owned)');

L('');
L('RESULT pass=' + pass + ' fail=' + fail);

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, lines.join('\n') + '\n');
process.stdout.write(lines.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
