// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-DXF-HOVER H1 / W-DXF-TRACE T3), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.21 slice 2
// ISSUE: the trace key of a body ('dxf2synth:column') must lead to the ONE source line that built it. That lookup is a parse of the code, never a text search
//        (a key inside a comment or a string is not a stamp). This is the ONE implementation; the index generator and W-DXF-TRACE both use it.
// WHAT:  sites(repoRoot) -> { key: ['modeller/<file>.js:<line>', ...] } for every call trace('<key>', …) / _trace('<key>', …) in modeller/*.js (espree AST). Dev-side only.
// LOG:   none (a library); the callers print §DXF_TRACE_KEY / §DXF_HOVER_INDEX.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

function espree() {
  for (const m of ['espree', path.join(__dirname, '..', '..', 'node_modules', 'espree'), path.join(os.homedir(), 'bim-ootb', 'node_modules', 'espree')]) { try { return require(m); } catch (e) { /* next */ } }
  return null;
}

function sites(repoRoot) {
  const E = espree(); if (!E) throw new Error('trace_sites: espree not resolvable (npm i in bim-ootb)');
  const dir = path.join(repoRoot, 'modeller'), out = {};
  fs.readdirSync(dir).filter(f => /\.js$/.test(f)).sort().forEach(f => {
    let ast; try { ast = E.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { ecmaVersion: 'latest', loc: true }); } catch (e) { return; }
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.arguments.length >= 2 && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' &&
          ((n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'trace') || (n.callee.type === 'Identifier' && n.callee.name === '_trace')))
        (out[n.arguments[0].value] = out[n.arguments[0].value] || []).push('modeller/' + f + ':' + n.loc.start.line);
      for (const k in n) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    })(ast);
  });
  return out;
}

module.exports = { sites };
