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
  // Mirror THREE: add/remove read `this.children` dynamically, so a bulk
  // `scene.children = filtered` reassignment (the eviction fast-path) is honoured.
  return {
    children: [],
    add(o) { this.children.push(o); },
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); },
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
  _instanceMeta: {}, _batchMeta: {}, guidMap: {}, buildingsRendered: new Set(), savedStreams: {},
  markDirty() {}, dlodEnable: null, streaming: false, status: { textContent: '' },
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
    // register guidMap + meta as the real streamer would, to prove teardown
    A.guidMap[o.id] = name + '_guid';
    A.guidMap[o.id + '_0'] = name + '_slot0';
    if (o.isBatchedMesh) A._batchMeta[o.id] = [{ guid: name }];     // batched slots → _batchMeta
    else A._instanceMeta[o.id] = [{ guid: name }];                   // instanced → _instanceMeta
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
assert(!A._batchMeta[aObjs[1].id], 'A _batchMeta cleaned (else §CONTRACT_FAIL phantom orphans)');
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

// T5 — HANG REGRESSION: guidMap teardown must be ONE sweep, not O(objects × guidMap).
// Old per-object inner loop froze FF ~1min evicting Hospital (7.8k objs × 190k keys).
L('T5: guidMap teardown scale — evict a 4000-object building against a 200k-key guidMap');
A._cityBuildingBytes = {}; A._cityResidentOrder = []; A._cityHidden = [];
A.guidMap = {}; A.scene.children.length = 0; A.buildingsRendered = new Set();
A._cityMemBudgetMB = 1;                                  // force eviction of the older building
// 200k guidMap entries belonging to a RESIDENT building (mesh id 999999) — must be PRESERVED
for (let n = 0; n < 200000; n++) A.guidMap['999999_' + n] = 'resident_slot';
// Building D: 4000 objects (the one we'll evict)
const dObjs = []; for (let n = 0; n < 4000; n++) dObjs.push(instMesh(8));
streamBuilding('D', dObjs);
const guidBefore = Object.keys(A.guidMap).length;
// Building E (active) pushes over the 1MB budget → evicts D; times the cascade + sweep
const t0 = process.hrtime.bigint();
streamBuilding('E', [instMesh(8)]);
const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
assert(!A._cityResidentOrder.includes('D'), 'D evicted (oldest), E kept');
assert(Object.keys(A.guidMap).filter(k => k.startsWith('999999_')).length === 200000, 'resident 200k guidMap entries preserved');
assert(Object.keys(A.guidMap).filter(k => dObjs.some(o => k === String(o.id) || k.startsWith(o.id + '_'))).length === 0, 'D guidMap entries removed');
assert(elapsedMs < 1000, 'eviction+guidMap sweep completed fast (' + elapsedMs.toFixed(0) + 'ms; old O(N×M) path took seconds)');
L('  (guidMap ' + guidBefore + '→' + Object.keys(A.guidMap).length + ' keys, ' + elapsedMs.toFixed(0) + 'ms)');

// T6 — TIMEOUT REGRESSION (sw v528): a cascade evicting MANY buildings at once must be ONE
// pass over scene.children + _cityHidden, not per-building (collectMeshes + scene.remove +
// _cityHidden scan PER building was O(victims × scene) and timed out evicting ~18 at once
// with Terminal/LTU bbox layers ≈170k hidden entries).
L('T6: multi-building cascade + 100k _cityHidden — the v528 timeout scenario');
A._cityBuildingBytes = {}; A._cityResidentOrder = []; A.guidMap = {};
A.scene.children.length = 0; A.buildingsRendered = new Set(); A._cityHidden = [];
const bbox = { isInstancedMesh: true, userData: { isBboxPlaceholder: true },
  instanceMatrix: { needsUpdate: false }, setMatrixAt() {}, getMatrixAt() {} };
A._cityMemBudgetMB = 1e9;                                  // no eviction during setup
for (let b = 0; b < 20; b++) {                            // 20 buildings × (15MB + 200 objects)
  const objs = [batchedMesh(14 * MB, 1 * MB)];
  for (let n = 0; n < 200; n++) objs.push(instMesh(8));
  streamBuilding('B' + b, objs);
  for (let hi = 0; hi < 5000; hi++) A._cityHidden.push({ mesh: bbox, i: hi, m: 0, building: 'B' + b });  // 100k total
}
A._cityMemBudgetMB = 30;                                   // now force a big cascade
const t6 = process.hrtime.bigint();
streamBuilding('ACT', [batchedMesh(28 * MB, 2 * MB)]);    // active building → evicts ~all 20
const t6ms = Number(process.hrtime.bigint() - t6) / 1e6;
assert(A._cityResidentOrder.includes('ACT'), 'active building kept through the cascade');
assert(A._cityResidentOrder.length <= 3, 'cascade evicted down toward budget (resident=' + A._cityResidentOrder.length + ')');
assert(A._cityHidden.every(h => h.building === 'ACT' || A._cityResidentOrder.includes(h.building)), 'evicted buildings _cityHidden entries restored (removed)');
assert(t6ms < 1000, 'whole multi-building cascade completed fast (' + t6ms.toFixed(0) + 'ms; v528 per-building path timed out)');
L('  (evicted ' + (21 - A._cityResidentOrder.length) + ' buildings, _cityHidden→' + A._cityHidden.length + ', ' + t6ms.toFixed(0) + 'ms)');

// T7 — marquee sequential queue: drains in order, skips already-rendered, idle-guarded.
L('T7: marquee queue — sequential drain, skip already-rendered, no overlap');
const loaded = [];
A.cityLoadBuilding = function(n) { loaded.push(n); A.streaming = true; };   // mock: record + mark busy
A.buildingsRendered = new Set(['Y']);                                       // Y already rendered → skip
A.streaming = false;
A._cityPendingQueue = ['X', 'Y', 'Z'];
A._cityStreamNext();                                          // → loads X
assert(loaded.length === 1 && loaded[0] === 'X', 'streams first queued (X)');
A._cityStreamNext();                                          // streaming=true → no-op (no overlap)
assert(loaded.length === 1, 'idle-guard: no second stream while one is in flight');
A.streaming = false; A._cityStreamNext();                     // X done → skips Y (rendered) → loads Z
assert(loaded.length === 2 && loaded[1] === 'Z', 'skips already-rendered Y, streams Z');
A.streaming = false; A._cityStreamNext();                     // queue empty → no-op
assert(loaded.length === 2, 'queue drained, no extra streams');

L('T8: AUTOLOAD wave-front stop — under auto-load, stop pulling at ~85% budget (keeps nearest, no churn)');
// pin budget (earlier sections mutate it): 100MB → stop threshold = 0.85×100 = 85MB.
A._cityMemBudgetMB = 100;
const loaded8 = [];
A.cityLoadBuilding = function(n) { loaded8.push(n); A.streaming = true; };
A.buildingsRendered = new Set();
A.streaming = false;
A._cityBuildingBytes = { near: 90 * MB };       // resident 90MB ≥ 85MB threshold
A._cityResidentOrder = ['near'];
A._cityAutoLoad = true;
A._cityPendingQueue = ['far1', 'far2'];
const _logLenBefore = lines.length;
A._cityStreamNext();                            // over threshold → STOP, no stream
assert(loaded8.length === 0, 'auto-load STOPS pulling when resident ≥ 85% budget (no churn-to-farthest)');
assert(lines.slice(_logLenBefore).some(s => s.indexOf('§AUTOLOAD_STOP') >= 0), 'logs §AUTOLOAD_STOP witness');
assert(A._cityPendingQueue.length === 2, 'queue left intact (not drained past the wave-front)');

A._cityBuildingBytes = { near: 40 * MB };       // resident 40MB < 85MB → keep streaming
A.streaming = false;
A._cityStreamNext();
assert(loaded8.length === 1 && loaded8[0] === 'far1', 'auto-load CONTINUES below threshold (streams nearest queued)');

// Marquee path (flag off) must be unaffected: high resident does NOT trigger the stop.
const loaded8b = [];
A.cityLoadBuilding = function(n) { loaded8b.push(n); A.streaming = true; };
A._cityAutoLoad = false;
A._cityBuildingBytes = { near: 90 * MB };        // would stop IF auto-load — but flag off
A.streaming = false;
A._cityPendingQueue = ['m1'];
A._cityStreamNext();
assert(loaded8b.length === 1 && loaded8b[0] === 'm1', 'marquee (flag off) is unaffected by the wave-front stop');

L('T9: RAYBLAST ordering — hits → unique buildings, nearest-first, occlusion-by-absence');
// pure reduction (no raycaster/camera needed). Out-of-order, duplicate-per-building hits.
const _ord = A._cityOrderBlastHits([
  { building: 'far',  distance: 100 },
  { building: 'near', distance: 10 },
  { building: 'near', distance: 5 },   // duplicate, closer → wins
  { building: 'mid',  distance: 50 },
  { building: null,   distance: 1 },   // no building → ignored
  null,                                 // junk → ignored
]);
assert(JSON.stringify(_ord) === JSON.stringify(['near', 'mid', 'far']), 'orders unique buildings nearest-first (dedupes by min distance)');
assert(A._cityOrderBlastHits([]).length === 0, 'empty hit list → empty queue');
// a building never hit (occluded / off-screen) simply never appears → not streamed
assert(_ord.indexOf('hidden') < 0, 'un-hit (occluded/off-screen) building is absent → not queued');
// _cityRayBlast bails safely with no raycaster/camera (mock A has neither)
assert(Array.isArray(A._cityRayBlast()) && A._cityRayBlast().length === 0, 'ray-blast returns [] safely without raycaster/camera');

L('T10: AUTOLOAD trailing-edge — evict resident buildings that LEFT the view, keep visible+active');
// Spy on the cascade so we test SELECTION only (the cascade itself is proven by T1–T7).
const _realEvict = A._cityEvictVictims;
let _captured = null;
A._cityEvictVictims = function(v) { _captured = new Set(v); };   // record, skip real scene ops
A._cityMemBudgetMB = 100;                                        // watermark = 60MB
A.camera = undefined; A.buildingCentres = undefined;             // no camera → falls back to resident order
A._cityResidentOrder = ['v1', 'n1', 'n2', 'act'];
A._cityBuildingBytes = { v1: 30*MB, n1: 30*MB, n2: 30*MB, act: 30*MB };  // resident 120MB > watermark
A._cityEvictNonVisible(new Set(['v1']), 'act');                  // v1 visible, act active
assert(_captured && !_captured.has('v1'), 'visible building (v1) is NOT evicted');
assert(_captured && !_captured.has('act'), 'active building (act) is NOT evicted');
assert(_captured && _captured.has('n1') && _captured.has('n2'), 'non-visible buildings (n1,n2) evicted down to watermark');

_captured = null;                                                // under watermark → no eviction (no thrash)
A._cityBuildingBytes = { v1: 30*MB, act: 20*MB };                // resident 50MB ≤ 60MB watermark
A._cityResidentOrder = ['v1', 'act'];
A._cityEvictNonVisible(new Set(['v1']), 'act');
assert(_captured === null, 'under 60% watermark → no eviction (hysteresis, no turn-around thrash)');

A._cityEvictVictims = _realEvict;                                // restore

L('T11: RAYBLAST geometry — pure ray-vs-AABB (the 3.5s→µs fix); occlusion = nearest box wins');
const boxA = { x0: 0, y0: -1, z0: -1, x1: 2, y1: 1, z1: 1 };   // box ahead on +x
assert(A._rayAABB(-5,0,0, 1,0,0, boxA) === 5, 'ray hits box front face at t=5');
assert(A._rayAABB(-5,5,0, 1,0,0, boxA) === -1, 'ray parallel & outside (y=5) → miss (-1)');
assert(A._rayAABB(1,0,0, 1,0,0, boxA) === 1, 'origin INSIDE box → returns exit t=1 (still a hit)');
assert(A._rayAABB(5,0,0, 1,0,0, boxA) === -1, 'box entirely BEHIND ray → miss (-1)');
// occlusion: near box (t=5) shadows far box (t=20) for the same ray → ordering keeps nearest
const near = A._rayAABB(-5,0,0,1,0,0, { x0:0,y0:-1,z0:-1,x1:2,y1:1,z1:1 });
const far  = A._rayAABB(-5,0,0,1,0,0, { x0:20,y0:-1,z0:-1,x1:22,y1:1,z1:1 });
assert(near < far && near >= 0, 'nearest box has smaller t → first-hit occlusion preserved');

L('T12: SNEAK — after the visible wave, stream a resident building\'s stashed non-ARC rows (budget-guarded)');
A._cityMemBudgetMB = 100;
A.streaming = false;
A.cityBuildingDbs = { archX: { db: 'DB_X', libDb: 'LIB_X' } };
A._citySneak = { B1: { archetype: 'archX', rows: [[1],[2],[3]] } };
A._cityBuildingBytes = { B1: 30 * MB };   // resident 30MB < 85MB → room to sneak
const _rows = [];
A._cityStreamRows = (function(orig){ return function(n, a, r){ _rows.push({n:n,a:a,len:r.length}); return orig.call(A, n, a, r); }; })(A._cityStreamRows);
A._citySneakNext();
assert(A.db === 'DB_X' && A.libDb === 'LIB_X', 'sneak set DB context from cityBuildingDbs[archetype]');
assert(A.streaming === true && A.activeBuildingTotal === 3, 'sneak set streamQueue + streaming (render loop drives streamTick)');
assert(_rows.length === 1 && _rows[0].n === 'B1' && _rows[0].len === 3, 'streamed the stashed rest-rows for B1');
assert(A._citySneak.B1 === undefined, 'consumed stash (no double-sneak)');

// budget guard: at/over 85% → no sneak
A.streaming = false;
A._citySneak = { B2: { archetype: 'archX', rows: [[9]] } };
A._cityBuildingBytes = { B2: 90 * MB };   // 90 ≥ 85 → no room
const _before = A.streaming;
A._citySneakNext();
assert(A.streaming === _before && A._citySneak.B2, 'over 85% budget → sneak deferred (stash kept)');

L('');
L('RESULT pass=' + pass + ' fail=' + fail);

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, lines.join('\n') + '\n');
process.stdout.write(lines.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
