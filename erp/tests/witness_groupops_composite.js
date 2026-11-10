#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GROUPOPS-COMPOSITE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C BUILD STATUS "Open, named (a)"). READ THE LOG: §GOC lines; the exit code is not evidence.
// THE ISSUE it proves/disproves: Trx.groupOps writes a CREATE's forward reference (a field pointing at a row created LATER in the same group) as a trailing UPDATE. For a table
//   WITHOUT a single key column (C_Charge_Acct: key = C_Charge_ID + C_AcctSchema_ID, addressed by its _UU) that UPDATE carried no idCol, so the applier wrote
//   "WHERE c_charge_acct_id=?" → "no such column" and the whole commit failed (met when an Opening Charge's accounting row was pointed at a valid combination made after it).
// SPEC: (a) such a group's trailing UPDATE names idCol = <table>_uu; (b) the commit applies and the row holds the id the later CREATE got; (c) a single-key table's trailing
//   UPDATE still carries NO idCol (unchanged: the applier's default <table>_id); (d) FALSIFIER: the same op with idCol removed makes the commit throw.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var judged = 0, failed = 0, J = JSON.stringify;
function check(key, rule, ok, info) { judged++; if (!ok) failed++; say('  §GOC-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900))); }
(async function () {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), ML = k.ML;
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, actor: 'witness:groupops-composite' };
  var pair = { sch: (k.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=11', [])[0] || {}).a }, TAXCAT = (k.q('SELECT c_taxcategory_id AS id FROM c_taxcategory WHERE ad_client_id=11 ORDER BY 1 LIMIT 1', [])[0] || {}).id;
  var ev = k.q("SELECT c_elementvalue_id AS id FROM c_elementvalue WHERE ad_client_id=11 AND issummary='N' ORDER BY 1 LIMIT 1", [])[0];
  if (!pair.sch || !ev || !TAXCAT) { say('§GOC-VERDICT INCONCLUSIVE (the seed has no schema / account / tax category for client 11: nothing to judge)'); process.exit(3); }
  var NAME = 'GOC charge';
  function build() { var trx = new ML.Trx(k.q, k.env(S));
    var chg = trx.insert('c_charge', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: NAME, chargeamt: 0, issametax: 'N', issamecurrency: 'N', istaxincluded: 'N', c_taxcategory_id: TAXCAT });   // a raw insert: no afterNew, the accounting row is made by hand below
    var a = trx.insert('c_charge_acct', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', c_charge_id: chg.c_charge_id, c_acctschema_id: pair.sch, c_charge_acct_uu: global.crypto.randomUUID() });
    var vc = trx.insert('c_validcombination', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', c_acctschema_id: pair.sch, account_id: ev.id, isfullyqualified: 'Y' });   // created AFTER the row that points at it
    trx.update('c_charge_acct', a, { ch_expense_acct: vc.c_validcombination_id });
    return trx.groupOps(); }
  var ops = build(), tail = ops.filter(function (o) { return o.op_type === 'CRUD_UPDATE' && o.table === 'c_charge_acct'; });
  say('§GOC-OPS ' + J(ops.map(function (o) { return o.op_type + ' ' + o.table + (o.idCol ? ' idCol=' + o.idCol : ''); })));
  check('idcol', 'the trailing UPDATE of a C_Charge_Acct row (no single key column) names idCol = c_charge_acct_uu', tail.length === 1 && tail[0].idCol === 'c_charge_acct_uu', tail);
  // falsifier first, on a copy: without idCol the commit throws
  var bad = JSON.parse(J(ops)); bad.forEach(function (o) { if (o.op_type === 'CRUD_UPDATE' && o.table === 'c_charge_acct') delete o.idCol; });
  var threw = ''; try { k.db.run('SAVEPOINT goc'); k.commit(S, bad, { ws: 'goc' }); } catch (e) { threw = String(e && e.message); } try { k.db.run('ROLLBACK TO goc'); k.db.run('RELEASE goc'); } catch (e2) {}
  check('falsifier', 'the same group with idCol removed makes the commit throw "no such column: c_charge_acct_id" (the defect as it was)', /no such column: c_charge_acct_id/.test(threw), threw || 'did not throw');
  var gone = k.q('SELECT count(*) AS n FROM c_charge WHERE ad_client_id=11 AND name=?', [NAME])[0].n;
  var err = ''; if (gone === 0) { try { k.commit(S, build(), { ws: 'goc' }); } catch (e) { err = String(e && e.message); } }
  var row = k.q('SELECT a.ch_expense_acct AS vc, v.account_id AS acct FROM c_charge_acct a LEFT JOIN c_validcombination v ON v.c_validcombination_id=a.ch_expense_acct JOIN c_charge ch ON ch.c_charge_id=a.c_charge_id WHERE ch.ad_client_id=11 AND ch.name=? AND a.c_acctschema_id=?', [NAME, pair.sch]);
  check('applied', 'after the refused falsifier left nothing behind, the real group applies: ONE C_Charge_Acct row whose Ch_Expense_Acct is the valid combination created later in the same group (its account = ' + ev.id + ')', gone === 0 && !err && row.length === 1 && Number(row[0].acct) === Number(ev.id), { gone: gone, err: err, row: row });
  var t2 = new ML.Trx(k.q, k.env(S)), inv = t2.insert('c_bpartner', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', value: 'GOC-A', name: 'GOC-A' }), later = t2.insert('c_bpartner', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', value: 'GOC-B', name: 'GOC-B' });
  t2.update('c_bpartner', inv, { bpartner_parent_id: later.c_bpartner_id });
  var u2 = t2.groupOps().filter(function (o) { return o.op_type === 'CRUD_UPDATE' && o.table === 'c_bpartner'; });
  check('single-key', 'a single-key table\'s trailing UPDATE still carries no idCol (the applier\'s default <table>_id) — unchanged', u2.length === 1 && u2[0].idCol === undefined, u2);
  var v = !judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS'; say('§GOC-VERDICT ' + v + ' judged=' + judged + ' failed=' + failed); process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§GOC-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
