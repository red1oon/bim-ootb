// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-CHANGELOG-RULE (bim-compiler prompts/ERP_DEPTH_FILM.md §ADMIN-2). READ tests/witness_changelog_rule.log before any conclusion.
// THE ISSUE: the twin derives AD_ChangeLog from the op-log instead of storing it. That is only legacy-equal if, for EVERY table and column,
//   the twin decides "this change is logged" exactly as legacy does: table = MChangeLog.isLogged (IsChangeLog='Y' OR an EntityType column,
//   MChangeLog.fillChangeLog :66-73), column = POInfo active column with IsAllowLogging='Y', not encrypted, no ColumnSQL, not Password
//   (PO.java :3289-3295), delete needs the table's own IsChangeLog. Judged: crud_core.changeRule on the seed dictionary vs that rule
//   evaluated on the PILOT dictionary, over the tables both have (X of N); tables only one side has are counted apart.
// Run: node tests/witness_changelog_rule.js 2>&1 | tee tests/witness_changelog_rule.log   (cwd = bim-ootb/erp; needs the pilot postgres container)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..');
let initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }); const db = new SQL.Database(fs.readFileSync(path.join(__dirname, '..', 'ad_seed.db')));
  globalThis.__idmpDb = db; const C = require('../crud_core.js');
  const pg = (sql) => cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-AtF', '\t', '-c', 'set search_path=adempiere; ' + sql], { maxBuffer: 1 << 28 }).toString().split('\n').filter(l => l && l !== 'SET').map(l => l.split('\t'));
  const lt = {}; pg("SELECT lower(tablename), (ischangelog='Y' OR EXISTS (SELECT 1 FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND c.columnname='EntityType'))::text, ischangelog FROM ad_table t").forEach(r => { lt[r[0]] = { logged: r[1] === 'true', tcl: r[2] === 'Y', cols: {} }; });
  pg("SELECT lower(t.tablename), lower(c.columnname) FROM ad_column c JOIN ad_table t USING (ad_table_id) WHERE c.isactive='Y' AND c.isallowlogging='Y' AND COALESCE(c.isencrypted,'N')<>'Y' AND COALESCE(c.columnsql,'')='' AND c.columnname<>'Password'").forEach(r => { if (lt[r[0]]) lt[r[0]].cols[r[1]] = 1; });
  const seedTables = db.exec('SELECT lower(TableName) FROM AD_Table')[0].values.map(v => v[0]);
  let both = 0, tOk = 0, cJudged = 0, cOk = 0; const tBad = [], cBad = [], onlySeed = [];
  seedTables.forEach(t => {
    const L = lt[t]; if (!L) { onlySeed.push(t); return; }
    both++; const R = C.changeRule(db, t, {});
    if (R.logged === L.logged && R.tableChangeLog === L.tcl) tOk++; else tBad.push(t + ' twin=' + R.logged + '/' + R.tableChangeLog + ' legacy=' + L.logged + '/' + L.tcl);
    const all = new Set(Object.keys(R.loggable).concat(Object.keys(L.cols)));
    all.forEach(c => { cJudged++; if (!!R.loggable[c] === !!L.cols[c]) cOk++; else cBad.push(t + '.' + c + ' twin=' + !!R.loggable[c] + ' legacy=' + !!L.cols[c]); });
  });
  // control: the twin's OLD rule (IsChangeLog only, no EntityType rule) on the same tables - how many it decided differently from legacy
  const oldMiss = seedTables.filter(t => lt[t] && lt[t].logged !== lt[t].tcl).length;
  console.log('§CLR-CONTROL oldRule(IsChangeLog only) wrong on ' + oldMiss + ' of ' + both + ' tables (the EntityType rule it lacked)');
  const oldCols = {}; db.exec("SELECT lower(t.TableName), lower(c.ColumnName) FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE c.IsAllowLogging='Y'")[0].values.forEach(v => { (oldCols[v[0]] = oldCols[v[0]] || {})[v[1]] = 1; });
  let oldColMiss = 0; seedTables.forEach(t => { if (!lt[t]) return; const o = oldCols[t] || {}; new Set(Object.keys(o).concat(Object.keys(lt[t].cols))).forEach(c => { if (!!o[c] !== !!lt[t].cols[c]) oldColMiss++; }); });
  console.log('§CLR-CONTROL oldRule(IsAllowLogging only) wrong on ' + oldColMiss + ' columns (virtual / Password / inactive columns it logged)');
  const onlyLegacy = Object.keys(lt).filter(t => seedTables.indexOf(t) < 0);
  console.log('§CLR-TABLES judged=' + both + ' equal=' + tOk + ' onlySeed=' + onlySeed.length + ' onlyLegacy=' + onlyLegacy.length);
  console.log('§CLR-TABLE-DIFF ' + JSON.stringify(tBad.slice(0, 40)));
  console.log('§CLR-COLUMNS judged=' + cJudged + ' equal=' + cOk);
  console.log('§CLR-COLUMN-DIFF n=' + cBad.length + ' ' + JSON.stringify(cBad.slice(0, 40)));
  ok = both > 0 && cJudged > 0;
  const pass = ok && tOk === both && cOk === cJudged;
  console.log('§CLR-VERDICT ' + (!ok ? 'INCONCLUSIVE (nothing judged)' : pass ? 'PASS' : 'FAIL') + ' tables ' + tOk + '/' + both + ' · columns ' + cOk + '/' + cJudged);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('§CLR-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
var ok;
