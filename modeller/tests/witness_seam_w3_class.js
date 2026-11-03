#!/usr/bin/env node
/* ⚠ WITNESS — W-SEAM-W3-CLASS (§SEAM-W3C, bim-compiler prompts/SEAM_IDENTITY_AUDIT.md F8 + F18). READ THE LOG after every run.
 *
 * ISSUES IT PROVES OR DISPROVES
 *  F8   "which rules DB does this building walk" had a copy-pasted rule; the owner is common/building_class.js and modeller.html _dwRules
 *       must be exactly it (no inline regex). Residential names (SH/DX/SC, Duplex, SampleHouse, SampleCastle, Schependomlaan) -> duplex_rules.db.
 *       STOPPED (owner decision, informational, never PASS): Viewer nf_tree_lens/building_parts_outliner _buildingClass still differ.
 *  F18  _dwBustStaleRulesCache deleted a hardcoded './terminal_rules.db' while disc_walker keys by caller base; the log claimed eviction
 *       whether or not a key was deleted. Now keys = DiscWalker.dwRulesKey(file, base) and the log says deleted=true|false per key.
 * Drives the REAL _dwBustStaleRulesCache (extracted from modeller.html) against a Map-backed fake IndexedDB, the REAL disc_walker dwInit
 * (fetch stubbed to capture the actual read/write key), the REAL building_class.js.
 * BASELINE: same claims against pinned BASE 7586a565 (git show) must FAIL on the F18 claims. MUTANTS: (a) _dwRules keeps its own regex;
 * (b) bust hardcodes './terminal_rules.db' — each must FAIL >=1 claim. Nothing judged -> INCONCLUSIVE (exit 2). Exit 0 only on PASS.
 * RUN: node modeller/tests/witness_seam_w3_class.js
 */
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var BASE = '7586a565';   // pinned: origin/main before SEAM-W3C (a moving branch stops discriminating once merged)
function show(p) { return cp.execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + BASE + ':' + p, { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function cur(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
var BC = require(path.join(ROOT, 'common', 'building_class.js'));
var DW = require(path.join(ROOT, 'modeller', 'disc_walker.js'));

var NAMES = ['SampleHouse_ARC.db', 'Duplex_ARC.db', 'SampleCastle_ARC.db', 'HHS_ARC.db', 'Clinic_ARC.db', 'Hospital_ARC.db', 'Garage_ARC.db', 'Terminal_ARC.db',
  'Duplex_extracted.db', 'Duplex_mep_extracted.db', 'SampleCastle_extracted.db', 'SampleCastle_ARC_extracted.db', 'SampleHouse_extracted.db',
  'HHS_Office_Federated_extracted.db', 'Hospital_extracted.db', 'Hospital_3_extracted.db', 'HospitalGarage_extracted.db', 'Terminal_extracted.db',
  'Clinic_extracted.db', 'LTU_AHouse_extracted.db', 'Schependomlaan_extracted.db', 'Jesse_extracted.db', 'FZKHaus_extracted.db', 'AC90_Jasmin_extracted.db',
  'Molio_extracted.db', 'HITOS_extracted.db', 'Ifc4_Revit_extracted.db', 'BimWhale_Basic_extracted.db', 'WBDG_Office_extracted.db', 'Shed_film.db',
  'Villa_SH_01.ifc', 'My_SC_house.ifc', 'Duplex_DX_unit.ifc', 'Office Tower.ifc'];
var RESIDENTIAL = ['SampleHouse_ARC.db', 'Duplex_ARC.db', 'SampleCastle_ARC.db', 'Duplex_extracted.db', 'Duplex_mep_extracted.db', 'SampleCastle_extracted.db',
  'SampleCastle_ARC_extracted.db', 'SampleHouse_extracted.db', 'Schependomlaan_extracted.db', 'Villa_SH_01.ifc', 'My_SC_house.ifc', 'Duplex_DX_unit.ifc'];

function slice(src, startMarker, endMarker) { var a = src.indexOf(startMarker); if (a < 0) return null; var b = src.indexOf(endMarker, a); return b < 0 ? null : src.slice(a, b + endMarker.length); }
function dwRulesSrc(html) { return slice(html, 'window._dwRules = function', '\n') ; }       // single line (new) or first line (old)
function dwRulesFull(html) { var a = html.indexOf('window._dwRules = function'); if (a < 0) return null; var b = html.indexOf('};', a); var nl = html.indexOf('\n', a);
  return html.slice(a, (html.slice(a, nl).indexOf('};') >= 0) ? nl : b + 2); }
function bustSrc(html) { return slice(html, 'window._dwBustStaleRulesCache = async function', '\n};\n'); }

function fakeIdb(store) {
  return { open: function () { var rq = {}; setTimeout(function () { rq.result = { objectStoreNames: { contains: function (n) { return n === 'dbs'; } },
    transaction: function () { var tx = { pending: 0 };
      function req(fn) { var r = {}; tx.pending++; setTimeout(function () { r.result = fn(); if (r.onsuccess) r.onsuccess(); tx.pending--; if (!tx.pending) setTimeout(function () { if (tx.oncomplete) tx.oncomplete(); }, 0); }, 0); return r; }
      tx.objectStore = function () { return { count: function (k) { return req(function () { return store.has(k) ? 1 : 0; }); }, delete: function (k) { return req(function () { store.delete(k); }); } }; };
      return tx; } }; if (rq.onsuccess) rq.onsuccess(); }, 0); return rq; } };
}
// The REAL read/write key: fetch URL that dwInit actually requests for (file, base).
async function realKey(file, base) {
  var got = null; global.fetch = async function (u) { got = u; throw new Error('stop'); };
  try { await DW.dwInit({ Database: function () { throw new Error('stop'); } }, base, file); } catch (e) { }
  return got;
}
async function runBust(html, base, name, seedFiles, forceNoBc) {
  var src = bustSrc(html); if (!src) return { err: 'bust source not found' };
  var store = new Map(), logs = [];
  for (var i = 0; i < seedFiles.length; i++) store.set(await realKey(seedFiles[i], base), 1);
  var ls = {}; var win = { __dwRulesVer: 'vT', __dwName: name, _DW_BASE: base, DiscWalker: DW, BuildingClass: forceNoBc ? undefined : BC };
  var ctx = { window: win, localStorage: { getItem: function (k) { return ls[k] || null; }, setItem: function (k, v) { ls[k] = v; } }, indexedDB: fakeIdb(store),
    console: { log: function (m) { logs.push(String(m)); }, warn: function (m) { logs.push('WARN ' + m); } } };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  await win._dwBustStaleRulesCache();
  return { store: store, logs: logs };
}

var results = [];   // {variant, claim, ok}
var judged = 0;
function claim(variant, id, ok, detail) { judged++; results.push({ variant: variant, id: id, ok: !!ok }); console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' [' + variant + '] ' + id + (detail ? ' — ' + detail : '')); }

async function judge(variant, html, opts) {
  console.log('§W3C variant=' + variant);
  // ---- F8 claims
  var fullDw = dwRulesFull(html), dwFn = null;
  if (fullDw) { var c = { window: { BuildingClass: BC } }; vm.createContext(c); try { vm.runInContext(fullDw, c); dwFn = c.window._dwRules; } catch (e) { } }
  // C1/C3a: modeller.html _dwRules == owner for every tabulated name
  var bad = NAMES.filter(function (n) { return !dwFn || dwFn(n) !== BC.rulesDb(n); });
  claim(variant, 'C1 _dwRules(html) == owner for ' + NAMES.length + ' names', dwFn && !bad.length, bad.length ? 'differs: ' + bad.join(',') : '');
  // C2 residential -> duplex
  var badR = RESIDENTIAL.filter(function (n) { return BC.rulesDb(n) !== 'duplex_rules.db' || (dwFn && dwFn(n) !== 'duplex_rules.db'); });
  claim(variant, 'C2 residential names -> duplex_rules.db', !badR.length, badR.join(','));
  // C3 no inline regex copy in _dwRules
  claim(variant, 'C3 _dwRules has no inline classifier regex (delegates to BuildingClass)', fullDw && !/sample\.\?house|schependomlaan/i.test(fullDw) && /BuildingClass\.rulesDb/.test(fullDw));
  // ---- F18 claims
  var bs = bustSrc(html);
  claim(variant, 'C4a bust has no hardcoded "./<x>_rules.db" key', bs && !/['"]\.\/(terminal|duplex|farm)_rules\.db['"]/.test(bs));
  var BASES = ['./', '../modeller/'];
  for (var bi = 0; bi < BASES.length; bi++) {
    var base = BASES[bi];
    var name = 'Terminal_ARC.db', inUse = BC.rulesDb(name);
    var r = await runBust(html, base, name, [inUse], opts && opts.noBc);
    var k = await realKey(inUse, base);
    if (r.err) { claim(variant, 'C4b[' + base + '] ' + r.err, false); continue; }
    var gone = !r.store.has(k);
    var logTrue = r.logs.some(function (l) { return l.indexOf('§RULES_BUST key=' + k + ' deleted=true') === 0; });
    claim(variant, 'C4b[' + base + '] in-use rules key (= dwInit real key ' + k + ') is deleted and log says deleted=true', gone && logTrue, 'gone=' + gone + ' logTrue=' + logTrue);
    var r0 = await runBust(html, base, name, [], opts && opts.noBc);
    var claimedEvict = r0.logs.some(function (l) { return /evicted/.test(l); });
    var falseLogged = r0.logs.some(function (l) { return l.indexOf('deleted=false') >= 0; });
    claim(variant, 'C4c[' + base + '] nothing cached -> no eviction claimed, deleted=false logged', !claimedEvict && falseLogged, 'claimedEvict=' + claimedEvict + ' deleted=false logged=' + falseLogged);
    // sibling stays covered: duplex cached while Terminal in use
    var r2 = await runBust(html, base, name, ['duplex_rules.db'], opts && opts.noBc);
    claim(variant, 'C4d[' + base + '] sibling stale rules DB also evicted', !r2.store.has(await realKey('duplex_rules.db', base)));
  }
}

(async function () {
  var HTML_NEW = cur('modeller/modeller.html'), HTML_BASE = show('modeller/modeller.html');
  console.log('§W3C pinned BASE=' + BASE);
  // owner purity (also shipped-name table)
  console.log('§BUILDING_CLASS owner table (name -> cls / rulesDb):');
  NAMES.forEach(function (n) { var b = BC.buildingClass(n); console.log('  ' + n.padEnd(36) + b.cls.padEnd(12) + b.rulesDb); });
  await judge('NEW', HTML_NEW, {});
  var mutA = HTML_NEW.replace(/window\._dwRules = function \(nm\) \{[^\n]*\n/, "window._dwRules = function (nm) { return /duplex|sample.?house|sample.?castle|schependomlaan|(^|[^A-Z])(SH|DX|SC)([^A-Z]|$)/i.test(nm || '') ? 'duplex_rules.db' : 'terminal_rules.db'; };\n");
  var mutB = HTML_NEW.replace(/var keys = files\.map\([^\n]*\n/, "var keys = ['./terminal_rules.db', './duplex_rules.db'];\n");
  console.log('mutant sanity: A changed=' + (mutA !== HTML_NEW) + ' B changed=' + (mutB !== HTML_NEW));
  var base = results.length;
  var newFails = results.filter(function (x) { return !x.ok; }).length;
  await judge('BASELINE@' + BASE, HTML_BASE, { noBc: true });
  var baseFails = results.slice(base).filter(function (x) { return !x.ok; }).length;
  base = results.length; await judge('MUTANT-A(own regex)', mutA, {});
  var mAfails = results.slice(base).filter(function (x) { return !x.ok; }).length;
  base = results.length; await judge('MUTANT-B(hardcoded bust key)', mutB, {});
  var mBfails = results.slice(base).filter(function (x) { return !x.ok; }).length;

  // C6 STOPPED: viewer-side classifiers vs owner
  function viewerClass(srcPath, getSrc) {
    var m = /function _buildingClass\(\) \{[\s\S]*?\n\s*\}\n/.exec(getSrc); if (!m) return null;
    var lists = /var _RESIDENTIAL_BUILDINGS[^\n]*\n\s*var _COMPLEX_BUILDINGS[^\n]*\n/.exec(getSrc); if (!lists) return null;
    return function (n) { var c = { A: { DB_URL: n }, window: { __dwName: n } }; vm.createContext(c); vm.runInContext(lists[0] + m[0] + ';this.r=_buildingClass();', c); return c.r; };
  }
  var vf = viewerClass('nf', cur('viewer/nf_tree_lens.js')), of = viewerClass('ol', cur('modeller/building_parts_outliner.js'));
  var diverge = [];
  if (vf && of) NAMES.forEach(function (n) { var o = BC.buildingClass(n).cls, a = vf(n), b = of(n);
    var expectA = (o === 'terminal') ? 'complex' : o; if (a !== expectA || b !== expectA) diverge.push(n + ' viewer=' + a + ' outliner=' + b + ' owner=' + o); });
  console.log('§W3C STOPPED (owner decision, not judged): viewer/nf_tree_lens.js + modeller/building_parts_outliner.js classifiers diverge from owner on ' + diverge.length + '/' + NAMES.length + ' names; PLANT_ROOM gate is user-visible. e.g. ' + diverge.slice(0, 3).join(' | '));

  console.log('§W3C verdict-input: judged=' + judged + ' NEWfails=' + newFails + ' BASEfails=' + baseFails + ' mutAfails=' + mAfails + ' mutBfails=' + mBfails);
  if (!judged || !vf || !of) { console.log('§W3C INCONCLUSIVE — nothing judged / viewer classifiers not extractable'); process.exit(2); }
  var ok = newFails === 0 && baseFails > 0 && mAfails > 0 && mBfails > 0;
  console.log('§W3C ' + (ok ? 'PASS' : 'FAIL') + ' — new=' + (newFails ? 'FAIL' : 'ok') + ' baseline-discriminates=' + (baseFails > 0) + ' mutantA-caught=' + (mAfails > 0) + ' mutantB-caught=' + (mBfails > 0));
  process.exit(ok ? 0 : 1);
})();
