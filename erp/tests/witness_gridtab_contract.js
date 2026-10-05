// ⚠ DO NOT REMOVE — Scope guard
// W-GRIDTAB-CONTRACT — bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §GT.3. Node, no browser. READ the log after every run.
// THE ISSUES this proves or disproves, over EVERY active window that has an active TabLevel>=1 tab whose table and parent
//   table exist in erp/ad_seed.db (population is data-driven, never a hand-picked list):
//   MD-6 is the detail tab linked by iDempiere's rule (AD_Tab.AD_Column_ID, else single IsParent, else IsParent == parent key,
//        GridWindow.initTab:193-242) — and where did the old parent-KEY-NAME convention pick differently or nothing (= ALL rows)?
//   MD-2 does the tab query return exactly the child rows of ONE parent (count == an independent SQL oracle) for a real parent
//        that has children — and does the old convention's query (no filter when the name is absent) disagree?
//   MD-2/MD-5 does admit() (the op-log fold's gate) accept a session row of THIS parent and reject the same row re-parented to
//        another parent, and reject a row that fails the tab WhereClause?
//   MD-7 is an @ctx@ WhereClause resolved from the parent row (or 1 = 2 when unresolvable) instead of skipped?
// Per tab verdict: PASS | GAP | INCONCLUSIVE(reason) — a tab with no child rows in the seed is VACUOUS for the count arm.
// Run: NODE_PATH=~/bim-ootb/node_modules node erp/tests/witness_gridtab_contract.js > erp/tests/witness_gridtab_contract.log
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'));
const { Witness } = require('../../witness_kit/contract');
global.window = global.window || {};
const ADParser = require(path.join(__dirname, '..', 'ad_parser.js'));
const GT = require(path.join(__dirname, '..', 'ad_gridtab.js'));

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'ad_seed.db'))));
  const rows = (sql, p) => { const r = p ? db.exec(sql, p) : db.exec(sql); return r.length ? r[0].values : []; };
  const one = (sql, p) => { const r = rows(sql, p); return r.length ? r[0][0] : null; };
  const has = t => !!one("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [t]);
  const colOf = (t, c) => GT.tableColumns(db, t).find(x => x.toLowerCase() === String(c).toLowerCase()) || null;
  const _log = console.log; console.log = () => {};               // ad_parser's own §AD_PARSER chatter is not this witness's log
  const wins = rows("SELECT DISTINCT t.AD_Window_ID FROM AD_Tab t JOIN AD_Window w ON w.AD_Window_ID=t.AD_Window_ID " +
    "WHERE t.TabLevel>=1 AND t.IsActive='Y' AND w.IsActive='Y' ORDER BY t.AD_Window_ID").map(r => r[0]);
  const POP = [];
  let windowsInPop = 0;
  for (const wid of wins) {
    ADParser.init(db);
    let tabs; try { tabs = ADParser.getTabs(db, wid); } catch (e) { continue; }
    let inPop = false;
    tabs.forEach((tab, i) => {
      if (!(tab.tabLevel > 0) || !tab.tableName || !has(tab.tableName)) return;
      const tm = GT.open(db, tabs, i);
      const pTab = tabs[tm.parentIndex];
      if (!pTab || !pTab.tableName || !has(pTab.tableName)) return;
      inPop = true;
      const row = { window: wid, tab: tab.id, name: tab.name, table: tab.tableName, level: tm.tabLevel, linkColumn: tm.linkColumn,
        linkSource: tm.linkSource, isDetail: tm.isDetail, oldConvention: null, verdict: 'INCONCLUSIVE', reason: '',
        count: -1, oracle: -1, countOld: -1, admitOwn: null, admitForeign: null, whereTokens: 0, whereResolved: null };
      // old behaviour (idempiere.html fcaaa411 :1956-1969): parent KEY name present on the child → filter, else NO filter
      const pKey = GT.keyColumn(pTab);
      row.oldConvention = colOf(tab.tableName, pKey) ? pKey : '(none → all rows)';
      if (!tm.isDetail || !tm.linkColumn) { row.verdict = 'PASS'; row.reason = 'no-link → 2=3 (iDempiere: 0 rows)'; POP.push(row); return; }
      const eff = tm.parentColumn || tm.linkColumn;
      const childLink = colOf(tab.tableName, tm.linkColumn), parentEff = colOf(pTab.tableName, eff);
      if (!childLink) { row.verdict = 'GAP'; row.reason = 'link column not on child table'; POP.push(row); return; }
      if (!parentEff) { row.reason = 'parent table lacks ' + eff + ' (ctx comes from a higher level)'; POP.push(row); return; }
      // a real parent row that has children (by the link column itself)
      const v = one('SELECT c.' + childLink + ' FROM ' + tab.tableName + ' c JOIN ' + pTab.tableName + ' p ON p.' + parentEff + '=c.' + childLink +
        ' WHERE c.' + childLink + ' IS NOT NULL GROUP BY c.' + childLink + ' ORDER BY COUNT(*) DESC LIMIT 1');
      if (v == null) { row.reason = 'VACUOUS: no child rows with a parent in the seed'; POP.push(row); return; }
      const prow = (() => { const r = db.exec('SELECT * FROM ' + pTab.tableName + ' WHERE ' + parentEff + '=? LIMIT 1', [v]); if (!r.length) return {};
        const o = {}; r[0].columns.forEach((c, k) => { o[c] = r[0].values[0][k]; }); return o; })();
      const ctxGet = (n) => { const x = GT.value(prow, n.replace(/^[#$]/, '')); return x == null ? null : x; };
      const q = GT.query(tm, ctxGet, []);
      if (tm.whereClause && tm.whereClause.indexOf('@') >= 0) { row.whereTokens = 1; row.whereResolved = !q.unresolved.length; }
      try { row.count = Number(one('SELECT COUNT(*) FROM ' + tab.tableName + ' WHERE ' + q.where)); } catch (e) { row.count = -2; row.reason = 'query error: ' + e.message.slice(0, 80); }
      // ORACLE — independent: link = v, plus the static WhereClause verbatim (a tokened clause is judged only by resolution)
      // a tokened clause: substituted HERE from the parent row by a plain regex (not ad_gridtab's parser); a missing token → 0
      let miss = false;
      const wc = !tm.whereClause ? '' : tm.whereClause.replace(/@[#$]?([A-Za-z0-9_]+)@/g, (w, n) => { const x = GT.value(prow, n); if (x == null || x === '') { miss = true; return w; } return String(x); });
      const st = wc && !miss ? ' AND (' + wc + ')' : '';
      try { row.oracle = Number(one('SELECT COUNT(*) FROM ' + tab.tableName + ' WHERE ' + childLink + '=?' + st, [v])); } catch (e) { row.oracle = -3; }
      if (miss) row.oracle = 0;     // GridTable.createSelectSql: unparsable → 1 = 2
      try { row.countOld = Number(one('SELECT COUNT(*) FROM ' + tab.tableName + (colOf(tab.tableName, pKey) ? ' WHERE ' + pKey + '=?' : ''), colOf(tab.tableName, pKey) ? [GT.value(prow, pKey)] : undefined)); } catch (e) { row.countOld = -4; }
      // admit arms on a real row of the result, re-parented to a FOREIGN parent value
      const sample = (() => { try { const r = db.exec('SELECT * FROM ' + tab.tableName + ' WHERE ' + q.where + ' LIMIT 1'); if (!r.length) return null;
        const o = {}; r[0].columns.forEach((c, k) => { o[c] = r[0].values[0][k]; }); return o; } catch (e) { return null; } })();
      if (sample) {
        row.admitOwn = GT.admit(db, tab.tableName, [sample], q.where).rows.length === 1;
        const foreign = Object.assign({}, sample); foreign[childLink] = typeof v === 'number' ? -987654 : 'zz-foreign';
        row.admitForeign = GT.admit(db, tab.tableName, [foreign], q.where).rows.length === 1;
      }
      const countOk = row.count === row.oracle && row.count >= 0;
      const admitOk = sample ? (row.admitOwn === true && row.admitForeign === false) : true;
      row.verdict = countOk && admitOk ? 'PASS' : 'GAP';
      if (!countOk) row.reason += ' count!=oracle';
      if (!admitOk) row.reason += ' admit own=' + row.admitOwn + ' foreign=' + row.admitForeign;
      if (row.count === 0 && row.verdict === 'PASS') { row.verdict = 'INCONCLUSIVE'; row.reason = 'VACUOUS: query judged 0 rows'; }
      POP.push(row);
    });
    if (inPop) windowsInPop++;
  }
  // ── Ninja arm: a header+lines model staged at RUNTIME by erp/ninja_stage.js (the Red1 Ninja generator) gets the same
  //    generic tab contract with zero extra code? (ninja_starter's AST_Asset → AST_Maintenance sample; §GT-NINJA: must now be isDetail=true)
  const NM = require(path.join(__dirname, '..', 'ninja_model.js')), NS = require(path.join(__dirname, '..', 'ninja_stage.js'));
  const NST = require(path.join(__dirname, '..', 'ninja_starter.js'));
  const nrows = NST.starterModelRows(); let ninja = { verdict: 'INCONCLUSIVE', reason: 'stage failed' };
  try {
    const model = NM.parseSheet(nrows.model, { header: nrows.header });
    NS.stageModels(db, model.model || model, 0);
    const lineWins = rows("SELECT t.AD_Window_ID, t.AD_Tab_ID, t.TabLevel FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE tb.TableName='AST_Maintenance' AND t.IsActive='Y'");
    const lw = lineWins[0];
    ADParser.init(db); const ltabs = ADParser.getTabs(db, lw[0]); const li = ltabs.findIndex(t => t.id === lw[1]);
    const tm = GT.open(db, ltabs, li);
    ninja = { window: lw[0], tabsInWindow: ltabs.length, tabLevel: tm.tabLevel, parentIndex: tm.parentIndex, isDetail: tm.isDetail, link: tm.linkColumn || '-', source: tm.linkSource };
    ninja.verdict = (tm.parentIndex >= 0 && tm.isDetail && tm.linkColumn) ? 'PASS' : 'INCONCLUSIVE';
    if (ninja.verdict !== 'PASS') ninja.reason = 'ninja_stage.js must stage the detail as a TabLevel-1 tab in its master window with IsParent on <Master>_ID (§GT-NINJA) — got parentIndex=' + tm.parentIndex + ' isDetail=' + tm.isDetail;
  } catch (e) { ninja.reason = 'stage error: ' + e.message; }
  console.log = _log;
  console.log('§GT-CONTRACT-NINJA ' + JSON.stringify(ninja));
  const by = k => POP.reduce((a, r) => { a[r[k]] = (a[r[k]] || 0) + 1; return a; }, {});
  POP.forEach(r => console.log('§GT-CONTRACT window=' + r.window + ' tab=' + r.tab + ' "' + r.name + '" table=' + r.table + ' level=' + r.level +
    ' link=' + (r.linkColumn || '-') + ' source=' + r.linkSource + ' old=' + r.oldConvention + ' count=' + r.count + ' oracle=' + r.oracle +
    ' countOld=' + r.countOld + ' admitOwn=' + r.admitOwn + ' admitForeign=' + r.admitForeign +
    (r.whereTokens ? ' whereResolved=' + r.whereResolved : '') + ' verdict=' + r.verdict + (r.reason ? ' reason=' + r.reason.trim() : '')));
  const oldWrong = POP.filter(r => r.count >= 0 && r.countOld >= 0 && r.countOld !== r.oracle);
  const oldNoFilter = POP.filter(r => /none/.test(r.oldConvention) && r.linkColumn);
  console.log('§GT-CONTRACT-TOTAL windows=' + windowsInPop + ' tabs=' + POP.length + ' verdicts=' + JSON.stringify(by('verdict')) + ' linkSource=' + JSON.stringify(by('linkSource')) +
    ' oldConventionWrongCount=' + oldWrong.length + ' oldConventionNoFilter=' + oldNoFilter.length +
    ' tokenWhere=' + POP.filter(r => r.whereTokens).length + ' admitJudged=' + POP.filter(r => r.admitOwn != null).length);
  if (oldWrong.length) console.log('§GT-CONTRACT old-convention disagreements (first 10): ' + oldWrong.slice(0, 10).map(r => r.table + '(old=' + r.countOld + ' oracle=' + r.oracle + ')').join(', '));

  Witness('gridtab_contract')
    .population(() => POP)
    .schema({ type: 'object', required: ['window', 'tab', 'verdict', 'count', 'oracle'], properties: { verdict: { enum: ['PASS', 'GAP', 'INCONCLUSIVE'] } } })
    .invariant('no GAP tab (every judged detail tab: count == oracle, admit own=true foreign=false)', rs => rs.every(r => r.verdict !== 'GAP'))
    .invariant('judged population non-vacuous (>=50 tabs counted with rows > 0)', rs => rs.filter(r => r.verdict === 'PASS' && r.count > 0).length >= 50)
    .invariant('admit arm judged on >=50 tabs', rs => rs.filter(r => r.admitOwn != null).length >= 50)
    // redControl: the link clause dropped (old convention's no-filter / foreign row admitted) must FAIL
    .redControl(rs => rs.map(r => r.count > 0 ? Object.assign(r, { admitForeign: true, verdict: 'GAP' }) : r))
    .run();
})().catch(e => { console.log('§GT-CONTRACT HARNESS-ERROR ' + (e && e.stack || e)); process.exitCode = 1; });
