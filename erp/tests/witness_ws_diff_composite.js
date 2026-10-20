// ⚠ DO NOT REMOVE — W-WS-DIFF-COMPOSITE (bim-compiler prompts/ERP_WS_API.md S9). READ THE LOG (§WSX lines); exit code is not evidence.
// ISSUE it proves/disproves: the composite interface (POST /ADInterface/services/rest/composite_service/composite_operation) answers EXACTLY as REAL iDempiere (the pilot copy, :8088):
//   ordered operations in ONE transaction; any failed operation rolls back every operation since the last commit (IsRolledBack="true" on each response, the failing one carries the Error);
//   preCommit / postCommit; several <operations> blocks (each its own commit); @Table.Column / @#Login / @plain request variables between operations; recordIDVariable for setDocAction and readData.
// Compared: the raw CompositeResponses XML (ids and sequence numbers normalised) AND the rows / order state left behind. Fixture: scripts/ws/pilot_ws_misc_types.sql (WsfComposite 920008) + the order types 900000-900003 + WsfCreateBP.
// Verdict INCONCLUSIVE (never PASS) if no committed composite was compared. Run: node erp/tests/witness_ws_diff_composite.js [pilotBase]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { PILOT, esc, pg, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
const q = (v) => v === '' ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
function copyRows(table, where) {
  const cols = pg("select column_name from information_schema.columns where table_schema='adempiere' and table_name='" + table + "' order by ordinal_position").map(r => r[0]);
  return pg('select ' + cols.join(',') + ' from ' + table + ' where ' + where).map(r => 'INSERT OR REPLACE INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + r.map(q).join(',') + ');');
}
const LOGIN = (role) => '<ADLoginRequest><user>GardenAdmin</user><pass>GardenAdmin</pass><lang>en_US</lang><ClientID>11</ClientID><RoleID>' + (role || 102) + '</RoleID><OrgID>11</OrgID><WarehouseID>103</WarehouseID><stage>0</stage></ADLoginRequest>';
const row = (fs2) => '<DataRow>' + fs2.map(f => '<field column="' + f[0] + '"><val>' + esc(f[1]) + '</val></field>').join('') + '</DataRow>';
const op = (port, type, table, action, fields, o) => { o = o || {}; return '<operation' + (o.pre ? ' preCommit="true"' : '') + (o.post ? ' postCommit="true"' : '') + '><TargetPort>' + port + '</TargetPort><ModelCRUD><serviceType>' + type + '</serviceType><TableName>' + table + '</TableName><RecordID>' + (o.id || 0) + '</RecordID>' + (o.idvar ? '<recordIDVariable>' + o.idvar + '</recordIDVariable>' : '') + '<Action>' + action + '</Action>' + (fields ? row(fields) : '') + '</ModelCRUD></operation>'; };
const sda = (type, table, idvar, action) => '<operation><TargetPort>setDocAction</TargetPort><ModelSetDocAction><serviceType>' + type + '</serviceType><tableName>' + table + '</tableName><recordID>0</recordID><recordIDVariable>' + idvar + '</recordIDVariable><docAction>' + action + '</docAction></ModelSetDocAction></operation>';
const comp = (blocks, type, role) => '<?xml version="1.0" encoding="UTF-8"?><CompositeRequest xmlns="http://idempiere.org/ADInterface/1_0">' + LOGIN(role) + '<serviceType>' + (type || 'WsfComposite') + '</serviceType>' + blocks.map(b => '<operations>' + b.join('') + '</operations>').join('') + '</CompositeRequest>';
const bp = (v, extra) => op('createData', 'WsfCreateBP', 'C_BPartner', 'Create', [['Value', v], ['Name', 'Co ' + v], ['C_BP_Group_ID', '104'], ['SO_CreditLimit', '1']].concat(extra || []));
const HDR = [['AD_Org_ID', '11'], ['C_DocTypeTarget_ID', '133'], ['IsSOTrx', 'Y'], ['DateOrdered', '2006-12-15 00:00:00'], ['DateAcct', '2006-12-15 00:00:00'], ['DatePromised', '2006-12-15 00:00:00'], ['C_BPartner_ID', '117'], ['C_BPartner_Location_ID', '112'], ['Bill_BPartner_ID', '117'], ['Bill_Location_ID', '112'],
  ['M_Warehouse_ID', '103'], ['M_PriceList_ID', '101'], ['C_Currency_ID', '100'], ['C_PaymentTerm_ID', '106'], ['PaymentRule', 'P'], ['InvoiceRule', 'I'], ['DeliveryRule', 'F'], ['DeliveryViaRule', 'P'], ['FreightCostRule', 'I'], ['PriorityRule', '5'], ['SalesRep_ID', '101']];
const LINE = (oidVal) => [['AD_Org_ID', '11'], ['C_Order_ID', oidVal], ['Line', '10'], ['M_Product_ID', '126'], ['QtyEntered', '2'], ['QtyOrdered', '2'], ['C_UOM_ID', '101'], ['PriceEntered', '45'], ['PriceActual', '45'], ['PriceList', '45'], ['C_Tax_ID', '104']];
const norm = (t) => t.replace(/<\?xml[^>]*\?>/, '').replace(/\s+/g, ' ').trim().replace(/ xmlns:_0="[^"]*"/, '')
  .replace(/RecordID="\d+"/g, 'RecordID="#"').replace(/(column="C_(?:BPartner|Order)_ID" value=")\d+/g, '$1#').replace(/(column="C_(?:BPartner|Order)_ID"><_0:val>)\d+/g, '$1#').replace(/ Detail:[^<]*/g, '').replace(/Record already presents with \S+ = \d+/g, 'Record already presents #');
const post = async (base, x) => { const r = await fetch(base + '/ADInterface/services/rest/composite_service/composite_operation', { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: x }); return { status: r.status, text: await r.text() }; };
(async () => {
  const TAG = 'WSX-' + Date.now();   // one order description per run: the pilot keeps the documents of earlier runs
  const fx = sqliteInsertsFromPilot(900000, 900003), fx2 = sqliteInsertsFromPilot(920001, 920008), fx3 = sqliteInsertsFromPilot(910001, 910001);
  const extra = [].concat(copyRows('ws_webservicetypeaccess', 'ws_webservicetype_id in (920008, 910001)'), copyRows('ad_role', 'ad_role_id=920100'), copyRows('ad_role_orgaccess', 'ad_role_id=920100'), copyRows('ad_user_roles', 'ad_role_id=920100'), copyRows('ad_role_included', 'ad_role_id=920100'));
  const fxFile = path.join(os.tmpdir(), 'ws_comp_fixture.sql'); fs.writeFileSync(fxFile, fx.sql + fx2.sql + fx3.sql + extra.join('\n') + '\n');
  console.log('§WSX fixture rows copied from the pilot=' + (fx.n + fx2.n + fx3.n + extra.length));
  const cleanPilot = () => { try { pg("delete from c_bp_customer_acct where c_bpartner_id in (select c_bpartner_id from c_bpartner where value like 'WSCO%'); delete from c_bp_vendor_acct where c_bpartner_id in (select c_bpartner_id from c_bpartner where value like 'WSCO%'); delete from ad_treenodebp where node_id in (select c_bpartner_id from c_bpartner where value like 'WSCO%'); delete from c_bpartner where value like 'WSCO%'"); } catch (e) { console.log('§WSX cleanup FAILED ' + String(e.message).split('\n')[0]); } };
  cleanPilot();
  const server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port, K = server.kernel;
  const rowsNow = (side) => side === 'pilot' ? pg("select value||':'||name||':'||coalesce(taxid,'') from c_bpartner where value like 'WSCO%' order by 1").map(r => r[0]).sort().join(',') : K.q("select value, name, taxid from c_bpartner where value like 'WSCO%'").map(r => r.value + ':' + r.name + ':' + (r.taxid == null ? '' : r.taxid)).sort().join(',');
  const orderState = (side) => side === 'pilot' ? pg("select count(*), coalesce(string_agg(distinct docstatus,','),'') from c_order where description='" + TAG + "'").map(r => r.join('/'))[0] + ' ' + pg("select count(*) from c_orderline where c_order_id in (select c_order_id from c_order where description='" + TAG + "')")[0][0]
    : (() => { const o = K.q("select docstatus from c_order where description='" + TAG + "'"); return o.length + '/' + [...new Set(o.map(x => x.docstatus))].join(',') + ' ' + K.q("select count(*) n from c_orderline where c_order_id in (select c_order_id from c_order where description='" + TAG + "')")[0].n; })();
  const ORD = (desc) => op('createData', 'Pilot_createData_C_Order', 'C_Order', 'Create', HDR.concat([['Description', desc]]));
  const C = [
    ['c1_two_creates_committed', comp([[bp('WSCO1'), bp('WSCO2')]])],
    ['c2_second_fails_all_rolled_back', comp([[bp('WSCO3'), bp('WSCO1')]])],
    ['c3_unknown_composite_type', comp([[bp('WSCO4')]], 'NoSuchComposite')],
    ['c4_unknown_operation_type', comp([[op('createData', 'NoSuchOpType', 'C_BPartner', 'Create', [['Value', 'WSCO5']])]])],
    ['c5_two_blocks_first_commits', comp([[bp('WSCO6')], [bp('WSCO6')]])],
    ['c6_precommit_postcommit', comp([[bp('WSCO7'), op('createData', 'WsfCreateBP', 'C_BPartner', 'Create', [['Value', 'WSCO8'], ['Name', 'Co 8'], ['C_BP_Group_ID', '104'], ['SO_CreditLimit', '8']], { post: true }), bp('WSCO7')]])],
    ['c7_login_variable', comp([[bp('WSCO9', [['TaxID', '@#AD_Client_ID']])]])],
    ['c8_unresolved_table_variable', comp([[bp('WSCO10', [['TaxID', '@C_Nope.C_Nope_ID']])]])],
    ['c9_plain_variable_falls_back_to_literal', comp([[bp('WSCO11', [['SO_CreditLimit', '@nothing']])]])],
    ['c10_order_flow_with_variables', comp([[ORD(TAG), op('createData', 'Pilot_createData_C_OrderLine', 'C_OrderLine', 'Create', LINE('@C_Order.C_Order_ID')), sda('Pilot_setDocAction_C_Order', 'C_Order', '@C_Order.C_Order_ID', 'CO')]])],
    ['c11_order_flow_failing_complete_rolls_back_order', comp([[ORD(TAG), sda('Pilot_setDocAction_C_Order', 'C_Order', '@C_Order.C_Order_ID', 'CO')]])],
    ['c14_read_with_record_id_variable', comp([[bp('WSCO14'), op('readData', 'ReadWSBPartner', 'C_BPartner', 'Read', null, { idvar: '@C_BPartner.C_BPartner_ID' })]])],
    ['c15_read_unresolved_variable', comp([[op('readData', 'ReadWSBPartner', 'C_BPartner', 'Read', null, { idvar: '@C_Nope.C_Nope_ID' })]])],
    ['c12_role_without_access', comp([[bp('WSCO12')]], 'WsfComposite', 103)],
    ['c13_role_included', comp([[bp('WSCO13')]], 'WsfComposite', 920100)],
  ];
  let judged = 0, failed = 0, committed = 0;
  for (const [name, x] of C) {
    const res = {};
    for (const side of ['pilot', 'twin']) { const r = await post(side === 'pilot' ? PILOT : TWIN, x); res[side] = { st: r.status, x: r.status === 200 ? norm(r.text) : '(http ' + r.status + ')', rows: rowsNow(side), ord: /c1[01]_/.test(name) ? orderState(side) : '' }; }
    const same = res.pilot.st === res.twin.st && res.pilot.x === res.twin.x && res.pilot.rows === res.twin.rows && res.pilot.ord === res.twin.ord; judged++; if (!same) failed++;
    if (same && res.pilot.st === 200 && !/IsError/.test(res.pilot.x)) committed++;
    console.log('§WSX ' + name + ' ' + (same ? 'MATCH ' + res.pilot.x.slice(0, 160) + ' | rows=' + res.pilot.rows + (res.pilot.ord ? ' | order=' + res.pilot.ord : '') : 'DIFF\n   legacy=' + res.pilot.x.slice(0, 1200) + ' | rows=' + res.pilot.rows + ' | order=' + res.pilot.ord + '\n   twin  =' + res.twin.x.slice(0, 1200) + ' | rows=' + res.twin.rows + ' | order=' + res.twin.ord));
  }
  cleanPilot();
  const verdict = committed === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSX_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' committedCompared=' + committed + ' journalEntries=' + K.journal.length);
  server.close(); process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSX ERROR ' + e.stack); process.exit(2); });
