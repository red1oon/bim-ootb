// ⚠ DO NOT REMOVE — W-ERP-VERBS-DOOR (NEURO lane B: §21.5 A1, A2; the vocabulary checks). READ THE LOG; an exit code is not evidence.
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md, lane B SPEC (lane file scratchpad/lanes/B.md until folded in). A5 (legacy parity of erp.complete) is scripts/bridge/witness_erp_complete_parity.js
// in bim-compiler (needs the legacy pilot); its log is common/door/tests/logs/a5_erp_complete_parity.log. This file needs no pilot.
//   A1 ISSUE (an actor changes the result): the same erp line by human, ai and an unproven actor gives the same envelope (read verbs byte for byte apart from request/actor/ms); a POST by an ai is
//        held as a claim, the engine is not reached (op-log unchanged, the document still Drafted), and the same line by the person then runs. Falsifier ERP_BREAK=actor (+ERP_ACTOR=ai on the ai run).
//   A2 ISSUE (a role without the grant gets round the gate): for a role whose Document Action Access lacks Complete, erp.actions omits CO for every actor alike and erp.complete is refused with the
//        same reason, writing nothing; the granted role completes. Falsifier ERP_BREAK=norole must FAIL it.
//   N  ISSUE (a record named by its number is not the record named by its id; NEURO §R.V.1): N1-N7 below, each line names its own issue. Falsifiers ERP_BREAK=firstmatch (must fail N4), ERP_BREAK=neighbour (must fail N1, N2, N7).
//   V  ISSUE (a vocabulary that decays): the erp.* entries equal what scripts/gen_erp_door_verbs.js writes from the dictionary (generated, not hand-kept), erp.complete is harm posts, the connector
//        lists no erp verb, and no erp entry names code, SQL or a shell.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { kit, tmp, run, stripMs, ROOT, DOOR } = require('./_kit');
const k = kit('W-ERP-VERBS-DOOR');
(async () => {
  const dir = path.dirname(tmp('erp_')), oplog = path.join(dir, 'twin.ops.jsonl'), journal = path.join(dir, 'journal.jsonl');
  const env0 = { BIM_OBJECT_OPLOG: oplog, BIM_DOOR_JOURNAL: journal };
  const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const door = (line, actor, env) => run(DOOR, ['--actor', actor || 'human', line], Object.assign({}, env0, env || {})).then(r => { let j = null; try { j = JSON.parse(r.out); } catch (e) { /* null */ } return Object.assign(r, { j }); });
  const norm = (j) => { const c = JSON.parse(JSON.stringify(j)); delete c.ms; delete c.request; delete c.actor; return JSON.stringify(c); };
  const EC = require(path.join(ROOT, 'common/door/erp_cli.js')), DR = require('./erp_draft.js');
  if (!fs.existsSync(path.join(ROOT, 'erp/ad_seed.db'))) { k.incon('seed', 'erp/ad_seed.db missing: nothing can be judged'); return k.end(); }
  const D1 = await DR.draftOrder({ oplog }, {}), D2 = await DR.draftOrder({ oplog }, {});
  k.L('drafts D1=' + D1.number + ' D2=' + D2.number + ' status=' + D1.docStatus + '/' + D2.docStatus + ' oplog_ops=' + nops());
  if (D1.docStatus !== 'DR' || D2.docStatus !== 'DR') { k.incon('draft', 'the drafts are not Drafted; nothing can be judged'); return k.end(); }
  const AIENV = process.env.ERP_BREAK === 'actor' ? { ERP_ACTOR: 'ai' } : {};

  // ── A1: reads ──
  const f = {}; for (const a of ['human', 'ai']) f[a] = await door('erp.find kind=Order number=' + D1.number, a, a === 'ai' ? AIENV : {});
  k.chk('A1a find: ok for human and ai (read verbs need no proof; the vocabulary lists human and ai as the actors of these verbs, an unlisted actor is refused by name)', ['human', 'ai'].every(a => f[a].j && f[a].j.status === 'ok'), ['human', 'ai'].map(a => a + '=' + (f[a].j && f[a].j.status)).join(' '));
  k.chk('A1b find: the same envelope for every actor (apart from request/actor/ms)', norm(f.human.j) === norm(f.ai.j), 'matches=' + (f.human.j && f.human.j.answer.matches.length) + ' id=' + (f.human.j && f.human.j.answer.matches[0].id));
  const ac = {}; for (const a of ['human', 'ai']) ac[a] = await door('erp.actions kind=Order number=' + D1.number, a, a === 'ai' ? AIENV : {});
  k.chk('A1c actions: ok for every actor and the same envelope, bytes and `next` included', ['human', 'ai'].every(a => ac[a].j && ac[a].j.status === 'ok') && norm(ac.human.j) === norm(ac.ai.j),
    'actions=' + JSON.stringify(ac.human.j && ac.human.j.answer.actions) + ' next=' + JSON.stringify(ac.human.j && ac.human.j.next));
  k.chk('A1d actions: the engine\'s own legal set for a Drafted order is offered, Complete first (DocumentEngine.getValidActions)', JSON.stringify(ac.human.j.answer.actions) === JSON.stringify(['CO', 'PR', 'VO']) && JSON.stringify(ac.human.j.next) === JSON.stringify(['CO', 'PR', 'VO']));
  // ── A1: the post ──
  const before = nops();
  const cai = await door('erp.complete kind=Order number=' + D1.number, 'ai', AIENV), cem = await door('erp.complete kind=Order number=' + D1.number, 'email');
  k.chk('A1e complete by an ai is HELD as a claim (§0.6 detail 4), not run', cai.j && cai.j.status === 'claim' && /Held as a claim/.test(cai.j.why || ''), 'status=' + (cai.j && cai.j.status) + ' why=' + String(cai.j && cai.j.why).slice(0, 90));
  k.chk('A1f ...and so is the unproven actor\'s (email, not built: proof none): a claim, nothing run', cem.j && cem.j.status === 'claim' && cai.j.status === cem.j.status && nops() === before);
  const er = await door('erp.find kind=Order number=' + D1.number, 'email');
  k.chk('A1f2 an actor the vocabulary does not list reads nothing: refused by name (the email actor is a later rung)', er.j && er.j.status === 'refused' && /not allowed to use erp.find/.test(er.j.why), String(er.j && er.j.why).slice(0, 80));
  k.chk('A1g a claim reaches no engine: op-log unchanged, the document is still Drafted', nops() === before && JSON.parse((await door('erp.actions kind=Order number=' + D1.number)).out).answer.docStatus === 'DR', 'ops ' + before + ' -> ' + nops());
  const ch = await door('erp.complete kind=Order number=' + D1.number, 'human');
  k.chk('A1h the same line by the person runs: ok, Drafted -> Completed, ops written', ch.j && ch.j.status === 'ok' && ch.j.answer.before.docStatus === 'DR' && ch.j.answer.after.docStatus === 'CO' && ch.j.ops.length > 0 && nops() > before, 'ops=' + (ch.j && ch.j.ops.length) + ' next=' + JSON.stringify(ch.j && ch.j.next));
  const again = await door('erp.complete kind=Order number=' + D1.number, 'human');
  k.chk('A1i completing a Completed order is refused by the engine\'s own rule (nothing written)', again.j && again.j.status === 'refused' && /Invalid Actions/.test(again.j.why), String(again.j && again.j.why).slice(0, 110));
  // ── A2 ──
  const D = D2.number, ROLE_NO = '50004', ROLE_OK = '102';
  const rno = {}; for (const a of ['human', 'ai']) rno[a] = await door('erp.actions kind=Order number=' + D + ' role=' + ROLE_NO, a);
  k.chk('A2a role ' + ROLE_NO + ' (no Document Action Access rows): Complete is not offered, identically for human and ai', ['human', 'ai'].every(a => rno[a].j && rno[a].j.status === 'ok' && rno[a].j.answer.actions.indexOf('CO') < 0) && norm(rno.human.j) === norm(rno.ai.j), 'offered=' + JSON.stringify(rno.human.j && rno.human.j.answer.actions) + ' removed=' + JSON.stringify(rno.human.j && rno.human.j.answer.role && rno.human.j.answer.role.removed));
  const rok = await door('erp.actions kind=Order number=' + D + ' role=' + ROLE_OK);
  k.chk('A2b control: role ' + ROLE_OK + ' (granted) is offered Complete', rok.j && rok.j.status === 'ok' && rok.j.answer.actions.indexOf('CO') >= 0, 'offered=' + JSON.stringify(rok.j && rok.j.answer.actions));
  const b2 = nops();
  const cno = await door('erp.complete kind=Order number=' + D + ' role=' + ROLE_NO, 'human'), cnoAi = await door('erp.complete kind=Order number=' + D + ' role=' + ROLE_NO, 'ai');
  k.chk('A2c complete with the ungranted role is REFUSED by the engine with the rule named, nothing written', cno.j && cno.j.status === 'refused' && /not offered to role 50004/.test(cno.j.why || '') && nops() === b2, 'why=' + String(cno.j && cno.j.why).slice(0, 120));
  k.chk('A2d the same line by an ai gets no way round: held as a claim, nothing written (the person\'s confirmation would get A2c\'s refusal)', cnoAi.j && cnoAi.j.status === 'claim' && nops() === b2);
  const cok = await door('erp.complete kind=Order number=' + D + ' role=' + ROLE_OK, 'human');
  k.chk('A2e control: the granted role completes the same document', cok.j && cok.j.status === 'ok' && cok.j.answer.after.docStatus === 'CO', 'status=' + (cok.j && cok.j.status));

  // ── R: void, close, reverse (follow-up 2). Legacy facts: DocumentEngine ACTION_Void VO / ACTION_Close CL / ACTION_Reverse_Correct RC; MOrder.voidIt :2680 (qty and net 0, "Voided (old)", Processed Y, DocAction --),
  //    MOrder.closeIt :2881 (QtyLostSales = ordered - delivered, QtyOrdered := delivered, "Close (old)"), MOrder.reverseCorrectIt :3003 (= voidIt, status Reversed). Their equality with legacy is A5's job (pilot); this
  //    file proves the door side: the right action runs, the gates hold, nothing else is done. ──
  const rows = async (sql, p) => { const O = await EC.boot({ oplog }); return O.rows(sql, p); };
  const mk = async () => { const d = await DR.draftOrder({ oplog }, {}); const c = await door('erp.complete kind=Order number=' + d.number, 'human'); return Object.assign(d, { completed: c.j && c.j.status === 'ok' && c.j.answer.after.docStatus === 'CO' }); };
  const D3 = await mk();
  k.chk('R0 setup: a Completed order', D3.completed, D3.number);
  const acR = await door('erp.actions kind=Order number=' + D3.number);
  k.chk('R1 a Completed order is offered Void by the engine (DocumentEngine.getValidActions)', acR.j.answer.actions.indexOf('VO') >= 0, 'actions=' + JSON.stringify(acR.j.answer.actions));
  const b3 = nops();
  const vAi = await door('erp.void kind=Order number=' + D3.number, 'ai', AIENV);
  k.chk('R2 void by an ai is HELD as claims (the engine is not reached: op-log unchanged, order still Completed)', vAi.j && vAi.j.status === 'claim' && nops() === b3 && (await rows('SELECT docstatus FROM c_order WHERE c_order_id=?', [D3.id]))[0].docstatus === 'CO', vAi.j && vAi.j.status + ' ops ' + b3 + '->' + nops());
  const vH = await door('erp.void kind=Order number=' + D3.number, 'human');
  const o3 = (await rows('SELECT docstatus, docaction, totallines, grandtotal, processed FROM c_order WHERE c_order_id=?', [D3.id]))[0], l3 = await rows('SELECT qtyordered, linenetamt, description FROM c_orderline WHERE c_order_id=?', [D3.id]);
  k.chk('R3 void by the person: CO -> VO; total and grand total 0; every line qty 0, net 0 and described "Voided (old qty)" (MOrder.voidIt); Processed Y, DocAction --', vH.j && vH.j.status === 'ok' && vH.j.answer.after.docStatus === 'VO' && o3.docstatus === 'VO' && Number(o3.totallines) === 0 && Number(o3.grandtotal) === 0 && o3.docaction === '--' && o3.processed === 'Y' && l3.every(l => Number(l.qtyordered) === 0 && Number(l.linenetamt) === 0 && /Voided \(2\)/.test(l.description || '')), 'order=' + JSON.stringify(o3) + ' line0=' + JSON.stringify(l3[0]));
  const vAgain = await door('erp.void kind=Order number=' + D3.number, 'human');
  k.chk('R4 voiding a Voided order is refused by the engine\'s rule, naming the action (nothing written)', vAgain.j && vAgain.j.status === 'refused' && /Void was not done|not offered/.test(vAgain.j.why || ''), String(vAgain.j && vAgain.j.why).slice(0, 120));
  const D4 = await mk(), cH = await door('erp.close kind=Order number=' + D4.number, 'human'), cAi = await door('erp.close kind=Order number=' + D4.number, 'ai', AIENV);
  const o4 = (await rows('SELECT docstatus, docaction, processed FROM c_order WHERE c_order_id=?', [D4.id]))[0], l4 = await rows('SELECT qtyordered, qtydelivered, qtylostsales, description FROM c_orderline WHERE c_order_id=?', [D4.id]);
  k.chk('R5 close: an ai\'s call is a claim; the person\'s runs CO -> CL; the not-delivered quantity is cancelled: QtyLostSales = ordered - delivered (2), QtyOrdered := QtyDelivered (0), described "Close (2)", Processed Y, DocAction -- (MOrder.closeIt)', cAi.j && cAi.j.status === 'claim' && cH.j && cH.j.status === 'ok' && cH.j.answer.after.docStatus === 'CL' && o4.docstatus === 'CL' && o4.processed === 'Y' && o4.docaction === '--' && l4.every(l => Number(l.qtyordered) === Number(l.qtydelivered) && Number(l.qtylostsales) === 2 && /Close \(2\)/.test(l.description || '')), 'order=' + JSON.stringify(o4) + ' line0=' + JSON.stringify(l4[0]) + ' why=' + (cH.j && cH.j.why));
  const D5 = await mk(), rAi = await door('erp.reverse kind=Order number=' + D5.number, 'ai', AIENV), rH = await door('erp.reverse kind=Order number=' + D5.number, 'human');
  const o5 = (await rows('SELECT docstatus, docaction, totallines FROM c_order WHERE c_order_id=?', [D5.id]))[0];
  k.chk('R6 reverse: an ai\'s call is a claim; the person\'s runs CO -> RE (Reversed), amounts 0, DocAction -- (MOrder.reverseCorrectIt = voidIt, then status RE; DocumentEngine ACTION_Reverse_Correct)', rAi.j && rAi.j.status === 'claim' && rH.j && rH.j.status === 'ok' && rH.j.answer.after.docStatus === 'RE' && o5.docstatus === 'RE' && Number(o5.totallines) === 0 && o5.docaction === '--', JSON.stringify(o5) + ' why=' + (rH.j && rH.j.why));
  const dd = await DR.draftOrder({ oplog }, {}), vd = await door('erp.void kind=Order number=' + dd.number, 'human');
  k.chk('R9 a Drafted order can be voided (DocumentEngine options for DR include Void): DR -> VO', vd.j && vd.j.status === 'ok' && vd.j.answer.after.docStatus === 'VO', 'status=' + (vd.j && vd.j.status) + ' ' + (vd.j && vd.j.why));

  // ── N: a record by its number, one resolver (NEURO §R.V.1) ──
  const ans = (r) => JSON.stringify(r.j && r.j.answer);
  const DN = await DR.draftOrder({ oplog }, {});
  const rI = await door('erp.read kind=Order id=' + DN.id), rN = await door('erp.read kind=Order number=' + DN.number);
  k.chk('N1 erp.read by number = by id, the whole answer (a number must not read another record)', rI.j && rN.j && rI.j.status === 'ok' && rN.j.status === 'ok' && ans(rI) === ans(rN) && String(rN.j.answer.record.documentno) === String(DN.number), 'status=' + (rN.j && rN.j.status) + ' ' + String(rN.j && rN.j.why || '').slice(0, 90) + ' bytes=' + ans(rI).length + '/' + ans(rN).length);
  const aI = await door('erp.actions kind=Order id=' + DN.id), aN = await door('erp.actions kind=Order number=' + DN.number);
  k.chk('N2 erp.actions by id = by number, the whole answer', aI.j && aN.j && aI.j.status === 'ok' && ans(aI) === ans(aN), 'actions=' + JSON.stringify(aN.j && aN.j.answer && aN.j.answer.actions));
  const sig = (r) => JSON.stringify(r.j && r.j.answer && { before: r.j.answer.before, after: r.j.answer.after, opSummary: r.j.answer.opSummary, facts: r.j.answer.facts, actions: r.j.answer.actions });
  const pair = async (verb, completed) => { const out = []; for (const how of ['id', 'number']) { const d = completed ? await mk() : await DR.draftOrder({ oplog }, {}); const r = await door('erp.' + verb + ' kind=Order ' + how + '=' + (how === 'id' ? d.id : d.number), 'human'); out.push(Object.assign(r, { d })); } return out; };
  const n3 = []; for (const [verb, completed, to] of [['complete', false, 'CO'], ['void', true, 'VO'], ['close', true, 'CL'], ['reverse', true, 'RE']]) {
    const [bi, bn] = await pair(verb, completed), ok = bi.j && bn.j && bi.j.status === 'ok' && bn.j.status === 'ok' && bi.j.answer.after.docStatus === to && sig(bi) === sig(bn) && String(bi.j.answer.document.id) === String(bi.d.id) && String(bn.j.answer.document.id) === String(bn.d.id);
    n3.push(verb + ':' + (ok ? 'same' : 'DIFF(' + (bi.j && bi.j.status) + '/' + (bn.j && bn.j.status) + ')') + '->' + (bn.j && bn.j.answer && bn.j.answer.after && bn.j.answer.after.docStatus));
  }
  k.chk('N3 each action by id and by number (twin documents, same facts) gives the same before, after, op summary, books and offered actions, on the document named', n3.every(x => /:same/.test(x)), n3.join(' '));
  const dupSql = spawnSync('sqlite3', ['-readonly', path.join(ROOT, 'erp/ad_seed.db'), "SELECT group_concat(c_order_id, ', ') FROM (SELECT c_order_id FROM c_order WHERE documentno='60000' ORDER BY c_order_id)"], { encoding: 'utf8' }).stdout.trim();
  if (dupSql.split(', ').length < 2) k.incon('N4', 'the seed no longer holds two Orders numbered 60000 (' + dupSql + '): ambiguity cannot be judged');
  else {
    const b4 = nops(), amb = []; for (const l of ['erp.read kind=Order number=60000', 'erp.actions kind=Order number=60000', 'erp.complete kind=Order number=60000']) amb.push(await door(l, 'human'));
    k.chk('N4 a number two records carry (the seed\'s own Order 60000) is refused by read, actions and complete, naming every id, and nothing is written', amb.every(r => r.j && r.j.status === 'refused' && r.j.why.indexOf('(ids ' + dupSql + ')') >= 0) && nops() === b4, amb.map(r => r.j && r.j.status).join('/') + ' ids=' + dupSql + ' why=' + String(amb[0].j && amb[0].j.why).slice(0, 90) + ' ops ' + b4 + '->' + nops());
    const one = await door('erp.read kind=Order id=' + dupSql.split(', ')[1]);
    k.chk('N4b ...and each of them is still readable by its id', one.j && one.j.status === 'ok' && String(one.j.answer.record.documentno) === '60000');
  }
  const rMiss = await door('erp.read kind=Order number=NO-SUCH-NUMBER');
  k.chk('N5 erp.read of a number that does not exist is a refusal naming it, not an empty ok', rMiss.j && rMiss.j.status === 'refused' && /no Order with number NO-SUCH-NUMBER/.test(rMiss.j.why), String(rMiss.j && rMiss.j.why).slice(0, 80));
  const two = await door('erp.read kind=Order id=' + DN.id + ' number=' + D1.number), same = await door('erp.read kind=Order id=' + DN.id + ' number=' + DN.number);
  k.chk('N6 an id of one document with the number of another is refused naming both; the id with its own number reads', two.j && two.j.status === 'refused' && /two different records/.test(two.j.why) && two.j.why.indexOf(String(DN.number)) >= 0 && two.j.why.indexOf(String(D1.number)) >= 0 && same.j && same.j.status === 'ok' && ans(same) === ans(rI), String(two.j && two.j.why).slice(0, 110));
  const pSql = spawnSync('sqlite3', ['-readonly', path.join(ROOT, 'erp/ad_seed.db'), "SELECT group_concat(m_warehouse_id) FROM m_warehouse WHERE name='HQ Warehouse'"], { encoding: 'utf8' }).stdout.trim();
  if (!/^\d+$/.test(pSql)) k.incon('N7', 'the seed does not hold exactly one Warehouse named "HQ Warehouse" (' + pSql + ')');
  else {
    const pI = await door('erp.read kind=M_Warehouse id=' + pSql), pN = await door('erp.read kind=M_Warehouse number="HQ Warehouse"'), cN = await door('erp.read kind=Currency number=USD');
    k.chk('N7 a master record reads by its number too (Warehouse by its Name, quoted, = by its id); a kind with no DocumentNo, Name or Value column refuses a number, saying why', pI.j && pN.j && pI.j.status === 'ok' && ans(pI) === ans(pN) && pN.j.answer.record.name === 'HQ Warehouse' && cN.j && cN.j.status === 'refused' && /no DocumentNo, Name or Value column/.test(cN.j.why), 'warehouse id=' + pSql + ' ' + (pN.j && pN.j.status) + ' ' + String(pN.j && pN.j.why || '').slice(0, 60) + ' currency=' + String(cN.j && cN.j.why).slice(0, 70));
  }
  // ── find ──
  const nf = await door('erp.find kind=Order number=NO-SUCH-NUMBER');
  k.chk('Fa find: a number that does not exist is a refusal that says so, not an empty ok', nf.j && nf.j.status === 'refused' && /no Order with documentno NO-SUCH-NUMBER/.test(nf.j.why));
  const nd = await door('erp.find kind=Currency number=USD');
  k.chk('Fb find: a table that is not a document is refused by name (the dictionary decides what a document is)', nd.j && nd.j.status === 'refused' && /not a document/.test(nd.j.why), String(nd.j && nd.j.why).slice(0, 100));
  // ── the generic object layer over ERP tables ──
  const ds = await door('erp.describe kind=Order'), cnt = spawnSync('sqlite3', ['-readonly', path.join(ROOT, 'erp/ad_seed.db'), "SELECT count(*) FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Order' AND c.isactive='Y'"], { encoding: 'utf8' }).stdout.trim();
  k.chk('O1 erp.describe: reflection lists exactly the dictionary\'s active AD_Column rows of the kind (independent SQL count)', ds.j && ds.j.status === 'ok' && String(ds.j.answer.properties.length) === cnt && ds.j.answer.table === 'C_Order', 'properties=' + (ds.j && ds.j.answer.properties.length) + ' sql=' + cnt);
  // ── D: describe carries the edit-screen columns (bim-compiler prompts/CLI_ERP_IVR.md §9; V1-a). Independent sqlite3 counts; falsifier ERP_BREAK=descfield ──
  const sqj = (q) => { const o = spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout.trim(); return o ? JSON.parse(o) : []; }, sq = (q) => { const r = sqj(q)[0]; return r ? String(Object.values(r)[0]) : ''; };   // -json: a rule's code holds newlines
  const TAB = "(SELECT tb.ad_tab_id FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id WHERE t.tablename='C_Order' AND tb.isactive='Y' ORDER BY tb.tablevel, tb.seqno, tb.ad_tab_id LIMIT 1)";
  const dsc = await door('erp.describe kind=Order', 'human', process.env.ERP_BREAK === 'descfield' ? { ERP_BREAK_DESCFIELD: '1' } : {}), P = (dsc.j && dsc.j.answer && dsc.j.answer.properties) || [];
  const sqlDisp = Number(sq("SELECT count(*) FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=" + TAB + " AND f.isactive='Y' AND c.isactive='Y' AND f.isdisplayed='Y'"));
  const sqlRol = sqj("SELECT c.columnname AS n, c.readonlylogic AS v FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Order' AND c.isactive='Y' AND c.readonlylogic IS NOT NULL AND c.readonlylogic<>''").map(r => [r.n, r.v]);
  const sqlVr = sqj("SELECT c.columnname AS n, v.code AS v FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id JOIN ad_val_rule v ON v.ad_val_rule_id=c.ad_val_rule_id WHERE t.tablename='C_Order' AND c.isactive='Y'").map(r => [r.n, r.v]);
  const nDisp = P.filter(x => x.displayed === true).length, byName = {}; P.forEach(x => { byName[x.name] = x; });
  if (!P.length || !sqlDisp || !sqlRol.length || !sqlVr.length) k.incon('D', 'VACUOUS: an empty population (props=' + P.length + ' displayed_sql=' + sqlDisp + ' readonlylogic_sql=' + sqlRol.length + ' valrule_sql=' + sqlVr.length + ')');
  else {
    k.chk('D1 displayed = the dictionary: properties with displayed:true equal the first tab\'s IsDisplayed=Y fields (independent SQL)', nDisp === sqlDisp, 'describe=' + nDisp + ' sql=' + sqlDisp);
    k.chk('D2 read-only logic carried exactly: every column with a ReadOnlyLogic has that string, and no other column has the key', sqlRol.every(r => byName[r[0]] && byName[r[0]].readOnlyLogic === r[1]) && P.filter(x => x.readOnlyLogic).length >= sqlRol.length, 'sql=' + sqlRol.length + ' describe=' + P.filter(x => x.readOnlyLogic).length);
    const refT = sqj("SELECT c.columnname AS n, t2.tablename AS v FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id JOIN ad_ref_table r ON r.ad_reference_id=c.ad_reference_value_id JOIN ad_table t2 ON t2.ad_table_id=r.ad_table_id WHERE t.tablename='C_Order' AND c.isactive='Y' AND c.ad_reference_id IN (18,30)").map(r => [r.n, r.v]);
    k.chk('D3 validation rule and lookup: every column with a rule has valRule.code = AD_Val_Rule.Code; every ref-18/30 column has lookup.table = its AD_Ref_Table table', sqlVr.every(r => byName[r[0]] && byName[r[0]].valRule && byName[r[0]].valRule.code === r[1]) && refT.every(r => byName[r[0]] && byName[r[0]].lookup && byName[r[0]].lookup.table === r[1]), 'valrules=' + sqlVr.length + ' reftable=' + refT.length);
    const emptyHelp = Number(sq("SELECT count(*) FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Order' AND c.isactive='Y' AND (c.help IS NULL OR c.help='')")), noRol = P.filter(x => !sqlRol.some(r => r[0] === x.name));
    k.chk('D4 nothing invented: a column with no ReadOnlyLogic has no readOnlyLogic key (not \'\'), and a property carries help only where the dictionary has text (the empty-help columns without a field help have no help key)', noRol.every(x => !('readOnlyLogic' in x)) && P.every(x => !('help' in x) || String(x.help).length > 0) && P.filter(x => 'help' in x).length <= P.length - 0, 'columns_without_readonlylogic=' + noRol.length + ' empty_column_help=' + emptyHelp);
  }
  const dp = await door('erp.describe kind=C_BPartner'), db2 = await door('erp.describe kind=M_Product');
  k.chk('O2 the same verb serves other tables with no code of theirs (C_BPartner, M_Product), and a non-table is an error that names the kinds', dp.j.status === 'ok' && db2.j.status === 'ok' && (await door('erp.describe kind=NoSuchKind')).j.status === 'error', dp.j.answer.table + ' ' + db2.j.answer.table);
  const rd = await door('erp.read kind=Order id=' + D1.id);
  k.chk('O3 erp.read shows the record as the op-log left it (D1 was completed above: DocStatus CO), the same state erp.find reports', rd.j && rd.j.status === 'ok' && rd.j.answer.record.docstatus === 'CO' && String(rd.j.answer.record.c_order_id) === String(D1.id), 'docstatus=' + (rd.j && rd.j.answer.record.docstatus));
  // ── V: the vocabulary ──
  const g = spawnSync(process.execPath, [path.join(ROOT, 'scripts/gen_erp_door_verbs.js'), '--check'], { encoding: 'utf8' });
  k.chk('V1 the erp.* entries are what the generator writes from the dictionary + actor_verbs.json (not hand-kept)', g.status === 0 && /CURRENT/.test(g.stdout), (g.stdout || '').split('\n').filter(Boolean).slice(-1)[0]);
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.calls && v.calls.cli === 'erp_cli');   // every verb the dictionary engine serves: erp.* (document life), mis.* (any table) and the old erp.* names (aliases); the hand verbs of other CLIs are not in this set (CLI_ERP_IVR §11)
  k.chk('V2 harm: find/actions/describe/read/list/sum/group are read, erp.new writes, erp.complete is posts (the generator\'s rule, DocumentEngine ACTION_Complete -> Doc.post)', V.length === 22 && V.every(v => ({ 'mis.add_window': 'writes', 'mis.load': 'writes', 'mis.update': 'writes', 'mis.delete': 'writes', 'mis.describe': 'read', 'mis.read': 'read', 'mis.list': 'read', 'mis.sum': 'read', 'mis.group': 'read', 'mis.new': 'writes', 'erp.find': 'read', 'erp.actions': 'read', 'erp.describe': 'read', 'erp.read': 'read', 'erp.list': 'read', 'erp.sum': 'read', 'erp.group': 'read', 'erp.new': 'writes', 'erp.complete': 'posts', 'erp.void': 'writes', 'erp.close': 'writes', 'erp.reverse': 'posts' })[v.verb] === v.harm), V.map(v => v.verb + ':' + v.harm).join(' '));
  k.chk('V3 the connector (tools/list) offers no erp verb: they have no mcp_name, so the published tool bytes are unchanged', V.every(v => !v.mcp_name));
  const bad = V.filter(v => !/^(find|actions|complete|void|close|reverse|describe|read|list|sum|group|new|update|delete|load|add_window)$/.test(v.calls.argv[0]) || v.calls.cli !== 'erp_cli' || JSON.stringify(v.calls.argv).match(/"(-e|--eval|sh|bash|sql|exec)"/));
  k.chk('V4 no erp entry names code, SQL or a shell: every one calls erp_cli with a fixed subcommand', bad.length === 0, 'offences=' + bad.length);
  const refNames = {}; (spawnSync('sqlite3', ['-readonly', path.join(ROOT, 'erp/ad_seed.db'), "SELECT value || '|' || name FROM ad_ref_list WHERE ad_reference_id=135"], { encoding: 'utf8' }).stdout || '').trim().split('\n').forEach(l => { const [c, n] = l.split('|'); refNames[c] = n; });
  const actV = V.filter(v => EC.ACT[v.verb.split('.')[1]]), undef = V.filter(v => /undefined/.test(v.title + ' ' + v.description));
  k.chk('V6 the menu a person reads never says "undefined": every action verb\'s title is its dictionary name (AD_Ref_List 135) + " a document"', actV.length === 4 && undef.length === 0 && actV.every(v => v.title === refNames[EC.ACT[v.verb.split('.')[1]]] + ' a document'), actV.map(v => v.verb + '="' + v.title + '"').join(' ') + ' undefined_in=' + undef.length);
  // dictionary-driven, not table-named: erp_cli.js and doc_actions.js carry no document table name
  const src = fs.readFileSync(path.join(ROOT, 'common/door/erp_cli.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'erp/doc_actions.js'), 'utf8');
  const named = (src.match(/\b(c_order|c_invoice|m_inout|c_payment|C_Order|C_Invoice|M_InOut|C_Payment)\b/g) || []);
  k.chk('V5 AD-LAYER LAW: no document table is named in erp_cli.js or doc_actions.js', named.length === 0, 'hits=' + named.length + (named.length ? ' ' + named.slice(0, 4).join(',') : ''));
  k.L('journal lines=' + fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean).length + ' dir=' + dir);
  k.end();
})().catch(e => { console.log('§W-ERP-VERBS-DOOR verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
