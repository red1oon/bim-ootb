// ⚠ DO NOT REMOVE — W-MIS-DIFF (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.13: mis.diff, a CSV against the table). READ THE LOG; an exit code is not evidence.
//   D1 ISSUE (a line is put in the wrong class: new / changed / same / missing, a repeated line, or 1200.50 against a stored 1200.5 read as a change) · D2 ISSUE (a comparison that writes: an op, or a file)
//   D3 ISSUE (a file that cannot be compared is answered with a result instead of a refusal) · D4 ISSUE (a lookup column is compared by its id, so a name in the sheet never matches)
//   Falsifiers: MISDIFF_BREAK=nonumeric (must FAIL D1) · nokey (repeated lines are not seen: must FAIL D1) · writes (must FAIL D2). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_mis_diff.js > common/door/tests/logs/mis_diff.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-DIFF'), BRK = process.env.MISDIFF_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nw_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('F1-F7', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  fs.writeFileSync(path.join(dir, 'WF_Claim.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\nAmount,Amount,,\n');
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, BRK ? { MISDIFF_BREAK: BRK } : {});
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const doorE = (e, actor) => (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (e) => { const old = process.env.BIM_OBJECT_OPLOG; process.env.BIM_OBJECT_OPLOG = e.BIM_OBJECT_OPLOG; const w = process.stderr.write; process.stderr.write = () => true; try { return await E.boot({}); } finally { process.stderr.write = w; if (old == null) delete process.env.BIM_OBJECT_OPLOG; else process.env.BIM_OBJECT_OPLOG = old; } };
  fs.writeFileSync(path.join(dir, 'DF_Asset.csv'), 'Column,Type,Length,Mandatory,Default,List\nName,String,60,Y,,\nCost,Amount,,,,\nCondition,List,,,GOOD,"GOOD=Good,FAIR=Fair,POOR=Poor"\n');
  const aw = await door('mis.add_window file=DF_Asset.csv'); if (!ok(aw)) { k.incon('D1-D4', 'the table was not made: ' + aw.why); return k.end(); }
  for (const l of ['Name=Tractor Cost=1200.5 Condition=GOOD', 'Name=Plough Cost=300 Condition=FAIR', 'Name=Harrow Cost=450 Condition=GOOD']) { const r = await door('mis.new kind=DF_Asset ' + l); if (!ok(r)) { k.incon('D1-D4', 'a record was not made: ' + r.why); return k.end(); } }
  const sheet = ['Name,Cost,Condition', 'Tractor,1200.50,GOOD', 'Plough,300,POOR', 'Seeder,980,FAIR', 'Tractor,1,GOOD'];
  fs.writeFileSync(path.join(dir, 'df.csv'), sheet.join('\n') + '\n');
  const stored = ((await door('mis.list kind=DF_Asset columns=Name,Cost,Condition')).answer || {}).rows || [];   // what the table holds, read by a different verb
  const n0 = nops(E1), before = fs.readdirSync(dir).sort().join(','), d = await door('mis.diff kind=DF_Asset file=df.csv'), n1 = nops(E1), after = fs.readdirSync(dir).sort().join(',');
  if (!ok(d)) { k.incon('D1-D4', 'the diff did not run: ' + d.why); return k.end(); }
  const A = d.answer, newN = A.new.map(x => x.key).join(), chg = A.changed.map(x => x.key + ':' + x.changes.map(c => c.column + ' ' + c.table + '->' + c.sheet).join(';')).join(), miss = A.missing.join();
  const wantNew = 'Seeder', wantChg = 'Plough:Condition ' + (stored.filter(r => r.Name === 'Plough')[0] || {}).Condition + '->POOR', wantMiss = 'Harrow';
  k.chk('D1 the file against the table: new = Seeder; changed = Plough, its Condition from the stored value to POOR (nothing else); the same = 1 (Tractor: 1200.50 in the file against 1200.5 stored, equal as numbers); the table\'s Harrow is not in the file; the second Tractor line is named as a repeat, not compared',
    newN === wantNew && chg === wantChg && A.same === 1 && miss === wantMiss && A.duplicates.length === 1 && A.duplicates[0].row === 4 && A.counts.changed === 1, 'new=' + newN + ' · changed=' + chg + ' (want ' + wantChg + ') · same=' + A.same + ' · missing=' + miss + ' · duplicates=' + JSON.stringify(A.duplicates));
  k.chk('D2 the comparison wrote nothing: the op count is the same (' + n0 + '), no file appeared beside the sheet, and the answer says ops 0', n1 === n0 && before === after && A.ops === 0 && /nothing was written/.test(A.summary), 'ops ' + n0 + '->' + n1 + ' · files same=' + (before === after));
  fs.writeFileSync(path.join(dir, 'df_bad.csv'), 'Name,NoSuchColumn\nTractor,x\n'); fs.writeFileSync(path.join(dir, 'df_nokey.csv'), 'Cost,Condition\n300,POOR\n'); fs.writeFileSync(path.join(dir, 'df_empty.csv'), 'Name,Cost\n'); fs.writeFileSync(path.join(dir, 'df.txt'), 'x');
  const b1 = await door('mis.diff kind=DF_Asset file=df_bad.csv'), b2 = await door('mis.diff kind=DF_Asset file=df_nokey.csv'), b3 = await door('mis.diff kind=DF_Asset file=df_empty.csv'), b4 = await door('mis.diff kind=DF_Asset file=df.txt'), b5 = await door('mis.diff kind=NoSuchKind file=df.csv'), b6 = await door('mis.diff kind=DF_Asset file=missing.csv');
  k.chk('D3 refused with the reason, no result: a header that is not a column of the kind; a file with no key column; a file with no rows; a file that is not a .csv; an unknown kind; a file that is not there',
    ref(b1, /NoSuchColumn is not a column/) && ref(b2, /key column name is not in the file/i) && ref(b3, /has no rows/) && ref(b4, /must be a \.csv/) && ref(b5, /unknown kind/) && ref(b6, /cannot read/), [b1, b2, b3, b4, b5, b6].map(j => j.status).join('/') + ' · ' + String(b2.why || '').slice(0, 70));
  const bp = await door('mis.list kind=PR_Patient columns=Name'); const pn = ((bp.answer || {}).rows || []).map(r => r.Name);
  const lk = await door('ninja.exec file=Ninja_Practice.xlsx data=N'); let d4 = null;
  if (ok(lk)) { await door('mis.new kind=PR_Patient Name=Aminah'); await door('mis.new kind=PR_Patient Name=Boon'); const v = await door('mis.new kind=PR_Visit Name=Checkup PR_Patient_ID=1');
    fs.writeFileSync(path.join(dir, 'dv.csv'), 'Name,PR_Patient_ID\nCheckup,Aminah\n'); fs.writeFileSync(path.join(dir, 'dv2.csv'), 'Name,PR_Patient_ID\nCheckup,Boon\n'); d4 = { v, same: await door('mis.diff kind=PR_Visit file=dv.csv'), diff: await door('mis.diff kind=PR_Visit file=dv2.csv') }; }
  if (!d4 || !ok(d4.v)) k.incon('D4', 'the visit could not be made: ' + (d4 && d4.v && d4.v.why || lk.why));
  else k.chk('D4 a lookup column is compared by the name of the record it points at: the visit of patient 1 reads the same against "Aminah" (its patient\'s name) and differs against "Boon", the change showing the stored name', ok(d4.same) && d4.same.answer.same === 1 && d4.same.answer.changed.length === 0 && ok(d4.diff) && d4.diff.answer.changed.length === 1 && d4.diff.answer.changed[0].changes[0].table === 'Aminah' && d4.diff.answer.changed[0].changes[0].sheet === 'Boon', 'same: ' + JSON.stringify(d4.same.answer.counts) + ' · other: ' + JSON.stringify(d4.diff.answer.changed));
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'mis.diff')[0];
  k.chk('D5 the vocabulary entry is generated: harm read, it names its witness', !!V && V.harm === 'read' && V.witness === 'common/door/tests/witness_mis_diff.js', JSON.stringify(V && { harm: V.harm }));
  k.end();
})().catch(e => { console.log('§W-MIS-DIFF ERROR ' + e.stack); process.exit(2); });
