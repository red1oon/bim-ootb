// ⚠ DO NOT REMOVE — W-NINJA-EXEC (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.2: ninja.exec, a whole Ninja workbook at the door). READ THE LOG; an exit code is not evidence.
//   E1 ISSUE (the door stages another shape than the stager: a detail lands in its own window) · E2 ISSUE (a record cannot be made under its master, or a master does not show its child rows)
//   E2c ISSUE (no parent of ANY table shows its child rows: the lookup key's case) · E3 ISSUE (the workbook is gone after a restart) · E4 ISSUE (the data sheets are not loaded, or a misnamed sheet is silently dropped)
//   E5 ISSUE (a second run stages again; a refusal leaves something written) · E6 ISSUE (a dry run writes; an AI stages a workbook without a person)
//   E7 ISSUE (the owner's own workbook does not go through) · E8 the cost of the line, logged (no threshold)
//   Falsifiers: NINJAEXEC_BREAK=nodetail (must FAIL E1) · onegroup (E3) · nodata (E4) · nochild (E2, E2c). The owner's workbook: NINJA_HRMIS=<path>; absent = INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_ninja_exec.js > common/door/tests/logs/ninja_exec.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-NINJA-EXEC'), BRK = process.env.NINJAEXEC_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nx_')), XL = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), NS = require(path.join(ROOT, 'erp/ninja_stage.js')), NM = require(path.join(ROOT, 'erp/ninja_model.js'));
  const HDR = ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'];
  const MODEL = [['', 'ZX_Dept', 'Name,L#Grade=Junior/Senior'], ['ZX_Dept', 'ZX_Staff', 'Name,D#DateStart'], ['ZX_Dept', 'ZX_Leave', 'Name,Q#Days'], ['ZX_Leave', 'ZX_LeaveLine', 'Name,A#Amount']];
  const book = (file, model, extra) => {   // the same sheet shapes as the owner's workbook: a header sheet, the model sheet, data sheets named after a table
    const wb = XL.utils.book_new(), add = (n, rows) => XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(rows), n);
    add('1_RO_ModelHeader', [['Name', 'Version'], ['FixHR', '1']]);
    add('2_RO_ModelMaker', [HDR].concat(model.map((m, i) => ['FixHR', i + 1, 'N', 'N', m[0], m[1], '', m[2]])));
    add('ZX_Dept', [['Name'], ['Sales'], ['Stores']].concat(extra || [])); add('ZX_Staff', [['Name', 'DateStart']]); add('ZX_Nothing', [['Name'], ['x']]);
    fs.writeFileSync(path.join(dir, file), XL.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  };
  book('fix.xlsx', MODEL); book('fix_other.xlsx', MODEL, [['Third']]);
  book('fix_core.xlsx', [['', 'C_Order', 'Name']]); book('fix_bad.xlsx', [['', 'ZY_Bad', 'Name,Z#Odd']]);
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, BRK ? { NINJAEXEC_BREAK: BRK } : {});
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const doorE = (e, actor, timed) => (line) => new Promise((res) => { let o = '', er = ''; const argv = timed ? ['-v', process.execPath, DOOR, '--actor', actor || 'human', line] : [DOOR, '--actor', actor || 'human', line];
    const p = cp.spawn(timed ? '/usr/bin/time' : process.execPath, argv, { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { er += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } j = j || { status: 'unparseable', why: (o + er).slice(-300) }; j.err = er; res(j); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');

  // ── E6a dry
  const dry = await door('ninja.exec file=fix.xlsx dry=Y');
  k.chk('E6a dry=Y writes nothing and names the 4 tables with their masters, the data sheets with their rows, and the sheet it would skip', ok(dry) && dry.answer.dry === true && dry.answer.tables.map(t => t.table + '<' + (t.master || '')).join() === 'ZX_Dept<,ZX_Staff<ZX_Dept,ZX_Leave<ZX_Dept,ZX_LeaveLine<ZX_Leave' && dry.answer.dataSheets.map(s => s.sheet + ':' + s.rows).join() === 'ZX_Dept:2,ZX_Staff:0' && dry.answer.skipped.map(s => s.sheet).join() === 'ZX_Nothing' && nops(E1) === 0,
    'tables=' + (dry.answer && dry.answer.tables || []).map(t => t.table + '<' + (t.master || '')).join() + ' data=' + JSON.stringify(dry.answer && dry.answer.dataSheets) + ' skipped=' + JSON.stringify(dry.answer && dry.answer.skipped) + ' ops=' + nops(E1) + ' ' + String(dry.why || ''));
  // ── E5a refusals before anything is staged
  const r1 = await door('ninja.exec file=fix_core.xlsx'), r2 = await door('ninja.exec file=fix_bad.xlsx'), r3 = await door('ninja.exec file=../fix.xlsx'), r4 = await door('ninja.exec file=fix.csv');
  k.chk('E5a refused, nothing written: a table name of the core dictionary; a faulty model (its fault listed); a file outside the folder; a file that is not a workbook', ref(r1, /already exists? in the dictionary/) && /C_Order/.test(r1.why) && ref(r2, /fault/) && /Odd|Z#/.test(r2.why) && ref(r3, /leaves it/) && ref(r4, /must be a workbook/) && nops(E1) === 0,
    'core: ' + r1.status + ' · bad: ' + r2.status + ' "' + String(r2.why || '').slice(0, 110) + '" · outside: ' + r3.status + ' · csv: ' + r4.status + ' · ops=' + nops(E1));

  // ── the run
  const run = await doorE(E1, 'human', true)('ninja.exec file=fix.xlsx'), n1 = nops(E1);
  if (!ok(run)) { k.incon('E1-E5', 'the workbook could not be staged: ' + run.why); return k.end(); }
  k.L('staged ' + JSON.stringify(run.answer.opSummary) + ' windows=' + JSON.stringify(run.answer.windows) + ' detailTabs=' + run.answer.detailTabs + ' data=' + JSON.stringify(run.answer.dataSheets) + ' notChecked=' + JSON.stringify(run.notChecked));

  // ── E1 the door's shape = the stager's own on an untouched seed (windows, tabs, levels, order, parent columns), N = the model's tables
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) }), ref0 = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
  const pm = NM.parseSheet([HDR].concat(MODEL.map((m, i) => ['FixHR', i + 1, 'N', 'N', m[0], m[1], '', m[2]])), { format: 'romo', bundleName: 'FixHR' }), model = pm.model || pm;
  const lg = console.log; console.log = () => {}; try { NS.stageModels(ref0, model, 0); } finally { console.log = lg; }
  const SHAPE = "SELECT t.tablename AS tn, tb.ad_window_id AS win, tb.tablevel AS lvl, tb.seqno AS seq, (SELECT group_concat(c.columnname) FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND c.isparent='Y' AND c.isactive='Y') AS parent, (SELECT count(*) FROM ad_window w WHERE w.ad_window_id=tb.ad_window_id AND w.isactive='Y') AS winOn FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id WHERE tb.isactive='Y' AND t.ad_table_id>=" + NS.NINJA_BASE + " AND t.tablename LIKE 'ZX!_%' ESCAPE '!' ORDER BY t.tablename";
  const want = (() => { const r = ref0.exec(SHAPE); return r.length ? r[0].values.map(v => v.join('|')) : []; })();
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (e) => { const old = process.env.BIM_OBJECT_OPLOG; process.env.BIM_OBJECT_OPLOG = e.BIM_OBJECT_OPLOG; const w = process.stderr.write; process.stderr.write = () => true; try { return await E.boot({}); } finally { process.stderr.write = w; if (old == null) delete process.env.BIM_OBJECT_OPLOG; else process.env.BIM_OBJECT_OPLOG = old; } };
  let bootErr = ''; const O1 = await image(E1).catch(e => { bootErr = String(e && e.message || e).slice(0, 120); return null; }), got = O1 ? O1.rows(SHAPE).map(r => [r.tn, r.win, r.lvl, r.seq, r.parent, r.winon].join('|')) : [];   // an op-log a fresh process cannot replay is a FAIL of E1, not a crash of the witness
  const wins = {}; got.forEach(g => { wins[g.split('|')[1]] = 1; });
  if (!want.length) k.incon('E1', 'VACUOUS: the stager made no tab');
  else k.chk('E1 every window has its tabs as the stager makes them: ' + want.length + ' of ' + model.tables.length + ' tables are tabs, in ' + Object.keys(wins).length + ' window, with the same level, order and parent column as the stager\'s own rows on an untouched seed (three detail tabs, one of them two levels down)',
    JSON.stringify(want) === JSON.stringify(got) && want.length === model.tables.length && Object.keys(wins).length === 1 && run.answer.detailTabs === 3 && got.filter(g => g.split('|')[2] === '2').length === 1, 'door=' + JSON.stringify(got) + (bootErr ? ' (a fresh process cannot replay the op-log: ' + bootErr + ')' : '') + (JSON.stringify(want) === JSON.stringify(got) ? '' : ' stager=' + JSON.stringify(want)));

  // ── E2 a record all the way down, each line a fresh process (so E3 too); the master shows its child
  const lv = await door('mis.new kind=ZX_Leave Name=Annual ZX_Dept_ID=1 Days=3'), ll = await door('mis.new kind=ZX_LeaveLine Name=Day1 ZX_Leave_ID=1 Amount=10'), st = await door('mis.new kind=ZX_Staff Name=Ali ZX_Dept_ID=1 role=102');
  const rd = await door('mis.read kind=ZX_Dept id=1'), rl = await door('mis.read kind=ZX_Leave id=1'), kids = (j) => ((j.answer || {}).children || []).map(c => c.kind + ':' + c.rows.length).join();
  k.chk('E2 a record goes all the way down: a leave under department 1, a line under that leave, a staff member under role 102; the department shows 1 staff and 1 leave, the leave shows its 1 line', ok(lv) && ok(ll) && ok(st) && ok(rd) && ok(rl) && kids(rd) === 'ZX Staff:1,ZX Leave:1' && kids(rl) === 'ZX LeaveLine:1',
    'leave=' + lv.status + ' line=' + ll.status + ' staff(role 102)=' + st.status + ' ' + String(lv.why || ll.why || st.why || '').slice(0, 120) + ' · dept children=' + kids(rd) + ' · leave children=' + kids(rl));
  const core = sq('SELECT c_order_id AS id, count(*) AS n FROM c_orderline GROUP BY c_order_id ORDER BY n DESC, c_order_id LIMIT 1')[0], ro = core ? await doorE(envOf('core'))('mis.read kind=C_Order id=' + core.id) : null, cl = ro && ro.answer && ro.answer.children ? ro.answer.children[0] : null;
  if (!core) k.incon('E2c', 'VACUOUS: the seed holds no order line');
  else k.chk('E2c a core parent shows its child rows too: order ' + core.id + ' lists its ' + core.n + ' line' + (core.n > 1 ? 's' : '') + ' (counted from the seed by SQL)', !!cl && cl.rows.length === core.n, 'first child tab ' + (cl ? cl.kind + ':' + cl.rows.length : 'none') + ' seed=' + core.n);

  // ── E3 restart: a new process lists what the others made
  const l3 = await door('mis.list kind=ZX_LeaveLine'), l4 = await door('mis.list kind=ZX_Dept names=Y');
  k.chk('E3 it survives a restart: separate processes on the same op-log list the line made two levels down and the departments', ok(l3) && l3.answer.total === 1 && l4 && l4.answer && l4.answer.total >= 1, 'lines=' + (l3.answer && l3.answer.total) + ' ' + String(l3.why || '') + ' depts=' + (l4.answer && l4.answer.total) + ' ' + String(l4.why || '').slice(0, 100));

  // ── E4 the data sheets
  const ds = run.answer.dataSheets || [], dOf = (n) => ds.filter(s => s.sheet === n)[0] || {}, names = ((l4.answer || {}).rows || []).map(r => r.Name).sort().join();
  k.chk('E4 the data sheet\'s 2 rows are there by name (Sales, Stores); the sheet with a header only loaded nothing and says so; the misnamed sheet is named as skipped', dOf('ZX_Dept').loaded === 2 && names === 'Sales,Stores' && dOf('ZX_Staff').loaded === 0 && /no rows/.test(String(dOf('ZX_Staff').why)) && (run.answer.skipped || []).map(s => s.sheet).join() === 'ZX_Nothing',
    'ZX_Dept ' + JSON.stringify(dOf('ZX_Dept')) + ' names=' + names + ' ZX_Staff ' + JSON.stringify(dOf('ZX_Staff')) + ' skipped=' + JSON.stringify(run.answer.skipped));

  // ── E5b run twice; another workbook over the same tables
  const b0 = nops(E1), again = await door('ninja.exec file=fix.xlsx'), b1 = nops(E1), other = await door('ninja.exec file=fix_other.xlsx'), b2 = nops(E1);
  k.chk('E5b the same workbook a second time writes nothing and says it is already staged; another workbook over the same tables is refused naming them; the op count does not move (' + b0 + ')', ok(again) && again.answer.alreadyStaged === true && again.answer.ops === 0 && b1 === b0 && ref(other, /already staged here/) && /ZX_Dept/.test(other.why) && b2 === b0,
    'again=' + again.status + ' alreadyStaged=' + (again.answer && again.answer.alreadyStaged) + ' ops ' + b0 + '->' + b1 + '->' + b2 + ' other=' + other.status + ' "' + String(other.why || '').slice(0, 90) + '"');

  // ── E6b an AI's line is a claim; the vocabulary entry
  const E4 = envOf('ai'), ai = await doorE(E4, 'ai')('ninja.exec file=fix.xlsx'), V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'ninja.exec')[0];
  k.chk('E6b an AI\'s ninja.exec is held as a claim, nothing written; the vocabulary entry is generated, harm writes, dictionary true, human+ai', ai.status === 'claim' && nops(E4) === 0 && !!V && V.harm === 'writes' && V.dictionary === true && V.actors.join() === 'human,ai', 'ai=' + ai.status + ' ops=' + nops(E4) + ' entry=' + JSON.stringify(V && { harm: V.harm, dictionary: V.dictionary }));

  // ── E8 the cost of the fixture's line (the owner's workbook: under E7)
  const cost = (j) => ({ wall: (/Elapsed \(wall clock\) time.*\): ([\d:.]+)/.exec(j.err) || [])[1], rssMb: Math.round(Number((/Maximum resident set size \(kbytes\): (\d+)/.exec(j.err) || [])[1] || 0) / 1024) });
  const c1 = cost(run); k.L('E8 cost fixture: wall=' + c1.wall + ' peak_rss_mb=' + c1.rssMb + ' ops=' + n1 + ' oplog_bytes=' + fs.statSync(E1.BIM_OBJECT_OPLOG).size + ' engine_ms=' + run.answer.ms);

  // ── E7 the owner's workbook
  const H = process.env.NINJA_HRMIS;
  if (!H || !fs.existsSync(H)) k.incon('E7', 'the owner\'s workbook is not on this machine (set NINJA_HRMIS=<path to Ninja_HRMIS.xlsx>)');
  else {
    fs.copyFileSync(H, path.join(dir, 'hrmis.xlsx'));
    const E7 = envOf('hrmis'), d7 = doorE(E7), asIs = await d7('ninja.exec file=hrmis.xlsx');
    // HR_Payroll is a table of the core dictionary (the seed's payroll): the workbook as it is must be refused naming it, nothing written. The rest is judged on a copy with that one table renamed in the model sheet.
    const coreHas = sq("SELECT count(*) AS n FROM ad_table WHERE tablename='HR_Payroll' AND ad_table_id<" + NS.NINJA_BASE)[0].n;
    k.chk('E7a the owner\'s workbook as it is: ' + (coreHas ? 'refused naming HR_Payroll (a table the core dictionary already holds), nothing written' : 'staged'), coreHas ? (ref(asIs, /already exists? in the dictionary/) && /HR_Payroll\b/.test(asIs.why) && nops(E7) === 0) : ok(asIs), asIs.status + ' "' + String(asIs.why || '').slice(0, 130) + '" ops=' + nops(E7));
    const wb = XL.read(fs.readFileSync(H), { type: 'buffer' }), ws = wb.Sheets['2_RO_ModelMaker']; let cells = 0;
    Object.keys(ws).forEach(a => { if (a.charAt(0) === '!') return; const c = ws[a]; if (typeof c.v !== 'string') return; const v = c.v.split(',').map(x => { const y = x.trim(); return y === 'HR_Payroll' ? 'HR_PayrollX' : y === 'HR_Payroll_ID' ? 'HR_PayrollX_ID' : x; }).join(','); if (v !== c.v) { c.v = v; delete c.w; delete c.h; delete c.r; cells++; } });
    wb.SheetNames.forEach(n => { const g = E.sheetGrid(XL, wb.Sheets[n]); if (/^[1345]_/.test(n)) wb.Sheets[n] = XL.utils.aoa_to_sheet(g.length ? g : [[]]); });
    fs.writeFileSync(path.join(dir, 'hrmis_x.xlsx'), XL.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const E7b = envOf('hrmisx'), d7b = doorE(E7b), big = await doorE(E7b, 'human', true)('ninja.exec file=hrmis_x.xlsx');
    if (!ok(big)) k.chk('E7b the owner\'s workbook with HR_Payroll renamed (' + cells + ' cells) is staged', false, big.status + ' ' + String(big.why || '').slice(0, 200));
    else {
      const A = big.answer, m1 = await d7b('mis.new kind=HR_Terminology YearsExperience=Y'), m2 = await d7b('mis.new kind=HR_HumanResourceManagement Name=Head'), m3 = await d7b('mis.new kind=HR_Employment Description=First');
      const p1 = await d7b('mis.new kind=HR_PayrollX Name=Jan HR_Employment_ID=1'), p2 = await d7b('mis.new kind=HR_PayrollDetails PayrollCode=BASIC HR_PayrollX_ID=1'), rr = await d7b('mis.read kind=HR_Employment id=1'), ch = ((rr.answer || {}).children || []), again7 = await d7b('ninja.exec file=hrmis_x.xlsx');
      k.chk('E7b the owner\'s workbook with HR_Payroll renamed (' + cells + ' cells): 19 tables, 3 windows, 16 detail tabs; one record in each of the three masters; a payroll under an employment and a detail under that payroll; the employment shows its 8 tabs with the payroll in one; a second run writes nothing',
        A.tables.length === 19 && A.windows.length === 3 && A.detailTabs === 16 && ok(m1) && ok(m2) && ok(m3) && ok(p1) && ok(p2) && ch.length === 8 && ch.filter(c => c.kind === 'HR PayrollX' && c.rows.length === 1).length === 1 && ok(again7) && again7.answer.alreadyStaged === true,
        'tables=' + A.tables.length + ' windows=' + A.windows.length + ' detailTabs=' + A.detailTabs + ' masters=' + [m1, m2, m3].map(x => x.status).join() + ' ' + String(m1.why || m2.why || m3.why || '').slice(0, 100) + ' payroll=' + p1.status + ' detail=' + p2.status + ' tabs=' + ch.map(c => c.kind + ':' + c.rows.length).join() + ' again=' + (again7.answer && again7.answer.alreadyStaged));
      k.L('E7 data sheets: ' + (A.dataSheets || []).map(s => s.sheet.trim() + ' ' + s.loaded + '/' + s.rows + (s.why ? ' (' + String(s.why).slice(0, 70) + ')' : '')).join(' · ') + ' · skipped: ' + (A.skipped || []).map(s => JSON.stringify(s.sheet)).join(','));
      k.L('E7 notChecked: ' + JSON.stringify(big.notChecked));
      const c7 = cost(big), t1 = await doorE(E7b, 'human', true)('mis.list kind=HR_Employment'), c8 = cost(t1), t0 = await doorE(envOf('empty'), 'human', true)('mis.list kind=C_Order'), c9 = cost(t0);
      k.L('E8 cost owner\'s workbook: wall=' + c7.wall + ' peak_rss_mb=' + c7.rssMb + ' ops=' + A.ops + ' oplog_bytes=' + fs.statSync(E7b.BIM_OBJECT_OPLOG).size + ' engine_ms=' + A.ms + ' · a later line (mis.list) on that op-log: wall=' + c8.wall + ' peak_rss_mb=' + c8.rssMb + ' · the same kind of line on an empty op-log: wall=' + c9.wall + ' peak_rss_mb=' + c9.rssMb);
    }
  }
  k.end();
})().catch(e => { console.log('§W-NINJA-EXEC ERROR ' + e.stack); process.exit(2); });
