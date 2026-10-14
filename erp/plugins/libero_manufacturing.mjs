// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (the Manufacturing logic is ported from org.idempiere.mfg / Libero, GPLv2)
// ⚠ DO NOT REMOVE — Libero Manufacturing as a LAZY OSGi-style bundle (slice 1). Spec: prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md. Witness: erp/tests/witness_libero_bundle.js (READ THE LOG: §LIBERO lines).
//   Legacy shape: Bundle-ActivationPolicy lazy (activated on the first consumer), IModelFactory (model classes), MFG_Validator (model events), 2Pack menu activation. Here:
//   manifest.activation='lazy' + triggers (window 53009 or any covered PP table) -> manifest.dictionary stages the legacy EE01 menu path at START (inserted IsActive='Y' = the admin activation upstream needs, because EE01 ships
//   disabled) and the hot chunk registers the model classes + MRP validators. Stop removes every contribution (dictionary rows refcounted, registries layered). Tables/columns stay in the base (erp/patches/mfg.sql).
// SLICE 1 covers PP_Order (+BOM explosion) and PP_MRP. Later slices add the cost side (CostEngine, MCostDetail, Doc_PPCostCollector), routing, and the core-table hooks (C_Order, M_Requisition, ...), each extending `triggers`.
// The legacy menu path 53014 > 53052 > 53053 > 53055 (window 53009); rows extracted from the reference iDempiere DB (EntityType EE01, IsActive 'N' upstream). Activated here (the 2Pack part of the bundle, staged at START so the lazy
// window trigger is REACHABLE from the menu before any code has run), never typed.
const MENU = [
 {
  "AD_Menu_ID": 53014,
  "AD_Client_ID": 0,
  "AD_Org_ID": 0,
  "IsActive": "Y",
  "Created": "2007-12-17 08:49:35",
  "CreatedBy": 0,
  "Updated": "2012-08-15 10:10:07",
  "Name": "Manufacturing Management",
  "UpdatedBy": 100,
  "Description": "Manufacturing",
  "IsSummary": "Y",
  "IsSOTrx": "N",
  "IsReadOnly": "N",
  "Action": null,
  "AD_Window_ID": null,
  "AD_Workflow_ID": null,
  "AD_Task_ID": null,
  "AD_Process_ID": null,
  "AD_Form_ID": null,
  "AD_Workbench_ID": null,
  "EntityType": "EE01",
  "IsCentrallyMaintained": "N",
  "AD_Menu_UU": "68795f8f-d4bc-400d-b949-38d647bddab9",
  "AD_InfoWindow_ID": null,
  "PredefinedContextVariables": null
 },
 {
  "AD_Menu_ID": 53052,
  "AD_Client_ID": 0,
  "AD_Org_ID": 0,
  "IsActive": "Y",
  "Created": "2007-12-17 08:52:07",
  "CreatedBy": 0,
  "Updated": "2012-08-15 10:05:17",
  "Name": "Production Management",
  "UpdatedBy": 100,
  "Description": "Production Management",
  "IsSummary": "Y",
  "IsSOTrx": "N",
  "IsReadOnly": "N",
  "Action": null,
  "AD_Window_ID": null,
  "AD_Workflow_ID": null,
  "AD_Task_ID": null,
  "AD_Process_ID": null,
  "AD_Form_ID": null,
  "AD_Workbench_ID": null,
  "EntityType": "EE01",
  "IsCentrallyMaintained": "N",
  "AD_Menu_UU": "7103b051-01d5-45ca-a6eb-4737a04a50e2",
  "AD_InfoWindow_ID": null,
  "PredefinedContextVariables": null
 },
 {
  "AD_Menu_ID": 53053,
  "AD_Client_ID": 0,
  "AD_Org_ID": 0,
  "IsActive": "Y",
  "Created": "2007-12-17 08:52:08",
  "CreatedBy": 0,
  "Updated": "2012-08-15 10:05:20",
  "Name": "Discreet Manufacturing",
  "UpdatedBy": 100,
  "Description": null,
  "IsSummary": "Y",
  "IsSOTrx": "N",
  "IsReadOnly": "N",
  "Action": null,
  "AD_Window_ID": null,
  "AD_Workflow_ID": null,
  "AD_Task_ID": null,
  "AD_Process_ID": null,
  "AD_Form_ID": null,
  "AD_Workbench_ID": null,
  "EntityType": "EE01",
  "IsCentrallyMaintained": "N",
  "AD_Menu_UU": "40865741-f2e5-4e35-830e-da5b3804f136",
  "AD_InfoWindow_ID": null,
  "PredefinedContextVariables": null
 },
 {
  "AD_Menu_ID": 53055,
  "AD_Client_ID": 0,
  "AD_Org_ID": 0,
  "IsActive": "Y",
  "Created": "2007-12-17 08:52:10",
  "CreatedBy": 0,
  "Updated": "2012-08-15 10:12:39",
  "Name": "Manufacturing Order",
  "UpdatedBy": 100,
  "Description": "Maintain Manufacturing Order",
  "IsSummary": "N",
  "IsSOTrx": "N",
  "IsReadOnly": "N",
  "Action": "W",
  "AD_Window_ID": 53009,
  "AD_Workflow_ID": null,
  "AD_Task_ID": null,
  "AD_Process_ID": null,
  "AD_Form_ID": null,
  "AD_Workbench_ID": null,
  "EntityType": "EE01",
  "IsCentrallyMaintained": "Y",
  "AD_Menu_UU": "0934aef7-c89c-4de8-8534-9e589c0aeb24",
  "AD_InfoWindow_ID": null,
  "PredefinedContextVariables": null
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

export const manifest = {
  id: 'org.idempiere.mfg',
  name: 'Libero Manufacturing',
  version: '14.0.0-slice1',
  engineVersion: '>=0.9.0',
  requires: {},
  activation: 'lazy',
  triggers: { windows: [53009], tables: ['PP_Order', 'PP_Order_BOM', 'PP_Order_BOMLine', 'PP_MRP', 'PP_Cost_Collector'] },
  dictionary: [{ table: 'ad_menu', idCol: 'ad_menu_id', rows: MENU.map((r) => Object.assign({}, r, { isactive: 'Y' })) },
    { table: 'pa_documentstatus', idCol: 'pa_documentstatus_id', rows: DASH_STATUS }, { table: 'pa_measurecalc', idCol: 'pa_measurecalc_id', rows: DASH_CALC },
    { table: 'pa_measure', idCol: 'pa_measure_id', rows: DASH_MEASURE }, { table: 'pa_goal', idCol: 'pa_goal_id', rows: DASH_GOAL }],
  chunks: { hot: ['./libero_pporder.mjs', './libero_cost.mjs'] },
  budget: { kb: 14, note: 'slice 1: model classes + MRP validators; the cost side adds ~8k Java lines' }
};

export async function activate() { /* the hot chunk registers the model classes + MRP validators; the dictionary is manifest.dictionary */ }
export async function deactivate() {}
