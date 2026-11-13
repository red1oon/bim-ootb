// ⚠ DO NOT REMOVE — W-DOOR-LIST (bim-compiler prompts/CLI_ERP_IVR.md §19: the door refuses a list value that is not in the list). READ THE LOG; an exit code is not evidence.
//   L1 ISSUE (mis.new saves a value the window's dropdown does not hold) · L2 ISSUE (the check refuses a real value) · L3 ISSUE (mis.update is unguarded)
//   L4 ISSUE (one column was fixed, the others not: the sweep is every List column the Edit forms of two kinds offer) · L5 ISSUE (a window made from a sheet takes a value outside its sheet's list)
//   Falsifier: MIS_BREAK=nolistcheck must FAIL L1, L3, L4, L5. Each claim can say VACUOUS / INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-DOOR-LIST');
(async () => {
  const dir = path.dirname(tmp('dl_')), env = Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') }, process.env.MIS_BREAK ? { MIS_BREAK: process.env.MIS_BREAK } : {});
  const nops = () => { try { return fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const door = (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', () => { let j = null; try { j = JSON.parse(o); } catch (e) { /* null */ } res(j || { status: 'unparseable', why: o.slice(0, 100) }); }); });
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const ok = (j) => j && j.status === 'ok', bad = (j) => j && j.status === 'refused' && / Invalid value - /.test(String(j.why));
  // L1 / L2
  const refId = (sq("SELECT c.ad_reference_value_id AS r FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_BPartner' AND c.columnname='SOCreditStatus'")[0] || {}).r, valid = sq("SELECT value AS v FROM ad_ref_list WHERE ad_reference_id=" + refId + " AND isactive='Y' ORDER BY value").map(r => r.v);
  const n0 = nops(), l1 = await door('mis.new kind=C_BPartner Value=ZLIST1 Name="List One" SOCreditStatus=Q'), n1 = nops();
  if (!valid.length || valid.includes('Q')) k.incon('L1', 'VACUOUS: the list is empty or holds the test value');
  else k.chk('L1 mis.new with a value outside the list is refused in PO.set_Value\'s words, naming the column, the value and exactly the ' + valid.length + ' valid values of an independent read; nothing written', bad(l1) && l1.why.indexOf('SOCreditStatus Invalid value - Q - Reference_ID=' + refId + valid.map(v => ' - ' + v).join('') + ';') === 0 && n1 === n0, String(l1.why).slice(0, 110) + ' ops+' + (n1 - n0) + ' status=' + l1.status);
  const l2 = await door('mis.new kind=C_BPartner Value=ZLIST2 Name="List Two" SOCreditStatus=' + valid[0]), id = l2.answer && l2.answer.id;
  k.chk('L2 the same line with a listed value (' + valid[0] + ') is saved', ok(l2) && l2.answer.record.socreditstatus === valid[0], l2.status + ' ' + String(l2.why || '').slice(0, 80));
  // L3
  const n3 = nops(), u1 = await door('mis.update kind=C_BPartner id=' + id + ' SOCreditStatus=ZZ'), n4 = nops(), u2 = await door('mis.update kind=C_BPartner id=' + id + ' SOCreditStatus=' + valid[1]);
  k.chk('L3 mis.update to a value outside the list is refused, nothing written; to a listed value (' + valid[1] + ') it is saved', !!id && bad(u1) && n4 === n3 && ok(u2) && u2.answer.record.socreditstatus === valid[1], 'outside=' + u1.status + ' ops+' + (n4 - n3) + ' listed=' + u2.status);
  // L4: every List column the Edit form of two kinds offers
  const sweep = async (kind, rid) => { const d = await door('mis.describe kind=' + kind), cols = d.answer ? d.answer.properties.filter(p => p.type === 'list' && p.values && p.values.length && p.displayed && p.updateable && !p.fieldReadOnly && !p.readOnlyLogic && !p.values.includes('Z9')) : [], out = [];
    for (const c of cols) { const b = nops(), r = await door('mis.update kind=' + kind + ' id=' + rid + ' ' + c.name + '=Z9'); out.push({ c: c.name, ok: bad(r) && nops() === b, why: String(r.why || r.status).slice(0, 50) }); } return out; };
  const DR = require('./erp_draft.js'), ord = await DR.draftOrder({ oplog: env.BIM_OBJECT_OPLOG }, {});
  const s1 = id ? await sweep('C_BPartner', id) : [], s2 = ord && ord.id ? await sweep('Order', ord.id) : [], all = s1.concat(s2), X = all.filter(x => x.ok).length;
  k.L('L4 partner list columns=' + s1.length + ' order list columns=' + s2.length + ' not refused: ' + (all.filter(x => !x.ok).map(x => x.c + ' [' + x.why + ']').join(' | ') || 'none'));
  if (!all.length) k.incon('L4', 'VACUOUS: no List column on the two Edit forms');
  else k.chk('L4 the sweep: ' + X + ' of ' + all.length + ' List columns the Business Partner and Order Edit forms offer refuse a made-up value, nothing written', X === all.length && s1.length > 0 && s2.length > 0, all.filter(x => !x.ok).map(x => x.c).join(','));
  // L5: a window made from a sheet
  fs.writeFileSync(path.join(dir, 'AST_Asset.csv'), 'Column,Type,Length,Mandatory,Identifier,Default,List,Lookup,Callout,Help\nName,String,60,Y,Y,,,,,\nCondition,List,,,,GOOD,"GOOD=Good,FAIR=Fair",,,\n');
  const aw = await door('mis.add_window file=AST_Asset.csv'), b5 = nops(), w1 = await door('mis.new kind=AST_Asset Name=Plough Condition=BAD'), b6 = nops(), w2 = await door('mis.new kind=AST_Asset Name=Plough Condition=FAIR');
  if (!ok(aw)) k.incon('L5', 'the window could not be staged: ' + aw.why);
  else k.chk('L5 a window made from a sheet refuses a value outside its sheet\'s list (BAD; valid FAIR, GOOD) and takes a listed one', bad(w1) && / - FAIR - GOOD;/.test(w1.why) && b6 === b5 && ok(w2) && w2.answer.record.condition === 'FAIR', String(w1.why || w1.status).slice(0, 90) + ' | listed=' + w2.status);
  return k.end();
})().catch(e => { console.log('§W-DOOR-LIST ERROR ' + e.stack); process.exit(2); });
