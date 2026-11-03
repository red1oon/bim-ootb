#!/usr/bin/env node
/* ⚠ WITNESS — W-SEAM-W3-BADGE-CLASH (§SEAM-W3b, bim-compiler prompts/SEAM_IDENTITY_AUDIT.md F13 + F14). READ THE LOG after every run.
 * ISSUES: F13 landing "cached" badge matched by stem substring (Hospital_3 greened Hospital). F14 clash pair stored `a|b` unsorted,
 * deep-linked `a~b`: status saved under one producer order read back "New" under the other; legacy statuses must migrate, not vanish.
 * Drives the REAL index.html _cardCacheKeys/_markCachedBuildings, REAL db_resolve.js, REAL measure.js (setupMeasure) and the REAL
 * main.js deep-link parse statement, in vm with fakes. BEFORE-PROOF: pinned 7586a565 must FAIL. MUTANTS (unsorted key; drop legacy
 * read) must FAIL. Nothing judged -> INCONCLUSIVE (exit 2). Exit 0 only on PASS.
 * RUN: node viewer/tests/witness_seam_w3_badge_clash.js [--before-ref=7586a565] */
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var BEFORE = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || '7586a565';
function rd(ref, p) { return ref ? cp.execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + ref + ':' + p, { encoding: 'utf8', maxBuffer: 1 << 28 }) : fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function fnSrc(src, name) {
  var m = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\(').exec(src); if (!m) return null;
  var i = src.indexOf('{', m.index), d = 0, q = null;
  for (var k = i; k < src.length; k++) {
    var c = src[k], n = src[k + 1];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { while (src[k] !== '\n') k++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '/' && /[=(,:!&|?{;]\s*$/.test(src.slice(Math.max(0, k - 6), k))) { /* regex literal */ var e = k + 1; while (src[e] !== '/') { if (src[e] === '\\') e++; e++; } k = e; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(m.index, k + 1); }
  }
  return null;
}
var results = [], judged = 0;
function claim(id, issue, ok, detail) { judged++; results.push({ id: id, ok: !!ok }); console.log('§W3B ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' — ' + issue + (detail ? ' | ' + detail : '')); }
var PROD = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/';
var DbResolve = require(path.join(ROOT, 'viewer', 'db_resolve.js'));

// ───────── F13 ─────────
function badge(ref, cachedKeys, mutant) {
  var src = rd(ref, 'index.html');
  var BUILD = { Hospital: { db: 'Hospital_extracted.db' }, Hospital_3: { db: 'Hospital_3_extracted.db' },
    HospitalGarage: { db: 'HospitalGarage_extracted.db' }, HospitalGarage_2: { db: 'HospitalGarage_2_extracted.db' },
    Clinic: { db: 'Clinic.db' }, HHS: { db: 'HHS_Office_Federated_extracted.db', gh: 'https://red1oon.github.io/bim-ootb/' },
    Split: { db: 'Split_extracted.db' } };
  var cards = Object.keys(BUILD).map(function (n) { var s = {}; return { n: n, on: false, getAttribute: function () { return n; }, classList: { toggle: function (_, v) { this.v = v; }, remove: function () { this.v = false; }, v: false } }; });
  var idb = { open: function () { var o = {}; setTimeout(function () { o.result = { objectStoreNames: { contains: function () { return true; } }, close: function () {},
      transaction: function () { return { objectStore: function () { return { getAllKeys: function () { var r = {}; setTimeout(function () { r.result = cachedKeys; r.onsuccess(); }, 0); return r; } }; } }; } }; o.onsuccess(); }, 0); return o; } };
  var dr = mutant === 'noLegacy' ? { readKeys: function (u, p) { return [DbResolve.cacheKey(u, p)]; } } : DbResolve;
  var ctx = { window: {}, document: { querySelectorAll: function () { return cards; } }, indexedDB: idb, BUILDINGS: BUILD, _prodBase: PROD, DbResolve: dr, setTimeout: setTimeout, Promise: Promise };
  ctx.window = ctx; vm.createContext(ctx);
  var a = fnSrc(src, '_cardCacheKeys'), b = fnSrc(src, '_markCachedBuildings');
  vm.runInContext((a || '') + '\n' + b + '\n;this._mark=_markCachedBuildings;', ctx);
  return ctx._mark().then(function () { var g = {}; cards.forEach(function (c) { g[c.n] = c.classList.v === true; }); return g; });
}
function green(g) { return Object.keys(g).filter(function (k) { return g[k]; }).sort().join(','); }

// ───────── F14 ─────────
function engine(ref, mutant, store) {
  var src = rd(ref, 'viewer/measure.js');
  if (mutant === 'unsortedKey') src = src.replace('key: function(a, b) { return a < b ? a + \'|\' + b : b + \'|\' + a; }', 'key: function(a, b) { return a + \'|\' + b; }').replace("return CP.key(guidA, guidB);", "return guidA + '|' + guidB;");
  if (mutant === 'dropLegacy') src = src.replace('var m = CP.migrate(st);', 'var m = { map: st, moved: 0, conflicts: 0 };');
  var A = { camera: { position: { x: 1, y: 2, z: 3 } }, controls: { target: { x: 4, y: 5, z: 6 } }, dbQuery: function () { return []; }, status: {}, _currentClashRules: null, activeBuilding: 'B' };
  var quiet = { log: function () {}, warn: function () {}, error: function () {} };
  var inert = new Proxy(function () {}, { get: function (t, k) { return k === Symbol.toPrimitive ? function () { return 0; } : inert; }, apply: function () { return inert; }, construct: function () { return inert; } });
  var ctx = { console: quiet, performance: performance, setTimeout: function () {}, clearTimeout: function () {}, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, Promise: Promise, URLSearchParams: URLSearchParams,
    document: { getElementById: function () { return null; }, createElement: function () { return { style: {} }; }, head: { appendChild: function () {} }, body: { appendChild: function () {} }, addEventListener: function () {} },
    navigator: { userAgent: 'node' }, location: { search: '?db=x.db', origin: 'http://t', pathname: '/viewer.html', hash: '' },
    localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); } }, A: A, THREE: inert };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src + '\n;setupMeasure(A);', ctx, { filename: 'measure.js@' + (ref || 'HEAD') });
  return A;
}
function parseLink(ref, A, param) {   // the REAL main.js statement
  var m = rd(ref, 'viewer/main.js').match(/const \[guidA, guidB\] = [^\n]*;/);
  if (!m) return null;
  return vm.runInNewContext('var APP=A; var clashParam=P; ' + m[0].replace('const [', 'var [') + '\n[guidA,guidB]', { A: A, P: param });
}
var SK = 'bim-clash-statuses-B';
function clashRun(ref, mutant, label) {
  var a = 'G_AAAA', b = 'G_ZZZZ';
  var S = {}; var A = engine(ref, mutant, S);
  claim(label + 'C1', 'F14 key(a,b)==key(b,a)', A._clashPairKey(a, b) === A._clashPairKey(b, a), A._clashPairKey(a, b) + ' vs ' + A._clashPairKey(b, a));
  [['a|b', a + '|' + b], ['b|a', b + '|' + a], ['a~b', a + '~' + b]].forEach(function (f) {
    var St = {}; St[SK] = JSON.stringify((function () { var o = {}; o[f[1]] = 'Resolved'; o['X|Y'] = 'Reviewed'; return o; })());
    var A2 = engine(ref, mutant, St); A2._loadClashStatuses();
    var rf = A2._clashStatuses[A2._clashPairKey(a, b)], rr = A2._clashStatuses[A2._clashPairKey(b, a)];
    claim(label + 'C2[' + f[0] + ']', 'F14 legacy form read back, either producer order (not New)', rf === 'Resolved' && rr === 'Resolved', 'fwd=' + rf + ' rev=' + rr);
    var blob = JSON.parse(St[SK]), ks = Object.keys(blob);
    claim(label + 'C3[' + f[0] + ']', 'F14 migrated in storage: canonical keys only, no loss', ks.length === 2 && blob[A2._clashPairKey(a, b)] === 'Resolved' && blob[A2._clashPairKey('X', 'Y')] === 'Reviewed' && ks.every(function (k) { return k.indexOf('~') < 0; }), JSON.stringify(blob));
  });
  var A3 = engine(ref, mutant, {}); A3._loadClashStatuses();
  var link = A3._buildClashDeepLink ? A3._buildClashDeepLink([a, b]) : '';
  var hash = (link.match(/#clash=([^&]*)/) || [])[1] || '';
  var back = parseLink(ref, A3, hash);
  claim(label + 'C5', 'F14 produced link parses back to the pair', back && back[0] === a && back[1] === b, link.slice(0, 80) + ' -> ' + JSON.stringify(back));
  var old = parseLink(ref, A3, 'OLD1~OLD2');
  claim(label + 'C4', 'F14 pre-existing a~b deep link still resolves', old && old[0] === 'OLD1' && old[1] === 'OLD2', JSON.stringify(old));
}
function badgeRun(ref, mutant, label) {
  var H = 'buildings/Hospital_extracted.db', H3 = 'buildings/Hospital_3_extracted.db';
  return Promise.all([
    badge(ref, [H3], mutant), badge(ref, [PROD + H], mutant), badge(ref, [], mutant), badge(ref, ['buildings/HospitalGarage_2_extracted.db'], mutant),
    badge(ref, ['buildings/Split_meta.db'], mutant), badge(ref, ['https://red1oon.github.io/bim-ootb/buildings/HHS_Office_Federated_extracted.db'], mutant)
  ]).then(function (r) {
    claim(label + 'B1', 'F13 canonical Hospital_3 key greens exactly Hospital_3', green(r[0]) === 'Hospital_3', green(r[0]));
    claim(label + 'B3', 'F13 legacy raw OCI url still greens its card (Hospital only)', green(r[1]) === 'Hospital', green(r[1]));
    claim(label + 'B5', 'F13 nothing cached -> nothing green', green(r[2]) === '', green(r[2]));
    claim(label + 'B2', 'F13 HospitalGarage_2 does not green HospitalGarage/Hospital', green(r[3]) === 'HospitalGarage_2', green(r[3]));
    claim(label + 'B4', 'F13 split-build _meta key greens its card', green(r[4]) === 'Split', green(r[4]));
    claim(label + 'B6', 'F13 gh-hosted card raw url greens it', green(r[5]) === 'HHS', green(r[5]));
  });
}
function verdict(label, fn) {   // run a labelled set; return #fails
  var before = results.length; return Promise.resolve(fn()).then(function () { return results.slice(before).filter(function (x) { return !x.ok; }).length; });
}
(async function () {
  var fails = {};
  console.log('§W3B == AFTER (working tree) =='); 
  fails.after = await verdict('after', async function () { await badgeRun(null, null, 'after:'); clashRun(null, null, 'after:'); });
  var keep = results.slice(); 
  console.log('§W3B == BASELINE ' + BEFORE + ' (expected FAIL) ==');
  fails.base = await verdict('base', async function () { try { await badgeRun(BEFORE, null, 'base:'); } catch (e) { claim('base:badge-ERR', 'baseline threw', false, e.message); } try { clashRun(BEFORE, null, 'base:'); } catch (e) { claim('base:clash-ERR', 'baseline threw', false, e.message); } });
  console.log('§W3B == MUTANTS (each expected FAIL) ==');
  fails.mUns = await verdict('m', async function () { clashRun(null, 'unsortedKey', 'mut-unsorted:'); });
  fails.mLeg = await verdict('m', async function () { clashRun(null, 'dropLegacy', 'mut-dropLegacy:'); await badgeRun(null, 'noLegacy', 'mut-noLegacyBadge:'); });
  console.log('§W3B_SUMMARY after_fails=' + fails.after + ' baseline_fails=' + fails.base + ' mut_unsorted_fails=' + fails.mUns + ' mut_dropLegacy_fails=' + fails.mLeg + ' judged=' + judged);
  if (judged === 0) { console.log('§W3B_VERDICT INCONCLUSIVE — nothing judged'); process.exit(2); }
  var ok = fails.after === 0 && fails.base > 0 && fails.mUns > 0 && fails.mLeg > 0;
  console.log('§W3B_VERDICT ' + (ok ? 'PASS' : 'FAIL'));
  process.exit(ok ? 0 : 1);
})();
