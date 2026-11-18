// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.39 (bim-ootb #3297). Witness: scripts/tests/witness_setup.js (W-SETUP T1/T2).
// The ONE answer to "which files does this tree have": `git ls-files` when the folder IS a git working tree, else a walk of the folder
// (a GitHub ZIP has no .git; the walk skips node_modules, .git, dist, .setup). Before this, gen_manifest.js, gen_proof_map.js and bump.js each
// asked git directly and a ZIP download failed with "not a git repository". A folder that merely sits INSIDE another repository is not a git tree:
// git would list the parent's files, so the toplevel must equal the folder itself.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SKIP = new Set(['node_modules', '.git', 'dist', '.setup']);

function isGitTree(root) {
  try {
    const top = cp.execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return fs.realpathSync(top) === fs.realpathSync(root);
  } catch (e) { return false; }
}

/** @param {string} root @param {string} [prefix] only files under this folder (e.g. 'modeller/'). @returns {string[]} root-relative paths with '/'. */
function trackedFiles(root, prefix) {
  const pre = prefix ? prefix.replace(/\/*$/, '/') : '';
  if (isGitTree(root)) return cp.execFileSync('git', ['ls-files', pre || '.'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
  const out = [];
  (function walk(d) {
    let names; try { names = fs.readdirSync(path.join(root, d)); } catch (e) { return; }
    for (const n of names.sort()) {
      if (SKIP.has(n)) continue;
      const r = d ? d + '/' + n : n; let st; try { st = fs.statSync(path.join(root, r)); } catch (e) { continue; }
      if (st.isDirectory()) walk(r); else out.push(r);
    }
  })(pre.replace(/\/$/, ''));
  return out;
}
module.exports = { trackedFiles, isGitTree };
