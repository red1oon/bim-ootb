#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/pilot_progress.js (spec prompts/CAPEX_DASHBOARD.md §5.28, G8; owner "yes"). LOCAL PILOT ONLY, RUNS ONCE. READ THE LOG: §PILOT_PROGRESS lines; the exit code is not evidence.
// Real activity through iDempiere's stock web services, so the goals that never counted anything on the pilot get real rows: stock documents and the stock Close Project, no direct SQL write. A closed project and completed documents are NOT undone (snapshot first).
// Never touches #1000007 SHED or #1000010 HHS (W-G6A-HOME compares them to their folds). Prints every goal before / after by legacy's own measure SQL, and whether each expected tile moved.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/pilot_progress.js
'use strict';
const path = require('path'), ROOT = path.join(__dirname, '..', '..'), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
const { psqlRaw, pilotGoals, selects, parse } = require('./legacy_goal_sql.js');
const BASE = 'http://localhost:8088', REST = BASE + '/ADInterface/services/rest/model_adservice/', log = console.log;
const xmlLogin = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
const jsonLogin = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const TODAY = (() => { const d = new Date(), p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })(), TS = TODAY + ' 00:00:00';
const PRODUCT = 139, LOCATOR = 101, BP = 112, BP_LOC = 108, AR_INVOICE = 116, SALES_PL = 101;   // what the parallel run's own Issue to Project and AR invoice use (scripts/bridge witness_m3_gap.js, client_ctx.js)
const PROJECT_GREEN = 1000014, PROJECT_AMBER = 1000013, PROJECT_CLOSE = 1000011, PROJECT_COMMIT = 1000009, COMMIT_LINE = 1000088, NEW_VALUE = 'CAPEX_BDT_POC', BDT = 322, NEW_COMMITTED = '1000';
const GREEN_PHASES = [1000053, 1000054, 1000055, 1000056, 1000057], AMBER_PHASES = [1000052];

async function crud(method, spec) {
  const r = await fetch(REST + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: Push.buildCrudXml(xmlLogin, spec) });
  const s = Push.parseStandardResponse(await r.text());
  if (s.isError) throw new Error(spec.serviceType + ' refused: ' + s.error);
  return s;
}
const update = (serviceType, tableName, recordId, fields) => crud('update_data', { serviceType, tableName, action: 'Update', recordId, fields: Object.keys(fields).map(column => ({ column, val: String(fields[column]) })) });
const create = (serviceType, tableName, fields) => crud('create_data', { serviceType, tableName, action: 'Create', fields: Object.keys(fields).map(column => ({ column, val: String(fields[column]) })) });
async function post(method, key, body) {
  const r = await fetch(REST + method, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ [key]: Object.assign({}, body, { ADLoginRequest: jsonLogin }) }) });
  return JSON.parse(await r.text());
}
async function complete(serviceType, tableName, recordID) {
  const j = await post('set_docaction', 'ModelSetDocActionRequest', { ModelSetDocAction: { serviceType, tableName, recordID, docAction: 'CO' } }), s = j.StandardResponse || {};
  if (j.status === '500' || j.message || s['@IsError']) throw new Error(serviceType + ' refused: ' + (j.message || s.Error));
}
async function closeProject(id) {
  const j = await post('run_process', 'ModelRunProcessRequest', { ModelRunProcess: { serviceType: 'Capex_RunProcess_ProjectClose', AD_Record_ID: id, ParamValues: { field: [{ '@column': 'AD_Record_ID', val: String(id) }] } } }), r = j.RunProcessResponse || {};
  if (j.status === '500' || j.message || r['@IsError']) throw new Error('Close Project refused: ' + (j.message || r.Error));
}
const nextIssueLine = id => Number(psqlRaw('SELECT COALESCE(MAX(line),0)+10 FROM c_projectissue WHERE c_project_id=' + id + ';'));
async function issue(project, note) {
  const s = await create('BridgeCreateProjectIssue', 'C_ProjectIssue', { AD_Org_ID: 11, C_Project_ID: project, Line: nextIssueLine(project), M_Locator_ID: LOCATOR, MovementQty: 1, MovementDate: TS, M_Product_ID: PRODUCT, Description: note });
  await complete('BridgeCompleteProjectIssue', 'C_ProjectIssue', s.recordId);
  log('§PILOT_PROGRESS issue project=' + project + ' C_ProjectIssue=' + s.recordId + ' product=' + PRODUCT + ' qty=1 CO balance now=' + psqlRaw('SELECT projectbalanceamt FROM c_project WHERE c_project_id=' + project + ';'));
}
const snap = (goals, tag) => parse(psqlRaw(selects(goals, tag)))[tag];

(async () => {
  if (Number(psqlRaw("SELECT COUNT(*) FROM c_project WHERE value='" + NEW_VALUE + "';"))) { log('§PILOT_PROGRESS refused: ' + NEW_VALUE + ' exists: this already ran'); process.exit(2); }
  const goals = pilotGoals(), before = snap(goals, 'A');
  let step = 'phases green';
  try {
    for (const id of GREEN_PHASES) await update('BridgeUpdateCProjectPhase', 'C_ProjectPhase', id, { IsComplete: 'Y' });
    log('§PILOT_PROGRESS phases complete project=' + PROJECT_GREEN + ' ' + GREEN_PHASES.join(','));
    step = 'phases amber'; for (const id of AMBER_PHASES) await update('BridgeUpdateCProjectPhase', 'C_ProjectPhase', id, { IsComplete: 'Y' });
    log('§PILOT_PROGRESS phases complete project=' + PROJECT_AMBER + ' ' + AMBER_PHASES.join(','));
    step = 'issue amber'; await issue(PROJECT_AMBER, 'CAPEX G8: within budget, amber');
    step = 'close'; await update('CapexUpdateCProject', 'C_Project', PROJECT_CLOSE, { DateFinish: TS }); await closeProject(PROJECT_CLOSE);
    log('§PILOT_PROGRESS closed project=' + PROJECT_CLOSE + ' ' + psqlRaw('SELECT processed, datefinish::date FROM c_project WHERE c_project_id=' + PROJECT_CLOSE + ';'));
    step = 'commit usd'; const committed = psqlRaw('SELECT plannedamt FROM c_projectline WHERE c_projectline_id=' + COMMIT_LINE + ';');
    await update('CapexUpdateCProject', 'C_Project', PROJECT_COMMIT, { IsCommitment: 'Y' }); await update('CapexUpdateCProjectLine', 'C_ProjectLine', COMMIT_LINE, { CommittedAmt: committed });
    log('§PILOT_PROGRESS committed project=' + PROJECT_COMMIT + ' line=' + COMMIT_LINE + ' amt=' + committed + ' project now=' + psqlRaw('SELECT committedamt FROM c_project WHERE c_project_id=' + PROJECT_COMMIT + ';'));
    step = 'invoice'; const inv = await create('BridgeCreateInvoice', 'C_Invoice', { AD_Org_ID: 11, C_DocTypeTarget_ID: AR_INVOICE, C_BPartner_ID: BP, C_BPartner_Location_ID: BP_LOC, M_PriceList_ID: SALES_PL, IsSOTrx: 'Y', DateInvoiced: TS, DateAcct: TS, Description: 'CAPEX G8: invoiced on a project' });
    await update('CapexUpdateCInvoice', 'C_Invoice', inv.recordId, { C_Project_ID: PROJECT_COMMIT });
    await create('BridgeCreateInvoiceLine', 'C_InvoiceLine', { AD_Client_ID: 11, AD_Org_ID: 11, C_Invoice_ID: inv.recordId, Line: 10, M_Product_ID: PRODUCT, QtyEntered: 1, QtyInvoiced: 1 });
    await complete('BridgeCompleteInvoice', 'C_Invoice', inv.recordId);
    log('§PILOT_PROGRESS invoice C_Invoice=' + inv.recordId + ' ' + psqlRaw('SELECT documentno, docstatus, grandtotal FROM c_invoice WHERE c_invoice_id=' + inv.recordId + ';') + ' project invoiced=' + psqlRaw('SELECT invoicedamt FROM c_project WHERE c_project_id=' + PROJECT_COMMIT + ';'));
    step = 'new project'; const pr = await create('BridgeCreateCProject', 'C_Project', { Value: NEW_VALUE, Name: 'CAPEX test project in BDT', C_Currency_ID: BDT, IsCommitment: 'Y', ProjectLineLevel: 'P', ProjInvoiceRule: '-' });
    log('§PILOT_PROGRESS new project=' + pr.recordId + ' ' + NEW_VALUE);
    const ln = await create('BridgeCreateCProjectLine', 'C_ProjectLine', { C_Project_ID: pr.recordId, Line: 10, M_Product_ID: PRODUCT, PlannedQty: 1, PlannedPrice: 0, Description: 'CAPEX G8: committed, not planned' });
    await update('CapexUpdateCProjectLine', 'C_ProjectLine', ln.recordId, { CommittedAmt: NEW_COMMITTED });
    log('§PILOT_PROGRESS committed project=' + pr.recordId + ' line=' + ln.recordId + ' amt=' + NEW_COMMITTED + ' project now=' + psqlRaw('SELECT committedamt FROM c_project WHERE c_project_id=' + pr.recordId + ';'));
    step = 'issue bdt'; await issue(pr.recordId, 'CAPEX G8: actual cost in BDT');
  } catch (e) { log('§PILOT_PROGRESS STOPPED at step=' + step + ': ' + e.message); }
  const after = snap(goals, 'A');
  goals.forEach(g => log('  §PILOT_GOAL ' + g.name + ' ' + before[g.id] + ' -> ' + after[g.id] + (before[g.id] !== after[g.id] ? '  MOVED' : '')));
  const expected = ['CAPEX Closed Projects', 'CAPEX Projects Completed this Year', 'CAPEX Committed Cost (USD)', 'CAPEX Committed Cost (BDT)', 'CAPEX Invoiced (USD)', 'CAPEX Actual Cost (BDT)', 'CAPEX Budget Actual Overrun (BDT)', 'CAPEX Health Green', 'CAPEX Health Amber', 'CAPEX Schedule Delayed', 'CAPEX Budget Within'];
  const notMoved = expected.filter(n => { const g = goals.find(x => x.name === n); return !g || Number(after[g.id]) === 0; });
  log('§PILOT_PROGRESS_VERDICT ' + (notMoved.length ? 'INCOMPLETE still 0: ' + notMoved.join(', ') : 'all ' + expected.length + ' expected goals now count something') + ' active=' + after[goals.find(g => g.name === 'CAPEX Active Projects').id]);
  process.exit(notMoved.length ? 1 : 0);
})().catch(e => { log('§PILOT_PROGRESS harness ' + (e && e.stack || e)); process.exit(1); });
