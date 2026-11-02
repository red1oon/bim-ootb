/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_erp_rest_push.js — the critical POC for prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §3.
// PROVES: the REST client (viewer/erp_rest_push.js) issues the right sequence of calls, the right
// XML shapes, and is idempotent on a 2nd push — against a mock server that speaks the SAME wire
// contract real iDempiere does (verified from source, see mock_adinterface_server.js header).
// DOES NOT prove a real iDempiere accepts it — no real instance is reachable from this machine.
// Read the log after this run — §-tagged lines are the evidence, exit code alone is not.
'use strict';
var ErpRestPush = require('../viewer/erp_rest_push.js');
var Mock = require('./mock_adinterface_server.js');

var PLAN = {
  building: 'Hospital_Demo',
  phases: [
    {
      name: 'Substructure', seqno: 1, startDate: '2026-01-01', endDate: '2026-01-15',
      tasks: [{ name: 'Concrete Crew' }],
      lines: [
        { productValue: 'IFCWALL-CONC', productName: 'Concrete Wall', categoryName: 'Structure', qty: 40, price: 120, plannedAmt: 4800 },
        { productValue: 'IFCSLAB-CONC', productName: 'Concrete Slab', categoryName: 'Structure', qty: 10, price: 300, plannedAmt: 3000 }
      ]
    },
    {
      name: 'Superstructure', seqno: 2, startDate: '2026-01-16', endDate: '2026-02-10',
      tasks: [{ name: 'Framing Crew' }],
      lines: [
        { productValue: 'IFCCOLUMN-STEEL', productName: 'Steel Column', categoryName: 'Structure', qty: 20, price: 500, plannedAmt: 10000 }
      ]
    }
  ]
};

function countCalls(log, op) { return log.filter(function (l) { return l.op === op; }).length; }
function countCreates(created) { return created.categories + created.products + created.projects + created.phases + created.tasks + created.lines; }

var mock = Mock.createMockServer();
mock.listen(0, function () {
  var port = mock.address().port;
  var cfg = { baseUrl: 'http://127.0.0.1:' + port, login: { user: 'SuperUser', pass: 'System', clientId: 11, roleId: 102, orgId: 11, warehouseId: 0 } };
  var failures = [];

  console.log('§POC_ERP_REST_PUSH_START port=' + port);

  ErpRestPush.pushProjectOrder(cfg, PLAN)
    .then(function (run1) {
      // ── Assertion 1: 1st run creates exactly the expected rows ──
      // 1 project + 2 phases + 2 tasks + 1 category (Structure, shared) + 3 products + 3 lines = 12
      var expected1 = { projects: 1, phases: 2, tasks: 2, categories: 1, products: 3, lines: 3 };
      Object.keys(expected1).forEach(function (k) {
        if (run1.created[k] !== expected1[k])
          failures.push('run1.created.' + k + '=' + run1.created[k] + ' expected ' + expected1[k]);
      });
      console.log('§POC_RUN1 created=' + JSON.stringify(run1.created) + ' expected=' + JSON.stringify(expected1) +
        (failures.length ? ' MISMATCH' : ' OK'));

      var callsAfterRun1 = mock.callLog.length;

      return ErpRestPush.pushProjectOrder(cfg, PLAN).then(function (run2) {
        // ── Assertion 2: idempotent — 2nd run creates +0 new rows, but still queries every row ──
        var total2 = countCreates(run2.created);
        if (total2 !== 0) failures.push('run2 created ' + total2 + ' rows, expected 0 (idempotency broken)');
        console.log('§POC_RUN2 created=' + JSON.stringify(run2.created) + (total2 === 0 ? ' OK (+0, idempotent)' : ' MISMATCH'));

        var queryCalls2 = mock.callLog.slice(callsAfterRun1).filter(function (l) { return l.op === 'query_data'; }).length;
        var createCalls2 = mock.callLog.slice(callsAfterRun1).filter(function (l) { return l.op === 'create_data'; }).length;
        if (createCalls2 !== 0) failures.push('run2 issued ' + createCalls2 + ' create_data calls, expected 0');
        console.log('§POC_RUN2_CALLS query=' + queryCalls2 + ' create=' + createCalls2 + (createCalls2 === 0 ? ' OK' : ' MISMATCH'));

        // ── Assertion 3: the field-whitelist rejection path is real (§5 finding) ──
        return ErpRestPush.pushProjectOrder(cfg, {
          building: 'Hospital_Demo',
          phases: [{ name: 'Substructure', seqno: 1, startDate: '2026-01-01', endDate: '2026-01-15', tasks: [], lines: [] }]
        }).then(function () {
          // that call is all-whitelisted fields, won't trigger rejection — test rejection directly:
          var badXml = ErpRestPush.buildCrudXml(cfg.login, {
            serviceType: 'BIMOOTB_Project', tableName: 'C_Project', action: 'Create',
            fields: [{ column: 'Value', val: 'X' }, { column: 'NotOnWhitelist', val: 'Y' }]
          });
          return fetch(cfg.baseUrl + '/ADInterface/services/rest/model_adservice/create_data', {
            method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: badXml
          }).then(function (res) { return res.text(); }).then(function (text) {
            var resp = ErpRestPush.parseStandardResponse(text);
            var rejected = resp.isError && /not allowed/.test(resp.error || '');
            if (!rejected) failures.push('field-whitelist rejection NOT triggered as expected: ' + JSON.stringify(resp));
            console.log('§POC_WHITELIST_REJECT isError=' + resp.isError + ' error="' + resp.error + '"' + (rejected ? ' OK' : ' MISMATCH'));
          });
        });
      });
    })
    .then(function () {
      // D1 (prompts/CAPEX_DASHBOARD.md §12.1): a legacy WS type is bound to ONE method (AbstractService.authenticate :223-252). Against a mock that enforces it, the push must use a
      //   query type for query_data and a create type for create_data. Before the fix the bridge sent one type to both → every find-or-create failed ("Service type … not configured").
      var T = ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine', 'M_Product', 'M_Product_Category'], methodOf = {}, pairs = {};
      T.forEach(function (t) { pairs[t] = { query: 'Query_' + t, create: 'Create_' + t }; methodOf['Query_' + t] = 'query_data'; methodOf['Create_' + t] = 'create_data'; });
      var bound = Mock.createMockServer({ methodOf: methodOf, nsPrefix: true });   // + D3: the real server's namespace-prefixed replies
      return new Promise(function (resolve) { bound.listen(0, resolve); }).then(function () {
        var cfg2 = { baseUrl: 'http://127.0.0.1:' + bound.address().port, login: cfg.login, serviceTypes: pairs };
        return ErpRestPush.pushProjectOrder(cfg2, PLAN).then(function (r) {
          var n = countCreates(r.created), rej = bound.callLog.length;
          console.log('§POC_D1_METHOD_BOUND created=' + JSON.stringify(r.created) + ' calls=' + rej + (n === 12 ? ' OK' : ' MISMATCH'));
          if (n !== 12) failures.push('D1 method-bound push created ' + n + ', expected 12 (= run 1)');
          if (!(r.projectId > 0)) failures.push('D3 projectId not parsed from the prefixed reply: ' + r.projectId);
        }, function (e) { failures.push('D1 method-bound push failed: ' + (e && e.message)); console.log('§POC_D1_METHOD_BOUND FAIL ' + (e && e.message)); })
          .then(function () { return new Promise(function (r) { bound.close(r); }); });
      });
    })
    .then(function () {
      mock.close(function () {
        console.log('§POC_ERP_REST_PUSH_VERDICT ' + (failures.length ? ('FAIL (' + failures.length + '): ' + failures.join(' | ')) : 'PASS'));
        process.exit(failures.length ? 1 : 0);
      });
    })
    .catch(function (e) {
      console.log('§POC_ERP_REST_PUSH_ERROR ' + (e && e.stack || e));
      mock.close(function () { process.exit(1); });
    });
});
