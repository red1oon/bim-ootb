// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (the Manufacturing logic is ported from org.idempiere.mfg / Libero, GPLv2)
// ⚠ DO NOT REMOVE — Libero Manufacturing as a LAZY OSGi-style bundle (slice 1). Spec: prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md. Witness: erp/tests/witness_libero_bundle.js (READ THE LOG: §LIBERO lines).
//   Legacy shape: Bundle-ActivationPolicy lazy (activated on the first consumer), IModelFactory (model classes), MFG_Validator (model events), 2Pack menu activation. Here:
//   manifest.activation='lazy' + triggers (window 53009 or any covered PP table) -> manifest.dictionary stages the legacy EE01 menu path at START (inserted IsActive='Y' = the admin activation upstream needs, because EE01 ships
//   disabled) and the hot chunk registers the model classes + MRP validators. Stop removes every contribution (dictionary rows refcounted, registries layered). Tables/columns stay in the base (erp/patches/mfg.sql).
// SLICE 1 covers PP_Order (+BOM explosion) and PP_MRP. Later slices add the cost side (CostEngine, MCostDetail, Doc_PPCostCollector), routing, and the core-table hooks (C_Order, M_Requisition, ...), each extending `triggers`.
// The legacy menu paths 53014 > 53052 > 53053 > 53055 (Manufacturing Order, window 53009) and 53014 > 53074 > 53082 (Standard Costing Management > Cost Collector, window 53014); rows extracted from the reference iDempiere DB (EntityType EE01, IsActive 'N' upstream). Activated here (the 2Pack part of the bundle, staged at START so the lazy
// window trigger is REACHABLE from the menu before any code has run), never typed.
const MENU = [
 {
  "ad_menu_id": 53014,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17 08:49:35",
  "createdby": 0,
  "updated": "2012-08-15 10:10:07",
  "name": "Manufacturing Management",
  "updatedby": 100,
  "description": "Manufacturing",
  "issummary": "Y",
  "issotrx": "N",
  "isreadonly": "N",
  "action": null,
  "ad_window_id": null,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": null,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "N",
  "ad_menu_uu": "68795f8f-d4bc-400d-b949-38d647bddab9",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 },
 {
  "ad_menu_id": 53052,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17 08:52:07",
  "createdby": 0,
  "updated": "2012-08-15 10:05:17",
  "name": "Production Management",
  "updatedby": 100,
  "description": "Production Management",
  "issummary": "Y",
  "issotrx": "N",
  "isreadonly": "N",
  "action": null,
  "ad_window_id": null,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": null,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "N",
  "ad_menu_uu": "7103b051-01d5-45ca-a6eb-4737a04a50e2",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 },
 {
  "ad_menu_id": 53053,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17 08:52:08",
  "createdby": 0,
  "updated": "2012-08-15 10:05:20",
  "name": "Discreet Manufacturing",
  "updatedby": 100,
  "description": null,
  "issummary": "Y",
  "issotrx": "N",
  "isreadonly": "N",
  "action": null,
  "ad_window_id": null,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": null,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "N",
  "ad_menu_uu": "40865741-f2e5-4e35-830e-da5b3804f136",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 },
 {
  "ad_menu_id": 53055,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17 08:52:10",
  "createdby": 0,
  "updated": "2012-08-15 10:12:39",
  "name": "Manufacturing Order",
  "updatedby": 100,
  "description": "Maintain Manufacturing Order",
  "issummary": "N",
  "issotrx": "N",
  "isreadonly": "N",
  "action": "W",
  "ad_window_id": 53009,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": null,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "Y",
  "ad_menu_uu": "0934aef7-c89c-4de8-8534-9e589c0aeb24",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 },
 {
  "ad_menu_id": 53074,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17 08:54:02",
  "createdby": 0,
  "updated": "2012-08-15 10:06:50",
  "name": "Standard Costing Management",
  "updatedby": 100,
  "description": "Standard Costing Management",
  "issummary": "Y",
  "issotrx": "N",
  "isreadonly": "N",
  "action": null,
  "ad_window_id": null,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": null,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "N",
  "ad_menu_uu": "ccd6651f-1a26-4d56-a877-f5cf2ea4cd70",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 },
 {
  "ad_menu_id": 53082,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17 08:54:11",
  "createdby": 0,
  "updated": "2012-08-15 10:07:22",
  "name": "Cost Collector",
  "updatedby": 100,
  "description": "The cost collector is a repository of all the MO transactions.",
  "issummary": "N",
  "issotrx": "N",
  "isreadonly": "N",
  "action": "W",
  "ad_window_id": 53014,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": null,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "Y",
  "ad_menu_uu": "29928756-34e2-4f43-9a53-398187f99151",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 },
 {
  "ad_menu_id": 53059,
  "ad_client_id": 0,
  "ad_org_id": 0,
  "isactive": "N",
  "created": "2007-12-17T08:52:13",
  "createdby": 0,
  "updated": "2012-08-15T10:12:52",
  "name": "Order Receipt & Issue",
  "updatedby": 100,
  "description": "Order Receipt & Issue",
  "issummary": "N",
  "issotrx": "N",
  "isreadonly": "N",
  "action": "X",
  "ad_window_id": null,
  "ad_workflow_id": null,
  "ad_task_id": null,
  "ad_process_id": null,
  "ad_form_id": 53007,
  "ad_workbench_id": null,
  "entitytype": "EE01",
  "iscentrallymaintained": "Y",
  "ad_menu_uu": "b53fee94-05d4-4f50-a47c-c7515666e096",
  "ad_infowindow_id": null,
  "predefinedcontextvariables": null
 }
];


// Home dashboard content (scene "opening screen"): ordinary dictionary rows, no code - the Activities gadget (PA_DocumentStatus -> MDocumentStatus) and the Performance gadget (PA_Goal -> PA_Measure -> PA_MeasureCalc) are
// driven entirely by the dictionary, so a module contributes an indicator and a goal the way legacy 2Pack does. Ids 532xx are this bundle's. The goal is demo content for the GardenWorld client (11), owned by its admin role (102).
const NOW = '2026-10-15 00:00:00';
const STD = { ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };
const DASH_STATUS = [Object.assign({ pa_documentstatus_id: 53201, ad_client_id: 0, name: 'Manufacturing Orders to complete', description: 'Manufacturing orders in Drafted or In Progress', seqno: 70, ad_table_id: 53027,
  whereclause: "PP_Order.DocStatus IN ('DR','IP')", ad_window_id: 53009, entitytype: 'EE01' }, STD)];
const DASH_CALC = [Object.assign({ pa_measurecalc_id: 53201, ad_client_id: 0, name: 'Manufacturing Order Quantity', description: 'Quantity ordered on live manufacturing orders',
  selectclause: 'SELECT COALESCE(SUM(PP_Order.QtyOrdered),0) FROM PP_Order', whereclause: "WHERE PP_Order.DocStatus IN ('DR','IP','CO')", datecolumn: 'PP_Order.DateStartSchedule', orgcolumn: 'PP_Order.AD_Org_ID',
  productcolumn: 'PP_Order.M_Product_ID', ad_table_id: 53027, keycolumn: 'PP_Order.PP_Order_ID', entitytype: 'EE01' }, STD)];
const DASH_MEASURE = [Object.assign({ pa_measure_id: 53201, ad_client_id: 11, name: 'Manufacturing Order Quantity', measuretype: 'C', manualactual: 0, pa_measurecalc_id: 53201, measuredatatype: 'Q' }, STD)];
const DASH_GOAL = [Object.assign({ pa_goal_id: 53201, ad_client_id: 11, seqno: 5, name: 'Manufacturing Output', description: 'Quantity on live manufacturing orders', ad_role_id: 102, pa_colorschema_id: 100, issummary: 'N',
  pa_measure_id: 53201, relativeweight: 1, measuretarget: 20000, measurescope: 0, measuredisplay: 5, measureactual: 0, goalperformance: 0, charttype: 'BC' }, STD)];

// §18/§22 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md): Order Receipt & Issue attached to the Manufacturing Order window THE AD WAY - rows, not code: an AD_Process whose AD_Form_ID is the
//   Libero form (53007) and an AD_ToolBarButton on the Manufacturing Order header tab (53054) that runs it. They ship as this bundle's own 2Pack (libero_2pack/2Pack_1.0.3.zip, the legacy
//   PackOut.xml schema), applied by Pack In at Start after Libero's upstream 1.0.0-1.0.2; the role access comes from MProcess.afterSave (every IsManual='N' role), as in legacy. Rows stay on Stop.
export const manifest = {
  id: 'org.idempiere.mfg',
  name: 'Libero Manufacturing',
  version: '14.0.0-slice1',
  engineVersion: '>=0.9.0',
  requires: {},
  activation: 'lazy',
  triggers: { windows: [53009], tables: ['PP_Order', 'PP_Order_BOM', 'PP_Order_BOMLine', 'PP_MRP', 'PP_Cost_Collector',
    'C_Order', 'C_OrderLine', 'M_Requisition', 'M_RequisitionLine', 'M_Forecast', 'M_ForecastLine', 'M_InOut', 'M_Product'] },   // + the core tables MFG_Validator.initialize registers (:66-115; DD_Order / M_Movement: no DD tables in the base)
  // the bundle's 2Packs (Incremental2PackActivator: META-INF/2Pack_<x.y.z>.zip, applied above the installed version, ascending, each once): Libero's own 1.0.0-1.0.2 (pshepetko @ b2adfea0) + ours
  // the bodies of 2Pack_1.0.0's four CREATE FUNCTION statements (PL/pgSQL there, JS here; §24): bound with the packs, kept while they are installed
  sqlFunctions: './libero_sqlfn.mjs',
  packs: ['libero_2pack/2Pack_1.0.0.zip', 'libero_2pack/2Pack_1.0.1.zip', 'libero_2pack/2Pack_1.0.2.zip', 'libero_2pack/2Pack_1.0.3.zip'],
  // §26 (slice D): the rows of OUR pack declared, not hand-written; erp/tools/gen_2pack.js writes them out as libero_2pack/2Pack_<version>.zip once (pipo_packgen.js -> the Pack Out engine),
  //   then that zip is a released pack like 1.0.0-1.0.2 (immutable: a change = a new version). Inert at runtime: Start applies the zip, never this block. UUs pinned = the rows installed profiles hold.
  provides: { version: '1.0.3', date: '2026-10-16 00:00:00', updateDictionary: true, packsDir: 'libero_2pack',
    description: 'Order Receipt & Issue on the Manufacturing Order toolbar (Kernel ERP twin, bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §18/§22)',
    elements: [
      { key: 'receiptIssueProcess', table: 'AD_Process', uu: '6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01', values: { Value: 'PP_Order_ReceiptIssue', Name: 'Order Receipt & Issue',
        Description: 'Issue the components and receive the finished product of a Manufacturing Order (opens the Order Receipt & Issue form)', IsReport: 'N', AccessLevel: '3', EntityType: 'EE01',
        IsBetaFunctionality: 'N', AllowMultipleExecution: 'Y', AD_Form_ID: { table: 'AD_Form', uu: '77081588-9733-4792-80ae-257638ebc534' } } },
      { key: 'receiptIssueButton', table: 'AD_ToolBarButton', uu: '6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a02', values: { Name: 'Order Receipt & Issue', ComponentName: 'PP_Order_ReceiptIssue', Action: 'W',
        SeqNo: 10, EntityType: 'EE01', AD_Tab_ID: { table: 'AD_Tab', uu: '383f0c8e-ac6a-4ba4-8b2a-5defaa046e7a' }, AD_Process_ID: { ref: 'receiptIssueProcess' } } }] },
  // twin-only staging (the slim twin seed lacks these rows; legacy carries the EE01 menu inactive): refcounted, removed on Stop
  dictionary: [{ table: 'ad_menu', idCol: 'ad_menu_id', rows: MENU.map((r) => Object.assign({}, r, { isactive: 'Y' })) },
    { table: 'pa_documentstatus', idCol: 'pa_documentstatus_id', rows: DASH_STATUS }, { table: 'pa_measurecalc', idCol: 'pa_measurecalc_id', rows: DASH_CALC },
    { table: 'pa_measure', idCol: 'pa_measure_id', rows: DASH_MEASURE }, { table: 'pa_goal', idCol: 'pa_goal_id', rows: DASH_GOAL }],
  chunks: { hot: ['./libero_pporder.mjs', './libero_cost.mjs', './libero_callouts.mjs'] },
  budget: { kb: 14, note: 'slice 1: model classes + MRP validators; the cost side adds ~8k Java lines' }
};

export async function activate() { /* the hot chunk registers the model classes + MRP validators; the dictionary is manifest.dictionary */ }
export async function deactivate() {}
