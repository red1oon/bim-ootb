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
//   5. RETIRE the invented C_Attendance (bim-compiler prompts/RESUME_HBA_ERP_STAGE3.md §PREREQUISITE,
//      watchdog 2026-07-03): C_Attendance is NOT a real iDempiere table (AD_Table LIKE '%ttendance%' → 0 rows
//      in ad_full.db) — a PRIME RULE violation shipped in the first revision of this script. Standard Ninja
//      rollback idiom (ninja_stage.js header): SET IsActive='N' on every dictionary row id>=NINJA_BASE; the
//      physical c_attendance table is DROPPED; the old 7600000 C_Attendance lens rows are removed (replaced
//      in §6 by the native lens over a REAL AD_Table).
//   6. REPLACE with the real native fit — the "Mary Consultant" GardenWorld pattern (S_Resource 100) sitting
//      unused in this same DB: one S_ResourceType 'Employee' (proto-cloned from the real person-type row 100),
//      one S_Resource per person (ad_user_id = the Stage-1 AD_User, m_warehouse_id = the pinned HHS warehouse,
//      proto-cloned from Mary's row — exact column map), and the ad_infowindow 7600000 lens re-declared over
//      S_ResourceAssignment ⋈ S_Resource ⋈ AD_User ⋈ M_Warehouse (ad_table_id = the REAL AD_Table 485,
//      not a staged id). Row shapes come from ad_attendance.js's builders (ONE shape definition, reused).
//   7. s_resourceassignment rows folded from attendance.js's OWN demoSeed sessions for period 2026-06
//      (EMP001/EMP002 only) — employee resolved to the REAL seeded S_Resource, assigndatefrom/to = the real
//      in/out ts, open sessions keep assigndateto/qty NULL + isconfirmed='N' (no fabricated finish/approval).
//      The ZONE stays a BIM op-log fact (room-granularity call, RESUME_HBA_ERP_STAGE3.md — no native room
//      column on S_ResourceAssignment; never a fabricated FK).
//   8. SELF-WITNESS (W-HBA-ERP-SEED): runs the native InfoWindow JOIN live and asserts NO row is lost (every
//      FK resolves through S_Resource→AD_User + S_Resource→M_Warehouse), the warehouse is the pinned HHS row,
//      the invention is GONE (dictionary inactive, physical table absent, lens on the real table), the
//      readPresence lens read round-trips, and the DB-summed payslip == the engine's payslip. NAMES the issue:
//      pane data derives from a real queryable NATIVE AD chain (§CONVENTION), not an invented table.
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

const NinjaStage = require(path.join(ROOT, 'erp', 'ninja_stage.js'));   // NINJA_BASE only (rollback of the retired staging)
const AdPayroll = require(path.join(ROOT, 'hr_bim_asset', 'ad_payroll.js'));
const Attendance = require(path.join(ROOT, 'hr_bim_asset', 'attendance.js'));
const AdAttendance = require(path.join(ROOT, 'hr_bim_asset', 'ad_attendance.js'));
const Leave = require(path.join(ROOT, 'hr_bim_asset', 'leave.js'));
const AdLeave = require(path.join(ROOT, 'hr_bim_asset', 'ad_leave.js'));
const AdTenancy = require(path.join(ROOT, 'hr_bim_asset', 'ad_tenancy.js'));
const Models = require(path.join(ROOT, 'hr_bim_asset', 'models.js'));
const ROOMS_FX = require(path.join(ROOT, 'hr_bim_asset', 'fixtures', 'hhs_rooms.json'));

const NOW = '2026-07-03 00:00:00';           // fixed seed timestamp (house style: seed_fin_uom.js)
const BIM_BASE = 990000;                      // BIM-added master-row id floor (house style: seed_fin_*.js)
const PERIOD = '2026-06';                     // ad_payroll.demoSpec()'s own period — reused, not re-chosen
const HHS_VALUE = 'HHS_Office_Federated';     // Q1: durable Value, pinned ONCE (== the building/source name)
const INFO_BASE = NinjaStage.NINJA_BASE + 600000;  // 7600000 — the attendance lens id block, RETAINED across the
                                                   // §5 retarget (same id, new native fromclause) for continuity

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
// proto-clone (house idiom, same as seed_hba_bom.js): read a REAL row of `table`, keep its populated columns,
// apply overrides — guarantees the EXACT iDempiere column map, never a hand-built partial row.
function protoClone(db, table, whereSql, params, overrides) {
  var r = db.exec('SELECT * FROM ' + table + (whereSql ? (' WHERE ' + whereSql) : '') + ' LIMIT 1', params || []);
  if (!r.length || !r[0].values.length) return null;
  var proto = {}; r[0].columns.forEach(function (c, i) { if (r[0].values[0][i] != null) proto[c] = r[0].values[0][i]; });
  return Object.assign({}, proto, overrides);
}

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
    'isqueryafterchange', 'isrange', 'defaultvalue2', 'placeholder2'],
  // §2026-07-04c (RESUME_HR_BIM_ASSET.md, reverse Zoom-Across build) — live PRAGMA/AD_Column dump from
  // bim-compiler build/erp/ad_full.db (2026-07-04): C_Subscription/C_SubscriptionType exist in the AD
  // dictionary (real AD_Table rows 669/668) but carried ZERO physical rows anywhere — same dormant-native
  // pattern as HR_* before Stage 1. Needed so the Tenancy pane's existing "open ↗" (AD_WINDOWS.SUBSCRIPTION
  // 316, already shipped) points at a REAL row, and so the c_subscription reverse zoom-across branch has a
  // real record to launch from (not dead code over an empty table).
  C_SubscriptionType: ['c_subscriptiontype_id', 'name', 'description', 'frequency', 'frequencytype',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'c_subscriptiontype_uu'],
  C_Subscription: ['c_subscription_id', 'name', 'c_bpartner_id', 'm_product_id', 'c_subscriptiontype_id',
    'startdate', 'renewaldate', 'paiduntildate', 'isdue',
    'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'c_subscription_uu']
};

(async function () {
  var fails = 0;
  function L(m) { console.log(m); }
  function must(tag, cond, msg) { L('§W-HBA-ERP-SEED ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); if (!cond) fails++; }

  if (!fs.existsSync(SEED)) { L('§SEED_HBA FAIL — erp/ad_seed.db not found at ' + SEED); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));
  var added = { warehouse: 0, locators: 0, bpartners: 0, users: 0, tables: 0, hr_rows: 0, retired: 0, restype: 0, resources: 0, info: 0, attendance: 0, leave: 0, tenant_bp: 0, subtypes: 0, subscriptions: 0 };

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

  // ── 5. RETIRE the invented C_Attendance (RESUME_HBA_ERP_STAGE3.md §PREREQUISITE) ─────────────────────────
  // Ninja rollback idiom (ninja_stage.js header): IsActive='N' on every dictionary row id>=NINJA_BASE; drop
  // the invented physical table; remove the OLD 7600000 lens rows (identified by their staged ad_table_id —
  // the §6 replacement re-declares 7600000 over the REAL AD_Table, so a re-run never deletes the new lens).
  var retired = 0;
  ['AD_Table', 'AD_Column', 'AD_Window', 'AD_Tab', 'AD_Field', 'AD_Menu'].forEach(function (t) {
    try {
      db.run("UPDATE " + t + " SET IsActive='N' WHERE " + t + "_ID>=" + NinjaStage.NINJA_BASE + " AND IsActive='Y'");
      retired += db.getRowsModified();
    } catch (e) { /* table absent in a minimal seed → nothing staged there */ }
  });
  if (db.exec("SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='c_attendance'").length) {
    db.run('DROP TABLE C_Attendance'); retired++;
    L('§SEED_HBA_RETIRE dropped physical C_Attendance table (invented — no such table in the real dictionary)');
  }
  var oldLensTable = scalar(db, 'SELECT ad_table_id FROM ad_infowindow WHERE ad_infowindow_id=?', [INFO_BASE]);
  if (oldLensTable != null && Number(oldLensTable) >= NinjaStage.NINJA_BASE) {
    db.run('DELETE FROM ad_infocolumn WHERE ad_infowindow_id=?', [INFO_BASE]); retired += db.getRowsModified();
    db.run('DELETE FROM ad_infowindow WHERE ad_infowindow_id=?', [INFO_BASE]); retired += db.getRowsModified();
    L('§SEED_HBA_RETIRE removed old C_Attendance lens rows (ad_infowindow ' + INFO_BASE + ' pointed at staged table ' + oldLensTable + ')');
  }
  added.retired = retired;
  L('§SEED_HBA_RETIRE C_Attendance invention rollback — changes=' + retired + ' (2nd run: 0)');

  // ── 6. REPLACE with native S_Resource/S_ResourceAssignment (the Mary-Consultant pattern) ─────────────────
  ['ad_infowindow', 'ad_infocolumn'].forEach(function (t) {
    if (createTable(db, t, DDL[t])) { added.tables++; L('§SEED_HBA_DDL CREATE ' + t); }
  });
  // 6a. S_ResourceType 'Employee' — proto-cloned from the REAL person-type row (Consultant 100).
  var restypeId = scalar(db, "SELECT s_resourcetype_id FROM s_resourcetype WHERE value='Employee'");
  if (restypeId == null) {
    restypeId = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(s_resourcetype_id),0) FROM s_resourcetype')), BIM_BASE - 1) + 1;
    var rtRow = protoClone(db, 's_resourcetype', 's_resourcetype_id=100', [],
      { s_resourcetype_id: restypeId, value: 'Employee', name: 'Employee',
        description: 'HBA person resource type (HHS pilot) — proto-cloned from Consultant 100',
        created: NOW, updated: NOW, createdby: 100, updatedby: 100, s_resourcetype_uu: 'hba-restype-employee' });
    if (!rtRow) { must('RESTYPE-PROTO', false, 'no proto s_resourcetype row 100 (Consultant) to clone'); }
    else { ins(db, 's_resourcetype', rtRow); added.restype = 1; L('§SEED_HBA_RESTYPE ADD Employee id=' + restypeId + ' (proto=Consultant 100)'); }
  } else L('§SEED_HBA_RESTYPE SKIP Employee exists id=' + restypeId);
  // 6b. S_Resource per person — ad_attendance.toPersonResourceRow shape + Mary(100) proto for the exact map.
  added.resources = 0;
  var resByCode = {};
  PEOPLE.forEach(function (p) {
    var rid = scalar(db, 'SELECT s_resource_id FROM s_resource WHERE value=?', [p.name]);
    if (rid == null) {
      rid = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(s_resource_id),0) FROM s_resource')), BIM_BASE - 1) + 1;
      var core = AdAttendance.toPersonResourceRow({ code: p.name, name: p.name, ad_user_id: p.user, m_warehouse_id: whId },
        restypeId, function () { return rid; });
      var rRow = protoClone(db, 's_resource', 's_resource_id=100', [], Object.assign({}, core,
        { description: 'CONTOH/SAMPLE demo employee resource (HHS pilot) — proto-cloned from Mary Consultant 100',
          created: NOW, updated: NOW, createdby: 100, updatedby: 100, s_resource_uu: 'hba-res-' + p.name.toLowerCase() }));
      if (!rRow) { must('RESOURCE-PROTO', false, 'no proto s_resource row 100 (Mary) to clone'); return; }
      ins(db, 's_resource', rRow); added.resources++;
      L('§SEED_HBA_RES ADD S_Resource ' + rid + ' ' + p.name + ' → AD_User ' + p.user + ' @ warehouse ' + whId);
    } else L('§SEED_HBA_RES SKIP S_Resource ' + p.name + ' exists id=' + rid);
    resByCode[p.name] = Number(rid);
  });
  // 6c. the native attendance lens — ad_infowindow 7600000 over the REAL AD_Table (S_ResourceAssignment=485).
  var raTableId = scalar(db, "SELECT AD_Table_ID FROM AD_Table WHERE TableName='S_ResourceAssignment'");
  must('RA-TABLE-REAL', raTableId != null && Number(raTableId) < NinjaStage.NINJA_BASE,
    'S_ResourceAssignment is a REAL dictionary table (AD_Table ' + raTableId + ', below the ninja block)');
  var FROM = 'S_ResourceAssignment RA JOIN S_Resource R ON RA.S_Resource_ID=R.S_Resource_ID'
    + ' JOIN AD_User U ON R.AD_User_ID=U.AD_User_ID'
    + ' JOIN M_Warehouse W ON R.M_Warehouse_ID=W.M_Warehouse_ID';
  if (scalar(db, 'SELECT ad_infowindow_id FROM ad_infowindow WHERE ad_infowindow_id=?', [INFO_BASE]) == null) {
    ins(db, 'ad_infowindow', { ad_infowindow_id: INFO_BASE, ad_client_id: 11, ad_org_id: 0,
      isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100,
      name: 'HHS Attendance', description: 'Attendance lens — who/building/when over the NATIVE S_Resource chain (§PREREQUISITE retarget)',
      ad_table_id: raTableId, entitytype: 'U', fromclause: FROM, orderbyclause: 'RA.AssignDateFrom',
      isvalid: 'Y', isdefault: 'N', isdistinct: 'N', seqno: 10, ad_infowindow_uu: 'hba-infowin-attendance' });
    added.info++;
    L('§SEED_HBA_INFOWIN ADD id=' + INFO_BASE + ' over REAL AD_Table ' + raTableId + ' (S_ResourceAssignment)');
  } else L('§SEED_HBA_INFOWIN SKIP exists id=' + INFO_BASE);
  var INFO_COLS = [
    { name: 'Who', sel: 'U.Name', col: 'Name' },
    { name: 'Building', sel: 'W.Name', col: 'WarehouseName' },
    { name: 'Check In', sel: 'RA.AssignDateFrom', col: 'AssignDateFrom' },
    { name: 'Check Out', sel: 'RA.AssignDateTo', col: 'AssignDateTo' },
    { name: 'Hours', sel: 'RA.Qty', col: 'Qty' },
    { name: 'Confirmed', sel: 'RA.IsConfirmed', col: 'IsConfirmed' }
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

  // ── 7. s_resourceassignment rows — attendance.js's OWN demoSeed sessions (EMP001/EMP002 only) ────────────
  // Row shape from ad_attendance.toAssignmentRow (ONE builder, reused); zone stays a BIM op-log fact.
  var att = Attendance.demoSeed(ROOMS_FX.rooms, PERIOD);
  var sess = Attendance.sessions(att.log, PERIOD);
  sess.forEach(function (s) {
    var rid = resByCode[s.employee];
    if (rid == null) { must('ATT-RESOLVE', false, 'unresolvable session ' + s.employee + ' (no real S_Resource)'); return; }
    if (Number(scalar(db, 'SELECT COUNT(*) FROM s_resourceassignment WHERE s_resource_id=? AND assigndatefrom=?', [rid, s.in]))) return;
    var raId = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(s_resourceassignment_id),0) FROM s_resourceassignment')), BIM_BASE - 1) + 1;
    var raRow = AdAttendance.toAssignmentRow(s, rid, function () { return raId; });
    ins(db, 's_resourceassignment', Object.assign(raRow, { ad_client_id: 11, ad_org_id: 11, isactive: 'Y',
      created: NOW, createdby: 100, updated: NOW, updatedby: 100, s_resourceassignment_uu: 'hba-ra-' + raId }));
    added.attendance++;
  });
  L('§SEED_HBA_ATT sessions=' + sess.length + ' added=' + added.attendance + ' (open sessions keep NULL assigndateto/qty, isconfirmed=N)');

  // ── 8. s_resourceunavailable rows — leave.js's OWN demoLog TAKE ops (§2026-07-04 thread C) ─────────────────
  // Additive to the payroll feed (leaveDeduction), not a replacement — a TAKE ALSO surfaces as a resource-
  // availability blackout, the same native mechanism a room's maintenance blackout already uses. Row shape
  // from ad_leave.toUnavailableRow (ONE builder, reused); proto-cloned columns via the stock row (id=100,
  // "Training class") for the exact iDempiere map, same precedent as the S_Resource proto-clone above.
  var protoUA = rows(db, 'SELECT * FROM s_resourceunavailable WHERE s_resourceunavailable_id=100')[0];
  must('UA-PROTO-REAL', !!protoUA, 'a real proto s_resourceunavailable row (100, GardenWorld stock) exists to clone');
  PEOPLE.forEach(function (p) {
    var pLog = Leave.demoLog(p.name);
    var comp = AdLeave.compileLeaveUnavailability(pLog, resByCode);
    comp.rows.forEach(function (r) {
      if (Number(scalar(db, 'SELECT COUNT(*) FROM s_resourceunavailable WHERE s_resource_id=? AND datefrom=?', [r.s_resource_id, r.datefrom]))) return;
      var uaId = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(s_resourceunavailable_id),0) FROM s_resourceunavailable')), BIM_BASE - 1) + 1;
      var uaRow = protoUA ? Object.assign({}, protoUA, { s_resourceunavailable_id: uaId, s_resource_id: r.s_resource_id,
        datefrom: r.datefrom, dateto: r.dateto, description: r.description, ad_client_id: 11, ad_org_id: 11, isactive: 'Y',
        created: NOW, createdby: 100, updated: NOW, updatedby: 100, s_resourceunavailable_uu: 'hba-ua-' + uaId })
        : Object.assign({}, r, { s_resourceunavailable_id: uaId, ad_client_id: 11, ad_org_id: 11, isactive: 'Y',
        created: NOW, createdby: 100, updated: NOW, updatedby: 100, s_resourceunavailable_uu: 'hba-ua-' + uaId });
      ins(db, 's_resourceunavailable', uaRow);
      added.leave = (added.leave || 0) + 1;
    });
  });
  L('§SEED_HBA_LEAVE_UA added=' + (added.leave || 0) + ' (EMP001/EMP002 demoLog TAKE ops → real S_ResourceUnAvailable rows)');

  // ── 9. C_SubscriptionType + C_Subscription (Tenancy/Strata, §2026-07-04c) ─────────────────────────────────
  // Physical tables didn't exist anywhere (both dormant AD dictionary rows — see DDL comment above). Tenant/
  // owner party codes (BP-TEN-1/5/6, BP-OWN-1 — models.js Tenancy/Strata records) have NO real C_BPartner row
  // either (verified — same honest gap already flagged for AD_User.c_bpartner_id, §P10a). Minting one C_BPartner
  // master row per code is the SAME dictionary-completion precedent already used for C_UOM (§P10b) and
  // M_Warehouse (§1 above) — not a new business fact, just the master row a real FK requires. The 3 tenant
  // codes already have a real AD_User row (id 3/4/5, §P10a) with c_bpartner_id=null — closing that gap here
  // too (one UPDATE) so officialByName's DB-first governed lookup picks up the real link, same as EMP001/EMP002.
  // §2026-07-04c discovery — window 316 "Subscription" (the Tenancy pane's OWN AD_WINDOWS.SUBSCRIPTION link,
  // hba_lens.js, shipped PR #645) is genuinely IN the real upstream dictionary (verified build/erp/ad_full.db:
  // AD_Window 316 exists, Name='Subscription', its Tab 621 + 12 AD_Field rows already ACTIVE in ad_seed.db) —
  // but stock iDempiere ships the WINDOW header itself IsActive='N' (a rarely-used module, dormant like the
  // HR_* tables Stage 1 activated), and ad_seed.db's curation dropped the row entirely (374 windows vs
  // ad_full.db's 458 — an extraction gap, not an HBA edit). getWindow() requires AD_Window_ID+IsActive='Y' to
  // resolve at all, so the pane's own forward link has been silently dead since it shipped. EXTRACT (not
  // invent): the row below is byte-for-byte the real ad_full.db values except IsActive Y (the SAME "activate a
  // dormant native window" precedent as HR_Process/HR_Movement — Client/Org 0/0 preserved as the real system row).
  if (scalar(db, 'SELECT AD_Window_ID FROM AD_Window WHERE AD_Window_ID=316') == null) {
    ins(db, 'AD_Window', { AD_Window_ID: 316, AD_Client_ID: 0, AD_Org_ID: 0, IsActive: 'Y',
      Created: NOW, CreatedBy: 0, Updated: NOW, UpdatedBy: 0, Name: 'Subscription',
      Description: 'Maintain Subscriptions and Deliveries',
      Help: 'Subscription of a Business Partner of a Product to renew', WindowType: 'M', IsSOTrx: 'Y',
      EntityType: 'D', Processing: 'N', IsDefault: 'N', IsBetaFunctionality: 'N',
      AD_Window_UU: '5887bdad-0434-40ee-89db-7d12b33084af' });
    added.tables++;
    L('§SEED_HBA_WINDOW316 ADD AD_Window 316 "Subscription" (real upstream row, activated Y — its Tab 621 was already live)');
  } else L('§SEED_HBA_WINDOW316 SKIP exists');

  ['C_SubscriptionType', 'C_Subscription'].forEach(function (t) { if (createTable(db, t, DDL[t])) { added.tables++; L('§SEED_HBA_DDL CREATE ' + t + ' (' + DDL[t].length + ' real cols per ad_full.db AD_Column)'); } });
  Object.keys(AdTenancy.SUBSCRIPTION_TYPES).forEach(function (k) {
    var st = AdTenancy.SUBSCRIPTION_TYPES[k];
    if (scalar(db, 'SELECT c_subscriptiontype_id FROM C_SubscriptionType WHERE c_subscriptiontype_id=?', [st.c_subscriptiontype_id]) == null) {
      ins(db, 'C_SubscriptionType', { c_subscriptiontype_id: st.c_subscriptiontype_id, name: st.name, description: st.description,
        frequency: st.frequency, frequencytype: st.frequencytype, ad_client_id: 11, ad_org_id: 0, isactive: 'Y',
        created: NOW, createdby: 100, updated: NOW, updatedby: 100, c_subscriptiontype_uu: 'hba-subtype-' + k.toLowerCase() });
      added.subtypes++; L('§SEED_HBA_SUBTYPE ADD ' + k + ' id=' + st.c_subscriptiontype_id);
    } else L('§SEED_HBA_SUBTYPE SKIP ' + k + ' exists');
  });
  // party codes referenced by Tenancy leases + Strata parcels → real C_BPartner (find-or-mint)
  var partyCodes = Models.records('Tenancy').map(function (r) { return r.tenant; })
    .concat(Models.records('Strata').map(function (r) { return r.owner; }));
  var bpByCode = {};
  partyCodes.forEach(function (code) {
    var id = scalar(db, 'SELECT C_BPartner_ID FROM C_BPartner WHERE Value=?', [code]);
    if (id == null) {
      id = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(C_BPartner_ID),0) FROM C_BPartner')), BIM_BASE - 1) + 1;
      ins(db, 'C_BPartner', { C_BPartner_ID: id, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y',
        Created: NOW, CreatedBy: 100, Updated: NOW, UpdatedBy: 100, Value: code, Name: code,
        Description: 'CONTOH/SAMPLE demo tenancy party (HHS pilot) — real BPartner master row, minted to ' +
          'complete the C_Subscription FK (dictionary-completion precedent, same as C_UOM/M_Warehouse)',
        IsSummary: 'N', C_BP_Group_ID: 105, IsEmployee: 'N', IsVendor: 'N', IsCustomer: 'Y', IsSalesRep: 'N',
        C_BPartner_UU: 'hba-bp-' + code.toLowerCase() });
      added.tenant_bp++;
      L('§SEED_HBA_TENANT_BP ADD C_BPartner ' + id + ' ' + code + ' IsCustomer=Y');
    } else L('§SEED_HBA_TENANT_BP SKIP C_BPartner ' + code + ' exists id=' + id);
    bpByCode[code] = Number(id);
    // close the AD_User.c_bpartner_id gap for the 3 tenant codes that already have a real AD_User (§P10a id 3/4/5)
    var uid = scalar(db, 'SELECT AD_User_ID FROM AD_User WHERE Name=? AND C_BPartner_ID IS NULL', [code]);
    if (uid != null) { db.run('UPDATE AD_User SET C_BPartner_ID=? WHERE AD_User_ID=?', [id, uid]); L('§SEED_HBA_TENANT_BP_LINK AD_User ' + uid + ' (' + code + ') → C_BPartner ' + id); }
  });
  // compile Tenancy+Strata onto the REAL seeded rooms/locators/products (compileBuilding's own erpQuery
  // match-or-create, AD-TEN7-proven) — reuse .subscriptions, never re-derive the shape by hand.
  var compiled = AdTenancy.compileBuilding(HHS_VALUE, ROOMS_FX.rooms, Models.records('Tenancy'), Models.records('Strata'),
    { erpQuery: function (sql, p) { return rows(db, sql, p); } });
  must('TENANCY-GOVERNED', !!compiled._governed, 'compileBuilding resolved the REAL seeded HHS warehouse (governed, not a throwaway mint)');
  compiled.subscriptions.forEach(function (s) {
    var code = s.row.c_bpartner_id, bpId = bpByCode[code];
    if (bpId == null) { must('SUB-BP-RESOLVE', false, 'no real C_BPartner for party code ' + code); return; }
    if (Number(scalar(db, 'SELECT COUNT(*) FROM C_Subscription WHERE M_Product_ID=? AND C_BPartner_ID=? AND C_SubscriptionType_ID=?',
      [s.row.m_product_id, bpId, s.row.c_subscriptiontype_id]))) return;
    var subId = Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(C_Subscription_ID),0) FROM C_Subscription')), BIM_BASE - 1) + 1;
    ins(db, 'C_Subscription', { c_subscription_id: subId, name: s.row.name, c_bpartner_id: bpId,
      m_product_id: s.row.m_product_id, c_subscriptiontype_id: s.row.c_subscriptiontype_id,
      startdate: s.row.startdate || null, renewaldate: s.row.renewaldate || null, paiduntildate: null, isdue: s.row.isdue,
      ad_client_id: 11, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100,
      c_subscription_uu: 'hba-sub-' + subId });
    added.subscriptions++;
    L('§SEED_HBA_SUB ADD C_Subscription ' + subId + ' ' + s.kind + ' ' + s.row.name + ' party=' + code + '(' + bpId + ') unit=' + s.unit_guid);
  });
  L('§SEED_HBA_SUB total=' + compiled.subscriptions.length + ' added=' + added.subscriptions + ' skipped=' + compiled.skipped.length);

  // ── 10. SELF-WITNESS — the native lens JOIN must resolve EVERY row through the real chain ────────────────
  var joined = rows(db, 'SELECT U.Name AS who, W.Name AS building, RA.AssignDateFrom AS tin,'
    + ' RA.AssignDateTo AS tout, RA.Qty AS qty, RA.IsConfirmed AS conf FROM ' + FROM
    + ' WHERE W.Value=? ORDER BY RA.AssignDateFrom', [HHS_VALUE]);
  var total = Number(scalar(db, 'SELECT COUNT(*) FROM s_resourceassignment RA JOIN s_resource R ON RA.s_resource_id=R.s_resource_id WHERE R.m_warehouse_id=?', [whId]));
  must('LENS-JOIN-LOSSLESS', joined.length === total && total === sess.length,
    'native InfoWindow JOIN resolves ALL ' + total + '/' + sess.length + ' HBA s_resourceassignment rows (no dangling FK) — joined=' + joined.length);
  must('LENS-WAREHOUSE', joined.length > 0 && joined.every(function (r) { return r.building === HHS_VALUE; }),
    'every session lands in the pinned HHS warehouse (Q1 Value=' + HHS_VALUE + ')');
  must('LENS-IDENTITY', joined.every(function (r) { return r.who === 'EMP001' || r.who === 'EMP002'; }),
    'every session resolves to a REAL seeded person via S_Resource.ad_user_id→AD_User — ' + JSON.stringify(joined.map(function (r) { return r.who; })));
  var openRows = joined.filter(function (r) { return r.tout == null; });
  must('LENS-HONEST-OPEN', openRows.length === sess.filter(function (s) { return s.open; }).length
    && openRows.every(function (r) { return r.qty == null && r.conf === 'N'; }),
    openRows.length + ' open sessions keep NULL AssignDateTo AND NULL Qty AND IsConfirmed=N (no fabricated finish/hours/approval)');
  // the invention is GONE — dictionary inactive, physical table absent, lens re-pointed at the real table.
  var stagedActive = Number(scalar(db, "SELECT COUNT(*) FROM AD_Table WHERE AD_Table_ID>=" + NinjaStage.NINJA_BASE + " AND IsActive='Y'"));
  var physGone = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='c_attendance'").length === 0;
  var lensTable = Number(scalar(db, 'SELECT ad_table_id FROM ad_infowindow WHERE ad_infowindow_id=?', [INFO_BASE]));
  must('INVENTION-GONE', stagedActive === 0 && physGone && lensTable === Number(raTableId),
    'C_Attendance invention retired: staged dictionary rows inactive (' + stagedActive + ' active), physical table gone=' + physGone
    + ', lens ' + INFO_BASE + ' points at REAL AD_Table ' + lensTable);
  // readPresence round-trip — the module's own lens read returns the same sessions (the pane's data path).
  var lensRead = AdAttendance.readPresence(function (sql, p) { return rows(db, sql, p); }, { m_warehouse_id: whId });
  must('READPRESENCE-LENS', lensRead.sessions.length === total
    && lensRead.sessions.every(function (r) { return r.building === HHS_VALUE && (r.who === 'EMP001' || r.who === 'EMP002'); }),
    'ad_attendance.readPresence returns ' + lensRead.sessions.length + '/' + total + ' sessions through the native JOIN (honest-open survives the round-trip)');

  // payslip: DB-summed movements == the engine's payslip (gross/net land in HR_Movement losslessly)
  var slip = AdPayroll.payslip(run.hr_movement, 1001, 'en');
  var dbGross = Number(scalar(db, "SELECT SUM(amount) FROM HR_Movement WHERE c_bpartner_id=1001 AND accountsign='+'"));
  var dbNet = Number(scalar(db, "SELECT ROUND(SUM(CASE WHEN accountsign='+' THEN amount ELSE -amount END),2) FROM HR_Movement WHERE c_bpartner_id=1001"));
  must('PAYSLIP-DB==ENGINE', dbGross === slip.gross && dbNet === slip.net,
    'EMP001 payslip from DB rows: gross=' + dbGross + ' net=' + dbNet + ' == engine gross=' + slip.gross + ' net=' + slip.net);
  var hrEmp = Number(scalar(db, 'SELECT COUNT(*) FROM HR_Employee'));
  must('HR-EMPLOYEE-EXISTS', hrEmp === 2, 'HR_Employee carries the 2 real rows (was ZERO anywhere — §EVIDENCE pt 1) — got ' + hrEmp);

  // §2026-07-04 thread C — leave-driven S_ResourceUnAvailable rows resolve through the SAME native chain the
  // Resource window (236, tab 416 "Unavailability") reads: every row's s_resource_id → a real seeded S_Resource
  // with a real ad_user_id — i.e. this is genuinely visible in "the standard iDempiere Resource Schedule", not
  // a floating unlinked row.
  var uaJoined = rows(db, 'SELECT UA.S_ResourceUnAvailable_ID AS id, U.Name AS who, UA.DateFrom AS df, UA.DateTo AS dt'
    + ' FROM s_resourceunavailable UA JOIN s_resource R ON UA.S_Resource_ID=R.S_Resource_ID'
    + ' JOIN AD_User U ON R.AD_User_ID=U.AD_User_ID WHERE UA.S_ResourceUnAvailable_ID>=' + BIM_BASE);
  var uaTotal = Number(scalar(db, 'SELECT COUNT(*) FROM s_resourceunavailable WHERE s_resourceunavailable_id>=' + BIM_BASE));
  must('LEAVE-UA-JOIN-LOSSLESS', uaJoined.length === uaTotal && uaTotal === 6,
    'every leave-driven S_ResourceUnAvailable row (' + uaTotal + '/6 — 3 TAKE ops × 2 employees) resolves through '
    + 'the REAL Resource↔AD_User chain the window-236 tab-416 "Unavailability" grid reads — none dangling');
  var uaLens = AdLeave.readUnavailability(function (sql, p) { return rows(db, sql, p); }, {});
  must('LEAVE-UA-LENS', uaLens.blackouts.length >= uaTotal,
    'ad_leave.readUnavailability returns the persisted rows through the native JOIN (the pane/seed data path)');

  // §2026-07-04c — every persisted C_Subscription resolves through M_Product→M_Locator→M_Warehouse (the
  // reverse zoom-across branch's own join) AND through C_BPartner (a real party, never a dangling code string).
  var subJoined = rows(db, 'SELECT S.C_Subscription_ID AS id, BP.Value AS party, W.Value AS bld, P.Value AS unit_guid'
    + ' FROM C_Subscription S JOIN C_BPartner BP ON S.C_BPartner_ID=BP.C_BPartner_ID'
    + ' JOIN M_Product P ON S.M_Product_ID=P.M_Product_ID JOIN M_Locator L ON P.M_Locator_ID=L.M_Locator_ID'
    + ' JOIN M_Warehouse W ON L.M_Warehouse_ID=W.M_Warehouse_ID WHERE W.Value=?', [HHS_VALUE]);
  var subTotal = Number(scalar(db, 'SELECT COUNT(*) FROM C_Subscription'));
  must('SUB-JOIN-LOSSLESS', subJoined.length === subTotal && subTotal === compiled.subscriptions.length,
    'every seeded C_Subscription (' + subTotal + '/' + compiled.subscriptions.length + ') resolves through the '
    + 'REAL Product→Locator→Warehouse chain AND a real C_BPartner — none dangling, none skipped silently');
  var win316 = scalar(db, "SELECT Name FROM AD_Window WHERE AD_Window_ID=316 AND IsActive='Y'");
  must('WINDOW316-LIVE', win316 === 'Subscription',
    'the Tenancy pane\'s own AD_WINDOWS.SUBSCRIPTION=316 link now resolves (was silently dead — window row absent from ad_seed.db\'s curated extract)');

  // ── 11. C_UOM + M_Product + C_Order/C_OrderLine — IoT devices (§2026-07-05, RESUME_HR_BIM_ASSET.md
  // §2026-07-04d §BUILD ORDER items 2/4/5) ────────────────────────────────────────────────────────────────────
  // iot.js billingLines()'s m_product_id/c_order_id/c_orderline_id were a SEQUENTIAL IN-MEMORY MINT — same
  // "compiled but never persisted" gap this section's §9 already fixed for C_Subscription. Two-phase, same
  // idiom as §2/§9: (a) insert the master rows here with PROPER MAX-based ids (never the internal ++counter —
  // that would collide with real existing M_Product/C_UOM/C_Order ids); (b) THEN call IoT.billingLines() with
  // erpQuery so its OWN match-or-create (iot.js §STAGE2) resolves every id back to the row just inserted —
  // _governed:true proves it, never the mint fallback. All 4 tables are REAL, already-physical (298/43/110/18
  // rows respectively per PRAGMA — no createTable needed, unlike HR_*).
  added.iot_uom = 0; added.iot_product = 0; added.iot_order = 0; added.iot_orderline = 0;
  function nextId(table, idCol) { return Math.max(Number(scalar(db, 'SELECT COALESCE(MAX(' + idCol + '),0) FROM ' + table)), BIM_BASE - 1) + 1; }
  var IoT = require(path.join(ROOT, 'hr_bim_asset', 'iot.js'));
  IoT.SENSORS.forEach(function (s) {
    if (scalar(db, 'SELECT C_UOM_ID FROM C_UOM WHERE Name=?', [s.uom_name]) != null) return;
    var id = nextId('C_UOM', 'C_UOM_ID');
    ins(db, 'C_UOM', { C_UOM_ID: id, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y', Created: NOW, CreatedBy: 100,
      Updated: NOW, UpdatedBy: 100, UOMSymbol: s.uom_symbol, Name: s.uom_name,
      Description: 'CONTOH/SAMPLE IoT sensor physical unit (HHS pilot) — dictionary gap, real column shape',
      StdPrecision: 2, CostingPrecision: 2, IsDefault: 'N', UOMType: 'O', C_UOM_UU: 'hba-iot-uom-' + s.key });
    added.iot_uom++;
    L('§SEED_HBA_IOT_UOM ADD ' + s.uom_name + ' id=' + id);
  });
  var DEVICE_PRODUCTS = IoT.SENSORS.map(function (s) { return { key: s.key, label: s.label + ' (' + (IoT.DEVICES[s.key] || {}).element + ')' }; })
    .concat(IoT.CAMERAS.map(function (c, i) { return { key: 'cam' + (i + 1), label: 'CCTV Camera ' + (i + 1) + ' (' + c.element + ', ' + c.storey + ')' }; }));
  DEVICE_PRODUCTS.forEach(function (d) {
    var value = 'IOT-' + d.key.toUpperCase() + '-HHS';
    if (scalar(db, 'SELECT M_Product_ID FROM M_Product WHERE Value=?', [value]) != null) return;
    var id = nextId('M_Product', 'M_Product_ID');
    ins(db, 'M_Product', { M_Product_ID: id, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y', Created: NOW,
      CreatedBy: 100, Updated: NOW, UpdatedBy: 100, Value: value, Name: d.label,
      Description: 'CONTOH/SAMPLE IoT device compiled as a real M_Product (HHS pilot) — BOM PRINCIPLE: the BIM-bound device IS the product',
      IsSummary: 'N', IsStocked: 'N', IsPurchased: 'N', IsSold: 'N', IsBOM: 'N', IsInvoicePrintDetails: 'Y',
      IsPickListPrintDetails: 'Y', IsVerified: 'N', Discontinued: 'N', Processing: 'N', ProductType: 'S',
      IsWebStoreFeatured: 'N', IsSelfService: 'N', IsDropShip: 'N', IsExcludeAutoDelivery: 'N', istoformule: 'N',
      IsKanban: 'N', IsManufactured: 'N', IsPhantom: 'N', IsOwnBox: 'N', IsAutoProduce: 'N',
      M_Product_UU: 'hba-iot-prod-' + d.key });
    added.iot_product++;
    L('§SEED_HBA_IOT_PRODUCT ADD ' + value + ' id=' + id);
  });
  var iotDocNo = 'IOT-' + HHS_VALUE + '-latest';
  if (scalar(db, 'SELECT C_Order_ID FROM C_Order WHERE DocumentNo=?', [iotDocNo]) == null) {
    var ordId = nextId('C_Order', 'C_Order_ID');
    ins(db, 'C_Order', { C_Order_ID: ordId, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y', Created: NOW,
      CreatedBy: 100, Updated: NOW, UpdatedBy: 100, IsSOTrx: 'Y', DocumentNo: iotDocNo, DocStatus: 'DR',
      DocAction: 'CO', Processed: 'N',
      Description: 'CONTOH/SAMPLE IoT sensor billing order (HHS pilot) — utility/security readings compiled to real C_OrderLine rows',
      DateOrdered: NOW, M_Warehouse_ID: whId, C_Currency_ID: IoT.MYR_CURRENCY_ID, IsDiscountPrinted: 'N',
      C_Order_UU: 'hba-iot-order-latest' });
    added.iot_order++;
    L('§SEED_HBA_IOT_ORDER ADD ' + iotDocNo + ' id=' + ordId + ' warehouse=' + whId + ' currency=MYR(' + IoT.MYR_CURRENCY_ID + ')');
  }
  var eq = function (sql, p) { return rows(db, sql, p); };
  var iotAsset = Models.records('Asset')[0];
  var iotSeries = IoT.demoSeries(iotAsset.asset, 24);
  var iotBilling = IoT.billingLines(iotAsset.asset, iotSeries.series, HHS_VALUE, 'latest', { erpQuery: eq });
  must('IOT-GOVERNED', !!iotBilling._governed, 'iot.js billingLines() resolved every C_UOM/M_Product/C_Order match against the REAL rows just inserted (governed, not a throwaway mint)');
  iotBilling.lines.forEach(function (ln) {
    if (Number(scalar(db, 'SELECT COUNT(*) FROM C_OrderLine WHERE C_Order_ID=? AND M_Product_ID=?', [ln.row.c_order_id, ln.row.m_product_id]))) return;
    var lnId = nextId('C_OrderLine', 'C_OrderLine_ID');
    ins(db, 'C_OrderLine', { C_OrderLine_ID: lnId, AD_Client_ID: 11, AD_Org_ID: 0, IsActive: 'Y', Created: NOW,
      CreatedBy: 100, Updated: NOW, UpdatedBy: 100, C_Order_ID: ln.row.c_order_id, Line: ln.row.line,
      Description: ln.sensor.label + ' — latest reading', M_Product_ID: ln.row.m_product_id, M_Warehouse_ID: whId,
      C_UOM_ID: ln.row.c_uom_id, QtyOrdered: ln.row.qtyordered, C_Currency_ID: ln.row.c_currency_id,
      PriceActual: ln.row.priceactual, LineNetAmt: ln.row.linenetamt, C_OrderLine_UU: 'hba-iot-line-' + ln.sensor.key });
    added.iot_orderline++;
  });
  L('§SEED_HBA_IOT_LINES lines=' + iotBilling.lines.length + ' added=' + added.iot_orderline
    + ' cameras(M_Product only)=' + iotBilling.cameras.length);
  must('IOT-PRODUCT-COUNT', Number(scalar(db, "SELECT COUNT(*) FROM M_Product WHERE Value LIKE 'IOT-%-HHS'")) === 12,
    '12 real M_Product rows (6 sensors + 6 cameras) — got ' + scalar(db, "SELECT COUNT(*) FROM M_Product WHERE Value LIKE 'IOT-%-HHS'"));
  var usdRate = IoT.usdRate(eq);
  must('IOT-USD-RATE-REAL', usdRate != null, 'iot.js usdRate() resolved the REAL already-seeded MYR(301)->USD(100) C_Conversion_Rate, not a fabricated one — rate=' + usdRate);
  var lineJoin = rows(db, 'SELECT L.LineNetAmt AS rm, L.C_Currency_ID AS cur FROM C_OrderLine L JOIN C_Order O ON L.C_Order_ID=O.C_Order_ID WHERE O.DocumentNo=?', [iotDocNo]);
  must('IOT-LINES-MYR', lineJoin.length === 6 && lineJoin.every(function (r) { return Number(r.cur) === IoT.MYR_CURRENCY_ID; }),
    'all 6 persisted C_OrderLine rows bill in the real MYR currency row (301) — got ' + lineJoin.length + ' rows');

  // ── write-back + summary ─────────────────────────────────────────────────────────────────────────────────
  var changed = added.warehouse + added.locators + added.bpartners + added.users + added.tables + added.hr_rows
    + added.info + added.attendance + added.retired + added.restype + added.resources + (added.leave || 0)
    + (added.tenant_bp || 0) + (added.subtypes || 0) + (added.subscriptions || 0)
    + added.iot_uom + added.iot_product + added.iot_order + added.iot_orderline;
  if (changed > 0 && fails === 0) { fs.writeFileSync(SEED, Buffer.from(db.export())); L('§SEED_HBA WROTE erp/ad_seed.db (' + changed + ' additions)'); }
  else if (fails === 0) L('§SEED_HBA NO-OP — seed already current (idempotent 2nd run)');
  else L('§SEED_HBA NOT WRITTEN — ' + fails + ' witness failure(s), DB left untouched');
  L('§W-HBA-ERP-SEED ' + (fails === 0 ? 'PASS' : 'FAIL') + ' — summary ' + JSON.stringify(added));
  db.close();
  process.exit(fails === 0 ? 0 : 1);
})();
