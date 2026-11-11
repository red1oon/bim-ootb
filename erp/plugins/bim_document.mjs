// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bim_document.mjs: the BIM Document core plugin (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC .. §BIMDOC-5, §BIMDOC-FILM).
// Witness: W-BIMDOC (erp/tests/witness_bimdoc_live.js). READ THE LOG: §BIMDOC lines (erp/tests/witness_bimdoc_live.log + .page.log).
// WHAT IT IS: one deliverable (a sheet, a model file) under a project task, its own table BIM_Document, DocStatus/DocAction on the common framework (ad_docfsm DOC_FAMILY,
//   the same machine every walked document uses), states = what a firm prints: Draft -> Issued for review -> Issued for construction, and Superseded (DocStatus RE, the
//   Reversal_ID pattern of M_InOut) set on the older revision when a newer revision of the same deliverable is completed. NO second state engine, NO host code for this table
//   (AD-LAYER LAW): everything below is DICTIONARY DATA (manifest.dictionary, staged by the host, refcounted, removed on Stop) plus the DocAction CLASS and one process CLASS. NO lens (§BIMDOC-ADPASS).
// WHAT IT STAGES: AD_Table BIM_Document (+ the physical table, created IF NOT EXISTS), its columns, AD_Window "BIM Document" (own menu leaf under Project Management), a "BIM Document"
//   tab under Project Task in the Project window (so a project shows its deliverables), reference lists (discipline, file kind, the four issue states), document type "BIM Document"
//   (DocBaseType BIM, one per client that has Project Issue), window access = the roles that can open the Project window.
// PROGRESS IS COMPUTED, never stored (§BIMDOC-4 point 5, §BIMDOC-5 b, §BIMDOC-ADPASS): VIRTUAL AD_Column rows (ColumnSQL) on C_ProjectTask and C_ProjectPhase, shown in the Project window's
//   Task and Phase grids: deliverables, issued for construction, earned hours (hours budget x credit, credit 1 at CO), and on the task the hours booked (S_TimeExpenseLine.Qty).
//   A deliverable = (project, deliverable no); its state is that of its latest revision; a Superseded revision is not a deliverable of its own. Phase completion stays MANUAL.
// OPEN IN MODELLER / VIEWER (§BIMDOC-OPEN, §BIMDOC-ADPASS): AD_Process 'BIM_Document_Open' behind the Button column OpenInApp (IsToolbarButton Y = under the gear, as C_ProjectPhase.GenerateOrder).
//   The file kind of the row -> the app comes from the Description of its 'BIM File Kind' list row (data); the entry's bytes go into the shared file store (generic AdAttachment.promote,
//   phase 2) and the app is opened at <app>?open=store:<sha256>&name=<file>. No table is named in the host.
// CHAIN (film beat 10): completing a deliverable logs the project's issued count before and after (§BIMDOC-CHAIN).
// Id band 9541001-9541999 (no seed row, no other bundle).
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const T_ID = 9541001, W_ID = 9541001, TAB_OWN = 9541001, TAB_PRJ = 9541002, TAB_PRJ1 = 9541003, MENU_ID = 9541001, TREE = 10, MENU_PARENT = 160, PRJ_WIN = 130, PRJ_AFTER_TAB = 796;
const R_STATUS = 9541001, R_DISC = 9541002, R_KIND = 9541003, R_REV = 9541004;
const COL0 = 9541201, FLD_OWN0 = 9541301, FLD_PRJ0 = 9541401, FLD_PRJ1_0 = 9541601, LIST0 = 9541101, DT0 = 9541500;
const P_EXPORT = 9541002, P_EXPORT_CLASS = 'org.kernel.bim.process.BIMDocumentRegisterExport';   // §REGISTER-EXPORT (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md)
const P_OPEN = 9541001, P_OPEN_CLASS = 'org.kernel.bim.process.BIMDocumentOpen', VCOL0 = 9541251, VFLD0 = 9541451, T_TASK = 584, T_PHASE = 576, TAB_TASK = 490, TAB_PHASE = 478;
export const TABLE = 'BIM_Document';

// the four issue states, as a firm prints them in a title block (§BIMDOC-3); the codes are the framework's own (DR/IP/CO/RE) so the FSM and the status machinery are the common ones
export const STATES = [['DR', 'Draft'], ['IP', 'Issued for review'], ['CO', 'Issued for construction'], ['RE', 'Superseded']];
export const DISCIPLINES = [['ARC', 'Architecture'], ['STR', 'Structure'], ['MEP', 'Mechanical, Electrical and Plumbing'], ['ELE', 'Electrical'], ['FPR', 'Fire Protection'], ['CIV', 'Civil']];
// file kind -> the app that opens it. The mapping is DATA: the Description of each AD_Ref_List row of 'BIM File Kind' names the app page (relative to the app root); a kind with no description opens nowhere.
//   The Viewer takes IFC only; the Modeller takes IFC, DB and DXF (BIMDOC_OPEN_FILE_STORE.md §3). A row removed from the dictionary stops the action (§BIMDOC-OPEN REFUSED).
export const FILE_KINDS = [['DXF', 'DXF drawing', 'modeller/modeller.html'], ['IFC', 'IFC model', 'viewer/viewer.html'], ['PDF', 'PDF sheet', null]];
// the family flags of ad_docfsm.DOC_FAMILY: prepare/complete only; every other arm is not offered (allow), the labels are the firm's words for the same codes
export const FAMILY = { name: 'BIM_Document', reActivate: false, rc: false, ra: false, vo: {},
  allow: { DR: ['PR', 'CO'], IN: ['PR'], IP: ['CO'], CO: [], RE: [] },
  labels: { status: { DR: 'Draft', IP: 'Issued for review', IN: 'Invalid', CO: 'Issued for construction', RE: 'Superseded' }, action: { PR: 'Issue for review', CO: 'Issue for construction' } } };

// ── columns: [name, label, ref, refValue, len, mandatory, default, flags, showOwn, showPrj, gridOwn, gridPrj] ; flags: K key, P parent link, R read-only field, I identifier, B toolbar button
//   gridOwn/gridPrj = AD_Field.SeqNoGrid on the own tab / the Project sub-tab (0 = IsDisplayedGrid N), as legacy's dictionary carries it (§BIMDOC-ADPASS step 2, FB2)
const C = (n, l, ref, rv, len, m, def, fl, so, sp, go, gp) => ({ n, l, ref, rv, len, m, def, fl: fl || '', so: so !== false, sp: sp !== false, go: go || 0, gp: gp || 0 });
const COLS = [
  C('BIM_Document_ID', 'BIM Document', 13, null, 22, 'Y', null, 'K', false, false),
  C('AD_Client_ID', 'Client', 19, null, 22, 'Y', '@AD_Client_ID@', '', false, false),
  C('AD_Org_ID', 'Organization', 19, null, 22, 'Y', '@AD_Org_ID@', '', true, false),
  C('IsActive', 'Active', 20, null, 1, 'Y', 'Y', '', false, false),
  C('Created', 'Created', 16, null, 7, 'Y', 'SYSDATE', '', false, false),
  C('CreatedBy', 'Created By', 30, 110, 22, 'Y', null, '', false, false),
  C('Updated', 'Updated', 16, null, 7, 'Y', 'SYSDATE', '', false, false),
  C('UpdatedBy', 'Updated By', 30, 110, 22, 'Y', null, '', false, false),
  C('BIM_Document_UU', 'BIM_Document_UU', 10, null, 36, 'N', null, '', false, false),
  C('C_DocType_ID', 'Document Type', 18, 170, 22, 'Y', "@SQL=SELECT C_DocType_ID FROM C_DocType WHERE DocBaseType='BIM' AND AD_Client_ID=@#AD_Client_ID@ AND IsActive='Y' ORDER BY C_DocType_ID", 'R', true, false),
  C('C_Project_ID', 'Project', 19, null, 22, 'Y', null, 'P', true, false),
  C('C_ProjectPhase_ID', 'Project Phase', 19, null, 22, 'N', null, '', true, false),
  C('C_ProjectTask_ID', 'Project Task', 19, null, 22, 'Y', null, 'P', true, false, 80, 0),
  C('DeliverableNo', 'Deliverable No', 10, null, 30, 'Y', null, '', true, true, 10, 10),
  C('Revision', 'Revision', 11, null, 22, 'Y', '1', '', true, true, 20, 20),
  C('Name', 'Title', 10, null, 255, 'Y', null, 'I', true, true, 30, 30),
  C('Discipline', 'Discipline', 17, R_DISC, 3, 'N', null, '', true, true, 40, 40),
  C('FileKind', 'File Kind', 17, R_KIND, 3, 'N', null, '', true, true, 50, 50),
  C('HoursBudget', 'Hours Budget', 29, null, 22, 'N', '0', '', true, true, 60, 60),
  C('DocStatus', 'Document Status', 17, R_STATUS, 2, 'Y', 'DR', 'R', true, true, 70, 70),
  C('DocAction', 'Document Action', 28, 135, 2, 'Y', 'CO', '', true, true),
  C('Processed', 'Processed', 20, null, 1, 'Y', 'N', 'R', true, false),
  C('Reversal_ID', 'Superseded By', 30, R_REV, 22, 'N', null, 'R', true, true),
  C('OpenInApp', 'Open in Modeller / Viewer', 28, null, 1, 'N', null, 'B', true, true),
  C('ExportRegister', 'Export Register (JSON)', 28, null, 1, 'N', null, 'B', true, true)
];
const BTN_PROCESS = { OpenInApp: P_OPEN, ExportRegister: P_EXPORT };   // a Button column -> its AD_Process (gear only: IsToolbarButton Y)
const colId = (n) => COL0 + COLS.findIndex((c) => c.n === n);
const NUMERIC_REFS = { 11: 1, 12: 1, 13: 1, 18: 1, 19: 1, 29: 1, 30: 1 };
const lc = (s) => s.toLowerCase();

const refRows = [[R_STATUS, 'BIM Document Status', 'The four states a firm prints in a title block (framework codes DR/IP/CO/RE)'], [R_DISC, 'BIM Discipline', 'Discipline of a deliverable'], [R_KIND, 'BIM File Kind', 'Kind of the file a deliverable carries']]
  .map((r) => Object.assign({ ad_reference_id: r[0], name: r[1], description: r[2], validationtype: 'L', isorderbyvalue: 'N' }, STD));
const lists = []; let li = LIST0;
[[R_STATUS, STATES], [R_DISC, DISCIPLINES], [R_KIND, FILE_KINDS]].forEach(([rid, vs]) => vs.forEach(([v, n, d]) => lists.push(Object.assign({ ad_ref_list_id: li++, ad_reference_id: rid, value: v, name: n, description: d || null }, STD))));
lists.push(Object.assign({ ad_ref_list_id: li++, ad_reference_id: 183, value: 'BIM', name: 'BIM Document', description: null }, STD));   // C_DocType.DocBaseType
refRows.push(Object.assign({ ad_reference_id: R_REV, name: 'BIM Document Reversal', description: 'The revision that superseded this one (the Reversal_ID pattern)', validationtype: 'T', isorderbyvalue: 'N' }, STD));
const refTable = Object.assign({ ad_reference_id: R_REV, ad_table_id: T_ID, ad_key: colId('BIM_Document_ID'), ad_display: colId('Name'), isvaluedisplayed: 'N', ad_ref_table_uu: 'bimdoc-reftable-' + R_REV }, STD);

const table = Object.assign({ ad_table_id: T_ID, name: 'BIM Document', description: 'One deliverable (a sheet or a model file) under a project task', tablename: TABLE, isview: 'N', accesslevel: '3',
  ad_window_id: W_ID, isdeleteable: 'Y', ishighvolume: 'N', ischangelog: 'N', replicationtype: 'L', iscentrallymaintained: 'Y', ad_table_uu: 'bimdoc-table-' + T_ID }, STD);
const columns = COLS.map((c, i) => Object.assign({ ad_column_id: COL0 + i, ad_table_id: T_ID, columnname: c.n, name: c.l, description: null, ad_reference_id: c.ref, ad_reference_value_id: c.rv, fieldlength: c.len,
  defaultvalue: c.def, iskey: c.fl.indexOf('K') >= 0 ? 'Y' : 'N', isparent: c.fl.indexOf('P') >= 0 ? 'Y' : 'N', ismandatory: c.m, isupdateable: c.fl.indexOf('K') >= 0 ? 'N' : 'Y',
  isidentifier: c.fl.indexOf('I') >= 0 || c.fl.indexOf('K') >= 0 ? 'Y' : 'N', seqno: c.fl.indexOf('I') >= 0 ? 1 : 0, istranslated: 'N', isencrypted: 'N', isselectioncolumn: c.n === 'DeliverableNo' || c.n === 'Name' ? 'Y' : 'N',
  issyncdatabase: 'N', isalwaysupdateable: 'N', isallowlogging: 'Y', isallowcopy: 'Y', ad_column_uu: 'bimdoc-col-' + (COL0 + i), version: 0,
  ad_process_id: c.fl.indexOf('B') >= 0 ? (BTN_PROCESS[c.n] || null) : null, istoolbarbutton: c.fl.indexOf('B') >= 0 ? 'Y' : 'N' }, STD));
const window_ = Object.assign({ ad_window_id: W_ID, name: 'BIM Document', description: 'The deliverables of a project: sheets and model files, issued in the firm\'s own states', windowtype: 'M', issotrx: 'Y', isdefault: 'N', ad_window_uu: 'bimdoc-window-' + W_ID }, STD);
const tabOwn = Object.assign({ ad_tab_id: TAB_OWN, ad_window_id: W_ID, name: 'BIM Document', description: 'BIM Document', ad_table_id: T_ID, seqno: 10, tablevel: 0, issinglerow: 'Y', isinfotab: 'N', istranslationtab: 'N', isreadonly: 'N',
  hastree: 'N', issorttab: 'N', isinsertrecord: 'Y', isadvancedtab: 'N', ad_tab_uu: 'bimdoc-tab-' + TAB_OWN, orderbyclause: 'DeliverableNo, Revision' }, STD);
const tabPrj = Object.assign({}, tabOwn, { ad_tab_id: TAB_PRJ, ad_window_id: PRJ_WIN, seqno: 45, tablevel: 3, issinglerow: 'N', ad_tab_uu: 'bimdoc-tab-' + TAB_PRJ });
// §BIMDOC-PROJTAB: the level-1 Project tab (parent link C_Project_ID, seq 17) shows every deliverable of the project at every revision; unlike the Task-level tab it must OFFER the
//   phase and task (C_ProjectTask_ID stays mandatory: the DocAction refuses a deliverable with no task), so those two columns are displayed here, first in the grid.
const tabPrj1 = Object.assign({}, tabOwn, { ad_tab_id: TAB_PRJ1, ad_window_id: PRJ_WIN, name: 'BIM Document (Project)', seqno: 17, tablevel: 1, issinglerow: 'N', ad_tab_uu: 'bimdoc-tab-' + TAB_PRJ1 });
const PRJ1_SHOW = { C_ProjectPhase_ID: 5, C_ProjectTask_ID: 8 };
const fieldRowsPrj1 = () => COLS.map((c, i) => ({ c, i })).filter(({ c }) => c.fl.indexOf('K') >= 0 || c.sp || PRJ1_SHOW[c.n]).map(({ c, i }, k) => Object.assign({ ad_field_id: FLD_PRJ1_0 + i, ad_tab_id: TAB_PRJ1, ad_column_id: COL0 + i,
  name: c.l, iscentrallymaintained: 'Y', isdisplayed: c.fl.indexOf('K') >= 0 ? 'N' : 'Y', isreadonly: c.fl.indexOf('R') >= 0 ? 'Y' : 'N', seqno: (k + 1) * 10, issameline: 'N', isheading: 'N', isfieldonly: 'N', isencrypted: 'N', ad_field_uu: 'bimdoc-fld-' + (FLD_PRJ1_0 + i),
  isdisplayedgrid: (c.gp || PRJ1_SHOW[c.n]) ? 'Y' : 'N', seqnogrid: PRJ1_SHOW[c.n] || c.gp }, STD));
const fieldRows = (tabId, f0, own) => COLS.map((c, i) => ({ c, i })).filter(({ c }) => c.fl.indexOf('K') >= 0 || (own ? c.so : c.sp)).map(({ c, i }, k) => Object.assign({ ad_field_id: f0 + i, ad_tab_id: tabId, ad_column_id: COL0 + i,
  name: c.l, iscentrallymaintained: 'Y', isdisplayed: c.fl.indexOf('K') >= 0 ? 'N' : 'Y', isreadonly: c.fl.indexOf('R') >= 0 ? 'Y' : 'N', seqno: (k + 1) * 10, issameline: 'N', isheading: 'N', isfieldonly: 'N', isencrypted: 'N', ad_field_uu: 'bimdoc-fld-' + (f0 + i),
  isdisplayedgrid: (own ? c.go : c.gp) ? 'Y' : 'N', seqnogrid: own ? c.go : c.gp }, STD));
// ── PROGRESS as VIRTUAL columns (§BIMDOC-ADPASS step 1): ColumnSQL on C_ProjectTask / C_ProjectPhase, plain correlated SQL (PostgreSQL and SQLite). LATEST = no other active row of the
//   same (project, deliverable no) with a higher revision, or the same revision and a higher id: the rule computeProgress applies.
const LATEST = "COALESCE(d.IsActive,'Y')<>'N' AND NOT EXISTS (SELECT 1 FROM BIM_Document n WHERE n.C_Project_ID=d.C_Project_ID AND n.DeliverableNo=d.DeliverableNo AND COALESCE(n.IsActive,'Y')<>'N'" +
  ' AND (n.Revision>d.Revision OR (n.Revision=d.Revision AND n.BIM_Document_ID>d.BIM_Document_ID)))';
const of = (tn, link) => 'FROM BIM_Document d WHERE d.' + link + '=' + tn + '.' + link + ' AND ' + LATEST;
const VSQL = (tn, link) => ({
  BIM_Deliverables: '(SELECT COUNT(*) ' + of(tn, link) + ')',
  BIM_Issued: "(SELECT COUNT(*) " + of(tn, link) + " AND d.DocStatus='CO')",
  BIM_EarnedHours: "(SELECT COALESCE(SUM(d.HoursBudget),0) " + of(tn, link) + " AND d.DocStatus='CO')" });
const VCOLS = [[T_TASK, 'C_ProjectTask', 'C_ProjectTask_ID', TAB_TASK], [T_PHASE, 'C_ProjectPhase', 'C_ProjectPhase_ID', TAB_PHASE]].flatMap(([tid, tn, link, tab]) => {
  const v = VSQL(tn, link), out = [['BIM_Deliverables', 'BIM Deliverables', 11, v.BIM_Deliverables], ['BIM_Issued', 'BIM Issued for Construction', 11, v.BIM_Issued], ['BIM_EarnedHours', 'BIM Earned Hours', 29, v.BIM_EarnedHours]];
  if (tid === T_TASK) out.push(['BIM_HoursBooked', 'BIM Hours Booked', 29, "(SELECT COALESCE(SUM(l.Qty),0) FROM S_TimeExpenseLine l WHERE l.C_ProjectTask_ID=C_ProjectTask.C_ProjectTask_ID AND COALESCE(l.IsActive,'Y')<>'N')"]);
  return out.map((c) => ({ tid, tn, tab, n: c[0], l: c[1], ref: c[2], sql: c[3] }));
});
export const VIRTUAL = VCOLS.map((c) => ({ table: c.tn, column: c.n, tab: c.tab, sql: c.sql }));
const vcolumns = VCOLS.map((c, i) => Object.assign({ ad_column_id: VCOL0 + i, ad_table_id: c.tid, columnname: c.n, name: c.l, description: 'Computed from the BIM Documents under it, never stored (§BIMDOC-4 point 5)',
  ad_reference_id: c.ref, ad_reference_value_id: null, fieldlength: 22, defaultvalue: null, iskey: 'N', isparent: 'N', ismandatory: 'N', isupdateable: 'N', isidentifier: 'N', seqno: 0, istranslated: 'N',
  isencrypted: 'N', isselectioncolumn: 'N', issyncdatabase: 'N', isalwaysupdateable: 'N', isallowlogging: 'N', isallowcopy: 'N', columnsql: c.sql, ad_column_uu: 'bimdoc-vcol-' + (VCOL0 + i), version: 0,
  ad_process_id: null, istoolbarbutton: 'N' }, STD));
const vfields = VCOLS.map((c, i) => Object.assign({ ad_field_id: VFLD0 + i, ad_tab_id: c.tab, ad_column_id: VCOL0 + i, name: c.l, iscentrallymaintained: 'Y', isdisplayed: 'Y', isreadonly: 'Y',
  seqno: 900 + i * 10, issameline: 'N', isheading: 'N', isfieldonly: 'N', isencrypted: 'N', ad_field_uu: 'bimdoc-vfld-' + (VFLD0 + i), isdisplayedgrid: 'Y', seqnogrid: 900 + i * 10 }, STD));
const procOpen = Object.assign({ ad_process_id: P_OPEN, value: 'BIM_Document_Open', name: 'Open in Modeller / Viewer', description: 'Open the attached file of this BIM Document in the app its file kind names',
  help: 'The file kind of the document names the app (the Description of its BIM File Kind list row). The attached file of that kind is put in the browser file store and the app opens it by its sha256.',
  accesslevel: '3', isreport: 'N', isdirectprint: 'N', classname: P_OPEN_CLASS, statistic_count: 0, statistic_seconds: 0, isbetafunctionality: 'N', isserverprocess: 'N', showhelp: 'N', allowmultipleexecution: 'N',
  ad_process_uu: 'bimdoc-process-' + P_OPEN }, STD);
const procExport = Object.assign({}, procOpen, { ad_process_id: P_EXPORT, value: 'BIM_Document_Register_Export', name: 'Export Register (JSON)', description: 'The BIM Document register of this document\'s project as a JSON file',
  help: 'Every deliverable of the project at its latest revision, plus the superseded revisions: no, rev, status, discipline, filekind, sha256 of the attached file, name. Read only.',
  classname: P_EXPORT_CLASS, ad_process_uu: 'bimdoc-process-' + P_EXPORT });
const menu = Object.assign({ ad_menu_id: MENU_ID, name: 'BIM Document', description: 'The deliverables of a project', issummary: 'N', issotrx: 'Y', isreadonly: 'N', action: 'W', ad_window_id: W_ID, iscentrallymaintained: 'Y', ad_menu_uu: 'bimdoc-menu-' + MENU_ID }, STD);
const node = { ad_tree_id: TREE, node_id: MENU_ID, parent_id: MENU_PARENT, seqno: 4, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };

export const manifest = {
  id: 'org.kernel.bim-document',
  name: 'BIM Document (project deliverables)',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  dictionary: [
    { table: 'ad_reference', idCol: 'ad_reference_id', rows: refRows },
    { table: 'ad_ref_list', idCol: 'ad_ref_list_id', rows: lists },
    { table: 'ad_ref_table', idCol: 'ad_ref_table_uu', rows: [refTable] },
    { table: 'ad_process', idCol: 'ad_process_id', rows: [procOpen, procExport] },
    { table: 'ad_table', idCol: 'ad_table_id', rows: [table] },
    { table: 'ad_column', idCol: 'ad_column_id', rows: columns.concat(vcolumns) },
    { table: 'ad_window', idCol: 'ad_window_id', rows: [window_] },
    { table: 'ad_tab', idCol: 'ad_tab_id', rows: [tabOwn, tabPrj, tabPrj1] },
    { table: 'ad_field', idCol: 'ad_field_id', rows: fieldRows(TAB_OWN, FLD_OWN0, true).concat(fieldRows(TAB_PRJ, FLD_PRJ0, false), fieldRowsPrj1(), vfields) },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [node] }
  ]
};

// ── PROGRESS: pure, over rows (lower-case keys) of bim_document. Computed on every call, stored nowhere. ──
export function computeProgress(rows) {
  const num = (v) => (v == null || v === '' ? 0 : Number(v));
  const latest = {};                                                        // one deliverable = (project, deliverable no); its state is its latest revision's
  rows.filter((r) => r.isactive !== 'N').forEach((r) => {
    const k = r.c_project_id + '|' + r.deliverableno, cur = latest[k];
    if (!cur || num(r.revision) > num(cur.revision) || (num(r.revision) === num(cur.revision) && num(r.bim_document_id) > num(cur.bim_document_id))) latest[k] = r;
  });
  const add = (m, key, d) => {
    if (key == null || key === '') return;
    const x = m[key] || (m[key] = { total: 0, issued: 0, budget: 0, earned: 0, pct: 0 });
    x.total++; x.budget += num(d.hoursbudget); if (d.docstatus === 'CO') { x.issued++; x.earned += num(d.hoursbudget) * 1; }
    x.pct = x.total ? Math.round((1000 * x.issued) / x.total) / 10 : 0;
  };
  const byTask = {}, byPhase = {}, byProject = {};
  Object.keys(latest).forEach((k) => { const d = latest[k]; add(byTask, d.c_projecttask_id, d); add(byPhase, d.c_projectphase_id, d); add(byProject, d.c_project_id, d); });
  return { byTask, byPhase, byProject, deliverables: Object.keys(latest).length };
}

// ── the DocAction class (registered for the table; ModelLayer.processIt drives it) ──
const same = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
const siblings = (trx, doc) => trx.find('bim_document', { c_project_id: doc.c_project_id, deliverableno: doc.deliverableno }).filter((o) => !same(o.bim_document_id, doc.bim_document_id) && o.isactive !== 'N');
export const docAction = {
  prepareIt(trx, doc) {
    trx._msg = null;
    if (!String(doc.deliverableno || '').trim() || !String(doc.name || '').trim()) { trx._msg = 'A deliverable needs its number and its title'; return 'IN'; }
    if (doc.c_projecttask_id == null || doc.c_projecttask_id === '') { trx._msg = 'A deliverable hangs under a project task'; return 'IN'; }
    const newer = siblings(trx, doc).filter((o) => o.docstatus === 'CO' && Number(o.revision) >= Number(doc.revision));
    if (newer.length) { trx._msg = 'Revision ' + newer[0].revision + ' of ' + doc.deliverableno + ' is already Issued for construction'; return 'IN'; }
    return 'IP';
  },
  completeIt(trx, doc) {
    const older = siblings(trx, doc).filter((o) => (o.docstatus === 'CO' || o.docstatus === 'IP') && Number(o.revision) < Number(doc.revision));
    const proj = trx.find('bim_document', { c_project_id: doc.c_project_id }), issuedOf = (rows) => { const p = computeProgress(rows).byProject[doc.c_project_id]; return p ? p.issued : 0; };
    const before = issuedOf(proj), olderIds = older.map((o) => String(o.bim_document_id));
    const after = issuedOf(proj.map((r) => (same(r.bim_document_id, doc.bim_document_id) ? Object.assign({}, r, { docstatus: 'CO' }) : olderIds.indexOf(String(r.bim_document_id)) >= 0 ? Object.assign({}, r, { docstatus: 'RE' }) : r)));
    older.forEach((o) => {
      trx.update('bim_document', o, { docstatus: 'RE', reversal_id: doc.bim_document_id, processed: 'Y', docaction: '--' });
      trx.say('§BIMDOC-SUPERSEDE deliverable=' + doc.deliverableno + ' old=' + o.bim_document_id + '(rev ' + o.revision + ') by=' + doc.bim_document_id + '(rev ' + doc.revision + ') old.docstatus=RE reversal_id=' + doc.bim_document_id);
    });
    trx.update('bim_document', doc, { processed: 'Y', docaction: '--' });
    trx.say('§BIMDOC-ISSUED id=' + doc.bim_document_id + ' deliverable=' + doc.deliverableno + ' rev=' + doc.revision + ' status=CO superseded=' + older.length);
    trx.say('§BIMDOC-CHAIN project=' + doc.c_project_id + ' deliverable=' + doc.deliverableno + ' issued-before=' + before + ' issued-after=' + after + ' delta=' + (after - before) + ' deliverables=' + computeProgress(proj).byProject[doc.c_project_id].total);
    return 'CO';
  }
};

// ── activate: the physical table, the rows that depend on who is in the database (doc types, window + process access), the DocAction class + FSM family, the Open process class ──
// "Open in Modeller / Viewer" (AD_Process P_OPEN, §BIMDOC-ADPASS): doIt refuses at once what legacy would (no document, no file kind, no app for the kind, no attachment) by THROWING the reason,
//   then reads the attachment entry of that kind, puts its bytes in the file store and opens <app>?open=store:<sha256>&name=<file> (async: unzip + hash). The attachment module is the
//   generic one, reached through the host's window.__idmpAttach seam (the same _attLoad/_attHost the window uses).
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
function refuseOpen(id, why) { console.log('§BIMDOC-OPEN REFUSED id=' + id + ' reason=' + why); throw new Error('Open: ' + why); }
function openChecks(q, id) {   // q(sql) -> rows; everything here is a dictionary or a record read
  const row = q('SELECT bim_document_id, filekind, deliverableno, bim_document_uu FROM bim_document WHERE bim_document_id=' + Number(id))[0];
  if (!row) refuseOpen(id, 'no-document');
  const kind = row.filekind;
  if (!kind) refuseOpen(id, 'no-file-kind');
  const app = q('SELECT description AS d FROM ad_ref_list WHERE ad_reference_id=' + R_KIND + ' AND value=' + lit(kind) + " AND isactive='Y'")[0];
  if (!app || !app.d) refuseOpen(id, 'no-app-for-kind kind=' + kind);
  const cx = { tableId: T_ID, tableName: TABLE, recordId: Number(id), recordUU: row.bim_document_uu ? String(row.bim_document_uu) : null };
  return { row, kind, app: app.d, cx };
}
// §REGISTER-EXPORT: the register of the document's project, read through the caller's reader (the process transaction = the tip). Latest revision of each deliverable
//   (the LATEST rule of the progress columns) plus every superseded row (DocStatus RE). Order: no, then rev.
export function registerRows(q, id) {
  const doc = q('SELECT c_project_id AS p FROM bim_document WHERE bim_document_id=' + Number(id))[0];
  if (!doc || doc.p == null) throw new Error('Export Register: the document has no project');
  const pv = q('SELECT value AS v FROM c_project WHERE c_project_id=' + Number(doc.p))[0];
  const all = q("SELECT bim_document_id AS id, deliverableno AS no, revision AS rev, docstatus AS status, discipline, filekind, name, bim_document_uu AS uu FROM bim_document d WHERE d.c_project_id=" + Number(doc.p) + " AND COALESCE(d.isactive,'Y')<>'N'");
  const latestOf = (r) => !all.some((n) => String(n.no) === String(r.no) && (Number(n.rev) > Number(r.rev) || (Number(n.rev) === Number(r.rev) && Number(n.id) > Number(r.id))));
  const rows = all.filter((r) => latestOf(r) || r.status === 'RE').map((r) => ({ id: Number(r.id), uu: r.uu || null, no: r.no, rev: Number(r.rev), status: r.status, discipline: r.discipline || null, filekind: r.filekind || null, sha256: null, name: r.name || null, latest: latestOf(r) }));
  rows.sort((a, b) => String(a.no).localeCompare(String(b.no)) || a.rev - b.rev || a.id - b.id);
  return { projectId: Number(doc.p), projectValue: pv ? pv.v : null, rows, latest: rows.filter((r) => r.latest).length, superseded: rows.filter((r) => r.status === 'RE').length };
}
// the attached file's own digest, per row: the stored entry's sha256, else the SHA-256 of the entry's bytes; nothing attached (or no entry of the row's kind) -> null, never invented. Read only: nothing is promoted.
async function registerDigests(rows) {
  const A = globalThis.__idmpAttach, AT = A ? await A.load() : null, host = A ? A.host() : null;
  if (!AT) return rows;
  const hex = async (bytes) => Array.prototype.map.call(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) => ('0' + x.toString(16)).slice(-2)).join('');
  for (const r of rows) {
    if (!r.filekind) continue;
    const att = AT.lookup(host, { tableId: T_ID, tableName: TABLE, recordId: r.id, recordUU: r.uu ? String(r.uu) : null }); if (!att) continue;
    let st; try { st = await AT.load(att); } catch (e) { console.log('§BIMDOC-REGISTER-EXPORT attachment unreadable id=' + r.id + ' ' + (e && e.message)); continue; }
    const ent = st.entries.filter((e) => e.name.toLowerCase().endsWith('.' + String(r.filekind).toLowerCase()))[0]; if (!ent) continue;
    r.sha256 = ent.sha256 ? String(ent.sha256) : (ent.data ? await hex(ent.data) : null);
  }
  return rows;
}
async function openInApp(id, chk) {
  const A = globalThis.__idmpAttach, refuse = (why) => { console.log('§BIMDOC-OPEN REFUSED id=' + id + ' reason=' + why); return null; };
  if (!A) return refuse('no-attachment-module');
  const AT = await A.load(), host = A.host();
  if (!AT) return refuse('no-attachment-module');
  const att = AT.lookup(host, chk.cx);
  if (!att) return refuse('no-attachment kind=' + chk.kind);
  let st; try { st = await AT.load(att); } catch (e) { return refuse('attachment-unreadable ' + (e && e.message)); }
  const ext = '.' + String(chk.kind).toLowerCase(), ent = st.entries.filter((e) => e.name.toLowerCase().endsWith(ext))[0];
  if (!ent) return refuse('no-entry-of-kind kind=' + chk.kind + ' entries=' + st.entries.length);
  const pr = await AT.promote(host, chk.cx, ent.name);
  if (!pr.ok) return refuse('store-' + pr.reason);
  const url = new URL('../' + chk.app + '?open=store:' + pr.sha256 + '&name=' + encodeURIComponent(ent.name), globalThis.location.href).href;
  console.log('§BIMDOC-OPEN id=' + id + ' deliverable=' + chk.row.deliverableno + ' kind=' + chk.kind + ' app=' + chk.app + ' name=' + ent.name + ' size=' + pr.size + ' sha256=' + pr.sha256 + ' promoted=' + (pr.promoted ? 1 : 0) + ' url=' + url);
  globalThis.open(url, '_blank');
  return url;
}
export async function activate(ctx) {
  const db = ctx.db, q = (s, p) => (db.query ? db.query(s, p || []) : []);
  const ddl = COLS.map((c) => '"' + lc(c.n) + '" ' + (NUMERIC_REFS[c.ref] ? 'NUMERIC' : 'TEXT')).join(', ');
  if (db.run) db.run('CREATE TABLE IF NOT EXISTS "bim_document" (' + ddl + ', PRIMARY KEY ("bim_document_id"))');
  // a table made by an earlier version of this plugin gains the columns added since (ALTER TABLE ADD COLUMN, as legacy's column sync); logged
  if (db.run) { const have = new Set(q('PRAGMA table_info("bim_document")').map((r) => String(r.name).toLowerCase())), add = COLS.filter((c) => have.size && !have.has(lc(c.n)));
    add.forEach((c) => db.run('ALTER TABLE "bim_document" ADD COLUMN "' + lc(c.n) + '" ' + (NUMERIC_REFS[c.ref] ? 'NUMERIC' : 'TEXT')));
    if (add.length) console.log('§BIMDOC-PLUGIN columns-added=[' + add.map((c) => c.n).join(',') + ']'); }
  // document type "BIM Document" for every client that already has Project Issue (the project clients)
  const clients = q("SELECT DISTINCT ad_client_id AS c FROM c_doctype WHERE docbasetype='PJI' AND isactive='Y' ORDER BY 1").map((r) => Number(r.c));
  const dts = clients.map((c) => Object.assign({ c_doctype_id: DT0 + c, name: 'BIM Document', printname: 'BIM Document', description: 'A project deliverable, issued in the firm\'s states', docbasetype: 'BIM', issotrx: 'N',
    isdocnocontrolled: 'N', isdefault: 'Y', documentcopies: 0, c_doctype_uu: 'bimdoc-doctype-' + c, iscanbereactivated: 'N', isindexed: 'N' }, STD, { ad_client_id: c, entitytype: undefined }));
  dts.forEach((r) => { delete r.entitytype; });                           // C_DocType carries no EntityType column in this dictionary
  const dtN = dts.length ? ctx.dict.insert('c_doctype', 'c_doctype_id', dts) : 0;
  // the roles that can open the Project window can open this one (and its sub-tab rides the Project window)
  const acc = q('SELECT ad_role_id AS r, ad_client_id AS c, isreadwrite AS rw FROM ad_window_access WHERE ad_window_id=? AND isactive=\'Y\'', [PRJ_WIN]);
  // Window and process access are the HOST's (plugin_registry.js §PLUGIN-ROLE-ACCESS = PackInHandler.updateRoleAccess: every active non-manual role by access level). This bundle used to copy the
  //   Project window's roles itself; with the host pass both wrote AD_Window_Access and the bundle failed to start (UNIQUE ad_window_id, ad_role_id). One implementation: the host's.
  // AD_Document_Action_Access: legacy's DocumentTypeVerify gives a new document type every action for every role; the FSM family then narrows what is offered (checkActionAccess filters the offer by these rows)
  const acts = q('SELECT ad_ref_list_id AS id FROM ad_ref_list WHERE ad_reference_id=135 AND isactive=\'Y\' ORDER BY 1').map((r) => Number(r.id));
  const roles = Array.from(new Set(acc.map((a) => Number(a.r)))), daa = [];
  clients.forEach((c) => roles.forEach((r) => acts.forEach((a) => daa.push({ ad_client_id: c, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, c_doctype_id: DT0 + c, ad_role_id: r, ad_ref_list_id: a, ad_document_action_access_uu: 'bimdoc-daa-' + c + '-' + r + '-' + a }))));
  const daaN = daa.length ? ctx.dict.insert('ad_document_action_access', 'ad_document_action_access_uu', daa) : 0;
  // the deliverable's place in the project, as MProjectLine.beforeSave :206-257 does it (model_project.js): the phase comes from the task, the project from the phase - a row entered in the sub-tab (where only the task link is known) is whole
  ctx.docAction.registerModel(lc(TABLE), { beforeSave(trx, d, isNew, old) {
    const ch = (c) => !old || !same(d[c], old[c]), nz = (v) => v != null && v !== '' && Number(v) !== 0;
    if (ch('c_projecttask_id') && nz(d.c_projecttask_id)) { const t = trx.get('c_projecttask', d.c_projecttask_id); if (!t) return 'Project Task Not Found - ID=' + d.c_projecttask_id; d.c_projectphase_id = t.c_projectphase_id; }
    if (ch('c_projectphase_id') && nz(d.c_projectphase_id)) { const p = trx.get('c_projectphase', d.c_projectphase_id); if (!p) return 'Project Phase Not Found - ' + d.c_projectphase_id; d.c_project_id = p.c_project_id; }
    return null;
  } });
  ctx.docAction.registerDocAction(lc(TABLE), docAction);
  if (ctx.docFsm) ctx.docFsm.register(T_ID, FAMILY);
  globalThis.BimDocProgress = { compute: computeProgress, table: lc(TABLE), tableId: T_ID, states: STATES, virtual: VIRTUAL };
  // the Open process: the roles that open the Project window may run it (AD_Process_Access, as the window access above), and its class (owner-scoped, removed on Stop)
  if (ctx.process && ctx.process.defineProcess) ctx.process.defineProcess(P_OPEN_CLASS, function (SvrProcess) {
    function BIMDocumentOpen() { SvrProcess.call(this); }
    BIMDocumentOpen.prototype = Object.create(SvrProcess.prototype);
    BIMDocumentOpen.prototype.prepare = function () { /* no parameters */ };
    BIMDocumentOpen.prototype.doIt = function () {
      const trx = this.get_TrxName(), id = this.getRecord_ID();
      if (!id) refuseOpen(id, 'no-document');
      const chk = openChecks((sql) => trx.q(sql), id);
      console.log('§BIMDOC-OPEN-PROCESS id=' + id + ' deliverable=' + chk.row.deliverableno + ' kind=' + chk.kind + ' app=' + chk.app + ' (AD_Process ' + P_OPEN + ')');
      openInApp(id, chk).catch((e) => console.log('§BIMDOC-OPEN REFUSED id=' + id + ' reason=' + (e && e.message)));
      return 'Opening ' + chk.row.deliverableno + ' (' + chk.kind + ') in ' + chk.app;
    };
    return BIMDocumentOpen;
  }, { harm: 'writes' });   // promote rewrites the attachment row and fills the file store
  // the register export (§REGISTER-EXPORT): read only; the file goes back through IProcessUI.download (AdProcess.download)
  if (ctx.process && ctx.process.defineProcess) ctx.process.defineProcess(P_EXPORT_CLASS, function (SvrProcess) {
    function BIMDocumentRegisterExport() { SvrProcess.call(this); }
    BIMDocumentRegisterExport.prototype = Object.create(SvrProcess.prototype);
    BIMDocumentRegisterExport.prototype.prepare = function () { /* no parameters */ };
    BIMDocumentRegisterExport.prototype.doIt = function () {
      const trx = this.get_TrxName(), id = this.getRecord_ID(), ui = this.processUI;
      if (!id) throw new Error('Export Register: no document');
      const reg = registerRows((sql) => trx.q(sql), id);
      const file = 'bim_register_' + String(reg.projectValue || reg.projectId).replace(/[^A-Za-z0-9_.-]+/g, '_') + '.json';
      registerDigests(reg.rows).then((rows) => {
        const text = JSON.stringify(rows.map(({ no, rev, status, discipline, filekind, sha256, name }) => ({ no, rev, status, discipline, filekind, sha256, name })), null, 2);
        return ui.download(file, text, 'application/json').then((d) => console.log('§BIMDOC-REGISTER-EXPORT project=' + reg.projectId + ' rows=' + rows.length + ' latest=' + reg.latest + ' superseded=' + reg.superseded + ' withFile=' + rows.filter((r) => r.sha256).length + ' sha256Of=' + (d && d.sha256)));
      }).catch((e) => console.log('§BIMDOC-REGISTER-EXPORT FAILED ' + (e && e.message)));
      return 'Exported=' + reg.rows.length + ' File=' + file;
    };
    return BIMDocumentRegisterExport;
  }, { harm: 'read' });
  console.log('§BIMDOC-PLUGIN start table=' + T_ID + ' cols=' + COLS.length + ' window=' + W_ID + ' doctypes=' + dtN + ' clients=[' + clients.join(',') + '] windowAccess=host family=' + FAMILY.name + ' (dictionary staged by the host, refcounted)');
}
export async function deactivate() { console.log('§BIMDOC-PLUGIN stop table=' + T_ID); }   // the scope removes the DocAction class, the process class and the staged rows by owner
