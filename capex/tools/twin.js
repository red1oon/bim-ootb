// capex/tools/twin.js — Source A (SQLite ERP DB) vs Source B (capex/legacy_snapshot.json): per-tile §DASH_TWIN + §DASH_TWIN_VERDICT.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/twin.js [erp.db] [snapshot.json] [status=all] [today]
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js'), A = require('../adapters.js'), T = require('../tiles.js');
(async () => {
  const [db = path.join(__dirname, '..', '..', 'erp', 'ad_seed.db'), snap = path.join(__dirname, '..', 'legacy_snapshot.json'), status = 'all', today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
  const SQL = await initSqlJs(), a = A.fromSqlite(new SQL.Database(fs.readFileSync(db))), b = JSON.parse(fs.readFileSync(snap, 'utf8')), f = { status, today };
  console.log(`§DASH_TWIN_INPUT status=${status} today=${today} sqlite projects=${a.projects.length} [${a.projects.map(p => p.Value + '#' + p.C_Project_ID).join(',')}] legacy projects=${b.projects.length} [${b.projects.map(p => p.Value + '#' + p.C_Project_ID).join(',')}] legacy unavailable=[${b.unavailable}]`);
  const r = T.twin(T.flatten(T.compute(a, f).tiles), T.flatten(T.compute(b, f).tiles), console.log); process.exitCode = r.verdict === 'PASS' ? 0 : 1;
})();
