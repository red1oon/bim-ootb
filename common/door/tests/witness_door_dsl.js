#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DSL (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.4 tier 2, §0.7). READ THE §-LOG after every run. G4 parts are real runs (Modeller headless).
 * ISSUE: a composed verb is a second, different answer, and a decimal that drifts. Each claim:
 *   L1 exact decimals: 0.1+0.2 = 0.3 where JS floating point gives 0.30000000000000004; (1.1*3)-3.3 = 0; 1/3 carries 30 digits; precedence, parentheses, unary minus
 *   L2 a field path the producing verb does not declare is refused (lines.model.rotation); a declared path on a missing id is refused; text in arithmetic is refused
 *   L3 a composed verb whose declared harm is lower than its lines, or that calls itself, does not load
 *   L4 G4: modeller.widen_bay HospitalGarage gx5 gx6 13 gives the SAME stop as `edit_cli --shift gx6 --move 1.824` directly (answer byte for byte but ms), the bay was READ (11.176)
 *       not typed, and every body line went through the door (request ids <parent>.1, <parent>.2 in the journal)
 *   L5 a body stops at its first line that is not ok (nothing after it runs)
 * Falsifiers: DOOR_BREAK=float must fail L1; DOOR_BREAK=halve must fail L1 and L4.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { kit, tmp, run, stripMs, ROOT } = require('./_kit');
const D = require('../door.js');
const k = kit('W-DSL'), EDIT = path.join(ROOT, 'modeller', 'tools', 'edit_cli.js'), INSTR = ['--own-grid', '--lattice-boxes'], STUB = path.join(__dirname, 'stub_cli.js');
const ev = (s, sc) => { try { return D.evalExpr(s, sc || new Map()).toString(); } catch (e) { return 'ERR ' + e.message; } };
(async () => {
  const cases = [['0.1+0.2', '0.3'], ['(1.1*3)-3.3', '0'], ['1/3', '0.333333333333333333333333333333'], ['2+3*4', '14'], ['(2+3)*4', '20'], ['-2*(3+4)', '-14'], ['13-11.176', '1.824'], ['10/4', '2.5'], ['0.07*100', '7']];
  const res = cases.map(([e, want]) => [e, ev(e), want]);
  res.forEach(([e, got, want]) => k.chk('L1 {' + e + '} = ' + want, got === want, 'got=' + got));
  k.L('float contrast: JS 0.1+0.2 = ' + (0.1 + 0.2) + ' ; (1.1*3)-3.3 = ' + ((1.1 * 3) - 3.3) + ' ; the door says ' + ev('0.1+0.2') + ' and ' + ev('(1.1*3)-3.3'));
  if (!(0.1 + 0.2 !== 0.3)) k.incon('L1', 'this JS engine does not show the float drift, so the contrast proves nothing');
  const door = D.createDoor({ journal: tmp('dsl_j_'), say: () => {} });
  const sc = new Map([['lines', { kind: 'result', verb: 'modeller.lines', verbEntry: door.vocab.byVerb.get('modeller.lines'), answer: { model: { rotation_deg: 0, lines: [{ id: 'gx5', pos: 12.5 }, { id: 'gx6', pos: 24.176 }] } } }], ['to', { kind: 'input', value: 'gx6' }], ['from', { kind: 'input', value: 'gx5' }]]);
  k.chk('L2a a declared path on the result is read, exactly (24.176 - 12.5 = 11.676)', ev('lines.model.lines[to].pos - lines.model.lines[from].pos', sc) === '11.676', ev('lines.model.lines[to].pos - lines.model.lines[from].pos', sc));
  k.chk('L2b a path the verb does not declare is refused (lines.model.rotation_deg is in the answer but not in returns.fields... declared? ' + (door.vocab.byVerb.get('modeller.lines').returns.fields.some(f => f.path === 'model.rotation_deg')) + ') and an undeclared one is', /not declared/.test(ev('lines.model.system', sc)) && /not declared/.test(ev('lines.model.lines[to].world', sc)), ev('lines.model.system', sc));
  k.chk('L2c a declared path on an id that is not there is refused', /no element with id gx9/.test(ev('lines.model.lines[gx9].pos', sc)), ev('lines.model.lines[gx9].pos', sc));
  k.chk('L2d text in arithmetic and an unknown name are refused', /text, not a number/.test(ev('to + 1', sc)) && /not an input or a named result/.test(ev('nothing + 1', sc)), ev('to + 1', sc));
  k.chk('L2e division by zero is refused', /division by zero/.test(ev('1/0')), ev('1/0'));
  // L3
  const raw = JSON.parse(JSON.stringify(door.vocab.raw)), mk = (f) => { const r = JSON.parse(JSON.stringify(raw)); f(r); return () => D.createDoor({ journal: tmp('dsl_j3_'), say: () => {}, vocab: { verbs: r.verbs, byVerb: new Map(r.verbs.map(e => [e.verb, e])), raw: r } }); };
  const widen = (r) => r.verbs.filter(e => e.verb === 'modeller.widen_bay')[0];
  const t1 = (() => { try { mk(r => { widen(r).harm = 'read'; })(); return 'loaded'; } catch (e) { return e.message; } })(), t2 = (() => { try { mk(r => { widen(r).body.push('modeller.widen_bay building={building} from={from} to={to} target={target}'); })(); return 'loaded'; } catch (e) { return e.message; } })(), t3 = (() => { try { mk(r => { widen(r).body[1] = 'modeller.try_shift building={building} line={to} mov={target}'; })(); return 'loaded'; } catch (e) { return e.message; } })();
  k.chk('L3 harm below the lines, a self-call, and an unknown input in a body each refuse to load', /declares harm read but its lines reach trial/.test(t1) && /calls itself/.test(t2) && /unknown input mov/.test(t3), [t1, t2, t3].map(s => s.slice(0, 60)).join(' | '));
  // L5: stop at first non-ok (stub engine: lines answers ok but lacks the bay -> the second line must never run)
  const cnt = tmp('dsl_cnt_'); process.env.STUB_COUNT = cnt;
  const pr = JSON.parse(JSON.stringify(raw)); pr.verbs.push({ verb: 'x.two', app: 'modeller', title: 'planted', description: 'planted', inputs: [{ name: 'building', type: 'building', required: true, description: 'b' }], harm: 'trial', actors: ['human', 'ai'], returns: { fields: [] }, witness: 'common/door/tests/witness_door_dsl.js', body: ['modeller.try_shift building={building} line=gx6 move=abc', 'modeller.lines building={building}'] });
  const d5 = D.createDoor({ journal: tmp('dsl_j5_'), say: () => {}, cli: { edit_cli: STUB }, vocab: { verbs: pr.verbs, byVerb: new Map(pr.verbs.map(e => [e.verb, e])), raw: pr } }), e5 = await d5.runLine('x.two building=HospitalGarage', { actor: 'human' });
  k.chk('L5a the body stops at its first line that is not ok: line 1 is a bad shape, line 2 never ran, nothing was spawned', e5.status === 'error' && e5.answer.lines.length === 1 && d5.spawned === 0 && /^line 1 /.test(e5.why), 'status=' + e5.status + ' lines=' + e5.answer.lines.length + ' spawns=' + d5.spawned + ' why=' + String(e5.why).slice(0, 70));
  const d6 = D.createDoor({ journal: tmp('dsl_j6_'), say: () => {}, cli: { edit_cli: STUB } }), e6 = await d6.runLine('modeller.widen_bay building=HospitalGarage from=gx5 to=gx6 target=13', { actor: 'human' });
  k.chk('L5b an answer that lacks the declared field stops the body at line 2 with the reason, instead of a guessed number (stub engine returns no grid)', e6.status === 'error' && d6.spawned === 1 && /line 2/.test(e6.why) && /no model/.test(e6.why), 'status=' + e6.status + ' spawns=' + d6.spawned + ' why=' + String(e6.why).slice(0, 80));
  // L4: G4, real
  const J = tmp('dsl_j4_'), d4 = D.createDoor({ journal: J, say: (s) => console.log('§DOOR ' + s) });
  const [comp, dLines, dShift] = await Promise.all([d4.runLine('modeller.widen_bay building=HospitalGarage from=gx5 to=gx6 target=13', { actor: 'human', request: 'W-1' }), run(EDIT, ['--building', 'HospitalGarage', '--lines'].concat(INSTR)), run(EDIT, ['--building', 'HospitalGarage', '--shift', 'gx6', '--move', '1.824'].concat(INSTR))]);
  const lj = JSON.parse(dLines.out), pos = (id) => lj.model.lines.filter(l => l.id === id)[0].pos, bay = +(pos('gx6') - pos('gx5')).toFixed(3);
  const l1 = comp.answer && comp.answer.lines && comp.answer.lines[0], l2 = comp.answer && comp.answer.lines && comp.answer.lines[1], e0 = l2 && l2.envelope.answer.edits[0];
  const ol = e0 && e0.report ? ((e0.report.rows.filter(r => r.id === 'span_red')[0] || {}).over_limit_changed || []).filter(o => o.bay === 'gx5-gx6')[0] : null;
  k.L('G4 composed: status=' + comp.status + ' bay(read)=' + bay + ' line2 move arg=' + (l2 && l2.line.slice(-60)) + ' stopped=' + !!(e0 && e0.stopped_by_gate) + ' after=' + (ol && ol.after) + ' reason=' + (e0 && e0.reason));
  k.chk('L4a the bay came from reading the grid (11.176), not from typing 1.824', bay === 11.176 && l1 && l1.envelope.status === 'ok' && l1.envelope.verb === 'modeller.lines', 'bay=' + bay);
  k.chk('L4b the composed verb\'s try_shift answer = edit_cli --shift gx6 --move 1.824 directly, byte for byte but ms', !!l2 && stripMs(JSON.stringify(l2.envelope.answer)) === stripMs(dShift.out) && dShift.code === 3, 'bytes=' + dShift.out.length);
  k.chk('L4c the same stop: status refused, stopped_by_gate, the span check measures 13 m, why names line 2', comp.status === 'refused' && !!e0 && e0.stopped_by_gate === true && /newly over the limit/.test(e0.reason) && !!ol && Math.abs(ol.after - 13) <= 0.0015 && /^line 2 \(modeller\.try_shift\)/.test(comp.why), 'after=' + (ol && ol.after));
  const rows = fs.readFileSync(J, 'utf8').trim().split('\n').map(l => JSON.parse(l)), ids = rows.filter(r => r.state === 'done').map(r => r.request).sort().join(',');
  k.chk('L4d every body line went through the door: journal has W-1, W-1.1, W-1.2, each started before done', ids === 'W-1,W-1.1,W-1.2' && ['W-1', 'W-1.1', 'W-1.2'].every(id => rows.findIndex(r => r.request === id && r.state === 'started') < rows.findIndex(r => r.request === id && r.state === 'done')), 'done=' + ids);
  k.end();
})().catch(e => { console.log('§WITNESS_DSL verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
