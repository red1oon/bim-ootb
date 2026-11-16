// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-X0-STAMP), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.25, bim-ootb #3091.
// Does the installed X0 Navigator match the source in the open folder? package.json says 0.1.0 for every build, so the
// version cannot tell. pack.js writes extension/built.json = { sourceHash } (a hash of the packed files, so the same input
// still gives the same .vsix bytes), and activate() compares it with devtools/vscode/x0-navigator of the open folder.
// listFiles is the ONE packing rule (pack.js uses it): no tests/, node_modules/ or dot-folders.
// compare() never says 'same' when it could not compare: no stamp, or no source folder, is 'unknown' with a reason.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STAMP = 'built.json';
const SOURCE = path.join('devtools', 'vscode', 'x0-navigator');

/** Every file pack.js puts into the .vsix, relative to `dir`, sorted. */
function listFiles(dir, base, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== 'tests' && e.name !== 'node_modules' && !e.name.startsWith('.')) listFiles(path.join(dir, e.name), rel, out); } else if (e.isFile()) out.push(rel);
  }
  return out;
}

/** sha-256 over each packed file's relative path and bytes, in listFiles order; built.json itself is left out. */
function sourceHash(dir) {
  const h = crypto.createHash('sha256');
  for (const rel of listFiles(dir, '', [])) {
    if (rel === STAMP) continue;
    h.update(rel + '\0'); h.update(fs.readFileSync(path.join(dir, rel))); h.update('\0');
  }
  return h.digest('hex');
}

/** The installed copy (extensionPath) against the source of the open folder (sourceRoot = the bim-ootb root, or null). */
function compare(extensionPath, sourceRoot) {
  let built = null;
  try { built = JSON.parse(fs.readFileSync(path.join(extensionPath, STAMP), 'utf8')).sourceHash || null; } catch (e) { built = null; }
  if (!built) return { state: 'unknown', built: null, source: null, reason: 'no ' + STAMP + ' (running from source, or packed before §F.25)' };
  const src = sourceRoot ? path.join(sourceRoot, SOURCE) : null;
  if (!src || !fs.existsSync(path.join(src, 'package.json'))) return { state: 'unknown', built, source: null, reason: 'no ' + SOURCE + ' in the open folder' };
  const source = sourceHash(src);
  return { state: source === built ? 'same' : 'stale', built, source, reason: '' };
}

module.exports = { listFiles, sourceHash, compare, STAMP, SOURCE };
