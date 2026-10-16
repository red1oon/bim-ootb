#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-OSGI-CONSOLE (Host work H2; erp/osgi_console.js). READ THE LOG: verdict = §OC-VERDICT.
// THE ISSUE it proves/disproves: the Plugins & Releases console speaks the OSGi/Felix vocabulary a legacy administrator knows - system bundle Id 0, built-ins as always-active bundles, plugin statuses Active / Starting (lazy, started but not
//   activated) / Resolved (a stopped bundle returns to Resolved) / Installed, the Felix summary sentence, a working filter, correct per-state actions, and a detail pane whose "Services registered" is what the REAL PluginRegistry recorded.
//   Break (MUST be red, named): MFG_BREAK=status (STOPPED shown as "Stopped", not OSGi's Resolved).
'use strict';
var path = require('path');
if (!global.window) global.window = {};
var ERP = path.join(__dirname, '..');
var OC = require(path.join(ERP, 'osgi_console.js')), PR = require(path.join(ERP, 'plugin_registry.js')), ML = require(path.join(ERP, 'model_layer.js'));
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0;
function check(n, ok, i) { judged++; if (!ok) fails++; console.log('  §OC ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(i))); }
if (BREAK === 'status') OC.STATUS.STOPPED = 'Stopped';   // BREAK
(async function () {
  var reg = PR.create({ docAction: ML, engineVersion: '1.0.0', import: function (u) { return Promise.resolve(u); } });
  var mk = function (id, lazy) { return { manifest: Object.assign({ id: id, version: '2.1.0', name: 'Libero Manufacturing ' + id, requires: {}, chunks: { hot: [] }, budget: { kb: 300, note: 'test' } }, lazy ? { activation: 'lazy', triggers: { tables: ['PP_Order', 'C_Order'] } } : {}),
    activate: async function (ctx) { ctx.docAction.registerModel('pp_order', { afterSave: function () {} }); ctx.docAction.registerDocAction('pp_order', { completeIt: function () { return 'CO'; } }); } }; };
  var consoleLog = console.log; console.log = function () {};
  await reg.installBundle(mk('org.test.eager', false)); await reg.startBundle('org.test.eager');
  await reg.installBundle(mk('org.test.lazy', true)); await reg.startBundle('org.test.lazy');
  await reg.installBundle(mk('org.test.stopped', false)); await reg.startBundle('org.test.stopped'); await reg.stopBundle('org.test.stopped');
  await reg.installBundle(mk('org.test.fresh', false));
  console.log = consoleLog;
  var BI = [{ id: 'ad_parser', label: 'AD dictionary fold', core: true }, { id: 'pos_lens', label: 'POS terminal lens', core: false }];
  var M = OC.model({ version: 'v844', builtins: BI, plugins: reg.list() });
  var by = {}; M.all.forEach(function (r) { by[r.symbolic] = r; });
  console.log('§OC-MODEL rows=' + M.all.map(function (r) { return r.id + ':' + r.symbolic + '=' + r.status; }).join(' '));
  console.log('§OC-SUMMARY ' + M.summary);
  check('C1 Id 0 is the system bundle, built-ins follow as always-active bundles (no actions), plugins continue the numbering', M.all[0].id === 0 && M.all[0].kind === 'system' && M.all[1].symbolic === 'bim.ad_parser' && M.all[1].status === 'Active' && Object.keys(M.all[1].actions).length === 0 && by['org.test.eager'].id === 3, { first: M.all.slice(0, 4).map(function (r) { return r.id + r.symbolic; }) });
  check('C2 statuses use the OSGi vocabulary: started eager = Active, started lazy = Starting, stopped = Resolved (as OSGi returns a stopped bundle), never started = Installed',
    by['org.test.eager'].status === 'Active' && by['org.test.lazy'].status === 'Starting' && by['org.test.stopped'].status === 'Resolved' && by['org.test.fresh'].status === 'Installed', { s: M.all.map(function (r) { return r.symbolic + '=' + r.status; }) });
  check('C3 the Felix summary sentence with the right counts', M.summary === 'Bundle information: 7 bundles in total - 4 bundles active, 1 bundle starting (lazy), 1 bundle resolved, 1 bundle installed.', { summary: M.summary });
  check('C3b when every bundle is active the sentence is the familiar "all N bundles active"', OC.summaryText({ total: 5, Active: 5, Starting: 0, Resolved: 0, Installed: 0 }, 5, '') === 'Bundle information: 5 bundles in total - all 5 bundles active.', {});
  var a = function (k) { return by[k].actions; };
  check('C4 actions follow the state: Active/Starting can Stop+Refresh, Resolved/Installed can Start, every plugin can be Uninstalled; built-ins have none', a('org.test.eager').stop && a('org.test.eager').refresh && !a('org.test.eager').start && a('org.test.lazy').stop && a('org.test.stopped').start && !a('org.test.stopped').stop && a('org.test.fresh').start && a('org.test.fresh').uninstall && Object.keys(by['bim.pos_lens'].actions).length === 0, {});
  var f1 = OC.model({ version: 'v1', builtins: BI, plugins: reg.list(), filter: 'LAZY' }), f2 = OC.model({ version: 'v1', builtins: BI, plugins: reg.list(), filter: 'resolved' });
  check('C5 the filter matches name/symbolic name/status case-insensitively and is stated in the summary', f1.rows.length === 1 && f1.rows[0].symbolic === 'org.test.lazy' && /Filter "LAZY" shows 1/.test(f1.summary) && f2.rows.length === 1 && f2.rows[0].symbolic === 'org.test.stopped', { f1: f1.rows.length, f2: f2.rows.length });
  var dE = OC.details(by['org.test.eager'], reg.describe('org.test.eager')), dL = OC.details(by['org.test.lazy'], reg.describe('org.test.lazy')), g = function (d, k) { var x = d.filter(function (p) { return p[0] === k; })[0]; return x ? x[1] : null; };
  check('C6 detail pane of an ACTIVE bundle lists the services the registry recorded (IModelFactory + DocAction class), its budget and hot-chunk count', Array.isArray(g(dE, 'Services registered')) && g(dE, 'Services registered').some(function (x) { return /IModelFactory\s+pp_order/.test(x); }) && g(dE, 'Services registered').some(function (x) { return /DocAction class\s+pp_order/.test(x); }) && /300 KB/.test(g(dE, 'Declared budget')), { svc: g(dE, 'Services registered') });
  check('C7 detail pane of a STARTING lazy bundle states it is not active (no services yet), shows its triggers and the Lazy policy', /none - the bundle is not active/.test(g(dL, 'Services registered')) && /PP_Order, C_Order/.test(g(dL, 'Lazy triggers')) && g(dL, 'Activation Policy') === 'lazy' && /activates on first demand/.test(g(dL, 'Status')), { dL: dL });
  console.log('§OC-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§OC-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
