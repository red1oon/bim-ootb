// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-ED-NOTSDEP), bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §14
// Find a TypeScript parser for the EDITOR-ONLY tools (gen_global_types.js, witness_global_types.js) without
// installing anything. Owner rule (§13): no TypeScript in the app, no install the air-gapped kernel would need.
// VS Code already ships TypeScript for its own JS help, and these tools only matter to someone using VS Code,
// so its bundled copy is used. Order: $TSLIB · a local `typescript` package · VS Code's bundled copy.
// Returns { ts, from } or null. Never downloads, never writes.
'use strict';
const fs = require('fs');
const path = require('path');

function vscodeCandidates() {
  const rel = ['resources', 'app', 'extensions', 'node_modules', 'typescript', 'lib', 'typescript.js'];
  const roots = [
    '/snap/code/current/usr/share/code', '/usr/share/code', '/usr/lib/code', '/opt/visual-studio-code',
    '/usr/share/code-insiders', '/opt/vscodium', '/usr/share/codium',
  ];
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code'));
  if (process.env.ProgramFiles) roots.push(path.join(process.env.ProgramFiles, 'Microsoft VS Code'));
  try {   // snap keeps numbered revisions; `current` is a symlink but may be missing on some setups
    for (const d of fs.readdirSync('/snap/code').filter(x => /^\d+$/.test(x)).sort((a, b) => b - a)) roots.push('/snap/code/' + d + '/usr/share/code');
  } catch (e) { /* no snap */ }
  const out = roots.map(r => path.join(r, ...rel));
  out.push(path.join('/Applications/Visual Studio Code.app/Contents/Resources/app', ...rel.slice(2)));   // macOS layout
  return out;
}

function findTs() {
  const tries = [];
  if (process.env.TSLIB) tries.push(['TSLIB', process.env.TSLIB]);
  tries.push(['package', 'typescript']);
  for (const c of vscodeCandidates()) tries.push(['vscode', c]);
  for (const [from, p] of tries) {
    if (from === 'vscode' && !fs.existsSync(p)) continue;
    try { const ts = require(p); if (ts && ts.createSourceFile) return { ts, from: from + ':' + p + ' v' + ts.version }; }
    catch (e) { /* next */ }
  }
  return null;
}

module.exports = { findTs };
