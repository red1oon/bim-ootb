// ⚠ DO NOT REMOVE — W-WS-DIFF-WRITE (bim-compiler prompts/ERP_WS_API.md S2). READ THE LOG (§WSW lines); exit code is not evidence.
// ISSUE it proves/disproves: the Kernel ERP answers the SAME ADInterface create_data / update_data / delete_data requests exactly as REAL iDempiere does - the same StandardResponse
//   (RecordID, outputFields order + Text, IsError + the legacy error text) AND the same resulting database row. Reference = the pilot copy (idempiere_pilot, :8088).
// How it stays honest: the web-service TYPE ROWS the twin uses are COPIED FROM THE PILOT (ws_webservicetype/_para/_fieldinput/_fieldoutput/_typeaccess for ids 920001-920003, scripts/ws/pilot_ws_write_types.sql),
//   so a difference is the engine, never the fixture. Each scenario runs on both systems in the same order; ids differ per system and are normalised to '#'.
//   One declared quirk (counted apart, never hidden): a NOT NULL violation is answered by the DB; the PostgreSQL "Detail: Failing row contains (...)" tail is not reproducible and is cut before comparing.
// Preconditions: pilot up (:8088) with pilot_ws_write_types.sql applied AND the server restarted (role access is cached 60 min). Cleans up the pilot rows it creates.
// Verdict INCONCLUSIVE (never PASS) if no successful write was compared. Run: node erp/tests/witness_ws_diff_write.js [pilotBase]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { PILOT, pg, crud, post, norm, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
const COLS = 'value,name,c_bp_group_id,iscustomer,isvendor,taxid,so_creditlimit,isactive,ad_client_id,ad_org_id';
const rowKey = (vals) => vals.map(v => v == null || v === '' ? '∅' : (/^-?\d+(\.\d+)?$/.test(String(v)) ? String(Number(v)) : String(v))).join('|');
(async () => {
  const fx = sqliteInsertsFromPilot(920001, 920003); const fxFile = path.join(os.tmpdir(), 'ws_write_fixture.sql'); fs.writeFileSync(fxFile, fx.sql);
  console.log('§WSW fixture rows copied from the pilot=' + fx.n);
  pg("delete from c_bpartner where value like 'WSW%'");
  const server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port, K = server.kernel;
  if (process.env.WSW_BREAK) K.breakMode = process.env.WSW_BREAK;   // negative control: WSW_BREAK=nofk must turn create_bad_fk RED
  const ids = { pilot: null, twin: null }; let judged = 0, failed = 0, writesCompared = 0;
  const rowOf = (side, id) => side === 'pilot' ? (pg('select ' + COLS + ' from c_bpartner where c_bpartner_id=' + Number(id))[0] || null) : (() => { const r = K.one('SELECT ' + COLS + ' FROM c_bpartner WHERE c_bpartner_id=?', [Number(id)]); return r ? COLS.split(',').map(c => r[c]) : null; })();
  const ST = [
    { n: 'create_ok', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW1'], ['Name', 'WS Write One'], ['C_BP_Group_ID', '104'], ['SO_CreditLimit', '12.5'], ['IsCustomer', 'Y']] }), keep: 1 },
    { n: 'create_duplicate_value', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW1'], ['Name', 'Dup'], ['C_BP_Group_ID', '104']] }) },
    { n: 'create_no_name', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW2'], ['C_BP_Group_ID', '104']] }) },
    { n: 'create_bad_fk', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW3'], ['Name', 'n'], ['C_BP_Group_ID', '999999']] }) },
    { n: 'create_bad_decimal', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW4'], ['Name', 'n'], ['SO_CreditLimit', 'abc']] }) },
    { n: 'create_bad_boolean', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW5'], ['Name', 'n'], ['IsCustomer', 'maybe']] }) },
    { n: 'create_bad_integer', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW6'], ['Name', 'n'], ['C_BP_Group_ID', 'x1']] }) },
    { n: 'create_column_not_allowed', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW7'], ['Name', 'n'], ['Description', 'no']] }) },
    { n: 'create_unknown_column', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW8'], ['Name', 'n'], ['Foo', 'no']] }) },
    { n: 'create_type_not_configured', m: 'create_data', c: () => ({ type: 'NoSuchWsType', table: 'C_BPartner', action: 'Create', fields: [] }) },
    { n: 'update_ok', m: 'update_data', c: (id) => ({ type: 'WsfUpdateBP', table: 'C_BPartner', id, action: 'Update', fields: [['Name', 'WS Write One B'], ['IsVendor', 'Y'], ['TaxID', 'T-1']] }), usesId: 1 },
    { n: 'update_no_change_values', m: 'update_data', c: (id) => ({ type: 'WsfUpdateBP', table: 'C_BPartner', id, action: 'Update', fields: [['Name', 'WS Write One B']] }), usesId: 1 },
    { n: 'update_missing_record', m: 'update_data', c: () => ({ type: 'WsfUpdateBP', table: 'C_BPartner', id: 99999999, action: 'Update', fields: [['Name', 'x']] }) },
    { n: 'update_column_not_allowed', m: 'update_data', c: (id) => ({ type: 'WsfUpdateBP', table: 'C_BPartner', id, action: 'Update', fields: [['Description', 'no']] }), usesId: 1 },
    { n: 'update_bad_fk', m: 'update_data', c: (id) => ({ type: 'WsfUpdateBP', table: 'C_BPartner', id, action: 'Update', fields: [['C_BP_Group_ID', '999999']] }), usesId: 1 },
    { n: 'delete_ok', m: 'delete_data', c: (id) => ({ type: 'WsfDeleteBP', table: 'C_BPartner', id, action: 'Delete' }), usesId: 1, del: 1 },
    { n: 'delete_again_missing', m: 'delete_data', c: (id) => ({ type: 'WsfDeleteBP', table: 'C_BPartner', id, action: 'Delete' }), usesId: 1 },
    { n: 'role_without_access', m: 'create_data', c: () => ({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSW9'], ['Name', 'n']] }), login: { roleId: 103 } },
  ];
  for (const s of ST) {
    const res = {};
    for (const side of ['pilot', 'twin']) {
      const c = s.c(s.usesId ? ids[side] : null);
      const r = await post(side === 'pilot' ? PILOT : TWIN, s.m, crud(c, s.login)); const nr = norm(r);
      if (s.keep && nr.ok) { const m = /RecordID="(\d+)"/.exec(r.text); ids[side] = m ? Number(m[1]) : null; }
      res[side] = { n: nr, row: (s.keep || s.usesId) && ids[side] ? rowOf(side, ids[side]) : null, raw: r.text.slice(0, 300) };
    }
    judged++;
    const idN = (side) => JSON.stringify(res[side].n).split(String(ids[side])).join('#'); const same = idN('pilot') === idN('twin') && JSON.stringify(res.pilot.row && rowKey(res.pilot.row)) === JSON.stringify(res.twin.row && rowKey(res.twin.row));
    if (res.pilot.n.ok) writesCompared++;
    if (!same) failed++;
    console.log('§WSW ' + s.n + ' ' + (same ? 'MATCH' : 'DIFF') + ' ' + (same ? JSON.stringify(res.pilot.n).slice(0, 200) : '\n   legacy=' + JSON.stringify(res.pilot.n) + ' row=' + (res.pilot.row && rowKey(res.pilot.row)) + '\n   twin  =' + JSON.stringify(res.twin.n) + ' row=' + (res.twin.row && rowKey(res.twin.row))));
  }
  pg("delete from c_bpartner where value like 'WSW%'");
  const verdict = writesCompared === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSW_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' successfulWritesCompared=' + writesCompared + ' journalEntries=' + K.journal.length);
  server.close(); process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSW ERROR ' + e.stack); process.exit(2); });
