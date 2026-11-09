#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PERIOD-CONTROL (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C-SPEC step 0; TWIN CARDINAL RULE). READ THE LOG after every run: every verdict is a §PC line,
//   the exit code is not the evidence. The verdict prints INCONCLUSIVE when nothing was judged.
// SPEC (claims, written before the code; each names the issue it proves/disproves):
//   (a) ISSUE "a tenant born by the ported Initial Client Setup has 12 periods and 0 C_PeriodControl rows" (measured 2026-11-10, origin/main): the BEFORE line below is the
//       mutant tenant (the creation pass dropped) and must show controls=0.
//   (b) ISSUE "controls are not what legacy makes": MSetup.java:853-858 runs DocumentTypeVerify last → createPeriodControls (DocumentTypeVerify.java:130-197) = one row per period
//       x DISTINCT DocBaseType of the client's doc types, PeriodStatus N, PeriodAction N (MPeriodControl.java:67-70). Expected counts come from the tenant's own c_period/c_doctype rows.
//   (c) ISSUE "the period gate is wrong with Automatic Period Control off": MPeriod.isOpen (MPeriod.java:704-760) → C_PeriodControl must be 'O'; a past date is NOT open while all are N.
//   (d) ISSUE "the ported Period Status process (AD_Process 167, PeriodStatus.java:53-166) cannot open a born tenant's period": after action O, periodOpen is true for GLJ ARI API ARC APC;
//       a DocBaseType not asked (still N elsewhere: another period) stays closed (negative control).
//   (e) ISSUE "automatic control changed": with AutoPeriodControl=Y the gate is today -/+ history/future days, regardless of control rows (past date refused, today accepted).
//   (f) FALSIFIER: the same tenant born WITHOUT the creation pass (G5b dropped) must make (b) and (d) FAIL — otherwise the witness cannot tell.
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var BT = ['GLJ', 'ARI', 'API', 'ARC', 'APC'], PAST = '2026-03-15';

async function runCase(label, dropControls) {
  var checks = [];
  function check(key, rule, ok, info) { checks.push({ key: key, ok: !!ok }); say('  §PC-CHECK case=' + label + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) {} });
  var MT = require(path.join(ERP, 'model_trade.js')), G = require(path.join(ERP, 'genesis.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'Period Co', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'pcAdmin', dateAcct: '2026-11-09', countryId: 100 });
  var groups = dropControls ? born.groups.filter(function (g) { return !/period control/.test(g.label); }) : born.groups;
  var rb = G.rebandGenesis({ groups: groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-09 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var R = rb.refs, CID = R.clientId, S = { clientId: CID, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:period-control' };
  var nP = q('SELECT count(*) AS n FROM c_period WHERE ad_client_id=?', [CID])[0].n;
  var dbts = q('SELECT DISTINCT docbasetype AS d FROM c_doctype WHERE ad_client_id=?', [CID]).map(function (r) { return r.d; });
  var ctls = q('SELECT * FROM c_periodcontrol WHERE ad_client_id=?', [CID]);
  say('§PC-' + (dropControls ? 'BEFORE' : 'TENANT') + ' case=' + label + ' client=' + CID + ' periods=' + nP + ' distinctDocBaseTypes=' + dbts.length + ' controls=' + ctls.length);

  // (b)
  check('count', 'controls == periods x distinct DocBaseTypes (DocumentTypeVerify.java:150-156)', nP > 0 && ctls.length === nP * dbts.length, { periods: nP, dbts: dbts.length, controls: ctls.length });
  check('status', 'every control is PeriodStatus N, PeriodAction N (MPeriodControl.java:67-70)', ctls.length > 0 && ctls.every(function (c) { return c.periodstatus === 'N' && c.periodaction === 'N'; }), ctls.slice(0, 2));
  var pairs = {}; ctls.forEach(function (c) { pairs[c.c_period_id + '|' + c.docbasetype] = (pairs[c.c_period_id + '|' + c.docbasetype] || 0) + 1; });
  check('unique', 'no (period, DocBaseType) twice (the "Delete Duplicates" step of createPeriodControls :135-147)', ctls.length > 0 && Object.keys(pairs).every(function (p) { return pairs[p] === 1; }), {});

  // (c)/(e): the gate, read through the model (ModelTrade.periodOpen) in one Trx
  function gate(date, dbt) { return k.inTrx(S, {}, function (trx) { return { ok: true, v: MT.periodOpen(trx, date, dbt, R.orgId) }; }).v; }
  var today = k.env(S).date.slice(0, 10);
  var as = q('SELECT a.* FROM c_acctschema a WHERE a.ad_client_id=?', [CID])[0];
  check('auto_default', 'born schema has AutoPeriodControl=Y', as && as.autoperiodcontrol === 'Y', as && as.autoperiodcontrol);
  // (e) automatic ON
  check('auto_past_closed', 'AutoPeriodControl=Y: a date months before today is NOT open (today-history rule)', BT.every(function (b) { return gate(PAST, b) === false; }), BT.map(function (b) { return gate(PAST, b); }));
  var inRange = q('SELECT count(*) AS n FROM c_period WHERE ad_client_id=? AND date(startdate)<=date(?) AND date(enddate)>=date(?)', [CID, today, today])[0].n;
  if (inRange) check('auto_today_open', 'AutoPeriodControl=Y: today is open for every DocBaseType, with the controls at N (rows are not consulted)', BT.every(function (b) { return gate(today, b) === true; }), BT.map(function (b) { return gate(today, b); }));
  else say('§PC-NOTE case=' + label + ' today ' + today + ' is outside the born year: auto_today_open not judged');
  // (c) automatic OFF
  db.run('UPDATE c_acctschema SET autoperiodcontrol=? WHERE ad_client_id=?', ['N', CID]);
  check('off_closed', 'AutoPeriodControl=N, controls N: the past date is NOT open for any DocBaseType (MPeriod.isOpen → C_PeriodControl)', BT.every(function (b) { return gate(PAST, b) === false; }), BT.map(function (b) { return gate(PAST, b); }));
  // (d) Period Status 167, action O, on the period of PAST
  var per = q('SELECT c_period_id AS id FROM c_period WHERE ad_client_id=? AND date(startdate)<=date(?) AND date(enddate)>=date(?)', [CID, PAST, PAST])[0];
  var other = q('SELECT c_period_id AS id FROM c_period WHERE ad_client_id=? AND c_period_id<>? ORDER BY c_period_id', [CID, per.id])[0];
  var row = q('SELECT classname AS c, name AS n FROM ad_process WHERE ad_process_id=167')[0];
  var res = k.inTrx(S, {}, function (trx) { var r = AP.runJava(k.q, trx.env, { AD_Process_ID: 167, className: row.c, title: row.n, Record_ID: per.id, Table_ID: 142, params: { PeriodAction: 'O' }, trx: trx }); return { ok: !!r.ok, summary: String(r.summary || '') }; });
  say('§PC-PROC167 case=' + label + ' ok=' + res.ok + ' summary=' + JSON.stringify(res.summary));
  var after = q('SELECT docbasetype AS d, periodstatus AS s FROM c_periodcontrol WHERE c_period_id=?', [per.id]);
  check('opened', 'after Period Status O the PAST date is open for GLJ ARI API ARC APC (end of chain: ModelTrade.periodOpen sees it)', BT.every(function (b) { return gate(PAST, b) === true; }), { gate: BT.map(function (b) { return gate(PAST, b); }), rows: after.length });
  check('neg_other_period', 'NEGATIVE CONTROL: another period stays closed', gate(q('SELECT startdate AS s FROM c_period WHERE c_period_id=?', [other.id])[0].s.slice(0, 10), 'ARI') === false, {});
  var v = !checks.length ? 'INCONCLUSIVE' : checks.some(function (c) { return !c.ok; }) ? 'FAIL' : 'PASS';
  say('§PC-' + label + ' verdict=' + v + ' judged=' + checks.length + ' failed=' + checks.filter(function (c) { return !c.ok; }).length);
  return v;
}

(async function main() {
  var real = await runCase('REAL', false);
  var mut = await runCase('MUTANT-NO-CONTROLS', true);
  say('§PC-FALSIFIER mutant (creation pass dropped) verdict=' + mut + ' → ' + (mut === 'FAIL' ? 'CAUGHT (witness can tell)' : 'NOT CAUGHT (witness is blind)'));
  var v = real === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : (real === 'PASS' && mut === 'FAIL') ? 'PASS' : 'FAIL';
  say('§PC-VERDICT ' + v + ' real=' + real + ' mutant=' + mut);
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§PC-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
