#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-X0-MCP), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.14, bim-ootb #2954
// x0-facts: a local facts server for any AI assistant that speaks MCP (Model Context Protocol). It answers from the SAME code
// X0 Navigator uses in the editor (devtools/vscode/x0-navigator/lib), so the assistant gets the project's facts, not guesses.
//   - read-only: no tool writes, commits, pushes or deploys
//   - never calls a model, opens no network connection (the witness checks the imports)
//   - plain node, no npm: the MCP wire format is JSON-RPC 2.0, one JSON message per line on stdin/stdout, spoken here by hand
//   - OFF by default: nothing in the repo starts it. Turn on:  claude mcp add x0-facts --scope local -- node devtools/mcp/x0-facts/server.js
//                                                    Turn off: claude mcp remove x0-facts --scope local
// Usage: node devtools/mcp/x0-facts/server.js [--root <bim-ootb checkout>] [--compiler-root <bim-compiler checkout>] [--extra-logs <dir,dir|none>]
// stdout carries ONLY protocol messages. Anything for a human goes to stderr.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const LIB = path.join(__dirname, '..', '..', 'vscode', 'x0-navigator', 'lib');
const surface = require(path.join(LIB, 'app_surface_index'));
const refresh = require(path.join(LIB, 'surface_refresh'));
const tags = require(path.join(LIB, 'tag_index'));
const cost = require(path.join(LIB, 'deploy_cost'));
const lens = require(path.join(LIB, 'lens_index'));
const ship = require(path.join(LIB, 'ship'));
const fileContext = require(path.join(LIB, 'file_context'));
const appRefs = require(path.join(LIB, 'app_refs'));

const argv = process.argv.slice(2);
const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(arg('--root') || path.join(__dirname, '..', '..', '..'));
const COMPILER = path.resolve(arg('--compiler-root') || process.env.X0_COMPILER_ROOT || path.join(ROOT, '..', 'bim-compiler'));
// extra log folders (read-only): --extra-logs a,b · default = the editor's default (the bake cache). `--extra-logs none` reads only logs/.
const EXTRA_LOGS = arg('--extra-logs') === 'none' ? [] : (arg('--extra-logs') ? arg('--extra-logs').split(',') : lens.DEFAULT_EXTRA);
const SEC = '§';
const relOf = f => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/');

// ── facts, each built once and reused ──
let fieldIndex = null;
async function fields() {
  if (fieldIndex) return fieldIndex;
  const out = path.join(os.tmpdir(), 'x0-facts-' + crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 10));
  try { const r = await refresh.runOnce(ROOT, out); fieldIndex = surface.loadSurface(ROOT, r.file); fieldIndex.source = 'fresh copy (' + r.line.trim() + ')'; }
  catch (e) { fieldIndex = surface.loadSurface(ROOT); if (fieldIndex) fieldIndex.source = 'the committed internal/APP_SURFACE.md (the generator could not run)'; }
  return fieldIndex;
}
let tagIdx = null;
const tagIndex = () => tagIdx || (tagIdx = tags.buildIndex([{ name: 'bim-ootb', dir: ROOT }, { name: 'bim-compiler', dir: COMPILER }]));

const TOOLS = [
  { name: 'where_is_field_set',
    description: 'Where the viewer\'s shared object field APP.<field> (also written A.<field> or app.<field>) is assigned: file:line, write and read counts. Says PHANTOM for a field that is read but never written, and "not in the index" for an unknown one. Never guesses. Use this instead of a text search for the assignment.',
    inputSchema: { type: 'object', properties: { field: { type: 'string', description: 'The field name alone, e.g. "camera"' } }, required: ['field'] },
    async run(a) {
      const name = String(a.field || '').replace(/^(window\.)?(APP|A|app)\./, '');
      const idx = await fields();
      if (!idx) return 'INCONCLUSIVE: no APP index (internal/APP_SURFACE.md missing and the generator could not run)';
      const r = surface.resolve(idx, name);
      if (!r) return 'APP.' + name + ': not in the index. No code under this checkout writes or reads a field of that name (index: ' + idx.fields.size + ' fields, ' + idx.source + ').';
      if (r.kind === 'phantom' && r.untied) return 'APP.' + name + ': PHANTOM? The index found no writer it can tie to the shared object, but ' + r.untied.file + ':' + r.untied.line + ' assigns a field of this name through a local name. Probably not dead: read that line.';
      if (r.kind === 'phantom') return 'APP.' + name + ': PHANTOM. It is read but never written' + (r.firstRead ? ' (first read at ' + r.firstRead.file + ':' + r.firstRead.line + ')' : '') + '. A guard on it can never be true, or its writer was removed.';
      if (r.kind === 'stale') return 'APP.' + name + ': index stale. The index points at ' + r.file + ':' + r.line + ', but that line no longer mentions the field. Not reported, rather than reported wrong.';
      return 'APP.' + name + ' is written at ' + r.file + ':' + r.line + ' (spelled ' + r.as + '.' + name + ' there) · ' + r.writes + ' writes · ' + r.reads + ' reads. Source: ' + idx.source + '.';
    } },
  { name: 'where_is_field_used',
    description: 'Every place the shared-object field APP.<field> is written or read, under any of its three spellings (the long name, the one-letter name, the lowercase name): file:line for each write, then the reads grouped by file. Use it before renaming, removing or changing the meaning of a field. Says so when the field is not in the index.',
    inputSchema: { type: 'object', properties: { field: { type: 'string', description: 'The field name alone, e.g. "camera"' }, limit: { type: 'number', description: 'How many read sites to list (default 40)' } }, required: ['field'] },
    async run(a) {
      const name = String(a.field || '').replace(/^(window\.)?(APP|A|app)\./, '');
      const idx = await fields();
      const r = appRefs.references(ROOT, idx ? appRefs.loadSites(idx.file) : null, name);
      if (!r.known) return 'APP.' + name + ': no reference list. ' + (idx && idx.fields.has(name) ? 'The site list could not be made (the generator did not run).' : 'No code under this checkout writes or reads a field of that name.');
      const cap = Math.max(1, Math.min(400, Number(a.limit) || 40));
      const out = ['APP.' + name + ': ' + r.writes.length + ' write site(s), ' + r.reads.length + ' other read site(s)' + (r.dropped ? ' (' + r.dropped + ' dropped: the line no longer mentions the field)' : '')];
      r.writes.forEach(w => out.push('  write ' + w.file + ':' + w.line + (w.as && w.as !== 'APP' ? ' (as ' + w.as + '.' + name + ')' : '')));
      const by = new Map(); r.reads.slice(0, cap).forEach(x => { if (!by.has(x.file)) by.set(x.file, []); by.get(x.file).push(x.line); });
      for (const [f, ls] of by) out.push('  read  ' + f + ': ' + ls.join(', '));
      if (r.reads.length > cap) out.push('  … ' + (r.reads.length - cap) + ' more read sites (raise limit)');
      return out.join('\n');
    } },
  { name: 'what_is_tag',
    description: 'What a ' + SEC + 'TAG (a log marker such as ' + SEC + 'HOSTED_BEFORE_HOST) stands for: the spec files and headings that name it (prompts/ and docs/ of bim-ootb and bim-compiler) and the code lines that print it. Says "no spec found" when no spec names it.',
    inputSchema: { type: 'object', properties: { tag: { type: 'string', description: 'The tag, with or without the leading ' + SEC } }, required: ['tag'] },
    async run(a) {
      const t = String(a.tag || '').trim(); const tag = t.startsWith(SEC) ? t : SEC + t;
      const idx = tagIndex();
      return tags.formatHover(tags.lookup(idx, tag)).replace(/\*\*/g, '') + (idx.spec.missing.length ? '\n(not searched: ' + idx.spec.missing.join(', ') + ' — checkout not found)' : '');
    } },
  { name: 'how_is_file_loaded',
    description: 'How a file of this repo reaches a user: "start-up" (a page loads it with a script tag: every user pays for it when the page opens), "offline cache" (the service worker stores it), or "not loaded at start". With its size in bytes.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Path relative to the repo root, e.g. viewer/scene.js' } }, required: ['file'] },
    async run(a) {
      const m = cost.measure(ROOT, cost.fsReader(ROOT));
      if (!m.parser) return 'INCONCLUSIVE: no JavaScript parser found (scripts/lib/find_ts.js)';
      const rel = relOf(a.file);
      if (!fs.existsSync(path.join(ROOT, rel))) return rel + ': no such file in this checkout';
      const c = cost.fileClass(m, rel);
      return rel + ': ' + (c.length ? c.map(x => x.app + ' → ' + x.how + ' · ' + x.bytes + ' bytes (raw)').join('; ') : 'not loaded at start (no page script tag and no service-worker cache list names it)');
    } },
  { name: 'cost_if_deployed',
    description: 'What the working tree would add to what users download, compared with a git ref (default origin/main): per app, start-up bytes and offline-cache bytes and their change, and any file newly loaded at start-up. Raw bytes, not minified; no budget is applied.',
    inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'git ref to compare against (default origin/main)' } } },
    async run(a) {
      const ref = a.base || 'origin/main';
      const now = cost.measure(ROOT, cost.fsReader(ROOT));
      if (!now.parser) return SEC + 'DEPLOY_COST verdict=INCONCLUSIVE reason="no JavaScript parser found"';
      const lines = [];
      for (const r of cost.compare(now, cost.measure(ROOT, cost.gitReader(ROOT, ref)))) {
        lines.push(cost.formatRow(r, ref));
        r.newBoot.forEach(f => lines.push('    new at start-up: ' + f));
        r.movedToBoot.forEach(f => lines.push('    moved from offline-cache-only to start-up: ' + f));
      }
      return lines.join('\n');
    } },
  { name: 'last_logged_value',
    description: 'For a source file: the last value a saved log (logs/*.log) holds for each ' + SEC + 'TAG the file prints, but ONLY when it is provably current (the log names its commit and the file is unchanged since). Lists the hidden ones with the reason. Use it to read what the code last printed without re-running it.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Path relative to the repo root' } }, required: ['file'] },
    async run(a) {
      const rel = relOf(a.file);
      let text; try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return rel + ': no such file in this checkout'; }
      const scan = lens.scanLogs(lens.logDirs(ROOT, EXTRA_LOGS));
      const r = lens.lensesFor(ROOT, rel, text, scan, new Map());
      const out = [rel + ': ' + r.shown.length + ' provable value(s), ' + r.hidden.length + ' hidden (stamped logs: ' + scan.logs.length + ', unstamped and ignored: ' + scan.unstamped + ')'];
      r.shown.forEach(l => out.push('  line ' + (l.line + 1) + ' ' + l.tag + ' → ' + l.value + '   [' + l.logName + ':' + l.logLine + ' @ ' + l.commit + ']'));
      r.hidden.forEach(h => out.push('  line ' + (h.line + 1) + ' ' + h.tag + ' → not shown: ' + h.why));
      return out.join('\n');
    } },
  { name: 'context_for_file',
    description: 'Everything the repo\'s own indexes say about ONE file, in one answer: its header comment, how it reaches a user (start-up / offline cache / not loaded at start, and the cache-bump command if it needs one), the shared-object fields whose write site is in it, and each ' + SEC + 'TAG it prints with its spec place and last provable logged value (or the named reason none is shown). Call this before reading or editing a file you do not know.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Path relative to the repo root, e.g. viewer/cost_panel.js' } }, required: ['file'] },
    async run(a) { return fileContext.build(ROOT, relOf(a.file), { fields: await fields(), tagIndex: tagIndex(), extraLogDirs: EXTRA_LOGS }).text; } },
  { name: 'ship_check',
    description: 'Runs the repo\'s pre-ship checks on the working tree and stops at the first failure: node --check on the JS files that differ from the base ref, the service-worker precache audit, and the bump rule (a precached file changed while that app\'s CACHE_VERSION did not). Read-only. Returns the ' + SEC + 'SHIP_* lines.',
    inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'git ref to compare against (default origin/main)' } } },
    async run(a) { return ship.check(ROOT, a.base || 'origin/main', process.execPath).lines.join('\n'); } }
];

// ── MCP over stdio: JSON-RPC 2.0, one message per line ──
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => send({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } });
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  if (method === 'initialize') {
    const want = params && params.protocolVersion;
    return ok(id, { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: {} },
      serverInfo: { name: 'x0-facts', version: '0.1.0' },
      instructions: 'Read-only facts about this codebase, from its own generated indexes. Prefer these tools over text search for: where an APP field is set, what a ' + SEC + 'TAG means, how a file is loaded, and what a change costs.' });
  }
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === (params && params.name));
    if (!tool) return ok(id, { content: [{ type: 'text', text: 'Unknown tool: ' + (params && params.name) }], isError: true });
    try { return ok(id, { content: [{ type: 'text', text: String(await tool.run((params && params.arguments) || {})) }] }); }
    catch (e) { return ok(id, { content: [{ type: 'text', text: 'x0-facts could not answer: ' + (e && e.message) }], isError: true }); }
  }
  if (!isRequest) return;                                   // a notification (e.g. notifications/initialized): nothing to answer
  return err(id, -32601, 'Method not found: ' + method);
}

let chain = Promise.resolve();
readline.createInterface({ input: process.stdin, terminal: false }).on('line', line => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch (e) { err(null, -32700, 'Parse error: a message must be one line of JSON'); return; }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') { err(msg && msg.id, -32600, 'Invalid request'); return; }
  chain = chain.then(() => handle(msg)).catch(e => err(msg.id, -32603, 'Internal error: ' + (e && e.message)));
}).on('close', () => chain.then(() => process.exit(0)));
process.stderr.write('x0-facts: ready (root ' + ROOT + ', ' + TOOLS.length + ' tools, read-only, no network)\n');
