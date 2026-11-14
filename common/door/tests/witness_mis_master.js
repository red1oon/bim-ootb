// ⚠ DO NOT REMOVE — W-MIS-MASTER (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.12: master=Table/record on mis.list, mis.sum, mis.group). READ THE LOG; an exit code is not evidence.
//   M1 ISSUE (the rows of one parent are not exactly its children: a sibling's row leaks in, or one is missed) · M2 ISSUE (a sum or count under a master differs from the same rows added independently)
//   M3 ISSUE (a table that is not a detail of the master, an unknown or ambiguous parent, or a malformed spec is answered with rows instead of a refusal) · M4 ISSUE (a parent with no children reads as an empty model, VACUOUS, instead of a true zero)
//   Falsifiers: MASTER_BREAK=nofilter (must FAIL M1, M2) · noresolve (must FAIL M1). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_mis_master.js > common/door/tests/logs/mis_master.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-MASTER'), BRK = process.env.MASTER_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nw_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('F1-F7', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  fs.writeFileSync(path.join(dir, 'WF_Claim.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\nAmount,Amount,,\n');
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, BRK ? { MASTER_BREAK: BRK } : {});
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const doorE = (e, actor) => (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (e) => { const old = process.env.BIM_OBJECT_OPLOG; process.env.BIM_OBJECT_OPLOG = e.BIM_OBJECT_OPLOG; const w = process.stderr.write; process.stderr.write = () => true; try { return await E.boot({}); } finally { process.stderr.write = w; if (old == null) delete process.env.BIM_OBJECT_OPLOG; else process.env.BIM_OBJECT_OPLOG = old; } };
  const st = await door('ninja.exec file=Ninja_Practice.xlsx'); if (!ok(st)) { k.incon('M1-M4', 'the practice workbook did not stage: ' + st.why); return k.end(); }
  const mk = [['V1', 1, 10.5], ['V2', 1, 20.25], ['V3', 2, 7]]; for (const [n, p, f] of mk) { const r = await door('mis.new kind=PR_Visit Name=' + n + ' PR_Patient_ID=' + p + ' Fee=' + f); if (!ok(r)) { k.incon('M1-M4', 'a visit was not made: ' + r.why); return k.end(); } }
  const pat = await door('mis.list kind=PR_Patient columns=PR_Patient_ID,Name'), pr = (pat.answer || {}).rows || [], p1 = pr.filter(r => Number(r.PR_Patient_ID) === 1)[0], p3 = pr.filter(r => Number(r.PR_Patient_ID) === 3)[0];
  if (!p1 || !p3) { k.incon('M1-M4', 'the practice patients 1 and 3 are not there: ' + JSON.stringify(pr)); return k.end(); }
  const names = (j) => ((j.answer || {}).rows || []).map(r => r.Name).sort().join(',');
  const byId = await door('mis.list kind=PR_Visit columns=Name master=PR_Patient/1'), byNum = await door('mis.list kind=PR_Visit columns=Name master=PR_Patient/' + p1.Name), byCol = await door('mis.list kind=PR_Visit columns=Name PR_Patient_ID=1'), all = await door('mis.list kind=PR_Visit columns=Name');
  k.chk('M1 master=PR_Patient/1 lists exactly the two visits of patient 1 (not the third, which belongs to patient 2), the same rows by the parent\'s name and by the plain PR_Patient_ID=1 filter; the answer names the master filter', names(byId) === 'V1,V2' && names(byNum) === 'V1,V2' && names(byCol) === 'V1,V2' && names(all) === 'V1,V2,V3' && ((byId.answer || {}).filters || [])[0] && byId.answer.filters[0].master === 'PR Patient/1',
    'by id=' + names(byId) + ' · by name=' + names(byNum) + ' · by column=' + names(byCol) + ' · all=' + names(all) + ' · filter=' + JSON.stringify(((byId.answer || {}).filters || [])[0]));
  const sm = await door('mis.sum kind=PR_Visit column=Fee master=PR_Patient/1'), gp = await door('mis.group kind=PR_Visit by=PR_Patient_ID master=PR_Patient/1'), want = '30.75';
  k.chk('M2 the sum of Fee under patient 1 is ' + want + ' (10.5 + 20.25, added here, not by the verb), over 2 rows; the count by patient under that master has one group of 2', ok(sm) && sm.answer.sum === want && sm.answer.n === 2 && ok(gp) && (gp.answer.rows || []).length === 1 && Number(gp.answer.rows[0].count) === 2, 'sum=' + (sm.answer && sm.answer.sum) + ' n=' + (sm.answer && sm.answer.n) + ' · group=' + JSON.stringify((gp.answer || {}).rows));
  const n0 = nops(E1), bad1 = await door('mis.list kind=PR_Patient master=PR_Visit/1'), bad2 = await door('mis.list kind=PR_Visit master=PR_Patient/999'), bad3 = await door('mis.list kind=PR_Visit master=PR_Patient'), bad4 = await door('mis.list kind=PR_Visit master=PR_Patient/NoSuchName'), bad5 = await door('mis.list kind=PR_Visit master=PR_Nowhere/1');
  await door('mis.new kind=PR_Patient Name=' + p1.Name); const bad6 = await door('mis.list kind=PR_Visit master=PR_Patient/' + p1.Name), n1 = nops(E1);
  k.chk('M3 refused with the reason, rows never returned: a table that is not a detail of the master; a parent id that does not exist; a spec with no record; a name no parent has; an unknown master table; a name two parents share (it asks for the id)',
    ref(bad1, /is not a detail of PR Visit/) && ref(bad2, /no PR Patient record with PR_Patient_ID 999/) && ref(bad3, /master is Table\/record/) && ref(bad4, /no PR Patient has Name/) && ref(bad5, /master=PR_Nowhere\/1/) && ref(bad6, /2 PR Patient records have Name/),
    [bad1, bad2, bad3, bad4, bad5, bad6].map(j => j.status).join('/') + ' · ' + String(bad6.why || '').slice(0, 70));
  const none = await door('mis.list kind=PR_Visit columns=Name master=PR_Patient/' + p3.PR_Patient_ID);
  k.chk('M4 a parent with no children is a true zero (0 of the ' + ((all.answer || {}).population) + ' visits, verdict OK), not an empty model; reading wrote nothing (the one write above is the duplicate patient: ops ' + n0 + ' -> ' + n1 + ')', ok(none) && none.answer.total === 0 && none.answer.verdict === 'OK' && none.answer.population === 3 && n1 - n0 > 0 && n1 - n0 < 10, 'status=' + none.status + ' total=' + (none.answer && none.answer.total) + ' verdict=' + (none.answer && none.answer.verdict));
  k.end();
})().catch(e => { console.log('§W-MIS-MASTER ERROR ' + e.stack); process.exit(2); });
