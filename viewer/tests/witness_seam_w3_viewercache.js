#!/usr/bin/env node
/* ⚠ WITNESS — W-SEAM-W3-VIEWERCACHE (§SEAM-W3A, bim-compiler prompts/SEAM_IDENTITY_AUDIT.md F5 tail + F4 tail). READ THE LOG after every run.
 *
 * ISSUES IT PROVES OR DISPROVES
 *  F5 tail  scene.js "Open DB" built `import://K_extracted.db/v0` (a 4th import:// shape) inline; must come from ImportKey, and entries
 *           already stored under the old shape must stay reachable (alias) and never be lost (rekey = put -> verify -> delete-if-identical).
 *  F4 tail  an edit snapshot under a plain url key looks like a clean download to _cacheEvictable, so a CLOSED edited building could be
 *           LRU-evicted (edits lost). Savers mark the revalidation record {edited:ts}; the evictor refuses marked keys; a fresh download
 *           write replaces the record (mark cleared); etag/contentLength are never disturbed.
 * Drives the REAL _evictOldest/_cacheEvictable/_editedKeys/markEdited block of viewer/scene.js, the REAL _openDbBytes/_openSplitDbBytes and the REAL
 * common/import_key.js against a Map-backed fake IndexedDB. BEFORE-PROOF pinned to 7586a565 (never a moving branch) must FAIL.
 * MUTANTS: evictor ignores the mark; marker overwrites etag; alias for the old shape missing — each must FAIL >=1 claim.
 * Nothing judged -> INCONCLUSIVE (exit 2). Exit 0 only on PASS.   RUN: node viewer/tests/witness_seam_w3_viewercache.js [--before-ref=7586a565]
 */
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || '7586a565';
function show(ref, p) { return cp.execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + ref + ':' + p, { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function rd(ref, p) { return ref ? show(ref, p) : fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function loadImportKey(src) { var m = { exports: {} }; new Function('module', 'window', src).call(m.exports, m, undefined); return m.exports; }

function makeIdb(stores) {
  var timer = null;
  function mk() {
    var tx = { oncomplete: null, onerror: null, onabort: null };
    function arm() { clearTimeout(timer); timer = setTimeout(function () { if (tx.oncomplete) tx.oncomplete(); }, 4); }
    tx.objectStore = function (n) {
      if (!stores[n]) throw { name: 'NotFoundError' };
      var m = stores[n];
      function req(f) { var r = {}; arm(); setTimeout(function () { r.result = f(); if (r.onsuccess) r.onsuccess(); arm(); }, 0); return r; }
      return {
        getAllKeys: function () { return req(function () { return Array.from(m.keys()); }); },
        get: function (k) { return req(function () { return m.get(k); }); },
        put: function (v, k) { m.set(k, v); arm(); return req(function () { return k; }); },
        delete: function (k) { m.delete(k); arm(); }
      };
    };
    arm(); return tx;
  }
  return { objectStoreNames: { contains: function (n) { return !!stores[n]; } }, transaction: mk, close: function () { } };
}
function freshStores(noReval) { var s = { dbs: new Map(), timestamps: new Map() }; if (!noReval) s.revalidation = new Map(); return s; }

function sceneBlock(src) {
  var a = src.indexOf('A._MAX_CACHE_ENTRIES = 80;'), b = src.indexOf('// §S260b: Check if URL is in cache', a);
  return (a > 0 && b > a) ? src.slice(a, b) : null;
}
function fnBlock(src, head) {   // `A.x = async function(...) {` .. first `\n  };\n`
  var a = src.indexOf(head); if (a < 0) return null; var b = src.indexOf('\n  };\n', a); return b < 0 ? null : src.slice(a, b + 5);
}
function mkScene(block, IK, stores, opts) {
  opts = opts || {};
  var f = makeIdb(stores), logs = [], nav = [];
  var A = { CACHE_STORE: 'dbs', DB_URL: opts.open || '', PROD_BASE: 'https://x/', openCacheDB: function () { return Promise.resolve(f); }, status: {} };
  var ctx = vm.createContext({ A: A, window: { ImportKey: IK }, location: { assign: function (u) { nav.push(u); } },
    console: { log: function () { logs.push([].join.call(arguments, ' ')); }, warn: function () { logs.push('WARN ' + [].join.call(arguments, ' ')); } },
    Promise: Promise, Object: Object, Date: Date, encodeURIComponent: encodeURIComponent });
  vm.runInContext(block, ctx);
  vm.runInContext('A._MAX_CACHE_ENTRIES = ' + (opts.max || 80), ctx);
  return { A: A, ctx: ctx, f: f, logs: logs, nav: nav };
}
function U(n) { return 'https://objectstorage.example/n/b/o/buildings/B' + n + '_extracted.db'; }
var B8 = function (n) { return new Uint8Array([n, n, n]); };

async function claims(srcScene, ikSrc, mut) {
  mut = mut || {};
  var out = [], IK = loadImportKey(mut.ik ? mut.ik(ikSrc) : ikSrc);
  function rec(id, ok, note) { out.push({ id: id, ok: !!ok, note: note || '' }); }
  async function guard(id, fn) { try { await fn(); } catch (e) { rec(id, false, 'THREW ' + (e && e.message)); } }
  var blk = sceneBlock(mut.scene ? mut.scene(srcScene) : srcScene);
  if (!blk) { rec('SRC scene block extractable', false, ''); return out; }
  var openMono = fnBlock(srcScene, 'A._openDbBytes = async function'), openSplit = fnBlock(srcScene, 'A._openSplitDbBytes = async function');
  var full = blk + '\n' + (openMono || '') + '\n' + (openSplit || '');

  await guard('C1', async function () {
    var st = freshStores(), s = mkScene(full, IK, st);
    await s.A._openSplitDbBytes('Hosp_meta.db', B8(1), B8(2));
    var key = 'Hosp';
    var want = [IK.importUrl(key, 'extracted'), IK.importUrl(key, 'meta'), IK.importUrl(key, 'geo')];
    var ok = want.every(function (u) { return st.dbs.has(u); }) && st.dbs.size === 3;
    rec('C1a Open-DB split urls == ImportKey.importUrl(extracted|meta|geo)', ok, 'stored=' + Array.from(st.dbs.keys()).join(' | '));
    rec('C1b navigate ?db= is the ImportKey extracted url', s.nav.length === 1 && s.nav[0].indexOf('db=' + encodeURIComponent(want[0])) >= 0, s.nav.join(','));
    var st2 = freshStores(), s2 = mkScene(full, IK, st2);
    await s2.A._openDbBytes('Clinic.sqlite', B8(3));
    rec('C1c Open-DB monolith url == ImportKey.importUrl(K,monolith) == import://K.db/v0 (byte-identical to before)',
      st2.dbs.has(IK.importUrl('Clinic.db', 'monolith')) && IK.importUrl('Clinic.db', 'monolith') === 'import://Clinic.db/v0' && st2.dbs.size === 1, Array.from(st2.dbs.keys()).join(','));
    // C2 streaming.js derive (:3651-3655): suffix swap on the primary url must land on the sibling blobs
    var ex = want[0];
    rec('C2 streaming.js suffix-swap of the primary url hits the stored _meta/_geo blobs',
      st.dbs.has(ex.replace('_extracted.db', '_meta.db')) && st.dbs.has(ex.replace('_extracted.db', '_geo.db')), ex);
  });
  rec('C1d scene.js Open-DB functions build no inline import:// url',
    !!openMono && !!openSplit && !/'import:\/\/'/.test(openMono + openSplit), '');

  await guard('C3', async function () {
    rec('C3a currentUrlFor(old split url) -> new split url (all three parts)',
      ['extracted', 'meta', 'geo'].every(function (p) { return IK.currentUrlFor('import://Hosp_' + p + '.db/v0') === IK.importUrl('Hosp', p); }),
      String(IK.currentUrlFor('import://Hosp_meta.db/v0')));
    rec('C3b new-shape urls and monolith K/v0 are NOT aliased', IK.currentUrlFor(IK.importUrl('Hosp', 'meta')) === null && IK.currentUrlFor('import://Clinic.db/v0') === null, '');
    // C3c/C3d: old entries + new open -> identical dup deleted, differing kept, nothing lost
    var st = freshStores(), s = mkScene(full, IK, st);
    var oldE = 'import://Hosp_extracted.db/v0', oldM = 'import://Hosp_meta.db/v0', oldG = 'import://Hosp_geo.db/v0';
    st.dbs.set(oldE, B8(1)); st.dbs.set(oldM, B8(1)); st.dbs.set(oldG, B8(9));   // meta bytes passed below = B8(1) (extracted==meta), geo differs
    await s.A._openSplitDbBytes('Hosp_meta.db', B8(1), B8(2));
    var lost = [];
    [[oldE, B8(1)], [oldM, B8(1)], [oldG, B8(9)]].forEach(function (p) {
      var held = st.dbs.has(p[0]) ? st.dbs.get(p[0]) : null;
      var viaNew = null; var cur = IK.currentUrlFor(p[0]); if (cur && st.dbs.has(cur)) viaNew = st.dbs.get(cur);
      if (!(held && held[0] === p[1][0]) && !(viaNew && viaNew[0] === p[1][0])) lost.push(p[0]);
    });
    rec('C3c every old-shape entry is still reachable (held under old url OR identical under its alias) — none lost', lost.length === 0, 'lost=' + lost.join(','));
    rec('C3d identical old copies deleted after verify; the DIFFERING old geo copy is KEPT', !st.dbs.has(oldE) && !st.dbs.has(oldM) && st.dbs.has(oldG), 'old=' + [oldE, oldM, oldG].map(function (u) { return st.dbs.has(u) ? 'kept' : 'gone'; }).join('/'));
  });

  await guard('C4', async function () {
    var st = freshStores(), s = mkScene(full, IK, st);
    st.revalidation.set('buildings/H.db', { etag: 'E1', contentLength: '99' });
    var r1 = await s.A.markEdited('buildings/H.db');
    var rv = st.revalidation.get('buildings/H.db');
    rec('C4a markEdited sets edited and PRESERVES etag/contentLength', r1 === true && rv.edited > 0 && rv.etag === 'E1' && rv.contentLength === '99', JSON.stringify(rv));
    var r2 = await s.A.markEdited('buildings/NEW.db');
    rec('C4b markEdited on a key with no record creates {edited} only', r2 === true && st.revalidation.get('buildings/NEW.db').edited > 0 && st.revalidation.get('buildings/NEW.db').etag === undefined, JSON.stringify(st.revalidation.get('buildings/NEW.db')));
    var st3 = freshStores(true), s3 = mkScene(full, IK, st3), r3;
    try { r3 = await s3.A.markEdited('buildings/H.db'); } catch (e) { r3 = 'THREW'; }
    rec('C4c no revalidation store -> fail soft (false, no throw, nothing written)', r3 === false && st3.dbs.size === 0, String(r3));
  });

  await guard('C5', async function () {
    var st = freshStores(), s = mkScene(full, IK, st, { max: 4 });
    for (var i = 0; i < 6; i++) { st.dbs.set(U(i), 1); st.timestamps.set(U(i), 100 + i); }
    st.revalidation.set(U(0), { etag: 'E', contentLength: '1' });
    await s.A.markEdited(U(0));   // the OLDEST entry holds user edits and is not the open building
    var removed = await s.A._evictOldest(s.f);
    rec('C5a edited CLOSED building (oldest) survives over-cap eviction', st.dbs.has(U(0)) && removed >= 1, 'removed=' + removed);
    rec('C5b clean buildings are still reclaimed (evictor not disabled)', Array.from(st.dbs.keys()).filter(function (k) { return k !== U(0); }).length < 5, 'left=' + st.dbs.size);
    rec('C5c skip logged §CACHE_EVICT_SKIP_EDITED key=…', s.logs.some(function (l) { return l.indexOf('§CACHE_EVICT_SKIP_EDITED key=' + U(0)) >= 0; }), '');
    var st2 = freshStores(), s2 = mkScene(full, IK, st2, { max: 80 });
    st2.dbs.set(U(0), 1); st2.timestamps.set(U(0), 1); st2.dbs.set(U(1), 1); st2.timestamps.set(U(1), 2);
    await s2.A.markEdited(U(0));
    await s2.A._evictOldest(s2.f, 2);
    rec('C5d forced (quota-abort) eviction also spares the edited key and takes the clean one', st2.dbs.has(U(0)) && !st2.dbs.has(U(1)), '');
    // C6 stale re-download: scene.js cachedFetch writes a NEW {etag,contentLength} record (replace) => mark cleared
    var m = /objectStore\('revalidation'\)\.put\((\{[^}]*\}), key\)/.exec(srcScene);
    rec('C6a cachedFetch revalidation write is a fresh {etag, contentLength} literal (replace, no edited carry-over)', !!m && /etag/.test(m[1]) && /contentLength/.test(m[1]) && !/edited|\.\.\.|assign/.test(m[1]), m ? m[1].slice(0, 60) : 'no match');
    if (m) {
      var st4 = freshStores(); st4.revalidation.set(U(0), { etag: 'E', contentLength: '1', edited: 5 });
      var resp = { headers: { get: function (h) { return h === 'ETag' ? 'E2' : '77'; } } };
      new Function('resp', 'tx', 'key', 'tx.objectStore("revalidation").put(' + m[1].replace(/resp\.headers/g, 'resp.headers') + ', key)')(resp, { objectStore: function () { return { put: function (v, k) { st4.revalidation.set(k, v); } }; } }, U(0));
      rec('C6b after a stale re-download write the record is {E2,77} with NO edited mark', st4.revalidation.get(U(0)).etag === 'E2' && st4.revalidation.get(U(0)).edited === undefined, JSON.stringify(st4.revalidation.get(U(0))));
    }
  });

  var ko = rd(null, 'erp/kernel_ops.js'), sa = rd(null, 'viewer/schedule_author.js');
  void ko; void sa;
  return out;
}
function saverClaims(ref) {
  var ko = rd(ref, 'erp/kernel_ops.js'), sa = rd(ref, 'viewer/schedule_author.js');
  return [
    { id: 'C7a erp/kernel_ops.js _idbPersist calls APP.markEdited (guarded) after the snapshot write', ok: /APP\.markEdited\s*\)\s*APP\.markEdited\(dbKey\)/.test(ko), note: '' },
    { id: 'C7b viewer/schedule_author.js persistDb calls markEdited(key) after commit', ok: /\.markEdited\)\s*_A\.markEdited\(key\)/.test(sa), note: '' }
  ];
}
function report(label, res) {
  console.log('--- ' + label);
  res.forEach(function (r) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.id + (r.note ? '  [' + r.note + ']' : '')); });
}
(async function () {
  var IKA = rd(null, 'common/import_key.js'), SCA = rd(null, 'viewer/scene.js');
  var after = (await claims(SCA, IKA)).concat(saverClaims(null));
  report('AFTER (working tree)', after);
  var judged = after.length, allOk = after.every(function (r) { return r.ok; });
  var before = (await claims(rd(REF, 'viewer/scene.js'), rd(REF, 'common/import_key.js'))).concat(saverClaims(REF));
  report('BEFORE (' + REF + ') — claims should FAIL where the defect exists', before);
  var beforeFails = before.filter(function (r) { return !r.ok; }).length;
  var muts = [
    ['M1 evictor ignores the edited mark', function () { return claims(SCA, IKA, { scene: function (c) { var d = c.replace("if (edited[k]) {", "if (false) {").replace("if (edited && edited[key]) return false;", ""); if (d === c) throw new Error('M1 no-op'); return d; } }); }],
    ['M2 marker overwrites etag/contentLength', function () { return claims(SCA, IKA, { scene: function (c) { var d = c.replace("Object.assign({}, (rec && typeof rec === 'object') ? rec : {}, { edited: Date.now() })", "{ edited: Date.now() }"); if (d === c) throw new Error('M2 no-op'); return d; } }); }],
    ['M3 alias for the old Open-DB shape missing', function () { return claims(SCA, IKA, { ik: function (c) { var d = c.replace("return s ? importUrl(s[1], s[2]) : null;", "return null;"); if (d === c) throw new Error('M3 no-op'); return d; } }); }]
  ];
  var mutOk = true;
  for (var m of muts) {
    var res = await m[1](); var f = res.filter(function (r) { return !r.ok; });
    console.log((f.length ? 'KILLED ' : 'SURVIVED ') + m[0] + (f.length ? '  by: ' + f.map(function (r) { return r.id.split(' ')[0]; }).join(',') : ''));
    if (!f.length) mutOk = false;
  }
  console.log('§W3 judged=' + judged + ' afterAllPass=' + allOk + ' beforeFails=' + beforeFails + ' mutantsKilled=' + mutOk);
  if (!judged) { console.log('§W3 INCONCLUSIVE'); process.exit(2); }
  if (allOk && beforeFails >= 4 && mutOk) { console.log('§W3 PASS'); process.exit(0); }
  console.log('§W3 FAIL' + (allOk ? '' : ' (after claims failing)') + (beforeFails >= 4 ? '' : ' (before-proof did not fail enough: not discriminating)') + (mutOk ? '' : ' (mutant survived)'));
  process.exit(1);
})();
