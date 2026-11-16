// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-X0-NEWWIT), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.26, bim-ootb #3096.
// "New witness for this file": the ONE witness skeleton (the `witness` body in .vscode/witness.code-snippets), expanded for a
// file and pre-filled with FACTS only: the spec its own header cites, the § tags it prints (spec + last value), the APP fields
// it writes, all taken from file_context.build(...).facts. It never guesses a test from the file's functions: the claim, the
// population and the red control stay the snippet's placeholder words, so the new witness FAILs (empty population) until a
// person fills them. It never overwrites a file (_2, _3, … instead) and refuses a file under tests/ or a non-.js file.
// Pure node, no `vscode` import.
'use strict';
const fs = require('fs');
const path = require('path');
const { headerOf } = require('./file_context');

const SNIPPETS = path.join('.vscode', 'witness.code-snippets');
const CITE = /\b(?:(?:bim-ootb|bim-compiler)\s+)?prompts\/[\w./-]+\.md(?:\s*§\s*[\w.:-]+)?/;

/** The `witness` snippet body (JSON with leading // comment lines). */
function template(root) {
  const raw = fs.readFileSync(path.join(root, SNIPPETS), 'utf8');
  const json = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const all = JSON.parse(json);
  const s = Object.values(all).find(x => x && x.prefix === 'witness');
  if (!s) throw new Error('no `witness` snippet in ' + SNIPPETS);
  return s.body;
}

/** The first spec citation in the file's own header, or null. */
function specOf(text) {
  for (const l of headerOf(text).lines) { const m = l.match(CITE); if (m) return m[0].replace(/\s+/g, ' '); }
  return null;
}

/** Expand ${n:default}, ${n}, ${RELATIVE_FILEPATH} and $0 in the snippet body; values[n] replaces placeholder n. */
function expand(body, values, relPath) {
  return body.map(line => line
    .replace(/\$\{RELATIVE_FILEPATH\}/g, relPath)
    .replace(/\$\{(\d+):([^}]*)\}/g, (all, n, def) => (values[n] != null ? values[n] : def))
    .replace(/\$\{(\d+)\}/g, (all, n) => (values[n] != null ? values[n] : ''))
    .replace(/\$0/g, '')).join('\n').replace(/\n+$/, '') + '\n';
}

/** Where the new witness goes: <first folder>/tests/witness_<base>.js, or _2, _3 … if taken. */
function targetFor(root, rel) {
  const parts = rel.split('/'), base = path.basename(rel, '.js');
  const dir = parts.length > 1 ? parts[0] + '/tests' : 'tests';
  for (let i = 1; i < 1000; i++) {
    const r = dir + '/witness_' + base + (i === 1 ? '' : '_' + i) + '.js';
    if (!fs.existsSync(path.join(root, r))) return r;
  }
  return null;
}

/**
 * @param root  the bim-ootb root   @param rel  the file, relative, '/'-separated
 * @param facts file_context.build(root, rel, deps).facts (tagInfo, fields)
 * @returns {{path, text, spec, tags}} or {{refused}}
 */
function make(root, rel, facts) {
  if (!/\.js$/.test(rel)) return { refused: rel + ' is not a .js file' };
  if (rel.split('/').includes('tests')) return { refused: rel + ' is already under a tests/ folder' };
  let text;
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return { refused: rel + ': no such file in this checkout' }; }
  const out = targetFor(root, rel);
  if (!out) return { refused: 'no free witness_' + path.basename(rel, '.js') + '_N.js name' };
  const spec = specOf(text);
  const name = path.basename(rel, '.js').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const contract = path.relative(path.dirname(path.join(root, out)), path.join(root, 'witness_kit', 'contract')).split(path.sep).join('/');
  const tags = (facts && facts.tagInfo) || [];
  const fields = (facts && facts.fields) || null;
  const body = expand(template(root), {
    1: name,
    2: spec || 'NO SPEC in ' + rel + "'s header: write it first (Spec-First)",
    6: contract.startsWith('.') ? contract : './' + contract,
    7: path.basename(rel, '.js')
  }, out);
  const F = ['// FACTS FROM X0 about ' + rel + ' (from its own header and the repo indexes; places to look, not tests):'];
  F.push('//   spec cited in its header: ' + (spec || 'none'));
  if (!tags.length) F.push('//   § tags it prints: none (a witness of this file has no § line to read yet; add one with the `slog` snippet)');
  else { F.push('//   § tags it prints (' + tags.length + ' line' + (tags.length === 1 ? '' : 's') + '):'); tags.forEach(t => F.push('//     ' + t.tag + '  line ' + t.line + ' · spec: ' + t.spec + ' · last: ' + t.last)); }
  F.push('//   APP fields it writes: ' + (fields === null ? 'INCONCLUSIVE (no APP field index)' : fields.length ? fields.map(f => 'APP.' + f).join(', ') : 'none'));
  F.push('//   which witnesses already prove this file: not indexed yet (Part E)');
  // the facts go right after the header comment, before 'use strict'
  const lines = body.split('\n'), at = lines.findIndex(l => l.startsWith("'use strict'"));
  lines.splice(at < 0 ? 1 : at, 0, ...F);
  return { path: out, text: lines.join('\n'), spec, tags: tags.map(t => t.tag) };
}

module.exports = { make, specOf, template, expand, targetFor };
