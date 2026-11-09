#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-SAME (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.7). READ THE §-LOG after every run. Real runs: needs a bim-ootb checkout + puppeteer.
 * ISSUE: an adapter that changes the answer. The same request goes (a) through the terminal door (common/door/door.js, actor human), (b) through the AI connector
 * (bim_mcp.js tools/call, actor ai), (c) straight to edit_cli. Request 1 = modeller.lines, request 2 = the G4 shift (HospitalGarage gx6 by 13 - bay): a refusal, the stop.
 *   S1 (a) and (b) give the same envelope, apart from request / actor / ms      S2 the envelope's answer = edit_cli's stdout byte for byte (ms aside), for both
 *   S3 the connector's reply text = edit_cli's stdout (W-BIM-MCP's expectation, unchanged)      S4 the two really differ where they should (actor human/ai, different request ids): not vacuous
 * Falsifier MCP_BREAK=1 (the connector halves the move) must fail S1/S2 on request 2.
 */
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { kit, tmp, run, stripMs, ROOT, DOOR } = require('./_kit');
const k = kit('W-DOOR-SAME'), EDIT = path.join(ROOT, 'modeller', 'tools', 'edit_cli.js'), SRV = path.join(ROOT, 'modeller', 'tools', 'bim_mcp.js'), INSTR = ['--own-grid', '--lattice-boxes'];
const B = 'HospitalGarage', LOGF = tmp('same_log_'), JRN = tmp('same_j_'), TJ = tmp('same_tj_');
function connector(name, args) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [SRV], { env: Object.assign({}, process.env, { BIM_MCP_LOG: LOGF, BIM_DOOR_JOURNAL: JRN }), stdio: ['pipe', 'pipe', 'ignore'] }); let b = '';
    p.stdout.on('data', d => { b += d; const m = b.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x.id === 2)[0]; if (m) { p.stdin.end(); res(m.result); } });
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'witness_door_same' } } }) + '\n');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }) + '\n');
  });
}
const logRec = (tool) => fs.readFileSync(LOGF, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.tool === tool)[0];
const norm = (e) => { const c = JSON.parse(JSON.stringify(e)); delete c.request; delete c.actor; delete c.ms; if (c.answer) delete c.answer.ms; return JSON.stringify(c); };
(async () => {
  const [rt1, rc1, rd1] = await Promise.all([run(DOOR, ['--actor', 'human', '--journal', TJ, '--request', 'S-1', 'modeller.lines building=' + B]), connector('bim_lines', { building: B }), run(EDIT, ['--building', B, '--lines'].concat(INSTR))]);
  const lj = JSON.parse(rd1.out), pos = (id) => lj.model.lines.filter(l => l.id === id)[0].pos, bay = +(pos('gx6') - pos('gx5')).toFixed(3), move = +(13 - bay).toFixed(3);
  const e1t = JSON.parse(rt1.out), e1c = logRec('bim_lines').envelope;
  k.L('request 1 modeller.lines: terminal exit=' + rt1.code + ' status=' + e1t.status + '; connector status=' + e1c.status + '; bay gx5-gx6=' + bay + ' move=' + move);
  k.chk('S1a modeller.lines: terminal envelope = connector envelope (apart from request/actor/ms)', norm(e1t) === norm(e1c), 'bytes=' + norm(e1t).length + '/' + norm(e1c).length);
  k.chk('S2a modeller.lines: the envelope\'s answer = edit_cli --lines, byte for byte but ms', stripMs(JSON.stringify(e1t.answer)) === stripMs(rd1.out) && stripMs(JSON.stringify(e1c.answer)) === stripMs(rd1.out));
  k.chk('S3a the connector\'s reply text = edit_cli --lines', stripMs(rc1.content[0].text) === stripMs(rd1.out) && rc1.isError === false);
  const [rt2, rc2, rd2] = await Promise.all([run(DOOR, ['--actor', 'human', '--journal', TJ, '--request', 'S-2', 'modeller.try_shift building=' + B + ' line=gx6 move=' + move]), connector('bim_try_shift', { building: B, line: 'gx6', move }), run(EDIT, ['--building', B, '--shift', 'gx6', '--move', String(move)].concat(INSTR))]);
  const e2t = JSON.parse(rt2.out), e2c = logRec('bim_try_shift').envelope;
  k.L('request 2 modeller.try_shift gx6 ' + move + ': terminal exit=' + rt2.code + ' status=' + e2t.status + ' why=' + e2t.why + '; connector status=' + e2c.status + '; direct exit=' + rd2.code);
  k.chk('S1b try_shift: terminal envelope = connector envelope (apart from request/actor/ms)', norm(e2t) === norm(e2c), 'bytes=' + norm(e2t).length + '/' + norm(e2c).length);
  k.chk('S2b try_shift: the envelope\'s answer = edit_cli --shift, byte for byte but ms; status refused (the stop), exit 3', stripMs(JSON.stringify(e2t.answer)) === stripMs(rd2.out) && stripMs(JSON.stringify(e2c.answer)) === stripMs(rd2.out) && e2t.status === 'refused' && rt2.code === 3 && rd2.code === 3 && e2t.answer.edits[0].stopped_by_gate === true, 'bytes=' + rd2.out.length);
  k.chk('S3b the connector\'s reply text = edit_cli --shift', stripMs(rc2.content[0].text) === stripMs(rd2.out) && rc2.isError === false);
  k.chk('S4 not vacuous: the actors differ (human/ai), the request ids differ, notChecked is carried', e2t.actor === 'human' && e2c.actor === 'ai' && e2t.request !== e2c.request && Array.isArray(e2t.notChecked) && e2t.notChecked.length > 0, 'actors=' + e2t.actor + '/' + e2c.actor + ' notChecked=' + e2t.notChecked.length);
  k.L('envelope keys: ' + Object.keys(e2t).join(','));
  k.end();
})().catch(e => { console.log('§WITNESS_DOOR_SAME verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
