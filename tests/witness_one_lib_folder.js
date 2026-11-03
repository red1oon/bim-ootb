#!/usr/bin/env node
/* ⚠ WITNESS — W-ONE-LIB-FOLDER (bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md D1). READ THE LOG after every run.
 * ISSUE: six shared libs (web-ifc-api-iife.js, web-ifc.wasm, sql-wasm.js, sql-wasm.wasm, OrbitControls.module.js, planegcs/) were
 *   duplicated byte-for-byte in viewer/lib and modeller/lib (~16 MB x2, every bump done twice). Now ONE canonical copy: common/lib/.
 *   viewer/lib + modeller/lib copies STAY as compat mirrors (old tabs / old service workers / external links).
 * CLAIMS (all §OLIB-tagged):
 *   L1 no shipped file references <viewer|modeller>/lib/<shared> (static url, relative url, importScripts, SW list, SetWasmPath,
 *      and the dynamic `'lib/' + f` locateFile/Init form unless it redirects the shared name to common/lib).
 *   L2 every common/lib reference resolves (against its OWN file / worker / SW directory) to a file that exists; planegcs internal imports resolve.
 *   L3 each compat mirror is sha256-identical to common/lib (drift guard).
 *   L4 DEFERRED libs (web-ifc api+wasm, planegcs.wasm) are in DEFERRED_LIBS only — never in the SW install set (PRECACHE_ASSETS/SHELL_LIBS).
 * SCOPE: git-tracked text files minus tests/ docs/ archive/ prompts/ sandbox/ node_modules/ internal/ scripts/ geomapping/ test/ *.md *.json
 *   (scripts/geomapping = node dev tools that read the mirrors; they are not shipped pages).
 * BASELINE pinned to efaa13ce (pre-change) — must FAIL. MUTANTS (page still loads viewer/lib/sql-wasm.js; mirror byte flipped; web-ifc moved to
 *   SHELL; dangling common ref) — each must FAIL. Empty judged population → INCONCLUSIVE.
 * RUN: node tests/witness_one_lib_folder.js [--before-ref=efaa13ce]   (Node only; no browser)
 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || 'efaa13ce';
var SHARED = ['web-ifc-api-iife.js', 'web-ifc.wasm', 'sql-wasm.js', 'sql-wasm.wasm', 'OrbitControls.module.js', 'planegcs/'];
var DEFERRED = ['web-ifc-api-iife.js', 'web-ifc.wasm', 'planegcs/planegcs_dist/planegcs.wasm'];
var EXCL = /(^|\/)(tests|docs|archive|prompts|sandbox|node_modules|internal|scripts|geomapping|test)\//;
function git(args, buf) { return cp.execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'], encoding: buf ? null : 'utf8' }); }
function treeNow() { var l = git(['ls-files', '-co', '--exclude-standard']).split('\n').filter(Boolean); return mk(l, function (p) { return fs.readFileSync(path.join(ROOT, p)); }); }
function treeRef() { var l = git(['ls-tree', '-r', '--name-only', REF]).split('\n').filter(Boolean); return mk(l, function (p) { return git(['show', REF + ':' + p], true); }); }
function mk(list, rd) { var set = new Set(list), ov = {}; return { list: list, set: set, ov: ov, has: function (p) { return set.has(p) || p in ov; }, read: function (p) { return p in ov ? ov[p] : rd(p); } }; }
function overlay(t, p, buf) { var o = mk(t.list, t.read); o.ov = Object.assign({}, t.ov); var rd = t.read; o.read = function (q) { return q in o.ov ? o.ov[q] : rd(q); }; o.ov[p] = buf; o.set = new Set(t.list); o.has = function (q) { return o.set.has(q) || q in o.ov; }; return o; }
function inScope(p) { return /\.(js|html)$/.test(p) && !EXCL.test(p) && !/^(viewer|modeller|common)\/lib\//.test(p) && !/^(erp\/(lib|sqljs))\//.test(p); }
function resolve(fileDir, rel) { return path.posix.normalize(path.posix.join(fileDir, rel)); }
function sharedName(s) { return SHARED.some(function (n) { return n.slice(-1) === '/' ? s.indexOf(n) === 0 : s === n; }); }
function stripComments(txt) { return txt.split('\n').map(function (l) { var t = l.trim(); return (t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('<!--') === 0 && t.slice(-3) === '-->') ? '' : l; }).join('\n'); }

var STATIC = /((?:[\w.\-]+\/|\.\.\/|\.\/)*)lib\/(web-ifc-api-iife\.js|web-ifc\.wasm|sql-wasm\.js|sql-wasm\.wasm|OrbitControls\.module\.js|planegcs\/[\w./\-]*)/g;
var COMMON = /((?:[\w.\-]+\/|\.\.\/|\.\/)*?)common\/lib\/(\w[\w./\-]*)/g;
var MAPPED = /===\s*'(sql-wasm\.wasm|web-ifc\.wasm)'\s*\?\s*'((?:\.\.\/)*(?:[\w.\-]+\/)*)lib\/'\s*:\s*'((?:\.\.\/)*(?:[\w.\-]+\/)*)lib\/'/g;
var DYN = /(['"])((?:\.\.\/)*(?:(?:viewer|modeller)\/)?)lib\/\1\s*\+/g;

function judgeRefs(T, tag, out) {
  var files = T.list.filter(inScope), v1 = [], refs = [], dyn = 0, nstatic = 0;
  files.forEach(function (p) {
    var raw; try { raw = T.read(p).toString('utf8'); } catch (e) { return; }
    var txt = stripComments(raw), dir = path.posix.dirname(p), m;
    STATIC.lastIndex = 0;
    while ((m = STATIC.exec(txt))) {
      var tgt = resolve(dir, m[1] + 'lib/' + m[2]); nstatic++;
      if (/^(viewer|modeller)\/lib\//.test(tgt)) v1.push(p + ' → ' + tgt);
      }
    COMMON.lastIndex = 0;   // every literal common/lib/<name> (catches typos / names outside the six too)
    while ((m = COMMON.exec(txt))) refs.push({ f: p, t: resolve(dir, m[1] + 'common/lib/' + m[2].replace(/[.,;:]+$/, '')), kind: 'static' });
    MAPPED.lastIndex = 0;
    while ((m = MAPPED.exec(txt))) { dyn++; var t2 = resolve(dir, m[2] + 'lib/' + m[1]); if (/^common\/lib\//.test(t2)) refs.push({ f: p, t: t2, kind: 'mapped' }); else v1.push(p + ' mapped → ' + t2); }
    DYN.lastIndex = 0;
    while ((m = DYN.exec(txt))) {   // a `'lib/' + f` locateFile/Init builder: legit only when the shared name is redirected just before it
      var before = txt.slice(Math.max(0, m.index - 140), m.index);
      if (!/common\/lib\//.test(before) && /locateFile|\.Init\(|return\s*$|=>\s*$|\{\s*return\s*$/.test(before.slice(-90) + txt.slice(m.index, m.index + 5))) v1.push(p + ' unredirected dynamic lib/ + name near: ' + txt.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' '));
    }
  });
  var fails = [], notes = [];
  // L1
  out('§OLIB ' + tag + ' L1 files=' + files.length + ' staticRefs=' + nstatic + ' mappedDyn=' + dyn + ' violations=' + v1.length);
  v1.slice(0, 6).forEach(function (x) { out('§OLIB ' + tag + ' L1 VIOLATION ' + x); });
  if (v1.length) fails.push('L1');
  // L2
  var bad = refs.filter(function (r) { return !T.has(r.t); });
  out('§OLIB ' + tag + ' L2 commonRefs=' + refs.length + ' unresolved=' + bad.length + ' distinctTargets=' + new Set(refs.map(function (r) { return r.t; })).size);
  bad.slice(0, 6).forEach(function (r) { out('§OLIB ' + tag + ' L2 DANGLING ' + r.f + ' → ' + r.t); });
  if (bad.length) fails.push('L2');
  var pg = T.list.filter(function (p) { return /^common\/lib\/planegcs\/.*\.js$/.test(p); }), pgBad = 0, pgN = 0;
  pg.forEach(function (p) { var txt = T.read(p).toString('utf8'), m, re = /(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g; while ((m = re.exec(txt))) { pgN++; if (!T.has(resolve(path.posix.dirname(p), m[1]))) pgBad++; } });
  out('§OLIB ' + tag + ' L2b planegcsInternalImports=' + pgN + ' unresolved=' + pgBad);
  if (pgBad) fails.push('L2b');
  return { fails: fails, judged: nstatic + dyn + refs.length, refs: refs.length };
}

function judgeMirrors(T, tag, out) {
  var canon = T.list.filter(function (p) { return /^common\/lib\//.test(p); }), bad = [], n = 0;
  canon.forEach(function (p) {
    var h = crypto.createHash('sha256').update(T.read(p)).digest('hex');
    ['viewer', 'modeller'].forEach(function (app) {
      var q = app + '/' + p.slice('common/'.length); n++;
      if (!T.has(q)) bad.push(q + ' MISSING'); else if (crypto.createHash('sha256').update(T.read(q)).digest('hex') !== h) bad.push(q + ' DRIFT');
    });
  });
  var want = SHARED.filter(function (s) { return s.slice(-1) !== '/'; });
  var missing = want.filter(function (s) { return !T.has('common/lib/' + s); });
  out('§OLIB ' + tag + ' L3 canonicalFiles=' + canon.length + ' mirrorsChecked=' + n + ' drift/missing=' + bad.length + ' canonicalMissing=[' + missing.join(',') + ']');
  bad.slice(0, 5).forEach(function (x) { out('§OLIB ' + tag + ' L3 ' + x); });
  var fails = []; if (bad.length || missing.length || !T.list.some(function (p) { return p.indexOf('common/lib/planegcs/') === 0; })) fails.push('L3');
  return { fails: fails, judged: n };
}

function arr(txt, name) { var m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];').exec(txt); return m ? (m[1].match(/'[^']+'/g) || []).map(function (s) { return s.slice(1, -1); }) : null; }
function judgeDeferred(T, tag, out) {
  var fails = [], judged = 0;
  ['viewer/sw.js', 'modeller/sw.js'].forEach(function (sw) {
    if (!T.has(sw)) return;
    var txt = T.read(sw).toString('utf8'), D = arr(txt, 'DEFERRED_LIBS'), S = arr(txt, 'SHELL_LIBS'), P = arr(txt, 'PRECACHE_ASSETS');
    var inst = /const _installSet = \[\.\.\.PRECACHE_ASSETS, \.\.\.SHELL_LIBS\]/.test(txt);
    if (!D || !S || !P) { out('§OLIB ' + tag + ' L4 ' + sw + ' lists not parsable'); fails.push('L4'); return; }
    var base = function (x) { return x.replace(/^(\.\.\/common\/)?lib\//, ''); };
    var want = DEFERRED.filter(function (d) { return sw !== 'viewer/sw.js' || d.indexOf('planegcs') < 0; });
    var isIn = function (list, d) { return list.some(function (x) { return base(x) === d; }); };
    var inD = want.filter(function (d) { return isIn(D, d); }), leak = want.filter(function (d) { return isIn(S, d) || isIn(P, d); });
    judged += want.length;
    out('§OLIB ' + tag + ' L4 ' + sw + ' deferredWanted=' + want.length + ' inDEFERRED=' + inD.length + ' leakedToInstall=' + leak.length + ' installSetFormula=' + inst + ' shellShared=' + S.filter(function (x) { return sharedName(base(x)); }).length);
    if (inD.length !== want.length || leak.length || !inst) fails.push('L4:' + sw);
  });
  return { fails: fails, judged: judged };
}

function judge(name, T) {
  var lines = []; var out = function (s) { lines.push(s); console.log(s); };
  var r = judgeRefs(T, name, out), m = judgeMirrors(T, name, out), d = judgeDeferred(T, name, out);
  var fails = r.fails.concat(m.fails, d.fails), judged = r.judged + m.judged + d.judged;
  // INCONCLUSIVE only if nothing was judged at all; a tree with zero common refs is judged (and L3 fails it) rather than vacuous
  var verdict = judged === 0 ? 'INCONCLUSIVE' : (fails.length ? 'FAIL' : 'PASS');
  out('§OLIB ' + name + ' VERDICT ' + verdict + ' judged=' + judged + (fails.length ? ' failed=[' + fails.join(',') + ']' : '') + ' commonRefs=' + r.refs);
  return { verdict: verdict, fails: fails };
}

var NOW = treeNow(), BASE = treeRef();
var a = judge('AFTER', NOW), b = judge('BASELINE@' + REF, BASE);
function sub(t, p, from, to) { var s = t.read(p).toString('utf8'); if (s.indexOf(from) < 0) throw new Error('mutant anchor missing in ' + p + ': ' + from); return overlay(t, p, Buffer.from(s.split(from).join(to))); }
var mut = {};
mut['M1 page loads viewer/lib/sql-wasm.js'] = sub(NOW, 'viewer/boq_charts.html', '<script src="../common/lib/sql-wasm.js">', '<script src="lib/sql-wasm.js">');
var wb = Buffer.from(NOW.read('modeller/lib/web-ifc.wasm')); wb[wb.length - 1] ^= 0xff;
mut['M2 mirror byte flipped'] = overlay(NOW, 'modeller/lib/web-ifc.wasm', wb);
mut['M3 web-ifc.wasm moved into SHELL_LIBS'] = sub(NOW, 'viewer/sw.js', "const SHELL_LIBS = [\n", "const SHELL_LIBS = [\n  '../common/lib/web-ifc.wasm',\n");
mut['M4 dangling common ref'] = sub(NOW, 'modeller/ifc_open_worker.js', "importScripts('../common/lib/web-ifc-api-iife.js'", "importScripts('../common/lib/web-ifc-api-iife-x.js'");
mut['M5 dynamic locateFile un-redirected'] = sub(NOW, 'viewer/import.js', "locateFile: f => (f === 'sql-wasm.wasm' ? '../common/lib/' : 'lib/') + f", "locateFile: f => 'lib/' + f");
var mv = Object.keys(mut).map(function (k) { return { k: k, r: judge('MUTANT(' + k + ')', mut[k]) }; });
var empty = judge('EMPTY', mk([], function () { return Buffer.alloc(0); }));

var ok = a.verdict === 'PASS' && b.verdict === 'FAIL' && mv.every(function (x) { return x.r.verdict === 'FAIL'; }) && empty.verdict === 'INCONCLUSIVE';
console.log('§OLIB SUMMARY after=' + a.verdict + ' baseline=' + b.verdict + ' mutants=[' + mv.map(function (x) { return x.r.verdict; }).join(',') + '] empty=' + empty.verdict);
console.log('§OLIB WITNESS ' + (ok ? 'PASS' : 'FAIL') + ' (after PASS, baseline FAIL, every mutant FAIL, empty INCONCLUSIVE)');
process.exit(ok ? 0 : 1);
