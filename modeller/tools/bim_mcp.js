#!/usr/bin/env node
// ⚠ DO NOT REMOVE — bim_mcp.js: the app's verbs, offered to any AI as tools (MCP over stdio). Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §18.
// Witness: modeller/tests/witness_bim_mcp.js (W-BIM-MCP). READ THE §-LOG on stderr after every run; stdout carries the protocol only.
//
// An AI app (Claude Desktop, Claude Code, any MCP client) starts this program, asks for its tools, and reads each verb's name, plain description
// and inputs: that menu is the API the AI reads. Each verb runs through the door (common/door/) to the app's own CLI and returns its JSON unchanged, so the app
// does the work and the checks: one engine, no copy. No dependency beyond what edit_cli.js needs (puppeteer 24). MCP stdio = newline-delimited JSON-RPC 2.0.
//
//   Claude Code:     claude mcp add bim -- node /path/to/bim_mcp.js
//   Claude Desktop:  "mcpServers": { "bim": { "command": "node", "args": ["/path/to/bim_mcp.js"] } }
//   BIM_MCP_LOG=<file>  optional: append every tools/call (the AI's request, verbatim) and the answer returned, one JSON line each. Off unless set.
'use strict';
const fs = require('fs'), path = require('path');
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const say = (s) => process.stderr.write('§BIM_MCP ' + s + '\n');
const LOGF = process.env.BIM_MCP_LOG || null;
const record = (o) => { if (!LOGF) return; try { fs.appendFileSync(LOGF, JSON.stringify(Object.assign({ t: new Date().toISOString() }, o)) + '\n'); } catch (e) { say('log write failed ' + e.message); } };

const INSTRUCTIONS = [
  'These tools operate a real BIM app. The app, not you, makes each change and checks it; it has no AI inside.',
  'Read the grid with bim_lines before proposing. A bay is the difference of two line positions (pos), in metres, in the building\'s own frame.',
  'bim_try_shift makes the change on a fresh copy of the building and returns the app\'s report. If the change adds new problems the app undoes it and says why ("stopped_by_gate"). Nothing is ever saved.',
  'viewer_counts and viewer_clashes read a building in the Viewer and give the answer the Viewer shows a person, with its own log line (viewerLine). They only read. If the Viewer says it cannot answer (unknown building, no clash rule for the pair), report that; do not guess a number.',
  'Treat a stopped or refused result as bad. You may try again up to 2 times; if the request cannot be met without a bad result, decline and tell the user why. Do not keep a bad change and add a note.',
  'A row marked NOT_JUDGED was not checked: say so. Never call a result safe, compliant or OK.',
  'Always tell the user what the report lists under notChecked. Load capacity is never checked; a structural engineer has the last word.'
].join('\n');

// ── The verb list is common/door/verbs.json (D1): tools/list is generated from it, and every call goes through the door (common/door/door.js, D4),
// the same path a person's terminal takes. Names, descriptions and schemas are the published ones, byte for byte (W-VOCAB-FRESH). Spec §0.7.
let DOOR = null, TOOLS = [];
const LIVE_DL = 'https://red1oon.github.io/bim-ootb/', DL = ['modeller/tools/edit_cli.js', 'common/door/door.js', 'common/door/verbs.json'];
const failStart = (why, files) => { say('FAIL ' + why + '. Put these files in one folder with bim_mcp.js (or use a bim-ootb checkout):\n' + files.map(f => '  curl -O ' + LIVE_DL + f).join('\n')); process.exit(1); };
try {
  const beside = path.join(__dirname, 'door.js'), doorFile = fs.existsSync(beside) ? beside : path.join(__dirname, '..', '..', 'common', 'door', 'door.js');   // beside first, then the repo layout
  if (!fs.existsSync(doorFile)) failStart('door.js is not beside bim_mcp.js', DL);
  const D = require(doorFile), miss = D.missingFiles(['verbs.json', 'edit_cli.js']);
  if (miss.length) failStart('missing beside bim_mcp.js: ' + miss.join(', '), DL.filter(f => miss.indexOf(path.basename(f)) >= 0));
  DOOR = D.createDoor(); TOOLS = DOOR.mcpTools();
} catch (e) { failStart('the door is not available (' + (e && e.message || e) + ')', DL); }
const MCP2VERB = {}; DOOR.vocab.verbs.forEach(v => { if (v.mcp_name) MCP2VERB[v.mcp_name] = v.verb; });

async function call(name, a) {
  const t = TOOLS.filter(x => x.name === name)[0];
  if (!t) return { content: [{ type: 'text', text: 'unknown tool: ' + name + '. Tools: ' + TOOLS.map(x => x.name).join(', ') }], isError: true };
  a = a || {};
  if (process.env.MCP_BREAK === '1' && name === 'bim_try_shift' && typeof a.move === 'number') a = Object.assign({}, a, { move: a.move / 2 });   // MCP_BREAK = the witness's falsifier
  const t0 = Date.now(), env = await DOOR.execArgs({ verb: MCP2VERB[name], args: a, actor: 'ai' });
  say('call ' + name + ' ' + JSON.stringify(a) + ' -> status=' + env.status + ' request=' + env.request + ' ms=' + (Date.now() - t0));
  // The reply text is the engine's own JSON, unchanged (an ok answer, or a refusal/stop, which is an answer). The envelope goes to the call log and the door journal.
  const answered = (env.status === 'ok' || env.status === 'refused') && env.answer !== null && env._raw;
  const r = answered ? { content: [{ type: 'text', text: env._raw }], isError: false } : { content: [{ type: 'text', text: env.why || env.status }], isError: true };
  r.envelope = env; return r;
}

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { if (m && m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32600, message: 'invalid request' } }); return; }
  if (m.id === undefined) return;   // a notification (e.g. notifications/initialized): no answer
  const ok = (result) => send({ jsonrpc: '2.0', id: m.id, result }), p = m.params || {};
  if (m.method === 'initialize') { const v = VERSIONS.indexOf(p.protocolVersion) >= 0 ? p.protocolVersion : VERSIONS[0]; say('initialize client=' + JSON.stringify(p.clientInfo || null) + ' version=' + v); record({ initialize: p.clientInfo || null, version: v });
    return ok({ protocolVersion: v, capabilities: { tools: {} }, serverInfo: { name: 'bim', version: '0.1.0' }, instructions: INSTRUCTIONS }); }
  if (m.method === 'ping') return ok({});
  if (m.method === 'tools/list') return ok({ tools: TOOLS });
  if (m.method === 'tools/call') { const r = await call(p.name, p.arguments), env = r.envelope; delete r.envelope; record({ tool: p.name, arguments: p.arguments, isError: r.isError, result: r.content[0].text, status: env && env.status, request: env && env.request, envelope: env }); return ok(r); }
  send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found: ' + m.method } });
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
  let m = null; try { m = JSON.parse(line); } catch (e) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
  handle(m).catch(e => { say('error ' + (e && e.stack || e)); if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: String(e && e.message || e) } }); }); } });
process.stdin.on('end', () => say('stdin closed'));
say('ready tools=' + TOOLS.map(t => t.name).join(',') + (process.env.MCP_BREAK === '1' ? ' MCP_BREAK=1' : ''));
