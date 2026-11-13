// SPDX-License-Identifier: MIT
// X0 Navigator — §TAG index (X0-2 = DEV_TOOLKIT T4 "Spec hover").
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 X0-2 · bim-ootb prompts/DEV_TOOLKIT_NO_AI.md §5.3 · issue #2920.
//
// Pure node: no `vscode` import, so the witness runs this file directly.
// It answers one question: "what rule is this §TAG, and which code prints it?"
//   spec places = every §TAG in <root>/prompts/*.md and <root>/docs/**/*.md, kept as file:line + nearest heading above
//   printers    = the .js lines of the source root that contain the tag
// This is a text lookup, not a code claim: tags inside strings and comments count on purpose.
'use strict';
const fs = require('fs');
const path = require('path');

const TAG_RE = /§[A-Z][A-Z0-9_]+/g;
const HEADING_RE = /^#{1,6}\s+(.*)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'logs', 'out', 'build']);
const MAX_JS_BYTES = 2 * 1024 * 1024;
const SHOWN = 5;

/** Recursively list files under `dir` whose name passes `keep`. Missing folders give an empty list. */
function walk(dir, keep, recursive, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive && !SKIP_DIRS.has(e.name)) walk(full, keep, recursive, out);
    } else if (e.isFile() && keep(e.name)) out.push(full);
  }
  return out;
}

/** Every tag on one line, with its column. `§TPL_` in `§TPL_*` is a prefix, not a tag, and is kept as written. */
function tagsInLine(text) {
  const hits = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(text))) hits.push({ tag: m[0], start: m.index, end: m.index + m[0].length });
  return hits;
}

/** The tag under a cursor column, or null. */
function tagAt(lineText, character) {
  for (const h of tagsInLine(lineText)) if (character >= h.start && character <= h.end) return h.tag;
  return null;
}

/**
 * Index the spec places of every tag.
 * @param {{name: string, dir: string}[]} roots - repo roots; a root that does not exist is reported in `missing`.
 * @returns {{tags: Map<string, object[]>, files: number, missing: string[]}}
 */
function buildSpecIndex(roots) {
  const tags = new Map();
  const missing = [];
  let files = 0;
  for (const root of roots) {
    if (!root || !root.dir || !fs.existsSync(root.dir)) { missing.push(root ? root.name : '?'); continue; }
    const md = n => n.endsWith('.md');
    const list = walk(path.join(root.dir, 'prompts'), md, false, [])
      .concat(walk(path.join(root.dir, 'docs'), md, true, []));
    for (const file of list) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
      files++;
      if (text.indexOf('§') < 0) continue;
      const rel = path.relative(root.dir, file).split(path.sep).join('/');
      let heading = '';
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const hm = HEADING_RE.exec(lines[i]);
        if (hm) heading = hm[1].trim();
        if (lines[i].indexOf('§') < 0) continue;
        const seen = new Set();
        for (const h of tagsInLine(lines[i])) {
          if (seen.has(h.tag)) continue;
          seen.add(h.tag);
          if (!tags.has(h.tag)) tags.set(h.tag, []);
          tags.get(h.tag).push({ root: root.name, abs: file, file: rel, line: i + 1, heading, inHeading: !!hm });
        }
      }
    }
  }
  // Places where the tag sits in a heading come first; then the order the roots were given, file, line.
  const rootOrder = new Map(roots.map((r, i) => [r && r.name, i]));
  for (const list of tags.values()) {
    list.sort((a, b) => (Number(b.inHeading) - Number(a.inHeading))
      || (rootOrder.get(a.root) - rootOrder.get(b.root))
      || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
      || (a.line - b.line));
  }
  return { tags, files, missing };
}

/** 0 = a log call outside tests, 1 = other code outside tests, 2 = tests. Lower shows first. */
function printerRank(rel, text) {
  if (/(^|\/)tests?\//.test(rel)) return 2;
  return /(console\.\w+|_?log\w*)\s*\(/i.test(text) ? 0 : 1;
}

/**
 * Index the .js lines of the source root that contain a tag.
 * @param {string} sourceRoot - the bim-ootb checkout.
 * @returns {{tags: Map<string, object[]>, files: number}}
 */
function buildPrinterIndex(sourceRoot) {
  const tags = new Map();
  let files = 0;
  const list = walk(sourceRoot, n => n.endsWith('.js') && !n.endsWith('.min.js'), true, []);
  for (const file of list) {
    let text;
    try {
      if (fs.statSync(file).size > MAX_JS_BYTES) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch (e) { continue; }
    files++;
    if (text.indexOf('§') < 0) continue;
    const rel = path.relative(sourceRoot, file).split(path.sep).join('/');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('§') < 0) continue;
      const seen = new Set();
      for (const h of tagsInLine(lines[i])) {
        if (seen.has(h.tag)) continue;
        seen.add(h.tag);
        if (!tags.has(h.tag)) tags.set(h.tag, []);
        tags.get(h.tag).push({ abs: file, file: rel, line: i + 1, rank: printerRank(rel, lines[i]) });
      }
    }
  }
  for (const list2 of tags.values()) {
    list2.sort((a, b) => (a.rank - b.rank) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.line - b.line));
  }
  return { tags, files };
}

/**
 * Look one tag up. `found` is false when there is no spec place: the hover then says "no spec found".
 * `spec` and `printers` are the FULL lists; the hover shows the first SHOWN of each.
 */
function lookup(index, tag) {
  const spec = (index.spec.tags.get(tag) || []).slice();
  const printers = index.printers ? (index.printers.tags.get(tag) || []).slice() : [];
  return { tag, found: spec.length > 0, spec, printers };
}

/**
 * The hover text, as markdown. `link(abs, line)` turns a place into a link target; the default gives none.
 * A tag with no spec place says so. It is never silent.
 */
function formatHover(result, link) {
  const ref = (label, abs, line) => {
    const target = link ? link(abs, line) : null;
    return target ? '[' + label + '](' + target + ')' : '`' + label + '`';
  };
  const out = ['**' + result.tag + '**'];
  if (!result.found) {
    out.push('', 'no spec found');
  } else {
    out.push('');
    for (const p of result.spec.slice(0, SHOWN)) {
      out.push('- ' + ref(p.root + ' ' + p.file + ':' + p.line, p.abs, p.line) + (p.heading ? ' — ' + p.heading : ''));
    }
    if (result.spec.length > SHOWN) out.push('- … ' + (result.spec.length - SHOWN) + ' more spec places');
  }
  if (result.printers.length) {
    out.push('', 'printed by:');
    for (const p of result.printers.slice(0, SHOWN)) out.push('- ' + ref(p.file + ':' + p.line, p.abs, p.line));
    if (result.printers.length > SHOWN) out.push('- … ' + (result.printers.length - SHOWN) + ' more lines');
  }
  return out.join('\n');
}

/** Build both indexes. `roots[0]` is the source root (bim-ootb); the others are spec-only (bim-compiler). */
function buildIndex(roots) {
  return { spec: buildSpecIndex(roots), printers: buildPrinterIndex(roots[0].dir) };
}

module.exports = { TAG_RE, SHOWN, tagsInLine, tagAt, printerRank, buildSpecIndex, buildPrinterIndex, buildIndex, lookup, formatHover };
