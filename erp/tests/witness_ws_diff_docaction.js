// ⚠ DO NOT REMOVE — W-WS-DIFF-DOCACTION (bim-compiler prompts/ERP_WS_API.md S3). READ THE LOG (§WSA lines); exit code is not evidence.
// ISSUE it proves/disproves: a Sales Order created, edited, completed, re-completed and voided THROUGH THE WEB SERVICE ends in the same state in the twin as in REAL iDempiere: the same
//   StandardResponse / refusal text per step AND the same documents (order status, generated shipment + invoice, accounting facts). The API adds no logic: set_docaction = save DocAction, processIt, save.
// Fixture: the pilot's own stock-style types Pilot_createData_C_Order / _updateData_ / _setDocAction_ / Pilot_createData_C_OrderLine (ids 900000-900003) are COPIED to the twin, role 102.
// Declared quirk (counted apart): ids and DocumentNo sequence numbers differ per system and are normalised. Cleans nothing on the pilot (its books are a scratch copy; documents stay for inspection).
// Verdict INCONCLUSIVE (never PASS) if no successful action was compared. Run: node erp/tests/witness_ws_diff_docaction.js [pilotBase]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { PILOT, pg, crud, docActionXml, post, norm, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
const HDR = [['AD_Org_ID', '11'], ['C_DocTypeTarget_ID', '133'], ['IsSOTrx', 'Y'], ['DateOrdered', '2006-12-15 00:00:00'], ['DateAcct', '2006-12-15 00:00:00'], ['DatePromised', '2006-12-15 00:00:00'], ['C_BPartner_ID', '117'], ['C_BPartner_Location_ID', '112'], ['Bill_BPartner_ID', '117'], ['Bill_Location_ID', '112'],
  ['M_Warehouse_ID', '103'], ['M_PriceList_ID', '101'], ['C_Currency_ID', '100'], ['C_PaymentTerm_ID', '106'], ['PaymentRule', 'P'], ['InvoiceRule', 'I'], ['DeliveryRule', 'F'], ['DeliveryViaRule', 'P'], ['FreightCostRule', 'I'], ['PriorityRule', '5'], ['SalesRep_ID', '101']];
const LINE = (oid) => [['AD_Org_ID', '11'], ['C_Order_ID', String(oid)], ['Line', '10'], ['M_Product_ID', '134'], ['QtyEntered', '2'], ['QtyOrdered', '2'], ['C_UOM_ID', '100'], ['PriceEntered', '60'], ['PriceActual', '60'], ['PriceList', '60'], ['C_Tax_ID', '104']];
(async () => {
  const fx = sqliteInsertsFromPilot(900000, 900003); const fxFile = path.join(os.tmpdir(), 'ws_docaction_fixture.sql'); fs.writeFileSync(fxFile, fx.sql);
  console.log('§WSA fixture rows copied from the pilot=' + fx.n);
  const server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port, K = server.kernel;
  const oid = { pilot: null, twin: null }, oid2 = { pilot: null, twin: null };
  const slot = (s) => (s.o === 'b' ? oid2 : oid);
  const state = (side, id) => {
    const AGG = side === 'pilot' ? "string_agg(distinct docstatus,',')" : 'group_concat(distinct docstatus)';   // the documents the order produced
    if (!id) return null;
    const rows = (sql) => side === 'pilot' ? pg(sql) : K.q(sql.replace(/\bad_client_id=11\b/g, 'ad_client_id=11')).map(r => Object.values(r));
    const one = (sql) => rows(sql)[0] || [];
    const o = one('select docstatus, docaction, processed, posted, round(grandtotal,2), round(totallines,2), isdelivered, isinvoiced from c_order where c_order_id=' + id);
    const sh = one('select count(*), coalesce(' + AGG + ',\'\') from m_inout where c_order_id=' + id).join(',');
    const inv = one('select count(*), coalesce(' + AGG + ',\'\') from c_invoice where c_order_id=' + id).join(',');
    const facts = one('select count(*), round(coalesce(sum(amtacctdr),0),2), round(coalesce(sum(amtacctcr),0),2) from fact_acct where (ad_table_id=259 and record_id=' + id + ') or (ad_table_id=319 and record_id in (select m_inout_id from m_inout where c_order_id=' + id + ')) or (ad_table_id=318 and record_id in (select c_invoice_id from c_invoice where c_order_id=' + id + '))').map((v, k) => (k === 0 ? String(v) : Number(v).toFixed(2))).join(',');
    const f2 = (v) => (/^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v).toFixed(2) : String(v));
    return o.map(v => v == null ? '∅' : f2(v)).join('|') + ' | shipments=' + sh + ' | invoices=' + inv + ' | facts=' + facts;
  };
  const sqlLower = (s) => s;
  let judged = 0, failed = 0, actionsOk = 0;
  const STEPS = [
    { n: 'create_order', m: 'create_data', c: () => ({ type: 'Pilot_createData_C_Order', table: 'C_Order', action: 'Create', fields: HDR }), setId: 'a' },
    { n: 'complete_without_lines', m: 'set_docaction', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid[s], action: 'CO' }), st: 'a' },
    { n: 'create_line', m: 'create_data', c: (s) => ({ type: 'Pilot_createData_C_OrderLine', table: 'C_OrderLine', action: 'Create', fields: LINE(oid[s]) }), st: 'a' },
    { n: 'update_header', m: 'update_data', c: (s) => ({ type: 'Pilot_updateData_C_Order', table: 'C_Order', id: oid[s], action: 'Update', fields: [['Description', 'via web service']] }), st: 'a' },
    { n: 'docaction_invalid', m: 'set_docaction', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid[s], action: 'ZZ' }), st: 'a' },
    { n: 'docaction_missing_record', m: 'set_docaction', d: () => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: 99999999, action: 'CO' }) },
    { n: 'docaction_recordid0', m: 'set_docaction', d: () => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: 0, action: 'CO' }) },
    { n: 'docaction_unknown_table', m: 'set_docaction', d: () => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_NoSuchTable', id: 1, action: 'CO' }) },
    { n: 'complete_ok', m: 'set_docaction', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid[s], action: 'CO' }), st: 'a', ok: 1 },
    { n: 'update_completed_order', m: 'update_data', c: (s) => ({ type: 'Pilot_updateData_C_Order', table: 'C_Order', id: oid[s], action: 'Update', fields: [['Description', 'edit after complete']] }), st: 'a' },
    { n: 'complete_again', m: 'set_docaction', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid[s], action: 'CO' }), st: 'a' },
    { n: 'void_completed', m: 'set_docaction', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid[s], action: 'VO' }), st: 'a', ok: 1 },
    { n: 'create_order_norate', m: 'create_data', o: 'b', c: () => ({ type: 'Pilot_createData_C_Order', table: 'C_Order', action: 'Create', fields: HDR.map(([k, v]) => (k === 'C_Currency_ID' ? [k, '304'] : [k, v])) }), setId: 'b' },
    { n: 'create_line_norate', m: 'create_data', o: 'b', c: (s) => ({ type: 'Pilot_createData_C_OrderLine', table: 'C_OrderLine', action: 'Create', fields: LINE(oid2[s]) }), st: 'b' },
    { n: 'complete_no_currency_rate', m: 'set_docaction', o: 'b', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid2[s], action: 'CO' }), st: 'b', ok: 1 },
    { n: 'role_without_access', m: 'set_docaction', d: (s) => ({ type: 'Pilot_setDocAction_C_Order', table: 'C_Order', id: oid[s], action: 'CO' }), login: { roleId: 103 } },
  ];
  for (const s of STEPS) {
    const res = {};
    for (const side of ['pilot', 'twin']) {
      const body = s.m === 'set_docaction' ? docActionXml(s.d(side), s.login) : crud(s.c(side), s.login);
      const r = await post(side === 'pilot' ? PILOT : TWIN, s.m, body); const n = norm(r);
      if (s.setId && n.ok) { const m = /RecordID="(\d+)"/.exec(r.text); slot(s)[side] = m ? Number(m[1]) : null; }
      res[side] = { n, st: s.st ? state(side, slot(s)[side]) : null };
    }
    const idN = (side) => (JSON.stringify(res[side].n) + '§' + res[side].st).split(String(slot(s)[side])).join('#').replace(/Order Document No=\S+|DocumentNo[=:]\s*\S+/g, 'DocNo');
    const same = idN('pilot') === idN('twin'); judged++; if (!same) failed++; if (same && res.pilot.n.ok && s.ok) actionsOk++;
    console.log('§WSA ' + s.n + ' ' + (same ? 'MATCH' : 'DIFF') + ' ' + (same ? JSON.stringify(res.pilot.n).slice(0, 160) + (res.pilot.st ? ' ' + res.pilot.st : '') : '\n   legacy=' + JSON.stringify(res.pilot.n) + ' ' + res.pilot.st + '\n   twin  =' + JSON.stringify(res.twin.n) + ' ' + res.twin.st));
  }
  const verdict = actionsOk === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSA_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' successfulDocActionsCompared=' + actionsOk + ' journalEntries=' + K.journal.length);
  server.close(); process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSA ERROR ' + e.stack); process.exit(2); });
