// ⚠ DO NOT REMOVE — W-RED1-ACT (bim-compiler prompts/CLI_ERP_IVR.md §46: a document action as a person reads it; the offers follow the record). READ THE LOG; an exit code is not evidence.
//   A1 ISSUE (`do RE` / `do CO` print the engine's whole answer as JSON, ~80 terminal rows of `ops: [...]`): a piped `cd Order 100` then `do RE` prints the summary line
//      `Re-activate: done · Order 80000 CO → IP (In Progress)`, a `related:` line whose counts are the ones an INDEPENDENT door run of the same line answers (`related`, a second scratch op-log),
//      the `it may do:` codes that run's `actions` holds, and no `ops:` / `document:` JSON row. Falsifier ERP_BREAK=nosummary (must FAIL A1).
//   A3 ISSUE (Tab after `do ` lists the word's code order, VO CL RE, not the record's CL VO RE = the ERP window's button order): pure core, a record with actions [CL, VO, RE] offers codes in that order.
//      Falsifier WORDS_BREAK=codeorder (must FAIL A3).
//   A4 ISSUE (after `do RE` the record still offers CL, VO, RE, so typing `do CO` drew "▸ CL (close)"): pure core, a `ran` answer for the SAME id with actions [CO, PR, VO] makes the offers CO, PR, VO;
//      a `ran` answer for ANOTHER id leaves them. Falsifier WORDS_BREAK=staleacts (must FAIL A4).
//   (A2, the grey suggestion erased on Return, needs a terminal: W-RED1-ASSIST A9.) A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_red1_act.js > common/door/tests/logs/red1_act.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-ACT'), DOORDIR = path.join(ROOT, 'common/door'), RED1 = path.join(DOORDIR, 'red1.js');
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1act_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off' }; };
const spawn = (argv, env, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 280000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const door = (line, env) => { const r = spawn([DOOR, '--actor', 'human', line], env), j = r.out.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).pop(); return j || { status: 'unparseable', why: (r.out + r.err).slice(-300) }; };
// ── A1: the shell's screen against an independent run of the same door line ──
{
  const S = spawn([RED1], fresh(), ['cd Order 100', 'do RE', 'exit'].join('\n') + '\n'), L = S.out.split('\n');
  const ind = door('erp.reactivate kind=Order id=100', fresh()), A = ind.answer || {};
  if (ind.status !== 'ok' || !Array.isArray(A.related)) k.incon('A1', 'the independent run did not answer ok with related documents: ' + ind.status + ' ' + String(ind.why || '').slice(0, 200));
  else {
    const want = A.related.map(x => { const c = {}; x.rows.forEach(rw => { c[rw.docStatus] = (c[rw.docStatus] || 0) + 1; }); return x.kind + ' ' + x.rows.length + ' (' + Object.keys(c).map(s => s + ' ' + c[s]).join(', ') + ')'; }).join(' · ');
    const head = L.find(l => /^Re-activate: done · /.test(l)) || '', rel = L.find(l => /^ {2}related: /.test(l)) || '', may = L.find(l => / change\(s\) kept · it may do: /.test(l)) || '';
    const json = L.filter(l => /^(ops|document|opSummary|engine|before|after): /.test(l));
    k.L('A1 head=' + JSON.stringify(head) + ' related=' + JSON.stringify(rel) + ' want=' + JSON.stringify(want) + ' may=' + JSON.stringify(may) + ' independent actions=' + JSON.stringify(A.actions) + ' json_rows=' + json.length + ' screen_rows=' + L.length);
    k.chk('A1 `do RE` in order 100 prints "Re-activate: done · Order 80000 CO → IP (In Progress)", the related counts of an independent run (' + want + '), its next actions, and no JSON row',
      /^Re-activate: done · Order 80000 CO → IP \(In Progress\)/.test(head) && rel === '  related: ' + want && may.endsWith('it may do: ' + (A.actions || []).join(', ')) && json.length === 0 && want.length > 0, head + ' | ' + rel + ' | json rows ' + json.length);
  }
}
// ── A3 + A4: the pure core ──
{
  const D = require(path.join(DOORDIR, 'door.js')), vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(DOORDIR, 'vocab/words.json'), 'utf8'));
  const msg = require(path.join(DOORDIR, 'msg_core.js')).create(JSON.parse(fs.readFileSync(path.join(DOORDIR, 'vocab/messages.json'), 'utf8')));
  const core = require(path.join(DOORDIR, 'words_core.js')).create({ vocab, words, msg, tokenize: D.tokenize, pickColumns: require(path.join(DOORDIR, 'mis_core.js')).pickColumns, buildings: [], brk: process.env.WORDS_BREAK || '' });
  const verbNames = vocab.verbs.map(v => v.verb), wordNames = Object.keys(words.words);
  const st0 = () => Object.assign(core.init(), { erp: 'Order', ekey: 'C_Order_ID', rec: { id: 100, label: '80000', number: '80000', actions: ['CL', 'VO', 'RE'] }, ecolumns: ['DocumentNo'], etabs: [], eprops: [] });
  const codes = (st) => Object.keys(core.offered(st, wordNames, verbNames).codes || {});
  const c3 = codes(st0());
  k.L('A3 record actions=["CL","VO","RE"] offered codes=' + JSON.stringify(c3));
  k.chk('A3 in a record the `do` codes are offered in the record\'s own order (CL, VO, RE), not the word\'s', JSON.stringify(c3) === JSON.stringify(['CL', 'VO', 'RE']), c3.join(','));
  const ran = (st, id, acts) => core.step(st, { result: { purpose: 'ran', envelope: { status: 'ok', verb: 'erp.reactivate', answer: { document: { kind: 'Order', id }, actions: acts } } } }).state;
  const same = codes(ran(st0(), 100, ['CO', 'PR', 'VO'])), other = codes(ran(st0(), 1300100, ['CO', 'PR', 'VO']));
  k.L('A4 after a ran answer for id 100 offered=' + JSON.stringify(same) + ' · for id 1300100 offered=' + JSON.stringify(other));
  k.chk('A4 after `do RE` answers for THIS record (actions CO, PR, VO) the offers are CO, PR, VO; an answer for another record leaves CL, VO, RE',
    JSON.stringify(same) === JSON.stringify(['CO', 'PR', 'VO']) && JSON.stringify(other) === JSON.stringify(['CL', 'VO', 'RE']), same.join(',') + ' | ' + other.join(','));
}
k.end();
