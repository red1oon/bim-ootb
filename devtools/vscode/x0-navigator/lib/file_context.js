// SPDX-License-Identifier: MIT
// X0 Navigator — "Context for this file": what the repo's own indexes say about ONE file, as a block of markdown.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.16 (Part F, decision F-3 (a)) · issue #2965.
// Pure node, no `vscode` import. It adds no fact of its own: every section is another lib module's answer, or the file's
// own leading comment, quoted. A section with nothing to say says so in words. It never guesses and never calls a model.
// The editor command pastes this for whatever assistant the developer chose; the facts server offers it as one tool.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const cost = require('./deploy_cost');
const lens = require('./lens_index');
const tags = require('./tag_index');

const HEADER_MAX = 40;

/**
 * The file's leading comment: the `//` lines and `/* … *​/` blocks before the first line of code (a `#!` line and blank
 * lines are skipped, a 'use strict' line ends it). Read line by line from the top; nothing below the first code line.
 * @returns {{lines: string[], total: number}} at most HEADER_MAX lines, and how many there were.
 */
function headerOf(text) {
  const out = [];
  let inBlock = false;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (inBlock) { out.push(raw); if (l.includes('*/')) inBlock = false; continue; }
    if (l === '' || l.startsWith('#!')) { if (out.length && l === '') out.push(''); continue; }
    if (/^\/\/\s*(Copyright\b|SPDX-License-Identifier)/.test(l)) continue;                 // licence lines say nothing about the code
    if (l.startsWith('//')) { out.push(raw); continue; }
    if (l.startsWith('/*')) { out.push(raw); if (!l.includes('*/')) inBlock = true; continue; }
    break;
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return { lines: out.slice(0, HEADER_MAX), total: out.length };
}

function git(root, args) {
  try { const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000 }); return r.status === 0 ? r.stdout.trim() : null; }
  catch (e) { return null; }
}

/**
 * @param {string} root - the bim-ootb checkout
 * @param {string} rel  - the file, relative to root, with forward slashes
 * @param {{fields: object|null, tagIndex: object|null, costNow?: object}} deps - indexes the caller already holds
 *   (fields: app_surface_index.loadSurface() · tagIndex: tag_index.buildIndex()); a null one makes its section INCONCLUSIVE.
 * @returns {{found: boolean, text: string, facts: object}} facts repeats, as data, what the text says (the witness reads it).
 */
function build(root, rel, deps) {
  const abs = path.join(root, rel);
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { return { found: false, text: rel + ': no such file in this checkout', facts: {} }; }
  const L = [];
  const facts = { file: rel };

  const head = git(root, ['rev-parse', '--short', 'HEAD']);
  const dirty = git(root, ['status', '--porcelain', '--', rel]);
  facts.lines = text.split('\n').length; facts.bytes = Buffer.byteLength(text);
  facts.commit = head; facts.edited = dirty === null ? null : dirty !== '';
  L.push('# Context for `' + rel + '`', '');
  L.push('From this checkout\'s own indexes (X0 Navigator). Nothing here is a guess; a section with no data says so.', '');
  L.push('- ' + facts.lines + ' lines · ' + facts.bytes + ' bytes · checkout at ' + (head || 'unknown commit') +
    (facts.edited === null ? '' : facts.edited ? ' · this file has uncommitted changes' : ' · this file is as committed'), '');

  const h = headerOf(text);
  facts.headerLines = h.total;
  L.push('## Its own header', '');
  if (!h.total) L.push('no header comment');
  else {
    L.push('```js'); h.lines.forEach(x => L.push(x)); L.push('```');
    if (h.total > h.lines.length) L.push('(first ' + h.lines.length + ' of ' + h.total + ' header lines)');
  }
  L.push('');

  L.push('## How it reaches a user', '');
  const m = deps.costNow || cost.measure(root, cost.fsReader(root));
  if (!m.parser) { facts.load = null; L.push('INCONCLUSIVE: no JavaScript parser found (scripts/lib/find_ts.js)'); }
  else {
    const c = cost.fileClass(m, rel);
    facts.load = c.map(x => x.app + ':' + x.how);
    if (!c.length) L.push('not loaded at start (no page script tag and no service-worker cache list names it)');
    else c.forEach(x => L.push('- ' + x.app + ': ' + x.how + ' · ' + cost.kb(x.bytes) + ' (raw)' +
      (x.how === 'start-up' ? ' · every user pays for it when the page opens' : '')));
    if (c.some(x => x.how === 'start-up' || x.how === 'offline cache')) L.push('', 'An edit here needs the cache bump: `node scripts/bump.js ' + rel + '` (dry run; `--write` applies).');
  }
  L.push('');

  L.push('## APP fields whose listed write site is this file', '');
  if (!deps.fields) { facts.fields = null; L.push('INCONCLUSIVE: no APP field index'); }
  else {
    const mine = [...deps.fields.fields.values()].filter(f => !f.phantom && f.file === rel).sort((a, b) => a.line - b.line);
    facts.fields = mine.map(f => f.name);
    if (!mine.length) L.push('none');
    else mine.forEach(f => L.push('- `APP.' + f.name + '` — line ' + f.line + (f.as !== 'APP' ? ' (written as `' + f.as + '.' + f.name + '`)' : '') + ' · ' + f.writes + ' writes · ' + f.reads + ' reads'));
  }
  L.push('');

  L.push('## The § tags it prints', '');
  const scan = lens.scanLogs(path.join(root, 'logs'));
  const printed = lens.explain(root, rel, text, scan, new Map());
  facts.tags = printed.map(p => p.tag);
  facts.tagStates = printed.map(p => p.state);
  if (!printed.length) L.push('prints no § tag');
  for (const p of printed) {
    let spec = 'spec index not available';
    if (deps.tagIndex) {
      const r = tags.lookup(deps.tagIndex, p.tag);
      spec = r.found ? r.spec[0].root + ' ' + r.spec[0].file + ':' + r.spec[0].line + (r.spec[0].heading ? ' — ' + r.spec[0].heading : '') +
        (r.spec.length > 1 ? ' (+' + (r.spec.length - 1) + ' more)' : '') : 'no spec found';
    }
    L.push('- line ' + (p.line + 1) + ' `' + p.tag + '` — spec: ' + spec);
    L.push('  - last value: ' + (p.state === 'shown' ? '`' + p.value + '` [' + p.logName + ':' + p.logLine + ' @ ' + p.commit.slice(0, 7) + ']' : 'not shown: ' + p.why));
  }
  L.push('');

  L.push('## Not in this block', '');
  L.push('Who owns this file, which witnesses prove it, and which project rules apply: those indexes do not exist yet (design parts D and E).');
  return { found: true, text: L.join('\n'), facts };
}

module.exports = { build, headerOf, HEADER_MAX };
