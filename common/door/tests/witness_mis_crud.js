// ⚠ DO NOT REMOVE — W-MIS-CRUD (bim-compiler prompts/CLI_ERP_IVR.md §12: mis.update, mis.delete). READ THE LOG; an exit code is not evidence.
//   U1 ISSUE (an edit touches other columns) · U2 ISSUE (callouts do not fire: a partner change leaves the old partner's location) · U3 ISSUE (a column the window would not let a person edit is changed)
//   U4 ISSUE (a mandatory column left empty is saved) · U5 ISSUE (a no-change edit writes, or is not said to be NO-OP)
//   D1 ISSUE (a draft's lines are left behind) · D2 ISSUE (a completed document is deleted) · D3 ISSUE (a referenced master is deleted) · D4 ISSUE (an ai writes without the gate)
//   D5 ISSUE (a delete leaves the record's tree node behind, so the next record with that key collides: found by the Fast Script guide's own run, 2026-11-11; PO.delete_Tree, MBPartner.afterDelete)
//   Falsifiers: MIS_BREAK=nocallouts (must FAIL U2) · noeditcheck (must FAIL U3) · noprocessed (must FAIL D2). Each claim can say VACUOUS/INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path');
const { kit, tmp, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-CRUD');
(async () => {
  const dir = path.dirname(tmp('mc_')), oplog = path.join(dir, 'ops.jsonl'), env0 = { BIM_OBJECT_OPLOG: oplog, BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') };
  const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const door = (line, actor) => run(DOOR, ['--actor', actor || 'human', line], Object.assign({}, env0, process.env.MIS_BREAK ? { MIS_BREAK: process.env.MIS_BREAK } : {})).then(r => { let j = null; try { j = JSON.parse(r.out); } catch (e) { /* null */ } return j; });
  const DR = require('./erp_draft.js'), sq = (q) => require('child_process').spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout;
  const rec = async (id) => { const r = await door('mis.read kind=Order id=' + id); return r && r.answer && r.answer.record; };
  const D1 = await DR.draftOrder({ oplog }, {}), D2 = await DR.draftOrder({ oplog }, {}), D3 = await DR.draftOrder({ oplog }, {});
  const cp = await door('erp.complete kind=Order id=' + D2.id);
  if (D1.docStatus !== 'DR' || !cp || cp.status !== 'ok') { k.incon('setup', 'drafts/complete failed: ' + (cp && cp.status)); return k.end(); }
  k.L('setup D1=' + D1.number + ' draft, D2=' + D2.number + ' completed, D3=' + D3.number + ' draft; ops=' + nops());
  // U1
  const b0 = await rec(D1.id), n0 = nops(), u1 = await door('mis.update kind=Order id=' + D1.id + ' description="rush job"'), a0 = await rec(D1.id);
  const diff = Object.keys(a0 || {}).filter(c => String(a0[c]) !== String(b0[c]));
  k.chk('U1 only the named column changes: the stored row differs from before in description, updated, updatedby only', u1 && u1.status === 'ok' && diff.length > 0 && diff.every(c => ['description', 'updated', 'updatedby'].includes(c)) && diff.includes('description'), 'diff=' + diff.join(',') + ' ops+' + (nops() - n0));
  // U5
  const n5 = nops(), u5 = await door('mis.update kind=Order id=' + D1.id + ' description="rush job"');
  k.chk('U5 giving the current value is a NO-OP: said so, nothing written', u5 && u5.status === 'ok' && u5.answer.noop === true && nops() === n5, 'noop=' + (u5 && u5.answer && u5.answer.noop) + ' ops+' + (nops() - n5));
  // U2: the window's callouts after a partner change: location/bill-to of the NEW partner, its price list
  const NP = 117, locs = JSON.parse(sq("SELECT c_bpartner_location_id AS l FROM c_bpartner_location WHERE c_bpartner_id=" + NP) || '[]').map(r => r.l), pl = JSON.parse(sq("SELECT m_pricelist_id AS p FROM c_bpartner WHERE c_bpartner_id=" + NP) || '[{}]')[0].p;
  const old = await rec(D1.id), u2 = await door('mis.update kind=Order id=' + D1.id + ' c_bpartner_id=' + NP), nw = await rec(D1.id);
  if (!locs.length) k.incon('U2', 'VACUOUS: the new partner has no location in the dictionary seed');
  else k.chk('U2 callouts fire as in the window: after the partner change the order carries the new partner\'s own location and bill-to, not the old one\'s', u2 && u2.status === 'ok' && String(nw.c_bpartner_id) === String(NP) && locs.includes(Number(nw.c_bpartner_location_id)) && String(nw.bill_bpartner_id) === String(NP) && String(old.c_bpartner_location_id) !== String(nw.c_bpartner_location_id), 'old_loc=' + old.c_bpartner_location_id + ' new_loc=' + (nw && nw.c_bpartner_location_id) + ' of ' + locs.join('/') + ' derived=' + (u2 && u2.answer && u2.answer.derived && u2.answer.derived.length));
  // U3
  const n3 = nops(), u3a = await door('mis.update kind=Order id=' + D1.id + ' c_doctype_id=1'), u3b = await door('mis.update kind=Order id=' + D2.id + ' c_bpartner_id=' + NP);
  k.chk('U3 a column the window would not let a person edit is refused naming the rule, nothing written: a read-only field on a draft, any column of a completed document', u3a && u3a.status === 'refused' && /read-only/.test(u3a.why) && u3b && u3b.status === 'refused' && /Processed/.test(u3b.why) && nops() === n3, 'draft:' + String(u3a && u3a.why).slice(0, 60) + ' | completed:' + String(u3b && u3b.why).slice(0, 70) + ' ops+' + (nops() - n3));
  // U4
  const n4 = nops(), u4 = await door('mis.update kind=Order id=' + D1.id + ' c_bpartner_location_id=<null>');
  k.chk('U4 a mandatory column left empty is refused, nothing written', u4 && u4.status === 'refused' && /mandatory/.test(u4.why) && nops() === n4, String(u4 && u4.why).slice(0, 90) + ' ops+' + (nops() - n4));
  // D1
  const lc = async () => { const l = await door('mis.list kind=C_OrderLine c_order_id=' + D3.id); return l && l.answer ? Number(l.answer.total) : -1; };
  const l0 = await lc(), d1 = await door('mis.delete kind=Order id=' + D3.id), l1 = await lc(), gone = await door('mis.read kind=Order id=' + D3.id);
  if (l0 < 1) k.incon('D1', 'VACUOUS: the draft had no lines (' + l0 + ')');
  else k.chk('D1 a draft is deleted with its lines in one group (CRUD_DELETE on the line and the header)', d1 && d1.status === 'ok' && d1.answer.gone === true && l1 === 0 && gone && gone.status !== 'ok' && d1.answer.ops.some(o => o.table === 'c_orderline') && d1.answer.ops.some(o => o.table === 'c_order'), 'lines ' + l0 + ' -> ' + l1 + ' ops=' + (d1 && d1.answer && d1.answer.ops.map(o => o.table).join(',')));
  // D2
  const n6 = nops(), d2 = await door('mis.delete kind=Order id=' + D2.id), still = await rec(D2.id);
  k.chk('D2 a completed document is not deleted: refused with the engine\'s own text, nothing written', d2 && d2.status === 'refused' && /Cannot delete completed\/processed/.test(d2.why) && nops() === n6 && !!still, String(d2 && d2.why).slice(0, 90) + ' ops+' + (nops() - n6));
  // D3
  const n7 = nops(), d3 = await door('mis.delete kind=C_BPartner id=112');
  k.chk('D3 a referenced master is refused with the reason, nothing written', d3 && d3.status === 'refused' && /dependent record/.test(d3.why) && nops() === n7, String(d3 && d3.why).slice(0, 90) + ' ops+' + (nops() - n7));
  // D5: a delete takes the tree node with it, and the key can be used again
  const t1 = await door('mis.new kind=C_BPartner Value=TREE1 Name="Tree Check"'), nid = t1 && t1.answer && t1.answer.id, dt = await door('mis.delete kind=C_BPartner id=' + nid), t2 = await door('mis.new kind=C_BPartner Value=TREE2 Name="Tree Check Again"');
  k.chk('D5 a deleted partner takes its tree node with it (delete:ad_treenodebp = 1) and the next partner can be created on the same key (PO.delete_Tree)', !!nid && dt && dt.status === 'ok' && (dt.answer.opSummary['delete:ad_treenodebp'] || 0) === 1 && t2 && t2.status === 'ok' && String(t2.answer.id) === String(nid), 'id ' + nid + ' -> ' + (t2 && t2.answer && t2.answer.id) + ' ops=' + JSON.stringify(dt && dt.answer && dt.answer.opSummary) + (t2 && t2.status !== 'ok' ? ' reuse=' + String(t2.why).slice(0, 90) : ''));
  // D4
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs, mu = V.find(v => v.verb === 'mis.update'), md = V.find(v => v.verb === 'mis.delete');
  const n8 = nops(), ai = await door('mis.update kind=Order id=' + D1.id + ' description="by an ai"', 'ai'), aid = await door('mis.delete kind=Order id=' + D1.id, 'ai');
  k.chk('D4 the vocabulary entries are generated, harm writes, human+ai; an ai\'s update and delete are held as claims, nothing written', !!mu && !!md && mu.harm === 'writes' && md.harm === 'writes' && mu.actors.join() === 'human,ai' && ai && ai.status === 'claim' && aid && aid.status === 'claim' && nops() === n8, 'ai update=' + (ai && ai.status) + ' delete=' + (aid && aid.status) + ' ops+' + (nops() - n8));
  return k.end();
})().catch(e => { console.log('§W-MIS-CRUD ERROR ' + e.stack); process.exit(2); });
