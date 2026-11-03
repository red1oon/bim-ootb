#!/usr/bin/env node
/* ⚠ WITNESS — W-SEAM-W2-EVICT (§SEAM-W2, bim-compiler prompts/SEAM_IDENTITY_AUDIT.md F4 + F15). READ THE LOG after every run.
 *
 * ISSUES IT PROVES OR DISPROVES
 *  F4   scene.js _evictOldest enumerated only `timestamps`: (a) dbs-only re-downloadable blobs were invisible to the 80-entry cap and
 *       never reclaimed; (b) a TIMESTAMPED import:// blob (the user's own IFC/DB) or the open building could be LRU-evicted = lost work.
 *  F15  modeller str_walker_outliner caches a resident under `<base>?v=N` and never removes `<base>?v=M` / bare `<base>`.
 * Drives the REAL _evictOldest/_cacheEvictable (extracted from viewer/scene.js) and the REAL _idbPutDb/_idbDropStale/... (extracted from
 * modeller/str_walker_outliner.js) against a Map-backed fake IndexedDB with dbs/timestamps/revalidation stores, plus the REAL db_resolve.js.
 * BEFORE-PROOF: same claims against origin/main (git show) must FAIL. MUTANTS: evict import:// ; no open-building guard ; drop every
 * ?v for every base — each must FAIL >=1 claim. Nothing judged -> INCONCLUSIVE (exit 2). Exit 0 only on PASS.
 * RUN: node viewer/tests/witness_seam_w2_evict.js [--before-ref=origin/main]
 */
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || 'origin/main';
var DbResolve = require(path.join(ROOT, 'viewer', 'db_resolve.js'));
function show(ref, p) { return cp.execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + ref + ':' + p, { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function rd(ref, p) { return ref ? show(ref, p) : fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function fnSrc(src, name) {
  var m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src); if (!m) return null;
  var i = src.indexOf('{', m.index), d = 0, q = null;
  for (var k = i; k < src.length; k++) {
    var c = src[k], n = src[k + 1];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { while (src[k] !== '\n') k++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(m.index, k + 1); }
  }
  return null;
}

// ── fake IDB (versionless bim_ootb_cache with dbs/timestamps/revalidation) ──
function makeIdb(stores) {
  var timer = null;
  function rangeOk(r, k) { return !r || (k >= r.lo && k <= r.hi); }
  function mk(names, mode) {
    var tx = { oncomplete: null, onerror: null, onabort: null };
    function arm() { clearTimeout(timer); timer = setTimeout(function () { if (tx.oncomplete) tx.oncomplete(); }, 4); }
    tx.objectStore = function (n) {
      if (!stores[n]) throw { name: 'NotFoundError' };
      var m = stores[n];
      function req(f) { var r = {}; arm(); setTimeout(function () { r.result = f(); if (r.onsuccess) r.onsuccess(); arm(); }, 0); return r; }
      return {
        getAllKeys: function (rg) { return req(function () { return Array.from(m.keys()).filter(function (k) { return rangeOk(rg, k); }); }); },
        get: function (k) { return req(function () { return m.get(k); }); },
        put: function (v, k) { m.set(k, v); arm(); return req(function () { return k; }); },
        delete: function (k) { m.delete(k); arm(); }
      };
    };
    arm(); return tx;
  }
  return { objectStoreNames: { contains: function (n) { return !!stores[n]; } }, transaction: mk, close: function () { },
    open: function () { var r = {}; setTimeout(function () { r.result = this_db; if (r.onsuccess) r.onsuccess(); }, 0); return r; } };
  var this_db;
}
function freshStores() { return { dbs: new Map(), timestamps: new Map(), revalidation: new Map() }; }
function fakeDb(stores) {
  var db = makeIdb(stores);
  var real = { objectStoreNames: db.objectStoreNames, transaction: db.transaction, close: db.close };
  return { db: real, indexedDB: { open: function () { var r = {}; setTimeout(function () { r.result = real; if (r.onsuccess) r.onsuccess(); }, 0); return r; } } };
}
var KR = { bound: function (a, b) { return { lo: a, hi: b }; }, only: function (k) { return { lo: k, hi: k }; } };

// ── scene.js harness ──
function sceneLoad(src) {
  var a = src.indexOf('A._MAX_CACHE_ENTRIES = 80;'), b = src.indexOf('// §S260b: Check if URL is in cache', a);
  return (a > 0 && b > a) ? src.slice(a, b) : null;
}
async function sceneRun(block, mutate, opts) {
  var stores = freshStores(), f = fakeDb(stores), logs = [];
  var A = { CACHE_STORE: 'dbs', DB_URL: opts.open, PROD_BASE: 'https://x/' };
  var ctx = vm.createContext({ A: A, window: { DbResolve: DbResolve }, console: { log: function () { logs.push([].join.call(arguments, ' ')); } }, Promise: Promise });
  var code = block; if (mutate) code = mutate(code);
  vm.runInContext(code, ctx);
  vm.runInContext('A._MAX_CACHE_ENTRIES = ' + opts.max, ctx);
  opts.seed(stores);
  var removed = await vm.runInContext('A._evictOldest', ctx)(f.db, opts.forceN);
  return { stores: stores, logs: logs, removed: removed };
}
function U(n) { return 'https://objectstorage.example/n/b/o/buildings/B' + n + '_extracted.db'; }
function seedUrls(st, n, tsFrom, withTs) { // n url entries; ts ascending from tsFrom; withTs false => dbs-only
  for (var i = 0; i < n; i++) { st.dbs.set(U(i), 1); if (withTs) st.timestamps.set(U(i), tsFrom + i); }
}

async function sceneClaims(block, mutate) {
  var out = [];
  function rec(id, ok, note) { out.push({ id: id, ok: !!ok, note: note || '' }); }
  var r;
  // C1: 3 url entries with ts + 3 dbs-only url entries, cap 5 -> the dbs-only (oldest) ones go
  r = await sceneRun(block, mutate, { max: 5, open: '', seed: function (s) {
    for (var i = 0; i < 3; i++) { s.dbs.set('buildings/T' + i + '.db', 1); s.timestamps.set('buildings/T' + i + '.db', 100 + i); }
    for (var j = 0; j < 3; j++) s.dbs.set('buildings/D' + j + '.db', 1);
  } });
  var goneD = [0, 1, 2].filter(function (j) { return !r.stores.dbs.has('buildings/D' + j + '.db'); }).length;
  rec('C1 dbs-only re-downloadable entries are evicted over cap (inventory = timestamps U dbs)', r.removed >= 1 && goneD >= 1 && r.stores.dbs.has('buildings/T2.db'), 'removed=' + r.removed + ' dbsOnlyGone=' + goneD);
  // C2: import:// (timestamped AND oldest, plus dbs-only) survive; URLs fill the cap
  r = await sceneRun(block, mutate, { max: 5, open: '', seed: function (s) {
    s.dbs.set('import://Mine.ifc/v0', 1); s.timestamps.set('import://Mine.ifc/v0', 1);
    s.dbs.set('import://Other_meta.db/v0', 1);
    seedUrls(s, 6, 100, true);
  } });
  rec('C2 import:// never evicted (timestamped oldest + dbs-only), URLs still reclaimed', r.stores.dbs.has('import://Mine.ifc/v0') && r.stores.dbs.has('import://Other_meta.db/v0') && r.removed >= 1, 'removed=' + r.removed);
  var skipLog = r.logs.some(function (l) { return /§CACHE_EVICT_SKIP_USERDATA key=import:\/\/Mine\.ifc\/v0/.test(l); });
  rec('C2b skip is logged (§CACHE_EVICT_SKIP_USERDATA)', skipLog, 'logged=' + skipLog);
  // C3: open building (canonical key) oldest + over cap -> kept
  var OPEN = 'https://objectstorage.example/n/b/o/buildings/Open_extracted.db', OPENKEY = DbResolve.cacheKey(OPEN, 'https://x/');
  r = await sceneRun(block, mutate, { max: 5, open: OPEN, seed: function (s) {
    s.dbs.set(OPENKEY, 1); s.timestamps.set(OPENKEY, 1); seedUrls(s, 6, 100, true);
  } });
  rec('C3 open building (canonical key ' + OPENKEY + ') never evicted', r.stores.dbs.has(OPENKEY) && r.removed >= 1, 'removed=' + r.removed);
  // C4: forced path (quota abort) honours user data + open + unknown keys
  r = await sceneRun(block, mutate, { max: 80, forceN: 3, open: OPEN, seed: function (s) {
    s.dbs.set(OPENKEY, 1); s.timestamps.set(OPENKEY, 1);
    s.dbs.set('import://Mine.ifc/v0', 1); s.timestamps.set('import://Mine.ifc/v0', 2);
    s.dbs.set('idmp_kanban_proj', 1);
    s.dbs.set('buildings/E0.db', 1); s.timestamps.set('buildings/E0.db', 50);
  } });
  rec('C4 forced evict removes only the re-downloadable one; open/import/kanban survive', r.stores.dbs.has(OPENKEY) && r.stores.dbs.has('import://Mine.ifc/v0') && r.stores.dbs.has('idmp_kanban_proj') && !r.stores.dbs.has('buildings/E0.db') && r.removed === 1, 'removed=' + r.removed);
  // C5: under cap -> no-op (guards against evict-everything mutants)
  r = await sceneRun(block, mutate, { max: 80, open: '', seed: function (s) { seedUrls(s, 4, 100, true); } });
  rec('C5 under cap removes nothing', r.removed === 0 && r.stores.dbs.size === 4, 'removed=' + r.removed);
  return out;
}

// ── str_walker_outliner harness (F15) ──
function strLoad(src) {
  var names = ['_idbPutDb', '_idbDropStale', '_idbDropOtherVersions', '_idbPutVersioned'];
  var parts = names.map(function (n) { return fnSrc(src, n); });
  return { parts: parts, have: parts.map(function (p) { return !!p; }), src: parts.filter(Boolean).join('\n') };
}
async function strClaims(S, mutate) {
  var out = [];
  var stores = freshStores(), f = fakeDb(stores), logs = [];
  var ctx = vm.createContext({ indexedDB: f.indexedDB, IDBKeyRange: KR, TAG: '[T]', Promise: Promise, setTimeout: setTimeout,
    console: { log: function () { logs.push([].join.call(arguments, ' ')); } } });
  var code = 'function _idbEnsureStore(){return Promise.resolve();}\n' + S.src; if (mutate) code = mutate(code);
  vm.runInContext(code, ctx);
  var B = 'https://h/modeller/X.db', Y = 'https://h/modeller/Y.db';
  [B, B + '?v=1', B + '?v=2', Y + '?v=1'].forEach(function (k) { stores.dbs.set(k, 1); });
  stores.timestamps.set(B + '?v=2', 5);
  var put = vm.runInContext('typeof _idbPutVersioned === "function" ? _idbPutVersioned : _idbPutDb', ctx);
  await put(B + '?v=3', new Uint8Array(1));
  var keys = Array.from(stores.dbs.keys()).sort();
  out.push({ id: 'C6 caching X.db?v=3 keeps v3, removes X.db?v=2, X.db?v=1 and bare X.db', ok: stores.dbs.has(B + '?v=3') && !stores.dbs.has(B + '?v=2') && !stores.dbs.has(B + '?v=1') && !stores.dbs.has(B), note: keys.join(' | ') });
  out.push({ id: 'C7 other base Y.db?v=1 untouched', ok: stores.dbs.has(Y + '?v=1'), note: '' });
  out.push({ id: 'C8 timestamps row of the dropped version removed; §RESIDENT_STALE_DROP logged', ok: !stores.timestamps.has(B + '?v=2') && logs.some(function (l) { return /§RESIDENT_STALE_DROP key=.*X\.db\?v=2/.test(l); }), note: logs.join(' / ') });
  return out;
}

function report(label, res) {
  console.log('--- ' + label);
  res.forEach(function (r) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.id + (r.note ? '  [' + r.note + ']' : '')); });
}
(async function () {
  var AFTER = rd(null, 'viewer/scene.js'), AFTER_S = rd(null, 'modeller/str_walker_outliner.js');
  var blk = sceneLoad(AFTER), S = strLoad(AFTER_S);
  if (!blk || !S.src) { console.log('§W2 INCONCLUSIVE source not extractable'); process.exit(2); }
  var after = (await sceneClaims(blk, null)).concat(await strClaims(S, null));
  report('AFTER (working tree)', after);
  var judged = after.length, allOk = after.every(function (r) { return r.ok; });

  var bBlk = sceneLoad(rd(REF, 'viewer/scene.js')), bS = strLoad(rd(REF, 'modeller/str_walker_outliner.js'));
  var before = (await sceneClaims(bBlk, null)).concat(await strClaims(bS, null));
  report('BEFORE (' + REF + ') — each claim should FAIL where the defect exists', before);
  var beforeFails = before.filter(function (r) { return !r.ok; }).length;

  var muts = [
    ['M1 evict import:// (drop user-data guard)', function () { return sceneClaims(blk, function (c) { var d = c.replace("if (key.indexOf('import://') === 0) return false;", "if (key.indexOf('import://') === 0) return true;"); if (d === c) throw new Error('mutant1 no-op'); return d; }); }],
    ['M2 no open-building guard', function () { return sceneClaims(blk, function (c) { var d = c.replace('if (openKeys[k])', 'if (false)'); if (d === c) throw new Error('mutant2 no-op'); return d; }); }],
    ['M3 drop every ?v for every base (whole directory)', function () { return strClaims(S, function (c) { var d = c.replace("_idbDropStale(base + '?v=', url, false,", "_idbDropStale(base.slice(0, base.lastIndexOf('/') + 1), url, false,"); if (d === c) throw new Error('mutant3 no-op'); return d; }); }]
  ];
  var mutOk = true;
  for (var m of muts) {
    var res = await m[1](); var f = res.filter(function (r) { return !r.ok; });
    console.log((f.length ? 'KILLED ' : 'SURVIVED ') + m[0] + (f.length ? '  by: ' + f.map(function (r) { return r.id.split(' ')[0]; }).join(',') : ''));
    if (!f.length) mutOk = false;
  }
  var beforeOk = beforeFails >= 3;
  console.log('§W2 judged=' + judged + ' afterAllPass=' + allOk + ' beforeFails=' + beforeFails + ' mutantsKilled=' + mutOk);
  if (!judged) { console.log('§W2 INCONCLUSIVE'); process.exit(2); }
  if (allOk && beforeOk && mutOk) { console.log('§W2 PASS'); process.exit(0); }
  console.log('§W2 FAIL' + (allOk ? '' : ' (after claims failing)') + (beforeOk ? '' : ' (before-proof did not fail: witness not discriminating)') + (mutOk ? '' : ' (mutant survived)'));
  process.exit(1);
})();
