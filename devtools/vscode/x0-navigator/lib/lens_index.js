// SPDX-License-Identifier: MIT
// X0 Navigator — "values beside the code", first version (the §-Lens).
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12b (and §F.6, why it is this strict) · issue #2945.
// Pure node, no `vscode` import.
//
// For a line of code that prints a §TAG, show the LAST line of a saved log that carries that tag. A value is shown only
// when it can be PROVEN to come from this code:
//   1. the log's first line is a §LOG_STAMP with a commit (scripts/log_stamp.js);
//   2. the printing file is not listed in the stamp's dirty files, and the stamp does list them (dirty ≤ 10);
//   3. the printing file is unchanged between that commit and the working tree (`git diff --quiet <commit> -- <file>`).
// Anything else shows nothing. A value that may be stale, beside current code, is worse than no value.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const T = require('./tag_index');

/** `§LOG_STAMP commit=… dirty=… … [dirty_files=a,b]` → { commit, dirty, dirtyFiles, at } or null. */
function parseStamp(line) {
  if (typeof line !== 'string' || !line.startsWith('§LOG_STAMP ')) return null;
  const f = k => { const m = new RegExp('(?:^| )' + k + '=(\\S+)').exec(line); return m ? m[1] : null; };
  const commit = f('commit');
  if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) return null;
  const dirty = /^\d+$/.test(f('dirty') || '') ? Number(f('dirty')) : null;
  const df = f('dirty_files');
  return { commit, dirty, dirtyFiles: df ? df.split(',') : [], at: f('at') || '' };
}

const STAMP_LINES = 20;          // a stamp must be within the first lines: a wrapper script may write a few lines before it
const MAX_DEPTH = 5;             // folders below a log root that are still read
const MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_EXTRA = ['~/.cache/bim4d'];   // where bake and browser logs are kept (§F.15 step 1)

/** `~` and `~/x` → the home folder. Anything else is returned as given. */
function expandHome(p) {
  if (p === '~') return os.homedir();
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}
/** The log roots for a checkout: its own `logs/`, then the extra folders (read-only, outside the repo). */
function logDirs(root, extra) {
  return [path.join(root, 'logs')].concat((extra || []).filter(Boolean).map(d => path.resolve(root, expandHome(String(d)))));
}
/** The stamp among the first lines, wherever it starts on its line (a bake log puts a timestamp before it), or null. */
function findStamp(lines) {
  for (let i = 0; i < Math.min(lines.length, STAMP_LINES); i++) {
    const k = lines[i].indexOf('§LOG_STAMP ');
    if (k < 0) continue;
    const stamp = parseStamp(lines[i].slice(k));
    if (stamp) return { stamp, index: i };
  }
  return null;
}
function listLogs(dir, depth, out, skipped) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth >= MAX_DEPTH) skipped.deep++; else listLogs(full, depth + 1, out, skipped); }
    else if (e.isFile() && e.name.endsWith('.log')) out.push(full);
  }
  return out;
}

/**
 * Read every `*.log` under the given folder(s), sub-folders included. Stamped logs come back with their tags; unstamped
 * ones are only counted. A log is stamped only by a `§LOG_STAMP` line (scripts/log_stamp.js): any other line that names a
 * commit (a bake's `§CLI_BAKE_ENV`) records no dirty count, so nothing could be proven from it.
 * @param {string|string[]} dirs - one folder or several; the first is the checkout's own `logs/`.
 * @param {{maxBytes?: number}} [opts]
 * @returns {{logs: object[], unstamped: number, skipped: {big: number, deep: number}, dirs: number}}
 */
function scanLogs(dirs, opts) {
  const roots = Array.isArray(dirs) ? dirs : [dirs];
  const maxBytes = (opts && opts.maxBytes) || MAX_BYTES;
  const logs = []; let unstamped = 0; const skipped = { big: 0, deep: 0 };
  roots.forEach((rootDir, ri) => {
    for (const file of listLogs(rootDir, 0, [], skipped)) {
      let text;
      try { if (fs.statSync(file).size > maxBytes) { skipped.big++; continue; } text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
      const lines = text.split('\n');
      const found = findStamp(lines);
      if (!found) { unstamped++; continue; }
      const tags = new Map();
      for (let i = found.index + 1; i < lines.length; i++) {
        if (lines[i].indexOf('§') < 0) continue;
        for (const h of T.tagsInLine(lines[i])) tags.set(h.tag, { text: lines[i].trim(), line: i + 1 });   // the last one wins
      }
      const rel = path.relative(rootDir, file).split(path.sep).join('/');
      logs.push({ file, name: ri === 0 ? rel : path.basename(rootDir) + '/' + rel, stamp: found.stamp, tags });
    }
  });
  logs.sort((a, b) => (a.stamp.at < b.stamp.at ? 1 : a.stamp.at > b.stamp.at ? -1 : 0));   // newest first
  return { logs, unstamped, skipped, dirs: roots.length };
}

function gitQuiet(root, args) {
  try { return cp.spawnSync('git', args, { cwd: root, stdio: 'ignore', timeout: 15000 }).status; } catch (e) { return -1; }
}
/** Why a value may (null) or may not (a reason) be shown for `fileRel` from a log with this stamp. */
function whyNot(root, stamp, fileRel, cache) {
  const key = stamp.commit + '\u0000' + stamp.dirty + '\u0000' + stamp.dirtyFiles.join(',') + '\u0000' + fileRel;
  if (cache && cache.has(key)) return cache.get(key);
  let why = null;
  if (stamp.dirty === null) why = 'stamp has no dirty count';
  else if (stamp.dirty > 0 && stamp.dirtyFiles.length !== stamp.dirty) why = 'stamp does not name its dirty files';
  else if (stamp.dirtyFiles.includes(fileRel)) why = 'file was dirty when the log was made';
  else if (gitQuiet(root, ['cat-file', '-e', stamp.commit + ':' + fileRel]) !== 0) why = 'file or commit not found';
  else if (gitQuiet(root, ['diff', '--quiet', stamp.commit, '--', fileRel]) !== 0) why = 'file changed since the log';
  if (cache) cache.set(key, why);
  return why;
}

/**
 * The lenses for one document.
 * @returns {{shown: object[], hidden: object[]}} shown: { line (0-based), tag, value, log, logLine, commit, at } ·
 *   hidden: { line, tag, why } for a tag that a stamped log does carry but whose value cannot be proven current.
 */
function lensesFor(root, fileRel, docText, scan, cache) {
  const shown = [], hidden = [];
  const lines = docText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('§') < 0 || T.printerRank(fileRel, lines[i]) !== 0) continue;      // a log call outside tests
    const seen = new Set();
    for (const h of T.tagsInLine(lines[i])) {
      if (seen.has(h.tag)) continue;
      seen.add(h.tag);
      let firstWhy = null, done = false;
      for (const log of scan.logs) {
        const v = log.tags.get(h.tag);
        if (!v) continue;
        const why = whyNot(root, log.stamp, fileRel, cache);
        if (!why) { shown.push({ line: i, tag: h.tag, value: v.text, log: log.file, logName: log.name, logLine: v.line, commit: log.stamp.commit, at: log.stamp.at }); done = true; break; }
        if (!firstWhy) firstWhy = why;
      }
      if (!done && firstWhy) hidden.push({ line: i, tag: h.tag, why: firstWhy });
    }
  }
  return { shown, hidden };
}
/**
 * Every tag the document prints (a log call outside tests), each with what can be said about its last value. Never silent:
 * @returns {object[]} { line (0-based), tag, state: 'shown' | 'hidden' | 'absent', value?, logName?, logLine?, commit?, why? }
 *   shown = provably current · hidden = a stamped log carries the tag but the value cannot be proven current (why says which
 *   proof failed) · absent = no stamped log carries the tag (why: `no stamped log found` or `tag not in any stamped log`).
 */
function explain(root, fileRel, docText, scan, cache) {
  const r = lensesFor(root, fileRel, docText, scan, cache);
  const key = x => x.line + '\u0000' + x.tag;
  const known = new Map();
  r.shown.forEach(x => known.set(key(x), Object.assign({ state: 'shown' }, x)));
  r.hidden.forEach(x => known.set(key(x), Object.assign({ state: 'hidden' }, x)));
  const out = [];
  const lines = docText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('§') < 0 || T.printerRank(fileRel, lines[i]) !== 0) continue;
    const seen = new Set();
    for (const h of T.tagsInLine(lines[i])) {
      if (seen.has(h.tag)) continue;
      seen.add(h.tag);
      out.push(known.get(i + '\u0000' + h.tag) ||
        { line: i, tag: h.tag, state: 'absent', why: scan.logs.length ? 'tag not in any stamped log' : 'no stamped log found' });
    }
  }
  return out;
}
/** One line for a hover, from an explain() entry: the provable value with its log and commit, or the named reason there is none. */
function hoverLine(e) {
  return e.state === 'shown'
    ? 'last value: `' + (e.value.length > 160 ? e.value.slice(0, 157) + '…' : e.value) + '` — ' + e.logName + ':' + e.logLine + ' @ ' + e.commit.slice(0, 7)
    : 'last value not shown: ' + e.why;
}
const title = l => 'last: ' + (l.value.length > 110 ? l.value.slice(0, 107) + '…' : l.value) + '   ·   ' + l.logName + ' @ ' + l.commit.slice(0, 7);

module.exports = { DEFAULT_EXTRA, expandHome, logDirs, findStamp, parseStamp, scanLogs, whyNot, lensesFor, explain, hoverLine, title };
