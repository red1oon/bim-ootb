// capex/tools/phase_progress.js — the film's progress beat (prompts/CAPEX_DASHBOARD.md §15 beat 7): mark ONE project phase complete on BOTH sides, the way a user ticks "Complete".
//   SQLite: the folded DB's C_ProjectPhase row (legacy MProjectPhase has no save rule on IsComplete — a plain column write; Updated = the local clock, like legacy's server stamp).
//   Legacy: stock update_data with the pilot-only type BridgeUpdateCProjectPhase (capex/tools/ws_capex_updatetypes.sql). Read the log: §PHASE_PROGRESS lines. Then re-run shed_twin.js.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/phase_progress.js <fold.db> <projectValue> <phaseName>
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js'), A = require('../adapters.js');
const Push = require(path.join(__dirname, '..', '..', 'viewer', 'erp_rest_push.js'));
const env = process.env, base = env.BRIDGE_BASE || 'http://localhost:8088';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) { console.error('§CFG local pilot only'); process.exit(2); }
const L = { user: env.BRIDGE_USER || 'GardenAdmin', pass: env.BRIDGE_PASS || 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const login = { user: L.user, pass: L.pass, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
async function q(type, filter) {
  const r = await fetch(base + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: type, Filter: filter }, ADLoginRequest: L } }) });
  return A.parseRows(JSON.parse(await r.text()));
}
const z = n => (n < 10 ? '0' : '') + n, d = new Date(), now = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
(async () => {
  const [dbPath, value, phase] = process.argv.slice(2);
  if (!dbPath || !value || !phase) { console.error('usage: phase_progress.js <fold.db> <projectValue> <phaseName>'); process.exit(2); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(dbPath));
  const row = db.exec("SELECT ph.C_ProjectPhase_ID, ph.IsComplete FROM C_ProjectPhase ph JOIN C_Project p ON p.C_Project_ID=ph.C_Project_ID WHERE p.Value=? AND ph.Name=?", [value, phase]);
  if (!row.length) { console.log('§PHASE_PROGRESS FAIL sqlite phase not found ' + value + '/' + phase); process.exit(1); }
  const [sid, was] = row[0].values[0];
  db.run("UPDATE C_ProjectPhase SET IsComplete='Y', Updated=? WHERE C_ProjectPhase_ID=?", [now, sid]); fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('§PHASE_PROGRESS side=sqlite phase=' + phase + ' id=' + sid + ' IsComplete ' + was + '→Y');
  const lp = (await q('QueryCProject', "Value='" + value + "'"))[0]; if (!lp) { console.log('§PHASE_PROGRESS FAIL legacy project not found ' + value); process.exit(1); }
  const lph = (await q('QueryCProjectPhase', 'C_Project_ID=' + lp.C_Project_ID + " AND Name='" + phase + "'"))[0]; if (!lph) { console.log('§PHASE_PROGRESS FAIL legacy phase not found'); process.exit(1); }
  const xml = Push.buildCrudXml(login, { serviceType: 'BridgeUpdateCProjectPhase', tableName: 'C_ProjectPhase', action: 'Update', recordId: lph.C_ProjectPhase_ID, fields: [{ column: 'IsComplete', val: 'Y' }] });
  const res = await fetch(base + '/ADInterface/services/rest/model_adservice/update_data', { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: xml });
  const sr = Push.parseStandardResponse(await res.text());
  if (sr.isError) { console.log('§PHASE_PROGRESS FAIL legacy update: ' + sr.error); process.exit(1); }
  const after = (await q('QueryCProjectPhase', 'C_ProjectPhase_ID=' + lph.C_ProjectPhase_ID))[0];
  console.log('§PHASE_PROGRESS side=legacy phase=' + phase + ' id=' + lph.C_ProjectPhase_ID + ' IsComplete ' + lph.IsComplete + '→' + after.IsComplete);
  process.exitCode = after.IsComplete === 'Y' ? 0 : 1;
})().catch(e => { console.log('§PHASE_PROGRESS FAIL ' + (e && e.stack || e)); process.exit(1); });
