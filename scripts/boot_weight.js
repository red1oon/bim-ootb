#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md §P3 SPEC 4 (W-BOOT-WEIGHT). Read the output line, not the exit code alone.
// ISSUE: viewer boot JS grew 6.8x in six months (1.51 -> 10.24 MB, MOBILE_PERF §2026-11-26 REVIEW A) with nothing to stop it.
// WHAT:  sums the bytes of every <script src> viewer/viewer.html loads at boot (whatever folder: common/, erp/, modeller/ are counted —
//        the scope-blind guard), plus the modules.json lazy tier for context. One line: §BOOT_WEIGHT eager_bytes= tags= lazy_bytes=.
// USE:   node scripts/boot_weight.js            (print)
//        node scripts/boot_weight.js --check    (ratchet: exit 1 when eager bytes exceed scripts/boot_weight_baseline.json by > 1 %;
//                                                 prints LOWER-THE-BASELINE when they dropped by > 1 %, so the gain is locked in)
//        node scripts/boot_weight.js --write    (rewrite the baseline to today's numbers — only with a reason in the commit)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PAGE = path.join(ROOT, 'viewer', 'viewer.html'), BASE = path.join(__dirname, 'boot_weight_baseline.json');
function measure() {
  const html = fs.readFileSync(PAGE, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]).filter(s => !/^(https?:)?\/\//.test(s));
  let eager = 0; const missing = [], files = [];
  for (const s of srcs) { const f = path.normalize(path.join(path.dirname(PAGE), s.split('?')[0]));
    if (fs.existsSync(f)) { const b = fs.statSync(f).size; eager += b; files.push([path.relative(ROOT, f), b]); } else missing.push(s); }
  let lazy = 0; try { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'modules.json'), 'utf8'));
    for (const [f, v] of Object.entries(m.modules || {})) if (v.load === 'lazy' && fs.existsSync(path.join(ROOT, f))) lazy += fs.statSync(path.join(ROOT, f)).size; } catch (e) {}
  return { eager, tags: srcs.length, lazy, missing, top: files.sort((a, b) => b[1] - a[1]).slice(0, 10) };
}
const r = measure(), arg = process.argv[2];
console.log('§BOOT_WEIGHT eager_bytes=' + r.eager + ' eager_MB=' + (r.eager / 1048576).toFixed(2) + ' tags=' + r.tags + ' lazy_bytes=' + r.lazy + ' missing=' + r.missing.length);
console.log('§BOOT_WEIGHT_TOP ' + r.top.map(([f, b]) => f + '=' + Math.round(b / 1024) + 'KB').join(' '));
if (r.missing.length) console.log('§BOOT_WEIGHT_MISSING ' + r.missing.join(' '));
if (r.tags === 0) { console.log('§BOOT_WEIGHT_VERDICT INCONCLUSIVE no script tags found in ' + path.relative(ROOT, PAGE)); process.exit(1); }
if (arg === '--write') { fs.writeFileSync(BASE, JSON.stringify({ eager_bytes: r.eager, tags: r.tags, measured: new Date().toISOString().slice(0, 10) }, null, 2) + '\n'); console.log('§BOOT_WEIGHT_VERDICT WROTE baseline'); process.exit(0); }
if (arg === '--check') {
  const b = JSON.parse(fs.readFileSync(BASE, 'utf8')), d = (r.eager - b.eager_bytes) / b.eager_bytes;
  if (d > 0.01) { console.log('§BOOT_WEIGHT_VERDICT FAIL eager +' + (d * 100).toFixed(1) + '% over baseline ' + b.eager_bytes + ' — make the new code lazy, or raise the baseline (--write) with a reason'); process.exit(1); }
  console.log('§BOOT_WEIGHT_VERDICT ' + (d < -0.01 ? 'PASS LOWER-THE-BASELINE (eager ' + (d * 100).toFixed(1) + '%, run --write to lock the gain in)' : 'PASS within 1% of baseline ' + b.eager_bytes));
}
