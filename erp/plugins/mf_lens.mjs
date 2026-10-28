// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — mf_lens.mjs: the MICRO FINANCE LENS (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §42.5, owner 2026-10-28: "we have to use the iDempiere admin client panel just that it's micro finance lens (this is a std feature too in legacy where main screen can be
//   edited to be just the HTML link version"). Witness: W-MF-LENS (erp/tests/witness_mf_lens.js). READ THE LOG: §MFL lines.
// WHAT IT STAGES - TWO DICTIONARY ROWS and no code that draws anything (the Home is legacy's own dashboard, ported in erp/overlay/home.js from org.adempiere.webui.desktop.DashboardController):
//   - ONE PA_DashboardContent row "Micro Finance" of the HTML kind (legacy: the gadget's HTML column is rendered as HTML, DashboardController.asyncRenderComponents :752-784) in the first column, above Activities,
//   - ONE PA_DashboardContent_Access row granting it to the GardenWorld admin role 102 (MDashboardContentAccess.get: a gadget with an active access row is shown only to the roles / users those rows name).
// ITS LINKS are the application's own deep links, the twin's counterpart of the legacy application URL (AdempiereWebUI.processParameters reads the URL's Action / TableName / Record_ID; the twin reads `?window=<AD_Window_ID>` and `?process=<AD_Process_ID>`).
//   A click opens the item through the role's own menu leaf = DefaultDesktop.onMenuSelected(menuId), exactly what legacy's Window / Process gadget buttons do (DashboardController.onEvent :1150-1158). Targets, from the dictionary (erp/ad_seed.db):
//     Customer Invoice            window 167  Sales Invoice and Credit/Debit Note (menu 178)       - the loan is issued as an invoice on an instalment payment term (§40)
//     Recurring                   window 266  Recurring (menu 361)                                  - the renewal template (§40.2 / MF-2)
//     Recurring Run               process 200074 Recurring Run (menu 200092)                        - generates the due invoices
//     Import Payment              window 280  Import Payment (menu 374) - its Process button is AD_Process 343. Process 343 has NO menu leaf of its own in legacy, so legacy reaches it through this window.
//     Tenant Accounting Processor process 53187 Tenant Accounting Processor (menu 53248)            - posts the books
//     Open Items                  process 145 "Open Items (Aging)" (menu 243), AD_Process.Description "Open Items (Invoice and Aging) List": the legacy report over the view RV_OpenItem (OpenAmt, DueDate per invoice / pay schedule line,
//                                 migration/i8.2z/postgresql/202111282319_IDEMPIERE-5059.sql:167). Legacy has no window of open invoices; this report IS its open-items view.
// Start stages both rows (manifest.dictionary through ctx.dict, refcounted); Stop deletes them; the base hash (seed + patches/ad_seed.db.sql + patches/mfg.sql) is untouched. INSTALL_ONLY: installed stopped, the System Administrator starts it (W-PLUGIN-ROLE).
// Id band 9539001-9539999 (no seed row, no other bundle). Line -1: above Activities (Line 0) in column 0 without renumbering the seed's rows, which this bundle must not touch.
const NOW = '2026-10-28 00:00:00';
const CONTENT_ID = 9539001, ACCESS_ID = 9539001, CLIENT = 11, ROLE = 102;
export const LINKS = [
  ['Customer Invoice', '?window=167', 'Sales Invoice and Credit/Debit Note', 'issue the loan as an invoice on an instalment payment term'],
  ['Recurring', '?window=266', 'Recurring', 'the renewal template'],
  ['Recurring Run', '?process=200074', 'Recurring Run', 'generate the invoices that are due'],
  ['Import Payment', '?window=280', 'Import Payment', 'the customers\' payment slips, as the payments table'],
  ['Tenant Accounting Processor', '?process=53187', 'Tenant Accounting Processor', 'post the books'],
  ['Open Items', '?process=145', 'Open Items (Aging)', 'what customers still owe']];
export const HTML = '<p><b>Micro Finance</b> &mdash; customers\' instalments on the GardenWorld books.</p><ul>' +
  LINKS.map((l) => '<li><a href="' + l[1] + '" title="' + l[2] + '">' + l[0] + '</a> &mdash; ' + l[3] + '</li>').join('') + '</ul>';

export const manifest = {
  id: 'org.kernel.mf-lens',
  name: 'Micro Finance lens (home page)',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  dictionary: [
    { table: 'pa_dashboardcontent', idCol: 'pa_dashboardcontent_id', rows: [{
      pa_dashboardcontent_id: CONTENT_ID, ad_client_id: CLIENT, ad_org_id: 0, created: NOW, createdby: 100, updated: NOW, updatedby: 100, isactive: 'Y', name: 'Micro Finance',
      description: 'Customers\' instalments: the windows and processes of the loan, in one place', html: HTML, line: -1, columnno: 0, iscollapsible: 'Y', goaldisplay: 'T',
      pa_dashboardcontent_uu: 'mf-lens-content-9539001', isshowindashboard: 'Y', isembedreportcontent: 'N', iscollapsedbydefault: 'N', ad_user_id: 0, ad_role_id: 0, isshowinlogin: 'Y', isshowtitle: 'Y', ismaximizable: 'N' }] },
    { table: 'pa_dashboardcontent_access', idCol: 'pa_dashboardcontent_access_id', rows: [{
      pa_dashboardcontent_access_id: ACCESS_ID, pa_dashboardcontent_access_uu: 'mf-lens-access-9539001', pa_dashboardcontent_id: CONTENT_ID, ad_client_id: CLIENT, ad_org_id: 0, ad_role_id: ROLE, ad_user_id: null,
      isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 }] }
  ]
};

export async function activate(ctx) { console.log('§MFL-PLUGIN start content=' + CONTENT_ID + ' role=' + ROLE + ' links=' + LINKS.length + ' (dictionary staged by the host, refcounted)'); }
export async function deactivate(ctx) { console.log('§MFL-PLUGIN stop content=' + CONTENT_ID + ' (rows removed by the host)'); }
