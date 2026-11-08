// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bim_document.mjs: the BIM Document core plugin (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC .. §BIMDOC-5, §BIMDOC-FILM).
// Witness: W-BIMDOC (erp/tests/witness_bimdoc_live.js). READ THE LOG: §BIMDOC lines (erp/tests/witness_bimdoc_live.log + .page.log).
// WHAT IT IS: one deliverable (a sheet, a model file) under a project task, its own table BIM_Document, DocStatus/DocAction on the common framework (ad_docfsm DOC_FAMILY,
//   the same machine every walked document uses), states = what a firm prints: Draft -> Issued for review -> Issued for construction, and Superseded (DocStatus RE, the
//   Reversal_ID pattern of M_InOut) set on the older revision when a newer revision of the same deliverable is completed. NO second state engine, NO host code for this table
//   (AD-LAYER LAW): everything below is DICTIONARY DATA (manifest.dictionary, staged by the host, refcounted, removed on Stop) plus the DocAction CLASS and one lens action.
// WHAT IT STAGES: AD_Table BIM_Document (+ the physical table, created IF NOT EXISTS), its columns, AD_Window "BIM Document" (own menu leaf under Project Management), a "BIM Document"
//   tab under Project Task in the Project window (so a project shows its deliverables), reference lists (discipline, file kind, the four issue states), document type "BIM Document"
//   (DocBaseType BIM, one per client that has Project Issue), window access = the roles that can open the Project window.
// PROGRESS IS COMPUTED, never stored (§BIMDOC-4 point 5, §BIMDOC-5 b): per task and per phase, deliverables Issued for construction over all deliverables, and earned hours =
//   hours budget x credit (credit 1 at Issued for construction, 0 before; §BIMDOC-5 b). A deliverable = (project, deliverable no); its state is that of its latest revision;
//   a Superseded revision is not a deliverable of its own. Phase completion stays MANUAL (C_ProjectPhase.IsComplete + the phase Generate Order): the count only proposes it.
// OPEN IN MODELLER / VIEWER (§BIMDOC-OPEN, built): one lens action on the BIM Document. The file kind of the row -> the app comes from the Description of its 'BIM File Kind' list row (data);
//   the entry's bytes go into the shared file store (generic AdAttachment.promote, phase 2) and the app is opened at <app>?open=store:<sha256>&name=<file>. No table is named in the host.
// HOURS (§BIMDOC-4 point 4): the progress action also logs the time and expense lines booked on the task (s_timeexpenseline.c_projecttask_id): §BIMDOC-HOURS.
// CHAIN (film beat 10): completing a deliverable logs the project's issued count before and after (§BIMDOC-CHAIN).
// Id band 9541001-9541999 (no seed row, no other bundle).
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const T_ID = 9541001, W_ID = 9541001, TAB_OWN = 9541001, TAB_PRJ = 9541002, MENU_ID = 9541001, TREE = 10, MENU_PARENT = 160, PRJ_WIN = 130, PRJ_AFTER_TAB = 796;
const R_STATUS = 9541001, R_DISC = 9541002, R_KIND = 9541003, R_REV = 9541004;
const COL0 = 9541201, FLD_OWN0 = 9541301, FLD_PRJ0 = 9541401, LIST0 = 9541101, DT0 = 9541500;
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

// ── columns: [name, label, ref, refValue, len, mandatory, default, flags, showOwn, showPrj] ; flags: K key, P parent link, R read-only field, I identifier
const C = (n, l, ref, rv, len, m, def, fl, so, sp) => ({ n, l, ref, rv, len, m, def, fl: fl || '', so: so !== false, sp: sp !== false });
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
  C('C_Project_ID', 'Project', 19, null, 22, 'Y', null, '', true, false),
  C('C_ProjectPhase_ID', 'Project Phase', 19, null, 22, 'N', null, '', true, false),
  C('C_ProjectTask_ID', 'Project Task', 19, null, 22, 'Y', null, 'P', true, false),
  C('DeliverableNo', 'Deliverable No', 10, null, 30, 'Y', null, '', true, true),
  C('Revision', 'Revision', 11, null, 22, 'Y', '1', '', true, true),
  C('Name', 'Title', 10, null, 255, 'Y', null, 'I', true, true),
  C('Discipline', 'Discipline', 17, R_DISC, 3, 'N', null, '', true, true),
  C('FileKind', 'File Kind', 17, R_KIND, 3, 'N', null, '', true, true),
  C('HoursBudget', 'Hours Budget', 29, null, 22, 'N', '0', '', true, true),
  C('DocStatus', 'Document Status', 17, R_STATUS, 2, 'Y', 'DR', 'R', true, true),
  C('DocAction', 'Document Action', 28, 135, 2, 'Y', 'CO', '', true, true),
  C('Processed', 'Processed', 20, null, 1, 'Y', 'N', 'R', true, false),
  C('Reversal_ID', 'Superseded By', 30, R_REV, 22, 'N', null, 'R', true, true)
];
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
  issyncdatabase: 'N', isalwaysupdateable: 'N', isallowlogging: 'Y', isallowcopy: 'Y', ad_column_uu: 'bimdoc-col-' + (COL0 + i), version: 0 }, STD));
const window_ = Object.assign({ ad_window_id: W_ID, name: 'BIM Document', description: 'The deliverables of a project: sheets and model files, issued in the firm\'s own states', windowtype: 'M', issotrx: 'Y', isdefault: 'N', ad_window_uu: 'bimdoc-window-' + W_ID }, STD);
const tabOwn = Object.assign({ ad_tab_id: TAB_OWN, ad_window_id: W_ID, name: 'BIM Document', description: 'BIM Document', ad_table_id: T_ID, seqno: 10, tablevel: 0, issinglerow: 'Y', isinfotab: 'N', istranslationtab: 'N', isreadonly: 'N',
  hastree: 'N', issorttab: 'N', isinsertrecord: 'Y', isadvancedtab: 'N', ad_tab_uu: 'bimdoc-tab-' + TAB_OWN, orderbyclause: 'DeliverableNo, Revision' }, STD);
const tabPrj = Object.assign({}, tabOwn, { ad_tab_id: TAB_PRJ, ad_window_id: PRJ_WIN, seqno: 45, tablevel: 3, issinglerow: 'N', ad_tab_uu: 'bimdoc-tab-' + TAB_PRJ });
const fieldRows = (tabId, f0, own) => COLS.map((c, i) => ({ c, i })).filter(({ c }) => c.fl.indexOf('K') >= 0 || (own ? c.so : c.sp)).map(({ c, i }, k) => Object.assign({ ad_field_id: f0 + i, ad_tab_id: tabId, ad_column_id: COL0 + i,
  name: c.l, iscentrallymaintained: 'Y', isdisplayed: c.fl.indexOf('K') >= 0 ? 'N' : 'Y', isreadonly: c.fl.indexOf('R') >= 0 ? 'Y' : 'N', seqno: (k + 1) * 10, issameline: 'N', isheading: 'N', isfieldonly: 'N', isencrypted: 'N', ad_field_uu: 'bimdoc-fld-' + (f0 + i) }, STD));
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
    { table: 'ad_table', idCol: 'ad_table_id', rows: [table] },
    { table: 'ad_column', idCol: 'ad_column_id', rows: columns },
    { table: 'ad_window', idCol: 'ad_window_id', rows: [window_] },
    { table: 'ad_tab', idCol: 'ad_tab_id', rows: [tabOwn, tabPrj] },
    { table: 'ad_field', idCol: 'ad_field_id', rows: fieldRows(TAB_OWN, FLD_OWN0, true).concat(fieldRows(TAB_PRJ, FLD_PRJ0, false)) },
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

// ── activate: the physical table, the rows that depend on who is in the database (doc types, window access), the DocAction class + FSM family, the progress lens ──
// "Open in Modeller / Viewer": file kind (row) -> app (data row) -> the attachment entry of that kind into the file store -> <app>?open=store:<sha256>&name=<file>
async function openInApp(api) {
  const rd = globalThis.__tipRead && globalThis.__tipRead.rows, id = api.keyVal, say = (m) => { try { api.status && api.status(m); } catch (e) { /* log only */ } };
  const refuse = (why) => { console.log('§BIMDOC-OPEN REFUSED id=' + id + ' reason=' + why); say('Open: ' + why); return null; };
  const row = rd && rd('SELECT filekind, deliverableno FROM bim_document WHERE bim_document_id=' + Number(id))[0];
  if (!row) return refuse('no-document');
  const kind = row.filekind;
  if (!kind) return refuse('no-file-kind');
  const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const app = ((dictQ && dictQ('SELECT description AS d FROM ad_ref_list WHERE ad_reference_id=' + R_KIND + ' AND value=' + lit(kind) + " AND isactive='Y'")) || [])[0];
  if (!app || !app.d) return refuse('no-app-for-kind kind=' + kind);
  if (!api.attachments) return refuse('no-attachment-module');
  const AT = await api.attachments(), host = api.attachmentHost(), cx = api.attachmentCtx && api.attachmentCtx();
  if (!AT || !cx) return refuse('no-attachment-module');
  const att = AT.lookup(host, cx);
  if (!att) return refuse('no-attachment kind=' + kind);
  let st; try { st = await AT.load(att); } catch (e) { return refuse('attachment-unreadable ' + (e && e.message)); }
  const ext = '.' + String(kind).toLowerCase(), ent = st.entries.filter((e) => e.name.toLowerCase().endsWith(ext))[0];
  if (!ent) return refuse('no-entry-of-kind kind=' + kind + ' entries=' + st.entries.length);
  const pr = await AT.promote(host, cx, ent.name);
  if (!pr.ok) return refuse('store-' + pr.reason);
  const url = new URL('../' + app.d + '?open=store:' + pr.sha256 + '&name=' + encodeURIComponent(ent.name), globalThis.location.href).href;
  console.log('§BIMDOC-OPEN id=' + id + ' deliverable=' + row.deliverableno + ' kind=' + kind + ' app=' + app.d + ' name=' + ent.name + ' size=' + pr.size + ' sha256=' + pr.sha256 + ' promoted=' + (pr.promoted ? 1 : 0) + ' url=' + url);
  globalThis.open(url, '_blank');
  return url;
}
let dictQ = null;   // the dictionary reader of the running plugin (the file-kind -> app rows are data)
export async function activate(ctx) {
  const db = ctx.db, q = (s, p) => (db.query ? db.query(s, p || []) : []);
  dictQ = q;
  const ddl = COLS.map((c) => '"' + lc(c.n) + '" ' + (NUMERIC_REFS[c.ref] ? 'NUMERIC' : 'TEXT')).join(', ');
  if (db.run) db.run('CREATE TABLE IF NOT EXISTS "bim_document" (' + ddl + ', PRIMARY KEY ("bim_document_id"))');
  // document type "BIM Document" for every client that already has Project Issue (the project clients)
  const clients = q("SELECT DISTINCT ad_client_id AS c FROM c_doctype WHERE docbasetype='PJI' AND isactive='Y' ORDER BY 1").map((r) => Number(r.c));
  const dts = clients.map((c) => Object.assign({ c_doctype_id: DT0 + c, name: 'BIM Document', printname: 'BIM Document', description: 'A project deliverable, issued in the firm\'s states', docbasetype: 'BIM', issotrx: 'N',
    isdocnocontrolled: 'N', isdefault: 'Y', documentcopies: 0, c_doctype_uu: 'bimdoc-doctype-' + c, iscanbereactivated: 'N', isindexed: 'N' }, STD, { ad_client_id: c, entitytype: undefined }));
  dts.forEach((r) => { delete r.entitytype; });                           // C_DocType carries no EntityType column in this dictionary
  const dtN = dts.length ? ctx.dict.insert('c_doctype', 'c_doctype_id', dts) : 0;
  // the roles that can open the Project window can open this one (and its sub-tab rides the Project window)
  const acc = q('SELECT ad_role_id AS r, ad_client_id AS c, isreadwrite AS rw FROM ad_window_access WHERE ad_window_id=? AND isactive=\'Y\'', [PRJ_WIN]);
  const accRows = acc.map((a) => ({ ad_window_id: W_ID, ad_role_id: a.r, ad_client_id: a.c, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, isreadwrite: a.rw || 'Y', ad_window_access_uu: 'bimdoc-access-' + a.r }));
  const accN = accRows.length ? ctx.dict.insert('ad_window_access', 'ad_window_access_uu', accRows) : 0;
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
  globalThis.BimDocProgress = { compute: computeProgress, table: lc(TABLE), tableId: T_ID, states: STATES };
  if (ctx.lens) ctx.lens.register('bimdoc', {
    actions(api) {
      const t = api && api.tab && String(api.tab.tableName || '').toLowerCase();
      const out = [];
      if ((t === 'c_projecttask' || t === 'c_projectphase' || t === lc(TABLE)) && api.keyVal != null) out.push({ id: 'progress', label: 'BIM progress', title: 'Deliverables issued for construction over all deliverables, and earned hours (computed, never stored)' });
      if (t === lc(TABLE) && api.keyVal != null) out.push({ id: 'open', label: 'Open in Modeller / Viewer', title: 'Open the attached file in the app its file kind names' });
      return out;
    },
    run(id, api) {
      if (id === 'open') return openInApp(api);
      if (id !== 'progress') return;
      const t = String(api.tab.tableName).toLowerCase(), rd = globalThis.__tipRead && globalThis.__tipRead.rows;
      if (!rd) { console.log('§BIMDOC-PROGRESS REFUSED no tip reader'); return; }
      const rows = rd('SELECT * FROM bim_document'), P = computeProgress(rows);
      let task = null, phase = null;
      if (t === 'c_projecttask') { task = api.keyVal; const r = rd('SELECT c_projectphase_id FROM c_projecttask WHERE c_projecttask_id=' + Number(task))[0]; phase = r && r.c_projectphase_id; }
      else if (t === 'c_projectphase') phase = api.keyVal;
      else { const r = rows.find((x) => same(x.bim_document_id, api.keyVal)); task = r && r.c_projecttask_id; phase = r && r.c_projectphase_id; }
      const fmt = (x) => (x ? x.issued + ' of ' + x.total + ' issued for construction (' + x.pct + '%), earned hours ' + x.earned + ' of ' + x.budget : 'no deliverables');
      if (task != null) console.log('§BIMDOC-REGISTER task=' + task + ' rows=' + rows.filter((x) => same(x.c_projecttask_id, task)).length + ' deliverables=' + (P.byTask[task] ? P.byTask[task].total : 0));
      if (task != null) {   // hours booked on the task (S_TimeExpenseLine), next to the deliverables' earned hours: the project's cost and the deliverable meet on the task
        const tl = rd('SELECT s_timeexpenseline_id AS id, qty FROM s_timeexpenseline WHERE c_projecttask_id=' + Number(task) + " AND isactive<>'N' ORDER BY s_timeexpenseline_id"), hrs = tl.reduce((a, x) => a + Number(x.qty || 0), 0);
        console.log('§BIMDOC-HOURS task=' + task + ' lines=' + tl.length + ' qty=[' + tl.map((x) => Number(x.qty || 0)).join(',') + '] total=' + hrs);
      }
      const lines = []; if (task != null) lines.push(['Task ' + task, P.byTask[task]]); if (phase != null) lines.push(['Phase ' + phase, P.byPhase[phase]]);
      lines.forEach(([l, x]) => console.log('§BIMDOC-PROGRESS ' + l.toLowerCase().replace(' ', '=') + ' ' + (x ? 'issued=' + x.issued + ' total=' + x.total + ' pct=' + x.pct + ' budget=' + x.budget + ' earned=' + x.earned : 'issued=0 total=0')));
      const old = document.getElementById('bimdoc-progress'); if (old) old.remove();
      const ov = document.createElement('div'); ov.id = 'bimdoc-progress'; ov.setAttribute('data-bimdoc-progress', '1');
      ov.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center';
      const box = document.createElement('div'); box.style.cssText = 'background:var(--idmp-panel,#fff);color:var(--idmp-fg,#1c1c1c);border:1px solid var(--idmp-border,#c9c9c9);border-radius:8px;padding:12px 16px;min-width:340px;font:13px system-ui';
      box.innerHTML = '<div style="font-weight:700;font-size:14px;margin-bottom:8px">BIM progress (computed)</div>' + lines.map(([l, x]) => '<div data-bimdoc-line="' + l + '">' + l + ': ' + fmt(x) + '</div>').join('') +
        '<div style="margin-top:8px;color:#666">Phase completion stays manual: tick Complete on the phase, then run its Generate Order.</div>';
      const b = document.createElement('button'); b.textContent = 'Close'; b.style.marginTop = '10px'; b.onclick = () => ov.remove(); box.appendChild(b); ov.appendChild(box); ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
      document.body.appendChild(ov);
    }
  });
  console.log('§BIMDOC-PLUGIN start table=' + T_ID + ' cols=' + COLS.length + ' window=' + W_ID + ' doctypes=' + dtN + ' clients=[' + clients.join(',') + '] windowAccess=' + accN + ' family=' + FAMILY.name + ' (dictionary staged by the host, refcounted)');
}
export async function deactivate(ctx) { if (ctx && ctx.lens && ctx.lens.remove) { /* the scope removes the lens by owner */ } console.log('§BIMDOC-PLUGIN stop table=' + T_ID); }
