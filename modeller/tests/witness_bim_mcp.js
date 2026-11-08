#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BIM-MCP (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §18). READ THE §-LOG after every run.
 * ISSUE: an AI cannot use the app itself; a person carries text between their AI and edit_cli. Each claim names what it proves or disproves:
 *   M1 the AI cannot learn the app: tools/list gives both verbs, each described, every input described with its unit; initialize returns the instructions
 *   M2 the connector is a second, different answer: each verb = the same edit_cli call, compared on everything but the elapsed time ms
 *   M3 the loop does not close without a person: a scripted client, no AI, plays G4 through the connector alone: read the grid, shift gx6 by
 *      13 - bay, get stopped_by_gate with the reason, and the span check measures exactly 13 m (edit_cli itself fails if the stop's recount is not Before)
 *   M4 an unknown verb or a bad input reads as success: each returns isError, and no run happens
 * Falsifier: MCP_BREAK=1 (the connector halves the move) must fail M2 and M3. No model is called anywhere.
 */
'use strict';
const path = require('path'), { spawn } = require('child_process');
const SRV = path.join(__dirname, '..', 'tools', 'bim_mcp.js'), CLI = path.join(__dirname, '..', 'tools', 'edit_cli.js'), INSTRUMENT = ['--own-grid', '--lattice-boxes'];
let pass = 0, fail = 0; const L = (m) => console.log('§W-BIM-MCP ' + m);
const chk = (name, ok, info) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (info ? '  ' + info : '')); };
const strip = (t) => { try { const j = JSON.parse(t); delete j.ms; return JSON.stringify(j); } catch (e) { return 'UNPARSEABLE ' + String(t).slice(0, 80); } };
const direct = (argv) => new Promise((res) => { let o = ''; const p = spawn(process.execPath, [CLI].concat(argv, INSTRUMENT), { env: Object.assign({}, process.env, { MCP_BREAK: '' }), stdio: ['ignore', 'pipe', 'ignore'] });
  p.stdout.on('data', d => { o += d; }); p.on('close', c => res({ code: c, out: o.trim() })); });
function client() {
  const p = spawn(process.execPath, [SRV], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] }), wait = {}; let buf = '', id = 0, log = '';
  p.stderr.on('data', d => { log += d; });
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (wait[m.id]) { wait[m.id](m); delete wait[m.id]; } } });
  const rpc = (method, params) => new Promise((res) => { const k = ++id; wait[k] = res; p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const note = (method) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  return { rpc, note, close: () => { p.stdin.end(); return new Promise(r => p.on('close', () => r(log))); } };
}
(async () => {
  const c = client(), B = 'HospitalGarage';
  const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'witness_bim_mcp', version: '1' } }); c.note('notifications/initialized');
  const tl = await c.rpc('tools/list', {}), tools = (tl.result && tl.result.tools) || [], by = (n) => tools.filter(t => t.name === n)[0];
  const described = tools.length === 2 && tools.every(t => t.description && t.description.length > 60 && Object.keys(t.inputSchema.properties).every(k => (t.inputSchema.properties[k].description || '').length > 5));
  chk('M1 the menu: both verbs, each described, every input described; move says metres; the instructions come with initialize',
    !!by('bim_lines') && !!by('bim_try_shift') && described && /metres/.test(by('bim_try_shift').inputSchema.properties.move.description) && /Never call a result safe/.test((init.result || {}).instructions || ''),
    'tools=' + tools.map(t => t.name).join(',') + ' version=' + (init.result && init.result.protocolVersion));
  // the loop, through the connector alone
  const lr = await c.rpc('tools/call', { name: 'bim_lines', arguments: { building: B } }), lt = lr.result.content[0].text, lj = JSON.parse(lt);
  const pos = (id) => lj.model.lines.filter(l => l.id === id)[0].pos, bay = +(pos('gx6') - pos('gx5')).toFixed(3), move = +(13 - bay).toFixed(3);
  const sr = await c.rpc('tools/call', { name: 'bim_try_shift', arguments: { building: B, line: 'gx6', move } }), st = sr.result.content[0].text, sj = JSON.parse(st), e0 = sj.edits && sj.edits[0];
  const ol = e0 && e0.report ? ((e0.report.rows.filter(r => r.id === 'span_red')[0] || {}).over_limit_changed || []).filter(o => o.bay === 'gx5-gx6')[0] : null;
  L('loop bay gx5-gx6=' + bay + ' move=' + move + ' -> stopped=' + !!(e0 && e0.stopped_by_gate) + ' after=' + (ol && ol.after) + ' reason=' + (e0 && e0.reason));
  // the same two calls, straight to edit_cli
  const dl = await direct(['--building', B, '--lines']), ds = await direct(['--building', B, '--shift', 'gx6', '--move', String(move)]);
  chk('M2a bim_lines = edit_cli --lines (all but ms)', strip(lt) === strip(dl.out), 'bytes=' + lt.length + '/' + dl.out.length);
  chk('M2b bim_try_shift = edit_cli --shift (all but ms)', strip(st) === strip(ds.out) && ds.code === 3, 'bytes=' + st.length + '/' + ds.out.length + ' exit=' + ds.code);
  chk('M3 the loop closes with no person: grid read, move computed, stopped with the reason, the span check measures 13 m',
    sr.result.isError === false && !!e0 && e0.stopped_by_gate === true && /newly over the limit/.test(e0.reason) && !!ol && Math.abs(ol.after - 13) <= 0.0015, 'after=' + (ol && ol.after));
  const un = await c.rpc('tools/call', { name: 'bim_add_tower', arguments: {} }), mi = await c.rpc('tools/call', { name: 'bim_try_shift', arguments: { building: B, line: 'gx6' } });
  chk('M4 an unknown verb and a missing input are errors, not results', un.result.isError === true && /unknown tool/.test(un.result.content[0].text) && mi.result.isError === true && /missing input: move/.test(mi.result.content[0].text));
  const slog = await c.close(); slog.split('\n').filter(Boolean).forEach(l => L('server ' + l));
  console.log('§WITNESS_BIM_MCP pass=' + pass + ' fail=' + fail + ' verdict=' + (fail ? 'FAIL' : 'PASS') + (process.env.MCP_BREAK === '1' ? ' (MCP_BREAK=1)' : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§WITNESS_BIM_MCP verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
