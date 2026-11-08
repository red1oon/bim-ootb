#!/usr/bin/env node
// ⚠ DO NOT REMOVE — bim_mcp.js: the app's verbs, offered to any AI as tools (MCP over stdio). Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §18.
// Witness: modeller/tests/witness_bim_mcp.js (W-BIM-MCP). READ THE §-LOG on stderr after every run; stdout carries the protocol only.
//
// An AI app (Claude Desktop, Claude Code, any MCP client) starts this program, asks for its tools, and reads each verb's name, plain description
// and inputs: that menu is the API the AI reads. Each verb runs edit_cli.js (this folder) and returns its JSON unchanged, so the app does the work
// and the checks: one engine, no copy. No dependency beyond what edit_cli.js needs (puppeteer 24). MCP stdio = newline-delimited JSON-RPC 2.0.
//
//   Claude Code:     claude mcp add bim -- node /path/to/bim_mcp.js
//   Claude Desktop:  "mcpServers": { "bim": { "command": "node", "args": ["/path/to/bim_mcp.js"] } }
//   BIM_MCP_LOG=<file>  optional: append every tools/call (the AI's request, verbatim) and the answer returned, one JSON line each. Off unless set.
'use strict';
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const CLI = path.join(__dirname, 'edit_cli.js');
const INSTRUMENT = ['--own-grid', '--lattice-boxes'];   // the proposer test's instrument (§13.2, §13.6): the building's own grid; lattice boxes, no effect at theta 0
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const say = (s) => process.stderr.write('§BIM_MCP ' + s + '\n');
const LOGF = process.env.BIM_MCP_LOG || null;
const record = (o) => { if (!LOGF) return; try { fs.appendFileSync(LOGF, JSON.stringify(Object.assign({ t: new Date().toISOString() }, o)) + '\n'); } catch (e) { say('log write failed ' + e.message); } };

const INSTRUCTIONS = [
  'These tools operate a real BIM app. The app, not you, makes each change and checks it; it has no AI inside.',
  'Read the grid with bim_lines before proposing. A bay is the difference of two line positions (pos), in metres, in the building\'s own frame.',
  'bim_try_shift makes the change on a fresh copy of the building and returns the app\'s report. If the change adds new problems the app undoes it and says why ("stopped_by_gate"). Nothing is ever saved.',
  'Treat a stopped or refused result as bad. You may try again up to 2 times; if the request cannot be met without a bad result, decline and tell the user why. Do not keep a bad change and add a note.',
  'A row marked NOT_JUDGED was not checked: say so. Never call a result safe, compliant or OK.',
  'Always tell the user what the report lists under notChecked. Load capacity is never checked; a structural engineer has the last word.'
].join('\n');

const TOOLS = [
  { name: 'bim_lines',
    description: 'Read a building\'s grid: every grid line\'s id (gx0, gx1, … along x; gy0, gy1, … along y) and its position in metres in the building\'s own frame, plus the structural system, the material, the number of girders and the building\'s rotation in degrees. Opens a fresh copy of the building; takes about 10 to 40 seconds. Changes nothing.',
    inputSchema: { type: 'object', properties: { building: { type: 'string', description: 'The building name, e.g. "Hospital" or "HospitalGarage".' } }, required: ['building'] },
    args: (a) => ['--building', a.building, '--lines'] },
  { name: 'bim_try_shift',
    description: 'Shift one grid line, and every later line on the same axis, by a distance in metres (positive = towards higher positions). Only the bay just before that line changes width; the rest of the building travels with it. The app makes the change, checks it (overlaps, beam spans against their limit, doors and windows against their walls) and returns its report: what changed, each check before and after, and what was not checked. If the change adds new problems the app undoes it and returns stopped_by_gate with the reason. Opens a fresh copy each time; nothing is saved.',
    inputSchema: { type: 'object', properties: {
      building: { type: 'string', description: 'The building name, as in bim_lines.' },
      line: { type: 'string', description: 'The grid line to shift, e.g. "gx6".' },
      move: { type: 'number', description: 'The distance in metres, e.g. 1.824. Negative moves towards lower positions.' } }, required: ['building', 'line', 'move'] },
    args: (a) => ['--building', a.building, '--shift', a.line, '--move', String(process.env.MCP_BREAK === '1' ? a.move / 2 : a.move)] }   // MCP_BREAK = the witness's falsifier
];

function runCli(argv) {
  return new Promise((res) => {
    if (!fs.existsSync(CLI)) return res({ code: 1, out: '', err: 'edit_cli.js is not beside bim_mcp.js. Download it: curl -O https://red1oon.github.io/bim-ootb/modeller/tools/edit_cli.js' });
    let out = '', err = '';
    const p = spawn(process.execPath, [CLI].concat(argv), { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', code => res({ code, out: out.trim(), err: err.trim() }));
  });
}
function bad(a, t) {   // input check before any run: every required input present, and of its type
  const miss = t.inputSchema.required.filter(k => a[k] === undefined || a[k] === null || a[k] === '');
  if (miss.length) return 'missing input: ' + miss.join(', ');
  for (const k of Object.keys(t.inputSchema.properties)) if (a[k] !== undefined && (t.inputSchema.properties[k].type === 'number' ? typeof a[k] !== 'number' || !isFinite(a[k]) : typeof a[k] !== 'string')) return 'input ' + k + ' must be a ' + t.inputSchema.properties[k].type;
  return null;
}
async function call(name, a) {
  const t = TOOLS.filter(x => x.name === name)[0];
  if (!t) return { content: [{ type: 'text', text: 'unknown tool: ' + name + '. Tools: ' + TOOLS.map(x => x.name).join(', ') }], isError: true };
  const b = bad(a || {}, t); if (b) return { content: [{ type: 'text', text: b }], isError: true };
  const argv = t.args(a).concat(INSTRUMENT), t0 = Date.now(), r = await runCli(argv);
  say('call ' + name + ' ' + JSON.stringify(a) + ' -> exit=' + r.code + ' ms=' + (Date.now() - t0));
  // edit_cli: exit 0 every edit reported · 3 refused or stopped (an answer, not an error) · 2 usage · 1 failed
  if ((r.code === 0 || r.code === 3) && r.out) return { content: [{ type: 'text', text: r.out }], isError: false };
  return { content: [{ type: 'text', text: 'the app could not answer (exit ' + r.code + '): ' + (r.err || r.out || 'no output').split('\n').slice(-3).join(' ') }], isError: true };
}

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { if (m && m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32600, message: 'invalid request' } }); return; }
  if (m.id === undefined) return;   // a notification (e.g. notifications/initialized): no answer
  const ok = (result) => send({ jsonrpc: '2.0', id: m.id, result }), p = m.params || {};
  if (m.method === 'initialize') { const v = VERSIONS.indexOf(p.protocolVersion) >= 0 ? p.protocolVersion : VERSIONS[0]; say('initialize client=' + JSON.stringify(p.clientInfo || null) + ' version=' + v); record({ initialize: p.clientInfo || null, version: v });
    return ok({ protocolVersion: v, capabilities: { tools: {} }, serverInfo: { name: 'bim', version: '0.1.0' }, instructions: INSTRUCTIONS }); }
  if (m.method === 'ping') return ok({});
  if (m.method === 'tools/list') return ok({ tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  if (m.method === 'tools/call') { const r = await call(p.name, p.arguments); record({ tool: p.name, arguments: p.arguments, isError: r.isError, result: r.content[0].text }); return ok(r); }
  send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found: ' + m.method } });
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
  let m = null; try { m = JSON.parse(line); } catch (e) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
  handle(m).catch(e => { say('error ' + (e && e.stack || e)); if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: String(e && e.message || e) } }); }); } });
process.stdin.on('end', () => say('stdin closed'));
say('ready tools=' + TOOLS.map(t => t.name).join(',') + (process.env.MCP_BREAK === '1' ? ' MCP_BREAK=1' : ''));
