// ⚠ DO NOT REMOVE — Scope guard / §-witness for §PRECACHE-TRIM (prompts/UI_PAYLOAD_PERF.md Win #2)
// Scope: prove the viewer SW no longer auto-precaches the ~8.9MB IFC/Excel giants on install, WITHOUT
//   losing offline capability. Whitebox — loads viewer/sw.js in a stubbed VM context (no browser) and
//   exercises the real install / message / fetch handlers it registers. §-log first; READ the log.
// ISSUE proved/disproved: "the SW precaches everything (~10MB) on first install — a mobile-data cost."
//   The trim must (A) drop the giants from the INSTALL set, (B) keep the offline-download button whole
//   (GET_PRECACHE still returns the FULL set), (C) keep deferred libs offline-able by caching them on
//   first real fetch (cacheFirst). PASS = all three.
// Run:  node viewer/tests/poc_precache_trim.js 2>&1 | tee viewer/tests/poc_precache_trim.log   (cwd = bim-ootb)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GIANTS = ['web-ifc-api-iife.js', 'web-ifc.wasm', 'xlsx.full.min.js', 'exceljs.min.js'];
const base = (u) => String(u).split('?')[0].split('/').pop();

// ── Stub environment the SW expects ──────────────────────────────────────────
const installAdds = [];          // urls the install handler asks cache.add() for
const runtimePuts = [];          // urls cacheFirst writes back on a miss
let getPrecacheReply = null;     // the {assets,libs,version} the message handler posts

function makeCache(addSink, putSink) {
  return {
    add: (url) => { addSink.push(url); return Promise.resolve(); },
    put: (url) => { putSink.push(String(url)); return Promise.resolve(); },
    keys: () => Promise.resolve([]),
    match: () => Promise.resolve(undefined),
  };
}
const handlers = {};
const sandbox = {
  console,
  URL,
  Response: function (body, init) { this.body = body; this.status = (init && init.status) || 200; this.clone = () => this; },
  fetch: (req) => Promise.resolve({ status: 200, clone: () => ({ _clone: true }) }), // network "hit"
  self: {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
    registration: { scope: 'https://x/viewer/' },
  },
  caches: {
    _store: {},
    open: () => Promise.resolve(makeCache(installAdds, runtimePuts)),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    match: () => Promise.resolve(undefined), // force the miss path so cacheFirst fetches+puts
  },
};
sandbox.location = { href: 'https://x/viewer/sw.js' };

const code = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'sw.js' });

(async () => {
  let pass = true;
  const fail = (m) => { pass = false; console.log('  ✗ ' + m); };
  const okay = (m) => console.log('  ✓ ' + m);

  // ── (A) INSTALL: fire the install handler, collect what it precaches ──
  await new Promise((resolve) => {
    handlers.install({ waitUntil: (p) => Promise.resolve(p).then(resolve, resolve) });
  });
  const installBases = installAdds.map(base);
  const giantsInInstall = GIANTS.filter((g) => installBases.includes(g));
  const shellPresent = ['three.core.min.js', 'sql-wasm.wasm'].every((s) => installBases.includes(s));
  console.log('§PRECACHE-TRIM-TEST install=' + installAdds.length + ' giantsInInstall=[' + giantsInInstall.join(',') + '] shellLibsPresent=' + shellPresent);
  if (giantsInInstall.length === 0) okay('(A) install set excludes all 4 giants'); else fail('(A) giants leaked into install: ' + giantsInInstall.join(','));
  if (shellPresent) okay('(A) shell libs (three.core, sql-wasm) auto-precached'); else fail('(A) shell libs missing from install');

  // ── (B) GET_PRECACHE: the offline button must still get the FULL set ──
  await new Promise((resolve) => {
    handlers.message({
      data: { type: 'GET_PRECACHE' },
      ports: [{ postMessage: (m) => { getPrecacheReply = m; resolve(); } }],
    });
  });
  const replyLibs = (getPrecacheReply && getPrecacheReply.libs || []).map(base);
  const giantsInReply = GIANTS.filter((g) => replyLibs.includes(g));
  console.log('§PRECACHE-TRIM-TEST getPrecache.libs=' + replyLibs.length + ' giantsInReply=' + giantsInReply.length + '/4 version=' + (getPrecacheReply && getPrecacheReply.version));
  if (giantsInReply.length === 4) okay('(B) GET_PRECACHE returns the FULL set — offline button = full offline'); else fail('(B) offline button would MISS giants: only ' + giantsInReply.length + '/4');

  // ── (C) cacheFirst: a deferred lib must cache on first fetch (offline-after-use) ──
  runtimePuts.length = 0;
  await new Promise((resolve) => {
    handlers.fetch({
      request: { url: 'https://x/viewer/lib/web-ifc.wasm', method: 'GET', mode: 'no-cors' },
      respondWith: (p) => Promise.resolve(p).then(resolve, resolve),
    });
  });
  await new Promise((r) => setTimeout(r, 10)); // let the async cache.put settle
  const cachedOnUse = runtimePuts.map(base).includes('web-ifc.wasm');
  console.log('§PRECACHE-TRIM-TEST fetch(web-ifc.wasm) cachedOnUse=' + cachedOnUse + ' puts=[' + runtimePuts.map(base).join(',') + ']');
  if (cachedOnUse) okay('(C) deferred lib caches on first use → offline after one online import'); else fail('(C) deferred lib NOT cached on fetch — offline-after-use broken');

  console.log('§PRECACHE-TRIM-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' — install drops the ~8.9MB giants; offline button + cache-on-use keep full offline reachable');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(2); });
