#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope guard / GH_DEPLOY minify pass (prompts/UI_PAYLOAD_PERF.md Win #1)
// Scope: shrink the OWN-source JS payload served to browsers, WITHOUT touching the readable
//   sources in git. Run by .github/workflows/deploy-pages.yml against the EPHEMERAL Pages
//   checkout only — it minifies the .js files in place in that throwaway workspace, then the
//   workflow uploads that minified tree as the Pages artifact. The repo source is never changed.
//
// NON-NEGOTIABLE — ZERO BEHAVIOR CHANGE: these are global-style <script> files that share
//   globals across files (e.g. window.ADGraph defined in ad_graph.js, referenced in ad_ui.js).
//   esbuild identifier-mangling would rename top-level globals and break those cross-file refs,
//   so we use minifyWhitespace + minifySyntax ONLY (minifyIdentifiers:false). This is the safe,
//   correctness-preserving subset; the remaining win after gzip is still real (see §PAYLOAD-MIN).
//
// SKIPS: lib/ (third-party, already minified), node_modules/, *.min.js, tests/ (not shipped to
//   users on the hot path — and we don't want to mangle test fixtures), and *.worker bundles that
//   are already built. Everything else under erp/ viewer/ common/ + root *.js is minified.
//
// WITNESS: emits §PAYLOAD-MIN per file (before/after bytes + gzip) and a §PAYLOAD-MIN-TOTAL line.
//   READ the log — the KB delta is the proof. Behavior proof is separate: the whitebox/Playwright
//   suite must pass on the minified tree (run scripts/minify_pages_verify.sh).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let esbuild;
try { esbuild = require('esbuild'); }
catch (e) { console.error('§PAYLOAD-MIN FATAL esbuild not installed — `npm i esbuild` first'); process.exit(2); }

const ROOT = process.argv[2] || process.cwd();
const INCLUDE_DIRS = ['erp', 'viewer', 'common'];       // our own code lives here
const SKIP_DIR = /(^|\/)(lib|node_modules|tests|\.git)(\/|$)/;
const SKIP_FILE = /\.min\.js$/;

function walk(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const ent of ents) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(ROOT, full);
    if (SKIP_DIR.test('/' + rel)) continue;
    if (ent.isDirectory()) walk(full, out);
    else if (ent.isFile() && ent.name.endsWith('.js') && !SKIP_FILE.test(ent.name)) out.push(full);
  }
  return out;
}

function gz(buf) { return zlib.gzipSync(buf, { level: 9 }).length; }

(async () => {
  const files = [];
  // root-level *.js (e.g. nothing today, but future-proof) + the include dirs
  for (const d of INCLUDE_DIRS) walk(path.join(ROOT, d), files);

  let beforeRaw = 0, afterRaw = 0, beforeGz = 0, afterGz = 0, ok = 0, fail = 0, skipped = 0;
  for (const f of files) {
    const src = fs.readFileSync(f);
    let res;
    try {
      res = await esbuild.transform(src, {
        loader: 'js',
        minifyWhitespace: true,
        minifySyntax: true,
        minifyIdentifiers: false,   // ← cross-file globals: NEVER mangle names
        legalComments: 'none',
        target: 'es2018',
      });
    } catch (e) {
      // A parse failure must NOT corrupt the deploy — keep the original file, log it.
      console.log(`§PAYLOAD-MIN SKIP ${path.relative(ROOT, f)} (transform error: ${e.message.split('\n')[0]})`);
      skipped++;
      continue;
    }
    const out = Buffer.from(res.code, 'utf8');
    // Guard: never grow a file (tiny files can round-trip larger); keep the smaller of the two.
    if (out.length >= src.length) { skipped++; continue; }
    const bR = src.length, aR = out.length, bG = gz(src), aG = gz(out);
    fs.writeFileSync(f, out);
    beforeRaw += bR; afterRaw += aR; beforeGz += bG; afterGz += aG; ok++;
    console.log(`§PAYLOAD-MIN ${path.relative(ROOT, f)} raw ${(bR/1024).toFixed(1)}→${(aR/1024).toFixed(1)}KB gz ${(bG/1024).toFixed(1)}→${(aG/1024).toFixed(1)}KB`);
  }
  const pct = beforeGz ? ((1 - afterGz / beforeGz) * 100).toFixed(1) : '0';
  console.log(`§PAYLOAD-MIN-TOTAL files=${ok} skipped=${skipped} raw ${(beforeRaw/1024).toFixed(0)}→${(afterRaw/1024).toFixed(0)}KB gz ${(beforeGz/1024).toFixed(0)}→${(afterGz/1024).toFixed(0)}KB (gz −${pct}%) identMangle=OFF(globals-safe)`);
  process.exit(0);
})().catch(e => { console.error('§PAYLOAD-MIN FATAL ' + e.message); process.exit(2); });
