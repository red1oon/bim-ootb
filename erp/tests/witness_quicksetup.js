#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-QUICKSETUP-EQUALS-WIZARD (bim-compiler prompts/ERP_DEPTH_FILM.md §QUICKSETUP; TWIN rule: the legacy-identical Initial Client Setup stays default, Quick setup is OPTIONAL).
//   READ THE LOG after every run: every verdict is a §QS line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: an optional "Quick setup" (name + country only) must (1) DERIVE every other answer from the dictionary — currency = C_Country.C_Currency_ID, admin user =
//   AD_Process_Para(53161, AdminUserName).DefaultValue — and ASK (never invent) when the dictionary has no answer; (2) produce the byte-identical tenant (hash-chain tip) the long wizard produces for the
//   same answers. Denominator = every active C_Country of ad_seed.db. Negative controls: a wrong currency mapping must change the tip; a currency-less country must return ask, not an input.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), G = require(path.join(ERP, 'genesis.js')), QI = require(path.join(ERP, 'overlay', 'quick_input.js'));   // core genesis.js is untouched; quickInput lives in the overlay
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var log = console.log, fails = 0, judged = 0;
function check(sec, name, ok, info) { judged++; if (!ok) fails++; log('  §QS-CHECK ' + sec + ' ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var rows = function (s) { var r = db.exec(s); return r.length ? r[0].values : []; };
  var ctx = { countries: {}, currencies: {}, processDefaults: {} };
  rows("SELECT C_Country_ID, C_Currency_ID FROM C_Country WHERE IsActive='Y'").forEach(function (r) { ctx.countries[r[0]] = { currencyId: r[1] }; });
  rows("SELECT C_Currency_ID, ISO_Code, StdPrecision, IsActive FROM C_Currency").forEach(function (r) { ctx.currencies[r[0]] = { iso: r[1], prec: r[2], active: r[3] === 'Y' }; });
  rows("SELECT p.ColumnName, p.DefaultValue FROM AD_Process_Para p WHERE p.AD_Process_ID=53161").forEach(function (r) { ctx.processDefaults[r[0]] = r[1]; });
  var ids = Object.keys(ctx.countries).map(Number), TODAY = '2026-10-14';
  if (typeof QI.quickInput !== 'function') { check('Q0', 'overlay quickInput exists', false, typeof QI.quickInput); log('§QS-VERDICT FAIL judged=' + judged + ' failed=' + fails); process.exit(1); }
  // Q1 denominator: every active country
  var ok = 0, ask = 0, bad = [];
  ids.forEach(function (c) {
    var q = QI.quickInput(ctx, { clientName: 'QsCo', countryId: c, dateAcct: TODAY }), cur = ctx.countries[c].currencyId;
    if (cur != null && ctx.currencies[cur] && ctx.currencies[cur].active) { if (q.ok && q.input.currencyId === cur && q.input.currencyIso === ctx.currencies[cur].iso && q.input.currencyPrecision === ctx.currencies[cur].prec && q.input.countryId === c) ok++; else bad.push(c); }
    else { if (!q.ok && q.ask.indexOf('currency') >= 0 && !q.input) ask++; else bad.push(c); }
  });
  check('Q1', 'every active country: derived currency == C_Country.C_Currency_ID (' + ok + ') or ASK (' + ask + '), 0 invented', bad.length === 0 && ok + ask === ids.length && ok > 0 && ask > 0, { bad: bad.slice(0, 5), ok: ok, ask: ask, total: ids.length });
  // Q2 equality with the long wizard on a spread of countries (every 12th with a currency)
  var sample = ids.filter(function (c) { return ctx.countries[c].currencyId != null; }).filter(function (c, i) { return i % 12 === 0; }), diff = [];
  sample.forEach(function (c) {
    var cur = ctx.currencies[ctx.countries[c].currencyId], q = QI.quickInput(ctx, { clientName: 'QsCo', countryId: c, dateAcct: TODAY });
    var long = { clientName: 'QsCo', currencyId: ctx.countries[c].currencyId, currencyIso: cur.iso, currencyPrecision: cur.prec, adminUser: ctx.processDefaults.AdminUserName, dateAcct: TODAY, countryId: c };
    var a = G.birthTenant(q.input), b = G.birthTenant(long); if (a.tip !== b.tip) diff.push(c);
  });
  check('Q2', 'quick tenant == long-wizard tenant (hash-chain tip) for ' + sample.length + ' countries', sample.length > 5 && diff.length === 0, { diff: diff });
  // Q3 answers typed
  var q3 = QI.quickInput(ctx, { clientName: 'QsCo', countryId: 100, dateAcct: TODAY });
  check('Q3', 'quick typed answers = 2 (clientName, countryId) vs long wizard 5', q3.ok && JSON.stringify(q3.typed) === JSON.stringify(['clientName', 'countryId']) && q3.source && q3.source.currency && q3.source.adminUser, q3);
  check('Q3b', 'admin user = AD_Process_Para default "' + ctx.processDefaults.AdminUserName + '"', q3.ok && q3.input.adminUser === ctx.processDefaults.AdminUserName && !!ctx.processDefaults.AdminUserName, q3.input);
  // Q4 negative controls
  var my = QI.quickInput(ctx, { clientName: 'QsCo', countryId: rows("SELECT C_Country_ID FROM C_Country WHERE CountryCode='MY'")[0][0], dateAcct: TODAY });
  var wrong = Object.assign({}, my.input, { currencyId: 100, currencyIso: 'USD', currencyPrecision: 2 });
  check('Q4', 'NEG: a wrong currency mapping (MY -> USD) changes the tenant tip', my.ok && G.birthTenant(my.input).tip !== G.birthTenant(wrong).tip, { iso: my.input && my.input.currencyIso });
  var noCtx = QI.quickInput({ countries: ctx.countries, currencies: ctx.currencies, processDefaults: {} }, { clientName: 'QsCo', countryId: 100, dateAcct: TODAY });
  check('Q5', 'NEG: no dictionary default for the admin user -> ASK adminUser, nothing invented', !noCtx.ok && noCtx.ask.indexOf('adminUser') >= 0 && !noCtx.input, noCtx);
  check('Q6', 'NEG: blank company name -> ASK clientName', QI.quickInput(ctx, { clientName: '  ', countryId: 100, dateAcct: TODAY }).ask.indexOf('clientName') >= 0, null);
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§QS-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§QS-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
