#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/film_progress.js (spec prompts/CAPEX_DASHBOARD.md §5.37 "progress script for the fresh order"). TEST INSTANCE ONLY (~/idempiere-bimdoc, DB idempiere_bimdoc, :8108), RUNS ONCE. READ THE LOG: §FILM_PROGRESS lines.
// Real documents through iDempiere's own web services (no SQL write): the first N phases of the pushed order are marked complete (BridgeUpdateCProjectPhase) and M stock Project Issues are created and completed
// (BridgeCreateProjectIssue / BridgeCompleteProjectIssue, product 139 at locator 101, as pilot_progress.js). Prints the project's phases and balance before/after; refuses a second run (project already has an issue).
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_progress.js <projectValue> <phases: names ';'-joined, or a count> <issues: productxQty ','-joined, or a count> [po: productxQty@price ',' joined]
// A completed purchase order on the project (BridgeCreateOrder + Pilot_updateData_C_Order C_Project_ID + BridgeCreateOrderLine + BridgeDocActionCOrder) gives the Contract tile real rows.
'use strict';
const path = require('path'), { execFileSync } = require('child_process'), Push = require(path.join(__dirname, '..', '..', 'viewer', 'erp_rest_push.js'));
const BASE = 'http://localhost:8108', REST = BASE + '/ADInterface/services/rest/model_adservice/', log = console.log, DB = 'idempiere_bimdoc';
const psql = s => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + s }).toString().trim();
const xmlLogin = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 }, jsonLogin = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const [value, phArg = '3', isArg = '2', poArg = ''] = process.argv.slice(2), PRODUCT = 139, LOCATOR = 101, TS = new Date().toISOString().slice(0, 10) + ' 00:00:00';
async function crud(method, spec) { const r = await fetch(REST + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: Push.buildCrudXml(xmlLogin, spec) }); const s = Push.parseStandardResponse(await r.text()); if (s.isError) throw new Error(spec.serviceType + ' refused: ' + s.error); return s; }
const fields = f => Object.keys(f).map(column => ({ column, val: String(f[column]) }));
async function complete(serviceType, tableName, recordID) {
  const r = await fetch(REST + 'set_docaction', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ModelSetDocActionRequest: { ModelSetDocAction: { serviceType, tableName, recordID, docAction: 'CO' }, ADLoginRequest: jsonLogin } }) });
  const j = JSON.parse(await r.text()), s = j.StandardResponse || {}; if (j.status === '500' || j.message || s['@IsError']) throw new Error(serviceType + ' refused: ' + (j.message || s.Error));
}
(async () => {
  if (!value) { log('§FILM_PROGRESS usage: film_progress.js <projectValue>'); process.exit(2); }
  const pid = Number(psql("SELECT COALESCE(MAX(c_project_id),0) FROM c_project WHERE value='" + value + "'"));
  if (!pid) { log('§FILM_PROGRESS refused: no project ' + value); process.exit(2); }
  if (!(phArg === '0' && isArg === '0') && Number(psql('SELECT COUNT(*) FROM c_projectissue WHERE c_project_id=' + pid))) { log('§FILM_PROGRESS refused: project ' + pid + ' already has issues: this already ran'); process.exit(2); }
  const phases = psql("SELECT c_projectphase_id||'|'||seqno||'|'||name||'|'||plannedamt FROM c_projectphase WHERE c_project_id=" + pid + ' ORDER BY seqno, c_projectphase_id').split('\n');
  log('§FILM_PROGRESS project=' + value + ' #' + pid + ' phases=' + phases.length + ' balance before=' + psql('SELECT projectbalanceamt FROM c_project WHERE c_project_id=' + pid));
  let step = 'phases';
  try {
    const byName = /^\d+$/.test(phArg) ? phases.slice(0, Number(phArg)) : phArg.split(';').map(n => phases.find(x => x.split('|')[2] === n)).filter(Boolean);
    for (const p of byName) { const [id, , name, amt] = p.split('|'); await crud('update_data', { serviceType: 'BridgeUpdateCProjectPhase', tableName: 'C_ProjectPhase', action: 'Update', recordId: Number(id), fields: fields({ IsComplete: 'Y' }) }); log('§FILM_PROGRESS phase complete id=' + id + ' name=' + name + ' plannedamt=' + amt); }
    const issues = /^\d+$/.test(isArg) ? Array.from({ length: Number(isArg) }, () => [PRODUCT, 1]) : isArg.split(',').filter(Boolean).map(x => x.split('x').map(Number));
    for (let i = 1; i <= issues.length; i++) {
      step = 'issue ' + i; const [prod, qty] = issues[i - 1];
      const line = Number(psql('SELECT COALESCE(MAX(line),0)+10 FROM c_projectissue WHERE c_project_id=' + pid));
      const s = await crud('create_data', { serviceType: 'BridgeCreateProjectIssue', tableName: 'C_ProjectIssue', action: 'Create', fields: fields({ AD_Org_ID: 11, C_Project_ID: pid, Line: line, M_Locator_ID: LOCATOR, MovementQty: qty, MovementDate: TS, M_Product_ID: prod, Description: 'sequel film: material issued to the project' }) });
      await complete('BridgeCompleteProjectIssue', 'C_ProjectIssue', s.recordId);
      log('§FILM_PROGRESS issue C_ProjectIssue=' + s.recordId + ' product=' + prod + ' qty=' + qty + ' CO, balance now=' + psql('SELECT projectbalanceamt FROM c_project WHERE c_project_id=' + pid));
    }
    for (const one of poArg.split(',').filter(Boolean)) {   // ','-joined purchase orders; a 'd:' prefix leaves that one a DRAFT (an open order), without it the order is completed
      step = 'purchase order'; const draft = /^d:/.test(one), [pl, pr] = one.replace(/^d:/, '').split('@'), [prod, qty] = pl.split('x').map(Number), price = Number(pr);
      const o = await crud('create_data', { serviceType: 'BridgeCreateOrder', tableName: 'C_Order', action: 'Create', fields: fields({ C_DocTypeTarget_ID: 126, C_BPartner_ID: 120, C_BPartner_Location_ID: 114, Bill_BPartner_ID: 120, Bill_Location_ID: 114, M_PriceList_ID: 102, M_Warehouse_ID: 103, DateOrdered: TS, DateAcct: TS }) });
      await crud('update_data', { serviceType: 'Pilot_updateData_C_Order', tableName: 'C_Order', action: 'Update', recordId: o.recordId, fields: fields({ C_Project_ID: pid, IsSOTrx: 'N' }) });
      await crud('create_data', { serviceType: 'BridgeCreateOrderLine', tableName: 'C_OrderLine', action: 'Create', fields: fields({ AD_Client_ID: 11, AD_Org_ID: 11, C_Order_ID: o.recordId, C_Tax_ID: 106, Line: 10, M_Product_ID: prod, PriceActual: price, PriceEntered: price, QtyEntered: qty, QtyOrdered: qty }) });
      if (!draft) await complete('BridgeDocActionCOrder', 'C_Order', o.recordId);
      log('§FILM_PROGRESS purchase order C_Order=' + o.recordId + ' product=' + prod + ' qty=' + qty + ' price=' + price + ' ' + psql('SELECT docstatus||\' grandtotal=\'||grandtotal||\' project=\'||c_project_id FROM c_order WHERE c_order_id=' + o.recordId));
    }
  } catch (e) { log('§FILM_PROGRESS STOPPED at step=' + step + ': ' + e.message); process.exit(1); }
  const byNameCount = /^\d+$/.test(phArg) ? Number(phArg) : phArg.split(';').length, issuesCount = /^\d+$/.test(isArg) ? Number(isArg) : isArg.split(',').filter(Boolean).length;
  const ph = Number(psql('SELECT COUNT(*) FROM c_projectphase WHERE c_project_id=' + pid + " AND iscomplete='Y'")), is = Number(psql('SELECT COUNT(*) FROM c_projectissue WHERE c_project_id=' + pid + " AND processed='Y'"));
  log('§FILM_PROGRESS_VERDICT ' + (ph === byNameCount && is === issuesCount ? 'PASS' : 'FAIL') + ' phases complete=' + ph + ' issues processed=' + is + ' balance=' + psql('SELECT projectbalanceamt FROM c_project WHERE c_project_id=' + pid));
})().catch(e => { log('§FILM_PROGRESS harness ' + (e && e.stack || e)); process.exit(1); });
