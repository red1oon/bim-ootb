// ⚠ DO NOT REMOVE — W-RED1-RUN (bim-compiler prompts/CLI_ERP_IVR.md §25: `run` = erp.process, ONE verb for every dictionary process). READ THE LOG; an exit code is not evidence.
//   R1 ISSUE (a process "ran" but nothing was kept, or the wrong thing): `run "Set Project Type" 990000 C_ProjectType_ID=103` → the project's C_ProjectType_ID reads 103 after, and the op-log grew by the planned ops
//   R2 ISSUE (the questions are not the legacy dialog's): in a session, `run "Generate PO from Project"` asks C_Project_ID, C_ProjectPhase_ID, C_ProjectLine_ID, ConsolidateDocument in AD_Process_Para SeqNo order (an independent SQL), the default [Y] shown
//   R3 ISSUE (the printed line is not the line that ran): the `→ erp.process …` line, run alone through door.js on a fresh op-log, gives the same answer
//   R4 ISSUE (one-shot asks, or runs half-filled): `red1 'cd Project; run "Set Project Type" 990000'` asks nothing and is refused naming C_ProjectType_ID
//   R5 ISSUE (a process with no port pretends): a process with no JS port (picked from the dictionary, not named) is refused naming its class; the count of ported processes on the Project table is logged (X of N)
//   R6 ISSUE (a typo runs or is unhelpful): a misspelt process and a misspelt parameter are refused naming the nearest
//   Falsifiers: RUN_BREAK=skipcommit (the ops are not kept: must FAIL R1) · WORDS_BREAK=paramorder (the questions reversed: must FAIL R2).
//   Run: node common/door/tests/witness_red1_run.js > common/door/tests/logs/red1_run.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-RUN'), RED1 = path.join(ROOT, 'common/door/red1.js');
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1run_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_WARM: 'off' }; };
const run = (argv, env, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 300000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const envs = (o) => o.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
const mask = (a) => JSON.stringify(a, (key, v) => (key === 'request' || key === 'ms' ? undefined : v));
// a process with NO JS port and no mandatory parameter, read from the dictionary + the ports loaded (so the claim follows the parity lane's progress, never a name that goes stale)
async function noPortProcess() {
  const AP = require(path.join(ROOT, 'erp/ad_process.js')); fs.readdirSync(path.join(ROOT, 'erp/processes')).filter(f => /\.js$/.test(f)).forEach(f => { try { require(path.join(ROOT, 'erp/processes', f)); } catch (e) { /* skip */ } });
  const SQL = await require('sql.js')(), db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
  const r = db.exec("SELECT p.name, p.classname FROM ad_process p WHERE p.isactive='Y' AND p.classname IS NOT NULL AND p.classname<>'' AND NOT EXISTS (SELECT 1 FROM ad_process_para pp WHERE pp.ad_process_id=p.ad_process_id AND pp.isactive='Y' AND pp.ismandatory='Y' AND (pp.defaultvalue IS NULL OR pp.defaultvalue='')) ORDER BY p.ad_process_id");
  const hit = (r.length ? r[0].values : []).filter(x => !(AP.JAVA && AP.JAVA[x[1]]) && !AP.hasHandler(x[1]))[0];
  return hit ? { name: hit[0], classname: hit[1] } : null;
}
(async () => {
  // R1
  const e1 = fresh(), s1 = run([RED1, 'cd Project; run "Set Project Type" 990000 C_ProjectType_ID=103'], e1);
  const r1 = envs(s1.out).pop(), arrow = (s1.err.match(/^→ erp\.process .*$/m) || [''])[0].slice(2), opsN = nops(e1);
  const after = envs(run([DOOR, 'mis.read kind=Project id=990000'], e1).out).pop(), pt = after && after.answer ? JSON.stringify(after.answer).match(/"C_ProjectType_ID":\s*(\d+)/i) : null;
  k.L('R1 line=' + arrow + ' status=' + (r1 && r1.status) + ' planned=' + (r1 && r1.answer && r1.answer.planned) + ' op-log=' + opsN + ' after C_ProjectType_ID=' + (pt && pt[1]));
  k.chk('R1 `run "Set Project Type" 990000 C_ProjectType_ID=103` answers ok, the op-log grew by the planned ops, and the project reads C_ProjectType_ID 103 after', !!r1 && r1.status === 'ok' && r1.answer.planned > 0 && opsN === r1.answer.planned && !!pt && pt[1] === '103',
    'status=' + (r1 && r1.status) + ' planned=' + (r1 && r1.answer && r1.answer.planned) + ' oplog=' + opsN + ' after=' + (pt && pt[1]) + (r1 && r1.why ? ' why=' + r1.why : ''));
  // R3 the printed line alone, on a fresh op-log
  if (!arrow) k.incon('R3', 'no → line printed');
  else { const e3 = fresh(), a3 = envs(run([DOOR, '--actor', 'human', arrow], e3).out).pop();
    k.chk('R3 the printed `' + arrow + '`, run alone through door.js on a fresh op-log, gives the same answer', !!a3 && !!r1 && mask(a3.answer) === mask(r1.answer) && nops(e3) === opsN, 'alone=' + (a3 && a3.status) + ' ops ' + nops(e3) + ' vs ' + opsN); }
  // R2 questions in SeqNo order (independent SQL on the seed)
  let want = null; try { const SQL = await require('sql.js')(), db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
    const q = db.exec("SELECT pp.columnname, pp.defaultvalue FROM ad_process_para pp JOIN ad_process p ON p.ad_process_id=pp.ad_process_id WHERE p.name='Generate PO from Project' AND pp.isactive='Y' ORDER BY pp.seqno"); want = q.length ? q[0].values : []; } catch (e) { k.L('R2 sql: ' + e.message); }
  const s2 = run([RED1], fresh(), 'cd Project\nrun "Generate PO from Project"\n1\n1\n1\n\nexit\n').out;
  const asked = []; s2.split('\n').forEach(l => { let m = /^→ mis\.lookup column=(\w+) /.exec(l); if (m) asked.push(m[1]); /* §27: a table-direct parameter pick list is read by mis.lookup */ m = /\((\w+)\)\? \[/.exec(l); if (m) asked.push(m[1]); m = /^(\w+) \((\w+)\): nothing to pick from/.exec(l); if (m && asked[asked.length - 1] !== m[2]) asked.push(m[2]); });
  const def = /\(ConsolidateDocument\)\? \[(\w+)\]/.exec(s2), fin = (s2.match(/^→ erp\.process .*$/m) || [''])[0];
  k.L('R2 asked=' + JSON.stringify(asked) + ' want=' + JSON.stringify(want) + ' default shown=' + (def && def[1]) + ' final=' + fin);
  if (!want || !want.length) k.incon('R2', 'no AD_Process_Para rows read');
  else k.chk('R2 a session asks the ' + want.length + ' parameters of Generate PO from Project in SeqNo order (' + want.map(w => w[0]).join(', ') + '), shows the default [' + want[want.length - 1][1] + '], then prints the full line', JSON.stringify(asked) === JSON.stringify(want.map(w => w[0])) && !!def && def[1] === String(want[want.length - 1][1]) && / C_Project_ID=990000 /.test(fin) && /ConsolidateDocument=Y/.test(fin), 'asked=' + asked.join(',') + ' final=' + fin);
  // R4 one-shot asks nothing
  const s4 = run([RED1, 'cd Project; run "Set Project Type" 990000'], fresh()), r4 = envs(s4.out).pop();
  k.chk('R4 one-shot `run "Set Project Type" 990000` asks nothing and is refused naming C_ProjectType_ID', !!r4 && r4.status === 'refused' && /missing parameter: C_ProjectType_ID/.test(r4.why || '') && !/\? \[/.test(s4.out), 'status=' + (r4 && r4.status) + ' why=' + (r4 && r4.why));
  // R5 no port: refused naming the class; X of N
  const np = await noPortProcess(), r5 = np ? envs(run([DOOR, 'erp.process name="' + np.name + '" record=990000 kind=Project'], fresh()).out).pop() : null;
  try { const AP = require(path.join(ROOT, 'erp/ad_process.js')); fs.readdirSync(path.join(ROOT, 'erp/processes')).filter(f => /\.js$/.test(f)).forEach(f => { try { require(path.join(ROOT, 'erp/processes', f)); } catch (e) { /* skip */ } });
    const SQL = await require('sql.js')(), db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
    const q = db.exec("SELECT DISTINCT p.name, p.classname FROM ad_process p JOIN ad_column c ON c.ad_process_id=p.ad_process_id JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='c_project' AND p.isactive='Y'");
    const rows = q.length ? q[0].values : [], ported = rows.filter(r => r[1] && (AP.JAVA && AP.JAVA[r[1]] || AP.hasHandler(r[1])));
    k.L('§RED1_RUN_COVERAGE Project-window buttons: ' + ported.length + ' of ' + rows.length + ' run (' + ported.map(r => r[0]).join(', ') + '); not ported: ' + rows.filter(r => ported.indexOf(r) < 0).map(r => r[0]).join(', '));
  } catch (e) { k.L('R5 coverage: ' + e.message); }
  if (!np) k.incon('R5', 'every process has a port: nothing to refuse'); else k.chk('R5 a process with no JS port (' + np.name + ', from the dictionary) is refused naming its class', !!r5 && r5.status === 'refused' && (r5.why || '').indexOf('no JS port yet (class ' + np.classname + ')') >= 0, r5 && r5.why);
  // R6 typos
  const t1 = envs(run([DOOR, 'erp.process name="Set Projct Type" record=990000'], fresh()).out).pop(), t2 = envs(run([DOOR, 'erp.process name="Set Project Type" record=990000 C_ProjectTyp=103'], fresh()).out).pop();
  k.chk('R6 a misspelt process and a misspelt parameter are refused naming the nearest (Set Project Type, C_ProjectType_ID)', !!t1 && t1.status === 'refused' && /nearest: Set Project Type/.test(t1.why) && !!t2 && t2.status === 'refused' && /nearest: C_ProjectType_ID/.test(t2.why), (t1 && t1.why) + ' | ' + (t2 && t2.why));
  k.end();
})().catch(e => { console.log('§W-RED1-RUN FAIL ' + (e && e.stack || e)); process.exit(1); });
