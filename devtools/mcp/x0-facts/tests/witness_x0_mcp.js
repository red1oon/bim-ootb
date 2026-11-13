#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-MCP (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.14, bim-ootb #2954).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "an AI assistant working on this code guesses where a field is set or what a tag means,
//   because the project's own facts are only in the editor" — the facts server must give an assistant the SAME answers the
//   editor add-on gives, over the real protocol, and must never guess.
// HOW: the real server is started as a child process and spoken to exactly as an MCP client does (JSON-RPC 2.0, one JSON
//   message per line). Each tool's answer on this real repo is compared with the lib's own answer.
// RED CONTROLS: a made-up field → "not in the index"; a made-up tag → "no spec found"; an unknown tool → an error result;
//   a line that is not JSON → a JSON-RPC error and the server KEEPS answering; the server imports no network module.
// No JavaScript parser found → the parser-based checks are INCONCLUSIVE, never PASS.
// Command: node devtools/mcp/x0-facts/tests/witness_x0_mcp.js [--compiler-root <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const LIB = path.join(ROOT, 'devtools', 'vscode', 'x0-navigator', 'lib');
const S = require(path.join(LIB, 'app_surface_index'));
const J = require(path.join(LIB, 'js_facts'));
const ai = process.argv.indexOf('--compiler-root');
const COMPILER = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.resolve(ROOT, '..', 'bim-compiler');
const SEC = '§';
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function summary(f, verdict) { console.log(SEC + 'X0_MCP ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
const yn = b => (b ? 'Y' : 'N');

const SERVER = path.join(__dirname, '..', 'server.js');
const child = cp.spawn(process.execPath, [SERVER, '--root', ROOT, '--compiler-root', COMPILER], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = ''; const waiting = new Map(); const stray = [];
child.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch (e) { stray.push(line); continue; }
    if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } else stray.push(m);
  }
});
let nextId = 1;
function rpc(method, params, timeoutMs) {
  const id = nextId++;
  return new Promise(resolve => {
    const t = setTimeout(() => { waiting.delete(id); resolve({ timeout: true }); }, timeoutMs || 60000);
    waiting.set(id, m => { clearTimeout(t); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const call = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args || {} }, 120000); return r.result ? { text: r.result.content[0].text, isError: !!r.result.isError } : { text: JSON.stringify(r), isError: true }; };

(async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'witness', version: '0' } });
  const initOk = check('initialize → the server names itself and offers tools (' + JSON.stringify(init.result && init.result.serverInfo) + ', protocol ' + (init.result && init.result.protocolVersion) + ')',
    !!init.result && init.result.serverInfo.name === 'x0-facts' && !!init.result.capabilities.tools && init.result.protocolVersion === '2025-06-18');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await rpc('tools/list', {});
  const tools = (list.result && list.result.tools) || [];
  const WANT = ['where_is_field_set', 'what_is_tag', 'how_is_file_loaded', 'cost_if_deployed', 'last_logged_value', 'context_for_file', 'ship_check'];
  const toolsOk = check('tools/list → ' + tools.length + ' tools, each with a description and an input schema', WANT.every(n => tools.some(t => t.name === n && t.description.length > 40 && t.inputSchema && t.inputSchema.type === 'object')) && tools.length === WANT.length);

  // fields: compare with the lib's own answer on the committed index (a field the lib resolves there, and whose line matches)
  const idx = S.loadSurface(ROOT);
  const names = Array.from(idx.fields.keys()).sort();
  const defName = names.find(n => S.resolve(idx, n).kind === 'definition');
  const phName = names.find(n => idx.fields.get(n).phantom);
  const f1 = await call('where_is_field_set', { field: defName });
  const m = /is written at (\S+):(\d+)/.exec(f1.text);
  const fieldOk = check('where_is_field_set("' + defName + '") → ' + (m ? m[1] + ':' + m[2] : 'no place') + ', and that line mentions the field',
    !!m && S.lineHasField(fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split('\n')[Number(m[2]) - 1], defName) && /writes · \d+ reads/.test(f1.text));
  const f2 = await call('where_is_field_set', { field: 'AP' + 'P.' + phName });
  const phantomOk = check('a phantom, given with its object prefix → says PHANTOM, offers no place', /PHANTOM/.test(f2.text) && !/is written at/.test(f2.text));
  const f3 = await call('where_is_field_set', { field: 'zzNotAField__' });
  const unknownOk = check('red control: a made-up field → "not in the index", no place', /not in the index/.test(f3.text) && !/is written at/.test(f3.text) && !f3.isError);

  const t1 = await call('what_is_tag', { tag: 'HOSTED_BEFORE_HOST' });
  const haveCompiler = fs.existsSync(path.join(COMPILER, 'prompts'));
  const tagOk = check('what_is_tag (given without the ' + SEC + ') → spec places and the code that prints it' + (haveCompiler ? ', bim-compiler specs included' : ' (bim-compiler not found: its specs are named as not searched)'),
    t1.text.startsWith(SEC + 'HOSTED_BEFORE_HOST') && /printed by:/.test(t1.text) && (haveCompiler ? /bim-compiler prompts\//.test(t1.text) : /not searched: bim-compiler/.test(t1.text)));
  // a per-run suffix: the bare name is quoted in a spec file (bim-compiler CODE_ARCHITECTURE_DESIGN.md), so it stopped being made-up
  const t2 = await call('what_is_tag', { tag: SEC + 'ZZ_NOT_A_TAG_' + Date.now().toString(36).toUpperCase() });
  const fakeTagOk = check('red control: a made-up tag → "no spec found"', /no spec found/.test(t2.text));

  const parser = !!J.loadTs(ROOT);
  const l1 = await call('how_is_file_loaded', { file: 'viewer/scene.js' }), l2 = await call('how_is_file_loaded', { file: 'scripts/log_stamp.js' }), l3 = await call('how_is_file_loaded', { file: 'no/such.js' });
  const loadedOk = !parser ? null : check('how_is_file_loaded: a page script → start-up with bytes; a dev script → not loaded at start; a missing file → says so',
    /viewer → start-up · \d+ bytes/.test(l1.text) && /not loaded at start/.test(l2.text) && /no such file/.test(l3.text));
  const c1 = await call('cost_if_deployed', { base: 'HEAD' });
  const costOk = !parser ? null : check('cost_if_deployed → one ' + SEC + 'DEPLOY_COST line per app (' + c1.text.split('\n').filter(l => l.startsWith(SEC + 'DEPLOY_COST app=')).length + ')',
    c1.text.split('\n').filter(l => l.startsWith(SEC + 'DEPLOY_COST app=')).length >= 3);
  const v1 = await call('last_logged_value', { file: 'viewer/schedule_gate.js' });
  const lensOk = check('last_logged_value → counts provable and hidden values, and names how many logs were ignored as unstamped (' + v1.text.split('\n')[0].slice(0, 90) + ')',
    /^viewer\/schedule_gate\.js: \d+ provable value\(s\), \d+ hidden \(stamped logs: \d+, unstamped and ignored: \d+\)/.test(v1.text));
  // context_for_file: the same block lib/file_context.js builds (compared on the sections that do not depend on which index copy is read)
  const FC = require(path.join(LIB, 'file_context'));
  const x1 = await call('context_for_file', { file: 'viewer/cost_panel.js' });
  const want = FC.build(ROOT, 'viewer/cost_panel.js', { fields: null, tagIndex: null }).text;
  const sec = (t, title) => { const i = t.indexOf('## ' + title); const j = t.indexOf('\n## ', i + 3); return i < 0 ? null : t.slice(i, j < 0 ? undefined : j); };
  const x2 = await call('context_for_file', { file: 'viewer/zz_no_such_file.js' });
  const contextOk = check('context_for_file → the lib\'s own block (header and load sections identical), field and tag sections answered from the indexes; a missing file says so',
    x1.text.startsWith('# Context for `viewer/cost_panel.js`') && sec(x1.text, 'Its own header') === sec(want, 'Its own header') &&
    (!parser || sec(x1.text, 'How it reaches a user') === sec(want, 'How it reaches a user')) && !/INCONCLUSIVE: no APP field index|spec index not available/.test(x1.text) && /no such file/.test(x2.text));
  const k1 = await call('ship_check', { base: 'HEAD' });
  const checkOk = !parser ? null : check('ship_check → the three steps and a verdict (' + k1.text.split('\n').pop() + ')',
    /SHIP_SYNTAX files=\d+ verdict=PASS/.test(k1.text) && /SHIP_AUDIT verdict=PASS/.test(k1.text) && /SHIP_CHECK verdict=(PASS|FAIL)/.test(k1.text));

  // red controls on the protocol
  const b1 = await call('delete_everything', {});
  const badToolOk = check('red control: an unknown tool → an error result, not a crash', b1.isError && /Unknown tool/.test(b1.text));
  const before = stray.length;
  child.stdin.write('this is not json\n');
  const after = await rpc('ping', {});
  const parseErr = stray.slice(before).find(x => x && x.error && x.error.code === -32700);
  const badJsonOk = check('red control: a line that is not JSON → a JSON-RPC parse error, and the server still answers the next request', !!parseErr && !!after.result);
  const nf = await rpc('resources/list', {});
  check('an unsupported method → "Method not found", not silence', !!nf.error && nf.error.code === -32601);

  // the server must not be able to reach the network: no network module in its own source, or in the lib modules it loads,
  // except lib/ship.js, whose network function (fetchBack) this server never calls. Read with the parser.
  let net = '?';
  const ts = J.loadTs(ROOT);
  if (ts) {
    const NET = new Set(['http', 'https', 'net', 'tls', 'dgram', 'http2', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'node:http2']);
    const requires = file => {
      const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); const out = [];
      (function walk(n) { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require' && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) out.push(n.arguments[0].text); ts.forEachChild(n, walk); })(sf);
      return out;
    };
    const src = fs.readFileSync(SERVER, 'utf8');
    net = requires(SERVER).filter(r => NET.has(r)).length;
    const usesFetchBack = /ship\.fetchBack|ship\.httpGet|fetch\(/.test(src.replace(/\/\/.*$/gm, ''));
    const libNet = fs.readdirSync(LIB).filter(f => f.endsWith('.js') && f !== 'ship.js').filter(f => requires(path.join(LIB, f)).some(r => NET.has(r)));
    check('the server imports no network module (' + net + '), never calls the one network function of the lib, and no other lib module imports one (' + libNet.length + ')', net === 0 && !usesFetchBack && libNet.length === 0);
    net = net + libNet.length + (usesFetchBack ? 1 : 0);
  } else console.log('  NOTE  no JavaScript parser found: the network-import check and three tool checks were not judged');
  check('nothing but protocol messages on stdout (' + stray.filter(x => typeof x === 'string').length + ' stray lines)', stray.filter(x => typeof x === 'string').length === 0);

  child.stdin.end();
  const f = { tools: tools.length, init: yn(initOk), field: yn(fieldOk), phantom: yn(phantomOk), unknown: yn(unknownOk), tag: yn(tagOk), fake_tag: yn(fakeTagOk),
    cost: costOk === null ? '?' : yn(costOk), loaded: loadedOk === null ? '?' : yn(loadedOk), lens: yn(lensOk), context: yn(contextOk), check: checkOk === null ? '?' : yn(checkOk),
    bad_tool_error: yn(badToolOk), bad_json_survives: yn(badJsonOk), network_modules: net };
  summary(f, fail ? 'FAIL' : (parser && toolsOk ? 'PASS' : 'INCONCLUSIVE'));
  if (fail) process.exitCode = 1;
})().catch(e => { console.log('  FAIL witness crashed: ' + (e && e.stack)); summary({ crashed: 'Y' }, 'FAIL'); process.exitCode = 1; try { child.kill(); } catch (x) { /* gone */ } });
