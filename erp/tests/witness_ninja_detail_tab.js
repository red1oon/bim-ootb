// ⚠ DO NOT REMOVE — Scope guard
// W-NINJA-DETAIL-TAB — bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §GT-NINJA. Node, no browser. READ the log after every run.
// THE ISSUES this proves or disproves (Ninja generator ↔ iDempiere AD shape, GridWindow.initTab:193-242):
//   NT-1 a model table whose Master is ANOTHER staged table is a TabLevel = master+1 AD_Tab INSIDE its master's window — no window, no menu leaf of its own
//   NT-2 its `<Master>_ID` column carries AD_Column.IsParent='Y' (and ONLY that column does); a top-level table has none
//   NT-3 the generic GridTab layer (ad_gridtab.js, zero Ninja code) reads it as a detail: parentIndex>=0, isDetail, link = <Master>_ID
//   NT-4 a 3-level chain (header → line → subline) nests: levels 0/1/2, each link = its OWN master key
//   NT-5 a table whose Master is NOT in the model (external FK) is NOT turned into a tab (no parent tab to be a detail of) — never a guess
//   NT-6 export round-trip: stage → extractModel → rows → parseSheet equals the original model, and re-staging it gives the SAME AD shape
//   NT-7 re-stage is idempotent and CORRECTS a pre-§GT-NINJA own-window staging (stale detail window/menu deactivated, row moved into the master window)
//   NT-9 the seed's deactivated C_Attendance leftover @7000000 is NOT reactivated as the model's first table (slot shift, counts.slot>0)
//   NT-8 legacy (no IsParent) detail window still extracts its master (back-compat)
// Run: NODE_PATH=~/bim-ootb/node_modules node erp/tests/witness_ninja_detail_tab.js > erp/tests/witness_ninja_detail_tab.log
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'));
const { Witness } = require('../../witness_kit/contract');
global.window = global.window || {};
const E = f => path.join(__dirname, '..', f);
const ADParser = require(E('ad_parser.js')), GT = require(E('ad_gridtab.js'));
const NM = require(E('ninja_model.js')), NS = require(E('ninja_stage.js')), NX = require(E('ninja_export.js')), NST = require(E('ninja_starter.js'));

const HDR = [['Name', 'Version'], ['T', '1.0.0']];
const COLS = ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'];
const mk = rows => [COLS].concat(rows.map((r, i) => ['T', String(i + 1), 'N', 'N', r[0], r[1], '', r[2]]));
const CHAIN = mk([['', 'TST_Head', 'Name,A#Total'], ['TST_Head', 'TST_Line', 'Name,Q#Qty'], ['TST_Line', 'TST_SubLine', 'Name,A#Amt'], ['C_BPartner', 'TST_Ext', 'Name']]);

(async () => {
  const SQL = await initSqlJs();
  const seed = new Uint8Array(fs.readFileSync(E('ad_seed.db')));
  const fresh = () => new SQL.Database(seed);
  const one = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length && r[0].values.length ? r[0].values[0][0] : null; };
  const _log = console.log; console.info = _log; console.log = () => {};
  const parse = rows => { const m = NM.parseSheet(rows, { header: HDR }); return m.model || m; };
  const shape = (db, names) => names.map(n => ({
    table: n,
    tabLevel: one(db, "SELECT t.TabLevel FROM AD_Tab t JOIN AD_Table b ON b.AD_Table_ID=t.AD_Table_ID WHERE b.TableName=? AND t.IsActive='Y'", [n]),
    window: one(db, "SELECT AD_Window_ID FROM AD_Table WHERE TableName=?", [n]),
    isParentCols: db.exec("SELECT c.ColumnName FROM AD_Column c JOIN AD_Table b ON b.AD_Table_ID=c.AD_Table_ID WHERE b.TableName='" + n + "' AND c.IsParent='Y' ORDER BY c.AD_Column_ID").map(r => r.values.map(v => v[0]).join(','))[0] || '',
    menu: Number(one(db, "SELECT COUNT(*) FROM AD_Menu WHERE IsActive='Y' AND AD_Window_ID=(SELECT AD_Window_ID FROM AD_Table WHERE TableName=?)", [n])),
    ownWindows: Number(one(db, "SELECT COUNT(*) FROM AD_Window w WHERE w.IsActive='Y' AND w.AD_Window_ID>=7000000 AND w.Description='Ninja: " + n + "'")),
  }));
  const gt = (db, winId, table) => {
    ADParser.init(db); const tabs = ADParser.getTabs(db, winId); const i = tabs.findIndex(t => t.tableName === table);
    if (i < 0) throw new Error('tab not found ' + table + ' in ' + winId + ': ' + JSON.stringify(tabs.map(t => [t.id, t.tableName, t.tabLevel])));
    const tm = GT.open(db, tabs, i);
    return { tabsInWindow: tabs.length, tabLevel: tm.tabLevel, parentIndex: tm.parentIndex, parentTable: tm.parentIndex >= 0 ? tabs[tm.parentIndex].tableName : null, isDetail: tm.isDetail, link: tm.linkColumn || '-', source: tm.linkSource };
  };
  const POP = [];
  const row = (arm, o) => POP.push(Object.assign({ arm }, o));

  // ── chain model (NT-1,2,3,4,5) ──
  const db = fresh(); const model = parse(CHAIN); const counts = NS.stageModels(db, model, 0);
  const sh = shape(db, ['TST_Head', 'TST_Line', 'TST_SubLine', 'TST_Ext']); const by = {}; sh.forEach(s => by[s.table] = s);
  const hw = by.TST_Head.window;
  const g = { Line: gt(db, hw, 'TST_Line'), Sub: gt(db, hw, 'TST_SubLine') };
  row('NT-1', { claim: 'Line+SubLine live in Head window, level 1/2, no own window/menu', verdict: (by.TST_Line.window === hw && by.TST_SubLine.window === hw && by.TST_Line.tabLevel === 1 && by.TST_SubLine.tabLevel === 2 && by.TST_Line.menu === 1 && by.TST_Head.menu === 1 && by.TST_Line.ownWindows === 0 && by.TST_SubLine.ownWindows === 0) ? 'PASS' : 'GAP', detail: JSON.stringify({ hw, line: by.TST_Line, sub: by.TST_SubLine }) });
  row('NT-2', { claim: 'IsParent only on <Master>_ID of a detail', verdict: (by.TST_Head.isParentCols === '' && by.TST_Line.isParentCols === 'TST_Head_ID' && by.TST_SubLine.isParentCols === 'TST_Line_ID' && by.TST_Ext.isParentCols === '') ? 'PASS' : 'GAP', detail: JSON.stringify(sh.map(s => s.table + ':' + (s.isParentCols || '-'))) });
  row('NT-3', { claim: 'GridTab reads Line as a detail of Head, link=TST_Head_ID (zero Ninja code)', verdict: (g.Line.parentIndex >= 0 && g.Line.parentTable === 'TST_Head' && g.Line.isDetail && g.Line.link === 'TST_Head_ID') ? 'PASS' : 'GAP', detail: JSON.stringify(g.Line) });
  row('NT-4', { claim: '3-level chain: SubLine detail of Line, link=TST_Line_ID', verdict: (g.Sub.tabLevel === 2 && g.Sub.parentTable === 'TST_Line' && g.Sub.isDetail && g.Sub.link === 'TST_Line_ID') ? 'PASS' : 'GAP', detail: JSON.stringify(g.Sub) });
  row('NT-5', { claim: 'external master (C_BPartner not in model): own window, no IsParent, not a detail', verdict: (by.TST_Ext.ownWindows === 1 && by.TST_Ext.window !== hw && by.TST_Ext.isParentCols === '') ? 'PASS' : 'GAP', detail: JSON.stringify(by.TST_Ext) });
  console.log = _log;
  console.log('§NINJA-DETAIL counts=' + JSON.stringify(counts) + ' (windows=' + counts.windows + ' for ' + model.tables.length + ' tables; details=' + counts.details + ')');
  console.log = () => {};

  row('NT-9', { claim: "seed's inactive C_Attendance @7000000 untouched; model shifted to a free slot", verdict: (counts.slot > 0 && one(db, 'SELECT TableName||IsActive FROM AD_Table WHERE AD_Table_ID=7000000') === 'C_AttendanceN') ? 'PASS' : 'GAP', detail: 'slot=' + counts.slot + ' row7000000=' + one(db, 'SELECT TableName||IsActive FROM AD_Table WHERE AD_Table_ID=7000000') });
  // ── NT-6 round trip ──
  const rows = NX.modelToRows(NS.extractModel(db, hw)); const m2 = parse(rows.model.map(r => r.slice()));
  const rtOk = n => JSON.stringify(m2.tables.map(t => [t.name, t.master || '', t.columns.map(c => c.name)])) === JSON.stringify(model.tables.filter(t => t.name !== 'TST_Ext').map(t => [t.name, t.master || '', t.columns.map(c => c.name)]));
  const db2 = fresh(); NS.stageModels(db2, m2, 0);
  const sh2 = shape(db2, ['TST_Head', 'TST_Line', 'TST_SubLine']);
  const strip = a => JSON.stringify(a.map(s => ({ t: s.table, l: s.tabLevel, p: s.isParentCols, m: s.menu, o: s.ownWindows, sameWin: s.window === sh2[0].window })));
  row('NT-6', { claim: 'export round-trip keeps master + tab level + IsParent', verdict: (rtOk() && strip(sh2) === strip(sh.slice(0, 3).map(s => Object.assign({}, s, { window: hw })))) ? 'PASS' : 'GAP',
    detail: 'masters=' + JSON.stringify(m2.tables.map(t => t.name + '<-' + (t.master || '-'))) + ' shape2=' + strip(sh2) });
  // starter sample too (the sheet a user downloads)
  const sdb = fresh(); const sm = parse(NST.starterModelRows().model); NS.stageModels(sdb, sm, 0);
  const sw = one(sdb, "SELECT AD_Window_ID FROM AD_Table WHERE TableName='AST_Asset'");
  const sx = parse(NX.modelToRows(NS.extractModel(sdb, sw)).model);
  row('NT-6b', { claim: 'ninja_starter AST_Asset→AST_Maintenance round-trips as header+tab', verdict: (sx.tables.length === 2 && sx.tables[1].master === 'AST_Asset' && gt(sdb, sw, 'AST_Maintenance').isDetail) ? 'PASS' : 'GAP', detail: JSON.stringify(gt(sdb, sw, 'AST_Maintenance')) });

  // ── NT-7 idempotent + corrective re-stage over a legacy (own-window) staging ──
  const db3 = fresh(); const A = db3;
  // simulate the pre-§GT-NINJA shape: stage, then force the detail back into its own window/menu, no IsParent
  NS.stageModels(A, model, 0);
  const lineTab = one(A, "SELECT AD_Tab_ID FROM AD_Tab t JOIN AD_Table b ON b.AD_Table_ID=t.AD_Table_ID WHERE b.TableName='TST_Line'"), lineTbl = one(A, "SELECT AD_Table_ID FROM AD_Table WHERE TableName='TST_Line'");
  const SL = counts.slot, ownW = 7100000 + 1 + SL;
  A.run("INSERT INTO AD_Window (AD_Window_ID,Name,Description,WindowType,IsActive) VALUES (" + ownW + ",'TST Line','Ninja: TST_Line','M','Y')");
  A.run("INSERT INTO AD_Menu (AD_Menu_ID,Name,Description,IsSummary,Action,AD_Window_ID,IsActive) VALUES (" + (7400000 + 2 + SL) + ",'TST Line','Ninja: TST_Line','N','W'," + ownW + ",'Y')");
  A.run('UPDATE AD_Table SET AD_Window_ID=' + ownW + ' WHERE AD_Table_ID=' + lineTbl); A.run('UPDATE AD_Tab SET AD_Window_ID=' + ownW + ', TabLevel=1 WHERE AD_Tab_ID=' + lineTab);
  A.run("UPDATE AD_Column SET IsParent='N' WHERE AD_Table_ID=" + lineTbl);
  const legacyEx = NS.extractModel(A, ownW);     // NT-8: the legacy window still exports its master
  row('NT-8', { claim: 'legacy own-window detail (no IsParent) still extracts master via the tail-FK fallback', verdict: (legacyEx && legacyEx.tables.length === 1 && legacyEx.tables[0].master === 'TST_Head') ? 'PASS' : 'GAP', detail: JSON.stringify(legacyEx && legacyEx.tables.map(t => t.name + '<-' + t.master)) });
  NS.stageModels(A, model, 0); const c2 = NS.stageModels(A, model, 0);
  const s3 = shape(A, ['TST_Line'])[0];
  const nWin = Number(one(A, "SELECT COUNT(*) FROM AD_Window WHERE IsActive='Y' AND AD_Window_ID>=7000000")), nTab = Number(one(A, "SELECT COUNT(*) FROM AD_Tab WHERE IsActive='Y' AND AD_Tab_ID>=7000000"));
  row('NT-7', { claim: 'second+third stage idempotent; legacy detail window/menu deactivated, moved into master window', verdict: (s3.window === hw && s3.tabLevel === 1 && s3.isParentCols === 'TST_Head_ID' && s3.menu === 1 && Number(one(A, 'SELECT IsActive="Y" FROM AD_Window WHERE AD_Window_ID=' + ownW)) === 0 && nWin === 2 && nTab === 4 && c2.tables === 0 && c2.cols === 0 && c2.tabs === 0) ? 'PASS' : 'GAP',
    detail: JSON.stringify({ s3, nWin, nTab, c2 }) });

  console.log = _log;
  POP.forEach(r => console.log('§NINJA-DETAIL-TAB ' + r.arm + ' verdict=' + r.verdict + ' claim="' + r.claim + '" ' + r.detail));
  Witness('ninja_detail_tab')
    .population(() => POP)
    .schema({ type: 'object', required: ['arm', 'verdict'], properties: { verdict: { enum: ['PASS', 'GAP', 'INCONCLUSIVE'] } } })
    .invariant('every arm PASS (no GAP / INCONCLUSIVE)', rs => rs.every(r => r.verdict === 'PASS'))
    .invariant('non-vacuous: all 10 arms judged', rs => rs.length >= 10)
    .redControl(rs => rs.map(r => Object.assign(r, { verdict: 'GAP' })))
    .run();
})().catch(e => { console.log = console.info; console.log('§NINJA-DETAIL-TAB HARNESS-ERROR ' + (e && e.stack || e)); process.exitCode = 1; });
