// ⚠ DO NOT REMOVE — W-NINJA-DOC (bim-compiler prompts/CLI_ERP_IVR.md §34: Complete on a Ninja table = the generic DocAction class, the Ninja Code Maker's M<model>). READ THE LOG; an exit code is not evidence.
//   N1 ISSUE (a staged document cannot be prepared) · N2 ISSUE (Complete does not do what the stock classes share: CO, Processed=Y, DocAction=CL, implicit approval)
//   N3 ISSUE (Close leaves the record editable or offers an action) · N4 ISSUE (Void of a draft is not VO + Processed) · N5 ISSUE (the generic class fakes a reverse it has no rule for)
//   N6 ISSUE (a core table without a ported class gets the generic one, faking its legacy business logic). Expected values: MRequisition.java / MJournal.java (cited in the spec), read back
//   from the record by mis.read, never from the verb's own answer alone. Falsifier: NINJA_DOC_BREAK=off (no generic class) must FAIL N1-N4. Each claim can say VACUOUS / INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-NINJA-DOC');
(async () => {
  const dir = path.dirname(tmp('nd_'));
  fs.writeFileSync(path.join(dir, 'WF_Claim.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\nAmount,Amount,,\n');
  const env = { BIM_OBJECT_OPLOG: path.join(dir, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') };
  if (process.env.NINJA_DOC_BREAK) env.NINJA_DOC_BREAK = process.env.NINJA_DOC_BREAK;
  const door = (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', d => { o += d; }); p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const ok = (j) => j && j.status === 'ok';
  const rec = async (id) => { const r = await door('mis.read kind=WF_Claim id=' + id); return ok(r) ? (r.answer.record || r.answer.row || r.answer) : null; };
  const st = (r) => r ? [r.docstatus || r.DocStatus, r.processed || r.Processed, r.docaction || r.DocAction, r.isapproved || r.IsApproved].join('/') : 'none';

  const aw = await door('mis.add_window file=WF_Claim.csv workflow=Y');
  k.L('staged: ' + aw.status + ' ' + String(aw.why || '').slice(0, 120) + ' table=' + (aw.answer && aw.answer.table));
  if (!ok(aw)) { k.incon('N1-N6', 'VACUOUS: the Ninja table could not be staged (' + aw.why + ')'); return k.end(); }
  const mk = async (n) => { const r = await door('mis.new kind=WF_Claim Name=' + n); return ok(r) ? r.answer.id : null; };
  const A = await mk('Alpha'), B = await mk('Bravo'), C = await mk('Charlie');
  k.L('records A=' + A + ' B=' + B + ' C=' + C + ' (each DR/N/CO/N: ' + st(await rec(A)) + ')');
  if (A == null || B == null || C == null) { k.incon('N1-N6', 'VACUOUS: the records could not be made'); return k.end(); }

  const p1 = await door('erp.prepare kind=WF_Claim id=' + A), r1 = await rec(A);
  k.L('N1 prepare: ' + p1.status + ' ' + String(p1.why || '').slice(0, 140) + ' -> ' + st(r1));
  k.chk('N1 Prepare takes a staged draft to IP, Processed stays N (MRequisition.prepareIt :260-306)', ok(p1) && !!r1 && (r1.docstatus || r1.DocStatus) === 'IP' && (r1.processed || r1.Processed) === 'N', st(r1));
  const c1 = await door('erp.complete kind=WF_Claim id=' + A), r2 = await rec(A);
  k.L('N2 complete: ' + c1.status + ' ' + String(c1.why || '').slice(0, 140) + ' -> ' + st(r2));
  k.chk('N2 Complete reads CO / Processed Y / DocAction CL / IsApproved Y (completeIt :342-378: implicit approval, Processed, DocAction Close)', ok(c1) && st(r2) === 'CO/Y/CL/Y', st(r2));
  const l1 = await door('erp.close kind=WF_Claim id=' + A), r3 = await rec(A);
  k.chk('N3 Close of a completed record reads CL / Processed Y / DocAction -- (MJournal.closeIt :750-)', ok(l1) && st(r3).startsWith('CL/Y/--'), l1.status + ' ' + st(r3) + ' ' + String(l1.why || '').slice(0, 100));
  const v1 = await door('erp.void kind=WF_Claim id=' + B), r4 = await rec(B);
  k.chk('N4 Void of a draft reads VO / Processed Y / DocAction -- (MJournal.voidIt :704-)', ok(v1) && st(r4).startsWith('VO/Y/--'), v1.status + ' ' + st(r4) + ' ' + String(v1.why || '').slice(0, 100));
  const c2 = await door('erp.complete kind=WF_Claim id=' + C), rv = await door('erp.reverse kind=WF_Claim id=' + C), r5 = await rec(C);
  k.chk('N5 Reverse is refused, not faked: the record stays CO (MRequisition.reverseCorrectIt :480-490 returns false)', ok(c2) && !ok(rv) && !!r5 && (r5.docstatus || r5.DocStatus) === 'CO', 'complete=' + c2.status + ' reverse=' + rv.status + ' "' + String(rv.why || '').slice(0, 120) + '" -> ' + st(r5));

  // N6: a core table with the three document columns, no registered class, holding a row: picked by an independent query, the classes from the model layer's own list
  const ML = require(path.join(ROOT, 'erp', 'model_layer.js')); require(path.join(ROOT, 'common', 'door', 'erp_cli.js'));
  let classes = []; try { const O = await require(path.join(ROOT, 'common', 'door', 'erp_cli.js')).boot({ oplog: path.join(dir, 'n6.ops.jsonl') }); classes = Object.keys(O.ML.DOCS || ML.DOCS || {}); } catch (e) { classes = Object.keys(ML.DOCS || {}); }
  const SEED = path.join(ROOT, 'erp/ad_seed.db');
  const cand = (cp.spawnSync('sqlite3', ['-readonly', SEED, "SELECT t.tablename FROM ad_table t WHERE t.isactive='Y' AND t.isview<>'Y' AND t.ad_table_id<7000000 AND (SELECT count(*) FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND c.isactive='Y' AND lower(c.columnname) IN ('docstatus','docaction','processed'))=3 ORDER BY t.ad_table_id"], { encoding: 'utf8' }).stdout || '').trim().split('\n').filter(Boolean).filter(t => classes.indexOf(t.toLowerCase()) < 0);
  let pick = null; for (const t of cand) { const key = t + '_ID', row = (cp.spawnSync('sqlite3', ['-readonly', SEED, 'SELECT ' + key + ' FROM ' + t + ' LIMIT 1'], { encoding: 'utf8' }).stdout || '').trim(); if (/^\d+$/.test(row)) { pick = { t, id: row }; break; } }
  k.L('N6 core tables with the document columns and no class: ' + cand.length + ' (registered classes=' + classes.length + ') pick=' + JSON.stringify(pick));
  if (!pick) k.incon('N6', 'VACUOUS: no core table without a class holds a row');
  else { const x = await door('erp.complete kind=' + pick.t + ' id=' + pick.id); k.chk('N6 a core table without a ported class (' + pick.t + ') is still refused "no document class yet", not given the generic class', !ok(x) && /no document class yet/.test(String(x.why)), x.status + ' "' + String(x.why || '').slice(0, 140) + '"'); }
  k.end();
})().catch(e => { console.log('§W-NINJA-DOC ERROR ' + (e && e.stack || e)); process.exit(2); });
