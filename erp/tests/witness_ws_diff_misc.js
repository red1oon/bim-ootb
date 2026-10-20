// ⚠ DO NOT REMOVE — W-WS-DIFF-MISC (bim-compiler prompts/ERP_WS_API.md S8). READ THE LOG (§WSM lines); exit code is not evidence.
// ISSUE it proves/disproves: three more legacy web-service behaviours answer EXACTLY as REAL iDempiere (the pilot copy, :8088) does:
//   get_list           - the entries of an AD_Reference (a LIST reference and a TABLE reference), filters, refusals, HTTP 500 faults (response compared as raw XML)
//   create_update_data - find-by-IsIdentifier-column then create / update / create-or-update, with legacy's refusal texts, and the resulting stored row
//   AD_Role_Included   - a role that has NO access row of its own but includes a role that has one reaches the service type (AbstractService.ROLE_ACCESS_SQL)
// Fixture: scripts/ws/pilot_ws_misc_types.sql (types 920006/920007, role 920100) + the stock GetListSalesRegions access row, COPIED from the pilot to the twin (no hand-copy).
// Declared quirk (counted apart): ids and sequence numbers differ per system and are normalised. Verdict INCONCLUSIVE (never PASS) if nothing was compared.
// Run: node erp/tests/witness_ws_diff_misc.js [pilotBase]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { PILOT, LOGIN, esc, pg, crud, post, norm, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
const q = (v) => v === '' ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
function copyRows(table, where) {   // pilot rows -> INSERT OR REPLACE for the twin (columns = the pilot's, '' = NULL)
  const cols = pg("select column_name from information_schema.columns where table_schema='adempiere' and table_name='" + table + "' order by ordinal_position").map(r => r[0]);
  return pg('select ' + cols.join(',') + ' from ' + table + ' where ' + where).map(r => 'INSERT OR REPLACE INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + r.map(q).join(',') + ');');
}
const glXml = (type, ref, filter, login) => { const L = Object.assign({}, LOGIN, login || {});
  return '<?xml version="1.0" encoding="UTF-8"?><ModelGetListRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelGetList><serviceType>' + esc(type) + '</serviceType><AD_Reference_ID>' + ref + '</AD_Reference_ID><Filter>' + esc(filter || '') + '</Filter></ModelGetList><ADLoginRequest><user>' + L.user + '</user><pass>' + L.pass + '</pass><lang>en_US</lang><ClientID>' + L.clientId + '</ClientID><RoleID>' + L.roleId + '</RoleID><OrgID>' + L.orgId + '</OrgID><WarehouseID>' + L.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelGetListRequest>'; };
const squash = (t) => t.replace(/\s+/g, ' ').trim();
(async () => {
  const fx = sqliteInsertsFromPilot(920006, 920007), extra = [].concat(
    copyRows('ws_webservicetypeaccess', 'ws_webservicetype_id in (200003, 920006, 920007)'),
    copyRows('ad_role', 'ad_role_id=920100'), copyRows('ad_role_orgaccess', 'ad_role_id=920100'), copyRows('ad_user_roles', 'ad_role_id=920100'), copyRows('ad_role_included', 'ad_role_id=920100'));
  const fxFile = path.join(os.tmpdir(), 'ws_misc_fixture.sql'); fs.writeFileSync(fxFile, fx.sql + extra.join('\n') + '\n');
  console.log('§WSM fixture rows copied from the pilot=' + (fx.n + extra.length));
  pg("delete from c_bpartner where value like 'WSCU%'");
  const server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port;
  let judged = 0, failed = 0, compared = 0;
  const T = 'WsfCreateUpdateBP';
  const cu = (action, fields, login) => ({ m: 'create_update_data', body: crud({ type: T, table: 'C_BPartner', action, fields }, login), cu: 1 });
  const gl = (type, ref, filter, login) => ({ m: 'get_list', body: glXml(type, ref, filter, login), gl: 1 });
  const CASES = [
    ['getlist_list_reference', gl('WsfGetListRef', 135)], ['getlist_list_filter', gl('WsfGetListRef', 135, "Value LIKE 'C%'")], ['getlist_list_filter_nomatch', gl('WsfGetListRef', 135, "Value LIKE 'ZZ%'")],
    ['getlist_table_reference', gl('GetListSalesRegions', 144)], ['getlist_filter_not_configured', gl('GetListSalesRegions', 144, "Name LIKE 'E%'")], ['getlist_unknown_reference', gl('WsfGetListRef', 999999)],
    ['getlist_unknown_type', gl('NoSuchType', 135)], ['getlist_role_without_access', gl('WsfGetListRef', 135, '', { roleId: 103 })], ['getlist_wrong_password', gl('WsfGetListRef', 135, '', { pass: 'nope' })],
    ['role_included_getlist', gl('WsfGetListRef', 135, "Value LIKE 'C%'", { roleId: 920100 })], ['role_included_getlist_table', gl('GetListSalesRegions', 144, '', { roleId: 920100 })],
    ['cu_create', cu('Create', [['Value', 'WSCU1'], ['Name', 'CU One'], ['IsVendor', 'Y'], ['C_BP_Group_ID', '104']])],
    ['cu_create_exists', cu('Create', [['Value', 'WSCU1'], ['Name', 'CU One again'], ['C_BP_Group_ID', '104']])],
    ['cu_update', cu('Update', [['Value', 'WSCU1'], ['Name', 'CU One updated'], ['TaxID', 'T-CU']])],
    ['cu_update_missing', cu('Update', [['Value', 'WSCU-NONE'], ['Name', 'x']])],
    ['cu_createupdate_new', cu('CreateUpdate', [['Value', 'WSCU2'], ['Name', 'CU Two'], ['C_BP_Group_ID', '104']])],
    ['cu_createupdate_existing', cu('CreateUpdate', [['Value', 'WSCU2'], ['Name', 'CU Two changed'], ['IsVendor', 'Y']])],
    ['cu_key_not_given', cu('CreateUpdate', [['Name', 'no key']])],
    ['cu_create_no_name', cu('Create', [['Value', 'WSCU3'], ['C_BP_Group_ID', '104']])],
    ['cu_column_not_allowed', cu('Create', [['Value', 'WSCU4'], ['Name', 'n'], ['Description', 'no']])],
    ['cu_bad_fk', cu('Create', [['Value', 'WSCU5'], ['Name', 'n'], ['C_BP_Group_ID', '999999']])],
    ['cu_role_without_access', cu('Create', [['Value', 'WSCU6'], ['Name', 'n']], { roleId: 103 })],
    ['role_included_createupdate', cu('CreateUpdate', [['Value', 'WSCU7'], ['Name', 'via included role'], ['C_BP_Group_ID', '104']], { roleId: 920100 })],
  ];
  const rowOf = (side, v) => side === 'pilot' ? (pg("select value,name,isvendor,taxid,c_bp_group_id from c_bpartner where value='" + v + "'")[0] || []).join('|') : (() => { const r = server.kernel.one('SELECT value,name,isvendor,taxid,c_bp_group_id FROM c_bpartner WHERE value=?', [v]); return r ? Object.values(r).map(x => x == null ? '' : x).join('|') : ''; })();
  for (const [name, c] of CASES) {
    const res = {};
    for (const side of ['pilot', 'twin']) {
      const r = await post(side === 'pilot' ? PILOT : TWIN, c.m, c.body); let n;
      if (c.gl) n = { http: r.status, xml: squash(r.text).replace(/<\?xml[^>]*\?>/, '').trim() };
      else { n = norm(r); if (n.ok) compared++; }
      const key = /<field column="Value"><val>(WSCU\d)<\/val>/.exec(c.body); res[side] = { n, row: c.cu ? ['WSCU1', 'WSCU2', 'WSCU7'].map(v => rowOf(side, v)).join(' ; ') : null };
    }
    const idN = (side) => JSON.stringify(res[side].n).replace(/\["C_BPartner_ID","\d+",null\]/, '["C_BPartner_ID","#",null]').replace(/Record already presents with C_BPartner_ID = \d+/, 'Record already presents with C_BPartner_ID = #');
    const same = idN('pilot') === idN('twin') && res.pilot.row === res.twin.row; judged++; if (!same) failed++;
    if (c.gl && res.pilot.n.http === 200 && /<_0:Success>true/.test(res.pilot.n.xml)) compared++;
    console.log('§WSM ' + name + ' ' + (same ? 'MATCH ' + JSON.stringify(res.pilot.n).slice(0, 170) : 'DIFF\n   legacy=' + JSON.stringify(res.pilot.n).slice(0, 900) + ' row=' + res.pilot.row + '\n   twin  =' + JSON.stringify(res.twin.n).slice(0, 900) + ' row=' + res.twin.row));
  }
  try { pg("delete from c_bp_customer_acct where c_bpartner_id in (select c_bpartner_id from c_bpartner where value like 'WSCU%'); delete from c_bp_vendor_acct where c_bpartner_id in (select c_bpartner_id from c_bpartner where value like 'WSCU%'); delete from ad_treenodebp where node_id in (select c_bpartner_id from c_bpartner where value like 'WSCU%'); delete from c_bpartner where value like 'WSCU%'"); } catch (e) { console.log('§WSM cleanup on the pilot FAILED ' + String(e.message).split('\n')[0]); }
  const verdict = compared === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSM_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' successfulCompared=' + compared + ' journalEntries=' + server.kernel.journal.length);
  server.close(); process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSM ERROR ' + e.stack); process.exit(2); });
