#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS §X0_ISOLATION (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 + RULES "Minimalism",
// issue #2920). Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the dev-side extension reaches the browser" — it must not. Three doors are checked:
//   precache = string literals naming devtools/ in any service worker (sw.js), read with a parser (espree), not a regex
//   minify   = entries of scripts/minify_pages.js INCLUDE_DIRS that cover devtools/ (so the Pages build would ship it)
//   tags     = <script src> / <link href> in any .html page that points into devtools/
// RED CONTROLS: the same three counters run on planted fixtures must each count 1.
// Nothing judged (no sw.js, no INCLUDE_DIRS, no .html) → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_isolation.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SELF = 'devtools/vscode/x0-navigator';
const SKIP = new Set(['node_modules', '.git', '.claude', 'logs', 'out']);

let espree;
try { espree = require(require.resolve('espree', { paths: [ROOT] })); } catch (e) { espree = null; }

function walk(dir, keep, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(full, keep, out); } else if (e.isFile() && keep(e.name)) out.push(full);
  }
  return out;
}
function visit(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => visit(c, fn)); else if (v && typeof v === 'object') visit(v, fn);
  }
}
const parse = src => espree.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });

/** String literals (and template text) in a service worker that name the devtools folder. */
function precacheHits(src) {
  let n = 0;
  visit(parse(src), node => {
    const s = node.type === 'Literal' && typeof node.value === 'string' ? node.value
      : node.type === 'TemplateElement' ? node.value.cooked : null;
    if (s && /(^|\/)devtools\//.test(s)) n++;
  });
  return n;
}
/** INCLUDE_DIRS entries that cover the extension folder. Returns null when the array is not found. */
function minifyHits(src) {
  let dirs = null;
  visit(parse(src), node => {
    if (node.type === 'VariableDeclarator' && node.id.name === 'INCLUDE_DIRS' && node.init && node.init.type === 'ArrayExpression') {
      dirs = node.init.elements.map(e => (e && e.type === 'Literal' ? String(e.value) : null));
    }
  });
  if (!dirs) return null;
  return dirs.filter(d => d === null || d === '.' || d === '' || (SELF + '/').startsWith(d.replace(/\/+$/, '') + '/')).length;
}
/** <script src> / <link href> attributes that point into devtools/. */
function tagHits(html) {
  const m = html.match(/<(script|link)\b[^>]*\b(src|href)\s*=\s*["'][^"']*devtools\/[^"']*["']/gi);
  return m ? m.length : 0;
}

function line(f, verdict) {
  console.log('§X0_ISOLATION ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict);
}
if (!espree) { console.log('  espree not found (npm install in the repo root)'); line({ precache: '?', minify: '?', tags: '?' }, 'INCONCLUSIVE'); process.exit(0); }

const swFiles = walk(ROOT, n => n === 'sw.js', []);
const htmlFiles = walk(ROOT, n => n.endsWith('.html'), []);
let precache = 0, tags = 0;
for (const f of swFiles) {
  const n = precacheHits(fs.readFileSync(f, 'utf8'));
  if (n) console.log('  precache hit: ' + path.relative(ROOT, f) + ' ×' + n);
  precache += n;
}
for (const f of htmlFiles) {
  const n = tagHits(fs.readFileSync(f, 'utf8'));
  if (n) console.log('  page tag hit: ' + path.relative(ROOT, f) + ' ×' + n);
  tags += n;
}
let minify = null;
try { minify = minifyHits(fs.readFileSync(path.join(ROOT, 'scripts', 'minify_pages.js'), 'utf8')); } catch (e) { minify = null; }

// Red controls: each counter must be able to count.
const redPre = precacheHits("const PRECACHE_ASSETS = ['./a.js', '../devtools/vscode/x0-navigator/extension.js'];");
const redMin = minifyHits("const INCLUDE_DIRS = ['erp', 'devtools'];");
const redTag = tagHits('<html><script src="../devtools/vscode/x0-navigator/extension.js"></script></html>');
const redOk = redPre === 1 && redMin === 1 && redTag === 1;
console.log('  ' + (redOk ? 'PASS' : 'FAIL') + ' red controls count planted hits (precache=' + redPre + ' minify=' + redMin + ' tags=' + redTag + ')');
// The extension's own manifest must carry no dependencies (RULES: plain JS, no npm).
let deps = '?';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, SELF, 'package.json'), 'utf8'));
  deps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
} catch (e) { deps = '?'; }
console.log('  ' + (deps === 0 ? 'PASS' : 'FAIL') + ' extension package.json has no dependencies (n=' + deps + ')');

const judged = swFiles.length > 0 && htmlFiles.length > 0 && minify !== null;
const fields = { precache, minify: minify === null ? '?' : minify, tags, sw_files: swFiles.length, html_files: htmlFiles.length, deps, red: redOk ? 'Y' : 'N' };
if (!judged) { line(fields, 'INCONCLUSIVE'); process.exit(0); }
const pass = precache === 0 && minify === 0 && tags === 0 && deps === 0 && redOk;
line(fields, pass ? 'PASS' : 'FAIL');
if (!pass) process.exitCode = 1;
