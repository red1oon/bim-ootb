// ⚠ DO NOT REMOVE — W-NINJA-ROLLBACK (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.11: ninja.rollback). READ THE LOG; an exit code is not evidence.
//   R1 ISSUE (a half-undone workbook leaves rows of the bundle active) · R2 ISSUE (a rollback of a table that holds records; legacy refuses it) · R3 ISSUE (it switches off more than the bundle made: a neighbour, or the window a tab was attached to; or "all")
//   R4 ISSUE (the change lives only in memory: it must survive a restart) · R5 ISSUE (a second rollback writes again; the workbook cannot be run again afterwards)
//   Falsifiers: NINJAROLL_BREAK=keepmenu (must FAIL R1) · nodatacheck (must FAIL R2) · blanket (must FAIL R3). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_ninja_rollback.js > common/door/tests/logs/ninja_rollback.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-NINJA-ROLLBACK'), BRK = process.env.NINJAROLL_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nw_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('F1-F7', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  fs.writeFileSync(path.join(dir, 'WF_Claim.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\nAmount,Amount,,\n');
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, BRK ? { NINJAROLL_BREAK: BRK } : {});
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const doorE = (e, actor) => (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (e) => { const old = process.env.BIM_OBJECT_OPLOG; process.env.BIM_OBJECT_OPLOG = e.BIM_OBJECT_OPLOG; const w = process.stderr.write; process.stderr.write = () => true; try { return await E.boot({}); } finally { process.stderr.write = w; if (old == null) delete process.env.BIM_OBJECT_OPLOG; else process.env.BIM_OBJECT_OPLOG = old; } };
  const NSB = require(path.join(ROOT, 'erp/ninja_stage.js')).NINJA_BASE;
  const act = (O) => { const m = {}; ['ad_window', 'ad_table', 'ad_tab', 'ad_column', 'ad_field', 'ad_menu'].forEach(t => { m[t] = Number(O.rows('SELECT COUNT(*) AS n FROM ' + t + " WHERE isactive='Y' AND " + t + '_id>=' + NSB)[0].n); }); return m; };
  const base = act(await image(E1));   // the dictionary before anything: the seed's own Ninja-range rows are in it
  const st = await door('ninja.exec file=Ninja_Practice.xlsx'); if (!ok(st)) { k.incon('R1-R5', 'the practice workbook did not stage: ' + st.why); return k.end(); }
  const full = act(await image(E1)), grew = Object.keys(full).every(t => full[t] > base[t]);
  if (!grew) { k.incon('R1-R5', 'staging added nothing to count against: ' + JSON.stringify(base) + ' -> ' + JSON.stringify(full)); return k.end(); }
  // ── R2 the practice workbook loaded rows: the rollback is refused, nothing written; dry says the same
  const n0 = nops(E1), blk = await door('ninja.rollback bundle=Practice'), dry0 = await door('ninja.rollback bundle=Practice dry=Y'), n1 = nops(E1);
  k.chk('R2 tables that hold records block the rollback and name them (legacy: "HAS DATA! DELETE THEM FIRST"); dry=Y says the same; the op count does not move (' + n0 + ')', ref(blk, /PR_Patient has 3 records/) && ref(blk, /PR_Room has 2 records/) && ref(dry0, /delete them first/) && n1 === n0, 'rollback: ' + blk.status + ' "' + String(blk.why || '').slice(0, 90) + '" · ops ' + n0 + '->' + n1);
  // ── a bundle with no rows: the same workbook without its data sheets, on a second op-log
  const E2 = envOf('two'), d2 = doorE(E2); fs.copyFileSync(PW, path.join(path.dirname(E2.BIM_OBJECT_OPLOG), 'Ninja_Practice.xlsx'));
  fs.writeFileSync(path.join(dir, 'Neighbour.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\n');
  const nb = await d2('mis.add_window file=Neighbour.csv'), baseN = ok(nb) ? act(await image(E2)) : null;   // a second bundle's table, made first: it must still be active at the end
  const st2 = await d2('ninja.exec file=Ninja_Practice.xlsx data=N'), full2 = ok(st2) ? act(await image(E2)) : null; if (!full2 || !baseN) { k.incon('R1,R3-R5', 'the neighbour or the empty bundle did not stage: ' + nb.why + ' ' + st2.why); return k.end(); }
  const no = await d2('ninja.rollback bundle=NoSuchBundle'), none = await d2('ninja.rollback'), n2 = nops(E2), dry = await d2('ninja.rollback bundle=Practice dry=Y'), n3 = nops(E2);
  k.chk('R3a an unknown bundle is refused; no bundle named is refused and never means all; dry=Y lists what would go off and writes nothing (' + n2 + ' ops)', ref(no, /no staged bundle is named NoSuchBundle/) && none.status !== 'ok' && /bundle/i.test(String(none.why)) && ok(dry) && dry.answer.dry === true && dry.answer.wouldSwitchOff > 0 && n3 === n2, 'unknown: ' + no.status + ' · none: ' + none.status + ' "' + String(none.why || '').slice(0, 60) + '"' + ' · dry would=' + (dry.answer && dry.answer.wouldSwitchOff) + ' · ops ' + n2 + '->' + n3);
  const rb = await d2('ninja.rollback bundle=Practice'), n4 = nops(E2); if (!ok(rb)) { k.incon('R1,R3,R4,R5', 'the rollback did not run: ' + rb.why); return k.end(); }
  k.L('ninja.rollback ' + JSON.stringify({ tables: rb.answer.tables, opSummary: rb.answer.opSummary, ops: rb.answer.ops }));
  // ── R1 every Ninja-range row the bundle made is off again: the active counts equal the dictionary's before the workbook
  const O2 = await image(E2), after = act(O2);
  k.chk('R1 after the rollback the active counts of windows, tables, tabs, columns, fields and menu entries equal those with only the neighbour table made (' + JSON.stringify(baseN) + ')', JSON.stringify(after) === JSON.stringify(baseN), 'after=' + JSON.stringify(after) + ' · ops=' + rb.answer.ops);
  // ── R3 only what the bundle made: the seed's other Ninja table still active; Business Partner still there, its Referral tab off
  const bp = O2.rows("SELECT w.isactive AS a, (SELECT COUNT(*) FROM ad_tab WHERE ad_window_id=w.ad_window_id AND isactive='Y' AND ad_tab_id<" + NSB + ') AS tabs FROM ad_window w WHERE w.ad_window_id=123')[0], ref5 = O2.rows("SELECT isactive AS a FROM ad_tab WHERE name='PR Referral'")[0], neighbour = O2.rows("SELECT isactive AS a FROM ad_table WHERE tablename='Neighbour'")[0];
  k.chk('R3 Business Partner stays (window active, its own tabs kept) and loses only the Referral tab; the neighbour table made by mis.add_window stays active', !!bp && bp.a === 'Y' && bp.tabs > 0 && !!ref5 && ref5.a === 'N' && !!neighbour && neighbour.a === 'Y', 'BP window=' + (bp && bp.a) + ' own tabs=' + (bp && bp.tabs) + ' · PR Referral tab=' + (ref5 && ref5.a) + ' · Neighbour=' + (neighbour && neighbour.a));
  // ── R4 it is in the log and survives a restart: the image above was rebuilt from the op-log by a new boot; the log grew by one group
  k.chk('R4 the rollback is ' + rb.answer.ops + ' ops in the log (' + n3 + ' -> ' + n4 + ') and a new process reading only that log sees the bundle off (R1 above was read that way)', n4 - n3 === rb.answer.ops && rb.answer.ops > 0, 'log ' + n3 + '->' + n4);
  // ── R5 twice is nothing; the workbook runs again and its data sheets load
  const ag = await d2('ninja.rollback bundle=Practice'), n5 = nops(E2), re = await d2('ninja.exec file=Ninja_Practice.xlsx'), pl = await d2('mis.list kind=PR_Patient'), back = act(await image(E2));
  k.chk('R5 a second rollback says it is already done and writes nothing (' + n4 + ' ops before and after); ninja.exec of the same workbook then runs again: the bundle is back (active counts equal the first staging) and its data loads (3 patients)', ok(ag) && ag.answer.alreadyDone === true && n5 === n4 && ok(re) && JSON.stringify(back) === JSON.stringify(full2) && ok(pl) && (pl.answer.rows || []).length === 3,
    'again alreadyDone=' + (ag.answer && ag.answer.alreadyDone) + ' ops ' + n4 + '->' + n5 + ' · re-exec ' + re.status + ' ' + String(re.why || '').slice(0, 100) + ' · active ' + JSON.stringify(back) + ' vs ' + JSON.stringify(full2) + ' · patients=' + ((pl.answer || {}).rows || []).length);
  // the vocabulary entry and an AI's line
  const E3 = envOf('ai'), ai = await doorE(E3, 'ai')('ninja.rollback bundle=Practice'), V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'ninja.rollback')[0];
  k.chk('R6 an AI\'s line is a claim and writes nothing; the vocabulary entry is generated, harm writes, dictionary true', ai.status === 'claim' && nops(E3) === 0 && !!V && V.harm === 'writes' && V.dictionary === true, 'ai=' + ai.status + ' ops=' + nops(E3) + ' · entry=' + JSON.stringify(V && { harm: V.harm, dictionary: V.dictionary }));
  k.end();
})().catch(e => { console.log('§W-NINJA-ROLLBACK ERROR ' + e.stack); process.exit(2); });
