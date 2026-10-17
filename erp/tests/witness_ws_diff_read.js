// ⚠ DO NOT REMOVE — W-WS-DIFF-READ (bim-compiler prompts/ERP_WS_API.md S1). READ THE LOG; exit code is not evidence.
// ISSUE it proves/disproves: the Kernel ERP answers the SAME ADInterface read_data / query_data requests exactly as REAL iDempiere does: the same refusal text for each login/authorisation failure
//   (ModelADServiceImpl / AbstractService strings), the same rows, the same columns in the same order. Reference = the pilot copy (idempiere_pilot, :8088, never the reference DB).
// Preconditions (pilot side, done once; role-access is cached 60 min by the server, so restart it after granting): bim-compiler scripts/ws/pilot_ws_read_access.sql + pilot_ws_read_types.sql.
// Verdict INCONCLUSIVE (never PASS) if no successful-read case compared a row. Run: node erp/tests/witness_ws_diff_read.js [pilotBase]
'use strict';
const path = require('path'), http = require('http');
const { start } = require('../ws_server.js');
const PILOT = process.argv[2] || process.env.PILOT_WS_BASE || 'http://localhost:8088';
const LOGIN = { user: 'GardenAdmin', pass: 'GardenAdmin', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103 };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function body(c, login) { const L = Object.assign({}, LOGIN, login || {});
  const fields = (c.fields || []).map(f => '<field column="' + esc(f[0]) + '"><val>' + esc(f[1]) + '</val></field>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?><ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelCRUD><serviceType>' + esc(c.type) + '</serviceType><TableName>' + esc(c.table) + '</TableName><RecordID>' + (c.id || 0) + '</RecordID>' +
    (c.filter ? '<Filter>' + esc(c.filter) + '</Filter>' : '') + '<Action>Read</Action>' + (fields ? '<DataRow>' + fields + '</DataRow>' : '') + '</ModelCRUD><ADLoginRequest><user>' + esc(L.user) + '</user><pass>' + esc(L.pass) + '</pass><lang>en_US</lang><ClientID>' + L.clientId +
    '</ClientID><RoleID>' + L.roleId + '</RoleID><OrgID>' + L.orgId + '</OrgID><WarehouseID>' + L.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelCRUDRequest>'; }
async function post(base, method, xml) { const r = await fetch(base + '/ADInterface/services/rest/model_adservice/' + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: xml }); const t = await r.text(); return r.status === 200 ? t : 'HTTP' + r.status + ' ' + t; }
function norm(xml) {   // -> { fault } | { error } | { attrs:'N/T/S', cols:[...], rows:[ 'v|v|..' sorted ] }
  const fl = /^HTTP(\d+) ([\s\S]*)$/.exec(xml); if (fl) return { http: Number(fl[1]), body: fl[2].trim() ? (/IdempiereServiceFault: ([^<\n]*)/.exec(fl[2]) || [, 'html'])[1].replace(/&amp;/g, '&') : 'empty' };
  const err = /<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/.exec(xml); if (err) return { error: err[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') };
  const attrs = ['NumRows', 'TotalRows', 'StartRow'].map(a => (new RegExp(a + '="([^"]*)"').exec(xml) || [])[1]).join('/');
  const rows = [], re = /<(?:\w+:)?DataRow>([\s\S]*?)<\/(?:\w+:)?DataRow>/g; let m, cols = null;
  while ((m = re.exec(xml))) { const cs = [], vs = []; const fr = /<(?:\w+:)?field\b[^>]*column="([^"]*)"[^>]*>([\s\S]*?)<\/(?:\w+:)?field>/g; let f;
    while ((f = fr.exec(m[1]))) { cs.push(f[1]); vs.push(/xsi:nil="true"/.test(f[2]) ? '∅' : ((/<(?:\w+:)?val>([\s\S]*?)<\/(?:\w+:)?val>/.exec(f[2]) || [])[1] || '')); } cols = cols || cs; rows.push(vs.join('¦')); }
  return { attrs, cols: cols || [], rows: rows.sort() };
}
const CASES = [
  { n: 'pwd_wrong', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, login: { pass: 'nope' } },
  { n: 'user_unknown', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, login: { user: 'NoSuchUser' } },
  { n: 'client_not_allowed', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, login: { clientId: 12 } },
  { n: 'role_not_allowed', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, login: { roleId: 999 } },
  { n: 'org_not_allowed', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, login: { orgId: 9999 } },
  { n: 'warehouse_not_allowed', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, login: { warehouseId: 9999 } },
  { n: 'type_not_configured', m: 'query_data', c: { type: 'NoSuchType', table: 'C_BPartner' } },
  { n: 'role_no_access_read', m: 'read_data', c: { type: 'ReadBPartner', table: 'C_BPartner', id: 118 } },
  { n: 'query_input_not_allowed', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner', fields: [['Name', 'Joe%']] } },
  { n: 'query_bpartner_constant_filter', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner' }, ok: true },
  { n: 'query_filter_overridden_by_constant', m: 'query_data', c: { type: 'QueryBPartner', table: 'C_BPartner', filter: "Name LIKE 'Joe%'" }, ok: true },
  { n: 'read_bpartner_118', m: 'read_data', c: { type: 'ReadWSBPartner', table: 'C_BPartner', id: 118 }, ok: true },
  { n: 'read_bpartner_missing', m: 'read_data', c: { type: 'ReadWSBPartner', table: 'C_BPartner', id: 99999999 } },
  { n: 'read_bpartner_117', m: 'read_data', c: { type: 'ReadWSBPartner', table: 'C_BPartner', id: 117 }, ok: true }
];
(async () => {
  const BREAK = process.env.WSD_BREAK || '';   // negative control: 'nofixture' = our side without the role grants / new read type -> the success cases must DIFF
  const srv = await start(0, BREAK === 'nofixture' ? [] : [path.join(__dirname, 'fixtures/ws_read_types.sqlite.sql')]), OURS = 'http://localhost:' + srv.address().port;
  let judged = 0, fails = 0, rowsCompared = 0, okCases = 0;
  for (const k of CASES) {
    const xml = body(k.c, k.login); let a, b;
    try { a = norm(await post(PILOT, k.m, xml)); b = norm(await post(OURS, k.m, xml)); } catch (e) { console.log('§WSD ' + k.n + ' HARNESS-FAIL ' + e.message); fails++; judged++; continue; }
    const same = JSON.stringify(a) === JSON.stringify(b); judged++; if (!same) fails++;
    if (!a.error && !b.error) { okCases++; rowsCompared += (a.rows || []).length; }
    console.log('§WSD ' + k.n + ' ' + (same ? 'MATCH' : 'DIFF') + ' legacy=' + JSON.stringify(a).slice(0, 220) + (same ? '' : ' ours=' + JSON.stringify(b).slice(0, 220)));
  }
  srv.close();
  const inc = rowsCompared === 0;
  console.log('§WSD_VERDICT ' + (inc ? 'INCONCLUSIVE' : fails ? 'DIFF' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + ' successCases=' + okCases + ' rowsCompared=' + rowsCompared);
  process.exit(fails || inc ? 1 : 0);
})();
