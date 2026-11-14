// ⚠ DO NOT REMOVE — W-NINJA-EXEC (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.2: ninja.exec, a whole Ninja workbook at the door). READ THE LOG; an exit code is not evidence.
//   E1 ISSUE (the door stages another shape than the stager: a detail lands in its own window) · E2 ISSUE (a record cannot be made under its master, or a master does not show its child rows)
//   E2c ISSUE (no parent of ANY table shows its child rows: the lookup key's case) · E3 ISSUE (the workbook is gone after a restart) · E4 ISSUE (the data sheets are not loaded, or a misnamed sheet is silently dropped)
//   E5 ISSUE (a second run stages again; a refusal leaves something written) · E6 ISSUE (a dry run writes; an AI stages a workbook without a person)
//   E7 ISSUE (the owner's own workbook does not go through) · E8 the cost of the line, logged (no threshold) · E9 ISSUE (the practice workbook the guide points at does not stage)
//   E10 ISSUE (a table the dictionary already holds is refused or made twice, where legacy Ninja reuses it and adds the sheet's columns; a kind shown in two windows can be written through one only)
//   E11 ISSUE (a Master that is a table of the system, not of the sheet, gives a lonely window where legacy Ninja puts a tab into that table's own window)
//   Falsifiers: NINJAEXEC_BREAK=nodetail (must FAIL E1) · onegroup (E3) · nodata (E4) · nochild (E2, E2c) · noreuse (E10, E7) · noattach (E11a). The owner's workbook: NINJA_HRMIS=<path>; absent = INCONCLUSIVE, never PASS.
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
  k.chk('E5a refused, nothing written: a workbook whose only table the dictionary already holds with no master (Ninja leaves it alone, so there is nothing to make); a faulty model (its fault listed); a file outside the folder; a file that is not a workbook', ref(r1, BRK === 'noreuse' ? /already exists? in the dictionary/ : /nothing to make/) && /C_Order/.test(r1.why) && ref(r2, /fault/) && /Odd|Z#/.test(r2.why) && ref(r3, /leaves it/) && ref(r4, /must be a workbook/) && nops(E1) === 0,
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

  // ── E9 the practice workbook the guide's lines use is the file in the repo, and it stages
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) k.incon('E9', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout');
  else {
    fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
    const E9 = envOf('practice'), d9 = doorE(E9), p9 = await d9('ninja.exec file=Ninja_Practice.xlsx'), pl = await d9('mis.list kind=PR_Patient'), rm = await d9('mis.list kind=PR_Room'), A9 = p9.answer || {};
    k.chk('E9 the shipped practice workbook stages: 5 tables, 2 windows, 3 detail tabs (one of them, PR_Referral, attached to the Business Partner window), its 3 patients and 2 rooms loaded and listed', ok(p9) && A9.tables.length === 5 && A9.windows.length === 2 && A9.detailTabs === 3 && (A9.attached || []).map(x => x.table + '@' + x.window).join() === 'PR_Referral@Business Partner' && ok(pl) && pl.answer.total === 3 && ok(rm) && rm.answer.total === 2,
      p9.status + ' ' + String(p9.why || '').slice(0, 120) + ' tables=' + (A9.tables || []).length + ' windows=' + (A9.windows || []).length + ' detailTabs=' + A9.detailTabs + ' patients=' + (pl.answer && pl.answer.total) + ' rooms=' + (rm.answer && rm.answer.total));
  }
  // ── E10 a table the dictionary already holds: reused with the sheet's columns added (it has a master), or left alone (it has none): legacy Ninja, MRO_ModelMaker.handleModel L108-150
  {
    const wb = XL.utils.book_new(), add = (n, rows) => XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(rows), n);
    add('1_RO_ModelHeader', [['Name', 'Version'], ['FixReuse', '1']]);
    add('2_RO_ModelMaker', [HDR].concat([['', 'ZR_Club', 'Name'], ['ZR_Club', 'C_Greeting', 'Name,Q#Seats'], ['', 'C_Channel', 'Name,Q#Reach']].map((m, i) => ['FixReuse', i + 1, 'N', 'N', m[0], m[1], '', m[2]])));
    fs.writeFileSync(path.join(dir, 'fix_reuse.xlsx'), XL.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const EA = envOf('reuse'), dA = doorE(EA), seedRow = (tn) => JSON.stringify(sq("SELECT * FROM ad_table WHERE tablename='" + tn + "'")), g0 = seedRow('C_Greeting'), nCol0 = sq("SELECT count(*) AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Greeting' AND c.isactive='Y'")[0].n;
    const ru = await dA('ninja.exec file=fix_reuse.xlsx'), RA = ru.answer || {};
    if (!ok(ru)) k.chk('E10 a workbook that names an existing table under a master is staged, the table reused', false, ru.status + ' ' + String(ru.why || '').slice(0, 200));
    else {
      const OA = await image(EA), one = (s, p) => OA.rows(s, p)[0] || {}, lc = (o) => JSON.stringify([o].map(r => { const x = {}; Object.keys(r).sort().forEach(c => { x[c.toLowerCase()] = r[c]; }); return x; }));
      const gRow = OA.rows("SELECT * FROM ad_table WHERE upper(tablename)='C_GREETING'"), seedDb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db'))), sRow = (() => { const st = seedDb.prepare("SELECT * FROM ad_table WHERE upper(tablename)='C_GREETING'"), o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; })(), diffCols = gRow.length === 1 && sRow.length === 1 ? Object.keys(sRow[0]).filter(c => String(sRow[0][c]) !== String(gRow[0][c.toLowerCase()] !== undefined ? gRow[0][c.toLowerCase()] : gRow[0][c])) : ['?'], added = OA.rows("SELECT c.columnname AS c, c.isparent AS p FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Greeting' AND c.ad_column_id>=" + NS.NINJA_BASE + " AND c.isactive='Y' ORDER BY c.ad_column_id").map(r => r.c + (r.p === 'Y' ? '*' : ''));
      const nColCore = one("SELECT count(*) AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Greeting' AND c.isactive='Y' AND c.ad_column_id<" + NS.NINJA_BASE).n, phys = OA.rows("SELECT name FROM pragma_table_info('C_Greeting')").map(r => r.name.toLowerCase());
      const tab = one("SELECT tb.ad_window_id AS win, tb.tablevel AS lvl, w.name AS wname FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id JOIN ad_window w ON w.ad_window_id=tb.ad_window_id WHERE t.tablename='C_Greeting' AND tb.ad_tab_id>=" + NS.NINJA_BASE + " AND tb.isactive='Y'"), chan = one("SELECT count(*) AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Channel' AND c.ad_column_id>=" + NS.NINJA_BASE).n;
      k.chk('E10a the existing table is REUSED, not made twice and not changed: one AD_Table row named C_Greeting, equal to the seed\'s; its ' + nCol0 + ' own columns still active; the sheet\'s 2 new columns added in the dictionary and in the table itself (ZR_Club_ID as the parent link, Seats); a level-1 tab on it in the window ZR Club; the table with no master (C_Channel) left alone, named, with no column added',
        gRow.length === 1 && diffCols.length === 0 && nColCore === nCol0 && added.join() === 'Seats,ZR_Club_ID*' && phys.indexOf('seats') >= 0 && phys.indexOf('zr_club_id') >= 0 && tab.wname === 'ZR Club' && Number(tab.lvl) === 1 && (RA.reused || []).map(x => x.table).join() === 'C_Greeting' && (RA.leftAlone || []).map(x => x.table).join() === 'C_Channel' && chan === 0,
        'AD_Table rows=' + gRow.length + ' columns of its row that differ from the seed=' + JSON.stringify(diffCols) + ' own columns ' + nColCore + '/' + nCol0 + ' added=' + added.join() + ' in the table=' + (phys.indexOf('seats') >= 0 && phys.indexOf('zr_club_id') >= 0) + ' tab=' + JSON.stringify(tab) + ' reused=' + JSON.stringify((RA.reused || []).map(x => x.table)) + ' leftAlone=' + JSON.stringify((RA.leftAlone || []).map(x => x.table)) + ' C_Channel columns added=' + chan);
      const c1 = await dA('mis.new kind=ZR_Club Name=Chess'), g1 = await dA('mis.new kind=C_Greeting Name=Hello ZR_Club_ID=1 Seats=4'), g2 = await dA('mis.new kind=C_Greeting Name=Hello ZR_Club_ID=1 Seats=4 window=' + tab.win), g3 = await dA('mis.update kind=C_Greeting number=Hello Seats=6 window="ZR Club"'), rc = await dA('mis.read kind=ZR_Club id=1'), kid = (((rc.answer || {}).children || [])[0] || { rows: [] }), ag = await dA('ninja.exec file=fix_reuse.xlsx');
      k.chk('E10b a kind shown in two windows: without window= the workbook\'s column is refused with the window to name; with window= (by id, then by name) the record is made under the club and changed, each line a fresh process; the club shows it with Seats 6; a second run writes nothing',
        ok(c1) && ref(g1, /also shown in the window ZR Club/) && ok(g2) && ok(g3) && ok(rc) && kid.rows.length === 1 && Number(kid.rows[0].seats) === 6 && Number(kid.rows[0].zr_club_id) === 1 && ok(ag) && ag.answer.alreadyStaged === true,
        'club=' + c1.status + ' no window=' + g1.status + ' "' + String(g1.why || '').slice(-80) + '" window id=' + g2.status + ' ' + String(g2.why || '').slice(0, 90) + ' window name=' + g3.status + ' ' + String(g3.why || '').slice(0, 90) + ' child=' + JSON.stringify(kid.rows.map(r => ({ name: r.name, seats: r.seats, club: r.zr_club_id }))) + ' again=' + (ag.answer && ag.answer.alreadyStaged));
    }
  }
  // ── E11 a tab on any window: the Master is a table of the dictionary, not of the sheet (legacy Ninja, MRO_ModelMaker.createMasterDetail L823-926). §12.9
  {
    const mk = (file, rows) => { const wb = XL.utils.book_new(), add = (n, r) => XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(r), n); add('1_RO_ModelHeader', [['Name', 'Version'], [file.replace(/\W/g, ''), '1']]); add('2_RO_ModelMaker', [HDR].concat(rows.map((m, i) => ['X', i + 1, 'N', 'N', m[0], m[1], '', m[2]]))); fs.writeFileSync(path.join(dir, file), XL.write(wb, { type: 'buffer', bookType: 'xlsx' })); };
    const noWin = (sq("SELECT tablename AS t FROM ad_table WHERE isactive='Y' AND ad_window_id IS NULL AND ad_table_id<1000 ORDER BY ad_table_id LIMIT 1")[0] || {}).t;
    mk('fix_attach.xlsx', [['C_BPartner', 'ZV_SiteVisit', 'Name,D#DateVisit'], ['ZV_SiteVisit', 'ZV_VisitNote', 'Name,T#Notes']]); mk('fix_nomaster.xlsx', [['ZZ_NoSuchTable', 'ZV_Orphan', 'Name']]); if (noWin) mk('fix_nowin.xlsx', [[noWin, 'ZV_Lost', 'Name']]);
    const EB = envOf('attach'), dB = doorE(EB), TABS = "SELECT ad_tab_id AS id, tablevel AS lvl, seqno AS seq, isactive AS a FROM ad_tab WHERE ad_window_id=123 AND ad_tab_id<" + NS.NINJA_BASE + ' ORDER BY ad_tab_id', seedTabs = JSON.stringify(sq(TABS)), maxSeq = sq('SELECT max(seqno) AS m, count(*) AS n FROM ad_tab WHERE ad_window_id=123')[0], bpTab = sq("SELECT tablevel AS lvl FROM ad_tab WHERE ad_window_id=123 AND ad_table_id=(SELECT ad_table_id FROM ad_table WHERE tablename='C_BPartner') ORDER BY tablevel, seqno LIMIT 1")[0];
    const x1 = await dB('ninja.exec file=fix_nomaster.xlsx'), x2 = noWin ? await dB('ninja.exec file=fix_nowin.xlsx') : null, nB0 = nops(EB);
    if (!noWin) k.incon('E11c', 'the seed has no table without a window to try');
    else k.chk('E11c refused, nothing written: a Master that is neither in the sheet nor a table here; a Master (' + noWin + ') that has no window here', ref(x1, /does not exist \(yet\)/) && ref(x2, /no window here/) && nB0 === 0, 'no such master: ' + x1.status + ' · no window: ' + x2.status + ' "' + String(x2.why || '').slice(0, 80) + '" · ops=' + nB0);
    const at = await dB('ninja.exec file=fix_attach.xlsx'), AT = at.answer || {};
    if (!ok(at)) k.chk('E11a a sheet row whose Master is C_BPartner is staged', false, at.status + ' ' + String(at.why || '').slice(0, 200));
    else {
      const OB = await image(EB), mine = OB.rows("SELECT t.tablename AS tn, tb.ad_window_id AS win, tb.tablevel AS lvl, tb.seqno AS seq, (SELECT group_concat(c.columnname) FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND c.isparent='Y' AND c.isactive='Y') AS parent FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id WHERE tb.isactive='Y' AND t.tablename LIKE 'ZV!_%' ESCAPE '!' ORDER BY tb.seqno").map(r => [r.tn, r.win, r.lvl, r.seq, r.parent].join('|'));
      const nowTabs = JSON.stringify(OB.rows(TABS).map(r => ({ id: r.id, lvl: r.lvl, seq: r.seq, a: r.a }))), made = AT.opSummary || {}, leafs = OB.rows("SELECT count(*) AS n FROM ad_menu m WHERE m.ad_menu_id>=" + NS.NINJA_BASE + " AND m.issummary='N' AND m.isactive='Y'")[0].n;
      const wantA = ['ZV_SiteVisit|123|' + (Number(bpTab.lvl) + 1) + '|' + (10 + 10 * maxSeq.n) + '|C_BPartner_ID', 'ZV_VisitNote|123|' + (Number(bpTab.lvl) + 2) + '|' + (20 + 10 * maxSeq.n) + '|ZV_SiteVisit_ID'];
      k.chk('E11a Master=C_BPartner puts the tab INTO the Business Partner window: one level under the partner tab, after the ' + maxSeq.n + ' tabs that are there (SeqNo 10 + count x 10, as legacy), its own detail one level further; no window and no menu entry made; the window\'s own tabs are as the seed has them',
        JSON.stringify(mine) === JSON.stringify(wantA) && Number(mine[0].split('|')[3]) > Number(maxSeq.m) && !made['create:ad_window'] && leafs === 0 && nowTabs === seedTabs && (AT.attached || []).map(x => x.table + '>' + x.master + '@' + x.window).join() === 'ZV_SiteVisit>C_BPartner@Business Partner',
        'tabs=' + JSON.stringify(mine) + (JSON.stringify(mine) === JSON.stringify(wantA) ? '' : ' want=' + JSON.stringify(wantA)) + ' seed max SeqNo=' + maxSeq.m + ' windows made=' + (made['create:ad_window'] || 0) + ' menu leaves=' + leafs + ' core tabs unchanged=' + (nowTabs === seedTabs) + ' attached=' + JSON.stringify(AT.attached));
      const v1 = await dB('mis.new kind=ZV_SiteVisit Name=First C_BPartner_ID=112'), v2 = await dB('mis.new kind=ZV_VisitNote Name=N1 ZV_SiteVisit_ID=1'), v3 = await dB('mis.new kind=ZV_SiteVisit Name=Second C_BPartner_ID=112 role=102'), rb = await dB('mis.read kind=C_BPartner id=112'), rv = await dB('mis.read kind=ZV_SiteVisit id=1'), agB = await dB('ninja.exec file=fix_attach.xlsx');
      const kidB = ((rb.answer || {}).children || []).filter(c => c.kind === 'ZV SiteVisit')[0] || { rows: [] }, kidV = (((rv.answer || {}).children || [])[0] || { rows: [] });
      k.chk('E11b records through the attached tab: a visit under partner 112, a note under that visit, a second visit under role 102; the partner shows its 2 visits among its tabs, the visit its 1 note; a second run writes nothing',
        ok(v1) && ok(v2) && ok(v3) && kidB.rows.length === 2 && kidV.rows.length === 1 && ok(agB) && agB.answer.alreadyStaged === true, 'visit=' + v1.status + ' note=' + v2.status + ' role 102=' + v3.status + ' ' + String(v1.why || v2.why || v3.why || '').slice(0, 100) + ' partner tabs=' + ((rb.answer || {}).children || []).map(c => c.kind + ':' + c.rows.length).join() + ' visit children=' + kidV.rows.length + ' again=' + (agB.answer && agB.answer.alreadyStaged));
    }
  }
  // ── E7 the owner's workbook
  const H = process.env.NINJA_HRMIS;
  if (!H || !fs.existsSync(H)) k.incon('E7', 'the owner\'s workbook is not on this machine (set NINJA_HRMIS=<path to Ninja_HRMIS.xlsx>)');
  else {
    fs.copyFileSync(H, path.join(dir, 'hrmis.xlsx'));
    const E7 = envOf('hrmis'), d7 = doorE(E7), big = await doorE(E7, 'human', true)('ninja.exec file=hrmis.xlsx');
    // HR_Payroll is a table the dictionary already holds (entity type EE02, the HR extension that ships with iDempiere): legacy Ninja reuses it, adds the sheet's columns and hangs it under HR_Employment.
    if (!ok(big)) k.chk('E7 the owner\'s workbook as it is is staged', false, big.status + ' ' + String(big.why || '').slice(0, 200));
    else {
      const A = big.answer, m1 = await d7('mis.new kind=HR_Terminology YearsExperience=Y'), m2 = await d7('mis.new kind=HR_HumanResourceManagement Name=Head'), m3 = await d7('mis.new kind=HR_Employment Description=First');
      const win = (A.windows.filter(w => w.name === 'HR Employment')[0] || {}).id, p0 = await d7('mis.new kind=HR_Payroll Name=Jan HR_Employment_ID=1'), p1 = await d7('mis.new kind=HR_Payroll Name=Jan HR_Employment_ID=1 window=' + win), rr = await d7('mis.read kind=HR_Employment id=1'), ch = ((rr.answer || {}).children || []), again7 = await d7('ninja.exec file=hrmis.xlsx');
      const O7 = await image(E7), nPay = O7.rows("SELECT count(*) AS n FROM ad_table WHERE upper(tablename)='HR_PAYROLL'")[0].n, added = O7.rows("SELECT c.columnname AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='HR_Payroll' AND c.ad_column_id>=" + NS.NINJA_BASE + " AND c.isactive='Y' ORDER BY c.ad_column_id").map(r => r.c);
      k.chk('E7 the owner\'s workbook AS IT IS: 19 tables, 3 windows, 16 detail tabs, HR_Payroll reused (still ONE table of that name, ' + added.length + ' columns added to it); one record in each of the three masters; the employment shows its 8 tabs, Payroll among them; a second run writes nothing',
        A.tables.length === 19 && A.windows.length === 3 && A.detailTabs === 16 && (A.reused || []).map(x => x.table).join() === 'HR_Payroll' && nPay === 1 && added.indexOf('HR_Employment_ID') >= 0 && ok(m1) && ok(m2) && ok(m3) && ch.length === 8 && ch.filter(c => c.kind === 'Payroll').length === 1 && ok(again7) && again7.answer.alreadyStaged === true,
        'tables=' + A.tables.length + ' windows=' + A.windows.length + ' detailTabs=' + A.detailTabs + ' reused=' + JSON.stringify((A.reused || []).map(x => x.table + ' ' + x.entityType)) + ' HR_Payroll rows in AD_Table=' + nPay + ' added=' + added.join(',') + ' masters=' + [m1, m2, m3].map(x => x.status).join() + ' tabs=' + ch.map(c => c.kind + ':' + c.rows.length).join() + ' again=' + (again7.answer && again7.answer.alreadyStaged));
      k.chk('E7b a payroll under an employment: without window= it is refused pointing at the window HR Employment; with window= the workbook\'s column is taken and the refusal that is left names only the reused table\'s OWN mandatory columns (HR_Contract_ID, PaymentRule: legacy\'s NOT NULL, and this seed carries no HR_Contract table)',
        ref(p0, /also shown in the window HR Employment/) && ref(p1, /mandatory and still empty/) && /HR_Contract_ID/.test(p1.why) && !/hr_employment_id/i.test(p1.why), 'no window: "' + String(p0.why || '').slice(-110) + '" · window=' + win + ': ' + p1.status + ' "' + String(p1.why || '').slice(0, 130) + '"');
      k.L('E7 data sheets: ' + (A.dataSheets || []).map(s => s.sheet.trim() + ' ' + s.loaded + '/' + s.rows + (s.why ? ' (' + String(s.why).slice(0, 70) + ')' : '')).join(' · ') + ' · skipped: ' + (A.skipped || []).map(s => JSON.stringify(s.sheet)).join(','));
      k.L('E7 notChecked: ' + JSON.stringify(big.notChecked));
      const c7 = cost(big), t1 = await doorE(E7, 'human', true)('mis.list kind=HR_Employment'), c8 = cost(t1), t0 = await doorE(envOf('empty'), 'human', true)('mis.list kind=C_Order'), c9 = cost(t0);
      k.L('E8 cost owner\'s workbook: wall=' + c7.wall + ' peak_rss_mb=' + c7.rssMb + ' ops=' + A.ops + ' oplog_bytes=' + fs.statSync(E7.BIM_OBJECT_OPLOG).size + ' engine_ms=' + A.ms + ' · a later line (mis.list) on that op-log: wall=' + c8.wall + ' peak_rss_mb=' + c8.rssMb + ' · the same kind of line on an empty op-log: wall=' + c9.wall + ' peak_rss_mb=' + c9.rssMb);
    }
  }
  k.end();
})().catch(e => { console.log('§W-NINJA-EXEC ERROR ' + e.stack); process.exit(2); });
