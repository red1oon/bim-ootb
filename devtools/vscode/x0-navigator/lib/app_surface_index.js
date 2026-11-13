// SPDX-License-Identifier: MIT
// X0 Navigator — APP field index (X0-1: go-to-definition + hover for `APP.x` / `A.x` / `app.x`).
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 X0-1 · issue #2920.
//
// Pure node: no `vscode` import, so the witness runs this file directly.
// The only source of truth is the GENERATED internal/APP_SURFACE.md (scripts/gen_app_surface.js). This module
// knows the two table headers and nothing about the codebase. It never guesses:
//   field in the index        → its `written at` place, checked against the real line first (stale guard)
//   phantom (read, never set) → a hover that says so, and no definition
//   field not in the index    → nothing at all
'use strict';
const fs = require('fs');
const path = require('path');

// The same gates as scripts/gen_app_surface.js R5/R6: bare `A.` / `app.` is the god object ONLY in a file that
// binds it. Copied verbatim; the witness compares these two against the generator's source, so a drift FAILs.
const BINDS_A = /function\s+setup\w*\s*\(\s*A\s*[,)]|\(\s*A\s*\)\s*(?:=>|\{)|\bA\s*=\s*window\.APP\b/;
const BINDS_app = /function\s+\w*\s*\(\s*app\s*[,)]|\bapp\s*=\s*window\.APP\b|\bvar\s+app\s*=\s*(?:window\.)?APP\b/;

const cells = row => row.split('|').slice(1, -1).map(c => c.trim());
const isRow = l => /^\|.*\|\s*$/.test(l);
const SITE_RE = /`([^`]+):(\d+)`/;

/** Rows of the table whose header cells equal `header`. Found by header text, never by line number. */
function tableRows(lines, header) {
  const want = header.join('|');
  for (let i = 0; i < lines.length; i++) {
    if (!isRow(lines[i]) || cells(lines[i]).join('|') !== want) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && isRow(lines[j]); j++) rows.push(cells(lines[j]));
    return rows;
  }
  return null;
}

/**
 * Parse APP_SURFACE.md.
 * @returns {{fields: Map<string, object>, rows: number, phantoms: number, tablesFound: number}}
 *   each field: { name, phantom, file, line, as, writes, reads, firstRead: {file, line} | null }
 */
function parseSurface(text) {
  const lines = text.split('\n');
  const all = tableRows(lines, ['field', 'written at', 'writes', 'reads']);
  const ph = tableRows(lines, ['field', 'first read site', 'prod?']);
  const fields = new Map();
  const nameOf = c => { const m = /^`APP\.([A-Za-z_$][\w$]*)`$/.exec(c); return m ? m[1] : null; };
  for (const r of all || []) {
    const name = nameOf(r[0]);
    if (!name) continue;
    const site = SITE_RE.exec(r[1]);
    const as = /\(as `(A|app)\.`\)/.exec(r[1]);
    fields.set(name, {
      name, phantom: !site, file: site ? site[1] : null, line: site ? Number(site[2]) : null,
      as: as ? as[1] : 'APP', writes: Number(r[2]), reads: Number(r[3]), firstRead: null
    });
  }
  let phantoms = 0;
  for (const r of ph || []) {
    const name = nameOf(r[0]);
    const site = SITE_RE.exec(r[1] || '');
    if (!name || !site) continue;
    phantoms++;
    const f = fields.get(name) || { name, phantom: true, file: null, line: null, as: 'APP', writes: 0, reads: 0, firstRead: null };
    f.firstRead = { file: site[1], line: Number(site[2]) };
    fields.set(name, f);
  }
  return { fields, rows: (all || []).length, phantoms, tablesFound: (all ? 1 : 0) + (ph ? 1 : 0) };
}

/** Load the index from a bim-ootb root. Returns null when the generated file is not there. */
function loadSurface(root) {
  const file = path.join(root, 'internal', 'APP_SURFACE.md');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const index = parseSurface(text);
  index.root = root;
  index.file = file;
  return index;
}

/**
 * The APP field under the cursor, or null. The word must be the property of a member expression whose object is
 * `APP` (also `window.APP`), or `A` / `app` in a document that binds that name (R5/R6).
 * @returns {{field: string, start: number, end: number, spelling: string} | null}
 */
function fieldAt(lineText, character, docText) {
  const re = /(?<![\w$.])(?:window\.)?(APP|A|app)\s*\.\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(lineText))) {
    const end = m.index + m[0].length;
    const start = end - m[2].length;
    if (character < start || character > end) continue;
    if (m[1] === 'A' && !BINDS_A.test(docText || '')) return null;
    if (m[1] === 'app' && !BINDS_app.test(docText || '')) return null;
    return { field: m[2], start, end, spelling: m[1] };
  }
  return null;
}

/** Does this source line mention `.field` as a whole name? */
function lineHasField(lineText, field) {
  return typeof lineText === 'string' && new RegExp('\\.' + field.replace(/\$/g, '\\$') + '(?![\\w$])').test(lineText);
}

function readLine(root, file, line) {
  try { return fs.readFileSync(path.join(root, file), 'utf8').split('\n')[line - 1]; } catch (e) { return undefined; }
}

/**
 * Resolve a field name.
 * @returns {null | {kind: 'definition'|'stale'|'phantom', field, file, line, abs, column, writes, reads, firstRead}}
 *   `definition` is the only kind that may be jumped to. `stale` = the index points at a line that no longer
 *   mentions the field: a wrong jump is worse than none.
 */
function resolve(index, field, read) {
  const f = index && index.fields.get(field);
  if (!f) return null;
  const base = { field, writes: f.writes, reads: f.reads, firstRead: f.firstRead, file: f.file, line: f.line, as: f.as };
  if (f.phantom) return Object.assign(base, { kind: 'phantom' });
  const text = (read || readLine)(index.root, f.file, f.line);
  if (!lineHasField(text, field)) return Object.assign(base, { kind: 'stale' });
  const column = text.search(new RegExp('\\.' + field.replace(/\$/g, '\\$') + '(?![\\w$])')) + 1;
  return Object.assign(base, { kind: 'definition', abs: path.join(index.root, f.file), column });
}

/** The hover text (markdown). `link(abs, line)` turns a place into a link target; the default gives none. */
function formatHover(res, link) {
  if (!res) return null;
  const head = '**APP.' + res.field + '**';
  if (res.kind === 'phantom') {
    const fr = res.firstRead;
    return head + '\n\nPHANTOM — read, never written' + (fr ? ' (first read `' + fr.file + ':' + fr.line + '`)' : '');
  }
  if (res.kind === 'stale') return head + '\n\nindex stale — run "Regenerate editor indexes"';
  const label = res.file + ':' + res.line;
  const target = link ? link(res.abs, res.line) : null;
  return head + '\n\nwritten at ' + (target ? '[' + label + '](' + target + ')' : '`' + label + '`')
    + ' · ' + res.writes + ' writes · ' + res.reads + ' reads';
}

module.exports = { BINDS_A, BINDS_app, parseSurface, loadSurface, fieldAt, lineHasField, resolve, formatHover };
