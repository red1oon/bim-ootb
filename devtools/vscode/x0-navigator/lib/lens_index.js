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

/** Read every `*.log` in `logsDir`. Stamped logs come back with their tags; unstamped ones are only counted. */
function scanLogs(logsDir) {
  const logs = []; let unstamped = 0;
  let names; try { names = fs.readdirSync(logsDir).filter(n => n.endsWith('.log')).sort(); } catch (e) { names = []; }
  for (const n of names) {
    let text; try { text = fs.readFileSync(path.join(logsDir, n), 'utf8'); } catch (e) { continue; }
    const lines = text.split('\n');
    const stamp = parseStamp(lines[0]);
    if (!stamp) { unstamped++; continue; }
    const tags = new Map();
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].indexOf('§') < 0) continue;
      for (const h of T.tagsInLine(lines[i])) tags.set(h.tag, { text: lines[i].trim(), line: i + 1 });   // the last one wins
    }
    logs.push({ file: path.join(logsDir, n), name: n, stamp, tags });
  }
  logs.sort((a, b) => (a.stamp.at < b.stamp.at ? 1 : a.stamp.at > b.stamp.at ? -1 : 0));   // newest first
  return { logs, unstamped };
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
const title = l => 'last: ' + (l.value.length > 110 ? l.value.slice(0, 107) + '…' : l.value) + '   ·   ' + l.logName + ' @ ' + l.commit.slice(0, 7);

module.exports = { parseStamp, scanLogs, whyNot, lensesFor, title };
