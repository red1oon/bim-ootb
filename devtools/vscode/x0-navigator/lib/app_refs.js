// SPDX-License-Identifier: MIT
// X0 Navigator — every place a field of the shared object is written or read ("Find All References").
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.19 · issue #2983.
// Pure node, no `vscode` import. The sites come from the repo's OWN generator (scripts/gen_app_surface.js, R12), written
// beside X0's private fresh copy of the index: this module holds no rule of its own about what counts as a reference.
// It never guesses: a site whose line no longer mentions the field is dropped and counted, not shown.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./app_surface_index');

const SITES_NAME = 'APP_SITES.json';
let cache = { file: '', mtime: 0, data: null };

/** The sites file that belongs to an index file (same folder), parsed; null when there is none (the committed snapshot has none). */
function loadSites(indexFile) {
  if (!indexFile) return null;
  const file = path.join(path.dirname(indexFile), SITES_NAME);
  let st; try { st = fs.statSync(file); } catch (e) { return null; }
  if (cache.file !== file || cache.mtime !== st.mtimeMs) {
    try { cache = { file, mtime: st.mtimeMs, data: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return null; }
  }
  return cache.data && cache.data.fields ? cache.data : null;
}

/**
 * @param {string} root - the bim-ootb checkout (lines are checked against its files)
 * @param {object|null} sites - loadSites() result
 * @param {string} field
 * @returns {{known: boolean, writes: object[], reads: object[], dropped: number}} each site { file, abs, line, column, as? };
 *   reads excludes the write lines. known=false: no sites file, or the field is not in it.
 */
function references(root, sites, field) {
  const f = sites && Object.prototype.hasOwnProperty.call(sites.fields, field) ? sites.fields[field] : null;
  if (!f) return { known: false, writes: [], reads: [], dropped: 0 };
  const lines = new Map();
  const lineOf = (rel, n) => {
    if (!lines.has(rel)) { let t = null; try { t = fs.readFileSync(path.join(root, rel), 'utf8').split('\n'); } catch (e) { t = null; } lines.set(rel, t); }
    const t = lines.get(rel); return t ? t[n - 1] || '' : '';
  };
  const re = new RegExp('\\.' + field.replace(/\$/g, '\\$') + '(?![\\w$])');
  let dropped = 0; const seen = new Set();
  const make = (rel, line, as) => {
    const key = rel + ':' + line;
    if (seen.has(key)) return null;
    const text = lineOf(rel, line);
    if (!S.lineHasField(text, field)) { dropped++; seen.add(key); return null; }
    seen.add(key);
    return { file: rel, abs: path.join(root, rel), line, column: text.search(re) + 1, as };
  };
  const writes = f.w.map(x => make(x[0], x[1], x[2])).filter(Boolean);
  const reads = f.r.map(x => make(x[0], x[1])).filter(Boolean);
  return { known: true, writes, reads, dropped };
}

module.exports = { SITES_NAME, loadSites, references };
