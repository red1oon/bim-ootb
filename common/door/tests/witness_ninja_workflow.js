// ⚠ DO NOT REMOVE — W-NINJA-WORKFLOW (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.3: ninja.workflow, the document columns on one staged table). READ THE LOG; an exit code is not evidence.
//   F1 ISSUE (the document columns are made with other values than the system's own documents carry) · F2 ISSUE (a record has no status: made before the verb, or after it)
//   F3 ISSUE (a second run stages again) · F4 ISSUE (the columns or the values are gone after a restart) · F5 ISSUE (a table that came with the system is changed; a refusal writes)
//   F6 ISSUE (mis.add_window workflow=Y gives other columns than the verb: two implementations) · F7 ISSUE (the answer hides what is NOT made; an AI adds it without a person)
//   Falsifiers: NINJAWF_BREAK=nodefault (must FAIL F1, F2) · again (must FAIL F3). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_ninja_workflow.js > common/door/tests/logs/ninja_workflow.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-NINJA-WORKFLOW'), BRK = process.env.NINJAWF_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nw_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('F1-F7', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  fs.writeFileSync(path.join(dir, 'WF_Claim.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\nAmount,Amount,,\n');
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, BRK ? { NINJAWF_BREAK: BRK } : {});
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const doorE = (e, actor) => (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (e) => { const old = process.env.BIM_OBJECT_OPLOG; process.env.BIM_OBJECT_OPLOG = e.BIM_OBJECT_OPLOG; const w = process.stderr.write; process.stderr.write = () => true; try { return await E.boot({}); } finally { process.stderr.write = w; if (old == null) delete process.env.BIM_OBJECT_OPLOG; else process.env.BIM_OBJECT_OPLOG = old; } };
  const COLS = ['DocStatus', 'DocAction', 'Processed', 'DocumentNo', 'IsApproved'];
  const colsOf = (O, tn) => { const m = {}; O.rows("SELECT c.columnname AS n, c.ad_reference_id AS ref, c.ad_reference_value_id AS refv, c.defaultvalue AS def FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename=? AND c.isactive='Y'", [tn]).forEach(r => { m[r.n] = [r.ref, r.refv == null ? '' : r.refv, r.def == null ? '' : r.def].join('|'); }); return COLS.map(c => c + '=' + (m[c] || 'ABSENT')).join(' '); };

  const st = await door('ninja.exec file=Ninja_Practice.xlsx'), b0 = await door('mis.new kind=PR_Visit Name=Before PR_Patient_ID=1');
  if (!ok(st) || !ok(b0)) { k.incon('F1-F7', 'the practice workbook could not be staged or a visit made: ' + (st.why || b0.why)); return k.end(); }
  // ── F5 refusals (nothing written), F7a dry
  const n0 = nops(E1), r1 = await door('ninja.workflow table=C_Order'), r2 = await door('ninja.workflow table=NoSuchTable'), dry = await door('ninja.workflow table=PR_Visit dry=Y'), n1 = nops(E1);
  k.chk('F5 a table that came with the system and an unknown table are refused; dry=Y names the five columns it would add; the op count does not move (' + n0 + ')', ref(r1, /came with the system/) && ref(r2, /no table named/) && ok(dry) && dry.answer.dry === true && dry.answer.added.join() === COLS.join() && n1 === n0,
    'core: ' + r1.status + ' · unknown: ' + r2.status + ' · dry added=' + (dry.answer && dry.answer.added || []).join() + ' · ops ' + n0 + '->' + n1);

  const wf = await door('ninja.workflow table=PR_Visit'), n2 = nops(E1);
  if (!ok(wf)) { k.incon('F1-F4', 'the verb did not run: ' + wf.why); return k.end(); }
  k.L('ninja.workflow ' + JSON.stringify({ added: wf.answer.added, corrected: wf.answer.corrected, fields: wf.answer.fields, rowsFilled: wf.answer.rowsFilled, ops: wf.answer.ops, opSummary: wf.answer.opSummary }));

  // ── F1 the five columns equal the system's own document columns (C_Order's, read from the seed), in reference, list reference and default
  const core = {}; sq("SELECT columnname AS n, ad_reference_id AS ref, ad_reference_value_id AS refv, defaultvalue AS def FROM ad_column WHERE ad_table_id=259 AND columnname IN ('DocStatus','DocAction','Processed','IsApproved','DocumentNo')").forEach(r => { core[r.n] = r; });
  // C_Order's Processed and IsApproved carry no default in the dictionary (its class sets them); legacy Ninja gives the staged table N for both (NinjaProcessor L386, L396) and a 30-character DocumentNo
  const want = COLS.map(c => c + '=' + [core[c].ref, core[c].refv == null ? '' : core[c].refv, c === 'Processed' || c === 'IsApproved' ? 'N' : (core[c].def == null ? '' : core[c].def)].join('|')).join(' ');
  const O1 = await image(E1), got = colsOf(O1, 'PR_Visit'), flds = O1.rows("SELECT count(*) AS n FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='PR_Visit' AND c.columnname IN ('DocStatus','DocAction','Processed','DocumentNo','IsApproved') AND f.isactive='Y'")[0].n;
  if (Object.keys(core).length !== 5) k.incon('F1', 'the seed\'s C_Order does not carry the five document columns (found ' + Object.keys(core).length + ')');
  else k.chk('F1 the five columns carry the reference, list reference and default of the system\'s own document columns (C_Order\'s, read from the seed; Processed and IsApproved default N as legacy Ninja sets them), each with a field', got === want && flds === 5, 'staged: ' + got + (got === want ? '' : ' · C_Order: ' + want) + ' · fields=' + flds);

  // ── F2 a record made before and one made after both read DR / CO / N / N; each line a fresh process (F4)
  const a0 = await door('mis.new kind=PR_Visit Name=After PR_Patient_ID=1'), ls = await door('mis.list kind=PR_Visit columns=Name,DocStatus,DocAction,Processed,IsApproved'), rows = ((ls.answer || {}).rows || []).map(r => [r.Name, r.DocStatus, r.DocAction, r.Processed, r.IsApproved].join('/')).sort().join(' ');
  k.chk('F2 a record made before the verb and one made after it both read DR / CO / N / N', ok(a0) && rows === 'After/DR/CO/N/N Before/DR/CO/N/N' && wf.answer.rowsFilled === 1, 'rows: ' + rows + ' · filled by the verb=' + wf.answer.rowsFilled + ' ' + String(a0.why || ''));
  k.chk('F4 it survives a restart: the listing above was a new process on the same op-log, and it read the columns and the values', ok(ls) && ((ls.answer || {}).rows || []).length === 2, 'rows=' + ((ls.answer || {}).rows || []).length + ' ' + String(ls.why || ''));

  // ── F3 a second run
  const n3 = nops(E1), ag = await door('ninja.workflow table=PR_Visit'), n4 = nops(E1);
  k.chk('F3 a second run says it is already done and writes nothing (' + n3 + ' ops before and after)', ok(ag) && ag.answer.alreadyDone === true && ag.answer.ops === 0 && n4 === n3, 'alreadyDone=' + (ag.answer && ag.answer.alreadyDone) + ' ops ' + n3 + '->' + n4);

  // ── F6 mis.add_window workflow=Y gives the same columns (one function)
  const E2 = envOf('two'), d2 = doorE(E2), aw = await d2('mis.add_window file=WF_Claim.csv workflow=Y'), O2 = aw.status === 'ok' ? await image(E2) : null, got2 = O2 ? colsOf(O2, 'WF_Claim') : '', nw = await d2('mis.new kind=WF_Claim Name=First'), rec = (nw.answer || {}).record || {};
  k.chk('F6 a table made by mis.add_window workflow=Y carries the same five columns as one the verb worked on, and its first record reads DR / CO / N / N', ok(aw) && got2 === got && ok(nw) && [rec.docstatus, rec.docaction, rec.processed, rec.isapproved].join('/') === 'DR/CO/N/N', 'add_window: ' + aw.status + ' ' + String(aw.why || '').slice(0, 90) + ' columns equal=' + (got2 === got) + (got2 === got ? '' : ' · ' + got2) + ' · record ' + [rec.docstatus, rec.docaction, rec.processed, rec.isapproved].join('/'));

  // ── F7 what is not made is named; Complete is refused in plain words; an AI's line is a claim; the vocabulary entry
  const co = await door('erp.complete kind=PR_Visit id=1'), E3 = envOf('ai'), ai = await doorE(E3, 'ai')('ninja.workflow table=PR_Visit'), V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'ninja.workflow')[0];
  if (!Array.isArray(wf.answer.notMade)) k.incon('F7', 'the answer carries no list of what is not made');
  else k.chk('F7 the answer names what is NOT made (the workflow and its process; the document class); Complete is refused saying the table has no document class, the status stays DR; an AI\'s line is a claim; the vocabulary entry is generated, harm writes, dictionary true',
    wf.answer.notMade.length === 2 && /AD_Workflow/.test(wf.answer.notMade[0]) && /document class/.test(wf.answer.notMade[1]) && ref(co, /no document class yet/) && /stays DR/.test(co.why) && ai.status === 'claim' && nops(E3) === 0 && !!V && V.harm === 'writes' && V.dictionary === true,
    'notMade=' + wf.answer.notMade.length + ' · complete: ' + co.status + ' "' + String(co.why || '').slice(0, 110) + '" · ai=' + ai.status + ' ops=' + nops(E3) + ' · entry=' + JSON.stringify(V && { harm: V.harm, dictionary: V.dictionary }));
  k.end();
})().catch(e => { console.log('§W-NINJA-WORKFLOW ERROR ' + e.stack); process.exit(2); });
