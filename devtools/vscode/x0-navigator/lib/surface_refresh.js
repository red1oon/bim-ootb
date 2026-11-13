// SPDX-License-Identifier: MIT
// X0 Navigator — keep a fresh copy of the APP field index, outside the repo.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.5 (decision F-10) · issue #2924.
//
// Pure node: no `vscode` import, so the witness runs this file directly.
// Why: the committed internal/APP_SURFACE.md goes stale with most merges (26 of 39, measured 2026-11-13), and
// committing a fresh one in every PR would make it a conflict magnet. So X0 runs the repo's OWN generator
// (scripts/gen_app_surface.js, through its existing APPSURF_ROOT / APPSURF_OUT) into a private folder.
// This module holds no knowledge of the index format, and never writes inside the repo.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const GENERATOR = path.join('scripts', 'gen_app_surface.js');
const OUT_NAME = 'APP_SURFACE.md';
const SITES_NAME = 'APP_SITES.json';   // every write and read site, for Find All References (lib/app_refs.js)

/** One generator run. Resolves { file, ms, line }; rejects when the generator is missing or fails. */
function runOnce(root, outDir) {
  return new Promise((resolve, reject) => {
    const script = path.join(root, GENERATOR);
    if (!fs.existsSync(script)) { reject(new Error('generator not found: ' + GENERATOR)); return; }
    const t0 = Date.now();
    // ELECTRON_RUN_AS_NODE: inside VS Code, process.execPath is the editor itself; this makes it behave as node.
    const env = Object.assign({}, process.env, { APPSURF_ROOT: root, APPSURF_OUT: outDir, APPSURF_SITES: '1', ELECTRON_RUN_AS_NODE: '1' });
    cp.execFile(process.execPath, [script], { env, cwd: root, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const file = path.join(outDir, OUT_NAME);
      if (err) { reject(err); return; }
      if (!fs.existsSync(file)) { reject(new Error('generator wrote no ' + OUT_NAME)); return; }
      const line = String(stdout).split('\n').find(l => l.startsWith('§APP_SURFACE')) || '';
      resolve({ file, ms: Date.now() - t0, line });
    });
  });
}

/**
 * A refresher for one (root, outDir). `refresh()` returns a promise for a run that STARTED after the call, so
 * its result includes whatever was saved before the call. Calls made while a run is in flight share ONE
 * follow-up run: never a pile of generators.
 * @returns {{refresh: () => Promise<{file: string, ms: number, line: string}>, runs: () => number}}
 */
function createRefresher(root, outDir) {
  let running = null, queued = null, runs = 0;
  const start = () => { runs++; return runOnce(root, outDir); };
  function refresh() {
    if (!running) {
      running = start();
      const done = () => { running = null; };
      running.then(done, done);
      return running;
    }
    if (!queued) {
      const after = () => { queued = null; return refresh(); };
      queued = running.then(after, after);
    }
    return queued;
  }
  return { refresh, runs: () => runs };
}

module.exports = { GENERATOR, OUT_NAME, SITES_NAME, runOnce, createRefresher };
