#!/usr/bin/env node
/* ⚠ WITNESS — W-SEAM-CACHE-READERS (§SEAM-W1, bim-compiler prompts/SEAM_IDENTITY_AUDIT.md F1/F1c/F2/F3 + K3). READ THE LOG after every run.
 *
 * ISSUES IT PROVES OR DISPROVES
 *  F1/F3  boq_charts.html (peekDbCache, fetchDbBuffer), clash_report.html (fetchDbBuffer), city.js (cached-archetype read) READ the
 *         `dbs` store under the raw url while the Viewer WRITES the canonical DbResolve.cacheKey → miss → full re-download.
 *  F2     viewer/routewalker.js, modeller/routewalker.js, clash_report.html open('bim_ootb_cache', 1) → VersionError once the profile
 *         is v2+/v3 (scene.js A.openCacheDB = v3) → IDB silently skipped; unguarded createObjectStore / transaction.
 *  K3     '/deploy/' '/modeller/' urls stay verbatim (never folded onto buildings/<file>).
 * Drives the REAL reader source (extracted by name from the HTML/JS) against a Map-backed fake IndexedDB that has a version number and
 * fires VersionError when open() asks for a LOWER version than stored (as real IDB), plus the REAL viewer/db_resolve.js.
 * BEFORE-PROOF: the same claims run against origin/main's files (git show) must FAIL at every site.
 * MUTANTS: DbResolve with readKeys → raw-only, and → canonical-only, must each FAIL at least one claim.
 * NO-OP/VACUOUS: if no claim was judged → INCONCLUSIVE (exit 2). Exit 0 only on PASS.
 * RUN: node viewer/tests/witness_seam_cache_readers.js [--before-ref=origin/main]
 */
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || 'origin/main';
var DbResolve = require(path.join(ROOT, 'viewer', 'db_resolve.js'));
var PROD = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/';
var OCI = PROD + 'buildings/Hospital_extracted.db', REL = '../buildings/Hospital_extracted.db';
var CANON = 'buildings/Hospital_extracted.db';
var DEV = '/bim-compiler/deploy/dev/buildings/Terminal_extracted.db';
var GEO = PROD + 'modeller/Hospital_geo.db';
function L(s) { console.log(s); }

// ── source extraction ──────────────────────────────────────────────────────────────────────────
function scripts(html) { var out = [], re = /<script>([\s\S]*?)<\/script>/g, m; while ((m = re.exec(html))) out.push(m[1]); return out.join('\n'); }
function fnSrc(src, name) {
  var m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src); if (!m) return null;
  var i = src.indexOf('{', m.index), d = 0, q = null;
  for (var k = i; k < src.length; k++) {
    var c = src[k], n = src[k + 1];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { while (src[k] !== '\n') k++; continue; }
    if (c === '/' && n === '*') { k = src.indexOf('*/', k) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && /[=(,:]\s*$/.test(src.slice(Math.max(0, k - 6), k))) { // regex literal
      for (k++; src[k] !== '/'; k++) { if (src[k] === '\\') k++; else if (src[k] === '[') { while (src[k] !== ']') { if (src[k] === '\\') k++; k++; } } } continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(m.index, k + 1); }
  }
  return null;
}
function show(ref, p) { return cp.execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + ref + ':' + p, { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function load(ref) { // ref null → working tree
  var rd = function (p) { return ref ? show(ref, p) : fs.readFileSync(path.join(ROOT, p), 'utf8'); };
  var boq = scripts(rd('viewer/boq_charts.html')), clash = scripts(rd('viewer/clash_report.html')), city = rd('viewer/city.js');
  var cs = city.indexOf('var cachedBuf = null;'), ce = city.indexOf('if (!cachedBuf)', cs);
  return {
    boq: ['_openCacheDbCompat', '_readCachedBuilding', 'peekDbCache', 'fetchDbBuffer'].map(function (n) { return fnSrc(boq, n); }).filter(Boolean).join('\n'),
    clash: fnSrc(clash, 'fetchDbBuffer'),
    city: (cs > 0 && ce > cs) ? city.slice(cs, ce) : null,
    rwV: fnSrc(rd('viewer/routewalker.js'), '_rwFetchCached'), rwM: fnSrc(rd('modeller/routewalker.js'), '_rwFetchCached')
  };
}

// ── fake IndexedDB: versioned, VersionError on lower explicit version, NotFoundError on missing store ──
function makeEnv() {
  var recs = {}, uncaught = [], fetches = [], NET = new Uint8Array([9, 9, 9]);
  function safe(f, a) { try { if (f) f(a); } catch (e) { uncaught.push(e && (e.name || e.message)); } }
  function wrap(rec) {
    return { get version() { return rec.version; }, close: function () { }, objectStoreNames: { contains: function (n) { return n in rec.stores; } },
      createObjectStore: function (n) { rec.stores[n] = new Map(); },
      transaction: function (n) { if (!(n in rec.stores)) throw { name: 'NotFoundError', message: 'no store ' + n };
        return { objectStore: function () { return {
          get: function (k) { var r = {}; setImmediate(function () { r.result = rec.stores[n].get(k); safe(r.onsuccess, {}); }); return r; },
          put: function (v, k) { rec.stores[n].set(k, v); } }; } }; } };
  }
  var indexedDB = { open: function (name, ver) {
    var req = {}; setImmediate(function () {
      var rec = recs[name];
      if (ver !== undefined && rec && ver < rec.version) { req.error = { name: 'VersionError' }; safe(req.onerror, {}); return; }
      var old = rec ? rec.version : 0, nv = ver !== undefined ? ver : (rec ? rec.version : 1);
      if (!rec) rec = recs[name] = { version: nv, stores: {} };
      rec.version = nv; req.result = wrap(rec);
      if (nv > old) safe(req.onupgradeneeded, {});
      safe(req.onsuccess, {});
    }); return req; } };
  return { indexedDB: indexedDB, uncaught: uncaught, fetches: fetches, NET: NET,
    seed: function (version, stores) { recs['bim_ootb_cache'] = { version: version, stores: stores }; },
    fetch: function (u) { fetches.push(u); return Promise.resolve({ ok: true, arrayBuffer: function () { return Promise.resolve(NET.buffer); } }); } };
}
function ctxFor(env, DR) {
  var logs = [];
  var ctx = { indexedDB: env.indexedDB, fetch: env.fetch, window: { DbResolve: DR }, performance: { now: function () { return 0; } }, setTimeout: setTimeout, Promise: Promise,
    console: { log: function () { logs.push([].join.call(arguments, ' ')); }, warn: function () { logs.push('WARN ' + [].join.call(arguments, ' ')); } },
    location: { href: 'http://localhost/clash_report.html' }, _log: function (s) { logs.push(s); }, _dbSourceLine: '', URLSearchParams: URLSearchParams };
  ctx.logs = logs; return vm.createContext(ctx);
}

// ── claims ──────────────────────────────────────────────────────────────────────────────────────
// Each site: async (ctx,env,url)=>returned buffer-or-null. Hit = returned === seeded marker AND zero network fetches.
async function run(src, DR, label) {
  var res = [];
  function rec(site, id, ok, note) { res.push({ site: site, id: id, ok: !!ok, note: note || '' }); }
  var sites = {
    'boq.peek': src.boq && /peekDbCache/.test(src.boq) && function (c, u) { vm.runInContext(src.boq, c); return vm.runInContext('peekDbCache', c)(u); },
    'boq.fetch': src.boq && /fetchDbBuffer/.test(src.boq) && function (c, u) { vm.runInContext(src.boq, c); return vm.runInContext('fetchDbBuffer', c)(u); },
    'clash.fetch': src.clash && function (c, u) { vm.runInContext(src.clash, c); return vm.runInContext('fetchDbBuffer', c)(u); },
    'city.read': src.city && function (c, u, A) { var f = vm.runInContext('(async function(cacheDb,dbUrl,archName,A){ ' + src.city + ' return cachedBuf; })', c);
      return new Promise(function (r) { var idb = c._idb; r(f(idb, u, 'Hospital', { PROD_BASE: PROD })); }); }
  };
  async function viaSite(name, url, seedStores, version) {
    var env = makeEnv(); env.seed(version == null ? 3 : version, seedStores);
    var ctx = ctxFor(env, DR);
    if (name === 'city.read') { ctx._idb = await new Promise(function (r) { var q = env.indexedDB.open('bim_ootb_cache'); q.onsuccess = function () { r(q.result); }; }); }
    var got; try { got = await sites[name](ctx, url); } catch (e) { got = 'THREW:' + (e && e.message); }
    return { got: got, env: env, ctx: ctx };
  }
  var MARK = new Uint8Array([1, 2, 3]);
  var cases = [
    // [id, url, stores, wantHit]
    ['canonical-only/OCI', OCI, { dbs: new Map([[CANON, MARK]]) }, true],
    ['canonical-only/relative', REL, { dbs: new Map([[CANON, MARK]]) }, true],
    ['raw-only(legacy)/OCI', OCI, { dbs: new Map([[OCI, MARK]]) }, true],
    ['raw-only(legacy)/relative', REL, { dbs: new Map([[REL, MARK]]) }, true],
    ['K3 verbatim /deploy/dev', DEV, { dbs: new Map([[DEV, MARK]]) }, true],
    ['K3 NO fold /deploy/dev onto buildings/', DEV, { dbs: new Map([['buildings/Terminal_extracted.db', MARK]]) }, false],
    ['K3 modeller geo verbatim', GEO, { dbs: new Map([[GEO, MARK]]) }, true],
    ['K3 modeller geo NO fold onto buildings/', GEO, { dbs: new Map([['buildings/Hospital_geo.db', MARK]]) }, false]
  ];
  for (var name in sites) {
    if (!sites[name]) { rec(name, 'site-extractable', false, 'reader source not found'); continue; }
    for (var c of cases) {
      var r = await viaSite(name, c[1], { dbs: c[2].dbs, timestamps: new Map(), revalidation: new Map() }, 3);
      var isHit = r.got === MARK;
      var ok = c[3] ? (isHit && r.env.fetches.length === 0) : !isHit;
      rec(name, c[0], ok, 'hit=' + isHit + ' fetches=' + r.env.fetches.length + ' uncaught=' + r.env.uncaught.length);
    }
  }
  // F2: v3 profile — routewalker x2 + clash/boq openers must open (no VersionError) and read; missing-store tolerance
  var rws = { 'rw.viewer': src.rwV, 'rw.modeller': src.rwM };
  for (var rn in rws) {
    if (!rws[rn]) { rec(rn, 'site-extractable', false, 'reader source not found'); continue; }
    var URLRW = 'mep_rw.db?v=5';
    async function runRw(version, stores) {
      var env = makeEnv(); env.seed(version, stores); var ctx = ctxFor(env, DR);
      vm.runInContext(rws[rn], ctx); var got;
      try { got = await Promise.race([vm.runInContext('_rwFetchCached', ctx)(URLRW), new Promise(function (r) { setTimeout(function () { r('TIMEOUT'); }, 300); })]); } catch (e) { got = 'THREW:' + e.message; }
      return { got: got, env: env };
    }
    var r1 = await runRw(3, { dbs: new Map([['rw_' + URLRW, MARK]]), timestamps: new Map(), revalidation: new Map() });
    rec(rn, 'store@v3: opens, cache hit, 0 fetches', r1.got === MARK && r1.env.fetches.length === 0, 'hit=' + (r1.got === MARK) + ' fetches=' + r1.env.fetches.length);
    var r2 = await runRw(1, {});   // v1 profile with NO dbs store (made by another tool): must not throw uncaught
    rec(rn, 'v1 profile w/o dbs store: resolves, no uncaught throw', r2.env.uncaught.length === 0 && r2.got !== 'TIMEOUT' && !String(r2.got).startsWith('THREW'), 'got=' + (r2.got && r2.got.byteLength !== undefined ? 'buf' : r2.got) + ' uncaught=' + r2.env.uncaught.join('|'));
  }
  // F2 for clash/boq openers: v1 profile with NO 'dbs' store must not throw and must fall through to network
  for (var nm of ['clash.fetch', 'boq.fetch']) if (sites[nm]) {
    var r3 = await viaSite(nm, OCI, { timestamps: new Map() }, 1);  // v1, no dbs: unguarded create would be skipped (no upgrade) → tx throws
    rec(nm, 'v1 profile w/o dbs store: falls through to network, no uncaught', r3.env.uncaught.length === 0 && !String(r3.got).startsWith('THREW') && r3.env.fetches.length === 1, 'got=' + (typeof r3.got === 'string' ? r3.got : 'buf') + ' fetches=' + r3.env.fetches.length + ' uncaught=' + r3.env.uncaught.join('|'));
  }
  return res;
}
function summarize(res, label) {
  var by = {}; res.forEach(function (r) { (by[r.site] = by[r.site] || []).push(r); });
  Object.keys(by).forEach(function (s) { var f = by[s].filter(function (r) { return !r.ok; });
    L('§SEAM_W1 ' + label + ' site=' + s + ' claims=' + by[s].length + ' failed=' + f.length + (f.length ? ' [' + f.map(function (r) { return r.id; }).join(' ; ') + ']' : '')); });
  return by;
}

(async function () {
  var after = await run(load(null), DbResolve, 'after');
  res_detail(after);
  function res_detail(a) { a.forEach(function (r) { L('§SEAM_W1 after ' + (r.ok ? 'PASS' : 'FAIL') + ' ' + r.site + ' :: ' + r.id + ' (' + r.note + ')'); }); }
  var byA = summarize(after, 'after');
  if (!after.length) { L('§SEAM_W1_VERDICT INCONCLUSIVE — no claim judged'); process.exit(2); }
  var afterOk = after.every(function (r) { return r.ok; });

  var before, beforeOk = null, byB;
  try { before = await run(load(REF), DbResolve, 'before'); byB = summarize(before, 'before(' + REF + ')');
    // every site must fail at least one claim on the old code
    beforeOk = Object.keys(byA).every(function (s) { return (byB[s] || []).some(function (r) { return !r.ok; }); });
    Object.keys(byA).forEach(function (s) { L('§SEAM_W1 before-proof site=' + s + ' ' + ((byB[s] || []).some(function (r) { return !r.ok; }) ? 'FAILS-ON-OLD (good)' : 'DOES-NOT-FAIL-ON-OLD (witness cannot say NO here)')); });
  } catch (e) { L('§SEAM_W1 before-proof UNAVAILABLE ' + e.message); }

  // mutants must act on the readCached path: re-implement readCached over the mutated key list
  function mutDR(keysFn) { var m = Object.assign({}, DbResolve); m.readCached = function (idb, url, pb, store) { store = store || 'dbs'; var keys = keysFn(url, pb), i = 0;
    return (function next() { if (i >= keys.length) return Promise.resolve(null); var k = keys[i++];
      return new Promise(function (r) { try { var q = idb.transaction(store, 'readonly').objectStore(store).get(k); q.onsuccess = function () { r(q.result || null); }; q.onerror = function () { r(null); }; } catch (e) { r(null); } })
        .then(function (b) { return b ? { buf: b, key: k, which: i === 1 ? 'canonical' : 'raw' } : next(); }); })(); }; return m; }
  var mutants = { 'MUTANT raw-only': mutDR(function (u) { return [u]; }), 'MUTANT canonical-only': mutDR(function (u, pb) { return [DbResolve.cacheKey(u, pb)]; }),
                  'MUTANT folds K3': mutDR(function (u) { return ['buildings/' + u.split('/').pop(), u]; }) };
  var mutOk = true;
  for (var mn in mutants) { var mr = await run(load(null), mutants[mn], mn), mf = mr.filter(function (r) { return !r.ok; });
    L('§SEAM_W1 ' + mn + ' failedClaims=' + mf.length + (mf.length ? ' → witness says NO (good)' : ' → witness CANNOT DETECT THIS MUTANT')); if (!mf.length) mutOk = false; }

  var verdict = (afterOk && beforeOk === true && mutOk) ? 'PASS' : (afterOk && beforeOk === null && mutOk) ? 'INCONCLUSIVE' : 'FAIL';
  L('§SEAM_W1_VERDICT ' + verdict + ' after=' + (afterOk ? 'all-green' : 'RED') + ' (' + after.length + ' claims) beforeProof=' + beforeOk + ' mutants=' + (mutOk ? 'all-caught' : 'MISSED'));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'INCONCLUSIVE' ? 2 : 1);
})().catch(function (e) { L('§SEAM_W1_VERDICT FAIL — witness crashed: ' + (e && e.stack || e)); process.exit(1); });
