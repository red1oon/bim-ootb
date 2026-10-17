// ⚠ DO NOT REMOVE — W-WS-DIFF-JSON (bim-compiler prompts/ERP_WS_API.md S4). READ THE LOG (§WSJ lines); exit code is not evidence.
// ISSUE it proves/disproves: the JSON door an AI client uses (Content-Type: application/json on the SAME /ADInterface/services/rest/model_adservice/<method> path, legacy's own JAXB-JSON binding) answers
//   the twin exactly as it answers REAL iDempiere: same keys ("@attr", single child = object, several = array), same TYPES (ids and amounts are JSON numbers, text is text, a null is {"@nil":true}),
//   same RowCount/Success, same errors. One engine: the JSON path is a wire translation over the XML handlers (ws_json.js), never a second implementation.
// Declared quirks (counted apart): record ids and Created/Updated stamps differ per system (ids normalised to '#', stamps compared by TYPE only); query_data row ORDER is the database's natural order (compared sorted).
// Fixture: types 920001-920005 COPIED from the pilot. Verdict INCONCLUSIVE if no successful call was compared. Run: node erp/tests/witness_ws_diff_json.js [pilotBase]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { PILOT, LOGIN, pg, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
const LG = (login) => { const L = Object.assign({}, LOGIN, login || {}); return { user: L.user, pass: L.pass, lang: 'en_US', ClientID: L.clientId, RoleID: L.roleId, OrgID: L.orgId, WarehouseID: L.warehouseId, stage: 0 }; };
async function post(base, method, obj) { const r = await fetch(base + '/ADInterface/services/rest/model_adservice/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(obj) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { _raw: t.slice(0, 200), _status: r.status }; } return j; }
const crud = (type, table, id, action, fields, filter, login) => ({ ModelCRUDRequest: { ModelCRUD: Object.assign({ serviceType: type, TableName: table, RecordID: id, Action: action }, filter ? { Filter: filter } : {}, fields ? { DataRow: { field: fields.map(f => ({ '@column': f[0], val: f[1] })) } } : {}), ADLoginRequest: LG(login) } });
function norm(j, id) {   // ids -> '#', stamps -> type, rows sorted
  const s = JSON.stringify(j, (k, v) => ((k === 'val' || k === '@value') && typeof v === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(v) && /Created|Updated/.test('') ? v : v));
  const o = JSON.parse(s);
  (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (n['@column'] === 'Created' || n['@column'] === 'Updated') n.val = typeof n.val; Object.keys(n).forEach(k => walk(n[k])); } })(o);
  const rows = o.WindowTabData && o.WindowTabData.DataSet && o.WindowTabData.DataSet.DataRow; if (Array.isArray(rows)) rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return id == null ? JSON.stringify(o) : JSON.stringify(o).split(String(id)).join('#');
}
(async () => {
  const fxs = [sqliteInsertsFromPilot(920001, 920005), sqliteInsertsFromPilot(910001, 910001), sqliteInsertsFromPilot(900000, 900003)], fx = { sql: fxs.map(x => x.sql).join(''), n: fxs.reduce((a, x) => a + x.n, 0) }; const fxFile = path.join(os.tmpdir(), 'ws_json_fixture.sql'); fs.writeFileSync(fxFile, fx.sql);
  console.log('§WSJ fixture rows copied from the pilot=' + fx.n);
  pg("delete from c_bpartner where value like 'WSJ%'");
  const server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port;
  const ids = {}; let judged = 0, failed = 0, okCompared = 0;
  const C = [
    { n: 'read_one', m: 'read_data', c: () => crud('ReadWSBPartner', 'C_BPartner', 117, 'Read') },
    { n: 'read_missing', m: 'read_data', c: () => crud('ReadWSBPartner', 'C_BPartner', 999999, 'Read') },
    { n: 'query_two_rows', m: 'query_data', c: () => crud('WsfQueryBP', 'C_BPartner', 0, 'Read', null, "value in ('C&W','JoeBlock')") },
    { n: 'query_one_row', m: 'query_data', c: () => crud('WsfQueryBP', 'C_BPartner', 0, 'Read', null, "value='C&W'") },
    { n: 'query_no_rows', m: 'query_data', c: () => crud('WsfQueryBP', 'C_BPartner', 0, 'Read', null, "value='NoSuchPartner'") },
    { n: 'query_by_input_field', m: 'query_data', c: () => crud('WsfQueryBP', 'C_BPartner', 0, 'Read', [['Value', 'C&W']]) },
    { n: 'wrong_password', m: 'read_data', c: () => crud('ReadWSBPartner', 'C_BPartner', 117, 'Read', null, null, { pass: 'nope' }) },
    { n: 'type_not_configured', m: 'read_data', c: () => crud('NoSuchWsType', 'C_BPartner', 117, 'Read') },
    { n: 'create_ok', m: 'create_data', c: () => crud('WsfCreateBP', 'C_BPartner', 0, 'Create', [['Value', 'WSJ1'], ['Name', 'Json One'], ['C_BP_Group_ID', 104], ['SO_CreditLimit', 12.5]]), keep: 1 },
    { n: 'create_column_not_allowed', m: 'create_data', c: () => crud('WsfCreateBP', 'C_BPartner', 0, 'Create', [['Foo', 'x']]) },
    { n: 'update_ok', m: 'update_data', c: (s) => crud('WsfUpdateBP', 'C_BPartner', ids[s], 'Update', [['Name', 'Json One B']]), id: 1 },
    { n: 'update_missing', m: 'update_data', c: () => crud('WsfUpdateBP', 'C_BPartner', 99999999, 'Update', [['Name', 'x']]) },
    { n: 'delete_ok', m: 'delete_data', c: (s) => crud('WsfDeleteBP', 'C_BPartner', ids[s], 'Delete'), id: 1 },
    { n: 'run_process', m: 'run_process', c: () => ({ ModelRunProcessRequest: { ModelRunProcess: { '@AD_Process_ID': 53229, '@AD_Menu_ID': 0, '@AD_Record_ID': 0, serviceType: 'WsfRunBOMVerify', ParamValues: { field: [{ '@column': 'M_Product_ID', val: 133 }] } }, ADLoginRequest: LG() } }) },
    { n: 'docaction_missing_record', m: 'set_docaction', c: () => ({ ModelSetDocActionRequest: { ModelSetDocAction: { serviceType: 'Pilot_setDocAction_C_Order', tableName: 'C_Order', recordID: 99999999, docAction: 'CO' }, ADLoginRequest: LG() } }) },
  ];
  for (const s of C) {
    const res = {};
    for (const side of ['pilot', 'twin']) {
      const j = await post(side === 'pilot' ? PILOT : TWIN, s.m, s.c(side));
      if (s.keep && j.StandardResponse && j.StandardResponse['@RecordID']) ids[side] = j.StandardResponse['@RecordID'];
      res[side] = norm(j, s.id || s.keep ? ids[side] : null);
    }
    const same = res.pilot === res.twin; judged++; if (!same) failed++; if (same && !/Error/.test(res.pilot)) okCompared++;
    console.log('§WSJ ' + s.n + ' ' + (same ? 'MATCH ' + res.pilot.slice(0, 190) : 'DIFF\n   legacy=' + res.pilot.slice(0, 600) + '\n   twin  =' + res.twin.slice(0, 600)));
  }
  pg("delete from c_bpartner where value like 'WSJ%'");
  const verdict = okCompared === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSJ_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' successfulCallsCompared=' + okCompared);
  server.close(); process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSJ ERROR ' + e.stack); process.exit(2); });
