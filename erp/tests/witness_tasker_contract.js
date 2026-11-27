#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TASKER-CONTRACT (bim-compiler prompts/MOBILE_PERF.md WO-12). READ THE LOG after every run: the verdict is the §W-TASKER-CONTRACT line; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: the phone "tasker" (site missions) is legacy iDempiere Workflow + Request, no new column. Does ONE sample mission, written as legacy-shaped rows
//   (AD_Form + AD_Attachment, AD_Workflow type G on R_Request, two Action-X nodes with Role responsibles, AD_WF_NodeNext, an R_Request anchored on a C_ProjectLine whose C_Project.Note
//   holds the pushed GUID set), actually RUN through erp/ad_workflow.js the way legacy runs it: start -> process + first activity waiting for the user's role, user confirmation stores
//   user + text and starts the next, the last confirmation closes the process, a start with no record is refused, and the anchor resolves to a GUID set. Every legacy rule ported cites
//   org.compiere Java file:line in erp/ad_workflow.js ("W-TASKER-CONTRACT run arm").
// The fixture is SQL TEXT built into an in-memory sql.js database; nothing is committed as a .db. Column facts: erp/tests/fixtures/tasker_contract_legacy_cols.json (a read-only SELECT of the
//   legacy dictionary, ad_column x ad_table) — check C0 proves every fixture/engine row only uses legacy columns and fills every mandatory column that has no dictionary default.
// Red control R1: the fixture workflow's AD_Table_ID set to 0 -> the T1 expectations MUST fail (the start is refused).
// Run: node erp/tests/witness_tasker_contract.js 2>&1 | tee erp/tests/logs/witness_tasker_contract.log
'use strict';
var fs = require('fs'), path = require('path');
var log = console.log, fails = 0, judged = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; log('§TASKER_' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + JSON.stringify(info) : '')); }
var WF = require(path.join(__dirname, '..', 'ad_workflow.js'));
var COLS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tasker_contract_legacy_cols.json'), 'utf8')).tables;
var OVERLAY = { c_project: ['bim_viewerurl'] };        // not in the stock dictionary: the "BIM Model" link field added by erp/patches/build_bim_link_overlay.py (BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8.10)
var PK_EXEMPT = /^(created|createdby|updated|updatedby)$|_uu$/;

var G1 = 'FIXT_GUID_000000000001', G2 = 'FIXT_GUID_000000000002', G3 = 'FIXT_GUID_000000000003';
var FORM_JSON = JSON.stringify({ window: { name: 'Site task: check install', arrival: { radius_m: 6, qr: 'R_Request_UU' }, tabs: [{ name: 'Check', fields: [
  { fieldId: 'f1', name: 'Anchors tight', component: 'SAFETY_CHECKLIST', sequence: 10, validation: { required: true } },
  { fieldId: 'f2', name: 'Photo', component: 'MULTI_PHOTO', sequence: 20 }] }] } });
var FIX = [
  // ── dictionary rows the engine reads: AD_Table names the record's table (MWFProcess.getPO:645-655) ──
  "CREATE TABLE ad_table (ad_table_id INTEGER PRIMARY KEY, tablename TEXT)",
  "INSERT INTO ad_table VALUES (117,'AD_Workflow'),(203,'C_Project'),(376,'AD_Form'),(417,'R_Request'),(434,'C_ProjectLine')",
  // ── the form design: ONE AD_Form row, its ADUI JSON an AD_Attachment on it ──
  "CREATE TABLE ad_form (ad_form_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, name TEXT, accesslevel TEXT, entitytype TEXT, isbetafunctionality TEXT, classname TEXT, description TEXT)",
  "INSERT INTO ad_form VALUES (1000001,11,0,'Y','Site task: check install','3','U','N',NULL,'WO-12 fixture form')",
  "CREATE TABLE ad_attachment (ad_attachment_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, ad_table_id INT, record_id INT, title TEXT, binarydata TEXT, textmsg TEXT)",
  "INSERT INTO ad_attachment VALUES (1000001,11,0,'Y',376,1000001,'form.json','" + FORM_JSON.replace(/'/g, "''") + "',NULL)",
  // ── responsibles: two Role responsibles (nodes) + the stock Invoker (process level, MWFProcess.setAD_WF_Responsible_ID:487-496) ──
  "CREATE TABLE ad_wf_responsible (ad_wf_responsible_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, name TEXT, responsibletype TEXT, ad_role_id INT, ad_user_id INT, entitytype TEXT)",
  "INSERT INTO ad_wf_responsible VALUES (1000001,11,0,'Y','Site crew','R',1000001,NULL,'U'),(1000002,11,0,'Y','Site lead','R',1000002,NULL,'U'),(1000003,11,0,'Y','Invoker','H',0,NULL,'U')",
  // ── the template: AD_Workflow type G bound to R_Request; two X nodes; one transition ──
  "CREATE TABLE ad_workflow (ad_workflow_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, name TEXT, value TEXT, workflowtype TEXT, ad_table_id INT, ad_wf_node_id INT, ad_wf_responsible_id INT, accesslevel TEXT, author TEXT, cost REAL, duration INT, entitytype TEXT, isbetafunctionality TEXT, isdefault TEXT, isvalid TEXT, publishstatus TEXT, version INT, waitingtime INT, workingtime INT, priority INT)",
  "INSERT INTO ad_workflow VALUES (1000001,11,0,'Y','Site task: install check','SITE_TASK_INSTALL','G',417,1000001,NULL,'3','fixture',0,0,'U','N','N','Y','R',1,0,0,NULL)",
  "CREATE TABLE ad_wf_node (ad_wf_node_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, ad_workflow_id INT, name TEXT, value TEXT, action TEXT, ad_form_id INT, ad_wf_responsible_id INT, xposition INT, yposition INT, splitelement TEXT, joinelement TEXT, entitytype TEXT, cost REAL, duration INT, iscentrallymaintained TEXT, isattacheddocumenttoemail TEXT, \"limit\" INT, waitingtime INT, waittime INT)",
  "INSERT INTO ad_wf_node VALUES (1000001,11,0,'Y',1000001,'Mark and fix anchors','N1','X',1000001,1000001,100,100,'X','X','U',0,0,'Y','Y',0,0,0),(1000002,11,0,'Y',1000001,'Sign off','N2','X',1000001,1000002,300,100,'X','X','U',0,0,'Y','Y',0,0,0)",
  "CREATE TABLE ad_wf_nodenext (ad_wf_nodenext_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, ad_wf_node_id INT, ad_wf_next_id INT, seqno INT, isstduserworkflow TEXT, entitytype TEXT, transitioncode TEXT, description TEXT)",
  "INSERT INTO ad_wf_nodenext VALUES (1000001,11,0,'Y',1000001,1000002,10,'N','U',NULL,NULL)",
  // ── the place: Project -> item (C_ProjectLine -> M_Product), the GUID set on the project header's Note ──
  "CREATE TABLE c_project (c_project_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, value TEXT, name TEXT, note TEXT, bim_viewerurl TEXT, c_currency_id INT, committedamt REAL, committedqty REAL, invoicedamt REAL, invoicedqty REAL, iscommitceiling TEXT, iscommitment TEXT, issummary TEXT, plannedamt REAL, plannedmarginamt REAL, plannedqty REAL, processed TEXT, projectbalanceamt REAL)",
  "INSERT INTO c_project VALUES (1000001,11,0,'Y','SITE_BLDG','Site building','" + [G1, G2, G3].join(',') + "','https://host.example/viewer/viewer.html?db=site_model_extracted.db',100,0,0,0,0,'N','N','N',0,0,0,'N',0)",
  "CREATE TABLE m_product (m_product_id INTEGER PRIMARY KEY, value TEXT, name TEXT)",
  "INSERT INTO m_product VALUES (1000001,'IfcBeam','Beam')",
  "CREATE TABLE c_projectline (c_projectline_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, c_project_id INT, line INT, m_product_id INT, description TEXT, invoicedamt REAL, invoicedqty REAL, isprinted TEXT, plannedamt REAL, plannedmarginamt REAL, plannedprice REAL, plannedqty REAL, processed TEXT)",
  "INSERT INTO c_projectline VALUES (1000001,11,0,'Y',1000001,10,1000001,'Beam anchors',0,0,'Y',0,0,0,1,'N')",
  // ── the job: ONE R_Request, assigned to a role, anchored on the project line ──
  "CREATE TABLE r_request (r_request_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, documentno TEXT, r_requesttype_id INT, summary TEXT, ad_role_id INT, salesrep_id INT, c_project_id INT, ad_table_id INT, record_id INT, datestartplan TEXT, datecompleteplan TEXT, taskstatus TEXT, r_request_uu TEXT, isescalated TEXT, isinvoiced TEXT, isselfservice TEXT, processed TEXT, requestamt REAL, confidentialtype TEXT, confidentialtypeentry TEXT, duetype TEXT, priority TEXT, updatedby INT)",
  "INSERT INTO r_request VALUES (1000001,11,0,'Y','REQ-FIXT-1',100,'Fix the beam anchors',1000001,1000010,1000001,434,1000001,'2026-12-01','2026-12-02',NULL,'3f1c2a7e-0000-4000-8000-000000000001','N','N','N','N',0,'C','C','5','5',1000010)",
  // ── the run (written by the engine) ──
  "CREATE TABLE ad_wf_process (ad_wf_process_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, ad_workflow_id INT, ad_wf_responsible_id INT, ad_user_id INT, wfstate TEXT, processed TEXT, ad_table_id INT, record_id INT, priority INT, textmsg TEXT)",
  "CREATE TABLE ad_wf_activity (ad_wf_activity_id INTEGER PRIMARY KEY, ad_client_id INT, ad_org_id INT, isactive TEXT, ad_wf_process_id INT, ad_workflow_id INT, ad_wf_node_id INT, ad_wf_responsible_id INT, ad_user_id INT, wfstate TEXT, processed TEXT, ad_table_id INT, record_id INT, priority INT, textmsg TEXT)"
];
var FIX_TABLES = ['ad_form', 'ad_attachment', 'ad_wf_responsible', 'ad_workflow', 'ad_wf_node', 'ad_wf_nodenext', 'c_project', 'c_projectline', 'r_request', 'ad_wf_process', 'ad_wf_activity'];

function rows(db, sql, p) { var st = db.prepare(sql), out = []; try { if (p) st.bind(p); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; }
function one(db, sql, p) { return rows(db, sql, p)[0] || null; }
function cnt(db, t) { return one(db, 'SELECT COUNT(*) AS n FROM ' + t).n; }
function mkdb(SQL, mut) { var db = new SQL.Database(); FIX.forEach(function (s) { db.run(s); }); if (mut) mut(db); return db; }
var U1 = 1000020, U2 = 1000021;

// T1 — start on the fixture request. Returns {ok, info}. Used by the real check AND by the red control.
function evalT1(db) {
  var r = WF.startProcess(db, 1000001, 1000001, { userId: U1 });
  var p = r.process ? one(db, 'SELECT * FROM ad_wf_process WHERE ad_wf_process_id=?', [r.process]) : null;
  var acts = p ? rows(db, 'SELECT * FROM ad_wf_activity WHERE ad_wf_process_id=? ORDER BY ad_wf_activity_id', [p.ad_wf_process_id]) : [];
  var a = acts[0] || {}, n1 = one(db, 'SELECT * FROM ad_wf_node WHERE ad_wf_node_id=1000001'), resp = one(db, 'SELECT * FROM ad_wf_responsible WHERE ad_wf_responsible_id=?', [n1.ad_wf_responsible_id]);
  var fm = one(db, 'SELECT * FROM ad_form WHERE ad_form_id=?', [n1.ad_form_id]), att = fm && one(db, 'SELECT * FROM ad_attachment WHERE ad_table_id=376 AND record_id=?', [fm.ad_form_id]), fj = null;
  try { fj = att ? JSON.parse(att.binarydata) : null; } catch (e) { fj = null; }
  var info = { started: r.ok, process: p && [p.wfstate, p.processed, p.ad_user_id, p.ad_table_id, p.record_id], activities: acts.length, act: [a.ad_wf_node_id, a.wfstate, a.processed, a.ad_user_id, a.ad_wf_responsible_id], role: resp && resp.ad_role_id, form_json_fields: fj && fj.window.tabs[0].fields.length, reason: r.reason };
  var ok = r.ok === true && p && p.wfstate === 'OS' && p.processed === 'N' && p.ad_table_id === 417 && p.record_id === 1000001 && p.ad_user_id === 1000010   // process user = the request's SalesRep (setUser_ID:505-545)
    && acts.length === 1 && a.ad_wf_node_id === 1000001 && a.wfstate === 'OS' && a.processed === 'N' && !a.ad_user_id && a.ad_wf_responsible_id === 1000001 && resp.ad_role_id === 1000001 && resp.responsibletype === 'R'
    && fm && fj && fj.window.tabs[0].fields.length === 2;
  return { ok: !!ok, info: info, r: r };
}

(async function () {
  var init; try { init = require('sql.js'); } catch (e) { init = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var SQL = await init();
  var db = mkdb(SQL);
  log('§TASKER_FIXTURE tables=' + FIX_TABLES.length + ' workflows=' + cnt(db, 'ad_workflow') + ' nodes=' + cnt(db, 'ad_wf_node') + ' nodenext=' + cnt(db, 'ad_wf_nodenext') + ' forms=' + cnt(db, 'ad_form') + ' attachments=' + cnt(db, 'ad_attachment') + ' requests=' + cnt(db, 'r_request'));

  // T1
  var t1 = evalT1(db); check('T1_start', t1.ok, t1.info);
  var pid = t1.r.process, acts0 = rows(db, 'SELECT ad_wf_activity_id AS id FROM ad_wf_activity WHERE ad_wf_process_id=?', [pid]), A1 = acts0[0] && acts0[0].id;

  // T2 — confirm step 1
  var c1 = WF.confirmActivity(db, A1, U1, 'anchors fixed, photos taken');
  var a1 = one(db, 'SELECT * FROM ad_wf_activity WHERE ad_wf_activity_id=?', [A1]), all2 = rows(db, 'SELECT * FROM ad_wf_activity WHERE ad_wf_process_id=? ORDER BY ad_wf_activity_id', [pid]), a2 = all2[1] || {}, p2 = one(db, 'SELECT * FROM ad_wf_process WHERE ad_wf_process_id=?', [pid]);
  check('T2_confirm_step1', c1.ok && a1.wfstate === 'CC' && a1.ad_user_id === U1 && a1.textmsg === 'anchors fixed, photos taken' && a1.processed === 'Y' && all2.length === 2
    && a2.ad_wf_node_id === 1000002 && a2.wfstate === 'OS' && a2.processed === 'N' && !a2.ad_user_id && a2.ad_wf_responsible_id === 1000002 && p2.wfstate === 'OS' && p2.processed === 'N',
    { confirm: c1, a1: [a1.wfstate, a1.ad_user_id, a1.textmsg, a1.processed], a2: [a2.ad_wf_node_id, a2.wfstate, a2.ad_user_id, a2.ad_wf_responsible_id], activities: all2.length, process: [p2.wfstate, p2.processed] });

  // T3 — confirm step 2 closes the process; a closed activity cannot be confirmed again
  var c2 = WF.confirmActivity(db, a2.ad_wf_activity_id, U2, 'signed off');
  var all3 = rows(db, 'SELECT * FROM ad_wf_activity WHERE ad_wf_process_id=? ORDER BY ad_wf_activity_id', [pid]), p3 = one(db, 'SELECT * FROM ad_wf_process WHERE ad_wf_process_id=?', [pid]);
  var again = WF.confirmActivity(db, A1, U2, 'again');
  check('T3_confirm_step2_closes', c2.ok && all3.length === 2 && all3[1].wfstate === 'CC' && all3[1].ad_user_id === U2 && all3[1].textmsg === 'signed off' && all3.every(function (x) { return x.processed === 'Y'; })
    && p3.wfstate === 'CC' && p3.processed === 'Y' && again.ok === false,
    { confirm: c2, acts: all3.map(function (x) { return [x.ad_wf_node_id, x.wfstate, x.ad_user_id, x.processed]; }), process: [p3.wfstate, p3.processed], reconfirm_refused: again.ok === false });

  // T4 — no record: Terminated, nothing persisted (MWFProcess.java:126-134 + the NPE at :150 -> MWorkflow.java:777-796)
  var pn = cnt(db, 'ad_wf_process'), an = cnt(db, 'ad_wf_activity');
  var z0 = WF.startProcess(db, 1000001, 0, { userId: U1 }), z1 = WF.startProcess(db, 1000001, 999999, { userId: U1 });
  check('T4_start_without_record', z0.ok === false && z0.state === 'CT' && z1.ok === false && z1.state === 'CT' && cnt(db, 'ad_wf_process') === pn && cnt(db, 'ad_wf_activity') === an,
    { record0: [z0.ok, z0.state, z0.reason], missing: [z1.ok, z1.state, z1.reason], process_rows: [pn, cnt(db, 'ad_wf_process')], activity_rows: [an, cnt(db, 'ad_wf_activity')] });

  // T5 — the anchor: request -> project line -> C_Project.Note (GUID set) + the line's item key (erp/idempiere.html:7857-7859 reads Note; :7903 reads M_Product.Value)
  var rq = one(db, 'SELECT * FROM r_request WHERE r_request_id=1000001'), tn = one(db, 'SELECT tablename FROM ad_table WHERE ad_table_id=?', [rq.ad_table_id]);
  var ln = tn && String(tn.tablename).toLowerCase() === 'c_projectline' ? one(db, 'SELECT * FROM c_projectline WHERE c_projectline_id=?', [rq.record_id]) : null;
  var pj = ln && one(db, 'SELECT * FROM c_project WHERE c_project_id=?', [ln.c_project_id]), prod = ln && one(db, 'SELECT value FROM m_product WHERE m_product_id=?', [ln.m_product_id]);
  var noteOk = !!(pj && /^\S+(,\S+)*$/.test(String(pj.note || ''))), set = noteOk ? String(pj.note).split(',') : [], uniq = {}; set.forEach(function (g) { uniq[g] = 1; });
  var url = null; try { url = pj && pj.bim_viewerurl ? new URL(pj.bim_viewerurl).searchParams.get('db') : null; } catch (e) { url = null; }
  check('T5_anchor_resolves', !!ln && !!pj && rq.c_project_id === ln.c_project_id && noteOk && Object.keys(uniq).length >= 2 && !!prod && prod.value === 'IfcBeam' && url === 'site_model_extracted.db',
    { request_table: tn && tn.tablename, line: ln && ln.c_projectline_id, project: pj && pj.c_project_id, guid_set: Object.keys(uniq).length, item_key: prod && prod.value, model_db_param: url });

  // C0 — legacy columns only, every mandatory no-default column filled (fixture rows AND engine-written rows)
  var bad = [], judgedRows = 0;
  FIX_TABLES.forEach(function (t) {
    var leg = COLS[t]; if (!leg) { bad.push(t + ': no legacy snapshot'); return; }
    var cols = rows(db, "SELECT name FROM pragma_table_info('" + t + "')").map(function (r) { return r.name; }), pk = t + '_id';
    cols.forEach(function (c) { if (!leg[c] && (OVERLAY[t] || []).indexOf(c) < 0) bad.push(t + '.' + c + ' not a legacy column'); });
    var data = rows(db, 'SELECT * FROM ' + t);
    data.forEach(function (row) {
      judgedRows++;
      Object.keys(leg).forEach(function (c) {
        if (!leg[c].m || leg[c].d !== '' || c === pk || PK_EXEMPT.test(c)) return;
        if (cols.indexOf(c) < 0) { bad.push(t + '.' + c + ' mandatory, missing column'); return; }
        if (row[c] === null || row[c] === undefined || row[c] === '') bad.push(t + '.' + c + ' mandatory, empty in id ' + row[pk]);
      });
    });
  });
  var c0ok = judgedRows > 0 && bad.length === 0;
  if (!c0ok) fails++; log('§TASKER_C0_legacy_columns_and_mandatory ' + (c0ok ? 'PASS' : 'FAIL') + ' ' + JSON.stringify({ tables: FIX_TABLES.length, rows_judged: judgedRows, problems: bad, problem_count: bad.length }));
  // the fixture rows are all-mandatory for what legacy marks mandatory-no-default; ad_wf_activity/process rows came from the engine, so a missing field there is an engine defect, not a fixture one.
  if (!c0ok) log('§TASKER_C0_NOTE engine-written rows are judged too (ad_wf_process / ad_wf_activity)');

  // R1 — red control: the template with AD_Table_ID = 0 must NOT pass T1
  var dbr = mkdb(SQL, function (d) { d.run('UPDATE ad_workflow SET ad_table_id=0 WHERE ad_workflow_id=1000001'); });
  var red = evalT1(dbr), detected = red.ok === false && red.r.ok === false && cnt(dbr, 'ad_wf_process') === 0;
  log('§TASKER_R1 workflow.AD_Table_ID=0 -> T1 ' + (red.ok ? 'PASSED (control NOT detected)' : 'FAILED as required') + ' ' + JSON.stringify({ started: red.r.ok, reason: red.r.reason, process_rows: cnt(dbr, 'ad_wf_process') }));
  if (!detected) fails++;

  var verdict = judged === 0 ? 'INCONCLUSIVE' : (fails ? 'FAIL' : 'PASS');
  log('§W-TASKER-CONTRACT_R1 red_control=' + (detected ? 'detected' : 'NOT-DETECTED'));
  log('§W-TASKER-CONTRACT checks=' + judged + ' fail=' + fails + ' verdict=' + verdict + ' (T1-T5; C0 columns check and R1 red control are inside fail=)');
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { log('§W-TASKER-CONTRACT checks=5 fail=1 verdict=FAIL harness ' + (e && e.stack || e)); process.exit(1); });
