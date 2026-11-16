// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-X0-CATALOG), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.28 (decision F-19), bim-ootb #3101.
// The message catalog and the door verbs, for the editor: hover a message key (M('key', …) / .t('key', …)) to see its text and how
// many {n} values it takes, hover a verb name ('mis.lookup') to see its title, harm and inputs; F12 jumps to the JSON line; a catalog
// user gets warnings for an unknown key, a wrong argument count or a computed key. Dev-side only: nothing here reaches a page.
// ONE scanner: the open folder's own common/door/msg_keys.js (the message lane's, also read by W-MSG-CATALOG M3), never a copy.
// A "catalog user" is a file that references msg_core/MsgCore in its CODE (comments blanked by the repo's one tokenizer, scripts/lib/js_scan.js,
// lengths kept), outside tests/, not msg_keys.js itself: the call pattern also matches another `.t(` API in erp/processes (12 false
// findings measured 2026-11-16), the witness's deliberate bad fixtures, and a comment that spells M('key') (this file's own header).
// The three paths are named here once, until Part B's manifest declares them (ADVICE D). Pure node, no `vscode` import.
'use strict';
const fs = require('fs');
const path = require('path');

const PATHS = { messages: 'common/door/vocab/messages.json', verbs: 'common/door/verbs.json', keys: 'common/door/msg_keys.js', tokenizer: 'scripts/lib/js_scan.js' };
const FILE_KINDS = ['unknown-key', 'arg-count', 'computed-key'];   // unused-key and template are catalog-wide: W-MSG-CATALOG owns them
const VERB_LIT = /(['"])([a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*)\1/g;

const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return null; } };
const lineOf = (lines, re) => { for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1; return 0; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A loader for one bim-ootb root; it re-reads a file only when its mtime changes. */
function create(root) {
  const abs = { messages: path.join(root, PATHS.messages), verbs: path.join(root, PATHS.verbs), keys: path.join(root, PATHS.keys) };
  let key = '', state = null;
  return function load() {
    const k = [abs.messages, abs.verbs, abs.keys, path.join(root, PATHS.tokenizer)].map(mtime).join('|');
    if (state && k === key) return state;
    key = k;
    const why = [];
    let K = null, catalog = null, keyLine = new Map(), verbs = new Map();
    let J = null;
    try { const t = path.join(root, PATHS.tokenizer); delete require.cache[require.resolve(t)]; J = require(t); } catch (e) { why.push('no ' + PATHS.tokenizer + ' (comments are not blanked)'); }
    if (mtime(abs.keys) === null) why.push('no ' + PATHS.keys);
    else { try { delete require.cache[require.resolve(abs.keys)]; K = require(abs.keys); } catch (e) { why.push(PATHS.keys + ': ' + e.message); } }
    try {
      const text = fs.readFileSync(abs.messages, 'utf8'), lines = text.split('\n');
      catalog = JSON.parse(text);
      for (const name of Object.keys((catalog && catalog.messages) || {})) keyLine.set(name, lineOf(lines, new RegExp('^\\s*"' + esc(name) + '"\\s*:')));
    } catch (e) { why.push(PATHS.messages + ': ' + (e.code === 'ENOENT' ? 'missing' : e.message)); catalog = null; }
    try {
      const text = fs.readFileSync(abs.verbs, 'utf8'), lines = text.split('\n');
      for (const v of (JSON.parse(text).verbs || [])) if (v && v.verb) verbs.set(v.verb, { entry: v, line: lineOf(lines, new RegExp('"verb"\\s*:\\s*"' + esc(v.verb) + '"')) });
    } catch (e) { why.push(PATHS.verbs + ': ' + (e.code === 'ENOENT' ? 'missing' : e.message)); }
    state = { root, K, J, catalog, keyLine, verbs, why, abs };
    return state;
  };
}

/** The file's code with comments blanked (same length and lines), by the repo's one tokenizer; the text itself if there is none. */
function codeOf(st, text) { try { return st && st.J ? st.J.scan(text).code : text; } catch (e) { return text; } }

/** Does this file use the message catalog? `code` = comments blanked (see the header for why the rule is this narrow). */
function isCatalogUser(rel, code) {
  return !rel.split('/').includes('tests') && path.posix.basename(rel) !== 'msg_keys.js' && /msg_core|MsgCore/.test(code);
}

/** The key use under the cursor (line 1-based, ch 0-based), or null. Only in a catalog user. */
function keyAt(st, text, rel, line, ch) {
  if (!st || !st.K) return null;
  const code = codeOf(st, text);
  if (!isCatalogUser(rel, code)) return null;
  const lineText = text.split('\n')[line - 1] || '';
  for (const u of st.K.scan(code, rel)) {
    if (u.line !== line || u.key === null) continue;
    const from = u.col - 1, q = Math.max(lineText.indexOf("'" + u.key + "'", from), lineText.indexOf('"' + u.key + '"', from));
    const end = q < 0 ? from + 2 : q + u.key.length + 2;
    if (ch >= from && ch <= end) return { use: u, key: u.key, start: q < 0 ? from : q + 1, end: end - 1 };
  }
  return null;
}

/** The door verb named by a string literal under the cursor, or null. */
function verbAt(st, lineText, ch) {
  if (!st || !st.verbs.size) return null;
  VERB_LIT.lastIndex = 0;
  let m;
  while ((m = VERB_LIT.exec(lineText))) {
    if (ch < m.index || ch > m.index + m[0].length) continue;
    const v = st.verbs.get(m[2]);
    if (v) return { name: m[2], entry: v.entry, line: v.line, start: m.index + 1, end: m.index + m[0].length - 1 };
  }
  return null;
}

/** Where F12 goes: { abs, line } in messages.json or verbs.json, or null (an unknown key has no line: never a guess). */
function definition(st, hit) {
  if (!hit) return null;
  if (hit.key !== undefined) { const l = st.keyLine.get(hit.key); return l ? { abs: st.abs.messages, line: l } : null; }
  return hit.line ? { abs: st.abs.verbs, line: hit.line } : null;
}

function quote(s) { return '«' + String(s).replace(/\n/g, ' ⏎ ') + '»'; }

/** Hover markdown for a key hit. `link(abs, line)` makes the editor link. */
function formatKey(st, hit, link) {
  const e = st.catalog && st.catalog.messages && st.catalog.messages[hit.key];
  if (!e || typeof e.en !== 'string') return '**`' + hit.key + '`** · message key · **not in the catalog**: msg_core throws here when this line runs';
  const sh = st.K.shape(e.en), l = st.keyLine.get(hit.key);
  const out = ['**`' + hit.key + '`** · message key · takes ' + sh.takes + ' value' + (sh.takes === 1 ? '' : 's') +
    (hit.use.args !== sh.takes ? ' · **this call passes ' + hit.use.args + '**' : ''), '', 'en: ' + quote(e.en)];
  for (const f of Object.keys(e)) if (f !== 'en') out.push('', f + ': ' + (typeof e[f] === 'string' ? quote(e[f]) : '`' + JSON.stringify(e[f]) + '`'));
  if (l) out.push('', '[' + PATHS.messages + ':' + l + '](' + link(st.abs.messages, l) + ')');
  return out.join('\n');
}

/** Hover markdown for a verb hit. */
function formatVerb(st, hit, link) {
  const v = hit.entry, inputs = (v.inputs || []).map(i => '`' + i.name + '`' + (i.required ? '' : '?'));
  return ['**`' + hit.name + '`** · door verb · ' + (v.title || '') + (v.harm ? ' · harm: ' + v.harm : ''),
    '', (v.description || '').slice(0, 400), '', 'inputs: ' + (inputs.length ? inputs.join(', ') : 'none'),
    '', '[' + PATHS.verbs + ':' + hit.line + '](' + link(st.abs.verbs, hit.line) + ')'].join('\n');
}

/** Warnings for one file: msg_keys.check, the per-file kinds only, catalog users only. */
function findings(st, text, rel) {
  if (!st || !st.K || !st.catalog) return [];
  const code = codeOf(st, text);
  if (!isCatalogUser(rel, code)) return [];
  return st.K.check(st.catalog, st.K.scan(code, rel), {}).filter(f => FILE_KINDS.includes(f.kind));
}

module.exports = { PATHS, FILE_KINDS, create, codeOf, isCatalogUser, keyAt, verbAt, definition, formatKey, formatVerb, findings };
