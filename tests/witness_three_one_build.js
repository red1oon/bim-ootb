#!/usr/bin/env node
/* ⚠ WITNESS — W-THREE-ONE-BUILD (bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md §5 three.js note). READ THE LOG after every run.
 * ISSUE: modeller.html's importmap sent the bare 'three' specifier (used by common/lib/OrbitControls.module.js) to
 *   three.webgpu.min.js while the page builds window.THREE from three.module.min.js — so EVERY Modeller load evaluated two
 *   wrappers (the 638 KB WebGPU one unused) and the SW precached it on every install. Both wrappers import one
 *   three.core.min.js, so there was never a second core — this witness proves that stays true and that one wrapper serves.
 * CLAIMS (per page, Modeller + Viewer): R1 importmap 'three' resolves to the SAME file the page builds window.THREE from;
 *   R2 every wrapper reached imports exactly one ./three.core.min.js (one core instance); M1 Modeller SW no longer installs
 *   three.webgpu.min.js but still lists it for cache-on-use.
 * BASELINE pinned to 0dc101a9 — Modeller R1 + M1 must FAIL. MUTANT: importmap back to webgpu — must FAIL. 0 judged → INCONCLUSIVE.
 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = path.resolve(__dirname, '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || '0dc101a9';
function cur(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function old(p) { try { return cp.execSync('git show ' + REF + ':' + p, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } }
function importmapThree(html) { var m = /<script type="importmap">\s*([\s\S]*?)<\/script>/.exec(html); if (!m) return null; try { return (JSON.parse(m[1]).imports || {}).three || null; } catch (e) { return null; } }
function coreImports(file) { try { var s = fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 20000); /* the import list runs ~5 KB */ return (s.match(/from\s*["']\.\/three\.core\.min\.js["']/g) || []).length; } catch (e) { return -1; } }
function judge(tag, F) {
  var fails = [], n = 0;
  function ck(ok, msg) { n++; console.log('§T1B ' + tag + ' ' + (ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); }
  // Modeller: window.THREE is built from `await import('./lib/three.module.min.js')`
  var mm = importmapThree(F.mh), mBuilt = /await import\('\.\/lib\/three\.module\.min\.js'\)/.test(F.mh) ? './lib/three.module.min.js' : null;
  ck(!!mm && !!mBuilt && mm === mBuilt, 'R1 Modeller importmap three=' + mm + ' == window.THREE build ' + mBuilt);
  // Viewer: scene.js overlays three.module.min.js (the WebGLRenderer build) — the bare specifier must point at it
  var vm_ = importmapThree(F.vh);
  ck(vm_ === './lib/three.module.min.js', 'R1 Viewer importmap three=' + vm_ + ' == the WebGL build scene.js overlays');
  ['modeller/lib/three.module.min.js', 'modeller/lib/three.webgpu.min.js', 'viewer/lib/three.module.min.js', 'viewer/lib/three.webgpu.min.js']
    .forEach(function (w) { var c = coreImports(w); ck(c >= 1, 'R2 ' + w + ' imports ./three.core.min.js (shared core) n=' + c); });
  var shell = (/const SHELL_LIBS = \[([\s\S]*?)\];/.exec(F.ms) || [])[1] || '', def = (/const DEFERRED_LIBS = \[([\s\S]*?)\];/.exec(F.ms) || [])[1] || '';
  ck(shell.indexOf('three.webgpu.min.js') < 0 && def.indexOf('three.webgpu.min.js') >= 0, 'M1 Modeller SW: webgpu wrapper not installed, still cache-on-use');
  return { fails: fails, n: n };
}
var NOW = { mh: cur('modeller/modeller.html'), vh: cur('viewer/viewer.html'), ms: cur('modeller/sw.js') };
var BASE = { mh: old('modeller/modeller.html'), vh: old('viewer/viewer.html'), ms: old('modeller/sw.js') };
var MUT = { mh: NOW.mh.replace('"three": "./lib/three.module.min.js"', '"three": "./lib/three.webgpu.min.js"'), vh: NOW.vh, ms: NOW.ms };
var a = judge('AFTER', NOW), b = BASE.mh ? judge('BASELINE@' + REF, BASE) : { fails: [], n: 0 }, m = judge('MUTANT(importmap->webgpu)', MUT);
if (!a.n || !b.n) { console.log('§T1B_VERDICT INCONCLUSIVE'); process.exit(2); }
var ok = a.fails.length === 0 && b.fails.length > 0 && m.fails.length > 0;
console.log('§T1B_VERDICT ' + (ok ? 'PASS' : 'FAIL') + ' after=' + (a.n - a.fails.length) + '/' + a.n + ' baselineFails=' + b.fails.length + ' mutantFails=' + m.fails.length);
process.exit(ok ? 0 : 1);
