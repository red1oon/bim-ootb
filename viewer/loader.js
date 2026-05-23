// loader.js — Progressive script loader: local-first, CDN fallback
// §S276: Three.js r184 ESM upgrade — import map + window.THREE shim
// WASM binary fetch starts immediately — downloads in parallel with JS libs
const _wasmBinaryPromise = fetch('lib/sql-wasm.wasm')
  .then(r => r.ok ? r.arrayBuffer().then(b => new Uint8Array(b)) : null)
  .catch(() => fetch('https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.wasm')
    .then(r => r.ok ? r.arrayBuffer().then(b => new Uint8Array(b)) : null)
    .catch(() => null));
const _loadStart = performance.now();
const _elapsedEl = document.getElementById('load-elapsed');
const _timerIv = setInterval(() => {
  const s = Math.floor((performance.now() - _loadStart) / 1000);
  _elapsedEl.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}, 1000);

// Local-first, CDN fallback (SQLite + SheetJS remain UMD <script> inject)
const LIBS = [
  { name: 'SQLite (WASM+RTree)',
    url: 'lib/sql-wasm.js',
    cdn: 'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.js' },
  { name: 'SheetJS (Excel)',
    url: 'lib/xlsx.full.min.js',
    cdn: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' },
];

// Create progress rows — 4 items: Three.js(0), OrbitControls(1), SQLite(2), SheetJS(3)
const _PROGRESS_NAMES = ['Three.js r184', 'OrbitControls', 'SQLite (WASM+RTree)', 'SheetJS (Excel)'];
const loadItems = document.getElementById('load-items');
_PROGRESS_NAMES.forEach((name, i) => {
  const row = document.createElement('div');
  row.id = `lib-${i}`;
  row.style.cssText = 'margin:4px 0;font-size:12px;color:#aaa';
  row.innerHTML = `
    <div style="display:flex;justify-content:space-between">
      <span>${name}</span>
      <span id="lib-${i}-status" style="color:#666">waiting...</span>
    </div>
    <div style="height:3px;background:#333;border-radius:2px;margin-top:2px">
      <div id="lib-${i}-bar" style="height:100%;width:0%;background:#4fc3f7;border-radius:2px;transition:width 0.05s"></div>
    </div>
  `;
  loadItems.appendChild(row);
});

async function fetchWithProgress(url, index) {
  const statusEl = document.getElementById(`lib-${index}-status`);
  const barEl = document.getElementById(`lib-${index}-bar`);
  statusEl.textContent = 'connecting...';
  statusEl.style.color = '#4fc3f7';

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(url + ' → ' + resp.status);
  const total = +resp.headers.get('Content-Length') || 0;
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  const t0 = performance.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pct = total > 0 ? (received / total * 100) : 0;
    const speed = received / ((performance.now() - t0) / 1000);
    const eta = total > 0 ? Math.ceil((total - received) / speed) : '?';
    barEl.style.width = (total > 0 ? pct : 50) + '%';
    statusEl.textContent = total > 0
      ? `${(received/1024).toFixed(0)}/${(total/1024).toFixed(0)}KB  ${(speed/1024).toFixed(0)}KB/s  ~${eta}s`
      : `${(received/1024).toFixed(0)}KB`;
  }

  barEl.style.width = '100%';
  barEl.style.background = '#44cc44';
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  statusEl.textContent = `${(received/1024).toFixed(0)}KB in ${elapsed}s`;
  statusEl.style.color = '#44cc44';

  // Inject as script
  const blob = new Blob(chunks, { type: 'application/javascript' });
  const script = document.createElement('script');
  script.src = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Local-first, CDN fallback loader
// libIdx = index into LIBS[], progressIdx = index of progress bar row (lib-N-status/bar)
async function loadLibAt(libIdx, progressIdx) {
  var lib = LIBS[libIdx];
  try {
    await fetchWithProgress(lib.url, progressIdx);
    return;
  } catch(e) {
    console.warn('[loader] §LOCAL_FAIL ' + lib.name + ' — falling back to CDN');
    var statusEl = document.getElementById('lib-' + progressIdx + '-status');
    if (statusEl) { statusEl.textContent = 'CDN fallback...'; statusEl.style.color = '#ff8c00'; }
    var barEl = document.getElementById('lib-' + progressIdx + '-bar');
    if (barEl) { barEl.style.width = '0%'; barEl.style.background = '#4fc3f7'; }
  }
  await fetchWithProgress(lib.cdn, progressIdx);
}

async function loadAllLibs() {
  // ── §S276: Three.js r184 ESM bootstrap ──────────────────────────────────────
  // Load Three.js as ESM module, expose as window.THREE for all existing scripts.
  // Local-first, CDN fallback. r184 splits into three.module.min.js + three.core.min.js.
  var _threeT0 = performance.now();
  var _threeStatusEl = document.getElementById('lib-0-status');
  var _threeBarEl = document.getElementById('lib-0-bar');
  if (_threeStatusEl) { _threeStatusEl.textContent = 'importing ESM...'; _threeStatusEl.style.color = '#4fc3f7'; }

  // §S276: Load WebGPU build, fallback to standard ESM
  try {
    const _esm = await import('./lib/three.webgpu.min.js');
    const _three = {};
    for (const k of Object.keys(_esm)) _three[k] = _esm[k];
    window.THREE = _three;
    console.log('§UPGRADE_THREE local WebGPU ESM loaded r=' + THREE.REVISION + ' WebGPURenderer=' + (typeof THREE.WebGPURenderer));
  } catch(e) {
    console.warn('§UPGRADE_THREE_LOCAL_FAIL ' + e.message + ' — trying standard ESM');
    try {
      const _esm = await import('./lib/three.module.min.js');
      const _three = {};
      for (const k of Object.keys(_esm)) _three[k] = _esm[k];
      window.THREE = _three;
      console.log('§UPGRADE_THREE standard ESM fallback loaded r=' + THREE.REVISION);
    } catch(e2) {
      console.error('§UPGRADE_THREE_FAIL ESM unavailable: ' + e2.message);
      document.getElementById('status').textContent = 'Three.js failed — requires modern browser with ESM support';
      throw e2;
    }
  }
  var _threeMs = (performance.now() - _threeT0).toFixed(0);
  if (_threeBarEl) { _threeBarEl.style.width = '100%'; _threeBarEl.style.background = '#44cc44'; }
  if (_threeStatusEl) { _threeStatusEl.textContent = 'r' + (THREE.REVISION || '?') + ' in ' + _threeMs + 'ms'; _threeStatusEl.style.color = '#44cc44'; }
  console.log('§UPGRADE_THREE_DONE r=' + THREE.REVISION + ' ms=' + _threeMs + ' BatchedMesh=' + (typeof THREE.BatchedMesh));

  // §S258/S259: Disable color management IMMEDIATELY — before ANY Color/Material created
  THREE.ColorManagement.enabled = false;  // enabling breaks HSL color slider palettes
  console.log('§COLOR_MGMT enabled=' + THREE.ColorManagement.enabled);

  // ── §S260: OrbitControls ESM ────────────────────────────────────────────────
  var _ocT0 = performance.now();
  if (document.getElementById('lib-1-status')) {
    document.getElementById('lib-1-status').textContent = 'importing ESM...';
    document.getElementById('lib-1-status').style.color = '#4fc3f7';
  }
  try {
    const OC = await import('./lib/OrbitControls.module.js');
    THREE.OrbitControls = OC.OrbitControls;
    window.OrbitControls = OC.OrbitControls;
    console.log('§UPGRADE_ORBIT local ESM loaded');
  } catch(e) {
    console.warn('§UPGRADE_ORBIT_LOCAL_FAIL ' + e.message + ' — trying CDN');
    try {
      const OC = await import('https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/controls/OrbitControls.js');
      THREE.OrbitControls = OC.OrbitControls;
      window.OrbitControls = OC.OrbitControls;
      console.log('§UPGRADE_ORBIT CDN ESM loaded');
    } catch(e2) {
      // §S276: No IIFE fallback — r184 OrbitControls is ESM only
      console.error('§UPGRADE_ORBIT_FAIL ESM unavailable: ' + e2.message);
      throw e2;
    }
  }
  var _ocMs = (performance.now() - _ocT0).toFixed(0);
  if (document.getElementById('lib-1-bar')) { document.getElementById('lib-1-bar').style.width = '100%'; document.getElementById('lib-1-bar').style.background = '#44cc44'; }
  if (document.getElementById('lib-1-status')) { document.getElementById('lib-1-status').textContent = 'done in ' + _ocMs + 'ms'; document.getElementById('lib-1-status').style.color = '#44cc44'; }
  console.log('§UPGRADE_ORBIT_DONE ms=' + _ocMs + ' OrbitControls=' + (typeof window.OrbitControls));

  // §S260: Verify key APIs exist (whitebox checkpoint)
  console.log('§UPGRADE_API_CHECK BatchedMesh=' + (typeof THREE.BatchedMesh) +
    ' InstancedMesh=' + (typeof THREE.InstancedMesh) +
    ' BufferGeometry=' + (typeof THREE.BufferGeometry) +
    ' WebGLRenderer=' + (typeof THREE.WebGLRenderer) +
    ' NeutralToneMapping=' + THREE.NeutralToneMapping +
    ' SRGBColorSpace=' + THREE.SRGBColorSpace);

  // §6.5 BVH acceleration — three-mesh-bvh monkey-patch
  // §S276: Upgrade 0.7.8→0.8.0 (0.8.x targets Three.js r170+)
  console.log('§BVH_LOADING importing three-mesh-bvh@0.8.0 from CDN...');
  var _bvhT0 = performance.now();
  try {
    const bvh = await import('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.8.0/+esm');
    var _bvhMs = (performance.now() - _bvhT0).toFixed(0);
    console.log('§BVH_FETCHED ms=' + _bvhMs + ' exports=' + Object.keys(bvh).join(','));
    if (!bvh.computeBoundsTree) throw new Error('computeBoundsTree not exported');
    if (!bvh.acceleratedRaycast) throw new Error('acceleratedRaycast not exported');
    THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = bvh.disposeBoundsTree;
    THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
    window._bvhReady = true;
    console.log('§BVH_INIT three-mesh-bvh v0.8.0 monkey-patch applied in ' + _bvhMs + 'ms');
    // Verify: test raycast on a dummy geometry
    try {
      var _testGeo = new THREE.BufferGeometry();
      _testGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]), 3));
      _testGeo.setIndex(new THREE.BufferAttribute(new Uint16Array([0,1,2]), 1));
      _testGeo.computeBoundsTree();
      var _hasBT = !!_testGeo.boundsTree;
      _testGeo.dispose();
      console.log('§BVH_SELFTEST boundsTree=' + _hasBT);
      if (!_hasBT) { window._bvhReady = false; console.warn('§BVH_SELFTEST_FAIL boundsTree not created'); }
    } catch(e2) {
      window._bvhReady = false;
      console.warn('§BVH_SELFTEST_FAIL ' + e2.message);
    }
  } catch(e) {
    window._bvhReady = false;
    console.warn('§BVH_INIT_FAIL ' + e.message + ' — raycasting at normal speed');
  }

  // sql.js is needed for DB; load it before starting viewer
  // LIBS[0]=SQLite, but progress bar = lib-2
  await loadLibAt(0, 2);  // SQLite → progress row 2

  // Critical path done — wait for main.js to define initViewer (may still be loading on mobile)
  clearInterval(_timerIv);

  async function _startViewer() {
    document.getElementById('load-overlay').style.display = 'none';
    document.getElementById('canvas').style.display = 'block';
    try {
      await initViewer();
    } catch(e) {
      document.getElementById('status').textContent = `Init error: ${e.message}`;
      console.error('[S205] §INIT_VIEWER_ERROR', e);
    }
  }

  if (typeof initViewer === 'function') {
    _startViewer();
  } else {
    // main.js hasn't loaded yet — poll briefly (mobile: local WASM faster than script parse)
    var _waitCount = 0;
    var _waitIv = setInterval(function() {
      if (typeof initViewer === 'function') { clearInterval(_waitIv); _startViewer(); }
      else if (++_waitCount > 100) { // 5s max
        clearInterval(_waitIv);
        document.getElementById('status').textContent = 'Error: main.js failed to load';
        console.error('§INIT_VIEWER_TIMEOUT initViewer not defined after 5s');
      }
    }, 50);
  }

  // SheetJS loads in background — excel.js handles typeof XLSX === 'undefined' gracefully
  loadLibAt(1, 3).catch(e => {  // LIBS[1]=SheetJS → progress row 3
    console.warn('[loader] §SHEETJS_LOAD_FAIL (Excel export unavailable):', e.message);
  });
}

function retryLoad() {
  location.reload();
}

loadAllLibs().catch(e => {
  document.getElementById('status').textContent = `Load error: ${e.message}`;
  document.getElementById('load-items').innerHTML += `
    <div style="color:#ff6644;margin-top:10px">Failed: ${e.message}</div>
    <button onclick="retryLoad()" style="margin-top:10px;padding:8px 20px;background:#4fc3f7;color:#000;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;width:100%">Tap to Retry</button>
  `;
});
