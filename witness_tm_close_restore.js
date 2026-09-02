/**
 * witness_tm_close_restore.js — Time Machine panel-close restore bug.
 *
 * ISSUE PROVEN: closing Time Machine (deactivate(), the `t` toggle / panel-close path) must return
 * EVERY element to its pre-TM, fully-built, non-ghosted material state. §Z_STACK_XRAY_STAGING gives an
 * element a cloned grey/0.3-opacity "ghost" material (`applyHighlight` + `obj._tm_xrayStaged = true`)
 * while it is waiting on its own support carrier to finish. `renderAtTime()`'s per-tick `clearHighlight()`
 * deliberately SKIPS `_tm_xrayStaged` meshes (a real, commented perf optimization for the scrub-tick path:
 * "sustained staged population... renderAtTime's own showReal branch restores them explicitly, exactly
 * once, on the tick they resolve"). But `deactivate()` -> `restoreVisibility()` also calls that SAME
 * `clearHighlight()` — so any element still staged at the moment TM is closed keeps its cloned ghost
 * material FOREVER (until a future TM re-activation happens to revisit that guid). This directly matches
 * the live report: "when the TM panel is killed, the scene does not restore to full building."
 *
 * Whitebox: brace-match-extracts the REAL shipped `applyHighlight`, `restoreMaterial`, `clearAllOutlines`,
 * `removeOutline`, `clearHighlight`, `restoreVisibility`, `deactivate` functions verbatim out of
 * viewer/time_machine.js (same idiom as tests/test_tm_broadcast.js's marker-slice, generalized to
 * non-contiguous functions since these are ~4000 lines apart from each other in the file). Everything
 * `deactivate()` calls that is NOT one of those (stopPlayback, clearSparks, restoreSky, _dlodDisposeBoxes,
 * etc.) is stubbed as a no-op — irrelevant to this specific defect, same stubbing discipline the existing
 * test already uses for renderAtTime/anchorFromCursor/configSlider.
 *
 * Run: node witness_tm_close_restore.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  \u{1F7E2} ' + msg); } else { fail++; console.log('  \u{1F534} FAIL: ' + msg); } }

const src = fs.readFileSync(path.join(__dirname, 'viewer', 'time_machine.js'), 'utf8');

// ── brace-matching function extractor ──
function extractFn(name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('§TEST could not locate function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('§TEST unbalanced braces for ' + name);
  return src.slice(start, end);
}

const FNS = ['applyHighlight', 'restoreMaterial', 'clearAllOutlines', 'removeOutline', 'clearHighlight',
             'restoreVisibility', 'deactivate'];
const logic = FNS.map(extractFn).join('\n\n');
console.log('§EXTRACT bytes=' + logic.length + ' fns=' + FNS.join(','));

// ── fakes ──
function fakeMaterial(name) {
  return {
    name: name,
    emissive: { setHex: function () {} },
    emissiveIntensity: 0,
    transparent: false,
    opacity: 1,
    depthTest: true,
    needsUpdate: false,
    _disposed: false,
    clone: function () { return fakeMaterial(name + '_clone'); },
    dispose: function () { this._disposed = true; }
  };
}
function fakeMesh(guid) {
  return { userData: { guid: guid }, isMesh: true, renderOrder: 0, material: fakeMaterial(guid + '_ORIG') };
}

function mkSandbox() {
  const fakeApp = {
    scene: { traverse: function () {} },
    ground: { visible: true }, _shadowOn: false,
    _giN8aoPass: null, _giComposerActive: false, toggleGIPreview: function () {},
    markDirty: function () {}
  };
  const fakeEl = { style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} }, textContent: '' };
  const s = Object.assign({
    // ── module state deactivate()/restoreVisibility()/clearHighlight() read or write ──
    _active: true, _panel: Object.assign({}, fakeEl),
    _highlightMeshes: [], _outlineMeshes: [], _highlightLogTick: 0, _wbLogCount: 0,
    _savedVisibility: [], _savedInstanceState: {}, _savedBatchState: {}, _savedInstanceMatrices: {},
    _tmXraySolidifyTs: {}, _tmXrayStagedTotal: 0, _tmXraySolidifiedN: 0,
    _evMesh: null, _evSig: '', _incrPrimed: false,
    _dlodProxyOn: true, _lastProxyEngaged: 1, _dlodLastCamSig: 'x',
    _sunCycle: true, _camFollow: true, _camAngle: 1, _camTarget: {}, _cineStoryboard: [1],
    _bgBuildRaf: 0, _cineSceneIdx: 1, _cineHeroSlowdown: true, _cineEstabStart: 1, _cineEstabEnd: 2,
    _cinePeeled: [],
    _ganttVisible: true, _dashVisible: true, _sCurveData: {}, _shopfloor: {}, _shopfloorLoading: true,
    _ganttTasks: [1], _ganttTasksComputed: true,
    _varVisible: true, _opsPlanned: {}, _tmEnabledGI: false,
    // ── functions deactivate() calls that are NOT under test — stubbed no-ops ──
    stopPlayback: function () {}, clearSparks: function () {}, _gspClear: function () {},
    restoreSky: function () {}, restorePeeled: function () { s._cinePeeled = []; },
    _dlodDisposeBoxes: function () {}, invalidateGanttModel: function () {}, toggleDashDOM: function () {},
    _giCancelConverge: function () {}, setToolbarHighlight: function () {}, viewerStatus: function () {},
    cancelAnimationFrame: function () {}, A: function () { return fakeApp; },
    renderAtTime: function () {},
    window: { __tmOverlaySync: function () {} },
    document: { getElementById: function () { return Object.assign({}, fakeEl); } },
    console: { log: function () {}, warn: function () {} }
  });
  vm.runInNewContext(logic + '\n; globalThis.__applyHighlight = applyHighlight; globalThis.__deactivate = deactivate;', s);
  return s;
}

// ── Build the scenario: one NORMAL highlighted mesh (e.g. frontier glow, not staged) + one
// XRAY-STAGED ghosted mesh (waiting on its support carrier) — both alive when TM is closed. ──
const sb = mkSandbox();
const meshFrontier = fakeMesh('GUID-FRONTIER');
const meshStaged = fakeMesh('GUID-STAGED');
sb.__applyHighlight(meshFrontier, 0xff8c00, 0.85, 0.4);              // normal frontier glow
sb.__applyHighlight(meshStaged, 0x888888, 0.3, 0);                    // §Z_STACK_XRAY_STAGING ghost
meshStaged._tm_xrayStaged = true;                                     // set by renderAtTime's showReal branch, replicated here

const origFrontierMat = meshFrontier._tm_origMaterial;
const origStagedMat = meshStaged._tm_origMaterial;

assert(meshFrontier._tm_highlighted === true && meshFrontier.material !== origFrontierMat,
  'setup: frontier mesh is highlighted with a cloned material (pre-close)');
assert(meshStaged._tm_highlighted === true && meshStaged._tm_xrayStaged === true && meshStaged.material.opacity === 0.3,
  'setup: staged mesh is ghosted (grey, opacity 0.3) pending its support carrier (pre-close)');

// ── Close Time Machine (the real, shipped deactivate()) ──
sb.__deactivate();

console.log('\n§TM_CLOSE_RESTORE frontier.material===orig:' + (meshFrontier.material === origFrontierMat) +
  ' staged.material===orig:' + (meshStaged.material === origStagedMat) +
  ' staged.opacity=' + meshStaged.material.opacity + ' staged._tm_highlighted=' + meshStaged._tm_highlighted +
  ' staged._tm_xrayStaged=' + meshStaged._tm_xrayStaged + '\n');

assert(meshFrontier.material === origFrontierMat && meshFrontier._tm_highlighted === false,
  'W-TM-CLOSE-1: ordinary highlighted mesh IS restored to its original material on close');
assert(meshStaged.material === origStagedMat,
  'W-TM-CLOSE-2 (THE BUG): xray-staged ghosted mesh is ALSO restored to its original (non-ghost) material on close — must not stay grey/0.3-opacity after TM is killed');
assert(meshStaged._tm_highlighted === false,
  'W-TM-CLOSE-3: staged mesh no longer flagged _tm_highlighted after close');
assert(meshStaged._tm_xrayStaged === false,
  'W-TM-CLOSE-4: staged mesh no longer flagged _tm_xrayStaged after close (nothing may survive TM being switched off — the project\'s own stated convention for every other TM cache)');
assert(sb._active === false, 'sanity: deactivate() actually ran (._active flips false)');

console.log('\nW-TM-CLOSE-RESTORE ' + pass + '/' + (pass + fail));
fs.writeFileSync(path.join(__dirname, 'witness_tm_close_restore.log'),
  '§TM_CLOSE_RESTORE staged.material===orig=' + (meshStaged.material === origStagedMat) +
  ' staged.opacity=' + meshStaged.material.opacity + '\n' +
  'W-TM-CLOSE-RESTORE ' + pass + '/' + (pass + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);
