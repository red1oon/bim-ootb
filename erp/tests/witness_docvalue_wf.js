#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOCVALUE-WF (spec prompts/CAPEX_DASHBOARD.md §11.1). READ THE LOG after every run: verdict = §DVWF_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: legacy iDempiere starts every document-value workflow (AD_Workflow.WorkflowType='V') whose DocValueLogic is true after a save (PO.saveFinish :2806-2817 →
//   DocWorkflowManager.process :70-125) and SUSPENDS at a user node (MWFActivity.performWork :1389-1393 → WFState OS). GardenWorld's "Business Partner Approval" (131, C_BPartner,
//   @Created@=@Updated@, node 244 action W) therefore leaves one pending approval per NEW business partner — the CAPEX "Approval Pending" tile counts them (legacy 261 vs SQLite 10, §10).
//   The SQLite kernel must do the same: same rows, same states. Legacy oracle values (read-only psql on idempiere_pilot, BP 1000473 created 2026-10-21): activity wf 131 / node 244 / OS /
//   Processed N / AD_Table 291 / Record_ID = BP; process OS; event audit (244, SC, OS).
// Breaks (MUST exit 1): DOCVALUE_BREAK=1 (the trigger is switched off in the model layer).
'use strict';
var path = require('path'), C = require('./dd_common.js');
var judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §DVWF ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + JSON.stringify(info) : '')); }
(async function () {
  var H = await C.boot();
  var OV = require(path.join(C.ERP, 'ad_docvalue_overlay.js')).ensure(H.db);   // the boot overlay, as idempiere.html / ws_kernel.js / ws_server.js apply it
  if (process.env.DOCVALUE_BREAK) H.envFlags.noDocValue = true;
  var wf = H.one("SELECT ad_workflow_id AS id, ad_table_id AS t, docvaluelogic AS l, ad_wf_node_id AS n FROM ad_workflow WHERE workflowtype='V' AND ad_workflow_id=131");
  log('§DVWF_FIXTURE patch ok=' + H.patchOk + ' bad=' + H.patchBad + ' wf131=' + JSON.stringify(wf));
  if (!wf) { log('§DVWF_VERDICT INCONCLUSIVE judged=0 reason=workflow 131 absent from seed+patch (DATA half of §11.1 not shipped)'); process.exit(1); }
  var T = await require(path.join(H.ERP, '..', 'capex', 'tests', 'pa_harness.js')).init({ quiet: true }), A = require(path.join(H.ERP, '..', 'capex', 'adapters.js'));
  var approvals = function () { var data = A.fromSqlite({ exec: function (s) { return H.db.exec(s); } }); return T.flatten(T.compute(data, { status: 'all', today: H.TODAY }).tiles).approvals; };
  var cnt = function (t, w, p) { return Number(H.one('SELECT COUNT(*) AS c FROM ' + t + ' WHERE ' + w, p || []).c); };
  var tile0 = approvals(), act0 = cnt('ad_wf_activity', "ad_table_id=291 AND wfstate='OS' AND processed='N'");
  // (1) a new business partner
  var r = H.save('c_bpartner', { ad_org_id: 0, value: 'DVWF-1', name: 'Doc-value witness BP', c_bp_group_id: 103, iscustomer: 'Y' });
  if (!r.ok) { log('§DVWF_VERDICT FAIL judged=0 reason=BP save refused: ' + r.msg + ' ' + (r.error || '')); process.exit(1); }
  var bp = H.lastId('c_bpartner');
  var acts = H.q('SELECT * FROM ad_wf_activity WHERE ad_table_id=291 AND record_id=?', [bp]), procs = H.q('SELECT * FROM ad_wf_process WHERE ad_table_id=291 AND record_id=?', [bp]);
  var auds = H.q('SELECT * FROM ad_wf_eventaudit WHERE ad_table_id=291 AND record_id=?', [bp]);
  log('§DVWF_NEW bp=' + bp + ' activities=' + JSON.stringify(acts.map(function (a) { return [a.ad_workflow_id, a.ad_wf_node_id, a.wfstate, a.processed, a.ad_wf_responsible_id, a.ad_user_id]; }))
    + ' processes=' + JSON.stringify(procs.map(function (p) { return [p.ad_workflow_id, p.wfstate, p.processed, p.ad_wf_responsible_id, p.ad_user_id]; }))
    + ' audits=' + JSON.stringify(auds.map(function (a) { return [a.ad_wf_node_id, a.eventtype, a.wfstate]; })));
  check('W1a one-activity-per-new-BP', acts.length === 1, { got: acts.length, legacy: 1 });
  var a = acts[0] || {};
  check('W1b activity=wf131/node244/OS/unprocessed', a.ad_workflow_id == 131 && a.ad_wf_node_id == 244 && a.wfstate === 'OS' && a.processed === 'N', { got: [a.ad_workflow_id, a.ad_wf_node_id, a.wfstate, a.processed], legacy: [131, 244, 'OS', 'N'] });
  check('W1e responsible/user = legacy (activity 100/100, process 101/101)', a.ad_wf_responsible_id == 100 && a.ad_user_id == 100 && procs.length === 1 && procs[0].ad_wf_responsible_id == 101 && procs[0].ad_user_id == 101,
    { got: [a.ad_wf_responsible_id, a.ad_user_id, procs[0] && procs[0].ad_wf_responsible_id, procs[0] && procs[0].ad_user_id], legacy: [100, 100, 101, 101] });
  check('W1c one-process-OS', procs.length === 1 && procs[0].wfstate === 'OS' && procs[0].processed === 'N', { got: procs.map(function (p) { return p.wfstate + '/' + p.processed; }), legacy: ['OS/N'] });
  check('W1d audit=244/SC/OS', auds.length === 1 && auds[0].ad_wf_node_id == 244 && auds[0].eventtype === 'SC' && auds[0].wfstate === 'OS', { got: auds.map(function (x) { return [x.ad_wf_node_id, x.eventtype, x.wfstate]; }), legacy: [[244, 'SC', 'OS']] });
  // (2) a later change of the same BP: Updated != Created ⇒ logic false ⇒ nothing new
  var u = H.update('c_bpartner', bp, { name: 'Doc-value witness BP (renamed)' });
  check('W2 update-starts-nothing', u.ok && cnt('ad_wf_activity', 'ad_table_id=291 AND record_id=?', [bp]) === 1, { ok: u.ok, activities: cnt('ad_wf_activity', 'ad_table_id=291 AND record_id=?', [bp]) });
  // (3) a table with no document-value workflow
  var before3 = cnt('ad_wf_activity', '1=1'), p3 = H.save('c_project', { ad_org_id: 11, value: 'DVWF-P', name: 'Doc-value witness project', c_currency_id: 100 });
  check('W3 no-V-workflow-table-starts-nothing', p3.ok && cnt('ad_wf_activity', '1=1') === before3, { ok: p3.ok, msg: p3.msg, delta: cnt('ad_wf_activity', '1=1') - before3 });
  // (6) the CAPEX tile reads it: +1 per new BP, same compute both sides (tiles.js untouched)
  var tile1 = approvals(), act1 = cnt('ad_wf_activity', "ad_table_id=291 AND wfstate='OS' AND processed='N'");
  log('§DVWF_TILE approvals before=' + tile0 + ' after=' + tile1 + ' (BP OS activities ' + act0 + ' → ' + act1 + ')');
  check('W6 approval-tile+1', Number(tile1) === Number(tile0) + 1, { before: tile0, after: tile1 });
  var mlog = H.logs.filter(function (l) { return /§MODEL-WF|§MODEL-DOCVALUE/.test(l); });
  mlog.forEach(function (l) { log('  ' + l.slice(0, 240)); });
  log('§DVWF_VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails + (process.env.DOCVALUE_BREAK ? ' (DOCVALUE_BREAK=1: FAIL expected)' : ''));
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { log('§DVWF_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
