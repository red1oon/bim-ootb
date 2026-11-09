#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SCHEMA-ELEMENTS (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C-SPEC, build status "second genesis gap"; TWIN CARDINAL RULE). READ THE LOG after every
//   run: every verdict is a §SE line, the exit code is not the evidence. INCONCLUSIVE when nothing was judged.
// SPEC (claims, written before the code; each names the issue it proves/disproves):
//   (a) ISSUE "a tenant born by the ported Initial Client Setup has NO C_AcctSchema_Element row" (measured 2026-11-10 on origin/main: 0 rows; GardenWorld in the seed has 12).
//       Legacy MSetup.java:556-660 creates them. ORACLE = the legacy pilot tenant (docker postgres idempiere_pilot, AD_Client_ID=1000000, born by Initial Client Setup 2026-10-12),
//       read 2026-11-10: OO|Organization|10|Y|Y|Org_ID set · AC|Account|20|Y|N|C_Element_ID + C_ElementValue_ID (the DEFAULT_ACCT account) set · PR|Product|30|N|N · BP|BPartner|40|N|N.
//   (b) ISSUE "an account cannot be resolved through the schema": ImportGLJournal.java:398-408 "Set Account from Value" joins C_AcctSchema_Element (ElementType AC) — on a born
//       tenant it must find the account of a chart Value (it answered "Invalid Account" for every row before).
//   (c) the ids survive the install re-band: Org_ID / C_Element_ID / C_ElementValue_ID / C_AcctSchema_ID point at rows of the SAME tenant.
//   (d) FALSIFIER: the same birth with the element rows dropped must make (a) and (b) FAIL.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var ORACLE = [['OO', 'Organization', 10, 'Y', 'Y'], ['AC', 'Account', 20, 'Y', 'N'], ['PR', 'Product', 30, 'N', 'N'], ['BP', 'BPartner', 40, 'N', 'N']];
async function runCase(label, drop) {
  var judged = 0, failed = 0;
  function check(key, rule, ok, info) { judged++; if (!ok) failed++; say('  §SE-CHECK case=' + label + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, G = require(path.join(ERP, 'genesis.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); }, run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'Element Co ' + label, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'el' + label, dateAcct: '2026-11-10', countryId: 100 });
  if (drop) born.groups.forEach(function (g) { g.ops = g.ops.filter(function (o) { return o.table !== 'c_acctschema_element'; }); });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var C = rb.refs.clientId, AS = rb.refs.acctSchemaId;
  var rows = q('SELECT e.elementtype AS t, e.name AS n, e.seqno AS s, e.ismandatory AS m, e.isbalanced AS b, e.isactive AS a, e.ad_org_id AS o, e.org_id AS org, e.c_element_id AS el, e.c_elementvalue_id AS ev, e.c_acctschema_id AS sch FROM c_acctschema_element e WHERE e.ad_client_id=? ORDER BY e.seqno', [C]);
  say('§SE-TENANT case=' + label + ' client=' + C + ' elements=' + rows.length + ' ' + JSON.stringify(rows.map(function (r) { return [r.t, r.n, r.s, r.m, r.b].join('|'); })));
  check('oracle', 'the born tenant\'s C_AcctSchema_Element rows == the legacy pilot tenant\'s (type, name, SeqNo, IsMandatory, IsBalanced): ' + ORACLE.map(function (o) { return o.join('|'); }).join(' · ') + '; all active, org *', JSON.stringify(rows.map(function (r) { return [r.t, r.n, Number(r.s), r.m, r.b]; })) === JSON.stringify(ORACLE) && rows.every(function (r) { return r.a === 'Y' && Number(r.o) === 0; }), rows);
  var oo = rows.filter(function (r) { return r.t === 'OO'; })[0] || {}, ac = rows.filter(function (r) { return r.t === 'AC'; })[0] || {};
  var org = q('SELECT ad_client_id AS c FROM ad_org WHERE ad_org_id=?', [oo.org || -1])[0], el = q('SELECT ad_client_id AS c FROM c_element WHERE c_element_id=?', [ac.el || -1])[0], ev = q('SELECT ad_client_id AS c, name FROM c_elementvalue WHERE c_elementvalue_id=?', [ac.ev || -1])[0];
  check('same-tenant', 'after the install re-band OO.Org_ID is an org of this tenant, AC.C_Element_ID its account element, AC.C_ElementValue_ID its "Default account", every row on its schema', !!org && org.c === C && !!el && el.c === C && !!ev && ev.c === C && ev.name === 'Default account' && rows.every(function (r) { return Number(r.sch) === Number(AS); }), { org: org, el: el, ev: ev, AS: AS });
  var hit = q("SELECT MAX(ev.c_elementvalue_id) AS id FROM c_elementvalue ev INNER JOIN c_element e ON (e.c_element_id=ev.c_element_id) INNER JOIN c_acctschema_element ase ON (e.c_element_id=ase.c_element_id AND ase.elementtype='AC') WHERE ev.value=? AND ev.issummary='N' AND ?=ase.c_acctschema_id AND ?=ev.ad_client_id", ['11100', AS, C])[0];
  check('resolves', 'ImportGLJournal.java:398-408 "Set Account from Value" finds the account of chart Value 11100 through the schema\'s AC element', !!hit && hit.id != null, hit);
  var v = !judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS'; say('§SE-' + label + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed); return v;
}
(async function () {
  var real = await runCase('REAL', false), mut = await runCase('MUTANT', true);
  say('§SE-FALSIFIER mutant (element rows dropped) verdict=' + mut + (mut === 'FAIL' ? ' → CAUGHT' : ' → NOT CAUGHT'));
  var all = real === 'PASS' && mut === 'FAIL' ? 'PASS' : real === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'FAIL';
  say('§SE-VERDICT ' + all + ' real=' + real + ' mutant=' + mut); process.exit(all === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SE-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
