// SPDX-License-Identifier: MIT
// X0 Navigator — find a headless browser for the DEV-SIDE memory monitor (§F.31), without installing anything.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.31 BUILD SPEC 1. Pure node, no `vscode` import.
// The scripts/lib/find_ts.js pattern: the extension keeps 0 npm dependencies; it uses a copy that is already on the machine.
// Order: $PLAYWRIGHT (a path to the playwright package) · <root>/tests/node_modules/playwright (tests/package.json installs it
// via @playwright/test) · <root>/node_modules/playwright. Returns { chromium, from } or null. Never downloads, never writes.
'use strict';
const fs = require('fs'), path = require('path');

function candidates(root, opts) {
  opts = opts || {};
  const c = [];
  if (opts.env !== false && process.env.PLAYWRIGHT) c.push(process.env.PLAYWRIGHT);
  if (opts.fallbacks !== false && root) c.push(path.join(root, 'tests', 'node_modules', 'playwright'), path.join(root, 'node_modules', 'playwright'));
  return c;
}

function findBrowser(root, opts) {
  for (const p of candidates(root, opts)) {
    if (!fs.existsSync(p)) continue;
    try { const pw = require(p); if (pw && pw.chromium) return { chromium: pw.chromium, from: p }; } catch (e) { /* try the next one */ }
  }
  return null;
}

module.exports = { findBrowser, candidates };
