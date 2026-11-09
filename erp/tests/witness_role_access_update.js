#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ROLE-ACCESS-UPDATE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §HARDEN-SPEC H8). READ THE LOG: every verdict is a §RAU line; the exit code is not the
//   evidence. INCONCLUSIVE when nothing was judged.
// THE ISSUE it proves/disproves: a plugin started AFTER a company was born (the guide's Step 3 done "too late") adds a form the company's admin role cannot open — measured in
//   §B4 RESULT ("a born tenant's admin role gets the form only if the plugin was started BEFORE the tenant was born"). Legacy's answer is the Role Access Update process
//   (AD_Process 295, RoleAccessUpdate.java -> MRole.updateAccessRecords :529-640); the twin had the access logic for NEW roles only, not the process.
// Command: node erp/tests/witness_role_access_update.js
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(key, rule, ok, info) { ALL.judged++; if (!ok) ALL.failed++; say('  §RAU-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  require(path.join(ERP, 'processes', 'RoleAccessUpdate.js'));
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  // 1 — a company is born FIRST (Initial Tenant Setup)
  var born = G.birthTenant({ clientName: 'Early Co', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'earlyAdmin', dateAcct: '2026-11-09', countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-09 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var R = rb.refs, CID = R.clientId, ROLE = R.roleAdminId;
  say('§RAU-TENANT client=' + CID + ' adminRole=' + ROLE);
  // 2 — THEN the plugins are started (the order the guide warns about)
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  function acc(role) { return q('SELECT count(*) AS n FROM ad_form_access WHERE ad_role_id=? AND ad_form_id=9542001', [role])[0].n; }
  function counts(role) { var o = {}; ['ad_window_access', 'ad_process_access', 'ad_form_access', 'ad_document_action_access'].forEach(function (t) { o[t] = q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_role_id=?', [role])[0].n; }); return o; }
  var before = acc(ROLE), proc9540001 = q('SELECT count(*) AS n FROM ad_process_access WHERE ad_role_id=? AND ad_process_id=9540001', [ROLE])[0].n, C0 = counts(ROLE);
  say('§RAU-BEFORE formAccess(9542001)=' + before + ' processAccess(9540001)=' + proc9540001 + ' ' + J(C0));
  check('issue', 'the issue is real: the company born BEFORE the plugin started has no access to its form 9542001 nor to the Ninja process 9540001', before === 0 && proc9540001 === 0, { before: before, proc: proc9540001 });
  // 3 — System runs Role Access Update (AD_Process 295) for every role, ResetAccess=N (its AD default)
  var row = q('SELECT ad_process_id, classname, name FROM ad_process WHERE ad_process_id=295')[0], S0 = { clientId: 0, orgId: 0, userId: 100, roleId: 0, actor: 'witness:rau' };
  check('dictionary', 'AD_Process 295 is the legacy Role Access Update (org.compiere.process.RoleAccessUpdate) and the twin has its port', !!row && row.classname === 'org.compiere.process.RoleAccessUpdate', row);
  var r = AP.runJava(k.q, k.env(S0), { AD_Process_ID: 295, className: row.classname, title: row.name, params: { ResetAccess: 'N' } });
  say('§RAU-RUN ok=' + r.ok + ' ops=' + (r.ops || []).length + ' logs=' + (r.logs || []).length + ' summary=' + J(r.summary));
  (r.logs || []).filter(function (l) { return /Early Co|Web Service/.test(l.msg); }).forEach(function (l) { say('§RAU-LOG ' + l.msg); });
  if (r.ok && r.ops && r.ops.length) k.commit(S0, r.ops, { ws: 'role_access_update' });
  var after = acc(ROLE), proc2 = q('SELECT count(*) AS n FROM ad_process_access WHERE ad_role_id=? AND ad_process_id=9540001', [ROLE])[0].n;
  check('granted', "after Role Access Update the early company's admin can open the form (9542001) and run the Ninja process (9540001)", r.ok && after === 1 && proc2 === 1, { ok: r.ok, after: after, proc2: proc2, summary: r.summary });
  var roles = q("SELECT count(*) AS n FROM ad_role WHERE isactive='Y'")[0].n;
  check('every-role', 'one log line per active role, "<client> - <role>: …" (RoleAccessUpdate.updateRole :107-112) — ' + roles + ' roles', (r.logs || []).length === roles && (r.logs || []).every(function (l) { return / - .+: /.test(l.msg); }), { logs: (r.logs || []).length, roles: roles });
  var man = q("SELECT r.ad_role_id AS id, c.name AS c, r.name AS n FROM ad_role r JOIN ad_client c ON c.ad_client_id=r.ad_client_id WHERE r.ismanual='Y' AND r.isactive='Y'")[0];
  if (man) check('manual', 'a manual role is left alone: its line ends "-" (MRole.updateAccessRecords :531-532)', (r.logs || []).some(function (l) { return l.msg === man.c + ' - ' + man.n + ': -'; }), { man: man });
  var dup = q('SELECT count(*) AS n FROM (SELECT ad_role_id, ad_form_id, count(*) AS c FROM ad_form_access GROUP BY 1, 2 HAVING c > 1)')[0].n + q('SELECT count(*) AS n FROM (SELECT ad_role_id, ad_window_id, count(*) AS c FROM ad_window_access GROUP BY 1, 2 HAVING c > 1)')[0].n;
  check('no-dup', 'no role gets a second row for something it already had (the INSERT … WHERE access IS NULL)', dup === 0, dup);
  // 4 — rerun: nothing left to add (idempotent, legacy's LEFT JOIN … IS NULL)
  var r2 = AP.runJava(k.q, k.env(S0), { AD_Process_ID: 295, className: row.classname, title: row.name, params: { ResetAccess: 'N', AD_Role_ID: ROLE } });
  say('§RAU-RERUN ' + J((r2.logs || []).map(function (l) { return l.msg; })) + ' ops=' + (r2.ops || []).length);
  check('rerun', 'a second run for the same role adds nothing: "@AD_Window_ID@ #0 … #0" translated, no ops', r2.ok && (r2.ops || []).length === 0 && (r2.logs || []).length === 1 && /#0 .*#0 .*#0 .*#0 .*#0 .*#0/.test(r2.logs[0].msg), r2.logs);
  // 5 — ResetAccess=Y: the role's rows are deleted and rebuilt from the dictionary (deleteAccessRecords :682-698) — same counts as before, the hand-revoked row comes back
  var one = q('SELECT * FROM ad_form_access WHERE ad_role_id=? AND ad_form_id=9542001', [ROLE])[0], S1 = { clientId: CID, orgId: 0, userId: 100, roleId: ROLE, actor: 'witness:rau' };
  db.run('DELETE FROM ad_form_access WHERE ad_role_id=? AND ad_form_id=9542001', [ROLE]);   // a revoked grant (the falsifier for the reset path)
  var C1 = counts(ROLE), r3 = AP.runJava(k.q, k.env(S0), { AD_Process_ID: 295, className: row.classname, title: row.name, params: { ResetAccess: 'Y', AD_Role_ID: ROLE } });
  if (r3.ok && r3.ops && r3.ops.length) k.commit(S0, r3.ops, { ws: 'role_access_update' });
  var C2 = counts(ROLE);
  say('§RAU-RESET before=' + J(C1) + ' after=' + J(C2) + ' log=' + J((r3.logs || []).map(function (l) { return l.msg; })));
  check('reset', 'ResetAccess=Y rebuilds the role from the dictionary: the revoked form row is back, the other counts as they were', r3.ok && acc(ROLE) === 1 && C2.ad_window_access === C1.ad_window_access && C2.ad_process_access === C1.ad_process_access && C2.ad_form_access === C1.ad_form_access + 1, { C1: C1, C2: C2, had: !!one });
  // 6 — the browser wiring: the port is loaded by the page and precached
  var html = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8'), sw = fs.readFileSync(path.join(ERP, 'sw.js'), 'utf8');
  check('wiring', 'idempiere.html loads processes/RoleAccessUpdate.js and sw.js precaches it', /<script src="processes\/RoleAccessUpdate\.js/.test(html) && /'processes\/RoleAccessUpdate\.js'/.test(sw), {});
  var v = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§RAU-VERDICT ' + v + ' judged=' + ALL.judged + ' failed=' + ALL.failed);
  process.exit(v === 'PASS' ? 0 : v === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§RAU-ERROR ' + (e && (e.stack || e.message))); process.exit(2); });
