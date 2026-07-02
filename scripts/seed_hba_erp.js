/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — seed_hba_erp.js — W-HBA-ERP-SEED reproducible seed + self-witness.
//
// Implementing bim-compiler prompts/RESUME_HBA_ERP_GOVERNED_DISPLAY.md §STAGED-PLAN **Stage 1** — the
// ERP-governed-display convention ("all data must exist in iDempiere ... any info panel in BIM has to be just
// a lens from such source", user 2026-07-03). SCOPE = seed data + Ninja dictionary ONLY; the compile-layer
// rewrite that READS these rows is Stage 2 (do not add it here). Read the log after every run.
//
//   1. M_Warehouse row for HHS — Q1 resolved: durable pinned Value='HHS_Office_Federated' (matches
//      toWarehouseRow's value:buildingName convention; never re-derived from a live extraction).
//   2. M_Locator per REAL HHS room (fixtures/hhs_rooms.json, extracted from
//      buildings/HHS_Office_Federated_extracted.db) — X/Y/Z carry the room's real center. The guid→id map is
//      PERSISTED to hr_bim_asset/fixtures/hhs_room_locators.json (§FILES-TOUCHED: "a parallel per-room
//      m_locator_id persisted from Stage 1, not regenerated per session").
//   3. C_BPartner 1001/1002 + AD_User 1/2 for EMP001/EMP002 ONLY — Q2 resolved: the SAME two identities
//      ad_payroll.js demoSpec()/models.js Official already carry (ids/emails/phones REUSED verbatim, so the
//      Stage-2 compile-layer swap is display-identical). CONTOH/SAMPLE demo people, watermark-style noted in
//      Description — real rows, honest demo provenance.
//   4. HR_* physical tables (HR_Employee had ZERO rows anywhere — §EVIDENCE pt 1) + rows: concept categories/
//      concepts EXTRACTED from ad_payroll.js CATEGORIES/CONCEPTS at run time (never re-typed), one HR_Payroll,
//      the 2026-06 HR_Period, and the HR_Process + 7 HR_Movement rows produced by RUNNING the real engine
//      (AdPayroll.runPeriod(demoSpec())) — the payslip numbers land in the DB from the SAME code path the
//      witnesses already accept (EMP001 gross=5200/net=4234), zero hand-arithmetic.
//   5. Ninja-stage C_Attendance via the REAL NinjaStage.stageModels bootstrap (same sequence as
//      scripts/poc_ninja_callout.js / poc_asset_status.js in bim-compiler) — AD_Table/AD_Column/AD_Tab/
//      AD_Field/AD_Window/AD_Menu rows at the deterministic NINJA_BASE=7,000,000 ids (verified free here).
//      Name kept `C_Attendance` per the user's explicit direction (§DESIGN-ATTENDANCE naming note).
//   6. ad_infowindow/ad_infocolumn physical tables (REAL native lens mechanism, previously absent from
//      ad_seed.db) + the Attendance lens row — fromclause = §DESIGN-ATTENDANCE's exact JOIN. InfoWindow ids
//      use NINJA_BASE+600000 (the next free 100000-block after stageModels' own +500000 cols block), so the
//      standard Ninja rollback idiom (IsActive='N' WHERE id>=NINJA_BASE) covers them symmetrically.
//   7. C_Attendance rows folded from attendance.js's OWN demoSeed sessions for period 2026-06 (post
//      §Q-RESOLUTION re-scope: EMP001/EMP002 only) — employee resolved to the REAL C_BPartner_ID, zone guid
//      resolved to the REAL M_Locator_ID, open sessions keep CheckOutTime/Qty NULL (no fabricated finish).
//   8. SELF-WITNESS (W-HBA-ERP-SEED): runs the §DESIGN-ATTENDANCE InfoWindow JOIN live and asserts NO row is
//      lost (every FK resolves through HR_Process→C_BPartner→M_Locator→M_Warehouse), the warehouse is the
//      pinned HHS row, and the DB-summed payslip == the engine's payslip. This NAMES the issue it proves:
//      pane data CAN be derived from a real queryable AD relational chain (§CONVENTION), not a JS literal.
//
// IDEMPOTENT: find-or-create everywhere (a 2nd run adds 0 rows — §-log says so). Deterministic: pinned ids,
// fixed NOW timestamp, no Date.now/random. EXTRACT-only: every schema below was dumped live from
// bim-compiler build/erp/ad_full.db PRAGMA table_info (2026-07-03); every value traces to an existing module,
// fixture, or proto row (§-log cites which).
//
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node scripts/seed_hba_erp.js   (writes erp/ad_seed.db in place)

'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const SEED = path.join(ROOT, 'erp', 'ad_seed.db');
const LOC_FIXTURE = path.join(ROOT, 'hr_bim_asset', 'fixtures', 'hhs_room_locators.json');

const NinjaModel = require(path.join(ROOT, 'erp', 'ninja_model.js'));
const NinjaStage = require(path.join(ROOT, 'erp', 'ninja_stage.js'));
const AdPayroll = require(path.join(ROOT, 'hr_bim_asset', 'ad_payroll.js'));
const Attendance = require(path.join(ROOT, 'hr_bim_asset', 'attendance.js'));
const ROOMS_FX = require(path.join(ROOT, 'hr_bim_asset', 'fixtures', 'hhs_rooms.json'));

const NOW = '2026-07-03 00:00:00';           // fixed seed timestamp (house style: seed_fin_uom.js)
const BIM_BASE = 990000;                      // BIM-added master-row id floor (house style: seed_fin_*.js)
const PERIOD = '2026-06';                     // ad_payroll.demoSpec()'s own period — reused, not re-chosen
const HHS_VALUE = 'HHS_Office_Federated';     // Q1: durable Value, pinned ONCE (== the building/source name)
const INFO_BASE = NinjaStage.NINJA_BASE + 600000;  // next free ninja 100000-block (cols end at +500000)

function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
function rows(db, sql, p) {
  var r = db.exec(sql, p || []); if (!r.length) return [];
  var cs = r[0].columns;
  return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}
// insert helper — obj keys are column names; find-or-skip is the CALLER's job.
function ins(db, table, obj) {
  var ks = Object.keys(obj);
  db.run('INSERT INTO ' + table + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')',
    ks.map(function (k) { return obj[k]; }));
}
function std(id) { return { AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y', Created: NOW, CreatedBy: 100, Updated: NOW, UpdatedBy: 100 }; }

// CREATE TABLE from a REAL column list (dumped from ad_full.db PRAGMA table_info, 2026-07-03) — SQLite typing
// heuristic mirrors ad_seed.db's own convention (M_Warehouse PRAGMA: *_id/By NUMERIC, rest TEXT).
function createTable(db, name, cols) {
  if (db.exec("SELECT name FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + name + "')").length) return false;
  var defs = cols.map(function (c) {
    var num = /(_id|by|amount|qty|seqno|periodno|pagingsize|maxqueryrecords)$/i.test(c) ? ' NUMERIC' : ' TEXT';
    return c + num;
  });
  db.run('CREATE TABLE ' + name + ' (' + defs.join(', ') + ')');
  return true;
}

// REAL iDempiere column lists — live PRAGMA table_info dumps from bim-compiler build/erp/ad_full.db (2026-07-03).
const DDL = {
  HR_Employee: ['hr_employee_id', 'code', 'name', 'name2', 'c_bpartner_id', 'hr_department_id', 'hr_job_id',
    'hr_payroll_id', 'c_activity_id', 'startdate', 'enddate', 'nationalcode', 'sscode', 'imageurl',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_employee_uu'],
  HR_Concept_Category: ['hr_concept_category_id', 'value', 'name', 'description', 'hr_concept_acct', 'isdefault',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_concept_category_uu'],
  HR_Concept: ['hr_concept_id', 'value', 'name', 'description', 'hr_concept_category_id', 'accountsign', 'type',
    'columntype', 'hr_department_id', 'hr_job_id', 'hr_payroll_id', 'isemployee', 'ispaid', 'isprinted',
    'isreceipt', 'isreadwrite', 'isregistered', 'isdefault', 'validfrom', 'validto', 'ad_reference_id', 'seqno',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_concept_uu'],
  HR_Payroll: ['hr_payroll_id', 'value', 'name', 'description', 'hr_contract_id', 'paymentrule',
    'ad_printformat_id', 'c_charge_id', 'processed', 'processing',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_payroll_uu'],
  HR_Period: ['hr_period_id', 'name', 'description', 'hr_payroll_id', 'hr_year_id', 'c_period_id', 'c_year_id',
    'periodno', 'periodaction', 'periodstatus', 'startdate', 'enddate', 'dateacct', 'processed', 'processing',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_period_uu'],
  HR_Process: ['hr_process_id', 'name', 'documentno', 'hr_payroll_id', 'hr_period_id', 'hr_employee_id',
    'hr_department_id', 'hr_job_id', 'c_bpartner_id', 'c_doctype_id', 'c_doctypetarget_id', 'c_payselection_id',
    'c_charge_id', 'ad_printformat_id', 'ad_workflow_id', 'columnsql', 'dateacct', 'docstatus', 'docaction',
    'posted', 'processed', 'processing', 'processedon', 'reversal_id',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_process_uu'],
  HR_Movement: ['hr_movement_id', 'hr_process_id', 'c_bpartner_id', 'hr_concept_id', 'hr_concept_category_id',
    'hr_department_id', 'hr_job_id', 'amount', 'qty', 'servicedate', 'accountsign', 'columntype', 'description',
    'textmsg', 'validfrom', 'validto', 'isprinted', 'isregistered', 'processed', 'ad_rule_id', 'c_activity_id',
    'c_campaign_id', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'ad_orgtrx_id', 'user1_id',
    'user2_id', 'pp_cost_collector_id', 'c_bp_group_id', 'c_bp_bankaccount_id',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'hr_movement_uu'],
  // §DESIGN-ATTENDANCE child table — columns == exactly what stageModels stages (standard set + 8 user cols).
  C_Attendance: ['C_Attendance_ID', 'C_Attendance_UU', 'AD_Client_ID', 'AD_Org_ID', 'IsActive', 'Created',
    'CreatedBy', 'Updated', 'UpdatedBy', 'HR_Process_ID', 'C_BPartner_ID', 'M_Locator_ID', 'ServiceDate',
    'CheckInTime', 'CheckOutTime', 'Qty', 'Description'],
  ad_infowindow: ['ad_infowindow_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
    'updated', 'updatedby', 'name', 'description', 'help', 'ad_table_id', 'entitytype', 'fromclause',
    'otherclause', 'processing', 'ad_infowindow_uu', 'whereclause', 'isdefault', 'isdistinct', 'orderbyclause',
    'isvalid', 'ad_ctxhelp_id', 'imageurl', 'seqno', 'isshowindashboard', 'ad_process_id', 'maxqueryrecords',
    'isloadpagenum', 'pagingsize', 'ad_window_id', 'po_window_id'],
  ad_infocolumn: ['ad_infocolumn_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
    'updated', 'updatedby', 'name', 'description', 'help', 'ad_infowindow_id', 'entitytype', 'selectclause',
    'seqno', 'isdisplayed', 'isquerycriteria', 'ad_element_id', 'ad_reference_id', 'ad_infocolumn_uu',
    'ad_reference_value_id', 'ad_val_rule_id', 'iscentrallymaintained', 'displaylogic', 'columnname',
    'queryoperator', 'queryfunction', 'isidentifier', 'seqnoselection', 'defaultvalue', 'ismandatory', 'iskey',
    'isreadonly', 'placeholder', 'inputfieldvalidation', 'ad_fieldstyle_id', 'isautocomplete',
    'isqueryafterchange', 'isrange', 'defaultvalue2', 'placeholder2']
};

(async function () {
  var fails = 0;
  function L(m) { console.log(m); }
  function must(tag, cond, msg) { L('§W-HBA-ERP-SEED ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); if (!cond) fails++; }

  if (!fs.existsSync(SEED)) { L('§SEED_HBA FAIL — erp/ad_seed.db not found at ' + SEED); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));
  var added = { warehouse: 0, locators: 0, bpartners: 0, users: 0, tables: 0, hr_rows: 0, ninja: null, info: 0, attendance: 0 };

  // ── 1. M_Warehouse — Q1 pinned durable Value; proto = the seed's own HQ row (client 11 / org 11) ─────────
  var whId = scalar(db, 'SELECT M_Warehouse_ID FROM M_Warehouse WHERE Value=?', [HHS_VALUE]);
  if (whId == null) {
    whId = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(M_Warehouse_ID),0) FROM M_Warehouse')), BIM_BASE - 1) + 1;
    ins(db, 'M_Warehouse', { M_Warehouse_ID: whId, AD_Client_ID: 11, AD_Org_ID: 11, IsActive: 'Y',
      Created: NOW, CreatedBy: 100, Updated: NOW, UpdatedBy: 100, Value: HHS_VALUE, Name: HHS_VALUE,
      Description: 'HHS pilot building (real BIM binding — RESUME_HBA_ERP_GOVERNED_DISPLAY.md Stage 1)',
      IsInTransit: 'N', M_Warehouse_UU: 'hba-wh-hhs' });
    added.warehouse++;
    L('§SEED_HBA_WH ADD id=' + whId + ' Value=' + HHS_VALUE + ' (client 11/org 11 per HQ proto row)');
  } else L('§SEED_HBA_WH SKIP exists id=' + whId);

  // ── 2. M_Locator per REAL HHS room — X/Y/Z = the room's real center; Value = the room guid ──────────────
  var locByGuid = {};
  ROOMS_FX.rooms.forEach(function (r) {
    var id = scalar(db, 'SELECT M_Locator_ID FROM M_Locator WHERE M_Warehouse_ID=? AND Value=?', [whId, r.guid]);
    if (id == null) {
      id = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(M_Locator_ID),0) FROM M_Locator')), BIM_BASE - 1) + 1;
      ins(db, 'M_Locator', { M_Locator_ID: id, AD_Client_ID: 11, AD_Org_ID: 11, IsActive: 'Y',
        Created: NOW, CreatedBy: 100, Updated: NOW, UpdatedBy: 100, Value: r.guid, M_Warehouse_ID: whId,
        PriorityNo: 50, IsDefault: 'N', X: String(r.center[0]), Y: String(r.center[1]), Z: String(r.center[2]),
        M_Locator_UU: 'hba-loc-' + r.guid.toLowerCase() });
      added.locators++;
    }
    locByGuid[r.guid] = id;
  });
  L('§SEED_HBA_LOC rooms=' + ROOMS_FX.rooms.length + ' added=' + added.locators + ' (X/Y/Z = real room centers from hhs_rooms.json)');

  // persist the guid→locator map (deterministic; Stage 2 reads this instead of re-minting per session)
  var locFx = { _provenance: { source: 'scripts/seed_hba_erp.js over erp/ad_seed.db + fixtures/hhs_rooms.json',
      note: 'REAL M_Locator ids seeded in ad_seed.db — Stage 1 of RESUME_HBA_ERP_GOVERNED_DISPLAY.md; do not regenerate per session' },
    m_warehouse_id: whId, warehouse_value: HHS_VALUE, locators: locByGuid };
  var locNew = JSON.stringify(locFx, null, 2) + '\n';
  if (!fs.existsSync(LOC_FIXTURE) || fs.readFileSync(LOC_FIXTURE, 'utf8') !== locNew) {
    fs.writeFileSync(LOC_FIXTURE, locNew);
    L('§SEED_HBA_LOC_FIXTURE wrote ' + path.relative(ROOT, LOC_FIXTURE));
  } else L('§SEED_HBA_LOC_FIXTURE unchanged');

  // ── 3. C_BPartner 1001/1002 + AD_User 1/2 — Q2: the SAME EMP001/EMP002 the fixtures already carry ───────
  // ids/emails/phones reused VERBATIM from ad_payroll.js demoSpec() (c_bpartner_id 1001/1002) and models.js
  // Official.records (ad_user_id 1/2, emp00N@contoh.my, +60 12-345 600N) — verified free in this seed.
  // C_BP_Group_ID=105 mirrors the seed's own IsEmployee='Y' proto rows (GardenUser 119 / GardenAdmin 113).
  var PEOPLE = [
    { bp: 1001, user: 1, name: 'EMP001', email: 'emp001@contoh.my', phone: '+60 12-345 6001' },
    { bp: 1002, user: 2, name: 'EMP002', email: 'emp002@contoh.my', phone: '+60 12-345 6002' }
  ];
  PEOPLE.forEach(function (p) {
    if (scalar(db, 'SELECT C_BPartner_ID FROM C_BPartner WHERE C_BPartner_ID=?', [p.bp]) == null) {
      ins(db, 'C_BPartner', { C_BPartner_ID: p.bp, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y',
        Created: NOW, CreatedBy: 100, Updated: NOW, UpdatedBy: 100, Value: p.name, Name: p.name,
        Description: 'CONTOH/SAMPLE demo employee (HHS pilot) — real row, demo identity',
        IsSummary: 'N', C_BP_Group_ID: 105, IsEmployee: 'Y', IsVendor: 'N', IsCustomer: 'N', IsSalesRep: 'N',
        C_BPartner_UU: 'hba-bp-' + p.name.toLowerCase() });
      added.bpartners++;
      L('§SEED_HBA_BP ADD C_BPartner ' + p.bp + ' ' + p.name + ' IsEmployee=Y group=105');
    } else L('§SEED_HBA_BP SKIP C_BPartner ' + p.bp + ' exists');
    if (scalar(db, 'SELECT AD_User_ID FROM AD_User WHERE AD_User_ID=?', [p.user]) == null) {
      ins(db, 'AD_User', { AD_User_ID: p.user, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y',
        Created: NOW, CreatedBy: 100, Updated: NOW, UpdatedBy: 100, Name: p.name, EMail: p.email,
        Phone: p.phone, C_BPartner_ID: p.bp, IsInPayroll: 'Y', Value: p.name,
        Description: 'CONTOH/SAMPLE demo employee contact (models.js Official parity)',
        AD_User_UU: 'hba-user-' + p.name.toLowerCase() });
      added.users++;
      L('§SEED_HBA_USER ADD AD_User ' + p.user + ' ' + p.name + ' → C_BPartner ' + p.bp);
    } else L('§SEED_HBA_USER SKIP AD_User ' + p.user + ' exists');
  });

  // ── 4. HR physical tables + rows — the engine's own numbers, landed in real tables ──────────────────────
  ['HR_Employee', 'HR_Concept_Category', 'HR_Concept', 'HR_Payroll', 'HR_Period', 'HR_Process', 'HR_Movement']
    .forEach(function (t) { if (createTable(db, t, DDL[t])) { added.tables++; L('§SEED_HBA_DDL CREATE ' + t + ' (' + DDL[t].length + ' real cols per ad_full.db PRAGMA)'); } });

  function hrIns(tag, table, idCol, id, obj) {
    if (scalar(db, 'SELECT ' + idCol + ' FROM ' + table + ' WHERE ' + idCol + '=?', [id]) != null) return false;
    obj[idCol.toLowerCase()] = id;
    obj.ad_client_id = 11; obj.ad_org_id = 0; obj.isactive = 'Y';
    obj.created = NOW; obj.createdby = 100; obj.updated = NOW; obj.updatedby = 100;
    ins(db, table, obj); added.hr_rows++;
    L('§SEED_HBA_HR ADD ' + tag + ' id=' + id);
    return true;
  }

  Object.keys(AdPayroll.CATEGORIES).forEach(function (k) {
    var c = AdPayroll.CATEGORIES[k];
    hrIns('HR_Concept_Category:' + c.value, 'HR_Concept_Category', 'hr_concept_category_id', c.hr_concept_category_id,
      { value: c.value, name: c.name, hr_concept_category_uu: 'hba-hrcc-' + c.value.toLowerCase() });
  });
  Object.keys(AdPayroll.CONCEPTS).forEach(function (k) {
    var c = AdPayroll.CONCEPTS[k];
    hrIns('HR_Concept:' + c.value, 'HR_Concept', 'hr_concept_id', c.hr_concept_id,
      { value: c.value, name: c.name, hr_concept_category_id: c.hr_concept_category_id, accountsign: c.accountsign,
        type: c.type, columntype: c.columntype, isemployee: 'Y', ispaid: 'Y',
        hr_concept_uu: 'hba-hrc-' + c.value.toLowerCase() });
  });

  var spec = AdPayroll.demoSpec();
  var run = AdPayroll.runPeriod(spec);                            // the REAL engine run — numbers extracted, not typed
  hrIns('HR_Payroll:HHS_PAYROLL', 'HR_Payroll', 'hr_payroll_id', run.hr_process.hr_payroll_id,
    { value: 'HHS_PAYROLL', name: 'HHS Payroll (demo)', processed: 'N',
      description: 'CONTOH/SAMPLE demo payroll definition (HHS pilot)', hr_payroll_uu: 'hba-hrp-hhs' });
  hrIns('HR_Period:' + PERIOD, 'HR_Period', 'hr_period_id', 1,
    { name: PERIOD, hr_payroll_id: run.hr_process.hr_payroll_id, periodno: 6, periodstatus: 'O',
      startdate: PERIOD + '-01', enddate: PERIOD + '-30', dateacct: PERIOD + '-30', processed: 'N',
      hr_period_uu: 'hba-hrper-' + PERIOD });
  hrIns('HR_Process:' + run.hr_process.documentno, 'HR_Process', 'hr_process_id', run.hr_process.hr_process_id,
    { name: run.hr_process.documentno, documentno: run.hr_process.documentno,
      hr_payroll_id: run.hr_process.hr_payroll_id, hr_period_id: 1, dateacct: run.hr_process.dateacct,
      docstatus: run.hr_process.docstatus, docaction: run.hr_process.docaction, posted: run.hr_process.posted,
      processed: run.hr_process.processed, hr_process_uu: 'hba-hrproc-' + PERIOD });
  run.hr_movement.forEach(function (m) {
    hrIns('HR_Movement:' + m.hr_movement_id, 'HR_Movement', 'hr_movement_id', m.hr_movement_id,
      { hr_process_id: m.hr_process_id, c_bpartner_id: m.c_bpartner_id, hr_concept_id: m.hr_concept_id,
        hr_concept_category_id: m.hr_concept_category_id, amount: m.amount, qty: m.qty,
        servicedate: m.servicedate, accountsign: m.accountsign, description: m.description, processed: 'Y',
        hr_movement_uu: 'hba-hrm-' + m.hr_movement_id });
  });
  spec.employees.forEach(function (e, i) {
    hrIns('HR_Employee:' + e.name, 'HR_Employee', 'hr_employee_id', i + 1,
      { code: e.name, name: e.name, c_bpartner_id: e.c_bpartner_id, hr_payroll_id: run.hr_process.hr_payroll_id,
        hr_employee_uu: 'hba-hremp-' + e.name.toLowerCase() });
  });

  // ── 5. Ninja-stage C_Attendance — the REAL bootstrap (same sequence as poc_ninja_callout.js §3) ─────────
  // romo sheet grammar: bare *_ID → TableDir; *Date → Date; *Time → DateTime; Qty → Quantity (ninja_model.js
  // parseColDef, ported verbatim from NinjaProcessor.java). Standard cols are auto-added by buildTable.
  var sheetRows = [
    ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'],
    ['HBA Attendance', '1', 'N', 'N', '', 'C_Attendance',
     'ERP-governed attendance child table (HHS pilot) — RESUME_HBA_ERP_GOVERNED_DISPLAY.md §DESIGN-ATTENDANCE',
     'HR_Process_ID,C_BPartner_ID,M_Locator_ID,ServiceDate,CheckInTime,CheckOutTime,Qty,Description']
  ];
  var model = NinjaModel.parseSheet(sheetRows, { format: 'romo' });
  added.ninja = NinjaStage.stageModels(db, model, 0);
  L('§SEED_HBA_NINJA staged tables=' + added.ninja.tables + ' cols=' + added.ninja.cols + ' windows=' + added.ninja.windows
    + ' tabs=' + added.ninja.tabs + ' fields=' + added.ninja.fields + ' menus=' + added.ninja.menus + ' skipped=' + added.ninja.skipped
    + ' (re-run reactivates, adds 0)');
  var attTableId = scalar(db, "SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Attendance'");
  must('NINJA-DICT', attTableId != null && Number(attTableId) >= NinjaStage.NINJA_BASE,
    'C_Attendance staged in AD_Table at deterministic ninja id — got ' + attTableId);

  // ── 6. Physical C_Attendance + ad_infowindow/ad_infocolumn + the lens rows ───────────────────────────────
  ['C_Attendance', 'ad_infowindow', 'ad_infocolumn'].forEach(function (t) {
    if (createTable(db, t, DDL[t])) { added.tables++; L('§SEED_HBA_DDL CREATE ' + t); }
  });

  // §DESIGN-ATTENDANCE's EXACT lens JOIN — who / where(building+room) / when / period.
  var FROM = 'C_Attendance ATT JOIN HR_Process P ON ATT.HR_Process_ID=P.HR_Process_ID'
    + ' JOIN C_BPartner BP ON ATT.C_BPartner_ID=BP.C_BPartner_ID'
    + ' JOIN M_Locator L ON ATT.M_Locator_ID=L.M_Locator_ID'
    + ' JOIN M_Warehouse W ON L.M_Warehouse_ID=W.M_Warehouse_ID';
  if (scalar(db, 'SELECT ad_infowindow_id FROM ad_infowindow WHERE ad_infowindow_id=?', [INFO_BASE]) == null) {
    ins(db, 'ad_infowindow', Object.assign({ ad_infowindow_id: INFO_BASE, ad_client_id: 11, ad_org_id: 0,
      isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100,
      name: 'HHS Attendance', description: 'Attendance lens — who/where/when over the real AD chain (Stage 1)',
      ad_table_id: attTableId, entitytype: 'U', fromclause: FROM, orderbyclause: 'ATT.CheckInTime',
      isvalid: 'Y', isdefault: 'N', isdistinct: 'N', seqno: 10, ad_infowindow_uu: 'hba-infowin-attendance' }));
    added.info++;
    L('§SEED_HBA_INFOWIN ADD id=' + INFO_BASE + ' fromclause per §DESIGN-ATTENDANCE');
  } else L('§SEED_HBA_INFOWIN SKIP exists id=' + INFO_BASE);
  var INFO_COLS = [
    { name: 'Who', sel: 'BP.Name', col: 'Name' },
    { name: 'Building', sel: 'W.Name', col: 'WarehouseName' },
    { name: 'Room', sel: 'L.Value', col: 'LocatorValue' },
    { name: 'Date', sel: 'ATT.ServiceDate', col: 'ServiceDate' },
    { name: 'Check In', sel: 'ATT.CheckInTime', col: 'CheckInTime' },
    { name: 'Check Out', sel: 'ATT.CheckOutTime', col: 'CheckOutTime' },
    { name: 'Period', sel: 'P.HR_Period_ID', col: 'HR_Period_ID' }
  ];
  INFO_COLS.forEach(function (c, i) {
    var id = INFO_BASE + 1 + i;
    if (scalar(db, 'SELECT ad_infocolumn_id FROM ad_infocolumn WHERE ad_infocolumn_id=?', [id]) != null) return;
    ins(db, 'ad_infocolumn', { ad_infocolumn_id: id, ad_client_id: 11, ad_org_id: 0, isactive: 'Y',
      created: NOW, createdby: 100, updated: NOW, updatedby: 100, name: c.name, ad_infowindow_id: INFO_BASE,
      entitytype: 'U', selectclause: c.sel, columnname: c.col, seqno: (i + 1) * 10, isdisplayed: 'Y',
      isquerycriteria: 'N', ad_infocolumn_uu: 'hba-infocol-' + c.col.toLowerCase() });
    added.info++;
  });
  L('§SEED_HBA_INFOCOL rows=' + INFO_COLS.length + ' (added this run: see summary)');

  // ── 7. C_Attendance rows — attendance.js's OWN demoSeed sessions (Q2 re-scoped: EMP001/EMP002 only) ─────
  var att = Attendance.demoSeed(ROOMS_FX.rooms, PERIOD);
  var sess = Attendance.sessions(att.log, PERIOD);
  var bpOf = { EMP001: 1001, EMP002: 1002 };
  var attId = 0;
  sess.forEach(function (s) {
    var bp = bpOf[s.employee], loc = locByGuid[s.zone];
    attId++;
    if (bp == null || loc == null) { must('ATT-RESOLVE', false, 'unresolvable session ' + s.employee + '@' + s.zone); return; }
    if (Number(scalar(db, 'SELECT COUNT(*) FROM C_Attendance WHERE C_BPartner_ID=? AND CheckInTime=?', [bp, s.in]))) return;
    ins(db, 'C_Attendance', Object.assign(std(), { C_Attendance_ID: attId, C_Attendance_UU: 'hba-att-' + attId,
      HR_Process_ID: run.hr_process.hr_process_id, C_BPartner_ID: bp, M_Locator_ID: loc,
      ServiceDate: String(s.in).slice(0, 10), CheckInTime: s.in, CheckOutTime: s.open ? null : s.out,
      Qty: s.open ? null : s.hours,          // hours DERIVED from real in/out (mirrors hr_movement.qty); open → honest NULL
      Description: s.open ? 'demo session (open — no fabricated finish)' : 'demo session' }));
    added.attendance++;
  });
  L('§SEED_HBA_ATT sessions=' + sess.length + ' added=' + added.attendance + ' (open sessions keep NULL checkout/qty)');

  // ── 8. SELF-WITNESS — the lens JOIN must resolve EVERY row through the real chain ────────────────────────
  var joined = rows(db, 'SELECT BP.Name AS who, W.Name AS building, L.Value AS room, ATT.CheckInTime AS tin,'
    + ' ATT.CheckOutTime AS tout, ATT.Qty AS qty FROM ' + FROM + ' ORDER BY ATT.CheckInTime');
  var total = Number(scalar(db, 'SELECT COUNT(*) FROM C_Attendance'));
  must('LENS-JOIN-LOSSLESS', joined.length === total && total === sess.length,
    'InfoWindow JOIN resolves ALL ' + total + '/' + sess.length + ' C_Attendance rows (no dangling FK) — joined=' + joined.length);
  must('LENS-WAREHOUSE', joined.length > 0 && joined.every(function (r) { return r.building === HHS_VALUE; }),
    'every session lands in the pinned HHS warehouse (Q1 Value=' + HHS_VALUE + ')');
  must('LENS-IDENTITY', joined.every(function (r) { return r.who === 'EMP001' || r.who === 'EMP002'; }),
    'every session resolves to a REAL seeded person (Q2: EMP001/EMP002 only) — ' + JSON.stringify(joined.map(function (r) { return r.who + '@' + r.room; })));
  var openRows = joined.filter(function (r) { return r.tout == null; });
  must('LENS-HONEST-OPEN', openRows.length === sess.filter(function (s) { return s.open; }).length
    && openRows.every(function (r) { return r.qty == null; }),
    openRows.length + ' open sessions keep NULL CheckOutTime AND NULL Qty (no fabricated finish/hours)');

  // payslip: DB-summed movements == the engine's payslip (gross/net land in HR_Movement losslessly)
  var slip = AdPayroll.payslip(run.hr_movement, 1001, 'en');
  var dbGross = Number(scalar(db, "SELECT SUM(amount) FROM HR_Movement WHERE c_bpartner_id=1001 AND accountsign='+'"));
  var dbNet = Number(scalar(db, "SELECT ROUND(SUM(CASE WHEN accountsign='+' THEN amount ELSE -amount END),2) FROM HR_Movement WHERE c_bpartner_id=1001"));
  must('PAYSLIP-DB==ENGINE', dbGross === slip.gross && dbNet === slip.net,
    'EMP001 payslip from DB rows: gross=' + dbGross + ' net=' + dbNet + ' == engine gross=' + slip.gross + ' net=' + slip.net);
  var hrEmp = Number(scalar(db, 'SELECT COUNT(*) FROM HR_Employee'));
  must('HR-EMPLOYEE-EXISTS', hrEmp === 2, 'HR_Employee carries the 2 real rows (was ZERO anywhere — §EVIDENCE pt 1) — got ' + hrEmp);

  // ── write-back + summary ─────────────────────────────────────────────────────────────────────────────────
  var changed = added.warehouse + added.locators + added.bpartners + added.users + added.tables + added.hr_rows
    + added.info + added.attendance + (added.ninja ? (added.ninja.tables + added.ninja.cols + added.ninja.windows
    + added.ninja.tabs + added.ninja.fields + added.ninja.menus) : 0);
  if (changed > 0 && fails === 0) { fs.writeFileSync(SEED, Buffer.from(db.export())); L('§SEED_HBA WROTE erp/ad_seed.db (' + changed + ' additions)'); }
  else if (fails === 0) L('§SEED_HBA NO-OP — seed already current (idempotent 2nd run)');
  else L('§SEED_HBA NOT WRITTEN — ' + fails + ' witness failure(s), DB left untouched');
  L('§W-HBA-ERP-SEED ' + (fails === 0 ? 'PASS' : 'FAIL') + ' — summary ' + JSON.stringify(added));
  db.close();
  process.exit(fails === 0 ? 0 : 1);
})();
